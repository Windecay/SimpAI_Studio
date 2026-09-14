(function () {
    'use strict';

    function createCanvasClickController(context) {
        const scope = context?.clickSource || context || {};
        const timingSource = scope.timingSource || {};
        const agentSource = scope.agentSource || {};
        const historySource = scope.historySource || {};
        const queueSource = scope.queueSource || {};
        const settingsSource = scope.settingsSource || {};
        const vlmSource = scope.vlmSource || {};
        const toolbarSource = scope.toolbarSource || {};
        const modeSource = scope.modeSource || {};
        const textSource = scope.textSource || {};
        const sourceCall = (sourceObject, name, fallback, ...args) => typeof sourceObject[name] === 'function'
            ? sourceObject[name](...args)
            : fallback;
        const call = (sourceObject, name, ...args) => sourceCall(sourceObject, name, undefined, ...args);
        const now = () => Number(sourceCall(timingSource, 'now', Date.now())) || 0;
        const closest = (evt, selector) => evt?.target?.closest?.(selector) || null;

        function onClick(evt) {
            if (!evt) return false;
            const suppressUntil = Number(call(agentSource, 'getCanvasAgentSuppressClickUntil') || 0);
            if (now() < suppressUntil && closest(evt, '[data-canvas-agent-panel]')) {
                evt.preventDefault?.();
                evt.stopPropagation?.();
                return true;
            }

            const agentButton = closest(evt, '[data-canvas-agent-action]');
            if (agentButton) {
                evt.preventDefault?.();
                evt.stopPropagation?.();
                call(agentSource, 'handleCanvasAgentAction', agentButton.getAttribute?.('data-canvas-agent-action') || '');
                return true;
            }

            const historyButton = closest(evt, '[data-run-history-action],[data-run-history-select]');
            if (historyButton) {
                evt.preventDefault?.();
                call(historySource, 'handleRunHistoryAction', historyButton);
                return true;
            }

            const queueButton = closest(evt, '[data-run-queue-action],[data-run-queue-node]');
            if (queueButton) {
                evt.preventDefault?.();
                call(queueSource, 'handleRunQueueAction', queueButton);
                return true;
            }

            const settingsButton = closest(evt, '[data-canvas-settings-action],[data-canvas-settings-tab]');
            if (settingsButton) {
                evt.preventDefault?.();
                call(settingsSource, 'handleCanvasSettingsAction', settingsButton);
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
                    call(vlmSource, 'updateVlmChatJumpButton', shell);
                }
                return true;
            }

            const actionButton = closest(evt, '[data-canvas-action]');
            if (actionButton) {
                evt.preventDefault?.();
                call(toolbarSource, 'handleAction', actionButton.getAttribute?.('data-canvas-action'), evt, actionButton);
                return true;
            }

            const modeButton = closest(evt, '[data-canvas-mode]');
            if (modeButton) {
                evt.preventDefault?.();
                call(modeSource, 'setMode', modeButton.getAttribute?.('data-canvas-mode') || 'select');
                return true;
            }

            const textareaField = call(textSource, 'textareaEditorFieldFromTitleClick', evt.target);
            if (textareaField) {
                evt.preventDefault?.();
                evt.stopPropagation?.();
                call(textSource, 'openTextareaEditor', textareaField);
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
