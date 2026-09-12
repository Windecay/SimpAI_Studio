(function () {
    'use strict';

    const mediaViewers = window.SimpAICanvasWorkbenchMediaViewers || {};

    function createCanvasWorkbenchMediaViewerContext(source) {
        const scope = source?.mediaViewerSource || source || {};
        const create = mediaViewers.createMediaViewerContext;
        const context = typeof create === 'function'
            ? (create(scope) || {})
            : {};
        return {
            MEDIA_VIEWER_CONTEXT: context
        };
    }

    window.SimpAICanvasWorkbenchMediaViewerContext = Object.assign(
        {},
        window.SimpAICanvasWorkbenchMediaViewerContext || {},
        { createCanvasWorkbenchMediaViewerContext }
    );
})();
