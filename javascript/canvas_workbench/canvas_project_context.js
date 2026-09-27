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
        const mutationSource = scope.mutationSource || {};
        const mutationCall = (name, fallback, ...args) => typeof mutationSource[name] === 'function'
            ? mutationSource[name](...args)
            : fallback;

        function syncProjectLanguage(candidate) {
            if (!candidate || typeof candidate !== 'object') return candidate;
            candidate.settings = Object.assign(
                {},
                mutationCall('getDefaultProjectSettings', {}),
                candidate.settings || {},
                { __lang: mutationCall('getCurrentUiLanguage', 'en') }
            );
            return candidate;
        }

        function getStorageScope() {
            if (typeof mutationSource.getStorageScopeFromStore === 'function') {
                return mutationCall('getStorageScopeFromStore', undefined);
            }
            const translate = mutationSource.translate || ((en, zh) => zh || en);
            return {
                mode: 'local',
                owner: 'local',
                label: `${translate('Local mode', 'Local 模式')} / ${translate('Current browser', '当前浏览器')}`,
                location: translate('User directory', '用户目录'),
                cacheLocation: translate('Browser localStorage cache', '浏览器 localStorage 缓存'),
                allowLegacyFallback: true
            };
        }

        function getStorageKey(storageScope) {
            if (typeof mutationSource.getStorageKeyFromStore === 'function') {
                return mutationCall('getStorageKeyFromStore', undefined, storageScope);
            }
            const sanitize = mutationSource.sanitizeStoragePart || (value => String(value || '').replace(/[^a-zA-Z0-9._-]+/g, '_'));
            return `simpai.infiniteCanvasWorkbench.v1:${sanitize(storageScope?.mode || 'local')}:${sanitize(storageScope?.owner || 'local')}`;
        }

        function getCanvasTitle() {
            if (typeof mutationSource.getCanvasTitleFromStore === 'function') {
                return mutationCall('getCanvasTitleFromStore', undefined);
            }
            const translate = mutationSource.translate || ((en, zh) => zh || en);
            return translate('SimpAI Infinite Canvas', 'SimpAI 无限画布');
        }

        function projectStoreOptions() {
            const builderNames = [
                'buildNodeLayoutPatch', 'buildGroupIdPatch', 'buildGroupFieldPatch',
                'buildProjectDefaultPatch', 'buildProjectUpdatedAtPatch', 'buildProjectMetadataPatch',
                'buildProjectCollectionsPatch', 'buildProjectNodesPatch', 'buildProjectRunsPatch',
                'buildProjectStorageInfoPatch', 'buildProjectStoragePatch', 'buildProjectViewportPatch',
                'buildProjectSettingsPatch', 'buildCompareStatePatch', 'buildBatchAnyStatePatch',
                'buildBatchAnyLegacyTypePatch', 'buildTextMergeStatePatch', 'buildNoteStatePatch',
                'buildBatchJobStatePatch', 'buildProjectNodeStoragePatch', 'buildRunStoragePatch',
                'buildVlmChatStoragePatch'
            ];
            const options = {
                projectId: mutationCall('getDefaultProjectId', 'default'),
                defaultSettings: mutationCall('getDefaultProjectSettings', {}),
                defaultNodeSize: typeof mutationSource.defaultNodeSize === 'function' ? mutationSource.defaultNodeSize : undefined,
                cloneValue: typeof mutationSource.cloneRunValue === 'function' ? mutationSource.cloneRunValue : undefined
            };
            builderNames.forEach(name => {
                options[name] = (...args) => mutationCall(name, undefined, ...args);
            });
            return options;
        }

        function createDefaultProject() {
            const project = typeof mutationSource.createDefaultProjectFromStore === 'function'
                ? mutationCall('createDefaultProjectFromStore', undefined)
                : mutationCall('buildProjectDefaultPatch', undefined, {
                    projectId: mutationCall('getDefaultProjectId', 'default', []),
                    schema: 'simpai.canvas.workbench.v1',
                    defaultTitle: 'Untitled Canvas',
                    nowIso: () => mutationCall('nowIso', '', []),
                    defaultSettings: mutationCall('getDefaultProjectSettings', {})
                });
            return syncProjectLanguage(project);
        }

        function sanitizeProject(raw) {
            const project = typeof mutationSource.sanitizeProjectFromStore === 'function'
                ? mutationCall('sanitizeProjectFromStore', undefined, raw)
                : (raw && typeof raw === 'object' ? raw : createDefaultProject());
            return syncProjectLanguage(project);
        }

        function isProjectEmpty(candidate) {
            const project = candidate || mutationCall('getProject', {}) || {};
            return !(Array.isArray(project.nodes) && project.nodes.length)
                && !(Array.isArray(project.edges) && project.edges.length)
                && !(Array.isArray(project.groups) && project.groups.length)
                && !(Array.isArray(project.runs) && project.runs.length);
        }

        function loadProject(key, storageScope) {
            const project = typeof mutationSource.loadProjectFromStore === 'function'
                ? mutationCall('loadProjectFromStore', undefined, key, storageScope)
                : createDefaultProject();
            assetsMethod('normalizeProjectAssetReferences', project);
            assetsMethod('syncCanvasProjectAssetRoot', project);
            return project;
        }
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
                projectSource: Object.assign({}, actionsSource.projectSource || {}, {
                    isProjectEmpty
                }),
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

        function ensureProjectGroups() {
            const project = mutationCall('getProject', {}) || {};
            if (!Array.isArray(project.groups)) {
                Object.assign(project, mutationCall('buildProjectGroupsPatch', undefined, project, []));
            }
            return project.groups;
        }

        function getGroup(id) {
            return ensureProjectGroups().find(group => group.id === id) || null;
        }

        function appendProjectEdge(edge) {
            const project = mutationCall('getProject', {}) || {};
            Object.assign(project, mutationCall('buildProjectEdgeAppendPatch', undefined, project, edge));
            return edge;
        }

        function filterProjectEdges(predicate) {
            const project = mutationCall('getProject', {}) || {};
            Object.assign(project, mutationCall('buildProjectEdgeFilterPatch', undefined, project, predicate));
            return project.edges;
        }

        function applyProjectSchedulerPatch(scheduler, options) {
            const project = mutationCall('getProject', {}) || {};
            Object.assign(project, mutationCall('buildProjectSchedulerPatch', undefined, project, scheduler, options));
            return project.scheduler;
        }

        function applyProjectViewportPatch(viewportPatch, options) {
            const project = mutationCall('getProject', {}) || {};
            const patch = mutationCall(
                'buildProjectViewportPatch',
                undefined,
                project,
                Object.assign({}, options || {}, { viewportPatch })
            );
            if (patch && typeof patch === 'object'
                && patch.viewport
                && typeof patch.viewport === 'object'
                && !Array.isArray(patch.viewport)) {
                Object.assign(project, patch);
                return;
            }
            const currentViewport = project?.viewport
                && typeof project.viewport === 'object'
                && !Array.isArray(project.viewport)
                ? project.viewport
                : {};
            Object.assign(project, { viewport: Object.assign({}, currentViewport, viewportPatch || {}) });
        }

        return {
            syncProjectLanguage,
            getStorageScope,
            getStorageKey,
            getCanvasTitle,
            projectStoreOptions,
            createDefaultProject,
            sanitizeProject,
            isProjectEmpty,
            loadProject,
            ensureProjectGroups,
            getGroup,
            appendProjectEdge,
            filterProjectEdges,
            applyProjectSchedulerPatch,
            applyProjectViewportPatch,
            CANVAS_PROJECT_PERSISTENCE_CONTROLLER: persistence,
            browserBackendProjectDecision: persistenceMethod.bind(null, 'browserBackendProjectDecision'),
            browserCacheActiveProjectIdKey: persistenceMethod.bind(null, 'browserCacheActiveProjectIdKey'),
            browserCacheProjectIndexKey: persistenceMethod.bind(null, 'browserCacheProjectIndexKey'),
            browserCacheProjectScope: persistenceMethod.bind(null, 'browserCacheProjectScope'),
            browserCacheProjectIndex: persistenceMethod.bind(null, 'browserCacheProjectIndex'),
            setActiveBrowserCacheProject: persistenceMethod.bind(null, 'setActiveBrowserCacheProject'),
            initialBrowserStorageKey: persistenceMethod.bind(null, 'initialBrowserStorageKey'),
            scheduleSave: persistenceMethod.bind(null, 'scheduleSave'),
            scheduleViewportSave: persistenceMethod.bind(null, 'scheduleViewportSave'),
            saveProject: persistenceMethod.bind(null, 'saveProject'),
            saveProjectToBrowserCache: persistenceMethod.bind(null, 'saveProjectToBrowserCache'),
            buildProjectStorageInfo: persistenceMethod.bind(null, 'buildProjectStorageInfo'),
            compactProjectForStorage: persistenceMethod.bind(null, 'compactProjectForStorage'),
            storageDisplayLocation: persistenceMethod.bind(null, 'storageDisplayLocation'),
            storageDisplayPath: persistenceMethod.bind(null, 'storageDisplayPath'),
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
            createDemoWorkbenchProject: actionsMethod.bind(null, 'createDemoWorkbenchProject'),
            ensureInitialDemoProject: actionsMethod.bind(null, 'ensureInitialDemoProject'),
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
