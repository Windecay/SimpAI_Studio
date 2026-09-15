(function () {
    'use strict';

    function createCanvasTimelineClipController(context) {
        const scope = context?.timelineClipSource || context || {};
        const domSource = scope.domSource || {};
        const nodeSource = scope.nodeSource || {};
        const interactionSource = scope.interactionSource || {};
        const clipOperationSource = scope.clipOperationSource || {};
        const historySource = scope.historySource || {};
        const renderSource = scope.renderSource || {};
        const selectionSource = scope.selectionSource || {};
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
        const buildTimelineClipPatch = (fields) => typeof clipOperationSource.buildTimelineClipPatch === 'function'
            ? clipOperationSource.buildTimelineClipPatch(fields)
            : Object.assign({}, fields || {});
        const buildTimelineParamsPatch = (node, paramsPatch) => typeof clipOperationSource.buildTimelineParamsPatch === 'function'
            ? clipOperationSource.buildTimelineParamsPatch(node, paramsPatch)
            : { params: Object.assign({}, node?.params || {}, paramsPatch || {}) };
        const snapTimelineTime = (...args) => {
            const value = call(clipOperationSource, 'snapTimelineTime', ...args);
            return value === undefined ? args[1] : value;
        };
        const timelineClipAvailableDuration = (...args) => {
            const value = call(clipOperationSource, 'timelineClipAvailableDuration', ...args);
            return value === undefined ? Infinity : value;
        };
        const timelineTrackCompatible = (...args) => call(clipOperationSource, 'timelineTrackCompatible', ...args) !== false;
        let dragState = null;

        function startTimelineClipDrag(node, clipId, modeName, evt) {
            if (!node || node.type !== 'timeline' || isNodeLocked(node) || !evt) return;
            const nodeEl = evt.target?.closest?.('[data-node-id]');
            const clip = call(clipOperationSource, 'selectTimelineClip', node, clipId, { render: false });
            if (!clip || !nodeEl) return;
            const laneInfo = call(domSource, 'timelineLaneInfoFromTarget', evt.target, nodeEl);
            if (!laneInfo) return;
            evt.preventDefault();
            evt.stopPropagation();
            call(interactionSource, 'setSuppressWheelUntil', getPerformanceNow() + 420);
            call(historySource, 'pushHistory', modeName === 'move' ? 'Move timeline clip' : 'Trim timeline clip');
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
            if (call(selectionSource, 'getSelectedNodeId') === node.id) call(selectionSource, 'renderInspector');
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
                Object.assign(clip, buildTimelineClipPatch({
                    duration: Math.max(minDuration, state.startDuration - (nextStart - state.startStart)),
                    start: nextStart,
                    in: Math.max(0, state.startIn + (nextStart - state.startStart))
                }));
                call(clipOperationSource, 'enforceTimelineClipMediaBounds', node, clip);
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
                Object.assign(clip, buildTimelineClipPatch({
                    duration: Math.max(minDuration, Math.min(snappedEnd - state.startStart, Number.isFinite(maxDuration) ? maxDuration : Infinity))
                }));
                call(clipOperationSource, 'enforceTimelineClipMediaBounds', node, clip);
            } else {
                let rawStart = Math.max(0, state.startStart + delta);
                const doc = getDocument();
                const lane = doc?.elementFromPoint?.(evt.clientX, evt.clientY)?.closest?.('.sai-timeline-track-lane');
                const trackEl = lane?.closest?.('[data-timeline-track]');
                const trackId = trackEl?.getAttribute('data-timeline-track');
                if (trackId && timelineTrackCompatible(clip, trackId, node)) {
                    Object.assign(clip, buildTimelineClipPatch({ track_id: trackId }));
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
                Object.assign(clip, buildTimelineClipPatch({ start: Math.max(0, rawStart) }));
                call(clipOperationSource, 'enforceTimelineClipMediaBounds', node, clip);
            }
            Object.assign(node, buildTimelineParamsPatch(node, {
                selected_clip_id: clip.id,
                playhead: clamp(Number(clip.start || 0), 0, Number(node.params?.duration || 1))
            }));
            call(nodeSource, 'normalizeNode', node);
            call(domSource, 'refreshTimelineClipDom', state.nodeEl, node, clip);
            call(domSource, 'refreshTimelineTrackRowsDom', state.nodeEl, node);
            call(domSource, 'refreshTimelinePlayheadDom', state.nodeEl, node);
            call(renderSource, 'refreshTimelinePreviewDom', state.nodeEl, node);
            call(renderSource, 'renderEdges');
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
            call(persistenceSource, 'scheduleSave');
            if (call(selectionSource, 'getSelectedNodeId') === nodeId) call(selectionSource, 'renderInspector');
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
