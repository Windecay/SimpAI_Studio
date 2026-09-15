(function () {
    'use strict';

    function createCanvasAgentReferencesController(context) {
        const scope = context?.referencesSource || context || {};
        const languageSource = scope.languageSource || {};
        const identitySource = scope.identitySource || {};
        const capacitySource = scope.capacitySource || {};
        const stateSource = scope.stateSource || {};
        const nodeSource = scope.nodeSource || {};
        const assetSource = scope.assetSource || {};
        const targetSource = scope.targetSource || {};
        const selectionSource = scope.selectionSource || {};
        const uiSource = scope.uiSource || {};
        const call = (sourceObject, name, fallback, ...args) => typeof sourceObject[name] === 'function'
            ? sourceObject[name](...args)
            : fallback;
        const t = languageSource.t || ((en, cn) => cn || en);
        const uid = typeof identitySource.uid === 'function' ? identitySource.uid : () => '';
        const maxImageReferences = () => Number(call(capacitySource, 'getMaxImageReferences', 9) || 9);
        const maxExtraImageReferences = () => Number(call(
            capacitySource,
            'getMaxExtraImageReferences',
            Math.max(0, maxImageReferences() - 1)
        ) || Math.max(0, maxImageReferences() - 1));
        const maxVideoReferences = () => Number(call(capacitySource, 'getMaxVideoReferences', 3) || 3);
        const maxAudioReferences = () => Number(call(capacitySource, 'getMaxAudioReferences', 3) || 3);
        const maxTextReferences = () => Number(call(capacitySource, 'getMaxTextReferences', 4) || 4);
        const getAgentState = (...args) => call(stateSource, 'getAgentState', {}, ...args) || {};
        const getNode = (...args) => call(nodeSource, 'getNode', null, ...args);
        const getCanvasAgentReferenceAsset = (...args) => call(assetSource, 'getCanvasAgentReferenceAsset', null, ...args);
        const getCanvasAgentReferenceKind = (...args) => call(assetSource, 'getCanvasAgentReferenceKind', '', ...args);
        const getReferenceAsset = getCanvasAgentReferenceAsset;
        const getReferenceKind = getCanvasAgentReferenceKind;
        const serializeAssetSourceForRun = (...args) => call(assetSource, 'serializeAssetSourceForRun', null, ...args);
        const getNodeTextOutput = (...args) => call(nodeSource, 'getNodeTextOutput', '', ...args);
        const getCanvasAgentShortNodeLabel = (...args) => call(nodeSource, 'canvasAgentShortNodeLabel', '', ...args);
        const assetDisplaySrc = (...args) => call(assetSource, 'assetDisplaySrc', '', ...args);
        const isCanvasAgentMediaReferenceTarget = (...args) => !!call(targetSource, 'isCanvasAgentMediaReferenceTarget', false, ...args);
        const getCanvasAgentTargetMediaKind = (...args) => call(targetSource, 'getCanvasAgentTargetMediaKind', '', ...args);
        const getCanvasAgentTargetNode = (...args) => call(targetSource, 'getCanvasAgentTargetNode', null, ...args);
        const getSelectedNodeIdList = (...args) => call(selectionSource, 'getSelectedNodeIdList', [], ...args) || [];
        const setCanvasAgentMessage = (...args) => call(stateSource, 'setCanvasAgentMessage', null, ...args);
        const showToast = (...args) => call(uiSource, 'showToast', null, ...args);
        const renderCanvasAgentPanel = (...args) => call(uiSource, 'renderCanvasAgentPanel', null, ...args);

        function getReferences() {
            const state = getAgentState();
            if (!Array.isArray(state.references)) state.references = [];
            return state.references;
        }

        function getCanvasAgentVlmReferenceSources(options) {
            const opts = options || {};
            const refs = normalizeCanvasAgentReferences();
            const nodes = [];
            const seen = new Set();
            const descriptorByNode = new Map(
                (Array.isArray(opts.referenceDescriptors) ? opts.referenceDescriptors : [])
                    .filter((item) => item && item.node?.id)
                    .map((item) => [item.node.id, item])
            );
            const addNode = (node, descriptor) => {
                const kind = getReferenceKind(node);
                if (!node || !['image', 'video'].includes(kind)) return;
                if (opts.imagesOnly && kind !== 'image') return;
                const key = canvasAgentReferenceKey(node, kind);
                if (seen.has(key) && !opts.preserveReferenceDuplicates) return;
                if (!opts.preserveReferenceDuplicates) seen.add(key);
                nodes.push({ node, descriptor: descriptor || null });
            };
            if (Array.isArray(opts.referenceEntries)) {
                opts.referenceEntries.forEach((entry) => addNode(entry?.node, entry));
            } else if (Array.isArray(opts.referenceNodes)) {
                opts.referenceNodes.forEach((node) => addNode(node));
            }
            if (opts.includeCanvasAgentReferences !== false) {
                refs.forEach((ref) => addNode(canvasAgentReferenceNode(ref), ref));
            }
            if (opts.fallbackTarget && isCanvasAgentMediaReferenceTarget(opts.fallbackTarget)) {
                addNode(opts.fallbackTarget);
            }
            const defaultLimit = opts.imagesOnly
                ? maxImageReferences()
                : maxImageReferences() + maxVideoReferences();
            const requestedLimit = Math.round(Number(opts.maxSources || defaultLimit));
            const maxSources = Number.isFinite(requestedLimit) && requestedLimit > 0 ? requestedLimit : defaultLimit;
            const selected = nodes.slice(0, maxSources);
            const selectedKeys = new Set(selected.map((entry) => canvasAgentReferenceKey(
                entry?.node,
                getReferenceKind(entry?.node),
            )));
            const required = [];
            if (opts.fallbackTarget && isCanvasAgentMediaReferenceTarget(opts.fallbackTarget)) {
                required.push(opts.fallbackTarget);
            }
            nodes.forEach((entry) => {
                if (getReferenceKind(entry?.node) === 'video') required.push(entry?.node);
            });
            required.forEach((node) => {
                const kind = getReferenceKind(node);
                const key = canvasAgentReferenceKey(node, kind);
                if (!node || selectedKeys.has(key)) return;
                const replaceIndex = [...selected].map((entry, index) => ({ entry, index }))
                    .reverse()
                    .find(({ entry }) => getReferenceKind(entry?.node) !== 'video')?.index;
                if (!Number.isFinite(replaceIndex)) return;
                const replaced = selected[replaceIndex];
                selected[replaceIndex] = { node, descriptor: descriptorByNode.get(node.id) || null };
                selectedKeys.delete(canvasAgentReferenceKey(
                    replaced?.node,
                    getReferenceKind(replaced?.node),
                ));
                selectedKeys.add(key);
            });
            return selected.map((entry) => {
                const node = entry?.node;
                const serialized = serializeAssetSourceForRun(node);
                const descriptor = entry?.descriptor || descriptorByNode.get(node?.id);
                if (!serialized || !descriptor) return serialized;
                return Object.assign(serialized, {
                    reference_token: descriptor.token || '',
                    reference_slot: descriptor.slot || '',
                    reference_role: descriptor.role || '',
                });
            }).filter(Boolean).slice(0, maxSources);
        }

        function canvasAgentReferenceSummaryText() {
            const refs = normalizeCanvasAgentReferences();
            if (!refs.length) return 'No explicit references.';
            return refs.map((ref, index) => {
                const meta = ref.meta || {};
                const bits = [
                    `#${index + 1}`,
                    ref.role,
                    ref.kind,
                    ref.label,
                    meta.width && meta.height ? `${meta.width}x${meta.height}` : '',
                    meta.duration ? `${meta.duration}s` : '',
                    meta.fps ? `${meta.fps}fps` : '',
                    meta.excerpt ? `text="${meta.excerpt}"` : ''
                ].filter(Boolean);
                return bits.join(' / ');
            }).join('\n');
        }

        function canvasAgentReferenceFacts() {
            const counts = canvasAgentReferenceCounts();
            return [
                counts.images ? { label: t('Images', '图片'), value: `${counts.hasPrimaryImage ? 1 : 0} ${t('main', '主图')} + ${counts.imageReferences} ${t('ref', '参考')}` } : null,
                counts.videos ? { label: t('Video', '视频'), value: String(counts.videos) } : null,
                counts.audio ? { label: t('Audio', '音频'), value: String(counts.audio) } : null,
                counts.texts ? { label: t('Text refs', '文本引用'), value: String(counts.texts) } : null
            ].filter(Boolean);
        }

        function canvasAgentReferenceIcon(kind) {
            if (kind === 'video') return 'fa-film';
            if (kind === 'audio') return 'fa-wave-square';
            if (kind === 'text') return 'fa-align-left';
            return 'fa-image';
        }

        function canvasAgentReferenceKey(node, kind) {
            const asset = getReferenceAsset(node);
            return [
                node?.id || '',
                kind || '',
                node?.type === 'result' ? node.selected_asset_index || 0 : '',
                asset?.asset_id || asset?.path || asset?.output_path || asset?.preview_url || ''
            ].join(':');
        }

        function normalizeCanvasAgentReferences() {
            const seen = new Set();
            const next = [];
            getReferences().forEach((ref) => {
                const node = getNode(ref?.nodeId);
                if (!node || !isCanvasAgentMediaReferenceTarget(node)) return;
                const kind = getReferenceKind(node);
                if (!kind) return;
                const key = canvasAgentReferenceKey(node, kind);
                if (seen.has(key)) return;
                seen.add(key);
                next.push(Object.assign({}, ref, {
                    id: ref.id || uid('agent_ref'),
                    key,
                    kind,
                    nodeId: node.id,
                    label: ref.label || getCanvasAgentShortNodeLabel(node),
                    role: ref.role || (kind === 'text' ? 'prompt' : 'reference')
                }));
            });
            let primaryImageSeen = false;
            let imageReferenceCount = 0;
            let videoCount = 0;
            let audioCount = 0;
            let textCount = 0;
            const state = getAgentState();
            state.references = next.filter((ref) => {
                if (ref.kind === 'image') {
                    if (ref.role === 'primary' && !primaryImageSeen) {
                        primaryImageSeen = true;
                        return true;
                    }
                    if (imageReferenceCount >= maxExtraImageReferences()) return false;
                    ref.role = 'reference';
                    imageReferenceCount += 1;
                    return true;
                }
                if (ref.kind === 'video') {
                    videoCount += 1;
                    ref.role = 'reference';
                    return videoCount <= maxVideoReferences();
                }
                if (ref.kind === 'audio') {
                    audioCount += 1;
                    ref.role = 'audio';
                    return audioCount <= maxAudioReferences();
                }
                if (ref.kind === 'text') {
                    textCount += 1;
                    ref.role = 'prompt';
                    return textCount <= maxTextReferences();
                }
                return false;
            });
            if (!state.references.some(ref => ref.kind === 'image' && ref.role === 'primary')) {
                const firstImage = state.references.find(ref => ref.kind === 'image');
                if (firstImage) firstImage.role = 'primary';
            }
            return state.references;
        }

        function canvasAgentReferenceCounts() {
            const refs = normalizeCanvasAgentReferences();
            return {
                images: refs.filter(ref => ref.kind === 'image').length,
                imageReferences: refs.filter(ref => ref.kind === 'image' && ref.role !== 'primary').length,
                videos: refs.filter(ref => ref.kind === 'video').length,
                audio: refs.filter(ref => ref.kind === 'audio').length,
                texts: refs.filter(ref => ref.kind === 'text').length,
                hasPrimaryImage: refs.some(ref => ref.kind === 'image' && ref.role === 'primary')
            };
        }

        function createCanvasAgentReferenceFromNode(node, role) {
            const kind = getReferenceKind(node);
            if (!kind) return null;
            const asset = getReferenceAsset(node);
            const label = getCanvasAgentShortNodeLabel(node);
            const textValue = kind === 'text' ? String(getNodeTextOutput(node) || '').trim() : '';
            const meta = kind === 'text' ? {
                chars: textValue.length,
                excerpt: textValue.slice(0, 360)
            } : (asset ? {
                width: asset.width || null,
                height: asset.height || null,
                duration: asset.duration || null,
                fps: asset.fps || null,
                frameCount: asset.frame_count || null,
                sampleRate: asset.sample_rate || null,
                channels: asset.channels || null
            } : {});
            return {
                id: uid('agent_ref'),
                key: canvasAgentReferenceKey(node, kind),
                nodeId: node.id,
                kind,
                role: role || (kind === 'text' ? 'prompt' : 'reference'),
                label,
                thumb: assetDisplaySrc(asset) || asset?.thumb || '',
                meta
            };
        }

        function addCanvasAgentReferenceFromNode(node, options) {
            const opts = options || {};
            if (!isCanvasAgentMediaReferenceTarget(node)) {
                if (!opts.silent) showToast(t('Select an image, result, video, audio, or Text node as reference.', '请选择图片、结果、视频、音频或 Text 节点作为引用。'));
                return false;
            }
            const kind = getReferenceKind(node);
            const counts = canvasAgentReferenceCounts();
            const key = canvasAgentReferenceKey(node, kind);
            const state = getAgentState();
            if (state.references.some(ref => ref.key === key)) {
                if (!opts.silent) showToast(t('Reference is already added.', '该引用已添加。'));
                return false;
            }
            let role = opts.role || '';
            if (kind === 'image') {
                if (counts.images >= maxImageReferences()) {
                    if (!opts.silent) showToast(t(
                        'Agent references support at most {count} images.',
                        'Agent 引用最多支持 {count} 张图片。'
                    ).replace('{count}', maxImageReferences()));
                    return false;
                }
                role = role || (counts.hasPrimaryImage ? 'reference' : 'primary');
                if (role !== 'primary' && counts.imageReferences >= maxExtraImageReferences()) {
                    if (!opts.silent) showToast(t(
                        'Only {count} extra image references are supported.',
                        '额外图片参考最多 {count} 张。'
                    ).replace('{count}', maxExtraImageReferences()));
                    return false;
                }
            } else if (kind === 'video') {
                if (counts.videos >= maxVideoReferences()) {
                    if (!opts.silent) showToast(t(
                        'Only {count} video references are supported.',
                        '最多支持 {count} 个视频引用。'
                    ).replace('{count}', maxVideoReferences()));
                    return false;
                }
                role = 'reference';
            } else if (kind === 'audio') {
                if (counts.audio >= maxAudioReferences()) {
                    if (!opts.silent) showToast(t(
                        'Only {count} audio references are supported.',
                        '最多支持 {count} 个音频引用。'
                    ).replace('{count}', maxAudioReferences()));
                    return false;
                }
                role = 'audio';
            } else if (kind === 'text') {
                if (counts.texts >= maxTextReferences()) {
                    if (!opts.silent) showToast(t('Too many Text references.', 'Text 引用过多。'));
                    return false;
                }
                role = 'prompt';
            }
            const ref = createCanvasAgentReferenceFromNode(node, role);
            if (!ref) return false;
            state.references.push(ref);
            normalizeCanvasAgentReferences();
            if (!opts.silent) {
                setCanvasAgentMessage(t('Reference added: {label}', '已添加引用：{label}').replace('{label}', ref.label));
                renderCanvasAgentPanel();
            }
            return true;
        }

        function addSelectedCanvasAgentReferences() {
            const selectedIds = getSelectedNodeIdList();
            const nodes = (Array.isArray(selectedIds) ? selectedIds : []).map(id => getNode(id)).filter(Boolean);
            const target = getCanvasAgentTargetNode();
            const list = nodes.length ? nodes : [target].filter(Boolean);
            let added = 0;
            list.forEach((node) => {
                if (addCanvasAgentReferenceFromNode(node, { silent: true })) added += 1;
            });
            if (!added && !list.length) showToast(t('No selected reference node.', '当前没有选中的引用节点。'));
            else if (!added) showToast(t('No new references were added. They may already be present or over the limit.', '没有添加新的引用，可能已存在或已达到上限。'));
            else if (added) setCanvasAgentMessage(t('Added {count} reference(s).', '已添加 {count} 个引用。').replace('{count}', added));
            renderCanvasAgentPanel();
        }

        function removeCanvasAgentReference(index) {
            normalizeCanvasAgentReferences();
            const idx = Number(index);
            const refs = getReferences();
            if (!Number.isFinite(idx) || idx < 0 || idx >= refs.length) return;
            refs.splice(idx, 1);
            normalizeCanvasAgentReferences();
            renderCanvasAgentPanel();
        }

        function promoteCanvasAgentReference(index) {
            normalizeCanvasAgentReferences();
            const idx = Number(index);
            const refs = getReferences();
            const ref = refs[idx];
            if (!ref || ref.kind !== 'image') return;
            refs.forEach(item => {
                if (item.kind === 'image') item.role = item === ref ? 'primary' : 'reference';
            });
            renderCanvasAgentPanel();
        }

        function canvasAgentReferenceNode(ref) {
            return getNode(ref?.nodeId);
        }

        function getCanvasAgentPrimaryImageReference() {
            return normalizeCanvasAgentReferences().find(ref => ref.kind === 'image' && ref.role === 'primary') || null;
        }

        function getCanvasAgentPrimaryReferenceByKind(kind) {
            const cleanKind = String(kind || '').trim().toLowerCase();
            if (!cleanKind) return null;
            return normalizeCanvasAgentReferences().find(ref => ref.kind === cleanKind) || null;
        }

        function getCanvasAgentPrimaryMediaNode(kind, options) {
            const opts = options || {};
            const cleanKind = String(kind || '').trim().toLowerCase();
            if (!cleanKind) return null;
            const explicitNode = getNode(opts.targetNodeId || '');
            if (explicitNode && getCanvasAgentTargetMediaKind(explicitNode) === cleanKind) return explicitNode;
            const refNode = canvasAgentReferenceNode(getCanvasAgentPrimaryReferenceByKind(cleanKind));
            if (refNode && getCanvasAgentTargetMediaKind(refNode) === cleanKind) return refNode;
            const target = getCanvasAgentTargetNode();
            return getCanvasAgentTargetMediaKind(target) === cleanKind ? target : null;
        }

        function getCanvasAgentExtraImageReferences() {
            return normalizeCanvasAgentReferences()
                .filter(ref => ref.kind === 'image' && ref.role !== 'primary')
                .slice(0, maxExtraImageReferences());
        }

        function canvasAgentMediaReferenceLimit(kind) {
            if (kind === 'video') return maxVideoReferences();
            if (kind === 'audio') return maxAudioReferences();
            return maxImageReferences();
        }

        function getCanvasAgentMediaReferenceNodes(primaryNodes) {
            const primary = primaryNodes && typeof primaryNodes === 'object' ? primaryNodes : {};
            const grouped = { image: [], video: [], audio: [] };
            const seen = new Set();
            const add = (kind, node) => {
                if (!grouped[kind] || !node || getCanvasAgentTargetMediaKind(node) !== kind) return;
                const key = canvasAgentReferenceKey(node, kind);
                if (!key || seen.has(key) || grouped[kind].length >= canvasAgentMediaReferenceLimit(kind)) return;
                seen.add(key);
                grouped[kind].push(node);
            };
            ['image', 'video', 'audio'].forEach((kind) => add(kind, primary[kind]));
            normalizeCanvasAgentReferences().forEach((ref) => {
                if (!grouped[ref.kind]) return;
                add(ref.kind, canvasAgentReferenceNode(ref));
            });
            return grouped;
        }

        function canvasAgentMediaNodeCounts(grouped) {
            const source = grouped && typeof grouped === 'object' ? grouped : {};
            return {
                image: Array.isArray(source.image) ? source.image.length : 0,
                video: Array.isArray(source.video) ? source.video.length : 0,
                audio: Array.isArray(source.audio) ? source.audio.length : 0
            };
        }

        function canvasAgentVideoTaskForMedia(counts) {
            const media = counts && typeof counts === 'object' ? counts : {};
            if (Number(media.video) > 0) return 'video_audio_to_video';
            if (Number(media.audio) > 0 && Number(media.image) > 0) return 'image_audio_to_video';
            if (Number(media.audio) > 0) return 'audio_to_video';
            if (Number(media.image) > 1) return 'multi_image_to_video';
            if (Number(media.image) > 0) return 'image_to_video';
            return 'text_to_video';
        }

        function canvasAgentVideoTaskLabel(task) {
            const labels = {
                image_to_video: t('Image-to-video', '图生视频'),
                multi_image_to_video: t('Multi-image to video', '多图生成视频'),
                audio_to_video: t('Audio-to-video', '音频生成视频'),
                image_audio_to_video: t('Image + audio to video', '图像和音频生成视频'),
                video_audio_to_video: t('Mixed references to video', '混合参考生成视频'),
                text_to_video: t('Text-to-video', '文生视频')
            };
            return labels[String(task || '')] || labels.text_to_video;
        }

        function canvasAgentMediaNodeFacts(grouped) {
            const counts = canvasAgentMediaNodeCounts(grouped);
            return [
                counts.image ? { label: t('Images', '图片'), value: String(counts.image) } : null,
                counts.video ? { label: t('Videos', '视频'), value: String(counts.video) } : null,
                counts.audio ? { label: t('Audio clips', '音频'), value: String(counts.audio) } : null
            ].filter(Boolean);
        }

        return {
            canvasAgentReferenceIcon,
            canvasAgentReferenceKey,
            getCanvasAgentVlmReferenceSources,
            canvasAgentReferenceSummaryText,
            canvasAgentReferenceFacts,
            normalizeCanvasAgentReferences,
            canvasAgentReferenceCounts,
            createCanvasAgentReferenceFromNode,
            addCanvasAgentReferenceFromNode,
            addSelectedCanvasAgentReferences,
            removeCanvasAgentReference,
            promoteCanvasAgentReference,
            canvasAgentReferenceNode,
            getCanvasAgentPrimaryImageReference,
            getCanvasAgentPrimaryReferenceByKind,
            getCanvasAgentPrimaryMediaNode,
            getCanvasAgentExtraImageReferences,
            canvasAgentMediaReferenceLimit,
            getCanvasAgentMediaReferenceNodes,
            canvasAgentMediaNodeCounts,
            canvasAgentVideoTaskForMedia,
            canvasAgentVideoTaskLabel,
            canvasAgentMediaNodeFacts
        };
    }

    window.SimpAICanvasWorkbenchCanvasAgentReferences = Object.assign({}, window.SimpAICanvasWorkbenchCanvasAgentReferences || {}, {
        createCanvasAgentReferencesController
    });
})();
