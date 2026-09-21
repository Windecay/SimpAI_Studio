(function () {
    'use strict';

    function createCanvasBatchAnyInspectorController(context) {
        const scope = context?.batchAnyInspectorSource || context || {};
        const nodeSource = scope.nodeSource || {};
        const selectionSource = scope.selectionSource || {};
        const batchSource = scope.batchSource || {};
        const actionSource = scope.actionSource || {};
        const historySource = scope.historySource || {};
        const persistenceSource = scope.persistenceSource || {};
        const utilitySource = scope.utilitySource || {};
        const languageSource = scope.languageSource || {};
        const uiSource = scope.uiSource || {};
        const call = (source, name, fallback, ...args) => typeof source[name] === 'function'
            ? source[name](...args) : fallback;
        const batchAnyMediaKind = node => call(batchSource, 'batchAnyMediaKind', '', node);
        const batchAnyTargets = node => call(batchSource, 'batchAnyTargets', [], node);
        const batchAnyCurrentItem = node => call(batchSource, 'batchAnyCurrentItem', null, node);
        const batchAnySelectedItemIds = node => call(batchSource, 'batchAnySelectedItemIds', [], node);
        const batchAnyMediaLabel = kind => call(batchSource, 'batchAnyMediaLabel', '', kind);
        const batchAnyMediaIcon = kind => call(batchSource, 'batchAnyMediaIcon', '', kind);
        const batchAnyTargetLabel = target => call(batchSource, 'batchAnyTargetLabel', '', target);
        const applyBatchAnyStatePatch = (node, options) => call(batchSource, 'applyBatchAnyStatePatch', undefined, node, options);
        const notConnectedText = () => call(uiSource, 'notConnectedText', '');
        const escapeHtml = value => call(utilitySource, 'escapeHtml', String(value ?? ''), value);
        const t = (en, cn) => {
            const state = call(languageSource, 'getLanguageState', {}) || {};
            return call(languageSource, 't', state.__lang === 'cn' || state.__lang === 'zh' ? cn : en, en, cn, state);
        };

        function renderBatchAnyInspector(node) {
            const items = Array.isArray(node.items) ? node.items : [];
            const kind = batchAnyMediaKind(node);
            const targets = batchAnyTargets(node);
            const current = batchAnyCurrentItem(node);
            const selectedIds = new Set(batchAnySelectedItemIds(node));
            return `
<div class="sai-inspector-section">
  <h3>${escapeHtml(t('Batch Any', '批量素材'))}</h3>
  <label>${escapeHtml(t('Title', '标题'))}<input data-inspector-node-field="title" value="${escapeHtml(node.title || '')}"></label>
  <div class="sai-inspector-kv"><span>${escapeHtml(t('Type', '类型'))}</span><b>${escapeHtml(batchAnyMediaLabel(kind))}</b></div>
  <div class="sai-inspector-kv"><span>${escapeHtml(t('Items', '素材'))}</span><b>${items.length}</b></div>
  <div class="sai-inspector-kv"><span>${escapeHtml(t('Current', '当前'))}</span><b>${escapeHtml(current?.name || notConnectedText())}</b></div>
  <div class="sai-inspector-kv"><span>${escapeHtml(t('Target', '目标'))}</span><b>${escapeHtml(targets[0] ? `${targets[0].node?.title || targets[0].node?.preset?.name || targets[0].node?.id || ''} / ${batchAnyTargetLabel(targets[0])}` : notConnectedText())}</b></div>
  <label class="sai-node-check"><input data-batch-any-param="stop_on_error" type="checkbox" ${node.params?.stop_on_error !== false ? 'checked' : ''}><span>${escapeHtml(t('Stop on error', '遇到错误时停止'))}</span></label>
  ${node.batch?.last_error ? `<div class="sai-inspector-note">${escapeHtml(node.batch.last_error)}</div>` : ''}
</div>
<div class="sai-inspector-section">
  <h3>${escapeHtml(t('Items', '素材'))}</h3>
  <div class="sai-batch-any-inspector-list">
    ${items.map((item, index) => `<div class="sai-batch-any-inspector-item ${index === Number(node.current_index || 0) ? 'is-active' : ''} ${selectedIds.has(item.id) ? 'is-selected' : ''}">
      <button type="button" class="sai-batch-any-item-main" data-node-action="batch-any-select:${index}"><i class="fa-solid ${escapeHtml(batchAnyMediaIcon(item.media_kind || kind))}"></i><span>${escapeHtml(item.name || `${t('Item', '素材')} ${index + 1}`)}</span></button>
      <button type="button" class="sai-batch-any-item-remove" data-node-action="batch-any-remove:${index}" title="${escapeHtml(t('Delete item', '删除素材'))}"><i class="fa-solid fa-xmark"></i></button>
    </div>`).join('') || `<p>${escapeHtml(t('No files imported.', '尚未导入素材。'))}</p>`}
  </div>
</div>
<div class="sai-inspector-actions">
  <button type="button" data-inspector-action="batch-any-import"><i class="fa-solid fa-folder-open"></i><span>${escapeHtml(t('Import files', '导入文件'))}</span></button>
  <button type="button" data-inspector-action="batch-any-delete-selected" ${selectedIds.size ? '' : 'disabled'}><i class="fa-solid fa-trash"></i><span>${escapeHtml(t('Delete selected', '删除选中'))}</span></button>
  <button type="button" data-inspector-action="batch-any-run-current" ${current && targets.length ? '' : 'disabled'}><i class="fa-solid fa-play"></i><span>${escapeHtml(t('Run current', '运行当前'))}</span></button>
  <button type="button" data-inspector-action="batch-any-run-all" ${items.length && targets.length ? '' : 'disabled'}><i class="fa-solid fa-forward"></i><span>${escapeHtml(t('Run all', '运行全部'))}</span></button>
  <button type="button" data-inspector-action="delete" class="danger"><i class="fa-solid fa-trash"></i><span>${escapeHtml(t('Delete', '删除'))}</span></button>
</div>`;
        }

        function bindBatchAnyInspectorEvents(inspector) {
            inspector.querySelectorAll('[data-batch-any-param]').forEach((field) => {
                const handler = () => {
                    const node = call(nodeSource, 'getNode', null, call(selectionSource, 'getSelectedNodeId', null));
                    if (!node || node.type !== 'batch_any' || call(nodeSource, 'isNodeLocked', false, node)) return;
                    call(historySource, 'pushHistoryBatch', undefined, `batch-any:${node.id}:${field.getAttribute('data-batch-any-param')}`, 'Edit Batch Any');
                    const paramKey = field.getAttribute('data-batch-any-param');
                    applyBatchAnyStatePatch(node, {
                        paramsPatch: {
                            [paramKey]: field.type === 'checkbox' ? !!field.checked : field.value
                        }
                    });
                    call(persistenceSource, 'scheduleSave', undefined);
                };
                field.addEventListener('input', handler);
                field.addEventListener('change', handler);
            });
        }

        function handleBatchAnyInspectorAction(node, action, evt) {
            if (!node || node.type !== 'batch_any') return false;
            if (action === 'batch-any-import') {
                call(actionSource, 'openBatchAnyFilePicker', undefined, node);
            } else if (action === 'batch-any-run-current') {
                call(actionSource, 'runBatchAnyNode', undefined, node, { currentOnly: true });
            } else if (action === 'batch-any-run-all') {
                call(actionSource, 'runBatchAnyNode', undefined, node, { currentOnly: false });
            } else if (String(action || '').startsWith('batch-any-select:')) {
                call(actionSource, 'selectBatchAnyItem', undefined, node, Number(String(action || '').slice('batch-any-select:'.length)) || 0, {
                    shiftKey: !!evt?.shiftKey,
                    toggleKey: !!(evt?.ctrlKey || evt?.metaKey)
                });
            } else if (String(action || '').startsWith('batch-any-remove:')) {
                const index = Number(String(action || '').slice('batch-any-remove:'.length)) || 0;
                const item = Array.isArray(node.items) ? node.items[index] : null;
                if (item?.id) call(actionSource, 'deleteBatchAnyItems', undefined, node, [item.id]);
            } else if (action === 'batch-any-delete-selected') {
                call(actionSource, 'deleteBatchAnyItems', undefined, node, batchAnySelectedItemIds(node));
            } else {
                return false;
            }
            return true;
        }

        return { renderBatchAnyInspector, bindBatchAnyInspectorEvents, handleBatchAnyInspectorAction };
    }

    window.SimpAICanvasWorkbenchBatchAnyInspector = Object.assign(
        {}, window.SimpAICanvasWorkbenchBatchAnyInspector || {}, { createCanvasBatchAnyInspectorController }
    );
})();
