(function () {
    'use strict';

    function createCanvasTextNodeRenderer(context) {
        const scope = context || {};
        const t = scope.t || ((en, cn) => cn || en);
        const tOption = scope.tOption || ((value) => String(value ?? ''));
        const escapeHtml = scope.escapeHtml || (value => String(value ?? ''));
        const call = (name, fallback, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : fallback;
        const getNode = (...args) => call('getNode', null, ...args);
        const getNodeTextOutput = (...args) => call('getNodeTextOutput', '', ...args);
        const getTextNodeInputSource = (...args) => call('getTextNodeInputSource', null, ...args);
        const textMergeInputSlots = (...args) => call('textMergeInputSlots', [], ...args);
        const getTextMergeInputSource = (...args) => call('getTextMergeInputSource', null, ...args);
        const getTextMergeOutput = (...args) => call('getTextMergeOutput', '', ...args);
        const translationDirectionLabel = (...args) => call('translationDirectionLabel', '', ...args);
        const tagCartLabel = (...args) => call('tagCartLabel', t('Tag Cart', '标签选择器'), ...args);
        const localizedDefaultTitle = (...args) => call('localizedDefaultTitle', args[0] || args[1] || '', ...args);
        const renderIconHtml = (...args) => call('renderIconHtml', '<i class="fa-solid fa-tags"></i>', ...args);
        const renderNodeStateBadges = (...args) => call('renderNodeStateBadges', '', ...args);
        const renderTranslatableTextarea = (...args) => call('renderTranslatableTextarea', '', ...args);
        const getTranslationFieldState = (...args) => call('getTranslationFieldState', null, ...args);
        const danbooruAutocompleteAttrs = (...args) => call('danbooruAutocompleteAttrs', '', ...args);
        const notConnectedText = (...args) => call('notConnectedText', t('Not connected', '未连接'), ...args);

        function renderTextNodeHtml(node) {
            const source = getTextNodeInputSource(node);
            const value = getNodeTextOutput(node);
            return `
<div class="sai-node-head">
  <span class="sai-node-kind">${escapeHtml(t('Text', '文本'))}</span>
  <span class="sai-node-title">${escapeHtml(node.title || t('Text', '文本'))}</span>
  ${renderNodeStateBadges(node)}
  <button type="button" data-node-action="delete" title="${escapeHtml(t('Delete', '删除'))}"><i class="fa-solid fa-xmark"></i></button>
</div>
<div class="sai-text-input-row">
  <button type="button" class="sai-node-handle sai-node-handle-in" data-text-node-in title="${escapeHtml(t('Text input', '文本输入'))}"></button>
  <i class="fa-solid fa-align-left"></i><span>${escapeHtml(t('Input', '输入'))}</span><b>${source ? escapeHtml(source.title || source.id) : escapeHtml(t('Manual', '手动'))}</b>
</div>
<label class="sai-node-field sai-text-node-field"><span>${escapeHtml(t('Output', '输出'))} ${source ? `<small>${escapeHtml(t('linked', '已连接'))}</small>` : ''}</span>${renderTranslatableTextarea(`data-text-value rows="7" ${source ? 'readonly' : ''}`, value, { target: 'text-value', disabled: !!source, tagCart: !source, state: getTranslationFieldState(node, 'text-value', '', value) })}</label>
<button type="button" class="sai-node-handle sai-node-handle-out" data-handle-out="text" title="${escapeHtml(t('Text output', '文本输出'))}"></button>`;
        }

        function renderTextMergeNodeHtml(node) {
            const slots = textMergeInputSlots(node);
            const output = getTextMergeOutput(node, new Set([node.id]));
            const separator = String(node.params?.separator || '');
            const inputRows = slots.map((slot, index) => {
                const source = getTextMergeInputSource(node, slot);
                const removeButton = slots.length > 2
                    ? `<button type="button" data-node-action="text-merge-remove-input:${escapeHtml(slot)}" title="${escapeHtml(t('Remove input', '删除输入'))}"><i class="fa-solid fa-minus"></i></button>`
                    : '';
                return `
<div class="sai-text-input-row sai-text-merge-input-row">
  <button type="button" class="sai-node-handle sai-node-handle-in" data-text-node-in="${escapeHtml(slot)}" title="${escapeHtml(t('Text input {number}', '文本输入 {number}').replace('{number}', index + 1))}"></button>
  <i class="fa-solid fa-align-left"></i><span>${escapeHtml(t('Input {number}', '输入 {number}').replace('{number}', index + 1))}</span><b>${escapeHtml(source?.title || t('Not connected', '未连接'))}</b>${removeButton}
</div>`;
            }).join('');
            return `
<div class="sai-node-head">
  <span class="sai-node-kind">${escapeHtml(t('Text Merge', '文本合并'))}</span>
  <span class="sai-node-title">${escapeHtml(node.title || t('Multi-text Merge', '多文本合并'))}</span>
  ${renderNodeStateBadges(node)}
  <button type="button" data-node-action="delete" title="${escapeHtml(t('Delete', '删除'))}"><i class="fa-solid fa-xmark"></i></button>
</div>
<div class="sai-text-merge-inputs">${inputRows}</div>
<button type="button" class="sai-node-secondary" data-node-action="text-merge-add-input"><i class="fa-solid fa-plus"></i><span>${escapeHtml(t('Add input', '添加输入'))}</span></button>
<label class="sai-node-field"><span>${escapeHtml(t('Separator (optional)', '分隔符（可选）'))}</span><input data-text-merge-separator value="${escapeHtml(separator)}" placeholder="${escapeHtml(t('Empty, comma, space, or \\n', '留空、逗号、空格或 \\n'))}"></label>
<label class="sai-node-field sai-text-node-field"><span>${escapeHtml(t('Merged output', '合并输出'))}</span><textarea data-text-merge-output rows="5" readonly>${escapeHtml(output)}</textarea></label>
<button type="button" class="sai-node-handle sai-node-handle-out" data-handle-out="text" title="${escapeHtml(t('Text output', '文本输出'))}"></button>`;
        }

        function renderTranslationNodeHtml(node) {
            const source = getTextNodeInputSource(node);
            const input = source ? getNodeTextOutput(source) : (node.input_text || '');
            const value = String(node.text?.value || '');
            const state = node.status?.state || 'idle';
            const direction = node.params?.direction || 'toggle';
            return `
<div class="sai-node-head">
  <span class="sai-node-kind">${escapeHtml(t('Translate', '翻译'))}</span>
  <span class="sai-node-title">${escapeHtml(node.title || t('Translation', '翻译'))}</span>
  ${renderNodeStateBadges(node)}
  <button type="button" data-node-action="run-translation" title="${escapeHtml(t('Translate', '翻译'))}"><i class="fa-solid fa-play"></i></button>
  <button type="button" data-node-action="delete" title="${escapeHtml(t('Delete', '删除'))}"><i class="fa-solid fa-xmark"></i></button>
</div>
<div class="sai-text-input-row">
  <button type="button" class="sai-node-handle sai-node-handle-in" data-translation-text-in title="${escapeHtml(t('Text input', '文本输入'))}"></button>
  <i class="fa-solid fa-language"></i><span>${escapeHtml(t('Input', '输入'))}</span><b>${source ? escapeHtml(source.title || source.id) : escapeHtml(t('Manual', '手动'))}</b>
</div>
<label class="sai-node-field sai-text-node-field"><span>${escapeHtml(t('Source', '来源'))} ${source ? `<small>${escapeHtml(t('linked', '已连接'))}</small>` : ''}</span><textarea data-translation-input rows="4" ${source ? 'readonly' : ''}>${escapeHtml(input)}</textarea></label>
<label class="sai-node-field"><span>${escapeHtml(t('Direction', '方向'))}</span><select data-translation-param="direction">
  ${['toggle', 'zh_to_en', 'en_to_zh'].map(item => `<option value="${escapeHtml(item)}" ${item === direction ? 'selected' : ''}>${escapeHtml(translationDirectionLabel(item))}</option>`).join('')}
</select></label>
<label class="sai-node-field sai-text-node-field"><span>${escapeHtml(t('Output', '输出'))} ${state ? `<small>${escapeHtml(state)}</small>` : ''}</span>${renderTranslatableTextarea('data-text-value rows="5"', value, { target: 'text-value', state: getTranslationFieldState(node, 'text-value', '', value) })}</label>
<button type="button" class="sai-node-primary" data-node-action="run-translation"><i class="fa-solid fa-language"></i><span>${escapeHtml(t('Translate', '翻译'))}</span></button>
<button type="button" class="sai-node-handle sai-node-handle-out" data-handle-out="text" title="${escapeHtml(t('Text output', '文本输出'))}"></button>`;
        }

        function renderTagCartNodeHtml(node) {
            const source = getTextNodeInputSource(node);
            const value = String(node.text?.value || (source ? getNodeTextOutput(source) : ''));
            const params = node.params || {};
            const action = params.action === 'replace' ? 'replace' : 'append';
            return `
<div class="sai-node-head">
  <span class="sai-node-kind">${escapeHtml(tagCartLabel())}</span>
  <span class="sai-node-title">${escapeHtml(localizedDefaultTitle(node.title, 'Tag Cart', '标签选择器'))}</span>
  ${renderNodeStateBadges(node)}
  <button type="button" data-node-action="open-tag-cart" title="${escapeHtml(t('Open Tag Cart', '打开标签选择器'))}"><i class="fa-solid fa-clone"></i></button>
  <button type="button" data-node-action="delete" title="${escapeHtml(t('Delete', '删除'))}"><i class="fa-solid fa-xmark"></i></button>
</div>
<div class="sai-text-input-row">
  <button type="button" class="sai-node-handle sai-node-handle-in" data-tagcart-text-in title="${escapeHtml(t('Text input', '文本输入'))}"></button>
  <i class="fa-solid fa-tags"></i><span>${escapeHtml(t('Base', '基础'))}</span><b>${source ? escapeHtml(source.title || source.id) : escapeHtml(t('Manual', '手动'))}</b>
</div>
<div class="sai-node-field-row">
  <label><span>${escapeHtml(t('Write', '写入'))}</span><select data-tagcart-param="action">
    ${['append', 'replace'].map(item => `<option value="${item}" ${item === action ? 'selected' : ''}>${escapeHtml(tOption(item, { append: '追加', replace: '替换' }))}</option>`).join('')}
  </select></label>
</div>
<label class="sai-node-field sai-text-node-field"><span>${escapeHtml(t('Output', '输出'))} ${source ? `<small>${escapeHtml(t('base linked', '基础已连接'))}</small>` : ''}</span>${renderTranslatableTextarea('data-text-value rows="7"', value, { target: 'text-value', tagCart: false, state: getTranslationFieldState(node, 'text-value', '', value) })}</label>
<div class="sai-tag-cart-inline-host" data-tag-cart-inline-host>
  <button type="button" class="sai-tag-cart-inline-reopen" data-node-action="open-tag-cart">
    ${renderIconHtml('sai-tag-cart-glyph')}
    <span>${escapeHtml(t('Open Tag Cart', '打开标签选择器'))}</span>
  </button>
</div>
<button type="button" class="sai-node-handle sai-node-handle-out" data-handle-out="text" title="${escapeHtml(t('Text output', '文本输出'))}"></button>`;
        }

        function renderWd14NodeHtml(node) {
            const inputNode = node.input_node_id ? getNode(node.input_node_id) : null;
            const params = node.params || {};
            const state = node.status?.state || 'idle';
            return `
<div class="sai-node-head">
  <span class="sai-node-kind">WD14</span>
  <span class="sai-node-title">${escapeHtml(node.title || 'WD14 Tagger')}</span>
  ${renderNodeStateBadges(node)}
  <button type="button" data-node-action="run-wd14" title="${escapeHtml(t('Run WD14', '运行 WD14'))}"><i class="fa-solid fa-play"></i></button>
  <button type="button" data-node-action="delete" title="${escapeHtml(t('Delete', '删除'))}"><i class="fa-solid fa-xmark"></i></button>
</div>
<div class="sai-wd14-input-row">
  <button type="button" class="sai-node-handle sai-node-handle-in" data-wd14-image-in title="${escapeHtml(t('Image input', '图像输入'))}"></button>
  <i class="fa-solid fa-image"></i><span>${escapeHtml(t('Image', '图像'))}</span><b>${inputNode ? escapeHtml(inputNode.title || inputNode.id) : escapeHtml(notConnectedText())}</b>
</div>
<div class="sai-node-field-row">
  <label><span>${escapeHtml(t('General', '通用'))}</span><input data-wd14-param="threshold" type="number" min="0" max="1" step="0.01" value="${escapeHtml(params.threshold ?? 0.35)}"></label>
  <label><span>${escapeHtml(t('Character', '角色'))}</span><input data-wd14-param="character_threshold" type="number" min="0" max="1" step="0.01" value="${escapeHtml(params.character_threshold ?? 0.85)}"></label>
</div>
  <label class="sai-node-field"><span>${escapeHtml(t('Exclude Tags', '排除标签'))}</span><input data-wd14-param="exclude_tags"${danbooruAutocompleteAttrs('exclude_tags')} value="${escapeHtml(params.exclude_tags || '')}"></label>
<label class="sai-node-field sai-text-node-field"><span>${escapeHtml(t('Output', '输出'))} ${state ? `<small>${escapeHtml(state)}</small>` : ''}</span>${renderTranslatableTextarea('data-text-value rows="6"', node.text?.value || '', { target: 'text-value', state: getTranslationFieldState(node, 'text-value', '', node.text?.value || '') })}</label>
<button type="button" class="sai-node-primary" data-node-action="run-wd14"><i class="fa-solid fa-tags"></i><span>${escapeHtml(t('Tag Image', '图像打标'))}</span></button>
<button type="button" class="sai-node-handle sai-node-handle-out" data-handle-out="text" title="${escapeHtml(t('Text output', '文本输出'))}"></button>`;
        }

        return {
            renderTextNodeHtml,
            renderTextMergeNodeHtml,
            renderTranslationNodeHtml,
            renderTagCartNodeHtml,
            renderWd14NodeHtml
        };
    }

    window.SimpAICanvasWorkbenchTextNodeRenderer = Object.assign({}, window.SimpAICanvasWorkbenchTextNodeRenderer || {}, {
        createCanvasTextNodeRenderer
    });
})();
