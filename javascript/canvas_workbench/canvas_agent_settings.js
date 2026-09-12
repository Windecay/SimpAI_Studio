(function () {
    'use strict';

    function createCanvasAgentSettingsController(context) {
        const scope = context || {};
        const getDefaultSettings = () => typeof scope.getDefaultSettings === 'function' ? (scope.getDefaultSettings() || {}) : {};
        const getDefaultProjectSettings = () => typeof scope.getDefaultProjectSettings === 'function' ? (scope.getDefaultProjectSettings() || {}) : {};
        const t = scope.t || ((en, cn) => cn || en);
        const clamp = scope.clamp || ((value, min, max) => Math.max(min, Math.min(max, value)));
        const normalizePresetName = scope.normalizePresetName || ((value) => String(value || '').trim());
        const getVlmCustomProvider = (...args) => call('getVlmCustomProvider', {}, ...args);
        const getVlmCustomApiProfile = (...args) => call('getVlmCustomApiProfile', null, ...args);
        const getCanvasAgentCustomKeyValue = (...args) => call('getCanvasAgentCustomKeyValue', '', ...args);
        const decodeCanvasAgentVideoToolChoice = (...args) => call('decodeCanvasAgentVideoToolChoice', {}, ...args) || {};

        function call(name, fallback, ...args) {
            return typeof scope[name] === 'function' ? scope[name](...args) : fallback;
        }

        const getVersionChoices = () => {
            const value = call('getVersionChoices', []);
            return Array.isArray(value) ? value : [];
        };

        function getProject() {
            return call('getProject', null) || {};
        }

        function getAgentState() {
            return call('getAgentState', null) || {};
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
            const patch = call('buildProjectSettingsMergePatch', null, { settings: currentSettings }, updates);
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
            if (!options?.silentHistory) call('pushHistoryBatch', null, 'canvas-agent-settings', 'Canvas Agent settings');
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
            call('scheduleSave', null);
            call('renderCanvasAgentPanel', null);
            call('renderCanvasSettingsPanel', null);
            call('renderStatus', null);
        }

        function setCanvasAgentLayoutPatch(patch, options) {
            if (!patch || typeof patch !== 'object') return;
            const project = getProject();
            applyProjectSettingsMergePatch(project, {
                canvasAgent: Object.assign({}, getCanvasAgentSettings(), patch)
            });
            call('scheduleSave', null);
            if (options?.render !== false) call('renderCanvasAgentPanel', null);
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
            if (opts.render !== false) call('renderCanvasAgentPanel', null);
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

        return {
            getCanvasAgentSettings,
            setCanvasAgentSettingsPatch,
            setCanvasAgentLayoutPatch,
            revealCanvasAgentPanelForToolCard,
            dockCanvasAgentPanelBottomLeft,
            getCanvasAgentRewriteModel,
            canvasAgentCustomParamsFromSettings,
            getCanvasAgentCustomRuntimeParams,
            handleCanvasAgentSettingInput
        };
    }

    window.SimpAICanvasWorkbenchCanvasAgentSettings = Object.assign({}, window.SimpAICanvasWorkbenchCanvasAgentSettings || {}, {
        createCanvasAgentSettingsController
    });
})();
