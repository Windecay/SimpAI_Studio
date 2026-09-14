(function (root) {
    'use strict';
    const MAX_BYTES = 2000000;
    const clone = value => JSON.parse(JSON.stringify(value));
    const sourceKeys = ['digest', 'width', 'height', 'fps', 'total'];
    const windowKeys = ['first', 'last', 'begin', 'stop', 'input_frames'];
    const requests = new Map();
    const notifyRequests = () => root.dispatchEvent?.(new Event('sai-face-track-state'));

    function selectionWindow(source, selection) {
        const round = value => {
            const floor = Math.floor(value);
            return value - floor === .5 ? floor + floor % 2 : Math.round(value);
        };
        const begin = Math.min(source.total - 1, round(selection.start * source.fps));
        const stop = Math.min(source.total, Math.max(begin + 1, round(selection.end * source.fps)));
        const context = Math.max(1, round(.75 / selection.factor * source.fps));
        const first = Math.max(0, begin - context), last = Math.min(source.total, stop + context);
        return { first, last, begin, stop, input_frames: Math.max(last - first, Math.ceil(source.fps / (24 * selection.factor))) };
    }

    function matchesSelection(data, selection, target) {
        const window = selectionWindow(data.source, selection);
        return data.target_id === target && windowKeys.every(key => data.window[key] === window[key]);
    }

    function validate(value, expected, complete = false) {
        if (typeof value === 'string') {
            if (value.length > MAX_BYTES) throw new Error('Invalid Face Track JSON');
            try { value = JSON.parse(value); } catch (_) { throw new Error('Invalid Face Track JSON'); }
        }
        const data = value, s = data?.source, w = data?.window;
        if (data?.version !== 1 || data.type !== 'h3_face_track' || !s || !w
                || !/^[a-f0-9]{64}$/.test(s.digest) || !Number.isFinite(s.fps) || s.fps <= 0
                || !['width', 'height', 'total'].every(k => Number.isInteger(s[k]) && s[k] > 0)
                || !windowKeys.every(k => Number.isInteger(w[k]) && w[k] >= 0)
                || !(w.first <= w.begin && w.begin < w.stop && w.stop <= w.last && w.last <= s.total)
                || w.input_frames < w.last - w.first || w.input_frames > 1800
                || !Number.isInteger(data.target_id) || data.target_id < 0 || data.target_id > 99
                || !Array.isArray(data.boxes) || data.boxes.length !== w.input_frames) {
            throw new Error('Invalid Face Track JSON');
        }
        if (expected && (data.target_id !== expected.target_id
                || sourceKeys.some(k => s[k] !== expected.source[k])
                || windowKeys.some(k => w[k] !== expected.window[k]))) {
            throw new Error('Face Track Source Changed');
        }
        for (const key of ['scene_starts', 'skipped_frames']) {
            const list = data[key];
            if (!Array.isArray(list) || list.some((n, i) => !Number.isInteger(n) || n < 0
                    || n >= data.boxes.length || i && n <= list[i - 1])) throw new Error('Invalid Face Track JSON');
        }
        if (data.scene_starts[0] !== 0) throw new Error('Invalid Face Track JSON');
        const validBox = box => Array.isArray(box) && box.length === 4 && box.every(Number.isFinite)
            && box[0] >= 0 && box[1] >= 0 && box[2] <= s.width && box[3] <= s.height
            && box[2] - box[0] >= 2 && box[3] - box[1] >= 2;
        const saved = data.saved_frames ?? [];
        if (!Array.isArray(saved) || saved.length > 20000 || saved.some((record, i) =>
            !Array.isArray(record) || record.length !== 3 || !Number.isInteger(record[0])
            || record[0] < 0 || record[0] >= s.total || i > 0 && record[0] <= saved[i - 1][0]
            || typeof record[2] !== 'boolean' || record[1] !== null && !validBox(record[1]))) {
            throw new Error('Invalid saved face track frames.');
        }
        const skipped = new Set(data.skipped_frames);
        data.boxes.forEach((box, i) => {
            if (box === null) {
                if (complete && i >= w.begin - w.first && i < w.stop - w.first && !skipped.has(i)) {
                    throw new Error('Face Track Has Unreviewed Frames');
                }
            } else if (!Array.isArray(box) || box.length !== 4 || !box.every(Number.isFinite)
                    || box[0] < 0 || box[1] < 0 || box[2] > s.width || box[3] > s.height
                    || box[2] - box[0] < 2 || box[3] - box[1] < 2) {
                throw new Error('Invalid Face Track Box');
            }
        });
        if (complete && !data.boxes.some((box, i) => box && !skipped.has(i)
                && i >= w.begin - w.first && i < w.stop - w.first)) {
            throw new Error('No Face Boxes in Interval');
        }
        return clone(data);
    }

    function setBox(data, index, box, skip = false) {
        if (!Number.isInteger(index) || index < 0 || index >= data.boxes.length) throw new Error('Invalid Face Track Box');
        data.boxes[index] = box === null ? null : [...box];
        data.skipped_frames = data.skipped_frames.filter(n => n !== index);
        if (skip) data.skipped_frames.push(index);
        data.skipped_frames.sort((a, b) => a - b);
    }

    function copyPrevious(data, index) {
        if (index <= 0 || !data.boxes[index - 1]) return false;
        setBox(data, index, data.boxes[index - 1]);
        return true;
    }

    function toggleOriginal(data, index) {
        if (!Number.isInteger(index) || index < 0 || index >= data.boxes.length) throw new Error('Invalid Face Track Box');
        if (data.skipped_frames.includes(index)) data.skipped_frames = data.skipped_frames.filter(n => n !== index);
        else data.skipped_frames = [...data.skipped_frames, index].sort((a, b) => a - b);
    }

    function requestTrack(payload, signal, onProgress = () => {}) {
        return new Promise((resolve, reject) => {
            const input = document.querySelector('#face_target_request textarea, #face_target_request input');
            const result = document.querySelector('#face_target_result textarea, #face_target_result input');
            const button = document.querySelector('#face_target_trigger button') || document.getElementById('face_target_trigger');
            const cancel = document.querySelector('#face_target_cancel button') || document.getElementById('face_target_cancel');
            if (!input || !result || !button || !cancel) return reject(new Error('Face preview controls are unavailable. Restart Studio and refresh the page.'));
            const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
            let poll, trigger, started = false, settled = false, cancelling = false;
            const finish = (error, data) => {
                if (settled) return;
                settled = true;
                clearInterval(poll);
                clearTimeout(trigger);
                signal.removeEventListener('abort', abort);
                requests.delete(id); notifyRequests();
                error ? reject(error) : resolve(data);
            };
            const abort = () => {
                if (!started) return finish(new DOMException('Aborted', 'AbortError'));
                cancelling = true;
                const state = { stage: 'Face Track Cancelling', percent: requests.get(id)?.percent ?? 0, completed: 0, total: 0 };
                requests.set(id, state); onProgress(state); notifyRequests();
                cancel.click();
            };
            signal.addEventListener('abort', abort, { once: true });
            if (signal.aborted) return abort();
            const proto = input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
            Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, JSON.stringify({ ...payload, id }));
            input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
            input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
            requests.set(id, { stage: 'Face Track Reading Source', percent: 0, completed: 0, total: 0 });
            notifyRequests();
            const expires = Date.now() + (payload.mode === 'track_blank' ? 65000 : 605000);
            poll = setInterval(() => {
                if (Date.now() > expires) return finish(new Error('Face preview timed out'));
                let data;
                try { data = JSON.parse(result.value); } catch (_) { return; }
                if (data.id !== id) return;
                if (data.done !== true) {
                    if (!cancelling && data.progress && Number.isFinite(data.progress.percent)) {
                        const state = { ...data.progress, percent: Math.min(99, Math.max(0, data.progress.percent)) };
                        requests.set(id, state); onProgress(state); notifyRequests();
                    }
                    return;
                }
                if (signal.aborted) return finish(new DOMException('Aborted', 'AbortError'));
                if (!data.ok) return finish(new Error(data.error || 'Face preview failed'));
                try {
                    const track = validate(data.track);
                    onProgress({ stage: 'Face Track Complete', percent: 100, completed: 1, total: 1 });
                    finish(null, track);
                } catch (error) { finish(error); }
            }, 150);
            trigger = setTimeout(() => { if (!signal.aborted) { started = true; button.click(); } }, 0);
        });
    }

    function open(host, sourceVideo, options) {
        const stage = options.stage;
        const t = key => String(stage.__lang || 'en').toLowerCase().startsWith('en')
            ? key : (root.localization?.[key] || key);
        const controller = new AbortController();
        const listen = (el, event, fn, opts = {}) => el.addEventListener(event, fn, { ...opts, signal: controller.signal });
        const dialog = document.createElement('dialog');
        dialog.className = 'sai-face-editor';
        const tool = (action, icon, title) => `<button type="button" data-track-action="${action}" title="${t(title)}" aria-label="${t(title)}"><i class="fa-solid fa-${icon}" aria-hidden="true"></i></button>`;
        dialog.innerHTML = `
            <header><strong>${t('Edit Face Track')}</strong>${tool('close', 'xmark', 'Close')}</header>
            <div class="sai-face-editor-tools">
                ${tool('detect', 'crosshairs', 'Track Selected Face')}
                ${tool('blank', 'square-plus', 'Create Manual Face Track')}
                ${tool('copy', 'copy', 'Use Previous Frame')}
                ${tool('clear', 'eraser', 'Clear Current Face Box')}
                ${tool('skip', 'eye-slash', 'Keep Original Frame')}
                ${tool('undo', 'rotate-left', 'Undo')}${tool('redo', 'rotate-right', 'Redo')}
                ${tool('missing', 'triangle-exclamation', 'Next Unreviewed Frame')}
                ${tool('json', 'code', 'Face Track JSON')}
                ${tool('import', 'upload', 'Import Face Track JSON')}
                ${tool('export', 'download', 'Export Face Track JSON')}
                <input data-track-file type="file" accept=".json,application/json" hidden>
                <div class="sai-face-editor-view">
                    <div role="group" aria-label="${t('View Mode')}">
                        ${tool('edit', 'vector-square', 'Edit Face Box')}${tool('pan', 'hand', 'Pan View')}
                    </div>
                    ${tool('zoom-out', 'magnifying-glass-minus', 'Zoom Out')}
                    <input data-track-zoom type="number" min="10" max="800" step="10" aria-label="${t('Zoom (%)')}">
                    ${tool('zoom-in', 'magnifying-glass-plus', 'Zoom In')}
                    ${tool('fit', 'expand', 'Fit to Window')}
                </div>
            </div>
            <div class="sai-face-editor-media"><div class="sai-face-editor-stage"><div class="sai-face-editor-image">
                <video muted playsinline preload="auto"></video><canvas></canvas>
            </div></div></div>
            <textarea data-track-json spellcheck="false" hidden aria-label="${t('Face Track JSON')}"></textarea>
            <div class="sai-face-editor-timeline">
                ${tool('previous', 'backward-step', 'Previous Frame')}${tool('play', 'play', 'Play')}
                ${tool('next', 'forward-step', 'Next Frame')}
                <label>${t('Source Frame')} <input data-track-frame type="number" min="1" step="1"></label>
                <output data-track-frame-state></output>
                <input data-track-seek type="range" min="0" step="1" aria-label="${t('Source Frame')}">
            </div>
            <div class="sai-face-editor-progress" hidden><progress data-track-progress max="100" value="0" aria-label="${t('Face Track Progress')}"></progress><output data-track-progress-text></output></div>
            <footer><output data-track-status role="status"></output><button type="button" data-track-action="apply"><i class="fa-solid fa-check" aria-hidden="true"></i> ${t('Apply Face Track')}</button></footer>`;
        host.append(dialog);
        dialog.showModal();
        const video = dialog.querySelector('video');
        const canvas = dialog.querySelector('canvas');
        const media = dialog.querySelector('.sai-face-editor-media');
        const mediaStage = dialog.querySelector('.sai-face-editor-stage');
        const mediaImage = dialog.querySelector('.sai-face-editor-image');
        const zoomField = dialog.querySelector('[data-track-zoom]');
        const json = dialog.querySelector('[data-track-json]');
        const frameField = dialog.querySelector('[data-track-frame]');
        const seek = dialog.querySelector('[data-track-seek]');
        const status = dialog.querySelector('[data-track-status]');
        const button = action => dialog.querySelector(`[data-track-action="${action}"]`);
        let data = null, expected = null, index = 0, busy = false, dirty = false, dragging = null;
        let jsonMode = false, beforeJSON = '', history = [], future = [], raf = 0, videoFrame = 0;
        let viewScale = 1, fitted = true, panMode = false, spaceDown = false, panning = null;
        let operation = null, closing = false, applied = false;
        const firstFrame = () => data.window.begin - data.window.first;
        const lastFrame = () => data.window.stop - data.window.first - 1;
        const source = sourceVideo.currentSrc || sourceVideo.getAttribute('src');
        video.src = source;
        if (sourceVideo.crossOrigin) video.crossOrigin = sourceVideo.crossOrigin;
        function message(key, error = false) {
            status.textContent = t(key);
            status.dataset.error = String(error);
        }
        function current() {
            if (!options.isCurrent()) throw new Error('Face Track Source Changed');
        }
        function checkpoint(before = JSON.stringify(data)) {
            history.push(before);
            if (history.length > 50) history.shift();
            future = [];
            dirty = true;
        }
        function draw() {
            if (!data || controller.signal.aborted) return;
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const box = data.boxes[index];
            if (!box || data.skipped_frames.includes(index)) return;
            const unit = canvas.width / Math.max(1, canvas.getBoundingClientRect().width);
            ctx.strokeStyle = ctx.fillStyle = getComputedStyle(canvas).color;
            ctx.lineWidth = 2 * unit;
            ctx.strokeRect(box[0], box[1], box[2] - box[0], box[3] - box[1]);
            for (const x of [box[0], box[2]]) for (const y of [box[1], box[3]]) {
                ctx.fillRect(x - 4 * unit, y - 4 * unit, 8 * unit, 8 * unit);
            }
        }
        function viewCursor() {
            media.dataset.pan = String(panMode || spaceDown);
            media.dataset.panning = String(Boolean(panning));
        }
        function layoutView() {
            if (media.hidden) return;
            const sourceWidth = data?.source.width || video.videoWidth, sourceHeight = data?.source.height || video.videoHeight;
            if (!sourceWidth || !sourceHeight) return;
            const width = sourceWidth * viewScale, height = sourceHeight * viewScale;
            mediaImage.style.width = `${width}px`;
            mediaImage.style.height = `${height}px`;
            mediaStage.style.width = `${Math.max(media.clientWidth, width)}px`;
            mediaStage.style.height = `${Math.max(media.clientHeight, height)}px`;
            zoomField.value = String(Math.round(viewScale * 100));
            draw();
        }
        function fitView() {
            if (media.hidden) return;
            const width = data?.source.width || video.videoWidth, height = data?.source.height || video.videoHeight;
            if (!width || !height) return;
            fitted = true;
            viewScale = Math.min(1, media.clientWidth / width, media.clientHeight / height);
            layoutView();
            media.scrollLeft = media.scrollTop = 0;
        }
        function zoomTo(scale, clientX, clientY) {
            if (!data || busy || jsonMode || dragging || panning) return;
            const viewport = media.getBoundingClientRect(), before = canvas.getBoundingClientRect();
            const x = clientX ?? viewport.left + media.clientWidth / 2;
            const y = clientY ?? viewport.top + media.clientHeight / 2;
            const nx = Math.max(0, Math.min(1, (x - before.left) / before.width));
            const ny = Math.max(0, Math.min(1, (y - before.top) / before.height));
            viewScale = Math.max(.1, Math.min(8, Number(scale) || viewScale));
            fitted = false;
            layoutView();
            const after = canvas.getBoundingClientRect();
            media.scrollLeft += after.left + nx * after.width - x;
            media.scrollTop += after.top + ny * after.height - y;
        }
        function render() {
            options.onState?.({ busy, dirty, open: !controller.signal.aborted });
            for (const action of ['copy', 'clear', 'skip', 'undo', 'redo', 'missing', 'json', 'import', 'export', 'apply', 'previous', 'next', 'play']) {
                button(action).disabled = busy || !data;
            }
            button('detect').disabled = busy;
            button('blank').disabled = busy;
            frameField.disabled = seek.disabled = busy || !data;
            for (const action of ['edit', 'pan', 'zoom-in', 'zoom-out', 'fit']) {
                button(action).disabled = busy || !data || jsonMode;
            }
            zoomField.disabled = busy || !data || jsonMode;
            button('edit').setAttribute('aria-pressed', String(!panMode));
            button('pan').setAttribute('aria-pressed', String(panMode));
            if (!data) return;
            try { validate(data, expected, true); } catch (_) { button('apply').disabled = true; }
            button('copy').disabled ||= index === 0 || !data.boxes[index - 1] || jsonMode;
            button('undo').disabled ||= !history.length || jsonMode;
            button('redo').disabled ||= !future.length || jsonMode;
            for (const action of ['clear', 'skip', 'missing']) button(action).disabled ||= jsonMode;
            button('previous').disabled ||= index === firstFrame();
            button('next').disabled ||= index >= lastFrame();
            frameField.min = data.window.begin + 1;
            frameField.max = data.window.stop;
            frameField.value = data.window.first + index + 1;
            seek.min = firstFrame();
            seek.max = lastFrame();
            seek.value = index;
            const skipped = data.skipped_frames.includes(index);
            button('skip').setAttribute('aria-pressed', String(skipped));
            button('skip').title = button('skip').ariaLabel = t(skipped
                ? data.boxes[index] ? 'Restore Face Box' : 'Cancel Keep Original Frame' : 'Keep Original Frame');
            button('skip').querySelector('i').className = `fa-solid fa-${skipped ? 'eye' : 'eye-slash'}`;
            dialog.querySelector('[data-track-frame-state]').textContent = t(
                skipped ? 'Original Frame Kept' : data.boxes[index] ? 'Face Box Present' : 'Face Box Missing');
            button('play').querySelector('i').className = `fa-solid fa-${video.paused ? 'play' : 'pause'}`;
            button('play').title = button('play').ariaLabel = t(video.paused ? 'Play' : 'Pause');
            draw();
        }
        function go(value) {
            if (!data || busy) return;
            video.pause();
            index = Math.max(firstFrame(), Math.min(lastFrame(), Math.round(Number(value) || 0)));
            const frame = Math.min(data.source.total - 1, data.window.first + index);
            video.currentTime = frame / data.source.fps + Math.min(.001, .1 / data.source.fps);
            render();
        }
        function refresh(next) {
            data = next;
            canvas.width = data.source.width;
            canvas.height = data.source.height;
            json.value = JSON.stringify(data, null, 2);
            index = Math.max(firstFrame(), Math.min(index, lastFrame()));
            fitted ? fitView() : layoutView();
            render();
        }
        async function load(mode, stored = '') {
            if (busy) return;
            if (mode === 'track_blank' && dirty && !root.confirm(t('Discard Unsaved Face Track Changes?'))) return;
            if (mode === 'track' && data?.needs_target_confirmation
                    && !root.confirm(t('Confirm Target Face in New Interval'))) return;
            busy = true;
            operation = new AbortController();
            const progress = dialog.querySelector('[data-track-progress]');
            progress.parentElement.hidden = false;
            progress.value = 0;
            dialog.querySelector('[data-track-progress-text]').textContent = '0%';
            message(mode === 'track' ? 'Tracking Selected Face' : 'Reading Face Track Source');
            render();
            try {
                current();
                const value = await requestTrack({ ...options.request, mode,
                    track_json: data ? JSON.stringify(data) : stored,
                    confirm_target: mode === 'track' && Boolean(data?.needs_target_confirmation) },
                operation.signal, value => {
                    progress.value = value.percent;
                    dialog.querySelector('[data-track-progress-text]').textContent = `${value.percent}%${value.total > 1 ? ` (${value.completed}/${value.total})` : ''}`;
                    message(value.stage);
                });
                current();
                expected = validate(value);
                refresh(expected);
                history = []; future = []; dirty = !stored || JSON.stringify(validate(stored)) !== JSON.stringify(expected);
                jsonMode = false; json.hidden = true; media.hidden = false;
                index = firstFrame();
                fitted ? fitView() : layoutView();
                let missing = data.boxes.filter((box, i) => i >= firstFrame() && i <= lastFrame()
                    && box === null && !data.skipped_frames.includes(i)).length;
                message(data.needs_target_confirmation ? 'New Interval Requires Target Confirmation'
                    : missing ? 'Face Track Has Unreviewed Frames' : 'Face Track Ready');
            } catch (error) {
                if (error.name !== 'AbortError') message(error.message, true);
            } finally {
                busy = false;
                operation = null;
                render();
                if (closing) return close(true);
                if (data && !controller.signal.aborted) go(index);
            }
        }
        function edit(fn) {
            if (!data || busy || jsonMode) return;
            video.pause();
            checkpoint();
            fn();
            json.value = JSON.stringify(data, null, 2);
            message('Face Track Modified');
            render();
        }
        function readJSON() {
            if (!jsonMode) return;
            const next = validate(json.value, expected);
            if (JSON.stringify(next) !== beforeJSON) checkpoint();
            refresh(next);
        }
        function close(force = false) {
            if (busy) {
                closing = true;
                operation?.abort();
                return;
            }
            if (!force && dirty && !root.confirm(t('Discard Unsaved Face Track Changes?'))) return;
            controller.abort();
            cancelAnimationFrame(raf);
            if (videoFrame && video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(videoFrame);
            video.pause();
            video.removeAttribute('src');
            video.load();
            dialog.close();
            dialog.remove();
            options.onState?.({ busy: false, dirty: false, open: false, applied });
        }
        listen(dialog, 'cancel', event => { event.preventDefault(); close(); });
        listen(dialog, 'click', async event => {
            const action = event.target.closest('[data-track-action]')?.dataset.trackAction;
            if (!action) return;
            try {
                if (action === 'close') return close();
                if (action === 'detect') return load('track');
                if (action === 'blank') return load('track_blank');
                if (busy || !data) return;
                current();
                if (action === 'copy') edit(() => copyPrevious(data, index));
                if (action === 'clear') edit(() => setBox(data, index, null));
                if (action === 'skip') edit(() => toggleOriginal(data, index));
                if (action === 'edit' || action === 'pan') { panMode = action === 'pan'; viewCursor(); }
                if (action === 'zoom-in') zoomTo(viewScale * 1.25);
                if (action === 'zoom-out') zoomTo(viewScale / 1.25);
                if (action === 'fit') fitView();
                if (action === 'previous') go(index - 1);
                if (action === 'next') go(index + 1);
                if (action === 'missing') {
                    const missing = data.boxes.map((box, i) => i >= firstFrame() && i <= lastFrame()
                        && box === null && !data.skipped_frames.includes(i) ? i : -1).filter(i => i >= 0);
                    if (missing.length) go(missing.find(i => i > index) ?? missing[0]);
                    else message('All Face Track Frames Reviewed');
                }
                if (action === 'play') {
                    if (video.paused) { if (index === lastFrame()) go(firstFrame()); await video.play(); }
                    else video.pause();
                    render();
                }
                if (action === 'undo' && history.length) {
                    future.push(JSON.stringify(data)); refresh(JSON.parse(history.pop())); dirty = true;
                }
                if (action === 'redo' && future.length) {
                    history.push(JSON.stringify(data)); refresh(JSON.parse(future.pop())); dirty = true;
                }
                if (action === 'json') {
                    if (jsonMode) readJSON();
                    else { video.pause(); json.value = JSON.stringify(data, null, 2); beforeJSON = JSON.stringify(data); }
                    jsonMode = !jsonMode;
                    json.hidden = !jsonMode; media.hidden = jsonMode;
                    button('json').setAttribute('aria-pressed', String(jsonMode));
                    if (!jsonMode) fitted ? fitView() : layoutView();
                }
                if (action === 'import') dialog.querySelector('[data-track-file]').click();
                if (action === 'export') {
                    readJSON();
                    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
                    const a = document.createElement('a');
                    a.href = url; a.download = `face-track-${data.target_id}.json`; a.click();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                }
                if (action === 'apply') {
                    readJSON();
                    const accepted = validate(data, expected, true);
                    options.onApply(JSON.stringify(accepted));
                    applied = true;
                    dirty = false;
                    close(true);
                }
                render();
            } catch (error) { message(error.message, true); }
        });
        listen(json, 'input', () => { dirty = true; });
        listen(dialog.querySelector('[data-track-file]'), 'change', async event => {
            const file = event.target.files[0];
            try {
                if (!file || file.size > MAX_BYTES) throw new Error('Invalid Face Track JSON');
                const next = validate(await file.text(), expected);
                if (controller.signal.aborted) return;
                current();
                checkpoint();
                refresh(next);
                message('Face Track Modified');
            } catch (error) { message(error.message, true); }
            event.target.value = '';
        });
        listen(frameField, 'change', () => go(Number(frameField.value) - data.window.first - 1));
        listen(seek, 'input', () => go(seek.value));
        listen(zoomField, 'change', () => zoomTo(Number(zoomField.value) / 100));
        listen(media, 'wheel', event => {
            if (!data || busy || jsonMode) return;
            event.preventDefault();
            event.stopPropagation();
            zoomTo(viewScale * Math.exp(-event.deltaY * (event.deltaMode === 1 ? 16 : 1) * .001),
                event.clientX, event.clientY);
        }, { passive: false });
        listen(dialog, 'keydown', event => {
            if (event.code !== 'Space' || event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
            event.preventDefault();
            spaceDown = true; viewCursor();
        });
        listen(dialog, 'keyup', event => { if (event.code === 'Space') { spaceDown = false; viewCursor(); } });
        listen(root, 'blur', () => {
            if (panning && media.hasPointerCapture(panning.id)) media.releasePointerCapture(panning.id);
            spaceDown = false; panning = null; viewCursor();
        });
        listen(media, 'pointerdown', event => {
            if (!data || busy || jsonMode || (event.button !== 1
                    && !(event.button === 0 && (panMode || spaceDown || event.altKey)))) return;
            panning = { id: event.pointerId, x: event.clientX, y: event.clientY,
                left: media.scrollLeft, top: media.scrollTop };
            media.setPointerCapture(event.pointerId);
            event.preventDefault(); event.stopPropagation(); viewCursor();
        }, { capture: true });
        listen(media, 'pointermove', event => {
            if (!panning || event.pointerId !== panning.id) return;
            media.scrollLeft = panning.left - (event.clientX - panning.x);
            media.scrollTop = panning.top - (event.clientY - panning.y);
        });
        const endPan = event => {
            if (!panning || event.pointerId !== panning.id) return;
            if (media.hasPointerCapture(event.pointerId)) media.releasePointerCapture(event.pointerId);
            panning = null; viewCursor();
        };
        listen(media, 'pointerup', endPan);
        listen(media, 'pointercancel', endPan);
        listen(media, 'auxclick', event => { if (event.button === 1) event.preventDefault(); });
        listen(video, 'seeked', render);
        listen(video, 'loadedmetadata', () => {
            fitted ? fitView() : layoutView();
            if (data) go(index);
            else video.currentTime = Math.min(options.request.start, Math.max(0, video.duration - .001));
        });
        listen(video, 'error', () => message('Face Preview Video Failed', true));
        const resize = new ResizeObserver(() => { fitted ? fitView() : layoutView(); });
        resize.observe(media);
        controller.signal.addEventListener('abort', () => resize.disconnect(), { once: true });
        function tick(_, metadata) {
            if (controller.signal.aborted) return;
            if (data && !video.paused && !video.seeking) {
                const frame = Math.floor((metadata?.mediaTime ?? video.currentTime) * data.source.fps + 1e-4);
                if (frame >= data.window.stop) go(lastFrame());
                else { index = Math.max(firstFrame(), frame - data.window.first); render(); }
            }
            if (video.requestVideoFrameCallback) videoFrame = video.requestVideoFrameCallback(tick);
            else raf = requestAnimationFrame(tick);
        }
        tick();
        function point(event) {
            const rect = canvas.getBoundingClientRect();
            return [Math.max(0, Math.min(canvas.width, (event.clientX - rect.left) / rect.width * canvas.width)),
                Math.max(0, Math.min(canvas.height, (event.clientY - rect.top) / rect.height * canvas.height))];
        }
        listen(canvas, 'pointerdown', event => {
            if (event.button !== 0 || !data || busy || video.seeking || video.readyState < 2) return;
            video.pause();
            const p = point(event), box = data.skipped_frames.includes(index) ? null : data.boxes[index];
            const radius = 12 * canvas.width / canvas.getBoundingClientRect().width;
            let corner = null;
            if (box) for (const x of [0, 2]) for (const y of [1, 3]) {
                if (Math.abs(p[0] - box[x]) < radius && Math.abs(p[1] - box[y]) < radius) corner = [x, y];
            }
            const inside = box && p[0] >= box[0] && p[0] <= box[2] && p[1] >= box[1] && p[1] <= box[3];
            dragging = { before: JSON.stringify(data), origin: p, box: box && [...box], corner, move: inside && !corner };
            canvas.setPointerCapture(event.pointerId);
            event.preventDefault();
        });
        listen(canvas, 'pointermove', event => {
            if (!dragging) return;
            const p = point(event), d = dragging;
            let box;
            if (d.corner) {
                box = [...d.box];
                box[d.corner[0]] = p[0]; box[d.corner[1]] = p[1];
            } else if (d.move) {
                const dx = Math.max(-d.box[0], Math.min(canvas.width - d.box[2], p[0] - d.origin[0]));
                const dy = Math.max(-d.box[1], Math.min(canvas.height - d.box[3], p[1] - d.origin[1]));
                box = [d.box[0] + dx, d.box[1] + dy, d.box[2] + dx, d.box[3] + dy];
            } else box = [d.origin[0], d.origin[1], p[0], p[1]];
            box = [Math.min(box[0], box[2]), Math.min(box[1], box[3]), Math.max(box[0], box[2]), Math.max(box[1], box[3])];
            if (box[2] - box[0] >= 2 && box[3] - box[1] >= 2) {
                setBox(data, index, box.map(v => Math.round(v * 1000) / 1000));
                draw();
            }
        });
        listen(canvas, 'pointerup', () => {
            if (!dragging) return;
            if (JSON.stringify(data) !== dragging.before) {
                checkpoint(dragging.before);
                json.value = JSON.stringify(data, null, 2);
                message('Face Track Modified');
            }
            dragging = null; render();
        });
        listen(canvas, 'pointercancel', () => {
            if (dragging) refresh(JSON.parse(dragging.before));
            dragging = null;
        });
        render();
        load(options.stored ? 'track_rebase' : 'track', options.stored);
        return { destroy: () => close(true), updateTheme: draw };
    }
    const api = { validate, setBox, copyPrevious, toggleOriginal, selectionWindow, matchesSelection, requestTrack, open,
        isBusy: () => requests.size > 0, progress: () => [...requests.values()].at(-1) || null };
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.SimpAIFaceTrackEditor = api;
})(typeof window === 'object' ? window : globalThis);
