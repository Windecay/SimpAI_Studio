(function () {
    'use strict';

    function createCanvasConfigValuesController(context) {
        const scope = context?.configValuesSource || context || {};
        const catalogSource = scope.catalogSource || {};
        const configSource = scope.configSource || {};
        const styleSource = scope.styleSource || {};
        const resolutionSource = scope.resolutionSource || {};
        const classicSource = scope.classicSource || {};
        const nodeSource = scope.nodeSource || {};
        const utilitySource = scope.utilitySource || {};
        const patchSource = scope.patchSource || {};
        const serializationSource = scope.serializationSource || {};
        const call = (source, name, fallback, ...args) => typeof source[name] === 'function'
            ? source[name](...args) : fallback;
        const cloneRunValue = typeof serializationSource.cloneRunValue === 'function'
            ? serializationSource.cloneRunValue
            : (value, fallback) => JSON.parse(JSON.stringify(value ?? fallback));
        const normalizePresetName = name => call(catalogSource, 'normalizePresetName', '', name);
        const canvasAgentPresetPromptDefaults = node => call(styleSource, 'canvasAgentPresetPromptDefaults', { styles: [] }, node);
        const clampValue = (value, min, max) => call(utilitySource, 'clamp', Math.max(min, Math.min(max, value)), value, min, max);
        const slotOrder = Array.isArray(configSource.slotOrder) ? configSource.slotOrder : [];
        const slotLabels = configSource.slotLabels && typeof configSource.slotLabels === 'object' ? configSource.slotLabels : {};
        const presetConfigKinds = Array.isArray(configSource.presetConfigKinds) ? configSource.presetConfigKinds : [];

        function isPresetConfigKind(kind) {
            return presetConfigKinds.includes(String(kind || ''));
        }

        function configKeyForKind(kind) {
            if (kind === 'styles') return 'styles_config';
            if (kind === 'resolution') return 'resolution_config';
            if (kind === 'advanced') return 'generation_config';
            return 'models_config';
        }

        function getPresetSchema(node) {
            return (node && node.schema && typeof node.schema === 'object') ? node.schema : {};
        }

        function getPresetTheme(node) {
            const schema = getPresetSchema(node);
            const themes = Array.isArray(schema.themes) ? schema.themes : [];
            return node?.runtime?.scene_theme || schema.default_theme || themes[0] || '';
        }

        function getPresetThemeInfo(node) {
            const schema = getPresetSchema(node);
            const theme = getPresetTheme(node);
            const perTheme = schema.per_theme && typeof schema.per_theme === 'object' ? schema.per_theme : {};
            return perTheme[theme] || {};
        }

        function getVisibleUploadSlots(node) {
            const schema = getPresetSchema(node);
            const slots = Array.isArray(schema.upload_slots) && schema.upload_slots.length
                ? schema.upload_slots
                : slotOrder.map(key => ({ key, label: slotLabels[key], visible: true, interactive: true }));
            return slots
                .filter(slot => slot && slot.visible !== false)
                .sort((a, b) => {
                    const ai = slotOrder.indexOf(a.key);
                    const bi = slotOrder.indexOf(b.key);
                    return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
                });
        }

        function getSlotLabel(node, slotKey) {
            const visible = node?.type === 'classic' ? getVisibleClassicUploadSlots(node) : getVisibleUploadSlots(node);
            const slot = visible.find(item => item.key === slotKey);
            return slot?.label || slotLabels[slotKey] || slotKey || 'upload';
        }

        function configAliasValue(source, keys) {
            const data = source && typeof source === 'object' ? source : {};
            for (const key of keys || []) {
                if (!Object.prototype.hasOwnProperty.call(data, key)) continue;
                const value = data[key];
                if (value === undefined || value === null) continue;
                if (typeof value === 'string' && !value.trim()) continue;
                return value;
            }
            return undefined;
        }

        function configNumberValue(source, keys, fallback) {
            const value = configAliasValue(source, keys);
            const number = Number(value);
            return Number.isFinite(number) ? number : fallback;
        }

        function boundedConfigNumberValue(source, keys, fallback, bounds) {
            const value = configNumberValue(source, keys, fallback);
            const min = Number(bounds?.min);
            const max = Number(bounds?.max);
            let next = value;
            if (Number.isFinite(min) && next < min) next = min;
            if (Number.isFinite(max) && next > max) next = max;
            return next;
        }

        function configTextValue(source, keys, fallback) {
            const value = configAliasValue(source, keys);
            return value === undefined ? fallback : String(value);
        }

        function mergeChoices(items) {
            const merged = [];
            (items || []).forEach((item) => {
                const text = String(item || '').trim();
                if (text && !merged.includes(text)) merged.push(text);
            });
            return merged;
        }

        function getResolutionPayload() {
            const widget = call(resolutionSource, 'getDocument', null)
                ?.querySelector?.('.simpai-resolution-control script[data-role="resolution-data"]');
            if (!widget) return {};
            try {
                return JSON.parse(widget.textContent || '{}') || {};
            } catch (err) {
                return {};
            }
        }

        function getResolutionChoices() {
            const payload = getResolutionPayload();
            const payloadRatios = payload.ratios && typeof payload.ratios === 'object' ? payload.ratios : {};
            const fallbacks = resolutionSource.ratioFallbacks || {};
            const ratios = Object.keys(payloadRatios).length ? payloadRatios : fallbacks;
            const templates = Object.keys(ratios);
            const defaultTemplate = String(payload.defaultTemplate || '').trim();
            const firstTemplate = (defaultTemplate && templates.includes(defaultTemplate)) ? defaultTemplate : (templates.includes('SDXL') ? 'SDXL' : (templates[0] || 'SDXL'));
            const flatRatios = [];
            Object.values(ratios).forEach((items) => {
                if (Array.isArray(items)) items.forEach(item => { if (!flatRatios.includes(item)) flatRatios.push(item); });
            });
            return {
                templates: templates.length ? templates : Object.keys(fallbacks),
                ratios,
                firstTemplate,
                flatRatios: flatRatios.length ? flatRatios : ['1024*1024', '832*1216', '1216*832'],
                quantizeSteps: Array.isArray(payload.quantizeSteps) ? payload.quantizeSteps : [1, 8, 16, 32, 64],
                editModes: mergeChoices(['proportional', 'crop', 'scale', 'pad', ...(Array.isArray(payload.editModes) ? payload.editModes : [])])
            };
        }

        function normalizeResolutionTemplateName(value, choices) {
            const text = String(value || '').trim();
            if (text.toLowerCase() === 'preset') return 'Preset';
            const templates = choices && Array.isArray(choices.templates) ? choices.templates : Object.keys(resolutionSource.ratioFallbacks || {});
            if (text && templates.includes(text)) return text;
            const lower = text.toLowerCase();
            const matched = templates.find(item => String(item || '').toLowerCase() === lower);
            if (matched) return matched;
            return choices?.firstTemplate || (templates.includes('SDXL') ? 'SDXL' : (templates[0] || 'SDXL'));
        }

        function getResolutionTargetPreset(configNode) {
            if (!configNode || configNode.type !== 'config' || configNode.config_kind !== 'resolution') return null;
            const project = call(nodeSource, 'getProject', { edges: [] });
            const edge = project.edges.find(item => item.type === 'config' && item.from === configNode.id && item.slot === 'resolution');
            return edge ? call(nodeSource, 'getNode', null, edge.to) : call(nodeSource, 'getNode', null, configNode.target_preset_id);
        }

        function getResolutionRenderValues(configNode) {
            const raw = cloneRunValue(configNode?.config?.values || {}, {});
            const preset = getResolutionTargetPreset(configNode);
            const sourceConfig = preset ? getPresetConfigSource(preset, 'resolution') : null;
            const defaults = sourceConfig?.defaults && Object.keys(sourceConfig.defaults).length
                ? cloneRunValue(sourceConfig.defaults, {})
                : cloneRunValue(configNode?.config?.defaults || {}, {});
            const profile = normalizeResolutionProfile(defaults);
            const sourceSize = getResolutionSourceSize(preset, profile);
            raw.profile = profile;
            raw.defaults = defaults;
            if (!raw.template) {
                raw.template = profile.mode
                    ? 'Preset'
                    : normalizeResolutionTemplateName(defaults.template || defaults.default_template || defaults.available_aspect_ratios_selection, getResolutionChoices());
            }
            if (sourceSize) raw.source_size = sourceSize;
            if (!raw.aspect_ratio) {
                const choices = getResolutionChoices();
                const template = normalizeResolutionTemplateName(
                    raw.template || defaults.template || defaults.default_template || defaults.available_aspect_ratios_selection,
                    choices
                );
                const templateRatios = template === 'Preset'
                    ? (Array.isArray(profile.aspect_ratios) ? profile.aspect_ratios : [])
                    : (choices.ratios[template] || choices.flatRatios || []);
                if (Array.isArray(templateRatios) && templateRatios.length) raw.aspect_ratio = templateRatios[0];
            }
            return raw;
        }

        function resolveClassicInpaintTaskMethod(node) {
            const engines = call(classicSource, 'getClassicInpaintEngines', {}) || {};
            const runtime = node?.runtime || {};
            const preset = node?.preset || {};
            const candidates = [
                runtime.task_method,
                runtime.backend_params?.task_method,
                preset.task_method,
                node?.task_method
            ].map(item => String(item || '').trim()).filter(Boolean);
            const direct = candidates.find(item => engines[item]);
            if (direct) return direct;
            const taskText = candidates.join(' ').toLowerCase();
            const backend = String(runtime.backend_engine || preset.backend_engine || '').trim().toLowerCase();
            if (taskText.includes('z_image') || taskText.includes('z-image') || backend === 'z-image' || backend === 'zimage') return 'z_image_turbo_aio_cn';
            if (taskText.includes('wan') || backend === 'wan') return 'wan_aio_cn';
            if (taskText.includes('qwen') || backend === 'qwen') return 'qwen_aio_cn';
            if (taskText.includes('flux') || backend === 'flux') return 'flux_aio';
            if (backend === 'comfy' || backend === 'sdxl' || backend === 'fooocus') return 'SDXL';
            return 'SDXL';
        }

        function getClassicIpMaxImages(node) {
            const maxImages = call(classicSource, 'getClassicIpMaxImages', 4);
            return resolveClassicInpaintTaskMethod(node) === 'krea2_aio_cn' ? 1 : (maxImages || 4);
        }

        function getClassicIpCount(node) {
            return clampValue(Number(node?.classic_ip_count || 1), 1, getClassicIpMaxImages(node));
        }

        function getVisibleClassicUploadSlots(node) {
            const mode = node?.classic_mode || 't2i';
            const slots = [];
            if (mode === 'ip') {
                const count = getClassicIpCount(node);
                for (let i = 0; i < count; i++) {
                    slots.push({ key: `ip_image_${i}`, label: `IP Image ${i + 1}` });
                }
            } else if (mode === 'uov') {
                slots.push({ key: 'uov_image', label: 'Source Image' });
            } else if (mode === 'inpaint') {
                slots.push({ key: 'inpaint_image', label: 'Source Image' });
                slots.push({ key: 'inpaint_mask', label: 'Mask' });
            } else if (mode === 'enhance') {
                slots.push({ key: 'enhance_image', label: 'Source Image' });
            }
            return slots;
        }

        function getClassicIpTypes(node) {
            const allTypes = call(classicSource, 'getClassicIpControlTypes', null)
                || ['ImagePrompt', 'PyraCanny', 'Depth', 'FaceSwap', 'OpenPose'];
            const filters = call(classicSource, 'getClassicIpFilters', {}) || {};
            const engine = String(node?.runtime?.backend_engine || '').toLowerCase();
            const taskMethod = resolveClassicInpaintTaskMethod(node);
            if (taskMethod === 'krea2_aio_cn') return filters.krea2 || ['Depth', 'OpenPose'];
            if (['wan', 'qwen', 'z-image'].includes(engine) || engine === 'zimage') {
                return filters.wan_qwen_zimage || allTypes.slice(1, 3).concat(allTypes.slice(-1));
            }
            if (['il_v_pre_aio', 'chenkin_noob_aio'].includes(taskMethod)) {
                return filters.il_v_pre || allTypes.slice(0, 3).concat(allTypes.slice(-1));
            }
            return filters.default || allTypes;
        }

        function getClassicUovMethods(node) {
            const engine = String(node?.runtime?.backend_engine || '').toLowerCase();
            const fallback = call(classicSource, 'getClassicUovMethods', []);
            if (engine === 'flux') return call(classicSource, 'getClassicUovMethodsFlux', null) || fallback || [];
            return call(classicSource, 'getClassicUovMethodsDefault', null) || fallback || [];
        }

        function getClassicInpaintEngines(node) {
            const engines = call(classicSource, 'getClassicInpaintEngines', {}) || {};
            const taskMethod = resolveClassicInpaintTaskMethod(node);
            return engines[taskMethod] || engines.SDXL || ['v2.6', 'v2.5', 'None'];
        }

        function normalizeClassicInpaintMode(mode) {
            const modes = call(classicSource, 'getClassicInpaintMethods', null) || [
                'Inpaint or Outpaint (default)',
                'Improve Detail (face, hand, eyes, etc.)',
                'Modify Content (add objects, change background, etc.)'
            ];
            const raw = String(mode || modes[0] || '');
            if (modes.includes(raw)) return raw;
            if (raw.startsWith('Improve Detail')) return modes.find(item => item.startsWith('Improve Detail')) || raw;
            if (raw.startsWith('Modify Content')) return modes.find(item => item.startsWith('Modify Content')) || raw;
            if (raw.startsWith('Inpaint or Outpaint')) return modes.find(item => item.startsWith('Inpaint or Outpaint')) || raw;
            return modes[0] || raw;
        }

        function getInpaintModeDefaults(mode, node) {
            const normalizedMode = normalizeClassicInpaintMode(mode);
            const engines = getClassicInpaintEngines(node);
            const defaultEngine = engines[0] || 'None';
            if (normalizedMode.startsWith('Improve Detail')) {
                return { denoise: 0.5, respective: 0.2, engine: 'None', disableLatent: false, showOutpaint: false, showAdditionalPrompt: true };
            }
            if (normalizedMode.startsWith('Modify Content')) {
                return { denoise: 1.0, respective: 0.2, engine: defaultEngine, disableLatent: true, showOutpaint: false, showAdditionalPrompt: true };
            }
            return { denoise: 1.0, respective: 0.618, engine: defaultEngine, disableLatent: false, showOutpaint: true, showAdditionalPrompt: false };
        }

        function canvasBoolValue(value, fallback) {
            if (value === undefined || value === null || value === '') return !!fallback;
            if (value === true || value === 1 || value === '1') return true;
            if (value === false || value === 0 || value === '0') return false;
            const text = String(value).trim().toLowerCase();
            if (['true', 'yes', 'on', 'enabled'].includes(text)) return true;
            if (['false', 'no', 'off', 'disabled', 'none'].includes(text)) return false;
            return !!value;
        }

        function enhanceRegionKey(index) {
            return `enhance_region_${Number(index) + 1}`;
        }

        function detectionSlotForRegion(index) {
            return `detection_${Number(index)}`;
        }

        function parseDetectionSlot(slot) {
            const match = String(slot || '').match(/^detection_(\d+)$/);
            if (!match) return -1;
            const index = Number(match[1]);
            return Number.isFinite(index) ? index : -1;
        }

        function getClassicEnhanceRegionDefault(index) {
            const defaults = call(classicSource, 'getClassicEnhanceRegionDefaults', null);
            return (Array.isArray(defaults) ? defaults[index] : null) || { label: `Region ${index + 1}`, prompt: '' };
        }

        function getClassicEnhanceRegionValues(node, index, sourceValues) {
            const params = node?.params || {};
            const base = sourceValues || {};
            const preset = getClassicEnhanceRegionDefault(index);
            const prefix = enhanceRegionKey(index);
            const read = (key, fallback) => {
                if (Object.prototype.hasOwnProperty.call(base, key)) return base[key];
                const fullKey = `${prefix}_${key}`;
                if (Object.prototype.hasOwnProperty.call(params, fullKey)) return params[fullKey];
                return fallback;
            };
            return {
                enabled: canvasBoolValue(read('enabled', true), true),
                dino_prompt: read('dino_prompt', preset.prompt || ''),
                prompt: read('prompt', ''),
                negative_prompt: read('negative_prompt', ''),
                mask_model: read('mask_model', 'sam'),
                mask_cloth_category: read('mask_cloth_category', 'full'),
                mask_sam_model: read('mask_sam_model', 'vit_b'),
                mask_text_threshold: Number(read('mask_text_threshold', 0.25)),
                mask_box_threshold: Number(read('mask_box_threshold', 0.3)),
                mask_sam_max_detections: Number(read('mask_sam_max_detections', 0)),
                inpaint_disable_initial_latent: canvasBoolValue(read('inpaint_disable_initial_latent', false), false),
                inpaint_engine: read('inpaint_engine', 'None'),
                inpaint_strength: Number(read('inpaint_strength', 0.5)),
                inpaint_respective_field: Number(read('inpaint_respective_field', 0.2)),
                inpaint_erode_or_dilate: Number(read('inpaint_erode_or_dilate', 0)),
                mask_invert: canvasBoolValue(read('mask_invert', false), false)
            };
        }

        function applyClassicEnhanceRegionValues(node, index, values, sourceNodeId) {
            if (!node || node.type !== 'classic') return;
            const prefix = enhanceRegionKey(index);
            const region = getClassicEnhanceRegionValues(node, index, values);
            const paramsPatch = {
                [`${prefix}_enabled`]: region.enabled,
                [`${prefix}_dino_prompt`]: region.dino_prompt,
                [`${prefix}_prompt`]: region.prompt,
                [`${prefix}_negative_prompt`]: region.negative_prompt,
                [`${prefix}_mask_model`]: region.mask_model,
                [`${prefix}_mask_cloth_category`]: region.mask_cloth_category,
                [`${prefix}_mask_sam_model`]: region.mask_sam_model,
                [`${prefix}_mask_text_threshold`]: region.mask_text_threshold,
                [`${prefix}_mask_box_threshold`]: region.mask_box_threshold,
                [`${prefix}_mask_sam_max_detections`]: region.mask_sam_max_detections,
                [`${prefix}_inpaint_disable_initial_latent`]: region.inpaint_disable_initial_latent,
                [`${prefix}_inpaint_engine`]: region.inpaint_engine,
                [`${prefix}_inpaint_strength`]: region.inpaint_strength,
                [`${prefix}_inpaint_respective_field`]: region.inpaint_respective_field,
                [`${prefix}_inpaint_erode_or_dilate`]: region.inpaint_erode_or_dilate,
                [`${prefix}_mask_invert`]: region.mask_invert
            };
            Object.assign(node, call(patchSource, 'buildNodeParamsPatch', {}, node, { paramsPatch }));
            Object.assign(node, call(patchSource, 'buildClassicNodeStatePatch', {}, node, {
                enhanceDetectionConfigsPatch: { [String(index)]: sourceNodeId || null }
            }));
        }

        function getDetectionChoices() {
            return {
                maskModels: call(classicSource, 'getClassicEnhanceMaskModels', null)
                    || ['u2net', 'u2netp', 'u2net_human_seg', 'u2net_cloth_seg', 'silueta', 'isnet-general-use', 'isnet-anime', 'sam'],
                clothCategories: call(classicSource, 'getClassicEnhanceClothCategories', null) || ['full', 'upper', 'lower'],
                samModels: call(classicSource, 'getClassicEnhanceSamModels', null) || ['vit_b', 'vit_l', 'vit_h']
            };
        }

        function getDetectionConfigLabel(index) {
            const preset = getClassicEnhanceRegionDefault(index);
            return `${preset.label || `Region ${index + 1}`} Detection`;
        }


        function normalizeStyleSelections(value) {
            if (Array.isArray(value)) return value.map(item => String(item || '').trim()).filter(Boolean);
            const text = String(value || '').trim();
            if (!text) return [];
            try {
                const parsed = JSON.parse(text.replace(/'/g, '"'));
                if (Array.isArray(parsed)) return normalizeStyleSelections(parsed);
            } catch (err) {}
            return text
                .split(',')
                .map(item => item.trim().replace(/^[\[\]'"]+|[\]\]'"]+$/g, ''))
                .filter(Boolean);
        }

        function firstStyleConfigValue(source) {
            const data = source && typeof source === 'object' ? source : {};
            for (const key of ['style_selections', 'styles', 'default_styles']) {
                if (Object.prototype.hasOwnProperty.call(data, key)) return data[key];
            }
            return undefined;
        }

        function styleConfigSelectionFromValues(values, fallback) {
            const raw = firstStyleConfigValue(values);
            return raw === undefined ? normalizeStyleSelections(fallback) : normalizeStyleSelections(raw);
        }

        function getPresetCatalogEntryForNode(presetNode) {
            if (!presetNode || !['preset', 'classic'].includes(presetNode.type)) return null;
            const name = normalizePresetName(presetNode.preset?.name || presetNode.title || '');
            if (!name) return null;
            return call(catalogSource, 'getPresetCatalog', [])
                .find(entry => normalizePresetName(entry.name || '') === name) || null;
        }

        function getPresetConfigSource(presetNode, kind) {
            const configKey = configKeyForKind(kind);
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
                const hasStyleDefaults = firstStyleConfigValue(existing.defaults) !== undefined;
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

        function resolutionGcd(a, b) {
            let x = Math.abs(Math.round(Number(a) || 0));
            let y = Math.abs(Math.round(Number(b) || 0));
            while (y) {
                const next = x % y;
                x = y;
                y = next;
            }
            return x || 1;
        }

        function resolutionRatioLabel(width, height) {
            const w = Math.max(1, Math.round(Number(width) || 1));
            const h = Math.max(1, Math.round(Number(height) || 1));
            const divisor = resolutionGcd(w, h);
            return `${Math.round(w / divisor)}:${Math.round(h / divisor)}`;
        }

        function resolutionUsesManualSize(values) {
            return values && values.manual !== false && Number(values.width) > 0 && Number(values.height) > 0;
        }

        function resolutionManualSizeLabel(values, preview) {
            if (!resolutionUsesManualSize(values)) return '';
            const width = Math.round(Number(preview?.width || values.width) || 0);
            const height = Math.round(Number(preview?.height || values.height) || 0);
            if (width <= 0 || height <= 0) return '';
            return `Custom ${width}×${height} | ${resolutionRatioLabel(width, height)}`;
        }

        function parseResolutionRatio(value) {
            const text = String(value || '').trim();
            const pipeHead = text.split('|', 1)[0].trim();
            const pipeKind = pipeHead.toLowerCase().replace(/[\s-]+/g, '_');
            if (['origin', 'original', 'source', 'no_resize', 'noresize'].includes(pipeKind)) {
                return { w: 0, h: 0, origin: true };
            }
            const size = pipeHead.match(/(\d+)\s*[*x×]\s*(\d+)/i) || text.match(/(\d+)\s*[*x×]\s*(\d+)/i);
            if (size) {
                const w = Number(size[1]);
                const h = Number(size[2]);
                if (w > 0 && h > 0) return { w, h };
            }
            const area = /^\d+$/.test(pipeHead) ? Number.parseInt(pipeHead, 10) : 0;
            if (area > 0 && text.includes('|')) {
                return { w: area, h: area, area };
            }
            const ratio = text.match(/(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)/);
            if (ratio) {
                const w = Number(ratio[1]);
                const h = Number(ratio[2]);
                if (w > 0 && h > 0) return { w, h };
            }
            return { w: 1, h: 1 };
        }

        function quantizeResolutionValue(value, step) {
            const q = Math.max(1, Number(step) || 1);
            return Math.max(q, Math.round((Number(value) || 0) / q) * q);
        }

        function normalizeResolutionProfile(defaults) {
            const source = defaults && typeof defaults === 'object' ? defaults : {};
            const profile = source.mode
                ? cloneRunValue(source, {})
                : source.resolution_control && typeof source.resolution_control === 'object'
                ? cloneRunValue(source.resolution_control, {})
                : {};
            const aspectRatios = Array.isArray(profile.aspect_ratios) && profile.aspect_ratios.length
                ? profile.aspect_ratios
                : (Array.isArray(source.aspect_ratios) ? source.aspect_ratios : []);
            if (aspectRatios.length) profile.aspect_ratios = aspectRatios.map(item => String(item));
            profile.mode = String(profile.mode || '').trim();
            profile.source = profile.source || 'scene_canvas_image';
            const defaultWidth = Number(source.default_overwrite_width || 0) > 0 ? Number(source.default_overwrite_width) : 0;
            const defaultHeight = Number(source.default_overwrite_height || 0) > 0 ? Number(source.default_overwrite_height) : 0;
            profile.base_width = Math.max(1, Number(profile.base_width || 0) || defaultWidth || 1024);
            profile.base_height = Math.max(1, Number(profile.base_height || 0) || defaultHeight || 1024);
            profile.quantize = Math.max(1, Number(profile.quantize || source.default_resolution_quantize_step || 8) || 8);
            profile.interactive = profile.interactive !== false;
            return profile;
        }

        function projectKeepInputArea(sourceSize, baseWidth, baseHeight, step) {
            const srcW = Math.max(1, Number(sourceSize?.width) || 1);
            const srcH = Math.max(1, Number(sourceSize?.height) || 1);
            const area = Math.max(1, Number(baseWidth || 640) * Number(baseHeight || 640));
            const ratio = srcW / srcH;
            return {
                width: quantizeResolutionValue(Math.sqrt(area * ratio), step),
                height: quantizeResolutionValue(Math.sqrt(area / ratio), step)
            };
        }

        function resolveResolutionBaseDims(values, ratios) {
            const profile = normalizeResolutionProfile(values?.profile || values?.defaults || {});
            const selected = values.aspect_ratio || (Array.isArray(ratios) ? ratios[0] : '') || values.default_aspect_ratio || '1024*1024';
            const parsed = parseResolutionRatio(selected);
            const sourceSize = values.source_size || null;
            if (parsed.origin && sourceSize?.width > 0 && sourceSize?.height > 0) {
                return { width: sourceSize.width, height: sourceSize.height };
            }
            if (['image_keep_input_area', 'video_keep_input_area'].includes(profile.mode)) {
                const base = parsed.area ? { width: parsed.w, height: parsed.h } : { width: profile.base_width, height: profile.base_height };
                return sourceSize
                    ? projectKeepInputArea(sourceSize, base.width, base.height, values.quantize || profile.quantize || 8)
                    : { width: base.width, height: base.height };
            }
            if (values.manual !== false && Number(values.width) > 0 && Number(values.height) > 0) {
                return { width: Number(values.width), height: Number(values.height) };
            }
            return { width: parsed.w || profile.base_width || 1024, height: parsed.h || profile.base_height || 1024 };
        }

        function getResolutionPreview(values, ratios) {
            const dims = resolveResolutionBaseDims(values || {}, ratios);
            const multiplier = clampValue(Number(values.multiplier || 1) || 1, 1, 2);
            const step = Math.max(1, Number(values.quantize || 8) || 8);
            const width = Math.max(1, Number(dims.width) || 1);
            const height = Math.max(1, Number(dims.height) || 1);
            const effectiveW = quantizeResolutionValue(width * multiplier, step);
            const effectiveH = quantizeResolutionValue(height * multiplier, step);
            const scale = Math.min(1, 140 / Math.max(effectiveW, effectiveH));
            return {
                boxW: clampValue((effectiveW * scale / 140) * 88, 12, 88),
                boxH: clampValue((effectiveH * scale / 140) * 88, 12, 88),
                label: `${Math.round(effectiveW)}×${Math.round(effectiveH)}`,
                baseLabel: `${Math.round(width)}×${Math.round(height)}`,
                effectiveW,
                effectiveH,
                width,
                height
            };
        }

        function getResolutionSourceSize(presetNode, profile) {
            if (!presetNode || presetNode.type !== 'preset') return null;
            const aliases = {
                scene_canvas: ['scene_canvas_image'],
                scene_canvas_image: ['scene_canvas_image'],
                scene_input_image1: ['scene_input_image1'],
                scene_input_image2: ['scene_input_image2'],
                scene_input_image3: ['scene_input_image3'],
                scene_input_image4: ['scene_input_image4'],
                scene_input_image5: ['scene_input_image5'],
                scene_input_image6: ['scene_input_image6'],
                scene_input_image7: ['scene_input_image7'],
                scene_input_image8: ['scene_input_image8'],
                image_1: ['scene_canvas_image'],
                image_2: ['scene_input_image1'],
                image_3: ['scene_input_image2'],
                image_4: ['scene_input_image3'],
                image_5: ['scene_input_image4'],
                image_6: ['scene_input_image5'],
                image_7: ['scene_input_image6'],
                image_8: ['scene_input_image7'],
                image_9: ['scene_input_image8']
            };
            const source = String(profile?.source || '').trim();
            const slots = aliases[source] || [source, 'scene_canvas_image', 'scene_input_image1', 'scene_input_image2', 'scene_input_image3', 'scene_input_image4', 'scene_input_image5', 'scene_input_image6', 'scene_input_image7', 'scene_input_image8'];
            for (const slot of slots) {
                const sourceId = presetNode.upload_slots?.[slot];
                const node = sourceId ? call(nodeSource, 'getNode', null, sourceId) : null;
                if (!node || call(nodeSource, 'isNodeIgnored', false, node)) continue;
                const asset = getPrimaryNodeAsset(node);
                const width = Number(asset?.width || node.asset?.width || node.preview?.width || 0);
                const height = Number(asset?.height || node.asset?.height || node.preview?.height || 0);
                if (width > 0 && height > 0) return { width, height, slot };
            }
            return null;
        }

        function getPrimaryNodeAsset(node) {
            if (!node || typeof node !== 'object') return null;
            if (Array.isArray(node.assets) && node.assets.length) {
                const index = clampValue(Number(node.selected_asset_index || 0), 0, node.assets.length - 1);
                return node.assets[index] || node.assets[0] || null;
            }
            return node.asset || null;
        }

        function buildInitialConfigValues(kind, sourceConfig, presetNode, detectionIndex) {
            const defaults = sourceConfig.defaults || {};
            const overrides = sourceConfig.overrides || {};
            if (kind === 'resolution') {
                const choices = getResolutionChoices();
                const profile = normalizeResolutionProfile(defaults);
                const profileRatios = Array.isArray(profile.aspect_ratios) ? profile.aspect_ratios : [];
                const template = profile.mode
                    ? 'Preset'
                    : normalizeResolutionTemplateName(
                        overrides.template || defaults.template || defaults.default_template || defaults.available_aspect_ratios_selection,
                        choices);
                const templateRatios = template === 'Preset'
                    ? profileRatios
                    : (choices.ratios[template] || choices.flatRatios || []);
                const aspectRatio = overrides.aspect_ratio || defaults.aspect_ratio || defaults.default_aspect_ratio
                    || templateRatios[0] || profileRatios[0] || '';
                const sourceSize = getResolutionSourceSize(presetNode, profile);
                const baseValues = {
                    profile,
                    source_size: sourceSize,
                    aspect_ratio: aspectRatio,
                    quantize: Number(overrides.quantize || defaults.quantize || profile.quantize || defaults.default_resolution_quantize_step || 8),
                    multiplier: Number(overrides.multiplier || defaults.multiplier || defaults.default_resolution_multiplier || 1),
                    edit_mode: overrides.edit_mode || defaults.edit_mode || defaults.default_resolution_edit_mode || 'scale'
                };
                const baseDims = resolveResolutionBaseDims(baseValues, templateRatios);
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
                    getClassicEnhanceRegionValues(presetNode, Number.isFinite(detectionIndex) ? detectionIndex : 0, defaults),
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
                pe_model: defaults.pe_model || 'None',
                vae: defaults.vae || 'Default (model)',
                upscale_model: defaults.upscale_model || 'default',
                lora_stack: defaults.lora_stack || [],
                lora_stack_target: defaults.lora_stack_target || 'auto',
                loras: normalizeInitialConfigLoras(defaults, overrides)
            }, overrides, { loras: normalizeInitialConfigLoras(defaults, overrides) });
        }

        return {
            isPresetConfigKind, configKeyForKind,
            getPresetSchema, getPresetTheme, getPresetThemeInfo, getVisibleUploadSlots, getSlotLabel,
            getPresetCatalogEntryForNode, getPresetConfigSource, normalizeInitialConfigLoras, buildInitialConfigValues,
            configNumberValue, boundedConfigNumberValue, configTextValue, mergeChoices,
            getResolutionChoices, normalizeResolutionTemplateName, getResolutionRenderValues,
            getResolutionSourceSize, resolutionManualSizeLabel, quantizeResolutionValue,
            normalizeResolutionProfile, resolveResolutionBaseDims, getResolutionPreview,
            normalizeStyleSelections, firstStyleConfigValue, styleConfigSelectionFromValues,
            canvasBoolValue, enhanceRegionKey, detectionSlotForRegion, parseDetectionSlot,
            getClassicEnhanceRegionDefault, getClassicEnhanceRegionValues,
            applyClassicEnhanceRegionValues, getDetectionChoices, getDetectionConfigLabel,
            getClassicIpMaxImages, getClassicIpCount, getVisibleClassicUploadSlots,
            getClassicIpTypes, getClassicUovMethods,
            getClassicInpaintEngines, resolveClassicInpaintTaskMethod, normalizeClassicInpaintMode,
            getInpaintModeDefaults
        };
    }

    window.SimpAICanvasWorkbenchConfigValues = Object.assign(
        {}, window.SimpAICanvasWorkbenchConfigValues || {}, { createCanvasConfigValuesController }
    );
})();
