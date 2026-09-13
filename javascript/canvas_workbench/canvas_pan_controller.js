(function () {
    'use strict';

    function createCanvasPanController(context) {
        const scope = context || {};
        const sourceObject = (name) => {
            const value = scope[name];
            return value && typeof value === 'object' ? value : {};
        };
        const projectSource = sourceObject('projectSource');
        const viewportSource = sourceObject('viewportSource');
        const domSource = sourceObject('domSource');
        const runtimeSource = sourceObject('runtimeSource');
        const patchSource = sourceObject('patchSource');
        const uiSource = sourceObject('uiSource');
        const edgeSource = sourceObject('edgeSource');
        const minimapSource = sourceObject('minimapSource');
        const renderSource = sourceObject('renderSource');
        const persistenceSource = sourceObject('persistenceSource');
        const sourceCall = (source, name, fallback, ...args) => typeof source[name] === 'function'
            ? source[name](...args)
            : fallback;
        const getProject = () => sourceCall(projectSource, 'getProject', {}) || {};
        const getViewport = () => sourceCall(viewportSource, 'getViewport', null);
        const getDocument = () => typeof domSource.getDocument === 'function'
            ? domSource.getDocument()
            : (typeof document !== 'undefined' ? document : null);
        const getPerformanceNow = () => typeof runtimeSource.performanceNow === 'function'
            ? runtimeSource.performanceNow()
            : (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now());
        const getPerfStats = () => sourceCall(runtimeSource, 'getPerfStats', {}) || {};
        const uiCall = (name, fallback, ...args) => sourceCall(uiSource, name, fallback, ...args);
        const edgeCall = (name, fallback, ...args) => sourceCall(edgeSource, name, fallback, ...args);
        const minimapCall = (name, fallback, ...args) => sourceCall(minimapSource, name, fallback, ...args);
        const renderCall = (name, fallback, ...args) => sourceCall(renderSource, name, fallback, ...args);
        const persistenceCall = (name, fallback, ...args) => sourceCall(persistenceSource, name, fallback, ...args);
        let panState = null;

        function applyProjectViewportPatch(project, viewportPatch) {
            const patch = sourceCall(patchSource, 'buildProjectViewportPatch', undefined, project, { viewportPatch });
            if (patch && typeof patch === 'object'
                && patch.viewport
                && typeof patch.viewport === 'object'
                && !Array.isArray(patch.viewport)) {
                Object.assign(project, patch);
                return;
            }
            const currentViewport = project?.viewport
                && typeof project.viewport === 'object'
                && !Array.isArray(project.viewport)
                ? project.viewport
                : {};
            Object.assign(project, { viewport: Object.assign({}, currentViewport, viewportPatch || {}) });
        }

        function startPan(evt) {
            uiCall('hideCanvasTooltip', undefined);
            uiCall('hideHoverPreview', undefined);
            uiCall('closePreviewSelectMenu', undefined);
            edgeCall('cancelPanEdgeSettleRender', undefined);
            edgeCall('cancelDragEdgeSettleRender', undefined);
            edgeCall('endDragEdgeLodVisual', undefined);
            edgeCall('preferSvgEdgesForViewportInteraction', undefined, 5000);
            const viewport = getViewport();
            const project = getProject();
            if (!viewport || !evt) return;
            try { viewport.setPointerCapture?.(evt.pointerId); } catch (err) {}
            panState = {
                pointerId: evt.pointerId,
                startClientX: evt.clientX,
                startClientY: evt.clientY,
                startX: project.viewport?.x || 0,
                startY: project.viewport?.y || 0
            };
            viewport.classList?.add?.('is-panning');
            const doc = getDocument();
            doc?.addEventListener('pointermove', onPanMove, true);
            doc?.addEventListener('pointerup', stopPan, true);
            doc?.addEventListener('pointercancel', stopPan, true);
        }

        function onPanMove(evt) {
            if (!panState || !evt || evt.pointerId !== panState.pointerId) return;
            evt.preventDefault?.();
            const project = getProject();
            applyProjectViewportPatch(project, {
                x: Math.round(panState.startX + evt.clientX - panState.startClientX),
                y: Math.round(panState.startY + evt.clientY - panState.startClientY)
            });
            edgeCall('preferSvgEdgesForViewportInteraction', undefined, 5000);
            sourceCall(viewportSource, 'applyViewport', undefined);
            minimapCall('updateMinimapForViewportInteraction', undefined);
            renderCall('schedulePanNodeRender', undefined);
        }

        function stopPan(evt) {
            if (!panState) return;
            if (evt && evt.pointerId !== panState.pointerId) return;
            const pointerId = panState.pointerId;
            panState = null;
            uiCall('setSuppressWheelUntil', undefined, 0);
            const viewport = getViewport();
            try { viewport?.releasePointerCapture?.(pointerId); } catch (err) {}
            viewport?.classList?.remove?.('is-panning');
            edgeCall('preferSvgEdgesForViewportInteraction', undefined, 5000);
            const doc = getDocument();
            doc?.removeEventListener('pointermove', onPanMove, true);
            doc?.removeEventListener('pointerup', stopPan, true);
            doc?.removeEventListener('pointercancel', stopPan, true);
            renderCall('clearPanNodeRenderTimer', undefined);
            minimapCall('cancelMinimapRender', undefined);

            const startedAt = getPerformanceNow();
            const visibleWorld = renderCall('getVisibleWorldRect', {});
            const deferPanEdges = !!renderCall('shouldDeferPanEdgeSettleRender', false);
            renderCall('renderNodes', undefined, { skipLayoutMinimap: true, skipAgentPosition: true });
            if (deferPanEdges) {
                renderCall('schedulePanEdgeSettleRender', undefined);
            } else {
                edgeCall('renderFinalEdgesAfterPan', undefined);
            }
            minimapCall('renderMinimap', undefined, { visibleWorld });
            const perfStats = getPerfStats();
            perfStats.renderTotalMs = getPerformanceNow() - startedAt;
            renderCall('renderPerformanceHud', undefined, true);
            persistenceCall('scheduleSave', undefined);
        }

        return {
            startPan,
            onPanMove,
            stopPan,
            isPanning: () => !!panState
        };
    }

    window.SimpAICanvasWorkbenchPan = Object.assign({}, window.SimpAICanvasWorkbenchPan || {}, {
        createCanvasPanController
    });
})();
