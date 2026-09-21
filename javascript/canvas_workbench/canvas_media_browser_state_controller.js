(function () {
    'use strict';

    function createCanvasMediaBrowserStateController(context) {
        const scope = context?.mediaBrowserStateSource || context || {};
        const layoutSource = scope.layoutSource || {};
        const nodeSource = scope.nodeSource || {};
        const patchSource = scope.patchSource || {};
        const historySource = scope.historySource || {};
        const persistenceSource = scope.persistenceSource || {};
        const call = (source, name, fallback, ...args) => typeof source[name] === 'function'
            ? source[name](...args) : fallback;
        const runtimeCache = new Map();

        function mediaBrowserInitialState(world) {
            return {
                tab: 'outputs',
                mediaType: 'image',
                folder: '',
                query: '',
                danbooruQuery: '',
                rating: 'all',
                page: 1,
                selectedId: '',
                world: {
                    x: Math.round(Number(world?.x || 0)),
                    y: Math.round(Number(world?.y || 0))
                }
            };
        }

        function normalizeMediaBrowserState(value, world) {
            const base = mediaBrowserInitialState(world || call(layoutSource, 'viewportCenterWorld', { x: 0, y: 0 }));
            const state = Object.assign({}, base, value && typeof value === 'object' ? value : {});
            state.tab = state.tab === 'danbooru' ? 'danbooru' : 'outputs';
            state.mediaType = state.mediaType === 'video' ? 'video' : 'image';
            state.folder = String(state.folder || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
            state.query = String(state.query || '');
            state.danbooruQuery = String(state.danbooruQuery || '');
            state.rating = state.rating || 'all';
            state.page = Math.max(1, Number(state.page || 1) || 1);
            state.selectedId = String(state.selectedId || '');
            state.world = {
                x: Math.round(Number(state.world?.x ?? world?.x ?? base.world.x ?? 0)),
                y: Math.round(Number(state.world?.y ?? world?.y ?? base.world.y ?? 0))
            };
            return state;
        }

        function serializableMediaBrowserState(state) {
            const next = normalizeMediaBrowserState(state || {});
            return {
                tab: next.tab,
                mediaType: next.mediaType,
                folder: next.folder,
                query: next.query,
                danbooruQuery: next.danbooruQuery,
                rating: next.rating,
                page: next.page,
                selectedId: next.selectedId
            };
        }

        function mediaBrowserNodeState(node) {
            return normalizeMediaBrowserState(node?.media_browser || node?.params || {}, {
                x: Number(node?.x || 0) + Number(node?.w || call(layoutSource, 'defaultNodeSize', {}, 'media_browser').w || 0) + 48,
                y: Number(node?.y || 0)
            });
        }

        function saveMediaBrowserNodeState(node, state, options) {
            if (!node || node.type !== 'media_browser' || call(nodeSource, 'isNodeLocked', false, node)) return;
            if (options?.history) call(historySource, 'pushHistoryBatch', undefined, `media-browser:${node.id}:${options.history}`, 'Edit media browser');
            Object.assign(node, call(patchSource, 'buildMediaBrowserStatePatch', {}, node, { state }));
            call(persistenceSource, 'scheduleSave', undefined);
        }

        function mediaBrowserRuntimeFor(nodeId) {
            const id = String(nodeId || '');
            if (!id) return { data: { ok: true, items: [], folders: [] }, loading: false, version: 0, error: '' };
            if (!runtimeCache.has(id)) {
                runtimeCache.set(id, {
                    data: { ok: true, items: [], folders: [] },
                    loading: false,
                    frostRevealed: false,
                    version: 0,
                    error: ''
                });
            }
            return runtimeCache.get(id);
        }

        function mediaBrowserRuntimeSignature(nodeId) {
            const runtime = mediaBrowserRuntimeFor(nodeId);
            const data = runtime.data || {};
            const items = Array.isArray(data.items) ? data.items : [];
            const folders = Array.isArray(data.folders) ? data.folders : [];
            return JSON.stringify({
                loading: !!runtime.loading,
                loadingMore: !!runtime.loadingMore,
                version: runtime.version || 0,
                frost_revealed: !!runtime.frostRevealed,
                ok: data.ok !== false,
                error: runtime.error || data.error || '',
                truncated: !!data.truncated,
                has_more: !!data.has_more,
                next_offset: data.next_offset ?? '',
                next_page: data.next_page ?? '',
                folders: folders.slice(0, 120),
                items: items.map(item => [
                    item?.id || '',
                    item?.name || '',
                    item?.preview_url || '',
                    item?.media_type || '',
                    item?.size || '',
                    item?.updated_at || '',
                    item?.width || '',
                    item?.height || ''
                ])
            });
        }

        function mergeMediaBrowserPage(existing, page, append) {
            const pageData = page || { ok: false, error: 'empty media browser response', items: [] };
            if (append && pageData.ok === false) {
                return Object.assign({}, existing || {}, {
                    ok: false,
                    error: pageData.error || pageData.details || 'Load failed',
                    load_more_error: pageData.error || pageData.details || 'Load failed'
                });
            }
            const baseItems = append && Array.isArray(existing?.items) ? existing.items : [];
            const pageItems = Array.isArray(pageData.items) ? pageData.items : [];
            const seen = new Set(baseItems.map(item => String(item?.id || '')));
            const mergedItems = baseItems.concat(pageItems.filter(item => {
                const id = String(item?.id || '');
                if (!id || seen.has(id)) return false;
                seen.add(id);
                return true;
            }));
            const nextOffset = pageData.next_offset ?? (append ? mergedItems.length : pageItems.length);
            return Object.assign({}, append ? (existing || {}) : {}, pageData, {
                ok: pageData.ok !== false,
                items: mergedItems,
                has_more: !!(pageData.has_more || pageData.truncated),
                next_offset: pageData.has_more || pageData.truncated ? nextOffset : null,
                loaded_count: mergedItems.length
            });
        }

        function selectedMediaBrowserItemFrom(state, data) {
            const selectedId = String(state?.selectedId || '');
            const items = Array.isArray(data?.items) ? data.items : [];
            return items.find(item => String(item.id || '') === selectedId) || null;
        }

        function selectedMediaBrowserItem(modal) {
            return selectedMediaBrowserItemFrom(modal.__mediaBrowserState || {}, modal.__mediaBrowserData || {});
        }

        function selectedMediaBrowserNodeItem(node) {
            const state = mediaBrowserNodeState(node);
            return selectedMediaBrowserItemFrom(state, mediaBrowserRuntimeFor(node.id).data || {});
        }

        return {
            mediaBrowserInitialState, normalizeMediaBrowserState, serializableMediaBrowserState,
            mediaBrowserNodeState, saveMediaBrowserNodeState, mediaBrowserRuntimeFor, mediaBrowserRuntimeSignature,
            mergeMediaBrowserPage, selectedMediaBrowserItemFrom, selectedMediaBrowserItem, selectedMediaBrowserNodeItem,
            getMediaBrowserNodeRuntime: () => runtimeCache
        };
    }

    window.SimpAICanvasWorkbenchMediaBrowserState = Object.assign(
        {}, window.SimpAICanvasWorkbenchMediaBrowserState || {}, { createCanvasMediaBrowserStateController }
    );
})();
