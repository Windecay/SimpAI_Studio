(function () {
    'use strict';

    function createCanvasTimelineMaskController(context) {
        const scope = context?.timelineMaskSource || context || {};
        const domSource = scope.domSource || {};
        const nodeSource = scope.nodeSource || {};
        const interactionSource = scope.interactionSource || {};
        const maskOperationSource = scope.maskOperationSource || {};
        const clipSource = scope.clipSource || {};
        const mediaSource = scope.mediaSource || {};
        const historySource = scope.historySource || {};
        const persistenceSource = scope.persistenceSource || {};
        const selectionSource = scope.selectionSource || {};
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
        const buildTimelineClipMaskPatch = (clip, options) => {
            if (typeof maskOperationSource.buildTimelineClipMaskPatch === 'function') return maskOperationSource.buildTimelineClipMaskPatch(clip, options);
            const config = options || {};
            const mask = Object.assign({}, clip?.mask || {}, config.maskPatch || {});
            if (config.dataUrl !== undefined) mask.data_url = config.dataUrl;
            if (config.width !== undefined) mask.width = config.width;
            if (config.height !== undefined) mask.height = config.height;
            const patch = { mask };
            if (config.maskDataUrl !== undefined) patch.mask_data_url = config.maskDataUrl;
            else if (config.dataUrl !== undefined) patch.mask_data_url = config.dataUrl;
            return patch;
        };
        const buildTimelineClipMaskPointPatch = (clip, target, point) => {
            if (typeof maskOperationSource.buildTimelineClipMaskPointPatch === 'function') {
                return maskOperationSource.buildTimelineClipMaskPointPatch(clip, target, point);
            }
            const mask = JSON.parse(JSON.stringify(clip?.mask || {}));
            if (target?.kind === 'pending') {
                const points = Array.isArray(mask.pending_pen?.points) ? mask.pending_pen.points.slice() : [];
                if (points[target.pointIndex] !== undefined) {
                    points[target.pointIndex] = point;
                    mask.pending_pen = Object.assign({}, mask.pending_pen, { points });
                }
            } else {
                const strokes = Array.isArray(mask.strokes) ? mask.strokes.slice() : [];
                const strokeIndex = Number.isInteger(Number(target?.strokeIndex))
                    ? Number(target.strokeIndex)
                    : (Array.isArray(clip?.mask?.strokes) ? clip.mask.strokes : [])
                        .findIndex(item => item?.points === target?.points);
                const stroke = strokes[strokeIndex];
                const points = Array.isArray(stroke?.points) ? stroke.points.slice() : [];
                if (stroke && points[target.pointIndex] !== undefined) {
                    points[target.pointIndex] = point;
                    strokes[strokeIndex] = Object.assign({}, stroke, { points });
                    mask.strokes = strokes;
                }
            }
            return { mask };
        };
        let anchorDragState = null;

        function startTimelineMaskAnchorDrag(node, anchor, evt) {
            const stageEl = anchor?.closest?.('.sai-timeline-preview-stage');
            const nodeEl = anchor?.closest?.('[data-node-id]');
            const clip = (node?.clips || []).find(item => item.id === node?.params?.selected_clip_id);
            const target = call(maskOperationSource, 'getTimelinePenAnchorTarget', clip, anchor?.getAttribute?.('data-timeline-pen-anchor'));
            if (!node || node.type !== 'timeline' || !clip || !target || !stageEl || !nodeEl || isNodeLocked(node) || !evt) return;
            evt.preventDefault();
            evt.stopPropagation();
            if (target.kind === 'pending' && target.pointIndex === 0 && target.points.length >= 3) {
                call(historySource, 'pushHistoryBatch', `timeline-mask:${node.id}:${clip.id}`, 'Close timeline pen mask');
                call(maskOperationSource, 'closeTimelinePendingPenPath', node, clip, stageEl);
                call(mediaSource, 'syncTimelinePreviewVideos', nodeEl, node);
                return;
            }
            call(historySource, 'pushHistoryBatch', `timeline-mask-anchor:${node.id}:${clip.id}`, 'Edit timeline pen mask');
            anchorDragState = {
                pointerId: evt.pointerId,
                nodeId: node.id,
                clipId: clip.id,
                nodeEl,
                stageEl,
                ref: anchor.getAttribute('data-timeline-pen-anchor')
            };
            updateTimelineMaskAnchorDragFromPointer(evt);
            call(interactionSource, 'setSuppressWheelUntil', getPerformanceNow() + 420);
            try { anchor.setPointerCapture?.(evt.pointerId); } catch (err) {}
            const doc = getDocument();
            doc?.addEventListener('pointermove', updateTimelineMaskAnchorDragFromPointer, true);
            doc?.addEventListener('pointerup', stopTimelineMaskAnchorDrag, true);
            doc?.addEventListener('pointercancel', stopTimelineMaskAnchorDrag, true);
        }

        function updateTimelineMaskAnchorDragFromPointer(evt) {
            if (!anchorDragState || !evt || evt.pointerId !== anchorDragState.pointerId) return;
            evt.preventDefault();
            const state = anchorDragState;
            const node = getNode(state.nodeId);
            const clip = (node?.clips || []).find(item => item.id === state.clipId);
            const target = call(maskOperationSource, 'getTimelinePenAnchorTarget', clip, state.ref);
            if (!node || !clip || !target) return;
            const point = call(maskOperationSource, 'timelineMaskPointFromEvent', state.stageEl, evt);
            Object.assign(clip, buildTimelineClipMaskPointPatch(clip, target, point));
            call(domSource, 'refreshTimelinePenOverlayDom', state.stageEl, clip, { mask: false });
            call(persistenceSource, 'scheduleSave');
        }

        function stopTimelineMaskAnchorDrag(evt) {
            if (!anchorDragState) return;
            if (evt && evt.pointerId !== anchorDragState.pointerId) return;
            const state = anchorDragState;
            const node = getNode(state.nodeId);
            const clip = (node?.clips || []).find(item => item.id === state.clipId);
            anchorDragState = null;
            const doc = getDocument();
            doc?.removeEventListener('pointermove', updateTimelineMaskAnchorDragFromPointer, true);
            doc?.removeEventListener('pointerup', stopTimelineMaskAnchorDrag, true);
            doc?.removeEventListener('pointercancel', stopTimelineMaskAnchorDrag, true);
            if (node && clip?.mask) {
                const dataUrl = call(maskOperationSource, 'exportTimelineMaskDataUrl', node, clip);
                if (dataUrl) {
                    const size = call(maskOperationSource, 'timelineMaskDimensions', node);
                    Object.assign(clip, buildTimelineClipMaskPatch(clip, {
                        dataUrl,
                        width: size.width,
                        height: size.height
                    }));
                }
                call(domSource, 'refreshTimelinePenOverlayDom', state.stageEl, clip);
                call(mediaSource, 'syncTimelinePreviewVideos', state.nodeEl, node);
                call(persistenceSource, 'scheduleSave');
            }
            if (call(selectionSource, 'getSelectedNodeId') === state.nodeId) call(selectionSource, 'renderInspector');
        }

        function startTimelineMaskDraw(node, clipId, evt) {
            const nodeEl = evt?.target?.closest?.('[data-node-id]');
            const stageEl = evt?.target?.closest?.('.sai-timeline-preview-stage');
            const clip = (node?.clips || []).find(item => item.id === clipId);
            if (!node || node.type !== 'timeline' || !clip || clip.kind === 'audio' || !nodeEl || !stageEl || isNodeLocked(node) || !evt) return;
            evt.preventDefault();
            evt.stopPropagation();
            call(clipSource, 'selectTimelineClip', node, clipId, { render: false });
            const size = call(maskOperationSource, 'timelineMaskDimensions', node);
            const strokes = Array.isArray(clip.mask?.strokes) ? clip.mask.strokes : [];
            const point = call(maskOperationSource, 'timelineMaskPointFromEvent', stageEl, evt);
            const feather = clamp(Number(node.params?.mask_feather || 0), 0, 120);
            const current = clip.mask?.pending_pen && Array.isArray(clip.mask.pending_pen.points)
                ? Object.assign({}, clip.mask.pending_pen)
                : { kind: 'pen', closed: false, feather, points: [] };
            let points = Array.isArray(current.points) ? current.points.slice() : [];
            let shouldClose = false;
            if (evt.altKey && current.points.length) {
                points = points.slice(0, -1);
            } else {
                const first = points[0];
                const snapToFirst = points.length >= 3
                    && first
                    && call(maskOperationSource, 'timelineMaskPointDistancePx', point, first, stageEl) <= call(maskOperationSource, 'timelineMaskCloseSnapPx', stageEl);
                if (snapToFirst) {
                    shouldClose = true;
                } else {
                    points = points.concat(point);
                    shouldClose = evt.detail >= 2 && points.length >= 3;
                }
            }
            const nextCurrent = Object.assign({}, current, { points, feather });
            const nextStrokes = shouldClose
                ? strokes.concat(Object.assign({}, nextCurrent, { closed: true, pending: false }))
                : strokes;
            Object.assign(clip, buildTimelineClipMaskPatch(clip, {
                maskPatch: {
                    kind: 'pen_alpha',
                    space: 'canvas',
                    width: size.width,
                    height: size.height,
                    strokes: nextStrokes,
                    pending_pen: shouldClose ? null : nextCurrent
                }
            }));
            if (shouldClose) {
                const dataUrl = call(maskOperationSource, 'exportTimelineMaskDataUrl', node, clip);
                Object.assign(clip, buildTimelineClipMaskPatch(clip, {
                    ...(dataUrl ? { dataUrl } : {}),
                    maskDataUrl: dataUrl || clip.mask_data_url || ''
                }));
                call(historySource, 'pushHistoryBatch', `timeline-mask:${node.id}:${clipId}`, 'Add timeline pen mask');
                call(domSource, 'refreshTimelinePenOverlayDom', stageEl, clip);
                call(mediaSource, 'syncTimelinePreviewVideos', nodeEl, node);
                call(persistenceSource, 'scheduleSave');
                if (call(selectionSource, 'getSelectedNodeId') === node.id) call(selectionSource, 'renderInspector');
            } else {
                call(domSource, 'refreshTimelinePenOverlayDom', stageEl, clip);
                call(mediaSource, 'syncTimelinePreviewVideos', nodeEl, node);
                call(persistenceSource, 'scheduleSave');
            }
        }

        return {
            startTimelineMaskAnchorDrag,
            updateTimelineMaskAnchorDragFromPointer,
            stopTimelineMaskAnchorDrag,
            startTimelineMaskDraw,
            isDragging: () => !!anchorDragState,
            isPointerActive: () => !!anchorDragState,
            getDraggingNodeId: () => anchorDragState?.nodeId || null
        };
    }

    window.SimpAICanvasWorkbenchTimelineMask = Object.assign({}, window.SimpAICanvasWorkbenchTimelineMask || {}, {
        createCanvasTimelineMaskController
    });
})();
