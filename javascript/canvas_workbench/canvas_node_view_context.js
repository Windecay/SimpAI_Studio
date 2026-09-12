(function () {
    'use strict';

    const modules = {
        textNodeRenderer: window.SimpAICanvasWorkbenchTextNodeRenderer || {},
        vlmNode: window.SimpAICanvasWorkbenchVlmNode || {},
        vlmNodeView: window.SimpAICanvasWorkbenchVlmNodeView || {}
    };

    function createController(module, factoryName, context) {
        const create = module && module[factoryName];
        return typeof create === 'function' ? (create(context) || {}) : {};
    }

    function createCanvasWorkbenchNodeViewContext(source) {
        const scope = source || {};
        const textNodeRenderer = createController(
            modules.textNodeRenderer,
            'createCanvasTextNodeRenderer',
            scope.textNodeRendererSource || {}
        );
        const vlmNode = createController(
            modules.vlmNode,
            'createCanvasVlmNodeController',
            scope.vlmNodeSource || {}
        );
        const vlmNodeView = createController(
            modules.vlmNodeView,
            'createCanvasVlmNodeView',
            scope.vlmNodeViewSource || {}
        );

        return {
            CANVAS_TEXT_NODE_RENDERER: textNodeRenderer,
            CANVAS_VLM_NODE_CONTROLLER: vlmNode,
            CANVAS_VLM_NODE_VIEW_CONTROLLER: vlmNodeView
        };
    }

    window.SimpAICanvasWorkbenchNodeViewContext = Object.assign(
        {},
        window.SimpAICanvasWorkbenchNodeViewContext || {},
        { createCanvasWorkbenchNodeViewContext }
    );
})();
