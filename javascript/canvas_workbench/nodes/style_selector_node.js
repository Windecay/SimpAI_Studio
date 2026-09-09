(function () {
    'use strict';

    const UTILS = window.SimpAICanvasWorkbenchUtils || {};
    const escapeHtml = UTILS.escapeHtml || ((value) => String(value ?? ''));
    const t = UTILS.t || ((en, cn) => cn || en);

    function call(context, name, fallback, ...args) {
        return typeof context?.[name] === 'function' ? context[name](...args) : fallback;
    }

    function delegate(context, name) {
        if (typeof context?.[name] !== 'function') return undefined;
        return (...args) => context[name](...args);
    }

    function createStyleSelectorNodeContext(source) {
        const context = source || {};
        return {
            applyStyleSelectorToPreset: delegate(context, 'applyStyleSelectorToPreset'),
            defaultNodeSize: delegate(context, 'defaultNodeSize'),
            getNode: delegate(context, 'getNode'),
            isNodeLocked: delegate(context, 'isNodeLocked'),
            mutate: delegate(context, 'mutate'),
            nowIso: delegate(context, 'nowIso'),
            pushHistory: delegate(context, 'pushHistory'),
            pushHistoryBatch: delegate(context, 'pushHistoryBatch'),
            renderNodeStateBadges: delegate(context, 'renderNodeStateBadges'),
            scheduleSave: delegate(context, 'scheduleSave'),
            showToast: delegate(context, 'showToast'),
            styleSelectorTargetLabel: delegate(context, 'styleSelectorTargetLabel'),
            uid: delegate(context, 'uid')
        };
    }

    function createNode(world, options, context) {
        const opts = options || {};
        const position = world || { x: 0, y: 0 };
        const size = call(context, 'defaultNodeSize', { w: 390, h: 560 }, 'style_selector') || { w: 390, h: 560 };
        return {
            id: call(context, 'uid', 'style_selector-node', 'style_selector'),
            type: 'style_selector',
            x: Math.round(Number(position?.x || 0)),
            y: Math.round(Number(position?.y || 0)),
            w: size.w,
            h: size.h,
            title: opts.title || 'Style Selector',
            style_selector: {
                selected_name: '',
                prompt: '',
                negative: '',
                target_preset_id: opts.targetPresetId || '',
                search: ''
            },
            text: { value: '', updated_at: call(context, 'nowIso', new Date().toISOString()) },
            source: { kind: opts.source_kind || 'style_transfer_selector' }
        };
    }

    function catalogItems() {
        const items = window.SimpAIStyleTransferCatalog?.items;
        return Array.isArray(items) ? items.filter(item => item && item.name) : [];
    }

    function styleByName(name) {
        const wanted = String(name || '').trim();
        if (!wanted) return null;
        return catalogItems().find(item => String(item.name || '') === wanted) || null;
    }

    function selectorState(node) {
        node.style_selector = Object.assign({
            selected_name: '',
            prompt: '',
            negative: '',
            target_preset_id: '',
            search: ''
        }, node.style_selector || {});
        node.text = Object.assign({ value: '', updated_at: '' }, node.text || {});
        return node.style_selector;
    }

    function selectedStyle(node) {
        const state = selectorState(node);
        return styleByName(state.selected_name) || (state.selected_name ? {
            name: state.selected_name,
            description: '',
            prompt: state.prompt || node.text?.value || '',
            negative: state.negative || '',
            preview_url: ''
        } : null);
    }

    function getPrompt(node) {
        const style = selectedStyle(node);
        return String(style?.prompt || selectorState(node).prompt || node?.text?.value || '');
    }

    function getNegative(node) {
        const style = selectedStyle(node);
        return String(style?.negative || selectorState(node).negative || '');
    }

    function setSelectedStyle(node, name, context) {
        const style = styleByName(name);
        if (!node || !style) return null;
        const state = selectorState(node);
        state.selected_name = style.name;
        state.prompt = style.prompt || '';
        state.negative = style.negative || '';
        node.text = Object.assign({}, node.text || {}, {
            value: state.prompt,
            updated_at: call(context, 'nowIso', new Date().toISOString())
        });
        return style;
    }

    function linkedPresetLabel(node, context) {
        const state = selectorState(node);
        return call(context, 'styleSelectorTargetLabel', '', node, state.target_preset_id);
    }

    function renderCards(node) {
        const selected = selectedStyle(node);
        const selectedName = selected?.name || '';
        const items = catalogItems();
        if (!items.length) {
            return `<div class="sai-style-selector-empty">${escapeHtml(t('No Style Transfer assets found.', '未找到 Style Transfer 风格资源。'))}</div>`;
        }
        return items.map((item) => {
            const active = item.name === selectedName;
            const desc = item.description || item.name;
            return `<button type="button" class="sai-style-selector-card ${active ? 'is-selected' : ''}" data-style-selector-style="${escapeHtml(item.name)}" data-style-selector-text="${escapeHtml([item.name, item.description, item.prompt].join(' ').toLowerCase())}" title="${escapeHtml(desc)}">
  <span class="sai-style-selector-thumb">${item.preview_url ? `<img src="${escapeHtml(item.preview_url)}" loading="lazy" alt="">` : '<i class="fa-solid fa-palette"></i>'}</span>
  <span class="sai-style-selector-card-title">${escapeHtml(item.description || item.name)}</span>
</button>`;
        }).join('');
    }

    function renderSelectedPreview(node) {
        const style = selectedStyle(node);
        if (!style) {
            return `<div class="sai-style-selector-current is-empty">
  <i class="fa-solid fa-palette"></i>
  <span>${escapeHtml(t('Choose a style card to feed Style Transfer+.', '选择一个风格卡片后会写入 Style Transfer+。'))}</span>
</div>`;
        }
        return `<div class="sai-style-selector-current">
  <span class="sai-style-selector-current-thumb">${style.preview_url ? `<img src="${escapeHtml(style.preview_url)}" loading="lazy" alt="">` : '<i class="fa-solid fa-palette"></i>'}</span>
  <span><b>${escapeHtml(style.name)}</b><small>${escapeHtml(style.description || t('Style prompt ready', '风格提示词已就绪'))}</small></span>
</div>`;
    }

    function renderNodeHtml(node, context) {
        const state = selectorState(node);
        const linked = linkedPresetLabel(node, context);
        return `
<div class="sai-node-head">
  <span class="sai-node-kind">${escapeHtml(t('Style', '风格'))}</span>
  <span class="sai-node-title">${escapeHtml(node.title || 'Style Selector')}</span>
  ${call(context, 'renderNodeStateBadges', '', node)}
  <button type="button" data-node-action="apply-style-selector" title="${escapeHtml(t('Apply and run linked Style Transfer+ preset', '应用并运行已连接的 Style Transfer+ preset'))}"><i class="fa-solid fa-paper-plane"></i></button>
  <button type="button" data-node-action="delete" title="${escapeHtml(t('Delete', '删除'))}"><i class="fa-solid fa-xmark"></i></button>
</div>
<div class="sai-style-selector-meta">
  <i class="fa-solid fa-link"></i>
  <span>${escapeHtml(linked || t('Link this node from a Style Transfer+ preset.', '从 Style Transfer+ preset 连接/创建此节点。'))}</span>
</div>
<label class="sai-node-field sai-style-selector-search-row">
  <span>${escapeHtml(t('Search', '搜索'))}</span>
  <input data-style-selector-search type="search" value="${escapeHtml(state.search || '')}" placeholder="${escapeHtml(t('Filter styles...', '筛选风格...'))}" autocomplete="off">
</label>
${renderSelectedPreview(node)}
<div class="sai-style-selector-grid" data-style-selector-grid>
  ${renderCards(node)}
</div>
<button type="button" class="sai-node-primary" data-node-action="apply-style-selector"><i class="fa-solid fa-paper-plane"></i><span>${escapeHtml(t('Apply & Run', '应用并运行'))}</span></button>
<button type="button" class="sai-node-handle sai-node-handle-out" data-handle-out="text" title="${escapeHtml(t('Style prompt output', '风格提示词输出'))}"></button>`;
    }

    function renderInspector(node, context) {
        const style = selectedStyle(node);
        const linked = linkedPresetLabel(node, context) || t('Not linked', '未连接');
        return `
<div class="sai-inspector-section">
  <h3>${escapeHtml(node.title || 'Style Selector')}</h3>
  <label>${escapeHtml(t('Title', '标题'))}<input data-inspector-node-field="title" value="${escapeHtml(node.title || '')}"></label>
  <div class="sai-inspector-kv"><span>${escapeHtml(t('Selected', '已选择'))}</span><b>${escapeHtml(style?.name || t('None', '无'))}</b></div>
  <div class="sai-inspector-kv"><span>${escapeHtml(t('Target', '目标'))}</span><b>${escapeHtml(linked)}</b></div>
  <p>${escapeHtml(t('The selected style prompt is exposed as a text output and can feed preset prompt ports.', '选中的风格提示词会作为文本输出，可连接到 preset 的 prompt 接口。'))}</p>
</div>
<div class="sai-inspector-section">
  <h3>${escapeHtml(t('Prompt Preview', '提示词预览'))}</h3>
  <textarea readonly rows="7">${escapeHtml(getPrompt(node))}</textarea>
</div>
${getNegative(node) ? `<div class="sai-inspector-section">
  <h3>${escapeHtml(t('Negative Prompt', '负向提示词'))}</h3>
  <textarea readonly rows="3">${escapeHtml(getNegative(node))}</textarea>
</div>` : ''}
<div class="sai-inspector-actions">
  <button type="button" data-node-action="apply-style-selector"><i class="fa-solid fa-paper-plane"></i><span>${escapeHtml(t('Apply & Run', '应用并运行'))}</span></button>
  <button type="button" data-inspector-action="duplicate"><i class="fa-solid fa-copy"></i><span>${escapeHtml(t('Duplicate', '复制'))}</span></button>
  <button type="button" data-inspector-action="delete" class="danger"><i class="fa-solid fa-trash"></i><span>${escapeHtml(t('Delete', '删除'))}</span></button>
</div>`;
    }

    function filterNodeDom(nodeEl, query) {
        const text = String(query || '').trim().toLowerCase();
        nodeEl?.querySelectorAll?.('[data-style-selector-style]').forEach((card) => {
            const hay = String(card.getAttribute('data-style-selector-text') || card.textContent || '').toLowerCase();
            card.style.display = !text || hay.includes(text) ? '' : 'none';
        });
    }

    window.SimpAICanvasWorkbenchStyleSelectorNode = {
        catalogItems,
        createStyleSelectorNodeContext,
        createNode,
        getNegative,
        getPrompt,
        renderInspector,
        renderNodeHtml,
        selectedStyle,
        setSelectedStyle,
        styleByName,
        selectorState,
        filterNodeDom
    };
})();
