(function () {
    'use strict';

    function createCanvasModelConfigRenderer(context) {
        const source = context?.modelConfigRendererSource || context || {};
        const call = (name, fallback, ...args) => typeof source[name] === 'function'
            ? source[name](...args)
            : fallback;
        const escapeHtml = value => call('escapeHtml', String(value ?? ''), value);
        const translate = (...args) => call('t', args[1] || args[0] || '', ...args);
        const optionHtml = (...args) => call('optionHtml', '', ...args);

        function modelSelectTitleAttr(value) {
            const text = String(value || '').trim();
            return text ? ` title="${escapeHtml(text)}"` : '';
        }

        function renderModelBrowserButton(attr, value, title) {
            const buttonTitle = title || translate('Browse models', '浏览模型');
            return `<button type="button" class="sai-model-config-browser-btn" ${attr}="${escapeHtml(value)}" title="${escapeHtml(buttonTitle)}" aria-label="${escapeHtml(buttonTitle)}"><i class="fa-solid fa-magnifying-glass"></i></button>`;
        }

        function renderModelConfigField(label, key, choices, value, preview = true, extraClass = '') {
            const attrs = preview ? ` data-hover-preview-kind="model" data-model-preview-param="${escapeHtml(key)}"` : '';
            const className = `sai-node-field${extraClass ? ` ${extraClass}` : ''}`;
            return `<label class="${className}"><span>${escapeHtml(label)}</span><div class="sai-model-config-select-row"><select data-config-param="${escapeHtml(key)}"${attrs}${modelSelectTitleAttr(value)}>${optionHtml(choices, value)}</select>${renderModelBrowserButton('data-model-browser-param', key)}</div></label>`;
        }

        function renderModelsConfigNodeHtml(node) {
            const values = node.config?.values || {};
            const choices = call('getModelChoices', {}, node);
            const loras = call('normalizeInitialConfigLoras', [], node.config?.defaults || {}, values);
            const useModelFilter = call('modelConfigUsesFilter', false, node);
            const nodeBadges = call('renderNodeStateBadges', '', node);

            return `
<div class="sai-node-head">
  <span class="sai-node-kind">${escapeHtml(translate('Models', '模型'))}</span>
  <span class="sai-node-title">${escapeHtml(node.title || translate('Models Config', '模型配置'))}</span>
  ${nodeBadges}
  <button type="button" data-node-action="delete" title="${escapeHtml(translate('Delete', '删除'))}"><i class="fa-solid fa-xmark"></i></button>
</div>
<div class="sai-config-node-body">
  <label class="sai-node-check sai-model-config-filter"><input data-config-model-filter type="checkbox" ${useModelFilter ? 'checked' : ''}><span>${escapeHtml(translate('Use model filter', '使用模型过滤'))}</span></label>
  ${renderModelConfigField(translate('Base Model', '基础模型'), 'base_model', choices.base_model, values.base_model, true, 'sai-collapsed-keep')}
  ${renderModelConfigField(translate('Refiner', '精修模型'), 'refiner_model', choices.refiner_model, values.refiner_model)}
  ${renderModelConfigField('CLIP', 'clip_model', choices.clip_model, values.clip_model, false)}
  ${renderModelConfigField('VAE', 'vae', choices.vae, values.vae, false)}
  ${renderModelConfigField(translate('Upscale Model', '放大模型'), 'upscale_model', choices.upscale_model, values.upscale_model || 'default')}
  <div class="sai-lora-config-list">
    ${loras.map((lora, index) => `<div class="sai-lora-config-row">
      <input data-config-lora-enabled="${index}" type="checkbox" ${lora.enabled ? 'checked' : ''} title="${escapeHtml(translate('Enable LoRA {index}', '启用 LoRA {index}').replace('{index}', index + 1))}">
      <div class="sai-model-config-select-row"><select data-config-lora-model="${index}" data-hover-preview-kind="lora" data-model-preview-lora-index="${index}"${modelSelectTitleAttr(lora.model || 'None')}>${optionHtml(choices.lora, lora.model || 'None')}</select>${renderModelBrowserButton('data-model-browser-lora-index', index, translate('Browse LoRA models', '浏览 LoRA 模型'))}</div>
      <input data-config-lora-weight="${index}" type="number" min="-4" max="4" step="0.05" value="${escapeHtml(lora.weight ?? 1)}">
    </div>`).join('')}
  </div>
</div>
<button type="button" class="sai-node-handle sai-node-handle-out" data-handle-out="config" title="${escapeHtml(translate('Config output', '配置输出'))}"></button>`;
        }

        return { renderModelsConfigNodeHtml };
    }

    window.SimpAICanvasWorkbenchModelConfigRenderer = { createCanvasModelConfigRenderer };
})();
