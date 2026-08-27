(function () {
    const STYLE_ID = "simpai-custom-sketch-style";
    const SOURCE_CLASS = "simpai-custom-sketch-source";
    const DEFAULT_BRUSH_SIZE = 64;
    const MAX_BRUSH_SIZE = 512;
    const DOCK_OPEN_DELAY_MS = 35;
    const DOCK_HIDE_DELAY_MS = 260;
    const INPUT_FALLBACK_SYNC_MS = 2000;
    const SKETCH_HISTORY_LIMIT = 20;
    const SKETCH_HISTORY_MEMORY_BUDGET = 64 * 1024 * 1024;
    const IMAGE_FILE_EXTENSION_RE = /\.(?:png|jpe?g|gif|webp|bmp|avif|tiff?|ico)$/i;
    const SKETCH_CACHE_ENDPOINT = "/simpai/sketch-cache";
    const SKETCH_CACHE_RESOLVE_ENDPOINT = "/simpai/sketch-cache/resolve";
    let activeSketchApi = null;
    let fallbackSyncTimer = 0;
    let rootObserver = null;

    function ensureSimpAISketchNamespace() {
        window.SimpAISketch = window.SimpAISketch || {};
        return window.SimpAISketch;
    }

    function setActiveSketch(api) {
        const namespace = ensureSimpAISketchNamespace();
        if (activeSketchApi && !activeSketchApi.editor?.isConnected) {
            activeSketchApi = null;
            namespace.active = null;
        }
        const next = api || null;
        if (activeSketchApi === next) {
            namespace.active = activeSketchApi;
            return activeSketchApi;
        }
        const previous = activeSketchApi;
        activeSketchApi = null;
        namespace.active = null;
        if (previous) {
            previous.releaseTransientState?.();
        }
        activeSketchApi = next;
        namespace.active = activeSketchApi;
        return activeSketchApi;
    }

    function clearActiveSketch(api) {
        const namespace = ensureSimpAISketchNamespace();
        if (api && activeSketchApi !== api) return null;
        activeSketchApi = null;
        namespace.active = null;
        return null;
    }

    function isActiveSketch(api) {
        if (activeSketchApi && !activeSketchApi.editor?.isConnected) {
            clearActiveSketch(activeSketchApi);
        }
        return activeSketchApi === api;
    }

    function releaseHiddenSketches() {
        const namespace = ensureSimpAISketchNamespace();
        for (const sketch of Array.from(namespace.instances || [])) {
            if (!sketch?.root?.isConnected || !sketch?.editor?.isConnected) {
                sketch.destroy?.();
                continue;
            }
            if (sketch.isVisible?.() !== false) continue;
            sketch.releaseTransientState?.();
            if (namespace.active === sketch) clearActiveSketch(sketch);
        }
    }

    function releaseAllSketchTransientState() {
        const namespace = ensureSimpAISketchNamespace();
        for (const sketch of Array.from(namespace.instances || [])) {
            if (!sketch?.root?.isConnected || !sketch?.editor?.isConnected) {
                sketch.destroy?.();
                continue;
            }
            sketch.releaseTransientState?.();
        }
        clearActiveSketch(null);
    }

    function releaseDetachedSketches() {
        const namespace = ensureSimpAISketchNamespace();
        const reconnectRoots = [];
        for (const sketch of Array.from(namespace.instances || [])) {
            const rootConnected = sketch?.root?.isConnected === true;
            const editorConnected = sketch?.editor?.isConnected === true;
            if (rootConnected && editorConnected) continue;
            sketch.destroy?.();
            if (rootConnected) reconnectRoots.push(sketch.root);
        }
        reconnectRoots.forEach(initRoot);
    }

    function syncVisibleSketchInputs() {
        if (document.hidden) return;
        const namespace = ensureSimpAISketchNamespace();
        for (const sketch of Array.from(namespace.instances || [])) {
            if (!sketch?.root?.isConnected || !sketch?.editor?.isConnected) {
                sketch.destroy?.();
                continue;
            }
            if (sketch.isVisible?.() === false) {
                sketch.releaseTransientState?.();
                if (namespace.active === sketch) clearActiveSketch(sketch);
                continue;
            }
            sketch.syncExternalInput?.();
        }
    }

    function scheduleFallbackSync(delay = INPUT_FALLBACK_SYNC_MS) {
        if (document.hidden || fallbackSyncTimer) return;
        fallbackSyncTimer = window.setTimeout(() => {
            fallbackSyncTimer = 0;
            syncVisibleSketchInputs();
            scheduleFallbackSync();
        }, delay);
    }

    function stopFallbackSync() {
        if (!fallbackSyncTimer) return;
        window.clearTimeout(fallbackSyncTimer);
        fallbackSyncTimer = 0;
    }

    function ensureStyle() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
            .${SOURCE_CLASS} textarea,
            .${SOURCE_CLASS} input[type="text"] {
                display: none !important;
            }
            .simpai-sketch {
                position: relative;
                width: calc(100% + 24px);
                min-height: 220px;
                border: 1px solid var(--border-color-primary, #d9d9e3);
                border-radius: 8px;
                background: var(--block-background-fill, #fff);
                overflow: hidden;
                margin-left: -12px;
            }
            .simpai-sketch__bar {
                position: absolute;
                inset: 0;
                z-index: 8;
                pointer-events: none;
            }
            .simpai-sketch__group {
                display: inline-flex;
                align-items: center;
                gap: 2px;
                min-height: 26px;
                padding: 2px;
                border: 1px solid var(--border-color-primary, #d9d9e3);
                border-radius: 6px;
                background: var(--block-background-fill, #fff);
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
                pointer-events: auto;
            }
            .simpai-sketch__dock {
                position: absolute;
                pointer-events: auto;
            }
            .simpai-sketch__panel {
                position: absolute;
                display: flex;
                gap: 4px;
                opacity: 0;
                pointer-events: none;
                transform: translateY(-4px) scale(0.96);
                transition: opacity 140ms ease, transform 140ms ease;
            }
            .simpai-sketch__handle {
                position: absolute;
                display: flex;
                align-items: center;
                justify-content: center;
                width: 18px;
                height: 34px;
                border: 1px solid var(--border-color-primary, #d9d9e3);
                border-radius: 5px;
                background: var(--block-background-fill, #fff);
                color: var(--body-text-color-subdued, #6b7280);
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
                font-size: 10px;
                pointer-events: auto;
                opacity: 0.85;
                transition: opacity 120ms ease, transform 120ms ease;
            }
            .simpai-sketch__dock:hover .simpai-sketch__handle,
            .simpai-sketch__dock:focus-within .simpai-sketch__handle,
            .simpai-sketch__dock.is-open .simpai-sketch__handle {
                opacity: 0;
                transform: scale(0.92);
                pointer-events: none;
            }
            .simpai-sketch__dock:hover .simpai-sketch__panel,
            .simpai-sketch__dock:focus-within .simpai-sketch__panel,
            .simpai-sketch__dock.is-open .simpai-sketch__panel {
                opacity: 1;
                pointer-events: auto;
                transform: translateY(0) scale(1);
            }
            .simpai-sketch.is-drawing .simpai-sketch__panel {
                opacity: 0 !important;
                pointer-events: none !important;
            }
            .simpai-sketch.is-ui-hidden .simpai-sketch__bar,
            .simpai-sketch.is-ui-hidden .simpai-sketch__resolution,
            .simpai-sketch.is-ui-hidden .simpai-sketch__crop-panel,
            .simpai-sketch.is-ui-hidden .canvas-tooltip {
                display: none !important;
                pointer-events: none !important;
            }
            .simpai-sketch.is-mask-disabled .simpai-sketch__dock--left,
            .simpai-sketch.is-mask-disabled .simpai-sketch__group[data-group="mask"] {
                display: none !important;
                pointer-events: none !important;
            }
            .simpai-sketch.is-mask-disabled .simpai-sketch__stage.has-image canvas.mask {
                opacity: 0 !important;
                cursor: default !important;
                pointer-events: none !important;
            }
            .simpai-sketch.is-mask-disabled .simpai-sketch__brush-cursor {
                display: none !important;
            }
            .simpai-sketch__dock--left {
                left: 0;
                top: 0;
                width: 24px;
                height: 180px;
            }
            .simpai-sketch__dock--left .simpai-sketch__handle {
                left: 3px;
                top: 3px;
                width: 24px;
                height: 24px;
                border-radius: 5px;
                background: var(--button-secondary-background-fill, #f7f7f8);
                color: var(--color-accent, #2563eb);
                border-color: var(--color-accent, #2563eb);
                box-shadow: inset 0 0 0 1px var(--color-accent, #2563eb), 0 2px 8px rgba(0, 0, 0, 0.12);
                font-size: 11px;
            }
            .simpai-sketch__dock--left .simpai-sketch__panel {
                left: 3px;
                top: 3px;
                flex-direction: column;
                align-items: flex-start;
            }
            .simpai-sketch__dock--top-right {
                top: 0;
                right: 0;
                width: 38px;
                height: 28px;
            }
            .simpai-sketch__dock--top-right .simpai-sketch__handle {
                top: 3px;
                right: 3px;
                width: 34px;
                height: 20px;
            }
            .simpai-sketch__dock--top-right .simpai-sketch__panel {
                top: 2px;
                right: 2px;
                flex-wrap: nowrap;
                justify-content: flex-end;
                max-width: calc(100% - 4px);
            }
            .simpai-sketch__group--vertical {
                flex-direction: column;
            }
            .simpai-sketch__button {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
                width: 24px !important;
                height: 24px !important;
                min-width: 24px !important;
                min-height: 24px !important;
                max-width: 24px !important;
                max-height: 24px !important;
                border: 1px solid var(--border-color-primary, #d9d9e3);
                border-radius: 5px;
                background: var(--button-secondary-background-fill, #f7f7f8);
                color: var(--body-text-color, #222);
                padding: 0 !important;
                margin: 0 !important;
                cursor: pointer;
                font-size: 11px !important;
                line-height: 1;
                transition: background 120ms ease, border-color 120ms ease, box-shadow 120ms ease, opacity 120ms ease;
            }
            .simpai-sketch__button:hover:not(:disabled) {
                background: var(--button-secondary-background-fill-hover, #efeff3);
            }
            .simpai-sketch__button:disabled {
                cursor: default;
                opacity: 0.45;
            }
            .simpai-sketch__button.active {
                border-color: var(--color-accent, #2563eb);
                box-shadow: inset 0 0 0 1px var(--color-accent, #2563eb);
                color: var(--color-accent, #2563eb);
            }
            .simpai-sketch__button--text {
                width: 24px !important;
                min-width: 24px !important;
                padding: 0;
                white-space: nowrap;
            }
            .simpai-sketch__button--text span {
                display: none;
            }
            .simpai-sketch__button i {
                pointer-events: none;
            }
            .simpai-sketch__bar input[type="color"] {
                width: 24px !important;
                height: 24px !important;
                min-width: 24px !important;
                min-height: 24px !important;
                padding: 2px;
                border: 1px solid var(--border-color-primary, #d9d9e3);
                border-radius: 6px;
                background: var(--input-background-fill, #fff);
                cursor: pointer;
            }
            .simpai-sketch__bar input[type="range"] {
                width: 76px;
                accent-color: var(--color-accent, #2563eb);
            }
            .simpai-sketch__group--size {
                position: relative;
            }
            .simpai-sketch__size-button {
                font-size: 11px !important;
                font-weight: 600;
                font-variant-numeric: tabular-nums;
            }
            .simpai-sketch__size-control {
                position: absolute;
                left: 29px;
                top: 0;
                display: flex;
                align-items: center;
                gap: 5px;
                width: 116px;
                padding: 4px 6px;
                border: 1px solid var(--border-color-primary, #d9d9e3);
                border-radius: 7px;
                background: var(--block-background-fill, #fff);
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
                opacity: 0;
                transform: translateX(-4px);
                pointer-events: none;
                transition: opacity 120ms ease, transform 120ms ease;
            }
            .simpai-sketch__group--size:hover .simpai-sketch__size-control,
            .simpai-sketch__group--size:focus-within .simpai-sketch__size-control {
                opacity: 1;
                transform: translateX(0);
                pointer-events: auto;
            }
            .simpai-sketch__size-value {
                min-width: 26px;
                text-align: right;
                color: var(--body-text-color-subdued, #6b7280);
                font-size: 12px;
                font-variant-numeric: tabular-nums;
            }
            .simpai-sketch__stage {
                position: relative;
                z-index: 1;
                width: 100%;
                max-width: 100%;
                min-height: 180px;
                margin: 0 auto;
                overflow: hidden;
                background: var(--input-background-fill, #f8f8fa);
                touch-action: none;
                transform-origin: 0 0;
            }
            .simpai-sketch__stage canvas {
                position: absolute;
                inset: 0;
                width: 100%;
                height: 100%;
                z-index: 1;
                touch-action: none;
                user-select: none;
                -webkit-user-drag: none;
            }
            .simpai-sketch__stage.has-image canvas.mask {
                opacity: 0.65;
                z-index: 2;
                cursor: none;
            }
            .simpai-sketch__stage.has-mask-only {
                background: #000;
            }
            .simpai-sketch__stage.has-mask-only canvas.mask {
                opacity: 1;
            }
            .simpai-sketch__brush-cursor {
                position: absolute;
                left: 0;
                top: 0;
                width: 20px;
                height: 20px;
                border: 1px solid rgba(255, 255, 255, 0.95);
                border-radius: 50%;
                box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.8);
                pointer-events: none;
                transform: translate(-9999px, -9999px);
                z-index: 7;
                opacity: 0;
                mix-blend-mode: difference;
            }
            .simpai-sketch__stage.is-cursor-visible .simpai-sketch__brush-cursor {
                opacity: 1;
            }
            .simpai-sketch__empty {
                position: absolute;
                inset: 0;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 8px;
                color: var(--body-text-color-subdued, #6b7280);
                pointer-events: none;
                font-size: 15px;
                font-weight: 600;
                line-height: 1.35;
                text-align: center;
                z-index: 3;
            }
            .simpai-sketch__empty i {
                color: var(--body-text-color, #e5e7eb);
                font-size: 26px;
                line-height: 1;
            }
            .simpai-sketch__empty span {
                display: block;
            }
            .simpai-sketch__empty .simpai-sketch__empty-or {
                color: var(--body-text-color-subdued, #9ca3af);
                font-weight: 500;
            }
            .simpai-sketch__stage.is-drag-over {
                outline: 2px dashed var(--color-accent, #f97316);
                outline-offset: -8px;
                background: color-mix(in srgb, var(--input-background-fill, #f8f8fa) 86%, var(--color-accent, #f97316));
            }
            .simpai-sketch__resolution {
                position: absolute;
                left: 8px;
                bottom: 2px;
                z-index: 11;
                display: none;
                padding: 2px 6px;
                border: 1px solid rgba(255, 255, 255, 0.24);
                border-radius: 5px;
                background: rgba(0, 0, 0, 0.55);
                color: #fff;
                font-size: 11px;
                line-height: 1.4;
                font-variant-numeric: tabular-nums;
                pointer-events: none;
            }
            .simpai-sketch__crop {
                position: absolute;
                inset: 0;
                z-index: 9;
                display: none;
                cursor: crosshair;
                touch-action: none;
            }
            .simpai-sketch.is-cropping .simpai-sketch__crop {
                display: block;
            }
            .simpai-sketch.is-cropping {
                overflow: visible;
            }
            .simpai-sketch.is-cropping .simpai-sketch__bar {
                opacity: 0;
                pointer-events: none;
            }
            .simpai-sketch.is-cropping .simpai-sketch__stage {
                overflow: visible;
            }
            .simpai-sketch__crop-box {
                position: absolute;
                left: 0;
                top: 0;
                display: none;
                border: 1px solid rgba(255, 255, 255, 0.98);
                box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.45), inset 0 0 0 1px rgba(0, 0, 0, 0.6);
                cursor: move;
                will-change: transform, width, height;
            }
            .simpai-sketch.is-cropping .simpai-sketch__crop-box {
                display: block;
            }
            .simpai-sketch__crop-box::before,
            .simpai-sketch__crop-box::after {
                content: "";
                position: absolute;
                inset: 33.333% 0 auto 0;
                border-top: 1px solid rgba(255, 255, 255, 0.38);
                pointer-events: none;
            }
            .simpai-sketch__crop-box::after {
                inset: 66.666% 0 auto 0;
            }
            .simpai-sketch__crop-guide {
                position: absolute;
                inset: 0;
                pointer-events: none;
            }
            .simpai-sketch__crop-guide::before,
            .simpai-sketch__crop-guide::after {
                content: "";
                position: absolute;
                top: 0;
                bottom: 0;
                border-left: 1px solid rgba(255, 255, 255, 0.38);
            }
            .simpai-sketch__crop-guide::before {
                left: 33.333%;
            }
            .simpai-sketch__crop-guide::after {
                left: 66.666%;
            }
            .simpai-sketch__crop-handle {
                position: absolute;
                width: 10px;
                height: 10px;
                border: 1px solid rgba(0, 0, 0, 0.75);
                border-radius: 50%;
                background: #fff;
            }
            .simpai-sketch__crop-handle[data-handle="nw"] {
                left: -5px;
                top: -5px;
                cursor: nwse-resize;
            }
            .simpai-sketch__crop-handle[data-handle="ne"] {
                right: -5px;
                top: -5px;
                cursor: nesw-resize;
            }
            .simpai-sketch__crop-handle[data-handle="sw"] {
                left: -5px;
                bottom: -5px;
                cursor: nesw-resize;
            }
            .simpai-sketch__crop-handle[data-handle="se"] {
                right: -5px;
                bottom: -5px;
                cursor: nwse-resize;
            }
            .simpai-sketch__crop-panel {
                position: absolute;
                right: 0;
                top: 0;
                z-index: 12;
                display: none;
                align-items: center;
                gap: 4px;
                padding: 4px;
                border: 1px solid var(--border-color-primary, #d9d9e3);
                border-radius: 0 0 0 6px;
                background: var(--block-background-fill, #fff);
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
            }
            .simpai-sketch.is-cropping .simpai-sketch__crop-panel {
                display: flex;
            }
            .simpai-sketch__crop-panel select {
                height: 24px;
                min-height: 24px;
                width: 74px;
                max-width: 74px;
                border: 1px solid var(--border-color-primary, #d9d9e3);
                border-radius: 5px;
                background: var(--input-background-fill, #fff);
                color: var(--body-text-color, #222);
                font-size: 11px;
                padding: 0 4px;
            }
            .simpai-sketch__crop-panel select option {
                background: #fff;
                color: #111;
            }
            .simpai-sketch__file {
                display: none;
            }
            .simpai-sketch__image-proxy {
                position: absolute;
                width: 1px;
                height: 1px;
                opacity: 0;
                pointer-events: none;
                left: 0;
                top: 0;
            }
            .simpai-sketch.simpai-sketch--fullscreen {
                position: fixed !important;
                inset: 0 !important;
                width: 100vw !important;
                height: 100vh !important;
                max-width: none !important;
                max-height: none !important;
                z-index: 2147483000 !important;
                border-radius: 0 !important;
                border: 0 !important;
                background: rgba(16, 16, 20, 0.96) !important;
                display: block !important;
                overflow: hidden !important;
            }
            .simpai-sketch.simpai-sketch--pan-floating {
                z-index: 2147483000 !important;
                overflow: visible !important;
                cursor: grabbing !important;
            }
            .simpai-sketch.simpai-sketch--fullscreen .simpai-sketch__stage {
                position: absolute !important;
                left: 0 !important;
                top: 0 !important;
                max-width: none !important;
                margin: 0 !important;
                transform-origin: 0 0;
                overflow: visible !important;
                pointer-events: auto !important;
            }
            .simpai-sketch.simpai-sketch--pan-floating .simpai-sketch__stage {
                cursor: grabbing !important;
            }
            body.simpai-sketch-fullscreen-active {
                overflow: hidden !important;
            }
            @media (max-width: 640px) {
                .simpai-sketch__dock--top-right {
                    width: 38px;
                    height: 28px;
                }
                .simpai-sketch__dock--left {
                    width: 24px;
                }
                .simpai-sketch__group {
                    gap: 3px;
                    padding: 2px;
                }
                .simpai-sketch__bar input[type="range"] {
                    width: 64px;
                }
                .simpai-sketch__size-control {
                    width: 104px;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function findInput(root) {
        return root.querySelector("textarea, input[type='text']");
    }

    function classValue(root, prefix) {
        const cls = Array.from(root.classList).find((name) => name.startsWith(prefix));
        return cls ? cls.slice(prefix.length) : "";
    }

    function setInputValue(input, value, options = {}) {
        const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")?.set;
        if (setter) setter.call(input, value);
        else input.value = value;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        if (options.change) {
            input.dispatchEvent(new Event("change", { bubbles: true }));
        }
    }

    function fitCanvas(canvas, width, height) {
        canvas.width = width;
        canvas.height = height;
    }

    function loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = src;
        });
    }

    function hexToRgb(value) {
        const hex = String(value || "").trim().replace(/^#/, "");
        if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
        const n = Number.parseInt(hex, 16);
        return {
            r: (n >> 16) & 255,
            g: (n >> 8) & 255,
            b: n & 255
        };
    }

    function isImageFileLike(file) {
        const type = String(file?.type || "").toLowerCase();
        if (type.startsWith("image/")) return true;
        return IMAGE_FILE_EXTENSION_RE.test(String(file?.name || ""));
    }

    function firstImageFile(files) {
        const list = Array.from(files || []).filter(Boolean);
        return list.find(isImageFileLike) || (list.length === 1 ? list[0] : null);
    }

    function readBlobAsDataUrl(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    function isDataImageUrl(value) {
        return /^data:image\//i.test(String(value || ""));
    }

    function sketchPerformanceMark(event, data = {}) {
        try {
            window.SimpAIStudioPerformance?.mark?.(event, data);
        } catch {
        }
    }

    async function postSketchCachePayload(payload) {
        if (!payload || (!isDataImageUrl(payload.image) && !isDataImageUrl(payload.mask))) return null;
        const startedAt = performance.now();
        let responseStatus = 0;
        let succeeded = false;
        sketchPerformanceMark("sketch.cache.request_start", {
            has_image: isDataImageUrl(payload.image),
            has_mask: isDataImageUrl(payload.mask),
            width: Number(payload.width) || 0,
            height: Number(payload.height) || 0
        });
        try {
            const response = await fetch(SKETCH_CACHE_ENDPOINT, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    image: isDataImageUrl(payload.image) ? payload.image : "",
                    mask: isDataImageUrl(payload.mask) ? payload.mask : "",
                    width: payload.width,
                    height: payload.height
                })
            });
            responseStatus = Number(response.status) || 0;
            if (!response.ok) return null;
            const result = await response.json();
            succeeded = !!(result && result.ok);
            return succeeded ? result : null;
        } finally {
            sketchPerformanceMark("sketch.cache.request_finish", {
                duration_ms: Math.round((performance.now() - startedAt) * 10) / 10,
                status: responseStatus,
                ok: succeeded
            });
        }
    }

    async function resolveSketchCachePayload(payload) {
        if (!payload || (!payload.image_ref && !payload.mask_ref)) return null;
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 10000);
        try {
            const response = await fetch(SKETCH_CACHE_RESOLVE_ENDPOINT, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    image: isDataImageUrl(payload.image) ? payload.image : "",
                    mask: isDataImageUrl(payload.mask) ? payload.mask : "",
                    image_ref: payload.image_ref || "",
                    mask_ref: payload.mask_ref || "",
                    image_sha256: payload.image_sha256 || "",
                    mask_sha256: payload.mask_sha256 || "",
                    width: payload.width,
                    height: payload.height
                }),
                signal: controller.signal
            });
            if (!response.ok) return null;
            const result = await response.json();
            return result && result.ok ? result : null;
        } catch {
            return null;
        } finally {
            window.clearTimeout(timeout);
        }
    }

    function transferTypes(transfer) {
        return Array.from(transfer?.types || []).map((type) => String(type).toLowerCase());
    }

    function transferMayContainImage(transfer) {
        if (!transfer) return false;
        const files = Array.from(transfer.files || []);
        if (files.length && (files.some(isImageFileLike) || files.length === 1)) return true;
        const items = Array.from(transfer.items || []);
        if (items.some((item) => item?.kind === "file" && (!item.type || String(item.type).toLowerCase().startsWith("image/")))) {
            return true;
        }
        const types = transferTypes(transfer);
        return types.includes("files")
            || types.includes("text/uri-list")
            || types.includes("text/html")
            || types.includes("text/plain");
    }

    function firstUriFromList(text) {
        return String(text || "")
            .split(/\r?\n/)
            .map((line) => line.trim())
            .find((line) => line && !line.startsWith("#")) || "";
    }

    function firstImageSourceFromHtml(html) {
        if (!html) return "";
        try {
            const doc = new DOMParser().parseFromString(html, "text/html");
            const src = doc.querySelector("img[src]")?.getAttribute("src") || "";
            if (src) return src;
        } catch {
        }
        const match = String(html).match(/<img\b[^>]*\bsrc=["']?([^"'\s>]+)/i);
        return match ? match[1] : "";
    }

    function normalizeImageSource(source) {
        const value = String(source || "").trim();
        if (!value) return "";
        if (/^(?:data:image\/|blob:)/i.test(value)) return value;
        try {
            return new URL(value, document.baseURI).href;
        } catch {
            return value;
        }
    }

    function firstTransferUrl(transfer) {
        if (!transfer || typeof transfer.getData !== "function") return "";
        const uri = firstUriFromList(transfer.getData("text/uri-list"));
        if (uri) return normalizeImageSource(uri);
        const fromHtml = firstImageSourceFromHtml(transfer.getData("text/html"));
        if (fromHtml) return normalizeImageSource(fromHtml);
        const plain = String(transfer.getData("text/plain") || "").trim();
        return plain ? normalizeImageSource(plain) : "";
    }

    async function imageSourceToDataUrl(source) {
        const normalized = normalizeImageSource(source);
        if (!normalized) return "";
        if (/^data:image\//i.test(normalized)) return normalized;
        try {
            const response = await fetch(normalized);
            if (response.ok) {
                const blob = await response.blob();
                if (!blob.type || String(blob.type).toLowerCase().startsWith("image/")) {
                    return await readBlobAsDataUrl(blob);
                }
            }
        } catch {
        }
        const image = await loadImage(normalized);
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth || image.width || 1;
        canvas.height = image.naturalHeight || image.height || 1;
        canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL("image/png");
    }

    function sketchRuntimeLang() {
        const candidates = [];
        try {
            const search = new URLSearchParams(window.location.search || "");
            candidates.push(search.get("__lang"));
        } catch {
        }
        [
            window.state,
            window.simpleaiState,
            window.simpleaiTopbarSystemParams,
            window.system_params
        ].forEach((source) => {
            if (!source || typeof source !== "object") return;
            candidates.push(source.__lang, source.state?.__lang, source.lang, source.language);
        });
        if (typeof window.locale_lang === "string") candidates.push(window.locale_lang);
        const raw = candidates.map((value) => String(value || "").trim().toLowerCase()).find(Boolean) || "en";
        return raw.startsWith("cn") || raw.startsWith("zh") ? "cn" : "en";
    }

    function syncSketchEmptyLocale(editor) {
        const lang = sketchRuntimeLang();
        editor.querySelectorAll("[data-i18n-en]").forEach((node) => {
            const next = node.dataset[lang === "cn" ? "i18nCn" : "i18nEn"];
            if (next && node.textContent !== next) {
                node.textContent = next;
            }
        });
    }

    function bindSketchDockAutoHide(dock) {
        if (!dock || dock.dataset.simpaiDockDebounced === "1") return;
        dock.dataset.simpaiDockDebounced = "1";
        let showTimer = null;
        let hideTimer = null;

        const clearShowTimer = () => {
            if (showTimer) {
                clearTimeout(showTimer);
                showTimer = null;
            }
        };
        const clearHideTimer = () => {
            if (hideTimer) {
                clearTimeout(hideTimer);
                hideTimer = null;
            }
        };
        const openDock = () => {
            clearShowTimer();
            clearHideTimer();
            dock.classList.add("is-open");
        };
        const scheduleOpenDock = () => {
            clearHideTimer();
            if (dock.classList.contains("is-open")) return;
            clearShowTimer();
            showTimer = setTimeout(openDock, DOCK_OPEN_DELAY_MS);
        };
        const scheduleHideDock = () => {
            clearShowTimer();
            clearHideTimer();
            hideTimer = setTimeout(() => {
                hideTimer = null;
                if (dock.matches(":hover") || dock.contains(document.activeElement)) return;
                dock.classList.remove("is-open");
            }, DOCK_HIDE_DELAY_MS);
        };

        dock.addEventListener("pointerenter", scheduleOpenDock);
        dock.addEventListener("pointerleave", scheduleHideDock);
        dock.addEventListener("focusin", openDock);
        dock.addEventListener("focusout", () => setTimeout(scheduleHideDock, 0));
    }

    async function initRoot(root) {
        if (root.dataset.simpaiSketchReady === "1") return;
        const input = findInput(root);
        if (!input) return;
        root.dataset.simpaiSketchReady = "1";
        root.dataset.simpaiSketch = "1";
        root.classList.add("image-container");

        const editor = document.createElement("div");
        editor.className = "simpai-sketch";
        editor.innerHTML = `
            <div class="simpai-sketch__stage">
                <canvas data-role="background"></canvas>
                <canvas data-role="mask" data-key="mask" class="mask"></canvas>
                <div class="simpai-sketch__brush-cursor" data-role="brush-cursor"></div>
                <div class="simpai-sketch__crop" data-role="crop-overlay">
                    <div class="simpai-sketch__crop-box" data-role="crop-box">
                        <div class="simpai-sketch__crop-guide"></div>
                        <span class="simpai-sketch__crop-handle" data-handle="nw"></span>
                        <span class="simpai-sketch__crop-handle" data-handle="ne"></span>
                        <span class="simpai-sketch__crop-handle" data-handle="sw"></span>
                        <span class="simpai-sketch__crop-handle" data-handle="se"></span>
                    </div>
                </div>
                <div class="simpai-sketch__resolution" data-role="resolution"></div>
                <div class="simpai-sketch__empty">
                    <i class="fa-solid fa-upload"></i>
                    <span data-i18n-en="Drop image here" data-i18n-cn="将图像拖放到此处">Drop image here</span>
                    <span class="simpai-sketch__empty-or" data-i18n-en="- or -" data-i18n-cn="- 或 -">- or -</span>
                    <span data-i18n-en="Click to upload" data-i18n-cn="点击上传">Click to upload</span>
                </div>
            </div>
            <div class="simpai-sketch__bar" data-role="controls">
                <div class="simpai-sketch__dock simpai-sketch__dock--left">
                    <div class="simpai-sketch__handle" title="Brush" data-role="tool-handle"><i class="fa-solid fa-paintbrush" data-role="tool-handle-icon"></i></div>
                    <div class="simpai-sketch__panel">
                        <div class="simpai-sketch__group simpai-sketch__group--vertical" data-group="tools">
                            <button class="simpai-sketch__button active" type="button" data-action="brush" title="Brush" aria-label="Brush"><i class="fa-solid fa-paintbrush"></i></button>
                            <button class="simpai-sketch__button" type="button" data-action="eraser" title="Eraser" aria-label="Eraser"><i class="fa-solid fa-eraser"></i></button>
                            <input type="color" data-role="color" value="#ffffff" title="Brush color" aria-label="Brush color">
                        </div>
                        <div class="simpai-sketch__group simpai-sketch__group--size" data-group="size">
                            <button class="simpai-sketch__button simpai-sketch__size-button" type="button" data-action="size" title="Brush size" aria-label="Brush size">${DEFAULT_BRUSH_SIZE}</button>
                            <div class="simpai-sketch__size-control">
                                <input type="range" data-role="size" min="2" max="${MAX_BRUSH_SIZE}" value="${DEFAULT_BRUSH_SIZE}" title="Brush size" aria-label="Brush size">
                                <span class="simpai-sketch__size-value" data-role="size-value">${DEFAULT_BRUSH_SIZE}</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="simpai-sketch__dock simpai-sketch__dock--top-right">
                    <div class="simpai-sketch__handle" title="Image actions"><i class="fa-solid fa-ellipsis"></i></div>
                    <div class="simpai-sketch__panel">
                        <div class="simpai-sketch__group" data-group="image">
                            <button class="simpai-sketch__button" type="button" data-action="upload" title="Upload image" aria-label="Upload image"><i class="fa-solid fa-upload"></i></button>
                            <button class="simpai-sketch__button" type="button" data-action="paste" title="Paste image from clipboard" aria-label="Paste image from clipboard"><i class="fa-solid fa-clipboard"></i></button>
                            <button class="simpai-sketch__button" type="button" data-action="crop" title="Crop image" aria-label="Crop image"><i class="fa-solid fa-crop-simple"></i></button>
                            <button class="simpai-sketch__button" type="button" data-action="clear-image" title="Clear image" aria-label="Clear image"><i class="fa-solid fa-trash"></i></button>
                        </div>
                        <div class="simpai-sketch__group" data-group="history">
                            <button class="simpai-sketch__button" type="button" data-action="undo" title="Undo" aria-label="Undo"><i class="fa-solid fa-rotate-left"></i></button>
                            <button class="simpai-sketch__button" type="button" data-action="redo" title="Redo" aria-label="Redo"><i class="fa-solid fa-rotate-right"></i></button>
                        </div>
                        <div class="simpai-sketch__group" data-group="mask">
                            <button class="simpai-sketch__button simpai-sketch__button--text" type="button" data-action="clear" title="Clear mask" aria-label="Clear mask"><i class="fa-solid fa-broom"></i><span>Mask</span></button>
                        </div>
                    </div>
                </div>
                <input class="simpai-sketch__file" type="file" accept="image/*">
            </div>
            <div class="simpai-sketch__crop-panel" data-role="crop-panel">
                <select data-role="crop-aspect" title="Crop aspect" aria-label="Crop aspect">
                    <option value="free">Free</option>
                    <option value="1:1">1:1</option>
                    <option value="4:3">4:3</option>
                    <option value="3:4">3:4</option>
                    <option value="3:2">3:2</option>
                    <option value="2:3">2:3</option>
                    <option value="16:9">16:9</option>
                    <option value="9:16">9:16</option>
                </select>
                <button class="simpai-sketch__button" type="button" data-action="crop-apply" title="Apply crop" aria-label="Apply crop"><i class="fa-solid fa-check"></i></button>
                <button class="simpai-sketch__button" type="button" data-action="crop-cancel" title="Cancel crop" aria-label="Cancel crop"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <img class="simpai-sketch__image-proxy" alt="">
        `;
        root.appendChild(editor);
        syncSketchEmptyLocale(editor);

        const fileInput = editor.querySelector(".simpai-sketch__file");
        const proxyImage = editor.querySelector(".simpai-sketch__image-proxy");
        const bgCanvas = editor.querySelector("canvas[data-role='background']");
        const maskCanvas = editor.querySelector("canvas[data-role='mask']");
        const stage = editor.querySelector(".simpai-sketch__stage");
        const brushCursor = editor.querySelector("[data-role='brush-cursor']");
        const toolHandle = editor.querySelector("[data-role='tool-handle']");
        const toolHandleIcon = editor.querySelector("[data-role='tool-handle-icon']");
        const resolutionBadge = editor.querySelector("[data-role='resolution']");
        const cropOverlay = editor.querySelector("[data-role='crop-overlay']");
        const cropBox = editor.querySelector("[data-role='crop-box']");
        const cropPanel = editor.querySelector("[data-role='crop-panel']");
        const cropAspectSelect = editor.querySelector("[data-role='crop-aspect']");
        const controls = editor.querySelector("[data-role='controls']");
        const empty = editor.querySelector(".simpai-sketch__empty");
        const colorInput = editor.querySelector("input[data-role='color']");
        const sizeInput = editor.querySelector("input[data-role='size']");
        const sizeValue = editor.querySelector("[data-role='size-value']");
        const sizeButton = editor.querySelector("button[data-action='size']");
        const undoButton = editor.querySelector("button[data-action='undo']");
        const redoButton = editor.querySelector("button[data-action='redo']");
        const clearButton = editor.querySelector("button[data-action='clear']");
        const clearImageButton = editor.querySelector("button[data-action='clear-image']");
        const cropButton = editor.querySelector("button[data-action='crop']");
        const cropApplyButton = editor.querySelector("button[data-action='crop-apply']");
        const cropCancelButton = editor.querySelector("button[data-action='crop-cancel']");
        const brushButton = editor.querySelector("button[data-action='brush']");
        const eraserButton = editor.querySelector("button[data-action='eraser']");
        const bgCtx = bgCanvas.getContext("2d", { willReadFrequently: true });
        const maskCtx = maskCanvas.getContext("2d", { willReadFrequently: true });
        editor.querySelectorAll(".simpai-sketch__dock").forEach(bindSketchDockAutoHide);
        [editor, stage, bgCanvas, maskCanvas, proxyImage].forEach((node) => {
            try { node.setAttribute("draggable", "false"); } catch (e) {}
        });
        const defaultAspectRatio = 3 / 2;
        const configuredHeight = Number(classValue(root, "simpai-sketch-height-")) || 420;
        const configuredWidth = Number(classValue(root, "simpai-sketch-width-")) || Math.round(configuredHeight * defaultAspectRatio);
        const configuredRadiusRaw = Number(classValue(root, "simpai-sketch-radius-"));
        const configuredRadius = Math.min(
            Math.max(Number.isFinite(configuredRadiusRaw) && configuredRadiusRaw > 0 ? configuredRadiusRaw : DEFAULT_BRUSH_SIZE, Number(sizeInput.min || 2)),
            Number(sizeInput.max || MAX_BRUSH_SIZE)
        );
        const configuredBrush = classValue(root, "simpai-sketch-brush-");
        const preserveMaskColor = root.classList.contains("simpai-sketch-preserve-mask-color");
        if (configuredBrush) colorInput.value = `#${configuredBrush.slice(0, 6)}`;
        sizeInput.value = String(configuredRadius);
        if (sizeValue) sizeValue.textContent = String(configuredRadius);

        let drawing = false;
        let mode = "brush";
        let hasImage = false;
        let width = configuredWidth;
        let height = configuredHeight;
        let sourceImageDataUrl = "";
        const undoStack = [];
        const redoStack = [];
        let serializeTimer = null;
        let valueDirty = false;
        let lastPayload = null;
        let destroyed = false;
        const lifecycleListeners = [];
        let resizeObserver = null;
        let resizeFrame = null;
        let fullscreenMode = false;
        let panFloatingMode = false;
        let panGestureMode = false;
        let pointerInsideEditor = false;
        let viewportPanX = 0;
        let viewportPanY = 0;
        let viewportScale = 1;
        let viewportBaseWidth = 0;
        let viewportBaseHeight = 0;
        let fullscreenPlaceholder = null;
        let originalParent = null;
        let originalNextSibling = null;
        let cropMode = false;
        let cropRect = null;
        let cropDrag = null;
        let cropMetrics = null;
        let lastResolutionText = "";
        let lastCropBadgeAt = 0;
        let uiHidden = false;
        let maskDisabled = root.dataset.simpaiMaskDisabled === "1";

        function addLifecycleListener(target, type, listener, options) {
            target.addEventListener(type, listener, options);
            lifecycleListeners.push({ target, type, listener, options });
        }

        function clearMaskPixels() {
            maskCtx.clearRect(0, 0, width, height);
        }

        function setMaskDisabled(disabled, options = {}) {
            const nextDisabled = !!disabled;
            const changed = maskDisabled !== nextDisabled;
            maskDisabled = nextDisabled;
            const attrValue = maskDisabled ? "1" : "0";
            if (root.dataset.simpaiMaskDisabled !== attrValue) {
                root.dataset.simpaiMaskDisabled = attrValue;
            }
            editor.dataset.simpaiMaskDisabled = attrValue;
            editor.classList.toggle("is-mask-disabled", maskDisabled);
            if (!changed && !options.force) {
                return !maskDisabled;
            }
            if (maskDisabled) {
                drawing = false;
                mode = "brush";
                editor.classList.remove("is-drawing");
                stage.classList.remove("is-cursor-visible");
                if (options.clearMask !== false && hasImage) {
                    clearMaskPixels();
                    serialize({ change: options.change !== false });
                }
            }
            if (changed || options.force) refreshToolbarState();
            return !maskDisabled;
        }

        function refreshToolbarState() {
            if (!hasImage && cropMode) {
                cropMode = false;
                cropDrag = null;
                cropRect = null;
            }
            const brushSize = String(Math.round(Number(sizeInput.value || configuredRadius || DEFAULT_BRUSH_SIZE)));
            if (sizeValue) sizeValue.textContent = brushSize;
            if (sizeButton) sizeButton.textContent = brushSize;
            stage.classList.toggle("has-image", !!hasImage);
            stage.classList.toggle("has-mask-only", !!hasImage && !sourceImageDataUrl && !preserveMaskColor);
            editor.classList.toggle("is-cropping", !!(cropMode && hasImage));
            if (cropMode) {
                stage.classList.remove("is-cursor-visible");
            }
            if (brushButton) brushButton.classList.toggle("active", mode === "brush");
            if (eraserButton) eraserButton.classList.toggle("active", mode === "eraser");
            if (toolHandleIcon) {
                toolHandleIcon.className = mode === "eraser" ? "fa-solid fa-eraser" : "fa-solid fa-paintbrush";
            }
            if (toolHandle) {
                toolHandle.title = mode === "eraser" ? "Eraser" : "Brush";
            }
            updateBrushCursor();
            if (undoButton) undoButton.disabled = !hasImage || undoStack.length === 0;
            if (redoButton) redoButton.disabled = !hasImage || redoStack.length === 0;
            if (clearButton) clearButton.disabled = !hasImage || maskDisabled;
            if (clearImageButton) clearImageButton.disabled = !hasImage;
            if (cropButton) {
                cropButton.disabled = !hasImage;
                cropButton.classList.toggle("active", !!(cropMode && hasImage));
            }
            if (cropApplyButton) cropApplyButton.disabled = !hasImage || !cropMode || !cropRect;
            if (cropCancelButton) cropCancelButton.disabled = !cropMode;
            updateResolutionBadge();
            updateCropOverlay();
        }

        function setUiHidden(hidden) {
            uiHidden = !!hidden;
            editor.classList.toggle("is-ui-hidden", uiHidden);
            return uiHidden;
        }

        function toggleUi() {
            return setUiHidden(!uiHidden);
        }

        function currentMaskDataUrl() {
            try {
                return maskCanvas.toDataURL("image/png");
            } catch {
                return null;
            }
        }

        function captureMaskState() {
            try {
                const imageData = maskCtx.getImageData(0, 0, width, height);
                const source = imageData.data;
                const alpha = new Uint8ClampedArray(width * height);
                let color = null;
                let uniformColor = true;
                for (let src = 0, dst = 0; src < source.length; src += 4, dst += 1) {
                    const value = source[src + 3];
                    alpha[dst] = value;
                    if (!value) continue;
                    if (!color) {
                        color = [source[src], source[src + 1], source[src + 2]];
                    } else if (uniformColor && (
                        color[0] !== source[src]
                        || color[1] !== source[src + 1]
                        || color[2] !== source[src + 2]
                    )) {
                        uniformColor = false;
                    }
                }
                if (uniformColor) {
                    const fallbackColor = hexToRgb(colorInput.value || "#ffffff") || { r: 255, g: 255, b: 255 };
                    return {
                        type: "mask-alpha",
                        width,
                        height,
                        color: color || [fallbackColor.r, fallbackColor.g, fallbackColor.b],
                        alpha
                    };
                }
                return { type: "mask-rgba", width, height, imageData };
            } catch {
                return currentMaskDataUrl();
            }
        }

        async function drawCapturedMaskState(state) {
            if (!state) return false;
            maskCtx.clearRect(0, 0, width, height);
            if (state.type === "mask-alpha" && state.alpha) {
                const stateWidth = Math.max(1, Number(state.width) || width);
                const stateHeight = Math.max(1, Number(state.height) || height);
                const imageData = maskCtx.createImageData(stateWidth, stateHeight);
                const output = imageData.data;
                const color = Array.isArray(state.color) ? state.color : [255, 255, 255];
                const pixelCount = Math.min(state.alpha.length, stateWidth * stateHeight);
                for (let src = 0, dst = 0; src < pixelCount; src += 1, dst += 4) {
                    output[dst] = color[0] || 0;
                    output[dst + 1] = color[1] || 0;
                    output[dst + 2] = color[2] || 0;
                    output[dst + 3] = state.alpha[src];
                }
                maskCtx.putImageData(imageData, 0, 0);
            } else if (state.type === "mask-rgba" && state.imageData) {
                maskCtx.putImageData(state.imageData, 0, 0);
            } else if (typeof ImageData !== "undefined" && state instanceof ImageData) {
                maskCtx.putImageData(state, 0, 0);
            } else {
                const maskImg = await loadImage(state);
                maskCtx.drawImage(maskImg, 0, 0, width, height);
            }
            return true;
        }

        async function restoreMaskState(state) {
            if (!state || !hasImage) return false;
            const restored = await drawCapturedMaskState(state);
            if (!restored) return false;
            serialize();
            refreshToolbarState();
            return true;
        }

        function historyEntryBytes(entry) {
            if (!entry) return 0;
            if (typeof entry === "string") return entry.length * 2;
            if (entry.type === "mask-alpha" && entry.alpha) return entry.alpha.byteLength + 64;
            if (entry.type === "mask-rgba" && entry.imageData?.data) return entry.imageData.data.byteLength + 64;
            if (typeof ImageData !== "undefined" && entry instanceof ImageData) return entry.data.byteLength + 64;
            if (entry.type === "full") {
                return historyEntryBytes(entry.image) + historyEntryBytes(entry.mask) + 128;
            }
            return 1024;
        }

        function historyMemoryBytes() {
            return [...undoStack, ...redoStack].reduce((total, entry) => total + historyEntryBytes(entry), 0);
        }

        function trimHistory(preferredStack) {
            const otherStack = preferredStack === undoStack ? redoStack : undoStack;
            while (
                undoStack.length + redoStack.length > SKETCH_HISTORY_LIMIT
                || historyMemoryBytes() > SKETCH_HISTORY_MEMORY_BUDGET
            ) {
                if (otherStack.length) {
                    otherStack.shift();
                } else if (preferredStack.length > 1) {
                    preferredStack.shift();
                } else {
                    break;
                }
            }
        }

        function appendHistoryEntry(stack, entry) {
            if (!entry) return false;
            stack.push(entry);
            trimHistory(stack);
            return stack.includes(entry);
        }

        function pushUndoState(clearRedo = true, force = false) {
            if (!hasImage || !width || !height) return;
            const current = captureMaskState();
            if (!current) return;
            if (typeof current === "string" && undoStack.length && undoStack[undoStack.length - 1] === current) return;
            pushUndoEntry(current, clearRedo);
        }

        function pushUndoEntry(entry, clearRedo = true) {
            if (!entry) return;
            try {
                if (clearRedo) {
                    redoStack.length = 0;
                }
                appendHistoryEntry(undoStack, entry);
                refreshToolbarState();
            } catch {
            }
        }

        function isFullHistoryState(state) {
            return !!(state && typeof state === "object" && state.type === "full" && (state.image || state.mask));
        }

        function captureEditorState() {
            if (!hasImage || !width || !height) return null;
            try {
                return {
                    type: "full",
                    image: sourceImageDataUrl || bgCanvas.toDataURL("image/png"),
                    mask: captureMaskState(),
                    width,
                    height
                };
            } catch {
                return null;
            }
        }

        async function restoreEditorState(state) {
            if (!isFullHistoryState(state)) return false;
            const nextWidth = Math.max(1, Number(state.width) || width);
            const nextHeight = Math.max(1, Number(state.height) || height);
            const image = state.image ? await loadImage(state.image) : null;
            hasImage = true;
            resize(nextWidth, nextHeight);
            bgCtx.clearRect(0, 0, width, height);
            maskCtx.clearRect(0, 0, width, height);
            if (image) {
                bgCtx.drawImage(image, 0, 0, width, height);
                sourceImageDataUrl = state.image;
                proxyImage.src = state.image;
            } else {
                sourceImageDataUrl = "";
                proxyImage.removeAttribute("src");
            }
            if (state.mask) {
                await drawCapturedMaskState(state.mask);
            }
            cropRect = defaultCropRect();
            lastPayload = null;
            valueDirty = false;
            empty.style.display = "none";
            updateStageDisplay();
            serialize();
            refreshToolbarState();
            return true;
        }

        async function undoMask() {
            const previous = undoStack.pop();
            if (!previous || !hasImage) return false;
            if (isFullHistoryState(previous)) {
                const current = captureEditorState();
                if (current) {
                    appendHistoryEntry(redoStack, current);
                }
                const restored = await restoreEditorState(previous);
                refreshToolbarState();
                return restored;
            }
            const current = captureMaskState();
            if (current) {
                appendHistoryEntry(redoStack, current);
            }
            const restored = await restoreMaskState(previous);
            refreshToolbarState();
            return restored;
        }

        async function redoMask() {
            const next = redoStack.pop();
            if (!next || !hasImage) return false;
            if (isFullHistoryState(next)) {
                const current = captureEditorState();
                if (current) {
                    pushUndoEntry(current, false);
                }
                const restored = await restoreEditorState(next);
                refreshToolbarState();
                return restored;
            }
            pushUndoState(false, true);
            const restored = await restoreMaskState(next);
            refreshToolbarState();
            return restored;
        }

        function sketchHistoryHotkey(event) {
            if (!(event.ctrlKey || event.metaKey) || event.altKey) return null;
            const key = String(event.key || "").toLowerCase();
            if (event.code === "KeyZ" || key === "z") return event.shiftKey ? "redo" : "undo";
            if (event.code === "KeyY" || key === "y") return "redo";
            return null;
        }

        function shouldHandleSketchHistoryHotkey(event, action) {
            if (!action || !hasImage) return false;
            if (fullscreenMode || panFloatingMode) return true;
            return !!(pointerInsideEditor || event.target?.closest?.(".simpai-sketch"));
        }

        function runSketchHistoryHotkey(action) {
            const task = action === "redo" ? redoMask() : undoMask();
            Promise.resolve(task)
                .then(refreshToolbarState)
                .catch(refreshToolbarState);
        }

        function adjustBrushSize(deltaY, percentage = 5) {
            const maxValue = Number(sizeInput.max || MAX_BRUSH_SIZE);
            const minValue = Number(sizeInput.min || 2);
            const changeAmount = maxValue * (percentage / 100);
            const current = Number(sizeInput.value || configuredRadius || DEFAULT_BRUSH_SIZE);
            const next = current + (deltaY > 0 ? -changeAmount : changeAmount);
            sizeInput.value = String(Math.min(Math.max(next, minValue), maxValue));
            sizeInput.dispatchEvent(new Event("input", { bubbles: true }));
            sizeInput.dispatchEvent(new Event("change", { bubbles: true }));
            refreshToolbarState();
        }

        function clamp(value, min, max) {
            if (max < min) return min;
            return Math.min(Math.max(value, min), max);
        }

        function cropAspectRatio() {
            const value = cropAspectSelect?.value || "free";
            if (!value || value === "free") return null;
            const parts = value.split(":").map((part) => Number(part));
            if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
            return parts[0] / parts[1];
        }

        function normalizeCropRect(rect) {
            if (!rect || !width || !height) return null;
            let x = Number(rect.x) || 0;
            let y = Number(rect.y) || 0;
            let w = Number(rect.w) || 0;
            let h = Number(rect.h) || 0;
            if (w < 0) {
                x += w;
                w = Math.abs(w);
            }
            if (h < 0) {
                y += h;
                h = Math.abs(h);
            }
            const minW = Math.min(2, Math.max(1, width));
            const minH = Math.min(2, Math.max(1, height));
            x = clamp(x, 0, Math.max(0, width - minW));
            y = clamp(y, 0, Math.max(0, height - minH));
            w = clamp(w, minW, Math.max(minW, width - x));
            h = clamp(h, minH, Math.max(minH, height - y));
            return { x, y, w, h };
        }

        function defaultCropRect() {
            return normalizeCropRect({
                x: 0,
                y: 0,
                w: width,
                h: height
            });
        }

        function cropResolutionText() {
            const r = normalizeCropRect(cropRect);
            if (!r) return "";
            return `Crop ${Math.round(r.w)} x ${Math.round(r.h)}`;
        }

        function updateResolutionBadge(options = {}) {
            if (!resolutionBadge) return;
            if (!hasImage || !width || !height) {
                if (lastResolutionText !== "") {
                    resolutionBadge.textContent = "";
                    lastResolutionText = "";
                }
                resolutionBadge.style.display = "none";
                return;
            }
            if (cropDrag && !options.force) {
                const now = performance.now ? performance.now() : Date.now();
                if (now - lastCropBadgeAt < 80) {
                    return;
                }
                lastCropBadgeAt = now;
            }
            const text = cropMode && cropRect
                ? cropResolutionText()
                : `${Math.round(width)} x ${Math.round(height)}`;
            if (lastResolutionText !== text) {
                resolutionBadge.textContent = text;
                lastResolutionText = text;
            }
            resolutionBadge.style.display = "block";
        }

        function fitCropRectToAspect(rect, aspect) {
            const base = normalizeCropRect(rect) || defaultCropRect();
            if (!base || !aspect) return base;
            let nextW = base.w;
            let nextH = base.h;
            if (nextW / nextH > aspect) {
                nextW = nextH * aspect;
            } else {
                nextH = nextW / aspect;
            }
            if (nextW > width) {
                nextW = width;
                nextH = nextW / aspect;
            }
            if (nextH > height) {
                nextH = height;
                nextW = nextH * aspect;
            }
            return normalizeCropRect({
                x: base.x + (base.w - nextW) / 2,
                y: base.y + (base.h - nextH) / 2,
                w: nextW,
                h: nextH
            });
        }

        function refreshCropMetrics() {
            const rect = maskCanvas.getBoundingClientRect();
            const screenWidth = Math.max(1, rect.width || maskCanvas.clientWidth || stage.clientWidth || width);
            const screenHeight = Math.max(1, rect.height || maskCanvas.clientHeight || stage.clientHeight || height);
            const localWidth = Math.max(1, maskCanvas.clientWidth || stage.clientWidth || width);
            const localHeight = Math.max(1, maskCanvas.clientHeight || stage.clientHeight || height);
            cropMetrics = {
                left: rect.left,
                top: rect.top,
                width: screenWidth,
                height: screenHeight,
                scaleX: localWidth / Math.max(1, width),
                scaleY: localHeight / Math.max(1, height)
            };
            return cropMetrics;
        }

        function pointForCrop(event) {
            if (cropMetrics && Number.isFinite(cropMetrics.width) && Number.isFinite(cropMetrics.height)) {
                return {
                    x: clamp((event.clientX - cropMetrics.left) * (width / cropMetrics.width), 0, width),
                    y: clamp((event.clientY - cropMetrics.top) * (height / cropMetrics.height), 0, height)
                };
            }
            const p = point(event);
            return {
                x: clamp(p.x, 0, width),
                y: clamp(p.y, 0, height)
            };
        }

        function rectFromAnchor(anchor, pointer, aspect) {
            const start = {
                x: clamp(anchor.x, 0, width),
                y: clamp(anchor.y, 0, height)
            };
            let dx = clamp(pointer.x, 0, width) - start.x;
            let dy = clamp(pointer.y, 0, height) - start.y;
            if (aspect) {
                const signX = dx < 0 ? -1 : 1;
                const signY = dy < 0 ? -1 : 1;
                let absW = Math.max(1, Math.abs(dx));
                let absH = Math.max(1, Math.abs(dy));
                if (absW / aspect < absH) {
                    absW = absH * aspect;
                } else {
                    absH = absW / aspect;
                }
                const maxW = signX > 0 ? width - start.x : start.x;
                const maxH = signY > 0 ? height - start.y : start.y;
                if (absW > maxW) {
                    absW = maxW;
                    absH = absW / aspect;
                }
                if (absH > maxH) {
                    absH = maxH;
                    absW = absH * aspect;
                }
                dx = signX * absW;
                dy = signY * absH;
            }
            return normalizeCropRect({
                x: start.x,
                y: start.y,
                w: dx,
                h: dy
            });
        }

        function cropHandleAnchor(rect, handle) {
            const r = normalizeCropRect(rect);
            if (!r) return { x: 0, y: 0 };
            if (handle === "nw") return { x: r.x + r.w, y: r.y + r.h };
            if (handle === "ne") return { x: r.x, y: r.y + r.h };
            if (handle === "sw") return { x: r.x + r.w, y: r.y };
            return { x: r.x, y: r.y };
        }

        function updateCropOverlay(options = {}) {
            const active = !!(cropMode && hasImage && cropRect);
            if (!cropBox) return;
            cropBox.style.display = active ? "" : "none";
            updateResolutionBadge({ force: !!options.forceBadge });
            if (!active) return;
            if (options.measure !== false || !cropMetrics) {
                refreshCropMetrics();
            }
            const r = normalizeCropRect(cropRect);
            if (!r) return;
            cropRect = r;
            cropBox.style.transform = `translate3d(${r.x * cropMetrics.scaleX}px, ${r.y * cropMetrics.scaleY}px, 0)`;
            cropBox.style.width = `${r.w * cropMetrics.scaleX}px`;
            cropBox.style.height = `${r.h * cropMetrics.scaleY}px`;
        }

        function enterCropMode() {
            if (!hasImage) return false;
            if (panFloatingMode) exitPanFloating();
            cropMode = true;
            cropDrag = null;
            cropMetrics = null;
            cropRect = fitCropRectToAspect(defaultCropRect(), cropAspectRatio());
            stage.classList.remove("is-cursor-visible");
            updateStageDisplay();
            refreshToolbarState();
            return true;
        }

        function exitCropMode() {
            if (!cropMode) return false;
            cropMode = false;
            cropDrag = null;
            cropMetrics = null;
            stage.classList.remove("is-cursor-visible");
            updateStageDisplay();
            refreshToolbarState();
            return true;
        }

        function applyCrop() {
            if (!hasImage || !cropRect) return false;
            const r = normalizeCropRect(cropRect);
            if (!r) return false;
            const sx = clamp(Math.round(r.x), 0, Math.max(0, width - 1));
            const sy = clamp(Math.round(r.y), 0, Math.max(0, height - 1));
            const sw = clamp(Math.round(r.w), 1, width - sx);
            const sh = clamp(Math.round(r.h), 1, height - sy);
            if (sw < 1 || sh < 1) return false;
            if (sx === 0 && sy === 0 && sw === width && sh === height) {
                exitCropMode();
                return true;
            }

            const previousState = captureEditorState();
            if (previousState) {
                pushUndoEntry(previousState, true);
            }

            const nextBackground = document.createElement("canvas");
            const nextMask = document.createElement("canvas");
            fitCanvas(nextBackground, sw, sh);
            fitCanvas(nextMask, sw, sh);
            nextBackground.getContext("2d").drawImage(bgCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
            nextMask.getContext("2d").drawImage(maskCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

            width = sw;
            height = sh;
            fitCanvas(bgCanvas, width, height);
            fitCanvas(maskCanvas, width, height);
            bgCtx.clearRect(0, 0, width, height);
            maskCtx.clearRect(0, 0, width, height);
            bgCtx.drawImage(nextBackground, 0, 0);
            maskCtx.drawImage(nextMask, 0, 0);
            sourceImageDataUrl = bgCanvas.toDataURL("image/png");
            proxyImage.src = sourceImageDataUrl;
            nextBackground.width = 1;
            nextBackground.height = 1;
            nextMask.width = 1;
            nextMask.height = 1;
            lastPayload = null;
            valueDirty = true;
            try {
                delete root.dataset.layerforgeImageFingerprint;
            } catch {
            }
            cropRect = defaultCropRect();
            exitCropMode();
            if (fullscreenMode) {
                fitFullscreenStage();
            } else {
                updateStageDisplay();
            }
            serialize({ change: true });
            refreshToolbarState();
            return true;
        }

        function updateCropDrag(event) {
            if (!cropDrag) return;
            event.preventDefault();
            event.stopPropagation();
            const p = pointForCrop(event);
            if (cropDrag.kind === "move") {
                const dx = p.x - cropDrag.startPoint.x;
                const dy = p.y - cropDrag.startPoint.y;
                const start = cropDrag.startRect;
                cropRect = normalizeCropRect({
                    x: clamp(start.x + dx, 0, Math.max(0, width - start.w)),
                    y: clamp(start.y + dy, 0, Math.max(0, height - start.h)),
                    w: start.w,
                    h: start.h
                });
            } else {
                cropRect = rectFromAnchor(cropDrag.anchor, p, cropAspectRatio());
            }
            updateCropOverlay({ measure: false });
        }

        function updateStageDisplay() {
            if (fullscreenMode || panFloatingMode) {
                updateCropOverlay();
                return;
            }

            const availableWidth = Math.max(
                1,
                Math.floor(editor.clientWidth || root.clientWidth || stage.parentElement?.clientWidth || configuredWidth)
            );
            const imageAspect = hasImage && height ? width / height : defaultAspectRatio;
            const needsSideReserve = cropMode && hasImage && imageAspect <= 1.12;
            const cropReserve = needsSideReserve ? Math.min(148, Math.floor(availableWidth * 0.28)) : 0;
            const usableWidth = Math.max(1, availableWidth - cropReserve);
            const maxDisplayWidth = configuredWidth > 0 ? Math.min(configuredWidth, usableWidth) : usableWidth;
            const maxDisplayHeight = configuredHeight > 0 ? configuredHeight : Math.round(maxDisplayWidth / defaultAspectRatio);
            editor.style.minHeight = cropMode && hasImage ? `${configuredHeight}px` : "";
            stage.style.margin = "";

            if (!hasImage || !width || !height) {
                const emptyWidth = Math.max(1, maxDisplayWidth);
                const emptyHeight = Math.max(180, Math.min(maxDisplayHeight, Math.round(emptyWidth / defaultAspectRatio)));
                stage.style.width = `${emptyWidth}px`;
                stage.style.height = `${emptyHeight}px`;
                stage.style.minHeight = "0";
                updateCropOverlay();
                return;
            }

            let scale = Math.min(1, maxDisplayWidth / width, maxDisplayHeight / height);

            const displayWidth = Math.max(1, Math.round(width * scale));
            const displayHeight = Math.max(1, Math.round(height * scale));
            if (cropMode && hasImage) {
                const availableHeight = Math.max(
                    displayHeight,
                    configuredHeight,
                    Math.floor(editor.clientHeight || 0)
                );
                const verticalMargin = Math.max(0, Math.floor((availableHeight - displayHeight) / 2));
                stage.style.margin = `${verticalMargin}px auto`;
            }
            stage.style.width = `${displayWidth}px`;
            stage.style.height = `${displayHeight}px`;
            stage.style.minHeight = "0";
            applyViewportTransform();
            updateCropOverlay();
        }

        function applyViewportTransform() {
            if (!fullscreenMode) {
                editor.style.transform = "";
                if (viewportScale === 1 && viewportPanX === 0 && viewportPanY === 0) {
                    stage.style.transform = "";
                } else {
                    stage.style.transform = `translate(${viewportPanX}px, ${viewportPanY}px) scale(${viewportScale})`;
                }
                return;
            }
            editor.style.transform = "";
            stage.style.transform = `translate(${viewportPanX}px, ${viewportPanY}px) scale(${viewportScale})`;
        }

        function moveEditorToBody() {
            if (editor.parentElement === document.body) return;
            originalParent = editor.parentElement;
            originalNextSibling = editor.nextSibling;
            fullscreenPlaceholder = document.createComment("simpai-sketch-viewport-placeholder");
            if (originalParent) {
                originalParent.insertBefore(fullscreenPlaceholder, editor);
            }
            document.body.appendChild(editor);
        }

        function restoreEditorFromBody() {
            if (fullscreenPlaceholder?.parentNode && originalParent) {
                originalParent.insertBefore(editor, fullscreenPlaceholder);
                fullscreenPlaceholder.remove();
            } else if (originalParent) {
                originalParent.insertBefore(editor, originalNextSibling);
            }
            fullscreenPlaceholder = null;
            originalParent = null;
            originalNextSibling = null;
        }

        function fitFullscreenStage() {
            if (!fullscreenMode || !width || !height) return;
            const availableWidth = Math.max(1, window.innerWidth - 32);
            const availableHeight = Math.max(1, window.innerHeight - 32);
            viewportScale = Math.min(availableWidth / width, availableHeight / height);
            viewportPanX = Math.round((window.innerWidth - width * viewportScale) / 2);
            viewportPanY = Math.round((window.innerHeight - height * viewportScale) / 2);
            stage.style.width = `${width}px`;
            stage.style.height = `${height}px`;
            stage.style.minHeight = "0";
            applyViewportTransform();
            updateCropOverlay();
        }

        function enterFullscreen() {
            if (fullscreenMode) return true;
            if (panFloatingMode) exitPanFloating();
            setActiveSketch(api);
            fullscreenMode = true;
            moveEditorToBody();
            editor.classList.add("simpai-sketch--fullscreen");
            document.body.classList.add("simpai-sketch-fullscreen-active");
            fitFullscreenStage();
            return true;
        }

        function exitFullscreen(options = {}) {
            if (!fullscreenMode) return false;
            fullscreenMode = false;
            editor.classList.remove("simpai-sketch--fullscreen");
            document.body.classList.remove("simpai-sketch-fullscreen-active");
            restoreEditorFromBody();
            resetViewport();
            if (options.keepHotkey === true) {
                pointerInsideEditor = true;
                setActiveSketch(api);
            } else if (isActiveSketch(api)) {
                pointerInsideEditor = false;
                clearActiveSketch(api);
            } else {
                pointerInsideEditor = false;
            }
            editor.style.transform = "";
            updateStageDisplay();
            return true;
        }

        function toggleFullscreen() {
            return fullscreenMode ? exitFullscreen() : enterFullscreen();
        }

        function enterPanFloating() {
            if (fullscreenMode) {
                beginPanGesture();
                return true;
            }
            if (panFloatingMode) return true;
            setActiveSketch(api);
            panFloatingMode = true;
            beginPanGesture();
            editor.classList.add("simpai-sketch--pan-floating");
            applyViewportTransform();
            return true;
        }

        function exitPanFloating(options = {}) {
            if (!panFloatingMode) return false;
            panFloatingMode = false;
            endPanGesture();
            editor.classList.remove("simpai-sketch--pan-floating");
            if (options.keepHotkey === true) {
                pointerInsideEditor = true;
                setActiveSketch(api);
            } else if (isActiveSketch(api)) {
                pointerInsideEditor = false;
                clearActiveSketch(api);
            } else {
                pointerInsideEditor = false;
            }
            viewportBaseWidth = 0;
            viewportBaseHeight = 0;
            editor.style.width = "";
            editor.style.height = "";
            editor.style.transform = "";
            applyViewportTransform();
            return true;
        }

        function releaseTransientState(options = {}) {
            drawing = false;
            panGestureMode = false;
            editor.classList.remove("is-drawing");
            stage.classList.remove("is-cursor-visible");
            if (panFloatingMode) {
                panFloatingMode = false;
                editor.classList.remove("simpai-sketch--pan-floating");
                viewportBaseWidth = 0;
                viewportBaseHeight = 0;
                editor.style.width = "";
                editor.style.height = "";
                editor.style.transform = "";
                applyViewportTransform();
            }
            if (fullscreenMode && options.keepFullscreen !== true) {
                fullscreenMode = false;
                editor.classList.remove("simpai-sketch--fullscreen");
                document.body.classList.remove("simpai-sketch-fullscreen-active");
                restoreEditorFromBody();
                editor.style.transform = "";
                resetViewport();
                updateStageDisplay();
            }
            pointerInsideEditor = false;
            return true;
        }

        function beginPanGesture() {
            panGestureMode = true;
            stage.classList.remove("is-cursor-visible");
            editor.classList.add("is-panning");
        }

        function endPanGesture() {
            panGestureMode = false;
            editor.classList.remove("is-panning");
        }

        function panFullscreen(deltaX, deltaY) {
            if (!hasImage) return false;
            if (Math.abs(deltaX) > 100 || Math.abs(deltaY) > 100) return false;
            viewportPanX += deltaX;
            viewportPanY += deltaY;
            applyViewportTransform();
            return true;
        }

        function zoomViewport(deltaY, clientX, clientY) {
            if (!hasImage) return false;
            const currentScale = viewportScale || 1;
            let delta = 0.2;
            if (currentScale > 7) delta = 0.9;
            else if (currentScale > 2) delta = 0.6;
            const nextScale = Math.max(0.1, Math.min(15, currentScale + (deltaY < 0 ? delta : -delta)));
            const rect = stage.getBoundingClientRect();
            const x = clientX - rect.left;
            const y = clientY - rect.top;
            viewportPanX += x - (x * nextScale) / currentScale;
            viewportPanY += y - (y * nextScale) / currentScale;
            viewportScale = nextScale;
            applyViewportTransform();
            return true;
        }

        function resetViewport() {
            viewportPanX = 0;
            viewportPanY = 0;
            viewportScale = 1;
            stage.style.transform = "";
            updateCropOverlay();
        }

        function resize(widthIn, heightIn) {
            width = Math.max(1, widthIn);
            height = Math.max(1, heightIn);
            fitCanvas(bgCanvas, width, height);
            fitCanvas(maskCanvas, width, height);
            updateStageDisplay();
            updateCropOverlay();
        }

        let internalWrite = false;
        let lastExternalValue = input.value || "";
        let payloadSequence = 0;
        let payloadCacheSnapshot = null;
        let payloadCacheTask = null;
        let payloadCacheTaskKey = "";
        let payloadLoadFailed = false;
        let payloadLoadTask = null;

        function drawMaskImage(maskImage) {
            maskCtx.clearRect(0, 0, width, height);
            maskCtx.drawImage(maskImage, 0, 0, width, height);
            if (preserveMaskColor) return;
            try {
                const maskData = maskCtx.getImageData(0, 0, width, height);
                const data = maskData.data;
                const color = hexToRgb(colorInput.value || "#ffffff") || { r: 255, g: 255, b: 255 };
                let hasTransparency = false;
                for (let i = 3; i < data.length; i += 4) {
                    if (data[i] < 255) {
                        hasTransparency = true;
                        break;
                    }
                }
                for (let i = 0; i < data.length; i += 4) {
                    const alpha = hasTransparency ? data[i + 3] : Math.max(data[i], data[i + 1], data[i + 2]);
                    data[i] = color.r;
                    data[i + 1] = color.g;
                    data[i + 2] = color.b;
                    data[i + 3] = alpha;
                }
                maskCtx.putImageData(maskData, 0, 0);
            } catch {
            }
        }

        function buildSketchPayload() {
            return {
                image: sourceImageDataUrl || bgCanvas.toDataURL("image/png"),
                mask: maskCanvas.toDataURL("image/png"),
                width,
                height
            };
        }

        function cloneSketchPayload(payload) {
            return {
                image: payload?.image || "",
                mask: payload?.mask || "",
                width: payload?.width || 0,
                height: payload?.height || 0
            };
        }

        function payloadCacheKey(payload) {
            const image = String(payload?.image || "");
            const mask = String(payload?.mask || "");
            return [
                payload?.width || 0,
                payload?.height || 0,
                image.length,
                image.slice(0, 80),
                image.slice(-80),
                mask.length,
                mask.slice(0, 80),
                mask.slice(-80)
            ].join("|");
        }

        function sameSketchPayload(left, right) {
            return !!(left && right)
                && left.image === right.image
                && left.mask === right.mask
                && left.width === right.width
                && left.height === right.height;
        }

        function writeInputPayload(text, payload, options = {}) {
            lastPayload = payload;
            if (proxyImage.src !== payload.image) {
                proxyImage.src = payload.image;
            }
            internalWrite = true;
            setInputValue(input, text, options);
            lastExternalValue = text;
            internalWrite = false;
        }

        function cachedReferencePayload(payload) {
            if (!payloadCacheSnapshot || !sameSketchPayload(payloadCacheSnapshot.payload, payload)) return null;
            return payloadCacheSnapshot.reference || null;
        }

        function cachedReferenceText(payload) {
            const reference = cachedReferencePayload(payload);
            return reference ? JSON.stringify(reference) : "";
        }

        function rememberCachedReference(payload, result) {
            if (!result) return null;
            const reference = {
                simpai_sketch_cached: true,
                width: payload.width,
                height: payload.height
            };
            if (result.image_ref) reference.image_ref = result.image_ref;
            if (result.mask_ref) reference.mask_ref = result.mask_ref;
            if (result.image_sha256) reference.image_sha256 = result.image_sha256;
            if (result.mask_sha256) reference.mask_sha256 = result.mask_sha256;
            if (!reference.image_ref && !reference.mask_ref) return null;
            payloadCacheSnapshot = {
                payload: cloneSketchPayload(payload),
                reference
            };
            return reference;
        }

        function waitForPayloadCache(task, maxWaitMs) {
            const waitMs = Number(maxWaitMs);
            if (!task || !Number.isFinite(waitMs) || waitMs <= 0) return task;
            const startedAt = performance.now();
            return new Promise((resolve) => {
                let settled = false;
                const finish = (result, timedOut) => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timer);
                    if (timedOut) {
                        sketchPerformanceMark("sketch.cache.wait_timeout", {
                            max_wait_ms: waitMs,
                            elapsed_ms: Math.round((performance.now() - startedAt) * 10) / 10
                        });
                    }
                    resolve(result);
                };
                const timer = setTimeout(() => finish(false, true), waitMs);
                Promise.resolve(task).then(
                    (result) => finish(result, false),
                    () => finish(false, false)
                );
            });
        }

        async function ensureCachedPayload(payload, options = {}) {
            if (!payload || destroyed) return false;
            const existingText = options.refresh === true ? "" : cachedReferenceText(payload);
            if (existingText) {
                writeInputPayload(existingText, payload, options.write ? options : { change: false });
                return true;
            }
            const key = payloadCacheKey(payload);
            if (payloadCacheTask && payloadCacheTaskKey === key) {
                return waitForPayloadCache(payloadCacheTask, options.maxWaitMs);
            }
            payloadCacheTaskKey = key;
            payloadCacheTask = postSketchCachePayload(payload)
                .then((result) => {
                    if (destroyed) return false;
                    const reference = rememberCachedReference(payload, result);
                    if (!reference) return false;
                    if (sameSketchPayload(lastPayload, payload)) {
                        writeInputPayload(JSON.stringify(reference), payload, { change: false });
                    }
                    return true;
                })
                .catch((err) => {
                    console.warn("[SimpAI Sketch] Payload cache failed", err);
                    return false;
                })
                .finally(() => {
                    if (payloadCacheTaskKey === key) {
                        payloadCacheTask = null;
                        payloadCacheTaskKey = "";
                    }
                });
            return waitForPayloadCache(payloadCacheTask, options.maxWaitMs);
        }

        function serialize(options = {}) {
            if (destroyed) return;
            if (serializeTimer) {
                clearTimeout(serializeTimer);
                serializeTimer = null;
            }
            valueDirty = false;
            if (!hasImage) {
                lastPayload = null;
                internalWrite = true;
                setInputValue(input, "", options);
                lastExternalValue = "";
                internalWrite = false;
                return;
            }
            const payload = buildSketchPayload();
            writeInputPayload(cachedReferenceText(payload) || JSON.stringify(payload), payload, options);
            if (!cachedReferencePayload(payload)) {
                ensureCachedPayload(payload);
            }
        }

        function markDirty() {
            payloadLoadFailed = false;
            valueDirty = true;
            lastPayload = null;
            if (serializeTimer) {
                clearTimeout(serializeTimer);
                serializeTimer = null;
            }
        }

        async function flush(options = {}) {
            if (payloadLoadTask) {
                await payloadLoadTask;
            }
            if (payloadLoadFailed) return false;
            if (!valueDirty && !options.force) {
                if (options.cache && lastPayload) {
                    return ensureCachedPayload(lastPayload, {
                        write: true,
                        maxWaitMs: options.cacheWaitMs,
                        refresh: options.refreshCache === true
                    });
                }
                return true;
            }
            serialize(options);
            if (options.cache && lastPayload) {
                return ensureCachedPayload(lastPayload, {
                    write: true,
                    maxWaitMs: options.cacheWaitMs,
                    refresh: options.refreshCache === true
                });
            }
            return true;
        }

        function clearImage(options = {}) {
            payloadSequence += 1;
            exitCropMode();
            hasImage = false;
            sourceImageDataUrl = "";
            undoStack.length = 0;
            redoStack.length = 0;
            lastPayload = null;
            payloadCacheSnapshot = null;
            bgCtx.clearRect(0, 0, width, height);
            maskCtx.clearRect(0, 0, width, height);
            proxyImage.removeAttribute("src");
            if (fileInput) {
                fileInput.value = "";
            }
            empty.style.display = "";
            updateStageDisplay();
            try {
                delete root.dataset.layerforgeLatestMask;
                delete root.dataset.layerforgeLatestMaskAt;
                delete root.dataset.layerforgeImageFingerprint;
                delete root.dataset.layerforgeActive;
            } catch {
            }
            serialize(options);
            refreshToolbarState();
        }

        async function applyPayload(text) {
            const sequence = ++payloadSequence;
            if (!text) {
                if (!hasImage) {
                    lastPayload = null;
                    lastExternalValue = "";
                    return false;
                }
                clearImage({ change: false });
                return false;
            }
            exitCropMode();
            let payload;
            try {
                payload = JSON.parse(text);
            } catch (_) {
                return false;
            }
            if (!payload || (!payload.image && !payload.mask && !payload.image_ref && !payload.mask_ref)) return false;

            let cachedReference = null;
            if (payload.image_ref || payload.mask_ref) {
                cachedReference = {
                    simpai_sketch_cached: true,
                    width: payload.width,
                    height: payload.height,
                    image_ref: payload.image_ref || "",
                    mask_ref: payload.mask_ref || "",
                    image_sha256: payload.image_sha256 || "",
                    mask_sha256: payload.mask_sha256 || ""
                };
                const resolved = await resolveSketchCachePayload(payload);
                if (sequence !== payloadSequence) return false;
                if (!resolved || (!resolved.image && !resolved.mask)) {
                    payloadLoadFailed = true;
                    console.warn("[SimpAI Sketch] Cached payload could not be restored");
                    return false;
                }
                payload = Object.assign({}, payload, resolved);
            }

            try {
                const imageSource = payload.image || payload.mask;
                const img = await loadImage(imageSource);
                if (sequence !== payloadSequence) return false;
                hasImage = true;
                resize(img.naturalWidth || img.width || width, img.naturalHeight || img.height || height);
                bgCtx.clearRect(0, 0, width, height);
                maskCtx.clearRect(0, 0, width, height);
                if (payload.image) {
                    const image = payload.image === imageSource ? img : await loadImage(payload.image);
                    if (sequence !== payloadSequence) return false;
                    bgCtx.drawImage(image, 0, 0, width, height);
                    proxyImage.src = payload.image;
                    sourceImageDataUrl = payload.image;
                } else {
                    proxyImage.removeAttribute("src");
                    sourceImageDataUrl = "";
                }
                if (payload.mask) {
                    const mask = payload.mask === imageSource ? img : await loadImage(payload.mask);
                    if (sequence !== payloadSequence) return false;
                    drawMaskImage(mask);
                }
            } catch (err) {
                if (sequence === payloadSequence) {
                    payloadLoadFailed = true;
                    console.warn("[SimpAI Sketch] Payload image load failed", err);
                }
                return false;
            }
            undoStack.length = 0;
            redoStack.length = 0;
            lastPayload = {
                image: payload.image || sourceImageDataUrl,
                mask: payload.mask || "",
                width,
                height
            };
            payloadCacheSnapshot = cachedReference ? {
                payload: cloneSketchPayload(lastPayload),
                reference: cachedReference
            } : null;
            payloadLoadFailed = false;
            valueDirty = false;
            empty.style.display = "none";
            updateStageDisplay();
            refreshToolbarState();
            return true;
        }

        function setPayload(text) {
            const task = applyPayload(text);
            payloadLoadTask = task;
            const clearPayloadLoadTask = () => {
                if (payloadLoadTask === task) payloadLoadTask = null;
            };
            task.then(clearPayloadLoadTask, clearPayloadLoadTask);
            return task;
        }

        async function openImageDataUrl(dataUrl, options = {}) {
            if (!dataUrl) return false;
            const sequence = ++payloadSequence;
            try {
                exitCropMode();
                const img = await loadImage(dataUrl);
                if (sequence !== payloadSequence) return false;
                hasImage = true;
                resize(img.naturalWidth || img.width, img.naturalHeight || img.height);
                bgCtx.clearRect(0, 0, width, height);
                maskCtx.clearRect(0, 0, width, height);
                bgCtx.drawImage(img, 0, 0, width, height);
                proxyImage.src = dataUrl;
                sourceImageDataUrl = dataUrl;
                undoStack.length = 0;
                redoStack.length = 0;
                payloadCacheSnapshot = null;
                payloadLoadFailed = false;
                empty.style.display = "none";
                updateStageDisplay();
                serialize({ change: options.change !== false });
                refreshToolbarState();
                return true;
            } catch (err) {
                console.warn("[SimpAI Sketch] Image load failed", err);
                return false;
            }
        }

        async function openImageSource(source, options = {}) {
            try {
                const dataUrl = await imageSourceToDataUrl(source);
                return await openImageDataUrl(dataUrl, options);
            } catch (err) {
                console.warn("[SimpAI Sketch] Dropped image source failed", err);
                return false;
            }
        }

        async function openFile(file, options = {}) {
            if (!file) return false;
            try {
                const dataUrl = await readBlobAsDataUrl(file);
                return await openImageDataUrl(dataUrl, options);
            } catch (err) {
                console.warn("[SimpAI Sketch] Dropped image file failed", err);
                return false;
            }
        }

        async function openDroppedImage(transfer) {
            if (!transfer) return false;
            const imageFile = firstImageFile(transfer.files);
            if (imageFile && await openFile(imageFile)) return true;
            const fileItems = Array.from(transfer.items || [])
                .filter((item) => item?.kind === "file")
                .map((item) => item.getAsFile?.())
                .filter(Boolean);
            const itemFile = firstImageFile(fileItems);
            if (itemFile && await openFile(itemFile)) return true;
            const source = firstTransferUrl(transfer);
            return source ? openImageSource(source) : false;
        }

        async function pasteClipboardImage() {
            try {
                if (!navigator.clipboard || typeof navigator.clipboard.read !== "function") return false;
                const items = await navigator.clipboard.read();
                for (const item of items) {
                    const imageType = item.types.find((type) => type.startsWith("image/"));
                    if (!imageType) continue;
                    const blob = await item.getType(imageType);
                    await openFile(blob);
                    return true;
                }
            } catch {
                return false;
            }
            return false;
        }

        function point(event) {
            const clientWidth = Math.max(1, maskCanvas.clientWidth || maskCanvas.getBoundingClientRect().width || width);
            const clientHeight = Math.max(1, maskCanvas.clientHeight || maskCanvas.getBoundingClientRect().height || height);
            if (
                event &&
                event.target === maskCanvas &&
                Number.isFinite(event.offsetX) &&
                Number.isFinite(event.offsetY)
            ) {
                return {
                    x: event.offsetX * (width / clientWidth),
                    y: event.offsetY * (height / clientHeight)
                };
            }
            const rect = maskCanvas.getBoundingClientRect();
            return {
                x: (event.clientX - rect.left) * (width / rect.width),
                y: (event.clientY - rect.top) * (height / rect.height)
            };
        }

        function updateBrushCursor(event) {
            if (!brushCursor) return;
            if (maskDisabled) {
                brushCursor.style.transform = "translate(-9999px, -9999px)";
                stage.classList.remove("is-cursor-visible");
                return;
            }
            const localScaleX = Math.max(0.0001, (maskCanvas.clientWidth || width) / Math.max(1, width));
            const localScaleY = Math.max(0.0001, (maskCanvas.clientHeight || height) / Math.max(1, height));
            const localSize = Math.max(2, Number(sizeInput.value || DEFAULT_BRUSH_SIZE) * Math.max(localScaleX, localScaleY));
            brushCursor.style.width = `${localSize}px`;
            brushCursor.style.height = `${localSize}px`;
            brushCursor.style.borderStyle = mode === "eraser" ? "dashed" : "solid";
            if (!event) return;
            const p = point(event);
            const x = p.x * localScaleX;
            const y = p.y * localScaleY;
            brushCursor.style.transform = `translate(${x - localSize / 2}px, ${y - localSize / 2}px)`;
        }

        function draw(event) {
            if (maskDisabled) return;
            if (!drawing || !hasImage) return;
            const p = point(event);
            maskCtx.lineTo(p.x, p.y);
            maskCtx.save();
            maskCtx.lineCap = "round";
            maskCtx.lineJoin = "round";
            maskCtx.lineWidth = Number(sizeInput.value || DEFAULT_BRUSH_SIZE);
            if (mode === "eraser") {
                maskCtx.globalCompositeOperation = "destination-out";
                maskCtx.strokeStyle = "rgba(0,0,0,1)";
            } else {
                maskCtx.globalCompositeOperation = "source-over";
                maskCtx.strokeStyle = colorInput.value || "#ffffff";
            }
            maskCtx.stroke();
            maskCtx.restore();
            maskCtx.beginPath();
            maskCtx.moveTo(p.x, p.y);
        }

        function dot(event) {
            if (maskDisabled) return;
            if (!hasImage) return;
            const p = point(event);
            const radius = Math.max(1, Number(sizeInput.value || DEFAULT_BRUSH_SIZE) / 2);
            maskCtx.save();
            maskCtx.beginPath();
            maskCtx.arc(p.x, p.y, radius, 0, Math.PI * 2);
            if (mode === "eraser") {
                maskCtx.globalCompositeOperation = "destination-out";
                maskCtx.fillStyle = "rgba(0,0,0,1)";
            } else {
                maskCtx.globalCompositeOperation = "source-over";
                maskCtx.fillStyle = colorInput.value || "#ffffff";
            }
            maskCtx.fill();
            maskCtx.closePath();
            maskCtx.restore();
        }

        function consumeSketchPaintEvent(event, options = {}) {
            if (!event) return;
            try {
                if (event.cancelable !== false) event.preventDefault();
            } catch (e) {}
            try { event.stopPropagation(); } catch (e) {}
            if (options.immediate) {
                try { event.stopImmediatePropagation(); } catch (e) {}
            }
        }

        editor.querySelector("button[data-action='upload']").addEventListener("click", () => fileInput.click());
        editor.querySelector("button[data-action='paste']")?.addEventListener("click", () => {
            pasteClipboardImage();
        });
        if (controls) {
            ["click", "pointerdown", "pointermove", "pointerup", "wheel"].forEach((eventName) => {
                controls.addEventListener(eventName, (event) => {
                    if (event.target?.closest?.(".simpai-sketch__group, .simpai-sketch__file")) {
                        event.stopPropagation();
                    }
                }, { passive: eventName !== "wheel" });
            });
        }
        if (cropPanel) {
            ["click", "pointerdown", "pointermove", "pointerup", "wheel"].forEach((eventName) => {
                cropPanel.addEventListener(eventName, (event) => {
                    event.stopPropagation();
                }, { passive: eventName !== "wheel" });
            });
        }
        cropButton?.addEventListener("click", () => {
            if (cropMode) {
                exitCropMode();
            } else {
                enterCropMode();
            }
        });
        cropApplyButton?.addEventListener("click", applyCrop);
        cropCancelButton?.addEventListener("click", exitCropMode);
        cropAspectSelect?.addEventListener("change", () => {
            if (!cropMode || !hasImage) return;
            cropRect = fitCropRectToAspect(defaultCropRect(), cropAspectRatio());
            updateCropOverlay();
            refreshToolbarState();
        });
        cropOverlay?.addEventListener("pointerdown", (event) => {
            if (!cropMode || !hasImage) return;
            event.preventDefault();
            event.stopPropagation();
            refreshCropMetrics();
            const p = pointForCrop(event);
            const current = normalizeCropRect(cropRect) || defaultCropRect();
            const handle = event.target?.dataset?.handle || "";
            if (handle) {
                cropDrag = {
                    kind: "resize",
                    anchor: cropHandleAnchor(current, handle),
                    startRect: current
                };
            } else if (event.target?.closest?.("[data-role='crop-box']")) {
                cropDrag = {
                    kind: "move",
                    startPoint: p,
                    startRect: current
                };
            } else {
                cropDrag = {
                    kind: "new",
                    anchor: p,
                    startRect: current
                };
                cropRect = normalizeCropRect({ x: p.x, y: p.y, w: 2, h: 2 });
            }
            cropOverlay.setPointerCapture(event.pointerId);
            updateCropDrag(event);
        });
        cropOverlay?.addEventListener("pointermove", updateCropDrag);
        const finishCropDrag = (event) => {
            if (!cropDrag) return;
            event.preventDefault();
            event.stopPropagation();
            try {
                cropOverlay.releasePointerCapture(event.pointerId);
            } catch {
            }
            cropDrag = null;
            updateCropOverlay({ measure: false, forceBadge: true });
            refreshToolbarState();
        };
        cropOverlay?.addEventListener("pointerup", finishCropDrag);
        cropOverlay?.addEventListener("pointercancel", finishCropDrag);
        undoButton.addEventListener("click", async () => {
            await undoMask();
            refreshToolbarState();
        });
        redoButton.addEventListener("click", async () => {
            await redoMask();
            refreshToolbarState();
        });
        sizeInput.addEventListener("input", refreshToolbarState);
        function eventMayContainImage(event) {
            return transferMayContainImage(event.dataTransfer);
        }

        fileInput.addEventListener("change", () => openFile(fileInput.files && fileInput.files[0]));
        editor.addEventListener("dragenter", (event) => {
            if (!eventMayContainImage(event)) return;
            event.preventDefault();
            stage.classList.add("is-drag-over");
        });
        editor.addEventListener("dragover", (event) => {
            if (!eventMayContainImage(event)) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
            stage.classList.add("is-drag-over");
        });
        editor.addEventListener("dragleave", (event) => {
            if (editor.contains(event.relatedTarget)) return;
            stage.classList.remove("is-drag-over");
        });
        editor.addEventListener("drop", async (event) => {
            if (!eventMayContainImage(event)) return;
            event.preventDefault();
            event.stopPropagation();
            stage.classList.remove("is-drag-over");
            await openDroppedImage(event.dataTransfer);
        });
        editor.addEventListener("dragstart", (event) => {
            if (!drawing && !event.target?.closest?.(".simpai-sketch__stage")) return;
            consumeSketchPaintEvent(event, { immediate: true });
            try {
                if (event.dataTransfer) event.dataTransfer.effectAllowed = "none";
            } catch (e) {}
        }, true);
        stage.addEventListener("click", () => {
            if (!hasImage) fileInput.click();
        });
        brushButton.addEventListener("click", () => {
            if (maskDisabled) return;
            mode = "brush";
            brushButton.classList.add("active");
            eraserButton.classList.remove("active");
            refreshToolbarState();
        });
        eraserButton.addEventListener("click", () => {
            if (maskDisabled) return;
            mode = "eraser";
            eraserButton.classList.add("active");
            brushButton.classList.remove("active");
            refreshToolbarState();
        });
        editor.querySelector("button[data-action='clear']").addEventListener("click", () => {
            if (maskDisabled) return;
            pushUndoState(true, true);
            clearMaskPixels();
            serialize();
            refreshToolbarState();
        });
        clearImageButton.addEventListener("click", () => {
            clearImage({ change: true });
        });
        const eventTargetInsideEditor = (event) => {
            const target = event?.target;
            return !!(target && (target === root || target === editor || root.contains(target) || editor.contains(target)));
        };
        let lastVisibilityCheckAt = 0;
        let lastVisibilityResult = true;
        const isSketchVisible = () => {
            if (!root.isConnected || !editor.isConnected) {
                lastVisibilityResult = false;
                lastVisibilityCheckAt = Date.now();
                return false;
            }
            if (fullscreenMode) {
                lastVisibilityResult = true;
                lastVisibilityCheckAt = Date.now();
                return true;
            }
            const now = Date.now();
            if (now - lastVisibilityCheckAt < 180) return lastVisibilityResult;
            let visible = true;
            try {
                const rootStyle = window.getComputedStyle(root);
                const editorStyle = window.getComputedStyle(editor);
                if (rootStyle.display === "none" || editorStyle.display === "none") visible = false;
                if (rootStyle.visibility === "hidden" || editorStyle.visibility === "hidden") visible = false;
            } catch {
            }
            if (visible) visible = root.getClientRects().length > 0 && editor.getClientRects().length > 0;
            lastVisibilityCheckAt = now;
            lastVisibilityResult = visible;
            return visible;
        };
        const isSketchHotkeyActive = (event) => {
            if (!isSketchVisible()) {
                releaseTransientState();
                if (isActiveSketch(api)) clearActiveSketch(api);
                return false;
            }
            if ((fullscreenMode || panFloatingMode || panGestureMode) && !isActiveSketch(api)) {
                releaseTransientState();
                return false;
            }
            return isActiveSketch(api) || eventTargetInsideEditor(event);
        };
        const markPointerInside = () => {
            pointerInsideEditor = true;
            setActiveSketch(api);
        };
        editor.addEventListener("pointerenter", markPointerInside);
        editor.addEventListener("pointerdown", markPointerInside, true);
        editor.addEventListener("focusin", markPointerInside);
        editor.addEventListener("pointerleave", () => {
            if (!fullscreenMode && !panFloatingMode) {
                pointerInsideEditor = false;
                if (isActiveSketch(api)) {
                    setActiveSketch(null);
                }
            }
        });
        stage.addEventListener("wheel", (event) => {
            if (!hasImage) return;
            markPointerInside();
            if (event.ctrlKey && !maskDisabled) {
                event.preventDefault();
                event.stopPropagation();
                adjustBrushSize(event.deltaY);
                return;
            }
            if (event.shiftKey) {
                event.preventDefault();
                event.stopPropagation();
                zoomViewport(event.deltaY, event.clientX, event.clientY);
            }
        }, { passive: false });
        maskCanvas.addEventListener("pointerdown", (event) => {
            if (maskDisabled || cropMode || panGestureMode || panFloatingMode) return;
            if (!hasImage) return;
            if (event.isPrimary === false) return;
            if (typeof event.button === "number" && event.button !== 0) return;
            consumeSketchPaintEvent(event, { immediate: true });
            editor.classList.add("is-drawing");
            updateBrushCursor(event);
            pushUndoState(true, true);
            drawing = true;
            try { maskCanvas.setPointerCapture(event.pointerId); } catch (e) {}
            const p = point(event);
            maskCtx.beginPath();
            maskCtx.moveTo(p.x, p.y);
            dot(event);
            maskCtx.beginPath();
            maskCtx.moveTo(p.x, p.y);
        });
        maskCanvas.addEventListener("pointermove", (event) => {
            if (maskDisabled || cropMode || panGestureMode || panFloatingMode) return;
            if (drawing) consumeSketchPaintEvent(event);
            if (hasImage) {
                stage.classList.add("is-cursor-visible");
                updateBrushCursor(event);
            }
            draw(event);
        });
        maskCanvas.addEventListener("pointerenter", (event) => {
            if (maskDisabled || cropMode || panGestureMode || panFloatingMode) return;
            if (!hasImage) return;
            stage.classList.add("is-cursor-visible");
            updateBrushCursor(event);
        });
        maskCanvas.addEventListener("pointerleave", () => {
            if (drawing) return;
            stage.classList.remove("is-cursor-visible");
        });
        maskCanvas.addEventListener("pointerup", (event) => {
            if (!drawing) return;
            consumeSketchPaintEvent(event, { immediate: true });
            try { maskCanvas.releasePointerCapture(event.pointerId); } catch (e) {}
            drawing = false;
            editor.classList.remove("is-drawing");
            stage.classList.remove("is-cursor-visible");
            maskCtx.closePath();
            maskCtx.globalCompositeOperation = "source-over";
            markDirty();
            refreshToolbarState();
        });
        maskCanvas.addEventListener("pointercancel", (event) => {
            if (drawing) consumeSketchPaintEvent(event, { immediate: true });
            try { maskCanvas.releasePointerCapture(event.pointerId); } catch (e) {}
            drawing = false;
            editor.classList.remove("is-drawing");
            stage.classList.remove("is-cursor-visible");
            maskCtx.closePath();
            maskCtx.globalCompositeOperation = "source-over";
        });

        const maskDisabledObserver = new MutationObserver(() => {
            setMaskDisabled(root.dataset.simpaiMaskDisabled === "1", { change: true });
        });
        maskDisabledObserver.observe(root, { attributes: true, attributeFilter: ["data-simpai-mask-disabled"] });

        const syncExternalInput = () => {
            if (destroyed || internalWrite || !input.isConnected) return false;
            const nextValue = input.value || "";
            if (nextValue === lastExternalValue) return false;
            lastExternalValue = nextValue;
            setPayload(nextValue);
            return true;
        };
        const observer = new MutationObserver(syncExternalInput);
        observer.observe(input, { attributes: true, attributeFilter: ["value"] });
        addLifecycleListener(input, "input", syncExternalInput);
        addLifecycleListener(input, "change", syncExternalInput);
        setPayload(input.value);

        if (typeof ResizeObserver !== "undefined") {
            resizeObserver = new ResizeObserver(() => {
                if (fullscreenMode || panFloatingMode) return;
                if (resizeFrame) return;
                resizeFrame = requestAnimationFrame(() => {
                    resizeFrame = null;
                    updateStageDisplay();
                });
            });
            resizeObserver.observe(editor);
        } else {
            addLifecycleListener(window, "resize", updateStageDisplay);
        }
        addLifecycleListener(window, "resize", fitFullscreenStage);
        addLifecycleListener(document, "mousemove", (event) => {
            if (!panGestureMode && !panFloatingMode) return;
            panFullscreen(event.movementX || 0, event.movementY || 0);
        }, true);
        addLifecycleListener(document, "pointerdown", (event) => {
            if (eventTargetInsideEditor(event)) return;
            if (panFloatingMode || panGestureMode) releaseTransientState();
        }, true);
        addLifecycleListener(window, "blur", () => releaseTransientState());
        addLifecycleListener(document, "visibilitychange", () => {
            if (document.hidden) releaseTransientState();
        });
        const handleDocumentKeyDown = (event) => {
            if (document.querySelector?.(".sai-h3sb-modal")) return;
            const historyAction = sketchHistoryHotkey(event);
            if (eventTargetInsideEditor(event)) {
                markPointerInside();
            }
            const sketchHotkeyActive = isSketchHotkeyActive(event);
            const wantsSketchHotkey = cropMode
                ? sketchHotkeyActive
                : fullscreenMode
                || panFloatingMode
                || (historyAction && hasImage && (pointerInsideEditor || event.target?.closest?.(".simpai-sketch")))
                || ((event.code === "KeyS" || event.code === "KeyF" || event.code === "KeyQ") && sketchHotkeyActive && pointerInsideEditor && hasImage);
            if (!wantsSketchHotkey) return;
            if (shouldHandleSketchHistoryHotkey(event, historyAction)) {
                event.preventDefault();
                event.stopImmediatePropagation();
                runSketchHistoryHotkey(historyAction);
                return;
            }
            if (event.ctrlKey || event.metaKey || event.altKey) return;
            if (event.code === "KeyQ") {
                event.preventDefault();
                event.stopImmediatePropagation();
                toggleUi();
                return;
            }
            if (cropMode && event.code === "Escape") {
                event.preventDefault();
                event.stopImmediatePropagation();
                exitCropMode();
                return;
            }
            if (cropMode && (event.code === "KeyS" || event.code === "KeyF")) {
                return;
            }
            if (event.code === "KeyR" || event.code === "Escape") {
                event.preventDefault();
                exitFullscreen();
                exitPanFloating();
                resetViewport();
                return;
            }
            if (event.code === "KeyS" && fullscreenMode) {
                event.preventDefault();
                event.stopImmediatePropagation();
                exitFullscreen({ keepHotkey: true });
                resetViewport();
                return;
            }
            if (event.code === "KeyS" && pointerInsideEditor && hasImage) {
                event.preventDefault();
                event.stopImmediatePropagation();
                enterFullscreen();
                return;
            }
            if (event.code === "KeyF") {
                event.preventDefault();
                event.stopImmediatePropagation();
                if (fullscreenMode) {
                    beginPanGesture();
                } else {
                    enterPanFloating();
                }
            }
        };
        addLifecycleListener(document, "keydown", handleDocumentKeyDown, true);
        const handleDocumentKeyUp = (event) => {
            if (event.code === "KeyF") {
                if (!isSketchHotkeyActive(event) && !panFloatingMode && !panGestureMode) return;
                event.preventDefault();
                event.stopImmediatePropagation();
                if (panFloatingMode) {
                    exitPanFloating({ keepHotkey: true });
                } else {
                    endPanGesture();
                    if (isSketchVisible()) {
                        pointerInsideEditor = true;
                        setActiveSketch(api);
                    }
                }
            }
        };
        addLifecycleListener(document, "keyup", handleDocumentKeyUp, true);

        function destroy() {
            if (destroyed) return false;
            destroyed = true;
            payloadSequence += 1;
            releaseTransientState();
            maskDisabledObserver.disconnect();
            observer.disconnect();
            resizeObserver?.disconnect();
            if (resizeFrame) {
                cancelAnimationFrame(resizeFrame);
                resizeFrame = null;
            }
            for (const listener of lifecycleListeners.splice(0)) {
                try {
                    listener.target.removeEventListener(listener.type, listener.listener, listener.options);
                } catch (error) {}
            }
            if (serializeTimer) {
                clearTimeout(serializeTimer);
                serializeTimer = null;
            }
            undoStack.length = 0;
            redoStack.length = 0;
            sourceImageDataUrl = "";
            lastPayload = null;
            payloadCacheSnapshot = null;
            payloadLoadFailed = false;
            payloadCacheTask = null;
            payloadCacheTaskKey = "";
            lastExternalValue = "";
            hasImage = false;
            proxyImage.removeAttribute("src");
            bgCanvas.width = 1;
            bgCanvas.height = 1;
            maskCanvas.width = 1;
            maskCanvas.height = 1;
            try { delete root.__simpaiSketch; } catch (error) { root.__simpaiSketch = null; }
            try { delete editor.__simpaiSketch; } catch (error) { editor.__simpaiSketch = null; }
            try { delete root.dataset.simpaiSketchReady; } catch (error) {}
            try { delete root.dataset.simpaiSketch; } catch (error) {}
            const namespace = ensureSimpAISketchNamespace();
            namespace.instances?.delete(api);
            if (namespace.active === api) clearActiveSketch(api);
            editor.remove();
            return true;
        }

        const api = {
            root,
            input,
            editor,
            fileInput,
            imageCanvas: bgCanvas,
            maskCanvas,
            getValue() {
                if (destroyed || !hasImage) return null;
                if (valueDirty || !lastPayload) {
                    flush({ force: true });
                }
                return lastPayload ? { ...lastPayload } : null;
            },
            async setValue(value, options = {}) {
                if (!value) return false;
                const image = typeof value === "string" ? value : value.image;
                const mask = typeof value === "string" ? null : value.mask;
                if (!image && !mask) return false;
                const updated = await setPayload(JSON.stringify({ image, mask }));
                if (!updated) return false;
                serialize({ change: !!options.change });
                return true;
            },
            async setImage(image, options = {}) {
                if (!image) return false;
                const updated = await setPayload(JSON.stringify({ image, mask: maskCanvas.toDataURL("image/png") }));
                if (!updated) return false;
                serialize({ change: !!options.change });
                return true;
            },
            async setMask(mask, options = {}) {
                if (maskDisabled && options.force !== true) return false;
                if (!mask || !hasImage) return false;
                if (options.history !== false) {
                    pushUndoState();
                }
                const maskImg = await loadImage(mask);
                drawMaskImage(maskImg);
                serialize({ change: !!options.change });
                refreshToolbarState();
                return true;
            },
            clearMask(options = {}) {
                pushUndoState(true, true);
                clearMaskPixels();
                serialize({ change: !!options.change });
                refreshToolbarState();
            },
            setMaskEnabled(enabled, options = {}) {
                return setMaskDisabled(!enabled, options);
            },
            setMaskDisabled,
            isMaskDisabled: () => maskDisabled,
            clearImage,
            undo: undoMask,
            redo: redoMask,
            adjustBrushSize,
            toggleFullscreen,
            enterFullscreen,
            exitFullscreen,
            panFullscreen,
            zoomViewport,
            resetViewport,
            enterPanFloating,
            exitPanFloating,
            beginPanGesture,
            endPanGesture,
            hasImage: () => hasImage,
            isFullscreen: () => fullscreenMode,
            isPanFloating: () => panFloatingMode,
            enterCropMode,
            exitCropMode,
            applyCrop,
            isCropping: () => cropMode,
            setUiHidden,
            toggleUi,
            isUiHidden: () => uiHidden,
            isVisible: isSketchVisible,
            syncExternalInput,
            releaseTransientState,
            setPointerInside(value) {
                pointerInsideEditor = !!value;
            },
            openFile,
            serialize,
            flush,
            destroy,
            isDestroyed: () => destroyed,
            isDirty: () => valueDirty
        };
        root.__simpaiSketch = api;
        editor.__simpaiSketch = api;
        refreshToolbarState();
        window.SimpAISketch = window.SimpAISketch || {};
        window.SimpAISketch.instances = window.SimpAISketch.instances || new Set();
        window.SimpAISketch.instances.add(api);
        window.SimpAISketch.get = (target) => {
            const node = typeof target === "string"
                ? (document.getElementById(target) || (typeof gradioApp === "function" ? gradioApp().getElementById(target) : null))
                : target;
            return node?.__simpaiSketch || node?.closest?.("[data-simpai-sketch='1']")?.__simpaiSketch || null;
        };
        window.SimpAISketch.getValue = (target) => window.SimpAISketch.get(target)?.getValue() || null;
        window.SimpAISketch.setValue = (target, value, options) => window.SimpAISketch.get(target)?.setValue(value, options);
        window.SimpAISketch.setImage = (target, image, options) => window.SimpAISketch.get(target)?.setImage(image, options);
        window.SimpAISketch.setMask = (target, mask, options) => window.SimpAISketch.get(target)?.setMask(mask, options);
        window.SimpAISketch.clearMask = (target, options) => window.SimpAISketch.get(target)?.clearMask(options);
        window.SimpAISketch.setMaskEnabled = (target, enabled, options) => window.SimpAISketch.get(target)?.setMaskEnabled(enabled, options);
        window.SimpAISketch.setMaskDisabled = (target, disabled, options) => window.SimpAISketch.get(target)?.setMaskDisabled(disabled, options);
        window.SimpAISketch.clearImage = (target, options) => window.SimpAISketch.get(target)?.clearImage(options);
        window.SimpAISketch.destroy = (target) => window.SimpAISketch.get(target)?.destroy();
        window.SimpAISketch.undo = (target) => window.SimpAISketch.get(target)?.undo();
        window.SimpAISketch.redo = (target) => window.SimpAISketch.get(target)?.redo();
        window.SimpAISketch.adjustBrushSize = (target, deltaY, percentage) => window.SimpAISketch.get(target)?.adjustBrushSize(deltaY, percentage);
        window.SimpAISketch.toggleFullscreen = (target) => window.SimpAISketch.get(target)?.toggleFullscreen();
        window.SimpAISketch.panFullscreen = (target, deltaX, deltaY) => window.SimpAISketch.get(target)?.panFullscreen(deltaX, deltaY);
        window.SimpAISketch.zoomViewport = (target, deltaY, clientX, clientY) => window.SimpAISketch.get(target)?.zoomViewport(deltaY, clientX, clientY);
        window.SimpAISketch.resetViewport = (target) => window.SimpAISketch.get(target)?.resetViewport();
        window.SimpAISketch.enterPanFloating = (target) => window.SimpAISketch.get(target)?.enterPanFloating();
        window.SimpAISketch.exitPanFloating = (target) => window.SimpAISketch.get(target)?.exitPanFloating();
        window.SimpAISketch.beginPanGesture = (target) => window.SimpAISketch.get(target)?.beginPanGesture();
        window.SimpAISketch.endPanGesture = (target) => window.SimpAISketch.get(target)?.endPanGesture();
        setMaskDisabled(maskDisabled, { clearMask: false, force: true, change: false });
        window.SimpAISketch.enterCropMode = (target) => window.SimpAISketch.get(target)?.enterCropMode();
        window.SimpAISketch.exitCropMode = (target) => window.SimpAISketch.get(target)?.exitCropMode();
        window.SimpAISketch.applyCrop = (target) => window.SimpAISketch.get(target)?.applyCrop();
        window.SimpAISketch.setUiHidden = (target, hidden) => window.SimpAISketch.get(target)?.setUiHidden(hidden);
        window.SimpAISketch.toggleUi = (target) => window.SimpAISketch.get(target)?.toggleUi();
        window.SimpAISketch.flush = (target, options) => window.SimpAISketch.get(target)?.flush(options);
        window.SimpAISketch.flushAll = (options) => {
            const startedAt = performance.now();
            let ok = true;
            const pending = [];
            let instanceCount = 0;
            for (const sketch of Array.from(window.SimpAISketch.instances || [])) {
                if (!sketch?.root?.isConnected || !sketch?.editor?.isConnected) {
                    sketch.destroy?.();
                    continue;
                }
                instanceCount += 1;
                try {
                    const result = sketch.flush?.(options);
                    if (result && typeof result.then === "function") {
                        pending.push(Promise.resolve(result).then(
                            (value) => {
                                if (value === false) ok = false;
                            },
                            () => {
                                ok = false;
                            }
                        ));
                    }
                } catch {
                    ok = false;
                }
            }
            if (pending.length) {
                return Promise.all(pending).then(() => {
                    sketchPerformanceMark("sketch.flush_all_finish", {
                        duration_ms: Math.round((performance.now() - startedAt) * 10) / 10,
                        instance_count: instanceCount,
                        pending_count: pending.length,
                        ok
                    });
                    return ok;
                });
            }
            sketchPerformanceMark("sketch.flush_all_finish", {
                duration_ms: Math.round((performance.now() - startedAt) * 10) / 10,
                instance_count: instanceCount,
                pending_count: 0,
                ok
            });
            return ok;
        };
        window.SimpAISketch.releaseHidden = releaseHiddenSketches;
        window.SimpAISketch.releaseAllTransientState = releaseAllSketchTransientState;
    }

    function installFlushHooks() {
        if (window.__simpaiSketchFlushHooksInstalled) return;
        window.__simpaiSketchFlushHooksInstalled = true;
        const flushFromOutsideSketch = (event) => {
            try {
                if (event?.target?.closest?.(".simpai-sketch")) return;
                window.SimpAISketch?.flushAll?.();
            } catch {
            }
        };
        document.addEventListener("pointerdown", flushFromOutsideSketch, true);
        document.addEventListener("keydown", (event) => {
            if (event.code !== "Enter") return;
            const activatesControl = event.target?.closest?.("button, [role='button'], input[type='submit']");
            if (!event.ctrlKey && !event.metaKey && !activatesControl) return;
            flushFromOutsideSketch(event);
        }, true);
    }

    function scanNode(node) {
        if (!node?.querySelectorAll) return;
        if (node.nodeType === Node.ELEMENT_NODE && node.matches?.(`.${SOURCE_CLASS}`)) {
            initRoot(node);
        }
        node.querySelectorAll(`.${SOURCE_CLASS}`).forEach(initRoot);
    }

    function scan() {
        ensureStyle();
        installFlushHooks();
        scanNode(document);
        releaseHiddenSketches();
    }

    function handleRootMutations(mutations) {
        let removed = false;
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes || []) {
                scanNode(node);
            }
            if (mutation.removedNodes?.length) removed = true;
        }
        if (removed) releaseDetachedSketches();
    }

    function boot() {
        scan();
        if (!rootObserver && document.body) {
            rootObserver = new MutationObserver(handleRootMutations);
            rootObserver.observe(document.body, { childList: true, subtree: true });
        }
        scheduleFallbackSync();
    }

    document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
            stopFallbackSync();
            releaseAllSketchTransientState();
            return;
        }
        scan();
        syncVisibleSketchInputs();
        scheduleFallbackSync();
    });

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot, { once: true });
    } else {
        boot();
    }
})();
