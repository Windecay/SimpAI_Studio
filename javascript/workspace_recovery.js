(function () {
    'use strict';

    if (window.SimpAIWorkspaceRecovery) return;

    const UI_STATE_VERSION = 1;
    const UI_STATE_PREFIX = 'simpai.studio.workspace.ui.v1.';
    const DATA_STATE_PREFIX = 'simpai.studio.workspace.data.v1.';
    const MANUAL_RECONNECT_KEY = 'simpai.studio.workspace.manual-reconnect.v1';
    const MANUAL_RECONNECT_VERSION = 1;
    const PAGE_LIFECYCLE_KEY = 'simpai.studio.workspace.page-lifecycle.v1';
    const PAGE_LIFECYCLE_VERSION = 1;
    const MANUAL_RECONNECT_MAX_AGE_MS = 30 * 60 * 1000;
    const RESTORE_DELAY_MS = 450;
    const RESTORE_READY_TIMEOUT_MS = 30 * 1000;
    const RESTORE_READY_SETTLE_MS = 650;
    const RESTORE_POST_NAV_SETTLE_MS = 350;
    const RESTORE_LAYOUT_SETTLE_TIMEOUT_MS = 2500;
    const RESTORE_LAYOUT_POLL_MS = 100;
    const RESTORE_LAYOUT_STABLE_POLLS = 3;
    const RESTORE_POST_LAYOUT_SETTLE_MS = 350;
    const WORKSPACE_STATE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
    const AUTO_RESTORE_MAX_AGE_MS = 2 * 60 * 60 * 1000;
    const RESTORE_PROGRESS_ID = 'workspace_restore_progress';
    const RESTORE_PROGRESS_MIN_VISIBLE_MS = 260;
    const RESTORE_PROGRESS_HIDE_DELAY_MS = 220;
    const RESTORE_PROGRESS_ERROR_HIDE_DELAY_MS = 900;
    const LEGACY_RECONNECT_CAPTURE_WINDOW_MS = 10 * 1000;
    const SKETCH_DB_NAME = 'simpai.studio.workspace.sketch.v1';
    const SKETCH_DB_VERSION = 1;
    const SKETCH_STORE_NAME = 'snapshots';
    const SKETCH_CAPTURE_WAIT_MS = 1500;

    let restoreCompleted = false;
    let restoreRequested = false;
    let restoreRequest = null;
    let automaticRestoreChecked = false;
    let automaticRestoreCandidate = null;
    let restoreStartedAt = 0;
    let preserveUiSnapshotUntilUnload = false;
    let captureSuspended = false;
    let captureTimer = 0;
    let restoreLayoutEnabled = true;
    let restoreProgressActive = false;
    let restoreProgressValue = 0;
    let restoreProgressStartedAt = 0;
    let restoreProgressSoftTimer = 0;
    let restoreProgressHideTimer = 0;
    let restoreProgressTargetPreset = '';
    let restoreProgressFailed = false;
    let sketchDbPromise = null;
    const pendingSketchWrites = new Set();

    function restoreProgressLanguage() {
        const candidates = [];
        try {
            const search = new URLSearchParams(window.location.search || '');
            candidates.push(search.get('__lang'));
        } catch (error) {}
        const params = window.simpleaiTopbarSystemParams && typeof window.simpleaiTopbarSystemParams === 'object'
            ? window.simpleaiTopbarSystemParams
            : {};
        candidates.push(params.__lang, window.locale_lang);
        try { candidates.push(localStorage.getItem('ailang')); } catch (error) {}
        const value = candidates.map((item) => String(item || '').trim().toLowerCase()).find(Boolean) || 'en';
        return value.startsWith('en') ? 'en' : 'cn';
    }

    function restoreProgressText(key, fallback) {
        const source = String(key || '');
        if (restoreProgressLanguage() === 'en') return source;
        const dict = window.localization && typeof window.localization === 'object' ? window.localization : {};
        return dict[source] || String(fallback || source);
    }

    function restoreProgressTemplate(key, values) {
        let text = restoreProgressText(key, key);
        for (const [name, value] of Object.entries(values || {})) {
            text = text.replace(new RegExp(`\\{${name}\\}`, 'g'), String(value ?? ''));
        }
        return text;
    }

    function restoreProgressHost() {
        if (!document?.createElement || !document?.body || typeof document.getElementById !== 'function') return null;
        let host = document.getElementById(RESTORE_PROGRESS_ID);
        if (host) return host;

        host = document.createElement('div');
        host.id = RESTORE_PROGRESS_ID;
        host.setAttribute('aria-hidden', 'true');
        Object.assign(host.style, {
            position: 'fixed',
            inset: '0',
            zIndex: '10000',
            pointerEvents: 'none',
            opacity: '0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            background: 'rgba(0, 0, 0, 0.18)',
            backdropFilter: 'blur(1.5px)',
            transition: 'opacity 160ms ease',
        });

        const card = document.createElement('div');
        Object.assign(card.style, {
            width: 'min(560px, calc(100vw - 32px))',
            padding: '10px 12px',
            borderRadius: '8px',
            background: 'rgba(20, 20, 24, 0.92)',
            border: '1px solid rgba(255,255,255,0.12)',
            boxShadow: '0 12px 34px rgba(0,0,0,0.28)',
            backdropFilter: 'blur(8px)',
            transform: 'translateY(8px)',
            transition: 'transform 160ms ease',
        });

        const header = document.createElement('div');
        Object.assign(header.style, {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
        });
        const label = document.createElement('div');
        label.id = 'workspace_restore_progress_label';
        Object.assign(label.style, {
            fontSize: '13px',
            fontWeight: '600',
            color: 'rgba(255,255,255,0.96)',
        });
        const percent = document.createElement('div');
        percent.id = 'workspace_restore_progress_percent';
        Object.assign(percent.style, {
            fontSize: '12px',
            color: 'rgba(255,255,255,0.72)',
        });
        const track = document.createElement('div');
        Object.assign(track.style, {
            marginTop: '8px',
            height: '4px',
            borderRadius: '999px',
            overflow: 'hidden',
            background: 'rgba(255,255,255,0.10)',
        });
        const bar = document.createElement('div');
        bar.id = 'workspace_restore_progress_bar';
        Object.assign(bar.style, {
            width: '0%',
            height: '100%',
            borderRadius: '999px',
            background: 'linear-gradient(90deg, #ff8a3d 0%, #5aa2ff 100%)',
            transition: 'width 180ms ease',
        });

        header.appendChild(label);
        header.appendChild(percent);
        track.appendChild(bar);
        card.appendChild(header);
        card.appendChild(track);
        host.appendChild(card);
        document.body.appendChild(host);
        return host;
    }

    function restoreProgressUpdate(value, label) {
        if (!restoreProgressActive) return;
        const host = restoreProgressHost();
        if (!host) return;
        const progress = Math.max(0, Math.min(100, Number(value) || 0));
        restoreProgressValue = Math.max(restoreProgressValue, progress);
        const labelNode = document.getElementById('workspace_restore_progress_label');
        const percentNode = document.getElementById('workspace_restore_progress_percent');
        const bar = document.getElementById('workspace_restore_progress_bar');
        if (labelNode && label) labelNode.textContent = label;
        if (percentNode) percentNode.textContent = `${Math.round(restoreProgressValue)}%`;
        if (bar) bar.style.width = `${restoreProgressValue}%`;
        host.style.opacity = '1';
        const card = host.firstElementChild;
        if (card?.style) card.style.transform = 'translateY(0)';
    }

    function stopRestoreProgressSoftTimer() {
        if (!restoreProgressSoftTimer) return;
        window.clearInterval(restoreProgressSoftTimer);
        restoreProgressSoftTimer = 0;
    }

    function startRestoreProgressSoftTimer() {
        stopRestoreProgressSoftTimer();
        restoreProgressSoftTimer = window.setInterval(() => {
            if (!restoreProgressActive) {
                stopRestoreProgressSoftTimer();
                return;
            }
            const elapsed = Math.max(0, Date.now() - restoreProgressStartedAt);
            let target = 24;
            if (elapsed > 450) target = 38;
            if (elapsed > 1200) target = 48;
            if (elapsed > 2600) target = 57;
            if (elapsed > 6000) target = 64;
            if (restoreProgressValue >= target) return;
            restoreProgressUpdate(
                Math.min(target, restoreProgressValue + Math.max(1, (target - restoreProgressValue) * 0.18)),
                restoreProgressText('Waiting for server', 'Waiting for server')
            );
        }, 120);
    }

    function startRestoreProgress(request) {
        if (restoreProgressHideTimer) {
            window.clearTimeout(restoreProgressHideTimer);
            restoreProgressHideTimer = 0;
        }
        restoreProgressActive = true;
        restoreProgressValue = 0;
        restoreProgressStartedAt = Date.now();
        restoreProgressTargetPreset = normalizedPresetName(request?.context?.preset || '');
        restoreProgressFailed = false;
        const host = restoreProgressHost();
        if (host) {
            host.style.opacity = '0';
            const card = host.firstElementChild;
            if (card?.style) card.style.transform = 'translateY(8px)';
            const bar = document.getElementById('workspace_restore_progress_bar');
            if (bar) {
                bar.style.transition = 'none';
                bar.style.width = '0%';
                try { void bar.offsetWidth; } catch (error) {}
                bar.style.transition = 'width 180ms ease';
            }
        }
        restoreProgressUpdate(8, restoreProgressText('Restoring workspace', 'Restoring workspace'));
        if (host) {
            startRestoreProgressSoftTimer();
            try { document.body.style.cursor = 'progress'; } catch (error) {}
        }
    }

    function updateRestoreProgress(value, key, values) {
        if (!restoreProgressActive) return;
        restoreProgressUpdate(value, restoreProgressTemplate(key, values || {}));
    }

    function hideRestoreProgress(delay) {
        if (!document || typeof document.getElementById !== 'function') {
            restoreProgressActive = false;
            restoreProgressValue = 0;
            restoreProgressTargetPreset = '';
            restoreProgressFailed = false;
            return;
        }
        const host = document.getElementById(RESTORE_PROGRESS_ID);
        if (!host) {
            restoreProgressActive = false;
            restoreProgressValue = 0;
            restoreProgressTargetPreset = '';
            restoreProgressFailed = false;
            return;
        }
        host.style.opacity = '0';
        const card = host.firstElementChild;
        if (card?.style) card.style.transform = 'translateY(8px)';
        restoreProgressHideTimer = window.setTimeout(() => {
            restoreProgressHideTimer = 0;
            restoreProgressActive = false;
            restoreProgressValue = 0;
            restoreProgressTargetPreset = '';
            restoreProgressFailed = false;
        }, Math.max(0, Number(delay) || RESTORE_PROGRESS_HIDE_DELAY_MS));
    }

    function finishRestoreProgress(success, errorKey) {
        if (!restoreProgressActive) return;
        if (!success) restoreProgressFailed = true;
        if (success && restoreProgressFailed) {
            stopRestoreProgressSoftTimer();
            try { document.body.style.cursor = ''; } catch (error) {}
            hideRestoreProgress(RESTORE_PROGRESS_ERROR_HIDE_DELAY_MS);
            return;
        }
        stopRestoreProgressSoftTimer();
        try { document.body.style.cursor = ''; } catch (error) {}
        const elapsed = Date.now() - restoreProgressStartedAt;
        const complete = () => {
            if (success) {
                restoreProgressUpdate(100, restoreProgressText('Workspace restored', 'Workspace restored'));
            } else {
                restoreProgressUpdate(96, restoreProgressText(errorKey || 'Workspace restore timed out', 'Workspace restore timed out'));
            }
            hideRestoreProgress(success ? RESTORE_PROGRESS_HIDE_DELAY_MS : RESTORE_PROGRESS_ERROR_HIDE_DELAY_MS);
        };
        if (success && elapsed < RESTORE_PROGRESS_MIN_VISIBLE_MS) {
            restoreProgressUpdate(88, restoreProgressText('Restoring parameters', 'Restoring parameters'));
            window.setTimeout(complete, RESTORE_PROGRESS_MIN_VISIBLE_MS - elapsed);
            return;
        }
        complete();
    }

    function rootNode() {
        try {
            const root = typeof window.gradioApp === 'function' ? window.gradioApp() : document;
            return root || document;
        } catch (error) {
            return document;
        }
    }

    function readCookie(name) {
        try {
            const prefix = `${name}=`;
            const item = String(document.cookie || '')
                .split(';')
                .map((part) => part.trim())
                .find((part) => part.startsWith(prefix));
            if (!item) return '';
            const value = item.slice(prefix.length);
            try {
                return decodeURIComponent(value);
            } catch (error) {
                return value;
            }
        } catch (error) {
            return '';
        }
    }

    function sessionSource() {
        const candidates = [];
        try {
            candidates.push(localStorage.getItem('aitoken'));
        } catch (error) {}
        candidates.push(readCookie('aitoken'), readCookie('did'));
        return String(candidates.find((value) => String(value || '').trim()) || '');
    }

    function liveTopbarParams() {
        const candidates = [];
        if (window.simpleaiTopbarSystemParams && typeof window.simpleaiTopbarSystemParams === 'object') {
            candidates.push(window.simpleaiTopbarSystemParams);
        }
        try {
            if (typeof topbarLastSystemParams !== 'undefined' && topbarLastSystemParams && typeof topbarLastSystemParams === 'object') {
                candidates.push(topbarLastSystemParams);
            }
        } catch (error) {}
        if (window.system_params && typeof window.system_params === 'object') {
            candidates.push(window.system_params);
        }
        return candidates.find((value) => value && typeof value === 'object') || {};
    }

    function ownerSource() {
        const params = liveTopbarParams();
        const candidates = [
            params.__did,
            params.did,
            params.user_did,
            params.username,
        ];
        try {
            candidates.push(localStorage.getItem('aitoken'));
        } catch (error) {}
        candidates.push(readCookie('aitoken'), readCookie('did'));
        return String(candidates.find((value) => String(value || '').trim()) || 'local');
    }

    function hashText(value) {
        const text = String(value || 'local');
        let hashA = 2166136261;
        let hashB = 2246822519;
        for (let index = 0; index < text.length; index += 1) {
            const code = text.charCodeAt(index);
            hashA ^= code;
            hashA = Math.imul(hashA, 16777619);
            hashB ^= code + index;
            hashB = Math.imul(hashB, 3266489917);
        }
        return `${(hashA >>> 0).toString(16).padStart(8, '0')}${(hashB >>> 0).toString(16).padStart(8, '0')}`;
    }

    function ownerKey() {
        return `u_${hashText(ownerSource())}`;
    }

    function storageKey(owner) {
        return `${UI_STATE_PREFIX}${String(owner || ownerKey())}`;
    }

    function dataStorageKey(owner) {
        return `${DATA_STATE_PREFIX}${String(owner || ownerKey())}`;
    }

    function domPresetName() {
        const candidates = [];
        try {
            candidates.push(document.activeElement);
            const root = rootNode();
            candidates.push(...Array.from(root.querySelectorAll?.(
                'button.bar_button.selected, button.bar_button[aria-pressed="true"], [id^="bar"].selected'
            ) || []));
        } catch (error) {}
        for (const candidate of candidates) {
            if (!candidate || !/^bar\d+$/.test(String(candidate.id || ''))) continue;
            const value = presetNameForButton(candidate);
            if (value) return value;
        }
        return '';
    }

    function emptyWorkspaceSnapshot() {
        return { schema: 1, workspaces: {}, updated_at: Date.now() };
    }

    function snapshotExpired(snapshot) {
        const updatedAt = Number(snapshot?.updated_at || 0);
        return Number.isFinite(updatedAt) && updatedAt > 0 && Date.now() - updatedAt > WORKSPACE_STATE_MAX_AGE_MS;
    }

    function navigationType() {
        try {
            const entries = window.performance?.getEntriesByType?.('navigation') || [];
            const type = String(entries[0]?.type || '').trim();
            if (type) return type;
        } catch (error) {}
        try {
            const legacyType = Number(window.performance?.navigation?.type);
            if (legacyType === 1) return 'reload';
            if (legacyType === 2) return 'back_forward';
        } catch (error) {}
        return '';
    }

    function pageLocationPath() {
        return `${String(window.location?.pathname || '')}${String(window.location?.search || '')}`;
    }

    function readPageLifecycle() {
        try {
            const marker = JSON.parse(sessionStorage.getItem(PAGE_LIFECYCLE_KEY) || 'null');
            const currentPath = pageLocationPath();
            const markerOwner = String(marker?.owner || '').trim();
            const markerSessionKey = String(marker?.session_key || '').trim();
            const currentSessionKey = reconnectSessionKey();
            const sessionMismatch = !!(markerSessionKey && currentSessionKey && markerSessionKey !== currentSessionKey);
            const invalid = !marker
                || marker.version !== PAGE_LIFECYCLE_VERSION
                || !markerOwner
                || marker.path !== currentPath
                || !Number.isFinite(Number(marker.updated_at))
                || Date.now() - Number(marker.updated_at) > AUTO_RESTORE_MAX_AGE_MS
                || sessionMismatch;
            if (invalid) {
                if (marker) sessionStorage.removeItem(PAGE_LIFECYCLE_KEY);
                return null;
            }
            return marker;
        } catch (error) {
            return null;
        }
    }

    function rememberPageLifecycle(reason) {
        try {
            sessionStorage.setItem(PAGE_LIFECYCLE_KEY, JSON.stringify({
                version: PAGE_LIFECYCLE_VERSION,
                owner: ownerKey(),
                session_key: reconnectSessionKey(),
                path: pageLocationPath(),
                reason: String(reason || 'pagehide'),
                updated_at: Date.now(),
            }));
            return true;
        } catch (error) {
            return false;
        }
    }

    function clearPageLifecycle() {
        try {
            sessionStorage.removeItem(PAGE_LIFECYCLE_KEY);
        } catch (error) {}
    }

    function automaticRestoreRequest() {
        if (automaticRestoreCandidate) return automaticRestoreCandidate;
        if (automaticRestoreChecked) return null;
        automaticRestoreChecked = true;

        const type = navigationType();
        const lifecycle = readPageLifecycle();
        const documentWasDiscarded = !!window.document?.wasDiscarded;
        const pageWasRestored = !!window.__simpai_page_was_restored;
        if (type !== 'reload' && type !== 'back_forward' && !lifecycle && !documentWasDiscarded && !pageWasRestored) {
            return null;
        }

        // During the first part of a new Gradio page, topbar identity can still
        // be unset. Prefer the owner captured from the page that was hidden.
        const owner = String(lifecycle?.owner || ownerKey());
        const uiSnapshot = readUiSnapshot(owner);
        const dataSnapshot = workspaceSnapshot(owner);
        const updatedAt = Math.max(
            Number(uiSnapshot?.updated_at || 0),
            Number(dataSnapshot?.updated_at || 0),
        );
        if (!updatedAt || Date.now() - updatedAt > AUTO_RESTORE_MAX_AGE_MS) return null;
        if (!uiSnapshot && !dataSnapshot) return null;

        const uiContext = normalizedWorkspaceContext(uiSnapshot?.context);
        const dataContext = normalizedWorkspaceContext(dataSnapshot?.workspaces?.[owner]?.context);
        const context = uiContext.preset
            ? uiContext
            : (dataContext.preset ? dataContext : normalizedWorkspaceContext(currentWorkspaceContext()));

        const request = {
            version: MANUAL_RECONNECT_VERSION,
            owner,
            session_key: reconnectSessionKey(),
            pathname: String(window.location?.pathname || ''),
            requested_at: Date.now(),
            context,
            snapshot: dataSnapshot || emptyWorkspaceSnapshot(),
            value_count: storedWorkspaceValueCount(owner, context),
            source: 'browser_history',
            navigation_type: type,
            lifecycle_reason: lifecycle?.reason || '',
        };
        automaticRestoreCandidate = request;
        markPerformance('workspace.auto_restore_candidate', {
            owner,
            navigation_type: type,
            preset: request.context?.preset || '',
            value_count: request.value_count,
        }, true);
        return request;
    }

    function activeRestoreRequest() {
        const manual = pendingManualReconnectRequest();
        if (manual) return manual;
        return automaticRestoreRequest();
    }

    function workspaceSnapshot(owner) {
        try {
            const key = dataStorageKey(owner);
            const snapshot = JSON.parse(localStorage.getItem(key) || 'null');
            if (!snapshot || snapshot.schema !== 1 || typeof snapshot.workspaces !== 'object' || snapshotExpired(snapshot)) {
                if (snapshotExpired(snapshot)) localStorage.removeItem(key);
                return null;
            }
            return snapshot;
        } catch (error) {
            return null;
        }
    }

    function saveWorkspaceSnapshot(snapshot, owner) {
        if (!snapshot || snapshot.schema !== 1 || typeof snapshot.workspaces !== 'object') return false;
        try {
            localStorage.setItem(dataStorageKey(owner), JSON.stringify(snapshot));
            return true;
        } catch (error) {
            return false;
        }
    }

    function compactMediaValue(value) {
        if (value === null || value === undefined) return null;
        if (typeof value === 'string') return value.startsWith('data:') ? null : value;
        if (Array.isArray(value)) {
            return value.map(compactMediaValue).filter((item) => item !== null);
        }
        if (typeof value !== 'object') return null;
        if (Object.prototype.hasOwnProperty.call(value, 'video')) {
            return {
                video: compactMediaValue(value.video),
                subtitles: compactMediaValue(value.subtitles),
            };
        }
        return value.path || value.name || value.url || null;
    }

    function storedWorkspaceValue(value, kind) {
        return ['image', 'video', 'audio', 'file'].includes(String(kind || ''))
            ? compactMediaValue(value)
            : value;
    }

    function saveWorkspaceValue(key, signature, value, fallbackState, kind, options) {
        const settings = options && typeof options === 'object' ? options : {};
        if (!settings.force && captureWritesBlocked()) {
            const fallback = fallbackState && typeof fallbackState === 'object' && !Array.isArray(fallbackState)
                ? fallbackState
                : null;
            return fallback || workspaceSnapshot() || emptyWorkspaceSnapshot();
        }
        const owner = String(settings.owner || ownerKey());
        const context = normalizedWorkspaceContext(settings.context || currentWorkspaceContext());
        const source = workspaceSnapshot(owner)
            || (fallbackState && typeof fallbackState === 'object' && !Array.isArray(fallbackState) ? fallbackState : null)
            || emptyWorkspaceSnapshot();
        if (!context.preset) return source;
        const workspaces = source.workspaces && typeof source.workspaces === 'object' && !Array.isArray(source.workspaces)
            ? { ...source.workspaces }
            : {};
        const current = workspaces[owner] && typeof workspaces[owner] === 'object' ? workspaces[owner] : {};
        const values = workspaceContextsMatch(current.context, context)
            && current.values && typeof current.values === 'object' && !Array.isArray(current.values)
            ? { ...current.values }
            : {};
        const now = Date.now();
        values[String(key || '')] = {
            signature: String(signature || ''),
            value: storedWorkspaceValue(value, kind),
            updated_at: now,
        };
        workspaces[owner] = { ...current, context, values, updated_at: now };
        const next = { ...source, schema: 1, workspaces, updated_at: now };
        saveWorkspaceSnapshot(next, owner);
        return next;
    }

    function saveValue(key, signature, value, fallbackState, kind) {
        return saveWorkspaceValue(key, signature, value, fallbackState, kind);
    }

    function normalizedSketchPayload(value) {
        let source = value;
        if (typeof source === 'string') {
            try {
                source = JSON.parse(source || 'null');
            } catch (error) {
                return null;
            }
        }
        if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
        const image = typeof source.image === 'string' && source.image.startsWith('data:image/') ? source.image : '';
        const mask = typeof source.mask === 'string' && source.mask.startsWith('data:image/') ? source.mask : '';
        if (!image && !mask) return null;
        const width = Number(source.width || 0);
        const height = Number(source.height || 0);
        return {
            image,
            mask,
            width: Number.isFinite(width) && width > 0 ? width : 0,
            height: Number.isFinite(height) && height > 0 ? height : 0,
        };
    }

    function sketchRecordKey(owner, context, key, signature) {
        const normalized = normalizedWorkspaceContext(context);
        const scope = `${String(owner || ownerKey())}\n${normalized.preset}\n${normalized.scene_theme}`;
        return `sketch:${hashText(scope)}:${String(key || '')}:${String(signature || '').slice(0, 16)}`;
    }

    function openSketchDatabase() {
        if (sketchDbPromise) return sketchDbPromise;
        if (!window.indexedDB || typeof window.indexedDB.open !== 'function') {
            sketchDbPromise = Promise.resolve(null);
            return sketchDbPromise;
        }
        sketchDbPromise = new Promise((resolve) => {
            let request;
            try {
                request = window.indexedDB.open(SKETCH_DB_NAME, SKETCH_DB_VERSION);
            } catch (error) {
                resolve(null);
                return;
            }
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(SKETCH_STORE_NAME)) {
                    db.createObjectStore(SKETCH_STORE_NAME, { keyPath: 'id' });
                }
            };
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => resolve(null);
            request.onblocked = () => resolve(null);
        });
        return sketchDbPromise;
    }

    function sketchStoreAdapter() {
        const adapter = window.SimpAIWorkspaceSketchStore;
        return adapter && typeof adapter === 'object' ? adapter : null;
    }

    async function writeSketchRecord(record) {
        const adapter = sketchStoreAdapter();
        if (typeof adapter?.put === 'function') {
            await adapter.put(record);
            return true;
        }
        const db = await openSketchDatabase();
        if (!db) return false;
        return new Promise((resolve) => {
            let transaction;
            try {
                transaction = db.transaction(SKETCH_STORE_NAME, 'readwrite');
                transaction.objectStore(SKETCH_STORE_NAME).put(record);
            } catch (error) {
                resolve(false);
                return;
            }
            transaction.oncomplete = () => resolve(true);
            transaction.onerror = () => resolve(false);
            transaction.onabort = () => resolve(false);
        });
    }

    async function readSketchRecord(recordKey) {
        const adapter = sketchStoreAdapter();
        if (typeof adapter?.get === 'function') {
            return await adapter.get(recordKey);
        }
        const db = await openSketchDatabase();
        if (!db) return null;
        return new Promise((resolve) => {
            let request;
            try {
                const transaction = db.transaction(SKETCH_STORE_NAME, 'readonly');
                request = transaction.objectStore(SKETCH_STORE_NAME).get(recordKey);
            } catch (error) {
                resolve(null);
                return;
            }
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => resolve(null);
        });
    }

    function trackSketchWrite(task) {
        const pending = Promise.resolve(task).catch(() => false);
        pendingSketchWrites.add(pending);
        pending.finally(() => pendingSketchWrites.delete(pending));
        return pending;
    }

    async function flushPendingSaves(timeoutMs) {
        const tasks = Array.from(pendingSketchWrites);
        if (!tasks.length) return true;
        const waitMs = Math.max(0, Number(timeoutMs) || SKETCH_CAPTURE_WAIT_MS);
        let timer = 0;
        const timeout = new Promise((resolve) => {
            timer = window.setTimeout(() => resolve(false), waitMs);
        });
        const completed = Promise.allSettled(tasks).then(() => true);
        const result = await Promise.race([completed, timeout]);
        window.clearTimeout(timer);
        return result;
    }

    function currentSketchPayload(elemId, fallbackValue) {
        try {
            const sketch = window.SimpAISketch?.get?.(elemId);
            if (sketch) {
                return { known: true, payload: normalizedSketchPayload(sketch.getValue?.()) };
            }
        } catch (error) {}
        const parsed = normalizedSketchPayload(fallbackValue);
        if (parsed) return { known: true, payload: parsed };
        if (fallbackValue === null || fallbackValue === undefined || fallbackValue === '') {
            return { known: true, payload: null };
        }
        return { known: false, payload: null };
    }

    function saveSketchValue(key, signature, elemId, fallbackValue, fallbackState, options) {
        const settings = options && typeof options === 'object' ? options : {};
        const owner = String(settings.owner || ownerKey());
        const context = normalizedWorkspaceContext(settings.context || currentWorkspaceContext());
        const recordKey = sketchRecordKey(owner, context, key, signature);
        const current = currentSketchPayload(elemId, fallbackValue);
        if (context.preset && current.known) {
            trackSketchWrite(writeSketchRecord({
                id: recordKey,
                owner,
                context,
                signature: String(signature || ''),
                elem_id: String(elemId || ''),
                payload: current.payload,
                updated_at: Date.now(),
            }));
        }
        return saveWorkspaceValue(
            key,
            signature,
            {
                __simpai_workspace_sketch: true,
                storage_key: recordKey,
                elem_id: String(elemId || ''),
                empty: current.known && current.payload === null,
            },
            fallbackState,
            'sketch',
            settings,
        );
    }

    async function hydrateSketchSnapshot(snapshot, owner, context) {
        const workspace = snapshot?.workspaces?.[owner];
        const values = workspace?.values;
        if (!values || typeof values !== 'object' || !workspaceContextsMatch(workspace.context, context)) return snapshot;
        const targets = Object.entries(values).filter(([, entry]) => (
            entry?.value?.__simpai_workspace_sketch === true
            && typeof entry.value.storage_key === 'string'
        ));
        if (!targets.length) return snapshot;

        const restoredValues = { ...values };
        let restoredCount = 0;
        await Promise.all(targets.map(async ([key, entry]) => {
            const record = await readSketchRecord(entry.value.storage_key);
            if (!record || record.signature !== entry.signature) return;
            if (record.payload === null) {
                restoredValues[key] = { ...entry, value: '' };
                restoredCount += 1;
                return;
            }
            const payload = normalizedSketchPayload(record.payload);
            if (!payload) return;
            restoredValues[key] = { ...entry, value: JSON.stringify(payload) };
            restoredCount += 1;
        }));
        markPerformance('workspace.restore_sketch_values_ready', {
            owner,
            stored: targets.length,
            restored: restoredCount,
        }, true);
        return {
            ...snapshot,
            workspaces: {
                ...snapshot.workspaces,
                [owner]: { ...workspace, values: restoredValues },
            },
        };
    }

    function markPerformance(eventName, data, urgent) {
        try {
            window.SimpAIStudioPerformance?.mark?.(
                eventName,
                data && typeof data === 'object' ? data : {},
                urgent ? { urgent: true } : undefined
            );
        } catch (error) {}
    }

    function controlValueById(elemId) {
        const root = rootNode();
        const field = root.querySelector?.(`#${elemId}`);
        const checkedRadio = field?.querySelector?.('input[type="radio"]:checked');
        if (checkedRadio) return checkedRadio.value;
        const checkbox = field?.querySelector?.('input[type="checkbox"]');
        if (checkbox) return !!checkbox.checked;
        return field?.querySelector?.('textarea, input, select')?.value ?? '';
    }

    function normalizedWorkspaceContext(value) {
        const source = value && typeof value === 'object' ? value : {};
        return {
            preset: normalizedPresetName(source.preset || source.__preset || ''),
            scene_theme: String(source.scene_theme || source.__scene_theme || '').trim(),
        };
    }

    function workspaceContextsMatch(left, right) {
        const expected = normalizedWorkspaceContext(left);
        const actual = normalizedWorkspaceContext(right);
        return !!expected.preset
            && expected.preset === actual.preset
            && expected.scene_theme === actual.scene_theme;
    }

    function currentWorkspaceContext() {
        const params = liveTopbarParams();
        let lastPreset = '';
        try {
            if (typeof topbarLastPreset !== 'undefined') lastPreset = topbarLastPreset;
        } catch (error) {}
        const completedPreset = window.__simpleai_preset_nav_completed?.preset || '';
        const preset = String(params.__preset || params.preset || lastPreset || completedPreset || domPresetName() || '').trim();
        const sceneTheme = String(
            controlValueById('scene_theme')
            || params.__scene_theme
            || params.scene_theme
            || ''
        ).trim();
        return {
            preset,
            scene_theme: sceneTheme,
            lang: String(params.__lang || '').trim(),
            theme: String(params.__theme || '').trim(),
            task_class: String(params.task_class || params.engine || '').trim(),
            gallery_engine: String(params.__gallery_engine_type || params.engine_type || '').trim(),
            generating: !!(params.__is_generating || params.is_generating),
        };
    }

    function reconnectSessionKey() {
        const value = sessionSource();
        return value ? `s_${hashText(value)}` : '';
    }

    function manualReconnectRequestExpired(request) {
        const requestedAt = Number(request?.requested_at || 0);
        return !Number.isFinite(requestedAt)
            || requestedAt <= 0
            || Date.now() - requestedAt > MANUAL_RECONNECT_MAX_AGE_MS;
    }

    function clearManualReconnectRequest(request) {
        try {
            const stored = JSON.parse(localStorage.getItem(MANUAL_RECONNECT_KEY) || 'null');
            if (!request || !stored || Number(stored.requested_at) === Number(request.requested_at)) {
                localStorage.removeItem(MANUAL_RECONNECT_KEY);
            }
        } catch (error) {
            try { localStorage.removeItem(MANUAL_RECONNECT_KEY); } catch (removeError) {}
        }
    }

    function pendingManualReconnectRequest() {
        try {
            const request = JSON.parse(localStorage.getItem(MANUAL_RECONNECT_KEY) || 'null');
            const invalid = !request
                || request.version !== MANUAL_RECONNECT_VERSION
                || !request.owner
                || manualReconnectRequestExpired(request);
            if (invalid) {
                if (request) clearManualReconnectRequest(request);
                return null;
            }
            const currentPath = String(window.location?.pathname || '');
            if (request.pathname && currentPath && request.pathname !== currentPath) {
                clearManualReconnectRequest(request);
                return null;
            }
            const currentSessionKey = reconnectSessionKey();
            if (request.session_key && currentSessionKey && request.session_key !== currentSessionKey) {
                clearManualReconnectRequest(request);
                return null;
            }
            return request;
        } catch (error) {
            return null;
        }
    }

    function captureWritesBlocked() {
        if (captureSuspended || preserveUiSnapshotUntilUnload) return true;
        return !restoreCompleted && !!pendingManualReconnectRequest();
    }

    function storedWorkspaceValueCount(owner, context) {
        const snapshot = workspaceSnapshot(owner);
        const workspace = snapshot?.workspaces?.[owner];
        if (context && !workspaceContextsMatch(workspace?.context, context)) return 0;
        const values = workspace?.values;
        return values && typeof values === 'object' ? Object.keys(values).length : 0;
    }

    function workspaceEntryForElemId(snapshot, owner, elemId) {
        const workspace = snapshot?.workspaces?.[owner];
        const values = workspace?.values;
        if (!values || typeof values !== 'object') return null;
        const field = rootNode().querySelector?.(`#${elemId}`);
        const key = workspaceKey(field);
        const signature = workspaceSignature(field);
        const entry = key ? values[key] : null;
        if (!entry || typeof entry !== 'object') return null;
        if (signature && entry.signature !== signature) return null;
        return { entry, field, key };
    }

    function legacyEntryWasCapturedForReconnect(entry, request) {
        const requestedAt = Number(request?.requested_at || 0);
        const updatedAt = Number(entry?.updated_at || 0);
        return Number.isFinite(requestedAt)
            && requestedAt > 0
            && Number.isFinite(updatedAt)
            && updatedAt >= requestedAt - LEGACY_RECONNECT_CAPTURE_WINDOW_MS
            && updatedAt <= requestedAt + 1000;
    }

    function legacyWorkspaceValuesForRequest(workspace, request) {
        const source = workspace?.values;
        if (!source || typeof source !== 'object' || Array.isArray(source)) return {};
        const root = rootNode();
        const restored = {};
        for (const [key, entry] of Object.entries(source)) {
            const field = root.querySelector?.(`.simpai-workspace-key-${key}`);
            const kind = workspaceKind(field);
            const media = ['image', 'video', 'audio', 'file'].includes(kind);
            if (media || legacyEntryWasCapturedForReconnect(entry, request)) {
                restored[key] = entry;
            }
        }
        return restored;
    }

    function workspaceValueFitsCurrentControl(key, entry) {
        const field = rootNode().querySelector?.(`.simpai-workspace-key-${key}`);
        const kind = workspaceKind(field);
        if (!['number', 'slider'].includes(kind)) return true;
        const value = Number(entry?.value);
        if (!Number.isFinite(value)) return entry?.value === null || entry?.value === '';
        const input = field?.querySelector?.('input');
        const minimum = input?.min;
        const maximum = input?.max;
        if (minimum !== undefined && minimum !== null && minimum !== '' && value < Number(minimum)) return false;
        if (maximum !== undefined && maximum !== null && maximum !== '' && value > Number(maximum)) return false;
        return true;
    }

    function validatedWorkspaceValues(values) {
        const source = values && typeof values === 'object' && !Array.isArray(values) ? values : {};
        const restored = {};
        let rejected = 0;
        for (const [key, entry] of Object.entries(source)) {
            if (workspaceValueFitsCurrentControl(key, entry)) restored[key] = entry;
            else rejected += 1;
        }
        return { values: restored, rejected };
    }

    function requestWorkspaceContext(request) {
        const snapshot = request?.snapshot;
        const owner = request?.owner;
        const workspace = snapshot?.workspaces?.[owner];
        const storedContext = normalizedWorkspaceContext(workspace?.context);
        let context = normalizedWorkspaceContext(request?.context);
        if (storedContext.preset && (!context.preset || storedContext.preset === context.preset)) {
            context = storedContext;
        }
        if (!workspace?.context) {
            const sceneTheme = workspaceEntryForElemId(snapshot, owner, 'scene_theme');
            if (
                sceneTheme
                && legacyEntryWasCapturedForReconnect(sceneTheme.entry, request)
                && typeof sceneTheme.entry.value === 'string'
            ) {
                context.scene_theme = sceneTheme.entry.value.trim();
            }
        }
        return context;
    }

    function materializeWorkspaceSnapshot(snapshot, owner, context, request) {
        const source = snapshot && snapshot.schema === 1 && snapshot.workspaces
            && typeof snapshot.workspaces === 'object'
            ? snapshot
            : emptyRestoreSnapshot();
        const workspace = source.workspaces?.[owner];
        const storedContext = normalizedWorkspaceContext(workspace?.context);
        let values = {};
        let sourceType = 'empty';
        if (workspaceContextsMatch(storedContext, context)) {
            values = workspace?.values && typeof workspace.values === 'object' && !Array.isArray(workspace.values)
                ? workspace.values
                : {};
            sourceType = 'context';
        } else if (!storedContext.preset) {
            values = legacyWorkspaceValuesForRequest(workspace, request);
            sourceType = Object.keys(values).length ? 'legacy_recent' : 'legacy_skipped';
        } else {
            sourceType = 'context_mismatch';
        }
        const validated = validatedWorkspaceValues(values);
        return {
            snapshot: {
                schema: 1,
                workspaces: {
                    [owner]: {
                        context: normalizedWorkspaceContext(context),
                        values: validated.values,
                        updated_at: Number(workspace?.updated_at || source.updated_at || Date.now()),
                    },
                },
                updated_at: Number(source.updated_at || Date.now()),
            },
            sourceType,
            valueCount: Object.keys(validated.values).length,
            rejectedCount: validated.rejected,
        };
    }

    function markManualReconnect(options) {
        const settings = options && typeof options === 'object' ? options : {};
        const owner = ownerKey();
        const liveContext = normalizedWorkspaceContext(currentWorkspaceContext());
        preserveUiSnapshotUntilUnload = settings.capture === false;
        if (preserveUiSnapshotUntilUnload) {
            window.clearTimeout(captureTimer);
            captureTimer = 0;
        } else {
            prepareForReload({ force: true, owner, context: liveContext });
        }
        restoreCompleted = false;
        restoreRequested = false;
        restoreRequest = null;
        restoreLayoutEnabled = true;
        automaticRestoreCandidate = null;
        restoreStartedAt = 0;
        const uiSnapshot = readUiSnapshot(owner);
        const storedUiContext = normalizedWorkspaceContext(uiSnapshot?.context);
        const context = liveContext.preset ? liveContext : storedUiContext;
        const dataSnapshot = workspaceSnapshot(owner) || emptyWorkspaceSnapshot();
        const requestedAt = Date.now();
        const request = {
            version: MANUAL_RECONNECT_VERSION,
            owner,
            session_key: reconnectSessionKey(),
            pathname: String(window.location?.pathname || ''),
            requested_at: requestedAt,
            context,
            snapshot: dataSnapshot,
            value_count: storedWorkspaceValueCount(owner, context),
        };
        try {
            localStorage.setItem(MANUAL_RECONNECT_KEY, JSON.stringify(request));
        } catch (error) {
            return false;
        }
        captureSuspended = true;
        markPerformance('workspace.reconnect_snapshot_saved', {
            owner,
            preset: context.preset || '',
            scene_theme: context.scene_theme || '',
            value_count: request.value_count,
            capture: settings.capture !== false,
        }, true);
        return true;
    }

    function prepareForManualReconnect(options) {
        return markManualReconnect(options);
    }

    function prepareInitialSystemParams(systemParams) {
        const params = systemParams && typeof systemParams === 'object' ? systemParams : {};
        const request = activeRestoreRequest();
        if (!request) return params;
        request.context = requestWorkspaceContext(request);
        if (!restoreProgressActive) startRestoreProgress(request);
        else restoreProgressUpdate(12, restoreProgressText('Restoring workspace', 'Restoring workspace'));
        restoreRequest = request;
        restoreLayoutEnabled = request.source !== 'browser_history';
        automaticRestoreCandidate = null;
        captureSuspended = true;
        restoreCompleted = false;
        restoreRequested = false;
        restoreStartedAt = Date.now();
        const context = normalizedWorkspaceContext(request.context);
        const preset = String(context.preset || '').trim();
        const sceneTheme = String(context.scene_theme || '').trim();
        if (preset) {
            params.__preset = preset;
            params.bar_button = preset;
        }
        if (sceneTheme) {
            params.scene_theme = sceneTheme;
            params.__scene_theme = sceneTheme;
            params.__scene_theme_preset = preset;
        }
        params.__workspace_reconnect_pending = true;
        params.__workspace_reconnect_owner = request.owner;
        params.__workspace_reconnect_requested_at = request.requested_at;
        if (request.source !== 'browser_history') clearManualReconnectRequest(request);
        else clearPageLifecycle();
        markPerformance('workspace.restore_marker_consumed', {
            owner: request.owner,
            requested_at: request.requested_at,
            source: request.source || 'manual_reconnect',
        }, true);
        markPerformance('workspace.restore_bootstrap', {
            owner: request.owner,
            preset,
            scene_theme: sceneTheme,
        }, true);
        return params;
    }

    function normalizedPresetName(value) {
        return String(value || '').replace(/\s*\u2B07\s*$/, '').trim();
    }

    function topbarPresetButtons() {
        try {
            if (typeof window.getTopbarBarButtons === 'function') {
                const buttons = window.getTopbarBarButtons();
                if (Array.isArray(buttons) && buttons.length) return buttons;
            }
        } catch (error) {}
        const root = rootNode();
        const roots = root === document ? [root] : [root, document];
        const buttons = new Map();
        for (const candidateRoot of roots) {
            for (const button of Array.from(candidateRoot?.querySelectorAll?.('[id^="bar"]') || [])) {
                if (!/^bar\d+$/.test(String(button?.id || ''))) continue;
                const target = button.matches?.('button') ? button : (button.querySelector?.('button') || button);
                buttons.set(String(button.id), target);
            }
        }
        return Array.from(buttons.values());
    }

    function presetNameForButton(button) {
        return normalizedPresetName(
            button?.getAttribute?.('data-original-text')
            || button?.querySelector?.('[data-original-text]')?.getAttribute?.('data-original-text')
            || button?.textContent
            || ''
        );
    }

    function currentPresetName() {
        const params = liveTopbarParams();
        let lastPreset = '';
        try {
            if (typeof topbarLastPreset !== 'undefined') lastPreset = topbarLastPreset;
        } catch (error) {}
        const completedPreset = window.__simpleai_preset_nav_completed?.preset || '';
        return normalizedPresetName(params.__preset || params.preset || lastPreset || completedPreset || domPresetName() || '');
    }

    function presetNavigationActive() {
        try {
            return document.documentElement?.classList?.contains?.('simpai-preset-nav-active') === true;
        } catch (error) {
            return false;
        }
    }

    function presetNavigationCompletion() {
        const value = window.__simpleai_preset_nav_completed;
        const completion = value && typeof value === 'object' ? value : {};
        return {
            preset: normalizedPresetName(completion.preset || ''),
            seq: Number(completion.seq || window.__simpleai_preset_nav_completion_seq || 0),
        };
    }

    function wait(delay) {
        return new Promise((resolve) => window.setTimeout(resolve, Math.max(0, Number(delay) || 0)));
    }

    async function waitForStudioUiReady(request) {
        updateRestoreProgress(16, 'Waiting for server');
        const deadline = Date.now() + RESTORE_READY_TIMEOUT_MS;
        while (Date.now() < deadline) {
            if (window.__simpleai_ui_ready === true) {
                await wait(RESTORE_READY_SETTLE_MS);
                updateRestoreProgress(30, 'Restoring workspace');
                return true;
            }
            await wait(100);
        }
        markPerformance('workspace.restore_ui_ready_timeout', {
            owner: request?.owner || '',
            preset: normalizedPresetName(request?.context?.preset || ''),
        }, true);
        return false;
    }

    async function ensureReconnectPreset(request) {
        const target = normalizedPresetName(request?.context?.preset || '');
        if (!target) {
            updateRestoreProgress(48, 'Restoring parameters');
            return true;
        }
        updateRestoreProgress(38, 'Switching to {preset}...', { preset: target });
        if (currentPresetName() === target && !presetNavigationActive()) {
            updateRestoreProgress(64, 'Applying {preset}...', { preset: target });
            return true;
        }

        let baselineCompletion = presetNavigationCompletion();
        let buttonClicked = false;
        let candidateNames = [];
        const deadline = Date.now() + 15000;
        while (Date.now() < deadline) {
            if (!buttonClicked) {
                const buttons = topbarPresetButtons();
                candidateNames = buttons.map(presetNameForButton).filter(Boolean);
                const button = buttons.find((candidate) => presetNameForButton(candidate) === target);
                if (button && typeof button.click === 'function') {
                    baselineCompletion = presetNavigationCompletion();
                    buttonClicked = true;
                    button.click();
                    markPerformance('workspace.restore_preset_fallback_click', {
                        preset: target,
                        current_preset: currentPresetName(),
                    }, true);
                }
            }
            const completion = presetNavigationCompletion();
            const navigationFinished = buttonClicked
                && completion.seq > baselineCompletion.seq
                && completion.preset === target;
            if (currentPresetName() === target && !presetNavigationActive() && navigationFinished) {
                await wait(RESTORE_POST_NAV_SETTLE_MS);
                updateRestoreProgress(68, 'Applying {preset}...', { preset: target });
                markPerformance('workspace.restore_preset_navigation_ready', {
                    preset: target,
                    completion_seq: completion.seq,
                }, true);
                return true;
            }
            await wait(100);
        }
        markPerformance('workspace.restore_preset_button_timeout', {
            expected_preset: target,
            current_preset: currentPresetName(),
            button_clicked: buttonClicked,
            candidates: candidateNames.slice(0, 40),
        }, true);
        finishRestoreProgress(false, 'Workspace restore timed out');
        return false;
    }

    function emptyRestoreSnapshot() {
        return { schema: 1, workspaces: {}, updated_at: Date.now() };
    }

    async function prepareRestoreRequest(fallbackState, fallbackOwner) {
        const request = restoreRequest || activeRestoreRequest();
        if (!request) return [emptyRestoreSnapshot(), ownerKey() || fallbackOwner || 'local'];
        request.context = requestWorkspaceContext(request);
        restoreRequest = request;
        if (!restoreProgressActive) startRestoreProgress(request);
        restoreLayoutEnabled = request.source !== 'browser_history';
        if (!restoreStartedAt) restoreStartedAt = Date.now();
        captureSuspended = true;
        restoreRequested = true;
        if (request.source !== 'browser_history') clearManualReconnectRequest(request);
        const uiReady = await waitForStudioUiReady(request);
        const presetReady = await ensureReconnectPreset(request);
        if (!presetReady) {
            markPerformance('workspace.restore_preset_timeout', {
                expected_preset: normalizedPresetName(request?.context?.preset || ''),
                current_preset: currentPresetName(),
            }, true);
            return [emptyRestoreSnapshot(), request.owner];
        }
        await prepareRestoredLayout(request);
        const requestSnapshot = request.snapshot
            && request.snapshot.schema === 1
            && request.snapshot.workspaces
            && typeof request.snapshot.workspaces === 'object'
            ? request.snapshot
            : null;
        const stored = workspaceSnapshot(request.owner);
        const fallback = fallbackState && typeof fallbackState === 'object' ? fallbackState : null;
        const candidate = requestSnapshot || stored || fallback || emptyRestoreSnapshot();
        const hydratedCandidate = await hydrateSketchSnapshot(
            candidate,
            request.owner,
            request.context,
        );
        const materialized = materializeWorkspaceSnapshot(
            hydratedCandidate,
            request.owner,
            request.context,
            request,
        );
        const snapshot = materialized.snapshot;
        request.restore_snapshot = snapshot;
        updateRestoreProgress(82, 'Restoring parameters');
        markPerformance('workspace.restore_values_ready', {
            owner: request.owner,
            preset: currentPresetName(),
            scene_theme: String(request.context?.scene_theme || ''),
            value_count: materialized.valueCount,
            rejected_values: materialized.rejectedCount,
            ui_ready: uiReady,
            snapshot_source: requestSnapshot
                ? `${request.source === 'browser_history' ? 'browser_history' : 'manual_reconnect'}:${materialized.sourceType}`
                : `${stored ? 'workspace_storage' : 'browser_state'}:${materialized.sourceType}`,
        }, true);
        return [snapshot, request.owner];
    }

    function workspaceKey(node) {
        if (!node?.classList) return '';
        const className = Array.from(node.classList).find((value) => value.startsWith('simpai-workspace-key-'));
        return className ? className.slice('simpai-workspace-key-'.length) : '';
    }

    function workspaceSignature(node) {
        if (!node?.classList) return '';
        const className = Array.from(node.classList).find((value) => value.startsWith('simpai-workspace-signature-'));
        return className ? className.slice('simpai-workspace-signature-'.length) : '';
    }

    function workspaceKind(node) {
        if (!node?.classList) return '';
        const className = Array.from(node.classList).find((value) => value.startsWith('simpai-workspace-kind-'));
        return className ? className.slice('simpai-workspace-kind-'.length) : '';
    }

    function closestWorkspaceField(node) {
        return node?.closest?.('.simpai-workspace-field') || null;
    }

    function domWorkspaceValue(field) {
        const kind = workspaceKind(field);
        if (kind === 'checkbox') {
            return !!field.querySelector?.('input[type="checkbox"]')?.checked;
        }
        if (kind === 'radio') {
            return field.querySelector?.('input[type="radio"]:checked')?.value ?? null;
        }
        if (kind === 'checkboxgroup') {
            return Array.from(field.querySelectorAll?.('input[type="checkbox"]:checked') || []).map((input) => input.value);
        }
        if (kind === 'textbox' || kind === 'dropdown') {
            return field.querySelector?.('textarea, input, select')?.value ?? null;
        }
        if (kind === 'number' || kind === 'slider') {
            const rawValue = field.querySelector?.('input')?.value;
            if (rawValue === undefined || rawValue === '') return null;
            const number = Number(rawValue);
            return Number.isFinite(number) ? number : rawValue;
        }
        return undefined;
    }

    function markRestoredSceneParameterEdit(request) {
        const snapshot = request?.restore_snapshot || request?.snapshot;
        const owner = String(request?.owner || ownerKey());
        const elemIds = [
            'scene_var_number3',
            'scene_var_number7',
            'scene_switch_option2',
            'scene_switch_option3',
            'scene_var_number2',
            'scene_video_duration',
        ];
        for (const elemId of elemIds) {
            const resolved = workspaceEntryForElemId(snapshot, owner, elemId);
            if (!resolved?.entry || !resolved?.field) continue;
            const control = resolved.field.querySelector?.('input, textarea, select');
            if (!control?.dispatchEvent) continue;
            control.dispatchEvent(new Event('input', { bubbles: true }));
            markPerformance('workspace.restore_scene_defaults_cancelled', { elem_id: elemId }, true);
            return true;
        }
        return false;
    }

    function captureWorkspaceField(node, options) {
        const settings = options && typeof options === 'object' ? options : {};
        if (!settings.force && captureWritesBlocked()) return false;
        const field = closestWorkspaceField(node);
        const key = workspaceKey(field);
        const signature = workspaceSignature(field);
        if (!field || !key || !signature) return false;
        if (workspaceKind(field) === 'sketch') {
            const input = field.querySelector?.('textarea, input[type="text"]');
            saveSketchValue(key, signature, field.id || '', input?.value ?? '', null, settings);
            return true;
        }
        const value = domWorkspaceValue(field);
        if (value === undefined) return false;
        saveWorkspaceValue(key, signature, value, null, workspaceKind(field), settings);
        return true;
    }

    function captureAllWorkspaceFields(options) {
        const settings = options && typeof options === 'object' ? options : {};
        if (!settings.force && captureWritesBlocked()) return 0;
        const root = rootNode();
        let captured = 0;
        for (const field of Array.from(root.querySelectorAll?.('.simpai-workspace-field') || [])) {
            if (captureWorkspaceField(field, settings)) captured += 1;
        }
        return captured;
    }

    function selectedTabIndex(nav) {
        const buttons = Array.from(nav?.querySelectorAll?.(':scope > button, button[role="tab"]') || []);
        const selected = buttons.findIndex((button) => (
            button.classList.contains('selected') || button.getAttribute('aria-selected') === 'true'
        ));
        return { buttons, selected };
    }

    function normalizedTabText(value) {
        return String(value || '').replace(/\s+/g, ' ').trim();
    }

    function tabButtonKey(button) {
        return String(
            button?.getAttribute?.('data-tab-id') ||
            button?.id ||
            button?.getAttribute?.('aria-controls') ||
            ''
        );
    }

    function tabButtonCandidates(nav) {
        const wrapper = nav?.closest?.('.tab-wrapper') || nav?.parentElement;
        const candidates = [
            ...Array.from(nav?.querySelectorAll?.(':scope > button, button[role="tab"]') || []),
            ...Array.from(wrapper?.querySelectorAll?.('.overflow-dropdown button') || []),
        ];
        return candidates.filter((button, index) => candidates.indexOf(button) === index);
    }

    function tabNavigations(root) {
        return Array.from(root.querySelectorAll?.('.tab-nav, [role="tablist"]') || []);
    }

    function collectTabs(root) {
        return tabNavigations(root).map((nav, index) => {
            const state = selectedTabIndex(nav);
            const host = nav.closest?.('[id]');
            return {
                host_id: String(host?.id || ''),
                nav_index: index,
                selected: state.selected,
                selected_key: tabButtonKey(state.buttons[state.selected]),
                selected_text: normalizedTabText(state.buttons[state.selected]?.textContent),
            };
        }).filter((entry) => entry.selected >= 0);
    }

    function advancedModelsTabButton(root) {
        const roots = root === document ? [root] : [root, document];
        for (const candidateRoot of roots) {
            const tabs = candidateRoot?.querySelector?.('#advanced_tabs');
            if (!tabs) continue;
            const buttons = Array.from(tabs.querySelectorAll?.('[role="tab"], .tab-nav > button') || []);
            const matched = buttons.find((button) => {
                const label = normalizedTabText(
                    button.getAttribute?.('data-original-text')
                    || button.getAttribute?.('aria-label')
                    || button.textContent
                ).toLowerCase();
                return label === 'models' || label === 'model' || label === '模型';
            });
            if (matched) return matched;
        }
        return null;
    }

    function modelsPageActive(root) {
        const button = advancedModelsTabButton(root);
        return !!button && (
            button.classList?.contains?.('selected')
            || button.getAttribute?.('aria-selected') === 'true'
        );
    }

    function collectCustomUiState(root) {
        let models = null;
        let infiniteCanvas = null;
        try {
            models = window.simpleaiReadModelsJsPanelWorkspaceState?.() || null;
        } catch (error) {}
        try {
            infiniteCanvas = window.SimpAIInfiniteCanvasWorkbench?.workspaceSnapshot?.() || null;
        } catch (error) {}
        return {
            models_active: modelsPageActive(root),
            models,
            infinite_canvas: infiniteCanvas,
        };
    }

    async function restoreCustomUiState(request) {
        const owner = String(request?.owner || ownerKey());
        const snapshot = readUiSnapshot(owner);
        if (!snapshot || !workspaceContextsMatch(snapshot.context, request?.context)) return false;
        const custom = snapshot.custom && typeof snapshot.custom === 'object' ? snapshot.custom : {};
        let restoredModels = false;
        let restoredCanvas = false;

        if (custom.models && typeof window.simpleaiRestoreModelsJsPanelWorkspaceState === 'function') {
            try {
                restoredModels = !!(await window.simpleaiRestoreModelsJsPanelWorkspaceState(custom.models));
            } catch (error) {}
        }

        if (restoreLayoutEnabled && custom.infinite_canvas?.open === true) {
            try {
                if (!window.SimpAIInfiniteCanvasWorkbench?.restoreWorkspaceRecovery) {
                    await window.loadSimpleAILazyAssetGroup?.('infiniteCanvas');
                }
                restoredCanvas = !!window.SimpAIInfiniteCanvasWorkbench?.restoreWorkspaceRecovery?.(custom.infinite_canvas);
            } catch (error) {}
        }

        markPerformance('workspace.restore_custom_ui_finished', {
            owner,
            models: restoredModels,
            infinite_canvas: restoredCanvas,
        }, true);
        return restoredModels || restoredCanvas;
    }

    function accordionToggles(root) {
        return Array.from(root.querySelectorAll?.(
            'button.label-wrap, button[aria-expanded]:not([role="tab"])'
        ) || []);
    }

    function accordionIsOpen(button) {
        const expanded = button?.getAttribute?.('aria-expanded');
        if (expanded === 'true' || expanded === 'false') return expanded === 'true';
        return !!button?.classList?.contains?.('open');
    }

    function collectAccordions(root) {
        const buttonEntries = accordionToggles(root).map((button, index) => ({
            kind: 'button',
            host_id: String(button.closest?.('[id]')?.id || ''),
            index,
            open: accordionIsOpen(button),
        }));
        const detailEntries = Array.from(root.querySelectorAll?.('details') || []).map((details, index) => ({
            kind: 'details',
            host_id: String(details.id || details.closest?.('[id]')?.id || ''),
            index,
            open: !!details.open,
        }));
        return buttonEntries.concat(detailEntries);
    }

    function collectFocusState() {
        const active = document.activeElement;
        const field = closestWorkspaceField(active);
        const key = workspaceKey(field);
        if (!active || !key) return null;
        const controls = Array.from(field.querySelectorAll('input, textarea, select'));
        const controlIndex = controls.indexOf(active);
        const selectionStart = typeof active.selectionStart === 'number' ? active.selectionStart : null;
        const selectionEnd = typeof active.selectionEnd === 'number' ? active.selectionEnd : null;
        return {
            key,
            control_index: Math.max(0, controlIndex),
            selection_start: selectionStart,
            selection_end: selectionEnd,
        };
    }

    function captureNow(options) {
        const settings = options && typeof options === 'object' ? options : {};
        if (!settings.force && captureWritesBlocked()) return false;
        const root = rootNode();
        const owner = String(settings.owner || ownerKey());
        const snapshot = {
            version: UI_STATE_VERSION,
            owner,
            context: normalizedWorkspaceContext(settings.context || currentWorkspaceContext()),
            tabs: collectTabs(root),
            accordions: collectAccordions(root),
            scroll_x: Math.max(0, Number(window.scrollX || 0)),
            scroll_y: Math.max(0, Number(window.scrollY || 0)),
            focus: collectFocusState(),
            custom: collectCustomUiState(root),
            updated_at: Date.now(),
        };
        try {
            localStorage.setItem(storageKey(owner), JSON.stringify(snapshot));
            return true;
        } catch (error) {
            return false;
        }
    }

    function scheduleCapture(delay) {
        if (captureWritesBlocked()) return;
        window.clearTimeout(captureTimer);
        captureTimer = window.setTimeout(captureNow, Math.max(0, Number(delay) || 180));
    }

    function readUiSnapshot(owner) {
        const expectedOwner = String(owner || ownerKey());
        try {
            const key = storageKey(expectedOwner);
            const value = JSON.parse(localStorage.getItem(key) || 'null');
            if (!value || value.version !== UI_STATE_VERSION || value.owner !== expectedOwner || snapshotExpired(value)) {
                if (snapshotExpired(value)) localStorage.removeItem(key);
                return null;
            }
            return value;
        } catch (error) {
            return null;
        }
    }

    function findByHostOrIndex(items, hostId, index) {
        if (hostId) {
            const match = items.find((item) => item.closest?.('[id]')?.id === hostId || item.id === hostId);
            if (match) return match;
        }
        return items[index] || null;
    }

    function restoreTabs(root, entries) {
        const navs = tabNavigations(root);
        for (const entry of Array.isArray(entries) ? entries : []) {
            const nav = findByHostOrIndex(navs, entry.host_id, entry.nav_index);
            if (!nav) continue;
            const state = selectedTabIndex(nav);
            const candidates = tabButtonCandidates(nav);
            const selectedKey = String(entry.selected_key || '');
            const selectedText = normalizedTabText(entry.selected_text);
            const target = candidates.find((button) => selectedKey && tabButtonKey(button) === selectedKey)
                || candidates.find((button) => selectedText && normalizedTabText(button.textContent) === selectedText)
                || state.buttons[Number(entry.selected)];
            const current = state.buttons[state.selected];
            if (target && target !== current) target.click();
        }
    }

    function restoreAccordions(root, entries) {
        const buttons = accordionToggles(root);
        const details = Array.from(root.querySelectorAll?.('details') || []);
        for (const entry of Array.isArray(entries) ? entries : []) {
            if (entry.kind === 'details') {
                const target = findByHostOrIndex(details, entry.host_id, entry.index);
                if (target && target.open !== !!entry.open) target.open = !!entry.open;
                continue;
            }
            const target = findByHostOrIndex(buttons, entry.host_id, entry.index);
            if (!target) continue;
            const isOpen = accordionIsOpen(target);
            if (isOpen !== !!entry.open) target.click();
        }
    }

    function restoreFocus(root, focus) {
        if (!focus?.key) return;
        const field = root.querySelector?.(`.simpai-workspace-key-${focus.key}`);
        if (!field) return;
        const controls = Array.from(field.querySelectorAll('input, textarea, select'));
        const control = controls[Number(focus.control_index) || 0];
        if (!control || control.disabled) return;
        try {
            control.focus({ preventScroll: true });
        } catch (error) {
            control.focus();
        }
        if (typeof control.setSelectionRange === 'function' && Number.isFinite(focus.selection_start)) {
            try {
                control.setSelectionRange(focus.selection_start, focus.selection_end ?? focus.selection_start);
            } catch (error) {}
        }
    }

    function syncRestoredDynamicVisibility() {
        try { window.syncTopbarMountedPanelVisibility?.('workspace_restore'); } catch (error) {}
        try { window.syncGradio6MountedDynamicVisibility?.(); } catch (error) {}
        try { window.syncMainLayoutResponsiveStack?.(); } catch (error) {}
    }

    function applyRestoredLayout(root, snapshot) {
        restoreTabs(root, snapshot.tabs);
        if (snapshot?.custom?.models_active) {
            const modelsButton = advancedModelsTabButton(root);
            if (modelsButton && !modelsPageActive(root)) modelsButton.click();
        }
        restoreAccordions(root, snapshot.accordions);
    }

    function mountedWorkspaceFieldCount() {
        return Array.from(rootNode().querySelectorAll?.('.simpai-workspace-field') || []).length;
    }

    async function prepareRestoredLayout(request) {
        if (!restoreLayoutEnabled) return false;
        const snapshot = readUiSnapshot(String(request?.owner || ownerKey()));
        if (!snapshot) return false;

        updateRestoreProgress(72, 'Restoring workspace');
        applyRestoredLayout(rootNode(), snapshot);
        syncRestoredDynamicVisibility();

        const deadline = Date.now() + RESTORE_LAYOUT_SETTLE_TIMEOUT_MS;
        let previousCount = -1;
        let stablePolls = 0;
        let mountedFields = 0;
        while (Date.now() < deadline) {
            await wait(RESTORE_LAYOUT_POLL_MS);
            mountedFields = mountedWorkspaceFieldCount();
            if (mountedFields === previousCount && !presetNavigationActive()) stablePolls += 1;
            else stablePolls = 0;
            previousCount = mountedFields;
            if (stablePolls >= RESTORE_LAYOUT_STABLE_POLLS) break;
        }

        applyRestoredLayout(rootNode(), snapshot);
        syncRestoredDynamicVisibility();
        await wait(RESTORE_POST_LAYOUT_SETTLE_MS);
        markPerformance('workspace.restore_layout_ready', {
            owner: String(request?.owner || ''),
            mounted_fields: mountedFields,
            stable: stablePolls >= RESTORE_LAYOUT_STABLE_POLLS,
        }, true);
        return true;
    }

    function restoreUiState(owner) {
        if (!restoreRequested && !owner) return false;
        const restoreOwner = String(owner || restoreRequest?.owner || ownerKey());
        const snapshot = readUiSnapshot(restoreOwner);
        if (!snapshot) return false;
        const root = rootNode();
        if (restoreLayoutEnabled) {
            applyRestoredLayout(root, snapshot);
        }
        restoreFocus(root, snapshot.focus);
        window.requestAnimationFrame(() => {
            window.scrollTo(Number(snapshot.scroll_x) || 0, Number(snapshot.scroll_y) || 0);
        });
        syncRestoredDynamicVisibility();
        return true;
    }

    function scheduleUiRestore() {
        window.setTimeout(restoreUiState, RESTORE_DELAY_MS);
        window.setTimeout(restoreUiState, 1000);
    }

    async function finishRestoreAsync() {
        if (!restoreRequested || restoreCompleted) return false;
        const request = restoreRequest || pendingManualReconnectRequest();
        if (!request) return false;
        try {
            await restoreCustomUiState(request);
        } catch (error) {
            markPerformance('workspace.restore_custom_ui_failed', {
                owner: request.owner || '',
                message: String(error?.message || error || ''),
            }, true);
        }
        return finishRestore();
    }

    function finishRestore() {
        if (!restoreRequested || restoreCompleted) return false;
        const request = restoreRequest || pendingManualReconnectRequest();
        if (!request) return false;
        restoreCompleted = true;
        markRestoredSceneParameterEdit(request);
        restoreUiState(request.owner);
        finishRestoreProgress(true);
        if (request.source !== 'browser_history') clearManualReconnectRequest(request);
        else clearPageLifecycle();
        markPerformance('workspace.restore_finished', {
            owner: request.owner,
            preset: currentPresetName(),
            scene_theme: String(
                window.simpleaiTopbarSystemParams?.__scene_theme
                || window.simpleaiTopbarSystemParams?.scene_theme
                || ''
            ),
            elapsed_ms: restoreStartedAt ? Math.max(0, Date.now() - restoreStartedAt) : 0,
        }, true);
        window.dispatchEvent(new CustomEvent('simpai:workspace-restored', {
            detail: {
                owner: request.owner,
                restoredAt: Date.now(),
                source: request.source || 'manual_reconnect',
            },
        }));
        restoreRequested = false;
        restoreRequest = null;
        automaticRestoreCandidate = null;
        preserveUiSnapshotUntilUnload = false;
        captureSuspended = false;
        return true;
    }

    function prepareForReload(options) {
        const settings = options && typeof options === 'object' ? options : {};
        const owner = String(settings.owner || ownerKey());
        const context = normalizedWorkspaceContext(settings.context || currentWorkspaceContext());
        const captureOptions = { ...settings, owner, context };
        if (!settings.force && captureWritesBlocked()) {
            markPerformance('workspace.pagehide_capture', {
                owner,
                preset: context.preset,
                scene_theme: context.scene_theme,
                captured_fields: 0,
                ui_snapshot_saved: false,
                skipped: true,
            }, true);
            return true;
        }
        try {
            const canvasTask = window.SimpAIInfiniteCanvasWorkbench?.prepareWorkspaceRecovery?.();
            if (canvasTask && typeof canvasTask.then === 'function') {
                trackSketchWrite(canvasTask);
            }
        } catch (error) {}
        const active = document.activeElement;
        captureWorkspaceField(active, captureOptions);
        if (active?.dispatchEvent) {
            try { active.dispatchEvent(new Event('input', { bubbles: true })); } catch (error) {}
            try { active.dispatchEvent(new Event('change', { bubbles: true })); } catch (error) {}
        }
        const capturedFields = captureAllWorkspaceFields(captureOptions);
        const uiSnapshotSaved = captureNow(captureOptions);
        markPerformance('workspace.pagehide_capture', {
            owner,
            preset: context.preset,
            scene_theme: context.scene_theme,
            captured_fields: capturedFields,
            ui_snapshot_saved: uiSnapshotSaved,
            skipped: false,
        }, true);
        return true;
    }

    function prepareForPageHide() {
        prepareForReload();
        rememberPageLifecycle('pagehide');
        return true;
    }

    window.SimpAIWorkspaceRecovery = {
        ownerKey,
        workspaceSnapshot,
        saveValue,
        saveSketchValue,
        hydrateSketchSnapshot,
        captureAllWorkspaceFields,
        captureNow,
        flushPendingSaves,
        prepareForReload,
        prepareForManualReconnect,
        markManualReconnect,
        pendingManualReconnectRequest,
        automaticRestoreRequest,
        prepareInitialSystemParams,
        prepareRestoreRequest,
        finishRestoreAsync,
        finishRestore,
        restoreUiState,
        prepareForPageHide,
    };

    captureSuspended = !!pendingManualReconnectRequest();

    document.addEventListener('input', (event) => {
        captureWorkspaceField(event.target);
        scheduleCapture(180);
    }, true);
    document.addEventListener('change', (event) => {
        captureWorkspaceField(event.target);
        scheduleCapture(100);
    }, true);
    document.addEventListener('click', () => scheduleCapture(220), true);
    window.addEventListener('scroll', () => scheduleCapture(250), { passive: true });
    window.addEventListener('pagehide', prepareForPageHide);
    window.addEventListener('beforeunload', prepareForPageHide);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') prepareForPageHide();
    });
    window.addEventListener('pageshow', (event) => {
        if (event?.persisted) window.__simpai_page_was_restored = true;
    });

    if (typeof window.onUiLoaded === 'function') {
        window.onUiLoaded(scheduleUiRestore);
    } else if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', scheduleUiRestore, { once: true });
    } else {
        scheduleUiRestore();
    }
})();
