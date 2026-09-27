(function () {
    'use strict';

    function createCanvasDetectionConfigRenderer(context) {
        const source = context?.detectionConfigRendererSource || context || {};
        const call = (name, fallback, ...args) => typeof source[name] === 'function'
            ? source[name](...args)
            : fallback;
        const escapeHtml = value => call('escapeHtml', String(value ?? ''), value);
        const translate = (...args) => call('t', args[1] || args[0] || '', ...args);
        const optionHtml = (...args) => call('optionHtml', '', ...args);

        function renderDetectionConfigNodeHtml(node) {
            const values = node.config?.values || {};
            const choices = call('getDetectionChoices', {}, node);
            const maskModel = values.mask_model || 'sam';
            return `
<div class="sai-node-head">
  <span class="sai-node-kind">${escapeHtml(translate('Detection', '检测'))}</span>
  <span class="sai-node-title">${escapeHtml(node.title || translate('Detection Config', '检测配置'))}</span>
  ${call('renderNodeStateBadges', '', node)}
  <button type="button" data-node-action="delete" title="${escapeHtml(translate('Delete', '删除'))}"><i class="fa-solid fa-xmark"></i></button>
</div>
<div class="sai-config-node-body sai-detection-config-body">
  <label class="sai-node-field sai-collapsed-keep"><span>${escapeHtml(translate('Detection Prompt', '检测提示词'))}</span><input data-config-param="dino_prompt"${call('danbooruAutocompleteAttrs', '', 'dino_prompt')} value="${escapeHtml(values.dino_prompt || '')}"></label>
  <label class="sai-node-field sai-collapsed-keep"><span>${escapeHtml(translate('Mask Model', '遮罩模型'))}</span><select data-config-param="mask_model">${optionHtml(choices.maskModels, maskModel)}</select></label>
  ${maskModel === 'u2net_cloth_seg' ? `<label class="sai-node-field"><span>${escapeHtml(translate('Cloth Category', '服装类别'))}</span><select data-config-param="mask_cloth_category">${optionHtml(choices.clothCategories, values.mask_cloth_category || 'full')}</select></label>` : ''}
  ${maskModel === 'sam' ? `<div class="sai-inspector-grid2">
    <label class="sai-node-field"><span>${escapeHtml(translate('SAM Model', 'SAM 模型'))}</span><select data-config-param="mask_sam_model">${optionHtml(choices.samModels, values.mask_sam_model || 'vit_b')}</select></label>
    <label class="sai-node-field"><span>${escapeHtml(translate('Max Detect', '最大检测'))}</span><input data-config-param="mask_sam_max_detections" type="number" min="0" max="10" step="1" value="${escapeHtml(values.mask_sam_max_detections ?? 0)}"></label>
  </div>
  <div class="sai-inspector-grid2">
    <label class="sai-node-field sai-node-range"><span>${escapeHtml(translate('Text Threshold', '文本阈值'))}</span><div class="sai-range-pair"><input data-config-param="mask_text_threshold" type="range" min="0" max="1" step="0.05" value="${escapeHtml(values.mask_text_threshold ?? 0.25)}"><input data-config-param="mask_text_threshold" type="number" min="0" max="1" step="0.05" value="${escapeHtml(values.mask_text_threshold ?? 0.25)}"></div></label>
    <label class="sai-node-field sai-node-range"><span>${escapeHtml(translate('Box Threshold', '框阈值'))}</span><div class="sai-range-pair"><input data-config-param="mask_box_threshold" type="range" min="0" max="1" step="0.05" value="${escapeHtml(values.mask_box_threshold ?? 0.3)}"><input data-config-param="mask_box_threshold" type="number" min="0" max="1" step="0.05" value="${escapeHtml(values.mask_box_threshold ?? 0.3)}"></div></label>
  </div>` : ''}
  <label class="sai-node-field"><span>${escapeHtml(translate('Enhance Prompt', '增强提示词'))}</span><textarea data-config-param="prompt" rows="2"${call('danbooruAutocompleteAttrs', '', 'prompt')} placeholder="${escapeHtml(translate('Uses original prompt if empty.', '留空则使用原提示词。'))}">${escapeHtml(values.prompt || '')}</textarea></label>
  <label class="sai-node-field"><span>${escapeHtml(translate('Negative Prompt', '负向提示词'))}</span><textarea data-config-param="negative_prompt" rows="2"${call('danbooruAutocompleteAttrs', '', 'negative_prompt')} placeholder="${escapeHtml(translate('Uses original negative prompt if empty.', '留空则使用原负向提示词。'))}">${escapeHtml(values.negative_prompt || '')}</textarea></label>
  <div class="sai-inspector-grid2">
    <label class="sai-node-field sai-node-range"><span>${escapeHtml(translate('Denoise', '重绘幅度'))}</span><div class="sai-range-pair"><input data-config-param="inpaint_strength" type="range" min="0" max="1" step="0.05" value="${escapeHtml(values.inpaint_strength ?? 0.5)}"><input data-config-param="inpaint_strength" type="number" min="0" max="1" step="0.05" value="${escapeHtml(values.inpaint_strength ?? 0.5)}"></div></label>
    <label class="sai-node-field sai-node-range"><span>${escapeHtml(translate('Field', '作用范围'))}</span><div class="sai-range-pair"><input data-config-param="inpaint_respective_field" type="range" min="0" max="1" step="0.05" value="${escapeHtml(values.inpaint_respective_field ?? 0.2)}"><input data-config-param="inpaint_respective_field" type="number" min="0" max="1" step="0.05" value="${escapeHtml(values.inpaint_respective_field ?? 0.2)}"></div></label>
  </div>
  <label class="sai-node-field sai-node-range"><span>${escapeHtml(translate('Erode / Dilate', '腐蚀 / 膨胀'))}</span><div class="sai-range-pair"><input data-config-param="inpaint_erode_or_dilate" type="range" min="-64" max="64" step="1" value="${escapeHtml(values.inpaint_erode_or_dilate ?? 0)}"><input data-config-param="inpaint_erode_or_dilate" type="number" min="-64" max="64" step="1" value="${escapeHtml(values.inpaint_erode_or_dilate ?? 0)}"></div></label>
  <label class="sai-node-check"><input data-config-param="mask_invert" type="checkbox" ${values.mask_invert ? 'checked' : ''}><span>${escapeHtml(translate('Invert Mask', '反转遮罩'))}</span></label>
</div>
<button type="button" class="sai-node-handle sai-node-handle-out" data-handle-out="config" title="${escapeHtml(translate('Config output', '配置输出'))}"></button>`;
        }

        return { renderDetectionConfigNodeHtml };
    }

    window.SimpAICanvasWorkbenchDetectionConfigRenderer = { createCanvasDetectionConfigRenderer };
})();
