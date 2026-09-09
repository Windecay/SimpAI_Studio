(function () {
    'use strict';

    const UTILS = window.SimpAICanvasWorkbenchUtils || {};
    const escapeHtml = UTILS.escapeHtml || ((value) => String(value ?? ''));
    const t = UTILS.t || ((en, cn) => cn || en);

    function call(context, name, fallback, ...args) {
        return typeof context?.[name] === 'function' ? context[name](...args) : fallback;
    }

    function getProject(context) {
        const project = typeof context?.getProject === 'function' ? context.getProject() : null;
        return project && typeof project === 'object' ? project : {};
    }

    function projectId(context) {
        if (typeof context?.getCurrentProjectId === 'function') {
            const currentId = context.getCurrentProjectId();
            if (currentId) return currentId;
        }
        const project = getProject(context);
        const currentId = typeof context?.getProjectId === 'function' ? context.getProjectId() : '';
        return project.id || currentId || 'default';
    }

    function formatBytes(context, bytes) {
        return call(context, 'formatBytes', '', bytes);
    }

    function delegate(context, name) {
        if (typeof context?.[name] !== 'function') return undefined;
        return (...args) => context[name](...args);
    }

    function createProjectManagerContext(source) {
        const context = source || {};
        return {
            getProject: delegate(context, 'getProject'),
            getProjectId: delegate(context, 'getProjectId'),
            closeContextMenu: delegate(context, 'closeContextMenu'),
            detectWorkbenchTheme: delegate(context, 'detectWorkbenchTheme'),
            deleteProject: delegate(context, 'deleteProject'),
            formatBytes: delegate(context, 'formatBytes'),
            getCurrentProjectId: delegate(context, 'getCurrentProjectId'),
            handleProjectDeleted: delegate(context, 'handleProjectDeleted'),
            listProjects: delegate(context, 'listProjects'),
            openProjectJsonPicker: delegate(context, 'openProjectJsonPicker'),
            saveCurrentProject: delegate(context, 'saveCurrentProject'),
            showToast: delegate(context, 'showToast'),
            switchProjectById: delegate(context, 'switchProjectById')
        };
    }

    async function openPanel(context) {
        call(context, 'closeContextMenu', null);
        const modal = document.createElement('div');
        modal.className = 'sai-canvas-modal';
        modal.classList.toggle('theme-dark', call(context, 'detectWorkbenchTheme', 'dark') === 'dark');
        modal.innerHTML = `
<div class="sai-canvas-modal-panel sai-project-manager">
  <div class="sai-canvas-modal-head">
    <span>${escapeHtml(t('Workbench Projects', '工作台项目'))}</span>
    <button type="button" data-modal-close title="${escapeHtml(t('Close', '关闭'))}"><i class="fa-solid fa-xmark"></i></button>
  </div>
  <div class="sai-project-manager-body"><p>${escapeHtml(t('Loading projects...', '正在加载项目...'))}</p></div>
</div>`;
        document.body.appendChild(modal);
        modal.addEventListener('click', (evt) => {
            if (evt.target === modal || evt.target.closest('[data-modal-close]')) modal.remove();
        });
        await renderPanel(modal, context);
    }

    async function renderPanel(modal, context) {
        const body = modal.querySelector('.sai-project-manager-body');
        if (!body) return;
        let response = null;
        try {
            response = await call(context, 'listProjects', null, { project_id: projectId(context) });
        } catch (error) {
            response = { ok: false, error: error?.message || String(error || 'project list failed') };
        }
        const items = Array.isArray(response?.projects) ? response.projects : [];
        const activeId = projectId(context);
        body.innerHTML = `
<div class="sai-asset-toolbar">
  <button type="button" data-project-action="refresh"><i class="fa-solid fa-rotate"></i><span>${escapeHtml(t('Refresh', '刷新'))}</span></button>
  <button type="button" data-project-action="new"><i class="fa-solid fa-file-circle-plus"></i><span>${escapeHtml(t('New', '新建'))}</span></button>
  <button type="button" data-project-action="import-json"><i class="fa-solid fa-file-import"></i><span>${escapeHtml(t('Import JSON', '导入 JSON'))}</span></button>
  <button type="button" data-project-action="save-current"><i class="fa-solid fa-floppy-disk"></i><span>${escapeHtml(t('Save Current', '保存当前'))}</span></button>
</div>
${response?.storage?.path ? `<div class="sai-inspector-path"><span>${escapeHtml(t('Project Root', '项目根目录'))}</span><code>${escapeHtml(response.storage.path.replace(/[\\/][^\\/]+$/, ''))}</code></div>` : ''}
${response && !response.ok ? `<div class="sai-inspector-note">${escapeHtml(response.error || 'Project list failed')}</div>` : ''}
<div class="sai-project-list">${items.length ? items.map(item => renderProjectListRow(item, activeId, context)).join('') : `<p>${escapeHtml(t('No project files found.', '没有找到项目文件。'))}</p>`}</div>`;
        bindPanel(modal, context);
    }

    function renderProjectListRow(item, activeId, context) {
        const itemProjectId = item.project_id || item.name || '';
        const isActive = itemProjectId === activeId;
        const updated = item.updated_at ? new Date(Number(item.updated_at) * 1000).toLocaleString() : '';
        return `
<div class="sai-project-row ${isActive ? 'is-active' : ''}" data-project-id="${escapeHtml(itemProjectId)}">
  <div class="sai-project-icon"><i class="fa-solid ${isActive ? 'fa-folder-open' : 'fa-folder'}"></i></div>
  <div class="sai-project-meta"><b>${escapeHtml(itemProjectId || item.name || 'untitled')}</b><span>${escapeHtml([updated, formatBytes(context, item.size || 0)].filter(Boolean).join(' / '))}</span><code>${escapeHtml(item.path || '')}</code></div>
  <div class="sai-project-actions">
    <button type="button" data-project-row-action="open"><i class="fa-solid ${isActive ? 'fa-rotate' : 'fa-arrow-right-to-bracket'}"></i><span>${escapeHtml(isActive ? t('Reload', '重新加载') : t('Open', '打开'))}</span></button>
    <button type="button" class="danger" data-project-row-action="delete" title="${escapeHtml(t('Delete project', '删除项目'))}"><i class="fa-solid fa-trash"></i><span>${escapeHtml(t('Delete', '删除'))}</span></button>
  </div>
</div>`;
    }

    function bindPanel(modal, context) {
        modal.querySelectorAll('[data-project-action]').forEach((button) => {
            button.addEventListener('click', async () => {
                const action = button.getAttribute('data-project-action');
                if (action === 'refresh') {
                    await renderPanel(modal, context);
                } else if (action === 'save-current') {
                    await call(context, 'saveCurrentProject', null);
                    await renderPanel(modal, context);
                } else if (action === 'new') {
                    const nextId = window.prompt(t('New workbench project name', '新的工作台项目名'), `canvas_${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`);
                    if (nextId) {
                        await call(context, 'switchProjectById', null, nextId, { createIfMissing: true });
                        modal.remove();
                    }
                } else if (action === 'import-json') {
                    modal.remove();
                    call(context, 'openProjectJsonPicker', null);
                }
            });
        });
        modal.querySelectorAll('[data-project-row-action="open"]').forEach((button) => {
            button.addEventListener('click', async () => {
                const row = button.closest('[data-project-id]');
                const nextProjectId = row?.getAttribute('data-project-id') || '';
                if (!nextProjectId) return;
                const isActiveProject = nextProjectId === projectId(context);
                await call(context, 'switchProjectById', null, nextProjectId, { createIfMissing: false, reloadActive: isActiveProject });
                modal.remove();
            });
        });
        modal.querySelectorAll('[data-project-row-action="delete"]').forEach((button) => {
            button.addEventListener('click', async () => {
                const row = button.closest('[data-project-id]');
                const targetProjectId = row?.getAttribute('data-project-id') || '';
                if (!targetProjectId) return;
                const item = { project_id: targetProjectId, path: row.querySelector('.sai-project-meta code')?.textContent || '' };
                const isActiveProject = targetProjectId === projectId(context);
                const confirmed = await confirmProjectDelete(modal, item, context);
                if (!confirmed) return;
                button.disabled = true;
                const result = await call(context, 'deleteProject', null, { project_id: targetProjectId });
                if (!result || !result.ok) {
                    button.disabled = false;
                    showPanelMessage(modal, result?.error || result?.details || t('Project delete failed.', '项目删除失败。'));
                    return;
                }
                call(context, 'handleProjectDeleted', null, targetProjectId, result);
                call(context, 'showToast', null, (isActiveProject
                    ? t('Deleted project file; current canvas is kept in browser cache: {id}', '已删除项目文件，当前画布已保留在浏览器缓存：{id}')
                    : t('Deleted workbench project: {id}', '已删除工作台项目：{id}')
                ).replace('{id}', targetProjectId));
                await renderPanel(modal, context);
            });
        });
    }

    function showPanelMessage(modal, message) {
        const body = modal.querySelector('.sai-project-manager-body');
        if (!body) return;
        let note = body.querySelector('.sai-project-manager-message');
        if (!note) {
            note = document.createElement('div');
            note.className = 'sai-project-manager-message';
            body.prepend(note);
        }
        note.textContent = message || '';
    }

    function confirmProjectDelete(modal, item, context) {
        const targetProjectId = item?.project_id || '';
        if (!targetProjectId) return Promise.resolve(false);
        const isActive = targetProjectId === projectId(context);
        const confirm = document.createElement('div');
        confirm.className = 'sai-project-delete-confirm';
        confirm.innerHTML = `
<div class="sai-project-delete-card" role="dialog" aria-modal="true" aria-label="${escapeHtml(t('Confirm delete project', '确认删除项目'))}">
  <div class="sai-project-delete-icon"><i class="fa-solid fa-trash"></i></div>
  <div class="sai-project-delete-copy">
    <h3>${escapeHtml(t('Delete this workbench project?', '删除这个工作台项目？'))}</h3>
    <p>${escapeHtml(t('This deletes the saved project JSON file from the user directory. Canvas asset and output files are kept.', '这会删除用户目录中的项目 JSON 文件；画布素材和输出文件会保留。'))}</p>
    ${isActive ? `<p class="sai-project-delete-warn">${escapeHtml(t('This project is currently open. After deletion, the current canvas will stay in browser cache.', '这个项目当前正在打开。删除后，当前画布会继续保留在浏览器缓存。'))}</p>` : ''}
    <code>${escapeHtml(targetProjectId)}</code>
    ${item.path ? `<small>${escapeHtml(item.path)}</small>` : ''}
  </div>
  <div class="sai-project-delete-actions">
    <button type="button" data-project-delete-cancel>${escapeHtml(t('Cancel', '取消'))}</button>
    <button type="button" class="danger" data-project-delete-confirm><i class="fa-solid fa-trash"></i><span>${escapeHtml(t('Delete', '删除'))}</span></button>
  </div>
</div>`;
        modal.appendChild(confirm);
        return new Promise((resolve) => {
            let keyHandler = null;
            const finish = (value) => {
                if (keyHandler) document.removeEventListener('keydown', keyHandler, true);
                confirm.remove();
                resolve(value);
            };
            confirm.addEventListener('click', (evt) => {
                if (evt.target === confirm || evt.target.closest('[data-project-delete-cancel]')) finish(false);
                if (evt.target.closest('[data-project-delete-confirm]')) finish(true);
            });
            keyHandler = (evt) => {
                if (!document.body.contains(confirm)) {
                    document.removeEventListener('keydown', keyHandler, true);
                    return;
                }
                if (evt.key === 'Escape') {
                    evt.preventDefault();
                    document.removeEventListener('keydown', keyHandler, true);
                    finish(false);
                }
            };
            document.addEventListener('keydown', keyHandler, true);
            confirm.querySelector('[data-project-delete-cancel]')?.focus();
        });
    }

    window.SimpAICanvasWorkbenchProjectManager = {
        createProjectManagerContext,
        openPanel
    };
})();
