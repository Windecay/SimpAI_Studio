(function () {
    'use strict';

    const UTILS = window.SimpAICanvasWorkbenchUtils || {};
    const ASSETS = window.SimpAICanvasWorkbenchAssetNodes || {};
    const escapeHtml = UTILS.escapeHtml || ((value) => String(value ?? ''));
    const t = UTILS.t || ((en, cn) => cn || en);
    const uid = UTILS.uid || ((prefix) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 8)}`);

    const SCHEMA = 'simpai.director_timeline.v1';
    const MAX_IMAGE_REFS = 5;
    const MAX_AUDIO_REFS = 5;
    const MAX_VIDEO_REFS = 5;
    const PREVIOUS_SEGMENT_VIDEO_REF = 'previous_segment';
    const PREVIOUS_SEGMENT_IMAGE_REF = 'previous_segment_last_frame';
    const IMAGE_REF_PARAM_KEYS = ['image_ref_1', 'image_ref_2', 'image_ref_3', 'image_ref_4', 'image_ref_5'];
    const VIDEO_REF_PARAM_KEYS = ['video_ref'];
    const MEDIA_SLOT_SPECS = [
        { key: 'image_1', kind: 'image', label: t('Image 1', '图片 1'), icon: 'fa-image' },
        { key: 'image_2', kind: 'image', label: t('Image 2', '图片 2'), icon: 'fa-image' },
        { key: 'image_3', kind: 'image', label: t('Image 3', '图片 3'), icon: 'fa-image' },
        { key: 'image_4', kind: 'image', label: t('Image 4', '图片 4'), icon: 'fa-image' },
        { key: 'image_5', kind: 'image', label: t('Image 5', '图片 5'), icon: 'fa-image' },
        { key: 'audio_1', kind: 'audio', label: t('Audio 1', '音频 1'), icon: 'fa-wave-square' },
        { key: 'audio_2', kind: 'audio', label: t('Audio 2', '音频 2'), icon: 'fa-wave-square' },
        { key: 'audio_3', kind: 'audio', label: t('Audio 3', '音频 3'), icon: 'fa-wave-square' },
        { key: 'audio_4', kind: 'audio', label: t('Audio 4', '音频 4'), icon: 'fa-wave-square' },
        { key: 'audio_5', kind: 'audio', label: t('Audio 5', '音频 5'), icon: 'fa-wave-square' },
        { key: 'video_1', kind: 'video', label: t('Video 1', '视频 1'), icon: 'fa-film' },
        { key: 'video_2', kind: 'video', label: t('Video 2', '视频 2'), icon: 'fa-film' },
        { key: 'video_3', kind: 'video', label: t('Video 3', '视频 3'), icon: 'fa-film' },
        { key: 'video_4', kind: 'video', label: t('Video 4', '视频 4'), icon: 'fa-film' },
        { key: 'video_5', kind: 'video', label: t('Video 5', '视频 5'), icon: 'fa-film' }
    ];
    const MEDIA_KIND_GROUPS = [
        { kind: 'image', label: t('Images', '图片'), portLabel: t('Image pool', '图片素材池'), icon: 'fa-image' },
        { kind: 'audio', label: t('Audio', '音频'), portLabel: t('Audio pool', '音频素材池'), icon: 'fa-wave-square' },
        { kind: 'video', label: t('Video', '视频'), portLabel: t('Video pool', '视频素材池'), icon: 'fa-film' }
    ];
    const IMAGE_REFS = [['', t('None', '无')]].concat(MEDIA_SLOT_SPECS.filter(item => item.kind === 'image').map(item => [item.key, item.label]));
    const AUDIO_REFS = [['', t('None', '无')]].concat(MEDIA_SLOT_SPECS.filter(item => item.kind === 'audio').map(item => [item.key, item.label]));
    const VIDEO_REFS = [['', t('None', '无')]]
        .concat(MEDIA_SLOT_SPECS.filter(item => item.kind === 'video').map(item => [item.key, item.label]))
        .concat([[PREVIOUS_SEGMENT_VIDEO_REF, t('Previous shot result', '上一段结果')]]);
    const SEGMENT_TYPES = [
        ['t2v', t('Text-to-Video', '文生视频')],
        ['flf', t('Image-to-Video', '图生视频')],
        ['fmlf', t('First/last frame', '首尾帧')],
        ['ref', t('Reference image', '参考图')]
    ];
    const SEGMENT_IMAGE_LIMITS = {
        t2v: 0,
        flf: 1,
        fmlf: 2,
        ref: 5
    };
    const FORMATS = ['Wan', 'LTXV', 'LTXV TA2V', 'Custom'];

    function numberValue(value, fallback, min, max) {
        const parsed = Number(value);
        const base = Number.isFinite(parsed) ? parsed : fallback;
        return Math.max(min, Math.min(max, base));
    }

    function intValue(value, fallback, min, max) {
        return Math.round(numberValue(value, fallback, min, max));
    }

    function defaultSegment(index, start, end) {
        const imageRef = index === 0 ? 'image_1' : '';
        const audioRef = index === 0 ? 'audio_1' : '';
        return {
            id: `shot_${index + 1}`,
            start,
            end,
            unit: 'seconds',
            type: imageRef ? 'flf' : 't2v',
            prompt: index === 0
                ? 'A slow camera move across a neon street.'
                : 'The subject turns toward the light.',
            images: imageRef ? [{ source_ref: imageRef, role: 'first_frame' }] : [],
            audio: audioRef ? [{ source_ref: audioRef, role: 'voice' }] : [],
            video: []
        };
    }

    function defaultTimeline() {
        return {
            schema: SCHEMA,
            width: 1280,
            height: 720,
            fps: 24,
            duration: 10,
            format: 'Wan',
            segments: [
                defaultSegment(0, 0, 5),
                defaultSegment(1, 5, 10)
            ]
        };
    }

    function clone(value, fallback) {
        try {
            return JSON.parse(JSON.stringify(value ?? fallback));
        } catch (err) {
            return fallback;
        }
    }

    function firstRef(list) {
        return Array.isArray(list) && list[0] ? String(list[0].source_ref || list[0].source_node_id || '').trim() : '';
    }

    function refsFromList(list) {
        const refs = [];
        (Array.isArray(list) ? list : []).forEach((item) => {
            const ref = item && typeof item === 'object' ? String(item.source_ref || item.source_node_id || '').trim() : '';
            if (ref && !refs.includes(ref)) refs.push(ref);
        });
        return refs;
    }

    function inheritsPreviousSegmentLastFrame(segment) {
        return refsFromList(segment?.images).includes(PREVIOUS_SEGMENT_IMAGE_REF);
    }

    function explicitImageRefs(segment) {
        return refsFromList(segment?.images).filter(ref => ref !== PREVIOUS_SEGMENT_IMAGE_REF);
    }

    function imageRefLabel(ref) {
        return ref === PREVIOUS_SEGMENT_IMAGE_REF
            ? t('Previous shot last frame', '上一段尾帧')
            : String(ref || '');
    }

    function imageLimitForType(type) {
        return SEGMENT_IMAGE_LIMITS[String(type || '').trim()] ?? 1;
    }

    function imageRoleForType(type, index) {
        if (type === 'fmlf') return index === 1 ? 'last_frame' : 'first_frame';
        if (type === 'ref') return 'reference';
        return 'first_frame';
    }

    function normalizeSegmentImages(type, refs) {
        return refs.slice(0, imageLimitForType(type)).map((ref, index) => ({
            source_ref: ref,
            role: imageRoleForType(type, index)
        }));
    }

    function taskMethodKey(value) {
        return String(value || '').trim().toLowerCase().replace(/[-\s]+/g, '_');
    }

    function segmentTypeFromTaskMethod(taskMethod, imageRefs, audioRef, videoRef) {
        const key = taskMethodKey(taskMethod);
        if (SEGMENT_TYPES.some(item => item[0] === key)) return key;
        const lower = String(taskMethod || '').trim().toLowerCase();
        const imageCount = Array.isArray(imageRefs) ? imageRefs.length : 0;
        if (videoRef) return 'ref';
        if (imageCount >= 3) return 'ref';
        if (imageCount === 2) return 'fmlf';
        if (imageCount === 1) return 'flf';
        if (lower.includes('t2v') && !imageCount && !audioRef && !videoRef) return 't2v';
        if (imageCount && (lower.includes('extent') || lower.includes('last'))) return 'fmlf';
        if (imageCount && (lower.includes('i2v') || lower === 'wan2.2_cn' || lower === 'wan2.2')) return 'flf';
        if (imageCount || audioRef || videoRef) return 'ref';
        return 't2v';
    }

    function normalizeSegment(segment, index, timeline) {
        const raw = segment && typeof segment === 'object' ? segment : {};
        const fallbackStart = index === 0 ? 0 : numberValue(timeline.segments[index - 1]?.end, index * 5, 0, 86400);
        const start = numberValue(raw.start, fallbackStart, 0, 86400);
        const end = Math.max(start, numberValue(raw.end, start + 5, 0, 86400));
        let imageRefs = refsFromList(raw.images);
        ['image_ref'].concat(IMAGE_REF_PARAM_KEYS).forEach((key) => {
            const ref = String(raw[key] || '').trim();
            if (ref && !imageRefs.includes(ref)) imageRefs.push(ref);
        });
        if (index === 0) imageRefs = imageRefs.filter(ref => ref !== PREVIOUS_SEGMENT_IMAGE_REF);
        const audioRef = firstRef(raw.audio);
        const videoRef = firstRef(raw.video || raw.videos) || VIDEO_REF_PARAM_KEYS.map((key) => String(raw[key] || '').trim()).find(Boolean) || '';
        const rawTypeKey = taskMethodKey(raw.type);
        const legacyMethod = String(raw.task_method || raw.method || '').trim();
        const type = SEGMENT_TYPES.some(item => item[0] === rawTypeKey)
            ? rawTypeKey
            : segmentTypeFromTaskMethod(legacyMethod || raw.type, imageRefs, audioRef, videoRef);
        const videoRole = videoRef === PREVIOUS_SEGMENT_VIDEO_REF
            ? 'previous_result'
            : (raw.video?.[0]?.role || 'reference');
        return {
            id: String(raw.id || `shot_${index + 1}`),
            start,
            end,
            unit: 'seconds',
            type,
            prompt: String(raw.prompt || ''),
            images: normalizeSegmentImages(type, imageRefs),
            audio: audioRef ? [{ source_ref: audioRef, role: raw.audio?.[0]?.role || 'voice' }] : [],
            video: videoRef ? [{ source_ref: videoRef, role: videoRole }] : []
        };
    }

    function normalizeTimeline(value) {
        const raw = value && typeof value === 'object' ? value : {};
        const base = Object.assign(defaultTimeline(), clone(raw, {}));
        base.schema = SCHEMA;
        base.width = intValue(base.width, 1280, 64, 8192);
        base.height = intValue(base.height, 720, 64, 8192);
        base.fps = numberValue(base.fps, 24, 1, 240);
        base.duration = numberValue(base.duration, 10, 0.1, 86400);
        base.format = FORMATS.includes(base.format) ? base.format : 'Wan';
        const rawSegments = Array.isArray(raw.segments) && raw.segments.length ? raw.segments : defaultTimeline().segments;
        base.segments = rawSegments.map((segment, index) => normalizeSegment(segment, index, { segments: rawSegments }));
        if (!base.segments.length) base.segments = [defaultSegment(0, 0, base.duration)];
        return base;
    }

    function optionHtml(options, value) {
        return options.map(item => {
            const val = Array.isArray(item) ? item[0] : item;
            const label = Array.isArray(item) ? item[1] : item;
            return `<option value="${escapeHtml(val)}" ${String(val) === String(value) ? 'selected' : ''}>${escapeHtml(label)}</option>`;
        }).join('');
    }

    function compactTime(value) {
        const number = Number(value || 0);
        if (!Number.isFinite(number)) return '0';
        if (Math.abs(number - Math.round(number)) < 0.0001) return String(Math.round(number));
        return String(Math.round(number * 1000) / 1000);
    }

    function tokenFromRef(ref, kind) {
        const match = String(ref || '').match(/_(\d+)$/);
        if (!match) return '';
        return `@${kind}${match[1]}`;
    }

    function promptOverrideForTimeline(value) {
        const timeline = normalizeTimeline(value);
        return timeline.segments.map((segment) => {
            const refs = [];
            refsFromList(segment.images).forEach((ref) => {
                const token = tokenFromRef(ref, 'image');
                if (token) refs.push(token);
            });
            firstRef(segment.audio) && refs.push(tokenFromRef(firstRef(segment.audio), 'audio'));
            firstRef(segment.video) && refs.push(tokenFromRef(firstRef(segment.video), 'video'));
            const range = `[${compactTime(segment.start)}-${compactTime(segment.end)}s]`;
            return refs.concat([segment.prompt, range]).filter(Boolean).join(' ').trim();
        }).filter(Boolean).join(' | ');
    }

    function sourceLabel(context, node, slot) {
        const sourceId = node?.media_inputs?.[slot.key];
        const source = sourceId && typeof context?.getNode === 'function' ? context.getNode(sourceId) : null;
        if (!source) return t('Not connected', '未连接');
        const title = source.title || source.id || '';
        if (source.type === 'result') return `${title} / Result`;
        return `${title} / ${source.type || slot.kind}`;
    }

    function sourceForRef(context, node, ref) {
        const sourceId = node?.media_inputs?.[ref];
        return sourceId && typeof context?.getNode === 'function' ? context.getNode(sourceId) : null;
    }

    function sourceAssetForPreview(context, source) {
        if (!source) return null;
        if (source.type === 'result' && typeof context?.getSelectedResultAsset === 'function') {
            return context.getSelectedResultAsset(source) || source.asset || source.preview || null;
        }
        return source.asset || source.preview || null;
    }

    function mediaPreviewSrc(context, source) {
        const asset = sourceAssetForPreview(context, source);
        if (!asset) return '';
        if (typeof ASSETS.assetThumbSrc === 'function') return ASSETS.assetThumbSrc(asset);
        if (typeof ASSETS.assetDisplaySrc === 'function') return ASSETS.assetDisplaySrc(asset);
        return asset.thumb || asset.preview_url || asset.data_url || '';
    }

    function mediaSlotsForKind(kind) {
        return MEDIA_SLOT_SPECS.filter(item => item.kind === kind);
    }

    function mediaSlotConnected(context, node, slot) {
        return !!sourceForRef(context, node, slot.key);
    }

    function mediaSlotCardHtml(context, node, slot) {
        const source = sourceForRef(context, node, slot.key);
        const src = mediaPreviewSrc(context, source);
        const label = source ? (source.title || source.id || slot.key) : t('Not connected', '未连接');
        const statusClass = source ? 'has-source' : 'is-empty';
        const previewBody = src && slot.kind !== 'audio'
            ? `<img src="${escapeHtml(src)}" alt="">`
            : `<i class="fa-solid ${escapeHtml(slot.icon)}"></i>`;
        return `
      <div class="sai-director-media-card ${statusClass}" data-director-media-slot="${escapeHtml(slot.key)}" data-director-media-kind="${escapeHtml(slot.kind)}">
        <button type="button" class="sai-node-handle sai-node-handle-in" data-director-media-in="${escapeHtml(slot.key)}" title="${escapeHtml(slot.label)}"></button>
        <div class="sai-director-media-thumb">${previewBody}</div>
        <div class="sai-director-media-meta">
          <b>${escapeHtml(slot.key)}</b>
          <span>${escapeHtml(label)}</span>
        </div>
      </div>`;
    }

    function renderMediaPoolGroup(group, node, context) {
        const slots = mediaSlotsForKind(group.kind);
        const connected = slots.filter(slot => mediaSlotConnected(context, node, slot)).length;
        return `
  <section class="sai-director-media-group" data-director-media-kind-group="${escapeHtml(group.kind)}">
    <div class="sai-director-media-group-head">
      <button type="button" class="sai-node-handle sai-node-handle-in sai-director-media-group-handle" data-director-media-group-in="${escapeHtml(group.kind)}" title="${escapeHtml(group.portLabel)}"></button>
      <i class="fa-solid ${escapeHtml(group.icon)}"></i>
      <span>${escapeHtml(group.label)}</span>
      <small>${escapeHtml(`${connected}/${slots.length}`)}</small>
    </div>
    <div class="sai-director-media-grid">
      ${slots.map(slot => mediaSlotCardHtml(context, node, slot)).join('')}
    </div>
  </section>`;
    }

    function imageRefPreviewHtml(context, node, ref, disabled) {
        if (disabled) {
            return `<div class="sai-director-image-preview is-disabled"><i class="fa-solid fa-ban"></i><span>${escapeHtml(t('No image input', '不使用图片'))}</span></div>`;
        }
        if (!ref) {
            return `<div class="sai-director-image-preview is-empty"><i class="fa-solid fa-image"></i><span>${escapeHtml(t('No image selected', '未选择图片'))}</span></div>`;
        }
        const source = sourceForRef(context, node, ref);
        const src = mediaPreviewSrc(context, source);
        const label = source ? (source.title || source.id || ref) : ref;
        return `<div class="sai-director-image-preview ${src ? 'has-image' : 'is-empty'}">${src ? `<img src="${escapeHtml(src)}" alt="">` : '<i class="fa-solid fa-image"></i>'}<span>${escapeHtml(label)}</span></div>`;
    }

    function timelineSegmentSeconds(timeline, segment, key, fallback) {
        return numberValue(segment?.[key], fallback, 0, 86400);
    }

    function timelineSegmentRange(timeline, segment) {
        const start = timelineSegmentSeconds(timeline, segment, 'start', 0);
        const end = Math.max(start, timelineSegmentSeconds(timeline, segment, 'end', start + 1));
        return { start, end };
    }

    function timelineTotalSeconds(timeline) {
        const segments = Array.isArray(timeline?.segments) ? timeline.segments : [];
        const maxEnd = segments.reduce((value, segment) => Math.max(value, timelineSegmentRange(timeline, segment).end), 0);
        return Math.max(0.1, numberValue(timeline?.duration, 10, 0.1, 86400), maxEnd);
    }

    function formatTimelineSeconds(value) {
        const number = Math.round(numberValue(value, 0, 0, 86400) * 10) / 10;
        return `${Number.isInteger(number) ? number.toFixed(0) : number.toFixed(1)}s`;
    }

    function timelineTrackStyle(range, totalSeconds) {
        const left = Math.max(0, Math.min(100, range.start / totalSeconds * 100));
        const right = Math.max(0, Math.min(100, (totalSeconds - range.end) / totalSeconds * 100));
        return `left:${left}%; right:${right}%;`;
    }

    function timelineSourcePreview(context, node, ref, kind) {
        if (ref === PREVIOUS_SEGMENT_IMAGE_REF) {
            return {
                src: '',
                label: t('Previous shot last frame', '上一段尾帧'),
                short: t('Tail', '尾帧'),
                icon: 'fa-clock-rotate-left'
            };
        }
        if (ref === PREVIOUS_SEGMENT_VIDEO_REF) {
            return {
                src: '',
                label: t('Previous shot result', '上一段结果'),
                short: t('Prev', '上段'),
                icon: 'fa-clock-rotate-left'
            };
        }
        const source = sourceForRef(context, node, ref);
        const slot = MEDIA_SLOT_SPECS.find(item => item.key === ref);
        const src = mediaPreviewSrc(context, source);
        const label = source ? (source.title || source.id || ref) : (slot?.label || ref);
        const icon = kind === 'audio' ? 'fa-wave-square' : (kind === 'video' ? 'fa-film' : 'fa-image');
        return {
            src,
            label,
            short: String(ref || '').replace(/^(image|audio|video)_/, '') || label,
            icon
        };
    }

    function timelineRefKind(ref) {
        if (String(ref || '').startsWith('audio_')) return 'audio';
        if (String(ref || '').startsWith('video_') || ref === PREVIOUS_SEGMENT_VIDEO_REF) return 'video';
        return 'image';
    }

    function timelinePreviewRefChips(context, node, refs) {
        const items = (Array.isArray(refs) ? refs : []).map(ref => String(ref || '').trim()).filter(Boolean);
        if (!items.length) {
            return `<em class="sai-director-timeline-ref is-empty" title="${escapeHtml(t('Text-to-Video', '文生视频'))}"><i class="fa-solid fa-font"></i></em>`;
        }
        return items.map((ref) => {
            const preview = timelineSourcePreview(context, node, ref, timelineRefKind(ref));
            const body = preview.src
                ? `<img src="${escapeHtml(preview.src)}" alt="">`
                : `<span><i class="fa-solid ${escapeHtml(preview.icon)}"></i>${escapeHtml(preview.short)}</span>`;
            return `<em class="sai-director-timeline-ref" title="${escapeHtml(preview.label)}">${body}</em>`;
        }).join('');
    }

    function timelineSegmentTypeLabel(segment) {
        const found = SEGMENT_TYPES.find(item => item[0] === segment?.type);
        return found ? found[1] : t('Shot', '分镜');
    }

    function renderTimelinePreviewClip(context, node, timeline, segment, index, totalSeconds) {
        const range = timelineSegmentRange(timeline, segment);
        const imageRefs = refsFromList(segment.images);
        const videoRef = firstRef(segment.video);
        const audioRef = firstRef(segment.audio);
        const refs = imageRefs.concat(videoRef ? [videoRef] : []);
        const prompt = segment.prompt || timelineSegmentTypeLabel(segment);
        const badges = [
            ...imageRefs.map(ref => `@${ref}`),
            audioRef ? `@${audioRef}` : '',
            videoRef ? `@${videoRef}` : ''
        ].filter(Boolean).join(' ');
        const title = `${t('Shot', '分镜')} ${index + 1} · ${formatTimelineSeconds(range.start)}-${formatTimelineSeconds(range.end)}`;
        const duration = Math.max(0, range.end - range.start);
        return `
<article class="sai-director-timeline-clip ${imageRefs.length ? 'has-image' : ''} ${videoRef ? 'has-video' : ''}" data-director-timeline-clip="${index}" data-director-timeline-drag="move" style="${timelineTrackStyle(range, totalSeconds)}" title="${escapeHtml(prompt)}">
  <button type="button" class="sai-director-timeline-handle is-start" data-director-timeline-drag="start" data-director-timeline-clip="${index}" title="${escapeHtml(t('Adjust start', '调整开始'))}"></button>
  <button type="button" class="sai-director-timeline-handle is-end" data-director-timeline-drag="end" data-director-timeline-clip="${index}" title="${escapeHtml(t('Adjust end', '调整结束'))}"></button>
  <div class="sai-director-timeline-clip-media">${timelinePreviewRefChips(context, node, refs)}</div>
  <div class="sai-director-timeline-clip-body">
    <b>${escapeHtml(title)}</b>
    <span>${escapeHtml(prompt)}</span>
    <small>${escapeHtml(badges || formatTimelineSeconds(duration))}</small>
  </div>
</article>`;
    }

    function renderTimelinePreviewRuler(timeline, totalSeconds) {
        return Array.from({ length: 5 }, (_item, index) => {
            const seconds = totalSeconds * index / 4;
            return `<span style="left:${index * 25}%"><b>${escapeHtml(formatTimelineSeconds(seconds))}</b></span>`;
        }).join('');
    }

    function renderTimelinePreview(timeline, node, context) {
        const segments = Array.isArray(timeline?.segments) ? timeline.segments : [];
        const totalSeconds = timelineTotalSeconds(timeline);
        const meta = `${Math.round(timeline.width)}x${Math.round(timeline.height)} · ${timeline.fps}fps · ${formatTimelineSeconds(totalSeconds)}`;
        return `
<div class="sai-director-timeline-preview">
  <div class="sai-director-timeline-preview-head">
    <span>${escapeHtml(t('Timeline preview', '时间线预览'))}</span>
    <small>${escapeHtml(meta)}</small>
  </div>
  <div class="sai-director-timeline-ruler">${renderTimelinePreviewRuler(timeline, totalSeconds)}</div>
  <div class="sai-director-timeline-video-track">
    <strong>${escapeHtml(t('Video track', '视频轨'))}</strong>
    ${segments.length ? segments.map((segment, index) => renderTimelinePreviewClip(context, node, timeline, segment, index, totalSeconds)).join('') : `<span class="sai-director-timeline-empty">${escapeHtml(t('No shots', '无分镜'))}</span>`}
  </div>
</div>`;
    }

    function segmentRuleText(segment) {
        const type = typeof segment === 'string' ? segment : segment?.type;
        const refs = typeof segment === 'string' ? [] : refsFromList(segment?.images).slice(0, imageLimitForType(type));
        const labels = refs.map(imageRefLabel);
        if (type === 'fmlf' && refs.length >= 2) {
            return t('2 images: {first} first frame / {last} last frame', '2 张图：{first} 首帧 / {last} 尾帧')
                .replace('{first}', labels[0])
                .replace('{last}', labels[1]);
        }
        if (type === 'flf' && refs.length >= 1) {
            return t('1 image: {image} as first frame', '1 张图：{image} 作为首帧')
                .replace('{image}', labels[0]);
        }
        if (type === 'ref' && refs.length >= 3) {
            return t('3-5 images: reference set ({images})', '3-5 张图：参考图组（{images}）')
                .replace('{images}', labels.join(', '));
        }
        if (type === 'fmlf') return t('2 images: first/last frame', '2 张图：首尾帧');
        if (type === 'flf') return t('1 image: image-to-video', '1 张图：图生视频');
        if (type === 'ref') return t('3-5 images: reference set', '3-5 张图：参考图组');
        return t('0 images: text-to-video', '0 张图：文生视频');
    }

    function renderImageRefField(segment, index, attr, indexAttr, node, context, slotIndex) {
        const refs = explicitImageRefs(segment);
        const inheritedCount = inheritsPreviousSegmentLastFrame(segment) ? 1 : 0;
        const limit = Math.max(0, imageLimitForType(segment.type) - inheritedCount);
        const disabled = slotIndex >= limit;
        const value = disabled ? '' : (refs[slotIndex] || '');
        const imageIndex = slotIndex + 1;
        const key = IMAGE_REF_PARAM_KEYS[slotIndex] || `image_ref_${imageIndex}`;
        const label = t(`Image ${imageIndex}`, `图片 ${imageIndex}`);
        return `
    <div class="sai-director-image-ref-field ${disabled ? 'is-disabled' : ''}">
      <label class="sai-node-field"><span>${escapeHtml(label)}</span><select ${attr}="${key}" ${indexAttr} ${disabled ? 'disabled' : ''}>${optionHtml(IMAGE_REFS, value)}</select></label>
      ${imageRefPreviewHtml(context, node, value, disabled)}
    </div>`;
    }

    function renderMediaRows(node, context) {
        return `<div class="sai-director-media-board sai-director-media-list">
${MEDIA_KIND_GROUPS.map(group => renderMediaPoolGroup(group, node, context)).join('')}
</div>`;
    }

    function renderGlobalFields(timeline, attrName) {
        const attr = attrName || 'data-director-param';
        return `
<div class="sai-node-field-row">
  <label class="sai-node-field"><span>${escapeHtml(t('Width', '宽度'))}</span><input ${attr}="width" type="number" min="64" max="8192" step="8" value="${escapeHtml(timeline.width)}"></label>
  <label class="sai-node-field"><span>${escapeHtml(t('Height', '高度'))}</span><input ${attr}="height" type="number" min="64" max="8192" step="8" value="${escapeHtml(timeline.height)}"></label>
</div>
<div class="sai-node-field-row">
  <label class="sai-node-field"><span>${escapeHtml('FPS')}</span><input ${attr}="fps" type="number" min="1" max="240" step="1" value="${escapeHtml(timeline.fps)}"></label>
  <label class="sai-node-field"><span>${escapeHtml(t('Duration', '时长'))}</span><input ${attr}="duration" type="number" min="0.1" max="86400" step="0.1" value="${escapeHtml(timeline.duration)}"></label>
</div>`;
    }

    function renderSegmentRow(segment, index, attrName, node, context) {
        const attr = attrName || 'data-director-segment-param';
        const indexAttr = `data-director-segment-index="${index}"`;
        const imageFieldCount = Math.max(2, Math.min(MAX_IMAGE_REFS, imageLimitForType(segment.type)));
        const inheritPreviousTail = inheritsPreviousSegmentLastFrame(segment);
        const inheritDisabled = index === 0 || imageLimitForType(segment.type) <= 0;
        return `
<div class="sai-director-segment" ${indexAttr}>
  <div class="sai-director-segment-head">
    <b>${escapeHtml(t('Shot', '分镜'))} ${index + 1}</b>
    <span>${escapeHtml(segmentRuleText(segment))}</span>
    <div>
      <button type="button" data-node-action="director-move-segment-up:${index}" title="${escapeHtml(t('Move up', '上移'))}" ${index === 0 ? 'disabled' : ''}><i class="fa-solid fa-arrow-up"></i></button>
      <button type="button" data-node-action="director-move-segment-down:${index}" title="${escapeHtml(t('Move down', '下移'))}"><i class="fa-solid fa-arrow-down"></i></button>
      <button type="button" data-node-action="director-remove-segment:${index}" title="${escapeHtml(t('Delete shot', '删除分镜'))}"><i class="fa-solid fa-trash"></i></button>
    </div>
  </div>
  <div class="sai-node-field-row sai-director-segment-time">
    <label class="sai-node-field"><span>${escapeHtml(t('Start', '开始'))}</span><input ${attr}="start" ${indexAttr} type="number" step="0.1" value="${escapeHtml(segment.start)}"></label>
    <label class="sai-node-field"><span>${escapeHtml(t('End', '结束'))}</span><input ${attr}="end" ${indexAttr} type="number" step="0.1" value="${escapeHtml(segment.end)}"></label>
  </div>
  <div class="sai-node-field-row sai-director-segment-mode">
    <label class="sai-node-field"><span>${escapeHtml(t('Type', '类型'))}</span><select ${attr}="type" ${indexAttr}>${optionHtml(SEGMENT_TYPES, segment.type)}</select></label>
    <label class="sai-node-field sai-director-inherit-tail"><span>${escapeHtml(t('Inherit previous shot last frame', '继承上段尾帧'))}</span><input ${attr}="inherit_previous_tail" ${indexAttr} type="checkbox" ${inheritPreviousTail ? 'checked' : ''} ${inheritDisabled ? 'disabled' : ''}></label>
  </div>
  <div class="sai-director-image-ref-row">
    ${Array.from({ length: imageFieldCount }, (_, slotIndex) => renderImageRefField(segment, index, attr, indexAttr, node, context, slotIndex)).join('')}
  </div>
  <div class="sai-node-field-row sai-director-segment-refs">
    <label class="sai-node-field"><span>${escapeHtml(t('Audio ref', '音频引用'))}</span><select ${attr}="audio_ref" ${indexAttr}>${optionHtml(AUDIO_REFS, firstRef(segment.audio))}</select></label>
    <label class="sai-node-field"><span>${escapeHtml(t('Video ref', '视频引用'))}</span><select ${attr}="video_ref" ${indexAttr}>${optionHtml(VIDEO_REFS, firstRef(segment.video))}</select></label>
  </div>
  <label class="sai-node-field sai-text-node-field sai-director-segment-prompt"><span>${escapeHtml(t('Prompt', '提示词'))}</span><textarea ${attr}="prompt" ${indexAttr} rows="2">${escapeHtml(segment.prompt)}</textarea></label>
</div>`;
    }

    function renderSegments(timeline, attrName, node, context) {
        return `<div class="sai-director-segments">${timeline.segments.map((segment, index) => renderSegmentRow(segment, index, attrName, node, context)).join('')}</div>`;
    }

    function renderNodeHtml(node, context) {
        const timeline = normalizeTimeline(node.director);
        const output = promptOverrideForTimeline(timeline);
        return `
<div class="sai-node-head">
  <span class="sai-node-kind">${escapeHtml(t('Director', '导演'))}</span>
  <span class="sai-node-title">${escapeHtml(node.title || t('Director Timeline', '导演时间轴'))}</span>
  ${typeof context?.renderNodeStateBadges === 'function' ? context.renderNodeStateBadges(node) : ''}
  <button type="button" data-node-action="director-add-segment" title="${escapeHtml(t('Add shot', '新增分镜'))}"><i class="fa-solid fa-plus"></i></button>
  <button type="button" data-node-action="delete" title="${escapeHtml(t('Delete', '删除'))}"><i class="fa-solid fa-xmark"></i></button>
</div>
<div class="sai-director-node-body">
<div class="sai-director-top-grid">
  <div class="sai-director-media-panel">
    <div class="sai-director-section-title"><span>${escapeHtml(t('Media pool', '素材池'))}</span><small>${escapeHtml(t('Connect to a group port for auto slot assignment', '连接到分组入口会自动分配空槽'))}</small></div>
    ${renderMediaRows(node, context)}
  </div>
  <div class="sai-director-settings-panel">
    <div class="sai-director-section-title"><span>${escapeHtml(t('Timeline settings', '时间线参数'))}</span></div>
    <div class="sai-director-settings">
      ${renderGlobalFields(timeline)}
    </div>
  </div>
</div>
${renderSegments(timeline, undefined, node, context)}
${renderTimelinePreview(timeline, node, context)}
<div class="sai-director-output">
  <span>${escapeHtml('prompt_override')}</span>
  <textarea readonly rows="3">${escapeHtml(output)}</textarea>
</div>
<button type="button" class="sai-node-primary" data-node-action="director-add-segment"><i class="fa-solid fa-plus"></i><span>${escapeHtml(t('Add Shot', '新增分镜'))}</span></button>
</div>
<button type="button" class="sai-node-handle sai-node-handle-out" data-handle-out="text" title="${escapeHtml(t('prompt_override output', 'prompt_override 输出'))}"></button>`;
    }

    function renderInspector(node, context) {
        const timeline = normalizeTimeline(node.director);
        const output = promptOverrideForTimeline(timeline);
        return `
<div class="sai-inspector-section">
  <h3>${escapeHtml(t('Director Timeline', '导演时间轴'))}</h3>
  <label>${escapeHtml(t('Title', '标题'))}<input data-inspector-node-field="title" value="${escapeHtml(node.title || '')}"></label>
  <div class="sai-inspector-kv"><span>${escapeHtml(t('Shots', '分镜'))}</span><b>${escapeHtml(String(timeline.segments.length))}</b></div>
  <div class="sai-inspector-kv"><span>${escapeHtml(t('Output', '输出'))}</span><b>${escapeHtml(output ? 'prompt_override' : t('Empty', '空'))}</b></div>
</div>
<div class="sai-inspector-section">
  <h3>${escapeHtml(t('Global', '全局'))}</h3>
  ${renderGlobalFields(timeline, 'data-inspector-director-param')}
</div>
<div class="sai-inspector-section">
  <h3>${escapeHtml(t('Media References', '媒体引用'))}</h3>
  ${renderMediaRows(node, context)}
</div>
<div class="sai-inspector-section">
  <h3>${escapeHtml(t('Shots', '分镜'))}</h3>
  ${renderSegments(timeline, 'data-inspector-director-segment-param', node, context)}
</div>
<div class="sai-inspector-section">
  <h3>${escapeHtml(t('Timeline preview', '时间线预览'))}</h3>
  ${renderTimelinePreview(timeline, node, context)}
</div>
<div class="sai-inspector-section">
  <h3>${escapeHtml('prompt_override')}</h3>
  <textarea readonly rows="5">${escapeHtml(output)}</textarea>
</div>
<div class="sai-inspector-actions">
  <button type="button" data-inspector-action="director-add-segment"><i class="fa-solid fa-plus"></i><span>${escapeHtml(t('Add Shot', '新增分镜'))}</span></button>
  <button type="button" data-inspector-action="director-copy-output"><i class="fa-solid fa-copy"></i><span>${escapeHtml(t('Copy Output', '复制输出'))}</span></button>
  <button type="button" data-inspector-action="duplicate"><i class="fa-solid fa-copy"></i><span>${escapeHtml(t('Duplicate', '复制'))}</span></button>
  <button type="button" data-inspector-action="delete" class="danger"><i class="fa-solid fa-trash"></i><span>${escapeHtml(t('Delete', '删除'))}</span></button>
</div>`;
    }

    function createNode(world, options, context) {
        const opts = options || {};
        if (opts.history !== false && typeof context?.pushHistory === 'function') context.pushHistory('Add Director Timeline node');
        const size = typeof context?.defaultNodeSize === 'function' ? context.defaultNodeSize('director_timeline') : { w: 880, h: 620 };
        const node = {
            id: uid('director'),
            type: 'director_timeline',
            x: world.x,
            y: world.y,
            w: size.w,
            h: size.h,
            title: opts.title || t('Director Timeline', '导演时间轴'),
            director: normalizeTimeline(opts.director || defaultTimeline()),
            media_inputs: Object.assign({}, opts.media_inputs || {}),
            source: { kind: 'director_timeline', schema: SCHEMA },
            status: {
                state: 'idle',
                message: t('Build prompt_override and media references for video workflows.', '为视频工作流生成 prompt_override 和媒体引用。')
            }
        };
        if (typeof context?.placeNodeAvoidingOverlap === 'function') context.placeNodeAvoidingOverlap(node, world);
        const project = context?.project && typeof context.project === 'object' ? context.project : { nodes: [] };
        if (!Array.isArray(project.nodes)) project.nodes = [];
        project.nodes.push(node);
        if (typeof context?.setSelectedNode === 'function') context.setSelectedNode(node.id);
        if (opts.render !== false && typeof context?.mutate === 'function') context.mutate();
        if (opts.toast !== false && typeof context?.showToast === 'function') context.showToast(t('Director Timeline node added', '已添加导演时间轴节点'));
        return node;
    }

    function mediaSourceKind(source) {
        if (!source) return '';
        if (source.type === 'image' || source.type === 'mask' || source.type === 'pose_studio' || source.type === 'gaussian_studio') return 'image';
        if (source.type === 'video' || source.type === 'sam3_video_mask') return 'video';
        if (source.type === 'audio') return 'audio';
        const asset = source.type === 'result' && source.asset ? source.asset : source.asset;
        const mime = String(asset?.mime || '').toLowerCase();
        if (mime.startsWith('image/')) return 'image';
        if (mime.startsWith('video/')) return 'video';
        if (mime.startsWith('audio/')) return 'audio';
        if (source.type === 'result') return 'result';
        return '';
    }

    function serializeForRun(node, context) {
        const timeline = normalizeTimeline(node?.director || {});
        const mediaInputs = node?.media_inputs && typeof node.media_inputs === 'object' ? node.media_inputs : {};
        const mediaSources = {};
        const sourceNodeIds = {};
        MEDIA_SLOT_SPECS.forEach((slot) => {
            const sourceId = mediaInputs[slot.key];
            const source = sourceId && typeof context?.getNode === 'function' ? context.getNode(sourceId) : null;
            if (!source || (typeof context?.isNodeIgnored === 'function' && context.isNodeIgnored(source))) return;
            sourceNodeIds[slot.key] = source.id;
            mediaSources[slot.key] = typeof context?.serializeAssetSourceForRun === 'function'
                ? context.serializeAssetSourceForRun(source)
                : { node_id: source.id, type: source.type, title: source.title || '' };
        });
        const segments = timeline.segments.map((segment) => {
            const imageRefs = refsFromList(segment.images);
            const audioRef = firstRef(segment.audio);
            const videoRef = firstRef(segment.video);
            const videoRole = videoRef === PREVIOUS_SEGMENT_VIDEO_REF
                ? 'previous_result'
                : (segment.video?.[0]?.role || 'reference');
            const start = numberValue(segment.start, 0, 0, 86400);
            const end = Math.max(start, numberValue(segment.end, start + 0.1, 0, 86400));
            return Object.assign({}, segment, {
                start,
                end,
                unit: 'seconds',
                images: imageRefs.map((imageRef, imageIndex) => ({
                    source_ref: imageRef,
                    source_node_id: sourceNodeIds[imageRef] || '',
                    role: imageRoleForType(segment.type, imageIndex)
                })),
                audio: audioRef ? [{ source_ref: audioRef, source_node_id: sourceNodeIds[audioRef] || '', role: segment.audio?.[0]?.role || 'voice' }] : [],
                video: videoRef ? [{ source_ref: videoRef, source_node_id: sourceNodeIds[videoRef] || '', role: videoRole }] : []
            });
        });
        const payload = Object.assign({}, timeline, {
            segments,
            prompt_override: promptOverrideForTimeline(Object.assign({}, timeline, { segments })),
            media_inputs: clone(mediaInputs, {}),
            media_sources: mediaSources
        });
        return payload;
    }

    window.SimpAICanvasWorkbenchDirectorTimelineNode = {
        SCHEMA,
        MEDIA_SLOT_SPECS,
        PREVIOUS_SEGMENT_VIDEO_REF,
        PREVIOUS_SEGMENT_IMAGE_REF,
        MAX_AUDIO_REFS,
        MAX_VIDEO_REFS,
        MEDIA_KIND_GROUPS,
        defaultTimeline,
        normalizeTimeline,
        promptOverrideForTimeline,
        mediaSourceKind,
        renderTimelinePreview,
        createNode,
        renderInspector,
        renderNodeHtml,
        serializeForRun
    };
})();
