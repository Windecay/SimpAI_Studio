(function () {
    'use strict';

    function createCanvasTimingController(context) {
        const scope = context?.timingSource || context || {};
        const requestAnimationFrame = (...args) => typeof scope.requestAnimationFrame === 'function'
            ? scope.requestAnimationFrame(...args)
            : null;
        const cancelAnimationFrame = (...args) => typeof scope.cancelAnimationFrame === 'function'
            ? scope.cancelAnimationFrame(...args)
            : undefined;
        const performanceNow = () => {
            const value = Number(typeof scope.performanceNow === 'function' ? scope.performanceNow() : 0);
            return Number.isFinite(value) ? value : 0;
        };
        const now = () => {
            const value = Number(typeof scope.now === 'function' ? scope.now() : 0);
            return Number.isFinite(value) ? value : 0;
        };
        const waitNextFrame = () => new Promise((resolve) => {
            const handle = requestAnimationFrame(resolve);
            if (handle == null) resolve();
        });

        return {
            requestAnimationFrame,
            cancelAnimationFrame,
            performanceNow,
            now,
            waitNextFrame
        };
    }

    window.SimpAICanvasWorkbenchTiming = Object.assign(
        {},
        window.SimpAICanvasWorkbenchTiming || {},
        { createCanvasTimingController }
    );
})();
