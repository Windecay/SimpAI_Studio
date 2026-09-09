(function () {
    'use strict';

    function createCanvasViewportContextController(context) {
        const scope = context || {};
        const getRoot = () => typeof scope.getRoot === 'function' ? scope.getRoot() : null;
        const call = (name, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : undefined;

        function onViewportContextMenu(evt) {
            const root = getRoot();
            if (!evt || !root || root.hidden) return;
            evt.preventDefault();
            const world = call('clientToWorld', evt.clientX, evt.clientY) || { x: 0, y: 0 };
            call('setLastPointerWorld', world);
            const target = evt.target;
            if (target?.closest?.('.sai-canvas-node') || target?.closest?.('.sai-canvas-edge')) return;
            const canvasEdge = call('findCanvasEdgeAtClient', evt.clientX, evt.clientY);
            if (canvasEdge) {
                evt.stopPropagation();
                call('selectEdge', canvasEdge.id);
                call('openEdgeContextMenu', canvasEdge.id, evt.clientX, evt.clientY);
                return;
            }
            call('openAddNodeMenu', evt.clientX, evt.clientY, world, true);
        }

        return { onViewportContextMenu };
    }

    window.SimpAICanvasWorkbenchViewportContext = Object.assign({}, window.SimpAICanvasWorkbenchViewportContext || {}, {
        createCanvasViewportContextController
    });
})();
