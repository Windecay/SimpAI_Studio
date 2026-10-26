(function () {
    'use strict';

    const ROOT_CONFIGS = [
        { rootId: 'metadata_input_image', metricPrefix: 'metadata_replacement' },
        { rootId: 'describe_input_image', metricPrefix: 'describe_replacement' },
    ];
    const PREVIEW_CLASS = 'simpai-metadata-local-preview';
    const HAS_MEDIA_CLASS = 'simpai-metadata-has-media';
    const DRAG_OVER_CLASS = 'simpai-metadata-drag-over';
    const MEDIA_EXTENSION_PATTERN = /\.(?:avif|bmp|gif|heic|heif|jpe?g|m4v|mkv|mov|mp4|mpeg|mpg|png|webm|webp)$/i;
    const VIDEO_EXTENSION_PATTERN = /\.(?:m4v|mkv|mov|mp4|mpeg|mpg|webm)$/i;
    const states = ROOT_CONFIGS.map((config) => ({
        ...config,
        currentFile: null,
        currentObjectUrl: '',
        failedPreviewKey: '',
        observedRoot: null,
        rootObserver: null,
        renderFrame: 0,
        reconcileTimer: 0,
        preservePreviewUntil: 0,
        replacementInProgress: false,
        revision: 0,
    }));

    function getRoot(state) {
        return document.getElementById(state.rootId);
    }

    function rootSelector(state) {
        return `#${state.rootId}`;
    }

    function isMediaFile(file) {
        if (!(file instanceof File)) return false;
        const mime = String(file.type || '').toLowerCase();
        if (mime.startsWith('image/') || mime.startsWith('video/')) return true;
        return !mime && MEDIA_EXTENSION_PATTERN.test(String(file.name || ''));
    }

    function isVideoFile(file) {
        const mime = String(file?.type || '').toLowerCase();
        if (mime.startsWith('video/')) return true;
        return !mime && VIDEO_EXTENSION_PATTERN.test(String(file?.name || ''));
    }

    function dataTransferMayContainMedia(dataTransfer) {
        if (!dataTransfer) return false;
        const files = Array.from(dataTransfer.files || []);
        if (files.some(isMediaFile)) return true;
        return Array.from(dataTransfer.items || []).some((item) => {
            if (item.kind !== 'file') return false;
            const mime = String(item.type || '').toLowerCase();
            return !mime || mime.startsWith('image/') || mime.startsWith('video/');
        });
    }

    function eventHitsRoot(event, state) {
        const root = getRoot(state);
        if (!root) return false;
        const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
        if (path.some((node) => node === root || node?.id === state.rootId)) return true;
        if (event.target?.closest?.(rootSelector(state))) return true;
        if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return false;
        const hovered = document.elementFromPoint(event.clientX, event.clientY);
        return !!hovered?.closest?.(rootSelector(state));
    }

    function stateForEvent(event) {
        return states.find((state) => eventHitsRoot(event, state)) || null;
    }

    function previewKey(file) {
        return [file.name || '', file.size || 0, file.type || '', file.lastModified || 0].join('|');
    }

    function removeRenderedPreview(state, root = getRoot(state)) {
        root?.querySelectorAll?.(`.${PREVIEW_CLASS}`).forEach((node) => node.remove());
        root?.classList.remove(HAS_MEDIA_CLASS);
    }

    function revokeObjectUrl(state) {
        if (!state.currentObjectUrl) return;
        URL.revokeObjectURL(state.currentObjectUrl);
        state.currentObjectUrl = '';
    }

    function clearCurrentPreview(state) {
        if (state.reconcileTimer) {
            window.clearTimeout(state.reconcileTimer);
            state.reconcileTimer = 0;
        }
        state.currentFile = null;
        state.failedPreviewKey = '';
        state.preservePreviewUntil = 0;
        revokeObjectUrl(state);
        removeRenderedPreview(state);
    }

    function restoredMediaSource(root) {
        const href = root.querySelector('.file-preview-holder a[href]')?.getAttribute('href');
        if (!href) return null;
        try {
            const url = new URL(href, window.location.href);
            if (url.origin !== window.location.origin || !/^https?:$/.test(url.protocol)
                || url.username || url.password || !/\/gradio_api\/file=/.test(url.pathname)) return null;
            const path = decodeURIComponent(url.pathname);
            if (!MEDIA_EXTENSION_PATTERN.test(path)) return null;
            return { key: `server:${url.href}`, url: url.href, video: VIDEO_EXTENSION_PATTERN.test(path) };
        } catch (error) {
            return null;
        }
    }

    function renderCurrentPreview(state) {
        state.renderFrame = 0;
        const root = getRoot(state);
        if (!root) return;
        // A page restore has a native server file link, but no browser File/blob.
        const source = state.currentFile && state.currentObjectUrl
            ? { key: previewKey(state.currentFile), url: state.currentObjectUrl, video: isVideoFile(state.currentFile) }
            : restoredMediaSource(root);
        if (!source) {
            state.failedPreviewKey = '';
            removeRenderedPreview(state, root);
            return;
        }
        const key = source.key;
        if (state.failedPreviewKey === key) {
            removeRenderedPreview(state, root);
            return;
        }
        state.failedPreviewKey = '';
        const existing = root.querySelector(`.${PREVIEW_CLASS}`);
        if (existing?.dataset.previewKey === key) {
            root.classList.add(HAS_MEDIA_CLASS);
            return;
        }
        removeRenderedPreview(state, root);
        const preview = document.createElement('div');
        preview.className = PREVIEW_CLASS;
        preview.dataset.previewKey = key;
        const onPreviewError = () => {
            if (getRoot(state) !== root || root.querySelector(`.${PREVIEW_CLASS}`) !== preview) return;
            state.failedPreviewKey = key;
            removeRenderedPreview(state, root);
        };
        if (source.video) {
            const video = document.createElement('video');
            video.addEventListener('error', onPreviewError, { once: true });
            video.src = source.url;
            video.controls = true;
            video.preload = 'metadata';
            video.playsInline = true;
            preview.appendChild(video);
        } else {
            const image = document.createElement('img');
            image.addEventListener('error', onPreviewError, { once: true });
            image.src = source.url;
            image.alt = '';
            image.draggable = false;
            preview.appendChild(image);
        }
        root.appendChild(preview);
        root.classList.add(HAS_MEDIA_CLASS);
    }

    function scheduleRender(state) {
        if (state.renderFrame) return;
        state.renderFrame = window.requestAnimationFrame(() => renderCurrentPreview(state));
    }

    function setCurrentFile(state, file) {
        if (!isMediaFile(file)) return false;
        state.failedPreviewKey = '';
        if (state.currentFile !== file) {
            revokeObjectUrl(state);
            state.currentFile = file;
            state.currentObjectUrl = URL.createObjectURL(file);
            state.revision += 1;
        }
        state.preservePreviewUntil = Date.now() + 2000;
        scheduleRender(state);
        return true;
    }

    function waitForFileInput(root, timeoutMs = 2000) {
        const currentInput = root?.querySelector('input[type="file"]');
        if (currentInput) return Promise.resolve(currentInput);
        if (!root) return Promise.resolve(null);

        return new Promise((resolve) => {
            let timer = 0;
            const observer = new MutationObserver(() => {
                const input = root.querySelector('input[type="file"]');
                if (!input) return;
                observer.disconnect();
                if (timer) window.clearTimeout(timer);
                resolve(input);
            });
            observer.observe(root, { childList: true, subtree: true });
            timer = window.setTimeout(() => {
                observer.disconnect();
                resolve(null);
            }, timeoutMs);
        });
    }

    async function replaceMediaFile(state, file) {
        const perf = window.SimpAIStudioPerformance;
        const startedAt = perf ? performance.now() : 0;
        const metric = (stage) => `${state.metricPrefix}.${stage}`;
        perf?.mark(metric('begin'), {
            file,
            root_id: state.rootId,
            replacement_active: state.replacementInProgress,
        });
        if (!setCurrentFile(state, file)) {
            perf?.mark(metric('rejected'), { reason: 'unsupported-file', file, root_id: state.rootId });
            return false;
        }
        const root = getRoot(state);
        if (!root) {
            perf?.mark(metric('rejected'), { reason: 'root-missing', root_id: state.rootId });
            clearCurrentPreview(state);
            return false;
        }
        let input = root.querySelector('input[type="file"]');
        let outcome = 'failed';
        try {
            if (!input) {
                const clearButton = root.querySelector('.icon-button-wrapper button:last-of-type');
                if (!clearButton) {
                    outcome = 'clear-button-missing';
                    return false;
                }
                state.replacementInProgress = true;
                perf?.mark(metric('clear'), { root_id: state.rootId });
                clearButton.click();
                input = await waitForFileInput(root);
                perf?.mark(metric('input_wait_complete'), {
                    input_found: Boolean(input),
                    elapsed_ms: performance.now() - startedAt,
                    root_id: state.rootId,
                });
            }
            if (!input) {
                outcome = 'file-input-missing';
                clearCurrentPreview(state);
                return false;
            }
            const transfer = new DataTransfer();
            transfer.items.add(file);
            input.files = transfer.files;
            perf?.mark(metric('submit'), { file, root_id: state.rootId });
            input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
            outcome = 'submitted';
            return true;
        } catch (error) {
            outcome = 'error';
            perf?.mark(metric('error'), { error, root_id: state.rootId }, { urgent: true });
            console.warn(`[SimpAI] Failed to replace media in #${state.rootId}.`, error);
            return false;
        } finally {
            state.replacementInProgress = false;
            perf?.mark(metric('finish'), {
                outcome,
                elapsed_ms: performance.now() - startedAt,
                root_id: state.rootId,
                replacement_active: state.replacementInProgress,
            }, { urgent: outcome !== 'submitted' });
        }
    }

    function clearDragState(state = null) {
        const targets = state ? [state] : states;
        targets.forEach((target) => getRoot(target)?.classList.remove(DRAG_OVER_CLASS));
    }

    function handleFileInputChange(state, event) {
        const file = Array.from(event.currentTarget?.files || event.target?.files || []).find(isMediaFile);
        if (file) setCurrentFile(state, file);
    }

    function scheduleReconcile(state, delayMs = 180) {
        if (state.reconcileTimer) window.clearTimeout(state.reconcileTimer);
        state.reconcileTimer = window.setTimeout(() => {
            state.reconcileTimer = 0;
            reconcileRoot(state);
        }, delayMs);
    }

    function reconcileRoot(state) {
        const root = getRoot(state);
        if (!root || !state.currentFile || state.replacementInProgress) return;
        const input = root.querySelector('input[type="file"]');
        const hasNativeFile = Boolean(input?.files?.length || root.querySelector('.file-preview-holder'));
        if (hasNativeFile) {
            state.preservePreviewUntil = 0;
            return;
        }
        const remainingGraceMs = state.preservePreviewUntil - Date.now();
        if (remainingGraceMs > 0) {
            scheduleReconcile(state, remainingGraceMs + 20);
            return;
        }
        clearCurrentPreview(state);
    }

    function bindCurrentFileInput(state) {
        const input = getRoot(state)?.querySelector('input[type="file"]');
        if (!input || input.dataset.simpaiMediaPreviewBound === '1') return;
        input.dataset.simpaiMediaPreviewBound = '1';
        input.addEventListener('change', (event) => handleFileInputChange(state, event));
    }

    function watchCurrentRoot(state) {
        const root = getRoot(state);
        if (root === state.observedRoot) return;
        state.rootObserver?.disconnect();
        state.observedRoot = root;
        if (!root) return;
        state.rootObserver = new MutationObserver(() => {
            bindCurrentFileInput(state);
            scheduleReconcile(state);
            scheduleRender(state);
        });
        state.rootObserver.observe(root, {
            childList: true, subtree: true, attributes: true, attributeFilter: ['href'],
        });
        bindCurrentFileInput(state);
        scheduleReconcile(state);
        scheduleRender(state);
    }

    document.addEventListener('change', (event) => {
        const state = states.find((candidate) => event.target?.matches?.(`${rootSelector(candidate)} input[type="file"]`));
        if (state) handleFileInputChange(state, event);
    }, true);

    document.addEventListener('click', (event) => {
        const state = stateForEvent(event);
        if (!state || state.replacementInProgress) return;
        const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
        const selector = rootSelector(state);
        const button = path.find((node) => node?.tagName === 'BUTTON' && node?.closest?.(selector));
        if (!button || button.closest('.file-preview-holder')) return;
        const clearButton = getRoot(state)?.querySelector('.icon-button-wrapper button:last-of-type');
        if (button === clearButton) {
            window.setTimeout(() => clearCurrentPreview(state), 0);
            return;
        }
        scheduleReconcile(state, 80);
    }, true);

    document.addEventListener('dragenter', (event) => {
        const state = stateForEvent(event);
        if (!state || !dataTransferMayContainMedia(event.dataTransfer)) return;
        event.preventDefault();
        getRoot(state)?.classList.add(DRAG_OVER_CLASS);
    }, true);

    document.addEventListener('dragover', (event) => {
        const state = stateForEvent(event);
        if (!state || !dataTransferMayContainMedia(event.dataTransfer)) return;
        event.preventDefault();
        event.stopPropagation();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
        getRoot(state)?.classList.add(DRAG_OVER_CLASS);
    }, true);

    document.addEventListener('dragleave', (event) => {
        const state = stateForEvent(event);
        if (!state) return;
        const hovered = document.elementFromPoint(event.clientX, event.clientY);
        if (!hovered?.closest?.(rootSelector(state))) clearDragState(state);
    }, true);

    document.addEventListener('drop', (event) => {
        const state = stateForEvent(event);
        if (!state) return;
        const files = Array.from(event.dataTransfer?.files || []);
        if (!files.length) return;
        event.preventDefault();
        event.stopPropagation();
        clearDragState(state);
        const mediaFile = files.find(isMediaFile);
        window.SimpAIStudioPerformance?.mark(`${state.metricPrefix}.drop_claimed`, {
            matching_file_found: Boolean(mediaFile),
            file: mediaFile,
            root_id: state.rootId,
        }, { urgent: true });
        if (mediaFile) void replaceMediaFile(state, mediaFile);
    }, true);

    document.addEventListener('dragend', () => clearDragState(), true);
    window.addEventListener('blur', () => clearDragState());
    window.addEventListener('beforeunload', () => states.forEach(revokeObjectUrl));

    window.SimpAIMetadataMediaInput = Object.freeze({
        getCurrentMedia(rootId) {
            const state = states.find((candidate) => candidate.rootId === String(rootId || ''));
            const file = state?.currentFile;
            if (!state || !isMediaFile(file)) return null;
            return {
                file,
                key: `${previewKey(file)}|${state.revision}`,
                kind: isVideoFile(file) ? 'video' : 'image',
                mime: String(file.type || ''),
                name: String(file.name || ''),
                size: Number(file.size) || 0,
                lastModified: Number(file.lastModified) || 0,
            };
        },
    });

    const start = () => {
        states.forEach(watchCurrentRoot);
        const pageObserver = new MutationObserver(() => states.forEach(watchCurrentRoot));
        pageObserver.observe(document.body, { childList: true, subtree: true });
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }
})();
