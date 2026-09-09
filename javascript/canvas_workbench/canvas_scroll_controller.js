(function () {
    'use strict';

    function createCanvasScrollController(context) {
        const scope = context || {};
        const call = (name, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : undefined;

        function onScroll(evt) {
            const target = evt?.target;
            if (call('isPreviewSelectMenuOpen') && !call('previewSelectMenuContains', target)) {
                call('closePreviewSelectMenu');
            }

            const log = target?.classList?.contains?.('sai-vlm-chat-log') ? target : null;
            if (log) call('updateVlmChatJumpButton', log.closest?.('.sai-vlm-chat-shell'));

            const mediaBrowserGrid = target?.closest?.('.sai-media-browser-node .sai-media-browser-grid');
            if (mediaBrowserGrid && call('mediaBrowserShouldAutoLoadMore', mediaBrowserGrid)) {
                const nodeEl = mediaBrowserGrid.closest?.('[data-node-id]');
                const node = nodeEl ? call('getNode', nodeEl.getAttribute?.('data-node-id')) : null;
                if (node?.type === 'media_browser') {
                    const runtime = call('mediaBrowserRuntimeFor', node.id) || {};
                    const data = runtime.data || {};
                    if (data.has_more && !runtime.loadingMore) {
                        const result = call('loadMoreMediaBrowserNode', node, nodeEl);
                        if (result && typeof result.catch === 'function') {
                            result.catch((err) => call('warn', '[SimpAI Canvas] media browser node stream load failed', err));
                        }
                    }
                }
            }

            if (call('hasDanbooruAutocompleteField')) call('positionDanbooruAutocompleteDropdown');
        }

        return { onScroll };
    }

    window.SimpAICanvasWorkbenchScroll = Object.assign({}, window.SimpAICanvasWorkbenchScroll || {}, {
        createCanvasScrollController
    });
})();
