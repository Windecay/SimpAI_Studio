(function () {
    'use strict';

    function createCanvasNodePointerController(context) {
        const source = context?.nodePointerSource || context || {};
        const call = (name, fallback, ...args) => typeof source[name] === 'function'
            ? source[name](...args)
            : fallback;

        function handleNodePointerDown(nodeEl, node, evt) {
            if (!node || !evt) return false;
            if (evt.button === 1) {
                evt.preventDefault();
                evt.stopPropagation();
                call('startPan', undefined, evt);
                return true;
            }
            if (evt.button !== 0) return false;

            if (call('isCanvasAgentPickingReference', false)) {
                evt.preventDefault();
                evt.stopPropagation();
                if (call('addCanvasAgentReferenceFromNode', false, node)) {
                    call('setCanvasAgentPickingReference', undefined, false);
                    call('renderCanvasAgentPanel', undefined);
                }
                return true;
            }

            const target = evt.target;
            const closest = selector => target?.closest?.(selector) || null;
            const nodeResizeHandle = closest('[data-node-resize-handle]');
            if (nodeResizeHandle) {
                evt.preventDefault();
                evt.stopPropagation();
                call('startNodeResize', undefined, node, evt);
                return true;
            }
            const resolutionDrag = closest('[data-resolution-drag-area],[data-resolution-drag-handle]');
            if (resolutionDrag && node.type === 'config' && node.config_kind === 'resolution') {
                evt.preventDefault();
                evt.stopPropagation();
                call('startResolutionDrag', undefined, node, evt);
                return true;
            }
            if (closest('[data-handle-out]')) {
                evt.preventDefault();
                call('startConnection', undefined, node, evt);
                return true;
            }
            if (call('handleInputHandlePointerDownFromEvent', false, node, evt)) return true;

            const compareStage = closest('.sai-compare-stage');
            if (compareStage && node.type === 'compare') {
                call('startComparePositionDrag', undefined, node, compareStage, evt);
                return true;
            }
            const timelineKeyframeJump = closest('[data-timeline-keyframe-jump]');
            if (timelineKeyframeJump && node.type === 'timeline') {
                call('startTimelineKeyframeDrag', undefined, node, timelineKeyframeJump, evt);
                return true;
            }
            const timelinePenAnchor = closest('[data-timeline-pen-anchor]');
            if (timelinePenAnchor && node.type === 'timeline') {
                call('startTimelineMaskAnchorDrag', undefined, node, timelinePenAnchor, evt);
                return true;
            }
            const timelinePlayheadLane = closest('[data-timeline-playhead-lane]');
            if (timelinePlayheadLane && node.type === 'timeline') {
                call('startTimelinePlayheadDrag', undefined, node, evt);
                return true;
            }
            const timelinePreviewClip = closest('[data-preview-clip]');
            const timelinePreviewStage = closest('.sai-timeline-preview-stage');
            if (timelinePreviewStage && node.type === 'timeline' && (node.params?.preview_tool || 'transform') === 'mask') {
                const clipId = timelinePreviewClip?.getAttribute('data-preview-clip') || node.params?.selected_clip_id || '';
                call('startTimelineMaskDraw', undefined, node, clipId, evt);
                return true;
            }
            if (timelinePreviewClip && node.type === 'timeline') {
                const tool = node.params?.preview_tool || 'transform';
                if (tool === 'mask' && !closest('[data-preview-transform]')) {
                    call('startTimelineMaskDraw', undefined, node, timelinePreviewClip.getAttribute('data-preview-clip'), evt);
                    return true;
                }
                const cropMode = tool === 'crop' ? closest('[data-preview-crop]')?.getAttribute('data-preview-crop') : '';
                const transformMode = tool === 'transform' ? closest('[data-preview-transform]')?.getAttribute('data-preview-transform') : '';
                call('startTimelinePreviewDrag', undefined, node, timelinePreviewClip.getAttribute('data-preview-clip'), evt, cropMode || transformMode || 'move');
                return true;
            }
            const timelineClip = closest('[data-timeline-clip-id]');
            if (timelineClip && node.type === 'timeline') {
                const trimHandle = closest('[data-timeline-trim]');
                const modeName = trimHandle ? `trim-${trimHandle.getAttribute('data-timeline-trim') || 'end'}` : 'move';
                call('startTimelineClipDrag', undefined, node, timelineClip.getAttribute('data-timeline-clip-id'), modeName, evt);
                return true;
            }
            const directorTimelineDrag = closest('[data-director-timeline-drag]');
            if (directorTimelineDrag && call('isDirectorTimelineNode', false, node)) {
                call('startDirectorTimelinePreviewDrag', undefined, node, nodeEl, directorTimelineDrag, evt);
                return true;
            }
            if (call('isInteractiveTarget', false, target)) return true;

            return !!call('handleNodeDragPointerDown', false, node, evt);
        }

        return { handleNodePointerDown };
    }

    window.SimpAICanvasWorkbenchNodePointer = Object.assign(
        window.SimpAICanvasWorkbenchNodePointer || {},
        { createCanvasNodePointerController }
    );
})();
