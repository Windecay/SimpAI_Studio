(function () {
    'use strict';

    function createCanvasVlmModelOptions(context) {
        const scope = context || {};
        const languageSource = scope.languageSource || {};
        const modelSource = scope.modelSource || {};
        const utilitySource = scope.utilitySource || {};
        const t = typeof languageSource.t === 'function' ? languageSource.t : ((en, cn) => cn || en);
        const getLanguageState = typeof languageSource.getLanguageState === 'function'
            ? languageSource.getLanguageState
            : () => ({});
        const call = (source, name, fallback) => typeof source[name] === 'function'
            ? source[name]()
            : fallback;
        const versionChoices = () => {
            const value = call(modelSource, 'getVersionChoices', []);
            return Array.isArray(value) ? value : [];
        };
        const modelLabels = () => call(modelSource, 'getModelLabels', {}) || {};
        const modelCatalog = () => {
            const value = call(modelSource, 'getModelCatalog', []);
            return Array.isArray(value) ? value : [];
        };
        const escapeHtml = typeof utilitySource.escapeHtml === 'function'
            ? utilitySource.escapeHtml
            : value => String(value ?? '');

        function modelChoicesFor(current) {
            const choices = versionChoices();
            const value = String(current || '').trim();
            return value && !choices.includes(value) ? [value, ...choices] : choices.slice();
        }

        function modelDisplayLabel(model, fallback = '') {
            const value = String(model || '').trim();
            let label = String(modelLabels()[value] || fallback || value).trim() || value;
            const item = modelCatalog().find(entry => String(entry?.id || '').trim() === value);
            if (item?.vision_status === 'missing') {
                const state = getLanguageState() || {};
                const notice = t('Missing vision model', '缺少视觉模型', state);
                if (!label.includes(notice)) label = `${label} · ${notice}`;
            }
            return label;
        }

        function modelOptionsHtml(current) {
            const selected = String(current || '').trim();
            const choices = versionChoices();
            return modelChoicesFor(selected).map(model => {
                const missing = model === selected && !choices.includes(model);
                const label = modelDisplayLabel(model, missing ? `⚠ ${model}` : model);
                return `<option value="${escapeHtml(model)}" ${model === selected ? 'selected' : ''}>${escapeHtml(label)}</option>`;
            }).join('');
        }

        return { modelChoicesFor, modelDisplayLabel, modelOptionsHtml };
    }

    window.SimpAICanvasWorkbenchVlmModelOptions = Object.assign({}, window.SimpAICanvasWorkbenchVlmModelOptions || {}, {
        createCanvasVlmModelOptions
    });
})();
