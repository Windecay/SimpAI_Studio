
(function() {
    // Configuration
    const LAYERFORGE_APP_URL = "/gradio_api/file=javascript/layerforge/app.html";
    const LAYERFORGE_MODAL_Z_INDEX = '2147483000';
    const COMFY_API_URL = (() => {
        const protocol = window.location.protocol || "http:";
        const hostname = window.location.hostname || "127.0.0.1";
        return `${protocol}//${hostname}:8188`;
    })();

    function getLayerForgeLang(source) {
        if (window.SimpAII18n?.getUiLang) {
            return window.SimpAII18n.getUiLang(source || window.simpleaiTopbarSystemParams);
        }
        const state = source || window.simpleaiTopbarSystemParams || {};
        const raw = String(state?.__lang || state?.lang || 'en').trim().toLowerCase();
        return raw.startsWith('en') ? 'en' : 'cn';
    }

    function layerForgeText(en, cn, source) {
        return getLayerForgeLang(source) === 'en' ? en : cn;
    }

    function layerForgeAppUrl(sessionId, timestamp, source) {
        const lang = getLayerForgeLang(source);
        return `${LAYERFORGE_APP_URL}?v=${timestamp}&api_url=${encodeURIComponent(COMFY_API_URL)}&session_id=${sessionId}&__lang=${encodeURIComponent(lang)}&t=${timestamp}`;
    }

    function loadImageElement(url) {
        return new Promise((resolve, reject) => {
            try {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => resolve(img);
                img.onerror = (e) => reject(e);
                img.src = url;
            } catch (e) {
                reject(e);
            }
        });
    }

    async function createTransparentHolesMaskFromImage(imageUrl, alphaThreshold = 10, dilateRadius = 1) {
        try {
            if (!imageUrl || typeof imageUrl !== 'string')
                return null;
            const img = await loadImageElement(imageUrl);
            const width = img.naturalWidth || img.width;
            const height = img.naturalHeight || img.height;
            if (!width || !height)
                return null;

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx)
                return null;

            ctx.clearRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);

            const imgData = ctx.getImageData(0, 0, width, height);
            const data = imgData.data;

            const holeBinary = new Uint8Array(width * height);
            let hasHoles = false;

            for (let i = 0; i < width * height; i++) {
                const a = data[i * 4 + 3];
                if (a < alphaThreshold) {
                    holeBinary[i] = 1;
                    hasHoles = true;
                }
            }

            if (!hasHoles)
                return null;

            let finalBinary = holeBinary;
            if (dilateRadius > 0) {
                const r = Math.max(1, Math.floor(dilateRadius));
                const dilated = new Uint8Array(width * height);
                for (let y = 0; y < height; y++) {
                    const row = y * width;
                    for (let x = 0; x < width; x++) {
                        if (!holeBinary[row + x])
                            continue;
                        for (let dy = -r; dy <= r; dy++) {
                            const yy = y + dy;
                            if (yy < 0 || yy >= height)
                                continue;
                            const row2 = yy * width;
                            for (let dx = -r; dx <= r; dx++) {
                                const xx = x + dx;
                                if (xx < 0 || xx >= width)
                                    continue;
                                dilated[row2 + xx] = 1;
                            }
                        }
                    }
                }
                finalBinary = dilated;
            }

            const out = new Uint8ClampedArray(width * height * 4);
            for (let i = 0; i < width * height; i++) {
                if (!finalBinary[i])
                    continue;
                const o = i * 4;
                out[o] = 255;
                out[o + 1] = 255;
                out[o + 2] = 255;
                out[o + 3] = 255;
            }

            ctx.clearRect(0, 0, width, height);
            ctx.putImageData(new ImageData(out, width, height), 0, 0);
            return { maskUrl: canvas.toDataURL('image/png'), width, height };
        } catch {
            return null;
        }
    }

    async function mergeMaskUrls(maskUrlA, maskUrlB, targetWidth, targetHeight) {
        try {
            if (!maskUrlA && !maskUrlB)
                return null;

            const a = maskUrlA ? await loadImageElement(maskUrlA) : null;
            const b = maskUrlB ? await loadImageElement(maskUrlB) : null;

            const width = targetWidth || a?.naturalWidth || a?.width || b?.naturalWidth || b?.width;
            const height = targetHeight || a?.naturalHeight || a?.height || b?.naturalHeight || b?.height;
            if (!width || !height)
                return null;

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx)
                return null;

            ctx.clearRect(0, 0, width, height);
            if (a)
                ctx.drawImage(a, 0, 0, width, height);
            if (b)
                ctx.drawImage(b, 0, 0, width, height);

            return canvas.toDataURL('image/png');
        } catch {
            return null;
        }
    }

    function normalizeImageRef(s) {
        try {
            if (!s || typeof s !== 'string')
                return '';
            if (s.startsWith('data:'))
                return s;
            const u = new URL(s, window.location.href);
            u.searchParams.delete('t');
            u.searchParams.delete('v');
            return u.toString();
        } catch {
            try {
                return String(s || '').replace(/[?&](t|v)=[^&]+/g, '');
            } catch {
                return '';
            }
        }
    }

    function hashString32(str) {
        try {
            let h = 2166136261;
            for (let i = 0; i < str.length; i++) {
                h ^= str.charCodeAt(i);
                h = Math.imul(h, 16777619);
            }
            return (h >>> 0);
        } catch {
            return 0;
        }
    }

    function getImageFingerprint(src) {
        try {
            const s = normalizeImageRef(String(src || ''));
            if (!s)
                return '';
            if (s.startsWith('data:')) {
                const head = s.slice(0, 128);
                const tail = s.slice(Math.max(0, s.length - 128));
                const combined = `${s.length}|${head}|${tail}`;
                return `d:${hashString32(combined)}`;
            }
            return `u:${hashString32(s)}`;
        } catch {
            return '';
        }
    }

    function getFileFingerprintFromInput(input) {
        try {
            const file = input && input.files && input.files[0] ? input.files[0] : null;
            if (!file)
                return '';
            const meta = `${file.name || ''}|${file.size || 0}|${file.type || ''}|${file.lastModified || 0}`;
            return `f:${hashString32(meta)}`;
        } catch {
            return '';
        }
    }

    function getPreferredFingerprintForContainer(container, srcOverride) {
        try {
            const src = String(srcOverride || (container?.querySelector?.('img')?.getAttribute?.('src') || container?.querySelector?.('img')?.src) || '');
            if (src && src.startsWith('data:image')) {
                return getImageFingerprint(src);
            }
        } catch {
        }
        try {
            const input = getFileInput(container);
            const fp = getFileFingerprintFromInput(input);
            if (fp)
                return fp;
        } catch {
        }
        try {
            const src = String(srcOverride || (container?.querySelector?.('img')?.getAttribute?.('src') || container?.querySelector?.('img')?.src) || '');
            return getImageFingerprint(src);
        } catch {
            return '';
        }
    }

    function ensureGlobalMaskStore() {
        try {
            if (!window.__layerforgeMaskByFingerprint) {
                window.__layerforgeMaskByFingerprint = new Map();
            }
        } catch {
        }
        try {
            return window.__layerforgeMaskByFingerprint || null;
        } catch {
            return null;
        }
    }

    function storeMaskForFingerprint(fp, maskDataUrl) {
        try {
            if (!fp || !maskDataUrl || typeof maskDataUrl !== 'string' || !maskDataUrl.startsWith('data:image'))
                return;
            const store = ensureGlobalMaskStore();
            if (!store)
                return;
            store.set(fp, { mask: maskDataUrl, at: Date.now() });
            try {
                sessionStorage.setItem(`layerforge_mask_${fp}`, maskDataUrl);
            } catch {
            }
        } catch {
        }
    }

    function getStoredMaskForFingerprint(fp) {
        try {
            const store = ensureGlobalMaskStore();
            if (!store || !fp)
                return null;
            const v = store.get(fp);
            const mask = v?.mask;
            if (mask && typeof mask === 'string' && mask.startsWith('data:image'))
                return mask;
            try {
                const stored = sessionStorage.getItem(`layerforge_mask_${fp}`);
                if (stored && typeof stored === 'string' && stored.startsWith('data:image')) {
                    store.set(fp, { mask: stored, at: Date.now() });
                    return stored;
                }
            } catch {
            }
            return null;
        } catch {
            return null;
        }
    }

    function deleteStoredMaskForFingerprint(fp) {
        try {
            const store = ensureGlobalMaskStore();
            if (!store || !fp)
                return;
            store.delete(fp);
            try {
                sessionStorage.removeItem(`layerforge_mask_${fp}`);
            } catch {
            }
        } catch {
        }
    }

    function getStoredMaskForContainer(imgContainer) {
        if (!containerSupportsMask(imgContainer))
            return null;
        try {
            const stored = imgContainer?.dataset?.layerforgeLatestMask;
            if (stored && typeof stored === 'string' && stored.startsWith('data:image')) {
                return stored;
            }
        } catch {
        }
        try {
            const fp = imgContainer?.dataset?.layerforgeImageFingerprint || getPreferredFingerprintForContainer(imgContainer);
            if (fp) {
                const m = getStoredMaskForFingerprint(fp);
                if (m)
                    return m;
            }
        } catch {
        }
        return null;
    }

    function clearContainerStoredMask(imgContainer) {
        try {
            delete imgContainer.dataset.layerforgeLatestMask;
            delete imgContainer.dataset.layerforgeLatestMaskAt;
        } catch {
        }
        try {
            const overlays = imgContainer.querySelectorAll('canvas[data-layerforge-overlay="1"], canvas[data-layerforge-overlay-display="1"]');
            overlays.forEach((c) => {
                try {
                    c.remove();
                } catch {
                }
            });
        } catch {
        }
        try {
            if (imgContainer.dataset.layerforgeActive === '1') {
                delete imgContainer.dataset.layerforgeActive;
            }
        } catch {
        }
        try {
            if (window.__layerforgeActiveContainer === imgContainer) {
                window.__layerforgeActiveContainer = null;
            }
        } catch {
        }
    }

    function getOwnLayerForgeButton(container) {
        try {
            if (!container || !container.children)
                return null;
            for (const child of container.children) {
                if (child?.classList?.contains('layerforge-edit-btn'))
                    return child;
            }
        } catch {
        }
        return null;
    }

    function removeOwnLayerForgeButton(container) {
        try {
            const btn = getOwnLayerForgeButton(container);
            if (btn)
                btn.remove();
        } catch {
        }
    }

    function getLayerForgeButtonOffset(imgContainer) {
        try {
            if (getSimpAISketchApi(imgContainer) || imgContainer?.matches?.('[data-simpai-sketch="1"]')) {
                return { right: 4, bottom: 14 };
            }
        } catch {
        }
        return { right: 4, bottom: 4 };
    }

    function createEditButton(imgContainer) {
        if (getOwnLayerForgeButton(imgContainer)) return null;

        const btn = document.createElement('button');
        btn.innerHTML = '🖌️';
        btn.className = 'layerforge-edit-btn';
        const offset = getLayerForgeButtonOffset(imgContainer);
        
        btn.style.position = 'absolute';
        btn.style.bottom = `${offset.bottom}px`;
        btn.style.right = `${offset.right}px`;
        btn.style.zIndex = '900';
        btn.style.background = 'rgba(0, 0, 0, 0.6)';
        btn.style.color = 'white';
        btn.style.border = '1px solid rgba(255,255,255,0.3)';
        btn.style.borderRadius = '4px';
        btn.style.width = '24px';
        btn.style.height = '24px';
        btn.style.cursor = 'pointer';
        btn.style.display = 'flex';
        btn.style.alignItems = 'center';
        btn.style.justifyContent = 'center';
        btn.title = layerForgeText("Edit in LayerForge", "在 LayerForge 中编辑");
        btn.style.fontSize = '16px';
        
        btn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            openLayerForge(imgContainer);
        };
        
        return btn;
    }

    function withCacheBust(url) {
        const value = String(url || '');
        if (!value || value.startsWith('data:')) return value;
        return value + (value.includes('?') ? '&' : '?') + 't=' + Date.now();
    }

    function resolveLayerForgeModalMount(options) {
        const opts = options || {};
        if (opts.mount && typeof opts.mount.appendChild === 'function') {
            return opts.mount;
        }
        const selector = String(opts.mountSelector || '').trim();
        if (selector) {
            const found = document.querySelector(selector);
            if (found && typeof found.appendChild === 'function') return found;
        }
        return document.body;
    }

    function mountLayerForgeModal(modal, options) {
        const mount = resolveLayerForgeModalMount(options);
        const scoped = !!mount && mount !== document.body && mount !== document.documentElement;
        const className = String(options?.modalClassName || '').trim();
        if (className) modal.className = className;
        modal.dataset.layerforgeModalMount = scoped ? 'container' : 'body';
        modal.style.position = scoped ? 'absolute' : 'fixed';
        modal.style.inset = '0';
        modal.style.top = '0';
        modal.style.left = '0';
        modal.style.width = scoped ? '100%' : '100vw';
        modal.style.height = scoped ? '100%' : '100vh';
        if (scoped) {
            try {
                const style = window.getComputedStyle(mount);
                if (style.position === 'static') mount.style.position = 'relative';
            } catch {
            }
        }
        mount.appendChild(modal);
        return mount;
    }

    function openLayerForgeWithAdapter(options = {}) {
        const imageUrl = String(options.image || options.imageUrl || '');
        if (!imageUrl) {
            console.warn('[LayerForge] Missing adapter image url.');
            return false;
        }
        const maskUrl = String(options.mask || options.maskUrl || '');
        const onSave = typeof options.onSave === 'function' ? options.onSave : null;
        const sessionId = Math.random().toString(36).substring(2, 15);
        const modal = document.createElement('div');
        modal.style.backgroundColor = 'rgba(0,0,0,0.82)';
        modal.style.zIndex = LAYERFORGE_MODAL_Z_INDEX;
        modal.style.display = 'flex';
        modal.style.justifyContent = 'center';
        modal.style.alignItems = 'center';

        const iframe = document.createElement('iframe');
        const timestamp = Date.now();
        iframe.src = layerForgeAppUrl(sessionId, timestamp, options.state_params || options.state);
        iframe.style.width = '95%';
        iframe.style.height = '95%';
        iframe.style.border = 'none';
        iframe.style.borderRadius = '8px';
        iframe.style.backgroundColor = '#1e1e1e';
        modal.appendChild(iframe);
        mountLayerForgeModal(modal, options);

        const closeModal = () => {
            window.removeEventListener('message', messageHandler);
            if (modal.parentNode) modal.parentNode.removeChild(modal);
        };

        const sendImage = (type) => {
            if (!iframe.contentWindow) return;
            iframe.contentWindow.postMessage({
                type,
                url: withCacheBust(imageUrl),
                maskUrl: withCacheBust(maskUrl),
                timestamp: Date.now()
            }, '*');
        };

        const messageHandler = (event) => {
            if (event.source !== iframe.contentWindow || !event.data) return;
            if (event.data.type === 'READY') {
                sendImage('LOAD_IMAGE');
            } else if (event.data.type === 'REQUEST_INPUT') {
                sendImage('ADD_LAYER');
            } else if (event.data.type === 'SAVE_IMAGE') {
                const data = event.data.data;
                const image = typeof data === 'string' ? data : data?.image;
                const mask = typeof data === 'string' ? null : data?.mask;
                const metadata = typeof data === 'string' ? {} : {
                    layer_count: Number(data?.layer_count || 0) || 0
                };
                Promise.resolve(onSave ? onSave({ image, mask, title: options.title || '', metadata }) : null)
                    .catch((error) => console.warn('[LayerForge] Adapter save failed:', error))
                    .finally(closeModal);
            } else if (event.data.type === 'CANCEL') {
                closeModal();
            }
        };

        window.addEventListener('message', messageHandler);
        return true;
    }

    window.SimpAILayerForgeAdapter = {
        open: openLayerForgeWithAdapter
    };

    function openLayerForge(imgContainer) {
        try {
            window.__layerforgeActiveContainer = imgContainer;
            imgContainer.dataset.layerforgeActive = '1';
        } catch {
        }
        try {
            imgContainer.dataset.layerforgePersistMask = containerSupportsMask(imgContainer) ? '1' : '0';
        } catch {
        }

        const img = imgContainer.querySelector('img');
        if (!img) {
            alert(layerForgeText("No image found to edit.", "没有可编辑的图像。"));
            return;
        }
        
        // Generate a random session ID to ensure a fresh session
        const sessionId = Math.random().toString(36).substring(2, 15);

        const modal = document.createElement('div');
        modal.style.position = 'fixed';
        modal.style.top = '0';
        modal.style.left = '0';
        modal.style.width = '100vw';
        modal.style.height = '100vh';
        modal.style.backgroundColor = 'rgba(0,0,0,0.8)';
        modal.style.zIndex = LAYERFORGE_MODAL_Z_INDEX;
        modal.style.display = 'flex';
        modal.style.justifyContent = 'center';
        modal.style.alignItems = 'center';

        const iframe = document.createElement('iframe');
        const timestamp = new Date().getTime();
        iframe.src = layerForgeAppUrl(sessionId, timestamp);
        iframe.style.width = '95%';
        iframe.style.height = '95%';
        iframe.style.border = 'none';
        iframe.style.borderRadius = '8px';
        iframe.style.backgroundColor = '#1e1e1e';

        modal.appendChild(iframe);
        document.body.appendChild(modal);

        const messageHandler = (event) => {
            if (event.data.type === 'READY') {

                let src = null;
                if (img && img.src && img.src.length > 500 && !img.src.endsWith('.svg')) {
                     src = img.src;
                } else {
                     const canvases = imgContainer.querySelectorAll('canvas');
                     if (canvases.length > 0) {
                         try {
                             const baseCanvas = canvases[0]; 
                             if (baseCanvas.width > 50 && baseCanvas.height > 50) {
                                 src = baseCanvas.toDataURL('image/png');
                             }
                         } catch (e) {
                             console.warn("[LayerForge Parent] Failed to extract base image from canvas:", e);
                         }
                     }
                }
                
                if (!src) {
                     src = img ? img.src : '';
                }

                const srcWithTime = src.startsWith('data:') ? src : (src + (src.includes('?') ? '&' : '?') + 't=' + new Date().getTime());
                let maskUrl = getMaskFromContainer(imgContainer);
                
                iframe.contentWindow.postMessage({
                    type: 'LOAD_IMAGE',
                    url: srcWithTime,
                    maskUrl: maskUrl,
                    timestamp: new Date().getTime() // Force fresh load
                }, '*');
            } else if (event.data.type === 'REQUEST_INPUT') {
                const src = img.src;
                const srcWithTime = src.startsWith('data:') ? src : (src + (src.includes('?') ? '&' : '?') + 't=' + new Date().getTime());
                
                let maskUrl = getMaskFromContainer(imgContainer);
                iframe.contentWindow.postMessage({
                    type: 'ADD_LAYER',
                    url: srcWithTime,
                    maskUrl: maskUrl,
                    timestamp: new Date().getTime()
                }, '*');
            } else if (event.data.type === 'SAVE_IMAGE') {
                const data = event.data.data;
                let imageBase64, maskBase64;
                
                if (typeof data === 'string') {
                    imageBase64 = data;
                } else {
                    imageBase64 = data.image;
                    maskBase64 = data.mask;
                }

                if (imageBase64) {
                    updateGradioImage(imgContainer, imageBase64);
                }

                if (!containerSupportsMask(imgContainer)) {
                    try {
                        clearContainerStoredMask(imgContainer);
                    } catch {
                    }
                    closeModal();
                    return;
                }

                const updateMask = async () => {
                    const derived = imageBase64 ? await createTransparentHolesMaskFromImage(imageBase64, 10, 1) : null;
                    const finalMaskBase64 = derived
                        ? (maskBase64
                            ? (await mergeMaskUrls(maskBase64, derived.maskUrl, derived.width, derived.height) || maskBase64 || derived.maskUrl)
                            : derived.maskUrl)
                        : maskBase64;

                if (finalMaskBase64) {
                    try {
                        imgContainer.dataset.layerforgeLatestMask = finalMaskBase64;
                        imgContainer.dataset.layerforgeLatestMaskAt = String(Date.now());
                    } catch {
                    }
                    try {
                        const fp = imgContainer.dataset.layerforgeImageFingerprint || getPreferredFingerprintForContainer(imgContainer, imageBase64 || (img?.src) || '');
                        if (fp) {
                            storeMaskForFingerprint(fp, finalMaskBase64);
                        }
                    } catch {
                    }
                    const paintMaskOnce = (maskImg) => {
                            try {
                                const sketch = getSimpAISketchApi(imgContainer);
                                if (sketch && typeof sketch.setMask === 'function') {
                                    sketch.setMask(finalMaskBase64, { change: false, history: false });
                                    return true;
                                }

                                const canvases = imgContainer.querySelectorAll('canvas');
                                const candidates = Array.from(canvases);
                                if (candidates.length === 0)
                                    return false;

                                let interactionCanvas = null;
                                for (let i = candidates.length - 1; i >= 0; i--) {
                                    const c = candidates[i];
                                    const style = window.getComputedStyle(c);
                                    if (style.pointerEvents !== 'none') {
                                        interactionCanvas = c;
                                        break;
                                    }
                                }
                                if (!interactionCanvas && candidates.length > 0) {
                                    interactionCanvas = candidates[candidates.length - 1];
                                }

                                const getCanvasKey = (c) => {
                                    try {
                                        return String(c.getAttribute('key') || c.getAttribute('data-key') || '');
                                    } catch {
                                        return '';
                                    }
                                };

                                const selectMaskCanvasByDom = () => {
                                    const keyed = candidates.filter((c) => getCanvasKey(c));
                                    if (keyed.length === 0)
                                        return null;

                                    const normalizedKey = (c) => String(getCanvasKey(c) || '').toLowerCase();
                                    const hit = keyed.find((c) => normalizedKey(c) === 'mask');
                                    return hit || null;
                                };

                                const domPicked = selectMaskCanvasByDom();
                                if (!domPicked)
                                    return false;

                                const getBrushColorForContainer = () => {
                                    const findColorInput = (root) => {
                                        try {
                                            const input = root && root.querySelector ? root.querySelector('input[type="color"]') : null;
                                            if (input && typeof input.value === 'string' && input.value)
                                                return input.value;
                                        } catch {
                                        }
                                        return null;
                                    };
                                    try {
                                        let n = imgContainer;
                                        for (let i = 0; i < 6 && n; i++) {
                                            const v = findColorInput(n);
                                            if (v)
                                                return v;
                                            n = n.parentElement;
                                        }
                                    } catch {
                                    }
                                    return null;
                                };

                                try {
                                    const parent = domPicked.parentNode;
                                    if (parent && interactionCanvas && interactionCanvas.parentNode === parent) {
                                        parent.insertBefore(domPicked, interactionCanvas);
                                    }
                                } catch {
                                }

                                const ensureOverlayCanvas = () => {
                                    const parent = domPicked.parentElement;
                                    if (!parent)
                                        return null;

                                    let overlayRaw = parent.querySelector('canvas[data-layerforge-overlay="1"]');
                                    if (!overlayRaw) {
                                        overlayRaw = document.createElement('canvas');
                                        overlayRaw.setAttribute('data-layerforge-overlay', '1');
                                        parent.appendChild(overlayRaw);
                                    }

                                    let overlayDisplay = parent.querySelector('canvas[data-layerforge-overlay-display="1"]');
                                    if (!overlayDisplay) {
                                        overlayDisplay = document.createElement('canvas');
                                        overlayDisplay.setAttribute('data-layerforge-overlay-display', '1');
                                        parent.appendChild(overlayDisplay);
                                    }

                                    try {
                                        const ps = window.getComputedStyle(parent);
                                        if (ps.position === 'static') {
                                            parent.style.position = 'relative';
                                        }
                                    } catch {
                                    }

                                    try {
                                        const siblingParent = overlayDisplay.parentNode;
                                        if (siblingParent && interactionCanvas && interactionCanvas.parentNode === siblingParent) {
                                            siblingParent.insertBefore(overlayDisplay, interactionCanvas);
                                        }
                                    } catch {
                                    }

                                    try {
                                        overlayRaw.style.position = 'absolute';
                                        overlayRaw.style.top = '0';
                                        overlayRaw.style.left = '0';
                                        overlayRaw.style.width = '100%';
                                        overlayRaw.style.height = '100%';
                                        overlayRaw.style.pointerEvents = 'none';
                                        overlayRaw.style.opacity = '0';
                                    } catch {
                                    }

                                    try {
                                        overlayDisplay.style.position = 'absolute';
                                        overlayDisplay.style.top = '0';
                                        overlayDisplay.style.left = '0';
                                        overlayDisplay.style.width = '100%';
                                        overlayDisplay.style.height = '100%';
                                        overlayDisplay.style.pointerEvents = 'none';
                                        overlayDisplay.style.opacity = '0.7';
                                    } catch {
                                    }

                                    try {
                                        const baseImg = imgContainer.querySelector('img');
                                        const targetW = baseImg?.naturalWidth || baseImg?.width || maskImg?.width || domPicked.width || 0;
                                        const targetH = baseImg?.naturalHeight || baseImg?.height || maskImg?.height || domPicked.height || 0;
                                        if (targetW > 0 && targetH > 0) {
                                            if (overlayRaw.width !== targetW || overlayRaw.height !== targetH) {
                                                overlayRaw.width = targetW;
                                                overlayRaw.height = targetH;
                                            }
                                            if (overlayDisplay.width !== targetW || overlayDisplay.height !== targetH) {
                                                overlayDisplay.width = targetW;
                                                overlayDisplay.height = targetH;
                                            }
                                        }
                                    } catch {
                                    }

                                    try {
                                        const parseZi = (el) => {
                                            try {
                                                if (!el)
                                                    return Number.NaN;
                                                const zi = window.getComputedStyle(el).zIndex;
                                                if (!zi || zi === 'auto')
                                                    return Number.NaN;
                                                const n = Number.parseInt(zi, 10);
                                                return Number.isFinite(n) ? n : Number.NaN;
                                            } catch {
                                                return Number.NaN;
                                            }
                                        };

                                        const baseCanvas = candidates.length ? candidates[0] : null;
                                        const baseZ = (() => {
                                            const v = parseZi(baseCanvas);
                                            return Number.isFinite(v) ? v : 0;
                                        })();
                                        const interactionZ = parseZi(interactionCanvas);

                                        let maskZ = baseZ + 1;
                                        if (Number.isFinite(interactionZ) && maskZ >= interactionZ) {
                                            const candidateZ = interactionZ - 1;
                                            if (candidateZ > baseZ) {
                                                maskZ = candidateZ;
                                            }
                                        }
                                        overlayRaw.style.zIndex = String(maskZ);
                                        overlayDisplay.style.zIndex = String(maskZ);
                                    } catch {
                                    }

                                    return { raw: overlayRaw, display: overlayDisplay };
                                };

                                const overlays = ensureOverlayCanvas();
                                if (!overlays || !overlays.raw || !overlays.display)
                                    return false;

                                const rawCtx = overlays.raw.getContext('2d');
                                const displayCtx = overlays.display.getContext('2d');
                                if (!rawCtx || !displayCtx)
                                    return false;
                                if (!overlays.raw.width || !overlays.raw.height || !overlays.display.width || !overlays.display.height)
                                    return false;

                                rawCtx.clearRect(0, 0, overlays.raw.width, overlays.raw.height);
                                rawCtx.drawImage(maskImg, 0, 0, overlays.raw.width, overlays.raw.height);

                                displayCtx.clearRect(0, 0, overlays.display.width, overlays.display.height);
                                displayCtx.drawImage(maskImg, 0, 0, overlays.display.width, overlays.display.height);
                                const brushColor = getBrushColorForContainer() || '#ffffff';
                                try {
                                    const prev = displayCtx.globalCompositeOperation;
                                    displayCtx.globalCompositeOperation = 'source-in';
                                    displayCtx.fillStyle = brushColor;
                                    displayCtx.fillRect(0, 0, overlays.display.width, overlays.display.height);
                                    displayCtx.globalCompositeOperation = prev;
                                } catch {
                                }

                                if (interactionCanvas) {
                                    try {
                                        const rect = interactionCanvas.getBoundingClientRect();
                                        const x = rect.left + rect.width / 2;
                                        const y = rect.top + rect.height / 2;
                                        const eventOptions = {
                                            bubbles: true,
                                            cancelable: true,
                                            view: window,
                                            clientX: x,
                                            clientY: y,
                                            buttons: 1,
                                            pressure: 0.5,
                                            pointerType: 'mouse',
                                            isPrimary: true
                                        };
                                        const moveOptions = {
                                            ...eventOptions,
                                            clientX: x + 10,
                                            clientY: y + 10
                                        };
                                        interactionCanvas.dispatchEvent(new PointerEvent('pointermove', moveOptions));
                                        interactionCanvas.dispatchEvent(new MouseEvent('mousemove', moveOptions));
                                    } catch {
                                    }
                                }

                                return true;
                            } catch {
                                return false;
                            }
                        };

                        const schedulePaintMask = (maskImg) => {
                            let painted = false;
                            let tries = 0;
                            const maxTries = 12;
                            const delays = [0, 50, 150, 350, 800, 1500, 2200];

                            const attempt = () => {
                                if (painted)
                                    return;
                                tries++;
                                if (tries > maxTries)
                                    return;
                                if (paintMaskOnce(maskImg)) {
                                    painted = true;
                                }
                            };

                            delays.forEach((d) => setTimeout(attempt, d));

                            try {
                                const obs = new MutationObserver(() => attempt());
                                obs.observe(imgContainer, { childList: true, subtree: true, attributes: true });
                                setTimeout(() => {
                                    try {
                                        obs.disconnect();
                                    } catch {
                                    }
                                }, 2500);
                            } catch {
                            }
                        };

                        const maskImg = new Image();
                        maskImg.onload = () => schedulePaintMask(maskImg);
                        maskImg.onerror = () => schedulePaintMask(maskImg);
                        maskImg.src = finalMaskBase64;

                    } else {
                    }
                };

                const runUpdateMask = () => {
                    updateMask().catch(() => {
                    });
                };

                if (imageBase64) {
                    let done = false;
                    const onUpdated = (ev) => {
                        if (done)
                            return;
                        if (ev && ev.data && ev.data.type === 'GRADIO_IMAGE_UPDATED') {
                            done = true;
                            window.removeEventListener('message', onUpdated);
                            setTimeout(runUpdateMask, 0);
                        }
                    };
                    window.addEventListener('message', onUpdated);
                    setTimeout(() => {
                        if (done)
                            return;
                        done = true;
                        window.removeEventListener('message', onUpdated);
                        runUpdateMask();
                    }, 900);
                    setTimeout(runUpdateMask, 1800);
                } else {
                    setTimeout(runUpdateMask, 0);
                }
                
                closeModal();
            } else if (event.data.type === 'CANCEL') {
                closeModal();
            }
        };

        window.addEventListener('message', messageHandler);

        function closeModal() {
            window.removeEventListener('message', messageHandler);
            document.body.removeChild(modal);
        }

        iframe.onload = () => {
        };
    }

    function isCanvasLikelyMask(canvas) {
        try {
            try {
                if (canvas && canvas.getAttribute && canvas.getAttribute('data-layerforge-overlay') === '1')
                    return false;
            } catch {
            }
            try {
                if (canvas && canvas.getAttribute && canvas.getAttribute('data-layerforge-grid') === '1')
                    return false;
            } catch {
            }
            try {
                if (canvas && canvas.getAttribute && canvas.getAttribute('data-layerforge-color-layer') === '1')
                    return false;
            } catch {
            }
            if (canvas.width < 10 || canvas.height < 10) return false;

            const w = canvas.width;
            const h = canvas.height;

            const maxSide = 96;
            const scale = Math.min(1, maxSide / Math.max(w, h));
            const tw = Math.max(16, Math.floor(w * scale));
            const th = Math.max(16, Math.floor(h * scale));

            const probeCanvas = document.createElement('canvas');
            probeCanvas.width = tw;
            probeCanvas.height = th;
            const probeCtx = probeCanvas.getContext('2d', { willReadFrequently: true, alpha: true });
            if (!probeCtx)
                return false;

            probeCtx.clearRect(0, 0, tw, th);
            try {
                probeCtx.drawImage(canvas, 0, 0, w, h, 0, 0, tw, th);
            } catch {
                return false;
            }

            const data = probeCtx.getImageData(0, 0, tw, th).data;
            let opaquePixelCount = 0;
            let transparentPixelCount = 0;
            let grayscaleOpaqueCount = 0;
            let binaryOpaqueCount = 0;
            let midtoneOpaqueCount = 0;
            let minLum = 255;
            let maxLum = 0;

            const stride = 4;
            const stepPx = 2;
            const step = stride * stepPx;
            for (let i = 0; i < data.length; i += step) {
                const a = data[i + 3];
                if (a > 10) {
                    opaquePixelCount++;
                    const r = data[i];
                    const g = data[i + 1];
                    const b = data[i + 2];
                    const mx = Math.max(r, g, b);
                    const mn = Math.min(r, g, b);
                    if ((mx - mn) <= 12) {
                        grayscaleOpaqueCount++;
                    }
                    const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
                    if (lum < minLum)
                        minLum = lum;
                    if (lum > maxLum)
                        maxLum = lum;
                    if (lum <= 32 || lum >= 223) {
                        binaryOpaqueCount++;
                    } else {
                        midtoneOpaqueCount++;
                    }
                } else {
                    transparentPixelCount++;
                }
            }

            const totalSamples = opaquePixelCount + transparentPixelCount;
            if (opaquePixelCount <= 5 || totalSamples <= 0)
                return false;

            const grayscaleRatio = grayscaleOpaqueCount / Math.max(1, opaquePixelCount);
            if (grayscaleRatio < 0.9)
                return false;

            const binaryRatio = binaryOpaqueCount / Math.max(1, opaquePixelCount);
            const midtoneRatio = midtoneOpaqueCount / Math.max(1, opaquePixelCount);
            const alphaNonZeroRatio = opaquePixelCount / Math.max(1, totalSamples);
            const lumaRange = maxLum - minLum;

            if (alphaNonZeroRatio > 0.98 && binaryRatio < 0.35 && midtoneRatio > 0.65) {
                return false;
            }

            const transparentRatio = transparentPixelCount / Math.max(1, totalSamples);
            if (transparentRatio > 0.02 && binaryRatio > 0.4) {
                return true;
            }

            if (transparentRatio <= 0.02) {
                if (binaryRatio > 0.92 && midtoneRatio < 0.2) {
                    return true;
                }
                return false;
            }

            if (binaryRatio > 0.85) {
                return true;
            }

            if (binaryRatio > 0.65 && lumaRange > 96) {
                return true;
            }

            return false;
            
        } catch (e) {
            return false;
        }
    }

    function createBinaryMaskCanvasFromCanvas(sourceCanvas, targetW, targetH, threshold = 127) {
        try {
            if (!sourceCanvas || !targetW || !targetH)
                return null;
            const outCanvas = document.createElement('canvas');
            outCanvas.width = targetW;
            outCanvas.height = targetH;
            const ctx = outCanvas.getContext('2d', { willReadFrequently: true, alpha: true });
            if (!ctx)
                return null;
            ctx.clearRect(0, 0, targetW, targetH);
            try {
                ctx.drawImage(sourceCanvas, 0, 0, sourceCanvas.width, sourceCanvas.height, 0, 0, targetW, targetH);
            } catch {
                return null;
            }
            const imgData = ctx.getImageData(0, 0, targetW, targetH);
            const data = imgData.data;
            const thr = Math.max(0, Math.min(255, Math.floor(threshold)));
            let hasAlpha0 = false;
            let hasAlphaNon0 = false;
            for (let i = 3; i < data.length; i += 4) {
                const a = data[i];
                if (a === 0)
                    hasAlpha0 = true;
                else
                    hasAlphaNon0 = true;
                if (hasAlpha0 && hasAlphaNon0)
                    break;
            }
            if (hasAlpha0 && hasAlphaNon0) {
                for (let i = 0; i < data.length; i += 4) {
                    const a = data[i + 3];
                    const v = a > 0 ? 255 : 0;
                    data[i] = v;
                    data[i + 1] = v;
                    data[i + 2] = v;
                    data[i + 3] = 255;
                }
                ctx.putImageData(imgData, 0, 0);
                return outCanvas;
            }
            const pickCorner = (x, y) => {
                const idx = (y * targetW + x) * 4;
                return { r: data[idx], g: data[idx + 1], b: data[idx + 2] };
            };
            const tl = pickCorner(0, 0);
            const tr = pickCorner(targetW - 1, 0);
            const bl = pickCorner(0, targetH - 1);
            const br = pickCorner(targetW - 1, targetH - 1);
            const avg = (a, b, c, d, k) => Math.round((a[k] + b[k] + c[k] + d[k]) / 4);
            const bg = { r: avg(tl, tr, bl, br, 'r'), g: avg(tl, tr, bl, br, 'g'), b: avg(tl, tr, bl, br, 'b') };
            const diffThreshold = 40;
            let diffCount = 0;
            let sameCount = 0;
            const sampleStridePx = Math.max(1, Math.floor((targetW * targetH) / 200000));
            const sampleStride = sampleStridePx * 4;
            for (let i = 0; i < data.length; i += sampleStride) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                const diff = Math.abs(r - bg.r) + Math.abs(g - bg.g) + Math.abs(b - bg.b);
                if (diff > diffThreshold)
                    diffCount += 1;
                else
                    sameCount += 1;
            }
            const useDiff = diffCount > 0 && sameCount > 0;
            const diffMaskIsDifferent = diffCount < sameCount;
            for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                let v = 0;
                if (useDiff) {
                    const diff = Math.abs(r - bg.r) + Math.abs(g - bg.g) + Math.abs(b - bg.b);
                    const isDiff = diff > diffThreshold;
                    v = diffMaskIsDifferent ? (isDiff ? 255 : 0) : (isDiff ? 0 : 255);
                }
                else {
                    const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
                    v = lum >= thr ? 255 : 0;
                }
                data[i] = v;
                data[i + 1] = v;
                data[i + 2] = v;
                data[i + 3] = 255;
            }
            ctx.putImageData(imgData, 0, 0);
            return outCanvas;
        } catch {
            return null;
        }
    }

    function replaceMaskInObject(root, replacementMask) {
        if (!replacementMask || typeof replacementMask !== 'string' || !replacementMask.startsWith('data:image'))
            return false;

        let changed = false;
        const stack = [{ value: root, key: null }];
        const maskWord = /mask/i;

        const valueHintsMask = (v) => {
            try {
                if (!v)
                    return false;
                if (typeof v === 'string') {
                    return maskWord.test(v);
                }
                if (typeof v === 'object') {
                    const n = typeof v.name === 'string' ? v.name : '';
                    const on = typeof v.orig_name === 'string' ? v.orig_name : '';
                    const p = typeof v.path === 'string' ? v.path : '';
                    const u = typeof v.url === 'string' ? v.url : '';
                    return maskWord.test(n) || maskWord.test(on) || maskWord.test(p) || maskWord.test(u);
                }
            } catch {
            }
            return false;
        };

        const looksLikeImageValue = (v) => {
            if (!v)
                return false;
            if (typeof v === 'string')
                return v.startsWith('data:') || v.startsWith('blob:') || v.startsWith('/file=') || v.startsWith('http') || (v.length > 512 && /^[A-Za-z0-9+/=\s]+$/.test(v));
            if (typeof v !== 'object')
                return false;
            if (typeof v.data === 'string' && v.data.startsWith('data:image'))
                return true;
            if (typeof v.url === 'string' && v.url.startsWith('data:image'))
                return true;
            if (typeof v.name === 'string' && typeof v.data !== 'undefined')
                return true;
            if (typeof v.path === 'string')
                return true;
            if (typeof v.is_file === 'boolean')
                return true;
            if (typeof v.orig_name === 'string')
                return true;
            return false;
        };

        const applyMaskToValue = (container, k, v) => {
            if (v === null || typeof v === 'undefined') {
                container[k] = replacementMask;
                return true;
            }
            if (typeof v === 'string') {
                if (v.startsWith('data:') || v.startsWith('blob:') || v.startsWith('/file=') || v.startsWith('http') || (v.length > 512 && /^[A-Za-z0-9+/=\s]+$/.test(v))) {
                    container[k] = replacementMask;
                    return true;
                }
                return false;
            }
            if (typeof v === 'object') {
                const hasFileShape = typeof v.path === 'string' || typeof v.orig_name === 'string' || typeof v.is_file === 'boolean';
                if (hasFileShape) {
                    container[k] = { data: replacementMask, is_file: false, name: v.orig_name || v.name || 'mask.png' };
                    return true;
                }
                if (typeof v.data === 'string' || v.data === null || typeof v.data === 'undefined') {
                    v.data = replacementMask;
                    if (typeof v.is_file === 'boolean') {
                        v.is_file = false;
                    }
                    return true;
                }
                if (typeof v.url === 'string' || v.url === null || typeof v.url === 'undefined') {
                    v.url = replacementMask;
                    return true;
                }
            }
            return false;
        };

        while (stack.length) {
            const { value, key } = stack.pop();
            if (!value)
                continue;

            if (Array.isArray(value)) {
                if (value.length === 2 && typeof key === 'string' && maskWord.test(key) && looksLikeImageValue(value[0])) {
                    if (applyMaskToValue(value, 1, value[1])) {
                        changed = true;
                    }
                }
                for (let i = 0; i < value.length; i++) {
                    stack.push({ value: value[i], key: String(i) });
                }
                continue;
            }

            if (typeof value === 'object') {
                const hasImageAndMask = Object.prototype.hasOwnProperty.call(value, 'image') && Object.prototype.hasOwnProperty.call(value, 'mask');
                if (hasImageAndMask) {
                    if (applyMaskToValue(value, 'mask', value.mask)) {
                        changed = true;
                    }
                }
                for (const k of Object.keys(value)) {
                    if (hasImageAndMask && k === 'image') {
                        stack.push({ value: value[k], key: k });
                        continue;
                    }

                    const v = value[k];

                    if (typeof v === 'string') {
                        if ((/mask/i.test(k) || valueHintsMask(v)) && looksLikeImageValue(v)) {
                            value[k] = replacementMask;
                            changed = true;
                            continue;
                        }
                    }

                    if (v && typeof v === 'object') {
                        const looksLikeMaskKey = /mask/i.test(k);
                        const hasDataUrl = typeof v.data === 'string' && v.data.startsWith('data:image');
                        const hasName = typeof v.name === 'string' && /mask/i.test(v.name);
                        if (looksLikeMaskKey || hasName || valueHintsMask(v)) {
                            if (hasDataUrl) {
                                v.data = replacementMask;
                                if (typeof v.is_file === 'boolean')
                                    v.is_file = false;
                                changed = true;
                            }
                            else if (typeof v.data === 'undefined' || v.data === null) {
                                v.data = replacementMask;
                                if (typeof v.is_file === 'boolean')
                                    v.is_file = false;
                                changed = true;
                            }
                            else if (applyMaskToValue(value, k, v)) {
                                changed = true;
                            }
                        }
                    }

                    stack.push({ value: v, key: k });
                }
            }
        }

        return changed;
    }

    function trySyncMaskToInputs(imgContainer, maskBase64) {
        try {
            const sketch = getSimpAISketchApi(imgContainer);
            if (sketch && typeof sketch.setMask === 'function') {
                try {
                    const pending = imgContainer.__layerforgeSimpAISketchUpdatePromise;
                    if (pending && typeof pending.then === 'function') {
                        pending.then(() => sketch.setMask(maskBase64, { change: false, history: false })).catch(() => {
                            try {
                                sketch.setMask(maskBase64, { change: false, history: false });
                            } catch {
                            }
                        });
                    } else {
                        sketch.setMask(maskBase64, { change: false, history: false });
                    }
                } catch {
                }
            }

            const inputs = imgContainer.querySelectorAll('input, textarea');
            let updated = 0;

            const isProbablyBase64 = (s) => {
                if (typeof s !== 'string')
                    return false;
                if (s.length < 512)
                    return false;
                if (!/^[A-Za-z0-9+/=\s]+$/.test(s))
                    return false;
                return true;
            };

            inputs.forEach((el) => {
                if (!('value' in el))
                    return;
                if (el instanceof HTMLInputElement && el.type === 'file')
                    return;

                const value = String(el.value ?? '');
                const name = String(el.getAttribute('name') ?? '');
                const cls = String(el.className ?? '');

                const isMaskField = /mask/i.test(name) || /mask/i.test(cls);
                const looksJson = value.startsWith('{') || value.startsWith('[');
                const looksDataUrl = value.startsWith('data:image');
                const looksBlobUrl = value.startsWith('blob:');
                const looksFileUrl = value.startsWith('/file=');
                const looksHttp = value.startsWith('http');

                if (looksJson) {
                    try {
                        const parsed = JSON.parse(value);
                        if (replaceMaskInObject(parsed, maskBase64)) {
                            el.value = JSON.stringify(parsed);
                            el.dispatchEvent(new Event('input', { bubbles: true }));
                            el.dispatchEvent(new Event('change', { bubbles: true }));
                            updated++;
                        }
                    } catch {
                    }
                    return;
                }

                if (isMaskField && (looksDataUrl || looksBlobUrl || looksFileUrl || looksHttp || isProbablyBase64(value))) {
                    el.value = maskBase64;
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    updated++;
                }
            });

            return updated;
        } catch (e) {
            console.warn("[LayerForge Parent] trySyncMaskToInputs failed:", e);
            return 0;
        }
    }

    function containerSupportsMask(imgContainer) {
        try {
            if (!imgContainer)
                return false;
            try {
                if (getSimpAISketchApi(imgContainer))
                    return true;
            } catch {
            }
            try {
                const persisted = imgContainer.dataset?.layerforgePersistMask;
                if (persisted === '1')
                    return true;
                if (persisted === '0')
                    return false;
            } catch {
            }
            try {
                if (imgContainer.querySelector('.mask'))
                    return true;
            } catch {
            }
            try {
                const canvases = imgContainer.querySelectorAll('canvas');
                for (const c of canvases) {
                    const key = String(c.getAttribute('key') || c.getAttribute('data-key') || '').toLowerCase();
                    if (!key)
                        continue;
                    if (/mask|draw|drawing|sketch/.test(key))
                        return true;
                }
            } catch {
            }
            return false;
        } catch {
            return false;
        }
    }

    function selectMaskCanvasElement(imgContainer) {
        try {
            try {
                const maskEl = imgContainer.querySelector('.mask');
                if (maskEl instanceof HTMLCanvasElement) {
                    return maskEl;
                }
            } catch {
            }

            const canvases = imgContainer.querySelectorAll('canvas');
            for (const c of canvases) {
                try {
                    if (c && c.getAttribute && c.getAttribute('data-layerforge-overlay') === '1')
                        continue;
                } catch {
                }
                try {
                    const key = String(c.getAttribute('key') || c.getAttribute('data-key') || '').toLowerCase();
                    if (key === 'mask') {
                        return c;
                    }
                } catch {
                }
            }

            return null;
        } catch {
            return null;
        }
    }

    function computeMaskFromContainerDom(imgContainer) {
        if (!containerSupportsMask(imgContainer))
            return null;
        try {
            const sketchValue = getSimpAISketchApi(imgContainer)?.getValue?.();
            if (sketchValue?.mask && typeof sketchValue.mask === 'string' && sketchValue.mask.startsWith('data:image')) {
                return sketchValue.mask;
            }
        } catch {
        }
        const overlayCanvas = (() => {
            try {
                return imgContainer.querySelector('canvas[data-layerforge-overlay="1"]');
            } catch {
                return null;
            }
        })();

        const maskCanvas = selectMaskCanvasElement(imgContainer);
        if (overlayCanvas && overlayCanvas.width > 0 && overlayCanvas.height > 0 && maskCanvas && maskCanvas.width > 0 && maskCanvas.height > 0) {
            try {
                const baseImg = imgContainer.querySelector('img');
                const targetW = baseImg?.naturalWidth || baseImg?.width || overlayCanvas.width || maskCanvas.width || 0;
                const targetH = baseImg?.naturalHeight || baseImg?.height || overlayCanvas.height || maskCanvas.height || 0;
                if (targetW > 0 && targetH > 0) {
                    const tempCanvas = document.createElement('canvas');
                    tempCanvas.width = targetW;
                    tempCanvas.height = targetH;
                    const ctx = tempCanvas.getContext('2d');
                    if (ctx) {
                        ctx.clearRect(0, 0, targetW, targetH);
                        try {
                            ctx.drawImage(overlayCanvas, 0, 0, overlayCanvas.width, overlayCanvas.height, 0, 0, targetW, targetH);
                        } catch {
                        }
                        try {
                            ctx.drawImage(maskCanvas, 0, 0, maskCanvas.width, maskCanvas.height, 0, 0, targetW, targetH);
                        } catch {
                        }
                        const out = tempCanvas.toDataURL('image/png');
                        if (out && typeof out === 'string' && out.startsWith('data:image') && out.length > 1000) {
                            return out;
                        }
                    }
                }
            } catch {
            }
        }

        if (maskCanvas) {
            try {
                const out = maskCanvas.toDataURL('image/png');
                if (out && typeof out === 'string' && out.startsWith('data:image') && out.length > 1000)
                    return out;
            } catch {
            }
        }

        if (overlayCanvas && overlayCanvas.width > 0 && overlayCanvas.height > 0) {
            try {
                const out = overlayCanvas.toDataURL('image/png');
                if (out && typeof out === 'string' && out.startsWith('data:image') && out.length > 1000)
                    return out;
            } catch {
            }
        }

        try {
            const maskEl = imgContainer.querySelector('.mask');
            if (maskEl instanceof HTMLImageElement) {
                const src = String(maskEl.getAttribute('src') || maskEl.src || '');
                if (src && src.startsWith('data:image') && src.length > 1000) {
                    return src;
                }
            }
        } catch {
        }

        return null;
    }

    function refreshStoredMaskFromDom(imgContainer) {
        try {
            const maskUrl = computeMaskFromContainerDom(imgContainer);
            if (!maskUrl || typeof maskUrl !== 'string')
                return null;
            if (!maskUrl.startsWith('data:image') || maskUrl.length < 1000)
                return maskUrl;

            try {
                imgContainer.dataset.layerforgeLatestMask = maskUrl;
                imgContainer.dataset.layerforgeLatestMaskAt = String(Date.now());
            } catch {
            }
            try {
                const fp = imgContainer.dataset.layerforgeImageFingerprint || getPreferredFingerprintForContainer(imgContainer);
                if (fp) {
                    storeMaskForFingerprint(fp, maskUrl);
                }
            } catch {
            }
            return maskUrl;
        } catch {
            return null;
        }
    }

    function installMaskInteractionListener(imgContainer) {
        try {
            if (!imgContainer)
                return;
            if (imgContainer.dataset.layerforgeMaskListenerInstalled === '1')
                return;
            imgContainer.dataset.layerforgeMaskListenerInstalled = '1';
        } catch {
            return;
        }

        const schedule = () => {
            try {
                if (!containerSupportsMask(imgContainer))
                    return;
                if (getSimpAISketchApi(imgContainer))
                    return;
            } catch {
                return;
            }
            setTimeout(() => {
                try {
                    refreshStoredMaskFromDom(imgContainer);
                } catch {
                }
            }, 60);
        };

        try {
            imgContainer.addEventListener('pointerup', schedule, true);
            imgContainer.addEventListener('pointercancel', schedule, true);
            imgContainer.addEventListener('mouseup', schedule, true);
            imgContainer.addEventListener('touchend', schedule, true);
        } catch {
        }
    }

    function getMaskFromContainer(imgContainer) {
        if (!containerSupportsMask(imgContainer))
            return null;
        try {
            const domMask = refreshStoredMaskFromDom(imgContainer);
            if (domMask)
                return domMask;
        } catch {
        }
        const storedMask = getStoredMaskForContainer(imgContainer);
        if (storedMask) {
            try {
                imgContainer.dataset.layerforgeLatestMask = storedMask;
                if (!imgContainer.dataset.layerforgeLatestMaskAt) {
                    imgContainer.dataset.layerforgeLatestMaskAt = String(Date.now());
                }
            } catch {
            }
            return storedMask;
        }
        return null;
    }

    function getFileInput(container) {
        let input = container.querySelector('input[type="file"]');
        if (!input) {
            // Try looking up the tree
            const parent = container.closest('.gradio-image') || container.closest('.image-container');
            if (parent) {
                input = parent.querySelector('input[type="file"]');
            }
        }
        return input;
    }

    function getSimpAISketchApi(container) {
        try {
            if (!container)
                return null;
            if (window.SimpAISketch && typeof window.SimpAISketch.get === 'function') {
                const direct = window.SimpAISketch.get(container);
                if (direct)
                    return direct;
                const nested = container.querySelector?.('[data-simpai-sketch="1"], .simpai-custom-sketch-source');
                if (nested)
                    return window.SimpAISketch.get(nested);
            }
            return container.__simpaiSketch
                || container.closest?.('[data-simpai-sketch="1"]')?.__simpaiSketch
                || container.querySelector?.('[data-simpai-sketch="1"], .simpai-custom-sketch-source')?.__simpaiSketch
                || null;
        } catch {
            return null;
        }
    }

    function updateGradioImage(container, base64data) {
        const sketch = getSimpAISketchApi(container);
        if (sketch && typeof sketch.setImage === 'function') {
            try {
                const updatePromise = Promise.resolve(sketch.setImage(base64data, { change: true }));
                let trackedPromise = null;
                trackedPromise = updatePromise.finally(() => {
                    setTimeout(() => {
                        try {
                            if (container.__layerforgeSimpAISketchUpdatePromise === trackedPromise) {
                                delete container.__layerforgeSimpAISketchUpdatePromise;
                            }
                        } catch {
                        }
                    }, 0);
                });
                container.__layerforgeSimpAISketchUpdatePromise = trackedPromise;
                const img = container.querySelector('img');
                if (img) {
                    img.src = base64data;
                }
                const nextFp = getPreferredFingerprintForContainer(container, base64data);
                if (nextFp) {
                    container.dataset.layerforgeImageFingerprint = nextFp;
                }
                container.dataset.layerforgeProgrammaticUpdateAt = String(Date.now());
                updatePromise.finally(() => {
                    try {
                        delete container.dataset.layerforgeProgrammaticUpdateAt;
                    } catch {
                    }
                    window.postMessage({ type: 'GRADIO_IMAGE_UPDATED' }, '*');
                });
                return;
            } catch (e) {
                console.warn("[LayerForge] SimpAI sketch image update failed, falling back:", e);
            }
        }

        const img = container.querySelector('img');
        if (img) {
            img.src = base64data;
        }
        try {
            const nextFp = getPreferredFingerprintForContainer(container, base64data);
            if (nextFp) {
                container.dataset.layerforgeImageFingerprint = nextFp;
            }
        } catch {
        }
        try {
            container.dataset.layerforgeProgrammaticUpdateAt = String(Date.now());
            setTimeout(() => {
                try {
                    delete container.dataset.layerforgeProgrammaticUpdateAt;
                } catch {
                }
            }, 8000);
        } catch {
        }

        fetch(base64data)
            .then(res => res.blob())
            .then(blob => {
                const file = new File([blob], "edited_layerforge.png", { type: "image/png" });
                
                const input = getFileInput(container);

                if (input) {
                    const dataTransfer = new DataTransfer();
                    dataTransfer.items.add(file);
                    input.files = dataTransfer.files;

                    try {
                        container.dataset.layerforgeSuppressClearOnFileChange = '1';
                        setTimeout(() => {
                            try {
                                delete container.dataset.layerforgeSuppressClearOnFileChange;
                            } catch {
                            }
                        }, 2000);
                    } catch {
                    }
                    input.dispatchEvent(new Event('change', { bubbles: true }));

                    setTimeout(() => {
                        window.postMessage({ type: 'GRADIO_IMAGE_UPDATED' }, '*');
                    }, 200); 
                    
                } else {
                    console.warn("[LayerForge] Could not find file input to update Gradio state.");
                }
            });
    }

    const LAYERFORGE_CONTAINER_SELECTOR = [
        '[data-simpai-sketch="1"]',
        '.gradio-image',
        '.image-container',
        'div[data-testid="image"]',
        '.image-frame'
    ].join(',');
    const LAYERFORGE_OWNED_NODE_SELECTOR = [
        '.layerforge-edit-btn',
        'canvas[data-layerforge-overlay="1"]',
        'canvas[data-layerforge-overlay-display="1"]'
    ].join(',');

    function getLayerForgeElementDepth(el) {
        let depth = 0;
        let node = el;
        while (node && node.parentElement) {
            depth++;
            node = node.parentElement;
        }
        return depth;
    }

    function resolveLayerForgeCandidate(container) {
        try {
            if (!container)
                return null;
            const closestSketch = container.closest?.('[data-simpai-sketch="1"]');
            if (closestSketch)
                return closestSketch;
            return container;
        } catch {
            return container || null;
        }
    }

    function findLayerForgeImage(container) {
        try {
            if (!container)
                return null;
            const sketchProxy = container.querySelector?.('.simpai-sketch__image-proxy');
            if (getSimpAISketchApi(container) && sketchProxy instanceof HTMLImageElement)
                return sketchProxy;

            const images = container.querySelectorAll?.('img') || [];
            for (const img of images) {
                try {
                    if (!(img instanceof HTMLImageElement))
                        continue;
                    if (img.closest?.('.layerforge-edit-btn'))
                        continue;
                    if (img.classList?.contains('simpai-sketch__image-proxy'))
                        continue;
                    return img;
                } catch {
                }
            }
            return images[0] || null;
        } catch {
            return null;
        }
    }

    function isLayerForgeInlineImageReference(src) {
        try {
            const prefix = String(src || '').slice(0, 64).trimStart().toLowerCase();
            return prefix.startsWith('data:') || prefix.startsWith('blob:');
        } catch {
            return false;
        }
    }

    function isLayerForgeWelcomeMedia(container, src) {
        try {
            if (container?.closest?.('.sai-gradio-hidden-bridge'))
                return true;
            if (container?.closest?.('[data-simpleai-welcome-media-kind="title"], [data-simpleai-welcome-media-kind="waiting"]'))
                return true;
            if (isLayerForgeInlineImageReference(src))
                return false;
            const normalizedSrc = String(src || '').toLowerCase().replace(/\\/g, '/');
            if (typeof window.isStudioWelcomeMediaSource === 'function') {
                if (window.isStudioWelcomeMediaSource(normalizedSrc, 'title') || window.isStudioWelcomeMediaSource(normalizedSrc, 'waiting'))
                    return true;
            }
            return /presets\/welcome\//.test(normalizedSrc)
                || /studio_ui\/welcome\/(?:title|waiting)-/.test(normalizedSrc)
                || /(?:^|\/)(?:title|waiting)-(?:desktop|mobile)-[0-9a-f]{16}\.webp(?:[?#].*)?$/.test(normalizedSrc)
                || /(?:^|\/)(?:\d+_welcome_[wm]|welcome_[^/?#]+_[wm])\.(?:jpe?g|png|gif|webp)(?:[?#].*)?$/.test(normalizedSrc)
                || /(?:^|\/)welcome[^/]*\.png(?:[?#].*)?$/.test(normalizedSrc);
        } catch {
            return false;
        }
    }

    function isLayerForgeSystemImage(container, img) {
        try {
            if (container?.closest?.('#missing_model_welcome_hint'))
                return true;
            const rawSrc = String(img?.getAttribute?.('src') || img?.src || '');
            return isLayerForgeWelcomeMedia(container, rawSrc);
        } catch {
        }
        return false;
    }

    function isLayerForgeSystemContainer(container, checkedImage = null) {
        try {
            if (!container)
                return false;
            const images = container.querySelectorAll?.('img') || [];
            for (const img of images) {
                if (img === checkedImage)
                    continue;
                if (isLayerForgeSystemImage(container, img))
                    return true;
            }
        } catch {
        }
        return false;
    }

    function hasValidLayerForgeImage(container, img) {
        try {
            if (!img)
                return false;
            if (isLayerForgeSystemImage(container, img))
                return false;
            if (isLayerForgeSystemContainer(container, img))
                return false;
            const src = String(img.getAttribute('src') || img.src || '');
            if (!src)
                return false;
            if (src === 'about:blank' || src === 'data:,')
                return false;
            if (src.startsWith('data:image/svg'))
                return false;

            const w = img.naturalWidth || img.width || 0;
            const h = img.naturalHeight || img.height || 0;
            if (w <= 2 && h <= 2)
                return false;

            if (w < 50 && h < 50 && src.includes('data:'))
                return false;

            return true;
        } catch {
            return false;
        }
    }

    function scanAndInject(containers = null) {
        if (containers == null) {
            document.querySelectorAll('.layerforge-edit-btn').forEach((btn) => {
                try {
                    const parent = btn.parentElement;
                    if (!parent || !parent.matches?.(LAYERFORGE_CONTAINER_SELECTOR)) {
                        btn.remove();
                    }
                } catch {
                }
            });
        }
        
        const potentialContainers = (containers == null
            ? Array.from(document.querySelectorAll(LAYERFORGE_CONTAINER_SELECTOR))
            : Array.from(containers))
            .map(resolveLayerForgeCandidate)
            .filter((container) => container?.isConnected && container.matches?.(LAYERFORGE_CONTAINER_SELECTOR))
            .sort((a, b) => getLayerForgeElementDepth(a) - getLayerForgeElementDepth(b));
        const seenContainers = new Set();
        const seenImages = new WeakSet();
        
        potentialContainers.forEach(container => {
            if (seenContainers.has(container))
                return;
            seenContainers.add(container);

            const img = findLayerForgeImage(container);
            const existingBtn = getOwnLayerForgeButton(container);
            const hasValidImage = hasValidLayerForgeImage(container, img);

            if (!hasValidImage) {
                if (existingBtn) {
                    try {
                        existingBtn.remove();
                    } catch {
                    }
                }
                clearContainerStoredMask(container);
                try {
                    delete container.dataset.layerforgeImageFingerprint;
                } catch {
                }
                return;
            }

            if (img && seenImages.has(img)) {
                removeOwnLayerForgeButton(container);
                return;
            }
            if (img) {
                seenImages.add(img);
            }

            try {
                const fp = getPreferredFingerprintForContainer(container);
                if (fp) {
                    const prevFp = container.dataset.layerforgeImageFingerprint;
                    if (containerSupportsMask(container)) {
                        try {
                            const existingMask = container.dataset.layerforgeLatestMask;
                            if (prevFp && existingMask && typeof existingMask === 'string' && existingMask.startsWith('data:image')) {
                                storeMaskForFingerprint(prevFp, existingMask);
                            }
                        } catch {
                        }

                        if (prevFp && prevFp !== fp) {
                            const restoredForNew = getStoredMaskForFingerprint(fp);
                            if (restoredForNew) {
                                try {
                                    container.dataset.layerforgeLatestMask = restoredForNew;
                                    if (!container.dataset.layerforgeLatestMaskAt) {
                                        container.dataset.layerforgeLatestMaskAt = String(Date.now());
                                    }
                                } catch {
                                }
                            } else {
                                const allowCarry = (() => {
                                    try {
                                        const at = Number(container.dataset.layerforgeProgrammaticUpdateAt || 0);
                                        if (!at)
                                            return false;
                                        if ((Date.now() - at) > 8000)
                                            return false;
                                        if (!String(prevFp || '').startsWith('d:'))
                                            return false;
                                        if (!String(fp || '').startsWith('f:'))
                                            return false;
                                        const existingMask = container.dataset.layerforgeLatestMask;
                                        if (!existingMask || typeof existingMask !== 'string' || !existingMask.startsWith('data:image'))
                                            return false;
                                        storeMaskForFingerprint(fp, existingMask);
                                        container.dataset.layerforgeLatestMask = existingMask;
                                        if (!container.dataset.layerforgeLatestMaskAt) {
                                            container.dataset.layerforgeLatestMaskAt = String(Date.now());
                                        }
                                        return true;
                                    } catch {
                                        return false;
                                    }
                                })();
                                if (!allowCarry) {
                                    clearContainerStoredMask(container);
                                }
                            }
                        }
                        container.dataset.layerforgeImageFingerprint = fp;
                        if (!container.dataset.layerforgeLatestMask) {
                            const restored = getStoredMaskForFingerprint(fp);
                            if (restored) {
                                try {
                                    container.dataset.layerforgeLatestMask = restored;
                                    if (!container.dataset.layerforgeLatestMaskAt) {
                                        container.dataset.layerforgeLatestMaskAt = String(Date.now());
                                    }
                                } catch {
                                }
                            }
                        }
                    } else {
                        clearContainerStoredMask(container);
                        try {
                            delete container.dataset.layerforgeImageFingerprint;
                        } catch {
                        }
                    }
                }
            } catch {
            }

            try {
                if (containerSupportsMask(container)) {
                    installMaskInteractionListener(container);
                }
            } catch {
            }

            if (existingBtn)
                return;

            const style = window.getComputedStyle(container);
            if (style.position === 'static') {
                container.style.position = 'relative';
            }
            
            const btn = createEditButton(container);
            if (btn) {
                container.appendChild(btn);
            }
        });
    }

    function addLayerForgeCandidateAncestors(node, candidates) {
        try {
            let element = node instanceof Element ? node : node?.parentElement;
            while (element) {
                if (element.matches?.(LAYERFORGE_CONTAINER_SELECTOR)) {
                    const candidate = resolveLayerForgeCandidate(element);
                    if (candidate)
                        candidates.add(candidate);
                }
                element = element.parentElement;
            }
        } catch {
        }
    }

    function addLayerForgeCandidateTree(node, candidates) {
        try {
            if (!(node instanceof Element))
                return;
            addLayerForgeCandidateAncestors(node, candidates);
            node.querySelectorAll?.(LAYERFORGE_CONTAINER_SELECTOR).forEach((element) => {
                const candidate = resolveLayerForgeCandidate(element);
                if (candidate)
                    candidates.add(candidate);
            });
        } catch {
        }
    }

    function mutationOnlyAddsLayerForgeNodes(mutation) {
        try {
            const added = Array.from(mutation?.addedNodes || []);
            if (!added.length || (mutation?.removedNodes?.length || 0) > 0)
                return false;
            return added.every((node) => node instanceof Element && node.matches?.(LAYERFORGE_OWNED_NODE_SELECTOR));
        } catch {
            return false;
        }
    }

    function collectLayerForgeMutationCandidates(mutations) {
        const candidates = new Set();
        for (const mutation of mutations || []) {
            if (mutationOnlyAddsLayerForgeNodes(mutation))
                continue;
            addLayerForgeCandidateAncestors(mutation?.target, candidates);
            for (const node of mutation?.addedNodes || []) {
                addLayerForgeCandidateTree(node, candidates);
            }
        }
        return candidates;
    }

    let scanAndInjectTimer = 0;
    let scanAndInjectFrame = 0;
    const pendingScanAndInjectContainers = new Set();
    function scheduleScanAndInject(containers, delay = 80) {
        for (const container of containers || []) {
            if (container?.isConnected)
                pendingScanAndInjectContainers.add(container);
        }
        if (!pendingScanAndInjectContainers.size) return;
        if (scanAndInjectTimer || scanAndInjectFrame) return;
        const run = () => {
            scanAndInjectTimer = 0;
            scanAndInjectFrame = 0;
            const pendingContainers = Array.from(pendingScanAndInjectContainers);
            pendingScanAndInjectContainers.clear();
            scanAndInject(pendingContainers);
        };
        if (delay <= 0 && typeof requestAnimationFrame === 'function') {
            scanAndInjectFrame = requestAnimationFrame(run);
            return;
        }
        scanAndInjectTimer = setTimeout(() => {
            if (typeof requestAnimationFrame === 'function') {
                scanAndInjectFrame = requestAnimationFrame(run);
            } else {
                run();
            }
        }, Math.max(0, Number(delay) || 0));
    }

    function syncAllLayerForgeMasks(force = false) {
        const now = Date.now();
        if (!force && window.__layerforgeLastSync && (now - window.__layerforgeLastSync < 2000)) {
            return;
        }
        window.__layerforgeLastSync = now;

        const containers = document.querySelectorAll('.layerforge-edit-btn');
        containers.forEach((btn) => {
            const imgContainer = btn.parentElement;
            if (!imgContainer)
                return;
            try {
                refreshStoredMaskFromDom(imgContainer);
            } catch {
            }
            
            let stored = (() => {
                try {
                    return imgContainer.dataset.layerforgeLatestMask;
                } catch {
                    return null;
                }
            })();

            if (!stored) {
                return;
            }

            if (getSimpAISketchApi(imgContainer)) {
                trySyncMaskToInputs(imgContainer, stored);
                return;
            }
            
            const overlayCanvas = (() => {
                try {
                    return imgContainer.querySelector('canvas[data-layerforge-overlay="1"]');
                } catch {
                    return null;
                }
            })();

            const domMaskCanvas = selectMaskCanvasElement(imgContainer);

            if (domMaskCanvas) {
                if (overlayCanvas && overlayCanvas.width > 0 && overlayCanvas.height > 0) {
                    const baseImg = imgContainer.querySelector('img');
                    const targetW = baseImg?.naturalWidth || baseImg?.width || overlayCanvas.width || domMaskCanvas.width || 0;
                    const targetH = baseImg?.naturalHeight || baseImg?.height || overlayCanvas.height || domMaskCanvas.height || 0;
                    if (targetW > 0 && targetH > 0) {
                        const temp = document.createElement('canvas');
                        temp.width = targetW;
                        temp.height = targetH;
                        const ctx = temp.getContext('2d');
                        if (ctx) {
                            ctx.clearRect(0, 0, targetW, targetH);
                            try {
                                ctx.drawImage(overlayCanvas, 0, 0, overlayCanvas.width, overlayCanvas.height, 0, 0, targetW, targetH);
                            } catch {
                            }
                            try {
                                ctx.drawImage(domMaskCanvas, 0, 0, domMaskCanvas.width, domMaskCanvas.height, 0, 0, targetW, targetH);
                            } catch {
                            }
                            try {
                                const merged = temp.toDataURL('image/png');
                                if (merged && typeof merged === 'string' && merged.startsWith('data:image')) {
                                    const storedFp = getImageFingerprint(stored);
                                    const mergedFp = getImageFingerprint(merged);
                                    if (mergedFp && mergedFp !== storedFp) {
                                        imgContainer.dataset.layerforgeLatestMask = merged;
                                        imgContainer.dataset.layerforgeLatestMaskAt = String(Date.now());
                                        try {
                                            const fp = imgContainer.dataset.layerforgeImageFingerprint || getPreferredFingerprintForContainer(imgContainer);
                                            if (fp) {
                                                storeMaskForFingerprint(fp, merged);
                                            }
                                        } catch {
                                        }
                                        stored = merged;
                                    }
                                }
                            } catch {
                            }
                        }
                    }
                } else {
                    let domMaskUrl = null;
                    try {
                        domMaskUrl = domMaskCanvas.toDataURL('image/png');
                    } catch {
                        domMaskUrl = null;
                    }

                    if (domMaskUrl && typeof domMaskUrl === 'string' && domMaskUrl.startsWith('data:image')) {
                        try {
                            const baseImg = imgContainer.querySelector('img');
                            const targetW = baseImg?.naturalWidth || baseImg?.width || domMaskCanvas.width || 0;
                            const targetH = baseImg?.naturalHeight || baseImg?.height || domMaskCanvas.height || 0;
                            mergeMaskUrls(stored, domMaskUrl, targetW, targetH).then((merged) => {
                                try {
                                    if (!merged || typeof merged !== 'string' || !merged.startsWith('data:image'))
                                        return;
                                    const currentStored = imgContainer.dataset.layerforgeLatestMask;
                                    const currentFp = currentStored ? getImageFingerprint(currentStored) : '';
                                    const mergedFp = getImageFingerprint(merged);
                                    if (mergedFp && mergedFp !== currentFp) {
                                        imgContainer.dataset.layerforgeLatestMask = merged;
                                        imgContainer.dataset.layerforgeLatestMaskAt = String(Date.now());
                                        try {
                                            const fp = imgContainer.dataset.layerforgeImageFingerprint || getPreferredFingerprintForContainer(imgContainer);
                                            if (fp) {
                                                storeMaskForFingerprint(fp, merged);
                                            }
                                        } catch {
                                        }
                                    }
                                } catch {
                                }
                            }).catch(() => {
                            });
                        } catch {
                        }
                    }
                }
            }

            const mask = stored;
            if (!mask)
                return;
            trySyncMaskToInputs(imgContainer, mask);
        });
    }

    function collectSavedMaskContainers() {
        try {
            const nodes = document.querySelectorAll('[data-layerforge-latest-mask]');
            const out = [];
            nodes.forEach((c) => {
                try {
                    if (!containerSupportsMask(c))
                        return;
                    const mask = c.dataset.layerforgeLatestMask;
                    if (!mask || typeof mask !== 'string' || !mask.startsWith('data:image'))
                        return;
                    const fp = c.dataset.layerforgeImageFingerprint || getPreferredFingerprintForContainer(c);
                    if (!fp)
                        return;
                    out.push({ container: c, fp, mask });
                } catch {
                }
            });
            return out;
        } catch {
            return [];
        }
    }

    function extractFirstImageRefFromSubmission(parsed) {
        try {
            const isProbablyBase64 = (s) => {
                if (typeof s !== 'string')
                    return false;
                if (s.length < 512)
                    return false;
                if (!/^[A-Za-z0-9+/=\s]+$/.test(s))
                    return false;
                return true;
            };
            const isImageishString = (s) => {
                if (typeof s !== 'string')
                    return false;
                return s.startsWith('data:') || s.startsWith('blob:') || s.startsWith('/file=') || s.startsWith('http') || isProbablyBase64(s);
            };
            const stack = [{ v: parsed, k: '' }];
            while (stack.length) {
                const { v, k } = stack.pop();
                if (!v)
                    continue;
                if (typeof v === 'string') {
                    if (isImageishString(v) && /image/i.test(k) && !/mask/i.test(k)) {
                        return v;
                    }
                    continue;
                }
                if (Array.isArray(v)) {
                    if (v.length === 2) {
                        const first = v[0];
                        if (typeof first === 'string' && isImageishString(first)) {
                            return first;
                        }
                        if (first && typeof first === 'object') {
                            if (typeof first.data === 'string' && isImageishString(first.data)) {
                                return first.data;
                            }
                            if (typeof first.url === 'string' && isImageishString(first.url)) {
                                return first.url;
                            }
                            if (typeof first.path === 'string' && isImageishString(first.path)) {
                                return first.path;
                            }
                        }
                    }
                    for (let i = v.length - 1; i >= 0; i--) {
                        stack.push({ v: v[i], k: k });
                    }
                    continue;
                }
                if (typeof v === 'object') {
                    if (typeof v.data === 'string' && isImageishString(v.data) && /image/i.test(k) && !/mask/i.test(k)) {
                        return v.data;
                    }
                    if (typeof v.url === 'string' && isImageishString(v.url) && /image/i.test(k) && !/mask/i.test(k)) {
                        return v.url;
                    }
                    if (typeof v.path === 'string' && isImageishString(v.path) && /image/i.test(k) && !/mask/i.test(k)) {
                        return v.path;
                    }
                    const keys = Object.keys(v);
                    for (let i = keys.length - 1; i >= 0; i--) {
                        const key = keys[i];
                        stack.push({ v: v[key], k: key });
                    }
                }
            }
            const fallbackStack = [parsed];
            while (fallbackStack.length) {
                const v = fallbackStack.pop();
                if (!v)
                    continue;
                if (typeof v === 'string') {
                    if (isImageishString(v) && !v.startsWith('data:image/svg')) {
                        return v;
                    }
                    continue;
                }
                if (Array.isArray(v)) {
                    for (let i = v.length - 1; i >= 0; i--) {
                        fallbackStack.push(v[i]);
                    }
                    continue;
                }
                if (typeof v === 'object') {
                    if (typeof v.data === 'string' && isImageishString(v.data)) {
                        return v.data;
                    }
                    if (typeof v.url === 'string' && isImageishString(v.url)) {
                        return v.url;
                    }
                    if (typeof v.path === 'string' && isImageishString(v.path)) {
                        return v.path;
                    }
                    const keys = Object.keys(v);
                    for (let i = keys.length - 1; i >= 0; i--) {
                        fallbackStack.push(v[keys[i]]);
                    }
                }
            }
            return null;
        } catch {
            return null;
        }
    }

    function selectReplacementMaskFromParsedSubmission(parsed) {
        try {
            const saved = collectSavedMaskContainers();
            if (!saved.length)
                return null;

            let targetFp = '';
            const imgRef = extractFirstImageRefFromSubmission(parsed);
            if (imgRef) {
                targetFp = getImageFingerprint(imgRef);
            }

            if (targetFp) {
                const match = saved.find((x) => x.fp === targetFp);
                if (match)
                    return match.mask;
            }
            try {
                const active = window.__layerforgeActiveContainer;
                if (targetFp && active && active.isConnected && containerSupportsMask(active)) {
                    const activeMask = active.dataset?.layerforgeLatestMask;
                    const activeFp = active.dataset?.layerforgeImageFingerprint || getPreferredFingerprintForContainer(active);
                    if (activeMask && activeFp && activeFp === targetFp) {
                        return activeMask;
                    }
                }
            } catch {
            }

            if (!targetFp && saved.length === 1) {
                return saved[0].mask;
            }

            return null;
        } catch {
            return null;
        }
    }

    function installSubmissionSyncHook() {
        if (window.__layerforgeMaskSubmitHookInstalled)
            return;
        window.__layerforgeMaskSubmitHookInstalled = true;

        function collectDataUrlPaths(root, limit = 12) {
            const found = [];
            const stack = [{ v: root, path: '$' }];
            while (stack.length && found.length < limit) {
                const { v, path } = stack.pop();
                if (!v)
                    continue;
                if (typeof v === 'string') {
                    if (v.startsWith('data:image')) {
                        found.push({
                            path,
                            length: v.length,
                            prefix: v.slice(0, 32)
                        });
                    }
                    continue;
                }
                if (Array.isArray(v)) {
                    for (let i = v.length - 1; i >= 0; i--) {
                        stack.push({ v: v[i], path: `${path}[${i}]` });
                    }
                    continue;
                }
                if (typeof v === 'object') {
                    const keys = Object.keys(v);
                    for (let i = keys.length - 1; i >= 0; i--) {
                        const k = keys[i];
                        stack.push({ v: v[k], path: `${path}.${k}` });
                    }
                }
            }
            return found;
        }

        function collectMaskCandidatePaths(root, limit = 12) {
            const found = [];
            const stack = [{ v: root, path: '$' }];
            while (stack.length && found.length < limit) {
                const { v, path } = stack.pop();
                if (!v)
                    continue;
                if (Array.isArray(v)) {
                    for (let i = v.length - 1; i >= 0; i--) {
                        stack.push({ v: v[i], path: `${path}[${i}]` });
                    }
                    continue;
                }
                if (typeof v === 'object') {
                    for (const k of Object.keys(v)) {
                        const child = v[k];
                        const childPath = `${path}.${k}`;
                        if (/mask|sketch/i.test(k)) {
                            const t = child === null ? 'null' : (typeof child === 'object' ? (child.constructor?.name || 'object') : typeof child);
                            const len = typeof child === 'string' ? child.length : null;
                            const prefix = typeof child === 'string' ? child.slice(0, 48) : null;
                            found.push({ path: childPath, type: t, length: len, prefix });
                            if (found.length >= limit)
                                break;
                        }
                        stack.push({ v: child, path: childPath });
                    }
                }
            }
            return found;
        }

        function collectImageLikePaths(root, limit = 16) {
            const found = [];
            const stack = [{ v: root, path: '$' }];
            const isProbablyBase64 = (s) => {
                if (typeof s !== 'string')
                    return false;
                if (s.length < 512)
                    return false;
                if (!/^[A-Za-z0-9+/=\s]+$/.test(s))
                    return false;
                return true;
            };
            const isImageishString = (s) => {
                if (typeof s !== 'string')
                    return false;
                return s.startsWith('data:') || s.startsWith('blob:') || s.startsWith('/file=') || s.startsWith('http') || isProbablyBase64(s);
            };
            while (stack.length && found.length < limit) {
                const { v, path } = stack.pop();
                if (!v)
                    continue;
                if (typeof v === 'string') {
                    if (isImageishString(v)) {
                        found.push({ path, type: 'string', length: v.length, prefix: v.slice(0, 48) });
                    }
                    continue;
                }
                if (Array.isArray(v)) {
                    if (v.length === 2 && isImageishString(v[0])) {
                        const t1 = v[1] === null ? 'null' : (typeof v[1] === 'object' ? (v[1].constructor?.name || 'object') : typeof v[1]);
                        const len1 = typeof v[1] === 'string' ? v[1].length : null;
                        const pre1 = typeof v[1] === 'string' ? v[1].slice(0, 48) : null;
                        found.push({ path, type: 'pair', secondType: t1, secondLength: len1, secondPrefix: pre1 });
                    }
                    for (let i = v.length - 1; i >= 0; i--) {
                        stack.push({ v: v[i], path: `${path}[${i}]` });
                    }
                    continue;
                }
                if (typeof v === 'object') {
                    const name = typeof v.name === 'string' ? v.name : null;
                    const origName = typeof v.orig_name === 'string' ? v.orig_name : null;
                    const filePath = typeof v.path === 'string' ? v.path : null;
                    const url = typeof v.url === 'string' ? v.url : null;
                    const isFile = typeof v.is_file === 'boolean' ? v.is_file : null;
                    if (name || origName || filePath || url || isFile !== null) {
                        found.push({ path, type: v.constructor?.name || 'object', name, origName, pathValue: filePath, url, isFile });
                    }
                    const keys = Object.keys(v);
                    for (let i = keys.length - 1; i >= 0; i--) {
                        const k = keys[i];
                        stack.push({ v: v[k], path: `${path}.${k}` });
                    }
                }
            }
            return found;
        }

        function summarizeRunSubmission(parsed) {
            try {
                const topKeys = parsed && typeof parsed === 'object' ? Object.keys(parsed).slice(0, 32) : [];
                const data = parsed && typeof parsed === 'object' && Array.isArray(parsed.data) ? parsed.data : null;
                const dataLen = data ? data.length : null;
                const dataPreview = [];
                if (data) {
                    const take = Math.min(12, data.length);
                    for (let i = 0; i < take; i++) {
                        const v = data[i];
                        const t = v === null ? 'null' : (typeof v === 'object' ? (v.constructor?.name || 'object') : typeof v);
                        const keys = (v && typeof v === 'object' && !Array.isArray(v)) ? Object.keys(v).slice(0, 10) : null;
                        const prefix = typeof v === 'string' ? v.slice(0, 64) : null;
                        const name = v && typeof v === 'object' && typeof v.name === 'string' ? v.name : null;
                        const origName = v && typeof v === 'object' && typeof v.orig_name === 'string' ? v.orig_name : null;
                        const pathValue = v && typeof v === 'object' && typeof v.path === 'string' ? v.path : null;
                        const url = v && typeof v === 'object' && typeof v.url === 'string' ? v.url : null;
                        const isFile = v && typeof v === 'object' && typeof v.is_file === 'boolean' ? v.is_file : null;
                        dataPreview.push({ i, type: t, keys, prefix, name, origName, pathValue, url, isFile });
                    }
                }
                return { topKeys, dataLen, dataPreview };
            } catch {
                return null;
            }
        }

        function looksLikeRunSubmission(url, init) {
            if (!url || typeof url !== 'string')
                return false;
            if (!/\/queue\/join|\/api\/predict|\/run\/predict/i.test(url))
                return false;

            const method = (init && typeof init === 'object' && init.method) ? String(init.method).toUpperCase() : 'GET';
            return method === 'POST';
        }

        function looksLikeSubmissionPayload(parsed) {
            try {
                if (!parsed || typeof parsed !== 'object')
                    return false;
                const hasNonEmptyArray = (v) => Array.isArray(v) && v.length > 0;
                const hasNonEmptyObject = (v) => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length > 0;
                if ('inputs' in parsed) {
                    const v = parsed.inputs;
                    if (hasNonEmptyArray(v) || hasNonEmptyObject(v))
                        return true;
                }
                if ('data' in parsed) {
                    const v = parsed.data;
                    if (hasNonEmptyArray(v) || hasNonEmptyObject(v))
                        return true;
                }
                if ('fn_index' in parsed) {
                    const v = parsed.data;
                    if (hasNonEmptyArray(v) || hasNonEmptyObject(v))
                        return true;
                }
            } catch {
            }
            return false;
        }

        function patchBodyIfPossible(body) {
            const saved = collectSavedMaskContainers();
            if (!saved.length)
                return { body, changed: false };
            const maskByFp = new Map();
            for (const entry of saved) {
                try {
                    if (entry && entry.fp && entry.mask) {
                        maskByFp.set(entry.fp, entry.mask);
                    }
                } catch {
                }
            }
            if (!maskByFp.size)
                return { body, changed: false };

            const getFingerprintFromImageValue = (v) => {
                try {
                    if (!v)
                        return '';
                    if (typeof v === 'string') {
                        return getImageFingerprint(v);
                    }
                    if (Array.isArray(v)) {
                        return v.length ? getFingerprintFromImageValue(v[0]) : '';
                    }
                    if (typeof v === 'object') {
                        if (typeof v.data === 'string')
                            return getImageFingerprint(v.data);
                        if (typeof v.url === 'string')
                            return getImageFingerprint(v.url);
                        if (typeof v.path === 'string')
                            return getImageFingerprint(v.path);
                    }
                    return '';
                } catch {
                    return '';
                }
            };

            const applyMaskToValue = (replacementMask, container, k, v) => {
                try {
                    if (!replacementMask || typeof replacementMask !== 'string' || !replacementMask.startsWith('data:image'))
                        return false;
                    if (v === null || typeof v === 'undefined') {
                        container[k] = replacementMask;
                        return true;
                    }
                    if (typeof v === 'string') {
                        if (v.startsWith('data:') || v.startsWith('blob:') || v.startsWith('/file=') || v.startsWith('http') || (v.length > 512 && /^[A-Za-z0-9+/=\s]+$/.test(v))) {
                            container[k] = replacementMask;
                            return true;
                        }
                        return false;
                    }
                    if (typeof v === 'object') {
                        const hasFileShape = typeof v.path === 'string' || typeof v.orig_name === 'string' || typeof v.is_file === 'boolean';
                        if (hasFileShape) {
                            container[k] = { data: replacementMask, is_file: false, name: v.orig_name || v.name || 'mask.png' };
                            return true;
                        }
                        if (typeof v.data === 'string' || v.data === null || typeof v.data === 'undefined') {
                            v.data = replacementMask;
                            if (typeof v.is_file === 'boolean') {
                                v.is_file = false;
                            }
                            return true;
                        }
                        if (typeof v.url === 'string' || v.url === null || typeof v.url === 'undefined') {
                            v.url = replacementMask;
                            return true;
                        }
                    }
                } catch {
                }
                return false;
            };

            const replaceMasksByFingerprint = (root) => {
                try {
                    let changed = false;
                    const stack = [{ v: root }];
                    while (stack.length) {
                        const { v } = stack.pop();
                        if (!v)
                            continue;
                        if (Array.isArray(v)) {
                            if (v.length === 2) {
                                const fp = getFingerprintFromImageValue(v[0]);
                                const repl = fp ? maskByFp.get(fp) : null;
                                if (repl) {
                                    if (applyMaskToValue(repl, v, 1, v[1])) {
                                        changed = true;
                                    }
                                }
                            }
                            for (let i = 0; i < v.length; i++) {
                                stack.push({ v: v[i] });
                            }
                            continue;
                        }
                        if (typeof v === 'object') {
                            const hasImageAndMask = Object.prototype.hasOwnProperty.call(v, 'image') && Object.prototype.hasOwnProperty.call(v, 'mask');
                            if (hasImageAndMask) {
                                const fp = getFingerprintFromImageValue(v.image);
                                const repl = fp ? maskByFp.get(fp) : null;
                                if (repl) {
                                    if (applyMaskToValue(repl, v, 'mask', v.mask)) {
                                        changed = true;
                                    }
                                }
                            }
                            for (const k of Object.keys(v)) {
                                stack.push({ v: v[k] });
                            }
                        }
                    }
                    return changed;
                } catch {
                    return false;
                }
            };

            const dataUrlToBlob = (dataUrl) => {
                try {
                    const comma = dataUrl.indexOf(',');
                    if (comma < 0)
                        return null;
                    const header = dataUrl.slice(0, comma);
                    const base64 = dataUrl.slice(comma + 1);
                    const mimeMatch = header.match(/data:([^;]+);base64/i);
                    const mime = mimeMatch ? mimeMatch[1] : 'image/png';
                    const binary = typeof atob === 'function' ? atob(base64) : null;
                    if (!binary)
                        return null;
                    const bytes = new Uint8Array(binary.length);
                    for (let i = 0; i < binary.length; i++) {
                        bytes[i] = binary.charCodeAt(i);
                    }
                    return new Blob([bytes], { type: mime });
                }
                catch {
                    return null;
                }
            };

            const tryPatchJsonText = (text) => {
                if (typeof text !== 'string')
                    return { body: text, changed: false };
                try {
                    const parsed = JSON.parse(text);
                    if (replaceMasksByFingerprint(parsed)) {
                        return { body: JSON.stringify(parsed), changed: true };
                    }
                }
                catch {
                }
                return { body: text, changed: false };
            };

            if (typeof body === 'string') {
                return tryPatchJsonText(body);
            }

            if (typeof ArrayBuffer !== 'undefined') {
                if (body instanceof ArrayBuffer) {
                    try {
                        const dec = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null;
                        const text = dec ? dec.decode(new Uint8Array(body)) : null;
                        if (text) {
                            const patched = tryPatchJsonText(text);
                            if (patched.changed) {
                                const enc = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
                                if (enc) {
                                    return { body: enc.encode(patched.body).buffer, changed: true };
                                }
                                return { body: patched.body, changed: true };
                            }
                        }
                    }
                    catch {
                    }
                    return { body, changed: false };
                }
                if (typeof ArrayBuffer.isView === 'function' && ArrayBuffer.isView(body)) {
                    try {
                        const u8 = new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
                        const dec = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null;
                        const text = dec ? dec.decode(u8) : null;
                        if (text) {
                            const patched = tryPatchJsonText(text);
                            if (patched.changed) {
                                const enc = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
                                if (enc) {
                                    const nextBytes = enc.encode(patched.body);
                                    return { body: nextBytes, changed: true };
                                }
                                return { body: patched.body, changed: true };
                            }
                        }
                    }
                    catch {
                    }
                    return { body, changed: false };
                }
            }

            if (body instanceof URLSearchParams) {
                const next = new URLSearchParams(body);
                let changed = false;
                for (const [k, v] of next.entries()) {
                    if (typeof v === 'string' && (v.startsWith('{') || v.startsWith('['))) {
                        try {
                            const parsed = JSON.parse(v);
                            if (replaceMasksByFingerprint(parsed)) {
                                next.set(k, JSON.stringify(parsed));
                                changed = true;
                            }
                        } catch {
                        }
                    }
                }
                return { body: next, changed };
            }

            if (body instanceof FormData) {
                const next = new FormData();
                let changed = false;
                for (const [k, v] of body.entries()) {
                    const key = String(k);
                    if (typeof v === 'string') {
                        if (v.startsWith('{') || v.startsWith('[')) {
                            try {
                                const parsed = JSON.parse(v);
                                if (replaceMasksByFingerprint(parsed)) {
                                    next.append(k, JSON.stringify(parsed));
                                    changed = true;
                                    continue;
                                }
                            } catch {
                            }
                        }
                        next.append(k, v);
                        continue;
                    }
                    next.append(k, v);
                }
                return { body: next, changed };
            }

            return { body, changed: false };
        }

        const originalFetch = window.fetch;
        if (typeof originalFetch === 'function') {
            window.fetch = function (...args) {
                const input = args[0];
                const init = args[1];

                try {
                    const url = typeof input === 'string' ? input : (input && typeof input.url === 'string' ? input.url : '');
                    const isRequest = typeof Request !== 'undefined' && input instanceof Request;
                    const requestMethod = isRequest ? String(input.method || 'GET').toUpperCase() : '';
                    const initMethod = (init && typeof init === 'object' && init.method) ? String(init.method).toUpperCase() : '';
                    const method = initMethod || requestMethod || 'GET';

                    if (url && /\/queue\/join|\/api\/predict|\/run\/predict/i.test(url) && method === 'POST') {
                        const hasAnyMask = (() => {
                            try {
                                return !!document.querySelector('[data-layerforge-latest-mask]');
                            } catch {
                                return true;
                            }
                        })();
                        if (!hasAnyMask) {
                            return originalFetch.apply(this, args);
                        }
                        if (init && typeof init === 'object' && 'body' in init) {
                            try {
                                if (typeof init.body === 'string') {
                                    const parsed = JSON.parse(init.body);
                                    if (!looksLikeSubmissionPayload(parsed)) {
                                        return originalFetch.apply(this, args);
                                    }
                                }
                            } catch {
                                return originalFetch.apply(this, args);
                            }
                            try {
                                syncAllLayerForgeMasks(true);
                                const patched = patchBodyIfPossible(init.body);
                                if (patched.changed) {
                                    args[1] = { ...init, body: patched.body };
                                } else {
                                }
                            } catch {
                            }
                        } else if (isRequest) {
                            return (async () => {
                                try {
                                    const req = input;
                                    const ct = String(req.headers.get('content-type') || '').toLowerCase();
                                    let body;
                                    if (ct.includes('multipart/form-data')) {
                                        body = await req.clone().formData();
                                    } else if (ct.includes('application/x-www-form-urlencoded')) {
                                        const text = await req.clone().text();
                                        body = new URLSearchParams(text);
                                    } else {
                                        body = await req.clone().text();
                                    }

                                    if (typeof body === 'string') {
                                        try {
                                            const parsed = JSON.parse(body);
                                            if (!looksLikeSubmissionPayload(parsed)) {
                                                return originalFetch.apply(this, args);
                                            }
                                        } catch {
                                            return originalFetch.apply(this, args);
                                        }
                                    }

                                    syncAllLayerForgeMasks(true);
                                    const patched = patchBodyIfPossible(body);
                                    if (patched.changed) {
                                        const headers = new Headers(req.headers);
                                        if (patched.body instanceof FormData) {
                                            headers.delete('content-type');
                                        }
                                        const nextReq = new Request(req, { body: patched.body, headers });
                                        return originalFetch.call(this, nextReq);
                                    }
                                } catch {
                                }
                                return originalFetch.apply(this, args);
                            })();
                        } else {
                        }
                    }
                } catch {
                }

                return originalFetch.apply(this, args);
            };
        }

        const OriginalXHR = window.XMLHttpRequest;
        if (typeof OriginalXHR === 'function') {
            const originalOpen = OriginalXHR.prototype.open;
            const originalSend = OriginalXHR.prototype.send;

            OriginalXHR.prototype.open = function (method, url, ...rest) {
                try {
                    this.__layerforgeUrl = typeof url === 'string' ? url : '';
                    this.__layerforgeMethod = typeof method === 'string' ? method.toUpperCase() : '';
                } catch {
                }
                return originalOpen.call(this, method, url, ...rest);
            };

            OriginalXHR.prototype.send = function (body) {
                try {
                    const url = this.__layerforgeUrl;
                    const method = this.__layerforgeMethod || 'GET';
                    if (url && /\/queue\/join|\/api\/predict|\/run\/predict/i.test(url) && method === 'POST') {
                        const hasAnyMask = (() => {
                            try {
                                return !!document.querySelector('[data-layerforge-latest-mask]');
                            } catch {
                                return true;
                            }
                        })();
                        if (!hasAnyMask) {
                            return originalSend.call(this, body);
                        }
                        let replacementMask = null;
                        let shouldSync = false;
                        try {
                            if (typeof body === 'string') {
                                const parsed = JSON.parse(body);
                                if (looksLikeSubmissionPayload(parsed)) {
                                    shouldSync = true;
                                    replacementMask = selectReplacementMaskFromParsedSubmission(parsed);
                                } else {
                                    return originalSend.call(this, body);
                                }
                            }
                        } catch {
                        }
                        if (shouldSync) {
                            try {
                                syncAllLayerForgeMasks(true);
                            } catch {
                            }
                        }
                        if (replacementMask) {
                            const patched = patchBodyIfPossible(body, replacementMask);
                            if (patched.changed) {
                                body = patched.body;
                            } else {
                            }
                        }
                    }
                } catch {
                }
                return originalSend.call(this, body);
            };
        }

        const OriginalWebSocket = window.WebSocket;
        if (typeof OriginalWebSocket === 'function' && !window.__layerforgeWebSocketPatchInstalled) {
            window.__layerforgeWebSocketPatchInstalled = true;
            const originalSend = OriginalWebSocket.prototype.send;
            OriginalWebSocket.prototype.send = function (data) {
                try {
                    if (typeof data === 'string') {
                        let parsed = null;
                        try {
                            parsed = JSON.parse(data);
                        } catch {
                        }
                        if (parsed && looksLikeSubmissionPayload(parsed)) {
                            try {
                                syncAllLayerForgeMasks(true);
                            } catch {
                            }
                            const replacementMask = selectReplacementMaskFromParsedSubmission(parsed);
                            const patched = replacementMask ? patchBodyIfPossible(data, replacementMask) : patchBodyIfPossible(data);
                            if (patched.changed) {
                                return originalSend.call(this, patched.body);
                            }
                        }
                    }
                    if (typeof ArrayBuffer !== 'undefined' && (data instanceof ArrayBuffer || (typeof ArrayBuffer.isView === 'function' && ArrayBuffer.isView(data)))) {
                        try {
                            const u8 = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
                            const dec = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null;
                            const text = dec ? dec.decode(u8) : null;
                            if (text) {
                                let parsed = null;
                                try {
                                    parsed = JSON.parse(text);
                                } catch {
                                }
                                if (parsed && looksLikeSubmissionPayload(parsed)) {
                                    try {
                                        syncAllLayerForgeMasks(true);
                                    } catch {
                                    }
                                    const replacementMask = selectReplacementMaskFromParsedSubmission(parsed);
                                    const patched = replacementMask ? patchBodyIfPossible(text, replacementMask) : patchBodyIfPossible(text);
                                    if (patched.changed) {
                                        const enc = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
                                        if (enc) {
                                            return originalSend.call(this, enc.encode(patched.body));
                                        }
                                        return originalSend.call(this, patched.body);
                                    }
                                }
                            }
                        } catch {
                        }
                    }
                } catch {
                }
                return originalSend.call(this, data);
            };
        }
    }

    function init() {
        if (!document.body) {
            console.error("[LayerForge] document.body is still null!");
            return;
        }

        installSubmissionSyncHook();

        document.addEventListener('change', (e) => {
            try {
                const t = e?.target;
                if (!t || !(t instanceof HTMLInputElement))
                    return;
                if (t.type !== 'file')
                    return;
                const container = t.closest('.gradio-image') || t.closest('.image-container') || t.closest('div[data-testid="image"]') || t.closest('.image-frame') || t.closest('.svelte-1p9x6n');
                if (!container)
                    return;
                if (container.dataset.layerforgeSuppressClearOnFileChange === '1')
                    return;
                clearContainerStoredMask(container);
                const fp = getPreferredFingerprintForContainer(container);
                if (fp) {
                    container.dataset.layerforgeImageFingerprint = fp;
                } else {
                    delete container.dataset.layerforgeImageFingerprint;
                }
            } catch {
            }
        }, true);

        const observer = new MutationObserver((mutations) => {
            const candidates = collectLayerForgeMutationCandidates(mutations);
            scheduleScanAndInject(candidates, 80);
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['src']
        });

        scanAndInject();
    }

    // Wait for DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
