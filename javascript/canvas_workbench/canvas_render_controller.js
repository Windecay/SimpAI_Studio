(function () {
    'use strict';

    function createCanvasRenderController(context) {
        const scope = context || {};
        const call = (name, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : undefined;
        const getRoot = () => typeof scope.getRoot === 'function' ? scope.getRoot() : null;
        const getRunHistoryPanel = () => typeof scope.getRunHistoryPanel === 'function'
            ? scope.getRunHistoryPanel()
            : scope.runHistoryPanel;
        const getPerfStats = () => typeof scope.getPerfStats === 'function' ? scope.getPerfStats() : null;
        const performanceNow = () => typeof scope.performanceNow === 'function' ? Number(scope.performanceNow()) || 0 : performance.now();

        function renderAll(options) {
            if (!getRoot()) return;
            const startedAt = performanceNow();
            const opts = options || {};
            call('cancelPanEdgeSettleRender');
            if (!call('isNodeDragging') && !call('isGroupDragging')) {
                call('cancelDragEdgeSettleRender');
                call('endDragEdgeLodVisual');
            }
            call('invalidateMinimapStaticCache');
            call('invalidateNodeSpatialIndex');
            call('reconcileSelection');
            call('applyThemeClass');
            call('applyViewport');
            call('renderGroups');
            call('renderMode');
            call('renderNodes');
            call('renderEdges');
            call('renderSelectedChainOverlay');
            if (opts.inspector !== false) call('renderInspector');
            call('renderStatus');
            call('renderCanvasSettingsPanel');
            call('renderMinimap');
            call('renderCanvasAgentPanel');
            call('renderRunQueuePanelIfOpen');
            const runHistoryPanel = getRunHistoryPanel();
            if (runHistoryPanel && !runHistoryPanel.hidden) call('renderRunHistoryPanel');
            const perfStats = getPerfStats();
            if (perfStats) perfStats.renderTotalMs = performanceNow() - startedAt;
            call('renderPerformanceHud', true);
            call('scheduleEdgeIncidentIndexWarmup');
        }

        return { renderAll };
    }

    window.SimpAICanvasWorkbenchRender = Object.assign({}, window.SimpAICanvasWorkbenchRender || {}, {
        createCanvasRenderController
    });
})();
