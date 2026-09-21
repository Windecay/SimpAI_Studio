(function () {
    'use strict';

    function createCanvasSchedulerStateController(context) {
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
        const statusSource = sourceObject('statusSource');
        const selectionSource = sourceObject('selectionSource');
        const viewportSource = sourceObject('viewportSource');
        const renderSource = sourceObject('renderSource');
        const utilitySource = sourceObject('utilitySource');
        const timeSource = sourceObject('timeSource');
        const languageSource = sourceObject('languageSource');
        const uiSource = sourceObject('uiSource');
        const persistenceSource = sourceObject('persistenceSource');
        const getProject = () => sourceCall(projectSource, 'getProject', {}) || {};
        const getNode = (id) => sourceCall(projectSource, 'getNode', null, id);
        const applyProjectSchedulerPatch = (scheduler, options) => sourceCall(
            projectSource,
            'applyProjectSchedulerPatch',
            undefined,
            scheduler,
            options
        );
        const cloneRunValue = (value, fallback) => sourceCall(utilitySource, 'cloneRunValue', fallback, value, fallback);
        const nowIso = () => sourceCall(timeSource, 'nowIso', '',);
        const t = typeof languageSource.t === 'function' ? languageSource.t : ((en, cn) => cn || en);
        const showToast = (message, durationMs) => sourceCall(uiSource, 'showToast', undefined, message, durationMs);
        const scheduleSave = () => sourceCall(persistenceSource, 'scheduleSave', undefined);
        const renderStatus = () => sourceCall(renderSource, 'renderStatus', undefined);
        const renderRunQueuePanelIfOpen = () => sourceCall(renderSource, 'renderRunQueuePanelIfOpen', undefined);
        const renderNodes = () => sourceCall(renderSource, 'renderNodes', undefined);
        const renderEdges = () => sourceCall(renderSource, 'renderEdges', undefined);
        const setSelection = (node) => sourceCall(selectionSource, 'setSelection', undefined, node);
        const getNodeRect = (node) => sourceCall(viewportSource, 'getNodeRect', null, node);
        const centerViewportOnWorld = (x, y) => sourceCall(viewportSource, 'centerViewportOnWorld', undefined, x, y);
        const buildSchedulerBlockedState = (options) => sourceCall(schedulerSource, 'buildSchedulerBlockedState', {}, options);
        const buildSchedulerWaitingState = (options) => sourceCall(schedulerSource, 'buildSchedulerWaitingState', {}, options);
        const buildSchedulerResetPatch = (options) => sourceCall(schedulerSource, 'buildSchedulerResetPatch', {}, options);
        const buildCanvasNodeStatusPatch = (node, options) => sourceCall(statusSource, 'buildCanvasNodeStatusPatch', {}, node, options);
        const buildCanvasRunStatus = (state, message, options) => sourceCall(statusSource, 'buildCanvasRunStatus', {
            state,
            message: message || ''
        }, state, message, options);

        function refreshRunUi(options) {
            const config = options || {};
            renderStatus();
            renderRunQueuePanelIfOpen();
            if (config.nodes) renderNodes();
            if (config.edges) renderEdges();
        }

        function schedulerStepMissingSummary(step) {
            const details = Array.isArray(step?.missing_details) && step.missing_details.length
                ? step.missing_details
                : (Array.isArray(step?.missing_inputs) ? step.missing_inputs.map(label => ({ label })) : []);
            const labels = details.map(item => {
                const label = item?.label || t('input', '输入');
                if (item?.reason === 'source_refreshing') return `${label} ${t('(refreshing)', '（正在刷新）')}`;
                return item?.reason === 'source_stale'
                    ? `${label} ${t('(stale result)', '（结果已过期）')}`
                    : label;
            }).filter(Boolean);
            return labels.length ? labels.join(', ') : t('missing input', '缺失输入');
        }

        function markBlockedSchedulerSteps(steps) {
            return cloneRunValue(steps || [], []).map(step => {
                if (Array.isArray(step.missing_inputs) && step.missing_inputs.length) {
                    return Object.assign({}, step, { state: 'blocked' });
                }
                return step;
            });
        }

        function firstBlockedSchedulerStep(plan) {
            return (Array.isArray(plan?.steps) ? plan.steps : [])
                .find(step => Array.isArray(step.missing_inputs) && step.missing_inputs.length) || null;
        }

        function isNodeSchedulerBlocked(node) {
            const project = getProject();
            if (!node || project.scheduler?.state !== 'blocked') return false;
            const steps = Array.isArray(project.scheduler.steps) ? project.scheduler.steps : [];
            return steps.some(step => step?.node_id === node.id && Array.isArray(step.missing_inputs) && step.missing_inputs.length);
        }

        function isNodeSchedulerWaiting(node) {
            const project = getProject();
            if (!node || project.scheduler?.state !== 'waiting') return false;
            if (project.scheduler.current_node_id === node.id) return true;
            const waitingIds = Array.isArray(project.scheduler.waiting_source_ids) ? project.scheduler.waiting_source_ids : [];
            return waitingIds.includes(node.id);
        }

        function focusSchedulerProblem(step) {
            const node = getNode(step?.node_id);
            if (!node) return;
            setSelection(node);
            const rect = getNodeRect(node);
            if (!rect) return;
            centerViewportOnWorld(Number(rect.x || 0) + Number(rect.w || 0) / 2, Number(rect.y || 0) + Number(rect.h || 0) / 2);
        }

        function clearSchedulerBlockedState() {
            if (getProject().scheduler?.state !== 'blocked') return false;
            applyProjectSchedulerPatch(buildSchedulerResetPatch({ nowIso: () => nowIso() }), { merge: true });
            return true;
        }

        function setBlockedSchedulerFromPlan(plan, options) {
            const opts = options || {};
            const first = opts.first || firstBlockedSchedulerStep(plan);
            const missing = Array.isArray(plan?.steps)
                ? plan.steps.filter(step => Array.isArray(step.missing_inputs) && step.missing_inputs.length)
                : [];
            const cycleError = Array.isArray(plan?.cycles) && plan.cycles.length
                ? (plan.warnings?.find(item => String(item || '').includes('Cycle detected'))
                    || t('Cycle detected in run plan.', '运行计划中检测到循环。'))
                : '';
            const message = opts.message || (cycleError || (first
                ? t('Queue blocked at {node}: {inputs}', '队列阻塞于 {node}：{inputs}')
                    .replace('{node}', first.title || first.node_id)
                    .replace('{inputs}', schedulerStepMissingSummary(first))
                : t('Run plan has missing inputs.', '运行计划存在缺失输入。')));
            applyProjectSchedulerPatch(buildSchedulerBlockedState({
                plan,
                mode: plan?.mode || opts.mode || 'selected',
                nowIso: () => nowIso(),
                currentNodeId: first?.node_id || '',
                currentTitle: first?.title || '',
                steps: markBlockedSchedulerSteps(plan?.steps || []),
                warnings: cloneRunValue(plan?.warnings || [], []),
                cycles: cloneRunValue(plan?.cycles || [], []),
                error: cycleError || missing.map(step => `${step.title}: ${schedulerStepMissingSummary(step)}`).join('; ') || message
            }));
            refreshRunUi({ nodes: true, edges: true });
            if (first) focusSchedulerProblem(first);
            showToast(message, opts.durationMs || 4200);
            scheduleSave();
        }

        function setSchedulerWaitingFromPlan(plan, sourceIds) {
            const first = firstBlockedSchedulerStep(plan);
            const message = first
                ? t('Waiting for upstream Result before {node}: {inputs}', '正在等待 {node} 的上游 Result：{inputs}')
                    .replace('{node}', first.title || first.node_id || t('node', '节点'))
                    .replace('{inputs}', schedulerStepMissingSummary(first))
                : t('Waiting for upstream Result refresh...', '正在等待上游 Result 刷新...');
            applyProjectSchedulerPatch(buildSchedulerWaitingState({
                plan,
                nowIso: () => nowIso(),
                currentNodeId: first?.node_id || '',
                currentTitle: first?.title || '',
                waitingSourceIds: (sourceIds || []).filter(Boolean),
                steps: cloneRunValue(plan?.steps || [], []),
                warnings: cloneRunValue(plan?.warnings || [], []),
                error: message
            }));
            const node = getNode(first?.node_id);
            if (node) {
                Object.assign(node, buildCanvasNodeStatusPatch(node, {
                    status: buildCanvasRunStatus('waiting', message)
                }));
            }
            refreshRunUi({ nodes: true, edges: true });
            showToast(message, 3200);
            scheduleSave();
        }

        return {
            clearSchedulerBlockedState,
            schedulerStepMissingSummary,
            markBlockedSchedulerSteps,
            firstBlockedSchedulerStep,
            isNodeSchedulerBlocked,
            isNodeSchedulerWaiting,
            focusSchedulerProblem,
            setBlockedSchedulerFromPlan,
            setSchedulerWaitingFromPlan
        };
    }

    window.SimpAICanvasWorkbenchSchedulerState = Object.assign(
        {},
        window.SimpAICanvasWorkbenchSchedulerState || {},
        { createCanvasSchedulerStateController }
    );
})();
