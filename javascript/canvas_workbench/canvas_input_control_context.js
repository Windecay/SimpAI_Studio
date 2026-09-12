(function () {
    'use strict';

    const modules = {
        textControlContext: window.SimpAICanvasWorkbenchTextControlContext || {},
        compareDrag: window.SimpAICanvasWorkbenchCompareDrag || {},
        textControlPointer: window.SimpAICanvasWorkbenchTextControlPointer || {},
        agentInput: window.SimpAICanvasWorkbenchCanvasAgentInput || {}
    };

    function createController(module, factoryName, context) {
        const create = module && module[factoryName];
        return typeof create === 'function' ? (create(context) || {}) : {};
    }

    function method(controller, name) {
        return controller && typeof controller[name] === 'function' ? controller[name] : undefined;
    }

    function createCanvasWorkbenchInputControlContext(source) {
        const scope = source || {};
        const controllers = {};

        controllers.textControlContext = createController(modules.textControlContext, 'createCanvasTextControlContextController', {
            getDocument: scope.getDocument,
            getWindow: scope.getWindow,
            t: scope.t,
            openContextMenu: scope.openContextMenu,
            showToast: scope.showToast
        });
        const textControlMethod = name => method(controllers.textControlContext, name);

        controllers.compareDrag = createController(modules.compareDrag, 'createCanvasCompareDragController', {
            getDocument: scope.getDocument,
            getNode: scope.getNode,
            isNodeLocked: scope.isNodeLocked,
            clamp: scope.clamp,
            performanceNow: scope.performanceNow,
            setSuppressWheelUntil: scope.setSuppressWheelUntil,
            isCompareNodeSelected: scope.isCompareNodeSelected,
            selectNodeLight: scope.selectNodeLight,
            updateCompareParam: scope.updateCompareParam,
            refreshCompareDom: scope.refreshCompareDom,
            scheduleSave: scope.scheduleSave,
            getSelectedNodeId: scope.getSelectedNodeId,
            renderInspector: scope.renderInspector
        });

        controllers.textControlPointer = createController(modules.textControlPointer, 'createCanvasTextControlPointerController', {
            getRoot: scope.getRoot,
            getDocument: scope.getDocument,
            getWindow: scope.getWindow,
            getEditableTextControl: (...args) => textControlMethod('editableTextControlFromTarget')?.(...args),
            isEditableElement: scope.isEditableElement
        });

        controllers.agentInput = createController(modules.agentInput, 'createCanvasAgentInputController', {
            getAgentState: scope.getAgentState,
            setAgentInput: scope.setAgentInput,
            buildAgentDecisionFormPatch: scope.buildAgentDecisionFormPatch,
            setCanvasAgentResolutionPatch: scope.setCanvasAgentResolutionPatch,
            setResolutionOpen: scope.setResolutionOpen,
            handleCanvasAgentDecisionFieldInput: scope.handleCanvasAgentDecisionFieldInput,
            onOutpaintSliderInput: scope.onOutpaintSliderInput,
            handleCanvasAgentSettingInput: scope.handleCanvasAgentSettingInput,
            handleCanvasAgentModelModeInput: scope.handleCanvasAgentModelModeInput,
            consumeWorkbenchShortcut: scope.consumeWorkbenchShortcut,
            handleCanvasAgentAction: scope.handleCanvasAgentAction,
            canvasAgentPrimaryAction: scope.canvasAgentPrimaryAction
        });

        const compareDragMethod = name => method(controllers.compareDrag, name);
        const textControlPointerMethod = name => method(controllers.textControlPointer, name);
        const agentInputMethod = name => method(controllers.agentInput, name);

        return {
            CANVAS_TEXT_CONTROL_CONTEXT_CONTROLLER: controllers.textControlContext,
            editableTextControlFromTarget: textControlMethod('editableTextControlFromTarget'),
            onTextControlContextMenu: textControlMethod('onTextControlContextMenu'),
            dispatchTextControlInput: textControlMethod('dispatchTextControlInput'),
            CANVAS_COMPARE_DRAG_CONTROLLER: controllers.compareDrag,
            startComparePositionDrag: compareDragMethod('startComparePositionDrag'),
            updateComparePositionFromPointer: compareDragMethod('updateComparePositionFromPointer'),
            onComparePositionDragMove: compareDragMethod('onComparePositionDragMove'),
            stopComparePositionDrag: compareDragMethod('stopComparePositionDrag'),
            isComparePositionDragging: compareDragMethod('isDragging'),
            CANVAS_TEXT_CONTROL_POINTER_CONTROLLER: controllers.textControlPointer,
            onTextControlPointerDown: textControlPointerMethod('onTextControlPointerDown'),
            onTextControlPointerMove: textControlPointerMethod('onTextControlPointerMove'),
            stopTextControlPointerSelection: textControlPointerMethod('stopTextControlPointerSelection'),
            isTextControlPointerSelecting: textControlPointerMethod('isSelecting'),
            CANVAS_AGENT_INPUT_CONTROLLER: controllers.agentInput,
            onCanvasAgentInput: agentInputMethod('onInput'),
            onCanvasAgentChange: agentInputMethod('onChange'),
            onCanvasAgentKeyDown: agentInputMethod('onKeyDown')
        };
    }

    window.SimpAICanvasWorkbenchInputControlContext = Object.assign(
        {},
        window.SimpAICanvasWorkbenchInputControlContext || {},
        { createCanvasWorkbenchInputControlContext }
    );
})();
