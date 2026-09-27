(function () {
    'use strict';

    function createCanvasLazyAssetRuntimeController(context) {
        const scope = context?.lazyAssetRuntimeSource || context || {};
        const runtimeSource = scope.runtimeSource || {};
        const call = (source, name, fallback, ...args) => typeof source?.[name] === 'function'
            ? source[name](...args)
            : fallback;

        async function ensureWorkbenchLazyRuntime(groupName, isReady, loadingMessage, failureMessage) {
            if (typeof isReady === 'function' && isReady()) return true;
            if (call(runtimeSource, 'hasLazyAssetGroupLoader', false, groupName)) {
                if (loadingMessage) call(runtimeSource, 'showToast', undefined, loadingMessage);
                try {
                    await call(runtimeSource, 'loadLazyAssetGroup', undefined, groupName);
                } catch (err) {
                    call(runtimeSource, 'warn', undefined, `[SimpAI Canvas] Lazy asset group failed: ${groupName}`, err);
                }
            }
            if (typeof isReady === 'function' && isReady()) return true;
            if (failureMessage) call(runtimeSource, 'showToast', undefined, failureMessage);
            return false;
        }

        return { ensureWorkbenchLazyRuntime };
    }

    window.SimpAICanvasWorkbenchLazyAssetRuntime = Object.assign(
        {},
        window.SimpAICanvasWorkbenchLazyAssetRuntime || {},
        { createCanvasLazyAssetRuntimeController }
    );
})();
