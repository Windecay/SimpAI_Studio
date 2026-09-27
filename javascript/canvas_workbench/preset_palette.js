(function () {
    'use strict';

    function createPresetPaletteController(context) {
        const scope = context?.presetPaletteSource || context || {};
        const languageSource = scope.languageSource || {};
        const utilitySource = scope.utilitySource || {};
        const catalogSource = scope.catalogSource || {};
        const domSource = scope.domSource || {};
        const worldSource = scope.worldSource || {};
        const nodeSource = scope.nodeSource || {};
        const uiSource = scope.uiSource || {};
        const runtimeSource = scope.runtimeSource || {};
        const t = typeof languageSource.t === 'function' ? languageSource.t : ((en, cn) => cn || en);
        const escapeHtml = typeof utilitySource.escapeHtml === 'function'
            ? utilitySource.escapeHtml
            : value => String(value ?? '');
        const localizeCanvasLabel = typeof utilitySource.localizeCanvasLabel === 'function'
            ? utilitySource.localizeCanvasLabel
            : value => value;

        function call(source, name, fallback, ...args) {
            return typeof source?.[name] === 'function' ? source[name](...args) : fallback;
        }

        function isPresetPaletteOpen() {
            const palette = call(domSource, 'getPalette', null);
            return !!(palette && !palette.hidden);
        }

        function renderPresetPalette() {
            const palette = call(domSource, 'getPalette', null);
            if (!palette) return;
            const search = palette.querySelector('.sai-canvas-palette-search');
            const list = palette.querySelector('.sai-canvas-palette-list');
            if (!search || !list) return;
            const query = String(search.value || '').trim().toLowerCase();
            const entryKindLabel = (entry) => {
                if (entry?.scene) {
                    const themes = Array.isArray(entry.themes)
                        ? entry.themes.map(item => localizeCanvasLabel(item)).filter(Boolean)
                        : [];
                    return themes.join(' / ') || localizeCanvasLabel('scene');
                }
                return localizeCanvasLabel(entry?.engine_type || 'image');
            };
            const entrySearchText = (entry) => [
                entry.name,
                entry.display_name,
                entry.backend_engine,
                entry.task_method,
                entry.engine_type,
                entryKindLabel(entry)
            ].filter(Boolean).join(' ').toLowerCase();
            const entries = (call(catalogSource, 'getPresetCatalog', []) || []).filter((entry) => {
                if (!query) return true;
                return entrySearchText(entry).includes(query);
            }).slice(0, 120);
            list.innerHTML = entries.map((entry) => `
<button type="button" data-preset-name="${escapeHtml(entry.name)}">
  <span>${escapeHtml(entry.display_name || entry.name)}</span>
  <b>${escapeHtml(entry.backend_engine || 'Backend')}</b>
  <small>${escapeHtml(entryKindLabel(entry))}</small>
</button>`).join('') || `<div class="sai-canvas-palette-empty">${escapeHtml(call(catalogSource, 'getPresetCatalogState', '') === 'loading' ? t('Loading preset definitions...', '正在加载 Preset 定义…') : t('No matching presets', '没有匹配的预设'))}</div>`;
        }

        function openPresetPalette(world) {
            call(worldSource, 'setLastPointerWorld', null, world || call(worldSource, 'viewportCenterWorld', { x: 0, y: 0 }));
            renderPresetPalette();
            const palette = call(domSource, 'getPalette', null);
            if (!palette) return;
            palette.hidden = false;
            const input = palette.querySelector('.sai-canvas-palette-search');
            if (!input) return;
            input.value = '';
            renderPresetPalette();
            const refresh = call(catalogSource, 'refreshPresetCatalog', null);
            refresh?.catch?.(() => {});
            call(runtimeSource, 'setTimeout', null, () => input.focus(), 0);
        }

        function closePresetPalette() {
            const palette = call(domSource, 'getPalette', null);
            if (palette) palette.hidden = true;
            call(uiSource, 'clearPendingInputTarget', null);
        }

        async function handlePresetPaletteClick(evt) {
            const palette = call(domSource, 'getPalette', null);
            if (!palette) return;
            if (evt.target === palette) closePresetPalette();
            const item = evt.target.closest('[data-preset-name]');
            if (!item) return;
            const name = item.getAttribute('data-preset-name');
            item.disabled = true;
            const entry = await call(catalogSource, 'resolvePresetCatalogEntry', null, name);
            item.disabled = false;
            if (!entry) {
                call(uiSource, 'showToast', null, t('Preset definition is not ready. Please reopen the preset list.', 'Preset 定义尚未加载，请重新打开 Preset 列表。'));
                return;
            }
            call(nodeSource, 'addPresetNode', null, entry, call(worldSource, 'getLastPointerWorld', null));
            closePresetPalette();
        }

        return {
            isPresetPaletteOpen,
            renderPresetPalette,
            openPresetPalette,
            closePresetPalette,
            handlePresetPaletteClick
        };
    }

    window.SimpAICanvasWorkbenchPresetPalette = Object.assign({}, window.SimpAICanvasWorkbenchPresetPalette || {}, {
        createPresetPaletteController
    });
})();
