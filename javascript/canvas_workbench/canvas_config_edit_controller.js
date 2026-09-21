(function () {
    'use strict';

    function createCanvasConfigEditController(context) {
        const scope = context?.configEditSource || context || {};
        const nodeSource = scope.nodeSource || {};
        const configSource = scope.configSource || {};
        const styleSource = scope.styleSource || {};
        const resolutionSource = scope.resolutionSource || {};
        const patchSource = scope.patchSource || {};
        const serializationSource = scope.serializationSource || {};
        const historySource = scope.historySource || {};
        const persistenceSource = scope.persistenceSource || {};
        const renderSource = scope.renderSource || {};
        const call = (source, name, fallback, ...args) => typeof source[name] === 'function'
            ? source[name](...args) : fallback;
        const getNode = id => call(nodeSource, 'getNode', null, id);
        const isNodeLocked = node => call(nodeSource, 'isNodeLocked', false, node);
        const cloneRunValue = typeof serializationSource.cloneRunValue === 'function'
            ? serializationSource.cloneRunValue
            : (value, fallback) => JSON.parse(JSON.stringify(value ?? fallback));
        const buildConfigStatePatch = (...args) => call(patchSource, 'buildConfigStatePatch', {}, ...args);
        const applyConfigNodeToPreset = node => call(configSource, 'applyConfigNodeToPreset', undefined, node);
        const pushHistoryBatch = (...args) => call(historySource, 'pushHistoryBatch', undefined, ...args);
        const scheduleSave = () => call(persistenceSource, 'scheduleSave', undefined);
        const renderAll = () => call(renderSource, 'renderAll', undefined, { inspector: false });
        const normalizeStyleSelections = styles => call(styleSource, 'normalizeStyleSelections', [], styles);
        const styleConfigSelectionFromValues = (values, fallback) =>
            call(styleSource, 'styleConfigSelectionFromValues', fallback, values, fallback);
        const getResolutionChoices = () => call(resolutionSource, 'getResolutionChoices', { ratios: {} });
        const getResolutionRenderValues = node => call(resolutionSource, 'getResolutionRenderValues', {}, node);
        const normalizeResolutionTemplateName = (value, choices) =>
            call(resolutionSource, 'normalizeResolutionTemplateName', value, value, choices);
        const resolveResolutionBaseDims = (values, ratios) =>
            call(resolutionSource, 'resolveResolutionBaseDims', {}, values, ratios);

        function setStylesConfigSelection(nodeId, styles, options) {
            const node = getNode(nodeId);
            if (!node || node.type !== 'config' || node.config_kind !== 'styles') return;
            if (isNodeLocked(node)) return;
            pushHistoryBatch(`config-styles:${nodeId}`, 'Edit styles config');
            Object.assign(node, buildConfigStatePatch(node, {
                valuesPatch: { style_selections: normalizeStyleSelections(styles) },
                deleteValueKeys: ['styles', 'default_styles'],
                touchUpdatedAt: true
            }));
            applyConfigNodeToPreset(node);
            scheduleSave();
            if (options?.render !== false) renderAll();
        }

        function updateStylesConfigSelection(nodeId, styleName, checked) {
            const node = getNode(nodeId);
            if (!node || node.type !== 'config' || node.config_kind !== 'styles') return;
            const current = styleConfigSelectionFromValues(node.config?.values || {}, []);
            const next = current.filter(item => item !== styleName);
            if (checked && styleName && !next.includes(styleName)) next.push(styleName);
            setStylesConfigSelection(nodeId, next);
        }

        function resetStylesConfigSelection(nodeId) {
            const node = getNode(nodeId);
            if (!node || node.type !== 'config' || node.config_kind !== 'styles') return;
            const target = call(configSource, 'getConfigTargetPreset', null, node);
            const source = target
                ? call(configSource, 'getPresetConfigSource', {}, target, 'styles')
                : { defaults: node.config?.defaults || {} };
            const fallback = target ? call(styleSource, 'canvasAgentPresetPromptDefaults', { styles: [] }, target).styles : [];
            const defaults = styleConfigSelectionFromValues(source.defaults || {}, fallback);
            setStylesConfigSelection(nodeId, defaults);
        }

        function handleStylesConfigAction(node, action) {
            if (!node || node.type !== 'config' || node.config_kind !== 'styles') return false;
            if (action === 'clear') {
                setStylesConfigSelection(node.id, []);
                return true;
            }
            if (action === 'reset') {
                resetStylesConfigSelection(node.id);
                return true;
            }
            return false;
        }

        function updateConfigParam(nodeId, key, value, inputType, options) {
            const node = getNode(nodeId);
            if (!node || node.type !== 'config') return;
            if (isNodeLocked(node)) return;
            pushHistoryBatch(`config:${nodeId}:${key}`, 'Edit config');
            const values = cloneRunValue(node.config?.values || {}, {});
            values[key] = inputType === 'checkbox' ? !!value
                : (inputType === 'number' || inputType === 'range' ? Number(value) : value);
            if (node.config_kind === 'resolution') {
                if (key === 'width' || key === 'height') values.manual = true;
                if (key === 'template') {
                    values.manual = false;
                    const choices = getResolutionChoices();
                    const renderValues = Object.assign({}, getResolutionRenderValues(node), values);
                    const profileRatios = Array.isArray(renderValues.profile?.aspect_ratios) ? renderValues.profile.aspect_ratios : [];
                    const template = normalizeResolutionTemplateName(values.template || renderValues.template, choices);
                    values.template = template;
                    const ratios = template === 'Preset' && profileRatios.length ? profileRatios : (choices.ratios[template] || choices.flatRatios);
                    if (Array.isArray(ratios) && ratios.length && !ratios.includes(String(values.aspect_ratio || ''))) {
                        values.aspect_ratio = ratios[0];
                    }
                    const dims = resolveResolutionBaseDims(Object.assign({}, renderValues, values), ratios);
                    values.width = dims.width;
                    values.height = dims.height;
                } else if (key === 'random_aspect_ratio') {
                    values.manual = false;
                    values.random_aspect_ratio_checkbox = !!values.random_aspect_ratio;
                } else if (key === 'aspect_ratio' || key === 'quantize') {
                    values.manual = false;
                    const renderValues = Object.assign({}, getResolutionRenderValues(node), values);
                    const choices = getResolutionChoices();
                    const template = normalizeResolutionTemplateName(renderValues.template || choices.firstTemplate || '', choices);
                    const profileRatios = Array.isArray(renderValues.profile?.aspect_ratios) ? renderValues.profile.aspect_ratios : [];
                    const ratios = template === 'Preset' && profileRatios.length ? profileRatios : (choices.ratios[template] || choices.flatRatios);
                    const dims = resolveResolutionBaseDims(renderValues, ratios);
                    values.width = dims.width;
                    values.height = dims.height;
                }
            }
            Object.assign(node, buildConfigStatePatch(node, { values, touchUpdatedAt: true }));
            applyConfigNodeToPreset(node);
            scheduleSave();
            if (options?.render !== false && (node.config_kind === 'resolution' || key === 'template'
                || key === 'edit_mode' || (node.config_kind === 'detection' && key === 'mask_model'))) renderAll();
        }

        function updateConfigLora(nodeId, index, key, value) {
            const node = getNode(nodeId);
            if (!node || node.type !== 'config') return;
            if (isNodeLocked(node)) return;
            pushHistoryBatch(`config-lora:${nodeId}:${index}:${key}`, 'Edit LoRA config');
            const values = cloneRunValue(node.config?.values || {}, {});
            const loras = Array.isArray(values.loras) ? cloneRunValue(values.loras, []) : [];
            while (loras.length <= index) loras.push({ enabled: false, model: 'None', weight: 1 });
            loras[index][key] = value;
            if (key === 'model' && value && value !== 'None') loras[index].enabled = true;
            values.loras = loras;
            Object.assign(node, buildConfigStatePatch(node, { values, touchUpdatedAt: true }));
            applyConfigNodeToPreset(node);
            scheduleSave();
        }

        return { setStylesConfigSelection, updateStylesConfigSelection, resetStylesConfigSelection,
            handleStylesConfigAction, updateConfigParam, updateConfigLora };
    }

    window.SimpAICanvasWorkbenchConfigEdit = Object.assign(
        {}, window.SimpAICanvasWorkbenchConfigEdit || {}, { createCanvasConfigEditController }
    );
})();
