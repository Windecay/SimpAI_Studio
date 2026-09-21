(function () {
    'use strict';

    function createCanvasMediaBrowserInteractionController(context) {
        const scope = context?.mediaBrowserInteractionSource || context || {};
        const stateSource = scope.stateSource || {};
        const layoutSource = scope.layoutSource || {};
        const dataSource = scope.dataSource || {};
        const actionSource = scope.actionSource || {};
        const frostSource = scope.frostSource || {};
        const renderSource = scope.renderSource || {};
        const languageSource = scope.languageSource || {};
        const uiSource = scope.uiSource || {};
        const call = (source, name, fallback, ...args) => typeof source[name] === 'function'
            ? source[name](...args) : fallback;
        const stateCall = (name, fallback, ...args) => call(stateSource, name, fallback, ...args);
        const actionCall = (name, ...args) => call(actionSource, name, undefined, ...args);
        const renderNodes = () => call(renderSource, 'renderNodes', undefined);
        const refreshNode = node => call(dataSource, 'refreshMediaBrowserNode', Promise.resolve(), node);
        const warn = (...args) => call(uiSource, 'warn', undefined, ...args);
        const t = (en, cn) => {
            const state = call(languageSource, 'getLanguageState', {}) || {};
            return call(languageSource, 't', state.__lang === 'cn' || state.__lang === 'zh' ? cn : en, en, cn, state);
        };

        function readMediaBrowserFields(modal) {
            const state = modal.__mediaBrowserState || stateCall('mediaBrowserInitialState', {},
                call(layoutSource, 'viewportCenterWorld', { x: 0, y: 0 }));
            const localQuery = modal.querySelector('[data-media-browser-search="outputs"]');
            const danbooruQuery = modal.querySelector('[data-media-browser-search="danbooru"]');
            const folder = modal.querySelector('[data-media-browser-field="folder"]');
            const rating = modal.querySelector('[data-media-browser-field="rating"]');
            if (localQuery) state.query = localQuery.value || '';
            if (danbooruQuery) state.danbooruQuery = danbooruQuery.value || '';
            if (folder) state.folder = folder.value || '';
            if (rating) state.rating = rating.value || 'all';
            modal.__mediaBrowserState = state;
            return state;
        }

        function readMediaBrowserNodeFields(node, nodeEl) {
            const state = stateCall('mediaBrowserNodeState', {}, node);
            const localQuery = nodeEl?.querySelector?.('[data-media-browser-search="outputs"]');
            const danbooruQuery = nodeEl?.querySelector?.('[data-media-browser-search="danbooru"]');
            const folder = nodeEl?.querySelector?.('[data-media-browser-field="folder"]');
            const rating = nodeEl?.querySelector?.('[data-media-browser-field="rating"]');
            if (localQuery) state.query = localQuery.value || '';
            if (danbooruQuery) state.danbooruQuery = danbooruQuery.value || '';
            if (folder) state.folder = folder.value || '';
            if (rating) state.rating = rating.value || 'all';
            state.world = {
                x: Math.round(Number(node?.x || 0) + Number(node?.w || call(layoutSource, 'defaultNodeSize', {}, 'media_browser').w || 0) + 48),
                y: Math.round(Number(node?.y || 0))
            };
            return state;
        }

        function handleMediaBrowserNodeClick(node, evt, nodeEl) {
            if (!node || node.type !== 'media_browser') return false;
            const frostArea = evt.target.closest('.sai-media-browser-main');
            if (frostArea && call(frostSource, 'revealGalleryFrostArea', false, frostArea)) {
                stateCall('mediaBrowserRuntimeFor', {}, node.id).frostRevealed = true;
                evt.preventDefault();
                evt.stopPropagation();
                return true;
            }
            const tabButton = evt.target.closest('[data-media-browser-tab]');
            if (tabButton) {
                evt.preventDefault();
                evt.stopPropagation();
                const state = readMediaBrowserNodeFields(node, nodeEl);
                state.tab = tabButton.getAttribute('data-media-browser-tab') === 'danbooru' ? 'danbooru' : 'outputs';
                state.selectedId = '';
                state.page = 1;
                stateCall('saveMediaBrowserNodeState', undefined, node, state, { history: 'tab' });
                refreshNode(node).catch(err => warn('[SimpAI Canvas] media browser tab refresh failed', err));
                return true;
            }
            const typeButton = evt.target.closest('[data-media-browser-type]');
            if (typeButton) {
                evt.preventDefault();
                evt.stopPropagation();
                const state = readMediaBrowserNodeFields(node, nodeEl);
                state.mediaType = typeButton.getAttribute('data-media-browser-type') === 'video' ? 'video' : 'image';
                state.selectedId = '';
                stateCall('saveMediaBrowserNodeState', undefined, node, state, { history: 'type' });
                refreshNode(node).catch(err => warn('[SimpAI Canvas] media browser type refresh failed', err));
                return true;
            }
            const itemButton = evt.target.closest('[data-media-browser-item]');
            if (itemButton) {
                evt.preventDefault();
                evt.stopPropagation();
                const state = stateCall('mediaBrowserNodeState', {}, node);
                state.selectedId = itemButton.getAttribute('data-media-browser-item') || '';
                stateCall('saveMediaBrowserNodeState', undefined, node, state);
                renderNodes();
                if (evt.detail >= 2) {
                    const item = stateCall('selectedMediaBrowserNodeItem', null, node);
                    call(actionSource, 'addMediaBrowserItemToCanvas', Promise.resolve(), item, state, state.world)
                        .catch(err => warn('[SimpAI Canvas] media browser item add failed', err));
                }
                return true;
            }
            const actionButton = evt.target.closest('[data-media-browser-action]');
            if (!actionButton) return false;
            evt.preventDefault();
            evt.stopPropagation();
            const action = actionButton.getAttribute('data-media-browser-action') || '';
            handleMediaBrowserNodeAction(node, action, nodeEl).catch(err => {
                warn('[SimpAI Canvas] media browser node action failed', err);
                call(uiSource, 'showToast', undefined,
                    `${t('Media Browser action failed', '媒体浏览器操作失败')}：${err?.message || err || t('unknown error', '未知错误')}`);
            });
            return true;
        }

        async function handleMediaBrowserNodeAction(node, action, nodeEl) {
            const state = readMediaBrowserNodeFields(node, nodeEl);
            if (action === 'refresh' || action === 'search' || action === 'reconnect') {
                state.page = action === 'search' ? 1 : state.page;
                stateCall('saveMediaBrowserNodeState', undefined, node, state, { history: action });
                await refreshNode(node);
                return;
            }
            if (action === 'load-more') {
                await call(dataSource, 'loadMoreMediaBrowserNode', undefined, node, nodeEl);
                return;
            }
            if (action === 'open-modal') {
                actionCall('openMediaBrowserPanel', state.world || call(layoutSource, 'viewportCenterWorld', { x: 0, y: 0 }), state);
                return;
            }
            if (action === 'page-prev' || action === 'page-next') {
                state.page = Math.max(1, Number(state.page || 1) + (action === 'page-next' ? 1 : -1));
                stateCall('saveMediaBrowserNodeState', undefined, node, state, { history: 'page' });
                await refreshNode(node);
                return;
            }
            const item = stateCall('selectedMediaBrowserNodeItem', null, node);
            if (action === 'import') {
                await actionCall('addMediaBrowserItemToCanvas', item, state,
                    state.world || call(layoutSource, 'viewportCenterWorld', { x: 0, y: 0 }));
            } else if (action === 'copy-prompt') {
                await actionCall('copyMediaBrowserItemPrompt', item);
            } else if (action === 'apply-prompt') {
                actionCall('applyMediaBrowserItemPromptToTarget', item, state);
            } else if (action === 'delete-local') {
                if (!await actionCall('deleteLocalMediaBrowserItem', item, state)) return;
                state.selectedId = '';
                stateCall('saveMediaBrowserNodeState', undefined, node, state, { history: 'delete-local' });
                await refreshNode(node);
            }
        }

        function handleMediaBrowserNodeChange(node, evt, nodeEl) {
            if (!node || node.type !== 'media_browser') return false;
            const frostToggle = evt.target.closest('[data-media-browser-frost]');
            if (frostToggle) {
                call(frostSource, 'setGalleryFrostEnabled', undefined, !!frostToggle.checked);
                renderNodes();
                return true;
            }
            const field = evt.target.closest('[data-media-browser-field]');
            if (!field) return false;
            const state = readMediaBrowserNodeFields(node, nodeEl);
            state.selectedId = '';
            if (field.getAttribute('data-media-browser-field') === 'rating') state.page = 1;
            stateCall('saveMediaBrowserNodeState', undefined, node, state, { history: field.getAttribute('data-media-browser-field') || 'field' });
            refreshNode(node).catch(err => warn('[SimpAI Canvas] media browser field refresh failed', err));
            return true;
        }

        function handleMediaBrowserNodeKeydown(node, evt, nodeEl) {
            if (!node || node.type !== 'media_browser' || evt.key !== 'Enter') return false;
            const field = evt.target.closest('[data-media-browser-search]');
            if (!field) return false;
            evt.preventDefault();
            evt.stopPropagation();
            const state = readMediaBrowserNodeFields(node, nodeEl);
            state.page = 1;
            stateCall('saveMediaBrowserNodeState', undefined, node, state, { history: 'search-enter' });
            refreshNode(node).catch(err => warn('[SimpAI Canvas] media browser enter refresh failed', err));
            return true;
        }

        return {
            readMediaBrowserFields, readMediaBrowserNodeFields, handleMediaBrowserNodeClick,
            handleMediaBrowserNodeAction, handleMediaBrowserNodeChange, handleMediaBrowserNodeKeydown
        };
    }

    window.SimpAICanvasWorkbenchMediaBrowserInteraction = Object.assign(
        {}, window.SimpAICanvasWorkbenchMediaBrowserInteraction || {}, { createCanvasMediaBrowserInteractionController }
    );
})();
