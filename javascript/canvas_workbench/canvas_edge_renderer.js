(function () {
    'use strict';

    function createCanvasEdgeRenderer(context) {
        const scope = context?.edgeRendererSource || context || {};
        const domSource = scope.domSource || {};
        const canvasSource = scope.canvasSource || {};
        const projectSource = scope.projectSource || {};
        const geometrySource = scope.geometrySource || {};
        const noteSource = scope.noteSource || {};
        const renderSource = scope.renderSource || {};
        const edgeIndexSource = scope.edgeIndexSource || {};
        const selectionSource = scope.selectionSource || {};
        const cacheSource = scope.cacheSource || {};
        const timingSource = scope.timingSource || {};
        const connectionSource = scope.connectionSource || {};
        const perfSource = scope.perfSource || {};
        const viewportSource = scope.viewportSource || {};
        const nodeSource = scope.nodeSource || {};
        let edgeCanvasHitRecords = [];
        let edgeCanvasActive = false;
        let edgeCanvasDpr = 1;

        function call(source, name, fallback, ...args) {
            return typeof source?.[name] === 'function' ? source[name](...args) : fallback;
        }

        function escapeSelectorValue(value) {
            const fallback = String(value || '').replace(/["\\]/g, '\\$&');
            return call(geometrySource, 'cssEscape', fallback, value);
        }

        function getHandleWorldPoint(selector) {
            const nodesLayer = call(domSource, 'getNodesLayer', null);
            if (!nodesLayer) return null;
            const handle = nodesLayer.querySelector(selector);
            if (!handle) return null;
            const rect = handle.getBoundingClientRect();
            if (!rect.width && !rect.height) return null;
            return call(
                viewportSource,
                'clientToWorld',
                null,
                rect.left + rect.width / 2,
                rect.top + rect.height / 2
            );
        }

        function getTimelineTrackInputWorldPoint(nodeId, trackId) {
            if (!trackId) return null;
            const selector = '[data-node-id="' + escapeSelectorValue(nodeId)
                + '"] [data-timeline-track-in="' + escapeSelectorValue(trackId) + '"]';
            return getHandleWorldPoint(selector);
        }

        function getOutputPoint(node) {
            const selector = '[data-node-id="' + escapeSelectorValue(node.id) + '"] [data-handle-out]';
            const measured = getHandleWorldPoint(selector);
            if (measured) return measured;
            const size = call(nodeSource, 'defaultNodeSize', { w: 0 }, node.type) || { w: 0 };
            return {
                x: (node.x || 0) + (node.w || size.w),
                y: (node.y || 0) + 54
            };
        }

        function getInputPoint(node, slot, edgeType) {
            const nodeSelector = '[data-node-id="' + escapeSelectorValue(node.id) + '"] ';
            let selector = '';
            if ((node.type === 'preset' || node.type === 'classic') && edgeType === 'upload') {
                selector = nodeSelector + '[data-handle-in="' + escapeSelectorValue(slot) + '"]';
            } else if ((node.type === 'preset' || node.type === 'classic') && edgeType === 'config') {
                selector = nodeSelector + '[data-config-in="' + escapeSelectorValue(slot || '') + '"]';
            } else if ((node.type === 'preset' || node.type === 'classic') && edgeType === 'text') {
                selector = nodeSelector + '[data-text-in="' + escapeSelectorValue(slot || '') + '"]';
            } else if (node.type === 'text' && edgeType === 'text') {
                selector = nodeSelector + '[data-text-node-in]';
            } else if (node.type === 'text_merge' && edgeType === 'text') {
                selector = nodeSelector + '[data-text-node-in="' + escapeSelectorValue(slot || '') + '"]';
            } else if (node.type === 'translation' && edgeType === 'text') {
                selector = nodeSelector + '[data-translation-text-in]';
            } else if (node.type === 'tag_cart' && edgeType === 'text') {
                selector = nodeSelector + '[data-tagcart-text-in]';
            } else if (node.type === 'result' && edgeType === 'generate') {
                selector = nodeSelector + '[data-handle-in-result]';
            } else if (node.type === 'wd14' && edgeType === 'image') {
                selector = nodeSelector + '[data-wd14-image-in]';
            } else if (node.type === 'vlm' && edgeType === 'image') {
                selector = nodeSelector + '[data-vlm-image-in="' + escapeSelectorValue(slot || '') + '"]';
            } else if (node.type === 'mask' && edgeType === 'image') {
                selector = nodeSelector + '[data-mask-source-in]';
            } else if (node.type === 'pose_studio' && edgeType === 'image') {
                selector = nodeSelector + '[data-pose-studio-reference-in]';
            } else if (node.type === 'gaussian_studio' && edgeType === 'image') {
                selector = nodeSelector + '[data-gaussian-studio-reference-in]';
            } else if (node.type === 'liveportrait_expression' && edgeType === 'image') {
                const liveSlot = slot === 'reference' ? 'reference' : 'source';
                const attr = liveSlot === 'reference'
                    ? 'data-liveportrait-expression-reference-in'
                    : 'data-liveportrait-expression-source-in';
                selector = nodeSelector + '[' + attr + ']';
            } else if (node.type === 'sam3_video_mask' && edgeType === 'media') {
                selector = nodeSelector + '[data-sam3-video-in]';
            } else if (call(nodeSource, 'isQwenTtsNode', false, node) && edgeType === 'media') {
                selector = nodeSelector + '[data-qwen-tts-audio-in="' + escapeSelectorValue(slot || '') + '"]';
            } else if (node.type === 'compare' && edgeType === 'compare') {
                selector = nodeSelector + '[data-compare-image-in="' + escapeSelectorValue(slot || '') + '"]';
            } else if (node.type === 'timeline' && edgeType === 'timeline') {
                const clip = (node.clips || []).find(item => item.id === slot);
                const trackPoint = getTimelineTrackInputWorldPoint(node.id, clip?.track_id || slot);
                if (trackPoint) return trackPoint;
                selector = nodeSelector + '[data-timeline-media-in]';
            } else if (node.type === 'batch_any' && edgeType === 'batch_input') {
                selector = nodeSelector + '[data-batch-any-in]';
            }
            if (selector) {
                const measured = getHandleWorldPoint(selector);
                if (measured) return measured;
            }
            if (node.type === 'preset' && edgeType === 'upload') {
                const visibleSlots = call(nodeSource, 'getVisibleUploadSlots', [], node);
                const index = Math.max(0, (Array.isArray(visibleSlots) ? visibleSlots : [])
                    .findIndex(item => item.key === slot));
                return { x: node.x || 0, y: (node.y || 0) + 96 + index * 34 };
            }
            if (node.type === 'result' && edgeType === 'generate') {
                return { x: node.x || 0, y: (node.y || 0) + 54 };
            }
            return { x: node.x || 0, y: (node.y || 0) + 54 };
        }

        function edgeCurveControlPoints(from, to) {
            const dx = Math.max(80, Math.abs(to.x - from.x) * 0.45);
            return { c1x: from.x + dx, c1y: from.y, c2x: to.x - dx, c2y: to.y };
        }

        function createEdgeCanvasRecord(edge, from, to) {
            const c = edgeCurveControlPoints(from, to);
            const pad = edge.id === call(selectionSource, 'getSelectedEdgeId', null) ? 12 : 10;
            return {
                id: edge.id,
                type: edge.type || 'edge',
                from,
                to,
                c,
                bounds: {
                    x: Math.min(from.x, to.x, c.c1x, c.c2x) - pad,
                    y: Math.min(from.y, to.y, c.c1y, c.c2y) - pad,
                    w: Math.max(from.x, to.x, c.c1x, c.c2x) - Math.min(from.x, to.x, c.c1x, c.c2x) + pad * 2,
                    h: Math.max(from.y, to.y, c.c1y, c.c2y) - Math.min(from.y, to.y, c.c1y, c.c2y) + pad * 2
                }
            };
        }

        function edgeCanvasCssVar(name, fallback) {
            const root = call(domSource, 'getRoot', null);
            if (!root) return fallback;
            const style = call(canvasSource, 'getComputedStyle', null, root);
            return style?.getPropertyValue(name).trim() || fallback;
        }

        function edgeCanvasStrokeGroupKey(record) {
            if (record.id === call(selectionSource, 'getSelectedEdgeId', null)) return 'selected';
            if (record.type === 'batch_input') return 'batch_input';
            if (record.type === 'generate') return 'generate';
            if (record.type === 'text') return 'text';
            if (record.type === 'image') return 'image';
            if (record.type === 'compare') return 'compare';
            if (record.type === 'timeline') return 'timeline';
            return 'edge';
        }

        function createEdgeCanvasStrokeGroup(key, vars) {
            const style = (() => {
                if (key === 'selected') return { color: vars.warn, width: 4, alpha: 1 };
                if (key === 'batch_input') return { color: '#22c55e', width: 3, alpha: 1 };
                if (key === 'generate') return { color: '#737373', width: 3, alpha: 1 };
                if (key === 'text') return { color: '#16a34a', width: 3, alpha: 1 };
                if (key === 'image') return { color: '#14b8a6', width: 3, alpha: 1 };
                if (key === 'compare') return { color: '#0ea5e9', width: 3, alpha: 1 };
                if (key === 'timeline') return { color: '#f59e0b', width: 2.4, alpha: 0.78 };
                return { color: vars.accent, width: 3, alpha: 1 };
            })();
            return { key, style, records: [] };
        }

        function getEdgeCanvasStrokeGroups(records, vars) {
            const groups = [];
            const groupsByKey = Object.create(null);
            let selectedGroup = null;
            (Array.isArray(records) ? records : []).forEach((record) => {
                const key = edgeCanvasStrokeGroupKey(record);
                if (key === 'selected') {
                    if (!selectedGroup) selectedGroup = createEdgeCanvasStrokeGroup(key, vars);
                    selectedGroup.records.push(record);
                    return;
                }
                if (!groupsByKey[key]) {
                    groupsByKey[key] = createEdgeCanvasStrokeGroup(key, vars);
                    groups.push(groupsByKey[key]);
                }
                groupsByKey[key].records.push(record);
            });
            if (selectedGroup?.records?.length) groups.push(selectedGroup);
            return groups;
        }

        function clearEdgeCanvas() {
            edgeCanvasHitRecords = [];
            edgeCanvasActive = false;
            call(perfSource, 'getPerfStats', {}).edgeCanvasBatches = 0;
            const canvas = call(domSource, 'getEdgesCanvas', null);
            if (!canvas) return;
            canvas.hidden = true;
            canvas.width = 0;
            canvas.height = 0;
            canvas.style.width = '0px';
            canvas.style.height = '0px';
        }

        function appendCanvasEdgeCurve(ctx, from, to) {
            const c = edgeCurveControlPoints(from, to);
            ctx.moveTo(from.x, from.y);
            ctx.bezierCurveTo(c.c1x, c.c1y, c.c2x, c.c2y, to.x, to.y);
        }

        function drawEdgeCanvas(bounds, records) {
            edgeCanvasHitRecords = Array.isArray(records) ? records : [];
            if (!call(renderSource, 'shouldUseCanvasEdgeRendering', false) || !bounds) {
                clearEdgeCanvas();
                return false;
            }
            const canvas = call(domSource, 'getEdgesCanvas', null);
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                clearEdgeCanvas();
                return false;
            }
            const width = Math.max(1, Math.ceil(bounds.w));
            const height = Math.max(1, Math.ceil(bounds.h));
            edgeCanvasDpr = 1;
            canvas.hidden = false;
            canvas.style.left = `${bounds.x}px`;
            canvas.style.top = `${bounds.y}px`;
            canvas.style.width = `${width}px`;
            canvas.style.height = `${height}px`;
            const nextWidth = Math.max(1, Math.ceil(width * edgeCanvasDpr));
            const nextHeight = Math.max(1, Math.ceil(height * edgeCanvasDpr));
            if (canvas.width !== nextWidth) canvas.width = nextWidth;
            if (canvas.height !== nextHeight) canvas.height = nextHeight;
            ctx.setTransform(edgeCanvasDpr, 0, 0, edgeCanvasDpr, 0, 0);
            ctx.clearRect(0, 0, width, height);
            ctx.translate(-bounds.x, -bounds.y);
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            const vars = {
                accent: edgeCanvasCssVar('--sai-canvas-accent', '#1f8f7a'),
                warn: edgeCanvasCssVar('--sai-canvas-warn', '#f97316')
            };
            const groups = getEdgeCanvasStrokeGroups(edgeCanvasHitRecords, vars);
            call(perfSource, 'getPerfStats', {}).edgeCanvasBatches = groups.length;
            for (const group of groups) {
                const style = group.style;
                ctx.globalAlpha = style.alpha;
                ctx.strokeStyle = style.color;
                ctx.lineWidth = style.width;
                ctx.beginPath();
                group.records.forEach(record => appendCanvasEdgeCurve(ctx, record.from, record.to));
                ctx.stroke();
            }
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.globalAlpha = 1;
            edgeCanvasActive = true;
            return true;
        }

        function cubicPointAt(record, tValue) {
            const t1 = 1 - tValue;
            const t12 = t1 * t1;
            const t2 = tValue * tValue;
            return {
                x: t12 * t1 * record.from.x + 3 * t12 * tValue * record.c.c1x
                    + 3 * t1 * t2 * record.c.c2x + t2 * tValue * record.to.x,
                y: t12 * t1 * record.from.y + 3 * t12 * tValue * record.c.c1y
                    + 3 * t1 * t2 * record.c.c2y + t2 * tValue * record.to.y
            };
        }

        function distancePointToSegmentSq(point, a, b) {
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
                const px = point.x - a.x;
                const py = point.y - a.y;
                return px * px + py * py;
            }
            const tValue = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy)));
            const x = a.x + dx * tValue;
            const y = a.y + dy * tValue;
            const px = point.x - x;
            const py = point.y - y;
            return px * px + py * py;
        }

        function edgeRecordDistanceSq(record, point) {
            let best = Infinity;
            let previous = record.from;
            for (let i = 1; i <= 18; i += 1) {
                const current = cubicPointAt(record, i / 18);
                best = Math.min(best, distancePointToSegmentSq(point, previous, current));
                previous = current;
            }
            return best;
        }

        function findCanvasEdgeAtClient(clientX, clientY) {
            const root = call(domSource, 'getRoot', null);
            if (!edgeCanvasActive || !edgeCanvasHitRecords.length || !root || root.hidden) return null;
            const point = call(viewportSource, 'clientToWorld', null, clientX, clientY);
            const zoom = Math.max(0.05, Number(call(projectSource, 'getProject', {})?.viewport?.zoom || 1) || 1);
            const tolerance = Math.max(5, 8 / zoom);
            const toleranceSq = tolerance * tolerance;
            let best = null;
            let bestDistance = toleranceSq;
            for (let i = edgeCanvasHitRecords.length - 1; i >= 0; i -= 1) {
                const record = edgeCanvasHitRecords[i];
                const bounds = record.bounds;
                if (!bounds || point.x < bounds.x - tolerance || point.y < bounds.y - tolerance
                    || point.x > bounds.x + bounds.w + tolerance || point.y > bounds.y + bounds.h + tolerance) continue;
                const distance = edgeRecordDistanceSq(record, point);
                if (distance <= bestDistance) {
                    bestDistance = distance;
                    best = record;
                }
            }
            return best;
        }

        function renderEdges() {
            const startedAt = call(timingSource, 'performanceNow', 0);
            const paths = [];
            const keyParts = [];
            const canvasEdgeRecords = [];
            const useCanvasEdges = !!call(renderSource, 'shouldUseCanvasEdgeRendering', false);
            let visibleEdgeCount = 0;
            const project = call(projectSource, 'getProject', {});
            const perfStats = call(perfSource, 'getPerfStats', {});
            const edgesLayer = call(domSource, 'getEdgesLayer', null);
            const escapeHtml = (value) => call(renderSource, 'escapeHtml', String(value), value);
            const bounds = call(geometrySource, 'getEdgeSvgBounds', { x: 0, y: 0, w: 1, h: 1 });
            const canvasBounds = useCanvasEdges
                ? call(geometrySource, 'getEdgeCanvasBounds', null)
                : null;
            const renderWindow = call(geometrySource, 'getEdgeRenderWorldRect', null);
            const nodesById = new Map((Array.isArray(project.nodes) ? project.nodes : [])
                .filter(node => node && node.id)
                .map(node => [node.id, node]));
            const pointCache = call(geometrySource, 'createEdgePointCache', {});
            call(noteSource, 'renderNoteTailSvg', null, paths, keyParts, renderWindow);
            for (const edge of project.edges) {
                const fromNode = nodesById.get(edge.from);
                const toNode = nodesById.get(edge.to);
                if (!fromNode || !toNode) continue;
                if (!call(geometrySource, 'shouldRenderEdgeInViewport', false, edge, fromNode, toNode, renderWindow)) continue;
                visibleEdgeCount += 1;
                const from = call(geometrySource, 'getCachedOutputPoint', null, fromNode, pointCache);
                const to = call(geometrySource, 'getCachedInputPoint', null, toNode, edge.slot, edge.type, pointCache);
                if (useCanvasEdges) {
                    canvasEdgeRecords.push(createEdgeCanvasRecord(edge, from, to));
                }
                const selectedEdgeId = call(selectionSource, 'getSelectedEdgeId', null);
                const shouldRenderSvgPath = !useCanvasEdges || edge.id === selectedEdgeId;
                if (shouldRenderSvgPath) {
                    const d = call(geometrySource, 'curvePath', '', from, to);
                    const label = call(renderSource, 'edgeLabelText', '', edge, toNode);
                    keyParts.push([
                        edge.id,
                        edge.type || '',
                        edge.slot || '',
                        from.x,
                        from.y,
                        to.x,
                        to.y,
                        label,
                        edge.id === selectedEdgeId ? 1 : 0
                    ].join(':'));
                    paths.push(`<path class="sai-canvas-edge-hit" data-edge-id="${escapeHtml(edge.id)}" d="${escapeHtml(d)}"></path>`);
                    paths.push(`<path class="sai-canvas-edge sai-canvas-edge-${escapeHtml(edge.type || 'edge')} ${edge.id === selectedEdgeId ? 'is-selected' : ''}" data-edge-id="${escapeHtml(edge.id)}" d="${escapeHtml(d)}"></path>`);
                }
                if (!useCanvasEdges && project.settings.edgeLabels) {
                    const label = call(renderSource, 'edgeLabelText', '', edge, toNode);
                    const midX = (from.x + to.x) / 2;
                    const midY = (from.y + to.y) / 2;
                    paths.push(`<text class="sai-canvas-edge-label" x="${midX}" y="${midY - 6}">${escapeHtml(label)}</text>`);
                }
            }
            if (useCanvasEdges) drawEdgeCanvas(canvasBounds, canvasEdgeRecords);
            else clearEdgeCanvas();
            const nextCacheKey = [
                useCanvasEdges ? 'canvas' : 'svg',
                bounds.x,
                bounds.y,
                bounds.w,
                bounds.h,
                project.settings.edgeLabels ? 1 : 0,
                keyParts.join('|')
            ].join(';');
            edgesLayer.setAttribute('viewBox', `${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`);
            edgesLayer.style.left = `${bounds.x}px`;
            edgesLayer.style.top = `${bounds.y}px`;
            edgesLayer.style.width = `${bounds.w}px`;
            edgesLayer.style.height = `${bounds.h}px`;
            if (call(cacheSource, 'getEdgeRenderCacheKey', '') !== nextCacheKey) {
                edgesLayer.innerHTML = paths.join('');
                call(cacheSource, 'setEdgeRenderCacheKey', null, nextCacheKey);
            } else {
                call(selectionSource, 'updateSelectionDomClasses', null);
            }
            if (call(connectionSource, 'isConnecting', false)) {
                call(connectionSource, 'resetTempEdge', null);
                call(connectionSource, 'updateTempEdge', null);
            } else {
                call(connectionSource, 'clearTempEdge', null);
            }
            perfStats.renderEdgesMs = call(timingSource, 'performanceNow', startedAt) - startedAt;
            call(geometrySource, 'publishEdgePointCacheStats', null, pointCache);
            perfStats.renderedEdges = visibleEdgeCount;
            perfStats.totalEdges = project.edges.length;
        }

        function updateInteractiveEdgeDom(nodeIds) {
            const edgesLayer = call(domSource, 'getEdgesLayer', null);
            const project = call(projectSource, 'getProject', {});
            if (!edgesLayer || call(connectionSource, 'isConnecting', false) || project.settings.edgeLabels) return false;
            if (!Array.isArray(nodeIds) || !nodeIds.length) return false;
            const idSet = new Set(nodeIds.filter(Boolean));
            if (!idSet.size) return false;
            const startedAt = call(timingSource, 'performanceNow', 0);
            const renderWindow = call(geometrySource, 'getEdgeRenderWorldRect', null);
            const nodesById = new Map((Array.isArray(project.nodes) ? project.nodes : [])
                .filter(node => node && node.id)
                .map(node => [node.id, node]));
            const pointCache = call(geometrySource, 'createEdgePointCache', {});
            const incidentQuery = call(edgeIndexSource, 'getIncidentEdgeRecordsForNodeIds', { indexed: false, records: [] }, idSet);
            const perfStats = call(perfSource, 'getPerfStats', {});
            perfStats.edgeIncidentIndexHit = incidentQuery.indexed ? 1 : 0;
            perfStats.edgeIncidentCandidates = incidentQuery.indexed ? incidentQuery.records.length : 0;
            let updated = 0;
            let missingVisibleEdge = false;
            for (const record of incidentQuery.records) {
                const edge = record.edge;
                if (!incidentQuery.indexed && !idSet.has(edge.from) && !idSet.has(edge.to)) continue;
                const fromNode = nodesById.get(edge.from);
                const toNode = nodesById.get(edge.to);
                if (!fromNode || !toNode) continue;
                const escapedEdgeId = typeof geometrySource.cssEscape === 'function'
                    ? geometrySource.cssEscape(edge.id)
                    : String(edge.id);
                const selector = `[data-edge-id="${escapedEdgeId}"]`;
                const path = edgesLayer.querySelector(selector);
                const visible = call(geometrySource, 'shouldRenderEdgeInViewport', false, edge, fromNode, toNode, renderWindow);
                if (!visible) {
                    if (path) path.remove();
                    continue;
                }
                if (!path) {
                    missingVisibleEdge = true;
                    break;
                }
                const from = call(geometrySource, 'getCachedOutputPoint', null, fromNode, pointCache);
                const to = call(geometrySource, 'getCachedInputPoint', null, toNode, edge.slot, edge.type, pointCache);
                path.setAttribute('d', call(geometrySource, 'curvePath', '', from, to));
                updated += 1;
            }
            call(geometrySource, 'publishEdgePointCacheStats', null, pointCache);
            if (missingVisibleEdge) return false;
            perfStats.renderEdgesMs = call(timingSource, 'performanceNow', startedAt) - startedAt;
            return updated > 0 || (incidentQuery.indexed && incidentQuery.records.length === 0);
        }

        return {
            renderEdges,
            getOutputPoint,
            getInputPoint,
            updateInteractiveEdgeDom,
            drawEdgeCanvas,
            clearEdgeCanvas,
            findCanvasEdgeAtClient,
            getEdgeCanvasActive: () => edgeCanvasActive,
            getEdgeCanvasHitRecords: () => edgeCanvasHitRecords,
            getEdgeCanvasDpr: () => edgeCanvasDpr
        };
    }

    window.SimpAICanvasWorkbenchEdgeRenderer = Object.assign({}, window.SimpAICanvasWorkbenchEdgeRenderer || {}, {
        createCanvasEdgeRenderer
    });
})();
