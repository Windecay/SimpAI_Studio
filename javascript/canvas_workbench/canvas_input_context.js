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
        const interactionFactory = modules.interaction?.createCanvasWorkbenchInputInteractionContext;
        const interactionContext = typeof interactionFactory === 'function'
            ? interactionFactory(scope)
            : {};

        const controlFactory = modules.control?.createCanvasWorkbenchInputControlContext;
        const controlContext = typeof controlFactory === 'function'
            ? controlFactory(scope)
            : {};
        const controlMethod = name => controlContext && typeof controlContext[name] === 'function'
            ? controlContext[name]
            : undefined;

        const previewFactory = modules.preview?.createCanvasWorkbenchInputPreviewContext;
        const previewContext = typeof previewFactory === 'function'
            ? previewFactory(Object.assign({}, scope, {
                dispatchTextControlInput: (...args) => controlMethod('dispatchTextControlInput')?.(...args)
            }))
            : {};

        const eventFactory = modules.event?.createCanvasWorkbenchInputEventContext;
        const inputEventContext = typeof eventFactory === 'function'
            ? eventFactory(Object.assign({}, scope, interactionContext, controlContext, previewContext))
            : {};

        return Object.assign({}, interactionContext, controlContext, previewContext, inputEventContext);
    }

    window.SimpAICanvasWorkbenchInputContext = Object.assign(
        {},
        window.SimpAICanvasWorkbenchInputContext || {},
        { createCanvasWorkbenchInputContext }
    );
})();
