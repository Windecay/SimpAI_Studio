(function () {
    'use strict';

    function delegate(source, name) {
        if (typeof source?.[name] !== 'function') return null;
        return (...args) => source[name](...args);
    }

    function createCanvasPresetRunLockController(source) {
        const scope = source?.presetRunLockSource || source || {};
        const timeSource = scope.timeSource || {};
        const staleAfterMs = Number(scope.staleAfterMs || 15000);
        const now = delegate(timeSource, 'now') || delegate(scope, 'now') || (() => 0);
        const pendingPresetRuns = new Set();
        const pendingPresetRunStartedAt = new Map();

        function currentTime() {
            const value = Number(now());
            return Number.isFinite(value) ? value : 0;
        }

        function isPending(runKey) {
            return !!runKey && pendingPresetRuns.has(runKey);
        }

        function pendingAgeMs(runKey) {
            if (!runKey) return 0;
            const current = currentTime();
            const started = Number(pendingPresetRunStartedAt.get(runKey) || current);
            return current - started;
        }

        function markPending(runKey) {
            if (!runKey) return;
            pendingPresetRuns.add(runKey);
            pendingPresetRunStartedAt.set(runKey, currentTime());
        }

        function clearPending(runKey) {
            if (!runKey) return;
            pendingPresetRuns.delete(runKey);
            pendingPresetRunStartedAt.delete(runKey);
        }

        function recoverStale(runKey, options) {
            if (!isPending(runKey)) return false;
            const opts = options || {};
            if (opts.hasActiveResult || opts.hasActiveState || pendingAgeMs(runKey) <= staleAfterMs) return false;
            clearPending(runKey);
            return true;
        }

        return {
            getPendingPresetRuns: () => pendingPresetRuns,
            isPending,
            pendingAgeMs,
            markPending,
            clearPending,
            recoverStale,
            staleAfterMs
        };
    }

    window.SimpAICanvasWorkbenchPresetRunLock = Object.assign(
        {},
        window.SimpAICanvasWorkbenchPresetRunLock || {},
        { createCanvasPresetRunLockController }
    );
})();
