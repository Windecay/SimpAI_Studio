// based on https://github.com/AUTOMATIC1111/stable-diffusion-webui/blob/v1.6.0/script.js
function gradioApp() {
    try {
        let elem = document;
        
        // 尝试找到 gradio-app 元素
        const elems = document.getElementsByTagName('gradio-app');
        if (elems.length > 0) {
            elem = elems[0];
        }
        
        // 尝试找到其他可能的根元素（Gradio 6.12 可能使用不同的结构）
        if (elem === document) {
            const gradioContainer = document.querySelector('.gradio-container');
            if (gradioContainer) {
                elem = gradioContainer;
            }
        }

        if (elem !== document) {
            elem.getElementById = function(id) {
                return document.getElementById(id);
            };
        }
        
        return elem.shadowRoot ? elem.shadowRoot : elem;
    } catch (e) {
        console.warn('Error in gradioApp:', e);
        return document;
    }
}

function simpaiUiTraceEnabled() {
    try {
        return window.__SIMP_AI_UI_TRACE__ === true || window.localStorage.getItem("simpai.uiTrace") === "1";
    } catch (e) {
        return false;
    }
}

function simpaiUiTrace(level, ...args) {
    if (!simpaiUiTraceEnabled()) return;
    try {
        const fn = console[level] || console.log;
        fn.apply(console, args);
    } catch (e) {}
}

function simpleaiDisableHoverPreviewsForInput() {
    try {
        const coarsePrimary = !!window.matchMedia?.('(pointer: coarse)')?.matches;
        const noPrimaryHover = !!window.matchMedia?.('(hover: none)')?.matches;
        const fineHoverAvailable = !!window.matchMedia?.('(any-hover: hover) and (any-pointer: fine)')?.matches;
        return (coarsePrimary || noPrimaryHover) && !fineHoverAvailable;
    } catch (e) {
        return Number(navigator.maxTouchPoints || 0) > 0 && window.innerWidth <= 900;
    }
}
window.simpleaiDisableHoverPreviewsForInput = simpleaiDisableHoverPreviewsForInput;

(function initSimpleAIMediaResolutionBadges() {
    if (window.__simpleaiMediaResolutionBadgesInitialized) return;
    window.__simpleaiMediaResolutionBadgesInitialized = true;

    const GALLERY_ORIGINAL_URL_TYPE = "application/x-simpleai-gallery-original-url";
    const GALLERY_DISPLAY_PREVIEW_PREFIX = "simpai_gprev__";
    const GALLERY_DISPLAY_PREVIEW_ROUTE = "/simpleai/gallery-preview/";
    const SKIP_ROOT_SELECTOR = [
        "#finished_gallery",
        "#final_gallery",
        "#preview_generating",
        "#comparison_box",
        "#lightboxModal",
        "#simpai-infinite-canvas-workbench",
        ".sai-canvas-workbench",
        ".simpai-sketch",
        ".simpai-custom-sketch-source"
    ].join(", ");
    const IMAGE_ROOT_SELECTOR = [
        '[data-testid="image"].image-container',
        ".gradio-image",
        ".image-container",
        ".image-frame"
    ].join(", ");
    let simpleaiMediaResolutionBadgeReconcileTimer = null;
    let simpleaiMediaResolutionBadgeLifecycleBound = false;

    function simpleaiNormalizeMediaDimensions(width, height) {
        const w = Math.round(Number(width || 0));
        const h = Math.round(Number(height || 0));
        if (!(w > 0 && h > 0)) return null;
        return { width: w, height: h };
    }

    function simpleaiMediaResolutionLabel(dimensions) {
        const size = simpleaiNormalizeMediaDimensions(dimensions?.width, dimensions?.height);
        return size ? `${size.width} x ${size.height}` : "";
    }

    function simpleaiEnsureMediaResolutionBadge(host) {
        if (!host || !host.querySelector) return null;
        let badge = host.querySelector(":scope > .simpai-media-resolution-badge");
        if (!badge) {
            badge = document.createElement("div");
            badge.className = "simpai-media-resolution-badge";
            badge.setAttribute("aria-hidden", "true");
            host.appendChild(badge);
        }
        return badge;
    }

    function simpleaiApplyMediaResolutionBadge(host, dimensions, options = {}) {
        const size = simpleaiNormalizeMediaDimensions(dimensions?.width, dimensions?.height);
        if (!host || !size) {
            simpleaiClearMediaResolutionBadge(host);
            return false;
        }
        const badge = simpleaiEnsureMediaResolutionBadge(host);
        if (!badge) return false;
        const label = options.label || simpleaiMediaResolutionLabel(size);
        if (!host.classList.contains("simpai-media-resolution-host")) {
            host.classList.add("simpai-media-resolution-host");
        }
        if (host.dataset) host.dataset.simpaiMediaResolutionBadgeAppliedAt = String(Date.now());
        if (badge.textContent !== label) badge.textContent = label;
        if (badge.hidden) badge.hidden = false;
        return true;
    }

    function simpleaiClearMediaResolutionBadge(host) {
        if (!host || !host.querySelector) return false;
        const badge = host.querySelector(":scope > .simpai-media-resolution-badge");
        if (badge) {
            badge.hidden = true;
            host.classList?.remove?.("simpai-media-resolution-host");
            try { delete host.dataset.simpaiMediaResolutionBadgeAppliedAt; } catch (e) {}
        }
        return !!badge;
    }

    function simpleaiMediaResolutionBadgeAppliedAge(host) {
        const appliedAt = Number(host?.dataset?.simpaiMediaResolutionBadgeAppliedAt || 0);
        return appliedAt > 0 ? Date.now() - appliedAt : Number.POSITIVE_INFINITY;
    }

    function simpleaiMediaNodeHasSource(node) {
        if (!node || node.closest?.(".simpai-media-resolution-badge")) return false;
        if (node.closest?.("button, .icon-button-wrapper, .tools")) return false;
        const tag = String(node.tagName || "").toUpperCase();
        if (tag === "IMG") {
            const src = String(node.currentSrc || node.src || node.getAttribute?.("src") || "").trim();
            const srcset = String(node.getAttribute?.("srcset") || "").trim();
            return !!(src || srcset || (node.naturalWidth > 0 && node.naturalHeight > 0));
        }
        if (tag === "VIDEO") {
            const src = String(node.currentSrc || node.src || node.getAttribute?.("src") || "").trim();
            return !!(src || (node.videoWidth > 0 && node.videoHeight > 0));
        }
        if (tag === "CANVAS") {
            return Number(node.width || 0) > 1 && Number(node.height || 0) > 1;
        }
        return false;
    }

    function simpleaiMediaRootHasActiveMedia(host) {
        if (!host || !host.querySelectorAll) return false;
        return Array.from(host.querySelectorAll("img, video, canvas")).some(simpleaiMediaNodeHasSource);
    }

    function simpleaiCollectMediaResolutionBadgeHosts(scope) {
        const hosts = new Set();
        const addHost = (node) => {
            if (!node || node.nodeType !== 1) return;
            const directHost = node.matches?.(".simpai-media-resolution-host") ? node : node.closest?.(".simpai-media-resolution-host");
            if (directHost) hosts.add(directHost);
            if (node.matches?.(".simpai-media-resolution-badge") && node.parentElement) hosts.add(node.parentElement);
            const imageRoot = node.matches?.(IMAGE_ROOT_SELECTOR) ? node : node.closest?.(IMAGE_ROOT_SELECTOR);
            if (imageRoot?.querySelector?.(":scope > .simpai-media-resolution-badge")) hosts.add(imageRoot);
            node.querySelectorAll?.(".simpai-media-resolution-badge").forEach((badge) => {
                if (badge.parentElement) hosts.add(badge.parentElement);
            });
        };
        if (scope && scope !== document) addHost(scope.nodeType === 1 ? scope : scope.parentElement);
        if (!hosts.size) {
            const root = scope?.querySelectorAll ? scope : document;
            root.querySelectorAll?.(".simpai-media-resolution-badge").forEach((badge) => {
                if (badge.parentElement) hosts.add(badge.parentElement);
            });
        }
        return Array.from(hosts);
    }

    function simpleaiReconcileMediaResolutionBadgeRoot(host) {
        if (!host || !host.querySelector || host.closest?.(SKIP_ROOT_SELECTOR)) return false;
        const badge = host.querySelector(":scope > .simpai-media-resolution-badge");
        if (!badge || badge.hidden || simpleaiMediaRootHasActiveMedia(host)) return false;
        const age = simpleaiMediaResolutionBadgeAppliedAge(host);
        if (age < 1600) {
            window.clearTimeout(host.__simpleaiMediaResolutionBadgeGraceTimer);
            host.__simpleaiMediaResolutionBadgeGraceTimer = window.setTimeout(() => {
                simpleaiScheduleMediaResolutionBadgeReconcile(host);
            }, Math.max(80, 1650 - age));
            return false;
        }
        return simpleaiClearMediaResolutionBadge(host);
    }

    function simpleaiReconcileMediaResolutionBadges(scope = document) {
        let changed = false;
        for (const host of simpleaiCollectMediaResolutionBadgeHosts(scope)) {
            changed = simpleaiReconcileMediaResolutionBadgeRoot(host) || changed;
        }
        return changed;
    }

    function simpleaiScheduleMediaResolutionBadgeReconcile(scope = document, delay = 60) {
        window.clearTimeout(simpleaiMediaResolutionBadgeReconcileTimer);
        simpleaiMediaResolutionBadgeReconcileTimer = window.setTimeout(() => {
            simpleaiReconcileMediaResolutionBadges(scope);
        }, Math.max(0, Number(delay) || 0));
    }

    function bindSimpleAIMediaResolutionBadgeObserver() {
        if (window.__simpleaiMediaResolutionBadgeObserver) return;
        const target = document.body || document.documentElement;
        if (!target) {
            window.setTimeout(bindSimpleAIMediaResolutionBadgeObserver, 200);
            return;
        }
        const observer = new MutationObserver((mutations) => {
            const relevant = mutations.some((mutation) => {
                const targetNode = mutation.target;
                if (targetNode?.classList?.contains("simpai-media-resolution-badge")) return true;
                return !!(
                    targetNode?.closest?.(IMAGE_ROOT_SELECTOR)
                    || targetNode?.querySelector?.(".simpai-media-resolution-badge")
                );
            });
            if (relevant) simpleaiScheduleMediaResolutionBadgeReconcile(document);
        });
        observer.observe(target, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["src", "srcset", "class", "style", "hidden", "aria-hidden"],
        });
        window.__simpleaiMediaResolutionBadgeObserver = observer;
    }

    function bindSimpleAIMediaResolutionBadgeLifecycleCallbacks() {
        if (simpleaiMediaResolutionBadgeLifecycleBound) return;
        if (
            typeof onUiLoaded !== "function" ||
            typeof onAfterUiUpdate !== "function" ||
            typeof uiLoadedCallbacks === "undefined" ||
            typeof uiAfterUpdateCallbacks === "undefined" ||
            !Array.isArray(uiLoadedCallbacks) ||
            !Array.isArray(uiAfterUpdateCallbacks)
        ) {
            window.setTimeout(bindSimpleAIMediaResolutionBadgeLifecycleCallbacks, 50);
            return;
        }
        simpleaiMediaResolutionBadgeLifecycleBound = true;
        onUiLoaded(() => simpleaiScheduleMediaResolutionBadgeReconcile(document));
        onAfterUiUpdate(() => simpleaiScheduleMediaResolutionBadgeReconcile(document));
        simpleaiScheduleMediaResolutionBadgeReconcile(document, 120);
    }

    function simpleaiBase64UrlDecodeUtf8(value) {
        const text = String(value || "");
        if (!text) return "";
        const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - text.length % 4) % 4);
        try {
            const binary = atob(padded);
            const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
            if (window.TextDecoder) return new TextDecoder("utf-8").decode(bytes);
            return decodeURIComponent(Array.from(bytes, (byte) => "%" + byte.toString(16).padStart(2, "0")).join(""));
        } catch (e) {
            return "";
        }
    }

    function simpleaiGalleryPreviewOriginalUrl(src) {
        const value = String(src || "");
        if (!value) return "";
        try {
            const url = new URL(value, document.baseURI || window.location?.href || location.href);
            const fileName = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() || "");
            const match = fileName.match(new RegExp(`^${GALLERY_DISPLAY_PREVIEW_PREFIX}([A-Za-z0-9_-]+)__[0-9a-f]{16}\\.jpg$`));
            if (!match) return value;
            const originalPath = simpleaiBase64UrlDecodeUtf8(match[1]);
            if (!originalPath) return value;
            const routeIndex = url.pathname.indexOf(GALLERY_DISPLAY_PREVIEW_ROUTE);
            const basePath = routeIndex >= 0 ? url.pathname.slice(0, routeIndex) : "";
            const encodedPath = encodeURI(String(originalPath).replace(/\\/g, "/")).replace(/\?/g, "%3F").replace(/#/g, "%23");
            return `${url.origin}${basePath}/gradio_api/file=${encodedPath}`;
        } catch (e) {
            return value;
        }
    }

    function simpleaiFirstUriFromText(text) {
        return String(text || "").split(/\r?\n/).map((line) => line.trim()).find((line) => line && !line.startsWith("#")) || "";
    }

    function simpleaiFirstImageSrcFromHtml(html) {
        if (!html) return "";
        try {
            const doc = new DOMParser().parseFromString(html, "text/html");
            const src = doc.querySelector("img[src]")?.getAttribute("src") || "";
            if (src) return src;
        } catch (e) {}
        const match = String(html).match(/<img\b[^>]*\bsrc=["']?([^"'\s>]+)/i);
        return match ? match[1] : "";
    }

    function simpleaiNormalizeDropImageUrl(value) {
        const text = String(value || "").trim();
        if (!text) return "";
        try {
            return simpleaiGalleryPreviewOriginalUrl(new URL(text, document.baseURI || window.location?.href || location.href).href);
        } catch (e) {
            return simpleaiGalleryPreviewOriginalUrl(text);
        }
    }

    function simpleaiDownloadUrlImageSource(value) {
        const text = String(value || "");
        if (!text) return "";
        const first = text.indexOf(":");
        const second = first >= 0 ? text.indexOf(":", first + 1) : -1;
        return second >= 0 ? simpleaiNormalizeDropImageUrl(text.slice(second + 1)) : "";
    }

    function simpleaiImageUrlFromDataTransfer(dataTransfer) {
        if (!dataTransfer || typeof dataTransfer.getData !== "function") {
            try { return simpleaiNormalizeDropImageUrl(window.__simpleaiGalleryOriginalDragUrl || ""); } catch (e) { return ""; }
        }
        return simpleaiNormalizeDropImageUrl(dataTransfer.getData(GALLERY_ORIGINAL_URL_TYPE))
            || simpleaiDownloadUrlImageSource(dataTransfer.getData("DownloadURL"))
            || simpleaiNormalizeDropImageUrl(simpleaiFirstUriFromText(dataTransfer.getData("text/uri-list")))
            || simpleaiNormalizeDropImageUrl(simpleaiFirstImageSrcFromHtml(dataTransfer.getData("text/html")))
            || simpleaiNormalizeDropImageUrl(dataTransfer.getData("text/plain"))
            || simpleaiNormalizeDropImageUrl(window.__simpleaiGalleryOriginalDragUrl || "");
    }

    async function simpleaiImageDimensionsFromBlob(blob) {
        if (!blob || !String(blob.type || "").toLowerCase().startsWith("image/")) return null;
        if (typeof createImageBitmap === "function") {
            const bitmap = await createImageBitmap(blob);
            try {
                return simpleaiNormalizeMediaDimensions(bitmap.width, bitmap.height);
            } finally {
                try { bitmap.close?.(); } catch (e) {}
            }
        }
        const objectUrl = URL.createObjectURL(blob);
        try {
            const img = await new Promise((resolve, reject) => {
                const node = new Image();
                node.onload = () => resolve(node);
                node.onerror = reject;
                node.src = objectUrl;
            });
            return simpleaiNormalizeMediaDimensions(img.naturalWidth, img.naturalHeight);
        } finally {
            URL.revokeObjectURL(objectUrl);
        }
    }

    async function simpleaiImageDimensionsFromUrl(url) {
        const source = simpleaiNormalizeDropImageUrl(url);
        if (!source) return null;
        const response = await fetch(source, { credentials: "same-origin" });
        if (!response.ok) return null;
        return simpleaiImageDimensionsFromBlob(await response.blob());
    }

    function simpleaiImageRootFromTarget(target) {
        const root = target?.closest?.(IMAGE_ROOT_SELECTOR);
        if (!root || root.closest?.(SKIP_ROOT_SELECTOR)) return null;
        return root;
    }

    function simpleaiFirstImageFileFromInput(input) {
        const files = input?.files ? Array.from(input.files) : [];
        return files.find((file) => String(file?.type || "").toLowerCase().startsWith("image/")) || null;
    }

    async function simpleaiApplyInputResolutionFromFile(input, file) {
        const root = simpleaiImageRootFromTarget(input);
        if (!root || !file) return false;
        try {
            const dimensions = await simpleaiImageDimensionsFromBlob(file);
            return simpleaiApplyMediaResolutionBadge(root, dimensions);
        } catch (e) {
            simpleaiClearMediaResolutionBadge(root);
            return false;
        }
    }

    document.addEventListener("change", (event) => {
        const input = event.target;
        if (!input || input.tagName !== "INPUT" || input.type !== "file") return;
        const file = simpleaiFirstImageFileFromInput(input);
        if (!file) {
            const root = simpleaiImageRootFromTarget(input);
            if (root) simpleaiClearMediaResolutionBadge(root);
            return;
        }
        simpleaiApplyInputResolutionFromFile(input, file);
    }, true);

    document.addEventListener("drop", (event) => {
        const root = simpleaiImageRootFromTarget(event.target);
        if (!root) return;
        const url = simpleaiImageUrlFromDataTransfer(event.dataTransfer);
        if (url) {
            simpleaiImageDimensionsFromUrl(url)
                .then((dimensions) => simpleaiApplyMediaResolutionBadge(root, dimensions))
                .catch(() => simpleaiClearMediaResolutionBadge(root));
            return;
        }
        const files = event.dataTransfer?.files ? Array.from(event.dataTransfer.files) : [];
        const file = files.find((item) => String(item?.type || "").toLowerCase().startsWith("image/"));
        if (file) simpleaiApplyInputResolutionFromFile(root, file);
    }, true);

    window.simpleaiApplyMediaResolutionBadge = simpleaiApplyMediaResolutionBadge;
    window.simpleaiClearMediaResolutionBadge = simpleaiClearMediaResolutionBadge;
    window.simpleaiReconcileMediaResolutionBadges = simpleaiReconcileMediaResolutionBadges;
    window.simpleaiMediaResolutionLabel = simpleaiMediaResolutionLabel;
    window.simpleaiImageDimensionsFromBlob = simpleaiImageDimensionsFromBlob;
    window.simpleaiImageDimensionsFromUrl = simpleaiImageDimensionsFromUrl;
    bindSimpleAIMediaResolutionBadgeObserver();
    window.setTimeout(bindSimpleAIMediaResolutionBadgeLifecycleCallbacks, 0);
})();

function simpleaiRehydrateModelsTabAfterPresetNav() {
    try {
        const root = gradioApp();
        const tabs = Array.from(root.querySelectorAll('[role="tab"], .tab-nav button, button'));
        const activeTabs = tabs.filter((tab) => {
            const selected = tab.getAttribute?.('aria-selected') === 'true' || tab.dataset?.selected === 'true';
            return selected || tab.classList?.contains('selected');
        });
        const isModelsActive = activeTabs.some((tab) => /^(Models|模型)$/i.test((tab.textContent || '').trim()));
        if (!isModelsActive) return false;
        const trigger = root.getElementById?.('models_nav_rehydrate_trigger') || root.querySelector('#models_nav_rehydrate_trigger');
        if (!trigger) return false;
        trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        return true;
    } catch (e) {
        console.warn('models tab preset rehydrate failed', e);
        return false;
    }
}

window.simpleaiRehydrateModelsTabAfterPresetNav = simpleaiRehydrateModelsTabAfterPresetNav;

(function() {
    const lazyAssetPromises = new Map();
    const lazyGroupsLoaded = new Set();
    const lazyGroupsLoading = new Map();
    let lazyAssetToastTimer = null;
    let customSketchLazyObserver = null;
    let customSketchLazyPending = false;
    let layerForgeLazyHoverTimer = null;
    let layerForgeLazyHoverContainer = null;
    const LAYERFORGE_LAZY_HOVER_DELAY_MS = 420;
    const LAYERFORGE_LAZY_CONTAINER_SELECTOR = [
        '[data-simpai-sketch="1"]',
        '.gradio-image',
        '.image-container',
        'div[data-testid="image"]',
        '.image-frame'
    ].join(',');

    function normalizeLazyAssetUrl(src) {
        try {
            return new URL(String(src || ''), window.location.href).href;
        } catch (e) {
            return String(src || '');
        }
    }

    function lazyAssetGroupConfig(groupName) {
        const manifest = window.SimpAILazyAssets && typeof window.SimpAILazyAssets === 'object' ? window.SimpAILazyAssets : {};
        const groups = manifest.groups && typeof manifest.groups === 'object' ? manifest.groups : {};
        const group = groups[groupName] && typeof groups[groupName] === 'object' ? groups[groupName] : null;
        return group;
    }

    function lazyAssetList(group, key) {
        return Array.isArray(group?.[key])
            ? group[key].map((item) => String(item || '').trim()).filter(Boolean)
            : [];
    }

    function lazyAssetLangSource() {
        return window.simpleaiTopbarSystemParams || (typeof topbarLastSystemParams !== 'undefined' ? topbarLastSystemParams : null) || {};
    }

    function lazyAssetText(en, cn) {
        if (window.SimpAII18n?.t) {
            try {
                return window.SimpAII18n.t(en, cn, lazyAssetLangSource());
            } catch (e) {
                try {
                    return window.SimpAII18n.t(en, cn);
                } catch (ignored) {}
            }
        }
        return String(window.locale_lang || '').toLowerCase().startsWith('en') ? en : (cn || en);
    }

    function lazyAssetGroupLabel(groupName) {
        const labels = {
            modelBrowser: ['Model Browser', '模型浏览器'],
            describeVlmChat: ['Describe Chat', 'Describe Chat'],
            poseStudio: ['Pose Studio', 'Pose Studio'],
            gaussianStudio: ['Gaussian Studio', 'Gaussian Studio'],
            livePortraitExpression: ['LivePortrait Expression', 'LivePortrait Expression'],
            h3StoryboardEditor: ['H3 Storyboard', 'H3 分镜表'],
            tagCart: ['Tag Cart', '标签选择器'],
            layerForge: ['LayerForge', 'LayerForge'],
            customSketch: ['Sketch', 'Sketch'],
            infiniteCanvas: ['Infinite Canvas', '无限画布']
        };
        const pair = labels[groupName] || [groupName || 'Feature', groupName || '功能'];
        return lazyAssetText(pair[0], pair[1]);
    }

    function showLazyAssetLoadMessage(groupName) {
        const label = lazyAssetGroupLabel(groupName);
        const message = lazyAssetText(`${label} assets failed to load. Please refresh and try again.`, `${label} 资源加载失败，请刷新页面后重试。`);
        let toast = document.getElementById('simpai_lazy_asset_toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'simpai_lazy_asset_toast';
            toast.setAttribute('role', 'status');
            toast.setAttribute('aria-live', 'polite');
            toast.style.cssText = [
                'position:fixed',
                'right:18px',
                'bottom:18px',
                'z-index:2147483000',
                'max-width:min(360px,calc(100vw - 36px))',
                'padding:10px 14px',
                'border-radius:8px',
                'background:rgba(32,34,39,.96)',
                'color:#fff',
                'border:1px solid rgba(255,255,255,.18)',
                'box-shadow:0 12px 32px rgba(0,0,0,.32)',
                'font:14px/1.45 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
                'pointer-events:none'
            ].join(';');
            (document.body || document.documentElement).appendChild(toast);
        }
        toast.textContent = message;
        toast.hidden = false;
        if (lazyAssetToastTimer) clearTimeout(lazyAssetToastTimer);
        lazyAssetToastTimer = window.setTimeout(() => {
            toast.hidden = true;
        }, 4200);
    }

    function findExistingLazyStylesheet(href) {
        const normalized = normalizeLazyAssetUrl(href);
        return Array.from(document.querySelectorAll('link[rel~="stylesheet"]')).find((link) => {
            if (link.dataset?.simpaiLazyCssSrc === normalized) return true;
            return normalizeLazyAssetUrl(link.getAttribute('href') || link.href || '') === normalized;
        }) || null;
    }

    function findExistingLazyScript(src) {
        const normalized = normalizeLazyAssetUrl(src);
        return Array.from(document.scripts || []).find((script) => {
            if (script.dataset?.simpaiLazyJsSrc === normalized) return true;
            return normalizeLazyAssetUrl(script.getAttribute('src') || script.src || '') === normalized;
        }) || null;
    }

    function loadLazyStylesheetOnce(href) {
        const normalized = normalizeLazyAssetUrl(href);
        if (!normalized) return Promise.resolve(null);
        const key = `css:${normalized}`;
        if (lazyAssetPromises.has(key)) return lazyAssetPromises.get(key);

        const existing = findExistingLazyStylesheet(href);
        if (existing) {
            existing.dataset.simpaiLazyCssLoaded = 'true';
            const promise = Promise.resolve(existing);
            lazyAssetPromises.set(key, promise);
            return promise;
        }

        const promise = new Promise((resolve, reject) => {
            const link = document.createElement('link');
            let done = false;
            const finish = () => {
                if (done) return;
                done = true;
                link.dataset.simpaiLazyCssLoaded = 'true';
                resolve(link);
            };
            const fail = () => {
                if (done) return;
                done = true;
                lazyAssetPromises.delete(key);
                link.remove();
                reject(new Error(`Failed to load stylesheet: ${href}`));
            };
            link.rel = 'stylesheet';
            link.setAttribute('property', 'stylesheet');
            link.dataset.simpaiLazyCssSrc = normalized;
            link.addEventListener('load', finish, { once: true });
            link.addEventListener('error', fail, { once: true });
            link.href = href;
            (document.head || document.documentElement).appendChild(link);
        });
        lazyAssetPromises.set(key, promise);
        return promise;
    }

    function loadLazyScriptOnce(src) {
        const normalized = normalizeLazyAssetUrl(src);
        if (!normalized) return Promise.resolve(null);
        const key = `js:${normalized}`;
        if (lazyAssetPromises.has(key)) return lazyAssetPromises.get(key);

        const existing = findExistingLazyScript(src);
        if (existing && !existing.dataset?.simpaiLazyJsSrc) {
            existing.dataset.simpaiLazyJsLoaded = 'true';
            const promise = Promise.resolve(existing);
            lazyAssetPromises.set(key, promise);
            return promise;
        }
        if (existing?.dataset?.simpaiLazyJsLoaded === 'true') {
            const promise = Promise.resolve(existing);
            lazyAssetPromises.set(key, promise);
            return promise;
        }

        const promise = new Promise((resolve, reject) => {
            const script = existing || document.createElement('script');
            let done = false;
            const finish = () => {
                if (done) return;
                done = true;
                script.dataset.simpaiLazyJsLoaded = 'true';
                resolve(script);
            };
            const fail = () => {
                if (done) return;
                done = true;
                lazyAssetPromises.delete(key);
                if (script.parentElement && script.dataset?.simpaiLazyJsSrc === normalized) script.remove();
                reject(new Error(`Failed to load script: ${src}`));
            };
            if (script.dataset?.simpaiLazyJsLoaded === 'true') {
                finish();
                return;
            }
            script.type = 'text/javascript';
            script.async = false;
            script.dataset.simpaiLazyJsSrc = normalized;
            script.addEventListener('load', finish, { once: true });
            script.addEventListener('error', fail, { once: true });
            if (!existing) {
                script.src = src;
                (document.head || document.documentElement).appendChild(script);
            }
        });
        lazyAssetPromises.set(key, promise);
        return promise;
    }

    async function loadSimpleAILazyAssetGroup(groupName) {
        const name = String(groupName || '').trim();
        if (!name) return false;
        if (lazyGroupsLoaded.has(name)) return true;
        if (lazyGroupsLoading.has(name)) return lazyGroupsLoading.get(name);

        const promise = (async () => {
            const group = lazyAssetGroupConfig(name);
            if (!group) return false;
            const stylesheets = lazyAssetList(group, 'css');
            const scripts = lazyAssetList(group, 'js');
            await Promise.all(stylesheets.map(loadLazyStylesheetOnce));
            for (const src of scripts) {
                await loadLazyScriptOnce(src);
            }
            lazyGroupsLoaded.add(name);
            return true;
        })().finally(() => {
            lazyGroupsLoading.delete(name);
        });
        lazyGroupsLoading.set(name, promise);
        return promise;
    }

    function isSimpleAILazyAssetGroupLoaded(groupName) {
        return lazyGroupsLoaded.has(String(groupName || '').trim());
    }

    async function simpleaiAutoSendLoraTriggerWords(modelName, autoSend) {
        try {
            if (!window.SimpAIModelBrowser?.autoSendTriggerWordsForModel) {
                await loadSimpleAILazyAssetGroup('modelBrowser');
            }
            window.SimpAIModelBrowser?.autoSendTriggerWordsForModel?.(modelName, autoSend);
        } catch (e) {
            console.warn('lora.auto_trigger_send_failed', e);
            showLazyAssetLoadMessage('modelBrowser');
        }
    }

    function replayClickAfterLazyLoad(groupName, event, selector) {
        const trigger = event.target?.closest?.(selector);
        if (!trigger || isSimpleAILazyAssetGroupLoaded(groupName)) return false;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (trigger.dataset.simpaiLazyReplayPending === '1') return true;
        trigger.dataset.simpaiLazyReplayPending = '1';
        loadSimpleAILazyAssetGroup(groupName).then((ok) => {
            delete trigger.dataset.simpaiLazyReplayPending;
            if (!ok) {
                showLazyAssetLoadMessage(groupName);
                return;
            }
            if (!trigger.isConnected) return;
            trigger.dispatchEvent(new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window,
                button: 0
            }));
        }).catch((err) => {
            delete trigger.dataset.simpaiLazyReplayPending;
            console.warn(`lazy asset group failed: ${groupName}`, err);
            showLazyAssetLoadMessage(groupName);
        });
        return true;
    }

    function replayKeydownAfterLazyLoad(groupName, event, selector) {
        const trigger = event.target?.closest?.(selector);
        if (!trigger || isSimpleAILazyAssetGroupLoaded(groupName)) return false;
        if (event.key !== 'Enter' && event.key !== ' ') return false;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (trigger.dataset.simpaiLazyReplayPending === '1') return true;
        trigger.dataset.simpaiLazyReplayPending = '1';
        loadSimpleAILazyAssetGroup(groupName).then((ok) => {
            delete trigger.dataset.simpaiLazyReplayPending;
            if (!ok) {
                showLazyAssetLoadMessage(groupName);
                return;
            }
            if (!trigger.isConnected) return;
            trigger.dispatchEvent(new KeyboardEvent('keydown', {
                key: event.key,
                code: event.code,
                bubbles: true,
                cancelable: true
            }));
        }).catch((err) => {
            delete trigger.dataset.simpaiLazyReplayPending;
            console.warn(`lazy asset group failed: ${groupName}`, err);
            showLazyAssetLoadMessage(groupName);
        });
        return true;
    }

    function nodeHasCustomSketchSource(node) {
        if (!node || node.nodeType !== 1) return false;
        return node.matches?.('.simpai-custom-sketch-source') || !!node.querySelector?.('.simpai-custom-sketch-source');
    }

    function ensureCustomSketchLazyIfNeeded(rootNode) {
        if (window.SimpAISketch?.get || customSketchLazyPending) return false;
        const root = rootNode && rootNode.nodeType === 1 ? rootNode : document;
        const hasSource = root === document
            ? !!document.querySelector('.simpai-custom-sketch-source')
            : nodeHasCustomSketchSource(root);
        if (!hasSource) return false;
        customSketchLazyPending = true;
        loadSimpleAILazyAssetGroup('customSketch').then((ok) => {
            customSketchLazyPending = false;
            if (!ok) {
                showLazyAssetLoadMessage('customSketch');
                return;
            }
            customSketchLazyObserver?.disconnect?.();
            customSketchLazyObserver = null;
        }).catch((err) => {
            customSketchLazyPending = false;
            console.warn('custom sketch lazy load failed', err);
            showLazyAssetLoadMessage('customSketch');
        });
        return true;
    }

    function handleCustomSketchLazyMutations(mutations) {
        if (window.SimpAISketch?.get) {
            customSketchLazyObserver?.disconnect?.();
            customSketchLazyObserver = null;
            return;
        }
        for (const mutation of mutations || []) {
            for (const node of mutation.addedNodes || []) {
                if (ensureCustomSketchLazyIfNeeded(node)) return;
            }
        }
    }

    function isLayerForgeLazySystemImage(container, img) {
        const rawSrc = String(img?.getAttribute?.('src') || img?.src || '');
        const sourcePrefix = rawSrc.slice(0, 64).trimStart().toLowerCase();
        if (sourcePrefix.startsWith('data:')) {
            return sourcePrefix === 'data:,'
                || !sourcePrefix.startsWith('data:image/')
                || sourcePrefix.startsWith('data:image/svg');
        }
        if (sourcePrefix.startsWith('blob:')) return false;
        const src = rawSrc.toLowerCase().replace(/\\/g, '/');
        return !src
            || src === 'about:blank'
            || /presets\/welcome\//.test(src)
            || /studio_ui\/welcome\/(?:title|waiting)-/.test(src)
            || /\/welcome[^/]*\.png(?:[?#].*)?$/.test(src)
            || !!container?.closest?.('#missing_model_welcome_hint');
    }

    function layerForgeLazyCandidateContainer(target) {
        if (window.SimpAILayerForgeAdapter || isSimpleAILazyAssetGroupLoaded('layerForge')) return null;
        const container = target?.closest?.(LAYERFORGE_LAZY_CONTAINER_SELECTOR);
        if (!container) return null;
        const img = container.matches?.('[data-simpai-sketch="1"]')
            ? container.querySelector('.simpai-sketch__image-proxy')
            : container.querySelector('img');
        if (!img || isLayerForgeLazySystemImage(container, img)) return null;
        const w = img.naturalWidth || img.width || 0;
        const h = img.naturalHeight || img.height || 0;
        if (w <= 2 && h <= 2) return null;
        return container;
    }

    function scheduleLayerForgeLazyLoad(container, delayMs) {
        if (window.SimpAILayerForgeAdapter || isSimpleAILazyAssetGroupLoaded('layerForge')) return;
        if (!container || !container.isConnected) return;
        if (layerForgeLazyHoverContainer === container && layerForgeLazyHoverTimer) return;
        if (layerForgeLazyHoverTimer) clearTimeout(layerForgeLazyHoverTimer);
        layerForgeLazyHoverContainer = container;
        layerForgeLazyHoverTimer = window.setTimeout(() => {
            layerForgeLazyHoverTimer = null;
            const current = layerForgeLazyHoverContainer;
            layerForgeLazyHoverContainer = null;
            if (!current?.isConnected) return;
            loadSimpleAILazyAssetGroup('layerForge').catch((err) => console.warn('LayerForge lazy load failed', err));
        }, Math.max(0, Number(delayMs) || 0));
    }

    function scheduleLayerForgeLazyFromPointer(event) {
        const container = layerForgeLazyCandidateContainer(event.target);
        if (!container) return;
        scheduleLayerForgeLazyLoad(container, LAYERFORGE_LAZY_HOVER_DELAY_MS);
    }

    function ensureLayerForgeLazyFromFocus(event) {
        const container = layerForgeLazyCandidateContainer(event.target);
        if (!container) return;
        scheduleLayerForgeLazyLoad(container, 0);
    }

    function cancelLayerForgeLazyHover(event) {
        if (!layerForgeLazyHoverTimer || !layerForgeLazyHoverContainer) return;
        const nextTarget = event.relatedTarget;
        if (nextTarget && layerForgeLazyHoverContainer.contains?.(nextTarget)) return;
        const leavingContainer = event.target?.closest?.(LAYERFORGE_LAZY_CONTAINER_SELECTOR);
        if (leavingContainer !== layerForgeLazyHoverContainer) return;
        clearTimeout(layerForgeLazyHoverTimer);
        layerForgeLazyHoverTimer = null;
        layerForgeLazyHoverContainer = null;
    }

    document.addEventListener('click', (event) => {
        replayClickAfterLazyLoad('describeVlmChat', event, '#describe_vlm_chat_button, #describe_vlm_chat_button button, .describe-vlm-chat-entry')
            || replayClickAfterLazyLoad('poseStudio', event, '[data-pose-studio-scene-open]')
            || replayClickAfterLazyLoad('gaussianStudio', event, '[data-gaussian-studio-scene-open]')
            || replayClickAfterLazyLoad('livePortraitExpression', event, '[data-liveportrait-expression-scene-open]')
            || replayClickAfterLazyLoad('ltxGuideEditor', event, '[data-ltx-guide-scene-open]')
            || replayClickAfterLazyLoad('h3StoryboardEditor', event, '[data-h3-storyboard-scene-open]');
    }, true);
    document.addEventListener('keydown', (event) => {
            replayKeydownAfterLazyLoad('poseStudio', event, '[data-pose-studio-scene-open]')
            || replayKeydownAfterLazyLoad('gaussianStudio', event, '[data-gaussian-studio-scene-open]')
            || replayKeydownAfterLazyLoad('livePortraitExpression', event, '[data-liveportrait-expression-scene-open]')
            || replayKeydownAfterLazyLoad('ltxGuideEditor', event, '[data-ltx-guide-scene-open]')
            || replayKeydownAfterLazyLoad('h3StoryboardEditor', event, '[data-h3-storyboard-scene-open]');
    }, true);
    document.addEventListener('pointerover', scheduleLayerForgeLazyFromPointer, { capture: true, passive: true });
    document.addEventListener('pointerout', cancelLayerForgeLazyHover, { capture: true, passive: true });
    document.addEventListener('focusin', ensureLayerForgeLazyFromFocus, true);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', ensureCustomSketchLazyIfNeeded, { once: true });
    } else {
        window.setTimeout(ensureCustomSketchLazyIfNeeded, 0);
    }
    if (window.MutationObserver) {
        customSketchLazyObserver = new MutationObserver(handleCustomSketchLazyMutations);
        customSketchLazyObserver.observe(document.documentElement, { childList: true, subtree: true });
    }

    window.loadSimpleAILazyAssetGroup = loadSimpleAILazyAssetGroup;
    window.simpleaiIsLazyAssetGroupLoaded = isSimpleAILazyAssetGroupLoaded;
    window.simpleaiShowLazyAssetLoadMessage = showLazyAssetLoadMessage;
    window.simpleaiAutoSendLoraTriggerWords = simpleaiAutoSendLoraTriggerWords;
    window.SimpAILazyAssetLoader = {
        loadGroup: loadSimpleAILazyAssetGroup,
        isGroupLoaded: isSimpleAILazyAssetGroupLoaded,
        loadScriptOnce: loadLazyScriptOnce,
        loadStylesheetOnce: loadLazyStylesheetOnce
    };
})();

(function() {
    const MOBILE_MODELS_SELECT_RENDER_LIMIT = 80;
    const MOBILE_MODELS_SELECT_ROW_HEIGHT = 30;
    let modelsSelectScrollFrame = 0;

    function modelsPanelUsesWindowedOptions() {
        return simpleaiDisableHoverPreviewsForInput();
    }

    function modelsPanelRawLangSource() {
        return window.simpleaiTopbarSystemParams || (typeof topbarLastSystemParams !== 'undefined' ? topbarLastSystemParams : null) || {};
    }

    function readModelsPanelCookie(name) {
        if (window.SimpAII18n?.readCookie) {
            try {
                return window.SimpAII18n.readCookie(name);
            } catch (e) {}
        }
        try {
            const prefix = `${name}=`;
            const item = String(document.cookie || '')
                .split(';')
                .map((part) => part.trim())
                .find((part) => part.startsWith(prefix));
            if (!item) return '';
            const raw = item.slice(prefix.length);
            try {
                return decodeURIComponent(raw);
            } catch (e) {
                return raw;
            }
        } catch (e) {
            return '';
        }
    }

    function normalizeModelsPanelLang(value) {
        const raw = String(value || '').trim().toLowerCase();
        if (!raw) return '';
        if (raw.startsWith('en')) return 'en';
        if (raw === 'zh' || raw.startsWith('cn') || raw.startsWith('zh-')) return 'cn';
        return '';
    }

    function modelsPanelLang() {
        const source = modelsPanelRawLangSource();
        const candidates = [];
        try {
            const search = new URLSearchParams(window.location.search || '');
            candidates.push(search.get('__lang'), search.get('lang'), search.get('language'));
        } catch (e) {}
        if (typeof window.locale_lang === 'string') candidates.push(window.locale_lang);
        try {
            candidates.push(localStorage.getItem('ailang'));
        } catch (e) {}
        candidates.push(readModelsPanelCookie('ailang'));
        candidates.push(document.documentElement.lang);
        candidates.push(
            source.__lang,
            source.lang,
            source.language,
            source.__language,
            source.state?.__lang,
            source.state?.lang,
            source.settings?.__lang
        );
        const activeLang = candidates.map(normalizeModelsPanelLang).find(Boolean);
        if (activeLang) return activeLang;
        if (window.SimpAII18n?.getUiLang) {
            try {
                return window.SimpAII18n.getUiLang(source);
            } catch (e) {}
        }
        return 'en';
    }

    function modelsPanelLangSource() {
        return { __lang: modelsPanelLang(), state: modelsPanelRawLangSource() || {} };
    }

    function modelsPanelLanguageKey() {
        return modelsPanelLang();
    }

    function modelsPanelText(en, cn) {
        if (window.SimpAII18n?.t) {
            try {
                return window.SimpAII18n.t(en, cn, modelsPanelLangSource());
            } catch (e) {
                try {
                    return window.SimpAII18n.t(en, cn);
                } catch (ignored) {}
            }
        }
        return modelsPanelLang() === 'en' ? en : (cn || en);
    }

    function localizeModelsJsPanel(panel) {
        const root = panel || document;
        root.querySelectorAll?.('[data-simpai-i18n-en]').forEach((node) => {
            node.textContent = modelsPanelText(node.dataset.simpaiI18nEn || '', node.dataset.simpaiI18nCn || '');
        });
        root.querySelectorAll?.('[data-simpai-i18n-title-en]').forEach((node) => {
            node.title = modelsPanelText(node.dataset.simpaiI18nTitleEn || '', node.dataset.simpaiI18nTitleCn || '');
        });
    }

    function syncModelsJsPanelLocalization() {
        document.querySelectorAll('[data-simpai-models-js-root]').forEach((panel) => localizeModelsJsPanel(panel));
    }

    function modelsPanelNeedsLocalization() {
        return Array.from(document.querySelectorAll('[data-simpai-models-js-root] [data-simpai-i18n-en]')).some((node) => (
            node.textContent !== modelsPanelText(node.dataset.simpaiI18nEn || '', node.dataset.simpaiI18nCn || '')
        ));
    }

    function getRoot() {
        try {
            return gradioApp();
        } catch (e) {
            return document;
        }
    }

    function ensureSelectOption(select, value) {
        if (!(select instanceof HTMLSelectElement)) return;
        const text = String(value ?? '').trim();
        if (!text) return;
        const exists = Array.from(select.options).some((option) => option.value === text);
        if (exists) return;
        const option = document.createElement('option');
        option.value = text;
        option.textContent = text;
        select.appendChild(option);
    }

    function setNativeValue(field, value) {
        if (!field) return false;
        if (field instanceof HTMLSelectElement) ensureSelectOption(field, value);
        const proto = field instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : field instanceof HTMLSelectElement
                ? HTMLSelectElement.prototype
                : HTMLInputElement.prototype;
        const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
        if (descriptor?.set) descriptor.set.call(field, value);
        else field.value = value;
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    }

    function findGradioField(rootId) {
        const root = getRoot();
        const node = root.getElementById?.(rootId) || root.querySelector?.(`#${rootId}`) || document.getElementById(rootId);
        return node?.matches?.('input, textarea, select') ? node : node?.querySelector?.('textarea, input, select');
    }

    function setGradioValue(rootId, value) {
        return setNativeValue(findGradioField(rootId), value);
    }

    function setGradioValueIfDifferent(rootId, value) {
        const field = findGradioField(rootId);
        if (!field) return false;
        const nextValue = String(value ?? '');
        if (String(field.value ?? '') === nextValue) return true;
        return setNativeValue(field, nextValue);
    }

    function clickGradioButton(rootId) {
        const root = getRoot();
        const node = root.getElementById?.(rootId) || root.querySelector?.(`#${rootId}`) || document.getElementById(rootId);
        if (!node) return false;
        node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        return true;
    }

    function numericValue(value, fallback) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    function boundedModelsPanelNumericValue(field, fallback) {
        let value = numericValue(field?.value, fallback);
        const min = Number.parseFloat(field?.min ?? '');
        const max = Number.parseFloat(field?.max ?? '');
        if (Number.isFinite(min)) value = Math.max(min, value);
        if (Number.isFinite(max)) value = Math.min(max, value);
        return value;
    }

    function setModelsPanelRangeValue(range, value) {
        if (!range) return;
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return;
        const min = Number.parseFloat(range.min || '');
        const max = Number.parseFloat(range.max || '');
        let nextValue = parsed;
        if (Number.isFinite(min)) nextValue = Math.max(min, nextValue);
        if (Number.isFinite(max)) nextValue = Math.min(max, nextValue);
        range.value = String(nextValue);
    }

    function uniqueModelChoices(values, currentValue) {
        const seen = new Set();
        const result = [];
        const add = (value) => {
            const text = String(value ?? '').trim();
            if (!text || seen.has(text)) return;
            seen.add(text);
            result.push(text);
        };
        add(currentValue);
        (Array.isArray(values) ? values : []).forEach(add);
        return result;
    }

    const modelsPanelCatalogCache = new Map();
    const modelsPanelCatalogRequests = new Map();
    let modelsPanelCatalogForceNext = false;
    let modelsPanelCatalogGeneration = 0;

    function modelsPanelUseModelFilter() {
        const checkbox = document.querySelector('.use_model_filter_checkbox input[type="checkbox"]');
        if (checkbox) return !!checkbox.checked;
        const params = window.simpleaiTopbarSystemParams || {};
        if (Object.prototype.hasOwnProperty.call(params, 'use_model_filter_checkbox')) return !!params.use_model_filter_checkbox;
        if (Object.prototype.hasOwnProperty.call(params, 'use_model_filter')) return !!params.use_model_filter;
        return true;
    }

    function modelsPanelCatalogSignature() {
        const params = window.simpleaiTopbarSystemParams || {};
        const engine = String(params.__backend_engine || params.backend_engine || params.engine || params.task_class_name || 'Z-image').trim() || 'Z-image';
        const taskMethod = String(params.task_method || params.__scene_task_method || '').trim();
        const sceneFrontend = !!params.__is_scene_frontend;
        const useModelFilter = modelsPanelUseModelFilter();
        return {
            engine,
            taskMethod,
            sceneFrontend,
            useModelFilter,
            key: `${engine}::${taskMethod}::${sceneFrontend ? 'scene' : 'main'}::${useModelFilter ? 'filter' : 'all'}`
        };
    }

    function catalogMatchesModelsPanelSignature(catalog, signature = modelsPanelCatalogSignature()) {
        if (!catalog || typeof catalog !== 'object') return false;
        if (catalog.__simpai_signature_key === signature.key) return true;
        const catalogEngine = String(catalog.engine || catalog.backend_engine || catalog.__backend_engine || '').trim();
        if (!catalogEngine || catalogEngine !== signature.engine) return false;
        const catalogTask = String(catalog.task_method || catalog.__scene_task_method || '').trim();
        if (catalogTask !== signature.taskMethod) return false;
        if (Object.prototype.hasOwnProperty.call(catalog, 'use_model_filter') && !!catalog.use_model_filter !== signature.useModelFilter) return false;
        return true;
    }

    function currentModelsPanelCatalog() {
        const catalog = window.simpleaiTopbarSystemParams?.__canvas_model_catalog || null;
        return catalogMatchesModelsPanelSignature(catalog) ? catalog : null;
    }

    function modelsPanelCatalogPayload(signature = modelsPanelCatalogSignature(), forceRefresh = false) {
        return {
            use_model_filter: signature.useModelFilter,
            force_refresh: !!forceRefresh,
            preset_node: {
                runtime: {
                    backend_engine: signature.engine,
                    task_method: signature.taskMethod,
                    scene_frontend: signature.sceneFrontend
                },
                preset: {
                    backend_engine: signature.engine,
                    task_method: signature.taskMethod
                }
            }
        };
    }

    function invalidateModelsPanelCatalog(signature = modelsPanelCatalogSignature()) {
        try {
            modelsPanelCatalogGeneration += 1;
            modelsPanelCatalogCache.delete(signature.key);
            modelsPanelCatalogRequests.delete(signature.key);
            if (window.simpleaiTopbarSystemParams && typeof window.simpleaiTopbarSystemParams === 'object') {
                delete window.simpleaiTopbarSystemParams.__canvas_model_catalog;
            }
        } catch (e) {}
    }

    function storeModelsPanelCatalog(catalog, signature = modelsPanelCatalogSignature()) {
        if (!catalog || typeof catalog !== 'object') return null;
        catalog.__simpai_signature_key = signature.key;
        catalog.engine = catalog.engine || signature.engine;
        catalog.backend_engine = catalog.backend_engine || signature.engine;
        if (catalog.task_method && catalog.task_method !== signature.taskMethod) {
            catalog.catalog_task_method = catalog.task_method;
        }
        catalog.task_method = signature.taskMethod;
        catalog.use_model_filter = signature.useModelFilter;
        if (!window.simpleaiTopbarSystemParams || typeof window.simpleaiTopbarSystemParams !== 'object') {
            window.simpleaiTopbarSystemParams = {};
        }
        window.simpleaiTopbarSystemParams.__canvas_model_catalog = catalog;
        modelsPanelCatalogCache.set(signature.key, catalog);
        return catalog;
    }

    async function refreshModelsPanelCatalog(options = {}) {
        const signature = modelsPanelCatalogSignature();
        const forceRefresh = !!(options && options.force) || modelsPanelCatalogForceNext;
        if (forceRefresh) {
            modelsPanelCatalogForceNext = false;
            invalidateModelsPanelCatalog(signature);
        }
        const requestGeneration = modelsPanelCatalogGeneration;
        const existing = forceRefresh ? null : currentModelsPanelCatalog();
        if (existing) return existing;
        if (!forceRefresh && modelsPanelCatalogCache.has(signature.key)) {
            return storeModelsPanelCatalog(modelsPanelCatalogCache.get(signature.key), signature);
        }
        if (!forceRefresh && modelsPanelCatalogRequests.has(signature.key)) return modelsPanelCatalogRequests.get(signature.key);
        const request = fetch('/canvas-workbench/model-catalog', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(modelsPanelCatalogPayload(signature, forceRefresh))
        })
            .then((response) => response.ok ? response.json() : null)
            .then((data) => {
                const catalog = data && data.ok ? data.catalog : null;
                if (requestGeneration !== modelsPanelCatalogGeneration) return null;
                return storeModelsPanelCatalog(catalog, signature);
            })
            .catch(() => null)
            .finally(() => {
                modelsPanelCatalogRequests.delete(signature.key);
            });
        if (!forceRefresh) modelsPanelCatalogRequests.set(signature.key, request);
        return request;
    }

    function markModelsPanelCatalogDirty() {
        modelsPanelCatalogForceNext = true;
        invalidateModelsPanelCatalog();
        closeModelsSelectMenu();
        setTimeout(() => {
            if (!document.querySelector('[data-simpai-models-js-root]')) return;
            refreshModelsPanelCatalog({ force: true }).then((catalog) => {
                if (!catalog) return;
                updateModelsPanelSelectsFromCatalog();
            });
        }, 800);
    }

    function localCatalogChoices(type, currentValue) {
        const catalog = currentModelsPanelCatalog() || {};
        const modelChoices = Array.isArray(catalog.model_filenames) ? catalog.model_filenames : [];
        if (type === 'refiner') {
            return uniqueModelChoices(catalog.refiner_filenames || ['None', ...modelChoices], currentValue);
        }
        if (type === 'clip') return uniqueModelChoices(catalog.clip_filenames || [], currentValue);
        if (type === 'vae') return uniqueModelChoices(catalog.vae_filenames || [], currentValue);
        if (type === 'upscale') return uniqueModelChoices(catalog.upscale_model_filenames || [], currentValue);
        if (type === 'lora') return uniqueModelChoices(catalog.lora_filenames || ['None'], currentValue);
        return uniqueModelChoices(modelChoices, currentValue);
    }

    function populateLiteModelSelect(select) {
        if (!select) return;
        const currentValue = String(select.value || '').trim();
        const type = select.dataset.simpaiSelectType || select.dataset.simpaiBrowserTarget || 'base';
        const hasFreshCatalog = !!currentModelsPanelCatalog();
        const allChoices = localCatalogChoices(type, currentValue);
        const choices = modelsPanelUsesWindowedOptions()
            ? (currentValue ? [currentValue] : allChoices.slice(0, 1))
            : allChoices;
        const fragment = document.createDocumentFragment();
        choices.forEach((choice) => {
            const option = document.createElement('option');
            option.value = choice;
            option.textContent = choice;
            option.selected = choice === currentValue;
            fragment.appendChild(option);
        });
        select.replaceChildren(fragment);
        if (currentValue) select.value = currentValue;
        if (!hasFreshCatalog) {
            refreshModelsPanelCatalog().then((catalog) => {
                if (!catalog || !document.contains(select)) return;
                populateLiteModelSelect(select);
            });
        }
    }

    function trimLiteModelSelect(select) {
        if (!select) return;
        const value = String(select.value || '').trim();
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        option.selected = true;
        select.replaceChildren(option);
        select.value = value;
    }

    let activeModelsSelectMenu = null;
    let suppressNextModelsSelectDocumentClick = false;
    let modelsSelectPositionFrame = 0;

    function shouldAutoFocusModelsSelectSearch(event) {
        if (event?.type === 'keydown') return true;
        const coarsePointer = window.matchMedia?.('(pointer: coarse)')?.matches;
        if (coarsePointer) return false;
        const pointerType = String(event?.pointerType || '').toLowerCase();
        if (pointerType) return pointerType === 'mouse';
        return Number(navigator.maxTouchPoints || 0) === 0;
    }

    function clearModelsSelectOpeningGesture(menuState = activeModelsSelectMenu) {
        suppressNextModelsSelectDocumentClick = false;
        if (!menuState) return;
        menuState.openingPointerId = null;
        menuState.ignoreOpeningClick = false;
    }

    function shouldIgnoreModelsSelectOpeningActivation(select, event) {
        const menuState = activeModelsSelectMenu;
        if (!menuState || menuState.select !== select) return false;
        if (event.type === 'pointerup' && menuState.openingPointerId === event.pointerId) {
            return true;
        }
        if (event.type === 'click' && menuState.ignoreOpeningClick) {
            clearModelsSelectOpeningGesture(menuState);
            return true;
        }
        return false;
    }

    function readModelsPanelPxVar(element, name, fallback) {
        const raw = window.getComputedStyle?.(element)?.getPropertyValue(name) || '';
        const value = Number.parseFloat(raw);
        return Number.isFinite(value) ? value : fallback;
    }

    function closeModelsSelectMenu() {
        if (!activeModelsSelectMenu) return;
        activeModelsSelectMenu.menu.remove();
        activeModelsSelectMenu = null;
        suppressNextModelsSelectDocumentClick = false;
        document.dispatchEvent(new CustomEvent('simpai:models-select-menu-close'));
    }

    function positionModelsSelectMenu(select, menu) {
        const rect = select.getBoundingClientRect();
        const margin = 8;
        const panelRect = select.closest?.('.simpai-models-js-panel')?.getBoundingClientRect?.();
        const preferredWidth = readModelsPanelPxVar(select, '--models-select-menu-width', 440);
        const configuredMaxWidth = readModelsPanelPxVar(select, '--models-select-menu-max-width', 560);
        const visualViewport = window.visualViewport;
        const viewportWidth = Math.min(window.innerWidth, visualViewport?.width || window.innerWidth);
        const viewportHeight = Math.min(window.innerHeight, visualViewport?.height || window.innerHeight);
        const viewportLeft = margin;
        const viewportRight = viewportWidth - margin;
        const panelLeft = panelRect ? Math.max(viewportLeft, panelRect.left + margin) : viewportLeft;
        const panelRight = panelRect ? Math.min(viewportRight, panelRect.right - margin) : viewportRight;
        const leftLimit = Math.min(panelLeft, panelRight - Math.min(rect.width, configuredMaxWidth));
        const rightLimit = Math.max(panelRight, leftLimit + rect.width);
        const anchoredLeft = Math.min(Math.max(rect.left, leftLimit), Math.max(leftLimit, rightLimit - rect.width));
        const availableWidth = Math.max(rect.width, rightLimit - anchoredLeft);
        const width = Math.min(availableWidth, Math.max(rect.width, Math.min(preferredWidth, configuredMaxWidth)));
        const left = Math.min(rightLimit - width, Math.max(leftLimit, rect.left));
        const below = viewportHeight - rect.bottom - margin;
        const above = rect.top - margin;
        const maxHeight = Math.max(160, Math.min(360, Math.max(below, above)));
        const top = below >= 180 || below >= above
            ? Math.min(viewportHeight - margin - maxHeight, rect.bottom + 3)
            : Math.max(margin, rect.top - maxHeight - 3);
        menu.style.left = `${left}px`;
        menu.style.top = `${top}px`;
        menu.style.width = `${width}px`;
        menu.style.maxHeight = `${maxHeight}px`;
    }

    function scheduleActiveModelsSelectMenuPosition() {
        if (modelsSelectPositionFrame || !activeModelsSelectMenu) return;
        modelsSelectPositionFrame = window.requestAnimationFrame(() => {
            modelsSelectPositionFrame = 0;
            const menuState = activeModelsSelectMenu;
            if (!menuState?.select?.isConnected || !menuState.menu?.isConnected) return;
            positionModelsSelectMenu(menuState.select, menuState.menu);
        });
    }

    function dispatchModelsSelectOptionPreview(select, option, value) {
        document.dispatchEvent(new CustomEvent('simpai:models-select-option-hover', {
            detail: { select, option, value }
        }));
    }

    function filterModelsSelectChoices(choices, query) {
        const terms = String(query || '')
            .trim()
            .toLowerCase()
            .split(/\s+/)
            .filter(Boolean);
        if (!terms.length) return choices;
        return choices.filter((choice) => {
            const text = String(choice || '').toLowerCase();
            return terms.every((term) => text.includes(term));
        });
    }

    function getModelsSelectMenuParts(menu) {
        return {
            search: menu?.querySelector?.('[data-simpai-select-search]') || null,
            options: menu?.querySelector?.('[data-simpai-select-options]') || menu,
        };
    }

    function selectModelsSelectOption(select, choice) {
        if (select && !Array.from(select.options || []).some((option) => option.value === choice)) {
            const option = document.createElement('option');
            option.value = choice;
            option.textContent = choice;
            select.appendChild(option);
        }
        setNativeValue(select, choice);
        closeModelsSelectMenu();
        trimLiteModelSelect(select);
    }

    function renderModelsSelectMenuOptions(select, menu, options = {}) {
        const currentValue = String(select.value || '').trim();
        const type = select.dataset.simpaiSelectType || select.dataset.simpaiBrowserTarget || 'base';
        const choices = filterModelsSelectChoices(localCatalogChoices(type, currentValue), menu?.dataset?.simpaiSelectQuery || '');
        const fragment = document.createDocumentFragment();
        const parts = getModelsSelectMenuParts(menu);
        const windowed = modelsPanelUsesWindowedOptions() && choices.length > MOBILE_MODELS_SELECT_RENDER_LIMIT;
        if (options.resetScroll) parts.options.scrollTop = 0;
        let alignedScrollTop = null;
        if (windowed && options.alignSelected) {
            const selectedIndex = choices.indexOf(currentValue);
            if (selectedIndex > 0) {
                const visibleRows = Math.max(4, Math.floor((parts.options.clientHeight || 240) / MOBILE_MODELS_SELECT_ROW_HEIGHT));
                alignedScrollTop = Math.max(0, (selectedIndex - Math.floor(visibleRows / 2)) * MOBILE_MODELS_SELECT_ROW_HEIGHT);
            }
        }
        let startIndex = 0;
        let endIndex = choices.length;
        if (windowed) {
            const renderScrollTop = alignedScrollTop === null ? parts.options.scrollTop : alignedScrollTop;
            startIndex = Math.max(0, Math.floor(renderScrollTop / MOBILE_MODELS_SELECT_ROW_HEIGHT) - 8);
            endIndex = Math.min(choices.length, startIndex + MOBILE_MODELS_SELECT_RENDER_LIMIT);
            const before = document.createElement('div');
            before.className = 'simpai-models-js-select-spacer';
            before.style.height = `${startIndex * MOBILE_MODELS_SELECT_ROW_HEIGHT}px`;
            before.setAttribute('aria-hidden', 'true');
            fragment.appendChild(before);
        }
        if (!choices.length) {
            const empty = document.createElement('div');
            empty.className = 'simpai-models-js-select-option is-empty';
            empty.textContent = modelsPanelText('No matches', '没有匹配项');
            fragment.appendChild(empty);
        }
        choices.slice(startIndex, endIndex).forEach((choice, localIndex) => {
            const index = startIndex + localIndex;
            const option = document.createElement('div');
            option.className = 'simpai-models-js-select-option';
            option.dataset.simpaiSelectOptionValue = choice;
            option.role = 'option';
            option.tabIndex = -1;
            option.setAttribute('aria-posinset', String(index + 1));
            option.setAttribute('aria-setsize', String(choices.length));
            option.textContent = choice;
            option.title = choice;
            option.setAttribute('aria-selected', choice === currentValue ? 'true' : 'false');
            if (choice === currentValue) option.classList.add('is-selected');
            let optionCommitted = false;
            const commitOption = (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (shouldIgnoreModelsSelectOpeningActivation(select, event)) return;
                if (optionCommitted) return;
                optionCommitted = true;
                selectModelsSelectOption(select, choice);
            };
            if (!simpleaiDisableHoverPreviewsForInput()) {
                option.addEventListener('pointerover', () => dispatchModelsSelectOptionPreview(select, option, choice));
                option.addEventListener('mouseover', () => dispatchModelsSelectOptionPreview(select, option, choice));
            }
            option.addEventListener('pointerdown', (event) => {
                event.preventDefault();
                event.stopPropagation();
            });
            option.addEventListener('pointerup', commitOption);
            option.addEventListener('click', commitOption);
            if (index === 0) option.dataset.simpaiFirstMatch = '1';
            fragment.appendChild(option);
        });
        if (windowed) {
            const after = document.createElement('div');
            after.className = 'simpai-models-js-select-spacer';
            after.style.height = `${Math.max(0, choices.length - endIndex) * MOBILE_MODELS_SELECT_ROW_HEIGHT}px`;
            after.setAttribute('aria-hidden', 'true');
            fragment.appendChild(after);
        }
        menu.dataset.simpaiSelectWindowed = windowed ? '1' : '0';
        parts.options.replaceChildren(fragment);
        if (alignedScrollTop !== null) parts.options.scrollTop = alignedScrollTop;
        positionModelsSelectMenu(select, menu);
    }

    function openModelsSelectMenu(select) {
        if (!select || select.disabled) return;
        const openOptions = arguments[1] && typeof arguments[1] === 'object' ? arguments[1] : {};
        const focusSearch = openOptions.focusSearch ?? shouldAutoFocusModelsSelectSearch();
        if (activeModelsSelectMenu?.select === select) {
            positionModelsSelectMenu(select, activeModelsSelectMenu.menu);
            if (focusSearch) activeModelsSelectMenu.search?.focus({ preventScroll: true });
            return;
        }
        closeModelsSelectMenu();
        populateLiteModelSelect(select);
        const menu = document.createElement('div');
        menu.className = 'simpai-models-js-select-menu';
        menu.role = 'listbox';
        menu.dataset.simpaiSelectMenu = 'models-panel';
        const search = document.createElement('input');
        search.type = 'text';
        search.className = 'simpai-models-js-select-search';
        search.dataset.simpaiSelectSearch = '1';
        search.placeholder = modelsPanelText('Type to filter...', '输入文字筛选...');
        search.setAttribute('aria-label', modelsPanelText('Filter models', '筛选模型'));
        const options = document.createElement('div');
        options.className = 'simpai-models-js-select-options';
        options.dataset.simpaiSelectOptions = '1';
        menu.append(search, options);
        document.body.appendChild(menu);
        activeModelsSelectMenu = { select, menu, search, options };
        search.addEventListener('input', () => {
            menu.dataset.simpaiSelectQuery = search.value || '';
            renderModelsSelectMenuOptions(select, menu, { resetScroll: true });
        });
        options.addEventListener('scroll', () => {
            if (menu.dataset.simpaiSelectWindowed !== '1' || modelsSelectScrollFrame) return;
            modelsSelectScrollFrame = window.requestAnimationFrame(() => {
                modelsSelectScrollFrame = 0;
                if (activeModelsSelectMenu?.menu !== menu) return;
                renderModelsSelectMenuOptions(select, menu);
            });
        }, { passive: true });
        search.addEventListener('focus', scheduleActiveModelsSelectMenuPosition);
        search.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                closeModelsSelectMenu();
                select.focus({ preventScroll: true });
                return;
            }
            if (event.key === 'Enter') {
                const first = options.querySelector('[data-simpai-first-match="1"]');
                if (first) {
                    event.preventDefault();
                    selectModelsSelectOption(select, first.dataset.simpaiSelectOptionValue || '');
                }
            }
        });
        renderModelsSelectMenuOptions(select, menu, { alignSelected: true });
        const selected = options.querySelector('.is-selected');
        if (selected) selected.scrollIntoView({ block: 'nearest' });
        if (focusSearch) search.focus({ preventScroll: true });
        if (!currentModelsPanelCatalog()) {
            refreshModelsPanelCatalog().then((catalog) => {
                if (!catalog || activeModelsSelectMenu?.select !== select) return;
                populateLiteModelSelect(select);
                renderModelsSelectMenuOptions(select, menu, { alignSelected: true });
            });
        }
    }

    function updateModelsPanelSelectsFromCatalog() {
        document.querySelectorAll('.simpai-models-js-select').forEach((select) => {
            const shouldKeepExpanded = document.activeElement === select || select.matches?.(':hover') || select.options.length > 1;
            if (shouldKeepExpanded) populateLiteModelSelect(select);
        });
        if (activeModelsSelectMenu?.select && document.contains(activeModelsSelectMenu.select)) {
            renderModelsSelectMenuOptions(activeModelsSelectMenu.select, activeModelsSelectMenu.menu);
        }
    }

    function syncSliderPair(field) {
        if (!field) return;
        const panel = field.closest?.('[data-simpai-models-js-root]');
        if (!panel) return;
        const value = String(field.value ?? '');
        if (field.matches('[data-simpai-model-range]')) {
            const key = field.dataset.simpaiModelRange;
            const number = panel.querySelector(`[data-simpai-model-field="${key}"]`);
            if (number && number !== field && document.activeElement !== number) number.value = value;
            return;
        }
        if (field.matches('[data-simpai-model-field]')) {
            const key = field.dataset.simpaiModelField;
            const range = panel.querySelector(`[data-simpai-model-range="${key}"]`);
            setModelsPanelRangeValue(range, value);
            return;
        }
        if (field.matches('[data-simpai-lora-weight-range]')) {
            const index = field.dataset.simpaiLoraWeightRange;
            const number = panel.querySelector(`[data-simpai-lora-weight="${index}"]`);
            if (number && document.activeElement !== number) number.value = value;
            return;
        }
        if (field.matches('[data-simpai-lora-weight]')) {
            const index = field.dataset.simpaiLoraWeight;
            const range = panel.querySelector(`[data-simpai-lora-weight-range="${index}"]`);
            setModelsPanelRangeValue(range, value);
        }
    }

    function syncLoraRowInteractivity(checkbox) {
        if (!checkbox) return;
        const row = checkbox.closest?.('.simpai-models-js-lora-row');
        if (!row) return;
        const enabled = !!checkbox.checked;
        row.classList.toggle('is-disabled', !enabled);
        row.querySelectorAll('[data-simpai-lora-model], [data-simpai-lora-weight], [data-simpai-lora-weight-range]').forEach((field) => {
            field.disabled = !enabled;
        });
    }

    function setModelsPanelFieldDisabled(field, disabled) {
        if (!field) return;
        field.classList.toggle('is-disabled', !!disabled);
        field.querySelectorAll('select, input, button').forEach((node) => {
            node.disabled = !!disabled;
        });
    }

    function syncModelsPanelRefinerAvailability(panel) {
        if (!panel) return;
        const html = document.documentElement;
        const refinerDisabled = html.classList.contains('simpai-hide-refiner-model');
        const switchDisabled = refinerDisabled || html.classList.contains('simpai-hide-refiner-switch');
        setModelsPanelFieldDisabled(panel.querySelector('[data-simpai-model-card="refiner"]'), refinerDisabled);
        setModelsPanelFieldDisabled(panel.querySelector('[data-simpai-model-card="refiner_switch"]'), switchDisabled);
    }

    function syncModelsPanelControls(panel) {
        if (!panel) return;
        panel.querySelectorAll('[data-simpai-model-range], [data-simpai-model-field], [data-simpai-lora-weight]').forEach(syncSliderPair);
        panel.querySelectorAll('[data-simpai-lora-enabled]').forEach(syncLoraRowInteractivity);
        syncModelsPanelRefinerAvailability(panel);
    }

    function syncAllModelsPanelControls() {
        document.querySelectorAll('[data-simpai-models-js-root]').forEach(syncModelsPanelControls);
    }

    let latestPresetModelsPanelResetSeq = '';
    function applyPresetModelsPanelState(payload) {
        let data = payload;
        if (typeof data === 'string') {
            try {
                data = JSON.parse(data || '{}');
            } catch (_) {
                return false;
            }
        }
        if (!data || typeof data !== 'object') return false;
        const seq = String(data.seq || '');
        const modelState = data.model_state && typeof data.model_state === 'object'
            ? data.model_state
            : data;
        if (seq) latestPresetModelsPanelResetSeq = seq;

        const setSelectValue = (select, value) => {
            if (!select) return;
            const normalized = String(value ?? '');
            let option = Array.from(select.options || []).find((item) => item.value === normalized);
            if (!option) {
                option = document.createElement('option');
                option.value = normalized;
                option.textContent = normalized;
                select.replaceChildren(option);
            }
            select.value = normalized;
        };
        const apply = () => {
            if (seq && latestPresetModelsPanelResetSeq !== seq) return;
            document.querySelectorAll('[data-simpai-models-js-root]').forEach((panel) => {
                ['base_model', 'refiner_model', 'clip_model', 'vae_name', 'upscale_model'].forEach((key) => {
                    if (!Object.prototype.hasOwnProperty.call(modelState, key)) return;
                    setSelectValue(panel.querySelector(`[data-simpai-model-field="${key}"]`), modelState[key]);
                });
                if (Object.prototype.hasOwnProperty.call(modelState, 'refiner_switch')) {
                    const value = String(modelState.refiner_switch ?? 0.5);
                    const number = panel.querySelector('[data-simpai-model-field="refiner_switch"]');
                    if (number) number.value = value;
                    setModelsPanelRangeValue(panel.querySelector('[data-simpai-model-range="refiner_switch"]'), value);
                }
                if (Array.isArray(modelState.loras)) {
                    modelState.loras.forEach((item, index) => {
                        const normalized = Array.isArray(item)
                            ? { enabled: item[0], model: item[1], weight: item[2] }
                            : (item && typeof item === 'object' ? item : {});
                        const enabled = panel.querySelector(`[data-simpai-lora-enabled="${index}"]`);
                        const model = panel.querySelector(`[data-simpai-lora-model="${index}"]`);
                        const weight = panel.querySelector(`[data-simpai-lora-weight="${index}"]`);
                        if (enabled) enabled.checked = !!normalized.enabled;
                        setSelectValue(model, normalized.model ?? 'None');
                        if (weight) weight.value = String(normalized.weight ?? 1.0);
                        setModelsPanelRangeValue(
                            panel.querySelector(`[data-simpai-lora-weight-range="${index}"]`),
                            String(normalized.weight ?? 1.0),
                        );
                        syncLoraRowInteractivity(enabled);
                    });
                }
                syncModelsPanelControls(panel);
            });
        };
        window.requestAnimationFrame(apply);
        return true;
    }

    function isModelsPanelNumberField(field) {
        return field instanceof HTMLInputElement
            && field.type === 'number'
            && field.matches('[data-simpai-model-field], [data-simpai-lora-weight]');
    }

    function collectModelsPanelPayload(panel) {
        const payload = { loras: [] };
        panel.querySelectorAll('[data-simpai-model-field]').forEach((field) => {
            const key = field.dataset.simpaiModelField;
            payload[key] = key === 'refiner_switch' ? numericValue(field.value, 0.5) : String(field.value || '');
        });
        panel.querySelectorAll('[data-simpai-lora-model]').forEach((field) => {
            const index = Number(field.dataset.simpaiLoraModel);
            if (!Number.isInteger(index)) return;
            if (!payload.loras[index]) payload.loras[index] = {};
            payload.loras[index].model = String(field.value || 'None');
        });
        panel.querySelectorAll('[data-simpai-lora-enabled]').forEach((field) => {
            const index = Number(field.dataset.simpaiLoraEnabled);
            if (!Number.isInteger(index)) return;
            if (!payload.loras[index]) payload.loras[index] = {};
            payload.loras[index].enabled = !!field.checked;
        });
        panel.querySelectorAll('[data-simpai-lora-weight]').forEach((field) => {
            const index = Number(field.dataset.simpaiLoraWeight);
            if (!Number.isInteger(index)) return;
            if (!payload.loras[index]) payload.loras[index] = {};
            payload.loras[index].weight = boundedModelsPanelNumericValue(field, 1.0);
        });
        return payload;
    }

    const modelsPanelBridgeIds = {
        base_model: 'model_bridge_base',
        refiner_model: 'model_bridge_refiner',
        clip_model: 'model_bridge_clip',
        vae_name: 'model_bridge_vae',
        upscale_model: 'model_bridge_upscale',
        refiner_switch: 'refiner_switch'
    };

    function syncModelsPanelBridgeControls(panel, payload = null) {
        const data = payload || collectModelsPanelPayload(panel);
        if (!data || typeof data !== 'object') return;
        Object.entries(modelsPanelBridgeIds).forEach(([key, rootId]) => {
            if (!Object.prototype.hasOwnProperty.call(data, key)) return;
            setGradioValueIfDifferent(rootId, data[key]);
        });
        if (!Array.isArray(data.loras)) return;
        data.loras.forEach((item, index) => {
            if (!item || !Object.prototype.hasOwnProperty.call(item, 'model')) return;
            setGradioValueIfDifferent(`lora_bridge_${index}`, item.model || 'None');
        });
    }

    function syncActiveModelsPanelBridgeControls() {
        const panel = document.querySelector('[data-simpai-models-js-root]');
        if (!panel) return false;
        syncModelsPanelBridgeControls(panel);
        return true;
    }

    function syncModelsPanelBridgeField(field, panel) {
        if (!field || !panel) return;
        if (field.matches('[data-simpai-model-field], [data-simpai-model-range]')) {
            const key = field.dataset.simpaiModelField || field.dataset.simpaiModelRange;
            const rootId = modelsPanelBridgeIds[key];
            if (!rootId) return;
            const source = panel.querySelector(`[data-simpai-model-field="${key}"]`) || field;
            const value = key === 'refiner_switch' ? numericValue(source.value, 0.5) : String(source.value || '');
            setGradioValueIfDifferent(rootId, value);
            return;
        }
        if (field.matches('[data-simpai-lora-model]')) {
            const index = Number(field.dataset.simpaiLoraModel);
            if (!Number.isInteger(index)) return;
            setGradioValueIfDifferent(`lora_bridge_${index}`, String(field.value || 'None'));
        }
    }

    let applyTimer = null;
    function cancelModelsPanelApply() {
        if (!applyTimer) return;
        clearTimeout(applyTimer);
        applyTimer = null;
    }

    function applyModelsPanel(panel, delay = 0) {
        if (!panel) return;
        cancelModelsPanelApply();
        applyTimer = setTimeout(() => {
            applyTimer = null;
            const data = collectModelsPanelPayload(panel);
            syncModelsPanelBridgeControls(panel, data);
            const payload = JSON.stringify(data);
            if (!setGradioValue('models_js_payload', payload)) {
                console.warn('models_js_payload bridge not found');
                return;
            }
            if (!clickGradioButton('models_js_apply_trigger')) {
                console.warn('models_js_apply_trigger bridge not found');
            }
        }, delay);
    }

    function loraAutoSendEnabled() {
        const root = getRoot();
        const node = root.getElementById?.('lora_auto_send_trigger_words') || root.querySelector?.('#lora_auto_send_trigger_words');
        const field = node?.matches?.('input') ? node : node?.querySelector?.('input[type="checkbox"]');
        return !!field?.checked;
    }

    function openModelsPanelBrowser(panel, type, field, loraIndex) {
        const titleByType = {
            base: modelsPanelText('Browse Base Model', '浏览基础模型'),
            refiner: modelsPanelText('Browse Refiner Model', '浏览精修模型'),
            clip: modelsPanelText('Browse CLIP / Text Encoder', '浏览 CLIP / 文本编码器'),
            vae: modelsPanelText('Browse VAE', '浏览 VAE'),
            upscale: modelsPanelText('Browse Upscale Model', '浏览放大模型'),
            lora: `${modelsPanelText('Browse LoRA', '浏览 LoRA')}${Number.isInteger(loraIndex) ? ` ${loraIndex + 1}` : ''}`
        };
        const openSharedBrowser = () => {
            if (!window.SimpAIModelBrowser?.open) return false;
            window.SimpAIModelBrowser.open({
                type,
                title: titleByType[type] || modelsPanelText('Model Browser', '模型浏览器'),
                onSelect: (item) => {
                    const value = item?.name || item?.path || '';
                    setNativeValue(field, value);
                    applyModelsPanel(panel);
                    if (type === 'lora') {
                        window.simpleaiAutoSendLoraTriggerWords?.(value, loraAutoSendEnabled());
                    }
                }
            });
            return true;
        };
        if (openSharedBrowser()) {
            return;
        }
        if (window.loadSimpleAILazyAssetGroup) {
            window.loadSimpleAILazyAssetGroup('modelBrowser')
                .then((ok) => {
                    if (!ok) {
                        window.simpleaiShowLazyAssetLoadMessage?.('modelBrowser');
                        const fallbackTrigger = type === 'lora' && Number.isInteger(loraIndex)
                            ? `lora_preview_btn_${loraIndex}`
                            : `model_browser_trigger_${type}`;
                        clickGradioButton(fallbackTrigger);
                        return;
                    }
                    if (openSharedBrowser()) return;
                    const fallbackTrigger = type === 'lora' && Number.isInteger(loraIndex)
                        ? `lora_preview_btn_${loraIndex}`
                        : `model_browser_trigger_${type}`;
                    clickGradioButton(fallbackTrigger);
                })
                .catch((err) => {
                    console.warn('Shared model browser lazy load failed, falling back to Gradio browser.', err);
                    window.simpleaiShowLazyAssetLoadMessage?.('modelBrowser');
                    const fallbackTrigger = type === 'lora' && Number.isInteger(loraIndex)
                        ? `lora_preview_btn_${loraIndex}`
                        : `model_browser_trigger_${type}`;
                    clickGradioButton(fallbackTrigger);
                });
            return;
        }
        const fallbackTrigger = type === 'lora' && Number.isInteger(loraIndex)
            ? `lora_preview_btn_${loraIndex}`
            : `model_browser_trigger_${type}`;
        clickGradioButton(fallbackTrigger);
    }

    document.addEventListener('change', (event) => {
        const panel = event.target?.closest?.('[data-simpai-models-js-root]');
        if (!panel) return;
        if (event.target.matches('[data-simpai-model-field], [data-simpai-model-range], [data-simpai-lora-model], [data-simpai-lora-enabled], [data-simpai-lora-weight], [data-simpai-lora-weight-range]')) {
            syncSliderPair(event.target);
            if (event.target.matches('[data-simpai-lora-enabled]')) syncLoraRowInteractivity(event.target);
            syncModelsPanelBridgeField(event.target, panel);
            const applyDelay = isModelsPanelNumberField(event.target) ? 0 : 80;
            applyModelsPanel(panel, applyDelay);
            if (event.target.matches('[data-simpai-lora-model]')) {
                window.simpleaiAutoSendLoraTriggerWords?.(event.target.value, loraAutoSendEnabled());
            }
        }
    }, true);

    document.addEventListener('input', (event) => {
        const panel = event.target?.closest?.('[data-simpai-models-js-root]');
        if (!panel) return;
        if (!event.target.matches('[data-simpai-model-field], [data-simpai-model-range], [data-simpai-lora-weight], [data-simpai-lora-weight-range]')) return;
        syncSliderPair(event.target);
        syncModelsPanelBridgeField(event.target, panel);
        if (isModelsPanelNumberField(event.target)) {
            cancelModelsPanelApply();
            return;
        }
        applyModelsPanel(panel, 180);
    }, true);

    document.addEventListener('pointerdown', (event) => {
        const select = event.target?.closest?.('.simpai-models-js-select');
        if (!select) {
            if (!event.target?.closest?.('.simpai-models-js-select-menu')) closeModelsSelectMenu();
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        suppressNextModelsSelectDocumentClick = true;
        localizeModelsJsPanel(select.closest('[data-simpai-models-js-root]'));
        openModelsSelectMenu(select, {
            focusSearch: shouldAutoFocusModelsSelectSearch(event),
        });
        if (activeModelsSelectMenu?.select === select) {
            activeModelsSelectMenu.openingPointerId = event.pointerId;
            activeModelsSelectMenu.ignoreOpeningClick = true;
            const menuState = activeModelsSelectMenu;
            setTimeout(() => {
                if (activeModelsSelectMenu === menuState && menuState.ignoreOpeningClick) {
                    clearModelsSelectOpeningGesture(menuState);
                }
            }, 500);
        }
    }, true);

    document.addEventListener('focusin', (event) => {
        const select = event.target?.closest?.('.simpai-models-js-select');
        if (!select) return;
        localizeModelsJsPanel(select.closest('[data-simpai-models-js-root]'));
        populateLiteModelSelect(select);
    }, true);

    document.addEventListener('focusout', (event) => {
        const select = event.target?.closest?.('.simpai-models-js-select');
        if (!select) return;
        setTimeout(() => {
            if (activeModelsSelectMenu?.select !== select) trimLiteModelSelect(select);
        }, 120);
    }, true);

    document.addEventListener('keydown', (event) => {
        const select = event.target?.closest?.('.simpai-models-js-select');
        if (!select) return;
        if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
            event.preventDefault();
            openModelsSelectMenu(select, { focusSearch: true });
        } else if (event.key === 'Escape') {
            closeModelsSelectMenu();
        } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
            event.preventDefault();
            openModelsSelectMenu(select, { focusSearch: true });
            const search = activeModelsSelectMenu?.select === select ? activeModelsSelectMenu.search : null;
            if (search) {
                search.value = event.key;
                activeModelsSelectMenu.menu.dataset.simpaiSelectQuery = search.value;
                renderModelsSelectMenuOptions(select, activeModelsSelectMenu.menu);
                search.focus({ preventScroll: true });
            }
        }
    }, true);

    window.addEventListener('resize', scheduleActiveModelsSelectMenuPosition, { passive: true });
    window.visualViewport?.addEventListener('resize', scheduleActiveModelsSelectMenuPosition, { passive: true });
    window.visualViewport?.addEventListener('scroll', scheduleActiveModelsSelectMenuPosition, { passive: true });

    document.addEventListener('click', (event) => {
        if (suppressNextModelsSelectDocumentClick) {
            const menuState = activeModelsSelectMenu;
            clearModelsSelectOpeningGesture(menuState);
            if (menuState) {
                event.preventDefault();
                event.stopPropagation();
                return;
            }
        }
        if (!event.target?.closest?.('.simpai-models-js-select, .simpai-models-js-select-menu')) {
            closeModelsSelectMenu();
        }
        if (event.target?.closest?.('.models_refresh_button, button.models_refresh_button')) {
            markModelsPanelCatalogDirty();
        }
        const browserButton = event.target?.closest?.('[data-simpai-model-browser], [data-simpai-lora-browser]');
        if (!browserButton) return;
        const panel = browserButton.closest('[data-simpai-models-js-root]');
        if (!panel) return;
        event.preventDefault();
        event.stopPropagation();
        const loraIndex = browserButton.dataset.simpaiLoraBrowser !== undefined ? Number(browserButton.dataset.simpaiLoraBrowser) : null;
        const type = browserButton.dataset.simpaiModelBrowser || 'lora';
        const field = Number.isInteger(loraIndex)
            ? panel.querySelector(`[data-simpai-lora-model="${loraIndex}"]`)
            : panel.querySelector(`[data-simpai-model-field][data-simpai-browser-target="${type}"]`);
        if (!field) return;
        openModelsPanelBrowser(panel, type, field, loraIndex);
    }, true);

    document.addEventListener('contextmenu', (event) => {
        const loraField = event.target?.closest?.('[data-simpai-lora-model]');
        if (!loraField) return;
        const panel = loraField.closest('[data-simpai-models-js-root]');
        const index = Number(loraField.dataset.simpaiLoraModel);
        if (!panel || !Number.isInteger(index)) return;
        event.preventDefault();
        event.stopPropagation();
        openModelsPanelBrowser(panel, 'lora', loraField, index);
    }, true);

    let localizationTimer = null;
    let lastLanguageKey = null;
    function scheduleModelsJsPanelLocalization() {
        if (localizationTimer) return;
        localizationTimer = setTimeout(() => {
            localizationTimer = null;
            lastLanguageKey = modelsPanelLanguageKey();
            syncModelsJsPanelLocalization();
            syncAllModelsPanelControls();
        }, 0);
    }

    function syncModelsJsPanelLocalizationIfLanguageChanged() {
        if (!document.querySelector('[data-simpai-models-js-root]')) return;
        syncAllModelsPanelControls();
        const nextLanguageKey = modelsPanelLanguageKey();
        if (nextLanguageKey === lastLanguageKey && !modelsPanelNeedsLocalization()) return;
        lastLanguageKey = nextLanguageKey;
        syncModelsJsPanelLocalization();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', scheduleModelsJsPanelLocalization, { once: true });
    } else {
        scheduleModelsJsPanelLocalization();
    }
    window.addEventListener('simpai:system-params-updated', () => {
        if (!document.querySelector('[data-simpai-models-js-root]')) return;
        syncModelsJsPanelLocalization();
        lastLanguageKey = modelsPanelLanguageKey();
        syncAllModelsPanelControls();
    });
    if (window.MutationObserver) {
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes || []) {
                    if (node.nodeType !== 1) continue;
                    if (node.matches?.('[data-simpai-models-js-root]') || node.querySelector?.('[data-simpai-models-js-root]')) {
                        scheduleModelsJsPanelLocalization();
                        setTimeout(syncAllModelsPanelControls, 0);
                        return;
                    }
                }
            }
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
        const classObserver = new MutationObserver(syncAllModelsPanelControls);
        classObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    }
    window.addEventListener('scroll', (event) => {
        if (event.target?.closest?.('.simpai-models-js-select-menu')) return;
        const activeSearch = activeModelsSelectMenu?.search;
        if (activeSearch && document.activeElement === activeSearch) {
            scheduleActiveModelsSelectMenuPosition();
            return;
        }
        closeModelsSelectMenu();
    }, true);
    setInterval(syncModelsJsPanelLocalizationIfLanguageChanged, 800);

    window.simpleaiApplyModelsJsPanel = applyModelsPanel;
    window.simpleaiApplyPresetModelsPanelState = applyPresetModelsPanelState;
    window.simpleaiSyncModelsJsPanelBridge = syncActiveModelsPanelBridgeControls;
    window.simpleaiRefreshModelsJsPanelCatalog = refreshModelsPanelCatalog;
    window.simpleaiInvalidateModelsPanelCatalog = markModelsPanelCatalogDirty;
    window.simpleaiPopulateModelsJsSelect = populateLiteModelSelect;
    window.simpleaiOpenModelsJsSelectMenu = openModelsSelectMenu;
})();

/**
 * Get the currently selected top-level UI tab button (e.g. the button that says "Extras").
 */
function get_uiCurrentTab() {
    return gradioApp().querySelector('#tabs > .tab-nav > button.selected');
}

/**
 * Get the first currently visible top-level UI tab content (e.g. the div hosting the "txt2img" UI).
 */
function get_uiCurrentTabContent() {
    return gradioApp().querySelector('#tabs > .tabitem[id^=tab_]:not([style*="display: none"])');
}

var uiUpdateCallbacks = [];
var uiAfterUpdateCallbacks = [];
var uiLoadedCallbacks = [];
var uiTabChangeCallbacks = [];
var optionsChangedCallbacks = [];
var uiAfterUpdateTimeout = null;
var uiCurrentTab = null;

/**
 * Register callback to be called at each UI update.
 * The callback receives an array of MutationRecords as an argument.
 */
function onUiUpdate(callback) {
    uiUpdateCallbacks.push(callback);
}

/**
 * Register callback to be called soon after UI updates.
 * The callback receives no arguments.
 *
 * This is preferred over `onUiUpdate` if you don't need
 * access to the MutationRecords, as your function will
 * not be called quite as often.
 */
function onAfterUiUpdate(callback) {
    uiAfterUpdateCallbacks.push(callback);
}

/**
 * Register callback to be called when the UI is loaded.
 * The callback receives no arguments.
 */
function onUiLoaded(callback) {
    uiLoadedCallbacks.push(callback);
}

/**
 * Register callback to be called when the UI tab is changed.
 * The callback receives no arguments.
 */
function onUiTabChange(callback) {
    uiTabChangeCallbacks.push(callback);
}

/**
 * Register callback to be called when the options are changed.
 * The callback receives no arguments.
 * @param callback
 */
function onOptionsChanged(callback) {
    optionsChangedCallbacks.push(callback);
}

function executeCallbacks(queue, arg) {
    for (const callback of queue) {
        try {
            callback(arg);
        } catch (e) {
            console.error("error running callback", callback, ":", e);
        }
    }
}

/**
 * Schedule the execution of the callbacks registered with onAfterUiUpdate.
 * The callbacks are executed after a short while, unless another call to this function
 * is made before that time. IOW, the callbacks are executed only once, even
 * when there are multiple mutations observed.
 */
function scheduleAfterUiUpdateCallbacks() {
    clearTimeout(uiAfterUpdateTimeout);
    uiAfterUpdateTimeout = setTimeout(function() {
        executeCallbacks(uiAfterUpdateCallbacks);
    }, 200);
}

var executedOnLoaded = false;

function mutationNeedsUiUpdateCallbacks(mutation) {
    const target = mutation?.target?.nodeType === Node.ELEMENT_NODE
        ? mutation.target
        : mutation?.target?.parentElement;
    if (!target?.closest) return true;
    return !target.closest('.status-monitor-tile, .vram-usage, .ram-usage, .online-users-badge, .admin-access-pending-badge');
}

document.addEventListener("DOMContentLoaded", function() {
    var mutationObserver = new MutationObserver(function(m) {
        if (!executedOnLoaded && gradioApp().querySelector('#generate_button')) {
            executedOnLoaded = true;
            executeCallbacks(uiLoadedCallbacks);
        }

        if (!m.some(mutationNeedsUiUpdateCallbacks)) return;

        executeCallbacks(uiUpdateCallbacks, m);
        scheduleAfterUiUpdateCallbacks();
        const newTab = get_uiCurrentTab();
        if (newTab && (newTab !== uiCurrentTab)) {
            uiCurrentTab = newTab;
            executeCallbacks(uiTabChangeCallbacks);
        }
        initSelectedStylesPreviewLayout();
    });
    mutationObserver.observe(gradioApp(), {childList: true, subtree: true});
    initGeneratingStateRecovery();
    initSelectedStylesPreviewLayout();
    initStylePreviewOverlay();
    initBatchPreviewGeneratingOverlay();
});

(function initInteractionWaitFeedback() {
    if (window.__simpleaiInteractionWaitFeedbackStarted) return;
    window.__simpleaiInteractionWaitFeedbackStarted = true;

    const STORE_KIND = 'preset-store';
    const MODELS_KIND = 'models';
    const state = {
        element: null,
        text: null,
        activeKind: '',
        token: 0,
        committed: false,
        pendingTimer: 0,
        pollTimer: 0,
        longWaitTimer: 0,
        maxWaitTimer: 0,
        hideFrameOne: 0,
        hideFrameTwo: 0,
    };

    function queryInteractionNode(selector) {
        const direct = document.querySelector(selector);
        if (direct) return direct;
        try {
            const app = gradioApp();
            return app?.querySelector?.(selector) || null;
        } catch (e) {
            return null;
        }
    }

    function currentInteractionLanguage() {
        let lang = String(window.simpleaiTopbarSystemParams?.__lang || '').trim().toLowerCase();
        if (!lang) {
            try { lang = String(new URLSearchParams(window.location.search).get('__lang') || '').trim().toLowerCase(); } catch (e) {}
        }
        if (!lang) {
            try { lang = String(window.localStorage.getItem('ailang') || '').trim().toLowerCase(); } catch (e) {}
        }
        if (!lang) lang = String(document.documentElement.lang || navigator.language || '').trim().toLowerCase();
        return lang.startsWith('en') ? 'en' : 'cn';
    }

    function interactionWaitText(kind, longWait = false) {
        const english = currentInteractionLanguage() === 'en';
        if (kind === MODELS_KIND) {
            if (longWait) return english ? 'Models is still opening. Please wait...' : 'Models 打开时间较长，请稍候...';
            return english ? 'Opening Models...' : '正在打开 Models...';
        }
        if (longWait) return english ? 'Preset Store is still opening. Please wait...' : 'Preset Store 打开时间较长，请稍候...';
        return english ? 'Opening Preset Store...' : '正在打开 Preset Store...';
    }

    function ensureInteractionWaitFeedback() {
        if (state.element?.isConnected) return state.element;
        const feedback = document.createElement('div');
        feedback.id = 'simpleai_interaction_wait_feedback';
        feedback.className = 'simpleai-interaction-wait-feedback';
        feedback.setAttribute('role', 'status');
        feedback.setAttribute('aria-live', 'polite');
        feedback.setAttribute('aria-hidden', 'true');

        const spinner = document.createElement('span');
        spinner.className = 'simpleai-interaction-wait-spinner';
        spinner.setAttribute('aria-hidden', 'true');
        const text = document.createElement('span');
        text.className = 'simpleai-interaction-wait-text';
        feedback.append(spinner, text);
        document.body.appendChild(feedback);
        state.element = feedback;
        state.text = text;
        return feedback;
    }

    function clearInteractionWaitTimers() {
        window.clearTimeout(state.pendingTimer);
        window.clearTimeout(state.pollTimer);
        window.clearTimeout(state.longWaitTimer);
        window.clearTimeout(state.maxWaitTimer);
        state.pendingTimer = 0;
        state.pollTimer = 0;
        state.longWaitTimer = 0;
        state.maxWaitTimer = 0;
        if (state.hideFrameOne) window.cancelAnimationFrame(state.hideFrameOne);
        if (state.hideFrameTwo) window.cancelAnimationFrame(state.hideFrameTwo);
        state.hideFrameOne = 0;
        state.hideFrameTwo = 0;
    }

    function hideInteractionWaitFeedback(kind, token = state.token) {
        if (!state.activeKind || token !== state.token) return;
        if (kind && state.activeKind !== kind) return;
        clearInteractionWaitTimers();
        state.element?.classList.remove('is-visible');
        state.element?.setAttribute('aria-hidden', 'true');
        if (state.element?.dataset) delete state.element.dataset.kind;
        state.activeKind = '';
        state.committed = false;
    }

    function showInteractionWaitFeedback(kind) {
        const feedback = ensureInteractionWaitFeedback();
        if (state.activeKind === kind && feedback.classList.contains('is-visible')) return state.token;
        clearInteractionWaitTimers();
        state.token += 1;
        state.activeKind = kind;
        state.committed = false;
        feedback.dataset.kind = kind;
        state.text.textContent = interactionWaitText(kind, false);
        feedback.setAttribute('aria-hidden', 'false');
        feedback.classList.add('is-visible');
        const token = state.token;
        state.longWaitTimer = window.setTimeout(() => {
            if (state.activeKind === kind && state.token === token) {
                state.text.textContent = interactionWaitText(kind, true);
            }
        }, 8000);
        state.maxWaitTimer = window.setTimeout(() => hideInteractionWaitFeedback(kind, token), 30000);
        return token;
    }

    function hideInteractionWaitFeedbackAfterPaint(kind) {
        if (state.activeKind !== kind || state.hideFrameOne || state.hideFrameTwo) return;
        const token = state.token;
        window.clearTimeout(state.pollTimer);
        state.pollTimer = 0;
        state.hideFrameOne = window.requestAnimationFrame(() => {
            state.hideFrameOne = 0;
            if (state.activeKind !== kind || state.token !== token) return;
            state.hideFrameTwo = window.requestAnimationFrame(() => {
                state.hideFrameTwo = 0;
                hideInteractionWaitFeedback(kind, token);
            });
        });
    }

    function interactionNodeVisible(node) {
        if (!node || !node.isConnected || node.hidden) return false;
        if (node.classList?.contains('hidden') || node.classList?.contains('hide')) return false;
        try {
            return node.getClientRects().length > 0;
        } catch (e) {
            return false;
        }
    }

    function presetStoreIsOpen() {
        if (document.documentElement.classList.contains('preset-store-open')) return true;
        const store = queryInteractionNode('.preset_store');
        return interactionNodeVisible(store);
    }

    function identityDialogIsOpen() {
        return interactionNodeVisible(queryInteractionNode('#identity_dialog_content'));
    }

    function modelsTabButton() {
        const tabs = queryInteractionNode('#advanced_tabs');
        if (!tabs) return null;
        return Array.from(tabs.querySelectorAll('[role="tab"]')).find((button) => {
            const label = [
                button.getAttribute?.('data-original-text'),
                button.getAttribute?.('aria-label'),
                button.textContent,
            ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().toLowerCase();
            return label === 'models' || label === '模型' || /(^|\s)models?(\s|$)/.test(label);
        }) || null;
    }

    function tabButtonSelected(button) {
        return !!button && (
            button.getAttribute?.('aria-selected') === 'true'
            || button.dataset?.selected === 'true'
            || button.classList?.contains('selected')
        );
    }

    function modelsPanelIsOpen() {
        const selector = '#models_js_panel [data-simpai-models-js-root], #models_js_panel .simpai-models-js-panel';
        const panels = Array.from(document.querySelectorAll(selector));
        try {
            const app = gradioApp();
            if (app && app !== document && app.querySelectorAll) {
                app.querySelectorAll(selector).forEach((panel) => {
                    if (!panels.includes(panel)) panels.push(panel);
                });
            }
        } catch (e) {}
        return panels.some(interactionNodeVisible);
    }

    function interactionReady(kind) {
        if (kind === STORE_KIND) return presetStoreIsOpen() || identityDialogIsOpen();
        if (kind === MODELS_KIND) return modelsPanelIsOpen();
        return true;
    }

    function scheduleInteractionReadyCheck(kind, token) {
        if (state.pollTimer || state.activeKind !== kind || state.token !== token) return;
        const check = () => {
            state.pollTimer = 0;
            if (state.activeKind !== kind || state.token !== token) return;
            if (interactionReady(kind)) {
                hideInteractionWaitFeedbackAfterPaint(kind);
                return;
            }
            state.pollTimer = window.setTimeout(check, 180);
        };
        state.pollTimer = window.setTimeout(check, 100);
    }

    function interactionKindFromTarget(target) {
        if (!target?.closest) return '';
        if (target.closest('#bar_store')) return STORE_KIND;
        if (target.closest('.sai-gradio-hidden-bridge')) return '';
        const tabs = queryInteractionNode('#advanced_tabs');
        const button = target.closest('[role="tab"]');
        if (!tabs || !button || !tabs.contains(button)) return '';
        const label = [
            button.getAttribute?.('data-original-text'),
            button.getAttribute?.('aria-label'),
            button.textContent,
        ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().toLowerCase();
        return label === 'models' || label === '模型' || /(^|\s)models?(\s|$)/.test(label)
            ? MODELS_KIND
            : '';
    }

    function interactionShouldWait(kind) {
        if (kind === STORE_KIND) {
            const storeIntent = window.__simpleaiPresetStoreOptimisticIntent;
            if (
                storeIntent
                && storeIntent.isOpen === false
                && (Date.now() - Number(storeIntent.startedAt || 0)) < 15000
            ) {
                return false;
            }
            return !presetStoreIsOpen();
        }
        if (kind === MODELS_KIND) return !tabButtonSelected(modelsTabButton());
        return false;
    }

    function primeInteractionWait(kind) {
        if (!kind || !interactionShouldWait(kind)) return;
        if (state.activeKind && state.committed) return;
        const token = showInteractionWaitFeedback(kind);
        window.clearTimeout(state.pendingTimer);
        state.pendingTimer = window.setTimeout(() => {
            if (state.activeKind === kind && state.token === token && !state.committed) {
                hideInteractionWaitFeedback(kind, token);
            }
        }, 1200);
    }

    function commitInteractionWait(kind) {
        if (!kind || !interactionShouldWait(kind)) {
            if (state.activeKind === kind) hideInteractionWaitFeedback(kind);
            return;
        }
        const token = showInteractionWaitFeedback(kind);
        state.committed = true;
        window.clearTimeout(state.pendingTimer);
        state.pendingTimer = 0;
        scheduleInteractionReadyCheck(kind, token);
    }

    function bindInteractionWaitFeedback() {
        ensureInteractionWaitFeedback();
        let eventRoot = document;
        try { eventRoot = gradioApp() || document; } catch (e) {}
        eventRoot.addEventListener('pointerdown', (event) => {
            if (event.button !== undefined && event.button !== 0) return;
            primeInteractionWait(interactionKindFromTarget(event.target));
        }, true);
        eventRoot.addEventListener('keydown', (event) => {
            if (event.repeat || (event.key !== 'Enter' && event.key !== ' ')) return;
            primeInteractionWait(interactionKindFromTarget(event.target));
        }, true);
        eventRoot.addEventListener('click', (event) => {
            commitInteractionWait(interactionKindFromTarget(event.target));
        }, true);
    }

    window.addEventListener('simpai:preset-store-opened', () => {
        hideInteractionWaitFeedbackAfterPaint(STORE_KIND);
    });
    window.addEventListener('simpai:preset-store-closed', () => {
        hideInteractionWaitFeedback(STORE_KIND);
    });
    window.addEventListener('simpai:system-params-updated', () => {
        if (state.activeKind && interactionReady(state.activeKind)) {
            hideInteractionWaitFeedbackAfterPaint(state.activeKind);
        }
    });
    onAfterUiUpdate(() => {
        if (state.activeKind && interactionReady(state.activeKind)) {
            hideInteractionWaitFeedbackAfterPaint(state.activeKind);
        }
    });

    window.simpleaiShowInteractionWaitFeedback = showInteractionWaitFeedback;
    window.simpleaiHideInteractionWaitFeedback = hideInteractionWaitFeedback;
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindInteractionWaitFeedback, { once: true });
    } else {
        bindInteractionWaitFeedback();
    }
})();

(function initGradioFullscreenButtonDomBridge() {
    if (window.__simpaiGradioFullscreenButtonDomBridgeStarted) return;
    window.__simpaiGradioFullscreenButtonDomBridgeStarted = true;

    const fullscreenLabels = new Set(['fullscreen', '全屏']);
    const exitLabels = new Set(['exit fullscreen mode', '退出全屏']);
    const skipRootsSelector = [
        '#finished_gallery',
        '#final_gallery',
        '#lightboxModal',
        '#simpai-infinite-canvas-workbench',
        '.sai-canvas-workbench',
    ].join(', ');

    function buttonLabels(button) {
        return [
            button?.getAttribute?.('aria-label') || '',
            button?.getAttribute?.('title') || '',
            button?.textContent || '',
        ].map((label) => label.trim().toLowerCase()).filter(Boolean);
    }

    function isGradioFullscreenButton(button) {
        if (!button || button.tagName !== 'BUTTON' || button.closest?.(skipRootsSelector)) return false;
        return buttonLabels(button).some((label) => fullscreenLabels.has(label) || exitLabels.has(label))
            || button.dataset.simpleaiGradioFullscreenButton === '1';
    }

    function findGradioFullscreenBlock(button) {
        let node = button;
        for (let i = 0; node && i < 12; i += 1, node = node.parentElement) {
            if (
                node.classList?.contains('block')
                && node.querySelector?.('[data-testid="image"].image-container, .image-container')
            ) {
                return node;
            }
        }
        return button.closest?.('.block') || null;
    }

    function setButtonFullscreenLabel(button, fullscreen) {
        if (!button) return;
        button.dataset.simpleaiGradioFullscreenButton = '1';
        const label = fullscreen ? 'Exit fullscreen mode' : 'Fullscreen';
        button.setAttribute('aria-label', label);
        button.setAttribute('title', label);
        button.setAttribute('aria-pressed', fullscreen ? 'true' : 'false');
    }

    function syncFullscreenButtons(block, fullscreen) {
        if (!block?.querySelectorAll) return;
        block.querySelectorAll('button').forEach((button) => {
            if (isGradioFullscreenButton(button)) setButtonFullscreenLabel(button, fullscreen);
        });
    }

    function syncFullscreenPortal(block) {
        requestAnimationFrame(() => {
            try {
                if (typeof window.syncGradioFullscreenPortal === 'function') {
                    window.syncGradioFullscreenPortal(block || document);
                }
            } catch (e) {}
        });
    }

    function setGradioBlockFullscreen(block, fullscreen) {
        if (!block) return false;
        if (fullscreen) {
            document.querySelectorAll('.block.fullscreen').forEach((other) => {
                if (other !== block) setGradioBlockFullscreen(other, false);
            });
        }
        block.classList.toggle('fullscreen', !!fullscreen);
        syncFullscreenButtons(block, !!fullscreen);
        syncFullscreenPortal(block);
        return true;
    }

    document.addEventListener('click', (event) => {
        const button = event.target?.closest?.('button');
        if (!isGradioFullscreenButton(button)) return;
        const block = findGradioFullscreenBlock(button);
        if (!block) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        setGradioBlockFullscreen(block, !block.classList.contains('fullscreen'));
    }, true);

    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        const fullscreenBlock = document.querySelector('.block.fullscreen');
        if (!fullscreenBlock) return;
        setGradioBlockFullscreen(fullscreenBlock, false);
    }, true);
})();

(function initGradioRangeFillSync() {
    if (window.__simpaiGradioRangeFillSyncStarted) return;
    window.__simpaiGradioRangeFillSyncStarted = true;

    const rangeSelector = '.block input[type="range"]';
    let syncQueued = false;

    function shouldSkipRange(input) {
        const block = input?.closest?.('.block');
        return !input
            || !block
            || input.closest?.('#simpai-infinite-canvas-workbench, .sai-canvas-workbench');
    }

    function syncRangeFill(input) {
        if (shouldSkipRange(input)) return;
        const min = Number.parseFloat(input.min || '0');
        const max = Number.parseFloat(input.max || '100');
        const value = Number.parseFloat(input.value || '0');
        const span = max - min;
        const ratio = Number.isFinite(span) && span > 0 && Number.isFinite(value)
            ? (value - min) / span
            : 0;
        const progress = Math.max(0, Math.min(100, ratio * 100));
        if (!input.classList.contains('simpai-gradio-range-fill')) {
            input.classList.add('simpai-gradio-range-fill');
        }
        const progressValue = `${progress}%`;
        if (input.style.getPropertyValue('--simpai-gradio-range-progress') !== progressValue) {
            input.style.setProperty('--simpai-gradio-range-progress', progressValue);
        }
    }

    function syncAllRangeFills() {
        const roots = [gradioApp(), document];
        const seen = new Set();
        for (const root of roots) {
            if (!root?.querySelectorAll) continue;
            root.querySelectorAll(rangeSelector).forEach((input) => {
                if (seen.has(input)) return;
                seen.add(input);
                syncRangeFill(input);
            });
        }
    }

    function scheduleRangeFillSync() {
        if (syncQueued) return;
        syncQueued = true;
        requestAnimationFrame(() => {
            syncQueued = false;
            syncAllRangeFills();
        });
    }

    function handleRangeRelatedInput(event) {
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) return;
        if (target.type === 'range') {
            syncRangeFill(target);
            return;
        }
        if (target.type === 'number') {
            scheduleRangeFillSync();
        }
    }

    document.addEventListener('input', handleRangeRelatedInput, true);
    document.addEventListener('change', handleRangeRelatedInput, true);
    onUiLoaded(scheduleRangeFillSync);
    onAfterUiUpdate(scheduleRangeFillSync);
    onUiTabChange(scheduleRangeFillSync);
    scheduleRangeFillSync();
})();

(function initGradioVideoTimelineActiveScope() {
    if (window.__simpaiGradioVideoTimelineActiveScopeStarted) return;
    window.__simpaiGradioVideoTimelineActiveScopeStarted = true;

    const originalGetElementById = Document.prototype.getElementById;
    if (typeof originalGetElementById !== 'function') return;

    const trimHandleSelector = [
        'button[aria-label="start drag handle for trimming video"]',
        'button[aria-label="end drag handle for trimming video"]',
    ].join(', ');

    let activeTimeline = null;
    let activeMouseDrag = false;

    function timelineFromHandle(handle) {
        if (!handle?.closest) return null;
        return handle.closest('[id="timeline"].thumbnail-wrapper, [id="timeline"]');
    }

    function markActiveTimeline(target) {
        const handle = target?.closest ? target.closest(trimHandleSelector) : null;
        const timeline = timelineFromHandle(handle);
        if (!timeline) return false;
        activeTimeline = timeline;
        return true;
    }

    function clearActiveTimeline() {
        if (activeMouseDrag) return;
        window.setTimeout(() => {
            if (!activeMouseDrag) activeTimeline = null;
        }, 0);
    }

    Document.prototype.getElementById = function(id) {
        if (id === 'timeline' && activeTimeline?.isConnected) {
            return activeTimeline;
        }
        return originalGetElementById.call(this, id);
    };

    document.addEventListener('mousedown', (event) => {
        activeMouseDrag = markActiveTimeline(event.target);
    }, true);

    window.addEventListener('mouseup', () => {
        activeMouseDrag = false;
        clearActiveTimeline();
    }, true);

    document.addEventListener('focusin', (event) => {
        markActiveTimeline(event.target);
    }, true);

    document.addEventListener('focusout', (event) => {
        if (!activeTimeline) return;
        const handle = event.target?.closest ? event.target.closest(trimHandleSelector) : null;
        if (handle && timelineFromHandle(handle) === activeTimeline) clearActiveTimeline();
    }, true);

    document.addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        markActiveTimeline(event.target);
    }, true);
})();

(function initSceneVideoTrimPayloadBridge() {
    if (window.__simpaiSceneVideoTrimPayloadBridgeStarted) return;
    window.__simpaiSceneVideoTrimPayloadBridgeStarted = true;

    const bindings = [
        { componentId: 'scene_video', payloadId: 'scene_video_trim_payload' },
        { componentId: 'scene_reference_video', payloadId: 'scene_reference_video_trim_payload' },
    ];
    const trimHandleSelector = [
        'button[aria-label="start drag handle for trimming video"]',
        'button[aria-label="end drag handle for trimming video"]',
    ].join(', ');

    function payloadField(payloadId) {
        const root = document.getElementById(payloadId);
        return root?.querySelector ? root.querySelector('textarea, input') : null;
    }

    function readPayload(payloadId) {
        const field = payloadField(payloadId);
        const text = field ? String(field.value || '').trim() : '';
        if (!text) return null;
        try {
            const payload = JSON.parse(text);
            return payload && typeof payload === 'object' ? payload : null;
        } catch (e) {
            return null;
        }
    }

    function writePayload(payloadId, payload) {
        const field = payloadField(payloadId);
        if (!field) return false;
        const text = payload ? JSON.stringify(payload) : '';
        const proto = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (setter) setter.call(field, text);
        else field.value = text;
        try {
            field.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: text }));
        } catch (e) {
            field.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        }
        field.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        return true;
    }

    function buttonLabel(button) {
        if (!button) return '';
        return [
            button.textContent || '',
            button.getAttribute('aria-label') || '',
            button.getAttribute('title') || '',
        ].join(' ').trim().toLowerCase();
    }

    function isTrimSubmitButton(button) {
        const label = buttonLabel(button);
        return label === 'trim' || label.includes('trim video') || label.includes('裁剪');
    }

    function isResetButton(button) {
        const label = buttonLabel(button);
        return label.includes('reset video to initial value') || label.includes('reset video');
    }

    function trimPct(handle, fallback) {
        const raw = handle?.style ? String(handle.style.left || '') : '';
        const value = Number.parseFloat(raw);
        return Number.isFinite(value) ? value : fallback;
    }

    function buildTrimPayload(binding, root) {
        const video = root?.querySelector ? root.querySelector('video') : null;
        const duration = Number(video?.duration || 0);
        if (!Number.isFinite(duration) || duration <= 0) return null;

        const handles = root.querySelectorAll(trimHandleSelector);
        const leftHandle = Array.from(handles).find((handle) => String(handle.getAttribute('aria-label') || '').startsWith('start '));
        const rightHandle = Array.from(handles).find((handle) => String(handle.getAttribute('aria-label') || '').startsWith('end '));
        if (!leftHandle || !rightHandle) return null;

        const leftPct = Math.max(0, Math.min(100, trimPct(leftHandle, 0)));
        const rightPct = Math.max(0, Math.min(100, trimPct(rightHandle, 100)));
        const relStart = Math.max(0, Math.min(duration, duration * Math.min(leftPct, rightPct) / 100));
        const relEnd = Math.max(0, Math.min(duration, duration * Math.max(leftPct, rightPct) / 100));
        if (relEnd <= relStart + 0.001) return null;

        const previous = readPayload(binding.payloadId);
        const previousStart = Number(previous?.trim_start);
        const previousDuration = Number(previous?.duration);
        const previousSourceDuration = Number(previous?.video_duration);
        const chainsPreviousTrim = (
            previous
            && Number.isFinite(previousStart)
            && Number.isFinite(previousDuration)
            && previousDuration > 0
            && Math.abs(previousDuration - duration) < 0.35
        );
        const baseStart = chainsPreviousTrim ? previousStart : 0;
        const sourceDuration = (
            chainsPreviousTrim && Number.isFinite(previousSourceDuration) && previousSourceDuration > 0
        ) ? previousSourceDuration : duration;
        const start = Math.max(0, Math.min(sourceDuration, baseStart + relStart));
        const end = Math.max(0, Math.min(sourceDuration, baseStart + relEnd));
        if (end <= start + 0.001) return null;

        return {
            source: 'gradio_video_trim',
            component: binding.componentId,
            trim_start: Math.round(start * 1000) / 1000,
            trim_end: Math.round(end * 1000) / 1000,
            duration: Math.round((end - start) * 1000) / 1000,
            video_duration: Math.round(sourceDuration * 1000) / 1000,
            preview_duration: Math.round(duration * 1000) / 1000,
        };
    }

    function bind(binding) {
        const root = document.getElementById(binding.componentId);
        if (!root) return false;

        const rootFlag = `simpaiTrimRecorderBound${binding.componentId}`;
        if (root.dataset[rootFlag] === '1') return true;
        root.dataset[rootFlag] = '1';
        root.addEventListener('click', (event) => {
            const button = event.target?.closest ? event.target.closest('button') : null;
            if (!button || !root.contains(button)) return;
            if (isTrimSubmitButton(button)) {
                const payload = buildTrimPayload(binding, root);
                if (payload) writePayload(binding.payloadId, payload);
            } else if (isResetButton(button)) {
                writePayload(binding.payloadId, null);
            }
        }, true);
        return true;
    }

    function bindAll() {
        bindings.forEach(bind);
    }

    const observer = new MutationObserver(bindAll);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    onUiLoaded(bindAll);
    onAfterUiUpdate(bindAll);
    bindAll();
})();

(function initGradio6MountedVisibilityHelpers() {
    if (window.__simpaiGradio6MountedVisibilityHelpersStarted) return;
    window.__simpaiGradio6MountedVisibilityHelpersStarted = true;

    const registry = new Map();

    function selectorForId(id) {
        const value = String(id || '');
        if (window.CSS?.escape) return `#${window.CSS.escape(value)}`;
        return `#${value.replace(/[^A-Za-z0-9_-]/g, '\\$&')}`;
    }

    function normalizeRecord(record, defaults) {
        if (!record) return null;
        const normalized = typeof record === 'string' ? { id: record } : { ...record };
        const key = normalized.key || normalized.name || normalized.id;
        const elemId = normalized.elemId || normalized.elementId || normalized.id || key;
        if (!key || !elemId) return null;
        return {
            owner: 'client-mounted',
            group: '',
            defaultVisible: true,
            ...defaults,
            ...normalized,
            key: String(key),
            id: String(elemId),
        };
    }

    function register(records, defaults = {}) {
        const list = Array.isArray(records) ? records : [records];
        list.forEach((record) => {
            const normalized = normalizeRecord(record, defaults);
            if (normalized) registry.set(normalized.key, normalized);
        });
        return controller;
    }

    function registered(key) {
        return registry.get(String(key || '')) || null;
    }

    function elementIdFor(key) {
        const record = registered(key);
        return record?.id || String(key || '');
    }

    function findById(id) {
        const roots = [typeof gradioApp === 'function' ? gradioApp() : null, document];
        const selector = selectorForId(elementIdFor(id));
        for (const root of roots) {
            if (!root?.querySelector) continue;
            const el = root.querySelector(selector);
            if (el) return el;
        }
        return null;
    }

    function controlRoot(id) {
        const el = findById(id);
        if (!el) return null;
        if (el.matches?.('input, textarea, select, button')) return el.closest?.('.block') || el;
        return el;
    }

    function clearHiddenFlags(root) {
        if (!root) return;
        const hadCollapsedHiddenState = !!(
            root.classList?.contains('simpai-force-hidden')
            || root.dataset?.simpleaiSceneHidden === '1'
            || root.dataset?.simpleaiAuxHidden === '1'
            || root.dataset?.simpleaiPresetModelHidden === '1'
        );
        root.hidden = false;
        root.removeAttribute?.('hidden');
        root.removeAttribute?.('aria-hidden');
        root.classList?.remove('hidden');
        root.classList?.remove('hide');
        root.classList?.remove('simpai-force-hidden');
        root.classList?.remove('simpai-mounted-hidden');
        root.style?.removeProperty('display');
        if (hadCollapsedHiddenState) {
            root.style?.removeProperty('min-height');
            root.style?.removeProperty('height');
            root.style?.removeProperty('margin');
            root.style?.removeProperty('padding');
            root.style?.removeProperty('overflow');
        }
    }

    function setControlVisible(id, visible, options = {}) {
        const root = controlRoot(id);
        if (!root) return false;
        if (visible) {
            const alreadyVisible = !root.hidden
                && root.getAttribute?.('aria-hidden') !== 'true'
                && !root.classList?.contains('hidden')
                && !root.classList?.contains('hide')
                && !root.classList?.contains('simpai-force-hidden')
                && !root.classList?.contains('simpai-mounted-hidden')
                && root.style?.display !== 'none';
            if (alreadyVisible) return true;
            clearHiddenFlags(root);
        } else {
            const force = !!options.force;
            const alreadyHidden = !!root.hidden
                && root.getAttribute?.('aria-hidden') === 'true'
                && root.classList?.contains('hidden')
                && root.classList?.contains('simpai-mounted-hidden')
                && (!force || root.classList?.contains('simpai-force-hidden'))
                && root.style?.display === 'none';
            if (alreadyHidden) return true;
            root.classList?.add('hidden');
            root.classList?.add('simpai-mounted-hidden');
            if (force) root.classList?.add('simpai-force-hidden');
            root.hidden = true;
            if (force) root.style?.setProperty('display', 'none', 'important');
            else root.style.display = 'none';
            root.setAttribute('aria-hidden', 'true');
        }
        return true;
    }

    function setManyVisible(ids, visible, options = {}) {
        return (ids || []).map((id) => setControlVisible(id, visible, options));
    }

    function schedule(callback, delays = [40, 120, 300, 700]) {
        if (typeof callback !== 'function') return;
        callback();
        delays.forEach((delay) => setTimeout(callback, delay));
    }

    function controlText(id) {
        const root = findById(id);
        if (!root) return '';
        const select = root.matches?.('select') ? root : root.querySelector?.('select');
        if (select) return select.value || select.options?.[select.selectedIndex]?.textContent || '';
        const input = root.matches?.('input, textarea') ? root : root.querySelector?.('input, textarea');
        if (input?.value) return input.value;
        const selected = root.querySelector?.('[aria-selected="true"], [data-selected="true"], .selected');
        if (selected?.textContent) return selected.textContent;
        return root.textContent || '';
    }

    function checkboxChecked(id) {
        const root = findById(id);
        const input = root?.querySelector?.('input[type="checkbox"]');
        return input ? !!input.checked : null;
    }

    const controller = {
        register,
        registerMany: register,
        get: registered,
        all: () => Array.from(registry.values()),
        findById,
        rootById: controlRoot,
        clearHiddenFlags,
        setVisible: setControlVisible,
        setManyVisible,
        text: controlText,
        checkboxChecked,
        schedule,
    };

    window.SimpAIVisibilityController = controller;
    window.simpaiFindControlById = findById;
    window.simpaiControlRootById = controlRoot;
    window.simpaiSetControlVisible = setControlVisible;
    window.simpaiGetControlText = controlText;
    window.simpaiGetCheckboxChecked = checkboxChecked;
})();

(function initInpaintModePromptVisibilitySync() {
    if (window.__simpaiInpaintModePromptVisibilitySyncStarted) return;
    window.__simpaiInpaintModePromptVisibilitySyncStarted = true;

    const MODE_ID = 'inpaint_mode';
    const PROMPT_ID = 'inpaint_additional_prompt';
    const OUTPAINT_ID = 'outpaint_selections';
    const QUICK_ID = 'example_inpaint_prompts';
    const visibility = window.SimpAIVisibilityController;

    visibility?.registerMany?.([
        { id: PROMPT_ID, group: 'inpaint-mode' },
        { id: OUTPAINT_ID, group: 'inpaint-mode' },
        { id: QUICK_ID, group: 'inpaint-mode' },
    ]);

    function textFromModeControl() {
        return visibility?.text?.(MODE_ID) || '';
    }

    function modeKind(mode) {
        const text = String(mode || '').trim();
        const lower = text.toLowerCase();
        if (lower.startsWith('improve detail') || text.includes('细节')) return 'detail';
        if (lower.startsWith('modify content') || text.includes('内容') || text.includes('修改')) return 'modify';
        return 'default';
    }

    function syncInpaintModePromptVisibility(mode) {
        const explicit = mode !== undefined && mode !== null && String(mode).trim() !== '';
        const now = Date.now();
        if (explicit) {
            window.__simpaiInpaintModeValue = String(mode);
            window.__simpaiInpaintModeValueUntil = now + 2500;
        }
        const cachedMode = window.__simpaiInpaintModeValue || '';
        const preferCachedMode = !!cachedMode && Number(window.__simpaiInpaintModeValueUntil || 0) > now;
        const rawMode = explicit ? mode : (preferCachedMode ? cachedMode : (textFromModeControl() || cachedMode || ''));
        const kind = modeKind(rawMode);
        const showPrompt = kind === 'detail' || kind === 'modify';

        visibility?.setVisible?.(PROMPT_ID, showPrompt);
        visibility?.setVisible?.(OUTPAINT_ID, !showPrompt);
        visibility?.setVisible?.(QUICK_ID, kind === 'detail');
    }

    function scheduleInpaintModePromptVisibilitySync(mode) {
        visibility?.schedule?.(() => syncInpaintModePromptVisibility(mode));
        if (mode !== undefined && mode !== null && String(mode).trim() !== '') {
            [80, 220, 520, 1100].forEach((delay) => {
                setTimeout(() => syncInpaintModePromptVisibility(mode), delay);
            });
        }
    }

    window.syncInpaintModePromptVisibility = scheduleInpaintModePromptVisibilitySync;

    document.addEventListener('input', (event) => {
        if (event.target?.closest?.(`#${MODE_ID}`)) scheduleInpaintModePromptVisibilitySync();
    }, true);
    document.addEventListener('change', (event) => {
        if (event.target?.closest?.(`#${MODE_ID}`)) scheduleInpaintModePromptVisibilitySync();
    }, true);
    document.addEventListener('click', (event) => {
        if (event.target?.closest?.(`#${MODE_ID}`)) scheduleInpaintModePromptVisibilitySync();
    }, true);

    onUiLoaded(() => scheduleInpaintModePromptVisibilitySync());
    onAfterUiUpdate(() => scheduleInpaintModePromptVisibilitySync());
    onUiTabChange(() => scheduleInpaintModePromptVisibilitySync());
})();

(function registerPromptHistoryTooltip() {
    const itemSelector = '#prompt_history .gallery > .gallery-item';
    const tooltipId = 'simpai-prompt-history-tooltip';
    let pointerItem = null;
    let focusItem = null;
    let activeItem = null;
    let describedItem = null;
    let previousDescribedBy = null;
    let tooltipHovered = false;
    let hideTimer = 0;
    let positionFrame = 0;
    let tooltip = null;

    function promptHistoryItem(target) {
        const element = target?.nodeType === Node.TEXT_NODE ? target.parentElement : target;
        return element?.closest?.(itemSelector) || null;
    }

    function promptHistoryValues() {
        const root = document.getElementById('prompt_history_data')
            || (typeof gradioApp === 'function' ? gradioApp().getElementById?.('prompt_history_data') : null);
        const field = root?.querySelector?.('textarea, input');
        try {
            const values = JSON.parse(field?.value || '[]');
            return Array.isArray(values) ? values : [];
        } catch (e) {
            return [];
        }
    }

    function promptHistoryText(item) {
        const renderedText = String(item?.textContent || '').replace(/\r\n?/g, '\n').trim();
        const renderedPrefix = renderedText.replace(/\.\.\.$/, '');
        const items = Array.from(item?.parentElement?.querySelectorAll?.(':scope > .gallery-item') || []);
        const values = promptHistoryValues();
        const indexedValue = values[items.indexOf(item)];
        if (typeof indexedValue === 'string' && (!renderedPrefix || indexedValue.startsWith(renderedPrefix))) {
            return indexedValue.trim();
        }
        const prefixMatch = values.find((value) => (
            typeof value === 'string' && renderedPrefix && value.startsWith(renderedPrefix)
        ));
        return String(prefixMatch || renderedText || indexedValue || '').trim();
    }

    function restoreDescription() {
        if (!describedItem) return;
        if (previousDescribedBy == null) describedItem.removeAttribute('aria-describedby');
        else describedItem.setAttribute('aria-describedby', previousDescribedBy);
        describedItem = null;
        previousDescribedBy = null;
    }

    function describeItem(item) {
        if (describedItem === item) return;
        restoreDescription();
        describedItem = item;
        previousDescribedBy = item.getAttribute('aria-describedby');
        const ids = new Set(String(previousDescribedBy || '').split(/\s+/).filter(Boolean));
        ids.add(tooltipId);
        item.setAttribute('aria-describedby', Array.from(ids).join(' '));
    }

    function positionTooltip() {
        positionFrame = 0;
        if (!tooltip || tooltip.hidden || !activeItem?.isConnected) return;
        const itemRect = activeItem.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();
        const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
        const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
        const padding = 12;
        const gap = 8;
        const roomBelow = viewportHeight - itemRect.bottom - gap - padding;
        const roomAbove = itemRect.top - gap - padding;
        const showBelow = roomBelow >= tooltipRect.height || roomBelow >= roomAbove;
        const preferredTop = showBelow
            ? itemRect.bottom + gap
            : itemRect.top - tooltipRect.height - gap;
        const maxLeft = Math.max(padding, viewportWidth - tooltipRect.width - padding);
        const maxTop = Math.max(padding, viewportHeight - tooltipRect.height - padding);

        tooltip.style.left = `${Math.max(padding, Math.min(itemRect.left, maxLeft))}px`;
        tooltip.style.top = `${Math.max(padding, Math.min(preferredTop, maxTop))}px`;
        tooltip.style.visibility = 'visible';
    }

    function schedulePosition() {
        if (positionFrame || !activeItem) return;
        positionFrame = window.requestAnimationFrame(positionTooltip);
    }

    function hideTooltip() {
        if (positionFrame) window.cancelAnimationFrame(positionFrame);
        positionFrame = 0;
        activeItem = null;
        restoreDescription();
        if (!tooltip) return;
        tooltip.hidden = true;
        tooltip.setAttribute('aria-hidden', 'true');
    }

    function showTooltip(item) {
        const promptText = promptHistoryText(item);
        if (!promptText) {
            hideTooltip();
            return;
        }
        activeItem = item;
        describeItem(item);
        tooltip.textContent = promptText;
        tooltip.style.visibility = 'hidden';
        tooltip.hidden = false;
        tooltip.setAttribute('aria-hidden', 'false');
        positionTooltip();
    }

    function syncTooltip(delay = 0) {
        window.clearTimeout(hideTimer);
        hideTimer = 0;
        const nextItem = pointerItem || focusItem || (tooltipHovered ? activeItem : null);
        if (nextItem?.isConnected) {
            showTooltip(nextItem);
            return;
        }
        if (delay > 0) {
            hideTimer = window.setTimeout(() => {
                hideTimer = 0;
                const delayedItem = pointerItem || focusItem || (tooltipHovered ? activeItem : null);
                if (delayedItem?.isConnected) showTooltip(delayedItem);
                else hideTooltip();
            }, delay);
            return;
        }
        hideTooltip();
    }

    function initPromptHistoryTooltip() {
        if (window.__simpaiPromptHistoryTooltipStarted) {
            if (activeItem && !activeItem.isConnected) hideTooltip();
            return;
        }
        if (!document.body) return;
        window.__simpaiPromptHistoryTooltipStarted = true;

        tooltip = document.createElement('div');
        tooltip.id = tooltipId;
        tooltip.className = 'simpai-prompt-history-tooltip';
        tooltip.setAttribute('role', 'tooltip');
        tooltip.setAttribute('aria-hidden', 'true');
        tooltip.hidden = true;
        document.body.appendChild(tooltip);

        document.addEventListener('pointerover', (event) => {
            if (event.pointerType === 'touch') return;
            const item = promptHistoryItem(event.target);
            if (!item || item === pointerItem) return;
            pointerItem = item;
            syncTooltip();
        }, true);

        document.addEventListener('pointerout', (event) => {
            const item = promptHistoryItem(event.target);
            if (!item || item !== pointerItem || promptHistoryItem(event.relatedTarget) === item) return;
            pointerItem = null;
            syncTooltip(120);
        }, true);

        document.addEventListener('focusin', (event) => {
            const item = promptHistoryItem(event.target);
            if (!item?.matches?.(':focus-visible')) return;
            focusItem = item;
            syncTooltip();
        }, true);

        document.addEventListener('focusout', (event) => {
            const item = promptHistoryItem(event.target);
            if (!item || item !== focusItem || promptHistoryItem(event.relatedTarget) === item) return;
            focusItem = null;
            syncTooltip(80);
        }, true);

        document.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape' || !activeItem) return;
            pointerItem = null;
            focusItem = null;
            tooltipHovered = false;
            hideTooltip();
        }, true);

        tooltip.addEventListener('pointerenter', (event) => {
            if (event.pointerType === 'touch') return;
            tooltipHovered = true;
            syncTooltip();
        });
        tooltip.addEventListener('pointerleave', () => {
            tooltipHovered = false;
            syncTooltip(80);
        });

        window.addEventListener('resize', schedulePosition);
        document.addEventListener('scroll', schedulePosition, true);
    }

    onUiLoaded(initPromptHistoryTooltip);
    onAfterUiUpdate(initPromptHistoryTooltip);
})();

(function initGradio6MountedDynamicVisibilitySync() {
    if (window.__simpaiGradio6MountedDynamicVisibilitySyncStarted) return;
    window.__simpaiGradio6MountedDynamicVisibilitySyncStarted = true;

    const visibility = window.SimpAIVisibilityController;
    const setVisible = (id, visible) => visibility?.setVisible?.(id, visible);
    const getText = (id) => visibility?.text?.(id) || '';
    const getChecked = (id) => visibility?.checkboxChecked?.(id);
    let lastResolvedSceneVisibilityParams = null;

    function sceneVisibilityParamsResolution(params) {
        if (!params || typeof params !== 'object') return { resolved: false, params: null };
        const hasSceneFlag = Object.prototype.hasOwnProperty.call(params, '__is_scene_frontend');
        const hasSceneSchema = Object.prototype.hasOwnProperty.call(params, 'scene_frontend');
        return { resolved: hasSceneFlag || hasSceneSchema, params };
    }

    function resolveSceneVisibilityParams(paramsOverride) {
        const candidate = paramsOverride !== undefined ? paramsOverride : getTopbarParams();
        const resolution = sceneVisibilityParamsResolution(candidate);
        if (resolution.resolved) {
            lastResolvedSceneVisibilityParams = resolution.params;
            return resolution.params;
        }
        return lastResolvedSceneVisibilityParams || null;
    }

    visibility?.registerMany?.([
        { id: 'prompt_wildcards', group: 'prompt-panel' },
        { id: 'prompt_history', group: 'prompt-panel' },
        { id: 'words_in_wildcard', group: 'prompt-panel' },
        { id: 'wildcards_list', group: 'prompt-panel' },
        { id: 'wildcard_tag_name_selection', group: 'prompt-panel' },
        { id: 'wc_start', group: 'prompt-panel' },
        { id: 'wc_group_size', group: 'prompt-panel' },
        { id: 'inpaint_mask_generation_col', group: 'inpaint-mask' },
        { id: 'inpaint_mask_cloth_category', group: 'inpaint-mask' },
        { id: 'inpaint_mask_dino_prompt_text', group: 'inpaint-mask' },
        { id: 'inpaint_mask_advanced_options', group: 'inpaint-mask' },
        { id: 'example_inpaint_mask_dino_prompt_text', group: 'inpaint-mask' },
        { id: 'image_input_panel', group: 'topbar-panel' },
        { id: 'tts_panel', group: 'topbar-panel' },
        { id: 'advanced_column', group: 'topbar-panel' },
        { id: 'scene_panel', group: 'scene' },
        { id: 'scene_primary_row', group: 'scene' },
        { key: 'scene_canvas_image', elemId: 'scene_canvas', group: 'scene' },
        { id: 'scene_input_image1', group: 'scene' },
        { id: 'scene_input_image2', group: 'scene' },
        { id: 'scene_input_image3', group: 'scene' },
        { id: 'scene_input_image4', group: 'scene' },
        { id: 'scene_additional_prompt', group: 'scene' },
        { id: 'scene_additional_prompt_2', group: 'scene' },
        { id: 'scene_video_duration', group: 'scene' },
        { id: 'scene_var_number', group: 'scene' },
        { id: 'scene_var_number2', group: 'scene' },
        { id: 'scene_var_number3', group: 'scene' },
        { id: 'scene_var_number4', group: 'scene' },
        { id: 'scene_var_number5', group: 'scene' },
        { id: 'scene_var_number6', group: 'scene' },
        { id: 'scene_var_number7', group: 'scene' },
        { id: 'scene_var_number8', group: 'scene' },
        { id: 'scene_var_number9', group: 'scene' },
        { id: 'scene_var_number10', group: 'scene' },
        { id: 'scene_steps', group: 'scene' },
        { id: 'scene_switch_option1', group: 'scene' },
        { id: 'scene_switch_option2', group: 'scene' },
        { id: 'scene_switch_option3', group: 'scene' },
        { id: 'scene_switch_option4', group: 'scene' },
        { id: 'scene_video', group: 'scene' },
        { id: 'scene_reference_video', group: 'scene' },
        { id: 'scene_audio', group: 'scene' },
        { id: 'camera_control_accordion', group: 'scene-aux' },
        { id: 'camera_motion_reference_accordion', group: 'scene-aux' },
        { id: 'anglelight_control_accordion', group: 'scene-aux' },
        { id: 'style_transfer_accordion', group: 'scene-aux' },
        { id: 'sam3_video_mask_accordion', group: 'scene-aux' },
        { id: 'pose_studio', group: 'scene-aux' },
        { id: 'gaussian_studio', group: 'scene-aux' },
        { id: 'liveportrait_expression', group: 'scene-aux' },
        { id: 'ltx_guide_control', group: 'scene-aux' },
        { id: 'minimax_h3_storyboard_control', group: 'scene-aux' },
        { id: 'relight_light_control', group: 'scene-aux' },
        { id: 'scene_cloud_image_api', group: 'scene-aux' },
    ]);

    function normalizeChoice(value) {
        return String(value || '').trim().toLowerCase();
    }

    function syncPromptPanelVisibility() {
        const checked = getChecked('prompt_panel_checkbox');
        if (checked === null) return;
        ['prompt_wildcards', 'prompt_history', 'words_in_wildcard', 'wildcards_list', 'wildcard_tag_name_selection'].forEach((id) => {
            setVisible(id, checked);
        });

        const method = getText('wc_method');
        const showStart = checked && method === 'In order';
        setVisible('wc_start', showStart);
        setVisible('wc_group_size', checked && !showStart);
    }

    function syncInpaintMaskVisibility(modelValue) {
        const advancedMasking = getChecked('inpaint_advanced_masking_checkbox');
        if (advancedMasking !== null) setVisible('inpaint_mask_generation_col', advancedMasking);
        const model = normalizeChoice(modelValue || getText('inpaint_mask_model'));
        const showSam = model === 'sam';
        const showCloth = model === 'u2net_cloth_seg';
        setVisible('inpaint_mask_cloth_category', showCloth);
        setVisible('inpaint_mask_dino_prompt_text', showSam);
        setVisible('inpaint_mask_advanced_options', showSam);
        setVisible('example_inpaint_mask_dino_prompt_text', showSam);
    }

    function syncEnhanceMaskVisibility() {
        const defaultModel = normalizeChoice(window.SimpAIDefaultEnhanceMaskModel || 'sam');
        for (let i = 1; i <= 8; i += 1) {
            const modelId = `enhance_mask_model_${i}`;
            const hasModelControl = !!window.simpaiFindControlById?.(modelId);
            const hasMountedRegionControls = [
                `enhance_mask_cloth_category_${i}`,
                `enhance_mask_dino_prompt_text_${i}`,
                `enhance_mask_sam_options_${i}`,
                `example_enhance_mask_dino_prompt_text_${i}`
            ].some((id) => !!window.simpaiFindControlById?.(id));
            if (!hasModelControl && !hasMountedRegionControls) continue;
            const model = normalizeChoice(hasModelControl ? getText(modelId) : defaultModel);
            const showSam = model === 'sam';
            const showCloth = model === 'u2net_cloth_seg';
            setVisible(`enhance_mask_cloth_category_${i}`, showCloth);
            setVisible(`enhance_mask_dino_prompt_text_${i}`, showSam);
            setVisible(`enhance_mask_sam_options_${i}`, showSam);
            setVisible(`example_enhance_mask_dino_prompt_text_${i}`, showSam);
        }
    }

    function syncTopbarPanelVisibility() {
        const paramsOverride = arguments.length ? arguments[0] : undefined;
        const imageChecked = getChecked('input_image_checkbox');
        const ttsChecked = getChecked('qwen_tts_checkbox');
        const advancedChecked = getChecked('advanced_checkbox');
        const params = resolveSceneVisibilityParams(paramsOverride);
        const isScene = isSceneFrontendParams(params);
        if (imageChecked !== null) {
            const showImagePanel = !!imageChecked && !isScene;
            setVisible('image_input_panel', showImagePanel);
            if (document.documentElement.classList.contains('simpai-engine-class-visible') !== showImagePanel) {
                document.documentElement.classList.toggle('simpai-engine-class-visible', showImagePanel);
            }
        }
        if (ttsChecked !== null) setVisible('tts_panel', !!ttsChecked);
        if (advancedChecked !== null) setVisible('advanced_column', !!advancedChecked);
    }

    function getTopbarParams() {
        return window.simpleaiTopbarSystemParams
            || (typeof topbarLastSystemParams !== 'undefined' ? topbarLastSystemParams : null)
            || null;
    }

    function isSceneFrontendParams(params) {
        return !!(params && typeof params === 'object' && (params.__is_scene_frontend || params.scene_frontend));
    }

    window.simpaiIsSceneFrontendActive = () => isSceneFrontendParams(getTopbarParams());

    function sceneThemeValue(sceneFrontend, params) {
        const selected = sceneSelectedThemeValue();
        if (selected && sceneThemeBelongsToFrontend(sceneFrontend, selected)) return selected;
        const explicit = params?.__scene_theme || params?.scene_theme;
        if (explicit) return String(explicit);
        const themes = sceneFrontend?.theme;
        if (Array.isArray(themes)) return String(themes[0] || '');
        return String(themes || '');
    }

    function sceneThemeBelongsToFrontend(sceneFrontend, theme) {
        if (!theme) return false;
        const themes = sceneFrontend?.theme;
        if (Array.isArray(themes)) return themes.map(String).includes(String(theme));
        if (themes) return String(themes) === String(theme);
        const raw = sceneFrontend?.task_method;
        return !!(raw && typeof raw === 'object' && !Array.isArray(raw) && Object.prototype.hasOwnProperty.call(raw, theme));
    }

    function sceneTaskMethodForTheme(sceneFrontend, theme) {
        const raw = sceneFrontend?.task_method;
        if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
            if (theme && Object.prototype.hasOwnProperty.call(raw, theme)) {
                return { value: String(raw[theme] || ''), known: true };
            }
            return { value: '', known: false };
        }
        if (Array.isArray(raw)) {
            const themes = sceneFrontend?.theme;
            if (theme && Array.isArray(themes)) {
                const index = themes.map(String).indexOf(String(theme));
                if (index >= 0 && index < raw.length) {
                    return { value: String(raw[index] || ''), known: true };
                }
            }
            return raw.length ? { value: String(raw[0] || ''), known: true } : { value: '', known: false };
        }
        if (raw) return { value: String(raw || ''), known: true };
        return { value: '', known: false };
    }

    function sceneTaskMethodValue(sceneFrontend, theme, params) {
        const byTheme = sceneTaskMethodForTheme(sceneFrontend, theme);
        if (byTheme.known) return byTheme.value;
        if (params?.__scene_task_method) return String(params.__scene_task_method);
        return '';
    }

    function sceneFrontendSam3Values(sceneFrontend) {
        const values = [];
        const themes = sceneFrontend?.theme;
        if (Array.isArray(themes)) values.push(...themes);
        else if (themes) values.push(themes);
        const raw = sceneFrontend?.task_method;
        if (raw && typeof raw === 'object' && !Array.isArray(raw)) values.push(...Object.values(raw));
        else if (Array.isArray(raw)) values.push(...raw);
        else if (raw) values.push(raw);
        return values.map((value) => String(value || '').toLowerCase()).filter(Boolean);
    }

    function sceneFrontendAllThemesSam3(sceneFrontend) {
        const normalized = sceneFrontendSam3Values(sceneFrontend);
        return normalized.length > 0 && normalized.every((value) => value.includes('sam3'));
    }

    function sceneFrontendHasSam3Option(sceneFrontend) {
        return sceneFrontendSam3Values(sceneFrontend).some((value) => value.includes('sam3'));
    }

    function sceneTaskMethodNeedsThemeMatch(sceneFrontend) {
        const raw = sceneFrontend?.task_method;
        return Array.isArray(raw) || !!(raw && typeof raw === 'object');
    }

    function sceneSelectedThemeValue() {
        const root = document.getElementById('scene_theme') || document.getElementById('scene_panel');
        if (!root) return '';
        const checked = root.querySelector('input[type="radio"]:checked');
        if (!checked) return '';
        return String(checked.value || checked.getAttribute('value') || '');
    }

    function sceneSam3VisibilityDecision(sceneFrontend, theme, params) {
        const rawHidden = sceneFrontend?.disvisible;
        const hidden = new Set(
            (Array.isArray(rawHidden) ? rawHidden : String(rawHidden || '').split(','))
                .map((value) => String(value || '').trim())
                .filter(Boolean)
        );
        if (['sam3_video_mask_accordion', 'sam3_input_video', 'sam3_mask_video'].some((key) => hidden.has(key))) {
            return false;
        }
        const rawEnabled = sceneFrontend?.divisible;
        const enabled = new Set(Array.isArray(rawEnabled) ? rawEnabled.map(String) : []);
        const inputsExplicitlyEnabled = ['sam3_input_video', 'sam3_mask_video'].some((key) => enabled.has(key));
        const byTheme = sceneTaskMethodForTheme(sceneFrontend, theme);
        if (byTheme.known) return byTheme.value.toLowerCase().includes('sam3') || inputsExplicitlyEnabled;
        const selected = sceneSelectedThemeValue();
        if (sceneFrontendAllThemesSam3(sceneFrontend || {})) return true;
        const hasSam3Option = sceneFrontendHasSam3Option(sceneFrontend || {});
        if (selected && hasSam3Option && !sceneThemeBelongsToFrontend(sceneFrontend, selected)) {
            return selected.toLowerCase().includes('sam3');
        }
        const fallbackTask = sceneTaskMethodNeedsThemeMatch(sceneFrontend || {})
            ? ''
            : sceneTaskMethodValue(sceneFrontend, theme, params).toLowerCase();
        if (fallbackTask) return fallbackTask.includes('sam3') || inputsExplicitlyEnabled;
        const themeText = String(theme || selected || '').toLowerCase();
        return themeText.includes('sam3') || inputsExplicitlyEnabled;
    }

    function sceneDisvisibleSet(sceneFrontend, params) {
        const hasResolved = Array.isArray(params?.__scene_disvisible);
        const source = hasResolved
            ? params.__scene_disvisible
            : (sceneFrontend && Object.prototype.hasOwnProperty.call(sceneFrontend, 'disvisible')
                ? sceneFrontend.disvisible
                : []);
        return Array.isArray(source)
            ? new Set(source.map(String))
            : new Set(String(source || '').split(',').map((x) => x.trim()).filter(Boolean));
    }

    function syncSceneFrontendVisibility() {
        const paramsOverride = arguments.length ? arguments[0] : undefined;
        const params = resolveSceneVisibilityParams(paramsOverride);
        if (!params) return;
        const sceneFrontend = params && typeof params === 'object' ? params.scene_frontend : null;
        const isScene = isSceneFrontendParams(params);
        const preset = String((params && (params.__preset || params.preset)) || '').trim();
        setVisible('scene_panel', isScene);
        setVisible('scene_primary_row', isScene);
        setVisible('scene_cloud_image_api', isScene && preset === 'GeneralAPIImage');
        if (!isScene) {
            setVisible('scene_additional_prompt', false);
            if (typeof window.simpaiSetLtxGuideControlVisible === 'function') {
                window.simpaiSetLtxGuideControlVisible(false, params || {});
            } else {
                setVisible('ltx_guide_control', false);
                setVisible('ltx_guide_scene_control_html', false);
            }
            if (typeof window.simpaiSetH3StoryboardControlVisible === 'function') {
                window.simpaiSetH3StoryboardControlVisible(false, params || {});
            } else {
                setVisible('minimax_h3_storyboard_control', false);
                setVisible('minimax_h3_storyboard_scene_control_html', false);
            }
            if (typeof window.closeSam3FramesEditor === 'function') {
                try { window.closeSam3FramesEditor(); } catch (e) {}
            }
            try { window.SimpAISketch?.releaseHidden?.(); } catch (e) {}
            return;
        }

        setVisible('image_input_panel', false);
        if (document.documentElement.classList.contains('simpai-engine-class-visible')) {
            document.documentElement.classList.remove('simpai-engine-class-visible');
        }

        const theme = sceneThemeValue(sceneFrontend || {}, params || {});
        const themeLower = theme.toLowerCase();
        const taskMethodLower = sceneTaskMethodValue(sceneFrontend || {}, theme, params || {}).toLowerCase();
        const engineLower = String((params && (params.backend_engine || params.engine)) || '').toLowerCase();
        const disvisible = sceneDisvisibleSet(sceneFrontend || {}, params || {});
        if (typeof window.syncSceneCanvasMaskMode === 'function') {
            window.syncSceneCanvasMaskMode(params || {});
        }

        setVisible('camera_control_accordion', themeLower.includes('multiangle') && !disvisible.has('camera_control_accordion'));
        const wanCameraMotion = ['uni3c'].some((marker) => themeLower.includes(marker) || taskMethodLower.includes(marker) || engineLower.includes(marker));
        setVisible('camera_motion_reference_accordion', wanCameraMotion && !disvisible.has('scene_reference_video'));
        setVisible('anglelight_control_accordion', (themeLower.includes('anglelight') || themeLower.includes('lightning')) && !disvisible.has('anglelight_control_accordion'));
        setVisible('style_transfer_accordion', themeLower.includes('flux2_styletransfer') && !disvisible.has('style_transfer_accordion'));
        const showSam3 = sceneSam3VisibilityDecision(sceneFrontend || {}, theme, params || {});
        if (showSam3 !== null) {
            setVisible('sam3_video_mask_accordion', showSam3 && !disvisible.has('sam3_video_mask_accordion'));
        }
        if (showSam3 === false && typeof window.closeSam3FramesEditor === 'function') {
            try { window.closeSam3FramesEditor(); } catch (e) {}
        }
        const showPoseStudio = (themeLower.includes('pose') || taskMethodLower.includes('pose')) && !disvisible.has('pose_studio');
        setVisible('pose_studio', showPoseStudio);
        if (!showPoseStudio && window.SimpAIPoseStudioEditor?.closeScenePreset) {
            try { window.SimpAIPoseStudioEditor.closeScenePreset(); } catch (e) {}
        }
        const gaussianMarkers = ['gaussian', '3dgs', 'splat', 'sharp'];
        const showGaussianStudio = gaussianMarkers.some((marker) => themeLower.includes(marker) || taskMethodLower.includes(marker)) && !disvisible.has('gaussian_studio');
        setVisible('gaussian_studio', showGaussianStudio);
        if (!showGaussianStudio && window.SimpAIGaussianStudioEditor?.closeScenePreset) {
            try { window.SimpAIGaussianStudioEditor.closeScenePreset(); } catch (e) {}
        }
        const showLivePortraitExpression = (themeLower.includes('liveportrait') || taskMethodLower.includes('liveportrait') || taskMethodLower.includes('advancedliveportrait')) && !disvisible.has('liveportrait_expression');
        const livePortraitExpressionControl = gradioApp().querySelector('#liveportrait_expression_scene_control');
        if (livePortraitExpressionControl) {
            const useVideoFirstFrame = taskMethodLower.includes('liveportrait_video_expression');
            livePortraitExpressionControl.dataset.liveportraitExpressionSource = useVideoFirstFrame ? 'scene_video_first_frame' : 'scene_input_image1';
            livePortraitExpressionControl.dataset.liveportraitExpressionReference = useVideoFirstFrame ? 'none' : 'scene_input_image2';
            livePortraitExpressionControl.dataset.liveportraitExpressionExportTarget = 'scene_input_image1';
            livePortraitExpressionControl.dataset.liveportraitExpressionExportMode = useVideoFirstFrame ? 'params' : 'image';
        }
        setVisible('liveportrait_expression', showLivePortraitExpression);
        if (!showLivePortraitExpression && window.SimpAILivePortraitExpressionEditor?.closeScenePreset) {
            try { window.SimpAILivePortraitExpressionEditor.closeScenePreset(); } catch (e) {}
        }
        const showLtxGuideControl = (taskMethodLower.includes('ltx2.3_i2v')
            || taskMethodLower.includes('ltx2.3_ia2v')
            || taskMethodLower.includes('ltx2.3_extent')
            || /ltx2\.3\s*\((i2v|ia2v|extent)\)/.test(preset.toLowerCase()))
            && !disvisible.has('ltx_guide_control');
        if (typeof window.simpaiSetLtxGuideControlVisible === 'function') {
            window.simpaiSetLtxGuideControlVisible(showLtxGuideControl, params || {});
        } else {
            setVisible('ltx_guide_control', showLtxGuideControl);
            setVisible('ltx_guide_scene_control_html', showLtxGuideControl);
            if (showLtxGuideControl && window.SimpAILTXGuideEditor?.syncSceneControl) {
                try { window.SimpAILTXGuideEditor.syncSceneControl(params || {}); } catch (e) {}
            }
            if (!showLtxGuideControl && window.SimpAILTXGuideEditor?.closeScenePreset) {
                try { window.SimpAILTXGuideEditor.closeScenePreset(); } catch (e) {}
            }
        }
        const showH3StoryboardControl = (taskMethodLower.includes('minimax_h3')
            || /minimax[-_\s]*h3/.test(preset.toLowerCase()))
            && !disvisible.has('minimax_h3_storyboard_control');
        if (typeof window.simpaiSetH3StoryboardControlVisible === 'function') {
            window.simpaiSetH3StoryboardControlVisible(showH3StoryboardControl, params || {});
        } else {
            setVisible('minimax_h3_storyboard_control', showH3StoryboardControl);
            setVisible('minimax_h3_storyboard_scene_control_html', showH3StoryboardControl);
            if (showH3StoryboardControl && window.SimpAIH3StoryboardEditor?.syncSceneControl) {
                try { window.SimpAIH3StoryboardEditor.syncSceneControl(params || {}); } catch (e) {}
            }
            if (!showH3StoryboardControl && window.SimpAIH3StoryboardEditor?.closeScenePreset) {
                try { window.SimpAIH3StoryboardEditor.closeScenePreset(); } catch (e) {}
            }
        }
        const showRelightLight = (themeLower.includes('relight') || taskMethodLower.includes('relight')) && !disvisible.has('relight_light_control');
        setVisible('relight_light_control', showRelightLight);
        if (showRelightLight && typeof window.syncRelightLightControl === 'function') {
            window.syncRelightLightControl(params || {});
        }
        const relightHiddenControls = new Set(showRelightLight ? ['scene_var_number'] : []);

        [
            'scene_canvas_image', 'scene_input_image1', 'scene_input_image2', 'scene_input_image3', 'scene_input_image4',
            'scene_additional_prompt', 'scene_additional_prompt_2', 'scene_video_duration', 'scene_var_number',
            'scene_var_number2', 'scene_var_number3', 'scene_var_number4',
            'scene_var_number5', 'scene_var_number6', 'scene_var_number7',
            'scene_var_number8', 'scene_var_number9', 'scene_var_number10',
            'scene_steps', 'scene_switch_option1', 'scene_switch_option2',
            'scene_switch_option3', 'scene_switch_option4', 'scene_video',
            'scene_reference_video', 'scene_audio'
        ].forEach((id) => {
            setVisible(id, !disvisible.has(id) && !relightHiddenControls.has(id));
        });
        try { window.SimpAISketch?.releaseHidden?.(); } catch (e) {}
    }

    function syncAllMountedDynamicVisibility() {
        const paramsOverride = arguments.length ? arguments[0] : undefined;
        syncTopbarPanelVisibility(paramsOverride);
        syncPromptPanelVisibility();
        syncInpaintMaskVisibility();
        syncEnhanceMaskVisibility();
        syncSceneFrontendVisibility(paramsOverride);
        try { window.SimpAISketch?.releaseHidden?.(); } catch (e) {}
    }

    let mountedVisibilityTimers = [];
    function scheduleAllMountedDynamicVisibility() {
        const paramsOverride = arguments.length ? arguments[0] : undefined;
        for (const timer of mountedVisibilityTimers) {
            window.clearTimeout(timer);
        }
        mountedVisibilityTimers = [0, 160, 520].map((delay) => window.setTimeout(() => {
            syncAllMountedDynamicVisibility(paramsOverride);
        }, delay));
    }

    window.syncPromptPanelMountedVisibility = () => scheduleAllMountedDynamicVisibility();
    window.syncInpaintMaskControlsVisibility = (model) => {
        syncInpaintMaskVisibility(model);
        [40, 120, 300, 700].forEach((delay) => setTimeout(() => syncInpaintMaskVisibility(model), delay));
    };
    window.syncEnhanceMaskControlsVisibility = () => scheduleAllMountedDynamicVisibility();
    window.syncTopbarMountedPanelVisibility = () => visibility?.schedule?.(syncTopbarPanelVisibility);
    window.syncGradio6MountedDynamicVisibility = () => scheduleAllMountedDynamicVisibility();
    window.syncGradio6MountedDynamicVisibilityWithState = (traceLabel, stateOverride) => {
        const override = stateOverride !== undefined
            ? stateOverride
            : (traceLabel && typeof traceLabel === 'object' ? traceLabel : undefined);
        scheduleAllMountedDynamicVisibility(override);
    };

    document.addEventListener('input', (event) => {
        if (event.target?.closest?.('#input_image_checkbox, #qwen_tts_checkbox, #advanced_checkbox, #prompt_panel_checkbox, #wc_method, #inpaint_advanced_masking_checkbox, #inpaint_mask_model, [id^="enhance_mask_model_"]')) {
            scheduleAllMountedDynamicVisibility();
        }
    }, true);
    document.addEventListener('change', (event) => {
        if (event.target?.closest?.('#input_image_checkbox, #qwen_tts_checkbox, #advanced_checkbox, #prompt_panel_checkbox, #wc_method, #inpaint_advanced_masking_checkbox, #inpaint_mask_model, [id^="enhance_mask_model_"]')) {
            scheduleAllMountedDynamicVisibility();
        }
    }, true);

    onUiLoaded(scheduleAllMountedDynamicVisibility);
    onAfterUiUpdate(scheduleAllMountedDynamicVisibility);
    onUiTabChange(scheduleAllMountedDynamicVisibility);
})();

(function initEngineClassMarkerVisibilitySync() {
    if (window.__simpaiEngineClassMarkerVisibilitySyncStarted) return;
    window.__simpaiEngineClassMarkerVisibilitySyncStarted = true;
    const visibility = window.SimpAIVisibilityController;

    function syncEngineClassMarkerVisibility() {
        const params = window.simpleaiTopbarSystemParams
            || (typeof topbarLastSystemParams !== 'undefined' ? topbarLastSystemParams : null)
            || null;
        const isScene = !!(params && typeof params === 'object' && (params.__is_scene_frontend || params.scene_frontend));
        const visible = !!visibility?.checkboxChecked?.('input_image_checkbox') && !isScene;
        if (document.documentElement.classList.contains('simpai-engine-class-visible') !== visible) {
            document.documentElement.classList.toggle('simpai-engine-class-visible', visible);
        }
    }

    document.addEventListener('input', (event) => {
        if (event.target?.closest?.('#input_image_checkbox')) syncEngineClassMarkerVisibility();
    }, true);
    document.addEventListener('change', (event) => {
        if (event.target?.closest?.('#input_image_checkbox')) syncEngineClassMarkerVisibility();
    }, true);

    window.syncEngineClassMarkerVisibility = syncEngineClassMarkerVisibility;
    onUiLoaded(syncEngineClassMarkerVisibility);
    onAfterUiUpdate(syncEngineClassMarkerVisibility);
    onUiTabChange(syncEngineClassMarkerVisibility);
})();

var onAppend = function(elem, f) {
    var observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(m) {
            if (m.addedNodes.length) {
                f(m.addedNodes);
            }
        });
    });
    observer.observe(elem, {childList: true});
}

function addObserverIfDesiredNodeAvailable(querySelector, callback) {
    var elem = document.querySelector(querySelector);
    if (!elem) {
        window.setTimeout(() => addObserverIfDesiredNodeAvailable(querySelector, callback), 1000);
        return;
    }

    onAppend(elem, callback);
}

/**
 * Show reset button on toast "Connection errored out."
 */
addObserverIfDesiredNodeAvailable(".toast-wrap", function(added) {
    added.forEach(function(element) {
         if (element.innerText.includes("Connection errored out.")) {
             window.setTimeout(function() {
                const stopButton = getGradioRootById("stop_button");
                const isGenerating = elementIsVisible(stopButton);

                if (isGenerating) {
                    return;
                }

                setGradioComponentVisible("skip_button", false);
                setGradioComponentVisible("stop_button", false);
                reconcileGenerationActionButtons("connection_error");
            });
         }
    });
});

/**
 * Add a ctrl+enter as a shortcut to start a generation
 */
document.addEventListener('keydown', function(e) {
    const isModifierKey = (e.metaKey || e.ctrlKey || e.altKey);
    const isEnterKey = (e.key == "Enter" || e.keyCode == 13);

    if(isModifierKey && isEnterKey) {
        const generateButton = gradioApp().querySelector('button:not(.hidden)[id=generate_button]');
        if (generateButton) {
            generateButton.click();
            e.preventDefault();
            return;
        }

        const stopButton = gradioApp().querySelector('button:not(.hidden)[id=stop_button]')
        if(stopButton) {
            stopButton.click();
            e.preventDefault();
            return;
        }
    }
});

function initGeneratingStateRecovery() {
    const STUCK_UI_MS = 22000;
    const NO_PROGRESS_MS = 12000;
    let stopVisibleSince = null;
    let lastProgressUpdateAt = Date.now();
    let lastAutoStopAt = null;

    const progressNode = gradioApp().querySelector('#progress-bar');
    if (progressNode && window.MutationObserver) {
        const progressObserver = new MutationObserver(function() {
            lastProgressUpdateAt = Date.now();
        });
        progressObserver.observe(progressNode, { childList: true, subtree: true, characterData: true, attributes: true });
    }

    const unlockButtons = function(genbutton, stopbutton, skipbutton) {
        [genbutton, stopbutton, skipbutton].forEach(function(btn) {
            if (!btn) {
                return;
            }
            restoreGradioComponentVisibility(btn, { interactive: true });
        });
    };

    window.setInterval(function() {
        const now = Date.now();
        const genbutton = gradioApp().querySelector('#generate_button');
        const stopbutton = gradioApp().querySelector('#stop_button');
        const skipbutton = gradioApp().querySelector('#skip_button');
        const progressBar = gradioApp().querySelector('#progress-bar');
        const sceneVideoPlaceholder = gradioApp().querySelector("#scene_video_placeholder");
        const sceneAudioPlaceholder = gradioApp().querySelector("#scene_audio_placeholder");

        if (!genbutton || !stopbutton) {
            stopVisibleSince = null;
            return;
        }

        const stopVisible = !!stopbutton.offsetParent;
        const skipVisible = !!(skipbutton && skipbutton.offsetParent);
        let generateVisible = !!genbutton.offsetParent;
        const loadParameterVisible = elementIsVisible(getGradioRootById('load_parameter_button'));
        const progressVisible = !!(progressBar && progressBar.offsetParent);
        const sceneBusy = !!((sceneVideoPlaceholder && sceneVideoPlaceholder.offsetParent) || (sceneAudioPlaceholder && sceneAudioPlaceholder.offsetParent));

        if ((stopVisible || skipVisible || loadParameterVisible) && generateVisible) {
            hideGenerateButtonWhenAlternateActionVisible("generation_state_recovery");
            generateVisible = false;
        }

        if (!stopVisible && !skipVisible && !generateVisible && !loadParameterVisible && !sceneBusy) {
            reconcileGenerationActionButtons("empty_generation_controls");
            stopVisibleSince = null;
            return;
        }

        if (!stopVisible || sceneBusy) {
            stopVisibleSince = null;
            return;
        }

        if (!generateVisible) {
            stopVisibleSince = null;
            return;
        }

        if (stopVisibleSince == null) {
            stopVisibleSince = now;
        }

        const stopVisibleMs = now - stopVisibleSince;
        const noProgressMs = now - lastProgressUpdateAt;

        if (stopVisibleMs < STUCK_UI_MS || progressVisible || noProgressMs < NO_PROGRESS_MS) {
            return;
        }

        if (lastAutoStopAt == null || (now - lastAutoStopAt) >= 10000) {
            lastAutoStopAt = now;
            unlockButtons(genbutton, stopbutton, skipbutton);
            stopbutton.click();
        }
    }, 1000);
}

function initStylePreviewOverlay() {
    if (simpleaiDisableHoverPreviewsForInput()) return;
    let overlayVisible = false;
    const samplesPath = document.querySelector("meta[name='samples-path']").getAttribute("content")
    const overlay = document.createElement('div');
    const tooltip = document.createElement('div');
    tooltip.className = 'preview-tooltip';
    overlay.appendChild(tooltip);
    overlay.id = 'stylePreviewOverlay';
    document.body.appendChild(overlay);
    document.addEventListener('mouseover', function (e) {
        const label = e.target.closest('.style_selections label');
        if (!label) return;
        label.removeEventListener("mouseout", onMouseLeave);
        label.addEventListener("mouseout", onMouseLeave);
        overlayVisible = true;
        overlay.style.opacity = "1";
        const originalText = label.querySelector("span").getAttribute("data-original-text");
        const name = originalText || label.querySelector("span").textContent;
        const normalizedName = String(name || '')
            .toLowerCase()
            .replaceAll(" ", "_")
            .replace(/[^a-z0-9_]/g, '');

        const defaultUrl = samplesPath.replace("fooocus_v2", "default_style");
        const candidateUrl = samplesPath.replace("fooocus_v2", normalizedName);
        const escapedDefaultUrl = defaultUrl.replaceAll("\\", "\\\\");
        const escapedCandidateUrl = candidateUrl.replaceAll("\\", "\\\\");

        overlay.style.backgroundImage = `url("${escapedDefaultUrl}")`;
        const probe = new Image();
        probe.onload = () => {
            overlay.style.backgroundImage = `url("${escapedCandidateUrl}")`;
        };
        probe.src = candidateUrl;

        tooltip.textContent = label.querySelector("span").textContent || name;

        function onMouseLeave() {
            overlayVisible = false;
            overlay.style.opacity = "0";
            overlay.style.backgroundImage = "";
            label.removeEventListener("mouseout", onMouseLeave);
        }
    });
    document.addEventListener('mousemove', function (e) {
        if (!overlayVisible) return;
        overlay.style.left = `${e.clientX}px`;
        overlay.style.top = `${e.clientY}px`;
        overlay.className = e.clientY > window.innerHeight / 2 ? "lower-half" : "upper-half";
    });
    const textOverlay = document.createElement('div');
    textOverlay.id = 'styleTextOverlay';
    Object.assign(textOverlay.style, {
        position: 'fixed',
        left: '0',
        top: '0',
        background: 'rgba(0,0,0,0.8)',
        color: 'white',
        padding: '8px',
        borderRadius: '4px',
        pointerEvents: 'none',
        display: 'none',
        zIndex: 9999,
        maxWidth: '320px',
        backdropFilter: 'blur(3px)'
    });
    document.body.appendChild(textOverlay);
    const styleTooltipSelector = '.style-tooltip-target';
    const escapeHtml = (value) => String(value || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
    const renderStyleTextOverlay = (styleData) => {
        const name = escapeHtml(styleData.name || '');
        const prompt = escapeHtml(styleData.prompt || '');
        const negativePrompt = escapeHtml(styleData.negative_prompt || '');
        textOverlay.innerHTML = `
            <div style="font-weight:bold; margin-bottom: 6px; font-size: 14px">${name}</div>
            ${prompt ? `<div style="color:#ddd;font-size:12px;margin:4px 0">Prompt: ${prompt}</div>` : ''}
            ${negativePrompt ? `<div style="color:#888;font-size:12px">Negative: ${negativePrompt}</div>` : ''}
        `;
    };

    document.addEventListener('mouseover', function(e) {
        const container = e.target.closest(styleTooltipSelector);
        if (!container) {
            textOverlay.style.display = 'none';
            return;
        }

        const styleDataRaw = container.getAttribute('data-style-data');
        if (!styleDataRaw) {
            return;
        }

        try {
            const styleData = JSON.parse(styleDataRaw || '{}');
            renderStyleTextOverlay(styleData);
            textOverlay.style.display = 'block';
        } catch (e) {
            console.error('Error parsing style data:', e);
            textOverlay.style.display = 'none';
        }
    });
    document.addEventListener('mousemove', function(e) {
        if (textOverlay.style.display === 'block') {
            textOverlay.style.left = `${e.clientX + 15}px`;
            textOverlay.style.top = `${e.clientY + 15}px`;

            const rect = textOverlay.getBoundingClientRect();
            if (rect.right > window.innerWidth) {
                textOverlay.style.left = `${window.innerWidth - rect.width - 5}px`;
            }
            if (rect.bottom > window.innerHeight) {
                textOverlay.style.top = `${window.innerHeight - rect.height - 5}px`;
            }
        }
    });
    document.addEventListener('mouseout', function(e) {
        if (!e.relatedTarget || !e.relatedTarget.closest(styleTooltipSelector)) {
            textOverlay.style.display = 'none';
        }
    });
    document.addEventListener('click', function(e) {
        const btn = e.target.closest('.style-button');
        if (!btn) return;

        const styleName = btn.getAttribute('data-style-name') || btn.textContent.trim();
        const checkboxes = document.querySelectorAll('.style_selections input[type="checkbox"]');
        for (const cb of checkboxes) {
            const label = cb.nextElementSibling;
            if (label && label.textContent.trim() === styleName) {
                cb.click();
                break;
            }
        }
    });
    document.addEventListener('contextmenu', function(e) {
        const loraDropdown = e.target.closest('[id^="lora_dropdown"]');
        if (loraDropdown) {
            e.preventDefault();
            e.stopPropagation();

            const indexMatch = loraDropdown.id.match(/lora_dropdown_(\d+)$/);
            if (!indexMatch) {
                console.warn('LORA ID格式异常:', loraDropdown.id);
                return;
            }

            const btn = gradioApp().querySelector(`#lora_preview_btn_${indexMatch[1]}`);
            if (btn) {
                const event = new MouseEvent('click', { bubbles: true });
                btn.dispatchEvent(event);
            }
            return;
        }
        const styleItem = e.target.closest('.style_item');
        const styleLabel = e.target.closest('.style_selections label');

        if (styleItem) {
            const container = e.target.closest('.style_item');
            if (!container) return;

            e.preventDefault();

            if (e.button !== 2) return;

            const dataInput = container.querySelector('.style_data_input textarea');
            if (!dataInput) return;

            const styleButton = container.querySelector('.style-button');
            if (styleButton) {
                styleButton.classList.add('disable-hover');
                setTimeout(() => {
                    styleButton.classList.remove('disable-hover');
                }, 3000);
            }

            handleStyleData(dataInput, e);

        } else if (styleLabel) {
            e.preventDefault();
            const styleName = styleLabel.querySelector('span')?.getAttribute('data-original-text')?.trim()
            || styleLabel.querySelector('span')?.textContent?.trim();
            if (!styleName) {
                console.error('无法获取样式名称:', styleLabel);
                return;
            }

            const escapedName = styleName.replace(/ /g, '\\ ');
            const dataInput = gradioApp().querySelector(`#style_data_${escapedName} textarea`);

            if (!dataInput?.value) {
                console.error('数据输入框未找到:', {
                    styleName,
                    selector: `#style_data_${escapedName} textarea`,
                    element: dataInput
                });
                return;
            }
            handleStyleData(dataInput, e);
        }
    });
}

let selectedStylesPreviewResizeObserver = null;
let currentSelectedStylesPreview = null;

function syncSelectedStylesPreviewLayout() {
    const promptTextbox = gradioApp().querySelector('#positive_prompt textarea, #positive_prompt [data-testid="textbox"]');
    if (!promptTextbox) return;

    const preview = gradioApp().querySelector('#selected_styles_preview');
    const summary = preview?.querySelector('.selected-style-summary');
    const previewHeight = summary && !summary.classList.contains('is-empty')
        ? Math.ceil(summary.getBoundingClientRect().height)
        : 0;

    promptTextbox.style.paddingBottom = `${Math.max(28, previewHeight + 16)}px`;
}

function initSelectedStylesPreviewLayout() {
    const preview = gradioApp().querySelector('#selected_styles_preview');

    if (!selectedStylesPreviewResizeObserver) {
        selectedStylesPreviewResizeObserver = new ResizeObserver(() => {
            syncSelectedStylesPreviewLayout();
        });
        window.addEventListener('resize', syncSelectedStylesPreviewLayout);
    }

    if (preview && currentSelectedStylesPreview !== preview) {
        if (currentSelectedStylesPreview) {
            selectedStylesPreviewResizeObserver.unobserve(currentSelectedStylesPreview);
        }
        currentSelectedStylesPreview = preview;
        selectedStylesPreviewResizeObserver.observe(preview);
    }

    requestAnimationFrame(syncSelectedStylesPreviewLayout);
}

function getGradioRootById(rootId) {
    if (!rootId) return null;
    return document.getElementById(rootId)
        || gradioApp().getElementById?.(rootId)
        || null;
}

function getGradioButtonById(rootId) {
    const root = getGradioRootById(rootId);
    if (!root) return null;
    if (root.matches?.('button')) return root;
    return root.querySelector?.('button') || null;
}

function getGradioCheckboxById(rootId) {
    const root = getGradioRootById(rootId);
    if (!root) return null;
    return root.querySelector?.('input[type="checkbox"]') || null;
}

function elementIsVisible(el) {
    if (!el || el.hidden) return false;
    let current = el;
    while (current && current.nodeType === 1) {
        const style = getComputedStyle(current);
        if (style.display === 'none' || style.visibility === 'hidden') {
            return false;
        }
        current = current.parentElement;
    }
    return true;
}

function setGradioComponentVisible(rootId, visible) {
    const root = getGradioRootById(rootId);
    if (!root) return false;
    if (visible) {
        if (root.hidden) root.hidden = false;
        if (root.hasAttribute('hidden')) root.removeAttribute('hidden');
        if (root.hasAttribute('aria-hidden')) root.removeAttribute('aria-hidden');
        if (root.classList.contains('hidden')) root.classList.remove('hidden');
        if (root.classList.contains('hide')) root.classList.remove('hide');
        if (root.style.getPropertyValue('display')) root.style.removeProperty('display');
        if (root.style.getPropertyValue('pointer-events')) root.style.removeProperty('pointer-events');
        if (root.style.getPropertyValue('visibility')) root.style.removeProperty('visibility');
        return true;
    }
    if (!root.hidden) root.hidden = true;
    if (!root.classList.contains('hidden')) root.classList.add('hidden');
    if (!root.classList.contains('hide')) root.classList.add('hide');
    if (root.getAttribute('aria-hidden') !== 'true') root.setAttribute('aria-hidden', 'true');
    if (root.style.getPropertyValue('display') !== 'none' || root.style.getPropertyPriority('display') !== 'important') {
        root.style.setProperty('display', 'none', 'important');
    }
    if (root.style.getPropertyValue('pointer-events') !== 'none' || root.style.getPropertyPriority('pointer-events') !== 'important') {
        root.style.setProperty('pointer-events', 'none', 'important');
    }
    return true;
}

function restoreGradioComponentVisibility(rootOrId, options = {}) {
    const root = typeof rootOrId === 'string' ? getGradioRootById(rootOrId) : rootOrId;
    if (!root) return false;

    const nodes = [root];
    const button = root.matches?.('button') ? root : root.querySelector?.('button');
    if (button && button !== root) nodes.push(button);

    let changed = false;
    nodes.forEach((node) => {
        if (!node) return;
        const wasHidden = !!(
            node.hidden
            || node.hasAttribute?.('hidden')
            || node.getAttribute?.('aria-hidden') === 'true'
            || node.classList?.contains('hidden')
            || node.classList?.contains('hide')
            || node.classList?.contains('simpai-mounted-hidden')
            || node.style?.getPropertyValue('display')
            || node.style?.getPropertyValue('visibility')
            || node.style?.getPropertyValue('pointer-events')
        );
        try { if (node.hidden) node.hidden = false; } catch (e) {}
        try { if (node.hasAttribute('hidden')) node.removeAttribute('hidden'); } catch (e) {}
        try { if (node.hasAttribute('aria-hidden')) node.removeAttribute('aria-hidden'); } catch (e) {}
        try {
            ['hidden', 'hide', 'simpai-mounted-hidden', 'simpai-force-hidden'].forEach((name) => {
                if (node.classList.contains(name)) node.classList.remove(name);
            });
        } catch (e) {}
        try {
            ['display', 'visibility', 'pointer-events', 'opacity'].forEach((name) => {
                if (node.style.getPropertyValue(name)) node.style.removeProperty(name);
            });
        } catch (e) {}
        changed = changed || wasHidden;
    });

    if (button && options.interactive !== false) {
        if (button.disabled || button.getAttribute('aria-disabled') === 'true' || button.classList?.contains('disabled')) {
            changed = true;
        }
        if (button.disabled) button.disabled = false;
        if (button.getAttribute('aria-disabled') !== 'false') button.setAttribute('aria-disabled', 'false');
        if (button.classList?.contains('disabled')) button.classList.remove('disabled');
    }
    return changed;
}

function hideGenerateButtonWhenAlternateActionVisible(reason) {
    const generateRoot = getGradioRootById('generate_button');
    if (!elementIsVisible(generateRoot)) return false;

    const stopVisible = elementIsVisible(getGradioRootById('stop_button'));
    const skipVisible = elementIsVisible(getGradioRootById('skip_button'));
    const loadParameterVisible = elementIsVisible(getGradioRootById('load_parameter_button'));
    if (!stopVisible && !skipVisible && !loadParameterVisible) return false;

    const hidden = setGradioComponentVisible('generate_button', false);
    if (hidden) {
        try {
            simpaiUiTrace('info', '[UI-TRACE] generation_button.hidden_for_active_action', {
                reason: reason || '',
                stopVisible,
                skipVisible,
                loadParameterVisible,
            });
        } catch (e) {}
    }
    return hidden;
}

function reconcileGenerationActionButtons(reason) {
    const generateRoot = getGradioRootById('generate_button');
    if (!generateRoot) return false;
    const stopVisible = elementIsVisible(getGradioRootById('stop_button'));
    const skipVisible = elementIsVisible(getGradioRootById('skip_button'));
    const loadParameterVisible = elementIsVisible(getGradioRootById('load_parameter_button'));
    if (stopVisible || skipVisible || loadParameterVisible) {
        hideGenerateButtonWhenAlternateActionVisible(reason || 'reconcile');
        return false;
    }

    const changed = restoreGradioComponentVisibility(generateRoot, { interactive: true });
    if (changed) {
        try {
            simpaiUiTrace('info', '[UI-TRACE] generation_button.reconciled', { reason: reason || '' });
        } catch (e) {}
    }
    return changed;
}

window.simpleaiReconcileGenerationActionButtons = reconcileGenerationActionButtons;

function setGradioButtonInteractive(rootId, interactive) {
    const button = getGradioButtonById(rootId);
    if (!button) return false;
    const nextInteractive = !!interactive;
    const disabled = !nextInteractive;
    if (button.disabled !== disabled) button.disabled = disabled;
    if (button.getAttribute('aria-disabled') !== String(disabled)) {
        button.setAttribute('aria-disabled', String(disabled));
    }
    if (button.classList.contains('disabled') !== disabled) {
        button.classList.toggle('disabled', disabled);
    }
    return true;
}

function getGenerationProgressText() {
    const progressRoot = getGradioRootById('progress-bar')
        || gradioApp().querySelector('#progress_html, .progress-html, [data-testid="progress-bar"]');
    return String(progressRoot?.innerText || progressRoot?.textContent || '');
}

function generationProgressAllowsControlRestore() {
    const text = getGenerationProgressText();
    if (!text.trim()) return false;
    if (/Generation task queued|Preparing task|Loading models|排队|准备|加载模型/i.test(text)) return false;
    return /Task in progress|Sampling|ETA|采样|执行|生成中|%/i.test(text);
}

function restoreGenerationControlsAfterUnlock(reason) {
    const generateRoot = getGradioRootById('generate_button');
    const stopRoot = getGradioRootById('stop_button');
    const skipRoot = getGradioRootById('skip_button');
    if (!generateRoot || !stopRoot || !skipRoot) return false;

    const generateVisible = elementIsVisible(generateRoot);
    const stopVisible = elementIsVisible(stopRoot);
    const skipVisible = elementIsVisible(skipRoot);
    const loadParameterVisible = elementIsVisible(getGradioRootById('load_parameter_button'));
    if (generateVisible || loadParameterVisible || (!stopVisible && !skipVisible)) return false;
    if (!generationProgressAllowsControlRestore()) return false;

    const changed = [
        restoreGradioComponentVisibility(stopRoot, { interactive: true }),
        restoreGradioComponentVisibility(skipRoot, { interactive: true }),
    ].some(Boolean);
    if (changed) {
        try {
            simpaiUiTrace('info', '[UI-TRACE] generation_controls.restored_after_unlock', { reason: reason || '' });
        } catch (e) {}
    }
    return changed;
}

window.simpleaiRestoreGenerationControlsAfterUnlock = restoreGenerationControlsAfterUnlock;
onAfterUiUpdate(() => restoreGenerationControlsAfterUnlock('after_ui_update'));

function setGradioCheckboxValue(rootId, checked) {
    const input = getGradioCheckboxById(rootId);
    if (!input) return false;
    const nextChecked = !!checked;
    if (input.checked === nextChecked) return true;
    input.checked = nextChecked;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
}

function getPromptMetaSyncInputImageReady() {
    const root = getGradioRootById('scene_input_image1');
    if (!root || !elementIsVisible(root)) return false;
    const img = root.querySelector('img');
    if (img && (img.currentSrc || img.src) && img.naturalWidth > 0) {
        return true;
    }
    const video = root.querySelector('video');
    if (video && (video.currentSrc || video.src)) {
        return true;
    }
    return !!root.querySelector('button[aria-label*="Clear"], button[aria-label*="Remove"], [data-testid="remove-button"]');
}

function isSceneFrontendActiveForPromptMetaSync() {
    const params = window.simpleaiTopbarSystemParams;
    if (params && typeof params === 'object' && Object.prototype.hasOwnProperty.call(params, '__is_scene_frontend')) {
        return !!params.__is_scene_frontend;
    }
    if (document.documentElement?.classList?.contains('simpai-scene-frontend')) {
        return true;
    }
    return elementIsVisible(getGradioRootById('scene_panel'));
}

function isVlmEnabledForPromptMetaSync() {
    const input = getGradioCheckboxById('vlm_checkbox');
    return input ? !!input.checked : true;
}

function syncPositivePromptMetaState() {
    const promptInput = gradioApp().querySelector('#positive_prompt textarea, #positive_prompt [data-testid="textbox"]');
    if (!promptInput) return;

    if (elementIsVisible(getGradioRootById('skip_button')) || elementIsVisible(getGradioRootById('stop_button'))) {
        setGradioButtonInteractive('random_prompt_button', false);
        setGradioButtonInteractive('super_prompter_button', false);
        return;
    }

    const rawPrompt = String(promptInput.value || '');
    const hasPrompt = rawPrompt.length > 0;
    const promptToolsHasText = typeof window.simpleAIPromptToolsHasText === 'function'
        ? !!window.simpleAIPromptToolsHasText()
        : hasPrompt;
    const sceneFrontendActive = isSceneFrontendActiveForPromptMetaSync();

    setGradioButtonInteractive('random_prompt_button', true);
    if (typeof refreshSimpleAIPromptRecommendationButton === 'function') {
        try { refreshSimpleAIPromptRecommendationButton(); } catch (e) {}
    }
    if (typeof refreshSimpleAIPromptToolsButton === 'function') {
        try { refreshSimpleAIPromptToolsButton(); } catch (e) {}
    }
    setGradioButtonInteractive('super_prompter_button', promptToolsHasText);

    const sceneCanvasVisible = elementIsVisible(getGradioRootById('scene_canvas'));
    const shouldShowLoadParameters = !sceneFrontendActive && !hasPrompt && getPromptMetaSyncInputImageReady() && !sceneCanvasVisible;
    setGradioComponentVisible('generate_button', !shouldShowLoadParameters);
    setGradioComponentVisible('load_parameter_button', shouldShowLoadParameters);
    if (!shouldShowLoadParameters) {
        reconcileGenerationActionButtons('prompt_meta_sync');
    }
}

function initPositivePromptMetaSync() {
    const promptInput = gradioApp().querySelector('#positive_prompt textarea, #positive_prompt [data-testid="textbox"]');
    if (!promptInput) return;

    if (!promptInput.__simpleaiPromptMetaSyncBound) {
        const handleSync = () => {
            syncPositivePromptMetaState();
        };
        promptInput.addEventListener('input', handleSync);
        promptInput.addEventListener('change', handleSync);
        promptInput.addEventListener('blur', handleSync);
        promptInput.__simpleaiPromptMetaSyncBound = true;
    }

    requestAnimationFrame(syncPositivePromptMetaState);
}

onUiLoaded(initPositivePromptMetaSync);
onAfterUiUpdate(initPositivePromptMetaSync);

function initBatchPreviewGeneratingOverlay() {
    const statusIds = ["uov_batch_status", "enhance_batch_status", "scene_batch_status"];
    const statusSelector = statusIds.map((id) => `#${id}`).join(", ");
    const FALLBACK_SYNC_MS = 1500;
    let forcedTarget = null;
    let syncQueued = false;
    let fallbackTimer = 0;
    const observedStatusRoots = new WeakSet();
    const isRunningText = function(text) {
        if (!text) return false;
        const t = String(text).trim().toLowerCase();
        if (!t) return false;
        if (t.startsWith("batch finished")) return false;
        if (t.startsWith("batch stopped")) return false;
        if (t.includes("folder is empty")) return false;
        return true;
    };
    const getStatusValue = function(elemId) {
        const root = gradioApp().getElementById(elemId);
        if (!root) return "";
        const input = root.querySelector("textarea, input");
        return input ? (input.value || "") : "";
    };

    const findPreviewGeneratingTarget = function() {
        const preview = gradioApp().getElementById("preview_generating");
        if (!preview) return null;
        const component = preview.closest('[id^="component-"]');
        if (!component) return preview.parentElement || null;

        const candidates = Array.from(component.querySelectorAll(".wrap"));
        for (const el of candidates) {
            if (!el || !el.classList) continue;
            const cls = Array.from(el.classList);
            const hasSvelte = cls.some((c) => typeof c === "string" && c.startsWith("svelte-"));
            if (!hasSvelte) continue;
            const cs = window.getComputedStyle ? window.getComputedStyle(el) : null;
            const isOverlayLike = cs && (cs.position === "absolute" || cs.position === "fixed") && cs.pointerEvents === "none";
            if (isOverlayLike) {
                return el;
            }
        }

        return component;
    };

    if (!window.SimpleAI) {
        window.SimpleAI = {};
    }
    window.SimpleAI.findBatchPreviewGeneratingTarget = findPreviewGeneratingTarget;

    const syncGeneratingOverlay = function() {
        if (document.hidden) return;
        if (forcedTarget && !forcedTarget.isConnected) forcedTarget = null;
        const running = statusIds.some((id) => isRunningText(getStatusValue(id)));
        if (!running && !forcedTarget) return;
        const target = forcedTarget || findPreviewGeneratingTarget();
        if (!target || !target.classList) return;
        if (running) {
            if (target.dataset.simpleaiForcedGenerating !== "1") {
                target.dataset.simpleaiForcedGenerating = "1";
                target.dataset.simpleaiPrevHadHide = target.classList.contains("hide") ? "1" : "0";
                target.dataset.simpleaiPrevHadHidden = target.classList.contains("hidden") ? "1" : "0";
            }
            target.classList.remove("hide");
            target.classList.remove("hidden");
            target.classList.add("generating");
            forcedTarget = target;
        } else {
            if (target.dataset.simpleaiForcedGenerating === "1") {
                const restoreHide = target.dataset.simpleaiPrevHadHide === "1";
                const restoreHidden = target.dataset.simpleaiPrevHadHidden === "1";
                target.dataset.simpleaiForcedGenerating = "";
                target.dataset.simpleaiPrevHadHide = "";
                target.dataset.simpleaiPrevHadHidden = "";
                target.classList.remove("generating");
                if (restoreHide) target.classList.add("hide");
                if (restoreHidden) target.classList.add("hidden");
            }
            forcedTarget = null;
        }
    };

    const scheduleSync = function() {
        if (syncQueued || document.hidden) return;
        syncQueued = true;
        requestAnimationFrame(() => {
            syncQueued = false;
            syncGeneratingOverlay();
        });
    };

    const statusObserver = new MutationObserver(scheduleSync);
    const observeStatusRoots = function() {
        statusIds.forEach((id) => {
            const root = gradioApp().getElementById(id);
            if (!root || observedStatusRoots.has(root)) return;
            observedStatusRoots.add(root);
            statusObserver.observe(root, {
                attributes: true,
                childList: true,
                subtree: true,
                characterData: true,
                attributeFilter: ["value", "class", "hidden", "style"]
            });
        });
    };

    const scheduleFallback = function(delay = FALLBACK_SYNC_MS) {
        if (document.hidden || fallbackTimer) return;
        fallbackTimer = window.setTimeout(() => {
            fallbackTimer = 0;
            observeStatusRoots();
            syncGeneratingOverlay();
            scheduleFallback();
        }, delay);
    };

    const handleStatusInput = function(event) {
        if (!event.target?.closest?.(statusSelector)) return;
        scheduleSync();
    };
    document.addEventListener("input", handleStatusInput, true);
    document.addEventListener("change", handleStatusInput, true);
    document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
            if (fallbackTimer) window.clearTimeout(fallbackTimer);
            fallbackTimer = 0;
            return;
        }
        observeStatusRoots();
        syncGeneratingOverlay();
        scheduleFallback();
    });
    observeStatusRoots();
    syncGeneratingOverlay();
    scheduleFallback();
}
const style = document.createElement('style');
style.textContent = `
@keyframes flash {
    0% { box-shadow: inset 0 0 0 3px rgba(0, 150, 255, 0.5); }
    50% { box-shadow: inset 0 0 0 4px rgba(0, 150, 255, 0.75); }
    100% { box-shadow: inset 0 0 0 0px rgba(0, 150, 255, 0); }
}
.flash-border {
    animation: flash 3s ease-in-out;
    position: relative;
    z-index: 3;
    pointer-events: none;
    overflow: visible !important;
}.style-button.disable-hover {
    transform: scale(1) !important;
    transition: none !important;
}`;
document.head.appendChild(style);
function handleStyleData(dataInput, e) {
    const targetElement = e.target.closest('.style_item, .style_selections label');
    if (targetElement) {
        targetElement.classList.add('flash-border');
        setTimeout(() => {
            targetElement.classList.remove('flash-border');
        }, 3000);
    }
    try {
        const styleData = JSON.parse(dataInput.value || '{}');
        const positivePrompt = gradioApp().querySelector('#positive_prompt textarea');
        const negativePrompt = gradioApp().querySelector('#negative_prompt textarea');

        if (styleData.prompt && positivePrompt) {
            const currentPrompt = (positivePrompt.value || '').trim();
            positivePrompt.value = styleData.prompt.replace('{prompt}', currentPrompt);
            positivePrompt.dispatchEvent(new Event('input', { bubbles: true }));
        }

        if (styleData.negative_prompt && negativePrompt) {
            negativePrompt.value += styleData.negative_prompt;
            negativePrompt.dispatchEvent(new Event('input', { bubbles: true }));
        }

        e.stopPropagation();
    } catch (error) {
        console.error('Error handling style click:', error);
    }
}

/**
 * checks that a UI element is not in another hidden element or tab content
 */
function uiElementIsVisible(el) {
    if (el === document) {
        return true;
    }

    const computedStyle = getComputedStyle(el);
    const isVisible = computedStyle.display !== 'none';

    if (!isVisible) return false;
    return uiElementIsVisible(el.parentNode);
}

function uiElementInSight(el) {
    const clRect = el.getBoundingClientRect();
    const windowHeight = window.innerHeight;
    const isOnScreen = clRect.bottom > 0 && clRect.top < windowHeight;

    return isOnScreen;
}

function playNotification() {
    gradioApp().querySelector('#audio_notification audio')?.play();
}

function set_theme(theme) {
    var gradioURL = window.location.href;
    if (!gradioURL.includes('?__theme=')) {
        window.location.replace(gradioURL + '?__theme=' + theme);
    }
}

function htmlDecode(input) {
  var doc = new DOMParser().parseFromString(input, "text/html");
  return doc.documentElement.textContent;
}

(function() {
    if (simpleaiDisableHoverPreviewsForInput()) return;
    let previewOverlay = null;
    let activePreviewFolder = null;
    let autoHideTimer = null;
    let previewRequestId = 0;
    const modelPreviewCache = {};
    const previewDropdownSelector = '#model_dropdown_base, #model_dropdown_refiner, #model_dropdown_clip, #model_dropdown_vae, #model_dropdown_upscale, [id^="lora_dropdown"], [id^="scene_lora_dropdown"], .simpai-models-js-select, [data-simpai-browser-target]';
    const optionSelector = 'li.item[role="button"], li[role="option"], [role="option"], .dropdown-options li, .options li, li.item';

    function createPreviewOverlay() {
        if (previewOverlay) return previewOverlay;
        previewOverlay = document.createElement('div');
        previewOverlay.className = 'preview-tooltip model-preview-tooltip';
        Object.assign(previewOverlay.style, {
            position: 'fixed',
            display: 'block',
            pointerEvents: 'none',
            zIndex: 2147483647,
            maxWidth: '320px',
            borderRadius: '8px',
            overflow: 'hidden',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            transition: 'opacity 0.2s',
            opacity: 0
        });
        document.body.appendChild(previewOverlay);
        return previewOverlay;
    }

    function hidePreview(delay = 0) {
        if (autoHideTimer) clearTimeout(autoHideTimer);
        const requestId = delay > 0 ? previewRequestId : ++previewRequestId;
        autoHideTimer = setTimeout(() => {
            if (requestId !== previewRequestId) return;
            if (previewOverlay) previewOverlay.style.opacity = '0';
        }, delay);
    }

    function beginPreviewRequest() {
        if (autoHideTimer) clearTimeout(autoHideTimer);
        previewRequestId += 1;
        return previewRequestId;
    }

    function closestPreviewDropdown(target) {
        if (!target || !target.closest) return null;
        return target.closest(previewDropdownSelector);
    }

    function getPreviewFolderForDropdown(dropdown) {
        if (!dropdown) return null;
        const target = dropdown.dataset?.simpaiBrowserTarget;
        if (target === 'base' || target === 'refiner') return 'checkpoints';
        if (target === 'clip') return 'clip';
        if (target === 'vae') return 'vae';
        if (target === 'upscale') return 'upscale_models';
        if (target === 'lora') return 'loras';
        if (!dropdown.id) return null;
        if (dropdown.id === 'model_dropdown_base' || dropdown.id === 'model_dropdown_refiner') return 'checkpoints';
        if (dropdown.id === 'model_dropdown_clip') return 'clip';
        if (dropdown.id === 'model_dropdown_vae') return 'vae';
        if (dropdown.id === 'model_dropdown_upscale') return 'upscale_models';
        if (dropdown.id.startsWith('lora_dropdown') || dropdown.id.startsWith('scene_lora_dropdown')) return 'loras';
        return null;
    }

    function getPreviewTypeForFolder(folder) {
        if (folder === 'loras') return 'lora';
        if (folder === 'upscale_models') return 'upscale';
        if (folder === 'clip') return 'clip';
        if (folder === 'vae') return 'vae';
        return 'base';
    }

    function rememberPreviewDropdown(dropdown) {
        const folder = getPreviewFolderForDropdown(dropdown);
        if (!folder) return;
        activePreviewFolder = folder;
        createPreviewOverlay();
    }

    function getDropdownOption(target) {
        if (!target || !target.closest) return null;
        return target.closest(optionSelector);
    }

    function getOptionValue(option) {
        if (!option) return '';
        const raw = option.dataset?.simpaiSelectOptionValue
            || option.dataset?.value
            || option.getAttribute('data-value')
            || option.getAttribute('aria-label')
            || option.textContent
            || '';
        return String(raw).replace(/\s+/g, ' ').trim();
    }

    function getDropdownCurrentValue(dropdown) {
        if (!dropdown) return '';
        if (dropdown.matches?.('input, textarea')) return String(dropdown.value || '').trim();
        const nativeSelect = dropdown.matches?.('select') ? dropdown : dropdown.querySelector?.('select');
        if (nativeSelect) return String(nativeSelect.value || nativeSelect.selectedOptions?.[0]?.textContent || '').trim();

        const input = dropdown.querySelector?.('input[role="combobox"], input, textarea');
        if (input && String(input.value || '').trim()) return String(input.value || '').trim();

        const selected = dropdown.querySelector?.('[aria-selected="true"], .selected, .item.selected, [data-selected="true"]');
        if (selected && String(selected.textContent || '').trim()) return String(selected.textContent || '').replace(/\s+/g, ' ').trim();

        const valueNodes = [
            '.single-select',
            '.dropdown-single',
            '.wrap-inner',
            '[data-testid="textbox"]',
            '[role="combobox"]'
        ];
        for (const selector of valueNodes) {
            const node = dropdown.querySelector?.(selector);
            const value = String(node?.textContent || '').replace(/\s+/g, ' ').trim();
            if (value) return value;
        }
        return '';
    }

    function normalizePreviewModelPath(value) {
        const normalized = String(value || '').replace(/\\/g, '/').replace(/^\/+/, '').trim();
        if (!normalized) return '';
        const parts = normalized.split('/').filter(Boolean);
        if (!parts.length) return '';
        parts[parts.length - 1] = parts[parts.length - 1].replace(/\.[^/.]+$/, '');
        return parts.join('/');
    }

    function positionPreviewOverlayNearElement(element) {
        if (!element) return;
        const overlay = createPreviewOverlay();
        const rect = element.getBoundingClientRect();
        const gap = 12;
        const previewWidth = Math.max(150, Math.min(180, overlay.offsetWidth || 170));
        const previewHeight = Math.max(160, Math.min(240, overlay.offsetHeight || 190));
        const maxLeft = Math.max(8, window.innerWidth - previewWidth - 8);
        const maxTop = Math.max(8, window.innerHeight - previewHeight - 8);
        let left = rect.right + gap;
        if (left > maxLeft) left = rect.left - previewWidth - gap;
        overlay.style.left = `${Math.min(maxLeft, Math.max(8, left))}px`;
        overlay.style.top = `${Math.min(maxTop, Math.max(8, rect.top))}px`;
    }

    function renderPreviewImage(src, requestId = previewRequestId) {
        if (requestId !== previewRequestId) return;
        const overlay = createPreviewOverlay();
        const img = new Image();
        img.style.maxWidth = '150px';
        img.style.display = 'block';
        overlay.innerHTML = '';
        overlay.appendChild(img);
        overlay.style.opacity = '1';
        img.onerror = () => {
            if (requestId !== previewRequestId) return;
            overlay.style.opacity = '0';
        };
        img.onload = () => {
            if (requestId !== previewRequestId) return;
            overlay.style.opacity = '1';
        };
        img.src = src;
    }

    async function fetchModelBrowserPreview(type, name) {
        const response = await fetch('/model-browser/detail', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, name })
        });
        if (!response.ok) return '';
        const data = await response.json().catch(() => null);
        return String(data?.item?.preview_url || '');
    }

    function handlePreviewValueHover(value, folder = activePreviewFolder) {
        if (!folder) return;
        const requestId = beginPreviewRequest();
        const modelPath = normalizePreviewModelPath(value);
        if (!modelPath || modelPath.toLowerCase() === 'none') {
            hidePreview();
            return;
        }

        if (!modelPreviewCache[folder]) modelPreviewCache[folder] = {};
        const folderCache = modelPreviewCache[folder];
        const type = getPreviewTypeForFolder(folder);
        const cacheKey = `${type}:${modelPath}`;
        const cached = folderCache[cacheKey];
        if (cached) {
            renderPreviewImage(cached.url || '/file=presets/samples/noimage.jpg', requestId);
            return;
        }

        fetchModelBrowserPreview(type, value)
            .then((url) => {
                if (requestId !== previewRequestId) return;
                folderCache[cacheKey] = { url, timestamp: Date.now() };
                renderPreviewImage(url || '/file=presets/samples/noimage.jpg', requestId);
            })
            .catch(() => {
                if (requestId !== previewRequestId) return;
                folderCache[cacheKey] = { url: '', timestamp: Date.now() };
                renderPreviewImage('/file=presets/samples/noimage.jpg', requestId);
            });
    }

    function handlePreviewOptionHover(option) {
        handlePreviewValueHover(getOptionValue(option));
    }

    function handlePreviewDropdownHover(dropdown) {
        const folder = getPreviewFolderForDropdown(dropdown);
        if (!folder) return;
        activePreviewFolder = folder;
        positionPreviewOverlayNearElement(dropdown);
        handlePreviewValueHover(getDropdownCurrentValue(dropdown), folder);
    }

    document.addEventListener('pointerdown', (event) => {
        const dropdown = closestPreviewDropdown(event.target);
        if (dropdown) {
            rememberPreviewDropdown(dropdown);
        } else if (!getDropdownOption(event.target)) {
            activePreviewFolder = null;
            hidePreview();
        }
    }, true);

    document.addEventListener('click', (event) => {
        if (event.isTrusted === false) return;
        if (event.target?.closest?.('#models_js_apply_trigger, .browser-trigger-proxy, .sai-gradio-hidden-bridge')) return;
        const option = getDropdownOption(event.target);
        if (option) {
            hidePreview();
            return;
        }
        if (!closestPreviewDropdown(event.target)) {
            activePreviewFolder = null;
            hidePreview();
        }
    }, true);

    document.addEventListener('focusin', (event) => {
        const dropdown = closestPreviewDropdown(event.target);
        if (dropdown) {
            rememberPreviewDropdown(dropdown);
            handlePreviewDropdownHover(dropdown);
        }
    }, true);

    document.addEventListener('change', (event) => {
        const dropdown = closestPreviewDropdown(event.target);
        if (!dropdown) return;
        rememberPreviewDropdown(dropdown);
        handlePreviewDropdownHover(dropdown);
        hidePreview(1600);
    }, true);

    document.addEventListener('input', (event) => {
        const dropdown = closestPreviewDropdown(event.target);
        if (!dropdown || !dropdown.matches?.('select')) return;
        rememberPreviewDropdown(dropdown);
        handlePreviewDropdownHover(dropdown);
        hidePreview(2200);
    }, true);

    document.addEventListener('simpai:models-select-option-hover', (event) => {
        const detail = event.detail || {};
        const dropdown = detail.select;
        const option = detail.option;
        const value = String(detail.value || '').trim();
        const folder = getPreviewFolderForDropdown(dropdown);
        if (!dropdown || !folder || !value) return;
        activePreviewFolder = folder;
        positionPreviewOverlayNearElement(option || dropdown);
        handlePreviewValueHover(value, folder);
    });

    document.addEventListener('simpai:models-select-menu-close', () => {
        hidePreview(120);
    });

    document.addEventListener('mouseover', (event) => {
        const dropdown = closestPreviewDropdown(event.target);
        if (dropdown) rememberPreviewDropdown(dropdown);
        const option = getDropdownOption(event.target);
        if (autoHideTimer) clearTimeout(autoHideTimer);
        if (option) {
            handlePreviewOptionHover(option);
            return;
        }
        if (dropdown) handlePreviewDropdownHover(dropdown);
        if (!dropdown && !option) {
            activePreviewFolder = null;
            hidePreview();
        }
    }, true);

    document.addEventListener('mousemove', (event) => {
        if (!previewOverlay || previewOverlay.style.opacity === '0') return;
        previewOverlay.style.left = `${event.clientX + 15}px`;
        previewOverlay.style.top = `${event.clientY + 15}px`;
    }, true);

    document.addEventListener('mouseout', (event) => {
        const option = getDropdownOption(event.target);
        const dropdown = closestPreviewDropdown(event.target);
        if (option) {
            if (!event.relatedTarget || (!getDropdownOption(event.relatedTarget) && !closestPreviewDropdown(event.relatedTarget))) {
                hidePreview();
            }
            return;
        }
        if (dropdown && (!event.relatedTarget || (!dropdown.contains(event.relatedTarget) && !getDropdownOption(event.relatedTarget)))) {
            hidePreview();
        }
    }, true);
})();

(function() {
    function modelBrowserText(en, cn) {
        return window.SimpAII18n?.t ? window.SimpAII18n.t(en, cn) : (cn || en);
    }

    const staticBrowserTargets = [
        { dropdownId: 'model_dropdown_base', triggerId: 'model_browser_trigger_base', title: () => modelBrowserText('Browse Base Model', '浏览基础模型') },
        { dropdownId: 'model_dropdown_refiner', triggerId: 'model_browser_trigger_refiner', title: () => modelBrowserText('Browse Refiner Model', '浏览精修模型') },
        { dropdownId: 'model_dropdown_clip', triggerId: 'model_browser_trigger_clip', title: () => modelBrowserText('Browse CLIP / Text Encoder', '浏览 CLIP / 文本编码器') },
        { dropdownId: 'model_dropdown_vae', triggerId: 'model_browser_trigger_vae', title: () => modelBrowserText('Browse VAE', '浏览 VAE') },
        { dropdownId: 'model_dropdown_upscale', triggerId: 'model_browser_trigger_upscale', title: () => modelBrowserText('Browse Upscale Model', '浏览放大模型') }
    ];

    function getModelBrowserTargets() {
        const targets = staticBrowserTargets.slice();
        gradioApp().querySelectorAll('[id^="lora_dropdown_"]').forEach((dropdown) => {
            const match = dropdown.id.match(/^lora_dropdown_(\d+)$/);
            if (!match) return;
            targets.push({
                dropdownId: dropdown.id,
                triggerId: `lora_preview_btn_${match[1]}`,
                title: () => `${modelBrowserText('Browse LoRA', '浏览 LoRA')} ${Number(match[1]) + 1}`
            });
        });
        return targets;
    }

    function dispatchBrowserTrigger(triggerId) {
        const target = getModelBrowserTargets().find((item) => item.triggerId === triggerId);
        const openSharedBrowser = () => {
            if (!target || !window.SimpAIModelBrowser?.openForDropdown) return false;
            try {
                window.SimpAIModelBrowser.openForDropdown(Object.assign({}, target, {
                    title: typeof target.title === 'function' ? target.title() : target.title
                }));
                return true;
            } catch (err) {
                console.warn('Shared model browser failed, falling back to Gradio browser.', err);
                return false;
            }
        };
        const clickFallback = () => {
            const trigger = gradioApp().querySelector(`#${triggerId}`);
            if (!trigger) {
                console.warn(`Missing browser trigger: ${triggerId}`);
                return;
            }
            trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        };
        if (openSharedBrowser()) {
            return;
        }
        if (target && window.loadSimpleAILazyAssetGroup) {
            window.loadSimpleAILazyAssetGroup('modelBrowser')
                .then((ok) => {
                    if (!ok) {
                        window.simpleaiShowLazyAssetLoadMessage?.('modelBrowser');
                        clickFallback();
                        return;
                    }
                    if (!openSharedBrowser()) clickFallback();
                })
                .catch((err) => {
                    console.warn('Shared model browser lazy load failed, falling back to Gradio browser.', err);
                    window.simpleaiShowLazyAssetLoadMessage?.('modelBrowser');
                    clickFallback();
                });
            return;
        }
        clickFallback();
    }

    function mountBrowserTrigger(target) {
        const dropdown = gradioApp().getElementById(target.dropdownId);
        if (!dropdown) return;

        dropdown.classList.add('has-model-browser-trigger');
        if (dropdown.querySelector(`.model-browser-overlay-trigger[data-trigger-id="${target.triggerId}"]`)) {
            return;
        }

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'model-browser-overlay-trigger';
        button.dataset.triggerId = target.triggerId;
        button.title = typeof target.title === 'function' ? target.title() : target.title;
        button.textContent = '...';
        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            dispatchBrowserTrigger(target.triggerId);
        });
        dropdown.appendChild(button);
    }

    function isVisibleElement(el) {
        if (!el || el.hidden) return false;
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    }

    function syncModelsGridRefinerLayout() {
        const root = gradioApp();
        if (!root) return;
        const base = root.getElementById('model_dropdown_base');
        const grid = base?.closest?.('.models-grid');
        if (!grid) return;
        if (document.documentElement.classList.contains('simpai-hide-refiner-model')) {
            grid.classList.add('models-refiner-hidden');
            return;
        }
        const refiner = root.getElementById('model_dropdown_refiner');
        const refinerHidden = !isVisibleElement(refiner);
        if (grid.classList.contains('models-refiner-hidden') !== refinerHidden) {
            grid.classList.toggle('models-refiner-hidden', refinerHidden);
        }
    }

    function refreshBrowserTriggers() {
        getModelBrowserTargets().forEach(mountBrowserTrigger);
        syncModelsGridRefinerLayout();
    }

    let browserTriggerRefreshQueued = false;
    function scheduleBrowserTriggerRefresh() {
        if (browserTriggerRefreshQueued) return;
        browserTriggerRefreshQueued = true;
        requestAnimationFrame(() => {
            browserTriggerRefreshQueued = false;
            refreshBrowserTriggers();
        });
    }

    function initBrowserTriggers() {
        const root = gradioApp();
        if (!root) {
            setTimeout(initBrowserTriggers, 300);
            return;
        }
        refreshBrowserTriggers();
        const observer = new MutationObserver(() => {
            scheduleBrowserTriggerRefresh();
        });
        observer.observe(root, { childList: true, subtree: true });
        setInterval(syncModelsGridRefinerLayout, 1000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initBrowserTriggers);
    } else {
        initBrowserTriggers();
    }
})();

function initTranslationPreview() {
    let retryCount = 0;

    function tryBind() {
        const accordionElement = getTranslationPreviewAccordion();
        if (!accordionElement) return false;
        if (accordionElement.dataset.translationPreviewBound === 'true') {
            syncTranslationPreviewOpenState(false);
            return true;
        }

        accordionElement.dataset.translationPreviewBound = 'true';
        const details = accordionElement.matches?.('details') ? accordionElement : accordionElement.querySelector('details');
        const header = getTranslationPreviewHeader(accordionElement);
        const syncAfterToggle = () => setTimeout(() => syncTranslationPreviewOpenState(true), 0);

        if (details) {
            details.addEventListener('toggle', syncAfterToggle);
        }
        if (header) {
            header.addEventListener('click', syncAfterToggle);
        }
        syncTranslationPreviewOpenState(false);
        return true;
    }

    const retryTimer = setInterval(() => {
        retryCount += 1;
        if (tryBind()) {
            clearInterval(retryTimer);
            return;
        }
        if (retryCount >= 20) {
            clearInterval(retryTimer);
            console.warn('translation preview accordion not found');
        }
    }, 500);

    tryBind();
    onAfterUiUpdate(tryBind);
}

function getTranslationPreviewAccordion() {
    return gradioApp().getElementById('translation_preview_accordion') || document.getElementById('translation_preview_accordion');
}

function getTranslationPreviewHeader(accordionElement) {
    return accordionElement?.querySelector('summary, button[aria-expanded], .label-wrap, [role="button"]') || null;
}

function isTranslationPreviewAccordionOpen(accordionElement = getTranslationPreviewAccordion()) {
    if (!accordionElement) return false;

    const details = accordionElement.matches?.('details') ? accordionElement : accordionElement.querySelector('details');
    if (details) return !!details.open;

    const ariaNode = accordionElement.matches?.('[aria-expanded]')
        ? accordionElement
        : accordionElement.querySelector('[aria-expanded]');
    const ariaValue = ariaNode?.getAttribute('aria-expanded');
    if (ariaValue === 'true') return true;
    if (ariaValue === 'false') return false;

    const header = getTranslationPreviewHeader(accordionElement);
    if (header?.classList?.contains('open')) return true;
    if (header?.classList?.contains('closed')) return false;

    const preview = accordionElement.querySelector('.translation-preview');
    if (!preview) return false;
    return !!(preview.offsetParent || preview.getClientRects().length);
}

function getTranslationPreviewOpenCheckbox() {
    const container = gradioApp().getElementById('translation_preview_open') || document.getElementById('translation_preview_open');
    if (!container) return null;
    if (container.matches?.('input[type="checkbox"]')) return container;
    return container.querySelector('input[type="checkbox"]');
}

function setTranslationPreviewOpenCheckbox(isOpen) {
    const checkbox = getTranslationPreviewOpenCheckbox();
    if (!checkbox) return false;
    const nextValue = !!isOpen;
    if (checkbox.checked !== nextValue) {
        checkbox.checked = nextValue;
        checkbox.dispatchEvent(new Event('input', { bubbles: true }));
        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return true;
}

function clickTranslationPreviewTrigger() {
    const container = gradioApp().getElementById('trigger_translation_btn') || document.getElementById('trigger_translation_btn');
    if (!container) return false;
    const button = container.matches?.('button') ? container : container.querySelector('button');
    if (!button) return false;
    button.click();
    return true;
}

function syncTranslationPreviewOpenState(shouldTrigger) {
    const isOpen = isTranslationPreviewAccordionOpen();
    setTranslationPreviewOpenCheckbox(isOpen);
    if (isOpen && shouldTrigger) {
        setTimeout(clickTranslationPreviewTrigger, 20);
    }
    return isOpen;
}

onUiLoaded(initTranslationPreview);

function setupAutoTranslate() {
    let retryCount = 0;

    function tryBind() {
        const promptContainer = gradioApp().getElementById('positive_prompt');
        const promptInput = promptContainer?.querySelector('textarea, input, [data-testid="textbox"]');
        const translateBtn = gradioApp().getElementById('trigger_translation_btn') || document.getElementById('trigger_translation_btn');

        if (!promptInput || !translateBtn) return false;
        if (promptInput.dataset.translationPreviewAutoBound === 'true') return true;
        promptInput.dataset.translationPreviewAutoBound = 'true';

        let timer = null;
        let lastContent = '';

        const trigger = () => {
            const currentContent = promptInput.value;
            if (currentContent === lastContent) return;
            if (!syncTranslationPreviewOpenState(false)) return;
            setTimeout(() => {
                if (isTranslationPreviewAccordionOpen() && clickTranslationPreviewTrigger()) {
                    lastContent = currentContent;
                }
            }, 20);
        };

        const handleInput = () => {
            const currentContent = promptInput.value;
            if (currentContent === lastContent) return;
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
                trigger();
            }, 1000);
        };

        const handleBlur = () => {
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
            trigger();
        };

        let lastManualCheck = promptInput.value;
        setInterval(() => {
            if (promptInput.value !== lastManualCheck) {
                lastManualCheck = promptInput.value;
                handleInput();
            }
        }, 1500);

        promptInput.addEventListener('input', handleInput);
        promptInput.addEventListener('blur', handleBlur);
        return true;
    }

    const retryTimer = setInterval(() => {
        retryCount += 1;
        if (tryBind()) {
            clearInterval(retryTimer);
            return;
        }
        if (retryCount >= 20) {
            clearInterval(retryTimer);
        }
    }, 500);

    tryBind();
}

onUiLoaded(setupAutoTranslate);

function setupSam3AutoTranslate() {
    let retryCount = 0;

    function tryBind() {
        const promptContainer = gradioApp().getElementById('sam3_prompt_text');
        const promptInput = promptContainer?.querySelector('textarea, input');
        const translateBtn = gradioApp().getElementById('sam3_trigger_translate_btn');

        if (!promptInput || !translateBtn) {
            return false;
        }

        let timer = null;
        let lastContent = '';

        const trigger = () => {
            const currentContent = promptInput.value;
            if (currentContent === lastContent) return;
            translateBtn.click();
            lastContent = currentContent;
        };

        const handleInput = () => {
            const currentContent = promptInput.value;
            if (currentContent === lastContent) return;
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
                trigger();
            }, 500);
        };

        const handleBlur = () => {
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
            trigger();
        };

        let lastManualCheck = promptInput.value;
        setInterval(() => {
            if (promptInput.value !== lastManualCheck) {
                lastManualCheck = promptInput.value;
                handleInput();
            }
        }, 1500);

        promptInput.addEventListener('input', handleInput);
        promptInput.addEventListener('blur', handleBlur);
        return true;
    }

    const retryTimer = setInterval(() => {
        retryCount += 1;
        if (tryBind()) {
            clearInterval(retryTimer);
            return;
        }
        if (retryCount >= 20) {
            clearInterval(retryTimer);
        }
    }, 1500);
}

onUiLoaded(setupSam3AutoTranslate);

function _ro_getSliderValue(elemId) {
    const root = gradioApp().getElementById(elemId);
    if (!root) {
        console.warn('[ResolutionOverride] missing control for read:', elemId);
        return null;
    }
    const numberInput = root.querySelector('input[type="number"]');
    const rangeInput = root.querySelector('input[type="range"]');
    const raw = (numberInput?.value ?? rangeInput?.value);
    const v = parseInt(raw, 10);
    return Number.isFinite(v) ? v : null;
}

function _ro_setSliderValue(elemId, value, options = {}) {
    const root = gradioApp().getElementById(elemId);
    if (!root) {
        console.warn('[ResolutionOverride] missing control for write:', elemId, value);
        return false;
    }
    const commit = options.commit !== false;
    const numberInput = root.querySelector('input[type="number"]');
    const rangeInput = root.querySelector('input[type="range"]');
    const v = String(value);
    if (
        (!rangeInput || rangeInput.value === v)
        && (!numberInput || numberInput.value === v)
    ) {
        return true;
    }
    if (rangeInput) {
        rangeInput.value = v;
        rangeInput.dispatchEvent(new Event('input', { bubbles: true }));
        if (commit) rangeInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (numberInput) {
        numberInput.value = v;
        numberInput.dispatchEvent(new Event('input', { bubbles: true }));
        if (commit) numberInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return true;
}

function _rc_getRoot(elemId) {
    return gradioApp().getElementById(elemId) || document.getElementById(elemId);
}

function _rc_getResolutionWidgets() {
    const seen = new Set();
    const widgets = [];
    const collect = (root) => {
        if (!root || !root.querySelectorAll) return;
        for (const widget of Array.from(root.querySelectorAll('.simpai-resolution-control'))) {
            if (!widget || seen.has(widget)) continue;
            seen.add(widget);
            widgets.push(widget);
        }
    };
    collect(gradioApp());
    collect(document);
    return widgets;
}

function _rc_isVisibleNode(node) {
    if (!node) return false;
    try {
        const style = window.getComputedStyle(node);
        if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
    } catch (e) {}
    try {
        return !!(node.offsetParent || node.getClientRects().length);
    } catch (e) {
        return false;
    }
}

function _rc_isGenerationUiActive() {
    const app = typeof gradioApp === 'function' ? gradioApp() : document;
    const find = (id) => {
        try { return app && app.getElementById ? app.getElementById(id) : null; } catch (e) { return null; }
    };
    return (
        _rc_isVisibleNode(find('stop_button'))
        || _rc_isVisibleNode(find('skip_button'))
        || _rc_isVisibleNode(find('progress-bar'))
    );
}

function _rc_scheduleResolutionControlIdleSync() {
    window.clearTimeout(window.__rc_resolution_generation_idle_timer);
    window.__rc_resolution_generation_idle_timer = window.setTimeout(() => {
        if (_rc_isGenerationUiActive()) {
            _rc_scheduleResolutionControlIdleSync();
            return;
        }
        initResolutionControlWidgets({ force: true });
        syncResolutionControlWidgets({ force: true });
    }, 700);
}

function _rc_targetIsObservedSource(widget, target) {
    if (!widget || !target || !target.tagName) return false;
    const ids = widget.__rc_observed_source_ids || new Set(['scene_canvas', 'scene_input_image1', 'scene_video', 'sam3_input_video']);
    for (const id of ids) {
        const root = _rc_getRoot(id);
        if (root && (root === target || root.contains(target))) return true;
    }
    return false;
}

function _rc_getCurrentSceneFlag() {
    const params = window.simpleaiTopbarSystemParams
        || (typeof topbarLastSystemParams !== 'undefined' ? topbarLastSystemParams : null);
    return !!(params && typeof params === 'object' && params.__is_scene_frontend);
}

function _rc_getResolutionAccordionDefaultKey() {
    const params = window.simpleaiTopbarSystemParams
        || (typeof topbarLastSystemParams !== 'undefined' ? topbarLastSystemParams : null)
        || {};
    return JSON.stringify({
        preset: params.__preset || "",
        theme: params.__scene_theme || "",
        isScene: !!params.__is_scene_frontend,
    });
}

function _rc_applyResolutionAccordionDefaultOpen(shouldOpen, force = false) {
    const key = _rc_getResolutionAccordionDefaultKey();
    if (!force && window.__rc_resolution_default_open_key === key) {
        return false;
    }
    const applied = _rc_syncResolutionAccordionShellOpen(shouldOpen);
    if (applied) {
        window.__rc_resolution_default_open_key = key;
        window.__rc_resolution_should_open = !!shouldOpen;
    }
    return applied;
}

function _rc_syncResolutionAccordionShellOpen(shouldOpen) {
    const accordion = _rc_getRoot('aspect_ratios_accordion');
    if (!accordion) return false;

    const details = accordion.matches('details') ? accordion : accordion.querySelector('details');
    if (details) {
        details.open = !!shouldOpen;
        try { details.dispatchEvent(new Event('toggle', { bubbles: true })); } catch (e) {}
        return true;
    }

    const header = accordion.querySelector('summary, button[aria-expanded], .label-wrap, [role="button"]');
    if (!header) return false;

    const headerShell = header.closest?.('summary, button, .label-wrap, [role="button"]') || header;
    const findContent = () => {
        const controlsId = header.getAttribute?.('aria-controls') || header.querySelector?.('[aria-controls]')?.getAttribute('aria-controls');
        if (controlsId) {
            const controlled = document.getElementById(controlsId) || gradioApp().getElementById?.(controlsId);
            if (controlled) return controlled;
        }
        const widget = accordion.querySelector('.simpai-resolution-control');
        if (widget) {
            const direct = Array.from(accordion.children || []).find((child) => child.contains(widget) && child !== headerShell);
            if (direct) return direct;
        }
        const sibling = headerShell.nextElementSibling;
        if (sibling) return sibling;
        return Array.from(accordion.children || []).find((child) => child !== headerShell) || null;
    };
    const ariaNode = header.hasAttribute('aria-expanded') ? header : header.querySelector('[aria-expanded]');
    const aria = ariaNode ? ariaNode.getAttribute('aria-expanded') : null;
    const content = findContent();
    let isOpen = null;
    if (aria === 'true' || aria === 'false') {
        isOpen = aria === 'true';
    } else if (header.classList && header.classList.contains('open')) {
        isOpen = true;
    } else if (header.classList && header.classList.contains('closed')) {
        isOpen = false;
    } else {
        if (content) {
            const style = getComputedStyle(content);
            isOpen = style.display !== 'none' && style.visibility !== 'hidden';
        }
    }

    if (isOpen === null) {
        if (shouldOpen) header.click();
    } else if (isOpen !== !!shouldOpen) {
        header.click();
    }
    if (ariaNode) ariaNode.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
    header.classList?.toggle('open', !!shouldOpen);
    header.classList?.toggle('closed', !shouldOpen);
    if (content) {
        content.hidden = false;
        try { content.removeAttribute('hidden'); } catch (e) {}
        content.style.display = shouldOpen ? '' : 'none';
    }
    return true;
}

function _rc_getTextValue(elemId) {
    const root = _rc_getRoot(elemId);
    const input = root ? root.querySelector('textarea, input[type="text"], input:not([type])') : null;
    return input ? (input.value || "") : "";
}

function _rc_setTextValue(elemId, value, commit = true) {
    const root = _rc_getRoot(elemId);
    const input = root ? root.querySelector('textarea, input[type="text"], input:not([type])') : null;
    if (!input) return false;
    const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
    const nextValue = value == null ? "" : String(value);
    if (descriptor?.set) descriptor.set.call(input, nextValue);
    else input.value = nextValue;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    if (commit) input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
}

function _rc_getCheckboxValue(elemId) {
    const root = _rc_getRoot(elemId);
    const input = root ? root.querySelector('input[type="checkbox"]') : null;
    return !!(input && input.checked);
}

function _rc_setCheckboxValue(elemId, value, commit = true) {
    const root = _rc_getRoot(elemId);
    const input = root ? root.querySelector('input[type="checkbox"]') : null;
    if (!input) return false;
    input.checked = !!value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    if (commit) input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
}

function _rc_getSliderFloat(elemId, fallback = null) {
    const root = _rc_getRoot(elemId);
    const numberInput = root ? root.querySelector('input[type="number"]') : null;
    const rangeInput = root ? root.querySelector('input[type="range"]') : null;
    const raw = numberInput?.value ?? rangeInput?.value;
    const value = parseFloat(raw);
    return Number.isFinite(value) ? value : fallback;
}

function _rc_getRadioValue(elemId) {
    const root = _rc_getRoot(elemId);
    if (!root) return "";
    const checked = root.querySelector('input[type="radio"]:checked');
    if (checked) return checked.value || "";
    const first = root.querySelector('input[type="radio"]');
    return first ? (first.value || "") : "";
}

function _rc_getRadioChoices(elemId) {
    const root = _rc_getRoot(elemId);
    if (!root) return [];
    const inputs = Array.from(root.querySelectorAll('input[type="radio"]'));
    const choices = [];
    for (const input of inputs) {
        const label = input.closest('label');
        const labelText = label ? (label.textContent || "").trim() : "";
        const value = input.value || labelText;
        if (value && !choices.includes(value)) choices.push(value);
    }
    return choices;
}

function _rc_setRadioValue(elemId, value, commit = true) {
    const root = _rc_getRoot(elemId);
    if (!root) return false;
    const wanted = String(value || "").trim();
    const inputs = Array.from(root.querySelectorAll('input[type="radio"]'));
    let matched = inputs.find((input) => String(input.value || "").trim() === wanted);
    if (!matched) {
        matched = inputs.find((input) => {
            const label = input.closest('label');
            return label && (label.textContent || "").trim() === wanted;
        });
    }
    if (!matched) return false;
    matched.checked = true;
    matched.dispatchEvent(new Event('input', { bubbles: true }));
    if (commit) matched.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
}

function _rc_gcd(a, b) {
    a = Math.abs(a);
    b = Math.abs(b);
    while (b) {
        const t = b;
        b = a % b;
        a = t;
    }
    return a || 1;
}

function _rc_addRatio(width, height) {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    let a = Math.round(w);
    let b = Math.round(h);
    let g = _rc_gcd(a, b);
    a = Math.round(a / g);
    b = Math.round(b / g);
    if (w === 576 && h === 1344) {
        a = 9; b = 21;
    } else if (w === 1344 && h === 576) {
        a = 21; b = 9;
    } else if (w === 768 && h === 1280) {
        a = 9; b = 15;
    } else if (w === 1280 && h === 768) {
        a = 15; b = 9;
    }
    return `${w}\u00d7${h} | ${a}:${b}`;
}

function _rc_parseDims(value) {
    const text = String(value || "").split(",", 1)[0].trim();
    if (!text) return null;
    const namedSceneSizes = {
        "9:16": { width: 576, height: 1024 },
        "4:5": { width: 864, height: 1080 },
        "4:3": { width: 1024, height: 768 },
        "3:2": { width: 1080, height: 720 },
        "16:9": { width: 1024, height: 576 },
        "21:9": { width: 1260, height: 540 },
    };
    if (namedSceneSizes[text]) return namedSceneSizes[text];
    const pipe = text.split("|");
    if (pipe.length === 2 && pipe[1].includes(":")) {
        const left = pipe[0].trim();
        const parts = pipe[1].split(":");
        const rw = parseFloat(parts[0]);
        const rh = parseFloat(parts[1]);
        if (rw > 0 && rh > 0) {
            const explicit = left.replace("*", "x").replace("\u00d7", "x").match(/^(\d+)\D+(\d+)$/);
            if (explicit) {
                return { width: parseInt(explicit[1], 10), height: parseInt(explicit[2], 10) };
            }
            if (/^\d+$/.test(left)) {
                const width = parseInt(left, 10);
                if (width > 0) return { width, height: Math.round(width * rh / rw) };
            }
            const key = `${parts[0].trim()}:${parts[1].trim()}`;
            if (namedSceneSizes[key]) return namedSceneSizes[key];
        }
    }
    const match = text.replace("*", "x").replace("\u00d7", "x").match(/(\d+)\D+(\d+)/);
    if (!match) return null;
    return { width: parseInt(match[1], 10), height: parseInt(match[2], 10) };
}

function _rc_displayRatioChoice(value) {
    const text = String(value || "").split(",", 1)[0].trim();
    const dims = _rc_parseDims(text);
    if (!dims) return text;
    const ratioMatch = text.match(/(\d+\s*:\s*\d+)\s*$/);
    const ratio = ratioMatch ? ratioMatch[1].replace(/\s+/g, "") : "";
    return ratio ? `${dims.width}\u00d7${dims.height} | ${ratio}` : text;
}

function _rc_simplifiedRatioLabel(width, height) {
    let a = Math.abs(parseInt(width, 10) || 0);
    let b = Math.abs(parseInt(height, 10) || 0);
    if (!a || !b) return "";
    while (b) {
        const t = b;
        b = a % b;
        a = t;
    }
    const gcd = Math.max(1, a);
    return `${Math.round(width / gcd)}:${Math.round(height / gcd)}`;
}

function _rc_normalizeSceneRatio(value) {
    const text = String(value || "").split(",", 1)[0].trim();
    if (!text) return "";
    const pipeIndex = text.lastIndexOf("|");
    const candidate = pipeIndex >= 0 ? text.slice(pipeIndex + 1).trim() : text;
    const match = candidate.match(/(\d+)\s*:\s*(\d+)/);
    return match ? `${match[1]}:${match[2]}` : candidate;
}

function _rc_quantize(value, step) {
    step = Math.max(1, parseInt(step, 10) || 1);
    const q = Math.round(value / step) * step;
    return Math.max(step, q);
}

function _rc_getResolutionProfile() {
    const params = window.simpleaiTopbarSystemParams
        || (typeof topbarLastSystemParams !== 'undefined' ? topbarLastSystemParams : null);
    const profile = params && typeof params === 'object' ? params.__resolution_control_profile : null;
    return profile && typeof profile === 'object' ? profile : {};
}

function _rc_projectKeepInputArea(sourceWidth, sourceHeight, baseWidth, baseHeight, step) {
    sourceWidth = Math.max(1, Number(sourceWidth) || 1);
    sourceHeight = Math.max(1, Number(sourceHeight) || 1);
    baseWidth = Math.max(1, Number(baseWidth) || 640);
    baseHeight = Math.max(1, Number(baseHeight) || 640);
    step = Math.max(1, Number(step) || 8);
    const area = baseWidth * baseHeight;
    const ratio = sourceWidth / sourceHeight;
    const width = _rc_quantize(Math.sqrt(area * ratio), step);
    const height = _rc_quantize(Math.sqrt(area / ratio), step);
    return { width, height };
}

function _rc_projectKeepInputPixelArea(sourceWidth, sourceHeight, area, step) {
    sourceWidth = Math.max(1, Number(sourceWidth) || 1);
    sourceHeight = Math.max(1, Number(sourceHeight) || 1);
    area = Math.max(1, Number(area) || 1);
    step = Math.max(1, Number(step) || 8);
    const ratio = sourceWidth / sourceHeight;
    const width = _rc_quantize(Math.sqrt(area * ratio), step);
    const height = _rc_quantize(Math.sqrt(area / ratio), step);
    return { width, height };
}

function _rc_profileRatioBaseDims(value) {
    const text = String(value || "").split(",", 1)[0].trim();
    if (!text) return null;
    const pipe = text.split("|", 1)[0].trim();
    const pipeLower = pipe.toLowerCase().replace(/[\s-]+/g, "_");
    if (["origin", "original", "source", "no_resize", "noresize"].includes(pipeLower)) {
        const label = text.includes("|") ? text.split("|").slice(1).join("|").trim() : "";
        return { origin: true, label: label || "Origin" };
    }
    if (/^\d+$/.test(pipe)) {
        const size = parseInt(pipe, 10);
        if (size > 0) return { width: size, height: size, label: pipe };
    }
    const explicit = text.replace("*", "x").replace("\u00d7", "x").match(/^(\d+)\s*x\s*(\d+)/i);
    if (explicit) {
        return { width: parseInt(explicit[1], 10), height: parseInt(explicit[2], 10), label: text };
    }
    return null;
}

function _rc_readSourceMeta() {
    const raw = _rc_getTextValue('resolution_source_meta');
    if (!raw) return {};
    try {
        const meta = JSON.parse(raw);
        return meta && typeof meta === 'object' ? meta : {};
    } catch (e) {
        return {};
    }
}

function _rc_readImageSource(sourceIds) {
    const candidates = [];
    const pushCandidate = (node, width, height, kind) => {
        width = Math.round(width || 0);
        height = Math.round(height || 0);
        if (!(width >= 64 && height >= 64)) return;
        candidates.push({ node, width, height, kind, area: width * height });
    };
    const readSketchApi = (root) => {
        if (!root) return null;
        try {
            if (window.SimpAISketch && typeof window.SimpAISketch.get === 'function') {
                return window.SimpAISketch.get(root)
                    || window.SimpAISketch.get(root.querySelector?.('[data-simpai-sketch="1"], .simpai-custom-sketch-source'));
            }
        } catch (e) {
        }
        return root.__simpaiSketch
            || root.querySelector?.('[data-simpai-sketch="1"]')?.__simpaiSketch
            || root.querySelector?.('.simpai-custom-sketch-source')?.__simpaiSketch
            || null;
    };
    const meta = _rc_readSourceMeta();
    for (const id of sourceIds || []) {
        const root = _rc_getRoot(id);
        if (!root) continue;
        const sourceMeta = meta && typeof meta === 'object' ? meta[id] : null;
        const sketchRoot = root.matches?.('[data-simpai-sketch="1"], .simpai-custom-sketch-source')
            ? root
            : root.querySelector?.('[data-simpai-sketch="1"], .simpai-custom-sketch-source');
        const sketchStage = sketchRoot?.querySelector?.('.simpai-sketch__stage');
        const sketchLooksEmpty = !!(sketchRoot && sketchStage && !sketchStage.classList.contains('has-image'));
        const sketchApi = readSketchApi(root) || readSketchApi(sketchRoot);
        if (!(sourceMeta && sourceMeta.width > 0 && sourceMeta.height > 0) && sketchLooksEmpty) {
            continue;
        }
        if (!(sourceMeta && sourceMeta.width > 0 && sourceMeta.height > 0) && sketchApi && typeof sketchApi.hasImage === 'function' && !sketchApi.hasImage()) {
            continue;
        }
        if (sourceMeta && sourceMeta.width > 0 && sourceMeta.height > 0) {
            const mediaNode = root.querySelector('video, img, canvas');
            if (mediaNode) pushCandidate(mediaNode, sourceMeta.width, sourceMeta.height, sourceMeta.kind || 'meta');
        }
        const images = Array.from(root.querySelectorAll('img'));
        for (const img of images) {
            if (typeof simpleaiMediaNodeHasSource === 'function' && !simpleaiMediaNodeHasSource(img)) continue;
            const width = img.naturalWidth || img.videoWidth || img.width || img.clientWidth;
            const height = img.naturalHeight || img.videoHeight || img.height || img.clientHeight;
            pushCandidate(img, width, height, 'img');
        }
        const canvases = Array.from(root.querySelectorAll('canvas'));
        for (const canvas of canvases) {
            const stage = canvas.closest?.('.simpai-sketch__stage');
            if (stage && !stage.classList.contains('has-image')) continue;
            pushCandidate(canvas, canvas.width, canvas.height, 'canvas');
        }
        const videos = Array.from(root.querySelectorAll('video'));
        for (const video of videos) {
            if (typeof simpleaiMediaNodeHasSource === 'function' && !simpleaiMediaNodeHasSource(video)) continue;
            const width = video.videoWidth || video.width || video.clientWidth;
            const height = video.videoHeight || video.height || video.clientHeight;
            pushCandidate(video, width, height, 'video');
        }
    }
    candidates.sort((a, b) => b.area - a.area);
    return candidates[0] || null;
}

function _rc_nowMs() {
    try {
        return window.performance && typeof window.performance.now === 'function'
            ? window.performance.now()
            : Date.now();
    } catch (e) {
        return Date.now();
    }
}

function _rc_markResolutionSourceDirty(widget) {
    if (!widget) return;
    widget.__rc_source_version = (Number(widget.__rc_source_version || 0) || 0) + 1;
    widget.__rc_cached_image_source_key = '';
    widget.__rc_cached_image_source_value = null;
}

function _rc_clearResolutionPreviewCanvas(canvas) {
    if (!canvas || typeof canvas.getContext !== 'function') return false;
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    ctx.save();
    try {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, Math.max(1, canvas.width || 1), Math.max(1, canvas.height || 1));
    } finally {
        ctx.restore();
    }
    return true;
}

function _rc_runResolutionWidgetSync(widget, syncFn) {
    if (!widget || typeof syncFn !== 'function') return false;
    window.clearTimeout(widget.__rc_widget_sync_timer);
    widget.__rc_widget_sync_timer = 0;
    widget.__rc_last_sync_at = _rc_nowMs();
    try {
        syncFn();
        return true;
    } catch (e) {
        return false;
    }
}

function _rc_scheduleResolutionWidgetSync(widget, syncFn, options = {}) {
    if (!widget || typeof syncFn !== 'function') return false;
    const force = options === true || options.force === true;
    const delay = Math.max(0, Number(options.delay ?? 60) || 0);
    const minInterval = force ? 0 : Math.max(0, Number(options.minInterval ?? 160) || 0);
    const now = _rc_nowMs();
    const last = Number(widget.__rc_last_sync_at || 0) || 0;
    const wait = force ? delay : Math.max(delay, last ? minInterval - (now - last) : 0, 0);
    window.clearTimeout(widget.__rc_widget_sync_timer);
    widget.__rc_widget_sync_timer = window.setTimeout(() => {
        _rc_runResolutionWidgetSync(widget, syncFn);
    }, wait);
    return true;
}

function _rc_syncResolutionWidget(widget, syncFn, options = {}) {
    if (!widget || typeof syncFn !== 'function') return false;
    const force = options === true || options.force === true;
    const minInterval = force ? 0 : Math.max(0, Number(options.minInterval ?? 160) || 0);
    const last = Number(widget.__rc_last_sync_at || 0) || 0;
    const elapsed = _rc_nowMs() - last;
    if (!force && last && elapsed < minInterval) {
        return _rc_scheduleResolutionWidgetSync(widget, syncFn, {
            delay: minInterval - elapsed,
            minInterval,
        });
    }
    return _rc_runResolutionWidgetSync(widget, syncFn);
}

function _rc_scheduleSourceSync(widget, syncFn) {
    if (!widget) return;
    const schedule = () => {
        _rc_markResolutionSourceDirty(widget);
        _rc_scheduleResolutionWidgetSync(widget, syncFn, { delay: 80, minInterval: 120 });
    };
    try {
        const observer = widget.__rc_source_observer || new MutationObserver(schedule);
        widget.__rc_source_observer = observer;
        widget.__rc_observed_source_ids = widget.__rc_observed_source_ids || new Set();
        for (const id of ['scene_canvas', 'scene_input_image1', 'scene_video', 'sam3_input_video']) {
            if (widget.__rc_observed_source_ids.has(id)) continue;
            const root = _rc_getRoot(id);
            if (root) {
                observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'style', 'class'] });
                widget.__rc_observed_source_ids.add(id);
            }
        }
    } catch (e) {}
    if (widget.dataset.rcSourceLoadListener !== '1') {
        widget.dataset.rcSourceLoadListener = '1';
        document.addEventListener('load', (event) => {
            const target = event.target;
            if (target && (target.tagName === 'IMG' || target.tagName === 'VIDEO') && _rc_targetIsObservedSource(widget, target)) schedule();
        }, true);
        document.addEventListener('loadedmetadata', (event) => {
            const target = event.target;
            if (target && target.tagName === 'VIDEO' && _rc_targetIsObservedSource(widget, target)) schedule();
        }, true);
    }
}

function initResolutionControlWidget(widget, options = {}) {
    if (!widget || widget.dataset.rcInitialized === '1') {
        if (widget) _rc_scheduleSourceSync(widget, widget.__rc_sync);
        if (widget && typeof widget.__rc_sync === 'function') {
            if (options === true || options.force === true) {
                _rc_syncResolutionWidget(widget, widget.__rc_sync, { force: true });
            } else {
                _rc_scheduleResolutionWidgetSync(widget, widget.__rc_sync, { delay: 80, minInterval: 180 });
            }
        }
        return;
    }

    let payload = {};
    try {
        const jsonNode = widget.querySelector('[data-role="resolution-data"]');
        payload = JSON.parse(jsonNode ? jsonNode.textContent || "{}" : "{}");
    } catch (e) {
        payload = {};
    }

    const targetSelectionId = widget.dataset.targetSelectionId || 'aspect_ratios_selection';
    const targetRandomId = widget.dataset.targetRandomId || 'random_aspect_ratio_checkbox';
    const targetOverrideId = widget.dataset.targetOverrideId || 'use_resolution_override_checkbox';
    const targetOriginalInputId = widget.dataset.targetOriginalInputId || 'resolution_original_input_checkbox';
    const targetWidthId = widget.dataset.targetWidthId || 'overwrite_width';
    const targetHeightId = widget.dataset.targetHeightId || 'overwrite_height';
    const targetMultiplierId = widget.dataset.targetMultiplierId || 'resolution_multiplier';
    const targetQuantizeId = widget.dataset.targetQuantizeId || 'resolution_quantize_step';
    const targetEditModeId = widget.dataset.targetEditModeId || 'resolution_edit_mode';
    const mainSelectionId = targetSelectionId;
    const sceneSelectionId = widget.dataset.sceneSelectionId || 'scene_aspect_ratio';

    const templateSelect = widget.querySelector('[data-role="template-select"]');
    const ratioSelect = widget.querySelector('[data-role="ratio-select"]');
    const randomToggle = widget.querySelector('[data-role="random-toggle"]');
    const overrideToggle = widget.querySelector('[data-role="override-toggle"]');
    const originalInputToggle = widget.querySelector('[data-role="original-input-toggle"]');
    const wInput = widget.querySelector('[data-role="winput"]');
    const hInput = widget.querySelector('[data-role="hinput"]');
    const qStepSelect = widget.querySelector('[data-role="qstep"]');
    const multiplierInput = widget.querySelector('[data-role="multiplier"]');
    const pad = widget.querySelector('[data-role="pad"]');
    const rect = widget.querySelector('[data-role="rect"]');
    const rectLabel = widget.querySelector('[data-role="rect-label"]');
    const canvas = widget.querySelector('[data-role="image-preview"]');
    const status = widget.querySelector('[data-role="status"]');
    const modeButtons = Array.from(widget.querySelectorAll('[data-role="edit-mode"]'));
    const ratioLockToggle = widget.querySelector('[data-role="ratio-lock-toggle"]');
    const ratioLockSelect = widget.querySelector('[data-role="ratio-lock-select"]');
    const ratioLockCustom = widget.querySelector('[data-role="ratio-lock-custom"]');
    const ratioLockCustomW = widget.querySelector('[data-role="ratio-lock-custom-w"]');
    const ratioLockCustomH = widget.querySelector('[data-role="ratio-lock-custom-h"]');
    if (!templateSelect || !ratioSelect || !wInput || !hInput || !qStepSelect || !multiplierInput || !pad || !rect) return;

    const isSceneActive = () => {
        if (_rc_getCurrentSceneFlag()) return true;
        if (document.documentElement?.classList?.contains('simpai-scene-frontend')) return true;
        try {
            const scenePanel = _rc_getRoot('scene_panel');
            return !!(scenePanel && elementIsVisible(scenePanel));
        } catch (e) {
            return false;
        }
    };
    const useSceneSelection = () => isSceneActive() && !!_rc_getRoot(sceneSelectionId);
    const getActiveProfile = () => useSceneSelection() ? _rc_getResolutionProfile() : {};
    const getProfileSourceIds = (profile) => {
        if (Array.isArray(profile.source_ids) && profile.source_ids.length) return profile.source_ids;
        const source = String(profile.source || '').trim();
        if (source === 'scene_canvas') return ['scene_canvas'];
        if (source === 'scene_input_image1') return ['scene_input_image1'];
        if (source === 'scene_input_image2') return ['scene_input_image2'];
        if (source === 'scene_input_image3') return ['scene_input_image3'];
        if (source === 'scene_input_image4') return ['scene_input_image4'];
        if (source === 'scene_video') return ['scene_video'];
        if (source === 'sam3_input_video') return ['sam3_input_video'];
        if (source === 'video_first_frame' || source === 'scene_video_first_frame') return ['sam3_input_video', 'scene_video'];
        if (source === 'none' || source === 'no_source') return [];
        return null;
    };
    const getSourceIds = () => {
        if (useSceneSelection()) {
            const profileIds = getProfileSourceIds(getActiveProfile());
            if (profileIds && profileIds.length) return profileIds;
            return payload.sceneSourceIds || [];
        }
        return payload.sourceIds || [];
    };
    const readImageSource = (sourceIds = getSourceIds()) => {
        const ids = Array.isArray(sourceIds) ? sourceIds : [];
        const metaKey = _rc_getTextValue('resolution_source_meta') || '';
        const key = `${JSON.stringify(ids)}|${metaKey}|${widget.__rc_source_version || 0}`;
        if (widget.__rc_cached_image_source_key === key) {
            return widget.__rc_cached_image_source_value || null;
        }
        const source = _rc_readImageSource(ids);
        widget.__rc_cached_image_source_key = key;
        widget.__rc_cached_image_source_value = source || null;
        return source || null;
    };
    const readSelection = () => useSceneSelection() ? _rc_normalizeSceneRatio(_rc_getTextValue(sceneSelectionId)) : _rc_getTextValue(mainSelectionId);
    const writeSelection = (value, commit = true) => {
        if (useSceneSelection()) return _rc_setTextValue(sceneSelectionId, _rc_normalizeSceneRatio(value), commit);
        return _rc_setTextValue(mainSelectionId, value, commit);
    };
    const profileMode = (profile) => String(profile && profile.mode || '').trim();
    const profileUsesProjectedChoices = (profile) => {
        const mode = profileMode(profile);
        return mode === 'image_keep_input_area' || mode === 'video_keep_input_area';
    };
    const profileUsesPreprocessFit = (profile) => {
        const mode = profileMode(profile);
        return mode === 'standard' || profileUsesProjectedChoices(profile);
    };
    const profileStep = (profile) => {
        const raw = parseInt(profile && profile.quantize, 10);
        return [1, 8, 16, 32, 64].includes(raw) ? raw : null;
    };
    const profilePreprocessFitMode = (profile) => {
        const mode = String(profile && profile.preprocess_fit || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
        if (['proportional', 'keep', 'keep_ratio'].includes(mode)) return 'proportional';
        if (['crop', 'cover'].includes(mode)) return 'crop';
        if (['scale', 'fill', 'stretch'].includes(mode)) return 'scale';
        if (['pad', 'padding', 'letterbox', 'contain'].includes(mode)) return 'pad';
        return '';
    };
    const normalizeEditMode = (value, fallback = 'scale') => {
        const mode = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
        if (['proportional', 'keep', 'keep_ratio'].includes(mode)) return 'proportional';
        if (['crop', 'cover'].includes(mode)) return 'crop';
        if (['pad', 'padding', 'letterbox', 'contain'].includes(mode)) return 'pad';
        if (['scale', 'fill', 'stretch'].includes(mode)) return 'scale';
        return ['proportional', 'crop', 'scale', 'pad'].includes(fallback) ? fallback : 'scale';
    };
    const resolutionControlLangSource = () => window.simpleaiTopbarSystemParams || (typeof topbarLastSystemParams !== 'undefined' ? topbarLastSystemParams : null) || {};
    const resolutionControlPrefersEnglish = (source = resolutionControlLangSource()) => {
        const lang = String(source.__lang || source.state?.__lang || window.locale_lang || '').toLowerCase();
        return lang.startsWith('en');
    };
    const resolutionControlExplicitText = (en, cn, source = resolutionControlLangSource()) => (
        resolutionControlPrefersEnglish(source) ? en : (cn || en)
    );
    const setResolutionText = (node, value) => {
        if (node && node.textContent !== value) node.textContent = value;
    };
    const setResolutionAttribute = (node, name, value) => {
        if (node && node.getAttribute(name) !== value) node.setAttribute(name, value);
    };
    const setResolutionDisabled = (node, disabled) => {
        if (node && node.disabled !== disabled) node.disabled = disabled;
    };
    const toggleResolutionClass = (node, name, enabled) => {
        if (node && node.classList.contains(name) !== enabled) node.classList.toggle(name, enabled);
    };
    const setResolutionStyle = (node, name, value) => {
        if (node && node.style.getPropertyValue(name) !== value) node.style.setProperty(name, value);
    };
    const syncModeButtonLabels = () => {
        const source = resolutionControlLangSource();
        for (const node of Array.from(widget.querySelectorAll('[data-role="localized-label"]'))) {
            const en = node.dataset.labelEn || node.textContent || '';
            const cn = node.dataset.labelCn || en;
            setResolutionText(node, resolutionControlExplicitText(en, cn, source));
        }
        for (const button of modeButtons) {
            const en = button.dataset.labelEn || button.textContent || '';
            const cn = button.dataset.labelCn || en;
            const titleEn = button.dataset.titleEn || en;
            const titleCn = button.dataset.titleCn || cn;
            const title = resolutionControlExplicitText(titleEn, titleCn, source);
            setResolutionText(button, resolutionControlExplicitText(en, cn, source));
            if (button.title !== title) button.title = title;
            setResolutionAttribute(button, 'aria-label', title);
        }
    };
    const profileInteractive = (profile) => !(profile && profile.interactive === false);
    const originalInputActive = () => !!(originalInputToggle && originalInputToggle.checked);
    const syncOriginalInputControls = () => {
        const active = originalInputActive();
        toggleResolutionClass(widget, 'resolution-original-input-active', active);
        const enabled = controlsAreInteractive();
        for (const button of modeButtons) {
            setResolutionDisabled(button, !enabled || active);
        }
    };
    const setControlsInteractive = (enabled) => {
        toggleResolutionClass(widget, 'resolution-control-disabled', !enabled);
        for (const node of [templateSelect, ratioSelect, randomToggle, overrideToggle, originalInputToggle, wInput, hInput, qStepSelect, multiplierInput, ratioLockToggle, ratioLockSelect, ratioLockCustomW, ratioLockCustomH]) {
            setResolutionDisabled(node, !enabled);
        }
        for (const button of modeButtons) {
            setResolutionDisabled(button, !enabled || originalInputActive());
        }
        if (enabled && profileStep(getActiveProfile()) && qStepSelect) setResolutionDisabled(qStepSelect, true);
    };
    const controlsAreInteractive = () => !widget.classList.contains('resolution-control-disabled');
    const syncRatioLockControls = () => {
        const mode = normalizeEditMode(_rc_getTextValue(targetEditModeId), 'proportional');
        const enabled = controlsAreInteractive() && mode !== 'proportional' && !!(ratioLockToggle && ratioLockToggle.checked);
        const customEnabled = enabled && !!(ratioLockSelect && ratioLockSelect.value === 'custom');
        setResolutionDisabled(ratioLockSelect, !enabled);
        if (ratioLockCustom) {
            toggleResolutionClass(ratioLockCustom, 'resolution-ratio-custom-disabled', !customEnabled);
            setResolutionAttribute(ratioLockCustom, 'aria-disabled', customEnabled ? 'false' : 'true');
        }
        setResolutionDisabled(ratioLockCustomW, !customEnabled);
        setResolutionDisabled(ratioLockCustomH, !customEnabled);
        toggleResolutionClass(widget, 'resolution-ratio-lock-active', !!enabled);
        toggleResolutionClass(widget, 'resolution-ratio-custom-active', !!customEnabled);
        syncOriginalInputControls();
    };
    const syncAccordionTitle = (width, height, options = {}) => {
        const accordion = widget.closest('#aspect_ratios_accordion') || _rc_getRoot('aspect_ratios_accordion');
        if (!accordion) return;
        const header = accordion.querySelector('summary, .label-wrap, [role="button"]');
        if (!header) return;
        const selectedText = ratioSelect && ratioSelect.selectedOptions && ratioSelect.selectedOptions[0]
            ? ratioSelect.selectedOptions[0].textContent || ""
            : "";
        const bracket = (selectedText.match(/\[[^\]]+\]/) || [""])[0];
        const walker = document.createTreeWalker(header, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
                const text = node.nodeValue && node.nodeValue.trim();
                return text && (text.startsWith('Resolution') || text.startsWith('\u5206\u8fa8\u7387'))
                    ? NodeFilter.FILTER_ACCEPT
                    : NodeFilter.FILTER_REJECT;
            },
        });
        const textNode = walker.nextNode();
        const currentTitleText = textNode && textNode.nodeValue ? textNode.nodeValue.trim() : "";
        const titlePrefix = currentTitleText.startsWith('\u5206\u8fa8\u7387') ? '\u5206\u8fa8\u7387' : 'Resolution';
        const ratioMatch = selectedText.match(/(?:\||\s)(\d+\s*:\s*\d+)(?:\s|$|\])/);
        const ratio = ratioMatch ? ratioMatch[1].replace(/\s+/g, "") : _rc_simplifiedRatioLabel(width, height);
        const title = options && options.waitingOriginal
            ? `${titlePrefix} - ${titlePrefix === '\u5206\u8fa8\u7387' ? '\u539f\u59cb\u5c3a\u5bf8' : 'Original'}${ratio ? ` | ${ratio}` : ""}${bracket ? ` ${bracket}` : ""}`
            : `${titlePrefix} - ${width}\u00d7${height}${ratio ? ` | ${ratio}` : ""}${bracket ? ` ${bracket}` : ""}`;
        if (textNode) {
            const nextValue = textNode.nodeValue.replace(/(?:Resolution|\u5206\u8fa8\u7387)(?:\s*[-–].*)?/, title);
            if (textNode.nodeValue !== nextValue) textNode.nodeValue = nextValue;
            return;
        }
        const leaf = Array.from(header.querySelectorAll('*')).find((node) => {
            return node.childNodes.length === 1
                && node.childNodes[0].nodeType === Node.TEXT_NODE
                && node.textContent.trim();
        });
        if (leaf && leaf.textContent !== title) leaf.textContent = title;
    };
    const syncAccordionOpen = (shouldOpen) => {
        _rc_syncResolutionAccordionShellOpen(shouldOpen);
    };
    const getProjectedProfileChoices = () => {
        const profile = getActiveProfile();
        if (!profileUsesProjectedChoices(profile)) return null;
        const source = readImageSource(getSourceIds());
        const hasSource = !!(source && source.width > 0 && source.height > 0);
        const ratios = Array.isArray(profile.aspect_ratios) && profile.aspect_ratios.length
            ? profile.aspect_ratios
            : [`${profile.base_width || 640}|1:1`];
        const choices = [];
        const seen = new Set();
        for (const item of ratios) {
            const base = _rc_profileRatioBaseDims(item);
            if (!base) continue;
            let dims = { width: base.width, height: base.height };
            if (base.origin) {
                if (!hasSource) {
                    const value = 'origin|Original';
                    if (seen.has(value)) continue;
                    seen.add(value);
                    choices.push({
                        value,
                        label: base.label || 'Original',
                        width: 0,
                        height: 0,
                        base,
                    });
                    continue;
                }
                dims = { width: source.width, height: source.height };
            } else if (hasSource) {
                dims = _rc_projectKeepInputArea(source.width, source.height, base.width, base.height, profileStep(profile) || readStep());
            }
            const value = base.origin ? `${dims.width}\u00d7${dims.height}|origin` : `${dims.width}\u00d7${dims.height}|${base.width}x${base.height}`;
            if (seen.has(value)) continue;
            seen.add(value);
            choices.push({
                value,
                label: `${dims.width}\u00d7${dims.height}  [${base.label}]`,
                width: dims.width,
                height: dims.height,
                base,
                pendingSource: !hasSource && !base.origin,
            });
        }
        return choices;
    };
    const getProjectedChoiceByValue = (value) => {
        const choices = getProjectedProfileChoices();
        if (!choices) return null;
        const exact = choices.find((choice) => choice.value === value);
        if (exact) return exact;
        const wantedKey = projectedChoiceKey(value);
        if (!wantedKey) return null;
        return choices.find((choice) => projectedChoiceKey(choice && choice.value) === wantedKey) || null;
    };
    const projectedChoiceKey = (value) => {
        const text = String(value || '').split(',', 1)[0].trim();
        if (!text) return '';
        const parts = text.split('|').map((part) => part.trim()).filter(Boolean);
        if (parts.length > 1) {
            const first = parts[0].toLowerCase().replace(/[\s-]+/g, '_');
            if (['origin', 'original', 'source', 'no_resize', 'noresize'].includes(first)) return 'origin';
            const suffixKey = parts.slice(1).join('|').toLowerCase().replace(/[\s-]+/g, '_');
            if (suffixKey === 'custom') {
                const dims = _rc_parseDims(parts[0]);
                if (dims && dims.width > 0 && dims.height > 0) return `custom-area:${dims.width * dims.height}`;
                return 'custom';
            }
            if (/^\d+$/.test(parts[0]) && /^\d+\s*:\s*\d+$/.test(parts[1])) {
                return `${parts[0]}x${parts[0]}`;
            }
            const suffix = parts.slice(1).join('|').toLowerCase().replace(/\s+/g, '');
            if (suffix) return suffix;
        }
        const base = _rc_profileRatioBaseDims(text);
        if (base) return base.origin ? 'origin' : `${base.width}x${base.height}`;
        return text.toLowerCase().replace(/\s+/g, '');
    };
    const projectedProfileBaseKeys = () => {
        const profile = getActiveProfile();
        const ratios = Array.isArray(profile.aspect_ratios) && profile.aspect_ratios.length
            ? profile.aspect_ratios
            : [`${profile.base_width || 640}|1:1`];
        return ratios.map((item) => projectedChoiceKey(item)).filter(Boolean);
    };
    const defaultProjectedChoiceKey = () => {
        const selectedKey = projectedChoiceKey(readSelection());
        const baseKeys = projectedProfileBaseKeys();
        if (selectedKey && baseKeys.includes(selectedKey)) return selectedKey;
        return baseKeys.length ? baseKeys[0] : (selectedKey || '');
    };
    const getProjectedChoiceByKey = (key) => {
        const normalized = String(key || '').trim();
        if (!normalized) return null;
        const choices = getProjectedProfileChoices();
        if (!choices) return null;
        return choices.find((choice) => projectedChoiceKey(choice && choice.value) === normalized) || null;
    };
    const getCustomProjectedChoice = () => {
        const key = String(widget.__rc_projected_choice_key || '');
        const match = key.match(/^custom-area:(\d+(?:\.\d+)?)$/);
        if (!match) return null;
        const area = parseFloat(match[1]);
        const source = readImageSource(getSourceIds());
        if (!source || !(area > 0)) return null;
        const dims = _rc_projectKeepInputPixelArea(source.width, source.height, area, profileStep(getActiveProfile()) || readStep());
        return {
            value: `${dims.width}\u00d7${dims.height}|custom`,
            label: `Custom ${_rc_addRatio(dims.width, dims.height)}`,
            width: dims.width,
            height: dims.height,
            custom: true,
            area,
        };
    };
    const getRememberedProjectedChoice = () => {
        const custom = getCustomProjectedChoice();
        if (custom) return custom;
        const remembered = getProjectedChoiceByKey(widget.__rc_projected_choice_key);
        if (remembered) return remembered;
        return getProjectedChoiceByValue(ratioSelect && ratioSelect.value);
    };
    const getFirstProjectedChoice = () => {
        const choices = getProjectedProfileChoices();
        return choices && choices.length ? choices[0] : null;
    };
    const hasProjectedChoiceForHiddenSize = () => {
        const choices = getProjectedProfileChoices();
        if (!choices) return false;
        const currentWidth = _ro_getSliderValue(targetWidthId);
        const currentHeight = _ro_getSliderValue(targetHeightId);
        return choices.some((choice) => choice.width === currentWidth && choice.height === currentHeight);
    };
    const getViewportDims = (dims) => {
        let width = Math.max(1, dims && dims.width || 1024);
        let height = Math.max(1, dims && dims.height || 1024);
        const choices = getProjectedProfileChoices();
        if (choices && choices.length) {
            for (const choice of choices) {
                width = Math.max(width, choice.width || 0);
                height = Math.max(height, choice.height || 0);
            }
        } else {
            width = Math.max(width, 2048);
            height = Math.max(height, 2048);
        }
        return { width, height };
    };

    const getRatios = () => {
        const projectedChoices = getProjectedProfileChoices();
        if (projectedChoices) return { Scene: projectedChoices };
        if (useSceneSelection()) {
            const params = window.simpleaiTopbarSystemParams
                || (typeof topbarLastSystemParams !== 'undefined' ? topbarLastSystemParams : null)
                || {};
            const sceneChoices = Array.isArray(params.__scene_aspect_ratios) && params.__scene_aspect_ratios.length
                ? params.__scene_aspect_ratios
                : (payload.ratios && Array.isArray(payload.ratios.Scene) ? payload.ratios.Scene : []);
            if (sceneChoices.length) return { Scene: sceneChoices };
        }
        return payload.ratios || {};
    };

    const readStep = () => {
        const fromProfile = profileStep(getActiveProfile());
        if (fromProfile) return fromProfile;
        const raw = parseInt(qStepSelect.value, 10);
        return [1, 8, 16, 32, 64].includes(raw) ? raw : 8;
    };
    const syncDimensionInputStep = () => {
        const step = readStep();
        for (const input of [wInput, hInput]) {
            if (input.min !== "64") input.min = "64";
            if (input.max !== "2048") input.max = "2048";
            if (input.step !== String(step)) input.step = String(step);
        }
    };

    const clampDim = (value) => {
        const step = readStep();
        let v = parseInt(value, 10);
        if (!Number.isFinite(v) || v <= 0) return -1;
        v = Math.max(64, Math.min(2048, v));
        return _rc_quantize(v, step);
    };
    const clampRawDim = (value) => {
        let v = parseInt(value, 10);
        if (!Number.isFinite(v) || v <= 0) return -1;
        return Math.max(64, Math.min(2048, v));
    };
    const clampDims = (width, height, preserveRatio = false, quantize = true) => {
        const step = readStep();
        let w = Number(width);
        let h = Number(height);
        if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
            return { width: -1, height: -1 };
        }
        if (preserveRatio) {
            const ratio = w / Math.max(1, h);
            const scale = Math.min(1, 2048 / Math.max(1, w), 2048 / Math.max(1, h));
            w = Math.max(64, w * scale);
            h = Math.max(64, h * scale);
            if (h >= w / Math.max(0.0001, ratio)) {
                h = Math.max(64, Math.min(2048, h));
                w = h * ratio;
            } else {
                w = Math.max(64, Math.min(2048, w));
                h = w / Math.max(0.0001, ratio);
            }
            return {
                width: quantize ? _rc_quantize(w, step) : Math.round(w),
                height: quantize ? _rc_quantize(h, step) : Math.round(h),
            };
        }
        return {
            width: quantize ? clampDim(w) : clampRawDim(w),
            height: quantize ? clampDim(h) : clampRawDim(h),
        };
    };
    const parseRatioValue = (value) => {
        const text = String(value || '').trim();
        const match = text.match(/^(\d+(?:\.\d+)?)\s*[:xX/]\s*(\d+(?:\.\d+)?)$/);
        if (!match) return null;
        const rw = parseFloat(match[1]);
        const rh = parseFloat(match[2]);
        if (!(rw > 0 && rh > 0)) return null;
        return rw / rh;
    };
    const getCustomRatioValue = () => {
        const rw = parseFloat(ratioLockCustomW && ratioLockCustomW.value);
        const rh = parseFloat(ratioLockCustomH && ratioLockCustomH.value);
        if (!(rw > 0 && rh > 0)) return null;
        return rw / rh;
    };
    const getRatioLock = () => {
        const mode = normalizeEditMode(_rc_getTextValue(targetEditModeId), 'proportional');
        if (mode === 'proportional' || !ratioLockToggle || !ratioLockToggle.checked) return null;
        const selected = ratioLockSelect ? ratioLockSelect.value : 'current';
        if (selected === 'custom') return getCustomRatioValue();
        if (selected === 'current') {
            const dims = widget.__rc_drag_start || getCurrentDims();
            return dims && dims.width > 0 && dims.height > 0 ? dims.width / Math.max(1, dims.height) : null;
        }
        return parseRatioValue(selected);
    };
    const applyRatioLockToPair = (width, height, prefer = 'width') => {
        const ratio = getRatioLock();
        if (!ratio) return { width, height };
        let w = Number(width);
        let h = Number(height);
        if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return { width, height };
        if (prefer === 'height') {
            w = h * ratio;
        } else {
            h = w / Math.max(0.0001, ratio);
        }
        return { width: w, height: h };
    };

    const getCurrentDims = () => {
        if (widget.__rc_manual_draft && widget.__rc_manual_editing) {
            return { ...widget.__rc_manual_draft, manual: true, draft: true };
        }
        const profile = getActiveProfile();
        const mode = profileMode(profile);
        const ow = _ro_getSliderValue(targetWidthId);
        const oh = _ro_getSliderValue(targetHeightId);
        const source = mode ? readImageSource(getSourceIds()) : null;
        if (profileUsesProjectedChoices(profile)) {
            const projectedKey = projectedChoiceKey(widget.__rc_projected_choice_key || defaultProjectedChoiceKey());
            if (projectedKey === 'origin' && !source) {
                return { width: 0, height: 0, manual: false, profileMode: mode, waitingOriginal: true };
            }
        }
        if (profileUsesProjectedChoices(profile) && _rc_getCheckboxValue(targetOverrideId) && ow != null && oh != null && ow > 0 && oh > 0 && !hasProjectedChoiceForHiddenSize()) {
            return { width: ow, height: oh, manual: true, profileMode: mode };
        }
        if (mode === 'input_passthrough' && source) {
            return { width: source.width, height: source.height, manual: false, source, profileMode: mode };
        }
        if ((mode === 'image_keep_input_area' || mode === 'video_keep_input_area') && source) {
            const selectedChoice = getRememberedProjectedChoice();
            if (selectedChoice && selectedChoice.width > 0 && selectedChoice.height > 0) {
                return { width: selectedChoice.width, height: selectedChoice.height, manual: false, source, profileMode: mode };
            }
            let baseWidth = profile.base_width;
            let baseHeight = profile.base_height;
            const selectedBase = String(ratioSelect && ratioSelect.value || "").split("|", 2)[1] || "";
            const selectedBaseMatch = selectedBase.match(/(\d+)\D+(\d+)/);
            if (selectedBaseMatch) {
                baseWidth = parseInt(selectedBaseMatch[1], 10);
                baseHeight = parseInt(selectedBaseMatch[2], 10);
            }
            const projected = _rc_projectKeepInputArea(
                source.width,
                source.height,
                baseWidth,
                baseHeight,
                profileStep(profile) || readStep()
            );
            return { ...projected, manual: false, source, profileMode: mode };
        }
        if (mode === 'image_keep_input_area' || mode === 'video_keep_input_area') {
            const selectedChoice = getRememberedProjectedChoice();
            if (selectedChoice && selectedChoice.width > 0 && selectedChoice.height > 0) {
                return { width: selectedChoice.width, height: selectedChoice.height, manual: false, profileMode: mode };
            }
            let width = Math.max(64, parseInt(profile.base_width, 10) || 640);
            let height = Math.max(64, parseInt(profile.base_height, 10) || 640);
            const selectedBase = String(ratioSelect && ratioSelect.value || "").split("|", 2)[1] || "";
            const selectedBaseMatch = selectedBase.match(/(\d+)\D+(\d+)/);
            if (selectedBaseMatch) {
                width = Math.max(64, parseInt(selectedBaseMatch[1], 10) || width);
                height = Math.max(64, parseInt(selectedBaseMatch[2], 10) || height);
            }
            return { width, height, manual: false, profileMode: mode };
        }
        if (ow != null && oh != null && ow > 0 && oh > 0) {
            return { width: ow, height: oh, manual: true };
        }
        const parsed = _rc_parseDims(readSelection());
        if (parsed) return { ...parsed, manual: false };
        return { width: 1024, height: 1024, manual: false };
    };

    const setHiddenOverride = (enabled, commit = true) => {
        _rc_setCheckboxValue(targetOverrideId, enabled, commit);
        _rc_setCheckboxValue('scene_use_resolution_override_checkbox', enabled, false);
    };

    const setMode = (mode, commit = true) => {
        mode = normalizeEditMode(mode, 'scale');
        widget.__rc_user_edit_mode = true;
        _rc_setTextValue(targetEditModeId, mode, commit);
        for (const button of modeButtons) {
            toggleResolutionClass(button, 'active', button.dataset.mode === mode);
        }
        syncRatioLockControls();
        render();
    };

    const getSelectionTemplate = () => {
        if (useSceneSelection()) return "";
        const raw = String(readSelection() || "");
        const parts = raw.split(",");
        return parts.length > 1 ? parts.slice(1).join(",").trim() : "";
    };
    const getActiveNonSceneTemplate = (templates) => {
        const selectionTemplate = getSelectionTemplate();
        if (selectionTemplate && templates.includes(selectionTemplate)) return selectionTemplate;
        if (templateSelect.value && templateSelect.value !== 'Scene' && templates.includes(templateSelect.value)) return templateSelect.value;
        if (payload.defaultTemplate && templates.includes(payload.defaultTemplate)) return payload.defaultTemplate;
        return templates.find((template) => template !== 'Scene') || templates[0] || '';
    };
    const populateTemplates = () => {
        const ratios = getRatios();
        const templates = Object.keys(ratios);
        const selected = useSceneSelection() ? 'Scene' : getActiveNonSceneTemplate(templates);
        const optionsKey = templates.join('\u001f');
        if (templateSelect.dataset.rcOptionsKey !== optionsKey) {
            templateSelect.innerHTML = "";
            for (const template of templates) {
                const option = document.createElement('option');
                option.value = template;
                option.textContent = template;
                templateSelect.appendChild(option);
            }
            templateSelect.dataset.rcOptionsKey = optionsKey;
        }
        const nextValue = templates.includes(selected) ? selected : (templates[0] || '');
        if (templateSelect.value !== nextValue) templateSelect.value = nextValue;
    };

    const populateRatios = () => {
        const ratios = getRatios();
        const choices = ratios[templateSelect.value] || [];
        const current = useSceneSelection() ? _rc_normalizeSceneRatio(readSelection()) : readSelection().split(",", 1)[0].trim();
        const currentWidth = _ro_getSliderValue(targetWidthId);
        const currentHeight = _ro_getSliderValue(targetHeightId);
        const overrideEnabled = _rc_getCheckboxValue(targetOverrideId);
        const optionEntries = [];
        let customValue = null;
        for (const choice of choices) {
            const choiceValue = choice && typeof choice === 'object' ? choice.value : choice;
            optionEntries.push({
                value: choiceValue,
                label: choice && typeof choice === 'object' ? choice.label : _rc_displayRatioChoice(choice),
            });
        }
        const matched = choices.find((choice) => {
            const choiceValue = choice && typeof choice === 'object' ? choice.value : choice;
            if (choice && typeof choice === 'object' && currentWidth > 0 && currentHeight > 0) {
                return choice.width === currentWidth && choice.height === currentHeight;
            }
            if (useSceneSelection()) return _rc_normalizeSceneRatio(choiceValue) === current;
            return choiceValue === current || choiceValue === readSelection();
        });
        const matchedValue = matched && typeof matched === 'object' ? matched.value : matched;
        const matchedDims = matched && typeof matched === 'object' && matched.width > 0 && matched.height > 0
            ? { width: Number(matched.width), height: Number(matched.height) }
            : _rc_parseDims(matchedValue);
        const customResolutionActive = currentWidth > 0 && currentHeight > 0 && (
            widget.__rc_user_custom_resolution
            || (overrideEnabled && (
                !matchedDims
                || matchedDims.width !== currentWidth
                || matchedDims.height !== currentHeight
            ))
        );
        let nextValue = '';
        if (customResolutionActive) {
            customValue = `${currentWidth}\u00d7${currentHeight}|custom`;
            optionEntries.push({
                value: customValue,
                label: `Custom ${_rc_addRatio(currentWidth, currentHeight)}`,
            });
            nextValue = customValue;
        } else if (matched) {
            nextValue = matchedValue;
        }
        const optionsKey = optionEntries.map((entry) => `${entry.value}\u001f${entry.label}`).join('\u001e');
        if (ratioSelect.dataset.rcOptionsKey !== optionsKey) {
            ratioSelect.innerHTML = "";
            for (const entry of optionEntries) {
                const option = document.createElement('option');
                option.value = entry.value;
                option.textContent = entry.label;
                ratioSelect.appendChild(option);
            }
            ratioSelect.dataset.rcOptionsKey = optionsKey;
        }
        if (nextValue && ratioSelect.value !== nextValue) {
            ratioSelect.value = nextValue;
        }
    };

    const commitProjectedChoice = (choice, commit = true) => {
        if (!choice) return false;
        const choiceKey = projectedChoiceKey(choice.value);
        if (choice.pendingSource) {
            setHiddenOverride(false, commit);
            _ro_setSliderValue(targetWidthId, -1, { commit });
            _ro_setSliderValue(targetHeightId, -1, { commit });
            widget.__rc_projected_choice_key = choiceKey;
            widget.__rc_user_custom_resolution = false;
            widget.__rc_force_projected_default = true;
            writeSelection(useSceneSelection() ? choice.value : `${choice.value},${getActiveNonSceneTemplate(Object.keys(getRatios()))}`, commit);
            return true;
        }
        if (!(choice.width > 0 && choice.height > 0)) {
            if (choiceKey === 'origin') {
                setHiddenOverride(false, commit);
                _ro_setSliderValue(targetWidthId, -1, { commit });
                _ro_setSliderValue(targetHeightId, -1, { commit });
                widget.__rc_projected_choice_key = 'origin';
                widget.__rc_user_custom_resolution = false;
                widget.__rc_force_projected_default = true;
                writeSelection(useSceneSelection() ? choice.value : `${choice.value},${getActiveNonSceneTemplate(Object.keys(getRatios()))}`, commit);
                return true;
            }
            return false;
        }
        setHiddenOverride(true, commit);
        _ro_setSliderValue(targetWidthId, choice.width, { commit });
        _ro_setSliderValue(targetHeightId, choice.height, { commit });
        widget.__rc_last_committed_profile_resolution = `${choice.width}x${choice.height}`;
        widget.__rc_projected_choice_key = choice.custom && choice.area
            ? `custom-area:${choice.area}`
            : choiceKey;
        widget.__rc_user_custom_resolution = !!choice.custom;
        widget.__rc_force_projected_default = false;
        writeSelection(
            useSceneSelection() ? choice.value : `${choice.value},${getActiveNonSceneTemplate(Object.keys(getRatios()))}`,
            commit,
        );
        return true;
    };

    const applyRatio = (ratio, commit = true) => {
        if (!controlsAreInteractive()) return;
        if (!ratio) return;
        const customMatch = String(ratio || "").match(/^(\d+)\s*[xX\u00d7*]\s*(\d+)\|custom$/);
        if (customMatch) {
            const w = parseInt(customMatch[1], 10);
            const h = parseInt(customMatch[2], 10);
            if (w > 0 && h > 0) {
                setHiddenOverride(true, commit);
                if (overrideToggle) overrideToggle.checked = true;
                _ro_setSliderValue(targetWidthId, w, { commit });
                _ro_setSliderValue(targetHeightId, h, { commit });
                widget.__rc_projected_choice_key = profileUsesProjectedChoices(getActiveProfile()) ? `custom-area:${w * h}` : "";
                widget.__rc_user_custom_resolution = true;
                if (!useSceneSelection()) writeSelection(`${_rc_addRatio(w, h)},${getActiveNonSceneTemplate(Object.keys(getRatios()))}`, commit);
                render();
            }
            return;
        }
        const profile = getActiveProfile();
        if (profileUsesProjectedChoices(profile)) {
            commitProjectedChoice(getProjectedChoiceByValue(ratio), commit);
            render();
            return;
        }
        setHiddenOverride(false, commit);
        _ro_setSliderValue(targetWidthId, -1, { commit });
        _ro_setSliderValue(targetHeightId, -1, { commit });
        widget.__rc_projected_choice_key = "";
        widget.__rc_user_custom_resolution = false;
        if (randomToggle) _rc_setCheckboxValue(targetRandomId, randomToggle.checked, commit);
        const value = useSceneSelection() ? _rc_normalizeSceneRatio(ratio) : `${ratio},${templateSelect.value}`;
        writeSelection(value, commit);
        populateRatios();
        render();
    };

    const setManualDraft = (width, height, quantize = false, prefer = null) => {
        const mode = normalizeEditMode(_rc_getTextValue(targetEditModeId), 'proportional');
        const ratioLocked = mode !== 'proportional' && !!getRatioLock();
        if (ratioLocked) {
            const locked = applyRatioLockToPair(width, height, prefer || (document.activeElement === hInput ? 'height' : 'width'));
            width = locked.width;
            height = locked.height;
        }
        const pair = clampDims(width, height, mode === 'proportional' || ratioLocked, quantize);
        if (!(pair.width > 0 && pair.height > 0)) return null;
        widget.__rc_manual_editing = true;
        widget.__rc_manual_draft = {
            width: pair.width,
            height: pair.height,
            manual: true,
        };
        return widget.__rc_manual_draft;
    };
    const applyManual = (width, height, commit = true, quantize = true) => {
        if (!controlsAreInteractive()) return;
        const mode = normalizeEditMode(_rc_getTextValue(targetEditModeId), 'proportional');
        const ratioLocked = mode !== 'proportional' && !!getRatioLock();
        if (ratioLocked) {
            const locked = applyRatioLockToPair(width, height, document.activeElement === hInput ? 'height' : 'width');
            width = locked.width;
            height = locked.height;
        }
        const pair = clampDims(width, height, mode === 'proportional' || ratioLocked, quantize);
        const w = pair.width;
        const h = pair.height;
        if (!(w > 0 && h > 0)) return;
        widget.__rc_manual_draft = null;
        widget.__rc_manual_editing = false;
        setHiddenOverride(true, commit);
        if (overrideToggle) overrideToggle.checked = true;
        _ro_setSliderValue(targetWidthId, w, { commit });
        _ro_setSliderValue(targetHeightId, h, { commit });
        widget.__rc_projected_choice_key = profileUsesProjectedChoices(getActiveProfile()) ? `custom-area:${w * h}` : "";
        widget.__rc_user_custom_resolution = true;
        if (!useSceneSelection()) writeSelection(`${_rc_addRatio(w, h)},${getActiveNonSceneTemplate(Object.keys(getRatios()))}`, commit);
        populateRatios();
        render();
    };
    const previewManualDraft = () => {
        if (!controlsAreInteractive()) return;
        if (!setManualDraft(wInput.value, hInput.value, false)) return;
        render();
    };
    const commitManualDraft = () => {
        if (!widget.__rc_manual_editing && !widget.__rc_manual_draft) return;
        const draft = widget.__rc_manual_draft || { width: wInput.value, height: hInput.value };
        applyManual(draft.width, draft.height, true, true);
    };
    const stepDimensionInput = (input, direction) => {
        if (!controlsAreInteractive()) return;
        const step = readStep();
        const current = clampRawDim(input.value);
        if (!(current > 0)) return;
        const next = Math.max(64, Math.min(2048, current + direction * step));
        input.value = String(next);
        previewManualDraft();
    };
    const previewManualDrag = (width, height) => {
        if (!controlsAreInteractive()) return;
        if (!setManualDraft(width, height, false, 'width')) return;
        render();
    };

    const applyProportionalFromSource = (attempt = 0) => {
        const source = readImageSource(getSourceIds());
        const dims = getCurrentDims();
        if (!source || !(dims.width > 0 && dims.height > 0)) {
            if (attempt < 6) {
                window.setTimeout(() => applyProportionalFromSource(attempt + 1), 120);
            }
            return false;
        }
        const area = dims.width * dims.height;
        const ratio = source.width / Math.max(1, source.height);
        const width = Math.sqrt(area * ratio);
        const height = area / Math.max(1, width);
        applyManual(width, height, true);
        return true;
    };

    const syncFromHidden = () => {
        const profile = getActiveProfile();
        const activeMode = profileMode(profile);
        const preprocessFitMode = profilePreprocessFitMode(profile);
        const interactive = activeMode ? profileInteractive(profile) : true;
        syncModeButtonLabels();
        const profileKey = JSON.stringify({
            mode: activeMode,
            source: profile.source || "",
            preprocessFit: preprocessFitMode,
            preset: window.simpleaiTopbarSystemParams && window.simpleaiTopbarSystemParams.__preset,
            theme: window.simpleaiTopbarSystemParams && window.simpleaiTopbarSystemParams.__scene_theme,
            isScene: _rc_getCurrentSceneFlag(),
        });
        if (widget.__rc_profile_key !== profileKey) {
            widget.__rc_profile_key = profileKey;
            widget.__rc_user_custom_resolution = false;
            widget.__rc_user_edit_mode = false;
            widget.__rc_force_projected_default = true;
            widget.__rc_manual_draft = null;
            widget.__rc_manual_editing = false;
            if (profileUsesProjectedChoices(profile)) {
                widget.__rc_projected_choice_key = defaultProjectedChoiceKey();
                _rc_setTextValue(targetEditModeId, preprocessFitMode || 'proportional', true);
            } else {
                widget.__rc_projected_choice_key = "";
                if (profileUsesPreprocessFit(profile) && preprocessFitMode) {
                    _rc_setTextValue(targetEditModeId, preprocessFitMode, true);
                }
            }
            _rc_applyResolutionAccordionDefaultOpen(_rc_getCurrentSceneFlag());
        }
        setControlsInteractive(interactive);
        populateTemplates();
        if (profileUsesProjectedChoices(profile)) {
            const currentWidth = _ro_getSliderValue(targetWidthId);
            const currentHeight = _ro_getSliderValue(targetHeightId);
            const hasValidOverride = currentWidth > 0 && currentHeight > 0;
            const sourceReady = !!readImageSource(getSourceIds());
            const projectedKey = projectedChoiceKey(widget.__rc_projected_choice_key || defaultProjectedChoiceKey());
            if (!sourceReady && hasValidOverride && !widget.__rc_user_custom_resolution) {
                setHiddenOverride(false, true);
                _ro_setSliderValue(targetWidthId, -1, { commit: true });
                _ro_setSliderValue(targetHeightId, -1, { commit: true });
            }
            const hasValidOverrideNow = _ro_getSliderValue(targetWidthId) > 0 && _ro_getSliderValue(targetHeightId) > 0;
            const waitingForOriginalSource = !sourceReady && projectedKey === 'origin' && !hasValidOverrideNow;
            if (!waitingForOriginalSource && ((widget.__rc_force_projected_default && sourceReady) || !hasValidOverrideNow)) {
                commitProjectedChoice(getRememberedProjectedChoice() || getFirstProjectedChoice(), true);
            }
        }
        populateRatios();
        if (randomToggle) randomToggle.checked = _rc_getCheckboxValue(targetRandomId);
        if (overrideToggle) overrideToggle.checked = _rc_getCheckboxValue(targetOverrideId);
        if (originalInputToggle) originalInputToggle.checked = _rc_getCheckboxValue(targetOriginalInputId);
        const step = profileStep(profile) || _ro_getSliderValue(targetQuantizeId);
        if ([1, 8, 16, 32, 64].includes(step)) qStepSelect.value = String(step);
        if (profileStep(profile)) _ro_setSliderValue(targetQuantizeId, profileStep(profile), { commit: false });
        const multiplier = interactive ? _rc_getSliderFloat(targetMultiplierId, 1.0) : 1.0;
        multiplierInput.value = String(Math.max(1.0, Math.min(2.0, multiplier || 1.0)));
        if (!interactive) _ro_setSliderValue(targetMultiplierId, 1.0, { commit: false });
        if (activeMode === 'standard' && preprocessFitMode && !widget.__rc_user_edit_mode && normalizeEditMode(_rc_getTextValue(targetEditModeId), 'scale') !== preprocessFitMode) {
            _rc_setTextValue(targetEditModeId, preprocessFitMode, true);
        }
        const mode = normalizeEditMode(_rc_getTextValue(targetEditModeId), 'scale');
        for (const button of modeButtons) {
            toggleResolutionClass(button, 'active', button.dataset.mode === mode);
        }
        syncOriginalInputControls();
        syncRatioLockControls();
        render();
    };

    function render() {
        const dims = getCurrentDims();
        const waitingOriginal = !!(dims && dims.waitingOriginal);
        syncRatioLockControls();
        const multiplier = parseFloat(multiplierInput.value || "1") || 1;
        const step = readStep();
        syncDimensionInputStep();
        const effectiveW = waitingOriginal ? 0 : _rc_quantize(dims.width * multiplier, step);
        const effectiveH = waitingOriginal ? 0 : _rc_quantize(dims.height * multiplier, step);
        const widthValue = waitingOriginal ? "-1" : ((dims.manual || dims.profileMode) ? String(dims.width) : "-1");
        const heightValue = waitingOriginal ? "-1" : ((dims.manual || dims.profileMode) ? String(dims.height) : "-1");
        if (document.activeElement !== wInput && wInput.value !== widthValue) wInput.value = widthValue;
        if (document.activeElement !== hInput && hInput.value !== heightValue) hInput.value = heightValue;
        const rectText = waitingOriginal ? ((ratioSelect && ratioSelect.selectedOptions && ratioSelect.selectedOptions[0] && (ratioSelect.selectedOptions[0].textContent || '').trim()) || 'Original') : `${effectiveW}\u00d7${effectiveH}`;
        setResolutionText(rectLabel, rectText);
        syncAccordionTitle(effectiveW, effectiveH, { waitingOriginal });
        if (status) {
            const sourceText = dims.source ? `${dims.source.width}\u00d7${dims.source.height}` : `${dims.width}\u00d7${dims.height}`;
            setResolutionText(status, waitingOriginal ? '' : `${sourceText} \u2192 ${effectiveW}\u00d7${effectiveH}`);
        }
        if (waitingOriginal) {
            _rc_clearResolutionPreviewCanvas(canvas);
            setResolutionStyle(rect, 'display', 'none');
            return;
        }
        setResolutionStyle(rect, 'display', '');

        const padW = Math.max(1, pad.clientWidth || 1);
        const padH = Math.max(1, pad.clientHeight || 1);
        const viewportDims = getViewportDims({ width: effectiveW, height: effectiveH });
        const scale = Math.min((padW * 0.9) / Math.max(1, viewportDims.width), (padH * 0.9) / Math.max(1, viewportDims.height));
        const rw = Math.max(16, Math.round(effectiveW * scale));
        const rh = Math.max(16, Math.round(effectiveH * scale));
        const rx = Math.round((padW - rw) / 2);
        const ry = Math.round((padH - rh) / 2);
        setResolutionStyle(rect, 'width', `${rw}px`);
        setResolutionStyle(rect, 'height', `${rh}px`);
        setResolutionStyle(rect, 'left', `${rx}px`);
        setResolutionStyle(rect, 'top', `${ry}px`);
        widget.__rc_render_info = { scale: scale * multiplier, visualScale: scale, rx, ry, rw, rh, width: dims.width, height: dims.height, effectiveW, effectiveH };

        if (canvas) {
            const dpr = window.devicePixelRatio || 1;
            const canvasWidth = Math.max(1, Math.round(padW * dpr));
            const canvasHeight = Math.max(1, Math.round(padH * dpr));
            if (canvas.width !== canvasWidth) canvas.width = canvasWidth;
            if (canvas.height !== canvasHeight) canvas.height = canvasHeight;
            setResolutionStyle(canvas, 'width', `${padW}px`);
            setResolutionStyle(canvas, 'height', `${padH}px`);
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
                _rc_clearResolutionPreviewCanvas(canvas);
                const source = readImageSource(getSourceIds());
                if (source) {
                    const mode = normalizeEditMode(_rc_getTextValue(targetEditModeId), 'proportional');
                    let dw = rw;
                    let dh = rh;
                    let dx = rx;
                    let dy = ry;
                    if (mode === 'crop' || mode === 'proportional' || mode === 'pad') {
                        const fit = mode === 'crop'
                            ? Math.max(rw / source.width, rh / source.height)
                            : Math.min(rw / source.width, rh / source.height);
                        dw = source.width * fit;
                        dh = source.height * fit;
                        dx = rx + (rw - dw) / 2;
                        dy = ry + (rh - dh) / 2;
                    }
                    ctx.save();
                    ctx.beginPath();
                    ctx.rect(rx, ry, rw, rh);
                    ctx.clip();
                    try {
                        ctx.drawImage(source.node, dx, dy, dw, dh);
                    } catch (e) {}
                    ctx.restore();
                }
            }
        }
    }

    templateSelect.addEventListener('change', () => {
        populateRatios();
        applyRatio(ratioSelect.value, true);
    });
    ratioSelect.addEventListener('change', () => applyRatio(ratioSelect.value, true));
    randomToggle?.addEventListener('change', () => {
        _rc_setCheckboxValue(targetRandomId, randomToggle.checked, true);
        if (randomToggle.checked) {
            const options = Array.from(ratioSelect.options).map((option) => option.value).filter(Boolean);
            if (options.length) applyRatio(options[Math.floor(Math.random() * options.length)], true);
        }
    });
    originalInputToggle?.addEventListener('change', () => {
        _rc_setCheckboxValue(targetOriginalInputId, originalInputToggle.checked, true);
        syncOriginalInputControls();
        render();
    });
    overrideToggle?.addEventListener('change', () => {
        if (overrideToggle.checked) {
            const dims = getCurrentDims();
            applyManual(dims.width, dims.height, true);
        } else {
            setHiddenOverride(false, true);
            _ro_setSliderValue(targetWidthId, -1, { commit: true });
            _ro_setSliderValue(targetHeightId, -1, { commit: true });
            render();
        }
    });
    for (const input of [wInput, hInput]) {
        input.addEventListener('focus', () => {
            widget.__rc_manual_editing = true;
            previewManualDraft();
        });
        input.addEventListener('input', previewManualDraft);
        input.addEventListener('change', previewManualDraft);
        input.addEventListener('keydown', (event) => {
            if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                stepDimensionInput(input, event.key === 'ArrowUp' ? 1 : -1);
                event.preventDefault();
            }
            if (event.key === 'Enter') {
                commitManualDraft();
                input.blur();
                event.preventDefault();
            }
            if (event.key === 'Escape') {
                widget.__rc_manual_editing = false;
                widget.__rc_manual_draft = null;
                render();
                input.blur();
                event.preventDefault();
            }
        });
        input.addEventListener('blur', () => {
            window.setTimeout(() => {
                if (document.activeElement === wInput || document.activeElement === hInput) return;
                commitManualDraft();
            }, 0);
        });
    }
    qStepSelect.addEventListener('change', () => {
        const step = readStep();
        syncDimensionInputStep();
        _ro_setSliderValue(targetQuantizeId, step, { commit: true });
        const dims = getCurrentDims();
        if (dims.manual) applyManual(dims.width, dims.height, true);
        render();
    });
    multiplierInput.addEventListener('input', () => {
        _ro_setSliderValue(targetMultiplierId, multiplierInput.value, { commit: false });
        render();
    });
    multiplierInput.addEventListener('change', () => {
        _ro_setSliderValue(targetMultiplierId, multiplierInput.value, { commit: true });
        render();
    });
    for (const button of modeButtons) {
        button.addEventListener('click', () => {
            if (!controlsAreInteractive()) return;
            const mode = button.dataset.mode || 'scale';
            setMode(mode, true);
            if (mode === 'proportional') applyProportionalFromSource();
        });
    }
    ratioLockToggle?.addEventListener('change', () => {
        syncRatioLockControls();
        if (ratioLockToggle.checked) {
            const dims = getCurrentDims();
            applyManual(dims.width, dims.height, true);
        } else {
            render();
        }
    });
    ratioLockSelect?.addEventListener('change', () => {
        syncRatioLockControls();
        const dims = getCurrentDims();
        applyManual(dims.width, dims.height, true);
    });
    const commitCustomRatioLock = () => {
        const dims = getCurrentDims();
        applyManual(dims.width, dims.height, true);
    };
    const previewCustomRatioLock = () => {
        if (ratioLockToggle && ratioLockToggle.checked && ratioLockSelect && ratioLockSelect.value === 'custom') previewManualDraft();
    };
    ratioLockCustomW?.addEventListener('change', commitCustomRatioLock);
    ratioLockCustomH?.addEventListener('change', commitCustomRatioLock);
    ratioLockCustomW?.addEventListener('input', previewCustomRatioLock);
    ratioLockCustomH?.addEventListener('input', previewCustomRatioLock);

    const pointerToDims = (event) => {
        const drag = widget.__rc_drag_start;
        const info = widget.__rc_render_info || {};
        const scale = Math.max(0.0001, drag && drag.scale || info.scale || 1);
        let width = Math.max(64, (drag ? drag.width : getCurrentDims().width) + ((event.clientX - (drag ? drag.clientX : event.clientX)) / scale));
        let height = Math.max(64, (drag ? drag.height : getCurrentDims().height) + ((event.clientY - (drag ? drag.clientY : event.clientY)) / scale));
        const mode = normalizeEditMode(_rc_getTextValue(targetEditModeId), 'proportional');
        if (mode === 'proportional' && drag) {
            const startRectW = Math.max(1, drag.rw || 1);
            const startRectH = Math.max(1, drag.rh || 1);
            const sx = Math.max(0.1, (startRectW + (event.clientX - drag.clientX)) / startRectW);
            const sy = Math.max(0.1, (startRectH + (event.clientY - drag.clientY)) / startRectH);
            const factor = Math.max(sx, sy);
            width = drag.width * factor;
            height = drag.height * factor;
        } else if (drag) {
            const lockedRatio = getRatioLock();
            if (lockedRatio) {
                const startRectW = Math.max(1, drag.rw || 1);
                const startRectH = Math.max(1, drag.rh || 1);
                const sx = Math.max(0.1, (startRectW + (event.clientX - drag.clientX)) / startRectW);
                const sy = Math.max(0.1, (startRectH + (event.clientY - drag.clientY)) / startRectH);
                const factor = Math.max(sx, sy);
                width = drag.width * factor;
                height = width / Math.max(0.0001, lockedRatio);
            }
        }
        return { width: Math.round(width), height: Math.round(height) };
    };
    let dragging = false;
    pad.addEventListener('pointerdown', (event) => {
        if (!controlsAreInteractive()) return;
        dragging = true;
        const dims0 = getCurrentDims();
        const info = widget.__rc_render_info || {};
        widget.__rc_drag_start = {
            clientX: event.clientX,
            clientY: event.clientY,
            width: dims0.width,
            height: dims0.height,
            scale: info.scale || 1,
            rw: info.rw || 1,
            rh: info.rh || 1,
        };
        const dims = pointerToDims(event);
        previewManualDrag(dims.width, dims.height);
        pad.setPointerCapture?.(event.pointerId);
    });
    pad.addEventListener('pointermove', (event) => {
        if (!dragging) return;
        const dims = pointerToDims(event);
        previewManualDrag(dims.width, dims.height);
    });
    pad.addEventListener('pointerup', (event) => {
        if (!dragging) return;
        dragging = false;
        const dims = pointerToDims(event);
        applyManual(dims.width, dims.height, true);
        widget.__rc_drag_start = null;
    });
    pad.addEventListener('dblclick', () => {
        if (!controlsAreInteractive()) return;
        setHiddenOverride(false, true);
        _ro_setSliderValue(targetWidthId, -1, { commit: true });
        _ro_setSliderValue(targetHeightId, -1, { commit: true });
        render();
    });

    if ('ResizeObserver' in window) {
        const ro = new ResizeObserver(render);
        ro.observe(pad);
        widget.__rc_resize_observer = ro;
    }
    widget.dataset.rcInitialized = '1';
    widget.__rc_sync = syncFromHidden;
    _rc_scheduleSourceSync(widget, syncFromHidden);
    _rc_syncResolutionWidget(widget, syncFromHidden, { force: true });
}

function initResolutionControlWidgets(options = {}) {
    const force = options === true || (options && options.force === true);
    if (!force && _rc_isGenerationUiActive()) {
        _rc_scheduleResolutionControlIdleSync();
        return;
    }
    const widgets = _rc_getResolutionWidgets();
    for (const widget of widgets) initResolutionControlWidget(widget, options);
}

function syncResolutionControlWidgets(options = {}) {
    const force = options === true || (options && options.force === true);
    if (!force && _rc_isGenerationUiActive()) {
        _rc_scheduleResolutionControlIdleSync();
        return;
    }
    window.clearTimeout(window.__rc_resolution_empty_retry_timer);
    const widgets = _rc_getResolutionWidgets();
    const isScene = _rc_getCurrentSceneFlag();
    const appliedDefault = _rc_applyResolutionAccordionDefaultOpen(isScene);
    if (!widgets.length) {
        if (appliedDefault || isScene) {
            window.__rc_resolution_empty_retry_timer = window.setTimeout(() => {
                initResolutionControlWidgets();
                if (_rc_getResolutionWidgets().length) {
                    syncResolutionControlWidgets();
                }
            }, 260);
        }
        return;
    }
    for (const widget of widgets) {
        if (widget && typeof widget.__rc_sync === 'function') {
            if (force) {
                _rc_syncResolutionWidget(widget, widget.__rc_sync, { force: true });
            } else {
                _rc_scheduleResolutionWidgetSync(widget, widget.__rc_sync, { delay: 60, minInterval: 180 });
            }
        } else {
            initResolutionControlWidget(widget, options);
        }
    }
}

function refreshResolutionControlSource(sourceId, reason) {
    simpaiUiTrace("log", '[UI-TRACE] resolution_control.source_refresh', { sourceId, reason });
    const reasonText = String(reason || '');
    const mutatesSource = reasonText === 'upload' || reasonText === 'clear' || reasonText === 'change';
    const delays = mutatesSource ? [0, 220, 900, 1800] : [80, 420];
    const token = (Number(window.__rc_resolution_source_refresh_token || 0) || 0) + 1;
    window.__rc_resolution_source_refresh_token = token;
    if (Array.isArray(window.__rc_resolution_source_refresh_timers)) {
        for (const timer of window.__rc_resolution_source_refresh_timers) {
            window.clearTimeout(timer);
        }
    }
    window.__rc_resolution_source_refresh_timers = [];
    for (const delay of delays) {
        const timer = window.setTimeout(() => {
            if (window.__rc_resolution_source_refresh_token !== token) return;
            for (const widget of _rc_getResolutionWidgets()) {
                const wasInitialized = widget?.dataset?.rcInitialized === '1';
                if (!wasInitialized) initResolutionControlWidget(widget, { force: delay === 0 });
                _rc_markResolutionSourceDirty(widget);
                if (mutatesSource) {
                    const customArea = String(widget.__rc_projected_choice_key || '').startsWith('custom-area:');
                    widget.__rc_user_custom_resolution = customArea;
                    widget.__rc_force_projected_default = reasonText !== 'clear';
                }
                if (widget && typeof widget.__rc_sync === 'function') {
                    _rc_scheduleResolutionWidgetSync(widget, widget.__rc_sync, {
                        delay: delay === 0 ? 0 : 40,
                        minInterval: delay === 0 ? 80 : 180,
                    });
                }
            }
        }, delay);
        window.__rc_resolution_source_refresh_timers.push(timer);
    }
}

function clear_resolution_override_values_for_ratio_select() {
    _rc_setCheckboxValue('use_resolution_override_checkbox', false, true);
    _rc_setCheckboxValue('scene_use_resolution_override_checkbox', false, false);
    _rc_setCheckboxValue('resolution_original_input_checkbox', false, true);
    _ro_setSliderValue('overwrite_width', -1, { commit: true });
    _ro_setSliderValue('overwrite_height', -1, { commit: true });
    syncResolutionControlWidgets();
}

onUiLoaded(initResolutionControlWidgets);
onAfterUiUpdate(initResolutionControlWidgets);

function restorePresetStoreToManagedTree(node = null) {
    const host = document.getElementById('simpleai_floating_host');
    const target = node || (host ? Array.from(host.querySelectorAll('.preset_store')).pop() : null);
    if (!target || target.parentElement !== host) return false;

    const originalParent = target.__simpleaiFloatingOriginalParent;
    if (!originalParent || !originalParent.isConnected) return false;
    const originalNextSibling = target.__simpleaiFloatingOriginalNextSibling;

    target.classList.remove('simpleai-floating-portal-node');
    delete target.dataset.simpleaiPortal;
    if (originalNextSibling && originalNextSibling.parentElement === originalParent) {
        originalParent.insertBefore(target, originalNextSibling);
    } else {
        originalParent.appendChild(target);
    }
    originalParent.classList.remove('simpleai-floating-placeholder');
    return true;
}

window.restorePresetStoreToManagedTree = restorePresetStoreToManagedTree;

function portalFloatingShells(options = {}) {
    const hostId = 'simpleai_floating_host';
    let host = document.getElementById(hostId);
    if (!host) {
        host = document.createElement('div');
        host.id = hostId;
        host.className = 'simpleai-floating-host';
        document.body.appendChild(host);
    }

    const targets = [
        { id: 'identity_dialog', selectors: ['#identity_dialog', '#identity_dialog_content', '.identity_note'] },
        { id: 'missing_model_modal', selectors: ['#missing_model_modal', '#missing_model_modal_content'] },
        { id: 'model_browser_modal', selectors: ['#model_browser_modal', '#model_browser_modal_content'] },
        { id: 'user_personal_wildcards_modal', selectors: ['#user_personal_wildcards_modal', '#user_personal_wildcards_modal_content'] },
        { id: 'restore_defaults_panel', selectors: ['#restore_defaults_panel', '#restore_defaults_panel_content'] },
        { id: 'preset_store', selectors: ['.preset_store'], collapseParent: true },
    ];
    const forcePresetStore = !!(options && options.forcePresetStore);
    const shouldPortalPresetStore = forcePresetStore
        || document.documentElement.classList.contains('preset-store-open');

    const isStopNode = (node) => {
        if (!node || node === document.body || node === host) return true;
        if (node.id === 'main_content' || node.id === 'main_layout_row') return true;
        if (node.classList?.contains('gradio-container')) return true;
        return false;
    };

    const findTargetNode = (target) => {
        for (const selector of target.selectors) {
            let node = null;
            try {
                node = document.querySelector(selector);
            } catch (e) {
                node = null;
            }
            if (node) return node;
        }
        return null;
    };

    const getPortalNode = (node, target) => {
        if (!node) return null;
        if (node.parentElement === host) return node;
        return node;
    };

    targets.forEach((target) => {
        if (target.id === 'preset_store' && !shouldPortalPresetStore) {
            const hostedStores = Array.from(host.querySelectorAll('.preset_store'));
            hostedStores.forEach((store) => restorePresetStoreToManagedTree(store));
            return;
        }
        const node = findTargetNode(target);
        if (!node) return;
        const portalNode = getPortalNode(node, target);
        if (!portalNode) return;
        if (portalNode.parentElement === host) {
            if (target.id === 'preset_store') {
                const stores = Array.from(host.querySelectorAll('.preset_store'));
                stores.slice(0, -1).forEach((store) => {
                    if (store === portalNode) return;
                    store.setAttribute('hidden', '');
                    store.classList.add('hidden', 'hide');
                    store.style.display = 'none';
                    store.style.pointerEvents = 'none';
                });
            }
            if (target.id === 'identity_dialog' && typeof initIdentityPopup === 'function') {
                initIdentityPopup();
            }
            return;
        }
        const originalParent = portalNode.parentElement;
        if (target.id === 'preset_store') {
            portalNode.__simpleaiFloatingOriginalParent = originalParent;
            portalNode.__simpleaiFloatingOriginalNextSibling = portalNode.nextSibling;
        }
        portalNode.classList.add('simpleai-floating-portal-node');
        portalNode.dataset.simpleaiFloatingFor = target.id;
        host.appendChild(portalNode);
        if (target.id === 'preset_store') {
            const stores = Array.from(host.querySelectorAll('.preset_store'));
            stores.slice(0, -1).forEach((store) => {
                if (store === portalNode) return;
                store.setAttribute('hidden', '');
                store.classList.add('hidden', 'hide');
                store.style.display = 'none';
                store.style.pointerEvents = 'none';
            });
        }
        if (target.id === 'identity_dialog' && typeof initIdentityPopup === 'function') {
            initIdentityPopup();
        }
        if (
            target.collapseParent
            && originalParent
            && !isStopNode(originalParent)
            && (!originalParent.children || originalParent.children.length === 0)
        ) {
            originalParent.classList.add('simpleai-floating-placeholder');
        }
        node.dataset.simpleaiPortal = '1';
    });
}

window.portalFloatingShells = portalFloatingShells;

onUiLoaded(portalFloatingShells);
onAfterUiUpdate(portalFloatingShells);
setInterval(portalFloatingShells, 1000);

function setImportantStyle(el, name, value) {
    if (!el) return;
    el.style.setProperty(name, value, 'important');
}

function installResizablePopup(content, options = {}) {
    if (!content) return { ensureWithinViewport: () => {}, syncCurrentRectToInline: () => null };
    if (content.__simpleaiResizeState) {
        return content.__simpleaiResizeState;
    }

    const modal = options.modal || content;
    const margin = Number.isFinite(options.margin) ? options.margin : 12;
    const minWidth = Number.isFinite(options.minWidth) ? options.minWidth : 420;
    const minHeight = Number.isFinite(options.minHeight) ? options.minHeight : 240;
    const disabled = typeof options.disabled === 'function' ? options.disabled : () => false;
    const isHidden = typeof options.isHidden === 'function'
        ? options.isHidden
        : () => {
            const anchor = modal && modal !== content ? modal : content;
            const style = getComputedStyle(anchor);
            return style.display === 'none'
                || anchor.classList.contains('hidden')
                || anchor.classList.contains('hide')
                || anchor.hidden;
        };

    const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
    const getMinPopupWidth = () => Math.max(160, Math.min(minWidth, window.innerWidth - margin * 2));
    const getMinPopupHeight = () => Math.max(180, Math.min(minHeight, window.innerHeight - margin * 2));

    const syncCurrentRectToInline = () => {
        const rect = content.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return null;
        setImportantStyle(content, 'transform', 'none');
        setImportantStyle(content, 'left', `${Math.round(rect.left)}px`);
        setImportantStyle(content, 'top', `${Math.round(rect.top)}px`);
        setImportantStyle(content, 'right', 'auto');
        setImportantStyle(content, 'bottom', 'auto');
        setImportantStyle(content, 'width', `${Math.round(rect.width)}px`);
        setImportantStyle(content, 'height', `${Math.round(rect.height)}px`);
        content.dataset.simpleaiResizeManaged = '1';
        return rect;
    };

    const ensureWithinViewport = (forceFrame = false) => {
        if (isHidden()) return;

        const hasManagedFrame = forceFrame
            || content.dataset.simpleaiResizeManaged === '1'
            || !!content.style.left
            || !!content.style.top
            || !!content.style.width
            || !!content.style.height;

        if (!hasManagedFrame) return;

        let rect = content.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;

        if (getComputedStyle(content).transform !== 'none') {
            rect = syncCurrentRectToInline() || rect;
        }

        const maxWidth = Math.max(getMinPopupWidth(), window.innerWidth - margin * 2);
        const maxHeight = Math.max(getMinPopupHeight(), window.innerHeight - margin * 2);

        if (rect.width > maxWidth) {
            setImportantStyle(content, 'width', `${maxWidth}px`);
        }
        if (rect.height > maxHeight) {
            setImportantStyle(content, 'height', `${maxHeight}px`);
        }

        rect = content.getBoundingClientRect();
        const maxLeft = Math.max(margin, window.innerWidth - margin - rect.width);
        const maxTop = Math.max(margin, window.innerHeight - margin - rect.height);
        const nextLeft = clamp(rect.left, margin, maxLeft);
        const nextTop = clamp(rect.top, margin, maxTop);

        setImportantStyle(content, 'transform', 'none');
        setImportantStyle(content, 'left', `${Math.round(nextLeft)}px`);
        setImportantStyle(content, 'top', `${Math.round(nextTop)}px`);
        setImportantStyle(content, 'right', 'auto');
        setImportantStyle(content, 'bottom', 'auto');
    };

    content.classList.add('simpleai-resizable-popup');

    let resizeHandle = content.querySelector('.simpleai-popup-resize-handle');
    if (!resizeHandle) {
        resizeHandle = document.createElement('div');
        resizeHandle.className = 'simpleai-popup-resize-handle';
        resizeHandle.title = 'Resize window';
        resizeHandle.setAttribute('aria-label', 'Resize window');
        content.appendChild(resizeHandle);
    }

    let resizing = false;
    let resizeStartWidth = 0;
    let resizeStartHeight = 0;
    let resizeStartX = 0;
    let resizeStartY = 0;

    const onResizeMove = (e) => {
        if (!resizing) return;
        const rect = content.getBoundingClientRect();
        const minPopupWidth = getMinPopupWidth();
        const minPopupHeight = getMinPopupHeight();
        const maxWidth = Math.max(minPopupWidth, window.innerWidth - margin - rect.left);
        const maxHeight = Math.max(minPopupHeight, window.innerHeight - margin - rect.top);
        const nextWidth = clamp(resizeStartWidth + ((e.clientX ?? 0) - resizeStartX), minPopupWidth, maxWidth);
        const nextHeight = clamp(resizeStartHeight + ((e.clientY ?? 0) - resizeStartY), minPopupHeight, maxHeight);

        setImportantStyle(content, 'transform', 'none');
        setImportantStyle(content, 'width', `${Math.round(nextWidth)}px`);
        setImportantStyle(content, 'height', `${Math.round(nextHeight)}px`);
        e.preventDefault();
    };

    const clearResizeActive = () => {
        delete content.dataset.simpleaiResizeActive;
    };

    const onResizeUp = () => {
        resizing = false;
        clearResizeActive();
        window.removeEventListener('pointermove', onResizeMove, true);
        window.removeEventListener('pointerup', onResizeUp, true);
        window.removeEventListener('pointercancel', onResizeUp, true);
        ensureWithinViewport(true);
    };

    const onResizeDown = (e) => {
        if (e.button !== 0) return;
        if (isHidden() || disabled()) return;

        const rect = syncCurrentRectToInline() || content.getBoundingClientRect();
        if (!rect || rect.width <= 0 || rect.height <= 0) return;

        resizing = true;
        content.dataset.simpleaiResizeActive = '1';
        resizeStartWidth = rect.width;
        resizeStartHeight = rect.height;
        resizeStartX = e.clientX ?? 0;
        resizeStartY = e.clientY ?? 0;

        window.addEventListener('pointermove', onResizeMove, true);
        window.addEventListener('pointerup', onResizeUp, true);
        window.addEventListener('pointercancel', onResizeUp, true);
        e.preventDefault();
        e.stopPropagation();
    };

    if (resizeHandle.dataset.simpleaiResizeBound !== '1') {
        resizeHandle.dataset.simpleaiResizeBound = '1';
        resizeHandle.addEventListener('pointerdown', onResizeDown, { passive: false });
    }

    window.addEventListener('resize', () => ensureWithinViewport(false));

    const state = { ensureWithinViewport, syncCurrentRectToInline, isInteracting: () => resizing };
    content.__simpleaiResizeState = state;
    return state;
}

window.installResizablePopup = installResizablePopup;

window.simpleaiTraceFloating = function(id) {
    const aliases = {
        identity_dialog: ['#identity_dialog', '#identity_dialog_content', '.identity_note'],
        missing_model_modal: ['#missing_model_modal', '#missing_model_modal_content'],
        model_browser_modal: ['#model_browser_modal', '#model_browser_modal_content'],
        user_personal_wildcards_modal: ['#user_personal_wildcards_modal', '#user_personal_wildcards_modal_content'],
        restore_defaults_panel: ['#restore_defaults_panel', '#restore_defaults_panel_content'],
    };
    const selectors = aliases[id] || [`#${id}`, id];
    let node = null;
    for (const selector of selectors) {
        try {
            node = document.querySelector(selector);
        } catch (e) {
            node = document.getElementById(selector.replace(/^#/, ''));
        }
        if (node) break;
    }
    if (!node) return null;
    const chain = [];
    let current = node;
    let depth = 0;
    while (current && depth < 10) {
        const cs = getComputedStyle(current);
        const rect = current.getBoundingClientRect();
        chain.push({
            depth,
            tag: current.tagName,
            id: current.id || '',
            className: String(current.className || '').slice(0, 220),
            display: cs.display,
            position: cs.position,
            width: rect.width,
            height: rect.height,
            x: rect.x,
            y: rect.y,
        });
        current = current.parentElement;
        depth += 1;
    }
    console.table(chain);
    return chain;
};

function simpleaiLocalText(en, cn, source) {
    try {
        if (window.SimpAII18n?.t) return window.SimpAII18n.t(en, cn, source);
    } catch (e) {}
    const lang = String(window.locale_lang || "").toLowerCase();
    return String(lang.startsWith("en") ? (en ?? cn ?? "") : (cn ?? en ?? ""));
}

function initParameterProfilePlaceholder() {
    const root = gradioApp();
    const container = root?.querySelector?.('#parameter_profile_select') || document.getElementById('parameter_profile_select');
    if (!container) return;
    const input = container.querySelector?.('input, textarea, [contenteditable="true"]');
    if (!input) return;

    const englishText = 'Type name to save params';
    const displayText = simpleaiLocalText(englishText, '输入名称后保存当前参数', window.simpleaiTopbarSystemParams || {});
    try {
        if (input.getAttribute('data-original-placeholder') !== englishText) {
            input.setAttribute('data-original-placeholder', englishText);
        }
        if (input.getAttribute('aria-label') !== displayText) input.setAttribute('aria-label', displayText);
        if (typeof input.placeholder === 'string') {
            if (input.placeholder !== displayText) input.placeholder = displayText;
        } else {
            if (input.getAttribute('data-placeholder') !== displayText) input.setAttribute('data-placeholder', displayText);
        }
    } catch (e) {}
}

function scheduleParameterProfilePlaceholder() {
    initParameterProfilePlaceholder();
    setTimeout(initParameterProfilePlaceholder, 120);
    setTimeout(initParameterProfilePlaceholder, 600);
}

onUiLoaded(scheduleParameterProfilePlaceholder);
onAfterUiUpdate(initParameterProfilePlaceholder);

function initIdentityPopup() {
    const content = document.getElementById('identity_dialog_content');
    if (!content) return;
    initIdentityGuestEntryBridge();
    const alreadyInited = content.dataset.identityPopupInited === '1';

    content.classList.add('simpleai-identity-card');
    content.classList.remove('simpleai-resizable-popup');
    content.querySelectorAll(':scope > .simpleai-popup-resize-handle').forEach((node) => node.remove());

    const margin = 10;
    const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
    const applyDefaultPosition = () => {
        const isMobile = window.matchMedia?.('(max-width: 760px)')?.matches || window.innerWidth <= 760;
        setImportantStyle(content, 'top', isMobile ? 'max(8px, env(safe-area-inset-top))' : '72px');
        setImportantStyle(content, 'left', '50%');
        setImportantStyle(content, 'right', 'auto');
        setImportantStyle(content, 'bottom', isMobile ? 'max(8px, env(safe-area-inset-bottom))' : 'auto');
        setImportantStyle(content, 'transform', 'translateX(-50%)');
        setImportantStyle(content, 'width', isMobile ? 'calc(100vw - 16px)' : 'min(800px, calc(100vw - 48px))');
        setImportantStyle(content, 'min-width', '0');
        setImportantStyle(content, 'max-width', isMobile ? 'calc(100vw - 16px)' : 'calc(100vw - 48px)');
        setImportantStyle(content, 'height', isMobile ? 'calc(100dvh - max(16px, calc(env(safe-area-inset-top) + env(safe-area-inset-bottom))))' : 'auto');
        setImportantStyle(content, 'max-height', isMobile ? 'none' : 'calc(100vh - 96px)');
    };
    const keepInsideViewport = () => {
        const rect = content.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const maxLeft = Math.max(margin, window.innerWidth - margin - rect.width);
        const maxTop = Math.max(margin, window.innerHeight - margin - rect.height);
        setImportantStyle(content, 'transform', 'none');
        setImportantStyle(content, 'left', `${Math.round(clamp(rect.left, margin, maxLeft))}px`);
        setImportantStyle(content, 'top', `${Math.round(clamp(rect.top, margin, maxTop))}px`);
        setImportantStyle(content, 'right', 'auto');
        setImportantStyle(content, 'bottom', 'auto');
    };

    if (!alreadyInited && content.dataset.identityUserMoved !== '1') {
        applyDefaultPosition();
    } else if (content.dataset.identityUserMoved === '1') {
        keepInsideViewport();
    }

    let titlebar = content.querySelector(':scope > .simpleai-floating-titlebar');
    if (!titlebar) {
        titlebar = document.createElement('div');
        titlebar.className = 'simpleai-floating-titlebar';
        content.insertBefore(titlebar, content.firstChild);
    }
    let titleText = titlebar.querySelector(':scope > span');
    if (!titleText) {
        titleText = document.createElement('span');
        titlebar.insertBefore(titleText, titlebar.firstChild);
    }
    titleText.setAttribute('data-original-text', 'IdentityCard');
    titleText.textContent = simpleaiLocalText('IdentityCard', '身份卡片');

    let closeButton = document.getElementById('identity_dialog_close_button')
        || titlebar.querySelector(':scope > .simpleai-floating-close');
    if (!closeButton) {
        closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.className = 'simpleai-floating-close';
        closeButton.textContent = '×';
        titlebar.appendChild(closeButton);
    } else if (closeButton.parentElement !== titlebar) {
        titlebar.appendChild(closeButton);
    }
    closeButton.setAttribute('aria-label', simpleaiLocalText('Close', '关闭'));

    if (closeButton.id === 'identity_dialog_close_button' && closeButton.dataset.identityCloseBridge !== '1') {
        closeButton.dataset.identityCloseBridge = '1';
        closeButton.addEventListener('click', () => {
            window.__simpleaiIdentityKeepOpenUntil = 0;
            window.__simpleaiIdentityReopenSent = true;
            window.__simpleaiIdentityReopenInFlight = false;
        }, true);
    }

    const closeBtn = titlebar.querySelector('.simpleai-floating-close');
    if (
        closeBtn
        && closeBtn.id !== 'identity_dialog_close_button'
        && closeBtn.dataset.identityCloseBound !== '1'
    ) {
        closeBtn.dataset.identityCloseBound = '1';
        closeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const gradioRoot = typeof gradioApp === 'function' ? gradioApp() : null;
            const findById = (id) => document.getElementById(id)
                || gradioRoot?.getElementById?.(id)
                || gradioRoot?.querySelector?.(`#${id}`);
            const identityRoot = findById('identity_center')
                || (() => {
                    const guestStoreButton = findById('bar_store');
                    return guestStoreButton?.classList?.contains('simpleai-guest-identity')
                        ? guestStoreButton
                        : null;
                })();
            const identityBtn = identityRoot && (
                identityRoot.matches?.('button')
                    ? identityRoot
                    : identityRoot.querySelector?.('button')
            );
            if (identityBtn) {
                identityBtn.click();
            }
        }, true);
    }

    if (titlebar.dataset.identityDragBound !== '1') {
        titlebar.dataset.identityDragBound = '1';
        let dragging = false;
        let startX = 0;
        let startY = 0;
        let startLeft = 0;
        let startTop = 0;

        const onMove = (e) => {
            if (!dragging) return;
            const rect = content.getBoundingClientRect();
            const maxLeft = Math.max(margin, window.innerWidth - margin - rect.width);
            const maxTop = Math.max(margin, window.innerHeight - margin - rect.height);
            const nextLeft = clamp(startLeft + ((e.clientX ?? 0) - startX), margin, maxLeft);
            const nextTop = clamp(startTop + ((e.clientY ?? 0) - startY), margin, maxTop);
            content.dataset.identityUserMoved = '1';
            setImportantStyle(content, 'transform', 'none');
            setImportantStyle(content, 'left', `${Math.round(nextLeft)}px`);
            setImportantStyle(content, 'top', `${Math.round(nextTop)}px`);
            setImportantStyle(content, 'right', 'auto');
            setImportantStyle(content, 'bottom', 'auto');
            e.preventDefault();
        };

        const onUp = () => {
            dragging = false;
            titlebar.classList.remove('simpleai-dragging');
            window.removeEventListener('pointermove', onMove, true);
            window.removeEventListener('pointerup', onUp, true);
            keepInsideViewport();
        };

        titlebar.addEventListener('pointerdown', (e) => {
            if (e.button !== 0 || e.target?.closest?.('.simpleai-floating-close')) return;
            const rect = content.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            dragging = true;
            startX = e.clientX ?? 0;
            startY = e.clientY ?? 0;
            startLeft = rect.left;
            startTop = rect.top;
            titlebar.classList.add('simpleai-dragging');
            window.addEventListener('pointermove', onMove, true);
            window.addEventListener('pointerup', onUp, true);
            e.preventDefault();
        }, { passive: false });
    }

    if (content.dataset.identityViewportBound !== '1') {
        content.dataset.identityViewportBound = '1';
        window.addEventListener('resize', () => {
            if (content.dataset.identityUserMoved === '1') keepInsideViewport();
            else applyDefaultPosition();
        });
    }

    content.dataset.identityPopupInited = '1';
    if (content.dataset.identityVisibilityBridge !== '1') {
        content.dataset.identityVisibilityBridge = '1';
        const restoreVisible = () => {
            const keepOpenUntil = Number(window.__simpleaiIdentityKeepOpenUntil || 0);
            if (keepOpenUntil <= Date.now()) return;
            const hidden = content.hidden
                || content.classList.contains('hide')
                || content.classList.contains('hidden')
                || getComputedStyle(content).display === 'none';
            if (!hidden) return;
            content.hidden = false;
            content.removeAttribute('hidden');
            content.removeAttribute('aria-hidden');
            content.classList.remove('hide', 'hidden');
            content.style.removeProperty('display');
            content.style.removeProperty('visibility');
            content.style.removeProperty('pointer-events');
            if (window.__simpleaiIdentityReopenSent) return;
            window.__simpleaiIdentityReopenSent = true;
            window.__simpleaiIdentityReopenInFlight = true;
            const button = document.getElementById('bar_store');
            if (button?.classList?.contains('simpleai-guest-identity')) {
                dispatchIdentityGuestEntry(button);
            }
            window.setTimeout(() => {
                window.__simpleaiIdentityReopenInFlight = false;
            }, 2400);
        };
        const observer = new MutationObserver(() => window.setTimeout(restoreVisible, 0));
        observer.observe(content, { attributes: true, attributeFilter: ['class', 'style', 'hidden', 'aria-hidden'] });
        content.__simpleaiIdentityVisibilityObserver = observer;
        restoreVisible();
    }
}

function dispatchIdentityGuestEntry(button) {
    if (!button) return;
    const rect = button.getBoundingClientRect?.();
    const x = rect?.left ? rect.left + Math.max(1, rect.width / 2) : 1;
    const y = rect?.top ? rect.top + Math.max(1, rect.height / 2) : 1;
    const eventInit = { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y };
    try { button.dispatchEvent(new PointerEvent('pointerdown', eventInit)); } catch (e) {}
    try { button.dispatchEvent(new PointerEvent('pointerup', eventInit)); } catch (e) {}
    try { button.dispatchEvent(new MouseEvent('click', eventInit)); } catch (e) {}
}

function initIdentityGuestEntryBridge() {
    const button = document.getElementById('bar_store');
    if (!button || button.dataset.identityEntryBridge === '1') return;
    button.dataset.identityEntryBridge = '1';
    button.addEventListener('click', () => {
        if (!button.classList.contains('simpleai-guest-identity')) return;
        if (window.__simpleaiIdentityReopenInFlight) return;
        window.__simpleaiIdentityKeepOpenUntil = Date.now() + 6500;
        window.__simpleaiIdentityReopenSent = false;
    }, true);
}

onUiLoaded(initIdentityGuestEntryBridge);
onAfterUiUpdate(initIdentityGuestEntryBridge);
setInterval(initIdentityGuestEntryBridge, 1000);

onUiLoaded(initIdentityPopup);
onAfterUiUpdate(initIdentityPopup);
setInterval(initIdentityPopup, 1000);

function initIdentityUploadDebug() {
    const root = document.getElementById('identity_qr');
    if (!root || root.dataset.identityUploadDebug === '1') return;
    root.dataset.identityUploadDebug = '1';
}

onUiLoaded(initIdentityUploadDebug);
onAfterUiUpdate(initIdentityUploadDebug);

function getGradioFieldValue(rootId) {
    const root = document.getElementById(rootId);
    const field = root?.querySelector?.('textarea, input');
    return field?.value || '';
}

function applyIdentityStage(reason = 'manual') {
    if (!document.getElementById('identity_stage_state')) return false;
    const dialog = document.getElementById('identity_dialog_content');
    if (dialog) {
        const dialogStyle = window.getComputedStyle(dialog);
        if (dialogStyle.display === 'none' || dialog.classList.contains('hide') || dialog.classList.contains('hidden')) {
            return false;
        }
    }
    const stage = getGradioFieldValue('identity_stage_state') || 'input';
    const show = (id, display = '') => {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.remove('hide', 'hidden');
        el.removeAttribute('aria-hidden');
        el.hidden = false;
        if (display) {
            setImportantStyle(el, 'display', display);
        } else {
            el.style.removeProperty('display');
        }
        setImportantStyle(el, 'visibility', 'visible');
    };
    const hide = (id) => {
        const el = document.getElementById(id);
        if (!el) return;
        setImportantStyle(el, 'display', 'none');
    };

    const isInput = stage === 'input' || stage === 'closed' || stage === 'uploading';
    const isVcode = stage === 'vcode';
    const isPhraseSet = stage === 'phrase_set' || stage === 'phrase';
    const isPhraseConfirm = stage === 'phrase_confirm';
    const isConfirm = stage === 'confirm';
    const isUnbind = stage === 'unbind' || stage === 'summary';
    const showPhraseRow = isPhraseSet || isPhraseConfirm || isConfirm || isUnbind;

    if (isInput) show('identity_input_row', 'grid'); else hide('identity_input_row');
    if (isInput) hide('identity_id_display_row'); else show('identity_id_display_row', 'grid');

    if (isVcode) {
        show('identity_vcode_row', 'grid');
        show('identity_vcode_input', 'block');
        show('identity_verify_button', 'inline-flex');
    } else {
        hide('identity_vcode_row');
        hide('identity_vcode_input');
        hide('identity_verify_button');
    }

    if (showPhraseRow) {
        show('identity_phrase_row', 'grid');
        show('identity_phrase_input', 'block');
    } else {
        hide('identity_phrase_row');
        hide('identity_phrase_input');
    }

    if (isPhraseSet) show('identity_phrases_set_button', 'inline-flex'); else hide('identity_phrases_set_button');
    if (isPhraseConfirm) show('identity_phrases_confirm_button', 'inline-flex'); else hide('identity_phrases_confirm_button');
    if (isConfirm) show('identity_confirm_button', 'inline-flex'); else hide('identity_confirm_button');
    if (isUnbind) show('identity_unbind_button', 'inline-flex'); else hide('identity_unbind_button');

    return true;
}

let identityStagePollTimer = null;

function startIdentityStagePoll(reason = 'manual') {
    if (identityStagePollTimer) return;
    const startedAt = Date.now();
    identityStagePollTimer = window.setInterval(() => {
        const didApply = applyIdentityStage(`stage_poll:${reason}`);
        const stage = getGradioFieldValue('identity_stage_state') || 'input';
        const elapsed = Date.now() - startedAt;
        const shouldStop = !didApply
            ? elapsed > 3000
            : stage === 'closed'
                || (elapsed > 10000 && (stage === 'input' || stage === 'summary' || stage === 'unbind'));
        if (shouldStop) {
            window.clearInterval(identityStagePollTimer);
            identityStagePollTimer = null;
        }
    }, 500);
}

function initIdentityStageSync() {
    const root = document.getElementById('identity_stage_state');
    if (!root || root.dataset.identityStageSync === '1') return;
    root.dataset.identityStageSync = '1';
    root.addEventListener('input', () => scheduleIdentityStageApply('stage_input'), true);
    root.addEventListener('change', () => scheduleIdentityStageApply('stage_change'), true);
    const field = root.querySelector('textarea, input');
    if (field && field.dataset.identityStageFieldSync !== '1') {
        field.dataset.identityStageFieldSync = '1';
        new MutationObserver(() => scheduleIdentityStageApply('stage_value_mutation')).observe(field, {
            attributes: true,
            attributeFilter: ['value'],
        });
    }
    scheduleIdentityStageApply('stage_init');
}

function initIdentityStageActionSync() {
    const ids = [
        'identity_center',
        'identity_change_button',
        'identity_qr',
        'identity_bind_button',
        'identity_verify_button',
        'identity_phrases_set_button',
        'identity_phrases_confirm_button',
        'identity_confirm_button',
        'identity_unbind_button',
    ];
    ids.forEach((id) => {
        const el = document.getElementById(id);
        if (!el || el.dataset.identityStageActionSync === '1') return;
        el.dataset.identityStageActionSync = '1';
        el.addEventListener('click', () => scheduleIdentityStageApply(`action:${id}`), true);
        el.addEventListener('change', () => scheduleIdentityStageApply(`action_change:${id}`), true);
    });
}

function scheduleIdentityStageApply(reason) {
    applyIdentityStage(`${reason}:0ms`);
    window.setTimeout(() => applyIdentityStage(`${reason}:80ms`), 80);
    window.setTimeout(() => applyIdentityStage(`${reason}:250ms`), 250);
    window.setTimeout(() => applyIdentityStage(`${reason}:700ms`), 700);
    startIdentityStagePoll(reason);
}

onUiLoaded(initIdentityStageSync);
onAfterUiUpdate(initIdentityStageSync);
onUiLoaded(initIdentityStageActionSync);
onAfterUiUpdate(initIdentityStageActionSync);
onAfterUiUpdate(() => scheduleIdentityStageApply('after_ui_update'));

function traceIdentityFlowDom(reason) {
    const ids = [
        'identity_input_row',
        'identity_id_display_row',
        'identity_vcode_row',
        'identity_phrase_row',
        'identity_phrase_input',
        'identity_confirm_button',
        'identity_unbind_button',
        'identity_qr',
    ];
    const state = {};
    ids.forEach((id) => {
        const el = document.getElementById(id);
        if (!el) {
            state[id] = null;
            return;
        }
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        state[id] = {
            display: style.display,
            visibility: style.visibility,
            opacity: style.opacity,
            classes: String(el.className || '').slice(0, 120),
            style: el.getAttribute('style') || '',
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            hidden: el.hidden || el.getAttribute('aria-hidden') === 'true',
        };
    });
    simpaiUiTrace("info", '[UI-TRACE] identity.flow_dom', { reason, state });
    return state;
}

window.simpleaiTraceIdentityFlow = () => traceIdentityFlowDom('manual');

function initPersonalWildcardsPopup() {
    const content = document.getElementById('user_personal_wildcards_modal_content');
    const modal = document.getElementById('user_personal_wildcards_modal') || content;
    const handle = document.getElementById('user_personal_wildcards_modal_handle');
    if (!modal || !content || !handle) return;
    if (content.dataset.pw_inited === '1') return;
    content.dataset.pw_inited = '1';

    const popupResize = installResizablePopup(content, {
        modal,
        minWidth: 640,
        minHeight: 320,
    });

    const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

    const placeDefault = () => {
        const w = content.getBoundingClientRect().width || 970;
        const h = content.getBoundingClientRect().height || 520;
        const margin = 10;
        let top = 220;
        let left = ((window.innerWidth - w) / 2) - 260;
        top = clamp(top, margin, window.innerHeight - margin - h);
        left = clamp(left, margin, window.innerWidth - margin - w);
        setImportantStyle(content, 'top', `${top}px`);
        setImportantStyle(content, 'left', `${left}px`);
        setImportantStyle(content, 'right', 'auto');
        setImportantStyle(content, 'bottom', 'auto');
    };

    const onShow = () => {
        if (modal.style.display === 'none') return;
        if (!content.style.left && !content.style.top) {
            placeDefault();
        }
        popupResize.ensureWithinViewport(false);
    };

    const observer = new MutationObserver(onShow);
    observer.observe(modal, { attributes: true, attributeFilter: ['style'] });
    onShow();

    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;

    const onMove = (e) => {
        if (!dragging) return;
        const x = e.clientX ?? 0;
        const y = e.clientY ?? 0;
        const rect = content.getBoundingClientRect();
        const margin = 10;
        const nextLeft = clamp(x - offsetX, margin, window.innerWidth - margin - rect.width);
        const nextTop = clamp(y - offsetY, margin, window.innerHeight - margin - rect.height);
        setImportantStyle(content, 'left', `${nextLeft}px`);
        setImportantStyle(content, 'top', `${nextTop}px`);
        setImportantStyle(content, 'right', 'auto');
        setImportantStyle(content, 'bottom', 'auto');
    };

    const onUp = () => {
        dragging = false;
        window.removeEventListener('pointermove', onMove, true);
        window.removeEventListener('pointerup', onUp, true);
        popupResize.ensureWithinViewport(true);
    };

    const onDown = (e) => {
        if (e.button !== 0) return;
        if (modal.style.display === 'none') return;
        const rect = content.getBoundingClientRect();
        dragging = true;
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;
        window.addEventListener('pointermove', onMove, true);
        window.addEventListener('pointerup', onUp, true);
        e.preventDefault();
    };

    handle.addEventListener('pointerdown', onDown, { passive: false });
}

onUiLoaded(initPersonalWildcardsPopup);
onAfterUiUpdate(initPersonalWildcardsPopup);

function initMissingModelPopup() {
    const content = document.getElementById('missing_model_modal_content');
    const modal = document.getElementById('missing_model_modal') || content;
    const handle = document.getElementById('missing_model_modal_handle');
    const header = document.getElementById('missing_model_modal_header');
    const progress = document.getElementById('missing_model_total_progress');
    const minimizeBtn = document.getElementById('missing_model_modal_minimize_btn');
    const closeBtn = document.getElementById('missing_model_modal_close_btn');
    if (!modal || !content || !handle) return;
    if (content.dataset.mm_inited === '1') return;
    content.dataset.mm_inited = '1';
    content.dataset.simpleaiMissingModelMinimized = content.classList.contains('minimized') ? '1' : '0';

    const popupResize = installResizablePopup(content, {
        modal,
        minWidth: 640,
        minHeight: 260,
        disabled: () => content.classList.contains('minimized'),
    });
    content.__simpleaiMissingModelPopupResize = popupResize;

    const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
    const suspendModalRefresh = (holdMs = 0) => {
        const until = Date.now() + Math.max(0, Number(holdMs) || 0);
        window.__missingModelModalSuspendUntil = Math.max(window.__missingModelModalSuspendUntil || 0, until);
    };
    const ensureCapsuleVisibility = () => {
        try { restoreGradioComponentVisibility(content, { interactive: false }); } catch (e) {}
        try { restoreGradioComponentVisibility(header, { interactive: false }); } catch (e) {}
        try { restoreGradioComponentVisibility(progress, { interactive: false }); } catch (e) {}
        try { restoreGradioComponentVisibility(minimizeBtn); } catch (e) {}
        try { restoreGradioComponentVisibility(closeBtn); } catch (e) {}
        try {
            content.classList.remove('hidden', 'hide');
            header?.classList?.remove('hidden', 'hide');
            progress?.classList?.remove('hidden', 'hide');
            minimizeBtn?.classList?.remove('hidden', 'hide');
            closeBtn?.classList?.remove('hidden', 'hide');
        } catch (e) {}
        try {
            content.removeAttribute('hidden');
            header?.removeAttribute?.('hidden');
            progress?.removeAttribute?.('hidden');
            minimizeBtn?.removeAttribute?.('hidden');
            closeBtn?.removeAttribute?.('hidden');
        } catch (e) {}
        content.style.removeProperty('display');
        content.style.removeProperty('visibility');
        header?.style?.removeProperty?.('display');
        header?.style?.removeProperty?.('visibility');
        progress?.style?.removeProperty?.('display');
        progress?.style?.removeProperty?.('visibility');
    };
    const isMinimized = () => content.classList.contains('minimized') || content.dataset.simpleaiMissingModelMinimized === '1';
    const setMinimized = (nextValue) => {
        const currentMinimized = isMinimized();
        if (nextValue === currentMinimized) {
            if (nextValue) {
                ensureCapsuleVisibility();
                setImportantStyle(content, 'width', '280px');
                setImportantStyle(content, 'min-width', '0');
                setImportantStyle(content, 'max-width', 'calc(100vw - 24px)');
                setImportantStyle(content, 'height', '54px');
                setImportantStyle(content, 'min-height', '54px');
                setImportantStyle(content, 'max-height', '54px');
                setImportantStyle(content, 'overflow', 'hidden');
            }
            return;
        }
        if (nextValue) {
            ensureCapsuleVisibility();
            const rect = content.getBoundingClientRect();
            content.dataset.prevWidth = content.style.width || `${Math.round(rect.width)}px`;
            content.dataset.prevHeight = content.style.height || `${Math.round(rect.height)}px`;
            content.classList.add('minimized');
            content.dataset.simpleaiMissingModelMinimized = '1';
            setImportantStyle(content, 'width', '280px');
            setImportantStyle(content, 'min-width', '0');
            setImportantStyle(content, 'max-width', 'calc(100vw - 24px)');
            setImportantStyle(content, 'height', '54px');
            setImportantStyle(content, 'min-height', '54px');
            setImportantStyle(content, 'max-height', '54px');
            setImportantStyle(content, 'overflow', 'hidden');
            return;
        }
        content.classList.remove('minimized');
        content.dataset.simpleaiMissingModelMinimized = '0';
        if (content.dataset.prevWidth) {
            setImportantStyle(content, 'width', content.dataset.prevWidth);
        } else {
            content.style.removeProperty('width');
        }
        if (content.dataset.prevHeight) {
            setImportantStyle(content, 'height', content.dataset.prevHeight);
        } else {
            content.style.removeProperty('height');
        }
        content.style.removeProperty('min-width');
        content.style.removeProperty('max-width');
        content.style.removeProperty('min-height');
        content.style.removeProperty('max-height');
        content.style.removeProperty('overflow');
    };

    const placeDefault = () => {
        const w = content.getBoundingClientRect().width || 970;
        const h = content.getBoundingClientRect().height || 520;
        const margin = 12;
        let top = Math.round((window.innerHeight - h) / 2);
        let left = Math.round((window.innerWidth - w) / 2);
        top = clamp(top, margin, window.innerHeight - margin - h);
        left = clamp(left, margin, window.innerWidth - margin - w);
        setImportantStyle(content, 'transform', 'none');
        setImportantStyle(content, 'top', `${top}px`);
        setImportantStyle(content, 'left', `${left}px`);
        setImportantStyle(content, 'right', 'auto');
        setImportantStyle(content, 'bottom', 'auto');
    };

    const onStyle = () => {
        const hidden = (getComputedStyle(modal).display === 'none');
        if (hidden) {
            setMinimized(false);
            delete content.dataset.prevLeft;
            delete content.dataset.prevTop;
            return;
        }
        if (content.style.display === 'none') {
            content.style.removeProperty('display');
        }
        if (isMinimized()) {
            ensureCapsuleVisibility();
            setMinimized(true);
            return;
        }
        if (!content.style.left && !content.style.top) {
            placeDefault();
        }
        popupResize.ensureWithinViewport(false);
    };

    const observer = new MutationObserver(onStyle);
    observer.observe(modal, { attributes: true, attributeFilter: ['style'] });
    onStyle();

    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;
    let dragPointerId = null;
    let dragPointerTarget = null;

    const clearDragState = () => {
        dragging = false;
        dragPointerId = null;
        dragPointerTarget = null;
        delete content.dataset.simpleaiDragActive;
    };

    const onMove = (e) => {
        if (!dragging) return;
        suspendModalRefresh(4000);
        const x = e.clientX ?? 0;
        const y = e.clientY ?? 0;
        const rect = content.getBoundingClientRect();
        const margin = 12;
        const nextLeft = clamp(x - offsetX, margin, window.innerWidth - margin - rect.width);
        const nextTop = clamp(y - offsetY, margin, window.innerHeight - margin - rect.height);
        setImportantStyle(content, 'transform', 'none');
        setImportantStyle(content, 'left', `${nextLeft}px`);
        setImportantStyle(content, 'top', `${nextTop}px`);
        setImportantStyle(content, 'right', 'auto');
        setImportantStyle(content, 'bottom', 'auto');
    };

    const onUp = () => {
        if (dragPointerTarget && dragPointerId !== null) {
            try {
                dragPointerTarget.releasePointerCapture(dragPointerId);
            } catch (err) {}
        }
        suspendModalRefresh(1200);
        clearDragState();
        window.removeEventListener('pointermove', onMove, true);
        window.removeEventListener('pointerup', onUp, true);
        window.removeEventListener('pointercancel', onUp, true);
        popupResize.ensureWithinViewport(true);
    };

    const isOnButtons = (target) => {
        try {
            return !!target?.closest?.('#missing_model_modal_minimize_btn, #missing_model_modal_close_btn');
        } catch (e) {
            return false;
        }
    };

    const onDown = (e) => {
        if (e.button !== 0) return;
        if (getComputedStyle(modal).display === 'none') return;
        suspendModalRefresh(4000);
        const rect = content.getBoundingClientRect();
        dragging = true;
        content.dataset.simpleaiDragActive = '1';
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;
        dragPointerId = e.pointerId ?? null;
        dragPointerTarget = e.currentTarget || handle;
        if (dragPointerTarget && dragPointerId !== null) {
            try {
                dragPointerTarget.setPointerCapture(dragPointerId);
            } catch (err) {}
        }
        window.addEventListener('pointermove', onMove, true);
        window.addEventListener('pointerup', onUp, true);
        window.addEventListener('pointercancel', onUp, true);
        e.preventDefault();
    };

    handle.addEventListener('pointerdown', onDown, { passive: false });
    header?.addEventListener('pointerdown', (e) => {
        if (isOnButtons(e.target)) return;
        onDown(e);
    }, { passive: false });

    if (minimizeBtn && minimizeBtn.dataset.simpleaiMinimizeBound !== '1') {
        minimizeBtn.dataset.simpleaiMinimizeBound = '1';
        minimizeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            const rect = content.getBoundingClientRect();
            if (!isMinimized()) {
                content.dataset.prevLeft = content.style.left || `${rect.left}px`;
                content.dataset.prevTop = content.style.top || `${rect.top}px`;
                setMinimized(true);
                requestAnimationFrame(() => {
                    const w = content.getBoundingClientRect().width || 280;
                    const h = content.getBoundingClientRect().height || 54;
                    setImportantStyle(content, 'left', `${Math.max(12, window.innerWidth - 12 - w)}px`);
                    setImportantStyle(content, 'top', `${Math.max(12, window.innerHeight - 12 - h)}px`);
                    setImportantStyle(content, 'right', 'auto');
                    setImportantStyle(content, 'bottom', 'auto');
                });
            } else {
                setMinimized(false);
                setImportantStyle(content, 'left', content.dataset.prevLeft || `${Math.max(12, window.innerWidth - 982)}px`);
                setImportantStyle(content, 'top', content.dataset.prevTop || '160px');
                setImportantStyle(content, 'right', 'auto');
                setImportantStyle(content, 'bottom', 'auto');
                popupResize.ensureWithinViewport(true);
            }
        }, true);
    }

    if (closeBtn && closeBtn.dataset.simpleaiCloseBound !== '1') {
        closeBtn.dataset.simpleaiCloseBound = '1';
        closeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            setMinimized(false);
            setImportantStyle(content, 'display', 'none');
            if (modal && modal !== content) {
                setImportantStyle(modal, 'display', 'none');
            }
        }, true);
    }
    content.addEventListener('pointerdown', (e) => {
        if (!isMinimized()) return;
        if (isOnButtons(e.target)) return;
        onDown(e);
    }, { passive: false });
}

onUiLoaded(initMissingModelPopup);
onAfterUiUpdate(initMissingModelPopup);

function syncModelBrowserGalleryLabels() {
    const gallery = document.getElementById('model_browser_gallery');
    if (!gallery) return;

    const items = gallery.querySelectorAll('.gallery-item');
    items.forEach((item) => {
        const captionNode = item.querySelector('.caption-label');
        const media = item.querySelector('img[title], video[title], img[alt], video[alt]');
        let rawLabel = '';

        if (captionNode && captionNode.textContent) {
            rawLabel = captionNode.textContent.trim();
        }
        if (!rawLabel && media) {
            rawLabel = (media.getAttribute('title') || media.getAttribute('alt') || '').trim();
        }

        let labelNode = item.querySelector('.model-browser-filetag');
        if (!rawLabel) {
            if (labelNode) {
                labelNode.remove();
            }
            return;
        }

        const normalized = rawLabel.replace(/\//g, '\\').trim();
        const slashIndex = normalized.lastIndexOf('\\');
        const fileName = slashIndex >= 0 ? normalized.slice(slashIndex + 1) : normalized;
        const folderName = slashIndex >= 0 ? normalized.slice(0, slashIndex) : '';

        if (!labelNode) {
            labelNode = document.createElement('div');
            labelNode.className = 'model-browser-filetag';

            const nameNode = document.createElement('div');
            nameNode.className = 'model-browser-file-main';
            labelNode.appendChild(nameNode);

            const folderNode = document.createElement('div');
            folderNode.className = 'model-browser-file-folder';
            labelNode.appendChild(folderNode);

            item.appendChild(labelNode);
        }

        const nameNode = labelNode.querySelector('.model-browser-file-main');
        const folderNode = labelNode.querySelector('.model-browser-file-folder');
        if (nameNode) {
            nameNode.textContent = fileName || normalized;
        }
        if (folderNode) {
            folderNode.textContent = folderName;
        }
        labelNode.title = normalized;
        labelNode.classList.toggle('has-folder', !!folderName);
    });
}

function initModelBrowserGalleryLabels() {
    const gallery = document.getElementById('model_browser_gallery');
    if (!gallery) return;

    if (gallery.dataset.mbLabelsBound !== '1') {
        gallery.dataset.mbLabelsBound = '1';
        const observer = new MutationObserver(() => {
            syncModelBrowserGalleryLabels();
        });
        observer.observe(gallery, { childList: true, subtree: true });
    }

    syncModelBrowserGalleryLabels();
}

function triggerModelBrowserCloseFromGallery() {
    const root = document.getElementById('model_browser_modal_close_btn');
    const button = root && root.matches && root.matches('button')
        ? root
        : (root && root.querySelector ? root.querySelector('button') : root);
    if (button && typeof button.click === 'function') {
        button.click();
        return true;
    }

    const content = document.getElementById('model_browser_modal_content');
    const modal = document.getElementById('model_browser_modal') || content;
    [content, modal].forEach((node) => {
        if (!node) return;
        if (typeof setImportantStyle === 'function') {
            setImportantStyle(node, 'display', 'none');
        } else {
            node.style.display = 'none';
        }
    });
    return false;
}

function initModelBrowserDoubleClickClose() {
    if (document.body?.dataset?.mbDblCloseBound === '1') return;
    if (document.body?.dataset) {
        document.body.dataset.mbDblCloseBound = '1';
    }
    const state = {
        signature: '',
        at: 0,
    };
    const getItemSignature = (gallery, item) => {
        const items = Array.from(gallery.querySelectorAll('.gallery-item'));
        const index = items.indexOf(item);
        const label = (
            item.querySelector('.model-browser-filetag')?.getAttribute('title')
            || item.querySelector('.caption-label')?.textContent
            || item.querySelector('img[title], video[title], img[alt], video[alt]')?.getAttribute('title')
            || item.querySelector('img[title], video[title], img[alt], video[alt]')?.getAttribute('alt')
            || ''
        ).trim();
        return `${index}:${label}`;
    };
    document.addEventListener('click', (event) => {
        const item = event.target?.closest?.('#model_browser_gallery .gallery-item');
        if (!item) return;
        const gallery = item.closest('#model_browser_gallery');
        if (!gallery) return;
        const signature = getItemSignature(gallery, item);
        const now = Date.now();
        const isDoubleClick = signature === state.signature && now - state.at <= 500;
        state.signature = signature;
        state.at = now;
        if (!isDoubleClick) return;
        window.setTimeout(triggerModelBrowserCloseFromGallery, 220);
    }, true);
}

function initModelBrowserPopup() {
    const content = document.getElementById('model_browser_modal_content');
    const modal = document.getElementById('model_browser_modal') || content;
    const handle = document.getElementById('model_browser_modal_handle');
    const header = document.getElementById('model_browser_modal_header');
    if (!modal || !content || !handle) return;
    if (content.dataset.mb_inited === '1') return;
    content.dataset.mb_inited = '1';

    const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
    const isHidden = () => {
        const anchor = modal && modal !== content ? modal : content;
        const style = getComputedStyle(anchor);
        return style.display === 'none' || anchor.classList.contains('hidden') || anchor.classList.contains('hide') || anchor.hidden;
    };
    const popupResize = installResizablePopup(content, {
        modal,
        minWidth: 640,
        minHeight: 420,
        isHidden,
    });

    const popupScrollableOverflow = (value) => /auto|scroll|overlay/i.test(String(value || ''));
    const findPopupWheelScroller = (target, root) => {
        let node = target instanceof Element ? target : target?.parentElement;
        while (node && node !== document.documentElement) {
            const style = getComputedStyle(node);
            const canScrollY = popupScrollableOverflow(style.overflowY) && node.scrollHeight > node.clientHeight + 1;
            const canScrollX = popupScrollableOverflow(style.overflowX) && node.scrollWidth > node.clientWidth + 1;
            if (canScrollY || canScrollX) return node;
            if (node === root) break;
            node = node.parentElement;
        }
        return null;
    };
    const canPopupWheelScrollAxis = (scroller, axis, delta) => {
        if (!scroller || Math.abs(delta || 0) < 0.01) return false;
        if (axis === 'x') {
            const maxLeft = scroller.scrollWidth - scroller.clientWidth;
            if (maxLeft <= 1) return false;
            return delta < 0 ? scroller.scrollLeft > 0 : scroller.scrollLeft < maxLeft - 1;
        }
        const maxTop = scroller.scrollHeight - scroller.clientHeight;
        if (maxTop <= 1) return false;
        return delta < 0 ? scroller.scrollTop > 0 : scroller.scrollTop < maxTop - 1;
    };
    const containModelBrowserPopupWheel = (e) => {
        if (isHidden()) return;
        const scroller = findPopupWheelScroller(e.target, modal || content);
        const canScroll = scroller && (
            canPopupWheelScrollAxis(scroller, 'y', e.deltaY) ||
            canPopupWheelScrollAxis(scroller, 'x', e.deltaX)
        );
        if (!canScroll) e.preventDefault();
        e.stopPropagation();
    };

    const placeDefault = () => {
        const w = content.getBoundingClientRect().width || 1040;
        const h = content.getBoundingClientRect().height || 720;
        const margin = 12;
        const left = clamp(Math.round((window.innerWidth - w) / 2), margin, window.innerWidth - margin - w);
        const top = clamp(Math.round((window.innerHeight - h) / 2), margin, window.innerHeight - margin - h);
        setImportantStyle(content, 'transform', 'none');
        setImportantStyle(content, 'left', `${left}px`);
        setImportantStyle(content, 'top', `${top}px`);
        setImportantStyle(content, 'right', 'auto');
        setImportantStyle(content, 'bottom', 'auto');
    };

    const onStyle = () => {
        if (isHidden()) {
            setImportantStyle(content, 'display', 'none');
            return;
        }
        content.style.removeProperty('display');
        if (!content.style.left && !content.style.top) {
            placeDefault();
        }
        popupResize.ensureWithinViewport(false);
        syncModelBrowserGalleryLabels();
    };

    const observer = new MutationObserver(onStyle);
    observer.observe(modal, { attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
    onStyle();

    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;

    const onMove = (e) => {
        if (!dragging) return;
        const rect = content.getBoundingClientRect();
        const margin = 12;
        const nextLeft = clamp((e.clientX ?? 0) - offsetX, margin, window.innerWidth - margin - rect.width);
        const nextTop = clamp((e.clientY ?? 0) - offsetY, margin, window.innerHeight - margin - rect.height);
        setImportantStyle(content, 'transform', 'none');
        setImportantStyle(content, 'left', `${nextLeft}px`);
        setImportantStyle(content, 'top', `${nextTop}px`);
        setImportantStyle(content, 'right', 'auto');
        setImportantStyle(content, 'bottom', 'auto');
    };

    const onUp = () => {
        dragging = false;
        window.removeEventListener('pointermove', onMove, true);
        window.removeEventListener('pointerup', onUp, true);
        popupResize.ensureWithinViewport(true);
    };

    const onDown = (e) => {
        if (e.button !== 0) return;
        if (isHidden()) return;
        if (e.target?.closest?.('#model_browser_modal_close_btn')) return;
        const rect = content.getBoundingClientRect();
        dragging = true;
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;
        window.addEventListener('pointermove', onMove, true);
        window.addEventListener('pointerup', onUp, true);
        e.preventDefault();
    };

    handle.addEventListener('pointerdown', onDown, { passive: false });
    header?.addEventListener('pointerdown', onDown, { passive: false });
    const wheelTargets = modal === content ? [content] : [modal, content];
    wheelTargets.forEach((target) => target?.addEventListener?.('wheel', containModelBrowserPopupWheel, { passive: false, capture: true }));

    window.reopenModelBrowserPopup = function() {
        try {
            if (modal && modal !== content) {
                modal.style.removeProperty('display');
                modal.classList.remove('hidden', 'hide');
                modal.hidden = false;
                try { modal.removeAttribute('hidden'); } catch (e) {}
            }
            content.style.removeProperty('display');
            content.classList.remove('hidden', 'hide');
            content.hidden = false;
            try { content.removeAttribute('hidden'); } catch (e) {}

            const rect = content.getBoundingClientRect();
            const offscreen = rect.width <= 0 || rect.height <= 0 || rect.right < 0 || rect.bottom < 0 || rect.left > window.innerWidth || rect.top > window.innerHeight;
            if (!content.style.left || !content.style.top || offscreen) {
                placeDefault();
            }
            popupResize.ensureWithinViewport(false);
            syncModelBrowserGalleryLabels();
        } catch (e) {
            console.warn('reopenModelBrowserPopup failed', e);
        }
    };
}

onUiLoaded(initModelBrowserGalleryLabels);
onAfterUiUpdate(initModelBrowserGalleryLabels);
onUiLoaded(initModelBrowserDoubleClickClose);
onAfterUiUpdate(initModelBrowserDoubleClickClose);
onUiLoaded(initModelBrowserPopup);
onAfterUiUpdate(initModelBrowserPopup);
setInterval(syncModelBrowserGalleryLabels, 1000);
setInterval(initModelBrowserPopup, 1000);

function initRestoreDefaultsPopup() {
    const content = document.getElementById('restore_defaults_panel_content');
    const modal = document.getElementById('restore_defaults_panel') || content;
    const handle = document.getElementById('restore_defaults_panel_handle');
    if (!modal || !content || !handle) return;
    if (content.dataset.restoreDefaultsInited === '1') return;
    content.dataset.restoreDefaultsInited = '1';

    const popupResize = installResizablePopup(content, {
        modal,
        minWidth: 320,
        minHeight: 180,
    });

    const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
    const isHidden = () => {
        const anchor = modal && modal !== content ? modal : content;
        const style = getComputedStyle(anchor);
        return style.display === 'none'
            || anchor.classList.contains('hidden')
            || anchor.classList.contains('hide')
            || anchor.hidden;
    };

    const onStyle = () => {
        if (isHidden()) {
            setImportantStyle(content, 'display', 'none');
            return;
        }
        content.style.removeProperty('display');
        popupResize.ensureWithinViewport(false);
    };

    const observer = new MutationObserver(onStyle);
    observer.observe(modal, { attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
    onStyle();

    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;

    const onMove = (e) => {
        if (!dragging) return;
        const rect = content.getBoundingClientRect();
        const margin = 12;
        const nextLeft = clamp((e.clientX ?? 0) - offsetX, margin, window.innerWidth - margin - rect.width);
        const nextTop = clamp((e.clientY ?? 0) - offsetY, margin, window.innerHeight - margin - rect.height);
        setImportantStyle(content, 'transform', 'none');
        setImportantStyle(content, 'left', `${Math.round(nextLeft)}px`);
        setImportantStyle(content, 'top', `${Math.round(nextTop)}px`);
        setImportantStyle(content, 'right', 'auto');
        setImportantStyle(content, 'bottom', 'auto');
    };

    const onUp = () => {
        dragging = false;
        window.removeEventListener('pointermove', onMove, true);
        window.removeEventListener('pointerup', onUp, true);
        popupResize.ensureWithinViewport(true);
    };

    const onDown = (e) => {
        if (e.button !== 0) return;
        if (isHidden()) return;
        const rect = content.getBoundingClientRect();
        dragging = true;
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;
        window.addEventListener('pointermove', onMove, true);
        window.addEventListener('pointerup', onUp, true);
        e.preventDefault();
    };

    handle.addEventListener('pointerdown', onDown, { passive: false });
}

onUiLoaded(initRestoreDefaultsPopup);
onAfterUiUpdate(initRestoreDefaultsPopup);
setInterval(initRestoreDefaultsPopup, 1000);

function reopenMissingModelPopupIfNeeded(html) {
    const content = document.getElementById('missing_model_modal_content');
    const modal = document.getElementById('missing_model_modal') || content;
    const progress = document.getElementById('missing_model_total_progress');
    if (!content) return;
    const hasRows = (typeof html === 'string') && (html.includes('missing-model-row') || html.includes('missing-model-queue-row'));
    const wasMinimized = content.classList.contains('minimized') || content.dataset.simpleaiMissingModelMinimized === '1';

    if (!hasRows) {
        hideMissingModelPopupSurface();
        return;
    }

    content.style.removeProperty('display');
    if (wasMinimized) {
        content.classList.add('minimized');
        content.dataset.simpleaiMissingModelMinimized = '1';
    } else {
        content.classList.remove('minimized');
        content.dataset.simpleaiMissingModelMinimized = '0';
        content.style.removeProperty('height');
        content.style.removeProperty('min-height');
        content.style.removeProperty('overflow');
    }
    try { content.removeAttribute('hidden'); } catch (e) {}
    try {
        if (content.classList) {
            content.classList.remove('hidden');
            content.classList.remove('hide');
        }
    } catch (e) {}

    if (modal && modal !== content) {
        modal.style.removeProperty('display');
        setImportantStyle(modal, 'z-index', '1800');
        try { modal.removeAttribute('hidden'); } catch (e) {}
        try {
            if (modal.classList) {
                modal.classList.remove('hidden');
                modal.classList.remove('hide');
            }
        } catch (e) {}
    }
    if (progress) {
        progress.style.removeProperty('display');
        try { progress.removeAttribute('hidden'); } catch (e) {}
    }

    if (!wasMinimized && !content.style.left && !content.style.top) {
        const margin = 12;
        const width = content.getBoundingClientRect().width || 970;
        const height = content.getBoundingClientRect().height || 520;
        const left = Math.max(margin, Math.min(Math.round((window.innerWidth - width) / 2), window.innerWidth - margin - width));
        const top = Math.max(margin, Math.min(Math.round((window.innerHeight - height) / 2), window.innerHeight - margin - height));
        setImportantStyle(content, 'transform', 'none');
        setImportantStyle(content, 'left', `${left}px`);
        setImportantStyle(content, 'top', `${top}px`);
        setImportantStyle(content, 'right', 'auto');
        setImportantStyle(content, 'bottom', 'auto');
    }
    setImportantStyle(content, 'z-index', '1801');

}

function hideMissingModelPopupSurface() {
    const content = document.getElementById('missing_model_modal_content');
    const modal = document.getElementById('missing_model_modal') || content;
    const progress = document.getElementById('missing_model_total_progress');
    if (content) {
        content.classList.remove('minimized');
        content.dataset.simpleaiMissingModelMinimized = '0';
        setImportantStyle(content, 'display', 'none');
    }
    if (modal && modal !== content) {
        setImportantStyle(modal, 'display', 'none');
    }
    if (progress) {
        setImportantStyle(progress, 'display', 'none');
    }
}

function syncMissingModelDownloadCompleteUi(html, systemParams) {
    const hasRows = (typeof html === 'string') && (html.includes('missing-model-row') || html.includes('missing-model-queue-row'));
    reopenMissingModelPopupIfNeeded(html);
    if (!hasRows && systemParams && typeof syncMissingModelCheckHint === 'function') {
        try { syncMissingModelCheckHint(systemParams); } catch (e) {}
    }
    if (!hasRows && typeof hideMissingModelWelcomeHint === 'function') {
        hideMissingModelWelcomeHint(false);
    }
}

function setGradioTextboxValue(rootId, value) {
    const root = getGradioRootById(rootId);
    if (!root) return false;
    const field = root.querySelector('textarea, input');
    if (!field) return false;
    const proto = Object.getPrototypeOf(field);
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
    if (descriptor && descriptor.set) {
        descriptor.set.call(field, value);
    } else {
        field.value = value;
    }
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
}

function clickGradioButton(rootId) {
    const root = getGradioRootById(rootId);
    if (!root) return false;
    const button = root.matches('button') ? root : root.querySelector('button');
    if (!button) return false;
    try {
        button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        button.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
        button.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    } catch (e) {}
    button.click();
    return true;
}

function triggerMissingModelCheckForPreset(presetName) {
    const targetPreset = String(presetName || '').trim();
    if (!targetPreset) return false;
    const ok = setGradioTextboxValue('missing_model_check_request', targetPreset);
    if (!ok) {
        console.warn('[UI-TRACE] missing_model_check_hint.missing_request_box');
        return false;
    }
    return clickGradioButton('missing_model_check_btn');
}

function triggerMissingModelCheck(payload) {
    const request = typeof payload === 'string' ? payload : JSON.stringify(payload || {});
    if (!String(request || '').trim()) return false;
    const ok = setGradioTextboxValue('missing_model_check_request', request);
    if (!ok) {
        console.warn('[UI-TRACE] missing_model_check.missing_request_box');
        return false;
    }
    return clickGradioButton('missing_model_check_btn');
}

window.triggerMissingModelCheck = triggerMissingModelCheck;

let missingModelHintDismissedPreset = null;
let missingModelHintActivePreset = null;
let lastMissingModelHintParams = null;

function getMissingModelWelcomeHintNodes() {
    return {
        host: document.getElementById('missing_model_welcome_hint'),
        text: document.getElementById('missing_model_welcome_hint_text'),
        button: document.getElementById('missing_model_welcome_hint_btn'),
        close: document.getElementById('missing_model_welcome_hint_close'),
    };
}

function missingModelHintEscapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    }[ch]));
}

function missingModelHintText(en, cn, systemParams) {
    if (window.SimpAII18n?.t) {
        try {
            return window.SimpAII18n.t(en, cn, systemParams || lastMissingModelHintParams || {});
        } catch (e) {}
    }
    if (typeof topbarTranslateText === 'function') {
        try {
            const translated = topbarTranslateText(en);
            if (translated && translated !== en) return translated;
        } catch (e) {}
    }
    const lang = String(systemParams?.__lang || window.locale_lang || '').toLowerCase();
    return lang.startsWith('en') ? en : (cn || en);
}

function hideMissingModelWelcomeHint(recordDismiss = false) {
    const { host } = getMissingModelWelcomeHintNodes();
    if (!host) return;
    if (recordDismiss) {
        missingModelHintDismissedPreset = missingModelHintActivePreset || null;
    }
    host.style.display = 'none';
}

window.hideMissingModelWelcomeHint = hideMissingModelWelcomeHint;

function bindMissingModelWelcomeHintClose() {
    const { close } = getMissingModelWelcomeHintNodes();
    if (!close || close.dataset.simpleaiBound === '1') return;
    close.dataset.simpleaiBound = '1';
    close.addEventListener('click', () => {
        hideMissingModelWelcomeHint(true);
    });
}

function bindMissingModelWelcomeHintButton() {
    const { button } = getMissingModelWelcomeHintNodes();
    const buttonEl = button?.matches?.('button') ? button : button?.querySelector?.('button');
    if (!buttonEl || buttonEl.dataset.simpleaiMissingModelBound === '1') return;
    buttonEl.dataset.simpleaiMissingModelBound = '1';
    buttonEl.addEventListener('click', (e) => {
        const presetName = String(missingModelHintActivePreset || lastMissingModelHintParams?.__preset || '').trim();
        if (!presetName) return;
        if (triggerMissingModelCheckForPreset(presetName)) {
            e.preventDefault();
            e.stopPropagation();
            if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
        }
    }, true);
}

function normalizePresetNameForMissingHint(value) {
    if (typeof normalizePresetName === 'function') {
        return normalizePresetName(value);
    }
    return String(value || '').replace(/[\u2B07\u2193]/g, '').trim();
}

function missingModelHintHasMarker(value) {
    const text = String(value || '');
    return text.includes('\u2B07') || text.includes('\u2193');
}

function presetNeedsMissingModelCheck(systemParams) {
    if (!systemParams || typeof systemParams !== 'object') return false;
    const presetName = String(systemParams.__preset || '').trim();
    if (!presetName) return false;
    if (systemParams.__preset_missing === true) return true;

    const navListRaw = systemParams.__nav_name_list;
    const navList = String(navListRaw || '')
        .split(',')
        .map((item) => String(item || '').trim())
        .filter(Boolean);
    if (navList.some((item) => normalizePresetNameForMissingHint(item) === presetName && missingModelHintHasMarker(item))) {
        return true;
    }

    const activeButton = document.querySelector('.bar_button.selected, .bar_button.active, .bar_button.current');
    const activeText = activeButton
        ? String(activeButton.getAttribute?.('data-original-text') || activeButton.value || activeButton.textContent || '').trim()
        : '';
    if (normalizePresetNameForMissingHint(activeText) === presetName && missingModelHintHasMarker(activeText)) {
        return true;
    }

    return false;
}

function syncMissingModelCheckHint(systemParams) {
    lastMissingModelHintParams = systemParams || null;
    bindMissingModelWelcomeHintClose();
    bindMissingModelWelcomeHintButton();
    const { host, text, button } = getMissingModelWelcomeHintNodes();
    if (!host) {
        console.warn('[UI-TRACE] missing_model_welcome_hint.missing_host');
        return;
    }
    const presetName = String((systemParams && systemParams.__preset) || '').trim();
    const needsCheck = presetNeedsMissingModelCheck(systemParams);
    missingModelHintActivePreset = needsCheck ? presetName : null;
    if (!needsCheck || !presetName) {
        host.style.display = 'none';
        return;
    }

    if (missingModelHintDismissedPreset === presetName) {
        host.style.display = 'none';
        return;
    }

    if (text) {
        const template = missingModelHintText('{preset} is missing required model files.', '{preset} 缺少模型文件。', systemParams);
        const message = template.replace('{preset}', presetName);
        text.innerHTML = `<div class="missing-model-welcome-message"><span class="missing-model-warning-icon" aria-hidden="true">!</span><span class="missing-model-warning-copy">${missingModelHintEscapeHtml(message)}</span></div>`;
    }
    if (button) {
        const buttonEl = button.matches?.('button') ? button : button.querySelector?.('button');
        if (buttonEl) buttonEl.textContent = missingModelHintText('Download models', '下载模型', systemParams);
    }
    host.style.display = 'flex';
}

window.syncMissingModelCheckHint = syncMissingModelCheckHint;
window.syncMissingModelDownloadCompleteUi = syncMissingModelDownloadCompleteUi;
window.triggerMissingModelCheckForPreset = triggerMissingModelCheckForPreset;
window.__missingModelRefreshInFlight = false;
window.__missingModelNavRefreshInFlight = false;
window.__missingModelNavRefreshUntil = 0;
window.__missingModelModalSuspendUntil = 0;

function startMissingModelDownloadNavMonitor(reason) {
    window.__missingModelNavRefreshUntil = Math.max(window.__missingModelNavRefreshUntil || 0, Date.now() + 30 * 60 * 1000);
    window.setTimeout(requestMissingModelNavRefresh, 350);
}

function requestMissingModelNavRefresh() {
    if (window.__missingModelNavRefreshInFlight) return;
    if (!window.__missingModelNavRefreshUntil || Date.now() > window.__missingModelNavRefreshUntil) return;
    window.__missingModelNavRefreshInFlight = true;
    window.setTimeout(() => {
        window.__missingModelNavRefreshInFlight = false;
    }, 4000);
    if (!clickGradioButton('missing_model_nav_refresh_btn')) {
        window.__missingModelNavRefreshInFlight = false;
    }
}

function mergeMissingModelNavSystemParams(systemParams) {
    if (!systemParams || typeof systemParams !== 'object') return systemParams;
    const current = (window.simpleaiTopbarSystemParams && typeof window.simpleaiTopbarSystemParams === 'object')
        ? window.simpleaiTopbarSystemParams
        : {};
    const merged = Object.assign({}, current);
    delete merged.__preset_store_missing_updates;
    if (Object.prototype.hasOwnProperty.call(systemParams, '__nav_name_list')) {
        merged.__nav_name_list = systemParams.__nav_name_list;
    }
    if (Object.prototype.hasOwnProperty.call(systemParams, '__preset_store_meta')) {
        merged.__preset_store_meta = systemParams.__preset_store_meta;
    }
    if (Object.prototype.hasOwnProperty.call(systemParams, '__preset_store_meta_revision')) {
        merged.__preset_store_meta_revision = systemParams.__preset_store_meta_revision;
    }
    if (Object.prototype.hasOwnProperty.call(systemParams, '__preset_store_missing_updates')) {
        merged.__preset_store_missing_updates = systemParams.__preset_store_missing_updates;
    }
    if (Object.prototype.hasOwnProperty.call(systemParams, '__missing_model_download_active')) {
        merged.__missing_model_download_active = systemParams.__missing_model_download_active;
    }
    if (!merged.__preset && systemParams.__preset) merged.__preset = systemParams.__preset;
    if (!merged.__theme && systemParams.__theme) merged.__theme = systemParams.__theme;
    if (!merged.sstoken && systemParams.sstoken) merged.sstoken = systemParams.sstoken;
    if (!merged.user_name && systemParams.user_name) merged.user_name = systemParams.user_name;
    if (!merged.task_class_name && systemParams.task_class_name) merged.task_class_name = systemParams.task_class_name;
    if (systemParams.__preset === merged.__preset && Object.prototype.hasOwnProperty.call(systemParams, '__preset_missing')) {
        merged.__preset_missing = systemParams.__preset_missing;
    }
    return merged;
}

function applyMissingModelNavStateDirectly(systemParams) {
    if (!systemParams || typeof systemParams !== 'object') return;
    const navList = String(systemParams.__nav_name_list || '')
        .split(',')
        .map((item) => String(item || '').trim())
        .filter(Boolean);
    if (!navList.length) return;
    const preset = String(systemParams.__preset || '').trim();
    const theme = String(systemParams.__theme || window.locale_theme || 'dark').trim() || 'dark';
    if (typeof applyTopbarNavStyles === 'function') {
        applyTopbarNavStyles(preset, theme, navList);
    }
}

function finishMissingModelNavRefresh(systemParams) {
    window.__missingModelNavRefreshInFlight = false;
    const mergedParams = mergeMissingModelNavSystemParams(systemParams);
    if (mergedParams && typeof refresh_topbar_status_js === 'function') {
        refresh_topbar_status_js(mergedParams);
    }
    applyMissingModelNavStateDirectly(mergedParams);
    if (mergedParams && typeof syncMissingModelCheckHint === 'function') {
        syncMissingModelCheckHint(mergedParams);
    }
    if (systemParams && systemParams.__missing_model_download_active === true) {
        window.setTimeout(requestMissingModelNavRefresh, 3000);
        return;
    }
    if (systemParams && systemParams.__missing_model_download_active === false) {
        window.__missingModelNavRefreshUntil = 0;
    }
}

window.startMissingModelDownloadNavMonitor = startMissingModelDownloadNavMonitor;
window.finishMissingModelNavRefresh = finishMissingModelNavRefresh;

function isMissingModelPopupVisibleForRefresh() {
    const content = document.getElementById('missing_model_modal_content');
    const modal = document.getElementById('missing_model_modal') || content;
    if (!content) return false;
    const contentStyle = window.getComputedStyle(content);
    const modalStyle = modal ? window.getComputedStyle(modal) : null;
    if (contentStyle.display === 'none' || contentStyle.visibility === 'hidden') return false;
    if (modalStyle && (modalStyle.display === 'none' || modalStyle.visibility === 'hidden')) return false;
    return !!document.querySelector('#missing_model_list .missing-model-row, #missing_model_list .missing-model-queue-row');
}

function requestMissingModelModalRefresh() {
    if (window.__missingModelRefreshInFlight) return;
    if (!isMissingModelPopupVisibleForRefresh()) return;
    if ((window.__missingModelModalSuspendUntil || 0) > Date.now()) return;
    const content = document.getElementById('missing_model_modal_content');
    if (content && (content.dataset.simpleaiDragActive === '1' || content.dataset.simpleaiResizeActive === '1')) {
        return;
    }
    startMissingModelDownloadNavMonitor('modal_refresh');
    window.__missingModelRefreshInFlight = true;
    window.setTimeout(() => {
        window.__missingModelRefreshInFlight = false;
    }, 4000);
    if (!clickGradioButton('missing_model_refresh_btn')) {
        window.__missingModelRefreshInFlight = false;
    }
}

setInterval(requestMissingModelModalRefresh, 3000);
setInterval(requestMissingModelNavRefresh, 3000);

function resyncMissingModelCheckHintIfReady() {
    if (!lastMissingModelHintParams) return;
    syncMissingModelCheckHint(lastMissingModelHintParams);
}

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(resyncMissingModelCheckHintIfReady, 100);
    setTimeout(resyncMissingModelCheckHintIfReady, 500);
});

document.addEventListener('click', (e) => {
    const button = e.target?.closest?.('.missing-model-download-one');
    if (!button) return;
    const payload = button.getAttribute('data-model-payload') || '';
    if (!payload) return;
    e.preventDefault();
    e.stopPropagation();
    startMissingModelDownloadNavMonitor('download_one_click');
    const ok = setGradioTextboxValue('missing_model_download_request', payload);
    if (!ok) {
        console.warn('[UI-TRACE] missing_model_download_one.missing_request_box');
        return;
    }
    requestAnimationFrame(() => {
        if (!clickGradioButton('missing_model_download_one_btn')) {
            console.warn('[UI-TRACE] missing_model_download_one.missing_button');
        }
    });
}, true);

document.addEventListener('click', (e) => {
    const button = e.target?.closest?.('.missing-model-cancel-one');
    if (!button) return;
    const payload = button.getAttribute('data-model-payload') || '';
    if (!payload) return;
    e.preventDefault();
    e.stopPropagation();
    const ok = setGradioTextboxValue('missing_model_cancel_request', payload);
    if (!ok) {
        console.warn('[UI-TRACE] missing_model_cancel_one.missing_request_box');
        return;
    }
    requestAnimationFrame(() => {
        if (!clickGradioButton('missing_model_cancel_one_btn')) {
            console.warn('[UI-TRACE] missing_model_cancel_one.missing_button');
        }
    });
}, true);

function initPersonalWildcardsContentLineOverlay() {
    const modal = document.getElementById('user_personal_wildcards_modal') || document.getElementById('user_personal_wildcards_modal_content');
    if (modal && getComputedStyle(modal).display === 'none') return;

    const root = document.getElementById('user_personal_wildcards_content');
    if (!root) return;
    const textarea = root.querySelector('textarea');
    if (!textarea) return;

    if (textarea.dataset.lineOverlayInit === '1') {
        if (typeof textarea.__lineOverlayMaybeUpdate === 'function') textarea.__lineOverlayMaybeUpdate();
        return;
    }
    textarea.dataset.lineOverlayInit = '1';

    const wrapper = document.createElement('div');
    wrapper.className = 'line-overlay-wrapper';

    const viewport = document.createElement('div');
    viewport.className = 'line-overlay-viewport';

    const content = document.createElement('div');
    content.className = 'line-overlay-content';

    viewport.appendChild(content);

    const parent = textarea.parentNode;
    if (!parent) return;
    parent.insertBefore(wrapper, textarea);
    wrapper.appendChild(viewport);
    wrapper.appendChild(textarea);

    const syncScroll = () => {
        const x = textarea.scrollLeft || 0;
        const y = textarea.scrollTop || 0;
        content.style.transform = `translate(${-x}px, ${-y}px)`;
    };

    const applyTextareaStyles = () => {
        const cs = getComputedStyle(textarea);
        wrapper.style.borderRadius = cs.borderRadius;
        viewport.style.borderRadius = cs.borderRadius;
        content.style.fontFamily = cs.fontFamily;
        content.style.fontSize = cs.fontSize;
        content.style.fontWeight = cs.fontWeight;
        content.style.fontStyle = cs.fontStyle;
        content.style.letterSpacing = cs.letterSpacing;
        content.style.lineHeight = cs.lineHeight;
        content.style.padding = cs.padding;
        content.style.boxSizing = cs.boxSizing;
        content.style.width = `${textarea.clientWidth}px`;
    };

    const update = () => {
        const value = textarea.value ?? '';
        textarea.dataset.lineOverlayLastValue = value;
        const lines = value.split('\n');
        const frag = document.createDocumentFragment();

        for (let i = 0; i < lines.length; i++) {
            const lineEl = document.createElement('div');
            lineEl.className = 'line-overlay-line';
            lineEl.textContent = lines[i].length ? lines[i] : '\u200b';
            frag.appendChild(lineEl);
        }

        content.replaceChildren(frag);
        syncScroll();
    };

    const maybeUpdate = () => {
        const value = textarea.value ?? '';
        if (value === (textarea.dataset.lineOverlayLastValue ?? '')) return;
        update();
    };

    const sync = () => {
        applyTextareaStyles();
        update();
    };

    textarea.addEventListener('input', update);
    textarea.addEventListener('change', maybeUpdate);
    textarea.addEventListener('scroll', syncScroll);

    const ro = new ResizeObserver(sync);
    ro.observe(textarea);

    textarea.__lineOverlaySync = sync;
    textarea.__lineOverlayMaybeUpdate = maybeUpdate;

    sync();
}

onUiLoaded(initPersonalWildcardsContentLineOverlay);
onAfterUiUpdate(initPersonalWildcardsContentLineOverlay);
