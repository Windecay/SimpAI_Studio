(function (root) {
    'use strict';

    const MAX_CLIENT_WAVEFORM_BYTES = 100 * 1024 * 1024;
    const DEFAULT_BUCKET_COUNT = 120;
    const sharedPeaksCache = new Map();
    const activeAudioElements = new Set();

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function isEnglishUi(langState) {
        try {
            if (langState && typeof langState.__lang === 'string') {
                return langState.__lang.trim().toLowerCase().startsWith('en');
            }
            if (root.SimpAII18n?.isEnglishUi) return !!root.SimpAII18n.isEnglishUi();
        } catch (_err) {}
        const lang = String(root.locale_lang || root.SIMPAI_MEDIA_LIBRARY_CONFIG?.lang || '').trim().toLowerCase();
        if (lang) return lang.startsWith('en');
        const paramsLang = String(root.simpleaiTopbarSystemParams?.__lang || '').trim().toLowerCase();
        return paramsLang ? paramsLang.startsWith('en') : true;
    }

    function tr(en, cn, langState) {
        return isEnglishUi(langState) ? en : cn;
    }

    function safeMediaUrl(rawUrl) {
        const text = String(rawUrl || '').trim();
        if (!text) return '';
        if (/^(?:javascript|vbscript|data:text):/i.test(text)) return '';
        return text;
    }

    function formatAudioTime(secondsValue) {
        const num = Number(secondsValue);
        const seconds = Number.isFinite(num) && num > 0 ? Math.floor(num) : 0;
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${String(secs).padStart(2, '0')}`;
    }

    function formatFileSize(bytesValue) {
        const bytes = Number(bytesValue || 0);
        if (!Number.isFinite(bytes) || bytes <= 0) return '';
        if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
        if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
        return `${Math.round(bytes)} B`;
    }

    function normalizePeaks(values, maxBars) {
        if (!Array.isArray(values) || !values.length) return [];
        const limit = Math.max(16, Math.min(Number(maxBars) || DEFAULT_BUCKET_COUNT, 180));
        const filtered = values
            .map((v) => Number(v))
            .filter((v) => Number.isFinite(v) && v >= 0);
        if (!filtered.length) return [];
        if (filtered.length <= limit) return filtered;
        const step = filtered.length / limit;
        const sampled = [];
        for (let i = 0; i < limit; i += 1) {
            const start = Math.floor(i * step);
            const stop = Math.max(start + 1, Math.floor((i + 1) * step));
            let peak = 0;
            for (let j = start; j < stop && j < filtered.length; j += 1) {
                if (filtered[j] > peak) peak = filtered[j];
            }
            sampled.push(peak);
        }
        return sampled;
    }

    function renderWaveformBarsHtml(values, maxBars) {
        const peaks = normalizePeaks(values, maxBars);
        if (!peaks.length) return '';
        return peaks
            .map((value) => `<i style="height:${Math.max(4, Math.min(100, Math.abs(Number(value)) * 100)).toFixed(2)}%"></i>`)
            .join('');
    }

    async function decodeAudioBlobPeaks(blob, bucketCount) {
        if (root.SimpAICanvasWorkbenchMediaHelpers?.createAudioWaveformPeaks) {
            return root.SimpAICanvasWorkbenchMediaHelpers.createAudioWaveformPeaks(blob, bucketCount);
        }
        const AudioContextCtor = root.AudioContext || root.webkitAudioContext;
        if (typeof AudioContextCtor !== 'function' || !blob || typeof blob.arrayBuffer !== 'function') {
            return [];
        }
        const count = Math.max(24, Math.min(Number(bucketCount) || DEFAULT_BUCKET_COUNT, 160));
        const context = new AudioContextCtor();
        try {
            const buffer = await blob.arrayBuffer();
            const audioBuffer = await context.decodeAudioData(buffer.slice(0));
            const channels = Math.max(1, Number(audioBuffer.numberOfChannels || 1));
            const totalSamples = Math.max(0, Number(audioBuffer.length || 0));
            if (!totalSamples) return [];
            const channelData = [];
            for (let ch = 0; ch < channels; ch += 1) {
                channelData.push(audioBuffer.getChannelData(ch));
            }
            const samplesPerBucket = Math.max(1, Math.ceil(totalSamples / count));
            const peaks = [];
            let maxPeak = 0;
            for (let bucket = 0; bucket < count; bucket += 1) {
                const start = bucket * samplesPerBucket;
                const stop = Math.min(totalSamples, start + samplesPerBucket);
                if (start >= stop) break;
                let peak = 0;
                const stride = Math.max(1, Math.floor((stop - start) / 64));
                for (let idx = start; idx < stop; idx += stride) {
                    let sample = 0;
                    for (let ch = 0; ch < channelData.length; ch += 1) {
                        sample = Math.max(sample, Math.abs(Number(channelData[ch][idx] || 0)));
                    }
                    if (sample > peak) peak = sample;
                }
                peaks.push(peak);
                if (peak > maxPeak) maxPeak = peak;
            }
            if (maxPeak <= 0) return peaks.map(() => 0.08);
            return peaks.map((p) => Number(Math.max(0.04, Math.min(1, p / maxPeak)).toFixed(4)));
        } catch (_err) {
            return [];
        } finally {
            try { await context.close(); } catch (_err) {}
        }
    }

    async function fetchWaveformPeaks(url, bucketCount, signal) {
        const cleanUrl = safeMediaUrl(url);
        if (!cleanUrl || typeof fetch !== 'function') return [];
        const cacheKey = `${cleanUrl}::${bucketCount || DEFAULT_BUCKET_COUNT}`;
        if (sharedPeaksCache.has(cacheKey)) {
            return sharedPeaksCache.get(cacheKey);
        }
        const promise = (async () => {
            try {
                const response = await fetch(cleanUrl, { signal, credentials: 'same-origin' });
                if (!response.ok) return [];
                const contentLength = Number(response.headers?.get?.('content-length') || 0);
                if (contentLength > MAX_CLIENT_WAVEFORM_BYTES) return [];
                const blob = await response.blob();
                if (!blob || blob.size > MAX_CLIENT_WAVEFORM_BYTES) return [];
                return await decodeAudioBlobPeaks(blob, bucketCount || DEFAULT_BUCKET_COUNT);
            } catch (_err) {
                return [];
            }
        })();
        sharedPeaksCache.set(cacheKey, promise);
        const values = await promise;
        if (!values.length) {
            sharedPeaksCache.delete(cacheKey);
        } else if (sharedPeaksCache.size > 160) {
            const oldest = sharedPeaksCache.keys().next().value;
            if (oldest) sharedPeaksCache.delete(oldest);
        }
        return values;
    }

    function pauseOtherAudioElements(currentAudio) {
        for (const other of Array.from(activeAudioElements)) {
            if (!other || other === currentAudio) continue;
            try { other.pause(); } catch (_err) {}
        }
        if (typeof document !== 'undefined' && document.querySelectorAll) {
            document.querySelectorAll('audio').forEach((node) => {
                if (node !== currentAudio && !node.paused) {
                    try { node.pause(); } catch (_err) {}
                }
            });
        }
    }

    function renderPlayerHtml(track, options = {}) {
        const item = track && typeof track === 'object' ? track : {};
        const langState = options.langState || null;
        const variant = options.variant === 'hero' ? ' is-hero' : (options.variant === 'compact' ? ' is-compact' : '');
        const url = safeMediaUrl(item.preview_url || item.media_url || item.url || '');
        if (!url) return '';
        const maxBars = options.variant === 'compact' ? 64 : DEFAULT_BUCKET_COUNT;
        const bars = renderWaveformBarsHtml(item.waveform, maxBars);
        const label = item.name || item.title || tr('Audio track', '音频曲目', langState);
        const initialDuration = formatAudioTime(item.duration);
        const preload = options.preload || 'metadata';
        const loopAttr = options.loop ? ' loop' : '';
        return [
            `<div class="sai-audio-player${variant}" data-sai-audio-player data-sai-max-bars="${maxBars}">`,
            `<audio src="${escapeHtml(url)}" preload="${escapeHtml(preload)}"${loopAttr} hidden></audio>`,
            `<button type="button" class="sai-audio-toggle-btn" data-sai-audio-toggle title="${escapeHtml(tr('Play', '播放', langState))}" aria-label="${escapeHtml(`${tr('Play', '播放', langState)} ${label}`)}" data-sai-audio-label="${escapeHtml(label)}"><i class="fa-solid fa-play fa" aria-hidden="true"></i></button>`,
            `<div class="sai-audio-wave-track">`,
            `<div class="sai-audio-wave-bars" data-sai-waveform${bars ? ' data-ready="true"' : ''} aria-hidden="true">${bars}</div>`,
            `<div class="sai-audio-wave-bars is-played" data-sai-waveform-played aria-hidden="true">${bars}</div>`,
            `<b class="sai-audio-wave-cursor" aria-hidden="true"></b>`,
            `<input type="range" data-sai-audio-seek min="0" max="1000" step="1" value="0" aria-label="${escapeHtml(`${tr('Seek', '定位', langState)} ${label}`)}">`,
            `</div>`,
            `<div class="sai-audio-footer">`,
            `<output class="sai-audio-time" data-sai-audio-time data-initial-duration="${escapeHtml(String(Number(item.duration) || 0))}">0:00 / ${initialDuration}</output>`,
            options.footerExtraHtml || '',
            `</div>`,
            `<span class="sai-audio-error" data-sai-audio-error role="status" hidden></span>`,
            `</div>`,
        ].join('');
    }

    function createController(host, options = {}) {
        const players = new Set();
        const controllers = new Set();
        let disposed = false;

        const getLangState = () => (typeof options.getLangState === 'function' ? options.getLangState() : options.langState);

        function releaseAudio(audio) {
            if (!audio) return;
            try {
                audio.pause();
                audio.removeAttribute('src');
                audio.load();
            } catch (_err) {}
            players.delete(audio);
            activeAudioElements.delete(audio);
        }

        async function ensureWaveform(player, audio, bars, played) {
            if (!bars || !played || bars.dataset.ready === 'true' || bars.dataset.loading === 'true' || disposed) {
                return;
            }
            const url = audio.currentSrc || audio.src || audio.getAttribute('src') || '';
            if (!url) return;
            bars.dataset.loading = 'true';
            const abortController = typeof AbortController === 'function' ? new AbortController() : null;
            if (abortController) controllers.add(abortController);
            try {
                const maxBars = Number(player.dataset.saiMaxBars) || DEFAULT_BUCKET_COUNT;
                const values = await fetchWaveformPeaks(url, maxBars, abortController?.signal);
                if (disposed || !bars.isConnected) return;
                const html = renderWaveformBarsHtml(values, maxBars);
                if (html) {
                    bars.innerHTML = html;
                    played.innerHTML = html;
                    bars.dataset.ready = 'true';
                }
            } finally {
                delete bars.dataset.loading;
                if (abortController) controllers.delete(abortController);
            }
        }

        function sync() {
            if (disposed || !host || !host.querySelectorAll) return;
            for (const audio of Array.from(players)) {
                if (!host.contains(audio)) releaseAudio(audio);
            }
            host.querySelectorAll('[data-sai-audio-player]').forEach((player) => {
                const audio = player.querySelector('audio');
                if (!audio || players.has(audio)) return;
                players.add(audio);
                activeAudioElements.add(audio);

                const toggle = player.querySelector('[data-sai-audio-toggle]');
                const seek = player.querySelector('[data-sai-audio-seek]');
                const output = player.querySelector('[data-sai-audio-time]');
                const error = player.querySelector('[data-sai-audio-error]');
                const bars = player.querySelector('[data-sai-waveform]');
                const played = player.querySelector('[data-sai-waveform-played]');
                let scrubbing = false;

                const resolveDuration = () => {
                    if (Number.isFinite(audio.duration) && audio.duration > 0) return audio.duration;
                    const fallback = Number(output?.dataset?.initialDuration || 0);
                    return Number.isFinite(fallback) && fallback > 0 ? fallback : 0;
                };

                const update = () => {
                    const langState = getLangState();
                    const duration = resolveDuration();
                    const current = Number.isFinite(audio.currentTime) ? Math.max(0, audio.currentTime) : 0;
                    const ratio = duration > 0 ? Math.max(0, Math.min(1, current / duration)) : 0;
                    player.style.setProperty('--sai-playhead', `${(ratio * 100).toFixed(3)}%`);
                    if (seek && !scrubbing) {
                        seek.value = String(Math.round(ratio * 1000));
                    }
                    if (seek) {
                        seek.disabled = !!audio.error;
                        seek.setAttribute('aria-valuetext', `${formatAudioTime(current)} / ${formatAudioTime(duration)}`);
                    }
                    if (output) {
                        output.textContent = `${formatAudioTime(current)} / ${formatAudioTime(duration)}`;
                    }
                    if (toggle) {
                        const actionText = audio.paused ? tr('Play', '播放', langState) : tr('Pause', '暂停', langState);
                        toggle.title = actionText;
                        toggle.setAttribute('aria-label', `${actionText} ${toggle.dataset.saiAudioLabel || ''}`.trim());
                        const icon = toggle.querySelector('i');
                        if (icon) {
                            icon.className = audio.paused ? 'fa-solid fa-play fa' : 'fa-solid fa-pause fa';
                        }
                    }
                };

                const play = async () => {
                    pauseOtherAudioElements(audio);
                    if (error) error.hidden = true;
                    if (typeof options.onPlay === 'function') {
                        try { options.onPlay(player, audio); } catch (_err) {}
                    }
                    try {
                        await audio.play();
                    } catch (failure) {
                        if (failure?.name !== 'AbortError' && !disposed && host.contains(audio) && error) {
                            error.textContent = tr('Audio could not be played.', '音频无法播放。', getLangState());
                            error.hidden = false;
                        }
                    }
                    if (disposed || !host.contains(audio)) {
                        try { audio.pause(); } catch (_err) {}
                    } else {
                        update();
                    }
                };

                if (toggle) {
                    toggle.addEventListener('click', (event) => {
                        event.stopPropagation();
                        if (audio.paused) {
                            if (audio.error) audio.load();
                            play();
                            ensureWaveform(player, audio, bars, played);
                        } else {
                            audio.pause();
                        }
                    });
                }

                if (seek) {
                    seek.addEventListener('click', (event) => event.stopPropagation());
                    seek.addEventListener('pointerdown', (event) => {
                        event.stopPropagation();
                        scrubbing = true;
                    });
                    const endScrub = () => {
                        scrubbing = false;
                        update();
                    };
                    seek.addEventListener('pointerup', endScrub);
                    seek.addEventListener('pointercancel', endScrub);
                    seek.addEventListener('lostpointercapture', endScrub);
                    seek.addEventListener('input', (event) => {
                        event.stopPropagation();
                        const duration = resolveDuration();
                        const ratio = Math.max(0, Math.min(1, Number(seek.value || 0) / 1000));
                        player.style.setProperty('--sai-playhead', `${(ratio * 100).toFixed(3)}%`);
                        if (duration > 0 && Number.isFinite(audio.duration) && audio.duration > 0) {
                            audio.currentTime = Math.min(audio.duration, audio.duration * ratio);
                        }
                        update();
                        if (audio.paused && (!Number.isFinite(audio.duration) || audio.currentTime < audio.duration)) {
                            play();
                            ensureWaveform(player, audio, bars, played);
                        }
                    });
                }

                ['timeupdate', 'durationchange', 'pause', 'ended', 'seeking', 'seeked'].forEach((eventName) => {
                    audio.addEventListener(eventName, update);
                });
                audio.addEventListener('play', () => {
                    pauseOtherAudioElements(audio);
                    update();
                });
                audio.addEventListener('loadedmetadata', () => {
                    update();
                    ensureWaveform(player, audio, bars, played);
                });
                audio.addEventListener('error', () => {
                    if (disposed || !host.contains(audio)) return;
                    if (error) {
                        error.textContent = tr('Audio could not be loaded.', '音频无法加载。', getLangState());
                        error.hidden = false;
                    }
                    update();
                });

                update();
                if (bars && bars.dataset.ready !== 'true' && options.eagerWaveform !== false) {
                    ensureWaveform(player, audio, bars, played);
                }
            });
        }

        return {
            sync,
            pauseAll() {
                for (const audio of Array.from(players)) {
                    try { audio.pause(); } catch (_err) {}
                }
            },
            dispose() {
                disposed = true;
                for (const ctrl of Array.from(controllers)) {
                    try { ctrl.abort(); } catch (_err) {}
                }
                controllers.clear();
                for (const audio of Array.from(players)) {
                    releaseAudio(audio);
                }
            },
        };
    }

    /* Main Studio Preview Row Audio Surface (#studio_audio_browser) */
    function createMainAudioSurface() {
        let controller = null;
        let currentItems = [];
        let selectedIndex = 0;
        let currentMode = ''; // 'post_generation' | 'browser' | ''
        let currentChoice = null;
        let loopEnabled = false;
        let renderedSignature = '';

        function getHost() {
            if (typeof document === 'undefined') return null;
            return document.getElementById('studio_audio_browser');
        }

        function getStage() {
            const host = getHost();
            if (!host) return null;
            let stage = host.querySelector('.sai-studio-audio-stage');
            if (!stage) {
                stage = document.createElement('div');
                stage.className = 'sai-studio-audio-stage';
                stage.hidden = true;
                host.appendChild(stage);
            }
            return stage;
        }

        function buildFilePreviewUrl(filePath) {
            const raw = String(filePath || '').trim();
            if (!raw) return '';
            if (/^(?:https?:\/\/|\/gradio_api\/file=|\/file=)/i.test(raw)) return raw;
            const normalized = raw.replace(/\\/g, '/');
            return `/file=${encodeURI(normalized).replace(/\?/g, '%3F').replace(/#/g, '%23')}`;
        }

        function normalizeTrackItem(rawItem, fallbackPath) {
            const source = rawItem && typeof rawItem === 'object' ? rawItem : {};
            const path = String(source.path || fallbackPath || '').trim();
            const normalizedPath = path.replace(/\\/g, '/');
            const name = String(source.name || normalizedPath.split('/').pop() || 'audio').trim();
            const extMatch = name.match(/\.([A-Za-z0-9]+)$/);
            const format = String(source.audio_format || source.format || (extMatch ? extMatch[1] : 'audio')).toUpperCase();
            const previewUrl = safeMediaUrl(source.preview_url || buildFilePreviewUrl(path));
            const downloadUrl = safeMediaUrl(source.download_url || previewUrl);
            return {
                path,
                name,
                format,
                preview_url: previewUrl,
                download_url: downloadUrl,
                size: Number(source.size || 0),
                duration: Number(source.duration || 0),
                waveform: Array.isArray(source.waveform) ? source.waveform : [],
            };
        }

        function computeChoiceFromPath(filePath, fallbackChoice) {
            if (fallbackChoice) return fallbackChoice;
            const parts = String(filePath || '').replace(/\\/g, '/').split('/').filter(Boolean);
            for (let i = parts.length - 2; i >= 0; i -= 1) {
                if (/^\d{4}-\d{2}-\d{2}$/.test(parts[i])) {
                    return parts[i].startsWith('20') ? parts[i].slice(2) : parts[i];
                }
            }
            return null;
        }

        function writeDeleteTargetBridge() {
            if (typeof document === 'undefined') return;
            const snapshotText = getDeleteTargetSnapshot();
            if (!snapshotText) return;
            const bridgeRoot = document.getElementById('gallery_delete_target');
            const field = bridgeRoot?.querySelector?.('textarea, input');
            if (!field) return;
            try {
                const proto = Object.getPrototypeOf(field);
                const descriptor = proto ? Object.getOwnPropertyDescriptor(proto, 'value') : null;
                if (descriptor && descriptor.set) descriptor.set.call(field, snapshotText);
                else field.value = snapshotText;
                field.dispatchEvent(new Event('input', { bubbles: true }));
                field.dispatchEvent(new Event('change', { bubbles: true }));
            } catch (_err) {}
        }

        function syncSelectionToStudioState() {
            const active = currentItems[selectedIndex] || null;
            if (!active) return;
            const state = root.simpleaiTopbarSystemParams && typeof root.simpleaiTopbarSystemParams === 'object'
                ? root.simpleaiTopbarSystemParams
                : {};
            const choice = computeChoiceFromPath(active.path, currentChoice);
            state.prompt_info = [choice, selectedIndex];
            state.__selected_gallery_media_path = active.path;
            state.gallery_preview_open = true;
            root.simpleaiTopbarSystemParams = state;
            writeDeleteTargetBridge();
            syncAudioToolboxVisibility(true);
        }

        function syncAudioToolboxVisibility(visible) {
            if (typeof document === 'undefined') return;
            const toolbox = document.getElementById('image_toolbox');
            const compareBtn = document.getElementById('compare_btn');
            const params = root.simpleaiTopbarSystemParams || {};
            const toolsEnabled = params.__image_tools_enabled !== false;
            if (compareBtn && visible) {
                compareBtn.style.display = 'none';
                compareBtn.setAttribute('aria-hidden', 'true');
                compareBtn.classList.add('hidden');
            }
            if (!toolbox) return;
            if (visible && toolsEnabled) {
                toolbox.style.removeProperty('display');
                toolbox.style.removeProperty('visibility');
                toolbox.removeAttribute('hidden');
                toolbox.removeAttribute('aria-hidden');
                toolbox.classList.remove('hidden', 'hide', 'simpleai-gallery-toolbox-hidden');
            }
        }

        function hideWelcomePreview() {
            if (typeof document === 'undefined') return;
            try { root.setSimpleAIPreviewFitHeightVariable?.(); } catch (_err) {}
            const guard = document.getElementById('simpleai_result_surface_guard');
            if (guard) {
                delete guard.dataset.simpleaiResultSurfaceGuard;
                delete guard.dataset.simpleaiPostGenerationSurface;
                guard.style.removeProperty('display');
                guard.style.removeProperty('height');
                guard.style.removeProperty('min-height');
                guard.setAttribute('aria-hidden', 'true');
            }
            const welcomePlaceholder = document.getElementById('simpleai_gallery_welcome_guard_placeholder');
            if (welcomePlaceholder) {
                try { welcomePlaceholder.remove(); } catch (_err) {}
            }
            const mainRow = document.getElementById('main_preview_row');
            if (mainRow) {
                mainRow.classList.remove('simpai-gallery-browser-overlay-row');
            }
            const preview = document.getElementById('preview_generating');
            if (preview) {
                const form = preview.closest?.('.form, .block');
                [preview, form].filter(Boolean).forEach((node) => {
                    node.dataset.simpleaiAudioWelcomeHidden = '1';
                    node.style.setProperty('display', 'none', 'important');
                    node.style.setProperty('visibility', 'hidden', 'important');
                });
            }
            document.documentElement.classList.remove(
                'simpai-gallery-browser-welcome-pending',
                'simpai-gallery-browser-loading-silent',
                'simpai-gallery-browser-overlay-active'
            );
            document.documentElement.classList.add('simpai-audio-surface-active');
        }

        function restoreWelcomePreviewIfOwned() {
            if (typeof document === 'undefined') return;
            document.documentElement.classList.remove('simpai-audio-surface-active');
            document.querySelectorAll('[data-simpleai-audio-welcome-hidden="1"]').forEach((node) => {
                delete node.dataset.simpleaiAudioWelcomeHidden;
                node.style.removeProperty('display');
                node.style.removeProperty('visibility');
            });
        }

        function renderStage() {
            const stage = getStage();
            if (!stage) return false;
            if (!currentItems.length) {
                hide('empty');
                return false;
            }
            selectedIndex = Math.max(0, Math.min(selectedIndex, currentItems.length - 1));
            const active = currentItems[selectedIndex];
            const langState = root.simpleaiTopbarSystemParams || null;
            const isSingle = currentMode === 'post_generation' && currentItems.length === 1;
            const sig = JSON.stringify({
                mode: currentMode,
                idx: selectedIndex,
                loop: loopEnabled,
                lang: isEnglishUi(langState) ? 'en' : 'cn',
                items: currentItems.map((it) => `${it.path}|${it.duration}|${it.waveform?.length || 0}`),
            });

            stage.hidden = false;
            stage.classList.toggle('is-single-track', isSingle);
            hideWelcomePreview();
            syncSelectionToStudioState();

            if (sig === renderedSignature && stage.children.length > 0) {
                return true;
            }
            renderedSignature = sig;

            if (!controller) {
                controller = createController(stage, {
                    getLangState: () => root.simpleaiTopbarSystemParams || null,
                    eagerWaveform: true,
                });
            } else {
                controller.pauseAll();
            }

            const modeTitle = currentMode === 'post_generation'
                ? tr('Generated Music', '已生成音乐', langState)
                : tr('Finished Audio Browser', '已完成音频浏览', langState);
            const countSubtitle = currentItems.length > 1
                ? tr(`${selectedIndex + 1} / ${currentItems.length} tracks`, `第 ${selectedIndex + 1} / ${currentItems.length} 首音频`, langState)
                : tr('Lossless / studio waveform preview', '双层波形精确试听与定位', langState);

            const sizeText = formatFileSize(active.size);
            const durationText = active.duration > 0 ? formatAudioTime(active.duration) : '';

            const listHtml = currentItems.length > 1 || currentMode === 'browser'
                ? `<div class="sai-studio-audio-list" role="listbox" aria-label="${escapeHtml(tr('Audio tracks', '音频列表', langState))}">` +
                    currentItems.map((item, idx) => {
                        const isSelected = idx === selectedIndex;
                        const itemSize = formatFileSize(item.size);
                        return [
                            `<div class="sai-studio-audio-card${isSelected ? ' is-selected' : ''}" role="option" aria-selected="${isSelected ? 'true' : 'false'}" data-sai-audio-card-index="${idx}">`,
                            `<div class="sai-studio-audio-card-head">`,
                            `<span class="sai-studio-audio-card-title" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>`,
                            `<span class="sai-studio-audio-badges">`,
                            `<span class="sai-audio-pill is-accent">${escapeHtml(item.format)}</span>`,
                            itemSize ? `<span class="sai-audio-pill">${escapeHtml(itemSize)}</span>` : '',
                            `</span>`,
                            `</div>`,
                            renderPlayerHtml(item, { variant: 'compact', langState, preload: 'none' }),
                            `</div>`,
                        ].join('');
                    }).join('') +
                    `</div>`
                : '';

            stage.innerHTML = [
                `<div class="sai-studio-audio-stage-header">`,
                `<div class="sai-studio-audio-stage-heading">`,
                `<span class="sai-studio-audio-stage-icon"><i class="fa-solid fa-music fa" aria-hidden="true"></i></span>`,
                `<div class="sai-studio-audio-stage-titles">`,
                `<strong>${escapeHtml(modeTitle)}</strong>`,
                `<span>${escapeHtml(countSubtitle)}</span>`,
                `</div>`,
                `</div>`,
                `<div class="sai-studio-audio-badges">`,
                `<span class="sai-audio-pill is-accent">${escapeHtml(active.format)}</span>`,
                durationText ? `<span class="sai-audio-pill">${escapeHtml(durationText)}</span>` : '',
                sizeText ? `<span class="sai-audio-pill">${escapeHtml(sizeText)}</span>` : '',
                `</div>`,
                `</div>`,
                `<div class="sai-studio-audio-hero" data-sai-audio-hero>`,
                `<div class="sai-studio-audio-hero-meta">`,
                `<span class="sai-studio-audio-hero-name" title="${escapeHtml(active.name)}">${escapeHtml(active.name)}</span>`,
                `<div class="sai-studio-audio-hero-actions">`,
                `<button type="button" class="sai-audio-action-btn${loopEnabled ? ' is-active' : ''}" data-sai-audio-loop title="${escapeHtml(tr('Loop playback', '循环播放', langState))}">`,
                `<i class="fa-solid fa-repeat fa" aria-hidden="true"></i><span>${escapeHtml(tr('Loop', '循环', langState))}</span>`,
                `</button>`,
                `<a class="sai-audio-action-btn" href="${escapeHtml(active.download_url)}" download="${escapeHtml(active.name)}" title="${escapeHtml(tr('Download audio', '下载音频', langState))}">`,
                `<i class="fa-solid fa-download fa" aria-hidden="true"></i><span>${escapeHtml(tr('Download', '下载', langState))}</span>`,
                `</a>`,
                `</div>`,
                `</div>`,
                renderPlayerHtml(active, { variant: 'hero', langState, loop: loopEnabled, preload: 'metadata' }),
                `</div>`,
                listHtml,
            ].join('');

            controller.sync();
            return true;
        }

        function hide(_reason) {
            if (controller) controller.pauseAll();
            currentItems = [];
            selectedIndex = 0;
            currentMode = '';
            currentChoice = null;
            renderedSignature = '';
            const stage = getStage();
            if (stage) {
                stage.hidden = true;
                stage.innerHTML = '';
            }
            restoreWelcomePreviewIfOwned();
        }

        function showPostGenerationResults(payload) {
            if (!payload || !payload.__post_generation_audio_output) {
                if (currentMode === 'post_generation') hide('post_generation_cleared');
                return false;
            }
            const rawItems = Array.isArray(payload.__post_generation_audio_items)
                ? payload.__post_generation_audio_items
                : [];
            const items = rawItems.map((it) => normalizeTrackItem(it)).filter((it) => it.preview_url);
            if (!items.length) {
                hide('post_generation_empty');
                return false;
            }
            currentMode = 'post_generation';
            currentItems = items;
            const promptInfo = Array.isArray(payload.prompt_info) ? payload.prompt_info : [];
            currentChoice = promptInfo.length ? promptInfo[0] : null;
            selectedIndex = 0;
            return renderStage();
        }

        function showBrowserItems(browserData) {
            const data = browserData && typeof browserData === 'object' ? browserData : {};
            const mediaType = String(data.media_type || '').toLowerCase();
            if (mediaType !== 'audio') {
                if (currentMode === 'browser') hide('media_switched_away');
                return false;
            }
            const paths = Array.isArray(data.paths) ? data.paths : [];
            const dimensions = data.dimensions && typeof data.dimensions === 'object' ? data.dimensions : {};
            if (!paths.length) {
                hide('browser_empty');
                return false;
            }
            const items = paths.map((p) => {
                const meta = dimensions[p] || dimensions[String(p)] || {};
                return normalizeTrackItem(meta, p);
            }).filter((it) => it.preview_url);
            if (!items.length) {
                hide('browser_no_valid_items');
                return false;
            }
            const previousSelectedPath = currentItems[selectedIndex]?.path
                || root.simpleaiTopbarSystemParams?.__selected_gallery_media_path
                || '';
            currentMode = 'browser';
            currentItems = items;
            const folder = String(data.folder || '').trim();
            currentChoice = folder.startsWith('20') ? folder.slice(2) : (folder || null);
            const matchedIdx = previousSelectedPath
                ? items.findIndex((it) => it.path.toLowerCase() === String(previousSelectedPath).toLowerCase())
                : -1;
            selectedIndex = matchedIdx >= 0 ? matchedIdx : 0;
            return renderStage();
        }

        function isVisible() {
            const stage = getStage();
            return !!(stage && !stage.hidden && currentItems.length > 0);
        }

        function syncSelectionIntoState(targetState) {
            if (!isVisible() || !targetState || typeof targetState !== 'object') return false;
            const active = currentItems[selectedIndex];
            if (!active) return false;
            const choice = computeChoiceFromPath(active.path, currentChoice);
            targetState.prompt_info = [choice, selectedIndex];
            targetState.__selected_gallery_media_path = active.path;
            targetState.gallery_preview_open = true;
            return true;
        }

        function getDeleteTargetSnapshot() {
            if (!isVisible()) return '';
            const active = currentItems[selectedIndex];
            if (!active) return '';
            const state = root.simpleaiTopbarSystemParams || {};
            const choice = computeChoiceFromPath(active.path, currentChoice);
            const snapshot = {
                version: 1,
                request_id: `${Date.now()}:${Math.random().toString(36).slice(2, 10)}`,
                captured_at: Date.now(),
                selected_index: selectedIndex,
                media_src: active.preview_url,
                media_path: active.path,
                file_name: active.name,
                source_id: 'studio_audio_browser',
                gallery_state: String(state.gallery_state || (currentMode === 'browser' ? 'main_browser' : 'finished_index')),
                choice,
                engine_type: 'audio',
                valid: !!active.path,
            };
            root.__simpleaiPendingGalleryDeleteTarget = snapshot;
            return JSON.stringify(snapshot);
        }

        if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
            document.addEventListener('click', (event) => {
                const host = getHost();
                if (!host || !host.contains(event.target)) return;
                const loopBtn = event.target.closest?.('[data-sai-audio-loop]');
                if (loopBtn) {
                    event.preventDefault();
                    loopEnabled = !loopEnabled;
                    loopBtn.classList.toggle('is-active', loopEnabled);
                    const heroAudio = host.querySelector('[data-sai-audio-hero] audio');
                    if (heroAudio) heroAudio.loop = loopEnabled;
                    return;
                }
                const card = event.target.closest?.('[data-sai-audio-card-index]');
                if (card && !event.target.closest?.('[data-sai-audio-toggle], [data-sai-audio-seek]')) {
                    const nextIdx = Number(card.getAttribute('data-sai-audio-card-index'));
                    if (Number.isFinite(nextIdx) && nextIdx >= 0 && nextIdx < currentItems.length && nextIdx !== selectedIndex) {
                        selectedIndex = nextIdx;
                        renderedSignature = '';
                        renderStage();
                    }
                }
            });
        }

        return {
            showPostGenerationResults,
            showBrowserItems,
            hide,
            isVisible,
            getCount: () => currentItems.length,
            getMode: () => currentMode,
            syncSelectionIntoState,
            getDeleteTargetSnapshot,
        };
    }

    function mountPlayer(targetEl, _track, options = {}) {
        if (!targetEl) return null;
        const host = targetEl.matches?.('[data-sai-audio-player]')
            ? (targetEl.parentElement || targetEl)
            : targetEl;
        const ctrl = createController(host, options);
        ctrl.sync();
        return ctrl;
    }

    const api = {
        formatAudioTime,
        formatClock: formatAudioTime,
        formatFileSize,
        normalizePeaks,
        renderWaveformBarsHtml,
        renderPlayerHtml,
        createController,
        mountPlayer,
        fetchWaveformPeaks,
    };

    root.SimpAIAudioWaveform = api;
    root.SimpAIStudioAudioSurface = createMainAudioSurface();

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            SimpAIAudioWaveform: api,
            createMainAudioSurface,
        };
    }
})(typeof globalThis !== 'undefined' ? globalThis : window);
