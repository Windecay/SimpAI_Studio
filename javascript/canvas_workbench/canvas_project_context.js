(function () {
    'use strict';

    const modules = {
        persistence: window.SimpAICanvasWorkbenchProjectPersistence || {},
        assets: window.SimpAICanvasWorkbenchProjectAssets || {},
        actions: window.SimpAICanvasWorkbenchProjectActions || {}
    };

    function createController(module, factoryName, context) {
        const create = module && module[factoryName];
        return typeof create === 'function' ? (create(context) || {}) : {};
    }

    function method(controller, name) {
        return controller && typeof controller[name] === 'function' ? controller[name] : undefined;
    }

    function createCanvasWorkbenchProjectContext(source) {
        const scope = source?.projectSource || source || {};
        const persistence = createController(
            modules.persistence,
            'createCanvasProjectPersistenceController',
            {
                t: scope.t,
                getProject: scope.getProject,
                setProject: scope.setProject,
                getDefaultProjectId: scope.getDefaultProjectId,
                getStorage: scope.getStorage,
                getStorageScope: scope.getStorageScope,
                getCurrentStorageScope: scope.getCurrentStorageScope,
                getStorageKey: scope.getStorageKey,
                getStorageBaseKey: scope.getStorageBaseKey,
                setStorageScope: scope.setStorageScope,
                setStorageBaseKey: scope.setStorageBaseKey,
                setStorageKey: scope.setStorageKey,
                initialBrowserStorageKey: scope.initialBrowserStorageKey,
                browserCacheProjectScope: scope.browserCacheProjectScope,
                setActiveBrowserCacheProject: scope.setActiveBrowserCacheProject,
                getBackendLoadedStorageKey: scope.getBackendLoadedStorageKey,
                setBackendLoadedStorageKey: scope.setBackendLoadedStorageKey,
                isProjectEmpty: scope.isProjectEmpty,
                buildProjectStorageInfoPatch: scope.buildProjectStorageInfoPatch,
                buildProjectStoragePatch: scope.buildProjectStoragePatch,
                projectStoreBuildProjectStorageInfo: scope.projectStoreBuildProjectStorageInfo,
                nowIso: scope.nowIso,
                compactProjectForStorage: scope.compactProjectForStorage,
                sanitizeProject: scope.sanitizeProject,
                createDefaultProject: scope.createDefaultProject,
                loadProject: scope.loadProject,
                materializeInlineProjectAssets: (...args) => assetsMethod('materializeInlineProjectAssets', ...args),
                syncCanvasProjectAssetRoot: (...args) => assetsMethod('syncCanvasProjectAssetRoot', ...args),
                setCanvasProjectAssetRoot: (...args) => assetsMethod('setCanvasProjectAssetRoot', ...args),
                sendCanvasProjectSaveRequest: scope.sendCanvasProjectSaveRequest,
                sendCanvasProjectLoadRequest: scope.sendCanvasProjectLoadRequest,
                isCanvasBridgeReady: scope.isCanvasBridgeReady,
                bindCanvasBridgeResponseListener: scope.bindCanvasBridgeResponseListener,
                sendCanvasBridgeRequest: scope.sendCanvasBridgeRequest,
                resetRenderedProjectDomCache: scope.resetRenderedProjectDomCache,
                resetSelectionState: scope.resetSelectionState,
                resetHistory: scope.resetHistory,
                renderAll: scope.renderAll,
                resetGalleryFrostReveals: scope.resetGalleryFrostReveals,
                scheduleAutoPresetModelChecks: scope.scheduleAutoPresetModelChecks,
                getRoot: scope.getRoot,
                renderStatus: scope.renderStatus,
                showToast: scope.showToast,
                warn: scope.warn
            }
        );
        const persistenceMethod = (name, ...args) => method(persistence, name)?.(...args);

        const assets = createController(
            modules.assets,
            'createCanvasProjectAssetsController',
            {
                getProject: scope.getProject,
                setProject: scope.setProject,
                getProjectId: scope.getProjectId,
                getStorageScope: scope.getStorageScope,
                getStorageKey: scope.getStorageKey,
                buildProjectStorageInfo: (...args) => persistenceMethod('buildProjectStorageInfo', ...args),
                buildProjectStoragePatch: scope.buildProjectStoragePatch,
                getRoot: scope.getRoot,
                renderAll: scope.renderAll,
                sendCanvasListAssetsRequest: scope.sendCanvasListAssetsRequest,
                saveProjectToBrowserCache: (...args) => persistenceMethod('saveProjectToBrowserCache', ...args),
                loadProjectFromBackend: (...args) => persistenceMethod('loadProjectFromBackend', ...args),
                materializeNodeAssetForStorage: scope.materializeNodeAssetForStorage,
                assetDisplaySrc: scope.assetDisplaySrc,
                warn: scope.warn
            }
        );
        const assetsMethod = (name, ...args) => method(assets, name)?.(...args);

        const actions = createController(
            modules.actions,
            'createCanvasProjectActionsController',
            {
                t: scope.t,
                getDocument: scope.getDocument,
                getStorage: scope.getStorage,
                getStorageScope: scope.getStorageScope,
                getStorageKey: scope.getStorageKey,
                getStorageBaseKey: scope.getStorageBaseKey,
                getLegacyStorageKey: scope.getLegacyStorageKey,
                browserCacheProjectIndex: scope.browserCacheProjectIndex,
                browserCacheActiveProjectIdKey: scope.browserCacheActiveProjectIdKey,
                browserCacheProjectIndexKey: scope.browserCacheProjectIndexKey,
                browserCacheProjectScope: scope.browserCacheProjectScope,
                getCurrentProject: scope.getCurrentProject,
                getCurrentProjectId: scope.getCurrentProjectId,
                getDefaultProjectId: scope.getDefaultProjectId,
                isProjectEmpty: scope.isProjectEmpty,
                ensureProjectGroups: scope.ensureProjectGroups,
                createDemoWorkbenchProject: scope.createDemoWorkbenchProject,
                buildProjectStorageInfo: (...args) => persistenceMethod('buildProjectStorageInfo', ...args),
                nowIso: scope.nowIso,
                sanitizeStoragePart: scope.sanitizeStoragePart,
                sanitizeProject: scope.sanitizeProject,
                createDefaultProject: scope.createDefaultProject,
                buildProjectCanvasClearPatch: scope.buildProjectCanvasClearPatch,
                buildProjectIdentityPatch: scope.buildProjectIdentityPatch,
                buildProjectSettingsMergePatch: scope.buildProjectSettingsMergePatch,
                buildProjectStoragePatch: scope.buildProjectStoragePatch,
                sendCanvasProjectClearRequest: scope.sendCanvasProjectClearRequest,
                setProject: scope.setProject,
                setActiveBrowserCacheProject: scope.setActiveBrowserCacheProject,
                syncCanvasProjectAssetRoot: (...args) => assetsMethod('syncCanvasProjectAssetRoot', ...args),
                resetRenderedProjectDomCache: scope.resetRenderedProjectDomCache,
                saveProjectToBrowserCache: (...args) => persistenceMethod('saveProjectToBrowserCache', ...args),
                setBackendLoadedStorageKey: scope.setBackendLoadedStorageKey,
                resetSelectionState: scope.resetSelectionState,
                getSelectionState: scope.getSelectionState,
                setSelectionState: scope.setSelectionState,
                getBackendLoadedStorageKey: scope.getBackendLoadedStorageKey,
                resetHistory: scope.resetHistory,
                renderAll: scope.renderAll,
                resetGalleryFrostReveals: scope.resetGalleryFrostReveals,
                mutate: scope.mutate,
                pushHistory: scope.pushHistory,
                interruptDeletedResultRuns: scope.interruptDeletedResultRuns,
                stopTimelinePlayback: scope.stopTimelinePlayback,
                confirm: scope.confirm,
                prompt: scope.prompt,
                saveProject: (...args) => persistenceMethod('saveProject', ...args),
                loadProject: scope.loadProject,
                loadProjectFromBackend: (...args) => persistenceMethod('loadProjectFromBackend', ...args),
                readFileAsText: scope.readFileAsText,
                warn: scope.warn,
                renderStatus: scope.renderStatus,
                showToast: scope.showToast
            }
        );
        const actionsMethod = (name, ...args) => method(actions, name)?.(...args);

        return {
            CANVAS_PROJECT_PERSISTENCE_CONTROLLER: persistence,
            browserBackendProjectDecision: persistenceMethod.bind(null, 'browserBackendProjectDecision'),
            saveProject: persistenceMethod.bind(null, 'saveProject'),
            saveProjectToBrowserCache: persistenceMethod.bind(null, 'saveProjectToBrowserCache'),
            buildProjectStorageInfo: persistenceMethod.bind(null, 'buildProjectStorageInfo'),
            syncStorageScope: persistenceMethod.bind(null, 'syncStorageScope'),
            loadProjectFromBackend: persistenceMethod.bind(null, 'loadProjectFromBackend'),
            CANVAS_PROJECT_ASSETS_CONTROLLER: assets,
            inferChatImageRelativePath: assetsMethod.bind(null, 'inferChatImageRelativePath'),
            safeVlmChatAssetThumb: assetsMethod.bind(null, 'safeVlmChatAssetThumb'),
            safeAssetFallbackSrc: assetsMethod.bind(null, 'safeAssetFallbackSrc'),
            safeAssetDisplaySrc: assetsMethod.bind(null, 'safeAssetDisplaySrc'),
            safeAssetFullDisplaySrc: assetsMethod.bind(null, 'safeAssetFullDisplaySrc'),
            setCanvasProjectAssetRoot: assetsMethod.bind(null, 'setCanvasProjectAssetRoot'),
            syncCanvasProjectAssetRoot: assetsMethod.bind(null, 'syncCanvasProjectAssetRoot'),
            syncCanvasProjectAssetRootFromAsset: assetsMethod.bind(null, 'syncCanvasProjectAssetRootFromAsset'),
            syncCanvasProjectAssetRootFromAssets: assetsMethod.bind(null, 'syncCanvasProjectAssetRootFromAssets'),
            normalizeProjectAssetReferences: assetsMethod.bind(null, 'normalizeProjectAssetReferences'),
            refreshCanvasProjectAssetRoot: assetsMethod.bind(null, 'refreshCanvasProjectAssetRoot'),
            refreshCanvasProjectFromBackendOnOpen: assetsMethod.bind(null, 'refreshCanvasProjectFromBackendOnOpen'),
            materializeInlineProjectAssets: assetsMethod.bind(null, 'materializeInlineProjectAssets'),
            getCanvasProjectAssetCatalog: assetsMethod.bind(null, 'getAssetCatalog'),
            CANVAS_PROJECT_ACTIONS_CONTROLLER: actions,
            clearBrowserCache: actionsMethod.bind(null, 'clearBrowserCache'),
            clearProjectFileWithConfirm: actionsMethod.bind(null, 'clearProjectFileWithConfirm'),
            loadDemoWorkbenchWithConfirm: actionsMethod.bind(null, 'loadDemoWorkbenchWithConfirm'),
            clearCanvasWithConfirm: actionsMethod.bind(null, 'clearCanvasWithConfirm'),
            openProjectJsonPicker: actionsMethod.bind(null, 'openProjectJsonPicker'),
            switchProjectWithPrompt: actionsMethod.bind(null, 'switchProjectWithPrompt'),
            switchProjectById: actionsMethod.bind(null, 'switchProjectById'),
            handleProjectDeleted: actionsMethod.bind(null, 'handleProjectDeleted'),
            extractWorkbenchProjectJson: actionsMethod.bind(null, 'extractWorkbenchProjectJson'),
            projectIdFromWorkbenchFile: actionsMethod.bind(null, 'projectIdFromWorkbenchFile'),
            importedProjectId: actionsMethod.bind(null, 'importedProjectId'),
            importWorkbenchProjectFromFile: actionsMethod.bind(null, 'importWorkbenchProjectFromFile')
        };
    }

    window.SimpAICanvasWorkbenchProjectContext = Object.assign({}, window.SimpAICanvasWorkbenchProjectContext || {}, {
        createCanvasWorkbenchProjectContext
    });
})();
