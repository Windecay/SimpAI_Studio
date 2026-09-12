(function () {
    'use strict';

    const EXTRA_ACTIVE_STATES = new Set(['rendering', 'preparing', 'checking']);
    const FALLBACK_ACTIVE_STATES = new Set(['queued', 'running', 'waiting', 'task_ready', 'args_ready', 'dry_run_ready', 'cancelling', 'skipping']);
    const TERMINAL_STATES = new Set(['finished', 'failed', 'canceled', 'skipped']);

    function createCanvasRunStatusController(context) {
        const scope = context || {};
        const t = typeof scope.t === 'function' ? scope.t : ((en, cn) => cn || en);
        const cloneRunValue = typeof scope.cloneRunValue === 'function'
            ? scope.cloneRunValue
            : (value, fallback) => {
                try {
                    return JSON.parse(JSON.stringify(value ?? fallback));
                } catch (err) {
                    return fallback;
                }
            };
        const escapeHtml = typeof scope.escapeHtml === 'function'
            ? scope.escapeHtml
            : (value) => String(value ?? '').replace(/[&<>\"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;' }[char]));
        const getProject = () => typeof scope.getProject === 'function' ? (scope.getProject() || {}) : {};
        const getWindow = () => typeof scope.getWindow === 'function'
            ? (scope.getWindow() || {})
            : (typeof window !== 'undefined' ? window : {});
        const clampValue = (value, min, max) => typeof scope.clamp === 'function'
            ? scope.clamp(value, min, max)
            : Math.max(min, Math.min(max, value));
        const isStandalone = () => typeof scope.isStandaloneCanvasWorkbench === 'function'
            ? !!scope.isStandaloneCanvasWorkbench()
            : false;
        const formatLocalTime = (value) => typeof scope.formatLocalTime === 'function'
            ? scope.formatLocalTime(value)
            : String(value || '');
        const isTerminalRunState = (state) => typeof scope.isTerminalRunState === 'function'
            ? !!scope.isTerminalRunState(state)
            : TERMINAL_STATES.has(String(state || '').toLowerCase());
        const getElement = (name) => typeof scope[name] === 'function' ? scope[name]() : null;
        const getNode = (id) => typeof scope.getNode === 'function' ? scope.getNode(id) : null;
        const now = () => typeof scope.now === 'function' ? Number(scope.now()) : Date.now();
        const fetchStatus = (...args) => {
            if (typeof scope.fetchStatus === 'function') return scope.fetchStatus(...args);
            if (typeof fetch === 'function') return fetch(...args);
            throw new Error('status fetch is unavailable');
        };
        const setIntervalFn = (...args) => {
            if (typeof scope.setInterval === 'function') return scope.setInterval(...args);
            const win = getWindow();
            return typeof win.setInterval === 'function' ? win.setInterval(...args) : 0;
        };
        const clearIntervalFn = (...args) => {
            if (typeof scope.clearInterval === 'function') return scope.clearInterval(...args);
            const win = getWindow();
            if (typeof win.clearInterval === 'function') return win.clearInterval(...args);
        };
        let standaloneStatusTimer = 0;
        let standaloneStatusInFlight = false;
        const backendAlertState = {
            state: '',
            message: '',
            endpoint: '',
            updatedAt: 0
        };

        function buildCanvasRunStatus(state, message, options) {
            const config = options || {};
            const status = {
                state,
                message: message || ''
            };
            if (Object.prototype.hasOwnProperty.call(config, 'queuePosition')) {
                status.queue_position = config.queuePosition;
            }
            if (Object.prototype.hasOwnProperty.call(config, 'step')) {
                status.step = config.step;
            }
            if (Object.prototype.hasOwnProperty.call(config, 'totalSteps')) {
                status.total_steps = config.totalSteps;
            }
            if (Object.prototype.hasOwnProperty.call(config, 'percent')) {
                status.percent = clampValue(Number(config.percent ?? 0), 0, 1);
            }
            return status;
        }

        function mergeCanvasRunStatus(previous, state, message, options) {
            return Object.assign({}, previous || {}, buildCanvasRunStatus(state, message, options));
        }

        function buildCanvasNodeStatusPatch(node, options) {
            if (!node) return {};
            const config = options || {};
            const hasOwn = (key) => Object.prototype.hasOwnProperty.call(config, key);
            const isRecord = (value) => value && typeof value === 'object' && !Array.isArray(value);

            if (hasOwn('status')) {
                return { status: cloneRunValue(config.status, config.status) };
            }

            if (!hasOwn('state') && !hasOwn('message') && !isRecord(config.statusPatch) && !Array.isArray(config.deleteKeys)) {
                return { status: cloneRunValue(node.status, node.status) };
            }

            const status = isRecord(node.status) ? cloneRunValue(node.status, {}) : {};
            if (hasOwn('state')) status.state = cloneRunValue(config.state, '');
            if (hasOwn('message')) status.message = cloneRunValue(config.message, '');
            if (isRecord(config.statusPatch)) Object.assign(status, cloneRunValue(config.statusPatch, {}));
            (Array.isArray(config.deleteKeys) ? config.deleteKeys : []).forEach((key) => {
                const name = String(key || '').trim();
                if (name) delete status[name];
            });
            return { status: cloneRunValue(status, {}) };
        }

        function isRunQueueActiveState(state) {
            const normalized = String(state || '').toLowerCase();
            const baseActive = typeof scope.isCanvasRunActiveState === 'function'
                ? !!scope.isCanvasRunActiveState(normalized)
                : FALLBACK_ACTIVE_STATES.has(normalized);
            return baseActive || EXTRA_ACTIVE_STATES.has(normalized);
        }

        function runQueueRunResultNode(run) {
            const project = getProject();
            return getNode(run?.placeholder_node_id)
                || (Array.isArray(project.nodes) ? project.nodes.find(node => node.type === 'result' && node.producer?.run_id === run?.id) : null)
                || null;
        }

        function runQueueRunPercent(run) {
            const resultNode = runQueueRunResultNode(run);
            return clampValue(Number(run?.percent ?? resultNode?.status?.percent ?? 0), 0, 1);
        }

        function latestRunQueueSize(runs) {
            const project = getProject();
            const activeRun = (runs || []).find(run => isRunQueueActiveState(run?.state));
            const response = activeRun?.last_response || {};
            const values = [
                activeRun?.queue_size,
                response.queue_size,
                activeRun?.queue_position,
                response.queue_position,
                project.scheduler?.queue_size
            ];
            for (const value of values) {
                const number = Number(value);
                if (Number.isFinite(number)) return number;
            }
            return null;
        }

        function runQueueWidgetSummary() {
            const project = getProject();
            const runs = (Array.isArray(project.runs) ? project.runs : []).slice()
                .sort((a, b) => String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || '')));
            const activeRuns = runs.filter(run => isRunQueueActiveState(run?.state));
            const failedRuns = runs.filter(run => String(run?.state || '').toLowerCase() === 'failed');
            const latestActive = activeRuns[0] || null;
            const latestRun = runs[0] || null;
            const scheduler = project.scheduler || {};
            const steps = Array.isArray(scheduler.steps) ? scheduler.steps : [];
            const schedulerState = String(scheduler.state || '').toLowerCase();
            const total = Math.max(0, Number(scheduler.total || steps.length || 0));
            const rawIndex = Math.max(0, Number(scheduler.index || 0));
            const currentStep = total ? Math.min(rawIndex + 1, total) : 0;
            const activePercent = latestActive ? runQueueRunPercent(latestActive) : 0;
            let state = activeRuns.length ? 'running' : (schedulerState || (latestRun?.state ? String(latestRun.state).toLowerCase() : 'idle'));
            let percent = latestActive ? activePercent : 0;
            let detail = activeRuns.length
                ? t('{count} active', '{count} 个活动').replace('{count}', String(activeRuns.length))
                : t('Idle', '空闲');
            const schedulerVisible = total && (['running', 'waiting', 'blocked', 'failed'].includes(schedulerState) || (!activeRuns.length && schedulerState === 'finished'));
            if (schedulerVisible) {
                if (schedulerState === 'finished') {
                    state = 'finished';
                    percent = 1;
                } else if (schedulerState === 'running') {
                    state = 'running';
                    percent = clampValue((rawIndex + activePercent) / total, 0, 1);
                } else if (['waiting', 'blocked', 'failed'].includes(schedulerState)) {
                    state = schedulerState;
                    percent = clampValue(rawIndex / total, 0, 1);
                }
                detail = `${currentStep}/${total} ${schedulerState || t('planned', '已计划')}`;
            } else if (!activeRuns.length && latestRun && isTerminalRunState(latestRun.state)) {
                state = String(latestRun.state || 'finished').toLowerCase();
                percent = state === 'finished' ? 1 : runQueueRunPercent(latestRun);
                detail = latestRun.updated_at ? formatLocalTime(latestRun.updated_at) : state;
            }
            return {
                state: state || 'idle',
                percent: clampValue(percent, 0, 1),
                detail,
                activeCount: activeRuns.length,
                failedCount: failedRuns.length,
                queueSize: latestRunQueueSize(runs)
            };
        }

        function renderRunQueueWidget() {
            const widget = getElement('getRunQueueWidget');
            if (!widget) return;
            const panel = getElement('getRunQueuePanel');
            const summary = runQueueWidgetSummary();
            const percentText = `${Math.round(summary.percent * 100)}%`;
            const queueText = summary.queueSize === null ? '-' : String(summary.queueSize);
            const title = [
                t('Run queue', '运行队列'),
                summary.detail,
                `${t('Progress', '进度')}: ${percentText}`,
                `${t('Active', '活动')}: ${summary.activeCount}`,
                `${t('Backend queue', '后端队列')}: ${queueText}`
            ].join(' / ');
            widget.dataset.state = summary.state;
            widget.classList.toggle('is-open', !!(panel && !panel.hidden));
            widget.title = title;
            widget.setAttribute('aria-label', title);
            widget.innerHTML = `
<span class="sai-run-queue-widget-icon"><i class="fa-solid fa-list-check" aria-hidden="true"></i></span>
<span class="sai-run-queue-widget-main">
  <strong>${escapeHtml(t('Run Queue', '运行队列'))}</strong>
  <small>${escapeHtml(summary.detail)}</small>
</span>
<span class="sai-run-queue-widget-side">
  <b>${escapeHtml(percentText)}</b>
  <small>Q ${escapeHtml(queueText)}</small>
</span>
<span class="sai-run-queue-widget-bar" aria-hidden="true"><i style="width:${escapeHtml(percentText)}"></i></span>`;
        }

        function parseStandaloneStatusPayload(result) {
            const parts = String(Array.isArray(result?.data) ? (result.data[0] || '') : '').split(',');
            const [
                timestampStr,
                queueSizeStr,
                vramTotalStr,
                ramTotalStr,
                vramUsedStr,
                ramUsedStr,
                onlineUsersStr,
                onlineDomainUsersStr,
                onlineNodesStr,
                pendingAccessCountStr,
                isAdminStr
            ] = parts;
            const numberOrNull = (value) => {
                const number = Number(value);
                return Number.isFinite(number) ? number : null;
            };
            if (!parts.length || numberOrNull(timestampStr) === null) return null;
            return {
                statusType: 'connected',
                timestamp: numberOrNull(timestampStr),
                queueSize: numberOrNull(queueSizeStr),
                ramUsed: numberOrNull(ramUsedStr),
                ramTotal: numberOrNull(ramTotalStr),
                vramUsed: numberOrNull(vramUsedStr),
                vramTotal: numberOrNull(vramTotalStr),
                onlineUsers: numberOrNull(onlineUsersStr),
                onlineDomainUsers: numberOrNull(onlineDomainUsersStr),
                onlineNodes: numberOrNull(onlineNodesStr),
                pendingAccessCount: numberOrNull(pendingAccessCountStr) || 0,
                isAdmin: String(isAdminStr || '0') === '1',
                updatedAt: now()
            };
        }

        async function fetchStandaloneStatusPayload() {
            const headers = { 'Content-Type': 'application/json' };
            let response = await fetchStatus('/gradio_api/run/get_start_timestamp', {
                method: 'POST',
                credentials: 'same-origin',
                headers,
                body: JSON.stringify({ data: [] })
            });
            if (!response.ok) {
                response = await fetchStatus('/gradio_api/run/predict', {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers,
                    body: JSON.stringify({ fn_index: 0, data: [] })
                });
            }
            if (!response.ok) throw new Error(`status request failed: ${response.status}`);
            return parseStandaloneStatusPayload(await response.json());
        }

        function publishStandaloneStatus(data) {
            const next = data || {
                statusType: 'disconnected',
                queueSize: 0,
                updatedAt: now()
            };
            const win = getWindow();
            win.SimpAIStatusMonitorData = Object.assign({}, win.SimpAIStatusMonitorData || {}, next);
            if (typeof win.dispatchEvent === 'function') {
                const EventCtor = win.CustomEvent || (typeof CustomEvent === 'function' ? CustomEvent : null);
                if (EventCtor) win.dispatchEvent(new EventCtor('simpai:status-monitor-updated', { detail: win.SimpAIStatusMonitorData }));
            }
        }

        async function refreshStandaloneStatus() {
            if (!isStandalone() || standaloneStatusInFlight) return;
            standaloneStatusInFlight = true;
            try {
                const data = await fetchStandaloneStatusPayload();
                publishStandaloneStatus(data || null);
            } catch (err) {
                publishStandaloneStatus(null);
            } finally {
                standaloneStatusInFlight = false;
            }
        }

        function startStandaloneStatusMonitor() {
            if (!isStandalone() || standaloneStatusTimer) return;
            refreshStandaloneStatus();
            standaloneStatusTimer = setIntervalFn(refreshStandaloneStatus, 2000);
        }

        function stopStandaloneStatusMonitor() {
            if (!standaloneStatusTimer) return;
            clearIntervalFn(standaloneStatusTimer);
            standaloneStatusTimer = 0;
        }

        function renderSystemInfo() {
            const systemInfo = getElement('getSystemInfoElement');
            if (!systemInfo) return;
            const project = getProject();
            const data = getWindow().SimpAIStatusMonitorData || {};
            const percentValue = (used, total) => {
                const u = Number(used || 0);
                const tValue = Number(total || 0);
                if (!Number.isFinite(u) || !Number.isFinite(tValue) || tValue <= 0) return null;
                return Math.max(0, Math.min(100, Math.round((u / tValue) * 100)));
            };
            const pct = (used, total) => {
                const value = percentValue(used, total);
                return value === null ? '--' : `${value}%`;
            };
            const usageChip = (label, used, total) => {
                const value = percentValue(used, total);
                const display = value === null ? '--' : `${value}%`;
                return `<span class="sai-system-usage-chip" style="--usage:${escapeHtml(String(value ?? 0))}%"><b>${escapeHtml(label)}</b>${escapeHtml(display)}</span>`;
            };
            const state = String(data.statusType || '').toLowerCase();
            const stateLabel = state === 'connected'
                ? t('Online', '在线')
                : (state === 'disconnected'
                    ? t('Disconnected', '断开')
                    : (state === 'exception' ? t('Exception', '异常') : t('Status waiting', '等待状态')));
            if (state === 'connected') {
                setCanvasBackendAlert('', '');
            } else if (state === 'disconnected' || state === 'exception') {
                setCanvasBackendAlert(
                    state,
                    state === 'exception'
                        ? t('Backend exception. Generation, VLM chat, and project bridge calls may fail until the backend is restarted.', '后端异常。生成、VLM 聊天和工程桥接调用可能失败，需要重启或恢复后端。')
                        : t('Backend disconnected. Generation, VLM chat, and project bridge calls are unavailable until the backend reconnects.', '后端已断开。生成、VLM 聊天和工程桥接调用暂不可用，等待后端重连。')
                );
            }
            const queue = Number.isFinite(Number(data.queueSize)) ? Number(data.queueSize) : 0;
            const onlineUsers = Number.isFinite(Number(data.onlineUsers)) ? Number(data.onlineUsers) : null;
            const onlineDomainUsers = Number.isFinite(Number(data.onlineDomainUsers)) ? Number(data.onlineDomainUsers) : 0;
            const onlineNodes = Number.isFinite(Number(data.onlineNodes)) ? Number(data.onlineNodes) : 0;
            const usersLabel = onlineUsers === null
                ? '--'
                : (onlineDomainUsers ? `${onlineUsers}/${onlineDomainUsers}` : String(onlineUsers));
            const rows = [
                `<span class="sai-system-state" data-state="${escapeHtml(state || 'waiting')}">${escapeHtml(stateLabel)}</span>`,
                `<span>Q ${escapeHtml(String(queue))}</span>`,
                usageChip('VRAM', data.vramUsed, data.vramTotal),
                usageChip('RAM', data.ramUsed, data.ramTotal),
                `<span>${escapeHtml(t('Users', '用户'))} ${escapeHtml(usersLabel)}</span>`
            ];
            if (onlineNodes) rows.push(`<span>${escapeHtml(t('Online nodes', '在线节点'))} ${escapeHtml(String(onlineNodes))}</span>`);
            systemInfo.innerHTML = rows.join('');
            systemInfo.setAttribute('aria-label', [
                t('System status', '系统状态'),
                `${t('Queue', '队列')}: ${queue}`,
                `VRAM: ${pct(data.vramUsed, data.vramTotal)}`,
                `RAM: ${pct(data.ramUsed, data.ramTotal)}`,
                `${t('Users', '用户')}: ${usersLabel}`,
                `${t('Online nodes', '在线节点')}: ${onlineNodes || '--'}`,
                `${t('Canvas nodes', '画布节点')}: ${Array.isArray(project.nodes) ? project.nodes.length : 0}`,
                `${t('Canvas edges', '画布连线')}: ${Array.isArray(project.edges) ? project.edges.length : 0}`
            ].join(' / '));
            systemInfo.removeAttribute('title');
        }

        function setCanvasBackendAlert(state, message, options) {
            const nextState = String(state || '').toLowerCase();
            const opts = options || {};
            backendAlertState.state = nextState;
            backendAlertState.message = String(message || '');
            backendAlertState.endpoint = String(opts.endpoint || '');
            backendAlertState.updatedAt = now();
            renderCanvasBackendAlert();
        }

        function renderCanvasBackendAlert() {
            const alertElement = getElement('getBackendAlertElement');
            if (!alertElement) return;
            const state = backendAlertState.state;
            if (!state || state === 'connected') {
                alertElement.hidden = true;
                alertElement.innerHTML = '';
                return;
            }
            const title = state === 'exception' ? t('Backend exception', '后端异常') : t('Backend disconnected', '后端已断开');
            const message = backendAlertState.message || t('The canvas cannot reach the backend right now.', '画布当前无法连接后端。');
            const endpoint = backendAlertState.endpoint;
            alertElement.hidden = false;
            alertElement.innerHTML = `
<i class="fa-solid fa-triangle-exclamation"></i>
<div>
  <strong>${escapeHtml(title)}</strong>
  <p>${escapeHtml(message)}</p>
  ${endpoint ? `<small>${escapeHtml(endpoint)}</small>` : ''}
</div>`;
        }

        return {
            buildCanvasRunStatus,
            mergeCanvasRunStatus,
            buildCanvasNodeStatusPatch,
            isRunQueueActiveState,
            runQueueRunResultNode,
            runQueueRunPercent,
            latestRunQueueSize,
            runQueueWidgetSummary,
            renderRunQueueWidget,
            parseStandaloneStatusPayload,
            fetchStandaloneStatusPayload,
            publishStandaloneStatus,
            refreshStandaloneStatus,
            startStandaloneStatusMonitor,
            stopStandaloneStatusMonitor,
            renderSystemInfo,
            setCanvasBackendAlert,
            renderCanvasBackendAlert,
            getBackendAlertState: () => Object.assign({}, backendAlertState)
        };
    }

    window.SimpAICanvasWorkbenchRunStatus = Object.assign({}, window.SimpAICanvasWorkbenchRunStatus || {}, {
        createCanvasRunStatusController
    });
})();
