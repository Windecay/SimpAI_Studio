(function () {
    'use strict';

    function createCanvasRenderController(context) {
        const scope = context || {};
        const sourceObject = (name) => {
            const value = scope[name];
            return value && typeof value === 'object' ? value : {};
        };
        const domSource = sourceObject('domSource');
        const runtimeSource = sourceObject('runtimeSource');
        const interactionSource = sourceObject('interactionSource');
        const selectionSource = sourceObject('selectionSource');
        const renderSource = sourceObject('renderSource');
        const nodeSource = sourceObject('nodeSource');
        const statusSource = sourceObject('statusSource');
        const uiSource = sourceObject('uiSource');
        const sourceCall = (source, name, fallback, ...args) => typeof source[name] === 'function'
            ? source[name](...args)
            : fallback;
        const call = (source, name, ...args) => sourceCall(source, name, undefined, ...args);
        const getRoot = () => sourceCall(domSource, 'getRoot', null);
        const getRunHistoryPanel = () => sourceCall(domSource, 'getRunHistoryPanel', null);
        const getPerfStats = () => sourceCall(runtimeSource, 'getPerfStats', null);
        const performanceNow = () => Number(sourceCall(runtimeSource, 'performanceNow', 0)) || 0;

        function renderAll(options) {
            if (!getRoot()) return;
            const startedAt = performanceNow();
            const opts = options || {};
            call(interactionSource, 'cancelPanEdgeSettleRender');
            if (!call(interactionSource, 'isNodeDragging') && !call(interactionSource, 'isGroupDragging')) {
                call(interactionSource, 'cancelDragEdgeSettleRender');
                call(interactionSource, 'endDragEdgeLodVisual');
            }
            call(uiSource, 'invalidateMinimapStaticCache');
            call(uiSource, 'invalidateNodeSpatialIndex');
            call(selectionSource, 'reconcileSelection');
            call(renderSource, 'applyThemeClass');
            call(renderSource, 'applyViewport');
            call(renderSource, 'renderGroups');
            call(renderSource, 'renderMode');
            call(nodeSource, 'renderNodes');
            call(renderSource, 'renderEdges');
            call(renderSource, 'renderSelectedChainOverlay');
            if (opts.inspector !== false) call(uiSource, 'renderInspector');
            call(statusSource, 'renderStatus');
            call(uiSource, 'renderCanvasSettingsPanel');
            call(uiSource, 'renderMinimap');
            call(uiSource, 'renderCanvasAgentPanel');
            call(uiSource, 'renderRunQueuePanelIfOpen');
            const runHistoryPanel = getRunHistoryPanel();
            if (runHistoryPanel && !runHistoryPanel.hidden) call(uiSource, 'renderRunHistoryPanel');
            const perfStats = getPerfStats();
            if (perfStats) perfStats.renderTotalMs = performanceNow() - startedAt;
            call(uiSource, 'renderPerformanceHud', true);
            call(uiSource, 'scheduleEdgeIncidentIndexWarmup');
        }

        return { renderAll };
    }

    window.SimpAICanvasWorkbenchRender = Object.assign({}, window.SimpAICanvasWorkbenchRender || {}, {
        createCanvasRenderController
    });
})();
