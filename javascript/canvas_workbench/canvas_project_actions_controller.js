(function () {
    'use strict';

    function createCanvasProjectActionsController(context) {
        const scope = context || {};
        const t = scope.t || ((en, cn) => cn || en);
        const call = (name, fallback, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : fallback;
        let importProjectInput = null;

        function clearBrowserCache() {
            const storage = call('getStorage', null);
            try {
                const storageScope = call('getStorageScope', {}, []);
                const index = call('browserCacheProjectIndex', {}, storageScope) || {};
                const keys = Object.values(index)
                    .map(entry => String(entry?.key || '').trim())
                    .filter(Boolean);
                keys.push(
                    String(call('getStorageKey', '', []) || '').trim(),
                    String(call('getStorageBaseKey', '', []) || '').trim(),
                    String(call('browserCacheActiveProjectIdKey', '', storageScope) || '').trim(),
                    String(call('browserCacheProjectIndexKey', '', storageScope) || '').trim(),
                    String(call('getLegacyStorageKey', '', []) || '').trim()
                );
                [...new Set(keys)].filter(Boolean).forEach(key => storage?.removeItem?.(key));
                call('showToast', null, t('Browser localStorage cache cleared; project files in the directory were not deleted.', '浏览器 localStorage 缓存已清空，目录项目文件未删除'));
            } catch (err) {
                call('showToast', null, t('Failed to clear browser cache.', '清空浏览器缓存失败'));
            }
            call('renderStatus', null);
            return true;
        }

        async function clearProjectFileWithConfirm() {
            const confirmed = call('confirm', false, t('Clear the current project file? This resets the canvas project under the user directory.', '清空当前项目文件？这会把用户目录下的画布项目重置为空。'));
            if (!confirmed) return false;
            const result = await call('sendCanvasProjectClearRequest', null, {
                project_id: call('getCurrentProjectId', '', [])
            });
            if (!result || !result.ok) {
                call('showToast', null, t('Failed to clear project file{error}', '清空项目文件失败{error}')
                    .replace('{error}', result && result.error ? `: ${result.error}` : ''));
                return false;
            }
            const nextProject = call('sanitizeProject', {}, result.project || call('createDefaultProject', {}, [])) || {};
            nextProject.settings = Object.assign({}, nextProject.settings || {}, { __demo_initialized: true });
            const storageScope = call('getStorageScope', {}, []);
            call('setProject', null, nextProject);
            call('setActiveBrowserCacheProject', null, nextProject.id || call('getDefaultProjectId', 'default', []), storageScope);
            if (result.storage) nextProject.storage = result.storage;
            call('resetRenderedProjectDomCache', null);
            call('saveProjectToBrowserCache', null);
            call('resetSelectionState', null);
            call('setBackendLoadedStorageKey', null, call('getStorageKey', '', []));
            call('resetHistory', null);
            call('renderAll', null);
            call('resetGalleryFrostReveals', null);
            call('showToast', null, t('Project file cleared.', '项目文件已清空'));
            return true;
        }

        function loadDemoWorkbenchWithConfirm() {
            const currentProject = call('getCurrentProject', {}, []) || {};
            const hasContent = !call('isProjectEmpty', true, currentProject);
            if (hasContent && !call('confirm', false, t('Load the Quick Start workbench and replace the current canvas draft?', '加载快速入门工作台并替换当前画布草稿？'))) {
                return false;
            }
            call('pushHistory', null, 'Load demo workbench');
            const storageScope = call('getStorageScope', {}, []);
            const storageKey = call('getStorageKey', '', []);
            const storage = currentProject.storage || call('buildProjectStorageInfo', {}, storageKey, storageScope);
            const demo = call('createDemoWorkbenchProject', {}, {
                id: currentProject.id || call('getDefaultProjectId', 'default', []),
                storage
            }) || {};
            demo.storage = storage;
            call('setProject', null, demo);
            call('resetRenderedProjectDomCache', null);
            call('resetSelectionState', null);
            call('mutate', null);
            call('resetGalleryFrostReveals', null);
            call('showToast', null, t('Quick Start workbench loaded.', '快速入门工作台已加载。'));
            return true;
        }

        function clearCanvasWithConfirm() {
            const currentProject = call('getCurrentProject', {}, []) || {};
            const nodes = Array.isArray(currentProject.nodes) ? currentProject.nodes : [];
            const edges = Array.isArray(currentProject.edges) ? currentProject.edges : [];
            const groups = call('ensureProjectGroups', []) || [];
            if (!nodes.length && !edges.length && !groups.length) return false;
            const confirmed = call('confirm', false, t('Clear the current canvas? This only clears the canvas draft and does not delete output files.', '清空当前画布？此操作只清空画布草稿，不删除输出文件。'));
            if (!confirmed) return false;
            call('pushHistory', null, 'Clear canvas');
            call('interruptDeletedResultRuns', null, nodes);
            call('stopTimelinePlayback', false);
            currentProject.groups = [];
            currentProject.nodes = [];
            currentProject.edges = [];
            currentProject.runs = [];
            currentProject.settings = Object.assign({}, currentProject.settings || {}, { __demo_initialized: true });
            call('resetSelectionState', null);
            call('mutate', null);
            return true;
        }

        function openProjectJsonPicker() {
            const documentRef = call('getDocument', null);
            if (!documentRef?.createElement) return false;
            importProjectInput = importProjectInput || documentRef.createElement('input');
            importProjectInput.type = 'file';
            importProjectInput.accept = '.json,.canvas.json,application/json';
            importProjectInput.multiple = false;
            importProjectInput.hidden = true;
            if (!importProjectInput.isConnected) documentRef.body?.appendChild(importProjectInput);
            importProjectInput.onchange = async () => {
                const file = importProjectInput.files && importProjectInput.files[0];
                importProjectInput.value = '';
                if (file) await importWorkbenchProjectFromFile(file, { persist: false });
            };
            importProjectInput.click();
            return true;
        }

        async function switchProjectWithPrompt() {
            const currentProject = call('getCurrentProject', {}, []) || {};
            const defaultId = currentProject.id || call('getDefaultProjectId', 'default', []);
            const nextId = call('prompt', null, t('Enter project file name (saved under user directory canvas_workbench/projects)', '输入项目文件名（保存在用户目录 canvas_workbench/projects 下）'), defaultId);
            if (!nextId) return false;
            const safeId = String(call('sanitizeStoragePart', nextId, nextId) || '').replace(/[:]/g, '_') || defaultId;
            const cachedCurrent = await call('saveProject', false, true, { persist: false });
            if (!cachedCurrent) {
                call('showToast', null, t('Current workbench could not be saved to browser cache; switch cancelled.', '当前工作台无法保存到浏览器缓存，已取消切换。'));
                return false;
            }
            const storageScope = call('getStorageScope', {}, []);
            call('setActiveBrowserCacheProject', null, safeId, storageScope);
            const storageKey = call('getStorageKey', '', []);
            const nextProject = call('loadProject', {}, storageKey, call('browserCacheProjectScope', {}, storageScope)) || {};
            if ((nextProject.id || defaultId) !== safeId) {
                nextProject.id = safeId;
                nextProject.title = nextProject.title || safeId;
            }
            call('setProject', null, nextProject);
            call('resetRenderedProjectDomCache', null);
            call('setBackendLoadedStorageKey', null, '');
            call('resetSelectionState', null);
            call('resetHistory', null);
            call('renderAll', null);
            const loaded = await call('loadProjectFromBackend', false, { force: false });
            if (!loaded) {
                const fallbackProject = call('getCurrentProject', {}, []) || nextProject;
                fallbackProject.storage = call('buildProjectStorageInfo', {}, storageKey, storageScope);
                await call('saveProject', null, true, { persist: false });
                call('renderAll', null);
            }
            call('showToast', null, t('Switched to project: {id}', '已切换到项目：{id}').replace('{id}', safeId));
            return true;
        }

        async function switchProjectById(projectId, options) {
            const opts = options || {};
            const currentProject = call('getCurrentProject', {}, []) || {};
            const defaultId = call('getDefaultProjectId', 'default', []);
            const currentId = currentProject.id || defaultId;
            const safeId = String(call('sanitizeStoragePart', projectId, projectId) || '').replace(/[:]/g, '_') || defaultId;
            if (!safeId) return false;
            if (safeId === currentId) {
                if (!opts.reloadActive) {
                    call('showToast', null, t('Already on workbench: {id}', '已经在工作台：{id}').replace('{id}', safeId));
                    return true;
                }
                const confirmed = call('confirm', false, t('Reload this workbench from disk? Unsaved browser edits for this workbench will be replaced.', '从磁盘重新加载当前工作台？当前工作台未保存到磁盘的浏览器临时修改会被替换。'));
                if (!confirmed) return false;
                const storageScope = call('getStorageScope', {}, []);
                call('setActiveBrowserCacheProject', null, safeId, storageScope);
                call('setBackendLoadedStorageKey', null, '');
                const ok = await call('loadProjectFromBackend', false, { force: true });
                call('showToast', null, ok
                    ? t('Reloaded workbench: {id}', '已重新加载工作台：{id}').replace('{id}', safeId)
                    : t('Failed to reload workbench: {id}', '重新加载工作台失败：{id}').replace('{id}', safeId));
                return ok;
            }
            const previousSelection = call('getSelectionState', {}, []) || {};
            const previousBackendLoadedStorageKey = call('getBackendLoadedStorageKey', '', []);
            const cachedCurrent = await call('saveProject', false, true, { persist: false });
            if (!cachedCurrent) {
                call('showToast', null, t('Current workbench could not be saved to browser cache; open cancelled.', '当前工作台无法保存到浏览器缓存，已取消打开。'));
                return false;
            }
            const storageScope = call('getStorageScope', {}, []);
            call('setActiveBrowserCacheProject', null, safeId, storageScope);
            const storageKey = call('getStorageKey', '', []);
            const nextProject = call('loadProject', {}, storageKey, call('browserCacheProjectScope', {}, storageScope)) || {};
            if ((nextProject.id || defaultId) !== safeId) {
                nextProject.id = safeId;
                nextProject.title = nextProject.title || safeId;
            }
            call('setProject', null, nextProject);
            call('resetRenderedProjectDomCache', null);
            call('setBackendLoadedStorageKey', null, '');
            call('resetSelectionState', null);
            call('resetHistory', null);
            call('renderAll', null);
            const ok = await call('loadProjectFromBackend', false, { force: false });
            if (!ok && opts.createIfMissing) {
                nextProject.storage = call('buildProjectStorageInfo', {}, storageKey, storageScope);
                await call('saveProject', false, true, { persist: false });
                call('renderAll', null);
                call('showToast', null, t('Created local workbench cache: {id}', '已创建本地工作台缓存：{id}').replace('{id}', safeId));
                return true;
            }
            if (!ok) {
                const previousProject = currentProject;
                call('setProject', null, previousProject);
                call('setActiveBrowserCacheProject', null, previousProject.id || defaultId, storageScope);
                call('resetRenderedProjectDomCache', null);
                call('setSelectionState', null, previousSelection);
                call('setBackendLoadedStorageKey', null, previousBackendLoadedStorageKey);
                call('renderAll', null);
            }
            call('showToast', null, ok
                ? t('Opened workbench: {id}', '已打开工作台：{id}').replace('{id}', safeId)
                : t('Failed to open workbench: {id}', '打开工作台失败：{id}').replace('{id}', safeId));
            return ok;
        }

        function handleProjectDeleted(deletedProjectId) {
            const currentProject = call('getCurrentProject', {}, []) || {};
            const defaultId = call('getDefaultProjectId', 'default', []);
            const deletedId = String(call('sanitizeStoragePart', deletedProjectId, deletedProjectId) || '').replace(/[:]/g, '_') || defaultId;
            if (deletedId !== (currentProject.id || defaultId)) return false;
            const storageScope = call('getStorageScope', {}, []);
            const storageKey = call('getStorageKey', '', []);
            currentProject.storage = Object.assign({}, currentProject.storage || call('buildProjectStorageInfo', {}, storageKey, storageScope), {
                deleted_from_disk: true,
                deleted_from_disk_at: call('nowIso', new Date().toISOString()),
                location: t('{location} (browser cache kept)', '{location}（浏览器缓存保留）').replace('{location}', storageScope.location)
            });
            call('setProject', null, currentProject);
            call('syncCanvasProjectAssetRoot', null, currentProject);
            call('setBackendLoadedStorageKey', null, '');
            call('saveProjectToBrowserCache', null, { reason: 'active_project_file_deleted_keep_browser_cache' });
            call('renderStatus', null);
            return true;
        }

        function extractWorkbenchProjectJson(raw) {
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            const candidate = parsed && typeof parsed === 'object' && parsed.project && typeof parsed.project === 'object'
                ? parsed.project
                : parsed;
            if (!candidate || typeof candidate !== 'object') throw new Error('JSON is not an object');
            const hasWorkbenchShape = candidate.schema === 'simpai.canvas.workbench.v1'
                || (Array.isArray(candidate.nodes) && Array.isArray(candidate.edges));
            if (!hasWorkbenchShape) throw new Error('Not a Canvas Workbench project JSON');
            return candidate;
        }

        function projectIdFromWorkbenchFile(file) {
            let name = String(file?.name || '').trim();
            name = name.replace(/\.canvas\.json$/i, '').replace(/\.workbench\.json$/i, '').replace(/\.json$/i, '');
            return String(call('sanitizeStoragePart', name, name) || '').replace(/[:]/g, '_');
        }

        function importedProjectId(incoming, file) {
            const currentId = String(call('sanitizeStoragePart', call('getCurrentProjectId', 'default', []), call('getCurrentProjectId', 'default', [])) || 'default').replace(/[:]/g, '_');
            const incomingId = String(call('sanitizeStoragePart', incoming?.id || '', incoming?.id || '') || '').replace(/[:]/g, '_');
            const fileId = projectIdFromWorkbenchFile(file);
            let nextId = incomingId || fileId || `imported_${Date.now()}`;
            if (nextId === currentId) {
                const base = fileId && fileId !== currentId ? fileId : `${currentId}_import`;
                nextId = `${base}_${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;
            }
            return nextId;
        }

        async function importWorkbenchProjectFromFile(file, options) {
            try {
                const raw = await call('readFileAsText', null, file);
                const incoming = extractWorkbenchProjectJson(raw);
                await call('saveProject', null, true, { persist: false });
                const nextProjectId = importedProjectId(incoming, file);
                const storageScope = call('getStorageScope', {}, []);
                call('setActiveBrowserCacheProject', null, nextProjectId, storageScope);
                const nextProject = call('sanitizeProject', {}, incoming) || {};
                nextProject.id = nextProjectId;
                nextProject.title = nextProject.title || nextProjectId;
                nextProject.storage = call('buildProjectStorageInfo', {}, call('getStorageKey', '', []), storageScope);
                call('setProject', null, nextProject);
                call('resetRenderedProjectDomCache', null);
                call('resetSelectionState', null);
                call('resetHistory', null);
                call('saveProjectToBrowserCache', null);
                call('renderAll', null);
                call('resetGalleryFrostReveals', null);
                if (options?.persist) {
                    await call('saveProject', null, false, { persist: true, backupExisting: false });
                } else {
                    call('showToast', null, t('Imported {name} into browser cache', '已将 {name} 导入浏览器缓存')
                        .replace('{name}', file?.name || 'workbench JSON'));
                }
                return true;
            } catch (error) {
                call('warn', null, '[SimpAI Canvas] failed to import workbench JSON:', error);
                call('showToast', null, t('Import failed: {error}', '导入失败：{error}')
                    .replace('{error}', error?.message || error || 'invalid JSON'));
                return false;
            }
        }

        return {
            clearBrowserCache,
            clearProjectFileWithConfirm,
            loadDemoWorkbenchWithConfirm,
            clearCanvasWithConfirm,
            openProjectJsonPicker,
            switchProjectWithPrompt,
            switchProjectById,
            handleProjectDeleted,
            extractWorkbenchProjectJson,
            projectIdFromWorkbenchFile,
            importedProjectId,
            importWorkbenchProjectFromFile
        };
    }

    window.SimpAICanvasWorkbenchProjectActions = Object.assign({}, window.SimpAICanvasWorkbenchProjectActions || {}, {
        createCanvasProjectActionsController
    });
})();
