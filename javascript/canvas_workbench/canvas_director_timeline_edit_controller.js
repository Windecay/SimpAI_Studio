(function () {
    'use strict';

    function createCanvasDirectorTimelineEditController(context) {
        const scope = context?.directorTimelineEditSource || context || {};
        const nodeSource = scope.nodeSource || {};
        const inspectorSource = scope.inspectorSource || {};
        const historySource = scope.historySource || {};
        const stateSource = scope.stateSource || {};
        const timelineSource = scope.timelineSource || {};
        const valueSource = scope.valueSource || {};
        const idSource = scope.idSource || {};
        const referenceSource = scope.referenceSource || {};
        const payloadSource = scope.payloadSource || {};
        const clipboardSource = scope.clipboardSource || {};
        const notificationSource = scope.notificationSource || {};
        const languageSource = scope.languageSource || {};
        const call = (source, name, fallback, ...args) => typeof source[name] === 'function'
            ? source[name](...args)
            : fallback;
        const getNode = id => call(nodeSource, 'getNode', null, id);
        const isDirectorTimelineNode = node => !!call(nodeSource, 'isDirectorTimelineNode', false, node);
        const isNodeLocked = node => !!call(nodeSource, 'isNodeLocked', false, node);
        const cloneRunValue = value => call(valueSource, 'cloneRunValue', value, value, {});
        const normalizeTimeline = director => call(timelineSource, 'normalizeTimeline', director, director);
        const buildStatePatch = (node, options) => call(stateSource, 'buildDirectorTimelineStatePatch', {}, node, options);
        const mergeCanvasRunStatus = (...args) => call(stateSource, 'mergeCanvasRunStatus', {}, ...args);
        const mutate = options => call(stateSource, 'mutate', undefined, options);
        const selectedNodeId = () => call(stateSource, 'getSelectedNodeId', null);
        const constrainSegmentTimes = (director, index) => call(timelineSource, 'directorTimelineConstrainSegmentTimes', undefined, director, index);
        const uid = prefix => call(idSource, 'uid', `${prefix || 'id'}_${Date.now()}`, prefix);
        const previousSegmentImageRef = () => call(referenceSource, 'previousSegmentImageRef', 'previous_segment_last_frame');
        const previousSegmentVideoRef = () => call(referenceSource, 'previousSegmentVideoRef', 'previous_segment');
        const directorTimelinePayload = node => call(payloadSource, 'directorTimelinePayload', null, node);
        const syncTwinParamInputs = (...args) => call(inspectorSource, 'syncTwinParamInputs', undefined, ...args);
        const t = (en, cn) => {
            const state = call(languageSource, 'getLanguageState', {});
            return call(languageSource, 't', en, en, cn, state);
        };

        function normalizeDirectorTimelineForNode(node) {
            if (!node || !isDirectorTimelineNode(node)) return null;
            const current = cloneRunValue(node.director || {});
            const normalized = normalizeTimeline(current);
            Object.assign(node, buildStatePatch(node, { directorPatch: normalized }));
            return cloneRunValue(node.director || normalized);
        }

        function updateDirectorStatus(node) {
            if (!node || !isDirectorTimelineNode(node)) return;
            const payload = directorTimelinePayload(node);
            const message = payload?.prompt_override
                ? t('prompt_override ready.', 'prompt_override 已就绪。')
                : t('Director timeline is empty.', 'Director timeline 为空。');
            const status = mergeCanvasRunStatus(node.status, 'ready', message);
            Object.assign(node, buildStatePatch(node, { status }));
        }

        function updateDirectorTimelineParam(nodeId, key, value, inputType) {
            const node = getNode(nodeId);
            if (!isDirectorTimelineNode(node) || !key || isNodeLocked(node)) return;
            call(historySource, 'pushHistoryBatch', undefined, `director:${nodeId}:${key}`, 'Edit Director Timeline');
            const director = normalizeDirectorTimelineForNode(node);
            if (!director) return;
            if (inputType === 'number' || ['width', 'height', 'fps', 'duration'].includes(key)) {
                const parsed = Number(value);
                director[key] = Number.isFinite(parsed) ? parsed : value;
            } else {
                director[key] = value;
            }
            Object.assign(node, buildStatePatch(node, { directorPatch: normalizeTimeline(director) }));
            updateDirectorStatus(node);
            mutate({ inspector: selectedNodeId() === nodeId });
        }

        function updateDirectorTimelineSegmentParam(nodeId, index, key, value, inputType) {
            const node = getNode(nodeId);
            if (!isDirectorTimelineNode(node) || !key || isNodeLocked(node)) return;
            const director = normalizeDirectorTimelineForNode(node);
            if (!director || !Array.isArray(director.segments) || !director.segments[index]) return;
            call(historySource, 'pushHistoryBatch', undefined, `director:${nodeId}:segment:${index}:${key}`, 'Edit Director shot');
            const segment = Object.assign({}, director.segments[index]);
            if (['start', 'end'].includes(key) || inputType === 'number') {
                const parsed = Number(value);
                segment[key] = Number.isFinite(parsed) ? parsed : value;
            } else if (key === 'inherit_previous_tail') {
                const images = Array.isArray(segment.images) ? segment.images.slice(0, 9).map(item => Object.assign({}, item)) : [];
                const explicitImages = images.filter(item => item.source_ref !== previousSegmentImageRef());
                if (value && segment.type === 'flf' && explicitImages.length) segment.type = 'fmlf';
                if (!value && segment.type === 'fmlf' && explicitImages.length <= 1) segment.type = 'flf';
                segment.images = value
                    ? [{ source_ref: previousSegmentImageRef(), role: 'first_frame' }, ...explicitImages]
                    : explicitImages;
            } else if (key === 'image_ref' || /^image_ref_[1-9]$/.test(key)) {
                const currentImages = Array.isArray(segment.images) ? segment.images.slice(0, 9).map(item => Object.assign({}, item)) : [];
                const inherited = currentImages.some(item => item.source_ref === previousSegmentImageRef());
                const images = currentImages.filter(item => item.source_ref !== previousSegmentImageRef());
                const slotIndex = key === 'image_ref'
                    ? 0
                    : Math.max(0, Math.min(8, Number(String(key).split('_').pop() || 1) - 1));
                const roleForIndex = imageIndex => {
                    if (segment.type === 'fmlf') return imageIndex === 1 ? 'last_frame' : 'first_frame';
                    if (segment.type === 'ref') return 'reference';
                    return 'first_frame';
                };
                while (images.length <= slotIndex) images.push({ source_ref: '', role: roleForIndex(images.length) });
                images[slotIndex] = Object.assign({}, images[slotIndex], {
                    source_ref: value || '',
                    role: roleForIndex(slotIndex)
                });
                const explicitImages = images.filter(item => item.source_ref);
                segment.images = inherited
                    ? [{ source_ref: previousSegmentImageRef(), role: 'first_frame' }, ...explicitImages]
                    : explicitImages;
                ['image_ref', 'image_ref_1', 'image_ref_2', 'image_ref_3', 'image_ref_4', 'image_ref_5', 'image_ref_6', 'image_ref_7', 'image_ref_8', 'image_ref_9'].forEach(refKey => {
                    delete segment[refKey];
                });
            } else if (key === 'audio_ref') {
                segment.audio = value ? [{ source_ref: value, role: 'voice' }] : [];
            } else if (key === 'video_ref') {
                segment.video = value ? [{
                    source_ref: value,
                    role: value === previousSegmentVideoRef() ? 'previous_result' : 'reference'
                }] : [];
            } else {
                segment[key] = value;
            }
            director.segments[index] = segment;
            if (key === 'start' || key === 'end') constrainSegmentTimes(director, index);
            Object.assign(node, buildStatePatch(node, { directorPatch: normalizeTimeline(director) }));
            updateDirectorStatus(node);
            mutate({ inspector: selectedNodeId() === nodeId });
        }

        function addDirectorTimelineSegment(node) {
            if (!isDirectorTimelineNode(node) || isNodeLocked(node)) return;
            call(historySource, 'pushHistory', undefined, 'Add Director shot');
            const director = normalizeDirectorTimelineForNode(node);
            const segments = Array.isArray(director.segments) ? director.segments : [];
            const last = segments[segments.length - 1] || { end: 0 };
            const start = Number(last.end || 0);
            const end = Math.max(start + 2, start + 0.1);
            segments.push({
                id: uid('shot'),
                start,
                end,
                unit: 'seconds',
                type: 't2v',
                prompt: '',
                images: [],
                audio: [],
                video: []
            });
            director.segments = segments;
            Object.assign(node, buildStatePatch(node, { directorPatch: normalizeTimeline(director) }));
            updateDirectorStatus(node);
            mutate({ inspector: selectedNodeId() === node.id });
        }

        function removeDirectorTimelineSegment(node, index) {
            if (!isDirectorTimelineNode(node) || isNodeLocked(node)) return;
            const director = normalizeDirectorTimelineForNode(node);
            if (!director || !Array.isArray(director.segments) || director.segments.length <= 1) return;
            call(historySource, 'pushHistory', undefined, 'Delete Director shot');
            director.segments.splice(index, 1);
            Object.assign(node, buildStatePatch(node, { directorPatch: normalizeTimeline(director) }));
            updateDirectorStatus(node);
            mutate({ inspector: selectedNodeId() === node.id });
        }

        function moveDirectorTimelineSegment(node, index, delta) {
            if (!isDirectorTimelineNode(node) || isNodeLocked(node)) return;
            const director = normalizeDirectorTimelineForNode(node);
            if (!director || !Array.isArray(director.segments)) return;
            const nextIndex = index + delta;
            if (index < 0 || nextIndex < 0 || index >= director.segments.length || nextIndex >= director.segments.length) return;
            call(historySource, 'pushHistory', undefined, 'Move Director shot');
            const [segment] = director.segments.splice(index, 1);
            director.segments.splice(nextIndex, 0, segment);
            Object.assign(node, buildStatePatch(node, { directorPatch: normalizeTimeline(director) }));
            updateDirectorStatus(node);
            mutate({ inspector: selectedNodeId() === node.id });
        }

        function copyDirectorTimelineOutput(node) {
            const payload = call(payloadSource, 'directorTimelinePayload', null, node);
            const text = payload?.prompt_override || '';
            if (!text) {
                call(notificationSource, 'showToast', undefined, t('Director output is empty.', '导演输出为空。'));
                return;
            }
            const write = call(clipboardSource, 'writeText', undefined, text);
            if (write && typeof write.then === 'function') {
                write.then(() => {
                    call(notificationSource, 'showToast', undefined, t('Director prompt_override copied.', 'Director prompt_override 已复制。'));
                }).catch(() => {
                    call(notificationSource, 'showToast', undefined, text);
                });
            }
        }

        function handleDirectorTimelineAction(node, action) {
            if (!isDirectorTimelineNode(node)) return false;
            const value = String(action || '');
            if (value === 'director-add-segment') {
                addDirectorTimelineSegment(node);
                return true;
            }
            if (value === 'director-copy-output') {
                copyDirectorTimelineOutput(node);
                return true;
            }
            if (value.startsWith('director-remove-segment:')) {
                removeDirectorTimelineSegment(node, Number(value.slice('director-remove-segment:'.length)) || 0);
                return true;
            }
            if (value.startsWith('director-move-segment-up:')) {
                moveDirectorTimelineSegment(node, Number(value.slice('director-move-segment-up:'.length)) || 0, -1);
                return true;
            }
            if (value.startsWith('director-move-segment-down:')) {
                moveDirectorTimelineSegment(node, Number(value.slice('director-move-segment-down:'.length)) || 0, 1);
                return true;
            }
            return false;
        }

        function bindDirectorTimelineInspectorEvents(inspector) {
            inspector?.querySelectorAll?.('[data-inspector-director-param]').forEach(field => {
                const handler = () => {
                    syncTwinParamInputs(field, '[data-inspector-director-param]');
                    updateDirectorTimelineParam(
                        selectedNodeId(),
                        field.getAttribute('data-inspector-director-param'),
                        field.value,
                        field.type
                    );
                };
                field.addEventListener('input', handler);
                field.addEventListener('change', handler);
            });
            inspector?.querySelectorAll?.('[data-inspector-director-segment-param]').forEach(field => {
                const handler = () => {
                    syncTwinParamInputs(field, '[data-inspector-director-segment-param]');
                    updateDirectorTimelineSegmentParam(
                        selectedNodeId(),
                        Number(field.getAttribute('data-director-segment-index') || 0),
                        field.getAttribute('data-inspector-director-segment-param'),
                        field.type === 'checkbox' ? field.checked : field.value,
                        field.type
                    );
                };
                field.addEventListener('input', handler);
                field.addEventListener('change', handler);
            });
        }

        return {
            normalizeDirectorTimelineForNode,
            updateDirectorStatus,
            updateDirectorTimelineParam,
            updateDirectorTimelineSegmentParam,
            addDirectorTimelineSegment,
            removeDirectorTimelineSegment,
            moveDirectorTimelineSegment,
            copyDirectorTimelineOutput,
            handleDirectorTimelineAction,
            bindDirectorTimelineInspectorEvents
        };
    }

    window.SimpAICanvasWorkbenchDirectorTimelineEdit = Object.assign({}, window.SimpAICanvasWorkbenchDirectorTimelineEdit || {}, {
        createCanvasDirectorTimelineEditController
    });
})();
