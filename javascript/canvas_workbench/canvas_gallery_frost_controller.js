(function () {
    'use strict';

    function createCanvasGalleryFrostController(context) {
        const scope = context?.galleryFrostSource || context || {};
        const windowSource = scope.windowSource || {};
        const documentSource = scope.documentSource;
        const mediaBrowserSource = scope.mediaBrowserSource || {};
        const renderSource = scope.renderSource || {};
        const call = (source, name, fallback, ...args) => typeof source[name] === 'function'
            ? source[name](...args)
            : fallback;

        function getDocument() {
            return typeof documentSource === 'function' ? documentSource() : documentSource;
        }

        function isGalleryFrostEnabled() {
            if (typeof windowSource.isSimpleAIGalleryFrostEnabled === 'function') {
                try { return !!windowSource.isSimpleAIGalleryFrostEnabled(); } catch (err) {}
            }
            return true;
        }

        function syncGalleryFrostClass() {
            try {
                getDocument().documentElement.classList.toggle('simpai-gallery-frost-enabled', isGalleryFrostEnabled());
            } catch (err) {}
        }

        function setGalleryFrostEnabled(enabled) {
            const next = !!enabled;
            if (typeof windowSource.setSimpleAIGalleryFrostEnabled === 'function') {
                try {
                    windowSource.setSimpleAIGalleryFrostEnabled(next, { reset: true, source: 'canvas' });
                } catch (err) {}
            } else {
                syncGalleryFrostClass();
            }
            syncGalleryFrostClass();
            if (next) resetGalleryFrostReveals();
        }

        function revealGalleryFrostArea(area) {
            if (!area || !area.querySelector || !isGalleryFrostEnabled()) return false;
            if (area.getAttribute('data-sai-frost-revealed') === '1') return false;
            if (!area.querySelector('img, video')) return false;
            area.setAttribute('data-sai-frost-revealed', '1');
            return true;
        }

        function resetGalleryFrostReveals() {
            getDocument().querySelectorAll('.sai-media-browser-modal[data-sai-frost-revealed], .sai-media-browser-modal [data-sai-frost-revealed], .sai-media-browser-node[data-sai-frost-revealed], .sai-media-browser-node [data-sai-frost-revealed]').forEach((el) => {
                el.removeAttribute('data-sai-frost-revealed');
            });
            const runtime = call(mediaBrowserSource, 'getMediaBrowserNodeRuntime', null);
            if (runtime?.forEach) {
                runtime.forEach((item) => {
                    if (item) item.frostRevealed = false;
                });
            }
        }

        function initialize() {
            syncGalleryFrostClass();
            windowSource.addEventListener('simpleai-gallery-frost-change', () => {
                syncGalleryFrostClass();
                resetGalleryFrostReveals();
                if (call(renderSource, 'hasNodesLayer', false)) call(renderSource, 'renderNodes', undefined);
            });
        }

        return {
            initialize,
            isGalleryFrostEnabled,
            syncGalleryFrostClass,
            setGalleryFrostEnabled,
            revealGalleryFrostArea,
            resetGalleryFrostReveals
        };
    }

    window.SimpAICanvasWorkbenchGalleryFrost = Object.assign({}, window.SimpAICanvasWorkbenchGalleryFrost || {}, {
        createCanvasGalleryFrostController
    });
})();
