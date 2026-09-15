(function () {
    'use strict';

    function createCanvasQwenTtsPresetsController(context) {
        const scope = context?.qwenTtsPresetsSource || context || {};
        const requestSource = scope.requestSource || {};
        const stateSource = scope.stateSource || {};
        const timeSource = scope.timeSource || {};
        const diagnosticsSource = scope.diagnosticsSource || {};
        const call = (sourceObject, name, fallback, ...args) => typeof sourceObject[name] === 'function'
            ? sourceObject[name](...args)
            : fallback;
        const sendCanvasQwenTtsPresetsRequest = (...args) => call(
            requestSource,
            'sendCanvasQwenTtsPresetsRequest',
            null,
            ...args
        );
        const mutate = (...args) => call(stateSource, 'mutate', null, ...args);
        const nowIso = (...args) => call(timeSource, 'nowIso', '', ...args);
        const warn = (...args) => call(diagnosticsSource, 'warn', null, ...args);
        let state = {
            state: 'idle',
            entries: [],
            checkedAt: '',
            error: ''
        };

        function normalizeQwenTtsPresetEntries(entries) {
            const rows = [];
            const seen = new Set();
            (Array.isArray(entries) ? entries : []).forEach((entry) => {
                const rawName = Array.isArray(entry) ? entry[0] : entry?.name;
                const rawInstruction = Array.isArray(entry) ? entry[1] : entry?.instruction;
                const rawSource = Array.isArray(entry) ? entry[2] : entry?.source;
                const name = String(rawName || '').trim();
                const instruction = String(rawInstruction || '').trim();
                if (!name || !instruction || seen.has(name)) return;
                seen.add(name);
                rows.push({
                    name,
                    instruction,
                    source: String(rawSource || 'builtin')
                });
            });
            return rows;
        }

        function getQwenTtsStylePresetEntries() {
            return state.entries;
        }

        function getQwenTtsStylePresetState() {
            return Object.assign({}, state, { entries: state.entries.slice() });
        }

        async function refreshQwenTtsStylePresets(options) {
            const opts = options || {};
            if (state.state === 'loading') return state.entries;
            state = Object.assign({}, state, {
                state: 'loading',
                error: ''
            });
            try {
                const response = await sendCanvasQwenTtsPresetsRequest({ presets: [] });
                const entries = normalizeQwenTtsPresetEntries(response?.presets || []);
                if (entries.length) {
                    state = {
                        state: 'ready',
                        entries,
                        checkedAt: response?.checked_at || nowIso(),
                        error: ''
                    };
                } else {
                    state = {
                        state: 'empty',
                        entries: [],
                        checkedAt: nowIso(),
                        error: ''
                    };
                }
            } catch (err) {
                state = {
                    state: 'error',
                    entries: state.entries || [],
                    checkedAt: nowIso(),
                    error: String(err?.message || err || 'Qwen TTS preset load failed')
                };
                if (!opts.silent) warn('[SimpAI Canvas] qwen tts preset refresh failed:', err);
            }
            if (!opts.silent) mutate({ inspector: true });
            return state.entries;
        }

        return {
            normalizeQwenTtsPresetEntries,
            getQwenTtsStylePresetEntries,
            getQwenTtsStylePresetState,
            refreshQwenTtsStylePresets
        };
    }

    window.SimpAICanvasWorkbenchQwenTtsPresets = Object.assign({}, window.SimpAICanvasWorkbenchQwenTtsPresets || {}, {
        createCanvasQwenTtsPresetsController
    });
})();
