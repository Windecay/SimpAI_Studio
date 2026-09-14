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
        const textControlSource = scope.textControlSource || {};
        const compareDragSource = scope.compareDragSource || {};
        const textControlPointerSource = scope.textControlPointerSource || {};
        const agentInputSource = scope.agentInputSource || {};
        const controllers = {};

        controllers.textControlContext = createController(
            modules.textControlContext,
            'createCanvasTextControlContextController',
            textControlSource
        );
        const textControlMethod = name => method(controllers.textControlContext, name);

        controllers.compareDrag = createController(
            modules.compareDrag,
            'createCanvasCompareDragController',
            compareDragSource
        );

        controllers.textControlPointer = createController(
            modules.textControlPointer,
            'createCanvasTextControlPointerController',
            Object.assign({}, textControlPointerSource, {
                textControlSource: Object.assign({}, textControlPointerSource.textControlSource || {}, {
                    getEditableTextControl: (...args) => textControlMethod('editableTextControlFromTarget')?.(...args)
                })
            })
        );

        controllers.agentInput = createController(
            modules.agentInput,
            'createCanvasAgentInputController',
            agentInputSource
        );

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
