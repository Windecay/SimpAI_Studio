let webpath = 'file';
let nickname = 'guest';
let task_class_name = 'Fooocus';

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

let presetStoreUiState = {
    nav_name_list: [],
    role: "guest",
    expand_flag: false,
    theme: "dark",
    meta: {},
    meta_revision: "",
    owner_key: "",
    optimistic_seq: 0,
    optimistic_timer: 0,
};
let presetStoreFilterState = {
    query: "",
    engine: "all",
    scene: "all",
};
let presetStoreTouchPoint = null;
let presetStoreDraftState = {
    list: [],
    dirty: false,
    pointerDrag: null,
};
let presetStoreObserver = null;
let presetStoreObservedEl = null;
let presetStoreUpdateQueued = false;
let presetStoreUpdating = false;
let topbarLocalizationHookInstalled = false;
let topbarLocalizationAppliedLocale = null;
let topbarOptimisticInstalled = false;
let topbarLastPreset = null;
let topbarLastTheme = 'dark';
let topbarLastNavNameList = [];
let topbarLastSystemParams = null;
let topbarOptimisticTimer = null;
let topbarPendingPreset = null;
let topbarPendingPresetUntil = 0;
let topbarLastIdentitySessionSeq = -1;
let topbarLastIdentitySessionRank = -1;
let topbarLastPresetStoreSeq = 0;
let topbarLastUiAction = "init";
let topbarUiActionTrace = [];
let topbarLastOptimisticTs = 0;
let topbarLastOptimisticBar = null;
let topbarOptimisticRaf = 0;
let scenePresetDefaultSyncToken = 0;
let scenePresetDefaultSyncStartedAt = 0;
let scenePresetDefaultSyncApplying = false;
let scenePresetUserEditAt = 0;
let galleryMediaSwitchLockedMode = null;
let galleryMediaSwitchLockedUntil = 0;
let galleryMediaSwitchStatusSyncSeq = 0;
let finishedGalleryBrowserRefreshTimer = null;
let finishedGalleryBrowserBridgeRetryTimer = null;
let finishedGalleryBrowserRequestWatchdogTimer = null;
let finishedGalleryBrowserLabelRefreshPausedUntil = 0;
let finishedGalleryWelcomeGuardTimer = null;
let finishedGalleryWelcomeGuardUntil = 0;
let finishedGalleryWelcomeGuardHoldStaleUntil = 0;
let finishedGalleryWelcomeGuardLastSrc = "";
let finishedGalleryBrowserPreloadInFlight = false;
let finishedGalleryBrowserRequestSeq = 0;
const finishedGalleryBrowserState = {
    bound: false,
    initialized: false,
    loading: false,
    bridgeRetryCount: 0,
    mediaType: "image",
    folder: "",
    userFolder: "",
    folders: [],
    paths: [],
    dimensions: {},
    loaded: 0,
    hasMore: false,
    nextOffset: 0,
    restoreScrollTop: null,
    pendingPayload: null,
    queuedOptions: null,
    activeRequestId: 0,
    bridgeMismatchRetryKey: "",
    bridgeMismatchRetryCount: 0,
    keepCatalogOpenRequestId: 0,
    keepCatalogOpenUntil: 0,
    keepCatalogOpenReason: "",
};
let simpleaiGalleryFrostBound = false;
let simpleaiGalleryFrostObserver = null;
let simpleaiGalleryFrostRefreshRaf = 0;
let simpleaiGalleryFrostUserPreference = true;
let simpleaiGalleryFrostRevealHoldUntil = 0;
let simpleaiGalleryFrostRevealHoldRequestId = 0;
let simpleaiGalleryFrostRevealHoldFolder = "";
let simpleaiGalleryFrostRevealHoldMode = "";
let finishedGalleryBrowserFolderDisplayRaf = 0;
let finishedGalleryBrowserEmptyMediaStyleInstalled = false;
let finishedGalleryResolutionBadgeTimer = null;
let simpleAIPresetSwitchGalleryHiddenUntil = 0;
let simpleAIPresetSwitchGalleryCleanupTimer = null;
let simpleAIPresetSwitchGalleryClearBound = false;
let simpleAIPresetSwitchCatalogObserver = null;
let simpleAIPresetSwitchCatalogObservedRoot = null;
let simpleAIPresetSwitchCatalogCollapseRaf = 0;
let simpleAIPresetSwitchGalleryCloseToken = 0;
let simpleAIPresetSwitchGalleryClearToken = 0;
let simpleAIPresetSwitchGalleryIgnoreStatusUntil = 0;
let simpleAIFinishedCatalogPreparedOpenUntil = 0;
let simpleAIFinishedCatalogPreparedCloseUntil = 0;
let simpleAIFinishedCatalogForceOpenUntil = 0;
let simpleAIFinishedCatalogPointerCloseBlockUntil = 0;
let simpleAICatalogGhostPointerBlockUntil = 0;
let finishedGalleryBrowserEarlyOpenRefreshTimer = null;
let finishedGalleryBrowserSuppressNativeFolderChangeUntil = 0;
let finishedGalleryBrowserSuppressNativeFolderChangeValue = "";
let finishedGalleryBrowserSuppressNativeFolderChangeSourceRequestId = 0;
let finishedGalleryBrowserIgnoredNativeFolderChangeUntil = 0;
let finishedGalleryBrowserIgnoredNativeFolderChangeValue = "";
let finishedGalleryBrowserVisibleLoadingUntil = 0;
let finishedGalleryBrowserVisibleLoadingKey = "";
let finishedGalleryBrowserSilentLoadingUntil = 0;
let finishedGalleryBrowserSilentLoadingText = "";
let finishedGalleryBrowserStatusObserver = null;
let finishedGalleryBrowserStatusObservedRoot = null;
let finishedGalleryBrowserStatusObserverApplying = false;
const SIMPLEAI_COMPARE_BUTTON_ICON = "🔍";
const SIMPLEAI_PRESET_SWITCH_GALLERY_IDS = [
    "finished_gallery",
    "final_gallery",
    "progress_video",
    "video_player",
    "comparison_box",
    "image_toolbox",
    "compare_btn",
    "model_browser_modal",
    "model_browser_modal_content",
];
const SIMPLEAI_CATALOG_LINKED_GALLERY_IDS = [
    "finished_gallery",
    "final_gallery",
    "progress_video",
    "video_player",
    "comparison_box",
    "image_toolbox",
    "compare_btn",
    "model_browser_modal",
    "model_browser_modal_content",
];
const SIMPLEAI_CATALOG_LINKED_SURFACE_IDS = [
    "finished_gallery",
    "final_gallery",
    "progress_video",
    "video_player",
    "comparison_box",
    "finished_gallery_browser_panel",
    "gallery_browser_toolbar",
];
const SIMPLEAI_PRESET_SWITCH_GALLERY_SUPPRESS_MS = 1600;
const SIMPLEAI_PRESET_SWITCH_GALLERY_RETRY_DELAYS = [40, 120, 260, 520, 900];
const SIMPLEAI_PRESET_SWITCH_STATUS_RETRY_DELAYS = [120, 420, 760];
const SIMPLEAI_GALLERY_BROWSER_FOLDER_STORAGE_KEY = "simpai.galleryBrowser.folder";

function isSimpleAIPresetGallerySuppressed() {
    try {
        if (Date.now() < simpleAIPresetSwitchGalleryHiddenUntil) return true;
        if (document.documentElement.classList.contains("simpai-preset-switch-gallery-suppressed")) return true;
        return false;
    } catch (e) {
        return Date.now() < simpleAIPresetSwitchGalleryHiddenUntil;
    }
}

function markSimpleAIPresetGalleryHidden(el) {
    if (!el) return false;
    try { el.dataset.simpleaiPresetSwitchGalleryHidden = "1"; } catch (e) {}
    try {
        el.classList.add("simpai-preset-switch-gallery-hidden");
        el.classList.add("simpai-mounted-hidden");
        el.classList.add("hidden");
    } catch (e) {}
    try { el.setAttribute("hidden", ""); } catch (e) {}
    try { el.setAttribute("aria-hidden", "true"); } catch (e) {}
    try { el.hidden = true; } catch (e) {}
    try { el.style.setProperty("display", "none", "important"); } catch (e) {}
    return true;
}

function clearSimpleAIPresetGalleryHiddenElement(el) {
    if (!el) return false;
    let owned = false;
    try { owned = el.dataset.simpleaiPresetSwitchGalleryHidden === "1"; } catch (e) {}
    if (!owned) return false;
    try { delete el.dataset.simpleaiPresetSwitchGalleryHidden; } catch (e) {}
    try {
        el.classList.remove("simpai-preset-switch-gallery-hidden");
        el.classList.remove("simpai-mounted-hidden");
        el.classList.remove("hidden");
        el.classList.remove("hide");
    } catch (e) {}
    try { el.removeAttribute("hidden"); } catch (e) {}
    try { el.removeAttribute("aria-hidden"); } catch (e) {}
    try { el.hidden = false; } catch (e) {}
    try { el.style.removeProperty("display"); } catch (e) {}
    return true;
}

function getSimpleAIGalleryMediaSignature(root) {
    if (!root || !root.querySelectorAll) return "";
    const mediaNodes = Array.from(root.querySelectorAll([
        ".gallery-container > .preview img",
        ".gallery-container > .preview video",
        ".grid-wrap .gallery-item img",
        ".grid-wrap .gallery-item video",
        "img",
        "video"
    ].join(",")));
    const itemCount = root.querySelectorAll(".grid-wrap .gallery-item").length;
    const previewCount = root.querySelectorAll(".gallery-container > .preview").length;
    if (!mediaNodes.length && !itemCount && !previewCount) return "";
    const mediaParts = mediaNodes.slice(0, 12).map((node) => {
        const src = node.currentSrc || node.src || node.getAttribute("src") || node.getAttribute("href") || "";
        const alt = node.getAttribute("alt") || "";
        const w = node.naturalWidth || node.videoWidth || node.clientWidth || "";
        const h = node.naturalHeight || node.videoHeight || node.clientHeight || "";
        return [src, alt, w, h].join("@");
    });
    return `items=${itemCount};previews=${previewCount};media=${mediaNodes.length};src=${mediaParts.join("|")}`;
}

function markSimpleAICatalogLinkedGalleryHidden(el, options) {
    if (!el) return false;
    const markWrappers = !(options && options.markWrappers === false);
    if (SIMPLEAI_CATALOG_LINKED_SURFACE_IDS.includes(el.id || "")) {
        try {
            const signature = getSimpleAIGalleryMediaSignature(el);
            if (signature) el.dataset.simpleaiCatalogLinkedGalleryHiddenSignature = signature;
            else delete el.dataset.simpleaiCatalogLinkedGalleryHiddenSignature;
        } catch (e) {}
    }
    try { el.dataset.simpleaiCatalogLinkedGalleryHidden = "1"; } catch (e) {}
    try {
        el.classList.add("simpai-catalog-linked-gallery-hidden");
        el.classList.add("hidden");
    } catch (e) {}
    try { el.setAttribute("aria-hidden", "true"); } catch (e) {}
    try { el.style.setProperty("display", "none", "important"); } catch (e) {}
    try { el.style.setProperty("pointer-events", "none", "important"); } catch (e) {}
    try {
        if (markWrappers && SIMPLEAI_CATALOG_LINKED_SURFACE_IDS.includes(el.id || "")) {
            [el.closest(".form, .block"), el.closest(".row")].filter(Boolean).forEach((node) => {
                const sharedWelcomeWrapper = !!(
                    node
                    && node !== el
                    && node.querySelector
                    && node.querySelector("#preview_generating, #simpleai_gallery_welcome_guard_placeholder")
                );
                if (sharedWelcomeWrapper) {
                    try { delete node.dataset.simpleaiCatalogLinkedGalleryWrapperHidden; } catch (_e) {}
                    try {
                        node.classList.remove("simpai-catalog-linked-gallery-hidden");
                        node.classList.remove("hidden");
                    } catch (_e) {}
                    try { node.removeAttribute("aria-hidden"); } catch (_e) {}
                    try { node.style.removeProperty("display"); } catch (_e) {}
                    try { node.style.removeProperty("pointer-events"); } catch (_e) {}
                    return;
                }
                node.dataset.simpleaiCatalogLinkedGalleryWrapperHidden = "1";
                node.classList.add("simpai-catalog-linked-gallery-hidden");
                node.setAttribute("aria-hidden", "true");
                node.style.setProperty("display", "none", "important");
                node.style.setProperty("pointer-events", "none", "important");
            });
        }
    } catch (e) {}
    return true;
}

function clearSimpleAICatalogLinkedGalleryHiddenElement(el, allowWrapper=false) {
    if (!el) return false;
    try {
        if (el.dataset.simpleaiGalleryBrowserEmptyMediaHidden === "1") return false;
    } catch (e) {}
    let owned = false;
    try {
        owned = el.dataset.simpleaiCatalogLinkedGalleryHidden === "1"
            || (allowWrapper && el.dataset.simpleaiCatalogLinkedGalleryWrapperHidden === "1");
    } catch (e) {}
    if (!owned) return false;
    try { delete el.dataset.simpleaiCatalogLinkedGalleryHidden; } catch (e) {}
    try { delete el.dataset.simpleaiCatalogLinkedGalleryWrapperHidden; } catch (e) {}
    try {
        el.classList.remove("simpai-catalog-linked-gallery-hidden");
        el.classList.remove("hidden");
        el.classList.remove("hide");
    } catch (e) {}
    try { el.removeAttribute("aria-hidden"); } catch (e) {}
    try { el.style.removeProperty("display"); } catch (e) {}
    try { el.style.removeProperty("pointer-events"); } catch (e) {}
    return true;
}

function shouldKeepCatalogLinkedGalleryHidden(reason) {
    const reasonText = String(reason || "");
    if (/catalog_toggle_open|catalog_open_restore|catalog_prepared_open_restore|catalog_open_ready|gallery_browser_more_bridge/.test(reasonText)) {
        return false;
    }
    if (Date.now() < simpleAIFinishedCatalogPreparedCloseUntil) return true;
    try {
        if (document.documentElement.classList.contains("simpai-main-gallery-browser-closed")) return true;
    } catch (e) {}
    const catalog = getSimpleAIAppElement("finished_images_catalog") || document.getElementById("finished_images_catalog");
    if (catalog && !isSimpleAIPresetCatalogOpen(catalog)) return true;
    return false;
}

function clearSimpleAICatalogLinkedGalleryHidden(reason) {
    if (shouldKeepCatalogLinkedGalleryHidden(reason)) {
        simpaiUiTrace("log", "[UI-TRACE] catalog_gallery.clear_skipped_closed", { reason: reason || "catalog_open" });
        return false;
    }
    try { document.documentElement.classList.remove("simpai-main-gallery-browser-closed"); } catch (e) {}
    try {
        document.querySelectorAll("[data-simpleai-catalog-linked-gallery-wrapper-hidden='1']").forEach((node) => {
            clearSimpleAICatalogLinkedGalleryHiddenElement(node, true);
        });
    } catch (e) {}
    SIMPLEAI_CATALOG_LINKED_GALLERY_IDS.forEach((id) => {
        try { clearSimpleAICatalogLinkedGalleryHiddenElement(getSimpleAIElementById(id)); } catch (e) {}
    });
    simpaiUiTrace("log", "[UI-TRACE] catalog_gallery.clear", { reason: reason || "catalog_open" });
    return true;
}

function clearSimpleAICatalogLinkedGalleryWrappers(reason) {
    let cleared = 0;
    try {
        document.querySelectorAll("[data-simpleai-catalog-linked-gallery-wrapper-hidden='1']").forEach((node) => {
            if (clearSimpleAICatalogLinkedGalleryHiddenElement(node, true)) cleared += 1;
        });
    } catch (e) {}
    if (cleared > 0) {
        simpaiUiTrace("log", "[UI-TRACE] catalog_gallery.wrapper_clear", { reason: reason || "gallery_wrapper_clear", cleared });
    }
    return cleared;
}

function getSimpleAIPresetCatalogBodies(root) {
    if (!root || !root.children) return [];
    return Array.from(root.children).filter((child) => {
        try {
            return !(child.matches && child.matches("button.label-wrap"));
        } catch (e) {
            return true;
        }
    });
}

function setSimpleAIPresetCatalogAttributeIfChanged(element, name, value) {
    if (!element || !name) return false;
    const nextValue = String(value);
    try {
        if (element.getAttribute(name) === nextValue) return false;
        element.setAttribute(name, nextValue);
        return true;
    } catch (e) {
        return false;
    }
}

function setSimpleAIPresetCatalogStyleIfChanged(element, name, value, priority) {
    if (!element || !element.style || !name) return false;
    const nextValue = String(value);
    const nextPriority = String(priority || "");
    try {
        const currentValue = String(element.style.getPropertyValue(name) || "").trim();
        const currentPriority = String(element.style.getPropertyPriority(name) || "");
        const zeroMatches = nextValue === "0" && /^0(?:px)?(?:\s+0(?:px)?){0,3}$/.test(currentValue);
        if ((currentValue === nextValue || zeroMatches) && currentPriority === nextPriority) return false;
        element.style.setProperty(name, nextValue, nextPriority);
        return true;
    } catch (e) {
        return false;
    }
}

function removeSimpleAIAttributeIfPresent(element, name) {
    if (!element || !name || !element.hasAttribute(name)) return false;
    try {
        element.removeAttribute(name);
        return true;
    } catch (e) {
        return false;
    }
}

function removeSimpleAIStyleIfPresent(element, name) {
    if (!element || !element.style || !name || !element.style.getPropertyValue(name)) return false;
    try {
        element.style.removeProperty(name);
        return true;
    } catch (e) {
        return false;
    }
}

function setSimpleAIClassStateIfChanged(element, name, enabled) {
    if (!element || !element.classList || !name) return false;
    const nextEnabled = !!enabled;
    try {
        if (element.classList.contains(name) === nextEnabled) return false;
        element.classList.toggle(name, nextEnabled);
        return true;
    } catch (e) {
        return false;
    }
}

function setSimpleAIPresetCatalogBodiesCollapsed(root, collapsed, options) {
    const force = !!(options && options.force);
    getSimpleAIPresetCatalogBodies(root).forEach((child) => {
        if (!child || !child.style) return;
        if (collapsed) {
            setSimpleAIPresetCatalogAttributeIfChanged(child, "data-simpleai-preset-switch-catalog-body-collapsed", "1");
            setSimpleAIPresetCatalogAttributeIfChanged(child, "aria-hidden", "true");
            setSimpleAIPresetCatalogStyleIfChanged(child, "display", "none", "important");
            setSimpleAIPresetCatalogStyleIfChanged(child, "min-height", "0", "important");
            setSimpleAIPresetCatalogStyleIfChanged(child, "height", "0", "important");
            setSimpleAIPresetCatalogStyleIfChanged(child, "max-height", "0", "important");
            setSimpleAIPresetCatalogStyleIfChanged(child, "margin", "0", "important");
            setSimpleAIPresetCatalogStyleIfChanged(child, "padding", "0", "important");
            setSimpleAIPresetCatalogStyleIfChanged(child, "border", "0", "important");
            setSimpleAIPresetCatalogStyleIfChanged(child, "overflow", "hidden", "important");
        } else {
            let owned = false;
            try { owned = child.dataset.simpleaiPresetSwitchCatalogBodyCollapsed === "1"; } catch (e) {}
            if (!owned && !force) return;
            try { delete child.dataset.simpleaiPresetSwitchCatalogBodyCollapsed; } catch (e) {}
            try { child.removeAttribute("aria-hidden"); } catch (e) {}
            try { child.style.removeProperty("display"); } catch (e) {}
            try { child.style.removeProperty("min-height"); } catch (e) {}
            try { child.style.removeProperty("height"); } catch (e) {}
            try { child.style.removeProperty("max-height"); } catch (e) {}
            try { child.style.removeProperty("margin"); } catch (e) {}
            try { child.style.removeProperty("padding"); } catch (e) {}
            try { child.style.removeProperty("border"); } catch (e) {}
            try { child.style.removeProperty("overflow"); } catch (e) {}
        }
    });
}

function collapseFinishedImagesCatalogClosedHitbox(reason) {
    const root = getSimpleAIElementById("finished_images_catalog");
    if (!root || isSimpleAIPresetCatalogOpen(root)) return false;
    try { root.dataset.simpleaiFinishedCatalogHitboxCollapsed = "1"; } catch (e) {}
    try { root.classList.add("simpai-finished-catalog-hitbox-collapsed"); } catch (e) {}
    setSimpleAIPresetCatalogBodiesCollapsed(root, true);
    simpaiUiTrace("log", "[UI-TRACE] catalog_gallery.closed_hitbox_collapsed", { reason: reason || "catalog_closed" });
    return true;
}

function clearFinishedImagesCatalogClosedHitbox(reason) {
    const root = getSimpleAIElementById("finished_images_catalog");
    if (!root) return false;
    try { delete root.dataset.simpleaiFinishedCatalogHitboxCollapsed; } catch (e) {}
    try { root.classList.remove("simpai-finished-catalog-hitbox-collapsed"); } catch (e) {}
    setSimpleAIPresetCatalogBodiesCollapsed(root, false);
    simpaiUiTrace("log", "[UI-TRACE] catalog_gallery.closed_hitbox_cleared", { reason: reason || "catalog_open" });
    return true;
}

function isFinishedImagesCatalogClosedHitboxCollapsed() {
    const root = getSimpleAIElementById("finished_images_catalog");
    if (!root) return false;
    try {
        return root.dataset.simpleaiFinishedCatalogHitboxCollapsed === "1"
            || root.classList.contains("simpai-finished-catalog-hitbox-collapsed");
    } catch (e) {
        return false;
    }
}

function scheduleSimpleAIPresetCatalogCollapseGuard(root) {
    if (!root || simpleAIPresetSwitchCatalogCollapseRaf) return;
    simpleAIPresetSwitchCatalogCollapseRaf = requestAnimationFrame(() => {
        simpleAIPresetSwitchCatalogCollapseRaf = 0;
        try {
            if (isSimpleAIPresetGallerySuppressed() || root.dataset.simpleaiPresetSwitchCatalogCollapsed === "1") {
                markSimpleAIPresetCatalogCollapsed(root);
            }
        } catch (e) {}
    });
}

function bindSimpleAIPresetCatalogCollapseGuard(root) {
    if (!root) return false;
    if (simpleAIPresetSwitchCatalogObservedRoot === root && simpleAIPresetSwitchCatalogObserver) return true;
    try {
        if (simpleAIPresetSwitchCatalogObserver) simpleAIPresetSwitchCatalogObserver.disconnect();
    } catch (e) {}
    simpleAIPresetSwitchCatalogObserver = null;
    simpleAIPresetSwitchCatalogObservedRoot = root;
    try {
        simpleAIPresetSwitchCatalogObserver = new MutationObserver(() => {
            scheduleSimpleAIPresetCatalogCollapseGuard(root);
        });
        simpleAIPresetSwitchCatalogObserver.observe(root, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["class", "style", "hidden", "aria-expanded", "open"],
        });
        return true;
    } catch (e) {
        return false;
    }
}

function markSimpleAIPresetCatalogCollapsed(root) {
    if (!root) return false;
    try { coverSimpleAIGalleryFrostTargetsForCatalog("catalog_collapse"); } catch (e) {}
    setSimpleAIPresetCatalogAttributeIfChanged(root, "data-simpleai-preset-switch-catalog-collapsed", "1");
    try {
        if (!root.classList.contains("simpai-preset-switch-catalog-collapsed")) {
            root.classList.add("simpai-preset-switch-catalog-collapsed");
        }
    } catch (e) {}
    bindSimpleAIPresetCatalogCollapseGuard(root);
    try {
        const label = root.querySelector(":scope > button.label-wrap") || root.querySelector("button.label-wrap");
        if (label) {
            if (label.classList.contains("open")) label.classList.remove("open");
            setSimpleAIPresetCatalogAttributeIfChanged(label, "aria-expanded", "false");
            try { label.open = false; } catch (e) {}
        }
    } catch (e) {}
    setSimpleAIPresetCatalogBodiesCollapsed(root, true);
    return true;
}

function clearSimpleAIPresetCatalogCollapsed(root, options) {
    if (!root) return false;
    try { delete root.dataset.simpleaiPresetSwitchCatalogCollapsed; } catch (e) {}
    try { root.classList.remove("simpai-preset-switch-catalog-collapsed"); } catch (e) {}
    setSimpleAIPresetCatalogBodiesCollapsed(root, false, options);
    return true;
}

function readPersistedFinishedGalleryBrowserFolder() {
    try {
        return normalizeFinishedGalleryBrowserFolderValue(window.localStorage.getItem(SIMPLEAI_GALLERY_BROWSER_FOLDER_STORAGE_KEY) || "");
    } catch (e) {
        return "";
    }
}

function persistFinishedGalleryBrowserFolder(folder) {
    const value = normalizeFinishedGalleryBrowserFolderValue(folder || "");
    try {
        if (value) window.localStorage.setItem(SIMPLEAI_GALLERY_BROWSER_FOLDER_STORAGE_KEY, value);
        else window.localStorage.removeItem(SIMPLEAI_GALLERY_BROWSER_FOLDER_STORAGE_KEY);
    } catch (e) {}
    return value;
}

function restoreFinishedGalleryBrowserPersistedFolder(reason) {
    const folder = readPersistedFinishedGalleryBrowserFolder();
    if (!folder) return "";
    const existingParams = topbarLastSystemParams && typeof topbarLastSystemParams === "object"
        ? topbarLastSystemParams
        : (window.simpleaiTopbarSystemParams && typeof window.simpleaiTopbarSystemParams === "object" ? window.simpleaiTopbarSystemParams : null);
    const existingFolder = normalizeFinishedGalleryBrowserFolderValue(
        finishedGalleryBrowserState.userFolder
        || finishedGalleryBrowserState.folder
        || (existingParams && existingParams.__main_gallery_browser_folder)
        || ""
    );
    if (existingFolder) return existingFolder;
    finishedGalleryBrowserState.folder = folder;
    finishedGalleryBrowserState.userFolder = folder;
    try { setFinishedGalleryBrowserNativeFolderDisplay(folder); } catch (e) {}
    try {
        let params = existingParams;
        if (!params) params = {};
        if (!params.__main_gallery_browser_folder) params.__main_gallery_browser_folder = folder;
        if (!params.gallery_state) params.gallery_state = "main_browser";
        if (!params.__gallery_engine_type && !params.engine_type) params.__gallery_engine_type = getFinishedGalleryBrowserMode();
        topbarLastSystemParams = params;
        window.simpleaiTopbarSystemParams = params;
        simpaiUiTrace("log", "[UI-TRACE] gallery_browser.persisted_folder_restored", {
            reason: reason || "persisted_folder",
            folder,
        });
    } catch (e) {}
    return folder;
}

const SIMPLEAI_GALLERY_BROWSER_PARAM_KEYS = [
    "__main_gallery_browser_key",
    "__main_gallery_browser_paths",
    "__main_gallery_browser_dimensions",
    "__main_gallery_browser_folder",
    "__main_gallery_browser_folders",
    "__main_gallery_browser_next_offset",
    "__main_gallery_browser_has_more",
    "__main_gallery_browser_request_folder",
    "__main_gallery_browser_request_input_folder",
    "__main_gallery_browser_request_id",
    "__main_gallery_browser_active_request_id",
    "__main_gallery_browser_request_action",
    "__main_gallery_browser_request_media_type",
    "__main_gallery_browser_bridge_payload",
    "__main_gallery_browser_noop_response",
    "__main_gallery_browser_request_ignored",
];

function clearPostGenerationResultParamsForGenerationStart(params) {
    if (!params || typeof params !== "object") return params;
    params.__post_generation_compare_input_ok = false;
    params.__post_generation_compare_visible = false;
    params.__post_generation_compare_ready = false;
    params.__post_generation_compare_cleared = true;
    [
        "__post_generation_compare_choice",
        "__post_generation_image_url",
        "__post_generation_has_output",
        "__post_generation_gallery_output",
        "__post_generation_video_output",
    ].forEach((key) => {
        try { delete params[key]; } catch (e) {}
    });
    return params;
}

function clearFinishedGalleryBrowserParamsForResultState(params, reason) {
    if (!params || typeof params !== "object") return params;
    const state = String(params.gallery_state || "");
    const hasPostGenerationState = !!(
        params.__post_generation_has_output
        || params.__post_generation_gallery_output
        || params.__post_generation_video_output
        || params.__post_generation_compare_ready
        || params.__post_generation_compare_visible
        || params.__post_generation_image_url
    );
    const resultState = hasPostGenerationState || (state && state !== "main_browser");
    if (!resultState) return params;
    SIMPLEAI_GALLERY_BROWSER_PARAM_KEYS.forEach((key) => {
        try { delete params[key]; } catch (e) {}
    });
    if (hasPostGenerationState && params.gallery_state === "main_browser") {
        params.gallery_state = "finished_index";
    }
    if (hasPostGenerationState) {
        resetFinishedGalleryBrowserRuntimeForResultState(reason || "result_state");
    }
    try {
        simpaiUiTrace("log", "[UI-TRACE] gallery_browser.topbar_params_stripped", {
            reason: reason || "result_state",
            gallery_state: params.gallery_state || state,
            post_generation: hasPostGenerationState,
        });
    } catch (e) {}
    return params;
}

function hasOwnFinishedGalleryBrowserParamKey(params) {
    if (!params || typeof params !== "object") return false;
    return SIMPLEAI_GALLERY_BROWSER_PARAM_KEYS.some((key) => Object.prototype.hasOwnProperty.call(params, key));
}

function clearFinishedGalleryBrowserParamsForIndexState(params, reason) {
    if (!params || typeof params !== "object") return params;
    const hadBrowserState = params.gallery_state === "main_browser" || hasOwnFinishedGalleryBrowserParamKey(params);
    SIMPLEAI_GALLERY_BROWSER_PARAM_KEYS.forEach((key) => {
        try { delete params[key]; } catch (e) {}
    });
    if (params.gallery_state === "main_browser" || !params.gallery_state) {
        params.gallery_state = "finished_index";
    }
    resetFinishedGalleryBrowserRuntimeForResultState(reason || "finished_index");
    try {
        simpaiUiTrace("log", "[UI-TRACE] gallery_browser.index_params_stripped", {
            reason: reason || "finished_index",
            had_browser_state: hadBrowserState,
            gallery_state: params.gallery_state || "",
        });
    } catch (e) {}
    return params;
}
window.clearFinishedGalleryBrowserParamsForIndexState = clearFinishedGalleryBrowserParamsForIndexState;

function shouldPreserveFinishedGalleryBrowserStateDuringMerge(incoming, reason) {
    if (incoming && typeof incoming === "object" && incoming.gallery_state === "main_browser") return true;
    if (incoming && typeof incoming === "object" && hasOwnFinishedGalleryBrowserParamKey(incoming)) return true;
    return /^gallery_browser(?:[._]|$)/.test(String(reason || ""));
}

function resetFinishedGalleryBrowserRuntimeForResultState(reason) {
    try {
        try { clearFinishedGalleryBrowserCatalogOpenIntent(reason || "result_state"); } catch (_e) {}
        finishedGalleryBrowserState.loading = false;
        finishedGalleryBrowserState.pendingPayload = null;
        finishedGalleryBrowserState.queuedOptions = null;
        finishedGalleryBrowserState.restoreScrollTop = null;
        finishedGalleryBrowserState.folder = "";
        finishedGalleryBrowserState.userFolder = "";
        finishedGalleryBrowserState.paths = [];
        finishedGalleryBrowserState.dimensions = {};
        finishedGalleryBrowserState.loaded = 0;
        finishedGalleryBrowserState.nextOffset = 0;
        finishedGalleryBrowserState.hasMore = false;
        finishedGalleryBrowserPreloadInFlight = false;
        syncFinishedGalleryBrowserMoreButton();
        setFinishedGalleryBrowserStatus("");
        try { setFinishedGalleryBrowserNativeFolderDisplay(""); } catch (e) {}
        try { releaseFinishedGalleryWelcomeGuard(false, reason || "result_state"); } catch (e) {}
        try {
            simpaiUiTrace("log", "[UI-TRACE] gallery_browser.runtime_reset_for_result", {
                reason: reason || "result_state",
            });
        } catch (e) {}
        return true;
    } catch (e) {
        return false;
    }
}

function isFinishedGalleryBrowserParamsContext(params) {
    if (!params || typeof params !== "object") return false;
    if (params.gallery_state === "main_browser") return true;
    return hasOwnFinishedGalleryBrowserParamKey(params);
}

function preserveFinishedGalleryBrowserFolderInParams(params, reason) {
    if (!params || typeof params !== "object") return params;
    clearFinishedGalleryBrowserParamsForResultState(params, reason || "topbar_params");
    if (!isFinishedGalleryBrowserParamsContext(params)) return params;
    if (params.__main_gallery_browser_folder) return params;
    const folder = normalizeFinishedGalleryBrowserFolderValue(
        finishedGalleryBrowserState.userFolder
        || finishedGalleryBrowserState.folder
        || ""
    );
    if (!folder) return params;
    params.__main_gallery_browser_folder = folder;
    if (!params.gallery_state) params.gallery_state = "main_browser";
    if (!params.__gallery_engine_type && !params.engine_type) params.__gallery_engine_type = getFinishedGalleryBrowserMode();
    if (!Array.isArray(params.__main_gallery_browser_folders) && Array.isArray(finishedGalleryBrowserState.folders)) {
        params.__main_gallery_browser_folders = finishedGalleryBrowserState.folders;
    }
    if (!Array.isArray(params.__main_gallery_browser_paths) && Array.isArray(finishedGalleryBrowserState.paths)) {
        params.__main_gallery_browser_paths = finishedGalleryBrowserState.paths;
    }
    if (!params.__main_gallery_browser_dimensions && finishedGalleryBrowserState.dimensions && typeof finishedGalleryBrowserState.dimensions === "object") {
        params.__main_gallery_browser_dimensions = finishedGalleryBrowserState.dimensions;
    }
    if (params.__main_gallery_browser_next_offset === undefined && finishedGalleryBrowserState.nextOffset !== undefined) {
        params.__main_gallery_browser_next_offset = finishedGalleryBrowserState.nextOffset;
    }
    if (params.__main_gallery_browser_has_more === undefined) {
        params.__main_gallery_browser_has_more = !!finishedGalleryBrowserState.hasMore;
    }
    simpaiUiTrace("log", "[UI-TRACE] gallery_browser.topbar_folder_preserved", {
        reason: reason || "topbar_params",
        folder,
    });
    return params;
}

function scheduleFinishedGalleryBrowserEarlyOpenRefresh(reason) {
    window.clearTimeout(finishedGalleryBrowserEarlyOpenRefreshTimer);
    const currentParams = topbarLastSystemParams || window.simpleaiTopbarSystemParams || {};
    const paramsFolder = normalizeFinishedGalleryBrowserFolderValue((currentParams && currentParams.__main_gallery_browser_folder) || "");
    const existingFolder = normalizeFinishedGalleryBrowserFolderValue(
        finishedGalleryBrowserState.userFolder
        || finishedGalleryBrowserState.folder
        || paramsFolder
        || ""
    );
    const openFolder = existingFolder;
    finishedGalleryBrowserEarlyOpenRefreshTimer = window.setTimeout(() => {
        finishedGalleryBrowserEarlyOpenRefreshTimer = null;
        const root = getFinishedGalleryBrowserElement("finished_images_catalog");
        if (root && !isSimpleAIPresetCatalogOpen(root)) {
            ensureSimpleAIPresetCatalogOpen(root, "catalog_toggle_open_capture");
        }
        try { clearSimpleAICatalogLinkedGalleryHidden("catalog_toggle_open_capture"); } catch (e) {}
        try { keepWelcomePreviewUntilFinishedGalleryReady("catalog_toggle_open_capture"); } catch (e) {}
        const folderRoot = getFinishedGalleryBrowserElement("gallery_browser_folder");
        const folder = (folderRoot ? readGalleryBrowserFolderValue(folderRoot) : "") || openFolder || "";
        const latestParams = topbarLastSystemParams || window.simpleaiTopbarSystemParams || currentParams || {};
        const preferBridge = shouldPreferFinishedGalleryBrowserBridge(latestParams, folder);
        simpaiUiTrace("log", "[UI-TRACE] gallery_browser.early_open_refresh", {
            reason: reason || "catalog_toggle_preopen",
            folder,
            preferBridge,
        });
        refreshFinishedGalleryBrowser({
            reset: true,
            force: true,
            allowClosedCatalog: true,
            preferBridge,
            folder: folder || undefined,
        });
    }, 90);
}

function shouldPreferFinishedGalleryBrowserBridge(currentParams, requestedFolder) {
    const params = currentParams && typeof currentParams === "object" ? currentParams : {};
    const normalizedRequest = normalizeFinishedGalleryBrowserFolderValue(requestedFolder || "");
    const paramsFolder = normalizeFinishedGalleryBrowserFolderValue((params && params.__main_gallery_browser_folder) || "");
    const localFolder = normalizeFinishedGalleryBrowserFolderValue(finishedGalleryBrowserState.userFolder || finishedGalleryBrowserState.folder || "");
    const currentFolder = paramsFolder || localFolder;
    const paramsPaths = Array.isArray(params.__main_gallery_browser_paths) ? params.__main_gallery_browser_paths : null;
    const paramsFolders = Array.isArray(params.__main_gallery_browser_folders) ? params.__main_gallery_browser_folders : null;
    const localPaths = Array.isArray(finishedGalleryBrowserState.paths) ? finishedGalleryBrowserState.paths : [];
    const localFolders = Array.isArray(finishedGalleryBrowserState.folders) ? finishedGalleryBrowserState.folders : [];
    const hasPaths = (paramsPaths && paramsPaths.length > 0) || localPaths.length > 0;
    const hasFolders = (paramsFolders && paramsFolders.length > 0) || localFolders.length > 0;
    if (Date.now() < simpleAIFinishedCatalogPreparedOpenUntil && (!hasFolders || !hasPaths)) return true;
    const loaded = Number(finishedGalleryBrowserState.loaded || 0);
    if (!currentFolder || (normalizedRequest && currentFolder !== normalizedRequest)) return false;
    if (loaded >= 36 && (!hasFolders || !hasPaths)) return true;
    return false;
}

function isSimpleAIPresetCatalogRestoreCurrent(root) {
    if (!root) return false;
    let collapsed = false;
    try {
        collapsed = root.dataset.simpleaiPresetSwitchCatalogCollapsed === "1"
            || root.classList.contains("simpai-preset-switch-catalog-collapsed")
            || root.dataset.simpleaiFinishedCatalogHitboxCollapsed === "1"
            || root.classList.contains("simpai-finished-catalog-hitbox-collapsed")
            || root.dataset.simpleaiPresetSwitchGalleryHidden === "1";
    } catch (e) {}
    if (collapsed) return false;
    const bodyVisible = isSimpleAIPresetCatalogBodyVisible(root);
    if (!bodyVisible) return false;
    try {
        const label = root.querySelector(":scope > button.label-wrap") || root.querySelector("button.label-wrap");
        if (!label) return true;
        const aria = label.getAttribute("aria-expanded");
        return label.classList.contains("open") && aria !== "false";
    } catch (e) {
        return true;
    }
}

function ensureSimpleAIPresetCatalogOpen(root, reason) {
    if (!root) return false;
    const alreadyOpen = isSimpleAIPresetCatalogRestoreCurrent(root);
    if (!alreadyOpen) {
        try { coverSimpleAIGalleryFrostTargetsForCatalog(reason || "catalog_open_restore"); } catch (e) {}
    }
    if (alreadyOpen) return true;
    try { document.documentElement.classList.remove("simpai-main-gallery-browser-closed"); } catch (e) {}
    clearSimpleAIPresetCatalogCollapsed(root, { force: true });
    try { clearSimpleAIPresetGalleryHiddenElement(root); } catch (e) {}
    try { clearFinishedImagesCatalogClosedHitbox(reason || "catalog_open_restore"); } catch (e) {}
    try {
        const label = root.querySelector(":scope > button.label-wrap") || root.querySelector("button.label-wrap");
        if (label) {
            label.classList.add("open");
            label.setAttribute("aria-expanded", "true");
            try { label.open = true; } catch (e) {}
        }
    } catch (e) {}
    setSimpleAIPresetCatalogBodiesCollapsed(root, false, { force: true });
    simpaiUiTrace("log", "[UI-TRACE] catalog_gallery.open_restored", { reason: reason || "catalog_open_restore" });
    return isSimpleAIPresetCatalogOpen(root);
}

function scheduleSimpleAIPresetCatalogPreparedOpenRestore(root, reason) {
    simpleAIFinishedCatalogPreparedOpenUntil = Math.max(simpleAIFinishedCatalogPreparedOpenUntil, Date.now() + 1600);
    [30, 90, 180, 360, 700, 1200, 1600].forEach((delay) => {
        window.setTimeout(() => {
            if (Date.now() > simpleAIFinishedCatalogPreparedOpenUntil) return;
            if (Date.now() < simpleAIFinishedCatalogPreparedCloseUntil) return;
            const latestRoot = getFinishedGalleryBrowserElement("finished_images_catalog") || root;
            if (!latestRoot) return;
            if (!isSimpleAIPresetCatalogBodyVisible(latestRoot)) {
                ensureSimpleAIPresetCatalogOpen(latestRoot, `${reason || "catalog_prepared_open_restore"}+${delay}ms`);
            }
            try { clearSimpleAICatalogLinkedGalleryHidden(`${reason || "catalog_prepared_open_restore"}+${delay}ms`); } catch (e) {}
        }, delay);
    });
}

function scheduleFinishedGalleryBrowserCatalogOpenRestore(reason) {
    simpleAIFinishedCatalogForceOpenUntil = Math.max(simpleAIFinishedCatalogForceOpenUntil, Date.now() + 1400);
    [40, 120, 260, 520, 1000, 1400].forEach((delay) => {
        window.setTimeout(() => {
            if (Date.now() > simpleAIFinishedCatalogForceOpenUntil) return;
            if (Date.now() < simpleAIFinishedCatalogPreparedCloseUntil) return;
            const root = getFinishedGalleryBrowserElement("finished_images_catalog") || document.getElementById("finished_images_catalog");
            if (!root) return;
            ensureSimpleAIPresetCatalogOpen(root, `${reason || "catalog_open_restore"}+${delay}ms`);
            try { clearSimpleAICatalogLinkedGalleryHidden(`${reason || "catalog_open_restore"}+${delay}ms`); } catch (e) {}
        }, delay);
    });
}

function collapseSimpleAIFinishedGalleryCatalog(root) {
    return markSimpleAIPresetCatalogCollapsed(root);
}

function isSimpleAIPresetCatalogBodyVisible(root) {
    if (!root) return false;
    try {
        return getSimpleAIPresetCatalogBodies(root).some((body) => {
            const rect = body.getBoundingClientRect ? body.getBoundingClientRect() : null;
            const style = window.getComputedStyle ? window.getComputedStyle(body) : null;
            if (style && (style.display === "none" || style.visibility === "hidden")) return false;
            return !!rect && rect.width > 0 && rect.height > 2;
        });
    } catch (e) {
        return false;
    }
}

function isSimpleAIPresetCatalogOpen(root) {
    if (!root) return false;
    try {
        const label = root.querySelector(":scope > button.label-wrap") || root.querySelector("button.label-wrap");
        if (label) {
            if (label.classList.contains("open")) return true;
            if (label.getAttribute("aria-expanded") === "true") return true;
        }
        return isSimpleAIPresetCatalogBodyVisible(root);
    } catch (e) {
        return false;
    }
}

function scheduleSimpleAIPresetCatalogReopenAfterClear(root, reason) {
    if (!root) return false;
    const label = root.querySelector(":scope > button.label-wrap") || root.querySelector("button.label-wrap");
    if (!label || typeof label.click !== "function") return false;
    setTimeout(() => {
        try {
            if (isSimpleAIPresetGallerySuppressed()) return;
            if (isSimpleAIPresetCatalogOpen(root)) return;
            label.click();
            simpaiUiTrace("log", "[UI-TRACE] preset_gallery.catalog_reopen_after_clear", { reason: reason || "user_click" });
        } catch (e) {}
    }, 40);
    return true;
}

function closeSimpleAICatalogLinkedGallery(reason, options) {
    const reasonText = String(reason || "");
    const markWrappers = !(options && options.markWrappers === false);
    const resetBrowserState = !(options && options.resetBrowserState === false);
    const collapseCatalog = !(options && options.collapseCatalog === false);
    window.clearTimeout(finishedGalleryBrowserEarlyOpenRefreshTimer);
    finishedGalleryBrowserEarlyOpenRefreshTimer = null;
    try { clearFinishedGalleryBrowserCatalogOpenIntent(reason || "catalog_close"); } catch (e) {}
    simpleAIFinishedCatalogPreparedOpenUntil = 0;
    simpleAIFinishedCatalogForceOpenUntil = 0;
    let catalogCollapsed = false;
    if (collapseCatalog) {
        try {
            const catalog = getSimpleAIElementById("finished_images_catalog") || document.getElementById("finished_images_catalog");
            catalogCollapsed = collapseSimpleAIFinishedGalleryCatalog(catalog);
        } catch (e) {}
    }
    try { releaseFinishedGalleryWelcomeGuard(false, reason || "catalog_close"); } catch (e) {}
    try { collapseFinishedImagesCatalogClosedHitbox(reason || "catalog_close"); } catch (e) {}
    if (resetBrowserState) resetSimpleAIGalleryBrowserStateForPresetSwitch();
    closeSimpleAIManagedGalleryPreviews();
    try {
        if (typeof closeModal === "function") closeModal();
    } catch (e) {}
    try {
        document.documentElement.classList.remove("simpleai-gallery-fullscreen-open");
        document.documentElement.classList.remove("simpai-video-result-preview");
        document.documentElement.classList.remove("simpai-comparison-preview");
        document.documentElement.classList.add("simpai-main-gallery-browser-closed");
        document.body.classList.remove("simpleai-gallery-fullscreen-open");
    } catch (e) {}
    try {
        const modal = getSimpleAIElementById("lightboxModal") || document.getElementById("lightboxModal");
        if (modal) {
            modal.style.setProperty("display", "none", "important");
            modal.style.setProperty("visibility", "hidden", "important");
            modal.setAttribute("aria-hidden", "true");
        }
    } catch (e) {}
    SIMPLEAI_CATALOG_LINKED_GALLERY_IDS.forEach((id) => {
        try { markSimpleAICatalogLinkedGalleryHidden(getSimpleAIElementById(id), { markWrappers }); } catch (e) {}
    });
    if (!markWrappers) {
        clearSimpleAICatalogLinkedGalleryWrappers(reasonText || "catalog_close_no_wrapper");
    }
    try { restoreWelcomePreviewAfterCatalogClose(reason || "catalog_close"); } catch (e) {}
    simpaiUiTrace("log", "[UI-TRACE] catalog_gallery.close", { reason: reason || "catalog_close", markWrappers, resetBrowserState, collapseCatalog, catalogCollapsed });
}

function closeSimpleAISceneTransientEditorsForPresetSwitch(reason) {
    try {
        if (typeof window.closeSam3FramesEditor === "function") {
            window.closeSam3FramesEditor();
        }
    } catch (e) {}
    try { document.body.classList.remove("sam3-frames-editor-open"); } catch (e) {}
    try {
        const backdrop = document.getElementById("sam3_frames_modal_backdrop");
        if (backdrop) {
            backdrop.style.setProperty("display", "none", "important");
            backdrop.style.removeProperty("visibility");
            backdrop.style.removeProperty("pointer-events");
            backdrop.setAttribute("aria-hidden", "true");
        }
        const modal = document.getElementById("sam3_frames_modal");
        if (modal && modal.style) {
            ["display", "visibility", "pointer-events", "min-height", "height", "max-height", "margin", "padding", "overflow"].forEach((prop) => {
                modal.style.removeProperty(prop);
            });
            modal.removeAttribute("aria-hidden");
        }
    } catch (e) {}
    simpaiUiTrace("log", "[UI-TRACE] scene_transient_editors.close", { reason: reason || "preset_switch" });
}

function closeSimpleAIManagedGalleryPreviews() {
    try {
        document.querySelectorAll("#finished_gallery .gallery-container > .preview, #final_gallery .gallery-container > .preview").forEach((preview) => {
            let button = null;
            try {
                button = preview.querySelector([
                    'button[aria-label*="close" i]',
                    'button[title*="close" i]',
                    'button[aria-label*="关闭"]',
                    'button[title*="关闭"]',
                    ".close-button",
                    ".exit-button",
                ].join(","));
            } catch (e) {
                button = null;
            }
            if (!button) {
                button = Array.from(preview.querySelectorAll("button")).find((candidate) => /^(x|×|close|关闭)$/i.test((candidate.textContent || "").trim()));
            }
            if (button && typeof button.click === "function") {
                try { button.click(); } catch (e) {}
            }
        });
    } catch (e) {}
}

function getSimpleAICompareButtonElement() {
    try { return getSimpleAIAppElement("compare_btn") || getSimpleAIElementById("compare_btn") || document.getElementById("compare_btn"); } catch (e) {}
    try { return document.getElementById("compare_btn"); } catch (e) { return null; }
}

function getSimpleAICompareButtonElements(primary) {
    const nodes = [];
    const seen = new Set();
    const add = (node) => {
        if (!node || seen.has(node)) return;
        seen.add(node);
        nodes.push(node);
    };
    add(primary);
    add(getSimpleAICompareButtonElement());
    try { document.querySelectorAll("#compare_btn").forEach(add); } catch (e) {}
    return nodes;
}

function ensureSimpleAICompareButtonLabel(el) {
    if (!el) return;
    try {
        const text = String(el.textContent || "").trim();
        if (!text || text === "🖼️" || text === "A|B" || text === "◫") el.textContent = SIMPLEAI_COMPARE_BUTTON_ICON;
    } catch (e) {}
    try { el.title = "前后对比"; } catch (e) {}
    try { el.setAttribute("aria-label", "前后对比"); } catch (e) {}
}

function restoreSimpleAICompareButtonNodeInteractivity(node) {
    if (!node) return;
    try { if ("disabled" in node) node.disabled = false; } catch (e) {}
    try { node.removeAttribute("aria-disabled"); } catch (e) {}
    try { node.style.removeProperty("pointer-events"); } catch (e) {}
    try { node.style.removeProperty("cursor"); } catch (e) {}
}

function restoreSimpleAICompareButtonInteractivity(el) {
    getSimpleAICompareButtonElements(el).forEach((node) => {
        restoreSimpleAICompareButtonNodeInteractivity(node);
    });
}

function setSimpleAICompareButtonReadyState(el, ready) {
    getSimpleAICompareButtonElements(el).forEach((node) => {
        ensureSimpleAICompareButtonLabel(node);
        restoreSimpleAICompareButtonNodeInteractivity(node);
        try { node.classList.toggle("simpleai-compare-ready", !!ready); } catch (e) {}
        try {
            node.classList.toggle("primary", !!ready);
            node.classList.toggle("secondary", !ready);
        } catch (e) {}
        try { node.dataset.simpleaiCompareReady = ready ? "1" : "0"; } catch (e) {}
    });
}

function clearSimpleAICompareReadyState(reason) {
    setSimpleAICompareButtonReadyState(getSimpleAICompareButtonElement(), false);
    getSimpleAICompareButtonElements().forEach((node) => {
        try {
            node.classList.remove("primary");
            node.classList.add("secondary");
        } catch (e) {}
    });
    try { document.documentElement.classList.remove("simpai-comparison-preview"); } catch (e) {}
    try {
        const box = getSimpleAIAppElement("comparison_box") || getSimpleAIElementById("comparison_box") || document.getElementById("comparison_box");
        if (box) {
            box.style.setProperty("display", "none", "important");
            box.setAttribute("aria-hidden", "true");
            box.classList.add("hidden");
        }
    } catch (e) {}
    simpaiUiTrace("log", "[UI-TRACE] comparison.ready_clear", { reason: reason || "clear" });
}

function syncSimpleAIImageToolsEnabledClass(enabled) {
    try {
        document.documentElement.classList.toggle("simpleai-image-tools-disabled", enabled === false);
    } catch (e) {}
    try {
        if (typeof simpleaiSyncGalleryToolboxState === "function") simpleaiSyncGalleryToolboxState();
    } catch (e) {}
}
window.syncSimpleAIImageToolsEnabledClass = syncSimpleAIImageToolsEnabledClass;

function readSimpleAIImageToolsEnabledFromDom() {
    let input = null;
    try {
        input = document.querySelector("#image_tools_checkbox input[type='checkbox'], input#image_tools_checkbox[type='checkbox']");
    } catch (e) {
        input = null;
    }
    if (!input) return null;
    return !!input.checked;
}
window.readSimpleAIImageToolsEnabledFromDom = readSimpleAIImageToolsEnabledFromDom;

function syncSimpleAIImageToolsEnabledFromDom(reason) {
    const enabled = readSimpleAIImageToolsEnabledFromDom();
    if (enabled === null) return null;
    syncSimpleAIImageToolsEnabledClass(enabled);
    if (!enabled) {
        try { clearSimpleAICompareReadyState(reason || "image_tools_checkbox_dom"); } catch (e) {}
    }
    return enabled;
}
window.syncSimpleAIImageToolsEnabledFromDom = syncSimpleAIImageToolsEnabledFromDom;

document.addEventListener("change", (evt) => {
    const target = evt && evt.target;
    if (!target || !target.closest) return;
    if (!target.closest("#image_tools_checkbox")) return;
    syncSimpleAIImageToolsEnabledFromDom("image_tools_checkbox_change");
    setTimeout(() => syncSimpleAIImageToolsEnabledFromDom("image_tools_checkbox_change+80"), 80);
}, true);
setTimeout(() => syncSimpleAIImageToolsEnabledFromDom("dom_ready"), 0);
setTimeout(() => syncSimpleAIImageToolsEnabledFromDom("dom_ready+500"), 500);

function resetSimpleAIGalleryBrowserStateForPresetSwitch() {
    try { window.clearTimeout(finishedGalleryBrowserRefreshTimer); } catch (e) {}
    try { window.clearTimeout(finishedGalleryBrowserBridgeRetryTimer); } catch (e) {}
    try {
        clearFinishedGalleryBrowserCatalogOpenIntent("gallery_browser_runtime_reset");
        finishedGalleryBrowserState.loading = false;
        finishedGalleryBrowserState.pendingPayload = null;
        finishedGalleryBrowserState.queuedOptions = null;
        finishedGalleryBrowserState.restoreScrollTop = null;
        finishedGalleryBrowserState.activeRequestId = ++finishedGalleryBrowserRequestSeq;
        syncFinishedGalleryBrowserMoreButton();
    } catch (e) {}
}

function closeSimpleAIOpenGalleriesForPresetSwitch(reason, options) {
    const closeToken = options && options.closeToken;
    if (typeof closeToken === "number" && closeToken !== simpleAIPresetSwitchGalleryCloseToken) {
        simpaiUiTrace("log", "[UI-TRACE] preset_gallery.close_skipped_stale", { reason: reason || "preset_switch", closeToken });
        return;
    }
    const reasonText = String(reason || "");
    const isStatusDriven = reasonText.startsWith("preset_nav_status");
    if (isStatusDriven && Date.now() < simpleAIPresetSwitchGalleryIgnoreStatusUntil) {
        simpaiUiTrace("log", "[UI-TRACE] preset_gallery.close_skipped_after_generation_clear", { reason: reasonText });
        return;
    }
    const suppressMs = Math.max(300, Number(options && options.suppressMs ? options.suppressMs : SIMPLEAI_PRESET_SWITCH_GALLERY_SUPPRESS_MS));
    simpleAIPresetSwitchGalleryHiddenUntil = Math.max(simpleAIPresetSwitchGalleryHiddenUntil, Date.now() + suppressMs);
    try { document.documentElement.classList.add("simpai-preset-switch-gallery-suppressed"); } catch (e) {}
    try {
        window.clearTimeout(simpleAIPresetSwitchGalleryCleanupTimer);
        simpleAIPresetSwitchGalleryCleanupTimer = window.setTimeout(() => {
            if (Date.now() >= simpleAIPresetSwitchGalleryHiddenUntil) {
                document.documentElement.classList.remove("simpai-preset-switch-gallery-suppressed");
            }
        }, suppressMs + 80);
    } catch (e) {}

    try {
        if (typeof closeModal === "function") closeModal();
    } catch (e) {}
    try {
        const modal = getSimpleAIElementById("lightboxModal") || document.getElementById("lightboxModal");
        if (modal) {
            modal.style.setProperty("display", "none", "important");
            modal.style.setProperty("visibility", "hidden", "important");
            modal.setAttribute("aria-hidden", "true");
        }
    } catch (e) {}
    try {
        if (typeof simpleaiExitGalleryFullscreen === "function") simpleaiExitGalleryFullscreen(true);
    } catch (e) {}
    try {
        document.documentElement.classList.remove("simpleai-gallery-fullscreen-open");
        document.documentElement.classList.remove("simpai-video-result-preview");
        document.documentElement.classList.remove("simpai-comparison-preview");
        document.body.classList.remove("simpleai-gallery-fullscreen-open");
    } catch (e) {}
    closeSimpleAIManagedGalleryPreviews();
    try { releaseFinishedGalleryWelcomeGuard(false, reason || "preset_switch"); } catch (e) {}
    try { resetPostGenerationResultSurfaceState(reason || "preset_switch"); } catch (e) {}
    resetSimpleAIGalleryBrowserStateForPresetSwitch();
    closeSimpleAISceneTransientEditorsForPresetSwitch(reason);

    try {
        const catalog = getSimpleAIElementById("finished_images_catalog");
        collapseSimpleAIFinishedGalleryCatalog(catalog);
        clearSimpleAIPresetGalleryHiddenElement(catalog);
    } catch (e) {}
    SIMPLEAI_PRESET_SWITCH_GALLERY_IDS.forEach((id) => {
        try { markSimpleAIPresetGalleryHidden(getSimpleAIElementById(id)); } catch (e) {}
    });
    if (!/generate_start|preview_start/i.test(reasonText)) {
        try { restoreWelcomePreviewAfterCatalogClose(reason || "preset_switch"); } catch (e) {}
    }
    simpaiUiTrace("log", "[UI-TRACE] preset_gallery.close", { reason: reason || "preset_switch" });
}

function scheduleCloseSimpleAIOpenGalleriesForPresetSwitch(reason) {
    simpleAIPresetSwitchGalleryClearToken += 1;
    const closeToken = ++simpleAIPresetSwitchGalleryCloseToken;
    closeSimpleAIOpenGalleriesForPresetSwitch(reason, { closeToken });
    SIMPLEAI_PRESET_SWITCH_GALLERY_RETRY_DELAYS.forEach((delay) => {
        setTimeout(() => closeSimpleAIOpenGalleriesForPresetSwitch(`${reason || "preset_switch"}+${delay}ms`, { closeToken }), delay);
    });
}

function clearSimpleAIPresetSwitchGalleryHidden(reason) {
    const reasonText = String(reason || "");
    if (shouldKeepPresetSwitchGalleryHiddenDuringNavClear(reasonText)) {
        try { closeSimpleAIOpenGalleriesForPresetSwitch(`preset_nav_clear_blocked:${reasonText}`, { suppressMs: SIMPLEAI_PRESET_SWITCH_GALLERY_SUPPRESS_MS }); } catch (e) {}
        simpaiUiTrace("log", "[UI-TRACE] preset_gallery.clear_deferred_during_nav", { reason: reason || "preset_nav" });
        return false;
    }
    simpleAIPresetSwitchGalleryCloseToken += 1;
    if (/generate_start|preview_start|preset_switch|preset_nav/i.test(reasonText)) {
        try { resetPostGenerationResultSurfaceState(reasonText || "preset_gallery_clear"); } catch (e) {}
    }
    if (/generation_done/i.test(reasonText)) {
        try { releaseFinishedGalleryWelcomeGuard(true, reasonText || "generation_done"); } catch (e) {}
        try { restoreFinishedGalleryWelcomePreviewImage(getWelcomePreviewElement(), reasonText || "generation_done"); } catch (e) {}
        try { removeFinishedGalleryWelcomePlaceholder(); } catch (e) {}
    }
    if (/generate_start|preview_start/i.test(reasonText)) {
        if (/generate|generation|preview/i.test(reasonText)) {
            simpleAIPresetSwitchGalleryIgnoreStatusUntil = Date.now() + 10000;
        }
        try { setFinishedGalleryBrowserHasMediaState(false, reasonText || "generation_start"); } catch (e) {}
        try { closeSimpleAICatalogLinkedGallery(reasonText || "generation_start", { markWrappers: false }); } catch (e) {}
        simpaiUiTrace("log", "[UI-TRACE] preset_gallery.generation_start_hide", { reason: reason || "generation_start" });
        return;
    }
    if (/generate|generation|preview/i.test(reasonText)) {
        simpleAIPresetSwitchGalleryIgnoreStatusUntil = Date.now() + 10000;
    }
    simpleAIPresetSwitchGalleryHiddenUntil = 0;
    try { window.clearTimeout(simpleAIPresetSwitchGalleryCleanupTimer); } catch (e) {}
    try { document.documentElement.classList.remove("simpai-preset-switch-gallery-suppressed"); } catch (e) {}
    try {
        const catalog = getSimpleAIElementById("finished_images_catalog");
        clearSimpleAIPresetCatalogCollapsed(catalog);
        clearSimpleAIPresetGalleryHiddenElement(catalog);
    } catch (e) {}
    SIMPLEAI_PRESET_SWITCH_GALLERY_IDS.forEach((id) => {
        try { clearSimpleAIPresetGalleryHiddenElement(getSimpleAIElementById(id)); } catch (e) {}
    });
    clearSimpleAICatalogLinkedGalleryHidden(reason);
    simpaiUiTrace("log", "[UI-TRACE] preset_gallery.clear", { reason: reason || "user_action" });
    return true;
}

function allowCatalogOpenDuringPresetSwitch(reason) {
    simpleAIPresetSwitchGalleryCloseToken += 1;
    simpleAIPresetSwitchGalleryIgnoreStatusUntil = Date.now() + 1800;
    try { window.clearTimeout(simpleAIPresetSwitchGalleryCleanupTimer); } catch (e) {}
    try { document.documentElement.classList.remove("simpai-preset-switch-gallery-suppressed"); } catch (e) {}
    simpleAIPresetSwitchGalleryHiddenUntil = 0;
    simpaiUiTrace("log", "[UI-TRACE] preset_gallery.user_catalog_open_allows_clear", { reason: reason || "catalog_open" });
}

function shouldKeepPresetSwitchGalleryHiddenDuringNavClear(reason) {
    const reasonText = String(reason || "");
    const active = !!(
        presetNavProgressActive
        || document.documentElement.classList.contains("simpai-preset-nav-active")
        || isSimpleAIPresetGallerySuppressed()
    );
    if (!active) return false;
    if (/generate_start|preview_start|generation_done|catalog_toggle_user_open/i.test(reasonText)) return false;
    if (/catalog_toggle_preopen|click:finished_images_catalog/i.test(reasonText)) return false;
    return true;
}

function scheduleSimpleAIPresetGalleryClear(reason) {
    const clearReason = reason || "scheduled_clear";
    const clearToken = ++simpleAIPresetSwitchGalleryClearToken;
    clearSimpleAIPresetSwitchGalleryHidden(clearReason);
    [80, 240, 700, 1400].forEach((delay) => {
        setTimeout(() => {
            if (clearToken !== simpleAIPresetSwitchGalleryClearToken) return;
            clearSimpleAIPresetSwitchGalleryHidden(`${clearReason}+${delay}ms`);
        }, delay);
    });
}

function prepareSimpleAIGenerationStartSurface(reason, state) {
    const reasonText = String(reason || "generation_start");
    const applyPreviewState = (params) => {
        if (!params || typeof params !== "object") return null;
        try {
            SIMPLEAI_GALLERY_BROWSER_PARAM_KEYS.forEach((key) => {
                try { delete params[key]; } catch (e) {}
            });
            clearPostGenerationResultParamsForGenerationStart(params);
            params.gallery_state = "preview";
            params.gallery_preview_open = false;
            params.__skip_gallery_browser_refresh_once = true;
        } catch (e) {}
        return params;
    };
    const inputState = applyPreviewState(state);
    const liveState = applyPreviewState(window.simpleaiTopbarSystemParams);
    const cachedState = applyPreviewState(topbarLastSystemParams);
    const nextState = inputState || liveState || cachedState || null;
    if (nextState) {
        try { window.simpleaiTopbarSystemParams = nextState; } catch (e) {}
        try { topbarLastSystemParams = nextState; } catch (e) {}
    }
    try { clearSimpleAIPresetSwitchGalleryHidden(reasonText); } catch (e) {}
    try { setFinishedGalleryBrowserHasMediaState(false, reasonText); } catch (e) {}
    try { closeSimpleAICatalogLinkedGallery(reasonText, { markWrappers: false }); } catch (e) {}
    try {
        document.documentElement.classList.remove("simpai-post-generation-result-surface");
        document.documentElement.classList.remove("simpai-gallery-browser-welcome-pending");
        document.documentElement.classList.remove("simpai-gallery-browser-loading-silent");
        document.documentElement.classList.remove("simpai-gallery-browser-overlay-active");
        document.documentElement.classList.remove("simpai-video-result-preview");
        document.documentElement.classList.remove("simpai-comparison-preview");
        document.documentElement.classList.add("simpai-main-gallery-browser-closed");
    } catch (e) {}
    simpaiUiTrace("log", "[UI-TRACE] generation_start.surface_prepared", {
        reason: reasonText,
        hadState: !!nextState,
    });
    return nextState;
}
window.prepareSimpleAIGenerationStartSurface = prepareSimpleAIGenerationStartSurface;

function showSimpleAIGenerationPreparingState(state) {
    const params = state && typeof state === "object"
        ? state
        : (window.simpleaiTopbarSystemParams || topbarLastSystemParams || {});
    const lang = String(params?.__lang || "").trim().toLowerCase();
    const statusText = /^(?:cn|zh)(?:[-_]|$)/i.test(lang)
        ? "正在准备任务并处理输入..."
        : "Preparing task and processing inputs...";
    const root = getSimpleAIElementById("progress_html");
    if (!root) return false;
    const content = root.querySelector?.(":scope > .prose") || root.querySelector?.(".prose") || root;
    try {
        root.hidden = false;
        root.removeAttribute("hidden");
        root.removeAttribute("aria-hidden");
        root.classList.remove("hidden", "hide");
        root.style.removeProperty("display");
        content.innerHTML = `
            <div class="loader-container sai-generation-progress" style="--sai-progress: 1%;">
                <div class="loader"></div>
                <div class="progress-container sai-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="1" aria-label="${statusText}">
                    <div class="sai-progress-fill"></div>
                    <div class="sai-progress-marker"><span>1%</span></div>
                </div>
                <span class="sai-progress-status" title="${statusText}">${statusText}</span>
            </div>`;
        root.dataset.simpleaiGenerationPreparingAt = String(Date.now());
        return true;
    } catch (e) {
        return false;
    }
}
window.showSimpleAIGenerationPreparingState = showSimpleAIGenerationPreparingState;

function shouldIgnorePresetGalleryClearClick(evt) {
    try {
        if (presetNavProgressActive || document.documentElement.classList.contains("simpai-preset-nav-active")) {
            return true;
        }
        if (isSimpleAIPresetGallerySuppressed() && evt && evt.isTrusted === false) {
            return true;
        }
    } catch (e) {}
    return false;
}

function simpleAIEventPointWithinElement(evt, el, margin) {
    if (!evt || !el || !el.getBoundingClientRect) return false;
    const x = Number(evt.clientX);
    const y = Number(evt.clientY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    let rect = null;
    try { rect = el.getBoundingClientRect(); } catch (e) { rect = null; }
    if (!rect || rect.width <= 0 || rect.height <= 0) return false;
    const pad = Number.isFinite(Number(margin)) ? Number(margin) : 0;
    return x >= rect.left - pad
        && x <= rect.right + pad
        && y >= rect.top - pad
        && y <= rect.bottom + pad;
}

function isSimpleAICatalogLinkedGhostTarget(target, matched, catalog, catalogLabel) {
    if (!target || !matched || catalogLabel) return false;
    try {
        if (matched.id === "generate_button") return false;
        if (matched.dataset?.simpleaiCatalogLinkedGalleryHidden === "1") return true;
        if (matched.dataset?.simpleaiCatalogLinkedGalleryWrapperHidden === "1") return true;
        if (matched.classList?.contains("simpai-catalog-linked-gallery-hidden")) return true;
        if (target.closest?.("[data-simpleai-catalog-linked-gallery-hidden='1'], [data-simpleai-catalog-linked-gallery-wrapper-hidden='1'], .simpai-catalog-linked-gallery-hidden")) return true;
        if (matched.classList?.contains("simpai-gallery-browser-overlay-row") && (!catalog || !isSimpleAIPresetCatalogOpen(catalog))) return true;
    } catch (e) {}
    return false;
}

function blockSimpleAICatalogGhostPointerEvent(evt, reason, matched) {
    simpleAICatalogGhostPointerBlockUntil = Date.now() + 700;
    try { evt.preventDefault(); } catch (e) {}
    try { evt.stopPropagation(); } catch (e) {}
    try { evt.stopImmediatePropagation(); } catch (e) {}
    try { closeSimpleAICatalogLinkedGallery(reason || "catalog_ghost_pointer", { markWrappers: false }); } catch (e) {}
    try { collapseFinishedImagesCatalogClosedHitbox(reason || "catalog_ghost_pointer"); } catch (e) {}
    simpaiUiTrace("log", "[UI-TRACE] catalog_gallery.ghost_pointer_blocked", {
        event: evt && evt.type,
        reason: reason || "catalog_ghost_pointer",
        matched: matched && (matched.id || matched.className || matched.tagName) || "",
    });
}

function bindSimpleAIPresetSwitchGalleryClearControls() {
    if (simpleAIPresetSwitchGalleryClearBound) return;
    simpleAIPresetSwitchGalleryClearBound = true;
    const selector = [
        "#generate_button",
        "#finished_images_catalog",
        "#finished_gallery",
        "#final_gallery",
        ".simpai-gallery-browser-overlay-row",
        "[data-simpleai-catalog-linked-gallery-wrapper-hidden='1']",
        "#gallery_images_btn",
        "#gallery_videos_btn",
        "#gallery_browser_refresh_btn",
        "#gallery_browser_more_btn",
        "#gallery_browser_prev_folder_btn",
        "#gallery_browser_next_folder_btn",
        "#gallery_browser_folder",
        "#canvas_gallery_refresh_btn",
        "#gallery_browser_toolbar",
        "#finished_gallery_browser_panel",
        "#model_browser_modal",
    ].join(",");
    const handleCatalogAndGalleryClearClick = (evt) => {
        const target = evt && evt.target ? evt.target : null;
        if (!target || !target.closest) return;
        const matched = target.closest(selector);
        const directCatalogRoot = target.closest("#finished_images_catalog");
        const catalog = getSimpleAIElementById("finished_images_catalog") || directCatalogRoot;
        const catalogRoot = catalog && directCatalogRoot;
        if (!matched) return;
        const catalogLabel = catalog && catalogRoot === catalog ? target.closest("button.label-wrap") : null;
        const catalogLabelClick = !!(
            catalog
            && catalogRoot === catalog
            && catalogLabel
        );
        const catalogRootClick = !!(
            catalog
            && target === catalog
            && matched === catalog
            && catalogRoot === catalog
            && !catalogLabel
        );
        if (
            shouldIgnorePresetGalleryClearClick(evt)
            && !(catalogLabelClick && evt.type === "click")
            && !(catalogRootClick && evt.type === "click")
        ) return;
        const generateButton = getSimpleAIElementById("generate_button");
        const pointerOverGenerate = simpleAIEventPointWithinElement(evt, generateButton, 2);
        if (
            evt.type === "click"
            && Date.now() < simpleAICatalogGhostPointerBlockUntil
            && (pointerOverGenerate || isSimpleAICatalogLinkedGhostTarget(target, matched, catalog, catalogLabel))
        ) {
            blockSimpleAICatalogGhostPointerEvent(evt, "ghost_pointer_followup_click", matched);
            return;
        }
        if (evt.type === "pointerdown" && pointerOverGenerate && matched.id !== "generate_button") {
            blockSimpleAICatalogGhostPointerEvent(evt, "generate_pointer_covered_by_gallery", matched);
            return;
        }
        if (evt.type === "pointerdown" && isSimpleAICatalogLinkedGhostTarget(target, matched, catalog, catalogLabel)) {
            blockSimpleAICatalogGhostPointerEvent(evt, "catalog_hidden_surface_pointer", matched);
            return;
        }
        const galleryBrowserControlInteraction = target.closest([
            "#gallery_images_btn",
            "#gallery_videos_btn",
            "#gallery_browser_refresh_btn",
            "#gallery_browser_more_btn",
            "#gallery_browser_prev_folder_btn",
            "#gallery_browser_next_folder_btn",
            "#gallery_browser_folder",
            "#gallery_browser_toolbar",
            "#finished_gallery_browser_panel",
        ].join(","));
        if (
            galleryBrowserControlInteraction
            && catalog
            && isSimpleAIPresetCatalogOpen(catalog)
            && isFinishedImagesCatalogClosedHitboxCollapsed()
        ) {
            clearFinishedImagesCatalogClosedHitbox("gallery_browser_control_pointer");
            simpaiUiTrace("log", "[UI-TRACE] catalog_gallery.browser_control_pointer_allowed", {
                event: evt.type,
                matched: matched.id || matched.className || matched.tagName || "",
            });
        }
        if (catalogRootClick && evt.type === "click") {
            const label = catalog.querySelector(":scope > button.label-wrap") || catalog.querySelector("button.label-wrap");
            if (label && typeof label.click === "function") {
                try { evt.preventDefault(); } catch (e) {}
                try { evt.stopPropagation(); } catch (e) {}
                try { evt.stopImmediatePropagation(); } catch (e) {}
                label.click();
                simpaiUiTrace("log", "[UI-TRACE] catalog_gallery.boundary_click_redirected", {
                    matched: matched.id || matched.className || matched.tagName || "",
                });
                return;
            }
        }
        const staleCatalogSurface = !!(
            catalog
            && isFinishedImagesCatalogClosedHitboxCollapsed()
            && !catalogLabel
            && (
                catalogRoot === catalog
                || target.closest("#finished_gallery, #final_gallery, #progress_video, #video_player, #comparison_box, #finished_gallery_browser_panel, #gallery_browser_toolbar, .simpai-gallery-browser-overlay-row, [data-simpleai-catalog-linked-gallery-wrapper-hidden='1']")
            )
        );
        if (staleCatalogSurface) {
            const resultGalleryInteraction = target.closest([
                "#finished_gallery .gallery-container > .preview",
                "#finished_gallery .grid-wrap .gallery-item",
                "#final_gallery .gallery-container > .preview",
                "#final_gallery .grid-wrap .gallery-item"
            ].join(","));
            const resultGallery = resultGalleryInteraction ? resultGalleryInteraction.closest("#finished_gallery, #final_gallery") : null;
            const resultGalleryOwned = !!(
                resultGallery
                && simpleAiElementVisible(resultGallery)
                && resultGallery.dataset.simpleaiCatalogLinkedGalleryHidden !== "1"
                && resultGallery.dataset.simpleaiCatalogLinkedGalleryWrapperHidden !== "1"
                && !resultGallery.classList.contains("simpai-catalog-linked-gallery-hidden")
            );
            if (resultGalleryOwned) {
                clearFinishedImagesCatalogClosedHitbox("result_gallery_pointer");
                simpaiUiTrace("log", "[UI-TRACE] catalog_gallery.result_gallery_pointer_allowed", {
                    event: evt.type,
                    matched: matched.id || matched.className || matched.tagName || "",
                });
                return;
            }
            try { evt.preventDefault(); } catch (e) {}
            try { evt.stopPropagation(); } catch (e) {}
            try { evt.stopImmediatePropagation(); } catch (e) {}
            collapseFinishedImagesCatalogClosedHitbox("stale_surface_pointer");
            simpaiUiTrace("log", "[UI-TRACE] catalog_gallery.stale_surface_pointer_blocked", {
                event: evt.type,
                matched: matched.id || matched.className || matched.tagName || "",
            });
            return;
        }
        if (matched === catalog && !catalogLabel) {
            try {
                if (evt.type === "pointerdown") {
                    evt.preventDefault();
                    evt.stopPropagation();
                    evt.stopImmediatePropagation();
                }
            } catch (e) {}
            collapseFinishedImagesCatalogClosedHitbox("catalog_boundary_pointer");
            simpaiUiTrace("log", "[UI-TRACE] catalog_gallery.boundary_hit_ignored", { event: evt.type });
            return;
        }
        if (catalogLabelClick) {
            const catalogBodyOpen = isSimpleAIPresetCatalogBodyVisible(catalog);
            const catalogLabelClaimsOpen = isSimpleAIPresetCatalogOpen(catalog);
            const catalogIsOpen = catalogBodyOpen;
            const catalogWillOpen = !catalogIsOpen;
            const catalogWasCollapsed = catalog.dataset.simpleaiPresetSwitchCatalogCollapsed === "1";
            if (evt.type === "click" && Date.now() < simpleAIFinishedCatalogPointerCloseBlockUntil) {
                try { evt.preventDefault(); } catch (e) {}
                try { evt.stopPropagation(); } catch (e) {}
                try { evt.stopImmediatePropagation(); } catch (e) {}
                simpaiUiTrace("log", "[UI-TRACE] catalog_gallery.pointer_close_followup_blocked", {
                    open: catalogIsOpen,
                });
                return;
            }
            if (evt.type === "pointerdown") {
                if (catalogIsOpen) {
                    simpleAIFinishedCatalogPreparedOpenUntil = 0;
                    simpleAIFinishedCatalogPointerCloseBlockUntil = Date.now() + 260;
                    simpaiUiTrace("log", "[UI-TRACE] catalog_gallery.pointer_preclose_deferred", {
                        open: catalogIsOpen,
                        reason: "wait_for_click",
                    });
                    try { evt.preventDefault(); } catch (e) {}
                    try { evt.stopPropagation(); } catch (e) {}
                    try { evt.stopImmediatePropagation(); } catch (e) {}
                    simpleAIFinishedCatalogPreparedCloseUntil = Date.now() + 900;
                    try { collapseSimpleAIFinishedGalleryCatalog(catalog); } catch (e) {}
                    try { resetPostGenerationResultSurfaceState("catalog_toggle_pointer_close"); } catch (e) {}
                    try { closeSimpleAICatalogLinkedGallery("catalog_toggle_pointer_close", { resetBrowserState: false }); } catch (e) {}
                    simpaiUiTrace("log", "[UI-TRACE] catalog_gallery.pointer_close_applied", {
                        open: catalogIsOpen,
                    });
                    return;
                }
                try { evt.preventDefault(); } catch (e) {}
                try { evt.stopPropagation(); } catch (e) {}
                try { evt.stopImmediatePropagation(); } catch (e) {}
                simpaiUiTrace("log", "[UI-TRACE] catalog_gallery.pointer_preopen_deferred", {
                    open: catalogIsOpen,
                    reason: "wait_for_click",
                });
                return;
            }
            if (catalogWillOpen) {
                simpleAIFinishedCatalogPreparedCloseUntil = 0;
                if (isSimpleAIPresetGallerySuppressed() || presetNavProgressActive || document.documentElement.classList.contains("simpai-preset-nav-active")) {
                    allowCatalogOpenDuringPresetSwitch("catalog_toggle_user_open");
                }
                try { coverSimpleAIGalleryFrostTargetsForCatalog("catalog_toggle_preopen"); } catch (e) {}
                clearFinishedImagesCatalogClosedHitbox("catalog_toggle_preopen");
                simpleAIFinishedCatalogPreparedOpenUntil = Date.now() + 700;
                prepareFinishedGallerySurfaceForCatalogOpen("catalog_toggle_preopen");
                scheduleFinishedGalleryBrowserEarlyOpenRefresh("catalog_toggle_preopen");
                clearSimpleAIPresetSwitchGalleryHidden(`click:${(matched && (matched.id || matched.className || matched.tagName)) || catalog.id || catalog.tagName}`);
                if (catalogWasCollapsed) {
                    scheduleSimpleAIPresetCatalogReopenAfterClear(catalog, "click_clear");
                }
                if (catalogLabelClaimsOpen && !catalogBodyOpen) {
                    try {
                        const label = catalog.querySelector(":scope > button.label-wrap") || catalog.querySelector("button.label-wrap");
                        if (label) {
                            label.classList.remove("open");
                            label.setAttribute("aria-expanded", "false");
                            try { label.open = false; } catch (e) {}
                        }
                    } catch (e) {}
                    simpaiUiTrace("log", "[UI-TRACE] catalog_gallery.open_semistate_normalized", {
                        reason: "catalog_toggle_preopen",
                    });
                }
                clearSimpleAIPresetCatalogCollapsed(catalog, { force: true });
                scheduleSimpleAIPresetCatalogPreparedOpenRestore(catalog, "catalog_toggle_open_prepared");
            } else {
                try { evt.preventDefault(); } catch (e) {}
                try { evt.stopPropagation(); } catch (e) {}
                try { evt.stopImmediatePropagation(); } catch (e) {}
                simpleAIFinishedCatalogPreparedOpenUntil = 0;
                simpleAIFinishedCatalogPreparedCloseUntil = Date.now() + 700;
                try { collapseSimpleAIFinishedGalleryCatalog(catalog); } catch (e) {}
                try { resetPostGenerationResultSurfaceState("catalog_toggle_preclose"); } catch (e) {}
                closeSimpleAICatalogLinkedGallery("catalog_toggle_preclose", { resetBrowserState: false });
            }
            return;
        }
        if (matched && matched.id === "generate_button") {
            if (evt.type === "pointerdown") {
                collapseFinishedImagesCatalogClosedHitbox("generate_pointer_down");
                simpaiUiTrace("log", "[UI-TRACE] preset_gallery.generate_pointer_deferred", { event: evt.type });
                return;
            }
            collapseFinishedImagesCatalogClosedHitbox("generate_click");
            try { closeSimpleAICatalogLinkedGallery("generate_click", { markWrappers: false }); } catch (e) {}
            simpaiUiTrace("log", "[UI-TRACE] preset_gallery.generate_pointer_no_gallery_clear", { event: evt.type });
            return;
        }
        if (evt.type === "pointerdown") {
            simpaiUiTrace("log", "[UI-TRACE] catalog_gallery.pointer_clear_deferred", {
                matched: matched.id || matched.className || matched.tagName || "",
            });
            return;
        }
        const catalogWasCollapsed = !!(
            catalog
            && matched === catalog
            && catalog.dataset.simpleaiPresetSwitchCatalogCollapsed === "1"
            && target.closest("button.label-wrap")
        );
        clearSimpleAIPresetSwitchGalleryHidden(`click:${matched.id || matched.className || matched.tagName}`);
        if (catalogWasCollapsed) {
            scheduleSimpleAIPresetCatalogReopenAfterClear(catalog, "click_clear");
        }
    };
    document.addEventListener("pointerdown", handleCatalogAndGalleryClearClick, true);
    document.addEventListener("click", handleCatalogAndGalleryClearClick, true);
}

window.isSimpleAIPresetGallerySuppressed = isSimpleAIPresetGallerySuppressed;
window.closeSimpleAIOpenGalleriesForPresetSwitch = closeSimpleAIOpenGalleriesForPresetSwitch;
window.clearSimpleAIPresetSwitchGalleryHidden = clearSimpleAIPresetSwitchGalleryHidden;
window.scheduleSimpleAIPresetGalleryClear = scheduleSimpleAIPresetGalleryClear;
window.clearSimpleAICompareReadyState = clearSimpleAICompareReadyState;
window.ensureSimpleAIPresetCatalogOpen = ensureSimpleAIPresetCatalogOpen;
try { bindSimpleAIPresetSwitchGalleryClearControls(); } catch (e) {}

function isSimpleAIGalleryFrostEnabled() {
    return simpleaiGalleryFrostUserPreference !== false;
}

function writeSimpleAIGalleryFrostPreference(enabled) {
    simpleaiGalleryFrostUserPreference = !!enabled;
}

function syncSimpleAIGalleryFrostSettingCheckbox(enabled, commit) {
    const app = typeof gradioApp === "function" ? gradioApp() : document;
    let root = null;
    try {
        root = (app && app.getElementById ? app.getElementById("gallery_frost_enabled_checkbox") : null) || document.getElementById("gallery_frost_enabled_checkbox");
    } catch (e) {
        root = null;
    }
    const input = root && root.querySelector ? root.querySelector('input[type="checkbox"]') : null;
    if (!input) return;
    const next = !!enabled;
    if (input.checked === next) return;
    input.checked = next;
    if (commit) {
        try { input.dispatchEvent(new Event("input", { bubbles: true })); } catch (e) {}
        try { input.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) {}
    }
}

function readSimpleAIGalleryFrostFromSystemParams(system_params) {
    if (!system_params || typeof system_params !== "object") return null;
    if (Object.prototype.hasOwnProperty.call(system_params, "gallery_frost_enabled")) {
        return system_params.gallery_frost_enabled !== false && system_params.gallery_frost_enabled !== "False" && system_params.gallery_frost_enabled !== "false" && system_params.gallery_frost_enabled !== "0";
    }
    return null;
}

function simpleAIGalleryFrostTargets() {
    const app = typeof gradioApp === "function" ? gradioApp() : document;
    const find = (id) => {
        try {
            return (app && app.getElementById ? app.getElementById(id) : null) || document.getElementById(id);
        } catch (e) {
            return null;
        }
    };
    return [find("finished_gallery"), find("final_gallery")].filter(Boolean);
}

function simpleAIGalleryFrostSignature(gallery) {
    if (!gallery || !gallery.querySelectorAll) return "";
    return Array.from(gallery.querySelectorAll("img, video"))
        .map((el) => {
            const contextPreviewSrc = el.dataset?.simpleaiGalleryOriginalContext === "1"
                ? (el.dataset.simpleaiGalleryOriginalContextPreviewSrc || "")
                : "";
            return contextPreviewSrc || el.currentSrc || el.src || el.poster || "";
        })
        .filter(Boolean)
        .join("|");
}

function readSimpleAINumericValueFromRoot(root) {
    if (!root) return null;
    const candidates = [];
    try {
        if (root.matches && root.matches("input, select, textarea")) candidates.push(root);
    } catch (e) {}
    try {
        root.querySelectorAll("input[type='number'], input[type='range'], input:not([type]), select, textarea").forEach((el) => candidates.push(el));
    } catch (e) {}
    for (const el of candidates) {
        if (!el) continue;
        const raw = el.value !== undefined ? el.value : el.getAttribute("value");
        const value = Number.parseInt(String(raw ?? "").trim(), 10);
        if (Number.isFinite(value) && value > 0) return value;
    }
    return null;
}

function readSimpleAINumericControlValue(id) {
    return readSimpleAINumericValueFromRoot(getSimpleAIElementById(id));
}

function readSimpleAINumericControlValueByLabel(labels) {
    const app = typeof gradioApp === "function" ? gradioApp() : document;
    const needles = (Array.isArray(labels) ? labels : [labels]).map((label) => String(label || "").toLowerCase()).filter(Boolean);
    if (!needles.length) return null;
    let nodes = [];
    try {
        nodes = Array.from((app || document).querySelectorAll("label, span, p, .block"));
    } catch (e) {
        nodes = [];
    }
    for (const node of nodes) {
        const text = String(node.textContent || "").trim().toLowerCase();
        if (text.length > 120) continue;
        if (!text || !needles.some((label) => text === label || text.includes(label))) continue;
        let root = node;
        for (let depth = 0; root && depth < 6; depth += 1, root = root.parentElement) {
            const value = readSimpleAINumericValueFromRoot(root);
            if (value !== null) return value;
        }
    }
    return null;
}

function readSimpleAIGenerationExpectedImageCount() {
    const isSceneFrontend = !!document.documentElement?.classList?.contains("simpai-scene-frontend");
    const ids = isSceneFrontend ? ["image_number"] : ["scene_image_number", "image_number"];
    for (const id of ids) {
        const root = getSimpleAIElementById(id);
        if (root && simpleAiElementVisible(root)) {
            const value = readSimpleAINumericControlValue(id);
            if (value !== null) return value;
        }
    }
    for (const id of ids) {
        const value = readSimpleAINumericControlValue(id);
        if (value !== null) return value;
    }
    const labelledValue = readSimpleAINumericControlValueByLabel(["Image Number", "生成数量", "图片数量", "图片数"]);
    if (labelledValue !== null) return labelledValue;
    return 1;
}

function clearSimpleAIGenerationGalleryMode(gallery) {
    if (!gallery || !gallery.classList) return;
    gallery.classList.remove("simpleai-gallery-generation-grid");
    try {
        delete gallery.dataset.simpleaiGenerationExpectedCount;
        delete gallery.dataset.simpleaiGenerationGridSignature;
    } catch (e) {}
}

function syncSimpleAIGenerationGalleryMode(gallery, signature, reason) {
    if (!gallery || !gallery.classList) return false;
    const activeGeneration = hasSimpleAIActiveGenerationControls();
    const currentSignature = signature || simpleAIGalleryFrostSignature(gallery);
    if (activeGeneration) {
        const expectedCount = readSimpleAIGenerationExpectedImageCount();
        const isMulti = expectedCount > 1;
        gallery.classList.toggle("simpleai-gallery-generation-grid", isMulti);
        try {
            if (isMulti && currentSignature) {
                gallery.dataset.simpleaiGenerationExpectedCount = String(expectedCount);
                gallery.dataset.simpleaiGenerationGridSignature = currentSignature;
            } else {
                delete gallery.dataset.simpleaiGenerationExpectedCount;
                delete gallery.dataset.simpleaiGenerationGridSignature;
            }
        } catch (e) {}
        if (isMulti) {
            simpaiUiTrace("log", "[UI-TRACE] generation_gallery.mode_multi_expected", {
                reason: reason || "sync",
                expected: expectedCount,
            });
        }
        return isMulti;
    }
    const expectedCount = Number.parseInt(String(gallery.dataset?.simpleaiGenerationExpectedCount || "1"), 10);
    const storedSignature = gallery.dataset?.simpleaiGenerationGridSignature || "";
    const isStoredMulti = expectedCount > 1 && !!storedSignature && !!currentSignature && storedSignature === currentSignature;
    gallery.classList.toggle("simpleai-gallery-generation-grid", isStoredMulti);
    if (!isStoredMulti && currentSignature && storedSignature && storedSignature !== currentSignature) {
        clearSimpleAIGenerationGalleryMode(gallery);
    }
    return isStoredMulti;
}

function simpleAIGalleryIsMultiBrowseMode(gallery) {
    if (!gallery || !gallery.querySelectorAll) return false;
    if (gallery.querySelector(".gallery-container > .preview")) return false;
    const items = Array.from(gallery.querySelectorAll(".grid-wrap .gallery-item"))
        .filter((item) => item && item.querySelector && item.querySelector("img, video"));
    return items.length > 1 || syncSimpleAIGenerationGalleryMode(gallery, simpleAIGalleryFrostSignature(gallery), "frost_mode");
}

function getSimpleAIGalleryFrostRevealContext() {
    const params = window.simpleaiTopbarSystemParams || {};
    return {
        requestId: Number(finishedGalleryBrowserState && finishedGalleryBrowserState.activeRequestId || 0),
        folder: normalizeFinishedGalleryBrowserFolderValue(
            (finishedGalleryBrowserState && (finishedGalleryBrowserState.userFolder || finishedGalleryBrowserState.folder))
            || params.__main_gallery_browser_folder
            || ""
        ),
        mode: getFinishedGalleryBrowserMode(
            (finishedGalleryBrowserState && finishedGalleryBrowserState.mediaType)
            || params.__gallery_engine_type
            || params.engine_type
        ),
    };
}

function rememberSimpleAIGalleryFrostRevealIntent(reason) {
    const context = getSimpleAIGalleryFrostRevealContext();
    simpleaiGalleryFrostRevealHoldUntil = Date.now() + 12000;
    simpleaiGalleryFrostRevealHoldRequestId = context.requestId;
    simpleaiGalleryFrostRevealHoldFolder = context.folder;
    simpleaiGalleryFrostRevealHoldMode = context.mode;
    simpaiUiTrace("log", "[UI-TRACE] gallery_browser.frost_reveal_hold", {
        reason: reason || "user_reveal",
        requestId: context.requestId,
        folder: context.folder,
        mode: context.mode,
    });
}

function clearSimpleAIGalleryFrostRevealHold(reason) {
    simpleaiGalleryFrostRevealHoldUntil = 0;
    simpleaiGalleryFrostRevealHoldRequestId = 0;
    simpleaiGalleryFrostRevealHoldFolder = "";
    simpleaiGalleryFrostRevealHoldMode = "";
    simpaiUiTrace("log", "[UI-TRACE] gallery_browser.frost_reveal_hold_clear", {
        reason: reason || "clear",
    });
}

function shouldPreserveSimpleAIGalleryFrostReveal(gallery) {
    if (!gallery || gallery.getAttribute("data-sai-frost-revealed") !== "1") return false;
    if (Date.now() > simpleaiGalleryFrostRevealHoldUntil) return false;
    const context = getSimpleAIGalleryFrostRevealContext();
    if (simpleaiGalleryFrostRevealHoldRequestId && context.requestId && simpleaiGalleryFrostRevealHoldRequestId !== context.requestId) return false;
    if (simpleaiGalleryFrostRevealHoldFolder && context.folder && simpleaiGalleryFrostRevealHoldFolder !== context.folder) return false;
    if (simpleaiGalleryFrostRevealHoldMode && context.mode && simpleaiGalleryFrostRevealHoldMode !== context.mode) return false;
    return true;
}

function syncSimpleAIGalleryFrostMode(gallery) {
    if (!gallery || !gallery.classList) return false;
    const active = simpleAIGalleryIsMultiBrowseMode(gallery);
    const nextMode = active ? "multi" : "single";
    const changed = gallery.__simpleaiGalleryFrostMode !== nextMode;
    gallery.__simpleaiGalleryFrostMode = nextMode;
    gallery.classList.toggle("simpleai-gallery-frost-multi", active);
    if (!active) {
        try { gallery.setAttribute("data-sai-frost-revealed", "1"); } catch (e) {}
    } else if (changed) {
        if (!shouldPreserveSimpleAIGalleryFrostReveal(gallery)) {
            try { gallery.removeAttribute("data-sai-frost-revealed"); } catch (e) {}
        }
    }
    return active;
}

function resetSimpleAIGalleryFrostForNewMedia(force) {
    simpleAIGalleryFrostTargets().forEach((gallery) => {
        const active = syncSimpleAIGalleryFrostMode(gallery);
        const signature = simpleAIGalleryFrostSignature(gallery);
        if (!signature) return;
        if (!active) {
            gallery.__simpleaiGalleryFrostSignature = signature;
            return;
        }
        if (force || gallery.__simpleaiGalleryFrostSignature !== signature) {
            gallery.__simpleaiGalleryFrostSignature = signature;
            if (shouldPreserveSimpleAIGalleryFrostReveal(gallery)) return;
            try { gallery.removeAttribute("data-sai-frost-revealed"); } catch (e) {}
        }
    });
}

function revealAllSimpleAIGalleryFrostTargets() {
    simpleAIGalleryFrostTargets().forEach((gallery) => {
        try { gallery.setAttribute("data-sai-frost-revealed", "1"); } catch (e) {}
    });
    try { scheduleFinishedGalleryResolutionBadges("gallery_frost_reveal_all"); } catch (e) {}
}

function coverSimpleAIGalleryFrostTargetsForCatalog(reason) {
    if (!isSimpleAIGalleryFrostEnabled()) return false;
    clearSimpleAIGalleryFrostRevealHold(reason || "catalog_frost_cover");
    let covered = 0;
    simpleAIGalleryFrostTargets().forEach((gallery) => {
        try {
            if (!gallery) return;
            const active = syncSimpleAIGalleryFrostMode(gallery);
            if (!active) return;
            if (gallery.getAttribute("data-sai-frost-revealed") === "1") covered += 1;
            gallery.removeAttribute("data-sai-frost-revealed");
        } catch (e) {}
    });
    if (covered > 0) {
        simpaiUiTrace("log", "[UI-TRACE] gallery_browser.frost_recovered_for_catalog", {
            reason: reason || "catalog_frost_cover",
            covered,
        });
    }
    return covered > 0;
}

function simpleAIGalleryFrostText(en, cn) {
    try {
        if (window.SimpAII18n?.t) return window.SimpAII18n.t(en, cn);
    } catch (e) {}
    const lang = String(window.locale_lang || "").toLowerCase();
    return lang.startsWith("en") ? en : cn;
}

function simpleAIGalleryBrowserText(en, cn) {
    try {
        if (window.SimpAII18n?.t) return window.SimpAII18n.t(en, cn);
    } catch (e) {}
    try {
        if (typeof topbarTranslateText === "function") {
            const translated = topbarTranslateText(en);
            if (translated && translated !== en) return translated;
        }
    } catch (e) {}
    const lang = String(window.locale_lang || "").toLowerCase();
    return lang.startsWith("en") ? en : cn;
}

function simpleAIGalleryBrowserIsEnglish() {
    try {
        if (window.SimpAII18n?.isEnglishUi) return window.SimpAII18n.isEnglishUi();
    } catch (e) {}
    return String(window.locale_lang || "").toLowerCase().startsWith("en");
}

function simpleAIGalleryBrowserCountStatus(count, mediaType) {
    let n = Number(count || 0);
    if (!Number.isFinite(n)) n = 0;
    n = Math.max(0, Math.floor(n));
    const mode = mediaType === "video" ? "video" : "image";
    if (simpleAIGalleryBrowserIsEnglish()) {
        return `${n} ${mode === "video" ? "videos" : "items"}`;
    }
    return `${n} ${mode === "video" ? "个视频" : "张图片"}`;
}

function simpleAIGalleryBrowserStatusText(text, mediaType) {
    const raw = String(text || "");
    if (!raw) return "";
    const countMatch = raw.match(/^\s*(\d+)\s+(items|images|videos)\s*$/i);
    if (countMatch) {
        const mode = countMatch[2].toLowerCase() === "videos" ? "video" : (mediaType || "image");
        return simpleAIGalleryBrowserCountStatus(countMatch[1], mode);
    }
    const staticMap = {
        "Loading...": "加载中...",
        "Loading more...": "继续加载...",
        "Load failed": "加载失败",
        "Browser state parse failed.": "图库状态解析失败。",
        "Media browser failed.": "媒体浏览失败。",
    };
    if (Object.prototype.hasOwnProperty.call(staticMap, raw)) {
        return simpleAIGalleryBrowserText(raw, staticMap[raw]);
    }
    return raw;
}

function simpleAIGalleryBrowserButton(rootOrButton) {
    if (!rootOrButton) return null;
    if (rootOrButton.matches && rootOrButton.matches("button")) return rootOrButton;
    return rootOrButton.querySelector ? rootOrButton.querySelector("button") : null;
}

function simpleAIGalleryBrowserSetButtonText(rootOrButton, en, cn, titleEn, titleCn) {
    const button = simpleAIGalleryBrowserButton(rootOrButton);
    if (!button) return;
    const text = simpleAIGalleryBrowserText(en, cn);
    try { button.setAttribute("data-original-text", en); } catch (e) {}
    const directTextNode = Array.from(button.childNodes || []).find((node) => node && node.nodeType === Node.TEXT_NODE && String(node.textContent || "").trim());
    const labelNode =
        directTextNode ||
        (button.querySelector ? button.querySelector(":scope > span, :scope > div > span, span") : null);
    if (labelNode) {
        if (labelNode.textContent !== text) labelNode.textContent = text;
    } else if (button.textContent !== text) {
        button.textContent = text;
    }
    if (titleEn) {
        try {
            button.title = simpleAIGalleryBrowserText(titleEn, titleCn || titleEn);
        } catch (e) {}
    }
}

function syncFinishedGalleryBrowserLocalizedControls() {
    try {
        simpleAIGalleryBrowserSetButtonText(
            getFinishedGalleryBrowserElement("gallery_browser_refresh_btn"),
            "Refresh",
            "刷新",
            "Refresh current folder",
            "刷新当前文件夹"
        );
        simpleAIGalleryBrowserSetButtonText(getFinishedGalleryBrowserElement("gallery_images_btn"), "Images", "图片");
        simpleAIGalleryBrowserSetButtonText(getFinishedGalleryBrowserElement("gallery_videos_btn"), "Videos", "视频");
        simpleAIGalleryBrowserSetButtonText(
            getFinishedGalleryBrowserElement("gallery_browser_more_btn"),
            "Load more",
            "加载更多",
            "Load more",
            "加载更多"
        );
        const panel = document.getElementById("finished_gallery_browser_panel");
        if (panel) {
            simpleAIGalleryBrowserSetButtonText(
                panel.querySelector("[data-gallery-browser-refresh]"),
                "Refresh",
                "刷新",
                "Refresh current folder",
                "刷新当前文件夹"
            );
            simpleAIGalleryBrowserSetButtonText(
                panel.querySelector("[data-gallery-browser-more]"),
                "Load more",
                "加载更多",
                "Load more",
                "加载更多"
            );
        }
    } catch (e) {}
}

function syncSimpleAIGalleryFrostCheckbox() {
    const root = document.getElementById("gallery_media_switch_row");
    if (!root) return;
    root.classList.add("simpleai-gallery-switch-with-frost");
    const browserRight = document.querySelector("#gallery_browser_right") || document.querySelector("#finished_gallery_browser_panel [data-gallery-browser-right]");
    const attachTarget = browserRight || root;
    let control = document.querySelector("[data-simpleai-gallery-frost-control]");
    if (!control) {
        control = document.createElement("label");
        control.className = "simpleai-gallery-frost-control";
        control.setAttribute("data-simpleai-gallery-frost-control", "1");
    }
    control.title = simpleAIGalleryFrostText("Blur gallery media by default", "默认模糊图库媒体");
    const labelText = simpleAIGalleryFrostText("Blur", "模糊");
    if (
        control.dataset.simpleaiGalleryFrostText !== labelText
        || !control.querySelector("[data-simpleai-gallery-frost-checkbox]")
    ) {
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.setAttribute("data-simpleai-gallery-frost-checkbox", "1");
        control.replaceChildren(checkbox, document.createTextNode(labelText));
        control.dataset.simpleaiGalleryFrostText = labelText;
    }
    const input = control.querySelector("input");
    if (input && !input.__simpleaiGalleryFrostBound) {
        input.__simpleaiGalleryFrostBound = true;
        input.addEventListener("change", () => {
            setSimpleAIGalleryFrostEnabled(!!input.checked, { reset: true });
        });
    }
    if (control.parentElement !== attachTarget) {
        if (browserRight) browserRight.insertBefore(control, browserRight.firstChild);
        else root.appendChild(control);
    }
    if (input) input.checked = isSimpleAIGalleryFrostEnabled();
}

function setSimpleAIGalleryFrostEnabled(enabled, options) {
    const next = !!enabled;
    writeSimpleAIGalleryFrostPreference(next);
    try {
        document.documentElement.classList.toggle("simpai-gallery-frost-enabled", next);
    } catch (e) {}
    syncSimpleAIGalleryFrostCheckbox();
    syncSimpleAIGalleryFrostSettingCheckbox(next, options?.persist !== false && options?.source !== "setting-checkbox" && options?.source !== "system");
    if (next && options?.reset) clearSimpleAIGalleryFrostRevealHold("frost_toggle_reset");
    if (next) resetSimpleAIGalleryFrostForNewMedia(!!options?.reset);
    else revealAllSimpleAIGalleryFrostTargets();
    try {
        window.dispatchEvent(new CustomEvent("simpleai-gallery-frost-change", { detail: { enabled: next } }));
    } catch (e) {}
    try { scheduleFinishedGalleryResolutionBadges("gallery_frost_toggle"); } catch (e) {}
}

function revealSimpleAIGalleryFrostArea(target) {
    if (!target || !isSimpleAIGalleryFrostEnabled()) return false;
    const gallery = target.closest ? target.closest("#finished_gallery, #final_gallery") : null;
    if (!gallery || !syncSimpleAIGalleryFrostMode(gallery)) return false;
    if (!gallery || gallery.getAttribute("data-sai-frost-revealed") === "1") return false;
    gallery.setAttribute("data-sai-frost-revealed", "1");
    rememberSimpleAIGalleryFrostRevealIntent("gallery_click");
    try { scheduleFinishedGalleryResolutionBadges("gallery_frost_reveal"); } catch (e) {}
    return true;
}

function bindSimpleAIGalleryFrostControls() {
    if (simpleaiGalleryFrostBound) return;
    simpleaiGalleryFrostBound = true;
    setSimpleAIGalleryFrostEnabled(isSimpleAIGalleryFrostEnabled(), { reset: false });
    document.addEventListener("click", (evt) => {
        const target = evt && evt.target ? evt.target : null;
        if (!target || !target.closest) return;
        const area = target.closest([
            "#finished_gallery .grid-wrap .gallery-item",
            "#final_gallery .grid-wrap .gallery-item"
        ].join(","));
        if (!area) return;
        if (revealSimpleAIGalleryFrostArea(area)) {
            evt.preventDefault();
            evt.stopPropagation();
        }
    }, true);
    const refresh = () => {
        syncSimpleAIGalleryFrostCheckbox();
        syncSimpleAIGalleryFrostSettingCheckbox(isSimpleAIGalleryFrostEnabled(), false);
        if (isSimpleAIGalleryFrostEnabled()) resetSimpleAIGalleryFrostForNewMedia(false);
    };
    const scheduleRefresh = () => {
        if (simpleaiGalleryFrostRefreshRaf) return;
        simpleaiGalleryFrostRefreshRaf = requestAnimationFrame(() => {
            simpleaiGalleryFrostRefreshRaf = 0;
            refresh();
        });
    };
    simpleaiGalleryFrostObserver = new MutationObserver(scheduleRefresh);
    const observeTarget = document.body || document.documentElement;
    if (observeTarget) {
        simpleaiGalleryFrostObserver.observe(observeTarget, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["src", "poster", "style", "class"]
        });
    }
    refresh();
    setTimeout(scheduleRefresh, 300);
    setTimeout(scheduleRefresh, 1000);
}

window.isSimpleAIGalleryFrostEnabled = isSimpleAIGalleryFrostEnabled;
window.setSimpleAIGalleryFrostEnabled = setSimpleAIGalleryFrostEnabled;

function traceResultPanelState(reason) {
    if (!simpaiUiTraceEnabled()) return;
    const app = typeof gradioApp === "function" ? gradioApp() : document;
    const byId = (id) => app.getElementById ? app.getElementById(id) : document.getElementById(id);
    const info = byId("infobox");
    const preview = byId("preview_generating");
    const finished = byId("finished_gallery");
    const finalGallery = byId("final_gallery");
    const catalog = byId("finished_images_catalog");
    const infoGroup = info ? info.closest(".gr-group") : null;
    const visible = (el) => {
        if (!el) return null;
        const cs = getComputedStyle(el);
        return {
            display: cs.display,
            visibility: cs.visibility,
            opacity: cs.opacity,
            rect: (() => {
                const r = el.getBoundingClientRect();
                return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
            })(),
            cls: el.className || "",
        };
    };
    const galleryState = (el) => {
        if (!el) return null;
        return {
            ...visible(el),
            imgs: el.querySelectorAll("img").length,
            buttons: el.querySelectorAll("button").length,
            selected: el.querySelectorAll('[aria-selected="true"], .selected').length,
        };
    };
    try {
        simpaiUiTrace("log", "[UI-TRACE] result_panel.dom", {
            reason,
            info: visible(info),
            infoGroup: visible(infoGroup),
            preview: galleryState(preview),
            finished: galleryState(finished),
            finalGallery: galleryState(finalGallery),
            catalog: visible(catalog),
            active: document.activeElement ? {
                tag: document.activeElement.tagName,
                id: document.activeElement.id || "",
                cls: document.activeElement.className || "",
            } : null,
        });
    } catch (e) {
        console.warn("[UI-TRACE] result_panel.dom_failed", reason, e);
    }
}

function traceResultPanelStateSoon(reason) {
    traceResultPanelState(reason + ":now");
    setTimeout(() => traceResultPanelState(reason + ":80ms"), 80);
    setTimeout(() => traceResultPanelState(reason + ":300ms"), 300);
    setTimeout(() => traceResultPanelState(reason + ":900ms"), 900);
}

function ensurePromptInfoOverlay() {
    let overlay = document.getElementById("simpleai_prompt_info_overlay");
    if (overlay) return overlay;

    overlay = document.createElement("div");
    overlay.id = "simpleai_prompt_info_overlay";
    overlay.className = "simpleai-prompt-info-overlay";
    overlay.style.display = "none";

    const card = document.createElement("div");
    card.className = "simpleai-prompt-info-card";

    const header = document.createElement("div");
    header.className = "simpleai-prompt-info-header";

    const title = document.createElement("div");
    title.className = "simpleai-prompt-info-title";
    title.textContent = "Image Info";

    const close = document.createElement("button");
    close.type = "button";
    close.className = "simpleai-prompt-info-close";
    close.textContent = "×";
    close.onclick = () => hidePromptInfoOverlay();

    const body = document.createElement("div");
    body.className = "simpleai-prompt-info-body";

    header.appendChild(title);
    header.appendChild(close);
    card.appendChild(header);
    card.appendChild(body);
    overlay.appendChild(card);
    overlay.addEventListener("click", (event) => {
        if (event.target === overlay) hidePromptInfoOverlay();
    });
    document.body.appendChild(overlay);
    return overlay;
}

function hidePromptInfoOverlay() {
    const overlay = document.getElementById("simpleai_prompt_info_overlay");
    if (overlay) overlay.style.display = "none";
}

function showPromptInfoOverlayFromInfobox() {
    const app = typeof gradioApp === "function" ? gradioApp() : document;
    const source = app.getElementById ? app.getElementById("infobox") : document.getElementById("infobox");
    const overlay = ensurePromptInfoOverlay();
    const body = overlay.querySelector(".simpleai-prompt-info-body");
    if (!body) return;
    if (source) {
        const prose = source.querySelector(".prose") || source;
        body.innerHTML = prose.innerHTML || source.innerHTML || "<p>info</p>";
        const sourceGroup = source.closest(".gr-group");
        if (sourceGroup) sourceGroup.style.display = "none";
    } else if (!body.innerHTML) {
        body.innerHTML = "<p>info</p>";
    }
    overlay.style.display = "flex";
    try { traceResultPanelStateSoon("prompt_info.overlay.show"); } catch (e) {}
}

function ensureToolboxNoteOverlay() {
    let overlay = document.getElementById("simpleai_toolbox_note_overlay");
    if (overlay) return overlay;

    overlay = document.createElement("div");
    overlay.id = "simpleai_toolbox_note_overlay";
    overlay.className = "simpleai-toolbox-note-overlay";
    overlay.style.display = "none";

    const card = document.createElement("div");
    card.className = "simpleai-toolbox-note-card";

    const header = document.createElement("div");
    header.className = "simpleai-toolbox-note-header";

    const title = document.createElement("div");
    title.className = "simpleai-toolbox-note-title";

    const close = document.createElement("button");
    close.type = "button";
    close.className = "simpleai-toolbox-note-close";
    close.textContent = "×";
    close.onclick = () => hideToolboxNoteOverlay(true);

    const body = document.createElement("div");
    body.className = "simpleai-toolbox-note-body";

    const input = document.createElement("input");
    input.type = "text";
    input.className = "simpleai-toolbox-note-input";
    input.style.display = "none";

    const actions = document.createElement("div");
    actions.className = "simpleai-toolbox-note-actions";

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "simpleai-toolbox-note-cancel";
    cancel.textContent = topbarTranslateText("Cancel");
    cancel.onclick = () => hideToolboxNoteOverlay(true);

    const confirm = document.createElement("button");
    confirm.type = "button";
    confirm.className = "simpleai-toolbox-note-confirm";
    confirm.textContent = topbarTranslateText("Confirm");
    confirm.onclick = () => {
        const kind = overlay.dataset.kind || "";
        const targetId = kind === "delete"
            ? "params_note_delete_button"
            : kind === "preset"
                ? "params_note_preset_button"
                : "params_note_regen_button";
        const app = typeof gradioApp === "function" ? gradioApp() : document;
        const target = findToolboxNoteActionButton(app, targetId, kind);
        let clickDelay = 0;
        if (kind === "preset") {
            const sourceInput = findToolboxPresetNameInput(app);
            if (sourceInput) {
                setNativeInputValue(sourceInput, input.value || "");
                clickDelay = 100;
            } else {
                console.warn("[UI-TRACE] toolbox_note.preset_input_missing");
            }
        }
        if (target) {
            hideToolboxNoteOverlay(false);
            setTimeout(() => target.click(), clickDelay);
        } else {
            console.warn("[UI-TRACE] toolbox_note.confirm_missing_target", { kind, targetId });
        }
    };

    header.appendChild(title);
    header.appendChild(close);
    actions.appendChild(cancel);
    actions.appendChild(confirm);
    card.appendChild(header);
    card.appendChild(body);
    card.appendChild(input);
    card.appendChild(actions);
    overlay.appendChild(card);
    overlay.addEventListener("click", (event) => {
        if (event.target === overlay) hideToolboxNoteOverlay(true);
    });
    document.body.appendChild(overlay);
    return overlay;
}

function setNativeInputValue(field, value) {
    if (!field) return false;
    const proto = Object.getPrototypeOf(field);
    const descriptor = proto ? Object.getOwnPropertyDescriptor(proto, "value") : null;
    if (descriptor && descriptor.set) {
        descriptor.set.call(field, value);
    } else {
        field.value = value;
    }
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
}

function findToolboxPresetNameInput(app) {
    const root = app || document;
    const wrapper = (root.getElementById ? root.getElementById("params_note_input_name") : null) || document.getElementById("params_note_input_name");
    if (wrapper) {
        if (wrapper.matches && wrapper.matches("textarea, input")) return wrapper;
        const field = wrapper.querySelector ? wrapper.querySelector("textarea, input") : null;
        if (field) return field;
    }
    const scoped = root.querySelector ? root.querySelector("#params_note_input_name textarea, #params_note_input_name input, .toolbox_note .preset_input textarea, .toolbox_note .preset_input input, .preset_input textarea, .preset_input input") : null;
    if (scoped) return scoped;
    return document.querySelector("#params_note_input_name textarea, #params_note_input_name input, .toolbox_note .preset_input textarea, .toolbox_note .preset_input input, .preset_input textarea, .preset_input input");
}

function findToolboxNoteActionButton(app, targetId, kind) {
    const root = app || document;
    const byId = (root.getElementById ? root.getElementById(targetId) : null) || document.getElementById(targetId);
    if (byId) {
        if (byId.tagName === "BUTTON") return byId;
        const nestedButton = byId.querySelector ? byId.querySelector("button") : null;
        if (nestedButton) return nestedButton;
    }
    const note = root.querySelector ? root.querySelector(".toolbox_note") : document.querySelector(".toolbox_note");
    const buttons = note ? Array.from(note.querySelectorAll("button")) : [];
    const actionButtons = buttons.filter((button) => !button.classList.contains("note_close_btn"));
    const fallbackIndex = kind === "delete" ? 0 : kind === "regen" ? 1 : actionButtons.length - 1;
    return actionButtons[fallbackIndex] || null;
}

function findToolboxNoteBox(app, sourceButton) {
    if (sourceButton) {
        const sourceNote = sourceButton.closest(".toolbox_note");
        if (sourceNote) return sourceNote;
    }
    const root = app || document;
    const scoped = root.querySelector ? root.querySelector(".toolbox_note") : null;
    if (scoped) return scoped;
    return document.querySelector(".toolbox_note");
}

function hideToolboxNoteSource(app, sourceButton) {
    const root = app || document;
    const targets = new Set();
    if (sourceButton) {
        const sourceNote = sourceButton.closest(".toolbox_note");
        const sourceGroup = sourceButton.closest(".gr-group");
        if (sourceNote) targets.add(sourceNote);
        if (sourceGroup) targets.add(sourceGroup);
    }
    if (root.querySelectorAll) {
        root.querySelectorAll(".toolbox_note").forEach((node) => targets.add(node));
    }
    const apply = () => {
        targets.forEach((node) => {
            if (node && node.style) node.style.setProperty("display", "none", "important");
        });
    };
    apply();
    setTimeout(apply, 60);
    setTimeout(apply, 180);
}

function hideToolboxNoteOverlay(clickSourceClose) {
    const overlay = document.getElementById("simpleai_toolbox_note_overlay");
    if (overlay) overlay.style.display = "none";
    if (clickSourceClose) {
        const app = typeof gradioApp === "function" ? gradioApp() : document;
        const close = app.getElementById ? app.getElementById("params_note_close_button") : document.getElementById("params_note_close_button");
        if (close) close.click();
    }
}

function showToolboxNoteOverlayFromSource(kind) {
    const app = typeof gradioApp === "function" ? gradioApp() : document;
    const sourceButtonId = kind === "delete"
        ? "params_note_delete_button"
        : kind === "preset"
            ? "params_note_preset_button"
            : "params_note_regen_button";
    const sourceButton = app.getElementById ? app.getElementById(sourceButtonId) : document.getElementById(sourceButtonId);
    const sourceNote = findToolboxNoteBox(app, sourceButton);
    const sourceInfo = sourceNote ? sourceNote.querySelector(".note_info") : null;
    const overlay = ensureToolboxNoteOverlay();
    overlay.dataset.kind = kind;

    const title = overlay.querySelector(".simpleai-toolbox-note-title");
    const body = overlay.querySelector(".simpleai-toolbox-note-body");
    const input = overlay.querySelector(".simpleai-toolbox-note-input");
    const confirm = overlay.querySelector(".simpleai-toolbox-note-confirm");
    if (confirm) {
        confirm.textContent = topbarTranslateText(kind === "delete" ? "Delete" : kind === "preset" ? "Save" : "Regenerate");
        confirm.classList.toggle("danger", kind === "delete");
    }
    if (body) {
        const prose = sourceInfo ? (sourceInfo.querySelector(".prose") || sourceInfo) : null;
        body.innerHTML = prose ? (prose.innerHTML || prose.textContent || "") : "";
        if (!body.innerHTML) {
            const params = topbarLastSystemParams && typeof topbarLastSystemParams === "object" ? topbarLastSystemParams : {};
            const engineType = params.engine_type || params.default_engine?.engine_type || "";
            body.textContent = kind === "delete"
                ? (engineType === "video" ? "DELETE the video from output directory and logs!" : "DELETE the image from output directory and logs!")
                : kind === "preset"
                    ? "Save a new preset for the current params and configuration."
                    : "Extract parameters to backfill for regeneration.";
        }
        if (kind === "delete") {
            const target = window.__simpleaiPendingGalleryDeleteTarget;
            const params = topbarLastSystemParams && typeof topbarLastSystemParams === "object" ? topbarLastSystemParams : {};
            const isEnglish = String(params.__lang || "en").toLowerCase() === "en";
            const fileName = target && target.valid ? String(target.file_name || "") : "";
            body.textContent = fileName
                ? (isEnglish
                    ? `Delete “${fileName}”? The file and its log entry will be removed.`
                    : `确认删除“${fileName}”？文件和对应日志记录都会删除。`)
                : (isEnglish
                    ? "The current gallery item could not be identified. Close the preview and open it again before deleting."
                    : "无法识别当前相册项目。请关闭预览并重新打开后再删除。");
            if (confirm) confirm.disabled = !fileName;
        } else if (confirm) {
            confirm.disabled = false;
        }
        body.dataset.rawText = String(body.textContent || "");
        try {
            if (typeof processNode === "function") processNode(body);
        } catch (e) {}
    }
    if (input) {
        const sourceInput = findToolboxPresetNameInput(app);
        input.style.display = kind === "preset" ? "" : "none";
        input.value = sourceInput ? (sourceInput.value || "") : "";
        input.placeholder = topbarTranslateText("Type preset name here.");
        if (kind === "preset") {
            setTimeout(() => input.focus(), 20);
        }
    }
    const bodyText = body ? String(body.dataset.rawText || body.textContent || "").toLowerCase() : "";
    const params = topbarLastSystemParams && typeof topbarLastSystemParams === "object" ? topbarLastSystemParams : {};
    const engineType = params.engine_type || params.default_engine?.engine_type || "";
    const isVideoDelete = kind === "delete" && (engineType === "video" || bodyText.includes("video"));
    if (title) title.textContent = topbarTranslateText(kind === "delete" ? (isVideoDelete ? "Delete Video" : "Delete Image") : kind === "preset" ? "Save Preset" : "Regenerate From Image");
    hideToolboxNoteSource(app, sourceButton);
    overlay.style.display = "flex";
    try {
        simpaiUiTrace("log", "[UI-TRACE] toolbox_note.overlay.show", { kind, hasSource: !!sourceNote, hasInfo: !!sourceInfo });
    } catch (e) {}
}
let presetNavProgressHideTimer = 0;
let presetNavProgressActive = false;
let presetNavProgressSoftTimer = 0;
let presetNavProgressFinishTimer = 0;
let presetNavProgressStartedAt = 0;
let presetNavProgressValue = 0;
let presetNavSceneSuppressTimer = 0;
let presetNavNetworkIdleTimer = 0;
let presetNavNetworkObserved = 0;
let presetNavNetworkPending = 0;
let presetNavNetworkToken = 0;

function stopPresetNavSoftProgress() {
    if (presetNavProgressSoftTimer) {
        clearInterval(presetNavProgressSoftTimer);
        presetNavProgressSoftTimer = 0;
    }
}

function clearPresetNavFinishTimer() {
    if (presetNavProgressFinishTimer) {
        clearTimeout(presetNavProgressFinishTimer);
        presetNavProgressFinishTimer = 0;
    }
}

function clearPresetNavNetworkIdleTimer() {
    if (presetNavNetworkIdleTimer) {
        clearTimeout(presetNavNetworkIdleTimer);
        presetNavNetworkIdleTimer = 0;
    }
}

function presetNavRequestUrl(input) {
    try {
        if (typeof input === "string") return input;
        if (input && typeof input.url === "string") return input.url;
    } catch (e) {}
    return "";
}

function isPresetNavCompletionRequest(input) {
    const url = presetNavRequestUrl(input);
    if (!url) return false;
    return /\/gradio_api\/(?:queue\/data|run|call|predict|api)\b|\/queue\/data\b|\/api\//i.test(url);
}

function schedulePresetNavNetworkIdleFinish(reason) {
    if (!presetNavProgressActive || presetNavNetworkObserved <= 0 || presetNavNetworkPending > 0) return;
    clearPresetNavNetworkIdleTimer();
    const token = presetNavNetworkToken;
    presetNavNetworkIdleTimer = setTimeout(() => {
        presetNavNetworkIdleTimer = 0;
        if (!presetNavProgressActive || token !== presetNavNetworkToken || presetNavNetworkPending > 0) return;
        requestAnimationFrame(() => {
            setTimeout(() => {
                if (!presetNavProgressActive || token !== presetNavNetworkToken || presetNavNetworkPending > 0) return;
                try {
                    simpaiUiTrace("log", "[UI-TRACE] preset_nav_progress.network_idle_finish", {
                        reason,
                        value: presetNavProgressValue,
                        observed: presetNavNetworkObserved,
                    });
                } catch (e) {}
                finishPresetNavProgress(topbarPendingPreset || topbarLastPreset || "preset");
            }, 32);
        });
    }, 110);
}

function markPresetNavNetworkRequestFinished(reason) {
    presetNavNetworkPending = Math.max(0, presetNavNetworkPending - 1);
    schedulePresetNavNetworkIdleFinish(reason);
}

function installPresetNavNetworkObserver() {
    if (window.__simpleaiPresetNavFetchObserverInstalled || typeof window.fetch !== "function") return;
    const originalFetch = window.fetch.bind(window);
    window.fetch = function(input, init) {
        const watch = presetNavProgressActive && isPresetNavCompletionRequest(input);
        if (!watch) {
            return originalFetch(input, init);
        }
        presetNavNetworkObserved += 1;
        presetNavNetworkPending += 1;
        clearPresetNavNetworkIdleTimer();
        return originalFetch(input, init).then(
            (response) => {
                try {
                    response.clone().text().catch(() => {}).finally(() => {
                        markPresetNavNetworkRequestFinished("body_complete");
                    });
                } catch (e) {
                    markPresetNavNetworkRequestFinished("response_complete");
                }
                return response;
            },
            (error) => {
                markPresetNavNetworkRequestFinished("error");
                throw error;
            }
        );
    };
    window.__simpleaiPresetNavFetchObserverInstalled = true;
}

function ensurePresetNavProgressUI() {
    let host = document.getElementById("preset_nav_progress");
    if (host) {
        return host;
    }

    host = document.createElement("div");
    host.id = "preset_nav_progress";
    host.setAttribute("aria-hidden", "true");
    host.style.position = "fixed";
    host.style.inset = "0";
    host.style.zIndex = "10000";
    host.style.pointerEvents = "none";
    host.style.opacity = "0";
    host.style.display = "flex";
    host.style.alignItems = "center";
    host.style.justifyContent = "center";
    host.style.padding = "16px";
    host.style.background = "rgba(0, 0, 0, 0.18)";
    host.style.backdropFilter = "blur(1.5px)";
    host.style.transition = "opacity 160ms ease";

    const card = document.createElement("div");
    card.style.width = "min(560px, calc(100vw - 32px))";
    card.style.padding = "10px 12px";
    card.style.borderRadius = "8px";
    card.style.background = "rgba(20, 20, 24, 0.92)";
    card.style.border = "1px solid rgba(255,255,255,0.12)";
    card.style.boxShadow = "0 12px 34px rgba(0,0,0,0.28)";
    card.style.backdropFilter = "blur(8px)";
    card.style.transform = "translateY(8px)";
    card.style.transition = "transform 160ms ease";

    const header = document.createElement("div");
    header.style.display = "flex";
    header.style.alignItems = "center";
    header.style.justifyContent = "space-between";
    header.style.gap = "12px";

    const label = document.createElement("div");
    label.id = "preset_nav_progress_label";
    label.style.fontSize = "13px";
    label.style.fontWeight = "600";
    label.style.color = "rgba(255,255,255,0.96)";
    label.textContent = topbarTranslateText("Switching preset");

    const percent = document.createElement("div");
    percent.id = "preset_nav_progress_percent";
    percent.style.fontSize = "12px";
    percent.style.color = "rgba(255,255,255,0.72)";
    percent.textContent = "0%";

    const track = document.createElement("div");
    track.style.marginTop = "8px";
    track.style.height = "4px";
    track.style.borderRadius = "999px";
    track.style.overflow = "hidden";
    track.style.background = "rgba(255,255,255,0.10)";

    const bar = document.createElement("div");
    bar.id = "preset_nav_progress_bar";
    bar.style.width = "0%";
    bar.style.height = "100%";
    bar.style.borderRadius = "999px";
    bar.style.background = "linear-gradient(90deg, #ff8a3d 0%, #5aa2ff 100%)";
    bar.style.transition = "width 180ms ease";

    header.appendChild(label);
    header.appendChild(percent);
    track.appendChild(bar);
    card.appendChild(header);
    card.appendChild(track);
    host.appendChild(card);
    document.body.appendChild(host);
    return host;
}

function updatePresetNavProgress(percentValue, labelText) {
    if (!presetNavProgressActive) return;
    const host = ensurePresetNavProgressUI();
    const label = document.getElementById("preset_nav_progress_label");
    const percent = document.getElementById("preset_nav_progress_percent");
    const bar = document.getElementById("preset_nav_progress_bar");
    const incomingValue = Math.max(0, Math.min(100, Number(percentValue) || 0));
    const value = incomingValue >= 100 ? 100 : Math.max(presetNavProgressValue || 0, incomingValue);
    presetNavProgressValue = value;
    if (label && labelText) {
        label.textContent = labelText;
    }
    if (percent) {
        percent.textContent = `${Math.round(value)}%`;
    }
    if (bar) {
        bar.style.width = `${value}%`;
    }
    host.style.opacity = "1";
    const card = host.firstElementChild;
    if (card && card.style) {
        card.style.transform = "translateY(0)";
    }
}

function startPresetNavSoftProgress(targetPreset) {
    stopPresetNavSoftProgress();
    presetNavProgressSoftTimer = setInterval(() => {
        if (!presetNavProgressActive) {
            stopPresetNavSoftProgress();
            return;
        }
        const elapsed = Math.max(0, Date.now() - presetNavProgressStartedAt);
        let target = 58;
        if (elapsed > 220) target = 72;
        if (elapsed > 520) target = 84;
        if (elapsed > 980) target = 91;
        const current = presetNavProgressValue || 0;
        if (current >= target) return;
        const step = Math.max(1.5, (target - current) * 0.22);
        updatePresetNavProgress(
            Math.min(target, current + step),
            topbarTranslateTemplate("Applying {preset}...", { preset: targetPreset })
        );
    }, 80);
}

function setPresetNavSceneSuppressed(active, delayMs = 0) {
    if (presetNavSceneSuppressTimer) {
        clearTimeout(presetNavSceneSuppressTimer);
        presetNavSceneSuppressTimer = 0;
    }
    const apply = () => {
        presetNavSceneSuppressTimer = 0;
        try {
            document.documentElement.classList.toggle("simpai-preset-nav-active", !!active);
        } catch (e) {}
    };
    if (delayMs > 0) {
        presetNavSceneSuppressTimer = setTimeout(apply, delayMs);
        return;
    }
    apply();
}

function beginPresetNavProgress(nextPreset) {
    if (presetNavProgressHideTimer) {
        clearTimeout(presetNavProgressHideTimer);
        presetNavProgressHideTimer = 0;
    }
    clearPresetNavFinishTimer();
    stopPresetNavSoftProgress();
    clearPresetNavNetworkIdleTimer();
    installPresetNavNetworkObserver();
    presetNavProgressActive = true;
    presetNavNetworkObserved = 0;
    presetNavNetworkPending = 0;
    presetNavNetworkToken += 1;
    closeSimpleAISceneTransientEditorsForPresetSwitch("preset_nav_begin");
    try { closeSimpleAIOpenGalleriesForPresetSwitch("preset_nav_begin", { suppressMs: SIMPLEAI_PRESET_SWITCH_GALLERY_SUPPRESS_MS }); } catch (e) {}
    setPresetNavSceneSuppressed(true);
    presetNavProgressStartedAt = Date.now();
    presetNavProgressValue = 0;
    const host = ensurePresetNavProgressUI();
    const percent = document.getElementById("preset_nav_progress_percent");
    const bar = document.getElementById("preset_nav_progress_bar");
    if (percent) {
        percent.textContent = "0%";
    }
    if (bar) {
        bar.style.transition = "none";
        bar.style.width = "0%";
        try { void bar.offsetWidth; } catch (e) {}
        bar.style.transition = "width 180ms ease";
    }
    if (host) {
        host.style.opacity = "0";
        const card = host.firstElementChild;
        if (card && card.style) {
            card.style.transform = "translateY(8px)";
        }
        try { void host.offsetWidth; } catch (e) {}
    }
    const targetPreset = nextPreset || topbarPendingPreset || topbarLastPreset || "preset";
    updatePresetNavProgress(14, topbarTranslateTemplate("Switching to {preset}...", { preset: targetPreset }));
    startPresetNavSoftProgress(targetPreset);
    document.body.style.cursor = "progress";
}

function finishPresetNavProgress(nextPreset) {
    if (!presetNavProgressActive) return;
    const targetPreset = nextPreset || topbarLastPreset || topbarPendingPreset || "preset";
    // Unlock the actual layout immediately. The remaining progress animation is
    // only a visual affordance and should not keep the finished UI hidden.
    setPresetNavSceneSuppressed(false);
    document.body.style.cursor = "";
    const finishNow = () => {
        if (!presetNavProgressActive) return;
        clearPresetNavFinishTimer();
        clearPresetNavNetworkIdleTimer();
        stopPresetNavSoftProgress();
        updatePresetNavProgress(100, topbarTranslateTemplate("{preset} ready", { preset: targetPreset }));
        if (presetNavProgressHideTimer) {
            clearTimeout(presetNavProgressHideTimer);
        }
        presetNavProgressHideTimer = setTimeout(() => {
            const host = document.getElementById("preset_nav_progress");
            if (host) {
                host.style.opacity = "0";
                const card = host.firstElementChild;
                if (card && card.style) {
                    card.style.transform = "translateY(8px)";
                }
            }
            presetNavProgressActive = false;
            presetNavProgressValue = 0;
            presetNavProgressHideTimer = 0;
        }, 180);
    };
    const elapsed = Date.now() - presetNavProgressStartedAt;
    const minVisibleMs = 260;
    if (elapsed < minVisibleMs) {
        stopPresetNavSoftProgress();
        updatePresetNavProgress(88, topbarTranslateTemplate("Finalizing {preset}...", { preset: targetPreset }));
        clearPresetNavFinishTimer();
        presetNavProgressFinishTimer = setTimeout(finishNow, minVisibleMs - elapsed);
        return;
    }
    finishNow();
}

function markUiAction(action, extra = null) {
    topbarLastUiAction = action;
    try {
        const entry = {
            t: Date.now(),
            action: action,
            extra: extra,
        };
        topbarUiActionTrace.push(entry);
        if (topbarUiActionTrace.length > 40) {
            topbarUiActionTrace = topbarUiActionTrace.slice(topbarUiActionTrace.length - 40);
        }
    } catch (e) {}
}

function schedulePresetStoreUpdate() {
    if (presetStoreUpdateQueued) return;
    presetStoreUpdateQueued = true;
    requestAnimationFrame(() => {
        presetStoreUpdateQueued = false;
        if (presetStoreUpdating) return;
        presetStoreUpdating = true;
        try {
            updatePresetStore(
                presetStoreUiState.nav_name_list,
                presetStoreUiState.role,
                presetStoreUiState.expand_flag,
                presetStoreUiState.theme
            );
            syncPresetStorePosition();
        } finally {
            presetStoreUpdating = false;
        }
    });
}

async function set_language_by_ui(newLanguage) {
    const newLocale = (newLanguage === "En") ? "en" : "cn";
    try {
        await set_language(newLocale);
    } catch (e) {
        console.error("set_language failed:", e);
    }
    try {
        try {
            setCookie("ailang", newLocale, 365);
            try {
                localStorage.setItem("ailang", newLocale);
            } catch (e) {
                console.error("set ailang localStorage failed:", e);
            }
        } catch (e) {
            console.error("set ailang cookie failed:", e);
        }
        const url = new URL(window.location.href);
        url.searchParams.set("__lang", newLocale);
        url.searchParams.set("t", `${Date.now()}.${Math.floor(Math.random() * 10000)}`);
        window.location.replace(url.toString());
    } catch (e) {
        console.error("update __lang url failed:", e);
    }
}

async function set_language(newLocale) {
    const hadLocalization = window.localization && Object.keys(window.localization).length > 0;
    const shouldReloadTranslations = (newLocale !== locale_lang) || !hadLocalization;

    if (shouldReloadTranslations) {
        const newTranslations = await fetchTranslationsFor(newLocale);
        locale_lang = newLocale;
        localization = newTranslations;
        window.localization = newTranslations;
    }

    if (!topbarLocalizationHookInstalled) {
        topbarLocalizationHookInstalled = true;
        onUiUpdate(function(m) {
            m.forEach(function(mutation) {
                mutation.addedNodes.forEach(function(node) {
                    processNode(node);
                });
            });
        });
    }

    if (topbarLocalizationAppliedLocale !== locale_lang || shouldReloadTranslations) {
        topbarLocalizationAppliedLocale = locale_lang;
        localizeWholePage();
        localizePresetStoreUi();
        try { syncFinishedGalleryBrowserLocalizedControls(); } catch (e) {}
        try {
            if (finishedGalleryBrowserState && Number.isFinite(Number(finishedGalleryBrowserState.loaded))) {
                setFinishedGalleryBrowserStatus(simpleAIGalleryBrowserCountStatus(finishedGalleryBrowserState.loaded, finishedGalleryBrowserState.mediaType));
            }
        } catch (e) {}
    }
}

async function fetchTranslationsFor(newLocale) {
    let time_ver = "t="+Date.now()+"."+Math.floor(Math.random() * 10000)
    const response = await fetch(`${webpath}/language/${newLocale}.json?${time_ver}`);
    return await response.json();
}

function topbarTranslateText(text) {
    const raw = String(text || "");
    if (!raw) return raw;
    try {
        if (typeof getTranslation === "function") {
            const translated = getTranslation(raw);
            if (translated !== undefined && translated !== null && translated !== "") {
                return translated;
            }
        }
    } catch (e) {}
    return raw;
}

function topbarTranslateTemplate(template, vars = {}) {
    const raw = String(template || "");
    if (!raw) return raw;
    let translated = topbarTranslateText(raw);
    Object.entries(vars || {}).forEach(([key, value]) => {
        const token = `{${key}}`;
        translated = translated.split(token).join(String(value ?? ""));
    });
    return translated;
}

function topbarApplyLocalizedText(node, englishText) {
    if (!node) return;
    const raw = String(englishText || "");
    if (!raw) return;
    try {
        node.setAttribute("data-original-text", raw);
    } catch (e) {}
    node.textContent = topbarTranslateText(raw);
}

function topbarApplyLocalizedPlaceholder(node, englishText) {
    if (!node) return;
    const raw = String(englishText || "");
    if (!raw) return;
    try {
        node.setAttribute("data-original-placeholder", raw);
    } catch (e) {}
    node.placeholder = topbarTranslateText(raw);
}

function topbarApplyLocalizedAriaLabel(node, englishText) {
    if (!node) return;
    const raw = String(englishText || "");
    if (!raw) return;
    node.setAttribute("aria-label", topbarTranslateText(raw));
}

function localizePresetStoreUi() {
    const presetStoreEl = getPresetStoreElement();
    if (!presetStoreEl) return;
    topbarApplyLocalizedText(getPresetStoreControl("#preset_store_title"), "Preset Store");
    topbarApplyLocalizedText(
        getPresetStoreControl("#preset_store_subtitle"),
        "Drag presets into the draft, reorder them, then apply to the navbar."
    );
    topbarApplyLocalizedPlaceholder(getPresetStoreControl("#preset_store_search"), "Search presets");
    topbarApplyLocalizedAriaLabel(getPresetStoreControl("#preset_store_engine_filters"), "Engine filters");
    topbarApplyLocalizedAriaLabel(getPresetStoreControl("#preset_store_scene_filters"), "Scene filters");
    topbarApplyLocalizedText(getPresetStoreControl("#preset_store_draft_label"), "Navbar draft");
    topbarApplyLocalizedAriaLabel(getPresetStoreControl("#preset_store_nav_draft"), "Navbar draft");
    topbarApplyLocalizedText(getPresetStoreControl("#preset_store_reset_draft"), "Reset");
    topbarApplyLocalizedText(getPresetStoreControl("#preset_store_apply_draft"), "Apply to Navbar");
    topbarApplyLocalizedText(getPresetStoreControl("#preset_store_apply_draft_close"), "Apply to Navbar and Close");
    topbarApplyLocalizedAriaLabel(getPresetStoreControl("#preset_store_status"), "Preset store status");
    topbarApplyLocalizedText(getPresetStoreControl("#preset_store_pool_label"), "Preset pool");
    topbarApplyLocalizedAriaLabel(getPresetStoreControl("#preset_store_candidate_pool"), "Preset pool");
    topbarApplyLocalizedText(getPresetStoreControl("#preset_store_user_pool_label"), "User presets");
    topbarApplyLocalizedAriaLabel(getPresetStoreControl("#preset_store_user_candidate_pool"), "User presets");
    topbarApplyLocalizedAriaLabel(getPresetStoreControl("#preset_store_close"), "Close");

    presetStoreEl.querySelectorAll("[data-sai-scene-filter]").forEach((button) => {
        const sceneFilter = String(button.getAttribute("data-sai-scene-filter") || "all");
        const englishText = sceneFilter === "scene"
            ? "Scene"
            : sceneFilter === "classic"
                ? "Classic"
                : sceneFilter === "image"
                    ? "Image"
                    : sceneFilter === "video"
                        ? "Video"
                        : "All";
        topbarApplyLocalizedText(button, englishText);
    });

    presetStoreEl.querySelectorAll("[data-sai-engine-filter]").forEach((button) => {
        const engine = String(button.getAttribute("data-sai-engine-filter") || "all");
        if (engine === "all") {
            topbarApplyLocalizedText(button, "All engines");
        }
    });

    presetStoreEl.querySelectorAll(".preset-store-draft-remove").forEach((button) => {
        topbarApplyLocalizedAriaLabel(button, "Remove preset");
    });
    presetStoreEl.querySelectorAll(".preset-store-user-delete").forEach((button) => {
        topbarApplyLocalizedAriaLabel(button, "Delete user preset");
        button.title = topbarTranslateText("Delete");
    });
    refreshPresetStoreDisplayNames(presetStoreEl);

    try {
        if (typeof processNode === "function") {
            processNode(presetStoreEl);
        }
    } catch (e) {}
    refreshPresetStoreDisplayNames(presetStoreEl);
}


function set_theme_by_ui(theme) {
    const gradioURL = window.location.href;
    const urls = gradioURL.split('?');
    const params = new URLSearchParams(window.location.search);
    const url_params = Object.fromEntries(params);
    let url_lang = locale_lang;
    if (url_params["__lang"]!=null) {
        url_lang=url_params["__lang"];
    }
    if (url_params["__theme"]!=null) {
        url_theme=url_params["__theme"];
	if (url_theme == theme) 
	    return
	window.location.replace(urls[0]+"?__theme="+theme+"&__lang="+url_lang+"&t="+Date.now()+"."+Math.floor(Math.random() * 10000));
    }
}

let pendingPresetInstructionIframeUrl = null;
let presetInstructionIframeObserver = null;

function applyPendingPresetInstructionIframeUrl() {
    if (!pendingPresetInstructionIframeUrl) {
        return false;
    }
    const iframe = gradioApp().getElementById('instruction');
    if (!iframe) {
        return false;
    }
    if (iframe.src !== pendingPresetInstructionIframeUrl) {
        iframe.src = pendingPresetInstructionIframeUrl;
    }
    pendingPresetInstructionIframeUrl = null;
    return true;
}

function schedulePresetInstructionIframeSync() {
    if (applyPendingPresetInstructionIframeUrl()) {
        return;
    }
    setTimeout(applyPendingPresetInstructionIframeUrl, 50);
    setTimeout(applyPendingPresetInstructionIframeUrl, 200);
    if (presetInstructionIframeObserver) {
        return;
    }
    try {
        presetInstructionIframeObserver = new MutationObserver(() => {
            if (applyPendingPresetInstructionIframeUrl() && presetInstructionIframeObserver) {
                presetInstructionIframeObserver.disconnect();
                presetInstructionIframeObserver = null;
            }
        });
        presetInstructionIframeObserver.observe(gradioApp(), { childList: true, subtree: true });
    } catch (e) {
        presetInstructionIframeObserver = null;
    }
}

function set_iframe_src(theme = 'default', lang = 'en', url) {
    const urlParams = new URLSearchParams(window.location.search);
    const themeParam = urlParams.get('__theme') || theme;
    const langParam = urlParams.get('__lang') || lang;
    const newIframeUrl = `${url}${url.includes('?') ? '&' : '?'}__theme=${themeParam}&__lang=${langParam}`;
    pendingPresetInstructionIframeUrl = newIframeUrl;
    schedulePresetInstructionIframeSync();
}

function closeSysMsg() {
    gradioApp().getElementById("sys_msg").style.display = "none";
}

function showSysMsg(message, theme) {
    const sysmsg = gradioApp().getElementById("sys_msg");
    const sysmsgText = gradioApp().getElementById("sys_msg_text");
    sysmsgText.innerHTML = message;
    
    const update_f = gradioApp().getElementById("update_f");
    const update_s = gradioApp().getElementById("update_s");

    if (theme == 'light') {
        sysmsg.style.color = "var(--neutral-600)";
        sysmsg.style.backgroundColor = "var(--secondary-100)";
	update_f.style.color = 'var(--primary-500)';
	update_s.style.color = 'var(--primary-500)';
    }
    else {
        sysmsg.style.color = "var(--neutral-100)";
        sysmsg.style.backgroundColor = "var(--secondary-400)";
	update_f.style.color = 'var(--primary-300)';
        update_s.style.color = 'var(--primary-300)';
    }

    sysmsg.style.display = "block";
}

function initPresetPreviewOverlay() {
    if (window.simpleaiDisableHoverPreviewsForInput?.()) return;
    let overlayVisible = false;
    let activePresetPreviewTarget = null;
    let presetPreviewRequestSeq = 0;
    const samplesPath = document.querySelector("meta[name='preset-samples-path']").getAttribute("content")
    const overlay = document.createElement('div');
    const tooltip = document.createElement('div');
    tooltip.className = 'preset-tooltip';
    overlay.appendChild(tooltip);
    overlay.id = 'presetPreviewOverlay';
    document.body.appendChild(overlay);

    function getPresetPreviewTarget(source) {
        if (!source || !source.closest) return null;
        return source.closest(".bar_button, .preset-store-candidate, .preset-store-draft-chip");
    }

    function getPresetPreviewName(target) {
        if (!target) return "";
        if (target.classList && target.classList.contains("bar_button")) {
            return getTopbarNavButtonOriginalText(target);
        }
        const label = target.querySelector
            ? target.querySelector(".preset-store-candidate-name, .preset-store-draft-name")
            : null;
        return (
            (label && label.getAttribute && label.getAttribute("data-original-text"))
            || (label && label.getAttribute && label.getAttribute("data-preset-store-name"))
            || (target.dataset && (target.dataset.presetBaseName || target.dataset.presetName))
            || (target.getAttribute && target.getAttribute("data-original-text"))
            || target.textContent
            || ""
        );
    }

    function hidePresetPreviewOverlay(target) {
        presetPreviewRequestSeq += 1;
        overlayVisible = false;
        overlay.style.opacity = "0";
        overlay.style.backgroundImage = "";
        if (target) {
            target.removeEventListener("mouseleave", onPresetPreviewTargetLeave);
        }
        if (!target || target === activePresetPreviewTarget) {
            activePresetPreviewTarget = null;
        }
    }

    function onPresetPreviewTargetLeave(event) {
        hidePresetPreviewOverlay(event && event.currentTarget ? event.currentTarget : activePresetPreviewTarget);
    }
    
    document.addEventListener('mouseover', async function (e) {
        const label = getPresetPreviewTarget(e.target);
        if (!label) return;
        if (label === activePresetPreviewTarget) return;
        if (activePresetPreviewTarget) {
            activePresetPreviewTarget.removeEventListener("mouseleave", onPresetPreviewTargetLeave);
        }
        activePresetPreviewTarget = label;
        label.addEventListener("mouseleave", onPresetPreviewTargetLeave);
	let text = label.textContent.trim();
        let name = getPresetPreviewName(label) || text;
	name = name.trim();
	if (name!=" " && name!='' && text!='') {
            const requestSeq = ++presetPreviewRequestSeq;
            overlay.classList.remove('has-preview-image');
	    let download = false;
	    if (name.endsWith('\u2B07')) {
    	   	name = name.slice(0, -1);
    		download = true;
	    }
	    const img = new Image();
            img.src = samplesPath.replace(
                "default",
                name.toLowerCase().replaceAll(" ", "_")
            ).replaceAll("\\", "\\\\");
            img.onerror = async () => {
                if (requestSeq !== presetPreviewRequestSeq || activePresetPreviewTarget !== label) return;
                overlay.classList.remove('has-preview-image');
                overlay.style.height = '54px';
		const resourceInfo = await fetchPresetDataFor(name);
                if (requestSeq !== presetPreviewRequestSeq || activePresetPreviewTarget !== label) return;
		let text = presetResourceTooltipText(resourceInfo, download);
                tooltip.textContent = text;
            };
	    img.onload = async () => {
                if (requestSeq !== presetPreviewRequestSeq || activePresetPreviewTarget !== label) return;
                overlay.classList.add('has-preview-image');
                overlay.style.height = '128px'; 
		const resourceInfo = await fetchPresetDataFor(name);
                if (requestSeq !== presetPreviewRequestSeq || activePresetPreviewTarget !== label) return;
                let text = resourceInfo.modelName || resourceInfo.readyLabel || "";
                if (download) text = presetResourceTooltipText(resourceInfo, true);
                tooltip.textContent = text;
		overlay.style.backgroundImage = `url("${samplesPath.replace(
                    "default",
                    name.toLowerCase().replaceAll(" ", "_")
                ).replaceAll("\\", "\\\\")}")`;
            };

	    overlayVisible = true;
	    overlay.style.opacity = "1";
	}
    });
    document.addEventListener('mousemove', function (e) {
        if (!overlayVisible) return;
        overlay.style.left = `${e.clientX}px`;
        overlay.style.top = `${e.clientY}px`;
        overlay.classList.toggle("lower-half", e.clientY > window.innerHeight / 2);
        overlay.classList.toggle("upper-half", e.clientY <= window.innerHeight / 2);
    });
}

function presetResourceTooltipText(resourceInfo, needsDownload) {
    const info = resourceInfo && typeof resourceInfo === "object" ? resourceInfo : {};
    if (needsDownload) {
        if (info.modelName) return `模型资源 ${info.modelName} \u2B07未就绪，需要下载`;
        if (info.hasModelList) return `工具资源 \u2B07未就绪，需要下载`;
        return `模型资源 \u2B07未就绪，需要下载`;
    }
    if (info.modelName) return `模型资源 ${info.modelName} 已准备好`;
    if (info.hasModelList) return "工具资源已准备好";
    return "资源状态未知";
}

async function fetchPresetDataFor(name) {
    let time_ver = "t="+Date.now()+"."+Math.floor(Math.random() * 10000);
    const response = await fetch(`${webpath}/presets/${name}.json?${time_ver}`);
    if (response.ok) {
	const data = await response.json();
        const defaultModel = String(data.default_model || "").trim();
        const lowerDefaultModel = defaultModel.toLowerCase();
        const hasPrimaryModel = !!defaultModel && lowerDefaultModel !== "none" && lowerDefaultModel !== "default (model)";
        const hasModelList = Array.isArray(data.model_list) && data.model_list.length > 0;
        let modelName = "";
        if (hasPrimaryModel) {
            const pos = defaultModel.lastIndexOf('.');
            modelName = pos > 0 ? defaultModel.substring(0, pos) : defaultModel;
        }
        return {
            modelName,
            hasModelList,
            readyLabel: hasModelList && !modelName ? "工具资源已准备好" : "",
        };
    } else {
	return {};
    }
}

function toggleComponentVisibility(toggleButton, targetComponentId) {
    const app = typeof gradioApp === "function" ? gradioApp() : null;
    const targetComponent = (app && app.getElementById ? app.getElementById(targetComponentId) : null)
        || document.getElementById(targetComponentId);
    if (targetComponent) {
        const nextVisible = targetComponent.style.display === "none";
        targetComponent.style.display = nextVisible
            ? (targetComponentId === "draggable-container" ? "flex" : "block")
            : "none";
	toggleButton.classList.toggle('active', nextVisible);
    }
}

function getCookie(name) {
    const cookies = document.cookie.split(';').map(cookie => cookie.trim());
    const cookie = cookies.find(cookie => cookie.startsWith(name + '='));
    if (cookie) {
        return cookie.split('=')[1];
    }
    return null;
}

function setCookie(name, value, days) {
    const expires = new Date();
    expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
    document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/`;
}

function checkAndUpdateSession(sstoken, days, identitySessionSeq, userRole) {
    const incomingSeq = Number(identitySessionSeq);
    const incomingRank = userRole && userRole !== "guest" ? 1 : 0;
    if (
        Number.isFinite(incomingSeq)
        && (
            incomingSeq < topbarLastIdentitySessionSeq
            || (incomingSeq === topbarLastIdentitySessionSeq && incomingRank < topbarLastIdentitySessionRank)
        )
    ) return;
    if (Number.isFinite(incomingSeq)) {
        if (incomingSeq > topbarLastIdentitySessionSeq) {
            topbarLastIdentitySessionSeq = incomingSeq;
            topbarLastIdentitySessionRank = incomingRank;
        } else {
            topbarLastIdentitySessionRank = Math.max(topbarLastIdentitySessionRank, incomingRank);
        }
    }
    if (!sstoken) return;
    try {
        setCookie("aitoken", `${sstoken}`, days);
    } catch (e) {}
    try {
        localStorage.setItem("aitoken", sstoken);
    } catch (e) {}
}

function setLinkColor(theme) {
    let linkColorHover;
    let linkColorVisited;
    if (theme === 'dark') {
	const darkElement = document.querySelector('.dark');
	if (darkElement) {
	    darkElement.style.setProperty('--link-text-color', 'var(--secondary-300)');
	    darkElement.style.setProperty('--link-text-color-hover', 'var(--secondary-200)');
	    darkElement.style.setProperty('--link-text-color-visited', 'var(--secondary-300)');
	}
    }
}

const TOPBAR_MISSING_MARKER = '\u2B07';
const TOPBAR_LEGACY_MISSING_DISPLAY_MARKER = '\u2193';

function normalizePresetName(value) {
    let s = value == null ? "" : String(value).trim();
    while (s.endsWith(TOPBAR_MISSING_MARKER) || s.endsWith(TOPBAR_LEGACY_MISSING_DISPLAY_MARKER)) {
        s = s.slice(0, -1).trim();
    }
    return s;
}

function topbarPresetNameWithMarker(name, preserveMarker) {
    const normalized = normalizePresetName(name);
    if (!normalized) return "";
    if (String(name || "").trim().endsWith(TOPBAR_MISSING_MARKER) || preserveMarker) {
        return `${normalized}${TOPBAR_MISSING_MARKER}`;
    }
    const meta = presetStoreUiState.meta || {};
    const direct = meta[normalized];
    if (direct && direct.missing) return `${normalized}${TOPBAR_MISSING_MARKER}`;
    const normalizedKey = Object.keys(meta).find((key) => normalizePresetName(key) === normalized);
    if (normalizedKey && meta[normalizedKey] && meta[normalizedKey].missing) {
        return `${normalized}${TOPBAR_MISSING_MARKER}`;
    }
    return normalized;
}

function topbarLocalizedPresetNavLabel(originalText) {
    const raw = String(originalText || "").trim();
    const hasMarker = raw.endsWith(TOPBAR_MISSING_MARKER);
    const base = normalizePresetName(raw);
    if (!base) return "";
    const label = topbarTranslateText(base);
    return hasMarker ? `${label}${TOPBAR_MISSING_MARKER}` : label;
}

function getPresetStoreDisplayName(name, preserveMarker = false) {
    const raw = topbarPresetNameWithMarker(name, preserveMarker);
    return topbarLocalizedPresetNavLabel(raw) || raw || String(name || "").trim();
}

function applyPresetStoreDisplayName(label, name, preserveMarker = false) {
    if (!label) return;
    const raw = topbarPresetNameWithMarker(name, preserveMarker);
    const cleanName = normalizePresetName(raw || name);
    label.textContent = getPresetStoreDisplayName(raw || name, preserveMarker);
    label.setAttribute("data-original-text", raw || cleanName);
    label.setAttribute("data-preset-store-name", cleanName);
    label.setAttribute("data-preset-store-missing", raw && raw.endsWith(TOPBAR_MISSING_MARKER) ? "1" : "0");
}

function refreshPresetStoreDisplayNames(root) {
    const host = root && root.querySelectorAll ? root : getPresetStoreElement();
    if (!host || !host.querySelectorAll) return;
    host.querySelectorAll(".preset-store-draft-name, .preset-store-candidate-name").forEach((label) => {
        const raw = label.getAttribute("data-preset-store-name")
            || label.getAttribute("data-original-text")
            || label.textContent
            || "";
        const preserveMarker = label.getAttribute("data-preset-store-missing") === "1"
            || String(label.getAttribute("data-original-text") || "").trim().endsWith(TOPBAR_MISSING_MARKER);
        applyPresetStoreDisplayName(label, raw, preserveMarker);
        const button = label.closest ? label.closest(".preset-store-candidate") : null;
        if (button && button.dataset) {
            const baseSearch = button.dataset.saiSearchBase || "";
            button.dataset.saiSearch = `${baseSearch} ${label.textContent || ""}`.trim().toLowerCase();
        }
    });
}

function applyPresetStoreMissingStatusUpdates(systemParams) {
    const updates = systemParams?.__preset_store_missing_updates;
    if (!updates || typeof updates !== "object" || Array.isArray(updates)) return false;

    const meta = presetStoreUiState.meta && typeof presetStoreUiState.meta === "object"
        ? presetStoreUiState.meta
        : {};
    const normalizedUpdates = new Map();
    Object.entries(updates).forEach(([name, missing]) => {
        const normalized = normalizePresetName(name);
        if (normalized) normalizedUpdates.set(normalized, !!missing);
    });
    if (!normalizedUpdates.size) return false;

    let changed = false;
    Object.keys(meta).forEach((key) => {
        const normalized = normalizePresetName(key);
        if (!normalizedUpdates.has(normalized) || !meta[key] || typeof meta[key] !== "object") return;
        const missing = normalizedUpdates.get(normalized);
        if (!!meta[key].missing !== missing) {
            meta[key].missing = missing;
            changed = true;
        }
    });

    const store = getPresetStoreElement();
    store?.querySelectorAll?.(".preset-store-draft-name, .preset-store-candidate-name").forEach((label) => {
        const name = label.getAttribute("data-preset-store-name")
            || label.getAttribute("data-original-text")
            || label.textContent
            || "";
        const normalized = normalizePresetName(name);
        if (!normalizedUpdates.has(normalized)) return;
        const missing = normalizedUpdates.get(normalized);
        const previousMissing = label.getAttribute("data-preset-store-missing") === "1";
        applyPresetStoreDisplayName(label, normalized, missing);
        const button = label.closest?.(".preset-store-candidate");
        if (button) {
            button.classList.toggle("preset-missing", missing);
            const baseSearch = button.dataset.saiSearchBase || "";
            button.dataset.saiSearch = `${baseSearch} ${label.textContent || ""}`.trim().toLowerCase();
        }
        if (previousMissing !== missing) changed = true;
    });
    return changed;
}

function getTopbarNavButtonOriginalText(button) {
    if (!button) return "";
    const own = button.getAttribute ? button.getAttribute("data-original-text") : "";
    if (own) return own;
    const div = button.querySelector ? button.querySelector("div") : null;
    const divOriginal = div && div.getAttribute ? div.getAttribute("data-original-text") : "";
    if (divOriginal) return divOriginal;
    const span = button.querySelector ? button.querySelector("span") : null;
    const spanOriginal = span && span.getAttribute ? span.getAttribute("data-original-text") : "";
    if (spanOriginal) return spanOriginal;
    return button.textContent || "";
}

function setTopbarNavButtonOriginalText(button, originalText) {
    if (!button) return;
    const raw = String(originalText || "").trim();
    const label = topbarLocalizedPresetNavLabel(raw);
    try { button.setAttribute("data-original-text", raw); } catch (e) {}
    try { button.value = raw; } catch (e) {}
    const textTargets = button.querySelectorAll
        ? Array.from(button.querySelectorAll("span, div")).filter((item) => !item.children || item.children.length === 0)
        : [];
    const target = textTargets.find((item) => (item.textContent || "").trim())
        || (button.querySelector ? button.querySelector("span, div") : null);
    if (target) {
        try { target.setAttribute("data-original-text", raw); } catch (e) {}
        target.textContent = label || raw;
    } else {
        button.textContent = label || raw;
    }
}

function getTopbarBarButtons() {
    const roots = [];
    try {
        const app = typeof gradioApp === "function" ? gradioApp() : null;
        if (app) roots.push(app);
    } catch (e) {}
    if (typeof document !== "undefined") roots.push(document);
    const byId = new Map();
    roots.forEach((root) => {
        if (!root || !root.querySelectorAll) return;
        root.querySelectorAll('[id^="bar"]').forEach((button) => {
            if (!button || !button.id) return;
            if (!/^bar\d+$/.test(String(button.id))) return;
            const id = String(button.id);
            const target = button.matches && button.matches("button")
                ? button
                : (button.querySelector ? (button.querySelector("button") || button) : button);
            const previous = byId.get(id);
            if (!previous || (target.matches && target.matches("button") && !(previous.matches && previous.matches("button")))) {
                byId.set(id, target);
            }
        });
    });
    return Array.from(byId.entries()).sort((a, b) => {
        const ai = parseInt(String(a[0]).replace("bar", ""), 10);
        const bi = parseInt(String(b[0]).replace("bar", ""), 10);
        return (Number.isFinite(ai) ? ai : 0) - (Number.isFinite(bi) ? bi : 0);
    }).map(([, button]) => button);
}

function getTopbarActiveGradient(baseColor, highlightAlpha) {
    const alpha = Number.isFinite(highlightAlpha) ? highlightAlpha : 0.24;
    const midAlpha = Math.max(0, alpha * 0.42);
    return `linear-gradient(180deg, rgba(255, 255, 255, ${alpha}) 0%, rgba(255, 255, 255, ${midAlpha}) 38%, rgba(255, 255, 255, 0) 58%), ${baseColor}`;
}

function applyTopbarNavStyles(preset, theme, nav_name_list) {
    if (!nav_name_list || !nav_name_list.length) {
        const fallbackPreset = getCleanPresetStoreName(preset);
        nav_name_list = fallbackPreset ? [fallbackPreset] : [];
        if (!nav_name_list.length) {
            return { foundCount: 0, activeCount: 0, totalCount: 0 };
        }
    }
    const buttons = getTopbarBarButtons();
    nav_name_list = cleanPresetStoreDisplayNameList(nav_name_list, buttons.length || null);
    nav_name_list = ensurePresetStoreDisplayNavListMinimum(nav_name_list);
    if (!nav_name_list.length) {
        return { foundCount: 0, activeCount: 0, totalCount: 0 };
    }
    const mobileLimit = buttons.length;
    const normalizedPreset = normalizePresetName(preset);
    let foundCount = 0;
    let activeCount = 0;
    const totalCount = Math.min(nav_name_list.length, buttons.length || nav_name_list.length);
    const maxCount = Math.max(nav_name_list.length, buttons.length);
    for (let i = 0; i < maxCount; i++) {
        const item_name = nav_name_list[i];
        const normalizedItemName = normalizePresetName(item_name);
        let nav_item = buttons[i] || null;
        if (!nav_item) {
            try {
                const app = typeof gradioApp === "function" ? gradioApp() : null;
                nav_item = app && app.getElementById ? app.getElementById("bar" + i) : null;
            } catch (e) {
                nav_item = null;
            }
        }
        if (nav_item != null) {
            if (!normalizedItemName) {
                nav_item.style.display = "none";
                nav_item.style.pointerEvents = "none";
                try { nav_item.setAttribute("aria-hidden", "true"); } catch (e) {}
                try { nav_item.disabled = true; } catch (e) {}
                continue;
            }
            if (i < mobileLimit) {
                nav_item.style.display = "";
                nav_item.style.pointerEvents = "";
                try { nav_item.removeAttribute("aria-hidden"); } catch (e) {}
                try { nav_item.disabled = false; } catch (e) {}
            } else {
                nav_item.style.display = "none";
                nav_item.style.pointerEvents = "none";
                try { nav_item.setAttribute("aria-hidden", "true"); } catch (e) {}
                try { nav_item.disabled = true; } catch (e) {}
            }
            if (i < nav_name_list.length) {
                foundCount += 1;
            }
            const keepMissingMarker = String(item_name || "").trim().endsWith(TOPBAR_MISSING_MARKER);
            const originalText = topbarPresetNameWithMarker(item_name, keepMissingMarker);
            setTopbarNavButtonOriginalText(nav_item, originalText);
            const isActive = normalizedItemName === normalizedPreset;
            if (isActive) {
                activeCount += 1;
            }
            if (!isActive) {
                if (theme === "light") {
                    nav_item.style.color = 'var(--neutral-400)';
                    nav_item.style.background = 'var(--neutral-100)';
                } else {
                    nav_item.style.color = 'var(--neutral-400)';
                    nav_item.style.background = 'var(--neutral-700)';
                }
            } else {
                if (theme === 'light') {
                    nav_item.style.color = 'var(--neutral-800)';
                    nav_item.style.background = getTopbarActiveGradient('var(--secondary-200)', 0.34);
                } else {
                    nav_item.style.color = 'white';
                    nav_item.style.background = getTopbarActiveGradient('var(--secondary-400)', 0.24);
                }
            }
        }
    }
    return { foundCount, activeCount, totalCount };
}

function ensureTopbarNavStylesApplied(preset, theme, nav_name_list, attempt = 0) {
    const stats = applyTopbarNavStyles(preset, theme, nav_name_list);
    if (!stats || stats.totalCount <= 0) return;
    const normalizedPreset = normalizePresetName(preset);
    const shouldHaveActive = !!normalizedPreset && Array.isArray(nav_name_list)
        && nav_name_list.some((item) => normalizePresetName(item) === normalizedPreset);
    const needRetry = stats.foundCount < stats.totalCount || (shouldHaveActive && stats.activeCount === 0);
    if (!needRetry) return;
    if (attempt >= 6) return;
    setTimeout(() => ensureTopbarNavStylesApplied(preset, theme, nav_name_list, attempt + 1), 120);
}

function applyTopbarNavStylesOptimistic(preset, theme, nav_name_list) {
    const applyByDomOrder = () => {
        const buttons = getTopbarBarButtons();
        if (!buttons || !buttons.length) return false;
        const normalizedPreset = normalizePresetName(preset);
        buttons.forEach((btn) => {
            const b = btn;
            const label = normalizePresetName(getTopbarNavButtonOriginalText(b));
            const isActive = label === normalizedPreset;
            if (!isActive) {
                if (theme === "light") {
                    b.style.color = 'var(--neutral-400)';
                    b.style.background = 'var(--neutral-100)';
                } else {
                    b.style.color = 'var(--neutral-400)';
                    b.style.background = 'var(--neutral-700)';
                }
            } else {
                if (theme === 'light') {
                    b.style.color = 'var(--neutral-800)';
                    b.style.background = getTopbarActiveGradient('var(--secondary-300)', 0.32);
                } else {
                    b.style.color = 'var(--neutral-100)';
                    b.style.background = getTopbarActiveGradient('var(--secondary-400)', 0.24);
                }
            }
        });
        return true;
    };
    const appliedByDom = applyByDomOrder();
    if (appliedByDom) {
        return;
    }
    if (!nav_name_list || !nav_name_list.length) return;
    const normalizedPreset = normalizePresetName(preset);
    for (let i = 0; i < nav_name_list.length; i++) {
        const item_id = "bar" + i;
        const item_name = nav_name_list[i];
        const normalizedItemName = normalizePresetName(item_name);
        let nav_item = null;
        try {
            const app = typeof gradioApp === "function" ? gradioApp() : null;
            nav_item = app && app.getElementById ? app.getElementById(item_id) : null;
        } catch (e) {
            nav_item = null;
        }
        if (nav_item != null) {
            setTopbarNavButtonOriginalText(nav_item, topbarPresetNameWithMarker(item_name, false));
            const isActive = normalizedItemName === normalizedPreset;
            if (!isActive) {
                if (theme === "light") {
                    nav_item.style.color = 'var(--neutral-400)';
                    nav_item.style.background = 'var(--neutral-100)';
                } else {
                    nav_item.style.color = 'var(--neutral-400)';
                    nav_item.style.background = 'var(--neutral-700)';
                }
            } else {
                if (theme === 'light') {
                    nav_item.style.color = 'var(--neutral-800)';
                    nav_item.style.background = getTopbarActiveGradient('var(--secondary-300)', 0.32);
                } else {
                    nav_item.style.color = 'var(--neutral-100)';
                    nav_item.style.background = getTopbarActiveGradient('var(--secondary-400)', 0.24);
                }
            }
        }
    }
}

function getPresetNameForBarButton(barButtonEl) {
    if (!barButtonEl) return null;
    if (barButtonEl.id) {
        const m = String(barButtonEl.id).match(/^bar(\d+)$/);
        if (m) {
            const idx = parseInt(m[1], 10);
            if (Number.isFinite(idx) && topbarLastNavNameList && idx >= 0 && idx < topbarLastNavNameList.length) {
                const mapped = normalizePresetName(topbarLastNavNameList[idx] || null);
                if (mapped) return mapped;
            }
        }
    }
    const fromText = normalizePresetName(getTopbarNavButtonOriginalText(barButtonEl));
    return fromText || null;
}

function collapsePresetStoreImmediate() {
    markUiAction("collapsePresetStoreImmediate", {
        expand_flag: presetStoreUiState.expand_flag
    });
    // Gradio 6 / Svelte lifecycle can throw null.style if we mutate store UI
    // during pointerdown. Keep this as a no-op; real store state is synced
    // from backend payload in refresh_topbar_status_js().
    return;
}

function applyOptimisticBarHighlight(barButtonEl) {
    markUiAction("applyOptimisticBarHighlight.enter", {
        bar_id: barButtonEl && barButtonEl.id ? barButtonEl.id : null
    });
    collapsePresetStoreImmediate();
    markUiAction("applyOptimisticBarHighlight.afterCollapse");
    const nextPreset = getPresetNameForBarButton(barButtonEl);
    if (!nextPreset) {
        markUiAction("applyOptimisticBarHighlight.noPreset");
        return;
    }
    scheduleCloseSimpleAIOpenGalleriesForPresetSwitch("preset_nav_click");
    if (topbarLastPreset && nextPreset === normalizePresetName(topbarLastPreset)) {
        markUiAction("applyOptimisticBarHighlight.samePreset");
        return;
    }

    markUiAction("applyOptimisticBarHighlight.optimisticApply", {
        next_preset: nextPreset
    });
    topbarPendingPreset = nextPreset;
    topbarPendingPresetUntil = Date.now() + 10000;
    topbarLastPreset = nextPreset;
    setLtxGuideControlVisible(false, { __preset: nextPreset });
    beginPresetNavProgress(nextPreset);
    if (topbarOptimisticRaf) {
        try { cancelAnimationFrame(topbarOptimisticRaf); } catch (e) {}
        topbarOptimisticRaf = 0;
    }
    // Avoid same-tick DOM writes in click capture phase; Gradio 6 may still be
    // reconciling component trees in this tick.
    topbarOptimisticRaf = requestAnimationFrame(() => {
        topbarOptimisticRaf = 0;
        applyTopbarNavStylesOptimistic(nextPreset, topbarLastTheme || presetStoreUiState.theme || 'dark', topbarLastNavNameList);
    });

    clearTimeout(topbarOptimisticTimer);
    topbarOptimisticTimer = setTimeout(() => {
        markUiAction("applyOptimisticBarHighlight.rollbackTimer");
        if (topbarLastPreset && topbarLastNavNameList && topbarLastNavNameList.length) {
            applyTopbarNavStyles(topbarLastPreset, topbarLastTheme || presetStoreUiState.theme || 'dark', topbarLastNavNameList);
        }
        document.body.style.cursor = "";
        const host = document.getElementById("preset_nav_progress");
        if (host) {
            host.style.opacity = "0";
            const card = host.firstElementChild;
            if (card && card.style) {
                card.style.transform = "translateY(8px)";
            }
        }
        presetNavProgressActive = false;
        setPresetNavSceneSuppressed(false);
    }, 15000);
}


async function refresh_identity_qrcode(nickname, did, memo, user_qrcode) {
    if (!user_qrcode) return;

    if (window.canvg && window.canvg.Canvg) {
      Canvg = window.canvg.Canvg;
    } else if (window.canvg && window.canvg.default) {
      Canvg = window.canvg.default;
    } else if (window.Canvg) {
      Canvg = window.Canvg;
    } else {
      console.error('Canvg not found');
    } 
    if (user_qrcode) {
	const regex = /^[^|]+\|[^|]+\|[^|]+$/;
	if (regex.test(user_qrcode)) {
	    const [name, id, svg] = user_qrcode.split("|");
	    nickname = name;
	    did = id;
	    user_qrcode = svg;
	    memo = "admin";
	}
	const didstr = did.substr(0, 10);
        const svg = document.getElementById('qrcode');
	var svgText = `<text x="40" y="20" font-family="Arial, sans-serif" font-size="16" fill="blue">`;
        svgText = svgText + nickname + "(" + didstr + ")-" + memo + "  SimpAI.cn</text>";
        const svgContent = user_qrcode.replace('</svg>', `${svgText}</svg>`);
	const ctx = svg.getContext('2d');
        const v = await Canvg.from(ctx, svgContent);
        await v.render();
	const pngDataUrl = svg.toDataURL('image/png');
	const link = document.createElement('a');
        link.href = pngDataUrl;
        link.download = "SimpAI_identity_" + didstr + "_" + memo + ".png";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

const SCENE_DIRECTOR_IMAGE_POLICIES = new Set(["optional", "required", "forbidden"]);
const SCENE_DIRECTOR_MEDIA_POLICIES = new Set(["optional", "required", "forbidden"]);

function sceneDirectorStateParams(systemParams) {
    return systemParams && typeof systemParams === "object"
        ? systemParams
        : (topbarLastSystemParams || window.simpleaiTopbarSystemParams || {});
}

function sceneDirectorPresetEngineType(systemParams) {
    const params = sceneDirectorStateParams(systemParams);
    const prepared = params && typeof params.__preset_prepared === "object" ? params.__preset_prepared : {};
    const preparedEngine = prepared && typeof prepared.engine === "object" ? prepared.engine : {};
    const defaultEngine = params && typeof params.default_engine === "object" ? params.default_engine : {};
    return String(
        (params && params.engine_type)
        || defaultEngine.engine_type
        || preparedEngine.engine_type
        || "image"
    ).trim().toLowerCase();
}

function sceneDirectorSceneFrontend(systemParams) {
    const params = sceneDirectorStateParams(systemParams);
    if (params && params.scene_frontend && typeof params.scene_frontend === "object") return params.scene_frontend;
    const defaultEngine = params && typeof params.default_engine === "object" ? params.default_engine : {};
    if (defaultEngine.scene_frontend && typeof defaultEngine.scene_frontend === "object") return defaultEngine.scene_frontend;
    const prepared = params && typeof params.__preset_prepared === "object" ? params.__preset_prepared : {};
    const preparedEngine = prepared && typeof prepared.engine === "object" ? prepared.engine : {};
    return preparedEngine.scene_frontend && typeof preparedEngine.scene_frontend === "object" ? preparedEngine.scene_frontend : {};
}

function sceneDirectorTheme(systemParams) {
    const params = sceneDirectorStateParams(systemParams);
    const direct = String(params.__scene_theme || params.scene_theme || "").trim();
    if (direct) return direct;
    const sceneFrontend = sceneDirectorSceneFrontend(params);
    const themes = sceneFrontend.theme;
    if (typeof themes === "string") return themes;
    if (Array.isArray(themes)) return String(themes[0] || "");
    return "";
}

function sceneDirectorThemeValue(value, theme, fallback) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
        if (theme && Object.prototype.hasOwnProperty.call(value, theme)) return value[theme];
        if (Object.prototype.hasOwnProperty.call(value, "default")) return value.default;
        const first = Object.values(value)[0];
        return first === undefined ? fallback : first;
    }
    return value === undefined || value === null ? fallback : value;
}

function sceneDirectorCapabilityCandidate(value, theme) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const knownKeys = ["image_policy", "audio_policy", "video_policy", "max_images", "min_images", "image_modes", "video_modes", "chain_output", "requires_sequential", "mixed_segments", "director_supported", "segment_duration_param", "duration_strategy", "audio_output", "min_segment_duration", "max_segment_duration"];
    if (knownKeys.some((key) => Object.prototype.hasOwnProperty.call(value, key))) return value;
    if (theme && value[theme] && typeof value[theme] === "object") return value[theme];
    if (value.default && typeof value.default === "object") return value.default;
    return {};
}

function sceneDirectorTaskMethod(systemParams) {
    const params = sceneDirectorStateParams(systemParams);
    const sceneFrontend = sceneDirectorSceneFrontend(params);
    const theme = sceneDirectorTheme(params);
    const raw = sceneFrontend.task_method || params.task_method || params.__scene_task_method || "";
    return String(sceneDirectorThemeValue(raw, theme, "") || "").trim();
}

function sceneDirectorExplicitCapability(systemParams) {
    const params = sceneDirectorStateParams(systemParams);
    const theme = sceneDirectorTheme(params);
    const sceneFrontend = sceneDirectorSceneFrontend(params);
    const defaultEngine = params && typeof params.default_engine === "object" ? params.default_engine : {};
    const defaultScene = defaultEngine.scene_frontend && typeof defaultEngine.scene_frontend === "object" ? defaultEngine.scene_frontend : {};
    const prepared = params && typeof params.__preset_prepared === "object" ? params.__preset_prepared : {};
    const preparedEngine = prepared && typeof prepared.engine === "object" ? prepared.engine : {};
    const preparedScene = preparedEngine.scene_frontend && typeof preparedEngine.scene_frontend === "object" ? preparedEngine.scene_frontend : {};
    const candidates = [
        params.director_capability,
        params.__director_capability,
        sceneFrontend.director_capability,
        defaultEngine.director_capability,
        defaultScene.director_capability,
        preparedEngine.director_capability,
        preparedScene.director_capability
    ];
    for (const candidate of candidates) {
        const capability = sceneDirectorCapabilityCandidate(candidate, theme);
        if (capability && Object.keys(capability).length) return capability;
    }
    return {};
}

function sceneDirectorPolicyValue(value, allowed, fallback) {
    const policy = String(value || "").trim().toLowerCase();
    return allowed.has(policy) ? policy : fallback;
}

function sceneDirectorInferImagePolicy(systemParams) {
    const engineType = sceneDirectorPresetEngineType(systemParams);
    if (engineType && engineType !== "video") return "forbidden";
    const sceneFrontend = sceneDirectorSceneFrontend(systemParams);
    const hidden = new Set(Array.isArray(sceneFrontend.disvisible) ? sceneFrontend.disvisible.map(String) : []);
    const taskMethod = sceneDirectorTaskMethod(systemParams).toLowerCase();
    if (taskMethod.includes("t2v")) return "forbidden";
    if (taskMethod.includes("i2v") || taskMethod.includes("ia2v") || taskMethod === "wan2.2_cn" || taskMethod === "wan2.2") return "required";
    const resolutionControl = sceneFrontend.resolution_control && typeof sceneFrontend.resolution_control === "object" ? sceneFrontend.resolution_control : {};
    const source = String(sceneDirectorThemeValue(resolutionControl.source, sceneDirectorTheme(systemParams), "") || "").toLowerCase();
    if (source === "scene_canvas" || source === "scene_canvas_image") return "required";
    if (hidden.has("scene_canvas_image") && hidden.has("scene_input_image1")) return "forbidden";
    return "optional";
}

function sceneDirectorVisibleImageSlotCount(systemParams) {
    const sceneFrontend = sceneDirectorSceneFrontend(systemParams);
    const hidden = new Set(Array.isArray(sceneFrontend.disvisible) ? sceneFrontend.disvisible.map(String) : []);
    return ["scene_canvas_image", "scene_input_image1", "scene_input_image2", "scene_input_image3", "scene_input_image4"]
        .filter((slot) => !hidden.has(slot)).length;
}

function sceneDirectorIntValue(value, fallback, min, max) {
    const parsed = Number(value);
    const base = Number.isFinite(parsed) ? Math.round(parsed) : fallback;
    return Math.max(min, Math.min(max, base));
}

function sceneDirectorNumberValue(value, fallback, min, max) {
    const parsed = Number(value);
    const base = Number.isFinite(parsed) ? parsed : fallback;
    return Math.max(min, Math.min(max, base));
}

function sceneDirectorDurationParamValue(value, fallback) {
    const text = String(value || fallback || "").trim();
    if (!text) return "";
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(text) ? text : String(fallback || "").trim();
}

function sceneDirectorDurationStrategyValue(value, fallback) {
    const text = String(value || fallback || "shot").trim().toLowerCase().replace(/-/g, "_");
    return ["shot", "audio_min", "video_min"].includes(text) ? text : "shot";
}

function sceneDirectorAudioOutputValue(value, fallback) {
    const text = String(value || fallback || "silent").trim().toLowerCase().replace(/-/g, "_");
    return ["silent", "generated", "input_audio", "source_audio"].includes(text) ? text : "silent";
}

function sceneDirectorCapabilityFromSystemParams(systemParams) {
    const params = sceneDirectorStateParams(systemParams);
    const explicit = sceneDirectorExplicitCapability(systemParams);
    const inferredImagePolicy = sceneDirectorInferImagePolicy(systemParams);
    const imagePolicy = sceneDirectorPolicyValue(explicit.image_policy, SCENE_DIRECTOR_IMAGE_POLICIES, inferredImagePolicy);
    const audioPolicy = sceneDirectorPolicyValue(explicit.audio_policy, SCENE_DIRECTOR_MEDIA_POLICIES, "optional");
    const videoPolicy = sceneDirectorPolicyValue(explicit.video_policy, SCENE_DIRECTOR_MEDIA_POLICIES, "optional");
    const defaultMax = imagePolicy === "forbidden" ? 0 : Math.max(1, sceneDirectorVisibleImageSlotCount(systemParams) || 5);
    const maxImages = imagePolicy === "forbidden" ? 0 : sceneDirectorIntValue(explicit.max_images, defaultMax, 0, 5);
    const minImages = sceneDirectorIntValue(explicit.min_images, imagePolicy === "required" ? 1 : 0, 0, Math.max(0, maxImages));
    const imageModes = Array.isArray(explicit.image_modes) && explicit.image_modes.length
        ? explicit.image_modes.map((item) => String(item))
        : (imagePolicy === "forbidden" ? ["none"] : ["none", "first_frame", "first_last", "reference_set"]);
    const videoModes = Array.isArray(explicit.video_modes) && explicit.video_modes.length
        ? explicit.video_modes.map((item) => String(item))
        : (videoPolicy === "forbidden" ? ["none"] : ["explicit"]);
    const chainOutputValue = String(explicit.chain_output || "").trim();
    const chainOutput = ["timeline", "last_result"].includes(chainOutputValue) ? chainOutputValue : "timeline";
    const requiresSequential = explicit.requires_sequential === undefined ? chainOutput === "last_result" : !!explicit.requires_sequential;
    const sceneFrontend = sceneDirectorSceneFrontend(params);
    const theme = sceneDirectorTheme(params);
    const defaultDurationParam = sceneDirectorDurationParamValue(sceneDirectorThemeValue(sceneFrontend.director_segment_duration_param, theme, "scene_video_duration"), "scene_video_duration");
    const durationStrategy = sceneDirectorDurationStrategyValue(explicit.duration_strategy, "shot");
    const minDurationFloor = durationStrategy === "audio_min" || durationStrategy === "video_min" ? 0 : 0.05;
    const defaultMinSegmentDuration = sceneDirectorNumberValue(sceneDirectorThemeValue(sceneFrontend.video_duration_min ?? sceneFrontend.var_number_min, theme, 0.1), 0.1, minDurationFloor, 86400);
    const defaultMaxSegmentDuration = sceneDirectorNumberValue(sceneDirectorThemeValue(sceneFrontend.video_duration_max ?? sceneFrontend.var_number_max, theme, 10), 10, defaultMinSegmentDuration, 86400);
    const minSegmentDuration = sceneDirectorNumberValue(explicit.min_segment_duration, defaultMinSegmentDuration, minDurationFloor, 86400);
    const maxSegmentDuration = sceneDirectorNumberValue(explicit.max_segment_duration, defaultMaxSegmentDuration, minSegmentDuration, 86400);
    return {
        image_policy: imagePolicy,
        audio_policy: audioPolicy,
        video_policy: videoPolicy,
        max_images: maxImages,
        min_images: minImages,
        image_modes: imageModes,
        video_modes: videoModes,
        chain_output: chainOutput,
        requires_sequential: requiresSequential,
        mixed_segments: explicit.mixed_segments === undefined ? imagePolicy === "optional" : !!explicit.mixed_segments,
        director_supported: explicit.director_supported === undefined ? true : !!explicit.director_supported,
        segment_duration_param: sceneDirectorDurationParamValue(explicit.segment_duration_param, defaultDurationParam),
        duration_strategy: durationStrategy,
        audio_output: sceneDirectorAudioOutputValue(explicit.audio_output, "silent"),
        min_segment_duration: minSegmentDuration,
        max_segment_duration: maxSegmentDuration,
        source: Object.keys(explicit).length ? "explicit" : "inferred"
    };
}

function syncSceneDirectorPresetVisibility(systemParams, traceLabel) {
    const engineType = sceneDirectorPresetEngineType(systemParams);
    const capability = sceneDirectorCapabilityFromSystemParams(systemParams);
    const isVideoPreset = engineType === "video" && capability.director_supported !== false;
    const root = document.documentElement;
    try {
        root.classList.toggle("simpai-scene-director-video-preset", isVideoPreset);
        root.classList.toggle("simpai-scene-director-non-video-preset", !isVideoPreset);
        root.classList.toggle("simpai-scene-director-image-required", capability.image_policy === "required");
        root.classList.toggle("simpai-scene-director-image-forbidden", capability.image_policy === "forbidden");
        root.classList.toggle("simpai-scene-director-image-optional", capability.image_policy === "optional");
        root.classList.toggle("simpai-scene-director-audio-required", capability.audio_policy === "required");
        root.classList.toggle("simpai-scene-director-audio-forbidden", capability.audio_policy === "forbidden");
        root.classList.toggle("simpai-scene-director-audio-optional", capability.audio_policy === "optional");
        root.classList.toggle("simpai-scene-director-video-required", capability.video_policy === "required");
        root.classList.toggle("simpai-scene-director-video-forbidden", capability.video_policy === "forbidden");
        root.classList.toggle("simpai-scene-director-video-optional", capability.video_policy === "optional");
        root.dataset.simpaiPresetEngineType = engineType || "image";
        root.dataset.simpaiSceneDirectorImagePolicy = capability.image_policy;
        root.dataset.simpaiSceneDirectorAudioPolicy = capability.audio_policy;
        root.dataset.simpaiSceneDirectorVideoPolicy = capability.video_policy;
        root.dataset.simpaiSceneDirectorMaxImages = String(capability.max_images);
        root.dataset.simpaiSceneDirectorMinImages = String(capability.min_images);
        root.dataset.simpaiSceneDirectorChainOutput = capability.chain_output || "timeline";
        root.dataset.simpaiSceneDirectorVideoModes = Array.isArray(capability.video_modes) ? capability.video_modes.join(",") : "explicit";
        root.dataset.simpaiSceneDirectorSegmentDurationParam = capability.segment_duration_param || "scene_video_duration";
        root.dataset.simpaiSceneDirectorDurationStrategy = capability.duration_strategy || "shot";
        root.dataset.simpaiSceneDirectorAudioOutput = capability.audio_output || "silent";
        root.dataset.simpaiSceneDirectorSupported = capability.director_supported === false ? "0" : "1";
        root.dataset.simpaiSceneDirectorMinSegmentDuration = String(capability.min_segment_duration);
        root.dataset.simpaiSceneDirectorMaxSegmentDuration = String(capability.max_segment_duration);
    } catch (e) {}
    try {
        window.dispatchEvent(new CustomEvent("simpai:scene-director-capability-updated", { detail: capability }));
    } catch (e) {}
    try {
        const app = typeof gradioApp === "function" ? gradioApp() : document;
        const accordion = (app && app.getElementById ? app.getElementById("scene_director_accordion") : null)
            || document.getElementById("scene_director_accordion");
        if (accordion) {
            accordion.dataset.simpaiSceneDirectorPresetVisible = isVideoPreset ? "1" : "0";
            accordion.setAttribute("aria-hidden", isVideoPreset ? "false" : "true");
            accordion.dataset.simpaiSceneDirectorImagePolicy = capability.image_policy;
            accordion.dataset.simpaiSceneDirectorMaxImages = String(capability.max_images);
            accordion.dataset.simpaiSceneDirectorMinImages = String(capability.min_images);
            accordion.dataset.simpaiSceneDirectorSegmentDurationParam = capability.segment_duration_param || "scene_video_duration";
            accordion.dataset.simpaiSceneDirectorDurationStrategy = capability.duration_strategy || "shot";
            accordion.dataset.simpaiSceneDirectorAudioOutput = capability.audio_output || "silent";
            accordion.dataset.simpaiSceneDirectorSupported = capability.director_supported === false ? "0" : "1";
            accordion.dataset.simpaiSceneDirectorMinSegmentDuration = String(capability.min_segment_duration);
            accordion.dataset.simpaiSceneDirectorMaxSegmentDuration = String(capability.max_segment_duration);
        }
    } catch (e) {}
    try {
        simpaiUiTrace("log", "[UI-TRACE] scene_director_visibility | trace=" + (traceLabel || "") + " engine_type=" + engineType + " visible=" + isVideoPreset + " image_policy=" + capability.image_policy);
    } catch (e) {}
    return isVideoPreset;
}
window.syncSceneDirectorPresetVisibility = syncSceneDirectorPresetVisibility;
window.sceneDirectorCapabilityFromSystemParams = sceneDirectorCapabilityFromSystemParams;

if (!window.__simpaiSceneDirectorPresetVisibilityBound) {
    window.__simpaiSceneDirectorPresetVisibilityBound = true;
    try {
        window.addEventListener("simpai:system-params-updated", (event) => {
            syncSceneDirectorPresetVisibility(event && event.detail, "system-params-updated");
        });
    } catch (e) {}
}

let simpaiCompatFallbackToastTimer = null;
let simpaiLastCompatFallbackNoticeToken = null;

function showCompatFallbackToast(message, presetName) {
    const text = String(message || "").trim();
    if (!text) return;
    let toast = document.getElementById("simpai_compat_fallback_toast");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "simpai_compat_fallback_toast";
        toast.setAttribute("role", "status");
        toast.setAttribute("aria-live", "polite");
        toast.style.cssText = [
            "position:fixed",
            "right:18px",
            "bottom:18px",
            "z-index:2147483000",
            "max-width:min(420px,calc(100vw - 36px))",
            "padding:10px 14px",
            "border-radius:8px",
            "background:rgba(32,34,39,.96)",
            "color:#fff",
            "border:1px solid rgba(255,255,255,.18)",
            "box-shadow:0 12px 32px rgba(0,0,0,.32)",
            "font:14px/1.45 system-ui,-apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif",
            "pointer-events:auto",
            "cursor:pointer"
        ].join(";");
        toast.tabIndex = 0;
        toast.addEventListener("click", () => {
            const activePreset = String(toast.getAttribute("data-preset") || "").trim();
            if (!activePreset) return;
            try {
                if (typeof triggerMissingModelCheckForPreset === "function") {
                    triggerMissingModelCheckForPreset(activePreset);
                }
            } catch (e) {
                console.warn("[UI-TRACE] compat_fallback_toast.open_panel_failed", e);
            }
        });
        toast.addEventListener("keydown", (event) => {
            if (!event || (event.key !== "Enter" && event.key !== " ")) return;
            event.preventDefault();
            toast.click();
        });
        (document.body || document.documentElement).appendChild(toast);
    }
    toast.setAttribute("data-preset", String(presetName || "").trim());
    toast.setAttribute("title", text);
    toast.textContent = text;
    toast.hidden = false;
    if (simpaiCompatFallbackToastTimer) clearTimeout(simpaiCompatFallbackToastTimer);
    simpaiCompatFallbackToastTimer = window.setTimeout(() => {
        toast.hidden = true;
    }, 4200);
}

function refresh_topbar_status_js(system_params) {
    markUiAction("refresh_topbar_status_js");
    try {
        simpaiUiTrace("log", "[UI-TRACE] refresh_topbar_status_js.called | ui_ready=" + !!window.__simpleai_ui_ready +
            " preset=" + (system_params && system_params["__preset"]) +
            " is_scene=" + (system_params && system_params["__is_scene_frontend"]));
    } catch(e) {}
    if (!system_params || typeof system_params !== "object") {
        return;
    }
    checkAndUpdateSession(
        system_params["sstoken"],
        90,
        system_params["__identity_session_seq"],
        system_params["user_role"]
    );
    const previousSystemParams = topbarLastSystemParams || window.simpleaiTopbarSystemParams || {};
    if (isStaleSystemParamsForPreset(system_params)) {
        try {
            simpaiUiTrace("log", "[UI-TRACE] refresh_topbar_status_js.skip_stale_preset", {
                incoming: system_params && system_params["__preset"],
                pending: topbarPendingPreset,
                latest: topbarLastPreset,
            });
        } catch (e) {}
        return;
    }
    if (!Object.prototype.hasOwnProperty.call(system_params, "__canvas_model_catalog") && previousSystemParams.__canvas_model_catalog) {
        system_params.__canvas_model_catalog = previousSystemParams.__canvas_model_catalog;
    }
    if (!Object.prototype.hasOwnProperty.call(system_params, "__canvas_preset_catalog") && previousSystemParams.__canvas_preset_catalog) {
        system_params.__canvas_preset_catalog = previousSystemParams.__canvas_preset_catalog;
    }
    const samePresetStoreOwner = getPresetStoreOwnerKey(previousSystemParams) === getPresetStoreOwnerKey(system_params);
    if (
        samePresetStoreOwner
        && !Object.prototype.hasOwnProperty.call(system_params, "__preset_store_meta")
        && previousSystemParams.__preset_store_meta
    ) {
        system_params.__preset_store_meta = previousSystemParams.__preset_store_meta;
    }
    if (
        samePresetStoreOwner
        && !Object.prototype.hasOwnProperty.call(system_params, "__preset_store_meta_revision")
        && previousSystemParams.__preset_store_meta_revision
    ) {
        system_params.__preset_store_meta_revision = previousSystemParams.__preset_store_meta_revision;
    }
    preserveFinishedGalleryBrowserFolderInParams(system_params, "refresh_topbar_status_js");
    topbarLastSystemParams = system_params;
    window.simpleaiTopbarSystemParams = system_params;
    const compatFallbackNoticeToken = String(system_params["__compat_fallback_notice_token"] || "");
    const compatFallbackNotice = String(system_params["__compat_fallback_notice"] || "");
    if (compatFallbackNotice && compatFallbackNoticeToken && compatFallbackNoticeToken !== simpaiLastCompatFallbackNoticeToken) {
        simpaiLastCompatFallbackNoticeToken = compatFallbackNoticeToken;
        showCompatFallbackToast(compatFallbackNotice, system_params["__preset"]);
    }
    syncSceneDirectorPresetVisibility(system_params, "refresh_topbar_status_js");
    try {
        window.dispatchEvent(new CustomEvent("simpai:system-params-updated", { detail: system_params }));
    } catch (e) {}
    const galleryFrostEnabled = readSimpleAIGalleryFrostFromSystemParams(system_params);
    if (galleryFrostEnabled !== null) {
        setSimpleAIGalleryFrostEnabled(galleryFrostEnabled, { reset: false, source: "system", persist: false });
    }
    try {
        if (typeof syncResolutionControlWidgets === "function") {
            syncResolutionControlWidgets();
            setTimeout(syncResolutionControlWidgets, 120);
            setTimeout(syncResolutionControlWidgets, 420);
        }
    } catch (e) {
        console.warn("[UI-TRACE] resolution_control.profile_sync_failed", e);
    }
    const preset=system_params["__preset"];
    const theme=system_params["__theme"];
    const is_scene_frontend = !!system_params["__is_scene_frontend"];
    let nav_name_list_str = system_params["__nav_name_list"];
    if (!preset || !theme) {
        scheduleMissingModelCheckHintSync(system_params, "refresh_topbar_status_js.incomplete");
        return;
    }
    if (!nav_name_list_str) {
        const fallbackPreset = getCleanPresetStoreName(preset || topbarLastPreset || "");
        if (fallbackPreset) {
            nav_name_list_str = fallbackPreset;
            system_params["__nav_name_list"] = fallbackPreset;
            console.warn("[UI-TRACE] refresh_topbar_status_js.empty_nav_fallback", fallbackPreset);
        } else {
            scheduleMissingModelCheckHintSync(system_params, "refresh_topbar_status_js.empty_nav");
            return;
        }
    }
    setLinkColor(theme);
    nickname = system_params["user_name"];
    task_class_name = system_params["task_class_name"];
    let nav_name_list = new Array();
    if (nav_name_list_str) { nav_name_list = nav_name_list_str.split(","); }
    nav_name_list = cleanPresetStoreDisplayNameList(nav_name_list, getPresetStoreDraftLimit());
    nav_name_list = ensurePresetStoreDisplayNavListMinimum(nav_name_list);
    const incomingPresetStoreSeq = Number(system_params["__preset_store_seq"] || 0);
    const shouldApplyPresetStore = incomingPresetStoreSeq >= topbarLastPresetStoreSeq;
    if (shouldApplyPresetStore) {
        topbarLastPresetStoreSeq = incomingPresetStoreSeq;
        if (presetStoreUiState.optimistic_seq && incomingPresetStoreSeq >= presetStoreUiState.optimistic_seq) {
            clearPresetStoreOptimisticIntent();
        }
    } else if (topbarLastNavNameList && topbarLastNavNameList.length) {
        nav_name_list = topbarLastNavNameList.slice();
        system_params["__nav_name_list"] = nav_name_list.join(",");
    }
    const incomingPresetStoreOwner = getPresetStoreOwnerKey(system_params);
    if (shouldApplyPresetStore && presetStoreUiState.owner_key && presetStoreUiState.owner_key !== incomingPresetStoreOwner) {
        presetStoreUiState.meta = {};
        presetStoreUiState.meta_revision = "";
        presetStoreUiState.owner_key = "";
        invalidatePresetStoreReusableContent();
    }
    presetStoreUiState.nav_name_list = nav_name_list;
    presetStoreUiState.role = system_params["user_role"];
    if (shouldApplyPresetStore) {
        presetStoreUiState.expand_flag = !!system_params["preset_store"];
    }
    if (shouldApplyPresetStore && system_params["__preset_store_meta"] && typeof system_params["__preset_store_meta"] === "object") {
        presetStoreUiState.meta = system_params["__preset_store_meta"];
        presetStoreUiState.owner_key = incomingPresetStoreOwner;
    }
    if (shouldApplyPresetStore && Object.prototype.hasOwnProperty.call(system_params, "__preset_store_meta_revision")) {
        presetStoreUiState.meta_revision = String(system_params["__preset_store_meta_revision"] || "");
    }
    applyPresetStoreMissingStatusUpdates(system_params);
    delete system_params.__preset_store_missing_updates;
    presetStoreUiState.theme = theme;
    try {
        reconcileSceneVisibilityForPreset(system_params);
        scheduleMainModelDropdownVisibilityReconcile(system_params, "refresh_topbar_status_js");
        scheduleMainAdvancedParamVisibilityReconcile(system_params, "refresh_topbar_status_js");
        syncPerformanceSelectionVisibility(system_params, "refresh_topbar_status_js");
        scheduleSceneAndAdvancedSync("refresh_topbar_status_js", is_scene_frontend);
        scheduleScenePresetDefaultSync(system_params, "refresh_topbar_status_js");
    } catch (e) {
        console.warn("[UI-TRACE] refresh_topbar_status_js.scene_sync_failed", e);
    }
    const normalizedIncomingPreset = normalizePresetName(preset);
    const normalizedPendingPreset = normalizePresetName(topbarPendingPreset);
    if (system_params.__regen_preset_restore) {
        topbarPendingPreset = null;
        topbarPendingPresetUntil = 0;
        try { clearTimeout(topbarOptimisticTimer); } catch (e) {}
        try { finishPresetNavProgress(normalizedIncomingPreset || preset); } catch (e) {}
    }
    if (topbarPendingPreset && normalizedIncomingPreset === normalizedPendingPreset) {
        topbarPendingPreset = null;
        topbarPendingPresetUntil = 0;
    }
    const pendingActive = !!(topbarPendingPreset && Date.now() < topbarPendingPresetUntil);
    const incomingIsStaleDuringPending = pendingActive && normalizedIncomingPreset && normalizedPendingPreset && normalizedIncomingPreset !== normalizedPendingPreset;
    if (presetNavProgressActive && !incomingIsStaleDuringPending) {
        updatePresetNavProgress(
            72,
            topbarTranslateTemplate("Applying {preset}...", { preset: normalizedIncomingPreset || preset })
        );
    }
    if (!incomingIsStaleDuringPending) {
        topbarLastPreset = normalizedIncomingPreset || preset;
    }
    topbarLastTheme = theme;
    topbarLastNavNameList = nav_name_list;
    let stylePreset = preset;
    if (pendingActive) {
        stylePreset = topbarPendingPreset;
    }
    ensureTopbarNavStylesApplied(stylePreset, theme, nav_name_list, 0);
    schedulePresetStoreUpdate();
    bindPluginBtn();
    scheduleMissingModelCheckHintSync(system_params, "refresh_topbar_status_js");
    
    const message=system_params["__message"];
    if (message!=null && message.length>60) {
        showSysMsg(message, theme);
    }
    let infobox=gradioApp().getElementById("infobox");
    if (infobox!=null) {
        let css = infobox.getAttribute("class")
        if (browser.device.is_mobile && css.indexOf("infobox_mobi")<0)
            infobox.setAttribute("class", css.replace("infobox", "infobox_mobi"));
    }
    webpath = system_params["__webpath"];
    const lang=system_params["__lang"];
    if (lang!=null) {
        set_language(lang);
        try {
            setCookie("ailang", lang, 365);
        } catch (e) {}
        try {
            localStorage.setItem("ailang", lang);
        } catch (e) {}
    }
    let preset_url = system_params["__preset_url"];
    if (preset_url!=null) {
        set_iframe_src(theme,lang,preset_url);
    }
    const image_num_pages = system_params["__finished_nums_pages"];
    const gen_type = system_params["__gallery_engine_type"] || system_params["engine_type"];
    try { syncGalleryMediaSwitch(gen_type); } catch (e) {}
    if (gen_type !== "video") {
        try { document.documentElement.classList.remove("simpai-video-result-preview"); } catch (e) {}
    }
    if (image_num_pages) {
	refresh_finished_images_catalog_label(image_num_pages, gen_type, {refresh: false});
    }
    refresh_identity_center_label(system_params["user_role"]);
    refreshTopbarStoreIdentityLabel(system_params);
    const user_qr = system_params["user_qr"];
    if (user_qr) {
        (async () => {
            try {
                await refresh_identity_qrcode(nickname, system_params["user_did"], system_params["user_role"], user_qr);
            } catch (error) {
                console.error('Error refreshing QR code:', error);
            }
        })();
    }
    return
}

function mergeSimpleAITopbarSystemParamsForGallery(system_params, reason) {
    const incoming = system_params && typeof system_params === "object" ? system_params : null;
    let previous = (window.simpleaiTopbarSystemParams && typeof window.simpleaiTopbarSystemParams === "object")
        ? window.simpleaiTopbarSystemParams
        : (topbarLastSystemParams && typeof topbarLastSystemParams === "object" ? topbarLastSystemParams : null);
    if (!incoming) {
        return previous || {};
    }
    const preserveBrowserState = shouldPreserveFinishedGalleryBrowserStateDuringMerge(incoming, reason);
    const incomingHasPreset = Object.prototype.hasOwnProperty.call(incoming, "__preset")
        || Object.prototype.hasOwnProperty.call(incoming, "preset");
    const previousHasPreset = !!(previous && (
        Object.prototype.hasOwnProperty.call(previous, "__preset")
        || Object.prototype.hasOwnProperty.call(previous, "preset")
    ));
    if (previous && !preserveBrowserState) {
        previous = clearFinishedGalleryBrowserParamsForIndexState(Object.assign({}, previous), reason || "gallery_state_merge");
    }
    const merged = (!incomingHasPreset && previousHasPreset)
        ? Object.assign({}, previous, incoming)
        : incoming;
    if (!preserveBrowserState && (merged.gallery_state === "main_browser" || hasOwnFinishedGalleryBrowserParamKey(merged))) {
        clearFinishedGalleryBrowserParamsForIndexState(merged, reason || "gallery_state_merge");
    }
    preserveFinishedGalleryBrowserFolderInParams(merged, reason || "gallery_browser");
    topbarLastSystemParams = merged;
    window.simpleaiTopbarSystemParams = merged;
    try {
        window.dispatchEvent(new CustomEvent("simpai:system-params-updated", { detail: merged }));
    } catch (e) {}
    try {
        simpaiUiTrace("log", "[UI-TRACE] gallery_browser.topbar_state_merge", {
            reason: reason || "gallery_browser",
            incoming_keys: Object.keys(incoming || {}).length,
            merged: merged !== incoming,
            preserve_browser_state: preserveBrowserState,
            preset: merged && merged.__preset,
            is_scene: !!(merged && (merged.__is_scene_frontend || merged.scene_frontend)),
        });
    } catch (e) {}
    return merged;
}
window.mergeSimpleAITopbarSystemParamsForGallery = mergeSimpleAITopbarSystemParamsForGallery;

function syncPerformanceSelectionVisibility(system_params, traceLabel) {
    try { simpaiUiTrace("log", "[UI-TRACE] syncPerformanceSelectionVisibility.enter | trace=" + (traceLabel || "") + " isScene=" + !!(system_params && system_params["__is_scene_frontend"])); } catch(e) {}
    if (system_params && typeof system_params === "object") {
        topbarLastSystemParams = system_params;
    }
    const params = system_params && typeof system_params === "object" ? system_params : topbarLastSystemParams;
    if (!params || typeof params !== "object") return;
    const hiddenList = Array.isArray(params["__engine_disvisible"]) ? params["__engine_disvisible"] : [];
    const isHiddenByLayout = !!params["__is_scene_frontend"] || hiddenList.includes("performance_selection");
    const advancedChecked = getCheckboxCheckedByWrapperId("advanced_checkbox");
    const shouldHide = isHiddenByLayout || advancedChecked === false;
    try {
        simpaiUiTrace("log", "[UI-TRACE] syncPerformanceSelectionVisibility.css_toggle | shouldHide=" + shouldHide + " advancedChecked=" + advancedChecked);
        if (shouldHide) {
            document.documentElement.classList.add("simpai-hide-performance-selection");
        } else {
            document.documentElement.classList.remove("simpai-hide-performance-selection");
        }
        simpaiUiTrace("log", "[UI-TRACE] syncPerformanceSelectionVisibility.css_toggle_done");
    } catch (e) { console.warn("[UI-TRACE] syncPerformanceSelectionVisibility.css_toggle_error", e); }
}
try {
    window.syncPerformanceSelectionVisibility = syncPerformanceSelectionVisibility;
} catch (e) {}

function getSimpleAIElementById(id) {
    let app = null;
    try {
        app = typeof gradioApp === "function" ? gradioApp() : null;
    } catch (e) {
        app = null;
    }
    try {
        if (app && app.getElementById) {
            const el = app.getElementById(id);
            if (el) return el;
        }
    } catch (e) {}
    try {
        return document.getElementById(id);
    } catch (e) {
        return null;
    }
}

function isStaleSystemParamsForPreset(system_params) {
    if (!system_params || typeof system_params !== "object") return false;
    if (system_params.__regen_preset_restore) return false;
    const incomingPreset = normalizePresetName(system_params["__preset"]);
    if (!incomingPreset) return false;
    const pendingPreset = normalizePresetName(topbarPendingPreset);
    if (pendingPreset && Date.now() < topbarPendingPresetUntil && incomingPreset !== pendingPreset) {
        return true;
    }
    const latestPreset = normalizePresetName(topbarLastPreset);
    if (system_params.__preset_switched && latestPreset && incomingPreset !== latestPreset) {
        return true;
    }
    return false;
}

const SCENE_PRESET_DEFAULT_CONTROL_IDS = [
    "scene_additional_prompt",
    "scene_additional_prompt_2",
    "scene_video_duration",
    "scene_var_number",
    "scene_var_number2",
    "scene_var_number3",
    "scene_var_number4",
    "scene_var_number5",
    "scene_var_number6",
    "scene_var_number7",
    "scene_var_number8",
    "scene_var_number9",
    "scene_var_number10",
    "scene_steps",
    "scene_switch_option1",
    "scene_switch_option2",
    "scene_switch_option3",
    "scene_switch_option4",
    "scene_image_number",
];

function setNativeInputValue(input, value, kind) {
    if (!input) return false;
    if (kind === "checkbox") {
        const nextChecked = !!value;
        if (input.checked === nextChecked) return false;
        const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "checked");
        if (descriptor && descriptor.set) {
            descriptor.set.call(input, nextChecked);
        } else {
            input.checked = nextChecked;
        }
    } else {
        const nextValue = value == null ? "" : String(value);
        if (String(input.value) === nextValue) return false;
        const descriptor = Object.getOwnPropertyDescriptor(input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value");
        if (descriptor && descriptor.set) {
            descriptor.set.call(input, nextValue);
        } else {
            input.value = nextValue;
        }
    }
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
}

function applyScenePresetControlProps(input, props) {
    if (!input || !props || typeof props !== "object") return 0;
    const attrMap = {
        minimum: "min",
        maximum: "max",
        step: "step",
    };
    let changed = 0;
    for (const [key, attr] of Object.entries(attrMap)) {
        if (!Object.prototype.hasOwnProperty.call(props, key)) continue;
        const rawValue = props[key];
        if (rawValue == null || rawValue === "") continue;
        const nextValue = String(rawValue);
        if (input.getAttribute(attr) !== nextValue) {
            input.setAttribute(attr, nextValue);
            changed += 1;
        }
        try {
            if (String(input[attr] || "") !== nextValue) {
                input[attr] = nextValue;
                changed += 1;
            }
        } catch (e) {}
    }
    if (Object.prototype.hasOwnProperty.call(props, "interactive")) {
        const disabled = props.interactive === false;
        if (input.disabled !== disabled) {
            input.disabled = disabled;
            changed += 1;
        }
        if (disabled) {
            if (input.getAttribute("aria-disabled") !== "true") {
                input.setAttribute("aria-disabled", "true");
                changed += 1;
            }
        } else if (input.hasAttribute("aria-disabled")) {
            input.removeAttribute("aria-disabled");
            changed += 1;
        }
    }
    return changed;
}

function scenePresetDefaultInputSelector(controlId) {
    const isCheckbox = controlId.indexOf("scene_switch_option") === 0;
    if (isCheckbox) return 'input[type="checkbox"]';
    if (controlId === "scene_additional_prompt" || controlId === "scene_additional_prompt_2") {
        return 'textarea, input[type="text"]';
    }
    return 'input[type="number"], input[type="range"]';
}

function orderScenePresetValueInputs(inputs) {
    return Array.from(inputs || []).sort((a, b) => {
        const aRange = String(a && a.type || "").toLowerCase() === "range";
        const bRange = String(b && b.type || "").toLowerCase() === "range";
        if (aRange === bRange) return 0;
        return aRange ? -1 : 1;
    });
}

function rememberScenePresetResetDefault(root, controlId, value) {
    if (!root) return 0;
    const isCheckbox = controlId.indexOf("scene_switch_option") === 0;
    const serialized = isCheckbox ? (value ? "true" : "false") : (value == null ? "" : String(value));
    root.dataset.simpleaiScenePresetDefaultReady = "1";
    root.dataset.simpleaiScenePresetDefaultControl = controlId;
    root.dataset.simpleaiScenePresetDefaultKind = isCheckbox ? "checkbox" : "value";
    root.dataset.simpleaiScenePresetDefaultValue = serialized;

    let changed = 0;
    for (const input of Array.from(root.querySelectorAll(scenePresetDefaultInputSelector(controlId)))) {
        if (input.dataset.simpleaiScenePresetDefaultValue !== serialized) {
            input.dataset.simpleaiScenePresetDefaultValue = serialized;
            changed += 1;
        }
    }
    return changed;
}

function syncScenePresetResetDefaultFromCurrentParams(root, controlId) {
    if (!root || !controlId) return false;
    const params = window.simpleaiTopbarSystemParams && typeof window.simpleaiTopbarSystemParams === "object"
        ? window.simpleaiTopbarSystemParams
        : (topbarLastSystemParams && typeof topbarLastSystemParams === "object" ? topbarLastSystemParams : null);
    if (!params || !params.__is_scene_frontend || isStaleSystemParamsForPreset(params)) return false;
    const defaults = params.__scene_defaults;
    if (!defaults || typeof defaults !== "object" || !Object.prototype.hasOwnProperty.call(defaults, controlId)) {
        return false;
    }
    const propsByControl = params.__scene_control_props && typeof params.__scene_control_props === "object"
        ? params.__scene_control_props
        : {};
    rememberScenePresetResetDefault(root, controlId, defaults[controlId]);
    const props = propsByControl[controlId];
    if (props && typeof props === "object") {
        for (const input of Array.from(root.querySelectorAll(scenePresetDefaultInputSelector(controlId)))) {
            applyScenePresetControlProps(input, props);
        }
    }
    return true;
}

function applyScenePresetDefaultValue(controlId, value, props) {
    const root = getSimpleAIElementById(controlId);
    if (!root) return 0;
    const isCheckbox = controlId.indexOf("scene_switch_option") === 0;
    const selector = scenePresetDefaultInputSelector(controlId);
    const inputs = Array.from(root.querySelectorAll(selector));
    let changed = rememberScenePresetResetDefault(root, controlId, value);
    for (const input of orderScenePresetValueInputs(inputs)) {
        changed += applyScenePresetControlProps(input, props);
        if (setNativeInputValue(input, value, isCheckbox ? "checkbox" : "value")) {
            changed += 1;
        }
    }
    return changed;
}

function applyScenePresetDefaults(system_params, traceLabel) {
    if (!system_params || typeof system_params !== "object") return false;
    if (!system_params.__is_scene_frontend || isStaleSystemParamsForPreset(system_params)) return false;
    const defaults = system_params.__scene_defaults;
    if (!defaults || typeof defaults !== "object") return false;
    const propsByControl = system_params.__scene_control_props && typeof system_params.__scene_control_props === "object"
        ? system_params.__scene_control_props
        : {};

    let changed = 0;
    scenePresetDefaultSyncApplying = true;
    try {
        for (const controlId of SCENE_PRESET_DEFAULT_CONTROL_IDS) {
            if (!Object.prototype.hasOwnProperty.call(defaults, controlId)) continue;
            changed += applyScenePresetDefaultValue(controlId, defaults[controlId], propsByControl[controlId]);
        }
        if (Object.prototype.hasOwnProperty.call(defaults, "scene_steps")) {
            changed += applyScenePresetDefaultValue("overwrite_step", defaults.scene_steps, propsByControl.overwrite_step || null);
        }
        if (Object.prototype.hasOwnProperty.call(defaults, "scene_image_number")) {
            changed += applyScenePresetDefaultValue("image_number", defaults.scene_image_number, null);
        }
    } finally {
        scenePresetDefaultSyncApplying = false;
    }
    try {
        if (changed > 0) {
            simpaiUiTrace("log", "[UI-TRACE] scene_preset_defaults.applied", {
                trace: traceLabel || "",
                preset: system_params.__preset,
                changed,
                defaults,
            });
        }
    } catch (e) {}
    return changed > 0;
}

function findScenePresetResetTarget(button) {
    if (!button || !button.closest) return null;
    for (const controlId of SCENE_PRESET_DEFAULT_CONTROL_IDS) {
        const root = button.closest(`#${controlId}`);
        if (!root) continue;
        return { controlId, root };
    }
    return null;
}

function resetScenePresetControlToStoredDefault(root, controlId) {
    if (!root) return false;
    syncScenePresetResetDefaultFromCurrentParams(root, controlId);
    if (root.dataset.simpleaiScenePresetDefaultReady !== "1") return false;
    const kind = root.dataset.simpleaiScenePresetDefaultKind || (controlId.indexOf("scene_switch_option") === 0 ? "checkbox" : "value");
    const isCheckbox = kind === "checkbox";
    const value = isCheckbox ? root.dataset.simpleaiScenePresetDefaultValue === "true" : (root.dataset.simpleaiScenePresetDefaultValue || "");
    const inputs = Array.from(root.querySelectorAll(scenePresetDefaultInputSelector(controlId)));
    if (!inputs.length) return false;

    scenePresetDefaultSyncApplying = true;
    try {
        for (const input of orderScenePresetValueInputs(inputs)) {
            setNativeInputValue(input, value, isCheckbox ? "checkbox" : "value");
        }
    } finally {
        scenePresetDefaultSyncApplying = false;
    }
    try {
        simpaiUiTrace("log", "[UI-TRACE] scene_preset_defaults.reset_button", {
            controlId,
            value,
        });
    } catch (e) {}
    return true;
}

function scheduleScenePresetDefaultSync(system_params, traceLabel) {
    if (!system_params || typeof system_params !== "object") return;
    if (!system_params.__is_scene_frontend || !system_params.__scene_defaults) return;
    if (isStaleSystemParamsForPreset(system_params)) return;
    const token = ++scenePresetDefaultSyncToken;
    const startedAt = Date.now();
    scenePresetDefaultSyncStartedAt = startedAt;
    const delays = system_params.__preset_switched
        ? [0, 80, 240, 700, 1400, 2600]
        : [0, 160, 500];
    const run = (delay) => {
        if (token !== scenePresetDefaultSyncToken) return;
        if (scenePresetUserEditAt > startedAt) {
            try { simpaiUiTrace("log", "[UI-TRACE] scene_preset_defaults.skip_user_edit", { trace: traceLabel || "", delay }); } catch (e) {}
            return;
        }
        applyScenePresetDefaults(system_params, `${traceLabel || "scene_defaults"}+${delay}ms`);
    };
    for (const delay of delays) {
        setTimeout(() => run(delay), delay);
    }
}

function bindScenePresetDefaultUserEditGuard() {
    if (window.__simpleai_scene_default_guard_bound) return;
    const app = typeof gradioApp === "function" ? gradioApp() : document;
    if (!app || !app.addEventListener) {
        setTimeout(bindScenePresetDefaultUserEditGuard, 200);
        return;
    }
    window.__simpleai_scene_default_guard_bound = true;
    const selector = SCENE_PRESET_DEFAULT_CONTROL_IDS.map((id) => `#${id}`).join(", ");
    const onEdit = (event) => {
        if (scenePresetDefaultSyncApplying) return;
        const target = event && event.target ? event.target : null;
        if (!target || !target.closest || !target.closest(selector)) return;
        scenePresetUserEditAt = Date.now();
    };
    app.addEventListener("input", onEdit, true);
    app.addEventListener("change", onEdit, true);
}

function bindScenePresetResetButtonHandler() {
    if (window.__simpleai_scene_reset_button_bound) return;
    const app = typeof gradioApp === "function" ? gradioApp() : document;
    if (!app || !app.addEventListener) {
        setTimeout(bindScenePresetResetButtonHandler, 200);
        return;
    }
    window.__simpleai_scene_reset_button_bound = true;
    app.addEventListener("click", (event) => {
        const target = event && event.target ? event.target : null;
        const button = target && target.closest ? target.closest('[data-testid="reset-button"], .reset-button') : null;
        if (!button) return;
        const resetTarget = findScenePresetResetTarget(button);
        if (!resetTarget) return;
        if (!resetScenePresetControlToStoredDefault(resetTarget.root, resetTarget.controlId)) return;
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === "function") {
            event.stopImmediatePropagation();
        }
    }, true);
}

function setPresetModelDropdownVisible(id, visible) {
    const el = getSimpleAIElementById(id);
    if (!el || !el.style) return false;
    if (visible) {
        delete el.dataset.simpleaiPresetModelHidden;
        el.style.removeProperty("display");
        el.style.removeProperty("min-height");
        el.style.removeProperty("height");
        el.style.removeProperty("margin");
        el.style.removeProperty("padding");
        el.style.removeProperty("overflow");
        clearHiddenFlags(el);
    } else {
        el.dataset.simpleaiPresetModelHidden = "1";
        el.style.setProperty("display", "none", "important");
        el.style.setProperty("min-height", "0", "important");
        el.style.setProperty("height", "0", "important");
        el.style.setProperty("margin", "0", "important");
        el.style.setProperty("padding", "0", "important");
        el.style.setProperty("overflow", "hidden", "important");
        try { el.setAttribute("hidden", ""); } catch (e) {}
        try { el.classList.add("hidden"); } catch (e) {}
    }
    return true;
}

function syncModelsGridVisibilityClasses(baseHidden, refinerHidden, refinerSwitchHidden) {
    try {
        document.documentElement.classList.toggle("simpai-hide-base-model", !!baseHidden);
        document.documentElement.classList.toggle("simpai-hide-refiner-model", !!refinerHidden);
        document.documentElement.classList.toggle("simpai-hide-refiner-switch", !!refinerSwitchHidden);
    } catch (e) {}
    const base = getSimpleAIElementById("model_dropdown_base");
    const grid = base?.closest?.(".models-grid");
    if (grid) {
        grid.classList.toggle("models-base-hidden", !!baseHidden);
        grid.classList.toggle("models-refiner-hidden", !!refinerHidden);
    }
}

function isStaleSystemParamsForModelVisibility(system_params) {
    const incomingPreset = normalizePresetName(system_params && system_params["__preset"]);
    const pendingPreset = normalizePresetName(topbarPendingPreset);
    if (
        pendingPreset
        && Date.now() < topbarPendingPresetUntil
        && incomingPreset
        && incomingPreset !== pendingPreset
    ) {
        return true;
    }
    if (topbarLastSystemParams && topbarLastSystemParams !== system_params) {
        const latestPreset = normalizePresetName(topbarLastSystemParams["__preset"]);
        if (latestPreset && incomingPreset && latestPreset !== incomingPreset) {
            return true;
        }
    }
    return false;
}

function reconcileMainModelDropdownVisibilityForPreset(system_params, traceLabel) {
    if (!system_params || typeof system_params !== "object") return;
    if (isStaleSystemParamsForModelVisibility(system_params)) return;
    const isScene = !!system_params["__is_scene_frontend"];
    const sceneHiddenList = Array.isArray(system_params["__scene_disvisible"]) ? system_params["__scene_disvisible"] : [];
    const engineHiddenList = Array.isArray(system_params["__engine_disvisible"]) ? system_params["__engine_disvisible"] : [];
    const sceneHidden = new Set(sceneHiddenList);
    const engineHidden = new Set(engineHiddenList);
    const baseHidden = engineHidden.has("base_model")
        || (isScene && (sceneHidden.has("scene_base_model") || sceneHidden.has("base_model")));
    const refinerHidden = engineHidden.has("refiner_model")
        || (isScene && (sceneHidden.has("scene_refiner_model") || sceneHidden.has("refiner_model")));
    const backendEngine = String(system_params["__backend_engine"] || system_params["task_class_name"] || "");
    const refinerSwitchHidden = Object.prototype.hasOwnProperty.call(system_params, "__refiner_switch_visible")
        ? !system_params["__refiner_switch_visible"]
        : backendEngine !== "Fooocus" || refinerHidden;

    syncModelsGridVisibilityClasses(baseHidden, refinerHidden, refinerSwitchHidden);
    const baseFound = setPresetModelDropdownVisible("model_dropdown_base", !baseHidden);
    const refinerFound = setPresetModelDropdownVisible("model_dropdown_refiner", !refinerHidden);
    const refinerSwitchFound = setPresetModelDropdownVisible("refiner_switch", !refinerSwitchHidden);
    try {
        var _cnt = (window.__simpleai_reconcile_count || 0) + 1;
        window.__simpleai_reconcile_count = _cnt;
        if (_cnt <= 3 || _cnt % 20 === 0) {
            simpaiUiTrace("log", "[UI-TRACE] model_dropdown_visibility.reconcile #" + _cnt + " | trace=" + (traceLabel || "") + " preset=" + system_params["__preset"]);
        }
    } catch (e) {}
}

const MAIN_ADVANCED_PARAM_VISIBILITY_TARGETS = [
    { controlName: "overwrite_step", id: "overwrite_step", labels: ["Forced Overwrite of Sampling Step", "采样步数STEPS"] },
    { controlName: "guidance_scale", id: "guidance_scale", labels: ["Guidance Scale", "引导系数CFG"] },
];

function findMainAdvancedParamElement(target) {
    const byId = getSimpleAIElementById(target.id);
    if (byId) return byId;
    const labels = Array.isArray(target.labels) ? target.labels : [];
    if (!labels.length) return null;
    const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim();
    const normalizedLabels = labels.map(normalize).filter(Boolean);
    const blocks = Array.from(document.querySelectorAll(".block"));
    return blocks.find((node) => {
        const text = normalize(node.textContent || "");
        return normalizedLabels.some((label) => text.startsWith(label));
    }) || null;
}

function setMainAdvancedParamVisible(target, visible) {
    const el = findMainAdvancedParamElement(target);
    if (!el || !el.style) return false;
    if (visible) {
        delete el.dataset.simpleaiMainParamHidden;
        clearHiddenFlags(el);
        el.style.removeProperty("display");
        el.style.removeProperty("min-height");
        el.style.removeProperty("height");
        el.style.removeProperty("margin");
        el.style.removeProperty("padding");
        el.style.removeProperty("overflow");
    } else {
        el.dataset.simpleaiMainParamHidden = "1";
        el.classList.add("simpai-force-hidden");
        el.setAttribute("aria-hidden", "true");
        el.hidden = true;
        el.style.setProperty("display", "none", "important");
        el.style.setProperty("min-height", "0", "important");
        el.style.setProperty("height", "0", "important");
        el.style.setProperty("margin", "0", "important");
        el.style.setProperty("padding", "0", "important");
        el.style.setProperty("overflow", "hidden", "important");
    }
    return true;
}

function reconcileMainAdvancedParamVisibilityForPreset(system_params, traceLabel) {
    if (!system_params || typeof system_params !== "object") return;
    if (isStaleSystemParamsForModelVisibility(system_params)) return;
    const engineHiddenList = Array.isArray(system_params["__engine_disvisible"]) ? system_params["__engine_disvisible"] : [];
    const engineHidden = new Set(engineHiddenList);
    let found = 0;
    for (const target of MAIN_ADVANCED_PARAM_VISIBILITY_TARGETS) {
        if (setMainAdvancedParamVisible(target, !engineHidden.has(target.controlName))) {
            found += 1;
        }
    }
    try {
        simpaiUiTrace("log", "[UI-TRACE] main_advanced_param_visibility.reconcile", {
            trace: traceLabel || "",
            preset: system_params["__preset"],
            found,
            engineHidden: engineHiddenList,
        });
    } catch (e) {}
}

function scheduleMainAdvancedParamVisibilityReconcile(system_params, traceLabel) {
    if (!system_params || typeof system_params !== "object") return;
    reconcileMainAdvancedParamVisibilityForPreset(system_params, traceLabel);
    if (!window.__simpleai_ui_ready) return;
    [40, 120, 320, 800].forEach((delay) => {
        setTimeout(
            () => reconcileMainAdvancedParamVisibilityForPreset(system_params, `${traceLabel || "main_advanced"}+${delay}ms`),
            delay
        );
    });
}

function scheduleMainModelDropdownVisibilityReconcile(system_params, traceLabel) {
    if (!system_params || typeof system_params !== "object") return;
    reconcileMainModelDropdownVisibilityForPreset(system_params, traceLabel);
    if (!window.__simpleai_ui_ready) {
        try { simpaiUiTrace("log", "[UI-TRACE] scheduleMainModelDropdownVisibilityReconcile.skipped_retries | ui_ready=" + !!window.__simpleai_ui_ready + " trace=" + traceLabel); } catch(e) {}
        return;
    }
    var now = Date.now();
    var last = window.__simpleai_last_retry_schedule || 0;
    if (now - last < 2000) {
        try { simpaiUiTrace("log", "[UI-TRACE] scheduleMainModelDropdownVisibilityReconcile.cooldown | since_last=" + (now - last) + "ms trace=" + traceLabel); } catch(e) {}
        return;
    }
    window.__simpleai_last_retry_schedule = now;
    try { simpaiUiTrace("log", "[UI-TRACE] scheduleMainModelDropdownVisibilityReconcile.scheduling_retries | trace=" + traceLabel); } catch(e) {}
    [40, 120, 320, 800, 1400].forEach((delay) => {
        setTimeout(
            () => reconcileMainModelDropdownVisibilityForPreset(system_params, `${traceLabel || "model_visibility"}+${delay}ms`),
            delay
        );
    });
}

function reconcileSceneVisibilityForPreset(system_params) {
    if (!system_params || typeof system_params !== "object") return;
    const isScene = !!system_params["__is_scene_frontend"];
    const hiddenList = Array.isArray(system_params["__scene_disvisible"]) ? system_params["__scene_disvisible"] : [];
    const hidden = new Set(hiddenList);

    const controlTargets = {
        scene_canvas_image: "scene_canvas",
        scene_input_image1: "scene_input_image1",
        scene_input_image2: "scene_input_image2",
        scene_input_image3: "scene_input_image3",
        scene_input_image4: "scene_input_image4",
        scene_additional_prompt: "scene_additional_prompt",
        scene_additional_prompt_2: "scene_additional_prompt_2",
        scene_video_duration: "scene_video_duration",
        scene_var_number: "scene_var_number",
        scene_var_number2: "scene_var_number2",
        scene_var_number3: "scene_var_number3",
        scene_var_number4: "scene_var_number4",
        scene_var_number5: "scene_var_number5",
        scene_var_number6: "scene_var_number6",
        scene_var_number7: "scene_var_number7",
        scene_var_number8: "scene_var_number8",
        scene_var_number9: "scene_var_number9",
        scene_var_number10: "scene_var_number10",
        scene_steps: "scene_steps",
        scene_switch_option1: "scene_switch_option1",
        scene_switch_option2: "scene_switch_option2",
        scene_switch_option3: "scene_switch_option3",
        scene_switch_option4: "scene_switch_option4",
        scene_image_number: "scene_image_number",
        scene_video: "scene_video",
        scene_reference_video: "scene_reference_video",
        scene_audio: "scene_audio",
    };

    const rowTargets = [
        ["scene_input_images", ["scene_input_image1", "scene_input_image2", "scene_input_image3", "scene_input_image4"]],
        ["scene_duration_row", ["scene_video_duration", "scene_var_number"]],
        ["scene_var_number7_8_row", ["scene_var_number7", "scene_var_number8"]],
        ["scene_var_number9_10_row", ["scene_var_number9", "scene_var_number10"]],
        ["scene_switch_option1_2_row", ["scene_switch_option1", "scene_switch_option2"]],
        ["scene_switch_option3_4_row", ["scene_switch_option3", "scene_switch_option4"]],
        ["scene_image_options_row", ["scene_image_number"]],
    ];

    const groupTargets = [
        ["scene_advanced_parameters_accordion", [
            "scene_var_number2", "scene_var_number3", "scene_var_number4", "scene_var_number5",
            "scene_var_number6", "scene_var_number7", "scene_var_number8", "scene_var_number9",
            "scene_var_number10", "scene_steps", "scene_switch_option1", "scene_switch_option2",
            "scene_switch_option3", "scene_switch_option4"
        ]],
    ];

    function setForcedHidden(id, shouldHide) {
        const el = gradioApp().getElementById(id) || document.getElementById(id);
        if (!el) return false;
        if (shouldHide) {
            el.dataset.simpleaiSceneHidden = "1";
            el.classList.add("simpai-force-hidden");
            el.setAttribute("aria-hidden", "true");
            el.hidden = true;
            el.style.setProperty("display", "none", "important");
            el.style.setProperty("min-height", "0", "important");
            el.style.setProperty("height", "0", "important");
            el.style.setProperty("margin", "0", "important");
            el.style.setProperty("padding", "0", "important");
            el.style.setProperty("overflow", "hidden", "important");
        } else if (el.dataset.simpleaiSceneHidden === "1") {
            delete el.dataset.simpleaiSceneHidden;
            clearHiddenFlags(el);
        } else if (!shouldHide) {
            clearHiddenFlags(el);
        }
        return true;
    }

    for (const [controlName, id] of Object.entries(controlTargets)) {
        setForcedHidden(id, !isScene || hidden.has(controlName));
    }
    setForcedHidden("scene_primary_row", !isScene);
    for (const [id, controls] of rowTargets) {
        const shouldHide = !isScene || controls.every((name) => hidden.has(name));
        setForcedHidden(id, shouldHide);
    }
    const sceneInputImages = gradioApp().getElementById("scene_input_images") || document.getElementById("scene_input_images");
    if (sceneInputImages) {
        const visibleImageCount = isScene
            ? ["scene_input_image1", "scene_input_image2", "scene_input_image3", "scene_input_image4"].filter((name) => !hidden.has(name)).length
            : 0;
        sceneInputImages.dataset.simpleaiVisibleCount = String(visibleImageCount);
        sceneInputImages.classList.toggle("scene-input-images-single", visibleImageCount === 1);
        sceneInputImages.classList.toggle("scene-input-images-pair", visibleImageCount >= 2);
    }
    syncSceneCanvasMaskMode(system_params);
    syncSceneUploadImageLabels(isScene, hidden);
    for (const [id, controls] of groupTargets) {
        const shouldHide = !isScene || controls.every((name) => hidden.has(name));
        setForcedHidden(id, shouldHide);
    }
    reconcileSceneAuxControlsFromValues(isScene, system_params["__scene_theme"], system_params["__scene_task_method"], system_params["__scene_disvisible"], system_params);
    reconcileMainModelDropdownVisibilityForPreset(system_params, "scene_visibility");
}

function getSceneTaskMethodFromState(state, theme) {
    const sceneFrontend = state && typeof state === "object" ? state.scene_frontend : null;
    if (!sceneFrontend || typeof sceneFrontend !== "object") return "";
    const byTheme = sceneTaskMethodForTheme(sceneFrontend, theme);
    if (byTheme.known) return byTheme.value;
    return "";
}

function setSceneAuxControlVisible(id, visible) {
    const el = gradioApp().getElementById(id) || document.getElementById(id);
    if (id === "sam3_video_mask_accordion" && !visible && typeof window.closeSam3FramesEditor === "function") {
        try { window.closeSam3FramesEditor(); } catch (e) {}
    }
    if (!el) return false;
    const scenePanel = gradioApp().getElementById("scene_panel") || document.getElementById("scene_panel");
    let layoutShell = el;
    if (scenePanel?.contains(el)) {
        while (layoutShell.parentElement && layoutShell.parentElement !== scenePanel) {
            layoutShell = layoutShell.parentElement;
        }
    }
    const targets = layoutShell === el ? [el] : [el, layoutShell];
    for (const target of targets) {
        if (visible) {
            if (target.dataset.simpleaiAuxHidden === "1") {
                delete target.dataset.simpleaiAuxHidden;
            }
            clearHiddenFlags(target);
        } else {
            target.dataset.simpleaiAuxHidden = "1";
            target.classList.add("simpai-force-hidden");
            target.setAttribute("aria-hidden", "true");
            target.hidden = true;
            target.style.setProperty("display", "none", "important");
            target.style.setProperty("min-height", "0", "important");
            target.style.setProperty("height", "0", "important");
            target.style.setProperty("margin", "0", "important");
            target.style.setProperty("padding", "0", "important");
            target.style.setProperty("overflow", "hidden", "important");
        }
    }
    return true;
}

function isCurrentSystemParamsForLtxGuide(systemParams) {
    if (!systemParams || typeof systemParams !== "object") return true;
    if (isStaleSystemParamsForPreset(systemParams)) return false;
    const incomingPreset = normalizePresetName(systemParams.__preset || systemParams.preset);
    const pendingPreset = normalizePresetName(topbarPendingPreset);
    if (pendingPreset && Date.now() < topbarPendingPresetUntil && incomingPreset && incomingPreset !== pendingPreset) {
        return false;
    }
    const liveParams = window.simpleaiTopbarSystemParams && typeof window.simpleaiTopbarSystemParams === "object"
        ? window.simpleaiTopbarSystemParams
        : null;
    const livePreset = normalizePresetName(liveParams && (liveParams.__preset || liveParams.preset));
    if (incomingPreset && livePreset && incomingPreset !== livePreset) return false;
    return true;
}

function setLtxGuideControlVisible(requestedVisible, systemParams) {
    const visible = !!requestedVisible && isCurrentSystemParamsForLtxGuide(systemParams);
    try {
        document.documentElement.classList.toggle("simpai-ltx-guide-control-active", visible);
    } catch (e) {}
    try { setSceneAuxControlVisible("ltx_guide_control", visible); } catch (e) {}
    try { setSceneAuxControlVisible("ltx_guide_scene_control_html", visible); } catch (e) {}
    if (visible && window.SimpAILTXGuideEditor?.syncSceneControl) {
        try { window.SimpAILTXGuideEditor.syncSceneControl(systemParams || {}); } catch (e) {}
    }
    if (!visible && window.SimpAILTXGuideEditor?.closeScenePreset) {
        try { window.SimpAILTXGuideEditor.closeScenePreset(); } catch (e) {}
    }
    return visible;
}
window.simpaiSetLtxGuideControlVisible = setLtxGuideControlVisible;

function sceneDisvisibleSetFromValue(disvisible) {
    return Array.isArray(disvisible)
        ? new Set(disvisible.map((item) => String(item)))
        : new Set(String(disvisible || "").split(",").map((item) => item.trim()).filter(Boolean));
}

function sceneBoolValueForTheme(sceneFrontend, key, theme, defaultValue = false) {
    if (!sceneFrontend || typeof sceneFrontend !== "object") return !!defaultValue;
    let value = Object.prototype.hasOwnProperty.call(sceneFrontend, key) ? sceneFrontend[key] : defaultValue;
    if (value && typeof value === "object" && !Array.isArray(value)) {
        if (theme && Object.prototype.hasOwnProperty.call(value, theme)) value = value[theme];
        else {
            const values = Object.values(value);
            value = values.length ? values[0] : defaultValue;
        }
    }
    if (typeof value === "string") return /^(1|true|yes|on|enabled)$/i.test(value.trim());
    return !!value;
}

function resolveSceneCanvasMaskDisabled(systemParams) {
    if (!systemParams || typeof systemParams !== "object") return false;
    if (Object.prototype.hasOwnProperty.call(systemParams, "__scene_canvas_mask_disabled")) {
        return !!systemParams.__scene_canvas_mask_disabled;
    }
    const sceneFrontend = systemParams.scene_frontend || {};
    const theme = systemParams.__scene_theme || systemParams.scene_theme || sceneSelectedThemeValue();
    return sceneBoolValueForTheme(sceneFrontend, "disable_canvas_mask", theme, false)
        || sceneBoolValueForTheme(sceneFrontend, "disable_scene_canvas_mask", theme, false);
}

function syncSceneCanvasMaskMode(systemParams) {
    const disabled = resolveSceneCanvasMaskDisabled(systemParams);
    const app = gradioApp();
    const root = (app && app.getElementById ? app.getElementById("scene_canvas") : null) || document.getElementById("scene_canvas");
    if (!root) return disabled;
    const attrValue = disabled ? "1" : "0";
    const previousAttr = root.dataset.simpaiMaskDisabled;
    const previousApplied = root.__simpaiSceneCanvasMaskDisabledApplied;
    const changed = previousAttr !== attrValue || previousApplied !== disabled;
    if (previousAttr !== attrValue) {
        root.dataset.simpaiMaskDisabled = attrValue;
    }
    if (root.classList.contains("simpai-scene-canvas-mask-disabled") !== disabled) {
        root.classList.toggle("simpai-scene-canvas-mask-disabled", disabled);
    }
    root.__simpaiSceneCanvasMaskDisabledApplied = disabled;
    if (window.SimpAISketch?.setMaskDisabled) {
        try {
            if (changed) {
                window.SimpAISketch.setMaskDisabled(root, disabled, { clearMask: true, change: true });
            }
        } catch (e) {
            console.warn("[UI-TRACE] scene_canvas_mask_mode_sync_failed", e);
        }
    }
    return disabled;
}

window.syncSceneCanvasMaskMode = syncSceneCanvasMaskMode;

const SCENE_BATCH_TARGET_SLOT_ORDER = ["scene_canvas_image", "scene_input_image1", "scene_input_image2", "scene_input_image3", "scene_input_image4"];

let sceneUploadImageLabelObserver = null;
let sceneUploadImageLabelObserverRoot = null;
let sceneUploadImageLabelSyncTimer = null;
let sceneUploadImageLabelState = { isScene: false, canvasHidden: false, hiddenIds: [] };
let sceneBatchTargetObserver = null;
let sceneBatchTargetObserverRoot = null;

function sceneUploadSlotFixedIndex(slot) {
    if (slot === "scene_canvas_image") return 1;
    const match = String(slot || "").match(/^scene_input_image(\d+)$/);
    return match ? Number(match[1]) + 1 : 1;
}

function sceneUploadSlotEnglishLabel(slot) {
    const index = sceneUploadSlotFixedIndex(slot);
    return slot === "scene_canvas_image"
        ? `Upload and canvas(${index})`
        : `Upload prompt image(${index})`;
}

function sceneUploadVisibleSlotItems(isScene, hidden) {
    if (!isScene) return [];
    const hiddenSet = hidden instanceof Set ? hidden : sceneDisvisibleSetFromValue(hidden);
    const slots = SCENE_BATCH_TARGET_SLOT_ORDER.filter((slot) => !hiddenSet.has(slot));
    if (!slots.length) slots.push("scene_input_image1");
    return slots.map((slot) => ({
        slot,
        englishLabel: sceneUploadSlotEnglishLabel(slot),
    }));
}

function normalizeSceneUploadPromptLabelIdentity(value) {
    let raw = String(value || "").replace(/\s+/g, " ").trim();
    if (!raw) return "";
    try {
        if (typeof getReverseLocalization === "function") {
            const reverse = getReverseLocalization();
            if (reverse && reverse[raw]) raw = reverse[raw];
        }
    } catch (e) {}
    for (let i = 1; i <= 5; i += 1) {
        const english = `Upload prompt image(${i})`;
        if (raw === english) return english;
        try {
            if (raw === topbarTranslateText(english)) return english;
        } catch (e) {}
    }
    const match = raw.match(/(?:Upload prompt image|参考图片)\(([1-5])\)/);
    return match ? `Upload prompt image(${match[1]})` : "";
}

function normalizeSceneBatchTargetSlotIdentity(value) {
    let raw = String(value || "").replace(/\s+/g, " ").trim();
    if (!raw) return "";
    if (SCENE_BATCH_TARGET_SLOT_ORDER.includes(raw)) return raw;
    try {
        if (typeof getReverseLocalization === "function") {
            const reverse = getReverseLocalization();
            if (reverse && reverse[raw]) raw = reverse[raw];
        }
    } catch (e) {}
    if (SCENE_BATCH_TARGET_SLOT_ORDER.includes(raw)) return raw;
    const lowered = raw.toLowerCase();
    if (lowered.includes("scene_canvas") || lowered.includes("upload and canvas") || lowered.includes("canvas") || raw.includes("主体图片")) {
        return "scene_canvas_image";
    }
    for (let i = 4; i >= 1; i -= 1) {
        if (lowered.includes(`scene_input_image${i}`)) return `scene_input_image${i}`;
    }
    const promptMatch = raw.match(/(?:Upload prompt image|Prompt image|参考图片)\(([1-5])\)/i);
    if (promptMatch) {
        const slotIndex = Math.max(1, Math.min(4, Number(promptMatch[1]) - 1));
        return `scene_input_image${slotIndex}`;
    }
    return "";
}

function findSceneUploadPromptLabelTextNode(root) {
    if (!root || typeof document === "undefined" || !document.createTreeWalker) return null;
    const nodeFilter = (typeof NodeFilter !== "undefined")
        ? NodeFilter
        : { SHOW_TEXT: 4, FILTER_ACCEPT: 1, FILTER_REJECT: 2 };
    const filter = {
        acceptNode(node) {
            return normalizeSceneUploadPromptLabelIdentity(node && node.textContent)
                ? nodeFilter.FILTER_ACCEPT
                : nodeFilter.FILTER_REJECT;
        }
    };
    const walker = document.createTreeWalker(root, nodeFilter.SHOW_TEXT, filter);
    return walker.nextNode();
}

function setSceneUploadPromptBlockLabel(controlId, englishLabel) {
    const app = gradioApp();
    const root = (app && app.getElementById ? app.getElementById(controlId) : null) || document.getElementById(controlId);
    const textNode = findSceneUploadPromptLabelTextNode(root);
    if (!root || !textNode) return false;

    const translated = topbarTranslateText(englishLabel);
    const currentText = String(textNode.textContent || "");
    const nextText = currentText.match(/(?:Upload prompt image|参考图片)\([1-5]\)/)
        ? currentText.replace(/(?:Upload prompt image|参考图片)\([1-5]\)/, translated)
        : translated;
    if (textNode.textContent !== nextText) {
        textNode.textContent = nextText;
    }

    const textParent = textNode.parentElement || null;
    const labelNode = textParent && textParent.closest
        ? textParent.closest('[data-testid="block-label"], .label-wrap, label, span')
        : textParent;
    [textParent, labelNode].forEach((node) => {
        if (!node || !node.setAttribute) return;
        try { node.setAttribute("data-original-text", englishLabel); } catch (e) {}
    });
    return true;
}

function findSceneBatchTargetLabelTextNode(label) {
    if (!label || typeof document === "undefined" || !document.createTreeWalker) return null;
    const nodeFilter = (typeof NodeFilter !== "undefined")
        ? NodeFilter
        : { SHOW_TEXT: 4, FILTER_ACCEPT: 1, FILTER_REJECT: 2 };
    const filter = {
        acceptNode(node) {
            const text = String((node && node.textContent) || "").trim();
            if (!text) return nodeFilter.FILTER_REJECT;
            const parent = node.parentElement || null;
            if (parent && parent.closest && parent.closest("input, script, style")) {
                return nodeFilter.FILTER_REJECT;
            }
            return nodeFilter.FILTER_ACCEPT;
        }
    };
    const walker = document.createTreeWalker(label, nodeFilter.SHOW_TEXT, filter);
    return walker.nextNode();
}

function setSceneBatchTargetChoiceVisible(label, visible) {
    if (!label) return;
    if (visible) {
        label.hidden = false;
        label.removeAttribute("aria-hidden");
        label.style.removeProperty("display");
        label.style.removeProperty("height");
        label.style.removeProperty("min-height");
        label.style.removeProperty("margin");
        label.style.removeProperty("padding");
        label.style.removeProperty("overflow");
    } else {
        label.hidden = true;
        label.setAttribute("aria-hidden", "true");
        label.style.setProperty("display", "none", "important");
        label.style.setProperty("height", "0", "important");
        label.style.setProperty("min-height", "0", "important");
        label.style.setProperty("margin", "0", "important");
        label.style.setProperty("padding", "0", "important");
        label.style.setProperty("overflow", "hidden", "important");
    }
}

function setSceneBatchTargetChoiceLabel(label, englishLabel) {
    const textNode = findSceneBatchTargetLabelTextNode(label);
    if (!label || !textNode) return false;
    const translated = topbarTranslateText(englishLabel);
    const currentText = String(textNode.textContent || "");
    const nextText = currentText.match(/(?:Upload and canvas|Upload prompt image|Prompt image|主体图片|参考图片)\([1-5]\)/)
        ? currentText.replace(/(?:Upload and canvas|Upload prompt image|Prompt image|主体图片|参考图片)\([1-5]\)/, translated)
        : translated;
    if (textNode.textContent !== nextText) {
        textNode.textContent = nextText;
    }
    const parent = textNode.parentElement || null;
    [label, parent].forEach((node) => {
        if (!node || !node.setAttribute) return;
        try { node.setAttribute("data-original-text", englishLabel); } catch (e) {}
    });
    return true;
}

function syncSceneBatchTargetLabels(isScene, hidden, slotItems = null) {
    if (!isScene) return;
    ensureSceneBatchTargetObserver();
    const app = gradioApp();
    const root = (app && app.getElementById ? app.getElementById("scene_batch_target") : null) || document.getElementById("scene_batch_target");
    if (!root || !root.querySelectorAll) return;

    const items = Array.isArray(slotItems) ? slotItems : sceneUploadVisibleSlotItems(isScene, hidden);
    const itemBySlot = new Map(items.map((item) => [item.slot, item]));
    const labels = Array.from(root.querySelectorAll('label')).filter((label) => label.querySelector('input[type="radio"]'));
    const visibleOptions = [];
    let checkedVisible = false;

    labels.forEach((label, index) => {
        const input = label.querySelector('input[type="radio"]');
        if (!input) return;
        let slot = normalizeSceneBatchTargetSlotIdentity(input.value || label.textContent);
        if (!slot && SCENE_BATCH_TARGET_SLOT_ORDER[index]) slot = SCENE_BATCH_TARGET_SLOT_ORDER[index];
        const item = itemBySlot.get(slot);
        if (!item) {
            setSceneBatchTargetChoiceVisible(label, false);
            return;
        }
        setSceneBatchTargetChoiceVisible(label, true);
        setSceneBatchTargetChoiceLabel(label, item.englishLabel);
        if (input.value !== item.slot) input.value = item.slot;
        visibleOptions.push({ input, slot: item.slot });
        if (input.checked) checkedVisible = true;
    });

    if (!checkedVisible && visibleOptions.length) {
        const next = visibleOptions.find((option) => option.slot === "scene_canvas_image") || visibleOptions[0];
        next.input.checked = true;
        next.input.dispatchEvent(new Event("input", { bubbles: true }));
        next.input.dispatchEvent(new Event("change", { bubbles: true }));
    }
}

function ensureSceneBatchTargetObserver() {
    if (typeof MutationObserver === "undefined") return;
    const app = gradioApp();
    const root = (app && app.getElementById ? app.getElementById("scene_batch_accordion") : null) || document.getElementById("scene_batch_accordion");
    if (!root) return;
    if (sceneBatchTargetObserver && sceneBatchTargetObserverRoot === root) return;
    if (sceneBatchTargetObserver) {
        try { sceneBatchTargetObserver.disconnect(); } catch (e) {}
    }
    sceneBatchTargetObserverRoot = root;
    sceneBatchTargetObserver = new MutationObserver(() => {
        if (!sceneUploadImageLabelState.isScene) return;
        scheduleSceneUploadImageLabelSync();
    });
    sceneBatchTargetObserver.observe(root, { childList: true, subtree: true, characterData: true });
}

function scheduleSceneUploadImageLabelSync() {
    if (sceneUploadImageLabelSyncTimer) return;
    sceneUploadImageLabelSyncTimer = setTimeout(() => {
        sceneUploadImageLabelSyncTimer = null;
        const hidden = new Set(Array.isArray(sceneUploadImageLabelState.hiddenIds) ? sceneUploadImageLabelState.hiddenIds : []);
        syncSceneUploadImageLabels(sceneUploadImageLabelState.isScene, hidden);
    }, 40);
}

function ensureSceneUploadImageLabelObserver(row) {
    if (!row || typeof MutationObserver === "undefined") return;
    if (sceneUploadImageLabelObserver && sceneUploadImageLabelObserverRoot === row) return;
    if (sceneUploadImageLabelObserver) {
        try { sceneUploadImageLabelObserver.disconnect(); } catch (e) {}
    }
    sceneUploadImageLabelObserverRoot = row;
    sceneUploadImageLabelObserver = new MutationObserver(() => {
        if (!sceneUploadImageLabelState.isScene) return;
        scheduleSceneUploadImageLabelSync();
    });
    sceneUploadImageLabelObserver.observe(row, { childList: true, subtree: true, characterData: true });
}

function syncSceneUploadImageLabels(isScene, hidden) {
    const hiddenSet = hidden instanceof Set ? hidden : sceneDisvisibleSetFromValue(hidden);
    const canvasHidden = hiddenSet.has("scene_canvas_image");
    sceneUploadImageLabelState = { isScene: !!isScene, canvasHidden, hiddenIds: Array.from(hiddenSet) };

    const app = gradioApp();
    const row = (app && app.getElementById ? app.getElementById("scene_input_images") : null) || document.getElementById("scene_input_images");
    ensureSceneUploadImageLabelObserver(row);
    if (!isScene) return;

    const items = sceneUploadVisibleSlotItems(isScene, hiddenSet);
    items.forEach((item) => {
        if (item.slot === "scene_canvas_image") return;
        setSceneUploadPromptBlockLabel(item.slot, item.englishLabel);
    });
    syncSceneBatchTargetLabels(isScene, hiddenSet, items);
}

const GAUSSIAN_STUDIO_SCENE_STATUS_TEXT = "Input Image 1 reference -> Gaussian Studio -> Canvas output";
const LIVEPORTRAIT_EXPRESSION_SCENE_STATUS_TEXT = "Source Image 1 -> Reference Image 2 -> Expression output";
const LIVEPORTRAIT_EXPRESSION_VIDEO_SCENE_STATUS_TEXT = "Source video first frame -> expression params -> video output";

let gaussianStudioSceneInputGuardBound = false;

function bindGaussianStudioSceneInputGuard() {
    if (gaussianStudioSceneInputGuardBound) return;
    gaussianStudioSceneInputGuardBound = true;
    const guardedEvents = ["click", "dblclick", "pointerdown", "mousedown", "mouseup", "dragenter", "dragover", "drop", "paste", "keydown"];
    const isGuardedTarget = (event) => {
        const target = event && event.target && event.target.closest
            ? event.target.closest("#scene_canvas.sai-gaussian-studio-output-slot")
            : null;
        if (!target) return false;
        if (event.type === "keydown" && event.key !== "Enter" && event.key !== " ") return false;
        return true;
    };
    guardedEvents.forEach((eventName) => {
        document.addEventListener(eventName, (event) => {
            if (!isGuardedTarget(event)) return;
            if (event.type === "dragover" && event.dataTransfer) {
                try { event.dataTransfer.dropEffect = "none"; } catch (e) {}
            }
            event.preventDefault();
            event.stopPropagation();
            if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
        }, true);
    });
}

function setGaussianStudioSceneImageMode(active, langSource) {
    const app = gradioApp();
    const row = (app && app.getElementById ? app.getElementById("scene_input_images") : null) || document.getElementById("scene_input_images");
    const canvas = (app && app.getElementById ? app.getElementById("scene_canvas") : null) || document.getElementById("scene_canvas");
    const left = (app && app.getElementById ? app.getElementById("scene_input_image1") : null) || document.getElementById("scene_input_image1");
    const right = (app && app.getElementById ? app.getElementById("scene_input_image2") : null) || document.getElementById("scene_input_image2");
    const host = (app && app.getElementById ? app.getElementById("gaussian_studio_scene_control") : null) || document.getElementById("gaussian_studio_scene_control");
    const status = host && host.querySelector ? host.querySelector("[data-gaussian-studio-scene-status]") : null;
    const wasActive = row && row.dataset.saiGaussianStudioActive === "1";
    if (row) {
        row.classList.toggle("sai-gaussian-studio-image-flow", !!active);
        row.dataset.saiGaussianStudioActive = active ? "1" : "0";
    }
    if (active) {
        bindGaussianStudioSceneInputGuard();
        if (canvas) {
            canvas.classList.toggle("sai-gaussian-studio-output-slot", true);
            canvas.dataset.saiGaussianRole = "output";
            canvas.setAttribute("aria-disabled", "true");
            canvas.setAttribute("title", topbarTranslateText("Canvas is the Gaussian Studio output slot. Upload the reference to Input Image 1."));
        }
        if (left) {
            left.dataset.saiGaussianRole = "reference";
            left.removeAttribute("aria-disabled");
            left.setAttribute("title", topbarTranslateText("Upload the reference to Input Image 1 before opening Gaussian Studio."));
        }
        if (right) {
            delete right.dataset.saiGaussianRole;
            right.removeAttribute("aria-disabled");
            right.removeAttribute("title");
        }
        if (status) {
            const current = String(status.textContent || "").trim();
            if (
                !wasActive
                || status.dataset.saiGaussianDefaultStatus === "1"
                || !current
                || current === "Input Image 2 -> Input Image 1"
                || current === "Right reference -> Gaussian Studio -> Left output"
                || current === "右侧参考图 -> Gaussian Studio -> 左侧输出"
                || current === "右侧参考图 -> 左侧输出 / Right reference -> Left output"
            ) {
                status.dataset.saiGaussianDefaultStatus = "1";
                status.textContent = topbarTranslateText(GAUSSIAN_STUDIO_SCENE_STATUS_TEXT);
                status.classList.remove("is-error");
            }
        }
    } else {
        [canvas, left, right].forEach((node) => {
            if (!node) return;
            node.classList.remove("sai-gaussian-studio-output-slot");
            delete node.dataset.saiGaussianRole;
            node.removeAttribute("aria-disabled");
            node.removeAttribute("title");
        });
    }
}

function setLivePortraitExpressionSceneImageMode(active, langSource) {
    const app = gradioApp();
    const row = (app && app.getElementById ? app.getElementById("scene_input_images") : null) || document.getElementById("scene_input_images");
    const source = (app && app.getElementById ? app.getElementById("scene_input_image1") : null) || document.getElementById("scene_input_image1");
    const reference = (app && app.getElementById ? app.getElementById("scene_input_image2") : null) || document.getElementById("scene_input_image2");
    const host = (app && app.getElementById ? app.getElementById("liveportrait_expression_scene_control") : null) || document.getElementById("liveportrait_expression_scene_control");
    const status = host && host.querySelector ? host.querySelector("[data-liveportrait-expression-scene-status]") : null;
    const sceneFrontend = langSource && typeof langSource === "object" ? langSource.scene_frontend : null;
    const sourceMode = host && host.dataset ? host.dataset.liveportraitExpressionSource : "";
    const isVideoExpression = sourceMode === "scene_video_first_frame"
        || sceneFrontendSam3Values(sceneFrontend).some((value) => value.includes("liveportrait_video_expression"));
    const statusText = isVideoExpression
        ? LIVEPORTRAIT_EXPRESSION_VIDEO_SCENE_STATUS_TEXT
        : LIVEPORTRAIT_EXPRESSION_SCENE_STATUS_TEXT;
    if (row) {
        row.classList.toggle("sai-liveportrait-expression-image-flow", !!active);
        row.dataset.saiLiveportraitExpressionActive = active ? "1" : "0";
    }
    if (active) {
        if (source) {
            source.dataset.saiLiveportraitRole = "source";
            source.setAttribute("title", topbarTranslateText("Upload the source face to Input Image 1."));
        }
        if (reference) {
            reference.dataset.saiLiveportraitRole = "reference";
            reference.setAttribute("title", topbarTranslateText("Optional reference expression image for Input Image 2."));
        }
        if (status) {
            const current = String(status.textContent || "").trim();
            if (status.dataset.saiLiveportraitDefaultStatus === "1" || !current) {
                status.dataset.saiLiveportraitDefaultStatus = "1";
                status.textContent = topbarTranslateText(statusText);
                status.classList.remove("is-error");
            }
        }
    } else {
        [source, reference].forEach((node) => {
            if (!node) return;
            delete node.dataset.saiLiveportraitRole;
            node.removeAttribute("title");
        });
    }
}

const RELIGHT_LIGHT_LABELS = {
    1: ["Top left", "左上"],
    2: ["Top", "上"],
    3: ["Top right", "右上"],
    4: ["Left", "左"],
    5: ["Center", "中心"],
    6: ["Right", "右"],
    7: ["Bottom left", "左下"],
    8: ["Bottom", "下"],
    9: ["Bottom right", "右下"],
    10: ["Random", "随机"],
};

let relightLightControlBound = false;

function getRelightLightControlHost() {
    const app = gradioApp();
    return (app && app.getElementById ? app.getElementById("relight_light_scene_control") : null) || document.getElementById("relight_light_scene_control");
}

function getRelightLightSliderRoot() {
    const app = gradioApp();
    return window.simpaiFindControlById?.("scene_var_number")
        || (app && app.getElementById ? app.getElementById("scene_var_number") : null)
        || document.getElementById("scene_var_number");
}

function relightLightLang(langSource) {
    const source = langSource && typeof langSource === "object" ? langSource : (window.simpleaiTopbarSystemParams || {});
    const raw = String(source.__lang || source.state?.__lang || window.locale_lang || document.documentElement.lang || "").toLowerCase();
    if (raw) return raw.startsWith("en") ? "en" : "cn";
    try {
        if (window.SimpAII18n?.isEnglishUi) return window.SimpAII18n.isEnglishUi() ? "en" : "cn";
    } catch (e) {}
    return "en";
}

function relightLightText(en, cn, langSource) {
    try {
        if (window.SimpAII18n?.t) return window.SimpAII18n.t(en, cn, langSource || window.simpleaiTopbarSystemParams || {});
    } catch (e) {}
    return relightLightLang(langSource) === "en" ? en : cn;
}

function normalizeRelightLightValue(value) {
    const parsed = Number.parseInt(String(value ?? ""), 10);
    if (!Number.isFinite(parsed)) return 10;
    if (parsed >= 1 && parsed <= 10) return parsed;
    return 10;
}

function readRelightLightValue() {
    const root = getRelightLightSliderRoot();
    if (!root) return 10;
    const numberInput = root.querySelector?.('input[type="number"]');
    const rangeInput = root.querySelector?.('input[type="range"]');
    return normalizeRelightLightValue(numberInput?.value ?? rangeInput?.value ?? 10);
}

function writeRelightLightValue(value) {
    const nextValue = normalizeRelightLightValue(value);
    let wrote = false;
    try {
        if (typeof _ro_setSliderValue === "function") {
            wrote = !!_ro_setSliderValue("scene_var_number", nextValue);
        }
    } catch (e) {}
    if (!wrote) {
        const root = getRelightLightSliderRoot();
        const inputs = root ? Array.from(root.querySelectorAll?.('input[type="number"], input[type="range"]') || []) : [];
        inputs.forEach((input) => {
            input.value = String(nextValue);
            input.dispatchEvent(new Event("input", { bubbles: true }));
            input.dispatchEvent(new Event("change", { bubbles: true }));
            wrote = true;
        });
    }
    syncRelightLightControl(window.simpleaiTopbarSystemParams || {});
    return wrote;
}

function bindRelightLightControl() {
    if (relightLightControlBound) return;
    relightLightControlBound = true;
    document.addEventListener("click", (event) => {
        const button = event.target && event.target.closest ? event.target.closest("[data-relight-light-value]") : null;
        if (!button || !button.closest("#relight_light_scene_control")) return;
        event.preventDefault();
        writeRelightLightValue(button.dataset.relightLightValue);
    }, true);
}

function setRelightLightSliderHidden(hidden) {
    const root = getRelightLightSliderRoot();
    if (!root) return false;
    if (hidden) {
        root.dataset.saiRelightHidden = "1";
        root.classList.add("simpai-force-hidden");
        root.setAttribute("aria-hidden", "true");
        root.hidden = true;
        root.style.setProperty("display", "none", "important");
        root.style.setProperty("min-height", "0", "important");
        root.style.setProperty("height", "0", "important");
        root.style.setProperty("margin", "0", "important");
        root.style.setProperty("padding", "0", "important");
        root.style.setProperty("overflow", "hidden", "important");
        return true;
    }
    if (root.dataset.saiRelightHidden === "1") {
        delete root.dataset.saiRelightHidden;
        clearHiddenFlags(root);
    }
    return true;
}

function syncRelightLightControl(langSource) {
    const host = getRelightLightControlHost();
    if (!host) return;
    bindRelightLightControl();
    const lang = relightLightLang(langSource);
    host.querySelectorAll("[data-relight-i18n-en][data-relight-i18n-cn]").forEach((node) => {
        const text = lang === "en" ? node.dataset.relightI18nEn : node.dataset.relightI18nCn;
        if (text) node.textContent = text;
    });
    const value = readRelightLightValue();
    const labelPair = RELIGHT_LIGHT_LABELS[value] || RELIGHT_LIGHT_LABELS[10];
    const status = host.querySelector("[data-relight-light-status]");
    if (status) status.textContent = relightLightText(labelPair[0], labelPair[1], langSource);
    host.querySelectorAll("[data-relight-light-value]").forEach((button) => {
        const buttonValue = normalizeRelightLightValue(button.dataset.relightLightValue);
        const selected = buttonValue === value;
        button.classList.toggle("is-selected", selected);
        button.setAttribute("aria-pressed", selected ? "true" : "false");
        const title = lang === "en" ? button.dataset.relightI18nTitleEn : button.dataset.relightI18nTitleCn;
        if (title) button.setAttribute("title", title);
    });
}

window.syncRelightLightControl = syncRelightLightControl;
window.setRelightLightValue = writeRelightLightValue;

function sceneFrontendSam3Values(sceneFrontend) {
    const values = [];
    const themes = sceneFrontend && sceneFrontend.theme;
    if (Array.isArray(themes)) values.push(...themes);
    else if (themes) values.push(themes);
    const raw = sceneFrontend && sceneFrontend.task_method;
    if (raw && typeof raw === "object" && !Array.isArray(raw)) values.push(...Object.values(raw));
    else if (Array.isArray(raw)) values.push(...raw);
    else if (raw) values.push(raw);
    return values.map((value) => String(value || "").toLowerCase()).filter(Boolean);
}

function sceneFrontendAllThemesSam3(sceneFrontend) {
    const normalized = sceneFrontendSam3Values(sceneFrontend);
    return normalized.length > 0 && normalized.every((value) => value.includes("sam3"));
}

function sceneFrontendHasSam3Option(sceneFrontend) {
    return sceneFrontendSam3Values(sceneFrontend).some((value) => value.includes("sam3"));
}

function sceneTaskMethodNeedsThemeMatch(sceneFrontend) {
    const raw = sceneFrontend && sceneFrontend.task_method;
    return Array.isArray(raw) || !!(raw && typeof raw === "object");
}

function sceneSelectedThemeValue() {
    const panel = document.getElementById("scene_panel");
    if (!panel) return "";
    const checked = panel.querySelector('input[type="radio"]:checked');
    if (!checked) return "";
    return String(checked.value || checked.getAttribute("value") || "");
}

function sceneThemeBelongsToFrontend(sceneFrontend, theme) {
    if (!theme) return false;
    const themes = sceneFrontend && sceneFrontend.theme;
    if (Array.isArray(themes)) return themes.map(String).includes(String(theme));
    if (themes) return String(themes) === String(theme);
    const taskMethod = sceneFrontend && sceneFrontend.task_method;
    return !!(taskMethod && typeof taskMethod === "object" && !Array.isArray(taskMethod) && Object.prototype.hasOwnProperty.call(taskMethod, theme));
}

function sceneTaskMethodForTheme(sceneFrontend, theme) {
    const taskMethod = sceneFrontend && sceneFrontend.task_method;
    if (taskMethod && typeof taskMethod === "object" && !Array.isArray(taskMethod)) {
        if (theme && Object.prototype.hasOwnProperty.call(taskMethod, theme)) {
            return { value: String(taskMethod[theme] || ""), known: true };
        }
        return { value: "", known: false };
    }
    if (Array.isArray(taskMethod)) {
        const themes = sceneFrontend && sceneFrontend.theme;
        if (theme && Array.isArray(themes)) {
            const index = themes.map(String).indexOf(String(theme));
            if (index >= 0 && index < taskMethod.length) {
                return { value: String(taskMethod[index] || ""), known: true };
            }
        }
        return taskMethod.length ? { value: String(taskMethod[0] || ""), known: true } : { value: "", known: false };
    }
    if (taskMethod) return { value: String(taskMethod || ""), known: true };
    return { value: "", known: false };
}

function sceneSam3VisibilityDecision(sceneFrontend, theme, taskMethod) {
    const rawHidden = sceneFrontend && sceneFrontend.disvisible;
    const hidden = new Set(
        (Array.isArray(rawHidden) ? rawHidden : String(rawHidden || "").split(","))
            .map((value) => String(value || "").trim())
            .filter(Boolean)
    );
    if (["sam3_video_mask_accordion", "sam3_input_video", "sam3_mask_video"].some((key) => hidden.has(key))) {
        return false;
    }
    const rawEnabled = sceneFrontend && sceneFrontend.divisible;
    const enabled = new Set(Array.isArray(rawEnabled) ? rawEnabled.map(String) : []);
    const inputsExplicitlyEnabled = ["sam3_input_video", "sam3_mask_video"].some((key) => enabled.has(key));
    const selected = sceneSelectedThemeValue();
    const currentTheme = selected && sceneThemeBelongsToFrontend(sceneFrontend, selected) ? selected : theme;
    const byTheme = sceneTaskMethodForTheme(sceneFrontend, currentTheme);
    if (byTheme.known) return byTheme.value.toLowerCase().includes("sam3") || inputsExplicitlyEnabled;
    if (sceneFrontendAllThemesSam3(sceneFrontend || {})) return true;
    const hasSam3Option = sceneFrontendHasSam3Option(sceneFrontend || {});
    if (selected && hasSam3Option && !sceneThemeBelongsToFrontend(sceneFrontend, selected)) {
        return selected.toLowerCase().includes("sam3");
    }
    const taskText = sceneTaskMethodNeedsThemeMatch(sceneFrontend || {}) ? "" : String(taskMethod || "").toLowerCase();
    if (taskText) return taskText.includes("sam3") || inputsExplicitlyEnabled;
    const themeText = String(currentTheme || selected || "").toLowerCase();
    return themeText.includes("sam3") || inputsExplicitlyEnabled;
}

function reconcileSceneAuxControlsFromValues(isScene, theme, taskMethod, disvisible, langSource) {
    const themeText = String(theme || "").toLowerCase();
    const taskText = String(taskMethod || "").toLowerCase();
    const hidden = sceneDisvisibleSetFromValue(disvisible);
    const sceneFrontend = langSource && typeof langSource === "object" ? langSource.scene_frontend : null;
    const sam3Decision = sceneSam3VisibilityDecision(sceneFrontend, theme, taskMethod);
    const showCamera = !!(isScene && themeText.includes("multiangle") && !hidden.has("camera_control_accordion"));
    const showLight = !!(isScene && (themeText.includes("anglelight") || themeText.includes("lightning")) && !hidden.has("anglelight_control_accordion"));
    const showStyle = !!(isScene && themeText.includes("flux2_styletransfer") && !hidden.has("style_transfer_accordion"));
    const showSam3 = sam3Decision === null ? null : !!((isScene || sam3Decision) && sam3Decision && !hidden.has("sam3_video_mask_accordion"));
    const showPoseStudio = !!(isScene && (themeText.includes("pose") || taskText.includes("pose")) && !hidden.has("pose_studio"));
    const gaussianMarkers = ["gaussian", "3dgs", "splat", "sharp"];
    const showGaussianStudio = !!(isScene && gaussianMarkers.some((marker) => themeText.includes(marker) || taskText.includes(marker)) && !hidden.has("gaussian_studio"));
    const liveportraitMarkers = ["liveportrait", "advancedliveportrait"];
    const showLivePortraitExpression = !!(isScene && liveportraitMarkers.some((marker) => themeText.includes(marker) || taskText.includes(marker)) && !hidden.has("liveportrait_expression"));
    const showRelightLight = !!(isScene && (themeText.includes("relight") || taskText.includes("relight")) && !hidden.has("relight_light_control"));
    const presetName = String((langSource && (langSource.__preset || langSource.preset)) || "").trim();
    const presetNameLower = presetName.toLowerCase();
    const showLtxGuideControl = !!(isScene
        && (taskText.includes("ltx2.3_i2v") || taskText.includes("ltx2.3_ia2v") || taskText.includes("ltx2.3_extent") || /ltx2\.3\s*\((i2v|ia2v|extent)\)/.test(presetNameLower))
        && !hidden.has("ltx_guide_control"));
    const showCloudImageApi = !!(isScene && presetName === "GeneralAPIImage");
    const engineText = String((langSource && (langSource.backend_engine || langSource.engine)) || "").toLowerCase();
    const wanCameraMotion = ["uni3c"].some((marker) => themeText.includes(marker) || taskText.includes(marker) || engineText.includes(marker));
    const showCameraMotionReference = !!(isScene && wanCameraMotion && !hidden.has("scene_reference_video"));
    setSceneAuxControlVisible("camera_control_accordion", showCamera);
    setSceneAuxControlVisible("camera_motion_reference_accordion", showCameraMotionReference);
    setSceneAuxControlVisible("anglelight_control_accordion", showLight);
    setSceneAuxControlVisible("style_transfer_accordion", showStyle);
    if (showSam3 !== null) {
        setSceneAuxControlVisible("sam3_video_mask_accordion", showSam3);
    }
    setSceneAuxControlVisible("pose_studio", showPoseStudio);
    setSceneAuxControlVisible("gaussian_studio", showGaussianStudio);
    setSceneAuxControlVisible("liveportrait_expression", showLivePortraitExpression);
    setLtxGuideControlVisible(showLtxGuideControl, langSource);
    setSceneAuxControlVisible("relight_light_control", showRelightLight);
    setSceneAuxControlVisible("scene_cloud_image_api", showCloudImageApi);
    setRelightLightSliderHidden(showRelightLight);
    setGaussianStudioSceneImageMode(showGaussianStudio, langSource);
    setLivePortraitExpressionSceneImageMode(showLivePortraitExpression, langSource);
    if (showRelightLight) syncRelightLightControl(langSource);
    if (!showPoseStudio && window.SimpAIPoseStudioEditor?.closeScenePreset) {
        try { window.SimpAIPoseStudioEditor.closeScenePreset(); } catch (e) {}
    }
    if (!showGaussianStudio && window.SimpAIGaussianStudioEditor?.closeScenePreset) {
        try { window.SimpAIGaussianStudioEditor.closeScenePreset(); } catch (e) {}
    }
    if (!showLivePortraitExpression && window.SimpAILivePortraitExpressionEditor?.closeScenePreset) {
        try { window.SimpAILivePortraitExpressionEditor.closeScenePreset(); } catch (e) {}
    }
}

function reconcileSceneAuxControls(state, theme) {
    const isScene = !!(state && typeof state === "object" && state.scene_frontend);
    let resolvedTheme = theme || (state && state.scene_theme) || "";
    const sceneFrontend = state && typeof state === "object" ? state.scene_frontend : null;
    if (!resolvedTheme && sceneFrontend && typeof sceneFrontend === "object") {
        const themes = sceneFrontend.theme;
        if (typeof themes === "string") resolvedTheme = themes;
        else if (Array.isArray(themes) && themes.length) resolvedTheme = themes[0];
    }
    const resolvedHidden = Array.isArray(state && state.__scene_disvisible)
        ? state.__scene_disvisible
        : (sceneFrontend && sceneFrontend.disvisible);
    reconcileSceneAuxControlsFromValues(isScene, resolvedTheme, getSceneTaskMethodFromState(state, resolvedTheme), resolvedHidden, state);
}

function refresh_topbar_status_js_for_preset_nav(system_params) {
    const presetSwitched = !!(system_params && system_params.__preset_switched);
    if (isStaleSystemParamsForPreset(system_params)) {
        try {
            simpaiUiTrace("log", "[UI-TRACE] preset_nav_js.skip_stale_preset", {
                incoming: system_params && system_params["__preset"],
                pending: topbarPendingPreset,
                latest: topbarLastPreset,
            });
        } catch (e) {}
        return;
    }
    if (presetSwitched) {
        scheduleCloseSimpleAIOpenGalleriesForPresetSwitch("preset_nav_status");
    }

    try {
        refresh_topbar_status_js(system_params);
    } catch (e) {
        console.error('[UI-TRACE] preset_nav_js.refresh_topbar_status_js_failed', e);
    }

    try {
        if (typeof notify_style_state_changed === 'function') {
            notify_style_state_changed('preset_nav');
        } else {
            if (typeof refresh_style_localization === 'function') {
                refresh_style_localization();
            }
            if (typeof refresh_style_layout === 'function') {
                refresh_style_layout();
                setTimeout(refresh_style_layout, 120);
                setTimeout(refresh_style_layout, 500);
            }
        }
    } catch (e) {
        console.error('[UI-TRACE] preset_nav_js.style_refresh_failed', e);
    }

    try {
        if (typeof refresh_scene_localization === 'function') {
            refresh_scene_localization();
        }
    } catch (e) {
        console.error('[UI-TRACE] preset_nav_js.scene_localization_failed', e);
    }

    try {
        reconcileSceneVisibilityForPreset(system_params);
        scheduleMainModelDropdownVisibilityReconcile(system_params, "preset_nav");
        setTimeout(() => reconcileSceneVisibilityForPreset(system_params), 60);
        setTimeout(() => reconcileSceneVisibilityForPreset(system_params), 260);
    } catch (e) {
        console.error('[UI-TRACE] preset_nav_js.scene_visibility_reconcile_failed', e);
    }

    try {
        scheduleScenePanelVisibilityRepair(system_params, "preset_nav_status");
    } catch (e) {
        console.error('[UI-TRACE] preset_nav_js.scene_panel_repair_failed', e);
    }

    try {
        finishPresetNavProgress(system_params && system_params["__preset"]);
    } catch (e) {
        console.error('[UI-TRACE] preset_nav_js.finish_progress_failed', e);
    }

    if (presetSwitched) {
        SIMPLEAI_PRESET_SWITCH_STATUS_RETRY_DELAYS.forEach((delay) => {
            setTimeout(() => closeSimpleAIOpenGalleriesForPresetSwitch(`preset_nav_status.after+${delay}ms`), delay);
        });
    }

}

function scheduleScenePanelVisibilityRepair(system_params, traceLabel) {
    if (!system_params || typeof system_params !== "object" || !system_params.__is_scene_frontend) return;
    const expectedPreset = normalizePresetName(system_params.__preset);
    const apply = () => {
        const current = window.simpleaiTopbarSystemParams
            || (typeof topbarLastSystemParams !== "undefined" ? topbarLastSystemParams : null)
            || null;
        const currentPreset = normalizePresetName(current && current.__preset);
        if (expectedPreset && currentPreset && expectedPreset !== currentPreset) return;
        try { setPresetNavSceneSuppressed(false); } catch (e) {}
        try { setPanelVisibleById("scene_panel", true); } catch (e) {}
        try {
            if (typeof window.syncGradio6MountedDynamicVisibility === "function") {
                window.syncGradio6MountedDynamicVisibility(`${traceLabel || "scene_panel_repair"}.mounted`);
            }
        } catch (e) {}
    };
    [0, 180, 560, 1000].forEach((delay) => setTimeout(apply, delay));
}

function scheduleMissingModelCheckHintSync(system_params, traceLabel) {
    try {
        if (typeof syncMissingModelCheckHint !== 'function') return;
        syncMissingModelCheckHint(system_params);
        setTimeout(() => syncMissingModelCheckHint(system_params), 120);
        setTimeout(() => syncMissingModelCheckHint(system_params), 420);
    } catch (e) {
        console.warn('[UI-TRACE] missing_model_hint.sync_failed', traceLabel, e);
    }
}

function getActiveGalleryMediaSwitchLock() {
    const now = Date.now();
    if (galleryMediaSwitchLockedMode && now >= galleryMediaSwitchLockedUntil) {
        galleryMediaSwitchLockedMode = null;
        galleryMediaSwitchLockedUntil = 0;
    }
    if (galleryMediaSwitchLockedMode && now < galleryMediaSwitchLockedUntil) {
        return {
            mode: galleryMediaSwitchLockedMode,
            until: galleryMediaSwitchLockedUntil,
            remaining: Math.max(0, galleryMediaSwitchLockedUntil - now),
        };
    }
    return null;
}

function shouldSkipGalleryMediaSwitchCallback(mode, guard) {
    const normalizedMode = mode === "video" ? "video" : "image";
    const current = window.__simpleaiGalleryMediaSwitchRequest || null;
    const activeLock = getActiveGalleryMediaSwitchLock();
    const checkedGuard = guard || {};
    if (checkedGuard.guarded && checkedGuard.requestMarker && current && current.marker && current.marker !== checkedGuard.requestMarker) {
        return true;
    }
    if (checkedGuard.guarded && checkedGuard.requestMode && current && current.mode && current.mode !== checkedGuard.requestMode) {
        return true;
    }
    if (activeLock && activeLock.mode !== normalizedMode) {
        return true;
    }
    return false;
}

function syncGalleryMediaSwitch(engineType, lockMs, source) {
    const inputEngineType = engineType;
    let mode = getFinishedGalleryBrowserMode(engineType);
    const now = Date.now();
    if (lockMs) {
        galleryMediaSwitchLockedMode = mode;
        galleryMediaSwitchLockedUntil = now + lockMs;
        try {
            window.__simpleaiGalleryMediaSwitchSuppressRefresh = {
                mode,
                until: galleryMediaSwitchLockedUntil,
            };
        } catch (e) {}
    } else {
        const activeLock = getActiveGalleryMediaSwitchLock();
        if (activeLock) mode = activeLock.mode;
    }
    if (topbarLastSystemParams && typeof topbarLastSystemParams === "object") {
        topbarLastSystemParams.__gallery_engine_type = mode;
    }
    if (window.simpleaiTopbarSystemParams && typeof window.simpleaiTopbarSystemParams === "object") {
        window.simpleaiTopbarSystemParams.__gallery_engine_type = mode;
    }
    const app = typeof gradioApp === "function" ? gradioApp() : document;
    const root = (app.getElementById ? app.getElementById("gallery_media_switch_row") : null) || document.getElementById("gallery_media_switch_row");
    if (!root) return;
    root.dataset.mode = mode;
    root.querySelectorAll("button").forEach((button) => {
        const isVideo = button.id === "gallery_videos_btn";
        const active = mode === (isVideo ? "video" : "image");
        simpleAIGalleryBrowserSetButtonText(button, isVideo ? "Videos" : "Images", isVideo ? "视频" : "图片");
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", active ? "true" : "false");
    });
}
window.syncGalleryMediaSwitch = syncGalleryMediaSwitch;

function beginGalleryMediaSwitchRequest(mode, lockMs) {
    const normalizedMode = mode === "video" ? "video" : "image";
    const seq = (Number(window.__simpleaiGalleryMediaSwitchSeq || 0) || 0) + 1;
    window.__simpleaiGalleryMediaSwitchSeq = seq;
    const marker = `${Date.now()}:${seq}:${normalizedMode}`;
    window.__simpleaiGalleryMediaSwitchRequest = {
        mode: normalizedMode,
        marker,
        startedAt: Date.now(),
    };
    syncGalleryMediaSwitch(normalizedMode, lockMs || 1500, "user_request");
    try {
        if (isFinishedGalleryBrowserRequestBusy()) {
            cancelFinishedGalleryBrowserPendingRequest(`media_switch_request_busy_${normalizedMode}`, { mediaType: normalizedMode });
        }
    } catch (e) {}
    return marker;
}
window.beginGalleryMediaSwitchRequest = beginGalleryMediaSwitchRequest;

function isGalleryMediaSwitchModeCurrent(mode) {
    const normalizedMode = mode === "video" ? "video" : "image";
    const request = window.__simpleaiGalleryMediaSwitchRequest;
    return !request || !request.mode || request.mode === normalizedMode;
}
window.isGalleryMediaSwitchModeCurrent = isGalleryMediaSwitchModeCurrent;

function getFinishedGalleryBrowserElement(id) {
    try {
        const app = typeof gradioApp === "function" ? gradioApp() : document;
        return (app && app.getElementById ? app.getElementById(id) : null) || document.getElementById(id);
    } catch (e) {
        return document.getElementById(id);
    }
}

function isFinishedGalleryNativeToolbarExpected() {
    try {
        const components = window.gradio_config && Array.isArray(window.gradio_config.components)
            ? window.gradio_config.components
            : null;
        if (!components) return true;
        return components.some((component) => component && component.props && component.props.elem_id === "gallery_browser_toolbar");
    } catch (e) {
        return true;
    }
}

function getFinishedGalleryBrowserMode(preferred) {
    if (preferred === "video" || preferred === "image") return preferred;
    const activeLock = getActiveGalleryMediaSwitchLock();
    if (activeLock && (activeLock.mode === "video" || activeLock.mode === "image")) return activeLock.mode;
    const switchRoot = getFinishedGalleryBrowserElement("gallery_media_switch_row");
    if (switchRoot) {
        const activeButton = switchRoot.querySelector("#gallery_videos_btn.active, #gallery_videos_btn[aria-pressed='true'], #gallery_images_btn.active, #gallery_images_btn[aria-pressed='true']");
        if (activeButton && activeButton.id === "gallery_videos_btn") return "video";
        if (activeButton && activeButton.id === "gallery_images_btn") return "image";
        if (switchRoot.dataset && switchRoot.dataset.mode === "video") return "video";
        if (switchRoot.dataset && switchRoot.dataset.mode === "image") return "image";
    }
    const params = topbarLastSystemParams || window.simpleaiTopbarSystemParams || {};
    if (params && (params.__gallery_engine_type === "video" || params.engine_type === "video")) return "video";
    if (params && (params.__gallery_engine_type === "image" || params.engine_type === "image")) return "image";
    return "image";
}

function readGalleryBrowserFolderValue(root) {
    if (!root) return "";
    const datasetValue = root.dataset && (root.dataset.simpleaiGalleryBrowserFolder || root.dataset.saiFolderLabel);
    if (datasetValue) return String(datasetValue || "").trim();
    const attrValue = root.getAttribute("data-value") || root.getAttribute("data-sai-folder-label");
    if (attrValue) return String(attrValue || "").trim();
    const input = root.querySelector('input[role="listbox"], input');
    const raw = input ? (input.value || input.getAttribute("value") || "") : "";
    const value = String(raw || "").trim();
    if (value) return value;
    const params = topbarLastSystemParams || window.simpleaiTopbarSystemParams || {};
    const stateValue = String(params && params.__main_gallery_browser_folder || "").trim();
    if (stateValue) return stateValue;
    return "";
}

function syncGalleryBrowserFolderDisplay() {
    const root = getFinishedGalleryBrowserElement("gallery_browser_folder");
    if (!root) return false;
    const value = readGalleryBrowserFolderValue(root);
    if (value) {
        persistFinishedGalleryBrowserFolder(value);
        root.dataset.simpleaiGalleryBrowserFolder = value;
        root.setAttribute("data-sai-folder-label", value);
        root.setAttribute("data-value", value);
        root.setAttribute("title", value);
    } else {
        delete root.dataset.simpleaiGalleryBrowserFolder;
        root.removeAttribute("data-sai-folder-label");
        root.removeAttribute("data-value");
        root.removeAttribute("title");
    }
    return true;
}

function scheduleGalleryBrowserFolderDisplaySync() {
    if (finishedGalleryBrowserFolderDisplayRaf) return;
    finishedGalleryBrowserFolderDisplayRaf = requestAnimationFrame(() => {
        finishedGalleryBrowserFolderDisplayRaf = 0;
        syncGalleryBrowserFolderDisplay();
        setTimeout(syncGalleryBrowserFolderDisplay, 80);
    });
}

function bindGalleryBrowserFolderDisplay() {
    const root = getFinishedGalleryBrowserElement("gallery_browser_folder");
    if (!root) return false;
    root.classList.add("simpleai-gallery-browser-folder-overlay");
    if (!root.__simpleaiFolderDisplayObserver) {
        root.__simpleaiFolderDisplayObserver = new MutationObserver(scheduleGalleryBrowserFolderDisplaySync);
        root.__simpleaiFolderDisplayObserver.observe(root, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ["value", "aria-expanded", "class", "style"]
        });
    }
    const input = root.querySelector('input[role="listbox"], input');
    if (input && root.__simpleaiFolderDisplayInput !== input) {
        root.__simpleaiFolderDisplayInput = input;
        ["input", "change", "blur", "keyup", "mouseup"].forEach((eventName) => {
            input.addEventListener(eventName, scheduleGalleryBrowserFolderDisplaySync);
        });
    }
    scheduleGalleryBrowserFolderDisplaySync();
    return true;
}

function getFinishedGalleryGridWrap() {
    const gallery = getFinishedGalleryBrowserElement("finished_gallery");
    return gallery ? gallery.querySelector(".grid-wrap") : null;
}

function parseFinishedGalleryBrowserState(value) {
    if (!value) return null;
    if (typeof value === "object") return value;
    try {
        return JSON.parse(value);
    } catch (e) {
        return null;
    }
}

function normalizeFinishedGalleryBrowserFolderValue(value) {
    return String(value || "").trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

function getFinishedGalleryBrowserControlElements(root) {
    if (!root) return [];
    const elements = [];
    try {
        if (root.matches && root.matches("button, input, select, textarea")) elements.push(root);
    } catch (e) {}
    try {
        root.querySelectorAll("button, input, select, textarea").forEach((node) => elements.push(node));
    } catch (e) {}
    return Array.from(new Set(elements));
}

function setFinishedGalleryBrowserControlDisabled(root, disabled) {
    if (!root) return false;
    const blocked = !!disabled;
    try { root.classList.toggle("is-disabled", blocked); } catch (e) {}
    try { root.setAttribute("aria-disabled", blocked ? "true" : "false"); } catch (e) {}
    getFinishedGalleryBrowserControlElements(root).forEach((node) => {
        try { node.disabled = blocked; } catch (e) {}
        try { node.setAttribute("aria-disabled", blocked ? "true" : "false"); } catch (e) {}
    });
    return true;
}

function isFinishedGalleryBrowserRequestBusy() {
    return !!(finishedGalleryBrowserState && (finishedGalleryBrowserState.loading || finishedGalleryBrowserState.pendingPayload));
}

function clearFinishedGalleryBrowserRequestWatchdog() {
    try { window.clearTimeout(finishedGalleryBrowserRequestWatchdogTimer); } catch (e) {}
    finishedGalleryBrowserRequestWatchdogTimer = null;
}

function scheduleFinishedGalleryBrowserRequestWatchdog(requestId, reason, timeoutMs) {
    const expectedRequestId = Number(requestId || 0);
    if (!expectedRequestId) return false;
    clearFinishedGalleryBrowserRequestWatchdog();
    finishedGalleryBrowserRequestWatchdogTimer = window.setTimeout(() => {
        finishedGalleryBrowserRequestWatchdogTimer = null;
        if (Number(finishedGalleryBrowserState.activeRequestId || 0) !== expectedRequestId) return;
        if (!isFinishedGalleryBrowserRequestBusy()) return;
        const renderedCount = countExistingFinishedGalleryMedia();
        cancelFinishedGalleryBrowserPendingRequest("gallery_browser_request_timeout", { clearStatus: false });
        if (renderedCount > 0) {
            setFinishedGalleryBrowserHasMediaState(true, "gallery_browser_request_timeout");
            try { releaseFinishedGalleryWelcomeGuard(true, "gallery_browser_request_timeout"); } catch (e) {}
        }
        setFinishedGalleryBrowserStatus(getFinishedGalleryBrowserStableStatusText());
        simpaiUiTrace("warn", "[UI-TRACE] gallery_browser.request_watchdog_timeout", {
            reason: reason || "gallery_browser_request",
            request_id: expectedRequestId,
            renderedCount,
        });
    }, Number(timeoutMs || 15000));
    return true;
}

function cancelFinishedGalleryBrowserPendingRequest(reason, options) {
    if (!finishedGalleryBrowserState) return false;
    const hadBusy = !!(finishedGalleryBrowserState.loading || finishedGalleryBrowserState.pendingPayload || finishedGalleryBrowserState.queuedOptions);
    if (!hadBusy) return false;
    const opts = options || {};
    const nextRequestId = ++finishedGalleryBrowserRequestSeq;
    try { window.clearTimeout(finishedGalleryBrowserBridgeRetryTimer); } catch (e) {}
    finishedGalleryBrowserBridgeRetryTimer = null;
    clearFinishedGalleryBrowserRequestWatchdog();
    finishedGalleryBrowserState.activeRequestId = nextRequestId;
    finishedGalleryBrowserState.loading = false;
    finishedGalleryBrowserState.pendingPayload = null;
    finishedGalleryBrowserState.queuedOptions = null;
    finishedGalleryBrowserState.bridgeRetryCount = 0;
    finishedGalleryBrowserPreloadInFlight = false;
    if (opts.mediaType) finishedGalleryBrowserState.mediaType = getFinishedGalleryBrowserMode(opts.mediaType);
    if (opts.clearStatus !== false) setFinishedGalleryBrowserStatus("");
    syncFinishedGalleryBrowserMoreButton();
    simpaiUiTrace("log", "[UI-TRACE] gallery_browser.pending_request_cancelled", {
        reason: reason || "request_cancel",
        requestId: nextRequestId,
        mediaType: finishedGalleryBrowserState.mediaType || "",
    });
    return true;
}
window.cancelFinishedGalleryBrowserPendingRequest = cancelFinishedGalleryBrowserPendingRequest;

function isFinishedGalleryBrowserBusyGuardTarget(target) {
    if (!target || !target.closest) return false;
    return !!target.closest([
        "#gallery_browser_folder",
        "#gallery_browser_prev_folder_btn",
        "#gallery_browser_next_folder_btn",
        "#gallery_browser_refresh_btn",
        "#gallery_browser_more_btn",
        "#gallery_images_btn",
        "#gallery_videos_btn",
        "#finished_gallery_browser_panel [data-gallery-browser-folder]",
        "#finished_gallery_browser_panel [data-gallery-browser-refresh]",
        "#finished_gallery_browser_panel [data-gallery-browser-more]",
    ].join(","));
}

function currentFinishedGalleryBrowserFolderForAction() {
    const params = window.simpleaiTopbarSystemParams || {};
    return normalizeFinishedGalleryBrowserFolderValue(
        (finishedGalleryBrowserState && (finishedGalleryBrowserState.userFolder || finishedGalleryBrowserState.folder))
        || params.__main_gallery_browser_folder
        || ""
    );
}

function refreshFinishedGalleryBrowserLatest(options, reason) {
    const opts = Object.assign({
        reset: true,
        force: true,
        preferBridge: true,
        replaceActive: true,
        silentStatus: true,
    }, options || {});
    simpaiUiTrace("log", "[UI-TRACE] gallery_browser.latest_request", {
        reason: reason || "latest_request",
        folder: opts.folder || "",
        mediaType: opts.mediaType || "",
    });
    return refreshFinishedGalleryBrowser(opts);
}

function handleFinishedGalleryBrowserBusyInteraction(event) {
    const target = event && event.target ? event.target : null;
    if (!target || !target.closest) return false;
    const currentFolder = currentFinishedGalleryBrowserFolderForAction();
    const folders = Array.isArray(finishedGalleryBrowserState && finishedGalleryBrowserState.folders) ? finishedGalleryBrowserState.folders : [];
    const prevButton = target.closest("#gallery_browser_prev_folder_btn");
    if (prevButton) {
        const folder = computeFinishedGalleryBrowserStepTargetFolder(currentFolder, folders, "gallery_browser.folder.prev");
        if (folder) return refreshFinishedGalleryBrowserLatest({ folder }, "busy_prev_folder");
        return true;
    }
    const nextButton = target.closest("#gallery_browser_next_folder_btn");
    if (nextButton) {
        const folder = computeFinishedGalleryBrowserStepTargetFolder(currentFolder, folders, "gallery_browser.folder.next");
        if (folder) return refreshFinishedGalleryBrowserLatest({ folder }, "busy_next_folder");
        return true;
    }
    if (target.closest("#gallery_browser_refresh_btn, #finished_gallery_browser_panel [data-gallery-browser-refresh]")) {
        return refreshFinishedGalleryBrowserLatest({ folder: currentFolder }, "busy_refresh");
    }
    if (target.closest("#gallery_images_btn")) {
        return refreshFinishedGalleryBrowserLatest({ folder: currentFolder, mediaType: "image" }, "busy_media_image");
    }
    if (target.closest("#gallery_videos_btn")) {
        return refreshFinishedGalleryBrowserLatest({ folder: currentFolder, mediaType: "video" }, "busy_media_video");
    }
    if (event && event.type === "change") {
        const folderRoot = target.closest("#gallery_browser_folder, #finished_gallery_browser_panel [data-gallery-browser-folder]");
        if (folderRoot) {
            const value = normalizeFinishedGalleryBrowserFolderValue(target.value || readGalleryBrowserFolderValue(folderRoot) || "");
            if (value) return refreshFinishedGalleryBrowserLatest({ folder: value }, "busy_folder_change");
        }
    }
    if (target.closest("#gallery_browser_more_btn, #finished_gallery_browser_panel [data-gallery-browser-more]")) {
        return true;
    }
    return false;
}

function guardFinishedGalleryBrowserBusyInteraction(event) {
    if (!isFinishedGalleryBrowserRequestBusy()) return;
    if (event && event.type === "keydown" && !["Enter", " "].includes(event.key || "")) return;
    const target = event && event.target ? event.target : null;
    if (!isFinishedGalleryBrowserBusyGuardTarget(target)) return;
    if (target && target.closest && target.closest("#gallery_browser_folder, #finished_gallery_browser_panel [data-gallery-browser-folder]") && event.type !== "change") return;
    const handled = handleFinishedGalleryBrowserBusyInteraction(event);
    try { event.preventDefault(); } catch (e) {}
    try { event.stopPropagation(); } catch (e) {}
    try { event.stopImmediatePropagation(); } catch (e) {}
    simpaiUiTrace("log", "[UI-TRACE] gallery_browser.busy_control_interaction_replaced", {
        type: event && event.type ? event.type : "",
        handled: !!handled,
    });
}

function bindFinishedGalleryBrowserBusyControlGuard() {
    const app = typeof gradioApp === "function" ? gradioApp() : document;
    const root = app || document;
    if (!root || root.__simpleaiGalleryBrowserBusyGuardBound) return false;
    root.__simpleaiGalleryBrowserBusyGuardBound = true;
    window.__simpleaiGalleryBrowserBusyGuardBound = true;
    ["click", "keydown", "change"].forEach((eventName) => {
        try { root.addEventListener(eventName, guardFinishedGalleryBrowserBusyInteraction, true); } catch (e) {}
    });
    return true;
}

function getFinishedGalleryBrowserStatusRoot() {
    return document.querySelector("#finished_gallery_browser_panel [data-gallery-browser-status]")
        || getFinishedGalleryBrowserElement("gallery_browser_status")
        || document.getElementById("gallery_browser_status");
}

function getFinishedGalleryBrowserStatusTarget(status) {
    if (!status) return null;
    return status.querySelector ? (status.querySelector(".prose, .md, p") || status) : status;
}

function isFinishedGalleryBrowserLoadingText(text) {
    return /Loading|加载中|继续加载/i.test(String(text || ""));
}

function getFinishedGalleryBrowserStableStatusText() {
    const status = getFinishedGalleryBrowserStatusRoot();
    const statusText = status ? String(status.textContent || "").trim() : "";
    if (statusText && !isFinishedGalleryBrowserLoadingText(statusText)) return statusText;
    const loaded = Number(finishedGalleryBrowserState && finishedGalleryBrowserState.loaded || 0);
    if (Number.isFinite(loaded)) {
        return simpleAIGalleryBrowserCountStatus(Math.max(0, loaded), finishedGalleryBrowserState && finishedGalleryBrowserState.mediaType);
    }
    return "";
}

function applyFinishedGalleryBrowserSilentLoadingStatus(reason) {
    if (finishedGalleryBrowserStatusObserverApplying) return false;
    if (Date.now() >= finishedGalleryBrowserSilentLoadingUntil) return false;
    const status = getFinishedGalleryBrowserStatusRoot();
    const target = getFinishedGalleryBrowserStatusTarget(status);
    if (!target) return false;
    const currentText = String(target.textContent || "");
    if (!isFinishedGalleryBrowserLoadingText(currentText)) return false;
    finishedGalleryBrowserStatusObserverApplying = true;
    try {
        target.textContent = finishedGalleryBrowserSilentLoadingText || "";
        if (status) status.classList.toggle("is-error", false);
        simpaiUiTrace("log", "[UI-TRACE] gallery_browser.loading_status_suppressed", {
            reason: reason || "gallery_browser_status",
            text: currentText,
        });
    } catch (e) {
    } finally {
        finishedGalleryBrowserStatusObserverApplying = false;
    }
    return true;
}

function syncFinishedGalleryBrowserBusyClassFromStatus(reason) {
    const status = getFinishedGalleryBrowserStatusRoot();
    const statusText = status ? String(status.textContent || "").trim() : "";
    if (isFinishedGalleryBrowserLoadingText(statusText)) return false;
    if (isFinishedGalleryBrowserRequestBusy()) return false;
    if (!document.documentElement.classList.contains("simpai-gallery-browser-request-busy")) return false;
    syncFinishedGalleryBrowserMoreButton();
    simpaiUiTrace("log", "[UI-TRACE] gallery_browser.busy_class_released_from_status", {
        reason: reason || "status_sync",
        status: statusText,
    });
    return true;
}

function installFinishedGalleryBrowserStatusObserver() {
    if (typeof MutationObserver !== "function") return false;
    const status = getFinishedGalleryBrowserStatusRoot();
    if (!status) return false;
    if (finishedGalleryBrowserStatusObserver && finishedGalleryBrowserStatusObservedRoot === status) return true;
    if (finishedGalleryBrowserStatusObserver) {
        try { finishedGalleryBrowserStatusObserver.disconnect(); } catch (e) {}
    }
    finishedGalleryBrowserStatusObservedRoot = status;
    finishedGalleryBrowserStatusObserver = new MutationObserver(() => {
        const suppressed = applyFinishedGalleryBrowserSilentLoadingStatus("status_mutation");
        if (!suppressed) syncFinishedGalleryBrowserBusyClassFromStatus("status_mutation");
    });
    try {
        finishedGalleryBrowserStatusObserver.observe(status, { childList: true, characterData: true, subtree: true });
        return true;
    } catch (e) {
        finishedGalleryBrowserStatusObservedRoot = null;
        finishedGalleryBrowserStatusObserver = null;
        return false;
    }
}

function beginFinishedGalleryBrowserSilentLoadingStatus(text, durationMs) {
    finishedGalleryBrowserSilentLoadingText = String(text || "");
    finishedGalleryBrowserSilentLoadingUntil = Date.now() + Math.max(400, Number(durationMs || 2600));
    installFinishedGalleryBrowserStatusObserver();
    applyFinishedGalleryBrowserSilentLoadingStatus("silent_begin");
}

function getFinishedGalleryBrowserLoadingStatusKey(text) {
    const pending = finishedGalleryBrowserState && finishedGalleryBrowserState.pendingPayload;
    const mediaType = getFinishedGalleryBrowserMode(
        (pending && pending.media_type)
        || (finishedGalleryBrowserState && finishedGalleryBrowserState.mediaType)
    );
    const folder = normalizeFinishedGalleryBrowserFolderValue(
        (pending && pending.folder)
        || (finishedGalleryBrowserState && (finishedGalleryBrowserState.userFolder || finishedGalleryBrowserState.folder))
        || ""
    );
    const requestId = Number(
        (pending && pending.request_id)
        || (finishedGalleryBrowserState && finishedGalleryBrowserState.activeRequestId)
        || 0
    );
    const phase = /more/i.test(String(text || "")) ? "more" : "reset";
    return [requestId || "current", mediaType || "image", folder || "recent", phase].join("|");
}

function isFinishedGalleryBrowserSamePendingRequest(mediaType, folder, reset) {
    const pending = finishedGalleryBrowserState && finishedGalleryBrowserState.pendingPayload;
    if (!finishedGalleryBrowserState || !finishedGalleryBrowserState.loading || !pending) return false;
    const pendingMode = getFinishedGalleryBrowserMode(pending.media_type || finishedGalleryBrowserState.mediaType);
    const targetMode = getFinishedGalleryBrowserMode(mediaType || finishedGalleryBrowserState.mediaType);
    if (pendingMode !== targetMode) return false;
    const pendingFolder = normalizeFinishedGalleryBrowserFolderValue(pending.folder || finishedGalleryBrowserState.userFolder || finishedGalleryBrowserState.folder || "");
    const targetFolder = normalizeFinishedGalleryBrowserFolderValue(folder || "");
    if (pendingFolder && targetFolder && pendingFolder !== targetFolder) return false;
    const pendingReset = pending.reset !== false;
    return pendingReset === (reset !== false);
}

function setFinishedGalleryBrowserStatus(text, isError) {
    const status = getFinishedGalleryBrowserStatusRoot();
    if (!status) return;
    if (isError && /bridge/i.test(String(text || ""))) {
        text = "";
        isError = false;
    }
    text = simpleAIGalleryBrowserStatusText(text, finishedGalleryBrowserState && finishedGalleryBrowserState.mediaType);
    const target = getFinishedGalleryBrowserStatusTarget(status);
    if (!target) return;
    const currentText = String(target.textContent || "");
    const loadingText = isFinishedGalleryBrowserLoadingText(text);
    if (loadingText && Date.now() < finishedGalleryBrowserSilentLoadingUntil) {
        const preservedText = finishedGalleryBrowserSilentLoadingText || (isFinishedGalleryBrowserLoadingText(currentText) ? "" : currentText);
        beginFinishedGalleryBrowserSilentLoadingStatus(preservedText, 2600);
        return;
    }
    if (!loadingText && text) {
        finishedGalleryBrowserSilentLoadingUntil = 0;
        finishedGalleryBrowserSilentLoadingText = "";
        if (!finishedGalleryBrowserState.loading && !finishedGalleryBrowserState.pendingPayload) {
            finishedGalleryBrowserVisibleLoadingUntil = 0;
            finishedGalleryBrowserVisibleLoadingKey = "";
        }
        syncFinishedGalleryBrowserBusyClassFromStatus("set_status");
    }
    if (loadingText) {
        const loadingKey = getFinishedGalleryBrowserLoadingStatusKey(text);
        if (loadingKey && loadingKey === finishedGalleryBrowserVisibleLoadingKey && Date.now() < finishedGalleryBrowserVisibleLoadingUntil) return;
        if (Date.now() < finishedGalleryBrowserVisibleLoadingUntil && !finishedGalleryBrowserVisibleLoadingKey) return;
        finishedGalleryBrowserVisibleLoadingKey = loadingKey;
        finishedGalleryBrowserVisibleLoadingUntil = Date.now() + 5200;
    }
    if (!text && isFinishedGalleryBrowserLoadingText(currentText) && Date.now() < finishedGalleryBrowserVisibleLoadingUntil) {
        return;
    }
    if (currentText === (text || "") && status.classList.contains("is-error") === !!isError) return;
    installFinishedGalleryBrowserStatusObserver();
    target.textContent = text || "";
    status.classList.toggle("is-error", !!isError);
}

function countRenderedFinishedGalleryItems() {
    const gallery = getFinishedGalleryBrowserElement("finished_gallery");
    if (!gallery) return null;
    const style = window.getComputedStyle ? window.getComputedStyle(gallery) : null;
    const rect = gallery.getBoundingClientRect ? gallery.getBoundingClientRect() : null;
    if (style && (style.display === "none" || style.visibility === "hidden")) return null;
    if (rect && (rect.width <= 0 || rect.height <= 0)) return null;

    const itemSelectors = [
        ".grid-wrap .gallery-item",
        ".grid-wrap button",
        "[data-testid='gallery'] button",
    ];
    for (const selector of itemSelectors) {
        const count = gallery.querySelectorAll(selector).length;
        if (count > 0) return count;
    }

    const preview = gallery.querySelector(".gallery-container > .preview");
    if (preview) {
        const previewThumbSelectors = [
            ".gallery-container > .preview .thumbnails > .thumbnail-item",
            ".gallery-container > .preview .thumbnails > button",
        ];
        for (const selector of previewThumbSelectors) {
            const count = gallery.querySelectorAll(selector).length;
            if (count > 0) return count;
        }
        return null;
    }

    const mediaSources = new Set();
    gallery.querySelectorAll("img, video").forEach((media) => {
        const src = media.currentSrc || media.src || media.getAttribute("src") || media.poster || "";
        if (src) mediaSources.add(src);
    });
    return mediaSources.size;
}

function parseFinishedCatalogCount(value) {
    const match = String(value || "").match(/(\d+)/);
    if (!match) return null;
    const count = Number(match[1]);
    return Number.isFinite(count) ? Math.max(0, Math.floor(count)) : null;
}

function syncFinishedCatalogLabelFromRenderedCount(count, mediaType, reason) {
    return false;
}

function scheduleFinishedGalleryBrowserCatalogLabelSync(value, mediaType, reason, requestId) {
    const stat = String(value || "").trim();
    if (!stat || typeof refresh_finished_images_catalog_label !== "function") return false;
    const mode = getFinishedGalleryBrowserMode(mediaType);
    const expectedRequestId = Number(requestId || finishedGalleryBrowserState.activeRequestId || 0);
    const expectedFolder = normalizeFinishedGalleryBrowserFolderValue(
        finishedGalleryBrowserState.userFolder || finishedGalleryBrowserState.folder || ""
    );
    const apply = (delay) => {
        window.setTimeout(() => {
            try {
                if (expectedRequestId && Number(finishedGalleryBrowserState.activeRequestId || 0) !== expectedRequestId) return;
                if (getFinishedGalleryBrowserMode(finishedGalleryBrowserState.mediaType) !== mode) return;
                const currentFolder = normalizeFinishedGalleryBrowserFolderValue(
                    finishedGalleryBrowserState.userFolder || finishedGalleryBrowserState.folder || ""
                );
                if (expectedFolder && currentFolder && currentFolder !== expectedFolder) return;
                refresh_finished_images_catalog_label(stat, mode, { refresh: false });
            } catch (e) {}
        }, delay);
    };
    [0, 80, 220].forEach(apply);
    simpaiUiTrace("log", "[UI-TRACE] gallery_browser.catalog_label_sync_scheduled", {
        reason: reason || "gallery_browser",
        stat,
        mode,
        requestId: expectedRequestId,
    });
    return true;
}

function countExistingFinishedGalleryMedia() {
    const gallery = getFinishedGalleryBrowserElement("finished_gallery");
    if (!gallery) return 0;
    try {
        if (gallery.dataset.simpleaiGalleryBrowserEmptyMediaHidden === "1") return 0;
        const style = window.getComputedStyle ? window.getComputedStyle(gallery) : null;
        if (style && (style.display === "none" || style.visibility === "hidden")) return 0;
    } catch (e) {}
    if (gallery.querySelector(".gallery-container > .preview")) return 1;
    const itemSelectors = [
        ".grid-wrap .gallery-item",
        ".grid-wrap button",
        "[data-testid='gallery'] button",
    ];
    for (const selector of itemSelectors) {
        const count = gallery.querySelectorAll(selector).length;
        if (count > 0) return count;
    }
    const mediaSources = new Set();
    gallery.querySelectorAll("img, video").forEach((media) => {
        const src = media.currentSrc || media.src || media.getAttribute("src") || media.poster || "";
        if (src) mediaSources.add(src);
    });
    return mediaSources.size;
}

function markFinishedGalleryBrowserRenderedMediaEmpty(reason) {
    if (!finishedGalleryBrowserEmptyMediaStyleInstalled) {
        finishedGalleryBrowserEmptyMediaStyleInstalled = true;
        try {
            const style = document.createElement("style");
            style.id = "simpleai-gallery-browser-empty-media-style";
            const selectors = [
                "#finished_gallery[data-simpleai-gallery-browser-empty-media-hidden='1']",
                "#final_gallery[data-simpleai-gallery-browser-empty-media-hidden='1']",
                "#progress_video[data-simpleai-gallery-browser-empty-media-hidden='1']",
                "#video_player[data-simpleai-gallery-browser-empty-media-hidden='1']"
            ].join(",");
            style.textContent = selectors + "{display:none!important;pointer-events:none!important;visibility:hidden!important;}";
            document.head.appendChild(style);
        } catch (e) {}
    }
    ["finished_gallery", "final_gallery", "progress_video", "video_player"].forEach((id) => {
        const node = getFinishedGalleryBrowserElement(id) || document.getElementById(id);
        if (!node) return;
        try { node.dataset.simpleaiGalleryBrowserEmptyMediaHidden = "1"; } catch (e) {}
        try { markSimpleAICatalogLinkedGalleryHidden(node, { markWrappers: true }); } catch (e) {}
    });
    simpaiUiTrace("log", "[UI-TRACE] gallery_browser.empty_media_hidden", { reason: reason || "gallery_browser_empty" });
}

function releaseFinishedGalleryBrowserRenderedMediaEmpty(reason) {
    ["finished_gallery", "final_gallery", "progress_video", "video_player"].forEach((id) => {
        const node = getFinishedGalleryBrowserElement(id) || document.getElementById(id);
        if (!node) return;
        let owned = false;
        try { owned = node.dataset.simpleaiGalleryBrowserEmptyMediaHidden === "1"; } catch (e) {}
        if (!owned) return;
        try { delete node.dataset.simpleaiGalleryBrowserEmptyMediaHidden; } catch (e) {}
        try { clearSimpleAICatalogLinkedGalleryHiddenElement(node); } catch (e) {}
    });
    try { clearSimpleAICatalogLinkedGalleryWrappers(reason || "gallery_browser_load"); } catch (e) {}
    simpaiUiTrace("log", "[UI-TRACE] gallery_browser.empty_media_released", { reason: reason || "gallery_browser_load" });
}

function setFinishedGalleryBrowserHasMediaState(hasMedia, reason) {
    try {
        document.documentElement.classList.toggle("simpai-gallery-browser-has-media", !!hasMedia);
    } catch (e) {}
    simpaiUiTrace("log", "[UI-TRACE] gallery_browser.has_media_state", {
        reason: reason || "gallery_browser",
        hasMedia: !!hasMedia,
    });
}

function hasMountedFinishedGalleryBrowserMedia() {
    if ((countExistingFinishedGalleryMedia() || 0) > 0) return true;
    const selector = "img, video, .gallery-item, .gallery-container > .preview, .grid-wrap button, [data-testid='gallery'] button";
    const finalGallery = getFinishedGalleryBrowserElement("final_gallery") || document.getElementById("final_gallery");
    try {
        if (finalGallery && finalGallery.dataset.simpleaiGalleryBrowserEmptyMediaHidden === "1") return false;
        const style = finalGallery && window.getComputedStyle ? window.getComputedStyle(finalGallery) : null;
        if (style && (style.display === "none" || style.visibility === "hidden")) return false;
    } catch (e) {}
    return !!(finalGallery && finalGallery.querySelector(selector));
}

function hasFinishedGalleryBrowserLoadedMediaState() {
    if (!finishedGalleryBrowserState) return false;
    if (finishedGalleryBrowserState.loading || finishedGalleryBrowserState.pendingPayload) return false;
    return Number(finishedGalleryBrowserState.loaded || 0) > 0;
}

const POST_GENERATION_SUPPORT_SURFACE_TTL_MS = 3200;
let postGenerationSupportSurfaceTimer = null;
let postGenerationSupportSurfaceFreshUntil = 0;
let postGenerationSupportSurfaceKey = "";
let postGenerationSupportSurfaceExpiredKey = "";

function postGenerationSurfaceKeyFromParams(params) {
    if (!params || typeof params !== "object") return "";
    const imageUrl = params.__post_generation_image_url || "";
    const preset = params.__preset || params.preset || "";
    const galleryState = params.gallery_state || "";
    const promptInfo = Array.isArray(params.prompt_info) ? params.prompt_info.join("|") : "";
    if (!imageUrl && !params.__post_generation_has_output) return "";
    return [imageUrl, preset, galleryState, promptInfo].map((item) => String(item || "")).join("::");
}

function markPostGenerationResultSurfaceWindow(params, reason) {
    const key = postGenerationSurfaceKeyFromParams(params);
    if (!key) return "";
    postGenerationSupportSurfaceKey = key;
    if (postGenerationSupportSurfaceExpiredKey === key) {
        postGenerationSupportSurfaceExpiredKey = "";
    }
    postGenerationSupportSurfaceFreshUntil = Date.now() + POST_GENERATION_SUPPORT_SURFACE_TTL_MS;
    simpaiUiTrace("log", "[UI-TRACE] post_generation_support_surface.window", {
        reason: reason || "generation_done",
        ttlMs: POST_GENERATION_SUPPORT_SURFACE_TTL_MS,
        hasImageUrl: !!(params && params.__post_generation_image_url),
    });
    return key;
}
window.markPostGenerationResultSurfaceWindow = markPostGenerationResultSurfaceWindow;

function isPostGenerationSupportSurfaceFresh(key) {
    if (!key) return false;
    if (postGenerationSupportSurfaceExpiredKey && postGenerationSupportSurfaceExpiredKey === key) return false;
    return postGenerationSupportSurfaceKey === key && Date.now() <= postGenerationSupportSurfaceFreshUntil;
}

function hasMountedPostGenerationResultMedia() {
    const selector = "img, video, .gallery-item, .gallery-container > .preview";
    const finishedGallery = getFinishedGalleryBrowserElement("finished_gallery") || document.getElementById("finished_gallery");
    const finalGallery = getFinishedGalleryBrowserElement("final_gallery") || document.getElementById("final_gallery");
    return !!(
        (finishedGallery && finishedGallery.querySelector(selector))
        || (finalGallery && finalGallery.querySelector(selector))
    );
}

function getWelcomePreviewElement() {
    const app = typeof gradioApp === "function" ? gradioApp() : document;
    try {
        return (app && app.getElementById ? app.getElementById("preview_generating") : null) || document.getElementById("preview_generating");
    } catch (e) {
        return document.getElementById("preview_generating");
    }
}

function getFinishedGalleryPreviewImageSource(preview) {
    try {
        const source = preview && preview.querySelector ? preview.querySelector("img") : null;
        return source ? (source.currentSrc || source.src || source.getAttribute("src") || "") : "";
    } catch (e) {
        return "";
    }
}

function isFinishedGalleryWelcomeSource(src) {
    const raw = String(src || "");
    if (!raw) return false;
    try {
        if (typeof window.isStudioWelcomeMediaSource === "function" && window.isStudioWelcomeMediaSource(raw, "title")) return true;
    } catch (e) {}
    let text = raw.toLowerCase();
    try { text = decodeURIComponent(text); } catch (e) {}
    text = text.replace(/\\/g, "/").split("#", 1)[0].split("?", 1)[0];
    if (text.indexOf("/studio_ui/welcome/waiting-") !== -1) return false;
    if (/(?:^|\/)(?:\d+_)?welcome_0_[wm]\.(?:jpe?g|png|gif|webp)$/.test(text)) return false;
    return text.indexOf("/presets/welcome/") !== -1
        || text.indexOf("/studio_ui/welcome/title-") !== -1
        || /(?:^|\/)title-(?:desktop|mobile)-[0-9a-f]{16}\.webp$/.test(text)
        || /(?:^|\/)(?:\d+_)?welcome(?:_(?:[^/]+_)?[wm])?\.(?:jpe?g|png|gif|webp)$/.test(text);
}

function getFinishedGalleryWelcomeFallbackSource() {
    let configuredSource = "";
    try {
        configuredSource = typeof window.getStudioWelcomeMediaSource === "function"
            ? window.getStudioWelcomeMediaSource("title")
            : "";
    } catch (e) {}
    return configuredSource || finishedGalleryWelcomeGuardLastSrc || "/file=presets/welcome/1_welcome_w.jpg";
}

function shouldRestoreFinishedGalleryWelcomeImageForReason(reason) {
    return !/generate_start|generation_start|preview_start/i.test(String(reason || ""));
}

function clearFinishedGalleryWelcomeGuardNodeState(el) {
    if (!el) return false;
    let changed = false;
    try { changed = clearWelcomePreviewHiddenForGalleryNode(el) || changed; } catch (e) {}
    let owned = false;
    try { owned = el.dataset.simpleaiGalleryWelcomeGuard === "1"; } catch (e) {}
    if (owned) {
        try { delete el.dataset.simpleaiGalleryWelcomeGuard; } catch (e) {}
        try { el.style.removeProperty("display"); } catch (e) {}
        try { el.style.removeProperty("visibility"); } catch (e) {}
        changed = true;
    }
    return changed;
}

function restoreFinishedGalleryWelcomePreviewImage(preview, reason) {
    try {
        if (!preview || !preview.querySelector) return false;
        const image = preview.querySelector("img");
        if (!image) return false;
        const src = getFinishedGalleryPreviewImageSource(preview);
        if (isFinishedGalleryWelcomeSource(src)) {
            finishedGalleryWelcomeGuardLastSrc = src;
            return false;
        }
        const fallbackSrc = getFinishedGalleryWelcomeFallbackSource();
        if (!fallbackSrc) return false;
        try { image.removeAttribute("srcset"); } catch (e) {}
        try { image.removeAttribute("sizes"); } catch (e) {}
        try {
            image.src = fallbackSrc;
        } catch (e) {
            try { image.setAttribute("src", fallbackSrc); } catch (_e) {}
        }
        simpaiUiTrace("log", "[UI-TRACE] gallery_browser.welcome_preview_image_restore", {
            reason: reason || "restore",
            replaced: !!src,
        });
        return true;
    } catch (e) {
        return false;
    }
}

function getFinishedGallerySurfaceRow() {
    const preview = getWelcomePreviewElement();
    const gallery = getFinishedGalleryBrowserElement("finished_gallery") || document.getElementById("finished_gallery");
    const placeholder = document.getElementById("simpleai_gallery_welcome_guard_placeholder");
    const fallbackRow = document.getElementById("simpleai_gallery_welcome_guard_row");
    const previewRow = preview && preview.closest ? preview.closest(".row") : null;
    const galleryRow = gallery && gallery.closest ? gallery.closest(".row") : null;
    if (galleryRow) {
        let galleryIsPrimary = false;
        try {
            galleryIsPrimary = galleryRow.dataset.simpleaiPostGenerationSurface === "1"
                || countExistingFinishedGalleryMedia() > 0
                || countRenderedFinishedGalleryItems() > 0;
        } catch (e) {}
        if (galleryIsPrimary) return galleryRow;
    }
    return previewRow
        || galleryRow
        || (placeholder && placeholder.closest(".row"))
        || fallbackRow
        || null;
}

function getWelcomePreviewGuardNodes() {
    const preview = getWelcomePreviewElement();
    if (!preview) return [];
    return [preview, preview.closest(".form, .block"), preview.closest(".row")].filter(Boolean);
}

function isFinishedGalleryBrowserClosedForSurfaceRefresh() {
    const catalogRoot = getFinishedGalleryBrowserElement("finished_images_catalog") || document.getElementById("finished_images_catalog");
    if (!catalogRoot) return false;
    if (Date.now() < simpleAIFinishedCatalogPreparedOpenUntil) return false;
    return !isSimpleAIPresetCatalogOpen(catalogRoot);
}

function isFinishedGalleryBrowserOpenOrLoading() {
    const catalogRoot = getFinishedGalleryBrowserElement("finished_images_catalog") || document.getElementById("finished_images_catalog");
    const preparedOpen = Date.now() < simpleAIFinishedCatalogPreparedOpenUntil;
    const catalogOpen = !!(catalogRoot && isSimpleAIPresetCatalogOpen(catalogRoot));
    if (!preparedOpen && !catalogOpen) return false;
    return !!(
        preparedOpen
        || catalogOpen
        || (finishedGalleryBrowserState && finishedGalleryBrowserState.loading)
        || (finishedGalleryBrowserState && finishedGalleryBrowserState.pendingPayload)
        || document.documentElement.classList.contains("simpai-gallery-browser-loading-silent")
        || document.documentElement.classList.contains("simpai-gallery-browser-welcome-pending")
    );
}

function markFinishedGalleryBrowserCatalogOpenIntent(requestId, reason) {
    const catalogRoot = getFinishedGalleryBrowserElement("finished_images_catalog") || document.getElementById("finished_images_catalog");
    const preparedOpen = Date.now() < simpleAIFinishedCatalogPreparedOpenUntil;
    const catalogOpen = !catalogRoot || preparedOpen || isSimpleAIPresetCatalogOpen(catalogRoot);
    if (!catalogOpen) return false;
    finishedGalleryBrowserState.keepCatalogOpenRequestId = Number(requestId || 0);
    finishedGalleryBrowserState.keepCatalogOpenUntil = Date.now() + 10000;
    finishedGalleryBrowserState.keepCatalogOpenReason = reason || "gallery_browser_request";
    simpaiUiTrace("log", "[UI-TRACE] gallery_browser.catalog_open_intent", {
        reason: reason || "gallery_browser_request",
        requestId: Number(requestId || 0),
        preparedOpen,
    });
    return true;
}

function clearFinishedGalleryBrowserCatalogOpenIntent(reason) {
    const hadIntent = !!(
        Number(finishedGalleryBrowserState.keepCatalogOpenRequestId || 0)
        || Number(finishedGalleryBrowserState.keepCatalogOpenUntil || 0)
        || finishedGalleryBrowserState.keepCatalogOpenReason
    );
    finishedGalleryBrowserState.keepCatalogOpenRequestId = 0;
    finishedGalleryBrowserState.keepCatalogOpenUntil = 0;
    finishedGalleryBrowserState.keepCatalogOpenReason = "";
    simpleAIFinishedCatalogPreparedOpenUntil = 0;
    simpleAIFinishedCatalogForceOpenUntil = 0;
    if (hadIntent) {
        simpaiUiTrace("log", "[UI-TRACE] gallery_browser.catalog_open_intent_cleared", {
            reason: reason || "catalog_close",
        });
    }
    return hadIntent;
}

function shouldRestoreFinishedGalleryBrowserCatalogOpen(requestId) {
    const until = Number(finishedGalleryBrowserState.keepCatalogOpenUntil || 0);
    if (!until || Date.now() > until) return false;
    const expected = Number(finishedGalleryBrowserState.keepCatalogOpenRequestId || 0);
    const incoming = Number(requestId || 0);
    if (expected && incoming && expected !== incoming) return false;
    return true;
}

function restoreFinishedGalleryBrowserCatalogOpenAfterLoad(requestId, reason) {
    if (!shouldRestoreFinishedGalleryBrowserCatalogOpen(requestId)) return false;
    const catalogRoot = getFinishedGalleryBrowserElement("finished_images_catalog") || document.getElementById("finished_images_catalog");
    if (!catalogRoot) return false;
    const restored = ensureSimpleAIPresetCatalogOpen(catalogRoot, reason || "gallery_browser_after_load");
    scheduleFinishedGalleryBrowserCatalogOpenRestore(reason || "gallery_browser_after_load");
    finishedGalleryBrowserState.keepCatalogOpenRequestId = 0;
    finishedGalleryBrowserState.keepCatalogOpenUntil = 0;
    finishedGalleryBrowserState.keepCatalogOpenReason = "";
    try { clearSimpleAICatalogLinkedGalleryHidden(reason || "gallery_browser_after_load"); } catch (e) {}
    return restored;
}

function removeFinishedGalleryWelcomePlaceholder() {
    try {
        const placeholder = document.getElementById("simpleai_gallery_welcome_guard_placeholder");
        if (placeholder) placeholder.remove();
        const row = document.getElementById("simpleai_gallery_welcome_guard_row");
        if (row && !row.querySelector("#simpleai_gallery_welcome_guard_placeholder")) row.remove();
    } catch (e) {}
}

function suppressFinishedGalleryWelcomeGuardForComparison(reason) {
    try { window.clearTimeout(finishedGalleryWelcomeGuardTimer); } catch (e) {}
    finishedGalleryWelcomeGuardTimer = null;
    finishedGalleryWelcomeGuardUntil = 0;
    finishedGalleryWelcomeGuardHoldStaleUntil = 0;
    try { removeFinishedGalleryWelcomePlaceholder(); } catch (e) {}
    try {
        document.documentElement.classList.remove("simpai-gallery-browser-welcome-pending");
        document.documentElement.classList.remove("simpai-gallery-browser-loading-silent");
        document.documentElement.classList.remove("simpai-gallery-browser-overlay-active");
    } catch (e) {}
    try {
        document.querySelectorAll(".simpai-gallery-browser-overlay-row").forEach((node) => {
            node.classList.remove("simpai-gallery-browser-overlay-row");
        });
    } catch (e) {}
    try {
        document.querySelectorAll("[data-simpleai-gallery-welcome-guard='1']").forEach((node) => {
            if (node.id === "simpleai_gallery_welcome_guard_placeholder" || node.id === "simpleai_gallery_welcome_guard_row") {
                node.remove();
                return;
            }
            delete node.dataset.simpleaiGalleryWelcomeGuard;
            if (node.style.getPropertyPriority("display") === "important" && node.style.getPropertyValue("display") !== "none") {
                node.style.removeProperty("display");
            }
            if (node.style.getPropertyPriority("visibility") === "important" && node.style.getPropertyValue("visibility") !== "hidden") {
                node.style.removeProperty("visibility");
            }
        });
    } catch (e) {}
    simpaiUiTrace("log", "[UI-TRACE] comparison.welcome_guard_suppress", { reason: reason || "comparison_preview" });
    return true;
}
window.suppressFinishedGalleryWelcomeGuardForComparison = suppressFinishedGalleryWelcomeGuardForComparison;

function rememberFinishedGalleryWelcomeSource(preview) {
    try {
        const src = getFinishedGalleryPreviewImageSource(preview);
        if (isFinishedGalleryWelcomeSource(src)) finishedGalleryWelcomeGuardLastSrc = src;
        return finishedGalleryWelcomeGuardLastSrc;
    } catch (e) {
        return finishedGalleryWelcomeGuardLastSrc;
    }
}

function ensureFinishedGalleryWelcomePlaceholder() {
    const existing = document.getElementById("simpleai_gallery_welcome_guard_placeholder");
    const preview = getWelcomePreviewElement();
    const rememberedSrc = rememberFinishedGalleryWelcomeSource(preview);
    const fallbackSrc = getFinishedGalleryWelcomeFallbackSource();
    if (existing) {
        const existingImage = existing.querySelector("img");
        const existingSrc = existingImage ? (existingImage.currentSrc || existingImage.src || existingImage.getAttribute("src") || "") : "";
        if (existingImage && fallbackSrc && existingSrc !== fallbackSrc) {
            try { existingImage.src = fallbackSrc; } catch (e) {}
        }
        try { window.SimpAIWelcomeMedia?.sync(); } catch (e) {}
        return existing;
    }
    const surfaceRow = getFinishedGallerySurfaceRow();
    let parent = surfaceRow || (preview && preview.parentElement && preview.parentElement.parentElement);
    if (!parent) {
        const previewColumn = document.querySelector("#main_layout_row > .preview_column") || document.querySelector(".preview_column");
        if (previewColumn) {
            let row = document.getElementById("simpleai_gallery_welcome_guard_row");
            if (!row) {
                row = document.createElement("div");
                row.id = "simpleai_gallery_welcome_guard_row";
                row.className = "row simpleai-gallery-welcome-guard-row";
                row.dataset.simpleaiGalleryWelcomeGuard = "1";
                try {
                    previewColumn.insertBefore(row, previewColumn.firstChild);
                } catch (e) {
                    try { previewColumn.appendChild(row); } catch (_e) {}
                }
            }
            parent = row;
        }
    }
    if (!parent) return null;
    const placeholder = document.createElement("div");
    placeholder.id = "simpleai_gallery_welcome_guard_placeholder";
    placeholder.className = "simpleai-gallery-welcome-guard-placeholder";
    placeholder.dataset.simpleaiGalleryWelcomeGuard = "1";
    const image = document.createElement("img");
    image.alt = "";
    image.draggable = false;
    const src = fallbackSrc || rememberedSrc || "";
    if (src) {
        image.src = src;
    } else {
        let configuredSource = "";
        try {
            configuredSource = typeof window.getStudioWelcomeMediaSource === "function"
                ? window.getStudioWelcomeMediaSource("title")
                : "";
        } catch (e) {}
        image.src = configuredSource || "/file=presets/welcome/welcome.png";
    }
    placeholder.appendChild(image);
    try {
        if (surfaceRow) {
            parent.insertBefore(placeholder, parent.firstChild);
        } else if (preview) {
            const row = preview.closest(".row") || preview;
            parent.insertBefore(placeholder, row.nextSibling);
        } else {
            parent.insertBefore(placeholder, parent.firstChild);
        }
    } catch (e) {
        try { parent.appendChild(placeholder); } catch (_e) {}
    }
    try { window.SimpAIWelcomeMedia?.sync(); } catch (e) {}
    return placeholder;
}
window.ensureFinishedGalleryWelcomePlaceholder = ensureFinishedGalleryWelcomePlaceholder;

function markWelcomePreviewGuardNode(el) {
    if (!el) return false;
    const isSurfaceRow = !!(el.matches && el.matches(".row"));
    try { delete el.dataset.simpleaiPostGenerationCollapsed; } catch (e) {}
    try { delete el.dataset.simpleaiPostGenerationSurface; } catch (e) {}
    setSimpleAIPresetCatalogAttributeIfChanged(el, "data-simpleai-gallery-welcome-guard", "1");
    try { if (el.hidden) el.hidden = false; } catch (e) {}
    removeSimpleAIAttributeIfPresent(el, "hidden");
    removeSimpleAIAttributeIfPresent(el, "aria-hidden");
    setSimpleAIClassStateIfChanged(el, "hidden", false);
    setSimpleAIClassStateIfChanged(el, "hide", false);
    setSimpleAIClassStateIfChanged(el, "simpai-mounted-hidden", false);
    setSimpleAIPresetCatalogStyleIfChanged(el, "display", isSurfaceRow ? "block" : "flex", "important");
    setSimpleAIPresetCatalogStyleIfChanged(el, "visibility", "visible", "important");
    return true;
}

function clearWelcomePreviewHiddenForGalleryNode(el) {
    if (!el) return false;
    let owned = false;
    try { owned = el.dataset.simpleaiGalleryWelcomeHiddenForGallery === "1"; } catch (e) {}
    if (!owned) return false;
    try { delete el.dataset.simpleaiGalleryWelcomeHiddenForGallery; } catch (e) {}
    try { el.classList.remove("simpai-gallery-browser-welcome-hidden"); } catch (e) {}
    try { el.removeAttribute("aria-hidden"); } catch (e) {}
    try { el.hidden = false; } catch (e) {}
    try { el.style.removeProperty("display"); } catch (e) {}
    try { el.style.removeProperty("visibility"); } catch (e) {}
    try { el.style.removeProperty("opacity"); } catch (e) {}
    try { el.style.removeProperty("pointer-events"); } catch (e) {}
    try { el.style.removeProperty("height"); } catch (e) {}
    try { el.style.removeProperty("min-height"); } catch (e) {}
    try { el.style.removeProperty("max-height"); } catch (e) {}
    return true;
}

function getFinishedGalleryBrowserExpectedMediaCount(mediaType) {
    const mode = getFinishedGalleryBrowserMode(mediaType);
    const params = window.simpleaiTopbarSystemParams || (typeof topbarLastSystemParams !== "undefined" ? topbarLastSystemParams : null) || {};
    const statCount = parseFinishedCatalogCount(params.__finished_nums_pages || "");
    const label = getFinishedGalleryBrowserElement("finished_images_catalog")?.querySelector?.("button.label-wrap > span:not(.icon)");
    const labelText = String(label ? label.textContent : "");
    const labelMatchesMode = mode === "video" ? /视频|video/i.test(labelText) : /图片|image|出图/i.test(labelText);
    const labelCount = labelMatchesMode ? parseFinishedCatalogCount(labelText) : null;
    return Math.max(0, statCount || 0, labelCount || 0);
}

function shouldHideWelcomePreviewDuringGalleryBrowserLoading(reason, options) {
    if (options && options.showWelcomeWhileLoading) return false;
    const reasonText = String(reason || "");
    const deferredEmpty = /gallery_browser_after_load_empty_deferred/i.test(reasonText);
    if (!deferredEmpty && /timeout_keep_welcome|gallery_browser_after_load_empty|gallery_browser_empty/i.test(reasonText)) return false;
    const switchingFolder = /gallery_browser_(refresh_start|bridge_start|loading)/i.test(reasonText);
    if (switchingFolder) {
        return true;
    }
    if (!/catalog_toggle|gallery_browser_(refresh_start|bridge_start|loading|after_load_empty_deferred)/i.test(reasonText)) return false;
    return getFinishedGalleryBrowserExpectedMediaCount() > 0
        || (countExistingFinishedGalleryMedia() || 0) > 0
        || (countRenderedFinishedGalleryItems() || 0) > 0;
}

function hideWelcomePreviewDuringGalleryBrowserLoading(reason) {
    const preview = getWelcomePreviewElement();
    rememberFinishedGalleryWelcomeSource(preview);
    const previewForm = preview && preview.closest ? preview.closest(".form, .block") : null;
    const row = (preview && preview.closest ? preview.closest(".row") : null) || getFinishedGallerySurfaceRow();
    let applied = false;
    if (row) applied = markWelcomePreviewGuardNode(row) || applied;
    [preview, previewForm].filter(Boolean).forEach((node) => {
        try { node.dataset.simpleaiGalleryWelcomeHiddenForGallery = "1"; } catch (e) {}
        try { node.classList.add("simpai-gallery-browser-welcome-hidden"); } catch (e) {}
        try { node.setAttribute("aria-hidden", "true"); } catch (e) {}
        try { node.hidden = true; } catch (e) {}
        try { node.style.setProperty("visibility", "hidden", "important"); } catch (e) {}
        try { node.style.setProperty("opacity", "0", "important"); } catch (e) {}
        try { node.style.setProperty("pointer-events", "none", "important"); } catch (e) {}
        applied = true;
    });
    try {
        document.documentElement.classList.add("simpai-gallery-browser-welcome-pending");
        document.documentElement.classList.add("simpai-gallery-browser-loading-silent");
    } catch (e) {}
    setFinishedGalleryOverlayActive(true);
    simpaiUiTrace("log", "[UI-TRACE] gallery_browser.welcome_loading_hidden", { reason: reason || "gallery_loading", applied });
    return applied;
}

function hideWelcomePreviewForFinishedGallery(reason, options) {
    const preview = getWelcomePreviewElement();
    const gallery = getFinishedGalleryBrowserElement("finished_gallery") || document.getElementById("finished_gallery");
    if (!preview || !gallery) return false;
    const previewForm = preview.closest ? preview.closest(".form, .block") : null;
    const previewRow = preview.closest ? preview.closest(".row") : null;
    const galleryRow = gallery.closest ? gallery.closest(".row") : null;
    const sameRow = options && Object.prototype.hasOwnProperty.call(options, "sameRow")
        ? !!options.sameRow
        : !!(previewRow && galleryRow && previewRow === galleryRow);
    const nodes = [preview, previewForm];
    if (!sameRow && previewRow && previewRow !== galleryRow) {
        nodes.push(previewRow);
    }
    let hidden = false;
    nodes.filter(Boolean).forEach((node) => {
        try { node.dataset.simpleaiGalleryWelcomeHiddenForGallery = "1"; } catch (e) {}
        try { node.classList.add("simpai-gallery-browser-welcome-hidden"); } catch (e) {}
        try { node.setAttribute("aria-hidden", "true"); } catch (e) {}
        try { node.hidden = true; } catch (e) {}
        try { node.style.setProperty("display", "none", "important"); } catch (e) {}
        try { node.style.setProperty("visibility", "hidden", "important"); } catch (e) {}
        if (!sameRow && node === previewRow) {
            try { node.style.setProperty("height", "0", "important"); } catch (e) {}
            try { node.style.setProperty("min-height", "0", "important"); } catch (e) {}
            try { node.style.setProperty("max-height", "0", "important"); } catch (e) {}
        }
        hidden = true;
    });
    simpaiUiTrace("log", "[UI-TRACE] gallery_browser.welcome_hide_for_gallery", { reason: reason || "gallery_ready", sameRow, hidden });
    return hidden;
}

function finishFinishedGalleryMediaSurface(reason) {
    if (isFinishedGalleryBrowserClosedForSurfaceRefresh()) {
        setFinishedGalleryOverlayActive(false);
        simpaiUiTrace("log", "[UI-TRACE] gallery_browser.media_surface_skip_closed", { reason: reason || "gallery_media_ready" });
        return false;
    }
    try { window.clearTimeout(finishedGalleryWelcomeGuardTimer); } catch (e) {}
    finishedGalleryWelcomeGuardTimer = null;
    finishedGalleryWelcomeGuardUntil = 0;
    finishedGalleryWelcomeGuardHoldStaleUntil = 0;
    setFinishedGalleryBrowserHasMediaState(true, reason || "gallery_media_ready");
    try { clearSimpleAICatalogLinkedGalleryHidden(reason || "gallery_media_ready"); } catch (e) {}
    try { removeFinishedGalleryWelcomePlaceholder(); } catch (e) {}
    try {
        document.documentElement.classList.remove("simpai-gallery-browser-welcome-pending");
        document.documentElement.classList.remove("simpai-gallery-browser-loading-silent");
    } catch (e) {}
    setFinishedGalleryOverlayActive(false);
    const hidden = hideWelcomePreviewForFinishedGallery(reason || "gallery_media_ready");
    simpaiUiTrace("log", "[UI-TRACE] gallery_browser.media_surface_ready", {
        reason: reason || "gallery_media_ready",
        hidden,
        media: countExistingFinishedGalleryMedia(),
    });
    return hidden;
}

function showMountedFinishedGalleryForCatalogOpen(reason) {
    try { window.clearTimeout(finishedGalleryWelcomeGuardTimer); } catch (e) {}
    finishedGalleryWelcomeGuardTimer = null;
    finishedGalleryWelcomeGuardUntil = 0;
    finishedGalleryWelcomeGuardHoldStaleUntil = 0;
    setFinishedGalleryBrowserHasMediaState(true, reason || "catalog_open_ready");
    try { clearSimpleAICatalogLinkedGalleryHidden(reason || "catalog_open_ready"); } catch (e) {}
    try { removeFinishedGalleryWelcomePlaceholder(); } catch (e) {}
    try {
        document.documentElement.classList.remove("simpai-gallery-browser-welcome-pending");
        document.documentElement.classList.remove("simpai-gallery-browser-loading-silent");
    } catch (e) {}
    setFinishedGalleryOverlayActive(true);
    const hidden = hideWelcomePreviewForFinishedGallery(reason || "catalog_open_ready", { sameRow: true });
    simpaiUiTrace("log", "[UI-TRACE] gallery_browser.surface_prepare_mounted", {
        reason: reason || "catalog_open_ready",
        hidden,
        media: countExistingFinishedGalleryMedia(),
    });
    return hidden;
}

function shouldRefreshFinishedGalleryMediaSurface() {
    try {
        if (document.documentElement.classList.contains("simpai-gallery-browser-welcome-pending")) return true;
        if (document.documentElement.classList.contains("simpai-gallery-browser-loading-silent")) return true;
        if (document.documentElement.classList.contains("simpai-gallery-browser-overlay-active")) return true;
    } catch (e) {}
    const preview = getWelcomePreviewElement();
    if (!preview) return false;
    try {
        const style = window.getComputedStyle ? window.getComputedStyle(preview) : null;
        const rect = preview.getBoundingClientRect ? preview.getBoundingClientRect() : null;
        const visible = !preview.hidden
            && (!style || (style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0"))
            && !!rect && rect.width > 0 && rect.height > 0;
        if (!visible) return false;
        return isFinishedGalleryWelcomeSource(getFinishedGalleryPreviewImageSource(preview));
    } catch (e) {
        return false;
    }
}

function setFinishedGalleryOverlayActive(active) {
    const enabled = !!active;
    setSimpleAIClassStateIfChanged(document.documentElement, "simpai-gallery-browser-overlay-active", enabled);
    const row = enabled ? getFinishedGallerySurfaceRow() : null;
    try {
        document.querySelectorAll(".simpai-gallery-browser-overlay-row").forEach((node) => {
            if (node !== row) setSimpleAIClassStateIfChanged(node, "simpai-gallery-browser-overlay-row", false);
        });
    } catch (e) {}
    if (!row) return;
    setSimpleAIClassStateIfChanged(row, "simpai-gallery-browser-overlay-row", true);
}

function shouldReleaseFinishedGalleryWelcomeGuard() {
    if (Date.now() < finishedGalleryWelcomeGuardHoldStaleUntil) return false;
    if (!hasFinishedGalleryBrowserLoadedMediaState()) return false;
    return (countRenderedFinishedGalleryItems() || 0) > 0;
}

function prepareFinishedGallerySurfaceForCatalogOpen(reason) {
    const preview = getWelcomePreviewElement();
    rememberFinishedGalleryWelcomeSource(preview);
    const hasLoadedMedia = hasFinishedGalleryBrowserLoadedMediaState();
    if (hasLoadedMedia && hasMountedFinishedGalleryBrowserMedia()) {
        showMountedFinishedGalleryForCatalogOpen(reason || "catalog_open_ready");
        simpaiUiTrace("log", "[UI-TRACE] gallery_browser.surface_prepare_ready", { reason: reason || "catalog_open" });
        return true;
    }
    let applied = false;
    getWelcomePreviewGuardNodes().forEach((node) => {
        applied = markWelcomePreviewGuardNode(node) || applied;
    });
    setFinishedGalleryOverlayActive(true);
    if (hasLoadedMedia && ((countRenderedFinishedGalleryItems() || 0) > 0 || countExistingFinishedGalleryMedia() > 0)) {
        finishedGalleryWelcomeGuardHoldStaleUntil = 0;
        try {
            document.documentElement.classList.remove("simpai-gallery-browser-welcome-pending");
            document.documentElement.classList.remove("simpai-gallery-browser-loading-silent");
        } catch (e) {}
        hideWelcomePreviewForFinishedGallery(reason || "catalog_open_ready");
        simpaiUiTrace("log", "[UI-TRACE] gallery_browser.surface_prepare_fast", { reason: reason || "catalog_open", applied });
        return applied;
    }
    finishedGalleryWelcomeGuardUntil = Math.max(finishedGalleryWelcomeGuardUntil, Date.now() + 8000);
    applyFinishedGalleryWelcomeGuard(reason || "catalog_open_blank", { force: true });
    scheduleFinishedGalleryWelcomeGuard(reason || "catalog_open_blank");
    return true;
}

function restoreWelcomePreviewAfterCatalogClose(reason) {
    try { window.clearTimeout(finishedGalleryWelcomeGuardTimer); } catch (e) {}
    finishedGalleryWelcomeGuardTimer = null;
    finishedGalleryWelcomeGuardUntil = 0;
    finishedGalleryWelcomeGuardHoldStaleUntil = 0;
    const preview = getWelcomePreviewElement();
    rememberFinishedGalleryWelcomeSource(preview);
    const shouldRestorePreviewImage = shouldRestoreFinishedGalleryWelcomeImageForReason(reason);
    if (!shouldRestorePreviewImage) {
        let cleared = false;
        getWelcomePreviewGuardNodes().forEach((node) => {
            cleared = clearFinishedGalleryWelcomeGuardNodeState(node) || cleared;
        });
        removeFinishedGalleryWelcomePlaceholder();
        setFinishedGalleryOverlayActive(false);
        try {
            document.documentElement.classList.remove("simpai-gallery-browser-welcome-pending");
            document.documentElement.classList.remove("simpai-gallery-browser-loading-silent");
        } catch (e) {}
        simpaiUiTrace("log", "[UI-TRACE] gallery_browser.welcome_restore_skipped", { reason: reason || "catalog_close", cleared });
        return cleared;
    }
    const restoredPreviewImage = shouldRestorePreviewImage ? restoreFinishedGalleryWelcomePreviewImage(preview, reason || "catalog_close") : false;
    const previewHasWelcomeImage = isFinishedGalleryWelcomeSource(getFinishedGalleryPreviewImageSource(preview)) || restoredPreviewImage;
    const shouldKeepPlaceholderBackup = shouldRestorePreviewImage && (!preview || getFinishedGalleryBrowserMode() === "video" || !previewHasWelcomeImage);
    const placeholder = shouldKeepPlaceholderBackup ? ensureFinishedGalleryWelcomePlaceholder() : null;
    if (!preview && !placeholder) return false;
    let restored = false;
    getWelcomePreviewGuardNodes().forEach((node) => {
        clearWelcomePreviewHiddenForGalleryNode(node);
        restored = markWelcomePreviewGuardNode(node) || restored;
    });
    if (placeholder) {
        const row = getFinishedGallerySurfaceRow();
        restored = markWelcomePreviewGuardNode(row) || restored;
        restored = markWelcomePreviewGuardNode(placeholder) || restored;
    } else {
        removeFinishedGalleryWelcomePlaceholder();
    }
    setFinishedGalleryOverlayActive(false);
    try {
        document.documentElement.classList.remove("simpai-gallery-browser-welcome-pending");
        document.documentElement.classList.remove("simpai-gallery-browser-loading-silent");
    } catch (e) {}
    simpaiUiTrace("log", "[UI-TRACE] gallery_browser.welcome_restore_after_close", { reason: reason || "catalog_close", restored });
    return restored;
}

function restoreWelcomePreviewForEmptyGalleryBrowser(reason) {
    setFinishedGalleryBrowserHasMediaState(false, reason || "gallery_browser_empty");
    markFinishedGalleryBrowserRenderedMediaEmpty(reason || "gallery_browser_empty");
    try { releaseFinishedGalleryWelcomeGuard(false, reason || "gallery_browser_empty_done"); } catch (e) {}
    ["finished_gallery", "final_gallery", "progress_video", "video_player", "comparison_box"].forEach((id) => {
        try { markSimpleAICatalogLinkedGalleryHidden(getFinishedGalleryBrowserElement(id) || document.getElementById(id)); } catch (e) {}
    });
    const catalogRoot = getFinishedGalleryBrowserElement("finished_images_catalog");
    if (catalogRoot) {
        try { catalogRoot.hidden = false; } catch (e) {}
        try { catalogRoot.removeAttribute("hidden"); } catch (e) {}
        try { catalogRoot.removeAttribute("aria-hidden"); } catch (e) {}
        try {
            catalogRoot.classList.remove("hidden");
            catalogRoot.classList.remove("hide");
            catalogRoot.style.removeProperty("display");
        } catch (e) {}
        if (isSimpleAIPresetCatalogOpen(catalogRoot)) {
            try { clearFinishedImagesCatalogClosedHitbox("gallery_browser_empty_open"); } catch (e) {}
        }
    }
    try {
        document.documentElement.classList.remove("simpai-post-generation-result-surface");
        document.documentElement.classList.remove("simpai-video-result-preview");
        document.documentElement.classList.remove("simpai-comparison-preview");
    } catch (e) {}
    const restored = restoreWelcomePreviewAfterCatalogClose(reason || "gallery_browser_empty");
    simpaiUiTrace("log", "[UI-TRACE] gallery_browser.empty_restore", { reason: reason || "gallery_browser_empty", restored });
    return restored;
}
window.restoreWelcomePreviewForEmptyGalleryBrowser = restoreWelcomePreviewForEmptyGalleryBrowser;

function shouldDeferEmptyGalleryBrowserRestoreDuringOpen(reason) {
    const catalogRoot = getFinishedGalleryBrowserElement("finished_images_catalog") || document.getElementById("finished_images_catalog");
    const catalogOpen = !!(catalogRoot && isSimpleAIPresetCatalogOpen(catalogRoot));
    const preparedOpen = Date.now() < simpleAIFinishedCatalogPreparedOpenUntil;
    if (!catalogOpen && !preparedOpen) return false;
    if (!hasFinishedGalleryBrowserLoadedMediaState()) return false;
    return getFinishedGalleryBrowserExpectedMediaCount(finishedGalleryBrowserState && finishedGalleryBrowserState.mediaType) > 0
        || (countExistingFinishedGalleryMedia() || 0) > 0
        || (countRenderedFinishedGalleryItems() || 0) > 0;
}

function deferEmptyGalleryBrowserRestoreDuringOpen(reason) {
    setFinishedGalleryBrowserHasMediaState(false, reason || "gallery_browser_after_load_empty_deferred");
    finishedGalleryWelcomeGuardUntil = Math.max(finishedGalleryWelcomeGuardUntil, Date.now() + 8000);
    hideWelcomePreviewDuringGalleryBrowserLoading(reason || "gallery_browser_after_load_empty_deferred");
    scheduleFinishedGalleryWelcomeGuard(reason || "gallery_browser_after_load_empty_deferred", {
        force: true,
        ignoreMountedMedia: true,
    });
    simpaiUiTrace("log", "[UI-TRACE] gallery_browser.empty_restore_deferred", { reason: reason || "gallery_browser_after_load_empty" });
    return true;
}

function shouldIgnoreMountedGalleryMediaForWelcomeGuard(reason, options) {
    if (options && options.ignoreMountedMedia) return true;
    if (finishedGalleryBrowserState && finishedGalleryBrowserState.loading) return true;
    return /gallery_browser_(refresh_start|bridge_start|loading)|catalog_toggle_open/i.test(String(reason || ""));
}

function applyFinishedGalleryWelcomeGuard(reason, options) {
    if (shouldKeepCatalogLinkedGalleryHidden(reason)) {
        try { releaseFinishedGalleryWelcomeGuard(false, `${reason || "gallery_loading"}:catalog_closed`); } catch (e) {}
        try { setFinishedGalleryOverlayActive(false); } catch (e) {}
        simpaiUiTrace("log", "[UI-TRACE] gallery_browser.welcome_guard_skip_closed", { reason: reason || "gallery_loading" });
        return false;
    }
    const force = !!(options && options.force);
    const ignoreMountedMedia = shouldIgnoreMountedGalleryMediaForWelcomeGuard(reason, options);
    if (!ignoreMountedMedia && hasMountedFinishedGalleryBrowserMedia()) {
        finishFinishedGalleryMediaSurface(reason || "gallery_has_media");
        return true;
    }
    if (!force && !ignoreMountedMedia && shouldReleaseFinishedGalleryWelcomeGuard()) {
        releaseFinishedGalleryWelcomeGuard(true, reason || "gallery_ready");
        return true;
    }
    if (!force && !ignoreMountedMedia && countExistingFinishedGalleryMedia() > 0) {
        const preview = getWelcomePreviewElement();
        rememberFinishedGalleryWelcomeSource(preview);
        let applied = false;
        getWelcomePreviewGuardNodes().forEach((node) => {
            applied = markWelcomePreviewGuardNode(node) || applied;
        });
        setFinishedGalleryOverlayActive(true);
        try {
            document.documentElement.classList.remove("simpai-gallery-browser-welcome-pending");
            document.documentElement.classList.remove("simpai-gallery-browser-loading-silent");
        } catch (e) {}
        hideWelcomePreviewForFinishedGallery(reason || "gallery_has_media");
        simpaiUiTrace("log", "[UI-TRACE] gallery_browser.welcome_guard_fast_media", { reason: reason || "gallery_has_media", applied });
        return applied;
    }
    if (shouldHideWelcomePreviewDuringGalleryBrowserLoading(reason, options)) {
        return hideWelcomePreviewDuringGalleryBrowserLoading(reason || "gallery_loading");
    }
    const preview = getWelcomePreviewElement();
    rememberFinishedGalleryWelcomeSource(preview);
    const placeholder = preview ? null : ensureFinishedGalleryWelcomePlaceholder();
    let applied = false;
    getWelcomePreviewGuardNodes().forEach((node) => {
        try { clearWelcomePreviewHiddenForGalleryNode(node); } catch (e) {}
        applied = markWelcomePreviewGuardNode(node) || applied;
    });
    if (placeholder) {
        applied = markWelcomePreviewGuardNode(placeholder) || applied;
    }
    try {
        document.documentElement.classList.remove("simpai-gallery-browser-loading-silent");
        document.documentElement.classList.add("simpai-gallery-browser-welcome-pending");
    } catch (e) {}
    setFinishedGalleryOverlayActive(true);
    simpaiUiTrace("log", "[UI-TRACE] gallery_browser.welcome_guard_apply", { reason: reason || "gallery_loading", applied });
    return applied;
}

function releaseFinishedGalleryWelcomeGuard(hidePreview, reason) {
    try { window.clearTimeout(finishedGalleryWelcomeGuardTimer); } catch (e) {}
    finishedGalleryWelcomeGuardTimer = null;
    finishedGalleryWelcomeGuardUntil = 0;
    finishedGalleryWelcomeGuardHoldStaleUntil = 0;
    try {
        document.documentElement.classList.remove("simpai-gallery-browser-welcome-pending");
        document.documentElement.classList.remove("simpai-gallery-browser-loading-silent");
    } catch (e) {}
    const preview = getWelcomePreviewElement();
    const gallery = getFinishedGalleryBrowserElement("finished_gallery") || document.getElementById("finished_gallery");
    const sameRow = !!(
        preview
        && gallery
        && preview.closest
        && gallery.closest
        && preview.closest(".row") === gallery.closest(".row")
    );
    const closedForSurfaceRefresh = isFinishedGalleryBrowserClosedForSurfaceRefresh();
    const keepOverlay = !closedForSurfaceRefresh && !!hidePreview && sameRow && (countRenderedFinishedGalleryItems() || 0) > 0;
    setFinishedGalleryOverlayActive(keepOverlay);
    getWelcomePreviewGuardNodes().forEach((node) => {
        let owned = false;
        try { owned = node.dataset.simpleaiGalleryWelcomeGuard === "1"; } catch (e) {}
        if (!owned) return;
        if (keepOverlay) {
            markWelcomePreviewGuardNode(node);
            return;
        }
        try { delete node.dataset.simpleaiGalleryWelcomeGuard; } catch (e) {}
        try { node.style.removeProperty("display"); } catch (e) {}
        try { node.style.removeProperty("visibility"); } catch (e) {}
    });
    if (hidePreview && ((countRenderedFinishedGalleryItems() || 0) > 0 || countExistingFinishedGalleryMedia() > 0)) {
        if (!closedForSurfaceRefresh) {
            setFinishedGalleryBrowserHasMediaState(true, reason || "gallery_done");
            hideWelcomePreviewForFinishedGallery(reason || "gallery_done", { sameRow });
        }
    }
    if (!keepOverlay) {
        removeFinishedGalleryWelcomePlaceholder();
    }
    simpaiUiTrace("log", "[UI-TRACE] gallery_browser.welcome_guard_release", { reason: reason || "gallery_done", keepOverlay, hidePreview: !!hidePreview });
}

function scheduleFinishedGalleryWelcomeGuard(reason, options) {
    try { window.clearTimeout(finishedGalleryWelcomeGuardTimer); } catch (e) {}
    const ignoreMountedMedia = shouldIgnoreMountedGalleryMediaForWelcomeGuard(reason, options);
    if (!ignoreMountedMedia && hasMountedFinishedGalleryBrowserMedia()) {
        finishFinishedGalleryMediaSurface(reason || "gallery_ready");
        return;
    }
    if (!ignoreMountedMedia && shouldReleaseFinishedGalleryWelcomeGuard()) {
        releaseFinishedGalleryWelcomeGuard(true, reason || "gallery_ready");
        return;
    }
    if (Date.now() > finishedGalleryWelcomeGuardUntil) {
        applyFinishedGalleryWelcomeGuard(`${reason || "gallery_loading"}:timeout_keep_welcome`, { force: Date.now() < finishedGalleryWelcomeGuardHoldStaleUntil });
        return;
    }
    applyFinishedGalleryWelcomeGuard(reason, Object.assign({ force: Date.now() < finishedGalleryWelcomeGuardHoldStaleUntil }, options || {}));
    finishedGalleryWelcomeGuardTimer = window.setTimeout(() => {
        scheduleFinishedGalleryWelcomeGuard(`${reason || "gallery_loading"}+guard`, options);
    }, 120);
}

function keepWelcomePreviewUntilFinishedGalleryReady(reason) {
    setFinishedGalleryBrowserHasMediaState(false, reason || "gallery_loading");
    finishedGalleryWelcomeGuardUntil = Math.max(finishedGalleryWelcomeGuardUntil, Date.now() + 8000);
    const options = { ignoreMountedMedia: true };
    applyFinishedGalleryWelcomeGuard(reason, options);
    scheduleFinishedGalleryWelcomeGuard(reason, options);
}

function forceWelcomePreviewUntilFinishedGalleryReady(reason) {
    setFinishedGalleryBrowserHasMediaState(false, reason || "gallery_loading");
    finishedGalleryWelcomeGuardUntil = Math.max(finishedGalleryWelcomeGuardUntil, Date.now() + 8000);
    finishedGalleryWelcomeGuardHoldStaleUntil = Math.max(finishedGalleryWelcomeGuardHoldStaleUntil, Date.now() + 220);
    const options = { force: true, ignoreMountedMedia: true };
    applyFinishedGalleryWelcomeGuard(reason, options);
    scheduleFinishedGalleryWelcomeGuard(reason, options);
}

function settleFinishedGalleryWelcomeGuardAfterLoad(reason) {
    let mediaSurfaceFinished = false;
    let staleSettleLogged = false;
    const settleRequestId = Number(finishedGalleryBrowserState.activeRequestId || 0);
    const settleFolder = normalizeFinishedGalleryBrowserFolderValue(
        finishedGalleryBrowserState.userFolder || finishedGalleryBrowserState.folder || ""
    );
    const settleMediaType = getFinishedGalleryBrowserMode(finishedGalleryBrowserState.mediaType);
    const settleLoaded = Number(finishedGalleryBrowserState.loaded || 0);
    const isCurrentSettle = () => {
        if (settleLoaded <= 0) return false;
        if (Number(finishedGalleryBrowserState.loaded || 0) <= 0) return false;
        if (settleRequestId && Number(finishedGalleryBrowserState.activeRequestId || 0) !== settleRequestId) return false;
        const currentFolder = normalizeFinishedGalleryBrowserFolderValue(
            finishedGalleryBrowserState.userFolder || finishedGalleryBrowserState.folder || ""
        );
        if (settleFolder && currentFolder && currentFolder !== settleFolder) return false;
        if (settleMediaType && getFinishedGalleryBrowserMode(finishedGalleryBrowserState.mediaType) !== settleMediaType) return false;
        return true;
    };
    [0, 80, 220, 520, 1000, 1600, 2600].forEach((delay) => {
        window.setTimeout(() => {
            try {
                if (!isCurrentSettle()) {
                    if (!staleSettleLogged) {
                        staleSettleLogged = true;
                        simpaiUiTrace("log", "[UI-TRACE] gallery_browser.welcome_guard_stale_settle_ignored", {
                            reason: reason || "gallery_load",
                            requestId: settleRequestId,
                            folder: settleFolder,
                            mediaType: settleMediaType,
                        });
                    }
                    return;
                }
                if (hasMountedFinishedGalleryBrowserMedia()) {
                    if (mediaSurfaceFinished && !shouldRefreshFinishedGalleryMediaSurface()) return;
                    finishFinishedGalleryMediaSurface(`${reason || "gallery_load"}+${delay}ms`);
                    mediaSurfaceFinished = true;
                } else {
                    clearSimpleAICatalogLinkedGalleryHidden(`${reason || "gallery_load"}+${delay}ms`);
                    applyFinishedGalleryWelcomeGuard(`${reason || "gallery_load"}+${delay}ms`);
                }
            } catch (e) {}
        }, delay);
    });
}

function syncFinishedGalleryBrowserStatusFromRenderedGallery(mediaType, reason) {
    if (isSimpleAIPresetGallerySuppressed()) return false;
    const mode = getFinishedGalleryBrowserMode(mediaType);
    const guard = arguments.length > 2 ? arguments[2] : null;
    if (shouldSkipGalleryMediaSwitchCallback(mode, guard)) {
        return false;
    }
    const count = countRenderedFinishedGalleryItems();
    if (count === null) return false;
    if (
        count === 0
        && galleryMediaSwitchLockedMode === mode
        && Date.now() < galleryMediaSwitchLockedUntil
    ) {
        simpaiUiTrace("log", "[UI-TRACE] gallery_browser.status_from_rendered_deferred", { reason: reason || "rendered_gallery", mode, count });
        return false;
    }
    if (count > 0 && Date.now() >= finishedGalleryWelcomeGuardHoldStaleUntil) {
        if (hasFinishedGalleryBrowserLoadedMediaState()) {
            releaseFinishedGalleryWelcomeGuard(true, reason || "rendered_gallery");
        } else {
            simpaiUiTrace("log", "[UI-TRACE] gallery_browser.status_from_rendered_ignored", { reason: reason || "rendered_gallery", mode, count });
            return false;
        }
    }
    try { syncGalleryMediaSwitch(mode, 0, "rendered_status"); } catch (e) {}
    simpaiUiTrace("log", "[UI-TRACE] gallery_browser.status_from_rendered", { reason: reason || "rendered_gallery", mode, count });
    return true;
}

function scheduleFinishedGalleryBrowserStatusSyncFromRenderedGallery(mediaType, reason) {
    const mode = getFinishedGalleryBrowserMode(mediaType);
    const request = window.__simpleaiGalleryMediaSwitchRequest || null;
    const guarded = String(reason || "").indexOf("gallery_media_switch.") === 0;
    const guard = {
        guarded,
        requestMarker: request && request.marker ? request.marker : "",
        requestMode: request && request.mode ? request.mode : "",
        scheduledMode: mode,
        scheduledAt: Date.now(),
        seq: ++galleryMediaSwitchStatusSyncSeq,
    };
    [0, 80, 220, 520, 1000, 1600, 2600].forEach((delay) => {
        setTimeout(() => {
            try { syncFinishedGalleryBrowserStatusFromRenderedGallery(mode, `${reason || "media_switch"}+${delay}ms`, guard); } catch (e) {}
        }, delay);
    });
}

function getFinishedGalleryBrowserContentParent(root) {
    if (!root) return null;
    const label = root.querySelector(":scope > button.label-wrap") || root.querySelector("button.label-wrap");
    const body = label ? label.nextElementSibling : null;
    if (!body || !root.contains(body)) return null;
    return body.querySelector(":scope > .column") || body.querySelector(".column") || body;
}

function setFinishedGalleryBrowserNativeFolderDisplay(folder) {
    const value = String(folder || "").trim();
    const root = getFinishedGalleryBrowserElement("gallery_browser_folder") || document.getElementById("gallery_browser_folder");
    if (!root || !value) return false;
    persistFinishedGalleryBrowserFolder(value);
    try { root.dataset.simpleaiGalleryBrowserFolder = value; } catch (e) {}
    try { root.setAttribute("data-sai-folder-label", value); } catch (e) {}
    try { root.setAttribute("data-value", value); } catch (e) {}
    try { root.setAttribute("title", value); } catch (e) {}
    const input = root.querySelector('input[role="listbox"], input');
    if (input) {
        try { input.value = value; } catch (e) {}
        try { input.setAttribute("value", value); } catch (e) {}
    }
    const select = root.querySelector("select");
    if (select && Array.from(select.options || []).some((option) => option.value === value)) {
        try { select.value = value; } catch (e) {}
    }
    scheduleGalleryBrowserFolderDisplaySync();
    return true;
}

function updateFinishedGalleryBrowserFolders(data) {
    const select = document.querySelector("#finished_gallery_browser_panel [data-gallery-browser-folder]");
    const folders = Array.isArray(data?.folders) ? data.folders : finishedGalleryBrowserState.folders;
    finishedGalleryBrowserState.folders = folders || [];
    const selected = data?.folder || finishedGalleryBrowserState.userFolder || finishedGalleryBrowserState.folder || "";
    setFinishedGalleryBrowserNativeFolderDisplay(selected);
    if (!select) return;
    const previous = select.value;
    select.innerHTML = "";
    if (!folders || !folders.length) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = simpleAIGalleryBrowserText("Recent folders", "最近文件夹");
        select.appendChild(option);
    } else {
        folders.forEach((folder) => {
            const option = document.createElement("option");
            option.value = folder;
            option.textContent = folder;
            select.appendChild(option);
        });
    }
    if (selected && Array.from(select.options).some((option) => option.value === selected)) {
        select.value = selected;
    } else if (previous && Array.from(select.options).some((option) => option.value === previous)) {
        select.value = previous;
    }
}

function syncFinishedGalleryBrowserControls() {
    const root = getFinishedGalleryBrowserElement("finished_images_catalog");
    if (!root) return false;
    const toolbar = getFinishedGalleryBrowserElement("gallery_browser_toolbar");
    const oldPanel = document.getElementById("finished_gallery_browser_panel");
    if (toolbar) {
        if (oldPanel) oldPanel.remove();
        try { syncSimpleAIGalleryFrostCheckbox(); } catch (e) {}
        try { bindGalleryBrowserFolderDisplay(); } catch (e) {}
        try { syncFinishedGalleryBrowserLocalizedControls(); } catch (e) {}
        return true;
    }
    if (isFinishedGalleryNativeToolbarExpected()) {
        if (oldPanel) oldPanel.remove();
        return false;
    }
    const switchRow = getFinishedGalleryBrowserElement("gallery_media_switch_row");
    const contentParent = getFinishedGalleryBrowserContentParent(root);
    if (!contentParent) return false;
    let panel = oldPanel;
    if (!panel) {
        panel = document.createElement("div");
        panel.id = "finished_gallery_browser_panel";
        panel.className = "simpleai-main-gallery-browser";
    }
    if (!panel.querySelector("[data-gallery-browser-left]")) {
        panel.innerHTML = [
            '<div class="simpleai-main-gallery-browser-left" data-gallery-browser-left>',
            '<select data-gallery-browser-folder></select>',
            '<span data-gallery-browser-status></span>',
            '<button type="button" data-gallery-browser-refresh title="Refresh current folder">Refresh</button>',
            '</div>',
            '<div class="simpleai-main-gallery-browser-switch" data-gallery-browser-switch></div>',
            '<div class="simpleai-main-gallery-browser-right" data-gallery-browser-right>',
            '<button type="button" data-gallery-browser-more title="Load more">Load more</button>',
            '</div>'
        ].join("");
    }
    if (panel.parentElement !== contentParent) {
        contentParent.insertBefore(panel, contentParent.firstChild);
    }
    const switchSlot = panel.querySelector("[data-gallery-browser-switch]");
    if (switchRow && switchSlot && switchRow.parentElement !== switchSlot) {
        switchSlot.appendChild(switchRow);
    }
    try { syncSimpleAIGalleryFrostCheckbox(); } catch (e) {}
    try { syncFinishedGalleryBrowserLocalizedControls(); } catch (e) {}
    const select = panel.querySelector("[data-gallery-browser-folder]");
    const refresh = panel.querySelector("[data-gallery-browser-refresh]");
    const more = panel.querySelector("[data-gallery-browser-more]");
    if (select && !select.options.length) {
        updateFinishedGalleryBrowserFolders({});
    }
    if (select && !select.__simpleaiMainGalleryBrowserBound) {
        select.__simpleaiMainGalleryBrowserBound = true;
        select.addEventListener("change", () => {
            clearSimpleAIPresetSwitchGalleryHidden("gallery_browser_folder_change");
            const previousFolder = normalizeFinishedGalleryBrowserFolderValue(finishedGalleryBrowserState.userFolder || finishedGalleryBrowserState.folder || "");
            const silentStatus = shouldSilenceFinishedGalleryBrowserLoadingStatus({}, true, select.value, previousFolder);
            finishedGalleryBrowserState.userFolder = select.value;
            finishedGalleryBrowserState.folder = select.value;
            select.dataset.userSelectedFolder = select.value;
            if (silentStatus) {
                beginFinishedGalleryBrowserSilentLoadingStatus(getFinishedGalleryBrowserStableStatusText(), 2600);
            } else {
                setFinishedGalleryBrowserStatus("Loading...");
            }
            refreshFinishedGalleryBrowser({ folder: select.value, reset: true, force: true, silentStatus });
        });
    }
    if (refresh && !refresh.__simpleaiMainGalleryBrowserBound) {
        refresh.__simpleaiMainGalleryBrowserBound = true;
        refresh.addEventListener("click", () => {
            clearSimpleAIPresetSwitchGalleryHidden("gallery_browser_refresh");
            refreshFinishedGalleryBrowser({ folder: select ? select.value : "", reset: true, force: true });
        });
    }
    if (more && !more.__simpleaiMainGalleryBrowserBound) {
        more.__simpleaiMainGalleryBrowserBound = true;
        more.addEventListener("click", () => {
            clearSimpleAIPresetSwitchGalleryHidden("gallery_browser_more");
            refreshFinishedGalleryBrowser({ reset: false });
        });
    }
    return true;
}

function syncFinishedGalleryBrowserMoreButton() {
    const loading = isFinishedGalleryBrowserRequestBusy();
    try { document.documentElement.classList.toggle("simpai-gallery-browser-request-busy", loading); } catch (e) {}
    const folders = Array.isArray(finishedGalleryBrowserState.folders) ? finishedGalleryBrowserState.folders : [];
    const folder = finishedGalleryBrowserState.userFolder || finishedGalleryBrowserState.folder || "";
    const folderIndex = folders.indexOf(folder);
    const hasFolderList = folders.length > 0 && folderIndex >= 0;
    const hasNewer = !hasFolderList || folderIndex > 0;
    const hasOlder = !hasFolderList || folderIndex + 1 < folders.length;
    [
        ["gallery_browser_folder", false],
        ["gallery_browser_prev_folder_btn", !hasNewer],
        ["gallery_browser_next_folder_btn", !hasOlder],
        ["gallery_browser_refresh_btn", false],
        ["gallery_browser_more_btn", !finishedGalleryBrowserState.hasMore],
        ["gallery_images_btn", false],
        ["gallery_videos_btn", false],
    ].forEach(([id, disabled]) => {
        setFinishedGalleryBrowserControlDisabled(getFinishedGalleryBrowserElement(id) || document.getElementById(id), disabled);
    });
    const fallbackSelect = document.querySelector("#finished_gallery_browser_panel [data-gallery-browser-folder]");
    if (fallbackSelect) fallbackSelect.disabled = false;
    const refresh = document.querySelector("#finished_gallery_browser_panel [data-gallery-browser-refresh]");
    if (refresh) {
        refresh.disabled = false;
        refresh.classList.toggle("is-disabled", refresh.disabled);
    }
    const more = document.querySelector("#finished_gallery_browser_panel [data-gallery-browser-more]");
    if (more) {
        more.disabled = !finishedGalleryBrowserState.hasMore;
        more.classList.toggle("is-disabled", more.disabled);
    }
    try { syncFinishedGalleryBrowserLocalizedControls(); } catch (e) {}
}

function parseFinishedGalleryStatTotal(value) {
    const text = String(value || "").trim();
    if (!text) return null;
    const first = text.split(",")[0];
    const parsed = Number.parseInt(first, 10);
    if (Number.isFinite(parsed)) return Math.max(0, parsed);
    return parseFinishedCatalogCount(text);
}

function normalizeFinishedGalleryBrowserDimensions(value) {
    const result = {};
    if (!value || typeof value !== "object") return result;
    Object.entries(value).forEach(([path, dimensions]) => {
        const source = dimensions && typeof dimensions === "object" ? dimensions : {};
        const width = Math.round(Number(source.width || source[0] || 0));
        const height = Math.round(Number(source.height || source[1] || 0));
        if (!path || !(width > 0 && height > 0)) return;
        result[String(path)] = {
            width,
            height,
            media_type: source.media_type || source.mediaType || "",
        };
    });
    return result;
}

function normalizeFinishedGalleryMediaPath(value) {
    let path = String(value || "").trim();
    if (!path) return "";
    try { path = decodeURIComponent(path); } catch (e) {}
    path = path.replace(/\\/g, "/");
    if (/^\/[a-z]:\//i.test(path)) path = path.slice(1);
    return path.toLowerCase();
}

function decodeFinishedGalleryPreviewOriginalPath(source) {
    const text = String(source || "");
    if (!text) return "";
    try {
        const url = new URL(text, document.baseURI || window.location?.href || location.href);
        const fileName = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() || "");
        const match = fileName.match(/^simpai_gprev__([A-Za-z0-9_-]+)__[0-9a-f]{16}\.jpg$/);
        if (!match) return "";
        const encoded = match[1].replace(/-/g, "+").replace(/_/g, "/");
        const binary = atob(encoded + "=".repeat((4 - encoded.length % 4) % 4));
        const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
        return window.TextDecoder
            ? new TextDecoder("utf-8").decode(bytes)
            : decodeURIComponent(Array.from(bytes, (byte) => "%" + byte.toString(16).padStart(2, "0")).join(""));
    } catch (e) {
        return "";
    }
}

function finishedGalleryMediaPathFromElement(node) {
    if (!node) return "";
    const source = String(node.currentSrc || node.src || node.getAttribute?.("src") || "").trim();
    if (!source || /^(?:data|blob):/i.test(source)) return "";
    const previewOriginalPath = decodeFinishedGalleryPreviewOriginalPath(source);
    if (previewOriginalPath) return previewOriginalPath;
    try {
        const url = new URL(source, document.baseURI || window.location?.href || location.href);
        const match = url.pathname.match(/\/(?:gradio_api\/)?file=(.+)$/i);
        return match ? decodeURIComponent(match[1]) : "";
    } catch (e) {
        const match = source.match(/\/(?:gradio_api\/)?file=([^?#]+)/i);
        if (!match) return "";
        try { return decodeURIComponent(match[1]); } catch (_e) { return match[1]; }
    }
}

function finishedGalleryMediaPathsMatch(left, right) {
    const normalizedLeft = normalizeFinishedGalleryMediaPath(left);
    const normalizedRight = normalizeFinishedGalleryMediaPath(right);
    return !!normalizedLeft && normalizedLeft === normalizedRight;
}

function finishedGalleryBrowserMappedPath(path) {
    const dimensions = finishedGalleryBrowserState.dimensions || {};
    const exact = dimensions[String(path)];
    if (exact) return String(path);
    const normalizedPath = normalizeFinishedGalleryMediaPath(path);
    if (!normalizedPath) return "";
    const keys = Object.keys(dimensions);
    const normalizedMatch = keys.find((key) => normalizeFinishedGalleryMediaPath(key) === normalizedPath);
    if (normalizedMatch) return normalizedMatch;
    const fileName = normalizedPath.split("/").pop() || "";
    if (!fileName) return "";
    const fileNameMatches = keys.filter((key) => (normalizeFinishedGalleryMediaPath(key).split("/").pop() || "") === fileName);
    return fileNameMatches.length === 1 ? fileNameMatches[0] : "";
}

function mergeFinishedGalleryBrowserDimensions(incoming, reset) {
    const normalized = normalizeFinishedGalleryBrowserDimensions(incoming);
    if (reset) {
        finishedGalleryBrowserState.dimensions = normalized;
        return normalized;
    }
    finishedGalleryBrowserState.dimensions = Object.assign({}, finishedGalleryBrowserState.dimensions || {}, normalized);
    return finishedGalleryBrowserState.dimensions;
}

function finishedGalleryBrowserDimensionForPath(path) {
    if (!path) return null;
    const dimensions = finishedGalleryBrowserState.dimensions || {};
    const mappedPath = finishedGalleryBrowserMappedPath(path);
    return mappedPath ? dimensions[mappedPath] : null;
}

function finishedGalleryVideoDimensionsFromHost(host) {
    const video = host?.matches?.("video") ? host : host?.querySelector?.("video");
    if (!video) return null;
    const width = Math.round(Number(video.videoWidth || 0));
    const height = Math.round(Number(video.videoHeight || 0));
    return width > 0 && height > 0 ? { width, height, media_type: "video" } : null;
}

function mediaResolutionElementFromHost(host) {
    if (!host) return null;
    return host?.matches?.("img, video") ? host : (host?.querySelector?.("img, video") || null);
}

function applyFinishedGalleryResolutionBadge(host, path, options) {
    if (!host) return false;
    const media = mediaResolutionElementFromHost(host);
    const mediaSource = String(media?.currentSrc || media?.src || media?.getAttribute?.("src") || "").trim();
    const sourcePath = finishedGalleryMediaPathFromElement(media);
    const mappedSourcePath = finishedGalleryBrowserMappedPath(sourcePath);
    const usesScaledPreview = !!decodeFinishedGalleryPreviewOriginalPath(mediaSource);
    const indexedPathMatchesSource = !sourcePath || !path || (!!mappedSourcePath && finishedGalleryMediaPathsMatch(mappedSourcePath, path));
    const dimensions = finishedGalleryBrowserDimensionForPath(sourcePath)
        || (indexedPathMatchesSource ? finishedGalleryBrowserDimensionForPath(path) : null)
        || (!usesScaledPreview ? mediaResolutionDimensionsFromElement(media) : null)
        || (!usesScaledPreview ? finishedGalleryVideoDimensionsFromHost(host) : null);
    if (dimensions && typeof window.simpleaiApplyMediaResolutionBadge === "function") {
        return window.simpleaiApplyMediaResolutionBadge(host, dimensions);
    }
    if (sourcePath && path && !indexedPathMatchesSource) {
        return typeof window.simpleaiClearMediaResolutionBadge === "function"
            ? window.simpleaiClearMediaResolutionBadge(host)
            : false;
    }
    if (options?.keepExistingOnMissing) return false;
    if (typeof window.simpleaiClearMediaResolutionBadge === "function") {
        return window.simpleaiClearMediaResolutionBadge(host);
    }
    return false;
}

function clearFinishedGalleryResolutionBadges(root, keepHost) {
    if (!root || !root.querySelectorAll) return false;
    let cleared = false;
    root.querySelectorAll(".simpai-media-resolution-badge").forEach((badge) => {
        try {
            if (keepHost && keepHost.contains && keepHost.contains(badge)) return;
            if (!badge.hidden) {
                badge.hidden = true;
                cleared = true;
            }
        } catch (e) {}
    });
    return cleared;
}

function clearFinishedGalleryPreviewResolutionBadges(gallery, keepHost) {
    if (!gallery || !gallery.querySelector) return false;
    const preview = gallery.querySelector(".gallery-container > .preview");
    return preview ? clearFinishedGalleryResolutionBadges(preview, keepHost) : false;
}

function mediaResolutionDimensionsFromElement(node) {
    if (!node) return null;
    const width = Math.round(Number(node.naturalWidth || node.videoWidth || 0));
    const height = Math.round(Number(node.naturalHeight || node.videoHeight || 0));
    if (!(width > 8 && height > 8)) return null;
    return { width, height, media_type: node.tagName === "VIDEO" ? "video" : "image" };
}

function visibleGeneratedPreviewMediaHost(gallery) {
    if (!gallery || !gallery.querySelectorAll) return null;
    const candidates = Array.from(gallery.querySelectorAll(".preview .media-button, .media-button, button:has(img), button:has(video), img, video"));
    for (const candidate of candidates) {
        try {
            const style = window.getComputedStyle ? window.getComputedStyle(candidate) : null;
            const rect = candidate.getBoundingClientRect ? candidate.getBoundingClientRect() : null;
            if (style && (style.display === "none" || style.visibility === "hidden")) continue;
            if (rect && !(rect.width > 8 && rect.height > 8)) continue;
            const media = candidate.matches?.("img, video") ? candidate : candidate.querySelector?.("img, video");
            if (!mediaResolutionDimensionsFromElement(media)) continue;
            return candidate.matches?.("img, video") ? (candidate.parentElement || candidate) : candidate;
        } catch (e) {}
    }
    return null;
}

function syncPostGenerationPreviewResolutionBadge(gallery, reason) {
    if (!gallery) return false;
    const host = visibleGeneratedPreviewMediaHost(gallery);
    const media = mediaResolutionElementFromHost(host);
    const dimensions = mediaResolutionDimensionsFromElement(media);
    if (!host || !dimensions || typeof window.simpleaiApplyMediaResolutionBadge !== "function") {
        clearFinishedGalleryPreviewResolutionBadges(gallery);
        return false;
    }
    clearFinishedGalleryPreviewResolutionBadges(gallery, host);
    const applied = window.simpleaiApplyMediaResolutionBadge(host, dimensions);
    if (applied) {
        simpaiUiTrace("log", "[UI-TRACE] post_generation.resolution_badge_synced", {
            reason: reason || "post_generation",
            width: dimensions.width,
            height: dimensions.height,
        });
    }
    return applied;
}

function selectedFinishedGalleryPreviewIndex(gallery) {
    const thumbs = Array.from(gallery?.querySelectorAll?.(".gallery-container > .preview .thumbnails > .thumbnail-item") || []);
    const index = thumbs.findIndex((item) => item.classList.contains("selected") || item.getAttribute("aria-selected") === "true" || item.dataset?.selected === "true");
    if (index >= 0) return index;
    try {
        if (typeof selected_gallery_index === "function") {
            const globalIndex = selected_gallery_index();
            if (Number.isFinite(globalIndex) && globalIndex >= 0) return globalIndex;
        }
    } catch (e) {}
    return -1;
}

function syncFinishedGalleryGridResolutionBadges(gallery, gridItems, paths, reason) {
    if (!gallery || !gridItems || !gridItems.length) return false;
    let applied = 0;
    gridItems.forEach((item, index) => {
        if (applyFinishedGalleryResolutionBadge(item, paths && paths[index], { keepExistingOnMissing: true })) {
            applied += 1;
        }
    });
    if (applied > 0) {
        simpaiUiTrace("log", "[UI-TRACE] gallery_browser.grid_resolution_badges_synced", {
            reason: reason || "gallery_grid",
            applied,
            grid: gridItems.length,
            paths: Array.isArray(paths) ? paths.length : 0,
        });
    }
    return applied > 0;
}

function finishedGalleryResolutionBadgeRoots() {
    const roots = [];
    const add = (node) => {
        if (node && !roots.includes(node)) roots.push(node);
    };
    try { add(getFinishedGalleryBrowserElement("finished_gallery")); } catch (e) {}
    try { add(document.getElementById("finished_gallery")); } catch (e) {}
    try { add(getFinishedGalleryBrowserElement("final_gallery")); } catch (e) {}
    try { add(document.getElementById("final_gallery")); } catch (e) {}
    return roots;
}

function syncFinishedGalleryResolutionBadgesForGallery(gallery, reason) {
    if (!gallery) return false;
    const hasBrowserPaths = Array.isArray(finishedGalleryBrowserState.paths) && finishedGalleryBrowserState.paths.length > 0;
    const paths = hasBrowserPaths ? finishedGalleryBrowserState.paths : [];
    const gridItems = Array.from(gallery.querySelectorAll(".grid-wrap .gallery-item"));
    const previewButton = gallery.querySelector(".gallery-container > .preview .media-button");
    if (gridItems.length) {
        const gridApplied = syncFinishedGalleryGridResolutionBadges(gallery, gridItems, paths, reason);

        if (hasBrowserPaths && previewButton) {
            const previewIndex = selectedFinishedGalleryPreviewIndex(gallery);
            applyFinishedGalleryResolutionBadge(previewButton, previewIndex >= 0 ? paths[previewIndex] : "");
        }
        simpaiUiTrace("log", "[UI-TRACE] gallery_browser.resolution_badges_synced", {
            reason: reason || "gallery_browser",
            paths: paths.length,
            grid: gridItems.length,
            applied: gridApplied,
        });
        return gridApplied || hasBrowserPaths;
    }
    if (hasBrowserPaths && previewButton) {
        const previewIndex = selectedFinishedGalleryPreviewIndex(gallery);
        const applied = applyFinishedGalleryResolutionBadge(previewButton, previewIndex >= 0 ? paths[previewIndex] : "", { keepExistingOnMissing: true });
        if (applied) {
            simpaiUiTrace("log", "[UI-TRACE] gallery_browser.preview_resolution_badge_synced", {
                reason: reason || "gallery_browser",
                paths: paths.length,
            });
        }
        return applied;
    }
    const postGenerationSurface = document.documentElement.classList.contains("simpai-post-generation-result-surface")
        || document.documentElement.classList.contains("simpai-comparison-preview");
    const galleryBrowserOverlayActive = document.documentElement.classList.contains("simpai-gallery-browser-overlay-active")
        || !!gallery.closest?.(".simpai-gallery-browser-overlay-row");
    const hasGeneratedPreviewMedia = !!visibleGeneratedPreviewMediaHost(gallery);
    if (postGenerationSurface) {
        return syncPostGenerationPreviewResolutionBadge(gallery, reason || "post_generation");
    }
    if (hasGeneratedPreviewMedia && !galleryBrowserOverlayActive) {
        return syncPostGenerationPreviewResolutionBadge(gallery, reason || "generated_preview");
    }
    clearFinishedGalleryPreviewResolutionBadges(gallery);
    return false;
}

function syncFinishedGalleryResolutionBadges(reason) {
    let applied = false;
    finishedGalleryResolutionBadgeRoots().forEach((gallery) => {
        applied = syncFinishedGalleryResolutionBadgesForGallery(gallery, reason) || applied;
    });
    return applied;
}
window.syncFinishedGalleryResolutionBadges = syncFinishedGalleryResolutionBadges;

function scheduleFinishedGalleryResolutionBadges(reason) {
    window.clearTimeout(finishedGalleryResolutionBadgeTimer);
    finishedGalleryResolutionBadgeTimer = window.setTimeout(() => {
        finishedGalleryResolutionBadgeTimer = null;
        syncFinishedGalleryResolutionBadges(reason || "raf");
        window.setTimeout(() => syncFinishedGalleryResolutionBadges(reason || "settled"), 160);
    }, 80);
}

function isFinishedGalleryResolutionBadgeMutation(mutation) {
    if (!mutation) return false;
    const target = mutation.target;
    try {
        if (target && target.nodeType === 1 && target.closest?.(".simpai-media-resolution-badge")) return true;
    } catch (e) {}
    const nodes = [
        ...Array.from(mutation.addedNodes || []),
        ...Array.from(mutation.removedNodes || []),
    ];
    if (!nodes.length) return false;
    return nodes.every((node) => {
        try {
            if (node.nodeType === 3) return true;
            if (node.nodeType !== 1) return false;
            return !!(
                node.matches?.(".simpai-media-resolution-badge")
                || node.closest?.(".simpai-media-resolution-badge")
            );
        } catch (e) {
            return false;
        }
    });
}

function bindFinishedGalleryResolutionBadgeObserverForGallery(gallery) {
    if (!gallery || gallery.dataset.simpleaiResolutionBadgeObserver === "1") return false;
    gallery.dataset.simpleaiResolutionBadgeObserver = "1";
    const observer = new MutationObserver((mutations) => {
        if (mutations.length && mutations.every(isFinishedGalleryResolutionBadgeMutation)) return;
        scheduleFinishedGalleryResolutionBadges("gallery_dom_mutation");
    });
    observer.observe(gallery, { childList: true, subtree: true });
    gallery.addEventListener("loadedmetadata", (event) => {
        if (event.target && event.target.tagName === "VIDEO") {
            scheduleFinishedGalleryResolutionBadges("gallery_video_metadata");
        }
    }, true);
    gallery.addEventListener("load", (event) => {
        if (event.target && event.target.tagName === "IMG") {
            scheduleFinishedGalleryResolutionBadges("gallery_image_load");
        }
    }, true);
    gallery.addEventListener("click", (event) => {
        if (event.target?.closest?.(".thumbnail-item, .gallery-item, .media-button")) {
            scheduleFinishedGalleryResolutionBadges("gallery_click");
        }
    }, true);
    scheduleFinishedGalleryResolutionBadges("gallery_observer_bind");
    return true;
}

function bindFinishedGalleryResolutionBadgeObserver() {
    let bound = false;
    finishedGalleryResolutionBadgeRoots().forEach((gallery) => {
        bound = bindFinishedGalleryResolutionBadgeObserverForGallery(gallery) || bound;
    });
    return bound;
}

function syncFinishedGalleryBrowserTopbarState(data, reason) {
    const previous = topbarLastSystemParams || window.simpleaiTopbarSystemParams || {};
    const mediaType = (data && data.media_type) || finishedGalleryBrowserState.mediaType || getFinishedGalleryBrowserMode();
    const folder = (data && data.folder) || finishedGalleryBrowserState.userFolder || finishedGalleryBrowserState.folder || "";
    if (folder) persistFinishedGalleryBrowserFolder(folder);
    const next = Object.assign({}, previous, {
        __gallery_engine_type: mediaType,
        engine_type: mediaType,
        gallery_state: "main_browser",
        __main_gallery_browser_folder: folder,
        __main_gallery_browser_next_offset: finishedGalleryBrowserState.nextOffset || 0,
        __main_gallery_browser_has_more: !!finishedGalleryBrowserState.hasMore,
    });
    if (data && Array.isArray(data.paths)) {
        next.__main_gallery_browser_paths = data.paths;
    } else if (Number(finishedGalleryBrowserState.loaded || 0) === 0) {
        next.__main_gallery_browser_paths = [];
    }
    if (data && data.dimensions && typeof data.dimensions === "object") {
        next.__main_gallery_browser_dimensions = data.dimensions;
    } else if (finishedGalleryBrowserState.dimensions && typeof finishedGalleryBrowserState.dimensions === "object") {
        next.__main_gallery_browser_dimensions = finishedGalleryBrowserState.dimensions;
    }
    if (data && Array.isArray(data.folders)) {
        next.__main_gallery_browser_folders = data.folders;
    } else if (Array.isArray(finishedGalleryBrowserState.folders)) {
        next.__main_gallery_browser_folders = finishedGalleryBrowserState.folders;
    }
    window.simpleaiTopbarSystemParams = next;
    topbarLastSystemParams = next;
    simpaiUiTrace("log", "[UI-TRACE] gallery_browser.topbar_state_write", {
        reason: reason || "gallery_browser",
        folder,
        mediaType,
        loaded: finishedGalleryBrowserState.loaded,
    });
    return next;
}

function readFinishedGalleryBrowserPayloadBridgeValue() {
    const root = getFinishedGalleryBrowserElement("gallery_browser_payload") || document.getElementById("gallery_browser_payload");
    const field = root && root.querySelector ? root.querySelector("textarea, input") : null;
    return field ? String(field.value || field.getAttribute("value") || "") : "";
}

function writeFinishedGalleryBrowserPayloadBridge(body, payload) {
    const text = String(body || "");
    const root = getFinishedGalleryBrowserElement("gallery_browser_payload") || document.getElementById("gallery_browser_payload");
    const field = root && root.querySelector ? root.querySelector("textarea, input") : null;
    if (!field) return false;
    const writeValue = (value) => {
        try {
            const proto = Object.getPrototypeOf(field);
            const descriptor = proto ? Object.getOwnPropertyDescriptor(proto, "value") : null;
            if (descriptor && descriptor.set) descriptor.set.call(field, value);
            else field.value = value;
        } catch (e) {
            try { field.value = value; } catch (_e) {}
        }
        try { field.setAttribute("value", value); } catch (e) {}
        try {
            field.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
        } catch (e) {
            try { field.dispatchEvent(new Event("input", { bubbles: true })); } catch (_e) {}
        }
        try { field.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) {}
        try { field.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Enter" })); } catch (e) {}
    };
    writeValue("");
    writeValue(text);
    try { field.dispatchEvent(new Event("blur", { bubbles: true })); } catch (e) {}
    try {
        root.dataset.simpleaiGalleryBrowserPayloadRequestId = String(payload && payload.request_id || "");
        root.dataset.simpleaiGalleryBrowserPayloadFolder = String(payload && payload.folder || "");
    } catch (e) {}
    if (typeof setGradioTextboxValue === "function") {
        try { setGradioTextboxValue("gallery_browser_payload", text); } catch (e) {}
    }
    return readFinishedGalleryBrowserPayloadBridgeValue() === text;
}

function getFinishedGalleryBrowserPendingPayloadText() {
    const pending = finishedGalleryBrowserState && finishedGalleryBrowserState.pendingPayload;
    if (pending && typeof pending === "object") {
        try { return JSON.stringify(pending); } catch (e) {}
    }
    return readFinishedGalleryBrowserPayloadBridgeValue();
}
window.getFinishedGalleryBrowserPendingPayloadText = getFinishedGalleryBrowserPendingPayloadText;

function isFinishedGalleryBrowserLoadingStatusVisible() {
    const root = getFinishedGalleryBrowserStatusRoot();
    const text = root ? String(root.textContent || "") : "";
    return isFinishedGalleryBrowserLoadingText(text);
}

function shouldSilenceFinishedGalleryBrowserLoadingStatus(options, reset, requestedFolder, previousFolder) {
    if (options && options.silentStatus) return true;
    if (reset === false) return false;
    const targetFolder = normalizeFinishedGalleryBrowserFolderValue(requestedFolder || "");
    if (!targetFolder) return false;
    const currentFolder = normalizeFinishedGalleryBrowserFolderValue(
        previousFolder
        || finishedGalleryBrowserState.userFolder
        || finishedGalleryBrowserState.folder
        || (window.simpleaiTopbarSystemParams && window.simpleaiTopbarSystemParams.__main_gallery_browser_folder)
        || ""
    );
    if (!currentFolder || currentFolder === targetFolder) return false;
    const hasKnownMedia = Number(finishedGalleryBrowserState.loaded || 0) > 0
        || (Array.isArray(finishedGalleryBrowserState.paths) && finishedGalleryBrowserState.paths.length > 0)
        || countExistingFinishedGalleryMedia() > 0;
    if (hasKnownMedia) return true;
    const statusRoot = getFinishedGalleryBrowserElement("gallery_browser_status") || document.getElementById("gallery_browser_status");
    const statusText = statusRoot ? String(statusRoot.textContent || "").trim() : "";
    return !!statusText && !isFinishedGalleryBrowserLoadingText(statusText);
}

function refreshFinishedGalleryBrowser(options) {
    const opts = Object.assign({}, options || {});
    if (isSimpleAIPresetGallerySuppressed()) return false;
    if (opts.delay) {
        window.setTimeout(() => {
            delete opts.delay;
            refreshFinishedGalleryBrowser(opts);
        }, opts.delay);
        return true;
    }
    if (!syncFinishedGalleryBrowserControls()) return false;
    const catalogRoot = getFinishedGalleryBrowserElement("finished_images_catalog");
    const catalogOpen = !catalogRoot || isSimpleAIPresetCatalogOpen(catalogRoot) || Date.now() < simpleAIFinishedCatalogPreparedOpenUntil;
    if (!opts.allowClosedCatalog && catalogRoot && !catalogOpen) return false;
    const shouldGuardSurface = catalogOpen && !opts.preload;
    const mediaType = getFinishedGalleryBrowserMode(opts.mediaType);
    const optionFolderValue = opts.folder !== undefined ? normalizeFinishedGalleryBrowserFolderValue(opts.folder || "") : "";
    const reset = opts.reset !== false;
    const previousFolderForStatus = normalizeFinishedGalleryBrowserFolderValue(
        finishedGalleryBrowserState.userFolder
        || finishedGalleryBrowserState.folder
        || (window.simpleaiTopbarSystemParams && window.simpleaiTopbarSystemParams.__main_gallery_browser_folder)
        || ""
    );
    if (optionFolderValue) {
        finishedGalleryBrowserState.userFolder = optionFolderValue;
        finishedGalleryBrowserState.folder = optionFolderValue;
        setFinishedGalleryBrowserNativeFolderDisplay(optionFolderValue);
    }
    const select = document.querySelector("#finished_gallery_browser_panel [data-gallery-browser-folder]");
    const requestedFolder = optionFolderValue
        ? optionFolderValue
        : (select && select.value ? select.value : finishedGalleryBrowserState.userFolder || finishedGalleryBrowserState.folder || "");
    const shouldPreferBridgeForState = !!opts.preferBridge || (
        opts.reset !== false
        && shouldPreferFinishedGalleryBrowserBridge(topbarLastSystemParams || window.simpleaiTopbarSystemParams || {}, requestedFolder)
    );
    const silentStatus = shouldSilenceFinishedGalleryBrowserLoadingStatus(opts, reset, requestedFolder, previousFolderForStatus);
    if (silentStatus) {
        beginFinishedGalleryBrowserSilentLoadingStatus(getFinishedGalleryBrowserStableStatusText(), reset ? 3200 : 1600);
    }
    try { syncGalleryMediaSwitch(mediaType, 0, "browser_refresh"); } catch (e) {}
    if (isFinishedGalleryBrowserRequestBusy()) {
        if (opts.replaceActive && reset) {
            finishedGalleryBrowserState.queuedOptions = null;
            finishedGalleryBrowserState.bridgeRetryCount = 0;
            finishedGalleryBrowserPreloadInFlight = false;
        } else if (opts.folder !== undefined || opts.force) {
            finishedGalleryBrowserState.queuedOptions = Object.assign({}, opts, { force: true });
            simpaiUiTrace("log", "[UI-TRACE] gallery_browser.request_queued", {
                folder: opts.folder || requestedFolder || "",
                mediaType,
            });
            return false;
        } else {
            return false;
        }
    }
    if (!silentStatus && opts.reset !== false && shouldGuardSurface) keepWelcomePreviewUntilFinishedGalleryReady("gallery_browser_refresh_start");
    const nativeButtonId = opts.reset === false ? "gallery_browser_more_btn" : "gallery_browser_refresh_btn";
    if (!shouldPreferBridgeForState && typeof clickGradioButton === "function" && getFinishedGalleryBrowserElement(nativeButtonId)) {
        const nativeRoot = getFinishedGalleryBrowserElement(nativeButtonId);
        const nativeButton = nativeRoot && nativeRoot.matches && nativeRoot.matches("button") ? nativeRoot : nativeRoot?.querySelector?.("button");
        if (nativeButton && nativeButton.disabled) return false;
        return clickGradioButton(nativeButtonId);
    }
    window.clearTimeout(finishedGalleryBrowserBridgeRetryTimer);
    if (!reset && !finishedGalleryBrowserState.hasMore) return false;
    const grid = getFinishedGalleryGridWrap();
    const requestId = ++finishedGalleryBrowserRequestSeq;
    if (catalogOpen && !opts.preload) {
        markFinishedGalleryBrowserCatalogOpenIntent(requestId, "gallery_browser_bridge_request");
    }
    const payload = {
        media_type: mediaType,
        folder: requestedFolder,
        offset: reset ? 0 : (finishedGalleryBrowserState.nextOffset || finishedGalleryBrowserState.loaded || 0),
        limit: opts.limit || 36,
        reset: reset,
        query: opts.query || "",
        request_id: requestId,
        silent_status: silentStatus,
        clear_compare: !(opts.preload || opts.preservePostGenerationCompare)
    };
    if (grid) {
        finishedGalleryBrowserState.restoreScrollTop = reset ? 0 : grid.scrollTop;
    }
    finishedGalleryBrowserState.pendingPayload = payload;
    finishedGalleryBrowserState.activeRequestId = requestId;
    finishedGalleryBrowserState.loading = true;
    finishedGalleryBrowserPreloadInFlight = !!opts.preload && !catalogOpen;
    scheduleFinishedGalleryBrowserRequestWatchdog(requestId, "gallery_browser_bridge_request", 15000);
    syncFinishedGalleryBrowserMoreButton();
    if (!silentStatus && reset && shouldGuardSurface) keepWelcomePreviewUntilFinishedGalleryReady("gallery_browser_bridge_start");
    if (!silentStatus) setFinishedGalleryBrowserStatus(reset ? "Loading..." : "Loading more...");
    const body = JSON.stringify(payload);
    const canSet = writeFinishedGalleryBrowserPayloadBridge(body, payload);
    const scheduled = canSet && typeof clickGradioButton === "function";
    if (scheduled) {
        window.setTimeout(() => {
            if (Number(finishedGalleryBrowserState.activeRequestId || 0) !== requestId) {
                simpaiUiTrace("log", "[UI-TRACE] gallery_browser.payload_bridge_stale_timer_ignored", {
                    request_id: requestId,
                    activeRequestId: finishedGalleryBrowserState.activeRequestId || 0,
                });
                return;
            }
            if (readFinishedGalleryBrowserPayloadBridgeValue() !== body && !writeFinishedGalleryBrowserPayloadBridge(body, payload)) {
                finishedGalleryBrowserState.loading = false;
                finishedGalleryBrowserPreloadInFlight = false;
                syncFinishedGalleryBrowserMoreButton();
                if (!silentStatus) setFinishedGalleryBrowserStatus("");
                simpaiUiTrace("warn", "[UI-TRACE] gallery_browser.payload_bridge_write_failed", {
                    folder: payload.folder,
                    request_id: payload.request_id,
                });
                return;
            }
            const clicked = clickGradioButton("gallery_browser_load_btn");
            if (clicked) {
                finishedGalleryBrowserState.bridgeRetryCount = 0;
                return;
            }
            if (finishedGalleryBrowserState.activeRequestId === requestId) {
                finishedGalleryBrowserState.loading = false;
                finishedGalleryBrowserPreloadInFlight = false;
                syncFinishedGalleryBrowserMoreButton();
                if (!silentStatus) setFinishedGalleryBrowserStatus("");
                if (opts.retry !== false && finishedGalleryBrowserState.bridgeRetryCount < 8) {
                    finishedGalleryBrowserState.bridgeRetryCount += 1;
                    const retryOpts = Object.assign({}, opts, { delay: 350, retry: true });
                    finishedGalleryBrowserBridgeRetryTimer = window.setTimeout(() => {
                        delete retryOpts.delay;
                        refreshFinishedGalleryBrowser(retryOpts);
                    }, retryOpts.delay);
                }
            }
        }, 220);
    }
    if (!scheduled) {
        finishedGalleryBrowserState.loading = false;
        finishedGalleryBrowserPreloadInFlight = false;
        syncFinishedGalleryBrowserMoreButton();
        if (!silentStatus) setFinishedGalleryBrowserStatus("");
        if (opts.retry !== false && finishedGalleryBrowserState.bridgeRetryCount < 8) {
            finishedGalleryBrowserState.bridgeRetryCount += 1;
            const retryOpts = Object.assign({}, opts, { delay: 350, retry: true });
            finishedGalleryBrowserBridgeRetryTimer = window.setTimeout(() => {
                delete retryOpts.delay;
                refreshFinishedGalleryBrowser(retryOpts);
            }, retryOpts.delay);
        }
    }
    return !!scheduled;
}

function computeFinishedGalleryBrowserStepTargetFolder(baseFolder, folders, action) {
    const folderList = Array.isArray(folders)
        ? folders.map((item) => normalizeFinishedGalleryBrowserFolderValue(item)).filter(Boolean)
        : [];
    const current = normalizeFinishedGalleryBrowserFolderValue(baseFolder || "");
    if (!current || !folderList.length) return "";
    const index = folderList.indexOf(current);
    if (index < 0) return "";
    const actionText = String(action || "");
    const delta = /folder\.prev|\.prev/i.test(actionText) ? -1 : (/folder\.next|\.next/i.test(actionText) ? 1 : 0);
    if (!delta) return "";
    const targetIndex = Math.max(0, Math.min(folderList.length - 1, index + delta));
    return folderList[targetIndex] || "";
}

function markFinishedGalleryBrowserProgrammaticFolderChange(folder, requestId, reason) {
    const value = normalizeFinishedGalleryBrowserFolderValue(folder || "");
    if (!value) return false;
    finishedGalleryBrowserSuppressNativeFolderChangeValue = value;
    finishedGalleryBrowserSuppressNativeFolderChangeSourceRequestId = Number(requestId || 0);
    finishedGalleryBrowserSuppressNativeFolderChangeUntil = Date.now() + 1800;
    simpaiUiTrace("log", "[UI-TRACE] gallery_browser.native_folder_change_suppressed_mark", {
        reason: reason || "gallery_browser_native",
        folder: value,
        requestId: Number(requestId || 0),
    });
    return true;
}

function shouldIgnoreFinishedGalleryBrowserNativeFolderChange(folder) {
    const value = normalizeFinishedGalleryBrowserFolderValue(folder || "");
    if (Date.now() > finishedGalleryBrowserSuppressNativeFolderChangeUntil) return false;
    const sourceRequestId = Number(finishedGalleryBrowserSuppressNativeFolderChangeSourceRequestId || 0);
    if (sourceRequestId && Number(finishedGalleryBrowserState.activeRequestId || 0) === sourceRequestId && finishedGalleryBrowserState.loading) {
        return true;
    }
    return !!value && value === finishedGalleryBrowserSuppressNativeFolderChangeValue;
}

function beginFinishedGalleryBrowserNativeRequest(action, folder, state) {
    const requestId = ++finishedGalleryBrowserRequestSeq;
    const reason = action || "gallery_browser.native";
    const nextState = state && typeof state === "object" ? state : {};
    try { delete nextState.__main_gallery_browser_request_ignored; } catch (e) {}
    const stateMode = nextState.__gallery_engine_type || nextState.engine_type;
    const mediaType = getFinishedGalleryBrowserMode(stateMode);
    const inputFolder = normalizeFinishedGalleryBrowserFolderValue(folder || "");
    const stateFolder = normalizeFinishedGalleryBrowserFolderValue(nextState.__main_gallery_browser_folder || finishedGalleryBrowserState.userFolder || finishedGalleryBrowserState.folder || "");
    const preferStateFolder = /\.more|gallery_browser\.more|\.refresh|gallery_browser\.refresh|\.prev|gallery_browser\.folder\.prev|\.next|gallery_browser\.folder\.next/.test(String(reason));
    const normalizedFolder = preferStateFolder ? (stateFolder || inputFolder) : (inputFolder || stateFolder);
    const stepFolderAction = /\.prev|\.next|folder\.prev|folder\.next/.test(String(reason));
    const reset = !/\.more|gallery_browser\.more/.test(String(reason));
    const payloadFolder = stepFolderAction ? "" : normalizedFolder;
    const stepFolders = stepFolderAction
        ? (Array.isArray(nextState.__main_gallery_browser_folders) ? nextState.__main_gallery_browser_folders : finishedGalleryBrowserState.folders)
        : null;
    const stepTargetFolder = stepFolderAction ? computeFinishedGalleryBrowserStepTargetFolder(normalizedFolder, stepFolders, reason) : "";
    const statusTargetFolder = stepTargetFolder || payloadFolder || normalizedFolder;
    const duplicatePendingRequest = isFinishedGalleryBrowserSamePendingRequest(mediaType, statusTargetFolder, reset);
    const silentStatus = duplicatePendingRequest || shouldSilenceFinishedGalleryBrowserLoadingStatus({}, reset, statusTargetFolder, stateFolder);
    if (silentStatus) {
        beginFinishedGalleryBrowserSilentLoadingStatus(getFinishedGalleryBrowserStableStatusText(), reset ? 3200 : 1600);
    }
    if (duplicatePendingRequest) {
        nextState.__main_gallery_browser_request_ignored = true;
        nextState.__main_gallery_browser_request_id = finishedGalleryBrowserState.activeRequestId || requestId;
        nextState.__main_gallery_browser_request_action = reason;
        nextState.__main_gallery_browser_request_folder = statusTargetFolder;
        nextState.__main_gallery_browser_request_input_folder = inputFolder;
        simpaiUiTrace("log", "[UI-TRACE] gallery_browser.native_duplicate_request_suppressed", {
            request_id: nextState.__main_gallery_browser_request_id,
            folder: statusTargetFolder,
            action: reason,
        });
        return nextState;
    }
    if (/folder\.change/i.test(String(reason)) && shouldIgnoreFinishedGalleryBrowserNativeFolderChange(inputFolder || normalizedFolder)) {
        finishedGalleryBrowserIgnoredNativeFolderChangeUntil = Date.now() + 2200;
        finishedGalleryBrowserIgnoredNativeFolderChangeValue = inputFolder || normalizedFolder;
        nextState.__main_gallery_browser_request_ignored = true;
        nextState.__main_gallery_browser_request_id = requestId;
        nextState.__main_gallery_browser_request_action = reason;
        nextState.__main_gallery_browser_request_folder = inputFolder || normalizedFolder;
        nextState.__main_gallery_browser_request_input_folder = inputFolder;
        simpaiUiTrace("log", "[UI-TRACE] gallery_browser.native_folder_change_suppressed", {
            request_id: requestId,
            folder: inputFolder || normalizedFolder,
            sourceRequestId: finishedGalleryBrowserSuppressNativeFolderChangeSourceRequestId,
        });
        return nextState;
    }
    finishedGalleryBrowserState.activeRequestId = requestId;
    finishedGalleryBrowserState.loading = true;
    finishedGalleryBrowserState.pendingPayload = {
        request_id: requestId,
        media_type: mediaType,
        folder: payloadFolder,
        reset,
        native_action: reason,
        silent_status: silentStatus,
    };
    finishedGalleryBrowserState.mediaType = mediaType;
    scheduleFinishedGalleryBrowserRequestWatchdog(requestId, reason, 15000);
    if (payloadFolder) {
        finishedGalleryBrowserState.folder = payloadFolder;
        finishedGalleryBrowserState.userFolder = payloadFolder;
        persistFinishedGalleryBrowserFolder(payloadFolder);
    }
    finishedGalleryBrowserPreloadInFlight = false;
    nextState.__main_gallery_browser_request_id = requestId;
    nextState.__main_gallery_browser_request_action = reason;
    nextState.__main_gallery_browser_request_folder = normalizedFolder;
    nextState.__main_gallery_browser_request_input_folder = inputFolder;
    nextState.__main_gallery_browser_request_media_type = mediaType;
    nextState.__main_gallery_browser_active_request_id = requestId;
    if (stepFolderAction) {
        const targetFolder = stepTargetFolder;
        if (targetFolder && targetFolder !== normalizedFolder) {
            markFinishedGalleryBrowserProgrammaticFolderChange(targetFolder, requestId, reason);
        }
    }
    window.__simpleaiGalleryBrowserNativeRequest = {
        request_id: requestId,
        action: reason,
        folder: normalizedFolder,
        media_type: mediaType,
        started_at: Date.now(),
    };
    syncFinishedGalleryBrowserMoreButton();
    const catalogRoot = getFinishedGalleryBrowserElement("finished_images_catalog");
    const catalogOpen = !catalogRoot || isSimpleAIPresetCatalogOpen(catalogRoot) || Date.now() < simpleAIFinishedCatalogPreparedOpenUntil;
    if (catalogOpen && !silentStatus) {
        markFinishedGalleryBrowserCatalogOpenIntent(requestId, reason);
        keepWelcomePreviewUntilFinishedGalleryReady("gallery_browser_loading");
    }
    if (!silentStatus) setFinishedGalleryBrowserStatus(reset ? "Loading..." : "Loading more...");
    simpaiUiTrace("log", "[UI-TRACE] gallery_browser.native_request_start", window.__simpleaiGalleryBrowserNativeRequest);
    return nextState;
}
window.beginFinishedGalleryBrowserNativeRequest = beginFinishedGalleryBrowserNativeRequest;

function markFinishedGalleryBrowserLoading() {
    const pending = finishedGalleryBrowserState && finishedGalleryBrowserState.pendingPayload;
    const silentStatus = !!(pending && pending.silent_status);
    finishedGalleryBrowserState.loading = true;
    if (!silentStatus) setFinishedGalleryBrowserHasMediaState(false, "gallery_browser_loading");
    const catalogRoot = getFinishedGalleryBrowserElement("finished_images_catalog");
    if (!silentStatus && !finishedGalleryBrowserPreloadInFlight && (!catalogRoot || isSimpleAIPresetCatalogOpen(catalogRoot))) {
        keepWelcomePreviewUntilFinishedGalleryReady("gallery_browser_loading");
    }
    syncFinishedGalleryBrowserMoreButton();
}

function syncFinishedGalleryBrowserAfterLoad(stateJson) {
    const data = parseFinishedGalleryBrowserState(stateJson);
    if (data && data.stale) {
        clearFinishedGalleryBrowserRequestWatchdog();
        finishedGalleryBrowserState.loading = false;
        finishedGalleryBrowserPreloadInFlight = false;
        finishedGalleryBrowserState.pendingPayload = null;
        finishedGalleryBrowserState.queuedOptions = null;
        finishedGalleryBrowserState.restoreScrollTop = null;
        syncFinishedGalleryBrowserMoreButton();
        setFinishedGalleryBrowserStatus("");
        try { closeSimpleAIOpenGalleriesForPresetSwitch("gallery_browser_stale_after_preset", { suppressMs: 700 }); } catch (e) {}
        return false;
    }
    if (data && data.request_id && Number(data.request_id) !== finishedGalleryBrowserState.activeRequestId) {
        simpaiUiTrace("log", "[UI-TRACE] gallery_browser.stale_load_ignored", {
            request_id: data.request_id,
            activeRequestId: finishedGalleryBrowserState.activeRequestId,
        });
        return false;
    }
    finishedGalleryBrowserState.loading = false;
    finishedGalleryBrowserPreloadInFlight = false;
    clearFinishedGalleryBrowserRequestWatchdog();
    if (!data) {
        setFinishedGalleryBrowserStatus("Browser state parse failed.", true);
        syncFinishedGalleryBrowserMoreButton();
        return false;
    }
    if (data.ok === false) {
        setFinishedGalleryBrowserStatus(data.error || "Media browser failed.", true);
        syncFinishedGalleryBrowserMoreButton();
        return true;
    }
    const pendingPayload = finishedGalleryBrowserState.pendingPayload;
    const pendingFolder = pendingPayload && pendingPayload.folder;
    const pendingRequestId = Number(pendingPayload && pendingPayload.request_id || 0);
    const responseRequestId = Number(data.request_id || pendingRequestId || finishedGalleryBrowserState.activeRequestId || 0);
    finishedGalleryBrowserState.pendingPayload = null;
    const queuedBeforeApply = finishedGalleryBrowserState.queuedOptions;
    if (queuedBeforeApply && queuedBeforeApply.folder !== undefined && queuedBeforeApply.folder !== data.folder) {
        finishedGalleryBrowserState.queuedOptions = null;
        refreshFinishedGalleryBrowser(queuedBeforeApply);
        return false;
    }
    const dataFolder = normalizeFinishedGalleryBrowserFolderValue(data.folder || "");
    const pendingFolderNormalized = normalizeFinishedGalleryBrowserFolderValue(pendingFolder || "");
    if (pendingRequestId && data.request_id && Number(data.request_id) !== pendingRequestId) {
        simpaiUiTrace("log", "[UI-TRACE] gallery_browser.bridge_request_mismatch_ignored", {
            request_id: data.request_id,
            pendingRequestId,
            dataFolder,
            pendingFolder: pendingFolderNormalized,
        });
        syncFinishedGalleryBrowserMoreButton();
        return false;
    }
    if (pendingFolderNormalized && dataFolder && dataFolder !== pendingFolderNormalized) {
        simpaiUiTrace("warn", "[UI-TRACE] gallery_browser.folder_response_mismatch_ignored", {
            dataFolder,
            pendingFolder: pendingFolderNormalized,
            request_id: data.request_id || null,
            pendingRequestId,
        });
        finishedGalleryBrowserState.folder = pendingFolderNormalized;
        finishedGalleryBrowserState.userFolder = pendingFolderNormalized;
        setFinishedGalleryBrowserNativeFolderDisplay(pendingFolderNormalized);
        const retryKey = `${pendingFolderNormalized}|${finishedGalleryBrowserState.mediaType || data.media_type || ""}`;
        const canRetry = finishedGalleryBrowserState.bridgeMismatchRetryKey !== retryKey
            || Number(finishedGalleryBrowserState.bridgeMismatchRetryCount || 0) < 1;
        finishedGalleryBrowserState.bridgeMismatchRetryKey = retryKey;
        finishedGalleryBrowserState.bridgeMismatchRetryCount = Number(finishedGalleryBrowserState.bridgeMismatchRetryCount || 0) + 1;
        if (canRetry) {
            if (!pendingPayload?.silent_status && !isFinishedGalleryBrowserLoadingStatusVisible()) {
                setFinishedGalleryBrowserStatus("Loading...");
            }
            if (!pendingPayload?.silent_status) keepWelcomePreviewUntilFinishedGalleryReady("gallery_browser_loading");
            window.setTimeout(() => {
                refreshFinishedGalleryBrowser({
                    folder: pendingFolderNormalized,
                    reset: true,
                    force: true,
                    preferBridge: true,
                    retry: false,
                    silentStatus: true,
                });
            }, 260);
        } else {
            if (!pendingPayload?.silent_status) setFinishedGalleryBrowserStatus("");
            try { releaseFinishedGalleryWelcomeGuard(false, "gallery_browser_response_mismatch_retry_exhausted"); } catch (e) {}
        }
        syncFinishedGalleryBrowserMoreButton();
        return false;
    }
    const resolvedFolder = dataFolder || pendingFolderNormalized || finishedGalleryBrowserState.userFolder || finishedGalleryBrowserState.folder || "";
    const loadedMediaType = getFinishedGalleryBrowserMode(data.media_type || finishedGalleryBrowserState.mediaType);
    const activeMediaLock = getActiveGalleryMediaSwitchLock();
    if (activeMediaLock && activeMediaLock.mode && activeMediaLock.mode !== loadedMediaType) {
        finishedGalleryBrowserState.loading = false;
        finishedGalleryBrowserPreloadInFlight = false;
        finishedGalleryBrowserState.pendingPayload = null;
        syncFinishedGalleryBrowserMoreButton();
        simpaiUiTrace("log", "[UI-TRACE] gallery_browser.media_lock_response_ignored", {
            responseMode: loadedMediaType,
            requestedMode: activeMediaLock.mode,
            folder: resolvedFolder,
            request_id: data.request_id || null,
        });
        window.setTimeout(() => {
            refreshFinishedGalleryBrowserLatest({
                folder: resolvedFolder,
                mediaType: activeMediaLock.mode,
            }, "media_switch_locked_mode_after_load");
        }, 0);
        return false;
    }
    if (!shouldSkipGalleryMediaSwitchCallback(loadedMediaType, { source: "browser_after_load" })) {
        finishedGalleryBrowserState.mediaType = loadedMediaType;
    }
    finishedGalleryBrowserState.folder = resolvedFolder;
    finishedGalleryBrowserState.userFolder = resolvedFolder;
    finishedGalleryBrowserState.bridgeMismatchRetryKey = "";
    finishedGalleryBrowserState.bridgeMismatchRetryCount = 0;
    finishedGalleryBrowserState.loaded = Number(data.loaded || 0);
    finishedGalleryBrowserState.hasMore = !!data.has_more;
    finishedGalleryBrowserState.nextOffset = Number(data.next_offset || finishedGalleryBrowserState.loaded || 0);
    if (Array.isArray(data.folders)) finishedGalleryBrowserState.folders = data.folders;
    if (Array.isArray(data.paths)) finishedGalleryBrowserState.paths = data.paths;
    if (data.dimensions && typeof data.dimensions === "object") {
        mergeFinishedGalleryBrowserDimensions(data.dimensions, true);
    }
    updateFinishedGalleryBrowserFolders(Object.assign({}, data, { folder: resolvedFolder }));
    syncFinishedGalleryBrowserTopbarState(Object.assign({}, data, { folder: resolvedFolder }), "gallery_browser_after_load");
    setFinishedGalleryBrowserStatus(simpleAIGalleryBrowserCountStatus(finishedGalleryBrowserState.loaded, finishedGalleryBrowserState.mediaType));
    scheduleFinishedGalleryBrowserCatalogLabelSync(
        data.finished_nums_pages || data.finishedNumsPages || "",
        finishedGalleryBrowserState.mediaType,
        "gallery_browser_after_load",
        responseRequestId
    );
    try { syncGalleryMediaSwitch(finishedGalleryBrowserState.mediaType, 0, "browser_after_load"); } catch (e) {}
    restoreFinishedGalleryBrowserCatalogOpenAfterLoad(responseRequestId, "gallery_browser_after_load");
    const catalogRootAfterRestore = getFinishedGalleryBrowserElement("finished_images_catalog");
    if (catalogRootAfterRestore && !isSimpleAIPresetCatalogOpen(catalogRootAfterRestore)) {
        try { closeSimpleAICatalogLinkedGallery("gallery_browser_after_load_catalog_closed", { resetBrowserState: false }); } catch (e) {}
        try { collapseFinishedImagesCatalogClosedHitbox("gallery_browser_after_load_catalog_closed"); } catch (e) {}
        syncFinishedGalleryBrowserMoreButton();
        return true;
    }
    if (finishedGalleryBrowserState.loaded > 0) {
        releaseFinishedGalleryBrowserRenderedMediaEmpty("gallery_browser_after_load");
        setFinishedGalleryBrowserHasMediaState(true, "gallery_browser_after_load");
        try { clearPostGenerationSupportSurface(); } catch (e) {}
        const catalogRoot = getFinishedGalleryBrowserElement("finished_images_catalog");
        if (!catalogRoot || isSimpleAIPresetCatalogOpen(catalogRoot)) {
            settleFinishedGalleryWelcomeGuardAfterLoad("gallery_browser_after_load");
        }
    } else {
        markFinishedGalleryBrowserRenderedMediaEmpty("gallery_browser_after_load_empty");
        if (shouldDeferEmptyGalleryBrowserRestoreDuringOpen("gallery_browser_after_load_empty")) {
            deferEmptyGalleryBrowserRestoreDuringOpen("gallery_browser_after_load_empty_deferred");
        } else {
            restoreWelcomePreviewForEmptyGalleryBrowser("gallery_browser_after_load_empty");
        }
    }
    syncFinishedGalleryBrowserMoreButton();
    syncFinishedGalleryResolutionBadges("gallery_browser_after_load");
    scheduleFinishedGalleryResolutionBadges("gallery_browser_after_load");
    window.setTimeout(() => {
        const grid = getFinishedGalleryGridWrap();
        if (grid && typeof finishedGalleryBrowserState.restoreScrollTop === "number") {
            grid.scrollTop = finishedGalleryBrowserState.restoreScrollTop;
        }
        finishedGalleryBrowserState.restoreScrollTop = null;
        try {
            if (isSimpleAIGalleryFrostEnabled()) resetSimpleAIGalleryFrostForNewMedia(true);
        } catch (e) {}
        const queued = finishedGalleryBrowserState.queuedOptions;
        finishedGalleryBrowserState.queuedOptions = null;
        if (queued && (queued.folder !== undefined || queued.force)) {
            refreshFinishedGalleryBrowser(queued);
        }
        scheduleFinishedGalleryResolutionBadges("gallery_browser_after_load_settled");
    }, 120);
    return true;
}

function syncFinishedGalleryBrowserAfterMediaSwitch(browserStateJson, stat, mode, state, reason) {
    if (arguments.length < 5) {
        reason = state;
        state = mode;
        mode = stat;
        stat = browserStateJson;
        browserStateJson = "";
    }
    const browserData = parseFinishedGalleryBrowserState(browserStateJson);
    if (browserData && browserData.ok !== false && (browserData.folder || browserData.media_type || Array.isArray(browserData.paths))) {
        const dataMode = getFinishedGalleryBrowserMode(browserData.media_type || mode);
        const dataFolder = normalizeFinishedGalleryBrowserFolderValue(browserData.folder || "");
        const dataPaths = Array.isArray(browserData.paths) ? browserData.paths : [];
        const dataLoaded = Number.isFinite(Number(browserData.loaded)) ? Number(browserData.loaded) : dataPaths.length;
        const data = Object.assign({}, browserData, {
            media_type: dataMode,
            folder: dataFolder || finishedGalleryBrowserState.userFolder || finishedGalleryBrowserState.folder || "",
            loaded: Math.max(0, Math.floor(dataLoaded)),
            paths: dataPaths,
            dimensions: browserData.dimensions && typeof browserData.dimensions === "object" ? browserData.dimensions : {},
            folders: Array.isArray(browserData.folders) ? browserData.folders : finishedGalleryBrowserState.folders,
            next_offset: browserData.next_offset || dataLoaded,
            has_more: !!browserData.has_more,
        });
        if (!data.request_id) delete data.request_id;
        const applied = syncFinishedGalleryBrowserAfterLoad(JSON.stringify(data));
        if (applied !== false) {
            try { scheduleFinishedGalleryBrowserStatusSyncFromRenderedGallery(dataMode, reason || "gallery_media_switch"); } catch (e) {}
            return true;
        }
    }
    const previousMediaType = finishedGalleryBrowserState.mediaType;
    const previousLoaded = Number(finishedGalleryBrowserState.loaded || 0);
    const renderedCount = countRenderedFinishedGalleryItems();
    const params = state && typeof state === "object"
        ? mergeSimpleAITopbarSystemParamsForGallery(state, reason || "gallery_media_switch")
        : (topbarLastSystemParams || window.simpleaiTopbarSystemParams || {});
    const mediaType = getFinishedGalleryBrowserMode(mode || (params && (params.__gallery_engine_type || params.engine_type)));
    const statTotal = parseFinishedGalleryStatTotal(stat || (params && params.__finished_nums_pages));
    const statePaths = Array.isArray(params && params.__main_gallery_browser_paths) ? params.__main_gallery_browser_paths : null;
    const stateFolders = Array.isArray(params && params.__main_gallery_browser_folders) ? params.__main_gallery_browser_folders : null;
    const stateDimensions = params && params.__main_gallery_browser_dimensions && typeof params.__main_gallery_browser_dimensions === "object"
        ? params.__main_gallery_browser_dimensions
        : null;
    const paramsFolder = normalizeFinishedGalleryBrowserFolderValue(params && params.__main_gallery_browser_folder || "");
    const folder = paramsFolder || finishedGalleryBrowserState.userFolder || finishedGalleryBrowserState.folder || "";
    const mainBrowserActive = !!(params && params.gallery_state === "main_browser");
    if (!mainBrowserActive) {
        finishedGalleryBrowserState.loading = false;
        finishedGalleryBrowserState.pendingPayload = null;
        finishedGalleryBrowserState.queuedOptions = null;
        finishedGalleryBrowserState.restoreScrollTop = null;
        finishedGalleryBrowserState.mediaType = mediaType;
        finishedGalleryBrowserState.folder = "";
        finishedGalleryBrowserState.userFolder = "";
        finishedGalleryBrowserState.paths = [];
        finishedGalleryBrowserState.dimensions = {};
        finishedGalleryBrowserState.loaded = statTotal !== null ? statTotal : 0;
        finishedGalleryBrowserState.nextOffset = 0;
        finishedGalleryBrowserState.hasMore = false;
        finishedGalleryBrowserPreloadInFlight = false;
        clearFinishedGalleryBrowserParamsForResultState(params, reason || "gallery_media_switch.index");
        syncFinishedGalleryBrowserMoreButton();
        setFinishedGalleryBrowserStatus("");
        try { setFinishedGalleryBrowserNativeFolderDisplay(""); } catch (e) {}
        try { syncGalleryMediaSwitch(mediaType, 0, reason || "gallery_media_switch.index"); } catch (e) {}
        syncFinishedGalleryResolutionBadges(reason || "gallery_media_switch.index");
        scheduleFinishedGalleryResolutionBadges(reason || "gallery_media_switch.index");
        simpaiUiTrace("log", "[UI-TRACE] gallery_browser.media_switch_index_state", {
            reason: reason || "gallery_media_switch",
            mediaType,
            statTotal,
        });
        return true;
    }
    const staleEmptyStatePaths = mainBrowserActive
        && statePaths
        && statePaths.length === 0
        && previousMediaType === mediaType
        && previousLoaded > 0
        && renderedCount > 0;
    const usableStatePaths = staleEmptyStatePaths ? null : statePaths;
    if (mainBrowserActive) {
        finishedGalleryBrowserState.loading = false;
        finishedGalleryBrowserState.pendingPayload = null;
        finishedGalleryBrowserState.queuedOptions = null;
        finishedGalleryBrowserState.mediaType = mediaType;
        finishedGalleryBrowserState.folder = folder;
        finishedGalleryBrowserState.userFolder = folder;
        if (stateFolders) finishedGalleryBrowserState.folders = stateFolders;
        if (usableStatePaths) {
            finishedGalleryBrowserState.paths = usableStatePaths;
            finishedGalleryBrowserState.loaded = usableStatePaths.length;
        }
        if (stateDimensions) mergeFinishedGalleryBrowserDimensions(stateDimensions, true);
        syncFinishedGalleryBrowserTopbarState({
            media_type: mediaType,
            folder,
            paths: usableStatePaths || finishedGalleryBrowserState.paths || [],
            dimensions: stateDimensions || finishedGalleryBrowserState.dimensions || {},
            folders: stateFolders || finishedGalleryBrowserState.folders || [],
            next_offset: params && params.__main_gallery_browser_next_offset,
            has_more: !!(params && params.__main_gallery_browser_has_more),
        }, reason || "gallery_media_switch");
        syncFinishedGalleryBrowserMoreButton();
    }
    const loaded = mainBrowserActive
        ? (usableStatePaths ? usableStatePaths.length : (mediaType === previousMediaType ? Number(finishedGalleryBrowserState.loaded || previousLoaded || 0) : 0))
        : (statTotal !== null ? statTotal : (usableStatePaths ? usableStatePaths.length : 0));
    finishedGalleryBrowserState.loading = false;
    finishedGalleryBrowserState.pendingPayload = null;
    finishedGalleryBrowserState.queuedOptions = null;
    finishedGalleryBrowserState.mediaType = mediaType;
    finishedGalleryBrowserState.folder = folder;
    finishedGalleryBrowserState.userFolder = folder;
    finishedGalleryBrowserState.loaded = Number(loaded || 0);
    finishedGalleryBrowserState.hasMore = !!(params && params.__main_gallery_browser_has_more) && mediaType === (params.__gallery_engine_type || params.engine_type);
    finishedGalleryBrowserState.nextOffset = Number((params && params.__main_gallery_browser_next_offset) || finishedGalleryBrowserState.loaded || 0);
    if (stateFolders) finishedGalleryBrowserState.folders = stateFolders;
    if (usableStatePaths) finishedGalleryBrowserState.paths = usableStatePaths;
    if (stateDimensions) mergeFinishedGalleryBrowserDimensions(stateDimensions, true);
    const topbarData = { media_type: mediaType, folder };
    if (usableStatePaths) topbarData.paths = usableStatePaths;
    else if (finishedGalleryBrowserState.loaded === 0) topbarData.paths = [];
    topbarData.dimensions = stateDimensions || finishedGalleryBrowserState.dimensions || {};
    if (stateFolders) topbarData.folders = stateFolders;
    syncFinishedGalleryBrowserTopbarState(topbarData, reason || "gallery_media_switch");
    setFinishedGalleryBrowserStatus(simpleAIGalleryBrowserCountStatus(finishedGalleryBrowserState.loaded, mediaType));
    scheduleFinishedGalleryBrowserCatalogLabelSync(stat || (params && params.__finished_nums_pages) || "", mediaType, reason || "gallery_media_switch", params && params.__main_gallery_browser_request_id);
    restoreFinishedGalleryBrowserCatalogOpenAfterLoad(params && params.__main_gallery_browser_request_id, reason || "gallery_media_switch");
    if (finishedGalleryBrowserState.loaded > 0) {
        releaseFinishedGalleryBrowserRenderedMediaEmpty(reason || "gallery_media_switch");
        setFinishedGalleryBrowserHasMediaState(true, reason || "gallery_media_switch");
        settleFinishedGalleryWelcomeGuardAfterLoad(reason || "gallery_media_switch");
    } else {
        markFinishedGalleryBrowserRenderedMediaEmpty(reason || "gallery_media_switch_empty");
        restoreWelcomePreviewForEmptyGalleryBrowser(reason || "gallery_media_switch_empty");
    }
    syncFinishedGalleryBrowserMoreButton();
    syncFinishedGalleryResolutionBadges(reason || "gallery_media_switch");
    scheduleFinishedGalleryResolutionBadges(reason || "gallery_media_switch");
    return true;
}
window.syncFinishedGalleryBrowserAfterMediaSwitch = syncFinishedGalleryBrowserAfterMediaSwitch;

function getFinishedGalleryBrowserFolderFromPath(pathValue) {
    const parts = String(pathValue || "").replace(/\\/g, "/").split("/").filter(Boolean);
    return parts.length >= 2 ? parts[parts.length - 2] : "";
}

function inferFinishedGalleryBrowserNativeFolder(params, folders, reason) {
    const nativeRequest = window.__simpleaiGalleryBrowserNativeRequest || {};
    const action = String(reason || nativeRequest.action || "");
    const requestFolder = normalizeFinishedGalleryBrowserFolderValue(nativeRequest.folder || "");
    let folder = normalizeFinishedGalleryBrowserFolderValue(params && params.__main_gallery_browser_folder || finishedGalleryBrowserState.folder || "");
    if (/folder\.change/i.test(action) && requestFolder) return requestFolder;
    const baseFolder = requestFolder || folder;
    const folderList = Array.isArray(folders) ? folders.map((item) => normalizeFinishedGalleryBrowserFolderValue(item)).filter(Boolean) : [];
    const index = folderList.indexOf(baseFolder);
    if (/folder\.next/i.test(action) && index >= 0 && index + 1 < folderList.length) {
        folder = folderList[index + 1];
    } else if (/folder\.prev/i.test(action) && index > 0) {
        folder = folderList[index - 1];
    }
    return folder;
}

function syncFinishedGalleryBrowserAfterNativeLoad(stat, state, reason) {
    const rawState = state && typeof state === "object" ? state : {};
    if (/folder\.change/i.test(String(reason || ""))
        && Date.now() < finishedGalleryBrowserIgnoredNativeFolderChangeUntil
        && !rawState.__main_gallery_browser_request_id) {
        simpaiUiTrace("log", "[UI-TRACE] gallery_browser.native_folder_change_followup_ignored", {
            reason: reason || "gallery_browser_native",
            folder: finishedGalleryBrowserIgnoredNativeFolderChangeValue,
        });
        return false;
    }
    if (rawState.__main_gallery_browser_noop_response || rawState.__main_gallery_browser_request_ignored) {
        try { delete rawState.__main_gallery_browser_noop_response; } catch (e) {}
        try { delete rawState.__main_gallery_browser_request_ignored; } catch (e) {}
        try { delete rawState.__main_gallery_browser_request_folder; } catch (e) {}
        try { delete rawState.__main_gallery_browser_request_input_folder; } catch (e) {}
        simpaiUiTrace("log", "[UI-TRACE] gallery_browser.native_noop_ignored", {
            reason: reason || "gallery_browser_native",
        });
        return false;
    }
    const requestId = Number(rawState.__main_gallery_browser_request_id || 0);
    if (requestId && finishedGalleryBrowserState.activeRequestId && requestId !== Number(finishedGalleryBrowserState.activeRequestId || 0)) {
        simpaiUiTrace("log", "[UI-TRACE] gallery_browser.native_stale_ignored", {
            reason: reason || "gallery_browser_native",
            requestId,
            activeRequestId: finishedGalleryBrowserState.activeRequestId,
        });
        window.setTimeout(() => {
            try {
                const folder = finishedGalleryBrowserState.userFolder || finishedGalleryBrowserState.folder || "";
                if (folder) refreshFinishedGalleryBrowser({ folder, reset: true, force: true, silentStatus: true });
            } catch (e) {}
        }, 0);
        return false;
    }
    const params = mergeSimpleAITopbarSystemParamsForGallery(rawState, reason || "gallery_browser_native");
    const mode = (params && (params.__gallery_engine_type || params.engine_type)) || getFinishedGalleryBrowserMode();
    const nativeStatusText = String(stat || "");
    const nativeStatusCount = nativeStatusText.indexOf(",") === -1 ? parseFinishedCatalogCount(nativeStatusText) : null;
    const hasPathList = Array.isArray(params.__main_gallery_browser_paths);
    let paths = hasPathList ? params.__main_gallery_browser_paths : (Array.isArray(finishedGalleryBrowserState.paths) ? finishedGalleryBrowserState.paths : []);
    const folders = Array.isArray(params.__main_gallery_browser_folders) ? params.__main_gallery_browser_folders : finishedGalleryBrowserState.folders;
    const dimensions = params.__main_gallery_browser_dimensions && typeof params.__main_gallery_browser_dimensions === "object"
        ? params.__main_gallery_browser_dimensions
        : (finishedGalleryBrowserState.dimensions || {});
    const resolvedFolder = inferFinishedGalleryBrowserNativeFolder(params, folders, reason);
    const firstPathFolder = getFinishedGalleryBrowserFolderFromPath(paths && paths[0]);
    if (resolvedFolder && firstPathFolder && firstPathFolder !== resolvedFolder) {
        paths = [];
    }
    const moreAction = /\.more|gallery_browser\.more/.test(String(reason || (window.__simpleaiGalleryBrowserNativeRequest || {}).action || ""));
    const preserveExistingMorePage = moreAction
        && nativeStatusCount === 0
        && Array.isArray(paths)
        && paths.length > 0
        && (!resolvedFolder || !firstPathFolder || firstPathFolder === resolvedFolder);
    let loaded = nativeStatusCount !== null ? nativeStatusCount : (hasPathList ? paths.length : null);
    if (preserveExistingMorePage) {
        loaded = paths.length;
        simpaiUiTrace("warn", "[UI-TRACE] gallery_browser.native_more_empty_preserved", {
            reason: reason || "gallery_browser_native",
            folder: resolvedFolder,
            loaded,
        });
    }
    if (loaded === null) {
        const statusRoot = getFinishedGalleryBrowserElement("gallery_browser_status");
        const statusText = statusRoot ? String(statusRoot.textContent || "") : "";
        const statusCount = parseFinishedCatalogCount(statusText);
        if (statusCount !== null) loaded = statusCount;
    }
    if (loaded === null && hasMountedFinishedGalleryBrowserMedia()) {
        loaded = countExistingFinishedGalleryMedia() || 0;
    }
    if (loaded === null) loaded = 0;
    const data = {
        ok: true,
        media_type: mode,
        folder: resolvedFolder,
        loaded,
        paths,
        dimensions,
        folders,
        next_offset: params.__main_gallery_browser_next_offset || loaded,
        has_more: loaded >= 36 && !!params.__main_gallery_browser_has_more,
        request_id: requestId || finishedGalleryBrowserState.activeRequestId || null,
    };
    const missingNativeStatePaths = !!resolvedFolder
        && loaded > 0
        && (!hasPathList || !Array.isArray(paths) || !paths.length);
    const needsCompleteStateBridgeRefresh = !!resolvedFolder && (
        missingNativeStatePaths
        || (loaded >= 36 && (!Array.isArray(paths) || !paths.length || !Array.isArray(folders) || !folders.length))
    );
    const applied = syncFinishedGalleryBrowserAfterLoad(JSON.stringify(data));
    if (applied === false) return false;
    scheduleFinishedGalleryBrowserCatalogLabelSync(
        params.__finished_nums_pages || stat || "",
        mode,
        reason || "gallery_browser_native",
        requestId || finishedGalleryBrowserState.activeRequestId || 0
    );
    if (preserveExistingMorePage || needsCompleteStateBridgeRefresh) {
        window.setTimeout(() => {
            refreshFinishedGalleryBrowser({ folder: resolvedFolder, reset: true, force: true, preferBridge: true, silentStatus: true });
        }, 0);
    }
    try { scheduleFinishedGalleryBrowserStatusSyncFromRenderedGallery(mode, reason || "gallery_browser_native"); } catch (e) {}
    simpaiUiTrace("log", "[UI-TRACE] gallery_browser.native_after_load", {
        reason: reason || "gallery_browser_native",
        loaded,
        mode,
        requestId,
    });
    return true;
}

function bindFinishedGalleryBrowserScroll() {
    const grid = getFinishedGalleryGridWrap();
    if (!grid || grid.__simpleaiMainGalleryBrowserScrollBound) return;
    grid.__simpleaiMainGalleryBrowserScrollBound = true;
    grid.addEventListener("scroll", () => {
        if (isFinishedGalleryBrowserRequestBusy()) return;
        const moreRoot = getFinishedGalleryBrowserElement("gallery_browser_more_btn");
        const moreButton = moreRoot && moreRoot.matches && moreRoot.matches("button") ? moreRoot : moreRoot?.querySelector?.("button");
        if (!moreButton || moreButton.disabled) return;
        const gallery = getFinishedGalleryBrowserElement("finished_gallery");
        if (gallery && gallery.querySelector(".gallery-container > .preview")) return;
        const remaining = grid.scrollHeight - grid.scrollTop - grid.clientHeight;
        if (remaining < 260) refreshFinishedGalleryBrowser({ reset: false });
    }, { passive: true });
}

function bindFinishedGalleryBrowserNativeMoreBridge() {
    const root = getFinishedGalleryBrowserElement("gallery_browser_more_btn") || document.getElementById("gallery_browser_more_btn");
    const button = root && root.matches && root.matches("button") ? root : root?.querySelector?.("button");
    if (!button || button.__simpleaiGalleryBrowserMoreBridgeBound) return false;
    button.__simpleaiGalleryBrowserMoreBridgeBound = true;
    button.addEventListener("click", (event) => {
        if (finishedGalleryBrowserState.loading || finishedGalleryBrowserState.pendingPayload || !finishedGalleryBrowserState.hasMore) return;
        if (button.disabled || button.getAttribute("aria-disabled") === "true") return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        clearSimpleAIPresetSwitchGalleryHidden("gallery_browser_more_bridge");
        refreshFinishedGalleryBrowser({ reset: false, force: true, preferBridge: true });
    }, true);
    return true;
}

function bindFinishedGalleryBrowserControls() {
    bindFinishedGalleryBrowserBusyControlGuard();
    const ready = syncFinishedGalleryBrowserControls();
    if (!ready) return;
    bindFinishedGalleryBrowserScroll();
    bindFinishedGalleryBrowserNativeMoreBridge();
    bindFinishedGalleryResolutionBadgeObserver();
    const root = getFinishedGalleryBrowserElement("finished_images_catalog");
    const label = root ? root.querySelector(":scope > button.label-wrap") || root.querySelector("button.label-wrap") : null;
    if (label && !label.__simpleaiGalleryBrowserOpenBound) {
        label.__simpleaiGalleryBrowserOpenBound = true;
        label.addEventListener("click", () => {
            try {
                label.__simpleaiGalleryBrowserWasOpenBeforeClick = !!(root && isSimpleAIPresetCatalogBodyVisible(root));
            } catch (e) {
                label.__simpleaiGalleryBrowserWasOpenBeforeClick = false;
            }
        }, true);
        label.addEventListener("click", () => {
            window.clearTimeout(finishedGalleryBrowserEarlyOpenRefreshTimer);
            finishedGalleryBrowserEarlyOpenRefreshTimer = null;
            const wasOpenBeforeClick = !!label.__simpleaiGalleryBrowserWasOpenBeforeClick;
            window.setTimeout(() => {
                const latestRoot = getFinishedGalleryBrowserElement("finished_images_catalog") || root;
                const preparedOpen = Date.now() < simpleAIFinishedCatalogPreparedOpenUntil;
                const preparedClose = Date.now() < simpleAIFinishedCatalogPreparedCloseUntil;
                if (wasOpenBeforeClick || preparedClose) {
                    simpleAIFinishedCatalogPreparedOpenUntil = 0;
                    simpleAIFinishedCatalogPreparedCloseUntil = Date.now() + 700;
                    if (latestRoot) {
                        try { collapseSimpleAIFinishedGalleryCatalog(latestRoot); } catch (e) {}
                    }
                    closeSimpleAICatalogLinkedGallery("catalog_toggle_close", { resetBrowserState: false });
                    return;
                }
                if (!isSimpleAIPresetCatalogOpen(latestRoot) && !preparedOpen) {
                    if (latestRoot) {
                        ensureSimpleAIPresetCatalogOpen(latestRoot, "catalog_toggle_open_click_state");
                    }
                }
                if (preparedOpen && latestRoot && !isSimpleAIPresetCatalogOpen(latestRoot)) {
                    ensureSimpleAIPresetCatalogOpen(latestRoot, "catalog_toggle_open_prepared");
                }
                simpleAIFinishedCatalogPreparedCloseUntil = 0;
                finishedGalleryBrowserLabelRefreshPausedUntil = Date.now() + 1800;
                window.clearTimeout(finishedGalleryBrowserRefreshTimer);
                finishedGalleryBrowserRefreshTimer = null;
                keepWelcomePreviewUntilFinishedGalleryReady("catalog_toggle_open");
                clearSimpleAICatalogLinkedGalleryHidden("catalog_toggle_open");
                const folder = getFinishedGalleryBrowserElement("gallery_browser_folder");
                const select = folder ? folder.querySelector("select") : null;
                const selectedFolder = folder ? readGalleryBrowserFolderValue(folder) : "";
                const requestedFolder = selectedFolder || (select && select.value ? select.value : "") || "";
                const currentParams = topbarLastSystemParams || window.simpleaiTopbarSystemParams || {};
                const shouldPreferBridge = shouldPreferFinishedGalleryBrowserBridge(currentParams, requestedFolder);
                refreshFinishedGalleryBrowser({
                    reset: true,
                    force: true,
                    allowClosedCatalog: true,
                    preferBridge: shouldPreferBridge,
                    folder: requestedFolder || undefined,
                });
            }, 30);
        });
    }
    if (!finishedGalleryBrowserState.initialized) {
        finishedGalleryBrowserState.initialized = true;
        refreshFinishedGalleryBrowser({ reset: true, delay: 120, allowClosedCatalog: true, preload: true });
    }
}

function scheduleFinishedGalleryBrowserRefresh(mediaType) {
    if (isSimpleAIPresetGallerySuppressed()) return false;
    if (isFinishedGalleryBrowserRequestBusy() || Date.now() < finishedGalleryBrowserLabelRefreshPausedUntil) {
        simpaiUiTrace("log", "[UI-TRACE] gallery_browser.label_refresh_skipped_during_open", {
            mediaType: mediaType || "",
            loading: !!(finishedGalleryBrowserState && finishedGalleryBrowserState.loading),
            pending: !!(finishedGalleryBrowserState && finishedGalleryBrowserState.pendingPayload),
        });
        return false;
    }
    const mode = getFinishedGalleryBrowserMode(mediaType);
    const request = window.__simpleaiGalleryMediaSwitchRequest || null;
    const guard = {
        guarded: true,
        requestMarker: request && request.marker ? request.marker : "",
        requestMode: request && request.mode ? request.mode : "",
        scheduledMode: mode,
        scheduledAt: Date.now(),
        seq: ++galleryMediaSwitchStatusSyncSeq,
    };
    window.clearTimeout(finishedGalleryBrowserRefreshTimer);
    finishedGalleryBrowserRefreshTimer = window.setTimeout(() => {
        if (isSimpleAIPresetGallerySuppressed()) return;
        if (shouldSkipGalleryMediaSwitchCallback(mode, guard)) {
            return;
        }
        refreshFinishedGalleryBrowser({
            mediaType: mode,
            reset: true,
            force: true
        });
    }, 80);
}

window.refreshFinishedGalleryBrowser = refreshFinishedGalleryBrowser;
window.scheduleFinishedGalleryBrowserRefresh = scheduleFinishedGalleryBrowserRefresh;
window.syncFinishedGalleryBrowserAfterLoad = syncFinishedGalleryBrowserAfterLoad;
window.syncFinishedGalleryBrowserAfterNativeLoad = syncFinishedGalleryBrowserAfterNativeLoad;
window.markFinishedGalleryBrowserLoading = markFinishedGalleryBrowserLoading;
window.syncFinishedGalleryBrowserStatusFromRenderedGallery = syncFinishedGalleryBrowserStatusFromRenderedGallery;
window.scheduleFinishedGalleryBrowserStatusSyncFromRenderedGallery = scheduleFinishedGalleryBrowserStatusSyncFromRenderedGallery;
window.syncGalleryBrowserFolderDisplay = syncGalleryBrowserFolderDisplay;

function syncPresetStorePosition() {
    let preset_store = getPresetStoreElement();
    if (!preset_store) return;
    if (!isPresetStoreElementOpen(preset_store)) {
        const restoreFn = window.restorePresetStoreToManagedTree;
        if (typeof restoreFn === "function") restoreFn(preset_store);
        return;
    }
    const portalFn = window.portalFloatingShells || (typeof portalFloatingShells === "function" ? portalFloatingShells : null);
    if (typeof portalFn === "function") {
        portalFn({ forcePresetStore: true });
        preset_store = getPresetStoreElement() || preset_store;
    }
    const resizeState = ensurePresetStoreResize(preset_store);
    ensurePresetStoreInViewport(preset_store);
    if (resizeState && resizeState.ensureWithinViewport) {
        resizeState.ensureWithinViewport(false);
    }
}

function ensurePresetStoreResize(presetStoreEl) {
    if (!presetStoreEl) return null;
    if (presetStoreEl.__simpleaiPresetStoreResize) {
        return presetStoreEl.__simpleaiPresetStoreResize;
    }
    const resizeFactory = window.installResizablePopup || (typeof installResizablePopup === "function" ? installResizablePopup : null);
    if (typeof resizeFactory !== "function") {
        return null;
    }
    const resizeState = resizeFactory(presetStoreEl, {
        modal: presetStoreEl,
        minWidth: 560,
        minHeight: 320,
        margin: window.innerWidth <= 860 ? 6 : 24,
        disabled: () => window.innerWidth <= 860,
        isHidden: () => {
            const style = window.getComputedStyle ? window.getComputedStyle(presetStoreEl) : null;
            return !!(
                presetStoreEl.hidden
                || (presetStoreEl.classList && (presetStoreEl.classList.contains("hidden") || presetStoreEl.classList.contains("hide")))
                || (style && (style.display === "none" || style.visibility === "hidden"))
            );
        },
    });
    presetStoreEl.__simpleaiPresetStoreResize = resizeState;
    return resizeState;
}

function getPresetStoreViewportMargin() {
    return window.innerWidth <= 860 ? 6 : 24;
}

function getPresetStoreDefaultTop() {
    const margin = getPresetStoreViewportMargin();
    if (window.innerWidth <= 860) return margin;
    const preferredTop = 118;
    const viewportScaledTop = Math.round(window.innerHeight * 0.12);
    return Math.max(margin, Math.min(preferredTop, viewportScaledTop));
}

function presetStoreShellHasStructure(element) {
    if (!element || !element.querySelector) return false;
    return !!(
        element.querySelector("#preset_store_tools")
        && element.querySelector("#preset_store_close")
        && element.querySelector("#preset_store_nav_draft")
        && element.querySelector("#preset_store_candidate_pool")
    );
}

function selectPresetStoreElement(elements) {
    const stores = Array.from(elements || []).filter(Boolean);
    if (!stores.length) return null;
    const structured = stores.filter((element) => presetStoreShellHasStructure(element));
    const candidates = structured.length ? structured : stores;
    const visible = candidates.filter((element) => {
        if (element.hidden) return false;
        if (element.classList && (element.classList.contains("hidden") || element.classList.contains("hide"))) return false;
        const style = window.getComputedStyle ? window.getComputedStyle(element) : null;
        return !(style && (style.display === "none" || style.visibility === "hidden"));
    });
    const selected = visible.length ? visible : candidates;
    return selected[selected.length - 1];
}

function getPresetStoreElement() {
    const fromDocument = selectPresetStoreElement(document.querySelectorAll('.preset_store'));
    if (fromDocument) return fromDocument;
    try {
        const app = gradioApp();
        if (app && app.querySelectorAll) {
            const selected = selectPresetStoreElement(app.querySelectorAll('.preset_store'));
            if (selected) return selected;
        }
        return app && app.querySelector ? app.querySelector('.preset_store') : null;
    } catch (e) {
        return null;
    }
}

function getPresetStoreOwnerKey(systemParams = null) {
    const params = systemParams && typeof systemParams === "object"
        ? systemParams
        : (window.simpleaiTopbarSystemParams || {});
    const userDid = String(params.user_did || "").trim();
    const role = String(params.user_role || presetStoreUiState.role || "guest").trim().toLowerCase();
    const accessMode = String(params.access_mode || "").trim().toLowerCase();
    return `${accessMode}|${role}|${userDid}`;
}

function isPresetStoreGuestIdentity(systemParams = null) {
    if (systemParams && typeof systemParams === "object") {
        return String(systemParams.user_role || "").toLowerCase() === "guest"
            && String(systemParams.access_mode || "").toLowerCase() === "multi-user";
    }
    const params = window.simpleaiTopbarSystemParams || {};
    return String(params.user_role || "").toLowerCase() === "guest"
        && String(params.access_mode || "").toLowerCase() === "multi-user";
}

function isPresetStoreElementOpen(presetStoreEl) {
    if (!presetStoreEl || presetStoreEl.hidden) return false;
    if (presetStoreEl.classList?.contains("hidden") || presetStoreEl.classList?.contains("hide")) return false;
    return presetStoreEl.style.display !== "none";
}

function invalidatePresetStoreReusableContent(presetStoreEl = getPresetStoreElement()) {
    if (!presetStoreEl?.dataset) return;
    delete presetStoreEl.dataset.simpleaiPresetStoreReady;
    delete presetStoreEl.dataset.simpleaiPresetStoreRevision;
    delete presetStoreEl.dataset.simpleaiPresetStoreOwner;
}

function presetStoreHasReusableContent(presetStoreEl = getPresetStoreElement()) {
    if (!presetStoreEl || isPresetStoreGuestIdentity()) return false;
    if (presetStoreEl.dataset.simpleaiPresetStoreReady !== "1") return false;
    if (presetStoreEl.dataset.simpleaiPresetStoreOwner !== getPresetStoreOwnerKey()) return false;
    return !!presetStoreEl.querySelector(".preset-store-candidate");
}

function clearPresetStoreOptimisticIntent() {
    if (presetStoreUiState.optimistic_timer) {
        window.clearTimeout(presetStoreUiState.optimistic_timer);
    }
    presetStoreUiState.optimistic_timer = 0;
    presetStoreUiState.optimistic_seq = 0;
    window.__simpleaiPresetStoreOptimisticIntent = null;
}

function recordPresetStoreOptimisticIntent(isOpen) {
    const previousSeq = Math.max(0, Number(topbarLastPresetStoreSeq) || 0);
    const expectedSeq = previousSeq + 1;
    clearPresetStoreOptimisticIntent();
    topbarLastPresetStoreSeq = expectedSeq;
    presetStoreUiState.optimistic_seq = expectedSeq;
    presetStoreUiState.expand_flag = !!isOpen;
    window.__simpleaiPresetStoreOptimisticIntent = {
        isOpen: !!isOpen,
        seq: expectedSeq,
        startedAt: Date.now(),
    };
    presetStoreUiState.optimistic_timer = window.setTimeout(() => {
        if (presetStoreUiState.optimistic_seq !== expectedSeq) return;
        clearPresetStoreOptimisticIntent();
        if (topbarLastPresetStoreSeq === expectedSeq) {
            topbarLastPresetStoreSeq = previousSeq;
        }
    }, 15000);
    return expectedSeq;
}

function applyCachedPresetStoreToggle(target) {
    const storeRoot = target?.closest?.("#bar_store");
    if (!storeRoot) return false;
    const storeButton = storeRoot.matches("button") ? storeRoot : storeRoot.querySelector("button");
    if (storeButton?.disabled || storeButton?.getAttribute("aria-disabled") === "true") return false;
    const presetStoreEl = getPresetStoreElement();
    if (!presetStoreHasReusableContent(presetStoreEl)) return false;
    const nextOpen = !isPresetStoreElementOpen(presetStoreEl);
    recordPresetStoreOptimisticIntent(nextOpen);
    setPresetStoreOpen(presetStoreEl, nextOpen);
    if (nextOpen) {
        ensurePresetStoreInViewport(presetStoreEl);
        const resizeState = ensurePresetStoreResize(presetStoreEl);
        if (resizeState?.ensureWithinViewport) resizeState.ensureWithinViewport(false);
    }
    return true;
}

function triggerBarStoreToggleOnce() {
    let root = null;
    try {
        root = document.getElementById("bar_store");
    } catch (e) {}
    try {
        root = root || (gradioApp() && gradioApp().getElementById ? gradioApp().getElementById("bar_store") : null);
    } catch (e) {}
    const button = root && root.matches && root.matches("button")
        ? root
        : (root && root.querySelector ? root.querySelector("button") : root);
    if (!button || typeof button.click !== "function") return false;
    button.click();
    return true;
}

function getTopbarBridgeRoot(rootId) {
    let root = null;
    try {
        root = document.getElementById(rootId);
    } catch (e) {}
    if (root) return root;
    try {
        const app = typeof gradioApp === "function" ? gradioApp() : null;
        root = app && app.getElementById ? app.getElementById(rootId) : null;
    } catch (e) {
        root = null;
    }
    if (root) return root;
    try {
        const app = typeof gradioApp === "function" ? gradioApp() : null;
        root = app && app.querySelector ? app.querySelector(`#${rootId}`) : null;
    } catch (e) {
        root = null;
    }
    return root;
}

function setTopbarHiddenBridgeTextboxValue(rootId, value) {
    if (typeof setGradioTextboxValue === "function" && setGradioTextboxValue(rootId, value)) {
        return true;
    }
    const root = getTopbarBridgeRoot(rootId);
    if (!root) return false;
    const field = root.matches && root.matches("textarea, input")
        ? root
        : (root.querySelector ? root.querySelector("textarea, input") : null);
    if (!field) return false;
    const proto = Object.getPrototypeOf(field);
    const descriptor = proto ? Object.getOwnPropertyDescriptor(proto, "value") : null;
    if (descriptor && descriptor.set) {
        descriptor.set.call(field, value);
    } else {
        field.value = value;
    }
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
}

function clickTopbarHiddenBridgeButton(rootId) {
    if (typeof clickGradioButton === "function" && clickGradioButton(rootId)) {
        return true;
    }
    const root = getTopbarBridgeRoot(rootId);
    const button = root && root.matches && root.matches("button")
        ? root
        : (root && root.querySelector ? root.querySelector("button") : root);
    if (!button || typeof button.click !== "function") return false;
    try {
        button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
        button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        button.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
        button.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    } catch (e) {}
    button.click();
    try {
        button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    } catch (e) {}
    return true;
}

function triggerPresetStoreApplyOnce() {
    return clickTopbarHiddenBridgeButton("preset_store_apply_button");
}

function triggerPresetStoreDeleteOnce() {
    return clickTopbarHiddenBridgeButton("preset_store_delete_button");
}

function resetPresetStoreSearchFilter(applyFilters = false) {
    presetStoreFilterState.query = "";
    const search = getPresetStoreControl("#preset_store_search");
    if (search && search.value) {
        search.value = "";
    }
    if (applyFilters) {
        applyPresetStoreFilters();
    }
}

function setPresetStoreOpen(presetStoreEl, isOpen) {
    if (!presetStoreEl) return false;
    const wasOpen = isPresetStoreElementOpen(presetStoreEl);
    document.documentElement.classList.toggle("preset-store-open", !!isOpen);
    if (isOpen) {
        if (!wasOpen) {
            resetPresetStoreSearchFilter(false);
        }
        presetStoreEl.style.display = '';
        presetStoreEl.style.pointerEvents = '';
        try { presetStoreEl.removeAttribute("hidden"); } catch (e) {}
        try {
            if (presetStoreEl.classList) {
                presetStoreEl.classList.remove("hidden");
                presetStoreEl.classList.remove("hide");
            }
        } catch (e) {}
        const portalFn = window.portalFloatingShells || (typeof portalFloatingShells === "function" ? portalFloatingShells : null);
        if (typeof portalFn === "function") {
            portalFn({ forcePresetStore: true });
        }
    } else {
        presetStoreEl.style.display = 'none';
        presetStoreEl.style.pointerEvents = 'none';
        try { presetStoreEl.setAttribute("hidden", ""); } catch (e) {}
        try {
            if (presetStoreEl.classList) {
                presetStoreEl.classList.add("hidden");
                presetStoreEl.classList.add("hide");
            }
        } catch (e) {}
        if (wasOpen) {
            resetPresetStoreSearchFilter(true);
            delete presetStoreEl.dataset.saiDragged;
            presetStoreEl.style.setProperty("left", "50%", "important");
            presetStoreEl.style.setProperty("top", `${getPresetStoreDefaultTop()}px`, "important");
            presetStoreEl.style.setProperty("transform", "translateX(-50%)", "important");
        }
        const restoreFn = window.restorePresetStoreToManagedTree;
        if (typeof restoreFn === "function") {
            restoreFn(presetStoreEl);
        }
    }
    if (wasOpen !== !!isOpen) {
        window.dispatchEvent(new CustomEvent(isOpen ? "simpai:preset-store-opened" : "simpai:preset-store-closed"));
    }
    return wasOpen !== !!isOpen;
}

function ensurePresetStoreInViewport(presetStoreEl) {
    if (!presetStoreEl) return;
    const margin = getPresetStoreViewportMargin();
    if (window.innerWidth <= 860) {
        const viewport = window.visualViewport;
        const left = Number(viewport?.offsetLeft || 0) + margin;
        const top = Number(viewport?.offsetTop || 0) + margin;
        const width = Math.max(280, Number(viewport?.width || window.innerWidth) - margin * 2);
        const height = Math.max(220, Number(viewport?.height || window.innerHeight) - margin * 2);
        presetStoreEl.dataset.saiMobileFrame = "1";
        presetStoreEl.style.setProperty("left", `${Math.round(left)}px`, "important");
        presetStoreEl.style.setProperty("top", `${Math.round(top)}px`, "important");
        presetStoreEl.style.setProperty("transform", "none", "important");
        presetStoreEl.style.setProperty("width", `${Math.round(width)}px`, "important");
        presetStoreEl.style.setProperty("height", `${Math.round(height)}px`, "important");
        presetStoreEl.style.setProperty("max-width", `${Math.round(width)}px`, "important");
        presetStoreEl.style.setProperty("max-height", `${Math.round(height)}px`, "important");
        return;
    }
    if (presetStoreEl.dataset.saiMobileFrame === "1") {
        delete presetStoreEl.dataset.saiMobileFrame;
        ["width", "height", "max-width", "max-height"].forEach((name) => presetStoreEl.style.removeProperty(name));
    }
    const defaultTop = getPresetStoreDefaultTop();
    if (presetStoreEl.dataset.saiDragged !== "1") {
        presetStoreEl.style.setProperty("left", "50%", "important");
        presetStoreEl.style.setProperty("top", `${defaultTop}px`, "important");
        presetStoreEl.style.setProperty("transform", "translateX(-50%)", "important");
    }
    let rect = presetStoreEl.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const maxWidth = Math.max(280, window.innerWidth - margin * 2);
    const maxHeight = Math.max(220, window.innerHeight - margin * 2);
    if (rect.width > maxWidth) {
        presetStoreEl.style.setProperty("width", `${Math.round(maxWidth)}px`, "important");
    }
    if (rect.height > maxHeight) {
        presetStoreEl.style.setProperty("height", `${Math.round(maxHeight)}px`, "important");
    }

    rect = presetStoreEl.getBoundingClientRect();
    const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin);
    const maxTop = Math.max(margin, window.innerHeight - rect.height - margin);
    const nextTop = Math.max(margin, Math.min(rect.top, maxTop));

    if (presetStoreEl.dataset.saiDragged === "1") {
        const nextLeft = Math.max(margin, Math.min(rect.left, maxLeft));
        presetStoreEl.style.setProperty("left", `${Math.round(nextLeft)}px`, "important");
        presetStoreEl.style.setProperty("top", `${Math.round(nextTop)}px`, "important");
        presetStoreEl.style.setProperty("transform", "none", "important");
    } else {
        presetStoreEl.style.setProperty("left", "50%", "important");
        presetStoreEl.style.setProperty("top", `${Math.round(nextTop)}px`, "important");
        presetStoreEl.style.setProperty("transform", "translateX(-50%)", "important");
    }
}

function presetStoreScrollableOverflow(value) {
    return /auto|scroll|overlay/i.test(String(value || ""));
}

function canPresetStoreWheelScrollAxis(scroller, axis, delta) {
    if (!scroller || Math.abs(delta || 0) < 0.01) return false;
    if (axis === "x") {
        const maxLeft = scroller.scrollWidth - scroller.clientWidth;
        if (maxLeft <= 1) return false;
        return delta < 0 ? scroller.scrollLeft > 0 : scroller.scrollLeft < maxLeft - 1;
    }
    const maxTop = scroller.scrollHeight - scroller.clientHeight;
    if (maxTop <= 1) return false;
    return delta < 0 ? scroller.scrollTop > 0 : scroller.scrollTop < maxTop - 1;
}

function findPresetStoreWheelScroller(target, root, deltaX, deltaY) {
    let node = target instanceof Element ? target : target?.parentElement;
    while (node && node !== document.documentElement) {
        const style = window.getComputedStyle ? window.getComputedStyle(node) : null;
        if (style) {
            const canScrollY = presetStoreScrollableOverflow(style.overflowY)
                && canPresetStoreWheelScrollAxis(node, "y", deltaY);
            const canScrollX = presetStoreScrollableOverflow(style.overflowX)
                && canPresetStoreWheelScrollAxis(node, "x", deltaX);
            if (canScrollY || canScrollX) return node;
        }
        if (node === root) break;
        node = node.parentElement;
    }
    return null;
}

function bindPresetStoreWheelContainment(presetStoreEl) {
    if (!presetStoreEl || presetStoreEl.dataset.simpleaiWheelContainmentBound === "1") return;
    presetStoreEl.dataset.simpleaiWheelContainmentBound = "1";
    presetStoreEl.addEventListener("wheel", (event) => {
        const style = window.getComputedStyle ? window.getComputedStyle(presetStoreEl) : null;
        const hidden = presetStoreEl.hidden
            || (presetStoreEl.classList && (presetStoreEl.classList.contains("hidden") || presetStoreEl.classList.contains("hide")))
            || (style && (style.display === "none" || style.visibility === "hidden"));
        if (hidden) return;
        const scroller = findPresetStoreWheelScroller(event.target, presetStoreEl, event.deltaX, event.deltaY);
        if (!scroller && event.cancelable) {
            event.preventDefault();
        }
        event.stopPropagation();
    }, { passive: false, capture: true });
    presetStoreEl.addEventListener("touchstart", (event) => {
        const touch = event.touches && event.touches[0];
        presetStoreTouchPoint = touch ? { x: touch.clientX, y: touch.clientY } : null;
        event.stopPropagation();
    }, { passive: true, capture: true });
    presetStoreEl.addEventListener("touchmove", (event) => {
        const touch = event.touches && event.touches[0];
        const deltaX = presetStoreTouchPoint && touch ? presetStoreTouchPoint.x - touch.clientX : 0;
        const deltaY = presetStoreTouchPoint && touch ? presetStoreTouchPoint.y - touch.clientY : 0;
        presetStoreTouchPoint = touch ? { x: touch.clientX, y: touch.clientY } : presetStoreTouchPoint;
        const scroller = findPresetStoreWheelScroller(event.target, presetStoreEl, deltaX, deltaY);
        if (!scroller && event.cancelable) event.preventDefault();
        event.stopPropagation();
    }, { passive: false, capture: true });
    const resetTouchPoint = (event) => {
        presetStoreTouchPoint = null;
        event.stopPropagation();
    };
    presetStoreEl.addEventListener("touchend", resetTouchPoint, true);
    presetStoreEl.addEventListener("touchcancel", resetTouchPoint, true);
}

let presetStoreResizeTimer = 0;
function schedulePresetStoreViewportRefresh() {
    if (presetStoreResizeTimer) {
        clearTimeout(presetStoreResizeTimer);
    }
    presetStoreResizeTimer = setTimeout(() => {
        presetStoreResizeTimer = 0;
        const store = getPresetStoreElement();
        if (!store) return;
        const resizeState = ensurePresetStoreResize(store);
        ensurePresetStoreInViewport(store);
        if (resizeState && resizeState.ensureWithinViewport) {
            resizeState.ensureWithinViewport(false);
        }
        applyPresetStoreFilters();
    }, 80);
}

function inferPresetStoreEngine(name) {
    const text = String(name || "").toLowerCase();
    if (text.includes("wan")) return "Wan";
    if (text.includes("flux") || text.includes("nf4") || text.includes("fp4")) return "Flux";
    if (text.includes("qwen") || text.includes("nunqwen")) return "Qwen";
    if (text.includes("z-image") || text.includes("zimage")) return "Z-image";
    if (text.includes("ltx")) return "LTX";
    if (text.includes("sdxl") || text.includes("illustrious") || text.includes("noob")) return "SDXL";
    return "Other";
}

function inferPresetStoreMediaType(engineType, taskMethod) {
    const engine = String(engineType || "").trim().toLowerCase();
    const task = String(taskMethod || "").trim().toLowerCase();
    if (engine.includes("video")) return "video";
    if (/(?:^|[_-])(t2v|i2v|v2v|ta2v|ia2v|av2v)(?:$|[_-])/.test(task)) return "video";
    return "image";
}

function getPresetStoreMeta(name) {
    const normalized = normalizePresetName(name);
    const meta = presetStoreUiState.meta || {};
    return meta[name] || meta[normalized] || null;
}

function getPresetStoreItemButtons(presetStoreEl) {
    if (!presetStoreEl) return [];
    const seen = new Set();
    return Array.from(presetStoreEl.querySelectorAll('button, [role="button"], .gallery-item')).filter((button) => {
        if (seen.has(button)) return false;
        seen.add(button);
        if (!button || !button.textContent) return false;
        if (button.closest && button.closest('#preset_store_tools')) return false;
        const text = normalizePresetName(button.textContent || "");
        if (!text) return false;
        if (button.id === 'preset_store_close') return false;
        return true;
    });
}

function getPresetStoreButtonLabel(button) {
    if (!button) return "";
    const div = button.querySelector ? button.querySelector('div.gallery, .gallery, [data-original-text]') : null;
    const originalText = div && div.getAttribute ? div.getAttribute("data-original-text") : null;
    const text = originalText || (div ? div.textContent : button.textContent) || "";
    return normalizePresetName(text);
}

function getCleanPresetStoreName(name) {
    let value = normalizePresetName(name);
    if (value.endsWith(TOPBAR_MISSING_MARKER) || value.endsWith(TOPBAR_LEGACY_MISSING_DISPLAY_MARKER)) {
        value = value.slice(0, -1).trim();
    }
    return value;
}

function cleanPresetStoreNameList(names, limit = null) {
    const maxCount = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : Number.POSITIVE_INFINITY;
    const seen = new Set();
    const cleaned = [];
    (Array.isArray(names) ? names : []).forEach((name) => {
        if (cleaned.length >= maxCount) return;
        const cleanName = getCleanPresetStoreName(name);
        if (!cleanName) return;
        const norm = normalizePresetName(cleanName);
        if (!norm || seen.has(norm)) return;
        seen.add(norm);
        cleaned.push(cleanName);
    });
    return cleaned;
}

function cleanPresetStoreDisplayNameList(names, limit = null) {
    const maxCount = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : Number.POSITIVE_INFINITY;
    const seen = new Set();
    const cleaned = [];
    (Array.isArray(names) ? names : []).forEach((name) => {
        if (cleaned.length >= maxCount) return;
        const cleanName = getCleanPresetStoreName(name);
        if (!cleanName) return;
        const norm = normalizePresetName(cleanName);
        if (!norm || seen.has(norm)) return;
        seen.add(norm);
        const preserveMarker = String(name || "").trim().endsWith(TOPBAR_MISSING_MARKER);
        cleaned.push(topbarPresetNameWithMarker(cleanName, preserveMarker));
    });
    return cleaned;
}

const PRESET_STORE_MINIMUM_NAV_MESSAGE = "The navbar must keep at least one preset. The current preset has been kept.";

function getPresetStoreStatusNode() {
    const status = getPresetStoreControl("#preset_store_status");
    if (status) return status;
    const draftHost = getPresetStoreControl("#preset_store_nav_draft");
    if (!draftHost || !draftHost.parentNode) return null;
    const node = document.createElement("div");
    node.id = "preset_store_status";
    node.className = "preset-store-status";
    node.hidden = true;
    draftHost.parentNode.insertBefore(node, draftHost.nextSibling);
    topbarApplyLocalizedAriaLabel(node, "Preset store status");
    return node;
}

function showPresetStoreStatus(message = PRESET_STORE_MINIMUM_NAV_MESSAGE, tone = "warning") {
    const status = getPresetStoreStatusNode();
    if (!status) return;
    status.textContent = topbarTranslateText(message);
    status.dataset.tone = tone;
    status.hidden = false;
}

function clearPresetStoreStatus() {
    const status = getPresetStoreStatusNode();
    if (!status) return;
    status.hidden = true;
    status.textContent = "";
}

function getPresetStoreFallbackNavName() {
    const candidates = [];
    try {
        if (typeof topbarLastPreset !== "undefined" && topbarLastPreset) candidates.push(topbarLastPreset);
    } catch (e) {}
    try {
        const params = window.simpleaiTopbarSystemParams || {};
        if (params.__preset) candidates.push(params.__preset);
    } catch (e) {}
    try {
        if (presetStoreUiState.nav_name_list && presetStoreUiState.nav_name_list.length) {
            candidates.push(presetStoreUiState.nav_name_list[0]);
        }
    } catch (e) {}
    try {
        getTopbarBarButtons().forEach((button) => candidates.push(getTopbarNavButtonOriginalText(button)));
    } catch (e) {}
    try {
        getPresetStoreCandidateEntries().forEach((entry) => candidates.push(entry.name));
    } catch (e) {}
    for (const candidate of candidates) {
        const cleanName = getCleanPresetStoreName(candidate);
        if (cleanName) return cleanName;
    }
    return "";
}

function ensurePresetStoreNavListMinimum(navList, showWarning = false) {
    let cleaned = cleanPresetStoreNameList(navList, getPresetStoreDraftLimit());
    if (cleaned.length) return cleaned;
    const fallback = getPresetStoreFallbackNavName();
    if (fallback) {
        cleaned = [fallback];
        if (showWarning) showPresetStoreStatus();
    }
    return cleaned;
}

function ensurePresetStoreDisplayNavListMinimum(navList) {
    let cleaned = cleanPresetStoreDisplayNameList(navList, getPresetStoreDraftLimit());
    if (cleaned.length) return cleaned;
    const fallback = getPresetStoreFallbackNavName();
    if (fallback) cleaned = [topbarPresetNameWithMarker(fallback, false)];
    return cleaned;
}

function getPresetStoreDraftLimit() {
    try {
        const buttons = getTopbarBarButtons();
        if (buttons && buttons.length > 0) return buttons.length;
    } catch (e) {}
    return 15;
}

function setPresetStoreDraftFromNav(navList, force = false) {
    if (presetStoreDraftState.dirty && !force) return;
    presetStoreDraftState.list = cleanPresetStoreNameList(navList, getPresetStoreDraftLimit());
    presetStoreDraftState.list = ensurePresetStoreNavListMinimum(presetStoreDraftState.list);
    presetStoreDraftState.dirty = false;
}

function getPresetStoreDraftRenderRevision() {
    return presetStoreDraftState.list
        .map((name) => normalizePresetName(name))
        .join("\u001f");
}

function removePresetStoreDraftItemAt(index) {
    const current = cleanPresetStoreNameList(presetStoreDraftState.list, getPresetStoreDraftLimit());
    if (current.length <= 1) {
        presetStoreDraftState.list = ensurePresetStoreNavListMinimum(current, true);
        presetStoreDraftState.dirty = true;
        renderPresetStoreDraft();
        syncPresetStoreCandidatePinnedState();
        return false;
    }
    presetStoreDraftState.list.splice(index, 1);
    presetStoreDraftState.list = cleanPresetStoreNameList(presetStoreDraftState.list, getPresetStoreDraftLimit());
    presetStoreDraftState.dirty = true;
    clearPresetStoreStatus();
    renderPresetStoreDraft();
    syncPresetStoreCandidatePinnedState();
    return true;
}

function removePresetStoreDraftItemByName(name) {
    const norm = normalizePresetName(name);
    const index = presetStoreDraftState.list.findIndex((item) => normalizePresetName(item) === norm);
    if (index < 0) return false;
    return removePresetStoreDraftItemAt(index);
}

function isPresetStoreDraftItemPinned(name) {
    const cleanName = getCleanPresetStoreName(name);
    if (!cleanName) return false;
    const norm = normalizePresetName(cleanName);
    return presetStoreDraftState.list.some((item) => normalizePresetName(item) === norm);
}

function togglePresetStoreCandidateByName(name) {
    const cleanName = getCleanPresetStoreName(name);
    if (!cleanName) return false;
    if (isPresetStoreDraftItemPinned(cleanName)) {
        return removePresetStoreDraftItemByName(cleanName);
    }
    const changed = insertPresetStoreDraftItem(cleanName, presetStoreDraftState.list.length, "candidate");
    renderPresetStoreDraft();
    if (changed) syncPresetStoreCandidatePinnedState();
    return changed;
}

function getPresetStoreDraftHost() {
    return getPresetStoreControl("#preset_store_nav_draft");
}

function getPresetStoreNow() {
    return performance && typeof performance.now === "function" ? performance.now() : Date.now();
}

function getPresetStoreLayoutRect(el, host) {
    if (!el || !host) return null;
    const hostRect = host.getBoundingClientRect();
    let left = 0;
    let top = 0;
    let node = el;
    while (node && node !== host) {
        left += node.offsetLeft || 0;
        top += node.offsetTop || 0;
        node = node.offsetParent;
    }
    if (node !== host) {
        return el.getBoundingClientRect();
    }
    return {
        left: hostRect.left + left - (host.scrollLeft || 0),
        top: hostRect.top + top - (host.scrollTop || 0),
        right: hostRect.left + left - (host.scrollLeft || 0) + el.offsetWidth,
        bottom: hostRect.top + top - (host.scrollTop || 0) + el.offsetHeight,
        width: el.offsetWidth,
        height: el.offsetHeight,
    };
}

function getPresetStoreDraftInsertionIndex(clientX, clientY, options = null) {
    const host = getPresetStoreDraftHost();
    if (!host) return -1;
    const drag = presetStoreDraftState.pointerDrag;
    const bypassCooldown = !!(options && options.bypassCooldown);
    if (!bypassCooldown && drag && drag.lockDropIndexUntil && getPresetStoreNow() < drag.lockDropIndexUntil) {
        return Number.isFinite(drag.dropIndex) ? drag.dropIndex : -1;
    }
    const hostRect = host.getBoundingClientRect();
    if (
        clientX < hostRect.left - 24
        || clientX > hostRect.right + 24
        || clientY < hostRect.top - 24
        || clientY > hostRect.bottom + 24
    ) {
        return -1;
    }
    const chips = Array.from(host.querySelectorAll(".preset-store-draft-chip:not(.preset-store-draft-placeholder)"));
    if (!chips.length) return 0;
    let closestIndex = chips.length;
    let closestDistance = Number.POSITIVE_INFINITY;
    let closestRowDistance = Number.POSITIVE_INFINITY;
    chips.forEach((chip, index) => {
        if (
            drag
            && drag.source === "draft"
            && normalizePresetName(chip.dataset.presetName || "") === normalizePresetName(drag.name || "")
        ) {
            return;
        }
        const rect = getPresetStoreLayoutRect(chip, host);
        if (!rect) return;
        const insideRow = clientY >= rect.top - 8 && clientY <= rect.bottom + 8;
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const insertionIndex = clientX < rect.left + rect.width / 2 ? index : index + 1;
        if (insideRow) {
            const rowDistance = Math.abs(clientX - cx);
            if (rowDistance < closestRowDistance) {
                closestRowDistance = rowDistance;
                closestIndex = insertionIndex;
            }
            return;
        }
        if (closestRowDistance < Number.POSITIVE_INFINITY) return;
        const distance = Math.hypot(clientX - cx, clientY - cy);
        if (closestDistance >= 0 && distance < closestDistance) {
            closestDistance = distance;
            closestIndex = insertionIndex;
        }
    });
    return Math.max(0, Math.min(closestIndex, presetStoreDraftState.list.length));
}

function setPresetStoreDraftDropCue(index) {
    const host = getPresetStoreDraftHost();
    if (!host) return;
    const drag = presetStoreDraftState.pointerDrag;
    if (!Number.isFinite(index) || index < 0) {
        host.classList.remove("is-drag-over");
        delete host.dataset.dropIndex;
        if (drag) {
            const previousIndex = drag.dropIndex;
            drag.dropIndex = -1;
            drag.pendingDropIndex = -1;
            drag.pendingDropSince = 0;
            if (drag.dropRenderRaf) {
                cancelAnimationFrame(drag.dropRenderRaf);
                drag.dropRenderRaf = 0;
            }
            if (previousIndex !== -1) renderPresetStoreDraft();
        }
        return;
    }
    host.classList.add("is-drag-over");
    if (!drag) {
        host.dataset.dropIndex = String(index);
        return;
    }
    const now = getPresetStoreNow();
    if (drag.dropIndex === index) {
        drag.pendingDropIndex = index;
        drag.pendingDropSince = now;
        return;
    }
    if (drag.pendingDropIndex !== index) {
        drag.pendingDropIndex = index;
        drag.pendingDropSince = now;
        return;
    }
    const lastPoint = drag.lastDropPoint || null;
    const moved = lastPoint ? Math.hypot((drag.currentClientX || 0) - lastPoint.x, (drag.currentClientY || 0) - lastPoint.y) : 999;
    const stableFor = now - (drag.pendingDropSince || now);
    if (moved < 10 && stableFor < 80) {
        return;
    }
    drag.dropIndex = index;
    drag.lastDropPoint = { x: drag.currentClientX || 0, y: drag.currentClientY || 0 };
    drag.lockDropIndexUntil = now + 120;
    host.dataset.dropIndex = String(index);
    if (!drag.dropRenderRaf) {
        drag.dropRenderRaf = requestAnimationFrame(() => {
            drag.dropRenderRaf = 0;
            renderPresetStoreDraft();
        });
    }
}

function getPresetStoreVisualDropIndex(drag) {
    if (!drag || !Number.isFinite(drag.dropIndex) || drag.dropIndex < 0) return -1;
    const limit = Math.max(1, getPresetStoreDraftLimit());
    const norm = normalizePresetName(drag.name || "");
    const existingIndex = presetStoreDraftState.list.findIndex((item) => normalizePresetName(item) === norm);
    let visualIndex = drag.dropIndex;
    if (drag.source !== "draft" && existingIndex >= 0 && existingIndex < visualIndex) {
        visualIndex -= 1;
    }
    const visualLength = presetStoreDraftState.list.filter((item) => normalizePresetName(item) !== norm).length;
    if (drag.source !== "draft" && visualLength >= limit && visualIndex >= limit) {
        visualIndex = limit - 1;
    }
    return Math.max(0, Math.min(visualIndex, visualLength));
}

function insertPresetStoreDraftItem(name, requestedIndex, source) {
    const cleanName = getCleanPresetStoreName(name);
    if (!cleanName) return false;
    const norm = normalizePresetName(cleanName);
    const limit = Math.max(1, getPresetStoreDraftLimit());
    let list = presetStoreDraftState.list.slice();
    const existingIndex = list.findIndex((item) => normalizePresetName(item) === norm);
    let insertIndex = Number.isFinite(requestedIndex) ? requestedIndex : list.length;
    if (existingIndex >= 0) {
        list.splice(existingIndex, 1);
        if (source !== "draft" && existingIndex < insertIndex) insertIndex -= 1;
    }
    insertIndex = Math.max(0, Math.min(insertIndex, list.length));
    if (source !== "draft" && list.length >= limit && insertIndex >= limit) {
        insertIndex = limit - 1;
    }
    list.splice(insertIndex, 0, cleanName);
    while (list.length > limit) {
        list.pop();
    }
    const changed = list.length !== presetStoreDraftState.list.length
        || list.some((item, index) => item !== presetStoreDraftState.list[index]);
    presetStoreDraftState.list = list;
    if (changed) {
        presetStoreDraftState.dirty = true;
    }
    return changed;
}

function removePresetStoreDragGhost() {
    const drag = presetStoreDraftState.pointerDrag;
    if (drag && drag.dropRenderRaf) {
        cancelAnimationFrame(drag.dropRenderRaf);
        drag.dropRenderRaf = 0;
    }
    if (drag && drag.ghostEl && drag.ghostEl.parentNode) {
        drag.ghostEl.parentNode.removeChild(drag.ghostEl);
    }
    document.querySelectorAll(".preset-store-drag-ghost").forEach((ghost) => {
        if (!drag || ghost !== drag.ghostEl) {
            ghost.remove();
        }
    });
}

function clearPresetStoreDraftDragState() {
    document.body.classList.remove("preset-store-dragging");
    document.body.classList.remove("preset-store-dragging-candidate");
    document.querySelectorAll(".preset-store-draft-chip.is-drag-source").forEach((chip) => {
        chip.classList.remove("is-drag-source");
    });
    document.querySelectorAll(".preset-store-candidate.is-drag-source").forEach((candidate) => {
        candidate.classList.remove("is-drag-source");
    });
    setPresetStoreDraftDropCue(-1);
}

function createPresetStoreDragGhost(name, sourceChip) {
    const ghost = document.createElement("div");
    ghost.className = "preset-store-drag-ghost";
    ghost.innerHTML = `<span class="preset-store-draft-handle">::</span><span class="preset-store-draft-name"></span>`;
    const label = ghost.querySelector(".preset-store-draft-name");
    applyPresetStoreDisplayName(label, name);
    document.body.appendChild(ghost);
    if (sourceChip) {
        const rect = sourceChip.getBoundingClientRect();
        ghost.style.left = `${Math.round(rect.left)}px`;
        ghost.style.top = `${Math.round(rect.top)}px`;
        ghost.style.width = `${Math.round(rect.width)}px`;
        ghost.style.height = `${Math.round(rect.height)}px`;
    }
    return ghost;
}

function updatePresetStoreDragGhostPosition(clientX, clientY) {
    const drag = presetStoreDraftState.pointerDrag;
    if (!drag || !drag.ghostEl) return;
    const left = clientX - (drag.pointerOffsetX || 0) - 6;
    const top = clientY - (drag.pointerOffsetY || 0) - 10;
    drag.ghostEl.style.left = `${Math.round(left)}px`;
    drag.ghostEl.style.top = `${Math.round(top)}px`;
}

function startPresetStoreDraftPointerDrag(event, index) {
    if (event.button !== undefined && event.button !== 0) return;
    const name = presetStoreDraftState.list[index];
    if (!name) return;
    const activeChip = event.target && event.target.closest ? event.target.closest(".preset-store-draft-chip") : null;
    const activeRect = activeChip ? activeChip.getBoundingClientRect() : null;
    const pointerOffsetX = activeRect ? (event.clientX - activeRect.left) : 18;
    const pointerOffsetY = activeRect ? (event.clientY - activeRect.top) : 12;
    presetStoreDraftState.pointerDrag = {
        source: "draft",
        index,
        name,
        activeChip,
        pointerOffsetX,
        pointerOffsetY,
        placeholderWidth: activeRect ? Math.max(86, Math.round(activeRect.width)) : 118,
        dropIndex: -1,
        pendingDropIndex: -1,
        pendingDropSince: 0,
        lastDropPoint: { x: event.clientX, y: event.clientY },
        startClientX: event.clientX,
        startClientY: event.clientY,
        currentClientX: event.clientX,
        currentClientY: event.clientY,
        lockDropIndexUntil: 0,
        dropRenderRaf: 0,
        ghostEl: createPresetStoreDragGhost(name, activeChip),
    };
    if (activeChip && activeChip.classList) {
        activeChip.classList.add("is-drag-source");
    }
    document.body.classList.add("preset-store-dragging");
    updatePresetStoreDragGhostPosition(event.clientX, event.clientY);
    const onMove = (moveEvent) => {
        const drag = presetStoreDraftState.pointerDrag;
        if (!drag) return;
        drag.currentClientX = moveEvent.clientX;
        drag.currentClientY = moveEvent.clientY;
        updatePresetStoreDragGhostPosition(moveEvent.clientX, moveEvent.clientY);
        const insertionIndex = getPresetStoreDraftInsertionIndex(moveEvent.clientX, moveEvent.clientY);
        setPresetStoreDraftDropCue(insertionIndex);
        if (moveEvent.cancelable) moveEvent.preventDefault();
    };
    const finishDrag = (upEvent) => {
        const drag = presetStoreDraftState.pointerDrag;
        const hasPointer = upEvent && Number.isFinite(upEvent.clientX) && Number.isFinite(upEvent.clientY);
        const insertionIndex = hasPointer ? getPresetStoreDraftInsertionIndex(upEvent.clientX, upEvent.clientY, { bypassCooldown: true }) : -1;
        const changed = !!(drag && insertionIndex >= 0 && insertPresetStoreDraftItem(drag.name, insertionIndex, "draft"));
        removePresetStoreDragGhost();
        presetStoreDraftState.pointerDrag = null;
        clearPresetStoreDraftDragState();
        if (drag) {
            renderPresetStoreDraft();
            if (changed) syncPresetStoreCandidatePinnedState();
        }
        window.removeEventListener("pointermove", onMove, true);
        window.removeEventListener("pointerup", finishDrag, true);
        window.removeEventListener("pointercancel", finishDrag, true);
        window.removeEventListener("blur", finishDrag, true);
    };
    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerup", finishDrag, true);
    window.addEventListener("pointercancel", finishDrag, true);
    window.addEventListener("blur", finishDrag, true);
    if (event.cancelable) event.preventDefault();
}

function startPresetStoreCandidatePointerDrag(event, candidate) {
    if (event.button !== undefined && event.button !== 0) return;
    if (!candidate) return;
    if (event.target && event.target.closest && event.target.closest(".preset-store-user-delete")) return;
    const name = getCleanPresetStoreName(candidate.dataset.presetBaseName || candidate.textContent || "");
    if (!name) return;
    const rect = candidate.getBoundingClientRect();
    presetStoreDraftState.pointerDrag = {
        source: "candidate",
        name,
        activeChip: candidate,
        pointerOffsetX: event.clientX - rect.left,
        pointerOffsetY: event.clientY - rect.top,
        placeholderWidth: Math.max(86, Math.round(rect.width)),
        dropIndex: -1,
        pendingDropIndex: -1,
        pendingDropSince: 0,
        lastDropPoint: { x: event.clientX, y: event.clientY },
        startClientX: event.clientX,
        startClientY: event.clientY,
        currentClientX: event.clientX,
        currentClientY: event.clientY,
        lockDropIndexUntil: 0,
        dropRenderRaf: 0,
        ghostEl: createPresetStoreDragGhost(name, candidate),
    };
    candidate.classList.add("is-drag-source");
    document.body.classList.add("preset-store-dragging", "preset-store-dragging-candidate");
    updatePresetStoreDragGhostPosition(event.clientX, event.clientY);
    const onMove = (moveEvent) => {
        const drag = presetStoreDraftState.pointerDrag;
        if (!drag) return;
        drag.currentClientX = moveEvent.clientX;
        drag.currentClientY = moveEvent.clientY;
        updatePresetStoreDragGhostPosition(moveEvent.clientX, moveEvent.clientY);
        const insertionIndex = getPresetStoreDraftInsertionIndex(moveEvent.clientX, moveEvent.clientY);
        setPresetStoreDraftDropCue(insertionIndex);
        if (moveEvent.cancelable) moveEvent.preventDefault();
    };
    const finishDrag = (upEvent) => {
        const drag = presetStoreDraftState.pointerDrag;
        const hasPointer = upEvent && Number.isFinite(upEvent.clientX) && Number.isFinite(upEvent.clientY);
        const moved = drag && hasPointer
            ? Math.hypot(upEvent.clientX - (drag.startClientX || upEvent.clientX), upEvent.clientY - (drag.startClientY || upEvent.clientY))
            : 999;
        const releaseCandidate = upEvent && upEvent.target && upEvent.target.closest
            ? upEvent.target.closest(".preset-store-candidate")
            : null;
        const releaseName = releaseCandidate
            ? getCleanPresetStoreName(releaseCandidate.dataset.presetBaseName || releaseCandidate.textContent || "")
            : "";
        const isSameCandidateClick = !!(
            drag
            && releaseName
            && normalizePresetName(releaseName) === normalizePresetName(drag.name || "")
        );
        const isClickToggle = drag && hasPointer && moved < 8 && isSameCandidateClick;
        let insertionIndex = hasPointer ? getPresetStoreDraftInsertionIndex(upEvent.clientX, upEvent.clientY, { bypassCooldown: true }) : -1;
        if (isClickToggle && insertionIndex < 0) {
            insertionIndex = presetStoreDraftState.list.length;
        }
        const pendingAction = drag ? {
            name: drag.name,
            isClickToggle,
            insertionIndex,
        } : null;
        removePresetStoreDragGhost();
        presetStoreDraftState.pointerDrag = null;
        clearPresetStoreDraftDragState();
        let changed = false;
        let actionHandledRender = false;
        if (pendingAction) {
            if (pendingAction.isClickToggle) {
                togglePresetStoreCandidateByName(pendingAction.name);
                actionHandledRender = true;
            } else if (pendingAction.insertionIndex >= 0) {
                changed = insertPresetStoreDraftItem(pendingAction.name, pendingAction.insertionIndex, "candidate");
            }
        }
        if (drag) {
            if (!actionHandledRender) {
                renderPresetStoreDraft();
                if (changed) syncPresetStoreCandidatePinnedState();
            }
        }
        window.removeEventListener("pointermove", onMove, true);
        window.removeEventListener("pointerup", finishDrag, true);
        window.removeEventListener("pointercancel", finishDrag, true);
        window.removeEventListener("blur", finishDrag, true);
        if (upEvent && upEvent.cancelable) upEvent.preventDefault();
    };
    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerup", finishDrag, true);
    window.addEventListener("pointercancel", finishDrag, true);
    window.addEventListener("blur", finishDrag, true);
    if (event.cancelable) event.preventDefault();
}

function renderPresetStoreDraft() {
    const host = getPresetStoreControl("#preset_store_nav_draft");
    const count = getPresetStoreControl("#preset_store_draft_count");
    if (!host) return;
    const storeEl = getPresetStoreElement();
    const storeStyle = storeEl && window.getComputedStyle ? window.getComputedStyle(storeEl) : null;
    const hostRect = host.getBoundingClientRect();
    const canAnimateDraft = !!(
        storeEl
        && !storeEl.hidden
        && (!storeEl.classList || (!storeEl.classList.contains("hidden") && !storeEl.classList.contains("hide")))
        && (!storeStyle || (storeStyle.display !== "none" && storeStyle.visibility !== "hidden"))
        && hostRect.width > 0
        && hostRect.height > 0
    );
    const previousRects = new Map();
    if (canAnimateDraft) {
        host.querySelectorAll(".preset-store-draft-chip").forEach((chip) => {
            const key = String(chip.dataset.presetName || "");
            if (!key) return;
            const rect = chip.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return;
            previousRects.set(key, rect);
        });
    }
    host.innerHTML = "";
    const drag = presetStoreDraftState.pointerDrag;
    const dragNorm = drag ? normalizePresetName(drag.name || "") : "";
    const placeholderIndex = getPresetStoreVisualDropIndex(drag);
    const renderPlaceholder = () => {
        if (!drag || placeholderIndex < 0) return;
        const placeholder = document.createElement("div");
        placeholder.className = "preset-store-draft-chip is-drag-source preset-store-draft-placeholder";
        placeholder.setAttribute("aria-hidden", "true");
        placeholder.dataset.presetName = drag.name || "";
        placeholder.style.width = `${Math.max(86, Math.min(180, drag.placeholderWidth || 118))}px`;
        placeholder.innerHTML = `<span class="preset-store-draft-handle">::</span><span class="preset-store-draft-name"></span><button type="button" class="preset-store-draft-remove" aria-label="Remove preset">x</button>`;
        const label = placeholder.querySelector(".preset-store-draft-name");
        applyPresetStoreDisplayName(label, drag.name || "");
        host.appendChild(placeholder);
    };
    let visualIndex = 0;
    presetStoreDraftState.list.forEach((name, index) => {
        const isDraggedDraftItem = drag && drag.source === "draft" && normalizePresetName(name) === dragNorm;
        if (isDraggedDraftItem) {
            return;
        }
        if (placeholderIndex === visualIndex) {
            renderPlaceholder();
            visualIndex += 1;
        }
        const chip = document.createElement("div");
        chip.setAttribute("role", "button");
        chip.tabIndex = 0;
        chip.className = "preset-store-draft-chip";
        if (
            presetStoreDraftState.pointerDrag
            && normalizePresetName(presetStoreDraftState.pointerDrag.name) === normalizePresetName(name)
        ) {
            chip.classList.add("is-drag-source");
        }
        chip.dataset.presetName = name;
        chip.dataset.index = String(index);
        chip.innerHTML = `<span class="preset-store-draft-handle">::</span><span class="preset-store-draft-name"></span><button type="button" class="preset-store-draft-remove" aria-label="Remove preset">x</button>`;
        const label = chip.querySelector(".preset-store-draft-name");
        applyPresetStoreDisplayName(label, name);
        const remove = chip.querySelector(".preset-store-draft-remove");
        if (remove) {
            topbarApplyLocalizedAriaLabel(remove, "Remove preset");
            remove.addEventListener("pointerup", (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (event.stopImmediatePropagation) event.stopImmediatePropagation();
                removePresetStoreDraftItemAt(index);
            }, true);
        }
        chip.addEventListener("pointerdown", (event) => {
            if (event.target && event.target.closest && event.target.closest(".preset-store-draft-remove")) {
                return;
            }
            startPresetStoreDraftPointerDrag(event, index);
        }, true);
        host.appendChild(chip);
        visualIndex += 1;
    });
    if (placeholderIndex === visualIndex) {
        renderPlaceholder();
    }
    requestAnimationFrame(() => {
        if (!canAnimateDraft) return;
        host.querySelectorAll(".preset-store-draft-chip").forEach((chip) => {
            const key = String(chip.dataset.presetName || "");
            const prev = previousRects.get(key);
            if (!prev) return;
            if (
                presetStoreDraftState.pointerDrag
                && normalizePresetName(presetStoreDraftState.pointerDrag.name) === normalizePresetName(key)
            ) {
                return;
            }
            const next = chip.getBoundingClientRect();
            const dx = prev.left - next.left;
            const dy = prev.top - next.top;
            if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
            chip.animate(
                [
                    { transform: `translate(${dx}px, ${dy}px) scale(0.98)`, opacity: 0.8 },
                    { transform: "translate(0, 0) scale(1)", opacity: 1 }
                ],
                {
                    duration: 220,
                    easing: "cubic-bezier(0.22, 1, 0.36, 1)",
                }
            );
        });
    });
    if (count) {
        count.textContent = `${presetStoreDraftState.list.length}/${getPresetStoreDraftLimit()}`;
    }
    if (!presetStoreDraftState.pointerDrag) {
        clearPresetStoreDraftDragState();
    }
    host.dataset.simpleaiPresetStoreDraftRevision = getPresetStoreDraftRenderRevision();
    localizePresetStoreUi();
}

function syncPresetStoreCandidatePinnedState() {
    const presetStoreEl = getPresetStoreElement();
    if (!presetStoreEl) return;
    const draftSet = new Set(presetStoreDraftState.list.map((name) => normalizePresetName(name)));
    presetStoreEl.querySelectorAll(".preset-store-candidate").forEach((button) => {
        const name = getCleanPresetStoreName(button.dataset.presetBaseName || button.textContent || "");
        const isPinned = draftSet.has(normalizePresetName(name));
        button.classList.toggle("sai-store-pinned", isPinned);
        button.setAttribute("aria-pressed", isPinned ? "true" : "false");
    });
}

function getPresetStoreCandidateEntries() {
    const meta = presetStoreUiState.meta || {};
    const entries = Object.keys(meta)
        .map((name, index) => {
            const cleanName = getCleanPresetStoreName(name);
            if (!cleanName) return null;
            const item = meta[name] || {};
            const orderValue = Number(item.order);
            const source = item.source === "user" || cleanName.endsWith(".") ? "user" : "base";
            return {
                name: cleanName,
                engine: String(item.backend_engine || inferPresetStoreEngine(cleanName)),
                scene: !!item.scene,
                engineType: String(item.engine_type || ""),
                taskMethod: String(item.task_method || ""),
                mediaType: inferPresetStoreMediaType(item.engine_type, item.task_method),
                missing: !!item.missing,
                order: Number.isFinite(orderValue) ? orderValue : index,
                source,
            };
        })
        .filter(Boolean);
    if (entries.length) {
        const seen = new Set();
        return entries
            .filter((entry) => {
                const norm = normalizePresetName(entry.name);
                if (seen.has(norm)) return false;
                seen.add(norm);
                return true;
            })
            .sort((a, b) => (a.order - b.order) || a.name.localeCompare(b.name));
    }
    return [];
}

function getPresetStoreCandidateRenderRevision(entries = null) {
    const owner = presetStoreUiState.owner_key || getPresetStoreOwnerKey();
    const metaCount = Object.keys(presetStoreUiState.meta || {}).length;
    if (presetStoreUiState.meta_revision) {
        return `${owner}|${presetStoreUiState.meta_revision}|${metaCount}`;
    }
    const source = Array.isArray(entries) ? entries : getPresetStoreCandidateEntries();
    const fallback = source.map((entry) => [
        entry.name,
        entry.engine,
        entry.scene ? 1 : 0,
        entry.mediaType,
        entry.missing ? 1 : 0,
        entry.order,
        entry.source,
    ]);
    return `${owner}|${JSON.stringify(fallback)}`;
}

function createPresetStoreCandidateElement(entry) {
    const button = document.createElement("div");
    button.setAttribute("role", "button");
    button.tabIndex = 0;
    button.className = "preset-store-candidate";
    button.dataset.presetBaseName = entry.name;
    button.dataset.saiEngine = entry.engine;
    button.dataset.saiScene = entry.scene ? "scene" : "classic";
    button.dataset.saiMedia = entry.mediaType || "image";
    button.dataset.saiSource = entry.source || "base";
    button.dataset.saiSearchBase = [
        entry.name,
        entry.engine,
        entry.scene ? "scene" : "classic",
        entry.mediaType || "image",
        entry.engineType,
        entry.taskMethod,
        entry.source === "user" ? "user personal" : "system",
    ].join(" ").toLowerCase();
    button.dataset.saiSearch = `${button.dataset.saiSearchBase} ${getPresetStoreDisplayName(entry.name, entry.missing)}`.trim().toLowerCase();
    button.classList.toggle("preset-missing", !!entry.missing);
    button.classList.toggle("is-user-preset", entry.source === "user");
    const label = document.createElement("span");
    label.className = "preset-store-candidate-name";
    applyPresetStoreDisplayName(label, entry.name, entry.missing);
    const meta = document.createElement("span");
    meta.className = "preset-store-candidate-meta";
    meta.textContent = entry.engine;
    button.appendChild(label);
    button.appendChild(meta);
    if (entry.source === "user") {
        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "preset-store-user-delete";
        deleteButton.dataset.presetName = entry.name;
        deleteButton.textContent = "x";
        topbarApplyLocalizedAriaLabel(deleteButton, "Delete user preset");
        deleteButton.title = topbarTranslateText("Delete");
        button.appendChild(deleteButton);
    }
    button.addEventListener("keydown", (event) => {
        if (event.target && event.target.closest && event.target.closest(".preset-store-user-delete")) return;
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        if (event.stopImmediatePropagation) event.stopImmediatePropagation();
        togglePresetStoreCandidateByName(entry.name);
    }, true);
    return button;
}

function renderPresetStoreCandidateGroup(poolSelector, countSelector, entries) {
    const pool = getPresetStoreControl(poolSelector);
    const count = getPresetStoreControl(countSelector);
    if (!pool) return [];
    pool.innerHTML = "";
    entries.forEach((entry) => {
        pool.appendChild(createPresetStoreCandidateElement(entry));
    });
    if (count) {
        count.textContent = String(entries.length);
    }
    return Array.from(pool.querySelectorAll(".preset-store-candidate"));
}

function renderPresetStoreCandidatePool(candidateEntries = null) {
    const entries = Array.isArray(candidateEntries) ? candidateEntries : getPresetStoreCandidateEntries();
    const mainEntries = entries.filter((entry) => entry.source !== "user");
    const userEntries = entries.filter((entry) => entry.source === "user");
    const mainButtons = renderPresetStoreCandidateGroup(
        "#preset_store_candidate_pool",
        "#preset_store_pool_count",
        mainEntries
    );
    const userHead = getPresetStoreControl("#preset_store_user_pool_head");
    const userPool = getPresetStoreControl("#preset_store_user_candidate_pool");
    const hideUserPool = userEntries.length === 0;
    if (userHead) {
        userHead.hidden = hideUserPool;
        userHead.style.display = hideUserPool ? "none" : "";
    }
    if (userPool) {
        userPool.hidden = hideUserPool;
        userPool.style.display = hideUserPool ? "none" : "";
    }
    const userButtons = renderPresetStoreCandidateGroup(
        "#preset_store_user_candidate_pool",
        "#preset_store_user_pool_count",
        userEntries
    );
    syncPresetStoreCandidatePinnedState();
    return mainButtons.concat(userButtons);
}

function submitPresetStoreDraft(closeAfterApply) {
    let nextNav = cleanPresetStoreNameList(presetStoreDraftState.list, getPresetStoreDraftLimit());
    nextNav = ensurePresetStoreNavListMinimum(nextNav, true);
    const payload = JSON.stringify({
        presets: nextNav,
        close: !!closeAfterApply,
        t: Date.now(),
    });
    if (!nextNav.length) {
        console.warn("[UI-TRACE] preset_store_apply.empty_draft");
        return;
    }
    if (typeof setTopbarHiddenBridgeTextboxValue !== "function" || typeof clickTopbarHiddenBridgeButton !== "function") {
        console.warn("[UI-TRACE] preset_store_apply.bridge_missing");
        return;
    }
    const ok = setTopbarHiddenBridgeTextboxValue("preset_store_apply_payload", payload);
    if (!ok) {
        console.warn("[UI-TRACE] preset_store_apply.payload_missing");
        return;
    }
    topbarLastPresetStoreSeq = Math.max(0, Number(topbarLastPresetStoreSeq) || 0) + 1;
    topbarLastNavNameList = nextNav.slice();
    presetStoreUiState.nav_name_list = nextNav.slice();
    presetStoreDraftState.list = nextNav.slice();
    renderPresetStoreDraft();
    syncPresetStoreCandidatePinnedState();
    applyTopbarNavStyles(
        topbarLastPreset || nextNav[0],
        topbarLastTheme || presetStoreUiState.theme || "dark",
        nextNav
    );
    presetStoreDraftState.dirty = false;
    if (closeAfterApply) {
        presetStoreUiState.expand_flag = false;
        setPresetStoreOpen(getPresetStoreElement(), false);
    }
    requestAnimationFrame(() => {
        if (!triggerPresetStoreApplyOnce()) {
            console.warn("[UI-TRACE] preset_store_apply.button_missing");
        }
    });
}

function ensurePresetStoreDeleteOverlay() {
    let overlay = document.getElementById("simpleai_preset_store_delete_overlay");
    if (overlay) return overlay;

    overlay = document.createElement("div");
    overlay.id = "simpleai_preset_store_delete_overlay";
    overlay.className = "simpleai-toolbox-note-overlay simpleai-preset-delete-overlay";
    overlay.style.display = "none";

    const card = document.createElement("div");
    card.className = "simpleai-toolbox-note-card";

    const header = document.createElement("div");
    header.className = "simpleai-toolbox-note-header";

    const title = document.createElement("div");
    title.className = "simpleai-toolbox-note-title";
    title.textContent = topbarTranslateText("Delete user preset");

    const close = document.createElement("button");
    close.type = "button";
    close.className = "simpleai-toolbox-note-close";
    close.textContent = "x";
    close.onclick = () => hidePresetStoreDeleteOverlay();

    const body = document.createElement("div");
    body.className = "simpleai-toolbox-note-body";

    const actions = document.createElement("div");
    actions.className = "simpleai-toolbox-note-actions";

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "simpleai-toolbox-note-cancel";
    cancel.textContent = topbarTranslateText("Cancel");
    cancel.onclick = () => hidePresetStoreDeleteOverlay();

    const confirm = document.createElement("button");
    confirm.type = "button";
    confirm.className = "simpleai-toolbox-note-confirm danger";
    confirm.textContent = topbarTranslateText("Delete");
    confirm.onclick = () => {
        const name = getCleanPresetStoreName(overlay.dataset.presetName || "");
        if (!name) {
            hidePresetStoreDeleteOverlay();
            return;
        }
        const payload = JSON.stringify({ preset: name, t: Date.now() });
        const ok = typeof setTopbarHiddenBridgeTextboxValue === "function"
            && setTopbarHiddenBridgeTextboxValue("preset_store_delete_payload", payload);
        if (!ok) {
            console.warn("[UI-TRACE] preset_store_delete.payload_missing");
            return;
        }
        presetStoreDraftState.list = presetStoreDraftState.list.filter(
            (item) => normalizePresetName(item) !== normalizePresetName(name)
        );
        presetStoreDraftState.dirty = true;
        renderPresetStoreDraft();
        syncPresetStoreCandidatePinnedState();
        hidePresetStoreDeleteOverlay();
        requestAnimationFrame(() => {
            if (!triggerPresetStoreDeleteOnce()) {
                console.warn("[UI-TRACE] preset_store_delete.button_missing");
            }
        });
    };

    header.appendChild(title);
    header.appendChild(close);
    actions.appendChild(cancel);
    actions.appendChild(confirm);
    card.appendChild(header);
    card.appendChild(body);
    card.appendChild(actions);
    overlay.appendChild(card);
    overlay.addEventListener("click", (event) => {
        if (event.target === overlay) hidePresetStoreDeleteOverlay();
    });
    document.body.appendChild(overlay);
    return overlay;
}

function hidePresetStoreDeleteOverlay() {
    const overlay = document.getElementById("simpleai_preset_store_delete_overlay");
    if (overlay) overlay.style.display = "none";
}

function showPresetStoreDeleteConfirm(name) {
    const cleanName = getCleanPresetStoreName(name);
    if (!cleanName) return;
    const overlay = ensurePresetStoreDeleteOverlay();
    overlay.dataset.presetName = cleanName;
    const title = overlay.querySelector(".simpleai-toolbox-note-title");
    const body = overlay.querySelector(".simpleai-toolbox-note-body");
    const cancel = overlay.querySelector(".simpleai-toolbox-note-cancel");
    const confirm = overlay.querySelector(".simpleai-toolbox-note-confirm");
    const close = overlay.querySelector(".simpleai-toolbox-note-close");
    if (title) title.textContent = topbarTranslateText("Delete user preset");
    if (body) {
        body.innerHTML = "";
        const prompt = document.createElement("p");
        prompt.textContent = topbarTranslateTemplate("Delete {preset}? This removes the preset file from your user folder.", { preset: cleanName });
        body.appendChild(prompt);
    }
    if (cancel) cancel.textContent = topbarTranslateText("Cancel");
    if (confirm) confirm.textContent = topbarTranslateText("Delete");
    if (close) topbarApplyLocalizedAriaLabel(close, "Close");
    overlay.style.display = "flex";
}

function initPresetStoreDrag(presetStoreEl) {
    if (!presetStoreEl) return;
    const resizeState = ensurePresetStoreResize(presetStoreEl);
    const handle = presetStoreEl.querySelector(".preset-store-titlebar")
        || presetStoreEl.querySelector("#preset_store_tools")
        || document.getElementById("preset_store_tools");
    if (!handle || handle.__simpleaiPresetStoreDragBound === true) return;
    handle.__simpleaiPresetStoreDragBound = true;
    handle.dataset.simpleaiDragBound = "1";
    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const moveTo = (clientX, clientY) => {
        const rect = presetStoreEl.getBoundingClientRect();
        const margin = 12;
        const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin);
        const maxTop = Math.max(margin, window.innerHeight - Math.min(rect.height, window.innerHeight - margin * 2) - margin);
        const left = clamp(clientX - offsetX, margin, maxLeft);
        const top = clamp(clientY - offsetY, margin, maxTop);
        presetStoreEl.style.setProperty("left", `${Math.round(left)}px`, "important");
        presetStoreEl.style.setProperty("top", `${Math.round(top)}px`, "important");
        presetStoreEl.style.setProperty("transform", "none", "important");
    };
    const onMove = (event) => {
        if (!dragging) return;
        const point = event.touches && event.touches.length ? event.touches[0] : event;
        moveTo(point.clientX, point.clientY);
        if (event.cancelable) event.preventDefault();
    };
    const onUp = () => {
        dragging = false;
        window.removeEventListener("pointermove", onMove, true);
        window.removeEventListener("pointerup", onUp, true);
        window.removeEventListener("touchmove", onMove, true);
        window.removeEventListener("touchend", onUp, true);
        if (resizeState && resizeState.ensureWithinViewport) {
            resizeState.ensureWithinViewport(true);
        }
    };
    const onDown = (event) => {
        if (event.button !== undefined && event.button !== 0) return;
        if (window.innerWidth <= 860) return;
        if (event.target && event.target.closest && event.target.closest('button, input')) return;
        const point = event.touches && event.touches.length ? event.touches[0] : event;
        const rect = presetStoreEl.getBoundingClientRect();
        offsetX = point.clientX - rect.left;
        offsetY = point.clientY - rect.top;
        presetStoreEl.dataset.saiDragged = "1";
        dragging = true;
        window.addEventListener("pointermove", onMove, true);
        window.addEventListener("pointerup", onUp, true);
        window.addEventListener("touchmove", onMove, true);
        window.addEventListener("touchend", onUp, true);
        if (event.cancelable) event.preventDefault();
    };
    handle.addEventListener("pointerdown", onDown, true);
    handle.addEventListener("touchstart", onDown, true);
}

function getPresetStoreControl(selector) {
    const presetStoreEl = getPresetStoreElement();
    if (presetStoreEl && presetStoreEl.querySelector) {
        const local = presetStoreEl.querySelector(selector);
        if (local) return local;
    }
    return document.querySelector(selector);
}

function bindPresetStoreControls() {
    const presetStoreEl = getPresetStoreElement();
    if (!presetStoreEl) return;
    bindPresetStoreWheelContainment(presetStoreEl);
    const search = getPresetStoreControl("#preset_store_search");
    if (search && search.dataset.simpleaiBound !== "1") {
        search.dataset.simpleaiBound = "1";
        search.addEventListener("input", () => {
            presetStoreFilterState.query = String(search.value || "").trim().toLowerCase();
            applyPresetStoreFilters();
        });
    }

    const bindCandidatePool = (candidatePool) => {
        if (!candidatePool || candidatePool.dataset.simpleaiBound === "1") return;
        candidatePool.dataset.simpleaiBound = "1";
        candidatePool.addEventListener("pointerdown", (event) => {
            const button = event.target && event.target.closest ? event.target.closest(".preset-store-candidate") : null;
            if (!button) return;
            startPresetStoreCandidatePointerDrag(event, button);
        }, true);
        candidatePool.addEventListener("pointerup", (event) => {
            const deleteButton = event.target && event.target.closest ? event.target.closest(".preset-store-user-delete") : null;
            if (deleteButton) {
                const name = getCleanPresetStoreName(deleteButton.dataset.presetName || "");
                if (!name) return;
                event.preventDefault();
                event.stopPropagation();
                if (event.stopImmediatePropagation) event.stopImmediatePropagation();
                showPresetStoreDeleteConfirm(name);
            }
        }, true);
    };
    bindCandidatePool(getPresetStoreControl("#preset_store_candidate_pool"));
    bindCandidatePool(getPresetStoreControl("#preset_store_user_candidate_pool"));

    const draftHost = getPresetStoreControl("#preset_store_nav_draft");
    if (draftHost && draftHost.dataset.simpleaiBound !== "1") {
        draftHost.dataset.simpleaiBound = "1";
        draftHost.addEventListener("pointerup", (event) => {
            const remove = event.target && event.target.closest ? event.target.closest(".preset-store-draft-remove") : null;
            if (remove) {
                const chip = remove.closest(".preset-store-draft-chip");
                const name = chip ? getCleanPresetStoreName(chip.dataset.presetName || chip.textContent || "") : "";
                if (!name) return;
                event.preventDefault();
                event.stopPropagation();
                if (event.stopImmediatePropagation) event.stopImmediatePropagation();
                const existingIndex = presetStoreDraftState.list.findIndex((item) => normalizePresetName(item) === normalizePresetName(name));
                if (existingIndex >= 0) {
                    removePresetStoreDraftItemAt(existingIndex);
                }
                return;
            }
        }, true);
    }

    const sceneFilters = getPresetStoreControl("#preset_store_scene_filters");
    if (sceneFilters && sceneFilters.dataset.simpleaiBound !== "1") {
        sceneFilters.dataset.simpleaiBound = "1";
        sceneFilters.addEventListener("click", (event) => {
            const button = event.target && event.target.closest ? event.target.closest("[data-sai-scene-filter]") : null;
            if (!button) return;
            presetStoreFilterState.scene = button.getAttribute("data-sai-scene-filter") || "all";
            sceneFilters.querySelectorAll("[data-sai-scene-filter]").forEach((item) => {
                item.classList.toggle("is-active", item === button);
            });
            applyPresetStoreFilters();
        });
    }

    const close = getPresetStoreControl("#preset_store_close");
    if (close && close.dataset.simpleaiBound !== "1") {
        close.dataset.simpleaiBound = "1";
        close.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            recordPresetStoreOptimisticIntent(false);
            presetStoreUiState.expand_flag = false;
            setPresetStoreOpen(getPresetStoreElement(), false);
            triggerBarStoreToggleOnce();
        });
    }

    const resetDraft = getPresetStoreControl("#preset_store_reset_draft");
    if (resetDraft && resetDraft.dataset.simpleaiBound !== "1") {
        resetDraft.dataset.simpleaiBound = "1";
        resetDraft.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            setPresetStoreDraftFromNav(presetStoreUiState.nav_name_list, true);
            renderPresetStoreDraft();
            syncPresetStoreCandidatePinnedState();
        });
    }

    const applyDraft = getPresetStoreControl("#preset_store_apply_draft");
    if (applyDraft && applyDraft.dataset.simpleaiBound !== "1") {
        applyDraft.dataset.simpleaiBound = "1";
        applyDraft.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            submitPresetStoreDraft(false);
        });
    }

    const applyDraftClose = getPresetStoreControl("#preset_store_apply_draft_close");
    if (applyDraftClose && applyDraftClose.dataset.simpleaiBound !== "1") {
        applyDraftClose.dataset.simpleaiBound = "1";
        applyDraftClose.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            submitPresetStoreDraft(true);
        });
    }

}

function renderPresetStoreEngineFilters(buttons) {
    const host = getPresetStoreControl("#preset_store_engine_filters");
    if (!host) return;
    const engines = new Set();
    const source = buttons && buttons.length ? buttons : getPresetStoreCandidateEntries();
    source.forEach((item) => {
        const engine = item.dataset ? (item.dataset.saiEngine || "Other") : (item.engine || "Other");
        if (engine) engines.add(String(engine));
    });
    if (presetStoreFilterState.engine !== "all" && !engines.has(presetStoreFilterState.engine)) {
        presetStoreFilterState.engine = "all";
    }
    const ordered = ["all"].concat(Array.from(engines).sort((a, b) => a.localeCompare(b)));
    if (host.dataset.renderedEngines === ordered.join("|")) return;
    host.dataset.renderedEngines = ordered.join("|");
    host.innerHTML = "";
    ordered.forEach((engine) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "preset-store-filter";
        button.dataset.saiEngineFilter = engine;
        if (engine === "all") {
            topbarApplyLocalizedText(button, "All engines");
        } else {
            button.textContent = engine;
            button.setAttribute("data-original-text", engine);
        }
        if (presetStoreFilterState.engine === engine || (engine === "all" && !presetStoreFilterState.engine)) {
            button.classList.add("is-active");
        }
        button.addEventListener("click", () => {
            presetStoreFilterState.engine = engine;
            host.querySelectorAll("[data-sai-engine-filter]").forEach((item) => {
                item.classList.toggle("is-active", item === button);
            });
            applyPresetStoreFilters();
        });
        host.appendChild(button);
    });
    localizePresetStoreUi();
}

function applyPresetStoreFilters() {
    const preset_store = getPresetStoreElement();
    if (!preset_store) return;
    const query = String(presetStoreFilterState.query || "").trim().toLowerCase();
    const engineFilter = presetStoreFilterState.engine || "all";
    const sceneFilter = presetStoreFilterState.scene || "all";
    const candidateButtons = Array.from(preset_store.querySelectorAll(".preset-store-candidate"));
    const buttons = candidateButtons;
    if (!query && engineFilter === "all" && sceneFilter === "all") {
        buttons.forEach((button) => {
            button.style.display = "";
            button.classList.remove("sai-store-filter-hidden");
        });
        return;
    }
    let visibleCount = 0;
    buttons.forEach((button) => {
        const text = String(button.dataset.saiSearch || button.textContent || "").toLowerCase();
        const engine = button.dataset.saiEngine || "Other";
        const sceneType = button.dataset.saiScene || "classic";
        const mediaType = button.dataset.saiMedia || "image";
        const matchesQuery = !query || text.includes(query);
        const matchesEngine = engineFilter === "all" || engine === engineFilter;
        const matchesScene = sceneFilter === "all"
            || (sceneFilter === "image" || sceneFilter === "video"
                ? mediaType === sceneFilter
                : sceneType === sceneFilter);
        const visible = matchesQuery && matchesEngine && matchesScene;
        button.style.display = visible ? "" : "none";
        button.classList.toggle("sai-store-filter-hidden", !visible);
        if (visible) visibleCount += 1;
    });
    if (visibleCount === 0 && !query && engineFilter === "all" && sceneFilter === "all") {
        buttons.forEach((button) => {
            button.style.display = "";
            button.classList.remove("sai-store-filter-hidden");
        });
    }
}

function updatePresetStore(nav_name_list, role, expand_flag, theme) {
    const navList = Array.isArray(nav_name_list) ? nav_name_list : [];
    let nav_store = gradioApp().getElementById("bar_store");
    if (!nav_store) {
        return;
    }
    const portalFn = window.portalFloatingShells || (typeof portalFloatingShells === "function" ? portalFloatingShells : null);
    if (typeof portalFn === "function") {
        portalFn({ forcePresetStore: !!expand_flag });
    }
    // Gradio 6 compatibility: skip direct bar_store DOM writes to avoid Svelte null.style crashes.
    // (text/background for bar_store is intentionally left to Gradio rendering lifecycle).
    const preset_store = getPresetStoreElement();
    if (!preset_store) return;    
    const resizeState = ensurePresetStoreResize(preset_store);
    bindPresetStoreControls();
    initPresetStoreDrag(preset_store);
    setPresetStoreDraftFromNav(navList);
    const draftHost = getPresetStoreControl("#preset_store_nav_draft");
    const draftRevision = getPresetStoreDraftRenderRevision();
    const draftNeedsRender = !draftHost
        || draftHost.dataset.simpleaiPresetStoreDraftRevision !== draftRevision;
    if (draftNeedsRender) {
        renderPresetStoreDraft();
    }

    if (expand_flag) {
        if (preset_store.dataset.optimisticCollapsed === "1") {
            delete preset_store.dataset.optimisticCollapsed;
        }
        const didOpen = setPresetStoreOpen(preset_store, true);
        if (didOpen) {
            ensurePresetStoreInViewport(preset_store);
            if (resizeState && resizeState.ensureWithinViewport) {
                resizeState.ensureWithinViewport(false);
            }
        }
    } else {
        setPresetStoreOpen(preset_store, false);
    }
    let candidateEntries = presetStoreUiState.meta_revision ? null : getPresetStoreCandidateEntries();
    const candidateRevision = getPresetStoreCandidateRenderRevision(candidateEntries);
    const candidatePool = getPresetStoreControl("#preset_store_candidate_pool");
    const candidateNeedsRender = !candidatePool
        || preset_store.dataset.simpleaiPresetStoreRevision !== candidateRevision
        || preset_store.dataset.simpleaiPresetStoreReady !== "1"
        || !candidatePool.querySelector(".preset-store-candidate");
    if (candidateNeedsRender) {
        if (!candidateEntries) candidateEntries = getPresetStoreCandidateEntries();
        const candidateButtons = renderPresetStoreCandidatePool(candidateEntries);
        renderPresetStoreEngineFilters(candidateButtons);
        syncPresetStoreCandidatePinnedState();
        applyPresetStoreFilters();
        localizePresetStoreUi();
        preset_store.dataset.simpleaiPresetStoreRevision = candidateRevision;
        preset_store.dataset.simpleaiPresetStoreOwner = presetStoreUiState.owner_key || getPresetStoreOwnerKey();
        preset_store.dataset.simpleaiPresetStoreReady = candidateButtons.length > 0 ? "1" : "0";
    } else if (draftNeedsRender) {
        syncPresetStoreCandidatePinnedState();
    }
}

function refreshTopbarStoreIdentityLabel(systemParams = {}) {
    const storeRoot = document.getElementById("bar_store");
    const storeButton = storeRoot && (storeRoot.matches("button") ? storeRoot : storeRoot.querySelector("button"));
    if (!storeButton) return;

    const isGuest = isPresetStoreGuestIdentity(systemParams);
    storeRoot.classList.toggle("simpleai-guest-identity", isGuest);
    storeButton.classList.toggle("simpleai-guest-identity", isGuest);
    const englishText = isGuest ? "Guest identity" : "PresetStore";
    const englishTitle = "This browser is using a guest identity. Sign in to manage and save preset navigation.";
    const text = (typeof topbarTranslateText === "function" && topbarTranslateText(englishText)) || englishText;
    const textTargets = Array.from(storeButton.querySelectorAll("span, div"))
        .filter((item) => !item.children || item.children.length === 0);
    const target = textTargets.find((item) => String(item.textContent || "").trim()) || storeButton;
    target.textContent = text;
    target.setAttribute("data-original-text", englishText);
    storeButton.setAttribute("data-original-text", englishText);
    storeButton.title = isGuest
        ? ((typeof topbarTranslateText === "function" && topbarTranslateText(englishTitle)) || englishTitle)
        : "";

    if (isGuest) {
        const presetStore = getPresetStoreElement();
        if (presetStore) {
            invalidatePresetStoreReusableContent(presetStore);
            setPresetStoreOpen(presetStore, false);
        }
        presetStoreUiState.expand_flag = false;
    }
}

function getRandomTip() {
  if (typeof tips !== 'undefined' && tips && tips.length > 0) {
    return tips[Math.floor(Math.random() * tips.length)];
  }
  return '';
}

function simpleaiTopbarAssetBasePath() {
    try {
        const scripts = Array.from(document.scripts || []);
        for (const script of scripts) {
            const src = String(script.src || script.getAttribute("src") || "");
            const match = src.match(/^(.*\/(?:gradio_api\/)?file=)(?:javascript\/(?:topbar|script)\.js)(?:[?#].*)?$/i);
            if (match && match[1]) return match[1];
        }
    } catch (e) {}
    return "/gradio_api/file=";
}

function simpleaiTopbarAssetUrl(relativePath) {
    const normalized = String(relativePath || "").replace(/^\/+/, "");
    const encoded = normalized
        .split("/")
        .map((part) => encodeURIComponent(part))
        .join("/");
    return `${simpleaiTopbarAssetBasePath()}${encoded}`;
}

function simpleaiNormalizeAssetUrl(src) {
    try { return new URL(String(src || ""), window.location.href).href; } catch (e) {}
    return String(src || "");
}

function simpleaiLoadStylesheetOnceForTopbar(href) {
    const target = simpleaiNormalizeAssetUrl(href);
    const existing = Array.from(document.querySelectorAll('link[rel~="stylesheet"]')).find((link) => (
        simpleaiNormalizeAssetUrl(link.getAttribute("href") || link.href || "") === target
    ));
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.setAttribute("property", "stylesheet");
        link.addEventListener("load", () => resolve(link), { once: true });
        link.addEventListener("error", () => reject(new Error(`Failed to load stylesheet: ${href}`)), { once: true });
        link.href = href;
        (document.head || document.documentElement).appendChild(link);
    });
}

function simpleaiLoadScriptOnceForTopbar(src) {
    const target = simpleaiNormalizeAssetUrl(src);
    const existing = Array.from(document.scripts || []).find((script) => (
        simpleaiNormalizeAssetUrl(script.getAttribute("src") || script.src || "") === target
    ));
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.type = "text/javascript";
        script.async = false;
        script.addEventListener("load", () => resolve(script), { once: true });
        script.addEventListener("error", () => reject(new Error(`Failed to load script: ${src}`)), { once: true });
        script.src = src;
        (document.head || document.documentElement).appendChild(script);
    });
}

async function loadTagCartAssetsForMainButton() {
    if (typeof window.loadSimpleAILazyAssetGroup === "function") {
        try {
            const ok = await window.loadSimpleAILazyAssetGroup("tagCart");
            if (ok) return true;
        } catch (e) {
            console.warn("[SimpAI] tag cart lazy group failed", e);
        }
    }
    await simpleaiLoadStylesheetOnceForTopbar(simpleaiTopbarAssetUrl("css/tag_cart.css"));
    for (const path of [
        "javascript/papaparse.min_5.4.1.js",
        "javascript/sortable.min_1.15.2f.js",
        "javascript/tag_cart.js"
    ]) {
        await simpleaiLoadScriptOnceForTopbar(simpleaiTopbarAssetUrl(path));
    }
    return true;
}

async function openTagCartFromMainButton(toggleButton, targetID) {
    const existingTarget = getSimpleAIAppElement(targetID);
    if (existingTarget) {
        toggleComponentVisibility(toggleButton, targetID);
        return;
    }
    if (!toggleButton || toggleButton.dataset.simpleaiTagCartOpening === "1") {
        return;
    }
    toggleButton.dataset.simpleaiTagCartOpening = "1";
    try {
        const ok = await loadTagCartAssetsForMainButton();
        if (!ok) {
            if (typeof window.simpleaiShowLazyAssetLoadMessage === "function") {
                window.simpleaiShowLazyAssetLoadMessage("tagCart");
            }
            return;
        }
        if (window.SimpAITagCartAdapter && typeof window.SimpAITagCartAdapter.open === "function") {
            window.SimpAITagCartAdapter.open({
                anchor: toggleButton.getBoundingClientRect ? toggleButton.getBoundingClientRect() : null,
                container: document.body
            });
            toggleButton.classList.add("active");
            return;
        }
        const loadedTarget = getSimpleAIAppElement(targetID);
        if (loadedTarget) {
            loadedTarget.style.display = "flex";
            toggleButton.classList.add("active");
            return;
        }
        if (typeof window.simpleaiShowLazyAssetLoadMessage === "function") {
            window.simpleaiShowLazyAssetLoadMessage("tagCart");
        }
    } catch (e) {
        console.warn("[SimpAI] tag cart lazy open failed", e);
        if (typeof window.simpleaiShowLazyAssetLoadMessage === "function") {
            window.simpleaiShowLazyAssetLoadMessage("tagCart");
        }
    } finally {
        delete toggleButton.dataset.simpleaiTagCartOpening;
    }
}

function bindBtnClick(btnID, targetID) {
    const app = typeof gradioApp === "function" ? gradioApp() : null;
    const toggleButton = (app && app.getElementById ? app.getElementById(btnID) : null)
        || document.getElementById(btnID);
    const targetElement = (app && app.getElementById ? app.getElementById(targetID) : null)
        || document.getElementById(targetID);
    const shouldBindLazyTagCart = btnID === "tag_helper_btn" && targetID === "draggable-container";
    if (!toggleButton) {
        return;
    }
    if (!targetElement && !shouldBindLazyTagCart) {
        return;
    }
    if (toggleButton.dataset.simpleaiBound === "1") {
        return;
    }
    toggleButton.dataset.simpleaiBound = "1";
    toggleButton.addEventListener("click", function () {
        if (shouldBindLazyTagCart) {
            openTagCartFromMainButton(toggleButton, targetID);
            return;
        }
        toggleComponentVisibility(toggleButton, targetID);
    });
}

function bindPluginBtn() {
    bindBtnClick("tag_helper_btn", "draggable-container");    
}

function clearHiddenFlags(el) {
    if (!el) return;
    try {
        if (window.SimpAIVisibilityController?.clearHiddenFlags) {
            window.SimpAIVisibilityController.clearHiddenFlags(el);
            return;
        }
    } catch (e) {}
    const hadCollapsedHiddenState = !!(
        el.classList?.contains("simpai-force-hidden")
        || el.dataset?.simpleaiSceneHidden === "1"
        || el.dataset?.simpleaiAuxHidden === "1"
        || el.dataset?.simpleaiPresetModelHidden === "1"
    );
    try { el.removeAttribute("hidden"); } catch (e) {}
    try { el.removeAttribute("aria-hidden"); } catch (e) {}
    try {
        if (el.classList) {
            el.classList.remove("hidden");
            el.classList.remove("hide");
            el.classList.remove("simpai-force-hidden");
            el.classList.remove("simpai-mounted-hidden");
        }
    } catch (e) {}
    try {
        if (el.style && el.style.display === "none") {
            el.style.display = "";
        }
    } catch (e) {}
    try {
        if (hadCollapsedHiddenState && el.style) {
            el.style.removeProperty("min-height");
            el.style.removeProperty("height");
            el.style.removeProperty("margin");
            el.style.removeProperty("padding");
            el.style.removeProperty("overflow");
        }
    } catch (e) {}
}

function revealAncestorChain(el, appRoot) {
    let current = el ? el.parentElement : null;
    while (current) {
        clearHiddenFlags(current);
        if (appRoot && current === appRoot) break;
        current = current.parentElement;
    }
}

function getSimpleAIAppElement(id) {
    const app = typeof gradioApp === "function" ? gradioApp() : document;
    try {
        if (app && app.getElementById) {
            const el = app.getElementById(id);
            if (el) return el;
        }
    } catch (e) {}
    try { return document.getElementById(id); } catch (e) { return null; }
}

function removePostGenerationMissingGalleryPlaceholder() {
    try {
        const placeholder = document.getElementById("simpleai_post_generation_missing_gallery_placeholder");
        if (placeholder && placeholder.parentElement) {
            placeholder.parentElement.removeChild(placeholder);
            return true;
        }
    } catch (e) {}
    return false;
}

function getPostGenerationSupportSurface() {
    const column = document.querySelector(".preview_column");
    if (!column) return null;
    let guard = document.getElementById("simpleai_result_surface_guard");
    if (!guard) {
        guard = document.createElement("div");
        guard.id = "simpleai_result_surface_guard";
        guard.className = "simpleai-result-surface-guard";
        guard.innerHTML = '<div class="simpleai-result-surface-guard-frame"></div>';
        const catalog = getSimpleAIAppElement("finished_images_catalog");
        if (catalog && catalog.parentElement && column.contains(catalog)) {
            catalog.parentElement.insertBefore(guard, catalog);
        } else {
            column.appendChild(guard);
        }
    }
    return guard;
}

function clearPostGenerationSupportSurface() {
    const guard = document.getElementById("simpleai_result_surface_guard");
    if (!guard) return false;
    try {
        delete guard.dataset.simpleaiResultSurfaceGuard;
        delete guard.dataset.simpleaiPostGenerationSurface;
        delete guard.dataset.simpleaiResultSurfaceKey;
        delete guard.dataset.reason;
    } catch (e) {}
    try {
        ["display", "visibility", "min-height", "height", "max-height", "overflow", "opacity", "pointer-events"].forEach((name) => {
            removeSimpleAIStyleIfPresent(guard, name);
        });
    } catch (e) {}
    setSimpleAIPresetCatalogAttributeIfChanged(guard, "aria-hidden", "true");
    return true;
}

function expirePostGenerationSupportSurface(key, reason) {
    const guard = document.getElementById("simpleai_result_surface_guard");
    if (key && postGenerationSupportSurfaceKey && key !== postGenerationSupportSurfaceKey) return false;
    if (hasMountedPostGenerationResultMedia()) {
        try { clearPostGenerationSupportSurface(); } catch (e) {}
        return false;
    }
    const expiredKey = key || postGenerationSupportSurfaceKey || (guard && guard.dataset.simpleaiResultSurfaceKey) || "";
    if (expiredKey) postGenerationSupportSurfaceExpiredKey = expiredKey;
    postGenerationSupportSurfaceFreshUntil = 0;
    try { clearPostGenerationSupportSurface(); } catch (e) {}
    try { removePostGenerationMissingGalleryPlaceholder(); } catch (e) {}
    try { document.documentElement.classList.remove("simpai-post-generation-result-surface"); } catch (e) {}
    try {
        if (typeof restoreWelcomePreviewForEmptyGalleryBrowser === "function") {
            restoreWelcomePreviewForEmptyGalleryBrowser(reason || "support_surface_timeout");
        } else if (typeof restoreWelcomePreviewAfterCatalogClose === "function") {
            restoreWelcomePreviewAfterCatalogClose(reason || "support_surface_timeout");
        }
    } catch (e) {}
    simpaiUiTrace("log", "[UI-TRACE] post_generation_support_surface.expire", {
        reason: reason || "support_surface_timeout",
        keyExpired: !!expiredKey,
    });
    return true;
}

function schedulePostGenerationSupportSurfaceExpiry(key, reason) {
    if (postGenerationSupportSurfaceTimer) {
        clearTimeout(postGenerationSupportSurfaceTimer);
    }
    postGenerationSupportSurfaceTimer = setTimeout(() => {
        postGenerationSupportSurfaceTimer = null;
        expirePostGenerationSupportSurface(key, reason || "support_surface_timeout");
    }, POST_GENERATION_SUPPORT_SURFACE_TTL_MS + 80);
}

function ensurePostGenerationSupportSurface(imageUrl, reason, supportKey) {
    if (supportKey && !isPostGenerationSupportSurfaceFresh(supportKey)) {
        expirePostGenerationSupportSurface(supportKey, reason || "support_surface_stale");
        return null;
    }
    const guard = getPostGenerationSupportSurface();
    if (!guard) return null;
    try {
        guard.dataset.simpleaiResultSurfaceGuard = "1";
        if (supportKey) guard.dataset.simpleaiResultSurfaceKey = supportKey;
        guard.dataset.reason = reason || "result_surface_guard";
    } catch (e) {}
    revealPostGenerationResultNode(guard, "flex");
    try { guard.removeAttribute("aria-hidden"); } catch (e) {}
    try { collapseWelcomePreviewForPostGenerationSurface(guard); } catch (e) {}
    try { document.documentElement.classList.add("simpai-post-generation-result-surface"); } catch (e) {}
    simpaiUiTrace("log", "[UI-TRACE] post_generation_support_surface.ensure", {
        reason: reason || "result_surface_guard",
        hasImageUrl: !!imageUrl,
        layoutOnly: true,
    });
    schedulePostGenerationSupportSurfaceExpiry(supportKey || postGenerationSupportSurfaceKey, reason || "support_surface_timeout");
    return guard;
}

function ensurePostGenerationMissingGalleryPlaceholder(imageUrl, reason) {
    if (!imageUrl) return null;
    const column = document.querySelector(".preview_column");
    if (!column) return null;
    try { clearPostGenerationSupportSurface(); } catch (e) {}
    let placeholder = document.getElementById("simpleai_post_generation_missing_gallery_placeholder");
    if (!placeholder) {
        placeholder = document.createElement("div");
        placeholder.id = "simpleai_post_generation_missing_gallery_placeholder";
        placeholder.className = "simpai-post-generation-missing-gallery-placeholder";
        placeholder.dataset.simpleaiPostGenerationSurface = "1";
        const img = document.createElement("img");
        img.alt = "Generated image";
        img.loading = "eager";
        placeholder.appendChild(img);
        const catalog = getSimpleAIAppElement("finished_images_catalog");
        if (catalog && catalog.parentElement && column.contains(catalog)) {
            catalog.parentElement.insertBefore(placeholder, catalog);
        } else {
            column.insertBefore(placeholder, column.firstChild || null);
        }
    }
    try { placeholder.dataset.reason = reason || "missing_gallery"; } catch (e) {}
    const image = placeholder.querySelector("img");
    if (image && image.getAttribute("src") !== imageUrl) {
        image.src = imageUrl;
    }
    revealPostGenerationResultNode(placeholder, "flex");
    try { collapseWelcomePreviewForPostGenerationSurface(placeholder); } catch (e) {}
    try { document.documentElement.classList.add("simpai-post-generation-result-surface"); } catch (e) {}
    return placeholder;
}

function clearPostGenerationOwnedLayoutNode(node) {
    if (!node) return false;
    let owned = false;
    try {
        owned = node.dataset.simpleaiPostGenerationCollapsed === "1"
            || node.dataset.simpleaiPostGenerationSurface === "1";
    } catch (e) {}
    if (!owned) return false;
    try {
        delete node.dataset.simpleaiPostGenerationCollapsed;
        delete node.dataset.simpleaiPostGenerationSurface;
    } catch (e) {}
    try {
        [
            "display",
            "visibility",
            "min-height",
            "height",
            "max-height",
            "margin",
            "padding",
            "border",
            "overflow",
            "position",
            "inset",
            "width",
            "min-width",
            "max-width",
            "flex",
            "opacity",
            "pointer-events",
        ].forEach((name) => node.style.removeProperty(name));
    } catch (e) {}
    try { node.removeAttribute("hidden"); } catch (e) {}
    try { node.removeAttribute("aria-hidden"); } catch (e) {}
    try { node.hidden = false; } catch (e) {}
    try {
        node.classList.remove("hidden");
        node.classList.remove("hide");
        node.classList.remove("simpai-mounted-hidden");
    } catch (e) {}
    return true;
}

function preservePreviewGeneratingForActiveGeneration(resultEl, reason) {
    let activeGeneration = false;
    try {
        activeGeneration = typeof hasSimpleAIActiveGenerationControls === "function" && hasSimpleAIActiveGenerationControls();
    } catch (e) {}
    if (!activeGeneration) return false;

    const preview = getWelcomePreviewElement();
    if (!preview || !preview.closest) return false;
    const previewRow = preview.closest(".row");
    const resultRow = resultEl && resultEl.closest ? resultEl.closest(".row") : null;
    if (!previewRow) return false;
    const sameRow = !!(resultRow && previewRow === resultRow);

    const previewWrap = preview.closest(".form, .block");
    [previewRow, previewWrap, preview].filter(Boolean).forEach((node) => {
        clearPostGenerationOwnedLayoutNode(node);
    });

    revealSimpleAIGenerationResultNode(previewRow, "flex");
    if (sameRow) {
        try { previewRow.dataset.simpleaiGenerationResultSurface = "1"; } catch (e) {}
        try { previewRow.style.setProperty("min-height", simpleAIPreviewFitHeightVar(), "important"); } catch (e) {}
        try { previewRow.style.setProperty("height", simpleAIPreviewFitHeightVar(), "important"); } catch (e) {}
        try { previewRow.style.setProperty("overflow", "hidden", "important"); } catch (e) {}
    }

    if (previewWrap && previewWrap !== preview) {
        revealSimpleAIGenerationResultNode(previewWrap, "block");
        try { previewWrap.style.setProperty("flex", "1 1 0", "important"); } catch (e) {}
        try { previewWrap.style.setProperty("min-width", "0", "important"); } catch (e) {}
        try { previewWrap.style.setProperty("height", "100%", "important"); } catch (e) {}
    }

    revealSimpleAIGenerationResultNode(preview, "block");
    try { preview.style.setProperty("flex", "1 1 0", "important"); } catch (e) {}
    try { preview.style.setProperty("min-width", "0", "important"); } catch (e) {}
    try { preview.style.setProperty("height", simpleAIPreviewFitHeightVar(), "important"); } catch (e) {}
    try {
        simpaiUiTrace("log", "[UI-TRACE] generation_preview.preserved_with_gallery", {
            reason: reason || "active_generation_gallery_preview",
            sameRow,
        });
    } catch (e) {}
    return true;
}

function resetPostGenerationResultSurfaceState(reason) {
    const ids = [
        "preview_generating",
        "finished_gallery",
        "final_gallery",
        "comparison_box",
        "video_player",
        "simpleai_gallery_welcome_guard_placeholder",
    ];
    const nodes = new Set();
    ids.forEach((id) => {
        const el = getSimpleAIAppElement(id);
        if (!el) return;
        nodes.add(el);
        if (el.closest) {
            const form = el.closest(".form, .block");
            const row = el.closest(".row");
            if (form) nodes.add(form);
            if (row) nodes.add(row);
        }
    });
    try {
        document.querySelectorAll("[data-simpleai-post-generation-collapsed], [data-simpleai-post-generation-surface]").forEach((node) => nodes.add(node));
    } catch (e) {}
    nodes.forEach(clearPostGenerationOwnedLayoutNode);
    try { removeFinishedGalleryWelcomePlaceholder(); } catch (e) {}
    try { removePostGenerationMissingGalleryPlaceholder(); } catch (e) {}
    try { clearPostGenerationSupportSurface(); } catch (e) {}
    try { clearSimpleAICompareReadyState(reason || "post_generation_surface_reset"); } catch (e) {}
    try {
        document.querySelectorAll(".simpai-gallery-browser-overlay-row").forEach((node) => {
            node.classList.remove("simpai-gallery-browser-overlay-row");
        });
    } catch (e) {}
    try { document.documentElement.classList.remove("simpai-post-generation-result-surface"); } catch (e) {}
    simpaiUiTrace("log", "[UI-TRACE] post_generation_surface.reset", { reason: reason || "reset" });
}
window.resetPostGenerationResultSurfaceState = resetPostGenerationResultSurfaceState;

function markPostGenerationCollapsedNode(node) {
    if (!node) return false;
    try { node.dataset.simpleaiPostGenerationCollapsed = "1"; } catch (e) {}
    try { delete node.dataset.simpleaiGalleryWelcomeGuard; } catch (e) {}
    try { node.setAttribute("aria-hidden", "true"); } catch (e) {}
    try { node.hidden = true; } catch (e) {}
    try {
        node.classList.add("hidden");
        node.classList.remove("simpai-gallery-browser-overlay-row");
    } catch (e) {}
    try { node.style.setProperty("display", "none", "important"); } catch (e) {}
    try { node.style.setProperty("visibility", "hidden", "important"); } catch (e) {}
    try { node.style.setProperty("min-height", "0px", "important"); } catch (e) {}
    try { node.style.setProperty("height", "0px", "important"); } catch (e) {}
    try { node.style.setProperty("max-height", "0px", "important"); } catch (e) {}
    try { node.style.setProperty("margin", "0px", "important"); } catch (e) {}
    try { node.style.setProperty("padding", "0px", "important"); } catch (e) {}
    try { node.style.setProperty("border", "0px", "important"); } catch (e) {}
    try { node.style.setProperty("overflow", "hidden", "important"); } catch (e) {}
    return true;
}

function collapseWelcomePreviewForPostGenerationSurface(resultEl) {
    const preview = getWelcomePreviewElement();
    if (!preview || !preview.closest) return false;
    const previewRow = preview.closest(".row");
    const resultRow = resultEl && resultEl.closest ? resultEl.closest(".row") : null;
    const previewWrap = preview.closest(".form, .block") || preview;
    const previewWrapContainsResult = !!(previewWrap && resultEl && previewWrap !== resultEl && previewWrap.contains && previewWrap.contains(resultEl));
    const targets = new Set();
    if (previewRow && resultRow && previewRow !== resultRow) {
        targets.add(previewRow);
    } else {
        if (previewWrap && !previewWrapContainsResult) {
            targets.add(previewWrap);
        }
        targets.add(preview);
    }
    let collapsed = false;
    targets.forEach((node) => {
        collapsed = markPostGenerationCollapsedNode(node) || collapsed;
    });
    return collapsed;
}

function revealPostGenerationResultNode(node, displayValue) {
    if (!node) return false;
    try {
        delete node.dataset.simpleaiPostGenerationCollapsed;
        node.dataset.simpleaiPostGenerationSurface = "1";
        delete node.dataset.simpleaiCatalogLinkedGalleryHidden;
        delete node.dataset.simpleaiCatalogLinkedGalleryWrapperHidden;
    } catch (e) {}
    try { node.hidden = false; } catch (e) {}
    try { node.removeAttribute("hidden"); } catch (e) {}
    try { node.removeAttribute("aria-hidden"); } catch (e) {}
    try {
        node.classList.remove("hidden");
        node.classList.remove("hide");
        node.classList.remove("simpai-mounted-hidden");
        node.classList.remove("simpai-preset-switch-gallery-hidden");
        node.classList.remove("simpai-catalog-linked-gallery-hidden");
    } catch (e) {}
    try { node.style.setProperty("display", displayValue || "block", "important"); } catch (e) {}
    try { node.style.setProperty("visibility", "visible", "important"); } catch (e) {}
    try { node.style.setProperty("opacity", "1", "important"); } catch (e) {}
    try { node.style.setProperty("pointer-events", "auto", "important"); } catch (e) {}
    return true;
}

function ensurePostGenerationImageSurface(resultEl, reason) {
    const gallery = resultEl || getSimpleAIAppElement("finished_gallery");
    if (!gallery || !gallery.closest) return false;
    try { document.documentElement.classList.remove("simpai-main-gallery-browser-closed"); } catch (e) {}
    try { clearPostGenerationSupportSurface(); } catch (e) {}
    const row = gallery.closest(".row");
    const form = gallery.closest(".form, .block");
    const previewColumn = gallery.closest(".preview_column");
    try { setSimpleAIPreviewFitHeightVariable(previewColumn); } catch (e) {}
    try { clearFinishedImagesCatalogClosedHitbox("post_generation_surface"); } catch (e) {}
    try { clearSimpleAICatalogLinkedGalleryWrappers("post_generation_surface"); } catch (e) {}
    try {
        document.documentElement.classList.remove("simpai-gallery-browser-welcome-pending");
        document.documentElement.classList.remove("simpai-gallery-browser-loading-silent");
    } catch (e) {}
    try { setFinishedGalleryOverlayActive(false); } catch (e) {}
    try { removeFinishedGalleryWelcomePlaceholder(); } catch (e) {}
    try {
        document.querySelectorAll(".simpai-gallery-browser-overlay-row").forEach((node) => {
            node.classList.remove("simpai-gallery-browser-overlay-row");
        });
    } catch (e) {}
    if (row) {
        revealPostGenerationResultNode(row, "flex");
        try { row.style.setProperty("min-height", simpleAIPreviewFitHeightVar(), "important"); } catch (e) {}
        try { row.style.setProperty("height", simpleAIPreviewFitHeightVar(), "important"); } catch (e) {}
        try { row.style.setProperty("overflow", "hidden", "important"); } catch (e) {}
    }
    if (form) {
        revealPostGenerationResultNode(form, "flex");
        try { form.style.setProperty("flex", "1 1 0", "important"); } catch (e) {}
        try { form.style.setProperty("min-width", "0", "important"); } catch (e) {}
        try { form.style.setProperty("height", "100%", "important"); } catch (e) {}
    }
    revealPostGenerationResultNode(gallery, "block");
    try { document.documentElement.classList.add("simpai-post-generation-result-surface"); } catch (e) {}
    try {
        if (typeof simpleaiBindGalleryLightbox === "function") simpleaiBindGalleryLightbox();
    } catch (e) {}
    try {
        setTimeout(() => {
            try { if (typeof simpleaiBindGalleryLightbox === "function") simpleaiBindGalleryLightbox(); } catch (_e) {}
        }, 120);
    } catch (e) {}
    try {
        if (typeof simpleaiSyncGalleryStateSoon === "function") simpleaiSyncGalleryStateSoon();
    } catch (e) {}
    const preserveGeneratingPreview = preservePreviewGeneratingForActiveGeneration(gallery, reason || "post_generation");
    const collapsedPreview = preserveGeneratingPreview ? false : collapseWelcomePreviewForPostGenerationSurface(gallery);
    simpaiUiTrace("log", "[UI-TRACE] post_generation_surface.ensure", {
        reason: reason || "post_generation",
        collapsedPreview,
        preserveGeneratingPreview,
        row: row ? { cls: String(row.className || ""), data: row.dataset?.simpleaiPostGenerationSurface || "" } : null,
        sharedPreviewWrapper: !!(getWelcomePreviewElement()?.closest(".form, .block")?.contains?.(gallery)),
    });
    return true;
}

function preparePostGenerationComparisonSurfaceState(params, reason) {
    const reasonText = reason || "comparison_surface";
    try { clearFinishedGalleryBrowserCatalogOpenIntent(reasonText); } catch (e) {}
    let preparedParams = null;
    try {
        preparedParams = params && typeof params === "object"
            ? clearFinishedGalleryBrowserParamsForIndexState(params, reasonText)
            : null;
        if (preparedParams) {
            preparedParams.gallery_state = "finished_index";
            preparedParams.gallery_preview_open = true;
            preparedParams.__post_generation_has_output = true;
            preparedParams.__post_generation_gallery_output = true;
            preparedParams.__post_generation_video_output = false;
            preparedParams.__post_generation_compare_ready = true;
            preparedParams.__post_generation_compare_visible = true;
            preparedParams.__post_generation_compare_cleared = false;
            topbarLastSystemParams = preparedParams;
            window.simpleaiTopbarSystemParams = preparedParams;
        } else {
            resetFinishedGalleryBrowserRuntimeForResultState(reasonText);
        }
    } catch (e) {}
    try {
        finishedGalleryBrowserState.loading = false;
        finishedGalleryBrowserState.pendingPayload = null;
        finishedGalleryBrowserState.queuedOptions = null;
        finishedGalleryBrowserPreloadInFlight = false;
        syncFinishedGalleryBrowserMoreButton();
        setFinishedGalleryBrowserStatus("");
    } catch (e) {}
    const catalog = getSimpleAIAppElement("finished_images_catalog") || document.getElementById("finished_images_catalog");
    if (catalog) {
        try { collapseSimpleAIFinishedGalleryCatalog(catalog); } catch (e) {}
        try { collapseFinishedImagesCatalogClosedHitbox(reasonText); } catch (e) {}
    }
    ["finished_gallery", "final_gallery", "progress_video", "video_player"].forEach((id) => {
        try { markPostGenerationCollapsedNode(getSimpleAIAppElement(id) || document.getElementById(id)); } catch (e) {}
    });
    try { clearSimpleAICatalogLinkedGalleryWrappers(reasonText); } catch (e) {}
    try {
        document.documentElement.classList.remove("simpai-gallery-browser-has-media");
        document.documentElement.classList.remove("simpai-gallery-browser-overlay-active");
        document.documentElement.classList.remove("simpai-gallery-browser-welcome-pending");
        document.documentElement.classList.remove("simpai-gallery-browser-loading-silent");
        document.documentElement.classList.remove("simpai-video-result-preview");
        document.documentElement.classList.remove("simpai-main-gallery-browser-closed");
    } catch (e) {}
    simpaiUiTrace("log", "[UI-TRACE] comparison_surface.prepare", { reason: reasonText });
    return preparedParams || true;
}
window.preparePostGenerationComparisonSurfaceState = preparePostGenerationComparisonSurfaceState;

function ensurePostGenerationComparisonSurface(comparisonBox, reason) {
    const box = comparisonBox || getSimpleAIAppElement("comparison_box") || document.getElementById("comparison_box");
    if (!box || !box.closest) return false;
    try { suppressFinishedGalleryWelcomeGuardForComparison(reason || "comparison_surface"); } catch (e) {}
    try { preparePostGenerationComparisonSurfaceState(topbarLastSystemParams || window.simpleaiTopbarSystemParams || null, reason || "comparison_surface"); } catch (e) {}
    try { clearPostGenerationSupportSurface(); } catch (e) {}
    try { removePostGenerationMissingGalleryPlaceholder(); } catch (e) {}
    try { clearSimpleAICatalogLinkedGalleryWrappers("comparison_surface"); } catch (e) {}
    const row = box.closest(".row");
    const form = box.closest(".form, .block");
    const previewColumn = box.closest(".preview_column");
    try { setSimpleAIPreviewFitHeightVariable(previewColumn); } catch (e) {}
    if (row) {
        revealPostGenerationResultNode(row, "flex");
        try { row.dataset.simpleaiPostGenerationSurface = "1"; } catch (e) {}
        try { row.style.setProperty("min-height", simpleAIPreviewFitHeightVar(), "important"); } catch (e) {}
        try { row.style.setProperty("height", simpleAIPreviewFitHeightVar(), "important"); } catch (e) {}
        try { row.style.setProperty("overflow", "hidden", "important"); } catch (e) {}
    }
    if (form && form !== box) {
        revealPostGenerationResultNode(form, "flex");
        try { form.style.setProperty("flex", "1 1 0", "important"); } catch (e) {}
        try { form.style.setProperty("min-width", "0", "important"); } catch (e) {}
        try { form.style.setProperty("height", "100%", "important"); } catch (e) {}
        try { form.style.setProperty("min-height", "0px", "important"); } catch (e) {}
    }
    revealPostGenerationResultNode(box, "block");
    try { box.style.setProperty("height", simpleAIPreviewFitHeightVar(), "important"); } catch (e) {}
    try { box.style.setProperty("min-height", simpleAIPreviewFitHeightVar(), "important"); } catch (e) {}
    try { box.style.setProperty("max-height", simpleAIPreviewFitHeightVar(), "important"); } catch (e) {}
    try { box.style.setProperty("overflow", "hidden", "important"); } catch (e) {}
    const collapsedPreview = collapseWelcomePreviewForPostGenerationSurface(box);
    try {
        document.documentElement.classList.add("simpai-comparison-preview");
        document.documentElement.classList.add("simpai-post-generation-result-surface");
        document.documentElement.classList.remove("simpai-video-result-preview");
    } catch (e) {}
    simpaiUiTrace("log", "[UI-TRACE] comparison_surface.ensure", {
        reason: reason || "comparison_surface",
        collapsedPreview,
        row: row ? { cls: String(row.className || ""), data: row.dataset?.simpleaiPostGenerationSurface || "" } : null,
    });
    return true;
}
window.ensurePostGenerationComparisonSurface = ensurePostGenerationComparisonSurface;

function isWelcomePreviewSuppressedByUserSetting() {
    try {
        const labels = Array.from(document.querySelectorAll("label.checkbox-container"));
        for (const label of labels) {
            const text = String(label.textContent || "").trim();
            if (!/Hide welcome picture|隐藏欢迎图片轮播/.test(text)) continue;
            const input = label.querySelector('input[type="checkbox"]');
            if (input) return !!input.checked;
        }
    } catch (e) {}
    return false;
}

function isElementVisibleForWelcomeRestore(el) {
    if (!el) return false;
    try {
        const style = window.getComputedStyle ? window.getComputedStyle(el) : null;
        if (style && (style.display === "none" || style.visibility === "hidden")) return false;
        const rect = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
        return !rect || (rect.width > 0 && rect.height > 0);
    } catch (e) {
        return true;
    }
}

function isGenerationProgressActiveForWelcomeRestore() {
    try {
        if (typeof hasSimpleAIActiveGenerationControls === "function" && hasSimpleAIActiveGenerationControls()) return true;
    } catch (e) {}
    const progress = getSimpleAIAppElement("progress-bar") || document.getElementById("progress-bar");
    if (!isElementVisibleForWelcomeRestore(progress)) return false;
    const text = String(progress.textContent || "");
    return /ETA|采样步数|Task in progress|Preparing task|Generation task|Loading models|%/i.test(text);
}

function restoreWelcomePreviewIfResultSurfaceIdle(reason) {
    if (isWelcomePreviewSuppressedByUserSetting()) return false;
    if (isGenerationProgressActiveForWelcomeRestore()) return false;
    if (isPostGenerationSupportSurfaceFresh(postGenerationSupportSurfaceKey)) return false;
    if (hasMountedPostGenerationResultMedia()) return false;
    const video = getSimpleAIAppElement("video_player") || document.getElementById("video_player");
    const comparison = getSimpleAIAppElement("comparison_box") || document.getElementById("comparison_box");
    if (isElementVisibleForWelcomeRestore(video) || isElementVisibleForWelcomeRestore(comparison)) return false;
    try { clearPostGenerationSupportSurface(); } catch (e) {}
    try { removePostGenerationMissingGalleryPlaceholder(); } catch (e) {}
    try {
        document.documentElement.classList.remove("simpai-post-generation-result-surface");
        document.documentElement.classList.remove("simpai-video-result-preview");
        document.documentElement.classList.remove("simpai-comparison-preview");
    } catch (e) {}
    let restored = false;
    try {
        restored = restoreWelcomePreviewAfterCatalogClose(reason || "result_surface_idle") || restored;
    } catch (e) {}
    if (!restored) {
        try {
            restored = restoreWelcomePreviewForEmptyGalleryBrowser(reason || "result_surface_idle") || restored;
        } catch (e) {}
    }
    simpaiUiTrace("log", "[UI-TRACE] post_generation_support_surface.idle_restore", {
        reason: reason || "result_surface_idle",
        restored,
    });
    return restored;
}
window.restoreWelcomePreviewIfResultSurfaceIdle = restoreWelcomePreviewIfResultSurfaceIdle;

function getCheckboxCheckedByWrapperId(wrapperId) {
    const app = gradioApp();
    let wrapper = null;
    try {
        wrapper = app && app.getElementById ? app.getElementById(wrapperId) : null;
    } catch (e) {}
    if (!wrapper) {
        try {
            wrapper = document.getElementById(wrapperId);
        } catch (e) {
            wrapper = null;
        }
    }
    if (!wrapper || !wrapper.querySelector) return null;
    const input = wrapper.querySelector('input[type="checkbox"]');
    if (!input) return null;
    return !!input.checked;
}

function setPanelVisibleById(panelId, visible) {
    const app = gradioApp();
    let panel = null;
    try {
        panel = app && app.getElementById ? app.getElementById(panelId) : null;
    } catch (e) {}
    if (!panel) {
        try {
            panel = document.getElementById(panelId);
        } catch (e) {
            panel = null;
        }
    }
    if (!panel || !panel.style) return;
    if (visible) {
        panel.style.display = "";
        clearHiddenFlags(panel);
        revealAncestorChain(panel, app || null);
    } else {
        panel.style.display = "none";
        try { panel.setAttribute("hidden", ""); } catch (e) {}
        try {
            if (panel.classList) {
                panel.classList.add("hidden");
                panel.classList.add("simpai-force-hidden");
            }
        } catch (e) {}
    }
}

function isSceneFrontendActiveFromTopbarParams() {
    const params = window.simpleaiTopbarSystemParams && typeof window.simpleaiTopbarSystemParams === "object"
        ? window.simpleaiTopbarSystemParams
        : (topbarLastSystemParams && typeof topbarLastSystemParams === "object" ? topbarLastSystemParams : null);
    return !!(params && (params.__is_scene_frontend || params.scene_frontend));
}

function syncImageAndTtsPanelsFromCheckboxes(traceLabel, preferredSource) {
    if (typeof window.syncTopbarMountedPanelVisibility === "function") {
        window.syncTopbarMountedPanelVisibility(traceLabel, preferredSource);
        return;
    }
    const imageChecked = getCheckboxCheckedByWrapperId("input_image_checkbox");
    const ttsChecked = getCheckboxCheckedByWrapperId("qwen_tts_checkbox");
    if (imageChecked === null && ttsChecked === null) return;
    const showTts = !!ttsChecked;
    const showImage = !!imageChecked && !isSceneFrontendActiveFromTopbarParams();
    setPanelVisibleById("image_input_panel", showImage);
    document.documentElement.classList.toggle("simpai-engine-class-visible", showImage);
    setPanelVisibleById("tts_panel", showTts);
}

let mainLayoutResponsiveObserver = null;
let mainLayoutResponsiveObservedNode = null;
let mainLayoutResponsiveTimer = null;
let mainLayoutResponsiveResizeBound = false;

function getSimpleAiElementById(id) {
    const app = typeof gradioApp === "function" ? gradioApp() : document;
    try {
        if (app && app.getElementById) {
            const el = app.getElementById(id);
            if (el) return el;
        }
    } catch (e) {}
    try {
        return document.getElementById(id);
    } catch (e) {
        return null;
    }
}

function simpleAiElementVisible(el) {
    if (!el) return false;
    try {
        if (el.hidden || el.hasAttribute("hidden")) return false;
        if (el.classList && (el.classList.contains("hidden") || el.classList.contains("hide") || el.classList.contains("simpai-force-hidden"))) return false;
        const style = window.getComputedStyle ? window.getComputedStyle(el) : null;
        if (style && (style.display === "none" || style.visibility === "hidden")) return false;
        const rect = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
        return !rect || rect.width > 0 || rect.height > 0;
    } catch (e) {
        return false;
    }
}

function findMainWorkspaceRow() {
    const mainLayout = getSimpleAiElementById("main_layout_row");
    const advancedColumn = getSimpleAiElementById("advanced_column");
    if (!mainLayout || !advancedColumn) return null;
    let fallback = null;
    let node = advancedColumn.parentElement;
    while (node && node !== document.body && node !== document.documentElement) {
        if (node.contains(mainLayout) && node.contains(advancedColumn)) {
            if (!fallback) fallback = node;
            const children = Array.from(node.children || []);
            let mainChild = null;
            let advancedChild = null;
            for (const child of children) {
                if (!mainChild && (child === mainLayout || child.contains(mainLayout))) mainChild = child;
                if (!advancedChild && (child === advancedColumn || child.contains(advancedColumn))) advancedChild = child;
            }
            if (mainChild && advancedChild && mainChild !== advancedChild) return node;
        }
        node = node.parentElement;
    }
    return fallback;
}

function scheduleMainLayoutResponsiveStack(delay) {
    if (mainLayoutResponsiveTimer) {
        clearTimeout(mainLayoutResponsiveTimer);
    }
    mainLayoutResponsiveTimer = setTimeout(() => {
        mainLayoutResponsiveTimer = null;
        syncMainLayoutResponsiveStack();
    }, typeof delay === "number" ? delay : 0);
}

function syncMainLayoutResponsiveStack() {
    const workspace = findMainWorkspaceRow();
    const advancedColumn = getSimpleAiElementById("advanced_column");
    const advancedChecks = document.querySelector(".advanced_check_row");
    if (!workspace || !advancedColumn) return;

    setSimpleAIClassStateIfChanged(workspace, "simpai-main-workspace-row", true);

    const advancedVisible = simpleAiElementVisible(advancedColumn);
    if (!advancedVisible) {
        setSimpleAIClassStateIfChanged(document.documentElement, "simpai-main-layout-stacked", false);
        setSimpleAIClassStateIfChanged(workspace, "simpai-main-workspace-stacked", false);
        return;
    }

    const workspaceRect = workspace.getBoundingClientRect ? workspace.getBoundingClientRect() : null;
    const workspaceWidth = Math.floor((workspaceRect && workspaceRect.width) || workspace.clientWidth || window.innerWidth || 0);
    const checkWidth = advancedChecks
        ? Math.ceil(Math.max(advancedChecks.scrollWidth || 0, advancedChecks.getBoundingClientRect ? advancedChecks.getBoundingClientRect().width : 0))
        : 560;
    const leftMinWidth = Math.max(560, checkWidth + 8);
    const advancedPreferredWidth = Math.min(480, Math.max(420, Math.round((window.innerWidth || workspaceWidth || 1280) * 0.34)));
    let gap = 16;
    try {
        const style = window.getComputedStyle ? window.getComputedStyle(workspace) : null;
        const rawGap = style ? (style.columnGap || style.gap || "") : "";
        const parsedGap = parseFloat(rawGap);
        if (Number.isFinite(parsedGap)) gap = parsedGap;
    } catch (e) {}

    const currentlyStacked = document.documentElement.classList.contains("simpai-main-layout-stacked");
    const measuredStackWidth = leftMinWidth + advancedPreferredWidth + gap + 24;
    const stackBreakpoint = Math.min(960, measuredStackWidth);
    let shouldStack = workspaceWidth > 0 && workspaceWidth < stackBreakpoint;

    if (!currentlyStacked && workspaceWidth < 960 && advancedChecks && advancedChecks.getBoundingClientRect && advancedColumn.getBoundingClientRect) {
        const checksRect = advancedChecks.getBoundingClientRect();
        const advancedRect = advancedColumn.getBoundingClientRect();
        if (checksRect.width > 0 && advancedRect.width > 0 && checksRect.right + 8 > advancedRect.left) {
            shouldStack = true;
        }
    }

    setSimpleAIClassStateIfChanged(document.documentElement, "simpai-main-layout-stacked", shouldStack);
    setSimpleAIClassStateIfChanged(workspace, "simpai-main-workspace-stacked", shouldStack);
}
window.syncMainLayoutResponsiveStack = syncMainLayoutResponsiveStack;

function bindMainLayoutResponsiveStack() {
    const workspace = findMainWorkspaceRow();
    if (!workspace) {
        setTimeout(bindMainLayoutResponsiveStack, 300);
        return;
    }
    setSimpleAIClassStateIfChanged(workspace, "simpai-main-workspace-row", true);

    if (mainLayoutResponsiveObserver && mainLayoutResponsiveObservedNode !== workspace) {
        try { mainLayoutResponsiveObserver.disconnect(); } catch (e) {}
        mainLayoutResponsiveObserver = null;
    }

    if (!mainLayoutResponsiveObserver && typeof ResizeObserver === "function") {
        mainLayoutResponsiveObserver = new ResizeObserver(() => scheduleMainLayoutResponsiveStack(0));
        mainLayoutResponsiveObservedNode = workspace;
        try {
            mainLayoutResponsiveObserver.observe(workspace);
            const advancedColumn = getSimpleAiElementById("advanced_column");
            const advancedChecks = document.querySelector(".advanced_check_row");
            if (advancedColumn) mainLayoutResponsiveObserver.observe(advancedColumn);
            if (advancedChecks) mainLayoutResponsiveObserver.observe(advancedChecks);
        } catch (e) {}
    }

    if (!mainLayoutResponsiveResizeBound) {
        mainLayoutResponsiveResizeBound = true;
        window.addEventListener("resize", () => scheduleMainLayoutResponsiveStack(0));
    }

    syncMainLayoutResponsiveStack();
    setTimeout(syncMainLayoutResponsiveStack, 160);
    setTimeout(syncMainLayoutResponsiveStack, 500);
}
window.bindMainLayoutResponsiveStack = bindMainLayoutResponsiveStack;

function hasSimpleAIComparableInputFromDom() {
    const inputIds = [
        "scene_canvas",
        "scene_input_image1",
        "uov_input_image",
        "inpaint_input_image",
        "enhance_input_image",
    ];
    const isRendered = (root) => {
        if (!root || root.hidden) return false;
        try {
            const style = window.getComputedStyle ? window.getComputedStyle(root) : null;
            if (style && (style.display === "none" || style.visibility === "hidden")) return false;
        } catch (e) {}
        try {
            const rect = root.getBoundingClientRect();
            if (!(rect.width > 0 && rect.height > 0)) return false;
        } catch (e) {}
        return true;
    };
    const hasSketchPayload = (root) => {
        const textarea = root?.querySelector?.("textarea");
        const raw = String(textarea?.value || "").trim();
        if (!raw || raw[0] !== "{") return false;
        try {
            const payload = JSON.parse(raw);
            const width = Number(payload?.width || 0);
            const height = Number(payload?.height || 0);
            const imageRef = String(payload?.image_ref || "").trim();
            return width > 8
                && height > 8
                && !!imageRef
                && (payload?.simpai_sketch_cached === true || imageRef.startsWith("simpai-sketch-cache:"));
        } catch (e) {
            return false;
        }
    };
    const hasLoadedImage = (root) => {
        try {
            return Array.from(root.querySelectorAll("img")).some((image) => {
                const src = String(image.currentSrc || image.src || image.getAttribute("src") || "");
                const width = Number(image.naturalWidth || 0);
                const height = Number(image.naturalHeight || 0);
                return !!src && !/welcome/i.test(src) && width > 8 && height > 8;
            });
        } catch (e) {
            return false;
        }
    };
    return inputIds.some((id) => {
        const root = getSimpleAIAppElement(id) || document.getElementById(id);
        return isRendered(root) && (hasSketchPayload(root) || hasLoadedImage(root));
    });
}
window.hasSimpleAIComparableInputFromDom = hasSimpleAIComparableInputFromDom;

function syncPostGenerationResultControls(stateOverride) {
    const app = gradioApp();
    try {
        ensurePreviewGeneratingFitObserver();
        schedulePreviewGeneratingImageFit(0);
    } catch (e) {}
    try {
        if (typeof window.simpleaiReconcileGenerationActionButtons === "function") {
            window.simpleaiReconcileGenerationActionButtons("post_generation_result_controls");
            setTimeout(() => window.simpleaiReconcileGenerationActionButtons("post_generation_result_controls+120"), 120);
        }
    } catch (e) {}
    const find = (id) => {
        try {
            if (app && app.getElementById) {
                const el = app.getElementById(id);
                if (el) return el;
            }
        } catch (e) {}
        try { return document.getElementById(id); } catch (e) { return null; }
    };
    const isToolboxContainer = (node) => {
        if (!node) return false;
        try {
            if ((node.id || "") === "image_toolbox") return true;
            if (node.classList && node.classList.contains("toolbox")) return true;
        } catch (e) {}
        try {
            return !!(node.querySelectorAll && node.querySelectorAll("button.toolbox_icon_btn").length > 1);
        } catch (e) {
            return false;
        }
    };
    const toolboxContainerFor = (seed) => {
        let node = seed || null;
        for (let depth = 0; node && depth < 12; depth += 1) {
            if (isToolboxContainer(node)) return node;
            node = node.parentElement || null;
        }
        try {
            const compareBtn = find("compare_btn");
            node = compareBtn || null;
            for (let depth = 0; node && depth < 12; depth += 1) {
                if (isToolboxContainer(node)) return node;
                node = node.parentElement || null;
            }
        } catch (e) {}
        try {
            return find("image_toolbox") || document.querySelector("#image_toolbox, .toolbox, .gr-group:has(> .styler > button.toolbox_icon_btn)");
        } catch (e) {
            return find("image_toolbox");
        }
    };
    const toolboxButtonsFor = (toolbox) => {
        const buttons = [];
        const seen = new Set();
        const add = (node) => {
            if (!node || seen.has(node)) return;
            seen.add(node);
            buttons.push(node);
        };
        const scope = toolbox || toolboxContainerFor(find("compare_btn")) || find("image_toolbox");
        try {
            if (scope && scope.querySelectorAll) {
                scope.querySelectorAll("button.toolbox_icon_btn").forEach(add);
            }
        } catch (e) {}
        try {
            const compareBtn = find("compare_btn");
            if (compareBtn) add(compareBtn);
        } catch (e) {}
        return buttons;
    };
    const revealElementBasics = (el) => {
        if (!el) return;
        try { el.style.display = ""; } catch (e) {}
        try { el.style.removeProperty("display"); } catch (e) {}
        try { el.style.removeProperty("visibility"); } catch (e) {}
        try { el.style.removeProperty("pointer-events"); } catch (e) {}
        try { el.removeAttribute("hidden"); } catch (e) {}
        try { el.removeAttribute("aria-hidden"); } catch (e) {}
        try { el.hidden = false; } catch (e) {}
        try {
            delete el.dataset.simpleaiPresetSwitchGalleryHidden;
            delete el.dataset.simpleaiCatalogLinkedGalleryHidden;
            delete el.dataset.simpleaiCatalogLinkedGalleryWrapperHidden;
            el.classList.remove("hidden");
            el.classList.remove("hide");
            el.classList.remove("simpai-preset-switch-gallery-hidden");
            el.classList.remove("simpai-mounted-hidden");
            el.classList.remove("simpai-catalog-linked-gallery-hidden");
            el.classList.remove("simpleai-gallery-toolbox-hidden");
        } catch (e) {}
        try {
            ["min-height", "height", "max-height", "margin", "padding", "border", "overflow", "pointer-events"].forEach((name) => {
                el.style.removeProperty(name);
            });
        } catch (e) {}
    };
    const revealToolboxButtons = (toolbox) => {
        toolboxButtonsFor(toolbox).forEach((button) => {
            revealElementBasics(button);
            if ((button.id || "") === "compare_btn") {
                ensureSimpleAICompareButtonLabel(button);
                restoreSimpleAICompareButtonInteractivity(button);
            }
        });
    };
    const revealToolboxGroup = (seed) => {
        const toolbox = toolboxContainerFor(seed);
        if (toolbox) {
            revealElementBasics(toolbox);
            revealAncestorChain(toolbox, app || null);
        }
        revealToolboxButtons(toolbox);
        return toolbox;
    };
    const showElement = (el) => {
        if (!el) return;
        revealElementBasics(el);
        if ((el.id || "") === "compare_btn") {
            ensureSimpleAICompareButtonLabel(el);
            restoreSimpleAICompareButtonInteractivity(el);
            revealToolboxGroup(el);
        }
        if (isToolboxContainer(el)) {
            revealToolboxGroup(el);
        }
        revealAncestorChain(el, app || null);
    };
    const hideElement = (el) => {
        if (!el) return;
        try { el.style.display = "none"; } catch (e) {}
        try { el.setAttribute("aria-hidden", "true"); } catch (e) {}
        try { el.classList.add("hidden"); } catch (e) {}
    };
    const hideToolboxGroup = (seed) => {
        const toolbox = toolboxContainerFor(seed || find("compare_btn")) || find("image_toolbox");
        hideElement(toolbox);
    };
    const ensureButtonText = (el, text) => {
        if (!el || !text) return;
        try {
            if (String(el.textContent || "").trim()) return;
            el.textContent = text;
        } catch (e) {}
    };
    const setCompareButtonReadyState = (el, ready) => {
        setSimpleAICompareButtonReadyState(el, ready);
    };
    const isVisible = (el) => {
        if (!el) return false;
        const style = window.getComputedStyle ? window.getComputedStyle(el) : null;
        if (style && (style.display === "none" || style.visibility === "hidden")) return false;
        const rect = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
        return !rect || rect.width > 0 || rect.height > 0;
    };
    if (stateOverride && typeof stateOverride === "object" && Object.prototype.hasOwnProperty.call(stateOverride, "__image_tools_enabled")) {
        syncSimpleAIImageToolsEnabledClass(!(stateOverride.__image_tools_enabled === false));
    }
    if (isSimpleAIPresetGallerySuppressed()) {
        try {
            clearSimpleAIPresetSwitchGalleryHidden("post_generation_result_controls");
        } catch (e) {}
    }
    if (isSimpleAIPresetGallerySuppressed()) {
        try {
            document.documentElement.classList.remove("simpai-video-result-preview");
            document.documentElement.classList.remove("simpai-comparison-preview");
        } catch (e) {}
        setCompareButtonReadyState(find("compare_btn"), false);
        hideElement(find("image_toolbox"));
        hideElement(find("compare_btn"));
        hideElement(find("comparison_box"));
        return;
    }
    if (stateOverride && typeof stateOverride === "object") {
        try {
            clearFinishedGalleryBrowserParamsForResultState(stateOverride, "post_generation_result_controls");
            topbarLastSystemParams = stateOverride;
            window.simpleaiTopbarSystemParams = stateOverride;
        } catch (e) {}
    }
    let params = (stateOverride && typeof stateOverride === "object")
        ? stateOverride
        : (topbarLastSystemParams && typeof topbarLastSystemParams === "object" ? topbarLastSystemParams : null);
    const normalizePostGenerationStateFromRenderedOutput = (candidateParams, reason) => {
        const candidate = candidateParams && typeof candidateParams === "object" ? candidateParams : {};
        const catalog = find("finished_images_catalog");
        if (catalog && isSimpleAIPresetCatalogOpen(catalog)) return candidateParams;
        const gallery = find("finished_gallery") || find("final_gallery");
        if (!gallery || !gallery.querySelectorAll) return candidateParams;
        const mediaNodes = Array.from(gallery.querySelectorAll("img, video")).filter((node) => {
            const src = node.currentSrc || node.src || node.getAttribute("src") || "";
            if (!src || /welcome/i.test(src)) return false;
            const width = Number(node.naturalWidth || node.videoWidth || 0);
            const height = Number(node.naturalHeight || node.videoHeight || 0);
            return width > 8 && height > 8;
        });
        const itemCount = gallery.querySelectorAll(".grid-wrap .gallery-item, .gallery-container > .preview").length || mediaNodes.length;
        if (!mediaNodes.length || itemCount > 8) return candidateParams;
        const source = mediaNodes[0].currentSrc || mediaNodes[0].src || mediaNodes[0].getAttribute("src") || "";
        const browserPaths = Array.isArray(candidate.__main_gallery_browser_paths) ? candidate.__main_gallery_browser_paths : [];
        const normalizeText = (text) => {
            let value = String(text || "");
            try { value = decodeURIComponent(value); } catch (e) {}
            return value.replace(/\\/g, "/").toLowerCase();
        };
        const sourceText = normalizeText(source);
        const matchesBrowserPath = browserPaths.some((path) => {
            const normalizedPath = normalizeText(path);
            const name = normalizedPath.split("/").pop();
            return !!(name && sourceText.includes(name));
        });
        if (matchesBrowserPath) return candidateParams;
        const hasBrowserState = candidate.gallery_state === "main_browser" || hasOwnFinishedGalleryBrowserParamKey(candidate);
        const gallerySignature = getSimpleAIGalleryMediaSignature(gallery);
        const hasRenderedGenerationSignature = !!(
            gallerySignature
            && (
                gallery.dataset?.simpleaiGenerationResultSignature === gallerySignature
                || gallery.closest?.("[data-simpleai-generation-result-surface='1'], [data-simpleai-post-generation-surface='1']")
            )
        );
        const hasResultSurface = !!document.querySelector(
            ".preview_column > .row[data-simpleai-generation-result-surface='1'], .preview_column > .row[data-simpleai-post-generation-surface='1']"
        );
        const hasRenderedImageOutput = mediaNodes.some((node) => String(node.tagName || "").toUpperCase() === "IMG");
        const domCompareInputOk = !!(
            hasRenderedGenerationSignature
            && hasRenderedImageOutput
            && hasSimpleAIComparableInputFromDom()
        );
        const shouldNormalizeRenderedOutput = hasBrowserState || hasRenderedGenerationSignature || hasResultSurface;
        if (!shouldNormalizeRenderedOutput) return candidateParams;
        const nextParams = Object.assign({}, candidate);
        clearFinishedGalleryBrowserParamsForIndexState(nextParams, reason || "rendered_generation_output");
        nextParams.gallery_state = "finished_index";
        nextParams.gallery_preview_open = true;
        nextParams.__post_generation_has_output = true;
        nextParams.__post_generation_gallery_output = true;
        nextParams.__post_generation_video_output = false;
        nextParams.__post_generation_image_url = source;
        const compareBtn = find("compare_btn");
        const compareReady = !!(
            compareBtn
            && (
                compareBtn.dataset?.simpleaiCompareReady === "1"
                || compareBtn.classList?.contains("simpleai-compare-ready")
                || compareBtn.classList?.contains("primary")
            )
        );
        nextParams.__post_generation_compare_input_ok = domCompareInputOk || !!nextParams.__post_generation_compare_input_ok;
        nextParams.__post_generation_compare_visible = !!compareBtn;
        nextParams.__post_generation_compare_ready = domCompareInputOk || compareReady || !!nextParams.__post_generation_compare_ready;
        nextParams.__post_generation_compare_cleared = !nextParams.__post_generation_compare_ready;
        topbarLastSystemParams = nextParams;
        window.simpleaiTopbarSystemParams = nextParams;
        try { document.documentElement.classList.remove("simpai-main-gallery-browser-closed"); } catch (e) {}
        simpaiUiTrace("log", "[UI-TRACE] post_generation_state.normalized_from_rendered_output", {
            reason: reason || "rendered_generation_output",
            itemCount,
            hasSource: !!source,
            domCompareInputOk,
        });
        return nextParams;
    };
    params = normalizePostGenerationStateFromRenderedOutput(params, "post_generation_result_controls");
    const engineType = params?.__gallery_engine_type || params?.engine_type || params?.default_engine?.engine_type || "";
    const isVideoContext = engineType === "video";
    const domImageToolsEnabled = readSimpleAIImageToolsEnabledFromDom();
    const stateImageToolsEnabled = domImageToolsEnabled === null ? !(params && params.__image_tools_enabled === false) : domImageToolsEnabled;
    syncSimpleAIImageToolsEnabledClass(stateImageToolsEnabled);
    const stateCompareCleared = !!(params && params.__post_generation_compare_cleared);
    const comparisonBox = find("comparison_box");
    const postGenerationCompareAvailable = !!(
        params
        && params.__post_generation_has_output
        && params.__post_generation_compare_ready
        && params.__post_generation_compare_visible
        && !stateCompareCleared
    );
    const isMainGalleryBrowser = params?.gallery_state === "main_browser" && !postGenerationCompareAvailable;
    const compareActionBlocked = isMainGalleryBrowser || stateCompareCleared || !stateImageToolsEnabled || isVideoContext;
    const elementState = (el) => {
        if (!el) return null;
        let rect = null;
        let style = null;
        try {
            const r = el.getBoundingClientRect();
            rect = { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) };
        } catch (e) {}
        try {
            const cs = window.getComputedStyle ? window.getComputedStyle(el) : null;
            if (cs) style = { display: cs.display, visibility: cs.visibility, overflow: cs.overflow };
        } catch (e) {}
        return {
            id: el.id || "",
            hidden: !!el.hidden,
            cls: String(el.className || ""),
            dataPresetHidden: el.dataset?.simpleaiPresetSwitchGalleryHidden || "",
            dataCatalogHidden: el.dataset?.simpleaiCatalogLinkedGalleryHidden || "",
            style,
            rect,
            imgs: el.querySelectorAll ? el.querySelectorAll("img").length : 0,
            videos: el.querySelectorAll ? el.querySelectorAll("video").length : 0,
            items: el.querySelectorAll ? el.querySelectorAll(".gallery-item").length : 0,
            previews: el.querySelectorAll ? el.querySelectorAll(".gallery-container > .preview").length : 0,
        };
    };
    const comparisonVisible = !!comparisonBox && isVisible(comparisonBox);
    if (comparisonVisible && compareActionBlocked) {
        clearSimpleAICompareReadyState(isMainGalleryBrowser ? "main_gallery_browser" : "compare_source_cleared");
        hideElement(comparisonBox);
    }
    if (!stateImageToolsEnabled) {
        setCompareButtonReadyState(find("compare_btn"), false);
        hideElement(find("image_toolbox"));
        hideElement(comparisonBox);
    }
    const comparisonShouldBeVisible = !!comparisonBox && comparisonVisible && !compareActionBlocked;
    try {
        document.documentElement.classList.toggle("simpai-comparison-preview", comparisonShouldBeVisible);
    } catch (e) {}
    if (comparisonShouldBeVisible) {
        try { ensurePostGenerationComparisonSurface(comparisonBox, "comparison_visible"); } catch (e) {}
        suppressFinishedGalleryWelcomeGuardForComparison("comparison_visible");
        showElement(find("image_toolbox"));
        const compareBtn = find("compare_btn");
        setCompareButtonReadyState(compareBtn, true);
        showElement(compareBtn);
        return;
    }
    const finishedGallery = find("finished_gallery");
    const finalGallery = find("final_gallery");
    const galleryMediaSelector = "img, video, .gallery-item, .gallery-container > .preview";
    const hasFinishedGalleryMedia = !!finishedGallery && !!finishedGallery.querySelector(galleryMediaSelector);
    const finishedGalleryVisible = !!finishedGallery && isVisible(finishedGallery);
    const hasFinalGalleryMedia = !!finalGallery && !!finalGallery.querySelector(galleryMediaSelector);
    const hasGallerySinglePreview = () => {
        try {
            if (typeof simpleaiAnyManagedGalleryPreviewOpen === "function" && simpleaiAnyManagedGalleryPreviewOpen()) return true;
        } catch (e) {}
        try {
            if (document.querySelector("#finished_gallery .gallery-container > .preview, #final_gallery .gallery-container > .preview")) return true;
        } catch (e) {}
        try {
            const videoPlayer = find("video_player");
            if (videoPlayer && isVisible(videoPlayer) && (videoPlayer.querySelector("video") || videoPlayer.tagName === "VIDEO")) return true;
        } catch (e) {}
        return false;
    };
    const galleryPreviewRevealAllowed = () => {
        try {
            if (typeof window.simpleaiGalleryPreviewRevealAllowed === "function") return window.simpleaiGalleryPreviewRevealAllowed();
            if (document.documentElement.classList.contains("simpai-gallery-toolbox-deferred")) return false;
            const pendingUntil = Number(window.__simpleaiGalleryPreviewOpenPendingUntil || 0);
            if (pendingUntil > Date.now() && window.__simpleaiGalleryPreviewRevealReady === false) return false;
        } catch (e) {
            return true;
        }
        return true;
    };
    const stateHasOutput = !!(params && params.__post_generation_has_output);
    const stateHasGalleryOutput = !!(params && params.__post_generation_gallery_output);
    const stateHasVideoOutput = !!(params && params.__post_generation_video_output);
    const stateHasImageOutput = stateHasOutput && !isVideoContext && !stateHasVideoOutput;
    const stateGalleryPreviewOpen = !!(params && params.gallery_preview_open);
    const singlePreviewOpen = ((stateGalleryPreviewOpen || hasGallerySinglePreview()) && galleryPreviewRevealAllowed()) || (comparisonVisible && !compareActionBlocked);
    const activeGenerationControls = typeof hasSimpleAIActiveGenerationControls === "function" && hasSimpleAIActiveGenerationControls();
    const stateImageUrl = params?.__post_generation_image_url || "";
    const supportSurfaceKey = postGenerationSurfaceKeyFromParams(params);
    const supportSurfaceFresh = isPostGenerationSupportSurfaceFresh(supportSurfaceKey);
    const stateCompareVisible = !!(params && params.__post_generation_compare_visible);
    const stateCompareReady = !!(params && params.__post_generation_compare_ready);
    const galleryBrowserOpenOrLoading = isFinishedGalleryBrowserOpenOrLoading();
    const revealPostGenerationCompareControls = () => {
        const compareBtn = find("compare_btn");
        const toolboxVisible = stateImageToolsEnabled && singlePreviewOpen;
        const compareSurfaceVisible = toolboxVisible && !compareActionBlocked && (stateHasImageOutput || hasFinishedGalleryMedia || hasFinalGalleryMedia);
        const shouldMarkPostGenerationSurface = stateCompareVisible || stateHasImageOutput;
        const compareReady = !compareActionBlocked && compareSurfaceVisible && stateCompareReady;
        setCompareButtonReadyState(compareBtn, compareReady);
        if (!toolboxVisible) {
            hideToolboxGroup(compareBtn);
            return false;
        }
        try {
            document.documentElement.classList.toggle("simpai-post-generation-result-surface", !!shouldMarkPostGenerationSurface);
        } catch (e) {}
        showElement(find("image_toolbox"));
        showElement(compareBtn);
        ensureSimpleAICompareButtonLabel(compareBtn);
        return true;
    };
    if (!stateHasOutput && !stateHasGalleryOutput && !stateHasVideoOutput && !hasFinishedGalleryMedia && !hasFinalGalleryMedia) {
        if (galleryBrowserOpenOrLoading) {
            setCompareButtonReadyState(find("compare_btn"), false);
            hideElement(find("image_toolbox"));
            simpaiUiTrace("log", "[UI-TRACE] post_generation_result_controls.skip_gallery_browser_loading", {
                engineType,
                reason: "gallery_browser_loading",
            });
            return;
        }
        try { clearPostGenerationSupportSurface(); } catch (e) {}
        try { removePostGenerationMissingGalleryPlaceholder(); } catch (e) {}
        try { removeFinishedGalleryWelcomePlaceholder(); } catch (e) {}
        try {
            document.documentElement.classList.remove("simpai-post-generation-result-surface");
            document.documentElement.classList.remove("simpai-video-result-preview");
            document.documentElement.classList.remove("simpai-comparison-preview");
            document.documentElement.classList.remove("simpai-gallery-browser-welcome-pending");
            document.documentElement.classList.remove("simpai-gallery-browser-loading-silent");
            document.documentElement.classList.remove("simpai-gallery-browser-overlay-active");
        } catch (e) {}
        setCompareButtonReadyState(find("compare_btn"), false);
        if (singlePreviewOpen && stateImageToolsEnabled) {
            showElement(find("image_toolbox"));
            return;
        }
        hideElement(find("image_toolbox"));
        hideElement(finishedGallery);
        hideElement(finalGallery);
        simpaiUiTrace("log", "[UI-TRACE] post_generation_result_controls.no_output_reset", {
            engineType,
            reason: "no_output",
        });
        return;
    }
    if (!stateHasImageOutput) {
        try { clearPostGenerationSupportSurface(); } catch (e) {}
    }
    if (stateHasImageOutput || hasFinishedGalleryMedia || hasFinalGalleryMedia) {
        try { clearFinishedImagesCatalogClosedHitbox("post_generation_result_controls"); } catch (e) {}
    }
    const hasFinishedMedia = hasFinishedGalleryMedia || hasFinalGalleryMedia || stateHasImageOutput;
    const videoResultPreview = engineType === "video" && hasFinishedMedia;
    try {
        document.documentElement.classList.toggle("simpai-video-result-preview", videoResultPreview);
    } catch (e) {}
    simpaiUiTrace("log", "[UI-TRACE] post_generation_result_controls.dom", {
        engineType,
        isVideoContext,
        stateGalleryPreviewOpen,
        singlePreviewOpen,
        stateHasOutput,
        stateHasGalleryOutput,
        stateHasVideoOutput,
        stateHasImageOutput,
        hasFinishedGalleryMedia,
        finishedGalleryVisible,
        hasFinalGalleryMedia,
        stateCompareReady,
        compareButtonReady: find("compare_btn")?.dataset?.simpleaiCompareReady || "",
        suppressed: typeof isSimpleAIPresetGallerySuppressed === "function" ? isSimpleAIPresetGallerySuppressed() : null,
        finished: elementState(finishedGallery),
        finalGallery: elementState(finalGallery),
        catalog: elementState(find("finished_images_catalog")),
    });
    const shouldUseImageFallback = stateHasImageOutput
        && supportSurfaceFresh
        && (
            !finishedGallery
            || (!hasFinishedGalleryMedia && !hasFinalGalleryMedia && !!stateImageUrl)
            || (hasFinishedGalleryMedia && !finishedGalleryVisible && !!stateImageUrl)
        );
    if (shouldUseImageFallback) {
        const fallbackReason = !finishedGallery
            ? "finished_gallery_absent"
            : (hasFinishedGalleryMedia ? "finished_gallery_hidden" : "finished_gallery_empty");
        const fallbackSurface = ensurePostGenerationMissingGalleryPlaceholder(
            stateImageUrl,
            fallbackReason
        );
        showElement(find("finished_images_catalog"));
        try {
            console.warn("[UI-TRACE] post_generation_result_surface_missing", {
                reason: fallbackReason,
                preview: elementState(find("preview_generating")),
                finished: elementState(finishedGallery),
                catalog: elementState(find("finished_images_catalog")),
                stateHasGalleryOutput,
                hasFinishedGalleryMedia,
                finishedGalleryVisible,
                hasFinalGalleryMedia,
                hasImageUrl: !!stateImageUrl,
                fallbackSurface: elementState(fallbackSurface),
            });
        } catch (e) {}
        revealPostGenerationCompareControls();
        if (fallbackSurface) return;
    } else if (hasFinishedGalleryMedia || hasFinalGalleryMedia || !stateHasImageOutput) {
        removePostGenerationMissingGalleryPlaceholder();
    }
    if (stateHasImageOutput && !hasFinishedGalleryMedia && !hasFinalGalleryMedia) {
        if (!supportSurfaceFresh) {
            expirePostGenerationSupportSurface(supportSurfaceKey, "gallery_media_not_mounted_stale");
            showElement(find("finished_images_catalog"));
            revealPostGenerationCompareControls();
            return;
        }
        ensurePostGenerationSupportSurface("", "gallery_media_not_mounted", supportSurfaceKey);
        showElement(find("finished_images_catalog"));
        revealPostGenerationCompareControls();
        try {
            console.warn("[UI-TRACE] post_generation_result_surface_waiting", {
                reason: "gallery_media_not_mounted",
                stateHasGalleryOutput,
                hasImageUrl: !!stateImageUrl,
                supportSurfaceFresh,
                finished: elementState(finishedGallery),
                finalGallery: elementState(finalGallery),
            });
        } catch (e) {}
        return;
    }
    if (!hasFinishedMedia) {
        revealPostGenerationCompareControls();
        return;
    }

    const catalog = find("finished_images_catalog");
    if (finishedGallery && hasFinishedGalleryMedia) {
        showElement(finishedGallery);
        if (stateHasImageOutput && !activeGenerationControls) {
            ensurePostGenerationImageSurface(finishedGallery, "post_generation_result_controls");
        } else if (activeGenerationControls) {
            preservePreviewGeneratingForActiveGeneration(finishedGallery, "post_generation_result_controls_active_generation");
        } else {
            const preview = find("preview_generating");
            if (!activeGenerationControls && preview && preview.closest && preview.closest(".row") === finishedGallery.closest(".row")) {
                markPostGenerationCollapsedNode(preview);
            }
        }
    }
    if (hasFinalGalleryMedia) {
        try { clearPostGenerationSupportSurface(); } catch (e) {}
        showElement(finalGallery);
    }
    showElement(catalog);
    try {
        bindFinishedGalleryResolutionBadgeObserver();
        scheduleFinishedGalleryResolutionBadges("post_generation_result_controls");
    } catch (e) {}

    if (isVideoContext) {
        if (stateImageToolsEnabled && singlePreviewOpen) showElement(find("image_toolbox"));
        else hideElement(find("image_toolbox"));
        const compareBtn = find("compare_btn");
        setCompareButtonReadyState(compareBtn, false);
        if (stateImageToolsEnabled && singlePreviewOpen) showElement(compareBtn);
        return;
    }

    revealPostGenerationCompareControls();
}
window.syncPostGenerationResultControls = syncPostGenerationResultControls;

let previewGeneratingFitObserver = null;
let previewGeneratingFitObserverRoot = null;
let previewGeneratingFitTimer = null;
let previewGeneratingFitResizeBound = false;
const SIMPLEAI_PREVIEW_FIT_HEIGHT_CSS = "clamp(var(--simpai-preview-min-height, 320px), calc(100dvh - 260px), 768px)";

function simpleAIPreviewFitHeightVar() {
    return `var(--simpai-preview-fit-height, ${SIMPLEAI_PREVIEW_FIT_HEIGHT_CSS})`;
}

function setSimpleAIPreviewFitHeightVariable(target) {
    const column = target || document.querySelector("#main_layout_row > .preview_column") || document.querySelector(".preview_column");
    if (!column || !column.style) return false;
    if (column.style.getPropertyValue("--simpai-preview-fit-height") === SIMPLEAI_PREVIEW_FIT_HEIGHT_CSS) return false;
    column.style.setProperty("--simpai-preview-fit-height", SIMPLEAI_PREVIEW_FIT_HEIGHT_CSS);
    return true;
}

function syncPostGenerationGalleryResponsiveFit(reason) {
    let changed = false;
    try { changed = setSimpleAIPreviewFitHeightVariable() || changed; } catch (e) {}
    ["finished_gallery", "final_gallery"].forEach((id) => {
        const gallery = getSimpleAIElementById(id) || document.getElementById(id);
        if (!gallery || !gallery.closest || !gallery.querySelector) return;
        const hasMedia = !!gallery.querySelector("img, video, .gallery-item, .gallery-container > .preview");
        if (!hasMedia && !simpleAiElementVisible(gallery)) return;
        const row = gallery.closest(".row");
        const form = gallery.closest(".form, .block");
        if (row && (row.dataset?.simpleaiPostGenerationSurface === "1" || row.contains(gallery))) {
            try { changed = setPreviewGeneratingFitStyle(row, "min-height", simpleAIPreviewFitHeightVar()) || changed; } catch (e) {}
            try { changed = setPreviewGeneratingFitStyle(row, "height", simpleAIPreviewFitHeightVar()) || changed; } catch (e) {}
        }
        if (form && form !== gallery) {
            try { changed = setPreviewGeneratingFitStyle(form, "height", "100%") || changed; } catch (e) {}
            try { changed = setPreviewGeneratingFitStyle(form, "min-height", "0px") || changed; } catch (e) {}
        }
    });
    if (changed) {
        simpaiUiTrace("log", "[UI-TRACE] post_generation_gallery.responsive_fit", { reason: reason || "sync" });
    }
    return changed;
}
window.syncPostGenerationGalleryResponsiveFit = syncPostGenerationGalleryResponsiveFit;

function schedulePreviewGeneratingImageFit(delay) {
    if (previewGeneratingFitTimer) {
        clearTimeout(previewGeneratingFitTimer);
    }
    previewGeneratingFitTimer = setTimeout(() => {
        previewGeneratingFitTimer = null;
        syncPreviewGeneratingImageFit();
    }, typeof delay === "number" ? delay : 0);
}

function getPreviewGeneratingFitHeight(root) {
    const viewportHeight = Math.max(
        0,
        window.innerHeight || document.documentElement?.clientHeight || document.body?.clientHeight || 0
    );
    const target = viewportHeight > 0 ? viewportHeight - 260 : 512;
    return Math.min(768, Math.max(320, Math.floor(target)));
}

function normalizePreviewGeneratingFitStyleValue(value) {
    return String(value || "")
        .trim()
        .replace(/(^|[\s,(])-?0(?:px|%)(?=$|[\s,)])/g, (_match, prefix) => `${prefix}0`);
}

function setPreviewGeneratingFitStyle(node, name, value, priority = "important") {
    if (!node || !node.style) return false;
    const currentValue = node.style.getPropertyValue(name);
    const currentPriority = node.style.getPropertyPriority(name);
    const sameValue = currentValue === value
        || normalizePreviewGeneratingFitStyleValue(currentValue) === normalizePreviewGeneratingFitStyleValue(value);
    if (sameValue && currentPriority === priority) return false;
    node.style.setProperty(name, value, priority);
    return true;
}

function getPreviewGeneratingFitHiddenOwner(root) {
    if (!root || !root.closest) return null;
    const boundary = root.closest(".row") || root;
    let node = root;
    while (node) {
        const data = node.dataset || {};
        const classes = node.classList;
        const fitOwnedHidden = node === root && data.simpleaiPreviewFitHidden === "1";
        const hiddenByState = data.simpleaiPostGenerationCollapsed === "1"
            || data.simpleaiGalleryWelcomeHiddenForGallery === "1"
            || data.simpleaiPresetSwitchGalleryHidden === "1"
            || data.simpleaiCatalogLinkedGalleryHidden === "1";
        const hiddenByDom = !!node.hidden
            || node.hasAttribute?.("hidden")
            || node.getAttribute?.("aria-hidden") === "true"
            || classes?.contains("hidden")
            || classes?.contains("hide")
            || classes?.contains("simpai-mounted-hidden")
            || classes?.contains("simpai-gallery-browser-welcome-hidden")
            || classes?.contains("simpai-preset-switch-gallery-hidden")
            || classes?.contains("simpai-catalog-linked-gallery-hidden");
        const hiddenByInlineStyle = !fitOwnedHidden && !!node.style && (
            node.style.getPropertyValue("display") === "none"
            || node.style.getPropertyValue("visibility") === "hidden"
        );
        if (hiddenByState || hiddenByDom || hiddenByInlineStyle) return node;
        if (node === boundary) break;
        node = node.parentElement;
    }
    return null;
}

function applyPreviewGeneratingFitHiddenState(root, hiddenOwner) {
    if (!root || !hiddenOwner) return false;
    const newlyHidden = root.dataset?.simpleaiPreviewFitHidden !== "1";
    try { root.dataset.simpleaiPreviewFitHidden = "1"; } catch (e) {}
    setPreviewGeneratingFitStyle(root, "display", "none");
    setPreviewGeneratingFitStyle(root, "flex", "0 0 auto");
    setPreviewGeneratingFitStyle(root, "min-height", "0px");
    setPreviewGeneratingFitStyle(root, "height", "0px");
    setPreviewGeneratingFitStyle(root, "max-height", "0px");
    if (newlyHidden) {
        try {
            simpaiUiTrace("log", "[UI-TRACE] preview_fit.hidden_state", {
                ownerId: hiddenOwner.id || "",
                ownerClass: String(hiddenOwner.className || ""),
                postGenerationCollapsed: hiddenOwner.dataset?.simpleaiPostGenerationCollapsed === "1",
            });
        } catch (e) {}
    }
    return true;
}

function isPreviewGeneratingSplitResultRow(root) {
    if (!root || !root.closest) return false;
    const row = root.closest(".row");
    if (!row) return false;
    return ["finished_gallery", "final_gallery", "comparison_box", "video_player"].some((id) => {
        const el = getSimpleAiElementById(id);
        return !!(el && el !== root && row.contains(el) && simpleAiElementVisible(el));
    });
}

function hasSimpleAIActiveGenerationControls() {
    const stop = getSimpleAIElementById("stop_button");
    const skip = getSimpleAIElementById("skip_button");
    const generate = getSimpleAIElementById("generate_button");
    return !!(
        (stop && simpleAiElementVisible(stop))
        || (skip && simpleAiElementVisible(skip))
        || (generate && !simpleAiElementVisible(generate))
    );
}

function revealSimpleAIGenerationResultNode(node, displayValue) {
    if (!node) return false;
    try {
        delete node.dataset.simpleaiCatalogLinkedGalleryHidden;
        delete node.dataset.simpleaiCatalogLinkedGalleryWrapperHidden;
    } catch (e) {}
    try { clearSimpleAICatalogLinkedGalleryHiddenElement(node, true); } catch (e) {}
    try { node.hidden = false; } catch (e) {}
    try { node.removeAttribute("hidden"); } catch (e) {}
    try { node.removeAttribute("aria-hidden"); } catch (e) {}
    try {
        node.classList.remove("hidden");
        node.classList.remove("hide");
        node.classList.remove("simpai-mounted-hidden");
        node.classList.remove("simpai-catalog-linked-gallery-hidden");
    } catch (e) {}
    try { node.style.setProperty("display", displayValue || "block", "important"); } catch (e) {}
    try { node.style.setProperty("visibility", "visible", "important"); } catch (e) {}
    try { node.style.setProperty("opacity", "1", "important"); } catch (e) {}
    try { node.style.setProperty("pointer-events", "auto", "important"); } catch (e) {}
    try { node.style.setProperty("min-width", "0px", "important"); } catch (e) {}
    try { node.style.setProperty("max-width", "none", "important"); } catch (e) {}
    return true;
}

function syncGenerationResultGallerySurface(reason) {
    const preview = getSimpleAIElementById("preview_generating");
    if (!preview || !hasSimpleAIActiveGenerationControls()) return false;
    let changed = false;
    ["finished_gallery", "final_gallery"].forEach((id) => {
        const gallery = getSimpleAIElementById(id);
        if (!gallery || !gallery.closest) return;
        const currentSignature = getSimpleAIGalleryMediaSignature(gallery);
        if (!currentSignature) return;
        const hiddenSignature = gallery.dataset?.simpleaiCatalogLinkedGalleryHiddenSignature || "";
        const galleryNeedsReveal = !!(
            gallery.dataset?.simpleaiCatalogLinkedGalleryHidden === "1"
            || gallery.dataset?.simpleaiCatalogLinkedGalleryWrapperHidden === "1"
            || gallery.dataset?.simpleaiPostGenerationSurface !== "1"
            || gallery.classList?.contains("simpai-catalog-linked-gallery-hidden")
            || document.documentElement.classList.contains("simpai-main-gallery-browser-closed")
        );
        if (hiddenSignature && hiddenSignature === currentSignature && !galleryNeedsReveal) return;
        const row = gallery.closest(".row");
        if (row && !row.contains(preview)) return;
        const form = gallery.closest(".form, .block");
        try { clearSimpleAICatalogLinkedGalleryWrappers(reason || "generation_result_surface"); } catch (e) {}
        if (row) {
            revealSimpleAIGenerationResultNode(row, "flex");
            try { row.dataset.simpleaiGenerationResultSurface = "1"; } catch (e) {}
            try { row.dataset.simpleaiPostGenerationSurface = "1"; } catch (e) {}
        }
        if (form && form !== gallery) {
            revealSimpleAIGenerationResultNode(form, "block");
            try { form.dataset.simpleaiPostGenerationSurface = "1"; } catch (e) {}
        }
        revealSimpleAIGenerationResultNode(gallery, "block");
        try { syncSimpleAIGenerationGalleryMode(gallery, currentSignature, reason || "generation_result_surface"); } catch (e) {}
        try {
            gallery.dataset.simpleaiPostGenerationSurface = "1";
            gallery.dataset.simpleaiGenerationResultSignature = currentSignature;
            gallery.dataset.simpleaiCatalogLinkedGalleryHiddenSignature = currentSignature;
        } catch (e) {}
        changed = true;
    });
    if (changed) {
        try {
            document.documentElement.classList.remove("simpai-main-gallery-browser-closed");
            document.documentElement.classList.remove("simpai-gallery-browser-welcome-pending");
            document.documentElement.classList.remove("simpai-gallery-browser-loading-silent");
        } catch (e) {}
        try {
            bindFinishedGalleryResolutionBadgeObserver();
            scheduleFinishedGalleryResolutionBadges(reason || "generation_result_surface");
        } catch (e) {}
        simpaiUiTrace("log", "[UI-TRACE] generation_result_gallery.surface_revealed", { reason: reason || "generation_result_surface" });
    }
    return changed;
}
window.syncGenerationResultGallerySurface = syncGenerationResultGallerySurface;

function syncPreviewGeneratingImageFit() {
    const app = typeof gradioApp === "function" ? gradioApp() : document;
    const root = (app && app.getElementById ? app.getElementById("preview_generating") : null) || document.getElementById("preview_generating");
    if (!root) return;
    try { syncGenerationResultGallerySurface("preview_fit_sync"); } catch (e) {}
    try { syncPostGenerationGalleryResponsiveFit("preview_fit_sync"); } catch (e) {}
    const hiddenOwner = getPreviewGeneratingFitHiddenOwner(root);
    if (hiddenOwner) {
        applyPreviewGeneratingFitHiddenState(root, hiddenOwner);
        return;
    }
    try { delete root.dataset.simpleaiPreviewFitHidden; } catch (e) {}
    const targetHeight = getPreviewGeneratingFitHeight(root) + "px";
    const splitResultRow = isPreviewGeneratingSplitResultRow(root);
    const previewColumn = root.closest ? root.closest(".preview_column") : null;
    if (previewColumn && previewColumn.style) setSimpleAIPreviewFitHeightVariable(previewColumn);
    setPreviewGeneratingFitStyle(root, "--simpai-preview-fit-height", SIMPLEAI_PREVIEW_FIT_HEIGHT_CSS, "");
    setPreviewGeneratingFitStyle(root, "width", splitResultRow ? "auto" : "100%");
    setPreviewGeneratingFitStyle(root, "flex", splitResultRow ? "1 1 0" : "0 1 auto");
    setPreviewGeneratingFitStyle(root, "min-width", "0px");
    setPreviewGeneratingFitStyle(root, "max-width", "none");
    setPreviewGeneratingFitStyle(root, "height", targetHeight);
    setPreviewGeneratingFitStyle(root, "min-height", "0px");
    setPreviewGeneratingFitStyle(root, "max-height", targetHeight);
    setPreviewGeneratingFitStyle(root, "box-sizing", "border-box");
    setPreviewGeneratingFitStyle(root, "overflow", "hidden");

    const images = Array.from(root.querySelectorAll("img"));
    for (const img of images) {
        let node = img.parentElement;
        while (node && node !== root.parentElement) {
            if (node.style) {
                const nodeIsRoot = node === root;
                setPreviewGeneratingFitStyle(node, "width", nodeIsRoot && splitResultRow ? "auto" : "100%");
                if (nodeIsRoot) {
                    setPreviewGeneratingFitStyle(node, "flex", splitResultRow ? "1 1 0" : "0 1 auto");
                }
                setPreviewGeneratingFitStyle(node, "max-width", "none");
                setPreviewGeneratingFitStyle(node, "height", targetHeight);
                setPreviewGeneratingFitStyle(node, "min-height", "0px");
                setPreviewGeneratingFitStyle(node, "max-height", targetHeight);
                setPreviewGeneratingFitStyle(node, "display", "flex");
                setPreviewGeneratingFitStyle(node, "align-items", "center");
                setPreviewGeneratingFitStyle(node, "justify-content", "center");
                setPreviewGeneratingFitStyle(node, "box-sizing", "border-box");
                setPreviewGeneratingFitStyle(node, "overflow", "hidden");
            }
            if (node === root) break;
            node = node.parentElement;
        }

        setPreviewGeneratingFitStyle(img, "width", "100%");
        setPreviewGeneratingFitStyle(img, "height", "100%");
        setPreviewGeneratingFitStyle(img, "max-width", "100%");
        setPreviewGeneratingFitStyle(img, "max-height", targetHeight);
        setPreviewGeneratingFitStyle(img, "object-fit", "contain");
        setPreviewGeneratingFitStyle(img, "object-position", "center center");
        setPreviewGeneratingFitStyle(img, "display", "block");
    }
}
window.syncPreviewGeneratingImageFit = syncPreviewGeneratingImageFit;

function handlePreviewGeneratingFitViewportResize() {
    try { syncPostGenerationGalleryResponsiveFit("preview_fit.resize"); } catch (e) {}
    schedulePreviewGeneratingImageFit(0);
    setTimeout(() => {
        try { syncPostGenerationGalleryResponsiveFit("preview_fit.resize+80ms"); } catch (e) {}
    }, 80);
    setTimeout(() => syncScenePanelMaxHeight("preview_fit.resize+80ms"), 80);
}

function ensurePreviewGeneratingFitObserver() {
    const app = typeof gradioApp === "function" ? gradioApp() : document;
    const root = (app && app.getElementById ? app.getElementById("preview_generating") : null) || document.getElementById("preview_generating");
    if (!root) return;
    if (!previewGeneratingFitResizeBound) {
        previewGeneratingFitResizeBound = true;
        window.addEventListener("resize", handlePreviewGeneratingFitViewportResize);
        try {
            if (window.visualViewport && window.visualViewport.addEventListener) {
                window.visualViewport.addEventListener("resize", handlePreviewGeneratingFitViewportResize);
            }
        } catch (e) {}
    }
    const observeRoot = (root.closest && root.closest(".row")) || root;
    if (previewGeneratingFitObserver && previewGeneratingFitObserverRoot === observeRoot) return;
    if (previewGeneratingFitObserver) {
        try { previewGeneratingFitObserver.disconnect(); } catch (e) {}
    }
    previewGeneratingFitObserverRoot = observeRoot;
    if (typeof MutationObserver === "function") {
        previewGeneratingFitObserver = new MutationObserver(() => {
            try { syncGenerationResultGallerySurface("preview_fit_mutation"); } catch (e) {}
            const hiddenOwner = getPreviewGeneratingFitHiddenOwner(root);
            if (hiddenOwner) {
                applyPreviewGeneratingFitHiddenState(root, hiddenOwner);
                return;
            }
            schedulePreviewGeneratingImageFit(0);
        });
        try {
            previewGeneratingFitObserver.observe(observeRoot, {
                attributes: true,
                childList: true,
                subtree: true,
                attributeFilter: ["class", "src", "style", "hidden"]
            });
        } catch (e) {
            previewGeneratingFitObserver = null;
        }
    }
    syncPreviewGeneratingImageFit();
    setTimeout(syncPreviewGeneratingImageFit, 120);
    setTimeout(syncPreviewGeneratingImageFit, 420);
}
window.ensurePreviewGeneratingFitObserver = ensurePreviewGeneratingFitObserver;

let scenePanelMaxHeightFrame = 0;
let scenePanelMaxHeightTrace = "";
function scheduleScenePanelMaxHeight(traceLabel) {
    scenePanelMaxHeightTrace = traceLabel || scenePanelMaxHeightTrace || "scheduled";
    if (scenePanelMaxHeightFrame) return;
    scenePanelMaxHeightFrame = requestAnimationFrame(() => {
        scenePanelMaxHeightFrame = 0;
        syncScenePanelMaxHeight(scenePanelMaxHeightTrace);
        scenePanelMaxHeightTrace = "";
    });
}

function syncScenePanelMaxHeight(traceLabel) {
    const previewColumn = document.querySelector('#main_layout_row > .preview_column');
    const scenePanel = document.getElementById('scene_panel');
    if (!previewColumn || !scenePanel) return;
    const bottomFill = document.getElementById('scene_panel_bottom_fill');
    if (bottomFill) {
        bottomFill.style.setProperty("height", "0px", "important");
    }

    const previewHeight = previewColumn.getBoundingClientRect().height;
    let targetHeight = Math.ceil(previewHeight);
    if (targetHeight < 24) {
        const preview = document.getElementById("preview_generating");
        targetHeight = preview ? getPreviewGeneratingFitHeight(preview) : 320;
    }

    scenePanel.style.setProperty('--scene-panel-max-height', targetHeight + 'px');
    scenePanel.style.maxHeight = targetHeight + 'px';

    if (bottomFill) {
        const panelRect = scenePanel.getBoundingClientRect();
        const deficit = Math.max(0, Math.ceil(targetHeight - panelRect.height));
        bottomFill.style.setProperty("height", deficit + "px", "important");
    }
}

function syncSceneAndAdvancedColumns(traceLabel, isSceneFrontend) {
    const isScene = !!isSceneFrontend;
    try {
        document.documentElement.classList.toggle("simpai-scene-frontend", isScene);
        document.documentElement.classList.toggle("simpai-scene-parameter-normalized", isScene);
    } catch (e) {}
    setPanelVisibleById("scene_panel", isScene);
    if (isScene) {
        setPanelVisibleById("image_input_panel", false);
        try { document.documentElement.classList.remove("simpai-engine-class-visible"); } catch (e) {}
    }
    if (typeof window.syncTopbarMountedPanelVisibility === "function") {
        window.syncTopbarMountedPanelVisibility(traceLabel);
    }
    syncPerformanceSelectionVisibility(null, traceLabel);
    const sceneSettingTabKeyFromText = (value) => {
        const text = String(value || "").trim().toLowerCase();
        if (!text) return "";
        if (text === "general" || text.includes("常规")) return "general";
        if (text === "advanced" || text.includes("高级")) return "advanced";
        if (text === "control" || text.includes("控图")) return "control";
        if (text === "inpaint" || text.includes("重绘")) return "inpaint";
        return "";
    };
    const sceneSettingTabKeyFromElement = (element) => {
        if (!element) return "";
        const tabId = String(element.getAttribute("data-tab-id") || "").trim().toLowerCase();
        if (tabId === "general" || tabId === "advanced" || tabId === "control" || tabId === "inpaint") {
            return tabId;
        }
        return sceneSettingTabKeyFromText(element.textContent || element.getAttribute("aria-label") || element.getAttribute("data-testid"));
    };
    const setSceneSettingElementHidden = (element, hidden) => {
        if (!element) return;
        try {
            if (hidden) {
                const alreadyHidden = element.classList.contains("simpai-scene-setting-hidden")
                    && element.getAttribute("data-simpai-scene-hidden") === "1"
                    && element.style.getPropertyValue("display") === "none";
                if (alreadyHidden) return;
                element.classList.add("simpai-scene-setting-hidden");
                element.style.setProperty("display", "none", "important");
                element.setAttribute("aria-hidden", "true");
                element.setAttribute("data-simpai-scene-hidden", "1");
            } else {
                const alreadyVisible = !element.classList.contains("simpai-scene-setting-hidden")
                    && !element.hasAttribute("data-simpai-scene-hidden")
                    && !element.hasAttribute("aria-hidden")
                    && !element.style.getPropertyValue("display");
                if (alreadyVisible) return;
                element.classList.remove("simpai-scene-setting-hidden");
                element.style.removeProperty("display");
                element.removeAttribute("aria-hidden");
                element.removeAttribute("data-simpai-scene-hidden");
            }
        } catch (e) {}
    };
    const isSceneSettingTabButton = (element) => {
        return !!element && (element.getAttribute("role") === "tab" || element.hasAttribute("data-tab-id"));
    };
    const isSceneSettingModeActive = () => {
        try {
            return document.documentElement.classList.contains("simpai-scene-parameter-normalized");
        } catch (e) {
            return !!isScene;
        }
    };
    const restoreGeneralSettingTabsContainer = (generalSettingTabs) => {
        if (!generalSettingTabs) return;
        try {
            ["display", "visibility", "height", "max-height", "min-height", "margin", "padding", "overflow", "pointer-events"].forEach((name) => {
                removeSimpleAIStyleIfPresent(generalSettingTabs, name);
            });
            removeSimpleAIAttributeIfPresent(generalSettingTabs, "aria-hidden");
        } catch (e) {}
    };
    const disableQuickEnhanceForScene = () => {
        if (!isSceneSettingModeActive()) return;
        const root = getSimpleAIElementById("quick_enhance");
        if (!root || !root.querySelectorAll) return;
        for (const input of Array.from(root.querySelectorAll('input[type="checkbox"]'))) {
            if (input.checked) {
                setNativeInputValue(input, false, "checkbox");
            }
        }
    };
    const syncSceneSettingSubtabs = () => {
        let root = null;
        try {
            root = document.getElementById("advanced_column");
        } catch (e) {
            root = null;
        }
        if (!root || !root.querySelectorAll) return;
        const currentIsScene = isSceneSettingModeActive();

        const generalSettingTabs = root.querySelector("#general_setting_tabs");
        if (generalSettingTabs) {
            restoreGeneralSettingTabsContainer(generalSettingTabs);
            const tabCandidates = [
                ...Array.from(generalSettingTabs.querySelectorAll('button[role="tab"], [role="tab"]')),
                ...Array.from(generalSettingTabs.querySelectorAll('button, [aria-controls], [data-testid*="tab"]')),
            ];
            const seen = new Set();
            const tabs = [];
            for (const candidate of tabCandidates) {
                if (!candidate) continue;
                const element = candidate.closest ? (candidate.closest('[role="tab"]') || candidate.closest("button") || candidate) : candidate;
                const key = sceneSettingTabKeyFromElement(element) || sceneSettingTabKeyFromElement(candidate);
                if (!key) continue;
                if (!element || seen.has(element)) continue;
                seen.add(element);
                tabs.push({ element, key });
            }
            let preferredTab = null;
            let selectedAllowedTab = null;
            let hiddenTabWasSelected = false;
            for (const item of tabs) {
                const hiddenInScene = currentIsScene && (item.key === "control" || item.key === "inpaint");
                if (!hiddenInScene && !preferredTab && (item.key === "general" || item.key === "advanced") && isSceneSettingTabButton(item.element)) {
                    preferredTab = item.element;
                }
                try {
                    const selected = isSceneSettingTabButton(item.element) && (item.element.getAttribute("aria-selected") === "true"
                        || item.element.classList.contains("selected")
                        || item.element.classList.contains("svelte-tabs__selected"));
                    if (hiddenInScene && selected) {
                        hiddenTabWasSelected = true;
                    } else if (!hiddenInScene && selected && (item.key === "general" || item.key === "advanced")) {
                        selectedAllowedTab = item.element;
                    }
                } catch (e) {}
            }
            if (currentIsScene && (hiddenTabWasSelected || !selectedAllowedTab) && preferredTab && typeof preferredTab.click === "function") {
                try {
                    preferredTab.click();
                } catch (e) {}
            }
            for (const item of tabs) {
                const hiddenInScene = currentIsScene && (item.key === "control" || item.key === "inpaint");
                setSceneSettingElementHidden(item.element, hiddenInScene);
            }
            for (const panelId of ["setting_control_tab", "setting_inpaint_tab"]) {
                const panel = document.getElementById(panelId);
                setSceneSettingElementHidden(panel, currentIsScene);
            }
            if (currentIsScene && hiddenTabWasSelected && preferredTab && typeof preferredTab.click === "function") {
                try {
                    setTimeout(() => preferredTab.click(), 0);
                    setTimeout(() => syncSceneSettingSubtabs(), 80);
                } catch (e) {}
            }
        }
        disableQuickEnhanceForScene();
    };
    setTimeout(() => scheduleScenePanelMaxHeight(`${traceLabel}+0ms`), 0);
    setTimeout(() => scheduleScenePanelMaxHeight(`${traceLabel}+120ms`), 120);
    setTimeout(() => scheduleScenePanelMaxHeight(`${traceLabel}+500ms`), 500);
    window.simpleaiSyncSceneSettingSubtabs = syncSceneSettingSubtabs;
    setTimeout(syncSceneSettingSubtabs, 0);
    setTimeout(syncSceneSettingSubtabs, 120);
    setTimeout(syncSceneSettingSubtabs, 320);
    setTimeout(syncSceneSettingSubtabs, 760);
    try {
        if (!window.__simpleai_scene_setting_tabs_observer_bound) {
            window.__simpleai_scene_setting_tabs_observer_bound = true;
            const observer = new MutationObserver(() => {
                if (window.__simpleai_scene_setting_tabs_observer_pending) return;
                window.__simpleai_scene_setting_tabs_observer_pending = true;
                requestAnimationFrame(() => {
                    window.__simpleai_scene_setting_tabs_observer_pending = false;
                    try {
                        if (typeof window.simpleaiSyncSceneSettingSubtabs === "function") {
                            window.simpleaiSyncSceneSettingSubtabs();
                        }
                    } catch (e) {}
                });
            });
            const target = document.getElementById("advanced_column") || document.body;
            observer.observe(target, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ["class", "style", "aria-selected", "data-tab-id"],
            });
            observer.observe(document.documentElement, {
                attributes: true,
                attributeFilter: ["class"],
            });
            window.__simpleai_scene_setting_tabs_observer = observer;
        }
    } catch (e) {}
    if (typeof syncPositivePromptMetaState === "function") {
        setTimeout(syncPositivePromptMetaState, 0);
        setTimeout(syncPositivePromptMetaState, 150);
    }
    if (topbarLastSystemParams) {
        scheduleMainModelDropdownVisibilityReconcile(topbarLastSystemParams, `${traceLabel}.advanced_sync`);
    }
}

function scheduleSceneAndAdvancedSync(traceLabel, isSceneFrontend) {
    try { simpaiUiTrace("log", "[UI-TRACE] scheduleSceneAndAdvancedSync.called | trace=" + traceLabel + " isScene=" + !!isSceneFrontend); } catch(e) {}
    var nextIsScene = !!isSceneFrontend;
    var forceSync = /regen_(reset|preset_restore)/.test(String(traceLabel || ""));
    var liveParams = window.simpleaiTopbarSystemParams
        || (typeof topbarLastSystemParams !== "undefined" ? topbarLastSystemParams : null)
        || null;
    var nextPreset = liveParams && typeof liveParams === "object"
        ? normalizePresetName(liveParams.__preset)
        : "";
    var previousPreset = normalizePresetName(window.__simpleai_last_scene_sync_preset || "");
    var presetChanged = !!nextPreset && nextPreset !== previousPreset;
    if (!nextIsScene && typeof window.closeSam3FramesEditor === "function") {
        try { window.closeSam3FramesEditor(); } catch (e) {}
    }
    const scheduleMountedVisibilitySync = () => {
        try {
            if (typeof window.syncGradio6MountedDynamicVisibility === "function") {
                window.syncGradio6MountedDynamicVisibility(`${traceLabel}.scene_sync`);
            }
        } catch (e) {
            try { console.warn("[UI-TRACE] mounted_visibility_scene_sync_failed", e); } catch (_) {}
        }
    };
    var prevIsScene = window.__simpleai_last_scene_sync_is_scene;
    var stateChanged = prevIsScene !== nextIsScene;
    var now = Date.now();
    var last = window.__simpleai_last_scene_sync_schedule || 0;
    if (!window.__simpleai_ui_ready) {
        window.__simpleai_last_scene_sync_is_scene = nextIsScene;
        window.__simpleai_last_scene_sync_preset = nextPreset;
        syncSceneAndAdvancedColumns(`${traceLabel}+0ms`, nextIsScene);
        setTimeout(scheduleMountedVisibilitySync, 0);
        try { simpaiUiTrace("log", "[UI-TRACE] scheduleSceneAndAdvancedSync.skipped_retries | trace=" + traceLabel); } catch(e) {}
        return;
    }
    if (!stateChanged && !forceSync && !presetChanged && now - last < 2000) {
        try { simpaiUiTrace("log", "[UI-TRACE] scheduleSceneAndAdvancedSync.cooldown | since_last=" + (now - last) + "ms trace=" + traceLabel); } catch(e) {}
        return;
    }
    const syncGeneration = (Number(window.__simpleai_scene_sync_generation || 0) || 0) + 1;
    window.__simpleai_scene_sync_generation = syncGeneration;
    window.__simpleai_last_scene_sync_preset = nextPreset;
    const isCurrentSync = () => {
        if (window.__simpleai_scene_sync_generation !== syncGeneration) return false;
        const current = window.simpleaiTopbarSystemParams
            || (typeof topbarLastSystemParams !== "undefined" ? topbarLastSystemParams : null)
            || null;
        if (!current || typeof current !== "object") return true;
        const currentPreset = normalizePresetName(current.__preset);
        if (nextPreset && currentPreset && nextPreset !== currentPreset) return false;
        return !!(current.__is_scene_frontend || current.scene_frontend) === nextIsScene;
    };
    const syncIfCurrent = (label) => {
        if (!isCurrentSync()) return;
        syncSceneAndAdvancedColumns(label, nextIsScene);
    };
    window.__simpleai_last_scene_sync_is_scene = nextIsScene;
    window.__simpleai_last_scene_sync_schedule = now;
    syncIfCurrent(`${traceLabel}+immediate`);
    setTimeout(() => syncIfCurrent(`${traceLabel}+120ms`), 120);
    setTimeout(() => syncIfCurrent(`${traceLabel}+500ms`), 500);
    setTimeout(() => { if (isCurrentSync()) scheduleMountedVisibilitySync(); }, 0);
    setTimeout(() => { if (isCurrentSync()) scheduleMountedVisibilitySync(); }, 140);
    setTimeout(() => { if (isCurrentSync()) scheduleMountedVisibilitySync(); }, 520);
}


let sceneAudioPointerReleaseGuardBound = false;
const sceneAudioPointerReleaseState = {
    active: false,
    clientX: 0,
    clientY: 0,
    pointerId: 1,
    pointerType: "mouse",
};

function getSceneAudioElement() {
    const app = typeof gradioApp === "function" ? gradioApp() : document;
    return (app && app.getElementById ? app.getElementById("scene_audio") : null) || document.getElementById("scene_audio");
}

function isSceneAudioPointerTarget(target) {
    return !!(target && target.closest && target.closest("#scene_audio"));
}

function makeSceneAudioReleaseEvent(eventName, sourceEvent) {
    const init = {
        bubbles: true,
        cancelable: true,
        clientX: Number.isFinite(sourceEvent && sourceEvent.clientX) ? sourceEvent.clientX : sceneAudioPointerReleaseState.clientX,
        clientY: Number.isFinite(sourceEvent && sourceEvent.clientY) ? sourceEvent.clientY : sceneAudioPointerReleaseState.clientY,
        button: 0,
    };
    if (eventName.indexOf("pointer") === 0 && typeof PointerEvent === "function") {
        return new PointerEvent(eventName, {
            ...init,
            pointerId: sceneAudioPointerReleaseState.pointerId || 1,
            pointerType: sceneAudioPointerReleaseState.pointerType || "mouse",
            isPrimary: true,
        });
    }
    if (eventName.indexOf("touch") === 0 && typeof TouchEvent === "function") {
        return new TouchEvent(eventName, { bubbles: true, cancelable: true });
    }
    return new MouseEvent(eventName, init);
}

function dispatchSceneAudioRelease(eventName, sourceEvent) {
    const targets = [document, window, getSceneAudioElement()].filter(Boolean);
    for (const target of targets) {
        try {
            target.dispatchEvent(makeSceneAudioReleaseEvent(eventName, sourceEvent));
        } catch (e) {}
    }
}

function releaseSimpleAISceneAudioPointerState(reason, sourceEvent) {
    if (!sceneAudioPointerReleaseState.active && reason !== "force") return;
    sceneAudioPointerReleaseState.active = false;
    setTimeout(() => {
        dispatchSceneAudioRelease("pointerup", sourceEvent);
        dispatchSceneAudioRelease("mouseup", sourceEvent);
        dispatchSceneAudioRelease("touchend", sourceEvent);
    }, 0);
}

window.releaseSimpleAISceneAudioPointerState = releaseSimpleAISceneAudioPointerState;

function bindSceneAudioPointerReleaseGuard() {
    if (sceneAudioPointerReleaseGuardBound) return;
    sceneAudioPointerReleaseGuardBound = true;
    document.addEventListener("pointerdown", (event) => {
        if (!isSceneAudioPointerTarget(event.target)) return;
        sceneAudioPointerReleaseState.active = true;
        sceneAudioPointerReleaseState.clientX = Number.isFinite(event.clientX) ? event.clientX : 0;
        sceneAudioPointerReleaseState.clientY = Number.isFinite(event.clientY) ? event.clientY : 0;
        sceneAudioPointerReleaseState.pointerId = event.pointerId || 1;
        sceneAudioPointerReleaseState.pointerType = event.pointerType || "mouse";
        setTimeout(() => releaseSimpleAISceneAudioPointerState("timeout"), 15000);
    }, true);
    document.addEventListener("pointermove", (event) => {
        if (!sceneAudioPointerReleaseState.active) return;
        if (Number.isFinite(event.clientX)) sceneAudioPointerReleaseState.clientX = event.clientX;
        if (Number.isFinite(event.clientY)) sceneAudioPointerReleaseState.clientY = event.clientY;
    }, true);
    ["pointerup", "pointercancel", "mouseup", "touchend", "touchcancel"].forEach((eventName) => {
        window.addEventListener(eventName, (event) => releaseSimpleAISceneAudioPointerState(eventName, event), true);
        document.addEventListener(eventName, (event) => releaseSimpleAISceneAudioPointerState(eventName, event), true);
    });
    window.addEventListener("blur", (event) => releaseSimpleAISceneAudioPointerState("blur", event), true);
    document.addEventListener("visibilitychange", () => {
        if (document.hidden) releaseSimpleAISceneAudioPointerState("visibilitychange");
    }, true);
}


const cookieToken = getCookie("aitoken");
if (typeof window.__simpleai_ui_ready === "undefined") {
    window.__simpleai_ui_ready = false;
}
if (!cookieToken) {
    const localStorageToken = localStorage.getItem("aitoken");
    if (localStorageToken) {
    	setCookie('aitoken', `${localStorageToken}`, 90);
    	console.log("AiToken restored from localStorage to Cookie");
    }
    } else {
        console.log("AiToken exists in Cookie");
    }

document.addEventListener("DOMContentLoaded", function() {
    const isKnownGradioRaceError = (message, stackText) => {
        const msg = String(message || "");
        const st = String(stackText || "");
        return (
            msg.includes("Cannot read properties of null (reading 'style')")
            && (st.includes("Index-CClIgVld.js") || st.includes("Index.svelte:46"))
        );
    };

    window.addEventListener("error", function (e) {
        try {
            const msg = e && e.message ? e.message : "";
            const st = e && e.error && e.error.stack ? String(e.error.stack) : "";
            if (isKnownGradioRaceError(msg, st)) {
                if (e.preventDefault) e.preventDefault();
                if (e.stopImmediatePropagation) e.stopImmediatePropagation();
                return;
            }
        } catch (_) {}
    }, true);

    window.addEventListener("error", function (e) {
        try {
            simpaiUiTrace("log", "[UI-TRACE] window.error", {
                message: e && e.message ? e.message : null,
                filename: e && e.filename ? e.filename : null,
                lineno: e && typeof e.lineno === "number" ? e.lineno : null,
                colno: e && typeof e.colno === "number" ? e.colno : null,
                stack: e && e.error && e.error.stack ? String(e.error.stack) : null,
                last_ui_action: topbarLastUiAction,
                recent_ui_actions: topbarUiActionTrace.slice(-12),
            });
        } catch (_) {}
    });

    window.addEventListener("unhandledrejection", function (e) {
        try {
            const reason = e && e.reason ? String(e.reason) : null;
            const stack = e && e.reason && e.reason.stack ? String(e.reason.stack) : "";
            const knownImageEditorRace =
                (reason && reason.includes("Cannot read properties of undefined (reading '0')"))
                && stack.includes("ImageEditor.svelte");
            if (knownImageEditorRace) {
                if (e.preventDefault) e.preventDefault();
                return;
            }
            simpaiUiTrace("log", "[UI-TRACE] window.unhandledrejection", {
                reason: reason,
                last_ui_action: topbarLastUiAction,
                recent_ui_actions: topbarUiActionTrace.slice(-12),
            });
        } catch (_) {}
    });
    // Keep this flag for diagnostics only; no click is blocked by this script now.
    setTimeout(() => {
        window.__simpleai_ui_ready = true;
    }, 2500);

    const tryBindImageTtsPanelSync = () => {
        const app = gradioApp();
        if (!app || !app.addEventListener) {
            setTimeout(tryBindImageTtsPanelSync, 200);
            return;
        }
        if (app.dataset.simpleaiImageTtsPanelSyncBound === "1") return;
        app.dataset.simpleaiImageTtsPanelSyncBound = "1";

        const isTrackedToggleTarget = (target) => {
            if (!target || !target.closest) return false;
            return !!target.closest('#input_image_checkbox, #qwen_tts_checkbox');
        };

        const getTrackedToggleSource = (target) => {
            if (!target || !target.closest) return null;
            const wrapper = target.closest('#input_image_checkbox, #qwen_tts_checkbox');
            return wrapper ? (wrapper.id || null) : null;
        };

        app.addEventListener("change", (e) => {
            const t = e && e.target ? e.target : null;
            if (!isTrackedToggleTarget(t)) return;
            const source = getTrackedToggleSource(t);
            setTimeout(() => syncImageAndTtsPanelsFromCheckboxes("change+0ms", source), 0);
            setTimeout(() => syncImageAndTtsPanelsFromCheckboxes("change+120ms", source), 120);
        }, true);

        app.addEventListener("click", (e) => {
            const t = e && e.target ? e.target : null;
            if (!isTrackedToggleTarget(t)) return;
            const source = getTrackedToggleSource(t);
            setTimeout(() => syncImageAndTtsPanelsFromCheckboxes("click+80ms", source), 80);
            setTimeout(() => syncImageAndTtsPanelsFromCheckboxes("click+180ms", source), 180);
        }, false);

        setTimeout(() => syncImageAndTtsPanelsFromCheckboxes("bind+120ms"), 120);
        setTimeout(() => syncImageAndTtsPanelsFromCheckboxes("bind+500ms"), 500);
        setTimeout(() => syncScenePanelMaxHeight("bind+120ms"), 120);
        setTimeout(() => syncScenePanelMaxHeight("bind+500ms"), 500);
    };
    tryBindImageTtsPanelSync();

    const tryBindTopbarLayoutSync = () => {
        const topbar_row = gradioApp().getElementById("topbar_row");
        if (!topbar_row) {
            setTimeout(tryBindTopbarLayoutSync, 200);
            return;
        }
        const ro = new ResizeObserver(() => syncPresetStorePosition());
        ro.observe(topbar_row);
        window.addEventListener("resize", syncPresetStorePosition);
        window.addEventListener("resize", schedulePresetStoreViewportRefresh);
        if (window.visualViewport && window.visualViewport.addEventListener) {
            window.visualViewport.addEventListener("resize", schedulePresetStoreViewportRefresh);
            window.visualViewport.addEventListener("scroll", schedulePresetStoreViewportRefresh);
        }
        window.addEventListener("resize", () => syncScenePanelMaxHeight("window.resize"));
        syncPresetStorePosition();
    };
    tryBindTopbarLayoutSync();

    const tryBindScenePanelHeightSync = () => {
        const previewColumn = document.querySelector('#main_layout_row > .preview_column');
        const scenePanel = document.getElementById('scene_panel');
        if (!previewColumn || !scenePanel) {
            setTimeout(tryBindScenePanelHeightSync, 300);
            return;
        }

        const observer = new MutationObserver((mutations) => {
            let shouldSync = false;
            for (const mutation of mutations) {
                if (mutation.type === 'attributes' && (mutation.attributeName === 'style' || mutation.attributeName === 'class')) {
                    shouldSync = true;
                    break;
                }
                if (mutation.type === 'childList') {
                    shouldSync = true;
                    break;
                }
            }
            if (shouldSync) {
                scheduleScenePanelMaxHeight("mutationObserver");
            }
        });

        observer.observe(previewColumn, {
            attributes: true,
            attributeFilter: ['style', 'class'],
            childList: true,
            subtree: true
        });

        const app = gradioApp();
        if (app && app.addEventListener) {
            app.addEventListener("click", (e) => {
                const target = e && e.target ? e.target : null;
                if (!target || !target.closest) return;
                const toggleTarget = target.closest('.preview_column [id^="finished_images_catalog"], .preview_column .toolbox, .preview_column .toolbox_note, .preview_column .infobox_group, .preview_column #missing_model_welcome_hint');
                if (toggleTarget) {
                    setTimeout(() => syncScenePanelMaxHeight("click+80ms"), 80);
                    setTimeout(() => syncScenePanelMaxHeight("click+300ms"), 300);
                }
            }, false);
        }

        window._scenePanelHeightObserver = observer;
    };
    tryBindScenePanelHeightSync();

    const tryBindPresetStoreObserver = () => {
        const preset_store = getPresetStoreElement();
        if (!preset_store) {
            setTimeout(tryBindPresetStoreObserver, 200);
            return;
        }
        presetStoreObservedEl = preset_store;
        schedulePresetStoreUpdate();
    };
    tryBindPresetStoreObserver();

    const tryBindTopbarOptimistic = () => {
        if (topbarOptimisticInstalled) return;
        const app = gradioApp();
        if (!app || !app.addEventListener) {
            setTimeout(tryBindTopbarOptimistic, 200);
            return;
        }
        topbarOptimisticInstalled = true;
        const cachedStorePointerHandler = (e) => {
            if (e.button !== undefined && e.button !== 0) return;
            applyCachedPresetStoreToggle(e.target);
        };
        const cachedStoreKeyboardHandler = (e) => {
            if (e.repeat || (e.key !== "Enter" && e.key !== " ")) return;
            applyCachedPresetStoreToggle(e.target);
        };
        const optimisticHandler = (e) => {
            const target = e && e.target ? e.target : null;
            if (!target || !target.closest) return;
            const barButton = target.closest('[id^="bar"]');
            if (!barButton) return;
            const id = barButton.id || "";
            if (!/^bar\d+$/.test(id)) return;
            const now = Date.now();
            if (topbarLastOptimisticBar === id && (now - topbarLastOptimisticTs) < 150) {
                return;
            }
            topbarLastOptimisticBar = id;
            topbarLastOptimisticTs = now;
            applyOptimisticBarHighlight(barButton);
        };
        app.addEventListener("pointerdown", cachedStorePointerHandler, true);
        app.addEventListener("keydown", cachedStoreKeyboardHandler, true);
        // Single-channel binding only; avoid duplicate optimistic applies.
        app.addEventListener("click", optimisticHandler, false);
    };
    tryBindTopbarOptimistic();
    bindScenePresetDefaultUserEditGuard();
    bindScenePresetResetButtonHandler();

    const sysmsg = document.createElement('div');
    sysmsg.id = "sys_msg";
    sysmsg.className = 'systemMsg gradio-container';
    sysmsg.style.display = "none";
    sysmsg.tabIndex = 0;

    const sysmsgBox = document.createElement('div');
    sysmsgBox.id = "sys_msg_box";
    sysmsgBox.className = 'systemMsgBox gradio-container';
    sysmsgBox.style.setProperty("overflow-x", "auto");
    sysmsgBox.style.setProperty("border", "1px");
    sysmsgBox.style.setProperty("scrollbar-width", "thin");
    sysmsg.appendChild(sysmsgBox);

    const sysmsgText = document.createElement('pre');
    sysmsgText.id = "sys_msg_text";
    sysmsgText.style.setProperty("margin", "5px 12px 12px 0px");
    sysmsgText.innerHTML = '<b id="update_f">[Fooocus最新更新]</b>:' + '<b id="update_s">[SimpleSDXL最新更新]</b>';
    sysmsgBox.appendChild(sysmsgText);

    const sysmsgClose = document.createElement('div');
    sysmsgClose.className = 'systemMsgClose gradio-container';
    sysmsgClose.onclick = closeSysMsg;
    sysmsg.append(sysmsgClose);

    const sysmsgCloseText = document.createElement('span');
    sysmsgCloseText.innerHTML = 'x';
    sysmsgCloseText.style.setProperty("cursor", "pointer");
    sysmsgCloseText.onclick = closeSysMsg;
    sysmsgClose.appendChild(sysmsgCloseText);

    const sysmsgHeadTarget = document.createElement('base');
    sysmsgHeadTarget.target = "_blank"
    document.getElementsByTagName("head")[0].appendChild(sysmsgHeadTarget);

    const canvas = document.createElement('canvas');
    canvas.width = 343;
    canvas.height = 343;
    canvas.id = "qrcode";
    canvas.style.display = "none";
  
    try {
        gradioApp().appendChild(sysmsg);
    } catch (e) {
        gradioApp().body.appendChild(sysmsg);
    }
    try {
        gradioApp().appendChild(canvas);
    } catch (e) {
        gradioApp().body.appendChild(canvas);
    }

    document.body.appendChild(sysmsg);
    document.body.appendChild(canvas);
    initPresetPreviewOverlay();
    bindSimpleAIPresetSwitchGalleryClearControls();
    bindSimpleAIGalleryFrostControls();
    bindFinishedGalleryBrowserControls();
    bindSceneAudioPointerReleaseGuard();
    ensurePreviewGeneratingFitObserver();
    bindMainLayoutResponsiveStack();
    setTimeout(bindFinishedGalleryBrowserControls, 300);
    setTimeout(bindFinishedGalleryBrowserControls, 1200);
    setTimeout(ensurePreviewGeneratingFitObserver, 300);
    setTimeout(ensurePreviewGeneratingFitObserver, 1200);
    setTimeout(() => restoreWelcomePreviewIfResultSurfaceIdle("dom_ready+800ms"), 800);
    setTimeout(() => restoreWelcomePreviewIfResultSurfaceIdle("dom_ready+2500ms"), 2500);
    setTimeout(bindMainLayoutResponsiveStack, 300);
    setTimeout(bindMainLayoutResponsiveStack, 1200);
    bindPluginBtn();
    setTimeout(bindPluginBtn, 200);
    setTimeout(bindPluginBtn, 800);
    
});

if (typeof onAfterUiUpdate === "function") {
    onAfterUiUpdate(() => {
        bindSimpleAIPresetSwitchGalleryClearControls();
        bindFinishedGalleryBrowserControls();
        bindSceneAudioPointerReleaseGuard();
        ensurePreviewGeneratingFitObserver();
        try { syncGenerationResultGallerySurface("after_ui_update"); } catch (e) {}
        try { setTimeout(() => restoreWelcomePreviewIfResultSurfaceIdle("after_ui_update"), 0); } catch (e) {}
        schedulePreviewGeneratingImageFit(0);
        bindMainLayoutResponsiveStack();
        scheduleMainLayoutResponsiveStack(0);
    });
}

