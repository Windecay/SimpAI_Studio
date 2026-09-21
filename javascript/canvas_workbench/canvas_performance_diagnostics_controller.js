(function () {
    'use strict';

    function sourceCall(source, name, fallback, ...args) {
        return typeof source?.[name] === 'function' ? source[name](...args) : fallback;
    }

    function createCanvasPerformanceDiagnosticsController(source) {
        const scope = source?.performanceDiagnosticsSource || source || {};
        const stateSource = scope.stateSource || {};
        const projectSource = scope.projectSource || {};
        const domSource = scope.domSource || {};
        const viewportSource = scope.viewportSource || {};
        const timingSource = scope.timingSource || {};
        const schedulerSource = scope.schedulerSource || {};
        const renderSource = scope.renderSource || {};
        const edgeSource = scope.edgeSource || {};
        const minimapSource = scope.minimapSource || {};
        const selectionSource = scope.selectionSource || {};
        const timelineSource = scope.timelineSource || {};
        const persistenceSource = scope.persistenceSource || {};
        const gallerySource = scope.gallerySource || {};
        const diagnosticsSource = scope.diagnosticsSource || {};

        const getProject = () => sourceCall(projectSource, 'getProject', {}) || {};
        const getPerfStats = () => sourceCall(timingSource, 'getPerfStats', {}) || {};
        const getRoot = () => sourceCall(domSource, 'getRoot', null);
        const countDom = (sourceObject, name, selector) => sourceCall(sourceObject, name, null)?.querySelectorAll?.(selector)?.length || 0;

        function getCanvasPerfSnapshot() {
            const stats = Object.assign({}, getPerfStats());
            const root = getRoot();
            const project = getProject();
            const visibleRect = root && !root.hidden
                ? sourceCall(viewportSource, 'getVisibleWorldRect', null)
                : null;
            const edgesCanvas = sourceCall(domSource, 'getEdgesCanvas', null);
            const edgeCanvasHitRecords = sourceCall(stateSource, 'getEdgeCanvasHitRecords', []) || [];
            return Object.assign(stats, {
                renderMode: sourceCall(schedulerSource, 'getCanvasRenderMode', 'full'),
                hidden: !!root?.hidden,
                viewport: Object.assign({}, project.viewport || {}),
                visibleRect,
                totalGroups: Array.isArray(project.groups) ? project.groups.length : 0,
                nodeDomCount: countDom(domSource, 'getNodesLayer', '.sai-canvas-node'),
                edgeDomCount: countDom(domSource, 'getEdgesLayer', '.sai-canvas-edge'),
                edgeCanvasActive: !!sourceCall(stateSource, 'getEdgeCanvasActive', false),
                edgeCanvasHitCount: edgeCanvasHitRecords.length,
                edgeCanvasDpr: Number(sourceCall(stateSource, 'getEdgeCanvasDpr', 1)) || 1,
                edgeCanvasBitmapPixels: Math.round((edgesCanvas?.width || 0) * (edgesCanvas?.height || 0)),
                edgeCanvasSvgFallbackActive: !!sourceCall(edgeSource, 'isSvgFallbackActive', false),
                edgeCanvasSvgFallbackLock: Number(sourceCall(edgeSource, 'getSvgFallbackLock', 0)) || 0,
                minimapDomCount: countDom(domSource, 'getMinimapElement', '.sai-minimap-node'),
                edgeCacheKeyLength: String(sourceCall(stateSource, 'getEdgeRenderCacheKey', '') || '').length,
                interactiveLinkRenderPending: !!sourceCall(schedulerSource, 'isInteractiveLinkRenderPending', false),
                nodeLayoutCacheSize: Number(sourceCall(renderSource, 'getNodeLayoutCacheSize', 0)) || 0
            });
        }

        function resetCanvasPerfStats() {
            sourceCall(schedulerSource, 'resetPerformanceState');
            const perfStats = getPerfStats();
            Object.assign(perfStats, {
                fps: 0,
                renderTotalMs: 0,
                renderNodesMs: 0,
                renderEdgesMs: 0,
                renderMinimapMs: 0,
                minimapCacheHit: 0,
                nodeSpatialIndexHit: 0,
                nodeSpatialCandidates: 0,
                marqueeSpatialIndexHit: 0,
                marqueeSpatialCandidates: 0,
                marqueeSelectedNodes: 0,
                edgeCanvasBatches: 0,
                edgePointCacheHits: 0,
                edgePointCacheMisses: 0,
                edgeIncidentIndexHit: 0,
                edgeIncidentCandidates: 0,
                panEdgeLodDeferred: 0,
                panEdgeLodPending: 0,
                panEdgeSettleMs: 0,
                panEdgeSettleDelayMs: 0,
                dragEdgeLodActive: 0,
                dragEdgeLodSuppressed: 0,
                dragEdgeLodSkipped: 0,
                dragEdgeLodLastReason: '',
                dragEdgeLodDeferred: 0,
                dragEdgeLodPending: 0,
                dragEdgeSettleMs: 0,
                dragEdgeSettleDelayMs: 0,
                renderedNodes: 0,
                totalNodes: Array.isArray(getProject().nodes) ? getProject().nodes.length : 0,
                renderedEdges: 0,
                totalEdges: Array.isArray(getProject().edges) ? getProject().edges.length : 0
            });
            return getCanvasPerfSnapshot();
        }

        function loadCanvasPerfProject(nextProject, options) {
            const opts = options || {};
            sourceCall(timelineSource, 'stopTimelinePlayback');
            const project = sourceCall(projectSource, 'sanitizeProject', nextProject, nextProject);
            sourceCall(projectSource, 'setProject', undefined, project);
            sourceCall(schedulerSource, 'resetCanvasRenderModeForProject', undefined, project);
            sourceCall(renderSource, 'resetRenderedProjectDomCache');
            sourceCall(selectionSource, 'resetSelectionState');
            sourceCall(edgeSource, 'cancelEdgeIncidentIndexWarmup');
            sourceCall(edgeSource, 'setEdgeIncidentIndex', undefined, null);
            sourceCall(stateSource, 'setEdgeRenderCacheKey', undefined, '');
            sourceCall(minimapSource, 'resetMinimapCache');
            sourceCall(minimapSource, 'invalidateMinimapStaticCache');
            sourceCall(schedulerSource, 'cancelWheelPreviewLod');
            sourceCall(schedulerSource, 'cancelPanEdgeSettleRender');
            sourceCall(schedulerSource, 'cancelDragEdgeSettleRender');
            sourceCall(schedulerSource, 'endDragEdgeLodVisual');
            sourceCall(renderSource, 'clearEdgeCanvas');
            resetCanvasPerfStats();
            if (opts.persist) {
                const saveResult = sourceCall(persistenceSource, 'saveProject', null, true);
                if (saveResult && typeof saveResult.catch === 'function') {
                    saveResult.catch((err) => sourceCall(
                        diagnosticsSource,
                        'warn',
                        undefined,
                        '[SimpAI Canvas] perf load save failed:',
                        err
                    ));
                }
            }
            sourceCall(renderSource, 'renderAll');
            sourceCall(gallerySource, 'resetGalleryFrostReveals');
            return getCanvasPerfSnapshot();
        }

        return {
            getCanvasPerfSnapshot,
            resetCanvasPerfStats,
            loadCanvasPerfProject
        };
    }

    window.SimpAICanvasWorkbenchPerformanceDiagnostics = Object.assign(
        {},
        window.SimpAICanvasWorkbenchPerformanceDiagnostics || {},
        { createCanvasPerformanceDiagnosticsController }
    );
})();
