(function () {
    'use strict';

    function createCanvasNoteInspectorController(context) {
        const scope = context?.noteInspectorSource || context || {};
        const geometrySource = scope.geometrySource || {};
        const editSource = scope.editSource || {};
        const selectionSource = scope.selectionSource || {};
        const utilitySource = scope.utilitySource || {};
        const languageSource = scope.languageSource || {};
        const call = (source, name, fallback, ...args) => typeof source[name] === 'function'
            ? source[name](...args) : fallback;
        const normalizeCanvasColor = (...args) => call(geometrySource, 'normalizeCanvasColor', '', ...args);
        const noteTailState = node => call(geometrySource, 'noteTailState', {}, node);
        const defaultNoteTailTarget = node => call(geometrySource, 'defaultNoteTailTarget', {}, node);
        const getSelectedNodeId = () => call(selectionSource, 'getSelectedNodeId', null);
        const updateNoteText = (...args) => call(editSource, 'updateNoteText', undefined, ...args);
        const updateNoteStyle = (...args) => call(editSource, 'updateNoteStyle', undefined, ...args);
        const updateNoteSize = (...args) => call(editSource, 'updateNoteSize', undefined, ...args);
        const updateNoteTail = (...args) => call(editSource, 'updateNoteTail', undefined, ...args);
        const escapeHtml = value => call(utilitySource, 'escapeHtml', String(value ?? ''), value);
        const t = (en, cn) => {
            const state = call(languageSource, 'getLanguageState', {}) || {};
            return call(languageSource, 't', state.__lang === 'cn' || state.__lang === 'zh' ? cn : en, en, cn, state);
        };

        function renderNoteInspector(node) {
            const style = Object.assign({ color: '#f8fafc', background: '#164e63', font_size: 14 }, node.style || {});
            const tail = noteTailState(node);
            const tailTarget = tail.target.x === null || tail.target.y === null ? defaultNoteTailTarget(node) : tail.target;
            return `
<div class="sai-inspector-section">
  <h3>${escapeHtml(t('Tip Note', '提示贴'))}</h3>
  <label>${escapeHtml(t('Title', '标题'))}<input data-inspector-node-field="title" value="${escapeHtml(node.title || '')}"></label>
  <label>${escapeHtml(t('Text', '文本'))}<textarea data-note-text rows="8">${escapeHtml(node.text || '')}</textarea></label>
</div>
<div class="sai-inspector-section">
  <h3>${escapeHtml(t('Style', '样式'))}</h3>
  <label>${escapeHtml(t('Text Color', '字体颜色'))}<input data-note-style="color" type="color" value="${escapeHtml(normalizeCanvasColor(style.color, '#f8fafc'))}"></label>
  <label>${escapeHtml(t('Background', '底色'))}<input data-note-style="background" type="color" value="${escapeHtml(normalizeCanvasColor(style.background, '#164e63'))}"></label>
  <label>${escapeHtml(t('Font Size', '字体大小'))}<input data-note-style="font_size" type="number" min="10" max="42" step="1" value="${escapeHtml(style.font_size ?? 14)}"></label>
  <div class="sai-inspector-grid2">
    <label>${escapeHtml(t('Width', '宽度'))}<input data-note-size="w" type="number" min="180" step="10" value="${escapeHtml(node.w || 260)}"></label>
    <label>${escapeHtml(t('Height', '高度'))}<input data-note-size="h" type="number" min="120" step="10" value="${escapeHtml(node.h || 160)}"></label>
  </div>
</div>
<div class="sai-inspector-section">
  <h3>${escapeHtml(t('Pointer Tail', '指引尾巴'))}</h3>
  <label class="sai-node-check"><input data-note-tail="enabled" type="checkbox" ${tail.enabled ? 'checked' : ''}><span>${escapeHtml(t('Show pointer tail', '显示指引尾巴'))}</span></label>
  <div class="sai-inspector-grid2">
    <label>${escapeHtml(t('Target X', '目标 X'))}<input data-note-tail="target_x" type="number" step="1" value="${escapeHtml(tailTarget.x)}"></label>
    <label>${escapeHtml(t('Target Y', '目标 Y'))}<input data-note-tail="target_y" type="number" step="1" value="${escapeHtml(tailTarget.y)}"></label>
  </div>
  <p>${escapeHtml(t('Drag the small dot at the tail end to point at any fixed canvas position.', '拖动尾巴末端的小圆点，可以指向画布上的固定位置。'))}</p>
  <button type="button" class="sai-inline-config-btn" data-inspector-action="reset-note-tail"><i class="fa-solid fa-location-crosshairs"></i><span>${escapeHtml(t('Reset pointer', '重置指向'))}</span></button>
</div>
<div class="sai-inspector-actions">
  <button type="button" data-inspector-action="duplicate"><i class="fa-solid fa-copy"></i><span>${escapeHtml(t('Duplicate', '复制'))}</span></button>
  <button type="button" data-inspector-action="delete" class="danger"><i class="fa-solid fa-trash"></i><span>${escapeHtml(t('Delete', '删除'))}</span></button>
</div>`;
        }

        function bindNoteInspectorEvents(inspector) {
            inspector.querySelectorAll('[data-note-text]').forEach((field) => {
                field.addEventListener('input', () => updateNoteText(getSelectedNodeId(), field.value));
                field.addEventListener('change', () => updateNoteText(getSelectedNodeId(), field.value, { render: true }));
            });
            inspector.querySelectorAll('[data-note-style]').forEach((field) => {
                const handler = () => updateNoteStyle(getSelectedNodeId(), field.getAttribute('data-note-style'), field.value, field.type);
                field.addEventListener('input', handler);
                field.addEventListener('change', handler);
            });
            inspector.querySelectorAll('[data-note-size]').forEach((field) => {
                const handler = () => updateNoteSize(getSelectedNodeId(), field.getAttribute('data-note-size'), field.value);
                field.addEventListener('input', handler);
                field.addEventListener('change', handler);
            });
            inspector.querySelectorAll('[data-note-tail]').forEach((field) => {
                const handler = () => updateNoteTail(getSelectedNodeId(), field.getAttribute('data-note-tail'), field.type === 'checkbox' ? field.checked : field.value, field.type, { renderNodes: field.type === 'checkbox' });
                field.addEventListener('input', handler);
                field.addEventListener('change', handler);
            });
        }

        return { renderNoteInspector, bindNoteInspectorEvents };
    }

    window.SimpAICanvasWorkbenchNoteInspector = Object.assign(
        {}, window.SimpAICanvasWorkbenchNoteInspector || {}, { createCanvasNoteInspectorController }
    );
})();
