(function () {
    'use strict';

    function projectArray(project, key) {
        return Array.isArray(project?.[key]) ? project[key] : [];
    }

    function cloneValue(value, fallback) {
        try {
            return JSON.parse(JSON.stringify(value ?? fallback));
        } catch (err) {
            return fallback;
        }
    }

    function buildProjectCollectionsPatch(project) {
        const source = project || {};
        return {
            groups: Array.isArray(source.groups) ? source.groups : [],
            nodes: Array.isArray(source.nodes) ? source.nodes : [],
            edges: Array.isArray(source.edges) ? source.edges : [],
            runs: Array.isArray(source.runs) ? source.runs : [],
            batch_jobs: Array.isArray(source.batch_jobs) ? source.batch_jobs : []
        };
    }

    function buildProjectNodesPatch(project, nodes) {
        return {
            nodes: (Array.isArray(nodes) ? nodes : projectArray(project, 'nodes')).slice()
        };
    }

    function buildProjectRunsPatch(project, runs) {
        return {
            runs: (Array.isArray(runs) ? runs : projectArray(project, 'runs')).slice()
        };
    }

    function buildProjectStorageInfoPatch(key, scope, options) {
        const config = options || {};
        const currentScope = scope || {};
        const translate = typeof config.t === 'function'
            ? config.t
            : ((en, cn) => cn || en);
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

    function buildProjectStoragePatch(project, storage, options) {
        const config = options || {};
        const nextStorage = storage
            && typeof storage === 'object'
            && !Array.isArray(storage)
            ? cloneValue(storage, {})
            : {};
        const storedStorage = config.storedStorage
            && typeof config.storedStorage === 'object'
            && !Array.isArray(config.storedStorage)
            ? config.storedStorage
            : project?.storage;
        if (config.preserveAssetRoot && storedStorage?.asset_root) {
            nextStorage.asset_root = storedStorage.asset_root;
        }
        return { storage: nextStorage };
    }

    function buildProjectNodeAppendPatch(project, node) {
        const nodes = projectArray(project, 'nodes').slice();
        if (node && typeof node === 'object') nodes.push(node);
        return { nodes };
    }

    function buildProjectGroupsPatch(project, groups) {
        return {
            groups: Array.isArray(groups) ? groups : projectArray(project, 'groups')
        };
    }

    function buildProjectGroupAppendPatch(project, group) {
        const groups = projectArray(project, 'groups').slice();
        if (group && typeof group === 'object') groups.push(group);
        return buildProjectGroupsPatch(project, groups);
    }

    function buildProjectGroupDeletePatch(project, groupId) {
        const groups = projectArray(project, 'groups').filter(group => group?.id !== groupId);
        return buildProjectGroupsPatch(project, groups);
    }

    function buildProjectRunAppendPatch(project, run) {
        const runs = projectArray(project, 'runs').slice();
        if (run && typeof run === 'object') runs.push(run);
        return { runs };
    }

    function buildProjectBatchJobAppendPatch(project, batchJob) {
        const batchJobs = projectArray(project, 'batch_jobs').slice();
        if (batchJob && typeof batchJob === 'object') batchJobs.push(batchJob);
        return { batch_jobs: batchJobs };
    }

    function buildProjectCanvasClearPatch() {
        return {
            groups: [],
            nodes: [],
            edges: [],
            runs: []
        };
    }

    function buildProjectMetadataPatch(project, options) {
        const config = options || {};
        const stamp = typeof config.nowIso === 'function'
            ? config.nowIso
            : (() => new Date().toISOString());
        return {
            schema: project?.schema || config.schema || 'simpai.canvas.workbench.v1',
            title: project?.title || config.defaultTitle || 'Untitled Canvas',
            created_at: project?.created_at || stamp(),
            updated_at: project?.updated_at || stamp()
        };
    }

    function buildProjectIdentityPatch(project, options) {
        const config = options || {};
        const patch = {};
        if (Object.prototype.hasOwnProperty.call(config, 'id')) patch.id = config.id;
        else if (Object.prototype.hasOwnProperty.call(project || {}, 'id')) patch.id = project.id;
        if (Object.prototype.hasOwnProperty.call(config, 'title')) patch.title = config.title;
        else if (Object.prototype.hasOwnProperty.call(project || {}, 'title')) patch.title = project.title;
        return patch;
    }

    function buildProjectDefaultPatch(options) {
        const config = options || {};
        const stamp = typeof config.nowIso === 'function'
            ? config.nowIso
            : (() => new Date().toISOString());
        const settings = config.defaultSettings
            && typeof config.defaultSettings === 'object'
            && !Array.isArray(config.defaultSettings)
            ? cloneValue(config.defaultSettings, {})
            : {};
        return {
            schema: config.schema || 'simpai.canvas.workbench.v1',
            id: config.projectId || config.defaultProjectId || 'default',
            title: config.defaultTitle || 'Untitled Canvas',
            created_at: stamp(),
            updated_at: stamp(),
            viewport: { x: 80, y: 80, zoom: 1 },
            settings,
            groups: [],
            nodes: [],
            edges: [],
            runs: [],
            batch_jobs: []
        };
    }

    function buildProjectDemoPatch(options) {
        const config = options || {};
        const translate = typeof config.t === 'function'
            ? config.t
            : ((en, cn) => cn || en);
        const now = typeof config.nowIso === 'function'
            ? config.nowIso()
            : new Date().toISOString();
        const defaultSettings = config.defaultSettings
            && typeof config.defaultSettings === 'object'
            && !Array.isArray(config.defaultSettings)
            ? cloneValue(config.defaultSettings, {})
            : {};
        const storage = config.storage
            && typeof config.storage === 'object'
            && !Array.isArray(config.storage)
            ? cloneValue(config.storage, {})
            : config.storage || null;
        return {
            schema: config.schema || 'simpai.canvas.workbench.v1',
            id: config.id || config.projectId || 'default',
            title: translate('Canvas Quick Start', '画布快速入门'),
            created_at: now,
            updated_at: now,
            viewport: { x: 120, y: 120, zoom: 0.9 },
            settings: Object.assign({}, defaultSettings, {
                minimap: true,
                edgeLabels: true,
                inspectorCollapsed: false,
                __demo_initialized: true
            }),
            groups: [],
            nodes: [
                {
                    id: 'quick_start_image_input',
                    type: 'image',
                    x: 120,
                    y: 120,
                    w: 640,
                    h: 420,
                    title: translate('Image Input', '图像输入'),
                    display_mode: 'frameless',
                    asset: null,
                    mask: null,
                    status: {
                        state: 'waiting',
                        message: translate('Click the empty node body to upload an image.', '点击空白节点主体上传图片。')
                    },
                    source: {
                        kind: 'quick_start_image_upload',
                        slot: 'scene_canvas_image'
                    }
                }
            ],
            edges: [],
            runs: [],
            batch_jobs: [],
            storage
        };
    }

    function buildProjectUpdatedAtPatch(project, options) {
        const config = options || {};
        const stamp = typeof config.nowIso === 'function'
            ? config.nowIso
            : (() => new Date().toISOString());
        return {
            updated_at: Object.prototype.hasOwnProperty.call(config, 'updatedAt')
                ? config.updatedAt
                : stamp()
        };
    }

    function buildProjectEdgeAppendPatch(project, edge) {
        const edges = projectArray(project, 'edges').slice();
        if (edge && typeof edge === 'object') edges.push(edge);
        return { edges };
    }

    function buildProjectEdgeFilterPatch(project, predicate) {
        const edges = projectArray(project, 'edges');
        return {
            edges: typeof predicate === 'function' ? edges.filter(predicate) : edges.slice()
        };
    }

    function buildProjectTimelineClipEdgeDeletePatch(project, nodeId, clipId) {
        return {
            edges: projectArray(project, 'edges').filter(edge => !(
                edge?.type === 'timeline'
                && edge?.to === nodeId
                && edge?.slot === clipId
            ))
        };
    }

    function buildProjectViewportPatch(project, options) {
        const config = options || {};
        const clamp = typeof config.clamp === 'function'
            ? config.clamp
            : ((value, min, max) => Math.max(min, Math.min(max, value)));
        const viewportPatch = config.viewportPatch
            && typeof config.viewportPatch === 'object'
            && !Array.isArray(config.viewportPatch)
            ? cloneValue(config.viewportPatch, {})
            : {};
        const viewport = Object.assign(
            { x: 80, y: 80, zoom: 1 },
            project?.viewport && typeof project.viewport === 'object' && !Array.isArray(project.viewport)
                ? cloneValue(project.viewport, {})
                : {},
            viewportPatch
        );
        viewport.zoom = clamp(Number(viewport.zoom) || 1, Number(config.minZoom ?? 0.15), Number(config.maxZoom ?? 3));
        return { viewport };
    }

    function buildProjectSettingsPatch(project, options) {
        const config = options || {};
        const settings = Object.assign(
            {},
            config.defaultSettings && typeof config.defaultSettings === 'object' && !Array.isArray(config.defaultSettings)
                ? cloneValue(config.defaultSettings, {})
                : {},
            project?.settings && typeof project.settings === 'object' && !Array.isArray(project.settings)
                ? cloneValue(project.settings, {})
                : {}
        );
        if (!settings.__minimap_initialized) {
            settings.minimap = true;
            settings.__minimap_initialized = true;
        }
        return { settings };
    }

    function buildProjectSettingsMergePatch(project, patch) {
        const settings = project?.settings
            && typeof project.settings === 'object'
            && !Array.isArray(project.settings)
            ? cloneValue(project.settings, {})
            : {};
        const updates = patch
            && typeof patch === 'object'
            && !Array.isArray(patch)
            ? cloneValue(patch, {})
            : {};
        return { settings: Object.assign(settings, updates) };
    }

    function buildProjectSchedulerPatch(project, scheduler, options) {
        const config = options || {};
        const nextScheduler = scheduler
            && typeof scheduler === 'object'
            && !Array.isArray(scheduler)
            ? cloneValue(scheduler, {})
            : {};
        if (!config.merge) return { scheduler: nextScheduler };
        const currentScheduler = project?.scheduler
            && typeof project.scheduler === 'object'
            && !Array.isArray(project.scheduler)
            ? cloneValue(project.scheduler, {})
            : {};
        return { scheduler: Object.assign(currentScheduler, nextScheduler) };
    }

    function buildProjectNodeStoragePatch(node, options) {
        if (!node || typeof node !== 'object') return {};
        const config = options || {};
        const compactAsset = typeof config.compactAsset === 'function' ? config.compactAsset : null;
        const storedNode = cloneValue(node, {});
        const compactNodeAsset = (asset) => {
            if (asset && typeof asset === 'object' && compactAsset) compactAsset(asset);
        };

        compactNodeAsset(storedNode.asset);
        if (Array.isArray(storedNode.assets)) storedNode.assets.forEach(compactNodeAsset);
        compactNodeAsset(storedNode.preview);
        if (typeof config.buildVlmChatStoragePatch === 'function') {
            const chatPatch = config.buildVlmChatStoragePatch(storedNode, {
                compactAsset,
                maxInlineDataUrlChars: config.maxInlineDataUrlChars,
                stripAllMaterializedDataUrls: !!config.stripAllMaterializedDataUrls
            });
            if (chatPatch && typeof chatPatch === 'object'
                && Object.prototype.hasOwnProperty.call(chatPatch, 'chat')) {
                storedNode.chat = cloneValue(chatPatch.chat, chatPatch.chat);
            }
        }
        if (storedNode.last_response) delete storedNode.last_response;
        const hasMaterializedAsset = !!(storedNode.asset && (storedNode.asset.path || storedNode.asset.output_path || storedNode.asset.preview_url || storedNode.asset.original_output_path || storedNode.asset.asset_relative_path || storedNode.asset.relative_path))
            || (Array.isArray(storedNode.assets) && storedNode.assets.some(asset => asset && (asset.path || asset.output_path || asset.preview_url || asset.original_output_path || asset.asset_relative_path || asset.relative_path)));
        if (config.stripAllMaterializedDataUrls && hasMaterializedAsset && storedNode.preview) {
            delete storedNode.preview.data_url;
            delete storedNode.preview.thumb;
        }
        if (Object.prototype.hasOwnProperty.call(storedNode, 'preview_frames')) delete storedNode.preview_frames;
        if (Object.prototype.hasOwnProperty.call(storedNode, 'preview_step_key')) delete storedNode.preview_step_key;
        if (storedNode.mask && (storedNode.mask.path || storedNode.mask.preview_url || String(storedNode.mask.data_url || '').length > Number(config.maxInlineDataUrlChars ?? 1800000))) {
            delete storedNode.mask.data_url;
        }
        if (storedNode.source?.dry_run?.task_args_preview) delete storedNode.source.dry_run.task_args_preview;
        if (Array.isArray(storedNode.run_events) && storedNode.run_events.length > 8) storedNode.run_events = storedNode.run_events.slice(-8);
        if (storedNode.error_details?.traceback) delete storedNode.error_details.traceback;
        return { node: storedNode };
    }

    window.SimpAICanvasWorkbenchProjectPatchFactory = Object.assign({}, window.SimpAICanvasWorkbenchProjectPatchFactory || {}, {
        createCanvasProjectPatchFactoryController: function createCanvasProjectPatchFactoryController() {
            return {
                buildProjectNodeAppendPatch,
                buildProjectMetadataPatch,
                buildProjectIdentityPatch,
                buildProjectDefaultPatch,
                buildProjectDemoPatch,
                buildProjectUpdatedAtPatch,
                buildProjectCollectionsPatch,
                buildProjectNodesPatch,
                buildProjectRunsPatch,
                buildProjectGroupsPatch,
                buildProjectGroupAppendPatch,
                buildProjectGroupDeletePatch,
                buildProjectRunAppendPatch,
                buildProjectBatchJobAppendPatch,
                buildProjectCanvasClearPatch,
                buildProjectStorageInfoPatch,
                buildProjectStoragePatch,
                buildProjectEdgeAppendPatch,
                buildProjectEdgeFilterPatch,
                buildProjectTimelineClipEdgeDeletePatch,
                buildProjectViewportPatch,
                buildProjectSettingsPatch,
                buildProjectSettingsMergePatch,
                buildProjectSchedulerPatch,
                buildProjectNodeStoragePatch
            };
        }
    });
})();
