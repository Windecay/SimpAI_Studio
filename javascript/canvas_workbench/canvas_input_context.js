(function () {
    'use strict';

    const modules = {
        interaction: window.SimpAICanvasWorkbenchInputInteractionContext || {},
        control: window.SimpAICanvasWorkbenchInputControlContext || {},
        preview: window.SimpAICanvasWorkbenchInputPreviewContext || {},
        event: window.SimpAICanvasWorkbenchInputEventContext || {}
    };

    function createCanvasWorkbenchInputContext(source) {
        const scope = source?.inputSource || source || {};
        const interactionSource = scope.interactionSource || {};
        const controlSource = scope.controlSource || {};
        const previewSource = scope.previewSource || {};
        const previewDanbooruAutocompleteSource = previewSource.danbooruAutocompleteSource || {};
        const eventSource = scope.eventSource || {};
        const interactionFactory = modules.interaction?.createCanvasWorkbenchInputInteractionContext;
        const interactionContext = typeof interactionFactory === 'function'
            ? interactionFactory(interactionSource)
            : {};

        const controlFactory = modules.control?.createCanvasWorkbenchInputControlContext;
        const controlContext = typeof controlFactory === 'function'
            ? controlFactory(controlSource)
            : {};
        const controlMethod = name => controlContext && typeof controlContext[name] === 'function'
            ? controlContext[name]
            : undefined;

        const previewFactory = modules.preview?.createCanvasWorkbenchInputPreviewContext;
        const previewContext = typeof previewFactory === 'function'
            ? previewFactory(Object.assign({}, previewSource, {
                danbooruAutocompleteSource: Object.assign({}, previewDanbooruAutocompleteSource, {
                    inputSource: Object.assign({}, previewDanbooruAutocompleteSource.inputSource || {}, {
                        dispatchTextControlInput: (...args) => controlMethod('dispatchTextControlInput')?.(...args)
                    })
                })
            }))
            : {};

        const eventFactory = modules.event?.createCanvasWorkbenchInputEventContext;
        const inputEventSource = {
            domSource: eventSource,
            inputSource: {
                handleDanbooruAutocompleteInput: previewContext.handleDanbooruAutocompleteInput,
                onCanvasAgentInput: controlContext.onCanvasAgentInput
            },
            previewSource: {
                onCanvasWorkbenchScroll: previewContext.onCanvasWorkbenchScroll,
                onPreviewSelectKeyDown: previewContext.onPreviewSelectKeyDown,
                onDanbooruAutocompleteKeyDown: previewContext.onDanbooruAutocompleteKeyDown,
                onPreviewSelectPointerDown: previewContext.onPreviewSelectPointerDown,
                onDanbooruAutocompletePointerDown: previewContext.onDanbooruAutocompletePointerDown,
                onTooltipPointerOver: previewContext.onTooltipPointerOver,
                onTooltipPointerMove: previewContext.onTooltipPointerMove,
                onTooltipPointerOut: previewContext.onTooltipPointerOut,
                onHoverPreviewPointerOver: previewContext.onHoverPreviewPointerOver,
                onHoverPreviewPointerMove: previewContext.onHoverPreviewPointerMove,
                onHoverPreviewPointerOut: previewContext.onHoverPreviewPointerOut,
                onTooltipFocusIn: previewContext.onTooltipFocusIn,
                onHoverPreviewFocusIn: previewContext.onHoverPreviewFocusIn,
                onDanbooruAutocompleteFocusIn: previewContext.onDanbooruAutocompleteFocusIn,
                hideCanvasTooltip: previewContext.hideCanvasTooltip,
                hideHoverPreview: previewContext.hideHoverPreview,
                onDanbooruAutocompleteFocusOut: previewContext.onDanbooruAutocompleteFocusOut
            },
            agentSource: {
                onCanvasAgentChange: controlContext.onCanvasAgentChange,
                onCanvasAgentKeyDown: controlContext.onCanvasAgentKeyDown
            },
            controlSource: {
                onTextControlContextMenu: controlContext.onTextControlContextMenu,
                onTextControlPointerDown: controlContext.onTextControlPointerDown
            },
            interactionSource: {
                onWorkbenchWheelBoundary: interactionContext.onWorkbenchWheelBoundary
            },
            documentSource: {
                onDocumentKeyDown: interactionContext.onDocumentKeyDown,
                onDocumentPaste: interactionContext.onDocumentPaste
            }
        };
        const inputEventContext = typeof eventFactory === 'function'
            ? eventFactory(inputEventSource)
            : {};

        return Object.assign({}, interactionContext, controlContext, previewContext, inputEventContext);
    }

    window.SimpAICanvasWorkbenchInputContext = Object.assign(
        {},
        window.SimpAICanvasWorkbenchInputContext || {},
        { createCanvasWorkbenchInputContext }
    );
})();
