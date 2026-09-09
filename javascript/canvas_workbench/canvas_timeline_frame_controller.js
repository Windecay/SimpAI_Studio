(function () {
    'use strict';

    function createCanvasTimelineFrameController(context) {
        const scope = context || {};
        const call = (name, fallback, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : fallback;
        const getDocument = () => typeof scope.getDocument === 'function'
            ? scope.getDocument()
            : (typeof document !== 'undefined' ? document : null);
        const getNode = (id) => call('getNode', null, id);
        const getNodesLayer = () => call('getNodesLayer', null);
        const clamp = typeof scope.clamp === 'function'
            ? scope.clamp
            : (value, min, max) => Math.max(min, Math.min(max, value));
        const getTimelineSourceAsset = (source) => call('getTimelineSourceAsset', null, source) || {};
        const assetMediaKind = (asset) => call('assetMediaKind', 'image', asset);
        const assetDisplaySrc = (asset) => call('assetDisplaySrc', '', asset) || '';
        const getMediaEditRange = (asset) => call('getMediaEditRange', { start: 0 }, asset) || { start: 0 };
        const loadImageElementForCanvas = (src) => {
            if (typeof scope.loadImageElementForCanvas === 'function') return scope.loadImageElementForCanvas(src);
            return Promise.reject(new Error('canvas image loader unavailable'));
        };
        const cssEscape = (value) => call('cssEscape', String(value || ''), value);
        const timelineClipLayerGeometry = (width, height, assetWidth, assetHeight, clip) => call(
            'timelineClipLayerGeometry',
            null,
            width,
            height,
            assetWidth,
            assetHeight,
            clip
        );

        function timelineVisualZIndex(node, clip) {
            const tracks = Array.isArray(node?.tracks) ? node.tracks : [];
            const trackIndex = Math.max(0, tracks.findIndex(track => track.id === clip?.track_id));
            const clipIndex = Math.max(0, (node.clips || [])
                .filter(item => item.kind !== 'audio' && item.track_id === clip?.track_id)
                .findIndex(item => item.id === clip?.id));
            return Math.max(1, (tracks.length - trackIndex) * 100 + clipIndex);
        }

        function getActiveTimelineVisualClips(node) {
            const playhead = Number(node?.params?.playhead || 0);
            return (node?.clips || [])
                .filter(clip => clip.kind !== 'audio'
                    && playhead >= Number(clip.start || 0)
                    && playhead <= Number(clip.start || 0) + Number(clip.duration || 0))
                .sort((a, b) => timelineVisualZIndex(node, a) - timelineVisualZIndex(node, b));
        }

        function waitForMediaEvent(media, eventName, timeoutMs) {
            return new Promise((resolve) => {
                if (!media) {
                    resolve(false);
                    return;
                }
                let done = false;
                const finish = (ok) => {
                    if (done) return;
                    done = true;
                    media.removeEventListener(eventName, onEvent);
                    clearTimeout(timer);
                    resolve(ok);
                };
                const onEvent = () => finish(true);
                const timer = setTimeout(() => finish(false), timeoutMs || 900);
                media.addEventListener(eventName, onEvent, { once: true });
            });
        }

        async function prepareTimelinePreviewVideoForFrame(node, clip, video) {
            if (!node || !clip || !video) return false;
            if (video.readyState < 1) {
                await waitForMediaEvent(video, 'loadedmetadata', 1200);
            }
            const source = getNode(clip.source_node_id);
            const asset = getTimelineSourceAsset(source);
            const effectiveIn = typeof scope.effectiveClipIn === 'function'
                ? scope.effectiveClipIn(clip, asset)
                : Math.max(0, Number(clip.in || 0), Number(getMediaEditRange(asset).start || 0));
            const rawTarget = effectiveIn + Number(node.params?.playhead || 0) - Number(clip.start || 0);
            const duration = Number.isFinite(video.duration) && video.duration > 0
                ? video.duration
                : Number(clip.out || clip.duration || 0);
            const guard = Math.max(0, duration - 0.035);
            const target = clamp(Number(rawTarget || 0), 0, Math.max(0, guard));
            if (Math.abs(Number(video.currentTime || 0) - target) > 0.025) {
                const seeked = waitForMediaEvent(video, 'seeked', 1400);
                try {
                    video.pause();
                    video.currentTime = target;
                } catch (err) {
                    return false;
                }
                await seeked;
            }
            if (video.readyState < 2) {
                await waitForMediaEvent(video, 'loadeddata', 900);
            }
            return video.readyState >= 2 && video.videoWidth && video.videoHeight;
        }

        async function getTimelineClipDrawable(node, clip) {
            const source = getNode(clip?.source_node_id);
            const asset = getTimelineSourceAsset(source);
            const kind = assetMediaKind(asset);
            if (kind === 'video') {
                const nodeEl = getNodesLayer()?.querySelector?.(`[data-node-id="${cssEscape(node.id)}"]`);
                const video = nodeEl?.querySelector?.(`[data-preview-clip="${cssEscape(clip.id)}"] video[data-timeline-preview-video]`);
                if (video && await prepareTimelinePreviewVideoForFrame(node, clip, video)) {
                    return { media: video, width: video.videoWidth, height: video.videoHeight };
                }
                console.warn('[SimpAI Canvas] timeline video frame unavailable for preview export', {
                    node_id: node.id,
                    clip_id: clip.id,
                    ready_state: video?.readyState,
                    target_time: (() => {
                        const effectiveIn = typeof scope.effectiveClipIn === 'function'
                            ? scope.effectiveClipIn(clip, asset)
                            : Math.max(0, Number(clip.in || 0), Number(getMediaEditRange(asset).start || 0));
                        return effectiveIn + Number(node.params?.playhead || 0) - Number(clip.start || 0);
                    })()
                });
                return null;
            }
            const src = kind === 'video'
                ? (asset.thumb || asset.preview_url || asset.data_url || '')
                : assetDisplaySrc(asset);
            if (!src) return null;
            const image = await loadImageElementForCanvas(src);
            return {
                media: image,
                width: image.naturalWidth || image.width || Number(asset.width || 0) || 1,
                height: image.naturalHeight || image.height || Number(asset.height || 0) || 1
            };
        }

        function setCanvasSmoothingQuality(ctx) {
            if (!ctx) return;
            try {
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
            } catch (err) {}
        }

        function timelinePayloadLayerMap(node, payload) {
            const sourcePayload = payload || call('serializeTimelineRenderPayload', null, node);
            const layers = Array.isArray(sourcePayload?.layers) ? sourcePayload.layers : [];
            return new Map(layers.map(layer => [layer?.clip_id, layer]).filter(item => item[0]));
        }

        function timelineLayerGeometryFromPayload(layer) {
            const geometry = layer?.transform?.geometry_pixels;
            if (!geometry || typeof geometry !== 'object') return null;
            const left = Number(geometry.left);
            const top = Number(geometry.top);
            const fitW = Number(geometry.width);
            const fitH = Number(geometry.height);
            if (![left, top, fitW, fitH].every(Number.isFinite) || fitW <= 0 || fitH <= 0) return null;
            return {
                left: Math.round(left),
                top: Math.round(top),
                fitW: Math.round(fitW),
                fitH: Math.round(fitH),
                centerX: Math.round(left) + Math.round(fitW) / 2,
                centerY: Math.round(top) + Math.round(fitH) / 2
            };
        }

        async function renderTimelinePreviewFrameDataUrl(node, options) {
            if (!node || node.type !== 'timeline') return '';
            call('normalizeTimelineNode', undefined, node);
            const doc = getDocument();
            if (!doc?.createElement) return '';
            const opts = options || {};
            const payloadLayers = timelinePayloadLayerMap(node, opts.payload);
            const width = Math.max(16, Math.round(Number(node.params?.width || 1280)));
            const height = Math.max(16, Math.round(Number(node.params?.height || 720)));
            const canvas = doc.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) return '';
            setCanvasSmoothingQuality(ctx);
            ctx.fillStyle = node.params?.background || '#000000';
            ctx.fillRect(0, 0, width, height);
            const clips = getActiveTimelineVisualClips(node)
                .filter(clip => !opts.onlyClipId || clip.id === opts.onlyClipId);
            for (const clip of clips) {
                try {
                    const drawable = await getTimelineClipDrawable(node, clip);
                    if (!drawable?.media) continue;
                    const maskSrc = typeof scope.clipMaskDataUrl === 'function'
                        ? scope.clipMaskDataUrl(clip)
                        : (clip.mask?.data_url || clip.mask_data_url || '');
                    const layerCanvas = maskSrc ? doc.createElement('canvas') : null;
                    const layerCtx = layerCanvas ? layerCanvas.getContext('2d') : null;
                    if (layerCanvas) {
                        layerCanvas.width = width;
                        layerCanvas.height = height;
                    }
                    const targetCtx = layerCtx || ctx;
                    setCanvasSmoothingQuality(targetCtx);
                    const payloadLayer = payloadLayers.get(clip.id);
                    const payloadTransform = payloadLayer?.transform && typeof payloadLayer.transform === 'object'
                        ? payloadLayer.transform
                        : {};
                    const geometry = timelineLayerGeometryFromPayload(payloadLayer)
                        || timelineClipLayerGeometry(width, height, drawable.width, drawable.height, clip);
                    if (!geometry) continue;
                    const fitW = geometry.fitW;
                    const fitH = geometry.fitH;
                    const cropLeft = clamp(Number(clip.crop_left || 0), 0, 95) / 100;
                    const cropRight = clamp(Number(clip.crop_right || 0), 0, 95) / 100;
                    const cropTop = clamp(Number(clip.crop_top || 0), 0, 95) / 100;
                    const cropBottom = clamp(Number(clip.crop_bottom || 0), 0, 95) / 100;
                    const dx = -fitW / 2;
                    const dy = -fitH / 2;
                    targetCtx.save();
                    targetCtx.globalAlpha = clamp(Number(payloadTransform.opacity ?? clip.opacity ?? 1), 0, 1);
                    targetCtx.translate(geometry.centerX, geometry.centerY);
                    targetCtx.rotate((Number(payloadTransform.rotate_degrees ?? clip.rotate ?? 0) * Math.PI) / 180);
                    targetCtx.beginPath();
                    targetCtx.rect(
                        dx + fitW * cropLeft,
                        dy + fitH * cropTop,
                        Math.max(1, fitW * (1 - cropLeft - cropRight)),
                        Math.max(1, fitH * (1 - cropTop - cropBottom))
                    );
                    targetCtx.clip();
                    if (opts.geometryProbe) {
                        targetCtx.fillStyle = '#ffffff';
                        targetCtx.fillRect(dx, dy, fitW, fitH);
                    } else {
                        targetCtx.drawImage(drawable.media, dx, dy, fitW, fitH);
                    }
                    targetCtx.restore();
                    if (layerCanvas && layerCtx) {
                        const mask = await loadImageElementForCanvas(maskSrc);
                        layerCtx.save();
                        layerCtx.globalCompositeOperation = 'destination-in';
                        layerCtx.globalAlpha = 1;
                        setCanvasSmoothingQuality(layerCtx);
                        layerCtx.drawImage(mask, 0, 0, width, height);
                        layerCtx.restore();
                        ctx.drawImage(layerCanvas, 0, 0);
                    }
                } catch (err) {
                    console.warn('[SimpAI Canvas] timeline frame layer skipped:', err);
                }
            }
            try {
                return canvas.toDataURL('image/png');
            } catch (err) {
                console.warn('[SimpAI Canvas] timeline frame export failed:', err);
                return '';
            }
        }

        function parseTimelineBackgroundColor(value) {
            const text = String(value || '#000000').trim();
            const hex = text.startsWith('#') ? text.slice(1) : text;
            if (/^[0-9a-f]{6}$/i.test(hex)) {
                return [
                    parseInt(hex.slice(0, 2), 16),
                    parseInt(hex.slice(2, 4), 16),
                    parseInt(hex.slice(4, 6), 16)
                ];
            }
            return [0, 0, 0];
        }

        function timelineFrameContentBounds(data, width, height, backgroundRgb, threshold) {
            const bg = Array.isArray(backgroundRgb) ? backgroundRgb : [0, 0, 0];
            const limit = Math.max(1, Number(threshold || 6));
            let minX = width;
            let minY = height;
            let maxX = -1;
            let maxY = -1;
            for (let y = 0; y < height; y += 1) {
                for (let x = 0; x < width; x += 1) {
                    const offset = (y * width + x) * 4;
                    const alpha = data[offset + 3];
                    if (alpha <= 1) continue;
                    const dr = Math.abs(data[offset] - bg[0]);
                    const dg = Math.abs(data[offset + 1] - bg[1]);
                    const db = Math.abs(data[offset + 2] - bg[2]);
                    if (Math.max(dr, dg, db) <= limit) continue;
                    if (x < minX) minX = x;
                    if (y < minY) minY = y;
                    if (x > maxX) maxX = x;
                    if (y > maxY) maxY = y;
                }
            }
            if (maxX < minX || maxY < minY) return { empty: true, x: 0, y: 0, width: 0, height: 0, right: 0, bottom: 0 };
            return {
                empty: false,
                x: minX,
                y: minY,
                width: maxX - minX + 1,
                height: maxY - minY + 1,
                right: width - maxX - 1,
                bottom: height - maxY - 1
            };
        }

        function timelineFrameBoundsDelta(front, back) {
            if (!front || !back || front.empty || back.empty) return null;
            return {
                dx: back.x - front.x,
                dy: back.y - front.y,
                dw: back.width - front.width,
                dh: back.height - front.height,
                dr: back.right - front.right,
                db: back.bottom - front.bottom
            };
        }

        async function compareTimelineFrameImages(frontendSrc, backendSrc, width, height, options) {
            const [frontImage, backImage] = await Promise.all([
                loadImageElementForCanvas(frontendSrc),
                loadImageElementForCanvas(backendSrc)
            ]);
            const doc = getDocument();
            if (!doc?.createElement) throw new Error('frame compare document unavailable');
            const frontCanvas = doc.createElement('canvas');
            const backCanvas = doc.createElement('canvas');
            frontCanvas.width = width;
            frontCanvas.height = height;
            backCanvas.width = width;
            backCanvas.height = height;
            const frontCtx = frontCanvas.getContext('2d', { willReadFrequently: true });
            const backCtx = backCanvas.getContext('2d', { willReadFrequently: true });
            if (!frontCtx || !backCtx) throw new Error('frame compare canvas unavailable');
            frontCtx.drawImage(frontImage, 0, 0, width, height);
            backCtx.drawImage(backImage, 0, 0, width, height);
            const front = frontCtx.getImageData(0, 0, width, height).data;
            const back = backCtx.getImageData(0, 0, width, height).data;
            const backgroundRgb = parseTimelineBackgroundColor(options?.background || '#000000');
            const frontendBounds = timelineFrameContentBounds(front, width, height, backgroundRgb, options?.boundsThreshold || 6);
            const backendBounds = timelineFrameContentBounds(back, width, height, backgroundRgb, options?.boundsThreshold || 6);
            const heatmapCanvas = doc.createElement('canvas');
            heatmapCanvas.width = width;
            heatmapCanvas.height = height;
            const heatmapCtx = heatmapCanvas.getContext('2d', { willReadFrequently: true });
            const heatmapImage = heatmapCtx ? heatmapCtx.createImageData(width, height) : null;
            let sumAbs = 0;
            let sumSq = 0;
            let maxAbs = 0;
            let changedPixels = 0;
            const threshold = 10;
            const thresholds = [5, 10, 20, 30];
            const changedByThreshold = Object.fromEntries(thresholds.map(value => [String(value), 0]));
            const pixels = width * height;
            for (let i = 0; i < pixels; i += 1) {
                const offset = i * 4;
                let pixelMax = 0;
                for (let c = 0; c < 4; c += 1) {
                    const delta = Math.abs(front[offset + c] - back[offset + c]);
                    sumAbs += delta;
                    sumSq += delta * delta;
                    if (delta > maxAbs) maxAbs = delta;
                    if (delta > pixelMax) pixelMax = delta;
                }
                if (pixelMax > threshold) changedPixels += 1;
                thresholds.forEach((value) => {
                    if (pixelMax > value) changedByThreshold[String(value)] += 1;
                });
                if (heatmapImage) {
                    const heat = clamp(pixelMax * 5, 0, 255);
                    const alpha = pixelMax > 2 ? clamp(80 + pixelMax * 3, 0, 255) : 0;
                    heatmapImage.data[offset] = heat;
                    heatmapImage.data[offset + 1] = pixelMax > 30 ? 48 : 0;
                    heatmapImage.data[offset + 2] = 255 - heat;
                    heatmapImage.data[offset + 3] = alpha;
                }
            }
            let diffDataUrl = '';
            if (heatmapCtx && heatmapImage) {
                heatmapCtx.drawImage(backCanvas, 0, 0, width, height);
                const overlay = doc.createElement('canvas');
                overlay.width = width;
                overlay.height = height;
                const overlayCtx = overlay.getContext('2d');
                if (overlayCtx) {
                    overlayCtx.putImageData(heatmapImage, 0, 0);
                    heatmapCtx.drawImage(overlay, 0, 0);
                    diffDataUrl = heatmapCanvas.toDataURL('image/png');
                }
            }
            const channelCount = pixels * 4;
            const changed_percent_by_threshold = {};
            thresholds.forEach((value) => {
                changed_percent_by_threshold[String(value)] = Math.round((changedByThreshold[String(value)] / Math.max(1, pixels)) * 100000) / 1000;
            });
            return {
                width,
                height,
                threshold,
                mean_abs: Math.round((sumAbs / Math.max(1, channelCount)) * 1000) / 1000,
                rms: Math.round(Math.sqrt(sumSq / Math.max(1, channelCount)) * 1000) / 1000,
                max_abs: maxAbs,
                changed_pixels: changedPixels,
                changed_percent: Math.round((changedPixels / Math.max(1, pixels)) * 100000) / 1000,
                changed_pixels_by_threshold: changedByThreshold,
                changed_percent_by_threshold,
                bounds: {
                    frontend: frontendBounds,
                    backend: backendBounds,
                    backend_minus_frontend: timelineFrameBoundsDelta(frontendBounds, backendBounds)
                },
                diff_data_url: diffDataUrl
            };
        }

        return {
            timelineVisualZIndex,
            getActiveTimelineVisualClips,
            waitForMediaEvent,
            prepareTimelinePreviewVideoForFrame,
            getTimelineClipDrawable,
            timelinePayloadLayerMap,
            timelineLayerGeometryFromPayload,
            renderTimelinePreviewFrameDataUrl,
            parseTimelineBackgroundColor,
            timelineFrameContentBounds,
            timelineFrameBoundsDelta,
            compareTimelineFrameImages
        };
    }

    window.SimpAICanvasWorkbenchTimelineFrame = Object.assign({}, window.SimpAICanvasWorkbenchTimelineFrame || {}, {
        createCanvasTimelineFrameController
    });
})();
