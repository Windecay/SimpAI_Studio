(function () {
    'use strict';

    const modules = {
        mode: window.SimpAICanvasWorkbenchMode || {},
        action: window.SimpAICanvasWorkbenchAction || {},
        click: window.SimpAICanvasWorkbenchClick || {}
    };

    function createController(module, factoryName, context) {
        const create = module && module[factoryName];
        return typeof create === 'function' ? (create(context) || {}) : {};
    }

    function method(controller, name) {
        return controller && typeof controller[name] === 'function' ? controller[name] : undefined;
    }

    function createCanvasWorkbenchControlContext(source) {
        const scope = source?.controlSource || source || {};

        const mode = createController(
            modules.mode,
            'createCanvasModeController',
            {
                setModeState: scope.setModeState,
                openPresetPalette: scope.openPresetPalette,
                viewportCenterWorld: scope.viewportCenterWorld,
                getRoot: scope.getRoot,
                getViewport: scope.getViewport,
                getMode: scope.getMode
            }
        );
        const modeMethod = name => method(mode, name);

        const action = createController(
            modules.action,
            'createCanvasActionController',
            {
                t: scope.t,
                closeContextMenu: scope.closeContextMenu,
                saveProject: scope.saveProject,
                openProjectListPanel: scope.openProjectListPanel,
                openProjectJsonPicker: scope.openProjectJsonPicker,
                undoCanvasEdit: scope.undoCanvasEdit,
                redoCanvasEdit: scope.redoCanvasEdit,
                isStandaloneCanvasWorkbench: scope.isStandaloneCanvasWorkbench,
                showToast: scope.showToast,
                closeWorkbench: scope.closeWorkbench,
                importSelectedTransferAt: scope.importSelectedTransferAt,
                viewportCenterWorld: scope.viewportCenterWorld,
                openImageFilePicker: scope.openImageFilePicker,
                addMediaBrowserNode: scope.addMediaBrowserNode,
                openPresetPalette: scope.openPresetPalette,
                addStyleSelectorNode: scope.addStyleSelectorNode,
                addTextNode: scope.addTextNode,
                addTextMergeNode: scope.addTextMergeNode,
                addWildcardsHelperNode: scope.addWildcardsHelperNode,
                addNoteNode: scope.addNoteNode,
                addAreaGroup: scope.addAreaGroup,
                openGroupListPanel: scope.openGroupListPanel,
                openTemplateLibrary: scope.openTemplateLibrary,
                addTranslationNode: scope.addTranslationNode,
                addTagCartNode: scope.addTagCartNode,
                addWd14Node: scope.addWd14Node,
                addVlmNode: scope.addVlmNode,
                addQwenTtsNode: scope.addQwenTtsNode,
                addSam3VideoMaskNode: scope.addSam3VideoMaskNode,
                addCameraMotionNode: scope.addCameraMotionNode,
                addPoseStudioNode: scope.addPoseStudioNode,
                addGaussianStudioNode: scope.addGaussianStudioNode,
                addLivePortraitExpressionNode: scope.addLivePortraitExpressionNode,
                addCompareNode: scope.addCompareNode,
                addDirectorTimelineNode: scope.addDirectorTimelineNode,
                addTimelineNode: scope.addTimelineNode,
                addManualOutputNode: scope.addManualOutputNode,
                openRunHistoryPanel: scope.openRunHistoryPanel,
                openRunQueuePanel: scope.openRunQueuePanel,
                runSelectedChain: scope.runSelectedChain,
                getSelectedNodeIdList: scope.getSelectedNodeIdList,
                getNode: scope.getNode,
                isImageCompareSource: scope.isImageCompareSource,
                createCompareNodeFromSources: scope.createCompareNodeFromSources,
                isTimelineSource: scope.isTimelineSource,
                createTimelineNodeFromSources: scope.createTimelineNodeFromSources,
                openNodeSearchPanel: scope.openNodeSearchPanel,
                openAssetManagerPanel: scope.openAssetManagerPanel,
                openCanvasManual: scope.openCanvasManual,
                toggleSetting: scope.toggleSetting,
                deleteSelection: scope.deleteSelection,
                clearCanvasWithConfirm: scope.clearCanvasWithConfirm,
                openCanvasSettingsPanel: scope.openCanvasSettingsPanel,
                zoomAtViewportCenter: scope.zoomAtViewportCenter,
                getProject: scope.getProject,
                renderAll: scope.renderAll,
                scheduleSave: scope.scheduleSave,
                fitAll: scope.fitAll,
                centerCanvas: scope.centerCanvas
            }
        );
        const actionMethod = name => method(action, name);

        const click = createController(
            modules.click,
            'createCanvasClickController',
            {
                now: scope.now,
                getCanvasAgentSuppressClickUntil: scope.getCanvasAgentSuppressClickUntil,
                handleCanvasAgentAction: scope.handleCanvasAgentAction,
                handleRunHistoryAction: scope.handleRunHistoryAction,
                handleRunQueueAction: scope.handleRunQueueAction,
                handleCanvasSettingsAction: scope.handleCanvasSettingsAction,
                updateVlmChatJumpButton: scope.updateVlmChatJumpButton,
                handleAction: (...args) => actionMethod('handleAction')?.(...args),
                setMode: (...args) => modeMethod('setMode')?.(...args),
                textareaEditorFieldFromTitleClick: scope.textareaEditorFieldFromTitleClick,
                openTextareaEditor: scope.openTextareaEditor
            }
        );
        const clickMethod = name => method(click, name);

        return {
            CANVAS_MODE_CONTROLLER: mode,
            setMode: modeMethod('setMode'),
            renderMode: modeMethod('renderMode'),
            CANVAS_ACTION_CONTROLLER: action,
            handleCanvasAction: actionMethod('handleAction'),
            CANVAS_CLICK_CONTROLLER: click,
            onCanvasWorkbenchClick: clickMethod('onClick')
        };
    }

    window.SimpAICanvasWorkbenchControlContext = Object.assign({}, window.SimpAICanvasWorkbenchControlContext || {}, {
        createCanvasWorkbenchControlContext
    });
})();
