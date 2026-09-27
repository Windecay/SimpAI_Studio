(function () {
    'use strict';

    function call(context, name, fallback, ...args) {
        return typeof context?.[name] === 'function' ? context[name](...args) : fallback;
    }

    function translate(context, en, cn) {
        return call(context, 't', cn || en, en, cn);
    }

    function escape(context, value) {
        return call(context, 'escapeHtml', String(value ?? ''), value);
    }

    function renderXyzMatrixCells(node, zIndex, context) {
        const xyz = node.xyz || {};
        const grid = xyz.grid || {};
        const xCount = Math.max(1, Number(grid.x_count || 1));
        const variants = (Array.isArray(xyz.variants) ? xyz.variants : [])
            .filter(variant => Number(variant.z_index || 0) === zIndex);
        const selected = new Set(Array.isArray(xyz.selected_variant_ids) ? xyz.selected_variant_ids : []);
        const visible = variants.slice(0, 240);
        const more = variants.length - visible.length;
        return `
<div class="sai-xyz-subgrid-cells" style="--xyz-cols:${xCount}">
  ${visible.map((variant) => {
            const labels = variant.axis_labels || {};
            const title = Object.values(labels).filter(Boolean).join(' / ') || variant.id;
            return `<button type="button" class="${selected.has(variant.id) ? 'is-selected' : ''}" data-node-action="xyz-cell:${escape(context, variant.id)}" title="${escape(context, title)}">
      <b>${escape(context, String(Number(variant.x_index || 0) + 1))},${escape(context, String(Number(variant.y_index || 0) + 1))}</b>
      <span>${escape(context, [labels.x, labels.y].filter(Boolean).join(' / ') || translate(context, 'default', '默认'))}</span>
      <code>${escape(context, String(variant.resolved_seed ?? ''))}</code>
    </button>`;
        }).join('')}
  ${more > 0 ? `<div class="sai-xyz-more">${escape(context, translate(context, '{count} more', '还有 {count} 项').replace('{count}', more))}</div>` : ''}
</div>`;
    }

    function renderNodeHtml(node, context) {
        const xyz = node.xyz || {};
        const grid = xyz.grid || {};
        const zCount = Math.max(1, Number(grid.z_count || 1));
        const axes = Array.isArray(xyz.axes) ? xyz.axes : [];
        const typeLabel = node.type === 'xyz_matrix'
            ? translate(context, 'XYZ Matrix', 'XYZ 矩阵')
            : translate(context, 'XY Matrix', 'XY 矩阵');
        return `
<div class="sai-node-head">
  <span class="sai-node-kind">${escape(context, typeLabel)}</span>
  <span class="sai-node-title">${escape(context, node.title || translate(context, 'X/Y/Z Matrix', 'X/Y/Z 矩阵'))}</span>
  ${call(context, 'renderNodeStateBadges', '', node)}
  <button type="button" data-node-action="xyz-locate-source" title="${escape(context, translate(context, 'Locate source', '定位来源'))}"><i class="fa-solid fa-location-crosshairs"></i></button>
  <button type="button" data-node-action="delete" title="${escape(context, translate(context, 'Delete', '删除'))}"><i class="fa-solid fa-xmark"></i></button>
</div>
<div class="sai-xyz-matrix-meta">
  <span>${escape(context, translate(context, 'Variants', '变体'))}<b>${escape(context, String(grid.variant_count || 0))}</b></span>
  <span>X<b>${escape(context, String(grid.x_count || 0))}</b></span>
  <span>Y<b>${escape(context, String(grid.y_count || 0))}</b></span>
  <span>Z<b>${escape(context, String(grid.z_count || 0))}</b></span>
</div>
<div class="sai-xyz-axis-tags">
  ${axes.map(axis => `<span>${escape(context, String(axis.axis || '').toUpperCase())}: ${escape(context, axis.type || '')}</span>`).join('')}
</div>
<div class="sai-xyz-matrix-scroll">
  ${Array.from({ length: zCount }, (_, zIndex) => {
            const zAxis = axes.find(axis => axis.axis === 'z') || {};
            const zLabel = Array.isArray(zAxis.labels) ? zAxis.labels[zIndex] : '';
            return `<section class="sai-xyz-subgrid">
      <h4>${escape(context, zCount > 1 ? (zLabel || `Z ${zIndex + 1}`) : translate(context, 'Grid', '网格'))}</h4>
      ${renderXyzMatrixCells(node, zIndex, context)}
    </section>`;
        }).join('')}
</div>`;
    }

    function renderInspector(node, context) {
        const xyz = node.xyz || {};
        const grid = xyz.grid || {};
        const source = call(context, 'getNode', null, node.source_node_id || xyz.source_node_id || '');
        const options = xyz.options || {};
        const typeLabel = node.type === 'xyz_matrix'
            ? translate(context, 'XYZ Matrix', 'XYZ 矩阵')
            : translate(context, 'XY Matrix', 'XY 矩阵');
        const notConnected = call(context, 'notConnectedText', translate(context, 'Not connected', '未连接'));
        return `
<div class="sai-inspector-section">
  <h3>${escape(context, typeLabel)}</h3>
  <div class="sai-inspector-kv"><span>${escape(context, translate(context, 'Batch Job', '批次任务'))}</span><b>${escape(context, node.batch_job_id || '')}</b></div>
  <div class="sai-inspector-kv"><span>${escape(context, translate(context, 'Source', '来源'))}</span><b>${escape(context, source?.title || source?.preset?.name || source?.id || notConnected)}</b></div>
  <div class="sai-inspector-kv"><span>${escape(context, translate(context, 'Variants', '变体'))}</span><b>${escape(context, String(grid.variant_count || 0))}</b></div>
  <div class="sai-inspector-kv"><span>${escape(context, translate(context, 'Grid', '网格'))}</span><b>${escape(context, `X ${grid.x_count || 0} / Y ${grid.y_count || 0} / Z ${grid.z_count || 0}`)}</b></div>
  <div class="sai-inspector-kv"><span>${escape(context, translate(context, 'Cost order', '成本顺序'))}</span><b>${escape(context, (xyz.processing_order || []).join(' > '))}</b></div>
</div>
<div class="sai-inspector-section">
  <h3>${escape(context, translate(context, 'Options', '选项'))}</h3>
  <div class="sai-inspector-kv"><span>${escape(context, translate(context, 'Legend', '图例'))}</span><b>${escape(context, options.draw_legend ? translate(context, 'On', '开启') : translate(context, 'Off', '关闭'))}</b></div>
  <div class="sai-inspector-kv"><span>${escape(context, translate(context, 'Sub Images', '单格结果'))}</span><b>${escape(context, options.include_sub_images ? translate(context, 'Keep', '保留') : translate(context, 'Skip', '不保留'))}</b></div>
  <div class="sai-inspector-kv"><span>${escape(context, translate(context, 'Sub Grids', 'Z 子网格'))}</span><b>${escape(context, options.include_sub_grids ? translate(context, 'Keep', '保留') : translate(context, 'Skip', '不保留'))}</b></div>
  <div class="sai-inspector-kv"><span>${escape(context, translate(context, 'Row Count', '行数'))}</span><b>${escape(context, String(options.row_count || 0))}</b></div>
  <div class="sai-inspector-kv"><span>${escape(context, translate(context, 'Grid Margins', '网格间距'))}</span><b>${escape(context, String(options.margin_size || 0))}</b></div>
</div>
<div class="sai-inspector-actions">
  <button type="button" data-inspector-action="xyz-locate-source"><i class="fa-solid fa-location-crosshairs"></i><span>${escape(context, translate(context, 'Locate source', '定位来源'))}</span></button>
  <button type="button" data-inspector-action="delete" class="danger"><i class="fa-solid fa-trash"></i><span>${escape(context, translate(context, 'Delete', '删除'))}</span></button>
</div>`;
    }

    window.SimpAICanvasWorkbenchXyzMatrixNode = Object.assign({}, window.SimpAICanvasWorkbenchXyzMatrixNode || {}, {
        renderNodeHtml,
        renderInspector
    });
})();
