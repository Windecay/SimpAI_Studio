(function () {
    'use strict';

    function createCanvasTimelineDomController(context) {
        const scope = context || {};
        const call = (name, fallback, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : fallback;
        const getDocument = () => call('getDocument', typeof document !== 'undefined' ? document : null);
        const cssEscape = (value) => call('cssEscape', String(value || ''), value);
        const clamp = typeof scope.clamp === 'function'
            ? scope.clamp
            : (value, min, max) => Math.max(min, Math.min(max, value));
        const formatAssetDuration = (value) => call('formatAssetDuration', String(value || 0), value);

        function normalizeKeyframes(clip) {
            const frames = call('timelineNormalizeKeyframes', null, clip);
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
            const layout = call('timelineBuildTrackClipLayout', null, clips);
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
