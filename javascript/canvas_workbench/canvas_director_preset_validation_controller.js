(function () {
    'use strict';

    function createCanvasDirectorPresetValidationController(context) {
        const scope = context?.directorPresetValidationSource || context || {};
        const projectSource = scope.projectSource || {};
        const nodeSource = scope.nodeSource || {};
        const presetSource = scope.presetSource || {};
        const payloadSource = scope.payloadSource || {};
        const referenceSource = scope.referenceSource || {};
        const serializationSource = scope.serializationSource || {};
        const languageSource = scope.languageSource || {};
        const call = (source, name, fallback, ...args) => typeof source[name] === 'function'
            ? source[name](...args) : fallback;
        const cloneRunValue = (value, fallback) => call(serializationSource, 'cloneRunValue', value, value, fallback);
        const getProject = () => call(projectSource, 'getProject', {});
        const getNode = id => call(nodeSource, 'getNode', null, id);
        const getPresetSchema = node => call(presetSource, 'getPresetSchema', {}, node) || {};
        const getPresetTheme = node => call(presetSource, 'getPresetTheme', '', node) || '';
        const getPresetThemeInfo = node => call(presetSource, 'getPresetThemeInfo', {}, node) || {};
        const directorTimelinePromptOverrideForTimeline = (...args) => call(payloadSource, 'directorTimelinePromptOverrideForTimeline', undefined, ...args);
        const directorTimelinePayload = (...args) => call(payloadSource, 'directorTimelinePayload', {}, ...args);
        const DIRECTOR_IMAGE_REF_UPLOAD_SLOTS = [
            'scene_canvas_image',
            'scene_input_image1',
            'scene_input_image2',
            'scene_input_image3',
            'scene_input_image4',
            'scene_input_image5',
            'scene_input_image6',
            'scene_input_image7',
            'scene_input_image8'
        ];
        const imageRefUploadSlots = () => {
            const slots = call(referenceSource, 'imageRefUploadSlots', null);
            return Array.isArray(slots) ? slots : DIRECTOR_IMAGE_REF_UPLOAD_SLOTS;
        };
        const t = (en, cn) => {
            const state = call(languageSource, 'getLanguageState', {});
            return call(languageSource, 't', en, en, cn, state);
        };
        const previousVideoRef = () => call(referenceSource, 'previousSegmentVideoRef', 'previous_segment');
        const previousImageRef = () => call(referenceSource, 'previousSegmentImageRef', 'previous_segment_last_frame');

        const DIRECTOR_CAPABILITY_IMAGE_POLICIES = new Set(['optional', 'required', 'forbidden']);
        const DIRECTOR_CAPABILITY_MEDIA_POLICIES = new Set(['optional', 'required', 'forbidden']);

        function getPresetSceneFrontend(node) {
            const schema = getPresetSchema(node);
            const candidates = [
                node?.runtime?.scene_frontend,
                node?.params?.scene_frontend,
                schema.scene_frontend,
                schema.default_engine?.scene_frontend,
                node?.runtime?.__preset_prepared?.engine?.scene_frontend
            ];
            for (const candidate of candidates) {
                if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) return candidate;
            }
            return {};
        }

        function directorPresetThemeValue(value, node, fallback) {
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                const theme = getPresetTheme(node);
                if (theme && Object.prototype.hasOwnProperty.call(value, theme)) return value[theme];
                if (Object.prototype.hasOwnProperty.call(value, 'default')) return value.default;
                const first = Object.values(value)[0];
                return first === undefined ? fallback : first;
            }
            return value === undefined || value === null ? fallback : value;
        }

        function directorCapabilityCandidate(value, node) {
            if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
            const knownKeys = ['image_policy', 'audio_policy', 'video_policy', 'max_images', 'max_audios', 'max_videos', 'min_images', 'image_modes', 'video_modes', 'chain_output', 'requires_sequential', 'mixed_segments', 'director_supported', 'segment_duration_param', 'duration_strategy', 'audio_output', 'min_segment_duration', 'max_segment_duration'];
            if (knownKeys.some((key) => Object.prototype.hasOwnProperty.call(value, key))) return value;
            const theme = getPresetTheme(node);
            if (theme && value[theme] && typeof value[theme] === 'object') return value[theme];
            if (value.default && typeof value.default === 'object') return value.default;
            return {};
        }

        function directorExplicitCapabilityForPreset(node) {
            const schema = getPresetSchema(node);
            const themeInfo = getPresetThemeInfo(node);
            const candidates = [
                node?.runtime?.director_capability,
                node?.params?.director_capability,
                schema.director_capability,
                themeInfo.director_capability
            ];
            for (const candidate of candidates) {
                const capability = directorCapabilityCandidate(candidate, node);
                if (capability && Object.keys(capability).length) return capability;
            }
            return {};
        }

        function directorPolicyValue(value, allowed, fallback) {
            const policy = String(value || '').trim().toLowerCase();
            return allowed.has(policy) ? policy : fallback;
        }

        function directorIntCapabilityValue(value, fallback, min, max) {
            const parsed = Number(value);
            const base = Number.isFinite(parsed) ? Math.round(parsed) : fallback;
            return Math.max(min, Math.min(max, base));
        }

        function directorNumberCapabilityValue(value, fallback, min, max) {
            const parsed = Number(value);
            const base = Number.isFinite(parsed) ? parsed : fallback;
            return Math.max(min, Math.min(max, base));
        }

        function directorDurationParamValue(value, fallback = 'scene_video_duration') {
            const text = String(value || fallback || '').trim();
            if (!text) return '';
            return /^[A-Za-z_][A-Za-z0-9_]*$/.test(text) ? text : fallback;
        }

        function directorDurationStrategyValue(value, fallback = 'shot') {
            const text = String(value || fallback || 'shot').trim().toLowerCase().replace(/-/g, '_');
            return ['shot', 'audio_min', 'video_min'].includes(text) ? text : 'shot';
        }

        function directorAudioOutputValue(value, fallback = 'silent') {
            const text = String(value || fallback || 'silent').trim().toLowerCase().replace(/-/g, '_');
            return ['silent', 'generated', 'input_audio', 'source_audio'].includes(text) ? text : 'silent';
        }

        function directorInferImagePolicyForPreset(node) {
            const schema = getPresetSchema(node);
            const engineType = String(node?.runtime?.engine_type || schema.engine_type || '').trim().toLowerCase();
            if (engineType && engineType !== 'video') return 'forbidden';
            const taskMethod = String(
                getPresetThemeInfo(node).task_method
                || node?.runtime?.task_method
                || directorPresetThemeValue(schema.task_method, node, '')
                || ''
            ).trim().toLowerCase();
            if (taskMethod.includes('t2v')) return 'forbidden';
            if (taskMethod.includes('i2v') || taskMethod.includes('ia2v') || taskMethod === 'wan2.2_cn' || taskMethod === 'wan2.2') return 'required';
            const hidden = new Set(Array.isArray(schema.disvisible) ? schema.disvisible.map(String) : []);
            if (hidden.has('scene_canvas_image') && hidden.has('scene_input_image1')) return 'forbidden';
            return 'optional';
        }

        function directorVisibleImageSlotCountForPreset(node) {
            const schema = getPresetSchema(node);
            const slots = Array.isArray(schema.upload_slots) ? schema.upload_slots : [];
            if (!slots.length) return imageRefUploadSlots().length;
            return slots.filter((slot) => {
                const key = String(slot?.key || '');
                return imageRefUploadSlots().includes(key) && slot.visible !== false;
            }).length;
        }

        function resolveDirectorCapabilityForPreset(node) {
            const explicit = directorExplicitCapabilityForPreset(node);
            const sceneFrontend = getPresetSceneFrontend(node);
            const imagePolicy = directorPolicyValue(explicit.image_policy, DIRECTOR_CAPABILITY_IMAGE_POLICIES, directorInferImagePolicyForPreset(node));
            const audioPolicy = directorPolicyValue(explicit.audio_policy, DIRECTOR_CAPABILITY_MEDIA_POLICIES, 'optional');
            const videoPolicy = directorPolicyValue(explicit.video_policy, DIRECTOR_CAPABILITY_MEDIA_POLICIES, 'optional');
            const imageSlots = imageRefUploadSlots();
            const defaultMaxImages = imagePolicy === 'forbidden' ? 0 : Math.max(1, directorVisibleImageSlotCountForPreset(node) || imageSlots.length);
            const maxImages = imagePolicy === 'forbidden' ? 0 : directorIntCapabilityValue(explicit.max_images, defaultMaxImages, 0, imageSlots.length);
            const maxAudios = audioPolicy === 'forbidden' ? 0 : directorIntCapabilityValue(explicit.max_audios, 1, 0, 3);
            const maxVideos = videoPolicy === 'forbidden' ? 0 : directorIntCapabilityValue(explicit.max_videos, 1, 0, 3);
            const minImages = directorIntCapabilityValue(explicit.min_images, imagePolicy === 'required' ? 1 : 0, 0, Math.max(0, maxImages));
            const imageModes = Array.isArray(explicit.image_modes) && explicit.image_modes.length
                ? explicit.image_modes.map((item) => String(item))
                : (imagePolicy === 'forbidden' ? ['none'] : ['none', 'first_frame', 'first_last', 'reference_set']);
            const videoModes = Array.isArray(explicit.video_modes) && explicit.video_modes.length
                ? explicit.video_modes.map((item) => String(item))
                : (videoPolicy === 'forbidden' ? ['none'] : ['explicit']);
            const chainOutputValue = String(explicit.chain_output || '').trim();
            const chainOutput = ['timeline', 'last_result'].includes(chainOutputValue) ? chainOutputValue : 'timeline';
            const requiresSequential = explicit.requires_sequential === undefined
                ? chainOutput === 'last_result'
                : !!explicit.requires_sequential;
            const defaultDurationParam = directorDurationParamValue(directorPresetThemeValue(sceneFrontend.director_segment_duration_param, node, 'scene_video_duration'));
            const durationStrategy = directorDurationStrategyValue(explicit.duration_strategy, 'shot');
            const minDurationFloor = durationStrategy === 'audio_min' || durationStrategy === 'video_min' ? 0 : 0.05;
            const defaultMinSegmentDuration = directorNumberCapabilityValue(directorPresetThemeValue(sceneFrontend.video_duration_min ?? sceneFrontend.var_number_min, node, 0.1), 0.1, minDurationFloor, 86400);
            const defaultMaxSegmentDuration = directorNumberCapabilityValue(directorPresetThemeValue(sceneFrontend.video_duration_max ?? sceneFrontend.var_number_max, node, 10), 10, defaultMinSegmentDuration, 86400);
            const minSegmentDuration = directorNumberCapabilityValue(explicit.min_segment_duration, defaultMinSegmentDuration, minDurationFloor, 86400);
            const maxSegmentDuration = directorNumberCapabilityValue(explicit.max_segment_duration, defaultMaxSegmentDuration, minSegmentDuration, 86400);
            return {
                image_policy: imagePolicy,
                audio_policy: audioPolicy,
                video_policy: videoPolicy,
                max_images: maxImages,
                max_audios: maxAudios,
                max_videos: maxVideos,
                min_images: minImages,
                image_modes: imageModes,
                video_modes: videoModes,
                chain_output: chainOutput,
                requires_sequential: requiresSequential,
                mixed_segments: explicit.mixed_segments === undefined ? imagePolicy === 'optional' : !!explicit.mixed_segments,
                director_supported: explicit.director_supported === undefined ? true : !!explicit.director_supported,
                segment_duration_param: directorDurationParamValue(explicit.segment_duration_param, defaultDurationParam),
                duration_strategy: durationStrategy,
                audio_output: directorAudioOutputValue(explicit.audio_output, 'silent'),
                min_segment_duration: minSegmentDuration,
                max_segment_duration: maxSegmentDuration,
                source: Object.keys(explicit).length ? 'explicit' : 'inferred'
            };
        }

        function directorSegmentPrompt(segment, fallback) {
            const prompt = String(segment?.prompt || '').trim();
            return prompt || String(fallback || '').trim();
        }

        function directorSegmentMediaRefs(segment, key) {
            const refs = [];
            const items = Array.isArray(segment?.[key]) ? segment[key] : [];
            items.forEach((item) => {
                const ref = String(item?.source_ref || item?.source_node_id || '').trim();
                if (ref && !refs.includes(ref)) refs.push(ref);
            });
            return refs;
        }

        function directorSegmentFirstMediaRef(segment, key) {
            return directorSegmentMediaRefs(segment, key)[0] || '';
        }

        function directorSegmentUsesPreviousVideo(segment) {
            return directorSegmentFirstMediaRef(segment, 'video') === previousVideoRef();
        }

        function directorSegmentUsesPreviousImage(segment) {
            return directorSegmentMediaRefs(segment, 'images').includes(previousImageRef());
        }

        function directorCompactSeconds(value) {
            const number = Math.round(Number(value || 0) * 1000) / 1000;
            return Number.isFinite(number) ? String(Number(number.toPrecision(12))) : String(value);
        }

        function directorSegmentDurationBounds(capability) {
            const strategy = directorDurationStrategyValue(capability?.duration_strategy, 'shot');
            const minFloor = strategy === 'audio_min' || strategy === 'video_min' ? 0 : 0.05;
            const minValue = Number(capability?.min_segment_duration);
            const minDuration = Number.isFinite(minValue) ? Math.max(minFloor, Math.min(86400, minValue)) : (minFloor === 0 ? 0 : 1);
            const maxValue = Number(capability?.max_segment_duration);
            const maxDuration = Number.isFinite(maxValue) ? Math.max(minDuration, Math.min(86400, maxValue)) : Math.max(minDuration, 10);
            return [minDuration, maxDuration];
        }

        function directorSegmentRawSeconds(segment, plan) {
            const fps = Math.max(1, Number(plan?.payload?.fps || 24));
            const start = Number(segment?.start || 0);
            const end = Number(segment?.end || start + 1);
            const span = Math.max(0.05, end - start);
            return segment?.unit === 'frames' ? span / fps : span;
        }

        function directorSegmentSeconds(segment, plan) {
            const rawDuration = directorSegmentRawSeconds(segment, plan);
            const [minDuration, maxDuration] = directorSegmentDurationBounds(plan?.capability || plan?.payload?.director_capability);
            return Math.max(minDuration, Math.min(maxDuration, rawDuration));
        }

        function directorSegmentDurationStrategy(plan) {
            return directorDurationStrategyValue(
                (plan?.capability || plan?.payload?.director_capability || {}).duration_strategy,
                'shot'
            );
        }

        function directorSegmentGenerationSeconds(segment, plan) {
            const strategy = directorSegmentDurationStrategy(plan);
            if (strategy === 'audio_min' || strategy === 'video_min') {
                const rawDuration = directorSegmentRawSeconds(segment, plan);
                const [, maxDuration] = directorSegmentDurationBounds(plan?.capability || plan?.payload?.director_capability);
                return Math.max(0, Math.min(maxDuration, rawDuration));
            }
            return directorSegmentSeconds(segment, plan);
        }

        function directorResultDuration(result) {
            const direct = Number(result?.asset?.duration ?? result?.duration);
            if (Number.isFinite(direct) && direct > 0) return Math.min(86400, direct);
            const source = result?.source && typeof result.source === 'object' ? result.source : {};
            const sourceDuration = Number(source.duration);
            return Number.isFinite(sourceDuration) && sourceDuration > 0 ? Math.min(86400, sourceDuration) : 0;
        }

        function directorSegmentTimelineSeconds(segment, plan, result) {
            const strategy = directorSegmentDurationStrategy(plan);
            if (strategy === 'audio_min' || strategy === 'video_min') {
                const assetDuration = directorResultDuration(result);
                if (assetDuration > 0) return assetDuration;
                return directorSegmentRawSeconds(segment, plan);
            }
            return directorSegmentSeconds(segment, plan);
        }

        function applyDirectorCapabilityToPayload(payload, capability) {
            if (!payload || typeof payload !== 'object') return payload;
            const next = cloneRunValue(payload, {});
            const imagePolicy = String(capability?.image_policy || 'optional').toLowerCase();
            const audioPolicy = String(capability?.audio_policy || 'optional').toLowerCase();
            const videoPolicy = String(capability?.video_policy || 'optional').toLowerCase();
            next.director_capability = cloneRunValue(capability || {}, {});
            if (imagePolicy === 'forbidden' || audioPolicy === 'forbidden' || videoPolicy === 'forbidden') {
                (Array.isArray(next.segments) ? next.segments : []).forEach((segment) => {
                    if (!segment || typeof segment !== 'object') return;
                    if (imagePolicy === 'forbidden') segment.images = [];
                    if (audioPolicy === 'forbidden') segment.audio = [];
                    if (videoPolicy === 'forbidden') segment.video = [];
                    if (
                        imagePolicy === 'forbidden'
                        && videoPolicy === 'forbidden'
                        && ['flf', 'fmlf', 'ref'].includes(String(segment.type || '').toLowerCase())
                    ) {
                        segment.type = 't2v';
                    }
                });
            }
            if (typeof payloadSource.directorTimelinePromptOverrideForTimeline === 'function') {
                next.prompt_override = directorTimelinePromptOverrideForTimeline(next);
            }
            return next;
        }

        function applyDirectorCapabilityToPayloadForPreset(node, payload) {
            return applyDirectorCapabilityToPayload(payload, resolveDirectorCapabilityForPreset(node));
        }

        function directorCapabilityVideoModes(capability) {
            const modes = Array.isArray(capability?.video_modes) ? capability.video_modes.map(item => String(item)) : [];
            if (modes.length) return modes;
            const policy = String(capability?.video_policy || 'optional').toLowerCase();
            return policy === 'forbidden' ? ['none'] : ['explicit'];
        }

        function directorAllowsPreviousSegmentVideo(capability) {
            return directorCapabilityVideoModes(capability).includes(previousVideoRef());
        }

        function directorAllowsPreviousSegmentImage(capability) {
            const policy = String(capability?.image_policy || 'optional').toLowerCase();
            if (policy === 'forbidden') return false;
            const modes = Array.isArray(capability?.image_modes)
                ? capability.image_modes.map(item => String(item).toLowerCase())
                : [];
            if (!modes.length) return true;
            return modes.some(mode => ['first_frame', 'first_last', 'ordered_keyframes'].includes(mode));
        }

        function directorCapabilityChainOutput(capability) {
            const value = String(capability?.chain_output || '').trim();
            return value === 'last_result' ? 'last_result' : 'timeline';
        }

        function directorPayloadMediaSource(payload, ref) {
            const mediaSources = payload?.media_sources && typeof payload.media_sources === 'object' ? payload.media_sources : {};
            const source = mediaSources[ref];
            return source && typeof source === 'object' ? source : null;
        }

        function directorMediaSourceHasAsset(source) {
            if (!source) return false;
            const asset = source.asset && typeof source.asset === 'object' ? source.asset : {};
            return !!String(
                asset.data_url
                || asset.src
                || asset.preview_url
                || asset.thumb
                || asset.path
                || asset.output_path
                || asset.original_output_path
                || source.data_url
                || source.src
                || source.path
                || source.output_path
                || source.original_output_path
                || ''
            ).trim();
        }

        function directorPayloadHasMediaAsset(payload, ref) {
            return directorMediaSourceHasAsset(directorPayloadMediaSource(payload, ref));
        }

        function validateDirectorPayloadForPreset(node, payload) {
            const capability = resolveDirectorCapabilityForPreset(node);
            const imagePolicy = String(capability.image_policy || 'optional').toLowerCase();
            const videoPolicy = String(capability.video_policy || 'optional').toLowerCase();
            const minImages = Math.max(0, Number(capability.min_images === undefined ? (imagePolicy === 'required' ? 1 : 0) : capability.min_images));
            const slots = imageRefUploadSlots();
            const maxImages = Math.max(0, Number(capability.max_images === undefined ? (imagePolicy === 'forbidden' ? 0 : slots.length) : capability.max_images));
            const allowPreviousVideo = directorAllowsPreviousSegmentVideo(capability);
            const allowPreviousImage = directorAllowsPreviousSegmentImage(capability);
            const requiresSequentialVideo = !!capability.requires_sequential || directorCapabilityChainOutput(capability) === 'last_result';
            const errors = [];
            const warnings = [];
            const segments = Array.isArray(payload?.segments) ? payload.segments : [];
            segments.forEach((segment, index) => {
                const shotIndex = String(index + 1);
                const rawDuration = directorSegmentRawSeconds(segment, { payload, capability });
                const [minSegmentDuration, maxSegmentDuration] = directorSegmentDurationBounds(capability);
                if (rawDuration < minSegmentDuration - 0.0001) {
                    errors.push(t('Director shot {index} is {duration}s, but this preset requires at least {min}s per shot.', '分镜 {index} 时长为 {duration} 秒，当前 preset 单段至少 {min} 秒。')
                        .replace('{index}', shotIndex)
                        .replace('{duration}', directorCompactSeconds(rawDuration))
                        .replace('{min}', directorCompactSeconds(minSegmentDuration)));
                }
                if (rawDuration > maxSegmentDuration + 0.0001) {
                    errors.push(t('Director shot {index} is {duration}s, but this preset accepts up to {max}s per shot.', '分镜 {index} 时长为 {duration} 秒，当前 preset 单段最多 {max} 秒。')
                        .replace('{index}', shotIndex)
                        .replace('{duration}', directorCompactSeconds(rawDuration))
                        .replace('{max}', directorCompactSeconds(maxSegmentDuration)));
                }
                const refs = directorSegmentMediaRefs(segment, 'images');
                const usesPreviousImage = refs.includes(previousImageRef());
                if (imagePolicy === 'required' && refs.length < minImages) {
                    errors.push(t('Director shot {index} requires a first-frame image.', '分镜 {index} 需要首帧图片。').replace('{index}', shotIndex));
                    return;
                }
                if (maxImages >= 0 && refs.length > maxImages) {
                    errors.push(t('Director shot {index} uses too many image refs.', '分镜 {index} 的图片引用数量超出当前 preset 支持范围。').replace('{index}', shotIndex));
                }
                if (imagePolicy === 'forbidden' && refs.length) {
                    warnings.push(t('Director shot {index} image refs are ignored by this preset.', '当前 preset 不使用分镜 {index} 的图片引用。').replace('{index}', shotIndex));
                }
                if (usesPreviousImage && index === 0) {
                    errors.push(t('Director shot 1 cannot inherit a previous-shot last frame.', '分镜 1 不能继承上一段尾帧。'));
                }
                if (usesPreviousImage && !allowPreviousImage) {
                    errors.push(t('The current preset does not support inheriting the previous-shot last frame.', '当前 preset 不支持继承上一段尾帧。'));
                }
                if (imagePolicy === 'required') {
                    refs.forEach((ref) => {
                        if (ref !== previousImageRef() && !directorPayloadHasMediaAsset(payload, ref)) {
                            errors.push(t('Director shot {index} uses {ref}, but no image source is connected.', '分镜 {index} 选择了 {ref}，但这个素材位没有图片来源。')
                                .replace('{index}', shotIndex)
                                .replace('{ref}', ref));
                        }
                    });
                }
                const videoRef = directorSegmentFirstMediaRef(segment, 'video');
                const usesPreviousVideo = videoRef === previousVideoRef();
                if (videoPolicy === 'required' && !videoRef) {
                    errors.push(t('Director shot {index} requires a source video.', '分镜 {index} 需要源视频。').replace('{index}', shotIndex));
                }
                if (videoPolicy === 'forbidden' && videoRef) {
                    warnings.push(t('Director shot {index} video refs are ignored by this preset.', '当前 preset 不使用分镜 {index} 的视频引用。').replace('{index}', shotIndex));
                }
                if (usesPreviousVideo) {
                    if (index === 0) errors.push(t('Director shot 1 cannot use the previous shot result.', '分镜 1 不能使用上一段结果。'));
                    if (!allowPreviousVideo) errors.push(t('The current preset does not support previous-shot video chaining.', '当前 preset 不支持使用上一段结果作为视频输入。'));
                } else if (requiresSequentialVideo && index > 0 && videoRef) {
                    errors.push(t('Director shot {index} must use the previous shot result for this extend preset.', '当前延长 preset 的分镜 {index} 必须使用上一段结果。').replace('{index}', shotIndex));
                } else if (videoPolicy === 'required' && videoRef && !directorPayloadHasMediaAsset(payload, videoRef)) {
                    errors.push(t('Director shot {index} uses {ref}, but no video source is connected.', '分镜 {index} 选择了 {ref}，但这个素材位没有视频来源。')
                        .replace('{index}', shotIndex)
                        .replace('{ref}', videoRef));
                }
            });
            return { ok: !errors.length, errors, warnings, capability };
        }

        function directorRunContextForPreset(node) {
            if (!node || !['preset', 'classic'].includes(node.type)) return null;
            const project = getProject();
            const edges = project.edges;
            const edge = edges.find(item => item.type === 'text' && item.to === node.id && (item.slot || 'prompt') === 'prompt' && call(nodeSource, 'isDirectorTimelineNode', false, getNode(item.from)) && !call(nodeSource, 'isNodeIgnored', false, getNode(item.from)));
            const director = edge ? getNode(edge.from) : null;
            if (!director) return null;
            const engineType = String(node.runtime?.engine_type || node.schema?.engine_type || '').toLowerCase();
            if (engineType && engineType !== 'video') return null;
            const capability = resolveDirectorCapabilityForPreset(node);
            if (capability.director_supported === false) return null;
            const payload = applyDirectorCapabilityToPayload(directorTimelinePayload(director), capability);
            const segments = Array.isArray(payload?.segments) ? payload.segments.filter(item => item && typeof item === 'object') : [];
            const validation = validateDirectorPayloadForPreset(node, payload);
            return { director, payload, segments, capability, validation };
        }

        function directorRunPlanForPreset(node) {
            const context = directorRunContextForPreset(node);
            if (!context) return null;
            const segments = Array.isArray(context.segments) ? context.segments : [];
            if (segments.length < 2) return null;
            return context;
        }

        return {
            resolveDirectorCapabilityForPreset,
            directorCapabilityChainOutput,
            directorDurationParamValue,
            directorDurationStrategyValue,
            directorAudioOutputValue,
            imageRefUploadSlots: () => imageRefUploadSlots(),
            directorMediaSourceHasAsset,
            directorSegmentPrompt,
            directorSegmentMediaRefs,
            directorSegmentFirstMediaRef,
            directorSegmentUsesPreviousVideo,
            directorSegmentUsesPreviousImage,
            directorCompactSeconds,
            directorSegmentDurationBounds,
            directorSegmentRawSeconds,
            directorSegmentSeconds,
            directorSegmentDurationStrategy,
            directorSegmentGenerationSeconds,
            directorResultDuration,
            directorSegmentTimelineSeconds,
            applyDirectorCapabilityToPayload,
            applyDirectorCapabilityToPayloadForPreset,
            validateDirectorPayloadForPreset,
            directorRunContextForPreset,
            directorRunPlanForPreset
        };
    }

    window.SimpAICanvasWorkbenchDirectorPresetValidation = Object.assign(
        {}, window.SimpAICanvasWorkbenchDirectorPresetValidation || {}, { createCanvasDirectorPresetValidationController }
    );
})();
