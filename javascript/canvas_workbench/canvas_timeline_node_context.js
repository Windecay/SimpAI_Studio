(function () {
    'use strict';

    const timeline = window.SimpAICanvasWorkbenchMediaTimeline || {};

    function createCanvasWorkbenchTimelineNodeContext(source) {
        const scope = source || {};
        const create = timeline.createTimelineNodeContext;
        const context = typeof create === 'function'
            ? (create(scope.timelineNodeSource || {}) || {})
            : {};
        return {
            TIMELINE_NODE_CONTEXT: context
        };
    }

    window.SimpAICanvasWorkbenchTimelineNodeContext = Object.assign(
        {},
        window.SimpAICanvasWorkbenchTimelineNodeContext || {},
        { createCanvasWorkbenchTimelineNodeContext }
    );
})();
