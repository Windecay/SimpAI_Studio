(function () {
    'use strict';

    function createCanvasNodeFactoryController(context) {
        const scope = context || {};
        const cloneRunValue = typeof scope.cloneRunValue === 'function'
            ? scope.cloneRunValue
            : (value, fallback) => value === undefined ? fallback : JSON.parse(JSON.stringify(value));
        const nowIso = typeof scope.nowIso === 'function' ? scope.nowIso : () => new Date().toISOString();
        const t = typeof scope.t === 'function' ? scope.t : ((en, cn) => cn || en);
        const uid = typeof scope.uid === 'function' ? scope.uid : (type) => `${type}-node`;
        const normalizePresetName = typeof scope.normalizePresetName === 'function'
            ? scope.normalizePresetName
            : (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
        const getPromptDefaults = (...args) => typeof scope.canvasAgentPresetPromptDefaults === 'function'
            ? (scope.canvasAgentPresetPromptDefaults(...args) || {})
            : {};
        const getClassicIpTypes = typeof scope.getClassicIpTypes === 'function'
            ? scope.getClassicIpTypes
            : () => [];
        const enhanceRegionKey = typeof scope.enhanceRegionKey === 'function'
            ? scope.enhanceRegionKey
            : index => `enhance_region_${index}`;
        const getVisiblePresetParams = typeof scope.getVisiblePresetParams === 'function'
            ? scope.getVisiblePresetParams
            : () => [];
        const getVisibleUploadSlots = typeof scope.getVisibleUploadSlots === 'function'
            ? scope.getVisibleUploadSlots
            : () => [];
        const ensurePresetSpecialControllerState = typeof scope.ensurePresetSpecialControllerState === 'function'
            ? scope.ensurePresetSpecialControllerState
            : () => '';
        const enhanceRegionDefaults = Array.isArray(scope.registryClassicEnhanceRegionDefaults)
            ? scope.registryClassicEnhanceRegionDefaults
            : null;
        const classicIpControlTypes = Array.isArray(scope.registryClassicIpControlTypes)
            ? scope.registryClassicIpControlTypes
            : null;

        function buildNodeParamsPatch(node, options) {
            const config = options || {};
            const isRecord = (value) => value && typeof value === 'object' && !Array.isArray(value);
            const hasOwn = (key) => Object.prototype.hasOwnProperty.call(config, key);
            const base = hasOwn('params') ? config.params : node?.params;
            const params = cloneRunValue(isRecord(base) ? base : {}, {});
            if (isRecord(config.paramsPatch)) {
                Object.assign(params, cloneRunValue(config.paramsPatch, {}));
            }
            (Array.isArray(config.deleteKeys) ? config.deleteKeys : []).forEach((key) => {
                const name = String(key || '').trim();
                if (name) delete params[name];
            });
            return { params: cloneRunValue(params, {}) };
        }

        function buildNodeStylePatch(node, options) {
            if (!node) return {};
            const config = options || {};
            const isRecord = (value) => value && typeof value === 'object' && !Array.isArray(value);
            const style = isRecord(node.style) ? cloneRunValue(node.style, {}) : {};
            if (isRecord(config.stylePatch)) {
                Object.assign(style, cloneRunValue(config.stylePatch, {}));
            }
            (Array.isArray(config.deleteStyleKeys) ? config.deleteStyleKeys : []).forEach((key) => {
                const name = String(key || '').trim();
                if (name) delete style[name];
            });
            return { style: cloneRunValue(style, {}) };
        }

        function applyNodeStylePatch(node, options) {
            if (!node) return;
            const patch = buildNodeStylePatch(node, options);
            if (!patch.style || !Object.keys(patch.style).length) {
                delete node.style;
                return;
            }
            Object.assign(node, patch);
        }

        function buildNodeLayoutPatch(node, options) {
            if (!node) return {};
            const config = options || {};
            const hasOwn = (key) => Object.prototype.hasOwnProperty.call(config, key);
            const patch = {};
            ['x', 'y', 'w', 'h', 'collapsed_h'].forEach((key) => {
                if (hasOwn(key)) patch[key] = config[key];
            });
            if (hasOwn('collapsed')) patch.collapsed = !!config.collapsed;
            return patch;
        }

        function buildNodeFlagPatch(node, options) {
            if (!node) return {};
            const config = options || {};
            const patch = {};
            ['locked', 'ignored'].forEach((key) => {
                if (Object.prototype.hasOwnProperty.call(config, key)) patch[key] = !!config[key];
            });
            return patch;
        }

        function buildNodeFieldPatch(node, key, value) {
            if (!node) return {};
            const name = String(key || '').trim();
            if (!name || ['__proto__', 'prototype', 'constructor'].includes(name)) return {};
            return { [name]: value };
        }

        function applyNodeLayoutPatch(node, options) {
            if (!node) return;
            Object.assign(node, buildNodeLayoutPatch(node, options));
        }

        function buildPresetUploadSlotPatch(node, options) {
            if (!node || !['preset', 'classic'].includes(node.type)) return {};
            const config = options || {};
            const isRecord = (value) => value && typeof value === 'object' && !Array.isArray(value);
            const hasOwn = (key) => Object.prototype.hasOwnProperty.call(config, key);
            if (!hasOwn('uploadSlots') && !isRecord(config.uploadSlotsPatch)) return {};
            const baseUploads = hasOwn('uploadSlots') ? config.uploadSlots : node.upload_slots;
            const uploadSlots = isRecord(baseUploads) ? cloneRunValue(baseUploads, {}) : {};
            if (isRecord(config.uploadSlotsPatch)) {
                Object.assign(uploadSlots, cloneRunValue(config.uploadSlotsPatch, {}));
            }
            (Array.isArray(config.deleteUploadSlotKeys) ? config.deleteUploadSlotKeys : []).forEach((key) => {
                const name = String(key || '').trim();
                if (name) delete uploadSlots[name];
            });
            return { upload_slots: cloneRunValue(uploadSlots, {}) };
        }

        function buildClassicNodeStatePatch(node, options) {
            if (!node || node.type !== 'classic') return {};
            const config = options || {};
            const isRecord = (value) => value && typeof value === 'object' && !Array.isArray(value);
            const hasOwn = (key) => Object.prototype.hasOwnProperty.call(config, key);
            const patch = buildPresetUploadSlotPatch(node, config);

            if (hasOwn('classicMode') || hasOwn('mode')) {
                patch.classic_mode = hasOwn('classicMode') ? config.classicMode : config.mode;
            }
            if (hasOwn('classicIpCount') || hasOwn('ipCount')) {
                patch.classic_ip_count = hasOwn('classicIpCount') ? config.classicIpCount : config.ipCount;
            }

            if (hasOwn('enhanceDetectionConfigs') || isRecord(config.enhanceDetectionConfigsPatch)) {
                const baseConfigs = hasOwn('enhanceDetectionConfigs')
                    ? config.enhanceDetectionConfigs
                    : node.enhance_detection_configs;
                const configs = isRecord(baseConfigs) ? cloneRunValue(baseConfigs, {}) : {};
                if (isRecord(config.enhanceDetectionConfigsPatch)) {
                    Object.assign(configs, cloneRunValue(config.enhanceDetectionConfigsPatch, {}));
                }
                (Array.isArray(config.deleteEnhanceDetectionConfigKeys) ? config.deleteEnhanceDetectionConfigKeys : []).forEach((key) => {
                    const name = String(key || '').trim();
                    if (name) delete configs[name];
                });
                patch.enhance_detection_configs = cloneRunValue(configs, {});
            }

            return patch;
        }

        function buildPresetTextInputPatch(node, options) {
            if (!node || !['preset', 'classic'].includes(node.type)) return {};
            const config = options || {};
            const isRecord = (value) => value && typeof value === 'object' && !Array.isArray(value);
            const hasOwn = (key) => Object.prototype.hasOwnProperty.call(config, key);
            const patch = {};

            if (hasOwn('textInputs') || isRecord(config.textInputsPatch)) {
                const base = hasOwn('textInputs') ? config.textInputs : node.text_inputs;
                const textInputs = isRecord(base) ? cloneRunValue(base, {}) : {};
                if (isRecord(config.textInputsPatch)) {
                    Object.assign(textInputs, cloneRunValue(config.textInputsPatch, {}));
                }
                (Array.isArray(config.deleteTextInputKeys) ? config.deleteTextInputKeys : []).forEach((key) => {
                    const name = String(key || '').trim();
                    if (name) delete textInputs[name];
                });
                patch.text_inputs = cloneRunValue(textInputs, {});
            }

            if (hasOwn('styleTransferSelectorId')) {
                patch.style_transfer_selector_id = config.styleTransferSelectorId;
            }

            return patch;
        }

        function buildPresetStyleTransferPatch(node, options) {
            if (!node || !['preset', 'classic'].includes(node.type)) return {};
            const config = options || {};
            const isRecord = (value) => value && typeof value === 'object' && !Array.isArray(value);
            const hasOwn = (key) => Object.prototype.hasOwnProperty.call(config, key);
            if (!hasOwn('styleTransferStyle') && !isRecord(config.styleTransferStylePatch)) return {};

            if (hasOwn('styleTransferStyle')) {
                return {
                    style_transfer_style: config.styleTransferStyle === null
                        ? null
                        : cloneRunValue(config.styleTransferStyle, {})
                };
            }

            const style = isRecord(node.style_transfer_style)
                ? cloneRunValue(node.style_transfer_style, {})
                : {};
            Object.assign(style, cloneRunValue(config.styleTransferStylePatch, {}));
            (Array.isArray(config.deleteStyleTransferStyleKeys) ? config.deleteStyleTransferStyleKeys : []).forEach((key) => {
                const name = String(key || '').trim();
                if (name) delete style[name];
            });
            return { style_transfer_style: cloneRunValue(style, {}) };
        }

        function buildPresetRuntimePatch(node, options) {
            if (!node || !['preset', 'classic'].includes(node.type)) return {};
            const config = options || {};
            const isRecord = (value) => value && typeof value === 'object' && !Array.isArray(value);
            const hasOwn = (key) => Object.prototype.hasOwnProperty.call(config, key);
            const base = hasOwn('runtime') ? config.runtime : node.runtime;
            const runtime = isRecord(base) ? cloneRunValue(base, {}) : {};
            if (isRecord(config.runtimePatch)) {
                Object.assign(runtime, cloneRunValue(config.runtimePatch, {}));
            }
            (Array.isArray(config.deleteKeys) ? config.deleteKeys : []).forEach((key) => {
                const name = String(key || '').trim();
                if (name) delete runtime[name];
            });
            return { runtime: cloneRunValue(runtime, {}) };
        }

        function buildPresetWildcardPreviewPatch(node, options) {
            if (!node || !['preset', 'classic'].includes(node.type)) return {};
            const config = options || {};
            if (!Object.prototype.hasOwnProperty.call(config, 'preview')) return {};
            return { _last_wildcard_preview: cloneRunValue(config.preview, null) };
        }

        function buildPresetConfigPatch(node, options) {
            if (!node || !['preset', 'classic'].includes(node.type)) return {};
            const config = options || {};
            const configKey = String(config.configKey || '').trim();
            if (!['models_config', 'styles_config', 'resolution_config', 'generation_config'].includes(configKey)) return {};
            const isRecord = (value) => value && typeof value === 'object' && !Array.isArray(value);
            const hasOwn = (key) => Object.prototype.hasOwnProperty.call(config, key);
            const base = hasOwn('presetConfig') ? config.presetConfig : node[configKey];
            const presetConfig = isRecord(base) ? cloneRunValue(base, {}) : {};
            if (isRecord(config.presetConfigPatch)) {
                Object.assign(presetConfig, cloneRunValue(config.presetConfigPatch, {}));
            }
            return { [configKey]: cloneRunValue(presetConfig, {}) };
        }

        function buildPresetDefinitionPatch(node, options) {
            if (!node || !['preset', 'classic'].includes(node.type)) return {};
            const config = options || {};
            const hasOwn = (key) => Object.prototype.hasOwnProperty.call(config, key);
            const patch = {};
            if (hasOwn('type')) patch.type = config.type;
            if (hasOwn('title')) patch.title = config.title;
            if (hasOwn('w')) patch.w = config.w;
            if (hasOwn('h')) patch.h = config.h;
            if (hasOwn('schema')) patch.schema = cloneRunValue(config.schema, {});
            if (hasOwn('uploadSlots')) patch.upload_slots = cloneRunValue(config.uploadSlots, {});
            if (hasOwn('modelRequirements')) patch.model_requirements = cloneRunValue(config.modelRequirements, {});
            return patch;
        }

        function applyPresetDefinitionPatch(node, options) {
            if (!node || !['preset', 'classic'].includes(node.type)) return;
            const config = options || {};
            Object.assign(node, buildPresetDefinitionPatch(node, config));
            (Array.isArray(config.deleteKeys) ? config.deleteKeys : []).forEach((key) => {
                const name = String(key || '').trim();
                if (name) delete node[name];
            });
        }

        function buildPresetSnapshotPatch(node, options) {
            if (!node || !['preset', 'classic'].includes(node.type)) return {};
            const config = options || {};
            const isRecord = (value) => value && typeof value === 'object' && !Array.isArray(value);
            const hasOwn = (key) => Object.prototype.hasOwnProperty.call(config, key);
            const basePreset = hasOwn('preset') ? config.preset : node.preset;
            const preset = isRecord(basePreset) ? cloneRunValue(basePreset, {}) : {};
            const baseSnapshot = hasOwn('snapshot') ? config.snapshot : preset.snapshot;
            const snapshot = isRecord(baseSnapshot) ? cloneRunValue(baseSnapshot, {}) : {};
            if (isRecord(config.snapshotPatch)) {
                Object.assign(snapshot, cloneRunValue(config.snapshotPatch, {}));
            }
            if (hasOwn('defaultStyles')) snapshot.default_styles = cloneRunValue(config.defaultStyles, []);
            if (hasOwn('defaultPrompt')) snapshot.default_prompt = config.defaultPrompt ?? '';
            if (hasOwn('defaultNegativePrompt')) snapshot.default_prompt_negative = config.defaultNegativePrompt ?? '';
            preset.snapshot = snapshot;
            return { preset: cloneRunValue(preset, {}) };
        }

        function buildGenerationMetadataPatch(node, options) {
            if (!node || !['preset', 'classic'].includes(node.type)) return {};
            const config = options || {};
            const isRecord = (value) => value && typeof value === 'object' && !Array.isArray(value);
            const hasOwn = (key) => Object.prototype.hasOwnProperty.call(config, key);
            const metadata = hasOwn('metadata')
                ? config.metadata
                : node.metadata_prompt_source;
            const next = isRecord(metadata) ? cloneRunValue(metadata, {}) : {};
            if (isRecord(config.metadataPatch)) {
                Object.assign(next, cloneRunValue(config.metadataPatch, {}));
            }
            return { metadata_prompt_source: cloneRunValue(next, {}) };
        }

        function buildPresetGenerationConfigPatch(node, options) {
            if (!node || !['preset', 'classic'].includes(node.type)) return {};
            const config = options || {};
            const isRecord = (value) => value && typeof value === 'object' && !Array.isArray(value);
            const hasOwn = (key) => Object.prototype.hasOwnProperty.call(config, key);
            const base = hasOwn('generationConfig') ? config.generationConfig : node.generation_config;
            const generation = isRecord(base) ? cloneRunValue(base, {}) : {};
            generation.mode = generation.mode || 'preset_default';
            generation.defaults = isRecord(generation.defaults) ? cloneRunValue(generation.defaults, {}) : {};
            generation.overrides = isRecord(generation.overrides) ? cloneRunValue(generation.overrides, {}) : {};

            if (hasOwn('mode')) generation.mode = config.mode || 'preset_default';
            if (isRecord(config.defaultsPatch)) {
                Object.assign(generation.defaults, cloneRunValue(config.defaultsPatch, {}));
            }
            if (isRecord(config.overridesPatch)) {
                Object.assign(generation.overrides, cloneRunValue(config.overridesPatch, {}));
            }
            if (hasOwn('sourceNodeId')) generation.source_node_id = config.sourceNodeId ?? null;
            (Array.isArray(config.deleteDefaultKeys) ? config.deleteDefaultKeys : []).forEach((key) => {
                const name = String(key || '').trim();
                if (name) delete generation.defaults[name];
            });
            (Array.isArray(config.deleteOverrideKeys) ? config.deleteOverrideKeys : []).forEach((key) => {
                const name = String(key || '').trim();
                if (name) delete generation.overrides[name];
            });
            return { generation_config: cloneRunValue(generation, {}) };
        }

        function buildClassicNode(entry, world, options) {
            const opts = options || {};
            const source = entry || {};
            const position = world || { x: 0, y: 0 };
            const cleanName = normalizePresetName(source.name || source.display_name || 'classic');
            const params = {
                prompt: '',
                negative_prompt: '',
                seed_random: true,
                image_seed: 0,
                image_number: Number(source.default_image_number || 1) || 1,
                uov_method: 'Upscale (1.5x)',
                inpaint_mode: 'Inpaint or Outpaint (default)',
                inpaint_denoising_strength: 1.0,
                inpaint_respective_field: 0.618,
                inpaint_engine: null,
                inpaint_disable_initial_latent: false,
                invert_mask: false,
                inpaint_additional_prompt: '',
                outpaint_selections: [],
                enhance_uov_method: 'Disabled',
                enhance_uov_strength: 0.5,
                enhance_uov_processing_order: 'Before First Enhancement',
                enhance_uov_prompt_type: 'Original Prompts'
            };
            (enhanceRegionDefaults || [
                { prompt: 'face' },
                { prompt: 'hand' },
                { prompt: 'eye' }
            ]).forEach((region, index) => {
                const prefix = enhanceRegionKey(index);
                params[`${prefix}_enabled`] = true;
                params[`${prefix}_dino_prompt`] = region.prompt || '';
                params[`${prefix}_prompt`] = '';
                params[`${prefix}_negative_prompt`] = '';
                params[`${prefix}_mask_model`] = 'sam';
                params[`${prefix}_mask_cloth_category`] = 'full';
                params[`${prefix}_mask_sam_model`] = 'vit_b';
                params[`${prefix}_mask_text_threshold`] = 0.25;
                params[`${prefix}_mask_box_threshold`] = 0.3;
                params[`${prefix}_mask_sam_max_detections`] = 0;
                params[`${prefix}_inpaint_disable_initial_latent`] = false;
                params[`${prefix}_inpaint_engine`] = 'None';
                params[`${prefix}_inpaint_strength`] = 0.5;
                params[`${prefix}_inpaint_respective_field`] = 0.2;
                params[`${prefix}_inpaint_erode_or_dilate`] = 0;
                params[`${prefix}_mask_invert`] = false;
            });
            const uploadSlots = {};
            const defaultEngine = source.default_engine && typeof source.default_engine === 'object' ? source.default_engine : {};
            const backendParams = defaultEngine.backend_params && typeof defaultEngine.backend_params === 'object' ? defaultEngine.backend_params : {};
            const tempNode = {
                runtime: {
                    backend_engine: source.backend_engine || backendParams.backend_engine || '',
                    task_method: source.task_method || backendParams.task_method || ''
                }
            };
            const allowedIpTypes = getClassicIpTypes(tempNode);
            const defaultModels = source.models_config && typeof source.models_config === 'object' ? source.models_config : {};
            const defaultResolution = source.resolution_config && typeof source.resolution_config === 'object' ? source.resolution_config : {};
            const defaultGeneration = source.generation_config && typeof source.generation_config === 'object' ? source.generation_config : {};
            const promptDefaults = getPromptDefaults(source);
            const promptStyles = Array.isArray(promptDefaults.styles) ? promptDefaults.styles : [];
            if (promptDefaults.prompt) params.prompt = promptDefaults.prompt;
            if (defaultGeneration.image_number !== undefined) params.image_number = Number(defaultGeneration.image_number || params.image_number || 1) || 1;
            return {
                id: uid('classic'),
                type: 'classic',
                x: position.x,
                y: position.y,
                w: 380,
                h: 500,
                title: source.display_name || cleanName,
                classic_mode: 't2i',
                classic_ip_count: 1,
                preset: {
                    name: cleanName,
                    display_name: source.display_name || cleanName,
                    snapshot: {
                        default_styles: promptStyles.slice(),
                        default_prompt: promptDefaults.prompt || '',
                        default_prompt_negative: promptDefaults.negative_prompt || ''
                    }
                },
                runtime: {
                    backend_engine: source.backend_engine || backendParams.backend_engine || 'Current',
                    engine_type: source.engine_type || 'image',
                    task_method: source.task_method || backendParams.task_method || ''
                },
                models_config: { mode: 'preset_default', defaults: source.models_config || defaultModels || {}, overrides: {} },
                styles_config: { mode: 'preset_default', defaults: { style_selections: promptStyles.slice() }, overrides: {} },
                resolution_config: { mode: 'preset_default', defaults: source.resolution_config || defaultResolution || {}, overrides: {} },
                generation_config: { mode: 'preset_default', defaults: source.generation_config || defaultGeneration || {}, overrides: {} },
                model_requirements: {
                    model_list: Array.isArray(source.model_list) ? cloneRunValue(source.model_list, []) : [],
                    has_model_probe: !!source.has_model_probe
                },
                model_status: { state: 'unknown', missing_count: 0, message: 'Model availability not checked.' },
                upload_slots: uploadSlots,
                params,
                status: 'idle',
                collapsed: !!opts.collapsed,
                source: opts.source || undefined
            };
        }

        function buildPresetNode(entry, world, options) {
            const opts = options || {};
            const source = entry || {};
            const position = world || { x: 0, y: 0 };
            const cleanName = normalizePresetName(source.name || source.display_name || 'preset');
            const schema = source.schema && typeof source.schema === 'object' ? JSON.parse(JSON.stringify(source.schema)) : {};
            const themes = Array.isArray(schema.themes) ? schema.themes : [];
            const requestedTheme = opts.sceneTheme && themes.includes(opts.sceneTheme) ? opts.sceneTheme : '';
            const defaultTheme = requestedTheme || schema.default_theme || themes[0] || '';
            const perTheme = schema.per_theme && typeof schema.per_theme === 'object' ? schema.per_theme : {};
            const themeInfo = perTheme[defaultTheme] || {};
            const params = {};
            getVisiblePresetParams({ schema, runtime: { scene_theme: defaultTheme }, params: {} }).forEach((param) => {
                if (themeInfo.defaults && Object.prototype.hasOwnProperty.call(themeInfo.defaults, param.key)) {
                    params[param.key] = themeInfo.defaults[param.key];
                } else {
                    params[param.key] = param.default ?? '';
                }
            });
            const promptDefaults = getPromptDefaults(source);
            const promptStyles = Array.isArray(promptDefaults.styles) ? promptDefaults.styles : [];
            if (promptDefaults.prompt && Object.prototype.hasOwnProperty.call(params, 'prompt') && !String(params.prompt || '').trim()) {
                params.prompt = promptDefaults.prompt;
            }
            const uploadSlots = {};
            getVisibleUploadSlots({ schema }).forEach((slot) => {
                uploadSlots[slot.key] = null;
            });
            const modelList = Array.isArray(source.model_list) ? cloneRunValue(source.model_list, []) : [];
            const node = {
                id: uid('preset'),
                type: 'preset',
                x: position.x,
                y: position.y,
                w: 360,
                h: 420,
                title: source.display_name || cleanName,
                preset: {
                    name: cleanName,
                    display_name: source.display_name || cleanName,
                    snapshot_hash: null,
                    snapshot: {
                        default_styles: promptStyles.slice(),
                        default_prompt: promptDefaults.prompt || '',
                        default_prompt_negative: promptDefaults.negative_prompt || ''
                    }
                },
                runtime: {
                    backend_engine: source.backend_engine || 'Current',
                    engine_type: source.engine_type || 'image',
                    scene_frontend: source.scene ? 'scene' : '',
                    scene_theme: defaultTheme,
                    task_method: themeInfo.task_method || source.task_method || ''
                },
                schema,
                models_config: {
                    mode: 'preset_default',
                    defaults: source.models_config || {},
                    overrides: {}
                },
                styles_config: {
                    mode: 'preset_default',
                    defaults: { style_selections: promptStyles.slice() },
                    overrides: {}
                },
                resolution_config: {
                    mode: 'preset_default',
                    defaults: source.resolution_config || {},
                    overrides: {}
                },
                generation_config: {
                    mode: 'preset_default',
                    defaults: source.generation_config || {},
                    overrides: {}
                },
                model_requirements: {
                    model_list: modelList,
                    has_model_probe: !!source.has_model_probe,
                    source: source.source || ''
                },
                model_status: source.missing ? {
                    state: 'missing',
                    missing_count: null,
                    message: 'Preset is marked as missing models in the main preset list.'
                } : {
                    state: 'unknown',
                    missing_count: 0,
                    message: modelList.length ? 'Model requirements loaded; click to check.' : 'Model availability has not been checked.'
                },
                upload_slots: uploadSlots,
                params,
                status: 'idle',
                collapsed: !!opts.collapsed,
                source: opts.source || undefined
            };
            const specialKind = ensurePresetSpecialControllerState(node);
            if (specialKind) {
                Object.assign(node, buildPresetDefinitionPatch(node, {
                    w: Math.max(node.w || 0, 430),
                    h: Math.max(node.h || 0, 720)
                }));
            }
            return node;
        }

        function buildPresetModelCatalogStatus(entry, modelList) {
            const models = Array.isArray(modelList) ? modelList : [];
            return entry?.missing ? {
                state: 'missing',
                missing_count: null,
                message: 'Preset is marked as missing models in the main preset list.'
            } : {
                state: 'unknown',
                missing_count: 0,
                message: models.length ? 'Model requirements loaded; click to check.' : 'Model availability has not been checked.'
            };
        }

        function buildPresetModelCheckingStatus(message) {
            return {
                state: 'checking',
                message
            };
        }

        function buildPresetModelStatusPatch(node, options) {
            if (!node || !['preset', 'classic'].includes(node.type)) return {};
            const config = options || {};
            const hasOwn = (key) => Object.prototype.hasOwnProperty.call(config, key);
            const isRecord = (value) => value && typeof value === 'object' && !Array.isArray(value);
            const cloneRecord = (value) => isRecord(value) ? cloneRunValue(value, {}) : {};
            let status = cloneRecord(node.model_status);

            if (hasOwn('response')) {
                const response = config.response;
                if (response?.ok) {
                    const missingCount = Number(response.missing_count || 0);
                    let message = response.message || '';
                    if (response.model_config_gate) {
                        message = response.ready
                            ? t('Selected Models Config files are available.', '已选择的 Models Config 模型文件可用。')
                            : t('{count} selected Models Config file(s) are missing.', '已选择的 Models Config 缺少 {count} 个模型文件。').replace('{count}', missingCount);
                    } else if (response.ready) {
                        message = response.has_requirements
                            ? t('All required model files are available.', '所需模型文件已可用。')
                            : t('No missing models found for this preset.', '当前 preset 没有发现缺失模型。');
                    } else if (missingCount) {
                        message = t('{count} required model file(s) are missing.', '缺少 {count} 个所需模型文件。').replace('{count}', missingCount);
                    }
                    status = {
                        state: response.state || (response.ready ? 'ready' : 'missing'),
                        ready: !!response.ready,
                        has_requirements: !!response.has_requirements,
                        missing_count: missingCount,
                        missing_models: cloneRunValue(response.missing_models || [], []),
                        can_download: response.can_download !== false,
                        model_config_gate: !!response.model_config_gate,
                        selected_model_count: Number(response.selected_model_count || 0),
                        checked_preset: response.checked_preset || response.preset || node.preset?.name || '',
                        checked_at: response.checked_at || nowIso(),
                        message
                    };
                } else {
                    status = {
                        state: 'error',
                        ready: false,
                        missing_count: 0,
                        checked_at: nowIso(),
                        message: response?.details || response?.error || t('Model check failed.', '模型检查失败。')
                    };
                }
            } else if (hasOwn('status')) {
                status = cloneRecord(config.status);
            }

            if (isRecord(config.statusPatch)) Object.assign(status, cloneRunValue(config.statusPatch, {}));
            (Array.isArray(config.deleteKeys) ? config.deleteKeys : []).forEach((key) => {
                const name = String(key || '').trim();
                if (name) delete status[name];
            });
            return { model_status: cloneRunValue(status, {}) };
        }

        function applyPresetModelStatus(node, response) {
            if (!node || !['preset', 'classic'].includes(node.type)) return;
            Object.assign(node, buildPresetModelStatusPatch(node, { response }));
        }

        return {
            buildNodeParamsPatch,
            buildNodeStylePatch,
            applyNodeStylePatch,
            buildNodeLayoutPatch,
            applyNodeLayoutPatch,
            buildNodeFlagPatch,
            buildNodeFieldPatch,
            buildPresetUploadSlotPatch,
            buildClassicNodeStatePatch,
            buildPresetTextInputPatch,
            buildPresetStyleTransferPatch,
            buildPresetRuntimePatch,
            buildPresetWildcardPreviewPatch,
            buildPresetConfigPatch,
            buildPresetDefinitionPatch,
            applyPresetDefinitionPatch,
            buildPresetGenerationConfigPatch,
            buildPresetSnapshotPatch,
            buildGenerationMetadataPatch,
            buildClassicNode,
            buildPresetNode,
            buildPresetModelCatalogStatus,
            buildPresetModelCheckingStatus,
            buildPresetModelStatusPatch,
            applyPresetModelStatus
        };
    }

    window.SimpAICanvasWorkbenchNodeFactory = Object.assign({}, window.SimpAICanvasWorkbenchNodeFactory || {}, {
        createCanvasNodeFactoryController
    });
})();
