(function () {
    'use strict';

    function createCanvasTemplateLibraryController(context) {
        const scope = context || {};
        const t = scope.t || ((en, cn) => cn || en);
        const call = (name, fallback, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : fallback;
        const getTemplateMediaCategories = () => typeof scope.getTemplateMediaCategories === 'function'
            ? scope.getTemplateMediaCategories()
            : [];
        const findItem = (modal, key) => (modal?.__saiTemplateItems || []).find((candidate) => (candidate.key || candidate.id) === key || candidate.id === key);
        let templateWorkbenchCreationSequence = 0;
        let templateLibraryRefreshSequence = 0;

        function beginTemplateWorkbenchCreation() {
            templateWorkbenchCreationSequence += 1;
            return templateWorkbenchCreationSequence;
        }

        function isLatestTemplateWorkbenchCreation(token) {
            return Number(token) === templateWorkbenchCreationSequence;
        }

        function cancelTemplateWorkbenchCreation() {
            templateWorkbenchCreationSequence += 1;
        }

        function beginTemplateLibraryRefresh() {
            templateLibraryRefreshSequence += 1;
            return templateLibraryRefreshSequence;
        }

        function isLatestTemplateLibraryRefresh(token) {
            return Number(token) === templateLibraryRefreshSequence;
        }

        function cancelTemplateLibraryRefresh() {
            templateLibraryRefreshSequence += 1;
        }

        function closeTemplateLibrary() {
            cancelTemplateWorkbenchCreation();
            cancelTemplateLibraryRefresh();
            const doc = scope.document || (typeof document !== 'undefined' ? document : null);
            const existing = doc?.querySelector?.('.sai-template-library-modal');
            if (existing) existing.remove?.();
        }

        async function openTemplateLibrary() {
            closeTemplateLibrary();
            call('closeContextMenu', null);
            call('closeCanvasSettingsPanel', null);
            const items = await call('getWorkbenchTemplateLibraryItems', [], {});
            const doc = scope.document || (typeof document !== 'undefined' ? document : null);
            if (!doc?.createElement) return null;
            const modal = doc.createElement('div');
            const theme = call('detectWorkbenchTheme', '');
            modal.className = `sai-canvas-modal sai-template-library-modal ${theme === 'dark' ? 'theme-dark' : ''}`;
            modal.__saiTemplateItems = items;
            const initialCategory = items.some(item => (item.category || 'image') === 'starter')
                ? 'starter'
                : (items.some(item => item.category === 'user') ? 'user' : call('normalizeTemplateLibraryCategory', 'starter', items[0]?.category));
            modal.innerHTML = call('renderTemplateLibraryHtml', '', { category: initialCategory, query: '' }, items);
            doc.body?.appendChild?.(modal);
            bindTemplateLibraryModal(modal);
            const input = modal.querySelector?.('[data-template-search]');
            input?.focus?.({ preventScroll: true });
            return modal;
        }

        async function deleteUserWorkbenchTemplate(item, parentModal) {
            if (!item || item.source !== 'user') {
                call('showToast', null, t('Built-in templates cannot be deleted.', '内置模板不能删除。'));
                return;
            }
            const title = item.title || item.id;
            const confirmed = await call('requestCanvasConfirmDialog', false, {
                danger: true,
                icon: 'fa-trash',
                title: t('Delete user template', '删除用户模板'),
                message: title,
                detail: t('This only removes the saved template. Projects created from it are kept.', '这只会移除已保存的模板，由它创建的项目会保留。'),
                confirmLabel: t('Delete', '删除'),
                cancelLabel: t('Cancel', '取消')
            });
            if (!confirmed) return;
            const result = await call('sendCanvasTemplateDeleteRequest', null, item.id);
            if (!result?.ok) {
                call('showToast', null, t('Template delete failed: {error}', '模板删除失败：{error}')
                    .replace('{error}', result?.error || result?.details || 'unknown'));
                return;
            }
            call('showToast', null, t('Template deleted: {title}', '模板已删除：{title}').replace('{title}', title));
            await refreshTemplateLibraryAfterMutation(parentModal, { category: item.category || 'user' });
        }

        async function createWorkbenchFromTemplate(item) {
            const creationToken = beginTemplateWorkbenchCreation();
            const currentProject = call('getCurrentProject', {}, []) || {};
            const defaultProjectId = String(call('getDefaultProjectId', 'canvas', []) || 'canvas');
            const previousProjectId = currentProject.id || defaultProjectId;
            const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
            const rawDefaultId = `${item?.id || 'template'}_${timestamp}`;
            const defaultId = String(call('sanitizeStoragePart', rawDefaultId, rawDefaultId) || `template_${Date.now()}`);
            const nextId = await requestTemplateWorkbenchId({
                title: item?.title || t('Template', '模板'),
                defaultId
            });
            if (!nextId || !isLatestTemplateWorkbenchCreation(creationToken)) return;
            const safeId = String(call('sanitizeStoragePart', nextId, nextId) || '').replace(/[:]/g, '_') || defaultId;
            const cachedCurrent = await call('saveProject', false, true, { persist: false });
            if (!isLatestTemplateWorkbenchCreation(creationToken)) return;
            if (!cachedCurrent) {
                call('showToast', null, t('Current workbench could not be saved to browser cache; creation cancelled.', '当前工作台无法保存到浏览器缓存，已取消新建。'));
                return;
            }
            const storageScope = call('getStorageScope', {}, []) || {};
            call('setActiveBrowserCacheProject', null, safeId, storageScope);
            let templateProject;
            try {
                templateProject = await call('loadWorkbenchTemplateData', null, item);
            } catch (err) {
                restoreTemplateWorkbenchCreation({
                    token: creationToken,
                    previousProjectId,
                    storageScope,
                    error: err?.message || err
                });
                return;
            }
            if (!isLatestTemplateWorkbenchCreation(creationToken)) return;
            applyTemplateWorkbenchProject(templateProject || call('createDefaultProject', {}, []), {
                safeId,
                item,
                storageKey: call('getStorageKey', '', []),
                storageScope,
                sourceKey: item?.source === 'user' ? `user:${item.id}` : item?.id
            });
        }

        async function saveCurrentCanvasAsTemplate(parentModal) {
            const currentProject = call('getCurrentProject', {}, []) || {};
            const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
            const rawDefaultId = `${currentProject.id || 'canvas'}_template_${timestamp}`;
            const defaultId = String(call('sanitizeStoragePart', rawDefaultId, rawDefaultId) || `template_${Date.now()}`);
            const templateMeta = currentProject && typeof currentProject.template === 'object' ? currentProject.template : {};
            const templateMediaCategories = getTemplateMediaCategories();
            const categories = Array.isArray(templateMediaCategories) && templateMediaCategories.length
                ? templateMediaCategories
                : ['starter', 'image', 'video', 'audio'];
            const defaultCategory = categories.includes(templateMeta.category) ? templateMeta.category : 'image';
            const defaultTitle = currentProject.title || currentProject.id || t('Canvas Template', '画布模板');
            const details = await requestSaveTemplateDetails({
                defaultId,
                defaultTitle,
                defaultCategory,
                categories,
                description: t('Saved from the current canvas.', '从当前画布保存。'),
                tags: 'user, canvas'
            });
            if (!details) return;
            await call('saveProject', null, true, { persist: false });
            const savedProject = call('getCurrentProject', currentProject, []) || currentProject;
            const templateProject = call('compactProjectForStorage', savedProject, savedProject, {
                stripAllMaterializedDataUrls: true,
                stripStorage: true,
                runHistoryLimit: 8
            }) || savedProject;
            templateProject.id = details.id;
            templateProject.title = details.title;
            const defaults = call('getDefaultSettings', {}, []) || {};
            templateProject.settings = Object.assign({}, defaults, templateProject.settings || {}, { __template_source: 'user' });
            const modelDependency = call('inferProjectTemplateModelDependency', {
                mode: 'model_free',
                label: t('Model-free', '无模型依赖'),
                note: t('No runnable Preset or Classic nodes detected.', '未检测到可运行的 Preset 或 Classic 节点。'),
                models: []
            }, templateProject);
            const result = await call('sendCanvasTemplateSaveRequest', null, {
                template_id: details.id,
                title: details.title,
                description: details.description,
                category: details.category,
                tags: details.tags,
                type_label: t('User template', '用户模板'),
                model_dependency: modelDependency,
                project: templateProject
            });
            if (!result?.ok) {
                call('showToast', null, t('Template save failed: {error}', '模板保存失败：{error}')
                    .replace('{error}', result?.error || result?.details || 'unknown'));
                return;
            }
            call('showToast', null, t('Template saved: {title}', '模板已保存：{title}').replace('{title}', details.title));
            await refreshTemplateLibraryAfterMutation(parentModal, { category: 'user', query: '' });
        }

        function refreshTemplateLibraryModal(modal, state) {
            if (!modal) return;
            const items = modal.__saiTemplateItems || [];
            const filtered = call('templateLibraryFilterState', null, state || {}, items) || {
                currentCategory: call('normalizeTemplateLibraryCategory', 'starter', state?.category),
                rawQuery: String(state?.query || ''),
                items
            };
            const panel = modal.querySelector?.('.sai-template-library-panel');
            if (!panel) {
                modal.innerHTML = call('renderTemplateLibraryHtml', '', state || {}, items);
                bindTemplateLibraryModal(modal);
                return;
            }
            panel.setAttribute('data-template-category', filtered.currentCategory);
            panel.querySelectorAll?.('[data-template-category-button]').forEach((button) => {
                const category = call('normalizeTemplateLibraryCategory', 'starter', button.getAttribute('data-template-category-button'));
                button.classList?.toggle('is-active', category === filtered.currentCategory);
            });
            const input = panel.querySelector?.('[data-template-search]');
            if (input && input.value !== filtered.rawQuery) input.value = filtered.rawQuery;
            const sectionTitle = panel.querySelector?.('.sai-template-library-section-title');
            if (sectionTitle) sectionTitle.textContent = call('templateCategoryLabel', filtered.currentCategory, filtered.currentCategory);
            const grid = panel.querySelector?.('.sai-template-grid');
            if (grid) {
                grid.innerHTML = filtered.items.length
                    ? filtered.items.map(item => call('renderTemplateCardHtml', '', item)).join('')
                    : `<div class="sai-template-empty">${call('escapeHtml', t('No templates in this category yet.', '这个分类还没有模板。'), t('No templates in this category yet.', '这个分类还没有模板。'))}</div>`;
            }
        }

        function restoreTemplateWorkbenchCreation(options) {
            const config = options || {};
            if (config.token != null && !isLatestTemplateWorkbenchCreation(config.token)) return false;
            if (config.previousProjectId) {
                call('setActiveBrowserCacheProject', null, config.previousProjectId, config.storageScope);
            }
            const error = String(config.error || 'unknown');
            call('showToast', null, t('Failed to create workbench from template: {error}', '从模板新建工作台失败：{error}').replace('{error}', error));
            return true;
        }

        function bindTemplateLibraryModal(modal) {
            if (!modal) return;
            if (!modal.__saiTemplateLibraryClickBound) {
                modal.__saiTemplateLibraryClickBound = true;
                modal.addEventListener('click', async (evt) => {
                    const closeBtn = evt.target?.closest?.('[data-template-close]');
                    if (closeBtn || evt.target === modal) {
                        closeTemplateLibrary();
                        return;
                    }
                    const saveCurrentBtn = evt.target?.closest?.('[data-template-save-current]');
                    if (saveCurrentBtn) {
                        await call('saveCurrentCanvasAsTemplate', null, modal);
                        return;
                    }
                    const categoryBtn = evt.target?.closest?.('[data-template-category-button]');
                    if (categoryBtn) {
                        const category = call('normalizeTemplateLibraryCategory', 'starter', categoryBtn.getAttribute('data-template-category-button'));
                        const query = modal.querySelector?.('[data-template-search]')?.value || '';
                        refreshTemplateLibraryModal(modal, { category, query });
                        return;
                    }
                    const deleteBtn = evt.target?.closest?.('[data-template-delete]');
                    if (deleteBtn) {
                        const item = findItem(modal, deleteBtn.getAttribute('data-template-delete'));
                        if (item) await call('deleteUserWorkbenchTemplate', null, item, modal);
                        return;
                    }
                    const useBtn = evt.target?.closest?.('[data-template-use]');
                    if (useBtn) {
                        const item = findItem(modal, useBtn.getAttribute('data-template-use'));
                        if (item) await call('createWorkbenchFromTemplate', null, item);
                    }
                });
            }
            const input = modal.querySelector?.('[data-template-search]');
            if (input && !input.__saiTemplateLibraryInputBound) {
                input.__saiTemplateLibraryInputBound = true;
                input.addEventListener('input', () => {
                    const panel = modal.querySelector?.('.sai-template-library-panel');
                    const category = call('normalizeTemplateLibraryCategory', 'starter', panel?.getAttribute?.('data-template-category'));
                    refreshTemplateLibraryModal(modal, { category, query: input.value || '' });
                });
            }
        }

        async function refreshTemplateLibraryAfterMutation(parentModal, options) {
            const refreshToken = beginTemplateLibraryRefresh();
            call('invalidateTemplateLibraryItems', null);
            const items = await call('getWorkbenchTemplateLibraryItems', [], { force: true });
            if (!isLatestTemplateLibraryRefresh(refreshToken)) return items;
            const isConnected = call('isTemplateLibraryModalConnected', !!parentModal?.isConnected, parentModal);
            if (!parentModal || !isConnected) return items;

            const config = options || {};
            const panel = parentModal.querySelector?.('.sai-template-library-panel');
            const rawCategory = Object.prototype.hasOwnProperty.call(config, 'category')
                ? config.category
                : panel?.getAttribute?.('data-template-category') || 'user';
            const category = call('normalizeTemplateLibraryCategory', 'starter', rawCategory);
            const query = Object.prototype.hasOwnProperty.call(config, 'query')
                ? String(config.query || '')
                : parentModal.querySelector?.('[data-template-search]')?.value || '';
            parentModal.__saiTemplateItems = items;
            const html = call('renderTemplateLibraryHtml', '', { category, query }, items);
            if (typeof html === 'string') parentModal.innerHTML = html;
            bindTemplateLibraryModal(parentModal);
            return items;
        }

        function requestSaveTemplateDetails(options) {
            const config = options || {};
            const doc = scope.document || (typeof document !== 'undefined' ? document : null);
            if (!doc?.createElement) return Promise.resolve(null);
            return new Promise((resolve) => {
                const modal = doc.createElement('div');
                const theme = call('detectWorkbenchTheme', '');
                modal.className = `sai-canvas-modal sai-template-create-modal ${theme === 'dark' ? 'theme-dark' : ''}`;
                modal.innerHTML = call('renderSaveTemplateDialogHtml', '', config);
                const cleanup = (value) => {
                    if (typeof modal.remove === 'function') modal.remove();
                    else modal.parentNode?.removeChild?.(modal);
                    resolve(value);
                };
                modal.addEventListener('click', (evt) => {
                    if (evt.target === modal || evt.target?.closest?.('[data-template-create-cancel]')) cleanup(null);
                });
                modal.querySelector?.('form')?.addEventListener('submit', (evt) => {
                    evt.preventDefault();
                    const read = (key) => modal.querySelector?.(`[data-save-template-field="${key}"]`)?.value || '';
                    const fallbackId = String(config.defaultId || '');
                    const sanitizedId = call('sanitizeStoragePart', read('id'), read('id'));
                    const id = String(sanitizedId || '').replace(/[:]/g, '_') || fallbackId;
                    const title = read('title').trim() || id;
                    const category = call('normalizeTemplateMediaCategory', 'starter', read('category'), 'starter');
                    const description = read('description').trim();
                    const tags = read('tags').split(',').map(tag => tag.trim()).filter(Boolean);
                    cleanup({ id, title, category, description, tags });
                });
                doc.body?.appendChild?.(modal);
                const input = modal.querySelector?.('[data-save-template-field="id"]');
                input?.focus?.({ preventScroll: true });
                input?.select?.();
            });
        }

        function requestTemplateWorkbenchId(options) {
            const config = options || {};
            const doc = scope.document || (typeof document !== 'undefined' ? document : null);
            if (!doc?.createElement) return Promise.resolve(null);
            return new Promise((resolve) => {
                const modal = doc.createElement('div');
                const theme = call('detectWorkbenchTheme', '');
                modal.className = `sai-canvas-modal sai-template-create-modal ${theme === 'dark' ? 'theme-dark' : ''}`;
                modal.innerHTML = call('renderTemplateWorkbenchIdDialogHtml', '', config);
                const cleanup = (value) => {
                    if (typeof modal.remove === 'function') modal.remove();
                    else modal.parentNode?.removeChild?.(modal);
                    resolve(value);
                };
                modal.addEventListener('click', (evt) => {
                    if (evt.target === modal || evt.target?.closest?.('[data-template-create-cancel]')) cleanup(null);
                });
                const form = modal.querySelector?.('form');
                form?.addEventListener('submit', (evt) => {
                    evt.preventDefault();
                    const value = modal.querySelector?.('[data-template-create-id]')?.value || '';
                    cleanup(value.trim());
                });
                doc.body?.appendChild?.(modal);
                const input = modal.querySelector?.('[data-template-create-id]');
                input?.focus?.({ preventScroll: true });
                input?.select?.();
            });
        }

        function currentWorkbenchSettingsForTemplateProject() {
            const current = call('getCurrentProject', {}, [])?.settings;
            const source = current && typeof current === 'object' ? current : {};
            const preserved = {};
            Object.keys(source).forEach((key) => {
                if (!key || key.startsWith('__')) return;
                preserved[key] = call('cloneRunValue', source[key], source[key]);
            });
            return preserved;
        }

        function applyTemplateProjectSettings(templateProject, sourceKey) {
            const templateSettings = templateProject?.settings && typeof templateProject.settings === 'object'
                ? templateProject.settings
                : {};
            templateProject.settings = Object.assign(
                {},
                call('getDefaultSettings', {}, []),
                templateSettings,
                currentWorkbenchSettingsForTemplateProject(),
                { __template_source: sourceKey }
            );
            return templateProject.settings;
        }

        function applyTemplateWorkbenchProject(templateProject, options) {
            const config = options || {};
            const projectValue = call('sanitizeProject', templateProject || call('createDefaultProject', {}));
            const safeId = String(config.safeId || '');
            const item = config.item || {};
            const now = call('nowIso', new Date().toISOString());
            projectValue.id = safeId;
            projectValue.title = item.title || projectValue.title || safeId;
            projectValue.created_at = projectValue.created_at || now;
            projectValue.updated_at = now;
            projectValue.storage = call('buildProjectStorageInfo', projectValue.storage, config.storageKey, config.storageScope);
            applyTemplateProjectSettings(projectValue, config.sourceKey);
            call('setProject', null, projectValue);
            call('syncCanvasProjectAssetRoot', null, projectValue);
            call('resetRenderedProjectDomCache', null);
            Promise.resolve(call('refreshCanvasProjectAssetRoot', null, { render: false })).catch((err) => {
                if (typeof scope.warn === 'function') scope.warn('[SimpAI Canvas] template asset root refresh skipped:', err);
                else if (typeof console !== 'undefined' && typeof console.warn === 'function') console.warn('[SimpAI Canvas] template asset root refresh skipped:', err);
            });
            call('setBackendLoadedStorageKey', null, '');
            call('resetSelectionState', null);
            call('resetHistory', null);
            call('mutate', null);
            call('resetGalleryFrostReveals', null);
            closeTemplateLibrary();
            call('showToast', null, t('Created workbench from template: {id}', '已从模板新建工作台：{id}').replace('{id}', safeId));
            return projectValue;
        }

        return {
            bindTemplateLibraryModal,
            closeTemplateLibrary,
            openTemplateLibrary,
            deleteUserWorkbenchTemplate,
            createWorkbenchFromTemplate,
            saveCurrentCanvasAsTemplate,
            refreshTemplateLibraryModal,
            refreshTemplateLibraryAfterMutation,
            requestSaveTemplateDetails,
            requestTemplateWorkbenchId,
            applyTemplateWorkbenchProject,
            beginTemplateWorkbenchCreation,
            isLatestTemplateWorkbenchCreation,
            cancelTemplateWorkbenchCreation,
            beginTemplateLibraryRefresh,
            isLatestTemplateLibraryRefresh,
            cancelTemplateLibraryRefresh,
            restoreTemplateWorkbenchCreation
        };
    }

    window.SimpAICanvasWorkbenchTemplateLibraryController = Object.assign({}, window.SimpAICanvasWorkbenchTemplateLibraryController || {}, {
        createCanvasTemplateLibraryController
    });
})();
