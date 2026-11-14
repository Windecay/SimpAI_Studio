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

    function getPrompt(context, ...args) {
        return call(context, 'prompt', null, ...args);
    }

    function nowIso(context) {
        return call(context, 'nowIso', '');
    }

    function formatLocalTime(context, value) {
        return call(context, 'formatLocalTime', '', value);
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

    function mergeProjectEntries(remote, cached, current, options = {}) {
        const entries = new Map();
        for (const item of Array.isArray(remote) ? remote : []) {
            const id = String(item?.project_id || '');
            if (id) entries.set(id, { ...item, project_id: id, saved: true });
        }
        for (const item of Array.isArray(cached) ? cached : []) {
            const id = String(item?.project_id || '');
            if (id) entries.set(id, { ...item, saved: false, ...entries.get(id), project_id: id, cached: true });
        }
        const id = String(current?.id || '');
        if (id && options.includeCurrent !== false && !entries.has(id)) entries.set(id, {
            project_id: id, cached: true, saved: false, title: current.title || id
        });
        return Array.from(entries.values());
    }

    function createProjectManagerContext(source) {
        const scope = source?.projectManagerSource || source || {};
        const languageSource = scope.languageSource || {};
        const utilitySource = scope.utilitySource || {};
        const domSource = scope.domSource || {};
        const browserSource = scope.browserSource || {};
        const projectSource = scope.projectSource || {};
        const requestSource = scope.requestSource || {};
        const viewSource = scope.viewSource || {};
        const uiSource = scope.uiSource || {};
        const timeSource = scope.timeSource || {};
        const context = {
            t: typeof languageSource.t === 'function' ? languageSource.t : ((en, cn) => cn || en),
            escapeHtml: typeof utilitySource.escapeHtml === 'function' ? utilitySource.escapeHtml : (value => String(value ?? '')),
            getDocument: () => typeof domSource.getDocument === 'function'
                ? domSource.getDocument()
                : domSource.document || (typeof document !== 'undefined' ? document : null),
            prompt: (...args) => typeof browserSource.prompt === 'function'
                ? browserSource.prompt(...args)
                : (typeof window !== 'undefined' && typeof window.prompt === 'function' ? window.prompt(...args) : null),
            nowIso: typeof timeSource.nowIso === 'function' ? timeSource.nowIso : (() => ''),
            formatLocalTime: typeof timeSource.formatLocalTime === 'function' ? timeSource.formatLocalTime : (value => String(value || '')),
            getProject: delegate(projectSource, 'getProject'),
            getProjectId: delegate(projectSource, 'getProjectId'),
            closeContextMenu: delegate(viewSource, 'closeContextMenu'),
            detectWorkbenchTheme: delegate(viewSource, 'detectWorkbenchTheme'),
            deleteProject: delegate(requestSource, 'deleteProject'),
            formatBytes: delegate(utilitySource, 'formatBytes'),
            getCurrentProjectId: delegate(projectSource, 'getCurrentProjectId'),
            handleProjectDeleted: delegate(projectSource, 'handleProjectDeleted'),
            listProjects: delegate(requestSource, 'listProjects'),
            openProjectJsonPicker: delegate(projectSource, 'openProjectJsonPicker'),
            saveCurrentProject: delegate(projectSource, 'saveCurrentProject'),
            showToast: delegate(uiSource, 'showToast'),
            switchProjectById: delegate(projectSource, 'switchProjectById')
        };
        for (const name of ['getScopeKey', 'openProject', 'isProjectOpen', 'requestDeleteDraft', 'getProjectRunStatus']) {
            context[name] = delegate(projectSource, name);
        }
        context.getProject = delegate(projectSource, 'getProject');
        return context;
    }

    async function openPanel(context) {
        call(context, 'closeContextMenu', null);
        const doc = getDocument(context);
        if (!doc?.createElement) return false;
        const modal = doc.createElement('div');
        modal.className = 'sai-canvas-modal';
        modal.classList.toggle('theme-dark', call(context, 'detectWorkbenchTheme', 'dark') === 'dark');
        modal.innerHTML = `
<div class="sai-canvas-modal-panel sai-project-manager">
  <div class="sai-canvas-modal-head">
    <span>${escapeHtml(context, t(context, 'Workbench Projects', '工作台项目'))}</span>
    <button type="button" data-modal-close title="${escapeHtml(context, t(context, 'Close', '关闭'))}"><i class="fa-solid fa-xmark"></i></button>
  </div>
  <div class="sai-project-manager-body"><p>${escapeHtml(context, t(context, 'Loading projects...', '正在加载项目...'))}</p></div>
</div>`;
        doc.body?.appendChild(modal);
        modal.addEventListener('click', (evt) => {
            if (evt.target === modal || evt.target.closest('[data-modal-close]')) modal.remove();
        });
        await renderPanel(modal, context);
        return true;
    }

    async function renderPanel(modal, context) {
        const body = modal.querySelector('.sai-project-manager-body');
        if (!body) return;
        const requestedScope = call(context, 'getScopeKey', '');
        const sequence = (modal.__projectListSequence || 0) + 1;
        modal.__projectListSequence = sequence;
        let response = null;
        try {
            response = await call(context, 'listProjects', null, { project_id: projectId(context) });
        } catch (error) {
            response = { ok: false, error: error?.message || String(error || 'project list failed') };
        }
        if (modal.__projectListSequence !== sequence || requestedScope !== call(context, 'getScopeKey', '') || modal.isConnected === false) return;
        const items = Array.isArray(response?.projects) ? response.projects : [];
        const activeId = projectId(context);
        body.innerHTML = `
<div class="sai-asset-toolbar">
  <button type="button" data-project-action="refresh"><i class="fa-solid fa-rotate"></i><span>${escapeHtml(context, t(context, 'Refresh', '刷新'))}</span></button>
  <button type="button" data-project-action="new"><i class="fa-solid fa-file-circle-plus"></i><span>${escapeHtml(context, t(context, 'New', '新建'))}</span></button>
  <button type="button" data-project-action="import-json"><i class="fa-solid fa-file-import"></i><span>${escapeHtml(context, t(context, 'Import JSON', '导入 JSON'))}</span></button>
  <button type="button" data-project-action="save-current"><i class="fa-solid fa-floppy-disk"></i><span>${escapeHtml(context, t(context, 'Save Current', '保存当前'))}</span></button>
</div>
${response?.storage?.path ? `<div class="sai-inspector-path"><span>${escapeHtml(context, t(context, 'Project Root', '项目根目录'))}</span><code>${escapeHtml(context, response.storage.path.replace(/[\\/][^\\/]+$/, ''))}</code></div>` : ''}
${response && !response.ok ? `<div class="sai-inspector-note">${escapeHtml(context, response.error || 'Project list failed')}</div>` : ''}
<p class="sai-project-list-note">${escapeHtml(context, t(context, 'Saved projects and browser drafts are listed here. Closing a tab keeps both.', '这里列出已保存项目和浏览器草稿。关闭标签会保留它们。'))}</p>
<div class="sai-project-list">${items.length ? items.map(item => renderProjectListRow(item, activeId, context)).join('') : `<p>${escapeHtml(context, t(context, 'No workbenches found.', '没有工作台。'))}</p>`}</div>`;
        bindPanel(modal, context);
    }

    function renderProjectListRow(item, activeId, context) {
        const itemProjectId = item.project_id || item.name || '';
        const isDraft = item.saved === false;
        const isActive = itemProjectId === activeId && call(context, 'isProjectOpen', true, itemProjectId);
        const timestamp = Number(item.updated_at);
        const updated = item.updated_at ? formatLocalTime(context, Number.isFinite(timestamp) ? timestamp * 1000 : item.updated_at) : '';
        const sourceLabel = t(context, isDraft ? 'Browser draft' : 'Saved project', isDraft ? '浏览器草稿' : '已保存项目');
        return `
<div class="sai-project-row ${isActive ? 'is-active' : ''}" data-project-id="${escapeHtml(context, itemProjectId)}" data-project-draft="${isDraft}">
  <div class="sai-project-icon"><i class="fa-solid ${isActive ? 'fa-folder-open' : 'fa-folder'}"></i></div>
  <div class="sai-project-meta"><b title="${escapeHtml(context, itemProjectId)}">${escapeHtml(context, itemProjectId || item.name || 'untitled')}</b><span data-project-storage="${isDraft ? 'draft' : 'saved'}">${escapeHtml(context, sourceLabel)}</span><span>${escapeHtml(context, [updated, item.size ? formatBytes(context, item.size) : ''].filter(Boolean).join(' · '))}</span>${item.path ? `<code>${escapeHtml(context, item.path)}</code>` : ''}</div>
  <div class="sai-project-actions">
    <button type="button" data-project-row-action="open"><i class="fa-solid ${isActive && !isDraft ? 'fa-rotate' : 'fa-arrow-right-to-bracket'}"></i><span>${escapeHtml(context, isActive && !isDraft ? t(context, 'Reload', '重新加载') : t(context, 'Open', '打开'))}</span></button>
    <button type="button" class="danger" data-project-row-action="${isDraft ? 'delete-draft' : 'delete'}" title="${escapeHtml(context, isDraft ? t(context, 'Delete draft', '删除草稿') : t(context, 'Delete project file', '删除项目文件'))}"><i class="fa-solid fa-trash"></i><span>${escapeHtml(context, isDraft ? t(context, 'Delete draft', '删除草稿') : t(context, 'Delete project file', '删除项目文件'))}</span></button>
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
                    const nextId = getPrompt(context, t(context, 'New workbench project name', '新的工作台项目名'), `canvas_${nowIso(context).replace(/[-:.TZ]/g, '').slice(0, 14)}`);
                    if (nextId) {
                        const open = context.openProject || context.switchProjectById;
                        await open?.(nextId, { createIfMissing: true });
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
                const isDraft = row.dataset.projectDraft === 'true';
                const isActiveProject = nextProjectId === projectId(context) && call(context, 'isProjectOpen', true, nextProjectId);
                const open = context.openProject || context.switchProjectById;
                const result = await open?.(nextProjectId, { createIfMissing: isDraft, reloadActive: isActiveProject && !isDraft });
                if (result !== false) modal.remove();
            });
        });
        modal.querySelectorAll('[data-project-row-action="delete-draft"]').forEach(button => {
            button.addEventListener('click', async () => {
                const id = button.closest('[data-project-id]')?.getAttribute('data-project-id');
                if (!id) return;
                const result = await call(context, 'requestDeleteDraft', null, id, modal);
                if (result?.ok) await renderPanel(modal, context);
            });
        });
        modal.querySelectorAll('[data-project-row-action="delete"]').forEach((button) => {
            button.addEventListener('click', async () => {
                const row = button.closest('[data-project-id]');
                const targetProjectId = row?.getAttribute('data-project-id') || '';
                if (!targetProjectId) return;
                const item = { project_id: targetProjectId, path: row.querySelector('.sai-project-meta code')?.textContent || '' };
                const scopeKey = call(context, 'getScopeKey', '');
                const isActiveProject = targetProjectId === projectId(context);
                const confirmed = await confirmProjectDelete(modal, item, context);
                if (!confirmed || scopeKey !== call(context, 'getScopeKey', '')) return;
                button.disabled = true;
                const result = await call(context, 'deleteProject', null, { project_id: targetProjectId });
                if (scopeKey !== call(context, 'getScopeKey', '')) return;
                if (!result || !result.ok) {
                    button.disabled = false;
                    showPanelMessage(modal, result?.error || result?.details || t(context, 'Project delete failed.', '项目删除失败。'), context);
                    return;
                }
                call(context, 'handleProjectDeleted', null, targetProjectId, result);
                call(context, 'showToast', null, (isActiveProject
                    ? t(context, 'Deleted project file; current canvas is kept in browser cache: {id}', '已删除项目文件，当前画布已保留在浏览器缓存：{id}')
                    : t(context, 'Deleted workbench project: {id}', '已删除工作台项目：{id}')
                ).replace('{id}', targetProjectId));
                await renderPanel(modal, context);
            });
        });
    }

    function showPanelMessage(modal, message, context) {
        const body = modal.querySelector('.sai-project-manager-body');
        if (!body) return;
        let note = body.querySelector('.sai-project-manager-message');
        if (!note) {
            const doc = getDocument(context);
            if (!doc?.createElement) return;
            note = doc.createElement('div');
            note.className = 'sai-project-manager-message';
            body.prepend(note);
        }
        note.textContent = message || '';
    }

    function confirmProjectDelete(modal, item, context) {
        const targetProjectId = item?.project_id || '';
        if (!targetProjectId) return Promise.resolve(false);
        const isActive = targetProjectId === projectId(context);
        const draft = item.draft === true;
        const doc = getDocument(context);
        if (!doc?.createElement) return Promise.resolve(false);
        const confirm = doc.createElement('div');
        confirm.className = 'sai-project-delete-confirm';
        confirm.innerHTML = `
<div class="sai-project-delete-card" role="dialog" aria-modal="true" aria-label="${escapeHtml(context, draft ? t(context, 'Confirm delete draft', '确认删除草稿') : t(context, 'Confirm delete project', '确认删除项目'))}">
  <div class="sai-project-delete-icon"><i class="fa-solid fa-trash"></i></div>
  <div class="sai-project-delete-copy">
    <h3>${escapeHtml(context, draft ? t(context, 'Delete this browser draft?', '删除这个浏览器草稿？') : t(context, 'Delete this workbench project?', '删除这个工作台项目？'))}</h3>
    <p>${escapeHtml(context, draft ? t(context, 'This removes the browser draft and its cached edits. Saved project files and media are kept.', '这会删除浏览器草稿及其临时修改，保留已保存的项目文件和媒体素材。') : t(context, 'This deletes the saved project JSON file from the user directory. Canvas asset and output files are kept.', '这会删除用户目录中的项目 JSON 文件；画布素材和输出文件会保留。'))}</p>
    ${isActive ? `<p class="sai-project-delete-warn">${escapeHtml(context, draft ? t(context, 'This draft is currently open. Its tab will close after deletion.', '当前正在编辑这个草稿，删除后会关闭它的标签。') : t(context, 'This project is currently open. After deletion, the current canvas will stay in browser cache.', '这个项目当前正在打开。删除后，当前画布会继续保留在浏览器缓存。'))}</p>` : ''}
    <code>${escapeHtml(context, targetProjectId)}</code>
    ${item.path ? `<small>${escapeHtml(context, item.path)}</small>` : ''}
  </div>
  <div class="sai-project-delete-actions">
    <button type="button" data-project-delete-cancel>${escapeHtml(context, t(context, 'Cancel', '取消'))}</button>
    <button type="button" class="danger" data-project-delete-confirm><i class="fa-solid fa-trash"></i><span>${escapeHtml(context, t(context, 'Delete', '删除'))}</span></button>
  </div>
</div>`;
        modal.appendChild(confirm);
        return new Promise((resolve) => {
            let keyHandler = null;
            const finish = (value) => {
                if (keyHandler) doc.removeEventListener('keydown', keyHandler, true);
                confirm.remove();
                resolve(value);
            };
            confirm.addEventListener('click', (evt) => {
                if (evt.target === confirm || evt.target.closest('[data-project-delete-cancel]')) finish(false);
                if (evt.target.closest('[data-project-delete-confirm]')) finish(true);
            });
            keyHandler = (evt) => {
                if (!doc.body?.contains(confirm)) {
                    doc.removeEventListener('keydown', keyHandler, true);
                    return;
                }
                if (evt.key === 'Escape') {
                    evt.preventDefault();
                    evt.stopPropagation();
                    doc.removeEventListener('keydown', keyHandler, true);
                    finish(false);
                }
            };
            doc.addEventListener('keydown', keyHandler, true);
            confirm.querySelector('[data-project-delete-cancel]')?.focus();
        });
    }

    function createProjectNavigationController(source) {
        const tr = key => call(source, 't', key, key);
        const escape = value => escapeHtml(source, value);
        const saveStates = new WeakMap();
        let root = null;
        let nav = null;
        let tabs = null;
        let panel = null;
        let search = null;
        let list = null;
        let message = null;
        let scopeKey = null;
        let items = [];
        let listState = 'idle';
        let requestSequence = 0;
        let busy = false;
        let tabsSignature = '';
        let activeId = '';
        let removeOutsideListener = null;
        let remoteItems = [];
        let lastResponse = null;
        let pendingList = null;
        let openIds = [];
        let closedIds = [];
        let home = false;
        let homeElement = null;
        let tabMenu = null;
        let menuInvoker = null;
        let mutatingDraft = false;
        let pendingProjectId = '';
        let tabOperationSequence = 0;

        const currentScope = () => String(call(source, 'getScopeKey', ''));
        const currentId = () => String(getProject(source).id || 'default');
        const itemId = item => String(item?.project_id || '');

        function mergeItems(remote) {
            return mergeProjectEntries(remote, call(source, 'getCachedProjects', []) || [], getProject(source), { includeCurrent: !home });
        }

        function saveTabs() {
            try {
                call(source, 'getStorage', null)?.setItem(`${scopeKey}:open_tabs`, JSON.stringify({ version: 1, ids: openIds, closed: closedIds.slice(-20) }));
            } catch { /* Keep this window usable if browser storage is full. */ }
        }

        function loadTabs() {
            let stored;
            try { stored = JSON.parse(call(source, 'getStorage', null)?.getItem(`${scopeKey}:open_tabs`) || 'null'); }
            catch { stored = null; }
            const ids = values => [...new Set((Array.isArray(values) ? values : []).filter(value => typeof value === 'string' && value))];
            openIds = stored?.version === 1 && Array.isArray(stored.ids) ? ids(stored.ids) : [currentId()];
            closedIds = stored?.version === 1 ? ids(stored.closed) : [];
            home = !openIds.length;
            if (!home && !openIds.includes(currentId())) openIds.push(currentId());
            syncHome();
        }

        function syncHome() {
            root?.classList.toggle('sai-workbench-home', home);
            if (homeElement) homeElement.hidden = !home;
            if (home) root?.querySelectorAll('video,audio').forEach(media => media.pause?.());
        }

        function addTab(id) {
            if (!openIds.includes(id)) openIds.push(id);
            closedIds = closedIds.filter(value => value !== id);
            home = false;
            syncHome();
            saveTabs();
        }

        function dismissTabMenu(focus = false) {
            if (tabMenu) tabMenu.hidden = true;
            if (focus && menuInvoker?.isConnected) menuInvoker.focus({ preventScroll: true });
        }

        function close(restoreFocus = false) {
            dismissTabMenu();
            if (!panel || panel.hidden) return;
            panel.hidden = true;
            nav.querySelector('[data-project-toggle]')?.setAttribute('aria-expanded', 'false');
            if (restoreFocus) nav.querySelector('[data-project-toggle]')?.focus();
        }

        function renderList() {
            if (!list || panel.hidden) return;
            const query = search.value.trim().toLocaleLowerCase();
            const visible = items.filter(item => itemId(item).toLocaleLowerCase().includes(query));
            list.innerHTML = visible.map(item => {
                const id = itemId(item);
                const selected = !home && id === currentId();
                const kind = item.saved ? tr('Saved project') : tr('Browser draft');
                return `<button type="button" class="sai-project-option${selected ? ' is-active' : ''}" data-project-open="${escape(id)}" ${selected ? 'aria-current="true"' : ''} ${busy ? 'disabled' : ''}><i class="fa-solid ${selected ? 'fa-folder-open' : item.saved ? 'fa-folder' : 'fa-file-pen'}" aria-hidden="true"></i><span>${escape(id)}</span><small data-project-storage="${item.saved ? 'saved' : 'draft'}">${escape(kind)}</small>${selected ? '<i class="fa-solid fa-check" aria-hidden="true"></i>' : ''}</button>`;
            }).join('');
            const text = listState === 'loading' ? tr('Loading workbenches...')
                : listState === 'error' ? tr('Project list unavailable. Cached workbenches are still available.')
                : !visible.length ? tr('No matching workbenches') : '';
            message.textContent = text;
            message.hidden = !text;
        }

        async function refresh() {
            if (!nav) return null;
            if (pendingList) return pendingList;
            const requestedScope = scopeKey;
            const requestedRoot = root;
            const sequence = ++requestSequence;
            listState = 'loading';
            renderList();
            const request = (async () => {
                let result;
                try { result = await call(source, 'listProjects', null, { project_id: currentId() }); }
                catch { result = null; }
                if (sequence !== requestSequence || requestedScope !== currentScope() || requestedRoot !== call(source, 'getRoot', null)) return null;
                lastResponse = result;
                listState = result?.ok ? 'ready' : 'error';
                if (result?.ok) remoteItems = Array.isArray(result.projects) ? result.projects : [];
                items = mergeItems(remoteItems);
                sync();
                renderList();
                return { ...result, ok: true, backend_available: !!result?.ok, projects: items };
            })();
            pendingList = request;
            try { return await request; }
            finally { if (pendingList === request) pendingList = null; }
        }

        async function select(id, options = {}) {
            if (busy || !id) return false;
            id = String(call(source, 'normalizeProjectId', id, id));
            if (!id) return false;
            if (id === currentId() && !options.reloadActive) {
                addTab(id); sync(); close(true);
                call(source, 'onProjectActivated', null);
                return true;
            }
            const selectedScope = scopeKey;
            const operation = ++tabOperationSequence;
            busy = true;
            pendingProjectId = id;
            close();
            renderTabs();
            try {
                const cached = items.some(item => itemId(item) === id && item.cached);
                const ok = !!await call(source, 'switchProjectById', false, id, { createIfMissing: cached, ...options });
                if (ok && selectedScope === currentScope()) addTab(currentId());
                return ok;
            } catch {
                if (selectedScope === currentScope()) call(source, 'showToast', null, tr('Could not switch workbench. Try again.'));
                return false;
            } finally {
                if (operation === tabOperationSequence) { busy = false; pendingProjectId = ''; sync(); }
                if (operation === tabOperationSequence && selectedScope === currentScope()) {
                    tabs?.querySelector('[aria-selected="true"]')?.focus({ preventScroll: true });
                }
            }
        }

        async function create() {
            if (busy) return;
            const id = getPrompt(source, tr('New workbench project name'), `canvas_${nowIso(source).replace(/[-:.TZ]/g, '').slice(0, 14)}`);
            if (id && String(id).trim()) await select(String(id).trim(), { createIfMissing: true });
        }

        async function closeTab(id) {
            if (busy || !openIds.includes(id)) return false;
            const requestedScope = currentScope();
            if (!home && id === currentId()) {
                const index = openIds.indexOf(id);
                const nextId = openIds[index + 1] || openIds[index - 1];
                if (nextId) {
                    if (!await select(nextId) || requestedScope !== currentScope()) return false;
                } else {
                    const candidate = getProject(source);
                    const operation = ++tabOperationSequence;
                    busy = true; renderTabs();
                    try {
                        const cached = await call(source, 'cacheCurrentProject', false);
                        if (!cached) { call(source, 'showToast', null, tr('Could not close this tab. Its draft could not be saved.')); return false; }
                        if (requestedScope !== currentScope() || getProject(source) !== candidate) return false;
                        home = true; syncHome();
                    } catch {
                        if (requestedScope === currentScope()) call(source, 'showToast', null, tr('Could not close this tab. Its draft could not be saved.'));
                        return false;
                    } finally { if (operation === tabOperationSequence) { busy = false; renderTabs(); renderSaveState(); } }
                }
            }
            if (requestedScope !== currentScope()) return false;
            openIds = openIds.filter(value => value !== id);
            closedIds = [...closedIds.filter(value => value !== id), id].slice(-20);
            saveTabs(); close(); renderTabs(); renderList(); renderSaveState();
            if (call(source, 'getProjectRunStatus', null, id)?.active) call(source, 'showToast', null, tr('Tab closed. Its tasks continue in the background.'));
            return true;
        }

        async function closeOtherTabs(id, rightOnly = false) {
            if (busy || !openIds.includes(id)) return false;
            const targets = rightOnly ? openIds.slice(openIds.indexOf(id) + 1) : openIds.filter(value => value !== id);
            if (!targets.length) return true;
            const requestedScope = currentScope();
            if (targets.includes(currentId()) && !await select(id)) return false;
            if (requestedScope !== currentScope()) return false;
            for (const target of targets) {
                openIds = openIds.filter(value => value !== target);
                closedIds = [...closedIds.filter(value => value !== target), target].slice(-20);
            }
            saveTabs(); close(); renderTabs(); renderList();
            return true;
        }

        async function requestDeleteDraft(id, parentModal) {
            if (busy || mutatingDraft || !items.some(item => itemId(item) === id && !item.saved)) return { ok: false };
            const requestedScope = currentScope();
            const running = () => !!call(source, 'getProjectRunStatus', null, id)?.active;
            if (running()) {
                call(source, 'showToast', null, tr('This workbench has active tasks. Stop them before deleting its draft.'));
                return { ok: false, error: 'draft_has_active_tasks' };
            }
            const doc = root.ownerDocument;
            const host = parentModal || doc.createElement('div');
            if (!parentModal) {
                host.className = 'sai-canvas-modal';
                host.classList.toggle('theme-dark', root.classList.contains('theme-dark'));
                doc.body.appendChild(host);
            }
            const confirmed = await confirmProjectDelete(host, { project_id: id, draft: true }, {
                ...source, getDocument: () => doc, getCurrentProjectId: currentId
            });
            if (!parentModal) host.remove();
            if (!confirmed || requestedScope !== currentScope()) return { ok: false, canceled: true };
            if (running()) {
                call(source, 'showToast', null, tr('This workbench has active tasks. Stop them before deleting its draft.'));
                return { ok: false, error: 'draft_has_active_tasks' };
            }
            mutatingDraft = true;
            try {
                if (openIds.includes(id) && !await closeTab(id)) return { ok: false };
                const result = await call(source, 'removeBrowserDraft', null, id);
                if (requestedScope !== currentScope()) return { ok: false, canceled: true };
                if (!result?.ok) {
                    call(source, 'showToast', null, tr(result?.error === 'draft save in progress'
                        ? 'Wait for saving to finish before deleting this draft.' : 'Could not delete the browser draft.'));
                    return result || { ok: false };
                }
                call(source, 'onDraftDeleted', null, id);
                closedIds = closedIds.filter(value => value !== id);
                items = mergeItems(remoteItems);
                activeId = currentId();
                saveTabs(); sync(); renderList();
                call(source, 'showToast', null, tr('Browser draft deleted: {id}').replace('{id}', id));
                return { ok: true };
            } finally { mutatingDraft = false; }
        }

        function showTabMenu(id, x, y, invoker) {
            if (busy || !openIds.includes(id)) return;
            close();
            menuInvoker = invoker;
            const isDraft = items.some(item => itemId(item) === id && !item.saved);
            const actions = [
                ['close', 'Close tab', true], ['others', 'Close other tabs', openIds.length > 1],
                ['right', 'Close tabs to the right', openIds.indexOf(id) < openIds.length - 1],
                ['reopen', 'Reopen closed tab', !!closedIds.length],
                ...(isDraft ? [['delete-draft', 'Delete draft', true]] : [])
            ];
            tabMenu.innerHTML = actions.map(([action, label, enabled]) => `<button type="button" role="menuitem" data-project-tab-action="${action}" ${enabled ? '' : 'disabled'}>${escape(tr(label))}</button>`).join('');
            tabMenu.dataset.projectId = id;
            tabMenu.hidden = false;
            const rect = tabMenu.getBoundingClientRect();
            const view = root.ownerDocument.defaultView;
            tabMenu.style.left = `${Math.max(8, Math.min(x, view.innerWidth - rect.width - 8))}px`;
            tabMenu.style.top = `${Math.max(8, Math.min(y, view.innerHeight - rect.height - 8))}px`;
            tabMenu.querySelector('button:not(:disabled)')?.focus();
        }

        function renderTabs() {
            if (!tabs) return;
            const id = currentId();
            const signature = JSON.stringify([openIds, id, busy, home, tr('Switch workbench'), tr('Close tab')]);
            if (signature !== tabsSignature) {
                tabsSignature = signature;
                tabs.innerHTML = openIds.map(key => {
                    const selected = key === id;
                    return `<div class="sai-project-tab-item" data-project-tab-id="${escape(key)}"><button type="button" class="sai-project-tab${selected ? ' is-active' : ''}" data-project-open="${escape(key)}" role="tab" aria-selected="${selected}" tabindex="${selected ? '0' : '-1'}" title="${escape(key)}" ${busy ? 'disabled' : ''}><i class="fa-solid ${selected ? 'fa-folder-open' : 'fa-folder'}" aria-hidden="true"></i><span>${escape(key)}</span><small data-project-run-status hidden></small></button><button type="button" class="sai-project-tab-close" data-project-tab-close="${escape(key)}" title="${escape(tr('Close tab'))}" aria-label="${escape(tr('Close tab') + ': ' + key)}" ${busy ? 'disabled' : ''}><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></div>`;
                }).join('');
            }
            nav.setAttribute('aria-busy', String(busy));
            nav.querySelectorAll('[data-project-create], [data-project-toggle]').forEach(button => { button.disabled = busy; });
            if (activeId !== id) {
                activeId = id;
                tabs.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
            }
            renderRunStatus();
        }

        function renderRunStatus() {
            tabs?.querySelectorAll('[data-project-open]').forEach(button => {
                const id = button.getAttribute('data-project-open');
                const status = call(source, 'getProjectRunStatus', null, id) || {};
                const state = status.disconnected ? 'disconnected' : status.active ? 'running'
                    : status.failed ? 'failed' : status.completed ? 'finished' : '';
                const count = status.disconnected || status.active || status.failed || status.completed || 0;
                const labels = { running: 'Tasks running: {count}', disconnected: 'Task status unconfirmed: {count}',
                    failed: 'Tasks stopped or failed: {count}', finished: 'New completed tasks: {count}' };
                const description = state ? tr(labels[state]).replace('{count}', count) : '';
                const badge = button.querySelector('[data-project-run-status]');
                if (!badge) return;
                badge.hidden = !state;
                if (badge.dataset.runState !== state) badge.dataset.runState = state;
                if (badge.textContent !== String(count)) badge.textContent = String(count);
                badge.title = description;
                button.title = description ? `${id} · ${description}` : id;
                button.setAttribute('aria-label', button.title);
            });
        }

        function renderSaveState() {
            const project = getProject(source);
            const state = saveStates.get(project) || 'draft';
            const labels = { draft: 'Browser draft', pending: 'Unsaved changes', saving: 'Saving workbench...', saved: 'Saved to project file', cached: 'Saved in browser', error: 'Save failed', conflict: 'Project changed in another window' };
            const badge = nav.querySelector('[data-project-save-status]');
            badge.hidden = home;
            const text = tr(labels[state] || labels.cached);
            if (badge.dataset.saveState !== state) badge.dataset.saveState = state;
            const label = badge.querySelector('[data-project-save-label]');
            if (label.textContent !== text) label.textContent = text;
            badge.title = `${text} · ${tr('Save')}`;
            badge.setAttribute('aria-label', badge.title);
        }

        function mount(nextRoot) {
            removeOutsideListener?.();
            requestSequence += 1;
            listState = 'idle';
            tabsSignature = '';
            activeId = '';
            root = nextRoot;
            nav = root?.querySelector('[data-project-navigation]');
            if (!nav) return;
            tabs = nav.querySelector('[data-project-tabs]');
            panel = nav.querySelector('[data-project-switcher]');
            search = nav.querySelector('[data-project-search]');
            list = nav.querySelector('[data-project-switcher-list]');
            message = nav.querySelector('[data-project-message]');
            tabMenu = root.ownerDocument.createElement('div');
            tabMenu.className = 'sai-project-tab-menu';
            tabMenu.setAttribute('role', 'menu');
            tabMenu.hidden = true;
            nav.appendChild(tabMenu);
            homeElement = root.querySelector('[data-project-home]');
            if (!homeElement) {
                homeElement = root.ownerDocument.createElement('section');
                homeElement.className = 'sai-project-home';
                homeElement.setAttribute('data-project-home', '');
                homeElement.hidden = true;
                root.appendChild(homeElement);
            }
            homeElement.innerHTML = `<h2>${escape(tr('No workbench is open'))}</h2><p>${escape(tr('Open a saved project or browser draft, or create a workbench.'))}</p><div><button type="button" data-project-home-picker>${escape(tr('Open workbench'))}</button><button type="button" data-project-home-create>${escape(tr('New workbench'))}</button></div>`;
            const homeClick = evt => {
                if (evt.target.closest('[data-project-home-picker]')) nav.querySelector('[data-project-toggle]')?.click();
                if (evt.target.closest('[data-project-home-create]')) void create();
            };
            homeElement.addEventListener('click', homeClick);
            nav.addEventListener('click', evt => {
                const menuAction = evt.target.closest('[data-project-tab-action]');
                const closeButton = evt.target.closest('[data-project-tab-close]');
                if (menuAction) {
                    evt.preventDefault(); evt.stopPropagation();
                    const id = tabMenu.dataset.projectId;
                    const action = menuAction.dataset.projectTabAction;
                    dismissTabMenu();
                    if (action === 'close') void closeTab(id);
                    if (action === 'others') void closeOtherTabs(id);
                    if (action === 'right') void closeOtherTabs(id, true);
                    if (action === 'reopen' && closedIds.length) void select(closedIds.at(-1));
                    if (action === 'delete-draft') void requestDeleteDraft(id);
                } else if (closeButton) {
                    evt.preventDefault(); evt.stopPropagation();
                    void closeTab(closeButton.dataset.projectTabClose);
                } else if (evt.target.closest('[data-project-toggle]')) {
                    if (!panel.hidden) return close();
                    dismissTabMenu();
                    panel.hidden = false;
                    nav.querySelector('[data-project-toggle]').setAttribute('aria-expanded', 'true');
                    search.value = '';
                    renderList();
                    search.focus();
                    void refresh();
                } else if (evt.target.closest('[data-project-create]')) {
                    void create();
                } else if (evt.target.closest('[data-project-manage]')) {
                    close();
                    call(source, 'openManager', null);
                } else if (evt.target.closest('[data-project-export]')) {
                    call(source, 'exportDraft', null);
                } else {
                    const button = evt.target.closest('[data-project-open]');
                    if (button) void select(button.getAttribute('data-project-open'));
                }
            });
            nav.addEventListener('contextmenu', evt => {
                const tab = evt.target.closest('[data-project-tab-id]');
                if (!tab) return;
                evt.preventDefault(); evt.stopPropagation();
                showTabMenu(tab.dataset.projectTabId, evt.clientX, evt.clientY, tab.querySelector('[role="tab"]'));
            });
            nav.addEventListener('auxclick', evt => {
                const tab = evt.target.closest('[data-project-tab-id]');
                if (evt.button !== 1 || !tab) return;
                evt.preventDefault(); evt.stopPropagation();
                void closeTab(tab.dataset.projectTabId);
            });
            search.addEventListener('input', renderList);
            nav.addEventListener('keydown', evt => {
                if (evt.isComposing || evt.keyCode === 229) return;
                if (!tabMenu.hidden) {
                    const buttons = Array.from(tabMenu.querySelectorAll('button:not(:disabled)'));
                    if (evt.key === 'Escape') { evt.preventDefault(); evt.stopPropagation(); dismissTabMenu(true); return; }
                    if (['ArrowDown', 'ArrowUp'].includes(evt.key) && buttons.length) {
                        const index = buttons.indexOf(evt.target);
                        const next = evt.key === 'ArrowDown' ? (index + 1) % buttons.length : (index - 1 + buttons.length) % buttons.length;
                        evt.preventDefault(); evt.stopPropagation(); buttons[next]?.focus(); return;
                    }
                }
                const focusedTab = evt.target.closest('[role="tab"]');
                if (focusedTab && (evt.key === 'ContextMenu' || evt.key === 'F10' && evt.shiftKey)) {
                    const rect = focusedTab.getBoundingClientRect();
                    evt.preventDefault(); evt.stopPropagation();
                    showTabMenu(focusedTab.dataset.projectOpen, rect.left, rect.bottom, focusedTab); return;
                }
                if (focusedTab && evt.key === 'Delete') {
                    evt.preventDefault(); evt.stopPropagation(); void closeTab(focusedTab.dataset.projectOpen); return;
                }
                if (evt.key === 'Enter' && (evt.ctrlKey || evt.metaKey || evt.altKey)) {
                    evt.preventDefault(); evt.stopPropagation(); return;
                }
                if (evt.key === 'Escape' && !panel.hidden) {
                    evt.preventDefault(); evt.stopPropagation(); close(true); return;
                }
                if (panel.hidden && evt.target.closest('[data-project-tabs]')) {
                    const buttons = Array.from(tabs.querySelectorAll('[data-project-open]'));
                    const index = buttons.indexOf(evt.target.closest('button'));
                    let next = -1;
                    if (evt.key === 'ArrowRight') next = (index + 1) % buttons.length;
                    if (evt.key === 'ArrowLeft') next = (index - 1 + buttons.length) % buttons.length;
                    if (evt.key === 'Home') next = 0;
                    if (evt.key === 'End') next = buttons.length - 1;
                    if (next >= 0) { evt.preventDefault(); evt.stopPropagation(); buttons[next]?.focus(); }
                } else if (!panel.hidden && ['ArrowDown', 'ArrowUp', 'Enter'].includes(evt.key)) {
                    const buttons = Array.from(list.querySelectorAll('button:not(:disabled)'));
                    if (evt.target === search && evt.key === 'Enter') {
                        evt.preventDefault(); evt.stopPropagation(); buttons[0]?.click();
                    } else if (evt.key !== 'Enter' && buttons.length) {
                        const index = buttons.indexOf(evt.target);
                        const next = evt.key === 'ArrowDown' ? (index + 1) % buttons.length : (index < 0 ? buttons.length - 1 : (index - 1 + buttons.length) % buttons.length);
                        evt.preventDefault(); evt.stopPropagation(); buttons[next]?.focus();
                    }
                }
            });
            const doc = root.ownerDocument;
            const outside = evt => { if (!nav.contains(evt.target)) { close(); dismissTabMenu(); } };
            doc.addEventListener('pointerdown', outside, true);
            removeOutsideListener = () => { doc.removeEventListener('pointerdown', outside, true); homeElement?.removeEventListener('click', homeClick); tabMenu?.remove(); };
            nav.addEventListener('focusout', evt => { if (evt.relatedTarget && !nav.contains(evt.relatedTarget)) close(); });
        }

        function sync() {
            const nextRoot = call(source, 'getRoot', null);
            if (!nextRoot) return;
            if (nextRoot !== root) mount(nextRoot);
            if (!nav) return;
            const nextScope = currentScope();
            if (scopeKey !== nextScope) {
                if (scopeKey !== null) root.ownerDocument.querySelectorAll('.sai-project-manager').forEach(manager => manager.closest('.sai-canvas-modal')?.remove());
                scopeKey = nextScope;
                requestSequence += 1;
                items = [];
                remoteItems = [];
                lastResponse = null;
                pendingList = null;
                tabOperationSequence += 1;
                busy = false;
                pendingProjectId = '';
                listState = 'idle';
                tabsSignature = '';
                activeId = '';
                close();
                loadTabs();
            }
            if (activeId !== currentId() || !items.length) {
                if (activeId !== currentId() && !busy && !mutatingDraft && (!home || activeId)) addTab(currentId());
                items = mergeItems(remoteItems);
            }
            renderTabs();
            renderSaveState();
            if (listState === 'idle') void refresh();
        }

        function setSaveState(project, state) {
            if (!project || typeof project !== 'object') return;
            saveStates.set(project, state);
            if (project === getProject(source) && nav) renderSaveState();
        }

        return { sync, refresh, close, select, setSaveState, closeTab, closeOtherTabs, requestDeleteDraft,
            isProjectOpen: id => !home && openIds.includes(id) || busy && pendingProjectId === id,
            getOpenProjectIds: () => openIds.slice(),
            listProjects: async () => { sync(); return await refresh() || { ...lastResponse, ok: false, projects: [] }; }
        };
    }

    window.SimpAICanvasWorkbenchProjectManager = {
        createProjectManagerContext,
        createProjectNavigationController,
        mergeProjectEntries,
        openPanel
    };
})();
