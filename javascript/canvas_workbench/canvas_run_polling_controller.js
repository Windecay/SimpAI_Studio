(function () {
    'use strict';

    const TERMINAL_STATES = new Set(['finished', 'failed', 'canceled', 'skipped']);

    function createCanvasRunPollingController(source) {
        const scope = source?.runPollingSource || source || {};
        const timingSource = scope.timingSource || {};
        const runtimeSource = scope.runtimeSource || {};
        const activeRunIds = new Set();

        const isTerminalRunState = (state) => typeof runtimeSource.isTerminalRunState === 'function'
            ? !!runtimeSource.isTerminalRunState(state)
            : TERMINAL_STATES.has(String(state || '').toLowerCase());
        const schedule = (callback, delay) => {
            if (typeof timingSource.setTimeout !== 'function') return false;
            try {
                timingSource.setTimeout(callback, delay);
                return true;
            } catch (err) {
                return false;
            }
        };

        function pollRun(runId, options) {
            if (!runId || activeRunIds.has(runId)) {
                return Promise.resolve({ ok: false, error: 'run is already polling' });
            }
            const opts = options || {};
            if (typeof opts.poll !== 'function') {
                return Promise.resolve({ ok: false, error: 'poll request unavailable' });
            }
            if (typeof timingSource.setTimeout !== 'function') {
                return Promise.resolve({ ok: false, error: 'poll timer unavailable' });
            }

            activeRunIds.add(runId);
            const initialDelayMs = opts.initialDelayMs ?? 900;
            const intervalMs = opts.intervalMs ?? 1200;
            const nextInterval = () => typeof opts.getIntervalMs === 'function' ? opts.getIntervalMs() : intervalMs;

            return new Promise((resolve) => {
                let settled = false;
                let requestErrors = 0;
                const finish = (value) => {
                    if (settled) return;
                    settled = true;
                    activeRunIds.delete(runId);
                    resolve(value);
                };
                const callbackResult = (name, result, state, fallback) => {
                    const callback = opts[name];
                    if (typeof callback !== 'function') return fallback;
                    const value = callback(result, state);
                    return value === undefined ? fallback : value;
                };
                const failedResult = (error) => ({
                    ok: false,
                    state: 'failed',
                    error: String(error?.message || error || 'Run polling failed')
                });
                const canContinue = () => typeof opts.shouldContinue !== 'function' || opts.shouldContinue();
                const tick = async () => {
                    if (settled) return;
                    try {
                        if (!canContinue()) {
                            finish({ ok: false, error: 'run no longer current' });
                            return;
                        }
                        let result;
                        try {
                            result = await opts.poll();
                        } catch (err) {
                            result = Object.assign(failedResult(err), err?.name === 'AbortError'
                                ? { aborted: true } : { transport_error: true });
                        }
                        if (!canContinue()) {
                            finish({ ok: false, error: 'run no longer current' });
                            return;
                        }
                        if (result?.transport_error && opts.maxRequestErrors > 0) {
                            requestErrors += 1;
                            const exhausted = requestErrors > opts.maxRequestErrors;
                            const fallback = {
                                ok: false, state: 'unknown', recoverable: true, run_id: runId,
                                error: result.error, result
                            };
                            const outcome = typeof opts.onRequestError === 'function'
                                ? (opts.onRequestError(result, exhausted) ?? fallback) : fallback;
                            if (exhausted || !schedule(tick, nextInterval() * Math.min(requestErrors, 3))) finish(outcome);
                            return;
                        }
                        requestErrors = 0;
                        const state = typeof opts.getState === 'function'
                            ? opts.getState(result)
                            : (result?.state || 'failed');
                        if (typeof opts.onResult === 'function') opts.onResult(result, state);
                        if (result && result.ok && !isTerminalRunState(state)) {
                            if (!schedule(tick, nextInterval())) {
                                finish(callbackResult('onTimerUnavailable', result, state, {
                                    ok: false,
                                    state,
                                    error: 'poll timer unavailable',
                                    result
                                }));
                            }
                            return;
                        }
                        if (state === 'finished') {
                            finish(callbackResult('onFinished', result, state, { ok: true, state, result }));
                        } else if (state === 'canceled' || state === 'skipped') {
                            finish(callbackResult('onCanceled', result, state, { ok: false, state, result }));
                        } else if (state === 'failed') {
                            finish(callbackResult('onFailed', result, state, { ok: false, state, result }));
                        } else {
                            finish(callbackResult('onStopped', result, state, { ok: false, state, result }));
                        }
                    } catch (err) {
                        finish(failedResult(err));
                    }
                };

                if (!schedule(tick, initialDelayMs)) {
                    finish({ ok: false, error: 'poll timer unavailable' });
                }
            });
        }

        return {
            getActiveRunIds: () => activeRunIds,
            pollRun
        };
    }

    // Submitted work belongs to a project and a run token, independently of the visible canvas.
    function createCanvasBackgroundRunController(source) {
        const jobs = new Map();
        const restoredProjects = new WeakSet();
        const stateOf = response => response?.state || (response?.ok
            ? (response.asset || response.assets?.length ? 'finished' : 'queued') : 'failed');
        const tokenOf = node => node?.producer?.run_token || node?.producer?.pending_run_token || '';
        const identityKey = () => String(source.getIdentityKey());
        const scopeKey = () => String(source.getScopeKey());
        const currentProject = () => source.getProject();
        const nodeFor = (project, id) => (project?.nodes || []).find(node => node.id === id);
        const responseMatches = (job, response) => (!response?.run_id || response.run_id === job.runId)
            && (!response?.job_id || response.job_id === job.runId)
            && (!response?.project_id || response.project_id === job.projectId)
            && (!response?.placeholder_node_id || response.placeholder_node_id === job.resultNodeId);
        const matches = (job, project) => {
            if (project?.id !== job.projectId) return false;
            const node = nodeFor(project, job.resultNodeId);
            const run = (project.runs || []).find(item => item.id === job.runId);
            return !!run && !!node && node.producer?.run_id === job.runId
                && tokenOf(node) === job.runToken && (run.run_token || '') === job.runToken
                && (!node.producer?.pending_run_token || node.producer.pending_run_token === job.runToken)
                && (!node.source?.pending_run_token || node.source.pending_run_token === job.runToken)
                && (!run.request_identity || run.request_identity === job.identity);
        };
        const authorized = job => job.identity === identityKey() && job.scope === scopeKey();
        const visible = job => authorized(job) && currentProject() === job.project && matches(job, job.project)
            && (typeof source.isProjectVisible !== 'function' || source.isProjectVisible(job.projectId));
        const notify = () => source.onChanged?.();

        function apply(job) {
            if (!visible(job) || !job.response || job.applied.get(job.project) === job.version) return;
            source.applyResult(job, job.response);
            job.applied.set(job.project, job.version);
            job.unread = false;
        }

        function receive(job, response) {
            if (!authorized(job) || !matches(job, job.project)) return;
            // A mismatched server receipt must never be associated with another task.
            if (!responseMatches(job, response)) return;
            if (TERMINAL_STATES.has(job.state) && !response?.transport_error && !TERMINAL_STATES.has(stateOf(response))) return;
            if (response?.aborted) response = { ...response, transport_error: true };
            job.response = response;
            job.version += 1;
            job.recoverable = !!response?.transport_error;
            if (!job.recoverable) {
                job.state = stateOf(response);
                job.unread = TERMINAL_STATES.has(job.state) && !visible(job);
            }
            apply(job);
            if (!visible(job) && (TERMINAL_STATES.has(job.state) || response?.exhausted)) source.cacheResult?.(job, response);
            notify();
        }

        function start(job, options = {}) {
            if (job.promise && job.polling) return job.promise;
            if (!authorized(job) || !matches(job, job.project)) return Promise.resolve({ ok: false, error: 'run no longer current' });
            job.polling = true;
            job.promise = source.pollRun(job.key, {
                initialDelayMs: options.initialDelayMs ?? 0,
                intervalMs: options.intervalMs ?? 1200,
                getIntervalMs: () => visible(job) ? options.intervalMs ?? 1200 : options.backgroundIntervalMs ?? 3000,
                maxRequestErrors: options.maxRequestErrors ?? 3,
                shouldContinue: () => jobs.get(job.key) === job && authorized(job) && matches(job, job.project),
                poll: async () => {
                    if (TERMINAL_STATES.has(job.state) && !job.recoverable) return job.response;
                    const version = job.version;
                    const result = await source.pollRequest(job, {
                        foreground: visible(job),
                        after_preview_serial: visible(job) ? source.getPreviewSerial?.(job.resultNodeId) || 0 : 0
                    });
                    // A control acknowledgement received during this request takes precedence.
                    if (job.version !== version) return job.response;
                    if (!responseMatches(job, result)) {
                        return { ok: false, transport_error: true, error: 'run response mismatch' };
                    }
                    return result?.error === 'run not found' || result?.error === 'job not found' || result?.aborted
                        ? { ...result, transport_error: true } : result;
                },
                onResult: response => receive(job, response),
                onRequestError: (response, exhausted) => {
                    receive(job, { ...response, transport_error: true, exhausted });
                    return { ok: false, state: 'unknown', recoverable: true, run_id: job.runId, result: response };
                },
                getState: stateOf,
                onFinished: (result, state) => ({ ok: true, state, result, run_id: job.runId,
                    result_node_id: job.resultNodeId, preset_node_id: job.producerNodeId,
                    qwen_tts_node_id: job.kind === 'qwen_tts' ? job.producerNodeId : undefined, run_token: job.runToken }),
                onCanceled: (result, state) => ({ ok: false, state, result, error: result?.message || state, run_id: job.runId }),
                onFailed: (result, state) => ({ ok: false, state, result, error: result?.error || result?.message || state, run_id: job.runId })
            }).finally(() => {
                job.polling = false;
                if ((!authorized(job) || !matches(job, job.project)) && jobs.get(job.key) === job) jobs.delete(job.key);
                notify();
            });
            return job.promise;
        }

        function trackRun(config) {
            const project = config.project;
            const result = nodeFor(project, config.resultNodeId);
            const run = (project?.runs || []).find(item => item.id === config.runId);
            if (!project?.id || !run || !result) return Promise.resolve({ ok: false, error: 'run no longer current' });
            const identity = run.request_identity || identityKey();
            if (identity !== identityKey()) return Promise.resolve({ ok: false, error: 'run identity changed' });
            const key = JSON.stringify([scopeKey(), identity, project.id, config.kind || 'preset', config.runId, tokenOf(result)]);
            let job = jobs.get(key);
            if (!job) {
                job = { key, project, projectId: project.id, scope: scopeKey(), identity,
                    runId: config.runId, runToken: tokenOf(result), kind: config.kind || 'preset',
                    resultNodeId: result.id, producerNodeId: config.producerNodeId,
                    state: run.state || 'queued', version: 0, applied: new WeakMap(), unread: false };
                jobs.set(key, job);
            }
            if (!matches(job, project)) return Promise.resolve({ ok: false, error: 'run no longer current' });
            const active = currentProject();
            if (active?.id === project.id && active !== project && !matches(job, active)) {
                jobs.delete(key);
                return Promise.resolve({ ok: false, error: 'run no longer current' });
            }
            job.project = active?.id === project.id ? active : project;
            if (config.response) receive(job, config.response);
            else apply(job);
            if (TERMINAL_STATES.has(job.state) && !job.recoverable) {
                return Promise.resolve({ ok: job.state === 'finished', state: job.state, result: job.response,
                    run_id: job.runId, result_node_id: job.resultNodeId, run_token: job.runToken });
            }
            notify();
            return start(job, config.options);
        }

        function syncProject() {
            const project = currentProject();
            if (!project) return;
            const runs = new Map((project?.runs || []).map(run => [run.id, run]));
            if (!restoredProjects.has(project)) {
                restoredProjects.add(project);
                let changed = false;
                const message = source.t?.('Pending steps paused after switching workbenches. Submitted tasks continue; resume the queue when ready.')
                    || 'Pending steps paused after switching workbenches. Submitted tasks continue; resume the queue when ready.';
                if (['running', 'waiting'].includes(project.scheduler?.state)) {
                    project.scheduler = { ...project.scheduler, state: 'paused', message };
                    changed = true;
                }
                for (const node of project.nodes || []) {
                    if (['xy_matrix', 'xyz_matrix'].includes(node.type) && ['running', 'checking'].includes(node.status?.state)) {
                        node.status = { ...node.status, state: 'paused', message };
                        changed = true;
                    }
                    // Future Director placeholders have no submitted run to recover.
                    if (node.type === 'result' && node.source?.director_node_id && !runs.has(node.producer?.run_id)
                        && ['queued', 'waiting', 'preparing'].includes(node.status?.state)) {
                        node.status = { ...node.status, state: 'paused', message };
                        node.producer = { ...node.producer, refreshing: false, pending_run_token: '' };
                        node.source = { ...node.source, refreshing: false, pending_run_token: '' };
                        changed = true;
                    }
                }
                if (changed) source.onProjectStateChanged?.(project);
            }
            for (const [key, job] of jobs) {
                if (!authorized(job)) { jobs.delete(key); continue; }
                if (job.projectId !== project?.id) continue;
                if (!matches(job, project)) { jobs.delete(key); continue; }
                job.project = project;
                apply(job);
                if (job.unread) job.unread = false;
            }
            for (const result of project?.nodes || []) {
                if (result.type !== 'result') continue;
                const run = runs.get(result.producer?.run_id);
                if (!run || TERMINAL_STATES.has(run.state) && !run.connection_error) continue;
                // Older browser snapshots did not preserve the token in the run record.
                if (!run.run_token && result.producer?.run_token) run.run_token = result.producer.run_token;
                const producerNodeId = result.producer?.qwen_tts_node_id || result.producer?.preset_node_id;
                if (!producerNodeId || run.backend === 'dry_run') continue;
                void trackRun({ project, runId: run.id, resultNodeId: result.id, producerNodeId,
                    kind: result.producer?.qwen_tts_node_id ? 'qwen_tts' : 'preset', response: run.background_response });
            }
            // Finished, acknowledged jobs need no retained media or project references.
            for (const [key, job] of jobs) {
                if (TERMINAL_STATES.has(job.state) && !job.unread && !job.polling) jobs.delete(key);
            }
            notify();
        }

        function getProjectStatus(projectId) {
            let active = 0, completed = 0, failed = 0, disconnected = 0;
            for (const job of jobs.values()) {
                if (job.projectId !== projectId || !authorized(job) || !matches(job, job.project)) continue;
                if (!TERMINAL_STATES.has(job.state)) { active += 1; if (job.recoverable) disconnected += 1; }
                else if (job.unread) { if (job.state === 'finished') completed += 1; else failed += 1; }
            }
            return { active, completed, failed, disconnected };
        }

        return { trackRun, syncProject, getProjectStatus };
    }

    window.SimpAICanvasWorkbenchRunPolling = Object.assign(
        {},
        window.SimpAICanvasWorkbenchRunPolling || {},
        { createCanvasRunPollingController, createCanvasBackgroundRunController }
    );
})();
