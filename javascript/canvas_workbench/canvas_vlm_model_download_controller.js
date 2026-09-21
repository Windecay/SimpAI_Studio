(function () {
    'use strict';

    function createCanvasVlmModelDownloadController(context) {
        const scope = context?.vlmModelDownloadSource || context || {};
        const requestSource = scope.requestSource || {};
        const languageSource = scope.languageSource || {};
        const utilitySource = scope.utilitySource || {};
        const timingSource = scope.timingSource || {};
        const helpSource = scope.helpSource || {};
        const renderSource = scope.renderSource || {};
        const catalogSource = scope.catalogSource || {};
        const diagnosticSource = scope.diagnosticSource || {};
        const call = (source, name, fallback, ...args) => typeof source?.[name] === 'function'
            ? source[name](...args)
            : fallback;
        const t = typeof languageSource.t === 'function'
            ? languageSource.t
            : ((en, cn) => cn || en);
        const escapeHtml = typeof utilitySource.escapeHtml === 'function'
            ? utilitySource.escapeHtml
            : (value => String(value ?? ''));
        const formatBytes = typeof utilitySource.formatBytes === 'function'
            ? utilitySource.formatBytes
            : (value => {
                const bytes = Number(value || 0);
                if (!Number.isFinite(bytes) || bytes <= 0) return '';
                if (bytes < 1024) return `${bytes} B`;
                if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
                return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
            });
        const now = () => {
            const value = call(timingSource, 'now', null);
            const number = Number(value);
            return Number.isFinite(number) ? number : Date.now();
        };
        const schedule = (callback, delay) => call(timingSource, 'setTimeout', null, callback, delay);
        const cancelSchedule = (timer) => call(timingSource, 'clearTimeout', undefined, timer);
        const sessions = new Map();
        const ACTIVE_STATUSES = new Set(['starting', 'queued', 'downloading', 'installing', 'cancelling']);
        const ACTIVE_ROW_STATUSES = new Set(['queued', 'downloading', 'installing']);
        const TERMINAL_VISIBLE_MS = 10000;
        const POLL_DELAY_MS = 700;

        function cleanVersion(value) {
            return String(value || '').trim();
        }

        function cleanTaskId(value) {
            return String(value || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').trim();
        }

        function taskIdFromModel(item) {
            if (!item || typeof item !== 'object') return '';
            const cata = String(item.cata || '').trim();
            const pathFile = String(item.path_file || '').replace(/\\/g, '/').replace(/^\/+/, '').trim();
            return cleanTaskId(item.task_id || (cata && pathFile ? `${cata}/${pathFile}` : pathFile));
        }

        function fileNameFromModel(item) {
            const pathFile = String(item?.path_file || item?.file_name || '').replace(/\\/g, '/');
            return pathFile.split('/').filter(Boolean).pop() || '';
        }

        function numeric(value, fallback = 0) {
            const number = Number(value);
            return Number.isFinite(number) ? number : fallback;
        }

        function normalizeRow(row, fallback = {}) {
            const source = Object.assign({}, fallback || {}, row || {});
            const taskId = cleanTaskId(source.task_id || fallback.task_id);
            const total = Math.max(0, Math.round(numeric(source.total, numeric(source.size, 0))));
            const current = Math.max(0, Math.round(numeric(source.current, 0)));
            let percent = numeric(source.percent, 0);
            if (total > 0 && current > 0) percent = current / total * 100;
            percent = Math.max(0, Math.min(100, percent));
            const status = String(source.status || (source.active ? 'queued' : 'done')).trim().toLowerCase() || 'queued';
            return {
                task_id: taskId,
                file_name: String(source.file_name || fallback.file_name || taskId.split('/').pop() || 'model'),
                current,
                total,
                percent,
                status,
                error: String(source.error || ''),
                active: source.active !== undefined ? !!source.active : ACTIVE_ROW_STATUSES.has(status),
                phase: String(source.phase || ''),
            };
        }

        function notifyUi() {
            call(helpSource, 'sync', undefined);
            call(renderSource, 'renderCanvasAgentPanel', undefined);
        }

        function refreshModelCatalog() {
            const refresh = catalogSource.refreshVlmModelCatalog;
            if (typeof refresh !== 'function') return;
            Promise.resolve(refresh(true, true)).catch(error => {
                call(diagnosticSource, 'warn', undefined, '[SimpAI Canvas] VLM model catalog refresh failed:', error);
            });
        }

        function sessionRows(session) {
            return Array.from(session.rows.values());
        }

        function hasActiveRows(session) {
            return sessionRows(session).some(row => row.active || ACTIVE_ROW_STATUSES.has(row.status));
        }

        function scheduleSessionRemoval(session) {
            if (session.removeTimer) cancelSchedule(session.removeTimer);
            session.removeTimer = schedule(() => {
                if (sessions.get(session.version) === session) {
                    sessions.delete(session.version);
                    notifyUi();
                }
            }, TERMINAL_VISIBLE_MS);
        }

        function finishSession(session, status, message = '') {
            if (sessions.get(session.version) !== session) return;
            if (session.pollTimer) cancelSchedule(session.pollTimer);
            session.pollTimer = null;
            session.pollInFlight = false;
            session.status = status;
            session.error = message || session.error || '';
            session.finishedAt = now();
            if (status === 'done') refreshModelCatalog();
            notifyUi();
            scheduleSessionRemoval(session);
        }

        function seedRows(session, response) {
            const missingModels = Array.isArray(response?.missing_models) ? response.missing_models : [];
            const queued = Array.isArray(response?.queued)
                ? response.queued.map(cleanTaskId).filter(Boolean)
                : [];
            missingModels.forEach(item => {
                const taskId = taskIdFromModel(item);
                if (!taskId) return;
                session.rows.set(taskId, normalizeRow({
                    task_id: taskId,
                    file_name: fileNameFromModel(item),
                    total: item.size || 0,
                    status: 'queued',
                    active: true,
                }));
            });
            queued.forEach(taskId => {
                if (!session.rows.has(taskId)) {
                    session.rows.set(taskId, normalizeRow({ task_id: taskId, status: 'queued', active: true }));
                }
            });
            session.taskIds = Array.from(new Set([...queued, ...session.rows.keys()]));
        }

        function mergeSnapshot(session, rows) {
            (Array.isArray(rows) ? rows : []).forEach(row => {
                const taskId = cleanTaskId(row?.task_id);
                if (!taskId) return;
                const previous = session.rows.get(taskId) || {};
                session.rows.set(taskId, normalizeRow(row, previous));
            });
        }

        function aggregateStatus(session) {
            const rows = sessionRows(session);
            if (session.cancelRequested) return 'cancelling';
            if (rows.some(row => row.status === 'installing')) return 'installing';
            if (rows.some(row => row.status === 'downloading')) return 'downloading';
            return 'queued';
        }

        function schedulePoll(session, delay = POLL_DELAY_MS) {
            if (sessions.get(session.version) !== session || session.pollTimer) return;
            session.pollTimer = schedule(() => {
                session.pollTimer = null;
                pollSession(session).catch(error => {
                    call(diagnosticSource, 'warn', undefined, '[SimpAI Canvas] VLM model download polling failed:', error);
                });
            }, delay);
        }

        async function pollSession(session) {
            if (sessions.get(session.version) !== session || session.pollInFlight) return;
            session.pollInFlight = true;
            let response;
            try {
                response = await call(
                    requestSource,
                    'sendCanvasVlmModelDownloadStatusRequest',
                    Promise.resolve({ ok: false, error: 'VLM model download status API is unavailable' }),
                    session.node,
                    { taskIds: session.taskIds }
                );
            } catch (error) {
                session.pollFailures += 1;
                session.pollInFlight = false;
                if (session.pollFailures >= 3) {
                    finishSession(session, 'error', error?.message || String(error || 'download status request failed'));
                } else {
                    schedulePoll(session, POLL_DELAY_MS * 2);
                }
                return;
            }
            session.pollInFlight = false;
            if (!response?.ok) {
                session.pollFailures += 1;
                if (session.pollFailures >= 3) {
                    finishSession(session, 'error', response?.details || response?.error || 'download status request failed');
                } else {
                    schedulePoll(session, POLL_DELAY_MS * 2);
                }
                return;
            }
            session.pollFailures = 0;
            mergeSnapshot(session, response.download_tasks || response.downloads || []);
            const active = hasActiveRows(session);
            const rows = sessionRows(session);
            const hasError = rows.some(row => row.status === 'error' || row.error);
            const hasStopped = rows.length > 0 && rows.every(row => row.status === 'stopped');
            const cancellingRows = rows.some(row => session.cancelTaskIds.has(row.task_id) && (
                row.active || ACTIVE_ROW_STATUSES.has(row.status)
            ));
            if (session.cancelRequested) {
                session.status = active ? 'cancelling' : 'stopped';
                notifyUi();
                if (!active) {
                    finishSession(session, hasError ? 'error' : 'stopped', hasError ? rows.find(row => row.error)?.error : '');
                    return;
                }
            } else if (cancellingRows) {
                session.status = 'cancelling';
                notifyUi();
            } else if (hasError && !active) {
                finishSession(session, 'error', rows.find(row => row.error)?.error || 'download failed');
                return;
            } else if (hasStopped && !active) {
                finishSession(session, 'stopped');
                return;
            } else if (response.ready && !active) {
                finishSession(session, 'done');
                return;
            } else {
                session.status = aggregateStatus(session);
                notifyUi();
            }
            schedulePoll(session);
        }

        async function startModelDownload(node, version) {
            const modelVersion = cleanVersion(version || node?.params?.version);
            if (!modelVersion) return { ok: false, error: 'model version is missing' };
            const previous = sessions.get(modelVersion);
            if (previous && ACTIVE_STATUSES.has(previous.status)) {
                return previous.startPromise || { ok: true, state: previous.status, message: t('The model download is already running.', '模型下载已经在进行中。') };
            }
            if (previous?.removeTimer) cancelSchedule(previous.removeTimer);
            const session = {
                version: modelVersion,
                node: node || { type: 'vlm', params: { version: modelVersion } },
                status: 'starting',
                taskIds: [],
                rows: new Map(),
                pollTimer: null,
                removeTimer: null,
                pollInFlight: false,
                pollFailures: 0,
                cancelRequested: false,
                cancelTaskIds: new Set(),
                error: '',
                startedAt: now(),
            };
            sessions.set(modelVersion, session);
            notifyUi();
            session.startPromise = (async () => {
                let response;
                try {
                    response = await call(
                        requestSource,
                        'sendCanvasVlmModelDownloadsRequest',
                        Promise.resolve({ ok: false, error: 'VLM model download API is unavailable' }),
                        session.node
                    );
                } catch (error) {
                    finishSession(session, 'error', error?.message || String(error || 'model download failed'));
                    return { ok: false, error: session.error };
                }
                if (!response?.ok) {
                    finishSession(session, 'error', response?.details || response?.error || 'model download failed');
                    return response || { ok: false, error: session.error };
                }
                seedRows(session, response);
                if (response.ready || (!session.taskIds.length && Number(response.missing_count || 0) <= 0)) {
                    finishSession(session, 'done');
                    return response;
                }
                session.status = 'queued';
                notifyUi();
                schedulePoll(session, 120);
                return response;
            })();
            return session.startPromise;
        }

        async function cancelModelDownload(version, taskId) {
            const modelVersion = cleanVersion(version);
            const session = sessions.get(modelVersion);
            if (!session) return { ok: false, error: 'model download task is unavailable' };
            const requestedTaskId = cleanTaskId(taskId);
            const taskIds = requestedTaskId
                ? [requestedTaskId]
                : session.taskIds.filter(item => {
                    const row = session.rows.get(item);
                    return !row || row.active || ACTIVE_ROW_STATUSES.has(row.status);
            });
            if (!taskIds.length) return { ok: true, stopped: false, task_ids: [] };
            if (requestedTaskId) {
                session.cancelTaskIds.add(requestedTaskId);
            } else {
                session.cancelRequested = true;
                taskIds.forEach(id => session.cancelTaskIds.add(id));
                session.status = 'cancelling';
            }
            notifyUi();
            const results = await Promise.all(taskIds.map(id => call(
                requestSource,
                'sendCanvasVlmModelDownloadCancelRequest',
                Promise.resolve({ ok: false, error: 'VLM model download cancel API is unavailable' }),
                session.node,
                id
            )));
            const failed = results.find(item => !item?.ok);
            if (failed) {
                session.cancelRequested = false;
                finishSession(session, 'error', failed.details || failed.error || 'download stop failed');
                return failed;
            }
            schedulePoll(session, 80);
            return { ok: true, stopped: true, task_ids: taskIds };
        }

        function statusLabel(status) {
            const labels = {
                starting: t('Preparing', '准备中'),
                queued: t('Waiting', '等待中'),
                downloading: t('Downloading', '下载中'),
                installing: t('Installing', '安装中'),
                cancelling: t('Stopping', '停止中'),
                stopped: t('Stopped', '已停止'),
                error: t('Failed', '失败'),
                done: t('Complete', '已完成'),
            };
            return labels[status] || labels.queued;
        }

        function renderRow(session, row) {
            const percent = Math.round(Math.max(0, Math.min(100, numeric(row.percent, 0))));
            const current = formatBytes(row.current);
            const total = formatBytes(row.total);
            const sizeText = current && total
                ? t('{current} / {total}', '{current} / {total}').replace('{current}', current).replace('{total}', total)
                : total || current || t('Waiting for size', '等待大小');
            const active = row.active || ACTIVE_ROW_STATUSES.has(row.status);
            const stopButton = active && !session.cancelTaskIds.has(row.task_id)
                ? `<button type="button" data-studio-help-cancel-model-download="${escapeHtml(session.version)}" data-studio-help-cancel-task="${escapeHtml(row.task_id)}" title="${escapeHtml(t('Stop this file', '停止此文件'))}" aria-label="${escapeHtml(t('Stop this file', '停止此文件'))}"><i class="fa-solid fa-stop"></i></button>`
                : '';
            const progress = row.total > 0
                ? `<progress max="100" value="${percent}">${percent}%</progress>`
                : '<progress max="100"></progress>';
            return `<div class="sai-help-model-download-row" data-download-status="${escapeHtml(row.status)}">
  <div class="sai-help-model-download-row-head"><span title="${escapeHtml(row.file_name)}">${escapeHtml(row.file_name)}</span><b>${percent}%</b>${stopButton}</div>
  <div class="sai-help-model-download-progress-bar">${progress}</div>
  <div class="sai-help-model-download-row-meta"><span>${escapeHtml(sizeText)}</span><span>${escapeHtml(row.error || statusLabel(row.status))}</span></div>
</div>`;
        }

        function renderModelNotice(version) {
            const modelVersion = cleanVersion(version);
            const session = sessions.get(modelVersion);
            if (!session) return '';
            const rows = sessionRows(session);
            const title = {
                starting: t('Preparing model download...', '正在准备模型下载...'),
                queued: t('Model download is waiting...', '模型下载等待中...'),
                downloading: t('Model download in progress', '模型正在下载'),
                installing: t('Installing model files...', '正在安装模型文件...'),
                cancelling: t('Stopping model download...', '正在停止模型下载...'),
                stopped: t('Model download stopped.', '模型下载已停止。'),
                error: t('Model download failed.', '模型下载失败。'),
                done: t('Model download complete.', '模型下载完成。'),
            }[session.status] || t('Model download is waiting...', '模型下载等待中...');
            const error = session.status === 'error' && session.error
                ? `<div class="sai-help-model-download-error">${escapeHtml(session.error)}</div>`
                : '';
            const stopAll = ACTIVE_STATUSES.has(session.status) && session.status !== 'cancelling' && rows.some(row => row.active || ACTIVE_ROW_STATUSES.has(row.status))
                ? `<button type="button" data-studio-help-cancel-model-download="${escapeHtml(modelVersion)}" title="${escapeHtml(t('Stop all model downloads', '停止全部模型下载'))}" aria-label="${escapeHtml(t('Stop all model downloads', '停止全部模型下载'))}"><i class="fa-solid fa-stop"></i><span>${escapeHtml(t('Stop', '停止'))}</span></button>`
                : '';
            const body = rows.length
                ? rows.map(row => renderRow(session, row)).join('')
                : `<div class="sai-help-model-download-empty">${escapeHtml(t('Waiting for download status...', '等待下载状态...'))}</div>`;
            return `<div class="sai-help-notice sai-help-model-download" role="status" aria-live="polite">
  <div class="sai-help-model-download-title"><span>${escapeHtml(title)}</span><small>${escapeHtml(modelVersion)}</small></div>
  <div class="sai-help-model-download-list">${body}</div>
  ${error}
  ${stopAll ? `<div class="sai-help-model-download-actions">${stopAll}</div>` : ''}
</div>`;
        }

        return {
            startModelDownload,
            cancelModelDownload,
            renderModelNotice,
            getModelDownloadState: version => {
                const session = sessions.get(cleanVersion(version));
                if (!session) return null;
                return {
                    version: session.version,
                    status: session.status,
                    task_ids: session.taskIds.slice(),
                    rows: sessionRows(session).map(row => Object.assign({}, row)),
                    error: session.error,
                };
            }
        };
    }

    window.SimpAICanvasWorkbenchVlmModelDownload = Object.assign(
        {},
        window.SimpAICanvasWorkbenchVlmModelDownload || {},
        { createCanvasVlmModelDownloadController }
    );
})();
