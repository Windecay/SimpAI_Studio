(function () {
    'use strict';

    const lifecycle = window.SimpAICanvasWorkbenchLifecycle || {};

    function createCanvasWorkbenchLifecycleContext(source) {
        const scope = source?.lifecycleSource || source || {};
        const create = lifecycle.createCanvasLifecycleController;
        const controller = typeof create === 'function' ? (create(scope) || {}) : {};
        return {
            CANVAS_LIFECYCLE_CONTROLLER: controller,
            openWorkbench: controller.openWorkbench,
            closeWorkbench: controller.closeWorkbench
        };
    }

    window.SimpAICanvasWorkbenchLifecycleContext = Object.assign(
        {},
        window.SimpAICanvasWorkbenchLifecycleContext || {},
        { createCanvasWorkbenchLifecycleContext }
    );
})();
