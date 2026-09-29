(function () {
    'use strict';

    function createCanvasNodeParamController(context) {
        const scope = context || {};
        const sourceObject = (name) => {
            const value = scope[name];
            return value && typeof value === 'object' ? value : {};
        };
        const languageSource = sourceObject('languageSource');
        const languageCall = (name, fallback, ...args) => typeof languageSource[name] === 'function'
            ? languageSource[name](...args)
            : fallback;
        const getLanguageState = (...args) => languageCall('getLanguageState', { __lang: 'en' }, ...args);
        const t = (...args) => {
            const en = args[0] || '';
            const cn = args.length > 1 ? args[1] : en;
            const state = args.length > 2 ? args[2] : getLanguageState();
            return languageCall('t', cn || en, en, cn, state);
        };
        const nodeSource = sourceObject('nodeSource');
        const projectSource = sourceObject('projectSource');
        const nodeCall = (name, fallback, ...args) => typeof nodeSource[name] === 'function'
            ? nodeSource[name](...args)
            : fallback;
        const configSource = sourceObject('configSource');
        const configCall = (name, fallback, ...args) => typeof configSource[name] === 'function'
            ? configSource[name](...args)
            : fallback;
        const serializationSource = sourceObject('serializationSource');
        const cloneRunValue = (value, fallback) => typeof serializationSource.cloneRunValue === 'function'
            ? serializationSource.cloneRunValue(value, fallback)
            : JSON.parse(JSON.stringify(value ?? fallback));
        const patchSource = sourceObject('patchSource');
        const patchCall = (name, fallback, ...args) => typeof patchSource[name] === 'function'
            ? patchSource[name](...args)
            : fallback;
        const historySource = sourceObject('historySource');
        const historyCall = (name, fallback, ...args) => typeof historySource[name] === 'function'
            ? historySource[name](...args)
            : fallback;
        const persistenceSource = sourceObject('persistenceSource');
        const persistenceCall = (name, fallback, ...args) => typeof persistenceSource[name] === 'function'
            ? persistenceSource[name](...args)
            : fallback;
        const renderSource = sourceObject('renderSource');
        const renderCall = (name, fallback, ...args) => typeof renderSource[name] === 'function'
            ? renderSource[name](...args)
            : fallback;
        const uiStateSource = sourceObject('uiStateSource');
        const uiStateCall = (name, fallback, ...args) => typeof uiStateSource[name] === 'function'
            ? uiStateSource[name](...args)
            : fallback;
        const actionSource = sourceObject('actionSource');
        const actionCall = (name, fallback, ...args) => typeof actionSource[name] === 'function'
            ? actionSource[name](...args)
            : fallback;
        const presetThemeSource = sourceObject('presetThemeSource');
        const presetThemeCall = (name, fallback, ...args) => typeof presetThemeSource[name] === 'function'
            ? presetThemeSource[name](...args)
            : fallback;
        const utilitySource = sourceObject('utilitySource');
        const utilityCall = (name, fallback, ...args) => typeof utilitySource[name] === 'function'
            ? utilitySource[name](...args)
            : fallback;
        const domSource = sourceObject('domSource');
        const getNode = (id) => nodeCall('getNode', null, id);
        const getProject = () => projectSource.getProject?.() || {};
        const getInspector = () => nodeCall('getInspector', null);
        const getSelectedNodeId = () => nodeCall('getSelectedNodeId', null);
        const classicOutpaintDirs = (() => {
            const value = configCall('getClassicOutpaintDirs', []);
            return Array.isArray(value) ? value : [];
        })();
        const buildNodeParamsPatch = (node, options) => patchCall('buildNodeParamsPatch', {}, node, options) || {};
        const buildNodeFieldPatch = (node, key, value) => patchCall('buildNodeFieldPatch', {}, node, key, value) || {};
        const buildClassicNodeStatePatch = (node, options) => patchCall('buildClassicNodeStatePatch', {}, node, options) || {};
        const buildMaskStatePatch = (node, options) => patchCall('buildMaskStatePatch', {}, node, options) || {};
        const buildMaskStatus = (...args) => patchCall('buildMaskStatus', null, ...args);
        const buildTranslationStatePatch = (node, options) => patchCall('buildTranslationStatePatch', {}, node, options) || {};
        const buildTagCartStatePatch = (node, options) => patchCall('buildTagCartStatePatch', {}, node, options) || {};
        const buildWd14StatePatch = (node, options) => patchCall('buildWd14StatePatch', {}, node, options) || {};
        const buildTextNodeStatePatch = (node, options) => patchCall('buildTextNodeStatePatch', {}, node, options) || {};
        const buildQwenTtsStatePatch = (node, options) => patchCall('buildQwenTtsStatePatch', {}, node, options) || {};
        const buildTextMergeStatePatch = (node, options) => patchCall('buildTextMergeStatePatch', {}, node, options) || {};
        const mergeCanvasRunStatus = (...args) => patchCall('mergeCanvasRunStatus', null, ...args);
        const buildPresetRuntimePatch = (node, options) => patchCall('buildPresetRuntimePatch', {}, node, options) || {};
        const buildPresetDefinitionPatch = (node, options) => patchCall('buildPresetDefinitionPatch', {}, node, options) || {};

        function fieldValue(field) {
            return field?.type === 'checkbox' ? !!field.checked : field?.value;
        }

        function updateNodeParam(nodeId, key, value, inputType) {
            const node = getNode(nodeId);
            if (!node || nodeCall('isNodeLocked', false, node)) return;
            historyCall('pushHistoryBatch', undefined, `node-param:${nodeId}:${key}`, 'Edit node parameter');
            const paramsPatch = {};
            if (inputType === 'checkbox') {
                paramsPatch[key] = !!value;
            } else if (inputType === 'number') {
                const parsed = Number(value);
                paramsPatch[key] = Number.isFinite(parsed) ? parsed : value;
            } else {
                paramsPatch[key] = value;
            }
            Object.assign(node, buildNodeParamsPatch(node, { paramsPatch }));
            if (key === 'seed_random') {
                uiStateCall('mutate', undefined, { inspector: true });
                return;
            }
            persistenceCall('scheduleSave');
        }

        function updateTextMergeSeparator(nodeId, value) {
            const node = getNode(nodeId);
            if (!node || node.type !== 'text_merge' || nodeCall('isNodeLocked', false, node)) return;
            historyCall('pushHistoryBatch', undefined, `text-merge:${nodeId}:separator`, 'Edit text merge separator');
            Object.assign(node, buildTextMergeStatePatch(node, {
                paramsPatch: { separator: String(value ?? '') }
            }));
            persistenceCall('scheduleSave');
            actionCall('syncTextMergeOutputDom', undefined, node);
            actionCall('refreshTextMergeDependents', undefined, node.id);
        }

        function updateTextNodeValue(nodeId, value) {
            const node = getNode(nodeId);
            if (!node || !nodeCall('isTextOutputNode', false, node) || nodeCall('isNodeLocked', false, node)) return;
            if (['text', 'translation', 'tag_cart'].includes(node.type)
                && nodeCall('getTextNodeInputSource', null, node)
                && node.type === 'text') return;
            historyCall('pushHistoryBatch', undefined, `text:${nodeId}:value`, node.type === 'wd14'
                ? 'Edit WD14 output'
                : (node.type === 'vlm'
                    ? 'Edit VLM output'
                    : (node.type === 'translation'
                        ? 'Edit translation output'
                        : (node.type === 'tag_cart' ? 'Edit Tag Cart output' : 'Edit text node'))));
            const textPatch = {
                value: String(value || ''),
                updated_at: utilityCall('nowIso', new Date().toISOString())
            };
            if (node.type === 'translation') {
                Object.assign(node, buildTranslationStatePatch(node, { textPatch }));
            } else if (node.type === 'tag_cart') {
                Object.assign(node, buildTagCartStatePatch(node, { textPatch }));
            } else if (node.type === 'wd14') {
                Object.assign(node, buildWd14StatePatch(node, { textPatch }));
            } else {
                Object.assign(node, buildTextNodeStatePatch(node, { textPatch }));
            }
            persistenceCall('scheduleSave');
            actionCall('refreshTextMergeDependents', undefined, node.id);
        }

        function updateTranslationInput(nodeId, value) {
            const node = getNode(nodeId);
            if (!node || node.type !== 'translation' || nodeCall('isNodeLocked', false, node)
                || nodeCall('getTextNodeInputSource', null, node)) return;
            historyCall('pushHistoryBatch', undefined, `translation:${nodeId}:input`, 'Edit translation input');
            Object.assign(node, buildTranslationStatePatch(node, { inputText: String(value || '') }));
            persistenceCall('scheduleSave');
        }

        function updateTranslationParam(nodeId, key, value) {
            const node = getNode(nodeId);
            if (!node || node.type !== 'translation' || !key || nodeCall('isNodeLocked', false, node)) return;
            historyCall('pushHistoryBatch', undefined, `translation:${nodeId}:${key}`, 'Edit translation parameter');
            Object.assign(node, buildTranslationStatePatch(node, { paramsPatch: { [key]: value } }));
            persistenceCall('scheduleSave');
        }

        function updateTagCartParam(nodeId, key, value) {
            const node = getNode(nodeId);
            if (!node || node.type !== 'tag_cart' || !key || nodeCall('isNodeLocked', false, node)) return;
            historyCall('pushHistoryBatch', undefined, `tag-cart:${nodeId}:${key}`, 'Edit Tag Cart parameter');
            Object.assign(node, buildTagCartStatePatch(node, { paramsPatch: { [key]: value } }));
            persistenceCall('scheduleSave');
        }

        function syncNodeParamControlDom(nodeId, key, value) {
            const nodesLayer = domSource.getNodesLayer?.();
            if (!nodeId || !key || !nodesLayer) return;
            const cssEscape = typeof domSource.cssEscape === 'function'
                ? domSource.cssEscape
                : text => String(text);
            const nodeEl = nodesLayer.querySelector(`[data-node-id="${cssEscape(nodeId)}"]`);
            if (!nodeEl) return;
            nodeEl.querySelectorAll(`[data-node-param="${cssEscape(key)}"]`).forEach((field) => {
                if (!field) return;
                if (field.type === 'checkbox') {
                    field.checked = value === true || value === 'true' || value === 1 || value === '1';
                } else if ('value' in field && field.value !== String(value ?? '')) {
                    field.value = String(value ?? '');
                }
            });
        }

        function updateWd14Param(nodeId, key, value, inputType) {
            const node = getNode(nodeId);
            if (!node || node.type !== 'wd14' || !key || nodeCall('isNodeLocked', false, node)) return;
            historyCall('pushHistoryBatch', undefined, `wd14:${nodeId}:${key}`, 'Edit WD14 parameter');
            let nextValue = value;
            if (inputType === 'number') {
                const parsed = Number(value);
                nextValue = Number.isFinite(parsed) ? utilityCall('clamp', parsed, parsed, 0, 1) : value;
            }
            Object.assign(node, buildWd14StatePatch(node, { paramsPatch: { [key]: nextValue } }));
            if (key === 'seed_random') {
                uiStateCall('mutate', undefined, { inspector: true });
                return;
            }
            syncNodeParamControlDom(nodeId, key, node.params[key]);
            actionCall('refreshPresetSpecialNodeDom', undefined, node, { syncViewer: false });
            persistenceCall('scheduleSave');
        }

        function updateMaskParam(nodeId, key, value, inputType) {
            const node = getNode(nodeId);
            if (!node || node.type !== 'mask' || !key || nodeCall('isNodeLocked', false, node)) return;
            historyCall('pushHistoryBatch', undefined, `mask:${nodeId}:${key}`, 'Edit mask parameter');
            const paramsPatch = {};
            if (inputType === 'checkbox') {
                paramsPatch[key] = !!value;
            } else if (inputType === 'number' || ['box_threshold', 'text_threshold', 'sam_max_detections', 'dino_erode_or_dilate'].includes(key)) {
                const parsed = Number(value);
                paramsPatch[key] = Number.isFinite(parsed) ? parsed : value;
            } else {
                paramsPatch[key] = value;
            }
            if (key === 'mask_model') {
                Object.assign(node, buildMaskStatePatch(node, {
                    paramsPatch,
                    asset: null,
                    status: buildMaskStatus('idle', 'Mask model changed. Generate a new mask.')
                }));
                uiStateCall('mutate');
                return;
            }
            Object.assign(node, buildMaskStatePatch(node, { paramsPatch }));
            persistenceCall('scheduleSave');
        }

        function updateQwenTtsParam(nodeId, key, value, inputType) {
            const node = getNode(nodeId);
            if (!nodeCall('isQwenTtsNode', false, node) || !key || nodeCall('isNodeLocked', false, node)) return;
            historyCall('pushHistoryBatch', undefined, `qwen-tts:${nodeId}:${key}`, 'Edit Qwen TTS parameter');
            const paramsPatch = {};
            if (inputType === 'checkbox') {
                paramsPatch[key] = !!value;
            } else if (inputType === 'number' || inputType === 'range') {
                const parsed = Number(value);
                paramsPatch[key] = Number.isFinite(parsed) ? parsed : value;
            } else {
                paramsPatch[key] = value;
            }
            const runState = nodeCall('nodeStatusState', '', node);
            const isRunActive = nodeCall('isCanvasRunActiveState', false, runState);
            if (key === 'style_preset') {
                const instruction = actionCall('qwenTtsStylePresetInstruction', '', value);
                paramsPatch.instruct = String(value || '').trim() ? instruction : '';
                const patchOptions = { paramsPatch };
                if (!isRunActive) {
                    patchOptions.status = mergeCanvasRunStatus(node.status, 'idle', 'Qwen TTS character preset applied. Ready to generate audio.');
                }
                Object.assign(node, buildQwenTtsStatePatch(node, patchOptions));
                uiStateCall('mutate', undefined, { inspector: true });
                return;
            }
            const patchOptions = { paramsPatch };
            if (!isRunActive) {
                patchOptions.status = mergeCanvasRunStatus(node.status, 'idle', 'Qwen TTS parameters changed. Ready to generate audio.');
            }
            Object.assign(node, buildQwenTtsStatePatch(node, patchOptions));
            if (key === 'seed_random') {
                uiStateCall('mutate', undefined, { inspector: true });
                return;
            }
            persistenceCall('scheduleSave');
        }

        function handleClassicModeChange(nodeId, newMode) {
            const node = getNode(nodeId);
            if (!node || node.type !== 'classic' || nodeCall('isNodeLocked', false, node)) return;
            historyCall('pushHistory', undefined, 'Change classic mode');
            const nextUploadSlots = cloneRunValue(node.upload_slots || {}, {});
            const oldSlots = configCall('getVisibleClassicUploadSlots', [], node) || [];
            oldSlots.forEach(slot => {
                if (!nextUploadSlots[slot.key]) return;
                const edge = (getProject().edges || []).find(item => item.type === 'upload'
                    && item.to === nodeId && item.slot === slot.key);
                if (edge) actionCall('deleteEdge', undefined, edge.id, { render: false });
                delete nextUploadSlots[slot.key];
            });
            const modeProbe = Object.assign({}, node, { classic_mode: newMode, upload_slots: nextUploadSlots });
            (configCall('getVisibleClassicUploadSlots', [], modeProbe) || []).forEach(slot => {
                if (!nextUploadSlots[slot.key]) nextUploadSlots[slot.key] = null;
            });
            Object.assign(node, buildClassicNodeStatePatch(node, {
                classicMode: newMode,
                uploadSlots: nextUploadSlots
            }));
            if (newMode === 'enhance') {
                const paramsPatch = {};
                if (node.params?.enhance_uov_method === undefined) paramsPatch.enhance_uov_method = 'Disabled';
                if (node.params?.enhance_uov_strength === undefined) paramsPatch.enhance_uov_strength = 0.5;
                if (node.params?.enhance_uov_processing_order === undefined) paramsPatch.enhance_uov_processing_order = 'Before First Enhancement';
                if (node.params?.enhance_uov_prompt_type === undefined) paramsPatch.enhance_uov_prompt_type = 'Original Prompts';
                Object.assign(node, buildNodeParamsPatch(node, { paramsPatch }));
                [0, 1, 2].forEach(index => {
                    const region = configCall('getClassicEnhanceRegionValues', {}, node, index);
                    configCall('applyClassicEnhanceRegionValues', undefined, node, index, region,
                        node.enhance_detection_configs?.[String(index)] || null);
                });
            }
            uiStateCall('mutate');
        }

        function handleUovMethodChange(nodeId, newMethod) {
            const node = getNode(nodeId);
            if (!node || node.type !== 'classic' || nodeCall('isNodeLocked', false, node)) return;
            historyCall('pushHistory', undefined, 'Change UOV method');
            const paramsPatch = { uov_method: newMethod };
            const deleteKeys = [];
            if (newMethod.includes('Vary') || (newMethod.includes('Upscale') && !newMethod.includes('Fast'))) {
                if (newMethod.includes('Vary')) {
                    paramsPatch.uov_denoise_strength = newMethod.includes('Strong') ? 0.85 : 0.5;
                } else {
                    paramsPatch.uov_denoise_strength = 0.2;
                }
            } else {
                deleteKeys.push('uov_denoise_strength');
            }
            Object.assign(node, buildNodeParamsPatch(node, { paramsPatch, deleteKeys }));
            uiStateCall('mutate');
        }

        function handleEnhanceUovParamChange(nodeId, key, value, inputType) {
            const node = getNode(nodeId);
            if (!node || node.type !== 'classic' || nodeCall('isNodeLocked', false, node)) return;
            updateNodeParam(nodeId, key, inputType === 'checkbox'
                ? !!value
                : (inputType === 'number' || inputType === 'range' ? Number(value) : value), inputType);
            if (key === 'enhance_uov_method' || key === 'enhance_uov_processing_order') {
                renderCall('renderAll', undefined, { inspector: true });
            }
        }

        function applyInpaintModeDefaults(node, newMode) {
            if (!node || node.classic_mode !== 'inpaint') return;
            const normalizedMode = configCall('normalizeClassicInpaintMode', newMode, newMode);
            const imDefaults = configCall('getInpaintModeDefaults', {}, normalizedMode, node) || {};
            const paramsPatch = {
                inpaint_mode: normalizedMode,
                inpaint_denoising_strength: imDefaults.denoise,
                inpaint_respective_field: imDefaults.respective,
                inpaint_engine: imDefaults.engine,
                inpaint_disable_initial_latent: imDefaults.disableLatent
            };
            if (!imDefaults.showAdditionalPrompt) paramsPatch.inpaint_additional_prompt = '';
            if (!imDefaults.showOutpaint) {
                paramsPatch.outpaint_selections = [];
                classicOutpaintDirs.forEach(dir => {
                    paramsPatch[`outpaint_${dir.toLowerCase()}`] = false;
                });
            }
            Object.assign(node, buildNodeParamsPatch(node, { paramsPatch }));
            uiStateCall('mutate');
        }

        function handleInpaintModeChange(nodeId, newMode) {
            const node = getNode(nodeId);
            if (!node || node.type !== 'classic' || nodeCall('isNodeLocked', false, node)) return;
            historyCall('pushHistory', undefined, 'Change inpaint mode');
            applyInpaintModeDefaults(node, newMode);
        }

        function syncTwinParamInputs(field, selector) {
            if (!selector) return;
            const attrName = selector.slice(1, -1);
            const key = field.getAttribute(attrName);
            if (key == null) return;
            const wrap = field.closest('.sai-range-pair');
            if (!wrap) return;
            wrap.querySelectorAll(selector).forEach((other) => {
                if (other !== field && other.getAttribute(attrName) === key) other.value = field.value;
            });
        }

        function handleCanvasRelightLightButtonClick(node, button, attrName) {
            if (!node || !button || nodeCall('isNodeLocked', false, node)) return false;
            const key = button.getAttribute(attrName);
            if (!key) return false;
            const rawValue = button.getAttribute('data-relight-light-value') || button.value;
            const value = Number(actionCall('canvasRelightLightValue', '10', rawValue) || '10');
            updateNodeParam(node.id, key, value, 'number');
            uiStateCall('mutate', undefined, { inspector: true });
            return true;
        }

        function handleCanvasRelightLightButtonEvent(node, evt) {
            const button = evt?.target?.closest?.('.sai-canvas-relight-light-button[data-node-param]');
            if (!button) return false;
            evt.preventDefault();
            evt.stopPropagation();
            handleCanvasRelightLightButtonClick(node, button, 'data-node-param');
            return true;
        }

        function presetThemeDefaults(node, theme) {
            const schema = presetThemeCall('getPresetSchema', {}, node) || {};
            const perTheme = schema.per_theme && typeof schema.per_theme === 'object' ? schema.per_theme : {};
            const themeInfo = theme
                ? (perTheme[theme] || {})
                : presetThemeCall('getPresetThemeInfo', {}, node);
            return themeInfo.defaults && typeof themeInfo.defaults === 'object' ? themeInfo.defaults : {};
        }

        function getSceneThemeInfoForPresetNode(preset) {
            if (!preset || preset.type !== 'preset') return {};
            const schema = preset.schema && typeof preset.schema === 'object' ? preset.schema : {};
            const themes = Array.isArray(schema.themes) ? schema.themes : [];
            const theme = preset.runtime?.scene_theme || schema.default_theme || themes[0] || '';
            const perTheme = schema.per_theme && typeof schema.per_theme === 'object' ? schema.per_theme : {};
            return perTheme[theme] && typeof perTheme[theme] === 'object' ? perTheme[theme] : {};
        }

        function getSceneGenerationConfigPropsForPresetNode(preset, key) {
            const themeInfo = getSceneThemeInfoForPresetNode(preset);
            const props = themeInfo.generation_config_props && typeof themeInfo.generation_config_props === 'object'
                ? themeInfo.generation_config_props[key]
                : null;
            return props && typeof props === 'object' ? props : null;
        }

        function getSceneGenerationConfigDefaultForPresetNode(preset, key) {
            const themeInfo = getSceneThemeInfoForPresetNode(preset);
            const defaults = themeInfo.defaults && typeof themeInfo.defaults === 'object' ? themeInfo.defaults : {};
            if (Object.prototype.hasOwnProperty.call(defaults, key)) return defaults[key];
            if (key === 'overwrite_step' && Object.prototype.hasOwnProperty.call(defaults, 'scene_steps')) return defaults.scene_steps;
            return undefined;
        }

        function generationConfigValueForPresetSchema(preset, key, value) {
            if (key !== 'overwrite_step') return value;
            const props = getSceneGenerationConfigPropsForPresetNode(preset, key);
            if (!props || props.interactive !== false) return value;
            const fixedValue = props.value ?? getSceneGenerationConfigDefaultForPresetNode(preset, key);
            return fixedValue === undefined ? value : fixedValue;
        }

        function shouldApplyPresetThemeDefault(current, param, previousDefaults) {
            const defaultValue = param?.default;
            const equalsDefault = value => defaultValue !== undefined
                && (value === defaultValue || String(value) === String(defaultValue));
            if (current === undefined || current === null || current === '') return true;
            if (equalsDefault(current)) return true;
            if (previousDefaults && Object.prototype.hasOwnProperty.call(previousDefaults, param.key)) {
                const previousValue = previousDefaults[param.key];
                return previousValue !== undefined
                    && (current === previousValue || String(current) === String(previousValue));
            }
            return false;
        }

        function setPresetTheme(nodeId, theme) {
            const node = getNode(nodeId);
            if (!node || node.type !== 'preset') return false;
            if (nodeCall('isNodeLocked', false, node)) {
                uiStateCall('showToast', undefined, t('Locked node cannot be edited.', '已锁定节点无法编辑。'));
                return false;
            }
            const previousTheme = presetThemeCall('getPresetTheme', '', node);
            const previousDefaults = presetThemeDefaults(node, previousTheme);
            historyCall('pushHistory', undefined, 'Change preset theme');
            const themeInfo = presetThemeCall('getPresetThemeInfo', {}, node) || {};
            Object.assign(node, buildPresetRuntimePatch(node, {
                runtimePatch: Object.assign(
                    { scene_theme: theme },
                    themeInfo.task_method ? { task_method: themeInfo.task_method } : {}
                )
            }));
            const defaults = presetThemeDefaults(node, theme);
            const paramsPatch = {};
            const visibleParams = presetThemeCall('getVisiblePresetParams', [], node) || [];
            visibleParams.forEach((param) => {
                if (!Object.prototype.hasOwnProperty.call(defaults, param.key)) return;
                if (shouldApplyPresetThemeDefault(node.params?.[param.key], param, previousDefaults)) {
                    paramsPatch[param.key] = defaults[param.key];
                }
            });
            Object.assign(node, buildNodeParamsPatch(node, { paramsPatch }));
            const specialKind = presetThemeCall('ensurePresetSpecialControllerState', '', node);
            if (specialKind) {
                Object.assign(node, buildPresetDefinitionPatch(node, {
                    w: Math.max(node.w || 0, 430),
                    h: Math.max(node.h || 0, 720)
                }));
            }
            uiStateCall('mutate', undefined);
            return true;
        }

        function handlePresetThemeChange(node, evt) {
            if (!node || !evt?.target) return false;
            const theme = evt.target.closest?.('[data-node-theme]');
            if (!theme) return false;
            setPresetTheme(node.id, theme.value);
            return true;
        }

        function resetPresetNodeParam(node, key) {
            if (!node || !key || nodeCall('isNodeLocked', false, node)) return;
            historyCall('pushHistoryBatch', undefined, `preset-param-reset:${node.id}:${key}`, 'Reset parameter');
            Object.assign(node, buildNodeParamsPatch(node, {
                paramsPatch: key === 'seed_random' ? { seed_random: true } : {},
                deleteKeys: key === 'seed_random' ? [] : [key]
            }));
            uiStateCall('mutate', undefined, { inspector: true });
            renderCall('requestCanvasFrame', undefined, () => {
                const latest = getNode(node.id);
                if (!latest) return;
                renderCall('renderNodes');
                renderCall('renderEdges');
                if (getSelectedNodeId() === latest.id) renderCall('renderInspector');
            });
        }

        function handlePresetParamResetClick(node, evt) {
            if (!evt?.target) return false;
            const button = evt.target.closest?.('[data-param-reset]');
            if (!button) return false;
            evt.preventDefault();
            evt.stopPropagation();
            resetPresetNodeParam(node, button.getAttribute('data-param-reset'));
            return true;
        }

        function bindInspectorParamButtonEvents(inspector) {
            if (!inspector || typeof inspector.querySelectorAll !== 'function') return false;
            inspector.querySelectorAll('[data-param-reset]').forEach((button) => {
                button.addEventListener('click', (evt) => {
                    evt.preventDefault();
                    evt.stopPropagation();
                    resetPresetNodeParam(getNode(getSelectedNodeId()), button.getAttribute('data-param-reset'));
                });
            });
            inspector.querySelectorAll('.sai-canvas-relight-light-button[data-inspector-param]').forEach((button) => {
                button.addEventListener('click', (evt) => {
                    evt.preventDefault();
                    evt.stopPropagation();
                    handleCanvasRelightLightButtonClick(getNode(getSelectedNodeId()), button, 'data-inspector-param');
                });
            });
            return true;
        }

        function resetVlmParamToDefault(node, key, nodeEl) {
            if (!node || node.type !== 'vlm' || nodeCall('isNodeLocked', false, node)) return false;
            const nextValue = actionCall('vlmDefaultParamValue', undefined, key, node);
            if (nextValue === undefined) return false;
            actionCall('updateVlmParam', undefined, node.id, key, nextValue, 'number');
            const current = nodeCall('getNode', null, node.id) || node;
            actionCall('refreshVlmChatReadabilityDom', undefined, nodeEl, current);
            persistenceCall('scheduleSave');
            return true;
        }

        function handleVlmParamResetClick(node, nodeEl, evt) {
            if (!node || node.type !== 'vlm' || !evt?.target) return false;
            const button = evt.target.closest?.('[data-vlm-param-reset]');
            if (!button) return false;
            evt.preventDefault();
            evt.stopPropagation();
            resetVlmParamToDefault(node, button.getAttribute('data-vlm-param-reset') || '', nodeEl);
            return true;
        }

        function injectParamResetButtons(scope) {
            if (!scope || typeof scope.querySelectorAll !== 'function') return;
            const document = typeof domSource.getDocument === 'function'
                ? domSource.getDocument()
                : (scope.ownerDocument || nodeCall('getDocument', null));
            scope.querySelectorAll('label').forEach((label) => {
                if (label.querySelector('.sai-param-reset,[data-timeline-reset],[data-timeline-clip-reset]')) return;
                const field = label.querySelector('[data-node-param],[data-inspector-param]');
                if (!field || field.disabled) return;
                const key = field.getAttribute('data-node-param') || field.getAttribute('data-inspector-param') || '';
                if (!key) return;
                const labelText = label.querySelector(':scope > span') || label.querySelector('span');
                if (!labelText || !document?.createElement) return;
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'sai-param-reset';
                button.setAttribute('data-param-reset', key);
                button.title = t('Reset to default', '恢复默认值');
                button.innerHTML = '<i class="fa-solid fa-rotate-left"></i>';
                labelText.appendChild(button);
            });
        }

        function updateClassicOutpaintParam(node, key, field, options = {}) {
            if (!node || node.type !== 'classic' || !key || field?.type !== 'checkbox') return false;
            const currentParams = node.params && typeof node.params === 'object' && !Array.isArray(node.params) ? node.params : {};
            const nextParams = Object.assign({}, currentParams, { [key]: !!field.checked });
            const outpaintSelections = classicOutpaintDirs.filter(dir => !!nextParams[`outpaint_${dir.toLowerCase()}`]);
            Object.assign(node, buildNodeParamsPatch(node, {
                paramsPatch: { [key]: !!field.checked, outpaint_selections: outpaintSelections }
            }));
            if (options.scheduleSave !== false) persistenceCall('scheduleSave');
            return true;
        }

        function handleNodeParamFieldChange(node, field, options = {}) {
            if (!node || !field) return false;
            const paramKey = field.getAttribute?.('data-node-param');
            if (!paramKey) return false;
            if (paramKey === 'inpaint_mode' && node.type === 'classic') {
                actionCall('handleInpaintModeChange', undefined, node.id, field.value);
                return true;
            }
            if (paramKey === 'uov_method' && node.type === 'classic') {
                actionCall('handleUovMethodChange', undefined, node.id, field.value);
                return true;
            }
            if ((paramKey === 'enhance_uov_method' || paramKey === 'enhance_uov_processing_order') && node.type === 'classic') {
                actionCall('handleEnhanceUovParamChange', undefined, node.id, paramKey, field.value, field.type);
                return true;
            }
            if (updateClassicOutpaintParam(node, paramKey, field, { scheduleSave: options.scheduleOutpaint !== false })) return true;
            actionCall('syncTwinParamInputs', undefined, field, '[data-node-param]');
            updateNodeParam(node.id, paramKey, fieldValue(field), field.type);
            return true;
        }

        function handleNodeParamEvent(nodeEl, node, evt, eventType) {
            if (!node || !evt?.target) return false;
            const target = evt.target;
            const inputEvent = eventType === 'input';
            const changeEvent = eventType === 'change';
            const invoke = (name, ...args) => name === 'updateNodeParam'
                ? updateNodeParam(...args)
                : actionCall(name, undefined, ...args);
            const nodeParam = target.closest?.('[data-node-param]');
            const textValue = target.closest?.('[data-text-value]');
            if (textValue) {
                invoke('updateTextNodeValue', node.id, textValue.value);
                return true;
            }
            const textMergeSeparator = target.closest?.('[data-text-merge-separator]');
            if (textMergeSeparator) {
                invoke('updateTextMergeSeparator', node.id, textMergeSeparator.value);
                return true;
            }
            const translationInput = target.closest?.('[data-translation-input]');
            if (translationInput) {
                invoke('updateTranslationInput', node.id, translationInput.value);
                return true;
            }
            const translationParam = target.closest?.('[data-translation-param]');
            if (translationParam) {
                invoke('updateTranslationParam', node.id, translationParam.getAttribute('data-translation-param'), translationParam.value);
                return true;
            }
            const tagCartParam = target.closest?.('[data-tagcart-param]');
            if (tagCartParam) {
                invoke('updateTagCartParam', node.id, tagCartParam.getAttribute('data-tagcart-param'), tagCartParam.value);
                return true;
            }
            const wildcardParam = inputEvent ? target.closest?.('[data-wildcards-helper-param]') : null;
            if (wildcardParam && node.type === 'wildcards_helper') {
                invoke('updateWildcardsHelperParam', node.id, wildcardParam.getAttribute('data-wildcards-helper-param'), wildcardParam.value, wildcardParam.type);
                return true;
            }
            const wd14Param = target.closest?.('[data-wd14-param]');
            if (wd14Param) {
                invoke('updateWd14Param', node.id, wd14Param.getAttribute('data-wd14-param'), wd14Param.value, wd14Param.type);
                return true;
            }
            if (inputEvent && nodeCall('isDirectorTimelineNode', false, node)) {
                const directorParam = target.closest?.('[data-director-param]');
                if (directorParam) {
                    invoke('syncTwinParamInputs', directorParam, '[data-director-param]');
                    invoke('updateDirectorTimelineParam', node.id, directorParam.getAttribute('data-director-param'), directorParam.value, directorParam.type);
                    return true;
                }
                const directorSegmentParam = target.closest?.('[data-director-segment-param]');
                if (directorSegmentParam) {
                    invoke('syncTwinParamInputs', directorSegmentParam, '[data-director-segment-param]');
                    invoke(
                        'updateDirectorTimelineSegmentParam',
                        node.id,
                        Number(directorSegmentParam.getAttribute('data-director-segment-index') || 0),
                        directorSegmentParam.getAttribute('data-director-segment-param'),
                        fieldValue(directorSegmentParam),
                        directorSegmentParam.type
                    );
                    return true;
                }
            }
            const vlmTemplate = target.closest?.('[data-vlm-system-template]');
            if (vlmTemplate && node.type === 'vlm') {
                invoke('applyVlmSystemPromptTemplate', node, vlmTemplate.value, nodeEl);
                return true;
            }
            const vlmParam = target.closest?.('[data-vlm-param]');
            if (vlmParam) {
                const key = vlmParam.getAttribute('data-vlm-param');
                invoke('handleVlmParamFieldChange', node.id, key, fieldValue(vlmParam), vlmParam.type, nodeEl, vlmParam, { autoConfirm: true, refreshReadability: true });
                return true;
            }
            const maskParam = target.closest?.('[data-mask-param]');
            if (maskParam) {
                invoke('syncTwinParamInputs', maskParam, '[data-mask-param]');
                invoke('updateMaskParam', node.id, maskParam.getAttribute('data-mask-param'), fieldValue(maskParam), maskParam.type);
                return true;
            }
            const sam3VideoParam = target.closest?.('[data-sam3-video-param]');
            if (sam3VideoParam) {
                invoke('syncTwinParamInputs', sam3VideoParam, '[data-sam3-video-param]');
                invoke('updateSam3VideoMaskParam', node.id, sam3VideoParam.getAttribute('data-sam3-video-param'), fieldValue(sam3VideoParam), sam3VideoParam.type);
                return true;
            }
            const cameraMotionParam = target.closest?.('[data-camera-motion-param]');
            if (cameraMotionParam) {
                invoke('syncTwinParamInputs', cameraMotionParam, '[data-camera-motion-param]');
                invoke('updateCameraMotionParam', node.id, cameraMotionParam.getAttribute('data-camera-motion-param'), cameraMotionParam.value, cameraMotionParam.type);
                return true;
            }
            const classicIpType = changeEvent ? target.closest?.('[data-classic-ip-type]') : null;
            if (classicIpType) {
                invoke('updateNodeParam', node.id, `ip_type_${classicIpType.getAttribute('data-classic-ip-type')}`, classicIpType.value, 'text');
                return true;
            }
            const classicIpStop = target.closest?.('[data-classic-ip-stop]');
            if (classicIpStop) {
                invoke('syncTwinParamInputs', classicIpStop, '[data-classic-ip-stop]');
                invoke('updateNodeParam', node.id, `ip_stop_${classicIpStop.getAttribute('data-classic-ip-stop')}`, Number(classicIpStop.value), 'number');
                return true;
            }
            const classicIpWeight = target.closest?.('[data-classic-ip-weight]');
            if (classicIpWeight) {
                invoke('syncTwinParamInputs', classicIpWeight, '[data-classic-ip-weight]');
                invoke('updateNodeParam', node.id, `ip_weight_${classicIpWeight.getAttribute('data-classic-ip-weight')}`, Number(classicIpWeight.value), 'number');
                return true;
            }
            const classicParam = target.closest?.('[data-classic-param]');
            if (classicParam) {
                const key = classicParam.getAttribute('data-classic-param');
                invoke('syncTwinParamInputs', classicParam, '[data-classic-param]');
                if (changeEvent && key === 'ip_count') {
                    historyCall('pushHistory', undefined, 'Change classic IP count');
                    const maxIpImages = Number(configCall('getClassicIpMaxImages', 4, node)) || 4;
                    Object.assign(node, buildClassicNodeStatePatch(node, {
                        classicIpCount: Math.max(1, Math.min(maxIpImages, Number(classicParam.value) || 1))
                    }));
                    uiStateCall('mutate');
                }
                return true;
            }
            if (!nodeParam) return false;
            if (nodeCall('isQwenTtsNode', false, node)) {
                invoke('syncTwinParamInputs', nodeParam, '[data-node-param]');
                invoke('updateQwenTtsParam', node.id, nodeParam.getAttribute('data-node-param'), fieldValue(nodeParam), nodeParam.type);
                return true;
            }
            const paramKey = nodeParam.getAttribute('data-node-param');
            if (inputEvent && paramKey && paramKey.startsWith('outpaint_') && nodeParam.type === 'checkbox') {
                const currentParams = node.params && typeof node.params === 'object' && !Array.isArray(node.params) ? node.params : {};
                const nextParams = Object.assign({}, currentParams, { [paramKey]: !!nodeParam.checked });
                const outpaintSelections = classicOutpaintDirs.filter(dir => !!nextParams[`outpaint_${dir.toLowerCase()}`]);
                Object.assign(node, buildNodeParamsPatch(node, {
                    paramsPatch: { [paramKey]: !!nodeParam.checked, outpaint_selections: outpaintSelections }
                }));
                return true;
            }
            return handleNodeParamFieldChange(node, nodeParam, { scheduleOutpaint: changeEvent });
        }

        function handleClassicNodeChangeEvent(node, evt) {
            if (!node || !evt?.target) return false;
            const target = evt.target;
            const classicMode = target.closest?.('[data-classic-mode]');
            if (classicMode) {
                actionCall('handleClassicModeChange', undefined, node.id, classicMode.value);
                return true;
            }
            const classicNodeParam = node.type === 'classic'
                ? target.closest?.('[data-node-param="uov_method"],[data-node-param="inpaint_mode"],[data-node-param="enhance_uov_method"],[data-node-param="enhance_uov_processing_order"]')
                : null;
            const classicIpField = target.closest?.('[data-classic-ip-type],[data-classic-ip-stop],[data-classic-ip-weight],[data-classic-param]');
            if (!classicNodeParam && !classicIpField) return false;
            return handleNodeParamEvent(null, node, evt, 'change');
        }

        function handleInspectorParamFieldChange(field) {
            if (!field) return false;
            const nodeId = getSelectedNodeId();
            const node = getNode(nodeId);
            const paramKey = field.getAttribute?.('data-inspector-param');
            if (!paramKey) return false;
            actionCall('syncTwinParamInputs', undefined, field, '[data-inspector-param]');
            if (nodeCall('isQwenTtsNode', false, node)) {
                actionCall('updateQwenTtsParam', undefined, nodeId, paramKey, fieldValue(field), field.type);
                return true;
            }
            if (paramKey === 'inpaint_mode' && node?.type === 'classic') {
                actionCall('handleInpaintModeChange', undefined, nodeId, field.value);
                return true;
            }
            if (paramKey === 'uov_method' && node?.type === 'classic') {
                actionCall('handleUovMethodChange', undefined, nodeId, field.value);
                return true;
            }
            if ((paramKey === 'enhance_uov_method' || paramKey === 'enhance_uov_processing_order') && node?.type === 'classic') {
                actionCall('handleEnhanceUovParamChange', undefined, nodeId, paramKey, field.value, field.type);
                return true;
            }
            if (node?.type === 'classic' && paramKey.startsWith('outpaint_') && field.type === 'checkbox') {
                const currentParams = node.params && typeof node.params === 'object' && !Array.isArray(node.params) ? node.params : {};
                const nextParams = Object.assign({}, currentParams, { [paramKey]: !!field.checked });
                const outpaintSelections = classicOutpaintDirs.filter(dir => !!nextParams[`outpaint_${dir.toLowerCase()}`]);
                Object.assign(node, buildNodeParamsPatch(node, {
                    paramsPatch: { [paramKey]: !!field.checked, outpaint_selections: outpaintSelections }
                }));
                return true;
            }
            updateNodeParam(nodeId, paramKey, fieldValue(field), field.type);
            return true;
        }

        function handleInspectorNodeFieldChange(field) {
            if (!field) return false;
            const nodeId = getSelectedNodeId();
            const node = getNode(nodeId);
            const fieldName = field.getAttribute?.('data-inspector-node-field');
            if (!node || !fieldName) return false;
            if (nodeCall('isNodeLocked', false, node)) {
                field.value = node[fieldName] || '';
                uiStateCall('showToast', undefined, t('Locked node cannot be edited', '锁定节点无法编辑'));
                return true;
            }
            historyCall('pushHistoryBatch', undefined, `node-field:${node.id}:${fieldName}`, t('Edit node field', '编辑节点字段'));
            const patch = buildNodeFieldPatch(node, fieldName, field.value);
            if (patch && typeof patch === 'object' && Object.prototype.hasOwnProperty.call(patch, fieldName)) {
                Object.assign(node, patch);
            } else {
                Object.assign(node, { [fieldName]: field.value });
            }
            persistenceCall('scheduleSave');
            renderCall('renderNodes');
            renderCall('renderEdges');
            return true;
        }

        function bindInspectorNodeFieldEvents() {
            const inspector = getInspector();
            if (!inspector || typeof inspector.querySelectorAll !== 'function') return false;
            inspector.querySelectorAll('[data-inspector-node-field]').forEach((field) => {
                field.addEventListener('input', () => handleInspectorNodeFieldChange(field));
            });
            return true;
        }

        function bindInspectorParamEvents() {
            const inspector = getInspector();
            if (!inspector || typeof inspector.querySelectorAll !== 'function') return false;
            inspector.querySelectorAll('[data-inspector-param]').forEach((field) => {
                const handler = () => handleInspectorParamFieldChange(field);
                field.addEventListener('input', handler);
                field.addEventListener('change', handler);
            });
            return true;
        }

        function bindInspectorThemeEvents(inspector) {
            if (!inspector || typeof inspector.querySelectorAll !== 'function') return false;
            inspector.querySelectorAll('[data-inspector-theme]').forEach((field) => {
                field.addEventListener('change', () => setPresetTheme(getSelectedNodeId(), field.value));
            });
            return true;
        }

        function bindInspectorVlmEvents(inspector) {
            if (!inspector || typeof inspector.querySelectorAll !== 'function') return false;
            inspector.querySelectorAll('[data-vlm-system-template]').forEach((field) => {
                field.addEventListener('change', () => {
                    const node = getNode(getSelectedNodeId());
                    if (node?.type === 'vlm') {
                        actionCall('applyVlmSystemPromptTemplate', undefined, node, field.value, inspector);
                    }
                });
            });
            inspector.querySelectorAll('[data-vlm-param]').forEach((field) => {
                const handler = () => actionCall(
                    'handleVlmParamFieldChange',
                    undefined,
                    getSelectedNodeId(),
                    field.getAttribute('data-vlm-param'),
                    field.type === 'checkbox' ? field.checked : field.value,
                    field.type,
                    inspector,
                    field
                );
                field.addEventListener('input', handler);
                field.addEventListener('change', handler);
            });
            return true;
        }

        function bindClassicInspectorEvents(inspector) {
            if (!inspector || typeof inspector.querySelectorAll !== 'function') return false;
            inspector.querySelectorAll('[data-classic-ip-type]').forEach((field) => {
                const handler = () => updateNodeParam(getSelectedNodeId(), `ip_type_${field.getAttribute('data-classic-ip-type')}`, field.value, 'text');
                field.addEventListener('input', handler);
                field.addEventListener('change', handler);
            });
            inspector.querySelectorAll('[data-classic-ip-stop]').forEach((field) => {
                const handler = () => {
                    actionCall('syncTwinParamInputs', undefined, field, '[data-classic-ip-stop]');
                    updateNodeParam(getSelectedNodeId(), `ip_stop_${field.getAttribute('data-classic-ip-stop')}`, Number(field.value), 'number');
                };
                field.addEventListener('input', handler);
                field.addEventListener('change', handler);
            });
            inspector.querySelectorAll('[data-classic-ip-weight]').forEach((field) => {
                const handler = () => {
                    actionCall('syncTwinParamInputs', undefined, field, '[data-classic-ip-weight]');
                    updateNodeParam(getSelectedNodeId(), `ip_weight_${field.getAttribute('data-classic-ip-weight')}`, Number(field.value), 'number');
                };
                field.addEventListener('input', handler);
                field.addEventListener('change', handler);
            });
            inspector.querySelectorAll('[data-classic-param]').forEach((field) => {
                field.addEventListener('input', () => {
                    actionCall('syncTwinParamInputs', undefined, field, '[data-classic-param]');
                });
                field.addEventListener('change', () => {
                    if (field.getAttribute('data-classic-param') !== 'ip_count') return;
                    const node = getNode(getSelectedNodeId());
                    if (!node) return;
                    historyCall('pushHistory', undefined, 'Change classic IP count');
                    const max = Number(configCall('getClassicIpMaxImages', 4, node)) || 4;
                    Object.assign(node, buildClassicNodeStatePatch(node, {
                        classicIpCount: Math.min(max, Math.max(1, Number(field.value) || 1))
                    }));
                    uiStateCall('mutate');
                });
            });
            return true;
        }

        function bindTextInspectorEvents(inspector) {
            if (!inspector || typeof inspector.querySelectorAll !== 'function') return false;
            const bindings = [
                ['[data-inspector-text-value]', field => actionCall('updateTextNodeValue', undefined, getSelectedNodeId(), field.value)],
                ['[data-text-merge-separator]', field => actionCall('updateTextMergeSeparator', undefined, getSelectedNodeId(), field.value)],
                ['[data-translation-input]', field => actionCall('updateTranslationInput', undefined, getSelectedNodeId(), field.value)],
                ['[data-translation-param]', field => actionCall('updateTranslationParam', undefined, getSelectedNodeId(), field.getAttribute('data-translation-param'), field.value)],
                ['[data-tagcart-param]', field => actionCall('updateTagCartParam', undefined, getSelectedNodeId(), field.getAttribute('data-tagcart-param'), field.value)],
                ['[data-wd14-param]', field => actionCall('updateWd14Param', undefined, getSelectedNodeId(), field.getAttribute('data-wd14-param'), field.value, field.type)]
            ];
            bindings.forEach(([selector, update]) => {
                inspector.querySelectorAll(selector).forEach((field) => {
                    const handler = () => update(field);
                    field.addEventListener('input', handler);
                    field.addEventListener('change', handler);
                });
            });
            return true;
        }

        return {
            updateNodeParam,
            updateTextNodeValue,
            updateTextMergeSeparator,
            updateTranslationInput,
            updateTranslationParam,
            updateTagCartParam,
            updateWd14Param,
            updateMaskParam,
            updateQwenTtsParam,
            handleClassicModeChange,
            handleUovMethodChange,
            handleEnhanceUovParamChange,
            applyInpaintModeDefaults,
            handleInpaintModeChange,
            syncTwinParamInputs,
            setPresetTheme,
            getSceneGenerationConfigPropsForPresetNode,
            getSceneGenerationConfigDefaultForPresetNode,
            generationConfigValueForPresetSchema,
            handlePresetThemeChange,
            resetPresetNodeParam,
            handleCanvasRelightLightButtonClick,
            handleCanvasRelightLightButtonEvent,
            handlePresetParamResetClick,
            bindInspectorParamButtonEvents,
            resetVlmParamToDefault,
            handleVlmParamResetClick,
            injectParamResetButtons,
            handleNodeParamFieldChange,
            handleNodeParamEvent,
            handleClassicNodeChangeEvent,
            handleInspectorParamFieldChange,
            handleInspectorNodeFieldChange,
            bindInspectorNodeFieldEvents,
            bindInspectorParamEvents,
            bindInspectorThemeEvents,
            bindInspectorVlmEvents,
            bindClassicInspectorEvents,
            bindTextInspectorEvents
        };
    }

    window.SimpAICanvasWorkbenchNodeParam = Object.assign({}, window.SimpAICanvasWorkbenchNodeParam || {}, {
        createCanvasNodeParamController
    });
})();
