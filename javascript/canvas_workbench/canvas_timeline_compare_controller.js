(function () {
    'use strict';

    function createCanvasTimelineCompareController(context) {
        const scope = context || {};
        const call = (name, fallback, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : fallback;
        const t = typeof scope.t === 'function' ? scope.t : ((en) => en);
        const clamp = typeof scope.clamp === 'function'
            ? scope.clamp
            : (value, min, max) => Math.max(min, Math.min(max, value));
        const getProject = () => call('getProject', {}, []) || {};
        const getProjectId = () => call('getProjectId', 'default');
        const serializeTimelineRenderPayload = (node) => call('serializeTimelineRenderPayload', {}, node) || {};
        const renderTimelinePreviewFrameDataUrl = (...args) => call('renderTimelinePreviewFrameDataUrl', '', ...args);
        const getActiveTimelineVisualClips = (node) => call('getActiveTimelineVisualClips', [], node) || [];
        const compareTimelineFrameImages = (...args) => {
            if (typeof scope.compareTimelineFrameImages === 'function') return scope.compareTimelineFrameImages(...args);
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

        async function compareTimelineFrameWithBackend(node) {
            if (!node || node.type !== 'timeline') return;
            call('normalizeTimelineNode', undefined, node);
            const payload = serializeTimelineRenderPayload(node);
            const width = Math.max(16, Math.round(Number(node.params?.width || 1280)));
            const height = Math.max(16, Math.round(Number(node.params?.height || 720)));
            const playhead = clamp(Number(node.params?.playhead || 0), 0, Math.max(1, Number(node.params?.duration || 1)));
            call('showToast', undefined, t('Comparing current Timeline frame...', '正在对比 Timeline 当前帧...'));
            let frontendDataUrl = '';
            let backendResult = null;
            try {
                frontendDataUrl = await renderTimelinePreviewFrameDataUrl(node, { payload });
                if (!frontendDataUrl) throw new Error('frontend frame export failed');
                backendResult = await sendCanvasRenderTimelineFrameRequest({
                    project_id: getProjectId(),
                    node_id: node.id,
                    timeline_node_id: node.id,
                    time: playhead,
                    payload
                });
                if (!backendResult?.ok) throw new Error(backendResult?.error || 'backend frame render failed');
                const backendSrc = timelineCompareBackendSrc(backendResult);
                if (!backendSrc) throw new Error('backend frame source missing');
                const compareOptions = { background: node.params?.background || '#000000' };
                const diff = await compareTimelineFrameImages(frontendDataUrl, backendSrc, width, height, compareOptions);
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
                    if (!layerFrontendDataUrl) continue;
                    const layerBackendResult = await sendCanvasRenderTimelineFrameRequest({
                        project_id: getProjectId(),
                        node_id: node.id,
                        timeline_node_id: node.id,
                        time: playhead,
                        payload: layerPayload
                    });
                    if (!layerBackendResult?.ok) {
                        console.warn('[SimpAI Canvas] timeline layer frame compare backend failed', clip.id, layerBackendResult);
                        continue;
                    }
                    const layerBackendSrc = timelineCompareBackendSrc(layerBackendResult);
                    if (!layerBackendSrc) continue;
                    const layerDiff = await compareTimelineFrameImages(layerFrontendDataUrl, layerBackendSrc, width, height, compareOptions);
                    let geometryDiff = null;
                    let geometryBackendResult = null;
                    try {
                        const geometryPayload = cloneTimelinePayloadForClipGeometry(payload, clip.id);
                        const geometryFrontendDataUrl = await renderTimelinePreviewFrameDataUrl(node, {
                            onlyClipId: clip.id,
                            geometryProbe: true,
                            payload: geometryPayload
                        });
                        geometryBackendResult = await sendCanvasRenderTimelineFrameRequest({
                            project_id: getProjectId(),
                            node_id: node.id,
                            timeline_node_id: node.id,
                            time: playhead,
                            payload: geometryPayload
                        });
                        const geometryBackendSrc = timelineCompareBackendSrc(geometryBackendResult);
                        if (geometryFrontendDataUrl && geometryBackendSrc) {
                            geometryDiff = await compareTimelineFrameImages(
                                geometryFrontendDataUrl,
                                geometryBackendSrc,
                                width,
                                height,
                                Object.assign({}, compareOptions, { boundsThreshold: 1 })
                            );
                        }
                    } catch (err) {
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
                publishTimelineFrameCompareResult(node, compareItems);
                const frameCompareDebug = {
                    frame_compare: {
                        checked_at: call('nowIso', new Date().toISOString()),
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
                console.warn('[SimpAI Canvas] timeline frame compare failed', err, backendResult);
                call('showToast', undefined, t('Timeline current-frame comparison failed: {error}', 'Timeline 当前帧对比失败：{error}')
                    .replace('{error}', err?.message || err));
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
