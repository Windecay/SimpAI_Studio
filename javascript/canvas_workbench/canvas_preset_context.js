(function () {
    'use strict';

    const modules = {
        paramRenderer: window.SimpAICanvasWorkbenchPresetParamRenderer || {},
        presetCatalog: window.SimpAICanvasWorkbenchPresetCatalog || {},
        presetPalette: window.SimpAICanvasWorkbenchPresetPalette || {}
    };

    function createController(module, factoryName, context) {
        const create = module && module[factoryName];
        return typeof create === 'function' ? (create(context) || {}) : {};
    }

    function createCanvasWorkbenchPresetContext(source) {
        const scope = source?.presetSource || source || {};
        const paramRenderer = createController(
            modules.paramRenderer,
            'createCanvasPresetParamRenderer',
            scope.paramRendererSource || {}
        );
        const presetCatalog = createController(
            modules.presetCatalog,
            'createPresetCatalogService',
            scope.presetCatalogSource || {}
        );
        const presetPalette = createController(
            modules.presetPalette,
            'createPresetPaletteController',
            scope.presetPaletteSource || {}
        );

        return {
            CANVAS_PRESET_PARAM_RENDERER: paramRenderer,
            PRESET_CATALOG_SERVICE: presetCatalog,
            CANVAS_PRESET_PALETTE: presetPalette
        };
    }

    window.SimpAICanvasWorkbenchPresetContext = Object.assign(
        {},
        window.SimpAICanvasWorkbenchPresetContext || {},
        { createCanvasWorkbenchPresetContext }
    );
})();
