(function () {
    'use strict';

    const contextMenu = window.SimpAICanvasWorkbenchContextMenu || {};

    function createCanvasWorkbenchContextMenuContext(source) {
        const scope = source?.contextMenuSource || source || {};
        const create = contextMenu.createContextMenuController;
        const controller = typeof create === 'function' ? (create(scope) || {}) : {};
        return {
            CONTEXT_MENU_CONTROLLER: controller
        };
    }

    window.SimpAICanvasWorkbenchContextMenuContext = Object.assign(
        {},
        window.SimpAICanvasWorkbenchContextMenuContext || {},
        { createCanvasWorkbenchContextMenuContext }
    );
})();
