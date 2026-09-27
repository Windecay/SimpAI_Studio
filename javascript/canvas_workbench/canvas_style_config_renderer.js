(function () {
    'use strict';

    function createCanvasStyleConfigRenderer(context) {
        const source = context?.styleConfigRendererSource || context || {};
        const valueSource = source.styleValueSource || {};
        const catalogSource = source.styleCatalogSource || {};
        const utilitySource = source.utilitySource || {};
        const call = (target, name, fallback, ...args) => typeof target[name] === 'function'
            ? target[name](...args)
            : fallback;

        function renderStylesConfigNodeHtml(node) {
            const values = node.config?.values || {};
            const defaults = node.config?.defaults || {};
            const defaultSelected = call(valueSource, 'styleConfigSelectionFromValues', [], defaults, []);
            const selected = call(valueSource, 'styleConfigSelectionFromValues', defaultSelected, values, defaultSelected);
            const choices = call(catalogSource, 'getStyleChoices', selected, node, selected, defaultSelected);
            const previewCatalog = call(catalogSource, 'getStylePreviewCatalogFromDom', new Map());
            const selectedSet = new Set(selected);
            const escapeHtml = value => call(utilitySource, 'escapeHtml', String(value ?? ''), value);
            const translate = (...args) => call(utilitySource, 't', args[1] || args[0] || '', ...args);
            const displayStyleName = style => call(utilitySource, 'displayStyleName', '', style);
            const chips = selected.length
                ? selected.slice(0, 8).map(style => `<span>${escapeHtml(displayStyleName(style) || style)}</span>`).join('') + (selected.length > 8 ? `<small>+${selected.length - 8}</small>` : '')
                : `<em>${escapeHtml(translate('No styles selected', '未选择风格'))}</em>`;
            const styleListKeepClass = selected.length ? ' sai-collapsed-keep' : '';
            const renderBadges = call(utilitySource, 'renderNodeStateBadges', '', node);
            const hoverPreviewAttrs = payload => call(utilitySource, 'hoverPreviewAttrs', '', payload);

            return `
<div class="sai-node-head">
  <span class="sai-node-kind">${escapeHtml(translate('Styles', '风格'))}</span>
  <span class="sai-node-title">${escapeHtml(node.title || translate('Styles Config', '风格配置'))}</span>
  ${renderBadges}
  <button type="button" data-node-action="delete" title="${escapeHtml(translate('Delete', '删除'))}"><i class="fa-solid fa-xmark"></i></button>
</div>
<div class="sai-config-node-body sai-styles-config-body">
  <label class="sai-node-field"><span>${escapeHtml(translate('Search Styles', '搜索风格'))}</span><input data-style-config-search type="search" placeholder="${escapeHtml(translate('Filter style names', '筛选风格名称'))}" autocomplete="off"></label>
  <div class="sai-styles-config-summary sai-collapsed-keep">
    <b>${escapeHtml(String(selected.length))}</b><span>${escapeHtml(translate('selected', '已选'))}</span>
    <button type="button" data-style-config-action="reset"><i class="fa-solid fa-rotate-left"></i><span>${escapeHtml(translate('Reset', '重置'))}</span></button>
    <button type="button" data-style-config-action="clear"><i class="fa-solid fa-xmark"></i><span>${escapeHtml(translate('Clear', '清空'))}</span></button>
  </div>
  <div class="sai-styles-config-chips sai-collapsed-keep">${chips}</div>
  <div class="sai-styles-config-list${styleListKeepClass}">
    ${choices.length ? choices.map((style) => {
        const data = previewCatalog.get(style) || { name: style };
        const display = displayStyleName(style) || style;
        const attrs = hoverPreviewAttrs({
            kind: 'style',
            title: display,
            style,
            prompt: data.prompt || '',
            negative: data.negative_prompt || ''
        });
        return `<label class="sai-style-config-item" ${attrs} data-style-config-item="${escapeHtml(`${style} ${display}`.toLowerCase())}"><input data-config-style="${escapeHtml(style)}" type="checkbox" ${selectedSet.has(style) ? 'checked' : ''}><span>${escapeHtml(display)}</span></label>`;
    }).join('') : `<p>${escapeHtml(translate('No styles found in the main UI yet.', '主界面暂未读取到风格。'))}</p>`}
  </div>
</div>
<button type="button" class="sai-node-handle sai-node-handle-out" data-handle-out="config" title="${escapeHtml(translate('Config output', '配置输出'))}"></button>`;
        }

        return { renderStylesConfigNodeHtml };
    }

    window.SimpAICanvasWorkbenchStyleConfigRenderer = { createCanvasStyleConfigRenderer };
})();
