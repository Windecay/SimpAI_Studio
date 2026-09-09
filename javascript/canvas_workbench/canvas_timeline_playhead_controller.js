(function () {
    'use strict';

    function createCanvasTimelinePlayheadController(context) {
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

        function startTimelinePlayheadDrag(node, evt) {
            const lane = evt?.target?.closest?.('[data-timeline-playhead-lane]');
            const nodeEl = evt?.target?.closest?.('[data-node-id]');
            if (!node || node.type !== 'timeline' || !lane || !nodeEl || isNodeLocked(node)) return;
            evt.preventDefault();
            evt.stopPropagation();
            call('setSuppressWheelUntil', getPerformanceNow() + 420);
            call('pushHistoryBatch', `timeline-playhead:${node.id}`, 'Move timeline playhead');
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
            node.params = Object.assign({}, node.params || {}, { playhead: pct * duration });
            call('refreshTimelinePlayheadDom', dragState.nodeEl, node);
            call('refreshTimelinePreviewDom', dragState.nodeEl, node);
        }

        function stopTimelinePlayheadDrag(evt) {
            if (!dragState) return;
            if (evt && evt.pointerId !== dragState.pointerId) return;
            dragState = null;
            const doc = getDocument();
            doc?.removeEventListener('pointermove', updateTimelinePlayheadFromPointer, true);
            doc?.removeEventListener('pointerup', stopTimelinePlayheadDrag, true);
            doc?.removeEventListener('pointercancel', stopTimelinePlayheadDrag, true);
            call('scheduleSave');
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
