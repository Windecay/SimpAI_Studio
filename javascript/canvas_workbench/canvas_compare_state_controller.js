(function () {
    'use strict';

    function createCanvasCompareStateController(context) {
        const scope = context?.compareStateSource || context || {};
        const nodeSource = scope.nodeSource || {};
        const stateSource = scope.stateSource || {};
        const projectSource = scope.projectSource || {};
        const utilitySource = scope.utilitySource || {};
        const domSource = scope.domSource || {};
        const runtimeSource = scope.runtimeSource || {};
        const call = (source, name, fallback, ...args) => typeof source[name] === 'function'
            ? source[name](...args) : fallback;

        function updateCompareParam(nodeId, key, value, inputType, options) {
            const node = call(nodeSource, 'getNode', null, nodeId);
            if (!node || node.type !== 'compare' || call(nodeSource, 'isNodeLocked', false, node)) return;
            call(runtimeSource, 'pushHistoryBatch', undefined, 'compare-param:' + nodeId + ':' + key, 'Edit compare node');
            let nextValue = inputType === 'number' ? Number(value) : value;
            if (key === 'position') nextValue = call(utilitySource, 'clamp', Number(value) || 0, Number(value) || 0, 0, 100);
            else if (key === 'mode') nextValue = value === 'pixel' ? 'pixel' : 'fit';
            Object.assign(node, call(nodeSource, 'buildCompareStatePatch', {}, node, {
                paramsPatch: { [key]: nextValue }
            }));
            if (options?.render === false) call(runtimeSource, 'scheduleSave', undefined);
            else call(runtimeSource, 'mutate', undefined, { inspector: true });
        }

        function handleCompareNodeEvent(node, evt, eventType) {
            if (!node || node.type !== 'compare' || !evt?.target) return false;
            const target = evt.target;
            if (eventType === 'click') {
                const mode = target.closest?.('[data-compare-mode]');
                if (!mode) return false;
                evt.preventDefault();
                evt.stopPropagation();
                updateCompareParam(node.id, 'mode', mode.getAttribute('data-compare-mode'), 'text', { render: true });
                return true;
            }
            if (eventType === 'input') {
                const position = target.closest?.('[data-compare-position]');
                if (!position) return false;
                updateCompareParam(node.id, 'position', Number(position.value), 'number', { render: false });
                refreshCompareDom(node.id);
                return true;
            }
            if (eventType === 'change') {
                const mode = target.closest?.('[data-compare-mode]');
                if (mode) {
                    updateCompareParam(node.id, 'mode', mode.getAttribute('data-compare-mode'), 'text', { render: true });
                    return true;
                }
                const position = target.closest?.('[data-compare-position]');
                if (!position) return false;
                updateCompareParam(node.id, 'position', Number(position.value), 'number', { render: true });
                return true;
            }
            return false;
        }

        function bindInspectorCompareEvents(inspector) {
            if (!inspector?.querySelectorAll) return false;
            const getSelectedNodeId = () => call(stateSource, 'getSelectedNodeId', '');
            inspector.querySelectorAll('[data-compare-position]').forEach((field) => {
                field.addEventListener('input', () => {
                    const nodeId = getSelectedNodeId();
                    updateCompareParam(nodeId, 'position', Number(field.value), 'number', { render: false });
                    refreshCompareDom(nodeId);
                });
                field.addEventListener('change', () => {
                    updateCompareParam(getSelectedNodeId(), 'position', Number(field.value), 'number', { render: true });
                });
            });
            inspector.querySelectorAll('[data-compare-mode-select]').forEach((field) => {
                field.addEventListener('change', () => {
                    updateCompareParam(getSelectedNodeId(), 'mode', field.value, 'text', { render: true });
                });
            });
            return true;
        }

        function swapCompareInputs(node) {
            if (!node || node.type !== 'compare' || call(nodeSource, 'isNodeLocked', false, node)) return;
            call(runtimeSource, 'pushHistory', undefined, 'Swap compare inputs');
            const oldA = node.inputs?.a || null;
            const oldB = node.inputs?.b || null;
            Object.assign(node, call(nodeSource, 'buildCompareStatePatch', {}, node, {
                inputsPatch: { a: oldB, b: oldA }
            }));
            const project = call(projectSource, 'getProject', {}) || {};
            (project.edges || []).forEach(edge => {
                if (edge.type !== 'compare' || edge.to !== node.id) return;
                if (edge.slot === 'a') edge.slot = 'b';
                else if (edge.slot === 'b') edge.slot = 'a';
            });
            call(runtimeSource, 'mutate', undefined);
        }

        function refreshCompareDom(nodeId) {
            const node = call(nodeSource, 'getNode', null, nodeId);
            if (!node || node.type !== 'compare') return;
            const clamp = (value, minimum, maximum) => call(utilitySource, 'clamp', value, value, minimum, maximum);
            const escapedId = call(domSource, 'escapeSelector', String(nodeId), nodeId);
            const pos = String(clamp(Number(node.params?.position ?? 50), 0, 100)) + '%';
            const stages = call(domSource, 'querySelectorAll', [], '[data-node-id="' + escapedId + '"] .sai-compare-stage, .sai-compare-fullscreen[data-compare-node-id="' + escapedId + '"] .sai-compare-stage') || [];
            stages.forEach(stageEl => stageEl.style.setProperty('--compare-pos', pos));
            const fields = call(domSource, 'querySelectorAll', [], '[data-node-id="' + escapedId + '"] [data-compare-position], .sai-compare-fullscreen[data-compare-node-id="' + escapedId + '"] [data-compare-position]') || [];
            fields.forEach(field => { field.value = String(clamp(Number(node.params?.position ?? 50), 0, 100)); });
        }

        return { updateCompareParam, handleCompareNodeEvent, bindInspectorCompareEvents, refreshCompareDom, swapCompareInputs };
    }

    window.SimpAICanvasWorkbenchCompareState = Object.assign(
        {}, window.SimpAICanvasWorkbenchCompareState || {}, { createCanvasCompareStateController }
    );
})();
