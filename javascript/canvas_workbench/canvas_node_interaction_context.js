(function () {
    'use strict';

    const modules = {
        nodeParam: window.SimpAICanvasWorkbenchNodeParam || {},
        inspector: window.SimpAICanvasWorkbenchInspector || {}
    };

    function createController(module, factoryName, context) {
        const create = module && module[factoryName];
        return typeof create === 'function' ? (create(context) || {}) : {};
    }

    function createCanvasWorkbenchNodeInteractionContext(source) {
        const scope = source || {};
        const nodeParam = createController(
            modules.nodeParam,
            'createCanvasNodeParamController',
            scope.nodeParamSource || {}
        );
        const inspector = createController(
            modules.inspector,
            'createCanvasInspectorController',
            scope.inspectorSource || {}
        );

        return {
            CANVAS_NODE_PARAM_CONTROLLER: nodeParam,
            CANVAS_INSPECTOR_CONTROLLER: inspector
        };
    }

    window.SimpAICanvasWorkbenchNodeInteractionContext = Object.assign(
        {},
        window.SimpAICanvasWorkbenchNodeInteractionContext || {},
        { createCanvasWorkbenchNodeInteractionContext }
    );
})();
