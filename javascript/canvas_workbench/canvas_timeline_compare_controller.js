(function () {
    'use strict';

    function createCanvasTimelineCompareController(context) {
        const scope = context?.timelineCompareSource || context || {};
        const projectSource = scope.projectSource || {};
        const interactionSource = scope.interactionSource || {};
        const languageSource = scope.languageSource || {};
        const layoutSource = scope.layoutSource || {};
        const selectionSource = scope.selectionSource || {};
        const stateSource = scope.stateSource || {};
        const timeSource = scope.timeSource || {};
        const renderSource = scope.renderSource || {};
        const frameSource = scope.frameSource || {};
        const backendSource = scope.backendSource || {};
        const mediaSource = scope.mediaSource || {};
        const resultSource = scope.resultSource || {};
        const uiSource = scope.uiSource || {};
        const activeComparisons = new WeakMap();
        const callbackSources = {
            getProject: projectSource,
            getProjectId: projectSource,
            buildProjectNodeAppendPatch: projectSource,
            clamp: interactionSource,
            defaultNodeSize: layoutSource,
            placeNodeAvoidingOverlap: layoutSource,
            setSelectedNodeId: selectionSource,
            setSelectedNodeIds: selectionSource,
            setSelectedEdgeId: selectionSource,
            mutate: stateSource,
            nowIso: timeSource,
            normalizeTimelineNode: renderSource,
            serializeTimelineRenderPayload: renderSource,
            buildTimelineResultPatch: renderSource,
            buildTimelineDebugPatch: renderSource,
            sendCanvasRenderTimelineFrameRequest: backendSource,
            assetDisplaySrc: mediaSource,
            buildTimelineCompareResultNode: resultSource,
            buildTimelineCompareAsset: resultSource,
            showToast: uiSource
        };
        const call = (name, fallback, ...args) => {
            const sourceObject = callbackSources[name] || {};
            return typeof sourceObject[name] === 'function' ? sourceObject[name](...args) : fallback;
        };
        const t = typeof languageSource.t === 'function' ? languageSource.t : ((en) => en);
        const clamp = typeof interactionSource.clamp === 'function'
            ? interactionSource.clamp
            : (value, min, max) => Math.max(min, Math.min(max, value));
        const getProject = () => call('getProject', {}, []) || {};
        const getProjectId = () => call('getProjectId', 'default');
        const serializeTimelineRenderPayload = (node) => call('serializeTimelineRenderPayload', {}, node) || {};
        const renderTimelinePreviewFrameDataUrl = (...args) => typeof frameSource.renderTimelinePreviewFrameDataUrl === 'function'
            ? frameSource.renderTimelinePreviewFrameDataUrl(...args)
            : '';
        const getActiveTimelineVisualClips = (node) => typeof frameSource.getActiveTimelineVisualClips === 'function'
            ? (frameSource.getActiveTimelineVisualClips(node) || [])
            : [];
        const compareTimelineFrameImages = (...args) => {
            if (typeof frameSource.compareTimelineFrameImages === 'function') return frameSource.compareTimelineFrameImages(...args);
            return Promise.reject(new Error('timeline frame compare helper unavailable'));
        };
        const sendCanvasRenderTimelineFrameRequest = (...args) => call('sendCanvasRenderTimelineFrameRequest', null, ...args);
        const assetDisplaySrc = (asset) => call('assetDisplaySrc', '', asset) || '';
        const buildTimelineCompareResultNode = (options) => call('buildTimelineCompareResultNode', null, options);
        const buildProjectNodeAppendPatch = (project, node) => call(
            'buildProjectNodeAppendPatch',
            { nodes: [...(Array.isArray(project?.nodes) ? project.nodes : []), node] },
            project,
            node
        ) || { nodes: [...(Array.isArray(project?.nodes) ? project.nodes : []), node] };
        const buildTimelineResultPatch = (resultNode, options) => {
            const config = options || {};
            const fallback = {};
            if (config.size && typeof config.size === 'object') {
                if (config.size.w !== undefined) fallback.w = config.size.w;
                if (config.size.h !== undefined) fallback.h = config.size.h;
            }
            if (Object.prototype.hasOwnProperty.call(config, 'producerPatch')) {
                fallback.producer = Object.assign({}, resultNode?.producer || {}, config.producerPatch || {});
            }
            if (Object.prototype.hasOwnProperty.call(config, 'statusPatch')) {
                fallback.status = Object.assign({}, resultNode?.status || {}, config.statusPatch || {});
            }
            if (Object.prototype.hasOwnProperty.call(config, 'source')) {
                fallback.source = config.source;
            } else if (Object.prototype.hasOwnProperty.call(config, 'sourcePatch')) {
                fallback.source = Object.assign({}, resultNode?.source || {}, config.sourcePatch || {});
            }
            if (Object.prototype.hasOwnProperty.call(config, 'preview')) fallback.preview = config.preview;
            if (Object.prototype.hasOwnProperty.call(config, 'asset')) fallback.asset = config.asset;
            if (Object.prototype.hasOwnProperty.call(config, 'assets')) fallback.assets = config.assets;
            if (config.selectedAssetIndex !== undefined) fallback.selected_asset_index = config.selectedAssetIndex;
            if (Object.prototype.hasOwnProperty.call(config, 'errorDetails')) fallback.error_details = config.errorDetails;
            return call('buildTimelineResultPatch', fallback, resultNode, options) || fallback;
        };
        const buildTimelineCompareAsset = (options) => call('buildTimelineCompareAsset', null, options);
        const buildTimelineDebugPatch = (timeline, debugPatch) => call(
            'buildTimelineDebugPatch',
            {
                timeline_debug: Object.assign({}, timeline?.timeline_debug || {}, debugPatch || {})
            },
            timeline,
            debugPatch
        ) || {
            timeline_debug: Object.assign({}, timeline?.timeline_debug || {}, debugPatch || {})
        };
        const nowIso = (...args) => call('nowIso', '', ...args);

        function snapshotCompareValue(value, seen = new WeakMap()) {
            if (!value || typeof value !== 'object') return value;
            if (seen.has(value)) return seen.get(value);
            const snapshot = Array.isArray(value) ? [] : {};
            seen.set(value, snapshot);
            Object.keys(value).forEach(key => { snapshot[key] = snapshotCompareValue(value[key], seen); });
            return snapshot;
        }

        function sameCompareValue(snapshot, value, seen = new WeakMap()) {
            if (Object.is(snapshot, value)) return true;
            if (!snapshot || !value || typeof snapshot !== 'object' || typeof value !== 'object'
                || Array.isArray(snapshot) !== Array.isArray(value)) return false;
            if (seen.get(snapshot) === value) return true;
            seen.set(snapshot, value);
            const keys = Object.keys(snapshot);
            return keys.length === Object.keys(value).length
                && keys.every(key => Object.prototype.hasOwnProperty.call(value, key)
                    && sameCompareValue(snapshot[key], value[key], seen));
        }

        function compareMediaState(node) {
            return {
                type: node?.type,
                asset: node?.asset,
                assets: node?.assets,
                source: node?.source,
                preview: node?.preview,
                selected_asset_index: node?.selected_asset_index
            };
        }

        function findOrCreateTimelineCompareResultNode(timelineNode) {
            if (!timelineNode || timelineNode.type !== 'timeline') return null;
            const project = getProject();
            const nodes = Array.isArray(project.nodes) ? project.nodes : [];
            const existing = nodes.find(node => node.type === 'result'
                && node.source?.kind === 'timeline_frame_compare'
                && node.source?.timeline_node_id === timelineNode.id);
            if (existing) return existing;
            const size = call('defaultNodeSize', { w: 440, h: 390 }, 'result') || { w: 440, h: 390 };
            const world = {
                x: Math.round((timelineNode.x || 0) + (timelineNode.w || 760) + 80),
                y: Math.round((timelineNode.y || 0) + 340)
            };
            const result = buildTimelineCompareResultNode({
                position: world,
                size,
                title: `${timelineNode.title || 'Timeline'} ${t('Frame Compare', '帧对比')}`,
                status: {
                    state: 'debug',
                    queue_position: null,
                    step: 0,
                    total_steps: 0,
                    percent: 1,
                    message: t('Timeline current-frame comparison: Frontend / Backend / Diff.', 'Timeline 当前帧对比：Frontend / Backend / Diff。')
                },
                selectedAssetIndex: 0,
                source: { kind: 'timeline_frame_compare', timeline_node_id: timelineNode.id }
            });
            if (!result) return null;
            Object.assign(result, buildTimelineResultPatch(result, {
                size: {
                    w: Math.max(Number(result.w || 0), 340),
                    h: Math.max(Number(result.h || 0), 330)
                }
            }));
            call('placeNodeAvoidingOverlap', undefined, result, world);
            Object.assign(project, buildProjectNodeAppendPatch(project, result));
            return result;
        }

        function timelineCompareSafeLabel(value) {
            return String(value || 'item')
                .replace(/[^a-z0-9_-]+/gi, '_')
                .replace(/^_+|_+$/g, '')
                .slice(0, 48) || 'item';
        }

        function timelineCompareBackendSrc(result) {
            return assetDisplaySrc(result?.asset_ref || {}) || result?.preview_url || result?.data_url || '';
        }

        function cloneTimelinePayloadForClip(payload, clipId) {
            let next = {};
            try {
                next = JSON.parse(JSON.stringify(payload || {}));
            } catch (err) {
                next = Object.assign({}, payload || {});
            }
            next.layers = Array.isArray(next.layers) ? next.layers.filter(layer => layer?.clip_id === clipId) : [];
            next.audio = [];
            return next;
        }

        function cloneTimelinePayloadForClipGeometry(payload, clipId) {
            const next = cloneTimelinePayloadForClip(payload, clipId);
            next.layers = Array.isArray(next.layers) ? next.layers.map(layer => Object.assign({}, layer, {
                debug_geometry: true,
                transform: Object.assign({}, layer.transform || {}, { opacity: 1 }),
                mask: null
            })) : [];
            return next;
        }

        function publishTimelineFrameCompareResult(timelineNode, compareItems) {
            const result = findOrCreateTimelineCompareResultNode(timelineNode);
            if (!result) return;
            const items = Array.isArray(compareItems) ? compareItems.filter(item => item?.diff) : [];
            const overall = items.find(item => item.kind === 'overall') || items[0];
            if (!overall) return;
            const width = overall.diff.width;
            const height = overall.diff.height;
            const stamp = Math.round(Number(timelineNode.params?.playhead || 0) * 1000);
            const assets = [];
            items.forEach((item) => {
                const label = timelineCompareSafeLabel(item.label || item.clip_id || item.kind || 'overall');
                assets.push(buildTimelineCompareAsset({
                    kind: item.kind === 'overall' ? 'timeline_compare_frontend' : 'timeline_compare_layer_frontend',
                    name: `${timelineNode.id}.${label}.frontend.${stamp}.png`,
                    mime: 'image/png',
                    width: item.diff.width,
                    height: item.diff.height,
                    dataUrl: item.frontend_data_url || '',
                    thumb: item.frontend_data_url || ''
                }));
                assets.push(buildTimelineCompareAsset({
                    assetRef: item.backend_result?.asset_ref || null,
                    kind: item.kind === 'overall' ? 'timeline_compare_backend' : 'timeline_compare_layer_backend',
                    name: item.backend_result?.asset_ref?.name || `${timelineNode.id}.${label}.backend.${stamp}.png`,
                    width: item.diff.width,
                    height: item.diff.height,
                    thumb: item.backend_result?.asset_ref?.thumb || item.backend_result?.asset_ref?.preview_url || ''
                }));
                assets.push(buildTimelineCompareAsset({
                    kind: item.kind === 'overall' ? 'timeline_compare_diff' : 'timeline_compare_layer_diff',
                    name: `${timelineNode.id}.${label}.diff.${stamp}.png`,
                    mime: 'image/png',
                    width: item.diff.width,
                    height: item.diff.height,
                    dataUrl: item.diff.diff_data_url || '',
                    thumb: item.diff.diff_data_url || ''
                }));
            });
            const nextAssets = assets.filter(asset => asset && (asset.data_url || asset.preview_url || asset.path));
            const nextAsset = nextAssets[2] || nextAssets[0] || null;
            const nextPreview = nextAsset
                ? {
                    kind: nextAsset.kind,
                    data_url: nextAsset.data_url || '',
                    thumb: nextAsset.thumb || nextAsset.preview_url || '',
                    width,
                    height
                }
                : null;
            const nextSelectedAssetIndex = Math.min(2, Math.max(0, nextAssets.length - 1));
            const layerItems = items.filter(item => item.kind === 'layer');
            const worstLayer = layerItems.slice().sort((a, b) => Number(b.diff.changed_percent_by_threshold?.['30'] || 0)
                - Number(a.diff.changed_percent_by_threshold?.['30'] || 0))[0];
            const boundsDelta = overall.diff.bounds?.backend_minus_frontend;
            const boundsText = boundsDelta
                ? ` / bbox dx ${boundsDelta.dx} dy ${boundsDelta.dy} dw ${boundsDelta.dw} dh ${boundsDelta.dh}`
                : '';
            const statusPatch = {
                state: 'debug',
                percent: 1,
                message: 'Frame diff mean ' + overall.diff.mean_abs
                    + ' / max ' + overall.diff.max_abs
                    + ' / @10 ' + overall.diff.changed_percent + '%'
                    + ' / @30 ' + (overall.diff.changed_percent_by_threshold?.['30'] ?? '-') + '%'
                    + boundsText
                    + (worstLayer
                        ? ' / worst ' + worstLayer.label + ' @30 ' + (worstLayer.diff.changed_percent_by_threshold?.['30'] ?? '-') + '%'
                        : '')
            };
            const sourcePatch = {
                kind: 'timeline_frame_compare',
                timeline_node_id: timelineNode.id,
                playhead: Number(timelineNode.params?.playhead || 0),
                diff: Object.assign({}, overall.diff, { diff_data_url: '' }),
                backend_asset: overall.backend_result?.asset_ref || null,
                layers: layerItems.map(item => ({
                    clip_id: item.clip_id,
                    label: item.label,
                    diff: Object.assign({}, item.diff, { diff_data_url: '' }),
                    geometry_diff: item.geometry_diff ? Object.assign({}, item.geometry_diff, { diff_data_url: '' }) : null,
                        backend_asset: item.backend_result?.asset_ref || null
                    }))
            };
            Object.assign(result, buildTimelineResultPatch(result, {
                assets: nextAssets,
                asset: nextAsset,
                preview: nextPreview,
                selectedAssetIndex: nextSelectedAssetIndex,
                statusPatch,
                sourcePatch
            }));
            call('setSelectedNodeId', undefined, result.id);
            call('setSelectedNodeIds', undefined, [result.id]);
            call('setSelectedEdgeId', undefined, null);
        }

        async function compareTimelineFrameWithBackend(node, options) {
            if (!node || node.type !== 'timeline') return;
            call('normalizeTimelineNode', undefined, node);
            const project = getProject();
            const projectId = getProjectId();
            if (!Array.isArray(project.nodes) || !project.nodes.includes(node)) return;
            const payload = serializeTimelineRenderPayload(node);
            // Media strings remain shared values; checking inputs never serializes large data URLs again.
            const inputState = () => ({ params: node.params, tracks: node.tracks, clips: node.clips });
            const inputSnapshot = snapshotCompareValue(inputState());
            const sourceIds = new Set((node.clips || []).map(clip => clip.source_node_id).filter(Boolean));
            const sources = Array.from(sourceIds, id => {
                const source = project.nodes.find(item => item.id === id);
                return { id, source, snapshot: snapshotCompareValue(compareMediaState(source)) };
            });
            const findResult = () => project.nodes.find(item => item.type === 'result'
                && item.source?.kind === 'timeline_frame_compare' && item.source?.timeline_node_id === node.id);
            const initialResult = findResult();
            const resultSnapshot = snapshotCompareValue(compareMediaState(initialResult));
            const comparison = {};
            activeComparisons.set(node, comparison);
            const isCurrent = () => getProject() === project && getProjectId() === projectId
                && project.nodes.includes(node) && project.nodes.find(item => item.id === node.id) === node
                && activeComparisons.get(node) === comparison
                && (typeof uiSource.isWorkbenchOpen !== 'function' || uiSource.isWorkbenchOpen())
                && (typeof options?.shouldContinue !== 'function' || options.shouldContinue())
                && sameCompareValue(inputSnapshot, inputState())
                && sources.every(item => project.nodes.find(source => source.id === item.id) === item.source
                    && sameCompareValue(item.snapshot, compareMediaState(item.source)))
                && findResult() === initialResult && sameCompareValue(resultSnapshot, compareMediaState(initialResult));
            if (!isCurrent()) return;
            const width = Math.max(16, Math.round(Number(node.params?.width || 1280)));
            const height = Math.max(16, Math.round(Number(node.params?.height || 720)));
            const playhead = clamp(Number(node.params?.playhead || 0), 0, Math.max(1, Number(node.params?.duration || 1)));
            call('showToast', undefined, t('Comparing current Timeline frame...', '正在对比 Timeline 当前帧...'));
            let frontendDataUrl = '';
            let backendResult = null;
            try {
                frontendDataUrl = await renderTimelinePreviewFrameDataUrl(node, { payload });
                if (!isCurrent()) return;
                if (!frontendDataUrl) throw new Error('frontend frame export failed');
                backendResult = await sendCanvasRenderTimelineFrameRequest({
                    project_id: projectId,
                    node_id: node.id,
                    timeline_node_id: node.id,
                    time: playhead,
                    payload
                });
                if (!isCurrent()) return;
                if (!backendResult?.ok) throw new Error(backendResult?.error || 'backend frame render failed');
                const backendSrc = timelineCompareBackendSrc(backendResult);
                if (!backendSrc) throw new Error('backend frame source missing');
                const compareOptions = { background: node.params?.background || '#000000' };
                const diff = await compareTimelineFrameImages(frontendDataUrl, backendSrc, width, height, compareOptions);
                if (!isCurrent()) return;
                const compareItems = [{
                    kind: 'overall',
                    label: 'overall',
                    frontend_data_url: frontendDataUrl,
                    backend_result: backendResult,
                    diff
                }];
                const activeClips = getActiveTimelineVisualClips(node);
                if (activeClips.length) {
                    call('showToast', undefined, t('Comparing {count} media layer(s)...', '正在分层对比 {count} 个素材...').replace('{count}', activeClips.length));
                }
                for (const clip of activeClips) {
                    const layerPayload = cloneTimelinePayloadForClip(payload, clip.id);
                    if (!Array.isArray(layerPayload.layers) || !layerPayload.layers.length) continue;
                    const layerFrontendDataUrl = await renderTimelinePreviewFrameDataUrl(node, {
                        onlyClipId: clip.id,
                        payload: layerPayload
                    });
                    if (!isCurrent()) return;
                    if (!layerFrontendDataUrl) continue;
                    const layerBackendResult = await sendCanvasRenderTimelineFrameRequest({
                        project_id: projectId,
                        node_id: node.id,
                        timeline_node_id: node.id,
                        time: playhead,
                        payload: layerPayload
                    });
                    if (!isCurrent()) return;
                    if (!layerBackendResult?.ok) {
                        console.warn('[SimpAI Canvas] timeline layer frame compare backend failed', clip.id, layerBackendResult);
                        continue;
                    }
                    const layerBackendSrc = timelineCompareBackendSrc(layerBackendResult);
                    if (!layerBackendSrc) continue;
                    const layerDiff = await compareTimelineFrameImages(layerFrontendDataUrl, layerBackendSrc, width, height, compareOptions);
                    if (!isCurrent()) return;
                    let geometryDiff = null;
                    let geometryBackendResult = null;
                    try {
                        const geometryPayload = cloneTimelinePayloadForClipGeometry(payload, clip.id);
                        const geometryFrontendDataUrl = await renderTimelinePreviewFrameDataUrl(node, {
                            onlyClipId: clip.id,
                            geometryProbe: true,
                            payload: geometryPayload
                        });
                        if (!isCurrent()) return;
                        geometryBackendResult = await sendCanvasRenderTimelineFrameRequest({
                            project_id: projectId,
                            node_id: node.id,
                            timeline_node_id: node.id,
                            time: playhead,
                            payload: geometryPayload
                        });
                        if (!isCurrent()) return;
                        const geometryBackendSrc = timelineCompareBackendSrc(geometryBackendResult);
                        if (geometryFrontendDataUrl && geometryBackendSrc) {
                            geometryDiff = await compareTimelineFrameImages(
                                geometryFrontendDataUrl,
                                geometryBackendSrc,
                                width,
                                height,
                                Object.assign({}, compareOptions, { boundsThreshold: 1 })
                            );
                            if (!isCurrent()) return;
                        }
                    } catch (err) {
                        if (!isCurrent()) return;
                        console.warn('[SimpAI Canvas] timeline layer geometry probe failed', clip.id, err, geometryBackendResult);
                    }
                    compareItems.push({
                        kind: 'layer',
                        clip_id: clip.id,
                        label: clip.title || clip.id,
                        frontend_data_url: layerFrontendDataUrl,
                        backend_result: layerBackendResult,
                        diff: layerDiff,
                        geometry_diff: geometryDiff
                    });
                }
                if (!isCurrent()) return;
                publishTimelineFrameCompareResult(node, compareItems);
                const frameCompareDebug = {
                    frame_compare: {
                        checked_at: nowIso(),
                        playhead,
                        diff: Object.assign({}, diff, { diff_data_url: '' }),
                        backend_asset: backendResult.asset_ref || null,
                        backend_path: backendResult.path || '',
                        layers: compareItems.filter(item => item.kind === 'layer').map(item => ({
                            clip_id: item.clip_id,
                            label: item.label,
                            diff: Object.assign({}, item.diff, { diff_data_url: '' }),
                            geometry_diff: item.geometry_diff ? Object.assign({}, item.geometry_diff, { diff_data_url: '' }) : null,
                            backend_asset: item.backend_result?.asset_ref || null,
                            backend_path: item.backend_result?.path || ''
                        }))
                    }
                };
                Object.assign(node, buildTimelineDebugPatch(node, frameCompareDebug));
                console.info('[SimpAI Canvas] Timeline frame compare', {
                    node_id: node.id,
                    playhead,
                    diff: Object.assign({}, diff, { diff_data_url: '[data-url omitted]' }),
                    backend: backendResult,
                    layers: compareItems.filter(item => item.kind === 'layer').map(item => ({
                        clip_id: item.clip_id,
                        label: item.label,
                        diff: Object.assign({}, item.diff, { diff_data_url: '[data-url omitted]' }),
                        geometry_diff: item.geometry_diff ? Object.assign({}, item.geometry_diff, { diff_data_url: '[data-url omitted]' }) : null,
                        backend: item.backend_result
                    })),
                    payload
                });
                call('mutate', undefined, { inspector: true });
                call('showToast', undefined, t('Current frame diff mean {mean} / max {max} / changed {changed}%', '当前帧差异 mean {mean} / max {max} / changed {changed}%')
                    .replace('{mean}', diff.mean_abs)
                    .replace('{max}', diff.max_abs)
                    .replace('{changed}', diff.changed_percent));
            } catch (err) {
                if (!isCurrent()) return;
                console.warn('[SimpAI Canvas] timeline frame compare failed', err, backendResult);
                call('showToast', undefined, t('Timeline current-frame comparison failed: {error}', 'Timeline 当前帧对比失败：{error}')
                    .replace('{error}', err?.message || err));
            } finally {
                if (activeComparisons.get(node) === comparison) activeComparisons.delete(node);
            }
        }

        return {
            findOrCreateTimelineCompareResultNode,
            timelineCompareSafeLabel,
            timelineCompareBackendSrc,
            cloneTimelinePayloadForClip,
            cloneTimelinePayloadForClipGeometry,
            publishTimelineFrameCompareResult,
            compareTimelineFrameWithBackend
        };
    }

    window.SimpAICanvasWorkbenchTimelineCompare = Object.assign({}, window.SimpAICanvasWorkbenchTimelineCompare || {}, {
        createCanvasTimelineCompareController
    });
})();
