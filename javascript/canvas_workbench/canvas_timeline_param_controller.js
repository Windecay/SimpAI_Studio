(function () {
    'use strict';

    function createCanvasTimelineParamController(context) {
        const scope = context || {};
        const call = (name, fallback, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : fallback;
        const getNode = (id) => call('getNode', null, id);
        const getSelectedNodeId = () => call('getSelectedNodeId', null);
        const clamp = typeof scope.clamp === 'function'
            ? scope.clamp
            : (value, min, max) => Math.max(min, Math.min(max, value));

        function fieldValue(field) {
            return field?.value;
        }

        function updateTimelineParam(nodeId, key, value, inputType, options) {
            const node = getNode(nodeId);
            if (!node || node.type !== 'timeline' || call('isNodeLocked', false, node)) return;
            const maskGeometrySnapshot = ['size_preset', 'width', 'height'].includes(key)
                ? call('captureTimelineMaskGeometry', null, node)
                : null;
            call('pushHistoryBatch', undefined, `timeline-param:${nodeId}:${key}`, 'Edit timeline');
            Object.assign(node, call(
                'buildTimelineParamUpdatePatch',
                { params: Object.assign({}, node.params || {}, { [key]: value }) },
                node,
                key,
                value,
                inputType
            ));
            if (maskGeometrySnapshot) call('remapTimelineMasksAfterCanvasResize', undefined, node, maskGeometrySnapshot);
            if (key === 'mask_feather') call('applyTimelineMaskFeatherToSelectedClip', undefined, node);
            call('normalizeTimelineNode', undefined, node);
            if (options?.render === false) call('scheduleSave');
            else call('mutate', undefined, { inspector: true });
        }

        function updateTimelineClipParam(nodeId, clipId, key, value, inputType, options) {
            const node = getNode(nodeId);
            if (!node || node.type !== 'timeline' || call('isNodeLocked', false, node) || !clipId || !key) return;
            const clip = (node.clips || []).find(item => item.id === clipId);
            if (!clip) return;
            const maskGeometrySnapshot = clip.mask && ['x', 'y', 'scale', 'rotate'].includes(key)
                ? call('timelineMaskLayerGeometry', null, node, clip)
                : null;
            Object.assign(node, call(
                'buildTimelineParamsPatch',
                { params: Object.assign({}, node.params || {}, { selected_clip_id: clip.id }) },
                node,
                { selected_clip_id: clip.id }
            ));
            call('pushHistoryBatch', undefined, `timeline-clip:${nodeId}:${clipId}:${key}`, 'Edit timeline clip');
            Object.assign(clip, call(
                'buildTimelineClipParamUpdatePatch',
                { [key]: value },
                clip,
                key,
                value,
                inputType
            ));
            if (['duration', 'start', 'in'].includes(key)) call('enforceTimelineClipMediaBounds', undefined, node, clip);
            call('syncTimelineClipTransformKeyframeAtPlayhead', undefined, node, clip, [key]);
            if (maskGeometrySnapshot) call('remapTimelineClipMaskForGeometryChange', undefined, node, clip, maskGeometrySnapshot);
            call('normalizeTimelineNode', undefined, node);
            if (options?.render === false) call('scheduleSave');
            else call('mutate', undefined, { inspector: true });
        }

        function handleTimelineNodeParamEvent(nodeEl, node, evt, eventType) {
            if (!node || node.type !== 'timeline' || !evt?.target) return false;
            const target = evt.target;
            const timelineParam = target.closest?.('[data-timeline-param]');
            if (timelineParam) {
                const key = timelineParam.getAttribute('data-timeline-param');
                const shouldRender = eventType === 'change' && ['size_preset', 'fps_preset', 'width', 'height', 'fps'].includes(key);
                updateTimelineParam(node.id, key, fieldValue(timelineParam), timelineParam.type, { render: shouldRender });
                if (key === 'mask_feather') {
                    call('refreshTimelineMaskFeatherDom', undefined, nodeEl, node);
                    return true;
                }
                if (!shouldRender) {
                    call('refreshTimelineAllClipDom', undefined, nodeEl, node);
                    call('refreshTimelinePlayheadDom', undefined, nodeEl, node);
                    call('refreshTimelinePreviewDom', undefined, nodeEl, node);
                }
                return true;
            }
            const timelineClipParam = target.closest?.('[data-timeline-clip-param]');
            if (timelineClipParam) {
                const [clipId, key] = String(timelineClipParam.getAttribute('data-timeline-clip-param') || '').split(':');
                updateTimelineClipParam(node.id, clipId, key, fieldValue(timelineClipParam), timelineClipParam.type, { render: false });
                const clip = (node.clips || []).find(item => item.id === clipId);
                if (clip) {
                    call('refreshTimelineClipDom', undefined, nodeEl, node, clip);
                    call('refreshTimelinePreviewDom', undefined, nodeEl, node);
                    call('refreshTimelineInlineValue', undefined, timelineClipParam, key, clip);
                }
                return true;
            }
            return false;
        }

        function timelineDefaultParamValue(key) {
            const defaults = call('getTimelineDefaultParams', {},) || {};
            if (Object.prototype.hasOwnProperty.call(defaults, key)) return defaults[key];
            if (key === 'size_preset') return '1280x720';
            if (key === 'fps_preset') return '30';
            return '';
        }

        function timelineDefaultClipValue(clip, key) {
            if (key === 'start') return 0;
            if (key === 'duration') {
                const source = getNode(clip?.source_node_id);
                const asset = call('getTimelineSourceAsset', {}, source) || {};
                const range = call('getMediaEditRange', {}, asset) || {};
                if (clip?.kind === 'image') return 4;
                return Math.max(0.05, Number(range.end || 0) - Number(range.start || 0) || Number(asset.duration || 1) || 1);
            }
            const defaults = {
                x: 0,
                y: 0,
                scale: 1,
                rotate: 0,
                opacity: 1,
                volume: 1,
                crop_left: 0,
                crop_right: 0,
                crop_top: 0,
                crop_bottom: 0
            };
            return Object.prototype.hasOwnProperty.call(defaults, key) ? defaults[key] : '';
        }

        function resetTimelineParam(node, key) {
            if (!node || node.type !== 'timeline' || call('isNodeLocked', false, node)) return;
            call('pushHistoryBatch', undefined, `timeline-reset:${node.id}:${key}`, 'Reset timeline parameter');
            updateTimelineParam(node.id, key, timelineDefaultParamValue(key), key === 'size_preset' || key === 'fps_preset' ? 'text' : 'number', { render: true });
        }

        function resetTimelineClipParam(node, clipId, key) {
            if (!node || node.type !== 'timeline' || call('isNodeLocked', false, node)) return;
            const clip = (node.clips || []).find(item => item.id === clipId);
            if (!clip) return;
            call('pushHistoryBatch', undefined, `timeline-clip-reset:${node.id}:${clipId}:${key}`, 'Reset timeline clip parameter');
            updateTimelineClipParam(node.id, clipId, key, timelineDefaultClipValue(clip, key), 'number', { render: true });
        }

        function handleInspectorTimelineParamChange(field, nodeId, inspector) {
            if (!field) return false;
            const key = field.getAttribute?.('data-timeline-param');
            if (!key) return false;
            if (key === 'mask_feather') {
                updateTimelineParam(nodeId, key, fieldValue(field), field.type, { render: false });
                const node = getNode(nodeId);
                const nodeEl = call('getNodeElement', null, node?.id);
                call('refreshTimelineFeatherControlDom', undefined, inspector, fieldValue(field));
                if (nodeEl) call('refreshTimelineMaskFeatherDom', undefined, nodeEl, node);
                return true;
            }
            updateTimelineParam(nodeId, key, fieldValue(field), field.type);
            return true;
        }

        function handleInspectorTimelineClipParamChange(field, nodeId) {
            if (!field) return false;
            const [clipId, key] = String(field.getAttribute?.('data-timeline-clip-param') || '').split(':');
            if (!clipId || !key) return false;
            updateTimelineClipParam(nodeId, clipId, key, fieldValue(field), field.type);
            return true;
        }

        function bindInspectorTimelineParamEvents(inspector, nodeId) {
            if (!inspector || typeof inspector.querySelectorAll !== 'function') return false;
            const selectedId = nodeId || getSelectedNodeId();
            inspector.querySelectorAll('[data-timeline-param]').forEach((field) => {
                const handler = () => handleInspectorTimelineParamChange(field, selectedId, inspector);
                field.addEventListener('input', handler);
                field.addEventListener('change', handler);
            });
            inspector.querySelectorAll('[data-timeline-clip-param]').forEach((field) => {
                const handler = () => handleInspectorTimelineClipParamChange(field, selectedId);
                field.addEventListener('input', handler);
                field.addEventListener('change', handler);
            });
            return true;
        }

        return {
            updateTimelineParam,
            updateTimelineClipParam,
            handleTimelineNodeParamEvent,
            resetTimelineParam,
            resetTimelineClipParam,
            handleInspectorTimelineParamChange,
            handleInspectorTimelineClipParamChange,
            bindInspectorTimelineParamEvents
        };
    }

    window.SimpAICanvasWorkbenchTimelineParam = Object.assign({}, window.SimpAICanvasWorkbenchTimelineParam || {}, {
        createCanvasTimelineParamController
    });
})();
