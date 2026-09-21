(function () {
    'use strict';

    function sourceCall(source, name, fallback, ...args) {
        return typeof source?.[name] === 'function' ? source[name](...args) : fallback;
    }

    function sourceValue(source, name, fallback, ...args) {
        const value = source?.[name];
        if (typeof value === 'function') return value(...args);
        return value === undefined ? fallback : value;
    }

    function createCanvasViewportRenderSchedulerController(source) {
        const scope = source?.viewportRenderSchedulerSource || source || {};
        const domSource = scope.domSource || {};
        const projectSource = scope.projectSource || {};
        const timingSource = scope.timingSource || {};
        const configSource = scope.configSource || {};
        const renderSource = scope.renderSource || {};
        const interactionSource = scope.interactionSource || {};
        const nodeSource = scope.nodeSource || {};
        const viewportSource = scope.viewportSource || {};
        const edgeSource = scope.edgeSource || {};
        const stateSource = scope.stateSource || {};
        const uiSource = scope.uiSource || {};
        const utilitySource = scope.utilitySource || {};

        const getRoot = () => sourceCall(domSource, 'getRoot', null);
        const getViewportElement = () => sourceCall(domSource, 'getViewportElement', null);
        const getStageElement = () => sourceCall(domSource, 'getStageElement', null);
        const getPerfHudElement = () => sourceCall(domSource, 'getPerfHudElement', null);
        const getProject = () => sourceCall(projectSource, 'getProject', null) || {};
        const getPerfStats = () => sourceCall(timingSource, 'getPerfStats', null);
        const performanceNow = () => Number(sourceCall(timingSource, 'performanceNow', 0)) || 0;
        const requestFrame = (callback) => sourceCall(timingSource, 'requestAnimationFrame', null, callback);
        const cancelFrame = (handle) => sourceCall(timingSource, 'cancelAnimationFrame', undefined, handle);
        const setTimeout = (...args) => sourceCall(timingSource, 'setTimeout', undefined, ...args);
        const clearTimeout = (...args) => sourceCall(timingSource, 'clearTimeout', undefined, ...args);
        const renderCall = (name, fallback, ...args) => sourceCall(renderSource, name, fallback, ...args);
        const interactionCall = (name, fallback, ...args) => sourceCall(interactionSource, name, fallback, ...args);
        const nodeCall = (name, fallback, ...args) => sourceCall(nodeSource, name, fallback, ...args);
        const viewportCall = (name, fallback, ...args) => sourceCall(viewportSource, name, fallback, ...args);
        const edgeCall = (name, fallback, ...args) => sourceCall(edgeSource, name, fallback, ...args);
        const uiCall = (name, fallback, ...args) => sourceCall(uiSource, name, fallback, ...args);
        const configNumber = (name, fallback) => {
            const value = Number(sourceValue(configSource, name, fallback));
            return Number.isFinite(value) ? value : fallback;
        };
        const escapeHtml = (value) => sourceCall(utilitySource, 'escapeHtml', String(value ?? ''), value);

        let perfFrameHandle = 0;
        let perfFrameLastAt = 0;
        let perfHudLastRenderAt = 0;
        let panNodeRenderTimer = 0;
        let panNodeRenderLastAt = 0;
        let wheelPreviewLodUntil = 0;
        let wheelPreviewLodTimer = 0;
        let viewportZoomSettleTimer = 0;
        let canvasRenderMode = 'full';
        let perfFrameSamples = [];
        let viewportRenderFrame = 0;
        let interactiveLinkRenderFrame = 0;
        let interactiveLinkRenderNodeIds = null;
        let panEdgeSettleFrame = 0;
        let panEdgeSettleStartedAt = 0;
        let dragEdgeLodActive = false;
        let dragEdgeSettleFrame = 0;
        let dragEdgeSettleStartedAt = 0;

        function setPerfStat(name, value) {
            const stats = getPerfStats();
            if (stats && typeof stats === 'object') stats[name] = value;
        }

        function addPerfStat(name, amount) {
            const stats = getPerfStats();
            if (stats && typeof stats === 'object') stats[name] = Number(stats[name] || 0) + amount;
        }

        function applyViewport() {
            updateCanvasRenderMode();
            const viewportElement = getViewportElement();
            const stageElement = getStageElement();
            if (!viewportElement || !stageElement) return;
            const viewportState = getProject().viewport || {};
            const zoom = Math.max(0.05, Math.round(Number(viewportState.zoom || 1) * 1000) / 1000);
            const x = Math.round(Number(viewportState.x || 0));
            const y = Math.round(Number(viewportState.y || 0));
            stageElement.style.transform = `translate(${x}px, ${y}px) scale(${zoom})`;
            const gridSize = Math.max(4, configNumber('canvasGridSize', 24) * zoom);
            viewportElement.style.setProperty('--sai-grid-size', `${gridSize}px`);
            viewportElement.style.setProperty('--sai-grid-offset-x', `${((x % gridSize) + gridSize) % gridSize}px`);
            viewportElement.style.setProperty('--sai-grid-offset-y', `${((y % gridSize) + gridSize) % gridSize}px`);
            uiCall('positionCanvasAgentPanel', undefined);
            uiCall('syncMinimapViewRect', undefined);
        }

        function updateCanvasRenderMode() {
            const zoom = Number(getProject().viewport?.zoom || 1) || 1;
            const now = performanceNow();
            const enterZoom = configNumber('canvasOverviewEnterZoom', 0.32);
            const exitZoom = configNumber('canvasOverviewExitZoom', 0.42);
            const nextMode = now < wheelPreviewLodUntil
                ? 'overview'
                : (canvasRenderMode === 'overview'
                    ? (zoom >= exitZoom ? 'full' : 'overview')
                    : (zoom <= enterZoom ? 'overview' : 'full'));
            if (nextMode !== canvasRenderMode) {
                canvasRenderMode = nextMode;
                sourceCall(stateSource, 'setEdgeRenderCacheKey', undefined, '');
            }
            const root = getRoot();
            if (root) root.dataset.canvasRenderMode = canvasRenderMode;
            return canvasRenderMode;
        }

        function resetCanvasRenderModeForProject(nextProject) {
            const zoom = Number(nextProject?.viewport?.zoom || 1) || 1;
            canvasRenderMode = zoom <= configNumber('canvasOverviewEnterZoom', 0.32) ? 'overview' : 'full';
            sourceCall(stateSource, 'setEdgeRenderCacheKey', undefined, '');
            const root = getRoot();
            if (root) root.dataset.canvasRenderMode = canvasRenderMode;
            return canvasRenderMode;
        }

        function isWheelPreviewLodActive() {
            return performanceNow() < wheelPreviewLodUntil;
        }

        function shouldUseWheelPreviewLod(oldZoom, nextZoom) {
            const nodeCount = Array.isArray(getProject().nodes) ? getProject().nodes.length : 0;
            if (nodeCount < configNumber('wheelPreviewLodNodeCount', 180)) return false;
            return Math.min(Number(oldZoom || 1), Number(nextZoom || 1))
                <= configNumber('wheelPreviewLodMaxZoom', configNumber('canvasOverviewExitZoom', 0.42));
        }

        function renderPerformanceHud(force, nowValue) {
            const perfHudElement = getPerfHudElement();
            const root = getRoot();
            if (!perfHudElement || !root || root.hidden) return;
            const now = Number(nowValue || performanceNow());
            if (!force && now - perfHudLastRenderAt < 250) return;
            perfHudLastRenderAt = now;
            const stats = getPerfStats() || {};
            const fmtMs = (value) => `${Number(value || 0).toFixed(2)}ms`;
            const fmtFps = (value) => Number(value || 0).toFixed(1);
            perfHudElement.innerHTML = [
                `T: ${escapeHtml(fmtMs(stats.renderTotalMs))}`,
                `N: ${escapeHtml(String(stats.renderedNodes || 0))} [${escapeHtml(String(stats.totalNodes || 0))}]`,
                `E: ${escapeHtml(String(stats.renderedEdges || 0))} [${escapeHtml(String(stats.totalEdges || 0))}]`,
                `n: ${escapeHtml(fmtMs(stats.renderNodesMs))}`,
                `e: ${escapeHtml(fmtMs(stats.renderEdgesMs))}`,
                `FPS: ${escapeHtml(fmtFps(stats.fps))}`
            ].join('<br>');
        }

        function renderViewportSettledState() {
            const root = getRoot();
            if (!root || root.hidden) return;
            const viewportElement = getViewportElement();
            viewportElement?.classList?.add('is-post-zoom-refresh');
            const startedAt = performanceNow();
            renderCall('renderNodes', undefined);
            renderCall('renderEdges', undefined);
            renderCall('renderSelectedChainOverlay', undefined);
            renderCall('renderMinimap', undefined);
            setPerfStat('renderTotalMs', performanceNow() - startedAt);
            renderPerformanceHud(true);
            requestFrame(() => {
                requestFrame(() => viewportElement?.classList?.remove('is-post-zoom-refresh'));
            });
        }

        function flushWheelPreviewLodRender() {
            if (wheelPreviewLodTimer) {
                clearTimeout(wheelPreviewLodTimer);
                wheelPreviewLodTimer = 0;
            }
            if (viewportZoomSettleTimer) {
                clearTimeout(viewportZoomSettleTimer);
                viewportZoomSettleTimer = 0;
            }
            wheelPreviewLodUntil = 0;
            const viewportElement = getViewportElement();
            viewportElement?.classList?.remove('is-zooming');
            if (!getRoot() || getRoot().hidden) return;
            renderViewportSettledState();
        }

        function cancelWheelPreviewLod() {
            if (wheelPreviewLodTimer) {
                clearTimeout(wheelPreviewLodTimer);
                wheelPreviewLodTimer = 0;
            }
            if (viewportZoomSettleTimer) {
                clearTimeout(viewportZoomSettleTimer);
                viewportZoomSettleTimer = 0;
            }
            wheelPreviewLodUntil = 0;
            const viewportElement = getViewportElement();
            viewportElement?.classList?.remove('is-zooming');
            viewportElement?.classList?.remove('is-post-zoom-refresh');
        }

        function beginWheelPreviewLod(oldZoom, nextZoom) {
            if (!shouldUseWheelPreviewLod(oldZoom, nextZoom)) return;
            wheelPreviewLodUntil = performanceNow() + configNumber('wheelPreviewLodSettleMs', 720);
            const viewportElement = getViewportElement();
            viewportElement?.classList?.add('is-zooming');
            if (wheelPreviewLodTimer) clearTimeout(wheelPreviewLodTimer);
            wheelPreviewLodTimer = setTimeout(flushWheelPreviewLodRender, configNumber('wheelPreviewLodSettleMs', 720));
        }

        function flushViewportZoomSettleRender() {
            if (viewportZoomSettleTimer) {
                clearTimeout(viewportZoomSettleTimer);
                viewportZoomSettleTimer = 0;
            }
            if (isWheelPreviewLodActive()) return;
            getViewportElement()?.classList?.remove('is-zooming');
            renderViewportSettledState();
        }

        function scheduleViewportZoomSettleRender() {
            getViewportElement()?.classList?.add('is-zooming');
            if (viewportZoomSettleTimer) clearTimeout(viewportZoomSettleTimer);
            viewportZoomSettleTimer = setTimeout(flushViewportZoomSettleRender, 180);
        }

        function scheduleViewportNodeRender() {
            const root = getRoot();
            if (!root || root.hidden || viewportRenderFrame) return;
            viewportRenderFrame = requestFrame(() => {
                const startedAt = performanceNow();
                viewportRenderFrame = 0;
                const fallbackUntil = Number(edgeCall('getSvgFallbackUntil', 0)) || 0;
                const useSvgEdgeFallback = performanceNow() < fallbackUntil;
                const wheelPreviewActive = isWheelPreviewLodActive();
                renderCall('renderNodes', undefined, wheelPreviewActive ? { panPreview: true } : undefined);
                if (!interactionCall('isPanning', false) && !wheelPreviewActive) {
                    if (useSvgEdgeFallback) renderCall('renderEdgesWithSvgFallback', undefined);
                    else renderCall('renderEdges', undefined);
                    renderCall('renderSelectedChainOverlay', undefined);
                }
                setPerfStat('renderTotalMs', performanceNow() - startedAt);
                renderPerformanceHud(true);
            });
        }

        function renderInteractiveLinks(nodeIds) {
            if (!renderCall('updateInteractiveEdgeDom', false, nodeIds)) {
                if (shouldSuppressDragEdgeRender()) addPerfStat('dragEdgeLodSuppressed', 1);
                else renderCall('renderEdges', undefined);
            }
            renderCall('renderSelectedChainOverlay', undefined);
        }

        function mergeInteractiveLinkNodeIds(nodeIds) {
            if (!Array.isArray(nodeIds) || !nodeIds.length) return;
            if (!interactiveLinkRenderNodeIds) interactiveLinkRenderNodeIds = new Set();
            nodeIds.forEach((id) => {
                if (id) interactiveLinkRenderNodeIds.add(id);
            });
        }

        function scheduleInteractiveLinkRender(options) {
            const root = getRoot();
            if (!root || root.hidden) return;
            mergeInteractiveLinkNodeIds(options?.nodeIds);
            if (interactiveLinkRenderFrame) return;
            interactiveLinkRenderFrame = requestFrame(() => {
                const nodeIds = interactiveLinkRenderNodeIds ? Array.from(interactiveLinkRenderNodeIds) : null;
                interactiveLinkRenderNodeIds = null;
                interactiveLinkRenderFrame = 0;
                renderInteractiveLinks(nodeIds);
            });
        }

        function flushInteractiveLinkRender(options) {
            const opts = options || {};
            let nodeIds = Array.isArray(opts.nodeIds) ? opts.nodeIds : null;
            if (interactiveLinkRenderFrame) {
                cancelFrame(interactiveLinkRenderFrame);
                interactiveLinkRenderFrame = 0;
            }
            if (!nodeIds && interactiveLinkRenderNodeIds) nodeIds = Array.from(interactiveLinkRenderNodeIds);
            interactiveLinkRenderNodeIds = null;
            if (!getRoot() || getRoot().hidden) return;
            renderInteractiveLinks(nodeIds);
        }

        function getDragEdgeLodBlockReason() {
            const project = getProject();
            const edgeCount = Array.isArray(project.edges) ? project.edges.length : 0;
            if (edgeCount < configNumber('dragEdgeLodMinEdges', 900)) return `edges:${edgeCount}`;
            if (project.settings?.edgeLabels) return 'edge-labels';
            const mode = updateCanvasRenderMode();
            if (mode !== 'overview') return `mode:${mode}`;
            return '';
        }

        function shouldUseDragEdgeLod() {
            return !getDragEdgeLodBlockReason();
        }

        function cancelDragEdgeSettleRender() {
            if (dragEdgeSettleFrame) {
                cancelFrame(dragEdgeSettleFrame);
                dragEdgeSettleFrame = 0;
            }
            dragEdgeSettleStartedAt = 0;
            setPerfStat('dragEdgeLodPending', 0);
        }

        function beginDragEdgeLod() {
            cancelDragEdgeSettleRender();
            const blockedBy = getDragEdgeLodBlockReason();
            setPerfStat('dragEdgeLodLastReason', blockedBy || 'active');
            if (blockedBy) {
                addPerfStat('dragEdgeLodSkipped', 1);
                return;
            }
            dragEdgeLodActive = true;
            setPerfStat('dragEdgeLodActive', 1);
            getViewportElement()?.classList?.add('is-drag-edge-lod');
        }

        function endDragEdgeLodVisual() {
            dragEdgeLodActive = false;
            setPerfStat('dragEdgeLodActive', 0);
            getViewportElement()?.classList?.remove('is-drag-edge-lod');
        }

        function isDragEdgeLodActive() {
            return dragEdgeLodActive;
        }

        function shouldSuppressDragEdgeRender() {
            return dragEdgeLodActive
                && !!(interactionCall('isNodeDragging', false) || interactionCall('isGroupDragging', false));
        }

        function scheduleDragEdgeSettleRender() {
            cancelDragEdgeSettleRender();
            if (!getRoot() || getRoot().hidden) {
                endDragEdgeLodVisual();
                return;
            }
            if (interactiveLinkRenderFrame) {
                cancelFrame(interactiveLinkRenderFrame);
                interactiveLinkRenderFrame = 0;
            }
            interactiveLinkRenderNodeIds = null;
            dragEdgeSettleStartedAt = performanceNow();
            addPerfStat('dragEdgeLodDeferred', 1);
            setPerfStat('dragEdgeLodPending', 1);
            dragEdgeSettleFrame = requestFrame(() => {
                dragEdgeSettleFrame = 0;
                if (!getRoot() || getRoot().hidden
                    || interactionCall('isNodeDragging', false)
                    || interactionCall('isGroupDragging', false)) {
                    setPerfStat('dragEdgeLodPending', 0);
                    dragEdgeSettleStartedAt = 0;
                    return;
                }
                const startedAt = performanceNow();
                const project = getProject();
                if ((project.edges || []).length >= configNumber('canvasEdgeFinalRenderMinEdges', 900)) {
                    renderCall('renderEdgesWithCanvasPreferred', undefined);
                } else {
                    renderCall('renderEdgesWithSvgFallback', undefined);
                }
                renderCall('renderSelectedChainOverlay', undefined);
                setPerfStat('dragEdgeSettleMs', performanceNow() - startedAt);
                setPerfStat(
                    'dragEdgeSettleDelayMs',
                    dragEdgeSettleStartedAt ? performanceNow() - dragEdgeSettleStartedAt : performanceNow() - startedAt
                );
                dragEdgeSettleStartedAt = 0;
                setPerfStat('dragEdgeLodPending', 0);
                endDragEdgeLodVisual();
                renderPerformanceHud(true);
            });
        }

        function shouldDeferPanEdgeSettleRender() {
            return Array.isArray(getProject().edges)
                && getProject().edges.length >= configNumber('panEdgeSettleLodMinEdges', 900);
        }

        function cancelPanEdgeSettleRender() {
            if (panEdgeSettleFrame) {
                cancelFrame(panEdgeSettleFrame);
                panEdgeSettleFrame = 0;
            }
            panEdgeSettleStartedAt = 0;
            setPerfStat('panEdgeLodPending', 0);
        }

        function schedulePanEdgeSettleRender() {
            cancelPanEdgeSettleRender();
            if (!getRoot() || getRoot().hidden) return;
            panEdgeSettleStartedAt = performanceNow();
            addPerfStat('panEdgeLodDeferred', 1);
            setPerfStat('panEdgeLodPending', 1);
            panEdgeSettleFrame = requestFrame(() => {
                panEdgeSettleFrame = 0;
                if (!getRoot() || getRoot().hidden || interactionCall('isPanning', false)) {
                    setPerfStat('panEdgeLodPending', 0);
                    panEdgeSettleStartedAt = 0;
                    return;
                }
                const startedAt = performanceNow();
                renderCall('renderEdgesWithCanvasPreferred', undefined);
                renderCall('renderSelectedChainOverlay', undefined);
                setPerfStat('panEdgeSettleMs', performanceNow() - startedAt);
                setPerfStat(
                    'panEdgeSettleDelayMs',
                    panEdgeSettleStartedAt ? performanceNow() - panEdgeSettleStartedAt : performanceNow() - startedAt
                );
                panEdgeSettleStartedAt = 0;
                setPerfStat('panEdgeLodPending', 0);
                renderPerformanceHud(true);
            });
        }

        function clearPanNodeRenderTimer() {
            if (panNodeRenderTimer) {
                clearTimeout(panNodeRenderTimer);
                panNodeRenderTimer = 0;
            }
        }

        function schedulePanNodeRender() {
            const root = getRoot();
            if (!root || root.hidden || panNodeRenderTimer) return;
            if (interactionCall('isVisibleWorldRectCoveredByRenderedNodes', false)) return;
            const renderWindow = viewportCall('getNodeRenderWorldRect', null);
            if (interactionCall('shouldDeferPanNodeRender', false, renderWindow)) return;
            const now = performanceNow();
            const delay = Math.max(0, 140 - (now - panNodeRenderLastAt));
            panNodeRenderTimer = setTimeout(() => {
                panNodeRenderTimer = 0;
                if (!interactionCall('isPanning', false) || !getRoot() || getRoot().hidden) return;
                if (interactionCall('isVisibleWorldRectCoveredByRenderedNodes', false)) return;
                panNodeRenderLastAt = performanceNow();
                const startedAt = performanceNow();
                renderCall('renderNodes', undefined, { panPreview: true });
                renderCall('renderEdgesWithSvgFallback', undefined);
                setPerfStat('renderTotalMs', performanceNow() - startedAt);
                renderPerformanceHud(true);
            }, delay);
        }

        function startPerformanceHud() {
            if (perfFrameHandle) return;
            perfFrameLastAt = performanceNow();
            const tick = (now) => {
                const root = getRoot();
                if (!root || root.hidden) {
                    perfFrameHandle = 0;
                    return;
                }
                const delta = Math.max(0.001, now - (perfFrameLastAt || now));
                perfFrameLastAt = now;
                perfFrameSamples.push(1000 / delta);
                if (perfFrameSamples.length > 40) perfFrameSamples.shift();
                const sum = perfFrameSamples.reduce((acc, value) => acc + value, 0);
                setPerfStat('fps', sum / Math.max(1, perfFrameSamples.length));
                renderPerformanceHud(false, now);
                perfFrameHandle = requestFrame(tick);
            };
            perfFrameHandle = requestFrame(tick);
        }

        function stopPerformanceHud() {
            if (perfFrameHandle) cancelFrame(perfFrameHandle);
            perfFrameHandle = 0;
            perfFrameSamples = [];
        }

        function resetPerformanceState() {
            perfFrameLastAt = 0;
            perfHudLastRenderAt = 0;
            perfFrameSamples = [];
        }

        return {
            applyViewport,
            updateCanvasRenderMode,
            resetCanvasRenderModeForProject,
            getCanvasRenderMode: () => canvasRenderMode,
            isWheelPreviewLodActive,
            shouldUseWheelPreviewLod,
            flushWheelPreviewLodRender,
            cancelWheelPreviewLod,
            beginWheelPreviewLod,
            renderViewportSettledState,
            flushViewportZoomSettleRender,
            scheduleViewportZoomSettleRender,
            scheduleViewportNodeRender,
            renderInteractiveLinks,
            scheduleInteractiveLinkRender,
            flushInteractiveLinkRender,
            getDragEdgeLodBlockReason,
            shouldUseDragEdgeLod,
            cancelDragEdgeSettleRender,
            beginDragEdgeLod,
            endDragEdgeLodVisual,
            isDragEdgeLodActive,
            shouldSuppressDragEdgeRender,
            scheduleDragEdgeSettleRender,
            shouldDeferPanEdgeSettleRender,
            cancelPanEdgeSettleRender,
            schedulePanEdgeSettleRender,
            clearPanNodeRenderTimer,
            schedulePanNodeRender,
            startPerformanceHud,
            stopPerformanceHud,
            resetPerformanceState,
            renderPerformanceHud,
            isInteractiveLinkRenderPending: () => !!interactiveLinkRenderFrame
        };
    }

    window.SimpAICanvasWorkbenchViewportRenderScheduler = Object.assign(
        {},
        window.SimpAICanvasWorkbenchViewportRenderScheduler || {},
        { createCanvasViewportRenderSchedulerController }
    );
})();
