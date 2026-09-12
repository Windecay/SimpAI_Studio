(function () {
    'use strict';

    function createCanvasTimelinePreviewController(context) {
        const scope = context || {};
        const getDocument = () => typeof scope.getDocument === 'function'
            ? scope.getDocument()
            : (typeof document !== 'undefined' ? document : null);
        const getNode = (id) => typeof scope.getNode === 'function' ? scope.getNode(id) : null;
        const isNodeLocked = (node) => typeof scope.isNodeLocked === 'function' ? !!scope.isNodeLocked(node) : false;
        const getClipAtTime = (clip, playhead) => typeof scope.getClipAtTime === 'function'
            ? (scope.getClipAtTime(clip, playhead) || clip)
            : clip;
        const clamp = typeof scope.clamp === 'function'
            ? scope.clamp
            : (value, min, max) => Math.max(min, Math.min(max, value));
        const call = (name, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : undefined;
        const buildTimelineClipPatch = (fields) => typeof scope.buildTimelineClipPatch === 'function'
            ? scope.buildTimelineClipPatch(fields)
            : Object.assign({}, fields || {});
        let dragState = null;

        function startTimelinePreviewDrag(node, clipId, evt, modeName) {
            const nodeEl = evt?.target?.closest?.('[data-node-id]');
            const stage = evt?.target?.closest?.('.sai-timeline-preview-stage');
            const clip = (node?.clips || []).find(item => item.id === clipId);
            if (!node || node.type !== 'timeline' || !clip || clip.kind === 'audio' || !nodeEl || !stage || isNodeLocked(node)) return;
            const playhead = Number(node.params?.playhead || 0);
            const effectiveClip = getClipAtTime(clip, playhead);
            evt.preventDefault();
            evt.stopPropagation();
            call('selectTimelineClip', node, clipId, { render: false });
            nodeEl.querySelectorAll?.('[data-timeline-clip-id]').forEach(el => {
                el.classList.toggle('is-selected', el.getAttribute('data-timeline-clip-id') === clip.id);
            });
            call('refreshTimelinePreviewDom', nodeEl, node);
            call('pushHistoryBatch', `timeline-preview:${node.id}:${clipId}`, 'Move timeline visual');
            dragState = {
                pointerId: evt.pointerId,
                nodeId: node.id,
                clipId,
                nodeEl,
                stage,
                layer: evt.target.closest?.('[data-preview-clip]'),
                mode: modeName || 'move',
                startClientX: evt.clientX,
                startClientY: evt.clientY,
                startX: Number(effectiveClip.x || 0),
                startY: Number(effectiveClip.y || 0),
                startScale: Number(effectiveClip.scale || 1),
                startRotate: Number(effectiveClip.rotate || 0),
                startCropLeft: Number(clip.crop_left || 0),
                startCropRight: Number(clip.crop_right || 0),
                startCropTop: Number(clip.crop_top || 0),
                startCropBottom: Number(clip.crop_bottom || 0)
            };
            try { evt.target.setPointerCapture?.(evt.pointerId); } catch (err) {}
            const doc = getDocument();
            doc?.addEventListener('pointermove', onTimelinePreviewDragMove, true);
            doc?.addEventListener('pointerup', stopTimelinePreviewDrag, true);
            doc?.addEventListener('pointercancel', stopTimelinePreviewDrag, true);
        }

        function onTimelinePreviewDragMove(evt) {
            if (!dragState || !evt || evt.pointerId !== dragState.pointerId) return;
            evt.preventDefault();
            const node = getNode(dragState.nodeId);
            const clip = (node?.clips || []).find(item => item.id === dragState.clipId);
            if (!node || !clip) return;
            const maskGeometrySnapshot = clip.mask && ['move', 'scale', 'rotate'].includes(dragState.mode)
                ? call('timelineMaskLayerGeometry', node, clip)
                : null;
            const rect = dragState.stage.getBoundingClientRect();
            const dx = ((evt.clientX - dragState.startClientX) / Math.max(1, rect.width)) * 100;
            const dy = ((evt.clientY - dragState.startClientY) / Math.max(1, rect.height)) * 100;
            const layerRect = dragState.layer?.getBoundingClientRect?.() || rect;
            const cropDx = ((evt.clientX - dragState.startClientX) / Math.max(1, layerRect.width)) * 100;
            const cropDy = ((evt.clientY - dragState.startClientY) / Math.max(1, layerRect.height)) * 100;
            let transformKeys = [];
            const clipPatch = {};
            if (dragState.mode === 'scale') {
                clipPatch.scale = Math.max(0.05, dragState.startScale + dx / 80 + dy / 80);
                transformKeys = ['scale'];
            } else if (dragState.mode === 'rotate') {
                clipPatch.rotate = dragState.startRotate + dx * 1.8;
                transformKeys = ['rotate'];
            } else if (dragState.mode === 'left') clipPatch.crop_left = clamp(dragState.startCropLeft + cropDx, 0, 95);
            else if (dragState.mode === 'right') clipPatch.crop_right = clamp(dragState.startCropRight - cropDx, 0, 95);
            else if (dragState.mode === 'top') clipPatch.crop_top = clamp(dragState.startCropTop + cropDy, 0, 95);
            else if (dragState.mode === 'bottom') clipPatch.crop_bottom = clamp(dragState.startCropBottom - cropDy, 0, 95);
            else {
                clipPatch.x = dragState.startX + dx;
                clipPatch.y = dragState.startY + dy;
                transformKeys = ['x', 'y'];
            }
            Object.assign(clip, buildTimelineClipPatch(clipPatch));
            if (transformKeys.length) {
                call('syncTimelineClipTransformKeyframeAtPlayhead', node, clip, transformKeys);
                if (maskGeometrySnapshot) call('remapTimelineClipMaskForGeometryChange', node, clip, maskGeometrySnapshot);
                call('refreshTimelineKeyframeMarkersDom', dragState.nodeEl, node, clip);
            }
            call('refreshTimelinePreviewClipLayersDom', dragState.nodeEl, node, clip);
        }

        function stopTimelinePreviewDrag(evt) {
            if (!dragState) return;
            if (evt && evt.pointerId !== dragState.pointerId) return;
            const nodeId = dragState.nodeId;
            dragState = null;
            const doc = getDocument();
            doc?.removeEventListener('pointermove', onTimelinePreviewDragMove, true);
            doc?.removeEventListener('pointerup', stopTimelinePreviewDrag, true);
            doc?.removeEventListener('pointercancel', stopTimelinePreviewDrag, true);
            call('scheduleSave');
            if (call('getSelectedNodeId') === nodeId) call('renderInspector');
        }

        return {
            startTimelinePreviewDrag,
            onTimelinePreviewDragMove,
            stopTimelinePreviewDrag,
            isDragging: () => !!dragState,
            getDraggingNodeId: () => dragState?.nodeId || null
        };
    }

    window.SimpAICanvasWorkbenchTimelinePreview = Object.assign({}, window.SimpAICanvasWorkbenchTimelinePreview || {}, {
        createCanvasTimelinePreviewController
    });
})();
