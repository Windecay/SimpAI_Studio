(function () {
    'use strict';

    function createCanvasMediaBrowserDataController(context) {
        const scope = context?.mediaBrowserDataSource || context || {};
        const configSource = scope.configSource || {};
        const networkSource = scope.networkSource || {};
        const projectSource = scope.projectSource || {};
        const nodeSource = scope.nodeSource || {};
        const stateSource = scope.stateSource || {};
        const fieldSource = scope.fieldSource || {};
        const renderSource = scope.renderSource || {};
        const diagnosticsSource = scope.diagnosticsSource || {};
        const call = (source, name, fallback, ...args) => typeof source[name] === 'function'
            ? source[name](...args) : fallback;
        const stateCall = (name, fallback, ...args) => call(stateSource, name, fallback, ...args);
        const renderCall = (name, ...args) => call(renderSource, name, undefined, ...args);
        const getProject = () => call(projectSource, 'getProject', null);
        const getNode = id => call(nodeSource, 'getNode', null, id);
        const pageSize = () => call(configSource, 'getPageSize', 96);
        const panelRequests = new WeakMap();

        async function fetchMediaBrowserData(state, options) {
            const limit = Number(options?.limit || pageSize());
            if (state.tab === 'danbooru') {
                const pageState = Object.assign({}, state, {
                    page: Math.max(1, Number(options?.page || state.page || 1) || 1)
                });
                return call(networkSource, 'fetchDanbooruGalleryPosts', null, pageState);
            }
            const api = call(networkSource, 'getMediaGalleryApi', null);
            if (typeof api !== 'function') {
                return { ok: false, error: 'media gallery API is not loaded', items: [] };
            }
            return api({
                media_type: state.mediaType,
                folder: state.folder,
                query: state.query,
                limit,
                offset: Math.max(0, Number(options?.offset || 0) || 0),
                include_dimensions: true,
                include_metadata: true,
                max_seconds: 5
            });
        }

        function beginPanelRequest(modal) {
            const request = { modal, project: getProject() };
            panelRequests.set(modal, request);
            return request;
        }

        function isCurrentPanelRequest(request) {
            return panelRequests.get(request.modal) === request
                && getProject() === request.project && request.modal.isConnected !== false;
        }

        function finishPanelRequest(request) {
            const current = isCurrentPanelRequest(request);
            if (panelRequests.get(request.modal) === request) {
                panelRequests.delete(request.modal);
                request.modal.__mediaBrowserLoadingMore = false;
            }
            return current;
        }

        async function refreshMediaBrowserPanel(modal) {
            if (modal?.isConnected === false) return;
            const state = call(fieldSource, 'readMediaBrowserFields', {}, modal);
            const request = beginPanelRequest(modal);
            modal.__mediaBrowserLoadingMore = false;
            try {
                renderCall('renderMediaBrowserPanel', modal, true);
                let data;
                try {
                    data = await fetchMediaBrowserData(state, { limit: pageSize(), offset: 0 });
                } catch (err) {
                    data = { ok: false, error: err?.message || String(err || 'media browser failed'), items: [] };
                }
                if (!isCurrentPanelRequest(request)) return;
                modal.__mediaBrowserData = stateCall('mergeMediaBrowserPage', {}, null, data, false);
                const items = Array.isArray(modal.__mediaBrowserData.items) ? modal.__mediaBrowserData.items : [];
                if (!items.some(item => String(item.id || '') === String(state.selectedId || ''))) {
                    state.selectedId = items[0]?.id || '';
                }
                if (finishPanelRequest(request)) {
                    renderCall('renderMediaBrowserPanel', modal, false);
                    renderCall('scheduleMediaBrowserPaintRefresh', modal);
                }
            } finally {
                finishPanelRequest(request);
            }
        }

        async function loadMoreMediaBrowserPanel(modal) {
            if (!modal || modal.isConnected === false || modal.__mediaBrowserLoadingMore || panelRequests.has(modal)) return;
            const current = modal.__mediaBrowserData || {};
            if (!current.has_more && !current.truncated) return;
            const state = call(fieldSource, 'readMediaBrowserFields', {}, modal);
            const request = beginPanelRequest(modal);
            modal.__mediaBrowserLoadingMore = true;
            try {
                renderCall('renderMediaBrowserPanel', modal, false);
                let page, nextPage;
                if (state.tab === 'danbooru') {
                    nextPage = Math.max(1, Number(current.next_page || (Number(current.page || state.page || 1) + 1)) || 1);
                    page = await fetchMediaBrowserData(state, { limit: pageSize(), page: nextPage });
                } else {
                    page = await fetchMediaBrowserData(state, {
                        limit: pageSize(), offset: Number(current.next_offset ?? current.items?.length ?? 0) || 0
                    });
                }
                if (!isCurrentPanelRequest(request)) return;
                if (state.tab === 'danbooru') state.page = nextPage;
                modal.__mediaBrowserData = stateCall('mergeMediaBrowserPage', {}, current, page, true);
                modal.__mediaBrowserState = state;
            } finally {
                if (finishPanelRequest(request)) {
                    renderCall('renderMediaBrowserPanel', modal, false);
                    renderCall('scheduleMediaBrowserPaintRefresh', modal);
                }
            }
        }

        function beginNodeRequest(node, runtime) {
            const requestId = Number(runtime.requestId || 0) + 1;
            runtime.requestId = requestId;
            return { node, runtime, requestId, project: getProject() };
        }

        function isCurrentNodeRequest(request) {
            return getProject() === request.project
                && getNode(request.node.id) === request.node && request.node.type === 'media_browser'
                && stateCall('getMediaBrowserNodeRuntime', null)?.get(String(request.node.id || '')) === request.runtime
                && request.runtime.requestId === request.requestId;
        }

        async function refreshMediaBrowserNode(node, options) {
            if (!node || node.type !== 'media_browser' || getNode(node.id) !== node) return null;
            const runtime = stateCall('mediaBrowserRuntimeFor', {}, node.id);
            const request = beginNodeRequest(node, runtime);
            runtime.loading = true;
            runtime.loadingMore = false;
            runtime.error = '';
            runtime.version = Number(runtime.version || 0) + 1;
            try {
                if (options?.render !== false) renderCall('renderNodes');
                const state = stateCall('mediaBrowserNodeState', {}, node);
                let data;
                try {
                    data = await fetchMediaBrowserData(state, { limit: pageSize(), offset: 0 });
                } catch (err) {
                    data = { ok: false, error: err?.message || String(err || 'media browser failed'), items: [] };
                }
                if (!isCurrentNodeRequest(request)) return data;
                runtime.data = stateCall('mergeMediaBrowserPage', {}, null, data, false);
                runtime.loading = false;
                runtime.error = runtime.data.error || '';
                runtime.version = Number(runtime.version || 0) + 1;
                const items = Array.isArray(runtime.data.items) ? runtime.data.items : [];
                const nextState = stateCall('mediaBrowserNodeState', {}, node);
                if (!items.some(item => String(item.id || '') === String(nextState.selectedId || ''))) {
                    nextState.selectedId = items[0]?.id || '';
                    stateCall('saveMediaBrowserNodeState', undefined, node, nextState);
                }
                renderCall('renderNodes');
                renderCall('scheduleMediaBrowserNodePaintRefresh', node.id);
                return runtime.data;
            } finally {
                if (runtime.requestId === request.requestId) runtime.loading = false;
            }
        }

        async function loadMoreMediaBrowserNode(node, nodeEl) {
            if (!node || node.type !== 'media_browser' || getNode(node.id) !== node) return;
            const runtime = stateCall('mediaBrowserRuntimeFor', {}, node.id);
            const current = runtime.data || {};
            if (runtime.loading || runtime.loadingMore || (!current.has_more && !current.truncated)) return;
            const state = call(fieldSource, 'readMediaBrowserNodeFields', {}, node, nodeEl);
            const request = beginNodeRequest(node, runtime);
            runtime.loadingMore = true;
            runtime.version = Number(runtime.version || 0) + 1;
            try {
                renderCall('renderNodes');
                let page, nextPage;
                if (state.tab === 'danbooru') {
                    nextPage = Math.max(1, Number(current.next_page || (Number(current.page || state.page || 1) + 1)) || 1);
                    page = await fetchMediaBrowserData(state, { limit: pageSize(), page: nextPage });
                } else {
                    page = await fetchMediaBrowserData(state, {
                        limit: pageSize(), offset: Number(current.next_offset ?? current.items?.length ?? 0) || 0
                    });
                }
                if (!isCurrentNodeRequest(request)) return;
                if (state.tab === 'danbooru') {
                    state.page = nextPage;
                    state.selectedId = stateCall('mediaBrowserNodeState', {}, node).selectedId;
                    stateCall('saveMediaBrowserNodeState', undefined, node, state);
                }
                runtime.data = stateCall('mergeMediaBrowserPage', {}, current, page, true);
            } finally {
                if (runtime.requestId === request.requestId) runtime.loadingMore = false;
                if (isCurrentNodeRequest(request)) {
                    runtime.version = Number(runtime.version || 0) + 1;
                    renderCall('renderNodes');
                    renderCall('scheduleMediaBrowserNodePaintRefresh', node.id);
                }
            }
        }

        function mediaBrowserShouldAutoLoadMore(scroller) {
            if (!scroller) return false;
            return (scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight) < 360;
        }

        function maybeAutoLoadMoreMediaBrowserPanel(modal, scroller) {
            if (!mediaBrowserShouldAutoLoadMore(scroller)) return;
            const data = modal?.__mediaBrowserData || {};
            if (!data.has_more || modal.__mediaBrowserLoadingMore) return;
            loadMoreMediaBrowserPanel(modal).catch(err => call(diagnosticsSource, 'warn', undefined,
                '[SimpAI Canvas] media browser modal stream load failed', err));
        }

        return {
            fetchMediaBrowserData, refreshMediaBrowserPanel, loadMoreMediaBrowserPanel,
            refreshMediaBrowserNode, loadMoreMediaBrowserNode,
            mediaBrowserShouldAutoLoadMore, maybeAutoLoadMoreMediaBrowserPanel
        };
    }

    window.SimpAICanvasWorkbenchMediaBrowserData = Object.assign(
        {}, window.SimpAICanvasWorkbenchMediaBrowserData || {}, { createCanvasMediaBrowserDataController }
    );
})();
