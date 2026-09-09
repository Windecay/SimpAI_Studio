(function () {
    'use strict';

    function createCanvasClickController(context) {
        const scope = context || {};
        const call = (name, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : undefined;
        const now = () => typeof scope.now === 'function' ? Number(scope.now()) || 0 : Date.now();
        const closest = (evt, selector) => evt?.target?.closest?.(selector) || null;

        function onClick(evt) {
            if (!evt) return false;
            const suppressUntil = Number(call('getCanvasAgentSuppressClickUntil') || 0);
            if (now() < suppressUntil && closest(evt, '[data-canvas-agent-panel]')) {
                evt.preventDefault?.();
                evt.stopPropagation?.();
                return true;
            }

            const agentButton = closest(evt, '[data-canvas-agent-action]');
            if (agentButton) {
                evt.preventDefault?.();
                evt.stopPropagation?.();
                call('handleCanvasAgentAction', agentButton.getAttribute?.('data-canvas-agent-action') || '');
                return true;
            }

            const historyButton = closest(evt, '[data-run-history-action],[data-run-history-select]');
            if (historyButton) {
                evt.preventDefault?.();
                call('handleRunHistoryAction', historyButton);
                return true;
            }

            const queueButton = closest(evt, '[data-run-queue-action],[data-run-queue-node]');
            if (queueButton) {
                evt.preventDefault?.();
                call('handleRunQueueAction', queueButton);
                return true;
            }

            const settingsButton = closest(evt, '[data-canvas-settings-action],[data-canvas-settings-tab]');
            if (settingsButton) {
                evt.preventDefault?.();
                call('handleCanvasSettingsAction', settingsButton);
                return true;
            }

            const vlmJumpButton = closest(evt, '[data-vlm-chat-jump-bottom]');
            if (vlmJumpButton) {
                evt.preventDefault?.();
                evt.stopPropagation?.();
                const shell = vlmJumpButton.closest?.('.sai-vlm-chat-shell');
                const log = shell?.querySelector?.('.sai-vlm-chat-log');
                if (log) {
                    log.scrollTop = log.scrollHeight;
                    call('updateVlmChatJumpButton', shell);
                }
                return true;
            }

            const actionButton = closest(evt, '[data-canvas-action]');
            if (actionButton) {
                evt.preventDefault?.();
                call('handleAction', actionButton.getAttribute?.('data-canvas-action'), evt, actionButton);
                return true;
            }

            const modeButton = closest(evt, '[data-canvas-mode]');
            if (modeButton) {
                evt.preventDefault?.();
                call('setMode', modeButton.getAttribute?.('data-canvas-mode') || 'select');
                return true;
            }

            const textareaField = call('textareaEditorFieldFromTitleClick', evt.target);
            if (textareaField) {
                evt.preventDefault?.();
                evt.stopPropagation?.();
                call('openTextareaEditor', textareaField);
                return true;
            }
            return false;
        }

        return { onClick };
    }

    window.SimpAICanvasWorkbenchClick = Object.assign({}, window.SimpAICanvasWorkbenchClick || {}, {
        createCanvasClickController
    });
})();
