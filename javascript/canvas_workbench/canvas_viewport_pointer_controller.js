(function () {
    'use strict';

    function createCanvasViewportPointerController(context) {
        const scope = context || {};
        const call = (name, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : undefined;
        const t = typeof scope.t === 'function' ? scope.t : (en) => en;

        function handleViewportNodePointerDown(node, evt) {
            if (!node || evt?.button !== 0) return false;
            evt.preventDefault();
            evt.stopPropagation();
            if (call('isCanvasAgentPickingReference')) {
                if (call('addCanvasAgentReferenceFromNode', node)) {
                    call('setCanvasAgentPickingReference', false);
                    call('renderCanvasAgentPanel');
                }
                return true;
            }
            if (evt.ctrlKey || evt.metaKey || evt.shiftKey) {
                call('toggleNodeSelectionLight', node.id);
                return true;
            }
            if (!call('isNodeSelected', node.id)) {
                call('selectNodeLight', node.id);
            } else if (call('getSelectedNodeId') !== node.id || call('hasSelectedEdge')) {
                call('focusSelectedNode', node.id);
            }
            call('startNodeDrag', call('getNode', node.id) || node, evt);
            return true;
        }

        function onViewportPointerDown(evt) {
            if (!evt || (evt.button !== 0 && evt.button !== 1)) return;
            call('closeContextMenu');
            const world = call('clientToWorld', evt.clientX, evt.clientY) || { x: 0, y: 0 };
            call('setLastPointerWorld', world);
            if (evt.button === 1) {
                evt.preventDefault();
                call('startPan', evt);
                return;
            }
            const target = evt.target;
            if (target?.closest?.('.sai-canvas-node')
                || target?.closest?.('.sai-canvas-edge')
                || target?.closest?.('.sai-chain-run-overlay')) return;
            const canvasEdge = call('findCanvasEdgeAtClient', evt.clientX, evt.clientY);
            if (canvasEdge) {
                evt.preventDefault();
                evt.stopPropagation();
                call('selectEdge', canvasEdge.id);
                return;
            }
            const canvasNode = call('findCanvasNodeAtWorldPoint', world);
            if (canvasNode && handleViewportNodePointerDown(canvasNode, evt)) return;
            if (call('isCanvasAgentPickingReference')) {
                evt.preventDefault();
                call('setCanvasAgentPickingReference', false);
                call('setCanvasAgentMessage', t('Reference picking cancelled.', '已取消引用选择。'));
                call('renderCanvasAgentPanel');
                return;
            }
            if (evt.button === 0 && (call('getMode') === 'hand' || evt.altKey)) {
                evt.preventDefault();
                call('startPan', evt);
                return;
            }
            if (evt.button === 0) {
                evt.preventDefault();
                call('startMarqueeSelection', evt, world);
            }
        }

        function onViewportDoubleClick(evt) {
            const root = call('getRoot');
            if (!evt || !root || root.hidden) return;
            const target = evt.target;
            if (target?.closest?.('.sai-canvas-node') || target?.closest?.('.sai-canvas-edge')) return;
            if (call('findCanvasEdgeAtClient', evt.clientX, evt.clientY)) return;
            evt.preventDefault();
            evt.stopPropagation();
            const world = call('clientToWorld', evt.clientX, evt.clientY) || { x: 0, y: 0 };
            call('setLastPointerWorld', world);
            call('setTimeout', () => call('openAddNodeMenu', evt.clientX, evt.clientY, world, false, 420), 120);
        }

        return {
            handleViewportNodePointerDown,
            onViewportPointerDown,
            onViewportDoubleClick
        };
    }

    window.SimpAICanvasWorkbenchViewportPointer = Object.assign({}, window.SimpAICanvasWorkbenchViewportPointer || {}, {
        createCanvasViewportPointerController
    });
})();
