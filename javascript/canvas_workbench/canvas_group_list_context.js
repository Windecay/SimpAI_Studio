(function () {
    'use strict';

    const groupList = window.SimpAICanvasWorkbenchGroupList || {};

    function createCanvasWorkbenchGroupListContext(source) {
        const scope = source?.groupListSource || source || {};
        const create = groupList.createGroupListContext;
        const context = typeof create === 'function'
            ? (create(scope) || {})
            : {};
        return {
            GROUP_LIST_CONTEXT: context
        };
    }

    window.SimpAICanvasWorkbenchGroupListContext = Object.assign(
        {},
        window.SimpAICanvasWorkbenchGroupListContext || {},
        { createCanvasWorkbenchGroupListContext }
    );
})();
