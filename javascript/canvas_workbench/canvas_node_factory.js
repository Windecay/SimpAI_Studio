(function () {
    'use strict';

    function createCanvasNodeFactoryController(context) {
        const scope = context || {};
        const cloneRunValue = typeof scope.cloneRunValue === 'function'
            ? scope.cloneRunValue
            : (value, fallback) => value === undefined ? fallback : JSON.parse(JSON.stringify(value));
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
                node.w = Math.max(node.w || 0, 430);
                node.h = Math.max(node.h || 0, 720);
            }
            return node;
        }

        return { buildClassicNode, buildPresetNode };
    }

    window.SimpAICanvasWorkbenchNodeFactory = Object.assign({}, window.SimpAICanvasWorkbenchNodeFactory || {}, {
        createCanvasNodeFactoryController
    });
})();
