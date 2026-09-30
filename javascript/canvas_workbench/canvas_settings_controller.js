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
        const languageSource = scope.languageSource || {};
        const projectSource = scope.projectSource || {};
        const historySource = scope.historySource || {};
        const call = (sourceObject, name, fallback, ...args) => typeof sourceObject?.[name] === 'function'
            ? sourceObject[name](...args)
            : fallback;
        const panelCall = (name, fallback, ...args) => call(panelSource, name, fallback, ...args);
        const renderCall = (name, fallback, ...args) => call(renderSource, name, fallback, ...args);
        const agentSettingsCall = (name, fallback, ...args) => call(agentSettingsSource, name, fallback, ...args);
        const templateCall = (name, fallback, ...args) => call(templateSource, name, fallback, ...args);
        const generalCall = (name, fallback, ...args) => call(generalSource, name, fallback, ...args);
        const siblingPanelCall = (name, fallback, ...args) => call(siblingPanelSource, name, fallback, ...args);
        const t = (en, cn) => {
            const state = call(languageSource, 'getLanguageState', {}) || {};
            return call(languageSource, 't', state.__lang === 'cn' || state.__lang === 'zh' ? cn : en, en, cn, state);
        };

        function toggleSetting(key) {
            const project = call(projectSource, 'getProject', {}) || {};
            call(historySource, 'pushHistory', undefined, 'Change canvas setting');
            const nextValue = !project.settings[key];
            const patch = call(projectSource, 'buildProjectSettingsMergePatch', null, project, { [key]: nextValue });
            if (patch && patch.settings && typeof patch.settings === 'object' && !Array.isArray(patch.settings)) {
                Object.assign(project, patch);
            } else {
                Object.assign(project, {
                    settings: Object.assign({}, project.settings || {}, { [key]: nextValue })
                });
            }
            renderCall('mutate', undefined);
        }

        function openSettingsMenu(anchor) {
            const rect = anchor.getBoundingClientRect();
            const settings = call(projectSource, 'getProject', {})?.settings || {};
            siblingPanelCall('openContextMenu', undefined, rect.left, rect.bottom + 6, [
                { label: t('Open settings page', '打开设置页'), icon: 'fa-sliders', action: () => openCanvasSettingsPanel('agent') },
                { label: settings.grid ? t('Hide grid', '隐藏网格') : t('Show grid', '显示网格'), icon: 'fa-border-all', action: () => toggleSetting('grid') },
                { label: settings.snap ? t('Disable snapping', '关闭吸附') : t('Enable snapping', '开启吸附'), icon: 'fa-magnet', action: () => toggleSetting('snap') },
                { label: settings.minimap ? t('Hide minimap', '隐藏鸟瞰图') : t('Show minimap', '显示鸟瞰图'), icon: 'fa-map', action: () => toggleSetting('minimap') },
                { label: settings.edgeLabels ? t('Hide edge labels', '隐藏连线标签') : t('Show edge labels', '显示连线标签'), icon: 'fa-tag', action: () => toggleSetting('edgeLabels') },
                { label: settings.reducedMotion ? t('Restore motion', '恢复动画') : t('Reduce motion', '减少动画'), icon: 'fa-person-running', action: () => toggleSetting('reducedMotion') },
                { label: t('Template library', '模板库'), icon: 'fa-route', action: () => templateCall('openTemplateLibrary', null) },
                { label: t('Save current as template', '保存当前为模板'), icon: 'fa-floppy-disk', action: () => templateCall('saveCurrentCanvasAsTemplate', null) },
                { label: t('Clear browser cache', '清空浏览器缓存'), icon: 'fa-eraser', action: () => generalCall('clearBrowserCache', null) },
                { label: t('Clear current project file', '清空当前项目文件'), icon: 'fa-file-circle-xmark', danger: true, action: () => generalCall('clearProjectFileWithConfirm', null) }
            ]);
        }

        function renderCanvasSettingsPanel() {
            const panel = panelCall('getCanvasSettingsPanel', null);
            if (!panel || panel.hidden) return;
            const settings = agentSettingsCall('getCanvasAgentSettings', undefined);
            const scan = renderCall('getCanvasAgentPresetScanState', undefined);
            const readyCount = renderCall('getCanvasAgentReadyPresetCount', 0);
            const agentHtml = renderCall('renderCanvasAgentSettingsTab', '', settings, scan, readyCount) || '';
            panel.innerHTML = renderCall('renderCanvasSettingsPanelView', '', {
                tab: panelCall('getCanvasSettingsTab', undefined),
                agentHtml,
                projectSettings: call(projectSource, 'getProject', {})?.settings
            });
            renderCall('ensureWorkbenchFormFieldNames', undefined, panel, 'canvas_settings');
        }

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
            renderCanvasSettingsPanel();
            if ((tab || currentTab) === 'agent' && renderCall('isCanvasAgentPresetScanIdle', false)) {
                renderCall('refreshCanvasAgentAvailablePresets', null);
            }
            return true;
        }

        function handleCanvasSettingsAction(button) {
            const tab = button?.getAttribute?.('data-canvas-settings-tab') || '';
            if (tab) {
                panelCall('setCanvasSettingsTab', null, tab);
                renderCanvasSettingsPanel();
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
                toggleSetting(action.slice('toggle:'.length));
                renderCanvasSettingsPanel();
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

        return { openCanvasSettingsPanel, closeCanvasSettingsPanel, renderCanvasSettingsPanel,
            handleCanvasSettingsAction, openSettingsMenu, toggleSetting };
    }

    window.SimpAICanvasWorkbenchSettingsController = Object.assign({}, window.SimpAICanvasWorkbenchSettingsController || {}, {
        createCanvasSettingsController
    });
})();
