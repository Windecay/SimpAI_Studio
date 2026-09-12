(function () {
    'use strict';

    const assetManager = window.SimpAICanvasWorkbenchAssetManager || {};

    function createCanvasWorkbenchAssetManagerContext(source) {
        const scope = source?.assetManagerSource || source || {};
        const create = assetManager.createAssetManagerContext;
        const context = typeof create === 'function'
            ? (create(scope) || {})
            : {};
        return {
            ASSET_MANAGER_CONTEXT: context
        };
    }

    window.SimpAICanvasWorkbenchAssetManagerContext = Object.assign(
        {},
        window.SimpAICanvasWorkbenchAssetManagerContext || {},
        { createCanvasWorkbenchAssetManagerContext }
    );
})();
