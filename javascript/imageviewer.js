// From A1111

function closeModal() {
    const modal = gradioApp().getElementById("lightboxModal");
    if (!modal) return;
    modal.style.setProperty("display", "none", "important");
    modal.style.setProperty("visibility", "hidden", "important");
    modal.setAttribute("aria-hidden", "true");
}

function showModal(event) {
    const source = event.target || event.srcElement;
    const modalImage = gradioApp().getElementById("modalImage");
    const lb = gradioApp().getElementById("lightboxModal");
    const src = simpleaiMediaSrc(source);
    if (!src) return;
    modalImage.src = src;
    if (modalImage.style.display === 'none') {
        lb.style.setProperty('background-image', 'url(' + src + ')');
    }
    lb.style.setProperty("display", "flex", "important");
    lb.style.setProperty("visibility", "visible", "important");
    lb.removeAttribute("aria-hidden");
    lb.focus();

    event.stopPropagation();
    event.stopImmediatePropagation();
}

function negmod(n, m) {
    return ((n % m) + m) % m;
}

function updateOnBackgroundChange() {
    const modalImage = gradioApp().getElementById("modalImage");
    if (modalImage && modalImage.offsetParent) {
        let currentButton = selected_gallery_button();
        const media = simpleaiGalleryButtonMedia(currentButton);
        const src = simpleaiMediaSrc(media);

        if (src && modalImage.src != src) {
            modalImage.src = src;
            if (modalImage.style.display === 'none') {
                const modal = gradioApp().getElementById("lightboxModal");
                modal.style.setProperty('background-image', `url(${modalImage.src})`);
            }
        }
    }
}

function all_gallery_buttons() {
    var allGalleryButtons = gradioApp().querySelectorAll('.image_gallery .thumbnails > .thumbnail-item.thumbnail-small');
    var visibleGalleryButtons = [];
    allGalleryButtons.forEach(function(elem) {
        if (elem.parentElement.offsetParent) {
            visibleGalleryButtons.push(elem);
        }
    });
    return visibleGalleryButtons;
}

function selected_gallery_button() {
    return all_gallery_buttons().find(elem => elem.classList.contains('selected')) ?? null;
}

function selected_gallery_index() {
    return all_gallery_buttons().findIndex(elem => elem.classList.contains('selected'));
}

function simpleaiSyncGallerySelectionIntoState(state) {
    const targetState = state && typeof state === 'object' ? state : {};
    const app = typeof gradioApp === 'function' ? gradioApp() : document;
    const roots = ['#finished_gallery', '#final_gallery']
        .map((selector) => app.querySelector(selector))
        .filter(Boolean);
    let root = roots.find((node) => node.offsetParent !== null && node.querySelector('.thumbnail-item.thumbnail-small.selected'));
    if (!root) root = roots.find((node) => node.querySelector('.thumbnail-item.thumbnail-small.selected'));
    if (!root) return targetState;

    const buttons = Array.from(root.querySelectorAll('.thumbnail-item.thumbnail-small'));
    const button = root.querySelector('.thumbnail-item.thumbnail-small.selected');
    const selectedIndex = button ? buttons.indexOf(button) : -1;
    if (selectedIndex < 0) return targetState;

    const liveState = window.simpleaiTopbarSystemParams && typeof window.simpleaiTopbarSystemParams === 'object'
        ? window.simpleaiTopbarSystemParams
        : targetState;
    const browserPaths = Array.isArray(liveState.__main_gallery_browser_paths)
        ? liveState.__main_gallery_browser_paths
        : (Array.isArray(targetState.__main_gallery_browser_paths) ? targetState.__main_gallery_browser_paths : []);
    const media = simpleaiGalleryButtonMedia(button);
    const mediaSrc = simpleaiMediaSrc(media);
    let mediaPath = simpleaiGalleryFilePathFromSrc(mediaSrc);
    if (!mediaPath) mediaPath = simpleaiGalleryFilePathFromSrc(simpleaiGalleryDisplayPreviewOriginalSrc(mediaSrc));
    if (!mediaPath && selectedIndex < browserPaths.length) mediaPath = String(browserPaths[selectedIndex] || '');

    const livePromptInfo = Array.isArray(liveState.prompt_info) ? liveState.prompt_info : [];
    const statePromptInfo = Array.isArray(targetState.prompt_info) ? targetState.prompt_info : [];
    const choice = livePromptInfo.length ? livePromptInfo[0] : (statePromptInfo.length ? statePromptInfo[0] : null);
    targetState.prompt_info = [choice, selectedIndex];
    if (mediaPath) targetState.__selected_gallery_media_path = mediaPath;
    window.simpleaiTopbarSystemParams = targetState;
    if (typeof topbarLastSystemParams !== 'undefined') topbarLastSystemParams = targetState;
    return targetState;
}

function simpleaiGalleryFilePathFromSrc(src) {
    const value = String(src || '');
    if (!value) return '';
    let url = null;
    try {
        url = new URL(value, document.baseURI || window.location?.href || location.href);
    } catch (e) {
        return '';
    }
    const decodedPath = decodeURIComponent(url.pathname || '');
    for (const marker of ['/gradio_api/file=', '/file=']) {
        const markerIndex = decodedPath.indexOf(marker);
        if (markerIndex < 0) continue;
        let filePath = decodedPath.slice(markerIndex + marker.length);
        if (/^\/[A-Za-z]:[\\/]/.test(filePath)) filePath = filePath.slice(1);
        return filePath.replace(/\//g, '\\');
    }
    return '';
}

function simpleaiGalleryDeleteTargetSnapshot() {
    const button = selected_gallery_button();
    const selectedIndex = selected_gallery_index();
    const media = simpleaiGalleryButtonMedia(button);
    const mediaSrc = simpleaiMediaSrc(media);
    const state = (window.simpleaiTopbarSystemParams && typeof window.simpleaiTopbarSystemParams === 'object')
        ? window.simpleaiTopbarSystemParams
        : ((typeof topbarLastSystemParams !== 'undefined' && topbarLastSystemParams && typeof topbarLastSystemParams === 'object')
            ? topbarLastSystemParams
            : {});
    const browserPaths = Array.isArray(state.__main_gallery_browser_paths) ? state.__main_gallery_browser_paths : [];
    let mediaPath = simpleaiGalleryFilePathFromSrc(mediaSrc);
    if (!mediaPath) {
        mediaPath = simpleaiGalleryFilePathFromSrc(simpleaiGalleryDisplayPreviewOriginalSrc(mediaSrc));
    }
    if (!mediaPath && selectedIndex >= 0 && selectedIndex < browserPaths.length) {
        mediaPath = String(browserPaths[selectedIndex] || '');
    }
    const normalizedPath = String(mediaPath || '').replace(/\\/g, '/');
    const source = button?.closest?.('#finished_gallery, #final_gallery');
    const promptInfo = Array.isArray(state.prompt_info) ? state.prompt_info : [];
    const snapshot = {
        version: 1,
        request_id: `${Date.now()}:${Math.random().toString(36).slice(2, 10)}`,
        captured_at: Date.now(),
        selected_index: selectedIndex,
        media_src: mediaSrc,
        media_path: mediaPath,
        file_name: normalizedPath.split('/').pop() || '',
        source_id: source?.id || '',
        gallery_state: String(state.gallery_state || ''),
        choice: promptInfo.length ? promptInfo[0] : null,
        engine_type: String(state.__gallery_engine_type || state.engine_type || ''),
        valid: selectedIndex >= 0 && !!(mediaPath || mediaSrc),
    };
    window.__simpleaiPendingGalleryDeleteTarget = snapshot;
    return JSON.stringify(snapshot);
}

function simpleaiGalleryButtonMedia(button) {
    return button?.querySelector?.('img, video') || null;
}

function simpleaiMediaSrc(elem) {
    if (!elem) return '';
    return elem.currentSrc || elem.src || elem.getAttribute?.('src') || '';
}

const SIMPLEAI_GALLERY_DISPLAY_PREVIEW_PREFIX = 'simpai_gprev__';
const SIMPLEAI_GALLERY_DISPLAY_PREVIEW_ROUTE = '/simpleai/gallery-preview/';
const SIMPLEAI_GALLERY_ORIGINAL_DOWNLOAD_PREFIX = 'simpai_gdownload__';
const SIMPLEAI_GALLERY_OUTPUT_DOWNLOAD_PREFIX = 'simpai_gdownload_path__';
const SIMPLEAI_GALLERY_ORIGINAL_DOWNLOAD_ROUTE = '/simpleai/gallery-download/';
const SIMPLEAI_GALLERY_ORIGINAL_DRAG_URL_TYPE = 'application/x-simpleai-gallery-original-url';

function simpleaiBase64UrlDecodeUtf8(value) {
    const text = String(value || '');
    if (!text) return '';
    const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - text.length % 4) % 4);
    try {
        const binary = atob(padded);
        const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
        if (window.TextDecoder) return new TextDecoder('utf-8').decode(bytes);
        return decodeURIComponent(Array.from(bytes, (byte) => `%${byte.toString(16).padStart(2, '0')}`).join(''));
    } catch (e) {
        return '';
    }
}

function simpleaiGalleryDisplayPreviewOriginalSrc(src) {
    const value = String(src || '');
    if (!value) return '';
    let url = null;
    try {
        url = new URL(value, document.baseURI || window.location?.href || location.href);
    } catch (e) {
        return '';
    }
    const fileName = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || '');
    const match = fileName.match(new RegExp(`^${SIMPLEAI_GALLERY_DISPLAY_PREVIEW_PREFIX}([A-Za-z0-9_-]+)__[0-9a-f]{16}\\.jpg$`));
    if (!match) return '';
    const originalPath = simpleaiBase64UrlDecodeUtf8(match[1]);
    if (!originalPath) return '';
    const routeIndex = url.pathname.indexOf(SIMPLEAI_GALLERY_DISPLAY_PREVIEW_ROUTE);
    const basePath = routeIndex >= 0 ? url.pathname.slice(0, routeIndex) : '';
    const encodedPath = encodeURI(String(originalPath).replace(/\\/g, '/')).replace(/\?/g, '%3F').replace(/#/g, '%23');
    return `${url.origin}${basePath}/gradio_api/file=${encodedPath}`;
}

function simpleaiGallerySignedOriginalDownloadSrc(src) {
    const value = String(src || '');
    if (!value) return '';
    try {
        const url = new URL(value, document.baseURI || window.location?.href || location.href);
        const fileName = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || '');
        const match = fileName.match(new RegExp(`^${SIMPLEAI_GALLERY_DISPLAY_PREVIEW_PREFIX}([A-Za-z0-9_-]+)__([0-9a-f]{16})\\.jpg$`));
        if (!match) return '';
        const routeIndex = url.pathname.indexOf(SIMPLEAI_GALLERY_DISPLAY_PREVIEW_ROUTE);
        const basePath = routeIndex >= 0 ? url.pathname.slice(0, routeIndex) : '';
        const downloadName = `${SIMPLEAI_GALLERY_ORIGINAL_DOWNLOAD_PREFIX}${match[1]}__${match[2]}`;
        return `${url.origin}${basePath}${SIMPLEAI_GALLERY_ORIGINAL_DOWNLOAD_ROUTE}${downloadName}`;
    } catch (e) {
        return '';
    }
}

function simpleaiGalleryOutputDownloadSrc(src) {
    const value = String(src || '');
    const mediaPath = simpleaiGalleryFilePathFromSrc(value);
    if (!value || !mediaPath) return '';
    try {
        const url = new URL(value, document.baseURI || window.location?.href || location.href);
        let routeIndex = -1;
        for (const marker of ['/gradio_api/file=', '/file=']) {
            routeIndex = url.pathname.indexOf(marker);
            if (routeIndex >= 0) break;
        }
        const basePath = routeIndex >= 0 ? url.pathname.slice(0, routeIndex) : '';
        const encodedPath = simpleaiBase64UrlEncodeUtf8(mediaPath.replace(/\\/g, '/'));
        if (!encodedPath) return '';
        return `${url.origin}${basePath}${SIMPLEAI_GALLERY_ORIGINAL_DOWNLOAD_ROUTE}${SIMPLEAI_GALLERY_OUTPUT_DOWNLOAD_PREFIX}${encodedPath}`;
    } catch (e) {
        return '';
    }
}

function simpleaiGalleryOriginalDownloadSrc(displaySrc, originalSrc) {
    const signedSrc = simpleaiGallerySignedOriginalDownloadSrc(displaySrc);
    if (signedSrc) return signedSrc;
    const outputSrc = simpleaiGalleryOutputDownloadSrc(originalSrc);
    if (outputSrc) return outputSrc;
    return simpleaiGalleryDragSourceKind(originalSrc) === 'http-image'
        ? simpleaiAbsoluteGalleryImageSrc(originalSrc)
        : '';
}

function simpleaiOriginalGalleryImageSrc(img) {
    const src = simpleaiMediaSrc(img);
    return simpleaiGalleryDisplayPreviewOriginalSrc(src) || src;
}

function simpleaiBase64UrlEncodeUtf8(value) {
    const text = String(value || '');
    if (!text) return '';
    try {
        const bytes = new TextEncoder().encode(text);
        let binary = '';
        for (const byte of bytes) binary += String.fromCharCode(byte);
        return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    } catch (e) {
        return '';
    }
}

function simpleaiGalleryOriginalSourceIsVideo(src) {
    const value = String(src || '').split(/[?#]/, 1)[0].toLowerCase();
    return value.endsWith('.mp4') || value.endsWith('.webm');
}

function simpleaiReleaseCachedGalleryVideo(video, remove = true) {
    if (!video) return;
    const host = video.closest?.('.simpleai-cached-gallery-video-host') || null;
    try { video.pause(); } catch (e) {}
    if (remove) {
        try { video.removeAttribute('src'); } catch (e) {}
        try { video.load?.(); } catch (e) {}
        try { video.remove(); } catch (e) {}
        if (host?.dataset?.simpleaiCachedVideoHost === '1') {
            try { host.remove(); } catch (e) {}
        }
    }
}

function simpleaiSyncCachedGalleryVideoPreviewRoot(root) {
    if (!root?.querySelectorAll) return;
    root.querySelectorAll('.gallery-container > .preview').forEach((preview) => {
        const poster = Array.from(preview.querySelectorAll('.media-button img')).find((img) => {
            const original = simpleaiGalleryDisplayPreviewOriginalSrc(simpleaiMediaSrc(img));
            return simpleaiGalleryOriginalSourceIsVideo(original);
        }) || null;
        const originalSrc = poster ? simpleaiGalleryDisplayPreviewOriginalSrc(simpleaiMediaSrc(poster)) : '';
        const posterSrc = poster ? simpleaiMediaSrc(poster) : '';
        const videos = Array.from(preview.querySelectorAll('video.simpleai-cached-gallery-video-preview'));

        preview.querySelectorAll('img.simpleai-cached-gallery-video-poster-source').forEach((img) => {
            if (img !== poster) img.classList.remove('simpleai-cached-gallery-video-poster-source');
        });
        if (!poster || !originalSrc) {
            videos.forEach((video) => simpleaiReleaseCachedGalleryVideo(video));
            preview.classList.remove('simpleai-cached-gallery-video-active');
            return;
        }

        let video = videos.find((item) => item.dataset.simpleaiOriginalSrc === originalSrc) || null;
        videos.forEach((item) => {
            if (item !== video) simpleaiReleaseCachedGalleryVideo(item);
        });
        let host = video?.closest?.('.simpleai-cached-gallery-video-host') || null;
        if (!host) {
            host = document.createElement('div');
            host.className = 'simpleai-cached-gallery-video-host';
            host.dataset.simpleaiCachedVideoHost = '1';
            preview.appendChild(host);
        }
        if (!video) {
            video = document.createElement('video');
            video.className = 'simpleai-cached-gallery-video-preview';
            video.dataset.simpleaiOriginalSrc = originalSrc;
            video.controls = true;
            video.playsInline = true;
            video.preload = 'metadata';
            video.autoplay = false;
            video.loop = false;
            video.src = originalSrc;
            video.addEventListener('click', (event) => event.stopPropagation());
            video.addEventListener('pointerdown', (event) => event.stopPropagation());
            video.addEventListener('play', () => {
                document.querySelectorAll('video.simpleai-cached-gallery-video-preview').forEach((other) => {
                    if (other !== video) {
                        try { other.pause(); } catch (e) {}
                    }
                });
            });
            host.appendChild(video);
        }
        if (video.poster !== posterSrc) video.poster = posterSrc;
        poster.classList.add('simpleai-cached-gallery-video-poster-source');
        preview.classList.add('simpleai-cached-gallery-video-active');
    });
}

function simpleaiApplyMobileGalleryVideoPolicy() {
    if (!window.simpleaiDisableHoverPreviewsForInput?.()) return;
    document.querySelectorAll('#finished_gallery video, #final_gallery video').forEach((video) => {
        video.autoplay = false;
        video.loop = false;
        video.removeAttribute('autoplay');
        const cachedPreview = video.classList.contains('simpleai-cached-gallery-video-preview');
        const insidePreview = !!video.closest('.gallery-container > .preview');
        video.preload = cachedPreview || insidePreview ? 'metadata' : 'none';
        if (document.hidden || !insidePreview) {
            try { video.pause(); } catch (e) {}
        }
    });
}

function simpleaiSyncCachedGalleryVideoPreviews() {
    document.querySelectorAll('#finished_gallery, #final_gallery').forEach(simpleaiSyncCachedGalleryVideoPreviewRoot);
    simpleaiApplyMobileGalleryVideoPolicy();
}

const SIMPLEAI_GALLERY_NATIVE_DRAG_IMAGE_SELECTOR = [
    '#preview_generating img',
    '#finished_gallery img',
    '#final_gallery img',
    '#finished_gallery .gallery-container img',
    '#final_gallery .gallery-container img',
    '#comparison_box img',
    '#lightboxModal img',
    '#scene_input_images img',
    '#scene_input_image1 img',
    '#scene_input_image2 img',
    '#scene_input_image3 img',
    '#scene_input_image4 img',
    '#describe_input_image img',
    '#image_input_panel img',
    '#input_image img',
    '#uov_input_image img',
    '#inpaint_input_image img',
    '#ip_image_grid img',
    '#ip_image_1 img',
    '#ip_image_2 img',
    '#ip_image_3 img',
    '#ip_image_4 img'
].join(', ');
const SIMPLEAI_GALLERY_NATIVE_DRAG_CONTAINER_SELECTOR = [
    '#preview_generating',
    '#finished_gallery',
    '#final_gallery',
    '#comparison_box',
    '#lightboxModal',
    '#scene_input_images',
    '#scene_input_image1',
    '#scene_input_image2',
    '#scene_input_image3',
    '#scene_input_image4',
    '#describe_input_image',
    '#image_input_panel',
    '#input_image',
    '#uov_input_image',
    '#inpaint_input_image',
    '#ip_image_grid',
    '#ip_image_1',
    '#ip_image_2',
    '#ip_image_3',
    '#ip_image_4'
].join(', ');
const SIMPLEAI_GALLERY_ORIGINAL_CONTEXT_RESTORE_MS = 30000;
const SIMPLEAI_GALLERY_PREVIEW_OPEN_PENDING_MS = 10;
const SIMPLEAI_GALLERY_PREVIEW_STABLE_MS = 150;
const SIMPLEAI_GALLERY_PREVIEW_THUMBNAIL_SWITCH_MS = 1200;
const SIMPLEAI_GALLERY_LARGE_NATIVE_DRAG_PIXEL_LIMIT = 2000000;
const SIMPLEAI_GALLERY_LARGE_NATIVE_DRAG_EDGE_LIMIT = 2048;
const SIMPLEAI_GALLERY_NATIVE_DRAG_PREVIEW_WIDTH = 120;
let simpleaiGalleryNativeDragSyncFrame = 0;
let simpleaiGalleryNativeDragVersion = 0;
let simpleaiGalleryOriginalDragClearTimer = 0;
let simpleaiGalleryOriginalContextState = null;
let simpleaiGalleryOriginalCopyImage = null;
let simpleaiGalleryPreviewDeferredRevealTimer = null;
let simpleaiGalleryPreviewWasOpen = false;

function simpleaiGalleryNativeDragImageFromEvent(event) {
    const target = event?.target;
    if (!target) return null;
    let img = null;
    if (target.matches?.(SIMPLEAI_GALLERY_NATIVE_DRAG_IMAGE_SELECTOR)) {
        img = target;
    }
    if (!img && target.closest) {
        const closestImage = target.closest('img');
        if (closestImage?.matches?.(SIMPLEAI_GALLERY_NATIVE_DRAG_IMAGE_SELECTOR)) img = closestImage;
    }
    if (!img && target.querySelector) {
        const nestedImage = target.querySelector('img');
        if (nestedImage?.matches?.(SIMPLEAI_GALLERY_NATIVE_DRAG_IMAGE_SELECTOR)) img = nestedImage;
    }
    if (!img && target.closest) {
        const container = target.closest(SIMPLEAI_GALLERY_NATIVE_DRAG_CONTAINER_SELECTOR);
        const containerImage = container?.querySelector?.('img');
        if (containerImage?.matches?.(SIMPLEAI_GALLERY_NATIVE_DRAG_IMAGE_SELECTOR)) img = containerImage;
    }
    if (!img || img.tagName !== 'IMG') return null;
    const src = simpleaiMediaSrc(img);
    if (!src || src.startsWith('data:image/svg+xml')) return null;
    const naturalWidth = Number(img.naturalWidth || 0);
    const naturalHeight = Number(img.naturalHeight || 0);
    if (naturalWidth && naturalHeight && (naturalWidth < 48 || naturalHeight < 48)) return null;
    return img;
}

function simpleaiGalleryDedicatedDownloadDragSource(img) {
    if (!img?.closest?.('#finished_gallery, #final_gallery, #lightboxModal')) return null;
    return img.closest('.thumbnail-item, .gallery-item, .media-button, .image-container, .image-frame, button');
}

function simpleaiRemoveNativeGalleryDragPreview() {
    document.getElementById('simpleai-native-image-drag-preview')?.remove();
}

function simpleaiSetSmallGalleryDragPreview(transfer, img) {
    const result = { attempted: false, set_ok: false, width: null, height: null };
    if (!transfer || !img) return result;
    const src = simpleaiMediaSrc(img);
    if (!src) return result;

    simpleaiRemoveNativeGalleryDragPreview();
    const preview = document.createElement('div');
    preview.id = 'simpleai-native-image-drag-preview';
    const naturalWidth = Number(img.naturalWidth || 0);
    const naturalHeight = Number(img.naturalHeight || 0);
    const ratio = naturalWidth > 0 && naturalHeight > 0 ? naturalHeight / naturalWidth : 1;
    const width = SIMPLEAI_GALLERY_NATIVE_DRAG_PREVIEW_WIDTH;
    const height = Math.max(48, Math.min(160, Math.round(width * ratio)));
    preview.style.position = 'fixed';
    preview.style.left = '-10000px';
    preview.style.top = '-10000px';
    preview.style.width = `${width}px`;
    preview.style.height = `${height}px`;
    preview.style.pointerEvents = 'none';
    preview.style.opacity = '0.95';
    preview.style.borderRadius = '8px';
    preview.style.backgroundColor = '#111827';
    preview.style.backgroundImage = `url("${String(src).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}")`;
    preview.style.backgroundPosition = 'center';
    preview.style.backgroundRepeat = 'no-repeat';
    preview.style.backgroundSize = 'cover';
    preview.style.boxShadow = '0 10px 28px rgba(0, 0, 0, 0.35)';
    preview.style.zIndex = '2147483647';
    document.body.appendChild(preview);

    result.attempted = true;
    result.width = preview.offsetWidth || width;
    result.height = preview.offsetHeight || height;
    try {
        transfer.setDragImage(preview, Math.round(result.width / 2), Math.round(result.height / 2));
        result.set_ok = true;
    } catch (e) {}
    setTimeout(simpleaiRemoveNativeGalleryDragPreview, 0);
    return result;
}

function simpleaiRestoreManagedNativeGalleryDragSource(source) {
    if (!source || source.dataset?.simpleaiManagedNativeImageDragSource !== '1') return;
    const previous = source.dataset.simpleaiManagedNativeImageDragPrevious;
    try {
        if (previous === '__missing__' || previous === undefined) {
            source.removeAttribute('draggable');
            source.draggable = false;
        } else {
            source.setAttribute('draggable', previous);
            source.draggable = previous === 'true';
        }
    } catch (e) {}
    try { delete source.dataset.simpleaiManagedNativeImageDragSource; } catch (e) {}
    try { delete source.dataset.simpleaiManagedNativeImageDragPrevious; } catch (e) {}
}

function simpleaiResetManagedNativeGalleryImageDrag(img) {
    const managedSource = img?.closest?.('[data-simpleai-managed-native-image-drag-source="1"]');
    simpleaiRestoreManagedNativeGalleryDragSource(managedSource);
    try { if (!img.draggable) img.draggable = true; } catch (e) {}
    try { if (img.getAttribute('draggable') !== 'true') img.setAttribute('draggable', 'true'); } catch (e) {}
    try { delete img.dataset.simpleaiManagedNativeImageDragImage; } catch (e) {}
}

function simpleaiEnableNativeGalleryImageDrag(img) {
    if (!img?.matches?.(SIMPLEAI_GALLERY_NATIVE_DRAG_IMAGE_SELECTOR)) return;
    try { if (img.dataset.simpleaiGalleryNativeDragImage !== '1') img.dataset.simpleaiGalleryNativeDragImage = '1'; } catch (e) {}
    try {
        if (img.dataset.simpleaiGalleryPointerDragImage !== undefined) delete img.dataset.simpleaiGalleryPointerDragImage;
    } catch (e) {}
    if (img.dataset.simpleaiGalleryNativeDragLoadSync !== '1') {
        img.dataset.simpleaiGalleryNativeDragLoadSync = '1';
        img.addEventListener('load', simpleaiScheduleGalleryNativeDragImageSync, { passive: true });
    }

    const plan = simpleaiGalleryDownloadDragPlan(img);
    const source = plan.useDownload ? simpleaiGalleryDedicatedDownloadDragSource(img) : null;
    if (!source) {
        simpleaiResetManagedNativeGalleryImageDrag(img);
        return;
    }

    const oldManagedSource = img.closest?.('[data-simpleai-managed-native-image-drag-source="1"]');
    if (oldManagedSource && oldManagedSource !== source) {
        simpleaiRestoreManagedNativeGalleryDragSource(oldManagedSource);
    }
    if (source.dataset.simpleaiManagedNativeImageDragSource !== '1') {
        const previous = source.getAttribute('draggable');
        source.dataset.simpleaiManagedNativeImageDragPrevious = previous === null ? '__missing__' : previous;
        source.dataset.simpleaiManagedNativeImageDragSource = '1';
    }
    try { source.draggable = true; } catch (e) {}
    try { source.setAttribute('draggable', 'true'); } catch (e) {}
    try { img.draggable = false; } catch (e) {}
    try { img.setAttribute('draggable', 'false'); } catch (e) {}
    try { img.dataset.simpleaiManagedNativeImageDragImage = '1'; } catch (e) {}
}

function simpleaiPrepareGalleryNativeDragSource(event) {
    if (event?.button !== undefined && event.button !== 0) return;
    simpleaiRemoveNativeGalleryDragPreview();
    if (simpleaiGalleryOriginalDragClearTimer) {
        clearTimeout(simpleaiGalleryOriginalDragClearTimer);
        simpleaiGalleryOriginalDragClearTimer = 0;
    }
    try { delete window.__simpleaiGalleryOriginalDragUrl; } catch (e) {}
    const img = simpleaiGalleryNativeDragImageFromEvent(event);
    if (img) simpleaiEnableNativeGalleryImageDrag(img);
}

function simpleaiSyncGalleryNativeDragImages() {
    simpleaiGalleryNativeDragSyncFrame = 0;
    let scope = document;
    try { scope = typeof gradioApp === 'function' ? (gradioApp() || document) : document; } catch (e) {}
    scope.querySelectorAll?.('.simpleai-gallery-external-drag-handle').forEach((handle) => handle.remove());
    document.getElementById('simpleai-gallery-external-drag-style')?.remove();
    scope.querySelectorAll?.('[data-simpleai-managed-native-image-drag-source="1"]').forEach((source) => {
        const img = source.querySelector?.('img[data-simpleai-managed-native-image-drag-image="1"]');
        if (!img?.matches?.(SIMPLEAI_GALLERY_NATIVE_DRAG_IMAGE_SELECTOR)) {
            simpleaiRestoreManagedNativeGalleryDragSource(source);
        }
    });
    scope.querySelectorAll?.(SIMPLEAI_GALLERY_NATIVE_DRAG_IMAGE_SELECTOR).forEach(simpleaiEnableNativeGalleryImageDrag);
}

function simpleaiScheduleGalleryNativeDragImageSync() {
    if (simpleaiGalleryNativeDragSyncFrame) return;
    simpleaiGalleryNativeDragSyncFrame = requestAnimationFrame(simpleaiSyncGalleryNativeDragImages);
}

function simpleaiHandleGalleryNativeDragStart(event) {
    const img = simpleaiGalleryNativeDragImageFromEvent(event);
    if (!img) return;
    const transfer = event.dataTransfer;
    const plan = simpleaiGalleryDownloadDragPlan(img);
    const displaySrc = plan.displaySrc;
    const previewOriginalSrc = plan.previewOriginalSrc;
    const originalSrc = plan.originalSrc;
    const originalSourceKind = plan.originalSourceKind;
    const url = simpleaiAbsoluteGalleryImageSrc(originalSrc);
    const loadedWidth = plan.loadedWidth;
    const loadedHeight = plan.loadedHeight;
    const declaredDimensions = plan.declaredDimensions;
    const largeOriginalDownload = plan.largeOriginalDownload;
    const managedSource = simpleaiGalleryDedicatedDownloadDragSource(img);
    const dedicatedDragSource = Boolean(
        plan.useDownload
        && managedSource?.dataset?.simpleaiManagedNativeImageDragSource === '1'
        && event.target === managedSource
    );
    const transferTypesBefore = simpleaiGalleryTransferTypes(transfer);
    let effectAllowedBefore = '';
    try { effectAllowedBefore = String(transfer?.effectAllowed || ''); } catch (e) {}
    const diagnostic = {
        trusted: Boolean(event.isTrusted),
        surface_id: img.closest?.(SIMPLEAI_GALLERY_NATIVE_DRAG_CONTAINER_SELECTOR)?.id || '',
        drag_source_tag: String(event.target?.tagName || '').toLowerCase(),
        dedicated_drag_source: dedicatedDragSource,
        display_source_kind: simpleaiGalleryDragSourceKind(displaySrc),
        original_source_kind: originalSourceKind,
        download_source_kind: simpleaiGalleryDragSourceKind(plan.downloadSrc),
        preview_original_found: Boolean(previewOriginalSrc),
        original_source_found: Boolean(originalSrc),
        download_source_found: Boolean(plan.downloadSrc),
        transfer_found: Boolean(transfer),
        loaded_width: loadedWidth || null,
        loaded_height: loadedHeight || null,
        loaded_pixels: loadedWidth > 0 && loadedHeight > 0 ? loadedWidth * loadedHeight : null,
        declared_width: declaredDimensions?.width || null,
        declared_height: declaredDimensions?.height || null,
        declared_pixels: declaredDimensions ? declaredDimensions.width * declaredDimensions.height : null,
        large_original_download: largeOriginalDownload,
        download_reason: previewOriginalSrc ? 'gallery-preview' : largeOriginalDownload ? 'large-original' : '',
        original_mime_type: originalSrc ? simpleaiGalleryImageMimeType(originalSrc) : '',
        effect_allowed_before: effectAllowedBefore,
        effect_allowed_after: effectAllowedBefore,
        files_type_before: transferTypesBefore.some((type) => type.toLowerCase() === 'files'),
        files_type_after: false,
        original_url: { attempted: false, set_ok: false, readback_matches: null },
        uri_list: { attempted: false, set_ok: false, readback_matches: null },
        plain_text: { attempted: false, set_ok: false, readback_matches: null },
        download_url: { attempted: false, set_ok: false, readback_matches: null },
        drag_preview: { attempted: false, set_ok: false, width: null, height: null },
        transfer_types: [],
        outcome: !transfer ? 'missing-transfer' : !originalSrc ? 'missing-original-source' : 'prepared',
    };
    if (!transfer || !originalSrc) {
        try { window.SimpAIStudioPerformance?.mark('gallery.native_drag_start', diagnostic); } catch (e) {}
        return;
    }
    const dragVersion = ++simpleaiGalleryNativeDragVersion;
    if (dedicatedDragSource) {
        try { transfer.effectAllowed = 'copy'; } catch (e) {}
        diagnostic.drag_preview = simpleaiSetSmallGalleryDragPreview(transfer, img);
    }
    try { window.__simpleaiGalleryOriginalDragUrl = url; } catch (e) {}
    diagnostic.original_url = simpleaiSetGalleryDragTransferData(transfer, SIMPLEAI_GALLERY_ORIGINAL_DRAG_URL_TYPE, url);
    if (!dedicatedDragSource) {
        diagnostic.uri_list = simpleaiSetGalleryDragTransferData(transfer, 'text/uri-list', url);
        diagnostic.plain_text = simpleaiSetGalleryDragTransferData(transfer, 'text/plain', url);
    }
    if (plan.useDownload) {
        diagnostic.download_url = simpleaiSetGalleryPreviewOriginalDownload(transfer, url, plan.downloadSrc);
    }
    diagnostic.transfer_types = simpleaiGalleryTransferTypes(transfer);
    diagnostic.files_type_after = diagnostic.transfer_types.some((type) => type.toLowerCase() === 'files');
    try { diagnostic.effect_allowed_after = String(transfer.effectAllowed || ''); } catch (e) {}
    try { window.SimpAIStudioPerformance?.mark('gallery.native_drag_start', diagnostic); } catch (e) {}
    simpleaiClearGalleryOriginalDragUrl(30000, dragVersion);
}

function simpleaiHandleGalleryNativeDragEnd() {
    simpleaiRemoveNativeGalleryDragPreview();
    simpleaiClearGalleryOriginalDragUrl(200);
}

function simpleaiAbsoluteGalleryImageSrc(src) {
    const value = String(src || '');
    if (!value) return '';
    try {
        return new URL(value, document.baseURI || window.location?.href || location.href).href;
    } catch (e) {
        return value;
    }
}

function simpleaiGalleryImageMimeType(src) {
    const path = String(src || '').split('?', 1)[0].toLowerCase();
    if (path.endsWith('.mp4')) return 'video/mp4';
    if (path.endsWith('.webm')) return 'video/webm';
    if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg';
    if (path.endsWith('.webp')) return 'image/webp';
    if (path.endsWith('.gif')) return 'image/gif';
    if (path.endsWith('.bmp')) return 'image/bmp';
    return 'image/png';
}

function simpleaiGalleryImageFileName(src) {
    try {
        const url = new URL(src, document.baseURI || window.location?.href || location.href);
        const rawName = url.pathname.split('/').filter(Boolean).pop() || 'image.png';
        return decodeURIComponent(rawName).replace(/[\\/:*?"<>|]+/g, '_') || 'image.png';
    } catch (e) {
        return 'image.png';
    }
}

function simpleaiGalleryDragSourceKind(src) {
    const value = String(src || '').trim();
    if (!value) return 'missing';
    if (/^data:image\//i.test(value)) return 'data-image';
    if (/^blob:/i.test(value)) return 'blob';
    try {
        const url = new URL(value, document.baseURI || window.location?.href || location.href);
        const path = String(url.pathname || '').toLowerCase();
        if (path.includes('/simpleai/gallery-preview/')) return 'gallery-preview';
        if (path.includes('/simpleai/gallery-download/')) return 'gallery-download';
        if (path.includes('/gradio_api/file=') || path.includes('/file=')) return 'gradio-file';
        return /^https?:$/i.test(url.protocol) ? 'http-image' : 'other-url';
    } catch (e) {
        return 'unparsed';
    }
}

function simpleaiGalleryDeclaredDragDimensions(img) {
    const hosts = [
        img?.closest?.('.gallery-item, .thumbnail-item, .media-button, .image-container, .image-frame'),
        img?.parentElement,
    ].filter(Boolean);
    for (const host of hosts) {
        const text = String(host.querySelector?.('.simpai-media-resolution-badge')?.textContent || '');
        const match = text.match(/(\d{2,6})\s*[xX\u00d7]\s*(\d{2,6})/);
        if (!match) continue;
        const width = Number(match[1]);
        const height = Number(match[2]);
        if (width > 0 && height > 0) return { width, height };
    }
    return null;
}

function simpleaiGalleryNeedsExternalOriginalDownload(width, height) {
    const imageWidth = Math.round(Number(width || 0));
    const imageHeight = Math.round(Number(height || 0));
    if (imageWidth <= 0 || imageHeight <= 0) return false;
    return imageWidth * imageHeight > SIMPLEAI_GALLERY_LARGE_NATIVE_DRAG_PIXEL_LIMIT
        || imageWidth >= SIMPLEAI_GALLERY_LARGE_NATIVE_DRAG_EDGE_LIMIT
        || imageHeight >= SIMPLEAI_GALLERY_LARGE_NATIVE_DRAG_EDGE_LIMIT;
}

function simpleaiGalleryDownloadDragPlan(img) {
    const displaySrc = simpleaiMediaSrc(img);
    const previewOriginalSrc = simpleaiGalleryDisplayPreviewOriginalSrc(displaySrc);
    const originalSrc = previewOriginalSrc || displaySrc;
    const originalSourceKind = simpleaiGalleryDragSourceKind(originalSrc);
    const loadedWidth = Math.round(Number(img?.naturalWidth || 0));
    const loadedHeight = Math.round(Number(img?.naturalHeight || 0));
    const declaredDimensions = simpleaiGalleryDeclaredDragDimensions(img);
    const dragWidth = Math.max(loadedWidth, Number(declaredDimensions?.width || 0));
    const dragHeight = Math.max(loadedHeight, Number(declaredDimensions?.height || 0));
    const largeOriginalDownload = !previewOriginalSrc
        && (originalSourceKind === 'gradio-file' || originalSourceKind === 'http-image')
        && simpleaiGalleryNeedsExternalOriginalDownload(dragWidth, dragHeight);
    const useDownload = Boolean(previewOriginalSrc || largeOriginalDownload);
    const downloadSrc = useDownload ? simpleaiGalleryOriginalDownloadSrc(displaySrc, originalSrc) : '';
    return {
        displaySrc,
        previewOriginalSrc,
        originalSrc,
        originalSourceKind,
        loadedWidth,
        loadedHeight,
        declaredDimensions,
        largeOriginalDownload,
        useDownload: Boolean(useDownload && downloadSrc),
        downloadSrc,
    };
}

function simpleaiGalleryTransferTypes(transfer) {
    try {
        return Array.from(transfer?.types || [])
            .slice(0, 20)
            .map((type) => String(type).slice(0, 120));
    } catch (e) {
        return [];
    }
}

function simpleaiSetGalleryDragTransferData(transfer, type, value) {
    const result = { attempted: true, set_ok: false, readback_matches: null };
    try {
        transfer.setData(type, value);
        result.set_ok = true;
    } catch (e) {
        return result;
    }
    try {
        result.readback_matches = transfer.getData(type) === value;
    } catch (e) {}
    return result;
}

function simpleaiSetGalleryPreviewOriginalDownload(transfer, originalSrc, downloadSrc = originalSrc) {
    if (!transfer || !originalSrc || !downloadSrc) return { attempted: false, set_ok: false, readback_matches: null };
    const fileName = simpleaiGalleryImageFileName(originalSrc);
    const mimeType = simpleaiGalleryImageMimeType(originalSrc);
    return simpleaiSetGalleryDragTransferData(transfer, 'DownloadURL', `${mimeType}:${fileName}:${downloadSrc}`);
}

function simpleaiClearGalleryOriginalDragUrl(delay = 0, expectedVersion = simpleaiGalleryNativeDragVersion) {
    if (simpleaiGalleryOriginalDragClearTimer) clearTimeout(simpleaiGalleryOriginalDragClearTimer);
    simpleaiGalleryOriginalDragClearTimer = setTimeout(() => {
        simpleaiGalleryOriginalDragClearTimer = 0;
        if (simpleaiGalleryNativeDragVersion !== expectedVersion) return;
        try { delete window.__simpleaiGalleryOriginalDragUrl; } catch (e) {}
    }, delay);
}

function simpleaiClipboardItemSupports(type) {
    try {
        if (!window.ClipboardItem) return false;
        if (typeof window.ClipboardItem.supports === 'function') return window.ClipboardItem.supports(type);
        return type === 'image/png';
    } catch (e) {
        return false;
    }
}

async function simpleaiCopyBlobToClipboardForPaste(blob, preferredType) {
    if (!blob || !navigator.clipboard || !navigator.clipboard.write || !window.ClipboardItem) return false;
    const type = blob.type || preferredType || 'image/png';
    if (simpleaiClipboardItemSupports(type)) {
        await navigator.clipboard.write([new ClipboardItem({ [type]: blob })]);
        return true;
    }
    if (!simpleaiClipboardItemSupports('image/png')) return false;
    const bitmap = await createImageBitmap(blob);
    try {
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width || 1;
        canvas.height = bitmap.height || 1;
        const ctx = canvas.getContext('2d');
        if (!ctx) return false;
        ctx.drawImage(bitmap, 0, 0);
        const pngBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
        if (!pngBlob) return false;
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
        return true;
    } finally {
        try { bitmap.close?.(); } catch (e) {}
    }
}

function simpleaiFetchImageBlobForClipboard(url) {
    return fetch(url, { credentials: 'same-origin' }).then((response) => {
        if (!response.ok) throw new Error('image fetch failed');
        return response.blob();
    });
}

async function simpleaiConvertBlobToPngForClipboard(blob) {
    const bitmap = await createImageBitmap(blob);
    try {
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width || 1;
        canvas.height = bitmap.height || 1;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('canvas unavailable');
        ctx.drawImage(bitmap, 0, 0);
        const pngBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
        if (!pngBlob) throw new Error('png encode failed');
        return pngBlob;
    } finally {
        try { bitmap.close?.(); } catch (e) {}
    }
}

function simpleaiCopyGalleryImageForPaste(originalSrc) {
    const url = simpleaiAbsoluteGalleryImageSrc(originalSrc);
    if (!url || !navigator.clipboard || !navigator.clipboard.write || !window.ClipboardItem) return Promise.resolve(false);
    const type = simpleaiGalleryImageMimeType(url);
    try {
        if (simpleaiClipboardItemSupports(type)) {
            return navigator.clipboard.write([
                new ClipboardItem({ [type]: simpleaiFetchImageBlobForClipboard(url) })
            ]).then(() => true, () => false);
        }
        if (!simpleaiClipboardItemSupports('image/png')) return Promise.resolve(false);
        return navigator.clipboard.write([
            new ClipboardItem({
                'image/png': simpleaiFetchImageBlobForClipboard(url).then(simpleaiConvertBlobToPngForClipboard)
            })
        ]).then(() => true, () => false);
    } catch (e) {
        return Promise.resolve(false);
    }
}

function simpleaiRestoreGalleryOriginalContextImage(state = simpleaiGalleryOriginalContextState) {
    if (!state || !state.img) return;
    if (state.restoreTimer) {
        clearTimeout(state.restoreTimer);
        state.restoreTimer = null;
    }
    const img = state.img;
    if (state.attrSrc === null) {
        img.removeAttribute?.('src');
        if (state.previewSrc) img.src = state.previewSrc;
    } else {
        img.setAttribute?.('src', state.attrSrc);
        img.src = state.attrSrc;
    }
    if (state.attrSrcset === null) img.removeAttribute?.('srcset');
    else img.setAttribute?.('srcset', state.attrSrcset);
    if (state.attrSizes === null) img.removeAttribute?.('sizes');
    else img.setAttribute?.('sizes', state.attrSizes);
    delete img.dataset.simpleaiGalleryOriginalContext;
    delete img.dataset.simpleaiGalleryOriginalContextPreviewSrc;
    if (simpleaiGalleryOriginalContextState === state) simpleaiGalleryOriginalContextState = null;
}

function simpleaiPrepareGalleryOriginalContextMenu(event) {
    const img = simpleaiGalleryNativeDragImageFromEvent(event);
    if (!img) return;
    const previewSrc = simpleaiMediaSrc(img);
    const originalSrc = simpleaiGalleryDisplayPreviewOriginalSrc(previewSrc);
    if (!originalSrc || simpleaiGalleryOriginalSourceIsVideo(originalSrc)) return;
    simpleaiRestoreGalleryOriginalContextImage();
    const state = {
        img,
        previewSrc,
        originalSrc,
        attrSrc: img.getAttribute?.('src') ?? null,
        attrSrcset: img.getAttribute?.('srcset') ?? null,
        attrSizes: img.getAttribute?.('sizes') ?? null,
        restoreTimer: null,
    };
    simpleaiGalleryOriginalContextState = state;
    img.dataset.simpleaiGalleryOriginalContext = '1';
    img.dataset.simpleaiGalleryOriginalContextPreviewSrc = previewSrc;
    img.removeAttribute?.('srcset');
    img.removeAttribute?.('sizes');
    img.setAttribute?.('src', originalSrc);
    img.src = originalSrc;
    state.restoreTimer = setTimeout(() => {
        simpleaiRestoreGalleryOriginalContextImage(state);
    }, SIMPLEAI_GALLERY_ORIGINAL_CONTEXT_RESTORE_MS);
}

function simpleaiHandleGalleryOriginalContextPointerDown() {
    if (simpleaiGalleryOriginalContextState) simpleaiRestoreGalleryOriginalContextImage();
}

function simpleaiPrepareGalleryOriginalContextPointerDown(event) {
    if (event?.button !== 2) return;
    simpleaiPrepareGalleryOriginalContextMenu(event);
}

function simpleaiTrackGalleryOriginalCopyImage(event) {
    const img = simpleaiGalleryNativeDragImageFromEvent(event);
    if (img && simpleaiGalleryDisplayPreviewOriginalSrc(simpleaiMediaSrc(img))) {
        simpleaiGalleryOriginalCopyImage = img;
    }
}

function simpleaiIsEditableCopyTarget(target) {
    if (!target || !target.closest) return false;
    return !!target.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]');
}

function simpleaiCurrentGalleryOriginalCopyImage() {
    if (simpleaiGalleryOriginalCopyImage && simpleaiGalleryOriginalCopyImage.isConnected) {
        return simpleaiGalleryOriginalCopyImage;
    }
    return gradioApp()?.querySelector?.(
        '#finished_gallery .gallery-container > .preview img, #final_gallery .gallery-container > .preview img'
    ) || null;
}

function simpleaiHandleGalleryOriginalCopyKeyDown(event) {
    const key = String(event?.key || '').toLowerCase();
    if (key !== 'c' || (!event.ctrlKey && !event.metaKey) || event.altKey || event.shiftKey) return;
    if (simpleaiIsEditableCopyTarget(event.target)) return;
    const img = simpleaiCurrentGalleryOriginalCopyImage();
    if (!img) return;
    const originalSrc = simpleaiGalleryDisplayPreviewOriginalSrc(simpleaiMediaSrc(img));
    if (!originalSrc || simpleaiGalleryOriginalSourceIsVideo(originalSrc)) return;
    event.preventDefault();
    simpleaiCopyGalleryImageForPaste(originalSrc);
}

function simpleaiHandleGalleryOriginalContextKeyUp(event) {
    if (event?.key === 'Escape') simpleaiRestoreGalleryOriginalContextImage();
}

function simpleaiHandleGalleryOriginalContextVisibilityChange() {
    if (document.hidden) simpleaiRestoreGalleryOriginalContextImage();
}

function modalImageSwitch(offset) {
    var galleryButtons = all_gallery_buttons();

    if (galleryButtons.length > 1) {
        var currentButton = selected_gallery_button();

        var result = -1;
        galleryButtons.forEach(function(v, i) {
            if (v == currentButton) {
                result = i;
            }
        });

        if (result != -1) {
            var nextButton = galleryButtons[negmod((result + offset), galleryButtons.length)];
            nextButton.click();
            const nextMedia = simpleaiGalleryButtonMedia(nextButton);
            const nextSrc = simpleaiMediaSrc(nextMedia);
            const modalImage = gradioApp().getElementById("modalImage");
            const modal = gradioApp().getElementById("lightboxModal");
            if (nextSrc) {
                modalImage.src = nextSrc;
                if (modalImage.style.display === 'none') {
                    modal.style.setProperty('background-image', `url(${modalImage.src})`);
                }
            }
            setTimeout(function() {
                modal.focus();
            }, 10);
        }
    }
}

function saveImage() {

}

function modalSaveImage(event) {
    event.stopPropagation();
}

function modalNextImage(event) {
    modalImageSwitch(1);
    event.stopPropagation();
}

function modalPrevImage(event) {
    modalImageSwitch(-1);
    event.stopPropagation();
}

function modalKeyHandler(event) {
    switch (event.key) {
    case "s":
        saveImage();
        break;
    case "ArrowLeft":
        modalPrevImage(event);
        break;
    case "ArrowRight":
        modalNextImage(event);
        break;
    case "Escape":
        closeModal();
        break;
    }
}

function setupImageForLightbox(e) {
    if (!simpleaiShouldUseLightboxImage(e)) {
        return;
    }
    if (e.dataset.modded) {
        return;
    }

    e.dataset.modded = true;
    e.style.cursor = 'pointer';
    e.style.userSelect = 'none';

    var isFirefox = navigator.userAgent.toLowerCase().indexOf('firefox') > -1;

    // For Firefox, listening on click first switched to next image then shows the lightbox.
    // If you know how to fix this without switching to mousedown event, please.
    // For other browsers the event is click to make it possiblr to drag picture.
    var event = isFirefox ? 'mousedown' : 'click';

    e.addEventListener(event, function(evt) {
        if (evt.button == 1) {
            open(evt.target.src);
            evt.preventDefault();
            return;
        }
        if (evt.button != 0) return;

        modalZoomSet(gradioApp().getElementById('modalImage'), true);
        evt.preventDefault();
        showModal(evt);
    }, true);

}

function simpleaiIsManagedGalleryGridMedia(elem) {
    if (!elem || !elem.closest) return false;
    return !!elem.closest('#finished_gallery .grid-wrap .gallery-item, #final_gallery .grid-wrap .gallery-item');
}

function simpleaiShouldUseLightboxImage(elem) {
    if (!elem || !elem.closest) return false;
    const originalSrc = simpleaiGalleryDisplayPreviewOriginalSrc(simpleaiMediaSrc(elem));
    if (simpleaiGalleryOriginalSourceIsVideo(originalSrc)) return false;
    // Let Gradio 6 keep owning multi-gallery grid clicks so a tile opens the
    // native single-preview/toolbox mode instead of the custom fullscreen viewer.
    if (simpleaiIsManagedGalleryGridMedia(elem)) return false;
    return true;
}

function simpleaiLightboxImages() {
    const selector = [
        '.image_gallery > div > img',
        '#finished_gallery .gallery-container > .preview .media-button img',
        '#final_gallery .gallery-container > .preview .media-button img'
    ].join(', ');
    return Array.from(gradioApp().querySelectorAll(selector)).filter(simpleaiShouldUseLightboxImage);
}

function simpleaiBindGalleryLightbox() {
    simpleaiLightboxImages().forEach(setupImageForLightbox);
}

function simpleaiManagedGalleryRoot(elem) {
    if (!elem || !elem.closest) return null;
    return elem.closest('#finished_gallery, #final_gallery');
}

function simpleaiGalleryPreview(root) {
    return root && root.querySelector ? root.querySelector('.gallery-container > .preview') : null;
}

function simpleaiIsGalleryFullscreenButton(button) {
    if (!button) return false;
    if (button.querySelector('svg.feather-maximize, svg.feather-maximize-2, svg.feather-minimize, svg.feather-minimize-2')) return true;
    const icon = button.querySelector('svg');
    const iconLabel = icon ? [
        icon.getAttribute('class') || '',
        icon.getAttribute('data-testid') || '',
        icon.getAttribute('data-lucide') || '',
        icon.getAttribute('aria-label') || ''
    ].join(' ').toLowerCase() : '';
    if (iconLabel.includes('fullscreen') || iconLabel.includes('maximize') || iconLabel.includes('minimize')) return true;
    const label = [
        button.getAttribute('aria-label') || '',
        button.getAttribute('title') || '',
        button.textContent || ''
    ].join(' ').toLowerCase();
    return label.includes('fullscreen') || label.includes('full screen') || label.includes('maximize') || label.includes('minimize') || label.includes('全屏');
}

function simpleaiHandleGalleryFullscreenClick(event, button, root) {
    if (!event || !root || !button || !button.closest('.preview') || !simpleaiIsGalleryFullscreenButton(button)) return false;

    event.preventDefault();
    event.stopImmediatePropagation();

    const exiting = root.classList.contains('simpleai-gallery-fullscreen') || !!button.querySelector('svg.feather-minimize, svg.feather-minimize-2');
    if (exiting) {
        simpleaiExitGalleryFullscreen(true);
    } else {
        simpleaiEnterGalleryFullscreen(root);
    }
    setTimeout(simpleaiSyncGalleryStateSoon, 0);
    return true;
}

function simpleaiEnterGalleryFullscreen(root) {
    if (!root) return;
    root.classList.add('simpleai-gallery-fullscreen');
    document.documentElement.classList.add('simpleai-gallery-fullscreen-open');
    document.body.classList.add('simpleai-gallery-fullscreen-open');

    try {
        if (root.requestFullscreen && document.fullscreenElement !== root) {
            const fullscreenPromise = root.requestFullscreen();
            if (fullscreenPromise && fullscreenPromise.catch) fullscreenPromise.catch(() => {});
        }
    } catch (e) {
        // The fixed overlay CSS is still used when browser fullscreen is blocked.
    }
}

function simpleaiExitGalleryFullscreen(exitBrowserFullscreen) {
    const roots = document.querySelectorAll('#finished_gallery.simpleai-gallery-fullscreen, #final_gallery.simpleai-gallery-fullscreen');
    roots.forEach((root) => root.classList.remove('simpleai-gallery-fullscreen'));
    document.documentElement.classList.remove('simpleai-gallery-fullscreen-open');
    document.body.classList.remove('simpleai-gallery-fullscreen-open');

    if (exitBrowserFullscreen && document.fullscreenElement) {
        let fullscreenRoot = simpleaiManagedGalleryRoot(document.fullscreenElement);
        if (!fullscreenRoot && document.fullscreenElement.matches && document.fullscreenElement.matches('#finished_gallery, #final_gallery')) {
            fullscreenRoot = document.fullscreenElement;
        }
        if (fullscreenRoot) {
            try {
                const exitPromise = document.exitFullscreen?.();
                if (exitPromise && exitPromise.catch) exitPromise.catch(() => {});
            } catch (e) {
                // Ignore browser fullscreen exit failures.
            }
        }
    }
}

function simpleaiSyncGalleryFullscreenState() {
    document.querySelectorAll('#finished_gallery.simpleai-gallery-fullscreen, #final_gallery.simpleai-gallery-fullscreen').forEach((root) => {
        if (!simpleaiGalleryPreview(root)) {
            simpleaiExitGalleryFullscreen(false);
        }
    });
}

function simpleaiAnyManagedGalleryPreviewOpen() {
    if (document.querySelector('#finished_gallery .gallery-container > .preview, #final_gallery .gallery-container > .preview')) {
        return true;
    }
    if (document.documentElement.classList.contains('simpai-comparison-preview')) {
        const comparison = document.querySelector('#comparison_box');
        if (comparison) {
            const style = window.getComputedStyle ? window.getComputedStyle(comparison) : null;
            if (!style || (style.display !== 'none' && style.visibility !== 'hidden')) return true;
        }
    }
    const video = document.querySelector('#video_player');
    if (video) {
        const style = window.getComputedStyle ? window.getComputedStyle(video) : null;
        if (!style || (style.display !== 'none' && style.visibility !== 'hidden')) {
            if (video.querySelector('video') || video.tagName === 'VIDEO') return true;
        }
    }
    return false;
}

function simpleaiMarkGalleryPreviewOpenPending(target) {
    if (!target || !target.closest) return false;
    const thumbnailTarget = target.closest([
        '#finished_gallery .thumbnails .thumbnail-item',
        '#final_gallery .thumbnails .thumbnail-item'
    ].join(', '));
    if (thumbnailTarget && simpleaiAnyManagedGalleryPreviewOpen()) {
        window.__simpleaiGalleryPreviewThumbnailSwitchUntil = Date.now() + SIMPLEAI_GALLERY_PREVIEW_THUMBNAIL_SWITCH_MS;
        window.__simpleaiGalleryPreviewOpenPendingUntil = 0;
        window.__simpleaiGalleryPreviewRevealReady = true;
        window.__simpleaiGalleryPreviewRevealTicks = 2;
        try { document.documentElement.classList.remove('simpai-gallery-toolbox-deferred'); } catch (e) {}
        return false;
    }

    const previewTarget = target.closest([
        '#finished_gallery .grid-wrap .gallery-item',
        '#final_gallery .grid-wrap .gallery-item'
    ].join(', '));
    if (!previewTarget) return false;
    if (target.closest('.delete-button, button[aria-label*="delete" i], button[title*="delete" i], button[aria-label*="删除"], button[title*="删除"]')) return false;
    window.__simpleaiGalleryPreviewOpenPendingUntil = Date.now() + SIMPLEAI_GALLERY_PREVIEW_OPEN_PENDING_MS;
    window.__simpleaiGalleryPreviewRevealReady = false;
    window.__simpleaiGalleryPreviewRevealTicks = 0;
    try { document.documentElement.classList.add('simpai-gallery-toolbox-deferred'); } catch (e) {}
    simpleaiScheduleGalleryPreviewDeferredReveal();
    return true;
}

function simpleaiScheduleGalleryPreviewDeferredReveal() {
    const until = Number(window.__simpleaiGalleryPreviewOpenPendingUntil || 0);
    try { clearTimeout(simpleaiGalleryPreviewDeferredRevealTimer); } catch (e) {}
    simpleaiGalleryPreviewDeferredRevealTimer = setTimeout(() => {
        try { simpleaiSyncGalleryToolboxState(); } catch (e) {}
    }, Math.max(0, until - Date.now()) + 80);
}

function simpleaiGalleryPreviewOpenPending() {
    const until = Number(window.__simpleaiGalleryPreviewOpenPendingUntil || 0);
    return until > Date.now();
}

function simpleaiGalleryPreviewThumbnailSwitchActive() {
    const until = Number(window.__simpleaiGalleryPreviewThumbnailSwitchUntil || 0);
    return until > Date.now();
}

function simpleaiGalleryPreviewRevealAllowed() {
    return simpleaiUpdateGalleryPreviewRevealAllowed(simpleaiAnyManagedGalleryPreviewOpen());
}

function simpleaiUpdateGalleryPreviewRevealAllowed(previewOpen) {
    const now = Date.now();
    if (!previewOpen) {
        if (simpleaiGalleryPreviewThumbnailSwitchActive()) {
            window.__simpleaiGalleryPreviewRevealReady = true;
            window.__simpleaiGalleryPreviewRevealTicks = 2;
            try { document.documentElement.classList.remove('simpai-gallery-toolbox-deferred'); } catch (e) {}
            return true;
        }
        simpleaiGalleryPreviewWasOpen = false;
        window.__simpleaiGalleryPreviewFirstSeenAt = 0;
        if (simpleaiGalleryPreviewOpenPending()) {
            window.__simpleaiGalleryPreviewRevealReady = false;
            window.__simpleaiGalleryPreviewRevealTicks = 0;
            try { document.documentElement.classList.add('simpai-gallery-toolbox-deferred'); } catch (e) {}
            return false;
        }
        window.__simpleaiGalleryPreviewRevealReady = true;
        window.__simpleaiGalleryPreviewRevealTicks = 0;
        try { document.documentElement.classList.remove('simpai-gallery-toolbox-deferred'); } catch (e) {}
        return true;
    }

    if (!simpleaiGalleryPreviewWasOpen) {
        simpleaiGalleryPreviewWasOpen = true;
        window.__simpleaiGalleryPreviewFirstSeenAt = now;
        if (simpleaiGalleryPreviewThumbnailSwitchActive()) {
            window.__simpleaiGalleryPreviewRevealReady = true;
            window.__simpleaiGalleryPreviewRevealTicks = 2;
            try { document.documentElement.classList.remove('simpai-gallery-toolbox-deferred'); } catch (e) {}
            return true;
        }
        const stableUntil = now + SIMPLEAI_GALLERY_PREVIEW_STABLE_MS;
        const pendingUntil = Number(window.__simpleaiGalleryPreviewOpenPendingUntil || 0);
        if (stableUntil > pendingUntil) {
            window.__simpleaiGalleryPreviewOpenPendingUntil = stableUntil;
            simpleaiScheduleGalleryPreviewDeferredReveal();
        }
    }

    if (simpleaiGalleryPreviewOpenPending()) {
        window.__simpleaiGalleryPreviewRevealReady = false;
        window.__simpleaiGalleryPreviewRevealTicks = 0;
        try { document.documentElement.classList.add('simpai-gallery-toolbox-deferred'); } catch (e) {}
        return false;
    }
    const ticks = Number(window.__simpleaiGalleryPreviewRevealTicks || 0) + 1;
    window.__simpleaiGalleryPreviewRevealTicks = ticks;
    const ready = ticks >= 2;
    window.__simpleaiGalleryPreviewRevealReady = ready;
    try { document.documentElement.classList.toggle('simpai-gallery-toolbox-deferred', !ready); } catch (e) {}
    return ready;
}

window.simpleaiGalleryPreviewRevealAllowed = simpleaiGalleryPreviewRevealAllowed;

function simpleaiRevealGalleryToolbox(toolbox) {
    if (!toolbox) return;
    try {
        toolbox.classList.remove('simpleai-gallery-toolbox-hidden');
        toolbox.classList.remove('hidden');
        toolbox.classList.remove('hide');
    } catch (e) {}
    try { toolbox.removeAttribute('hidden'); } catch (e) {}
    try { toolbox.removeAttribute('aria-hidden'); } catch (e) {}
    try { toolbox.hidden = false; } catch (e) {}
    try { toolbox.style.removeProperty('display'); } catch (e) {}
    try { toolbox.style.removeProperty('visibility'); } catch (e) {}
    try { toolbox.style.removeProperty('pointer-events'); } catch (e) {}
    try {
        toolbox.querySelectorAll?.('button.toolbox_icon_btn, #compare_btn').forEach((button) => {
            button.classList.remove('simpleai-gallery-toolbox-hidden');
            button.classList.remove('hidden');
            button.removeAttribute('hidden');
            button.removeAttribute('aria-hidden');
            button.hidden = false;
            button.style.removeProperty('display');
            button.style.removeProperty('visibility');
            button.style.removeProperty('pointer-events');
        });
    } catch (e) {}
}

function simpleaiSyncGalleryToolboxState() {
    const imageToolsDisabled = document.documentElement.classList.contains('simpleai-image-tools-disabled');
    const previewOpen = simpleaiAnyManagedGalleryPreviewOpen();
    const revealAllowed = simpleaiUpdateGalleryPreviewRevealAllowed(previewOpen);
    const hidden = imageToolsDisabled || !(previewOpen && revealAllowed);
    const toolboxes = document.querySelectorAll(
        '#image_toolbox, .toolbox, .gr-group:has(> .styler > button.toolbox_icon_btn)'
    );
    toolboxes.forEach((toolbox) => {
        if (hidden) {
            toolbox.classList.add('simpleai-gallery-toolbox-hidden');
        } else {
            simpleaiRevealGalleryToolbox(toolbox);
        }
    });
    if (previewOpen && !revealAllowed) {
        setTimeout(simpleaiSyncGalleryToolboxState, 80);
    }
}

document.addEventListener('pointerdown', function(event) {
    if (event && event.button != null && event.button !== 0) return;
    const target = event && event.target ? event.target : null;
    if (!target || !target.closest) return;
    if (!simpleaiManagedGalleryRoot(target)) return;
    if (simpleaiMarkGalleryPreviewOpenPending(target)) {
        simpleaiSyncGalleryToolboxState();
    }
}, true);

function simpleaiSyncGalleryStateSoon() {
    simpleaiSyncCachedGalleryVideoPreviews();
    simpleaiSyncGalleryFullscreenState();
    simpleaiSyncGalleryToolboxState();
    setTimeout(() => {
        simpleaiSyncCachedGalleryVideoPreviews();
        simpleaiSyncGalleryFullscreenState();
        simpleaiSyncGalleryToolboxState();
    }, 60);
    setTimeout(() => {
        simpleaiSyncCachedGalleryVideoPreviews();
        simpleaiSyncGalleryFullscreenState();
        simpleaiSyncGalleryToolboxState();
    }, 180);
}

const simpleaiComparisonSliderStates = new WeakMap();
let simpleaiActiveComparisonPan = null;

function simpleaiComparisonSliderScope() {
    try {
        if (typeof gradioApp === "function") return gradioApp();
    } catch (e) {}
    return document;
}

function simpleaiClampNumber(value, min, max) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return min;
    return Math.min(Math.max(numeric, min), max);
}

function simpleaiParseTransformState(transformText) {
    const fallback = { x: 0, y: 0, scale: 1 };
    if (!transformText || transformText === "none") return fallback;

    const matrix = transformText.match(/^matrix\(([^)]+)\)$/);
    if (matrix) {
        const parts = matrix[1].split(",").map((part) => Number(part.trim()));
        if (parts.length >= 6 && parts.every(Number.isFinite)) {
            return { x: parts[4], y: parts[5], scale: parts[0] || 1 };
        }
    }

    const translate = transformText.match(/translate(?:3d)?\(\s*([-.\d]+)px\s*,\s*([-.\d]+)px/i);
    const scale = transformText.match(/scale\(\s*([-.\d]+)/i);
    return {
        x: translate ? Number(translate[1]) || 0 : 0,
        y: translate ? Number(translate[2]) || 0 : 0,
        scale: scale ? Number(scale[1]) || 1 : 1
    };
}

function simpleaiComparisonElements(root) {
    if (!root || !root.querySelector) return null;
    const content = root.querySelector(".slider-wrap .wrap .content") || root.querySelector(".content");
    const wrap = root.querySelector(".slider-wrap .wrap") || root.querySelector(".wrap");
    const handle = root.querySelector(".slider-wrap .wrap .outer") || root.querySelector(".outer");
    const images = Array.from(root.querySelectorAll(".slider-wrap .content img.preview, .content img.preview, .slider-wrap .content img, .content img"))
        .filter((img, index, list) => list.indexOf(img) === index);
    if (!content || !wrap || images.length < 2) return null;
    return { content, wrap, handle, images, primary: images[0], overlay: images[1] };
}

function simpleaiComparisonVisible(root) {
    if (!root || !root.isConnected) return false;
    const style = window.getComputedStyle ? window.getComputedStyle(root) : null;
    if (style && (style.display === "none" || style.visibility === "hidden")) return false;
    const rect = root.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
}

function simpleaiComparisonGetState(root, els) {
    let state = simpleaiComparisonSliderStates.get(root);
    const signature = els.images.map((img) => img.currentSrc || img.src || "").join("|");
    if (!state || state.signature !== signature) {
        const parsed = simpleaiParseTransformState(els.primary.style.transform || window.getComputedStyle(els.primary).transform);
        state = {
            x: parsed.x,
            y: parsed.y,
            scale: simpleaiClampNumber(parsed.scale, 1, 15),
            position: 0.5,
            signature,
            scheduled: false,
            observer: state && state.observer,
            resizeObserver: state && state.resizeObserver
        };
        simpleaiComparisonSliderStates.set(root, state);
    }
    return state;
}

function simpleaiComparisonImageBase(els, state) {
    const contentRect = els.content.getBoundingClientRect();
    if (contentRect.width <= 0 || contentRect.height <= 0) return null;

    const naturalWidth = els.primary.naturalWidth || els.overlay.naturalWidth || 0;
    const naturalHeight = els.primary.naturalHeight || els.overlay.naturalHeight || 0;
    if (naturalWidth > 0 && naturalHeight > 0) {
        const naturalAspect = naturalWidth / naturalHeight;
        const containerAspect = contentRect.width / contentRect.height;
        const width = naturalAspect > containerAspect ? contentRect.width : contentRect.height * naturalAspect;
        const height = naturalAspect > containerAspect ? contentRect.width / naturalAspect : contentRect.height;
        return {
            left: (contentRect.width - width) / 2,
            top: (contentRect.height - height) / 2,
            width,
            height,
            originX: 0,
            originY: 0,
            clipBoxLeft: (contentRect.width - width) / 2,
            clipBoxTop: (contentRect.height - height) / 2,
            clipBoxWidth: width,
            clipBoxHeight: height,
            clipOriginX: 0,
            clipOriginY: 0,
            viewportWidth: contentRect.width,
            viewportHeight: contentRect.height,
            contentRect
        };
    }

    const scale = simpleaiClampNumber(state.scale, 1, 15) || 1;
    const imageRect = els.primary.getBoundingClientRect();
    if (imageRect.width <= 0 || imageRect.height <= 0) return null;
    return {
        left: imageRect.left - contentRect.left - state.x,
        top: imageRect.top - contentRect.top - state.y,
        width: imageRect.width / scale,
        height: imageRect.height / scale,
        originX: 0,
        originY: 0,
        clipBoxLeft: imageRect.left - contentRect.left - state.x,
        clipBoxTop: imageRect.top - contentRect.top - state.y,
        clipBoxWidth: imageRect.width / scale,
        clipBoxHeight: imageRect.height / scale,
        clipOriginX: 0,
        clipOriginY: 0,
        viewportWidth: contentRect.width,
        viewportHeight: contentRect.height,
        contentRect
    };
}

function simpleaiComparisonReadHandlePosition(els, base) {
    if (!els.handle || !base || base.width <= 0) return null;
    const transformText = els.handle.style.transform || window.getComputedStyle(els.handle).transform;
    let px = null;
    const matrix = transformText && transformText.match(/^matrix\(([^)]+)\)$/);
    if (matrix) {
        const parts = matrix[1].split(",").map((part) => Number(part.trim()));
        if (parts.length >= 6 && Number.isFinite(parts[4])) px = parts[4];
    }
    if (px === null) {
        const translated = transformText && transformText.match(/translateX\(\s*([-.\d]+)px/i);
        if (translated) px = Number(translated[1]);
    }
    if (px === null) {
        const handleRect = els.handle.getBoundingClientRect();
        const wrapRect = els.wrap.getBoundingClientRect();
        if (handleRect.width > 0 && wrapRect.width > 0) {
            px = handleRect.left - wrapRect.left + (handleRect.width / 2);
        }
    }
    if (px === null || !Number.isFinite(px)) return null;
    return simpleaiClampNumber((px - base.left) / base.width, 0, 1);
}

function simpleaiComparisonConstrain(state, base) {
    if (!state || !base) return;
    state.scale = simpleaiClampNumber(state.scale, 1, 15);
    if (state.scale <= 1.0001) {
        state.scale = 1;
        state.x = 0;
        state.y = 0;
        return;
    }

    const minX = base.width * (1 - state.scale);
    const minY = base.height * (1 - state.scale);
    state.x = simpleaiClampNumber(state.x, minX, 0);
    state.y = simpleaiClampNumber(state.y, minY, 0);
}

function simpleaiSetStyleProperty(el, prop, value) {
    if (!el || !el.style) return;
    if (el.style[prop] !== value) el.style[prop] = value;
}

function simpleaiSetImportantCssProperty(el, prop, value) {
    if (!el || !el.style) return;
    if (el.style.getPropertyValue(prop) !== value || el.style.getPropertyPriority(prop) !== "important") {
        el.style.setProperty(prop, value, "important");
    }
}

function simpleaiApplyComparisonImageGeometry(els, base) {
    if (!els || !base) return;
    simpleaiSetImportantCssProperty(els.content, "position", "relative");
    simpleaiSetImportantCssProperty(els.content, "overflow", "hidden");
    const left = `${base.left}px`;
    const top = `${base.top}px`;
    const width = `${base.width}px`;
    const height = `${base.height}px`;
    els.images.forEach((img) => {
        simpleaiSetImportantCssProperty(img, "position", "absolute");
        simpleaiSetImportantCssProperty(img, "left", left);
        simpleaiSetImportantCssProperty(img, "top", top);
        simpleaiSetImportantCssProperty(img, "right", "auto");
        simpleaiSetImportantCssProperty(img, "bottom", "auto");
        simpleaiSetImportantCssProperty(img, "width", width);
        simpleaiSetImportantCssProperty(img, "height", height);
        simpleaiSetImportantCssProperty(img, "min-width", "0px");
        simpleaiSetImportantCssProperty(img, "min-height", "0px");
        simpleaiSetImportantCssProperty(img, "max-width", "none");
        simpleaiSetImportantCssProperty(img, "max-height", "none");
        simpleaiSetImportantCssProperty(img, "object-fit", "fill");
    });
}

function simpleaiApplyComparisonSliderState(root, reason) {
    if (!simpleaiComparisonVisible(root)) return;
    const els = simpleaiComparisonElements(root);
    if (!els) return;
    const state = simpleaiComparisonGetState(root, els);
    const base = simpleaiComparisonImageBase(els, state);
    if (!base || base.width <= 0 || base.height <= 0) return;

    simpleaiApplyComparisonImageGeometry(els, base);
    const handlePosition = simpleaiComparisonReadHandlePosition(els, base);
    if (handlePosition !== null && reason !== "wheel" && reason !== "pan") {
        state.position = handlePosition;
    }
    state.position = simpleaiClampNumber(state.position, 0, 1);
    simpleaiComparisonConstrain(state, base);

    const transform = `translate(${state.x}px, ${state.y}px) scale(${state.scale})`;
    els.images.forEach((img) => {
        const originX = img === els.overlay ? base.clipOriginX : base.originX;
        const originY = img === els.overlay ? base.clipOriginY : base.originY;
        simpleaiSetImportantCssProperty(img, "transform-origin", `${originX}px ${originY}px`);
        simpleaiSetStyleProperty(img, "transform", transform);
        simpleaiSetStyleProperty(img, "cursor", state.scale > 1 ? "grab" : "zoom-in");
    });

    const handlePx = simpleaiClampNumber(base.left + base.width * state.position, 0, base.viewportWidth);
    const splitPx = base.left + base.width * state.position;
    const clipLocalPx = base.clipOriginX + ((splitPx - base.clipBoxLeft - base.clipOriginX - state.x) / state.scale);
    const clipPosition = simpleaiClampNumber(clipLocalPx / (base.clipBoxWidth || base.width), 0, 1);
    const clipPath = `inset(0 0 0 ${clipPosition * 100}%)`;
    simpleaiSetStyleProperty(els.overlay, "clipPath", clipPath);
    simpleaiSetStyleProperty(els.overlay, "webkitClipPath", clipPath);
    if (els.handle) {
        simpleaiSetStyleProperty(els.handle, "transform", `translateX(${handlePx}px)`);
    }
}

function simpleaiScheduleComparisonSliderSync(root, reason) {
    if (!root) return;
    const state = simpleaiComparisonSliderStates.get(root) || {};
    if (state.scheduled) return;
    state.scheduled = true;
    simpleaiComparisonSliderStates.set(root, state);
    requestAnimationFrame(() => {
        state.scheduled = false;
        simpleaiApplyComparisonSliderState(root, reason || "scheduled");
    });
}

function simpleaiComparisonPointInImage(event, base, state) {
    const x = event.clientX - base.contentRect.left;
    const y = event.clientY - base.contentRect.top;
    const left = base.left + state.x;
    const top = base.top + state.y;
    return x >= left && x <= left + base.width * state.scale && y >= top && y <= top + base.height * state.scale;
}

function simpleaiComparisonWheel(event, root) {
    const els = simpleaiComparisonElements(root);
    if (!els) return;
    const state = simpleaiComparisonGetState(root, els);
    const base = simpleaiComparisonImageBase(els, state);
    if (!base || !simpleaiComparisonPointInImage(event, base, state)) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const oldScale = state.scale || 1;
    const zoomFactor = event.deltaY < 0 ? 1.08 : 1 / 1.08;
    const newScale = simpleaiClampNumber(oldScale * zoomFactor, 1, 15);
    if (Math.abs(newScale - oldScale) < 0.0001) return;

    const cursorX = event.clientX - base.contentRect.left - base.left;
    const cursorY = event.clientY - base.contentRect.top - base.top;
    state.scale = newScale;
    state.x = cursorX - (newScale / oldScale) * (cursorX - state.x);
    state.y = cursorY - (newScale / oldScale) * (cursorY - state.y);
    simpleaiComparisonConstrain(state, base);
    simpleaiApplyComparisonSliderState(root, "wheel");
}

function simpleaiComparisonMouseDown(event, root) {
    if (event.button !== 0 || event.target.closest?.(".outer, .icon-wrap, button, a")) return;
    const els = simpleaiComparisonElements(root);
    if (!els) return;
    const state = simpleaiComparisonGetState(root, els);
    const base = simpleaiComparisonImageBase(els, state);
    if (!base || state.scale <= 1 || !simpleaiComparisonPointInImage(event, base, state)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    simpleaiActiveComparisonPan = { root, lastX: event.clientX, lastY: event.clientY };
    els.images.forEach((img) => simpleaiSetStyleProperty(img, "cursor", "grabbing"));
}

function simpleaiComparisonDocumentMouseMove(event) {
    if (!simpleaiActiveComparisonPan) return;
    const root = simpleaiActiveComparisonPan.root;
    const els = simpleaiComparisonElements(root);
    if (!els) return;
    const state = simpleaiComparisonGetState(root, els);
    const base = simpleaiComparisonImageBase(els, state);
    if (!base) return;

    state.x += event.clientX - simpleaiActiveComparisonPan.lastX;
    state.y += event.clientY - simpleaiActiveComparisonPan.lastY;
    simpleaiActiveComparisonPan.lastX = event.clientX;
    simpleaiActiveComparisonPan.lastY = event.clientY;
    simpleaiComparisonConstrain(state, base);
    simpleaiApplyComparisonSliderState(root, "pan");
}

function simpleaiComparisonDocumentMouseUp() {
    if (!simpleaiActiveComparisonPan) return;
    const root = simpleaiActiveComparisonPan.root;
    simpleaiActiveComparisonPan = null;
    simpleaiScheduleComparisonSliderSync(root, "pan_end");
}

function simpleaiInstallComparisonSliderPatch(root) {
    if (!root) return;
    const els = simpleaiComparisonElements(root);
    if (!els) return;

    const state = simpleaiComparisonGetState(root, els);

    if (els.content.dataset.simpleaiComparisonSliderContentPatched !== "1") {
        els.content.dataset.simpleaiComparisonSliderContentPatched = "1";
        const wheelHandler = (event) => simpleaiComparisonWheel(event, root);
        const mouseDownHandler = (event) => simpleaiComparisonMouseDown(event, root);
        els.content.addEventListener("wheel", wheelHandler, { capture: true, passive: false });
        els.content.addEventListener("mousedown", mouseDownHandler, { capture: true });
    }

    if (root.dataset.simpleaiComparisonSliderPatched !== "1") {
        root.dataset.simpleaiComparisonSliderPatched = "1";
        const observer = new MutationObserver(() => simpleaiScheduleComparisonSliderSync(root, "mutation"));
        observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["style", "class", "src"] });
        state.observer = observer;

        const resizeObserver = new ResizeObserver(() => simpleaiScheduleComparisonSliderSync(root, "resize"));
        resizeObserver.observe(root);
        state.resizeObserver = resizeObserver;
    }

    if (state.resizeObserver) {
        state.resizeObserver.observe(els.content);
        els.images.forEach((img) => {
            if (img.dataset.simpleaiComparisonResizeObserved !== "1") {
                img.dataset.simpleaiComparisonResizeObserved = "1";
                state.resizeObserver.observe(img);
                img.addEventListener("load", () => simpleaiScheduleComparisonSliderSync(root, "image_load"));
            }
        });
    }

    simpleaiScheduleComparisonSliderSync(root, "install");
}

function simpleaiSyncComparisonSliders() {
    const scope = simpleaiComparisonSliderScope();
    scope.querySelectorAll?.("#comparison_box").forEach(simpleaiInstallComparisonSliderPatch);
}

document.addEventListener("mousemove", simpleaiComparisonDocumentMouseMove, true);
document.addEventListener("mouseup", simpleaiComparisonDocumentMouseUp, true);
document.addEventListener('contextmenu', simpleaiPrepareGalleryOriginalContextMenu, true);
document.addEventListener('pointerdown', simpleaiHandleGalleryOriginalContextPointerDown, true);
document.addEventListener('pointerdown', simpleaiPrepareGalleryOriginalContextPointerDown, true);
document.addEventListener('mousedown', simpleaiPrepareGalleryOriginalContextPointerDown, true);
document.addEventListener('pointerover', simpleaiTrackGalleryOriginalCopyImage, true);
document.addEventListener('pointerdown', simpleaiTrackGalleryOriginalCopyImage, true);
document.addEventListener('pointerdown', simpleaiPrepareGalleryNativeDragSource, true);
document.addEventListener('mousedown', simpleaiPrepareGalleryNativeDragSource, true);
document.addEventListener('dragstart', simpleaiHandleGalleryNativeDragStart, true);
document.addEventListener('dragend', simpleaiHandleGalleryNativeDragEnd, true);
document.addEventListener('drop', simpleaiHandleGalleryNativeDragEnd, true);
document.addEventListener('keydown', simpleaiHandleGalleryOriginalCopyKeyDown, true);
document.addEventListener('keyup', simpleaiHandleGalleryOriginalContextKeyUp, true);
document.addEventListener('visibilitychange', simpleaiHandleGalleryOriginalContextVisibilityChange, true);
document.addEventListener('visibilitychange', simpleaiSyncCachedGalleryVideoPreviews, true);
window.addEventListener('pageshow', simpleaiScheduleGalleryNativeDragImageSync, true);
window.addEventListener('pagehide', simpleaiRestoreGalleryOriginalContextImage, true);
window.addEventListener("resize", () => {
    const scope = simpleaiComparisonSliderScope();
    scope.querySelectorAll?.("#comparison_box").forEach((root) => simpleaiScheduleComparisonSliderSync(root, "window_resize"));
});

if (typeof onUiLoaded === "function") {
    onUiLoaded(async () => {
        simpleaiSyncCachedGalleryVideoPreviews();
        simpleaiSyncGalleryNativeDragImages();
        simpleaiSyncComparisonSliders();
        setTimeout(simpleaiSyncComparisonSliders, 100);
        setTimeout(simpleaiSyncComparisonSliders, 600);
    });
}
if (typeof onAfterUiUpdate === "function") {
    onAfterUiUpdate(simpleaiScheduleGalleryNativeDragImageSync);
    onAfterUiUpdate(simpleaiSyncCachedGalleryVideoPreviews);
    onAfterUiUpdate(simpleaiSyncComparisonSliders);
}
simpleaiScheduleGalleryNativeDragImageSync();
simpleaiSyncCachedGalleryVideoPreviews();
window.simpleaiSyncComparisonSliders = simpleaiSyncComparisonSliders;
window.simpleaiSyncCachedGalleryVideoPreviews = simpleaiSyncCachedGalleryVideoPreviews;

document.addEventListener('click', function(event) {
    const target = event.target;
    if (!target || !target.closest) return;
    if (simpleaiManagedGalleryRoot(target)) {
        simpleaiMarkGalleryPreviewOpenPending(target);
        simpleaiSyncGalleryStateSoon();
    }

    const outputDeleteButton = target.closest('#finished_gallery .delete-button, #final_gallery .delete-button');
    if (outputDeleteButton) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
    }

    const button = target.closest('button');
    const root = simpleaiManagedGalleryRoot(button);
    if (simpleaiHandleGalleryFullscreenClick(event, button, root)) return;
}, true);

document.addEventListener('click', function(event) {
    const target = event.target;
    if (target && target.closest && target.closest('#finished_gallery, #final_gallery')) {
        setTimeout(simpleaiSyncGalleryStateSoon, 0);
    }
}, false);

document.addEventListener('fullscreenchange', function() {
    if (!document.fullscreenElement) {
        simpleaiExitGalleryFullscreen(false);
    }
});

document.addEventListener('keydown', function(event) {
    if (event && event.key === 'Escape') {
        setTimeout(simpleaiSyncGalleryStateSoon, 0);
    }
}, true);

function modalZoomSet(modalImage, enable) {
    if (modalImage) modalImage.classList.toggle('modalImageFullscreen', !!enable);
}

function modalZoomToggle(event) {
    var modalImage = gradioApp().getElementById("modalImage");
    modalZoomSet(modalImage, !modalImage.classList.contains('modalImageFullscreen'));
    event.stopPropagation();
}

function modalTileImageToggle(event) {
    const modalImage = gradioApp().getElementById("modalImage");
    const modal = gradioApp().getElementById("lightboxModal");
    const isTiling = modalImage.style.display === 'none';
    if (isTiling) {
        modalImage.style.display = 'block';
        modal.style.setProperty('background-image', 'none');
    } else {
        modalImage.style.display = 'none';
        modal.style.setProperty('background-image', `url(${modalImage.src})`);
    }

    event.stopPropagation();
}

onAfterUiUpdate(function() {
    simpleaiBindGalleryLightbox();
    simpleaiSyncGalleryFullscreenState();
    simpleaiSyncGalleryToolboxState();
    updateOnBackgroundChange();
});

document.addEventListener("DOMContentLoaded", function() {
    //const modalFragment = document.createDocumentFragment();
    const modal = document.createElement('div');
    modal.onclick = closeModal;
    modal.id = "lightboxModal";
    modal.tabIndex = 0;
    modal.addEventListener('keydown', modalKeyHandler, true);

    const modalControls = document.createElement('div');
    modalControls.className = 'modalControls gradio-container';
    modal.append(modalControls);

    const modalZoom = document.createElement('span');
    modalZoom.className = 'modalZoom cursor';
    modalZoom.innerHTML = '&#10529;';
    modalZoom.addEventListener('click', modalZoomToggle, true);
    modalZoom.title = "Toggle zoomed view";
    modalControls.appendChild(modalZoom);

    // const modalTileImage = document.createElement('span');
    // modalTileImage.className = 'modalTileImage cursor';
    // modalTileImage.innerHTML = '&#8862;';
    // modalTileImage.addEventListener('click', modalTileImageToggle, true);
    // modalTileImage.title = "Preview tiling";
    // modalControls.appendChild(modalTileImage);
    //
    // const modalSave = document.createElement("span");
    // modalSave.className = "modalSave cursor";
    // modalSave.id = "modal_save";
    // modalSave.innerHTML = "&#x1F5AB;";
    // modalSave.addEventListener("click", modalSaveImage, true);
    // modalSave.title = "Save Image(s)";
    // modalControls.appendChild(modalSave);

    const modalClose = document.createElement('span');
    modalClose.className = 'modalClose cursor';
    modalClose.innerHTML = '&times;';
    modalClose.onclick = closeModal;
    modalClose.title = "Close image viewer";
    modalControls.appendChild(modalClose);

    const modalImage = document.createElement('img');
    modalImage.id = 'modalImage';
    modalImage.onclick = closeModal;
    modalImage.tabIndex = 0;
    modalImage.addEventListener('keydown', modalKeyHandler, true);
    modal.appendChild(modalImage);

    const modalPrev = document.createElement('a');
    modalPrev.className = 'modalPrev';
    modalPrev.innerHTML = '&#10094;';
    modalPrev.tabIndex = 0;
    modalPrev.addEventListener('click', modalPrevImage, true);
    modalPrev.addEventListener('keydown', modalKeyHandler, true);
    modal.appendChild(modalPrev);

    const modalNext = document.createElement('a');
    modalNext.className = 'modalNext';
    modalNext.innerHTML = '&#10095;';
    modalNext.tabIndex = 0;
    modalNext.addEventListener('click', modalNextImage, true);
    modalNext.addEventListener('keydown', modalKeyHandler, true);

    modal.appendChild(modalNext);

    try {
        gradioApp().appendChild(modal);
    } catch (e) {
        gradioApp().body.appendChild(modal);
    }

    document.body.appendChild(modal);

});
