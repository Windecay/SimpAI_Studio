(function () {
    'use strict';

    function createCanvasConfigValuesController(context) {
        const scope = context?.configValuesSource || context || {};
        const catalogSource = scope.catalogSource || {};
        const configSource = scope.configSource || {};
        const styleSource = scope.styleSource || {};
        const resolutionSource = scope.resolutionSource || {};
        const classicSource = scope.classicSource || {};
        const serializationSource = scope.serializationSource || {};
        const call = (source, name, fallback, ...args) => typeof source[name] === 'function'
            ? source[name](...args) : fallback;
        const cloneRunValue = typeof serializationSource.cloneRunValue === 'function'
            ? serializationSource.cloneRunValue
            : (value, fallback) => JSON.parse(JSON.stringify(value ?? fallback));
        const normalizePresetName = name => call(catalogSource, 'normalizePresetName', '', name);
        const canvasAgentPresetPromptDefaults = node => call(styleSource, 'canvasAgentPresetPromptDefaults', { styles: [] }, node);
        const styleConfigSelectionFromValues = (values, fallback) =>
            call(styleSource, 'styleConfigSelectionFromValues', fallback, values, fallback);
        const configNumberValue = (values, keys, fallback) => call(configSource, 'configNumberValue', fallback, values, keys, fallback);
        const configTextValue = (values, keys, fallback) => call(configSource, 'configTextValue', fallback, values, keys, fallback);

        function getPresetCatalogEntryForNode(presetNode) {
            if (!presetNode || !['preset', 'classic'].includes(presetNode.type)) return null;
            const name = normalizePresetName(presetNode.preset?.name || presetNode.title || '');
            if (!name) return null;
            return call(catalogSource, 'getPresetCatalog', [])
                .find(entry => normalizePresetName(entry.name || '') === name) || null;
        }

        function getPresetConfigSource(presetNode, kind) {
            const configKey = call(configSource, 'configKeyForKind', '', kind);
            const existing = presetNode?.[configKey] && typeof presetNode[configKey] === 'object'
                ? cloneRunValue(presetNode[configKey], {})
                : { defaults: {}, overrides: {} };
            const entry = getPresetCatalogEntryForNode(presetNode);
            const catalogDefaults = entry?.[configKey];
            if (catalogDefaults && typeof catalogDefaults === 'object') {
                const hasDefaults = existing.defaults && typeof existing.defaults === 'object' && Object.keys(existing.defaults).length > 0;
                existing.defaults = hasDefaults ? Object.assign({}, catalogDefaults, existing.defaults) : cloneRunValue(catalogDefaults, {});
            }
            if (kind === 'styles') {
                existing.defaults = existing.defaults && typeof existing.defaults === 'object' ? existing.defaults : {};
                const promptDefaults = canvasAgentPresetPromptDefaults(presetNode);
                const hasStyleDefaults = call(styleSource, 'firstStyleConfigValue', undefined, existing.defaults) !== undefined;
                if (!hasStyleDefaults) {
                    existing.defaults = Object.assign({}, existing.defaults, { style_selections: promptDefaults.styles.slice() });
                }
            }
            existing.overrides = existing.overrides && typeof existing.overrides === 'object' ? existing.overrides : {};
            return existing;
        }

        function normalizeInitialConfigLoras(defaults, overrides) {
            const defaultLoras = Array.isArray(defaults?.loras) ? defaults.loras : [];
            const overrideLoras = Array.isArray(overrides?.loras) ? overrides.loras : [];
            return Array.from({ length: 10 }, (_, index) => {
                const source = overrideLoras[index] || defaultLoras[index] || {};
                const model = source.model || 'None';
                return { enabled: source.enabled !== undefined ? !!source.enabled : true, model, weight: source.weight ?? 1 };
            });
        }

        function buildInitialConfigValues(kind, sourceConfig, presetNode, detectionIndex) {
            const defaults = sourceConfig.defaults || {};
            const overrides = sourceConfig.overrides || {};
            if (kind === 'resolution') {
                const choices = call(resolutionSource, 'getResolutionChoices', { ratios: {} });
                const profile = call(resolutionSource, 'normalizeResolutionProfile', {}, defaults);
                const profileRatios = Array.isArray(profile.aspect_ratios) ? profile.aspect_ratios : [];
                const template = profile.mode
                    ? 'Preset'
                    : call(resolutionSource, 'normalizeResolutionTemplateName', '',
                        overrides.template || defaults.template || defaults.default_template || defaults.available_aspect_ratios_selection,
                        choices);
                const templateRatios = template === 'Preset'
                    ? profileRatios
                    : (choices.ratios[template] || choices.flatRatios || []);
                const aspectRatio = overrides.aspect_ratio || defaults.aspect_ratio || defaults.default_aspect_ratio
                    || templateRatios[0] || profileRatios[0] || '';
                const sourceSize = call(resolutionSource, 'getResolutionSourceSize', null, presetNode, profile);
                const baseValues = {
                    profile,
                    source_size: sourceSize,
                    aspect_ratio: aspectRatio,
                    quantize: Number(overrides.quantize || defaults.quantize || profile.quantize || defaults.default_resolution_quantize_step || 8),
                    multiplier: Number(overrides.multiplier || defaults.multiplier || defaults.default_resolution_multiplier || 1),
                    edit_mode: overrides.edit_mode || defaults.edit_mode || defaults.default_resolution_edit_mode || 'scale'
                };
                const baseDims = call(resolutionSource, 'resolveResolutionBaseDims', {}, baseValues, templateRatios);
                return Object.assign({
                    template,
                    aspect_ratio: aspectRatio,
                    width: -1,
                    height: -1,
                    quantize: baseValues.quantize,
                    multiplier: baseValues.multiplier,
                    edit_mode: baseValues.edit_mode,
                    random_aspect_ratio: false,
                    ratio_lock: false,
                    ratio_lock_value: 'current',
                    ratio_lock_custom: '1:1'
                }, defaults, { width: baseDims.width, height: baseDims.height }, overrides);
            }
            if (kind === 'detection') {
                return Object.assign(
                    call(classicSource, 'getClassicEnhanceRegionValues', {},
                        presetNode, Number.isFinite(detectionIndex) ? detectionIndex : 0, defaults),
                    overrides
                );
            }
            if (kind === 'styles') {
                const promptDefaults = canvasAgentPresetPromptDefaults(presetNode);
                const defaultSelection = styleConfigSelectionFromValues(defaults, promptDefaults.styles);
                const selection = styleConfigSelectionFromValues(overrides, defaultSelection);
                return Object.assign({}, defaults, overrides, { style_selections: selection });
            }
            if (kind === 'advanced') {
                const merged = Object.assign({}, defaults, overrides);
                return Object.assign({}, defaults, overrides, {
                    guidance_scale: configNumberValue(merged, ['guidance_scale', 'cfg_scale', 'default_cfg_scale'], 4),
                    overwrite_step: configNumberValue(merged, ['overwrite_step', 'steps', 'default_overwrite_step'], -1),
                    sampler_name: configTextValue(merged, ['sampler_name', 'sampler', 'default_sampler'], 'dpmpp_2m_sde_gpu'),
                    scheduler_name: configTextValue(merged, ['scheduler_name', 'scheduler', 'default_scheduler'], 'karras')
                });
            }
            return Object.assign({
                base_model: defaults.base_model || '',
                refiner_model: defaults.refiner_model || 'None',
                clip_model: defaults.clip_model || 'Default (model)',
                vae: defaults.vae || 'Default (model)',
                upscale_model: defaults.upscale_model || 'default',
                loras: normalizeInitialConfigLoras(defaults, overrides)
            }, overrides, { loras: normalizeInitialConfigLoras(defaults, overrides) });
        }

        return { getPresetCatalogEntryForNode, getPresetConfigSource, normalizeInitialConfigLoras, buildInitialConfigValues };
    }

    window.SimpAICanvasWorkbenchConfigValues = Object.assign(
        {}, window.SimpAICanvasWorkbenchConfigValues || {}, { createCanvasConfigValuesController }
    );
})();
