(function () {
    'use strict';

    const TEMPLATE_MEDIA_CATEGORIES = Object.freeze(['starter', 'image', 'video', 'audio']);

    function createCanvasTemplateLibraryDataController(context) {
        const scope = context || {};
        const t = scope.t || ((en, cn) => cn || en);
        const sanitizeStoragePart = scope.sanitizeStoragePart || ((value) => String(value || '').trim());
        const resolveStaticPath = scope.resolveStaticPath || ((value) => String(value || ''));
        const manifestPath = String(call('getManifestPath', '') || '');
        const previewRoot = String(call('getPreviewRoot', '') || '');
        let itemsCache = null;

        function call(name, fallback, ...args) {
            return typeof scope[name] === 'function' ? scope[name](...args) : fallback;
        }

        function warn(...args) {
            if (typeof scope.warn === 'function') {
                scope.warn(...args);
                return;
            }
            if (typeof console !== 'undefined' && typeof console.warn === 'function') console.warn(...args);
        }

        function localizeTemplateText(value, fallback) {
            if (value && typeof value === 'object') return t(value.en || fallback || '', value.zh || value.cn || value.en || fallback || '');
            return String(value || fallback || '');
        }

        function normalizeTemplateModelDependency(raw, fallbackCategory) {
            const source = raw && typeof raw === 'object' ? raw : {};
            const nested = source.modelDependency || source.model_dependency || source.requirements || {};
            const dep = nested && typeof nested === 'object' ? nested : {};
            let mode = String(dep.mode || dep.kind || source.model_dependency_mode || '').trim().toLowerCase();
            if (!mode) mode = fallbackCategory === 'starter' ? 'model_free' : 'unknown';
            if (!['model_free', 'teaching_only', 'requires_models', 'unknown'].includes(mode)) mode = 'unknown';
            const modelList = Array.isArray(dep.models || dep.model_list)
                ? (dep.models || dep.model_list).map(item => String(item?.name || item?.path_file || item || '').trim()).filter(Boolean)
                : [];
            const defaultLabel = {
                model_free: t('Model-free', '无模型依赖'),
                teaching_only: t('Teaching only', '教学示例'),
                requires_models: t('Requires models', '需要模型'),
                unknown: t('Model status unknown', '模型状态未知')
            }[mode] || t('Model status unknown', '模型状态未知');
            const defaultNote = {
                model_free: t('Can be browsed and edited without model files.', '无需模型文件即可浏览和编辑。'),
                teaching_only: t('Static teaching template; it is not meant to run generation.', '静态教学模板，不用于真实生成。'),
                requires_models: modelList.length
                    ? t('Requires {count} model file(s). Check/download models before Run.', '需要 {count} 个模型文件。运行前请检查/下载模型。').replace('{count}', modelList.length)
                    : t('Check/download models before running this template.', '运行此模板前请检查/下载模型。'),
                unknown: t('Open the template and check model readiness before Run.', '打开模板后请先检查模型就绪状态再运行。')
            }[mode] || '';
            return {
                mode,
                label: localizeTemplateText(dep.label, defaultLabel),
                note: localizeTemplateText(dep.note || dep.description, defaultNote),
                models: modelList
            };
        }

        function inferProjectTemplateModelDependency(sourceProject) {
            const nodes = Array.isArray(sourceProject?.nodes) ? sourceProject.nodes : [];
            const presetNodes = nodes.filter(node => node && ['preset', 'classic'].includes(node.type) && node.source?.kind !== 'onboarding_model_status_example');
            if (!presetNodes.length) {
                return {
                    mode: 'model_free',
                    label: t('Model-free', '无模型依赖'),
                    note: t('No runnable Preset or Classic nodes detected.', '未检测到可运行的 Preset 或 Classic 节点。'),
                    models: []
                };
            }
            const models = [];
            presetNodes.forEach((node) => {
                const requirements = node.model_requirements || {};
                const modelList = Array.isArray(requirements.model_list) ? requirements.model_list : [];
                modelList.forEach((item) => {
                    const name = String(item?.name || item?.path_file || item?.filename || item || '').trim();
                    if (name && !models.includes(name)) models.push(name);
                });
            });
            return {
                mode: 'requires_models',
                label: t('Requires models', '需要模型'),
                note: models.length
                    ? t('Contains {presetCount} preset node(s) and {modelCount} model requirement(s). Check models before Run.', '包含 {presetCount} 个 preset 节点和 {modelCount} 个模型依赖。运行前请检查模型。')
                        .replace('{presetCount}', presetNodes.length)
                        .replace('{modelCount}', models.length)
                    : t('Contains {presetCount} preset node(s). Check model readiness before Run.', '包含 {presetCount} 个 preset 节点。运行前请检查模型就绪状态再运行。')
                        .replace('{presetCount}', presetNodes.length),
                models
            };
        }

        function resolveTemplatePreviewPath(preview) {
            const value = String(preview || '').trim();
            if (!value) return '';
            if (/^(https?:|data:|blob:|\/)/i.test(value)) return value;
            return resolveStaticPath(value.includes('/') ? value : `${previewRoot}${value}`);
        }

        function normalizeTemplateMediaCategory(category, fallback = 'image') {
            const value = String(category || '').trim().toLowerCase();
            return TEMPLATE_MEDIA_CATEGORIES.includes(value) ? value : fallback;
        }

        function normalizeTemplateLibraryItem(raw, index) {
            const item = raw && typeof raw === 'object' ? raw : {};
            const id = sanitizeStoragePart(item.id || item.key || `template_${index + 1}`) || `template_${index + 1}`;
            const mediaCategory = normalizeTemplateMediaCategory(item.category, 'image');
            const source = String(item.source || '').trim().toLowerCase() === 'user' || String(item.path || '').startsWith('user:') ? 'user' : 'static';
            const category = source === 'user' ? 'user' : mediaCategory;
            const modelDependency = normalizeTemplateModelDependency(item, mediaCategory);
            return {
                key: `${source}:${id}`,
                id,
                title: localizeTemplateText(item.title, id),
                description: localizeTemplateText(item.description, ''),
                category,
                mediaCategory,
                tags: Array.isArray(item.tags) ? item.tags.map((tag) => String(tag || '').trim()).filter(Boolean) : [],
                typeLabel: localizeTemplateText(item.typeLabel || item.type_label, t('Node graph', '节点图')),
                modelDependency,
                path: source === 'user' ? `user:${id}` : resolveStaticPath(item.path || ''),
                preview: resolveTemplatePreviewPath(item.preview || item.preview_image || item.thumbnail),
                source,
                updatedAt: item.updated_at || '',
                filePath: item.file_path || ''
            };
        }

        async function getUserWorkbenchTemplateLibraryItems() {
            try {
                const response = await call('sendTemplateListRequest', null, {});
                const rows = Array.isArray(response?.templates) ? response.templates : [];
                return rows.map(normalizeTemplateLibraryItem).filter((item) => item.id && item.path);
            } catch (err) {
                warn('[SimpAI Canvas] user template list unavailable:', err);
            }
            return [];
        }

        async function getWorkbenchTemplateLibraryItems(options) {
            if (itemsCache && !options?.force) return itemsCache;
            try {
                const response = await call('fetchManifest', null, manifestPath, { cache: 'no-store' });
                if (response?.ok) {
                    const manifest = await response.json();
                    const rows = Array.isArray(manifest) ? manifest : Array.isArray(manifest.templates) ? manifest.templates : [];
                    const items = rows.map(normalizeTemplateLibraryItem).filter((item) => item.id && item.path);
                    const userItems = await getUserWorkbenchTemplateLibraryItems();
                    if (userItems.length) items.push(...userItems);
                    if (items.length) {
                        itemsCache = items;
                        return itemsCache;
                    }
                }
            } catch (err) {
                warn('[SimpAI Canvas] template library manifest unavailable, using built-in defaults:', err);
            }
            const fallbackItems = (call('getDefaultTemplateItems', [], []) || []).map(normalizeTemplateLibraryItem);
            const userItems = await getUserWorkbenchTemplateLibraryItems();
            itemsCache = fallbackItems.concat(userItems);
            return itemsCache;
        }

        async function loadWorkbenchTemplateData(item) {
            if (item?.source === 'user' || String(item?.path || '').startsWith('user:')) {
                const templateId = String(item?.id || String(item?.path || '').replace(/^user:/, '')).trim();
                const response = await call('sendTemplateLoadRequest', null, templateId);
                if (response?.ok && response.project) return response.project;
                const error = response?.error || 'unknown';
                call('showToast', null, t('Failed to load user template: {error}', '读取用户模板失败：{error}').replace('{error}', error));
                return call('createFallbackProject', null);
            }
            if (item?.path) {
                try {
                    const response = await call('fetchTemplateProject', null, item.path, { cache: 'no-store' });
                    if (response?.ok) return await response.json();
                } catch (err) {
                    warn('[SimpAI Canvas] template fetch failed, using fallback demo:', err);
                }
            }
            return call('createFallbackProject', null);
        }

        function invalidateTemplateLibraryItems() {
            itemsCache = null;
        }

        return {
            TEMPLATE_MEDIA_CATEGORIES,
            localizeTemplateText,
            normalizeTemplateModelDependency,
            inferProjectTemplateModelDependency,
            resolveTemplatePreviewPath,
            normalizeTemplateMediaCategory,
            normalizeTemplateLibraryItem,
            getUserWorkbenchTemplateLibraryItems,
            getWorkbenchTemplateLibraryItems,
            loadWorkbenchTemplateData,
            invalidateTemplateLibraryItems
        };
    }

    window.SimpAICanvasWorkbenchTemplateLibraryData = Object.assign({}, window.SimpAICanvasWorkbenchTemplateLibraryData || {}, {
        TEMPLATE_MEDIA_CATEGORIES,
        createCanvasTemplateLibraryDataController
    });
})();
