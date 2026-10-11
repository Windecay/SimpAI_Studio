(function () {
    'use strict';

    function createCanvasXyzMatrixModalRenderer(context) {
        const scope = context?.xyzMatrixModalRendererSource || context || {};
        const languageSource = scope.languageSource || {};
        const utilitySource = scope.utilitySource || {};
        const nodeSource = scope.nodeSource || {};
        const stateSource = scope.stateSource || {};
        const axisSource = scope.axisSource || {};
        const scriptSource = scope.scriptSource || {};
        const t = typeof languageSource.t === 'function' ? languageSource.t : ((en, cn) => cn || en);
        const escapeHtml = typeof utilitySource.escapeHtml === 'function' ? utilitySource.escapeHtml : value => String(value ?? '');
        const call = (source, name, fallback, ...args) => typeof source?.[name] === 'function'
            ? source[name](...args)
            : fallback;
        const getNode = (...args) => call(nodeSource, 'getNode', null, ...args);
        const defaultXyzPlotState = (...args) => call(stateSource, 'defaultXyzPlotState', { axes: {}, options: {}, mode: 'txt2img' }, ...args);
        const visibleXyzAxisOptions = (...args) => call(axisSource, 'visibleXyzAxisOptions', [], ...args) || [];
        const getXyzAxisOption = (...args) => call(axisSource, 'getXyzAxisOption', {}, ...args) || {};

    function renderXyzAxisValuesControl(state, axisName, option) {
        const axis = state.axes?.[axisName] || {};
        const choices = Array.isArray(option?.choices) ? option.choices.filter(value => value !== null && value !== undefined) : [];
        if (choices.length && !state.options.csv_mode && (!axis.values_text || axis.values?.length)) {
            const selected = new Set((axis.values || []).map(String));
            return `<select data-xyz-axis-choices="${axisName}" multiple size="5">${choices.map(choice => {
                const label = option.type === 'bool' ? (String(choice) === 'true' ? t('On', '开启') : t('Off', '关闭')) : String(choice) || t('Empty', '空值');
                return `<option value="${escapeHtml(choice)}" ${selected.has(String(choice)) ? 'selected' : ''}>${escapeHtml(label)}</option>`;
            }).join('')}</select>`;
        }
        return `<textarea data-xyz-axis-values="${axisName}" rows="3" ${option.label === 'Nothing' ? 'disabled' : ''} placeholder="${escapeHtml(option.type === 'str' ? '"value A", "value B"' : option.param_key ? '0.2, 0.4, 0.6' : '1, 2, 3')}">${escapeHtml(axis.values_text || '')}</textarea>`;
    }

    function renderXyzAxisRow(modal, axisName) {
        const state = modal.__xyzState || defaultXyzPlotState(getNode(modal.__sourceNodeId));
        const options = visibleXyzAxisOptions(modal.__xyzAxisOptions, state.mode);
        const axis = state.axes?.[axisName] || {};
        const option = getXyzAxisOption(options, axis.type || 'Nothing', state.mode);
        const unavailable = !!axis.type && !options.some(item => item.label === axis.type);
        const label = axisName.toUpperCase();
        const displayLabel = item => call(axisSource, 'localizeLabel', item.display_label || item.label, item.display_label || item.label);
        const limits = [option.min !== undefined && option.min !== null ? `${t('Min', '最小值')} ${option.min}` : '',
            option.max !== undefined && option.max !== null ? `${t('Max', '最大值')} ${option.max}` : '',
            option.step ? `${t('Step', '步长')} ${option.step}` : ''].filter(Boolean).join(' / ');
        return `
<div class="sai-xyz-axis-row" data-xyz-axis-row="${axisName}">
  <label><span>${escapeHtml(`${label} ${t('type', '类型')}`)}</span><select data-xyz-axis-type="${axisName}">
    ${unavailable ? `<option value="${escapeHtml(axis.type)}" selected disabled>${escapeHtml(t('Unavailable', '不可用'))}: ${escapeHtml(axis.type)}</option>` : ''}
    ${['preset', 'general'].map(group => `<optgroup label="${escapeHtml(group === 'preset' ? t('Preset parameters', '预设参数') : t('Common parameters', '通用参数'))}">${options.filter(item => (item.param_key ? 'preset' : 'general') === group).map(item => `<option value="${escapeHtml(item.label)}" ${!unavailable && item.label === option.label ? 'selected' : ''}>${escapeHtml(displayLabel(item))}</option>`).join('')}</optgroup>`).join('')}
  </select>${option.param_key ? `<small>${escapeHtml(option.param_key)}</small>` : ''}${limits ? `<small>${escapeHtml(limits)}</small>` : ''}</label>
  <label><span>${escapeHtml(`${label} ${t('values', '取值')}`)}</span>${renderXyzAxisValuesControl(state, axisName, option)}</label>
  <button type="button" data-xyz-fill-choices="${axisName}" ${Array.isArray(option.choices) && option.choices.length ? '' : 'disabled'} title="${escapeHtml(t('Fill all available choices', '填入全部可选项'))}"><i class="fa-solid fa-list-check"></i></button>
</div>`;
    }

    function renderXyzPreviewHtml(preview) {
        if (!preview) {
            return `<div class="sai-xyz-preview-empty">${escapeHtml(t('No preview', '尚未预览'))}</div>`;
        }
        if (!preview.ok) {
            const details = [
                preview.details || '',
                Array.isArray(preview.errors) ? preview.errors.map(item => item?.error || item?.message || item).filter(Boolean).join('; ') : ''
            ].filter(Boolean).join('\n');
            return `<div class="sai-xyz-preview-error"><b>${escapeHtml(preview.error || t('Preview failed', '预览失败'))}</b>${details ? `<pre>${escapeHtml(details)}</pre>` : ''}</div>`;
        }
        const grid = preview.grid || {};
        const variants = Array.isArray(preview.variants) ? preview.variants.slice(0, 8) : [];
        return `
<div class="sai-xyz-preview-summary">
  <span>${escapeHtml(t('Variants', '变体'))}<b>${Number(grid.variant_count || 0)}</b></span>
  <span>X<b>${Number(grid.x_count || 0)}</b></span>
  <span>Y<b>${Number(grid.y_count || 0)}</b></span>
  <span>Z<b>${Number(grid.z_count || 0)}</b></span>
  ${preview.execution_mode === 'preset_runs' ? '' : `<span>MP<b>${Number(grid.megapixels || 0)}</b></span>`}
  <span>${escapeHtml(t('Cost order', '成本顺序'))}<b>${escapeHtml((preview.processing_order || []).join(' > '))}</b></span>
</div>
<div class="sai-xyz-preview-list">
  ${variants.map(variant => `<div><b>${escapeHtml(variant.id)}</b><span>${escapeHtml(Object.values(variant.axis_labels || {}).filter(Boolean).join(' / ') || t('default', '默认'))}</span><code>seed ${escapeHtml(variant.resolved_seed)}</code></div>`).join('')}
</div>`;
    }

    function renderXyzPlotModalHtml(modal, source, state) {
        return `
<div class="sai-canvas-modal-panel sai-xyz-plot-panel">
  <div class="sai-canvas-modal-head">
    <span><i class="fa-solid fa-table-cells-large"></i>${escapeHtml(t('Parameter Comparison', '参数对比'))}</span>
    <button type="button" data-modal-close title="${escapeHtml(t('Close', '关闭'))}"><i class="fa-solid fa-xmark"></i></button>
  </div>
  <div class="sai-xyz-plot-body">
    <div class="sai-xyz-source-line">
      <span>${escapeHtml(t('Source', '来源'))}</span>
      <b>${escapeHtml(source?.title || source?.preset?.name || source?.id || '')}</b>
      ${source?.runtime?.scene_theme ? `<code>${escapeHtml(source.runtime.scene_theme)}</code>` : ''}
    </div>
    <div class="sai-xyz-axis-table">
      ${['x', 'y', 'z'].map(axisName => renderXyzAxisRow(modal, axisName)).join('')}
    </div>
    <div class="sai-xyz-swap-row">
      <button type="button" data-xyz-swap="x:y"><i class="fa-solid fa-right-left"></i><span>${escapeHtml(t('Swap X/Y axes', '交换 X/Y 轴'))}</span></button>
      <button type="button" data-xyz-swap="y:z"><i class="fa-solid fa-right-left"></i><span>${escapeHtml(t('Swap Y/Z axes', '交换 Y/Z 轴'))}</span></button>
      <button type="button" data-xyz-swap="x:z"><i class="fa-solid fa-right-left"></i><span>${escapeHtml(t('Swap X/Z axes', '交换 X/Z 轴'))}</span></button>
    </div>
    <div class="sai-xyz-options-grid">
      <label class="sai-node-check"><input data-xyz-option="stop_on_error" type="checkbox" ${state.options.stop_on_error !== false ? 'checked' : ''}><span>${escapeHtml(t('Stop on error', '遇错停止'))}</span></label>
      <label class="sai-node-check"><input data-xyz-option="keep_minus_one" type="checkbox" ${state.options.keep_minus_one ? 'checked' : ''}><span>${escapeHtml(t('Keep -1 for seeds', '保留 -1 seed'))}</span></label>
      <label class="sai-node-check"><input data-xyz-option="vary_seeds_x" type="checkbox" ${state.options.vary_seeds_x ? 'checked' : ''}><span>${escapeHtml(t('Vary seeds for X', '按 X 递增 seed'))}</span></label>
      <label class="sai-node-check"><input data-xyz-option="vary_seeds_y" type="checkbox" ${state.options.vary_seeds_y ? 'checked' : ''}><span>${escapeHtml(t('Vary seeds for Y', '按 Y 递增 seed'))}</span></label>
      <label class="sai-node-check"><input data-xyz-option="vary_seeds_z" type="checkbox" ${state.options.vary_seeds_z ? 'checked' : ''}><span>${escapeHtml(t('Vary seeds for Z', '按 Z 递增 seed'))}</span></label>
    </div>
    <div class="sai-xyz-preview" data-xyz-preview>${renderXyzPreviewHtml(modal.__xyzPreview)}</div>
  </div>
  <div class="sai-canvas-modal-foot sai-xyz-plot-foot">
    <button type="button" data-xyz-action="preview"><i class="fa-solid fa-eye"></i><span>${escapeHtml(t('Preview', '预览'))}</span></button>
    <button type="button" data-xyz-action="create"><i class="fa-solid fa-table-cells-large"></i><span>${escapeHtml(t('Create Comparison', '创建对比'))}</span></button>
  </div>
</div>`;
    }

        return { renderXyzPlotModalHtml, renderXyzPreviewHtml };
    }

    window.SimpAICanvasWorkbenchXyzMatrixModalRenderer = Object.assign(
        {},
        window.SimpAICanvasWorkbenchXyzMatrixModalRenderer || {},
        { createCanvasXyzMatrixModalRenderer }
    );
})();
