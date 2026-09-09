(function () {
    'use strict';

    function createCanvasLifecycleController(context) {
        const scope = context || {};
        const call = (name, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : undefined;
        const getRoot = () => typeof scope.getRoot === 'function' ? scope.getRoot() : null;
        const getProject = () => typeof scope.getProject === 'function' ? (scope.getProject() || {}) : {};
        const schedule = typeof scope.setTimeout === 'function' ? scope.setTimeout : setTimeout;

        function refreshPresetCatalogAfterOpen() {
            const result = call('refreshPresetCatalog', { force: true });
            if (result && typeof result.catch === 'function') result.catch(() => {});
        }

        function openWorkbench() {
            call('ensureWorkbench');
            call('syncStorageScope', { silent: true });
            call('ensureInitialDemoProject');
            const root = getRoot();
            root.hidden = false;
            root.classList.toggle('show-grid', !!getProject().settings.grid);
            call('applyThemeClass');
            call('resetGalleryFrostReveals');
            call('renderAll');
            const refresh = call('refreshCanvasProjectFromBackendOnOpen');
            if (refresh && typeof refresh.catch === 'function') {
                refresh.catch(() => {}).finally(refreshPresetCatalogAfterOpen);
            } else {
                refreshPresetCatalogAfterOpen();
            }
            call('startPerformanceHud');
            call('startStandaloneStatusMonitor');
            call('scheduleAutoPresetModelChecks');
            schedule(() => {
                try { call('getViewport')?.focus?.(); } catch (err) {}
            }, 0);
        }

        function closeWorkbench() {
            const root = getRoot();
            if (!root) return;
            call('closePresetPalette');
            call('closeContextMenu');
            call('closeCanvasSettingsPanel');
            call('closeRunQueuePanel');
            call('closeRunHistoryPanel');
            call('resetGalleryFrostReveals');
            call('cancelPanEdgeSettleRender');
            call('cancelDragEdgeSettleRender');
            call('endDragEdgeLodVisual');
            call('cancelEdgeIncidentIndexWarmup');
            call('stopTimelinePlayback');
            root.hidden = true;
            call('stopStandaloneStatusMonitor');
            call('stopPerformanceHud');
        }

        return { openWorkbench, closeWorkbench };
    }

    window.SimpAICanvasWorkbenchLifecycle = Object.assign({}, window.SimpAICanvasWorkbenchLifecycle || {}, {
        createCanvasLifecycleController
    });
})();
