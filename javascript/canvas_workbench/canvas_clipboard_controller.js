(function () {
    'use strict';

    function createCanvasClipboardController(context) {
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
        const layoutSource = sourceObject('layoutSource');
        const layoutCall = (name, fallback, ...args) => typeof layoutSource[name] === 'function'
            ? layoutSource[name](...args)
            : fallback;
        const configSource = sourceObject('configSource');
        const configCall = (name, fallback, ...args) => typeof configSource[name] === 'function'
            ? configSource[name](...args)
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
        const viewportSource = sourceObject('viewportSource');
        const viewportCall = (name, fallback, ...args) => typeof viewportSource[name] === 'function'
            ? viewportSource[name](...args)
            : fallback;
        const uiSource = sourceObject('uiSource');
        const uiCall = (name, fallback, ...args) => typeof uiSource[name] === 'function'
            ? uiSource[name](...args)
            : fallback;
        const getProject = () => projectCall('getProject', {}) || {};
        const getVlmImageSlots = () => {
            const value = configCall('getVlmImageSlots', []);
            return Array.isArray(value) ? value : [];
        };
        const cloneValue = (value) => {
            if (typeof utilitySource.cloneRunValue === 'function') return utilitySource.cloneRunValue(value, {});
            try {
                return JSON.parse(JSON.stringify(value));
            } catch (err) {
                return Object.assign({}, value || {});
            }
        };
        const uid = (...args) => utilityCall('uid', '', ...args);
        const nowIso = () => utilityCall('nowIso', '');
        let canvasClipboard = null;

        function translate(en, cn) {
            return t(en, cn) || en;
        }

        function applyProjectNodesPatch(project, nodes) {
            const nextNodes = Array.isArray(nodes) ? nodes : [];
            const patch = patchCall('buildProjectNodesPatch', undefined, project, nextNodes);
            if (patch && typeof patch === 'object' && !Array.isArray(patch) && Array.isArray(patch.nodes)) {
                Object.assign(project, patch);
                return;
            }
            Object.assign(project, { nodes: nextNodes });
        }

        function applyProjectEdgeAppendPatch(project, edge) {
            const currentEdges = Array.isArray(project?.edges) ? project.edges : [];
            const patch = patchCall('buildProjectEdgeAppendPatch', undefined, project, edge);
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
            const patch = patchCall('buildNodeFlagPatch', undefined, node, { [flag]: nextValue });
            if (patch && typeof patch === 'object' && Object.prototype.hasOwnProperty.call(patch, flag)) {
                Object.assign(node, patch);
                return;
            }
            Object.assign(node, { [flag]: nextValue });
        }

        function applySpecialNodeConnectionPatch(node, options) {
            const patch = patchCall('buildSpecialNodeConnectionPatch', undefined, node, options || {});
            if (patch && typeof patch === 'object') Object.assign(node, patch);
        }

        function applySam3SourcePatch(node, options) {
            const patch = patchCall('buildSam3SourcePatch', undefined, node, options || {});
            if (patch && typeof patch === 'object') Object.assign(node, patch);
        }

        function applyMaskStatePatch(node, options) {
            const patch = patchCall('buildMaskStatePatch', undefined, node, options || {});
            if (patch && typeof patch === 'object') Object.assign(node, patch);
        }

        function applyStyleSelectorStatePatch(node, options) {
            const patch = patchCall('buildStyleSelectorStatePatch', undefined, node, options || {});
            if (patch && typeof patch === 'object') Object.assign(node, patch);
        }

        function applyDirectorTimelineStatePatch(node, options) {
            const patch = patchCall('buildDirectorTimelineStatePatch', undefined, node, options || {});
            if (patch && typeof patch === 'object') Object.assign(node, patch);
        }

        function applyTranslationStatePatch(node, options) {
            const patch = patchCall('buildTranslationStatePatch', undefined, node, options || {});
            if (patch && typeof patch === 'object') Object.assign(node, patch);
        }

        function applyTagCartStatePatch(node, options) {
            const patch = patchCall('buildTagCartStatePatch', undefined, node, options || {});
            if (patch && typeof patch === 'object') Object.assign(node, patch);
        }

        function applyWd14StatePatch(node, options) {
            const patch = patchCall('buildWd14StatePatch', undefined, node, options || {});
            if (patch && typeof patch === 'object') Object.assign(node, patch);
        }

        function applyWildcardsHelperStatePatch(node, options) {
            const patch = patchCall('buildWildcardsHelperStatePatch', undefined, node, options || {});
            if (patch && typeof patch === 'object') Object.assign(node, patch);
        }

        function applyConfigStatePatch(node, options) {
            const patch = patchCall('buildConfigStatePatch', undefined, node, options || {});
            if (patch && typeof patch === 'object') Object.assign(node, patch);
        }

        function applyPresetConfigPatch(node, configKey, options) {
            const config = Object.assign({ configKey }, options || {});
            const patch = patchCall('buildPresetConfigPatch', undefined, node, config);
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
            const patch = patchCall('buildPresetUploadSlotPatch', undefined, node, options || {});
            if (patch && typeof patch === 'object' && Object.prototype.hasOwnProperty.call(patch, 'upload_slots')) {
                Object.assign(node, patch);
            }
        }

        function applyClassicNodeStatePatch(node, options) {
            const patch = patchCall('buildClassicNodeStatePatch', undefined, node, options || {});
            if (patch && typeof patch === 'object') Object.assign(node, patch);
        }

        function applyNodeLayoutPatch(node, options) {
            const patch = patchCall('buildNodeLayoutPatch', undefined, node, options || {});
            if (patch && typeof patch === 'object') Object.assign(node, patch);
        }

        function applyPresetTextInputPatch(node, options) {
            const patch = patchCall('buildPresetTextInputPatch', undefined, node, options || {});
            if (patch && typeof patch === 'object') Object.assign(node, patch);
        }

        function applyTextMergeStatePatch(node, options) {
            const patch = patchCall('buildTextMergeStatePatch', undefined, node, options || {});
            if (patch && typeof patch === 'object') Object.assign(node, patch);
        }

        function applyTextNodeStatePatch(node, options) {
            const patch = patchCall('buildTextNodeStatePatch', undefined, node, options || {});
            if (patch && typeof patch === 'object') Object.assign(node, patch);
        }

        function applyCompareStatePatch(node, options) {
            const patch = patchCall('buildCompareStatePatch', undefined, node, options || {});
            if (patch && typeof patch === 'object') Object.assign(node, patch);
        }

        function applyNoteStatePatch(node, options) {
            const patch = patchCall('buildNoteStatePatch', undefined, node, options || {});
            if (patch && typeof patch === 'object') Object.assign(node, patch);
        }

        function applyVlmChatStatePatch(node, options) {
            const patch = patchCall('buildVlmChatStatePatch', undefined, node, options || {}) || {
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
            const patch = patchCall('buildVlmParamsPatch', undefined, node, options || {});
            if (patch && typeof patch === 'object') Object.assign(node, patch);
        }

        function applyVlmImageInputsPatch(node, options) {
            const patch = patchCall('buildVlmImageInputsPatch', undefined, node, options || {});
            if (patch && typeof patch === 'object' && Object.prototype.hasOwnProperty.call(patch, 'image_inputs')) {
                Object.assign(node, patch);
            }
        }

        function applyResultStatusPatch(node, options) {
            const patch = statusCall('buildResultStatusPatch', undefined, node, options || {});
            if (patch && typeof patch === 'object' && Object.prototype.hasOwnProperty.call(patch, 'status')) {
                Object.assign(node, patch);
            }
        }

        function applyResultProducerPatch(node, producerPatch) {
            const patch = patchCall('buildResultProducerPatch', undefined, node, producerPatch || {});
            if (patch && typeof patch === 'object' && Object.prototype.hasOwnProperty.call(patch, 'producer')) {
                Object.assign(node, patch);
            }
        }

        function applyQwenTtsStatePatch(node, options) {
            const patch = patchCall('buildQwenTtsStatePatch', undefined, node, options || {});
            if (patch && typeof patch === 'object') Object.assign(node, patch);
        }

        function applyPoseStudioStatePatch(node, options) {
            const patch = patchCall('buildPoseStudioStatePatch', undefined, node, options || {});
            if (patch && typeof patch === 'object') Object.assign(node, patch);
        }

        function applyGaussianStudioStatePatch(node, options) {
            const patch = patchCall('buildGaussianStudioStatePatch', undefined, node, options || {});
            if (patch && typeof patch === 'object') Object.assign(node, patch);
        }

        function applyLivePortraitNodeStatePatch(node, options) {
            const patch = patchCall('buildLivePortraitNodeStatePatch', undefined, node, options || {});
            if (patch && typeof patch === 'object') Object.assign(node, patch);
        }

        function applyLivePortraitVideoExpressionStatePatch(node, options) {
            const patch = patchCall('buildLivePortraitVideoExpressionStatePatch', undefined, node, options || {});
            if (patch && typeof patch === 'object') Object.assign(node, patch);
        }

        function applySpecialNodeStatusPatch(node, options) {
            const patch = statusCall('buildSpecialNodeStatusPatch', undefined, node, options || {});
            if (patch && typeof patch === 'object' && Object.prototype.hasOwnProperty.call(patch, 'status')) {
                Object.assign(node, patch);
                return true;
            }
            return false;
        }

        function applyCanvasNodeStatusPatch(node, options) {
            const config = options || {};
            const patch = statusCall('buildCanvasNodeStatusPatch', undefined, node, config);
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
            const status = statusCall('mergeCanvasRunStatus', undefined, node?.status, state, message);
            if (node?.type === 'result' && typeof statusSource.buildResultStatusPatch === 'function') {
                const patch = statusCall('buildResultStatusPatch', undefined, node, { status });
                if (patch && typeof patch === 'object' && Object.prototype.hasOwnProperty.call(patch, 'status')) {
                    Object.assign(node, patch);
                    return;
                }
            }
            if (node?.type === 'vlm' && typeof statusSource.buildVlmRunStatusPatch === 'function') {
                const patch = statusCall('buildVlmRunStatusPatch', undefined, node, { status });
                if (patch && typeof patch === 'object' && Object.prototype.hasOwnProperty.call(patch, 'status')) {
                    Object.assign(node, patch);
                    return;
                }
            }
            if (node?.type === 'mask' && typeof statusSource.buildMaskStatePatch === 'function') {
                const patch = statusCall('buildMaskStatePatch', undefined, node, { status });
                if (patch && typeof patch === 'object' && Object.prototype.hasOwnProperty.call(patch, 'status')) {
                    Object.assign(node, patch);
                    return;
                }
            }
            if (node?.type === 'translation' && typeof statusSource.buildTranslationStatePatch === 'function') {
                const patch = statusCall('buildTranslationStatePatch', undefined, node, { status });
                if (patch && typeof patch === 'object' && Object.prototype.hasOwnProperty.call(patch, 'status')) {
                    Object.assign(node, patch);
                    return;
                }
            }
            if (node?.type === 'wd14' && typeof statusSource.buildWd14StatePatch === 'function') {
                const patch = statusCall('buildWd14StatePatch', undefined, node, { status });
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
            const state = selectionCall('getSelectionState', selectionSource) || {};
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
            if (typeof selectionSource.setSelectionState === 'function') selectionSource.setSelectionState(state);
            else Object.assign(selectionSource, state);
        }

        function getSelectedNodeIdList() {
            const ids = selectionCall('getSelectedNodeIdList', undefined);
            if (Array.isArray(ids)) return ids.filter(Boolean);
            const state = getSelectionState();
            if (state.selectedNodeIds.size) return Array.from(state.selectedNodeIds);
            return state.selectedNodeId ? [state.selectedNodeId] : [];
        }

        function getNodeRect(node) {
            const rect = layoutCall('getNodeRect', undefined, node);
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
                uiCall('showToast', undefined, translate('No selected nodes to copy.', '没有选中的节点可复制'));
                return null;
            }
            canvasClipboard = buildSelectionClipboard(ids);
            uiCall('showToast', undefined, translate('Copied {count} node(s).', '已复制 {count} 个节点').replace('{count}', canvasClipboard.nodes.length));
            return canvasClipboard;
        }

        function normalizePastedNode(node) {
            applyNodeFlagPatch(node, 'locked', false);
            if (node.type === 'preset' || node.type === 'classic') {
                const uploadSlots = {};
                const slots = node.type === 'classic'
                    ? (configCall('getVisibleClassicUploadSlots', [], node) || [])
                    : (configCall('getVisibleUploadSlots', [], node) || []);
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
            if (node.type === 'timeline') configCall('normalizeTimelineNode', undefined, node);
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
            const slots = nodeCall('textMergeInputSlots', undefined, node);
            return Array.isArray(slots) ? slots : (Array.isArray(node?.input_slots) ? node.input_slots : ['input_1', 'input_2']);
        }

        function isTextOutputNode(node) {
            return !!nodeCall('isTextOutputNode', false, node);
        }

        function wouldCreateTextCycle(fromId, toId) {
            return !!nodeCall('wouldCreateTextCycle', false, fromId, toId);
        }

        function applyPastedEdgeRelation(edge) {
            const to = nodeCall('getNode', null, edge.to);
            const from = nodeCall('getNode', null, edge.from);
            if (!to || !from) return;
            if (edge.type === 'upload' && (to.type === 'preset' || to.type === 'classic')) {
                applyPresetUploadSlotPatch(to, { uploadSlotsPatch: { [edge.slot]: from.id } });
            } else if (edge.type === 'config' && from.type === 'config' && (to.type === 'preset' || to.type === 'classic')) {
                applyConfigStatePatch(from, { targetPresetId: to.id });
                configCall('applyConfigNodeToPreset', undefined, from);
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
            } else if (edge.type === 'image' && nodeCall('isPoseStudioImageSource', false, from) && to.type === 'pose_studio') {
                applySpecialNodeConnectionPatch(to, { inputNodeId: from.id });
                applyRunStatus(to, 'ready', translate('Reference image connected.', '参考图已连接。'));
            } else if (edge.type === 'image' && nodeCall('isLivePortraitExpressionImageSource', false, from) && to.type === 'liveportrait_expression') {
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
            } else if (edge.type === 'image' && nodeCall('isVlmMediaSource', false, from) && to.type === 'vlm') {
                const slots = getVlmImageSlots();
                const slot = slots.some(item => item.key === edge.slot) ? edge.slot : 'image_1';
                applyVlmImageInputsPatch(to, { imageInputsPatch: { [slot]: from.id } });
                applyRunStatus(to, 'ready', translate('Media connected.', '媒体已连接。'));
            } else if (edge.type === 'media' && nodeCall('isSam3VideoMaskSource', false, from) && to.type === 'sam3_video_mask') {
                applySam3SourcePatch(to, { inputNodeId: from.id });
                applyRunStatus(to, 'ready', translate('Source video connected.', '源视频已连接。'));
            } else if (edge.type === 'media' && nodeCall('isQwenTtsAudioSource', false, from) && nodeCall('isQwenTtsNode', false, to)) {
                const slot = edge.slot || 'ref_audio';
                applyQwenTtsStatePatch(to, {
                    audioInputsPatch: { [slot]: from.id },
                    status: statusCall('mergeCanvasRunStatus', undefined, to?.status, 'ready', translate('Reference audio connected.', '参考音频已连接。'))
                });
            } else if (edge.type === 'media' && nodeCall('isDirectorTimelineNode', false, to) && nodeCall('isDirectorMediaSourceForSlot', false, from, edge.slot)) {
                applyDirectorTimelineStatePatch(to, {
                    mediaInputsPatch: { [edge.slot || 'image_1']: from.id }
                });
                actionCall('updateDirectorStatus', undefined, to);
            } else if (edge.type === 'compare' && nodeCall('isImageCompareSource', false, from) && to.type === 'compare') {
                const slot = ['a', 'b'].includes(edge.slot) ? edge.slot : 'a';
                applyCompareStatePatch(to, { inputsPatch: { [slot]: from.id } });
            } else if (edge.type === 'timeline' && nodeCall('isTimelineSource', false, from) && to.type === 'timeline') {
                if (!Array.isArray(to.clips) || !to.clips.some(clip => clip.id === edge.slot)) {
                    actionCall('addTimelineClipFromSource', undefined, to, from, { history: false, render: false, edge: false });
                }
            }
        }

        function pasteCanvasClipboard(world, options) {
            if (!canvasClipboard || !Array.isArray(canvasClipboard.nodes) || !canvasClipboard.nodes.length) {
                uiCall('showToast', undefined, translate('Clipboard has no canvas nodes.', '剪贴板没有画布节点'));
                return [];
            }
            const project = getProject();
            const opts = options || {};
            historyCall('pushHistory', undefined, opts.label || 'Paste nodes');
            const sourceNodes = canvasClipboard.nodes;
            const bounds = getClipboardBounds(sourceNodes);
            const target = world || viewportCall('viewportCenterWorld', null) || { x: 0, y: 0 };
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
                const fromId = idMap[edge.from] || (opts.withInputConnections && nodeCall('getNode', null, edge.from) ? edge.from : null);
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
            persistenceCall('mutate', undefined);
            if (opts.showToast !== false) {
                uiCall('showToast', undefined, translate('Pasted {count} node(s).', '已粘贴 {count} 个节点').replace('{count}', pasted.length));
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
            return getSelectedNodeIdList().map(id => nodeCall('getNode', null, id)).filter(Boolean);
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
