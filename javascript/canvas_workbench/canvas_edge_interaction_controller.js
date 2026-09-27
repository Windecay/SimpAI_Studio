(function () {
    'use strict';

    function createCanvasEdgeInteractionController(context) {
        const scope = context?.edgeInteractionSource || context || {};
        const domSource = scope.domSource || {};
        const nodeSource = scope.nodeSource || {};
        const edgeSource = scope.edgeSource || {};
        const menuSource = scope.menuSource || {};
        const languageSource = scope.languageSource || {};
        const noteTailSource = scope.noteTailSource || {};
        const sourceCall = (sourceObject, name, fallback, ...args) => typeof sourceObject[name] === 'function'
            ? sourceObject[name](...args)
            : fallback;
        const getEdgesLayer = () => sourceCall(domSource, 'getEdgesLayer', null);
        const getNode = (id) => sourceCall(nodeSource, 'getNode', null, id);
        const edgeCall = (name, fallback, ...args) => sourceCall(edgeSource, name, fallback, ...args);
        const menuCall = (name, fallback, ...args) => sourceCall(menuSource, name, fallback, ...args);
        const t = typeof languageSource.t === 'function' ? languageSource.t : (en) => en;
        const noteTailCall = (name, fallback, ...args) => sourceCall(noteTailSource, name, fallback, ...args);

        function openEdgeContextMenu(edgeId, x, y) {
            menuCall('openContextMenu', undefined, x, y, [
                { label: t('Delete edge', '删除连线'), icon: 'fa-trash', danger: true, action: () => edgeCall('deleteEdge', undefined, edgeId) }
            ]);
        }

        function edgeElementFromEvent(evt) {
            const edgeEl = evt?.target?.closest?.('[data-edge-id]');
            if (!edgeEl || !getEdgesLayer()?.contains(edgeEl)) return null;
            return edgeEl;
        }

        function handleEdgeLayerClick(evt) {
            const edgeEl = edgeElementFromEvent(evt);
            if (!edgeEl) return;
            evt.stopPropagation();
            edgeCall('selectEdge', undefined, edgeEl.getAttribute('data-edge-id'));
        }

        function handleEdgeLayerContextMenu(evt) {
            const edgeEl = edgeElementFromEvent(evt);
            if (!edgeEl) return;
            evt.preventDefault();
            evt.stopPropagation();
            const edgeId = edgeEl.getAttribute('data-edge-id');
            edgeCall('selectEdge', undefined, edgeId);
            openEdgeContextMenu(edgeId, evt.clientX, evt.clientY);
        }

        function handleEdgeLayerPointerDown(evt) {
            if (!evt || evt.button !== 0) return;
            const anchor = evt.target?.closest?.('[data-note-tail-anchor]');
            if (!anchor || !getEdgesLayer()?.contains(anchor)) return;
            const node = getNode(anchor.getAttribute('data-note-tail-anchor'));
            if (!node || node.type !== 'note') return;
            evt.preventDefault();
            evt.stopPropagation();
            noteTailCall('startNoteTailDrag', undefined, node, evt);
        }

        return {
            openEdgeContextMenu,
            handleEdgeLayerClick,
            handleEdgeLayerContextMenu,
            handleEdgeLayerPointerDown
        };
    }

    window.SimpAICanvasWorkbenchEdgeInteraction = Object.assign({}, window.SimpAICanvasWorkbenchEdgeInteraction || {}, {
        createCanvasEdgeInteractionController
    });
})();
