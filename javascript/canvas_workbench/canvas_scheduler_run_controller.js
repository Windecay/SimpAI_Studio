(function () {
    'use strict';

    function createCanvasSchedulerRunController(context) {
        const scope = context || {};
        const sourceObject = (name) => {
            const value = scope[name];
            return value && typeof value === 'object' ? value : {};
        };
        const sourceCall = (source, name, fallback, ...args) => typeof source[name] === 'function'
            ? source[name](...args)
            : fallback;
        const projectSource = sourceObject('projectSource');
        const schedulerSource = sourceObject('schedulerSource');
        const stateSource = sourceObject('stateSource');
        const selectionSource = sourceObject('selectionSource');
        const statusSource = sourceObject('statusSource');
        const renderSource = sourceObject('renderSource');
        const runSource = sourceObject('runSource');
        const utilitySource = sourceObject('utilitySource');
        const timeSource = sourceObject('timeSource');
        const languageSource = sourceObject('languageSource');
        const uiSource = sourceObject('uiSource');
        const diagnosticsSource = sourceObject('diagnosticsSource');
        const persistenceSource = sourceObject('persistenceSource');
        const getProject = () => sourceCall(projectSource, 'getProject', {}) || {};
        const getSelectedNodeIdList = () => sourceCall(selectionSource, 'getSelectedNodeIdList', []);
        const getSelectedNodeId = () => sourceCall(selectionSource, 'getSelectedNodeId', null);
        const applyProjectSchedulerPatch = (scheduler, options) => sourceCall(
            projectSource,
            'applyProjectSchedulerPatch',
            undefined,
            scheduler,
            options
        );
        const buildPlan = (...args) => sourceCall(schedulerSource, 'buildPlan', null, ...args);
        const runPlan = (...args) => sourceCall(schedulerSource, 'runPlan', null, ...args);
        const buildBlockedState = (...args) => sourceCall(schedulerSource, 'buildSchedulerBlockedState', {}, ...args);
        const buildRunningState = (...args) => sourceCall(schedulerSource, 'buildSchedulerRunningState', {}, ...args);
        const buildResumePatch = (...args) => sourceCall(schedulerSource, 'buildSchedulerResumePatch', {}, ...args);
        const buildStepStartPatch = (...args) => sourceCall(schedulerSource, 'buildSchedulerStepStartPatch', {}, ...args);
        const buildStepEndPatch = (...args) => sourceCall(schedulerSource, 'buildSchedulerStepEndPatch', {}, ...args);
        const buildErrorPatch = (...args) => sourceCall(schedulerSource, 'buildSchedulerErrorPatch', {}, ...args);
        const buildFinishedPatch = (...args) => sourceCall(schedulerSource, 'buildSchedulerFinishedPatch', {}, ...args);
        const refreshResultStaleFlags = () => sourceCall(stateSource, 'refreshResultStaleFlags', false);
        const setSchedulerWaitingFromPlan = (...args) => sourceCall(stateSource, 'setSchedulerWaitingFromPlan', undefined, ...args);
        const setBlockedSchedulerFromPlan = (...args) => sourceCall(stateSource, 'setBlockedSchedulerFromPlan', undefined, ...args);
        const firstBlockedSchedulerStep = (...args) => sourceCall(stateSource, 'firstBlockedSchedulerStep', null, ...args);
        const markBlockedSchedulerSteps = (...args) => sourceCall(stateSource, 'markBlockedSchedulerSteps', [], ...args);
        const schedulerStepMissingSummary = (...args) => sourceCall(stateSource, 'schedulerStepMissingSummary', '', ...args);
        const waitForRefreshingSources = (...args) => sourceCall(stateSource, 'waitForRefreshingSources', false, ...args);
        const focusSchedulerProblem = (...args) => sourceCall(stateSource, 'focusSchedulerProblem', undefined, ...args);
        const buildCanvasNodeStatusPatch = (...args) => sourceCall(statusSource, 'buildCanvasNodeStatusPatch', {}, ...args);
        const cloneRunValue = (value, fallback) => sourceCall(utilitySource, 'cloneRunValue', fallback, value, fallback);
        const nowIso = () => sourceCall(timeSource, 'nowIso', '');
        const t = typeof languageSource.t === 'function' ? languageSource.t : ((en, cn) => cn || en);
        const showToast = (message, durationMs) => sourceCall(uiSource, 'showToast', undefined, message, durationMs);
        const renderStatus = () => sourceCall(renderSource, 'renderStatus', undefined);
        const renderRunQueuePanelIfOpen = () => sourceCall(renderSource, 'renderRunQueuePanelIfOpen', undefined);
        const renderNodes = () => sourceCall(renderSource, 'renderNodes', undefined);
        const renderEdges = () => sourceCall(renderSource, 'renderEdges', undefined);
        const runSchedulerStep = (...args) => sourceCall(runSource, 'runSchedulerStep', { ok: false, error: 'scheduler step runner unavailable' }, ...args);
        const scheduleSave = () => sourceCall(persistenceSource, 'scheduleSave', undefined);
        const warn = (...args) => sourceCall(diagnosticsSource, 'warn', undefined, ...args);
        const info = (...args) => sourceCall(diagnosticsSource, 'info', undefined, ...args);

        function refreshingSourceIdsFromPlan(plan) {
            const ids = new Set();
            (Array.isArray(plan?.steps) ? plan.steps : []).forEach(step => {
                (Array.isArray(step?.missing_details) ? step.missing_details : []).forEach(detail => {
                    if (detail?.reason === 'source_refreshing' && detail.source_node_id) ids.add(detail.source_node_id);
                });
            });
            return Array.from(ids);
        }

        function missingStepsAreOnlyRefreshing(missingSteps) {
            const steps = Array.isArray(missingSteps) ? missingSteps : [];
            if (!steps.length) return false;
            return steps.every(step => {
                const details = Array.isArray(step?.missing_details) ? step.missing_details : [];
                return details.length && details.every(detail => detail?.reason === 'source_refreshing');
            });
        }

        async function runSchedulerPlan(mode, nodeIds, options) {
            const opts = options || {};
            const project = getProject();
            if (typeof schedulerSource.buildPlan !== 'function') {
                showToast(t('Workbench scheduler is not loaded.', '工作台调度器未加载。'));
                return { ok: false, error: 'scheduler is not loaded' };
            }
            if (project.scheduler?.state === 'running' || project.scheduler?.state === 'waiting') {
                showToast(t('A workbench queue is already running.', '工作台队列正在运行。'));
                return { ok: false, error: 'queue already running' };
            }
            if (refreshResultStaleFlags()) {
                renderNodes();
                renderEdges();
                scheduleSave();
            }
            const plan = buildPlan(project, { mode, nodeIds });
            if (!plan?.steps?.length) {
                showToast(t('No runnable nodes in this chain.', '此链路没有可运行节点。'));
                return { ok: false, error: 'empty plan', plan };
            }
            if (Array.isArray(plan.cycles) && plan.cycles.length) {
                const error = plan.warnings?.find(item => String(item || '').includes('Cycle detected'))
                    || t('Cycle detected in run plan.', '运行计划中检测到循环。');
                applyProjectSchedulerPatch(buildBlockedState({
                    plan,
                    nowIso: () => nowIso(),
                    steps: markBlockedSchedulerSteps(plan.steps),
                    warnings: cloneRunValue(plan.warnings || [], []),
                    cycles: cloneRunValue(plan.cycles || [], []),
                    error
                }));
                renderStatus();
                renderNodes();
                renderEdges();
                showToast(error, 3600);
                warn('[SimpAI Canvas] scheduler cycle detected', plan.cycles, plan);
                scheduleSave();
                return { ok: false, error, plan };
            }
            const missing = plan.steps.filter(step => Array.isArray(step.missing_inputs) && step.missing_inputs.length);
            if (missing.length) {
                const refreshingIds = refreshingSourceIdsFromPlan(plan);
                if (refreshingIds.length && !opts.skipRefreshingWait && missingStepsAreOnlyRefreshing(missing)) {
                    setSchedulerWaitingFromPlan(plan, refreshingIds);
                    const waited = await waitForRefreshingSources(refreshingIds, {
                        waitingNodeId: firstBlockedSchedulerStep(plan)?.node_id
                    });
                    if (waited) {
                        applyProjectSchedulerPatch(buildResumePatch({ nowIso: () => nowIso() }), { merge: true });
                        renderStatus();
                        renderRunQueuePanelIfOpen();
                        return runSchedulerPlan(mode, nodeIds, Object.assign({}, opts, { skipRefreshingWait: true }));
                    }
                    setBlockedSchedulerFromPlan(plan, {
                        message: t('Timed out waiting for upstream Result refresh.', '等待上游 Result 刷新超时。')
                    });
                    return { ok: false, error: 'upstream refresh timeout', plan };
                }
                const first = firstBlockedSchedulerStep(plan);
                const message = first
                    ? t('Queue blocked at {node}: {inputs}', '队列阻塞于 {node}：{inputs}')
                        .replace('{node}', first.title || first.node_id)
                        .replace('{inputs}', schedulerStepMissingSummary(first))
                    : t('Run plan has missing inputs.', '运行计划存在缺失输入。');
                showToast(message, 4200);
                warn('[SimpAI Canvas] scheduler missing inputs', missing, plan);
                applyProjectSchedulerPatch(buildBlockedState({
                    plan,
                    nowIso: () => nowIso(),
                    currentNodeId: first?.node_id || '',
                    currentTitle: first?.title || '',
                    steps: markBlockedSchedulerSteps(plan.steps),
                    warnings: cloneRunValue(plan.warnings || [], []),
                    error: missing.map(step => `${step.title}: ${schedulerStepMissingSummary(step)}`).join('; ')
                }));
                renderStatus();
                renderRunQueuePanelIfOpen();
                focusSchedulerProblem(first);
                scheduleSave();
                return { ok: false, error: 'missing inputs', plan };
            }
            applyProjectSchedulerPatch(buildRunningState({
                plan,
                nowIso: () => nowIso(),
                steps: cloneRunValue(plan.steps, [])
            }));
            renderStatus();
            renderRunQueuePanelIfOpen();
            const planPreview = plan.steps.map(step => step.auto_included ? `[${step.title}]` : step.title).join(' -> ');
            showToast(t('Scheduler plan: {plan}', '调度计划：{plan}').replace('{plan}', planPreview), 3200);
            info('[SimpAI Canvas] scheduler plan', plan);
            const result = await runPlan(plan, {
                runNode: (...args) => runSchedulerStep(...args),
                onStepStart: (step, index) => {
                    applyProjectSchedulerPatch(buildStepStartPatch(step, index, { nowIso: () => nowIso() }), { merge: true });
                    renderStatus();
                    renderRunQueuePanelIfOpen();
                    showToast(t('Running {current}/{total}: {title}', '正在运行 {current}/{total}：{title}')
                        .replace('{current}', String(index + 1))
                        .replace('{total}', String(plan.steps.length))
                        .replace('{title}', step.title || step.node_id || t('node', '节点')));
                },
                onStepEnd: (_step, index) => {
                    applyProjectSchedulerPatch(buildStepEndPatch(index, { nowIso: () => nowIso() }), { merge: true });
                    renderStatus();
                    renderRunQueuePanelIfOpen();
                },
                onError: (step, err) => {
                    applyProjectSchedulerPatch(buildErrorPatch(step, err, { nowIso: () => nowIso() }), { merge: true });
                    renderStatus();
                    renderRunQueuePanelIfOpen();
                },
                onFinish: () => {
                    applyProjectSchedulerPatch(buildFinishedPatch({ nowIso: () => nowIso() }), { merge: true });
                    renderStatus();
                    renderRunQueuePanelIfOpen();
                }
            });
            if (result?.ok) {
                showToast(t('Workbench chain finished.', '工作台链路已完成。'));
            } else {
                showToast(t('Workbench chain stopped: {error}', '工作台链路已停止：{error}')
                    .replace('{error}', result?.error || t('unknown error', '未知错误')));
            }
            scheduleSave();
            return result;
        }

        function runSelectedChain() {
            const ids = getSelectedNodeIdList();
            const selectedNodeId = getSelectedNodeId();
            if (!ids.length && selectedNodeId) ids.push(selectedNodeId);
            return runSchedulerPlan('selected', ids);
        }

        function runNodeChain(node, mode) {
            if (!node) return;
            return runSchedulerPlan(mode || 'to-here', [node.id]);
        }

        return {
            runSchedulerPlan,
            runSelectedChain,
            runNodeChain,
            refreshingSourceIdsFromPlan,
            missingStepsAreOnlyRefreshing
        };
    }

    window.SimpAICanvasWorkbenchSchedulerRun = Object.assign(
        {},
        window.SimpAICanvasWorkbenchSchedulerRun || {},
        { createCanvasSchedulerRunController }
    );
})();
