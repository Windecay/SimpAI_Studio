(function () {
    'use strict';

    function createCanvasAgentGenerationController(context) {
        const scope = context || {};
        const call = (name, fallback, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : fallback;
        const t = scope.t || ((en, cn) => cn || en);
        const clamp = (value, min, max) => typeof scope.clamp === 'function'
            ? scope.clamp(value, min, max)
            : Math.min(max, Math.max(min, value));
        const aspectOptions = () => Array.isArray(scope.canvasAgentAspectOptions) ? scope.canvasAgentAspectOptions : [];
        const getCanvasAgentResolutionState = (...args) => call('getCanvasAgentResolutionState', {}, ...args) || {};
        const getVisiblePresetParams = (...args) => call('getVisiblePresetParams', [], ...args) || [];
        const buildNodeParamsPatch = (...args) => call('buildNodeParamsPatch', {}, ...args) || {};
        const canvasAgentPresetPromptDefaults = (...args) => call('canvasAgentPresetPromptDefaults', {
            styles: [],
            prompt: '',
            negative_prompt: ''
        }, ...args) || { styles: [], prompt: '', negative_prompt: '' };
        const buildPresetSnapshotPatch = (...args) => call('buildPresetSnapshotPatch', {}, ...args) || {};
        const cloneRunValue = (...args) => call('cloneRunValue', {}, ...args) || {};
        const createCanvasAgentPresetProbeNode = (...args) => call('createCanvasAgentPresetProbeNode', null, ...args);
        const buildClassicNodeStatePatch = (...args) => call('buildClassicNodeStatePatch', {}, ...args) || {};
        const getVisibleClassicUploadSlots = (...args) => call('getVisibleClassicUploadSlots', [], ...args) || [];
        const getVisibleUploadSlots = (...args) => call('getVisibleUploadSlots', [], ...args) || [];
        const canNodeConnectToUploadSlot = (...args) => !!call('canNodeConnectToUploadSlot', false, ...args);
        const isCanvasAgentMaskSlot = (...args) => !!call('isCanvasAgentMaskSlot', false, ...args);
        const generationConfigValueForPresetSchema = (...args) => call('generationConfigValueForPresetSchema', args[2], ...args);
        const buildPresetGenerationConfigPatch = (...args) => call('buildPresetGenerationConfigPatch', {}, ...args) || {};
        const getNode = (...args) => call('getNode', null, ...args);
        const buildConfigStatePatch = (...args) => call('buildConfigStatePatch', {}, ...args) || {};
        const applyConfigNodeToPreset = (...args) => call('applyConfigNodeToPreset', null, ...args);
        const isNodeLocked = (...args) => !!call('isNodeLocked', false, ...args);
        const showToast = (...args) => call('showToast', null, ...args);
        const pushHistoryBatch = (...args) => call('pushHistoryBatch', null, ...args);
        const buildCanvasNodeStatusPatch = (...args) => call('buildCanvasNodeStatusPatch', {}, ...args) || {};
        const mutate = (...args) => call('mutate', null, ...args);
        const getPresetConfigSource = (...args) => call('getPresetConfigSource', {
            defaults: {},
            overrides: {}
        }, ...args) || { defaults: {}, overrides: {} };
        const buildInitialConfigValues = (...args) => call('buildInitialConfigValues', {}, ...args) || {};
        const normalizeResolutionProfile = (...args) => call('normalizeResolutionProfile', {}, ...args) || {};
        const resolveResolutionBaseDims = (...args) => call('resolveResolutionBaseDims', {
            width: Number(args[0]?.width || 0),
            height: Number(args[0]?.height || 0)
        }, ...args) || {};
        const buildPresetConfigPatch = (...args) => call('buildPresetConfigPatch', {}, ...args) || {};
        const nowIso = (...args) => call('nowIso', new Date().toISOString(), ...args);

        function normalizeCanvasAgentAspect(value, fallbackText) {
            const text = [value, fallbackText].map(item => String(item || '').trim()).filter(Boolean).join(' ').toLowerCase();
            if (!text) return '';
            const explicitRatio = text.match(/(?:^|[^\d])(\d{1,2})\s*(?::|：|x|×|\*|\/|比)\s*(\d{1,2})(?:[^\d]|$)/i);
            const explicitRatioSafe = text.match(new RegExp("(?:^|[^\\d])(\\d{1,2})\\s*(?::|\\uFF1A|x|\\u00D7|\\*|\\/|\\u6BD4)\\s*(\\d{1,2})(?:[^\\d]|$)", "i"));
            const closestAspect = (w, h) => {
                const width = Number(w);
                const height = Number(h);
                if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return '';
                const ratio = width / height;
                let best = null;
                aspectOptions().forEach((item) => {
                    const parts = String(item.key || '').split(':').map(Number);
                    if (parts.length !== 2 || !parts[0] || !parts[1]) return;
                    const diff = Math.abs(Math.log(ratio / (parts[0] / parts[1])));
                    if (!best || diff < best.diff) best = { key: item.key, diff };
                });
                return best && best.diff < 0.08 ? best.key : '';
            };
            const ratioMatch = explicitRatioSafe || explicitRatio;
            if (ratioMatch) {
                const key = `${Number(ratioMatch[1])}:${Number(ratioMatch[2])}`;
                const found = aspectOptions().find(item => item.key === key);
                if (found) return found.key;
                const closest = closestAspect(ratioMatch[1], ratioMatch[2]);
                if (closest) return closest;
            }
            const dimensions = text.match(/(?:^|[^\d])(\d{3,5})\s*(?:x|×|\*|by)\s*(\d{3,5})(?:[^\d]|$)/i);
            if (dimensions) {
                const key = closestAspect(dimensions[1], dimensions[2]);
                if (key) return key;
            }
            const direct = text.match(/(?:^|[^\d])(\d{1,2})\s*(?:[:：x×*\/]|比)\s*(\d{1,2})(?:[^\d]|$)/);
            if (direct) {
                const key = `${Number(direct[1])}:${Number(direct[2])}`;
                const found = aspectOptions().find(item => item.key === key);
                if (found) return found.key;
                const closest = closestAspect(direct[1], direct[2]);
                if (closest) return closest;
            }
            if (/(竖屏|纵向|portrait|vertical|手机壁纸|手机屏幕|9\s*[:：x*\/比]\s*16)/i.test(text)) return '9:16';
            if (/(横屏|横向|landscape|wide|widescreen|宽屏|16\s*[:：x*\/比]\s*9)/i.test(text)) return '16:9';
            if (/(方图|正方形|square|1\s*[:：x*\/比]\s*1)/i.test(text)) return '1:1';
            if (/(4\s*[:：x*\/比]\s*3|标准屏|standard)/i.test(text)) return '4:3';
            if (/(3\s*[:：x*\/比]\s*4)/i.test(text)) return '3:4';
            if (/(2\s*[:：x*\/比]\s*3)/i.test(text)) return '2:3';
            if (/(3\s*[:：x*\/比]\s*2)/i.test(text)) return '3:2';
            if (/(\u6a2a\u5c4f|\u6a2a\u5411|\u5bbd\u5c4f|\u5bec\u5c4f|landscape|wide|widescreen)/i.test(text)) return '16:9';
            if (/(\u7ad6\u5c4f|\u7eb5\u5411|\u7e31\u5411|\u624b\u673a\u58c1\u7eb8|\u624b\u673a\u5c4f\u5e55|portrait|vertical)/i.test(text)) return '9:16';
            if (/(\u65b9\u56fe|\u65b9\u5716|\u6b63\u65b9\u5f62|square)/i.test(text)) return '1:1';
            return '';
        }

        function extractCanvasAgentAspectFromText(text) {
            return normalizeCanvasAgentAspect('', text);
        }

        function stripCanvasAgentInlineGenerationParams(prompt) {
            let text = String(prompt || '');
            if (!text) return '';
            text = text.replace(/(?:^|,\s*|\s+)(?:aspect[_\s-]*ratio|ratio|画幅|比例|宽高比)\s*[:=：]\s*(?:\d{1,5}\s*(?:[:：x×*\/]|比)\s*\d{1,5}|landscape|portrait|horizontal|vertical|横屏|竖屏|横向|纵向|square|方图)(?=\s*,|\s*$)/gi, '');
            text = text.replace(/(?:^|,\s*|\s+)(?:resolution[_\s-]*scale|scale|upscale|steps?|cfg(?:_scale)?|guidance(?:_scale)?|seed(?:_random)?)\s*[:=：]\s*[-+]?\w+(?:\.\w+)?(?=\s*,|\s*$)/gi, '');
            return text
                .split(',')
                .map(item => item.trim())
                .filter(Boolean)
                .join(', ')
                .replace(/\s{2,}/g, ' ')
                .trim();
        }

        function canvasAgentUserExplicitNegativePrompt(text) {
            return /(?:negative\s*prompt|negative_prompt|--neg\b|\u53cd\u5411\u63d0\u793a|\u8d1f\u5411\u63d0\u793a|\u8d1f\u9762\u63d0\u793a|\u8d1f\u9762prompt|\u8d1f\u5411prompt)/i.test(String(text || ''));
        }

        function normalizeCanvasAgentGenerationOptions(plan, fallbackText) {
            const src = plan && typeof plan === 'object' ? plan : {};
            const text = String(fallbackText || src.prompt || src.recommendedPrompt || '').trim();
            const composer = src.prompt_composer && typeof src.prompt_composer === 'object' ? src.prompt_composer : {};
            const composerResolution = composer.generation_resolution && typeof composer.generation_resolution === 'object' ? composer.generation_resolution : {};
            const composerWidth = Number(String(composerResolution.width || '').match(/-?\d+(?:\.\d+)?/)?.[0] || 0);
            const composerHeight = Number(String(composerResolution.height || '').match(/-?\d+(?:\.\d+)?/)?.[0] || 0);
            const composerAspect = String(composerResolution.aspect_ratio || (composerWidth && composerHeight ? `${composerWidth}x${composerHeight}` : '')).trim();
            const aspect = normalizeCanvasAgentAspect(src.aspect_ratio || src.aspectRatio || src.aspect || src.ratio || src.orientation || src.resolution || src.size || (src.width && src.height ? `${src.width}x${src.height}` : '') || composerAspect, text);
            const aspectOption = aspectOptions().find(item => item.key === aspect);
            const boolValue = (value) => {
                if (value === undefined || value === null || value === '') return null;
                if (typeof value === 'boolean') return value;
                if (typeof value === 'number') return value !== 0;
                const normalized = String(value).trim().toLowerCase();
                if (['false', '0', 'no', 'off', 'fixed', 'manual'].includes(normalized)) return false;
                if (['true', '1', 'yes', 'on', 'random', 'auto'].includes(normalized)) return true;
                if (/随机/.test(normalized)) return true;
                if (/固定|指定/.test(normalized)) return false;
                return !!normalized;
            };
            const numberValue = (...keys) => {
                for (const key of keys) {
                    const value = src[key];
                    if (value === undefined || value === null || value === '') continue;
                    const parsed = Number(String(value).match(/-?\d+(?:\.\d+)?/)?.[0]);
                    if (Number.isFinite(parsed)) return parsed;
                }
                return null;
            };
            const imageCountFromText = /(?:出|生成|来|要)?\s*(\d{1,2})\s*(?:张|幅|images?|imgs?|batch)/i.exec(text)?.[1];
            const scale = numberValue('resolution_scale', 'scale', 'upscale');
            const rawImageNumber = numberValue('image_number', 'images', 'count', 'batch_size') ?? (imageCountFromText ? Number(imageCountFromText) : null);
            const imageNumber = rawImageNumber != null && rawImageNumber > 1 ? clamp(Math.round(rawImageNumber), 1, 16) : null;
            const seed = numberValue('seed', 'image_seed');
            const steps = numberValue('overwrite_step', 'steps', 'scene_steps');
            const cfg = numberValue('cfg_scale', 'guidance_scale', 'cfg', 'guidance');
            const seedRandom = boolValue(src.seed_random ?? src.random_seed ?? src.randomize_seed);
            const widthValue = numberValue('width', 'overwrite_width');
            const heightValue = numberValue('height', 'overwrite_height');
            const dimensionsFromText = (...values) => {
                for (const value of values) {
                    const match = String(value || '').match(/(?:^|[^\d])(\d{3,5})\s*(?:x|脳|\*)\s*(\d{3,5})(?:[^\d]|$)/i);
                    if (match) return { width: Number(match[1]), height: Number(match[2]) };
                }
                return null;
            };
            const composerDimensions = composerWidth && composerHeight
                ? { width: composerWidth, height: composerHeight }
                : null;
            const explicitDimensions = widthValue && heightValue
                ? { width: widthValue, height: heightValue }
                : (composerDimensions || dimensionsFromText(src.size, src.resolution, src.aspect_ratio, src.aspectRatio, src.aspect, composerAspect, text));
            const aspectDimensions = (() => {
                const match = String(aspectOption?.value || '').match(/^(\d{3,5})\*(\d{3,5})$/);
                return match ? { width: Number(match[1]), height: Number(match[2]) } : null;
            })();
            const resolvedDimensions = explicitDimensions || aspectDimensions;
            const resolvedAspect = resolvedDimensions?.width && resolvedDimensions?.height
                ? (normalizeCanvasAgentAspect(`${resolvedDimensions.width}x${resolvedDimensions.height}`, '') || aspect)
                : aspect;
            const rawNegativePrompt = String(src.negative_prompt || src.negativePrompt || src.negative || '').trim();
            return {
                aspect: resolvedAspect,
                width: resolvedDimensions?.width ? Math.round(resolvedDimensions.width) : null,
                height: resolvedDimensions?.height ? Math.round(resolvedDimensions.height) : null,
                resolutionScale: scale != null ? clamp(scale, 1, 2) : null,
                imageNumber,
                seed: seed != null ? Math.max(0, Math.round(seed)) : null,
                seedRandom,
                steps: steps != null ? clamp(Math.round(steps), 1, 200) : null,
                cfgScale: cfg != null ? clamp(cfg, 0, 30) : null,
                negativePrompt: canvasAgentUserExplicitNegativePrompt(text) ? rawNegativePrompt : ''
            };
        }

        const canvasAgentResolutionLabel = (...args) => call('canvasAgentResolutionLabel', '', ...args);
        const canvasAgentResolutionCompactLabel = (...args) => call('canvasAgentResolutionCompactLabel', '', ...args);

        function canvasAgentModelStatusLabel(status) {
            if (status?.ready) return t('Ready', '就绪');
            if (status?.ok === false) return status.error || t('Check failed', '检查失败');
            return t('Will use normal model gate', '将使用正常模型门禁');
        }

        function applyCanvasAgentPromptToGenerator(node, prompt) {
            const paramsPatch = { prompt };
            if (node.type === 'preset') {
                const visibleKeys = new Set(getVisiblePresetParams(node).map(param => param.key));
                if (visibleKeys.has('scene_additional_prompt') && !visibleKeys.has('prompt')) {
                    paramsPatch.scene_additional_prompt = prompt;
                }
            }
            Object.assign(node, buildNodeParamsPatch(node, { paramsPatch }));
        }

        function applyCanvasAgentPresetDefaultsToGenerator(node, entryOrNode) {
            if (!node || !['preset', 'classic'].includes(node.type)) return;
            const defaults = canvasAgentPresetPromptDefaults(entryOrNode || node);
            Object.assign(node, buildPresetSnapshotPatch(node, {
                snapshotPatch: Object.assign(
                    {},
                    defaults.styles.length ? { default_styles: defaults.styles.slice() } : {},
                    defaults.prompt ? { default_prompt: defaults.prompt } : {},
                    defaults.negative_prompt ? { default_prompt_negative: defaults.negative_prompt } : {}
                )
            }));
        }

        function clonePresetWithPromptDefaults(node, entryOrNode) {
            const preset = cloneRunValue(node?.preset || {}, {});
            const defaults = canvasAgentPresetPromptDefaults(entryOrNode || node);
            const snapshot = preset.snapshot && typeof preset.snapshot === 'object' && !Array.isArray(preset.snapshot)
                ? preset.snapshot
                : {};
            const snapshotPatch = {};
            if (defaults.styles.length && !Array.isArray(snapshot.default_styles)) {
                snapshotPatch.default_styles = defaults.styles.slice();
            }
            if (defaults.prompt && !String(snapshot.default_prompt || '').trim()) {
                snapshotPatch.default_prompt = defaults.prompt;
            }
            if (defaults.negative_prompt && !String(snapshot.default_prompt_negative || '').trim()) {
                snapshotPatch.default_prompt_negative = defaults.negative_prompt;
            }
            return buildPresetSnapshotPatch(node, { preset, snapshotPatch }).preset;
        }

        function presetNodeHasParam(node, key) {
            if (!node || !key) return false;
            if (Object.prototype.hasOwnProperty.call(node.params || {}, key)) return true;
            return Array.isArray(node.schema?.params) && node.schema.params.some(param => param?.key === key);
        }

        function setPresetGenerationConfigValue(node, key, value) {
            if (!node || !key) return;
            value = generationConfigValueForPresetSchema(node, key, value);
            const currentGeneration = node.generation_config && typeof node.generation_config === 'object'
                ? node.generation_config
                : {};
            const currentDefaults = currentGeneration.defaults && typeof currentGeneration.defaults === 'object'
                ? currentGeneration.defaults
                : {};
            Object.assign(node, buildPresetGenerationConfigPatch(node, {
                defaultsPatch: Object.prototype.hasOwnProperty.call(currentDefaults, key) ? {} : { [key]: value },
                overridesPatch: { [key]: value }
            }));
            const sourceNode = node.generation_config.source_node_id ? getNode(node.generation_config.source_node_id) : null;
            if (sourceNode && sourceNode.type === 'config' && sourceNode.config_kind === 'advanced') {
                const sourceDefaults = sourceNode.config?.defaults && typeof sourceNode.config.defaults === 'object'
                    ? sourceNode.config.defaults
                    : {};
                Object.assign(sourceNode, buildConfigStatePatch(sourceNode, {
                    valuesPatch: { [key]: value },
                    defaultsPatch: Object.prototype.hasOwnProperty.call(sourceDefaults, key) ? {} : { [key]: value },
                    touchUpdatedAt: true
                }));
                applyConfigNodeToPreset(sourceNode);
            }
        }

        function presetGenerationStepValue(node) {
            const generation = node?.generation_config && typeof node.generation_config === 'object' ? node.generation_config : {};
            const overrides = generation.overrides && typeof generation.overrides === 'object' ? generation.overrides : {};
            const defaults = generation.defaults && typeof generation.defaults === 'object' ? generation.defaults : {};
            const value = overrides.overwrite_step ?? overrides.steps ?? defaults.overwrite_step ?? defaults.steps;
            const parsed = Number(value);
            return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
        }

        function presetGenerationImageNumberValue(node) {
            const generation = node?.generation_config && typeof node.generation_config === 'object' ? node.generation_config : {};
            const overrides = generation.overrides && typeof generation.overrides === 'object' ? generation.overrides : {};
            const defaults = generation.defaults && typeof generation.defaults === 'object' ? generation.defaults : {};
            const value = overrides.image_number ?? defaults.image_number;
            const parsed = Number(value);
            return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
        }

        function applyCanvasAgentGenerationOptionsToGenerator(node, options) {
            if (!node || !options) return;
            const paramsPatch = {};
            const deleteKeys = [];
            const imageNumber = Number.isFinite(options.imageNumber) && options.imageNumber > 1 ? options.imageNumber : 1;
            setPresetGenerationConfigValue(node, 'image_number', imageNumber);
            deleteKeys.push('scene_image_number');
            if (Number.isFinite(options.seed)) {
                paramsPatch.seed_random = false;
                paramsPatch.image_seed = options.seed;
            } else if (options.seedRandom === true) {
                paramsPatch.seed_random = true;
            }
            if (Number.isFinite(options.steps)) {
                setPresetGenerationConfigValue(node, 'overwrite_step', options.steps);
                deleteKeys.push('scene_steps', 'steps');
            }
            if (Number.isFinite(options.cfgScale)) {
                if (presetNodeHasParam(node, 'cfg_scale')) paramsPatch.cfg_scale = options.cfgScale;
                else if (presetNodeHasParam(node, 'guidance_scale')) paramsPatch.guidance_scale = options.cfgScale;
            }
            Object.assign(node, buildNodeParamsPatch(node, { paramsPatch, deleteKeys }));
        }

        function prepareCanvasAgentGenerator(node, prompt, generationOptions) {
            if (!node || !['preset', 'classic'].includes(node.type)) return false;
            if (isNodeLocked(node)) {
                showToast(t('Locked node cannot be edited', '锁定节点无法编辑'));
                return false;
            }
            pushHistoryBatch(`canvas-agent-prompt:${node.id}`, 'Canvas Agent prompt');
            applyCanvasAgentPresetDefaultsToGenerator(node);
            applyCanvasAgentPromptToGenerator(node, prompt);
            applyCanvasAgentGenerationOptionsToGenerator(node, generationOptions);
            applyCanvasAgentResolutionToGenerator(node, generationOptions);
            Object.assign(node, buildCanvasNodeStatusPatch(node, { status: 'idle' }));
            mutate({ inspector: true });
            return true;
        }

        function applyCanvasAgentResolutionToGenerator(node, options) {
            if (!node || !['preset', 'classic'].includes(node.type)) return;
            const state = getCanvasAgentResolutionState();
            const sourceConfig = getPresetConfigSource(node, 'resolution');
            const values = buildInitialConfigValues('resolution', sourceConfig, node);
            const optionsList = aspectOptions();
            const aspectOption = optionsList.find(item => item.key === (options?.aspect || state.aspect)) || optionsList[0];
            const explicitWidth = Number(options?.width || 0);
            const explicitHeight = Number(options?.height || 0);
            const explicitAspectValue = explicitWidth > 0 && explicitHeight > 0 ? `${Math.round(explicitWidth)}*${Math.round(explicitHeight)}` : '';
            const aspectValue = explicitAspectValue || aspectOption?.value || '';
            if (aspectValue) {
                values.aspect_ratio = aspectValue;
                values.manual = false;
                const profile = normalizeResolutionProfile(values.profile || values.defaults || sourceConfig.defaults || {});
                const dims = explicitAspectValue
                    ? { width: Math.round(explicitWidth), height: Math.round(explicitHeight) }
                    : resolveResolutionBaseDims(Object.assign({}, values, {
                        aspect_ratio: aspectValue,
                        profile
                    }), Array.isArray(profile.aspect_ratios) ? profile.aspect_ratios : []);
                values.width = dims.width;
                values.height = dims.height;
            }
            values.multiplier = clamp(Number(options?.resolutionScale || state.multiplier || 1) || 1, 1, 2);
            Object.assign(node, buildPresetConfigPatch(node, {
                configKey: 'resolution_config',
                presetConfig: {
                    mode: 'agent_override',
                    defaults: sourceConfig.defaults || {},
                    overrides: Object.assign({}, sourceConfig.overrides || {}, values),
                    updated_at: nowIso()
                }
            }));
        }

        function previewCanvasAgentEditInputSlot(entry, target) {
            if (!entry || !target) return null;
            const probe = createCanvasAgentPresetProbeNode(entry);
            if (probe.type === 'classic') {
                Object.assign(probe, buildClassicNodeStatePatch(probe, { classicMode: 'uov' }));
            }
            const uploadSlots = probe.type === 'classic' ? getVisibleClassicUploadSlots(probe) : getVisibleUploadSlots(probe);
            return uploadSlots.find(item => !isCanvasAgentMaskSlot(item) && canNodeConnectToUploadSlot(target, item.key)) || uploadSlots.find(item => !isCanvasAgentMaskSlot(item)) || null;
        }

        return {
            canvasAgentUserExplicitNegativePrompt,
            normalizeCanvasAgentAspect,
            extractCanvasAgentAspectFromText,
            stripCanvasAgentInlineGenerationParams,
            normalizeCanvasAgentGenerationOptions,
            canvasAgentResolutionLabel,
            canvasAgentResolutionCompactLabel,
            canvasAgentModelStatusLabel,
            applyCanvasAgentPromptToGenerator,
            applyCanvasAgentPresetDefaultsToGenerator,
            clonePresetWithPromptDefaults,
            presetGenerationStepValue,
            presetGenerationImageNumberValue,
            applyCanvasAgentGenerationOptionsToGenerator,
            prepareCanvasAgentGenerator,
            applyCanvasAgentResolutionToGenerator,
            previewCanvasAgentEditInputSlot
        };
    }

    window.SimpAICanvasWorkbenchCanvasAgentGeneration = Object.assign(
        {},
        window.SimpAICanvasWorkbenchCanvasAgentGeneration || {},
        { createCanvasAgentGenerationController }
    );
})();
