(function () {
    'use strict';

    function createCanvasAgentMaskWorkflowController(source) {
        const scope = source?.maskWorkflowSource || source || {};
        const languageSource = scope.languageSource || {};
        const identitySource = scope.identitySource || {};
        const projectSource = scope.projectSource || {};
        const assetSource = scope.assetSource || {};
        const mediaSource = scope.mediaSource || {};
        const resultSource = scope.resultSource || {};
        const layoutSource = scope.layoutSource || {};
        const agentSource = scope.agentSource || {};
        const runtimeSource = scope.runtimeSource || {};
        const schedulerSource = scope.schedulerSource || {};
        const sketchSource = scope.sketchSource || {};
        const call = (sourceObject, name, fallback, ...args) => typeof sourceObject[name] === 'function'
            ? sourceObject[name](...args)
            : fallback;
        const t = languageSource.t || ((en, cn) => cn || en);
        const uid = (...args) => call(identitySource, 'uid', '', ...args);
        const getProject = () => call(projectSource, 'getProject', {}) || {};
        const getNode = (...args) => call(projectSource, 'getNode', null, ...args);
        const getAgentState = () => call(agentSource, 'getAgentState', {}) || {};
        const getNodeLayerForgeAsset = (...args) => call(assetSource, 'getNodeLayerForgeAsset', null, ...args);
        const assetMediaKind = (...args) => call(assetSource, 'assetMediaKind', '', ...args);
        const assetDisplaySrc = (...args) => call(assetSource, 'assetDisplaySrc', '', ...args);
        const getNodeImageSrc = (...args) => call(assetSource, 'getNodeImageSrc', '', ...args);
        const createImageNodeFromSketchOutput = (...args) => call(assetSource, 'createImageNodeFromSketchOutput', null, ...args);
        const ensureWorkbenchLazyRuntime = (...args) => call(runtimeSource, 'ensureWorkbenchLazyRuntime', false, ...args);
        const getMaskUploadSlot = (...args) => call(mediaSource, 'canvasAgentMaskUploadSlot', '', ...args) || '';
        const canvasAgentUploadSlotsForNode = (...args) => call(mediaSource, 'canvasAgentUploadSlotsForNode', [], ...args) || [];
        const isCanvasAgentMaskSlot = (...args) => !!call(mediaSource, 'isCanvasAgentMaskSlot', false, ...args);
        const canNodeConnectToUploadSlot = (...args) => !!call(mediaSource, 'canNodeConnectToUploadSlot', false, ...args);
        const createUploadEdge = (...args) => call(mediaSource, 'createUploadEdge', null, ...args);
        const syncResolutionConfigForPresetInputs = (...args) => call(mediaSource, 'syncResolutionConfigForPresetInputs', null, ...args);
        const generatedResultNodesForPreset = (...args) => call(resultSource, 'generatedResultNodesForPreset', [], ...args) || [];
        const isResultRefreshing = (...args) => !!call(resultSource, 'isResultRefreshing', false, ...args);
        const isCanvasRunActiveState = (...args) => !!call(resultSource, 'isCanvasRunActiveState', false, ...args);
        const nodeStatusState = (...args) => call(resultSource, 'nodeStatusState', '', ...args);
        const ensureGenerateEdge = (...args) => call(resultSource, 'ensureGenerateEdge', null, ...args);
        const buildReservedResultNode = (...args) => call(resultSource, 'buildReservedResultNode', null, ...args);
        const buildProjectNodeAppendPatch = (...args) => call(resultSource, 'buildProjectNodeAppendPatch', {}, ...args) || {};
        const buildCanvasAgentReservedResultSource = (...args) => call(resultSource, 'buildCanvasAgentReservedResultSource', {}, ...args) || {};
        const presetGenerationStepValue = (...args) => call(resultSource, 'presetGenerationStepValue', 0, ...args);
        const presetResultBasePosition = (...args) => call(resultSource, 'presetResultBasePosition', null, ...args);
        const defaultNodeSize = (...args) => call(layoutSource, 'defaultNodeSize', { w: 240, h: 260 }, ...args) || { w: 240, h: 260 };
        const dockCanvasAgentPanelBottomLeft = (...args) => call(agentSource, 'dockCanvasAgentPanelBottomLeft', null, ...args);
        const applyNodeLayoutPatch = (...args) => call(layoutSource, 'applyNodeLayoutPatch', null, ...args);
        const createCanvasAgentWorkflowGroup = (...args) => call(layoutSource, 'createCanvasAgentWorkflowGroup', null, ...args);
        const fitCanvasAgentWorkflowGroup = (...args) => call(layoutSource, 'fitCanvasAgentWorkflowGroup', null, ...args);
        const centerCanvasAgentWorkflow = (...args) => call(layoutSource, 'centerCanvasAgentWorkflow', null, ...args);
        const mutate = (...args) => call(agentSource, 'mutate', null, ...args);
        const setCanvasAgentMessage = (...args) => call(agentSource, 'setCanvasAgentMessage', null, ...args);
        const showToast = (...args) => call(agentSource, 'showToast', null, ...args);
        const setCanvasAgentRunInfo = (...args) => call(agentSource, 'setCanvasAgentRunInfo', null, ...args);
        const clearCanvasAgentRunInfo = (...args) => call(agentSource, 'clearCanvasAgentRunInfo', null, ...args);
        const runPresetNode = (...args) => call(runtimeSource, 'runPresetNode', null, ...args);
        const setCanvasAgentSelection = (...args) => call(agentSource, 'setCanvasAgentSelection', null, ...args);
        const schedule = (...args) => call(schedulerSource, 'setTimeout', null, ...args);
        const getSketchAdapter = (...args) => call(sketchSource, 'getSketchAdapter', null, ...args);

        function canvasAgentManualMaskWorkflowNodes(presetNode, resultNode, maskNode) {
            const seen = new Set();
            return [presetNode, resultNode, maskNode].filter((node) => {
                if (!node || seen.has(node.id)) return false;
                seen.add(node.id);
                return true;
            });
        }

        function findCanvasAgentReservedResultNodeForPreset(presetNode) {
            if (!presetNode?.id) return null;
            return generatedResultNodesForPreset(presetNode).find(result => {
                return result?.source?.kind === 'canvas_agent_reserved_result'
                    && !result.producer?.run_id
                    && !isResultRefreshing(result)
                    && !isCanvasRunActiveState(nodeStatusState(result));
            }) || null;
        }

        function syncCanvasAgentMaskTargetToPreset(sourceNode, presetNode, maskCarrierNode) {
            if (!sourceNode || !presetNode) return '';
            const maskSlot = getMaskUploadSlot(presetNode);
            if (maskSlot && maskCarrierNode?.type === 'mask' && canNodeConnectToUploadSlot(maskCarrierNode, maskSlot)) {
                createUploadEdge(maskCarrierNode.id, presetNode.id, maskSlot, { silent: true });
                return maskSlot;
            }
            if (sourceNode.type === 'image' && sourceNode.mask?.data_url) {
                let imageSlot = Object.entries(presetNode.upload_slots || {})
                    .find(([, nodeId]) => nodeId === sourceNode.id)?.[0] || '';
                if (!imageSlot) {
                    const imageSlots = canvasAgentUploadSlotsForNode(presetNode).filter(slot => !isCanvasAgentMaskSlot(slot));
                    imageSlot = imageSlots.find(slot => canNodeConnectToUploadSlot(sourceNode, slot.key))?.key || '';
                    if (imageSlot) createUploadEdge(sourceNode.id, presetNode.id, imageSlot, { silent: true });
                }
                if (imageSlot && imageSlot !== maskSlot) syncResolutionConfigForPresetInputs(presetNode);
            }
            return maskSlot;
        }

        function createCanvasAgentReservedResultNode(presetNode, spec) {
            if (!presetNode) return null;
            const existing = findCanvasAgentReservedResultNodeForPreset(presetNode);
            if (existing) return existing;
            const size = defaultNodeSize('result');
            const basePosition = presetResultBasePosition(presetNode) || {
                x: Math.round((presetNode.x || 0) + (presetNode.w || 360) + 140),
                y: Math.round((presetNode.y || 0) + 20)
            };
            const resultNode = buildReservedResultNode({
                position: basePosition,
                size: {
                    w: Math.max(240, Number(size?.w || 240)),
                    h: Math.max(260, Number(size?.h || 260))
                },
                title: `${presetNode.title || 'Preset'} ${t('Output', '输出')}`,
                producer: {
                    preset_node_id: presetNode.id,
                    run_id: null,
                    run_token: '',
                    task_id: null,
                    refreshing: false,
                    stale: false
                },
                step: 0,
                totalSteps: presetGenerationStepValue(presetNode),
                message: t('Result reserved; save the mask to auto-run.', '结果已占位；保存蒙版后会自动运行。'),
                collapsed: false,
                source: buildCanvasAgentReservedResultSource({
                    presetNodeId: presetNode.id,
                    tool: spec?.key || spec?.label || ''
                })
            });
            if (!resultNode) return null;
            const project = getProject();
            Object.assign(project, buildProjectNodeAppendPatch(project, resultNode));
            ensureGenerateEdge(presetNode.id, resultNode.id);
            return resultNode;
        }

        async function runCanvasAgentManualMaskPreset(presetNode, resultNode, workflowGroup, spec, savedNode) {
            const currentPreset = getNode(presetNode?.id);
            const currentResult = getNode(resultNode?.id) || findCanvasAgentReservedResultNodeForPreset(currentPreset);
            if (!currentPreset || !currentResult) return { ok: false, error: 'masked workflow is missing preset or result' };
            fitCanvasAgentWorkflowGroup(workflowGroup?.id || workflowGroup, canvasAgentManualMaskWorkflowNodes(currentPreset, currentResult, savedNode), 48);
            setCanvasAgentRunInfo({
                token: uid('agent_run'),
                stage: t('Submitting masked quick tool', '提交蒙版快捷工具'),
                preset: currentPreset.title || currentPreset.preset?.display_name || currentPreset.preset?.name || '',
                model: t('Direct prompt', '直接提示词')
            });
            setCanvasAgentMessage(t('{tool} mask saved. Auto-running now.', '{tool} 蒙版已保存，正在自动运行。').replace('{tool}', spec?.label || t('Quick tool', '快捷工具')));
            try {
                const response = await runPresetNode(currentPreset, {
                    resultNode: currentResult,
                    reuseExistingResult: true
                });
                fitCanvasAgentWorkflowGroup(workflowGroup?.id || workflowGroup, canvasAgentManualMaskWorkflowNodes(currentPreset, getNode(currentResult.id) || currentResult, savedNode), 48);
                return response;
            } finally {
                clearCanvasAgentRunInfo(1800);
            }
        }

        async function openCanvasAgentMaskSketch(sourceNode, presetNode, resultNode, workflowGroup, spec) {
            if (!sourceNode || !presetNode) return;
            const ready = await ensureWorkbenchLazyRuntime(
                'customSketch',
                () => typeof getSketchAdapter()?.open === 'function',
                t('Loading Sketch...', '正在加载 Sketch...'),
                t('Sketch adapter is not ready.', 'Sketch 控件尚未就绪。')
            );
            if (!ready) return;
            const adapter = getSketchAdapter();
            if (!adapter || typeof adapter.open !== 'function') {
                showToast(t('Sketch adapter is not ready.', 'Sketch 控件尚未就绪。'));
                return;
            }
            const asset = getNodeLayerForgeAsset(sourceNode);
            if (assetMediaKind(asset || {}) !== 'image') {
                showToast(t('Sketch only supports image assets.', 'Sketch 仅支持图片素材。'));
                return;
            }
            const image = assetDisplaySrc(asset) || getNodeImageSrc(sourceNode);
            if (!image) {
                showToast(t('No image available for Sketch.', '没有可用于 Sketch 的图片。'));
                return;
            }
            adapter.open({
                image,
                mask: sourceNode.type === 'image' ? (sourceNode.mask?.data_url || '') : '',
                title: `${spec?.label || t('Mask', '蒙版')} · ${sourceNode.title || 'Image'}`,
                onSave: async (payload) => {
                    const outputNode = await createImageNodeFromSketchOutput(sourceNode, payload);
                    if (!outputNode) return;
                    const currentPreset = getNode(presetNode.id);
                    const currentSource = getNode(sourceNode.id);
                    const savedNode = getNode(outputNode?.id) || currentSource;
                    if (currentPreset && savedNode) {
                        const currentResult = getNode(resultNode?.id) || findCanvasAgentReservedResultNodeForPreset(currentPreset);
                        const maskSource = savedNode?.type === 'image' ? savedNode : (currentSource || savedNode);
                        syncCanvasAgentMaskTargetToPreset(maskSource, currentPreset, savedNode);
                        const groupNodes = canvasAgentManualMaskWorkflowNodes(currentPreset, currentResult, savedNode.id && savedNode.id !== sourceNode.id ? savedNode : null);
                        fitCanvasAgentWorkflowGroup(workflowGroup?.id || workflowGroup, groupNodes.filter(Boolean), 48);
                        setCanvasAgentSelection(currentPreset.id, [currentPreset.id]);
                        mutate({ inspector: true });
                        const workflowMaskNode = savedNode.id && savedNode.id !== sourceNode.id ? savedNode : null;
                        schedule(() => {
                            Promise.resolve(runCanvasAgentManualMaskPreset(currentPreset, currentResult, workflowGroup, spec, workflowMaskNode)).catch((err) => {
                                console.warn('[SimpAI Canvas] Agent masked quick tool auto-run failed', err);
                                showToast(t('Masked quick tool run failed: {error}', '蒙版快捷工具运行失败：{error}').replace('{error}', String(err?.message || err || 'unknown error')));
                                clearCanvasAgentRunInfo(0);
                            });
                        }, 0);
                    }
                },
                onError: (err) => showToast(t('Sketch save failed: {error}', 'Sketch 保存失败：{error}').replace('{error}', String(err?.message || err || 'unknown error')))
            }).catch((err) => {
                console.warn('[SimpAI Canvas] Agent mask Sketch open failed', err);
                showToast(t('Sketch failed to open: {error}', 'Sketch 打开失败：{error}').replace('{error}', String(err?.message || err || 'unknown error')));
            });
        }

        function prepareCanvasAgentManualMaskWorkflow(sourceNode, presetNode, spec, title) {
            dockCanvasAgentPanelBottomLeft({ render: false });
            if (presetNode) applyNodeLayoutPatch(presetNode, { collapsed: true });
            const resultNode = createCanvasAgentReservedResultNode(presetNode, spec);
            const workflowNodes = canvasAgentManualMaskWorkflowNodes(presetNode, resultNode, null);
            const group = createCanvasAgentWorkflowGroup(workflowNodes, title || `${t('Agent masked quick tool', 'Agent 蒙版快捷工具')}: ${spec?.label || ''}`);
            setCanvasAgentSelection(presetNode?.id || sourceNode?.id || null, [presetNode?.id || sourceNode?.id].filter(Boolean));
            mutate({ inspector: true });
            centerCanvasAgentWorkflow(workflowNodes);
            schedule(() => openCanvasAgentMaskSketch(sourceNode, presetNode, resultNode, group, spec), 80);
            setCanvasAgentMessage(t('{tool} workflow is grouped. Sketch is open; save the mask to auto-run.', '{tool} 工作流已分组。Sketch 已打开，保存蒙版后将自动运行。').replace('{tool}', spec?.label || t('Quick tool', '快捷工具')));
            return group;
        }

        return {
            canvasAgentManualMaskWorkflowNodes,
            syncCanvasAgentMaskTargetToPreset,
            createCanvasAgentReservedResultNode,
            runCanvasAgentManualMaskPreset,
            openCanvasAgentMaskSketch,
            prepareCanvasAgentManualMaskWorkflow
        };
    }

    window.SimpAICanvasWorkbenchAgentMaskWorkflow = Object.assign(
        {},
        window.SimpAICanvasWorkbenchAgentMaskWorkflow || {},
        { createCanvasAgentMaskWorkflowController }
    );
})();
