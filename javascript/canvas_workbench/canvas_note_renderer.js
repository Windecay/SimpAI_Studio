(function () {
    'use strict';

    function createCanvasNoteRenderer(context) {
        const scope = context?.noteRendererSource || context || {};
        const projectSource = scope.projectSource || {};
        const selectionSource = scope.selectionSource || {};
        const geometrySource = scope.geometrySource || {};
        const utilitySource = scope.utilitySource || {};
        const renderSource = scope.renderSource || {};
        const languageSource = scope.languageSource || {};
        const call = (source, name, fallback, ...args) => typeof source[name] === 'function'
            ? source[name](...args) : fallback;
        const getProject = () => call(projectSource, 'getProject', {}) || {};
        const isSelected = node => call(selectionSource, 'getSelectedNodeId', null) === node.id
            || !!call(selectionSource, 'getSelectedNodeIds', null)?.has(node.id);
        const getNodeRect = node => call(geometrySource, 'getNodeRect', {}, node);
        const rectsOverlap = (...args) => call(geometrySource, 'rectsOverlap', false, ...args);
        const noteTailState = node => call(geometrySource, 'noteTailState', {}, node);
        const noteTailBasePoint = (...args) => call(geometrySource, 'noteTailBasePoint', {}, ...args);
        const noteTailShapePath = (...args) => call(geometrySource, 'noteTailShapePath', '', ...args);
        const normalizeCanvasColor = (...args) => call(utilitySource, 'normalizeCanvasColor', '', ...args);
        const clamp = (...args) => call(utilitySource, 'clamp', args[0], ...args);
        const escapeHtml = value => call(utilitySource, 'escapeHtml', String(value ?? ''), value);
        const renderNodeStateBadges = node => call(renderSource, 'renderNodeStateBadges', '', node);
        const t = (en, cn) => {
            const state = call(languageSource, 'getLanguageState', {}) || {};
            return call(languageSource, 't', state.__lang === 'cn' || state.__lang === 'zh' ? cn : en, en, cn, state);
        };

        function renderNoteNodeHtml(node) {
            const style = Object.assign({ color: '#f8fafc', background: '#164e63', font_size: 14 }, node.style || {});
            const color = normalizeCanvasColor(style.color, '#f8fafc');
            const background = normalizeCanvasColor(style.background, '#164e63');
            const fontSize = clamp(Number(style.font_size || 14), 10, 42);
            const tailEnabled = !!node.tail?.enabled;
            return `
<div class="sai-node-head sai-note-head">
  <span class="sai-node-kind">${escapeHtml(t('Tip', '提示'))}</span>
  <span class="sai-node-title">${escapeHtml(node.title || t('Tip Note', '提示贴'))}</span>
  ${renderNodeStateBadges(node)}
  <button type="button" class="${tailEnabled ? 'is-active' : ''}" data-node-action="toggle-note-tail" title="${escapeHtml(t('Toggle pointer tail', '开关指引尾巴'))}"><i class="fa-solid fa-location-dot"></i></button>
  <button type="button" data-node-action="delete" title="${escapeHtml(t('Delete', '删除'))}"><i class="fa-solid fa-xmark"></i></button>
</div>
<textarea class="sai-note-body" data-note-text style="color:${escapeHtml(color)};background:${escapeHtml(background)};font-size:${escapeHtml(String(fontSize))}px;">${escapeHtml(node.text || '')}</textarea>`;
        }

        function shouldRenderNoteTailInViewport(node, target, renderWindow) {
            if (isSelected(node)) return true;
            const noteRect = getNodeRect(node);
            const targetRect = { x: Number(target.x || 0) - 18, y: Number(target.y || 0) - 18, w: 36, h: 36 };
            return rectsOverlap(noteRect, renderWindow, 260) || rectsOverlap(targetRect, renderWindow, 260);
        }

        function renderNoteTailSvg(paths, keyParts, renderWindow) {
            (getProject().nodes || []).forEach((node) => {
                if (!node || node.type !== 'note') return;
                const state = noteTailState(node);
                if (!state.enabled || state.target.x === null || state.target.y === null) return;
                const target = state.target;
                if (!shouldRenderNoteTailInViewport(node, target, renderWindow)) return;
                const base = noteTailBasePoint(node, target);
                const selected = isSelected(node);
                const color = normalizeCanvasColor(node.style?.background, '#164e63');
                const d = noteTailShapePath(base, target);
                keyParts.push(['note-tail', node.id, selected ? 1 : 0, base.x, base.y, target.x, target.y, color].join(':'));
                paths.push(`<path class="sai-note-tail${selected ? ' is-selected' : ''}" data-note-tail-id="${escapeHtml(node.id)}" d="${escapeHtml(d)}" style="--sai-note-tail-color:${escapeHtml(color)}"></path>`);
                paths.push(`<line class="sai-note-tail-line${selected ? ' is-selected' : ''}" x1="${escapeHtml(base.x)}" y1="${escapeHtml(base.y)}" x2="${escapeHtml(target.x)}" y2="${escapeHtml(target.y)}"></line>`);
                paths.push(`<circle class="sai-note-tail-anchor${selected ? ' is-selected' : ''}" data-note-tail-anchor="${escapeHtml(node.id)}" cx="${escapeHtml(target.x)}" cy="${escapeHtml(target.y)}" r="7" title="${escapeHtml(t('Drag to move pointer target', '拖动调整指向位置'))}"></circle>`);
            });
        }

        return { renderNoteNodeHtml, renderNoteTailSvg };
    }

    window.SimpAICanvasWorkbenchNoteRenderer = Object.assign(
        {}, window.SimpAICanvasWorkbenchNoteRenderer || {}, { createCanvasNoteRenderer }
    );
})();
