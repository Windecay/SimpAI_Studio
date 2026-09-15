(function () {
    'use strict';

    function call(source, name, fallback, ...args) {
        if (typeof source?.[name] === 'function') return source[name](...args);
        return fallback;
    }

    function createCanvasMediaBrowserPaintController(source) {
        const scope = source?.mediaBrowserPaintSource || source || {};
        const timingSource = scope.timingSource || {};
        const renderSource = scope.renderSource || {};
        const scrollMemory = new Map();
        const performanceNow = () => Number(call(timingSource, 'performanceNow', 0)) || 0;
        const requestFrame = (callback) => call(timingSource, 'requestAnimationFrame', null, callback);
        const schedule = (...args) => call(timingSource, 'setTimeout', undefined, ...args);
        const renderMediaBrowserPanel = (...args) => call(renderSource, 'renderMediaBrowserPanel', undefined, ...args);
        const findMediaBrowserNodeElement = (...args) => call(renderSource, 'findMediaBrowserNodeElement', null, ...args);

        function captureMediaBrowserScroll(scopeElement, memoryKey) {
            const grid = scopeElement?.querySelector?.('.sai-media-browser-grid') || null;
            if (!grid) return memoryKey ? (scrollMemory.get(memoryKey) || null) : null;
            const state = {
                top: grid.scrollTop || 0,
                left: grid.scrollLeft || 0,
                height: grid.scrollHeight || 0,
                clientHeight: grid.clientHeight || 0,
                capturedAt: performanceNow()
            };
            if (memoryKey) scrollMemory.set(memoryKey, state);
            return state;
        }

        function restoreMediaBrowserScroll(scopeElement, state, memoryKey) {
            const target = state || (memoryKey ? scrollMemory.get(memoryKey) : null);
            if (!target) return;
            const applyRestore = () => {
                const grid = scopeElement?.querySelector?.('.sai-media-browser-grid') || null;
                if (!grid) return false;
                const maxTop = Math.max(0, (grid.scrollHeight || 0) - (grid.clientHeight || 0));
                grid.scrollTop = Math.min(Math.max(0, Number(target.top || 0)), maxTop);
                grid.scrollLeft = Math.max(0, Number(target.left || 0));
                if (memoryKey) {
                    scrollMemory.set(memoryKey, Object.assign({}, target, {
                        top: grid.scrollTop || 0,
                        left: grid.scrollLeft || 0,
                        height: grid.scrollHeight || 0,
                        clientHeight: grid.clientHeight || 0,
                        capturedAt: performanceNow()
                    }));
                }
                return true;
            };
            if (!applyRestore()) return;
            requestFrame(applyRestore);
            schedule(applyRestore, 180);
        }

        function primeMediaBrowserThumbImages(modal) {
            const images = Array.from(modal?.querySelectorAll?.('.sai-media-browser-thumb img') || []).slice(0, 48);
            images.forEach((img, index) => {
                try {
                    img.loading = 'eager';
                    img.fetchPriority = index < 16 ? 'high' : 'auto';
                    if (typeof img.decode === 'function' && !img.complete) img.decode().catch(() => {});
                } catch (err) {}
            });
        }

        function nudgeMediaBrowserPaint(modal) {
            const grid = modal?.querySelector?.('.sai-media-browser-grid');
            if (!grid) return;
            try {
                grid.style.transform = 'translateZ(0)';
                grid.getBoundingClientRect();
                requestFrame(() => {
                    if (grid.isConnected) grid.style.transform = '';
                });
            } catch (err) {}
        }

        function scheduleMediaBrowserPaintRefresh(modal) {
            if (!modal || !modal.isConnected) return;
            const seq = Number(modal.__mediaBrowserPaintSeq || 0) + 1;
            modal.__mediaBrowserPaintSeq = seq;
            requestFrame(() => {
                if (!modal.isConnected || modal.__mediaBrowserPaintSeq !== seq) return;
                primeMediaBrowserThumbImages(modal);
                nudgeMediaBrowserPaint(modal);
                schedule(() => {
                    if (!modal.isConnected || modal.__mediaBrowserPaintSeq !== seq) return;
                    renderMediaBrowserPanel(modal, false);
                    requestFrame(() => {
                        if (!modal.isConnected || modal.__mediaBrowserPaintSeq !== seq) return;
                        primeMediaBrowserThumbImages(modal);
                        nudgeMediaBrowserPaint(modal);
                    });
                }, 140);
            });
        }

        function scheduleMediaBrowserNodePaintRefresh(nodeId) {
            if (!nodeId) return;
            requestFrame(() => {
                const nodeEl = findMediaBrowserNodeElement(nodeId);
                if (!nodeEl) return;
                primeMediaBrowserThumbImages(nodeEl);
                nudgeMediaBrowserPaint(nodeEl);
            });
        }

        return {
            getMediaBrowserScrollMemory: () => scrollMemory,
            captureMediaBrowserScroll,
            restoreMediaBrowserScroll,
            primeMediaBrowserThumbImages,
            nudgeMediaBrowserPaint,
            scheduleMediaBrowserPaintRefresh,
            scheduleMediaBrowserNodePaintRefresh
        };
    }

    window.SimpAICanvasWorkbenchMediaBrowserPaint = Object.assign(
        {},
        window.SimpAICanvasWorkbenchMediaBrowserPaint || {},
        { createCanvasMediaBrowserPaintController }
    );
})();
