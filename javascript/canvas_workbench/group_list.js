(function () {
    'use strict';

    function call(context, name, fallback, ...args) {
        return typeof context?.[name] === 'function' ? context[name](...args) : fallback;
    }

    function t(context, en, cn) {
        return call(context, 't', cn || en, en, cn);
    }

    function escapeHtml(context, value) {
        return call(context, 'escapeHtml', String(value ?? ''), value);
    }

    function getDocument(context) {
        return call(context, 'getDocument', typeof document !== 'undefined' ? document : null);
    }

    function delegate(context, name) {
        if (typeof context?.[name] !== 'function') return undefined;
        return (...args) => context[name](...args);
    }

    function createGroupListContext(source) {
        const scope = source?.groupListSource || source || {};
        const languageSource = scope.languageSource || {};
        const utilitySource = scope.utilitySource || {};
        const domSource = scope.domSource || {};
        const groupSource = scope.groupSource || {};
        const actionSource = scope.actionSource || {};
        const viewportSource = scope.viewportSource || {};
        const viewSource = scope.viewSource || {};
        return {
            t: typeof languageSource.t === 'function' ? languageSource.t : ((en, cn) => cn || en),
            escapeHtml: typeof utilitySource.escapeHtml === 'function' ? utilitySource.escapeHtml : (value => String(value ?? '')),
            getDocument: () => typeof domSource.getDocument === 'function'
                ? domSource.getDocument()
                : domSource.document || (typeof document !== 'undefined' ? document : null),
            getGroups: delegate(groupSource, 'getGroups'),
            getGroup: delegate(groupSource, 'getGroup'),
            getNodesInsideGroup: delegate(groupSource, 'getNodesInsideGroup'),
            groupShortcutLabel: delegate(groupSource, 'groupShortcutLabel'),
            normalizeCanvasColor: delegate(groupSource, 'normalizeCanvasColor'),
            focusGroup: delegate(groupSource, 'focusGroup'),
            addAreaGroup: delegate(actionSource, 'addAreaGroup'),
            viewportCenterWorld: delegate(viewportSource, 'viewportCenterWorld'),
            detectWorkbenchTheme: delegate(viewSource, 'detectWorkbenchTheme'),
            ensureWorkbenchFormFieldNames: delegate(viewSource, 'ensureWorkbenchFormFieldNames')
        };
    }

    function openPanel(context) {
        const doc = getDocument(context);
        if (!doc?.querySelector || !doc.createElement || !doc.body) return;
        const translate = (en, cn) => t(context, en, cn);
        const escape = (value) => escapeHtml(context, value);
        const existing = doc.querySelector('.sai-group-list-modal');
        if (existing) existing.remove();
        const groups = call(context, 'getGroups', [], {}) || [];
        const modal = doc.createElement('div');
        modal.className = 'sai-canvas-modal sai-group-list-modal';
        modal.classList.toggle('theme-dark', call(context, 'detectWorkbenchTheme', 'dark') === 'dark');
        modal.innerHTML = `
<div class="sai-canvas-modal-panel sai-group-list-panel">
  <div class="sai-canvas-modal-head">
    <h3>${escape(translate('Area Groups', '区域分组'))}</h3>
    <button type="button" data-modal-close><i class="fa-solid fa-xmark"></i></button>
  </div>
  <div class="sai-group-list-body">
    ${groups.length ? groups.map(group => {
            const shortcut = call(context, 'groupShortcutLabel', '', group);
            const count = call(context, 'getNodesInsideGroup', [], group).length;
            const color = call(context, 'normalizeCanvasColor', '#14b8a6', group.color, '#14b8a6');
            return `<button type="button" data-group-jump="${escape(group.id)}">
      <i class="fa-solid fa-object-group" style="color:${escape(color)}"></i>
      <span>${escape(group.title || translate('Group', '分组'))}</span>
      <b>${escape(shortcut || `${count} ${translate('nodes', '节点')}`)}</b>
    </button>`;
        }).join('') : `<div class="sai-canvas-empty">${escape(translate('No groups yet. Add one around a selected work area.', '还没有分组。可以围绕选中的工作区域添加一个。'))}</div>`}
  </div>
  <div class="sai-canvas-modal-foot">
    <button type="button" data-group-add><i class="fa-solid fa-plus"></i><span>${escape(translate('Add group', '添加分组'))}</span></button>
  </div>
</div>`;
        doc.body.appendChild(modal);
        call(context, 'ensureWorkbenchFormFieldNames', null, modal, 'group_list');
        modal.addEventListener('click', (evt) => {
            if (evt.target === modal || evt.target.closest('[data-modal-close]')) {
                modal.remove();
                return;
            }
            const jump = evt.target.closest('[data-group-jump]');
            if (jump) {
                const group = call(context, 'getGroup', null, jump.getAttribute('data-group-jump'));
                modal.remove();
                call(context, 'focusGroup', null, group);
                return;
            }
            if (evt.target.closest('[data-group-add]')) {
                modal.remove();
                call(context, 'addAreaGroup', null, call(context, 'viewportCenterWorld', { x: 0, y: 0 }));
            }
        });
    }

    window.SimpAICanvasWorkbenchGroupList = {
        createGroupListContext,
        openPanel
    };
})();
