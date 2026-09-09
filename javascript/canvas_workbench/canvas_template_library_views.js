(function () {
    'use strict';

    function createCanvasTemplateLibraryViewsController(context) {
        const scope = context || {};
        const t = scope.t || ((en, cn) => cn || en);
        const escapeHtml = scope.escapeHtml || (value => String(value ?? ''));
        const mediaCategories = ['starter', 'image', 'video', 'audio'];
        const libraryCategories = ['starter', 'image', 'video', 'audio', 'user'];

        function normalizeTemplateMediaCategory(category, fallback = 'image') {
            const value = String(category || '').trim().toLowerCase();
            return mediaCategories.includes(value) ? value : fallback;
        }

        function normalizeTemplateLibraryCategory(category, fallback = 'starter') {
            const value = String(category || '').trim().toLowerCase();
            return libraryCategories.includes(value) ? value : fallback;
        }

        function templateCategoryLabel(category) {
            return {
                starter: t('Starter', '新手'),
                image: t('Image', '图像'),
                video: t('Video', '视频'),
                audio: t('Audio', '音频'),
                user: t('User', '用户')
            }[category] || category;
        }

        function templateCategoryIcon(category) {
            return {
                starter: 'fa-graduation-cap',
                image: 'fa-image',
                video: 'fa-film',
                audio: 'fa-volume-high',
                user: 'fa-user'
            }[category] || 'fa-layer-group';
        }

        function templateDependencyIcon(mode) {
            return {
                model_free: 'fa-circle-check',
                teaching_only: 'fa-graduation-cap',
                requires_models: 'fa-cubes',
                unknown: 'fa-circle-question'
            }[mode] || 'fa-circle-question';
        }

        function renderTemplateDependencyHtml(dependency) {
            const dep = dependency || { mode: 'unknown', label: '', note: '' };
            return `<div class="sai-template-dependency" data-dependency="${escapeHtml(dep.mode || 'unknown')}" title="${escapeHtml(dep.note || dep.label || '')}">
  <i class="fa-solid ${escapeHtml(templateDependencyIcon(dep.mode))}"></i>
  <span>${escapeHtml(dep.label || '')}</span>
  <small>${escapeHtml(dep.note || '')}</small>
</div>`;
        }

        function templateLibraryFilterState(state, sourceItems) {
            const currentCategory = normalizeTemplateLibraryCategory(state?.category, 'starter');
            const rawQuery = String(state?.query || '');
            const query = rawQuery.trim().toLowerCase();
            const items = (sourceItems || []).filter((item) => {
                if ((item.category || 'image') !== currentCategory) return false;
                if (!query) return true;
                const dependency = item.modelDependency || {};
                return [item.title, item.description, item.typeLabel, dependency.label, dependency.note, ...(dependency.models || []), ...(item.tags || [])].join(' ').toLowerCase().includes(query);
            });
            return { currentCategory, rawQuery, items };
        }

        function renderTemplateCardHtml(item) {
            const source = item || {};
            const isUserTemplate = source.source === 'user';
            const mediaCategory = normalizeTemplateMediaCategory(source.mediaCategory || source.category, 'image');
            const tags = [
                templateCategoryLabel(mediaCategory),
                isUserTemplate ? t('User', '用户') : t('Built-in', '内置'),
                source.typeLabel || t('Node graph', '节点图')
            ].filter(Boolean);
            const templateKey = source.key || source.id;
            const dependency = source.modelDependency || { mode: 'unknown', label: '', note: '' };
            return `
<article class="sai-template-card" data-template-id="${escapeHtml(source.id)}">
  <button type="button" class="sai-template-preview" data-template-use="${escapeHtml(templateKey)}" title="${escapeHtml(t('Use template', '使用模板'))}">
    ${source.preview ? `<img src="${escapeHtml(source.preview)}" alt="">` : `<div class="sai-template-preview-fallback"><i class="fa-solid fa-route"></i></div>`}
  </button>
  <div class="sai-template-card-body">
    <h3>${escapeHtml(source.title)}</h3>
    <p>${escapeHtml(source.description || '')}</p>
    ${renderTemplateDependencyHtml(dependency)}
    <div class="sai-template-tags">${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')}</div>
    <div class="sai-template-card-actions ${isUserTemplate ? 'has-delete' : ''}">
      <button type="button" class="sai-template-use" data-template-use="${escapeHtml(templateKey)}"><i class="fa-solid fa-plus"></i><span>${escapeHtml(t('Create from template', '从模板新建'))}</span></button>
      ${isUserTemplate ? `<button type="button" class="sai-template-delete" data-template-delete="${escapeHtml(templateKey)}" title="${escapeHtml(t('Delete user template', '删除用户模板'))}" aria-label="${escapeHtml(t('Delete user template', '删除用户模板'))}"><i class="fa-solid fa-trash"></i></button>` : ''}
    </div>
  </div>
</article>`;
        }

        function renderTemplateLibraryHtml(state, sourceItems) {
            const filtered = templateLibraryFilterState(state, sourceItems);
            const currentCategory = filtered.currentCategory;
            const items = filtered.items;
            return `
<div class="sai-canvas-modal-panel sai-template-library-panel" data-template-category="${escapeHtml(currentCategory)}">
  <aside class="sai-template-library-sidebar">
    <div class="sai-template-library-title"><i class="fa-solid fa-layer-group"></i><span>${escapeHtml(t('Templates', '模板库'))}</span></div>
    <div class="sai-template-library-categories">
      ${libraryCategories.map((category) => `<button type="button" data-template-category-button="${escapeHtml(category)}" class="${category === currentCategory ? 'is-active' : ''}"><i class="fa-solid ${escapeHtml(templateCategoryIcon(category))}"></i><span>${escapeHtml(templateCategoryLabel(category))}</span></button>`).join('')}
    </div>
  </aside>
  <section class="sai-template-library-main">
    <div class="sai-template-library-head">
      <label class="sai-template-search"><i class="fa-solid fa-magnifying-glass"></i><input type="search" data-template-search value="${escapeHtml(filtered.rawQuery)}" placeholder="${escapeHtml(t('Search templates', '搜索模板'))}"></label>
      <button type="button" data-template-save-current title="${escapeHtml(t('Save current canvas as template', '将当前画布保存为模板'))}"><i class="fa-solid fa-floppy-disk"></i><span>${escapeHtml(t('Save current', '保存当前'))}</span></button>
      <button type="button" data-template-close title="${escapeHtml(t('Close', '关闭'))}" aria-label="${escapeHtml(t('Close', '关闭'))}"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div class="sai-template-library-section-title">${escapeHtml(templateCategoryLabel(currentCategory))}</div>
    <div class="sai-template-grid">
      ${items.length ? items.map(renderTemplateCardHtml).join('') : `<div class="sai-template-empty">${escapeHtml(t('No templates in this category yet.', '这个分类还没有模板。'))}</div>`}
    </div>
  </section>
</div>`;
        }

        function renderSaveTemplateDialogHtml(options) {
            const config = options || {};
            const categories = Array.isArray(config.categories) && config.categories.length ? config.categories : mediaCategories;
            const defaultCategory = normalizeTemplateMediaCategory(config.defaultCategory, 'image');
            const defaultDescription = config.description || t('Saved from the current canvas.', '从当前画布保存。');
            const defaultTags = config.tags || 'user, canvas';
            return `
<div class="sai-canvas-modal-panel sai-template-create-panel">
  <div class="sai-canvas-modal-head">
    <span>${escapeHtml(t('Save current canvas as template', '将当前画布保存为模板'))}</span>
    <button type="button" data-template-create-cancel title="${escapeHtml(t('Cancel', '取消'))}" aria-label="${escapeHtml(t('Cancel', '取消'))}"><i class="fa-solid fa-xmark"></i></button>
  </div>
  <form class="sai-template-create-body">
    <label><span>${escapeHtml(t('Template ID', '模板 ID'))}</span><input type="text" data-save-template-field="id" value="${escapeHtml(config.defaultId || '')}" autocomplete="off" spellcheck="false"></label>
    <label><span>${escapeHtml(t('Title', '标题'))}</span><input type="text" data-save-template-field="title" value="${escapeHtml(config.defaultTitle || '')}" autocomplete="off"></label>
    <label><span>${escapeHtml(t('Category', '分类'))}</span><select data-save-template-field="category">
      ${categories.map(category => `<option value="${escapeHtml(category)}" ${category === defaultCategory ? 'selected' : ''}>${escapeHtml(templateCategoryLabel(category))}</option>`).join('')}
    </select></label>
    <label><span>${escapeHtml(t('Description', '描述'))}</span><textarea data-save-template-field="description" rows="3">${escapeHtml(defaultDescription)}</textarea></label>
    <label><span>${escapeHtml(t('Tags', '标签'))}</span><input type="text" data-save-template-field="tags" value="${escapeHtml(defaultTags)}" autocomplete="off"></label>
    <div class="sai-template-create-actions">
      <button type="button" data-template-create-cancel>${escapeHtml(t('Cancel', '取消'))}</button>
      <button type="submit" class="primary">${escapeHtml(t('Save', '保存'))}</button>
    </div>
  </form>
</div>`;
        }

        function renderTemplateWorkbenchIdDialogHtml(options) {
            const config = options || {};
            return `
<div class="sai-canvas-modal-panel sai-template-create-panel">
  <div class="sai-canvas-modal-head">
    <span>${escapeHtml(t('Create workbench from template', '从模板新建工作台'))}</span>
    <button type="button" data-template-create-cancel title="${escapeHtml(t('Cancel', '取消'))}" aria-label="${escapeHtml(t('Cancel', '取消'))}"><i class="fa-solid fa-xmark"></i></button>
  </div>
  <form class="sai-template-create-body">
    <label>
      <span>${escapeHtml(config.title || t('Template', '模板'))}</span>
      <input type="text" data-template-create-id value="${escapeHtml(config.defaultId || '')}" autocomplete="off" spellcheck="false">
    </label>
    <div class="sai-template-create-actions">
      <button type="button" data-template-create-cancel>${escapeHtml(t('Cancel', '取消'))}</button>
      <button type="submit" class="primary">${escapeHtml(t('Create', '新建'))}</button>
    </div>
  </form>
</div>`;
        }

        return {
            normalizeTemplateMediaCategory,
            normalizeTemplateLibraryCategory,
            templateCategoryLabel,
            templateLibraryFilterState,
            renderTemplateCardHtml,
            renderTemplateLibraryHtml,
            renderSaveTemplateDialogHtml,
            renderTemplateWorkbenchIdDialogHtml
        };
    }

    window.SimpAICanvasWorkbenchTemplateLibraryViews = Object.assign({}, window.SimpAICanvasWorkbenchTemplateLibraryViews || {}, {
        createCanvasTemplateLibraryViewsController
    });
})();
