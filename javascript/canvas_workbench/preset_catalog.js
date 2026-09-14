(function () {
    'use strict';

    function createPresetCatalogService(context) {
        const scope = context?.presetCatalogSource || context || {};
        const languageSource = scope.languageSource || {};
        const utilitySource = scope.utilitySource || {};
        const systemSource = scope.systemSource || {};
        const apiSource = scope.apiSource || {};
        const userSource = scope.userSource || {};
        const paletteSource = scope.paletteSource || {};
        const nodeSource = scope.nodeSource || {};
        const stateSource = scope.stateSource || {};
        const uiSource = scope.uiSource || {};
        const diagnosticsSource = scope.diagnosticsSource || {};
        const callbackSources = {
            getSystemParams: systemSource,
            presetCatalog: apiSource,
            getWorkbenchUserContext: userSource,
            isPaletteOpen: paletteSource,
            renderPresetPalette: paletteSource,
            reconcilePresetNodesWithCatalog: nodeSource,
            mutate: stateSource,
            showToast: uiSource,
            isWorkbenchOpen: uiSource,
            renderAll: uiSource
        };
        const t = typeof languageSource.t === 'function' ? languageSource.t : ((en, cn) => cn || en);
        const normalizePresetName = typeof utilitySource.normalizePresetName === 'function'
            ? utilitySource.normalizePresetName
            : ((value) => String(value || '').trim());
        let authoritativePresetCatalog = null;
        let authoritativePresetCatalogPromise = null;
        let authoritativePresetCatalogState = 'idle';

        function call(name, fallback, ...args) {
            const sourceObject = callbackSources[name] || {};
            return typeof sourceObject[name] === 'function' ? sourceObject[name](...args) : fallback;
        }

        function warn(...args) {
            if (typeof diagnosticsSource.warn === 'function') {
                diagnosticsSource.warn(...args);
                return;
            }
            if (typeof console !== 'undefined' && typeof console.warn === 'function') console.warn(...args);
        }

        function normalizePresetCatalog(source) {
            const rows = [];
            if (Array.isArray(source)) {
                source.forEach((raw) => {
                    if (!raw || typeof raw !== 'object') return;
                    const name = normalizePresetName(raw.name || raw.display_name || '');
                    if (!name) return;
                    rows.push(Object.assign({ name, display_name: name }, raw, { name }));
                });
                return rows;
            }
            const meta = source && typeof source === 'object' ? source : {};
            Object.keys(meta).forEach((name) => {
                const clean = normalizePresetName(name);
                if (!clean) return;
                const raw = meta[name] && typeof meta[name] === 'object' ? meta[name] : {};
                const defaultEngine = raw.default_engine && typeof raw.default_engine === 'object' ? raw.default_engine : {};
                const backendParams = defaultEngine.backend_params && typeof defaultEngine.backend_params === 'object' ? defaultEngine.backend_params : {};
                rows.push(Object.assign({
                    name: clean,
                    display_name: clean,
                    task_method: raw.task_method || backendParams.task_method || '',
                    backend_engine: raw.backend_engine || backendParams.backend_engine || ''
                }, raw, { name: clean }));
            });
            return rows;
        }

        function sortPresetCatalog(entries) {
            return entries.sort((a, b) => Number(a.order || 0) - Number(b.order || 0) || String(a.name).localeCompare(String(b.name)));
        }

        function getPresetCatalog() {
            if (Array.isArray(authoritativePresetCatalog)) {
                return sortPresetCatalog(authoritativePresetCatalog.slice());
            }
            const systemParams = call('getSystemParams', {}) || {};
            const metaSource = systemParams.__canvas_preset_catalog || systemParams.__preset_store_meta || {};
            return sortPresetCatalog(normalizePresetCatalog(metaSource));
        }

        async function refreshPresetCatalog(options) {
            const force = !!options?.force;
            if (authoritativePresetCatalogPromise) return authoritativePresetCatalogPromise;
            if (!force && Array.isArray(authoritativePresetCatalog) && authoritativePresetCatalog.length) return authoritativePresetCatalog;
            authoritativePresetCatalogState = 'loading';
            if (call('isPaletteOpen', false)) call('renderPresetPalette');
            authoritativePresetCatalogPromise = Promise.resolve()
                .then(() => call('presetCatalog', null, {
                    user_context: call('getWorkbenchUserContext', {})
                }))
                .then((response) => {
                    const entries = normalizePresetCatalog(response?.presets || []);
                    if (!response?.ok || !entries.length) {
                        throw new Error(response?.details || response?.error || 'Preset catalog is empty');
                    }
                    authoritativePresetCatalog = entries;
                    authoritativePresetCatalogState = 'ready';
                    const repaired = Number(call('reconcilePresetNodesWithCatalog', 0, entries) || 0);
                    if (repaired > 0) {
                        call('mutate', null);
                        call('showToast', null, t('{count} preset node definition(s) refreshed.', '已刷新 {count} 个 Preset 节点定义。').replace('{count}', String(repaired)));
                    } else if (call('isWorkbenchOpen', false)) {
                        call('renderAll', null, { inspector: false });
                    }
                    return entries;
                })
                .catch((err) => {
                    authoritativePresetCatalogState = 'error';
                    warn('[SimpAI Canvas] preset catalog refresh failed', err);
                    return getPresetCatalog();
                })
                .finally(() => {
                    authoritativePresetCatalogPromise = null;
                    if (call('isPaletteOpen', false)) call('renderPresetPalette');
                });
            return authoritativePresetCatalogPromise;
        }

        async function resolvePresetCatalogEntry(name) {
            const clean = normalizePresetName(name || '');
            if (!clean) return null;
            const entries = await refreshPresetCatalog();
            return (Array.isArray(entries) ? entries : []).find(entry => normalizePresetName(entry.name || '') === clean) || null;
        }

        return {
            normalizePresetCatalog,
            sortPresetCatalog,
            getPresetCatalog,
            refreshPresetCatalog,
            resolvePresetCatalogEntry,
            getPresetCatalogState: () => authoritativePresetCatalogState
        };
    }

    window.SimpAICanvasWorkbenchPresetCatalog = Object.assign({}, window.SimpAICanvasWorkbenchPresetCatalog || {}, {
        createPresetCatalogService
    });
})();
