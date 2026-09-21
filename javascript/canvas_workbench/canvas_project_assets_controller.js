(function () {
    'use strict';

    function createCanvasProjectAssetsController(context) {
        const scope = context?.projectAssetsSource || context || {};
        const projectSource = scope.projectSource || {};
        const patchSource = scope.patchSource || {};
        const storageSource = scope.storageSource || {};
        const assetSource = scope.assetSource || {};
        const persistenceSource = scope.persistenceSource || {};
        const domSource = scope.domSource || {};
        const renderSource = scope.renderSource || {};
        const uiSource = scope.uiSource || {};
        const serializationSource = scope.serializationSource || {};
        const batchSource = scope.batchSource || {};
        const selectionSource = scope.selectionSource || {};
        const timeSource = scope.timeSource || {};
        const viewerSource = scope.viewerSource || {};
        const callbackSources = {
            getProject: projectSource,
            getNode: projectSource,
            setProject: projectSource,
            getProjectId: projectSource,
            buildProjectStoragePatch: patchSource,
            buildMaterializedAsset: patchSource,
            buildResultMaterializationPatch: patchSource,
            buildMediaNodeStatePatch: patchSource,
            buildMediaNodeSourcePatch: patchSource,
            buildBatchAnyItemStatePatch: patchSource,
            getStorageScope: storageSource,
            getStorageKey: storageSource,
            buildProjectStorageInfo: storageSource,
            assetDisplaySrc: assetSource,
            sendCanvasListAssetsRequest: assetSource,
            sendCanvasMaterializeAssetRequest: assetSource,
            serializeAssetSourceForRun: serializationSource,
            serializeAssetForRun: serializationSource,
            batchAnyMediaKind: batchSource,
            applyBatchAnyStatePatch: batchSource,
            getSelectedNodeId: selectionSource,
            nowIso: timeSource,
            saveProjectToBrowserCache: persistenceSource,
            loadProjectFromBackend: persistenceSource,
            getRoot: domSource,
            renderAll: renderSource,
            invalidateRenderedNode: renderSource,
            syncPresetSpecialViewersForAssetNode: viewerSource,
            warn: uiSource
        };
        const call = (name, fallback, ...args) => {
            const sourceObject = callbackSources[name] || {};
            return typeof sourceObject[name] === 'function' ? sourceObject[name](...args) : fallback;
        };
        const warn = typeof uiSource.warn === 'function' ? uiSource.warn : console.warn;
        let canvasProjectAssetCatalog = [];

        function project() {
            return call('getProject', {}, []) || {};
        }

        function applyProjectStoragePatch(projectLike, storage) {
            const nextStorage = storage
                && typeof storage === 'object'
                && !Array.isArray(storage)
                ? storage
                : {};
            const patch = call('buildProjectStoragePatch', null, projectLike, nextStorage);
            if (patch && typeof patch === 'object'
                && patch.storage
                && typeof patch.storage === 'object'
                && !Array.isArray(patch.storage)) {
                Object.assign(projectLike, patch);
                return;
            }
            Object.assign(projectLike, { storage: nextStorage });
        }

        function decodeCanvasAssetPathText(value) {
            let text = String(value || '').trim();
            if (!text) return '';
            if (text.startsWith('/file=')) text = text.slice('/file='.length);
            if (text.startsWith('/gradio_api/file=')) text = text.slice('/gradio_api/file='.length);
            try {
                text = decodeURIComponent(text);
            } catch (err) {
                // Preserve raw text if it was not valid URL encoding.
            }
            text = text.split(/[?#]/, 1)[0];
            return text.replace(/\\/g, '/').replace(/\/+/g, '/');
        }

        function inferProjectAssetRelativePath(value) {
            const text = decodeCanvasAssetPathText(value);
            const marker = '/canvas_workbench/assets/';
            const markerIndex = text.indexOf(marker);
            if (markerIndex < 0) return '';
            const tail = text.slice(markerIndex + marker.length).replace(/^\/+/, '');
            const slashIndex = tail.indexOf('/');
            if (slashIndex < 0) return '';
            const rel = tail.slice(slashIndex + 1).replace(/^\/+/, '');
            if (!rel || rel.split('/').includes('..')) return '';
            return rel;
        }

        function inferChatImageRelativePath(image) {
            if (!image || typeof image !== 'object') return '';
            const explicit = String(image.asset_relative_path || image.relative_path || '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
            if (explicit && !explicit.split('/').includes('..')) return explicit;
            const candidates = [image.path, image.output_path, image.original_output_path, image.preview_url, image.thumb]
                .map(inferProjectAssetRelativePath)
                .filter(Boolean);
            return candidates[0] || '';
        }

        function fileBaseName(value) {
            return String(value || '').trim().replace(/\\/g, '/').split('/').filter(Boolean).pop() || '';
        }

        function findProjectAssetCatalogItemForImage(image) {
            if (!image || typeof image !== 'object' || !canvasProjectAssetCatalog.length) return null;
            const names = [
                image.name,
                image.title,
                image.path,
                image.output_path,
                image.original_output_path,
                image.preview_url,
                image.thumb
            ].map(fileBaseName).filter(Boolean);
            if (!names.length) return null;
            const wanted = new Set(names.map(name => name.toLowerCase()));
            return canvasProjectAssetCatalog.find(asset => {
                const assetNames = [asset?.name, asset?.relative_path, asset?.path, asset?.preview_url]
                    .map(fileBaseName)
                    .filter(Boolean)
                    .map(name => name.toLowerCase());
                return assetNames.some(name => wanted.has(name));
            }) || null;
        }

        function hydrateVlmChatImageFromAssetCatalog(image) {
            if (!image || typeof image !== 'object') return false;
            const match = findProjectAssetCatalogItemForImage(image);
            if (!match) return false;
            let changed = false;
            const rel = String(match.relative_path || '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
            const fill = (key, value) => {
                const clean = value == null ? '' : String(value);
                if (!clean || image[key]) return;
                image[key] = clean;
                changed = true;
            };
            fill('name', match.name);
            fill('mime', match.mime);
            fill('path', match.path);
            fill('output_path', match.path);
            fill('preview_url', match.preview_url);
            if (rel && !rel.split('/').includes('..')) {
                fill('asset_relative_path', rel);
                fill('relative_path', rel);
                fill('asset_root_key', 'project_asset_root');
            }
            if (!image.width && match.width) {
                image.width = match.width;
                changed = true;
            }
            if (!image.height && match.height) {
                image.height = match.height;
                changed = true;
            }
            return changed;
        }

        function normalizeVlmChatImageReference(image) {
            if (!image || typeof image !== 'object') return false;
            const rel = inferChatImageRelativePath(image);
            let changed = hydrateVlmChatImageFromAssetCatalog(image);
            if (!rel && !inferChatImageRelativePath(image)) return changed;
            const nextRel = rel || inferChatImageRelativePath(image);
            if (!image.asset_relative_path) {
                image.asset_relative_path = nextRel;
                changed = true;
            }
            if (!image.relative_path) {
                image.relative_path = nextRel;
                changed = true;
            }
            if (!image.asset_root_key) {
                image.asset_root_key = 'project_asset_root';
                changed = true;
            }
            if (image.thumb && String(image.thumb).includes('/canvas_workbench/assets/')) {
                delete image.thumb;
                changed = true;
            }
            return changed;
        }

        function normalizeProjectChatImageReferences(projectLike) {
            let changed = false;
            (Array.isArray(projectLike?.nodes) ? projectLike.nodes : []).forEach((node) => {
                if (!node || node.type !== 'vlm') return;
                (Array.isArray(node.chat?.messages) ? node.chat.messages : []).forEach((message) => {
                    (Array.isArray(message?.images) ? message.images : []).forEach((image) => {
                        if (normalizeVlmChatImageReference(image)) changed = true;
                    });
                });
            });
            return changed;
        }

        function canvasPathToFileUrl(path) {
            const text = String(path || '').trim();
            if (!text) return '';
            if (/^(https?:|blob:|data:|\/file=|\/gradio_api\/file=)/i.test(text)) return text;
            return `/file=${encodeURI(text.replace(/\\/g, '/'))}`;
        }

        function projectRelativeFallbackUrl(value) {
            const rel = inferProjectAssetRelativePath(value);
            const rootText = String(window.SimpAICanvasWorkbenchAssetRoot || '').trim();
            if (!rel || !rootText) return '';
            return canvasPathToFileUrl(`${rootText.replace(/[\\/]+$/g, '')}/${rel}`);
        }

        function projectRelativeAssetUrl(asset) {
            const rel = inferChatImageRelativePath(asset);
            const rootText = String(asset?.asset_root || window.SimpAICanvasWorkbenchAssetRoot || '').trim();
            if (!rel || !rootText) return '';
            return canvasPathToFileUrl(`${rootText.replace(/[\\/]+$/g, '')}/${rel}`);
        }

        function assetDisplaySrc(asset) {
            return call('assetDisplaySrc', '', asset);
        }

        function safeAssetFallbackSrc(asset, fallbackSrc) {
            const fallback = String(fallbackSrc || '').trim();
            if (!fallback) return '';
            const rebuilt = projectRelativeFallbackUrl(fallback);
            if (rebuilt) return rebuilt;
            if (inferProjectAssetRelativePath(fallback)) return '';
            if (inferChatImageRelativePath(asset) && inferProjectAssetRelativePath(fallback)) return '';
            return fallback;
        }

        function safeAssetDisplaySrc(asset, fallbackSrc) {
            return assetDisplaySrc(asset) || projectRelativeAssetUrl(asset) || safeAssetFallbackSrc(asset, fallbackSrc);
        }

        function safeAssetFullDisplaySrc(asset, fallbackSrc) {
            if (!asset || typeof asset !== 'object') return safeAssetFallbackSrc(asset, fallbackSrc);
            if (asset.kind === 'browser_upload' && asset.data_url) return asset.data_url;
            const relUrl = projectRelativeAssetUrl(asset);
            if (relUrl) return relUrl;
            const filePath = asset.path || asset.output_path || asset.original_output_path || '';
            if (filePath) return canvasPathToFileUrl(filePath);
            return asset.data_url || assetDisplaySrc(asset) || safeAssetFallbackSrc(asset, fallbackSrc) || asset.preview_url || asset.thumb || '';
        }

        function safeVlmChatAssetThumb(asset) {
            if (!asset || typeof asset !== 'object') return '';
            const src = safeAssetDisplaySrc(asset, asset.thumb || asset.preview_url || asset.data_url || '');
            if (src) return src;
            return asset.data_url || '';
        }

        function setCanvasProjectAssetRoot(rootPath) {
            const rootText = String(rootPath || '').trim();
            window.SimpAICanvasWorkbenchAssetRoot = rootText;
        }

        function syncCanvasProjectAssetRoot(projectLike) {
            const storage = projectLike?.storage && typeof projectLike.storage === 'object' ? projectLike.storage : {};
            setCanvasProjectAssetRoot(storage.asset_root || projectLike?.asset_root || '');
        }

        function syncCanvasProjectAssetRootFromAsset(asset) {
            const rootText = String(asset?.asset_root || '').trim();
            if (!rootText) return false;
            setCanvasProjectAssetRoot(rootText);
            const currentProject = project();
            const storageScope = call('getStorageScope', {}, []);
            const storageKey = call('getStorageKey', '', []);
            const storage = Object.assign({}, currentProject.storage || call('buildProjectStorageInfo', {}, storageKey, storageScope), {
                asset_root: rootText
            });
            applyProjectStoragePatch(currentProject, storage);
            call('setProject', null, currentProject);
            return true;
        }

        function syncCanvasProjectAssetRootFromAssets(assets) {
            if (!Array.isArray(assets)) return false;
            return assets.some(asset => syncCanvasProjectAssetRootFromAsset(asset));
        }

        function normalizeProjectAssetReferences(projectLike) {
            let changed = normalizeProjectChatImageReferences(projectLike);
            const normalizeAsset = (asset) => {
                if (!asset || typeof asset !== 'object') return;
                const before = `${asset.asset_relative_path || ''}|${asset.relative_path || ''}|${asset.asset_root_key || ''}|${asset.thumb || ''}`;
                normalizeVlmChatImageReference(asset);
                const after = `${asset.asset_relative_path || ''}|${asset.relative_path || ''}|${asset.asset_root_key || ''}|${asset.thumb || ''}`;
                if (before !== after) changed = true;
            };
            (Array.isArray(projectLike?.nodes) ? projectLike.nodes : []).forEach((node) => {
                if (!node || typeof node !== 'object') return;
                [
                    node.asset,
                    node.preview,
                    ...(Array.isArray(node.assets) ? node.assets : []),
                    ...(Array.isArray(node.preview_frames) ? node.preview_frames : [])
                ].forEach(normalizeAsset);
            });
            (Array.isArray(projectLike?.runs) ? projectLike.runs : []).forEach((run) => {
                [
                    run?.asset,
                    run?.preview,
                    ...(Array.isArray(run?.assets) ? run.assets : []),
                    ...(Array.isArray(run?.preview_frames) ? run.preview_frames : [])
                ].forEach(normalizeAsset);
            });
            return changed;
        }

        async function refreshCanvasProjectAssetRoot(options) {
            const opts = options || {};
            try {
                const currentProject = project();
                const response = await call('sendCanvasListAssetsRequest', null, {
                    project_id: currentProject.id || call('getProjectId', 'default', []),
                    max_files: 500,
                    max_seconds: 1.5,
                    include_dimensions: false
                });
                const rootText = String(response?.asset_root || '').trim();
                if (!rootText) return false;
                canvasProjectAssetCatalog = Array.isArray(response?.assets) ? response.assets : [];
                setCanvasProjectAssetRoot(rootText);
                const storage = Object.assign({}, currentProject.storage || call('buildProjectStorageInfo', {}, call('getStorageKey', '', []), call('getStorageScope', {}, [])), {
                    asset_root: rootText
                });
                applyProjectStoragePatch(currentProject, storage);
                call('setProject', null, currentProject);
                const normalizedAssets = normalizeProjectAssetReferences(currentProject);
                if (normalizedAssets) call('saveProjectToBrowserCache', null);
                const root = call('getRoot', null);
                if (opts.render !== false && root && !root.hidden) {
                    call('renderAll', null, { inspector: false });
                }
                return true;
            } catch (err) {
                warn('[SimpAI Canvas] asset root refresh failed:', err);
                return false;
            }
        }

        async function refreshCanvasProjectFromBackendOnOpen() {
            const loaded = await call('loadProjectFromBackend', false, { silent: true });
            await refreshCanvasProjectAssetRoot({ render: true });
            return loaded;
        }

        async function materializeNodeAssetForStorage(nodeId) {
            const node = call('getNode', null, nodeId);
            if (!node || !node.asset?.data_url) return { ok: false, error: 'node has no inline asset' };
            const response = await call('sendCanvasMaterializeAssetRequest', null, {
                project_id: project().id || call('getProjectId', 'default'),
                asset_source: call('serializeAssetSourceForRun', null, node)
            });
            const current = call('getNode', null, nodeId);
            if (!current || !response?.ok || !response.asset_ref) return response;
            const ref = response.asset_ref || {};
            const materializedAsset = call('buildMaterializedAsset', {}, current.asset, ref);
            if (ref.asset_root) setCanvasProjectAssetRoot(ref.asset_root);
            const deleteAssetKeys = materializedAsset.path || materializedAsset.preview_url ? ['data_url'] : [];
            if (current.type === 'result') {
                Object.assign(current, call('buildResultMaterializationPatch', {}, current, {
                    assetRef: ref,
                    asset: materializedAsset,
                    deleteAssetKeys
                }));
            } else {
                Object.assign(current, call('buildMediaNodeStatePatch', {}, current, {
                    asset: materializedAsset,
                    deleteAssetKeys
                }));
                Object.assign(current, call('buildMediaNodeSourcePatch', {}, current, {
                    materialized_asset_id: ref.asset_id || '',
                    materialized_path: ref.path || '',
                    materialized_at: call('nowIso', '')
                }));
            }
            call('saveProjectToBrowserCache', undefined);
            call('invalidateRenderedNode', undefined, current.id);
            call('renderAll', undefined, { inspector: false });
            call('syncPresetSpecialViewersForAssetNode', undefined, current.id);
            return response;
        }

        async function materializeBatchAnyItemForStorage(nodeId, itemId) {
            const node = call('getNode', null, nodeId);
            if (!node || node.type !== 'batch_any') return { ok: false, error: 'batch node not found' };
            const index = (node.items || []).findIndex(item => item.id === itemId);
            const item = index >= 0 ? node.items[index] : null;
            if (!item || !item.asset?.data_url) return { ok: false, error: 'item has no inline asset' };
            const response = await call('sendCanvasMaterializeAssetRequest', null, {
                project_id: project().id || call('getProjectId', 'default'),
                asset_source: {
                    node_id: `${node.id}:item:${item.id}`,
                    type: item.media_kind || call('batchAnyMediaKind', '', node) || 'image',
                    title: item.name || '',
                    asset: call('serializeAssetForRun', null, item.asset),
                    mask: null,
                    source: {
                        kind: 'batch_any_item',
                        batch_node_id: node.id,
                        batch_item_id: item.id,
                        batch_index: index
                    }
                }
            });
            const currentNode = call('getNode', null, nodeId);
            const currentIndex = currentNode?.items?.findIndex(entry => entry.id === itemId) ?? -1;
            const currentItem = currentIndex >= 0 ? currentNode.items[currentIndex] : null;
            if (!currentNode || !currentItem || !response?.ok || !response.asset_ref) return response;
            const ref = response.asset_ref || {};
            const materializedAsset = call('buildMaterializedAsset', {}, currentItem.asset, ref);
            if (ref.asset_root) setCanvasProjectAssetRoot(ref.asset_root);
            const updatedItem = call('buildBatchAnyItemStatePatch', null, currentItem, {
                asset: materializedAsset,
                deleteAssetKeys: materializedAsset.path || materializedAsset.preview_url ? ['data_url'] : [],
                materializedAt: call('nowIso', '')
            });
            if (!updatedItem || typeof updatedItem !== 'object') return response;
            const items = Array.isArray(currentNode.items) ? currentNode.items.slice() : [];
            items[currentIndex] = updatedItem;
            const statePatch = { items };
            if (Number(currentNode.current_index || 0) === currentIndex) statePatch.asset = updatedItem.asset;
            call('applyBatchAnyStatePatch', undefined, currentNode, { statePatch });
            call('saveProjectToBrowserCache', undefined);
            call('renderAll', undefined, { inspector: call('getSelectedNodeId', null) === currentNode.id });
            return response;
        }

        async function materializeInlineProjectAssets() {
            const currentProject = project();
            const nodes = (Array.isArray(currentProject.nodes) ? currentProject.nodes : [])
                .filter(node => node && ['image', 'video', 'audio'].includes(node.type) && node.asset?.data_url && !(node.asset.path || node.asset.preview_url));
            for (const node of nodes) {
                try {
                    await materializeNodeAssetForStorage(node.id);
                } catch (err) {
                    warn('[SimpAI Canvas] asset materialize before save skipped:', err);
                }
            }
        }

        return {
            decodeCanvasAssetPathText,
            inferProjectAssetRelativePath,
            inferChatImageRelativePath,
            safeVlmChatAssetThumb,
            canvasPathToFileUrl,
            safeAssetFallbackSrc,
            safeAssetDisplaySrc,
            safeAssetFullDisplaySrc,
            setCanvasProjectAssetRoot,
            syncCanvasProjectAssetRoot,
            syncCanvasProjectAssetRootFromAsset,
            syncCanvasProjectAssetRootFromAssets,
            normalizeProjectAssetReferences,
            refreshCanvasProjectAssetRoot,
            refreshCanvasProjectFromBackendOnOpen,
            materializeNodeAssetForStorage,
            materializeBatchAnyItemForStorage,
            materializeInlineProjectAssets,
            getAssetCatalog: () => canvasProjectAssetCatalog.slice()
        };
    }

    window.SimpAICanvasWorkbenchProjectAssets = Object.assign({}, window.SimpAICanvasWorkbenchProjectAssets || {}, {
        createCanvasProjectAssetsController
    });
})();
