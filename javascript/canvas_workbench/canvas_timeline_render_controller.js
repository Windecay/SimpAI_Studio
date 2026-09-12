(function () {
    'use strict';

    function createCanvasTimelineRenderController(context) {
        const scope = context || {};
        const call = (name, fallback, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : fallback;
        const t = typeof scope.t === 'function' ? scope.t : ((en) => en);
        const getProject = () => call('getProject', {}, []) || {};
        const getNode = (id) => call('getNode', null, id);
        const serializeTimelineRenderPayload = (node) => call('serializeTimelineRenderPayload', {}, node) || {};
        const buildTimelineOutputResultNode = (options) => call('buildTimelineOutputResultNode', null, options);
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
        const buildTimelineRenderAsset = (options) => call('buildTimelineRenderAsset', null, options);
        const buildTimelinePreviewAsset = (options) => call('buildTimelinePreviewAsset', null, options);

        function timelineResultNodeSize(timelineNode) {
            const base = call('defaultNodeSize', { w: 440, h: 390 }, 'result') || { w: 440, h: 390 };
            const width = Math.max(16, Number(timelineNode?.params?.width || 1280));
            const height = Math.max(16, Number(timelineNode?.params?.height || 720));
            const aspect = width / Math.max(1, height);
            if (aspect >= 1.2) return { w: Math.max(base.w, 560), h: Math.max(base.h, 390) };
            if (aspect <= 0.84) return { w: Math.max(base.w, 360), h: Math.max(base.h, 560) };
            return { w: Math.max(base.w, 440), h: Math.max(base.h, 470) };
        }

        function findOrCreateTimelineResultNode(timelineNode) {
            if (!timelineNode || timelineNode.type !== 'timeline') return null;
            const project = getProject();
            const edges = Array.isArray(project.edges) ? project.edges : [];
            const existingEdge = edges.find(edge => edge.type === 'generate' && edge.from === timelineNode.id);
            const existing = existingEdge ? getNode(existingEdge.to) : null;
            const size = timelineResultNodeSize(timelineNode);
            if (existing?.type === 'result') {
                Object.assign(existing, buildTimelineResultPatch(existing, {
                    size: {
                        w: Math.max(Number(existing.w || 0), size.w),
                        h: Math.max(Number(existing.h || 0), size.h)
                    }
                }));
                return existing;
            }
            const world = {
                x: Math.round((timelineNode.x || 0) + (timelineNode.w || 760) + 80),
                y: Math.round(timelineNode.y || 0)
            };
            const result = buildTimelineOutputResultNode({
                position: world,
                size,
                title: `${timelineNode.title || 'Timeline'} ${t('Output', '输出')}`,
                producer: { preset_node_id: null, timeline_node_id: timelineNode.id, run_id: null, task_id: null },
                message: t('Timeline output receiver node.', 'Timeline 输出承接节点。'),
                source: { kind: 'timeline_output', timeline_node_id: timelineNode.id }
            });
            if (!result) return null;
            call('placeNodeAvoidingOverlap', undefined, result, world);
            Object.assign(project, buildProjectNodeAppendPatch(project, result));
            call('ensureGenerateEdge', undefined, timelineNode.id, result.id);
            return result;
        }

        function buildTimelineRunFingerprintPayload(timelineNode, payload) {
            if (!timelineNode || timelineNode.type !== 'timeline') return null;
            const renderPayload = payload || serializeTimelineRenderPayload(timelineNode);
            return {
                schema: 'simpai.canvas.timeline_fingerprint.v1',
                producer_node_id: timelineNode.id,
                producer_type: timelineNode.type,
                payload: renderPayload
            };
        }

        function computeTimelineRunFingerprint(timelineNode, payload) {
            const fingerprintPayload = buildTimelineRunFingerprintPayload(timelineNode, payload);
            return fingerprintPayload ? (call('stableHash', '', fingerprintPayload) || '') : '';
        }

        async function renderTimelineToResult(node) {
            if (!node || node.type !== 'timeline') return { ok: false, error: 'timeline node unavailable' };
            if (call('isNodeLocked', false, node)) {
                call('showToast', undefined, 'Locked timeline cannot render.');
                return { ok: false, error: 'timeline locked' };
            }
            call('pushHistory', undefined, 'Render timeline to result');
            const result = findOrCreateTimelineResultNode(node);
            if (!result || call('isNodeLocked', false, result)) {
                call('showToast', undefined, 'Timeline result node is locked or unavailable.');
                return { ok: false, error: 'timeline result unavailable' };
            }
            const resultSize = timelineResultNodeSize(node);
            Object.assign(result, buildTimelineResultPatch(result, {
                size: {
                    w: Math.max(Number(result.w || 0), resultSize.w),
                    h: Math.max(Number(result.h || 0), resultSize.h)
                },
                producerPatch: { preset_node_id: null, timeline_node_id: node.id, run_id: null, task_id: null },
                statusPatch: {
                    state: 'rendering',
                    percent: 0.15,
                    message: t('Rendering Timeline...', '正在合成 Timeline...')
                }
            }));
            call('setSelectedNodeId', undefined, result.id);
            call('setSelectedNodeIds', undefined, [result.id]);
            call('setSelectedEdgeId', undefined, null);
            call('mutate', undefined, { inspector: true });
            const payload = serializeTimelineRenderPayload(node);
            const inputFingerprint = computeTimelineRunFingerprint(node, payload);
            Object.assign(result, buildTimelineResultPatch(result, {
                producerPatch: {
                    preset_node_id: null,
                    timeline_node_id: node.id,
                    run_id: null,
                    task_id: null,
                    fingerprint: inputFingerprint,
                    stale: false
                }
            }));
            const dataUrl = await call('renderTimelinePreviewFrameDataUrl', '', node);
            const width = Math.max(16, Math.round(Number(node.params?.width || 1280)));
            const height = Math.max(16, Math.round(Number(node.params?.height || 720)));
            let renderResult = null;
            try {
                renderResult = await call('sendCanvasRenderTimelineRequest', null, {
                    project_id: call('getProjectId', 'default'),
                    node_id: result.id,
                    timeline_node_id: node.id,
                    payload
                });
            } catch (err) {
                renderResult = { ok: false, error: err?.message || String(err || 'timeline render failed') };
            }
            const renderedAsset = renderResult?.ok && renderResult.asset_ref
                ? buildTimelineRenderAsset({
                    assetRef: renderResult.asset_ref,
                    renderPayload: payload,
                    gallery: renderResult.gallery || null,
                    dataUrl
                })
                : null;
            const asset = renderedAsset || buildTimelinePreviewAsset(dataUrl ? {
                name: `${node.title || 'timeline'}-frame.png`,
                width,
                height,
                fps: Number(node.params?.fps || 30),
                dataUrl,
                renderPayload: payload
            } : null);
            const preview = dataUrl ? { kind: 'timeline_preview_frame', data_url: dataUrl, thumb: dataUrl, width, height } : null;
            const errorDetails = renderResult?.ok ? null : {
                error: renderResult?.error || 'timeline render failed',
                details: renderResult?.details || ''
            };
            Object.assign(result, buildTimelineResultPatch(result, {
                preview,
                asset,
                assets: asset ? [asset] : [],
                selectedAssetIndex: 0,
                source: {
                    kind: 'timeline_render_payload',
                    timeline_node_id: node.id,
                    playhead: Number(node.params?.playhead || 0),
                    payload,
                    input_fingerprint: inputFingerprint,
                    current_fingerprint: inputFingerprint,
                    stale: false,
                    stale_reason: ''
                },
                statusPatch: {
                    state: renderResult?.ok ? 'finished' : (dataUrl ? 'preview_ready' : 'failed'),
                    percent: 1,
                    message: renderResult?.ok
                        ? t('Timeline render completed: {name}', 'Timeline 合成完成：{name}').replace('{name}', renderResult.asset_ref?.name || renderResult.path || 'video')
                        : (dataUrl
                            ? t('Backend render failed; kept current-frame preview: {error}', '后端合成失败，已保留当前帧预览：{error}').replace('{error}', renderResult?.error || 'unknown error')
                            : t('Timeline render failed: {error}', 'Timeline 合成失败：{error}').replace('{error}', renderResult?.error || 'unknown error'))
                },
                errorDetails
            }));
            call('mutate', undefined, { inspector: true });
            if (renderResult?.ok) call('refreshMainGalleryAfterCanvasRun', undefined, renderResult);
            call('showToast', undefined, renderResult?.ok
                ? t('Timeline render output sent to Result.', 'Timeline 合成已输出到 Result')
                : t('Timeline backend render failed; preview kept.', 'Timeline 后端合成失败，已保留预览'));
            return renderResult?.ok
                ? { ok: true, result_node_id: result.id, asset: result.asset || null, render_result: renderResult }
                : { ok: false, result_node_id: result.id, error: renderResult?.error || 'timeline render failed', render_result: renderResult };
        }

        return {
            timelineResultNodeSize,
            findOrCreateTimelineResultNode,
            buildTimelineRunFingerprintPayload,
            computeTimelineRunFingerprint,
            renderTimelineToResult
        };
    }

    window.SimpAICanvasWorkbenchTimelineRender = Object.assign({}, window.SimpAICanvasWorkbenchTimelineRender || {}, {
        createCanvasTimelineRenderController
    });
})();
