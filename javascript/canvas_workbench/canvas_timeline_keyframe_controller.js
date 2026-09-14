(function () {
    'use strict';

    function createCanvasTimelineKeyframeController(context) {
        const scope = context?.timelineKeyframeSource || context || {};
        const domSource = scope.domSource || {};
        const nodeSource = scope.nodeSource || {};
        const interactionSource = scope.interactionSource || {};
        const keyframeOperationSource = scope.keyframeOperationSource || {};
        const historySource = scope.historySource || {};
        const renderSource = scope.renderSource || {};
        const selectionSource = scope.selectionSource || {};
        const persistenceSource = scope.persistenceSource || {};
        const call = (sourceObject, name, ...args) => typeof sourceObject[name] === 'function'
            ? sourceObject[name](...args)
            : undefined;
        const getDocument = () => typeof domSource.getDocument === 'function'
            ? domSource.getDocument()
            : (typeof document !== 'undefined' ? document : null);
        const getNode = (id) => typeof nodeSource.getNode === 'function' ? nodeSource.getNode(id) : null;
        const isNodeLocked = (node) => typeof nodeSource.isNodeLocked === 'function' ? !!nodeSource.isNodeLocked(node) : false;
        const clamp = typeof interactionSource.clamp === 'function'
            ? interactionSource.clamp
            : (value, min, max) => Math.max(min, Math.min(max, value));
        const getPerformanceNow = () => typeof interactionSource.performanceNow === 'function'
            ? interactionSource.performanceNow()
            : (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now());
        const buildTimelineKeyframesPatch = (clip, keyframes) => typeof keyframeOperationSource.buildTimelineKeyframesPatch === 'function'
            ? keyframeOperationSource.buildTimelineKeyframesPatch(clip, keyframes)
            : { keyframes: Array.isArray(keyframes) ? keyframes.slice() : [] };
        const buildTimelineParamsPatch = (node, paramsPatch) => typeof keyframeOperationSource.buildTimelineParamsPatch === 'function'
            ? keyframeOperationSource.buildTimelineParamsPatch(node, paramsPatch)
            : { params: Object.assign({}, node?.params || {}, paramsPatch || {}) };
        let dragState = null;

        function startTimelineKeyframeDrag(node, marker, evt) {
            if (!node || node.type !== 'timeline' || isNodeLocked(node) || !marker || !evt) return;
            const raw = String(marker.getAttribute?.('data-timeline-keyframe-jump') || '');
            const [clipId, timeValue] = raw.split(':');
            const clip = (node.clips || []).find(item => item.id === clipId && item.kind !== 'audio');
            if (!clip) return;
            const frames = Array.isArray(clip.keyframes) ? clip.keyframes : [];
            const keyframeId = marker.getAttribute?.('data-timeline-keyframe-id') || '';
            const time = Number(timeValue || marker.getAttribute?.('data-timeline-keyframe-time') || 0);
            const frameIndex = Math.max(0, frames.findIndex(frame =>
                (keyframeId && frame.id === keyframeId) || Math.abs(Number(frame.time || 0) - time) < 0.025));
            if (!frames[frameIndex]) return;
            const nodeEl = marker.closest?.('[data-node-id]');
            const reference = marker.closest?.('.sai-timeline-ruler') || nodeEl?.querySelector?.('.sai-timeline-ruler');
            if (!nodeEl || !reference) return;
            evt.preventDefault();
            evt.stopPropagation();
            call(interactionSource, 'setSuppressWheelUntil', getPerformanceNow() + 420);
            call(historySource, 'pushHistoryBatch', `timeline-keyframe-drag:${node.id}:${clip.id}`, 'Move timeline keyframe');
            try { marker.setPointerCapture?.(evt.pointerId); } catch (err) {}
            dragState = {
                pointerId: evt.pointerId,
                nodeId: node.id,
                clipId: clip.id,
                keyframeId: frames[frameIndex].id || '',
                frameIndex,
                nodeEl,
                reference,
                clipStart: Number(clip.start || 0),
                clipEnd: Number(clip.start || 0) + Math.max(0.05, Number(clip.duration || 0.05)),
                duration: Math.max(1, Number(node.params?.duration || 1))
            };
            updateTimelineKeyframeDragFromPointer(evt);
            const doc = getDocument();
            doc?.addEventListener('pointermove', updateTimelineKeyframeDragFromPointer, true);
            doc?.addEventListener('pointerup', stopTimelineKeyframeDrag, true);
            doc?.addEventListener('pointercancel', stopTimelineKeyframeDrag, true);
        }

        function updateTimelineKeyframeDragFromPointer(evt) {
            if (!dragState || !evt || evt.pointerId !== dragState.pointerId) return;
            evt.preventDefault();
            const state = dragState;
            const node = getNode(state.nodeId);
            const clip = (node?.clips || []).find(item => item.id === state.clipId);
            if (!node || !clip) return;
            const frames = Array.isArray(clip.keyframes) ? clip.keyframes : [];
            let index = frames.findIndex(frame => state.keyframeId && frame.id === state.keyframeId);
            if (index < 0) index = Math.min(frames.length - 1, state.frameIndex);
            if (!frames[index]) return;
            const rect = state.reference.getBoundingClientRect();
            const pct = clamp((evt.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
            const nextTime = Math.round(clamp(pct * state.duration, state.clipStart, state.clipEnd) * 1000) / 1000;
            frames[index] = Object.assign({}, frames[index], { time: nextTime });
            Object.assign(clip, buildTimelineKeyframesPatch(clip, frames));
            Object.assign(node, buildTimelineParamsPatch(node, { selected_clip_id: clip.id, playhead: nextTime }));
            call(domSource, 'refreshTimelineKeyframeMarkersDom', state.nodeEl, node, clip);
            call(domSource, 'refreshTimelinePlayheadDom', state.nodeEl, node);
            call(renderSource, 'refreshTimelinePreviewDom', state.nodeEl, node);
        }

        function stopTimelineKeyframeDrag(evt) {
            if (!dragState) return;
            if (evt && evt.pointerId !== dragState.pointerId) return;
            const nodeId = dragState.nodeId;
            dragState = null;
            const doc = getDocument();
            doc?.removeEventListener('pointermove', updateTimelineKeyframeDragFromPointer, true);
            doc?.removeEventListener('pointerup', stopTimelineKeyframeDrag, true);
            doc?.removeEventListener('pointercancel', stopTimelineKeyframeDrag, true);
            call(persistenceSource, 'scheduleSave');
            if (call(selectionSource, 'getSelectedNodeId') === nodeId) call(selectionSource, 'renderInspector');
        }

        return {
            startTimelineKeyframeDrag,
            updateTimelineKeyframeDragFromPointer,
            stopTimelineKeyframeDrag,
            isDragging: () => !!dragState,
            getDraggingNodeId: () => dragState?.nodeId || null
        };
    }

    window.SimpAICanvasWorkbenchTimelineKeyframe = Object.assign({}, window.SimpAICanvasWorkbenchTimelineKeyframe || {}, {
        createCanvasTimelineKeyframeController
    });
})();
