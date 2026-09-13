(function () {
    'use strict';

    function createCanvasNodeResizeController(context) {
        const scope = context || {};
        const sourceObject = (name) => {
            const value = scope[name];
            return value && typeof value === 'object' ? value : {};
        };
        const projectSource = sourceObject('projectSource');
        const domSource = sourceObject('domSource');
        const nodeSource = sourceObject('nodeSource');
        const layoutSource = sourceObject('layoutSource');
        const selectionSource = sourceObject('selectionSource');
        const utilitySource = sourceObject('utilitySource');
        const viewportSource = sourceObject('viewportSource');
        const patchSource = sourceObject('patchSource');
        const historySource = sourceObject('historySource');
        const renderSource = sourceObject('renderSource');
        const minimapSource = sourceObject('minimapSource');
        const persistenceSource = sourceObject('persistenceSource');
        const sourceCall = (source, name, fallback, ...args) => typeof source[name] === 'function'
            ? source[name](...args)
            : fallback;
        const getProject = () => sourceCall(projectSource, 'getProject', {}) || {};
        const getDocument = () => typeof domSource.getDocument === 'function'
            ? domSource.getDocument()
            : (typeof document !== 'undefined' ? document : null);
        const getNode = (id) => sourceCall(nodeSource, 'getNode', null, id);
        const getNodeRect = (node) => sourceCall(
            layoutSource,
            'getNodeRect',
            { x: 0, y: 0, w: 160, h: 120 },
            node
        ) || { x: 0, y: 0, w: 160, h: 120 };
        const isNodeLocked = (node) => !!sourceCall(nodeSource, 'isNodeLocked', false, node);
        const minResizableNodeSize = (node) => sourceCall(
            layoutSource,
            'minResizableNodeSize',
            { w: 160, h: 120 },
            node
        ) || { w: 160, h: 120 };
        const supportsCollapsedPromptHeight = (node) => !!sourceCall(
            layoutSource,
            'supportsCollapsedPromptHeight',
            false,
            node
        );
        const collapsedPromptNodeHeight = (node) => sourceCall(
            layoutSource,
            'collapsedPromptNodeHeight',
            getNodeRect(node).h,
            node
        );
        const clamp = typeof utilitySource.clamp === 'function'
            ? utilitySource.clamp
            : (value, min, max) => Math.max(min, Math.min(max, value));
        const snapCanvasSizeFromOrigin = (origin, value, min, max) => sourceCall(
            viewportSource,
            'snapCanvasSizeFromOrigin',
            value,
            origin,
            value,
            min,
            max
        );
        const applyNodeLayoutPatch = (node, options) => {
            const patch = sourceCall(patchSource, 'buildNodeLayoutPatch', undefined, node, options || {});
            if (patch && typeof patch === 'object') Object.assign(node, patch);
        };
        const selectNodeForResize = (nodeId) => {
            const current = sourceCall(selectionSource, 'getSelectionState', {}, {}) || {};
            sourceCall(selectionSource, 'setSelectionState', undefined, Object.assign({}, current, {
                selectedNodeId: nodeId,
                selectedNodeIds: new Set([nodeId]),
                selectedEdgeId: null,
                selectedGroupId: null
            }));
        };
        const refreshSelectionUi = (...args) => sourceCall(selectionSource, 'refreshSelectionUi', undefined, ...args);
        const getSelectedNodeId = (...args) => sourceCall(selectionSource, 'getSelectedNodeId', null, ...args);
        const pushHistory = (...args) => sourceCall(historySource, 'pushHistory', undefined, ...args);
        const renderCall = (name, ...args) => sourceCall(renderSource, name, undefined, ...args);
        const minimapCall = (name, ...args) => sourceCall(minimapSource, name, undefined, ...args);
        const scheduleSave = (...args) => sourceCall(persistenceSource, 'scheduleSave', undefined, ...args);
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
            selectNodeForResize(node.id);
            evt.target?.setPointerCapture?.(evt.pointerId);
            refreshSelectionUi();
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
                pushHistory('Resize node');
                resizeState.historyPushed = true;
            }
            const layoutPatch = { w: nextW };
            if (resizeState.resizeCollapsedPromptHeight) layoutPatch.collapsed_h = nextH;
            else layoutPatch.h = nextH;
            applyNodeLayoutPatch(node, layoutPatch);
            renderCall('updateNodePositionDom', [node.id]);
            if (node.type === 'note') renderCall('refreshNoteDom', node.id);
            renderCall('scheduleInteractiveLinkRender', { nodeIds: [node.id] });
            minimapCall('invalidateMinimapStaticCache');
            minimapCall('invalidateNodeSpatialIndex');
            minimapCall('scheduleMinimapRender');
        }

        function stopNodeResize(evt) {
            if (!resizeState) return;
            if (evt && evt.pointerId !== resizeState.pointerId) return;
            resizeState = null;
            const doc = getDocument();
            doc?.removeEventListener('pointermove', onNodeResizeMove, true);
            doc?.removeEventListener('pointerup', stopNodeResize, true);
            doc?.removeEventListener('pointercancel', stopNodeResize, true);
            scheduleSave();
            renderCall('flushInteractiveLinkRender');
            minimapCall('flushMinimapRender');
            if (getSelectedNodeId()) renderCall('renderInspector');
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
