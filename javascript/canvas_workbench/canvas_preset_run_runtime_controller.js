(function () {
    'use strict';

    const TERMINAL_STATES = new Set(['finished', 'failed', 'canceled', 'skipped']);

    function createCanvasPresetRunRuntimeController(context) {
        const scope = context?.presetRunRuntimeSource || context || {};
        const projectSource = scope.projectSource || {};
        const nodeSource = scope.nodeSource || {};
        const runSource = scope.runSource || {};
        const resultSource = scope.resultSource || {};
        const stateSource = scope.stateSource || {};
        const assetSource = scope.assetSource || {};
        const directorSource = scope.directorSource || {};
        const lockSource = scope.lockSource || {};
        const preflightSource = scope.preflightSource || {};
        const modelSource = scope.modelSource || {};
        const payloadSource = scope.payloadSource || {};
        const patchSource = scope.patchSource || {};
        const previewSource = scope.previewSource || {};
        const statusSource = scope.statusSource || {};
        const schedulerSource = scope.schedulerSource || {};
        const renderSource = scope.renderSource || {};
        const persistenceSource = scope.persistenceSource || {};
        const layoutSource = scope.layoutSource || {};
        const requestSource = scope.requestSource || {};
        const pollingSource = scope.pollingSource || {};
        const gallerySource = scope.gallerySource || {};
        const selectionSource = scope.selectionSource || {};
        const historySource = scope.historySource || {};
        const fingerprintSource = scope.fingerprintSource || {};
        const workflowSource = scope.workflowSource || {};
        const languageSource = scope.languageSource || {};
        const uiSource = scope.uiSource || {};
        const serializationSource = scope.serializationSource || {};
        const utilitySource = scope.utilitySource || {};
        const identitySource = scope.identitySource || {};
        const timeSource = scope.timeSource || {};

        const call = (sourceObject, name, fallback, ...args) => typeof sourceObject?.[name] === 'function'
            ? sourceObject[name](...args)
            : fallback;
        const getProject = () => call(projectSource, 'getProject', {}) || {};
        const getProjectId = () => call(projectSource, 'getProjectId', getProject().id || '');
        const getWorkbenchUserContext = (...args) => call(
            projectSource,
            'getWorkbenchUserContext',
            {},
            ...args
        );
        const getNode = (id) => call(nodeSource, 'getNode', null, id);
        const isNodeIgnored = (...args) => !!call(nodeSource, 'isNodeIgnored', false, ...args);
        const directorRunContextForPreset = (...args) => call(directorSource, 'directorRunContextForPreset', null, ...args);
        const runDirectorSegmentedPresetNode = (...args) => call(
            directorSource,
            'runDirectorSegmentedPresetNode',
            Promise.resolve({ ok: false, error: 'Director runtime unavailable' }),
            ...args
        );
        const isPendingPresetRun = (...args) => !!call(lockSource, 'isPendingPresetRun', false, ...args);
        const recoverStalePendingPresetRun = (...args) => !!call(lockSource, 'recoverStalePendingPresetRun', false, ...args);
        const markPendingPresetRun = (...args) => call(lockSource, 'markPendingPresetRun', undefined, ...args);
        const clearPendingPresetRun = (...args) => call(lockSource, 'clearPendingPresetRun', undefined, ...args);
        const schedulerBuildPlan = (...args) => call(schedulerSource, 'buildPlan', null, ...args);
        const refreshResultStaleFlags = (...args) => !!call(
            schedulerSource,
            'refreshResultStaleFlags',
            false,
            ...args
        );
        const refreshingSourceIdsFromPlan = (...args) => call(
            schedulerSource,
            'refreshingSourceIdsFromPlan',
            [],
            ...args
        ) || [];
        const setBlockedSchedulerFromPlan = (...args) => call(
            schedulerSource,
            'setBlockedSchedulerFromPlan',
            undefined,
            ...args
        );
        const waitForRefreshingSources = (...args) => call(
            schedulerSource,
            'waitForRefreshingSources',
            Promise.resolve(false),
            ...args
        );
        const checkPresetModelStatus = (...args) => call(
            modelSource,
            'checkPresetModelStatus',
            Promise.resolve({ ok: false, error: 'Preset model check unavailable' }),
            ...args
        );
        const openMainMissingModelListForPreset = (...args) => call(
            modelSource,
            'openMainMissingModelListForPreset',
            undefined,
            ...args
        );
        const canvasAgentResultForPresetRun = (...args) => call(resultSource, 'canvasAgentResultForPresetRun', null, ...args);
        const computePresetRunFingerprint = (...args) => call(fingerprintSource, 'computePresetRunFingerprint', '', ...args);
        const buildCanvasRunResponsePatch = (...args) => call(
            runSource,
            'buildCanvasRunResponsePatch',
            {},
            ...args
        );
        const buildCanvasDryRunPatch = (...args) => call(
            runSource,
            'buildCanvasDryRunPatch',
            {},
            ...args
        );
        const buildDirectorSegmentRunRecord = (...args) => call(
            runSource,
            'buildDirectorSegmentRunRecord',
            {},
            ...args
        );
        const applyDirectorSegmentToPresetPayload = (...args) => call(
            payloadSource,
            'applyDirectorSegmentToPresetPayload',
            args[0],
            ...args
        );
        const getPresetUploadRunEdges = (...args) => call(
            payloadSource,
            'getPresetUploadRunEdges',
            [],
            ...args
        ) || [];
        const applyDirectorTimelineMediaToPresetPayload = (...args) => call(
            payloadSource,
            'applyDirectorTimelineMediaToPresetPayload',
            undefined,
            ...args
        );
        const serializeClassicNodeForRun = (...args) => call(
            payloadSource,
            'serializeClassicNodeForRun',
            null,
            ...args
        );
        const serializePresetForRun = (...args) => call(
            payloadSource,
            'serializePresetForRun',
            null,
            ...args
        );
        const serializeAssetSourceForRun = (...args) => call(
            assetSource,
            'serializeAssetSourceForRun',
            null,
            ...args
        );
        const canvasAgentPromptTargetFromNode = (...args) => call(
            preflightSource,
            'canvasAgentPromptTargetFromNode',
            null,
            ...args
        );
        const canvasRunPromptParamText = (value) => call(
            preflightSource,
            'canvasRunPromptParamText',
            String(value || ''),
            value
        );
        const buildWildcardPreviewForNode = (...args) => call(
            preflightSource,
            'buildWildcardPreviewForNode',
            Promise.resolve({}),
            ...args
        );
        const ensureCanvasAgentPromptPreflightAllows = (...args) => call(
            preflightSource,
            'ensureCanvasAgentPromptPreflightAllows',
            Promise.resolve({ ok: true }),
            ...args
        );
        const getPresetCatalogEntryForNode = (...args) => call(
            preflightSource,
            'getPresetCatalogEntryForNode',
            null,
            ...args
        );
        const canvasAgentPresetPromptDefaults = (...args) => call(
            preflightSource,
            'canvasAgentPresetPromptDefaults',
            {},
            ...args
        );
        const getPromptTextSourceNode = (...args) => call(
            preflightSource,
            'getPromptTextSourceNode',
            null,
            ...args
        );
        const updateNodeParam = (...args) => call(
            preflightSource,
            'updateNodeParam',
            undefined,
            ...args
        );
        const buildResultProducerPatch = (...args) => call(
            patchSource,
            'buildResultProducerPatch',
            {},
            ...args
        );
        const buildResultSourcePatch = (...args) => call(
            patchSource,
            'buildResultSourcePatch',
            {},
            ...args
        );
        const buildProjectRunAppendPatch = (...args) => call(
            patchSource,
            'buildProjectRunAppendPatch',
            {},
            ...args
        );
        const buildProjectNodeAppendPatch = (...args) => call(
            patchSource,
            'buildProjectNodeAppendPatch',
            {},
            ...args
        );
        const buildPresetRunRecord = (...args) => call(
            patchSource,
            'buildPresetRunRecord',
            {},
            ...args
        );
        const directorSegmentUsesPreviousImage = (...args) => !!call(
            directorSource,
            'directorSegmentUsesPreviousImage',
            false,
            ...args
        );
        const directorSegmentUsesPreviousVideo = (...args) => !!call(
            directorSource,
            'directorSegmentUsesPreviousVideo',
            false,
            ...args
        );
        const directorResultAssetSource = (...args) => call(
            directorSource,
            'directorResultAssetSource',
            null,
            ...args
        );
        const directorSegmentPrompt = (...args) => call(
            directorSource,
            'directorSegmentPrompt',
            '',
            ...args
        );
        const buildQueuedResultNode = (...args) => call(resultSource, 'buildQueuedResultNode', null, ...args);
        const buildResultLayoutPatch = (...args) => call(resultSource, 'buildResultLayoutPatch', {}, ...args);
        const presetGenerationStepValue = (...args) => call(nodeSource, 'presetGenerationStepValue', 1, ...args);
        const uid = (prefix) => call(identitySource, 'uid', '', prefix);
        const buildResultRunMetadataPatch = (...args) => call(resultSource, 'buildResultRunMetadataPatch', {}, ...args);
        const buildResultStatusPatch = (...args) => call(resultSource, 'buildResultStatusPatch', {}, ...args);
        const buildResultAssetPatch = (...args) => call(resultSource, 'buildResultAssetPatch', {}, ...args);
        const buildResultOutputPatch = (...args) => call(resultSource, 'buildResultOutputPatch', {}, ...args);
        const buildResultPreviewPatch = (...args) => call(resultSource, 'buildResultPreviewPatch', {}, ...args);
        const buildResultDryRunSourcePatch = (...args) => call(
            resultSource,
            'buildResultDryRunSourcePatch',
            {},
            ...args
        );
        const buildResultRefreshFailurePatch = (...args) => call(
            resultSource,
            'buildResultRefreshFailurePatch',
            {},
            ...args
        );
        const buildResultRefreshReconciledPatch = (...args) => call(
            resultSource,
            'buildResultRefreshReconciledPatch',
            {},
            ...args
        );
        const buildResultRefreshPreparingPatch = (...args) => call(
            resultSource,
            'buildResultRefreshPreparingPatch',
            {},
            ...args
        );
        const buildResultRefreshClearedPatch = (...args) => call(
            resultSource,
            'buildResultRefreshClearedPatch',
            {},
            ...args
        );
        const nodeStatusState = (...args) => call(stateSource, 'nodeStatusState', '', ...args);
        const isResultRefreshing = (...args) => !!call(stateSource, 'isResultRefreshing', false, ...args);
        const isCanvasRunActiveState = (...args) => !!call(stateSource, 'isCanvasRunActiveState', false, ...args);
        const resultNodeHasOutput = (...args) => !!call(stateSource, 'resultNodeHasOutput', false, ...args);
        const getSelectedResultAsset = (...args) => call(assetSource, 'getSelectedResultAsset', null, ...args);
        const isTerminalRunState = (state) => !!call(
            statusSource,
            'isTerminalRunState',
            TERMINAL_STATES.has(String(state || '').toLowerCase()),
            state
        );
        const buildCanvasRunStatus = (...args) => call(statusSource, 'buildCanvasRunStatus', {}, ...args);
        const mergeCanvasRunStatus = (...args) => call(statusSource, 'mergeCanvasRunStatus', {}, ...args);
        const buildCanvasNodeStatusPatch = (...args) => call(
            statusSource,
            'buildCanvasNodeStatusPatch',
            {},
            ...args
        );
        const resultPreviewFreshFrames = (response) => call(
            previewSource,
            'resultPreviewFreshFrames',
            [],
            response
        ) || [];
        const applyResultPreviewStream = (...args) => call(
            previewSource,
            'applyResultPreviewStream',
            undefined,
            ...args
        );
        const appendResultNodePreviewFrames = (...args) => call(
            previewSource,
            'appendResultNodePreviewFrames',
            undefined,
            ...args
        );
        const resultPreviewLastSerial = (resultNodeId) => call(
            previewSource,
            'resultPreviewLastSerial',
            0,
            resultNodeId
        );
        const stopResultPreviewPlayer = (...args) => call(
            previewSource,
            'stopResultPreviewPlayer',
            undefined,
            ...args
        );
        const clearSchedulerBlockedState = (...args) => call(
            schedulerSource,
            'clearSchedulerBlockedState',
            undefined,
            ...args
        );
        const mutate = (...args) => call(renderSource, 'mutate', undefined, ...args);
        const pollUpdate = (...args) => call(renderSource, 'pollUpdate', undefined, ...args);
        const renderAll = (...args) => call(renderSource, 'renderAll', undefined, ...args);
        const scheduleSave = (...args) => call(persistenceSource, 'scheduleSave', undefined, ...args);
        const ensureResultNodeReadableSize = (...args) => call(
            layoutSource,
            'ensureResultNodeReadableSize',
            false,
            ...args
        );
        const sendCanvasPollRunRequest = (...args) => call(
            requestSource,
            'sendCanvasPollRunRequest',
            Promise.resolve({ ok: false, error: 'poll request unavailable' }),
            ...args
        );
        const sendCanvasRunNodeRequest = (...args) => call(
            requestSource,
            'sendCanvasRunNodeRequest',
            Promise.resolve({ ok: false, error: 'run request unavailable' }),
            ...args
        );
        const pollRunWithController = (...args) => call(
            pollingSource,
            'pollRunWithController',
            Promise.resolve({ ok: false, error: 'run polling controller unavailable' }),
            ...args
        );
        const refreshMainGalleryAfterCanvasRun = (...args) => call(
            gallerySource,
            'refreshMainGalleryAfterCanvasRun',
            undefined,
            ...args
        );
        const syncCanvasProjectAssetRootFromAsset = (...args) => call(
            resultSource,
            'syncCanvasProjectAssetRootFromAsset',
            undefined,
            ...args
        );
        const syncCanvasProjectAssetRootFromAssets = (...args) => call(
            resultSource,
            'syncCanvasProjectAssetRootFromAssets',
            undefined,
            ...args
        );
        const cloneRunValue = (value, fallback) => call(
            serializationSource,
            'cloneRunValue',
            fallback,
            value,
            fallback
        );
        const nowIso = (...args) => call(timeSource, 'nowIso', '', ...args);
        const clampValue = (value, min, max) => call(
            utilitySource,
            'clamp',
            Math.max(min, Math.min(max, value)),
            value,
            min,
            max
        );
        const t = (english, chinese) => call(languageSource, 't', chinese || english, english, chinese);
        const showToast = (...args) => call(uiSource, 'showToast', undefined, ...args);
        const confirmDialog = (...args) => !!call(uiSource, 'confirm', false, ...args);
        const setSelection = (...args) => call(selectionSource, 'setSelection', undefined, ...args);
        const renderNodes = (...args) => call(renderSource, 'renderNodes', undefined, ...args);
        const renderEdges = (...args) => call(renderSource, 'renderEdges', undefined, ...args);
        const pushHistory = (...args) => call(historySource, 'pushHistory', undefined, ...args);
        const getNodeRect = (...args) => call(layoutSource, 'getNodeRect', null, ...args);
        const centerViewportOnWorld = (...args) => call(layoutSource, 'centerViewportOnWorld', undefined, ...args);
        const presetResultBasePosition = (...args) => call(layoutSource, 'presetResultBasePosition', { x: 0, y: 0 }, ...args);
        const defaultResultNodeSize = (...args) => call(layoutSource, 'defaultResultNodeSize', { w: 240, h: 260 }, ...args);
        const centerPresetRunViewport = (...args) => call(layoutSource, 'centerPresetRunViewport', undefined, ...args);
        const applyNodeLayoutPatch = (...args) => call(layoutSource, 'applyNodeLayoutPatch', undefined, ...args);
        const ensureGenerateEdge = (...args) => call(workflowSource, 'ensureGenerateEdge', null, ...args);
        const dockCanvasAgentPanelBottomLeft = (...args) => call(workflowSource, 'dockCanvasAgentPanelBottomLeft', undefined, ...args);
        const createCanvasAgentWorkflowGroup = (...args) => call(workflowSource, 'createCanvasAgentWorkflowGroup', undefined, ...args);

        const runFailureMessage = (response) => t(
            `Run failed: ${response?.error || 'unknown error'}`,
            `运行失败：${response?.error || '未知错误'}`
        );

        function resultNodeRunSortScore(node) {
            if (!node) return 0;
            const project = getProject();
            const run = (Array.isArray(project.runs) ? project.runs : []).find(item => item.id && item.id === node.producer?.run_id);
            const timeText = run?.updated_at || run?.created_at || node.source?.updated_at || node.updated_at || '';
            const time = Date.parse(timeText) || 0;
            const activeBoost = (isResultRefreshing(node) || isCanvasRunActiveState(nodeStatusState(node))) ? 1e15 : 0;
            const tokenBoost = node.source?.pending_run_token || node.producer?.pending_run_token ? 1e12 : 0;
            return activeBoost + tokenBoost + time;
        }

        function generatedResultNodesForPreset(presetNode) {
            if (!presetNode?.id) return [];
            const project = getProject();
            const edgeTargetIds = new Set((Array.isArray(project.edges) ? project.edges : [])
                .filter(edge => edge.type === 'generate' && edge.from === presetNode.id)
                .map(edge => edge.to)
                .filter(Boolean));
            return (Array.isArray(project.nodes) ? project.nodes : [])
                .filter(node => node?.type === 'result' && (node.producer?.preset_node_id === presetNode.id || edgeTargetIds.has(node.id)))
                .sort((a, b) => resultNodeRunSortScore(b) - resultNodeRunSortScore(a));
        }

        function findReusableResultNodeForPreset(presetNode) {
            return generatedResultNodesForPreset(presetNode)[0] || null;
        }

        function findActiveResultNodeForPreset(presetNode) {
            reconcilePresetRunCompletion(presetNode);
            return generatedResultNodesForPreset(presetNode).find(result => {
                return isResultRefreshing(result) || isCanvasRunActiveState(nodeStatusState(result));
            }) || null;
        }

        function reconcilePresetRunCompletion(presetNode) {
            if (!presetNode?.id) return false;
            const project = getProject();
            let changed = false;
            const results = generatedResultNodesForPreset(presetNode);
            for (const result of results) {
                const run = (Array.isArray(project.runs) ? project.runs : []).find(item => item.id && item.id === result.producer?.run_id);
                const resultState = nodeStatusState(result);
                const runState = run?.state || '';
                const terminalState = isTerminalRunState(resultState) ? resultState : (isTerminalRunState(runState) ? runState : '');
                if (!terminalState || !resultNodeHasOutput(result)) continue;
                if (isResultRefreshing(result) || isCanvasRunActiveState(resultState)) {
                    Object.assign(result, buildResultRefreshReconciledPatch(result));
                    if (isCanvasRunActiveState(resultState)) {
                        Object.assign(result, buildResultStatusPatch(result, {
                            status: mergeCanvasRunStatus(
                                result.status,
                                terminalState,
                                terminalState === 'finished' ? t('Finished: output is available.', '已完成：输出已可用。') : (result.status?.message || terminalState),
                                { percent: terminalState === 'finished' ? 1 : Number(result.status?.percent || 0) }
                            )
                        }));
                    }
                    changed = true;
                }
            }
            const stillActiveResult = results.some(result => isResultRefreshing(result) || isCanvasRunActiveState(nodeStatusState(result)));
            if (!stillActiveResult && isCanvasRunActiveState(nodeStatusState(presetNode))) {
                const completed = results.find(result => {
                    const run = (Array.isArray(project.runs) ? project.runs : []).find(item => item.id && item.id === result.producer?.run_id);
                    return resultNodeHasOutput(result) && (isTerminalRunState(nodeStatusState(result)) || isTerminalRunState(run?.state));
                });
                if (completed) {
                    const run = (Array.isArray(project.runs) ? project.runs : []).find(item => item.id && item.id === completed.producer?.run_id);
                    const state = isTerminalRunState(nodeStatusState(completed)) ? nodeStatusState(completed) : (run?.state || 'finished');
                    Object.assign(presetNode, buildCanvasNodeStatusPatch(presetNode, {
                        status: buildCanvasRunStatus(
                            state,
                            state === 'finished' ? t('Finished: output is available.', '已完成：输出已可用。') : (run?.message || state)
                        )
                    }));
                    changed = true;
                }
            }
            return changed;
        }

        function markResultRefreshPreparing(presetNode, resultNode, inputFingerprint, runToken) {
            if (!resultNode) return;
            Object.assign(resultNode, buildResultRefreshPreparingPatch(resultNode, {
                presetNodeId: presetNode.id,
                runToken,
                inputFingerprint
            }));
            Object.assign(resultNode, buildResultStatusPatch(resultNode, {
                status: mergeCanvasRunStatus(
                    resultNode.status,
                    'waiting',
                    t('Preparing refresh; downstream will wait for this run.', '正在准备刷新；下游会等待本次运行结果。'),
                    { percent: 0 }
                )
            }));
            Object.assign(presetNode, buildCanvasNodeStatusPatch(presetNode, {
                status: buildCanvasRunStatus('waiting', t('Preparing run...', '正在准备运行...'))
            }));
            mutate({ inspector: true });
        }

        function clearResultRefreshPreparing(resultNode, currentFingerprint) {
            if (!resultNode) return;
            const hasOldAsset = !!getSelectedResultAsset(resultNode);
            Object.assign(resultNode, buildResultRefreshClearedPatch(resultNode, {
                currentFingerprint,
                hasOldAsset
            }));
            if (isCanvasRunActiveState(nodeStatusState(resultNode))) {
                Object.assign(resultNode, buildResultStatusPatch(resultNode, {
                    status: mergeCanvasRunStatus(
                        resultNode.status,
                        hasOldAsset ? 'finished' : 'idle',
                        hasOldAsset
                            ? t('Refresh was not started; old output is still available.', '刷新未启动；旧输出仍可用。')
                            : t('Refresh was not started.', '刷新未启动。'),
                        { percent: hasOldAsset ? 1 : 0 }
                    )
                }));
            }
            mutate({ inspector: true });
        }

        function shouldUseDirectRunPromptPreflight(options) {
            const opts = options || {};
            if (opts.skipPromptResolve || opts.skipInputPreflight) return false;
            if (opts.strictPromptPreflight || opts.promptPreflight) return true;
            if (opts.agentWorkflowTitle || opts.agentWorkflowId || opts.sourceVlmNodeId) return true;
            return false;
        }

        async function preflightDirectPresetRun(node, options) {
            if (options?.skipInputPreflight || !node || !['preset', 'classic'].includes(node.type)) {
                return { ok: true };
            }
            if (typeof schedulerSource.buildPlan !== 'function') return { ok: true };
            const project = getProject();
            if (refreshResultStaleFlags()) {
                renderNodes();
                renderEdges();
                scheduleSave();
            }
            const plan = schedulerBuildPlan(project, { mode: 'selected', nodeIds: [node.id] });
            if (Array.isArray(plan?.cycles) && plan.cycles.length) {
                const error = plan.warnings?.find(item => String(item || '').includes('Cycle detected')) || 'Cycle detected in run plan.';
                console.warn('[SimpAI Canvas] direct run cycle blocked', plan.cycles, plan);
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
                    setBlockedSchedulerFromPlan(plan, {
                        message: t('Timed out waiting for upstream Result refresh.', '等待上游 Result 刷新超时。')
                    });
                    return { ok: false, error: 'upstream refresh timeout', plan };
                }
                return preflightDirectPresetRun(node, Object.assign({}, options || {}, { skipRefreshingWait: true }));
            }
            if (missing.length) {
                console.warn('[SimpAI Canvas] direct run missing inputs', missing, plan);
                setBlockedSchedulerFromPlan(plan);
                return { ok: false, error: 'missing inputs', plan };
            }
            let promptOverride = '';
            const directPurpose = String(node.runtime?.engine_type || node.schema?.engine_type || '')
                .toLowerCase()
                .includes('video')
                ? 'video'
                : 'text_to_image';
            const directPromptTarget = canvasAgentPromptTargetFromNode(node, directPurpose);
            const requiresPromptCompilerPreflight = !!directPromptTarget?.prompt_compiler;
            if ((shouldUseDirectRunPromptPreflight(options) || requiresPromptCompilerPreflight) && directPromptTarget) {
                const serialized = node.type === 'classic'
                    ? serializeClassicNodeForRun(node)
                    : serializePresetForRun(node);
                const promptText = canvasRunPromptParamText(serialized?.params?.prompt);
                const prompt = promptText.trim();
                if (prompt || requiresPromptCompilerPreflight) {
                    const wildcardPreview = await buildWildcardPreviewForNode(node);
                    const result = await ensureCanvasAgentPromptPreflightAllows(
                        promptText,
                        directPromptTarget,
                        directPurpose,
                        {
                            node,
                            entry: getPresetCatalogEntryForNode(node),
                            wildcardPreview,
                            presetDefaults: canvasAgentPresetPromptDefaults(node),
                            allowEditOnBlock: true
                        }
                    );
                    if (!result.ok) {
                        return { ok: false, error: result.error || 'prompt preflight blocked', preflight: result.preflight };
                    }
                    if (result.prompt && result.prompt !== prompt) {
                        if (getPromptTextSourceNode(node, 'prompt')) {
                            promptOverride = String(result.prompt).trim();
                        } else {
                            updateNodeParam(node.id, 'prompt', result.prompt, 'textarea');
                        }
                    }
                }
            }
            return { ok: true, plan, promptOverride };
        }

        async function ensurePresetModelsBeforeRun(node) {
            const status = await checkPresetModelStatus(node);
            if (status?.ok && status.ready) return { ok: true };
            if (status?.ok && !status.ready) {
                const count = Number(status.missing_count || 0);
                openMainMissingModelListForPreset(getNode(node.id) || node);
                const current = getNode(node.id);
                if (current) {
                    Object.assign(current, buildCanvasNodeStatusPatch(current, {
                        status: buildCanvasRunStatus(
                            'blocked',
                            t('Missing {count} required model file(s).', '缺少 {count} 个所需模型文件。').replace('{count}', count)
                        )
                    }));
                    renderAll({ inspector: false });
                }
                return { ok: false, error: 'preset models are missing', model_status: status };
            }
            const error = status?.details || status?.error || 'model check failed';
            if (confirmDialog(`Preset model check failed: ${error}\nContinue running anyway?`)) {
                return { ok: true, warning: error };
            }
            return { ok: false, error };
        }

        function buildPresetAssetSourcesFromUploadEdges(uploadEdges, serializer) {
            const assetSources = {};
            const sourceSerializer = typeof serializer === 'function' ? serializer : serializeAssetSourceForRun;
            (Array.isArray(uploadEdges) ? uploadEdges : []).forEach((edge) => {
                const source = getNode(edge?.from);
                if (source && edge?.slot) assetSources[edge.slot] = sourceSerializer(source);
            });
            return assetSources;
        }

        function applyPromptPreflightOverrideToRunPayload(payload, promptOverride) {
            const prompt = String(promptOverride || '').trim();
            const params = payload?.preset_node?.params;
            if (!prompt || !params || typeof params !== 'object') return payload;
            params.prompt = prompt;
            if (params.director_timeline && typeof params.director_timeline === 'object') {
                params.prompt_override = prompt;
                params.director_prompt_override = prompt;
            }
            return payload;
        }

        function shouldKeepAnyVlmModelLoadedForRun(presetNode) {
            const project = getProject();
            const ownerId = presetNode?.source?.agent_workflow_owner_node_id || '';
            const owner = ownerId ? getNode(ownerId) : null;
            const candidates = owner?.type === 'vlm'
                ? [owner]
                : (Array.isArray(project.nodes) ? project.nodes : []).filter(item => item?.type === 'vlm');
            return candidates.some((node) => {
                const params = node?.params || {};
                return params.keep_model_loaded !== false && !params.free_after;
            });
        }

        function buildRunDryRunPayload(presetNode, resultNode, runId) {
            const project = getProject();
            const uploadEdges = getPresetUploadRunEdges(presetNode);
            const configEdges = (Array.isArray(project.edges) ? project.edges : [])
                .filter(edge => edge.type === 'config' && edge.to === presetNode.id && !isNodeIgnored(getNode(edge.from)));
            const textEdges = (Array.isArray(project.edges) ? project.edges : [])
                .filter(edge => edge.type === 'text' && edge.to === presetNode.id && !isNodeIgnored(getNode(edge.from)));
            const assetSources = buildPresetAssetSourcesFromUploadEdges(uploadEdges, serializeAssetSourceForRun);
            const isClassic = presetNode.type === 'classic';
            const presetNodePayload = isClassic ? serializeClassicNodeForRun(presetNode) : serializePresetForRun(presetNode);
            presetNodePayload.upload_slot_sources = cloneRunValue(assetSources, {});
            applyDirectorTimelineMediaToPresetPayload(presetNodePayload);
            Object.assign(assetSources, presetNodePayload.upload_slot_sources || {});
            return {
                project_id: getProjectId() || project.id || '',
                run_id: runId,
                placeholder_node_id: resultNode.id,
                created_at: nowIso(),
                preset_node: presetNodePayload,
                upload_edges: cloneRunValue(uploadEdges, []),
                config_edges: cloneRunValue(configEdges, []),
                text_edges: cloneRunValue(textEdges, []),
                user_context: getWorkbenchUserContext(),
                keep_vlm_model_loaded: shouldKeepAnyVlmModelLoadedForRun(presetNode),
                asset_sources: assetSources,
                wildcard_preview: cloneRunValue(presetNode._last_wildcard_preview || {}, {})
            };
        }

        async function runPresetNode(node, options) {
            if (isNodeIgnored(node)) {
                showToast(t('This preset is marked as skipped.', '该 preset 已标记为跳过。'));
                return { ok: false, error: 'preset is skipped' };
            }
            const opts = options || {};
            const runKey = node?.id || '';
            if (runKey && isPendingPresetRun(runKey)) {
                if (reconcilePresetRunCompletion(node)) {
                    mutate({ inspector: true });
                }
                const activeResultForPending = findActiveResultNodeForPreset(node);
                if (recoverStalePendingPresetRun(runKey, {
                    hasActiveResult: !!activeResultForPending,
                    hasActiveState: isCanvasRunActiveState(nodeStatusState(node))
                })) {
                    showToast(t('Recovered a stale preparing lock; retrying run.', '已恢复一个过期的准备锁，正在重新运行。'), 2200);
                } else {
                    setSelection(node);
                    renderNodes();
                    renderEdges();
                    showToast(t('This node is already preparing a run.', '该节点正在准备运行。'), 2200);
                    return { ok: false, error: 'run already preparing' };
                }
            }
            if (reconcilePresetRunCompletion(node)) {
                mutate({ inspector: true });
            }
            if (!opts.directorSegmentChild) {
                const directorContext = directorRunContextForPreset(node);
                const directorErrors = Array.isArray(directorContext?.validation?.errors) ? directorContext.validation.errors : [];
                if (directorErrors.length) {
                    const message = directorErrors[0];
                    Object.assign(node, buildCanvasNodeStatusPatch(node, {
                        status: buildCanvasRunStatus('failed', message)
                    }));
                    mutate({ inspector: true });
                    showToast(message, 4200);
                    return { ok: false, error: message, validation: directorContext.validation };
                }
                const directorPlan = directorContext && directorContext.segments.length >= 2 ? directorContext : null;
                if (directorPlan) {
                    if (runKey) markPendingPresetRun(runKey);
                    try {
                        return await runDirectorSegmentedPresetNode(node, directorPlan, opts);
                    } finally {
                        if (runKey) clearPendingPresetRun(runKey);
                    }
                }
            }
            const activeResult = findActiveResultNodeForPreset(node);
            if (isCanvasRunActiveState(nodeStatusState(node)) || activeResult) {
                const focusNode = activeResult || findReusableResultNodeForPreset(node) || node;
                setSelection(focusNode);
                const rect = getNodeRect(focusNode);
                if (rect) centerViewportOnWorld(rect.x + rect.w / 2, rect.y + rect.h / 2);
                renderNodes();
                renderEdges();
                showToast(t('This node already has an active run; focusing the current task.', '该节点已有运行中的任务，已定位到当前任务。'), 2600);
                return { ok: false, error: 'run already active' };
            }
            if (runKey) markPendingPresetRun(runKey);
            try {
                const preflight = await preflightDirectPresetRun(node, opts);
                if (!preflight.ok) return preflight;
                const project = getProject();
                const existingResultNode = opts.resultNode
                    || (opts.reuseExistingResult ? findReusableResultNodeForPreset(node) : canvasAgentResultForPresetRun(node));
                const inputFingerprint = computePresetRunFingerprint(node);
                const runToken = uid('rt');
                if (existingResultNode) {
                    markResultRefreshPreparing(node, existingResultNode, inputFingerprint, runToken);
                } else {
                    Object.assign(node, buildCanvasNodeStatusPatch(node, {
                        status: buildCanvasRunStatus('waiting', t('Preparing run...', '正在准备运行...'))
                    }));
                    mutate({ inspector: true });
                }
                const modelGate = await ensurePresetModelsBeforeRun(node);
                if (!modelGate?.ok) {
                    if (existingResultNode) clearResultRefreshPreparing(existingResultNode, inputFingerprint);
                    return modelGate;
                }
                pushHistory('Run preset node');
                const runId = uid('run');
                const basePosition = presetResultBasePosition(node);
                const resultSize = defaultResultNodeSize();
                const resultNode = existingResultNode || buildQueuedResultNode({
                    position: basePosition,
                    size: resultSize,
                    title: `${node.title || 'Preset'} ${t('Output', '输出')}`,
                    producer: {
                        preset_node_id: node.id,
                        run_id: runId,
                        run_token: runToken,
                        task_id: null,
                        fingerprint: inputFingerprint,
                        pending_fingerprint: inputFingerprint,
                        pending_run_token: runToken,
                        refreshing: true,
                        stale: false
                    },
                    step: 0,
                    totalSteps: presetGenerationStepValue(node),
                    message: t('Result placeholder created; submitting to AsyncTask.', '已创建结果占位节点；正在提交到 AsyncTask。'),
                    source: {
                        kind: 'generated_placeholder',
                        output_path: null,
                        regen_manifest: null,
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
                    Object.assign(resultNode, buildResultRefreshPreparingPatch(resultNode, {
                        presetNodeId: node.id,
                        runId,
                        runToken,
                        inputFingerprint,
                        producerPatch: { task_id: null },
                        errorDetails: null
                    }));
                    Object.assign(resultNode, buildResultStatusPatch(resultNode, {
                        status: buildCanvasRunStatus(
                            'queued',
                            t('Reusing result node; submitting to AsyncTask.', '正在复用结果节点；提交到 AsyncTask。'),
                            {
                                queuePosition: null,
                                step: 0,
                                totalSteps: presetGenerationStepValue(node),
                                percent: 0
                            }
                        )
                    }));
                    Object.assign(resultNode, buildResultPreviewPatch(resultNode, {
                        preview: null,
                        previewFrames: null
                    }));
                } else {
                    Object.assign(resultNode, buildResultLayoutPatch(resultNode, {
                        x: basePosition.x,
                        y: basePosition.y
                    }));
                    Object.assign(project, buildProjectNodeAppendPatch(project, resultNode));
                }
                ensureGenerateEdge(node.id, resultNode.id);
                if (!existingResultNode && opts.agentWorkflowTitle) {
                    dockCanvasAgentPanelBottomLeft({ render: false });
                    applyNodeLayoutPatch(node, { collapsed: true });
                    Object.assign(resultNode, buildResultLayoutPatch(resultNode, { collapsed: false }));
                    createCanvasAgentWorkflowGroup([node, resultNode], opts.agentWorkflowTitle);
                }
                Object.assign(project, buildProjectRunAppendPatch(project, buildPresetRunRecord({
                    runId,
                    presetNodeId: node.id,
                    placeholderNodeId: resultNode.id,
                    inputFingerprint,
                    runToken
                })));
                Object.assign(node, buildCanvasNodeStatusPatch(node, { status: 'queued' }));
                setSelection(resultNode);
                clearSchedulerBlockedState();
                mutate();
                if (!existingResultNode) centerPresetRunViewport(node, resultNode);
                showToast(t('Result placeholder created; submitting to AsyncTask.', '已创建结果占位节点，正在提交到 AsyncTask'));
                const payload = buildRunDryRunPayload(node, resultNode, runId);
                applyPromptPreflightOverrideToRunPayload(payload, preflight.promptOverride);
                const runResult = await sendCanvasRunNodeRequest(payload);
                return applyRunNodeResult(runId, resultNode.id, node.id, runResult, opts);
            } finally {
                if (runKey) clearPendingPresetRun(runKey);
            }
        }

        function applyRunDryRunResult(runId, resultNodeId, presetNodeId, response) {
            const resultNode = getNode(resultNodeId);
            const presetNode = getNode(presetNodeId);
            const project = getProject();
            const run = (Array.isArray(project.runs) ? project.runs : []).find(item => item.id === runId);
            const ok = !!(response && response.ok);
            if (run) {
                Object.assign(run, buildCanvasDryRunPatch(run, response));
            }
            if (resultNode) {
                const inputCount = Array.isArray(response?.materialized_inputs) ? response.materialized_inputs.length : 0;
                const taskMethod = response?.task_args_preview?.params_backend_preview?.task_method || response?.task_preview?.task_method || '';
                const warnings = Array.isArray(response?.task_args_preview?.warnings) ? response.task_args_preview.warnings : [];
                const argsReady = !!response?.task_args_preview?.async_args_preview?.ok;
                const taskObjectReady = argsReady && !!response?.task_args_preview?.async_args_preview?.task_object_preview;
                const argsLength = response?.task_args_preview?.async_args_preview?.args_length || 0;
                Object.assign(resultNode, buildResultStatusPatch(resultNode, {
                    status: mergeCanvasRunStatus(
                        resultNode.status,
                        ok && taskObjectReady ? 'task_ready' : (ok && argsReady ? 'args_ready' : (ok ? 'dry_run_ready' : 'failed')),
                        ok
                            ? `${taskObjectReady ? t('Task object ready', 'Task object ready') : (argsReady ? t('Args ready: {count} API parameter(s)', 'Args ready：{count} 个 API 参数').replace('{count}', argsLength) : t('Args preview completed', 'Args preview 完成'))}; ${t('{count} input(s)', '{count} 个输入').replace('{count}', inputCount)}, ${taskMethod || t('task_method pending confirmation', 'task_method 待确认')}${warnings.length ? `; ${warnings.join('; ')}` : ''}`
                            : t('Dry-run failed: {error}', 'Dry-run 失败：{error}').replace('{error}', response?.error || (response?.errors || []).map(item => item.error).join('; ') || 'unknown error'),
                        { percent: ok && taskObjectReady ? 0.24 : (ok && argsReady ? 0.18 : (ok ? 0.12 : 0)) }
                    )
                }));
                Object.assign(resultNode, buildResultDryRunSourcePatch(resultNode, response));
            }
            if (presetNode) {
                const taskObjectReady = ok && !!response?.task_args_preview?.async_args_preview?.task_object_preview;
                Object.assign(presetNode, buildCanvasNodeStatusPatch(presetNode, {
                    status: taskObjectReady ? 'task_ready' : (ok && response?.task_args_preview?.async_args_preview?.ok ? 'args_ready' : (ok ? 'dry_run_ready' : 'failed'))
                }));
            }
            mutate();
            showToast(ok ? t('Run payload dry-run completed.', 'Run payload dry-run 完成') : t('Run payload dry-run failed.', 'Run payload dry-run 失败'));
        }

        function applyCanvasRunStatus(runId, resultNodeId, presetNodeId, response) {
            const resultNode = getNode(resultNodeId);
            const presetNode = getNode(presetNodeId);
            const project = getProject();
            const run = (Array.isArray(project.runs) ? project.runs : []).find(item => item.id === runId);
            const ok = !!(response && response.ok);
            const state = response?.state || (ok ? 'queued' : 'failed');
            const hasPreviewStream = !!(response?.preview_stream && typeof response.preview_stream === 'object');
            const hasFreshPreviewFrames = resultPreviewFreshFrames(response).length > 0;
            if (run) {
                Object.assign(run, buildCanvasRunResponsePatch(run, response));
            }
            const currentResultRunId = resultNode?.producer?.run_id || '';
            const responseTargetsCurrentResult = !currentResultRunId || currentResultRunId === runId;
            if (resultNode && !responseTargetsCurrentResult) {
                if (presetNode && isTerminalRunState(state)) {
                    Object.assign(presetNode, buildCanvasNodeStatusPatch(presetNode, {
                        status: buildCanvasRunStatus(
                            state,
                            ok ? (response?.message || state) : runFailureMessage(response)
                        )
                    }));
                }
                scheduleSave();
                return;
            }
            if (resultNode) {
                Object.assign(resultNode, buildResultRunMetadataPatch(resultNode, {
                    response,
                    ok,
                    runId
                }));
                Object.assign(resultNode, buildResultStatusPatch(resultNode, {
                    status: mergeCanvasRunStatus(
                        resultNode.status,
                        state,
                        ok ? (response?.message || state) : runFailureMessage(response),
                        {
                            queuePosition: response?.queue_size ?? null,
                            percent: clampValue(Number(response?.percent || 0), 0, 1)
                        }
                    )
                }));
                applyResultPreviewStream(resultNode, response, state);
                if (response?.preview && (!hasPreviewStream || hasFreshPreviewFrames)) {
                    Object.assign(resultNode, buildResultPreviewPatch(resultNode, {
                        preview: cloneRunValue(response.preview, null)
                    }));
                }
                appendResultNodePreviewFrames(resultNode, response, state);
                if (response?.asset) {
                    const completedFingerprint = resultNode.producer?.pending_fingerprint
                        || resultNode.source?.pending_fingerprint
                        || resultNode.producer?.fingerprint
                        || resultNode.source?.input_fingerprint
                        || '';
                    clearSchedulerBlockedState();
                    const assetPatch = { asset: cloneRunValue(response.asset, null) };
                    if (Array.isArray(response.assets) && response.assets.length) {
                        assetPatch.assets = cloneRunValue(response.assets, []);
                        if (resultNode.selected_asset_index === undefined || resultNode.selected_asset_index === null) {
                            assetPatch.selectedAssetIndex = assetPatch.assets.length - 1;
                        }
                    }
                    Object.assign(resultNode, buildResultAssetPatch(resultNode, assetPatch));
                    syncCanvasProjectAssetRootFromAsset(resultNode.asset);
                    if (assetPatch.assets) syncCanvasProjectAssetRootFromAssets(resultNode.assets);
                    Object.assign(resultNode, buildResultOutputPatch(resultNode, {
                        kind: 'generated_output',
                        outputPath: response.asset.output_path || response.asset.path || '',
                        completedFingerprint
                    }));
                    ensureResultNodeReadableSize(resultNode, resultNode.asset);
                    stopResultPreviewPlayer(resultNode.id);
                    Object.assign(resultNode, buildResultPreviewPatch(resultNode, {
                        preview: null,
                        previewFrames: null,
                        previewStepKey: ''
                    }));
                }
                if (isTerminalRunState(state) && !response?.asset && resultNode.source?.refreshing) {
                    Object.assign(resultNode, buildResultRefreshFailurePatch(resultNode));
                    stopResultPreviewPlayer(resultNode.id);
                    Object.assign(resultNode, buildResultPreviewPatch(resultNode, {
                        preview: null,
                        previewFrames: null,
                        previewStepKey: ''
                    }));
                } else if (isTerminalRunState(state) && !response?.asset) {
                    stopResultPreviewPlayer(resultNode.id);
                }
            }
            if (presetNode) {
                Object.assign(presetNode, buildCanvasNodeStatusPatch(presetNode, { status: state }));
            }
            if (isTerminalRunState(state)) {
                mutate();
            } else {
                pollUpdate();
                scheduleSave();
            }
        }

        function applyRunNodeResult(runId, resultNodeId, presetNodeId, response, options) {
            applyCanvasRunStatus(runId, resultNodeId, presetNodeId, response);
            if (response && response.ok) {
                const state = String(response.state || ((response.asset || (Array.isArray(response.assets) && response.assets.length)) ? 'finished' : '')).trim();
                if (isTerminalRunState(state)) {
                    if (state === 'finished') {
                        refreshMainGalleryAfterCanvasRun(response);
                        showToast(t('Canvas task finished.', '画布任务已完成。'));
                        return Promise.resolve({ ok: true, state, result: response, result_node_id: resultNodeId, preset_node_id: presetNodeId });
                    }
                    showToast(t(`Canvas task ${state}.`, `画布任务${state}。`));
                    return Promise.resolve({ ok: false, state, error: response.message || response.error || `Canvas task ${state}.`, result: response });
                }
                showToast(t('AsyncTask queued.', 'AsyncTask 已排队。'));
                return pollCanvasRun(runId, resultNodeId, presetNodeId, options);
            }
            const error = response?.error || 'unknown error';
            showToast(t(`AsyncTask enqueue failed: ${error}`, `AsyncTask 提交失败：${error}`));
            return Promise.resolve({ ok: false, error: response?.error || 'AsyncTask enqueue failed', response });
        }

        function pollCanvasRun(runId, resultNodeId, presetNodeId, options) {
            const opts = options || {};
            return pollRunWithController(runId, {
                initialDelayMs: opts.initialDelayMs ?? 900,
                intervalMs: opts.intervalMs ?? 1200,
                poll: () => sendCanvasPollRunRequest(runId, {
                    after_preview_serial: resultPreviewLastSerial(resultNodeId)
                }),
                onResult: (result) => applyCanvasRunStatus(runId, resultNodeId, presetNodeId, result),
                getState: (result) => result?.state || 'failed',
                onFinished: (result, state) => {
                    refreshMainGalleryAfterCanvasRun(result);
                    showToast(t('Canvas task finished.', '画布任务已完成。'));
                    return { ok: true, state, result, result_node_id: resultNodeId, preset_node_id: presetNodeId };
                },
                onCanceled: (result, state) => {
                    showToast(t(`Canvas task ${state}.`, `画布任务${state}。`));
                    return { ok: false, state, error: `Canvas task ${state}.`, result };
                },
                onFailed: (result, state) => {
                    const error = result?.message || result?.error || 'unknown error';
                    showToast(t(`Canvas task failed: ${error}`, `画布任务失败：${error}`));
                    return { ok: false, state, error, result };
                },
                onStopped: (result, state) => ({ ok: false, state, error: 'Canvas task stopped polling.', result })
            });
        }

        async function submitDirectorSegmentRun(presetNode, resultNode, plan, segment, index, previousResultNode) {
            if (directorSegmentUsesPreviousImage(segment) && !directorResultAssetSource(previousResultNode)) {
                const message = t(
                    `Director shot ${index + 1} needs the previous shot last frame, but the previous run has no usable video yet.`,
                    `分镜 ${index + 1} 需要继承上一段尾帧，但上一段还没有可用视频。`
                );
                Object.assign(resultNode, buildResultStatusPatch(resultNode, {
                    status: buildCanvasRunStatus('failed', message)
                }));
                return { ok: false, error: message };
            }
            if (directorSegmentUsesPreviousVideo(segment) && !directorResultAssetSource(previousResultNode)) {
                const message = t(
                    `Director shot ${index + 1} needs the previous shot result video, but the previous run has no usable video yet.`,
                    `分镜 ${index + 1} 需要上一段结果视频，但上一段还没有可用视频。`
                );
                Object.assign(resultNode, buildResultStatusPatch(resultNode, {
                    status: buildCanvasRunStatus('failed', message)
                }));
                return { ok: false, error: message };
            }
            const runId = uid('run');
            const runToken = uid('rt');
            Object.assign(resultNode, buildResultProducerPatch(resultNode, {
                run_id: runId,
                run_token: runToken,
                pending_run_token: runToken,
                refreshing: true
            }));
            const project = getProject();
            Object.assign(project, buildProjectRunAppendPatch(project, buildDirectorSegmentRunRecord({
                runId,
                presetNodeId: presetNode.id,
                placeholderNodeId: resultNode.id,
                runToken,
                segmentIndex: index
            })));
            const payload = buildRunDryRunPayload(presetNode, resultNode, runId);
            payload.director_segmented_run = true;
            payload.director_segment_index = index;
            payload.preset_node = applyDirectorSegmentToPresetPayload(
                payload.preset_node,
                plan,
                segment,
                index,
                previousResultNode
            );
            payload.asset_sources = Object.assign({}, payload.asset_sources || {}, payload.preset_node?.upload_slot_sources || {});
            const runResult = await call(
                requestSource,
                'sendCanvasRunNodeRequest',
                Promise.resolve({ ok: false, error: 'run request unavailable' }),
                payload
            );
            const outcome = await applyRunNodeResult(runId, resultNode.id, presetNode.id, runResult, { initialDelayMs: 900 });
            const current = getNode(resultNode.id);
            if (current) {
                Object.assign(current, buildResultSourcePatch(current, {
                    kind: 'director_segment_result',
                    director_node_id: plan.director.id,
                    preset_node_id: presetNode.id,
                    segment_index: index,
                    segment_id: segment?.id || `shot_${index + 1}`,
                    prompt: directorSegmentPrompt(segment, '')
                }));
            }
            return outcome;
        }

        return {
            runPresetNode,
            preflightDirectPresetRun,
            ensurePresetModelsBeforeRun,
            applyRunDryRunResult,
            applyCanvasRunStatus,
            applyRunNodeResult,
            pollCanvasRun,
            submitDirectorSegmentRun,
            findReusableResultNodeForPreset,
            findActiveResultNodeForPreset,
            reconcilePresetRunCompletion,
            generatedResultNodesForPreset,
            resultNodeRunSortScore,
            markResultRefreshPreparing,
            clearResultRefreshPreparing
        };
    }

    window.SimpAICanvasWorkbenchPresetRunRuntime = Object.assign(
        {},
        window.SimpAICanvasWorkbenchPresetRunRuntime || {},
        { createCanvasPresetRunRuntimeController }
    );
})();
