(function () {
    'use strict';

    function createCanvasTimelineRenderController(context) {
        const scope = context || {};
        const call = (name, fallback, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : fallback;
        const t = typeof scope.t === 'function' ? scope.t : ((en) => en);
        const getProject = () => call('getProject', {}, []) || {};
        const getNode = (id) => call('getNode', null, id);
        const serializeTimelineRenderPayload = (node) => call('serializeTimelineRenderPayload', {}, node) || {};

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
            const edges = Array.isArray(project.edges) ? project.edges : (project.edges = []);
            const existingEdge = edges.find(edge => edge.type === 'generate' && edge.from === timelineNode.id);
            const existing = existingEdge ? getNode(existingEdge.to) : null;
            const size = timelineResultNodeSize(timelineNode);
            if (existing?.type === 'result') {
                existing.w = Math.max(Number(existing.w || 0), size.w);
                existing.h = Math.max(Number(existing.h || 0), size.h);
                return existing;
            }
            const world = {
                x: Math.round((timelineNode.x || 0) + (timelineNode.w || 760) + 80),
                y: Math.round(timelineNode.y || 0)
            };
            const result = {
                id: call('uid', 'result', 'result'),
                type: 'result',
                x: world.x,
                y: world.y,
                w: size.w,
                h: size.h,
                title: `${timelineNode.title || 'Timeline'} ${t('Output', '输出')}`,
                producer: { preset_node_id: null, timeline_node_id: timelineNode.id, run_id: null, task_id: null },
                status: {
                    state: 'reserved',
                    queue_position: null,
                    step: 0,
                    total_steps: 0,
                    percent: 0,
                    message: t('Timeline output receiver node.', 'Timeline 输出承接节点。')
                },
                preview: null,
                asset: null,
                source: { kind: 'timeline_output', timeline_node_id: timelineNode.id }
            };
            call('placeNodeAvoidingOverlap', undefined, result, world);
            if (!Array.isArray(project.nodes)) project.nodes = [];
            project.nodes.push(result);
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
            result.w = Math.max(Number(result.w || 0), resultSize.w);
            result.h = Math.max(Number(result.h || 0), resultSize.h);
            result.producer = Object.assign({}, result.producer || {}, { preset_node_id: null, timeline_node_id: node.id, run_id: null, task_id: null });
            result.status = Object.assign({}, result.status || {}, {
                state: 'rendering',
                percent: 0.15,
                message: t('Rendering Timeline...', '正在合成 Timeline...')
            });
            call('setSelectedNodeId', undefined, result.id);
            call('setSelectedNodeIds', undefined, [result.id]);
            call('setSelectedEdgeId', undefined, null);
            call('mutate', undefined, { inspector: true });
            const payload = serializeTimelineRenderPayload(node);
            const inputFingerprint = computeTimelineRunFingerprint(node, payload);
            result.producer = Object.assign({}, result.producer || {}, {
                preset_node_id: null,
                timeline_node_id: node.id,
                run_id: null,
                task_id: null,
                fingerprint: inputFingerprint,
                stale: false
            });
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
            const renderedAsset = renderResult?.ok && renderResult.asset_ref ? Object.assign({}, renderResult.asset_ref, {
                kind: renderResult.asset_ref.kind || 'timeline_render',
                render_payload: payload,
                gallery: renderResult.gallery || null,
                thumb: renderResult.asset_ref.thumb || dataUrl || renderResult.asset_ref.preview_url || ''
            }) : null;
            const asset = renderedAsset || (dataUrl ? {
                kind: 'timeline_preview_frame',
                asset_id: call('uid', 'asset', 'asset'),
                name: `${node.title || 'timeline'}-frame.png`,
                mime: 'image/png',
                width,
                height,
                duration: null,
                fps: Number(node.params?.fps || 30),
                data_url: dataUrl,
                thumb: dataUrl,
                render_payload: payload
            } : null);
            result.preview = dataUrl ? { kind: 'timeline_preview_frame', data_url: dataUrl, thumb: dataUrl, width, height } : null;
            result.asset = asset;
            result.assets = asset ? [asset] : [];
            result.selected_asset_index = 0;
            result.source = {
                kind: 'timeline_render_payload',
                timeline_node_id: node.id,
                playhead: Number(node.params?.playhead || 0),
                payload,
                input_fingerprint: inputFingerprint,
                current_fingerprint: inputFingerprint,
                stale: false,
                stale_reason: ''
            };
            result.status = Object.assign({}, result.status || {}, {
                state: renderResult?.ok ? 'finished' : (dataUrl ? 'preview_ready' : 'failed'),
                percent: 1,
                message: renderResult?.ok
                    ? t('Timeline render completed: {name}', 'Timeline 合成完成：{name}').replace('{name}', renderResult.asset_ref?.name || renderResult.path || 'video')
                    : (dataUrl
                        ? t('Backend render failed; kept current-frame preview: {error}', '后端合成失败，已保留当前帧预览：{error}').replace('{error}', renderResult?.error || 'unknown error')
                        : t('Timeline render failed: {error}', 'Timeline 合成失败：{error}').replace('{error}', renderResult?.error || 'unknown error'))
            });
            if (!renderResult?.ok) {
                result.error_details = Object.assign({}, result.error_details || {}, {
                    error: renderResult?.error || 'timeline render failed',
                    details: renderResult?.details || ''
                });
            } else {
                delete result.error_details;
            }
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
