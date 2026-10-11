(function () {
    'use strict';

    function createCanvasNodeStateController(context) {
        const assetSource = context?.assetSource || {};
        function isNodeLocked(node) {
            return !!node?.locked;
        }

        function isNodeCollapsed(node) {
            return !!node?.collapsed;
        }

        function isImageNodeFrameless(node) {
            if (node?.type === 'result') {
                const asset = assetSource.getSelectedResultAsset?.(node);
                return String(node.display_mode || '').toLowerCase() === 'frameless'
                    && !!asset && assetSource.assetMediaKind?.(asset) === 'image';
            }
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
