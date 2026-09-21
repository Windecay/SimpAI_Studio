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
        const persistenceSource = scope.persistenceSource || {};
        const assetsSource = scope.assetsSource || {};
        const actionsSource = scope.actionsSource || {};
        const persistence = createController(
            modules.persistence,
            'createCanvasProjectPersistenceController',
            Object.assign({}, persistenceSource, {
                assetSource: Object.assign({}, persistenceSource.assetSource || {}, {
                    materializeInlineProjectAssets: (...args) => assetsMethod('materializeInlineProjectAssets', ...args),
                    syncCanvasProjectAssetRoot: (...args) => assetsMethod('syncCanvasProjectAssetRoot', ...args),
                    setCanvasProjectAssetRoot: (...args) => assetsMethod('setCanvasProjectAssetRoot', ...args)
                })
            })
        );
        const persistenceMethod = (name, ...args) => method(persistence, name)?.(...args);

        const assets = createController(
            modules.assets,
            'createCanvasProjectAssetsController',
            Object.assign({}, assetsSource, {
                storageSource: Object.assign({}, assetsSource.storageSource || {}, {
                    buildProjectStorageInfo: (...args) => persistenceMethod('buildProjectStorageInfo', ...args)
                }),
                persistenceSource: Object.assign({}, assetsSource.persistenceSource || {}, {
                    saveProjectToBrowserCache: (...args) => persistenceMethod('saveProjectToBrowserCache', ...args),
                    loadProjectFromBackend: (...args) => persistenceMethod('loadProjectFromBackend', ...args)
                })
            })
        );
        const assetsMethod = (name, ...args) => method(assets, name)?.(...args);

        const actions = createController(
            modules.actions,
            'createCanvasProjectActionsController',
            Object.assign({}, actionsSource, {
                persistenceSource: Object.assign({}, actionsSource.persistenceSource || {}, {
                    buildProjectStorageInfo: (...args) => persistenceMethod('buildProjectStorageInfo', ...args),
                    saveProjectToBrowserCache: (...args) => persistenceMethod('saveProjectToBrowserCache', ...args),
                    saveProject: (...args) => persistenceMethod('saveProject', ...args),
                    loadProjectFromBackend: (...args) => persistenceMethod('loadProjectFromBackend', ...args)
                }),
                assetSource: Object.assign({}, actionsSource.assetSource || {}, {
                    syncCanvasProjectAssetRoot: (...args) => assetsMethod('syncCanvasProjectAssetRoot', ...args)
                })
            })
        );
        const actionsMethod = (name, ...args) => method(actions, name)?.(...args);

        return {
            CANVAS_PROJECT_PERSISTENCE_CONTROLLER: persistence,
            browserBackendProjectDecision: persistenceMethod.bind(null, 'browserBackendProjectDecision'),
            scheduleSave: persistenceMethod.bind(null, 'scheduleSave'),
            scheduleViewportSave: persistenceMethod.bind(null, 'scheduleViewportSave'),
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
