(function () {
    'use strict';

    function createCanvasTimelinePlayheadController(context) {
        const scope = context?.timelinePlayheadSource || context || {};
        const domSource = scope.domSource || {};
        const nodeSource = scope.nodeSource || {};
        const interactionSource = scope.interactionSource || {};
        const historySource = scope.historySource || {};
        const playheadOperationSource = scope.playheadOperationSource || {};
        const renderSource = scope.renderSource || {};
        const persistenceSource = scope.persistenceSource || {};
        const call = (sourceObject, name, ...args) => typeof sourceObject[name] === 'function'
            ? sourceObject[name](...args)
            : undefined;
        const getDocument = () => call(domSource, 'getDocument') || null;
        const getNode = (id) => typeof nodeSource.getNode === 'function' ? nodeSource.getNode(id) : null;
        const isNodeLocked = (node) => typeof nodeSource.isNodeLocked === 'function' ? !!nodeSource.isNodeLocked(node) : false;
        const clamp = typeof interactionSource.clamp === 'function'
            ? interactionSource.clamp
            : (value, min, max) => Math.max(min, Math.min(max, value));
        const getPerformanceNow = () => Number(call(interactionSource, 'performanceNow')) || 0;
        const buildTimelineParamsPatch = (node, paramsPatch) => typeof playheadOperationSource.buildTimelineParamsPatch === 'function'
            ? playheadOperationSource.buildTimelineParamsPatch(node, paramsPatch)
            : { params: Object.assign({}, node?.params || {}, paramsPatch || {}) };
        let dragState = null;

        function startTimelinePlayheadDrag(node, evt) {
            const lane = evt?.target?.closest?.('[data-timeline-playhead-lane]');
            const nodeEl = evt?.target?.closest?.('[data-node-id]');
            if (!node || node.type !== 'timeline' || !lane || !nodeEl || isNodeLocked(node)) return;
            evt.preventDefault();
            evt.stopPropagation();
            call(interactionSource, 'setSuppressWheelUntil', getPerformanceNow() + 420);
            call(historySource, 'pushHistoryBatch', `timeline-playhead:${node.id}`, 'Move timeline playhead');
            dragState = { pointerId: evt.pointerId, nodeId: node.id, nodeEl, lane };
            updateTimelinePlayheadFromPointer(evt);
            try { evt.target.setPointerCapture?.(evt.pointerId); } catch (err) {}
            const doc = getDocument();
            doc?.addEventListener('pointermove', updateTimelinePlayheadFromPointer, true);
            doc?.addEventListener('pointerup', stopTimelinePlayheadDrag, true);
            doc?.addEventListener('pointercancel', stopTimelinePlayheadDrag, true);
        }

        function updateTimelinePlayheadFromPointer(evt) {
            if (!dragState || !evt || evt.pointerId !== dragState.pointerId) return;
            evt.preventDefault();
            const node = getNode(dragState.nodeId);
            if (!node) return;
            const rect = dragState.lane.getBoundingClientRect();
            const duration = Math.max(1, Number(node.params?.duration || 1));
            const pct = clamp((evt.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
            Object.assign(node, buildTimelineParamsPatch(node, { playhead: pct * duration }));
            call(domSource, 'refreshTimelinePlayheadDom', dragState.nodeEl, node);
            call(renderSource, 'refreshTimelinePreviewDom', dragState.nodeEl, node);
        }

        function stopTimelinePlayheadDrag(evt) {
            if (!dragState) return;
            if (evt && evt.pointerId !== dragState.pointerId) return;
            dragState = null;
            const doc = getDocument();
            doc?.removeEventListener('pointermove', updateTimelinePlayheadFromPointer, true);
            doc?.removeEventListener('pointerup', stopTimelinePlayheadDrag, true);
            doc?.removeEventListener('pointercancel', stopTimelinePlayheadDrag, true);
            call(persistenceSource, 'scheduleSave');
        }

        return {
            startTimelinePlayheadDrag,
            updateTimelinePlayheadFromPointer,
            stopTimelinePlayheadDrag,
            isDragging: () => !!dragState,
            getDraggingNodeId: () => dragState?.nodeId || null
        };
    }

    window.SimpAICanvasWorkbenchTimelinePlayhead = Object.assign({}, window.SimpAICanvasWorkbenchTimelinePlayhead || {}, {
        createCanvasTimelinePlayheadController
    });
})();
