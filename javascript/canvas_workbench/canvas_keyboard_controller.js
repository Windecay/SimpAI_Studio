(function () {
    'use strict';

    function createCanvasKeyboardController(context) {
        const scope = context || {};
        const getRoot = () => typeof scope.getRoot === 'function' ? scope.getRoot() : null;
        const getProject = () => typeof scope.getProject === 'function' ? (scope.getProject() || {}) : {};
        const call = (name, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : undefined;

        function isWorkbenchGenerateShortcut(evt) {
            return !!evt && (evt.key === 'Enter' || evt.keyCode === 13) && (evt.ctrlKey || evt.metaKey || evt.altKey);
        }

        function isCanvasRunShortcut(evt) {
            return !!evt && (evt.key === 'Enter' || evt.keyCode === 13) && (evt.ctrlKey || evt.metaKey) && !evt.altKey && !evt.isComposing;
        }

        function saveFromShortcut() {
            const result = call('saveProject', false);
            if (result && typeof result.catch === 'function') {
                result.catch((err) => console.warn('[SimpAI Canvas] shortcut save failed:', err));
            }
        }

        function onDocumentKeyDown(evt) {
            const root = getRoot();
            if (!evt || !root || root.hidden) return;
            const textareaEditorState = call('getTextareaEditorState');
            if (textareaEditorState?.modal?.contains?.(evt.target)) return;
            if (isWorkbenchGenerateShortcut(evt)) {
                const agentInput = evt.target?.closest?.('[data-canvas-agent-input]');
                const editable = call('isEditableElement', evt.target);
                const canRunCanvasAction = isCanvasRunShortcut(evt);
                call('consumeWorkbenchShortcut', evt);
                if (agentInput && canRunCanvasAction) {
                    call('handleCanvasAgentAction', call('canvasAgentPrimaryAction'));
                    return;
                }
                if (canRunCanvasAction && !editable) {
                    const node = call('getNode', call('getSelectedNodeId'));
                    if (evt.shiftKey) call('runSelectedChain');
                    else if (node && (node.type === 'preset' || node.type === 'classic')) call('runPresetNodeFromUi', node);
                    return;
                }
                return;
            }
            if (call('isEditableElement', evt.target)) return;
            const key = String(evt.key || '').toLowerCase();
            if (evt.key === 'Escape') {
                if (call('isOutpaintOverlayActive')) {
                    call('hideOutpaintOverlay');
                    call('renderCanvasAgentPanel');
                } else if (call('isConnecting')) {
                    call('cancelConnection');
                } else if (call('isPresetPaletteOpen')) {
                    call('closePresetPalette');
                } else {
                    call('closeContextMenu');
                }
                return;
            }
            if (evt.key === 'Enter' && call('isOutpaintOverlayActive')) {
                evt.preventDefault();
                call('confirmOutpaintFromOverlay');
                return;
            }
            if (evt.altKey && !evt.ctrlKey && !evt.metaKey) {
                const group = (call('ensureProjectGroups') || []).find(item => String(item.shortcut || '').trim().toLowerCase() === key);
                if (group) {
                    evt.preventDefault();
                    call('focusGroup', group);
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
                if (evt.shiftKey) call('redoCanvasEdit');
                else call('undoCanvasEdit');
                return;
            }
            if ((evt.ctrlKey || evt.metaKey) && key === 'y') {
                evt.preventDefault();
                call('redoCanvasEdit');
                return;
            }
            if ((evt.ctrlKey || evt.metaKey) && key === 'k') {
                evt.preventDefault();
                call('openPresetPalette', call('viewportCenterWorld'));
                return;
            }
            if ((evt.ctrlKey || evt.metaKey) && key === 'c') {
                evt.preventDefault();
                call('copyCanvasSelection');
                return;
            }
            if ((evt.ctrlKey || evt.metaKey) && key === 'v') {
                evt.preventDefault();
                call('pasteCanvasClipboard', call('viewportCenterWorld'), { withInputConnections: !!evt.shiftKey });
                return;
            }
            if ((evt.ctrlKey || evt.metaKey) && key === 'd') {
                evt.preventDefault();
                call('duplicateSelection');
                return;
            }
            if ((evt.ctrlKey || evt.metaKey) && evt.key === '0') {
                evt.preventDefault();
                call('resetViewportZoom');
                return;
            }
            if ((evt.ctrlKey || evt.metaKey) && (evt.key === '+' || evt.key === '=')) {
                evt.preventDefault();
                call('zoomAtViewportCenter', 1.15);
                return;
            }
            if ((evt.ctrlKey || evt.metaKey) && evt.key === '-') {
                evt.preventDefault();
                call('zoomAtViewportCenter', 1 / 1.15);
                return;
            }
            if ((evt.ctrlKey || evt.metaKey) && evt.key === 'Enter') {
                const node = call('getNode', call('getSelectedNodeId'));
                if (evt.shiftKey) call('runSelectedChain');
                else if (node && (node.type === 'preset' || node.type === 'classic')) call('runPresetNodeFromUi', node);
                return;
            }
            if (!evt.ctrlKey && !evt.metaKey && !evt.altKey && evt.code === 'Space') {
                const node = call('getNode', call('getSelectedNodeId'));
                if (node?.type === 'timeline') {
                    evt.preventDefault();
                    call('toggleTimelinePreviewPlayback', node);
                    return;
                }
                if (node && ['video', 'audio'].includes(node.type)) {
                    evt.preventDefault();
                    call('playMediaSelection', node);
                    return;
                }
                if (node?.type === 'result' && call('toggleSelectedResultMediaPlayback', node)) {
                    evt.preventDefault();
                    return;
                }
            }
            if (evt.shiftKey && (evt.key === '!' || evt.code === 'Digit1')) {
                evt.preventDefault();
                call('fitAll');
                return;
            }
            if (evt.shiftKey && (evt.key === '@' || evt.code === 'Digit2')) {
                evt.preventDefault();
                call('fitSelection');
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
                call('alignSelectedNodes', alignMap[evt.key]);
                return;
            }
            if (evt.key === 'Delete' || evt.key === 'Backspace') {
                call('deleteSelection');
                return;
            }
            if (key === 'h') call('setMode', 'hand');
            if (key === 'v') call('setMode', 'select');
            if (key === 'c') call('setMode', 'connect');
            if (key === 'p') {
                evt.preventDefault();
                call('toggleSelectedNodesFlag', 'locked');
                return;
            }
            if (key === 'i') call('importSelectedTransferAt', call('viewportCenterWorld'));
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
