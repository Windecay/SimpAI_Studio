(function () {
    'use strict';

    function createCanvasNodeStateController() {
        function isNodeLocked(node) {
            return !!node?.locked;
        }

        function isNodeCollapsed(node) {
            return !!node?.collapsed;
        }

        function isImageNodeFrameless(node) {
            if (!node || node.type !== 'image') return false;
            return String(node.display_mode || node.image_display_mode || '').toLowerCase() !== 'card';
        }

        return {
            isNodeLocked,
            isNodeCollapsed,
            isImageNodeFrameless
        };
    }

    window.SimpAICanvasWorkbenchNodeState = Object.assign(
        {},
        window.SimpAICanvasWorkbenchNodeState || {},
        { createCanvasNodeStateController }
    );
})();
