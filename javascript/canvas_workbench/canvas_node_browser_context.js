(function () {
    'use strict';

    const nodeBrowser = window.SimpAICanvasWorkbenchNodeBrowser || {};

    function createCanvasWorkbenchNodeBrowserContext(source) {
        const scope = source?.nodeBrowserSource || source || {};
        const create = nodeBrowser.createNodeBrowserContext;
        const context = typeof create === 'function'
            ? (create(scope) || {})
            : {};
        return {
            NODE_BROWSER_CONTEXT: context
        };
    }

    window.SimpAICanvasWorkbenchNodeBrowserContext = Object.assign(
        {},
        window.SimpAICanvasWorkbenchNodeBrowserContext || {},
        { createCanvasWorkbenchNodeBrowserContext }
    );
})();
