(function () {
    'use strict';

    function createCanvasCompareDragController(context) {
        const scope = context?.compareDragSource || context || {};
        const domSource = scope.domSource || {};
        const nodeSource = scope.nodeSource || {};
        const utilitySource = scope.utilitySource || {};
        const viewportSource = scope.viewportSource || {};
        const selectionSource = scope.selectionSource || {};
        const updateSource = scope.updateSource || {};
        const persistenceSource = scope.persistenceSource || {};
        const uiSource = scope.uiSource || {};
        const getDocument = () => typeof domSource.getDocument === 'function'
            ? domSource.getDocument()
            : (typeof document !== 'undefined' ? document : null);
        const getNode = (id) => typeof nodeSource.getNode === 'function' ? nodeSource.getNode(id) : null;
        const isNodeLocked = (node) => typeof nodeSource.isNodeLocked === 'function'
            ? !!nodeSource.isNodeLocked(node)
            : false;
        const clamp = typeof utilitySource.clamp === 'function'
            ? utilitySource.clamp
            : (value, min, max) => Math.max(min, Math.min(max, value));
        const getPerformanceNow = () => typeof utilitySource.performanceNow === 'function'
            ? utilitySource.performanceNow()
            : (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now());
        const setSuppressWheelUntil = (...args) => typeof viewportSource.setSuppressWheelUntil === 'function'
            ? viewportSource.setSuppressWheelUntil(...args)
            : undefined;
        const isCompareNodeSelected = (...args) => typeof selectionSource.isCompareNodeSelected === 'function'
            ? selectionSource.isCompareNodeSelected(...args)
            : false;
        const selectNodeLight = (...args) => typeof selectionSource.selectNodeLight === 'function'
            ? selectionSource.selectNodeLight(...args)
            : undefined;
        const getSelectedNodeId = (...args) => typeof selectionSource.getSelectedNodeId === 'function'
            ? selectionSource.getSelectedNodeId(...args)
            : undefined;
        const updateCompareParam = (...args) => typeof updateSource.updateCompareParam === 'function'
            ? updateSource.updateCompareParam(...args)
            : undefined;
        const refreshCompareDom = (...args) => typeof updateSource.refreshCompareDom === 'function'
            ? updateSource.refreshCompareDom(...args)
            : undefined;
        const scheduleSave = (...args) => typeof persistenceSource.scheduleSave === 'function'
            ? persistenceSource.scheduleSave(...args)
            : undefined;
        const renderInspector = (...args) => typeof uiSource.renderInspector === 'function'
            ? uiSource.renderInspector(...args)
            : undefined;
        let dragState = null;

        function updateComparePositionFromPointer(node, stageEl, evt) {
            if (!node || node.type !== 'compare' || !stageEl || !evt) return null;
            const rect = stageEl.getBoundingClientRect?.();
            if (!rect?.width) return null;
            const next = clamp(((evt.clientX - rect.left) / rect.width) * 100, 0, 100);
            updateCompareParam(node.id, 'position', next, 'number', { render: false });
            refreshCompareDom(node.id);
            return next;
        }

        function startComparePositionDrag(node, stageEl, evt) {
            if (!node || node.type !== 'compare' || !stageEl || !evt || isNodeLocked(node)) return;
            evt.preventDefault();
            evt.stopPropagation();
            setSuppressWheelUntil(getPerformanceNow() + 240);
            if (!isCompareNodeSelected(node.id)) selectNodeLight(node.id);
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
            scheduleSave();
            const node = getNode(nodeId);
            if (getSelectedNodeId() === nodeId && node?.type === 'compare') renderInspector();
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
