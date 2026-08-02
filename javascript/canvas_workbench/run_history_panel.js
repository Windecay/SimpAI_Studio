(function () {
    'use strict';

    function getPanel(context) {
        return context && typeof context.getRunHistoryPanel === 'function' ? context.getRunHistoryPanel() : null;
    }

    function getSelectedId(context) {
        return context && typeof context.getRunHistorySelectedId === 'function' ? context.getRunHistorySelectedId() : null;
    }

    function setSelectedId(context, id) {
        if (context && typeof context.setRunHistorySelectedId === 'function') {
            context.setRunHistorySelectedId(id || null);
        }
    }

    function getSortedRuns(context) {
        const project = context.project || {};
        return (Array.isArray(project.runs) ? project.runs : [])
            .slice()
            .sort((a, b) => String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || '')));
    }

    function getRunResultNode(run, context) {
        const project = context.project || {};
        return context.getNode?.(run?.placeholder_node_id)
            || (Array.isArray(project.nodes) ? project.nodes.find(node => node.type === 'result' && node.producer?.run_id === run?.id) : null)
            || null;
    }

    function getRunPresetNode(run, context) {
        return context.getNode?.(run?.preset_node_id || run?.qwen_tts_node_id || run?.producer_node_id) || null;
    }

    function getRunEvents(run, context) {
        const node = getRunResultNode(run, context);
        if (Array.isArray(run?.events) && run.events.length) return run.events;
        if (Array.isArray(run?.last_response?.events) && run.last_response.events.length) return run.last_response.events;
        if (Array.isArray(node?.run_events) && node.run_events.length) return node.run_events;
        return [];
    }

    function getRunErrorText(run) {
        const response = run?.last_response || {};
        const parts = [];
        [run?.error, response.error, response.details].forEach((item) => {
            if (item && !parts.includes(String(item))) parts.push(String(item));
        });
        const errors = Array.isArray(run?.errors) ? run.errors : (Array.isArray(response.errors) ? response.errors : []);
        errors.forEach((item) => {
            if (!item) return;
            const text = typeof item === 'string' ? item : [item.slot, item.node_id, item.error].filter(Boolean).join(': ');
            if (text && !parts.includes(text)) parts.push(text);
        });
        return parts.join('\n');
    }

    function getRunDurationText(run) {
        const start = Date.parse(run?.created_at || '');
        const end = Date.parse(run?.finished_at || run?.updated_at || '');
        if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return '';
        const seconds = Math.max(0, Math.round((end - start) / 1000));
        if (seconds < 60) return `${seconds}s`;
        const minutes = Math.floor(seconds / 60);
        return `${minutes}m ${seconds % 60}s`;
    }

    function runStateLabel(value) {
        const state = String(value || 'unknown').toLowerCase();
        const labels = {
            queued: t('queued', '排队中'),
            running: t('running', '运行中'),
            waiting: t('waiting', '等待中'),
            cancelling: t('cancelling', '正在取消'),
            cancelled: t('cancelled', '已取消'),
            stopped: t('stopped', '已停止'),
            finished: t('finished', '已完成'),
            completed: t('completed', '已完成'),
            failed: t('failed', '失败'),
            unknown: t('unknown', '未知')
        };
        return labels[state] || value || labels.unknown;
    }

    function openPanel(runId, context) {
        const panel = getPanel(context);
        if (!panel) return;
        if (!runId && !panel.hidden) {
            closePanel(context);
            return;
        }
        const runs = getSortedRuns(context);
        setSelectedId(context, runId || getSelectedId(context) || runs[0]?.id || null);
        context.closeCanvasSettingsPanel?.();
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
        const t = context.t;
        const escapeHtml = context.escapeHtml;
        const runs = getSortedRuns(context);
        if (!runs.length) {
            panel.innerHTML = `
<div class="sai-run-history-head">
  <strong>${escapeHtml(t('Run History', '运行历史'))}</strong>
  <button type="button" data-run-history-action="close" title="${escapeHtml(t('Close', '关闭'))}"><i class="fa-solid fa-xmark"></i></button>
</div>
<div class="sai-run-history-empty">${escapeHtml(t('No canvas run history yet. Run any preset to show task status, outputs, and events here.', '还没有画布运行记录。运行任意 preset 后，这里会显示任务状态、输出和事件。'))}</div>`;
            return;
        }
        let selectedId = getSelectedId(context);
        if (!selectedId || !runs.some(run => run.id === selectedId)) {
            selectedId = runs[0].id;
            setSelectedId(context, selectedId);
        }
        const selectedRun = runs.find(run => run.id === selectedId) || runs[0];
        const selectedNode = getRunResultNode(selectedRun, context);
        const selectedPreset = getRunPresetNode(selectedRun, context);
        const selectedProducerActionLabel = selectedRun.producer_type === 'qwen_tts'
            ? t('Select Qwen TTS', '选择 Qwen TTS')
            : t('Select Preset', '选择预设');
        const selectedProducerIcon = selectedRun.producer_type === 'qwen_tts' ? 'fa-microphone-lines' : 'fa-diagram-project';
        const response = selectedRun.last_response || {};
        const preview = response.task_preview || selectedRun.task_preview || {};
        const events = getRunEvents(selectedRun, context).slice(-16).reverse();
        const errorText = getRunErrorText(selectedRun);
        const outputCount = selectedRun.output_count ?? (Array.isArray(response.assets) ? response.assets.length : (selectedNode?.asset ? 1 : 0));
        const inputCount = selectedRun.input_count ?? (Array.isArray(response.task_preview?.upload_fields) ? response.task_preview.upload_fields.length : 0);
        panel.innerHTML = `
<div class="sai-run-history-head">
  <strong>${escapeHtml(t('Run History', '运行历史'))}</strong>
  <button type="button" data-run-history-action="close" title="${escapeHtml(t('Close', '关闭'))}"><i class="fa-solid fa-xmark"></i></button>
</div>
<div class="sai-run-history-body">
  <div class="sai-run-history-list">
    ${runs.map(run => {
        const node = getRunResultNode(run, context);
        const preset = getRunPresetNode(run, context);
        const itemPreview = run.last_response?.task_preview || run.task_preview || {};
        const state = run.state || node?.status?.state || 'unknown';
        const active = !context.isTerminalRunState(state);
        return `<button type="button" data-run-history-select="${escapeHtml(run.id)}" class="${run.id === selectedRun.id ? 'is-active' : ''}">
          <span><b data-state="${escapeHtml(state)}">${escapeHtml(runStateLabel(state))}</b>${active ? `<i>${escapeHtml(t('live', '实时'))}</i>` : ''}</span>
          <strong>${escapeHtml(preset?.title || itemPreview.display_name || itemPreview.preset || (run.producer_type === 'qwen_tts' ? 'Qwen TTS' : t('Preset', '预设')))}</strong>
          <small>${escapeHtml(context.formatLocalTime(run.updated_at || run.created_at))}</small>
        </button>`;
    }).join('')}
  </div>
  <div class="sai-run-history-detail">
    <div class="sai-run-history-title">
      <h3>${escapeHtml(selectedPreset?.title || preview.display_name || preview.preset || (selectedRun.producer_type === 'qwen_tts' ? t('Qwen TTS Run', 'Qwen TTS 运行记录') : t('Canvas Run', '画布运行记录')))}</h3>
      <span data-state="${escapeHtml(selectedRun.state || 'unknown')}">${escapeHtml(runStateLabel(selectedRun.state))}</span>
    </div>
    <div class="sai-run-history-grid">
      <div><span>${escapeHtml(t('Run ID', '运行 ID'))}</span><code>${escapeHtml(selectedRun.id || '')}</code></div>
      <div><span>${escapeHtml(t('Task ID', '任务 ID'))}</span><code>${escapeHtml(selectedRun.task_id || response.task_id || '')}</code></div>
      <div><span>${escapeHtml(t('Task Method', '任务方式'))}</span><b>${escapeHtml(preview.task_method || '')}</b></div>
      <div><span>${escapeHtml(t('Seed', '种子'))}</span><b>${escapeHtml(selectedRun.resolved_seed ?? response.resolved_seed ?? '')}</b></div>
      <div><span>${escapeHtml(t('Inputs', '输入'))}</span><b>${escapeHtml(inputCount)}</b></div>
      <div><span>${escapeHtml(t('Outputs', '输出'))}</span><b>${escapeHtml(outputCount)}</b></div>
      <div><span>${escapeHtml(t('Started', '开始时间'))}</span><b>${escapeHtml(context.formatLocalTime(selectedRun.created_at))}</b></div>
      <div><span>${escapeHtml(t('Duration', '时长'))}</span><b>${escapeHtml(getRunDurationText(selectedRun))}</b></div>
    </div>
    <div class="sai-run-history-message">${escapeHtml(selectedRun.message || selectedNode?.status?.message || response.message || '')}</div>
    ${errorText ? `<div class="sai-run-history-error"><div><strong>${escapeHtml(t('Error Details', '错误详情'))}</strong><button type="button" data-run-history-action="copy-error" title="${escapeHtml(t('Copy error', '复制错误'))}"><i class="fa-solid fa-copy"></i></button></div><pre>${escapeHtml(errorText)}</pre></div>` : ''}
    <div class="sai-run-history-actions">
      <button type="button" data-run-history-action="locate" ${selectedNode ? '' : 'disabled'}><i class="fa-solid fa-crosshairs"></i><span>${escapeHtml(t('Locate Result', '定位结果'))}</span></button>
      <button type="button" data-run-history-action="select-preset" ${selectedPreset ? '' : 'disabled'}><i class="fa-solid ${selectedProducerIcon}"></i><span>${escapeHtml(selectedProducerActionLabel)}</span></button>
    </div>
    <div class="sai-run-history-events">
      <h3>${escapeHtml(t('Run Events', '运行事件'))}</h3>
      ${events.length ? events.map(event => `<div class="sai-run-event" data-level="${escapeHtml(event.level || 'info')}">
        <span>${escapeHtml(event.ts || '')}</span>
        <b>${escapeHtml(event.level || 'info')}</b>
        <p>${escapeHtml(event.message || '')}</p>
      </div>`).join('') : `<p class="sai-run-history-empty-inline">${escapeHtml(t('No events captured for this run.', '本次运行没有捕获事件。'))}</p>`}
    </div>
  </div>
</div>`;
    }

    function handleAction(button, context) {
        const selected = button.getAttribute('data-run-history-select');
        if (selected) {
            setSelectedId(context, selected);
            renderPanel(context);
            return;
        }
        const action = button.getAttribute('data-run-history-action');
        const project = context.project || {};
        const run = (Array.isArray(project.runs) ? project.runs : []).find(item => item.id === getSelectedId(context));
        if (action === 'close') {
            closePanel(context);
        } else if (action === 'locate' && run) {
            const node = getRunResultNode(run, context);
            if (node) context.selectAndFitNode?.(node);
        } else if (action === 'select-preset' && run) {
            const node = getRunPresetNode(run, context);
            if (node) context.selectAndFitNode?.(node);
        } else if (action === 'copy-error' && run) {
            const text = getRunErrorText(run);
            if (!text) return;
            navigator.clipboard?.writeText(text).then(
                () => context.showToast(t('Error details copied', '错误详情已复制')),
                () => context.showToast(t('Copy failed; please select the error text manually.', '复制失败，请手动选择错误文本'))
            );
        }
    }

    window.SimpAICanvasWorkbenchRunHistoryPanel = {
        openPanel,
        closePanel,
        renderPanel,
        handleAction
    };
})();
