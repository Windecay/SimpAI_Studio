(function () {
    'use strict';

    const compareNode = window.SimpAICanvasWorkbenchCompareNode || {};

    function createCanvasWorkbenchCompareNodeContext(source) {
        const scope = source || {};
        const create = compareNode.createCompareNodeContext;
        const context = typeof create === 'function'
            ? (create(scope.compareNodeSource || {}) || {})
            : {};
        return {
            COMPARE_NODE_CONTEXT: context
        };
    }

    window.SimpAICanvasWorkbenchCompareNodeContext = Object.assign(
        {},
        window.SimpAICanvasWorkbenchCompareNodeContext || {},
        { createCanvasWorkbenchCompareNodeContext }
    );
})();
