(function () {
    'use strict';

    function createCanvasNodeResizeController(context) {
        const scope = context || {};
        const getProject = () => typeof scope.getProject === 'function' ? (scope.getProject() || {}) : {};
        const getDocument = () => typeof scope.getDocument === 'function'
            ? scope.getDocument()
            : (typeof document !== 'undefined' ? document : null);
        const getNode = (id) => typeof scope.getNode === 'function' ? scope.getNode(id) : null;
        const getNodeRect = (node) => typeof scope.getNodeRect === 'function' ? scope.getNodeRect(node) : { x: 0, y: 0, w: 160, h: 120 };
        const isNodeLocked = (node) => typeof scope.isNodeLocked === 'function' ? !!scope.isNodeLocked(node) : false;
        const minResizableNodeSize = (node) => typeof scope.minResizableNodeSize === 'function'
            ? scope.minResizableNodeSize(node)
            : { w: 160, h: 120 };
        const supportsCollapsedPromptHeight = (node) => typeof scope.supportsCollapsedPromptHeight === 'function'
            ? !!scope.supportsCollapsedPromptHeight(node)
            : false;
        const collapsedPromptNodeHeight = (node) => typeof scope.collapsedPromptNodeHeight === 'function'
            ? scope.collapsedPromptNodeHeight(node)
            : getNodeRect(node).h;
        const clamp = typeof scope.clamp === 'function' ? scope.clamp : (value, min, max) => Math.max(min, Math.min(max, value));
        const snapCanvasSizeFromOrigin = (origin, value, min, max) => typeof scope.snapCanvasSizeFromOrigin === 'function'
            ? scope.snapCanvasSizeFromOrigin(origin, value, min, max)
            : value;
        const call = (name, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : undefined;
        const applyNodeLayoutPatch = (node, options) => {
            const patch = call('buildNodeLayoutPatch', node, options || {});
            if (patch && typeof patch === 'object') Object.assign(node, patch);
        };
        let resizeState = null;

        function startNodeResize(node, evt) {
            if (!node || isNodeLocked(node)) return;
            const rect = getNodeRect(node);
            const minSize = minResizableNodeSize(node);
            const resizeCollapsedPromptHeight = supportsCollapsedPromptHeight(node);
            resizeState = {
                nodeId: node.id,
                pointerId: evt.pointerId,
                startClientX: evt.clientX,
                startClientY: evt.clientY,
                startX: rect.x,
                startY: rect.y,
                startW: rect.w,
                startH: resizeCollapsedPromptHeight ? collapsedPromptNodeHeight(node) : rect.h,
                minW: minSize.w,
                minH: minSize.h,
                resizeCollapsedPromptHeight,
                historyPushed: false
            };
            call('selectNodeForResize', node.id);
            evt.target?.setPointerCapture?.(evt.pointerId);
            call('refreshSelectionUi');
            const doc = getDocument();
            doc?.addEventListener('pointermove', onNodeResizeMove, true);
            doc?.addEventListener('pointerup', stopNodeResize, true);
            doc?.addEventListener('pointercancel', stopNodeResize, true);
        }

        function onNodeResizeMove(evt) {
            if (!resizeState || evt.pointerId !== resizeState.pointerId) return;
            const node = getNode(resizeState.nodeId);
            if (!node) return;
            evt.preventDefault();
            const project = getProject();
            const zoom = project.viewport?.zoom || 1;
            const rawW = Math.round(clamp(resizeState.startW + (evt.clientX - resizeState.startClientX) / zoom, resizeState.minW, 2400));
            const rawH = Math.round(clamp(resizeState.startH + (evt.clientY - resizeState.startClientY) / zoom, resizeState.minH, 1800));
            const nextW = project.settings?.snap
                ? snapCanvasSizeFromOrigin(resizeState.startX, rawW, resizeState.minW, 2400)
                : rawW;
            const nextH = project.settings?.snap
                ? snapCanvasSizeFromOrigin(resizeState.startY, rawH, resizeState.minH, 1800)
                : rawH;
            if (!resizeState.historyPushed && (Math.abs(nextW - resizeState.startW) > 1 || Math.abs(nextH - resizeState.startH) > 1)) {
                call('pushHistory', 'Resize node');
                resizeState.historyPushed = true;
            }
            const layoutPatch = { w: nextW };
            if (resizeState.resizeCollapsedPromptHeight) layoutPatch.collapsed_h = nextH;
            else layoutPatch.h = nextH;
            applyNodeLayoutPatch(node, layoutPatch);
            call('updateNodePositionDom', [node.id]);
            if (node.type === 'note') call('refreshNoteDom', node.id);
            call('scheduleInteractiveLinkRender', { nodeIds: [node.id] });
            call('invalidateMinimapStaticCache');
            call('invalidateNodeSpatialIndex');
            call('scheduleMinimapRender');
        }

        function stopNodeResize(evt) {
            if (!resizeState) return;
            if (evt && evt.pointerId !== resizeState.pointerId) return;
            resizeState = null;
            const doc = getDocument();
            doc?.removeEventListener('pointermove', onNodeResizeMove, true);
            doc?.removeEventListener('pointerup', stopNodeResize, true);
            doc?.removeEventListener('pointercancel', stopNodeResize, true);
            call('scheduleSave');
            call('flushInteractiveLinkRender');
            call('flushMinimapRender');
            if (call('getSelectedNodeId')) call('renderInspector');
        }

        return {
            startNodeResize,
            onNodeResizeMove,
            stopNodeResize,
            isResizing: () => !!resizeState,
            getResizingNodeId: () => resizeState?.nodeId || null
        };
    }

    window.SimpAICanvasWorkbenchNodeResize = Object.assign({}, window.SimpAICanvasWorkbenchNodeResize || {}, {
        createCanvasNodeResizeController
    });
})();
