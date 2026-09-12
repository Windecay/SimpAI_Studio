(function () {
    'use strict';

    const maskEditor = window.SimpAICanvasWorkbenchMaskEditor || {};

    function createCanvasWorkbenchMaskEditorContext(source) {
        const scope = source?.maskEditorSource || source || {};
        const create = maskEditor.createMaskEditorContext;
        const context = typeof create === 'function'
            ? (create(scope) || {})
            : {};
        return {
            MASK_EDITOR_CONTEXT: context
        };
    }

    window.SimpAICanvasWorkbenchMaskEditorContext = Object.assign(
        {},
        window.SimpAICanvasWorkbenchMaskEditorContext || {},
        { createCanvasWorkbenchMaskEditorContext }
    );
})();
