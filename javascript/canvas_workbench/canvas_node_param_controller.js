(function () {
    'use strict';

    function createCanvasNodeParamController(context) {
        const scope = context || {};
        const call = (name, fallback, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : fallback;
        const t = typeof scope.t === 'function' ? scope.t : ((en, cn) => cn || en);
        const getNode = (id) => call('getNode', null, id);
        const getInspector = () => call('getInspector', null);
        const getSelectedNodeId = () => call('getSelectedNodeId', null);
        const classicOutpaintDirs = (() => {
            const value = call('getClassicOutpaintDirs', []);
            return Array.isArray(value) ? value : [];
        })();
        const buildNodeParamsPatch = (node, options) => call('buildNodeParamsPatch', {}, node, options) || {};
        const buildNodeFieldPatch = (node, key, value) => call('buildNodeFieldPatch', {}, node, key, value) || {};
        const buildClassicNodeStatePatch = (node, options) => call('buildClassicNodeStatePatch', {}, node, options) || {};

        function fieldValue(field) {
            return field?.type === 'checkbox' ? !!field.checked : field?.value;
        }

        function updateNodeParam(nodeId, key, value, inputType) {
            const node = getNode(nodeId);
            if (!node || call('isNodeLocked', false, node)) return;
            call('pushHistoryBatch', undefined, `node-param:${nodeId}:${key}`, 'Edit node parameter');
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
                call('mutate', undefined, { inspector: true });
                return;
            }
            call('scheduleSave');
        }

        function updateClassicOutpaintParam(node, key, field, options = {}) {
            if (!node || node.type !== 'classic' || !key || field?.type !== 'checkbox') return false;
            const currentParams = node.params && typeof node.params === 'object' && !Array.isArray(node.params) ? node.params : {};
            const nextParams = Object.assign({}, currentParams, { [key]: !!field.checked });
            const outpaintSelections = classicOutpaintDirs.filter(dir => !!nextParams[`outpaint_${dir.toLowerCase()}`]);
            Object.assign(node, buildNodeParamsPatch(node, {
                paramsPatch: { [key]: !!field.checked, outpaint_selections: outpaintSelections }
            }));
            if (options.scheduleSave !== false) call('scheduleSave');
            return true;
        }

        function handleNodeParamFieldChange(node, field, options = {}) {
            if (!node || !field) return false;
            const paramKey = field.getAttribute?.('data-node-param');
            if (!paramKey) return false;
            if (paramKey === 'inpaint_mode' && node.type === 'classic') {
                call('handleInpaintModeChange', undefined, node.id, field.value);
                return true;
            }
            if (paramKey === 'uov_method' && node.type === 'classic') {
                call('handleUovMethodChange', undefined, node.id, field.value);
                return true;
            }
            if ((paramKey === 'enhance_uov_method' || paramKey === 'enhance_uov_processing_order') && node.type === 'classic') {
                call('handleEnhanceUovParamChange', undefined, node.id, paramKey, field.value, field.type);
                return true;
            }
            if (updateClassicOutpaintParam(node, paramKey, field, { scheduleSave: options.scheduleOutpaint !== false })) return true;
            call('syncTwinParamInputs', undefined, field, '[data-node-param]');
            updateNodeParam(node.id, paramKey, fieldValue(field), field.type);
            return true;
        }

        function handleNodeParamEvent(nodeEl, node, evt, eventType) {
            if (!node || !evt?.target) return false;
            const target = evt.target;
            const inputEvent = eventType === 'input';
            const changeEvent = eventType === 'change';
            const invoke = (name, ...args) => call(name, undefined, ...args);
            const nodeParam = target.closest?.('[data-node-param]');
            const noteText = target.closest?.('[data-note-text]');
            if (noteText && node.type === 'note') {
                invoke('updateNoteText', node.id, noteText.value, changeEvent ? { render: false } : undefined);
                return true;
            }
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
            if (inputEvent && call('isDirectorTimelineNode', false, node)) {
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
                    invoke('pushHistory', 'Change classic IP count');
                    Object.assign(node, buildClassicNodeStatePatch(node, {
                        classicIpCount: Math.max(1, Math.min(4, Number(classicParam.value) || 1))
                    }));
                    invoke('mutate');
                }
                return true;
            }
            if (!nodeParam) return false;
            if (call('isQwenTtsNode', false, node)) {
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

        function handleInspectorParamFieldChange(field) {
            if (!field) return false;
            const nodeId = getSelectedNodeId();
            const node = getNode(nodeId);
            const paramKey = field.getAttribute?.('data-inspector-param');
            if (!paramKey) return false;
            call('syncTwinParamInputs', undefined, field, '[data-inspector-param]');
            if (call('isQwenTtsNode', false, node)) {
                call('updateQwenTtsParam', undefined, nodeId, paramKey, fieldValue(field), field.type);
                return true;
            }
            if (paramKey === 'inpaint_mode' && node?.type === 'classic') {
                call('handleInpaintModeChange', undefined, nodeId, field.value);
                return true;
            }
            if (paramKey === 'uov_method' && node?.type === 'classic') {
                call('handleUovMethodChange', undefined, nodeId, field.value);
                return true;
            }
            if ((paramKey === 'enhance_uov_method' || paramKey === 'enhance_uov_processing_order') && node?.type === 'classic') {
                call('handleEnhanceUovParamChange', undefined, nodeId, paramKey, field.value, field.type);
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
            if (call('isNodeLocked', false, node)) {
                field.value = node[fieldName] || '';
                call('showToast', undefined, t('Locked node cannot be edited', '锁定节点无法编辑'));
                return true;
            }
            call('pushHistoryBatch', undefined, `node-field:${node.id}:${fieldName}`, t('Edit node field', '编辑节点字段'));
            const patch = buildNodeFieldPatch(node, fieldName, field.value);
            if (patch && typeof patch === 'object' && Object.prototype.hasOwnProperty.call(patch, fieldName)) {
                Object.assign(node, patch);
            } else {
                Object.assign(node, { [fieldName]: field.value });
            }
            call('scheduleSave');
            call('renderNodes');
            call('renderEdges');
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

        return {
            updateNodeParam,
            handleNodeParamFieldChange,
            handleNodeParamEvent,
            handleInspectorParamFieldChange,
            handleInspectorNodeFieldChange,
            bindInspectorNodeFieldEvents,
            bindInspectorParamEvents
        };
    }

    window.SimpAICanvasWorkbenchNodeParam = Object.assign({}, window.SimpAICanvasWorkbenchNodeParam || {}, {
        createCanvasNodeParamController
    });
})();
