(function () {
    'use strict';

    function createCanvasDirectorSegmentPayloadController(context) {
        const scope = context?.directorSegmentPayloadSource || context || {};
        const assetSource = scope.assetSource || {};
        const capabilitySource = scope.capabilitySource || {};
        const referenceSource = scope.referenceSource || {};
        const segmentSource = scope.segmentSource || {};
        const serializationSource = scope.serializationSource || {};
        const call = (source, name, fallback, ...args) => typeof source[name] === 'function'
            ? source[name](...args) : fallback;
        const cloneRunValue = (value, fallback) => call(serializationSource, 'cloneRunValue', fallback, value, fallback);
        const serializeAssetSourceForRun = (...args) => call(assetSource, 'serializeAssetSourceForRun', null, ...args);
        const directorMediaSourceHasAsset = (...args) => call(assetSource, 'directorMediaSourceHasAsset', false, ...args);
        const resolveDirectorCapabilityForPreset = (...args) => call(capabilitySource, 'resolveDirectorCapabilityForPreset', {}, ...args);
        const directorSegmentMediaRefs = (...args) => call(segmentSource, 'directorSegmentMediaRefs', [], ...args);
        const directorSegmentFirstMediaRef = (...args) => call(segmentSource, 'directorSegmentFirstMediaRef', '', ...args);
        const directorSegmentPrompt = (...args) => call(segmentSource, 'directorSegmentPrompt', '', ...args);
        const directorSegmentSeconds = (...args) => call(segmentSource, 'directorSegmentSeconds', 0, ...args);
        const directorSegmentGenerationSeconds = (...args) => call(segmentSource, 'directorSegmentGenerationSeconds', 0, ...args);
        const directorSegmentDurationBounds = (...args) => call(segmentSource, 'directorSegmentDurationBounds', [0, Infinity], ...args);
        const directorDurationStrategyValue = (...args) => call(segmentSource, 'directorDurationStrategyValue', 'shot', ...args);
        const directorDurationParamValue = (...args) => call(segmentSource, 'directorDurationParamValue', 'scene_video_duration', ...args);
        const directorAudioOutputValue = (...args) => call(segmentSource, 'directorAudioOutputValue', 'silent', ...args);
        const imageSlots = () => call(referenceSource, 'imageRefUploadSlots', []);
        const previousVideoRef = () => call(referenceSource, 'previousSegmentVideoRef', 'previous_segment');
        const previousImageRef = () => call(referenceSource, 'previousSegmentImageRef', 'previous_segment_last_frame');

        function directorResultAssetSource(resultNode) {
            if (!resultNode) return null;
            const source = serializeAssetSourceForRun(resultNode);
            return directorMediaSourceHasAsset(source) ? source : null;
        }

        function directorTimelineMediaRefs(payload, key) {
            const refs = [];
            const segments = Array.isArray(payload?.segments) ? payload.segments : [];
            segments.forEach((segment) => {
                directorSegmentMediaRefs(segment, key).forEach((ref) => {
                    if (ref && !refs.includes(ref)) refs.push(ref);
                });
            });
            return refs;
        }

        function directorTimelineFirstMediaRef(payload, key) {
            return directorTimelineMediaRefs(payload, key)[0] || '';
        }

        function applyDirectorMediaRefsToPresetPayload(next, mediaSources, imageRefs, audioRef, videoRef, capability) {
            if (!next || !mediaSources || typeof mediaSources !== 'object') return next;
            const uploadSources = cloneRunValue(next.upload_slot_sources || {}, {});
            const uploadSlots = cloneRunValue(next.upload_slots || {}, {});
            const resolvedCapability = capability || next?.params?.director_timeline?.director_capability || resolveDirectorCapabilityForPreset({
                runtime: next?.runtime || {},
                schema: next?.schema || {},
                params: next?.params || {},
                upload_slots: next?.upload_slots || {}
            });
            const imagePolicy = String(resolvedCapability?.image_policy || 'optional').toLowerCase();
            const bindRefToSlot = (ref, slot) => {
                if (!ref || !slot || !mediaSources[ref]) return;
                uploadSources[slot] = cloneRunValue(mediaSources[ref], {});
                const nodeId = String(mediaSources[ref]?.node_id || '').trim();
                if (nodeId) uploadSlots[slot] = nodeId;
            };

            if (imagePolicy !== 'forbidden') {
                const maxImages = Number(resolvedCapability?.max_images);
                const slots = imageSlots();
                const imageLimit = Number.isFinite(maxImages)
                    ? Math.max(0, Math.min(slots.length, Math.round(maxImages)))
                    : slots.length;
                (Array.isArray(imageRefs) ? imageRefs : []).slice(0, imageLimit).forEach((ref, index) => {
                    bindRefToSlot(ref, slots[index]);
                });
            }
            bindRefToSlot(audioRef, 'scene_audio');
            bindRefToSlot(videoRef, 'scene_video');

            next.upload_slot_sources = uploadSources;
            next.upload_slots = uploadSlots;
            return next;
        }

        function clearDirectorSegmentMediaSlots(next) {
            if (!next || typeof next !== 'object') return next;
            const uploadSources = cloneRunValue(next.upload_slot_sources || {}, {});
            const uploadSlots = cloneRunValue(next.upload_slots || {}, {});
            imageSlots().concat(['scene_audio', 'scene_audio2', 'scene_audio3', 'scene_video', 'scene_reference_video', 'scene_reference_video2']).forEach((slot) => {
                delete uploadSources[slot];
                delete uploadSlots[slot];
            });
            next.upload_slot_sources = uploadSources;
            next.upload_slots = uploadSlots;
            return next;
        }

        function applyDirectorTimelineMediaToPresetPayload(next) {
            const payload = next?.params?.director_timeline;
            if (!payload || typeof payload !== 'object') return next;
            const mediaSources = payload.media_sources && typeof payload.media_sources === 'object' ? payload.media_sources : {};
            return applyDirectorMediaRefsToPresetPayload(
                next,
                mediaSources,
                directorTimelineMediaRefs(payload, 'images'),
                directorTimelineFirstMediaRef(payload, 'audio'),
                directorTimelineFirstMediaRef(payload, 'video'),
                payload.director_capability
            );
        }

        function applyDirectorSegmentMediaToPresetPayload(next, plan, segment, previousResultNode) {
            if (!next || !plan?.payload || !segment) return next;
            clearDirectorSegmentMediaSlots(next);
            const mediaSources = cloneRunValue(
                plan.payload.media_sources && typeof plan.payload.media_sources === 'object' ? plan.payload.media_sources : {},
                {}
            );
            const videoRef = directorSegmentFirstMediaRef(segment, 'video');
            const imageRefs = directorSegmentMediaRefs(segment, 'images');
            if (imageRefs.includes(previousImageRef())) {
                const previousSource = directorResultAssetSource(previousResultNode);
                if (previousSource) {
                    previousSource.transform = { kind: 'video_last_frame' };
                    mediaSources[previousImageRef()] = previousSource;
                }
            }
            if (videoRef === previousVideoRef()) {
                const previousSource = directorResultAssetSource(previousResultNode);
                if (previousSource) mediaSources[previousVideoRef()] = previousSource;
            }
            return applyDirectorMediaRefsToPresetPayload(
                next,
                mediaSources,
                imageRefs,
                directorSegmentFirstMediaRef(segment, 'audio'),
                videoRef,
                plan.capability || plan.payload.director_capability
            );
        }

        function applyDirectorSegmentToPresetPayload(presetPayload, plan, segment, index, previousResultNode) {
            const next = cloneRunValue(presetPayload || {}, {});
            const params = cloneRunValue(next.params || {}, {});
            delete params.director_timeline;
            delete params.prompt_override;
            delete params.director_prompt_override;
            const prompt = directorSegmentPrompt(segment, params.prompt || plan?.payload?.prompt_override || '');
            params.prompt = prompt;
            const capability = plan?.capability || plan?.payload?.director_capability || {};
            const durationStrategy = directorDurationStrategyValue(capability.duration_strategy, 'shot');
            const shotDuration = directorSegmentSeconds(segment, plan);
            const duration = directorSegmentGenerationSeconds(segment, plan);
            const durationParam = directorDurationParamValue(capability.segment_duration_param, 'scene_video_duration');
            if (durationParam && Number.isFinite(duration)) {
                const minMax = directorSegmentDurationBounds(capability);
                const minDuration = durationStrategy === 'shot' ? minMax[0] : 0;
                const maxDuration = minMax[1];
                const roundedDuration = Math.round(duration * 10) / 10;
                params[durationParam] = Math.max(minDuration, Math.min(maxDuration, roundedDuration));
            }
            params.director_segment = {
                schema: 'simpai.director_segment.v1',
                director_node_id: plan?.director?.id || '',
                segment_index: index,
                segment_id: segment?.id || `shot_${index + 1}`,
                start: segment?.start ?? 0,
                end: segment?.end ?? shotDuration,
                duration: Number.isFinite(duration) ? Math.max(0, Math.round(duration * 1000) / 1000) : duration,
                shot_duration: Number.isFinite(shotDuration) ? Math.max(0.05, Math.round(shotDuration * 1000) / 1000) : shotDuration,
                duration_strategy: durationStrategy,
                audio_output: directorAudioOutputValue(capability.audio_output, 'silent'),
                duration_param: durationParam,
                unit: segment?.unit || 'seconds',
                type: segment?.type || 't2v',
                task_method: next.runtime?.task_method || '',
                prompt
            };
            next.params = params;
            return applyDirectorSegmentMediaToPresetPayload(next, plan, segment, previousResultNode);
        }

        return {
            directorResultAssetSource,
            directorTimelineMediaRefs,
            directorTimelineFirstMediaRef,
            applyDirectorMediaRefsToPresetPayload,
            clearDirectorSegmentMediaSlots,
            applyDirectorTimelineMediaToPresetPayload,
            applyDirectorSegmentMediaToPresetPayload,
            applyDirectorSegmentToPresetPayload
        };
    }

    window.SimpAICanvasWorkbenchDirectorSegmentPayload = Object.assign(
        {}, window.SimpAICanvasWorkbenchDirectorSegmentPayload || {}, { createCanvasDirectorSegmentPayloadController }
    );
})();