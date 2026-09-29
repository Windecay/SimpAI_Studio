(function () {
    'use strict';

    function createCanvasResultStatusDomController(context) {
        const scope = context?.resultStatusDomSource || context || {};
        const projectSource = scope.projectSource || {};
        const domSource = scope.domSource || {};
        const stateSource = scope.stateSource || {};
        const renderSource = scope.renderSource || {};
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

        function pollUpdate() {
            const root = domSource.getRoot?.();
            if (!root || root.hidden) return;
            const project = projectSource.getProject();
            const nodesLayer = domSource.getNodesLayer?.();
            project.nodes.forEach((node) => {
                if (node.type !== 'result') return;
                const nodeEl = nodesLayer?.querySelector(`[data-node-id="${utilitySource.escapeNodeId(node.id)}"]`);
                if (!nodeEl) return;
                refreshResultStatusDom(node, nodeEl);
                renderSource.refreshResultNodePreviewDom?.(node, nodeEl);
            });
            renderSource.refreshActiveResultInspector?.();
            renderSource.renderStatus?.();
            renderSource.renderRunQueuePanelIfOpen?.();
        }

        return {
            refreshResultStatusDom,
            pollUpdate
        };
    }

    window.SimpAICanvasWorkbenchResultStatusDom = Object.assign(
        {},
        window.SimpAICanvasWorkbenchResultStatusDom || {},
        { createCanvasResultStatusDomController }
    );
})();
