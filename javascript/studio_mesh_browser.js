(function () {
    'use strict';

    const prefix = new URL(document.currentScript.src).pathname.split('/gradio_api/')[0];
    const apiBase = `${prefix}/simpleai/gallery`;
    let request;
    let items = [];
    let cursor = '';
    let selected = -1;
    let resultKey = '';
    const dialog = () => document.getElementById('studio-mesh-dialog');
    const entry = () => document.querySelector('#studio_mesh_browser [data-studio-mesh-open]');
    const find = (name) => dialog()?.querySelector(`[data-mesh-${name}]`);
    const t = (label) => window.SimpAII18n?.localize(label, label, window.simpleaiTopbarSystemParams) || label;

    function localize() {
        for (const element of document.querySelectorAll('#studio_mesh_browser [data-mesh-label]')) {
            const label = t(element.dataset.meshLabel);
            if (element.hasAttribute('aria-label') && element.getAttribute('aria-label') !== label) {
                element.setAttribute('aria-label', label);
            }
            if (element.hasAttribute('title') && element.title !== label) element.title = label;
            if (element.matches('span') && element.textContent !== label) element.textContent = label;
        }
        const resizeHandle = dialog()?.querySelector('.simpleai-popup-resize-handle');
        if (resizeHandle) {
            const resizeLabel = t('Resize window');
            if (resizeHandle.title !== resizeLabel) {
                resizeHandle.title = resizeLabel;
                resizeHandle.setAttribute('aria-label', resizeLabel);
            }
        }
    }

    function syncEntry() {
        const button = entry();
        if (!button) return;
        const hidden = window.simpleaiTopbarSystemParams?.__mesh_output !== true;
        if (button.hidden !== hidden) {
            button.hidden = hidden;
            if (hidden) dialog()?.close();
        }
        const expanded = String(!!dialog()?.open);
        if (button.getAttribute('aria-expanded') !== expanded) button.setAttribute('aria-expanded', expanded);
    }

    function updateControls() {
        find('select').disabled = !items.length;
        find('prev').disabled = selected <= 0;
        find('next').disabled = selected < 0 || (selected >= items.length - 1 && !cursor);
        find('refresh').disabled = !!request;
    }

    function showModel(index) {
        const item = items[index];
        if (!item) return;
        selected = index;
        find('select').selectedIndex = index;
        const download = find('download');
        download.href = item.download_url;
        download.download = item.name;
        download.hidden = false;
        const viewer = document.createElement('simpai-mesh-viewer');
        viewer.dataset.src = item.media_url;
        viewer.dataset.format = item.model_format;
        find('stage').querySelector('simpai-mesh-viewer')?.remove();
        find('stage').append(viewer);
        find('status').hidden = true;
        updateControls();
    }

    async function fetchItems({ preferredId, more = false } = {}) {
        if (!dialog()?.open) return;
        request?.abort();
        const controller = new AbortController();
        request = controller;
        const timeout = setTimeout(() => controller.abort(), 12000);
        const status = find('status');
        const preferred = preferredId || items[selected]?.media_id;
        status.textContent = t('Loading...');
        status.hidden = !!find('stage').querySelector('simpai-mesh-viewer');
        find('next').disabled = true;
        find('refresh').disabled = true;
        const read = async (path) => {
            const response = await fetch(`${apiBase}${path}`, { signal: controller.signal, credentials: 'same-origin' });
            if (!response.ok) throw new Error(`Media library HTTP ${response.status}`);
            return response.json();
        };
        try {
            const query = new URLSearchParams({ type: 'mesh', summary: '0', limit: '48' });
            if (more && cursor) query.set('cursor', cursor);
            const page = await read(`/api/items?${query}`);
            const incoming = page.items || [];
            if (preferredId && !incoming.some((item) => item.media_id === preferredId)) {
                const detail = await read(`/api/items/${encodeURIComponent(preferredId)}?refresh_metadata=0`).catch(() => null);
                if (detail?.item?.media_type === 'mesh') incoming.unshift(detail.item);
            }
            if (request !== controller) return;
            const list = more ? items.concat(incoming) : incoming;
            const next = more ? items.length : Math.max(0, list.findIndex((item) => item.media_id === preferred));
            items = list.filter((item, index) => list.findIndex((other) => other.media_id === item.media_id) === index);
            cursor = page.next_cursor || '';
            find('select').replaceChildren(...items.map((item) => new Option(item.title || item.name, item.media_id)));
            if (items.length) {
                showModel(Math.min(next, items.length - 1));
            } else {
                selected = -1;
                find('stage').querySelector('simpai-mesh-viewer')?.remove();
                find('download').hidden = true;
                status.textContent = t('No 3D models');
                status.hidden = false;
            }
        } catch {
            if (request !== controller) return;
            status.textContent = t('Unable to load 3D models.');
            status.hidden = false;
        } finally {
            clearTimeout(timeout);
            if (request === controller) {
                request = null;
                updateControls();
            }
        }
    }

    function open(preferredId) {
        const surface = dialog();
        if (!surface) return;
        const popup = window.installResizablePopup?.(surface, {
            dragHandle: find('handle'),
            isHidden: () => !surface.open,
            minWidth: 376,
            minHeight: 300,
            resizeLabel: t('Resize window'),
        });
        localize();
        if (!surface.open) surface.showModal();
        popup?.ensureWithinViewport();
        syncEntry();
        fetchItems({ preferredId });
    }

    document.addEventListener('click', (event) => {
        if (event.target.closest('[data-studio-mesh-open]:not([hidden])')) open();
        else if (event.target.closest('[data-mesh-close]')) dialog()?.close();
        else if (event.target.closest('[data-mesh-refresh]')) fetchItems();
        else if (event.target.closest('[data-mesh-prev]')) showModel(selected - 1);
        else if (event.target.closest('[data-mesh-next]')) {
            if (selected < items.length - 1) showModel(selected + 1);
            else if (cursor) fetchItems({ more: true });
        }
    });
    document.addEventListener('change', (event) => {
        if (event.target === find('select')) showModel(event.target.selectedIndex);
    });
    document.addEventListener('close', (event) => {
        if (event.target !== dialog() || event.target.open) return;
        event.target.__simpleaiResizeState?.cancelInteraction();
        request?.abort();
        request = null;
        find('stage').querySelector('simpai-mesh-viewer')?.remove();
        syncEntry();
    }, true);
    function sync() {
        syncEntry();
        localize();
    }
    window.addEventListener('simpai:system-params-updated', sync);
    window.addEventListener('simpai:preset-nav-completed', sync);
    window.addEventListener('simpai:studio-load-completed', sync);
    window.onAfterUiUpdate?.(sync);
    sync();
    window.SimpAIStudioMeshBrowser = {
        close() {
            dialog()?.close();
        },
        showResults(ids) {
            if (!Array.isArray(ids) || !ids.length || !dialog()) return;
            const key = ids.join(',');
            if (key === resultKey) return;
            resultKey = key;
            open(ids[0]);
        }
    };
})();
