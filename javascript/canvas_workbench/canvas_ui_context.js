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
        const settingsViewsSource = scope.settingsViewsSource || {};
        const agentSettingsSource = scope.agentSettingsSource || {};
        const outpaintSource = scope.outpaintSource || {};
        const settingsSource = scope.settingsSource || {};
        const settingsViews = createController(
            modules.settingsViews,
            'createCanvasSettingsViewsController',
            settingsViewsSource
        );
        const settingsViewsMethod = name => method(settingsViews, name);

        const agentSettings = createController(
            modules.agentSettings,
            'createCanvasAgentSettingsController',
            agentSettingsSource
        );
        const agentSettingsMethod = name => method(agentSettings, name);

        const outpaint = createController(
            modules.outpaint,
            'createCanvasOutpaintController',
            Object.assign({}, outpaintSource, {
                projectSource: Object.assign({}, outpaintSource.projectSource || {}, {
                    getCanvasAgentSettings: agentSettingsMethod('getCanvasAgentSettings'),
                    setCanvasAgentSettingsPatch: agentSettingsMethod('setCanvasAgentSettingsPatch')
                })
            })
        );

        const settingsController = createController(
            modules.settingsController,
            'createCanvasSettingsController',
            settingsSource
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
