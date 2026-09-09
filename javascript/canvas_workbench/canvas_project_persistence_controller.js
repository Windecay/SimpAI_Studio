(function () {
    'use strict';

    function createCanvasProjectPersistenceController(context) {
        const scope = context || {};
        const t = scope.t || ((en, cn) => cn || en);
        const call = (name, fallback, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : fallback;

        function getProject() {
            return call('getProject', {}, []) || {};
        }

        function projectId() {
            return getProject().id || call('getDefaultProjectId', 'default', []) || 'default';
        }

        function projectContentWeight(candidate) {
            const project = candidate || {};
            return (Array.isArray(project.nodes) ? project.nodes.length : 0)
                + (Array.isArray(project.edges) ? project.edges.length : 0)
                + (Array.isArray(project.groups) ? project.groups.length : 0)
                + (Array.isArray(project.runs) ? project.runs.length : 0);
        }

        function projectTimestamp(candidate) {
            const project = candidate || {};
            const values = [project.updated_at, project.modified_at, project.created_at];
            for (const value of values) {
                const time = Date.parse(value || '');
                if (Number.isFinite(time) && time > 0) return time;
            }
            return 0;
        }

        function projectIsEmpty(candidate) {
            const project = candidate || getProject() || {};
            return !(Array.isArray(project.nodes) && project.nodes.length)
                && !(Array.isArray(project.edges) && project.edges.length)
                && !(Array.isArray(project.groups) && project.groups.length)
                && !(Array.isArray(project.runs) && project.runs.length);
        }

        function browserBackendProjectDecision(incoming, options) {
            const opts = options || {};
            const local = getProject();
            const base = {
                force: !!opts.force,
                keepBrowser: false,
                reason: ''
            };
            if (opts.force) return Object.assign(base, { reason: 'force_load' });
            const emptyCheck = typeof scope.isProjectEmpty === 'function' ? scope.isProjectEmpty : projectIsEmpty;
            if (emptyCheck(local)) return Object.assign(base, { reason: 'local_empty' });
            const localWeight = projectContentWeight(local);
            const incomingWeight = projectContentWeight(incoming);
            const localIsDemo = !!local.settings?.__demo_initialized;
            const incomingIsDemo = !!incoming?.settings?.__demo_initialized;
            if (opts.backendFound === false && localWeight > 0) {
                return Object.assign(base, { keepBrowser: true, reason: localIsDemo ? 'backend_missing_keep_demo' : 'backend_missing_keep_browser' });
            }
            if (localIsDemo && !incomingIsDemo && incomingWeight > 0) {
                return Object.assign(base, { reason: 'local_demo_backend_has_content' });
            }
            const storage = local.storage || {};
            const storageKey = call('getStorageKey', '', []);
            const localIsBrowserCache = storage.kind === 'browser_local_storage_cache' || storage.key === storageKey;
            const localTime = projectTimestamp(local);
            const incomingTime = projectTimestamp(incoming);
            if (localTime && incomingTime) {
                if (localTime > incomingTime + 1000) return Object.assign(base, { keepBrowser: true, reason: 'browser_newer' });
                if (localIsBrowserCache && !localIsDemo && localTime >= incomingTime - 1000) {
                    return Object.assign(base, { keepBrowser: true, reason: 'browser_cache_not_older' });
                }
                return Object.assign(base, { reason: 'backend_newer' });
            }
            if (localTime && !incomingTime) return Object.assign(base, { keepBrowser: true, reason: 'backend_missing_timestamp' });
            if (localWeight > 0 && incomingWeight === 0) return Object.assign(base, { keepBrowser: true, reason: 'backend_empty' });
            return Object.assign(base, { reason: 'backend_preferred_by_default' });
        }

        function buildProjectStorageInfo(key, storageScope, migrated) {
            const nextScope = storageScope || call('getStorageScope', {}, []);
            if (typeof scope.projectStoreBuildProjectStorageInfo === 'function') {
                return scope.projectStoreBuildProjectStorageInfo(key, nextScope, migrated);
            }
            return {
                kind: 'browser_local_storage_cache',
                key,
                scope: nextScope?.mode || 'local',
                owner: nextScope?.owner || 'local',
                label: nextScope?.label || '',
                location: nextScope?.cacheLocation || t('Browser localStorage cache', '浏览器 localStorage 缓存'),
                migrated_from_legacy: !!migrated
            };
        }

        function compactProjectForStorage(source, options) {
            const result = call('compactProjectForStorage', null, source, options);
            return result || source || {};
        }

        function saveProjectToBrowserCache(context) {
            const currentProject = getProject();
            const storageScope = call('getStorageScope', {}, []);
            const cacheKey = call('setActiveBrowserCacheProject', call('getStorageKey', '', []), projectId(), storageScope);
            currentProject.storage = Object.assign(
                {},
                currentProject.storage || {},
                buildProjectStorageInfo(cacheKey, storageScope, currentProject.storage?.migrated_from_legacy)
            );
            const attempts = [
                { stripAllMaterializedDataUrls: true, maxInlineDataUrlChars: 1800000 },
                { stripAllMaterializedDataUrls: true, maxInlineDataUrlChars: 260000, runHistoryLimit: 4 },
                { stripAllMaterializedDataUrls: true, maxInlineDataUrlChars: 0, runHistoryLimit: 0 }
            ];
            let lastError = null;
            try {
                const storage = call('getStorage', null, []);
                if (!storage || typeof storage.setItem !== 'function') throw new Error('browser cache storage is unavailable');
                for (const options of attempts) {
                    try {
                        const compact = compactProjectForStorage(currentProject, Object.assign({}, options, { stripStorage: false }));
                        storage.setItem(cacheKey, JSON.stringify(compact));
                        return true;
                    } catch (err) {
                        lastError = err;
                    }
                }
            } catch (err) {
                lastError = err;
            }
            if (typeof scope.warn === 'function') scope.warn('[SimpAI Canvas] browser cache save failed after compaction:', lastError);
            else if (typeof console !== 'undefined' && console.warn) console.warn('[SimpAI Canvas] browser cache save failed after compaction:', lastError);
            return false;
        }

        async function saveProject(silent, options) {
            try {
                const opts = options || {};
                const persistToDisk = opts.persist === true || (!silent && opts.persist !== false);
                syncStorageScope({ silent: true });
                let currentProject = getProject();
                currentProject.updated_at = call('nowIso', new Date().toISOString(), []);
                const storageScope = call('getStorageScope', {}, []);
                const storageKey = call('getStorageKey', '', []);
                currentProject.storage = buildProjectStorageInfo(storageKey, storageScope);
                await call('materializeInlineProjectAssets', null, []);
                const cached = saveProjectToBrowserCache({ reason: 'save_project_start', persistToDisk });
                if (!persistToDisk) {
                    if (!cached) {
                        if (!silent) call('showToast', null, t('Browser cache save failed; project is too large for localStorage.', '浏览器缓存保存失败：项目内容超过 localStorage 容量。'));
                        call('renderStatus', null, []);
                        return false;
                    }
                    if (!silent) {
                        call('showToast', null, t('Cached to {location} · {scope}', '已暂存到 {location} · {scope}')
                            .replace('{location}', storageScope.cacheLocation)
                            .replace('{scope}', storageScope.label));
                    }
                    call('renderStatus', null, []);
                    return true;
                }
                const projectPayload = {
                    project_id: currentProject.id || projectId(),
                    project: compactProjectForStorage(currentProject, { stripAllMaterializedDataUrls: true }),
                    backup_existing: !!opts.backupExisting
                };
                const directResult = await call('sendCanvasProjectSaveRequest', null, projectPayload);
                if (directResult && directResult.ok) {
                    if (directResult.project && typeof directResult.project === 'object') {
                        currentProject = call('sanitizeProject', directResult.project, directResult.project) || directResult.project;
                        call('setProject', null, currentProject);
                    }
                    if (directResult.storage && typeof directResult.storage === 'object') currentProject.storage = directResult.storage;
                    call('syncCanvasProjectAssetRoot', null, currentProject);
                    saveProjectToBrowserCache({ reason: 'direct_backend_save_ok' });
                    if (!silent) {
                        call('showToast', null, t('Canvas saved: {target}', '画布已保存：{target}')
                            .replace('{target}', currentProject.storage?.path || currentProject.storage?.location || storageScope.label));
                    }
                    call('renderStatus', null, []);
                    return true;
                }
                if (!call('isCanvasBridgeReady', false, [])) {
                    if (!silent) {
                        call('showToast', null, t('Backend save bridge is not ready; cached to {location} · {scope}', '后端保存桥未就绪，已暂存到 {location} · {scope}')
                            .replace('{location}', storageScope.cacheLocation)
                            .replace('{scope}', storageScope.label));
                    }
                    call('renderStatus', null, []);
                    return true;
                }
                const result = await call('sendCanvasBridgeRequest', null, 'save_project', projectPayload, 45000);
                if (!result || !result.ok) {
                    const error = result && result.error ? `：${result.error}` : '';
                    currentProject.storage = Object.assign({}, currentProject.storage || buildProjectStorageInfo(storageKey, storageScope), {
                        location: t('{location} (pending sync, browser cache only)', '{location}（待同步，浏览器仅作缓存）').replace('{location}', storageScope.location)
                    });
                    if (!silent) {
                        call('showToast', null, t('Directory is not confirmed; saved to browser cache{error}', '目录暂未确认，已保存到浏览器缓存{error}')
                            .replace('{error}', error));
                    }
                    call('renderStatus', null, []);
                    return true;
                }
                if (result.project && typeof result.project === 'object') {
                    currentProject = call('sanitizeProject', result.project, result.project) || result.project;
                    call('setProject', null, currentProject);
                }
                if (result.storage && typeof result.storage === 'object') currentProject.storage = result.storage;
                call('syncCanvasProjectAssetRoot', null, currentProject);
                saveProjectToBrowserCache({ reason: 'bridge_backend_save_ok' });
                if (!silent) {
                    call('showToast', null, t('Canvas saved to {location} · {path}', '画布已保存到 {location} · {path}')
                        .replace('{location}', currentProject.storage?.location || storageScope.location)
                        .replace('{path}', currentProject.storage?.path || storageScope.label));
                }
                call('renderStatus', null, []);
                return true;
            } catch (err) {
                if (typeof scope.warn === 'function') scope.warn('[SimpAI Canvas] save failed:', err);
                else if (typeof console !== 'undefined' && console.warn) console.warn('[SimpAI Canvas] save failed:', err);
                if (!silent) call('showToast', null, t('Save failed: neither directory nor browser cache was confirmed.', '保存失败：目录和浏览器缓存都未确认成功'));
                return false;
            }
        }

        function syncStorageScope(options) {
            const opts = options || {};
            const nextScope = call('getStorageScope', {}, []);
            const nextBaseKey = call('getStorageKey', '', nextScope);
            const currentBaseKey = call('getStorageBaseKey', '', []);
            if (nextBaseKey === currentBaseKey) return false;

            const currentProject = getProject();
            const currentStorageKey = call('getStorageKey', '', []);
            const currentStorageScope = call('getCurrentStorageScope', nextScope, []);
            if (opts.saveCurrent !== false && currentProject && currentProject.nodes) {
                try {
                    currentProject.updated_at = call('nowIso', new Date().toISOString(), []);
                    currentProject.storage = buildProjectStorageInfo(currentStorageKey, currentStorageScope);
                    saveProjectToBrowserCache({ reason: 'storage_scope_switch_save_current' });
                } catch (err) {
                    if (typeof scope.warn === 'function') scope.warn('[SimpAI Canvas] failed to save before scope switch:', err);
                }
            }

            call('setStorageScope', null, nextScope);
            call('setStorageBaseKey', null, nextBaseKey);
            const nextStorageKey = call('initialBrowserStorageKey', nextBaseKey, nextScope);
            call('setStorageKey', null, nextStorageKey);
            call('setBackendLoadedStorageKey', null, '');
            const loaded = call('loadProject', {}, nextStorageKey, call('browserCacheProjectScope', nextScope, nextScope)) || {};
            call('setProject', null, loaded);
            call('setCanvasProjectAssetRoot', null, '');
            call('resetRenderedProjectDomCache', null, []);
            call('resetSelectionState', null, []);
            call('resetHistory', null, []);
            if (call('getRoot', null, [])) call('renderAll', null, []);
            if (!opts.silent) {
                call('showToast', null, t('Canvas storage switched: {scope}', '已切换画布存储：{scope}').replace('{scope}', nextScope.label));
            }
            return true;
        }

        function applyBackendProject(incoming, options, backendFound, scheduleModelChecks) {
            const opts = options || {};
            const decision = browserBackendProjectDecision(incoming, Object.assign({}, opts, { backendFound }));
            const storageScope = call('getStorageScope', {}, []);
            const storageKey = call('getStorageKey', '', []);
            if (decision.keepBrowser) {
                call('syncCanvasProjectAssetRoot', null, getProject());
                call('resetRenderedProjectDomCache', null, []);
                call('setBackendLoadedStorageKey', null, storageKey);
                call('renderAll', null, []);
                if (scheduleModelChecks) call('scheduleAutoPresetModelChecks', null, []);
                if (!opts.silent) call('showToast', null, t('Browser cache is newer; keeping local canvas.', '浏览器缓存更新，保留本地画布。'));
                return true;
            }
            call('setProject', null, incoming);
            call('setActiveBrowserCacheProject', null, incoming.id || projectId(), storageScope);
            call('syncCanvasProjectAssetRoot', null, incoming);
            call('resetRenderedProjectDomCache', null, []);
            saveProjectToBrowserCache({ reason: 'backend_project_load_apply' });
            call('setBackendLoadedStorageKey', null, storageKey);
            call('resetSelectionState', null, []);
            call('resetHistory', null, []);
            call('renderAll', null, []);
            call('resetGalleryFrostReveals', null, []);
            if (scheduleModelChecks) call('scheduleAutoPresetModelChecks', null, []);
            if (!opts.silent) {
                call('showToast', null, t('Loaded canvas from {location}', '已从 {location} 读取画布').replace('{location}', incoming.storage?.location || storageScope.location));
            }
            return true;
        }

        async function loadProjectFromBackend(options) {
            const opts = options || {};
            call('bindCanvasBridgeResponseListener', null, []);
            const storageKey = call('getStorageKey', '', []);
            if (call('getBackendLoadedStorageKey', '', []) === storageKey && !opts.force) return true;

            const currentProject = getProject();
            const projectLoadPayload = { project_id: currentProject.id || projectId() };
            const directLoad = await call('sendCanvasProjectLoadRequest', null, projectLoadPayload);
            if (directLoad && directLoad.ok) {
                const fallback = call('createDefaultProject', {}, []);
                const incoming = call('sanitizeProject', fallback, directLoad.project || fallback) || fallback;
                if (directLoad.storage && typeof directLoad.storage === 'object') incoming.storage = directLoad.storage;
                return applyBackendProject(incoming, opts, directLoad.found !== false, true);
            }
            if (!call('isCanvasBridgeReady', false, [])) {
                if (!opts.silent) {
                    call('showToast', null, t('Backend save bridge is not ready; using {location}', '后端保存桥未就绪，正在使用 {location}').replace('{location}', call('getStorageScope', {}, []).cacheLocation));
                }
                return false;
            }
            if (call('getBackendLoadedStorageKey', '', []) === storageKey && !opts.force) return true;
            let result = await call('sendCanvasProjectLoadRequest', null, projectLoadPayload);
            if ((!result || !result.ok) && call('isCanvasBridgeReady', false, [])) {
                result = await call('sendCanvasBridgeRequest', null, 'load_project', projectLoadPayload, 45000);
            }
            if (!result || !result.ok) {
                if (!opts.silent) {
                    call('showToast', null, t('Project load from directory failed; using local cache{error}', '目录项目读取失败，正在使用本地缓存{error}')
                        .replace('{error}', result && result.error ? `: ${result.error}` : ''));
                }
                return false;
            }
            if (!result.project || typeof result.project !== 'object') return false;
            const fallback = call('createDefaultProject', {}, []);
            const incoming = call('sanitizeProject', fallback, result.project) || fallback;
            if (result.storage && typeof result.storage === 'object') incoming.storage = result.storage;
            return applyBackendProject(incoming, opts, result.found !== false, false);
        }

        return {
            browserBackendProjectDecision,
            saveProject,
            saveProjectToBrowserCache,
            buildProjectStorageInfo,
            syncStorageScope,
            loadProjectFromBackend
        };
    }

    window.SimpAICanvasWorkbenchProjectPersistence = Object.assign({}, window.SimpAICanvasWorkbenchProjectPersistence || {}, {
        createCanvasProjectPersistenceController
    });
})();
