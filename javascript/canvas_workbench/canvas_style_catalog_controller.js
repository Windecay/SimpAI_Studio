(function () {
    'use strict';

    function createCanvasStyleCatalogController(context) {
        const source = context?.styleCatalogSource || context || {};
        const read = (name, fallback) => typeof source[name] === 'function' ? source[name]() : fallback;

        function mergeChoices(items) {
            const merged = [];
            (items || []).forEach((item) => {
                const text = String(item || '').trim();
                if (text && !merged.includes(text)) merged.push(text);
            });
            return merged;
        }

        function getStyleCatalogEntries() {
            const catalog = read('getStyleCatalog', {}) || {};
            const rawEntries = Array.isArray(catalog.entries)
                ? catalog.entries
                : (Array.isArray(catalog.styles) ? catalog.styles : []);
            const rawNames = Array.isArray(catalog.names) ? catalog.names : [];
            const entries = [];
            const seen = new Set();
            const add = (item) => {
                const data = typeof item === 'string' ? { name: item } : (item && typeof item === 'object' ? item : {});
                const name = String(data.name || data.style || '').trim();
                if (!name || seen.has(name)) return;
                seen.add(name);
                entries.push({
                    name,
                    prompt: data.prompt || '',
                    negative_prompt: data.negative_prompt || data.negative || ''
                });
            };
            rawEntries.forEach(add);
            rawNames.forEach(add);
            return entries;
        }

        function getRoots() {
            const roots = [];
            const appRoot = read('getGradioApp', null);
            const documentRoot = read('getDocument', null);
            if (appRoot) roots.push(appRoot);
            if (documentRoot && !roots.includes(documentRoot)) roots.push(documentRoot);
            return roots;
        }

        function getStyleChoicesFromDom() {
            const found = [];
            const add = (value) => {
                const text = String(value || '').trim();
                if (text && text !== 'on' && !found.includes(text)) found.push(text);
            };
            getRoots().forEach((root) => {
                if (!root || !root.querySelectorAll) return;
                root.querySelectorAll('.style-button[data-style-name]').forEach(button => add(button.getAttribute('data-style-name') || button.textContent));
                root.querySelectorAll('.style_selections input[type="checkbox"]').forEach(input => add(input.value));
                root.querySelectorAll('.style_selections label').forEach(label => add(label.textContent));
            });
            return found;
        }

        function getStylePreviewCatalogFromDom() {
            const catalog = new Map();
            getStyleCatalogEntries().forEach((data) => {
                const name = String(data?.name || '').trim();
                if (name && !catalog.has(name)) catalog.set(name, data);
            });
            getRoots().forEach((root) => {
                if (!root || !root.querySelectorAll) return;
                root.querySelectorAll('.style-tooltip-target[data-style-data]').forEach((item) => {
                    const raw = item.getAttribute('data-style-data') || '';
                    if (!raw) return;
                    try {
                        const data = JSON.parse(raw);
                        const name = String(data?.name || item.querySelector?.('.style-button')?.getAttribute('data-style-name') || '').trim();
                        if (name && !catalog.has(name)) catalog.set(name, data);
                    } catch (err) {}
                });
            });
            return catalog;
        }

        function getStyleChoices(node, selected, defaults) {
            return mergeChoices([
                ...(selected || []),
                ...(defaults || []),
                ...getStyleCatalogEntries().map(item => item.name),
                ...getStyleChoicesFromDom(),
                ...(read('getFallbackChoices', []) || []),
                ...(node?.config?.catalog?.styles || [])
            ]);
        }

        function getStyleChoicesFromCatalog() {
            return getStyleCatalogEntries().map(item => item.name);
        }

        return { getStyleCatalogEntries, getStyleChoicesFromCatalog, getStyleChoicesFromDom, getStylePreviewCatalogFromDom, getStyleChoices };
    }

    window.SimpAICanvasWorkbenchStyleCatalog = { createCanvasStyleCatalogController };
})();
