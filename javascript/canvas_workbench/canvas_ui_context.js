(function () {
    'use strict';

    const modules = {
        settingsViews: window.SimpAICanvasWorkbenchSettingsViews || {},
        agentSettings: window.SimpAICanvasWorkbenchCanvasAgentSettings || {},
        outpaint: window.SimpAICanvasWorkbenchOutpaint || {},
        settingsController: window.SimpAICanvasWorkbenchSettingsController || {}
    };

    function createController(module, factoryName, context) {
        const create = module && module[factoryName];
        return typeof create === 'function' ? (create(context) || {}) : {};
    }

    function method(controller, name) {
        return controller && typeof controller[name] === 'function' ? controller[name] : undefined;
    }

    function createCanvasWorkbenchUiContext(source) {
        const scope = source?.uiSource || source || {};
        const settingsViews = createController(
            modules.settingsViews,
            'createCanvasSettingsViewsController',
            { t: scope.t, escapeHtml: scope.escapeHtml }
        );
        const settingsViewsMethod = name => method(settingsViews, name);

        const agentSettings = createController(
            modules.agentSettings,
            'createCanvasAgentSettingsController',
            {
                getDefaultSettings: scope.getCanvasAgentDefaultSettings,
                getDefaultProjectSettings: scope.getDefaultSettings,
                getVersionChoices: scope.getVersionChoices,
                t: scope.t,
                clamp: scope.clamp,
                normalizePresetName: scope.normalizePresetName,
                getVlmCustomProvider: scope.getVlmCustomProvider,
                getVlmCustomApiProfile: scope.getVlmCustomApiProfile,
                getCanvasAgentCustomKeyValue: scope.getCanvasAgentCustomKeyValue,
                decodeCanvasAgentVideoToolChoice: scope.decodeCanvasAgentVideoToolChoice,
                getProject: scope.getCurrentProject,
                getAgentState: scope.getCanvasAgentState,
                pushHistoryBatch: scope.pushHistoryBatch,
                scheduleSave: scope.scheduleSave,
                renderCanvasAgentPanel: scope.renderCanvasAgentPanel,
                renderCanvasSettingsPanel: scope.renderCanvasSettingsPanel,
                renderStatus: scope.renderStatus,
                buildProjectSettingsMergePatch: scope.buildProjectSettingsMergePatch
            }
        );
        const agentSettingsMethod = name => method(agentSettings, name);

        const outpaint = createController(
            modules.outpaint,
            'createCanvasOutpaintController',
            {
                getDocument: scope.getDocument,
                getOutpaintOverlayState: scope.getOutpaintOverlayState,
                getOutpaintTargetNode: scope.getOutpaintTargetNode,
                getOutpaintMediaSize: scope.getOutpaintMediaSize,
                getViewportZoom: scope.getViewportZoom,
                clamp: scope.clamp,
                getCanvasAgentPanel: scope.getCanvasAgentPanel,
                syncOutpaintOverlayPosition: scope.syncOutpaintOverlayPosition,
                setCanvasAgentSettingsPatch: agentSettingsMethod('setCanvasAgentSettingsPatch')
            }
        );

        const settingsController = createController(
            modules.settingsController,
            'createCanvasSettingsController',
            {
                getCanvasSettingsPanel: scope.getCanvasSettingsPanel,
                getCanvasSettingsTab: scope.getCanvasSettingsTab,
                setCanvasSettingsTab: scope.setCanvasSettingsTab,
                renderCanvasSettingsPanel: scope.renderCanvasSettingsPanel,
                isCanvasAgentPresetScanIdle: scope.isCanvasAgentPresetScanIdle,
                refreshCanvasAgentAvailablePresets: scope.refreshCanvasAgentAvailablePresets,
                closeContextMenu: scope.closeContextMenu,
                closeRunQueuePanel: scope.closeRunQueuePanel,
                closeRunHistoryPanel: scope.closeRunHistoryPanel,
                getCanvasAgentSettings: agentSettingsMethod('getCanvasAgentSettings'),
                setCanvasAgentSettingsPatch: agentSettingsMethod('setCanvasAgentSettingsPatch'),
                saveCanvasAgentCustomSecret: scope.saveCanvasAgentCustomSecret,
                fetchCanvasAgentCustomModels: scope.fetchCanvasAgentCustomModels,
                testCanvasAgentCustomApi: scope.testCanvasAgentCustomApi,
                syncCanvasAgentCustomFromSelectedVlm: scope.syncCanvasAgentCustomFromSelectedVlm,
                syncSelectedVlmCustomFromCanvasAgent: scope.syncSelectedVlmCustomFromCanvasAgent,
                toggleSetting: scope.toggleSetting,
                openTemplateLibrary: scope.openTemplateLibrary,
                saveCurrentCanvasAsTemplate: scope.saveCurrentCanvasAsTemplate,
                clearBrowserCache: scope.clearBrowserCache,
                clearProjectFileWithConfirm: scope.clearProjectFileWithConfirm
            }
        );
        const outpaintMethod = name => method(outpaint, name);
        const settingsControllerMethod = name => method(settingsController, name);

        return {
            CANVAS_SETTINGS_VIEWS_CONTROLLER: settingsViews,
            renderCanvasSettingsPanelView: settingsViewsMethod('renderCanvasSettingsPanel'),
            CANVAS_AGENT_SETTINGS_CONTROLLER: agentSettings,
            getCanvasAgentSettings: agentSettingsMethod('getCanvasAgentSettings'),
            setCanvasAgentSettingsPatch: agentSettingsMethod('setCanvasAgentSettingsPatch'),
            setCanvasAgentLayoutPatch: agentSettingsMethod('setCanvasAgentLayoutPatch'),
            revealCanvasAgentPanelForToolCard: agentSettingsMethod('revealCanvasAgentPanelForToolCard'),
            dockCanvasAgentPanelBottomLeft: agentSettingsMethod('dockCanvasAgentPanelBottomLeft'),
            getCanvasAgentRewriteModel: agentSettingsMethod('getCanvasAgentRewriteModel'),
            handleCanvasAgentSettingInput: agentSettingsMethod('handleCanvasAgentSettingInput'),
            canvasAgentCustomParamsFromSettings: agentSettingsMethod('canvasAgentCustomParamsFromSettings'),
            getCanvasAgentCustomRuntimeParams: agentSettingsMethod('getCanvasAgentCustomRuntimeParams'),
            CANVAS_OUTPAINT_CONTROLLER: outpaint,
            startOutpaintEdgeDrag: outpaintMethod('startOutpaintEdgeDrag'),
            updateOutpaintFromSlider: outpaintMethod('updateOutpaintFromSlider'),
            onOutpaintOverlayPointerDown: outpaintMethod('onOutpaintOverlayPointerDown'),
            onOutpaintSliderInput: outpaintMethod('onOutpaintSliderInput'),
            syncOutpaintAgentPanel: outpaintMethod('syncOutpaintAgentPanel'),
            cancelOutpaintEdgeDrag: outpaintMethod('cancelOutpaintEdgeDrag'),
            CANVAS_SETTINGS_CONTROLLER: settingsController,
            openCanvasSettingsPanel: settingsControllerMethod('openCanvasSettingsPanel'),
            closeCanvasSettingsPanel: settingsControllerMethod('closeCanvasSettingsPanel'),
            handleCanvasSettingsAction: settingsControllerMethod('handleCanvasSettingsAction')
        };
    }

    window.SimpAICanvasWorkbenchUiContext = Object.assign({}, window.SimpAICanvasWorkbenchUiContext || {}, {
        createCanvasWorkbenchUiContext
    });
})();
