(function () {
    'use strict';

    const projectManager = window.SimpAICanvasWorkbenchProjectManager || {};

    function createCanvasWorkbenchProjectManagerContext(source) {
        const scope = source?.projectManagerSource || source || {};
        const create = projectManager.createProjectManagerContext;
        const context = typeof create === 'function'
            ? (create(scope) || {})
            : {};
        return {
            PROJECT_MANAGER_CONTEXT: context
        };
    }

    window.SimpAICanvasWorkbenchProjectManagerContext = Object.assign(
        {},
        window.SimpAICanvasWorkbenchProjectManagerContext || {},
        { createCanvasWorkbenchProjectManagerContext }
    );
})();
