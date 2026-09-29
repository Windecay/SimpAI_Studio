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
        const languageSource = scope.languageSource || {};
        const galleryImportSource = scope.galleryImportSource || {};
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
        let runtimeEventsBound = false;

        function bindWorkbenchRuntimeEvents() {
            if (runtimeEventsBound) return;
            const browserWindow = getWindow();
            if (!browserWindow || typeof browserWindow.addEventListener !== 'function') return;
            browserWindow.addEventListener('simpai:open-infinite-canvas', openWorkbench);
            browserWindow.addEventListener('simpai:system-params-updated', () => {
                const root = getRoot();
                if (!root) return;
                const changed = call(projectSource, 'syncStorageScope', { silent: true });
                call(renderSource, 'applyThemeClass');
                if (changed || !root.hidden) call(renderSource, 'renderAll');
                const refreshed = call(presetSource, 'refreshPresetCatalog', { force: true });
                if (refreshed && typeof refreshed.catch === 'function') refreshed.catch(() => {});
            });
            browserWindow.addEventListener('simpai:status-monitor-updated', () => {
                if (!getRoot() || getRoot().hidden) return;
                call(renderSource, 'renderSystemInfo');
            });
            browserWindow.addEventListener('simpai:vlm-model-catalog', () => {
                if (!getRoot() || getRoot().hidden) return;
                call(renderSource, 'renderCanvasAgentPanel');
                if (call(renderSource, 'hasSelectedNode')) call(renderSource, 'renderInspector');
            });
            browserWindow.addEventListener('simpai:backend-request-failed', (event) => {
                if (!getRoot() || getRoot().hidden) return;
                const detail = event?.detail || {};
                call(renderSource, 'setCanvasBackendAlert', 'disconnected',
                    call(languageSource, 't',
                        'Backend request failed. The server may have crashed or disconnected; generation and VLM chat will not continue until it is restored.',
                        '后端请求失败。服务器可能已崩溃或断开；恢复前生成和 VLM 聊天无法继续。'),
                    { endpoint: detail.endpoint || detail.error || '' });
            });
            const doc = call(domSource, 'getDocument');
            if (doc?.readyState === 'complete') {
                call(projectSource, 'ensureWorkbench');
            } else {
                browserWindow.addEventListener('load', () => call(projectSource, 'ensureWorkbench'));
            }
            runtimeEventsBound = true;
        }

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

        async function importGalleryMediaAfterOpen() {
            const mediaId = call(galleryImportSource, 'getPendingMediaId');
            if (!mediaId) return;
            const node = await call(galleryImportSource, 'importMediaById', mediaId);
            if (node) call(galleryImportSource, 'clearPendingMediaId', mediaId);
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
                refresh.catch(() => {}).finally(() => {
                    refreshPresetCatalogAfterOpen();
                    importGalleryMediaAfterOpen().catch(() => {});
                });
            } else {
                refreshPresetCatalogAfterOpen();
                importGalleryMediaAfterOpen().catch(() => {});
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

        return { bindWorkbenchRuntimeEvents, openWorkbench, closeWorkbench };
    }

    window.SimpAICanvasWorkbenchLifecycle = Object.assign({}, window.SimpAICanvasWorkbenchLifecycle || {}, {
        createCanvasLifecycleController
    });
})();
