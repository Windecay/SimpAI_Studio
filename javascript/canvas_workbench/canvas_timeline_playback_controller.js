(function () {
    'use strict';

    function createCanvasTimelinePlaybackController(context) {
        const scope = context || {};
        const call = (name, fallback, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : fallback;
        const getNode = (id) => call('getNode', null, id);
        const getNodeElement = (id) => call('getNodeElement', null, id);
        const performanceNow = () => {
            if (typeof scope.performanceNow === 'function') return Number(scope.performanceNow()) || 0;
            if (typeof performance !== 'undefined' && typeof performance.now === 'function') return performance.now();
            return Date.now();
        };
        const requestFrame = (callback) => {
            if (typeof scope.requestAnimationFrame === 'function') return scope.requestAnimationFrame(callback);
            if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(callback);
            return setTimeout(callback, 16);
        };
        const cancelFrame = (handle) => {
            if (typeof scope.cancelAnimationFrame === 'function') {
                scope.cancelAnimationFrame(handle);
                return;
            }
            if (typeof cancelAnimationFrame === 'function') {
                cancelAnimationFrame(handle);
                return;
            }
            clearTimeout(handle);
        };
        let playbackState = null;

        function refreshTimelinePlaybackButtonDom(nodeEl, node) {
            if (!nodeEl || !node) return;
            nodeEl.querySelectorAll?.('[data-node-action="timeline-preview-play"]').forEach((button) => {
                const icon = button.querySelector?.('i');
                const playing = !!node.params?.preview_playing;
                button.title = playing ? 'Pause' : 'Play';
                if (icon) {
                    icon.classList.toggle('fa-play', !playing);
                    icon.classList.toggle('fa-pause', playing);
                }
            });
        }

        function syncTimelinePlaybackDom(nodeEl, node) {
            if (!nodeEl || !node) return;
            call('syncTimelinePreviewVideos', undefined, nodeEl, node);
            refreshTimelinePlaybackButtonDom(nodeEl, node);
        }

        function toggleTimelinePreviewPlayback(node) {
            if (!node || node.type !== 'timeline') return false;
            node.params = Object.assign({}, node.params || {}, { preview_playing: !node.params?.preview_playing });
            if (node.params.preview_playing) startTimelinePlayback(node.id);
            else stopTimelinePlayback(node.id);
            syncTimelinePlaybackDom(getNodeElement(node.id), node);
            call('scheduleSave', undefined);
            return true;
        }

        function playTimelineFromStart(node) {
            if (!node || node.type !== 'timeline') return false;
            node.params = Object.assign({}, node.params || {}, { playhead: 0, preview_playing: true });
            const nodeEl = getNodeElement(node.id);
            if (nodeEl) {
                call('refreshTimelinePlayheadDom', undefined, nodeEl, node);
                call('refreshTimelinePreviewDom', undefined, nodeEl, node);
                refreshTimelinePlaybackButtonDom(nodeEl, node);
            }
            startTimelinePlayback(node.id, { loop: false });
            call('scheduleSave', undefined);
            return true;
        }

        function startTimelinePlayback(nodeId, options) {
            stopTimelinePlayback();
            const node = getNode(nodeId);
            if (!node || node.type !== 'timeline') return false;
            const opts = options || {};
            playbackState = {
                nodeId,
                startedAt: performanceNow(),
                startPlayhead: Number(node.params?.playhead || 0),
                loop: opts.loop === true,
                raf: 0
            };
            const tick = () => {
                if (!playbackState || playbackState.nodeId !== nodeId) return;
                const liveNode = getNode(nodeId);
                const nodeEl = getNodeElement(nodeId);
                if (!liveNode || !nodeEl || !liveNode.params?.preview_playing) {
                    stopTimelinePlayback(nodeId);
                    return;
                }
                const duration = Math.max(1, Number(liveNode.params.duration || 1));
                const elapsed = (performanceNow() - playbackState.startedAt) / 1000;
                const rawNext = playbackState.startPlayhead + elapsed;
                if (!playbackState.loop && rawNext >= duration) {
                    liveNode.params.playhead = duration;
                    liveNode.params.preview_playing = false;
                    call('refreshTimelinePlayheadDom', undefined, nodeEl, liveNode);
                    call('refreshTimelinePreviewDom', undefined, nodeEl, liveNode);
                    refreshTimelinePlaybackButtonDom(nodeEl, liveNode);
                    stopTimelinePlayback(nodeId);
                    call('scheduleSave', undefined);
                    return;
                }
                const next = playbackState.loop ? rawNext % duration : rawNext;
                liveNode.params.playhead = next;
                call('refreshTimelinePlayheadDom', undefined, nodeEl, liveNode);
                call('refreshTimelinePreviewDom', undefined, nodeEl, liveNode);
                playbackState.raf = requestFrame(tick);
            };
            playbackState.raf = requestFrame(tick);
            return true;
        }

        function stopTimelinePlayback(nodeId) {
            if (!playbackState) return false;
            if (nodeId && playbackState.nodeId !== nodeId) return false;
            if (playbackState.raf) cancelFrame(playbackState.raf);
            const oldNode = getNode(playbackState.nodeId);
            if (oldNode?.params) oldNode.params.preview_playing = false;
            syncTimelinePlaybackDom(getNodeElement(playbackState.nodeId), oldNode);
            playbackState = null;
            return true;
        }

        return {
            toggleTimelinePreviewPlayback,
            playTimelineFromStart,
            startTimelinePlayback,
            stopTimelinePlayback,
            refreshTimelinePlaybackButtonDom,
            isPlaying: () => !!playbackState,
            getPlayingNodeId: () => playbackState?.nodeId || null
        };
    }

    window.SimpAICanvasWorkbenchTimelinePlayback = Object.assign({}, window.SimpAICanvasWorkbenchTimelinePlayback || {}, {
        createCanvasTimelinePlaybackController
    });
})();
