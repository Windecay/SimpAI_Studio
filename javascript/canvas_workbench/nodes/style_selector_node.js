(function () {
    'use strict';

    const DEFAULT_UTILS = typeof window !== 'undefined' ? window.SimpAICanvasWorkbenchUtils || {} : {};
    const escapeHtmlFallback = (value) => String(value ?? '');
    const translateFallback = (en, cn) => cn || en;

    function call(context, name, fallback, ...args) {
        return typeof context?.[name] === 'function' ? context[name](...args) : fallback;
    }

    function delegate(context, name) {
        if (typeof context?.[name] !== 'function') return undefined;
        return (...args) => context[name](...args);
    }

    function createStyleSelectorNodeContext(source) {
        const scope = source || {};
        const utilitySource = scope.utilitySource || {};
        const catalogSource = scope.catalogSource && typeof scope.catalogSource === 'object'
            ? scope.catalogSource
            : {};
        const pick = (group, name) => delegate(group, name) || delegate(scope, name);
        return {
            escapeHtml: pick(utilitySource, 'escapeHtml'),
            t: pick(utilitySource, 't'),
            applyStyleSelectorToPreset: pick(scope, 'applyStyleSelectorToPreset'),
            buildStyleSelectorStatePatch: pick(scope, 'buildStyleSelectorStatePatch'),
            getStyleTransferCatalogItems: delegate(catalogSource, 'getItems') || pick(scope, 'getStyleTransferCatalogItems'),
            defaultNodeSize: pick(scope, 'defaultNodeSize'),
            getNode: pick(scope, 'getNode'),
            isNodeLocked: pick(scope, 'isNodeLocked'),
            mutate: pick(scope, 'mutate'),
            nowIso: pick(scope, 'nowIso'),
            pushHistory: pick(scope, 'pushHistory'),
            pushHistoryBatch: pick(scope, 'pushHistoryBatch'),
            renderNodeStateBadges: pick(scope, 'renderNodeStateBadges'),
            scheduleSave: pick(scope, 'scheduleSave'),
            showToast: pick(scope, 'showToast'),
            styleSelectorTargetLabel: pick(scope, 'styleSelectorTargetLabel'),
            uid: pick(scope, 'uid')
        };
    }

    const DEFAULT_STYLE_SELECTOR_NODE_CONTEXT = createStyleSelectorNodeContext({
        utilitySource: {
            escapeHtml: DEFAULT_UTILS.escapeHtml || escapeHtmlFallback,
            t: DEFAULT_UTILS.t || translateFallback
        }
    });

    function contextOf(context) {
        return context || DEFAULT_STYLE_SELECTOR_NODE_CONTEXT;
    }

    function escapeHtmlValue(context, value) {
        const ctx = contextOf(context);
        return call(ctx, 'escapeHtml', escapeHtmlFallback(value), value);
    }

    function translateValue(context, en, cn) {
        const ctx = contextOf(context);
        return call(ctx, 't', translateFallback(en, cn), en, cn);
    }

    function createNode(world, options, context) {
        const opts = options || {};
        const position = world || { x: 0, y: 0 };
        const size = call(context, 'defaultNodeSize', { w: 390, h: 560 }, 'style_selector') || { w: 390, h: 560 };
        const updatedAt = call(context, 'nowIso', '');
        const node = {
            id: call(context, 'uid', 'style_selector-node', 'style_selector'),
            type: 'style_selector',
            x: Math.round(Number(position?.x || 0)),
            y: Math.round(Number(position?.y || 0)),
            w: size.w,
            h: size.h,
            title: opts.title || 'Style Selector',
            source: { kind: opts.source_kind || 'style_transfer_selector' }
        };
        Object.assign(node, call(context, 'buildStyleSelectorStatePatch', {
            style_selector: {
                selected_name: '',
                prompt: '',
                negative: '',
                target_preset_id: opts.targetPresetId || '',
                search: ''
            },
            text: { value: '', updated_at: updatedAt }
        }, node, {
            initialState: { target_preset_id: opts.targetPresetId || '' },
            initialText: { updated_at: updatedAt }
        }));
        return node;
    }

    function catalogItems(context) {
        const items = call(context, 'getStyleTransferCatalogItems', [], context);
        return Array.isArray(items) ? items.filter(item => item && item.name) : [];
    }

    function styleByName(name, context) {
        const wanted = String(name || '').trim();
        if (!wanted) return null;
        return catalogItems(context).find(item => String(item.name || '') === wanted) || null;
    }

    function styleSelectorStatePatch(node, context, options) {
        const fallback = {
            style_selector: Object.assign({
                selected_name: '',
                prompt: '',
                negative: '',
                target_preset_id: '',
                search: ''
            }, node?.style_selector || {}),
            text: Object.assign({ value: '', updated_at: '' }, node?.text || {})
        };
        const patch = call(context, 'buildStyleSelectorStatePatch', fallback, node, options);
        return patch && typeof patch === 'object' && (patch.style_selector || patch.text) ? patch : fallback;
    }

    function selectorState(node, context) {
        return styleSelectorStatePatch(node, context).style_selector;
    }

    function selectedStyle(node, context) {
        const patch = styleSelectorStatePatch(node, context);
        const state = patch.style_selector || {};
        const text = patch.text || {};
        return styleByName(state.selected_name, context) || (state.selected_name ? {
            name: state.selected_name,
            description: '',
            prompt: state.prompt || text.value || '',
            negative: state.negative || '',
            preview_url: ''
        } : null);
    }

    function getPrompt(node, context) {
        const patch = styleSelectorStatePatch(node, context);
        const style = selectedStyle(node, context);
        return String(style?.prompt || patch.style_selector?.prompt || patch.text?.value || '');
    }

    function getNegative(node, context) {
        const style = selectedStyle(node, context);
        return String(style?.negative || selectorState(node, context).negative || '');
    }

    function setSelectedStyle(node, name, context) {
        const style = styleByName(name, context);
        if (!node || !style) return null;
        const updatedAt = call(context, 'nowIso', '');
        const current = styleSelectorStatePatch(node, context);
        const fallback = {
            style_selector: Object.assign({}, current.style_selector || {}, {
                selected_name: style.name,
                prompt: style.prompt || '',
                negative: style.negative || ''
            }),
            text: Object.assign({}, current.text || {}, {
                value: style.prompt || '',
                updated_at: updatedAt
            })
        };
        const patch = call(context, 'buildStyleSelectorStatePatch', fallback, node, {
            statePatch: {
                selected_name: style.name,
                prompt: style.prompt || '',
                negative: style.negative || ''
            },
            textPatch: {
                value: style.prompt || '',
                updated_at: updatedAt
            }
        });
        Object.assign(node, patch && typeof patch === 'object' && (patch.style_selector || patch.text) ? patch : fallback);
        return style;
    }

    function linkedPresetLabel(node, context) {
        const state = selectorState(node, context);
        return call(context, 'styleSelectorTargetLabel', '', node, state.target_preset_id);
    }

    function renderCards(node, context) {
        const ctx = contextOf(context);
        const selected = selectedStyle(node, context);
        const selectedName = selected?.name || '';
        const items = catalogItems(context);
        if (!items.length) {
            return `<div class="sai-style-selector-empty">${escapeHtmlValue(ctx, translateValue(ctx, 'No Style Transfer assets found.', '未找到 Style Transfer 风格资源。'))}</div>`;
        }
        return items.map((item) => {
            const active = item.name === selectedName;
            const desc = item.description || item.name;
            return `<button type="button" class="sai-style-selector-card ${active ? 'is-selected' : ''}" data-style-selector-style="${escapeHtmlValue(ctx, item.name)}" data-style-selector-text="${escapeHtmlValue(ctx, [item.name, item.description, item.prompt].join(' ').toLowerCase())}" title="${escapeHtmlValue(ctx, desc)}">
  <span class="sai-style-selector-thumb">${item.preview_url ? `<img src="${escapeHtmlValue(ctx, item.preview_url)}" loading="lazy" alt="">` : '<i class="fa-solid fa-palette"></i>'}</span>
  <span class="sai-style-selector-card-title">${escapeHtmlValue(ctx, item.description || item.name)}</span>
</button>`;
        }).join('');
    }

    function renderSelectedPreview(node, context) {
        const ctx = contextOf(context);
        const style = selectedStyle(node, context);
        if (!style) {
            return `<div class="sai-style-selector-current is-empty">
  <i class="fa-solid fa-palette"></i>
  <span>${escapeHtmlValue(ctx, translateValue(ctx, 'Choose a style card to feed Style Transfer+.', '选择一个风格卡片后会写入 Style Transfer+。'))}</span>
</div>`;
        }
        return `<div class="sai-style-selector-current">
  <span class="sai-style-selector-current-thumb">${style.preview_url ? `<img src="${escapeHtmlValue(ctx, style.preview_url)}" loading="lazy" alt="">` : '<i class="fa-solid fa-palette"></i>'}</span>
  <span><b>${escapeHtmlValue(ctx, style.name)}</b><small>${escapeHtmlValue(ctx, style.description || translateValue(ctx, 'Style prompt ready', '风格提示词已就绪'))}</small></span>
</div>`;
    }

    function renderNodeHtml(node, context) {
        const ctx = contextOf(context);
        const state = selectorState(node, context);
        const linked = linkedPresetLabel(node, context);
        return `
<div class="sai-node-head">
  <span class="sai-node-kind">${escapeHtmlValue(ctx, translateValue(ctx, 'Style', '风格'))}</span>
  <span class="sai-node-title">${escapeHtmlValue(ctx, node.title || 'Style Selector')}</span>
  ${call(ctx, 'renderNodeStateBadges', '', node)}
  <button type="button" data-node-action="apply-style-selector" title="${escapeHtmlValue(ctx, translateValue(ctx, 'Apply and run linked Style Transfer+ preset', '应用并运行已连接的 Style Transfer+ preset'))}"><i class="fa-solid fa-paper-plane"></i></button>
  <button type="button" data-node-action="delete" title="${escapeHtmlValue(ctx, translateValue(ctx, 'Delete', '删除'))}"><i class="fa-solid fa-xmark"></i></button>
</div>
<div class="sai-style-selector-meta">
  <i class="fa-solid fa-link"></i>
  <span>${escapeHtmlValue(ctx, linked || translateValue(ctx, 'Link this node from a Style Transfer+ preset.', '从 Style Transfer+ preset 连接/创建此节点。'))}</span>
</div>
<label class="sai-node-field sai-style-selector-search-row">
  <span>${escapeHtmlValue(ctx, translateValue(ctx, 'Search', '搜索'))}</span>
  <input data-style-selector-search type="search" value="${escapeHtmlValue(ctx, state.search || '')}" placeholder="${escapeHtmlValue(ctx, translateValue(ctx, 'Filter styles...', '筛选风格...'))}" autocomplete="off">
</label>
${renderSelectedPreview(node, ctx)}
<div class="sai-style-selector-grid" data-style-selector-grid>
  ${renderCards(node, ctx)}
</div>
<button type="button" class="sai-node-primary" data-node-action="apply-style-selector"><i class="fa-solid fa-paper-plane"></i><span>${escapeHtmlValue(ctx, translateValue(ctx, 'Apply & Run', '应用并运行'))}</span></button>
<button type="button" class="sai-node-handle sai-node-handle-out" data-handle-out="text" title="${escapeHtmlValue(ctx, translateValue(ctx, 'Style prompt output', '风格提示词输出'))}"></button>`;
    }

    function renderInspector(node, context) {
        const ctx = contextOf(context);
        const style = selectedStyle(node, context);
        const linked = linkedPresetLabel(node, context) || translateValue(ctx, 'Not linked', '未连接');
        return `
<div class="sai-inspector-section">
  <h3>${escapeHtmlValue(ctx, node.title || 'Style Selector')}</h3>
  <label>${escapeHtmlValue(ctx, translateValue(ctx, 'Title', '标题'))}<input data-inspector-node-field="title" value="${escapeHtmlValue(ctx, node.title || '')}"></label>
  <div class="sai-inspector-kv"><span>${escapeHtmlValue(ctx, translateValue(ctx, 'Selected', '已选择'))}</span><b>${escapeHtmlValue(ctx, style?.name || translateValue(ctx, 'None', '无'))}</b></div>
  <div class="sai-inspector-kv"><span>${escapeHtmlValue(ctx, translateValue(ctx, 'Target', '目标'))}</span><b>${escapeHtmlValue(ctx, linked)}</b></div>
  <p>${escapeHtmlValue(ctx, translateValue(ctx, 'The selected style prompt is exposed as a text output and can feed preset prompt ports.', '选中的风格提示词会作为文本输出，可连接到 preset 的 prompt 接口。'))}</p>
</div>
<div class="sai-inspector-section">
  <h3>${escapeHtmlValue(ctx, translateValue(ctx, 'Prompt Preview', '提示词预览'))}</h3>
  <textarea readonly rows="7">${escapeHtmlValue(ctx, getPrompt(node, ctx))}</textarea>
</div>
${getNegative(node, context) ? `<div class="sai-inspector-section">
  <h3>${escapeHtmlValue(ctx, translateValue(ctx, 'Negative Prompt', '负向提示词'))}</h3>
  <textarea readonly rows="3">${escapeHtmlValue(ctx, getNegative(node, ctx))}</textarea>
</div>` : ''}
<div class="sai-inspector-actions">
  <button type="button" data-inspector-action="apply-style-selector"><i class="fa-solid fa-paper-plane"></i><span>${escapeHtmlValue(ctx, translateValue(ctx, 'Apply & Run', '应用并运行'))}</span></button>
  <button type="button" data-inspector-action="duplicate"><i class="fa-solid fa-copy"></i><span>${escapeHtmlValue(ctx, translateValue(ctx, 'Duplicate', '复制'))}</span></button>
  <button type="button" data-inspector-action="delete" class="danger"><i class="fa-solid fa-trash"></i><span>${escapeHtmlValue(ctx, translateValue(ctx, 'Delete', '删除'))}</span></button>
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
