(function () {
    'use strict';

    function createCanvasEdgeInteractionController(context) {
        const scope = context || {};
        const getEdgesLayer = () => typeof scope.getEdgesLayer === 'function' ? scope.getEdgesLayer() : null;
        const getNode = (id) => typeof scope.getNode === 'function' ? scope.getNode(id) : null;
        const call = (name, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : undefined;

        function edgeElementFromEvent(evt) {
            const edgeEl = evt?.target?.closest?.('[data-edge-id]');
            if (!edgeEl || !getEdgesLayer()?.contains(edgeEl)) return null;
            return edgeEl;
        }

        function handleEdgeLayerClick(evt) {
            const edgeEl = edgeElementFromEvent(evt);
            if (!edgeEl) return;
            evt.stopPropagation();
            call('selectEdge', edgeEl.getAttribute('data-edge-id'));
        }

        function handleEdgeLayerContextMenu(evt) {
            const edgeEl = edgeElementFromEvent(evt);
            if (!edgeEl) return;
            evt.preventDefault();
            evt.stopPropagation();
            const edgeId = edgeEl.getAttribute('data-edge-id');
            call('selectEdge', edgeId);
            call('openEdgeContextMenu', edgeId, evt.clientX, evt.clientY);
        }

        function handleEdgeLayerPointerDown(evt) {
            if (!evt || evt.button !== 0) return;
            const anchor = evt.target?.closest?.('[data-note-tail-anchor]');
            if (!anchor || !getEdgesLayer()?.contains(anchor)) return;
            const node = getNode(anchor.getAttribute('data-note-tail-anchor'));
            if (!node || node.type !== 'note') return;
            evt.preventDefault();
            evt.stopPropagation();
            call('startNoteTailDrag', node, evt);
        }

        return {
            handleEdgeLayerClick,
            handleEdgeLayerContextMenu,
            handleEdgeLayerPointerDown
        };
    }

    window.SimpAICanvasWorkbenchEdgeInteraction = Object.assign({}, window.SimpAICanvasWorkbenchEdgeInteraction || {}, {
        createCanvasEdgeInteractionController
    });
})();
