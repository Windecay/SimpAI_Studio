(function () {
    'use strict';

    const ACTIVE_STATES = new Set([
        'queued',
        'running',
        'waiting',
        'task_ready',
        'args_ready',
        'dry_run_ready',
        'cancelling',
        'skipping'
    ]);

    function createCanvasRunStateController(context) {
        const scope = context?.runStateSource || context || {};

        function isNodeIgnored(node) {
            return !!node?.ignored;
        }

        function nodeStatusState(node) {
            if (!node) return '';
            if (typeof node.status === 'string') return node.status;
            if (node.type === 'batch_any') return node.batch?.state || node.status?.state || '';
            return node.status?.state || '';
        }

        function isCanvasRunActiveState(state) {
            return ACTIVE_STATES.has(String(state || '').toLowerCase());
        }

        function isNodeVisuallyRunning(node) {
            return !isNodeIgnored(node) && isCanvasRunActiveState(nodeStatusState(node));
        }

        return {
            isNodeIgnored,
            nodeStatusState,
            isCanvasRunActiveState,
            isNodeVisuallyRunning
        };
    }

    window.SimpAICanvasWorkbenchRunState = Object.assign(
        {},
        window.SimpAICanvasWorkbenchRunState || {},
        { createCanvasRunStateController }
    );
})();
