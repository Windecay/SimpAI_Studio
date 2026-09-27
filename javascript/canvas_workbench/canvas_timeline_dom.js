(function () {
    'use strict';

    function createCanvasTimelineDomController(context) {
        const scope = context?.timelineDomSource || context || {};
        const documentSource = scope.documentSource || {};
        const interactionSource = scope.interactionSource || {};
        const mediaSource = scope.mediaSource || {};
        const nodeSource = scope.nodeSource || {};
        const timelineSource = scope.timelineSource || {};
        const maskSource = scope.maskSource || {};
        const call = (sourceObject, name, fallback, ...args) => typeof sourceObject[name] === 'function'
            ? sourceObject[name](...args)
            : fallback;
        const getDocument = () => call(documentSource, 'getDocument', null);
        const cssEscape = (value) => call(documentSource, 'cssEscape', String(value || ''), value);
        const clamp = typeof interactionSource.clamp === 'function'
            ? interactionSource.clamp
            : (value, min, max) => Math.max(min, Math.min(max, value));
        const formatAssetDuration = (value) => call(mediaSource, 'formatAssetDuration', String(value || 0), value);
        const getMediaEditRange = (asset) => call(mediaSource, 'getMediaEditRange', { start: 0 }, asset);
        const getNode = (id) => call(nodeSource, 'getNode', null, id);
        const getTimelineSourceAsset = (node) => call(mediaSource, 'getTimelineSourceAsset', null, node) || {};
        const timelineClipAtTime = (clip, playhead) => call(timelineSource, 'timelineClipAtTime', clip, clip, playhead);
        const timelineClipLayerGeometry = (...args) => call(timelineSource, 'timelineClipLayerGeometry', null, ...args);
        const timelineEffectiveClipIn = (clip, asset) => call(timelineSource, 'timelineEffectiveClipIn', null, clip, asset);

        function setTimelineMaskImageStyle(el, maskSrc) {
            if (!el) return;
            el.style.setProperty('--timeline-mask-image', `url("${String(maskSrc || '').replace(/"/g, '%22')}")`);
        }

        function refreshTimelineMaskImageOnly(stageEl, clip) {
            if (!stageEl || !clip) return false;
            const maskSrc = call(maskSource, 'clipMaskDataUrl', clip.mask?.data_url || clip.mask_data_url || '', clip);
            const clipSelector = cssEscape(clip.id);
            const cutout = stageEl.querySelector(`.sai-timeline-mask-cutout[data-mask-cutout-clip="${clipSelector}"]`)
                || Array.from(stageEl.querySelectorAll('.sai-timeline-mask-cutout')).find(el =>
                    el.querySelector?.(`.sai-timeline-preview-layer[data-preview-clip="${clipSelector}"]`));
            const maskPreview = stageEl.querySelector('.sai-timeline-mask-preview');
            if (!maskSrc || !cutout) return false;
            setTimelineMaskImageStyle(cutout, maskSrc);
            if (maskPreview && stageEl.getAttribute('data-timeline-tool-state') === 'mask') {
                setTimelineMaskImageStyle(maskPreview, maskSrc);
            }
            const sourceLayer = Array.from(stageEl.children).find(el =>
                el.classList?.contains('sai-timeline-preview-layer') && el.getAttribute('data-preview-clip') === clip.id);
            if (sourceLayer) sourceLayer.classList.add('has-mask');
            stageEl.classList.add('has-mask-cutout');
            return true;
        }

        function refreshTimelineFeatherControlDom(scopeEl, value) {
            if (!scopeEl) return;
            const feather = Math.round(clamp(Number(value || 0), 0, 120));
            scopeEl.querySelectorAll('[data-timeline-param="mask_feather"]').forEach((field) => {
                if (String(field.value) !== String(feather)) field.value = String(feather);
                const label = field.closest('.sai-timeline-feather-control, label');
                const valueEl = label?.querySelector?.('b');
                if (valueEl) valueEl.textContent = String(feather);
            });
        }

        function refreshTimelineInlineValue(input, key, clip) {
            const label = input?.closest?.('label');
            const valueEl = label?.querySelector?.('b');
            if (!valueEl || !clip) return;
            if (key === 'start' || key === 'duration') valueEl.textContent = formatAssetDuration(clip[key]);
            else if (key === 'opacity' || key === 'volume') valueEl.textContent = `${Math.round(Number(clip[key] ?? 1) * 100)}%`;
            else if (key === 'scale') valueEl.textContent = Number(clip.scale ?? 1).toFixed(2);
            else valueEl.textContent = String(clip[key] ?? '');
        }

        function refreshTimelinePreviewDom(nodeEl, node) {
            if (!nodeEl || !node) return;
            const playhead = Number(node.params?.playhead || 0);
            let activeCount = 0;
            nodeEl.querySelectorAll('[data-preview-clip]').forEach((layer) => {
                const clipId = layer.getAttribute('data-preview-clip');
                const clip = (node.clips || []).find(item => item.id === clipId);
                if (!clip) return;
                const start = Number(clip.start || 0);
                const end = start + Number(clip.duration || 0);
                const active = playhead >= start && playhead <= end;
                layer.classList.toggle('is-active', active);
                layer.classList.toggle('is-selected', clip.id === node.params?.selected_clip_id);
                if (active) activeCount += 1;
                applyTimelinePreviewLayerStyle(layer, clip, node);
            });
            const stage = nodeEl.querySelector('.sai-timeline-preview-stage');
            if (stage) {
                const width = Math.max(16, Number(node.params?.width || 1280));
                const height = Math.max(16, Number(node.params?.height || 720));
                stage.classList.toggle('has-active', activeCount > 0);
                stage.classList.toggle('show-guides', node.params?.guides_enabled !== false);
                stage.style.setProperty('--timeline-aspect', `${width}/${height}`);
                stage.style.setProperty('--timeline-aspect-value', `${Math.max(0.05, width / Math.max(1, height))}`);
                if (node.params?.background) stage.style.background = node.params.background;
                (node.clips || []).forEach((clip) => {
                    if (clip?.mask) refreshTimelineMaskImageOnly(stage, clip);
                });
            }
            syncTimelinePreviewVideos(nodeEl, node);
        }

        function refreshTimelinePreviewClipLayersDom(nodeEl, node, clip) {
            if (!nodeEl || !node || !clip) return;
            const selector = cssEscape(clip.id);
            nodeEl.querySelectorAll(`[data-preview-clip="${selector}"]`).forEach((layer) => {
                applyTimelinePreviewLayerStyle(layer, clip, node);
                layer.classList.toggle('is-selected', clip.id === node.params?.selected_clip_id);
            });
            const stage = nodeEl.querySelector('.sai-timeline-preview-stage');
            if (stage && clip.mask) refreshTimelineMaskImageOnly(stage, clip);
            syncTimelinePreviewVideos(nodeEl, node);
        }

        function refreshTimelineMaskFeatherDom(nodeEl, node) {
            if (!nodeEl || !node || node.type !== 'timeline') return;
            const clip = call(timelineSource, 'selectedVisualClip', null, node);
            refreshTimelineFeatherControlDom(nodeEl, node.params?.mask_feather || 0);
            const stage = nodeEl.querySelector('.sai-timeline-preview-stage');
            if (stage && clip) {
                if (!refreshTimelineMaskImageOnly(stage, clip)) refreshTimelinePenOverlayDom(stage, clip);
                syncTimelinePreviewVideos(nodeEl, node);
            }
        }

        function refreshTimelinePenOverlayDom(stageEl, clip, options) {
            if (!stageEl || !clip) return;
            const doc = getDocument();
            const oldPen = stageEl.querySelector('.sai-timeline-pen-overlay');
            if (oldPen) oldPen.remove();
            const updateMask = options?.mask !== false;
            const showPenOverlay = stageEl.getAttribute('data-timeline-tool-state') === 'mask';
            const clipSelector = cssEscape(clip.id);
            const oldCutout = stageEl.querySelector(`.sai-timeline-mask-cutout[data-mask-cutout-clip="${clipSelector}"]`)
                || Array.from(stageEl.querySelectorAll('.sai-timeline-mask-cutout')).find(el =>
                    el.querySelector?.(`.sai-timeline-preview-layer[data-preview-clip="${clipSelector}"]`));
            if (oldCutout && updateMask) oldCutout.remove();
            const penHtml = call(timelineSource, 'renderTimelinePenOverlay', '', clip);
            if (penHtml && showPenOverlay) {
                const template = doc.createElement('template');
                template.innerHTML = penHtml.trim();
                const overlay = template.content.firstElementChild;
                if (overlay) stageEl.insertBefore(overlay, stageEl.querySelector('.sai-timeline-preview-guides'));
            }
            const maskSrc = call(maskSource, 'clipMaskDataUrl', clip.mask?.data_url || clip.mask_data_url || '', clip);
            if (!updateMask) return;
            const showMaskPreview = stageEl.getAttribute('data-timeline-tool-state') === 'mask';
            let mask = stageEl.querySelector('.sai-timeline-mask-preview');
            if (maskSrc) {
                stageEl.classList.add('has-mask-cutout');
                const sourceLayer = Array.from(stageEl.children).find(el =>
                    el.classList?.contains('sai-timeline-preview-layer') && el.getAttribute('data-preview-clip') === clip.id);
                if (sourceLayer) {
                    sourceLayer.classList.add('has-mask');
                    const cutout = doc.createElement('div');
                    cutout.className = 'sai-timeline-mask-cutout';
                    cutout.setAttribute('data-mask-cutout-clip', clip.id);
                    cutout.setAttribute('aria-hidden', 'true');
                    setTimelineMaskImageStyle(cutout, maskSrc);
                    cutout.appendChild(sourceLayer.cloneNode(true));
                    stageEl.insertBefore(cutout, stageEl.querySelector('.sai-timeline-mask-preview') || stageEl.querySelector('.sai-timeline-pen-overlay') || stageEl.querySelector('.sai-timeline-preview-guides'));
                }
                if (!showMaskPreview) {
                    if (mask) mask.remove();
                    return;
                }
                if (!mask) {
                    mask = doc.createElement('div');
                    mask.className = 'sai-timeline-mask-preview';
                    mask.setAttribute('aria-hidden', 'true');
                    stageEl.insertBefore(mask, stageEl.querySelector('.sai-timeline-pen-overlay') || stageEl.querySelector('.sai-timeline-preview-guides'));
                }
                setTimelineMaskImageStyle(mask, maskSrc);
            } else if (mask) {
                mask.remove();
                const sourceLayer = Array.from(stageEl.children).find(el =>
                    el.classList?.contains('sai-timeline-preview-layer') && el.getAttribute('data-preview-clip') === clip.id);
                if (sourceLayer) sourceLayer.classList.remove('has-mask');
                if (!stageEl.querySelector('.sai-timeline-mask-cutout')) stageEl.classList.remove('has-mask-cutout');
            } else {
                const sourceLayer = Array.from(stageEl.children).find(el =>
                    el.classList?.contains('sai-timeline-preview-layer') && el.getAttribute('data-preview-clip') === clip.id);
                if (sourceLayer) sourceLayer.classList.remove('has-mask');
                if (!stageEl.querySelector('.sai-timeline-mask-cutout')) stageEl.classList.remove('has-mask-cutout');
            }
        }

        function applyTimelinePreviewLayerStyle(layer, clip, node) {
            if (!layer || !clip) return;
            const width = Math.max(16, Math.round(Number(node?.params?.width || 1280)));
            const height = Math.max(16, Math.round(Number(node?.params?.height || 720)));
            const source = getNode(clip?.source_node_id);
            const asset = getTimelineSourceAsset(source);
            const playhead = Number(node?.params?.playhead || 0);
            const effectiveClip = timelineClipAtTime(clip, playhead);
            const geometry = timelineClipLayerGeometry(width, height, asset.width, asset.height, effectiveClip);
            if (!geometry) return;
            layer.style.setProperty('--clip-x', `${((geometry.centerX / Math.max(1, width)) - 0.5) * 100}%`);
            layer.style.setProperty('--clip-y', `${((geometry.centerY / Math.max(1, height)) - 0.5) * 100}%`);
            layer.style.setProperty('--clip-fit-width', `${(geometry.fitW / Math.max(1, width)) * 100}%`);
            layer.style.setProperty('--clip-fit-height', `${(geometry.fitH / Math.max(1, height)) * 100}%`);
            layer.style.setProperty('--clip-scale', '1');
            layer.style.setProperty('--clip-opacity', `${clamp(Number(effectiveClip.opacity ?? 1), 0, 1)}`);
            layer.style.setProperty('--clip-rotate', `${Number(effectiveClip.rotate || 0)}deg`);
            const top = clamp(Number(clip.crop_top || 0), 0, 95);
            const right = clamp(Number(clip.crop_right || 0), 0, 95);
            const bottom = clamp(Number(clip.crop_bottom || 0), 0, 95);
            const left = clamp(Number(clip.crop_left || 0), 0, 95);
            layer.style.setProperty('--clip-crop', `inset(${top}% ${right}% ${bottom}% ${left}%)`);
            const cropBox = layer.querySelector('.sai-timeline-crop-box');
            if (cropBox) {
                cropBox.style.left = `${left}%`;
                cropBox.style.right = `${right}%`;
                cropBox.style.top = `${top}%`;
                cropBox.style.bottom = `${bottom}%`;
            }
        }

        function syncTimelinePreviewVideos(nodeEl, node) {
            if (!nodeEl || !node) return;
            const playhead = Number(node.params?.playhead || 0);
            const playing = !!node.params?.preview_playing;
            nodeEl.querySelectorAll('[data-preview-clip]').forEach((layer) => {
                const video = layer.querySelector('video[data-timeline-preview-video]');
                if (!video) return;
                const clip = (node.clips || []).find(item => item.id === layer.getAttribute('data-preview-clip'));
                const active = clip && playhead >= Number(clip.start || 0) && playhead <= Number(clip.start || 0) + Number(clip.duration || 0);
                if (!active) {
                    video.pause();
                    return;
                }
                const source = getNode(clip.source_node_id);
                const asset = getTimelineSourceAsset(source);
                const effectiveIn = timelineEffectiveClipIn(clip, asset);
                const target = Math.max(0, (effectiveIn ?? Math.max(0, Number(clip.in || 0), Number(getMediaEditRange(asset).start || 0))) + playhead - Number(clip.start || 0));
                video.dataset.timelineTargetTime = String(target);
                if (video.readyState < 1 || !Number.isFinite(video.duration)) {
                    if (!video.__simpaiTimelineEverSynced) video.classList.remove('is-timeline-synced');
                    if (!video.__simpaiTimelineMetadataSyncBound) {
                        video.__simpaiTimelineMetadataSyncBound = true;
                        video.addEventListener('loadedmetadata', () => {
                            video.__simpaiTimelineMetadataSyncBound = false;
                            syncTimelinePreviewVideos(nodeEl, node);
                        }, { once: true });
                    }
                    return;
                }
                const seekThreshold = playing ? 0.55 : 0.08;
                if (Number.isFinite(video.duration) && Math.abs((video.currentTime || 0) - target) > seekThreshold) {
                    if (!video.__simpaiTimelineEverSynced) video.classList.remove('is-timeline-synced');
                    if (!video.__simpaiTimelineSeekSyncBound) {
                        video.__simpaiTimelineSeekSyncBound = true;
                        video.addEventListener('seeked', () => {
                            video.__simpaiTimelineSeekSyncBound = false;
                            const expected = Number(video.dataset.timelineTargetTime || target);
                            if (Math.abs((video.currentTime || 0) - expected) < 0.12) {
                                video.__simpaiTimelineEverSynced = true;
                                video.classList.add('is-timeline-synced');
                            }
                        }, { once: true });
                    }
                    try { video.currentTime = Math.min(Math.max(0, target), Math.max(0, video.duration - 0.03)); } catch (err) {}
                } else {
                    video.__simpaiTimelineEverSynced = true;
                    video.classList.add('is-timeline-synced');
                }
                if (playing && video.paused) video.play().catch(() => {});
                if (!playing && !video.paused) video.pause();
            });
        }

        function normalizeKeyframes(clip) {
            const frames = call(timelineSource, 'timelineNormalizeKeyframes', null, clip);
            if (Array.isArray(frames)) return frames;
            return Array.isArray(clip?.keyframes)
                ? clip.keyframes.slice().sort((a, b) => Number(a.time || 0) - Number(b.time || 0))
                : [];
        }

        function timelineLaneInfoFromTarget(target, nodeEl) {
            const lane = target?.closest ? target.closest('.sai-timeline-track-lane') : null;
            const row = lane || nodeEl?.querySelector('.sai-timeline-track-lane');
            if (!row) return null;
            const trackEl = row.closest('[data-timeline-track]');
            const trackId = trackEl?.getAttribute('data-timeline-track') || '';
            const rect = row.getBoundingClientRect();
            return { lane: row, trackId, rect };
        }

        function timelineTrackClipLayout(node, trackId) {
            const clips = (node?.clips || []).filter(clip => clip.track_id === trackId);
            const layout = call(timelineSource, 'timelineBuildTrackClipLayout', null, clips);
            if (layout) return layout;
            return { rows: 1, map: Object.fromEntries(clips.map(clip => [clip.id, { row: 0, rows: 1 }])) };
        }

        function refreshTimelineTrackRowsDom(nodeEl, node) {
            if (!nodeEl || !node) return;
            (node.tracks || []).forEach((track) => {
                const layout = timelineTrackClipLayout(node, track.id);
                const trackEl = nodeEl.querySelector(`[data-timeline-track="${cssEscape(track.id)}"]`);
                if (trackEl) trackEl.style.setProperty('--timeline-track-rows', String(layout.rows));
                (node.clips || []).filter(clip => clip.track_id === track.id).forEach((clip) => {
                    const clipEl = nodeEl.querySelector(`[data-timeline-clip-id="${cssEscape(clip.id)}"]`);
                    const row = layout.map[clip.id] || { row: 0, rows: layout.rows };
                    if (clipEl) {
                        clipEl.style.setProperty('--timeline-clip-row', String(row.row || 0));
                        clipEl.style.setProperty('--timeline-track-rows', String(row.rows || layout.rows || 1));
                    }
                });
            });
        }

        function refreshTimelineClipDom(nodeEl, node, clip) {
            if (!nodeEl || !node || !clip) return;
            const params = Object.assign({ duration: 1 }, node.params || {});
            const el = nodeEl.querySelector(`[data-timeline-clip-id="${cssEscape(clip.id)}"]`);
            if (!el) return;
            const lane = nodeEl.querySelector(`[data-timeline-track="${cssEscape(clip.track_id || '')}"] .sai-timeline-track-lane`);
            if (lane && el.parentElement !== lane) lane.appendChild(el);
            const left = clamp((Number(clip.start || 0) / Math.max(1, Number(params.duration || 1))) * 100, 0, 100);
            const rawWidth = (Number(clip.duration || 0) / Math.max(1, Number(params.duration || 1))) * 100;
            const width = clamp(rawWidth, 0.6, Math.max(0.6, 100 - left));
            el.style.left = `${left}%`;
            el.style.width = `${width}%`;
            refreshTimelineKeyframeMarkersDom(nodeEl, node, clip);
            refreshTimelineTrackRowsDom(nodeEl, node);
        }

        function refreshTimelineAllClipDom(nodeEl, node) {
            if (!nodeEl || !node) return;
            (node.clips || []).forEach(clip => refreshTimelineClipDom(nodeEl, node, clip));
            refreshTimelineTrackRowsDom(nodeEl, node);
        }

        function refreshTimelinePlayheadDom(nodeEl, node) {
            if (!nodeEl || !node) return;
            const duration = Math.max(1, Number(node.params?.duration || 1));
            const playhead = clamp(Number(node.params?.playhead || 0), 0, duration);
            const pct = clamp((playhead / duration) * 100, 0, 100);
            nodeEl.querySelectorAll('[data-timeline-playhead-line]').forEach((line) => {
                line.style.left = `${pct}%`;
                const label = line.querySelector('b');
                if (label) label.textContent = formatAssetDuration(playhead);
            });
            refreshTimelineKeyframeActiveDom(nodeEl, node);
        }

        function refreshTimelineKeyframeActiveDom(nodeEl, node) {
            if (!nodeEl || !node) return;
            const playhead = Number(node.params?.playhead || 0);
            nodeEl.querySelectorAll('[data-timeline-keyframe-time]').forEach((marker) => {
                const time = Number(marker.getAttribute('data-timeline-keyframe-time') || 0);
                marker.classList.toggle('is-active', Math.abs(time - playhead) < 0.025);
            });
        }

        function refreshTimelineKeyframeMarkersDom(nodeEl, node, clip) {
            if (!nodeEl || !node || !clip || clip.kind === 'audio') return;
            const el = nodeEl.querySelector(`[data-timeline-clip-id="${cssEscape(clip.id)}"]`);
            if (!el) return;
            const start = Number(clip.start || 0);
            const duration = Math.max(0.000001, Number(clip.duration || 0));
            const end = start + duration;
            const frames = normalizeKeyframes(clip).filter((frame) => {
                const time = Number(frame.time || 0);
                return time >= start - 0.025 && time <= end + 0.025;
            });
            let container = el.querySelector('.sai-timeline-clip-keyframes');
            if (!frames.length) {
                if (container) container.remove();
                refreshTimelineRulerKeyframesDom(nodeEl, node);
                return;
            }
            const doc = getDocument();
            if (!doc?.createElement) return;
            if (!container) {
                container = doc.createElement('div');
                container.className = 'sai-timeline-clip-keyframes';
                const media = el.querySelector('.sai-timeline-clip-thumbs,.sai-timeline-clip-waveform');
                if (media?.nextSibling) el.insertBefore(container, media.nextSibling);
                else el.insertBefore(container, el.firstChild);
            }
            container.textContent = '';
            frames.forEach((frame) => {
                const time = Number(frame.time || 0);
                const button = doc.createElement('button');
                button.type = 'button';
                button.className = 'sai-timeline-keyframe-marker';
                button.setAttribute('data-timeline-keyframe-jump', `${clip.id}:${time}`);
                button.setAttribute('data-timeline-keyframe-id', frame.id || '');
                button.setAttribute('data-timeline-keyframe-time', String(time));
                button.style.left = `${clamp(((time - start) / duration) * 100, 0, 100)}%`;
                button.title = `Keyframe ${formatAssetDuration(time)}`;
                button.setAttribute('aria-label', `Jump to keyframe ${formatAssetDuration(time)}`);
                container.appendChild(button);
            });
            refreshTimelineRulerKeyframesDom(nodeEl, node);
            refreshTimelineKeyframeActiveDom(nodeEl, node);
        }

        function refreshTimelineRulerKeyframesDom(nodeEl, node) {
            if (!nodeEl || !node) return;
            const ruler = nodeEl.querySelector('.sai-timeline-ruler');
            if (!ruler) return;
            const clip = (node.clips || []).find(item => item.id === node.params?.selected_clip_id && item.kind !== 'audio');
            const duration = Math.max(1, Number(node.params?.duration || 1));
            const frames = clip ? normalizeKeyframes(clip).filter((frame) => {
                const time = Number(frame.time || 0);
                return time >= 0 && time <= duration;
            }) : [];
            let container = ruler.querySelector('.sai-timeline-ruler-keyframes');
            if (!frames.length) {
                if (container) container.remove();
                return;
            }
            const doc = getDocument();
            if (!doc?.createElement) return;
            if (!container) {
                container = doc.createElement('div');
                container.className = 'sai-timeline-ruler-keyframes';
                const playhead = ruler.querySelector('[data-timeline-playhead-line]');
                if (playhead) ruler.insertBefore(container, playhead);
                else ruler.appendChild(container);
            }
            container.textContent = '';
            frames.forEach((frame) => {
                const time = Number(frame.time || 0);
                const button = doc.createElement('button');
                button.type = 'button';
                button.className = 'sai-timeline-ruler-keyframe';
                button.setAttribute('data-timeline-keyframe-jump', `${clip.id}:${time}`);
                button.setAttribute('data-timeline-keyframe-id', frame.id || '');
                button.setAttribute('data-timeline-keyframe-time', String(time));
                button.style.left = `${clamp((time / duration) * 100, 0, 100)}%`;
                button.title = `Keyframe ${formatAssetDuration(time)}`;
                button.setAttribute('aria-label', `Jump to keyframe ${formatAssetDuration(time)}`);
                container.appendChild(button);
            });
            refreshTimelineKeyframeActiveDom(nodeEl, node);
        }

        return {
            setTimelineMaskImageStyle,
            refreshTimelineMaskImageOnly,
            refreshTimelineFeatherControlDom,
            refreshTimelineInlineValue,
            refreshTimelinePreviewDom,
            refreshTimelinePreviewClipLayersDom,
            refreshTimelineMaskFeatherDom,
            refreshTimelinePenOverlayDom,
            applyTimelinePreviewLayerStyle,
            syncTimelinePreviewVideos,
            timelineLaneInfoFromTarget,
            timelineTrackClipLayout,
            timelineNormalizedKeyframes: normalizeKeyframes,
            refreshTimelineTrackRowsDom,
            refreshTimelineClipDom,
            refreshTimelineAllClipDom,
            refreshTimelinePlayheadDom,
            refreshTimelineKeyframeActiveDom,
            refreshTimelineKeyframeMarkersDom,
            refreshTimelineRulerKeyframesDom
        };
    }

    window.SimpAICanvasWorkbenchTimelineDom = Object.assign({}, window.SimpAICanvasWorkbenchTimelineDom || {}, {
        createCanvasTimelineDomController
    });
})();
