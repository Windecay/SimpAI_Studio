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

            return new Promise((resolve) => {
                let settled = false;
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
                const tick = async () => {
                    const result = await opts.poll();
                    const state = typeof opts.getState === 'function'
                        ? opts.getState(result)
                        : (result?.state || 'failed');
                    if (typeof opts.onResult === 'function') opts.onResult(result, state);
                    if (result && result.ok && !isTerminalRunState(state)) {
                        if (!schedule(tick, intervalMs)) {
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

    window.SimpAICanvasWorkbenchRunPolling = Object.assign(
        {},
        window.SimpAICanvasWorkbenchRunPolling || {},
        { createCanvasRunPollingController }
    );
})();
