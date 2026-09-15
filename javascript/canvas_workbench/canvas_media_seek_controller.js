(function () {
    'use strict';

    function createCanvasMediaSeekController(context) {
        const scope = context?.mediaSeekSource || context || {};
        const domSource = scope.domSource || {};
        const nodeSource = scope.nodeSource || {};
        const assetSource = scope.assetSource || {};
        const mediaSource = scope.mediaSource || {};
        const timingSource = scope.timingSource || {};
        const utilitySource = scope.utilitySource || {};
        const getDocument = () => typeof domSource.getDocument === 'function'
            ? domSource.getDocument()
            : null;
        const getNodesLayer = () => typeof domSource.getNodesLayer === 'function'
            ? domSource.getNodesLayer()
            : null;
        const getNode = (id) => typeof nodeSource.getNode === 'function'
            ? nodeSource.getNode(id)
            : null;
        const getMediaEditRange = (asset) => typeof mediaSource.getMediaEditRange === 'function'
            ? mediaSource.getMediaEditRange(asset)
            : { start: 0, end: Number(asset?.duration || 0) || 0, duration: Number(asset?.duration || 0) || 0, clipped: false };
        const safeAssetDisplaySrc = (asset, fallback) => typeof assetSource.safeAssetDisplaySrc === 'function'
            ? assetSource.safeAssetDisplaySrc(asset, fallback)
            : '';
        const inferChatImageRelativePath = (image) => typeof assetSource.inferChatImageRelativePath === 'function'
            ? assetSource.inferChatImageRelativePath(image)
            : '';
        const cssEscape = typeof utilitySource.cssEscape === 'function'
            ? utilitySource.cssEscape
            : (value) => String(value ?? '').replace(/["\\]/g, '\\$&');
        const schedule = (callback, delay) => typeof timingSource.setTimeout === 'function'
            ? timingSource.setTimeout(callback, delay)
            : undefined;
        const cancel = (handle) => {
            if (typeof timingSource.clearTimeout === 'function') timingSource.clearTimeout(handle);
        };
        const previewTimers = new Map();
        const pendingSeeks = new Map();

        function findNearestVideoFrame(asset, time) {
            const frames = Array.isArray(asset?.preview_frames)
                ? asset.preview_frames.filter((item) => item && (item.thumb || item.data_url || inferChatImageRelativePath(item)))
                : [];
            if (!frames.length) return null;
            const target = Number(time || 0) || 0;
            let best = frames[0];
            let bestDist = Math.abs(Number(best.time || 0) - target);
            frames.forEach((frame) => {
                const dist = Math.abs(Number(frame.time || 0) - target);
                if (dist < bestDist) {
                    best = frame;
                    bestDist = dist;
                }
            });
            return best;
        }

        function nodePreviewImages(nodeId) {
            const doc = getDocument();
            if (!doc?.querySelectorAll || !nodeId) return [];
            return doc.querySelectorAll(`[data-node-id="${cssEscape(nodeId)}"] [data-video-drag-preview]`);
        }

        function showVideoScrubPreview(node, time) {
            if (!node || node.type !== 'video') return;
            const frame = findNearestVideoFrame(node.asset || {}, time);
            if (!frame) return;
            const src = safeAssetDisplaySrc(frame, frame.thumb || frame.data_url || '');
            if (!src) return;
            nodePreviewImages(node.id).forEach((img) => {
                img.src = src;
                img.hidden = false;
            });
            if (previewTimers.has(node.id)) cancel(previewTimers.get(node.id));
            previewTimers.set(node.id, schedule(() => hideVideoScrubPreview(node.id), 420));
        }

        function hideVideoScrubPreview(nodeId) {
            if (!nodeId) return;
            if (previewTimers.has(nodeId)) {
                cancel(previewTimers.get(nodeId));
                previewTimers.delete(nodeId);
            }
            nodePreviewImages(nodeId).forEach((img) => {
                img.hidden = true;
            });
        }

        function normalizeVideoSeekTarget(node, time) {
            const range = getMediaEditRange(node?.asset || {});
            if (!range.duration || !range.clipped) return time;
            const fps = Math.max(1, Number(node?.asset?.fps || 0) || 30);
            const endGuard = Math.min(0.08, Math.max(0.001, 0.5 / fps));
            if (time >= range.end && range.end > range.start + endGuard) {
                return Math.max(range.start, range.end - endGuard);
            }
            return time;
        }

        function seekNodeMediaPlayer(nodeId, time, options) {
            const opts = options || {};
            const nodeLayer = getNodesLayer();
            const el = nodeLayer?.querySelector?.(`[data-node-id="${cssEscape(nodeId)}"] [data-media-player]`);
            if (!el) return;
            const node = getNode(nodeId);
            let targetTime = Math.max(0, Number(time || 0) || 0);
            if (node?.type === 'video') targetTime = normalizeVideoSeekTarget(node, targetTime);
            if (node?.type === 'video' && !opts.immediate) {
                showVideoScrubPreview(node, targetTime);
                if (pendingSeeks.has(nodeId)) cancel(pendingSeeks.get(nodeId));
                pendingSeeks.set(nodeId, schedule(() => {
                    pendingSeeks.delete(nodeId);
                    seekNodeMediaPlayer(nodeId, targetTime, { immediate: true });
                }, 140));
                return;
            }
            try {
                el.currentTime = targetTime;
                if (node?.type === 'video') {
                    const onSeeked = () => hideVideoScrubPreview(nodeId);
                    el.addEventListener?.('seeked', onSeeked, { once: true });
                    schedule(() => hideVideoScrubPreview(nodeId), 700);
                }
            } catch (err) {
                // Media may not be seekable until metadata is loaded.
            }
        }

        return {
            findNearestVideoFrame,
            showVideoScrubPreview,
            hideVideoScrubPreview,
            normalizeVideoSeekTarget,
            seekNodeMediaPlayer
        };
    }

    window.SimpAICanvasWorkbenchMediaSeek = Object.assign(
        {},
        window.SimpAICanvasWorkbenchMediaSeek || {},
        { createCanvasMediaSeekController }
    );
})();
