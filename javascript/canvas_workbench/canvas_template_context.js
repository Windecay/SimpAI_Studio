(function () {
    'use strict';

    const modules = {
        templateLibraryDefaults: window.SimpAICanvasWorkbenchTemplateLibraryDefaults || {},
        templateLibraryApi: window.SimpAICanvasWorkbenchTemplateLibraryApi || {},
        confirmDialog: window.SimpAICanvasWorkbenchConfirmDialog || {},
        templateLibraryData: window.SimpAICanvasWorkbenchTemplateLibraryData || {},
        templateLibraryViews: window.SimpAICanvasWorkbenchTemplateLibraryViews || {},
        templateLibrary: window.SimpAICanvasWorkbenchTemplateLibraryController || {}
    };

    function createController(module, factoryName, context) {
        const create = module && module[factoryName];
        return typeof create === 'function' ? (create(context) || {}) : {};
    }

    function method(controller, name) {
        return controller && typeof controller[name] === 'function' ? controller[name] : undefined;
    }

    function createCanvasWorkbenchTemplateContext(source) {
        const scope = source?.templateLibrarySource || source || {};
        const templateLibraryDefaults = createController(
            modules.templateLibraryDefaults,
            'createCanvasTemplateLibraryDefaults',
            { t: scope.t }
        );
        const templateLibraryDefaultsMethod = name => method(templateLibraryDefaults, name);

        const templateLibraryApi = createController(
            modules.templateLibraryApi,
            'createCanvasTemplateLibraryApi',
            {
                saveTemplate: scope.apiSaveTemplate,
                listTemplates: scope.apiListTemplates,
                loadTemplate: scope.apiLoadTemplate,
                deleteTemplate: scope.apiDeleteTemplate,
                isBridgeReady: scope.isCanvasBridgeReady,
                sendBridgeRequest: scope.sendCanvasBridgeRequest,
                getUserContext: scope.getWorkbenchUserContext
            }
        );
        const templateLibraryApiMethod = name => method(templateLibraryApi, name);

        const confirmDialog = createController(
            modules.confirmDialog,
            'createCanvasConfirmDialogController',
            {
                t: scope.t,
                escapeHtml: scope.escapeHtml,
                document: scope.document,
                detectWorkbenchTheme: scope.detectWorkbenchTheme
            }
        );
        const confirmDialogMethod = name => method(confirmDialog, name);

        const templateLibraryData = createController(
            modules.templateLibraryData,
            'createCanvasTemplateLibraryDataController',
            {
                t: scope.t,
                sanitizeStoragePart: scope.sanitizeStoragePart,
                resolveStaticPath: scope.resolveStaticPath,
                getManifestPath: scope.getTemplateLibraryManifestPath,
                getPreviewRoot: scope.getTemplatePreviewRoot,
                fetchManifest: scope.fetchTemplateManifest,
                fetchTemplateProject: scope.fetchTemplateProject,
                sendTemplateListRequest: (...args) => templateLibraryApiMethod('sendTemplateListRequest')?.(...args),
                sendTemplateLoadRequest: (...args) => templateLibraryApiMethod('sendTemplateLoadRequest')?.(...args),
                createFallbackProject: scope.createTemplateFallbackProject,
                showToast: scope.showToast,
                getDefaultTemplateItems: () => templateLibraryDefaultsMethod('getDefaultWorkbenchTemplateLibraryItems')?.() || []
            }
        );
        const templateLibraryDataMethod = name => method(templateLibraryData, name);

        const templateLibraryViews = createController(
            modules.templateLibraryViews,
            'createCanvasTemplateLibraryViewsController',
            { t: scope.t, escapeHtml: scope.escapeHtml }
        );
        const templateLibraryViewsMethod = name => method(templateLibraryViews, name);

        const templateLibrary = createController(
            modules.templateLibrary,
            'createCanvasTemplateLibraryController',
            {
                t: scope.t,
                saveCurrentCanvasAsTemplate: scope.saveCurrentCanvasAsTemplate,
                normalizeTemplateLibraryCategory: templateLibraryViewsMethod('normalizeTemplateLibraryCategory'),
                templateLibraryFilterState: templateLibraryViewsMethod('templateLibraryFilterState'),
                templateCategoryLabel: templateLibraryViewsMethod('templateCategoryLabel'),
                renderTemplateCardHtml: templateLibraryViewsMethod('renderTemplateCardHtml'),
                escapeHtml: scope.escapeHtml,
                deleteUserWorkbenchTemplate: scope.deleteUserWorkbenchTemplate,
                createWorkbenchFromTemplate: scope.createWorkbenchFromTemplate,
                getWorkbenchTemplateLibraryItems: templateLibraryDataMethod('getWorkbenchTemplateLibraryItems'),
                loadWorkbenchTemplateData: templateLibraryDataMethod('loadWorkbenchTemplateData'),
                invalidateTemplateLibraryItems: templateLibraryDataMethod('invalidateTemplateLibraryItems'),
                isTemplateLibraryModalConnected: scope.isTemplateLibraryModalConnected,
                renderTemplateLibraryHtml: templateLibraryViewsMethod('renderTemplateLibraryHtml'),
                renderSaveTemplateDialogHtml: templateLibraryViewsMethod('renderSaveTemplateDialogHtml'),
                renderTemplateWorkbenchIdDialogHtml: templateLibraryViewsMethod('renderTemplateWorkbenchIdDialogHtml'),
                detectWorkbenchTheme: scope.detectWorkbenchTheme,
                document: scope.document,
                showToast: scope.showToast,
                requestCanvasConfirmDialog: confirmDialogMethod('requestCanvasConfirmDialog'),
                sendCanvasTemplateSaveRequest: templateLibraryApiMethod('sendTemplateSaveRequest'),
                sendCanvasTemplateDeleteRequest: templateLibraryApiMethod('sendTemplateDeleteRequest'),
                getCurrentProject: scope.getCurrentProject,
                getDefaultProjectId: scope.getDefaultProjectId,
                getStorageScope: scope.getStorageScope,
                getStorageKey: scope.getStorageKey,
                saveProject: scope.saveProject,
                compactProjectForStorage: scope.compactProjectForStorage,
                getDefaultSettings: scope.getDefaultSettings,
                inferProjectTemplateModelDependency: templateLibraryDataMethod('inferProjectTemplateModelDependency'),
                getTemplateMediaCategories: () => templateLibraryData.TEMPLATE_MEDIA_CATEGORIES || [],
                closeContextMenu: scope.closeContextMenu,
                closeCanvasSettingsPanel: scope.closeCanvasSettingsPanel,
                sanitizeStoragePart: scope.sanitizeStoragePart,
                normalizeTemplateMediaCategory: templateLibraryDataMethod('normalizeTemplateMediaCategory'),
                sanitizeProject: scope.sanitizeProject,
                createDefaultProject: scope.createDefaultProject,
                nowIso: scope.nowIso,
                buildProjectStorageInfo: scope.buildProjectStorageInfo,
                cloneRunValue: scope.cloneRunValue,
                setProject: scope.setProject,
                syncCanvasProjectAssetRoot: scope.syncCanvasProjectAssetRoot,
                resetRenderedProjectDomCache: scope.resetRenderedProjectDomCache,
                refreshCanvasProjectAssetRoot: scope.refreshCanvasProjectAssetRoot,
                setBackendLoadedStorageKey: scope.setBackendLoadedStorageKey,
                resetSelectionState: scope.resetSelectionState,
                resetHistory: scope.resetHistory,
                mutate: scope.mutate,
                resetGalleryFrostReveals: scope.resetGalleryFrostReveals,
                setActiveBrowserCacheProject: scope.setActiveBrowserCacheProject
            }
        );
        const templateLibraryMethod = name => method(templateLibrary, name);

        return {
            CANVAS_TEMPLATE_LIBRARY_DEFAULTS_CONTROLLER: templateLibraryDefaults,
            getDefaultWorkbenchTemplateLibraryItems: templateLibraryDefaultsMethod('getDefaultWorkbenchTemplateLibraryItems'),
            CANVAS_TEMPLATE_LIBRARY_API_CONTROLLER: templateLibraryApi,
            sendCanvasTemplateSaveRequest: templateLibraryApiMethod('sendTemplateSaveRequest'),
            sendCanvasTemplateListRequest: templateLibraryApiMethod('sendTemplateListRequest'),
            sendCanvasTemplateLoadRequest: templateLibraryApiMethod('sendTemplateLoadRequest'),
            sendCanvasTemplateDeleteRequest: templateLibraryApiMethod('sendTemplateDeleteRequest'),
            CANVAS_CONFIRM_DIALOG_CONTROLLER: confirmDialog,
            requestCanvasConfirmDialog: confirmDialogMethod('requestCanvasConfirmDialog'),
            CANVAS_TEMPLATE_LIBRARY_DATA_CONTROLLER: templateLibraryData,
            TEMPLATE_MEDIA_CATEGORIES: templateLibraryData.TEMPLATE_MEDIA_CATEGORIES || [],
            localizeTemplateText: templateLibraryDataMethod('localizeTemplateText'),
            normalizeTemplateModelDependency: templateLibraryDataMethod('normalizeTemplateModelDependency'),
            normalizeTemplateMediaCategory: templateLibraryDataMethod('normalizeTemplateMediaCategory'),
            normalizeTemplateLibraryItem: templateLibraryDataMethod('normalizeTemplateLibraryItem'),
            inferProjectTemplateModelDependency: templateLibraryDataMethod('inferProjectTemplateModelDependency'),
            getWorkbenchTemplateLibraryItems: templateLibraryDataMethod('getWorkbenchTemplateLibraryItems'),
            invalidateTemplateLibraryItems: templateLibraryDataMethod('invalidateTemplateLibraryItems'),
            getUserWorkbenchTemplateLibraryItems: templateLibraryDataMethod('getUserWorkbenchTemplateLibraryItems'),
            loadWorkbenchTemplateData: templateLibraryDataMethod('loadWorkbenchTemplateData'),
            resolveTemplatePreviewPath: templateLibraryDataMethod('resolveTemplatePreviewPath'),
            CANVAS_TEMPLATE_LIBRARY_VIEWS_CONTROLLER: templateLibraryViews,
            normalizeTemplateLibraryCategory: templateLibraryViewsMethod('normalizeTemplateLibraryCategory'),
            templateCategoryLabel: templateLibraryViewsMethod('templateCategoryLabel'),
            templateLibraryFilterState: templateLibraryViewsMethod('templateLibraryFilterState'),
            renderTemplateCardHtml: templateLibraryViewsMethod('renderTemplateCardHtml'),
            renderTemplateLibraryHtml: templateLibraryViewsMethod('renderTemplateLibraryHtml'),
            renderSaveTemplateDialogHtml: templateLibraryViewsMethod('renderSaveTemplateDialogHtml'),
            renderTemplateWorkbenchIdDialogHtml: templateLibraryViewsMethod('renderTemplateWorkbenchIdDialogHtml'),
            CANVAS_TEMPLATE_LIBRARY_CONTROLLER: templateLibrary,
            bindTemplateLibraryModal: templateLibraryMethod('bindTemplateLibraryModal'),
            closeTemplateLibrary: templateLibraryMethod('closeTemplateLibrary'),
            openTemplateLibrary: templateLibraryMethod('openTemplateLibrary'),
            saveCurrentCanvasAsTemplate: templateLibraryMethod('saveCurrentCanvasAsTemplate'),
            deleteUserWorkbenchTemplate: templateLibraryMethod('deleteUserWorkbenchTemplate'),
            createWorkbenchFromTemplate: templateLibraryMethod('createWorkbenchFromTemplate'),
            refreshTemplateLibraryModal: templateLibraryMethod('refreshTemplateLibraryModal'),
            refreshTemplateLibraryAfterMutation: templateLibraryMethod('refreshTemplateLibraryAfterMutation'),
            requestSaveTemplateDetails: templateLibraryMethod('requestSaveTemplateDetails'),
            requestTemplateWorkbenchId: templateLibraryMethod('requestTemplateWorkbenchId'),
            applyTemplateWorkbenchProject: templateLibraryMethod('applyTemplateWorkbenchProject'),
            beginTemplateWorkbenchCreation: templateLibraryMethod('beginTemplateWorkbenchCreation'),
            isLatestTemplateWorkbenchCreation: templateLibraryMethod('isLatestTemplateWorkbenchCreation'),
            cancelTemplateWorkbenchCreation: templateLibraryMethod('cancelTemplateWorkbenchCreation'),
            beginTemplateLibraryRefresh: templateLibraryMethod('beginTemplateLibraryRefresh'),
            isLatestTemplateLibraryRefresh: templateLibraryMethod('isLatestTemplateLibraryRefresh'),
            cancelTemplateLibraryRefresh: templateLibraryMethod('cancelTemplateLibraryRefresh'),
            restoreTemplateWorkbenchCreation: templateLibraryMethod('restoreTemplateWorkbenchCreation')
        };
    }

    window.SimpAICanvasWorkbenchTemplateContext = Object.assign(
        {},
        window.SimpAICanvasWorkbenchTemplateContext || {},
        { createCanvasWorkbenchTemplateContext }
    );
})();
