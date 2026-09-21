(function () {
    'use strict';

    const modules = {
        backendRequests: window.SimpAICanvasWorkbenchBackendRequests || {},
        qwenTtsPresets: window.SimpAICanvasWorkbenchQwenTtsPresets || {}
    };

    function createController(module, factoryName, context) {
        const create = module && module[factoryName];
        return typeof create === 'function' ? (create(context) || {}) : {};
    }

    function method(controller, name) {
        return controller && typeof controller[name] === 'function' ? controller[name] : undefined;
    }

    function createCanvasWorkbenchBackendContext(source) {
        const scope = source?.backendSource || source || {};
        const backendRequestSource = scope.backendRequestSource || {};
        const qwenTtsPresetsSource = scope.qwenTtsPresetsSource || {};
        const backendController = createController(
            modules.backendRequests,
            'createCanvasBackendRequestController',
            backendRequestSource
        );
        const backendMethod = name => method(backendController, name);
        const qwenTtsPresetsController = createController(
            modules.qwenTtsPresets,
            'createCanvasQwenTtsPresetsController',
            {
                ...qwenTtsPresetsSource,
                requestSource: Object.assign({}, qwenTtsPresetsSource.requestSource || {}, {
                    sendCanvasQwenTtsPresetsRequest: backendMethod('sendCanvasQwenTtsPresetsRequest'),
                }),
            }
        );
        const qwenTtsPresetsMethod = name => method(qwenTtsPresetsController, name);

        return {
            CANVAS_BACKEND_REQUEST_CONTROLLER: backendController,
            getWorkbenchUserContext: backendMethod('getWorkbenchUserContext'),
            withWorkbenchUserContext: backendMethod('withWorkbenchUserContext'),
            sendCanvasDryRunRequest: backendMethod('sendCanvasDryRunRequest'),
            sendCanvasRunNodeRequest: backendMethod('sendCanvasRunNodeRequest'),
            sendCanvasPollRunRequest: backendMethod('sendCanvasPollRunRequest'),
            sendCanvasControlRunRequest: backendMethod('sendCanvasControlRunRequest'),
            sendCanvasQwenTtsRunRequest: backendMethod('sendCanvasQwenTtsRunRequest'),
            sendCanvasQwenTtsPollRequest: backendMethod('sendCanvasQwenTtsPollRequest'),
            sendCanvasQwenTtsControlRequest: backendMethod('sendCanvasQwenTtsControlRequest'),
            sendCanvasQwenTtsPresetsRequest: backendMethod('sendCanvasQwenTtsPresetsRequest'),
            sendCanvasModelCatalogRequest: backendMethod('sendCanvasModelCatalogRequest'),
            sendCanvasPresetModelStatusRequest: backendMethod('sendCanvasPresetModelStatusRequest'),
            sendCanvasPresetModelDownloadsRequest: backendMethod('sendCanvasPresetModelDownloadsRequest'),
            sendCanvasVlmModelStatusRequest: backendMethod('sendCanvasVlmModelStatusRequest'),
            sendCanvasVlmModelDownloadsRequest: backendMethod('sendCanvasVlmModelDownloadsRequest'),
            sendCanvasVlmModelDownloadStatusRequest: backendMethod('sendCanvasVlmModelDownloadStatusRequest'),
            sendCanvasVlmModelDownloadCancelRequest: backendMethod('sendCanvasVlmModelDownloadCancelRequest'),
            sendCanvasCustomLlmModelsRequest: backendMethod('sendCanvasCustomLlmModelsRequest'),
            sendVlmSystemPromptTemplatesRequest: backendMethod('sendVlmSystemPromptTemplatesRequest'),
            sendCanvasListAssetsRequest: backendMethod('sendCanvasListAssetsRequest'),
            sendCanvasDeleteAssetsRequest: backendMethod('sendCanvasDeleteAssetsRequest'),
            sendCanvasMaterializeAssetRequest: backendMethod('sendCanvasMaterializeAssetRequest'),
            sendCanvasGenerateMaskRequest: backendMethod('sendCanvasGenerateMaskRequest'),
            sendCanvasRenderTimelineRequest: backendMethod('sendCanvasRenderTimelineRequest'),
            sendCanvasRenderTimelineFrameRequest: backendMethod('sendCanvasRenderTimelineFrameRequest'),
            sendCanvasWd14TagRequest: backendMethod('sendCanvasWd14TagRequest'),
            sendCanvasVlmRunRequest: backendMethod('sendCanvasVlmRunRequest'),
            sendCanvasVlmCancelRequest: backendMethod('sendCanvasVlmCancelRequest'),
            sendCanvasTranslateRunRequest: backendMethod('sendCanvasTranslateRunRequest'),
            sendCanvasTranslatePollRequest: backendMethod('sendCanvasTranslatePollRequest'),
            sendCanvasProjectSaveRequest: backendMethod('sendCanvasProjectSaveRequest'),
            sendCanvasProjectLoadRequest: backendMethod('sendCanvasProjectLoadRequest'),
            sendCanvasProjectListRequest: backendMethod('sendCanvasProjectListRequest'),
            sendCanvasProjectDeleteRequest: backendMethod('sendCanvasProjectDeleteRequest'),
            sendCanvasProjectClearRequest: backendMethod('sendCanvasProjectClearRequest'),
            CANVAS_QWEN_TTS_PRESETS_CONTROLLER: qwenTtsPresetsController,
            normalizeQwenTtsPresetEntries: qwenTtsPresetsMethod('normalizeQwenTtsPresetEntries'),
            getQwenTtsStylePresetEntries: qwenTtsPresetsMethod('getQwenTtsStylePresetEntries'),
            getQwenTtsStylePresetState: qwenTtsPresetsMethod('getQwenTtsStylePresetState'),
            refreshQwenTtsStylePresets: qwenTtsPresetsMethod('refreshQwenTtsStylePresets')
        };
    }

    window.SimpAICanvasWorkbenchBackendContext = Object.assign({}, window.SimpAICanvasWorkbenchBackendContext || {}, {
        createCanvasWorkbenchBackendContext
    });
})();
