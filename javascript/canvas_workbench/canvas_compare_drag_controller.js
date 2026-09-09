(function () {
    'use strict';

    function createCanvasCompareDragController(context) {
        const scope = context || {};
        const getDocument = () => typeof scope.getDocument === 'function'
            ? scope.getDocument()
            : (typeof document !== 'undefined' ? document : null);
        const getNode = (id) => typeof scope.getNode === 'function' ? scope.getNode(id) : null;
        const isNodeLocked = (node) => typeof scope.isNodeLocked === 'function' ? !!scope.isNodeLocked(node) : false;
        const clamp = typeof scope.clamp === 'function'
            ? scope.clamp
            : (value, min, max) => Math.max(min, Math.min(max, value));
        const getPerformanceNow = () => typeof scope.performanceNow === 'function'
            ? scope.performanceNow()
            : (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now());
        const call = (name, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : undefined;
        let dragState = null;

        function updateComparePositionFromPointer(node, stageEl, evt) {
            if (!node || node.type !== 'compare' || !stageEl || !evt) return null;
            const rect = stageEl.getBoundingClientRect?.();
            if (!rect?.width) return null;
            const next = clamp(((evt.clientX - rect.left) / rect.width) * 100, 0, 100);
            call('updateCompareParam', node.id, 'position', next, 'number', { render: false });
            call('refreshCompareDom', node.id);
            return next;
        }

        function startComparePositionDrag(node, stageEl, evt) {
            if (!node || node.type !== 'compare' || !stageEl || !evt || isNodeLocked(node)) return;
            evt.preventDefault();
            evt.stopPropagation();
            call('setSuppressWheelUntil', getPerformanceNow() + 240);
            if (!call('isCompareNodeSelected', node.id)) call('selectNodeLight', node.id);
            dragState = {
                pointerId: evt.pointerId,
                nodeId: node.id,
                stageEl
            };
            try { stageEl.setPointerCapture?.(evt.pointerId); } catch (err) {}
            updateComparePositionFromPointer(node, stageEl, evt);
            const doc = getDocument();
            doc?.addEventListener('pointermove', onComparePositionDragMove, true);
            doc?.addEventListener('pointerup', stopComparePositionDrag, true);
            doc?.addEventListener('pointercancel', stopComparePositionDrag, true);
        }

        function onComparePositionDragMove(evt) {
            if (!dragState || !evt || evt.pointerId !== dragState.pointerId) return;
            evt.preventDefault();
            const node = getNode(dragState.nodeId);
            updateComparePositionFromPointer(node, dragState.stageEl, evt);
        }

        function stopComparePositionDrag(evt) {
            if (!dragState) return;
            if (evt && evt.pointerId !== dragState.pointerId) return;
            const nodeId = dragState.nodeId;
            dragState = null;
            const doc = getDocument();
            doc?.removeEventListener('pointermove', onComparePositionDragMove, true);
            doc?.removeEventListener('pointerup', stopComparePositionDrag, true);
            doc?.removeEventListener('pointercancel', stopComparePositionDrag, true);
            call('scheduleSave');
            const node = getNode(nodeId);
            if (call('getSelectedNodeId') === nodeId && node?.type === 'compare') call('renderInspector');
        }

        return {
            startComparePositionDrag,
            updateComparePositionFromPointer,
            onComparePositionDragMove,
            stopComparePositionDrag,
            isDragging: () => !!dragState,
            getDraggingNodeId: () => dragState?.nodeId || null
        };
    }

    window.SimpAICanvasWorkbenchCompareDrag = Object.assign({}, window.SimpAICanvasWorkbenchCompareDrag || {}, {
        createCanvasCompareDragController
    });
})();
