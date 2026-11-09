(function () {
    'use strict';

    const config = window.SimpAIStudioPerformanceConfig;
    if (!config?.enabled || window.SimpAIStudioPerformance) return;

    const MAX_BUFFER_RECORDS = 500;
    const MAX_BATCH_RECORDS = 20;
    const FLUSH_INTERVAL_MS = 1000;
    const HEARTBEAT_INTERVAL_MS = 10000;
    const EVENT_LOOP_INTERVAL_MS = 1000;
    const POST_DRAG_WINDOW_MS = 5000;
    const GENERATION_DIAGNOSTIC_WINDOW_MS = 45000;
    const SLOW_EVENT_THRESHOLD_MS = 50;
    const PASSIVE_SLOW_EVENT_NAMES = new Set([
        'pointerover', 'pointerenter', 'pointerout', 'pointerleave',
        'mouseover', 'mouseenter', 'mouseout', 'mouseleave',
    ]);
    const sessionId = createSessionId();
    const endpoint = resolveEndpoint(config.endpointPath || '/simpai/studio-performance');
    let sequence = 0;
    let records = [];
    let fetchInFlight = false;
    let transportFailures = 0;
    let lastDropAt = 0;
    let lastInteractionAt = 0;
    let diagnosticWindowUntil = 0;
    let dragSequence = 0;
    let activeDrag = null;
    let dragTargetId = '';
    let mutationObserver = null;
    let mutationReportTimer = 0;
    let mutationStopTimer = 0;
    let mutationStats = newMutationStats();
    let frameProbeRunning = false;
    let frameProbeLastAt = 0;
    let frameProbeReportAt = 0;
    let frameProbeStats = newFrameStats();
    const ignoredPassiveSlowEvents = Object.create(null);
    const privateFileNames = new Set();

    function createSessionId() {
        try {
            if (crypto?.randomUUID) return crypto.randomUUID().replace(/-/g, '');
            const values = new Uint32Array(4);
            crypto.getRandomValues(values);
            return Array.from(values, (value) => value.toString(16).padStart(8, '0')).join('');
        } catch (_) {
            return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`;
        }
    }

    function resolveEndpoint(endpointPath) {
        const path = String(endpointPath || '/simpai/studio-performance');
        if (/^https?:\/\//i.test(path)) return path;
        try {
            const scripts = Array.from(document.scripts || []);
            const ownScript = document.currentScript
                || scripts.find((script) => /(?:^|\/)studio_performance\.js(?:[?#]|$)/i.test(script.src || ''));
            const assetUrl = new URL(ownScript?.src || window.location.href, document.baseURI);
            const markers = ['/gradio_api/file=', '/file='];
            for (const marker of markers) {
                const markerIndex = assetUrl.pathname.indexOf(marker);
                if (markerIndex >= 0) {
                    const basePath = assetUrl.pathname.slice(0, markerIndex).replace(/\/$/, '');
                    return `${assetUrl.origin}${basePath}/${path.replace(/^\//, '')}`;
                }
            }
            return new URL(path, window.location.origin).href;
        } catch (_) {
            return path;
        }
    }

    function round(value, digits = 1) {
        const number = Number(value);
        if (!Number.isFinite(number)) return null;
        const factor = 10 ** digits;
        return Math.round(number * factor) / factor;
    }

    function cleanErrorText(value) {
        return redactPrivateText(value)
            .replace(/file:\/\/\/[A-Za-z]:\/[^\s)]+/gi, '[local-file]')
            .replace(/[A-Za-z]:\\[^\s)]+/g, '[local-path]')
            .slice(0, 500);
    }

    function redactPrivateText(value) {
        let result = String(value || '');
        for (const fileName of privateFileNames) {
            if (fileName) result = result.split(fileName).join('[file-name]');
        }
        return result;
    }

    function scriptLabel(value) {
        try {
            const url = new URL(String(value || ''), document.baseURI);
            const segment = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || '');
            return segment.slice(0, 160) || 'inline';
        } catch (_) {
            return String(value || '').split(/[\\/]/).pop().slice(0, 160);
        }
    }

    function fileSummary(file) {
        if (!file) return null;
        const privateName = String(file.name || '').slice(0, 260);
        if (privateName && privateFileNames.size < 50) privateFileNames.add(privateName);
        return {
            type: String(file.type || '').slice(0, 120),
            size_bytes: Number.isFinite(Number(file.size)) ? Number(file.size) : null,
            last_modified_age_ms: Number.isFinite(Number(file.lastModified))
                ? Math.max(0, Date.now() - Number(file.lastModified))
                : null,
        };
    }

    function isFileLike(value) {
        try {
            return value instanceof File || value instanceof Blob;
        } catch (_) {
            return false;
        }
    }

    function describeElement(element) {
        if (!(element instanceof Element)) return null;
        const classes = Array.from(element.classList || [])
            .filter((name) => !/^svelte-/i.test(name))
            .slice(0, 8)
            .map((name) => String(name).slice(0, 80));
        return {
            tag: String(element.tagName || '').toLowerCase(),
            id: String(element.id || '').slice(0, 160),
            role: String(element.getAttribute?.('role') || '').slice(0, 80),
            input_type: String(element.getAttribute?.('type') || '').slice(0, 40),
            classes,
        };
    }

    function sanitize(value, depth = 0, seen = new WeakSet()) {
        if (depth >= 7) return '[max-depth]';
        if (value == null || typeof value === 'boolean') return value;
        if (typeof value === 'number') return Number.isFinite(value) ? value : null;
        if (typeof value === 'string') return redactPrivateText(value).slice(0, 2048);
        if (isFileLike(value)) return fileSummary(value);
        if (value instanceof Element) return describeElement(value);
        if (value instanceof Error) {
            return {
                error_type: String(value.name || 'Error').slice(0, 100),
                message: cleanErrorText(value.message),
                stack: cleanErrorText(value.stack),
            };
        }
        if (typeof value !== 'object') return String(typeof value);
        if (seen.has(value)) return '[circular]';
        seen.add(value);
        if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitize(item, depth + 1, seen));
        const result = {};
        let count = 0;
        for (const [key, item] of Object.entries(value)) {
            if (count >= 100) {
                result._truncated = true;
                break;
            }
            const safeKey = String(key).slice(0, 128);
            if (/^(?:filename|file_name|path|url|src|href|text|content|prompt|value)$/i.test(safeKey)) {
                result[safeKey] = '[redacted]';
            } else {
                result[safeKey] = sanitize(item, depth + 1, seen);
            }
            count += 1;
        }
        return result;
    }

    function createRecord(event, data) {
        return {
            seq: sequence++,
            event: String(event || 'unknown').slice(0, 128),
            client_time: new Date().toISOString(),
            page_time_ms: round(performance.now(), 1),
            data: sanitize(data || {}),
        };
    }

    function buildPayload(batch) {
        return JSON.stringify({
            schema: Number(config.schema || 1),
            token: String(config.token || ''),
            session_id: sessionId,
            records: batch,
        });
    }

    function takeBatch() {
        return records.splice(0, Math.min(records.length, MAX_BATCH_RECORDS));
    }

    function restoreBatch(batch) {
        records = batch.concat(records).slice(-MAX_BUFFER_RECORDS);
    }

    function flushBeacon() {
        if (!endpoint || !records.length || typeof navigator.sendBeacon !== 'function') return false;
        let sentAny = false;
        let attempts = 0;
        while (records.length && attempts < 3) {
            const batch = takeBatch();
            const body = new Blob([buildPayload(batch)], { type: 'application/json' });
            if (!navigator.sendBeacon(endpoint, body)) {
                restoreBatch(batch);
                break;
            }
            sentAny = true;
            attempts += 1;
        }
        return sentAny;
    }

    async function flushFetch() {
        if (!endpoint || fetchInFlight || !records.length) return;
        const batch = takeBatch();
        fetchInFlight = true;
        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                credentials: 'same-origin',
                keepalive: true,
                headers: { 'Content-Type': 'application/json' },
                body: buildPayload(batch),
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            transportFailures = 0;
        } catch (_) {
            transportFailures += 1;
            if (transportFailures <= 3) restoreBatch(batch);
        } finally {
            fetchInFlight = false;
        }
    }

    function mark(event, data, options) {
        records.push(createRecord(event, data));
        if (records.length > MAX_BUFFER_RECORDS) records.splice(0, records.length - MAX_BUFFER_RECORDS);
        if (options?.urgent) flushBeacon();
        else if (records.length >= MAX_BATCH_RECORDS) void flushFetch();
    }

    function componentFromEvent(event) {
        const path = typeof event?.composedPath === 'function' ? event.composedPath() : [];
        const known = path.find((node) => node instanceof Element && node.id && /(?:image|video|audio|gallery|upload|canvas|metadata)/i.test(node.id));
        const withId = path.find((node) => node instanceof Element && node.id);
        const element = known || withId || (event?.target instanceof Element ? event.target : null);
        return describeElement(element);
    }

    function elementsAtEvent(event) {
        if (!Number.isFinite(event?.clientX) || !Number.isFinite(event?.clientY)) return [];
        try {
            return document.elementsFromPoint(event.clientX, event.clientY).slice(0, 6).map(describeElement).filter(Boolean);
        } catch (_) {
            return [];
        }
    }

    function transferSummary(dataTransfer) {
        if (!dataTransfer) return { present: false };
        let files = [];
        let items = [];
        let types = [];
        try {
            files = Array.from(dataTransfer.files || []).slice(0, 10).map(fileSummary);
            items = Array.from(dataTransfer.items || []).slice(0, 20).map((item) => ({
                kind: String(item?.kind || '').slice(0, 40),
                type: String(item?.type || '').slice(0, 120),
            }));
            types = Array.from(dataTransfer.types || []).slice(0, 20).map((type) => String(type).slice(0, 120));
        } catch (_) {
        }
        return {
            present: true,
            file_count: files.length,
            files,
            items,
            types,
            effect_allowed: String(dataTransfer.effectAllowed || '').slice(0, 40),
            drop_effect: String(dataTransfer.dropEffect || '').slice(0, 40),
        };
    }

    function isRelevantDrag(dataTransfer) {
        if (!dataTransfer) return false;
        try {
            if (dataTransfer.files?.length) return true;
            const items = Array.from(dataTransfer.items || []);
            if (items.some((item) => item?.kind === 'file')) return true;
            const types = Array.from(dataTransfer.types || []).map((type) => String(type).toLowerCase());
            return types.some((type) => type === 'files'
                || type.startsWith('image/')
                || type === 'text/uri-list'
                || type === 'text/html'
                || type === 'application/x-simpleai-gallery-original-url');
        } catch (_) {
            return false;
        }
    }

    function currentUiState() {
        const state = window.simpleaiTopbarSystemParams || window.topbarLastSystemParams || {};
        return {
            lang: String(state.__lang || '').slice(0, 20),
            theme: String(state.__theme || '').slice(0, 40),
            preset: String(state.__preset || '').slice(0, 160),
            task_class: String(state.task_class_name || state.__backend_engine || '').slice(0, 80),
            gallery_engine: String(state.__gallery_engine_type || state.engine_type || '').slice(0, 40),
            generating: Boolean(state.__is_generating || window.simpleaiGenerationActive),
        };
    }

    function memorySnapshot() {
        const memory = performance.memory;
        if (!memory) return { supported: false };
        return {
            supported: true,
            used_js_heap_bytes: Number(memory.usedJSHeapSize || 0),
            total_js_heap_bytes: Number(memory.totalJSHeapSize || 0),
            js_heap_limit_bytes: Number(memory.jsHeapSizeLimit || 0),
        };
    }

    function dragVisualSnapshot() {
        const selector = '.simpai-media-replacement-drag-over, .simpai-metadata-drag-over, .dragging, [class*="drag-over"], [data-dragging="true"]';
        let matches = [];
        try {
            matches = Array.from(document.querySelectorAll(selector));
        } catch (_) {
        }
        return {
            match_count: matches.length,
            matches: matches.slice(0, 12).map(describeElement).filter(Boolean),
            body_classes: Array.from(document.body?.classList || []).filter((name) => /drag/i.test(name)).slice(0, 20),
        };
    }

    function pageSnapshot(reason) {
        let domNodes = null;
        try {
            domNodes = document.getElementsByTagName('*').length;
        } catch (_) {
        }
        return {
            reason,
            visibility: document.visibilityState,
            online: navigator.onLine,
            viewport: {
                width: window.innerWidth,
                height: window.innerHeight,
                device_pixel_ratio: round(window.devicePixelRatio, 2),
            },
            dom_nodes: domNodes,
            active_element: describeElement(document.activeElement),
            memory: memorySnapshot(),
            ui: currentUiState(),
            drag: activeDrag ? dragSummary() : null,
            drag_visuals: dragVisualSnapshot(),
            ignored_passive_slow_events: { ...ignoredPassiveSlowEvents },
        };
    }

    function dragSummary() {
        if (!activeDrag) return null;
        return {
            drag_id: activeDrag.id,
            elapsed_ms: round(performance.now() - activeDrag.startedAt, 1),
            enter_count: activeDrag.enterCount,
            over_count: activeDrag.overCount,
            leave_count: activeDrag.leaveCount,
            target_change_count: activeDrag.targetChangeCount,
            max_over_gap_ms: round(activeDrag.maxOverGap, 1),
            last_target: activeDrag.lastTarget,
        };
    }

    function newMutationStats() {
        return { total: 0, child_list: 0, attributes: 0, added: 0, removed: 0, samples: [] };
    }

    function reportMutations(reason) {
        if (!mutationStats.total) return;
        mark('dom.mutations', {
            reason,
            drag_id: activeDrag?.id || null,
            window_since_drop_ms: lastDropAt ? round(performance.now() - lastDropAt, 1) : null,
            ...mutationStats,
        });
        mutationStats = newMutationStats();
    }

    function scheduleMutationReport() {
        if (mutationReportTimer) return;
        mutationReportTimer = window.setTimeout(() => {
            mutationReportTimer = 0;
            reportMutations('interval');
        }, 500);
    }

    function startMutationProbe() {
        if (mutationStopTimer) {
            window.clearTimeout(mutationStopTimer);
            mutationStopTimer = 0;
        }
        if (mutationObserver || !document.body) return;
        mutationStats = newMutationStats();
        mutationObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                mutationStats.total += 1;
                if (mutation.type === 'childList') {
                    mutationStats.child_list += 1;
                    mutationStats.added += mutation.addedNodes?.length || 0;
                    mutationStats.removed += mutation.removedNodes?.length || 0;
                } else if (mutation.type === 'attributes') {
                    mutationStats.attributes += 1;
                }
                if (mutationStats.samples.length < 8) {
                    mutationStats.samples.push({
                        type: mutation.type,
                        attribute: String(mutation.attributeName || '').slice(0, 80),
                        target: describeElement(mutation.target),
                    });
                }
            }
            scheduleMutationReport();
        });
        mutationObserver.observe(document.body, { childList: true, subtree: true, attributes: true });
    }

    function stopMutationProbeLater() {
        if (!mutationObserver) return;
        if (mutationStopTimer) window.clearTimeout(mutationStopTimer);
        mutationStopTimer = window.setTimeout(() => {
            reportMutations('final');
            mutationObserver?.disconnect();
            mutationObserver = null;
            mutationStopTimer = 0;
        }, POST_DRAG_WINDOW_MS);
    }

    function newFrameStats() {
        return { frames: 0, slow_50ms: 0, slow_100ms: 0, max_gap_ms: 0, total_gap_ms: 0 };
    }

    function reportFrames(reason, now) {
        if (!frameProbeStats.frames) return;
        mark('frame.summary', {
            reason,
            drag_id: activeDrag?.id || null,
            window_since_drop_ms: lastDropAt ? round(now - lastDropAt, 1) : null,
            frames: frameProbeStats.frames,
            slow_50ms: frameProbeStats.slow_50ms,
            slow_100ms: frameProbeStats.slow_100ms,
            max_gap_ms: round(frameProbeStats.max_gap_ms, 1),
            average_gap_ms: round(frameProbeStats.total_gap_ms / frameProbeStats.frames, 2),
        });
        frameProbeStats = newFrameStats();
        frameProbeReportAt = now;
    }

    function frameProbe(now) {
        if (!frameProbeRunning) return;
        if (frameProbeLastAt) {
            const gap = now - frameProbeLastAt;
            frameProbeStats.frames += 1;
            frameProbeStats.total_gap_ms += gap;
            frameProbeStats.max_gap_ms = Math.max(frameProbeStats.max_gap_ms, gap);
            if (gap >= 50) frameProbeStats.slow_50ms += 1;
            if (gap >= 100) frameProbeStats.slow_100ms += 1;
        }
        frameProbeLastAt = now;
        if (now - frameProbeReportAt >= 1000) reportFrames('interval', now);
        if (activeDrag || now < diagnosticWindowUntil) {
            requestAnimationFrame(frameProbe);
            return;
        }
        reportFrames('final', now);
        frameProbeRunning = false;
        frameProbeLastAt = 0;
    }

    function startFrameProbe() {
        if (frameProbeRunning) return;
        frameProbeRunning = true;
        frameProbeLastAt = 0;
        frameProbeReportAt = performance.now();
        frameProbeStats = newFrameStats();
        requestAnimationFrame(frameProbe);
    }

    function startDrag(event) {
        const now = performance.now();
        activeDrag = {
            id: ++dragSequence,
            startedAt: now,
            enterCount: 0,
            overCount: 0,
            leaveCount: 0,
            targetChangeCount: 0,
            lastOverAt: 0,
            lastOverReportAt: 0,
            maxOverGap: 0,
            lastTarget: componentFromEvent(event),
        };
        dragTargetId = activeDrag.lastTarget?.id || '';
        diagnosticWindowUntil = Number.POSITIVE_INFINITY;
        startMutationProbe();
        startFrameProbe();
        mark('drag.start', {
            drag_id: activeDrag.id,
            target: activeDrag.lastTarget,
            transfer: transferSummary(event.dataTransfer),
            ui: currentUiState(),
        });
    }

    function noteDragTarget(event) {
        if (!activeDrag) return;
        const target = componentFromEvent(event);
        const targetId = target?.id || '';
        if (targetId && targetId !== dragTargetId) {
            dragTargetId = targetId;
            activeDrag.targetChangeCount += 1;
            activeDrag.lastTarget = target;
            mark('drag.target_change', { drag_id: activeDrag.id, target });
        }
    }

    function finishDrag(reason) {
        if (!activeDrag) return;
        const summary = dragSummary();
        const dragId = activeDrag.id;
        activeDrag = null;
        dragTargetId = '';
        diagnosticWindowUntil = performance.now() + POST_DRAG_WINDOW_MS;
        mark('drag.finish', { reason, drag_id: dragId, summary, visuals: dragVisualSnapshot() });
        stopMutationProbeLater();
    }

    function schedulePostDropSnapshots(dragId) {
        for (const delay of [50, 250, 1000, 3000, 5000]) {
            window.setTimeout(() => {
                mark('drag.post_drop_snapshot', {
                    drag_id: dragId,
                    delay_ms: delay,
                    snapshot: pageSnapshot(`post-drop-${delay}`),
                }, { urgent: delay === 50 });
            }, delay);
        }
    }

    function handleDragEnter(event) {
        if (!isRelevantDrag(event.dataTransfer)) return;
        if (!activeDrag) startDrag(event);
        activeDrag.enterCount += 1;
        noteDragTarget(event);
        if (activeDrag.enterCount === 1) {
            mark('drag.enter', {
                drag_id: activeDrag.id,
                target: componentFromEvent(event),
                default_prevented_at_capture: event.defaultPrevented,
            });
        }
    }

    function handleDragOver(event) {
        if (!activeDrag || !isRelevantDrag(event.dataTransfer)) return;
        const now = performance.now();
        activeDrag.overCount += 1;
        if (activeDrag.lastOverAt) activeDrag.maxOverGap = Math.max(activeDrag.maxOverGap, now - activeDrag.lastOverAt);
        activeDrag.lastOverAt = now;
        noteDragTarget(event);
        if (!activeDrag.lastOverReportAt || now - activeDrag.lastOverReportAt >= 500) {
            activeDrag.lastOverReportAt = now;
            mark('drag.over_summary', {
                drag_id: activeDrag.id,
                summary: dragSummary(),
                default_prevented_at_capture: event.defaultPrevented,
            });
        }
    }

    function handleDragLeave(event) {
        if (!activeDrag) return;
        activeDrag.leaveCount += 1;
        if (!event.relatedTarget) {
            mark('drag.leave_document', { drag_id: activeDrag.id, summary: dragSummary() });
        }
    }

    function handleDrop(event) {
        if (!isRelevantDrag(event.dataTransfer)) return;
        if (!activeDrag) startDrag(event);
        const dragId = activeDrag.id;
        lastDropAt = performance.now();
        mark('drag.drop.capture', {
            drag_id: dragId,
            summary: dragSummary(),
            target: componentFromEvent(event),
            elements_at_point: elementsAtEvent(event),
            transfer: transferSummary(event.dataTransfer),
            default_prevented_at_capture: event.defaultPrevented,
            cancel_bubble_at_capture: event.cancelBubble,
        }, { urgent: true });
        queueMicrotask(() => {
            mark('drag.drop.after_dispatch', {
                drag_id: dragId,
                default_prevented: event.defaultPrevented,
                cancel_bubble: event.cancelBubble,
                drop_effect: String(event.dataTransfer?.dropEffect || '').slice(0, 40),
                visuals: dragVisualSnapshot(),
            }, { urgent: true });
            finishDrag('drop');
            schedulePostDropSnapshots(dragId);
        });
    }

    function handleFileInputChange(event) {
        const input = event.target;
        if (!(input instanceof HTMLInputElement) || input.type !== 'file') return;
        diagnosticWindowUntil = Math.max(
            diagnosticWindowUntil,
            performance.now() + GENERATION_DIAGNOSTIC_WINDOW_MS,
        );
        mark('file_input.change', {
            target: componentFromEvent(event),
            file_count: input.files?.length || 0,
            files: Array.from(input.files || []).slice(0, 10).map(fileSummary),
            since_drop_ms: lastDropAt ? round(performance.now() - lastDropAt, 1) : null,
        }, { urgent: Boolean(lastDropAt && performance.now() - lastDropAt < POST_DRAG_WINDOW_MS) });
    }

    function isDiagnosticWindowActive() {
        return Boolean(activeDrag) || performance.now() < diagnosticWindowUntil;
    }

    function resourceCategory(resourceName) {
        try {
            const pathname = new URL(resourceName, document.baseURI).pathname.toLowerCase();
            if (pathname.includes('/simpai/sketch-cache')) return 'sketch_cache';
            if (pathname.includes('/upload')) return 'upload';
            if (pathname.includes('/queue/')) return 'gradio_queue';
            if (pathname.includes('/run/') || pathname.includes('/predict')) return 'gradio_run';
            if (pathname.includes('/file=')) return 'file';
            if (pathname.includes('/simpai/studio-performance')) return 'performance_log';
            return 'other';
        } catch (_) {
            return 'unparsed';
        }
    }

    function resourcePathname(resourceName, category) {
        try {
            const pathname = new URL(resourceName, document.baseURI).pathname;
            if (category === 'file' || pathname.toLowerCase().includes('/file=')) return '/file=<redacted>';
            return pathname.slice(0, 240);
        } catch (_) {
            return '';
        }
    }

    function resourcePhaseDuration(startValue, endValue) {
        const start = Number(startValue || 0);
        const end = Number(endValue || 0);
        if (!(start > 0) || !(end >= start)) return null;
        return round(end - start, 1);
    }

    function installPerformanceObservers() {
        const supported = new Set(PerformanceObserver.supportedEntryTypes || []);
        const observe = (type, callback, options = {}) => {
            if (!supported.has(type)) return false;
            try {
                const observer = new PerformanceObserver((list) => callback(list.getEntries()));
                observer.observe({ type, buffered: true, ...options });
                return true;
            } catch (_) {
                return false;
            }
        };

        const observerStatus = {
            longtask: observe('longtask', (entries) => {
                for (const entry of entries) {
                    mark('performance.longtask', {
                        duration_ms: round(entry.duration, 1),
                        start_ms: round(entry.startTime, 1),
                        drag_id: activeDrag?.id || null,
                        since_drop_ms: lastDropAt ? round(performance.now() - lastDropAt, 1) : null,
                        attribution: Array.from(entry.attribution || []).slice(0, 5).map((item) => ({
                            container_type: String(item.containerType || '').slice(0, 80),
                            container_id: String(item.containerId || '').slice(0, 160),
                        })),
                    });
                }
            }),
            event: observe('event', (entries) => {
                for (const entry of entries) {
                    if (entry.duration < SLOW_EVENT_THRESHOLD_MS) continue;
                    const name = String(entry.name || '').slice(0, 80);
                    const interactionId = Number(entry.interactionId || 0);
                    if (!interactionId && PASSIVE_SLOW_EVENT_NAMES.has(name)) {
                        ignoredPassiveSlowEvents[name] = (ignoredPassiveSlowEvents[name] || 0) + 1;
                        continue;
                    }
                    mark('performance.slow_event', {
                        name,
                        duration_ms: round(entry.duration, 1),
                        processing_delay_ms: round(entry.processingStart - entry.startTime, 1),
                        processing_time_ms: round(entry.processingEnd - entry.processingStart, 1),
                        interaction_id: interactionId,
                        target: describeElement(entry.target),
                    });
                }
            }, { durationThreshold: SLOW_EVENT_THRESHOLD_MS }),
            resource: observe('resource', (entries) => {
                for (const entry of entries) {
                    const category = resourceCategory(entry.name);
                    if (!isDiagnosticWindowActive() && category !== 'upload') continue;
                    if (category === 'performance_log') continue;
                    mark('performance.resource', {
                        category,
                        pathname: resourcePathname(entry.name, category),
                        initiator_type: String(entry.initiatorType || '').slice(0, 80),
                        start_ms: round(entry.startTime, 1),
                        duration_ms: round(entry.duration, 1),
                        fetch_start_ms: round(entry.fetchStart, 1),
                        request_start_ms: round(entry.requestStart, 1),
                        response_start_ms: round(entry.responseStart, 1),
                        response_end_ms: round(entry.responseEnd, 1),
                        request_queue_ms: resourcePhaseDuration(entry.fetchStart, entry.requestStart),
                        response_wait_ms: resourcePhaseDuration(entry.requestStart, entry.responseStart),
                        response_read_ms: resourcePhaseDuration(entry.responseStart, entry.responseEnd),
                        transfer_bytes: Number(entry.transferSize || 0),
                        encoded_bytes: Number(entry.encodedBodySize || 0),
                        decoded_bytes: Number(entry.decodedBodySize || 0),
                    });
                }
            }),
            layout_shift: observe('layout-shift', (entries) => {
                if (!isDiagnosticWindowActive()) return;
                for (const entry of entries) {
                    mark('performance.layout_shift', {
                        score: round(entry.value, 5),
                        had_recent_input: Boolean(entry.hadRecentInput),
                        start_ms: round(entry.startTime, 1),
                    });
                }
            }),
            long_animation_frame: observe('long-animation-frame', (entries) => {
                for (const entry of entries) {
                    mark('performance.long_animation_frame', {
                        duration_ms: round(entry.duration, 1),
                        blocking_duration_ms: round(entry.blockingDuration, 1),
                        render_start_ms: round(entry.renderStart, 1),
                        style_layout_start_ms: round(entry.styleAndLayoutStart, 1),
                        drag_id: activeDrag?.id || null,
                        scripts: Array.from(entry.scripts || []).sort((left, right) => right.duration - left.duration).slice(0, 8).map((script) => ({
                            source: scriptLabel(script.sourceURL),
                            source_function: String(script.sourceFunctionName || '').slice(0, 160),
                            source_char_position: Number.isFinite(script.sourceCharPosition) ? script.sourceCharPosition : null,
                            invoker_type: String(script.invokerType || '').slice(0, 100),
                            duration_ms: round(script.duration, 1),
                            forced_style_layout_ms: round(script.forcedStyleAndLayoutDuration, 1),
                            execution_start_ms: round(script.executionStart, 1),
                        })),
                    });
                }
            }),
        };
        mark('performance.observers', observerStatus);
    }

    function navigationSnapshot() {
        const navigation = performance.getEntriesByType?.('navigation')?.[0];
        if (!navigation) return null;
        return {
            type: String(navigation.type || '').slice(0, 40),
            duration_ms: round(navigation.duration, 1),
            dom_interactive_ms: round(navigation.domInteractive, 1),
            dom_content_loaded_ms: round(navigation.domContentLoadedEventEnd, 1),
            load_event_ms: round(navigation.loadEventEnd, 1),
            response_end_ms: round(navigation.responseEnd, 1),
            transfer_bytes: Number(navigation.transferSize || 0),
        };
    }

    function installEventLoopProbe() {
        let expected = performance.now() + EVENT_LOOP_INTERVAL_MS;
        window.setInterval(() => {
            const now = performance.now();
            const delay = Math.max(0, now - expected);
            expected = now + EVENT_LOOP_INTERVAL_MS;
            if (delay >= 100) {
                mark('event_loop.delay', {
                    delay_ms: round(delay, 1),
                    drag_id: activeDrag?.id || null,
                    since_drop_ms: lastDropAt ? round(now - lastDropAt, 1) : null,
                    visibility: document.visibilityState,
                }, { urgent: isDiagnosticWindowActive() });
            }
        }, EVENT_LOOP_INTERVAL_MS);
    }

    function installLifecycleEvents() {
        document.addEventListener('dragenter', handleDragEnter, true);
        document.addEventListener('dragover', handleDragOver, true);
        document.addEventListener('dragleave', handleDragLeave, true);
        document.addEventListener('drop', handleDrop, true);
        document.addEventListener('dragend', () => {
            if (!activeDrag) return;
            mark('drag.end_event', { summary: dragSummary() }, { urgent: true });
            finishDrag('dragend');
        }, true);
        document.addEventListener('change', handleFileInputChange, true);
        document.addEventListener('pointerdown', (event) => {
            const target = event.target instanceof Element ? event.target : null;
            const control = target?.closest?.('#generate_button, #stop_button, #skip_button');
            if (!control) return;
            diagnosticWindowUntil = Math.max(
                diagnosticWindowUntil,
                performance.now() + GENERATION_DIAGNOSTIC_WINDOW_MS,
            );
            mark('generation.control_pointerdown', {
                control: String(control.id || '').slice(0, 80),
                disabled: Boolean(control.disabled || control.getAttribute?.('aria-disabled') === 'true'),
                target: describeElement(target),
                ui: currentUiState(),
            }, { urgent: true });
        }, true);
        document.addEventListener('click', (event) => {
            const target = event.target instanceof Element ? event.target : null;
            const control = target?.closest?.('#generate_button, #stop_button, #skip_button');
            if (!control) return;
            mark('generation.control_click', {
                control: String(control.id || '').slice(0, 80),
                disabled: Boolean(control.disabled || control.getAttribute?.('aria-disabled') === 'true'),
                default_prevented_at_capture: Boolean(event.defaultPrevented),
                target: describeElement(target),
                ui: currentUiState(),
            }, { urgent: true });
        }, true);
        document.addEventListener('visibilitychange', () => {
            mark('page.visibility', { visibility: document.visibilityState }, { urgent: document.hidden });
            if (document.hidden && activeDrag) finishDrag('visibility-hidden');
        });
        document.addEventListener('pointerdown', (event) => {
            const now = performance.now();
            if (!lastDropAt || now - lastDropAt > POST_DRAG_WINDOW_MS || now - lastInteractionAt < 250) return;
            lastInteractionAt = now;
            mark('page.post_drop_interaction', {
                type: 'pointerdown',
                since_drop_ms: round(now - lastDropAt, 1),
                target: componentFromEvent(event),
            });
        }, true);
        document.addEventListener('keydown', (event) => {
            const now = performance.now();
            if (!lastDropAt || now - lastDropAt > POST_DRAG_WINDOW_MS || now - lastInteractionAt < 250) return;
            lastInteractionAt = now;
            mark('page.post_drop_interaction', {
                type: 'keydown',
                since_drop_ms: round(now - lastDropAt, 1),
                key_category: ['Escape', 'Enter', 'Tab'].includes(event.key) ? event.key : 'other',
            });
        }, true);
        window.addEventListener('blur', () => {
            mark('page.blur', { active_drag: Boolean(activeDrag) });
            if (activeDrag) finishDrag('window-blur');
        });
        window.addEventListener('online', () => mark('page.network', { online: true }));
        window.addEventListener('offline', () => mark('page.network', { online: false }, { urgent: true }));
        window.addEventListener('error', (event) => {
            mark('page.error', {
                message: cleanErrorText(event.message),
                script: scriptLabel(event.filename),
                line: Number(event.lineno || 0),
                column: Number(event.colno || 0),
                target: describeElement(event.target),
                stack: cleanErrorText(event.error?.stack),
            }, { urgent: isDiagnosticWindowActive() });
        }, true);
        window.addEventListener('unhandledrejection', (event) => {
            const reason = event.reason;
            mark('page.unhandled_rejection', {
                error_type: String(reason?.name || typeof reason).slice(0, 100),
                message: cleanErrorText(reason?.message || reason),
                stack: cleanErrorText(reason?.stack),
            }, { urgent: isDiagnosticWindowActive() });
        });
        window.addEventListener('pagehide', (event) => {
            mark('page.hide', { persisted: Boolean(event.persisted), snapshot: pageSnapshot('pagehide') }, { urgent: true });
            flushBeacon();
        });
        window.addEventListener('beforeunload', flushBeacon);
        window.addEventListener('load', () => mark('page.load', { navigation: navigationSnapshot(), snapshot: pageSnapshot('load') }));
    }

    window.SimpAIStudioPerformance = Object.freeze({
        enabled: true,
        sessionId,
        mark,
        snapshot(reason = 'manual') {
            mark('page.snapshot', pageSnapshot(String(reason).slice(0, 100)), { urgent: true });
        },
        flush() {
            void flushFetch();
        },
    });

    mark('session.start', {
        user_agent: String(navigator.userAgent || '').slice(0, 500),
        platform: String(navigator.platform || '').slice(0, 120),
        hardware_concurrency: Number(navigator.hardwareConcurrency || 0),
        device_memory_gib: Number(navigator.deviceMemory || 0),
        max_touch_points: Number(navigator.maxTouchPoints || 0),
        cross_origin_isolated: Boolean(window.crossOriginIsolated),
        viewport: { width: window.innerWidth, height: window.innerHeight, device_pixel_ratio: round(window.devicePixelRatio, 2) },
        memory: memorySnapshot(),
        ui: currentUiState(),
    });
    installLifecycleEvents();
    installPerformanceObservers();
    installEventLoopProbe();
    window.setInterval(() => void flushFetch(), FLUSH_INTERVAL_MS);
    window.setInterval(() => mark('page.heartbeat', pageSnapshot('heartbeat')), HEARTBEAT_INTERVAL_MS);
})();
