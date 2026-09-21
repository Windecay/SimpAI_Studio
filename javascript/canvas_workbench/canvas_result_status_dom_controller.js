(function () {
    'use strict';

    function createCanvasResultStatusDomController(context) {
        const scope = context?.resultStatusDomSource || context || {};
        const stateSource = scope.stateSource || {};
        const utilitySource = scope.utilitySource || {};
        const clamp = typeof utilitySource.clamp === 'function'
            ? utilitySource.clamp
            : (value, min, max) => Math.max(min, Math.min(max, value));
        const isNodeVisuallyRunning = (...args) => typeof stateSource.isNodeVisuallyRunning === 'function'
            ? !!stateSource.isNodeVisuallyRunning(...args)
            : false;

        function refreshResultStatusDom(node, nodeEl) {
            if (!node || node.type !== 'result' || !nodeEl) return false;
            const status = node.status || {};
            const stateEl = nodeEl.querySelector?.('.sai-result-status');
            if (stateEl) {
                stateEl.dataset.state = status.state || 'queued';
                const stateText = stateEl.querySelector?.(':scope > span');
                const percentText = stateEl.querySelector?.(':scope > b');
                if (stateText) stateText.textContent = status.state || 'queued';
                if (percentText) percentText.textContent = `${Math.round(clamp(Number(status.percent || 0), 0, 1) * 100)}%`;
            }
            const bar = nodeEl.querySelector?.('.sai-result-progress i');
            if (bar) bar.style.width = `${Math.round(clamp(Number(status.percent || 0), 0, 1) * 100)}%`;
            const foot = nodeEl.querySelector?.('.sai-node-foot');
            if (foot) foot.textContent = status.message || '';
            nodeEl.classList?.toggle('is-running', isNodeVisuallyRunning(node));
            return true;
        }

        return {
            refreshResultStatusDom
        };
    }

    window.SimpAICanvasWorkbenchResultStatusDom = Object.assign(
        {},
        window.SimpAICanvasWorkbenchResultStatusDom || {},
        { createCanvasResultStatusDomController }
    );
})();
