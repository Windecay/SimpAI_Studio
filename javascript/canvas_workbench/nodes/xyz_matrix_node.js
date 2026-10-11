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

    function stateLabel(state, context) {
        const labels = {
            planned: ['Pending', '待运行'], checking: ['Checking', '检查中'], preparing: ['Preparing', '准备中'],
            running: ['Running', '运行中'], cancelling: ['Stopping', '停止中'], canceled: ['Stopped', '已停止'],
            skipped: ['Skipped', '已跳过'], failed: ['Failed', '失败'], finished: ['Finished', '已完成'], missing: ['Result unavailable', '结果已不可用'], interrupted: ['Interrupted', '已中断']
        };
        const label = labels[state] || labels.planned;
        return translate(context, ...label);
    }

    function renderActions(node, context, inspector) {
        const variants = node.xyz?.variants || [];
        const busy = call(context, 'isXyzMatrixRunning', false, node);
        const selected = new Set(node.xyz?.selected_variant_ids || []);
        const attr = inspector ? 'data-inspector-action' : 'data-node-action';
        const button = (action, icon, en, cn, disabled) => `<button type="button" ${attr}="${action}" ${disabled ? 'disabled' : ''} title="${escape(context, translate(context, en, cn))}"><i class="fa-solid ${icon}"></i><span>${escape(context, translate(context, en, cn))}</span></button>`;
        return `<div class="sai-xyz-actions">${busy
            ? button('xyz-stop', 'fa-stop', 'Stop', '停止', false)
            : button('xyz-run', 'fa-play', 'Run pending', '运行待处理项', !variants.some(item => !['finished', 'failed', 'interrupted'].includes(item.status)))}
            ${button('xyz-retry-failed', 'fa-rotate-right', 'Retry failed', '重试失败项', busy || !variants.some(item => item.status === 'failed'))}
            ${button('xyz-retry-selected', 'fa-arrow-rotate-right', 'Rerun selected', '重跑选中项', busy || !selected.size)}
            ${button('xyz-open', 'fa-arrow-up-right-from-square', 'Open result', '打开结果', selected.size !== 1 || !variants.some(item => selected.has(item.id) && call(context, 'getNode', null, item.result_node_id)))}
            ${button('xyz-compare', 'fa-code-compare', 'Compare images', '对比图片', selected.size !== 2)}
        </div>`;
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
            const labels = Object.assign({}, variant.axis_labels || {});
            for (const axis of xyz.axes || []) {
                const value = variant.axis_values?.[axis.axis]?.value;
                if (value === undefined || axis.type === 'Nothing') continue;
                const label = axis.display_label || axis.type;
                const localized = call(context, 'localizeLabel', label, label);
                labels[axis.axis] = `${localized}: ${typeof value === 'boolean' ? translate(context, value ? 'On' : 'Off', value ? '开启' : '关闭') : value}`;
            }
            const title = Object.values(labels).filter(Boolean).join(' / ') || variant.id;
            const candidate = call(context, 'getNode', null, variant.result_node_id);
            const result = candidate && (!variant.run_id || candidate.producer?.run_id === variant.run_id) ? candidate : null;
            const asset = result?.assets?.[variant.asset_index || 0] || result?.asset;
            const kind = call(context, 'assetMediaKind', 'image', asset);
            const src = asset && kind === 'image' ? call(context, 'safeAssetDisplaySrc', '', asset, asset.thumb || asset.preview_url || asset.data_url || '') : '';
            const state = variant.status === 'finished' && !result ? 'missing'
                : ['preparing', 'running', 'cancelling'].includes(variant.status) && result?.status?.state
                    ? result.status.state : variant.status || 'planned';
            return `<button type="button" class="sai-xyz-cell ${selected.has(variant.id) ? 'is-selected' : ''}" data-node-action="xyz-select:${escape(context, variant.id)}" data-state="${escape(context, state)}" aria-pressed="${selected.has(variant.id)}" title="${escape(context, variant.error || title)}">
      <span class="sai-xyz-cell-preview">${src ? `<img src="${escape(context, src)}" alt="" loading="lazy" decoding="async">` : `<i class="fa-solid ${kind === 'video' ? 'fa-film' : kind === 'audio' ? 'fa-wave-square' : 'fa-image'}"></i>`}</span>
      <b>${escape(context, String(Number(variant.x_index || 0) + 1))},${escape(context, String(Number(variant.y_index || 0) + 1))}</b>
      <small>${escape(context, stateLabel(state, context))}</small>
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
        const typeLabel = translate(context, 'Parameter Comparison', '参数对比');
        return `
<div class="sai-node-head">
  <span class="sai-node-kind">${escape(context, typeLabel)}</span>
  <span class="sai-node-title">${escape(context, node.title || translate(context, 'X/Y/Z Matrix', 'X/Y/Z 矩阵'))}</span>
  ${call(context, 'renderNodeStateBadges', '', node)}
  <button type="button" data-node-action="xyz-locate-source" title="${escape(context, translate(context, 'Locate source', '定位来源'))}"><i class="fa-solid fa-location-crosshairs"></i></button>
  <button type="button" data-node-action="delete" title="${escape(context, translate(context, 'Delete', '删除'))}"><i class="fa-solid fa-xmark"></i></button>
</div>
<div class="sai-xyz-matrix-meta">
  <span>${escape(context, stateLabel(node.status?.state, context))}<b>${escape(context, String((xyz.variants || []).filter(item => item.status === 'finished').length))} / ${escape(context, String(grid.variant_count || 0))}</b></span>
  <span>${escape(context, translate(context, 'Variants', '变体'))}<b>${escape(context, String(grid.variant_count || 0))}</b></span>
  <span>X<b>${escape(context, String(grid.x_count || 0))}</b></span>
  <span>Y<b>${escape(context, String(grid.y_count || 0))}</b></span>
  <span>Z<b>${escape(context, String(grid.z_count || 0))}</b></span>
</div>
<div class="sai-xyz-axis-tags">
  ${axes.map(axis => `<span>${escape(context, String(axis.axis || '').toUpperCase())}: ${escape(context, call(context, 'localizeLabel', axis.display_label || axis.type || '', axis.display_label || axis.type || ''))}</span>`).join('')}
</div>
${node.status?.message ? `<div class="sai-xyz-run-message">${escape(context, node.status.message)}</div>` : ''}
${renderActions(node, context, false)}
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
        const typeLabel = translate(context, 'Parameter Comparison', '参数对比');
        const notConnected = call(context, 'notConnectedText', translate(context, 'Not connected', '未连接'));
        return `
<div class="sai-inspector-section">
  <h3>${escape(context, typeLabel)}</h3>
  <div class="sai-inspector-kv"><span>${escape(context, translate(context, 'Status', '状态'))}</span><b>${escape(context, stateLabel(node.status?.state, context))}</b></div>
  <div class="sai-inspector-kv"><span>${escape(context, translate(context, 'Batch Job', '批次任务'))}</span><b>${escape(context, node.batch_job_id || '')}</b></div>
  <div class="sai-inspector-kv"><span>${escape(context, translate(context, 'Source', '来源'))}</span><b>${escape(context, source?.title || source?.preset?.name || source?.id || notConnected)}</b></div>
  <div class="sai-inspector-kv"><span>${escape(context, translate(context, 'Variants', '变体'))}</span><b>${escape(context, String(grid.variant_count || 0))}</b></div>
  <div class="sai-inspector-kv"><span>${escape(context, translate(context, 'Grid', '网格'))}</span><b>${escape(context, `X ${grid.x_count || 0} / Y ${grid.y_count || 0} / Z ${grid.z_count || 0}`)}</b></div>
  <div class="sai-inspector-kv"><span>${escape(context, translate(context, 'Cost order', '成本顺序'))}</span><b>${escape(context, (xyz.processing_order || []).join(' > '))}</b></div>
</div>
<div class="sai-inspector-section">
  <h3>${escape(context, translate(context, 'Options', '选项'))}</h3>
  <div class="sai-inspector-kv"><span>${escape(context, translate(context, 'Stop on error', '遇错停止'))}</span><b>${escape(context, options.stop_on_error !== false ? translate(context, 'On', '开启') : translate(context, 'Off', '关闭'))}</b></div>
</div>
${renderActions(node, context, true)}
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
