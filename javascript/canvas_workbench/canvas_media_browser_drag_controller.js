(function () {
    'use strict';

    function createCanvasMediaBrowserDragController(context) {
        const scope = context?.mediaBrowserDragSource || context || {};
        const configSource = scope.configSource || {};
        const mediaSource = scope.mediaSource || {};
        const viewportSource = scope.viewportSource || {};
        const getDragMime = () => {
            const value = typeof configSource.getDragMime === 'function' ? configSource.getDragMime() : '';
            return String(value || 'application/x-simpleai-media-browser-item').trim()
                || 'application/x-simpleai-media-browser-item';
        };
        const getNodeState = (node) => typeof mediaSource.getMediaBrowserNodeState === 'function'
            ? (mediaSource.getMediaBrowserNodeState(node) || {})
            : {};
        const getNodeItems = (node) => typeof mediaSource.getMediaBrowserItems === 'function'
            ? (mediaSource.getMediaBrowserItems(node) || [])
            : [];
        const serializeState = (state) => typeof mediaSource.serializableMediaBrowserState === 'function'
            ? mediaSource.serializableMediaBrowserState(state)
            : state;
        const getViewport = () => typeof viewportSource.getViewport === 'function' ? viewportSource.getViewport() : null;
        let dragPayload = null;

        function mediaBrowserNodeDragPayload(node, itemId) {
            if (!node || node.type !== 'media_browser') return null;
            const state = getNodeState(node);
            const sourceItems = getNodeItems(node);
            const items = Array.isArray(sourceItems) ? sourceItems : [];
            const item = items.find(entry => String(entry?.id || '') === String(itemId || ''));
            if (!item) return null;
            return {
                source: 'media_browser_node',
                node_id: node.id,
                tab: state.tab,
                media_type: state.mediaType,
                item,
                state: serializeState(Object.assign({}, state, { selectedId: item.id || '' }))
            };
        }

        function mediaBrowserPayloadFromDataTransfer(dataTransfer) {
            if (!dataTransfer) return null;
            const types = dataTransfer.types ? Array.from(dataTransfer.types) : [];
            const dragMime = getDragMime();
            if (types.includes(dragMime)) {
                try {
                    const payload = JSON.parse(dataTransfer.getData(dragMime) || '{}');
                    if (payload?.item) return payload;
                } catch (err) {
                    console.warn('[SimpAI Canvas] media browser drag payload parse failed', err);
                }
            }
            return dragPayload?.item ? dragPayload : null;
        }

        function clearMediaBrowserDragPayload() {
            dragPayload = null;
        }

        function bindMediaBrowserNodeDragEvents(nodeEl, node) {
            if (!nodeEl || !node || node.type !== 'media_browser') return;
            nodeEl.addEventListener('dragstart', (evt) => {
                const itemButton = evt.target?.closest?.('[data-media-browser-item]');
                if (!itemButton || !nodeEl.contains(itemButton)) return;
                const payload = mediaBrowserNodeDragPayload(node, itemButton.getAttribute('data-media-browser-item') || '');
                if (!payload) return;
                dragPayload = payload;
                try {
                    const dragMime = getDragMime();
                    evt.dataTransfer.effectAllowed = 'copy';
                    evt.dataTransfer.setData(dragMime, JSON.stringify(payload));
                    evt.dataTransfer.setData('text/plain', payload.item.name || payload.item.title || payload.item.id || 'media browser item');
                    const thumb = itemButton.querySelector('.sai-media-browser-thumb');
                    if (thumb) evt.dataTransfer.setDragImage(thumb, Math.min(48, thumb.clientWidth / 2), Math.min(48, thumb.clientHeight / 2));
                } catch (err) {
                    console.warn('[SimpAI Canvas] media browser drag setup failed', err);
                }
                itemButton.classList.add('is-dragging');
                nodeEl.classList.add('is-media-browser-dragging');
                evt.stopPropagation();
            }, true);
            nodeEl.addEventListener('dragend', () => {
                clearMediaBrowserDragPayload();
                nodeEl.classList.remove('is-media-browser-dragging');
                nodeEl.querySelectorAll('.sai-media-browser-card.is-dragging').forEach(el => el.classList.remove('is-dragging'));
                getViewport()?.classList?.remove?.('is-drop-target');
            }, true);
        }

        return {
            mediaBrowserNodeDragPayload,
            mediaBrowserPayloadFromDataTransfer,
            bindMediaBrowserNodeDragEvents,
            clearMediaBrowserDragPayload,
            getDragPayload: () => dragPayload
        };
    }

    window.SimpAICanvasWorkbenchMediaBrowserDrag = Object.assign({}, window.SimpAICanvasWorkbenchMediaBrowserDrag || {}, {
        createCanvasMediaBrowserDragController
    });
})();
