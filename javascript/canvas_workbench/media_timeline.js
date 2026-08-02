(function () {
    'use strict';

    const UTILS = window.SimpAICanvasWorkbenchUtils || {};
    const ASSETS = window.SimpAICanvasWorkbenchAssetNodes || {};
    const escapeHtml = UTILS.escapeHtml || ((value) => String(value ?? ''));
    const clamp = UTILS.clamp || ((value, min, max) => Math.max(min, Math.min(max, value)));
    const t = UTILS.t || ((en, cn) => cn || en);
    const tOption = UTILS.tOption || ((value) => String(value ?? ''));

    const DEFAULT_PARAMS = {
        width: 1280,
        height: 720,
        aspect: '16:9',
        fps: 30,
        duration: 10,
        background: '#000000',
        zoom: 1,
        playhead: 0,
        selected_clip_id: '',
        size_preset: '1280x720',
        fps_preset: '30',
        preview_tool: 'transform',
        preview_playing: false,
        snap_enabled: true,
        guides_enabled: true,
        mask_mode: 'pen',
        mask_feather: 0
    };

    const SIZE_PRESETS = [
        ['1280x720', 'Landscape 720p'],
        ['1920x1080', 'Landscape 1080p'],
        ['2560x1440', 'Landscape 2K'],
        ['720x1280', 'Portrait 720p'],
        ['1080x1920', 'Portrait 1080p'],
        ['1440x2560', 'Portrait 2K'],
        ['1024x1024', 'Square 1024'],
        ['custom', 'Custom']
    ];

    const FPS_PRESETS = ['24', '25', '30', '48', '60', 'custom'];

    const DEFAULT_TRACKS = [
        { id: 'v2', type: 'video', name: 'Overlay' },
        { id: 'v1', type: 'video', name: 'Video / Image' },
        { id: 'a1', type: 'audio', name: 'Audio' }
    ];

    const KEYFRAME_PROPS = ['x', 'y', 'scale', 'rotate', 'opacity'];
    const KEYFRAME_TIME_EPSILON = 0.025;

    function call(context, name, fallback, ...args) {
        return typeof context?.[name] === 'function' ? context[name](...args) : fallback;
    }

    function formatDuration(seconds) {
        if (typeof ASSETS.formatDuration === 'function') return ASSETS.formatDuration(seconds);
        const value = Number(seconds || 0);
        if (!Number.isFinite(value) || value <= 0) return '0s';
        const mins = Math.floor(value / 60);
        const secs = Math.round(value % 60).toString().padStart(2, '0');
        return mins ? `${mins}:${secs}` : `${Math.round(value * 10) / 10}s`;
    }

    function mediaEditRange(asset) {
        if (typeof ASSETS.mediaEditRange === 'function') return ASSETS.mediaEditRange(asset || {});
        const duration = Math.max(0, Number(asset?.duration || 0) || 0);
        return { start: 0, end: duration, duration, clipped: false };
    }

    function assetMediaKind(asset) {
        const mime = String(asset?.mime || '').toLowerCase();
        if (mime.startsWith('video/')) return 'video';
        if (mime.startsWith('audio/')) return 'audio';
        return 'image';
    }

    function timelineRoundPixel(value, fallback) {
        const raw = Number(value);
        if (!Number.isFinite(raw) || raw <= 0) return Math.max(2, Number(fallback || 2));
        return Math.max(2, Math.round(raw));
    }

    function timelineClipFitGeometry(params, asset) {
        const width = Math.max(16, Math.round(Number(params?.width || DEFAULT_PARAMS.width)));
        const height = Math.max(16, Math.round(Number(params?.height || DEFAULT_PARAMS.height)));
        const canvasAspect = Math.max(0.01, width / Math.max(1, height));
        const assetWidth = Number(asset?.width || 0);
        const assetHeight = Number(asset?.height || 0);
        const assetAspect = assetWidth && assetHeight ? clamp(assetWidth / Math.max(1, assetHeight), 0.05, 20) : canvasAspect;
        let fitWidth = assetAspect >= canvasAspect ? width : height * assetAspect;
        let fitHeight = assetAspect >= canvasAspect ? width / assetAspect : height;
        fitWidth = Math.min(width, timelineRoundPixel(fitWidth, width));
        fitHeight = Math.min(height, timelineRoundPixel(fitHeight, height));
        return {
            fitWidthPct: clamp((fitWidth / Math.max(1, width)) * 100, 1, 100),
            fitHeightPct: clamp((fitHeight / Math.max(1, height)) * 100, 1, 100)
        };
    }

    function timelineClipScaledGeometry(params, asset, clip) {
        const fit = timelineClipFitGeometry(params, asset);
        const width = Math.max(16, Math.round(Number(params?.width || DEFAULT_PARAMS.width)));
        const height = Math.max(16, Math.round(Number(params?.height || DEFAULT_PARAMS.height)));
        const scale = Math.max(0.05, Number(clip?.scale || 1));
        const fitW = (fit.fitWidthPct / 100) * width;
        const fitH = (fit.fitHeightPct / 100) * height;
        const scaledW = timelineRoundPixel(fitW * scale, fitW);
        const scaledH = timelineRoundPixel(fitH * scale, fitH);
        return {
            width: scaledW,
            height: scaledH,
            fitWidthPct: clamp((scaledW / Math.max(1, width)) * 100, 1, 300),
            fitHeightPct: clamp((scaledH / Math.max(1, height)) * 100, 1, 300)
        };
    }

    function timelineClipLayerOffset(params, asset, clip) {
        const width = Math.max(16, Math.round(Number(params?.width || DEFAULT_PARAMS.width)));
        const height = Math.max(16, Math.round(Number(params?.height || DEFAULT_PARAMS.height)));
        const centerX = Math.round(width / 2 + (Number(clip?.x || 0) / 100) * width);
        const centerY = Math.round(height / 2 + (Number(clip?.y || 0) / 100) * height);
        const fit = timelineClipScaledGeometry(params, asset, clip);
        const layerW = Math.round(Number(fit.width || 0));
        const layerH = Math.round(Number(fit.height || 0));
        const left = Math.round(centerX - layerW / 2);
        const top = Math.round(centerY - layerH / 2);
        return {
            x: (((left + layerW / 2) / Math.max(1, width)) - 0.5) * 100,
            y: (((top + layerH / 2) / Math.max(1, height)) - 0.5) * 100,
            left,
            top,
            width: Math.round(layerW),
            height: Math.round(layerH)
        };
    }

    function sourceAsset(source, context) {
        if (!source) return null;
        return call(context, 'getTimelineSourceAsset', null, source) || source.asset || null;
    }

    function isTimelineSource(source, context) {
        if (!source || !['image', 'video', 'audio', 'result'].includes(source.type)) return false;
        if (['image', 'video', 'audio'].includes(source.type)) return true;
        const asset = sourceAsset(source, context);
        return !!asset && ['image', 'video', 'audio'].includes(assetMediaKind(asset));
    }

    function defaultTrackId(kind) {
        return kind === 'audio' ? 'a1' : 'v1';
    }

    function normalizeParams(params) {
        const next = Object.assign({}, DEFAULT_PARAMS, params || {});
        next.width = Math.max(16, Math.round(Number(next.width || DEFAULT_PARAMS.width)));
        next.height = Math.max(16, Math.round(Number(next.height || DEFAULT_PARAMS.height)));
        next.fps = clamp(Number(next.fps || DEFAULT_PARAMS.fps), 1, 120);
        next.duration = Math.max(1, Number(next.duration || DEFAULT_PARAMS.duration));
        next.zoom = clamp(Number(next.zoom || DEFAULT_PARAMS.zoom), 0.25, 8);
        if (!next.aspect) next.aspect = `${next.width}:${next.height}`;
        if (!next.size_preset) next.size_preset = `${next.width}x${next.height}`;
        if (!next.fps_preset) next.fps_preset = String(next.fps);
        return next;
    }

    function normalizeKeyframes(clip) {
        const frames = Array.isArray(clip?.keyframes) ? clip.keyframes : [];
        return frames
            .map((frame, index) => {
                const values = frame?.values && typeof frame.values === 'object' ? frame.values : frame || {};
                const nextValues = {};
                KEYFRAME_PROPS.forEach((key) => {
                    const value = Number(values[key]);
                    if (Number.isFinite(value)) nextValues[key] = value;
                });
                return {
                    id: frame?.id || `kf_${index + 1}`,
                    time: Math.max(0, Number(frame?.time || 0)),
                    values: nextValues,
                    easing: frame?.easing || 'linear'
                };
            })
            .filter(frame => Object.keys(frame.values).length)
            .sort((a, b) => Number(a.time || 0) - Number(b.time || 0));
    }

    function clipKeyframeValueAt(clip, key, playhead) {
        const frames = normalizeKeyframes(clip).filter(frame => Object.prototype.hasOwnProperty.call(frame.values, key));
        if (!frames.length) return Number(clip?.[key] ?? (key === 'scale' || key === 'opacity' ? 1 : 0));
        const time = Number(playhead || 0);
        if (time <= Number(frames[0].time || 0)) return Number(frames[0].values[key]);
        const last = frames[frames.length - 1];
        if (time >= Number(last.time || 0)) return Number(last.values[key]);
        for (let i = 0; i < frames.length - 1; i += 1) {
            const a = frames[i];
            const b = frames[i + 1];
            const start = Number(a.time || 0);
            const end = Number(b.time || 0);
            if (time < start || time > end) continue;
            const span = Math.max(0.000001, end - start);
            const easing = String(a.easing || 'linear');
            const rawT = clamp((time - start) / span, 0, 1);
            const t = applyKeyframeEasing(rawT, easing);
            return Number(a.values[key]) + (Number(b.values[key]) - Number(a.values[key])) * t;
        }
        return Number(clip?.[key] ?? (key === 'scale' || key === 'opacity' ? 1 : 0));
    }

    function applyKeyframeEasing(t, easing) {
        const value = clamp(Number(t || 0), 0, 1);
        if (easing === 'hold') return 0;
        if (easing === 'ease_in') return value * value * value;
        if (easing === 'ease_out') return 1 - Math.pow(1 - value, 3);
        if (easing === 'easy_ease') return value < 0.5
            ? 4 * value * value * value
            : 1 - Math.pow(-2 * value + 2, 3) / 2;
        return value;
    }

    function clipAtTime(clip, playhead) {
        if (!clip || clip.kind === 'audio') return clip;
        const next = Object.assign({}, clip);
        KEYFRAME_PROPS.forEach((key) => {
            next[key] = clipKeyframeValueAt(clip, key, playhead);
        });
        return next;
    }

    function clipKeyframeAtPlayhead(clip, playhead) {
        const time = Number(playhead || 0);
        return normalizeKeyframes(clip).some(frame => Math.abs(Number(frame.time || 0) - time) < KEYFRAME_TIME_EPSILON);
    }

    function normalizeNode(node) {
        if (!node) return null;
        node.params = normalizeParams(node.params);
        node.tracks = Array.isArray(node.tracks) && node.tracks.length
            ? node.tracks.map(track => Object.assign({}, track))
            : DEFAULT_TRACKS.map(track => Object.assign({}, track));
        const trackIds = new Set(node.tracks.map(track => track.id));
        node.clips = Array.isArray(node.clips) ? node.clips.map((clip, index) => {
            const kind = ['video', 'audio', 'image'].includes(clip.kind) ? clip.kind : 'image';
            const trackId = trackIds.has(clip.track_id) ? clip.track_id : defaultTrackId(kind);
            const start = Math.max(0, Number(clip.start || 0));
            const duration = Math.max(0.05, Number(clip.duration || (kind === 'image' ? 4 : 1)));
            const next = Object.assign({
                id: clip.id || `clip_${index + 1}`,
                title: clip.title || `Clip ${index + 1}`,
                source_node_id: clip.source_node_id || '',
                source_type: clip.source_type || '',
                kind,
                track_id: trackId,
                start,
                in: Math.max(0, Number(clip.in || 0)),
                out: Math.max(0, Number(clip.out || duration)),
                duration,
                x: 0,
                y: 0,
                scale: 1,
                opacity: 1,
                volume: 1,
                fit: 'contain',
                rotate: 0,
                crop_left: 0,
                crop_top: 0,
                crop_right: 0,
                crop_bottom: 0,
                mask: null,
                mask_data_url: ''
            }, clip, { kind, track_id: trackId, start, duration });
            next.keyframes = normalizeKeyframes(next);
            return next;
        }) : [];
        node.params.playhead = clamp(Number(node.params.playhead || 0), 0, node.params.duration);
        if (!node.clips.some(clip => clip.id === node.params.selected_clip_id)) {
            node.params.selected_clip_id = node.clips[0]?.id || '';
        }
        return node;
    }

    function timelineDuration(node) {
        const clips = Array.isArray(node?.clips) ? node.clips : [];
        return Math.max(1, ...clips.map(clip => Number(clip.start || 0) + Number(clip.duration || 0)));
    }

    function clipEnd(clip) {
        return Number(clip?.start || 0) + Number(clip?.duration || 0);
    }

    function effectiveClipIn(clip, asset) {
        const range = mediaEditRange(asset || {});
        return Math.max(0, Number(clip?.in || 0), Number(range.start || 0));
    }

    function buildTrackClipLayout(clips) {
        const rows = [];
        const map = {};
        const sorted = (clips || []).slice().sort((a, b) => {
            const startDelta = Number(a.start || 0) - Number(b.start || 0);
            if (Math.abs(startDelta) > 0.0001) return startDelta;
            return clipEnd(b) - clipEnd(a);
        });
        sorted.forEach((clip) => {
            const start = Number(clip.start || 0);
            const end = clipEnd(clip);
            let row = rows.findIndex(value => value <= start + 0.001);
            if (row < 0) {
                row = rows.length;
                rows.push(0);
            }
            rows[row] = Math.max(rows[row] || 0, end);
            map[clip.id] = { row, rows: Math.max(1, rows.length) };
        });
        const count = Math.max(1, rows.length);
        Object.keys(map).forEach((id) => { map[id].rows = count; });
        return { rows: count, map };
    }

    function nextStartForTrack(node, trackId) {
        const clips = Array.isArray(node?.clips) ? node.clips.filter(clip => clip.track_id === trackId) : [];
        return clips.reduce((max, clip) => Math.max(max, Number(clip.start || 0) + Number(clip.duration || 0)), 0);
    }

    function createClipFromSource(source, options, context) {
        const opts = options || {};
        const asset = sourceAsset(source, context) || {};
        const kind = assetMediaKind(asset) || (['image', 'video', 'audio'].includes(source?.type) ? source.type : '');
        const range = mediaEditRange(asset);
        const sourceDuration = Math.max(0, Number(range.end || 0) - Number(range.start || 0));
        const duration = kind === 'image' ? Number(opts.imageDuration || 4) : (sourceDuration || Number(asset.duration || 1) || 1);
        const trackId = opts.track_id || defaultTrackId(kind);
        return {
            id: opts.id || call(context, 'uid', `clip_${Date.now().toString(36)}`, 'clip'),
            source_node_id: source.id,
            source_type: source.type,
            title: source.title || asset.name || `${kind} clip`,
            kind,
            track_id: trackId,
            start: Number.isFinite(Number(opts.start)) ? Math.max(0, Number(opts.start)) : 0,
            in: Math.max(0, Number(range.start || 0)),
            out: Math.max(0, Number(range.start || 0) + duration),
            duration: Math.max(0.05, duration),
            x: 0,
            y: 0,
            scale: 1,
            opacity: kind === 'audio' ? 1 : 1,
            volume: kind === 'audio' ? 1 : 0,
            fit: 'contain',
            rotate: 0,
            crop_left: 0,
            crop_top: 0,
            crop_right: 0,
            crop_bottom: 0,
            mask: null,
            mask_data_url: ''
        };
    }

    function clipMaskDataUrl(clip) {
        if (!clip) return '';
        return clip.mask?.data_url || clip.mask_data_url || clip.mask_asset?.data_url || '';
    }

    function clipMaskPayload(clip) {
        const dataUrl = clipMaskDataUrl(clip);
        const mask = clip?.mask && typeof clip.mask === 'object' ? clip.mask : {};
        if (!dataUrl && !Array.isArray(mask.strokes) && !clip?.mask_asset) return null;
        return {
            kind: mask.kind || 'pen_alpha',
            space: mask.space || 'canvas',
            width: Number(mask.width || 0) || null,
            height: Number(mask.height || 0) || null,
            data_url: dataUrl,
            strokes: Array.isArray(mask.strokes) ? mask.strokes : [],
            asset: clip.mask_asset || null
        };
    }

    function clipSource(node, clip, context) {
        return call(context, 'getNode', null, clip?.source_node_id);
    }

    function clipAsset(node, clip, context) {
        return sourceAsset(clipSource(node, clip, context), context);
    }

    function assetSrc(asset) {
        if (typeof ASSETS.assetDisplaySrc === 'function') return ASSETS.assetDisplaySrc(asset || {});
        if (!asset) return '';
        if (asset.kind === 'browser_upload' && asset.data_url) return asset.data_url;
        return asset.preview_url || asset.data_url || asset.thumb || '';
    }

    function mediaSrcAtTime(src, time) {
        const value = String(src || '');
        const seconds = Math.max(0, Number(time || 0));
        if (!value || seconds <= 0.001) return value;
        return `${value.split('#')[0]}#t=${seconds.toFixed(3)}`;
    }

    function assetThumbSrc(asset) {
        if (typeof ASSETS.assetThumbSrc === 'function') return ASSETS.assetThumbSrc(asset || {});
        return asset?.thumb || asset?.preview_url || asset?.data_url || '';
    }

    function clipAtPlayhead(clip, playhead) {
        const start = Number(clip?.start || 0);
        const end = start + Number(clip?.duration || 0);
        return Number(playhead || 0) >= start && Number(playhead || 0) <= end;
    }

    function renderClip(node, clip, context, layout) {
        const params = normalizeParams(node?.params);
        const source = clipSource(node, clip, context);
        const asset = clipAsset(node, clip, context);
        const left = clamp((Number(clip.start || 0) / params.duration) * 100, 0, 100);
        const rawWidth = (Number(clip.duration || 0) / params.duration) * 100;
        const width = clamp(rawWidth, 0.6, Math.max(0.6, 100 - left));
        const missing = !source || !asset;
        const icon = clip.kind === 'audio' ? 'fa-wave-square' : (clip.kind === 'video' ? 'fa-film' : 'fa-image');
        const meta = clip.kind === 'audio'
            ? t(`vol ${Math.round(Number(clip.volume ?? 1) * 100)}%`, `音量 ${Math.round(Number(clip.volume ?? 1) * 100)}%`)
            : t(
                `op ${Math.round(Number(clip.opacity ?? 1) * 100)}% / scale ${Number(clip.scale ?? 1).toFixed(2)}`,
                `不透明度 ${Math.round(Number(clip.opacity ?? 1) * 100)}% / 缩放 ${Number(clip.scale ?? 1).toFixed(2)}`
            );
        const selected = clip.id && clip.id === node?.params?.selected_clip_id;
        const row = Math.max(0, Number(layout?.row || 0));
        const rows = Math.max(1, Number(layout?.rows || 1));
        const mediaStrip = renderClipMediaStrip(clip, asset);
        const keyframeMarkers = renderClipKeyframeMarkers(clip, params);
        return `<div class="sai-timeline-clip sai-timeline-clip-${escapeHtml(clip.kind)} ${selected ? 'is-selected' : ''} ${missing ? 'is-missing' : ''}" data-timeline-clip-id="${escapeHtml(clip.id)}" style="left:${left}%;width:${width}%;--timeline-clip-row:${row};--timeline-track-rows:${rows}">
  ${mediaStrip}
  ${keyframeMarkers}
  <button type="button" class="sai-timeline-clip-trim sai-timeline-clip-trim-start" data-timeline-trim="start" title="${escapeHtml(t('Trim start', '裁剪起点'))}"></button>
  <i class="fa-solid ${icon}"></i>
  <span>${escapeHtml(clip.title || t('Clip', '片段'))}</span>
  <small>${escapeHtml(formatDuration(clip.duration))} / ${escapeHtml(meta)}</small>
  <button type="button" class="sai-timeline-clip-trim sai-timeline-clip-trim-end" data-timeline-trim="end" title="${escapeHtml(t('Trim end', '裁剪终点'))}"></button>
</div>`;
    }

    function renderClipMediaStrip(clip, asset) {
        if (!asset || !clip) return '';
        if (clip.kind === 'audio') {
            const values = Array.isArray(asset.waveform) && asset.waveform.length ? asset.waveform.slice(0, 72) : [];
            if (!values.length) return '';
            const bars = values.map((value) => {
                const h = clamp(Number(value || 0), 0.04, 1);
                return `<i style="height:${Math.round(h * 100)}%"></i>`;
            }).join('');
            return `<div class="sai-timeline-clip-waveform" aria-hidden="true">${bars}</div>`;
        }
        const frames = Array.isArray(asset.preview_frames)
            ? asset.preview_frames.map(item => item?.thumb || item?.data_url || '').filter(Boolean).slice(0, 8)
            : [];
        const thumbs = frames.length ? frames : [assetThumbSrc(asset)].filter(Boolean);
        if (!thumbs.length) return '';
        return `<div class="sai-timeline-clip-thumbs" aria-hidden="true">${thumbs.map(src => `<img src="${escapeHtml(src)}" alt="" draggable="false">`).join('')}</div>`;
    }

    function renderClipKeyframeMarkers(clip, params) {
        if (!clip || clip.kind === 'audio') return '';
        const start = Number(clip.start || 0);
        const duration = Math.max(0.000001, Number(clip.duration || 0));
        const end = start + duration;
        const playhead = Number(params?.playhead || 0);
        const markers = normalizeKeyframes(clip)
            .filter(frame => Number(frame.time || 0) >= start - KEYFRAME_TIME_EPSILON && Number(frame.time || 0) <= end + KEYFRAME_TIME_EPSILON)
            .map((frame) => {
                const time = Number(frame.time || 0);
                const pct = clamp(((time - start) / duration) * 100, 0, 100);
                const active = Math.abs(time - playhead) < KEYFRAME_TIME_EPSILON;
                const title = t(`Keyframe ${formatDuration(time)}`, `关键帧 ${formatDuration(time)}`);
                const ariaLabel = t(`Jump to keyframe ${formatDuration(time)}`, `跳转到关键帧 ${formatDuration(time)}`);
                return `<button type="button" class="sai-timeline-keyframe-marker ${active ? 'is-active' : ''}" data-timeline-keyframe-jump="${escapeHtml(clip.id)}:${escapeHtml(String(time))}" data-timeline-keyframe-id="${escapeHtml(frame.id || '')}" data-timeline-keyframe-time="${escapeHtml(String(time))}" style="left:${pct}%" title="${escapeHtml(title)}" aria-label="${escapeHtml(ariaLabel)}"></button>`;
            });
        return markers.length ? `<div class="sai-timeline-clip-keyframes" aria-hidden="false">${markers.join('')}</div>` : '';
    }

    function renderTrack(node, track, context) {
        const clips = (node.clips || []).filter(clip => clip.track_id === track.id);
        const layout = buildTrackClipLayout(clips);
        return `<div class="sai-timeline-track sai-timeline-track-${escapeHtml(track.type || 'video')}" data-timeline-track="${escapeHtml(track.id)}" style="--timeline-track-rows:${layout.rows}">
  <button type="button" class="sai-node-handle sai-node-handle-in sai-timeline-track-port" data-timeline-track-in="${escapeHtml(track.id)}" title="${escapeHtml(t('Connect media to this track', '连接素材到该轨道'))}"></button>
  <div class="sai-timeline-track-head"><b>${escapeHtml(track.name || track.id)}</b><small>${escapeHtml(t(String(track.type || ''), track.type === 'video' ? '视频' : (track.type === 'audio' ? '音频' : String(track.type || ''))))}</small><span><button type="button" data-timeline-track-action="up" title="${escapeHtml(t('Move track up', '上移轨道'))}"><i class="fa-solid fa-arrow-up"></i></button><button type="button" data-timeline-track-action="down" title="${escapeHtml(t('Move track down', '下移轨道'))}"><i class="fa-solid fa-arrow-down"></i></button></span></div>
  <div class="sai-timeline-track-lane">${clips.map(clip => renderClip(node, clip, context, layout.map[clip.id])).join('') || `<span class="sai-timeline-empty-lane">${escapeHtml(t('Drop media here', '拖入素材'))}</span>`}</div>
</div>`;
    }

    function renderRuler(node) {
        const params = normalizeParams(node?.params);
        const playheadPct = clamp((Number(params.playhead || 0) / params.duration) * 100, 0, 100);
        const marks = [];
        const count = 5;
        for (let i = 0; i <= count; i += 1) {
            const t = params.duration * i / count;
            marks.push(`<span style="left:${i * 100 / count}%">${escapeHtml(formatDuration(t))}</span>`);
        }
        const selectedClip = (node?.clips || []).find(clip => clip.id === node?.params?.selected_clip_id && clip.kind !== 'audio');
        const selectedMarkers = renderRulerKeyframeMarkers(selectedClip, params);
        return `<div class="sai-timeline-ruler" data-timeline-playhead-lane><div class="sai-timeline-ruler-marks">${marks.join('')}</div>${selectedMarkers}<i class="sai-timeline-playhead-line" data-timeline-playhead-line style="left:${playheadPct}%"><b>${escapeHtml(formatDuration(params.playhead))}</b></i></div>`;
    }

    function renderRulerKeyframeMarkers(clip, params) {
        if (!clip) return '';
        const duration = Math.max(1, Number(params?.duration || 1));
        const playhead = Number(params?.playhead || 0);
        const markers = normalizeKeyframes(clip)
            .filter(frame => Number(frame.time || 0) >= 0 && Number(frame.time || 0) <= duration)
            .map((frame) => {
                const time = Number(frame.time || 0);
                const pct = clamp((time / duration) * 100, 0, 100);
                const active = Math.abs(time - playhead) < KEYFRAME_TIME_EPSILON;
                const title = t(`Keyframe ${formatDuration(time)}`, `关键帧 ${formatDuration(time)}`);
                const ariaLabel = t(`Jump to keyframe ${formatDuration(time)}`, `跳转到关键帧 ${formatDuration(time)}`);
                return `<button type="button" class="sai-timeline-ruler-keyframe ${active ? 'is-active' : ''}" data-timeline-keyframe-jump="${escapeHtml(clip.id)}:${escapeHtml(String(time))}" data-timeline-keyframe-id="${escapeHtml(frame.id || '')}" data-timeline-keyframe-time="${escapeHtml(String(time))}" style="left:${pct}%" title="${escapeHtml(title)}" aria-label="${escapeHtml(ariaLabel)}"></button>`;
            });
        return markers.length ? `<div class="sai-timeline-ruler-keyframes">${markers.join('')}</div>` : '';
    }

    function previewLayerZIndex(node, clip) {
        const tracks = node?.tracks || [];
        const clips = node?.clips || [];
        const trackIndex = Math.max(0, tracks.findIndex(track => track.id === clip?.track_id));
        const clipIndex = Math.max(0, clips.filter(item => item.kind !== 'audio' && item.track_id === clip?.track_id).findIndex(item => item.id === clip?.id));
        return Math.max(1, (tracks.length - trackIndex) * 100 + clipIndex);
    }

    function renderPreviewLayer(node, clip, context, playhead) {
        const asset = clipAsset(node, clip, context);
        const src = assetSrc(asset);
        if (!src || clip.kind === 'audio') return '';
        const active = clipAtPlayhead(clip, playhead);
        const crop = [
            clamp(Number(clip.crop_top || 0), 0, 95),
            clamp(Number(clip.crop_right || 0), 0, 95),
            clamp(Number(clip.crop_bottom || 0), 0, 95),
            clamp(Number(clip.crop_left || 0), 0, 95)
        ];
        const params = normalizeParams(node?.params);
        const effectiveClip = clipAtTime(clip, playhead);
        const fit = timelineClipScaledGeometry(params, asset, effectiveClip);
        const offset = timelineClipLayerOffset(params, asset, effectiveClip);
        const zIndex = previewLayerZIndex(node, clip);
        const style = [
            `--clip-x:${offset.x}%`,
            `--clip-y:${offset.y}%`,
            `--clip-scale:1`,
            `--clip-opacity:${clamp(Number(effectiveClip.opacity ?? 1), 0, 1)}`,
            `--clip-crop:inset(${crop[0]}% ${crop[1]}% ${crop[2]}% ${crop[3]}%)`,
            `--clip-fit-width:${fit.fitWidthPct}%`,
            `--clip-fit-height:${fit.fitHeightPct}%`,
            `--clip-rotate:${Number(effectiveClip.rotate || 0)}deg`,
            `--clip-z:${zIndex}`
        ].join(';');
        const cropBoxStyle = `left:${crop[3]}%;right:${crop[1]}%;top:${crop[0]}%;bottom:${crop[2]}%`;
        const maskSrc = clipMaskDataUrl(clip);
        const videoTime = clip.kind === 'video'
            ? Math.max(0, effectiveClipIn(clip, asset) + Number(playhead || 0) - Number(clip.start || 0))
            : 0;
        const mediaSrc = clip.kind === 'video' ? mediaSrcAtTime(src, videoTime) : src;
        const media = clip.kind === 'video'
            ? `<video src="${escapeHtml(mediaSrc)}" muted playsinline preload="metadata" data-timeline-preview-video></video>`
            : `<img src="${escapeHtml(mediaSrc)}" alt="" draggable="false">`;
        const selected = clip.id && clip.id === node?.params?.selected_clip_id;
        return `<div class="sai-timeline-preview-layer ${active ? 'is-active' : ''} ${selected ? 'is-selected' : ''} ${maskSrc ? 'has-mask' : ''}" data-preview-clip="${escapeHtml(clip.id)}" data-preview-start="${escapeHtml(Number(clip.start || 0))}" data-preview-duration="${escapeHtml(Number(clip.duration || 0))}" style="${style}">${media}<div class="sai-timeline-transform-frame"></div><button type="button" data-preview-transform="scale" title="${escapeHtml(t('Scale', '缩放'))}"></button><button type="button" data-preview-transform="rotate" title="${escapeHtml(t('Rotate', '旋转'))}"></button><div class="sai-timeline-crop-box" style="${cropBoxStyle}"><button type="button" data-preview-crop="left" title="${escapeHtml(t('Crop left', '裁剪左侧'))}"></button><button type="button" data-preview-crop="right" title="${escapeHtml(t('Crop right', '裁剪右侧'))}"></button><button type="button" data-preview-crop="top" title="${escapeHtml(t('Crop top', '裁剪顶部'))}"></button><button type="button" data-preview-crop="bottom" title="${escapeHtml(t('Crop bottom', '裁剪底部'))}"></button></div></div>`;
    }

    function renderPenOverlay(clip) {
        const pendingPoints = Array.isArray(clip?.mask?.pending_pen?.points) ? clip.mask.pending_pen.points : [];
        const strokes = Array.isArray(clip?.mask?.strokes) ? clip.mask.strokes : [];
        const allShapes = [];
        const allAnchors = [];
        const appendPath = (points, sourceKind, sourceIndex) => {
            if (!Array.isArray(points) || !points.length) return;
            const polyline = points
                .map(point => `${clamp(Number(point.x || 0), 0, 1) * 100},${clamp(Number(point.y || 0), 0, 1) * 100}`)
                .join(' ');
            const isClosedPath = sourceKind === 'stroke';
            allShapes.push(isClosedPath
                ? `<polygon points="${escapeHtml(polyline)}"></polygon>`
                : `<polyline points="${escapeHtml(polyline)}"></polyline>`);
            points.forEach((point, index) => {
                const x = clamp(Number(point.x || 0), 0, 1) * 100;
                const y = clamp(Number(point.y || 0), 0, 1) * 100;
                const isFirst = index === 0;
                const isLast = index === points.length - 1;
                const ref = sourceKind === 'pending' ? `pending:${index}` : `${sourceIndex}:${index}`;
                const closeTarget = !isClosedPath && isFirst && points.length >= 3;
                const title = closeTarget ? t('Close mask path', '闭合遮罩路径') : (isClosedPath ? t('Drag mask point', '拖动遮罩点') : t('Drag pen point', '拖动钢笔点'));
                allAnchors.push(`<button type="button" class="sai-timeline-pen-anchor ${isFirst ? 'is-first' : ''} ${isLast ? 'is-last' : ''} ${closeTarget ? 'is-close-target' : ''}" data-timeline-pen-anchor="${escapeHtml(ref)}" style="left:${escapeHtml(x.toFixed(3))}%;top:${escapeHtml(y.toFixed(3))}%" title="${escapeHtml(title)}"></button>`);
            });
        };
        strokes.forEach((stroke, index) => {
            if (stroke?.kind === 'pen' || stroke?.closed === true) appendPath(stroke.points, 'stroke', index);
        });
        appendPath(pendingPoints, 'pending', -1);
        if (allShapes.length || allAnchors.length) {
            return `<div class="sai-timeline-pen-overlay ${pendingPoints.length ? '' : 'is-closed'}" aria-hidden="false"><svg class="sai-timeline-pen-preview" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${allShapes.join('')}</svg>${allAnchors.join('')}</div>`;
        }
        const closedIndex = (() => {
            for (let index = strokes.length - 1; index >= 0; index -= 1) {
                const stroke = strokes[index];
                if ((stroke?.kind === 'pen' || stroke?.closed === true) && Array.isArray(stroke.points) && stroke.points.length) return index;
            }
            return -1;
        })();
        const sourceKind = pendingPoints.length ? 'pending' : (closedIndex >= 0 ? 'stroke' : '');
        const points = sourceKind === 'pending' ? pendingPoints : (closedIndex >= 0 ? strokes[closedIndex].points : []);
        if (!points.length) return '';
        const polyline = points
            .map(point => `${clamp(Number(point.x || 0), 0, 1) * 100},${clamp(Number(point.y || 0), 0, 1) * 100}`)
            .join(' ');
        const isClosed = sourceKind === 'stroke';
        const shape = isClosed
            ? `<polygon points="${escapeHtml(polyline)}"></polygon>`
            : `<polyline points="${escapeHtml(polyline)}"></polyline>`;
        const anchors = points.map((point, index) => {
            const x = clamp(Number(point.x || 0), 0, 1) * 100;
            const y = clamp(Number(point.y || 0), 0, 1) * 100;
            const isFirst = index === 0;
            const isLast = index === points.length - 1;
            const ref = sourceKind === 'pending' ? `pending:${index}` : `${closedIndex}:${index}`;
            const closeTarget = !isClosed && isFirst && points.length >= 3;
            const title = closeTarget ? t('Close mask path', '闭合遮罩路径') : (isClosed ? t('Drag mask point', '拖动遮罩点') : t('Drag pen point', '拖动钢笔点'));
            return `<button type="button" class="sai-timeline-pen-anchor ${isFirst ? 'is-first' : ''} ${isLast ? 'is-last' : ''} ${closeTarget ? 'is-close-target' : ''}" data-timeline-pen-anchor="${escapeHtml(ref)}" style="left:${escapeHtml(x.toFixed(3))}%;top:${escapeHtml(y.toFixed(3))}%" title="${escapeHtml(title)}"></button>`;
        }).join('');
        return `<div class="sai-timeline-pen-overlay ${isClosed ? 'is-closed' : ''}" aria-hidden="false"><svg class="sai-timeline-pen-preview" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${shape}</svg>${anchors}</div>`;
    }

    function renderPreview(node, context) {
        const params = normalizeParams(node?.params);
        const visuals = (node.clips || [])
            .filter(clip => clip.kind !== 'audio')
            .sort((a, b) => node.tracks.findIndex(track => track.id === a.track_id) - node.tracks.findIndex(track => track.id === b.track_id));
        const hasActiveVisual = visuals.some(clip => clipAtPlayhead(clip, params.playhead));
        const audioCount = (node.clips || []).filter(clip => clip.kind === 'audio' && clipAtPlayhead(clip, params.playhead)).length;
        const tool = ['transform', 'crop', 'mask'].includes(params.preview_tool) ? params.preview_tool : 'transform';
        const aspectValue = Math.max(0.05, Number(params.width || 16) / Math.max(1, Number(params.height || 9)));
        const snapActive = params.snap_enabled !== false;
        const guidesActive = params.guides_enabled !== false;
        const resetTitle = tool === 'crop' ? t('Reset crop', '重置裁剪') : (tool === 'mask' ? t('Reset mask', '重置遮罩') : t('Reset transform', '重置变换'));
        const selectedClip = visuals.find(clip => clip.id === params.selected_clip_id && clipAtPlayhead(clip, params.playhead));
        const selectedMask = clipMaskDataUrl(selectedClip);
        const maskedVisuals = visuals.filter(clip => clipAtPlayhead(clip, params.playhead) && clipMaskDataUrl(clip));
        const maskFeather = clamp(Number(params.mask_feather || 0), 0, 120);
        const maskOverlay = tool === 'mask' && selectedMask
            ? `<div class="sai-timeline-mask-preview" style="--timeline-mask-image:url(&quot;${escapeHtml(selectedMask)}&quot;)" aria-hidden="true"></div>`
            : '';
        const maskCutouts = maskedVisuals.map((clip) => {
            const maskSrc = clipMaskDataUrl(clip);
            return `<div class="sai-timeline-mask-cutout" data-mask-cutout-clip="${escapeHtml(clip.id)}" style="--timeline-mask-image:url(&quot;${escapeHtml(maskSrc)}&quot;);z-index:${previewLayerZIndex(node, clip)}" aria-hidden="true">${renderPreviewLayer(node, clip, context, params.playhead)}</div>`;
        }).join('');
        const penOverlay = tool === 'mask' ? renderPenOverlay(selectedClip) : '';
        return `<div class="sai-timeline-preview-wrap">
  <div class="sai-timeline-preview-toolbar">
    <button type="button" data-node-action="timeline-preview-play" title="${escapeHtml(params.preview_playing ? t('Pause', '暂停') : t('Play', '播放'))}"><i class="fa-solid ${params.preview_playing ? 'fa-pause' : 'fa-play'}"></i></button>
    <button type="button" data-node-action="timeline-preview-play-full" title="${escapeHtml(t('Play from start', '从开头播放'))}"><i class="fa-solid fa-backward-step"></i></button>
    <button type="button" data-timeline-tool="transform" class="${tool === 'transform' ? 'is-active' : ''}">${escapeHtml(t('Transform', '变换'))}</button>
    <button type="button" data-timeline-tool="crop" class="${tool === 'crop' ? 'is-active' : ''}">${escapeHtml(t('Crop', '裁剪'))}</button>
    <button type="button" data-timeline-tool="mask" class="${tool === 'mask' ? 'is-active' : ''}" title="${escapeHtml(t('Draw alpha mask; hold Alt to erase', '绘制透明遮罩；按住 Alt 擦除'))}">${escapeHtml(t('Mask', '遮罩'))}</button>
    ${tool === 'mask' ? `<label class="sai-timeline-feather-control"><i class="fa-solid fa-pen-nib"></i><span>${escapeHtml(t('Feather', '羽化'))}</span><input data-timeline-param="mask_feather" type="range" min="0" max="120" step="1" value="${escapeHtml(maskFeather)}"><b>${escapeHtml(String(Math.round(maskFeather)))}</b></label>` : ''}
    <button type="button" data-node-action="timeline-reset-active-tool" title="${escapeHtml(resetTitle)}"><i class="fa-solid fa-rotate-left"></i></button>
    <button type="button" data-timeline-toggle-param="snap_enabled" class="${snapActive ? 'is-active' : ''}" title="${escapeHtml(snapActive ? t('Disable snapping', '关闭吸附') : t('Enable snapping', '开启吸附'))}"><i class="fa-solid fa-magnet"></i></button>
    <button type="button" data-timeline-toggle-param="guides_enabled" class="${guidesActive ? 'is-active' : ''}" title="${escapeHtml(guidesActive ? t('Hide preview guides', '隐藏预览参考线') : t('Show preview guides', '显示预览参考线'))}"><i class="fa-solid fa-table-cells"></i></button>
    <button type="button" data-node-action="timeline-duration-playhead" title="${escapeHtml(t('Set duration to playhead', '将时长设为播放头'))}"><i class="fa-solid fa-scissors"></i></button>
    <button type="button" data-node-action="timeline-duration-content" title="${escapeHtml(t('Set duration to last clip', '将时长设为最后素材'))}"><i class="fa-solid fa-compress"></i></button>
  </div>
  <div class="sai-timeline-preview-stage ${hasActiveVisual ? 'has-active' : ''} ${guidesActive ? 'show-guides' : ''} ${maskedVisuals.length ? 'has-mask-cutout' : ''}" data-timeline-tool-state="${escapeHtml(tool)}" style="--timeline-aspect:${params.width}/${params.height};--timeline-aspect-value:${aspectValue};background:${escapeHtml(params.background || '#000000')}">
    ${visuals.map(clip => renderPreviewLayer(node, clip, context, params.playhead)).join('')}
    ${maskCutouts}
    ${maskOverlay}
    ${penOverlay}
    <div class="sai-timeline-preview-guides" aria-hidden="true"></div>
    <div class="sai-timeline-preview-empty sai-timeline-preview-no-active">${escapeHtml(t('No visual clip at playhead', '播放头处没有可视素材'))}</div>
    ${audioCount ? `<div class="sai-timeline-preview-audio"><i class="fa-solid fa-wave-square"></i><span>${escapeHtml(t('{count} audio active', '{count} 条音频激活').replace('{count}', audioCount))}</span></div>` : ''}
  </div>
</div>`;
    }

    function renderInlineClipEditor(node) {
        const clip = (node.clips || []).find(item => item.id === node.params.selected_clip_id);
        if (!clip) return `<div class="sai-timeline-inline-editor"><span>${escapeHtml(t('Select a clip to edit.', '选择一个剪辑进行编辑。'))}</span></div>`;
        const keyframeCount = Array.isArray(clip.keyframes) ? clip.keyframes.length : 0;
        const playhead = Number(node.params?.playhead || 0);
        const atKeyframe = clipKeyframeAtPlayhead(clip, playhead);
        const keyframeNavDisabled = keyframeCount ? '' : 'disabled';
        const effectiveClip = clipAtTime(clip, playhead);
        return `<div class="sai-timeline-inline-editor">
  <div class="sai-timeline-inline-head"><b>${escapeHtml(clip.title || t('Clip', '剪辑'))}</b><small>${escapeHtml(clip.kind)}</small></div>
  <label><span>${escapeHtml(t('Start', '开始'))}<button type="button" class="sai-param-reset" data-timeline-clip-reset="${escapeHtml(clip.id)}:start" title="${escapeHtml(t('Reset start', '重置开始'))}"><i class="fa-solid fa-rotate-left"></i></button></span><input data-timeline-clip-param="${escapeHtml(clip.id)}:start" type="range" min="0" max="${escapeHtml(node.params.duration)}" step="0.05" value="${escapeHtml(clip.start)}"><b>${escapeHtml(formatDuration(clip.start))}</b></label>
  <label><span>${escapeHtml(t('Duration', '时长'))}<button type="button" class="sai-param-reset" data-timeline-clip-reset="${escapeHtml(clip.id)}:duration" title="${escapeHtml(t('Reset duration', '重置时长'))}"><i class="fa-solid fa-rotate-left"></i></button></span><input data-timeline-clip-param="${escapeHtml(clip.id)}:duration" type="range" min="0.05" max="${escapeHtml(Math.max(node.params.duration, clip.duration))}" step="0.05" value="${escapeHtml(clip.duration)}"><b>${escapeHtml(formatDuration(clip.duration))}</b></label>
  ${clip.kind !== 'audio' ? `<div class="sai-timeline-keyframe-row"><span><i class="fa-solid fa-diamond"></i>${escapeHtml(String(keyframeCount))}</span><div class="sai-timeline-keyframe-nav"><button type="button" data-node-action="timeline-keyframe-prev" ${keyframeNavDisabled} title="${escapeHtml(t('Previous keyframe', '上一个关键帧'))}"><i class="fa-solid fa-backward-step"></i></button><button type="button" data-node-action="timeline-keyframe-next" ${keyframeNavDisabled} title="${escapeHtml(t('Next keyframe', '下一个关键帧'))}"><i class="fa-solid fa-forward-step"></i></button></div><div class="sai-timeline-keyframe-actions"><button type="button" data-node-action="timeline-keyframe-toggle">${escapeHtml(atKeyframe ? t('Update Key Frame', '更新关键帧') : t('Add Key Frame', '添加关键帧'))}</button><button type="button" data-node-action="timeline-keyframe-delete" ${atKeyframe ? '' : 'disabled'} title="${escapeHtml(t('Delete keyframe', '删除关键帧'))}"><i class="fa-solid fa-trash"></i></button></div></div>
  <label><span>${escapeHtml(t('Scale', '缩放'))}<button type="button" class="sai-param-reset" data-timeline-clip-reset="${escapeHtml(clip.id)}:scale" title="${escapeHtml(t('Reset scale', '重置缩放'))}"><i class="fa-solid fa-rotate-left"></i></button></span><input data-timeline-clip-param="${escapeHtml(clip.id)}:scale" type="range" min="0.1" max="3" step="0.01" value="${escapeHtml(effectiveClip.scale ?? 1)}"><b>${escapeHtml(Number(effectiveClip.scale ?? 1).toFixed(2))}</b></label>
  <label><span>${escapeHtml(t('Opacity', '不透明度'))}<button type="button" class="sai-param-reset" data-timeline-clip-reset="${escapeHtml(clip.id)}:opacity" title="${escapeHtml(t('Reset opacity', '重置不透明度'))}"><i class="fa-solid fa-rotate-left"></i></button></span><input data-timeline-clip-param="${escapeHtml(clip.id)}:opacity" type="range" min="0" max="1" step="0.01" value="${escapeHtml(effectiveClip.opacity ?? 1)}"><b>${escapeHtml(Math.round(Number(effectiveClip.opacity ?? 1) * 100))}%</b></label>` : `<label><span>${escapeHtml(t('Volume', '音量'))}<button type="button" class="sai-param-reset" data-timeline-clip-reset="${escapeHtml(clip.id)}:volume" title="${escapeHtml(t('Reset volume', '重置音量'))}"><i class="fa-solid fa-rotate-left"></i></button></span><input data-timeline-clip-param="${escapeHtml(clip.id)}:volume" type="range" min="0" max="2" step="0.01" value="${escapeHtml(clip.volume ?? 1)}"><b>${escapeHtml(Math.round(Number(clip.volume ?? 1) * 100))}%</b></label>`}
</div>`;
    }

    function renderProjectControls(params) {
        const sizeValue = SIZE_PRESETS.some(item => item[0] === params.size_preset) ? params.size_preset : 'custom';
        const fpsValue = FPS_PRESETS.includes(String(params.fps_preset)) ? String(params.fps_preset) : 'custom';
        const sizeLabel = SIZE_PRESETS.find(item => item[0] === sizeValue)?.[1] || 'Custom';
        const fpsLabel = fpsValue === 'custom' ? 'Custom' : fpsValue;
        const customSelect = (key, label, value, display, options) => `<label class="sai-timeline-custom-select-label"><span>${escapeHtml(label)}<button type="button" class="sai-param-reset" data-timeline-reset="${escapeHtml(key)}" title="${escapeHtml(t('Reset {label}', '重置{label}').replace('{label}', label))}"><i class="fa-solid fa-rotate-left"></i></button></span><div class="sai-timeline-custom-select" data-timeline-select="${escapeHtml(key)}"><button type="button" data-timeline-select-button><span>${escapeHtml(tOption(display, { Custom: '自定义' }))}</span><i class="fa-solid fa-chevron-down"></i></button><div class="sai-timeline-select-menu">${options.map(item => {
            const optionValue = Array.isArray(item) ? item[0] : item;
            const optionLabel = Array.isArray(item) ? item[1] : (item === 'custom' ? 'Custom' : item);
            return `<button type="button" class="${String(optionValue) === String(value) ? 'is-active' : ''}" data-timeline-select-option="${escapeHtml(optionValue)}">${escapeHtml(tOption(optionLabel, { Custom: '自定义' }))}</button>`;
        }).join('')}</div></div></label>`;
        return `<div class="sai-timeline-settings">
  ${customSelect('size_preset', t('Size', '尺寸'), sizeValue, sizeLabel, SIZE_PRESETS)}
  <button type="button" class="sai-timeline-tool-button" data-node-action="timeline-swap-size" title="${escapeHtml(t('Swap timeline orientation', '交换横竖屏'))}"><i class="fa-solid fa-rotate"></i><span>${escapeHtml(t('Swap orientation', '横竖互换'))}</span></button>
  ${sizeValue === 'custom' ? `<label><span>${escapeHtml(t('Width', '宽度'))}<button type="button" class="sai-param-reset" data-timeline-reset="width" title="${escapeHtml(t('Reset width', '重置宽度'))}"><i class="fa-solid fa-rotate-left"></i></button></span><input data-timeline-param="width" type="number" min="16" step="8" value="${escapeHtml(params.width)}"></label><label><span>${escapeHtml(t('Height', '高度'))}<button type="button" class="sai-param-reset" data-timeline-reset="height" title="${escapeHtml(t('Reset height', '重置高度'))}"><i class="fa-solid fa-rotate-left"></i></button></span><input data-timeline-param="height" type="number" min="16" step="8" value="${escapeHtml(params.height)}"></label>` : ''}
  ${customSelect('fps_preset', 'FPS', fpsValue, fpsLabel, FPS_PRESETS)}
  ${fpsValue === 'custom' ? `<label><span>${escapeHtml(t('Custom FPS', '自定义 FPS'))}<button type="button" class="sai-param-reset" data-timeline-reset="fps" title="${escapeHtml(t('Reset FPS', '重置 FPS'))}"><i class="fa-solid fa-rotate-left"></i></button></span><input data-timeline-param="fps" type="number" min="1" max="120" step="1" value="${escapeHtml(params.fps)}"></label>` : ''}
  <label><span>${escapeHtml(t('Duration', '时长'))}<button type="button" class="sai-param-reset" data-timeline-reset="duration" title="${escapeHtml(t('Reset duration', '重置时长'))}"><i class="fa-solid fa-rotate-left"></i></button></span><input data-timeline-param="duration" type="number" min="1" step="0.1" value="${escapeHtml(params.duration)}"></label>
</div>`;
    }

    function renderNodeHtml(node, context) {
        normalizeNode(node);
        const params = node.params;
        return `<div class="sai-node-head">
  <span class="sai-node-kind">${escapeHtml(t('Timeline', '时间线'))}</span>
  <span class="sai-node-title">${escapeHtml(node.title || t('Media Timeline', '媒体时间线'))}</span>
  ${call(context, 'renderNodeStateBadges', '', node)}
  <button type="button" data-node-action="timeline-add-selected" title="${escapeHtml(t('Add selected media', '添加选中媒体'))}"><i class="fa-solid fa-plus"></i></button>
  <button type="button" data-node-action="timeline-render-result" title="${escapeHtml(t('Render current frame to Result', '将当前帧渲染为结果'))}"><i class="fa-solid fa-circle-dot"></i></button>
  <button type="button" data-node-action="delete" title="${escapeHtml(t('Delete', '删除'))}"><i class="fa-solid fa-xmark"></i></button>
</div>
<div class="sai-timeline-input-row">
  <button type="button" class="sai-node-handle sai-node-handle-in" data-timeline-media-in title="${escapeHtml(t('Connect media to add a clip', '连接媒体以添加剪辑'))}"></button>
  <i class="fa-solid fa-clapperboard"></i><span>${escapeHtml(t('Media Input', '媒体输入'))}</span><b>${escapeHtml(t('{count} clips', '{count} 个剪辑').replace('{count}', node.clips.length))}</b><small>${escapeHtml(t('Drag connect', '拖拽连接'))}</small>
</div>
${renderProjectControls(params)}
${renderPreview(node, context)}
${renderInlineClipEditor(node)}
${renderRuler(node)}
<div class="sai-timeline-tracks">${node.tracks.map(track => renderTrack(node, track, context)).join('')}</div>
<button type="button" class="sai-node-handle sai-node-handle-out" data-handle-out="timeline" title="${escapeHtml(t('Timeline output', '时间线输出'))}"></button>`;
    }

    function renderClipInspector(node, clip) {
        const keyframes = normalizeKeyframes(clip);
        const effectiveClip = clipAtTime(clip, Number(node?.params?.playhead || 0));
        const keyframeList = keyframes.length
            ? `<div class="sai-timeline-keyframe-list">${keyframes.map(frame => `<button type="button" data-inspector-action="timeline-keyframe-jump" data-timeline-keyframe-time="${escapeHtml(String(frame.time))}" data-timeline-keyframe-clip="${escapeHtml(clip.id)}">${escapeHtml(formatDuration(frame.time))}</button>`).join('')}</div>`
            : `<p>${escapeHtml(t('No keyframes.', '暂无关键帧。'))}</p>`;
        return `<div class="sai-timeline-clip-inspector">
  <h4>${escapeHtml(clip.title || clip.id)}</h4>
  <div class="sai-inspector-grid2">
    <label><span>${escapeHtml(t('Start', '开始'))}</span><input data-timeline-clip-param="${escapeHtml(clip.id)}:start" type="number" min="0" step="0.05" value="${escapeHtml(clip.start)}"></label>
    <label><span>${escapeHtml(t('Duration', '时长'))}</span><input data-timeline-clip-param="${escapeHtml(clip.id)}:duration" type="number" min="0.05" step="0.05" value="${escapeHtml(clip.duration)}"></label>
  </div>
  ${clip.kind !== 'audio' ? `<div class="sai-inspector-actions sai-timeline-keyframe-actions"><button type="button" data-inspector-action="timeline-keyframe-prev" ${keyframes.length ? '' : 'disabled'}><i class="fa-solid fa-backward-step"></i><span>${escapeHtml(t('Prev', '上一个'))}</span></button><button type="button" data-inspector-action="timeline-keyframe-next" ${keyframes.length ? '' : 'disabled'}><i class="fa-solid fa-forward-step"></i><span>${escapeHtml(t('Next', '下一个'))}</span></button><button type="button" data-inspector-action="timeline-keyframe-toggle"><i class="fa-solid fa-diamond"></i><span>${escapeHtml(t('Add / update all transform', '添加 / 更新所有变换'))}</span></button><button type="button" data-inspector-action="timeline-keyframe-delete"><i class="fa-solid fa-trash"></i><span>${escapeHtml(t('Delete at playhead', '删除播放头关键帧'))}</span></button></div>
  ${keyframeList}
  <div class="sai-inspector-grid2">
    <label><span>${escapeHtml(t('Scale', '缩放'))}</span><input data-timeline-clip-param="${escapeHtml(clip.id)}:scale" type="number" min="0.05" step="0.05" value="${escapeHtml(effectiveClip.scale ?? 1)}"></label>
    <label><span>${escapeHtml(t('Opacity', '不透明度'))}</span><input data-timeline-clip-param="${escapeHtml(clip.id)}:opacity" type="number" min="0" max="1" step="0.05" value="${escapeHtml(effectiveClip.opacity ?? 1)}"></label>
    <label><span>X</span><input data-timeline-clip-param="${escapeHtml(clip.id)}:x" type="number" min="-200" max="200" step="1" value="${escapeHtml(effectiveClip.x ?? 0)}"></label>
    <label><span>Y</span><input data-timeline-clip-param="${escapeHtml(clip.id)}:y" type="number" min="-200" max="200" step="1" value="${escapeHtml(effectiveClip.y ?? 0)}"></label>
    <label><span>${escapeHtml(t('Rotate', '旋转'))}</span><input data-timeline-clip-param="${escapeHtml(clip.id)}:rotate" type="number" min="-360" max="360" step="1" value="${escapeHtml(effectiveClip.rotate ?? 0)}"></label>
    <label><span>${escapeHtml(t('Crop L', '裁剪左'))}</span><input data-timeline-clip-param="${escapeHtml(clip.id)}:crop_left" type="number" min="0" max="95" step="1" value="${escapeHtml(clip.crop_left ?? 0)}"></label>
    <label><span>${escapeHtml(t('Crop R', '裁剪右'))}</span><input data-timeline-clip-param="${escapeHtml(clip.id)}:crop_right" type="number" min="0" max="95" step="1" value="${escapeHtml(clip.crop_right ?? 0)}"></label>
    <label><span>${escapeHtml(t('Crop T', '裁剪上'))}</span><input data-timeline-clip-param="${escapeHtml(clip.id)}:crop_top" type="number" min="0" max="95" step="1" value="${escapeHtml(clip.crop_top ?? 0)}"></label>
    <label><span>${escapeHtml(t('Crop B', '裁剪下'))}</span><input data-timeline-clip-param="${escapeHtml(clip.id)}:crop_bottom" type="number" min="0" max="95" step="1" value="${escapeHtml(clip.crop_bottom ?? 0)}"></label>
  </div>` : `<label><span>${escapeHtml(t('Volume', '音量'))}</span><input data-timeline-clip-param="${escapeHtml(clip.id)}:volume" type="number" min="0" max="2" step="0.05" value="${escapeHtml(clip.volume ?? 1)}"></label>`}
</div>`;
    }

    function renderInspector(node, context) {
        normalizeNode(node);
        const params = node.params;
        return `<div class="sai-inspector-section">
  <h3>${escapeHtml(t('Media Timeline', '媒体时间线'))}</h3>
  <label>${escapeHtml(t('Title', '标题'))}<input data-inspector-node-field="title" value="${escapeHtml(node.title || '')}"></label>
  <div class="sai-inspector-grid2">
    <label><span>${escapeHtml(t('Width', '宽度'))}</span><input data-timeline-param="width" type="number" min="16" step="8" value="${escapeHtml(params.width)}"></label>
    <label><span>${escapeHtml(t('Height', '高度'))}</span><input data-timeline-param="height" type="number" min="16" step="8" value="${escapeHtml(params.height)}"></label>
    <label><span>FPS</span><input data-timeline-param="fps" type="number" min="1" max="120" step="1" value="${escapeHtml(params.fps)}"></label>
    <label><span>${escapeHtml(t('Duration', '时长'))}</span><input data-timeline-param="duration" type="number" min="1" step="0.1" value="${escapeHtml(params.duration)}"></label>
  </div>
  <label><span>${escapeHtml(t('Background', '背景'))}</span><input data-timeline-param="background" type="color" value="${escapeHtml(params.background || '#000000')}"></label>
  <p>${escapeHtml(t('Connect Image / Video / Audio / Result nodes to build a composite timeline. Rendering will hand this JSON to a backend compositor.', '连接图像 / 视频 / 音频 / 结果节点来构建合成时间线，渲染时会把 JSON 交给后端合成器。'))}</p>
</div>
<div class="sai-inspector-actions">
  <button type="button" data-inspector-action="timeline-add-selected"><i class="fa-solid fa-plus"></i><span>${escapeHtml(t('Add selected media', '添加选中媒体'))}</span></button>
  <button type="button" data-inspector-action="timeline-render-result"><i class="fa-solid fa-circle-dot"></i><span>${escapeHtml(t('To Result', '输出到结果'))}</span></button>
  <button type="button" data-inspector-action="duplicate"><i class="fa-solid fa-copy"></i><span>${escapeHtml(t('Duplicate', '复制'))}</span></button>
  <button type="button" data-inspector-action="delete" class="danger"><i class="fa-solid fa-trash"></i><span>${escapeHtml(t('Delete', '删除'))}</span></button>
</div>
<div class="sai-inspector-section">
  <h3>${escapeHtml(t('Clips', '剪辑'))}</h3>
  ${node.clips.length ? node.clips.map(clip => renderClipInspector(node, clip)).join('') : `<p>${escapeHtml(t('No clips yet.', '暂无剪辑。'))}</p>`}
</div>`;
    }

    function serializeTimeline(node, context) {
        normalizeNode(node);
        return {
            schema: 'simpai.timeline.v1',
            title: node.title || 'Media Timeline',
            params: Object.assign({}, node.params),
            tracks: node.tracks.map(track => Object.assign({}, track)),
            clips: node.clips.map(clip => {
                const source = clipSource(node, clip, context);
                const asset = sourceAsset(source, context);
                return Object.assign({}, clip, {
                    source_title: source?.title || '',
                    asset: typeof ASSETS.serializeAssetForRun === 'function' ? ASSETS.serializeAssetForRun(asset || {}) : Object.assign({}, asset || {})
                });
            })
        };
    }

    function serializeTimelineRenderPayload(node, context) {
        normalizeNode(node);
        const timeline = serializeTimeline(node, context);
        const trackOrder = new Map(timeline.tracks.map((track, index) => [track.id, index]));
        const layers = timeline.clips
            .filter(clip => clip.kind !== 'audio')
            .map((clip) => {
                const trackIndex = trackOrder.has(clip.track_id) ? trackOrder.get(clip.track_id) : timeline.tracks.length;
                const sameTrackIndex = timeline.clips.filter(item => item.kind !== 'audio' && item.track_id === clip.track_id).findIndex(item => item.id === clip.id);
                const playhead = Number(timeline.params?.playhead || 0);
                const effectiveClip = clipAtTime(clip, playhead);
                const asset = clip.asset || {};
                const offset = timelineClipLayerOffset(timeline.params, clip.asset || {}, effectiveClip);
                const keyframes = normalizeKeyframes(clip);
                return {
                    clip_id: clip.id,
                    track_id: clip.track_id,
                    source_node_id: clip.source_node_id,
                    kind: clip.kind,
                    z_index: Math.max(1, (timeline.tracks.length - trackIndex) * 100 + Math.max(0, sameTrackIndex)),
                    timing: {
                        start: Number(clip.start || 0),
                        duration: Number(clip.duration || 0),
                        in: effectiveClipIn(clip, asset),
                        out: Math.max(effectiveClipIn(clip, asset), Number(clip.out || effectiveClipIn(clip, asset) + Number(clip.duration || 0)))
                    },
                    transform: {
                        x_percent: offset.x,
                        y_percent: offset.y,
                        scale: Number(effectiveClip.scale || 1),
                        rotate_degrees: Number(effectiveClip.rotate || 0),
                        fit: clip.fit || 'contain',
                        opacity: clamp(Number(effectiveClip.opacity ?? 1), 0, 1),
                        geometry_pixels: {
                            left: offset.left,
                            top: offset.top,
                            width: offset.width,
                            height: offset.height
                        }
                    },
                    keyframes,
                    crop_percent: {
                        left: clamp(Number(clip.crop_left || 0), 0, 95),
                        right: clamp(Number(clip.crop_right || 0), 0, 95),
                        top: clamp(Number(clip.crop_top || 0), 0, 95),
                        bottom: clamp(Number(clip.crop_bottom || 0), 0, 95)
                    },
                    mask: clipMaskPayload(clip),
                    asset: clip.asset || {}
                };
            })
            .sort((a, b) => a.z_index - b.z_index);
        const audio = timeline.clips
            .filter(clip => clip.kind === 'audio')
            .map(clip => ({
                clip_id: clip.id,
                track_id: clip.track_id,
                source_node_id: clip.source_node_id,
                timing: {
                    start: Number(clip.start || 0),
                    duration: Number(clip.duration || 0),
                    in: effectiveClipIn(clip, clip.asset || {}),
                    out: Math.max(effectiveClipIn(clip, clip.asset || {}), Number(clip.out || effectiveClipIn(clip, clip.asset || {}) + Number(clip.duration || 0)))
                },
                volume: clamp(Number(clip.volume ?? 1), 0, 2),
                asset: clip.asset || {}
            }));
        return {
            schema: 'simpai.timeline.render_payload.v1',
            title: timeline.title,
            canvas: {
                width: Number(timeline.params.width || DEFAULT_PARAMS.width),
                height: Number(timeline.params.height || DEFAULT_PARAMS.height),
                fps: Number(timeline.params.fps || DEFAULT_PARAMS.fps),
                duration: Number(timeline.params.duration || DEFAULT_PARAMS.duration),
                background: timeline.params.background || '#000000'
            },
            tracks: timeline.tracks,
            layers,
            audio,
            source_timeline: timeline
        };
    }

    window.SimpAICanvasWorkbenchMediaTimeline = {
        DEFAULT_PARAMS,
        DEFAULT_TRACKS,
        SIZE_PRESETS,
        FPS_PRESETS,
        normalizeNode,
        normalizeParams,
        timelineDuration,
        buildTrackClipLayout,
        applyKeyframeEasing,
        nextStartForTrack,
        isTimelineSource,
        sourceAsset,
        assetMediaKind,
        defaultTrackId,
        createClipFromSource,
        renderNodeHtml,
        renderInspector,
        serializeTimeline,
        serializeTimelineRenderPayload,
        clipMaskDataUrl,
        clipMaskPayload,
        renderPenOverlay,
        normalizeKeyframes,
        clipAtTime,
        effectiveClipIn,
        KEYFRAME_PROPS
    };
})();
