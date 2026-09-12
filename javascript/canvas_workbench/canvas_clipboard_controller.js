(function () {
    'use strict';

    function createCanvasClipboardController(context) {
        const scope = context || {};
        const call = (name, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : undefined;
        const getProject = () => typeof scope.getProject === 'function' ? (scope.getProject() || {}) : {};
        const getVlmImageSlots = () => {
            const value = typeof scope.getVlmImageSlots === 'function' ? scope.getVlmImageSlots() : [];
            return Array.isArray(value) ? value : [];
        };
        const t = typeof scope.t === 'function' ? scope.t : ((en, cn) => cn || en);
        const cloneValue = (value) => {
            if (typeof scope.cloneRunValue === 'function') return scope.cloneRunValue(value, {});
            try {
                return JSON.parse(JSON.stringify(value));
            } catch (err) {
                return Object.assign({}, value || {});
            }
        };
        const uid = typeof scope.uid === 'function'
            ? scope.uid
            : (prefix) => `${prefix || 'id'}_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 8)}`;
        const nowIso = typeof scope.nowIso === 'function' ? scope.nowIso : () => new Date().toISOString();
        let canvasClipboard = null;

        function translate(en, cn) {
            return t(en, cn) || en;
        }

        function applyProjectNodesPatch(project, nodes) {
            const nextNodes = Array.isArray(nodes) ? nodes : [];
            const patch = call('buildProjectNodesPatch', project, nextNodes);
            if (patch && typeof patch === 'object' && !Array.isArray(patch) && Array.isArray(patch.nodes)) {
                Object.assign(project, patch);
                return;
            }
            Object.assign(project, { nodes: nextNodes });
        }

        function applyProjectEdgeAppendPatch(project, edge) {
            const currentEdges = Array.isArray(project?.edges) ? project.edges : [];
            const patch = call('buildProjectEdgeAppendPatch', project, edge);
            if (patch && typeof patch === 'object' && !Array.isArray(patch) && Array.isArray(patch.edges)) {
                Object.assign(project, patch);
                return;
            }
            const nextEdges = currentEdges.slice();
            if (edge && typeof edge === 'object') nextEdges.push(edge);
            Object.assign(project, { edges: nextEdges });
        }

        function applyNodeFlagPatch(node, flag, value) {
            const nextValue = !!value;
            const patch = call('buildNodeFlagPatch', node, { [flag]: nextValue });
            if (patch && typeof patch === 'object' && Object.prototype.hasOwnProperty.call(patch, flag)) {
                Object.assign(node, patch);
                return;
            }
            Object.assign(node, { [flag]: nextValue });
        }

        function applySpecialNodeConnectionPatch(node, options) {
            const patch = call('buildSpecialNodeConnectionPatch', node, options || {});
            if (patch && typeof patch === 'object') Object.assign(node, patch);
        }

        function applySam3SourcePatch(node, options) {
            const patch = call('buildSam3SourcePatch', node, options || {});
            if (patch && typeof patch === 'object') Object.assign(node, patch);
        }

        function applyMaskStatePatch(node, options) {
            const patch = call('buildMaskStatePatch', node, options || {});
            if (patch && typeof patch === 'object') Object.assign(node, patch);
        }

        function applyStyleSelectorStatePatch(node, options) {
            const patch = call('buildStyleSelectorStatePatch', node, options || {});
            if (patch && typeof patch === 'object') Object.assign(node, patch);
        }

        function applyDirectorTimelineStatePatch(node, options) {
            const patch = call('buildDirectorTimelineStatePatch', node, options || {});
            if (patch && typeof patch === 'object') Object.assign(node, patch);
        }

        function applyTranslationStatePatch(node, options) {
            const patch = call('buildTranslationStatePatch', node, options || {});
            if (patch && typeof patch === 'object') Object.assign(node, patch);
        }

        function applyTagCartStatePatch(node, options) {
            const patch = call('buildTagCartStatePatch', node, options || {});
            if (patch && typeof patch === 'object') Object.assign(node, patch);
        }

        function applyWd14StatePatch(node, options) {
            const patch = call('buildWd14StatePatch', node, options || {});
            if (patch && typeof patch === 'object') Object.assign(node, patch);
        }

        function applyWildcardsHelperStatePatch(node, options) {
            const patch = call('buildWildcardsHelperStatePatch', node, options || {});
            if (patch && typeof patch === 'object') Object.assign(node, patch);
        }

        function applyConfigStatePatch(node, options) {
            const patch = call('buildConfigStatePatch', node, options || {});
            if (patch && typeof patch === 'object') Object.assign(node, patch);
        }

        function applyPresetConfigPatch(node, configKey, options) {
            const config = Object.assign({ configKey }, options || {});
            const patch = call('buildPresetConfigPatch', node, config);
            if (patch && typeof patch === 'object'
                && Object.prototype.hasOwnProperty.call(patch, configKey)) {
                Object.assign(node, patch);
                return;
            }
            const current = node?.[configKey];
            if (current) {
                Object.assign(node, {
                    [configKey]: Object.assign({}, current, config.presetConfigPatch || {})
                });
            }
        }

        function applyPresetUploadSlotPatch(node, options) {
            const patch = call('buildPresetUploadSlotPatch', node, options || {});
            if (patch && typeof patch === 'object' && Object.prototype.hasOwnProperty.call(patch, 'upload_slots')) {
                Object.assign(node, patch);
            }
        }

        function applyClassicNodeStatePatch(node, options) {
            const patch = call('buildClassicNodeStatePatch', node, options || {});
            if (patch && typeof patch === 'object') Object.assign(node, patch);
        }

        function applyNodeLayoutPatch(node, options) {
            const patch = call('buildNodeLayoutPatch', node, options || {});
            if (patch && typeof patch === 'object') Object.assign(node, patch);
        }

        function applyPresetTextInputPatch(node, options) {
            const patch = call('buildPresetTextInputPatch', node, options || {});
            if (patch && typeof patch === 'object') Object.assign(node, patch);
        }

        function applyTextMergeStatePatch(node, options) {
            const patch = call('buildTextMergeStatePatch', node, options || {});
            if (patch && typeof patch === 'object') Object.assign(node, patch);
        }

        function applyTextNodeStatePatch(node, options) {
            const patch = call('buildTextNodeStatePatch', node, options || {});
            if (patch && typeof patch === 'object') Object.assign(node, patch);
        }

        function applyCompareStatePatch(node, options) {
            const patch = call('buildCompareStatePatch', node, options || {});
            if (patch && typeof patch === 'object') Object.assign(node, patch);
        }

        function applyNoteStatePatch(node, options) {
            const patch = call('buildNoteStatePatch', node, options || {});
            if (patch && typeof patch === 'object') Object.assign(node, patch);
        }

        function applyVlmChatStatePatch(node, options) {
            const patch = call('buildVlmChatStatePatch', node, options || {}) || {
                messages: [],
                pending_images: [],
                conversation_id: '',
                agent_tool_state: {},
                updated_at: ''
            };
            if (patch && typeof patch === 'object') {
                Object.assign(node, { chat: Object.assign({}, node.chat || {}, patch) });
            }
        }

        function applyVlmParamsPatch(node, options) {
            const patch = call('buildVlmParamsPatch', node, options || {});
            if (patch && typeof patch === 'object') Object.assign(node, patch);
        }

        function applyVlmImageInputsPatch(node, options) {
            const patch = call('buildVlmImageInputsPatch', node, options || {});
            if (patch && typeof patch === 'object' && Object.prototype.hasOwnProperty.call(patch, 'image_inputs')) {
                Object.assign(node, patch);
            }
        }

        function applyResultStatusPatch(node, options) {
            const patch = call('buildResultStatusPatch', node, options || {});
            if (patch && typeof patch === 'object' && Object.prototype.hasOwnProperty.call(patch, 'status')) {
                Object.assign(node, patch);
            }
        }

        function applyResultProducerPatch(node, producerPatch) {
            const patch = call('buildResultProducerPatch', node, producerPatch || {});
            if (patch && typeof patch === 'object' && Object.prototype.hasOwnProperty.call(patch, 'producer')) {
                Object.assign(node, patch);
            }
        }

        function applyQwenTtsStatePatch(node, options) {
            const patch = call('buildQwenTtsStatePatch', node, options || {});
            if (patch && typeof patch === 'object') Object.assign(node, patch);
        }

        function applyPoseStudioStatePatch(node, options) {
            const patch = call('buildPoseStudioStatePatch', node, options || {});
            if (patch && typeof patch === 'object') Object.assign(node, patch);
        }

        function applyGaussianStudioStatePatch(node, options) {
            const patch = call('buildGaussianStudioStatePatch', node, options || {});
            if (patch && typeof patch === 'object') Object.assign(node, patch);
        }

        function applyLivePortraitNodeStatePatch(node, options) {
            const patch = call('buildLivePortraitNodeStatePatch', node, options || {});
            if (patch && typeof patch === 'object') Object.assign(node, patch);
        }

        function applyLivePortraitVideoExpressionStatePatch(node, options) {
            const patch = call('buildLivePortraitVideoExpressionStatePatch', node, options || {});
            if (patch && typeof patch === 'object') Object.assign(node, patch);
        }

        function applySpecialNodeStatusPatch(node, options) {
            const patch = call('buildSpecialNodeStatusPatch', node, options || {});
            if (patch && typeof patch === 'object' && Object.prototype.hasOwnProperty.call(patch, 'status')) {
                Object.assign(node, patch);
                return true;
            }
            return false;
        }

        function applyCanvasNodeStatusPatch(node, options) {
            const config = options || {};
            const patch = call('buildCanvasNodeStatusPatch', node, config);
            if (patch && typeof patch === 'object' && Object.prototype.hasOwnProperty.call(patch, 'status')) {
                Object.assign(node, patch);
                return true;
            }
            if (Object.prototype.hasOwnProperty.call(config, 'status')) {
                Object.assign(node, { status: config.status });
                return true;
            }
            return false;
        }

        function applyRunStatus(node, state, message) {
            const status = call('mergeCanvasRunStatus', node?.status, state, message);
            if (node?.type === 'result' && typeof scope.buildResultStatusPatch === 'function') {
                const patch = call('buildResultStatusPatch', node, { status });
                if (patch && typeof patch === 'object' && Object.prototype.hasOwnProperty.call(patch, 'status')) {
                    Object.assign(node, patch);
                    return;
                }
            }
            if (node?.type === 'vlm' && typeof scope.buildVlmRunStatusPatch === 'function') {
                const patch = call('buildVlmRunStatusPatch', node, { status });
                if (patch && typeof patch === 'object' && Object.prototype.hasOwnProperty.call(patch, 'status')) {
                    Object.assign(node, patch);
                    return;
                }
            }
            if (node?.type === 'mask' && typeof scope.buildMaskStatePatch === 'function') {
                const patch = call('buildMaskStatePatch', node, { status });
                if (patch && typeof patch === 'object' && Object.prototype.hasOwnProperty.call(patch, 'status')) {
                    Object.assign(node, patch);
                    return;
                }
            }
            if (node?.type === 'translation' && typeof scope.buildTranslationStatePatch === 'function') {
                const patch = call('buildTranslationStatePatch', node, { status });
                if (patch && typeof patch === 'object' && Object.prototype.hasOwnProperty.call(patch, 'status')) {
                    Object.assign(node, patch);
                    return;
                }
            }
            if (node?.type === 'wd14' && typeof scope.buildWd14StatePatch === 'function') {
                const patch = call('buildWd14StatePatch', node, { status });
                if (patch && typeof patch === 'object' && Object.prototype.hasOwnProperty.call(patch, 'status')) {
                    Object.assign(node, patch);
                    return;
                }
            }
            if (['pose_studio', 'gaussian_studio', 'liveportrait_expression'].includes(node?.type)
                && applySpecialNodeStatusPatch(node, { status })) return;
            applyCanvasNodeStatusPatch(node, { status });
        }

        function getSelectionState() {
            const state = typeof scope.getSelectionState === 'function'
                ? (scope.getSelectionState() || {})
                : scope;
            return {
                selectedNodeId: state.selectedNodeId || null,
                selectedNodeIds: state.selectedNodeIds instanceof Set
                    ? new Set(state.selectedNodeIds)
                    : new Set(Array.isArray(state.selectedNodeIds) ? state.selectedNodeIds : []),
                selectedEdgeId: state.selectedEdgeId || null,
                selectedGroupId: state.selectedGroupId || null
            };
        }

        function setSelectionState(next) {
            const state = Object.assign(getSelectionState(), next || {});
            state.selectedNodeIds = state.selectedNodeIds instanceof Set
                ? new Set(state.selectedNodeIds)
                : new Set(Array.isArray(state.selectedNodeIds) ? state.selectedNodeIds : []);
            if (typeof scope.setSelectionState === 'function') scope.setSelectionState(state);
            else Object.assign(scope, state);
        }

        function getSelectedNodeIdList() {
            const ids = call('getSelectedNodeIdList');
            if (Array.isArray(ids)) return ids.filter(Boolean);
            const state = getSelectionState();
            if (state.selectedNodeIds.size) return Array.from(state.selectedNodeIds);
            return state.selectedNodeId ? [state.selectedNodeId] : [];
        }

        function getNodeRect(node) {
            const rect = call('getNodeRect', node);
            if (rect && Number.isFinite(Number(rect.x)) && Number.isFinite(Number(rect.y))) {
                return {
                    x: Number(rect.x),
                    y: Number(rect.y),
                    w: Math.max(1, Number(rect.w) || 1),
                    h: Math.max(1, Number(rect.h) || 1)
                };
            }
            return {
                x: Number(node?.x) || 0,
                y: Number(node?.y) || 0,
                w: Math.max(1, Number(node?.width || node?.w) || 1),
                h: Math.max(1, Number(node?.height || node?.h) || 1)
            };
        }

        function buildSelectionClipboard(ids) {
            const project = getProject();
            const idSet = new Set(ids || []);
            const nodes = (project.nodes || [])
                .filter(node => idSet.has(node.id))
                .map(node => cloneValue(node));
            const edges = (project.edges || [])
                .filter(edge => idSet.has(edge.from) && idSet.has(edge.to))
                .map(edge => cloneValue(edge));
            const inputEdges = (project.edges || [])
                .filter(edge => idSet.has(edge.to) && !idSet.has(edge.from))
                .map(edge => cloneValue(edge));
            const inputIds = new Set(inputEdges.map(edge => edge.from));
            const inputNodes = (project.nodes || [])
                .filter(node => inputIds.has(node.id))
                .map(node => cloneValue(node));
            return {
                schema: 'simpai.canvas.clipboard.v1',
                created_at: nowIso(),
                nodes,
                edges,
                input_nodes: inputNodes,
                input_edges: inputEdges
            };
        }

        function copyCanvasSelection() {
            const ids = getSelectedNodeIdList();
            if (!ids.length) {
                call('showToast', translate('No selected nodes to copy.', '没有选中的节点可复制'));
                return null;
            }
            canvasClipboard = buildSelectionClipboard(ids);
            call('showToast', translate('Copied {count} node(s).', '已复制 {count} 个节点').replace('{count}', canvasClipboard.nodes.length));
            return canvasClipboard;
        }

        function normalizePastedNode(node) {
            applyNodeFlagPatch(node, 'locked', false);
            if (node.type === 'preset' || node.type === 'classic') {
                const uploadSlots = {};
                const slots = node.type === 'classic'
                    ? (call('getVisibleClassicUploadSlots', node) || [])
                    : (call('getVisibleUploadSlots', node) || []);
                slots.forEach((slot) => {
                    if (slot?.key) uploadSlots[slot.key] = null;
                });
                applyPresetUploadSlotPatch(node, { uploadSlots });
                applyPresetTextInputPatch(node, {
                    textInputs: {},
                    styleTransferSelectorId: null
                });
                ['models_config', 'styles_config', 'resolution_config', 'generation_config'].forEach((key) => {
                    if (node[key]) applyPresetConfigPatch(node, key, {
                        presetConfigPatch: { source_node_id: null }
                    });
                });
                if (node.type === 'classic') applyClassicNodeStatePatch(node, { enhanceDetectionConfigs: {} });
                if (node.type === 'preset' && Object.prototype.hasOwnProperty.call(node, 'liveportrait_video_expression')) {
                    applyLivePortraitVideoExpressionStatePatch(node, {
                        statePatch: {
                            expression_state_draft: '',
                            source_node_id: '',
                            source_asset: null,
                            source_frame_size: { width: 0, height: 0 },
                            face_selection: {},
                            source_face_bbox: '',
                            reference_face_bbox: ''
                        }
                    });
                }
                applyCanvasNodeStatusPatch(node, { status: 'idle' });
            }
            if (node.type === 'config') applyConfigStatePatch(node, { targetPresetId: null });
            if (node.type === 'text_merge') {
                applyTextMergeStatePatch(node, {
                    textInputs: {},
                    inputSlots: Array.isArray(node.input_slots) && node.input_slots.length
                        ? node.input_slots
                        : ['input_1', 'input_2']
                });
            }
            if (node.type === 'compare') applyCompareStatePatch(node, { inputs: {} });
            if (node.type === 'result') {
                applyResultProducerPatch(node, { preset_node_id: null, run_id: null, task_id: null });
                if (node.status && !node.asset) {
                    applyResultStatusPatch(node, { statusPatch: {
                        state: 'manual',
                        message: translate('Copied result node; replace manually or continue connecting.', '复制出的结果节点，请手动替换或继续连接。')
                    } });
                }
            }
            if (node.type === 'wd14') {
                applyWd14StatePatch(node, {
                    inputNodeId: null,
                    status: {
                        state: 'idle',
                        message: translate('Connect an image or result node, then tag it.', '请连接图像或结果节点，再进行标签识别。')
                    }
                });
            }
            if (node.type === 'mask') {
                applyMaskStatePatch(node, {
                    inputNodeId: null,
                    sourcePatch: { source_node_id: '' },
                    statusPatch: {
                        state: 'idle',
                        message: translate('Connect a source image, then generate a black/white mask.', '请连接源图像，再生成黑白遮罩。')
                    }
                });
            }
            if (node.type === 'text') applyTextNodeStatePatch(node, { textInputId: null });
            if (node.type === 'wildcards_helper') applyWildcardsHelperStatePatch(node, { wildcardsCatalog: null });
            if (node.type === 'translation') {
                applyTranslationStatePatch(node, {
                    textInputId: null,
                    status: {
                        state: 'idle',
                        message: translate('Connect text, then translate.', '请连接文本，再进行翻译。')
                    }
                });
            }
            if (node.type === 'tag_cart') applyTagCartStatePatch(node, { textInputId: null });
            if (node.type === 'style_selector') {
                applyStyleSelectorStatePatch(node, { statePatch: { target_preset_id: '' } });
            }
            if (node.type === 'pose_studio') {
                applySpecialNodeConnectionPatch(node, { inputNodeId: null });
                applyPoseStudioStatePatch(node, { statePatch: { reference_asset: null } });
                applyRunStatus(
                    node,
                    node.asset ? 'finished' : 'idle',
                    node.asset
                        ? translate('Pose image ready.', '姿态图已准备好。')
                        : translate('Open Pose Studio to export a pose image.', '请打开 Pose Studio 导出姿态图。')
                );
            }
            if (node.type === 'gaussian_studio') {
                applySpecialNodeConnectionPatch(node, { inputNodeId: null });
                applyGaussianStudioStatePatch(node, { statePatch: { reference_asset: null } });
                applyRunStatus(
                    node,
                    node.asset ? 'finished' : 'idle',
                    node.asset
                        ? translate('Gaussian render ready.', 'Gaussian 渲染结果已准备好。')
                        : translate('Open Gaussian Studio to build a view.', '请打开 Gaussian Studio 创建视图。')
                );
            }
            if (node.type === 'liveportrait_expression') {
                applySpecialNodeConnectionPatch(node, {
                    inputNodeId: null,
                    referenceNodeId: null,
                    livePortraitSourceNodeId: '',
                    livePortraitReferenceNodeId: ''
                });
                applyLivePortraitNodeStatePatch(node, {
                    statePatch: {
                        source_node_id: '',
                        reference_node_id: '',
                        source_asset: null,
                        reference_asset: null
                    }
                });
                applyRunStatus(
                    node,
                    node.asset ? 'finished' : 'idle',
                    node.asset
                        ? translate('Expression image ready.', '表情图已准备好。')
                        : translate('Connect a source image, then edit expression.', '请连接源图，再编辑表情。')
                );
            }
            if (node.type === 'vlm') {
                applyVlmImageInputsPatch(node, { imageInputs: {} });
                applyVlmChatStatePatch(node, {
                    messages: [],
                    pendingImages: [],
                    conversationId: '',
                    agentToolState: {},
                    updatedAt: nowIso()
                });
                applyVlmParamsPatch(node, { paramsPatch: { conversation_id: uid('vlm_chat') } });
                applyRunStatus(
                    node,
                    'idle',
                    translate('Connect image/result nodes and write an instruction.', '请连接图像或结果节点，并输入指令。')
                );
            }
            if (node.type === 'compare') {
                applyCompareStatePatch(node, { inputs: {} });
            }
            if (node.type === 'timeline') call('normalizeTimelineNode', node);
            return node;
        }

        function getClipboardSourceEdges(options) {
            const edges = Array.isArray(canvasClipboard?.edges) ? canvasClipboard.edges : [];
            if (!options?.withInputConnections) return edges;
            const seen = new Set();
            return [
                ...(Array.isArray(canvasClipboard?.input_edges) ? canvasClipboard.input_edges : []),
                ...edges
            ].filter((edge) => {
                const key = `${edge?.from || ''}:${edge?.to || ''}:${edge?.type || ''}:${edge?.slot || edge?.config_kind || ''}`;
                if (!edge?.from || !edge?.to || seen.has(key)) return false;
                seen.add(key);
                return true;
            });
        }

        function getClipboardBounds(nodes) {
            let minX = Infinity;
            let minY = Infinity;
            let maxX = -Infinity;
            let maxY = -Infinity;
            (nodes || []).forEach((node) => {
                const rect = getNodeRect(node);
                minX = Math.min(minX, rect.x);
                minY = Math.min(minY, rect.y);
                maxX = Math.max(maxX, rect.x + rect.w);
                maxY = Math.max(maxY, rect.y + rect.h);
            });
            if (!Number.isFinite(minX)) return { minX: 0, minY: 0, width: 1, height: 1 };
            return { minX, minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
        }

        function textMergeInputSlots(node) {
            const slots = call('textMergeInputSlots', node);
            return Array.isArray(slots) ? slots : (Array.isArray(node?.input_slots) ? node.input_slots : ['input_1', 'input_2']);
        }

        function isTextOutputNode(node) {
            return !!call('isTextOutputNode', node);
        }

        function wouldCreateTextCycle(fromId, toId) {
            return !!call('wouldCreateTextCycle', fromId, toId);
        }

        function applyPastedEdgeRelation(edge) {
            const to = call('getNode', edge.to);
            const from = call('getNode', edge.from);
            if (!to || !from) return;
            if (edge.type === 'upload' && (to.type === 'preset' || to.type === 'classic')) {
                applyPresetUploadSlotPatch(to, { uploadSlotsPatch: { [edge.slot]: from.id } });
            } else if (edge.type === 'config' && from.type === 'config' && (to.type === 'preset' || to.type === 'classic')) {
                applyConfigStatePatch(from, { targetPresetId: to.id });
                call('applyConfigNodeToPreset', from);
            } else if (edge.type === 'generate' && to.type === 'result') {
                applyResultProducerPatch(to, { preset_node_id: from.id, run_id: null, task_id: null });
            } else if (edge.type === 'text' && isTextOutputNode(from) && (to.type === 'preset' || to.type === 'classic')) {
                const slot = edge.slot || 'prompt';
                applyPresetTextInputPatch(to, {
                    textInputsPatch: { [slot]: from.id },
                    ...(from.type === 'style_selector' && slot === 'prompt'
                        ? { styleTransferSelectorId: from.id }
                        : {})
                });
                if (from.type === 'style_selector' && slot === 'prompt') {
                    applyStyleSelectorStatePatch(from, { statePatch: { target_preset_id: to.id } });
                }
            } else if (edge.type === 'text' && isTextOutputNode(from) && to.type === 'text_merge' && textMergeInputSlots(to).includes(edge.slot) && !wouldCreateTextCycle(from.id, to.id)) {
                applyTextMergeStatePatch(to, { textInputsPatch: { [edge.slot]: from.id } });
            } else if (edge.type === 'text' && isTextOutputNode(from) && ['text', 'translation', 'tag_cart'].includes(to.type) && edge.slot === 'input' && !wouldCreateTextCycle(from.id, to.id)) {
                if (to.type === 'translation') applyTranslationStatePatch(to, { textInputId: from.id });
                else if (to.type === 'tag_cart') applyTagCartStatePatch(to, { textInputId: from.id });
                else applyTextNodeStatePatch(to, { textInputId: from.id });
            } else if (edge.type === 'image' && ['image', 'result'].includes(from.type) && to.type === 'mask') {
                applyMaskStatePatch(to, { inputNodeId: from.id });
                applyRunStatus(to, 'ready', translate('Source image connected.', '源图像已连接。'));
            } else if (edge.type === 'image' && ['image', 'result'].includes(from.type) && to.type === 'wd14') {
                applyWd14StatePatch(to, {
                    inputNodeId: from.id,
                    status: Object.assign({}, to.status || {}, { state: 'ready', message: translate('Image connected.', '图像已连接。') })
                });
            } else if (edge.type === 'image' && call('isPoseStudioImageSource', from) && to.type === 'pose_studio') {
                applySpecialNodeConnectionPatch(to, { inputNodeId: from.id });
                applyRunStatus(to, 'ready', translate('Reference image connected.', '参考图已连接。'));
            } else if (edge.type === 'image' && call('isLivePortraitExpressionImageSource', from) && to.type === 'liveportrait_expression') {
                const slot = edge.slot === 'reference' ? 'reference' : 'source';
                if (slot === 'reference') {
                    applySpecialNodeConnectionPatch(to, {
                        referenceNodeId: from.id,
                        livePortraitReferenceNodeId: from.id
                    });
                } else {
                    applySpecialNodeConnectionPatch(to, {
                        inputNodeId: from.id,
                        livePortraitSourceNodeId: from.id
                    });
                }
                applyRunStatus(
                    to,
                    'ready',
                    slot === 'reference'
                        ? translate('Reference expression connected.', '参考表情已连接。')
                        : translate('Source image connected.', '源图已连接。')
                );
            } else if (edge.type === 'image' && call('isVlmMediaSource', from) && to.type === 'vlm') {
                const slots = getVlmImageSlots();
                const slot = slots.some(item => item.key === edge.slot) ? edge.slot : 'image_1';
                applyVlmImageInputsPatch(to, { imageInputsPatch: { [slot]: from.id } });
                applyRunStatus(to, 'ready', translate('Media connected.', '媒体已连接。'));
            } else if (edge.type === 'media' && call('isSam3VideoMaskSource', from) && to.type === 'sam3_video_mask') {
                applySam3SourcePatch(to, { inputNodeId: from.id });
                applyRunStatus(to, 'ready', translate('Source video connected.', '源视频已连接。'));
            } else if (edge.type === 'media' && call('isQwenTtsAudioSource', from) && call('isQwenTtsNode', to)) {
                const slot = edge.slot || 'ref_audio';
                applyQwenTtsStatePatch(to, {
                    audioInputsPatch: { [slot]: from.id },
                    status: call('mergeCanvasRunStatus', to?.status, 'ready', translate('Reference audio connected.', '参考音频已连接。'))
                });
            } else if (edge.type === 'media' && call('isDirectorTimelineNode', to) && call('isDirectorMediaSourceForSlot', from, edge.slot)) {
                applyDirectorTimelineStatePatch(to, {
                    mediaInputsPatch: { [edge.slot || 'image_1']: from.id }
                });
                call('updateDirectorStatus', to);
            } else if (edge.type === 'compare' && call('isImageCompareSource', from) && to.type === 'compare') {
                const slot = ['a', 'b'].includes(edge.slot) ? edge.slot : 'a';
                applyCompareStatePatch(to, { inputsPatch: { [slot]: from.id } });
            } else if (edge.type === 'timeline' && call('isTimelineSource', from) && to.type === 'timeline') {
                if (!Array.isArray(to.clips) || !to.clips.some(clip => clip.id === edge.slot)) {
                    call('addTimelineClipFromSource', to, from, { history: false, render: false, edge: false });
                }
            }
        }

        function pasteCanvasClipboard(world, options) {
            if (!canvasClipboard || !Array.isArray(canvasClipboard.nodes) || !canvasClipboard.nodes.length) {
                call('showToast', translate('Clipboard has no canvas nodes.', '剪贴板没有画布节点'));
                return [];
            }
            const project = getProject();
            const opts = options || {};
            call('pushHistory', opts.label || 'Paste nodes');
            const sourceNodes = canvasClipboard.nodes;
            const bounds = getClipboardBounds(sourceNodes);
            const target = world || call('viewportCenterWorld') || { x: 0, y: 0 };
            const dx = Math.round(Number(target.x || 0) - (bounds.minX + bounds.width / 2));
            const dy = Math.round(Number(target.y || 0) - (bounds.minY + bounds.height / 2));
            const idMap = {};
            const pasted = [];
            const stepOffset = opts.stagger === false ? 0 : 10;
            sourceNodes.forEach((source, index) => {
                const node = normalizePastedNode(cloneValue(source));
                const oldId = node.id;
                node.id = uid(node.type || 'node');
                idMap[oldId] = node.id;
                applyNodeLayoutPatch(node, {
                    x: Math.round((node.x || 0) + dx + index * stepOffset),
                    y: Math.round((node.y || 0) + dy + index * stepOffset)
                });
                if (node.type === 'note' && node.tail?.target) {
                    applyNoteStatePatch(node, {
                        tailTargetPatch: {
                            x: Math.round(Number(node.tail.target.x || 0) + dx + index * stepOffset),
                            y: Math.round(Number(node.tail.target.y || 0) + dy + index * stepOffset)
                        }
                    });
                }
                node.title = `${node.title || node.type || 'Node'} Copy`;
                pasted.push(node);
            });
            applyProjectNodesPatch(project, (Array.isArray(project.nodes) ? project.nodes : []).concat(pasted));
            getClipboardSourceEdges(opts).forEach((edge) => {
                const toId = idMap[edge.to];
                if (!toId) return;
                const fromId = idMap[edge.from] || (opts.withInputConnections && call('getNode', edge.from) ? edge.from : null);
                if (!fromId) return;
                const next = cloneValue(edge);
                next.id = uid('edge');
                next.from = fromId;
                next.to = toId;
                applyProjectEdgeAppendPatch(project, next);
                applyPastedEdgeRelation(next);
            });
            setSelectionState({
                selectedNodeIds: new Set(pasted.map(node => node.id)),
                selectedNodeId: pasted[pasted.length - 1]?.id || null,
                selectedEdgeId: null,
                selectedGroupId: null
            });
            call('mutate');
            if (opts.showToast !== false) {
                call('showToast', translate('Pasted {count} node(s).', '已粘贴 {count} 个节点').replace('{count}', pasted.length));
            }
            return pasted;
        }

        function duplicateSelection(options) {
            const opts = options || {};
            const ids = getSelectedNodeIdList();
            if (!ids.length) return [];
            canvasClipboard = buildSelectionClipboard(ids);
            const bounds = getClipboardBounds(canvasClipboard.nodes);
            pasteCanvasClipboard({
                x: bounds.minX + bounds.width / 2 + (Number.isFinite(opts.offsetX) ? opts.offsetX : 42),
                y: bounds.minY + bounds.height / 2 + (Number.isFinite(opts.offsetY) ? opts.offsetY : 42)
            }, {
                label: opts.label || 'Duplicate nodes',
                showToast: opts.showToast,
                stagger: opts.stagger
            });
            return getSelectedNodeIdList().map(id => call('getNode', id)).filter(Boolean);
        }

        return {
            buildSelectionClipboard,
            copyCanvasSelection,
            duplicateSelection,
            getClipboardBounds,
            pasteCanvasClipboard
        };
    }

    window.SimpAICanvasWorkbenchClipboard = Object.assign({}, window.SimpAICanvasWorkbenchClipboard || {}, {
        createCanvasClipboardController
    });
})();
