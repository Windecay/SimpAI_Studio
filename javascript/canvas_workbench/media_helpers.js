(function () {
    'use strict';

    function isImageFile(file) {
        if (!file) return false;
        if (file.type && file.type.startsWith('image/')) return true;
        return /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(file.name || '');
    }

    function isVideoFile(file) {
        if (!file) return false;
        if (file.type && file.type.startsWith('video/')) return true;
        return /\.(mp4|webm|mov|m4v|avi|mkv)$/i.test(file.name || '');
    }

    function isAudioFile(file) {
        if (!file) return false;
        if (file.type && file.type.startsWith('audio/')) return true;
        return /\.(mp3|wav|ogg|flac|m4a|aac|opus)$/i.test(file.name || '');
    }

    function isMediaFile(file) {
        return isImageFile(file) || isVideoFile(file) || isAudioFile(file);
    }

    function isBatchTextFile(file) {
        if (!file) return false;
        const name = String(file.name || '').toLowerCase();
        const type = String(file.type || '').toLowerCase();
        if (name.endsWith('.canvas.json') || name.endsWith('.workbench.json')) return false;
        return type.startsWith('text/') || name.endsWith('.txt') || name.endsWith('.md');
    }

    function isWorkbenchProjectFile(file) {
        if (!file) return false;
        const name = String(file.name || '').toLowerCase();
        return name.endsWith('.canvas.json') || name.endsWith('.workbench.json') || (name.endsWith('.json') && !file.type.startsWith('image/'));
    }

    function roundMediaTime(value) {
        const num = Number(value || 0);
        if (!Number.isFinite(num)) return 0;
        return Math.round(num * 1000) / 1000;
    }

    function readSourceValue(source, name, fallback) {
        if (typeof source?.[name] === 'function') return source[name]();
        if (source && Object.prototype.hasOwnProperty.call(source, name)) return source[name];
        return fallback;
    }

    function createMediaHelpersContext(source) {
        const scope = source?.mediaHelpersSource || source || {};
        const documentSource = scope.documentSource || {};
        const browserSource = scope.browserSource || {};
        const timingSource = scope.timingSource || {};
        const emptyMetadata = () => ({ width: null, height: null, duration: null, fps: null, frame_count: null });
        const getDocument = () => readSourceValue(documentSource, 'getDocument', null);
        const createElement = (type) => getDocument()?.createElement?.(type) || null;
        const createFileReader = () => readSourceValue(browserSource, 'createFileReader', null);
        const createImage = () => readSourceValue(browserSource, 'createImage', null);
        const getAudioContext = () => readSourceValue(browserSource, 'getAudioContext', null);
        const setTimeoutFn = (...args) => typeof timingSource.setTimeout === 'function'
            ? timingSource.setTimeout(...args)
            : undefined;
        const clearTimeoutFn = (...args) => typeof timingSource.clearTimeout === 'function'
            ? timingSource.clearTimeout(...args)
            : undefined;

        function pickLocalFile(accept, acceptsFile) {
            const doc = getDocument();
            const input = doc?.createElement?.('input');
            if (!input || !doc?.body) return Promise.resolve(null);
            input.type = 'file';
            input.accept = accept;
            input.style.display = 'none';
            doc.body.appendChild(input);
            return new Promise((resolve) => {
                input.addEventListener('change', () => {
                    const file = input.files && input.files[0] ? input.files[0] : null;
                    input.remove();
                    resolve(file && acceptsFile(file) ? file : null);
                }, { once: true });
                input.click();
            });
        }

        function pickLocalVideoFile() {
            return pickLocalFile('video/*,.mp4,.webm,.mov,.m4v,.avi,.mkv', isVideoFile);
        }

        function pickLocalImageFile() {
            return pickLocalFile('image/*', isImageFile);
        }

        function pickLocalAudioFile() {
            return pickLocalFile('audio/*,.mp3,.wav,.ogg,.flac,.m4a,.aac,.opus', isAudioFile);
        }

        function waitForMediaElementEvent(target, eventName, timeoutMs) {
            return new Promise((resolve) => {
                if (!target?.addEventListener) {
                    resolve(false);
                    return;
                }
                let done = false;
                let timer = null;
                const finish = (value) => {
                    if (done) return;
                    done = true;
                    if (timer) clearTimeoutFn(timer);
                    target.removeEventListener?.(eventName, onEvent);
                    target.removeEventListener?.('error', onError);
                    resolve(value);
                };
                const onEvent = () => finish(true);
                const onError = () => finish(false);
                target.addEventListener(eventName, onEvent, { once: true });
                target.addEventListener('error', onError, { once: true });
                timer = setTimeoutFn(() => finish(false), timeoutMs || 2200);
            });
        }

        function readFileAsDataUrl(file) {
            return new Promise((resolve, reject) => {
                const reader = createFileReader();
                if (!reader) {
                    reject(new Error('reader_unavailable'));
                    return;
                }
                reader.onerror = () => reject(new Error('read_failed'));
                reader.onload = () => resolve(String(reader.result || ''));
                reader.readAsDataURL(file);
            });
        }

        function readFileAsText(file) {
            return new Promise((resolve, reject) => {
                const reader = createFileReader();
                if (!reader) {
                    reject(new Error('reader_unavailable'));
                    return;
                }
                reader.onerror = () => reject(new Error('read_failed'));
                reader.onload = () => resolve(String(reader.result || ''));
                reader.readAsText(file, 'utf-8');
            });
        }

        function loadImageElementForCanvas(src) {
            return new Promise((resolve, reject) => {
                if (!src) {
                    reject(new Error('missing image source'));
                    return;
                }
                const image = createImage();
                if (!image) {
                    reject(new Error('image_unavailable'));
                    return;
                }
                image.crossOrigin = 'anonymous';
                image.onload = () => resolve(image);
                image.onerror = reject;
                image.src = src;
            });
        }

        function getImageDimensions(src) {
            return new Promise((resolve) => {
                if (!src) {
                    resolve({ width: null, height: null });
                    return;
                }
                const image = createImage();
                if (!image) {
                    resolve({ width: null, height: null });
                    return;
                }
                image.onload = () => resolve({ width: image.naturalWidth || image.width || null, height: image.naturalHeight || image.height || null });
                image.onerror = () => resolve({ width: null, height: null });
                image.src = src;
            });
        }

        function getMediaMetadata(src, type) {
            return new Promise((resolve) => {
                if (!src) {
                    resolve(emptyMetadata());
                    return;
                }
                const media = createElement(type === 'video' ? 'video' : 'audio');
                if (!media) {
                    resolve(emptyMetadata());
                    return;
                }
                media.preload = 'metadata';
                media.onloadedmetadata = () => {
                    resolve({
                        width: media.videoWidth || null,
                        height: media.videoHeight || null,
                        duration: Number.isFinite(media.duration) ? Math.round(media.duration * 100) / 100 : null,
                        fps: null,
                        frame_count: null
                    });
                };
                media.onerror = () => resolve(emptyMetadata());
                media.src = src;
            });
        }

        function createThumbnailDataUrl(src, maxSize) {
            return new Promise((resolve) => {
                if (!src) {
                    resolve('');
                    return;
                }
                const image = createImage();
                if (!image) {
                    resolve(src);
                    return;
                }
                image.onload = () => {
                    const width = image.naturalWidth || image.width || 1;
                    const height = image.naturalHeight || image.height || 1;
                    const scale = Math.min(1, Number(maxSize || 1024) / Math.max(width, height));
                    if (scale >= 1 && src.length < 700000) {
                        resolve(src);
                        return;
                    }
                    const canvas = createElement('canvas');
                    const ctx = canvas?.getContext?.('2d');
                    if (!canvas || !ctx) {
                        resolve(src);
                        return;
                    }
                    canvas.width = Math.max(1, Math.round(width * scale));
                    canvas.height = Math.max(1, Math.round(height * scale));
                    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
                    resolve(canvas.toDataURL('image/jpeg', 0.92));
                };
                image.onerror = () => resolve(src);
                image.src = src;
            });
        }

        function createVideoStoryboardDataUrls(src, duration, count) {
            return new Promise((resolve) => {
                const video = createElement('video');
                if (!video) {
                    resolve([]);
                    return;
                }
                const frames = [];
                const total = Math.max(0, Number(duration || 0) || 0);
                const frameCount = Math.max(4, Math.min(12, Number(count || 8) || 8));
                let settled = false;
                const finish = () => {
                    if (settled) return;
                    settled = true;
                    video.removeAttribute?.('src');
                    video.load?.();
                    resolve(frames);
                };
                const seekTo = (time) => new Promise((res) => {
                    const done = () => {
                        video.removeEventListener?.('seeked', done);
                        res();
                    };
                    video.addEventListener?.('seeked', done, { once: true });
                    try {
                        video.currentTime = Math.max(0, time);
                    } catch (err) {
                        video.removeEventListener?.('seeked', done);
                        res();
                    }
                    setTimeoutFn(done, 1200);
                });
                video.muted = true;
                video.preload = 'auto';
                video.playsInline = true;
                video.onerror = finish;
                video.onloadedmetadata = async () => {
                    const mediaDuration = total || (Number.isFinite(video.duration) ? video.duration : 0);
                    const width = video.videoWidth || 160;
                    const height = video.videoHeight || 90;
                    const scale = Math.min(1, 180 / Math.max(width, height));
                    const canvas = createElement('canvas');
                    const ctx = canvas?.getContext?.('2d');
                    if (!canvas || !ctx || !mediaDuration) {
                        finish();
                        return;
                    }
                    canvas.width = Math.max(1, Math.round(width * scale));
                    canvas.height = Math.max(1, Math.round(height * scale));
                    for (let i = 0; i < frameCount; i += 1) {
                        const time = mediaDuration * ((i + 0.5) / frameCount);
                        await seekTo(time);
                        try {
                            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                            frames.push({
                                time: roundMediaTime(time),
                                thumb: canvas.toDataURL('image/jpeg', 0.72)
                            });
                        } catch (err) {
                            // Unsupported codecs can still leave the media node usable.
                        }
                    }
                    finish();
                };
                setTimeoutFn(finish, 12000);
                video.src = src;
            });
        }

        async function extractVideoFirstFrameDataUrl(src) {
            const sourceUrl = String(src || '').trim();
            if (!sourceUrl) return null;
            const video = createElement('video');
            if (!video) return null;
            video.muted = true;
            video.playsInline = true;
            video.preload = 'auto';
            video.crossOrigin = 'anonymous';
            video.src = sourceUrl;
            try {
                try { video.load?.(); } catch (err) {}
                const loaded = (video.readyState >= 2 && video.videoWidth && video.videoHeight)
                    || await waitForMediaElementEvent(video, 'loadeddata', 2600);
                if (!loaded || !video.videoWidth || !video.videoHeight) return null;
                const duration = Number(video.duration || 0);
                if (Number.isFinite(duration) && duration > 0.001 && Math.abs(Number(video.currentTime || 0)) > 0.04) {
                    const seeked = waitForMediaElementEvent(video, 'seeked', 1800);
                    try { video.currentTime = 0; } catch (err) {}
                    await seeked;
                }
                const width = Number(video.videoWidth || 0);
                const height = Number(video.videoHeight || 0);
                if (!width || !height) return null;
                const canvas = createElement('canvas');
                const ctx = canvas?.getContext?.('2d');
                if (!canvas || !ctx) return null;
                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(video, 0, 0, width, height);
                return {
                    dataUrl: canvas.toDataURL('image/png'),
                    width,
                    height
                };
            } catch (err) {
                return null;
            } finally {
                try { video.pause?.(); } catch (err) {}
                video.removeAttribute?.('src');
                try { video.load?.(); } catch (err) {}
            }
        }

        async function createAudioWaveformPeaks(file, bucketCount) {
            if (!file || typeof file.arrayBuffer !== 'function') return [];
            const AudioCtx = getAudioContext();
            if (typeof AudioCtx !== 'function') return [];
            let audioCtx = null;
            try {
                const arrayBuffer = await file.arrayBuffer();
                audioCtx = new AudioCtx();
                const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
                const channels = Math.max(1, audioBuffer.numberOfChannels || 1);
                const samples = audioBuffer.length || 0;
                const buckets = Math.max(48, Math.min(160, Number(bucketCount || 96) || 96));
                const step = Math.max(1, Math.floor(samples / buckets));
                const peaks = [];
                for (let i = 0; i < buckets; i += 1) {
                    const start = i * step;
                    const end = Math.min(samples, start + step);
                    let max = 0;
                    for (let ch = 0; ch < channels; ch += 1) {
                        const data = audioBuffer.getChannelData(ch);
                        for (let j = start; j < end; j += 8) {
                            max = Math.max(max, Math.abs(data[j] || 0));
                        }
                    }
                    peaks.push(Math.round(Math.min(1, max) * 1000) / 1000);
                }
                return peaks;
            } catch (err) {
                console.warn('[SimpAI Canvas] waveform generation skipped:', err);
                return [];
            } finally {
                if (audioCtx && typeof audioCtx.close === 'function') {
                    audioCtx.close().catch(() => {});
                }
            }
        }

        return {
            isImageFile,
            isVideoFile,
            isAudioFile,
            isMediaFile,
            isBatchTextFile,
            isWorkbenchProjectFile,
            pickLocalVideoFile,
            pickLocalImageFile,
            pickLocalAudioFile,
            readFileAsDataUrl,
            readFileAsText,
            loadImageElementForCanvas,
            getImageDimensions,
            getMediaMetadata,
            createThumbnailDataUrl,
            createVideoStoryboardDataUrls,
            extractVideoFirstFrameDataUrl,
            createAudioWaveformPeaks
        };
    }

    const defaultHost = typeof window !== 'undefined' ? window : null;
    const defaultContext = createMediaHelpersContext({
        documentSource: {
            getDocument: () => defaultHost?.document || null
        },
        browserSource: {
            createFileReader: () => defaultHost && typeof defaultHost.FileReader === 'function' ? new defaultHost.FileReader() : null,
            createImage: () => defaultHost && typeof defaultHost.Image === 'function' ? new defaultHost.Image() : null,
            getAudioContext: () => defaultHost?.AudioContext || defaultHost?.webkitAudioContext || null
        },
        timingSource: {
            setTimeout: (...args) => defaultHost && typeof defaultHost.setTimeout === 'function'
                ? defaultHost.setTimeout(...args)
                : undefined,
            clearTimeout: (...args) => defaultHost && typeof defaultHost.clearTimeout === 'function'
                ? defaultHost.clearTimeout(...args)
                : undefined
        }
    });

    window.SimpAICanvasWorkbenchMediaHelpers = Object.assign(
        {},
        window.SimpAICanvasWorkbenchMediaHelpers || {},
        {
            createMediaHelpersContext,
            isImageFile: defaultContext.isImageFile,
            isVideoFile: defaultContext.isVideoFile,
            isAudioFile: defaultContext.isAudioFile,
            isMediaFile: defaultContext.isMediaFile,
            isBatchTextFile: defaultContext.isBatchTextFile,
            isWorkbenchProjectFile: defaultContext.isWorkbenchProjectFile,
            pickLocalVideoFile: defaultContext.pickLocalVideoFile,
            pickLocalImageFile: defaultContext.pickLocalImageFile,
            pickLocalAudioFile: defaultContext.pickLocalAudioFile,
            readFileAsDataUrl: defaultContext.readFileAsDataUrl,
            readFileAsText: defaultContext.readFileAsText,
            loadImageElementForCanvas: defaultContext.loadImageElementForCanvas,
            getImageDimensions: defaultContext.getImageDimensions,
            getMediaMetadata: defaultContext.getMediaMetadata,
            createThumbnailDataUrl: defaultContext.createThumbnailDataUrl,
            createVideoStoryboardDataUrls: defaultContext.createVideoStoryboardDataUrls,
            extractVideoFirstFrameDataUrl: defaultContext.extractVideoFirstFrameDataUrl,
            createAudioWaveformPeaks: defaultContext.createAudioWaveformPeaks
        }
    );
})();
