(function () {
    'use strict';

    function createCanvasGraphDeleteController(context) {
        const scope = context || {};
        const call = (name, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : undefined;
        const getProject = () => typeof scope.getProject === 'function' ? (scope.getProject() || {}) : {};
        const t = typeof scope.t === 'function' ? scope.t : ((en, cn) => cn || en);

        function getNode(id) {
            return call('getNode', id) || null;
        }

        function isNodeLocked(node) {
            return !!call('isNodeLocked', node);
        }

        function selectionState() {
            const state = typeof scope.getSelectionState === 'function'
                ? (scope.getSelectionState() || {})
                : scope;
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
            if (typeof scope.setSelectionState === 'function') scope.setSelectionState(state);
            else Object.assign(scope, state);
        }

        function deleteSelection(options) {
            const project = getProject();
            const opts = options || {};
            const selection = selectionState();
            if (selection.selectedGroupId && !selection.selectedNodeId && !selection.selectedEdgeId) {
                call('deleteSelectedGroup');
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
                    call('deleteTimelineClipById', selectedTimeline, clipId);
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
                call('showToast', t('Locked nodes cannot be deleted', '已锁定节点无法删除'));
                return;
            }
            if (lockedIds.length) call('showToast', t('Locked nodes were kept', '已锁定节点已保留'));
            call('pushHistory', t('Delete selection', '删除选择'));
            const idSet = new Set(deletableIds);
            idSet.forEach((id) => call('stopResultPreviewPlayer', id));
            const deletableNodes = (project.nodes || []).filter(node => idSet.has(node.id));
            call('interruptDeletedResultRuns', deletableNodes);
            const outpaintOverlayState = call('getOutpaintOverlayState') || {};
            if (outpaintOverlayState.active && idSet.has(outpaintOverlayState.nodeId)) call('hideOutpaintOverlay');
            const activeInlineTagCartNodeId = call('getActiveInlineTagCartNodeId') || '';
            if (activeInlineTagCartNodeId && idSet.has(activeInlineTagCartNodeId)) call('setActiveInlineTagCartNodeId', '');
            call('handleCanvasAgentWorkflowNodeDeletion', idSet);
            project.nodes = (project.nodes || []).filter(node => !idSet.has(node.id));
            project.edges = (project.edges || []).filter(edge => !idSet.has(edge.from) && !idSet.has(edge.to));
            project.nodes.forEach((node) => {
                if (node.type === 'wd14' && idSet.has(node.input_node_id)) {
                    node.input_node_id = null;
                    node.status = Object.assign({}, node.status || {}, { state: 'idle', message: t('Image input removed.', '图片输入已移除。') });
                }
                if (node.type === 'text' && idSet.has(node.text_input)) {
                    node.text_input = null;
                }
                if (node.type === 'text_merge' && node.text_inputs) {
                    Object.keys(node.text_inputs).forEach((slot) => {
                        if (idSet.has(node.text_inputs[slot])) node.text_inputs[slot] = null;
                    });
                }
                if (node.type === 'translation' && idSet.has(node.text_input)) {
                    node.text_input = null;
                    node.status = Object.assign({}, node.status || {}, { state: 'idle', message: t('Text input removed.', '文本输入已移除。') });
                }
                if (node.type === 'tag_cart' && idSet.has(node.text_input)) {
                    node.text_input = null;
                }
                if (node.type === 'vlm' && node.image_inputs) {
                    let removed = false;
                    Object.keys(node.image_inputs).forEach((slot) => {
                        if (idSet.has(node.image_inputs[slot])) {
                            node.image_inputs[slot] = null;
                            removed = true;
                        }
                    });
                    if (removed) node.status = Object.assign({}, node.status || {}, { state: 'idle', message: t('Image input removed.', '图片输入已移除。') });
                }
                if (node.type === 'compare' && node.inputs) {
                    Object.keys(node.inputs).forEach((slot) => {
                        if (idSet.has(node.inputs[slot])) node.inputs[slot] = null;
                    });
                }
                if (node.type === 'timeline' && Array.isArray(node.clips)) {
                    node.clips = node.clips.filter(clip => !idSet.has(clip.source_node_id));
                }
                if (node.type === 'sam3_video_mask' && idSet.has(node.input_node_id)) {
                    node.input_node_id = null;
                    node.status = Object.assign({}, node.status || {}, { state: 'idle', message: t('Source video removed.', '源视频已移除。') });
                }
                if (node.type === 'pose_studio' && idSet.has(node.input_node_id)) {
                    node.input_node_id = null;
                    node.status = Object.assign({}, node.status || {}, { state: 'idle', message: t('Reference image removed.', '参考图已移除。') });
                }
                if (node.type === 'gaussian_studio' && idSet.has(node.input_node_id)) {
                    node.input_node_id = null;
                    node.status = Object.assign({}, node.status || {}, { state: 'idle', message: t('Reference image removed.', '参考图已移除。') });
                }
                if (node.type === 'liveportrait_expression') {
                    node.liveportrait_expression = Object.assign({}, node.liveportrait_expression || {});
                    if (idSet.has(node.input_node_id) || idSet.has(node.liveportrait_expression.source_node_id)) {
                        node.input_node_id = null;
                        node.liveportrait_expression.source_node_id = '';
                        node.status = Object.assign({}, node.status || {}, { state: 'idle', message: t('Source image removed.', '源图已移除。') });
                    }
                    if (idSet.has(node.reference_node_id) || idSet.has(node.liveportrait_expression.reference_node_id)) {
                        node.reference_node_id = null;
                        node.liveportrait_expression.reference_node_id = '';
                        node.status = Object.assign({}, node.status || {}, { state: 'idle', message: t('Reference expression removed.', '参考表情已移除。') });
                    }
                }
                if (call('isQwenTtsNode', node) && node.audio_inputs) {
                    let removed = false;
                    Object.keys(node.audio_inputs).forEach((slot) => {
                        if (idSet.has(node.audio_inputs[slot])) {
                            node.audio_inputs[slot] = null;
                            removed = true;
                        }
                    });
                    if (removed) node.status = Object.assign({}, node.status || {}, { state: 'idle', message: t('Reference audio removed.', '参考音频已移除。') });
                }
                if (call('isDirectorTimelineNode', node) && node.media_inputs) {
                    let removed = false;
                    Object.keys(node.media_inputs).forEach((slot) => {
                        if (idSet.has(node.media_inputs[slot])) {
                            node.media_inputs[slot] = null;
                            removed = true;
                        }
                    });
                    if (removed) call('updateDirectorStatus', node);
                }
                if ((node.type !== 'preset' && node.type !== 'classic') || !node.upload_slots) return;
                Object.keys(node.upload_slots).forEach((slot) => {
                    if (idSet.has(node.upload_slots[slot])) node.upload_slots[slot] = null;
                });
                Object.keys(node.text_inputs || {}).forEach((slot) => {
                    if (idSet.has(node.text_inputs[slot])) node.text_inputs[slot] = null;
                });
                ['models_config', 'styles_config', 'resolution_config', 'generation_config'].forEach((key) => {
                    if (idSet.has(node[key]?.source_node_id)) {
                        node[key] = Object.assign({}, node[key], { mode: 'preset_default', source_node_id: null, overrides: {} });
                    }
                });
                if (node.type === 'classic' && node.enhance_detection_configs) {
                    Object.keys(node.enhance_detection_configs).forEach((key) => {
                        if (idSet.has(node.enhance_detection_configs[key])) node.enhance_detection_configs[key] = null;
                    });
                }
            });
            writeSelection({
                selectedNodeId: null,
                selectedNodeIds: new Set(),
                selectedEdgeId: null
            });
            call('mutate');
        }

        function deleteEdge(edgeId, options) {
            const project = getProject();
            const edge = (project.edges || []).find(item => item.id === edgeId);
            if (edge && (isNodeLocked(getNode(edge.from)) || isNodeLocked(getNode(edge.to)))) {
                call('showToast', t('Locked node connections cannot be deleted', '已锁定节点的连线无法删除'));
                return;
            }
            if (edge && options?.history !== false) call('pushHistory', t('Delete edge', '删除连线'));
            call('handleCanvasAgentWorkflowEdgeDeletion', edge);
            project.edges = (project.edges || []).filter(item => item.id !== edgeId);
            if (edge && edge.type === 'upload') {
                const node = getNode(edge.to);
                if (node && node.upload_slots && node.upload_slots[edge.slot] === edge.from) {
                    node.upload_slots[edge.slot] = null;
                    call('refreshPresetSpecialNodeDom', node, { syncViewer: true });
                }
            }
            if (edge && edge.type === 'config') {
                const preset = getNode(edge.to);
                const detectionIndex = call('parseDetectionSlot', edge.slot);
                if (detectionIndex >= 0 && preset?.type === 'classic') {
                    preset.enhance_detection_configs = Object.assign({}, preset.enhance_detection_configs || {}, { [String(detectionIndex)]: null });
                } else {
                    const configKey = call('configKeyForKind', edge.slot);
                    if (preset && preset[configKey]?.source_node_id === edge.from) {
                        preset[configKey] = Object.assign({}, preset[configKey], { mode: 'preset_default', source_node_id: null, overrides: {} });
                    }
                }
            }
            if (edge && edge.type === 'text') {
                const target = getNode(edge.to);
                const source = getNode(edge.from);
                if (source?.type === 'style_selector' && source.style_selector?.target_preset_id === edge.to) {
                    source.style_selector = Object.assign({}, source.style_selector || {}, { target_preset_id: '' });
                }
                if ((target?.type === 'preset' || target?.type === 'classic') && target.text_inputs && target.text_inputs[edge.slot] === edge.from) {
                    target.text_inputs[edge.slot] = null;
                }
                if (target?.type === 'text' && edge.slot === 'input' && target.text_input === edge.from) {
                    target.text_input = null;
                }
                if (target?.type === 'text_merge' && target.text_inputs?.[edge.slot] === edge.from) {
                    target.text_inputs[edge.slot] = null;
                }
                if (target?.type === 'translation' && edge.slot === 'input' && target.text_input === edge.from) {
                    target.text_input = null;
                    target.status = Object.assign({}, target.status || {}, { state: 'idle', message: t('Text input disconnected.', '文本输入已断开。') });
                }
                if (target?.type === 'tag_cart' && edge.slot === 'input' && target.text_input === edge.from) {
                    target.text_input = null;
                }
            }
            if (edge && edge.type === 'image') {
                const target = getNode(edge.to);
                if (target?.type === 'wd14' && target.input_node_id === edge.from) {
                    target.input_node_id = null;
                    target.status = Object.assign({}, target.status || {}, { state: 'idle', message: t('Image input disconnected.', '图片输入已断开。') });
                }
                if (target?.type === 'vlm' && target.image_inputs?.[edge.slot] === edge.from) {
                    target.image_inputs[edge.slot] = null;
                    target.status = Object.assign({}, target.status || {}, { state: 'idle', message: t('Image input disconnected.', '图片输入已断开。') });
                }
                if (target?.type === 'mask' && edge.slot === 'source' && target.input_node_id === edge.from) {
                    target.input_node_id = null;
                    target.status = Object.assign({}, target.status || {}, { state: 'idle', message: t('Source image disconnected.', '源图输入已断开。') });
                }
                if (target?.type === 'pose_studio' && edge.slot === 'reference' && target.input_node_id === edge.from) {
                    target.input_node_id = null;
                    target.status = Object.assign({}, target.status || {}, { state: 'idle', message: t('Reference image disconnected.', '参考图输入已断开。') });
                }
                if (target?.type === 'gaussian_studio' && edge.slot === 'reference' && target.input_node_id === edge.from) {
                    target.input_node_id = null;
                    target.status = Object.assign({}, target.status || {}, { state: 'idle', message: t('Reference image disconnected.', '参考图输入已断开。') });
                }
                if (target?.type === 'liveportrait_expression') {
                    target.liveportrait_expression = Object.assign({}, target.liveportrait_expression || {});
                    if (edge.slot === 'source' && (target.input_node_id === edge.from || target.liveportrait_expression.source_node_id === edge.from)) {
                        target.input_node_id = null;
                        target.liveportrait_expression.source_node_id = '';
                        target.status = Object.assign({}, target.status || {}, { state: 'idle', message: t('Source image disconnected.', '源图输入已断开。') });
                    }
                    if (edge.slot === 'reference' && (target.reference_node_id === edge.from || target.liveportrait_expression.reference_node_id === edge.from)) {
                        target.reference_node_id = null;
                        target.liveportrait_expression.reference_node_id = '';
                        target.status = Object.assign({}, target.status || {}, { state: 'idle', message: t('Reference expression disconnected.', '参考表情输入已断开。') });
                    }
                }
            }
            if (edge && edge.type === 'media') {
                const target = getNode(edge.to);
                if (target?.type === 'sam3_video_mask' && edge.slot === 'source' && target.input_node_id === edge.from) {
                    target.input_node_id = null;
                    target.status = Object.assign({}, target.status || {}, { state: 'idle', message: t('Source video disconnected.', '源视频输入已断开。') });
                }
                if (call('isQwenTtsNode', target) && target.audio_inputs?.[edge.slot] === edge.from) {
                    target.audio_inputs[edge.slot] = null;
                    target.status = Object.assign({}, target.status || {}, { state: 'idle', message: t('Reference audio disconnected.', '参考音频输入已断开。') });
                }
                if (call('isDirectorTimelineNode', target) && target.media_inputs?.[edge.slot] === edge.from) {
                    target.media_inputs[edge.slot] = null;
                    call('updateDirectorStatus', target);
                }
            }
            if (edge && edge.type === 'compare') {
                const target = getNode(edge.to);
                if (target?.type === 'compare' && target.inputs?.[edge.slot] === edge.from) {
                    target.inputs[edge.slot] = null;
                }
            }
            if (edge && edge.type === 'timeline') {
                const target = getNode(edge.to);
                if (target?.type === 'timeline' && Array.isArray(target.clips)) {
                    target.clips = target.clips.filter(clip => clip.id !== edge.slot);
                }
            }
            if (edge && edge.type === 'batch_input') {
                const target = getNode(edge.to);
                if (target?.type === 'batch_any' && Array.isArray(target.items)) {
                    target.items = target.items.filter(item => item?.source_edge_id !== edge.id && item?.id !== edge.slot);
                    call('refreshBatchAnyActiveItem', target);
                }
            }
            if (edge && edge.type === 'generate') {
                const result = getNode(edge.to);
                if (result?.producer?.preset_node_id === edge.from) {
                    result.producer.preset_node_id = null;
                    result.status = Object.assign({}, result.status || {}, { state: 'manual', message: t('Preset output connection disconnected.', '已断开 preset 输出连接。') });
                }
                if (result?.producer?.timeline_node_id === edge.from) {
                    result.producer.timeline_node_id = null;
                    result.status = Object.assign({}, result.status || {}, { state: 'manual', message: t('Timeline output connection disconnected.', '已断开 Timeline 输出连接。') });
                }
                if (result?.producer?.qwen_tts_node_id === edge.from) {
                    result.producer.qwen_tts_node_id = null;
                    result.status = Object.assign({}, result.status || {}, { state: 'manual', message: t('Qwen TTS output connection disconnected.', '已断开 Qwen TTS 输出连接。') });
                }
            }
            writeSelection({ selectedEdgeId: null });
            if (options && options.render === false) call('scheduleSave');
            else call('mutate');
        }

        function deleteUploadSlot(presetId, slot, options) {
            const project = getProject();
            const edge = (project.edges || []).find(item => item.type === 'upload' && item.to === presetId && item.slot === slot);
            if (edge) {
                deleteEdge(edge.id, options);
                return;
            }
            const node = getNode(presetId);
            if (node?.upload_slots) node.upload_slots[slot] = null;
            call('refreshPresetSpecialNodeDom', node, { syncViewer: true });
            if (options && options.render === false) call('scheduleSave');
            else call('mutate');
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
