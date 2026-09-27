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
        const choices = Array.isArray(option?.choices) ? option.choices.filter(Boolean) : [];
        if (choices.length && !state.options.csv_mode) {
            const selected = new Set(Array.isArray(axis.values) && axis.values.length ? axis.values.map(String) : xyzCsvValues(axis.values_text));
            return `<select data-xyz-axis-choices="${axisName}" multiple size="5">${choices.map(choice => `<option value="${escapeHtml(choice)}" ${selected.has(String(choice)) ? 'selected' : ''}>${escapeHtml(choice)}</option>`).join('')}</select>`;
        }
        return `<textarea data-xyz-axis-values="${axisName}" rows="3" placeholder="${escapeHtml(t('CSV values, ranges, or prompt file directory', 'CSV 值、范围或提示词文件目录'))}">${escapeHtml(axis.values_text || '')}</textarea>`;
    }

    function xyzCsvValues(text) {
        return String(text || '')
            .split(',')
            .map(item => item.trim().replace(/^"|"$/g, ''))
            .filter(Boolean);
    }

    function renderXyzAxisRow(modal, axisName) {
        const state = modal.__xyzState || defaultXyzPlotState(getNode(modal.__sourceNodeId));
        const options = visibleXyzAxisOptions(modal.__xyzAxisOptions, state.mode);
        const axis = state.axes?.[axisName] || {};
        const option = getXyzAxisOption(options, axis.type || 'Nothing', state.mode);
        const label = axisName.toUpperCase();
        return `
<div class="sai-xyz-axis-row" data-xyz-axis-row="${axisName}">
  <label><span>${escapeHtml(`${label} ${t('type', '类型')}`)}</span><select data-xyz-axis-type="${axisName}">
    ${options.map(item => `<option value="${escapeHtml(item.label)}" ${item.label === option.label ? 'selected' : ''}>${escapeHtml(item.label)}</option>`).join('')}
  </select></label>
  <label><span>${escapeHtml(`${label} ${t('values', '取值')}`)}</span>${renderXyzAxisValuesControl(state, axisName, option)}</label>
  <button type="button" data-xyz-fill-choices="${axisName}" ${Array.isArray(option.choices) && option.choices.length ? '' : 'disabled'} title="${escapeHtml(t('Fill all available choices', '填入全部可选项'))}"><i class="fa-solid fa-list-check"></i></button>
</div>`;
    }

    function renderXyzPreviewHtml(preview) {
        if (!preview) {
            return `<div class="sai-xyz-preview-empty">${escapeHtml(t('Preview expands axes and checks grid size before creating the matrix.', '预览会展开轴取值，并在创建矩阵前检查 grid 大小。'))}</div>`;
        }
        if (!preview.ok) {
            const details = [
                preview.error || t('Preview failed', '预览失败'),
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
  <span>MP<b>${Number(grid.megapixels || 0)}</b></span>
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
    <span><i class="fa-solid fa-table-cells-large"></i>${escapeHtml(t('X/Y/Z Plot', 'X/Y/Z 对比生成'))}</span>
    <button type="button" data-modal-close title="${escapeHtml(t('Close', '关闭'))}"><i class="fa-solid fa-xmark"></i></button>
  </div>
  <div class="sai-xyz-plot-body">
    <div class="sai-xyz-source-line">
      <span>${escapeHtml(t('Source', '来源'))}</span>
      <b>${escapeHtml(source?.title || source?.preset?.name || source?.id || '')}</b>
      <code>${escapeHtml(state.mode || 'txt2img')}</code>
    </div>
    <div class="sai-xyz-script-line">
      <label><span>${escapeHtml(t('Script', '脚本'))}</span><input value="${escapeHtml(scriptSource.script || '')}" readonly></label>
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
      <label><span>${escapeHtml(t('Row Count', '行数'))}</span><input data-xyz-option="row_count" type="number" min="0" step="1" value="${escapeHtml(state.options.row_count || 0)}"></label>
      <label><span>${escapeHtml(t('Grid Margins', '网格间距'))}</span><input data-xyz-option="margin_size" type="number" min="0" step="1" value="${escapeHtml(state.options.margin_size || 0)}"></label>
      <label class="sai-node-check"><input data-xyz-option="draw_legend" type="checkbox" ${state.options.draw_legend ? 'checked' : ''}><span>${escapeHtml(t('Draw legend', '绘制图例'))}</span></label>
      <label class="sai-node-check"><input data-xyz-option="include_sub_images" type="checkbox" ${state.options.include_sub_images ? 'checked' : ''}><span>${escapeHtml(t('Include Sub Images', '保留单格结果'))}</span></label>
      <label class="sai-node-check"><input data-xyz-option="include_sub_grids" type="checkbox" ${state.options.include_sub_grids ? 'checked' : ''}><span>${escapeHtml(t('Include Sub Grids', '保留 Z 子网格'))}</span></label>
      <label class="sai-node-check"><input data-xyz-option="keep_minus_one" type="checkbox" ${state.options.keep_minus_one ? 'checked' : ''}><span>${escapeHtml(t('Keep -1 for seeds', '保留 -1 seed'))}</span></label>
      <label class="sai-node-check"><input data-xyz-option="vary_seeds_x" type="checkbox" ${state.options.vary_seeds_x ? 'checked' : ''}><span>${escapeHtml(t('Vary seeds for X', '按 X 递增 seed'))}</span></label>
      <label class="sai-node-check"><input data-xyz-option="vary_seeds_y" type="checkbox" ${state.options.vary_seeds_y ? 'checked' : ''}><span>${escapeHtml(t('Vary seeds for Y', '按 Y 递增 seed'))}</span></label>
      <label class="sai-node-check"><input data-xyz-option="vary_seeds_z" type="checkbox" ${state.options.vary_seeds_z ? 'checked' : ''}><span>${escapeHtml(t('Vary seeds for Z', '按 Z 递增 seed'))}</span></label>
      <label class="sai-node-check"><input data-xyz-option="csv_mode" type="checkbox" ${state.options.csv_mode ? 'checked' : ''}><span>${escapeHtml(t('Use text inputs instead of dropdowns', '使用文本输入代替下拉选项'))}</span></label>
    </div>
    <div class="sai-xyz-preview" data-xyz-preview>${renderXyzPreviewHtml(modal.__xyzPreview)}</div>
  </div>
  <div class="sai-canvas-modal-foot sai-xyz-plot-foot">
    <button type="button" data-xyz-action="preview"><i class="fa-solid fa-eye"></i><span>${escapeHtml(t('Preview', '预览'))}</span></button>
    <button type="button" data-xyz-action="create"><i class="fa-solid fa-table-cells-large"></i><span>${escapeHtml(t('Create Matrix', '创建矩阵'))}</span></button>
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
