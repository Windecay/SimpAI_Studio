(function () {
    'use strict';

    function createCanvasDirectorTimelineDragController(context) {
        const scope = context || {};
        const getDocument = () => typeof scope.getDocument === 'function'
            ? scope.getDocument()
            : (typeof document !== 'undefined' ? document : null);
        const getNode = (id) => typeof scope.getNode === 'function' ? scope.getNode(id) : null;
        const isDirectorTimelineNode = (node) => typeof scope.isDirectorTimelineNode === 'function'
            ? !!scope.isDirectorTimelineNode(node)
            : false;
        const isNodeLocked = (node) => typeof scope.isNodeLocked === 'function' ? !!scope.isNodeLocked(node) : false;
        const call = (name, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : undefined;
        const directorTimelineClampSeconds = (value, min, max) => {
            const result = call('directorTimelineClampSeconds', value, min, max);
            return result === undefined ? Math.max(Number(min || 0), Math.min(Number(max || 86400), Number(value || 0))) : result;
        };
        const directorTimelineRoundSeconds = (value) => {
            const result = call('directorTimelineRoundSeconds', value);
            return result === undefined ? Math.round(Number(value || 0) * 10) / 10 : result;
        };
        let dragState = null;

        function startDirectorTimelinePreviewDrag(node, nodeEl, dragTarget, evt) {
            if (!isDirectorTimelineNode(node) || isNodeLocked(node) || !dragTarget || !evt) return;
            const index = Number(dragTarget.getAttribute?.('data-director-timeline-clip') || 0);
            const director = call('normalizeDirectorTimelineForNode', node);
            const segment = director?.segments?.[index];
            const track = dragTarget.closest?.('.sai-director-timeline-video-track');
            const rect = track?.getBoundingClientRect?.();
            if (!segment || !rect || rect.width <= 0) return;
            const modeValue = dragTarget.getAttribute?.('data-director-timeline-drag') || 'move';
            const bounds = call('directorTimelineNeighborBounds', director, index) || { previousEnd: 0, nextStart: 86400 };
            call('pushHistoryBatch', `director:${node.id}:timeline-preview:${index}`, 'Edit Director shot time');
            dragState = {
                pointerId: evt.pointerId,
                nodeId: node.id,
                index,
                mode: modeValue === 'start' || modeValue === 'end' ? modeValue : 'move',
                startClientX: evt.clientX,
                startStart: Number(segment.start || 0),
                startEnd: Math.max(Number(segment.start || 0) + 0.1, Number(segment.end || 0)),
                previousEnd: bounds.previousEnd,
                nextStart: bounds.nextStart,
                totalSeconds: Math.max(0.1, Number(call('directorTimelineTotalSeconds', director) || 10)),
                trackWidth: rect.width,
                nodeEl
            };
            nodeEl?.querySelectorAll?.('.sai-director-timeline-clip').forEach(item => item.classList.remove('is-dragging'));
            const clipEl = dragTarget.closest?.('.sai-director-timeline-clip');
            clipEl?.classList.add('is-dragging');
            evt.preventDefault();
            evt.stopPropagation();
            const doc = getDocument();
            doc?.addEventListener('pointermove', onDirectorTimelinePreviewDragMove, true);
            doc?.addEventListener('pointerup', stopDirectorTimelinePreviewDrag, true);
            doc?.addEventListener('pointercancel', stopDirectorTimelinePreviewDrag, true);
        }

        function onDirectorTimelinePreviewDragMove(evt) {
            const state = dragState;
            if (!state || !evt || evt.pointerId !== state.pointerId) return;
            const node = getNode(state.nodeId);
            if (!isDirectorTimelineNode(node) || isNodeLocked(node)) return;
            const director = call('normalizeDirectorTimelineForNode', node);
            const segment = director?.segments?.[state.index];
            if (!segment) return;
            const secondsPerPx = state.totalSeconds / Math.max(1, state.trackWidth);
            const delta = (evt.clientX - state.startClientX) * secondsPerPx;
            const previousEnd = Math.max(0, Number(state.previousEnd || 0));
            const nextStart = Math.min(86400, Number(state.nextStart || 86400));
            const availableDuration = Math.max(0, nextStart - previousEnd);
            const minDuration = availableDuration > 0 ? Math.min(0.1, availableDuration) : 0;
            const sourceDuration = availableDuration > 0
                ? Math.min(availableDuration, Math.max(minDuration, state.startEnd - state.startStart))
                : 0;
            let start = state.startStart;
            let end = state.startEnd;
            if (state.mode === 'start') {
                const anchorEnd = directorTimelineClampSeconds(state.startEnd, previousEnd, nextStart);
                start = directorTimelineClampSeconds(state.startStart + delta, previousEnd, Math.max(previousEnd, anchorEnd - minDuration));
                end = anchorEnd;
            } else if (state.mode === 'end') {
                const anchorStart = directorTimelineClampSeconds(state.startStart, previousEnd, Math.max(previousEnd, nextStart - minDuration));
                start = anchorStart;
                end = directorTimelineClampSeconds(state.startEnd + delta, anchorStart + minDuration, nextStart);
            } else {
                start = directorTimelineClampSeconds(state.startStart + delta, previousEnd, Math.max(previousEnd, nextStart - sourceDuration));
                end = start + sourceDuration;
            }
            segment.start = directorTimelineRoundSeconds(start);
            segment.end = directorTimelineRoundSeconds(Math.min(nextStart, Math.max(segment.start + minDuration, end)));
            segment.unit = 'seconds';
            director.segments[state.index] = segment;
            const normalized = call('normalizeTimeline', director);
            const statePatch = normalized
                ? call('buildDirectorTimelineStatePatch', node, { directorPatch: normalized })
                : null;
            if (statePatch && typeof statePatch === 'object') Object.assign(node, statePatch);
            call('updateDirectorStatus', node);
            call('mutate', { inspector: call('getSelectedNodeId') === node.id });
            evt.preventDefault();
        }

        function stopDirectorTimelinePreviewDrag(evt) {
            if (!dragState) return;
            if (evt && evt.pointerId !== dragState.pointerId) return;
            const state = dragState;
            dragState = null;
            state.nodeEl?.querySelectorAll?.('.sai-director-timeline-clip').forEach(item => item.classList.remove('is-dragging'));
            const doc = getDocument();
            doc?.removeEventListener('pointermove', onDirectorTimelinePreviewDragMove, true);
            doc?.removeEventListener('pointerup', stopDirectorTimelinePreviewDrag, true);
            doc?.removeEventListener('pointercancel', stopDirectorTimelinePreviewDrag, true);
            call('scheduleSave');
        }

        return {
            startDirectorTimelinePreviewDrag,
            onDirectorTimelinePreviewDragMove,
            stopDirectorTimelinePreviewDrag,
            isDragging: () => !!dragState,
            getDraggingNodeId: () => dragState?.nodeId || null
        };
    }

    window.SimpAICanvasWorkbenchDirectorTimelineDrag = Object.assign({}, window.SimpAICanvasWorkbenchDirectorTimelineDrag || {}, {
        createCanvasDirectorTimelineDragController
    });
})();
