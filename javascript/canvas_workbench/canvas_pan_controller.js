(function () {
    'use strict';

    function createCanvasPanController(context) {
        const scope = context || {};
        const getProject = () => typeof scope.getProject === 'function' ? (scope.getProject() || {}) : {};
        const getViewport = () => typeof scope.getViewport === 'function' ? scope.getViewport() : null;
        const getDocument = () => typeof scope.getDocument === 'function'
            ? scope.getDocument()
            : (typeof document !== 'undefined' ? document : null);
        const getPerformanceNow = () => typeof scope.performanceNow === 'function'
            ? scope.performanceNow()
            : (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now());
        const getPerfStats = () => typeof scope.getPerfStats === 'function' ? (scope.getPerfStats() || {}) : {};
        const call = (name, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : undefined;
        let panState = null;

        function startPan(evt) {
            call('hideCanvasTooltip');
            call('hideHoverPreview');
            call('closePreviewSelectMenu');
            call('cancelPanEdgeSettleRender');
            call('cancelDragEdgeSettleRender');
            call('endDragEdgeLodVisual');
            call('preferSvgEdgesForViewportInteraction', 5000);
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
            project.viewport = project.viewport || {};
            project.viewport.x = Math.round(panState.startX + evt.clientX - panState.startClientX);
            project.viewport.y = Math.round(panState.startY + evt.clientY - panState.startClientY);
            call('preferSvgEdgesForViewportInteraction', 5000);
            call('applyViewport');
            call('updateMinimapForViewportInteraction');
            call('schedulePanNodeRender');
        }

        function stopPan(evt) {
            if (!panState) return;
            if (evt && evt.pointerId !== panState.pointerId) return;
            const pointerId = panState.pointerId;
            panState = null;
            call('setSuppressWheelUntil', 0);
            const viewport = getViewport();
            try { viewport?.releasePointerCapture?.(pointerId); } catch (err) {}
            viewport?.classList?.remove?.('is-panning');
            call('preferSvgEdgesForViewportInteraction', 5000);
            const doc = getDocument();
            doc?.removeEventListener('pointermove', onPanMove, true);
            doc?.removeEventListener('pointerup', stopPan, true);
            doc?.removeEventListener('pointercancel', stopPan, true);
            call('clearPanNodeRenderTimer');
            call('cancelMinimapRender');

            const startedAt = getPerformanceNow();
            const visibleWorld = call('getVisibleWorldRect');
            const deferPanEdges = !!call('shouldDeferPanEdgeSettleRender');
            call('renderNodes', { skipLayoutMinimap: true, skipAgentPosition: true });
            if (deferPanEdges) {
                call('schedulePanEdgeSettleRender');
            } else {
                call('renderFinalEdgesAfterPan');
            }
            call('renderMinimap', { visibleWorld });
            const perfStats = getPerfStats();
            perfStats.renderTotalMs = getPerformanceNow() - startedAt;
            call('renderPerformanceHud', true);
            call('scheduleSave');
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
