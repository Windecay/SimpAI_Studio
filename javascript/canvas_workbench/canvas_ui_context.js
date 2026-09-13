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
                vlmModelDisplayLabel: scope.vlmModelDisplayLabel,
                canvasAgentAspectOptions: scope.canvasAgentAspectOptions,
                normalizePresetName: scope.normalizePresetName,
                getVlmCustomProvider: scope.getVlmCustomProvider,
                getVlmCustomApiProfile: scope.getVlmCustomApiProfile,
                getVlmCustomProfileKey: scope.getVlmCustomProfileKey,
                readVlmCustomApiProfiles: scope.readVlmCustomApiProfiles,
                writeVlmCustomApiProfiles: scope.writeVlmCustomApiProfiles,
                getCanvasSettingsPanel: scope.getCanvasSettingsPanel,
                decodeCanvasAgentVideoToolChoice: scope.decodeCanvasAgentVideoToolChoice,
                getProject: scope.getCurrentProject,
                getCurrentProjectId: scope.getCurrentProjectId,
                getAgentState: scope.getCanvasAgentState,
                getSelectedNodeId: scope.getSelectedNodeId,
                getNode: scope.getNode,
                pushHistoryBatch: scope.pushHistoryBatch,
                pushHistory: scope.pushHistory,
                scheduleSave: scope.scheduleSave,
                mutate: scope.mutate,
                showToast: scope.showToast,
                nowIso: scope.nowIso,
                buildVlmModelUnknownStatus: scope.buildVlmModelUnknownStatus,
                buildVlmParamsPatch: scope.buildVlmParamsPatch,
                buildVlmModelStatusPatch: scope.buildVlmModelStatusPatch,
                sendCanvasVlmRunRequest: scope.sendCanvasVlmRunRequest,
                sendCanvasAgentCustomModelsRequest: scope.sendCanvasAgentCustomModelsRequest,
                renderCanvasAgentPanel: scope.renderCanvasAgentPanel,
                renderCanvasSettingsPanel: scope.renderCanvasSettingsPanel,
                renderStatus: scope.renderStatus,
                getCanvasAgentPanel: scope.getCanvasAgentPanel,
                getDocument: scope.getDocument,
                buildProjectSettingsMergePatch: scope.buildProjectSettingsMergePatch
            }
        );
        const agentSettingsMethod = name => method(agentSettings, name);

        const outpaint = createController(
            modules.outpaint,
            'createCanvasOutpaintController',
            {
                t: scope.t,
                escapeHtml: scope.escapeHtml,
                getDocument: scope.getDocument,
                getOutpaintOverlayState: scope.getOutpaintOverlayState,
                getOutpaintOverlayElement: scope.getOutpaintOverlayElement,
                getProject: scope.getProject,
                getOutpaintNodeElement: scope.getOutpaintNodeElement,
                getOutpaintStage: scope.getOutpaintStage,
                defaultNodeSize: scope.defaultNodeSize,
                isCanvasAgentImageTarget: scope.isCanvasAgentImageTarget,
                getViewportZoom: scope.getViewportZoom,
                clamp: scope.clamp,
                getCanvasAgentPanel: scope.getCanvasAgentPanel,
                getCanvasAgentSettings: agentSettingsMethod('getCanvasAgentSettings'),
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
                saveCanvasAgentCustomSecret: agentSettingsMethod('saveCanvasAgentCustomSecret'),
                fetchCanvasAgentCustomModels: agentSettingsMethod('fetchCanvasAgentCustomModels'),
                testCanvasAgentCustomApi: agentSettingsMethod('testCanvasAgentCustomApi'),
                syncCanvasAgentCustomFromSelectedVlm: agentSettingsMethod('syncCanvasAgentCustomFromSelectedVlm'),
                syncSelectedVlmCustomFromCanvasAgent: agentSettingsMethod('syncSelectedVlmCustomFromCanvasAgent'),
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
            canvasAgentDefaultLocalRewriteModel: agentSettingsMethod('canvasAgentDefaultLocalRewriteModel'),
            canvasAgentLocalRewriteModels: agentSettingsMethod('canvasAgentLocalRewriteModels'),
            canvasAgentModelSummary: agentSettingsMethod('canvasAgentModelSummary'),
            getCanvasAgentResolutionState: agentSettingsMethod('getCanvasAgentResolutionState'),
            setCanvasAgentResolutionPatch: agentSettingsMethod('setCanvasAgentResolutionPatch'),
            setCanvasAgentResolutionOpen: agentSettingsMethod('setCanvasAgentResolutionOpen'),
            canvasAgentResolutionLabel: agentSettingsMethod('canvasAgentResolutionLabel'),
            canvasAgentResolutionCompactLabel: agentSettingsMethod('canvasAgentResolutionCompactLabel'),
            revealCanvasAgentPanelForToolCard: agentSettingsMethod('revealCanvasAgentPanelForToolCard'),
            dockCanvasAgentPanelBottomLeft: agentSettingsMethod('dockCanvasAgentPanelBottomLeft'),
            getCanvasAgentRewriteModel: agentSettingsMethod('getCanvasAgentRewriteModel'),
            handleCanvasAgentSettingInput: agentSettingsMethod('handleCanvasAgentSettingInput'),
            handleCanvasAgentModelModeInput: agentSettingsMethod('handleCanvasAgentModelModeInput'),
            canvasAgentCustomParamsFromSettings: agentSettingsMethod('canvasAgentCustomParamsFromSettings'),
            getCanvasAgentCustomRuntimeParams: agentSettingsMethod('getCanvasAgentCustomRuntimeParams'),
            getCanvasAgentCustomKeyValue: agentSettingsMethod('getCanvasAgentCustomKeyValue'),
            getCanvasAgentCustomModelChoices: agentSettingsMethod('getCanvasAgentCustomModelChoices'),
            saveCanvasAgentCustomSecret: agentSettingsMethod('saveCanvasAgentCustomSecret'),
            fetchCanvasAgentCustomModels: agentSettingsMethod('fetchCanvasAgentCustomModels'),
            testCanvasAgentCustomApi: agentSettingsMethod('testCanvasAgentCustomApi'),
            syncCanvasAgentCustomFromSelectedVlm: agentSettingsMethod('syncCanvasAgentCustomFromSelectedVlm'),
            syncSelectedVlmCustomFromCanvasAgent: agentSettingsMethod('syncSelectedVlmCustomFromCanvasAgent'),
            CANVAS_OUTPAINT_CONTROLLER: outpaint,
            startOutpaintEdgeDrag: outpaintMethod('startOutpaintEdgeDrag'),
            updateOutpaintFromSlider: outpaintMethod('updateOutpaintFromSlider'),
            onOutpaintOverlayPointerDown: outpaintMethod('onOutpaintOverlayPointerDown'),
            onOutpaintSliderInput: outpaintMethod('onOutpaintSliderInput'),
            syncOutpaintAgentPanel: outpaintMethod('syncOutpaintAgentPanel'),
            cancelOutpaintEdgeDrag: outpaintMethod('cancelOutpaintEdgeDrag'),
            renderOutpaintControlPanel: outpaintMethod('renderOutpaintControlPanel'),
            showOutpaintOverlay: outpaintMethod('showOutpaintOverlay'),
            hideOutpaintOverlay: outpaintMethod('hideOutpaintOverlay'),
            getOutpaintTargetNode: outpaintMethod('getOutpaintTargetNode'),
            getOutpaintMediaGeometry: outpaintMethod('getOutpaintMediaGeometry'),
            getOutpaintMediaSize: outpaintMethod('getOutpaintMediaSize'),
            syncOutpaintOverlayPosition: outpaintMethod('syncOutpaintOverlayPosition'),
            ensureOutpaintOverlayMatchesAgentTarget: outpaintMethod('ensureOutpaintOverlayMatchesAgentTarget'),
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
