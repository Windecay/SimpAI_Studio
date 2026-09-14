(function () {
    'use strict';

    function createCanvasKeyboardController(context) {
        const scope = context?.keyboardSource || context || {};
        const domSource = scope.domSource || {};
        const inputSource = scope.inputSource || {};
        const shortcutSource = scope.shortcutSource || {};
        const agentSource = scope.agentSource || {};
        const projectSource = scope.projectSource || {};
        const nodeSource = scope.nodeSource || {};
        const connectionSource = scope.connectionSource || {};
        const paletteSource = scope.paletteSource || {};
        const clipboardSource = scope.clipboardSource || {};
        const viewportSource = scope.viewportSource || {};
        const runSource = scope.runSource || {};
        const selectionSource = scope.selectionSource || {};
        const transferSource = scope.transferSource || {};
        const uiSource = scope.uiSource || {};
        const sourceCall = (sourceObject, name, fallback, ...args) => typeof sourceObject[name] === 'function'
            ? sourceObject[name](...args)
            : fallback;
        const domCall = (name, fallback, ...args) => sourceCall(domSource, name, fallback, ...args);
        const inputCall = (name, fallback, ...args) => sourceCall(inputSource, name, fallback, ...args);
        const shortcutCall = (name, fallback, ...args) => sourceCall(shortcutSource, name, fallback, ...args);
        const agentCall = (name, fallback, ...args) => sourceCall(agentSource, name, fallback, ...args);
        const projectCall = (name, fallback, ...args) => sourceCall(projectSource, name, fallback, ...args);
        const nodeCall = (name, fallback, ...args) => sourceCall(nodeSource, name, fallback, ...args);
        const connectionCall = (name, fallback, ...args) => sourceCall(connectionSource, name, fallback, ...args);
        const paletteCall = (name, fallback, ...args) => sourceCall(paletteSource, name, fallback, ...args);
        const clipboardCall = (name, fallback, ...args) => sourceCall(clipboardSource, name, fallback, ...args);
        const viewportCall = (name, fallback, ...args) => sourceCall(viewportSource, name, fallback, ...args);
        const runCall = (name, fallback, ...args) => sourceCall(runSource, name, fallback, ...args);
        const selectionCall = (name, fallback, ...args) => sourceCall(selectionSource, name, fallback, ...args);
        const transferCall = (name, fallback, ...args) => sourceCall(transferSource, name, fallback, ...args);
        const uiCall = (name, fallback, ...args) => sourceCall(uiSource, name, fallback, ...args);
        const getRoot = () => domCall('getRoot', null);
        const getProject = () => projectCall('getProject', {}) || {};

        function isWorkbenchGenerateShortcut(evt) {
            return !!evt && (evt.key === 'Enter' || evt.keyCode === 13) && (evt.ctrlKey || evt.metaKey || evt.altKey);
        }

        function isCanvasRunShortcut(evt) {
            return !!evt && (evt.key === 'Enter' || evt.keyCode === 13) && (evt.ctrlKey || evt.metaKey) && !evt.altKey && !evt.isComposing;
        }

        function saveFromShortcut() {
            const result = projectCall('saveProject', false);
            if (result && typeof result.catch === 'function') {
                result.catch((err) => console.warn('[SimpAI Canvas] shortcut save failed:', err));
            }
        }

        function onDocumentKeyDown(evt) {
            const root = getRoot();
            if (!evt || !root || root.hidden) return;
            const textareaEditorState = inputCall('getTextareaEditorState', undefined);
            if (textareaEditorState?.modal?.contains?.(evt.target)) return;
            if (isWorkbenchGenerateShortcut(evt)) {
                const agentInput = evt.target?.closest?.('[data-canvas-agent-input]');
                const editable = inputCall('isEditableElement', false, evt.target);
                const canRunCanvasAction = isCanvasRunShortcut(evt);
                shortcutCall('consumeWorkbenchShortcut', undefined, evt);
                if (agentInput && canRunCanvasAction) {
                    agentCall('handleCanvasAgentAction', undefined, agentCall('canvasAgentPrimaryAction', undefined));
                    return;
                }
                if (canRunCanvasAction && !editable) {
                    const node = nodeCall('getNode', null, nodeCall('getSelectedNodeId', null));
                    if (evt.shiftKey) runCall('runSelectedChain', undefined);
                    else if (node && (node.type === 'preset' || node.type === 'classic')) runCall('runPresetNodeFromUi', undefined, node);
                    return;
                }
                return;
            }
            if (inputCall('isEditableElement', false, evt.target)) return;
            const key = String(evt.key || '').toLowerCase();
            if (evt.key === 'Escape') {
                if (agentCall('isOutpaintOverlayActive', false)) {
                    agentCall('hideOutpaintOverlay', undefined);
                    agentCall('renderCanvasAgentPanel', undefined);
                } else if (connectionCall('isConnecting', false)) {
                    connectionCall('cancelConnection', undefined);
                } else if (paletteCall('isPresetPaletteOpen', false)) {
                    paletteCall('closePresetPalette', undefined);
                } else {
                    uiCall('closeContextMenu', undefined);
                }
                return;
            }
            if (evt.key === 'Enter' && agentCall('isOutpaintOverlayActive', false)) {
                evt.preventDefault();
                agentCall('confirmOutpaintFromOverlay', undefined);
                return;
            }
            if (evt.altKey && !evt.ctrlKey && !evt.metaKey) {
                const group = (projectCall('ensureProjectGroups', []) || []).find(item => String(item.shortcut || '').trim().toLowerCase() === key);
                if (group) {
                    evt.preventDefault();
                    projectCall('focusGroup', undefined, group);
                    return;
                }
            }
            if ((evt.ctrlKey || evt.metaKey) && key === 's') {
                evt.preventDefault();
                saveFromShortcut();
                return;
            }
            if ((evt.ctrlKey || evt.metaKey) && key === 'z') {
                evt.preventDefault();
                if (evt.shiftKey) projectCall('redoCanvasEdit', undefined);
                else projectCall('undoCanvasEdit', undefined);
                return;
            }
            if ((evt.ctrlKey || evt.metaKey) && key === 'y') {
                evt.preventDefault();
                projectCall('redoCanvasEdit', undefined);
                return;
            }
            if ((evt.ctrlKey || evt.metaKey) && key === 'k') {
                evt.preventDefault();
                paletteCall('openPresetPalette', undefined, viewportCall('viewportCenterWorld', { x: 0, y: 0 }));
                return;
            }
            if ((evt.ctrlKey || evt.metaKey) && key === 'c') {
                evt.preventDefault();
                clipboardCall('copyCanvasSelection', undefined);
                return;
            }
            if ((evt.ctrlKey || evt.metaKey) && key === 'v') {
                evt.preventDefault();
                clipboardCall('pasteCanvasClipboard', undefined, viewportCall('viewportCenterWorld', { x: 0, y: 0 }), { withInputConnections: !!evt.shiftKey });
                return;
            }
            if ((evt.ctrlKey || evt.metaKey) && key === 'd') {
                evt.preventDefault();
                clipboardCall('duplicateSelection', undefined);
                return;
            }
            if ((evt.ctrlKey || evt.metaKey) && evt.key === '0') {
                evt.preventDefault();
                viewportCall('resetViewportZoom', undefined);
                return;
            }
            if ((evt.ctrlKey || evt.metaKey) && (evt.key === '+' || evt.key === '=')) {
                evt.preventDefault();
                viewportCall('zoomAtViewportCenter', undefined, 1.15);
                return;
            }
            if ((evt.ctrlKey || evt.metaKey) && evt.key === '-') {
                evt.preventDefault();
                viewportCall('zoomAtViewportCenter', undefined, 1 / 1.15);
                return;
            }
            if ((evt.ctrlKey || evt.metaKey) && evt.key === 'Enter') {
                const node = nodeCall('getNode', null, nodeCall('getSelectedNodeId', null));
                if (evt.shiftKey) runCall('runSelectedChain', undefined);
                else if (node && (node.type === 'preset' || node.type === 'classic')) runCall('runPresetNodeFromUi', undefined, node);
                return;
            }
            if (!evt.ctrlKey && !evt.metaKey && !evt.altKey && evt.code === 'Space') {
                const node = nodeCall('getNode', null, nodeCall('getSelectedNodeId', null));
                if (node?.type === 'timeline') {
                    evt.preventDefault();
                    runCall('toggleTimelinePreviewPlayback', undefined, node);
                    return;
                }
                if (node && ['video', 'audio'].includes(node.type)) {
                    evt.preventDefault();
                    runCall('playMediaSelection', undefined, node);
                    return;
                }
                if (node?.type === 'result' && runCall('toggleSelectedResultMediaPlayback', false, node)) {
                    evt.preventDefault();
                    return;
                }
            }
            if (evt.shiftKey && (evt.key === '!' || evt.code === 'Digit1')) {
                evt.preventDefault();
                viewportCall('fitAll', undefined);
                return;
            }
            if (evt.shiftKey && (evt.key === '@' || evt.code === 'Digit2')) {
                evt.preventDefault();
                viewportCall('fitSelection', undefined);
                return;
            }
            if (evt.shiftKey && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(evt.key)) {
                evt.preventDefault();
                const alignMap = {
                    ArrowLeft: 'left',
                    ArrowRight: 'right',
                    ArrowUp: 'top',
                    ArrowDown: 'bottom'
                };
                viewportCall('alignSelectedNodes', undefined, alignMap[evt.key]);
                return;
            }
            if (evt.key === 'Delete' || evt.key === 'Backspace') {
                selectionCall('deleteSelection', undefined);
                return;
            }
            if (key === 'h') viewportCall('setMode', undefined, 'hand');
            if (key === 'v') viewportCall('setMode', undefined, 'select');
            if (key === 'c') viewportCall('setMode', undefined, 'connect');
            if (key === 'p') {
                evt.preventDefault();
                selectionCall('toggleSelectedNodesFlag', undefined, 'locked');
                return;
            }
            if (key === 'i') transferCall('importSelectedTransferAt', undefined, viewportCall('viewportCenterWorld', { x: 0, y: 0 }));
        }

        return {
            isCanvasRunShortcut,
            isWorkbenchGenerateShortcut,
            onDocumentKeyDown
        };
    }

    window.SimpAICanvasWorkbenchKeyboard = Object.assign({}, window.SimpAICanvasWorkbenchKeyboard || {}, {
        createCanvasKeyboardController
    });
})();
