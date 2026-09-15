(function () {
    'use strict';

    function createCanvasNodeDragController(context) {
        const scope = context || {};
        const sourceObject = (name) => {
            const value = scope[name];
            return value && typeof value === 'object' ? value : {};
        };
        const languageSource = sourceObject('languageSource');
        const projectSource = sourceObject('projectSource');
        const domSource = sourceObject('domSource');
        const nodeSource = sourceObject('nodeSource');
        const runtimeSource = sourceObject('runtimeSource');
        const viewportSource = sourceObject('viewportSource');
        const patchSource = sourceObject('patchSource');
        const uiSource = sourceObject('uiSource');
        const historySource = sourceObject('historySource');
        const renderSource = sourceObject('renderSource');
        const minimapSource = sourceObject('minimapSource');
        const persistenceSource = sourceObject('persistenceSource');
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
        const getProject = () => sourceCall(projectSource, 'getProject', {}) || {};
        const getDocument = () => typeof domSource.getDocument === 'function'
            ? domSource.getDocument()
            : null;
        const getNode = (id) => sourceCall(nodeSource, 'getNode', null, id);
        const getSelectedNodeIds = () => sourceCall(nodeSource, 'getSelectedNodeIds', new Set()) || new Set();
        const isNodeLocked = (node) => !!sourceCall(nodeSource, 'isNodeLocked', false, node);
        const getPerformanceNow = () => typeof runtimeSource.performanceNow === 'function'
            ? Number(runtimeSource.performanceNow()) || 0
            : 0;
        const uiCall = (name, fallback, ...args) => sourceCall(uiSource, name, fallback, ...args);
        const renderCall = (name, fallback, ...args) => sourceCall(renderSource, name, fallback, ...args);
        const minimapCall = (name, fallback, ...args) => sourceCall(minimapSource, name, fallback, ...args);
        const historyCall = (name, fallback, ...args) => sourceCall(historySource, name, fallback, ...args);
        const persistenceCall = (name, fallback, ...args) => sourceCall(persistenceSource, name, fallback, ...args);
        const applyNodeLayoutPatch = (node, options) => {
            const patch = sourceCall(patchSource, 'buildNodeLayoutPatch', undefined, node, options || {});
            if (patch && typeof patch === 'object') Object.assign(node, patch);
        };
        const snapCanvasCoord = (value) => sourceCall(viewportSource, 'snapCanvasCoord', value, value);
        let dragState = null;

        function startNodeDrag(node, evt) {
            uiCall('hideCanvasTooltip', undefined);
            uiCall('hideHoverPreview', undefined);
            uiCall('closePreviewSelectMenu', undefined);
            uiCall('setSuppressWheelUntil', undefined, getPerformanceNow() + 420);
            const selectedNodeIds = getSelectedNodeIds();
            const initialIds = selectedNodeIds.has(node.id) ? Array.from(selectedNodeIds) : [node.id];
            const movableIds = initialIds.filter((id) => !isNodeLocked(getNode(id)));
            if (!movableIds.length) {
                uiCall('showToast', undefined, t('Locked node cannot be moved', '节点已锁定，无法移动。'));
                return;
            }
            if (movableIds.length < initialIds.length) uiCall('showToast', undefined, t('Locked nodes stayed in place', '锁定节点保持原位。'));
            try { evt.target?.setPointerCapture?.(evt.pointerId); } catch (err) {}
            dragState = {
                pointerId: evt.pointerId,
                nodeId: node.id,
                nodeIds: movableIds,
                historyPushed: false,
                startClientX: evt.clientX,
                startClientY: evt.clientY,
                starts: {}
            };
            dragState.nodeIds.forEach((id) => {
                const item = getNode(id);
                if (item) dragState.starts[id] = { x: item.x || 0, y: item.y || 0 };
            });
            renderCall('beginDragEdgeLod', undefined);
            const doc = getDocument();
            doc?.addEventListener('pointermove', onNodeDragMove, true);
            doc?.addEventListener('pointerup', stopNodeDrag, true);
            doc?.addEventListener('pointercancel', stopNodeDrag, true);
        }

        function onNodeDragMove(evt) {
            if (!dragState || evt.pointerId !== dragState.pointerId) return;
            evt.preventDefault();
            const project = getProject();
            const zoom = project.viewport?.zoom || 1;
            const dx = (evt.clientX - dragState.startClientX) / zoom;
            const dy = (evt.clientY - dragState.startClientY) / zoom;
            if (!dragState.historyPushed && (Math.abs(dx) > 1 || Math.abs(dy) > 1)) {
                historyCall('pushHistory', undefined, 'Move node');
                dragState.historyPushed = true;
            }
            dragState.nodeIds.forEach((id) => {
                const node = getNode(id);
                const start = dragState.starts[id];
                if (!node || !start) return;
                let nextX = start.x + dx;
                let nextY = start.y + dy;
                if (project.settings?.snap) {
                    nextX = snapCanvasCoord(nextX);
                    nextY = snapCanvasCoord(nextY);
                }
                applyNodeLayoutPatch(node, {
                    x: Math.round(nextX),
                    y: Math.round(nextY)
                });
            });
            const nodeIds = dragState.nodeIds.slice();
            renderCall('updateNodePositionDom', undefined, nodeIds);
            renderCall('scheduleInteractiveLinkRender', undefined, { nodeIds });
            minimapCall('invalidateMinimapStaticCache', undefined);
            minimapCall('invalidateNodeSpatialIndex', undefined);
            minimapCall('scheduleMinimapRender', undefined);
        }

        function stopNodeDrag(evt) {
            if (!dragState) return;
            if (evt && evt.pointerId !== dragState.pointerId) return;
            const useDragEdgeLod = !!renderCall('isDragEdgeLodActive', false);
            dragState = null;
            const doc = getDocument();
            doc?.removeEventListener('pointermove', onNodeDragMove, true);
            doc?.removeEventListener('pointerup', stopNodeDrag, true);
            doc?.removeEventListener('pointercancel', stopNodeDrag, true);
            persistenceCall('scheduleSave', undefined);
            if (useDragEdgeLod) renderCall('scheduleDragEdgeSettleRender', undefined);
            else renderCall('flushInteractiveLinkRender', undefined);
            minimapCall('flushMinimapRender', undefined);
        }

        return {
            startNodeDrag,
            onNodeDragMove,
            stopNodeDrag,
            isDragging: () => !!dragState,
            getDraggingNodeIds: () => dragState ? dragState.nodeIds.slice() : [],
            isDraggingNode: (nodeId) => !!dragState?.nodeIds?.includes?.(nodeId)
        };
    }

    window.SimpAICanvasWorkbenchNodeDrag = Object.assign({}, window.SimpAICanvasWorkbenchNodeDrag || {}, {
        createCanvasNodeDragController
    });
})();
