(function () {
    'use strict';

    function createCanvasQwenTtsPresetsController(context) {
        const scope = context || {};
        const call = (name, fallback, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : fallback;
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
                const response = await call('sendCanvasQwenTtsPresetsRequest', { presets: [] });
                const entries = normalizeQwenTtsPresetEntries(response?.presets || []);
                if (entries.length) {
                    state = {
                        state: 'ready',
                        entries,
                        checkedAt: response?.checked_at || call('nowIso', new Date().toISOString()),
                        error: ''
                    };
                } else {
                    state = {
                        state: 'empty',
                        entries: [],
                        checkedAt: call('nowIso', new Date().toISOString()),
                        error: ''
                    };
                }
            } catch (err) {
                state = {
                    state: 'error',
                    entries: state.entries || [],
                    checkedAt: call('nowIso', new Date().toISOString()),
                    error: String(err?.message || err || 'Qwen TTS preset load failed')
                };
                if (!opts.silent) call('warn', null, '[SimpAI Canvas] qwen tts preset refresh failed:', err);
            }
            if (!opts.silent) call('mutate', null, { inspector: true });
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
