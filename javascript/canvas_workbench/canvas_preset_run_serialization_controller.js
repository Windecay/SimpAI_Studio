(function () {
    'use strict';

    function createCanvasPresetRunSerializationController(context) {
        const scope = context?.presetRunSerializationSource || context || {};
        const projectSource = scope.projectSource || {};
        const nodeSource = scope.nodeSource || {};
        const slotSource = scope.slotSource || {};
        const presetSource = scope.presetSource || {};
        const classicSource = scope.classicSource || {};
        const directorSource = scope.directorSource || {};
        const serializationSource = scope.serializationSource || {};

        const call = (sourceObject, name, fallback, ...args) => typeof sourceObject?.[name] === 'function'
            ? sourceObject[name](...args)
            : fallback;
        const getProject = () => call(projectSource, 'getProject', {}) || {};
        const getNode = (id) => call(nodeSource, 'getNode', null, id);
        const isNodeIgnored = (...args) => !!call(nodeSource, 'isNodeIgnored', false, ...args);
        const isTextOutputNode = (...args) => !!call(nodeSource, 'isTextOutputNode', false, ...args);
        const getNodeTextOutput = (...args) => call(nodeSource, 'getNodeTextOutput', '', ...args);
        const isDirectorTimelineNode = (...args) => !!call(nodeSource, 'isDirectorTimelineNode', false, ...args);
        const getPresetCatalogEntryForNode = (...args) => call(presetSource, 'getPresetCatalogEntryForNode', null, ...args);
        const clonePresetWithPromptDefaults = (...args) => call(
            presetSource,
            'clonePresetWithPromptDefaults',
            args[0],
            ...args
        );
        const getPresetSpecialControllerKind = (...args) => call(presetSource, 'getPresetSpecialControllerKind', '', ...args);
        const presetSpecialControllerState = (...args) => call(presetSource, 'presetSpecialControllerState', {}, ...args);
        const presetSpecialPromptFromState = (...args) => call(presetSource, 'presetSpecialPromptFromState', '', ...args);
        const isResolutionOwnedPresetParam = (...args) => !!call(
            presetSource,
            'isResolutionOwnedPresetParam',
            false,
            ...args
        );
        const canvasAgentPresetPromptDefaults = (...args) => call(
            presetSource,
            'canvasAgentPresetPromptDefaults',
            {},
            ...args
        );
        const cloneRunValue = (value, fallback) => call(
            serializationSource,
            'cloneRunValue',
            fallback,
            value,
            fallback
        );
        const applyDirectorCapabilityToPayloadForPreset = (...args) => call(
            directorSource,
            'applyDirectorCapabilityToPayloadForPreset',
            args[1],
            ...args
        );
        const directorTimelinePayload = (...args) => call(directorSource, 'directorTimelinePayload', null, ...args);
        const getClassicIpCount = (...args) => Number(call(classicSource, 'getClassicIpCount', 0, ...args)) || 0;
        const getClassicIpTypes = (...args) => call(classicSource, 'getClassicIpTypes', ['ImagePrompt'], ...args) || ['ImagePrompt'];
        const getClassicIpMaxImages = (...args) => Number(call(classicSource, 'getClassicIpMaxImages', 1, ...args)) || 1;
        const getClassicIpControlTypes = (...args) => call(classicSource, 'getClassicIpControlTypes', ['ImagePrompt'], ...args) || ['ImagePrompt'];
        const getClassicOutpaintDirs = (...args) => call(classicSource, 'getClassicOutpaintDirs', [], ...args) || [];
        const normalizeClassicInpaintMode = (...args) => call(
            classicSource,
            'normalizeClassicInpaintMode',
            args[0] || 'Inpaint or Outpaint (default)',
            ...args
        );
        const detectionSlotForRegion = (...args) => call(classicSource, 'detectionSlotForRegion', '', ...args);
        const getClassicEnhanceRegionValues = (...args) => call(classicSource, 'getClassicEnhanceRegionValues', {}, ...args) || {};
        const enhanceRegionKey = (...args) => call(classicSource, 'enhanceRegionKey', `enhance_region_${args[0] || 0}`, ...args);
        const canvasAgentUploadSlotsForNode = (...args) => call(
            slotSource,
            'canvasAgentUploadSlotsForNode',
            [],
            ...args
        ) || [];
        const canNodeConnectToUploadSlot = (...args) => !!call(
            slotSource,
            'canNodeConnectToUploadSlot',
            false,
            ...args
        );

        function getPresetUploadRunEdges(presetNode) {
            if (!presetNode || !presetNode.id) return [];
            const project = getProject();
            const edges = (Array.isArray(project.edges) ? project.edges : [])
                .filter(edge => edge.type === 'upload' && edge.to === presetNode.id && !isNodeIgnored(getNode(edge.from)));
            const seenSlots = new Set(edges.map(edge => edge.slot).filter(Boolean));
            const allowedSlots = new Set(canvasAgentUploadSlotsForNode(presetNode).map(slot => slot.key));
            Object.entries(presetNode.upload_slots || {}).forEach(([slot, fromId]) => {
                if (!slot || !fromId || seenSlots.has(slot)) return;
                if (allowedSlots.size && !allowedSlots.has(slot)) return;
                const source = getNode(fromId);
                if (!source || isNodeIgnored(source) || !canNodeConnectToUploadSlot(source, slot)) return;
                edges.push({
                    id: `slot:${presetNode.id}:${slot}`,
                    type: 'upload',
                    from: fromId,
                    to: presetNode.id,
                    slot,
                    synthetic: true
                });
                seenSlots.add(slot);
            });
            return edges;
        }

        function serializePresetConfigForRun(config) {
            const next = cloneRunValue(config || {}, {});
            if (next.source_node_id && isNodeIgnored(getNode(next.source_node_id))) {
                next.mode = 'preset_default';
                next.source_node_id = null;
                next.overrides = {};
            }
            return next;
        }

        function serializePresetForRun(node) {
            const params = cloneRunValue(node.params || {}, {});
            const specialKind = getPresetSpecialControllerKind(node);
            if (specialKind) {
                const specialState = presetSpecialControllerState(node, specialKind);
                params.scene_additional_prompt_2 = presetSpecialPromptFromState(specialKind, specialState);
            }
            Object.keys(params).forEach((key) => {
                if (isResolutionOwnedPresetParam(key)) delete params[key];
            });
            const catalogEntry = getPresetCatalogEntryForNode(node);
            const presetPayload = clonePresetWithPromptDefaults(node, catalogEntry || node);
            const generationConfig = cloneRunValue(node.generation_config || {}, {});
            if (!generationConfig.mode) generationConfig.mode = 'preset_default';
            if (!generationConfig.overrides || typeof generationConfig.overrides !== 'object') generationConfig.overrides = {};
            if (!generationConfig.defaults || !Object.keys(generationConfig.defaults).length) {
                generationConfig.defaults = cloneRunValue(catalogEntry?.generation_config || {}, {});
            }
            const modelRequirements = cloneRunValue(node.model_requirements || {}, {});
            if (!Array.isArray(modelRequirements.model_list) || !modelRequirements.model_list.length) {
                modelRequirements.model_list = cloneRunValue(catalogEntry?.model_list || [], []);
            }
            if (!modelRequirements.has_model_probe) {
                modelRequirements.has_model_probe = !!catalogEntry?.has_model_probe;
            }
            const project = getProject();
            const edges = Array.isArray(project.edges) ? project.edges : [];
            edges
                .filter(edge => edge.type === 'text' && edge.to === node.id && !isNodeIgnored(getNode(edge.from)))
                .forEach((edge) => {
                    const source = getNode(edge.from);
                    if (!source || !isTextOutputNode(source)) return;
                    const slot = ['prompt', 'negative_prompt'].includes(edge.slot) ? edge.slot : 'prompt';
                    params[slot] = getNodeTextOutput(source);
                    if (isDirectorTimelineNode(source)) {
                        const payload = applyDirectorCapabilityToPayloadForPreset(node, directorTimelinePayload(source));
                        params.director_timeline = payload;
                        params.prompt_override = payload?.prompt_override || params[slot] || '';
                    }
                });
            const promptDefaults = canvasAgentPresetPromptDefaults(node);
            if (!String(params.prompt || '').trim() && promptDefaults.prompt) params.prompt = promptDefaults.prompt;
            if (!String(params.negative_prompt || '').trim() && promptDefaults.negative_prompt) params.negative_prompt = promptDefaults.negative_prompt;
            return {
                id: node.id,
                type: node.type,
                title: node.title || '',
                preset: presetPayload,
                runtime: cloneRunValue(node.runtime || {}, {}),
                schema: cloneRunValue(node.schema || {}, {}),
                params,
                upload_slots: cloneRunValue(node.upload_slots || {}, {}),
                text_inputs: cloneRunValue(node.text_inputs || {}, {}),
                models_config: serializePresetConfigForRun(node.models_config || {}),
                resolution_config: serializePresetConfigForRun(node.resolution_config || {}),
                generation_config: serializePresetConfigForRun(generationConfig),
                model_requirements: modelRequirements
            };
        }

        function serializeClassicNodeForRun(node) {
            const catalogEntry = getPresetCatalogEntryForNode(node);
            const presetPayload = clonePresetWithPromptDefaults(node, catalogEntry || node);
            const mode = node?.classic_mode || 't2i';
            const params = cloneRunValue(node?.params || {}, {});
            const project = getProject();
            const edges = Array.isArray(project.edges) ? project.edges : [];
            edges
                .filter(edge => edge.type === 'text' && edge.to === node.id && !isNodeIgnored(getNode(edge.from)))
                .forEach((edge) => {
                    const source = getNode(edge.from);
                    if (!source || !isTextOutputNode(source)) return;
                    const slot = ['prompt', 'negative_prompt'].includes(edge.slot) ? edge.slot : 'prompt';
                    params[slot] = getNodeTextOutput(source);
                    if (isDirectorTimelineNode(source)) {
                        const payload = applyDirectorCapabilityToPayloadForPreset(node, directorTimelinePayload(source));
                        params.director_timeline = payload;
                        params.prompt_override = payload?.prompt_override || params[slot] || '';
                    }
                });
            const promptDefaults = canvasAgentPresetPromptDefaults(node);
            if (!String(params.prompt || '').trim() && promptDefaults.prompt) params.prompt = promptDefaults.prompt;
            if (!String(params.negative_prompt || '').trim() && promptDefaults.negative_prompt) params.negative_prompt = promptDefaults.negative_prompt;
            const modeToTab = { t2i: 'ip', ip: 'ip', uov: 'uov', inpaint: 'inpaint', enhance: 'enhance' };
            const currentTab = modeToTab[mode] || 'ip';
            const ipImages = [];
            const ipTypes = [];
            const ipStops = [];
            const ipWeights = [];
            const ipCount = getClassicIpCount(node);
            const allowedIpTypes = getClassicIpTypes(node);
            for (let i = 0; i < Math.max(ipCount, 4); i++) {
                const slotEnabled = getClassicIpMaxImages(node) > 1 || (mode === 'ip' && i < ipCount);
                ipImages.push(slotEnabled && node?.upload_slots?.[`ip_image_${i}`]
                    ? { slot: `ip_image_${i}`, node_id: node.upload_slots[`ip_image_${i}`] }
                    : null);
                ipTypes.push(params[`ip_type_${i}`] || allowedIpTypes[0] || getClassicIpControlTypes()[0]);
                ipStops.push(params[`ip_stop_${i}`] ?? 0.5);
                ipWeights.push(params[`ip_weight_${i}`] ?? 1.0);
            }
            const uovMethod = params.uov_method || 'Upscale (1.5x)';
            const uovImage = node?.upload_slots?.uov_image
                ? { slot: 'uov_image', node_id: node.upload_slots.uov_image }
                : null;
            const inpaintImage = node?.upload_slots?.inpaint_image
                ? { slot: 'inpaint_image', node_id: node.upload_slots.inpaint_image }
                : null;
            const inpaintMask = node?.upload_slots?.inpaint_mask
                ? { slot: 'inpaint_mask', node_id: node.upload_slots.inpaint_mask }
                : null;
            const inpaintMode = normalizeClassicInpaintMode(params.inpaint_mode || 'Inpaint or Outpaint (default)');
            const inpaintDenoisingStrength = params.inpaint_denoising_strength ?? 1.0;
            const inpaintRespectiveField = params.inpaint_respective_field ?? 0.618;
            const inpaintEngine = params.inpaint_engine ?? null;
            const inpaintDisableInitialLatent = params.inpaint_disable_initial_latent ?? false;
            const invertMask = params.invert_mask ?? false;
            const inpaintAdditionalPrompt = params.inpaint_additional_prompt ?? '';
            const outpaintSelections = (() => {
                if (Array.isArray(params.outpaint_selections) && params.outpaint_selections.length) return params.outpaint_selections;
                const dirs = [];
                const outpaintDirs = getClassicOutpaintDirs();
                for (const direction of outpaintDirs) {
                    if (params[`outpaint_${direction.toLowerCase()}`]) dirs.push(direction);
                }
                return dirs;
            })();
            const enhanceImage = node?.upload_slots?.enhance_image
                ? { slot: 'enhance_image', node_id: node.upload_slots.enhance_image }
                : null;
            const enhanceRegions = [0, 1, 2].map((index) => {
                const slot = detectionSlotForRegion(index);
                const edge = edges.find(item => item.type === 'config' && item.to === node.id && item.slot === slot);
                const configNode = edge ? getNode(edge.from) : null;
                return getClassicEnhanceRegionValues(node, index, configNode?.config?.values || null);
            });
            const classicRunParams = cloneRunValue(node?.params || {}, {});
            if (params.director_timeline) classicRunParams.director_timeline = cloneRunValue(params.director_timeline, {});
            if (params.prompt_override) classicRunParams.prompt_override = params.prompt_override;
            if (!classicRunParams.prompt && params.prompt) classicRunParams.prompt = params.prompt;
            if (!classicRunParams.negative_prompt && params.negative_prompt) classicRunParams.negative_prompt = params.negative_prompt;
            if (classicRunParams.seed_random === undefined) classicRunParams.seed_random = true;
            if (classicRunParams.image_seed === undefined) classicRunParams.image_seed = 0;
            if (classicRunParams.image_number === undefined) classicRunParams.image_number = 1;
            for (let i = 0; i < ipTypes.length; i++) {
                if (classicRunParams[`ip_type_${i}`] === undefined) classicRunParams[`ip_type_${i}`] = ipTypes[i];
                if (classicRunParams[`ip_stop_${i}`] === undefined) classicRunParams[`ip_stop_${i}`] = ipStops[i];
                if (classicRunParams[`ip_weight_${i}`] === undefined) classicRunParams[`ip_weight_${i}`] = ipWeights[i];
            }
            if (classicRunParams.uov_method === undefined) classicRunParams.uov_method = uovMethod;
            if (classicRunParams.uov_denoise_strength === undefined) {
                classicRunParams.uov_denoise_strength = params.uov_denoise_strength
                    ?? (uovMethod.includes('Strong') ? 0.85 : uovMethod.includes('Vary') ? 0.5 : 0.2);
            }
            if (classicRunParams.inpaint_mode === undefined) classicRunParams.inpaint_mode = inpaintMode;
            if (classicRunParams.inpaint_denoising_strength === undefined) classicRunParams.inpaint_denoising_strength = inpaintDenoisingStrength;
            if (classicRunParams.inpaint_respective_field === undefined) classicRunParams.inpaint_respective_field = inpaintRespectiveField;
            if (classicRunParams.inpaint_engine === undefined) classicRunParams.inpaint_engine = inpaintEngine;
            if (classicRunParams.inpaint_disable_initial_latent === undefined) classicRunParams.inpaint_disable_initial_latent = inpaintDisableInitialLatent;
            if (classicRunParams.invert_mask === undefined) classicRunParams.invert_mask = invertMask;
            if (classicRunParams.inpaint_additional_prompt === undefined) classicRunParams.inpaint_additional_prompt = inpaintAdditionalPrompt;
            if (classicRunParams.outpaint_selections === undefined) classicRunParams.outpaint_selections = outpaintSelections;
            classicRunParams.enhance_checkbox = mode === 'enhance';
            if (classicRunParams.enhance_uov_method === undefined) classicRunParams.enhance_uov_method = params.enhance_uov_method || 'Disabled';
            if (classicRunParams.enhance_uov_strength === undefined) classicRunParams.enhance_uov_strength = params.enhance_uov_strength ?? 0.5;
            if (classicRunParams.enhance_uov_processing_order === undefined) classicRunParams.enhance_uov_processing_order = params.enhance_uov_processing_order || 'Before First Enhancement';
            if (classicRunParams.enhance_uov_prompt_type === undefined) classicRunParams.enhance_uov_prompt_type = params.enhance_uov_prompt_type || 'Original Prompts';
            enhanceRegions.forEach((region, index) => {
                const prefix = enhanceRegionKey(index);
                classicRunParams[`${prefix}_enabled`] = region.enabled;
                classicRunParams[`${prefix}_dino_prompt`] = region.dino_prompt;
                classicRunParams[`${prefix}_prompt`] = region.prompt;
                classicRunParams[`${prefix}_negative_prompt`] = region.negative_prompt;
                classicRunParams[`${prefix}_mask_model`] = region.mask_model;
                classicRunParams[`${prefix}_mask_cloth_category`] = region.mask_cloth_category;
                classicRunParams[`${prefix}_mask_sam_model`] = region.mask_sam_model;
                classicRunParams[`${prefix}_mask_text_threshold`] = region.mask_text_threshold;
                classicRunParams[`${prefix}_mask_box_threshold`] = region.mask_box_threshold;
                classicRunParams[`${prefix}_mask_sam_max_detections`] = region.mask_sam_max_detections;
                classicRunParams[`${prefix}_inpaint_disable_initial_latent`] = region.inpaint_disable_initial_latent;
                classicRunParams[`${prefix}_inpaint_engine`] = region.inpaint_engine;
                classicRunParams[`${prefix}_inpaint_strength`] = region.inpaint_strength;
                classicRunParams[`${prefix}_inpaint_respective_field`] = region.inpaint_respective_field;
                classicRunParams[`${prefix}_inpaint_erode_or_dilate`] = region.inpaint_erode_or_dilate;
                classicRunParams[`${prefix}_mask_invert`] = region.mask_invert;
            });
            if (classicRunParams.mixing_image_prompt_and_vary_upscale === undefined) classicRunParams.mixing_image_prompt_and_vary_upscale = false;
            if (classicRunParams.mixing_image_prompt_and_inpaint === undefined) classicRunParams.mixing_image_prompt_and_inpaint = false;
            return {
                id: node.id,
                node_type: 'classic',
                classic_mode: mode,
                current_tab: currentTab,
                title: node.title || '',
                preset: presetPayload,
                runtime: cloneRunValue(node?.runtime || {}, {}),
                params: classicRunParams,
                ip_params: { images: ipImages, types: ipTypes, stops: ipStops, weights: ipWeights, count: ipCount },
                uov_params: { method: uovMethod, image: uovImage },
                inpaint_params: {
                    image: inpaintImage,
                    mask: inpaintMask,
                    mode: inpaintMode,
                    denoising_strength: inpaintDenoisingStrength,
                    respective_field: inpaintRespectiveField,
                    engine: inpaintEngine,
                    disable_initial_latent: inpaintDisableInitialLatent,
                    invert_mask: invertMask,
                    additional_prompt: inpaintAdditionalPrompt,
                    outpaint: outpaintSelections
                },
                enhance_params: {
                    image: enhanceImage,
                    uov_method: classicRunParams.enhance_uov_method,
                    uov_strength: classicRunParams.enhance_uov_strength,
                    uov_processing_order: classicRunParams.enhance_uov_processing_order,
                    uov_prompt_type: classicRunParams.enhance_uov_prompt_type,
                    regions: enhanceRegions
                },
                upload_slots: cloneRunValue(node?.upload_slots || {}, {}),
                text_inputs: cloneRunValue(node?.text_inputs || {}, {}),
                models_config: serializePresetConfigForRun(node?.models_config || {}),
                resolution_config: serializePresetConfigForRun(node?.resolution_config || {}),
                generation_config: serializePresetConfigForRun(node?.generation_config || {}),
                model_requirements: cloneRunValue(node?.model_requirements || {})
            };
        }

        return {
            getPresetUploadRunEdges,
            serializePresetConfigForRun,
            serializePresetForRun,
            serializeClassicNodeForRun
        };
    }

    window.SimpAICanvasWorkbenchPresetRunSerialization = Object.assign(
        {},
        window.SimpAICanvasWorkbenchPresetRunSerialization || {},
        { createCanvasPresetRunSerializationController }
    );
})();
