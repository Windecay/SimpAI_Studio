(function () {
    'use strict';

    function createCanvasScrollController(context) {
        const scope = context?.scrollSource || context || {};
        const previewSource = scope.previewSource || {};
        const vlmSource = scope.vlmSource || {};
        const mediaSource = scope.mediaSource || {};
        const nodeSource = scope.nodeSource || {};
        const danbooruSource = scope.danbooruSource || {};
        const runtimeSource = scope.runtimeSource || {};
        const call = (sourceObject, name, ...args) => typeof sourceObject[name] === 'function'
            ? sourceObject[name](...args)
            : undefined;

        function onScroll(evt) {
            const target = evt?.target;
            if (call(previewSource, 'isPreviewSelectMenuOpen') && !call(previewSource, 'previewSelectMenuContains', target)) {
                call(previewSource, 'closePreviewSelectMenu');
            }

            const log = target?.classList?.contains?.('sai-vlm-chat-log') ? target : null;
            if (log) call(vlmSource, 'updateVlmChatJumpButton', log.closest?.('.sai-vlm-chat-shell'));

            const mediaBrowserGrid = target?.closest?.('.sai-media-browser-node .sai-media-browser-grid');
            if (mediaBrowserGrid && call(mediaSource, 'mediaBrowserShouldAutoLoadMore', mediaBrowserGrid)) {
                const nodeEl = mediaBrowserGrid.closest?.('[data-node-id]');
                const node = nodeEl ? call(nodeSource, 'getNode', nodeEl.getAttribute?.('data-node-id')) : null;
                if (node?.type === 'media_browser') {
                    const runtime = call(mediaSource, 'mediaBrowserRuntimeFor', node.id) || {};
                    const data = runtime.data || {};
                    if (data.has_more && !runtime.loadingMore) {
                        const result = call(mediaSource, 'loadMoreMediaBrowserNode', node, nodeEl);
                        if (result && typeof result.catch === 'function') {
                            result.catch((err) => call(runtimeSource, 'warn', '[SimpAI Canvas] media browser node stream load failed', err));
                        }
                    }
                }
            }

            if (call(danbooruSource, 'hasDanbooruAutocompleteField')) call(danbooruSource, 'positionDanbooruAutocompleteDropdown');
        }

        return { onScroll };
    }

    window.SimpAICanvasWorkbenchScroll = Object.assign({}, window.SimpAICanvasWorkbenchScroll || {}, {
        createCanvasScrollController
    });
})();
