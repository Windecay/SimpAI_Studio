(function () {
    'use strict';

    function createCanvasMediaBrowserPanelController(context) {
        const scope = context?.mediaBrowserPanelSource || context || {};
        const domSource = scope.domSource || {};
        const stateSource = scope.stateSource || {};
        const dataSource = scope.dataSource || {};
        const actionSource = scope.actionSource || {};
        const frostSource = scope.frostSource || {};
        const renderSource = scope.renderSource || {};
        const call = (source, name, fallback, ...args) => typeof source[name] === 'function'
            ? source[name](...args) : fallback;
        const stateCall = (name, ...args) => call(stateSource, name, undefined, ...args);
        const dataCall = (name, ...args) => call(dataSource, name, undefined, ...args);
        const actionCall = (name, ...args) => call(actionSource, name, undefined, ...args);
        const center = () => call(stateSource, 'viewportCenterWorld', { x: 0, y: 0 });
        const initialState = () => stateCall('mediaBrowserInitialState', center());
        const readFields = modal => stateCall('readMediaBrowserFields', modal);
        const refresh = modal => dataCall('refreshMediaBrowserPanel', modal);

        function openMediaBrowserPanel(world, initial) {
            const document = call(domSource, 'getDocument', null);
            const existing = document.querySelector('.sai-media-browser-modal');
            if (existing) existing.remove();
            const modal = document.createElement('div');
            modal.className = `sai-canvas-modal sai-media-browser-modal ${call(domSource, 'detectWorkbenchTheme', '') === 'dark' ? 'theme-dark' : ''}`;
            modal.__mediaBrowserState = stateCall('normalizeMediaBrowserState',
                initial || stateCall('mediaBrowserInitialState', world || center()), world || center());
            modal.__mediaBrowserData = { ok: true, items: [], folders: [] };
            modal.addEventListener('click', async evt => {
                if (evt.target === modal || evt.target.closest('[data-modal-close]')) {
                    modal.remove();
                    return;
                }
                const frostArea = evt.target.closest('.sai-media-browser-main');
                if (frostArea && call(frostSource, 'revealGalleryFrostArea', false, modal)) {
                    evt.preventDefault();
                    evt.stopPropagation();
                    return;
                }
                const tabButton = evt.target.closest('[data-media-browser-tab]');
                if (tabButton) {
                    modal.__mediaBrowserState.tab = tabButton.getAttribute('data-media-browser-tab') || 'outputs';
                    modal.__mediaBrowserState.selectedId = '';
                    modal.__mediaBrowserState.page = 1;
                    await refresh(modal);
                    return;
                }
                const typeButton = evt.target.closest('[data-media-browser-type]');
                if (typeButton) {
                    modal.__mediaBrowserState.mediaType = typeButton.getAttribute('data-media-browser-type') || 'image';
                    modal.__mediaBrowserState.selectedId = '';
                    await refresh(modal);
                    return;
                }
                const itemButton = evt.target.closest('[data-media-browser-item]');
                if (itemButton) {
                    modal.__mediaBrowserState.selectedId = itemButton.getAttribute('data-media-browser-item') || '';
                    renderMediaBrowserPanel(modal);
                    if (evt.detail >= 2) await actionCall('importSelectedMediaBrowserItem', modal);
                    return;
                }
                const actionButton = evt.target.closest('[data-media-browser-action]');
                if (!actionButton) return;
                const action = actionButton.getAttribute('data-media-browser-action');
                if (action === 'refresh' || action === 'search' || action === 'reconnect') {
                    readFields(modal);
                    await refresh(modal);
                } else if (action === 'load-more') {
                    await dataCall('loadMoreMediaBrowserPanel', modal);
                } else if (action === 'page-prev') {
                    modal.__mediaBrowserState.page = Math.max(1, Number(modal.__mediaBrowserState.page || 1) - 1);
                    await refresh(modal);
                } else if (action === 'page-next') {
                    modal.__mediaBrowserState.page = Math.max(1, Number(modal.__mediaBrowserState.page || 1) + 1);
                    await refresh(modal);
                } else if (action === 'import') {
                    await actionCall('importSelectedMediaBrowserItem', modal);
                } else if (action === 'copy-prompt') {
                    await copySelectedMediaBrowserPrompt(modal);
                } else if (action === 'apply-prompt') {
                    applySelectedMediaBrowserPromptToTarget(modal);
                } else if (action === 'delete-local') {
                    await deleteSelectedMediaBrowserPanelItem(modal);
                }
            });
            modal.addEventListener('change', async evt => {
                const frostToggle = evt.target.closest('[data-media-browser-frost]');
                if (frostToggle) {
                    call(frostSource, 'setGalleryFrostEnabled', undefined, !!frostToggle.checked);
                    renderMediaBrowserPanel(modal);
                    call(renderSource, 'renderNodes', undefined);
                    return;
                }
                const field = evt.target.closest('[data-media-browser-field]');
                if (!field) return;
                readFields(modal);
                modal.__mediaBrowserState.selectedId = '';
                if (field.getAttribute('data-media-browser-field') === 'rating') modal.__mediaBrowserState.page = 1;
                await refresh(modal);
            });
            modal.addEventListener('keydown', async evt => {
                if (evt.key !== 'Enter') return;
                const field = evt.target.closest('[data-media-browser-search]');
                if (!field) return;
                evt.preventDefault();
                readFields(modal);
                modal.__mediaBrowserState.page = 1;
                await refresh(modal);
            });
            modal.addEventListener('scroll', evt => {
                const grid = evt.target?.closest?.('.sai-media-browser-grid');
                if (grid) dataCall('maybeAutoLoadMoreMediaBrowserPanel', modal, grid);
            }, true);
            document.body.appendChild(modal);
            renderMediaBrowserPanel(modal, true);
            refresh(modal).catch(err => {
                modal.__mediaBrowserData = { ok: false, error: err?.message || String(err || 'media browser failed'), items: [] };
                renderMediaBrowserPanel(modal);
            });
        }

        function renderMediaBrowserPanel(modal, loading) {
            call(frostSource, 'syncGalleryFrostClass', undefined);
            modal.classList.toggle('sai-media-browser-frost-enabled', call(frostSource, 'isGalleryFrostEnabled', false));
            const scrollState = loading ? null : call(renderSource, 'captureMediaBrowserScroll', null, modal);
            const state = modal.__mediaBrowserState || initialState();
            const data = modal.__mediaBrowserData || { ok: true, items: [], folders: [] };
            const selected = stateCall('selectedMediaBrowserItem', modal);
            const loadingMore = !!modal.__mediaBrowserLoadingMore;
            modal.innerHTML = call(renderSource, 'renderMediaBrowserPanelHtml', '', state, data, loading, {
                selectedItem: selected,
                loadingMore,
                frostEnabled: call(frostSource, 'isGalleryFrostEnabled', false)
            });
            call(domSource, 'ensureWorkbenchFormFieldNames', undefined, modal, 'media_browser');
            if (!loading) call(renderSource, 'restoreMediaBrowserScroll', undefined, modal, scrollState);
        }

        async function copySelectedMediaBrowserPrompt(modal) {
            await actionCall('copySelectedMediaBrowserPrompt', modal);
        }

        function applySelectedMediaBrowserPromptToTarget(modal) {
            return actionCall('applySelectedMediaBrowserPromptToTarget', modal);
        }

        async function deleteSelectedMediaBrowserPanelItem(modal) {
            const item = stateCall('selectedMediaBrowserItem', modal);
            const state = modal.__mediaBrowserState || initialState();
            if (!await actionCall('deleteLocalMediaBrowserItem', item, state)) return false;
            state.selectedId = '';
            modal.__mediaBrowserState = state;
            await refresh(modal);
            return true;
        }

        return {
            openMediaBrowserPanel, renderMediaBrowserPanel, copySelectedMediaBrowserPrompt,
            applySelectedMediaBrowserPromptToTarget, deleteSelectedMediaBrowserPanelItem
        };
    }

    window.SimpAICanvasWorkbenchMediaBrowserPanel = Object.assign(
        {}, window.SimpAICanvasWorkbenchMediaBrowserPanel || {}, { createCanvasMediaBrowserPanelController }
    );
})();
