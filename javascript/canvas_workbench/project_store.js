(function () {
    'use strict';

    function createLoadedController(globalName, factoryName) {
        const module = window[globalName] || {};
        const create = module[factoryName];
        return typeof create === 'function' ? (create({}) || {}) : {};
    }

    function createDefaultProjectStoreSource() {
        const utils = window.SimpAICanvasWorkbenchUtils || {};
        return {
            languageSource: {
                t: utils.t,
                getUiLang: utils.getUiLang
            },
            utilitySource: {
                nowIso: utils.nowIso,
                clamp: utils.clamp,
                sanitizeStoragePart: utils.sanitizeStoragePart,
                shortIdentity: utils.shortIdentity
            },
            systemSource: {
                getSystemParams: () => window.simpleaiTopbarSystemParams
            },
            storageSource: {
                getStorage: () => typeof localStorage !== 'undefined' ? localStorage : null
            },
            registrySource: {
                defaultNodeSize: (...args) => {
                    const registry = window.SimpAICanvasWorkbenchRegistry || {};
                    return typeof registry.defaultNodeSize === 'function'
                        ? registry.defaultNodeSize(...args)
                        : undefined;
                }
            },
            projectPatchSource: {
                controller: createLoadedController(
                    'SimpAICanvasWorkbenchProjectPatchFactory',
                    'createCanvasProjectPatchFactoryController'
                )
            },
            runRecordSource: {
                controller: createLoadedController(
                    'SimpAICanvasWorkbenchRunRecordFactory',
                    'createCanvasRunRecordFactoryController'
                )
            },
            nodeFactorySource: {
                controller: createLoadedController(
                    'SimpAICanvasWorkbenchNodeFactory',
                    'createCanvasNodeFactoryController'
                )
            },
            groupFactorySource: {
                controller: createLoadedController(
                    'SimpAICanvasWorkbenchGroupFactory',
                    'createCanvasGroupFactoryController'
                )
            },
            batchAnyFactorySource: {
                controller: createLoadedController(
                    'SimpAICanvasWorkbenchBatchAnyNodeFactory',
                    'createCanvasBatchAnyNodeFactoryController'
                )
            },
            textNodeFactorySource: {
                controller: createLoadedController(
                    'SimpAICanvasWorkbenchTextNodeFactory',
                    'createCanvasTextNodeFactoryController'
                )
            },
            auxNodeFactorySource: {
                controller: createLoadedController(
                    'SimpAICanvasWorkbenchAuxNodeFactory',
                    'createCanvasAuxNodeFactoryController'
                )
            },
            batchJobFactorySource: {
                controller: createLoadedController(
                    'SimpAICanvasWorkbenchBatchJobFactory',
                    'createCanvasBatchJobFactoryController'
                )
            },
            vlmChatStateSource: {
                controller: createLoadedController(
                    'SimpAICanvasWorkbenchVlmChatStateFactory',
                    'createCanvasVlmChatStateFactoryController'
                )
            },
            compareSource: {
                buildCompareStatePatch: (...args) => {
                    const compare = window.SimpAICanvasWorkbenchCompareNode || {};
                    return typeof compare.buildCompareStatePatch === 'function'
                        ? compare.buildCompareStatePatch(...args)
                        : undefined;
                }
            },
            diagnosticsSource: {
                warn: (...args) => console.warn(...args)
            }
        };
    }

    function createCanvasProjectStoreController(context) {
        const scope = context?.projectStoreSource || context || {};
        const configSource = scope.configSource || {};
        const languageSource = scope.languageSource || {};
        const utilitySource = scope.utilitySource || {};
        const systemSource = scope.systemSource || {};
        const storageSource = scope.storageSource || {};
        const registrySource = scope.registrySource || {};
        const builderSource = scope.builderSource || {};
        const projectPatchSource = scope.projectPatchSource || {};
        const runRecordSource = scope.runRecordSource || {};
        const nodeFactorySource = scope.nodeFactorySource || {};
        const groupFactorySource = scope.groupFactorySource || {};
        const batchAnyFactorySource = scope.batchAnyFactorySource || {};
        const textNodeFactorySource = scope.textNodeFactorySource || {};
        const auxNodeFactorySource = scope.auxNodeFactorySource || {};
        const batchJobFactorySource = scope.batchJobFactorySource || {};
        const vlmChatStateSource = scope.vlmChatStateSource || {};
        const compareSource = scope.compareSource || {};
        const diagnosticsSource = scope.diagnosticsSource || {};
        const nowIso = typeof utilitySource.nowIso === 'function'
            ? utilitySource.nowIso
            : (() => new Date().toISOString());
        const clamp = typeof utilitySource.clamp === 'function'
            ? utilitySource.clamp
            : ((value, min, max) => Math.max(min, Math.min(max, value)));
        const sanitizeStoragePart = typeof utilitySource.sanitizeStoragePart === 'function'
            ? utilitySource.sanitizeStoragePart
            : ((value) => String(value || 'guest').replace(/[^a-zA-Z0-9_.:-]/g, '_') || 'guest');
        const shortIdentity = typeof utilitySource.shortIdentity === 'function'
            ? utilitySource.shortIdentity
            : ((value) => String(value || 'guest'));
        const t = typeof languageSource.t === 'function'
            ? languageSource.t
            : ((en, cn) => cn || en);
        const getUiLang = typeof languageSource.getUiLang === 'function'
            ? languageSource.getUiLang
            : (() => 'en');
        const getSystemParams = typeof systemSource.getSystemParams === 'function'
            ? systemSource.getSystemParams
            : () => window.simpleaiTopbarSystemParams;
        const getStorage = typeof storageSource.getStorage === 'function'
            ? storageSource.getStorage
            : () => typeof localStorage !== 'undefined' ? localStorage : null;
        const defaultNodeSizeFromRegistry = typeof registrySource.defaultNodeSize === 'function'
            ? registrySource.defaultNodeSize
            : null;
        const warn = typeof diagnosticsSource.warn === 'function'
            ? diagnosticsSource.warn
            : (...args) => console.warn(...args);
        const projectPatchController = projectPatchSource.controller || {};
        const runRecordController = runRecordSource.controller || {};
        const nodeFactoryController = nodeFactorySource.controller || {};
        const groupFactoryController = groupFactorySource.controller || {};
        const batchAnyFactoryController = batchAnyFactorySource.controller || {};
        const textNodeFactoryController = textNodeFactorySource.controller || {};
        const auxNodeFactoryController = auxNodeFactorySource.controller || {};
        const batchJobFactoryController = batchJobFactorySource.controller || {};
        const vlmChatStateController = vlmChatStateSource.controller || {};
        const compareController = compareSource.controller || {};
        const configuredProjectId = typeof configSource.getDefaultProjectId === 'function'
            ? configSource.getDefaultProjectId()
            : configSource.defaultProjectId;
        const PROJECT_ID = String(configuredProjectId || 'default');
        const configuredSettings = configSource.defaultSettings || scope.defaultSettings;
        const DEFAULT_SETTINGS = Object.assign({
            __lang: getUiLang(),
            grid: true,
            snap: false,
            minimap: true,
            edgeLabels: true,
            reducedMotion: false,
            inspectorCollapsed: false
        }, isPatchObject(configuredSettings) ? configuredSettings : {});
        const LEGACY_STORAGE_KEY = 'simpai.infiniteCanvasWorkbench.v1';
        const STORAGE_KEY_PREFIX = 'simpai.infiniteCanvasWorkbench.v1';

        function injectedBuilder(name) {
            const source = typeof builderSource.getProjectStoreOptions === 'function'
                ? builderSource.getProjectStoreOptions()
                : builderSource;
            return source && typeof source[name] === 'function' ? source[name] : null;
        }

        function resolveBuilder(options, name, source, controller, fallback) {
            if (typeof options?.[name] === 'function') return options[name];
            const injected = injectedBuilder(name);
            if (injected) return injected;
            if (typeof source?.[name] === 'function') return source[name];
            if (typeof controller?.[name] === 'function') return controller[name];
            return fallback;
        }

    function getCanvasTitle() {
        return t('SimpAI Infinite Canvas', 'SimpAI 无限画布');
    }

    function getStorageScope() {
        const paramsValue = getSystemParams();
        const params = paramsValue && typeof paramsValue === 'object' ? paramsValue : {};
        const accessMode = String(params.access_mode || '').toLowerCase();
        const role = String(params.user_role || '').toLowerCase();
        const userDid = String(params.user_did || '').trim();
        const isLocal = accessMode === 'local' || role === 'local';
        const mode = isLocal ? 'local' : 'multi';
        const owner = isLocal ? 'local' : sanitizeStoragePart(userDid || role || 'guest');
        const roleLabel = isLocal ? t('Local mode', 'Local 模式') : (role ? `${role} ${t('user', '用户')}` : t('Multi-user mode', '多用户模式'));
        const ownerLabel = isLocal ? t('Current browser', '当前浏览器') : shortIdentity(userDid || role || 'guest');
        return {
            mode,
            owner,
            label: `${roleLabel} / ${ownerLabel}`,
            location: t('User directory', '用户目录'),
            cacheLocation: t('Browser localStorage cache', '浏览器 localStorage 缓存'),
            allowLegacyFallback: isLocal
        };
    }

    function getStorageKey(scope) {
        const s = scope || getStorageScope();
        return `${STORAGE_KEY_PREFIX}:${sanitizeStoragePart(s.mode)}:${sanitizeStoragePart(s.owner)}`;
    }

    function defaultNodeSize(type) {
        const REGISTRY = window.SimpAICanvasWorkbenchRegistry || {};
        if (typeof REGISTRY.defaultNodeSize === 'function') return REGISTRY.defaultNodeSize(type);
        if (type === 'image') return { w: 264, h: 300 };
        if (type === 'note') return { w: 280, h: 180 };
        return { w: 220, h: 250 };
    }

    function isPatchObject(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value);
    }

    function createDefaultProject(options) {
        const opts = options || {};
        const buildProjectDefaultPatch = resolveBuilder(
            opts,
            'buildProjectDefaultPatch',
            projectPatchSource,
            projectPatchController,
            null
        );
        if (buildProjectDefaultPatch) {
            const projectDefaultPatch = buildProjectDefaultPatch({
                projectId: opts.projectId || PROJECT_ID,
                schema: 'simpai.canvas.workbench.v1',
                defaultTitle: 'Untitled Canvas',
                nowIso,
                defaultSettings: opts.defaultSettings || DEFAULT_SETTINGS
            });
            if (isPatchObject(projectDefaultPatch) && Object.keys(projectDefaultPatch).length) {
                return projectDefaultPatch;
            }
        }
        return {
            schema: 'simpai.canvas.workbench.v1',
            id: opts.projectId || PROJECT_ID,
            title: 'Untitled Canvas',
            created_at: nowIso(),
            updated_at: nowIso(),
            viewport: { x: 80, y: 80, zoom: 1 },
            settings: Object.assign({}, opts.defaultSettings || DEFAULT_SETTINGS),
            groups: [],
            nodes: [],
            edges: [],
            runs: [],
            batch_jobs: []
        };
    }

    function buildDefaultProjectStorageInfoPatch(key, scope, options) {
        const config = options || {};
        const currentScope = scope || getStorageScope();
        const translate = typeof config.t === 'function' ? config.t : t;
        return {
            kind: 'browser_local_storage_cache',
            key,
            scope: currentScope.mode,
            owner: currentScope.owner,
            label: currentScope.label,
            location: currentScope.cacheLocation || translate('Browser localStorage cache', '浏览器 localStorage 缓存'),
            migrated_from_legacy: !!config.migrated
        };
    }

    function sanitizeProject(raw, options) {
        const opts = options || {};
        const settings = opts.defaultSettings || DEFAULT_SETTINGS;
        const nodeSize = typeof opts.defaultNodeSize === 'function' ? opts.defaultNodeSize : defaultNodeSize;
        const buildNodeLayoutPatch = resolveBuilder(
            opts,
            'buildNodeLayoutPatch',
            nodeFactorySource,
            nodeFactoryController,
            (_node, patch) => Object.assign({}, patch || {})
        );
        const buildGroupFieldPatch = resolveBuilder(
            opts,
            'buildGroupFieldPatch',
            groupFactorySource,
            groupFactoryController,
            (_group, key, value) => ({ [key]: value })
        );
        const buildGroupIdPatch = resolveBuilder(
            opts,
            'buildGroupIdPatch',
            groupFactorySource,
            groupFactoryController,
            (group, options) => ({ id: group?.id || options?.fallbackId || '' })
        );
        const buildDefaultProjectCollectionsPatch = (project) => ({
            groups: Array.isArray(project?.groups) ? project.groups : [],
            nodes: Array.isArray(project?.nodes) ? project.nodes : [],
            edges: Array.isArray(project?.edges) ? project.edges : [],
            runs: Array.isArray(project?.runs) ? project.runs : [],
            batch_jobs: Array.isArray(project?.batch_jobs) ? project.batch_jobs : []
        });
        const buildProjectCollectionsPatch = resolveBuilder(
            opts,
            'buildProjectCollectionsPatch',
            projectPatchSource,
            projectPatchController,
            buildDefaultProjectCollectionsPatch
        );
        const buildProjectMetadataPatch = resolveBuilder(
            opts,
            'buildProjectMetadataPatch',
            projectPatchSource,
            projectPatchController,
            (project, options) => {
                const config = options || {};
                const stamp = typeof config.nowIso === 'function' ? config.nowIso : nowIso;
                return {
                    schema: project?.schema || config.schema || 'simpai.canvas.workbench.v1',
                    title: project?.title || config.defaultTitle || 'Untitled Canvas',
                    created_at: project?.created_at || stamp(),
                    updated_at: project?.updated_at || stamp()
                };
            }
        );
        const buildProjectViewportPatch = resolveBuilder(
            opts,
            'buildProjectViewportPatch',
            projectPatchSource,
            projectPatchController,
            (project, options) => {
                const config = options || {};
                const viewport = Object.assign({ x: 80, y: 80, zoom: 1 }, project?.viewport || {});
                viewport.zoom = clamp(Number(viewport.zoom) || 1, Number(config.minZoom ?? 0.15), Number(config.maxZoom ?? 3));
                return { viewport };
            }
        );
        const buildProjectSettingsPatch = resolveBuilder(
            opts,
            'buildProjectSettingsPatch',
            projectPatchSource,
            projectPatchController,
            (project, options) => {
                const config = options || {};
                const settings = Object.assign({}, config.defaultSettings || {}, project?.settings || {});
                if (!settings.__minimap_initialized) {
                    settings.minimap = true;
                    settings.__minimap_initialized = true;
                }
                return { settings };
            }
        );
        const buildStatePatchFallback = (_node, options) => {
            const statePatch = options?.statePatch;
            return isPatchObject(statePatch)
                ? Object.assign({}, statePatch)
                : {};
        };
        const buildCompareStatePatch = resolveBuilder(
            opts,
            'buildCompareStatePatch',
            compareSource,
            compareController,
            buildStatePatchFallback
        );
        const buildBatchAnyStatePatch = resolveBuilder(
            opts,
            'buildBatchAnyStatePatch',
            batchAnyFactorySource,
            batchAnyFactoryController,
            buildStatePatchFallback
        );
        const buildBatchAnyLegacyTypePatch = resolveBuilder(
            opts,
            'buildBatchAnyLegacyTypePatch',
            batchAnyFactorySource,
            batchAnyFactoryController,
            (_node) => ({ type: 'batch_any' })
        );
        const buildTextMergeStatePatch = resolveBuilder(
            opts,
            'buildTextMergeStatePatch',
            textNodeFactorySource,
            textNodeFactoryController,
            buildStatePatchFallback
        );
        const buildNoteStatePatch = resolveBuilder(
            opts,
            'buildNoteStatePatch',
            auxNodeFactorySource,
            auxNodeFactoryController,
            buildStatePatchFallback
        );
        const buildBatchJobStatePatch = resolveBuilder(
            opts,
            'buildBatchJobStatePatch',
            batchJobFactorySource,
            batchJobFactoryController,
            (job, options) => {
                const config = options || {};
                return {
                    id: job?.id || config.fallbackId || '',
                    script: job?.script || config.defaultScript || 'X/Y/Z plot',
                    axes: Array.isArray(job?.axes) ? job.axes : [],
                    variants: Array.isArray(job?.variants) ? job.variants : [],
                    run_ids: Array.isArray(job?.run_ids) ? job.run_ids : [],
                    status: job?.status || config.defaultStatus || 'planned'
                };
            }
        );
        const applyNodeLayoutPatch = (node, patch) => {
            const nextPatch = buildNodeLayoutPatch(node, patch || {});
            if (isPatchObject(nextPatch)) Object.assign(node, nextPatch);
        };
        const applyGroupFieldPatch = (group, key, value) => {
            const patch = buildGroupFieldPatch(group, key, value);
            if (isPatchObject(patch)) Object.assign(group, patch);
        };
        const next = raw && typeof raw === 'object' ? raw : createDefaultProject(opts);
        const projectMetadataPatch = buildProjectMetadataPatch(next, {
            nowIso,
            schema: 'simpai.canvas.workbench.v1',
            defaultTitle: 'Untitled Canvas'
        });
        if (isPatchObject(projectMetadataPatch)) Object.assign(next, projectMetadataPatch);
        const viewportPatch = buildProjectViewportPatch(next, { clamp, minZoom: 0.15, maxZoom: 3 });
        if (isPatchObject(viewportPatch)) Object.assign(next, viewportPatch);
        const settingsPatch = buildProjectSettingsPatch(next, { defaultSettings: settings });
        if (isPatchObject(settingsPatch)) Object.assign(next, settingsPatch);
        const collectionsPatch = buildProjectCollectionsPatch(next);
        const fallbackCollectionsPatch = buildDefaultProjectCollectionsPatch(next);
        const usableCollectionsPatch = isPatchObject(collectionsPatch)
            ? Object.assign({}, fallbackCollectionsPatch, collectionsPatch)
            : fallbackCollectionsPatch;
        ['groups', 'nodes', 'edges', 'runs', 'batch_jobs'].forEach((key) => {
            if (!Array.isArray(usableCollectionsPatch[key])) usableCollectionsPatch[key] = fallbackCollectionsPatch[key];
        });
        Object.assign(next, usableCollectionsPatch);
        next.groups.forEach((group, index) => {
            if (!group || typeof group !== 'object') return;
            const groupIdPatch = buildGroupIdPatch(group, { fallbackId: `group_${index + 1}` });
            if (isPatchObject(groupIdPatch)) Object.assign(group, groupIdPatch);
            applyGroupFieldPatch(group, 'title', group.title || t('Group', '分组'));
            applyGroupFieldPatch(group, 'x', Number.isFinite(Number(group.x)) ? Math.round(Number(group.x)) : 0);
            applyGroupFieldPatch(group, 'y', Number.isFinite(Number(group.y)) ? Math.round(Number(group.y)) : 0);
            applyGroupFieldPatch(group, 'w', Math.max(180, Math.round(Number(group.w || 360))));
            applyGroupFieldPatch(group, 'h', Math.max(120, Math.round(Number(group.h || 240))));
            applyGroupFieldPatch(group, 'color', group.color || '#14b8a6');
            applyGroupFieldPatch(group, 'alpha', clamp(Number(group.alpha ?? 0.16), 0.04, 0.72));
            applyGroupFieldPatch(group, 'shortcut', group.shortcut || '');
            applyGroupFieldPatch(group, 'locked', !!group.locked);
        });
        next.nodes.forEach((node) => {
            if (node && node.type === 'batch_images') {
                const batchTypePatch = buildBatchAnyLegacyTypePatch(node);
                if (isPatchObject(batchTypePatch)) Object.assign(node, batchTypePatch);
            }
            if (node && node.type === 'image') {
                const layoutPatch = {};
                if (!node.w || Number(node.w) <= 220) layoutPatch.w = 264;
                if (!node.h || Number(node.h) <= 250) layoutPatch.h = 300;
                applyNodeLayoutPatch(node, layoutPatch);
            }
            if (node && node.type === 'video') {
                const layoutPatch = {};
                if (!node.w || Number(node.w) <= 260) layoutPatch.w = 340;
                if (!node.h || Number(node.h) <= 240) layoutPatch.h = 320;
                applyNodeLayoutPatch(node, layoutPatch);
            }
            if (node && node.type === 'audio') {
                const layoutPatch = {};
                if (!node.w || Number(node.w) <= 260) layoutPatch.w = 320;
                if (!node.h || Number(node.h) <= 180) layoutPatch.h = 220;
                applyNodeLayoutPatch(node, layoutPatch);
            }
            if (node && node.type === 'compare') {
                const size = nodeSize('compare');
                const layoutPatch = {};
                if (!node.w || Number(node.w) < size.w) layoutPatch.w = size.w;
                if (!node.h || Number(node.h) < size.h) layoutPatch.h = size.h;
                applyNodeLayoutPatch(node, layoutPatch);
                const comparePatch = buildCompareStatePatch(node, {
                    statePatch: {
                        inputs: Object.assign({ a: null, b: null }, node.inputs || {}),
                        params: Object.assign({ position: 50, mode: 'fit' }, node.params || {})
                    }
                });
                if (isPatchObject(comparePatch)) Object.assign(node, comparePatch);
            }
            if (node && node.type === 'batch_any') {
                const size = nodeSize('batch_any');
                const layoutPatch = {};
                if (!node.w || Number(node.w) < size.w) layoutPatch.w = size.w;
                if (!node.h || Number(node.h) < size.h) layoutPatch.h = size.h;
                applyNodeLayoutPatch(node, layoutPatch);
                const items = Array.isArray(node.items)
                    ? node.items.filter(item => item && typeof item === 'object')
                    : [];
                const currentIndex = clamp(Number(node.current_index || 0), 0, Math.max(items.length - 1, 0));
                const mediaKind = node.media_kind || items[0]?.media_kind || '';
                const currentItem = items[currentIndex] || null;
                const batchStatePatch = {
                    media_kind: mediaKind,
                    items,
                    current_index: currentIndex,
                    params: Object.assign({ stop_on_error: true }, node.params || {}),
                    batch: Object.assign({ state: 'idle', run_ids: [], last_error: '' }, node.batch || {}),
                    asset: currentItem?.asset || null
                };
                if ((currentItem?.media_kind || mediaKind) === 'text') {
                    const textValue = typeof currentItem?.text === 'string'
                        ? currentItem.text
                        : (currentItem?.text && typeof currentItem.text === 'object' ? String(currentItem.text.value || '') : '');
                    batchStatePatch.text = Object.assign({}, node.text || {}, { value: textValue, updated_at: currentItem?.text?.updated_at || currentItem?.added_at || '' });
                }
                const batchPatch = buildBatchAnyStatePatch(node, { statePatch: batchStatePatch });
                if (isPatchObject(batchPatch)) Object.assign(node, batchPatch);
            }
            if (node && node.type === 'tag_cart') {
                const size = nodeSize('tag_cart');
                const layoutPatch = {};
                if (!node.w || Number(node.w) < size.w) layoutPatch.w = size.w;
                if (!node.h || Number(node.h) < size.h) layoutPatch.h = size.h;
                applyNodeLayoutPatch(node, layoutPatch);
            }
            if (node && node.type === 'text_merge') {
                const size = nodeSize('text_merge');
                const layoutPatch = {};
                if (!node.w || Number(node.w) < size.w) layoutPatch.w = size.w;
                if (!node.h || Number(node.h) < size.h) layoutPatch.h = size.h;
                applyNodeLayoutPatch(node, layoutPatch);
                const inputSlots = Array.isArray(node.input_slots) && node.input_slots.length
                    ? Array.from(new Set(node.input_slots.map(slot => String(slot || '').trim()).filter(Boolean)))
                    : ['input_1', 'input_2'];
                const textInputs = node.text_inputs && typeof node.text_inputs === 'object' && !Array.isArray(node.text_inputs)
                    ? node.text_inputs
                    : {};
                const textMergePatch = buildTextMergeStatePatch(node, {
                    statePatch: {
                        input_slots: inputSlots,
                        text_inputs: textInputs,
                        params: Object.assign({ separator: '' }, node.params || {})
                    }
                });
                if (isPatchObject(textMergePatch)) Object.assign(node, textMergePatch);
            }
            if (node && node.type === 'note') {
                const layoutPatch = {};
                if (!node.w || Number(node.w) < 180) layoutPatch.w = 260;
                if (!node.h || Number(node.h) < 120) layoutPatch.h = 160;
                applyNodeLayoutPatch(node, layoutPatch);
                const noteStyle = Object.assign({
                    color: '#f8fafc',
                    background: '#164e63',
                    font_size: 14
                }, node.style || {});
                noteStyle.font_size = clamp(Number(noteStyle.font_size || 14), 10, 42);
                const noteStatePatch = {
                    text: String(node.text ?? ''),
                    style: noteStyle
                };
                if (node.tail && typeof node.tail === 'object') {
                    const target = node.tail.target && typeof node.tail.target === 'object' ? node.tail.target : {};
                    const normalizedTail = {
                        enabled: !!node.tail.enabled,
                        target: {
                            x: Number.isFinite(Number(target.x)) ? Math.round(Number(target.x)) : Math.round(Number(node.x || 0) + Number(node.w || 260) + 130),
                            y: Number.isFinite(Number(target.y)) ? Math.round(Number(target.y)) : Math.round(Number(node.y || 0) + Number(node.h || 160) * 0.45)
                        }
                    };
                    noteStatePatch.tail = normalizedTail;
                }
                const notePatch = buildNoteStatePatch(node, {
                    statePatch: noteStatePatch,
                    ...(noteStatePatch.tail ? { tail: noteStatePatch.tail } : {})
                });
                if (isPatchObject(notePatch)) Object.assign(node, notePatch);
            }
        });
        next.batch_jobs.forEach((job, index) => {
            if (!job || typeof job !== 'object') return;
            const batchJobPatch = buildBatchJobStatePatch(job, { index });
            if (isPatchObject(batchJobPatch)) Object.assign(job, batchJobPatch);
        });
        return next;
    }

    function buildProjectStorageInfo(key, scope, migrated, options) {
        const currentScope = scope || getStorageScope();
        const config = options || {};
        const patchBuilder = resolveBuilder(
            config,
            'buildProjectStorageInfoPatch',
            projectPatchSource,
            projectPatchController,
            buildDefaultProjectStorageInfoPatch
        );
        const patch = patchBuilder(key, currentScope, { t, migrated: !!migrated });
        return isPatchObject(patch)
            ? patch
            : buildDefaultProjectStorageInfoPatch(key, currentScope, { t, migrated: !!migrated });
    }

    function buildDefaultProjectStoragePatch(project, storage, options) {
        const config = options || {};
        const nextStorage = storage && typeof storage === 'object' && !Array.isArray(storage)
            ? Object.assign({}, storage)
            : {};
        const storedStorage = config.storedStorage && typeof config.storedStorage === 'object' && !Array.isArray(config.storedStorage)
            ? config.storedStorage
            : project?.storage;
        if (config.preserveAssetRoot && storedStorage?.asset_root) nextStorage.asset_root = storedStorage.asset_root;
        return { storage: nextStorage };
    }

    function loadProject(key, scope, options) {
        const config = options || {};
        const storageInfo = (migrated) => buildProjectStorageInfo(key, scope, migrated, options);
        const buildProjectStoragePatch = resolveBuilder(
            config,
            'buildProjectStoragePatch',
            projectPatchSource,
            projectPatchController,
            buildDefaultProjectStoragePatch
        );
        const applyStoragePatch = (loaded, storage, storedStorage) => {
            const patch = buildProjectStoragePatch(loaded, storage, {
                preserveAssetRoot: true,
                storedStorage
            });
            const usablePatch = patch
                && typeof patch === 'object'
                && Object.prototype.hasOwnProperty.call(patch, 'storage')
                && patch.storage
                && typeof patch.storage === 'object'
                && !Array.isArray(patch.storage)
                ? patch
                : buildDefaultProjectStoragePatch(loaded, storage, { preserveAssetRoot: true, storedStorage });
            Object.assign(loaded, usablePatch);
            return loaded;
        };
        const applyLoadedStorage = (loaded, migrated) => {
            const storedStorage = loaded.storage && typeof loaded.storage === 'object' ? loaded.storage : {};
            return applyStoragePatch(loaded, storageInfo(migrated), storedStorage);
        };
        const createFallbackProject = (migrated) => {
            const next = createDefaultProject(options);
            return applyStoragePatch(next, storageInfo(migrated), {});
        };
        try {
            const storage = getStorage();
            const text = storage.getItem(key);
            if (text) {
                return applyLoadedStorage(sanitizeProject(JSON.parse(text), options), false);
            }
            if (scope && scope.allowLegacyFallback) {
                const legacy = storage.getItem(LEGACY_STORAGE_KEY);
                if (legacy) {
                    return applyLoadedStorage(sanitizeProject(JSON.parse(legacy), options), true);
                }
            }
            return createFallbackProject(false);
        } catch (err) {
            warn('[SimpAI Canvas] failed to load project:', err);
        }
        return createFallbackProject(false);
    }

    function cloneJson(value, fallback) {
        try {
            return JSON.parse(JSON.stringify(value ?? fallback));
        } catch (err) {
            return fallback;
        }
    }

    function compactProjectForStorage(source, options) {
        const opts = options || {};
        const maxInline = Number(opts.maxInlineDataUrlChars ?? 1800000);
        const cloneValue = typeof opts.cloneValue === 'function' ? opts.cloneValue : cloneJson;
        const buildVlmChatStoragePatch = resolveBuilder(
            opts,
            'buildVlmChatStoragePatch',
            vlmChatStateSource,
            vlmChatStateController,
            null
        );
        const next = cloneValue(source || createDefaultProject(opts), createDefaultProject(opts));
        const compactAsset = (asset) => {
            if (!asset || typeof asset !== 'object') return;
            const hasFileRef = !!(asset.path || asset.output_path || asset.preview_url || asset.original_output_path || asset.asset_relative_path || asset.relative_path);
            const dataUrlLength = String(asset.data_url || '').length;
            const shouldStrip = (opts.stripAllMaterializedDataUrls && hasFileRef) || dataUrlLength > maxInline;
            if (shouldStrip) delete asset.data_url;
            if ((opts.stripAllMaterializedDataUrls && hasFileRef) || String(asset.thumb || '').length > maxInline) delete asset.thumb;
        };
        const buildDefaultProjectNodeStoragePatch = (node, storageOptions) => {
            const config = storageOptions || {};
            const storedNode = cloneValue(node || {}, {});
            const compactNodeAsset = (asset) => {
                if (asset && typeof asset === 'object') compactAsset(asset);
            };
            compactNodeAsset(storedNode.asset);
            if (Array.isArray(storedNode.assets)) storedNode.assets.forEach(compactNodeAsset);
            compactNodeAsset(storedNode.preview);
            if (typeof config.buildVlmChatStoragePatch === 'function') {
                const chatPatch = config.buildVlmChatStoragePatch(storedNode, {
                    compactAsset,
                    maxInlineDataUrlChars: maxInline,
                    stripAllMaterializedDataUrls: !!opts.stripAllMaterializedDataUrls
                });
                if (isPatchObject(chatPatch) && isPatchObject(chatPatch.chat)) {
                    storedNode.chat = cloneValue(chatPatch.chat, chatPatch.chat);
                }
            }
            if (storedNode.last_response) delete storedNode.last_response;
            const hasMaterializedAsset = !!(storedNode.asset && (storedNode.asset.path || storedNode.asset.output_path || storedNode.asset.preview_url || storedNode.asset.original_output_path || storedNode.asset.asset_relative_path || storedNode.asset.relative_path))
                || (Array.isArray(storedNode.assets) && storedNode.assets.some(asset => asset && (asset.path || asset.output_path || asset.preview_url || asset.original_output_path || asset.asset_relative_path || asset.relative_path)));
            if (opts.stripAllMaterializedDataUrls && hasMaterializedAsset && storedNode.preview) {
                delete storedNode.preview.data_url;
                delete storedNode.preview.thumb;
            }
            if (Object.prototype.hasOwnProperty.call(storedNode, 'preview_frames')) delete storedNode.preview_frames;
            if (Object.prototype.hasOwnProperty.call(storedNode, 'preview_step_key')) delete storedNode.preview_step_key;
            if (storedNode.mask && (storedNode.mask.path || storedNode.mask.preview_url || String(storedNode.mask.data_url || '').length > maxInline)) {
                delete storedNode.mask.data_url;
            }
            if (storedNode.source?.dry_run?.task_args_preview) delete storedNode.source.dry_run.task_args_preview;
            if (Array.isArray(storedNode.run_events) && storedNode.run_events.length > 8) storedNode.run_events = storedNode.run_events.slice(-8);
            if (storedNode.error_details?.traceback) delete storedNode.error_details.traceback;
            return { node: storedNode };
        };
        const buildDefaultRunStoragePatch = (run, runOptions) => {
            const config = runOptions || {};
            const compactRun = {
                id: run?.id || '',
                state: run?.state || run?.status || '',
                preset_node_id: run?.preset_node_id || '',
                qwen_tts_node_id: run?.qwen_tts_node_id || '',
                producer_node_id: run?.producer_node_id || '',
                producer_type: run?.producer_type || '',
                mode: run?.mode || '',
                placeholder_node_id: run?.placeholder_node_id || '',
                task_id: run?.task_id || '',
                backend: run?.backend || '',
                message: run?.message || '',
                percent: run?.percent ?? null,
                resolved_seed: run?.resolved_seed ?? null,
                input_count: run?.input_count ?? null,
                output_count: run?.output_count ?? null,
                created_at: run?.created_at || '',
                finished_at: run?.finished_at || '',
                updated_at: run?.updated_at || '',
                error: run?.error || '',
                details: run?.details || ''
            };
            if (run?.asset) {
                compactRun.asset = cloneValue(run.asset, {});
                compactAsset(compactRun.asset);
            }
            if (Array.isArray(run?.assets) && run.assets.length) {
                compactRun.assets = run.assets.map(asset => cloneValue(asset, {}));
                compactRun.assets.forEach(compactAsset);
            }
            return { run: compactRun };
        };
        const buildProjectNodeStoragePatch = resolveBuilder(
            opts,
            'buildProjectNodeStoragePatch',
            projectPatchSource,
            projectPatchController,
            buildDefaultProjectNodeStoragePatch
        );
        const buildRunStoragePatch = resolveBuilder(
            opts,
            'buildRunStoragePatch',
            runRecordSource,
            runRecordController,
            buildDefaultRunStoragePatch
        );
        const buildProjectNodesPatch = resolveBuilder(
            opts,
            'buildProjectNodesPatch',
            projectPatchSource,
            projectPatchController,
            (_project, nodes) => ({ nodes: Array.isArray(nodes) ? nodes : [] })
        );
        const buildProjectRunsPatch = resolveBuilder(
            opts,
            'buildProjectRunsPatch',
            projectPatchSource,
            projectPatchController,
            (_project, runs) => ({ runs: Array.isArray(runs) ? runs : [] })
        );
        if (next.storage && opts.stripStorage !== false) delete next.storage;
        const compactedNodes = (Array.isArray(next.nodes) ? next.nodes : []).map((node) => {
            const patch = buildProjectNodeStoragePatch(node, {
                buildVlmChatStoragePatch,
                compactAsset,
                maxInlineDataUrlChars: maxInline,
                stripAllMaterializedDataUrls: !!opts.stripAllMaterializedDataUrls
            });
            return isPatchObject(patch) && isPatchObject(patch.node)
                ? patch.node
                : node;
        });
        const nodesPatch = buildProjectNodesPatch(next, compactedNodes);
        Object.assign(next, isPatchObject(nodesPatch) && Array.isArray(nodesPatch.nodes)
            ? nodesPatch
            : { nodes: compactedNodes });
        const runLimit = Math.max(0, Number(opts.runHistoryLimit ?? 12));
        const sourceRuns = Array.isArray(next.runs) ? next.runs : [];
        const compactedRuns = (runLimit ? sourceRuns.slice(-runLimit) : []).map((run) => {
            const patch = buildRunStoragePatch(run, {
                compactAsset,
                maxInlineDataUrlChars: maxInline,
                stripAllMaterializedDataUrls: !!opts.stripAllMaterializedDataUrls
            });
            return isPatchObject(patch) && isPatchObject(patch.run)
                ? patch.run
                : run;
        });
        const runsPatch = buildProjectRunsPatch(next, compactedRuns);
        Object.assign(next, isPatchObject(runsPatch) && Array.isArray(runsPatch.runs)
            ? runsPatch
            : { runs: compactedRuns });
        return next;
    }

        return {
            LEGACY_STORAGE_KEY,
            STORAGE_KEY_PREFIX,
            PROJECT_ID,
            DEFAULT_SETTINGS,
            getCanvasTitle,
            getStorageScope,
            getStorageKey,
            createDefaultProject,
            sanitizeProject,
            loadProject,
            compactProjectForStorage,
            buildProjectStorageInfo
        };
    }

    const defaultController = createCanvasProjectStoreController(createDefaultProjectStoreSource());
    window.SimpAICanvasWorkbenchProject = Object.assign(
        {},
        window.SimpAICanvasWorkbenchProject || {},
        defaultController,
        { createCanvasProjectStoreController }
    );
})();
