(function () {
    'use strict';

    function createCanvasAgentSettingsController(context) {
        const scope = context?.agentSettingsSource || context || {};
        const languageSource = scope.languageSource || {};
        const configSource = scope.configSource || {};
        const utilitySource = scope.utilitySource || {};
        const modelSource = scope.modelSource || {};
        const customApiSource = scope.customApiSource || {};
        const projectSource = scope.projectSource || {};
        const stateSource = scope.stateSource || {};
        const nodeSource = scope.nodeSource || {};
        const patchSource = scope.patchSource || {};
        const historySource = scope.historySource || {};
        const persistenceSource = scope.persistenceSource || {};
        const requestSource = scope.requestSource || {};
        const uiSource = scope.uiSource || {};
        const documentSource = scope.documentSource || {};
        const toolSource = scope.toolSource || {};
        const call = (sourceObject, name, fallback, ...args) => typeof sourceObject[name] === 'function'
            ? sourceObject[name](...args)
            : fallback;
        const languageCall = (name, fallback, ...args) => call(languageSource, name, fallback, ...args);
        const configCall = (name, fallback, ...args) => call(configSource, name, fallback, ...args);
        const customApiCall = (name, fallback, ...args) => call(customApiSource, name, fallback, ...args);
        const projectCall = (name, fallback, ...args) => call(projectSource, name, fallback, ...args);
        const stateCall = (name, fallback, ...args) => call(stateSource, name, fallback, ...args);
        const nodeCall = (name, fallback, ...args) => call(nodeSource, name, fallback, ...args);
        const patchCall = (name, fallback, ...args) => call(patchSource, name, fallback, ...args);
        const historyCall = (name, fallback, ...args) => call(historySource, name, fallback, ...args);
        const persistenceCall = (name, fallback, ...args) => call(persistenceSource, name, fallback, ...args);
        const requestCall = (name, fallback, ...args) => call(requestSource, name, fallback, ...args);
        const uiCall = (name, fallback, ...args) => call(uiSource, name, fallback, ...args);
        const documentCall = (name, fallback, ...args) => call(documentSource, name, fallback, ...args);
        const toolCall = (name, fallback, ...args) => call(toolSource, name, fallback, ...args);
        const getDefaultSettings = () => configCall('getCanvasAgentDefaultSettings', {}) || {};
        const getDefaultProjectSettings = () => configCall('getDefaultSettings', {}) || {};
        const t = languageSource.t || ((en, cn) => cn || en);
        const clamp = utilitySource.clamp || ((value, min, max) => Math.max(min, Math.min(max, value)));
        const normalizePresetName = utilitySource.normalizePresetName || ((value) => String(value || '').trim());
        const getVlmCustomProvider = (...args) => customApiCall('getVlmCustomProvider', {}, ...args);
        const getVlmCustomApiProfile = (...args) => customApiCall('getVlmCustomApiProfile', null, ...args);
        const getVlmCustomProfileKey = (...args) => customApiCall('getVlmCustomProfileKey', 'openai', ...args);
        const readVlmCustomApiProfiles = (...args) => customApiCall('readVlmCustomApiProfiles', {}, ...args) || {};
        const writeVlmCustomApiProfiles = (...args) => customApiCall('writeVlmCustomApiProfiles', undefined, ...args);
        const readCanvasAgentCustomKeyValue = (...args) => customApiCall('getCanvasAgentCustomKeyValue', '', ...args);
        const sendCanvasVlmRunRequest = (...args) => requestCall('sendCanvasVlmRunRequest', { ok: false, error: 'VLM run API is unavailable' }, ...args);
        const sendCanvasAgentCustomModelsRequest = (...args) => requestCall('sendCanvasAgentCustomModelsRequest', { ok: false, error: 'Custom model API is unavailable' }, ...args);
        const buildVlmParamsPatch = (...args) => patchCall('buildVlmParamsPatch', {}, ...args);
        const buildVlmModelStatusPatch = (...args) => patchCall('buildVlmModelStatusPatch', {}, ...args);
        const decodeCanvasAgentVideoToolChoice = (...args) => toolCall('decodeCanvasAgentVideoToolChoice', {}, ...args) || {};
        const vlmModelDisplayLabel = (...args) => call(modelSource, 'vlmModelDisplayLabel', String(args[0] || ''), ...args);

        const getVersionChoices = () => {
            const value = configCall('getVersionChoices', []);
            return Array.isArray(value) ? value : [];
        };

        function canvasAgentDefaultLocalRewriteModel() {
            const defaults = getDefaultSettings();
            return getVersionChoices().find(model => model && model !== 'Custom')
                || (defaults.rewriteModel !== 'Custom' ? defaults.rewriteModel : '')
                || 'Qwen3.5-9B-abliterated-Q4_K_M';
        }

        function canvasAgentLocalRewriteModels(currentModel) {
            const seen = new Set();
            const list = [];
            [...getVersionChoices(), currentModel].forEach((model) => {
                const value = String(model || '').trim();
                if (!value || value === 'Custom' || seen.has(value)) return;
                seen.add(value);
                list.push(value);
            });
            if (!list.length) list.push(canvasAgentDefaultLocalRewriteModel());
            return list;
        }

        function canvasAgentModelSummary(settings) {
            const current = settings && typeof settings === 'object' ? settings : {};
            if (current.rewriteModel === 'Custom') {
                const provider = getVlmCustomProvider(current.customProvider || 'openai');
                const apiName = current.customApiName || provider.label || 'Custom API';
                const model = current.customModel || t('Select model', '选择模型');
                return {
                    icon: 'fa-cloud',
                    label: model,
                    title: `${apiName} · ${model}`
                };
            }
            const model = current.rewriteModel || canvasAgentDefaultLocalRewriteModel();
            const modelLabel = vlmModelDisplayLabel(model, model);
            return {
                icon: 'fa-microchip',
                label: modelLabel,
                title: `${t('Local VLM', '本地 VLM')} · ${modelLabel}`
            };
        }

        function getProject() {
            return projectCall('getProject', null) || {};
        }

        function getAgentState() {
            return stateCall('getAgentState', null) || {};
        }

        const aspectOptions = () => Array.isArray(configSource.canvasAgentAspectOptions) ? configSource.canvasAgentAspectOptions : [];
        let canvasAgentCustomModelChoices = [];

        function getCanvasAgentResolutionState() {
            const state = getAgentState();
            const raw = state.resolution && typeof state.resolution === 'object' ? state.resolution : {};
            const options = aspectOptions();
            const aspect = options.some(item => item.key === raw.aspect) ? raw.aspect : 'auto';
            const multiplier = clamp(Number(raw.multiplier || 1) || 1, 1, 2);
            state.resolution = { aspect, multiplier };
            return state.resolution;
        }

        function canvasAgentResolutionLabel(state) {
            const current = state && typeof state === 'object' ? state : getCanvasAgentResolutionState();
            const options = aspectOptions();
            const aspect = options.find(item => item.key === current.aspect) || options[0] || { label: '' };
            return `${aspect.label} · ${Number(current.multiplier || 1).toFixed(1)}x`;
        }

        function canvasAgentResolutionCompactLabel(state) {
            const current = state && typeof state === 'object' ? state : getCanvasAgentResolutionState();
            const options = aspectOptions();
            const aspect = options.find(item => item.key === current.aspect) || options[0] || { label: '' };
            return `${aspect.label} | ${Number(current.multiplier || 1).toFixed(1)}x`;
        }

        function setCanvasAgentResolutionOpen(value) {
            const state = getAgentState();
            state.resolutionOpen = !!value;
            if (state.resolutionOpen) state.modelPickerOpen = false;
        }

        function syncCanvasAgentResolutionDom() {
            const panel = uiCall('getCanvasAgentPanel', null);
            if (!panel || !panel.isConnected) return;
            const state = getCanvasAgentResolutionState();
            const scale = Number(state.multiplier || 1).toFixed(1);
            panel.querySelectorAll('[data-canvas-agent-scale-label]').forEach(label => {
                label.textContent = `${scale}x`;
            });
            panel.querySelectorAll('[data-canvas-agent-resolution-summary]').forEach(label => {
                label.textContent = canvasAgentResolutionLabel(state);
            });
            panel.querySelectorAll('[data-canvas-agent-resolution-label]').forEach(label => {
                label.textContent = canvasAgentResolutionCompactLabel(state);
            });
            const documentObject = documentCall('getDocument', null) || globalThis.document;
            panel.querySelectorAll('[data-canvas-agent-scale]').forEach(input => {
                if (input === documentObject?.activeElement) return;
                input.value = scale;
            });
        }

        function setCanvasAgentResolutionPatch(patch, options) {
            const state = getAgentState();
            const current = getCanvasAgentResolutionState();
            const next = Object.assign({}, current, patch || {});
            if (!aspectOptions().some(item => item.key === next.aspect)) next.aspect = 'auto';
            next.multiplier = clamp(Number(next.multiplier || 1) || 1, 1, 2);
            state.resolution = next;
            if (options?.render === false) syncCanvasAgentResolutionDom();
            else uiCall('renderCanvasAgentPanel', null);
        }

        function applyProjectSettingsMergePatch(project, updates) {
            const defaultSettings = getDefaultProjectSettings();
            const currentSettings = project?.settings
                && typeof project.settings === 'object'
                && !Array.isArray(project.settings)
                ? project.settings
                : (defaultSettings && typeof defaultSettings === 'object' && !Array.isArray(defaultSettings)
                    ? defaultSettings
                    : {});
            const patch = projectCall('buildProjectSettingsMergePatch', null, { settings: currentSettings }, updates);
            if (patch && typeof patch === 'object'
                && patch.settings
                && typeof patch.settings === 'object'
                && !Array.isArray(patch.settings)) {
                Object.assign(project, patch);
                return;
            }
            Object.assign(project, { settings: Object.assign({}, currentSettings, updates || {}) });
        }

        function getCanvasAgentSettings() {
            const project = getProject();
            const defaults = getDefaultSettings();
            const stored = project?.settings?.canvasAgent && typeof project.settings.canvasAgent === 'object'
                ? project.settings.canvasAgent
                : {};
            const next = Object.assign({}, defaults, stored);
            const normalizePoint = (point) => {
                if (!point || typeof point !== 'object') return null;
                const x = Number(point.x);
                const y = Number(point.y);
                if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
                return { x, y };
            };
            if (!['programmatic', 'vlm_plan'].includes(next.executionRoute)) next.executionRoute = defaults.executionRoute;
            if (!['ask', 'direct', 'rewrite'].includes(next.promptStrategy)) next.promptStrategy = defaults.promptStrategy;
            if (!['auto', 'preferred'].includes(next.t2iPresetMode)) next.t2iPresetMode = defaults.t2iPresetMode;
            if (!['auto', 'preferred'].includes(next.editPresetMode)) next.editPresetMode = defaults.editPresetMode;
            if (!['auto', 'preferred'].includes(next.i2vPresetMode)) next.i2vPresetMode = defaults.i2vPresetMode;
            if (!['auto', 'preferred'].includes(next.t2vPresetMode)) next.t2vPresetMode = defaults.t2vPresetMode;
            if (!['auto', 'preferred'].includes(next.videoEditPresetMode)) next.videoEditPresetMode = defaults.videoEditPresetMode;
            if (!['auto', 'preferred'].includes(next.audioPresetMode)) next.audioPresetMode = defaults.audioPresetMode;
            if (!['uov_auto', 'dedicated_preset'].includes(next.upscalePresetMode)) next.upscalePresetMode = defaults.upscalePresetMode;
            next.enabled = next.enabled !== false;
            next.attachPaused = next.attachPaused === true;
            next.minimized = next.minimized === true;
            next.panelPosition = normalizePoint(next.panelPosition);
            next.bubblePosition = normalizePoint(next.bubblePosition);
            next.allowPresetInstructionOverride = next.allowPresetInstructionOverride !== false;
            next.rewriteModel = String(next.rewriteModel || defaults.rewriteModel || '').trim();
            next.videoFrames = clamp(Number(next.videoFrames || defaults.videoFrames), 1, 32);
            next.t2iPreset = normalizePresetName(next.t2iPreset || '');
            next.editPreset = normalizePresetName(next.editPreset || '');
            next.i2vPreset = normalizePresetName(next.i2vPreset || '');
            next.t2vPreset = normalizePresetName(next.t2vPreset || '');
            next.videoEditPreset = normalizePresetName(next.videoEditPreset || '');
            next.audioPreset = normalizePresetName(next.audioPreset || '');
            next.outpaintPreset = normalizePresetName(next.outpaintPreset || defaults.outpaintPreset);
            next.erasePreset = normalizePresetName(next.erasePreset || defaults.erasePreset);
            next.replacePreset = normalizePresetName(next.replacePreset || defaults.replacePreset);
            next.upscalePreset = normalizePresetName(next.upscalePreset || '');
            next.videoOutpaintPreset = normalizePresetName(next.videoOutpaintPreset || defaults.videoOutpaintPreset);
            next.videoErasePreset = normalizePresetName(next.videoErasePreset || defaults.videoErasePreset);
            next.videoReplacePreset = normalizePresetName(next.videoReplacePreset || defaults.videoReplacePreset);
            next.videoFaceSwapPreset = normalizePresetName(next.videoFaceSwapPreset || defaults.videoFaceSwapPreset);
            next.videoFaceSwapTheme = String(next.videoFaceSwapTheme || defaults.videoFaceSwapTheme || '').trim();
            next.videoMotionTransferPreset = normalizePresetName(next.videoMotionTransferPreset || defaults.videoMotionTransferPreset);
            next.videoMotionTransferTheme = String(next.videoMotionTransferTheme || defaults.videoMotionTransferTheme || '').trim();
            const oldVideoEditQuickToolDefault = normalizePresetName('Wan-Animate');
            const skipVideoEditDefaultMigration = !!project?.settings?.__template_source;
            if (!skipVideoEditDefaultMigration && next.videoEditQuickToolDefaultMigrated !== true && next.videoReplacePreset === oldVideoEditQuickToolDefault) {
                next.videoReplacePreset = normalizePresetName(defaults.videoReplacePreset);
                next.videoEditQuickToolDefaultMigrated = true;
            } else {
                next.videoEditQuickToolDefaultMigrated = next.videoEditQuickToolDefaultMigrated === true || next.videoReplacePreset !== oldVideoEditQuickToolDefault;
            }
            next.videoUpscalePreset = normalizePresetName(next.videoUpscalePreset || defaults.videoUpscalePreset);
            next.outpaintUpPercent = clamp(Number(next.outpaintUpPercent ?? defaults.outpaintUpPercent), 0, 100);
            next.outpaintDownPercent = clamp(Number(next.outpaintDownPercent ?? defaults.outpaintDownPercent), 0, 100);
            next.outpaintLeftPercent = clamp(Number(next.outpaintLeftPercent ?? defaults.outpaintLeftPercent), 0, 100);
            next.outpaintRightPercent = clamp(Number(next.outpaintRightPercent ?? defaults.outpaintRightPercent), 0, 100);
            next.customApiCollapsed = next.customApiCollapsed !== false;
            next.customProvider = String(next.customProvider || defaults.customProvider).trim() || defaults.customProvider;
            next.customApiName = String(next.customApiName || defaults.customApiName).trim() || defaults.customApiName;
            next.customApiFormat = String(next.customApiFormat || 'openai_compatible').trim() || 'openai_compatible';
            next.customBaseUrl = String(next.customBaseUrl || '').trim();
            next.customModel = String(next.customModel || '').trim();
            next.customSupportsImages = next.customSupportsImages !== false;
            return next;
        }

        function setCanvasAgentSettingsPatch(patch, options) {
            if (!patch || typeof patch !== 'object') return;
            const project = getProject();
            if (!options?.silentHistory) historyCall('pushHistoryBatch', null, 'canvas-agent-settings', 'Canvas Agent settings');
            const agentState = getAgentState();
            if (patch.enabled === false && agentState.pendingDecision?.resolve) {
                agentState.pendingDecision.resolve('cancel');
                agentState.pendingDecision = null;
                agentState.currentRun = null;
                agentState.busy = false;
            }
            applyProjectSettingsMergePatch(project, {
                canvasAgent: Object.assign({}, getCanvasAgentSettings(), patch)
            });
            persistenceCall('scheduleSave', null);
            uiCall('renderCanvasAgentPanel', null);
            uiCall('renderCanvasSettingsPanel', null);
            uiCall('renderStatus', null);
        }

        function setCanvasAgentLayoutPatch(patch, options) {
            if (!patch || typeof patch !== 'object') return;
            const project = getProject();
            applyProjectSettingsMergePatch(project, {
                canvasAgent: Object.assign({}, getCanvasAgentSettings(), patch)
            });
            persistenceCall('scheduleSave', null);
            if (options?.render !== false) uiCall('renderCanvasAgentPanel', null);
        }

        function revealCanvasAgentPanelForToolCard() {
            const settings = getCanvasAgentSettings();
            const patch = {};
            if (settings.minimized) patch.minimized = false;
            if (settings.minimized && settings.bubblePosition && !settings.panelPosition) {
                patch.panelPosition = settings.bubblePosition;
            }
            if (Object.keys(patch).length) setCanvasAgentLayoutPatch(patch, { render: false });
            const agentState = getAgentState();
            agentState.pickReference = false;
            agentState.expanded = false;
        }

        function dockCanvasAgentPanelBottomLeft(options) {
            const opts = options || {};
            const agentState = getAgentState();
            agentState.attachPaused = opts.pauseAttach === false ? false : true;
            const patch = { panelPosition: null };
            if (opts.pauseAttach !== false) patch.attachPaused = true;
            setCanvasAgentLayoutPatch(patch, { render: false });
            if (opts.render !== false) uiCall('renderCanvasAgentPanel', null);
        }

        function getCanvasAgentRewriteModel() {
            const defaults = getDefaultSettings();
            return getCanvasAgentSettings().rewriteModel || defaults.rewriteModel || getVersionChoices()[0] || 'Qwen3.5-9B-abliterated-Q4_K_M';
        }

        function canvasAgentCustomParamsFromSettings(settings, includeKey) {
            const src = settings || getCanvasAgentSettings();
            const provider = getVlmCustomProvider(src.customProvider || 'openai') || {};
            const params = {
                version: 'Custom',
                custom_provider: src.customProvider || provider.key || 'openai',
                custom_api_name: src.customApiName || provider.label || 'OpenAI',
                custom_api_format: src.customApiFormat || provider.format || 'openai_compatible',
                custom_base_url: src.customBaseUrl || provider.baseUrl || '',
                custom_model: src.customModel || '',
                custom_supports_images: src.customSupportsImages !== false
            };
            if (includeKey) {
                const profile = getVlmCustomApiProfile(params);
                const visibleKey = String(getCanvasAgentCustomKeyValue() || '');
                params.custom_api_key = String(visibleKey || profile?.api_key || '').trim();
            }
            return params;
        }

        function getCanvasAgentCustomRuntimeParams() {
            return canvasAgentCustomParamsFromSettings(getCanvasAgentSettings(), true);
        }

        function getCanvasAgentCustomKeyInput() {
            const panel = uiCall('getCanvasSettingsPanel', null);
            return panel?.querySelector?.('[data-canvas-agent-custom-key]') || null;
        }

        function getCanvasAgentCustomKeyValue() {
            const input = getCanvasAgentCustomKeyInput();
            return input ? String(input.value || '') : String(readCanvasAgentCustomKeyValue() || '');
        }

        function getCanvasAgentCustomModelChoices() {
            return canvasAgentCustomModelChoices.slice();
        }

        function saveCanvasAgentCustomSecret() {
            const params = canvasAgentCustomParamsFromSettings(getCanvasAgentSettings(), false);
            const apiKey = getCanvasAgentCustomKeyValue().trim();
            if (!apiKey) {
                uiCall('showToast', null, t('Paste an API key first.', '请先粘贴 API Key'));
                return;
            }
            const profiles = readVlmCustomApiProfiles();
            const key = getVlmCustomProfileKey(params);
            profiles[key] = Object.assign({}, profiles[key] || {}, {
                api_key: apiKey,
                api_name: params.custom_api_name || key,
                provider: params.custom_provider || 'openai',
                base_url: params.custom_base_url || '',
                updated_at: persistenceCall('nowIso', new Date().toISOString())
            });
            writeVlmCustomApiProfiles(profiles);
            uiCall('showToast', null, t('API key saved for Agent and VLM nodes.', 'API Key 已保存，可供 Agent 和 VLM 节点共用'));
        }

        function syncCanvasAgentCustomFromSelectedVlm() {
            const selectedNodeId = nodeCall('getSelectedNodeId', null);
            const node = nodeCall('getNode', null, selectedNodeId);
            if (!node || node.type !== 'vlm') {
                uiCall('showToast', null, t('Select a VLM node first.', '请先选中一个 VLM 节点'));
                return;
            }
            const params = node.params || {};
            setCanvasAgentSettingsPatch({
                rewriteModel: 'Custom',
                customProvider: params.custom_provider || 'openai',
                customApiName: params.custom_api_name || 'Custom',
                customApiFormat: params.custom_api_format || 'openai_compatible',
                customBaseUrl: params.custom_base_url || '',
                customModel: params.custom_model || '',
                customSupportsImages: params.custom_supports_images !== false,
                customApiCollapsed: false
            }, { silentHistory: true });
            uiCall('showToast', null, t('Agent Custom API settings synced from selected VLM node.', '已从选中的 VLM 节点同步 Agent Custom API 设置'));
        }

        function syncSelectedVlmCustomFromCanvasAgent() {
            const selectedNodeId = nodeCall('getSelectedNodeId', null);
            const node = nodeCall('getNode', null, selectedNodeId);
            if (!node || node.type !== 'vlm') {
                uiCall('showToast', null, t('Select a VLM node first.', '请先选中一个 VLM 节点'));
                return;
            }
            const params = canvasAgentCustomParamsFromSettings(getCanvasAgentSettings(), false);
            historyCall('pushHistory', null, 'Sync Custom API settings');
            Object.assign(node, buildVlmParamsPatch(node, {
                paramsPatch: {
                    version: 'Custom',
                    custom_provider: params.custom_provider,
                    custom_api_name: params.custom_api_name,
                    custom_api_format: params.custom_api_format,
                    custom_base_url: params.custom_base_url,
                    custom_model: params.custom_model,
                    custom_supports_images: params.custom_supports_images
                }
            }));
            Object.assign(node, buildVlmModelStatusPatch(node, {
                status: patchCall('buildVlmModelUnknownStatus', null, 'Custom', 'Custom API settings changed. Test or check before running.')
                    || {
                        state: 'unknown',
                        ready: false,
                        version: 'Custom',
                        message: 'Custom API settings changed. Test or check before running.'
                    }
            }));
            stateCall('mutate', null, { inspector: true });
            uiCall('showToast', null, t('Selected VLM node now uses Agent Custom API settings.', '选中的 VLM 节点已同步 Agent Custom API 设置'));
        }

        async function testCustomApiParams(params, sourceLabel) {
            const runtime = Object.assign({}, params || {}, {
                version: 'Custom',
                mode: 'single',
                prompt: 'Reply with OK.',
                system_prompt: 'You are an API connectivity tester. Reply with OK only.',
                max_tokens: 16,
                temperature: 0,
                top_p: 1,
                seed: -1,
                disable_thinking: true,
                free_after: false
            });
            if (!runtime.custom_base_url || !runtime.custom_model) {
                uiCall('showToast', null, t('Custom API settings incomplete: Base URL and Model are required. API Key can stay empty for Ollama/LM Studio.', 'Custom API 设置不完整：需要 Base URL 和 Model；Ollama/LM Studio 可不填 API Key'));
                return { ok: false, error: 'Custom API settings incomplete' };
            }
            uiCall('showToast', null, t('Testing Custom API...', '正在测试 Custom API...'));
            const project = getProject();
            const response = await sendCanvasVlmRunRequest({
                project_id: project.id || projectCall('getCurrentProjectId', 'default'),
                node_id: `custom_api_test:${sourceLabel || 'agent'}`,
                asset_sources: [],
                conversation_id: '',
                params: runtime
            });
            if (response?.ok) {
                uiCall('showToast', null, t('Custom API test succeeded: {text}', 'Custom API 测试成功：{text}').replace('{text}', String(response.text || 'OK').slice(0, 80)));
            } else {
                uiCall('showToast', null, t('Custom API test failed: {error}', 'Custom API 测试失败：{error}').replace('{error}', response?.details || response?.error || 'unknown error'));
            }
            return response;
        }

        async function testCanvasAgentCustomApi() {
            if (getCanvasAgentCustomKeyValue().trim()) saveCanvasAgentCustomSecret();
            return testCustomApiParams(getCanvasAgentCustomRuntimeParams(), 'agent');
        }

        async function fetchCanvasAgentCustomModels() {
            if (getCanvasAgentCustomKeyValue().trim()) saveCanvasAgentCustomSecret();
            const params = getCanvasAgentCustomRuntimeParams();
            const project = getProject();
            const response = await sendCanvasAgentCustomModelsRequest({
                project_id: project.id || projectCall('getCurrentProjectId', 'default'),
                node_id: 'canvas_agent_custom_api',
                params,
                api_key: params.custom_api_key || ''
            });
            if (response?.ok) {
                canvasAgentCustomModelChoices = Array.isArray(response.models) ? response.models : [];
                const patch = { customApiCollapsed: false };
                if (!getCanvasAgentSettings().customModel && canvasAgentCustomModelChoices.length) patch.customModel = canvasAgentCustomModelChoices[0];
                setCanvasAgentSettingsPatch(patch, { silentHistory: true });
                uiCall('showToast', null, t('Fetched {count} custom model(s).', '已拉取 {count} 个 Custom 模型').replace('{count}', canvasAgentCustomModelChoices.length));
            } else {
                uiCall('showToast', null, t('Fetch models failed: {error}', '拉取模型失败：{error}').replace('{error}', response?.details || response?.error || 'unknown error'));
            }
            return response;
        }

        function handleCanvasAgentSettingInput(field) {
            const key = field?.getAttribute?.('data-canvas-agent-setting');
            if (!key) return false;
            const type = String(field?.type || '').toLowerCase();
            const value = type === 'checkbox' ? !!field.checked : (type === 'number' ? Number(field.value) : field.value);
            const defaults = getDefaultSettings();
            if (key === 'videoFrames') {
                setCanvasAgentSettingsPatch({ videoFrames: clamp(Number(value || defaults.videoFrames), 1, 32) });
                return true;
            }
            if (key === 'rewriteModel' && value === 'Custom') {
                setCanvasAgentSettingsPatch({ rewriteModel: value, customApiCollapsed: false });
                return true;
            }
            if (key === 'customProvider') {
                const provider = getVlmCustomProvider(value) || {};
                const current = getCanvasAgentSettings();
                setCanvasAgentSettingsPatch({
                    customProvider: value,
                    customApiName: value === 'custom' ? (current.customApiName || provider.label) : provider.label,
                    customBaseUrl: value === 'custom' ? (current.customBaseUrl || provider.baseUrl || '') : (provider.baseUrl || ''),
                    customApiFormat: provider.format || 'openai_compatible',
                    customSupportsImages: provider.supportsImages !== false,
                    customApiCollapsed: false
                });
                return true;
            }
            if (key === 'videoFaceSwapChoice') {
                const route = decodeCanvasAgentVideoToolChoice(value);
                setCanvasAgentSettingsPatch({
                    videoFaceSwapPreset: route.preset || defaults.videoFaceSwapPreset,
                    videoFaceSwapTheme: route.theme || defaults.videoFaceSwapTheme
                });
                return true;
            }
            if (key === 'videoMotionTransferChoice') {
                const route = decodeCanvasAgentVideoToolChoice(value);
                setCanvasAgentSettingsPatch({
                    videoMotionTransferPreset: route.preset || defaults.videoMotionTransferPreset,
                    videoMotionTransferTheme: route.theme || defaults.videoMotionTransferTheme
                });
                return true;
            }
            if (key === 'videoReplacePreset') {
                setCanvasAgentSettingsPatch({ [key]: value, videoEditQuickToolDefaultMigrated: true });
                return true;
            }
            setCanvasAgentSettingsPatch({ [key]: value });
            return true;
        }

        function handleCanvasAgentModelModeInput(field) {
            const mode = String(field?.value || '').trim();
            if (mode === 'custom') {
                setCanvasAgentSettingsPatch({ rewriteModel: 'Custom', customApiCollapsed: false });
                return;
            }
            const settings = getCanvasAgentSettings();
            const model = settings.rewriteModel && settings.rewriteModel !== 'Custom'
                ? settings.rewriteModel
                : canvasAgentDefaultLocalRewriteModel();
            setCanvasAgentSettingsPatch({ rewriteModel: model });
        }

        return {
            getCanvasAgentSettings,
            setCanvasAgentSettingsPatch,
            setCanvasAgentLayoutPatch,
            canvasAgentDefaultLocalRewriteModel,
            canvasAgentLocalRewriteModels,
            canvasAgentModelSummary,
            getCanvasAgentResolutionState,
            setCanvasAgentResolutionPatch,
            setCanvasAgentResolutionOpen,
            canvasAgentResolutionLabel,
            canvasAgentResolutionCompactLabel,
            revealCanvasAgentPanelForToolCard,
            dockCanvasAgentPanelBottomLeft,
            getCanvasAgentRewriteModel,
            canvasAgentCustomParamsFromSettings,
            getCanvasAgentCustomRuntimeParams,
            getCanvasAgentCustomKeyValue,
            getCanvasAgentCustomModelChoices,
            saveCanvasAgentCustomSecret,
            fetchCanvasAgentCustomModels,
            testCanvasAgentCustomApi,
            syncCanvasAgentCustomFromSelectedVlm,
            syncSelectedVlmCustomFromCanvasAgent,
            handleCanvasAgentSettingInput,
            handleCanvasAgentModelModeInput
        };
    }

    window.SimpAICanvasWorkbenchCanvasAgentSettings = Object.assign({}, window.SimpAICanvasWorkbenchCanvasAgentSettings || {}, {
        createCanvasAgentSettingsController
    });
})();
