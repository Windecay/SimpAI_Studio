(function () {
    'use strict';

    function createCanvasTimelineMaskController(context) {
        const scope = context?.timelineMaskSource || context || {};
        const domSource = scope.domSource || {};
        const nodeSource = scope.nodeSource || {};
        const interactionSource = scope.interactionSource || {};
        const maskOperationSource = scope.maskOperationSource || {};
        const maskGeometrySource = scope.maskGeometrySource || {};
        const clipSource = scope.clipSource || {};
        const mediaSource = scope.mediaSource || {};
        const historySource = scope.historySource || {};
        const persistenceSource = scope.persistenceSource || {};
        const selectionSource = scope.selectionSource || {};
        const call = (sourceObject, name, ...args) => typeof sourceObject[name] === 'function'
            ? sourceObject[name](...args)
            : undefined;
        const getDocument = () => call(domSource, 'getDocument') || null;
        function timelineMaskLayerGeometry(node, clip, paramsOverride) {
            if (!node || !clip) return null;
            const params = Object.assign({}, node.params || {}, paramsOverride || {});
            const width = Math.max(16, Math.round(Number(params.width || 1280)));
            const height = Math.max(16, Math.round(Number(params.height || 720)));
            const source = call(nodeSource, 'getNode', clip.source_node_id);
            const asset = call(maskGeometrySource, 'getTimelineSourceAsset', source) || {};
            const playhead = Number(params.playhead || node.params?.playhead || 0);
            const effectiveClip = typeof maskGeometrySource.timelineClipAtTime === 'function'
                ? call(maskGeometrySource, 'timelineClipAtTime', clip, playhead)
                : clip;
            const geometry = call(maskGeometrySource, 'timelineClipLayerGeometry', width, height, asset.width, asset.height, effectiveClip);
            if (!geometry) return null;
            return Object.assign({}, geometry, {
                canvasWidth: width,
                canvasHeight: height,
                rotate: Number(effectiveClip?.rotate || 0)
            });
        }

        function captureTimelineMaskGeometry(node) {
            if (!node || node.type !== 'timeline') return null;
            const width = Math.max(16, Math.round(Number(node.params?.width || 1280)));
            const height = Math.max(16, Math.round(Number(node.params?.height || 720)));
            const clips = {};
            (node.clips || []).forEach(clip => {
                if (!clip?.mask || clip.kind === 'audio') return;
                clips[clip.id] = timelineMaskLayerGeometry(node, clip, { width, height });
            });
            return { width, height, clips };
        }

        function timelineMaskDimensions(node) {
            return {
                width: Math.max(16, Math.round(Number(node?.params?.width || 1280))),
                height: Math.max(16, Math.round(Number(node?.params?.height || 720)))
            };
        }

        function drawTimelineMaskStrokes(ctx, width, height, strokes, options) {
            if (!ctx) return;
            const opts = options || {};
            if (opts.clear !== false) ctx.clearRect(0, 0, width, height);
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            const drawOneStroke = (targetCtx, stroke, featherPx) => {
                const points = Array.isArray(stroke?.points) ? stroke.points : [];
                if (!points.length) return false;
                const isPen = stroke.kind === 'pen' || stroke.closed === true;
                targetCtx.save();
                targetCtx.globalCompositeOperation = stroke.erase ? 'destination-out' : 'source-over';
                targetCtx.strokeStyle = 'rgba(255,255,255,1)';
                targetCtx.fillStyle = 'rgba(255,255,255,1)';
                targetCtx.lineWidth = isPen ? Math.max(1, featherPx ? 1 : 2) : Math.max(2, Number(stroke.size || 0.035) * Math.min(width, height));
                targetCtx.lineCap = 'round';
                targetCtx.lineJoin = 'round';
                targetCtx.beginPath();
                points.forEach((point, index) => {
                    const x = clamp(Number(point.x || 0), 0, 1) * width;
                    const y = clamp(Number(point.y || 0), 0, 1) * height;
                    if (index === 0) targetCtx.moveTo(x, y);
                    else targetCtx.lineTo(x, y);
                });
                if (isPen) {
                    if (stroke.closed !== false && points.length >= 3) {
                        targetCtx.closePath();
                        targetCtx.fill();
                    } else {
                        targetCtx.setLineDash([6, 5]);
                        targetCtx.stroke();
                    }
                } else if (points.length === 1) {
                    const point = points[0];
                    targetCtx.arc(clamp(Number(point.x || 0), 0, 1) * width, clamp(Number(point.y || 0), 0, 1) * height, targetCtx.lineWidth / 2, 0, Math.PI * 2);
                    targetCtx.fill();
                } else {
                    targetCtx.stroke();
                }
                targetCtx.restore();
                return true;
            };
            (Array.isArray(strokes) ? strokes : []).forEach(stroke => {
                const feather = Math.max(0, Number(stroke?.feather || 0));
                if (!feather || stroke?.erase) {
                    drawOneStroke(ctx, stroke, 0);
                    return;
                }
                const doc = getDocument();
                const buffer = doc?.createElement?.('canvas');
                if (!buffer) return;
                buffer.width = width;
                buffer.height = height;
                const bufferCtx = buffer.getContext('2d');
                if (!bufferCtx || !drawOneStroke(bufferCtx, stroke, feather)) return;
                ctx.save();
                ctx.filter = `blur(${feather}px)`;
                ctx.globalCompositeOperation = 'source-over';
                ctx.drawImage(buffer, 0, 0);
                ctx.restore();
            });
        }

        function ensureTimelineMaskCanvas(stageEl, node, clip) {
            let canvas = stageEl.querySelector('canvas[data-timeline-mask-canvas]');
            if (!canvas) {
                canvas = getDocument().createElement('canvas');
                canvas.className = 'sai-timeline-mask-canvas';
                canvas.setAttribute('data-timeline-mask-canvas', 'true');
                stageEl.appendChild(canvas);
            }
            const rect = stageEl.getBoundingClientRect();
            const ratio = Math.max(1, Math.min(3, Number(call(domSource, 'getDevicePixelRatio')) || 1));
            const width = Math.max(1, Math.round(rect.width * ratio));
            const height = Math.max(1, Math.round(rect.height * ratio));
            if (canvas.width !== width || canvas.height !== height) {
                canvas.width = width;
                canvas.height = height;
            }
            const ctx = canvas.getContext('2d');
            const strokes = (clip?.mask?.strokes || []).concat(clip?.mask?.pending_pen ? [clip.mask.pending_pen] : []);
            drawTimelineMaskStrokes(ctx, width, height, strokes);
            return canvas;
        }

        function exportTimelineMaskDataUrl(node, clip) {
            const doc = getDocument();
            if (!doc?.createElement) return '';
            const size = timelineMaskDimensions(node);
            const canvas = doc.createElement('canvas');
            canvas.width = size.width;
            canvas.height = size.height;
            drawTimelineMaskStrokes(canvas.getContext('2d'), size.width, size.height, clip?.mask?.strokes || []);
            try {
                return canvas.toDataURL('image/png');
            } catch (err) {
                console.warn('[SimpAI Canvas] timeline mask export failed:', err);
                return '';
            }
        }

        const getNode = (id) => typeof nodeSource.getNode === 'function' ? nodeSource.getNode(id) : null;
        const isNodeLocked = (node) => typeof nodeSource.isNodeLocked === 'function' ? !!nodeSource.isNodeLocked(node) : false;
        const clamp = typeof interactionSource.clamp === 'function'
            ? interactionSource.clamp
            : (value, min, max) => Math.max(min, Math.min(max, value));
        const getPerformanceNow = () => Number(call(interactionSource, 'performanceNow')) || 0;
        const buildTimelineClipMaskPatch = (clip, options) => {
            if (typeof maskOperationSource.buildTimelineClipMaskPatch === 'function') return maskOperationSource.buildTimelineClipMaskPatch(clip, options);
            const config = options || {};
            const mask = Object.assign({}, clip?.mask || {}, config.maskPatch || {});
            if (config.dataUrl !== undefined) mask.data_url = config.dataUrl;
            if (config.width !== undefined) mask.width = config.width;
            if (config.height !== undefined) mask.height = config.height;
            const patch = { mask };
            if (config.maskDataUrl !== undefined) patch.mask_data_url = config.maskDataUrl;
            else if (config.dataUrl !== undefined) patch.mask_data_url = config.dataUrl;
            return patch;
        };
        const buildTimelineClipMaskPointPatch = (clip, target, point) => {
            if (typeof maskOperationSource.buildTimelineClipMaskPointPatch === 'function') {
                return maskOperationSource.buildTimelineClipMaskPointPatch(clip, target, point);
            }
            const mask = JSON.parse(JSON.stringify(clip?.mask || {}));
            if (target?.kind === 'pending') {
                const points = Array.isArray(mask.pending_pen?.points) ? mask.pending_pen.points.slice() : [];
                if (points[target.pointIndex] !== undefined) {
                    points[target.pointIndex] = point;
                    mask.pending_pen = Object.assign({}, mask.pending_pen, { points });
                }
            } else {
                const strokes = Array.isArray(mask.strokes) ? mask.strokes.slice() : [];
                const strokeIndex = Number.isInteger(Number(target?.strokeIndex))
                    ? Number(target.strokeIndex)
                    : (Array.isArray(clip?.mask?.strokes) ? clip.mask.strokes : [])
                        .findIndex(item => item?.points === target?.points);
                const stroke = strokes[strokeIndex];
                const points = Array.isArray(stroke?.points) ? stroke.points.slice() : [];
                if (stroke && points[target.pointIndex] !== undefined) {
                    points[target.pointIndex] = point;
                    strokes[strokeIndex] = Object.assign({}, stroke, { points });
                    mask.strokes = strokes;
                }
            }
            return { mask };
        };
        function rotateTimelineMaskPoint(x, y, cx, cy, degrees) {
            const radians = Number(degrees || 0) * Math.PI / 180;
            if (Math.abs(radians) < 0.000001) return { x, y };
            const cos = Math.cos(radians);
            const sin = Math.sin(radians);
            const dx = x - cx;
            const dy = y - cy;
            return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
        }

        function remapTimelineMaskPoint(point, oldGeometry, newGeometry) {
            if (!point || !oldGeometry || !newGeometry || !oldGeometry.fitW || !oldGeometry.fitH || !newGeometry.fitW || !newGeometry.fitH) {
                return point;
            }
            const oldX = clamp(Number(point.x || 0), 0, 1) * oldGeometry.canvasWidth;
            const oldY = clamp(Number(point.y || 0), 0, 1) * oldGeometry.canvasHeight;
            const unrotated = rotateTimelineMaskPoint(oldX, oldY, oldGeometry.centerX, oldGeometry.centerY, -Number(oldGeometry.rotate || 0));
            const localX = (unrotated.x - oldGeometry.left) / Math.max(1, oldGeometry.fitW);
            const localY = (unrotated.y - oldGeometry.top) / Math.max(1, oldGeometry.fitH);
            const nextUnrotatedX = newGeometry.left + localX * newGeometry.fitW;
            const nextUnrotatedY = newGeometry.top + localY * newGeometry.fitH;
            const rotated = rotateTimelineMaskPoint(nextUnrotatedX, nextUnrotatedY, newGeometry.centerX, newGeometry.centerY, Number(newGeometry.rotate || 0));
            return Object.assign({}, point, {
                x: clamp(rotated.x / Math.max(1, newGeometry.canvasWidth), 0, 1),
                y: clamp(rotated.y / Math.max(1, newGeometry.canvasHeight), 0, 1)
            });
        }

        function remapTimelineMaskPoints(points, oldGeometry, newGeometry) {
            return Array.isArray(points)
                ? points.map(point => remapTimelineMaskPoint(point, oldGeometry, newGeometry))
                : points;
        }

        function timelineMaskPointFromEvent(stageEl, evt) {
            const rect = stageEl.getBoundingClientRect();
            return {
                x: clamp((evt.clientX - rect.left) / Math.max(1, rect.width), 0, 1),
                y: clamp((evt.clientY - rect.top) / Math.max(1, rect.height), 0, 1)
            };
        }

        function timelineMaskPointDistancePx(a, b, stageEl) {
            const rect = stageEl?.getBoundingClientRect?.() || { width: 1, height: 1 };
            const dx = (Number(a?.x || 0) - Number(b?.x || 0)) * Math.max(1, rect.width);
            const dy = (Number(a?.y || 0) - Number(b?.y || 0)) * Math.max(1, rect.height);
            return Math.sqrt(dx * dx + dy * dy);
        }

        function timelineMaskCloseSnapPx(stageEl) {
            const rect = stageEl?.getBoundingClientRect?.() || { width: 1, height: 1 };
            return clamp(Math.min(rect.width, rect.height) * 0.045, 12, 24);
        }

        function getTimelinePenAnchorTarget(clip, rawRef) {
            const ref = String(rawRef || '');
            const mask = clip?.mask && typeof clip.mask === 'object' ? clip.mask : null;
            if (!mask) return null;
            const [left, right] = ref.split(':');
            if (left === 'pending') {
                const points = Array.isArray(mask.pending_pen?.points) ? mask.pending_pen.points : [];
                const pointIndex = Number(right);
                return points[pointIndex] ? { kind: 'pending', points, pointIndex } : null;
            }
            const strokeIndex = Number(left);
            const pointIndex = Number(right);
            const strokes = Array.isArray(mask.strokes) ? mask.strokes : [];
            const stroke = strokes[strokeIndex];
            const points = Array.isArray(stroke?.points) ? stroke.points : [];
            return points[pointIndex] ? { kind: 'stroke', stroke, strokeIndex, points, pointIndex } : null;
        }

        function closeTimelinePendingPenPath(node, clip, stageEl) {
            const pending = clip?.mask?.pending_pen;
            const points = Array.isArray(pending?.points) ? pending.points : [];
            if (!node || !clip || points.length < 3) return false;
            const size = timelineMaskDimensions(node);
            const strokes = Array.isArray(clip.mask?.strokes) ? clip.mask.strokes : [];
            const closed = Object.assign({}, pending, {
                kind: 'pen',
                closed: true,
                pending: false,
                points: points.slice()
            });
            Object.assign(clip, buildTimelineClipMaskPatch(clip, {
                maskPatch: {
                    kind: 'pen_alpha',
                    space: 'canvas',
                    width: size.width,
                    height: size.height,
                    strokes: strokes.concat(closed),
                    pending_pen: null
                }
            }));
            const dataUrl = exportTimelineMaskDataUrl(node, clip);
            if (dataUrl) {
                Object.assign(clip, buildTimelineClipMaskPatch(clip, { dataUrl, width: size.width, height: size.height }));
            }
            call(domSource, 'refreshTimelinePenOverlayDom', stageEl, clip);
            call(persistenceSource, 'scheduleSave');
            if (call(selectionSource, 'getSelectedNodeId') === node.id) call(selectionSource, 'renderInspector');
            return true;
        }

        let anchorDragState = null;

        function startTimelineMaskAnchorDrag(node, anchor, evt) {
            const stageEl = anchor?.closest?.('.sai-timeline-preview-stage');
            const nodeEl = anchor?.closest?.('[data-node-id]');
            const clip = (node?.clips || []).find(item => item.id === node?.params?.selected_clip_id);
            const target = getTimelinePenAnchorTarget(clip, anchor?.getAttribute?.('data-timeline-pen-anchor'));
            if (!node || node.type !== 'timeline' || !clip || !target || !stageEl || !nodeEl || isNodeLocked(node) || !evt) return;
            evt.preventDefault();
            evt.stopPropagation();
            if (target.kind === 'pending' && target.pointIndex === 0 && target.points.length >= 3) {
                call(historySource, 'pushHistoryBatch', `timeline-mask:${node.id}:${clip.id}`, 'Close timeline pen mask');
                closeTimelinePendingPenPath(node, clip, stageEl);
                call(mediaSource, 'syncTimelinePreviewVideos', nodeEl, node);
                return;
            }
            call(historySource, 'pushHistoryBatch', `timeline-mask-anchor:${node.id}:${clip.id}`, 'Edit timeline pen mask');
            anchorDragState = {
                pointerId: evt.pointerId,
                nodeId: node.id,
                clipId: clip.id,
                nodeEl,
                stageEl,
                ref: anchor.getAttribute('data-timeline-pen-anchor')
            };
            updateTimelineMaskAnchorDragFromPointer(evt);
            call(interactionSource, 'setSuppressWheelUntil', getPerformanceNow() + 420);
            try { anchor.setPointerCapture?.(evt.pointerId); } catch (err) {}
            const doc = getDocument();
            doc?.addEventListener('pointermove', updateTimelineMaskAnchorDragFromPointer, true);
            doc?.addEventListener('pointerup', stopTimelineMaskAnchorDrag, true);
            doc?.addEventListener('pointercancel', stopTimelineMaskAnchorDrag, true);
        }

        function applyTimelineMaskFeatherToSelectedClip(node) {
            const clip = call(clipSource, 'selectedVisualClip', node);
            if (!node || !clip?.mask) return;
            const feather = clamp(Number(node.params?.mask_feather || 0), 0, 120);
            const strokes = Array.isArray(clip.mask.strokes) ? clip.mask.strokes : [];
            Object.assign(clip, buildTimelineClipMaskPatch(clip, {
                maskPatch: {
                    strokes: strokes.map(stroke => (stroke?.kind === 'pen' || stroke?.closed === true)
                        ? Object.assign({}, stroke, { feather })
                        : stroke),
                    pending_pen: clip.mask.pending_pen ? Object.assign({}, clip.mask.pending_pen, { feather }) : clip.mask.pending_pen
                }
            }));
            if (strokes.some(stroke => stroke?.kind === 'pen' || stroke?.closed === true)) {
                const dataUrl = exportTimelineMaskDataUrl(node, clip);
                if (dataUrl) {
                    Object.assign(clip, buildTimelineClipMaskPatch(clip, { dataUrl }));
                }
            }
        }

        function updateTimelineMaskAnchorDragFromPointer(evt) {
            if (!anchorDragState || !evt || evt.pointerId !== anchorDragState.pointerId) return;
            evt.preventDefault();
            const state = anchorDragState;
            const node = getNode(state.nodeId);
            const clip = (node?.clips || []).find(item => item.id === state.clipId);
            const target = getTimelinePenAnchorTarget(clip, state.ref);
            if (!node || !clip || !target) return;
            const point = timelineMaskPointFromEvent(state.stageEl, evt);
            Object.assign(clip, buildTimelineClipMaskPointPatch(clip, target, point));
            call(domSource, 'refreshTimelinePenOverlayDom', state.stageEl, clip, { mask: false });
            call(persistenceSource, 'scheduleSave');
        }

        function stopTimelineMaskAnchorDrag(evt) {
            if (!anchorDragState) return;
            if (evt && evt.pointerId !== anchorDragState.pointerId) return;
            const state = anchorDragState;
            const node = getNode(state.nodeId);
            const clip = (node?.clips || []).find(item => item.id === state.clipId);
            anchorDragState = null;
            const doc = getDocument();
            doc?.removeEventListener('pointermove', updateTimelineMaskAnchorDragFromPointer, true);
            doc?.removeEventListener('pointerup', stopTimelineMaskAnchorDrag, true);
            doc?.removeEventListener('pointercancel', stopTimelineMaskAnchorDrag, true);
            if (node && clip?.mask) {
                const dataUrl = exportTimelineMaskDataUrl(node, clip);
                if (dataUrl) {
                    const size = timelineMaskDimensions(node);
                    Object.assign(clip, buildTimelineClipMaskPatch(clip, {
                        dataUrl,
                        width: size.width,
                        height: size.height
                    }));
                }
                call(domSource, 'refreshTimelinePenOverlayDom', state.stageEl, clip);
                call(mediaSource, 'syncTimelinePreviewVideos', state.nodeEl, node);
                call(persistenceSource, 'scheduleSave');
            }
            if (call(selectionSource, 'getSelectedNodeId') === state.nodeId) call(selectionSource, 'renderInspector');
        }

        function startTimelineMaskDraw(node, clipId, evt) {
            const nodeEl = evt?.target?.closest?.('[data-node-id]');
            const stageEl = evt?.target?.closest?.('.sai-timeline-preview-stage');
            const clip = (node?.clips || []).find(item => item.id === clipId);
            if (!node || node.type !== 'timeline' || !clip || clip.kind === 'audio' || !nodeEl || !stageEl || isNodeLocked(node) || !evt) return;
            evt.preventDefault();
            evt.stopPropagation();
            call(clipSource, 'selectTimelineClip', node, clipId, { render: false });
            const size = timelineMaskDimensions(node);
            const strokes = Array.isArray(clip.mask?.strokes) ? clip.mask.strokes : [];
            const point = timelineMaskPointFromEvent(stageEl, evt);
            const feather = clamp(Number(node.params?.mask_feather || 0), 0, 120);
            const current = clip.mask?.pending_pen && Array.isArray(clip.mask.pending_pen.points)
                ? Object.assign({}, clip.mask.pending_pen)
                : { kind: 'pen', closed: false, feather, points: [] };
            let points = Array.isArray(current.points) ? current.points.slice() : [];
            let shouldClose = false;
            if (evt.altKey && current.points.length) {
                points = points.slice(0, -1);
            } else {
                const first = points[0];
                const snapToFirst = points.length >= 3
                    && first
                    && timelineMaskPointDistancePx(point, first, stageEl) <= timelineMaskCloseSnapPx(stageEl);
                if (snapToFirst) {
                    shouldClose = true;
                } else {
                    points = points.concat(point);
                    shouldClose = evt.detail >= 2 && points.length >= 3;
                }
            }
            const nextCurrent = Object.assign({}, current, { points, feather });
            const nextStrokes = shouldClose
                ? strokes.concat(Object.assign({}, nextCurrent, { closed: true, pending: false }))
                : strokes;
            Object.assign(clip, buildTimelineClipMaskPatch(clip, {
                maskPatch: {
                    kind: 'pen_alpha',
                    space: 'canvas',
                    width: size.width,
                    height: size.height,
                    strokes: nextStrokes,
                    pending_pen: shouldClose ? null : nextCurrent
                }
            }));
            if (shouldClose) {
                const dataUrl = exportTimelineMaskDataUrl(node, clip);
                Object.assign(clip, buildTimelineClipMaskPatch(clip, {
                    ...(dataUrl ? { dataUrl } : {}),
                    maskDataUrl: dataUrl || clip.mask_data_url || ''
                }));
                call(historySource, 'pushHistoryBatch', `timeline-mask:${node.id}:${clipId}`, 'Add timeline pen mask');
                call(domSource, 'refreshTimelinePenOverlayDom', stageEl, clip);
                call(mediaSource, 'syncTimelinePreviewVideos', nodeEl, node);
                call(persistenceSource, 'scheduleSave');
                if (call(selectionSource, 'getSelectedNodeId') === node.id) call(selectionSource, 'renderInspector');
            } else {
                call(domSource, 'refreshTimelinePenOverlayDom', stageEl, clip);
                call(mediaSource, 'syncTimelinePreviewVideos', nodeEl, node);
                call(persistenceSource, 'scheduleSave');
            }
        }

        function remapTimelineClipMaskForGeometryChange(node, clip, oldGeometry) {
            if (!node || !clip?.mask || !oldGeometry || clip.kind === 'audio') return false;
            const newGeometry = timelineMaskLayerGeometry(node, clip);
            if (!newGeometry) return false;
            const sameGeometry = ['left', 'top', 'fitW', 'fitH', 'centerX', 'centerY', 'rotate', 'canvasWidth', 'canvasHeight']
                .every(key => Math.abs(Number(oldGeometry[key] || 0) - Number(newGeometry[key] || 0)) < 0.0001);
            if (sameGeometry) return false;
            const remapPoints = points => remapTimelineMaskPoints(points, oldGeometry, newGeometry);
            const strokes = Array.isArray(clip.mask.strokes) ? clip.mask.strokes : [];
            const pending = clip.mask.pending_pen && Array.isArray(clip.mask.pending_pen.points)
                ? Object.assign({}, clip.mask.pending_pen, { points: remapPoints(clip.mask.pending_pen.points) })
                : clip.mask.pending_pen;
            Object.assign(clip, buildTimelineClipMaskPatch(clip, {
                maskPatch: {
                    space: 'canvas',
                    width: newGeometry.canvasWidth,
                    height: newGeometry.canvasHeight,
                    strokes: strokes.map(stroke => Object.assign({}, stroke, { points: remapPoints(stroke.points) })),
                    pending_pen: pending
                }
            }));
            const dataUrl = exportTimelineMaskDataUrl(node, clip);
            if (dataUrl) {
                Object.assign(clip, buildTimelineClipMaskPatch(clip, {
                    dataUrl,
                    width: newGeometry.canvasWidth,
                    height: newGeometry.canvasHeight
                }));
            }
            return true;
        }

        function remapTimelineMasksAfterCanvasResize(node, oldSnapshot) {
            if (!node || node.type !== 'timeline' || !oldSnapshot) return;
            const newWidth = Math.max(16, Math.round(Number(node.params?.width || 1280)));
            const newHeight = Math.max(16, Math.round(Number(node.params?.height || 720)));
            if (newWidth === oldSnapshot.width && newHeight === oldSnapshot.height) return;
            (node.clips || []).forEach(clip => {
                const oldGeometry = oldSnapshot.clips?.[clip.id];
                if (!clip?.mask || !oldGeometry || clip.kind === 'audio') return;
                const newGeometry = timelineMaskLayerGeometry(node, clip, { width: newWidth, height: newHeight });
                const strokes = Array.isArray(clip.mask.strokes) ? clip.mask.strokes : [];
                const remapPoints = points => remapTimelineMaskPoints(points, oldGeometry, newGeometry);
                const pending = clip.mask.pending_pen && Array.isArray(clip.mask.pending_pen.points)
                    ? Object.assign({}, clip.mask.pending_pen, { points: remapPoints(clip.mask.pending_pen.points) })
                    : clip.mask.pending_pen;
                Object.assign(clip, buildTimelineClipMaskPatch(clip, {
                    maskPatch: {
                        space: 'canvas',
                        width: newWidth,
                        height: newHeight,
                        strokes: strokes.map(stroke => Object.assign({}, stroke, { points: remapPoints(stroke.points) })),
                        pending_pen: pending
                    }
                }));
                const dataUrl = exportTimelineMaskDataUrl(node, clip);
                if (dataUrl) {
                    Object.assign(clip, buildTimelineClipMaskPatch(clip, { dataUrl, width: newWidth, height: newHeight }));
                }
            });
        }

        return {
            timelineMaskLayerGeometry,
            captureTimelineMaskGeometry,
            drawTimelineMaskStrokes,
            ensureTimelineMaskCanvas,
            applyTimelineMaskFeatherToSelectedClip,
            remapTimelineClipMaskForGeometryChange,
            remapTimelineMasksAfterCanvasResize,
            startTimelineMaskAnchorDrag,
            updateTimelineMaskAnchorDragFromPointer,
            stopTimelineMaskAnchorDrag,
            startTimelineMaskDraw,
            isDragging: () => !!anchorDragState,
            isPointerActive: () => !!anchorDragState,
            getDraggingNodeId: () => anchorDragState?.nodeId || null
        };
    }

    window.SimpAICanvasWorkbenchTimelineMask = Object.assign({}, window.SimpAICanvasWorkbenchTimelineMask || {}, {
        createCanvasTimelineMaskController
    });
})();
