(function () {
    'use strict';

    function createCanvasNoteEditController(context) {
        const scope = context?.noteEditSource || context || {};
        const nodeSource = scope.nodeSource || {};
        const domSource = scope.domSource || {};
        const geometrySource = scope.geometrySource || {};
        const patchSource = scope.patchSource || {};
        const selectionSource = scope.selectionSource || {};
        const historySource = scope.historySource || {};
        const persistenceSource = scope.persistenceSource || {};
        const renderSource = scope.renderSource || {};
        const call = (source, name, fallback, ...args) => typeof source[name] === 'function'
            ? source[name](...args) : fallback;
        const getNode = id => call(nodeSource, 'getNode', null, id);
        const isNodeLocked = node => call(nodeSource, 'isNodeLocked', false, node);
        const getNodesLayer = () => call(domSource, 'getNodesLayer', null);
        const getDocument = () => call(domSource, 'getDocument', null);
        const cssEscape = value => call(domSource, 'cssEscape', value, value);
        const normalizeCanvasColor = (...args) => call(geometrySource, 'normalizeCanvasColor', '', ...args);
        const clamp = (...args) => call(geometrySource, 'clamp', args[0], ...args);
        const noteTailState = node => call(geometrySource, 'noteTailState', {}, node);
        const defaultNoteTailTarget = node => call(geometrySource, 'defaultNoteTailTarget', {}, node);
        const buildNoteStatePatch = (...args) => call(patchSource, 'buildNoteStatePatch', {}, ...args);
        const getSelectedNodeId = () => call(selectionSource, 'getSelectedNodeId', null);
        const pushHistory = (...args) => call(historySource, 'pushHistory', undefined, ...args);
        const pushHistoryBatch = (...args) => call(historySource, 'pushHistoryBatch', undefined, ...args);
        const scheduleSave = () => call(persistenceSource, 'scheduleSave', undefined);
        const mutate = (...args) => call(renderSource, 'mutate', undefined, ...args);
        const updateNodePositionDom = (...args) => call(renderSource, 'updateNodePositionDom', undefined, ...args);
        const renderNodes = () => call(renderSource, 'renderNodes', undefined);
        const renderEdges = () => call(renderSource, 'renderEdges', undefined);
        const renderMinimap = () => call(renderSource, 'renderMinimap', undefined);
        const renderInspector = () => call(renderSource, 'renderInspector', undefined);

        function refreshNoteDom(nodeId) {
            const node = getNode(nodeId);
            const nodeEl = getNodesLayer()?.querySelector(`[data-node-id="${cssEscape(nodeId || '')}"]`);
            if (!node || !nodeEl || node.type !== 'note') return;
            const body = nodeEl.querySelector('[data-note-text]');
            if (!body) return;
            const style = Object.assign({ color: '#f8fafc', background: '#164e63', font_size: 14 }, node.style || {});
            body.style.color = normalizeCanvasColor(style.color, '#f8fafc');
            body.style.background = normalizeCanvasColor(style.background, '#164e63');
            body.style.fontSize = `${clamp(Number(style.font_size || 14), 10, 42)}px`;
            if (getDocument().activeElement !== body) body.value = node.text || '';
        }

        function updateNoteText(nodeId, value, options) {
            const node = getNode(nodeId);
            if (!node || node.type !== 'note' || isNodeLocked(node)) return;
            pushHistoryBatch(`note:${nodeId}:text`, 'Edit tip note');
            Object.assign(node, buildNoteStatePatch(node, { text: String(value || '') }));
            scheduleSave();
            if (options?.render) mutate({ inspector: true });
            else refreshNoteDom(nodeId);
        }

        function updateNoteStyle(nodeId, key, value, inputType) {
            const node = getNode(nodeId);
            if (!node || node.type !== 'note' || isNodeLocked(node) || !key) return;
            pushHistoryBatch(`note:${nodeId}:style:${key}`, 'Edit tip note style');
            const nextValue = inputType === 'number' || key === 'font_size'
                ? clamp(Number(value || 14), 10, 42)
                : normalizeCanvasColor(value, key === 'color' ? '#f8fafc' : '#164e63');
            Object.assign(node, buildNoteStatePatch(node, { stylePatch: { [key]: nextValue } }));
            refreshNoteDom(nodeId);
            scheduleSave();
        }

        function updateNoteSize(nodeId, key, value) {
            const node = getNode(nodeId);
            if (!node || node.type !== 'note' || isNodeLocked(node) || !['w', 'h'].includes(key)) return;
            pushHistoryBatch(`note:${nodeId}:size:${key}`, 'Resize tip note');
            const size = Math.round(Math.max(key === 'w' ? 180 : 120, Number(value || 0)));
            Object.assign(node, buildNoteStatePatch(node, { [key]: size }));
            updateNodePositionDom([nodeId]);
            renderEdges();
            renderMinimap();
            scheduleSave();
        }

        function updateNoteTail(nodeId, key, value, inputType, options) {
            const node = getNode(nodeId);
            if (!node || node.type !== 'note' || isNodeLocked(node) || !key) return;
            pushHistoryBatch(`note:${nodeId}:tail:${key}`, 'Edit tip note pointer');
            if (key === 'enabled') {
                const enabled = inputType === 'checkbox' ? !!value : !!value;
                const patch = { tailPatch: { enabled } };
                if (enabled) {
                    const state = noteTailState(node);
                    const fallback = defaultNoteTailTarget(node);
                    patch.tailTargetPatch = {
                        x: state.target.x ?? fallback.x,
                        y: state.target.y ?? fallback.y
                    };
                }
                Object.assign(node, buildNoteStatePatch(node, patch));
            } else if (key === 'target_x' || key === 'target_y') {
                const state = noteTailState(node);
                const fallback = defaultNoteTailTarget(node);
                const targetPatch = {
                    x: state.target.x ?? fallback.x,
                    y: state.target.y ?? fallback.y
                };
                targetPatch[key === 'target_x' ? 'x' : 'y'] = Math.round(Number(value || 0));
                Object.assign(node, buildNoteStatePatch(node, {
                    tailPatch: { enabled: true },
                    tailTargetPatch: targetPatch
                }));
            }
            scheduleSave();
            renderEdges();
            if (options?.renderNodes) renderNodes();
            if (options?.renderInspector) renderInspector();
        }

        function toggleNoteTail(node) {
            if (!node || node.type !== 'note' || isNodeLocked(node)) return;
            pushHistory('Toggle tip note pointer');
            const enabled = !noteTailState(node).enabled;
            const patch = { tailPatch: { enabled } };
            if (enabled) {
                const state = noteTailState(node);
                const fallback = defaultNoteTailTarget(node);
                patch.tailTargetPatch = {
                    x: state.target.x ?? fallback.x,
                    y: state.target.y ?? fallback.y
                };
            }
            Object.assign(node, buildNoteStatePatch(node, patch));
            scheduleSave();
            renderNodes();
            renderEdges();
            if (getSelectedNodeId() === node.id) renderInspector();
        }

        function resetNoteTail(node) {
            if (!node || node.type !== 'note' || isNodeLocked(node)) return;
            pushHistory('Reset tip note pointer');
            Object.assign(node, buildNoteStatePatch(node, {
                tailPatch: { enabled: true },
                tailTargetPatch: defaultNoteTailTarget(node)
            }));
            scheduleSave();
            renderNodes();
            renderEdges();
            if (getSelectedNodeId() === node.id) renderInspector();
        }

        return { refreshNoteDom, updateNoteText, updateNoteStyle, updateNoteSize, updateNoteTail,
            toggleNoteTail, resetNoteTail };
    }

    window.SimpAICanvasWorkbenchNoteEdit = Object.assign(
        {}, window.SimpAICanvasWorkbenchNoteEdit || {}, { createCanvasNoteEditController }
    );
})();
