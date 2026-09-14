(function () {
    'use strict';

    function createCanvasAgentSam3WorkflowController(source) {
        const scope = source?.sam3WorkflowSource || source || {};
        const languageSource = scope.languageSource || {};
        const identitySource = scope.identitySource || {};
        const projectSource = scope.projectSource || {};
        const stateSource = scope.stateSource || {};
        const mediaSource = scope.mediaSource || {};
        const resultSource = scope.resultSource || {};
        const layoutSource = scope.layoutSource || {};
        const renderSource = scope.renderSource || {};
        const agentSource = scope.agentSource || {};
        const patchSource = scope.patchSource || {};
        const editorSource = scope.editorSource || {};
        const persistenceSource = scope.persistenceSource || {};
        const call = (sourceObject, name, fallback, ...args) => typeof sourceObject[name] === 'function'
            ? sourceObject[name](...args)
            : fallback;
        const t = languageSource.t || ((en, cn) => cn || en);
        const uid = identitySource.uid || ((prefix) => `${prefix || 'id'}_${Date.now()}`);
        const nowIso = identitySource.nowIso || (() => new Date().toISOString());
        const getProject = () => call(projectSource, 'getProject', {}) || {};
        const getNode = (...args) => call(projectSource, 'getNode', null, ...args);
        const getGroup = (...args) => call(projectSource, 'getGroup', null, ...args);
        const getAgentState = () => call(stateSource, 'getAgentState', {}) || {};
        const getNodeRect = (...args) => call(layoutSource, 'getNodeRect', null, ...args);
        const defaultNodeSize = (...args) => call(layoutSource, 'defaultNodeSize', { w: 160, h: 120 }, ...args) || { w: 160, h: 120 };
        const getVideoMaskUploadSlot = (...args) => call(mediaSource, 'canvasAgentVideoMaskUploadSlot', '', ...args) || '';
        const getVideoSourceUploadSlot = (...args) => call(mediaSource, 'canvasAgentVideoSourceUploadSlot', '', ...args) || '';
        const getCanvasAgentReservedResultNode = (...args) => call(resultSource, 'createCanvasAgentReservedResultNode', null, ...args);
        const isCanvasAgentVideoTarget = (...args) => !!call(mediaSource, 'isCanvasAgentVideoTarget', false, ...args);
        const findActiveResultNodeForPreset = (...args) => call(resultSource, 'findActiveResultNodeForPreset', null, ...args);
        const isCanvasRunActiveState = (...args) => !!call(stateSource, 'isCanvasRunActiveState', false, ...args);
        const nodeStatusState = (...args) => call(stateSource, 'nodeStatusState', '', ...args);
        const getPendingPresetRuns = () => call(stateSource, 'getPendingPresetRuns', new Set()) || new Set();
        const getResultNode = (...args) => call(projectSource, 'getNode', null, ...args);
        const canvasAgentManualMaskWorkflowNodes = (...args) => call(editorSource, 'canvasAgentManualMaskWorkflowNodes', [], ...args) || [];
        const dockCanvasAgentPanelBottomLeft = (...args) => call(agentSource, 'dockCanvasAgentPanelBottomLeft', null, ...args);
        const applyNodeLayoutPatch = (...args) => call(layoutSource, 'applyNodeLayoutPatch', null, ...args);
        const buildNodeLayoutPatch = (...args) => call(layoutSource, 'buildNodeLayoutPatch', {}, ...args) || {};
        const addSam3VideoMaskNode = (...args) => call(layoutSource, 'addSam3VideoMaskNode', null, ...args);
        const positionCanvasAgentVideoMaskWorkflow = (...args) => call(layoutSource, 'positionCanvasAgentVideoMaskWorkflow', null, ...args);
        const createSam3VideoMaskEdge = (...args) => call(mediaSource, 'createSam3VideoMaskEdge', null, ...args);
        const createUploadEdge = (...args) => call(mediaSource, 'createUploadEdge', null, ...args);
        const buildResultSourcePatch = (...args) => call(patchSource, 'buildResultSourcePatch', {}, ...args) || {};
        const fitCanvasAgentWorkflowGroup = (...args) => call(layoutSource, 'fitCanvasAgentWorkflowGroup', null, ...args);
        const createCanvasAgentWorkflowGroup = (...args) => call(layoutSource, 'createCanvasAgentWorkflowGroup', null, ...args);
        const centerCanvasAgentWorkflow = (...args) => call(layoutSource, 'centerCanvasAgentWorkflow', null, ...args);
        const centerViewportOnWorld = (...args) => call(layoutSource, 'centerViewportOnWorld', null, ...args);
        const renderNodes = (...args) => call(renderSource, 'renderNodes', null, ...args);
        const renderEdges = (...args) => call(renderSource, 'renderEdges', null, ...args);
        const mutate = (...args) => call(agentSource, 'mutate', null, ...args);
        const setCanvasAgentRunInfo = (...args) => call(agentSource, 'setCanvasAgentRunInfo', null, ...args);
        const clearCanvasAgentRunInfo = (...args) => call(agentSource, 'clearCanvasAgentRunInfo', null, ...args);
        const runPresetNode = (...args) => call(agentSource, 'runPresetNode', null, ...args);
        const showToast = (...args) => call(agentSource, 'showToast', null, ...args);
        const setCanvasAgentSelection = (...args) => call(agentSource, 'setCanvasAgentSelection', null, ...args);
        const schedule = typeof persistenceSource.setTimeout === 'function' ? persistenceSource.setTimeout : globalThis.setTimeout;
        const buildSam3SourcePatch = (...args) => call(patchSource, 'buildSam3SourcePatch', {}, ...args) || {};
        const buildSam3StatePatch = (...args) => call(patchSource, 'buildSam3StatePatch', {}, ...args) || {};
        const buildGroupFieldPatch = (...args) => call(patchSource, 'buildGroupFieldPatch', {}, ...args) || {};
        const renderGroups = (...args) => call(renderSource, 'renderGroups', null, ...args);
        const findCanvasAgentReservedResultNodeForPreset = (...args) => call(resultSource, 'findCanvasAgentReservedResultNodeForPreset', null, ...args);
        const setCanvasAgentMessage = (...args) => call(agentSource, 'setCanvasAgentMessage', null, ...args);
        const scheduleSave = (...args) => call(persistenceSource, 'scheduleSave', null, ...args);
        const openSam3PointEditor = (...args) => call(editorSource, 'openSam3PointEditor', null, ...args);
        const mergeCanvasRunStatus = (...args) => call(stateSource, 'mergeCanvasRunStatus', null, ...args);

        function canvasAgentSam3WorkflowNodes(workflow, sam3Node, presetNode, resultNode) {
            return canvasAgentManualMaskWorkflowNodes(presetNode, resultNode, sam3Node);
        }

        function canvasAgentSam3WorkflowTitle(workflow, stateLabel) {
            const tool = workflow?.tool_label || t('Video quick tool', '视频快捷工具');
            const base = workflow?.group_title_base || `${t('Agent video quick tool', 'Agent 视频快捷工具')}: ${tool}`;
            const suffix = String(stateLabel || '').trim();
            return suffix ? `${base} · ${suffix}` : base;
        }

        function setCanvasAgentSam3WorkflowState(sam3Node, patch, stateLabel) {
            const node = getNode(sam3Node?.id) || sam3Node;
            if (!node) return null;
            const workflow = Object.assign({}, node.source?.agent_video_mask_workflow || {}, patch || {});
            Object.assign(node, buildSam3SourcePatch(node, {
                sourcePatch: { agent_video_mask_workflow: workflow }
            }));
            if (workflow.group_id && stateLabel !== undefined) {
                const group = getGroup(workflow.group_id);
                if (group) {
                    Object.assign(group, buildGroupFieldPatch(group, 'title', canvasAgentSam3WorkflowTitle(workflow, stateLabel)));
                    renderGroups();
                }
            }
            return workflow;
        }

        function canvasAgentSam3WorkflowMaskSignature(sam3Node, response, details) {
            const asset = sam3Node?.asset || {};
            return [
                details?.origin || sam3Node?.source?.mask_origin || '',
                asset.asset_id || asset.id || '',
                asset.path || asset.output_path || asset.preview_url || '',
                response?.mask_video?.path || response?.asset_ref?.path || '',
                response?.mask_video?.asset_id || response?.asset_ref?.asset_id || ''
            ].filter(Boolean).join('|') || `${sam3Node?.id || 'sam3'}:${Date.now()}`;
        }

        function findCanvasAgentSam3WorkflowForPreset(presetNode) {
            if (!presetNode?.id) return null;
            const project = getProject();
            return (Array.isArray(project.nodes) ? project.nodes : []).find(node => {
                const workflow = node?.source?.agent_video_mask_workflow;
                return node?.type === 'sam3_video_mask' && workflow?.preset_node_id === presetNode.id;
            }) || null;
        }

        function canvasAgentResultForPresetRun(presetNode, requestedResult) {
            if (requestedResult) return requestedResult;
            const workflowSam3 = findCanvasAgentSam3WorkflowForPreset(presetNode);
            const resultId = workflowSam3?.source?.agent_video_mask_workflow?.result_node_id || '';
            const resultNode = resultId ? getNode(resultId) : null;
            if (resultNode?.type === 'result') return resultNode;
            return findCanvasAgentReservedResultNodeForPreset(presetNode);
        }

        function prepareCanvasAgentVideoMaskWorkflow(sourceNode, presetNode, resultNode, spec, options) {
            const opts = options || {};
            const currentSource = getNode(sourceNode?.id) || sourceNode;
            const currentPreset = getNode(presetNode?.id) || presetNode;
            if (!currentSource || !isCanvasAgentVideoTarget(currentSource)) {
                return { ok: false, error: 'source video is unavailable' };
            }
            if (!currentPreset || !['preset', 'classic'].includes(currentPreset.type)) {
                return { ok: false, error: 'preset node is unavailable' };
            }
            const maskSlot = getVideoMaskUploadSlot(currentPreset);
            if (!maskSlot) {
                showToast(t('Selected video preset has no compatible mask video slot.', '所选视频预设没有可用的视频蒙版输入槽。'));
                return { ok: false, error: 'mask video slot is unavailable' };
            }
            dockCanvasAgentPanelBottomLeft({ render: false });
            applyNodeLayoutPatch(currentPreset, { collapsed: true });
            const currentResult = resultNode || getCanvasAgentReservedResultNode(currentPreset, spec);
            if (!currentResult) return { ok: false, error: 'reserved result could not be created' };
            const sourceRect = getNodeRect(currentSource);
            const sam3Size = defaultNodeSize('sam3_video_mask');
            const sam3World = {
                x: Math.round((sourceRect?.x || currentPreset.x || 0) + (sourceRect?.w || 360) + 120),
                y: Math.round(sourceRect?.y || currentPreset.y || 0)
            };
            const sam3Prompt = String(opts.prompt || getAgentState().input || '').trim();
            const sam3Node = addSam3VideoMaskNode(sam3World, {
                history: false,
                render: false,
                title: `${spec?.label || t('Video Mask', '视频蒙版')} SAM3`,
                params: sam3Prompt ? { prompt: sam3Prompt } : {}
            });
            if (!sam3Node) return { ok: false, error: 'SAM3 Video Mask node could not be created' };
            Object.assign(sam3Node, buildNodeLayoutPatch(sam3Node, {
                w: Number(sam3Node.w || sam3Size.w || 360),
                h: Number(sam3Node.h || sam3Size.h || 560),
                collapsed: false
            }));
            Object.assign(sam3Node, buildSam3StatePatch(sam3Node, {
                paramsPatch: sam3Prompt ? { prompt: sam3Prompt } : {}
            }));
            positionCanvasAgentVideoMaskWorkflow(currentSource, sam3Node, currentPreset, currentResult);
            createSam3VideoMaskEdge(currentSource.id, sam3Node.id, { silent: true });
            const sourceVideoSlot = getVideoSourceUploadSlot(currentPreset, currentSource);
            if (sourceVideoSlot && currentPreset.upload_slots?.[sourceVideoSlot] !== currentSource.id) {
                createUploadEdge(currentSource.id, currentPreset.id, sourceVideoSlot, { silent: true });
            }
            createUploadEdge(sam3Node.id, currentPreset.id, maskSlot, { silent: true });
            const agentWorkflow = {
                auto_run: true,
                source_node_id: currentSource.id,
                preset_node_id: currentPreset.id,
                result_node_id: currentResult.id,
                group_id: '',
                mask_slot: maskSlot,
                source_video_slot: sourceVideoSlot,
                tool_key: opts.toolKey || spec?.key || '',
                tool_label: spec?.label || '',
                group_title_base: opts.title || `${t('Agent video quick tool', 'Agent 视频快捷工具')}: ${spec?.label || t('Video quick tool', '视频快捷工具')}`,
                last_auto_run_state: 'waiting_for_mask',
                last_auto_run_error: '',
                created_at: nowIso()
            };
            Object.assign(sam3Node, buildSam3SourcePatch(sam3Node, {
                sourcePatch: {
                    agent_video_mask_workflow: agentWorkflow
                }
            }));
            const workflowNodes = canvasAgentManualMaskWorkflowNodes(currentPreset, currentResult, sam3Node);
            const group = createCanvasAgentWorkflowGroup(workflowNodes, agentWorkflow.group_title_base);
            if (group) {
                Object.assign(sam3Node, buildSam3SourcePatch(sam3Node, {
                    sourcePatch: {
                        agent_video_mask_workflow: Object.assign({}, agentWorkflow, {
                            group_id: group.id
                        })
                    }
                }));
                fitCanvasAgentWorkflowGroup(group, workflowNodes, 48);
            }
            setCanvasAgentSelection(sam3Node.id, [sam3Node.id], null, { clearGroup: true });
            mutate({ inspector: true });
            centerCanvasAgentWorkflow(workflowNodes);
            if (opts.openEditor !== false) {
                schedule(() => {
                    const currentSam3 = getNode(sam3Node.id);
                    if (currentSam3) openSam3PointEditor(currentSam3);
                }, 80);
            }
            setCanvasAgentMessage(t('{tool} workflow is grouped. Generate or upload the SAM3 mask to auto-run the reserved result.', '{tool} 工作流已分组。生成或上传 SAM3 蒙版后将自动运行预留结果。').replace('{tool}', spec?.label || t('Video quick tool', '视频快捷工具')));
            return { group, sam3Node, resultNode: currentResult };
        }

        async function handleCanvasAgentSam3VideoMaskReady(sam3Node, response, details) {
            const currentSam3 = getNode(sam3Node?.id) || sam3Node;
            const workflow = currentSam3?.source?.agent_video_mask_workflow;
            if (!workflow || workflow.auto_run === false) return null;
            const currentPreset = getNode(workflow.preset_node_id);
            const currentResult = getNode(workflow.result_node_id) || findCanvasAgentReservedResultNodeForPreset(currentPreset);
            if (!currentPreset || !currentResult) {
                setCanvasAgentMessage(t('SAM3 mask is ready, but the reserved Agent workflow is incomplete.', 'SAM3 蒙版已完成，但预留的 Agent 工作流不完整。'));
                return { ok: false, error: 'reserved Agent workflow is incomplete' };
            }
            if (!currentSam3?.asset) {
                setCanvasAgentMessage(t('SAM3 mask is not ready yet. Generate or upload a mask before running the preset.', 'SAM3 蒙版尚未就绪。请先生成或上传蒙版再运行 preset。'));
                return { ok: false, error: 'SAM3 mask asset is missing' };
            }
            const maskSlot = workflow.mask_slot || getVideoMaskUploadSlot(currentPreset);
            if (!maskSlot) {
                setCanvasAgentMessage(t('SAM3 mask is ready, but the target preset has no mask video slot.', 'SAM3 蒙版已完成，但目标 preset 没有视频蒙版槽。'));
                return { ok: false, error: 'mask video slot is unavailable' };
            }
            const sourceNode = getNode(workflow.source_node_id);
            const sourceVideoSlot = workflow.source_video_slot || getVideoSourceUploadSlot(currentPreset, sourceNode);
            if (sourceNode && sourceVideoSlot && currentPreset.upload_slots?.[sourceVideoSlot] !== sourceNode.id) {
                createUploadEdge(sourceNode.id, currentPreset.id, sourceVideoSlot, { silent: true });
            }
            createUploadEdge(currentSam3.id, currentPreset.id, maskSlot, { silent: true });
            if (currentPreset.upload_slots?.[maskSlot] !== currentSam3.id) {
                setCanvasAgentMessage(t('SAM3 mask is ready, but Agent could not connect it to the preset mask slot.', 'SAM3 蒙版已完成，但 Agent 未能把它连接到 preset 蒙版槽。'));
                return { ok: false, error: 'mask video slot connection failed' };
            }
            const maskSignature = canvasAgentSam3WorkflowMaskSignature(currentSam3, response, details);
            if (workflow.last_mask_signature === maskSignature && ['starting', 'running', 'submitted'].includes(String(workflow.last_auto_run_state || ''))) {
                setCanvasAgentMessage(t('SAM3 mask is already submitting. Focusing the reserved result.', 'SAM3 蒙版已在提交中，已定位到预留结果。'));
                setCanvasAgentSelection(currentResult.id, [currentResult.id]);
                renderNodes();
                renderEdges();
                return { ok: false, error: 'auto-run already submitting' };
            }
            const activeResult = findActiveResultNodeForPreset(currentPreset);
            if (isCanvasRunActiveState(nodeStatusState(currentPreset)) || activeResult || getPendingPresetRuns().has(currentPreset.id)) {
                const focusNode = activeResult || currentResult || currentPreset;
                setCanvasAgentSam3WorkflowState(currentSam3, {
                    mask_slot: maskSlot,
                    source_video_slot: sourceVideoSlot || workflow.source_video_slot || '',
                    last_mask_ready_at: nowIso(),
                    last_mask_origin: details?.origin || currentSam3.source?.mask_origin || '',
                    last_mask_signature: maskSignature,
                    last_auto_run_state: 'active_run_exists',
                    last_auto_run_error: ''
                }, t('Run active', '运行中'));
                setCanvasAgentSelection(focusNode.id, [focusNode.id]);
                const rect = getNodeRect(focusNode);
                if (rect) centerViewportOnWorld(rect.x + rect.w / 2, rect.y + rect.h / 2);
                renderNodes();
                renderEdges();
                setCanvasAgentMessage(t('{tool} already has an active run. Focusing the current result.', '{tool} 已有运行中的任务，已定位到当前结果。').replace('{tool}', workflow.tool_label || t('Video quick tool', '视频快捷工具')));
                return { ok: false, error: 'run already active' };
            }
            const autoRunToken = uid('agent_video_mask_run');
            const nextWorkflow = setCanvasAgentSam3WorkflowState(currentSam3, {
                mask_slot: maskSlot,
                source_video_slot: sourceVideoSlot || workflow.source_video_slot || '',
                last_mask_ready_at: nowIso(),
                last_mask_origin: details?.origin || currentSam3.source?.mask_origin || '',
                last_mask_signature: maskSignature,
                last_auto_run_token: autoRunToken,
                last_auto_run_state: 'starting',
                last_auto_run_error: ''
            }, t('Mask ready', '蒙版就绪'));
            Object.assign(currentResult, buildResultSourcePatch(currentResult, {
                agent_video_mask_workflow: {
                    sam3_node_id: currentSam3.id,
                    preset_node_id: currentPreset.id,
                    group_id: nextWorkflow?.group_id || workflow.group_id || '',
                    last_auto_run_token: autoRunToken
                }
            }));
            const workflowNodes = canvasAgentSam3WorkflowNodes(workflow, currentSam3, currentPreset, currentResult);
            fitCanvasAgentWorkflowGroup(nextWorkflow?.group_id || workflow.group_id, workflowNodes, 48);
            setCanvasAgentSelection(currentPreset.id, [currentPreset.id]);
            mutate({ inspector: true });
            setCanvasAgentRunInfo({
                token: uid('agent_run'),
                stage: t('Submitting video mask quick tool', '提交视频蒙版快捷工具'),
                preset: currentPreset.title || currentPreset.preset?.display_name || currentPreset.preset?.name || '',
                model: t('Direct prompt', '直接提示词')
            });
            setCanvasAgentMessage(t('{tool} mask is ready. Auto-running the reserved result.', '{tool} 蒙版已就绪，正在自动运行预留结果。').replace('{tool}', workflow.tool_label || t('Video quick tool', '视频快捷工具')));
            try {
                setCanvasAgentSam3WorkflowState(currentSam3, { last_auto_run_state: 'running', last_auto_run_token: autoRunToken }, t('Running', '运行中'));
                const runResponse = await runPresetNode(currentPreset, {
                    resultNode: currentResult,
                    reuseExistingResult: true
                });
                const ok = runResponse?.ok === true || (runResponse?.ok !== false && runResponse?.state !== 'failed' && runResponse?.state !== 'canceled' && runResponse?.state !== 'skipped');
                const finalState = ok && runResponse?.state === 'finished' ? 'finished' : (ok ? 'submitted' : 'failed');
                setCanvasAgentSam3WorkflowState(currentSam3, {
                    last_auto_run_state: finalState,
                    last_auto_run_error: ok ? '' : (runResponse?.details || runResponse?.error || 'preset run failed')
                }, finalState === 'finished' ? t('Finished', '已完成') : (ok ? t('Submitted', '已提交') : t('Run failed', '运行失败')));
                fitCanvasAgentWorkflowGroup(nextWorkflow?.group_id || workflow.group_id, canvasAgentSam3WorkflowNodes(workflow, currentSam3, currentPreset, getNode(currentResult.id) || currentResult), 48);
                return runResponse;
            } catch (err) {
                console.warn('[SimpAI Canvas] Agent SAM3 video mask auto-run failed', err);
                showToast(`Video mask quick tool run failed: ${err?.message || err || 'unknown error'}`);
                setCanvasAgentSam3WorkflowState(currentSam3, {
                    last_auto_run_state: 'failed',
                    last_auto_run_error: err?.message || String(err || 'unknown error')
                }, t('Run failed', '运行失败'));
                setCanvasAgentMessage(t('SAM3 mask is connected, but the preset run failed. The reserved workflow is still available for manual retry.', 'SAM3 蒙版已连接，但 preset 运行失败。预留工作流仍可手动重试。'));
                return { ok: false, error: err?.message || String(err || 'unknown error') };
            } finally {
                clearCanvasAgentRunInfo(1800);
            }
        }

        function handleCanvasAgentWorkflowNodeDeletion(idSet) {
            if (!idSet || !idSet.size) return;
            const project = getProject();
            (Array.isArray(project.nodes) ? project.nodes : []).forEach((node) => {
                const workflow = node?.source?.agent_video_mask_workflow;
                if (!workflow) return;
                const isSam3Node = node.type === 'sam3_video_mask';
                const isResultNode = node.type === 'result';
                if (!isSam3Node && !isResultNode) return;
                const removedSam3 = isSam3Node
                    ? idSet.has(node.id)
                    : idSet.has(workflow.sam3_node_id);
                const removedSource = isSam3Node && idSet.has(workflow.source_node_id);
                const removedPreset = idSet.has(workflow.preset_node_id);
                const removedResult = isSam3Node && idSet.has(workflow.result_node_id);
                if (!removedSam3 && !removedSource && !removedPreset && !removedResult) return;
                if (removedSam3) {
                    const nextWorkflow = Object.assign({}, workflow, {
                        auto_run: false,
                        last_auto_run_state: 'sam3_removed',
                        last_auto_run_error: 'SAM3 Video Mask node was deleted.'
                    });
                    if (isSam3Node) {
                        Object.assign(node, buildSam3SourcePatch(node, {
                            sourcePatch: { agent_video_mask_workflow: nextWorkflow }
                        }));
                    } else if (isResultNode && !idSet.has(node.id)) {
                        Object.assign(node, buildResultSourcePatch(node, {
                            agent_video_mask_workflow: nextWorkflow
                        }));
                    }
                    if (workflow.group_id) {
                        const group = getGroup(workflow.group_id);
                        if (group) Object.assign(group, buildGroupFieldPatch(group, 'title', canvasAgentSam3WorkflowTitle(nextWorkflow, t('SAM3 removed', 'SAM3 已删除'))));
                    }
                } else if (removedPreset || removedResult) {
                    const nextWorkflow = Object.assign({}, workflow, {
                        auto_run: false,
                        last_auto_run_state: removedPreset ? 'preset_removed' : 'result_removed',
                        last_auto_run_error: removedPreset ? 'Target preset was deleted.' : 'Reserved result was deleted.'
                    });
                    if (isSam3Node) {
                        Object.assign(node, buildSam3SourcePatch(node, {
                            sourcePatch: { agent_video_mask_workflow: nextWorkflow }
                        }));
                    } else if (isResultNode && !idSet.has(node.id)) {
                        Object.assign(node, buildResultSourcePatch(node, {
                            agent_video_mask_workflow: nextWorkflow
                        }));
                    }
                    if (workflow.group_id) {
                        const group = getGroup(workflow.group_id);
                        if (group) {
                            Object.assign(group, buildGroupFieldPatch(group, 'title', canvasAgentSam3WorkflowTitle(nextWorkflow, removedPreset ? t('Preset removed', 'Preset 已删除') : t('Result removed', '结果已删除'))));
                        }
                    }
                } else if (removedSource) {
                    Object.assign(node, buildSam3SourcePatch(node, {
                        inputNodeId: null,
                        sourcePatch: {
                            agent_video_mask_workflow: Object.assign({}, workflow, {
                                auto_run: false,
                                source_node_id: '',
                                last_auto_run_state: 'source_removed',
                                last_auto_run_error: 'Source video was deleted.'
                            })
                        }
                    }));
                    Object.assign(node, buildSam3StatePatch(node, {
                        status: mergeCanvasRunStatus(node.status, 'idle', 'Source video removed; reconnect a video before continuing.')
                    }));
                    if (workflow.group_id) {
                        const group = getGroup(workflow.group_id);
                        if (group) Object.assign(group, buildGroupFieldPatch(group, 'title', canvasAgentSam3WorkflowTitle(node.source.agent_video_mask_workflow, t('Source removed', '源视频已删除'))));
                    }
                }
            });
            renderGroups();
        }

        function handleCanvasAgentWorkflowEdgeDeletion(edge) {
            if (!edge) return;
            if (edge.type === 'upload') {
                const preset = getNode(edge.to);
                const sam3 = getNode(edge.from);
                const workflow = sam3?.source?.agent_video_mask_workflow;
                if (preset && sam3?.type === 'sam3_video_mask' && workflow?.preset_node_id === preset.id && workflow.mask_slot === edge.slot) {
                    setCanvasAgentSam3WorkflowState(sam3, {
                        auto_run: false,
                        last_auto_run_state: 'mask_disconnected',
                        last_auto_run_error: 'Mask upload edge was disconnected.'
                    }, t('Mask disconnected', '蒙版已断开'));
                    setCanvasAgentMessage(t('SAM3 mask was disconnected from the preset. Reconnect or regenerate/upload a mask before running.', 'SAM3 蒙版已从 preset 断开。请重新连接或重新生成/上传蒙版后再运行。'));
                }
                if (preset && workflow?.preset_node_id === preset.id && workflow.source_video_slot === edge.slot) {
                    setCanvasAgentSam3WorkflowState(sam3, {
                        auto_run: false,
                        last_auto_run_state: 'source_disconnected',
                        last_auto_run_error: 'Source video upload edge was disconnected.'
                    }, t('Source disconnected', '源视频已断开'));
                }
            }
            if (edge.type === 'media') {
                const sam3 = getNode(edge.to);
                const workflow = sam3?.source?.agent_video_mask_workflow;
                if (sam3?.type === 'sam3_video_mask' && workflow?.source_node_id === edge.from) {
                    setCanvasAgentSam3WorkflowState(sam3, {
                        auto_run: false,
                        source_node_id: '',
                        last_auto_run_state: 'source_disconnected',
                        last_auto_run_error: 'SAM3 source video edge was disconnected.'
                    }, t('Source disconnected', '源视频已断开'));
                    setCanvasAgentMessage(t('SAM3 source video was disconnected. Reconnect a video before generating a mask.', 'SAM3 源视频已断开。请重新连接视频后再生成蒙版。'));
                }
            }
        }

        function handleCanvasAgentSam3VideoMaskEditorClosed(sam3Node) {
            const currentSam3 = getNode(sam3Node?.id) || sam3Node;
            const workflow = currentSam3?.source?.agent_video_mask_workflow;
            if (!workflow || currentSam3?.asset) return;
            setCanvasAgentMessage(t('SAM3 editor closed. Generate or upload a video mask to auto-run the reserved result.', 'SAM3 编辑器已关闭。生成或上传视频蒙版后会自动运行预留结果。'));
        }

        function handleCanvasAgentSam3VideoMaskState(sam3Node, state, response, details) {
            const currentSam3 = getNode(sam3Node?.id) || sam3Node;
            const workflow = currentSam3?.source?.agent_video_mask_workflow;
            if (!workflow) return;
            const stateKey = String(state || '').toLowerCase();
            const message = response?.details || response?.error || response?.message || '';
            if (stateKey === 'cancelled' || stateKey === 'canceled') {
                setCanvasAgentSam3WorkflowState(currentSam3, {
                    last_auto_run_state: 'mask_cancelled',
                    last_auto_run_error: message || 'SAM3 mask generation cancelled'
                }, t('Mask cancelled', '蒙版已取消'));
                setCanvasAgentMessage(t('SAM3 mask generation was cancelled. Generate or upload a mask to continue the reserved workflow.', 'SAM3 蒙版生成已取消。生成或上传蒙版后可继续预留工作流。'));
                scheduleSave();
                return;
            }
            if (stateKey === 'failed') {
                setCanvasAgentSam3WorkflowState(currentSam3, {
                    last_auto_run_state: details?.origin === 'upload' ? 'mask_upload_failed' : 'mask_failed',
                    last_auto_run_error: message || 'SAM3 mask generation failed'
                }, t('Mask failed', '蒙版失败'));
                setCanvasAgentMessage(t('SAM3 mask failed. The Agent workflow is preserved; generate or upload another mask to retry.', 'SAM3 蒙版失败。Agent 工作流已保留；生成或上传新的蒙版即可重试。'));
                scheduleSave();
            }
        }

        return {
            canvasAgentManualMaskWorkflowNodes,
            canvasAgentSam3WorkflowNodes,
            canvasAgentSam3WorkflowTitle,
            setCanvasAgentSam3WorkflowState,
            canvasAgentSam3WorkflowMaskSignature,
            findCanvasAgentSam3WorkflowForPreset,
            canvasAgentResultForPresetRun,
            handleCanvasAgentSam3VideoMaskEditorClosed,
            handleCanvasAgentSam3VideoMaskState,
            prepareCanvasAgentVideoMaskWorkflow,
            handleCanvasAgentSam3VideoMaskReady,
            handleCanvasAgentWorkflowNodeDeletion,
            handleCanvasAgentWorkflowEdgeDeletion
        };
    }

    window.SimpAICanvasWorkbenchAgentSam3Workflow = Object.assign(
        {},
        window.SimpAICanvasWorkbenchAgentSam3Workflow || {},
        { createCanvasAgentSam3WorkflowController }
    );
})();
