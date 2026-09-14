(function () {
    'use strict';

    function createCanvasViewportContextController(context) {
        const scope = context?.viewportContextSource || context || {};
        const domSource = scope.domSource || {};
        const viewportSource = scope.viewportSource || {};
        const edgeSource = scope.edgeSource || {};
        const menuSource = scope.menuSource || {};
        const sourceCall = (sourceObject, name, fallback, ...args) => typeof sourceObject[name] === 'function'
            ? sourceObject[name](...args)
            : fallback;
        const getRoot = () => sourceCall(domSource, 'getRoot', null);
        const viewportCall = (name, fallback, ...args) => sourceCall(viewportSource, name, fallback, ...args);
        const edgeCall = (name, fallback, ...args) => sourceCall(edgeSource, name, fallback, ...args);
        const menuCall = (name, fallback, ...args) => sourceCall(menuSource, name, fallback, ...args);

        function onViewportContextMenu(evt) {
            const root = getRoot();
            if (!evt || !root || root.hidden) return;
            evt.preventDefault();
            const world = viewportCall('clientToWorld', { x: 0, y: 0 }, evt.clientX, evt.clientY) || { x: 0, y: 0 };
            viewportCall('setLastPointerWorld', undefined, world);
            const target = evt.target;
            if (target?.closest?.('.sai-canvas-node') || target?.closest?.('.sai-canvas-edge')) return;
            const canvasEdge = edgeCall('findCanvasEdgeAtClient', null, evt.clientX, evt.clientY);
            if (canvasEdge) {
                evt.stopPropagation();
                edgeCall('selectEdge', undefined, canvasEdge.id);
                menuCall('openEdgeContextMenu', undefined, canvasEdge.id, evt.clientX, evt.clientY);
                return;
            }
            menuCall('openAddNodeMenu', undefined, evt.clientX, evt.clientY, world, true);
        }

        return { onViewportContextMenu };
    }

    window.SimpAICanvasWorkbenchViewportContext = Object.assign({}, window.SimpAICanvasWorkbenchViewportContext || {}, {
        createCanvasViewportContextController
    });
})();
