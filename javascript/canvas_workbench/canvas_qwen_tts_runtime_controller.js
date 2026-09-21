(function () {
    'use strict';

    function createCanvasQwenTtsRuntimeController(context) {
        const scope = context?.qwenTtsRuntimeSource || context || {};
        const projectSource = scope.projectSource || {};
        const nodeSource = scope.nodeSource || {};
        const assetSource = scope.assetSource || {};
        const fingerprintSource = scope.fingerprintSource || {};
        const schedulerSource = scope.schedulerSource || {};
        const renderSource = scope.renderSource || {};
        const resultSource = scope.resultSource || {};
        const patchSource = scope.patchSource || {};
        const selectionSource = scope.selectionSource || {};
        const layoutSource = scope.layoutSource || {};
        const workflowSource = scope.workflowSource || {};
        const requestSource = scope.requestSource || {};
        const pollingSource = scope.pollingSource || {};
        const historySource = scope.historySource || {};
        const timingSource = scope.timingSource || {};
        const languageSource = scope.languageSource || {};
        const uiSource = scope.uiSource || {};
        const utilitySource = scope.utilitySource || {};

        const call = (sourceObject, name, fallback, ...args) => typeof sourceObject?.[name] === 'function'
            ? sourceObject[name](...args)
            : fallback;
        const getProject = () => call(projectSource, 'getProject', {}) || {};
        const getNode = (id) => call(nodeSource, 'getNode', null, id);
        const applyProjectPatch = (patch) => {
            const project = getProject();
            if (typeof projectSource.applyProjectPatch === 'function') return projectSource.applyProjectPatch(patch);
            return Object.assign(project, patch || {});
        };
        const isQwenTtsNode = (node) => !!call(nodeSource, 'isQwenTtsNode', false, node);
        const qwenTtsNodeMode = (node) => call(nodeSource, 'qwenTtsNodeMode', 'voice_design', node);
        const qwenTtsAudioInputSlots = (node) => call(nodeSource, 'qwenTtsAudioInputSlots', [], node) || [];
        const isQwenTtsAudioSource = (node) => !!call(nodeSource, 'isQwenTtsAudioSource', false, node);
        const isNodeIgnored = (node) => !!call(nodeSource, 'isNodeIgnored', false, node);
        const nodeStatusState = (node) => call(nodeSource, 'nodeStatusState', '', node);
        const isResultRefreshing = (node) => !!call(nodeSource, 'isResultRefreshing', false, node);
        const isCanvasRunActiveState = (state) => !!call(nodeSource, 'isCanvasRunActiveState', false, state);
        const resultNodeRunSortScore = (node) => Number(call(resultSource, 'resultNodeRunSortScore', 0, node)) || 0;
        const getMediaAssetForRun = (node, options) => call(
            assetSource,
            options?.fingerprint ? 'serializeAssetSourceForFingerprint' : 'serializeAssetSourceForRun',
            null,
            node
        );
        const normalizeRunEdgesForFingerprint = (...args) => call(fingerprintSource, 'normalizeRunEdgesForFingerprint', [], ...args);
        const cloneRunValue = (value, fallback) => call(fingerprintSource, 'cloneRunValue', fallback, value, fallback);
        const stableHash = (value) => call(fingerprintSource, 'stableHash', '', value);
        const schedulerBuildPlan = typeof schedulerSource.buildPlan === 'function'
            ? (...args) => schedulerSource.buildPlan(...args)
            : null;
        const refreshResultStaleFlags = (...args) => call(schedulerSource, 'refreshResultStaleFlags', false, ...args);
        const refreshingSourceIdsFromPlan = (...args) => call(schedulerSource, 'refreshingSourceIdsFromPlan', [], ...args) || [];
        const setBlockedSchedulerFromPlan = (...args) => call(schedulerSource, 'setBlockedSchedulerFromPlan', undefined, ...args);
        const waitForRefreshingSources = (...args) => call(
            schedulerSource,
            'waitForRefreshingSources',
            Promise.resolve(false),
            ...args
        );
        const clearSchedulerBlockedState = (...args) => call(schedulerSource, 'clearSchedulerBlockedState', undefined, ...args);
        const renderNodes = (...args) => call(renderSource, 'renderNodes', undefined, ...args);
        const renderEdges = (...args) => call(renderSource, 'renderEdges', undefined, ...args);
        const mutate = (...args) => call(renderSource, 'mutate', undefined, ...args);
        const scheduleSave = (...args) => call(renderSource, 'scheduleSave', undefined, ...args);
        const pollUpdate = (...args) => call(renderSource, 'pollUpdate', undefined, ...args);
        const buildQueuedResultNode = (...args) => call(resultSource, 'buildQueuedResultNode', null, ...args);
        const buildResultRunMetadataPatch = (...args) => call(resultSource, 'buildResultRunMetadataPatch', {}, ...args);
        const buildResultStatusPatch = (...args) => call(resultSource, 'buildResultStatusPatch', {}, ...args);
        const buildResultAssetPatch = (...args) => call(resultSource, 'buildResultAssetPatch', {}, ...args);
        const buildResultOutputPatch = (...args) => call(resultSource, 'buildResultOutputPatch', {}, ...args);
        const buildResultPreviewPatch = (...args) => call(resultSource, 'buildResultPreviewPatch', {}, ...args);
        const buildResultRefreshPreparingPatch = (...args) => call(resultSource, 'buildResultRefreshPreparingPatch', {}, ...args);
        const buildResultRefreshFailurePatch = (...args) => call(resultSource, 'buildResultRefreshFailurePatch', {}, ...args);
        const isTerminalRunState = (state) => !!call(resultSource, 'isTerminalRunState', false, state);
        const syncCanvasProjectAssetRootFromAsset = (...args) => call(resultSource, 'syncCanvasProjectAssetRootFromAsset', undefined, ...args);
        const syncCanvasProjectAssetRootFromAssets = (...args) => call(resultSource, 'syncCanvasProjectAssetRootFromAssets', undefined, ...args);
        const buildQwenTtsStatePatch = (...args) => call(patchSource, 'buildQwenTtsStatePatch', {}, ...args);
        const buildQwenTtsRunResponsePatch = (...args) => call(patchSource, 'buildQwenTtsRunResponsePatch', {}, ...args);
        const buildResultRefreshPreparingPatchFromFactory = (...args) => call(patchSource, 'buildResultRefreshPreparingPatch', {}, ...args);
        const buildProjectNodeAppendPatch = (...args) => call(patchSource, 'buildProjectNodeAppendPatch', {}, ...args);
        const buildProjectRunAppendPatch = (...args) => call(patchSource, 'buildProjectRunAppendPatch', {}, ...args);
        const buildQwenTtsRunRecord = (...args) => call(patchSource, 'buildQwenTtsRunRecord', {}, ...args);
        const buildCanvasRunStatus = (...args) => call(patchSource, 'buildCanvasRunStatus', {}, ...args);
        const mergeCanvasRunStatus = (...args) => call(patchSource, 'mergeCanvasRunStatus', {}, ...args);
        const buildResultLayoutPatch = (...args) => call(patchSource, 'buildResultLayoutPatch', {}, ...args);
        const applyNodeLayoutPatch = (...args) => call(layoutSource, 'applyNodeLayoutPatch', undefined, ...args);
        const getNodeRect = (...args) => call(layoutSource, 'getNodeRect', null, ...args);
        const centerViewportOnWorld = (...args) => call(layoutSource, 'centerViewportOnWorld', undefined, ...args);
        const setSelection = (...args) => call(selectionSource, 'setSelection', undefined, ...args);
        const ensureGenerateEdge = (...args) => call(workflowSource, 'ensureGenerateEdge', undefined, ...args);
        const dockCanvasAgentPanelBottomLeft = (...args) => call(workflowSource, 'dockCanvasAgentPanelBottomLeft', undefined, ...args);
        const createCanvasAgentWorkflowGroup = (...args) => call(workflowSource, 'createCanvasAgentWorkflowGroup', undefined, ...args);
        const sendCanvasQwenTtsRunRequest = (...args) => call(
            requestSource,
            'sendCanvasQwenTtsRunRequest',
            Promise.resolve({ ok: false, error: 'Qwen TTS API unavailable' }),
            ...args
        );
        const sendCanvasQwenTtsPollRequest = (...args) => call(
            requestSource,
            'sendCanvasQwenTtsPollRequest',
            Promise.resolve({ ok: false, error: 'Qwen TTS poll API unavailable', state: 'failed' }),
            ...args
        );
        const sendCanvasQwenTtsControlRequest = (...args) => call(
            requestSource,
            'sendCanvasQwenTtsControlRequest',
            Promise.resolve({ ok: false, error: 'Qwen TTS control API unavailable' }),
            ...args
        );
        const pollRunWithController = (...args) => call(
            pollingSource,
            'pollRunWithController',
            Promise.resolve({ ok: false, error: 'run polling controller unavailable' }),
            ...args
        );
        const pushHistory = (...args) => call(historySource, 'pushHistory', undefined, ...args);
        const nowIso = (...args) => call(timingSource, 'nowIso', '', ...args);
        const uid = (...args) => call(timingSource, 'uid', '', ...args);
        const t = (...args) => call(languageSource, 't', args[1] || args[0] || '', ...args);
        const showToast = (...args) => call(uiSource, 'showToast', undefined, ...args);
        const clamp = (value, min, max) => call(
            utilitySource,
            'clamp',
            Math.max(min, Math.min(max, value)),
            value,
            min,
            max
        );
        const getWorkbenchUserContext = (...args) => call(projectSource, 'getWorkbenchUserContext', {}, ...args);
        const pendingQwenTtsRuns = new Set();

        function qwenTtsResultBasePosition(node) {
            return {
                x: Math.round((node?.x || 0) + (node?.w || 360) + 140),
                y: Math.round((node?.y || 0) + 20)
            };
        }

        function generatedResultNodesForQwenTts(qwenNode) {
            if (!qwenNode?.id) return [];
            const project = getProject();
            const edgeTargetIds = new Set((project.edges || [])
                .filter(edge => edge.type === 'generate' && edge.from === qwenNode.id)
                .map(edge => edge.to)
                .filter(Boolean));
            return (project.nodes || [])
                .filter(node => node?.type === 'result' && (node.producer?.qwen_tts_node_id === qwenNode.id || edgeTargetIds.has(node.id)))
                .sort((a, b) => resultNodeRunSortScore(b) - resultNodeRunSortScore(a));
        }

        function findReusableResultNodeForQwenTts(qwenNode) {
            return generatedResultNodesForQwenTts(qwenNode)[0] || null;
        }

        function findActiveResultNodeForQwenTts(qwenNode) {
            return generatedResultNodesForQwenTts(qwenNode).find(result => {
                return isResultRefreshing(result) || isCanvasRunActiveState(nodeStatusState(result));
            }) || null;
        }

        function qwenTtsAudioSourceForSlot(node, slot) {
            if (!node || !slot) return null;
            const project = getProject();
            const edge = (project.edges || []).find(item => item.type === 'media' && item.to === node.id && item.slot === slot);
            const sourceId = node.audio_inputs?.[slot] || edge?.from || '';
            return sourceId ? getNode(sourceId) : null;
        }

        function buildQwenTtsInputAssets(node, options) {
            const opts = options || {};
            const assets = {};
            qwenTtsAudioInputSlots(node).forEach((slot) => {
                const source = qwenTtsAudioSourceForSlot(node, slot.key);
                if (!source) return;
                const serialized = getMediaAssetForRun(source, opts);
                if (serialized) assets[slot.key] = serialized;
            });
            return assets;
        }

        function qwenTtsInputEdgesForFingerprint(node) {
            if (!node?.id) return [];
            const project = getProject();
            return normalizeRunEdgesForFingerprint((project.edges || []).filter(edge => edge.type === 'media' && edge.to === node.id));
        }

        function buildQwenTtsRunFingerprintPayload(node) {
            if (!isQwenTtsNode(node)) return null;
            return {
                qwen_tts_node: {
                    type: node.type,
                    mode: qwenTtsNodeMode(node),
                    params: cloneRunValue(node.params || {}, {})
                },
                media_edges: qwenTtsInputEdgesForFingerprint(node),
                input_assets: buildQwenTtsInputAssets(node, { fingerprint: true })
            };
        }

        function computeQwenTtsRunFingerprint(node) {
            const payload = buildQwenTtsRunFingerprintPayload(node);
            return payload ? stableHash(payload) : '';
        }

        function validateQwenTtsNodeForRun(node) {
            if (!isQwenTtsNode(node)) return ['Qwen TTS node is unavailable'];
            const mode = qwenTtsNodeMode(node);
            const params = node.params || {};
            const missing = [];
            if (mode === 'voice_design') {
                if (!String(params.text || '').trim()) missing.push('text to speech');
            } else if (mode === 'custom_voice') {
                if (!String(params.text || '').trim()) missing.push('text to speech');
                if (!String(params.speaker || params.custom_speaker_name || '').trim()) missing.push('speaker');
            } else if (mode === 'voice_clone') {
                const source = qwenTtsAudioSourceForSlot(node, 'ref_audio');
                if (!source || !isQwenTtsAudioSource(source)) missing.push('reference audio');
                if (!String(params.target_text || '').trim()) missing.push('target text');
            } else if (mode === 'dialogue') {
                if (!String(params.script || '').trim()) missing.push('script');
                const project = getProject();
                qwenTtsAudioInputSlots(node).forEach((slot) => {
                    const edge = (project.edges || []).find(item => item.type === 'media' && item.to === node.id && item.slot === slot.key);
                    if (!edge && !node.audio_inputs?.[slot.key]) return;
                    const source = qwenTtsAudioSourceForSlot(node, slot.key);
                    if (!source || !isQwenTtsAudioSource(source)) missing.push(slot.label || slot.key);
                });
            }
            return missing;
        }

        async function preflightDirectQwenTtsRun(node, options) {
            if (options?.skipInputPreflight || !isQwenTtsNode(node)) return { ok: true };
            if (typeof schedulerBuildPlan !== 'function') {
                const missing = validateQwenTtsNodeForRun(node);
                if (missing.length) {
                    const error = `missing ${missing.join(', ')}`;
                    showToast(`Qwen TTS blocked: ${error}`);
                    Object.assign(node, buildQwenTtsStatePatch(node, {
                        status: mergeCanvasRunStatus(node.status, 'blocked', error)
                    }));
                    mutate({ inspector: true });
                    return { ok: false, error };
                }
                return { ok: true };
            }
            if (refreshResultStaleFlags()) {
                renderNodes();
                renderEdges();
                scheduleSave();
            }
            const plan = schedulerBuildPlan(getProject(), { mode: 'selected', nodeIds: [node.id] });
            if (Array.isArray(plan?.cycles) && plan.cycles.length) {
                const error = plan.warnings?.find(item => String(item || '').includes('Cycle detected')) || 'Cycle detected in run plan.';
                setBlockedSchedulerFromPlan(plan, { message: error, durationMs: 3600 });
                return { ok: false, error, plan };
            }
            const missing = Array.isArray(plan?.steps)
                ? plan.steps.filter(step => Array.isArray(step.missing_inputs) && step.missing_inputs.length)
                : [];
            const refreshingIds = refreshingSourceIdsFromPlan(plan);
            if (refreshingIds.length && !options?.skipRefreshingWait) {
                const waited = await waitForRefreshingSources(refreshingIds, { waitingNodeId: node.id });
                if (!waited) {
                    setBlockedSchedulerFromPlan(plan, { message: t('Timed out waiting for upstream Result refresh.', '等待上游 Result 刷新超时。') });
                    return { ok: false, error: 'upstream refresh timeout', plan };
                }
                return preflightDirectQwenTtsRun(node, Object.assign({}, options || {}, { skipRefreshingWait: true }));
            }
            if (missing.length) {
                setBlockedSchedulerFromPlan(plan);
                return { ok: false, error: 'missing inputs', plan };
            }
            return { ok: true, plan };
        }

        function buildQwenTtsRunPayload(node, resultNode, runId) {
            const project = getProject();
            return {
                mode: qwenTtsNodeMode(node),
                params: cloneRunValue(node.params || {}, {}),
                input_assets: buildQwenTtsInputAssets(node),
                project_id: project.id || call(projectSource, 'getProjectId', ''),
                placeholder_node_id: resultNode?.id || '',
                qwen_tts_node_id: node?.id || '',
                node_id: node?.id || '',
                run_id: runId,
                user_context: getWorkbenchUserContext()
            };
        }

        function applyQwenTtsRunStatus(runId, resultNodeId, qwenNodeId, response) {
            const resultNode = getNode(resultNodeId);
            const qwenNode = getNode(qwenNodeId);
            const project = getProject();
            const run = (project.runs || []).find(item => item.id === runId);
            const ok = !!(response && response.ok);
            const state = response?.state || (ok && (response?.asset || (Array.isArray(response?.assets) && response.assets.length)) ? 'finished' : (ok ? 'queued' : 'failed'));
            if (run) Object.assign(run, buildQwenTtsRunResponsePatch(run, response));
            const currentResultRunId = resultNode?.producer?.run_id || '';
            const responseTargetsCurrentResult = !currentResultRunId || currentResultRunId === runId;
            if (resultNode && responseTargetsCurrentResult) {
                Object.assign(resultNode, buildResultRunMetadataPatch(resultNode, {
                    response,
                    ok,
                    runId,
                    producerPatch: {
                        qwen_tts_node_id: qwenNodeId,
                        preset_node_id: null,
                        timeline_node_id: null
                    }
                }));
                Object.assign(resultNode, buildResultStatusPatch(resultNode, {
                    status: mergeCanvasRunStatus(
                        resultNode.status,
                        state,
                        ok ? (response?.message || state) : `Qwen TTS failed: ${response?.error || 'unknown error'}`,
                        {
                            queuePosition: response?.queue_size ?? null,
                            percent: clamp(Number(response?.percent || 0), 0, 1)
                        }
                    )
                }));
                if (response?.asset) {
                    const completedFingerprint = resultNode.producer?.pending_fingerprint
                        || resultNode.source?.pending_fingerprint
                        || resultNode.producer?.fingerprint
                        || resultNode.source?.input_fingerprint
                        || '';
                    clearSchedulerBlockedState();
                    const asset = cloneRunValue(response.asset, null);
                    const assets = Array.isArray(response.assets) && response.assets.length
                        ? cloneRunValue(response.assets, [])
                        : [cloneRunValue(response.asset, {})];
                    Object.assign(resultNode, buildResultAssetPatch(resultNode, {
                        asset,
                        assets,
                        selectedAssetIndex: 0
                    }));
                    syncCanvasProjectAssetRootFromAsset(resultNode.asset);
                    syncCanvasProjectAssetRootFromAssets(resultNode.assets);
                    Object.assign(resultNode, buildResultOutputPatch(resultNode, {
                        kind: 'qwen_tts_output',
                        outputPath: response.asset.output_path || response.asset.path || '',
                        completedFingerprint,
                        sourcePatch: {
                            qwen_tts_node_id: qwenNodeId,
                            mode: response.mode || qwenTtsNodeMode(qwenNode)
                        }
                    }));
                    Object.assign(resultNode, buildResultPreviewPatch(resultNode, {
                        preview: null,
                        previewFrames: null
                    }));
                }
                if (isTerminalRunState(state) && !response?.asset && resultNode.source?.refreshing) {
                    Object.assign(resultNode, buildResultRefreshFailurePatch(resultNode));
                    Object.assign(resultNode, buildResultPreviewPatch(resultNode, {
                        preview: null,
                        previewFrames: null
                    }));
                }
            }
            if (qwenNode) {
                Object.assign(qwenNode, buildQwenTtsStatePatch(qwenNode, {
                    runPatch: {
                        run_id: runId,
                        task_id: response?.task_id || qwenNode.qwen_tts_run?.task_id || null,
                        result_node_id: resultNodeId,
                        state,
                        updated_at: nowIso()
                    },
                    status: buildCanvasRunStatus(
                        state,
                        ok ? (response?.message || state) : `Qwen TTS failed: ${response?.error || 'unknown error'}`,
                        { percent: clamp(Number(response?.percent || 0), 0, 1) }
                    )
                }));
            }
            if (isTerminalRunState(state)) {
                mutate();
            } else {
                pollUpdate();
                scheduleSave();
            }
        }

        function pollQwenTtsRun(runId, resultNodeId, qwenNodeId, options) {
            const opts = options || {};
            return pollRunWithController(runId, {
                initialDelayMs: opts.initialDelayMs ?? 900,
                intervalMs: opts.intervalMs ?? 1200,
                poll: () => sendCanvasQwenTtsPollRequest(runId),
                onResult: (result) => applyQwenTtsRunStatus(runId, resultNodeId, qwenNodeId, result),
                getState: (result) => result?.state || 'failed',
                onFinished: (result, state) => {
                    showToast('Qwen TTS finished.');
                    return { ok: true, state, result, result_node_id: resultNodeId, qwen_tts_node_id: qwenNodeId };
                },
                onCanceled: (result, state) => {
                    showToast(`Qwen TTS ${state}.`);
                    return { ok: false, state, error: `Qwen TTS ${state}.`, result };
                },
                onFailed: (result, state) => {
                    const error = result?.message || result?.error || 'unknown error';
                    showToast(`Qwen TTS failed: ${error}`);
                    return { ok: false, state, error, result };
                },
                onStopped: (result, state) => ({ ok: false, state, error: 'Qwen TTS stopped polling.', result })
            });
        }

        function applyQwenTtsRunNodeResult(runId, resultNodeId, qwenNodeId, response, options) {
            applyQwenTtsRunStatus(runId, resultNodeId, qwenNodeId, response);
            if (response && response.ok) {
                showToast('Qwen TTS queued.');
                return pollQwenTtsRun(runId, resultNodeId, qwenNodeId, options);
            }
            showToast(`Qwen TTS enqueue failed: ${response?.error || 'unknown error'}`);
            return Promise.resolve({ ok: false, error: response?.error || 'Qwen TTS enqueue failed', response });
        }

        async function runQwenTtsNode(node, options) {
            if (!isQwenTtsNode(node)) return { ok: false, error: 'Qwen TTS node is unavailable' };
            if (isNodeIgnored(node)) {
                showToast('This Qwen TTS node is marked as skipped.');
                return { ok: false, error: 'Qwen TTS node is skipped' };
            }
            const opts = options || {};
            const runKey = node.id || '';
            if (runKey && pendingQwenTtsRuns.has(runKey)) {
                setSelection(node);
                renderNodes();
                renderEdges();
                showToast('This Qwen TTS node is already preparing a run.', 2200);
                return { ok: false, error: 'run already preparing' };
            }
            const activeResult = findActiveResultNodeForQwenTts(node);
            if (isCanvasRunActiveState(nodeStatusState(node)) || activeResult) {
                const focusNode = activeResult || findReusableResultNodeForQwenTts(node) || node;
                setSelection(focusNode);
                const rect = getNodeRect(focusNode);
                centerViewportOnWorld(rect.x + rect.w / 2, rect.y + rect.h / 2);
                renderNodes();
                renderEdges();
                showToast('This Qwen TTS node already has an active run; focusing the current task.', 2600);
                return { ok: false, error: 'run already active' };
            }
            if (runKey) pendingQwenTtsRuns.add(runKey);
            try {
                const preflight = await preflightDirectQwenTtsRun(node, opts);
                if (!preflight.ok) return preflight;
                const existingResultNode = opts.resultNode || (opts.reuseExistingResult ? findReusableResultNodeForQwenTts(node) : null);
                const inputFingerprint = computeQwenTtsRunFingerprint(node);
                const runToken = uid('rt');
                pushHistory('Run Qwen TTS node');
                const runId = uid('qwen_tts_run');
                const basePosition = qwenTtsResultBasePosition(node);
                const resultNode = existingResultNode || buildQueuedResultNode({
                    position: basePosition,
                    size: { w: 240, h: 260 },
                    title: `${node.title || call(nodeSource, 'qwenTtsModeLabel', 'Qwen TTS', qwenTtsNodeMode(node))} Output`,
                    producer: {
                        qwen_tts_node_id: node.id,
                        preset_node_id: null,
                        timeline_node_id: null,
                        run_id: runId,
                        run_token: runToken,
                        task_id: null,
                        fingerprint: inputFingerprint,
                        pending_fingerprint: inputFingerprint,
                        pending_run_token: runToken,
                        refreshing: true,
                        stale: false
                    },
                    message: 'Result placeholder created; submitting to Qwen TTS.',
                    includeAssets: true,
                    source: {
                        kind: 'qwen_tts_placeholder',
                        qwen_tts_node_id: node.id,
                        mode: qwenTtsNodeMode(node),
                        output_path: null,
                        input_fingerprint: inputFingerprint,
                        current_fingerprint: inputFingerprint,
                        pending_fingerprint: inputFingerprint,
                        current_run_token: '',
                        pending_run_token: runToken,
                        refreshing: true,
                        stale: false,
                        stale_reason: ''
                    },
                    collapsed: false
                });
                if (!resultNode) return { ok: false, error: 'result placeholder unavailable' };
                if (existingResultNode) {
                    Object.assign(resultNode, buildResultRefreshPreparingPatchFromFactory(resultNode, {
                        runId,
                        runToken,
                        inputFingerprint,
                        producerPatch: {
                            qwen_tts_node_id: node.id,
                            preset_node_id: null,
                            timeline_node_id: null,
                            task_id: null
                        },
                        sourcePatch: {
                            kind: resultNode.source?.kind || 'qwen_tts_placeholder',
                            qwen_tts_node_id: node.id,
                            mode: qwenTtsNodeMode(node)
                        },
                        errorDetails: null
                    }));
                    Object.assign(resultNode, buildResultStatusPatch(resultNode, {
                        status: buildCanvasRunStatus(
                            'queued',
                            t('Reusing result node; submitting to Qwen TTS.', '正在复用结果节点；提交到 Qwen TTS。'),
                            { queuePosition: null, percent: 0 }
                        )
                    }));
                    Object.assign(resultNode, buildResultPreviewPatch(resultNode, {
                        preview: null,
                        previewFrames: null
                    }));
                } else {
                    applyProjectPatch(buildProjectNodeAppendPatch(getProject(), resultNode));
                }
                ensureGenerateEdge(node.id, resultNode.id);
                if (!existingResultNode && opts.agentWorkflowTitle) {
                    dockCanvasAgentPanelBottomLeft({ render: false });
                    applyNodeLayoutPatch(node, { collapsed: true });
                    Object.assign(resultNode, buildResultLayoutPatch(resultNode, { collapsed: false }));
                    createCanvasAgentWorkflowGroup([node, resultNode], opts.agentWorkflowTitle);
                }
                applyProjectPatch(buildProjectRunAppendPatch(getProject(), buildQwenTtsRunRecord({
                    runId,
                    qwenTtsNodeId: node.id,
                    producerNodeId: node.id,
                    placeholderNodeId: resultNode.id,
                    mode: qwenTtsNodeMode(node),
                    inputFingerprint,
                    runToken
                })));
                Object.assign(node, buildQwenTtsStatePatch(node, {
                    runState: {
                        run_id: runId,
                        result_node_id: resultNode.id,
                        state: 'queued',
                        updated_at: nowIso()
                    },
                    status: buildCanvasRunStatus(
                        'queued',
                        t('Submitting to Qwen TTS.', '正在提交到 Qwen TTS。'),
                        { percent: 0 }
                    )
                }));
                setSelection(resultNode);
                clearSchedulerBlockedState();
                mutate();
                showToast('Result placeholder created; submitting to Qwen TTS.');
                const payload = buildQwenTtsRunPayload(node, resultNode, runId);
                const runResult = await sendCanvasQwenTtsRunRequest(payload);
                return applyQwenTtsRunNodeResult(runId, resultNode.id, node.id, runResult, opts);
            } finally {
                if (runKey) pendingQwenTtsRuns.delete(runKey);
            }
        }

        async function stopQwenTtsNode(node) {
            if (!isQwenTtsNode(node)) return { ok: false, error: 'Qwen TTS node is unavailable' };
            const result = findActiveResultNodeForQwenTts(node);
            const runId = result?.producer?.run_id || node.qwen_tts_run?.run_id || '';
            if (!runId) {
                showToast('This Qwen TTS node has no active run.');
                return { ok: false, error: 'no active run' };
            }
            const response = await sendCanvasQwenTtsControlRequest(runId, 'stop');
            if (result) applyQwenTtsRunStatus(runId, result.id, node.id, response);
            else if (node) {
                Object.assign(node, buildQwenTtsStatePatch(node, {
                    status: mergeCanvasRunStatus(
                        node.status,
                        response?.state || 'cancelling',
                        response?.message || response?.error || t('Stop requested.', '已请求停止。')
                    )
                }));
            }
            showToast(response?.ok ? 'Qwen TTS stop requested.' : `Qwen TTS stop failed: ${response?.error || 'unknown error'}`);
            const state = response?.state || '';
            if (response?.ok && !['finished', 'failed', 'canceled', 'skipped'].includes(state) && result) {
                pollQwenTtsRun(runId, result.id, node.id);
            }
            return response;
        }

        return {
            qwenTtsResultBasePosition,
            generatedResultNodesForQwenTts,
            findReusableResultNodeForQwenTts,
            findActiveResultNodeForQwenTts,
            qwenTtsAudioSourceForSlot,
            buildQwenTtsInputAssets,
            qwenTtsInputEdgesForFingerprint,
            buildQwenTtsRunFingerprintPayload,
            computeQwenTtsRunFingerprint,
            validateQwenTtsNodeForRun,
            preflightDirectQwenTtsRun,
            buildQwenTtsRunPayload,
            applyQwenTtsRunStatus,
            pollQwenTtsRun,
            applyQwenTtsRunNodeResult,
            runQwenTtsNode,
            stopQwenTtsNode
        };
    }

    window.SimpAICanvasWorkbenchQwenTtsRuntime = Object.assign(
        {},
        window.SimpAICanvasWorkbenchQwenTtsRuntime || {},
        { createCanvasQwenTtsRuntimeController }
    );
})();
