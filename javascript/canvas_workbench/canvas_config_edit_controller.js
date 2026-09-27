(function () {
    'use strict';

    function createCanvasConfigEditController(context) {
        const scope = context?.configEditSource || context || {};
        const nodeSource = scope.nodeSource || {};
        const domSource = scope.domSource || {};
        const configSource = scope.configSource || {};
        const modelBrowserSource = scope.modelBrowserSource || {};
        const styleSource = scope.styleSource || {};
        const resolutionSource = scope.resolutionSource || {};
        const patchSource = scope.patchSource || {};
        const serializationSource = scope.serializationSource || {};
        const historySource = scope.historySource || {};
        const persistenceSource = scope.persistenceSource || {};
        const renderSource = scope.renderSource || {};
        const eventSource = scope.eventSource || {};
        const languageSource = scope.languageSource || {};
        const call = (source, name, fallback, ...args) => typeof source[name] === 'function'
            ? source[name](...args) : fallback;
        const eventCall = (name, fallback, ...args) => call(eventSource, name, fallback, ...args);
        const t = (en, cn) => call(languageSource, 't', en, en, cn);
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
        const getResolutionPreview = (values, ratios) => call(resolutionSource, 'getResolutionPreview', {}, values, ratios);
        const resolutionManualSizeLabel = (values, preview) =>
            call(resolutionSource, 'resolutionManualSizeLabel', '', values, preview);
        const getDocument = () => call(domSource, 'getDocument', null);

        function refreshResolutionConfigNodeDom(nodeEl, node) {
            if (!nodeEl || !node || node.type !== 'config' || node.config_kind !== 'resolution') return;
            const values = getResolutionRenderValues(node);
            const choices = getResolutionChoices();
            const template = normalizeResolutionTemplateName(values.template || values.default_template || values.available_aspect_ratios_selection || choices.firstTemplate, choices);
            const profileRatios = Array.isArray(values.profile?.aspect_ratios) ? values.profile.aspect_ratios : [];
            const ratios = template === 'Preset' && profileRatios.length ? profileRatios : (choices.ratios[template] || choices.flatRatios);
            const preview = getResolutionPreview(values, ratios);
            const scale = Number(values.multiplier || 1).toFixed(1);
            const doc = getDocument();
            ['width', 'height'].forEach(key => {
                nodeEl.querySelectorAll(`[data-config-param="${key}"]`).forEach(input => {
                    if (input === doc?.activeElement) return;
                    input.value = String(values[key] ?? -1);
                });
            });
            nodeEl.querySelectorAll('[data-resolution-multiplier-label]').forEach(label => {
                label.textContent = `${scale}x`;
            });
            nodeEl.querySelectorAll('[data-config-param="multiplier"]').forEach(input => {
                if (input === doc?.activeElement) return;
                input.value = scale;
            });
            const summary = nodeEl.querySelector('.sai-resolution-summary');
            if (summary) {
                const locked = values.profile && values.profile.interactive === false;
                const random = values.random_aspect_ratio || values.random_aspect_ratio_checkbox;
                summary.textContent = `${preview.baseLabel} ${t('base', '基础')} -> ${preview.label} ${t('effective', '生效')}${random ? ` / ${t('random size from template', '从模板随机尺寸')}` : ''}${locked ? ` / ${t('preset locked', '预设锁定')}` : ''}`;
            }
            const aspectSelect = nodeEl.querySelector('[data-resolution-aspect-select]');
            if (aspectSelect && aspectSelect !== doc?.activeElement) {
                const selected = String(values.aspect_ratio || ratios[0] || '');
                const customLabel = resolutionManualSizeLabel(values, preview);
                let customOption = aspectSelect.querySelector('option[data-resolution-custom-size]');
                if (customLabel) {
                    if (!customOption) {
                        customOption = doc.createElement('option');
                        customOption.setAttribute('data-resolution-custom-size', 'true');
                        aspectSelect.insertBefore(customOption, aspectSelect.firstChild);
                    }
                    customOption.value = selected;
                    customOption.textContent = customLabel;
                    customOption.selected = true;
                } else {
                    if (customOption) customOption.remove();
                    aspectSelect.value = selected;
                }
            }
            const box = nodeEl.querySelector('.sai-resolution-preview-box');
            if (box) {
                box.style.width = `${preview.boxW}%`;
                box.style.height = `${preview.boxH}%`;
                const label = box.querySelector('span');
                if (label) label.textContent = preview.label;
            }
        }

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

        function handleStylesConfigActionClick(node, evt) {
            if (node?.type !== 'config' || node.config_kind !== 'styles') return false;
            const button = evt?.target?.closest?.('[data-style-config-action]');
            if (!button) return false;
            evt.preventDefault();
            evt.stopPropagation();
            return handleStylesConfigAction(node, button.getAttribute('data-style-config-action') || '');
        }

        function modelSelectionIsPlaceholder(value) {
            const text = String(value || '').trim().toLowerCase();
            return !text || ['none', 'default', 'default (model)'].includes(text);
        }

        function currentModelBrowserNames(node, isLora, select, key) {
            if (isLora) {
                const loras = call(modelBrowserSource, 'normalizeInitialConfigLoras', [], node.config?.defaults || {}, node.config?.values || {});
                return loras
                    .filter(lora => lora.enabled && !modelSelectionIsPlaceholder(lora.model))
                    .map(lora => String(lora.model || '').trim())
                    .filter(Boolean);
            }
            const value = String(select?.value || node.config?.values?.[key] || '').trim();
            return modelSelectionIsPlaceholder(value) ? [] : [value];
        }

        function modelBrowserTypeForConfigKey(key) {
            if (key === 'refiner_model') return 'refiner';
            if (key === 'clip_model') return 'clip';
            if (key === 'vae') return 'vae';
            if (key === 'upscale_model') return 'upscale';
            return 'base';
        }

        function openModelBrowserForConfigField(node, trigger, nodeEl) {
            if (!node || node.type !== 'config' || node.config_kind !== 'models') return false;
            const browser = call(modelBrowserSource, 'getModelBrowser', null);
            if (!browser || typeof browser.open !== 'function') {
                eventCall('showToast', undefined, t('Model Browser is not loaded yet.', 'Model Browser 尚未加载完成。'));
                return true;
            }
            const loraIndexRaw = trigger.getAttribute('data-model-browser-lora-index');
            const isLora = loraIndexRaw !== null;
            const index = Number(loraIndexRaw);
            const key = isLora ? '' : (trigger.getAttribute('data-model-browser-param') || '');
            const selector = isLora
                ? `[data-config-lora-model="${index}"]`
                : `[data-config-param="${call(modelBrowserSource, 'cssEscape', key, key)}"]`;
            const select = call(modelBrowserSource, 'getConfigSelect', null, nodeEl, selector);
            const choices = Array.from(select?.options || [])
                .map(option => option.value || option.textContent || '')
                .filter(Boolean);
            const type = isLora ? 'lora' : modelBrowserTypeForConfigKey(key);
            const labelByKey = {
                base_model: t('Base Model', '基础模型'),
                refiner_model: t('Refiner', '精修模型'),
                clip_model: 'CLIP',
                vae: 'VAE',
                upscale_model: t('Upscale Model', '放大模型')
            };
            const title = isLora
                ? t('Browse LoRA models', '浏览 LoRA 模型')
                : t('Browse {label}', '浏览 {label}').replace('{label}', labelByKey[key] || key || t('Model', '模型'));
            const catalog = node.config?.catalog || call(modelBrowserSource, 'getModelCatalog', {});
            const targetPreset = call(configSource, 'getConfigTargetPreset', null, node);
            const currentModelNames = currentModelBrowserNames(node, isLora, select, key);
            browser.open({
                type,
                title,
                container: call(modelBrowserSource, 'getRoot', null) || call(modelBrowserSource, 'getDocumentBody', null),
                context: {
                    __lang: call(languageSource, 'getLanguage', 'en'),
                    catalog,
                    choices,
                    use_model_filter: call(modelBrowserSource, 'modelConfigUsesFilter', false, node),
                    current_model_names: currentModelNames,
                    engine: catalog.engine || undefined,
                    task_method: catalog.task_method || undefined,
                    preset_node: targetPreset
                        ? call(modelBrowserSource, 'serializePresetForRun', undefined, targetPreset)
                        : undefined
                },
                onSelect: item => {
                    const value = item?.name || '';
                    if (!value) return;
                    if (select && !Array.from(select.options || []).some(option => option.value === value)) {
                        select.add(call(modelBrowserSource, 'createOption', { value, textContent: value }, value));
                    }
                    if (select) {
                        select.value = value;
                        eventCall('syncModelSelectTitle', undefined, select);
                    }
                    if (isLora) updateConfigLora(node.id, index, 'model', value);
                    else updateConfigParam(node.id, key, value, 'text', { render: false });
                    eventCall('showToast', undefined, t('Model selected.', '已选择模型。'));
                }
            });
            return true;
        }

        function handleModelBrowserButtonClick(node, nodeEl, evt) {
            if (!node || node.type !== 'config' || node.config_kind !== 'models') return false;
            const button = evt?.target?.closest?.('[data-model-browser-param],[data-model-browser-lora-index]');
            if (!button) return false;
            evt.preventDefault();
            evt.stopPropagation();
            return openModelBrowserForConfigField(node, button, nodeEl);
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

        function handleNodeConfigFieldEvent(nodeEl, node, evt, eventType) {
            if (!node || !evt?.target) return false;
            const target = evt.target;
            if (eventType === 'click') {
                const configMode = target.closest('[data-config-mode]');
                if (!configMode) return false;
                evt.preventDefault();
                updateConfigParam(node.id, 'edit_mode', configMode.getAttribute('data-config-mode'), 'text');
                return true;
            }
            if (!['input', 'change'].includes(eventType)) return false;
            if (eventType === 'change') {
                const configMode = target.closest('[data-config-mode]');
                if (configMode) {
                    updateConfigParam(node.id, 'edit_mode', configMode.getAttribute('data-config-mode'), 'text');
                    return true;
                }
            }
            const styleSearch = target.closest('[data-style-config-search]');
            if (styleSearch && node.type === 'config' && node.config_kind === 'styles') {
                eventCall('filterStylesConfigList', undefined, nodeEl, styleSearch.value);
                return true;
            }
            const styleToggle = target.closest('[data-config-style]');
            if (styleToggle && node.type === 'config' && node.config_kind === 'styles') {
                updateStylesConfigSelection(node.id, styleToggle.getAttribute('data-config-style'), styleToggle.checked);
                return true;
            }
            const modelFilterToggle = target.closest('[data-config-model-filter]');
            if (modelFilterToggle && node.type === 'config' && node.config_kind === 'models') {
                eventCall('setModelConfigFilter', undefined, node.id, modelFilterToggle.checked);
                return true;
            }
            const configParam = target.closest('[data-config-param]');
            if (configParam) {
                if (configParam.disabled) return true;
                eventCall('syncModelSelectTitle', undefined, configParam);
                eventCall('syncTwinParamInputs', undefined, configParam, '[data-config-param]');
                const key = configParam.getAttribute('data-config-param');
                const liveResolutionParam = node.type === 'config' && node.config_kind === 'resolution'
                    && ['width', 'height', 'multiplier'].includes(key);
                updateConfigParam(node.id, key, configParam.type === 'checkbox' ? configParam.checked : configParam.value,
                    configParam.type, liveResolutionParam ? { render: false } : undefined);
                if (liveResolutionParam) refreshResolutionConfigNodeDom(nodeEl, getNode(node.id) || node);
                return true;
            }
            const loraModel = target.closest('[data-config-lora-model]');
            if (loraModel) {
                eventCall('syncModelSelectTitle', undefined, loraModel);
                updateConfigLora(node.id, Number(loraModel.getAttribute('data-config-lora-model')), 'model', loraModel.value);
                return true;
            }
            const loraWeight = target.closest('[data-config-lora-weight]');
            if (loraWeight) {
                updateConfigLora(node.id, Number(loraWeight.getAttribute('data-config-lora-weight')), 'weight', Number(loraWeight.value));
                return true;
            }
            const loraEnabled = target.closest('[data-config-lora-enabled]');
            if (loraEnabled) {
                updateConfigLora(node.id, Number(loraEnabled.getAttribute('data-config-lora-enabled')), 'enabled', loraEnabled.checked);
                return true;
            }
            return false;
        }

        return { setStylesConfigSelection, updateStylesConfigSelection, resetStylesConfigSelection,
            handleStylesConfigAction, handleStylesConfigActionClick, handleModelBrowserButtonClick,
            updateConfigParam, updateConfigLora,
            handleNodeConfigFieldEvent, refreshResolutionConfigNodeDom };
    }

    window.SimpAICanvasWorkbenchConfigEdit = Object.assign(
        {}, window.SimpAICanvasWorkbenchConfigEdit || {}, { createCanvasConfigEditController }
    );
})();
