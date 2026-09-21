(function () {
    'use strict';

    function createCanvasRunRefreshWaitController(context) {
        const scope = context?.runRefreshWaitSource || context || {};
        const languageSource = scope.languageSource || {};
        const projectSource = scope.projectSource || {};
        const nodeSource = scope.nodeSource || {};
        const patchSource = scope.patchSource || {};
        const runtimeSource = scope.runtimeSource || {};
        const timingSource = scope.timingSource || {};
        const timeSource = scope.timeSource || {};
        const uiSource = scope.uiSource || {};
        const call = (source, name, fallback, ...args) => typeof source[name] === 'function'
            ? source[name](...args)
            : fallback;
        const t = typeof languageSource.t === 'function' ? languageSource.t : ((en, cn) => cn || en);
        const currentTime = () => {
            const value = Number(call(timeSource, 'now', NaN));
            return Number.isFinite(value) ? value : NaN;
        };
        const wait = (delayMs) => new Promise((resolve) => {
            timingSource.setTimeout(resolve, delayMs);
        });

        async function waitForRefreshingSources(sourceIds, options) {
            const ids = (sourceIds || []).filter(Boolean);
            if (!ids.length) return true;
            const timeoutMs = Math.max(5000, Number(options?.timeoutMs || 30 * 60 * 1000));
            const started = currentTime();
            if (!Number.isFinite(started) || typeof timingSource.setTimeout !== 'function') return false;
            const waitingNode = call(projectSource, 'getNode', null, options?.waitingNodeId);
            const message = t('Waiting for upstream Result refresh...', '正在等待上游 Result 刷新...');
            if (waitingNode) {
                const status = call(patchSource, 'buildCanvasRunStatus', null, 'waiting', message);
                const patch = call(patchSource, 'buildCanvasNodeStatusPatch', null, waitingNode, { status });
                if (patch && typeof patch === 'object') Object.assign(waitingNode, patch);
                call(runtimeSource, 'mutate', undefined, { inspector: true });
            }
            call(uiSource, 'showToast', undefined, message, 2600);
            while (currentTime() - started < timeoutMs) {
                const pending = ids
                    .map(id => call(nodeSource, 'getNode', null, id))
                    .filter(node => node && (
                        call(nodeSource, 'isResultRefreshing', false, node)
                        || call(nodeSource, 'isCanvasRunActiveState', false, call(nodeSource, 'nodeStatusState', '', node))
                    ));
                if (!pending.length) return true;
                await wait(600);
            }
            return false;
        }

        return { waitForRefreshingSources };
    }

    window.SimpAICanvasWorkbenchRunRefreshWait = Object.assign(
        {},
        window.SimpAICanvasWorkbenchRunRefreshWait || {},
        { createCanvasRunRefreshWaitController }
    );
})();
