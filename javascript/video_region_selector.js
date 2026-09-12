(function (root) {
    'use strict';
    root.SimpAIVideoRegionSelector?.dispose?.();

    function normalize(value, duration) {
        const limit = Number.isFinite(duration) && duration > 0 ? duration : 0;
        const start = Math.max(0, Math.min(limit, Number(value.start) || 0));
        const end = Math.max(start, Math.min(limit, Number(value.end) || 0));
        const factor = Math.max(1, Math.min(4, Math.round(Number(value.factor) || 2)));
        return { start, end, factor };
    }

    function contextRange(value, duration, slowSeconds = 0.75) {
        const state = normalize(value, duration);
        return { start: Math.max(0, state.start - slowSeconds / state.factor),
            end: Math.min(duration, state.end + slowSeconds / state.factor) };
    }

    function boundaryPreviews(value, duration, timing = {}) {
        const state = normalize(value, duration);
        const fps = Number(timing?.fps);
        const frames = Number(timing?.frames);
        if (Number.isFinite(fps) && fps > 0 && Number.isInteger(frames) && frames > 0
                && Math.abs(frames / fps - duration) <= Math.max(0.05, 1 / fps)) {
            // Match Python round() and the backend's exclusive end-frame boundary.
            const frameRound = v => v - Math.floor(v) === 0.5
                ? Math.floor(v) + Math.floor(v) % 2 : Math.round(v);
            const first = Math.min(frames - 1, frameRound(state.start * fps));
            const last = Math.min(frames, Math.max(first + 1, frameRound(state.end * fps))) - 1;
            const frame = index => ({ frame: index + 1, time: index / fps,
                seek: Math.min(duration, index / fps + Math.min(0.001, 0.1 / fps)) });
            return { start: frame(first), end: frame(last) };
        }
        return {
            start: { frame: null, time: state.start, seek: Math.min(state.start, Math.max(0, duration - 0.001)) },
            end: { frame: null, time: state.end, seek: Math.max(state.start, state.end - 0.001) },
        };
    }

    function sourceTiming(sourceId, video) {
        let metadata;
        try {
            metadata = typeof root._rc_readSourceMeta === 'function' ? root._rc_readSourceMeta()
                : JSON.parse(document.querySelector('#resolution_source_meta textarea, #resolution_source_meta input')?.value || '{}');
        } catch (_) { return {}; }
        const info = metadata?.[sourceId];
        if (!info || info.kind !== 'video') return {};
        if (info.path) {
            const filename = value => String(value).replace(/\\/g, '/').split('/').pop();
            try {
                const src = video.getAttribute('src') || video.currentSrc;
                const mediaName = filename(decodeURIComponent(new URL(src, document.baseURI).pathname));
                const originalName = filename(info.path);
                const previewName = originalName.replace(/\.[^.]+$/, '_preview.mp4');
                if (mediaName !== originalName && mediaName !== previewName) return {};
            } catch (_) { return {}; }
        }
        return info;
    }

    async function captureReference(video, signal) {
        const source = video.getAttribute('src') || video.currentSrc || video.querySelector('source')?.src;
        const time = video.currentTime;
        if (!source || !Number.isFinite(time)) throw new Error('No Video');
        const player = document.createElement('video');
        player.muted = true;
        player.preload = 'auto';
        if (video.crossOrigin) player.crossOrigin = video.crossOrigin;
        try {
            await new Promise((resolve, reject) => {
                const timer = setTimeout(() => finish(new Error('Reference Capture Failed')), 12000);
                const finish = error => {
                    clearTimeout(timer);
                    signal.removeEventListener('abort', abort);
                    for (const event of ['loadedmetadata', 'loadeddata', 'seeked']) player.removeEventListener(event, ready);
                    player.removeEventListener('error', fail);
                    error ? reject(error) : resolve();
                };
                const abort = () => finish(new DOMException('Aborted', 'AbortError'));
                const fail = () => finish(new Error('Reference Capture Failed'));
                const ready = () => {
                    if (!player.readyState || player.seeking) return;
                    const target = Math.min(time, Math.max(0, player.duration - 0.001));
                    if (Math.abs(player.currentTime - target) > 0.0001) player.currentTime = target;
                    else if (player.readyState >= 2) finish();
                };
                signal.addEventListener('abort', abort, { once: true });
                for (const event of ['loadedmetadata', 'loadeddata', 'seeked']) player.addEventListener(event, ready);
                player.addEventListener('error', fail);
                if (signal.aborted) return abort();
                player.src = source;
            });
            const canvas = document.createElement('canvas');
            canvas.width = player.videoWidth;
            canvas.height = player.videoHeight;
            canvas.getContext('2d').drawImage(player, 0, 0);
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            if (!blob) throw new Error('Reference Capture Failed');
            return new File([blob], `reference-${time.toFixed(3)}s.png`, { type: 'image/png' });
        } finally {
            player.removeAttribute('src');
            player.load();
        }
    }

    async function submitReferenceFile(container, file, signal) {
        let input = container?.querySelector('input[type="file"]');
        if (signal.aborted) return false;
        if (!container?.isConnected) throw new Error('Reference Upload Failed');
        if (!input) {
            const clear = container.querySelector('button[aria-label="Remove Image"], button[aria-label="Clear"]');
            if (!clear) throw new Error('Reference Upload Failed');
            clear.click();
            input = await new Promise(resolve => {
                const finish = value => {
                    observer.disconnect();
                    clearTimeout(timer);
                    signal.removeEventListener('abort', abort);
                    resolve(value);
                };
                const abort = () => finish(null);
                const observer = new MutationObserver(() => {
                    const next = container.querySelector('input[type="file"]');
                    if (next) finish(next);
                });
                const timer = setTimeout(() => finish(null), 2000);
                observer.observe(container, { childList: true, subtree: true });
                signal.addEventListener('abort', abort, { once: true });
                const next = container.querySelector('input[type="file"]');
                if (next) finish(next);
            });
        }
        if (signal.aborted) return false;
        if (!container.isConnected || !input || input.disabled) throw new Error('Reference Upload Failed');
        const transfer = new DataTransfer();
        transfer.items.add(file);
        input.files = transfer.files;
        input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        return true;
    }

    function create(host, video, options) {
        let stage = options.stage || {};
        let duration = Number.isFinite(video.duration) ? video.duration : 0;
        const normalizeValue = value => normalize(value, duration || Math.max(
            Number(value?.start) || 0, Number(value?.end) || 0));
        let state = normalizeValue(options.value || { start: 0, end: 1, factor: 2 });
        let selectedPlayback = false;
        let drag = null;
        let previewTimes;
        let referenceBusy = false;
        let referenceStatus = '';
        let uploadTarget = '';
        const referenceIds = options.referenceControls || [];
        const t = key => String(stage.__lang || 'en').toLowerCase().startsWith('en')
            ? key : (root.localization?.[key] || key);
        const controller = new AbortController();
        const listen = (el, name, fn, opts = {}) => el.addEventListener(name, fn, { ...opts, signal: controller.signal });
        host.classList.add('sai-video-region');
        host.innerHTML = `
            <div class="sai-region-heading"><strong data-label="Video Region"></strong>
                <output class="sai-region-status" aria-live="polite"></output>
                <button type="button" class="sai-region-play" data-play="selection"><i class="fa-solid fa-play" aria-hidden="true"></i></button></div>
            <div class="sai-region-track">
                <div class="sai-region-context"></div><div class="sai-region-core"></div>
                <button type="button" class="sai-region-playhead" data-playhead role="slider" draggable="false"></button>
                <button type="button" class="sai-region-handle" data-edge="start" role="slider" draggable="false"></button>
                <button type="button" class="sai-region-handle" data-edge="end" role="slider" draggable="false"></button>
            </div>
            <div class="sai-region-ruler"><span>0:00</span><span data-duration></span></div>
            <div class="sai-region-fields">
                ${['start', 'end'].map(edge => `<div class="sai-region-boundary">
                    <button type="button" class="sai-region-preview" data-preview="${edge}" draggable="false">
                        <video muted playsinline preload="auto" tabindex="-1" aria-hidden="true" draggable="false"></video>
                        <i class="fa-solid fa-spinner fa-spin sai-region-preview-status" aria-hidden="true"></i>
                        <span class="sai-region-preview-caption"><span data-preview-label></span><span data-frame-number></span></span>
                    </button>
                    <label><span data-label="${edge === 'start' ? 'Region Start (s)' : 'Region End (s)'}"></span>
                        <input data-field="${edge}" type="number" min="0" step="0.01"></label>
                </div>`).join('')}
            </div>
            <div class="sai-region-speed"><span data-label="Reconstruction Slowdown"></span>
                <div class="sai-region-factors" role="radiogroup">
                    ${[1, 2, 3, 4].map(n => `<button type="button" role="radio" data-factor="${n}">${n}x</button>`).join('')}
                </div></div>
            <div class="sai-region-legend"><i class="sai-region-core-swatch"></i><span data-label="Rebuild"></span>
                <i class="sai-region-context-swatch"></i><span data-label="Context"></span></div>
            ${referenceIds.length ? `<div class="sai-region-references">
                <strong data-label="Reference Images"></strong>
                <div class="sai-region-reference-tools">
                    <select data-reference-target></select>
                    <button type="button" data-reference-capture><i class="fa-solid fa-camera" aria-hidden="true"></i><span data-label="Capture Reference Frame"></span></button>
                    <button type="button" data-reference-upload><i class="fa-solid fa-upload" aria-hidden="true"></i><span data-label="Upload Reference Image"></span></button>
                    <input type="file" accept="image/*" data-reference-file hidden>
                </div>
                <output data-reference-status role="status"></output>
            </div>` : ''}`;
        const track = host.querySelector('.sai-region-track');
        const playhead = host.querySelector('[data-playhead]');
        const field = key => host.querySelector(`[data-field="${key}"]`);
        const previews = {};
        const referenceSelect = host.querySelector('[data-reference-target]');
        const referenceLabels = new Map();
        const referenceObserver = new MutationObserver(renderReferences);
        for (const id of referenceIds) {
            const option = document.createElement('option');
            option.value = id;
            referenceSelect.append(option);
        }
        function renderReferences() {
            if (controller.signal.aborted) return;
            let picture = 0;
            for (const [index, id] of referenceIds.entries()) {
                let entry = referenceLabels.get(id);
                const container = document.getElementById(id);
                if (container && (entry?.container !== container || !entry.label.isConnected)) {
                    entry?.container.classList.remove('sai-region-reference-input');
                    entry?.label.remove();
                    const label = document.createElement('div');
                    label.className = 'sai-region-reference-label';
                    container.prepend(label);
                    container.classList.add('sai-region-reference-input');
                    entry = { container, label };
                    referenceLabels.set(id, entry);
                    referenceObserver.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
                }
                const image = entry?.container.querySelector('img[src]');
                const present = !!image?.getAttribute('src');
                const label = `${t('Reference Image')} ${index + 1}${present ? `  <Picture ${++picture}>` : ''}`;
                if (referenceSelect.options[index].textContent !== label) referenceSelect.options[index].textContent = label;
                if (entry && entry.label.textContent !== label) entry.label.textContent = label;
            }
            if (!referenceSelect) return;
            referenceSelect.setAttribute('aria-label', t('Reference Image'));
            referenceSelect.disabled = referenceBusy;
            for (const [selector, label] of [
                ['[data-reference-capture]', 'Capture Reference Frame'],
                ['[data-reference-upload]', 'Upload Reference Image'],
            ]) {
                const button = host.querySelector(selector);
                button.title = t(label);
                button.setAttribute('aria-label', t(label));
                button.disabled = referenceBusy || (selector === '[data-reference-capture]' && !duration);
            }
            const status = host.querySelector('[data-reference-status]');
            status.textContent = t(referenceStatus);
            status.dataset.error = String(referenceStatus.endsWith('Failed'));
        }
        async function addReference(fileOrCapture, target) {
            if (referenceBusy) return;
            const capture = typeof fileOrCapture === 'function';
            referenceBusy = true;
            referenceStatus = 'Preparing Reference';
            renderReferences();
            try {
                const file = capture ? await fileOrCapture() : fileOrCapture;
                if (controller.signal.aborted) return;
                if (await submitReferenceFile(document.getElementById(target), file, controller.signal)) {
                    referenceStatus = '';
                }
            } catch (error) {
                if (error.name !== 'AbortError') {
                    referenceStatus = !capture || error.message === 'Reference Upload Failed'
                        ? 'Reference Upload Failed' : 'Reference Capture Failed';
                    console.warn('[SimpAI] Reference image could not be added.', error);
                }
            } finally {
                referenceBusy = false;
                if (!controller.signal.aborted) renderReferences();
            }
        }
        if (referenceSelect) {
            listen(host.querySelector('[data-reference-capture]'), 'click', () =>
                addReference(() => captureReference(video, controller.signal), referenceSelect.value));
            listen(host.querySelector('[data-reference-upload]'), 'click', () => {
                uploadTarget = referenceSelect.value;
                host.querySelector('[data-reference-file]').click();
            });
            listen(host.querySelector('[data-reference-file]'), 'change', event => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void addReference(file, uploadTarget);
            });
        }
        for (const key of ['start', 'end']) {
            const button = host.querySelector(`[data-preview="${key}"]`);
            const player = button.querySelector('video');
            const preview = previews[key] = { button, player, target: null, failed: false };
            const drive = () => {
                if (controller.signal.aborted || preview.target === null || preview.failed || !player.readyState || player.seeking) return;
                if (Math.abs(player.currentTime - preview.target) > 0.0001) {
                    player.currentTime = preview.target;
                    return;
                }
                if (player.readyState >= 2) {
                    button.dataset.ready = 'true';
                    button.setAttribute('aria-busy', 'false');
                }
            };
            preview.request = target => {
                if (preview.target === target) return;
                preview.target = target;
                button.dataset.ready = 'false';
                button.setAttribute('aria-busy', 'true');
                drive();
            };
            for (const event of ['loadedmetadata', 'loadeddata', 'seeked']) listen(player, event, drive);
            listen(player, 'error', () => {
                preview.failed = true;
                button.dataset.error = 'true';
                button.dataset.ready = 'false';
                button.setAttribute('aria-busy', 'false');
                button.querySelector('i').className = 'fa-solid fa-triangle-exclamation sai-region-preview-status';
                render();
            });
            listen(button, 'click', () => showBoundary(key));
            if (video.crossOrigin) player.crossOrigin = video.crossOrigin;
            player.muted = true;
            const source = video.getAttribute('src') || video.currentSrc || video.querySelector('source')?.src;
            if (source) player.src = source;
        }
        function renderPlayhead(time = video.currentTime) {
            playhead.style.left = `${duration ? Math.max(0, Math.min(100, time / duration * 100)) : 0}%`;
            playhead.disabled = !duration;
            playhead.setAttribute('aria-label', t('Playhead'));
            playhead.setAttribute('aria-valuemin', '0');
            playhead.setAttribute('aria-valuemax', duration);
            playhead.setAttribute('aria-valuenow', time.toFixed(3));
            playhead.setAttribute('aria-valuetext', `${time.toFixed(3)} s`);
            playhead.title = `${t('Playhead')} ${time.toFixed(3)} s`;
        }
        function seekMain(time) {
            selectedPlayback = false;
            video.pause();
            video.currentTime = Math.max(0, Math.min(duration, time));
            renderPlayhead(video.currentTime);
        }
        function showBoundary(key) {
            if (!duration || !previewTimes) return;
            host.dataset.activePreview = key;
            seekMain(previewTimes[key].seek);
        }
        function render() {
            host.dataset.theme = String(stage.__theme || '').includes('light') ? 'light' : 'dark';
            host.querySelectorAll('[data-label]').forEach(el => { el.textContent = t(el.dataset.label); });
            for (const key of ['start', 'end']) {
                const input = field(key);
                if (document.activeElement !== input) input.value = state[key];
                input.disabled = !duration;
                if (duration) input.max = duration;
                else input.removeAttribute('max');
            }
            host.querySelector('.sai-region-factors').setAttribute('aria-label', t('Reconstruction Slowdown'));
            host.querySelectorAll('[data-factor]').forEach(el => {
                el.setAttribute('aria-checked', String(Number(el.dataset.factor) === state.factor));
                el.tabIndex = Number(el.dataset.factor) === state.factor ? 0 : -1;
            });
            host.querySelector('[data-duration]').textContent =
                `${Math.floor(duration / 60)}:${Math.floor(duration % 60).toString().padStart(2, '0')}`;
            const pct = v => `${duration ? 100 * v / duration : 0}%`;
            const context = contextRange(state, duration, options.contextSlowSeconds);
            for (const [selector, start, end] of [
                ['.sai-region-context', context.start, context.end],
                ['.sai-region-core', state.start, state.end],
            ]) {
                const el = host.querySelector(selector);
                el.style.left = pct(start);
                el.style.width = pct(end - start);
            }
            host.querySelectorAll('[data-edge]').forEach(el => {
                const edge = el.dataset.edge;
                el.style.left = pct(state[edge]);
                el.disabled = !duration;
                el.setAttribute('aria-label', t(edge === 'start' ? 'Region Start (s)' : 'Region End (s)'));
                el.setAttribute('aria-valuemin', edge === 'start' ? 0 : state.start);
                el.setAttribute('aria-valuemax', edge === 'start' ? state.end : duration);
                el.setAttribute('aria-valuenow', state[edge]);
            });
            const play = host.querySelector('[data-play]');
            const label = t(selectedPlayback ? 'Pause' : 'Play Selected Region');
            play.title = label;
            play.setAttribute('aria-label', label);
            play.querySelector('i').className = selectedPlayback ? 'fa-solid fa-pause' : 'fa-solid fa-play';
            play.disabled = !duration || state.end <= state.start;
            host.querySelector('output').textContent = duration
                ? `${(state.end - state.start).toFixed(2)} s`
                : t('No Video');
            previewTimes = boundaryPreviews(state, duration, options.getTiming?.() || options.timing);
            for (const key of ['start', 'end']) {
                const preview = previews[key];
                const point = previewTimes[key];
                const label = t(point.frame ? (key === 'start' ? 'First Frame' : 'Last Frame')
                    : (key === 'start' ? 'Start Preview' : 'End Preview'));
                preview.button.querySelector('[data-preview-label]').textContent = label;
                preview.button.querySelector('[data-frame-number]').textContent = point.frame ? `#${point.frame}` : '';
                preview.button.title = `${label} ${point.time.toFixed(3)} s${preview.failed ? `: ${t('Preview Unavailable')}` : ''}`;
                preview.button.setAttribute('aria-label', preview.button.title);
                preview.button.disabled = !duration;
                preview.button.dataset.time = point.time;
                preview.button.querySelector('i').className = `fa-solid ${
                    !duration ? 'fa-image' : preview.failed ? 'fa-triangle-exclamation' : 'fa-spinner fa-spin'
                } sai-region-preview-status`;
                if (duration) preview.request(point.seek);
            }
            renderPlayhead();
            renderReferences();
        }
        function publish(next, commit = true, edge = null) {
            state = normalizeValue(next);
            selectedPlayback = false;
            video.pause();
            render();
            if (edge) showBoundary(edge);
            options.onChange?.({ ...state }, commit);
        }
        for (const key of ['start', 'end']) {
            listen(field(key), 'input', () => {
                const value = Number(field(key).value);
                if (!field(key).value || !Number.isFinite(value) || value < 0 || value > duration) return;
                if (key === 'start' ? value >= state.end : value <= state.start) return;
                publish({ ...state, [key]: value }, false, key);
            });
            listen(field(key), 'change', () => {
                let value = Number(field(key).value);
                if (!Number.isFinite(value)) return render();
                if (key === 'start') value = Math.min(value, Math.max(0, state.end - 0.01));
                if (key === 'end') value = Math.max(value, state.start + 0.01);
                publish({ ...state, [key]: value }, true, key);
                field(key).value = state[key];
            });
        }
        host.querySelectorAll('[data-factor]').forEach(el => {
            listen(el, 'click', () => publish({ ...state, factor: Number(el.dataset.factor) }));
            listen(el, 'keydown', event => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                const factor = event.key === 'Home' ? 1 : event.key === 'End' ? 4
                    : (state.factor + (event.key === 'ArrowRight' ? 1 : 3) - 1) % 4 + 1;
                publish({ ...state, factor });
                host.querySelector(`[data-factor="${factor}"]`).focus();
            });
        });
        const seek = event => {
            const box = track.getBoundingClientRect();
            return Math.max(0, Math.min(duration, (event.clientX - box.left) / box.width * duration));
        };
        listen(host, 'dragstart', event => { event.preventDefault(); event.stopPropagation(); }, { capture: true });
        function movePointer(event) {
            if (!drag || event.pointerId !== drag.pointerId) return;
            event.preventDefault();
            if (drag.edge === 'playhead') {
                seekMain(seek(event));
                return;
            }
            const time = Math.round(seek(event) * 100) / 100;
            publish({ ...state, [drag.edge]: drag.edge === 'start'
                ? Math.min(time, state.end - 0.01) : Math.max(time, state.start + 0.01) }, false, drag.edge);
        }
        listen(track, 'pointerdown', event => {
            if (!duration || event.button !== 0 || drag) return;
            const handle = event.target.closest('[data-edge]');
            event.preventDefault();
            event.stopPropagation();
            drag = { edge: handle?.dataset.edge || 'playhead', pointerId: event.pointerId };
            track.dataset.dragging = drag.edge;
            track.setPointerCapture(event.pointerId);
            if (handle) {
                handle.focus({ preventScroll: true });
                showBoundary(drag.edge);
            } else {
                delete host.dataset.activePreview;
                playhead.focus({ preventScroll: true });
                movePointer(event);
            }
        });
        listen(track, 'pointermove', movePointer);
        const finishDrag = event => {
            if (!drag || event.pointerId !== drag.pointerId) return;
            const finished = drag;
            drag = null;
            delete track.dataset.dragging;
            if (track.hasPointerCapture(finished.pointerId)) track.releasePointerCapture(finished.pointerId);
            if (finished.edge !== 'playhead') options.onChange?.({ ...state }, true);
        };
        listen(track, 'pointerup', finishDrag);
        listen(track, 'pointercancel', finishDrag);
        listen(track, 'lostpointercapture', finishDrag);
        listen(track, 'keydown', event => {
            const edge = event.target.dataset.edge || (event.target === playhead ? 'playhead' : '');
            if (!edge || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            if (edge === 'playhead') {
                const fps = Number((options.getTiming?.() || options.timing)?.fps);
                const step = fps > 0 ? 1 / fps : 0.04;
                const time = event.key === 'Home' ? 0 : event.key === 'End' ? duration
                    : video.currentTime + (event.key === 'ArrowLeft' ? -step : step);
                delete host.dataset.activePreview;
                seekMain(time);
                return;
            }
            let next = state[edge] + (event.key === 'ArrowLeft' ? -0.04 : 0.04);
            if (event.key === 'Home') next = edge === 'start' ? 0 : state.start + 0.01;
            if (event.key === 'End') next = edge === 'end' ? duration : state.end - 0.01;
            next = edge === 'start' ? Math.min(next, state.end - 0.01) : Math.max(next, state.start + 0.01);
            publish({ ...state, [edge]: Math.round(next * 100) / 100 }, true, edge);
        });
        listen(host.querySelector('[data-play]'), 'click', async () => {
            if (selectedPlayback) { selectedPlayback = false; video.pause(); render(); return; }
            delete host.dataset.activePreview;
            video.currentTime = state.start;
            video.playbackRate = 1;
            selectedPlayback = true;
            try { await video.play(); } catch (_) { selectedPlayback = false; }
            render();
        });
        listen(video, 'timeupdate', () => {
            renderPlayhead();
            if (selectedPlayback && video.currentTime >= state.end) {
                selectedPlayback = false;
                video.pause();
                video.currentTime = state.end;
                render();
            }
        });
        listen(video, 'seeked', () => renderPlayhead());
        listen(video, 'pause', () => { selectedPlayback = false; render(); });
        listen(video, 'loadedmetadata', () => {
            duration = Number.isFinite(video.duration) ? video.duration : 0;
            state = normalizeValue(state.end > 0 ? state : options.value);
            render();
            options.onChange?.({ ...state });
        });
        render();
        if (duration) options.onChange?.({ ...state });
        return {
            update(value, nextStage) {
                stage = nextStage || stage;
                if (!drag && !host.contains(document.activeElement)) state = normalizeValue(value);
                render();
            },
            destroy() {
                controller.abort();
                referenceObserver.disconnect();
                for (const { container, label } of referenceLabels.values()) {
                    container.classList.remove('sai-region-reference-input');
                    label.remove();
                }
                if (drag && track.hasPointerCapture(drag.pointerId)) track.releasePointerCapture(drag.pointerId);
                if (selectedPlayback) video.pause();
                for (const { player } of Object.values(previews)) {
                    player.pause();
                    player.removeAttribute('src');
                    player.load();
                }
                host.remove();
            },
        };
    }

    let mounted = null;
    let currentStage = {};
    let observer = null;
    let observedSource = null;
    let parameterObserver = null;
    let observedParameters = null;
    let scheduled = false;
    let lastSourceKey = '';
    let selection = null;
    let selectionOwner = '';
    let writing = false;
    const lifecycle = typeof document !== 'undefined' ? new AbortController() : null;
    function owner(stage) {
        return JSON.stringify([stage.__scene_theme_preset || stage.__preset || '',
            stage.__scene_theme || '', stage.__scene_theme_revision || 0]);
    }
    function bridge(id) { return document.getElementById(id)?.querySelector('input[type="number"], textarea, input'); }
    function write(id, value) {
        const container = document.getElementById(id);
        if (!container) return;
        container.classList.add('sai-region-bridge');
        const props = currentStage.__scene_control_props?.[id] || {};
        const inputs = [...container.querySelectorAll('input[type="range"], input[type="number"]')]
            .sort((a, b) => Number(b.type === 'range') - Number(a.type === 'range'));
        for (const input of inputs) {
            for (const [attr, prop] of [['min', 'minimum'], ['max', 'maximum'], ['step', 'step']]) {
                if (props[prop] !== undefined) input[attr] = props[prop];
            }
            if (Number(input.value) === value) continue;
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, String(value));
            input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
            input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        }
    }
    function writeSelection(ids) {
        if (!selection) return;
        writing = true;
        try { ['start', 'end', 'factor'].forEach((key, i) => write(ids[i], selection[key])); }
        finally { writing = false; }
    }
    function applySubmitValues(args, indices) {
        if (!selection || !currentStage.__scene_temporal_region_control?.source) return args;
        const config = currentStage.__scene_temporal_region_control;
        for (const key of ['start', 'end', 'factor']) {
            const index = indices[config[`${key}_control`]];
            if (Number.isInteger(index)) args[index] = selection[key];
        }
        return args;
    }
    function unmount() {
        if (!mounted) return;
        mounted.control.destroy();
        mounted.ids.forEach(id => document.getElementById(id)?.classList.remove('sai-region-bridge'));
        mounted.source.classList.remove('sai-region-source');
        mounted = null;
    }
    function syncSceneControl(stage) {
        currentStage = stage || {};
        const config = currentStage.__scene_temporal_region_control || {};
        const nextOwner = owner(currentStage);
        if (!config.source || nextOwner !== selectionOwner) {
            unmount();
            selection = null;
            selectionOwner = nextOwner;
            lastSourceKey = '';
        }
        const source = config.source && document.getElementById(config.source);
        const parameters = config.source && document.getElementById('scene_advanced_parameters_accordion');
        const scheduleSync = () => {
            if (scheduled) return;
            scheduled = true;
            queueMicrotask(() => { scheduled = false; syncSceneControl(currentStage); });
        };
        if (parameters !== observedParameters) {
            parameterObserver?.disconnect();
            observedParameters = parameters;
            if (parameters) {
                parameterObserver = new MutationObserver(scheduleSync);
                parameterObserver.observe(parameters, { childList: true, subtree: true });
            }
        }
        if (source !== observedSource) {
            observer?.disconnect();
            observedSource = source;
            if (source) {
                observer = new MutationObserver(scheduleSync);
                observer.observe(source, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
            }
        }
        if (!source) { unmount(); return false; }
        const sourceVideo = source.querySelector('video');
        const empty = !sourceVideo;
        const video = sourceVideo || (mounted?.empty && mounted.source === source
            ? mounted.video : document.createElement('video'));
        const rawKey = video.getAttribute('src') || video.querySelector('source')?.src || video.currentSrc;
        const key = rawKey ? new URL(rawKey, document.baseURI).href : '';
        const ids = [config.start_control, config.end_control, config.factor_control];
        const defaults = currentStage.__scene_defaults || {};
        const value = selection || {
            start: Number(bridge(ids[0])?.value ?? defaults[ids[0]] ?? 0),
            end: Number(bridge(ids[1])?.value ?? defaults[ids[1]] ?? 1),
            factor: Number(bridge(ids[2])?.value ?? defaults[ids[2]] ?? 2),
        };
        if (mounted && mounted.video === video && mounted.key === key
                && mounted.ids.join() === ids.join()) {
            mounted.control.update(value, currentStage);
            writeSelection(ids);
            return true;
        }
        const changedSource = key && lastSourceKey && lastSourceKey !== key;
        if (key) lastSourceKey = key;
        unmount();
        if (changedSource) { value.start = 0; value.end = Math.min(1, video.duration || 1); }
        selection = { ...value };
        const host = document.createElement('div');
        source.after(host);
        ids.forEach(id => document.getElementById(id)?.classList.add('sai-region-bridge'));
        source.classList.add('sai-region-source');
        const control = create(host, video, {
            stage: currentStage, value, contextSlowSeconds: config.context_slow_seconds,
            referenceControls: config.reference_controls,
            getTiming: () => sourceTiming(config.source, video),
            onChange(next, commit = true) {
                selection = { ...next };
                if (commit) writeSelection(ids);
            },
        });
        mounted = { source, video, key, ids, control, empty };
        writeSelection(ids);
        return true;
    }
    function dispose() {
        lifecycle?.abort();
        observer?.disconnect();
        parameterObserver?.disconnect();
        unmount();
        currentStage = {};
    }
    const api = { normalize, contextRange, boundaryPreviews, captureReference, create, syncSceneControl, applySubmitValues, dispose };
    root.SimpAIVideoRegionSelector = api;
    if (typeof module !== 'undefined') module.exports = api;
    if (typeof document !== 'undefined') {
        document.addEventListener('change', event => {
            if (writing || !mounted) return;
            if (event.target.closest('#resolution_source_meta')) {
                syncSceneControl(currentStage);
                return;
            }
            const index = mounted.ids.findIndex(id => event.target.closest(`#${id}`));
            if (index < 0) return;
            const value = Number(event.target.value);
            if (!Number.isFinite(value)) return;
            selection = { ...selection, [['start', 'end', 'factor'][index]]: value };
            syncSceneControl(currentStage);
        }, { signal: lifecycle.signal });
        root.setTimeout(() => syncSceneControl(root.simpleaiTopbarSystemParams || {}), 0);
    }
})(typeof window === 'undefined' ? globalThis : window);
