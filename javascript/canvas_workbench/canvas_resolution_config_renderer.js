(function () {
    'use strict';

    function createCanvasResolutionConfigRenderer(context) {
        const source = context?.resolutionConfigRendererSource || context || {};
        const call = (name, fallback, ...args) => typeof source[name] === 'function'
            ? source[name](...args)
            : fallback;
        const escapeHtml = value => call('escapeHtml', String(value ?? ''), value);
        const translate = (...args) => call('t', args[1] || args[0] || '', ...args);
        const optionHtml = (...args) => call('optionHtml', '', ...args);

        function resolutionAspectOptionsHtml(ratios, selected, values, preview) {
            const choices = Array.isArray(ratios) && ratios.length ? ratios : ['1024*1024'];
            const current = String(selected || choices[0] || '');
            const customLabel = call('resolutionManualSizeLabel', '', values, preview);
            const options = [];
            if (customLabel) {
                options.push(`<option data-resolution-custom-size="true" value="${escapeHtml(current)}" selected>${escapeHtml(customLabel)}</option>`);
                choices.forEach((choice) => {
                    const value = String(choice || '');
                    options.push(`<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`);
                });
                return options.join('');
            }
            return optionHtml(choices, current);
        }

        function renderResolutionConfigNodeHtml(node) {
            const values = call('getResolutionRenderValues', {}, node);
            const choices = call('getResolutionChoices', { templates: [], ratios: {}, flatRatios: [], quantizeSteps: [], editModes: [] });
            const template = call('normalizeResolutionTemplateName', '', values.template || values.default_template || values.available_aspect_ratios_selection, choices);
            const profileRatios = Array.isArray(values.profile?.aspect_ratios) ? values.profile.aspect_ratios : [];
            const usesProfileRatios = template === 'Preset' && profileRatios.length;
            const ratios = usesProfileRatios ? profileRatios : (choices.ratios[template] || choices.flatRatios);
            const templates = profileRatios.length ? ['Preset', ...choices.templates.filter(item => item !== 'Preset')] : choices.templates;
            const preview = call('getResolutionPreview', {}, values, ratios);
            const disabled = values.profile && values.profile.interactive === false;
            const randomAspect = !!(values.random_aspect_ratio || values.random_aspect_ratio_checkbox);
            const sizeControlsDisabled = disabled || randomAspect;
            const randomSummary = randomAspect ? ` / ${escapeHtml(translate('random size from template', '从模板随机尺寸'))}` : '';
            const aspectValue = values.aspect_ratio || ratios[0] || '';
            const editModeLabels = {
                proportional: translate('Proportional', '等比'),
                crop: translate('Crop', '裁剪'),
                scale: translate('Scale', '缩放'),
                pad: translate('Pad', '填充')
            };
            const nodeBadges = call('renderNodeStateBadges', '', node);

            return `
<div class="sai-node-head">
  <span class="sai-node-kind">${escapeHtml(translate('Resolution', '分辨率'))}</span>
  <span class="sai-node-title">${escapeHtml(node.title || translate('Resolution Config', '分辨率配置'))}</span>
  ${nodeBadges}
  <button type="button" data-node-action="delete" title="${escapeHtml(translate('Delete', '删除'))}"><i class="fa-solid fa-xmark"></i></button>
</div>
<div class="sai-config-node-body sai-resolution-config-panel">
  <div class="sai-resolution-top-grid">
    <label class="sai-node-field"><span>${escapeHtml(translate('Template', '模板'))}</span><select data-config-param="template" ${disabled ? 'disabled' : ''}>${optionHtml(templates, template)}</select></label>
    <label class="sai-node-field"><span>${escapeHtml(translate('Image Size', '图片尺寸'))}</span><select data-config-param="aspect_ratio" data-resolution-aspect-select ${sizeControlsDisabled ? 'disabled' : ''}>${resolutionAspectOptionsHtml(ratios, aspectValue, values, preview)}</select></label>
  </div>
  <div class="sai-resolution-size-grid sai-collapsed-keep">
    <label class="sai-node-field sai-collapsed-keep"><span>${escapeHtml(translate('Width', '宽度'))}</span><input data-config-param="width" data-resolution-live-param="width" type="number" min="-1" max="4096" step="1" value="${escapeHtml(values.width ?? -1)}" ${sizeControlsDisabled ? 'disabled' : ''}></label>
    <label class="sai-node-field sai-collapsed-keep"><span>${escapeHtml(translate('Height', '高度'))}</span><input data-config-param="height" data-resolution-live-param="height" type="number" min="-1" max="4096" step="1" value="${escapeHtml(values.height ?? -1)}" ${sizeControlsDisabled ? 'disabled' : ''}></label>
    <label class="sai-node-field"><span>${escapeHtml(translate('Normalize', '规整'))}</span><select data-config-param="quantize" ${disabled ? 'disabled' : ''}>${optionHtml(choices.quantizeSteps, values.quantize || 8)}</select></label>
    <label class="sai-node-field"><span>${escapeHtml(translate('Scale', '缩放'))} <b data-resolution-multiplier-label>${escapeHtml(Number(values.multiplier ?? 1).toFixed(1))}x</b></span><input data-config-param="multiplier" type="range" min="1" max="2" step="0.1" value="${escapeHtml(values.multiplier ?? 1)}" ${disabled ? 'disabled' : ''}></label>
  </div>
  <div class="sai-resolution-mode-row">
    ${choices.editModes.map(mode => `<button type="button" data-config-mode="${escapeHtml(mode)}" class="${String(values.edit_mode || 'proportional') === String(mode) ? 'is-active' : ''}" ${disabled ? 'disabled' : ''}>${escapeHtml(editModeLabels[mode] || call('tOption', mode, mode, { proportional: '等比', crop: '裁剪', scale: '缩放', pad: '填充' }))}</button>`).join('')}
  </div>
  <div class="sai-resolution-option-row">
    <label class="sai-node-check"><input data-config-param="random_aspect_ratio" type="checkbox" ${randomAspect ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span>${escapeHtml(translate('Random Size', '随机尺寸'))}</span></label>
  </div>
  <div class="sai-resolution-ratio-grid">
    <label class="sai-node-check"><input data-config-param="ratio_lock" type="checkbox" ${values.ratio_lock ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span>${escapeHtml(translate('Ratio Lock', '比例锁定'))}</span></label>
    <label class="sai-node-field"><span>${escapeHtml(translate('Locked Ratio', '锁定比例值'))}</span><select data-config-param="ratio_lock_value" ${disabled ? 'disabled' : ''}>${optionHtml(['current', '1:1', '9:16', '3:4', '4:3', '16:9', 'custom'], values.ratio_lock_value || 'current')}</select></label>
    <label class="sai-node-field"><span>${escapeHtml(translate('Custom Ratio', '自定义比例'))}</span><input data-config-param="ratio_lock_custom" value="${escapeHtml(values.ratio_lock_custom || '1:1')}" ${disabled ? 'disabled' : ''}></label>
  </div>
  <div class="sai-resolution-summary">${escapeHtml(preview.baseLabel)} ${escapeHtml(translate('base', '基础'))} -> ${escapeHtml(preview.label)} ${escapeHtml(translate('effective', '生效'))}${randomSummary}${disabled ? ` / ${escapeHtml(translate('preset locked', '预设锁定'))}` : ''}</div>
  <div class="sai-resolution-drag-area" data-resolution-drag-area title="${escapeHtml(translate('Drag to adjust width and height', '拖动调整宽高'))}">
    <div class="sai-resolution-preview-box" style="width:${preview.boxW}%;height:${preview.boxH}%">
      <span>${escapeHtml(preview.label)}</span>
      <i data-resolution-drag-handle></i>
    </div>
  </div>
</div>
<button type="button" class="sai-node-handle sai-node-handle-out" data-handle-out="config" title="${escapeHtml(translate('Config output', '配置输出'))}"></button>`;
        }

        return { renderResolutionConfigNodeHtml };
    }

    window.SimpAICanvasWorkbenchResolutionConfigRenderer = { createCanvasResolutionConfigRenderer };
})();
