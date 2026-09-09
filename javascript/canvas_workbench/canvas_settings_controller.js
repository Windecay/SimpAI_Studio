(function () {
    'use strict';

    function createCanvasSettingsController(context) {
        const scope = context || {};
        const call = (name, fallback, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : fallback;

        function closeCanvasSettingsPanel() {
            const panel = call('getCanvasSettingsPanel', null);
            if (panel) panel.hidden = true;
            return !!panel;
        }

        function openCanvasSettingsPanel(tab) {
            const panel = call('getCanvasSettingsPanel', null);
            if (!panel) return false;
            const currentTab = call('getCanvasSettingsTab', 'agent') || 'agent';
            call('setCanvasSettingsTab', null, tab || currentTab || 'agent');
            panel.hidden = false;
            call('closeContextMenu', null);
            call('closeRunQueuePanel', null);
            call('closeRunHistoryPanel', null);
            call('renderCanvasSettingsPanel', null);
            if ((tab || currentTab) === 'agent' && call('isCanvasAgentPresetScanIdle', false)) {
                call('refreshCanvasAgentAvailablePresets', null);
            }
            return true;
        }

        function handleCanvasSettingsAction(button) {
            const tab = button?.getAttribute?.('data-canvas-settings-tab') || '';
            if (tab) {
                call('setCanvasSettingsTab', null, tab);
                call('renderCanvasSettingsPanel', null);
                if (tab === 'agent' && call('isCanvasAgentPresetScanIdle', false)) {
                    call('refreshCanvasAgentAvailablePresets', null);
                }
                return true;
            }
            const action = button?.getAttribute?.('data-canvas-settings-action') || '';
            if (action === 'close') {
                closeCanvasSettingsPanel();
            } else if (action === 'refresh-agent-presets') {
                call('refreshCanvasAgentAvailablePresets', null, { force: true });
            } else if (action === 'toggle-agent-custom-api') {
                const settings = call('getCanvasAgentSettings', {}) || {};
                call('setCanvasAgentSettingsPatch', null, { customApiCollapsed: settings.customApiCollapsed === false }, { silentHistory: true });
            } else if (action === 'save-agent-custom-api-key') {
                call('saveCanvasAgentCustomSecret', null);
            } else if (action === 'fetch-agent-custom-models') {
                call('fetchCanvasAgentCustomModels', null);
            } else if (action === 'test-agent-custom-api') {
                call('testCanvasAgentCustomApi', null);
            } else if (action === 'sync-agent-custom-from-vlm') {
                call('syncCanvasAgentCustomFromSelectedVlm', null);
            } else if (action === 'sync-agent-custom-to-vlm') {
                call('syncSelectedVlmCustomFromCanvasAgent', null);
            } else if (action.startsWith('toggle:')) {
                call('toggleSetting', null, action.slice('toggle:'.length));
                call('renderCanvasSettingsPanel', null);
            } else if (action === 'load-demo') {
                call('openTemplateLibrary', null);
            } else if (action === 'save-current-template') {
                call('saveCurrentCanvasAsTemplate', null);
            } else if (action === 'clear-browser-cache') {
                call('clearBrowserCache', null);
            } else if (action === 'clear-project-file') {
                call('clearProjectFileWithConfirm', null);
            } else {
                return false;
            }
            return true;
        }

        return { openCanvasSettingsPanel, closeCanvasSettingsPanel, handleCanvasSettingsAction };
    }

    window.SimpAICanvasWorkbenchSettingsController = Object.assign({}, window.SimpAICanvasWorkbenchSettingsController || {}, {
        createCanvasSettingsController
    });
})();
