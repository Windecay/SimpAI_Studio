(function () {
    'use strict';

    function createCanvasSettingsController(context) {
        const scope = context?.settingsSource || context || {};
        const panelSource = scope.panelSource || {};
        const renderSource = scope.renderSource || {};
        const agentSettingsSource = scope.agentSettingsSource || {};
        const templateSource = scope.templateSource || {};
        const generalSource = scope.generalSource || {};
        const siblingPanelSource = scope.siblingPanelSource || {};
        const call = (sourceObject, name, fallback, ...args) => typeof sourceObject?.[name] === 'function'
            ? sourceObject[name](...args)
            : fallback;
        const panelCall = (name, fallback, ...args) => call(panelSource, name, fallback, ...args);
        const renderCall = (name, fallback, ...args) => call(renderSource, name, fallback, ...args);
        const agentSettingsCall = (name, fallback, ...args) => call(agentSettingsSource, name, fallback, ...args);
        const templateCall = (name, fallback, ...args) => call(templateSource, name, fallback, ...args);
        const generalCall = (name, fallback, ...args) => call(generalSource, name, fallback, ...args);
        const siblingPanelCall = (name, fallback, ...args) => call(siblingPanelSource, name, fallback, ...args);

        function closeCanvasSettingsPanel() {
            const panel = panelCall('getCanvasSettingsPanel', null);
            if (panel) panel.hidden = true;
            return !!panel;
        }

        function openCanvasSettingsPanel(tab) {
            const panel = panelCall('getCanvasSettingsPanel', null);
            if (!panel) return false;
            const currentTab = panelCall('getCanvasSettingsTab', 'agent') || 'agent';
            panelCall('setCanvasSettingsTab', null, tab || currentTab || 'agent');
            panel.hidden = false;
            siblingPanelCall('closeContextMenu', null);
            siblingPanelCall('closeRunQueuePanel', null);
            siblingPanelCall('closeRunHistoryPanel', null);
            renderCall('renderCanvasSettingsPanel', null);
            if ((tab || currentTab) === 'agent' && renderCall('isCanvasAgentPresetScanIdle', false)) {
                renderCall('refreshCanvasAgentAvailablePresets', null);
            }
            return true;
        }

        function handleCanvasSettingsAction(button) {
            const tab = button?.getAttribute?.('data-canvas-settings-tab') || '';
            if (tab) {
                panelCall('setCanvasSettingsTab', null, tab);
                renderCall('renderCanvasSettingsPanel', null);
                if (tab === 'agent' && renderCall('isCanvasAgentPresetScanIdle', false)) {
                    renderCall('refreshCanvasAgentAvailablePresets', null);
                }
                return true;
            }
            const action = button?.getAttribute?.('data-canvas-settings-action') || '';
            if (action === 'close') {
                closeCanvasSettingsPanel();
            } else if (action === 'refresh-agent-presets') {
                renderCall('refreshCanvasAgentAvailablePresets', null, { force: true });
            } else if (action === 'toggle-agent-custom-api') {
                const settings = agentSettingsCall('getCanvasAgentSettings', {}) || {};
                agentSettingsCall('setCanvasAgentSettingsPatch', null, { customApiCollapsed: settings.customApiCollapsed === false }, { silentHistory: true });
            } else if (action === 'save-agent-custom-api-key') {
                agentSettingsCall('saveCanvasAgentCustomSecret', null);
            } else if (action === 'fetch-agent-custom-models') {
                agentSettingsCall('fetchCanvasAgentCustomModels', null);
            } else if (action === 'test-agent-custom-api') {
                agentSettingsCall('testCanvasAgentCustomApi', null);
            } else if (action === 'sync-agent-custom-from-vlm') {
                agentSettingsCall('syncCanvasAgentCustomFromSelectedVlm', null);
            } else if (action === 'sync-agent-custom-to-vlm') {
                agentSettingsCall('syncSelectedVlmCustomFromCanvasAgent', null);
            } else if (action.startsWith('toggle:')) {
                generalCall('toggleSetting', null, action.slice('toggle:'.length));
                renderCall('renderCanvasSettingsPanel', null);
            } else if (action === 'load-demo') {
                templateCall('openTemplateLibrary', null);
            } else if (action === 'save-current-template') {
                templateCall('saveCurrentCanvasAsTemplate', null);
            } else if (action === 'clear-browser-cache') {
                generalCall('clearBrowserCache', null);
            } else if (action === 'clear-project-file') {
                generalCall('clearProjectFileWithConfirm', null);
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
