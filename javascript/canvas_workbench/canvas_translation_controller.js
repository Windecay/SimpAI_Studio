(function () {
    'use strict';

    function createCanvasTranslationController(context) {
        const scope = context?.translationSource || context || {};
        const requestSource = scope.requestSource || {};
        const timingSource = scope.timingSource || {};
        const timeSource = scope.timeSource || {};
        const call = (source, name, fallback, ...args) => typeof source[name] === 'function'
            ? source[name](...args)
            : fallback;
        const currentTime = () => {
            const value = Number(call(timeSource, 'now', NaN));
            return Number.isFinite(value) ? value : NaN;
        };
        const wait = (delayMs) => new Promise((resolve) => {
            timingSource.setTimeout(resolve, delayMs);
        });

        async function requestTranslation(text, options) {
            const start = await call(requestSource, 'sendCanvasTranslateRunRequest', null, {
                text,
                direction: options?.direction || 'toggle',
                method: options?.method || ''
            });
            if (!start?.ok || !start.job_id) return start || { ok: false, error: 'translate request failed' };
            const startedAt = currentTime();
            if (!Number.isFinite(startedAt) || typeof timingSource.setTimeout !== 'function') {
                return { ok: false, error: 'translate timing unavailable', job_id: start.job_id };
            }
            const deadline = startedAt + 120000;
            while (currentTime() < deadline) {
                await wait(650);
                const result = await call(requestSource, 'sendCanvasTranslatePollRequest', null, start.job_id);
                if (!result?.ok && result?.state !== 'failed') return result || { ok: false, error: 'translate poll failed' };
                if (result.state === 'finished') return result;
                if (result.state === 'failed') return result;
            }
            return { ok: false, error: 'translate timeout', job_id: start.job_id };
        }

        return { requestTranslation };
    }

    window.SimpAICanvasWorkbenchTranslation = Object.assign(
        {},
        window.SimpAICanvasWorkbenchTranslation || {},
        { createCanvasTranslationController }
    );
})();
