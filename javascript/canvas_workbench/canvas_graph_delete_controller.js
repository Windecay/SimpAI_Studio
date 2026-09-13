(function () {
    'use strict';

    function createCanvasGraphDeleteController(context) {
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
        const projectSource = sourceObject('projectSource');
        const projectCall = (name, fallback, ...args) => typeof projectSource[name] === 'function'
            ? projectSource[name](...args)
            : fallback;
        const selectionSource = sourceObject('selectionSource');
        const selectionCall = (name, fallback, ...args) => typeof selectionSource[name] === 'function'
            ? selectionSource[name](...args)
            : fallback;
        const nodeSource = sourceObject('nodeSource');
        const nodeCall = (name, fallback, ...args) => typeof nodeSource[name] === 'function'
            ? nodeSource[name](...args)
            : fallback;
        const patchSource = sourceObject('patchSource');
        const patchCall = (name, fallback, ...args) => typeof patchSource[name] === 'function'
            ? patchSource[name](...args)
            : fallback;
        const statusSource = sourceObject('statusSource');
        const statusCall = (name, fallback, ...args) => typeof statusSource[name] === 'function'
            ? statusSource[name](...args)
            : fallback;
        const actionSource = sourceObject('actionSource');
        const actionCall = (name, fallback, ...args) => typeof actionSource[name] === 'function'
            ? actionSource[name](...args)
            : fallback;
        const renderSource = sourceObject('renderSource');
        const renderCall = (name, fallback, ...args) => typeof renderSource[name] === 'function'
            ? renderSource[name](...args)
            : fallback;
        const historySource = sourceObject('historySource');
        const historyCall = (name, fallback, ...args) => typeof historySource[name] === 'function'
            ? historySource[name](...args)
            : fallback;
        const persistenceSource = sourceObject('persistenceSource');
        const persistenceCall = (name, fallback, ...args) => typeof persistenceSource[name] === 'function'
            ? persistenceSource[name](...args)
            : fallback;
        const utilitySource = sourceObject('utilitySource');
        const utilityCall = (name, fallback, ...args) => typeof utilitySource[name] === 'function'
            ? utilitySource[name](...args)
            : fallback;
        const uiSource = sourceObject('uiSource');
        const uiCall = (name, fallback, ...args) => typeof uiSource[name] === 'function'
            ? uiSource[name](...args)
            : fallback;
        const getProject = () => projectCall('getProject', {}) || {};

        function getNode(id) {
            return nodeCall('getNode', null, id) || null;
        }

        function applyProjectNodesPatch(project, nodes) {
            const nextNodes = Array.isArray(nodes) ? nodes : [];
            const patch = patchCall('buildProjectNodesPatch', null, project, nextNodes);
            if (patch && typeof patch === 'object' && !Array.isArray(patch) && Array.isArray(patch.nodes)) {
                Object.assign(project, patch);
                return;
            }
            Object.assign(project, { nodes: nextNodes });
        }

        function applyProjectEdgeFilterPatch(project, predicate) {
            const edges = Array.isArray(project?.edges) ? project.edges : [];
            const patch = patchCall('buildProjectEdgeFilterPatch', null, project, predicate);
            if (patch && typeof patch === 'object' && !Array.isArray(patch) && Array.isArray(patch.edges)) {
                Object.assign(project, patch);
                return;
            }
            Object.assign(project, {
                edges: typeof predicate === 'function' ? edges.filter(predicate) : edges.slice()
            });
        }

        function applySpecialNodeConnectionPatch(node, options) {
            const patch = patchCall('buildSpecialNodeConnectionPatch', null, node, options || {});
            if (patch && typeof patch === 'object') Object.assign(node, patch);
        }

        function applySam3SourcePatch(node, options) {
            const patch = patchCall('buildSam3SourcePatch', null, node, options || {});
            if (patch && typeof patch === 'object') Object.assign(node, patch);
        }

        function applyMaskStatePatch(node, options) {
            const patch = patchCall('buildMaskStatePatch', null, node, options || {});
            if (patch && typeof patch === 'object') Object.assign(node, patch);
        }

        function applyStyleSelectorStatePatch(node, options) {
            const patch = patchCall('buildStyleSelectorStatePatch', null, node, options || {});
            if (patch && typeof patch === 'object') Object.assign(node, patch);
        }

        function applyDirectorTimelineStatePatch(node, options) {
            const patch = patchCall('buildDirectorTimelineStatePatch', null, node, options || {});
            if (patch && typeof patch === 'object') Object.assign(node, patch);
        }

        function applyTranslationStatePatch(node, options) {
            const patch = patchCall('buildTranslationStatePatch', null, node, options || {});
            if (patch && typeof patch === 'object') Object.assign(node, patch);
        }

        function applyTagCartStatePatch(node, options) {
            const patch = patchCall('buildTagCartStatePatch', null, node, options || {});
            if (patch && typeof patch === 'object') Object.assign(node, patch);
        }

        function applyWd14StatePatch(node, options) {
            const patch = patchCall('buildWd14StatePatch', null, node, options || {});
            if (patch && typeof patch === 'object') Object.assign(node, patch);
        }

        function applyConfigStatePatch(node, options) {
            const patch = patchCall('buildConfigStatePatch', null, node, options || {});
            if (patch && typeof patch === 'object') Object.assign(node, patch);
        }

        function applyClassicNodeStatePatch(node, options) {
            const patch = patchCall('buildClassicNodeStatePatch', null, node, options || {});
            if (patch && typeof patch === 'object') Object.assign(node, patch);
        }

        function applyPresetUploadSlotPatch(node, options) {
            const patch = patchCall('buildPresetUploadSlotPatch', null, node, options || {});
            if (patch && typeof patch === 'object' && Object.prototype.hasOwnProperty.call(patch, 'upload_slots')) {
                Object.assign(node, patch);
            }
        }

        function applyPresetTextInputPatch(node, options) {
            const patch = patchCall('buildPresetTextInputPatch', null, node, options || {});
            if (patch && typeof patch === 'object') Object.assign(node, patch);
        }

        function applyTextMergeStatePatch(node, options) {
            const patch = patchCall('buildTextMergeStatePatch', null, node, options || {});
            if (patch && typeof patch === 'object') Object.assign(node, patch);
        }

        function applyTextNodeStatePatch(node, options) {
            const patch = patchCall('buildTextNodeStatePatch', null, node, options || {});
            if (patch && typeof patch === 'object') Object.assign(node, patch);
        }

        function applyCompareStatePatch(node, options) {
            const config = options || {};
            const patch = patchCall('buildCompareStatePatch', null, node, config);
            if (patch && typeof patch === 'object' && !Array.isArray(patch)
                && patch.inputs && typeof patch.inputs === 'object' && !Array.isArray(patch.inputs)) {
                Object.assign(node, patch);
                return;
            }
            const inputsPatch = config.inputsPatch
                && typeof config.inputsPatch === 'object'
                && !Array.isArray(config.inputsPatch)
                ? config.inputsPatch
                : {};
            Object.assign(node, {
                inputs: Object.assign({}, node?.inputs || {}, inputsPatch)
            });
        }

        function applyPresetConfigPatch(node, configKey, options) {
            const config = options || {};
            const patch = patchCall('buildPresetConfigPatch', null, node, Object.assign({ configKey }, config));
            if (patch && typeof patch === 'object' && !Array.isArray(patch)
                && Object.prototype.hasOwnProperty.call(patch, configKey)) {
                Object.assign(node, patch);
                return;
            }
            const currentConfig = node?.[configKey]
                && typeof node[configKey] === 'object'
                && !Array.isArray(node[configKey])
                ? node[configKey]
                : {};
            const configPatch = config.presetConfigPatch
                && typeof config.presetConfigPatch === 'object'
                && !Array.isArray(config.presetConfigPatch)
                ? config.presetConfigPatch
                : {};
            Object.assign(node, {
                [configKey]: Object.assign({}, currentConfig, configPatch)
            });
        }

        function applyTimelineClipDeletePatch(node, clipId) {
            const patch = patchCall('buildTimelineClipDeletePatch', null, node, clipId);
            if (patch && typeof patch === 'object' && !Array.isArray(patch) && Array.isArray(patch.clips)) {
                Object.assign(node, patch);
                return;
            }
            Object.assign(node, {
                clips: (Array.isArray(node?.clips) ? node.clips : []).filter(clip => clip?.id !== clipId)
            });
        }

        function removeTimelineClipsBySourceIds(node, idSet) {
            const clipIds = (Array.isArray(node?.clips) ? node.clips : [])
                .filter(clip => idSet.has(clip?.source_node_id))
                .map(clip => clip?.id);
            clipIds.forEach((clipId) => applyTimelineClipDeletePatch(node, clipId));
        }

        function applyBatchAnyItemsPatch(node, items) {
            const nextItems = Array.isArray(items) ? items : [];
            const patch = patchCall('buildBatchAnyStatePatch', null, node, {
                statePatch: { items: nextItems }
            });
            if (patch && typeof patch === 'object' && !Array.isArray(patch) && Array.isArray(patch.items)) {
                Object.assign(node, patch);
                return;
            }
            Object.assign(node, { items: nextItems });
        }

        function applyResultProducerPatch(node, producerPatch) {
            const patch = patchCall('buildResultProducerPatch', null, node, producerPatch || {});
            if (patch && typeof patch === 'object' && !Array.isArray(patch)
                && Object.prototype.hasOwnProperty.call(patch, 'producer')) {
                Object.assign(node, patch);
                return;
            }
            Object.assign(node, {
                producer: Object.assign({}, node?.producer || {}, producerPatch || {})
            });
        }

        function applyVlmImageInputsPatch(node, options) {
            const patch = patchCall('buildVlmImageInputsPatch', null, node, options || {});
            if (patch && typeof patch === 'object' && Object.prototype.hasOwnProperty.call(patch, 'image_inputs')) {
                Object.assign(node, patch);
            }
        }

        function applyResultStatusPatch(node, options) {
            const patch = statusCall('buildResultStatusPatch', null, node, options || {});
            if (patch && typeof patch === 'object' && Object.prototype.hasOwnProperty.call(patch, 'status')) {
                Object.assign(node, patch);
            }
        }

        function applyQwenTtsStatePatch(node, options) {
            const patch = patchCall('buildQwenTtsStatePatch', null, node, options || {});
            if (patch && typeof patch === 'object') Object.assign(node, patch);
        }

        function applySpecialNodeStatusPatch(node, options) {
            const patch = statusCall('buildSpecialNodeStatusPatch', null, node, options || {});
            if (patch && typeof patch === 'object' && Object.prototype.hasOwnProperty.call(patch, 'status')) {
                Object.assign(node, patch);
                return true;
            }
            return false;
        }

        function applyRunStatus(node, state, message) {
            const status = statusCall('mergeCanvasRunStatus', undefined, node?.status, state, message);
            if (node?.type === 'result' && typeof statusSource.buildResultStatusPatch === 'function') {
                const patch = statusCall('buildResultStatusPatch', null, node, { status });
                if (patch && typeof patch === 'object' && Object.prototype.hasOwnProperty.call(patch, 'status')) {
                    Object.assign(node, patch);
                    return;
                }
            }
            if (node?.type === 'vlm' && typeof statusSource.buildVlmRunStatusPatch === 'function') {
                const patch = statusCall('buildVlmRunStatusPatch', null, node, { status });
                if (patch && typeof patch === 'object' && Object.prototype.hasOwnProperty.call(patch, 'status')) {
                    Object.assign(node, patch);
                    return;
                }
            }
            if (node?.type === 'sam3_video_mask' && typeof statusSource.buildSam3StatePatch === 'function') {
                const patch = statusCall('buildSam3StatePatch', null, node, { status });
                if (patch && typeof patch === 'object' && Object.prototype.hasOwnProperty.call(patch, 'status')) {
                    Object.assign(node, patch);
                    return;
                }
            }
            if (node?.type === 'mask' && typeof statusSource.buildMaskStatePatch === 'function') {
                const patch = statusCall('buildMaskStatePatch', null, node, { status });
                if (patch && typeof patch === 'object' && Object.prototype.hasOwnProperty.call(patch, 'status')) {
                    Object.assign(node, patch);
                    return;
                }
            }
            if (node?.type === 'translation' && typeof statusSource.buildTranslationStatePatch === 'function') {
                const patch = statusCall('buildTranslationStatePatch', null, node, { status });
                if (patch && typeof patch === 'object' && Object.prototype.hasOwnProperty.call(patch, 'status')) {
                    Object.assign(node, patch);
                    return;
                }
            }
            if (node?.type === 'wd14' && typeof statusSource.buildWd14StatePatch === 'function') {
                const patch = statusCall('buildWd14StatePatch', null, node, { status });
                if (patch && typeof patch === 'object' && Object.prototype.hasOwnProperty.call(patch, 'status')) {
                    Object.assign(node, patch);
                    return;
                }
            }
            if (['pose_studio', 'gaussian_studio', 'liveportrait_expression'].includes(node?.type)
                && applySpecialNodeStatusPatch(node, { status })) return;
            if (status && typeof status === 'object') Object.assign(node, { status });
        }

        function isNodeLocked(node) {
            return !!nodeCall('isNodeLocked', false, node);
        }

        function selectionState() {
            const state = selectionCall('getSelectionState', selectionSource) || {};
            const ids = state.selectedNodeIds instanceof Set
                ? new Set(state.selectedNodeIds)
                : new Set(Array.isArray(state.selectedNodeIds) ? state.selectedNodeIds : []);
            return {
                selectedNodeId: state.selectedNodeId || null,
                selectedNodeIds: ids,
                selectedEdgeId: state.selectedEdgeId || null,
                selectedGroupId: state.selectedGroupId || null
            };
        }

        function writeSelection(next) {
            const state = Object.assign(selectionState(), next || {});
            state.selectedNodeIds = state.selectedNodeIds instanceof Set
                ? new Set(state.selectedNodeIds)
                : new Set(Array.isArray(state.selectedNodeIds) ? state.selectedNodeIds : []);
            if (typeof selectionSource.setSelectionState === 'function') selectionSource.setSelectionState(state);
            else Object.assign(selectionSource, state);
        }

        function deleteSelection(options) {
            const project = getProject();
            const opts = options || {};
            const selection = selectionState();
            if (selection.selectedGroupId && !selection.selectedNodeId && !selection.selectedEdgeId) {
                actionCall('deleteSelectedGroup', undefined);
                return;
            }
            if (selection.selectedEdgeId) {
                deleteEdge(selection.selectedEdgeId);
                return;
            }
            const selectedTimeline = getNode(selection.selectedNodeId);
            if (!opts.forceNode
                && selectedTimeline?.type === 'timeline'
                && selectedTimeline.params?.selected_clip_id
                && Array.isArray(selectedTimeline.clips)) {
                const clipId = selectedTimeline.params.selected_clip_id;
                if (selectedTimeline.clips.find(item => item.id === clipId)) {
                    actionCall('deleteTimelineClipById', undefined, selectedTimeline, clipId);
                    return;
                }
            }
            const ids = selection.selectedNodeId && !selection.selectedNodeIds.has(selection.selectedNodeId)
                ? [selection.selectedNodeId]
                : (selection.selectedNodeIds.size
                    ? Array.from(selection.selectedNodeIds)
                    : (selection.selectedNodeId ? [selection.selectedNodeId] : []));
            if (!ids.length) return;
            const lockedIds = ids.filter(id => isNodeLocked(getNode(id)));
            const deletableIds = ids.filter(id => !isNodeLocked(getNode(id)));
            if (!deletableIds.length) {
                uiCall('showToast', undefined, t('Locked nodes cannot be deleted', '已锁定节点无法删除'));
                return;
            }
            if (lockedIds.length) uiCall('showToast', undefined, t('Locked nodes were kept', '已锁定节点已保留'));
            historyCall('pushHistory', undefined, t('Delete selection', '删除选择'));
            const idSet = new Set(deletableIds);
            idSet.forEach((id) => actionCall('stopResultPreviewPlayer', undefined, id));
            const deletableNodes = (project.nodes || []).filter(node => idSet.has(node.id));
            actionCall('interruptDeletedResultRuns', undefined, deletableNodes);
            const outpaintOverlayState = actionCall('getOutpaintOverlayState', {}) || {};
            if (outpaintOverlayState.active && idSet.has(outpaintOverlayState.nodeId)) actionCall('hideOutpaintOverlay', undefined);
            const activeInlineTagCartNodeId = actionCall('getActiveInlineTagCartNodeId', '') || '';
            if (activeInlineTagCartNodeId && idSet.has(activeInlineTagCartNodeId)) actionCall('setActiveInlineTagCartNodeId', undefined, '');
            actionCall('handleCanvasAgentWorkflowNodeDeletion', undefined, idSet);
            applyProjectNodesPatch(project, (Array.isArray(project.nodes) ? project.nodes : []).filter(node => !idSet.has(node.id)));
            applyProjectEdgeFilterPatch(project, edge => !idSet.has(edge.from) && !idSet.has(edge.to));
            project.nodes.forEach((node) => {
                if (node.type === 'wd14' && idSet.has(node.input_node_id)) {
                    applyWd14StatePatch(node, { inputNodeId: null });
                    applyRunStatus(node, 'idle', t('Image input removed.', '图片输入已移除。'));
                }
                if (node.type === 'text' && idSet.has(node.text_input)) {
                    applyTextNodeStatePatch(node, { textInputId: null });
                }
                if (node.type === 'text_merge' && node.text_inputs) {
                    const textInputsPatch = {};
                    Object.keys(node.text_inputs).forEach((slot) => {
                        if (idSet.has(node.text_inputs[slot])) textInputsPatch[slot] = null;
                    });
                    if (Object.keys(textInputsPatch).length) applyTextMergeStatePatch(node, { textInputsPatch });
                }
                if (node.type === 'translation' && idSet.has(node.text_input)) {
                    applyTranslationStatePatch(node, { textInputId: null });
                    applyRunStatus(node, 'idle', t('Text input removed.', '文本输入已移除。'));
                }
                if (node.type === 'tag_cart' && idSet.has(node.text_input)) {
                    applyTagCartStatePatch(node, { textInputId: null });
                }
                if (node.type === 'vlm' && node.image_inputs) {
                    let removed = false;
                    const imageInputsPatch = {};
                    Object.keys(node.image_inputs).forEach((slot) => {
                        if (idSet.has(node.image_inputs[slot])) {
                            imageInputsPatch[slot] = null;
                            removed = true;
                        }
                    });
                    if (removed) {
                        applyVlmImageInputsPatch(node, { imageInputsPatch });
                        applyRunStatus(node, 'idle', t('Image input removed.', '图片输入已移除。'));
                    }
                }
                if (node.type === 'compare' && node.inputs) {
                    const inputsPatch = {};
                    Object.keys(node.inputs).forEach((slot) => {
                        if (idSet.has(node.inputs[slot])) inputsPatch[slot] = null;
                    });
                    if (Object.keys(inputsPatch).length) applyCompareStatePatch(node, { inputsPatch });
                }
                if (node.type === 'timeline' && Array.isArray(node.clips)) {
                    removeTimelineClipsBySourceIds(node, idSet);
                }
                if (node.type === 'sam3_video_mask'
                    && (idSet.has(node.input_node_id) || idSet.has(node.source?.source_node_id))) {
                    applySam3SourcePatch(node, {
                        inputNodeId: null,
                        sourcePatch: { source_node_id: '' }
                    });
                    applyRunStatus(node, 'idle', t('Source video removed.', '源视频已移除。'));
                }
                if (node.type === 'mask'
                    && (idSet.has(node.input_node_id) || idSet.has(node.source?.source_node_id))) {
                    applyMaskStatePatch(node, {
                        inputNodeId: null,
                        sourcePatch: { source_node_id: '' }
                    });
                    applyRunStatus(node, 'idle', t('Source image removed.', '源图输入已移除。'));
                }
                if (node.type === 'pose_studio' && idSet.has(node.input_node_id)) {
                    applySpecialNodeConnectionPatch(node, { inputNodeId: null });
                    applyRunStatus(node, 'idle', t('Reference image removed.', '参考图已移除。'));
                }
                if (node.type === 'gaussian_studio' && idSet.has(node.input_node_id)) {
                    applySpecialNodeConnectionPatch(node, { inputNodeId: null });
                    applyRunStatus(node, 'idle', t('Reference image removed.', '参考图已移除。'));
                }
                if (node.type === 'liveportrait_expression') {
                    if (idSet.has(node.input_node_id) || idSet.has(node.liveportrait_expression.source_node_id)) {
                        applySpecialNodeConnectionPatch(node, {
                            inputNodeId: null,
                            livePortraitSourceNodeId: ''
                        });
                        applyRunStatus(node, 'idle', t('Source image removed.', '源图已移除。'));
                    }
                    if (idSet.has(node.reference_node_id) || idSet.has(node.liveportrait_expression?.reference_node_id)) {
                        applySpecialNodeConnectionPatch(node, {
                            referenceNodeId: null,
                            livePortraitReferenceNodeId: ''
                        });
                        applyRunStatus(node, 'idle', t('Reference expression removed.', '参考表情已移除。'));
                    }
                }
                if (nodeCall('isQwenTtsNode', false, node) && node.audio_inputs) {
                    const audioInputsPatch = {};
                    Object.keys(node.audio_inputs).forEach((slot) => {
                        if (idSet.has(node.audio_inputs[slot])) {
                            audioInputsPatch[slot] = null;
                        }
                    });
                    if (Object.keys(audioInputsPatch).length) {
                        applyQwenTtsStatePatch(node, {
                            audioInputsPatch,
                            status: statusCall('mergeCanvasRunStatus', undefined, node.status, 'idle', t('Reference audio removed.', '参考音频已移除。'))
                        });
                    }
                }
                if (nodeCall('isDirectorTimelineNode', false, node) && node.media_inputs) {
                    let removed = false;
                    const mediaInputsPatch = {};
                    Object.keys(node.media_inputs).forEach((slot) => {
                        if (idSet.has(node.media_inputs[slot])) {
                            mediaInputsPatch[slot] = null;
                            removed = true;
                        }
                    });
                    if (removed) {
                        applyDirectorTimelineStatePatch(node, { mediaInputsPatch });
                        statusCall('updateDirectorStatus', undefined, node);
                    }
                }
                if (node.type !== 'preset' && node.type !== 'classic') return;
                if (node.upload_slots) {
                    const uploadSlotsPatch = {};
                    Object.keys(node.upload_slots).forEach((slot) => {
                        if (idSet.has(node.upload_slots[slot])) uploadSlotsPatch[slot] = null;
                    });
                    if (Object.keys(uploadSlotsPatch).length) applyPresetUploadSlotPatch(node, { uploadSlotsPatch });
                }
                const textInputsPatch = {};
                Object.keys(node.text_inputs || {}).forEach((slot) => {
                    if (idSet.has(node.text_inputs[slot])) textInputsPatch[slot] = null;
                });
                const textInputOptions = {};
                if (Object.keys(textInputsPatch).length) textInputOptions.textInputsPatch = textInputsPatch;
                if (idSet.has(node.style_transfer_selector_id)) {
                    textInputOptions.styleTransferSelectorId = null;
                }
                if (Object.keys(textInputOptions).length) {
                    applyPresetTextInputPatch(node, textInputOptions);
                }
                ['models_config', 'styles_config', 'resolution_config', 'generation_config'].forEach((key) => {
                    if (idSet.has(node[key]?.source_node_id)) {
                        applyPresetConfigPatch(node, key, {
                            presetConfigPatch: { mode: 'preset_default', source_node_id: null, overrides: {} }
                        });
                    }
                });
                if (node.type === 'classic' && node.enhance_detection_configs) {
                    const enhanceDetectionConfigsPatch = {};
                    Object.keys(node.enhance_detection_configs).forEach((key) => {
                        if (idSet.has(node.enhance_detection_configs[key])) enhanceDetectionConfigsPatch[key] = null;
                    });
                    if (Object.keys(enhanceDetectionConfigsPatch).length) {
                        applyClassicNodeStatePatch(node, { enhanceDetectionConfigsPatch });
                    }
                }
            });
            writeSelection({
                selectedNodeId: null,
                selectedNodeIds: new Set(),
                selectedEdgeId: null
            });
            persistenceCall('mutate', undefined);
        }

        function deleteEdge(edgeId, options) {
            const project = getProject();
            const edge = (project.edges || []).find(item => item.id === edgeId);
            if (edge && (isNodeLocked(getNode(edge.from)) || isNodeLocked(getNode(edge.to)))) {
                uiCall('showToast', undefined, t('Locked node connections cannot be deleted', '已锁定节点的连线无法删除'));
                return;
            }
            if (edge && options?.history !== false) historyCall('pushHistory', undefined, t('Delete edge', '删除连线'));
            actionCall('handleCanvasAgentWorkflowEdgeDeletion', undefined, edge);
            applyProjectEdgeFilterPatch(project, item => item.id !== edgeId);
            if (edge && edge.type === 'upload') {
                const node = getNode(edge.to);
                if (node && node.upload_slots && node.upload_slots[edge.slot] === edge.from) {
                    applyPresetUploadSlotPatch(node, { uploadSlotsPatch: { [edge.slot]: null } });
                    renderCall('refreshPresetSpecialNodeDom', undefined, node, { syncViewer: true });
                }
            }
            if (edge && edge.type === 'config') {
                const preset = getNode(edge.to);
                const configNode = getNode(edge.from);
                if (configNode?.type === 'config'
                    && configNode.target_preset_id === edge.to) {
                    applyConfigStatePatch(configNode, { targetPresetId: null });
                }
                const detectionIndex = utilityCall('parseDetectionSlot', -1, edge.slot);
                if (detectionIndex >= 0 && preset?.type === 'classic') {
                    applyClassicNodeStatePatch(preset, {
                        enhanceDetectionConfigsPatch: { [String(detectionIndex)]: null }
                    });
                } else {
                    const configKey = utilityCall('configKeyForKind', 'models_config', edge.slot);
                    if (preset && preset[configKey]?.source_node_id === edge.from) {
                        applyPresetConfigPatch(preset, configKey, {
                            presetConfigPatch: { mode: 'preset_default', source_node_id: null, overrides: {} }
                        });
                    }
                }
            }
            if (edge && edge.type === 'text') {
                const target = getNode(edge.to);
                const source = getNode(edge.from);
                if (source?.type === 'style_selector' && source.style_selector?.target_preset_id === edge.to) {
                    applyStyleSelectorStatePatch(source, { statePatch: { target_preset_id: '' } });
                }
                if (target?.type === 'preset' || target?.type === 'classic') {
                    const textInputOptions = {};
                    if (target.text_inputs?.[edge.slot] === edge.from) {
                        textInputOptions.textInputsPatch = { [edge.slot]: null };
                    }
                    if (target.style_transfer_selector_id === edge.from) {
                        textInputOptions.styleTransferSelectorId = null;
                    }
                    if (Object.keys(textInputOptions).length) {
                        applyPresetTextInputPatch(target, textInputOptions);
                    }
                }
                if (target?.type === 'text' && edge.slot === 'input' && target.text_input === edge.from) {
                    applyTextNodeStatePatch(target, { textInputId: null });
                }
                if (target?.type === 'text_merge' && target.text_inputs?.[edge.slot] === edge.from) {
                    applyTextMergeStatePatch(target, { textInputsPatch: { [edge.slot]: null } });
                }
                if (target?.type === 'translation' && edge.slot === 'input' && target.text_input === edge.from) {
                    applyTranslationStatePatch(target, { textInputId: null });
                    applyRunStatus(target, 'idle', t('Text input disconnected.', '文本输入已断开。'));
                }
                if (target?.type === 'tag_cart' && edge.slot === 'input' && target.text_input === edge.from) {
                    applyTagCartStatePatch(target, { textInputId: null });
                }
            }
            if (edge && edge.type === 'image') {
                const target = getNode(edge.to);
                if (target?.type === 'wd14' && target.input_node_id === edge.from) {
                    applyWd14StatePatch(target, { inputNodeId: null });
                    applyRunStatus(target, 'idle', t('Image input disconnected.', '图片输入已断开。'));
                }
                if (target?.type === 'vlm' && target.image_inputs?.[edge.slot] === edge.from) {
                    applyVlmImageInputsPatch(target, { imageInputsPatch: { [edge.slot]: null } });
                    applyRunStatus(target, 'idle', t('Image input disconnected.', '图片输入已断开。'));
                }
                if (target?.type === 'mask' && edge.slot === 'source' && target.input_node_id === edge.from) {
                    applyMaskStatePatch(target, {
                        inputNodeId: null,
                        sourcePatch: { source_node_id: '' }
                    });
                    applyRunStatus(target, 'idle', t('Source image disconnected.', '源图输入已断开。'));
                }
                if (target?.type === 'pose_studio' && edge.slot === 'reference' && target.input_node_id === edge.from) {
                    applySpecialNodeConnectionPatch(target, { inputNodeId: null });
                    applyRunStatus(target, 'idle', t('Reference image disconnected.', '参考图输入已断开。'));
                }
                if (target?.type === 'gaussian_studio' && edge.slot === 'reference' && target.input_node_id === edge.from) {
                    applySpecialNodeConnectionPatch(target, { inputNodeId: null });
                    applyRunStatus(target, 'idle', t('Reference image disconnected.', '参考图输入已断开。'));
                }
                if (target?.type === 'liveportrait_expression') {
                    if (edge.slot === 'source' && (target.input_node_id === edge.from || target.liveportrait_expression.source_node_id === edge.from)) {
                        applySpecialNodeConnectionPatch(target, {
                            inputNodeId: null,
                            livePortraitSourceNodeId: ''
                        });
                        applyRunStatus(target, 'idle', t('Source image disconnected.', '源图输入已断开。'));
                    }
                    if (edge.slot === 'reference' && (target.reference_node_id === edge.from || target.liveportrait_expression?.reference_node_id === edge.from)) {
                        applySpecialNodeConnectionPatch(target, {
                            referenceNodeId: null,
                            livePortraitReferenceNodeId: ''
                        });
                        applyRunStatus(target, 'idle', t('Reference expression disconnected.', '参考表情输入已断开。'));
                    }
                }
            }
            if (edge && edge.type === 'media') {
                const target = getNode(edge.to);
                if (target?.type === 'sam3_video_mask'
                    && edge.slot === 'source'
                    && (target.input_node_id === edge.from || target.source?.source_node_id === edge.from)) {
                    applySam3SourcePatch(target, {
                        inputNodeId: null,
                        sourcePatch: { source_node_id: '' }
                    });
                    applyRunStatus(target, 'idle', t('Source video disconnected.', '源视频输入已断开。'));
                }
                if (nodeCall('isQwenTtsNode', false, target) && target.audio_inputs?.[edge.slot] === edge.from) {
                    applyQwenTtsStatePatch(target, {
                        audioInputsPatch: { [edge.slot]: null },
                        status: statusCall('mergeCanvasRunStatus', undefined, target.status, 'idle', t('Reference audio disconnected.', '参考音频输入已断开。'))
                    });
                }
                if (nodeCall('isDirectorTimelineNode', false, target) && target.media_inputs?.[edge.slot] === edge.from) {
                    applyDirectorTimelineStatePatch(target, {
                        mediaInputsPatch: { [edge.slot]: null }
                    });
                    statusCall('updateDirectorStatus', undefined, target);
                }
            }
            if (edge && edge.type === 'compare') {
                const target = getNode(edge.to);
                if (target?.type === 'compare' && target.inputs?.[edge.slot] === edge.from) {
                    applyCompareStatePatch(target, { inputsPatch: { [edge.slot]: null } });
                }
            }
            if (edge && edge.type === 'timeline') {
                const target = getNode(edge.to);
                if (target?.type === 'timeline' && Array.isArray(target.clips)) {
                    applyTimelineClipDeletePatch(target, edge.slot);
                }
            }
            if (edge && edge.type === 'batch_input') {
                const target = getNode(edge.to);
                if (target?.type === 'batch_any' && Array.isArray(target.items)) {
                    applyBatchAnyItemsPatch(target, target.items.filter(item => item?.source_edge_id !== edge.id && item?.id !== edge.slot));
                    actionCall('refreshBatchAnyActiveItem', undefined, target);
                }
            }
            if (edge && edge.type === 'generate') {
                const result = getNode(edge.to);
                if (result?.producer?.preset_node_id === edge.from) {
                    applyResultProducerPatch(result, { preset_node_id: null });
                    applyResultStatusPatch(result, { statusPatch: { state: 'manual', message: t('Preset output connection disconnected.', '已断开 preset 输出连接。') } });
                }
                if (result?.producer?.timeline_node_id === edge.from) {
                    applyResultProducerPatch(result, { timeline_node_id: null });
                    applyResultStatusPatch(result, { statusPatch: { state: 'manual', message: t('Timeline output connection disconnected.', '已断开 Timeline 输出连接。') } });
                }
                if (result?.producer?.qwen_tts_node_id === edge.from) {
                    applyResultProducerPatch(result, { qwen_tts_node_id: null });
                    applyResultStatusPatch(result, { statusPatch: { state: 'manual', message: t('Qwen TTS output connection disconnected.', '已断开 Qwen TTS 输出连接。') } });
                }
            }
            writeSelection({ selectedEdgeId: null });
            if (options && options.render === false) persistenceCall('scheduleSave', undefined);
            else persistenceCall('mutate', undefined);
        }

        function deleteUploadSlot(presetId, slot, options) {
            const project = getProject();
            const edge = (project.edges || []).find(item => item.type === 'upload' && item.to === presetId && item.slot === slot);
            if (edge) {
                deleteEdge(edge.id, options);
                return;
            }
            const node = getNode(presetId);
            if (node?.type === 'preset' || node?.type === 'classic') {
                applyPresetUploadSlotPatch(node, { uploadSlotsPatch: { [slot]: null } });
            }
            renderCall('refreshPresetSpecialNodeDom', undefined, node, { syncViewer: true });
            if (options && options.render === false) persistenceCall('scheduleSave', undefined);
            else persistenceCall('mutate', undefined);
        }

        return {
            deleteSelection,
            deleteEdge,
            deleteUploadSlot
        };
    }

    window.SimpAICanvasWorkbenchGraphDelete = Object.assign({}, window.SimpAICanvasWorkbenchGraphDelete || {}, {
        createCanvasGraphDeleteController
    });
})();
