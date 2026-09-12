(function () {
    'use strict';

    const modules = {
        nodeMenus: window.SimpAICanvasWorkbenchNodeMenus || {}
    };

    function createController(module, factoryName, context) {
        const create = module && module[factoryName];
        return typeof create === 'function' ? (create(context) || {}) : {};
    }

    function createCanvasWorkbenchNodeMenuContext(source) {
        const scope = source?.nodeMenuSource || source || {};
        const nodeMenus = createController(
            modules.nodeMenus,
            'createNodeMenuTools',
            scope.nodeMenusSource || {}
        );
        return { NODE_MENU_TOOLS: nodeMenus };
    }

    window.SimpAICanvasWorkbenchNodeMenuContext = Object.assign(
        {},
        window.SimpAICanvasWorkbenchNodeMenuContext || {},
        { createCanvasWorkbenchNodeMenuContext }
    );
})();
