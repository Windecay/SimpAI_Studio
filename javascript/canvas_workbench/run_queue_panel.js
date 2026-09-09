(function () {
    'use strict';

    const ACTIVE_STATES = new Set(['queued', 'waiting', 'running', 'rendering', 'task_ready', 'args_ready', 'dry_run_ready', 'cancelling', 'skipping', 'preparing', 'checking']);
    const TERMINAL_STATES = new Set(['finished', 'failed', 'canceled', 'skipped']);

    function getPanel(context) {
        return context && typeof context.getRunQueuePanel === 'function' ? context.getRunQueuePanel() : null;
    }

    function getProject(context) {
        const project = context && typeof context.getProject === 'function' ? context.getProject() : null;
        return project && typeof project === 'object' ? project : {};
    }

    function stateOf(value) {
        return String(value || '').trim().toLowerCase();
    }

    function isActiveState(value) {
        return ACTIVE_STATES.has(stateOf(value));
    }

    function isTerminalState(value) {
        return TERMINAL_STATES.has(stateOf(value));
    }

    function getRuns(context) {
        const project = getProject(context);
        return (Array.isArray(project.runs) ? project.runs : [])
            .slice()
            .sort((a, b) => {
                const aActive = isActiveState(a?.state) ? 1 : 0;
                const bActive = isActiveState(b?.state) ? 1 : 0;
                if (aActive !== bActive) return bActive - aActive;
                return String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || ''));
            });
    }

    function getRunResultNode(run, context) {
        const project = getProject(context);
        return context.getNode?.(run?.placeholder_node_id)
            || (Array.isArray(project.nodes) ? project.nodes.find(node => node.type === 'result' && node.producer?.run_id === run?.id) : null)
            || null;
    }

    function getRunProducerNode(run, context) {
        return context.getNode?.(run?.preset_node_id || run?.qwen_tts_node_id || run?.producer_node_id) || null;
    }

    function nodeTitle(node, fallback) {
        return node?.title || node?.preset?.display_name || node?.preset?.name || node?.id || fallback || 'Run';
    }

    function runTitle(run, context) {
        const producer = getRunProducerNode(run, context);
        const preview = run?.last_response?.task_preview || run?.task_preview || {};
        return nodeTitle(producer, preview.display_name || preview.preset || run?.mode || run?.id || 'Run');
    }

    function percentOf(run, resultNode) {
        const raw = run?.percent ?? resultNode?.status?.percent ?? 0;
        return Math.max(0, Math.min(1, Number(raw || 0)));
    }

    function latestQueueSize(runs, scheduler) {
        const activeRun = runs.find(run => isActiveState(run?.state));
        const response = activeRun?.last_response || {};
        const values = [
            activeRun?.queue_size,
            response.queue_size,
            activeRun?.queue_position,
            response.queue_position,
            scheduler?.queue_size
        ];
        for (const value of values) {
            const number = Number(value);
            if (Number.isFinite(number)) return number;
        }
        return null;
    }

    function schedulerSteps(context) {
        const scheduler = getProject(context).scheduler || {};
        return Array.isArray(scheduler.steps) ? scheduler.steps : [];
    }

    function stepState(step, index, scheduler) {
        const raw = stateOf(step?.state);
        if (raw && raw !== 'pending') return raw;
        const schedulerState = stateOf(scheduler?.state);
        const current = Number(scheduler?.index || 0);
        if (schedulerState === 'running') {
            if (index < current) return 'finished';
            if (index === current) return 'running';
        }
        if (schedulerState === 'waiting' && scheduler.current_node_id === step?.node_id) return 'waiting';
        if (schedulerState === 'blocked' && (Array.isArray(step?.missing_inputs) && step.missing_inputs.length)) return 'blocked';
        return raw || 'pending';
    }

    function schedulerSummary(context) {
        const scheduler = getProject(context).scheduler || {};
        const steps = schedulerSteps(context);
        const state = stateOf(scheduler.state || (steps.length ? 'planned' : 'idle'));
        const activeIndex = Number(scheduler.index || 0);
        const currentTitle = scheduler.current_title || (steps[activeIndex]?.title || '');
        return { scheduler, steps, state, activeIndex, currentTitle };
    }

    function stateBadge(state, context) {
        return `<b data-state="${context.escapeHtml(state || 'idle')}">${context.escapeHtml(state || 'idle')}</b>`;
    }

    function renderSummary(context, runs) {
        const { scheduler, steps, state, activeIndex } = schedulerSummary(context);
        const activeRuns = runs.filter(run => isActiveState(run?.state));
        const failedRuns = runs.filter(run => stateOf(run?.state) === 'failed');
        const queueSize = latestQueueSize(runs, scheduler);
        const stepText = steps.length
            ? `${Math.min(Math.max(activeIndex + 1, 1), steps.length)}/${steps.length}`
            : '-';
        return `
<div class="sai-run-queue-summary">
  <div><span>${context.escapeHtml(context.t('Scheduler', '链路'))}</span>${stateBadge(state, context)}<small>${context.escapeHtml(stepText)}</small></div>
  <div><span>${context.escapeHtml(context.t('Active', '活动'))}</span><strong>${activeRuns.length}</strong><small>${context.escapeHtml(context.t('run(s)', '任务'))}</small></div>
  <div><span>${context.escapeHtml(context.t('Backend Q', '后端队列'))}</span><strong>${queueSize === null ? '-' : context.escapeHtml(String(queueSize))}</strong><small>AsyncTask</small></div>
  <div><span>${context.escapeHtml(context.t('Failed', '失败'))}</span><strong>${failedRuns.length}</strong><small>${context.escapeHtml(context.t('recent', '最近'))}</small></div>
</div>`;
    }

    function renderScheduler(context) {
        const { scheduler, steps, state, activeIndex, currentTitle } = schedulerSummary(context);
        if (!steps.length) {
            return `<section class="sai-run-queue-section"><h3>${context.escapeHtml(context.t('Selected Chain', '选中链路'))}</h3><p class="sai-run-queue-empty-inline">${context.escapeHtml(context.t('No chain plan is active. Run a selected chain to see planned steps here.', '当前没有活动链路计划。运行选中链路后会在这里看到步骤。'))}</p></section>`;
        }
        const error = scheduler.error || '';
        return `
<section class="sai-run-queue-section">
  <div class="sai-run-queue-section-head">
    <h3>${context.escapeHtml(context.t('Selected Chain', '选中链路'))}</h3>
    <span>${context.escapeHtml(state)}${currentTitle ? ` · ${context.escapeHtml(currentTitle)}` : ''}</span>
  </div>
  ${error ? `<div class="sai-run-queue-message" data-state="${context.escapeHtml(state)}">${context.escapeHtml(error)}</div>` : ''}
  <div class="sai-run-queue-steps">
    ${steps.map((step, index) => {
        const rowState = stepState(step, index, scheduler);
        const missing = Array.isArray(step.missing_inputs) && step.missing_inputs.length ? step.missing_inputs.join(', ') : '';
        const current = index === activeIndex && ['running', 'waiting'].includes(state);
        return `<button type="button" class="${current ? 'is-current' : ''}" data-run-queue-node="${context.escapeHtml(step.node_id || '')}">
          <i>${index + 1}</i>
          <span>${stateBadge(rowState, context)}<strong>${context.escapeHtml(step.title || step.node_id || 'node')}</strong></span>
          <small>${context.escapeHtml(missing || step.type || '')}</small>
        </button>`;
    }).join('')}
  </div>
</section>`;
    }

    function renderRunCard(run, context) {
        const resultNode = getRunResultNode(run, context);
        const producer = getRunProducerNode(run, context);
        const state = stateOf(run?.state || resultNode?.status?.state || 'unknown');
        const active = isActiveState(state);
        const percent = percentOf(run, resultNode);
        const response = run?.last_response || {};
        const queueSize = run?.queue_size ?? response.queue_size ?? resultNode?.status?.queue_position ?? '';
        const isQwen = run?.producer_type === 'qwen_tts' || !!run?.qwen_tts_node_id || !!resultNode?.producer?.qwen_tts_node_id;
        const canStop = active && !!resultNode;
        const canSkip = canStop && !isQwen;
        const canRetry = isTerminalState(state) && !!resultNode && !!(resultNode.producer?.preset_node_id || resultNode.producer?.qwen_tts_node_id);
        const message = run?.message || resultNode?.status?.message || response.message || '';
        const updated = run?.updated_at || run?.created_at || '';
        const title = runTitle(run, context);
        return `
<article class="sai-run-queue-card" data-state="${context.escapeHtml(state)}">
  <div class="sai-run-queue-card-head">
    ${stateBadge(state, context)}
    <strong>${context.escapeHtml(title)}</strong>
    <small>${context.escapeHtml(context.formatLocalTime(updated))}</small>
  </div>
  <div class="sai-run-queue-progress"><i style="width:${Math.round(percent * 100)}%"></i></div>
  <div class="sai-run-queue-meta">
    <span>${context.escapeHtml(context.t('Progress', '进度'))}: ${Math.round(percent * 100)}%</span>
    <span>${context.escapeHtml(context.t('Queue', '队列'))}: ${queueSize === '' || queueSize === null || queueSize === undefined ? '-' : context.escapeHtml(String(queueSize))}</span>
    <span>${context.escapeHtml(context.t('Outputs', '输出'))}: ${context.escapeHtml(String(run?.output_count ?? response.output_count ?? (Array.isArray(resultNode?.assets) ? resultNode.assets.length : (resultNode?.asset ? 1 : 0))))}</span>
  </div>
  ${message ? `<p>${context.escapeHtml(message)}</p>` : ''}
  <div class="sai-run-queue-actions">
    <button type="button" data-run-queue-action="locate-result" data-run-id="${context.escapeHtml(run.id || '')}" ${resultNode ? '' : 'disabled'}><i class="fa-solid fa-crosshairs"></i><span>${context.escapeHtml(context.t('Result', '结果'))}</span></button>
    <button type="button" data-run-queue-action="locate-producer" data-run-id="${context.escapeHtml(run.id || '')}" ${producer ? '' : 'disabled'}><i class="fa-solid fa-diagram-project"></i><span>${context.escapeHtml(context.t('Node', '节点'))}</span></button>
    ${canStop ? `<button type="button" data-run-queue-action="stop-run" data-run-id="${context.escapeHtml(run.id || '')}"><i class="fa-solid fa-stop"></i><span>${context.escapeHtml(context.t('Stop', '停止'))}</span></button>` : ''}
    ${canSkip ? `<button type="button" data-run-queue-action="skip-run" data-run-id="${context.escapeHtml(run.id || '')}"><i class="fa-solid fa-forward-step"></i><span>${context.escapeHtml(context.t('Skip', '跳过'))}</span></button>` : ''}
    ${canRetry ? `<button type="button" data-run-queue-action="retry-run" data-run-id="${context.escapeHtml(run.id || '')}"><i class="fa-solid fa-rotate-right"></i><span>${context.escapeHtml(context.t('Retry', '重试'))}</span></button>` : ''}
    <button type="button" data-run-queue-action="history-run" data-run-id="${context.escapeHtml(run.id || '')}"><i class="fa-solid fa-clock-rotate-left"></i><span>${context.escapeHtml(context.t('History', '历史'))}</span></button>
  </div>
</article>`;
    }

    function renderRuns(context, runs) {
        const active = runs.filter(run => isActiveState(run?.state));
        const recent = runs.filter(run => !isActiveState(run?.state)).slice(0, 8);
        return `
<section class="sai-run-queue-section">
  <div class="sai-run-queue-section-head">
    <h3>${context.escapeHtml(context.t('Live Runs', '实时任务'))}</h3>
    <span>${active.length}</span>
  </div>
  <div class="sai-run-queue-list">${active.length ? active.map(run => renderRunCard(run, context)).join('') : `<p class="sai-run-queue-empty-inline">${context.escapeHtml(context.t('No active canvas runs.', '当前没有活动画布任务。'))}</p>`}</div>
</section>
<section class="sai-run-queue-section">
  <div class="sai-run-queue-section-head">
    <h3>${context.escapeHtml(context.t('Recent Runs', '最近任务'))}</h3>
    <span>${recent.length}</span>
  </div>
  <div class="sai-run-queue-list is-recent">${recent.length ? recent.map(run => renderRunCard(run, context)).join('') : `<p class="sai-run-queue-empty-inline">${context.escapeHtml(context.t('No recent finished runs yet.', '还没有最近完成的任务。'))}</p>`}</div>
</section>`;
    }

    function openPanel(context) {
        const panel = getPanel(context);
        if (!panel) return;
        if (!panel.hidden) {
            closePanel(context);
            return;
        }
        context.closeCanvasSettingsPanel?.();
        context.closeRunHistoryPanel?.();
        panel.hidden = false;
        renderPanel(context);
    }

    function closePanel(context) {
        const panel = getPanel(context);
        if (panel) panel.hidden = true;
    }

    function renderPanel(context) {
        const panel = getPanel(context);
        if (!panel) return;
        const runs = getRuns(context);
        panel.innerHTML = `
<div class="sai-run-queue-head">
  <strong>${context.escapeHtml(context.t('Run Queue', '运行队列'))}</strong>
  <div>
    <button type="button" data-run-queue-action="refresh" title="${context.escapeHtml(context.t('Refresh', '刷新'))}"><i class="fa-solid fa-rotate"></i></button>
    <button type="button" data-run-queue-action="close" title="${context.escapeHtml(context.t('Close', '关闭'))}"><i class="fa-solid fa-xmark"></i></button>
  </div>
</div>
<div class="sai-run-queue-body">
  ${renderSummary(context, runs)}
  ${renderScheduler(context)}
  ${renderRuns(context, runs)}
</div>`;
    }

    function findRun(context, runId) {
        const project = getProject(context);
        return (Array.isArray(project.runs) ? project.runs : []).find(item => item.id === runId) || null;
    }

    function handleAction(button, context) {
        const action = button.getAttribute('data-run-queue-action');
        if (action === 'close') {
            closePanel(context);
            return;
        }
        if (action === 'refresh') {
            renderPanel(context);
            return;
        }
        const nodeId = button.getAttribute('data-run-queue-node');
        if (nodeId) {
            const node = context.getNode?.(nodeId);
            if (node) context.selectAndFitNode?.(node);
            return;
        }
        const runId = button.getAttribute('data-run-id') || '';
        const run = findRun(context, runId);
        if (!run) return;
        const resultNode = getRunResultNode(run, context);
        const producer = getRunProducerNode(run, context);
        if (action === 'locate-result' && resultNode) {
            context.selectAndFitNode?.(resultNode);
        } else if (action === 'locate-producer' && producer) {
            context.selectAndFitNode?.(producer);
        } else if (action === 'stop-run' && resultNode) {
            context.controlResultRun?.(resultNode, 'stop');
        } else if (action === 'skip-run' && resultNode) {
            context.controlResultRun?.(resultNode, 'skip');
        } else if (action === 'retry-run' && resultNode) {
            context.retryResultRun?.(resultNode);
        } else if (action === 'history-run') {
            context.openRunHistoryPanel?.(run.id);
        }
    }

    window.SimpAICanvasWorkbenchRunQueuePanel = {
        openPanel,
        closePanel,
        renderPanel,
        handleAction
    };
})();
