(function () {
    'use strict';

    function createCanvasViewportPointerController(context) {
        const scope = context || {};
        const sourceObject = (name) => {
            const value = scope[name];
            return value && typeof value === 'object' ? value : {};
        };
        const languageSource = sourceObject('languageSource');
        const viewportSource = sourceObject('viewportSource');
        const domSource = sourceObject('domSource');
        const uiSource = sourceObject('uiSource');
        const edgeSource = sourceObject('edgeSource');
        const spatialSource = sourceObject('spatialSource');
        const nodeSource = sourceObject('nodeSource');
        const selectionSource = sourceObject('selectionSource');
        const interactionSource = sourceObject('interactionSource');
        const actionSource = sourceObject('actionSource');
        const runtimeSource = sourceObject('runtimeSource');
        const sourceCall = (source, name, fallback, ...args) => typeof source[name] === 'function'
            ? source[name](...args)
            : fallback;
        const languageCall = (name, fallback, ...args) => sourceCall(languageSource, name, fallback, ...args);
        const getLanguageState = (...args) => languageCall('getLanguageState', { __lang: 'en' }, ...args);
        const t = (...args) => {
            const en = args[0] || '';
            const cn = args.length > 1 ? args[1] : en;
            const state = args.length > 2 ? args[2] : getLanguageState();
            return languageCall('t', cn || en, en, cn, state);
        };
        const uiCall = (name, fallback, ...args) => sourceCall(uiSource, name, fallback, ...args);
        const viewportCall = (name, fallback, ...args) => sourceCall(viewportSource, name, fallback, ...args);
        const edgeCall = (name, fallback, ...args) => sourceCall(edgeSource, name, fallback, ...args);
        const spatialCall = (name, fallback, ...args) => sourceCall(spatialSource, name, fallback, ...args);
        const nodeCall = (name, fallback, ...args) => sourceCall(nodeSource, name, fallback, ...args);
        const selectionCall = (name, fallback, ...args) => sourceCall(selectionSource, name, fallback, ...args);
        const interactionCall = (name, fallback, ...args) => sourceCall(interactionSource, name, fallback, ...args);
        const actionCall = (name, fallback, ...args) => sourceCall(actionSource, name, fallback, ...args);
        const runtimeCall = (name, fallback, ...args) => sourceCall(runtimeSource, name, fallback, ...args);

        function handleViewportNodePointerDown(node, evt) {
            if (!node || evt?.button !== 0) return false;
            evt.preventDefault();
            evt.stopPropagation();
            if (uiCall('isCanvasAgentPickingReference', false)) {
                if (uiCall('addCanvasAgentReferenceFromNode', false, node)) {
                    uiCall('setCanvasAgentPickingReference', undefined, false);
                    uiCall('renderCanvasAgentPanel', undefined);
                }
                return true;
            }
            if (evt.ctrlKey || evt.metaKey || evt.shiftKey) {
                selectionCall('toggleNodeSelectionLight', undefined, node.id);
                return true;
            }
            if (!nodeCall('isNodeSelected', false, node.id)) {
                selectionCall('selectNodeLight', undefined, node.id);
            } else if (nodeCall('getSelectedNodeId', null) !== node.id || nodeCall('hasSelectedEdge', false)) {
                selectionCall('focusSelectedNode', undefined, node.id);
            }
            interactionCall('startNodeDrag', undefined, nodeCall('getNode', null, node.id) || node, evt);
            return true;
        }

        function onViewportPointerDown(evt) {
            if (!evt || (evt.button !== 0 && evt.button !== 1)) return;
            uiCall('closeContextMenu', undefined);
            const world = viewportCall('clientToWorld', { x: 0, y: 0 }, evt.clientX, evt.clientY) || { x: 0, y: 0 };
            viewportCall('setLastPointerWorld', undefined, world);
            if (evt.button === 1) {
                evt.preventDefault();
                interactionCall('startPan', undefined, evt);
                return;
            }
            const target = evt.target;
            if (target?.closest?.('.sai-canvas-node')
                || target?.closest?.('.sai-canvas-edge')
                || target?.closest?.('.sai-chain-run-overlay')) return;
            const canvasEdge = edgeCall('findCanvasEdgeAtClient', null, evt.clientX, evt.clientY);
            if (canvasEdge) {
                evt.preventDefault();
                evt.stopPropagation();
                edgeCall('selectEdge', undefined, canvasEdge.id);
                return;
            }
            const canvasNode = spatialCall('findCanvasNodeAtWorldPoint', null, world);
            if (canvasNode && handleViewportNodePointerDown(canvasNode, evt)) return;
            if (uiCall('isCanvasAgentPickingReference', false)) {
                evt.preventDefault();
                uiCall('setCanvasAgentPickingReference', undefined, false);
                uiCall('setCanvasAgentMessage', undefined, t('Reference picking cancelled.', '已取消引用选择。'));
                uiCall('renderCanvasAgentPanel', undefined);
                return;
            }
            if (evt.button === 0 && (viewportCall('getMode', 'select') === 'hand' || evt.altKey)) {
                evt.preventDefault();
                interactionCall('startPan', undefined, evt);
                return;
            }
            if (evt.button === 0) {
                evt.preventDefault();
                interactionCall('startMarqueeSelection', undefined, evt, world);
            }
        }

        function onViewportDoubleClick(evt) {
            const root = typeof domSource.getRoot === 'function' ? domSource.getRoot() : null;
            if (!evt || !root || root.hidden) return;
            const target = evt.target;
            if (target?.closest?.('.sai-canvas-node') || target?.closest?.('.sai-canvas-edge')) return;
            if (edgeCall('findCanvasEdgeAtClient', null, evt.clientX, evt.clientY)) return;
            evt.preventDefault();
            evt.stopPropagation();
            const world = viewportCall('clientToWorld', { x: 0, y: 0 }, evt.clientX, evt.clientY) || { x: 0, y: 0 };
            viewportCall('setLastPointerWorld', undefined, world);
            runtimeCall('setTimeout', undefined, () => actionCall('openAddNodeMenu', undefined, evt.clientX, evt.clientY, world, false, 420), 120);
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
