(function () {
    'use strict';

    function createCanvasInspectorController(context) {
        const scope = context || {};
        const t = typeof scope.t === 'function' ? scope.t : ((en, cn) => cn || en);
        const escapeHtml = typeof scope.escapeHtml === 'function' ? scope.escapeHtml : (value => String(value ?? ''));
        const call = (name, fallback, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : fallback;
        const getProject = () => call('getProject', {}) || {};
        const getInspector = () => call('getInspector', null);
        const getSelectedNodeId = () => call('getSelectedNodeId', null);
        const getSelectedNodeIds = () => {
            const value = call('getSelectedNodeIds', null);
            if (value && typeof value[Symbol.iterator] === 'function') return new Set(Array.from(value));
            return new Set(Array.isArray(value) ? value : []);
        };
        const getSelectedEdgeId = () => call('getSelectedEdgeId', null);
        const getSelectedGroupId = () => call('getSelectedGroupId', null);
        const getNode = (id) => call('getNode', null, id);
        function renderNodeKind(kind, node) {
            const renderer = call('getNodeInspectorRenderer', null, kind);
            return typeof renderer === 'function' ? renderer(node) : '';
        }

        function renderNodeInspector(node) {
            if (!node) return '';
            let html = '';
            if (node.type === 'classic') html = renderNodeKind('classic', node);
            else if (node.type === 'config') html = renderNodeKind('config', node);
            else if (node.type === 'preset') html = renderNodeKind('preset', node);
            else if (node.type === 'result') html = renderNodeKind('result', node);
            else if (node.type === 'compare') html = renderNodeKind('compare', node);
            else if (node.type === 'batch_any') html = renderNodeKind('batch_any', node);
            else if (node.type === 'xy_matrix' || node.type === 'xyz_matrix') html = renderNodeKind('xyz_matrix', node);
            else if (node.type === 'timeline') html = renderNodeKind('timeline', node);
            else if (call('isDirectorTimelineNode', false, node)) html = renderNodeKind('director_timeline', node);
            else if (node.type === 'style_selector') html = renderNodeKind('style_selector', node);
            else if (node.type === 'video') html = renderNodeKind('video', node);
            else if (node.type === 'audio') html = renderNodeKind('audio', node);
            else if (node.type === 'note') html = renderNodeKind('note', node);
            else if (node.type === 'text') html = renderNodeKind('text', node);
            else if (node.type === 'text_merge') html = renderNodeKind('text_merge', node);
            else if (node.type === 'translation') html = renderNodeKind('translation', node);
            else if (node.type === 'tag_cart') html = renderNodeKind('tag_cart', node);
            else if (node.type === 'wd14') html = renderNodeKind('wd14', node);
            else if (node.type === 'vlm') html = renderNodeKind('vlm', node);
            else if (node.type === 'mask') html = renderNodeKind('mask', node);
            else if (node.type === 'sam3_video_mask') html = renderNodeKind('sam3_video_mask', node);
            else if (node.type === 'camera_motion') html = renderNodeKind('camera_motion', node);
            else if (node.type === 'pose_studio') html = renderNodeKind('pose_studio', node);
            else if (node.type === 'gaussian_studio') html = renderNodeKind('gaussian_studio', node);
            else if (node.type === 'liveportrait_expression') html = renderNodeKind('liveportrait_expression', node);
            else if (call('isQwenTtsNode', false, node)) html = renderNodeKind('qwen_tts', node);
            else html = renderNodeKind('image', node);
            return `${renderNodeAppearanceInspector(node)}${html}`;
        }

        function renderInspector() {
            const target = getInspector();
            if (!target) return;
            const selectedGroupId = getSelectedGroupId();
            const selectedNodeId = getSelectedNodeId();
            const selectedEdgeId = getSelectedEdgeId();
            const selectedNodeIds = getSelectedNodeIds();
            if (selectedGroupId && !selectedNodeId && !selectedEdgeId) {
                const group = call('getGroup', null, selectedGroupId);
                target.innerHTML = group ? renderGroupInspector(group) : renderInspectorEmpty();
                call('ensureWorkbenchFormFieldNames', undefined, target, `inspector_group_${selectedGroupId || 'group'}`);
                call('bindInspectorEvents');
                return;
            }
            if (!selectedNodeId && !selectedEdgeId) {
                target.innerHTML = renderInspectorEmpty();
                call('ensureWorkbenchFormFieldNames', undefined, target, 'inspector_empty');
                return;
            }
            if (!selectedEdgeId && selectedNodeIds.size > 1) {
                target.innerHTML = renderSelectionInspector();
                call('ensureWorkbenchFormFieldNames', undefined, target, 'inspector_selection');
                call('bindInspectorEvents');
                return;
            }
            if (selectedEdgeId) {
                const edge = (Array.isArray(getProject().edges) ? getProject().edges : []).find(item => item.id === selectedEdgeId);
                target.innerHTML = renderEdgeInspector(edge);
                call('ensureWorkbenchFormFieldNames', undefined, target, `inspector_edge_${selectedEdgeId || 'edge'}`);
                call('bindInspectorEvents');
                return;
            }
            const node = getNode(selectedNodeId);
            if (!node) {
                target.innerHTML = renderInspectorEmpty();
                call('ensureWorkbenchFormFieldNames', undefined, target, 'inspector_missing');
                return;
            }
            target.innerHTML = renderNodeInspector(node);
            call('ensureWorkbenchFormFieldNames', undefined, target, `inspector_${selectedNodeId || selectedEdgeId || 'empty'}`);
            call('bindInspectorEvents');
        }

        function renderNodeAppearanceInspector(node) {
            const color = call('nodeCustomColor', '', node);
            const enabled = !!color;
            const inputValue = call('expandCanvasHexColor', '#14b8a6', color || '#14b8a6');
            return `
<div class="sai-inspector-section sai-node-appearance-section">
  <h3>${escapeHtml(t('Node Appearance', '节点外观'))}</h3>
  <label class="sai-node-check sai-node-color-enable"><input data-inspector-node-color-enabled type="checkbox" ${enabled ? 'checked' : ''}><span>${escapeHtml(t('Custom node color', '自定义节点颜色'))}</span></label>
  <div class="sai-node-color-row">
    <input data-inspector-node-color type="color" value="${escapeHtml(inputValue)}" ${enabled ? '' : 'disabled'}>
    <button type="button" data-inspector-node-color-reset><i class="fa-solid fa-rotate-left"></i><span>${escapeHtml(t('Default', '默认'))}</span></button>
  </div>
</div>`;
        }

        function renderInspectorEmpty() {
            const project = getProject();
            const storageScope = call('getStorageScope', {}) || {};
            const storageKey = call('getStorageKey', '');
            return `
<div class="sai-inspector-section">
  <h3>${escapeHtml(t('Workbench', '工作台'))}</h3>
  <p>${escapeHtml(t('Import an image, add a preset node, then connect the image node to a preset input slot.', '导入图片、添加预设节点，然后从图片节点连到预设输入槽。'))}</p>
</div>
<div class="sai-inspector-section">
  <h3>${escapeHtml(t('Save Location', '保存位置'))}</h3>
  <div class="sai-inspector-kv"><span>${escapeHtml(t('Location', '位置'))}</span><b>${escapeHtml(call('storageDisplayLocation', ''))}</b></div>
  <div class="sai-inspector-kv"><span>${escapeHtml(t('Scope', '作用域'))}</span><b>${escapeHtml(storageScope.label)}</b></div>
  <label>${escapeHtml(t('Project File', '项目文件'))}<input value="${escapeHtml(call('storageDisplayPath', ''))}" readonly></label>
  <label>${escapeHtml(t('Browser Cache', '浏览器缓存'))}<input value="${escapeHtml(project.storage?.key || storageKey)}" readonly></label>
</div>
<div class="sai-inspector-actions">
  <button type="button" data-canvas-action="import-selected"><i class="fa-solid fa-image"></i><span>${escapeHtml(t('Import selected', '导入选中图'))}</span></button>
  <button type="button" data-canvas-action="import-files"><i class="fa-solid fa-folder-open"></i><span>${escapeHtml(t('Import files', '导入文件'))}</span></button>
  <button type="button" data-canvas-action="add-preset"><i class="fa-solid fa-square-plus"></i><span>${escapeHtml(t('Add preset', '添加预设'))}</span></button>
  <button type="button" data-canvas-action="add-style-selector"><i class="fa-solid fa-palette"></i><span>${escapeHtml(t('Add style', '添加风格'))}</span></button>
  <button type="button" data-canvas-action="add-pose-studio"><i class="fa-solid fa-person-walking"></i><span>${escapeHtml(t('Add pose', '添加姿势'))}</span></button>
  <button type="button" data-canvas-action="add-gaussian-studio"><i class="fa-solid fa-cube"></i><span>${escapeHtml(t('Add 3DGS', '添加 3DGS'))}</span></button>
  <button type="button" data-canvas-action="add-liveportrait-expression"><i class="fa-solid fa-face-smile"></i><span>${escapeHtml(t('Add Live Exp', '添加表情'))}</span></button>
  <button type="button" data-canvas-action="add-note"><i class="fa-solid fa-note-sticky"></i><span>${escapeHtml(t('Add note', '添加提示贴'))}</span></button>
  <button type="button" data-canvas-action="add-group"><i class="fa-solid fa-object-group"></i><span>${escapeHtml(t('Add group', '添加分组'))}</span></button>
  <button type="button" data-canvas-action="add-compare">${call('renderIconHtml', '<i class="fa-solid fa-code-compare"></i>', 'sai-compare-glyph')}<span>${escapeHtml(t('Add compare', '添加对比'))}</span></button>
  <button type="button" data-canvas-action="add-timeline"><i class="fa-solid fa-clapperboard"></i><span>${escapeHtml(t('Add timeline', '添加时间线'))}</span></button>
  <button type="button" data-canvas-action="add-output"><i class="fa-solid fa-circle-dot"></i><span>${escapeHtml(t('Add output', '添加输出'))}</span></button>
</div>`;
        }

        function renderSelectionInspector() {
            const ids = call('getSelectedNodeIdList', Array.from(getSelectedNodeIds()));
            const nodes = (Array.isArray(ids) ? ids : Array.from(ids || [])).map(id => getNode(id)).filter(Boolean);
            const lockedCount = nodes.filter(node => !!call('isNodeLocked', false, node)).length;
            const ignoredCount = nodes.filter(node => !!call('isNodeIgnored', false, node)).length;
            const compareCount = nodes.filter(node => !!call('isImageCompareSource', false, node)).length;
            const timelineCount = nodes.filter(node => !!call('isTimelineSource', false, node)).length;
            return `
<div class="sai-inspector-section">
  <h3>${escapeHtml(t('Selection', '选区'))}</h3>
  <div class="sai-inspector-kv"><span>${escapeHtml(t('Nodes', '节点'))}</span><b>${nodes.length}</b></div>
  <div class="sai-inspector-kv"><span>${escapeHtml(t('Locked', '已锁定'))}</span><b>${lockedCount}</b></div>
  <div class="sai-inspector-kv"><span>${escapeHtml(t('Skipped', '已跳过'))}</span><b>${ignoredCount}</b></div>
  <p>${escapeHtml(t('Locked nodes stay fixed and protected. Skipped nodes are ignored when running presets or collecting inputs.', '锁定节点会保持固定并受到保护。跳过节点在运行 preset 或收集输入时会被忽略。'))}</p>
</div>
<div class="sai-inspector-actions">
  <button type="button" data-inspector-action="toggle-lock"><i class="fa-solid ${lockedCount === nodes.length ? 'fa-lock-open' : 'fa-lock'}"></i><span>${escapeHtml(lockedCount === nodes.length ? t('Unlock', '解锁') : t('Lock', '锁定'))}</span></button>
  <button type="button" data-inspector-action="toggle-ignore"><i class="fa-solid fa-forward-step"></i><span>${escapeHtml(ignoredCount === nodes.length ? t('Enable', '启用') : t('Skip', '跳过'))}</span></button>
  <button type="button" data-inspector-action="toggle-collapse"><i class="fa-solid fa-down-left-and-up-right-to-center"></i><span>${escapeHtml(nodes.every(node => !!call('isNodeCollapsed', false, node)) ? t('Expand', '展开') : t('Collapse', '折叠'))}</span></button>
  ${compareCount >= 2 ? `<button type="button" data-inspector-action="compare-selected">${call('renderIconHtml', '<i class="fa-solid fa-code-compare"></i>', 'sai-compare-glyph')}<span>${escapeHtml(t('Compare', '对比'))}</span></button>` : ''}
  ${timelineCount >= 1 ? `<button type="button" data-inspector-action="timeline-selected"><i class="fa-solid fa-clapperboard"></i><span>Timeline</span></button>` : ''}
  <button type="button" data-inspector-action="duplicate"><i class="fa-solid fa-copy"></i><span>${escapeHtml(t('Duplicate', '复制'))}</span></button>
  <button type="button" data-inspector-action="delete" class="danger"><i class="fa-solid fa-trash"></i><span>${escapeHtml(t('Delete', '删除'))}</span></button>
</div>
<div class="sai-inspector-actions">
  <button type="button" data-inspector-action="align-left"><i class="fa-solid fa-align-left"></i><span>${escapeHtml(t('Left', '左'))}</span></button>
  <button type="button" data-inspector-action="align-center-x"><i class="fa-solid fa-grip-lines-vertical"></i><span>${escapeHtml(t('Center X', '水平居中'))}</span></button>
  <button type="button" data-inspector-action="align-right"><i class="fa-solid fa-align-right"></i><span>${escapeHtml(t('Right', '右'))}</span></button>
  <button type="button" data-inspector-action="align-top"><i class="fa-solid fa-align-left fa-rotate-90"></i><span>${escapeHtml(t('Top', '顶部'))}</span></button>
  <button type="button" data-inspector-action="align-center-y"><i class="fa-solid fa-grip-lines"></i><span>${escapeHtml(t('Center Y', '垂直居中'))}</span></button>
  <button type="button" data-inspector-action="align-bottom"><i class="fa-solid fa-align-right fa-rotate-90"></i><span>${escapeHtml(t('Bottom', '底部'))}</span></button>
</div>
<div class="sai-inspector-actions">
  <button type="button" data-inspector-action="distribute-x"><i class="fa-solid fa-arrows-left-right-to-line"></i><span>${escapeHtml(t('Distribute X', '水平分布'))}</span></button>
  <button type="button" data-inspector-action="distribute-y"><i class="fa-solid fa-arrows-up-down-to-line"></i><span>${escapeHtml(t('Distribute Y', '垂直分布'))}</span></button>
</div>`;
        }

        function renderGroupInspector(group) {
            const rect = call('getGroupRect', {}, group) || {};
            const nodes = call('getNodesInsideGroup', [], group) || [];
            return `
<div class="sai-inspector-section">
  <h3>${escapeHtml(t('Area Group', '区域分组'))}</h3>
  <label>${escapeHtml(t('Header', '分组头'))}<input data-group-field="title" value="${escapeHtml(group.title || '')}"></label>
  <label>${escapeHtml(t('Shortcut', '快捷键'))}<input data-group-field="shortcut" maxlength="12" placeholder="${escapeHtml(t('Alt + key', 'Alt + 按键'))}" value="${escapeHtml(group.shortcut || '')}"></label>
  <label class="sai-node-check"><input data-group-field="locked" type="checkbox" ${group.locked ? 'checked' : ''}><span>${escapeHtml(t('Lock group position', '锁定分组位置'))}</span></label>
  <div class="sai-inspector-kv"><span>${escapeHtml(t('Contained nodes', '包含节点'))}</span><b>${escapeHtml(String(nodes.length))}</b></div>
  <p>${escapeHtml(t('Drag the group header to move the group and all nodes whose title row overlaps it. Locking only freezes the group frame; nodes remain editable.', '拖拽分组头会移动标题栏与分组重叠的节点。锁定只固定分组框，节点仍可编辑。'))}</p>
</div>
<div class="sai-inspector-section">
  <h3>${escapeHtml(t('Appearance', '外观'))}</h3>
  <label>${escapeHtml(t('Color', '颜色'))}<input data-group-field="color" type="color" value="${escapeHtml(call('normalizeCanvasColor', '#14b8a6', group.color, '#14b8a6'))}"></label>
  <label>${escapeHtml(t('Opacity', '透明度'))}<input data-group-field="alpha" type="range" min="0.04" max="0.72" step="0.02" value="${escapeHtml(group.alpha ?? 0.16)}"></label>
  <div class="sai-inspector-grid2">
    <label>X<input data-group-field="x" type="number" step="10" value="${escapeHtml(rect.x)}"></label>
    <label>Y<input data-group-field="y" type="number" step="10" value="${escapeHtml(rect.y)}"></label>
    <label>W<input data-group-field="w" type="number" min="180" step="10" value="${escapeHtml(rect.w)}"></label>
    <label>H<input data-group-field="h" type="number" min="120" step="10" value="${escapeHtml(rect.h)}"></label>
  </div>
</div>
<div class="sai-inspector-actions">
  <button type="button" data-inspector-action="jump-group"><i class="fa-solid fa-location-crosshairs"></i><span>${escapeHtml(t('Jump', '跳转'))}</span></button>
  <button type="button" data-inspector-action="delete-group" class="danger"><i class="fa-solid fa-trash"></i><span>${escapeHtml(t('Delete group', '删除分组'))}</span></button>
</div>`;
        }

        function renderEdgeInspector(edge) {
            if (!edge) return renderInspectorEmpty();
            const from = getNode(edge.from);
            const to = getNode(edge.to);
            const slotLabel = edge.type === 'config'
                ? `${edge.slot} config`
                : (edge.type === 'text'
                    ? `${edge.slot} text`
                    : (edge.type === 'timeline'
                        ? 'Timeline clip'
                        : (edge.type === 'compare'
                            ? `Image ${String(edge.slot).toUpperCase()}`
                            : (edge.type === 'image'
                                ? edge.slot
                                : call('getSlotLabel', '', to, edge.slot)))));
            return `
<div class="sai-inspector-section">
  <h3>${escapeHtml(t('Edge', '连线'))}</h3>
  <div class="sai-inspector-kv"><span>${escapeHtml(t('Type', '类型'))}</span><b>${escapeHtml(edge.type || '')}</b></div>
  <div class="sai-inspector-kv"><span>From</span><b>${escapeHtml(from?.title || edge.from)}</b></div>
  <div class="sai-inspector-kv"><span>To</span><b>${escapeHtml(to?.title || edge.to)}</b></div>
  ${edge.slot ? `<div class="sai-inspector-kv"><span>Slot</span><b>${escapeHtml(slotLabel)}</b></div>` : ''}
</div>
<div class="sai-inspector-actions">
  <button type="button" data-inspector-action="delete-edge" class="danger"><i class="fa-solid fa-trash"></i><span>${escapeHtml(t('Delete edge', '删除连线'))}</span></button>
</div>`;
        }

        return {
            renderInspector,
            renderNodeInspector,
            renderNodeAppearanceInspector,
            renderInspectorEmpty,
            renderSelectionInspector,
            renderGroupInspector,
            renderEdgeInspector
        };
    }

    window.SimpAICanvasWorkbenchInspector = Object.assign({}, window.SimpAICanvasWorkbenchInspector || {}, {
        createCanvasInspectorController
    });
})();
