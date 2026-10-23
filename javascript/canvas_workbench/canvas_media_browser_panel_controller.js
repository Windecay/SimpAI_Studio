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
        const projectSource = scope.projectSource || {};
        const panelProjects = new WeakMap();
        const call = (source, name, fallback, ...args) => typeof source[name] === 'function'
            ? source[name](...args) : fallback;
        const stateCall = (name, ...args) => call(stateSource, name, undefined, ...args);
        const dataCall = (name, ...args) => call(dataSource, name, undefined, ...args);
        const actionCall = (name, ...args) => call(actionSource, name, undefined, ...args);
        const center = () => call(stateSource, 'viewportCenterWorld', { x: 0, y: 0 });
        const initialState = () => stateCall('mediaBrowserInitialState', center());
        const readFields = modal => stateCall('readMediaBrowserFields', modal);
        const refresh = modal => dataCall('refreshMediaBrowserPanel', modal);
        const getProject = () => call(projectSource, 'getProject', null);
        const isCurrentPanel = modal => !!panelProjects.get(modal) && getProject() === panelProjects.get(modal)
            && modal.isConnected !== false && call(domSource, 'getDocument', null)?.querySelector('.sai-media-browser-modal') === modal;

        function openMediaBrowserPanel(world, initial) {
            const project = getProject();
            if (!project) return;
            const document = call(domSource, 'getDocument', null);
            const existing = document.querySelector('.sai-media-browser-modal');
            if (existing) existing.remove();
            const modal = document.createElement('div');
            panelProjects.set(modal, project);
            modal.className = `sai-canvas-modal sai-media-browser-modal ${call(domSource, 'detectWorkbenchTheme', '') === 'dark' ? 'theme-dark' : ''}`;
            modal.__mediaBrowserState = stateCall('normalizeMediaBrowserState',
                initial || stateCall('mediaBrowserInitialState', world || center()), world || center());
            modal.__mediaBrowserData = { ok: true, items: [], folders: [] };
            modal.addEventListener('click', async evt => {
                if (evt.target === modal || evt.target.closest('[data-modal-close]')) {
                    modal.remove();
                    return;
                }
                if (!isCurrentPanel(modal)) return;
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
                    if (evt.detail >= 2) await actionCall('importSelectedMediaBrowserItem', modal, {
                        project, shouldContinue: () => isCurrentPanel(modal)
                    });
                    return;
                }
                const actionButton = evt.target.closest('[data-media-browser-action]');
                if (!actionButton) return;
                const action = actionButton.getAttribute('data-media-browser-action');
                if (action === 'refresh' || action === 'search' || action === 'reconnect') {
                    readFields(modal);
                    if (action === 'search') modal.__mediaBrowserState.page = 1;
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
                    await actionCall('importSelectedMediaBrowserItem', modal, {
                        project, shouldContinue: () => isCurrentPanel(modal)
                    });
                } else if (action === 'copy-prompt') {
                    await copySelectedMediaBrowserPrompt(modal);
                } else if (action === 'apply-prompt') {
                    applySelectedMediaBrowserPromptToTarget(modal);
                } else if (action === 'delete-local') {
                    await deleteSelectedMediaBrowserPanelItem(modal);
                }
            });
            modal.addEventListener('change', async evt => {
                if (!isCurrentPanel(modal)) return;
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
                if (!isCurrentPanel(modal)) return;
                if (evt.key !== 'Enter') return;
                const field = evt.target.closest('[data-media-browser-search]');
                if (!field) return;
                evt.preventDefault();
                readFields(modal);
                modal.__mediaBrowserState.page = 1;
                await refresh(modal);
            });
            modal.addEventListener('scroll', evt => {
                if (!isCurrentPanel(modal)) return;
                const grid = evt.target?.closest?.('.sai-media-browser-grid');
                if (grid) dataCall('maybeAutoLoadMoreMediaBrowserPanel', modal, grid);
            }, true);
            document.body.appendChild(modal);
            renderMediaBrowserPanel(modal, true);
            refresh(modal).catch(err => {
                if (!isCurrentPanel(modal)) return;
                modal.__mediaBrowserData = { ok: false, error: err?.message || String(err || 'media browser failed'), items: [] };
                renderMediaBrowserPanel(modal);
            });
        }

        function renderMediaBrowserPanel(modal, loading) {
            if (!isCurrentPanel(modal)) return;
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
            if (!isCurrentPanel(modal)) return;
            await actionCall('copySelectedMediaBrowserPrompt', modal, {
                project: getProject(), shouldContinue: () => isCurrentPanel(modal)
            });
        }

        function applySelectedMediaBrowserPromptToTarget(modal) {
            if (!isCurrentPanel(modal)) return false;
            return actionCall('applySelectedMediaBrowserPromptToTarget', modal);
        }

        async function deleteSelectedMediaBrowserPanelItem(modal) {
            if (!isCurrentPanel(modal)) return false;
            const item = stateCall('selectedMediaBrowserItem', modal);
            const state = modal.__mediaBrowserState || initialState();
            const selectedId = String(state.selectedId || '');
            const options = { project: getProject(), shouldContinue: () => isCurrentPanel(modal) };
            if (!await actionCall('deleteLocalMediaBrowserItem', item, state, options)) return false;
            if (!isCurrentPanel(modal)) return true;
            const current = modal.__mediaBrowserState || initialState();
            if (String(current.selectedId || '') === selectedId) current.selectedId = '';
            modal.__mediaBrowserState = current;
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
