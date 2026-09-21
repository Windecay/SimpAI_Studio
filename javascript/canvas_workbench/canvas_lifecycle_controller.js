(function () {
    'use strict';

    function createCanvasLifecycleController(context) {
        const scope = context?.lifecycleSource || context || {};
        const domSource = scope.domSource || {};
        const projectSource = scope.projectSource || {};
        const renderSource = scope.renderSource || {};
        const presetSource = scope.presetSource || {};
        const runtimeSource = scope.runtimeSource || {};
        const panelSource = scope.panelSource || {};
        const persistenceSource = scope.persistenceSource || {};
        const timerSource = scope.timerSource || {};
        const call = (sourceObject, name, ...args) => typeof sourceObject[name] === 'function'
            ? sourceObject[name](...args)
            : undefined;
        const getRoot = () => call(domSource, 'getRoot') || null;
        const getViewport = () => call(domSource, 'getViewport');
        const getProject = () => call(projectSource, 'getProject') || {};
        const getWindow = () => call(domSource, 'getWindow');
        const schedule = typeof timerSource.setTimeout === 'function'
            ? (...args) => timerSource.setTimeout(...args)
            : setTimeout;
        let pageLifecycleBound = false;

        function persistBrowserCacheBeforePageHide() {
            try {
                call(persistenceSource, 'saveProjectToBrowserCache', { reason: 'pagehide' });
            } catch (err) {}
        }

        function bindPageLifecyclePersistence() {
            if (pageLifecycleBound) return;
            const browserWindow = getWindow();
            if (!browserWindow || typeof browserWindow.addEventListener !== 'function') return;
            browserWindow.addEventListener('pagehide', persistBrowserCacheBeforePageHide);
            pageLifecycleBound = true;
        }

        function persistBeforeClose() {
            try {
                const result = call(persistenceSource, 'saveProject', false, { persist: true });
                if (result && typeof result.catch === 'function') {
                    result.catch(() => {});
                }
            } catch (err) {}
        }

        function refreshPresetCatalogAfterOpen() {
            const result = call(presetSource, 'refreshPresetCatalog', { force: true });
            if (result && typeof result.catch === 'function') result.catch(() => {});
        }

        function openWorkbench() {
            bindPageLifecyclePersistence();
            call(projectSource, 'ensureWorkbench');
            call(projectSource, 'syncStorageScope', { silent: true });
            call(projectSource, 'ensureInitialDemoProject');
            const root = getRoot();
            root.hidden = false;
            root.classList.toggle('show-grid', !!getProject().settings.grid);
            call(renderSource, 'applyThemeClass');
            call(renderSource, 'resetGalleryFrostReveals');
            call(renderSource, 'renderAll');
            const refresh = call(projectSource, 'refreshCanvasProjectFromBackendOnOpen');
            if (refresh && typeof refresh.catch === 'function') {
                refresh.catch(() => {}).finally(refreshPresetCatalogAfterOpen);
            } else {
                refreshPresetCatalogAfterOpen();
            }
            call(runtimeSource, 'startPerformanceHud');
            call(runtimeSource, 'startStandaloneStatusMonitor');
            call(presetSource, 'scheduleAutoPresetModelChecks');
            schedule(() => {
                try { getViewport()?.focus?.(); } catch (err) {}
            }, 0);
        }

        function closeWorkbench() {
            const root = getRoot();
            if (!root) return;
            persistBeforeClose();
            call(panelSource, 'closePresetPalette');
            call(panelSource, 'closeContextMenu');
            call(panelSource, 'closeCanvasSettingsPanel');
            call(panelSource, 'closeRunQueuePanel');
            call(panelSource, 'closeRunHistoryPanel');
            call(renderSource, 'resetGalleryFrostReveals');
            call(runtimeSource, 'cancelPanEdgeSettleRender');
            call(runtimeSource, 'cancelDragEdgeSettleRender');
            call(runtimeSource, 'endDragEdgeLodVisual');
            call(runtimeSource, 'cancelEdgeIncidentIndexWarmup');
            call(runtimeSource, 'stopTimelinePlayback');
            root.hidden = true;
            call(runtimeSource, 'stopStandaloneStatusMonitor');
            call(runtimeSource, 'stopPerformanceHud');
        }

        return { openWorkbench, closeWorkbench };
    }

    window.SimpAICanvasWorkbenchLifecycle = Object.assign({}, window.SimpAICanvasWorkbenchLifecycle || {}, {
        createCanvasLifecycleController
    });
})();
