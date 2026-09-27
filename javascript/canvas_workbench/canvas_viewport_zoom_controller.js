(function () {
    'use strict';

    function createCanvasViewportZoomController(context) {
        const scope = context?.viewportZoomSource || context || {};
        const source = name => scope[name] && typeof scope[name] === 'object' ? scope[name] : {};
        const projectSource = source('projectSource');
        const viewportSource = source('viewportSource');
        const interactionSource = source('interactionSource');
        const renderSource = source('renderSource');
        const persistenceSource = source('persistenceSource');
        const call = (target, name, fallback, ...args) => typeof target[name] === 'function'
            ? target[name](...args)
            : fallback;
        const getProject = () => call(projectSource, 'getProject', {}) || {};
        const getViewport = () => call(viewportSource, 'getViewport', null);
        const clamp = (value, min, max) => call(
            viewportSource,
            'clamp',
            Math.max(min, Math.min(max, value)),
            value,
            min,
            max
        );

        function zoomAtClient(clientX, clientY, factor) {
            const before = call(viewportSource, 'clientToWorld', { x: 0, y: 0 }, clientX, clientY);
            const oldZoom = getProject().viewport.zoom || 1;
            const nextZoom = clamp(oldZoom * factor, 0.15, 3);
            if (Math.abs(nextZoom - oldZoom) < 0.0001) return;
            const rect = getViewport().getBoundingClientRect();
            call(interactionSource, 'cancelPanEdgeSettleRender', undefined);
            call(interactionSource, 'cancelDragEdgeSettleRender', undefined);
            call(interactionSource, 'endDragEdgeLodVisual', undefined);
            call(interactionSource, 'beginWheelPreviewLod', undefined, oldZoom, nextZoom);
            call(viewportSource, 'applyProjectViewportPatch', undefined, {
                zoom: nextZoom,
                x: Math.round(clientX - rect.left - before.x * nextZoom),
                y: Math.round(clientY - rect.top - before.y * nextZoom)
            });
            call(renderSource, 'preferSvgEdgesForViewportInteraction', undefined, 5000);
            call(renderSource, 'applyViewport', undefined);
            call(renderSource, 'scheduleViewportNodeRender', undefined);
            call(renderSource, 'scheduleViewportZoomSettleRender', undefined);
            call(renderSource, 'renderStatus', undefined);
            call(renderSource, 'updateMinimapForViewportInteraction', undefined);
            call(persistenceSource, 'scheduleViewportSave', undefined);
        }

        function zoomAtViewportCenter(factor) {
            const rect = getViewport().getBoundingClientRect();
            zoomAtClient(rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
        }

        return { zoomAtClient, zoomAtViewportCenter };
    }

    window.SimpAICanvasWorkbenchViewportZoom = Object.assign({}, window.SimpAICanvasWorkbenchViewportZoom || {}, {
        createCanvasViewportZoomController
    });
})();
