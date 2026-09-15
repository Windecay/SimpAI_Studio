(function () {
    'use strict';

    function createCanvasWildcardsV2Controller(context) {
        const scope = context?.wildcardsV2Source || context || {};
        const domSource = scope.domSource || {};
        const languageSource = scope.languageSource || {};
        const utilitySource = scope.utilitySource || {};
        const configSource = scope.configSource || {};
        const nodeSource = scope.nodeSource || {};
        const catalogSource = scope.catalogSource || {};
        const apiSource = scope.apiSource || {};
        const mutationSource = scope.mutationSource || {};
        const viewportSource = scope.viewportSource || {};
        const uiSource = scope.uiSource || {};
        const userSource = scope.userSource || {};
        const formSource = scope.formSource || {};
        const timingSource = scope.timingSource || {};

        const getDocument = () => typeof domSource.getDocument === 'function'
            ? domSource.getDocument()
            : null;
        const getOverlayHost = () => {
            if (typeof domSource.getOverlayHost === 'function') {
                const host = domSource.getOverlayHost();
                if (host) return host;
            }
            const root = typeof domSource.getRoot === 'function' ? domSource.getRoot() : null;
            return root || getDocument()?.body || null;
        };
        const t = typeof languageSource.t === 'function' ? languageSource.t : (en, cn) => cn || en;
        const escapeHtml = typeof utilitySource.escapeHtml === 'function'
            ? utilitySource.escapeHtml
            : (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            }[char] || char));
        const detectTheme = typeof utilitySource.detectTheme === 'function'
            ? utilitySource.detectTheme
            : () => 'light';
        const getNode = (id) => typeof nodeSource.getNode === 'function'
            ? nodeSource.getNode(id)
            : null;
        const isNodeLocked = (node) => typeof nodeSource.isNodeLocked === 'function'
            ? !!nodeSource.isNodeLocked(node)
            : false;
        const buildWildcardsHelperStatePatch = (...args) => typeof nodeSource.buildWildcardsHelperStatePatch === 'function'
            ? nodeSource.buildWildcardsHelperStatePatch(...args)
            : {};
        const wildcardHelperBuildTag = (...args) => typeof nodeSource.wildcardHelperBuildTag === 'function'
            ? nodeSource.wildcardHelperBuildTag(...args)
            : '';
        const refreshWildcardsCatalog = (...args) => typeof catalogSource.refreshWildcardsCatalog === 'function'
            ? catalogSource.refreshWildcardsCatalog(...args)
            : null;
        const updateWildcardsHelperParam = (...args) => typeof mutationSource.updateWildcardsHelperParam === 'function'
            ? mutationSource.updateWildcardsHelperParam(...args)
            : undefined;
        const appendWildcardTagToNodeParam = (...args) => typeof mutationSource.appendWildcardTagToNodeParam === 'function'
            ? mutationSource.appendWildcardTagToNodeParam(...args)
            : undefined;
        const addWildcardsHelperNode = (...args) => typeof mutationSource.addWildcardsHelperNode === 'function'
            ? mutationSource.addWildcardsHelperNode(...args)
            : undefined;
        const viewportCenterWorld = (...args) => typeof viewportSource.viewportCenterWorld === 'function'
            ? viewportSource.viewportCenterWorld(...args)
            : { x: 0, y: 0 };
        const closeContextMenu = (...args) => typeof uiSource.closeContextMenu === 'function'
            ? uiSource.closeContextMenu(...args)
            : undefined;
        const getWorkbenchUserContext = (...args) => typeof userSource.getWorkbenchUserContext === 'function'
            ? userSource.getWorkbenchUserContext(...args)
            : undefined;
        const personalWildcardsAvailable = () => typeof apiSource.isPersonalWildcardsAvailable === 'function'
            ? !!apiSource.isPersonalWildcardsAvailable()
            : typeof apiSource.personalWildcards === 'function';
        const personalWildcards = (...args) => typeof apiSource.personalWildcards === 'function'
            ? apiSource.personalWildcards(...args)
            : null;
        const ensureFormNames = (...args) => typeof formSource.ensureFormNames === 'function'
            ? formSource.ensureFormNames(...args)
            : undefined;
        const schedule = (callback, delay) => typeof timingSource.setTimeout === 'function'
            ? timingSource.setTimeout(callback, delay)
            : undefined;
        const helperTargets = () => typeof configSource.getTargets === 'function' ? configSource.getTargets() : [];
        const helperMethods = () => typeof configSource.getMethods === 'function' ? configSource.getMethods() : [];
        const helperSeedModes = () => typeof configSource.getSeedModes === 'function' ? configSource.getSeedModes() : [];

        let wildcardsV2State = null;

        function closeWildcardsV2Panel() {
            wildcardsV2State?.modal?.remove();
            wildcardsV2State = null;
        }

        function wildcardsV2NamesFromCatalog(catalog) {
            return Array.from(new Set((Array.isArray(catalog?.flat_names) ? catalog.flat_names : []).map(item => String(item || '').trim()).filter(Boolean)));
        }

        function wildcardsV2FilteredNames(state) {
            const query = String(state?.query || '').trim().toLowerCase();
            const names = Array.isArray(state?.names) ? state.names : [];
            if (!query) return names;
            const tokens = query.split(/\s+/).filter(Boolean);
            return names.filter(name => {
                const lower = String(name || '').toLowerCase();
                return tokens.every(token => lower.includes(token));
            });
        }

        function wildcardsV2HelperParams(state) {
            const helper = state?.helper || {};
            return {
                target: helper.target || 'Single in prompt',
                method: helper.method || 'Random Select',
                seed_mode: helper.seed_mode || 'Fixed seed',
                name: String(helper.name || '').trim(),
                count: Math.max(1, Math.floor(Number(helper.count || 1))),
                start: Math.max(1, Math.floor(Number(helper.start || 1))),
                group_size: Math.max(1, Math.floor(Number(helper.group_size || 1)))
            };
        }

        function wildcardsV2BuiltTag(state) {
            const params = wildcardsV2HelperParams(state);
            return params.name ? wildcardHelperBuildTag(params) : '';
        }

        function wildcardsV2CanInsert(state) {
            const node = getNode(state?.nodeId || '');
            return !!(node && ['preset', 'classic'].includes(node.type) && !isNodeLocked(node));
        }

        function wildcardsV2CanApplyHelper(state) {
            const node = getNode(state?.nodeId || '');
            return !!(node && node.type === 'wildcards_helper' && !isNodeLocked(node));
        }

        function wildcardsV2SetStatus(modal, message, tone) {
            const state = modal?.__wildcardsV2State || wildcardsV2State;
            if (state) {
                state.status = String(message || '');
                state.statusTone = tone || '';
            }
            const el = modal?.querySelector?.('[data-wildcards-v2-status]');
            if (el) {
                el.textContent = String(message || '');
                el.dataset.tone = tone || '';
            }
        }

        function renderWildcardsV2List(modal) {
            const state = modal?.__wildcardsV2State;
            const host = modal?.querySelector?.('[data-wildcards-v2-list]');
            const meta = modal?.querySelector?.('[data-wildcards-v2-meta]');
            if (!state || !host) return;
            const filtered = wildcardsV2FilteredNames(state);
            const visible = filtered.slice(0, 320);
            const canInsert = wildcardsV2CanInsert(state);
            const canApplyHelper = wildcardsV2CanApplyHelper(state);
            const rowActionTitle = canApplyHelper ? t('Use in helper node', '用于当前 Helper 节点') : t('Insert wildcard', '插入通配符');
            const rowActionIcon = canApplyHelper ? 'fa-check' : 'fa-arrow-right-to-bracket';
            if (meta) {
                meta.textContent = t('{shown} shown / {total} total', '显示 {shown} / 总计 {total}')
                    .replace('{shown}', String(visible.length))
                    .replace('{total}', String(state.names.length));
            }
            host.innerHTML = visible.length ? visible.map(name => {
                const active = name === state.helper.name ? ' is-active' : '';
                return `<div class="sai-wildcards-v2-row${active}" data-wildcards-v2-name="${escapeHtml(name)}">
  <button type="button" class="sai-wildcards-v2-name" data-wildcards-v2-action="select-name" title="${escapeHtml(name)}"><i class="fa-solid fa-dice"></i><span>${escapeHtml(name)}</span></button>
  <button type="button" data-wildcards-v2-action="insert-name" ${canInsert || canApplyHelper ? '' : 'disabled'} title="${escapeHtml(rowActionTitle)}"><i class="fa-solid ${rowActionIcon}"></i></button>
</div>`;
            }).join('') : `<div class="sai-wildcards-v2-empty">${escapeHtml(t('No wildcard matched. Try a shorter search.', '没有匹配的通配符，试试缩短搜索。'))}</div>`;
        }

        function renderWildcardsV2Expression(modal) {
            const state = modal?.__wildcardsV2State;
            const host = modal?.querySelector?.('[data-wildcards-v2-expression]');
            if (!state || !host) return;
            const helper = wildcardsV2HelperParams(state);
            const builtTag = wildcardsV2BuiltTag(state);
            const canInsert = wildcardsV2CanInsert(state);
            const optionHtml = (items, value) => items.map(item => `<option value="${escapeHtml(item)}" ${item === value ? 'selected' : ''}>${escapeHtml(item)}</option>`).join('');
            host.innerHTML = `
<div class="sai-wildcards-v2-card">
  <h4><i class="fa-solid fa-wand-magic-sparkles"></i><span>${escapeHtml(t('Expression Builder', '表达式构建器'))}</span></h4>
  <label><span>${escapeHtml(t('Wildcard name', '通配符名称'))}</span><input data-wildcards-v2-helper="name" value="${escapeHtml(helper.name)}" placeholder="color / style / character"></label>
  <div class="sai-wildcards-v2-grid">
    <label><span>${escapeHtml(t('Target', '目标'))}</span><select data-wildcards-v2-helper="target">${optionHtml(helperTargets(), helper.target)}</select></label>
    <label><span>${escapeHtml(t('Method', '方法'))}</span><select data-wildcards-v2-helper="method">${optionHtml(helperMethods(), helper.method)}</select></label>
    <label><span>${escapeHtml(t('Seed', '种子'))}</span><select data-wildcards-v2-helper="seed_mode">${optionHtml(helperSeedModes(), helper.seed_mode)}</select></label>
  </div>
  <div class="sai-wildcards-v2-grid">
    <label><span>${escapeHtml(t('Count', '数量'))}</span><input data-wildcards-v2-helper="count" type="number" min="1" step="1" value="${escapeHtml(helper.count)}"></label>
    <label><span>${escapeHtml(t('Start', '起始'))}</span><input data-wildcards-v2-helper="start" type="number" min="1" step="1" value="${escapeHtml(helper.start)}"></label>
    <label><span>${escapeHtml(t('Group', '组'))}</span><input data-wildcards-v2-helper="group_size" type="number" min="1" step="1" value="${escapeHtml(helper.group_size)}"></label>
  </div>
  <label><span>${escapeHtml(t('Built expression', '生成表达式'))}</span><input data-wildcards-v2-built readonly value="${escapeHtml(builtTag)}" placeholder="__name__"></label>
  <div class="sai-wildcards-v2-actions">
    <button type="button" data-wildcards-v2-action="insert-selected" ${canInsert && helper.name ? '' : 'disabled'}><i class="fa-solid fa-dice"></i><span>${escapeHtml(t('Insert __name__', '插入 __name__'))}</span></button>
    <button type="button" data-wildcards-v2-action="insert-built" ${canInsert && builtTag ? '' : 'disabled'}><i class="fa-solid fa-arrow-right-to-bracket"></i><span>${escapeHtml(t('Insert expression', '插入表达式'))}</span></button>
    <button type="button" data-wildcards-v2-action="create-helper" ${helper.name ? '' : 'disabled'}><i class="fa-solid fa-plus"></i><span>${escapeHtml(t('Create Helper Node', '创建 Helper 节点'))}</span></button>
  </div>
</div>
<div class="sai-wildcards-v2-card">
  <h4><i class="fa-solid fa-keyboard"></i><span>${escapeHtml(t('Raw Expression', '手写表达式'))}</span></h4>
  <textarea data-wildcards-v2-raw rows="3" placeholder="__color__:L3:4 or [__color__:3]">${escapeHtml(state.rawExpression || '')}</textarea>
  <div class="sai-wildcards-v2-actions">
    <button type="button" data-wildcards-v2-action="insert-raw" ${canInsert && String(state.rawExpression || '').trim() ? '' : 'disabled'}><i class="fa-solid fa-arrow-right-to-bracket"></i><span>${escapeHtml(t('Insert Raw', '插入手写'))}</span></button>
  </div>
</div>`;
        }

        function renderWildcardsV2Personal(modal) {
            const state = modal?.__wildcardsV2State;
            const host = modal?.querySelector?.('[data-wildcards-v2-personal]');
            if (!state || !host) return;
            const personal = state.personal || {};
            if (!personal.available) {
                host.innerHTML = `<div class="sai-wildcards-v2-card"><p class="sai-wildcards-v2-empty">${escapeHtml(t('Personal wildcards API unavailable.', '个人通配符 API 不可用。'))}</p></div>`;
                return;
            }
            if (!personal.canManage) {
                host.innerHTML = `<div class="sai-wildcards-v2-card"><p class="sai-wildcards-v2-empty">${escapeHtml(personal.error || t('Personal wildcards are read-only for this user.', '当前用户只能读取公共通配符。'))}</p></div>`;
                return;
            }
            const keys = Array.isArray(personal.keys) ? personal.keys : [];
            const options = [''].concat(keys).map(key => `<option value="${escapeHtml(key)}" ${key === personal.name ? 'selected' : ''}>${escapeHtml(key || t('New wildcard...', '新建通配符...'))}</option>`).join('');
            host.innerHTML = `<div class="sai-wildcards-v2-card">
  <h4><i class="fa-solid fa-folder-tree"></i><span>${escapeHtml(t('Personal Wildcards', '个人通配符'))}</span></h4>
  <div class="sai-wildcards-v2-grid is-two">
    <label><span>${escapeHtml(t('Existing', '已有'))}</span><select data-wildcards-v2-personal-select>${options}</select></label>
    <label><span>${escapeHtml(t('Name', '名称'))}</span><input data-wildcards-v2-personal-name value="${escapeHtml(personal.name || '')}" placeholder="my_styles"></label>
  </div>
  <label><span>${escapeHtml(t('Entries', '条目'))}</span><textarea data-wildcards-v2-personal-content rows="11" placeholder="${escapeHtml(t('One entry per line', '每行一个条目'))}">${escapeHtml(personal.content || '')}</textarea></label>
  <div class="sai-wildcards-v2-actions">
    <button type="button" data-wildcards-v2-action="personal-load" ${personal.name ? '' : 'disabled'}><i class="fa-solid fa-folder-open"></i><span>${escapeHtml(t('Load', '载入'))}</span></button>
    <button type="button" data-wildcards-v2-action="personal-save" ${personal.name ? '' : 'disabled'}><i class="fa-solid fa-floppy-disk"></i><span>${escapeHtml(t('Save', '保存'))}</span></button>
    <button type="button" class="is-danger" data-wildcards-v2-action="personal-delete" ${personal.name ? '' : 'disabled'}><i class="fa-solid fa-trash"></i><span>${escapeHtml(personal.deleteArmed ? t('Click Again', '再点删除') : t('Delete', '删除'))}</span></button>
    <button type="button" data-wildcards-v2-action="personal-refresh"><i class="fa-solid fa-arrows-rotate"></i><span>${escapeHtml(t('Refresh', '刷新'))}</span></button>
  </div>
</div>`;
        }

        function refreshWildcardsV2ExpressionControls(modal) {
            const state = modal?.__wildcardsV2State;
            if (!state) return;
            const helper = wildcardsV2HelperParams(state);
            const builtTag = wildcardsV2BuiltTag(state);
            const canInsert = wildcardsV2CanInsert(state);
            const built = modal.querySelector('[data-wildcards-v2-built]');
            if (built) built.value = builtTag;
            const selectedButton = modal.querySelector('[data-wildcards-v2-action="insert-selected"]');
            const builtButton = modal.querySelector('[data-wildcards-v2-action="insert-built"]');
            const rawButton = modal.querySelector('[data-wildcards-v2-action="insert-raw"]');
            const helperButton = modal.querySelector('[data-wildcards-v2-action="create-helper"]');
            if (selectedButton) selectedButton.disabled = !(canInsert && helper.name);
            if (builtButton) builtButton.disabled = !(canInsert && builtTag);
            if (rawButton) rawButton.disabled = !(canInsert && String(state.rawExpression || '').trim());
            if (helperButton) helperButton.disabled = !helper.name;
        }

        function refreshWildcardsV2PersonalControls(modal) {
            const personal = modal?.__wildcardsV2State?.personal || {};
            const hasName = !!String(personal.name || '').trim();
            modal?.querySelectorAll?.('[data-wildcards-v2-action="personal-load"],[data-wildcards-v2-action="personal-save"],[data-wildcards-v2-action="personal-delete"]').forEach(button => {
                button.disabled = !hasName;
            });
        }

        function renderWildcardsV2Detail(modal) {
            const state = modal?.__wildcardsV2State;
            if (!state) return;
            modal.querySelectorAll('[data-wildcards-v2-tab]').forEach(button => {
                button.classList.toggle('is-active', button.getAttribute('data-wildcards-v2-tab') === state.tab);
            });
            const expression = modal.querySelector('[data-wildcards-v2-expression]');
            const personal = modal.querySelector('[data-wildcards-v2-personal]');
            if (expression) expression.hidden = state.tab !== 'insert';
            if (personal) personal.hidden = state.tab !== 'manager';
            renderWildcardsV2Expression(modal);
            renderWildcardsV2Personal(modal);
        }

        function renderWildcardsV2Panel(modal) {
            const state = modal.__wildcardsV2State;
            const canInsert = wildcardsV2CanInsert(state);
            modal.innerHTML = `
<div class="sai-canvas-modal-panel sai-wildcards-v2-panel">
  <div class="sai-canvas-modal-head sai-wildcards-v2-head">
    <div><i class="fa-solid fa-dice"></i><span>Wildcard v2</span><small>${escapeHtml(canInsert ? t('Insert into prompt', '插入到提示词') : t('Browse and manage', '浏览与管理'))}</small></div>
    <button type="button" data-wildcards-v2-action="close" title="${escapeHtml(t('Close', '关闭'))}"><i class="fa-solid fa-xmark"></i></button>
  </div>
  <div class="sai-wildcards-v2-body">
    <section class="sai-wildcards-v2-list-pane">
      <div class="sai-wildcards-v2-search">
        <i class="fa-solid fa-magnifying-glass"></i>
        <input data-wildcards-v2-query value="${escapeHtml(state.query || '')}" placeholder="${escapeHtml(t('Search wildcard names...', '搜索通配符名称...'))}">
        <button type="button" data-wildcards-v2-action="refresh-catalog" title="${escapeHtml(t('Refresh catalog', '刷新目录'))}"><i class="fa-solid fa-arrows-rotate"></i></button>
      </div>
      <div class="sai-wildcards-v2-meta" data-wildcards-v2-meta></div>
      <div class="sai-wildcards-v2-list" data-wildcards-v2-list></div>
    </section>
    <section class="sai-wildcards-v2-detail-pane">
      <div class="sai-wildcards-v2-tabs">
        <button type="button" data-wildcards-v2-tab="insert"><i class="fa-solid fa-arrow-right-to-bracket"></i><span>${escapeHtml(t('Insert', '插入'))}</span></button>
        <button type="button" data-wildcards-v2-tab="manager"><i class="fa-solid fa-folder-tree"></i><span>${escapeHtml(t('Manager', '管理'))}</span></button>
      </div>
      <div data-wildcards-v2-expression></div>
      <div data-wildcards-v2-personal></div>
    </section>
  </div>
  <div class="sai-wildcards-v2-foot"><span data-wildcards-v2-status data-tone="${escapeHtml(state.statusTone || '')}">${escapeHtml(state.status || '')}</span></div>
</div>`;
            renderWildcardsV2List(modal);
            renderWildcardsV2Detail(modal);
            ensureFormNames(modal, 'wildcards_v2');
        }

        async function refreshWildcardsV2Catalog(modal) {
            const state = modal?.__wildcardsV2State;
            if (!state) return null;
            wildcardsV2SetStatus(modal, t('Refreshing wildcard catalog...', '正在刷新通配符目录...'), '');
            const node = getNode(state.nodeId || '');
            const probe = {
                id: `${state.nodeId || 'wildcards_v2'}:wildcards_v2_catalog`,
                type: 'wildcards_helper',
                params: {},
                wildcards_catalog: state.catalog || node?.wildcards_catalog || null
            };
            const catalog = await refreshWildcardsCatalog(probe, { force: true, render: false });
            if (!catalog) {
                wildcardsV2SetStatus(modal, t('Catalog refresh failed.', '目录刷新失败。'), 'error');
                return null;
            }
            state.catalog = catalog;
            state.names = wildcardsV2NamesFromCatalog(catalog);
            if (node) Object.assign(node, buildWildcardsHelperStatePatch(node, { wildcardsCatalog: catalog }));
            if (!state.helper.name && state.names.length) state.helper.name = state.names[0];
            renderWildcardsV2List(modal);
            renderWildcardsV2Detail(modal);
            wildcardsV2SetStatus(modal, t('Catalog refreshed.', '目录已刷新。'), 'ok');
            return catalog;
        }

        async function refreshWildcardsV2PersonalList(modal) {
            const state = modal?.__wildcardsV2State;
            if (!state || !personalWildcardsAvailable()) return;
            const result = await personalWildcards({ action: 'list', user_context: getWorkbenchUserContext() });
            state.personal = Object.assign({}, state.personal || {}, {
                available: true,
                canManage: !!result?.can_manage,
                keys: Array.isArray(result?.keys) ? result.keys : [],
                error: result?.error || ''
            });
            if (!state.personal.name) state.personal.name = result?.selected || state.personal.keys[0] || '';
        }

        async function loadWildcardsV2Personal(modal, name) {
            const state = modal?.__wildcardsV2State;
            const personal = state?.personal || {};
            const safeName = String(name || personal.name || '').trim();
            if (!state || !safeName || !personalWildcardsAvailable()) return;
            wildcardsV2SetStatus(modal, t('Loading personal wildcard...', '正在载入个人通配符...'), '');
            const loaded = await personalWildcards({ action: 'load', name: safeName, user_context: getWorkbenchUserContext() });
            if (!loaded?.ok) {
                wildcardsV2SetStatus(modal, loaded?.error || t('Load failed.', '载入失败。'), 'error');
                return;
            }
            state.personal.name = safeName;
            state.personal.content = loaded.content || '';
            state.personal.deleteArmed = false;
            renderWildcardsV2Detail(modal);
            wildcardsV2SetStatus(modal, t('Loaded.', '已载入。'), 'ok');
        }

        async function saveWildcardsV2Personal(modal) {
            const state = modal?.__wildcardsV2State;
            const personal = state?.personal || {};
            const name = String(personal.name || '').trim();
            if (!state || !name || !personalWildcardsAvailable()) return;
            wildcardsV2SetStatus(modal, t('Saving personal wildcard...', '正在保存个人通配符...'), '');
            const saved = await personalWildcards({ action: 'save', name, content: personal.content || '', user_context: getWorkbenchUserContext() });
            if (!saved?.ok) {
                wildcardsV2SetStatus(modal, saved?.error || t('Save failed.', '保存失败。'), 'error');
                return;
            }
            await refreshWildcardsV2PersonalList(modal);
            await refreshWildcardsV2Catalog(modal);
            renderWildcardsV2Detail(modal);
            wildcardsV2SetStatus(modal, saved.message || t('Saved.', '已保存。'), 'ok');
        }

        async function deleteWildcardsV2Personal(modal) {
            const state = modal?.__wildcardsV2State;
            const personal = state?.personal || {};
            const name = String(personal.name || '').trim();
            if (!state || !name || !personalWildcardsAvailable()) return;
            if (!personal.deleteArmed) {
                personal.deleteArmed = true;
                renderWildcardsV2Detail(modal);
                wildcardsV2SetStatus(modal, t('Click Delete again to confirm.', '再次点击删除确认。'), 'warn');
                return;
            }
            wildcardsV2SetStatus(modal, t('Deleting personal wildcard...', '正在删除个人通配符...'), '');
            const deleted = await personalWildcards({ action: 'delete', name, user_context: getWorkbenchUserContext() });
            if (!deleted?.ok) {
                wildcardsV2SetStatus(modal, deleted?.error || t('Delete failed.', '删除失败。'), 'error');
                return;
            }
            personal.name = '';
            personal.content = '';
            personal.deleteArmed = false;
            await refreshWildcardsV2PersonalList(modal);
            await refreshWildcardsV2Catalog(modal);
            renderWildcardsV2Detail(modal);
            wildcardsV2SetStatus(modal, deleted.message || t('Deleted.', '已删除。'), 'ok');
        }

        function insertWildcardsV2Text(modal, text) {
            const state = modal?.__wildcardsV2State;
            const node = getNode(state?.nodeId || '');
            const value = String(text || '').trim();
            if (!state || !node || !['preset', 'classic'].includes(node.type)) {
                wildcardsV2SetStatus(modal, t('No prompt target is available.', '没有可插入的提示词目标。'), 'warn');
                return false;
            }
            if (!value) {
                wildcardsV2SetStatus(modal, t('Nothing to insert.', '没有可插入内容。'), 'warn');
                return false;
            }
            appendWildcardTagToNodeParam(node, state.slot || 'prompt', value);
            wildcardsV2SetStatus(modal, t('Inserted: {text}', '已插入：{text}').replace('{text}', value), 'ok');
            return true;
        }

        function applyWildcardsV2NameToHelper(modal, name) {
            const state = modal?.__wildcardsV2State;
            const node = getNode(state?.nodeId || '');
            const value = String(name || '').trim();
            if (!state || !node || node.type !== 'wildcards_helper' || !value || isNodeLocked(node)) return false;
            updateWildcardsHelperParam(node.id, 'name', value, 'text');
            state.helper.name = value;
            renderWildcardsV2List(modal);
            renderWildcardsV2Detail(modal);
            wildcardsV2SetStatus(modal, t('Applied to helper: {name}', '已用于 Helper：{name}').replace('{name}', value), 'ok');
            return true;
        }

        function bindWildcardsV2Panel(modal) {
            modal.addEventListener('click', async (evt) => {
                if (evt.target === modal) {
                    evt.preventDefault();
                    closeWildcardsV2Panel();
                    return;
                }
                const row = evt.target.closest('[data-wildcards-v2-name]');
                const action = evt.target.closest('[data-wildcards-v2-action]')?.getAttribute('data-wildcards-v2-action') || '';
                const tab = evt.target.closest('[data-wildcards-v2-tab]')?.getAttribute('data-wildcards-v2-tab') || '';
                const state = modal.__wildcardsV2State;
                if (tab) {
                    evt.preventDefault();
                    state.tab = tab;
                    renderWildcardsV2Detail(modal);
                    return;
                }
                if (!action) return;
                evt.preventDefault();
                if (action === 'close') closeWildcardsV2Panel();
                else if (action === 'refresh-catalog') await refreshWildcardsV2Catalog(modal);
                else if (action === 'select-name' && row) {
                    state.helper.name = row.getAttribute('data-wildcards-v2-name') || '';
                    renderWildcardsV2List(modal);
                    renderWildcardsV2Detail(modal);
                } else if (action === 'insert-name' && row) {
                    const name = row.getAttribute('data-wildcards-v2-name') || '';
                    if (!applyWildcardsV2NameToHelper(modal, name)) insertWildcardsV2Text(modal, name ? `__${name}__` : '');
                } else if (action === 'insert-selected') {
                    const name = wildcardsV2HelperParams(state).name;
                    insertWildcardsV2Text(modal, name ? `__${name}__` : '');
                } else if (action === 'insert-built') {
                    insertWildcardsV2Text(modal, wildcardsV2BuiltTag(state));
                } else if (action === 'insert-raw') {
                    insertWildcardsV2Text(modal, state.rawExpression || '');
                } else if (action === 'create-helper') {
                    const source = getNode(state.nodeId || '');
                    const center = viewportCenterWorld();
                    const world = source ? { x: (source.x || 0) - 380, y: source.y || 0 } : center;
                    addWildcardsHelperNode(world, { params: wildcardsV2HelperParams(state) });
                    wildcardsV2SetStatus(modal, t('Helper node created.', '已创建 Helper 节点。'), 'ok');
                } else if (action === 'personal-load') {
                    await loadWildcardsV2Personal(modal, state.personal.name);
                } else if (action === 'personal-save') {
                    await saveWildcardsV2Personal(modal);
                } else if (action === 'personal-delete') {
                    await deleteWildcardsV2Personal(modal);
                } else if (action === 'personal-refresh') {
                    await refreshWildcardsV2PersonalList(modal);
                    renderWildcardsV2Detail(modal);
                    wildcardsV2SetStatus(modal, t('Personal wildcard list refreshed.', '个人通配符列表已刷新。'), 'ok');
                }
            });
            modal.addEventListener('input', (evt) => {
                const state = modal.__wildcardsV2State;
                const query = evt.target.closest('[data-wildcards-v2-query]');
                const helper = evt.target.closest('[data-wildcards-v2-helper]');
                const raw = evt.target.closest('[data-wildcards-v2-raw]');
                const personalName = evt.target.closest('[data-wildcards-v2-personal-name]');
                const personalContent = evt.target.closest('[data-wildcards-v2-personal-content]');
                if (query) {
                    state.query = query.value || '';
                    renderWildcardsV2List(modal);
                } else if (helper) {
                    state.helper[helper.getAttribute('data-wildcards-v2-helper')] = helper.value;
                    renderWildcardsV2List(modal);
                    refreshWildcardsV2ExpressionControls(modal);
                } else if (raw) {
                    state.rawExpression = raw.value || '';
                    refreshWildcardsV2ExpressionControls(modal);
                } else if (personalName) {
                    state.personal.name = personalName.value || '';
                    state.personal.deleteArmed = false;
                    refreshWildcardsV2PersonalControls(modal);
                } else if (personalContent) {
                    state.personal.content = personalContent.value || '';
                    state.personal.deleteArmed = false;
                }
            });
            modal.addEventListener('change', async (evt) => {
                const state = modal.__wildcardsV2State;
                const helper = evt.target.closest('[data-wildcards-v2-helper]');
                const personalSelect = evt.target.closest('[data-wildcards-v2-personal-select]');
                if (helper) {
                    state.helper[helper.getAttribute('data-wildcards-v2-helper')] = helper.value;
                    renderWildcardsV2Expression(modal);
                } else if (personalSelect) {
                    state.personal.name = personalSelect.value || '';
                    state.personal.deleteArmed = false;
                    if (state.personal.name) await loadWildcardsV2Personal(modal, state.personal.name);
                    else {
                        state.personal.content = '';
                        renderWildcardsV2Personal(modal);
                    }
                }
            });
            modal.addEventListener('keydown', (evt) => {
                evt.stopPropagation();
                if (evt.key === 'Escape') {
                    evt.preventDefault();
                    closeWildcardsV2Panel();
                }
            }, true);
        }

        function focusWildcardsV2Query(modal) {
            schedule(() => modal?.querySelector?.('[data-wildcards-v2-query]')?.focus(), 0);
        }

        async function openWildcardsV2Panel(node, slot, options) {
            const opts = options || {};
            closeContextMenu();
            closeWildcardsV2Panel();
            const doc = getDocument();
            if (!doc?.createElement) return;
            const modal = doc.createElement('div');
            modal.className = `sai-canvas-modal sai-wildcards-v2-modal ${detectTheme() === 'dark' ? 'theme-dark' : ''}`;
            const probe = { id: `${node?.id || 'wildcards_v2'}:wildcards_v2_open`, type: 'wildcards_helper', params: {}, wildcards_catalog: node?.wildcards_catalog || null };
            const catalog = await refreshWildcardsCatalog(probe, { force: !probe.wildcards_catalog, render: false });
            if (node && catalog) Object.assign(node, buildWildcardsHelperStatePatch(node, { wildcardsCatalog: catalog }));
            const names = wildcardsV2NamesFromCatalog(catalog);
            const personal = { available: personalWildcardsAvailable(), canManage: false, keys: [], name: '', content: '', deleteArmed: false };
            modal.__wildcardsV2State = {
                modal,
                nodeId: node?.id || '',
                slot: slot || 'prompt',
                catalog,
                names,
                query: '',
                tab: opts.tab || 'insert',
                rawExpression: '',
                helper: {
                    target: 'Single in prompt',
                    method: 'Random Select',
                    seed_mode: 'Fixed seed',
                    name: opts.name || names[0] || '',
                    count: 1,
                    start: 1,
                    group_size: 1
                },
                personal,
                status: names.length ? t('Ready.', '就绪。') : t('No wildcard catalog loaded.', '未载入通配符目录。'),
                statusTone: names.length ? 'ok' : 'warn'
            };
            wildcardsV2State = modal.__wildcardsV2State;
            const host = getOverlayHost();
            if (!host?.appendChild) return;
            host.appendChild(modal);
            if (personal.available) {
                await refreshWildcardsV2PersonalList(modal);
                if (opts.tab === 'manager' && modal.__wildcardsV2State.personal.name) {
                    await loadWildcardsV2Personal(modal, modal.__wildcardsV2State.personal.name);
                }
            }
            renderWildcardsV2Panel(modal);
            bindWildcardsV2Panel(modal);
            focusWildcardsV2Query(modal);
        }

        async function openWildcardsInsertMenu(node, slot, anchor) {
            if (!node || !['preset', 'classic'].includes(node.type)) return;
            await openWildcardsV2Panel(node, slot || 'prompt', { tab: 'insert', anchor });
        }

        function promptAndAppendWildcardTag(node, slot) {
            openWildcardsV2Panel(node, slot || 'prompt', { tab: 'insert' });
        }

        async function openWildcardsManager(node) {
            await openWildcardsV2Panel(node, 'prompt', { tab: 'manager' });
        }

        return {
            getWildcardsV2State: () => wildcardsV2State,
            closeWildcardsV2Panel,
            openWildcardsV2Panel,
            openWildcardsInsertMenu,
            promptAndAppendWildcardTag,
            openWildcardsManager,
            focusWildcardsV2Query
        };
    }

    window.SimpAICanvasWorkbenchWildcardsV2 = Object.assign(
        {},
        window.SimpAICanvasWorkbenchWildcardsV2 || {},
        { createCanvasWildcardsV2Controller }
    );
})();
