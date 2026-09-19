(function initSimpleAIAdvancedColumnDrawer() {
    "use strict";

    if (window.__simpaiAdvancedColumnDrawerStarted) return;
    window.__simpaiAdvancedColumnDrawerStarted = true;

    const STORAGE_KEY = "simpai.advancedColumnDrawer.v1";
    const DESKTOP_MEDIA_QUERY = "(min-width: 961px)";
    const MIN_WIDTH = 300;
    const MAX_WIDTH = 560;
    const COLLAPSE_THRESHOLD = 276;
    const state = {
        workspace: null,
        column: null,
        resizer: null,
        toggle: null,
        resizeObserver: null,
        mutationObserver: null,
        mediaQuery: null,
        width: 0,
        collapsed: false,
        initialized: false,
        dragging: false,
        pointerId: null,
        startX: 0,
        startWidth: 0,
        dragBounds: null,
        dragLeft: 0,
        pendingWidth: null,
        resizeFrame: null,
        tabsResizeTimer: null,
        observedColumnWidth: null,
    };

    function readStoredState() {
        try {
            const raw = window.localStorage.getItem(STORAGE_KEY);
            const parsed = raw ? JSON.parse(raw) : {};
            return {
                width: Number.isFinite(Number(parsed?.width)) ? Number(parsed.width) : 0,
                collapsed: parsed?.collapsed === true,
            };
        } catch (e) {
            return { width: 0, collapsed: false };
        }
    }

    function persistState() {
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
                width: Math.round(state.width || 0),
                collapsed: !!state.collapsed,
            }));
        } catch (e) {}
    }

    function drawerText(english, chinese) {
        const source = window.simpleaiTopbarSystemParams || {};
        try {
            if (window.SimpAII18n?.t) return window.SimpAII18n.t(english, chinese, source);
        } catch (e) {}
        try {
            if (typeof topbarTranslateText === "function") return topbarTranslateText(english);
        } catch (e) {}
        const raw = String(source.__lang || window.locale_lang || document.documentElement.lang || "").toLowerCase();
        return raw.startsWith("en") ? english : chinese;
    }

    function getElementById(id) {
        const direct = document.getElementById(id);
        if (direct) return direct;
        try {
            const app = typeof gradioApp === "function" ? gradioApp() : null;
            return app?.getElementById?.(id) || null;
        } catch (e) {
            return null;
        }
    }

    function findWorkspace(mainLayout, advancedColumn) {
        if (!mainLayout || !advancedColumn) return null;
        let fallback = null;
        let node = advancedColumn.parentElement;
        while (node && node !== document.body && node !== document.documentElement) {
            if (node.contains(mainLayout) && node.contains(advancedColumn)) {
                if (!fallback) fallback = node;
                const children = Array.from(node.children || []);
                const mainChild = children.find((child) => child === mainLayout || child.contains(mainLayout));
                const advancedChild = children.find((child) => child === advancedColumn || child.contains(advancedColumn));
                if (mainChild && advancedChild && mainChild !== advancedChild) return node;
            }
            node = node.parentElement;
        }
        return fallback;
    }

    function isDesktop() {
        try {
            return window.matchMedia(DESKTOP_MEDIA_QUERY).matches;
        } catch (e) {
            return Number(window.innerWidth || 0) >= 961;
        }
    }

    function cssNumber(name, fallback) {
        try {
            const value = parseFloat(window.getComputedStyle(document.documentElement).getPropertyValue(name) || "");
            return Number.isFinite(value) ? value : fallback;
        } catch (e) {
            return fallback;
        }
    }

    function isHiddenByOwner(node) {
        if (!node) return true;
        if (node.hidden || node.hasAttribute("hidden")) return true;
        if (node.getAttribute("aria-hidden") === "true") return true;
        if (node.classList?.contains("hidden") || node.classList?.contains("hide") || node.classList?.contains("simpai-force-hidden")) return true;
        try {
            return window.getComputedStyle(node).display === "none";
        } catch (e) {
            return false;
        }
    }

    function panelVisibilityControlledByCheckbox() {
        if (!state.column) return false;
        let node = state.column;
        while (node && node !== document.documentElement) {
            if (isHiddenByOwner(node)) return false;
            node = node.parentElement;
        }
        return true;
    }

    function getDrawerBounds() {
        const minWidth = cssNumber("--simpai-advanced-drawer-min-width", MIN_WIDTH);
        const maxWidth = cssNumber("--simpai-advanced-drawer-max-width", MAX_WIDTH);
        let workspaceWidth = 0;
        let gap = 16;
        try {
            const rect = state.workspace?.getBoundingClientRect?.();
            workspaceWidth = Number(rect?.width || 0);
            const style = state.workspace ? window.getComputedStyle(state.workspace) : null;
            const parsedGap = parseFloat(style?.columnGap || style?.gap || "");
            if (Number.isFinite(parsedGap)) gap = parsedGap;
        } catch (e) {}

        const availableMax = workspaceWidth > 0 ? Math.floor(workspaceWidth - 560 - gap) : maxWidth;
        return {
            min: minWidth,
            max: Math.max(minWidth, Math.min(maxWidth, availableMax)),
        };
    }

    function currentColumnWidth() {
        if (!state.column) return state.width || 400;
        try {
            const rectWidth = Number(state.column.getBoundingClientRect?.().width || 0);
            if (rectWidth > 0) return rectWidth;
            const cssWidth = parseFloat(window.getComputedStyle(state.column).width || "");
            if (Number.isFinite(cssWidth) && cssWidth > 0) return cssWidth;
        } catch (e) {}
        return state.width || 400;
    }

    function clampWidth(value) {
        const bounds = state.dragBounds || getDrawerBounds();
        const numeric = Number(value);
        const fallback = state.width || currentColumnWidth() || 400;
        return Math.round(Math.min(bounds.max, Math.max(bounds.min, Number.isFinite(numeric) ? numeric : fallback)));
    }

    function updateResizerValue() {
        if (!state.resizer) return;
        const bounds = state.dragBounds || getDrawerBounds();
        state.resizer.setAttribute("aria-valuemin", String(bounds.min));
        state.resizer.setAttribute("aria-valuemax", String(bounds.max));
        state.resizer.setAttribute("aria-valuenow", String(Math.round(state.width || clampWidth(currentColumnWidth()))));
    }

    function setWidth(value) {
        if (!state.workspace) return;
        state.width = clampWidth(value);
        state.workspace.style.setProperty("--simpai-advanced-drawer-width", `${state.width}px`);
        updateResizerValue();
        if (state.dragging) {
            const left = Math.max(0, Math.round(state.dragLeft + state.startWidth - state.width));
            state.resizer.style.setProperty("left", `${left}px`, "important");
        } else {
            syncGeometry();
        }
    }

    function syncGeometry() {
        if (!state.resizer || !state.workspace || !state.column || !isDesktop() || state.collapsed) return;
        try {
            const workspaceRect = state.workspace.getBoundingClientRect();
            const columnRect = state.column.getBoundingClientRect();
            if (!(workspaceRect.width > 0 && columnRect.width > 0)) return;
            const left = Math.max(0, Math.round(columnRect.left - workspaceRect.left - 8));
            state.resizer.style.setProperty("left", `${left}px`, "important");
        } catch (e) {}
    }

    function updateLabels() {
        if (state.resizer) {
            const label = drawerText("Resize advanced settings panel", "调整高级设置面板宽度");
            state.resizer.setAttribute("aria-label", label);
            state.resizer.setAttribute("title", label);
        }
        if (state.toggle) {
            const label = drawerText("Show advanced settings", "显示高级设置");
            state.toggle.setAttribute("aria-label", label);
            state.toggle.setAttribute("title", label);
        }
    }

    function syncControls() {
        if (!state.workspace || !state.column || !state.resizer || !state.toggle) return;
        const desktop = isDesktop();
        const panelVisible = panelVisibilityControlledByCheckbox();
        state.resizer.hidden = !desktop || !panelVisible || state.collapsed;
        state.toggle.hidden = !desktop || !panelVisible || !state.collapsed;
        updateLabels();
        syncGeometry();
    }

    function callLayoutSync() {
        try {
            window.syncMainLayoutResponsiveStack?.();
        } catch (e) {}
    }

    function scheduleTabsResize() {
        window.clearTimeout(state.tabsResizeTimer);
        // Gradio 6 Tabs listens to window resize, not its parent's ResizeObserver.
        // Wait for the drawer animation/drag to settle before notifying all tabs.
        state.tabsResizeTimer = window.setTimeout(() => {
            state.tabsResizeTimer = null;
            if (state.dragging || (isDesktop() && state.collapsed) || !panelVisibilityControlledByCheckbox()) return;
            window.dispatchEvent(new Event("resize"));
        }, 80);
    }

    function setCollapsed(collapsed, persist = true) {
        if (!state.workspace) return;
        state.collapsed = !!collapsed;
        state.workspace.classList.toggle("simpai-advanced-drawer-collapsed", state.collapsed);
        if (!state.collapsed) setWidth(state.width || currentColumnWidth());
        syncControls();
        if (persist) persistState();
        window.setTimeout(callLayoutSync, 0);
    }

    function startResize(event) {
        if (!isDesktop() || state.collapsed || !panelVisibilityControlledByCheckbox() || event.button !== 0) return;
        if (state.dragging) return;
        state.dragBounds = getDrawerBounds();
        state.pointerId = event.pointerId;
        state.startX = Number(event.clientX || 0);
        state.startWidth = currentColumnWidth();
        state.dragLeft = state.column.getBoundingClientRect().left - state.workspace.getBoundingClientRect().left - 8;
        state.dragging = true;
        document.body.classList.add("simpai-advanced-drawer-resizing");
        try { state.resizer.setPointerCapture?.(event.pointerId); } catch (e) {}
        event.preventDefault();
    }

    function applyPendingResize() {
        state.resizeFrame = null;
        if (state.pendingWidth === null) return;
        const nextWidth = state.pendingWidth;
        state.pendingWidth = null;
        if (nextWidth <= COLLAPSE_THRESHOLD) {
            finishResize();
            setCollapsed(true, true);
            return;
        }
        setWidth(nextWidth);
    }

    function moveResize(event) {
        if (!state.dragging || (state.pointerId !== null && event.pointerId !== state.pointerId)) return;
        const deltaX = Number(event.clientX || 0) - state.startX;
        state.pendingWidth = state.startWidth - deltaX;
        if (state.resizeFrame === null) {
            state.resizeFrame = window.requestAnimationFrame(applyPendingResize);
        }
        event.preventDefault();
    }

    function finishResize(event) {
        if (!state.dragging) return;
        if (event?.pointerId !== undefined && event.pointerId !== state.pointerId) return;
        if (state.resizeFrame !== null) {
            window.cancelAnimationFrame(state.resizeFrame);
            state.resizeFrame = null;
        }
        // Commit the last movement before restoring transitions, even on a quick release.
        applyPendingResize();
        if (!state.dragging) return;
        state.dragging = false;
        try {
            if (state.resizer?.hasPointerCapture?.(state.pointerId)) {
                state.resizer.releasePointerCapture(state.pointerId);
            }
        } catch (e) {}
        state.pointerId = null;
        state.dragBounds = null;
        syncGeometry();
        document.body.classList.remove("simpai-advanced-drawer-resizing");
        persistState();
        syncControls();
        scheduleTabsResize();
    }

    function handleResizeKey(event) {
        if (!isDesktop() || state.collapsed) return;
        const key = String(event.key || "");
        if (key === "Home") {
            event.preventDefault();
            setCollapsed(true, true);
            return;
        }
        if (key === "End") {
            event.preventDefault();
            setWidth(getDrawerBounds().max);
            persistState();
            return;
        }
        if (key !== "ArrowLeft" && key !== "ArrowRight") return;
        event.preventDefault();
        const delta = key === "ArrowRight" ? -24 : 24;
        const nextWidth = state.width - delta;
        if (nextWidth <= COLLAPSE_THRESHOLD) setCollapsed(true, true);
        else {
            setWidth(nextWidth);
            persistState();
        }
    }

    function createControls() {
        if (!state.resizer) {
            const resizer = document.createElement("div");
            resizer.className = "simpai-advanced-drawer-resizer";
            resizer.setAttribute("role", "separator");
            resizer.setAttribute("aria-orientation", "vertical");
            resizer.tabIndex = 0;
            resizer.addEventListener("pointerdown", startResize);
            resizer.addEventListener("pointermove", moveResize);
            resizer.addEventListener("pointerup", finishResize);
            resizer.addEventListener("pointercancel", finishResize);
            resizer.addEventListener("lostpointercapture", finishResize);
            resizer.addEventListener("keydown", handleResizeKey);
            state.resizer = resizer;
        }
        if (!state.toggle) {
            const toggle = document.createElement("button");
            toggle.type = "button";
            toggle.id = "simpai_advanced_drawer_toggle";
            toggle.className = "simpai-advanced-drawer-toggle";
            toggle.hidden = true;
            toggle.innerHTML = '<i class="fa-solid fa-sliders" aria-hidden="true"></i>';
            toggle.addEventListener("click", () => setCollapsed(false, true));
            document.body.appendChild(toggle);
            state.toggle = toggle;
        }
        updateLabels();
    }

    function disconnectObservers() {
        window.clearTimeout(state.tabsResizeTimer);
        state.tabsResizeTimer = null;
        state.observedColumnWidth = null;
        try { state.resizeObserver?.disconnect(); } catch (e) {}
        try { state.mutationObserver?.disconnect(); } catch (e) {}
        state.resizeObserver = null;
        state.mutationObserver = null;
    }

    function bindObservers() {
        disconnectObservers();
        if (typeof ResizeObserver === "function") {
            state.resizeObserver = new ResizeObserver((entries) => {
                const columnEntry = entries.find((entry) => entry.target === state.column);
                if (columnEntry && columnEntry.contentRect.width !== state.observedColumnWidth) {
                    state.observedColumnWidth = columnEntry.contentRect.width;
                    scheduleTabsResize();
                }
                if (!state.dragging) syncControls();
            });
            try {
                state.resizeObserver.observe(state.workspace);
                state.resizeObserver.observe(state.column);
            } catch (e) {}
        }
        if (typeof MutationObserver === "function") {
            state.mutationObserver = new MutationObserver(() => syncControls());
            try {
                state.mutationObserver.observe(state.column, {
                    attributes: true,
                    attributeFilter: ["aria-hidden", "class", "hidden", "style"],
                });
            } catch (e) {}
        }
    }

    function bind() {
        const mainLayout = getElementById("main_layout_row");
        const advancedColumn = getElementById("advanced_column");
        const workspace = findWorkspace(mainLayout, advancedColumn);
        if (!workspace || !advancedColumn) {
            window.setTimeout(bind, 300);
            return;
        }

        if (state.workspace !== workspace || state.column !== advancedColumn) {
            if (state.workspace) state.workspace.classList.remove("simpai-advanced-drawer-workspace", "simpai-advanced-drawer-collapsed");
            disconnectObservers();
            state.workspace = workspace;
            state.column = advancedColumn;
            state.workspace.classList.add("simpai-advanced-drawer-workspace");
            createControls();
            state.workspace.appendChild(state.resizer);
            if (!state.initialized) {
                const stored = readStoredState();
                state.width = stored.width;
                state.collapsed = stored.collapsed;
                state.initialized = true;
            }
            if (!state.width) state.width = currentColumnWidth();
            if (state.collapsed) state.workspace.classList.add("simpai-advanced-drawer-collapsed");
            else setWidth(state.width);
            bindObservers();
        }

        syncControls();
    }

    function handleViewportChange() {
        syncControls();
        if (!state.dragging) window.setTimeout(syncControls, 80);
    }

    state.mediaQuery = window.matchMedia?.(DESKTOP_MEDIA_QUERY) || null;
    try {
        state.mediaQuery?.addEventListener?.("change", handleViewportChange);
    } catch (e) {}
    window.addEventListener("resize", handleViewportChange, { passive: true });

    window.SimpAIAdvancedColumnDrawer = {
        bind,
        open: () => setCollapsed(false, true),
        collapse: () => setCollapsed(true, true),
    };

    if (typeof onUiLoaded === "function") onUiLoaded(bind);
    if (typeof onAfterUiUpdate === "function") onAfterUiUpdate(bind);
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind, { once: true });
    else window.setTimeout(bind, 0);
})();
