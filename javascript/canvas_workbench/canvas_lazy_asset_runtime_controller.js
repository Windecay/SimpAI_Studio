(function () {
    'use strict';

    function createCanvasLazyAssetRuntimeController(context) {
        const scope = context?.lazyAssetRuntimeSource || context || {};
        const runtimeSource = scope.runtimeSource || {};
        const call = (source, name, fallback, ...args) => typeof source?.[name] === 'function'
            ? source[name](...args)
            : fallback;
        let layerForgeScriptPromise = null;

        function loadLayerForgeScripts() {
            if (typeof call(runtimeSource, 'getLayerForgeAdapter', null)?.open === 'function') {
                return Promise.resolve(true);
            }
            if (layerForgeScriptPromise) return layerForgeScriptPromise;
            layerForgeScriptPromise = (async () => {
                const doc = call(runtimeSource, 'getDocument', null);
                const path = 'javascript/layerforge_integration.js';
                const candidates = [...new Set([
                    call(runtimeSource, 'workbenchStaticFilePath', '', path),
                    `/gradio_api/file=${path}`
                ].filter(Boolean))];
                for (const src of candidates) {
                    const loaded = await new Promise((resolve) => {
                        const script = doc.createElement('script');
                        script.src = `${src}${src.includes('?') ? '&' : '?'}v=${Date.now()}`;
                        script.onload = () => {
                            const ready = typeof call(runtimeSource, 'getLayerForgeAdapter', null)?.open === 'function';
                            if (!ready) script.remove();
                            resolve(ready);
                        };
                        script.onerror = () => {
                            script.remove();
                            resolve(false);
                        };
                        doc.head.appendChild(script);
                    });
                    if (loaded) return true;
                }
                throw new Error('LayerForge adapter did not initialize');
            })().catch((err) => {
                layerForgeScriptPromise = null;
                throw err;
            });
            return layerForgeScriptPromise;
        }

        function hasLazyAssetGroupLoader(groupName) {
            return typeof call(runtimeSource, 'getLazyAssetGroupLoader', null) === 'function'
                || (groupName === 'layerForge' && typeof runtimeSource.getDocument === 'function');
        }

        async function loadLazyAssetGroup(groupName) {
            const sharedLoader = call(runtimeSource, 'getLazyAssetGroupLoader', null);
            if (typeof sharedLoader === 'function') {
                try {
                    await sharedLoader(groupName);
                } catch (err) {
                    if (groupName !== 'layerForge') throw err;
                    call(runtimeSource, 'warn', undefined,
                        '[SimpAI Canvas] LayerForge asset group failed; retrying scripts', err);
                }
            }
            if (groupName === 'layerForge'
                && typeof call(runtimeSource, 'getLayerForgeAdapter', null)?.open !== 'function') {
                await loadLayerForgeScripts();
            }
        }

        async function ensureWorkbenchLazyRuntime(groupName, isReady, loadingMessage, failureMessage) {
            if (typeof isReady === 'function' && isReady()) return true;
            if (hasLazyAssetGroupLoader(groupName)) {
                if (loadingMessage) call(runtimeSource, 'showToast', undefined, loadingMessage);
                try {
                    await loadLazyAssetGroup(groupName);
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
