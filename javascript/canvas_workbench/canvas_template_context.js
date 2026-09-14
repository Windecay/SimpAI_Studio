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
        const defaultsSource = scope.defaultsSource || {};
        const apiSource = scope.apiSource || {};
        const confirmSource = scope.confirmSource || {};
        const dataSource = scope.dataSource || {};
        const viewsSource = scope.viewsSource || {};
        const librarySource = scope.librarySource || {};
        const templateLibraryDefaults = createController(
            modules.templateLibraryDefaults,
            'createCanvasTemplateLibraryDefaults',
            defaultsSource
        );
        const templateLibraryDefaultsMethod = name => method(templateLibraryDefaults, name);

        const templateLibraryApi = createController(
            modules.templateLibraryApi,
            'createCanvasTemplateLibraryApi',
            apiSource
        );
        const templateLibraryApiMethod = name => method(templateLibraryApi, name);

        const confirmDialog = createController(
            modules.confirmDialog,
            'createCanvasConfirmDialogController',
            confirmSource
        );
        const confirmDialogMethod = name => method(confirmDialog, name);

        const templateLibraryDataSource = Object.assign({}, dataSource, {
            apiSource: Object.assign({}, dataSource.apiSource || {}, {
                sendTemplateListRequest: (...args) => templateLibraryApiMethod('sendTemplateListRequest')?.(...args),
                sendTemplateLoadRequest: (...args) => templateLibraryApiMethod('sendTemplateLoadRequest')?.(...args)
            }),
            defaultsSource: Object.assign({}, dataSource.defaultsSource || {}, {
                getDefaultTemplateItems: () => templateLibraryDefaultsMethod('getDefaultWorkbenchTemplateLibraryItems')?.() || []
            })
        });

        const templateLibraryData = createController(
            modules.templateLibraryData,
            'createCanvasTemplateLibraryDataController',
            templateLibraryDataSource
        );
        const templateLibraryDataMethod = name => method(templateLibraryData, name);

        const templateLibraryViews = createController(
            modules.templateLibraryViews,
            'createCanvasTemplateLibraryViewsController',
            viewsSource
        );
        const templateLibraryViewsMethod = name => method(templateLibraryViews, name);

        const templateLibrarySource = Object.assign({}, librarySource, {
            languageSource: Object.assign({}, librarySource.languageSource || {}),
            domSource: Object.assign({}, librarySource.domSource || {}),
            viewSource: Object.assign({}, librarySource.viewSource || {}, {
                normalizeTemplateLibraryCategory: templateLibraryViewsMethod('normalizeTemplateLibraryCategory'),
                templateLibraryFilterState: templateLibraryViewsMethod('templateLibraryFilterState'),
                templateCategoryLabel: templateLibraryViewsMethod('templateCategoryLabel'),
                renderTemplateCardHtml: templateLibraryViewsMethod('renderTemplateCardHtml'),
                renderTemplateLibraryHtml: templateLibraryViewsMethod('renderTemplateLibraryHtml'),
                renderSaveTemplateDialogHtml: templateLibraryViewsMethod('renderSaveTemplateDialogHtml'),
                renderTemplateWorkbenchIdDialogHtml: templateLibraryViewsMethod('renderTemplateWorkbenchIdDialogHtml')
            }),
            dataSource: Object.assign({}, librarySource.dataSource || {}, {
                getWorkbenchTemplateLibraryItems: templateLibraryDataMethod('getWorkbenchTemplateLibraryItems'),
                loadWorkbenchTemplateData: templateLibraryDataMethod('loadWorkbenchTemplateData'),
                invalidateTemplateLibraryItems: templateLibraryDataMethod('invalidateTemplateLibraryItems'),
                inferProjectTemplateModelDependency: templateLibraryDataMethod('inferProjectTemplateModelDependency'),
                getTemplateMediaCategories: () => templateLibraryData.TEMPLATE_MEDIA_CATEGORIES || [],
                normalizeTemplateMediaCategory: templateLibraryDataMethod('normalizeTemplateMediaCategory')
            }),
            apiSource: Object.assign({}, librarySource.apiSource || {}, {
                sendCanvasTemplateSaveRequest: templateLibraryApiMethod('sendTemplateSaveRequest'),
                sendCanvasTemplateDeleteRequest: templateLibraryApiMethod('sendTemplateDeleteRequest')
            }),
            dialogSource: Object.assign({}, librarySource.dialogSource || {}, {
                requestCanvasConfirmDialog: confirmDialogMethod('requestCanvasConfirmDialog')
            })
        });

        const templateLibrary = createController(
            modules.templateLibrary,
            'createCanvasTemplateLibraryController',
            templateLibrarySource
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
