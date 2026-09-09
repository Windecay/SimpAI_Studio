(function () {
    'use strict';

    function createCanvasTimelineClipController(context) {
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
        const snapTimelineTime = (...args) => {
            const value = call('snapTimelineTime', ...args);
            return value === undefined ? args[1] : value;
        };
        const timelineClipAvailableDuration = (...args) => {
            const value = call('timelineClipAvailableDuration', ...args);
            return value === undefined ? Infinity : value;
        };
        const timelineTrackCompatible = (...args) => call('timelineTrackCompatible', ...args) !== false;
        let dragState = null;

        function startTimelineClipDrag(node, clipId, modeName, evt) {
            if (!node || node.type !== 'timeline' || isNodeLocked(node) || !evt) return;
            const nodeEl = evt.target?.closest?.('[data-node-id]');
            const clip = call('selectTimelineClip', node, clipId, { render: false });
            if (!clip || !nodeEl) return;
            const laneInfo = call('timelineLaneInfoFromTarget', evt.target, nodeEl);
            if (!laneInfo) return;
            evt.preventDefault();
            evt.stopPropagation();
            call('setSuppressWheelUntil', getPerformanceNow() + 420);
            call('pushHistory', modeName === 'move' ? 'Move timeline clip' : 'Trim timeline clip');
            try { evt.target.setPointerCapture?.(evt.pointerId); } catch (err) {}
            dragState = {
                pointerId: evt.pointerId,
                nodeId: node.id,
                clipId,
                mode: modeName,
                nodeEl,
                startClientX: evt.clientX,
                startClientY: evt.clientY,
                startStart: Number(clip.start || 0),
                startDuration: Number(clip.duration || 0.05),
                startIn: Number(clip.in || 0),
                startTrackId: clip.track_id,
                lastTrackId: clip.track_id,
                laneLeft: laneInfo.rect.left,
                laneWidth: Math.max(1, laneInfo.rect.width),
                duration: Math.max(1, Number(node.params?.duration || 1))
            };
            const doc = getDocument();
            doc?.addEventListener('pointermove', onTimelineClipDragMove, true);
            doc?.addEventListener('pointerup', stopTimelineClipDrag, true);
            doc?.addEventListener('pointercancel', stopTimelineClipDrag, true);
            nodeEl.querySelectorAll?.('[data-timeline-clip-id]').forEach(el => {
                el.classList.toggle('is-selected', el.getAttribute('data-timeline-clip-id') === clip.id);
            });
            laneInfo.lane?.closest?.('.sai-timeline-track')?.classList.add('is-drop-target');
            if (call('getSelectedNodeId') === node.id) call('renderInspector');
        }

        function onTimelineClipDragMove(evt) {
            if (!dragState || !evt || evt.pointerId !== dragState.pointerId) return;
            evt.preventDefault();
            const state = dragState;
            const node = getNode(state.nodeId);
            const clip = (node?.clips || []).find(item => item.id === state.clipId);
            if (!node || !clip) return;
            const secondsPerPx = state.duration / state.laneWidth;
            const delta = (evt.clientX - state.startClientX) * secondsPerPx;
            const minDuration = 0.05;
            const snapThreshold = Math.max(0.03, secondsPerPx * 10);
            const snapDisabled = evt.altKey || node.params?.snap_enabled === false;
            if (state.mode === 'trim-start') {
                const maxStart = state.startStart + state.startDuration - minDuration;
                const rawStart = clamp(state.startStart + delta, 0, maxStart);
                const nextStart = clamp(snapTimelineTime(node, rawStart, {
                    excludeClipId: clip.id,
                    trackId: clip.track_id,
                    threshold: snapThreshold,
                    disabled: snapDisabled
                }), 0, maxStart);
                clip.duration = Math.max(minDuration, state.startDuration - (nextStart - state.startStart));
                clip.start = nextStart;
                clip.in = Math.max(0, state.startIn + (nextStart - state.startStart));
                call('enforceTimelineClipMediaBounds', node, clip);
            } else if (state.mode === 'trim-end') {
                const maxDuration = timelineClipAvailableDuration(node, clip);
                const maxEnd = Number.isFinite(maxDuration) ? state.startStart + maxDuration : Infinity;
                const rawEnd = Math.min(maxEnd, Math.max(state.startStart + minDuration, state.startStart + state.startDuration + delta));
                const snappedEnd = snapTimelineTime(node, rawEnd, {
                    excludeClipId: clip.id,
                    trackId: clip.track_id,
                    threshold: snapThreshold,
                    disabled: snapDisabled
                });
                clip.duration = Math.max(minDuration, Math.min(snappedEnd - state.startStart, Number.isFinite(maxDuration) ? maxDuration : Infinity));
                call('enforceTimelineClipMediaBounds', node, clip);
            } else {
                let rawStart = Math.max(0, state.startStart + delta);
                const doc = getDocument();
                const lane = doc?.elementFromPoint?.(evt.clientX, evt.clientY)?.closest?.('.sai-timeline-track-lane');
                const trackEl = lane?.closest?.('[data-timeline-track]');
                const trackId = trackEl?.getAttribute('data-timeline-track');
                if (trackId && timelineTrackCompatible(clip, trackId, node)) {
                    clip.track_id = trackId;
                    if (state.lastTrackId !== trackId) {
                        state.nodeEl.querySelectorAll?.('.sai-timeline-track').forEach(el => el.classList.remove('is-drop-target'));
                        trackEl.classList.add('is-drop-target');
                        state.lastTrackId = trackId;
                    }
                }
                const snappedStart = snapTimelineTime(node, rawStart, {
                    excludeClipId: clip.id,
                    trackId: clip.track_id,
                    threshold: snapThreshold,
                    disabled: snapDisabled
                });
                const snappedEnd = snapTimelineTime(node, rawStart + Number(clip.duration || 0), {
                    excludeClipId: clip.id,
                    trackId: clip.track_id,
                    threshold: snapThreshold,
                    disabled: snapDisabled
                });
                if (Math.abs(snappedEnd - (rawStart + Number(clip.duration || 0))) < Math.abs(snappedStart - rawStart)) {
                    rawStart = snappedEnd - Number(clip.duration || 0);
                } else {
                    rawStart = snappedStart;
                }
                clip.start = Math.max(0, rawStart);
                call('enforceTimelineClipMediaBounds', node, clip);
            }
            node.params = Object.assign({}, node.params || {}, {
                selected_clip_id: clip.id,
                playhead: clamp(Number(clip.start || 0), 0, Number(node.params?.duration || 1))
            });
            call('normalizeNode', node);
            call('refreshTimelineClipDom', state.nodeEl, node, clip);
            call('refreshTimelineTrackRowsDom', state.nodeEl, node);
            call('refreshTimelinePlayheadDom', state.nodeEl, node);
            call('refreshTimelinePreviewDom', state.nodeEl, node);
            call('renderEdges');
        }

        function stopTimelineClipDrag(evt) {
            if (!dragState) return;
            if (evt && evt.pointerId !== dragState.pointerId) return;
            const nodeId = dragState.nodeId;
            dragState.nodeEl?.querySelectorAll?.('.sai-timeline-track').forEach(el => el.classList.remove('is-drop-target'));
            dragState = null;
            const doc = getDocument();
            doc?.removeEventListener('pointermove', onTimelineClipDragMove, true);
            doc?.removeEventListener('pointerup', stopTimelineClipDrag, true);
            doc?.removeEventListener('pointercancel', stopTimelineClipDrag, true);
            call('scheduleSave');
            if (call('getSelectedNodeId') === nodeId) call('renderInspector');
        }

        return {
            startTimelineClipDrag,
            onTimelineClipDragMove,
            stopTimelineClipDrag,
            isDragging: () => !!dragState,
            getDraggingNodeId: () => dragState?.nodeId || null
        };
    }

    window.SimpAICanvasWorkbenchTimelineClip = Object.assign({}, window.SimpAICanvasWorkbenchTimelineClip || {}, {
        createCanvasTimelineClipController
    });
})();
