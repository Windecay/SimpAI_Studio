(function () {
    'use strict';

    if (window.SimpAIWorkspaceRecovery) return;

    const UI_STATE_VERSION = 1;
    const UI_STATE_PREFIX = 'simpai.studio.workspace.ui.v1.';
    const DATA_STATE_PREFIX = 'simpai.studio.workspace.data.v1.';
    const MANUAL_RECONNECT_KEY = 'simpai.studio.workspace.manual-reconnect.v1';
    const MANUAL_RECONNECT_VERSION = 1;
    const MANUAL_RECONNECT_MAX_AGE_MS = 30 * 60 * 1000;
    const RESTORE_DELAY_MS = 450;
    const RESTORE_READY_TIMEOUT_MS = 30 * 1000;
    const RESTORE_READY_SETTLE_MS = 650;
    const RESTORE_POST_NAV_SETTLE_MS = 350;
    const WORKSPACE_STATE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

    let restoreCompleted = false;
    let restoreRequested = false;
    let restoreRequest = null;
    let restoreStartedAt = 0;
    let preserveUiSnapshotUntilUnload = false;
    let captureSuspended = false;
    let captureTimer = 0;

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

    function ownerSource() {
        const params = window.simpleaiTopbarSystemParams && typeof window.simpleaiTopbarSystemParams === 'object'
            ? window.simpleaiTopbarSystemParams
            : {};
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

    function emptyWorkspaceSnapshot() {
        return { schema: 1, workspaces: {}, updated_at: Date.now() };
    }

    function snapshotExpired(snapshot) {
        const updatedAt = Number(snapshot?.updated_at || 0);
        return Number.isFinite(updatedAt) && updatedAt > 0 && Date.now() - updatedAt > WORKSPACE_STATE_MAX_AGE_MS;
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

    function saveValue(key, signature, value, fallbackState, kind) {
        if (captureWritesBlocked()) {
            const fallback = fallbackState && typeof fallbackState === 'object' && !Array.isArray(fallbackState)
                ? fallbackState
                : null;
            return fallback || workspaceSnapshot() || emptyWorkspaceSnapshot();
        }
        const owner = ownerKey();
        const source = workspaceSnapshot()
            || (fallbackState && typeof fallbackState === 'object' && !Array.isArray(fallbackState) ? fallbackState : null)
            || emptyWorkspaceSnapshot();
        const workspaces = source.workspaces && typeof source.workspaces === 'object' && !Array.isArray(source.workspaces)
            ? { ...source.workspaces }
            : {};
        const current = workspaces[owner] && typeof workspaces[owner] === 'object' ? workspaces[owner] : {};
        const values = current.values && typeof current.values === 'object' && !Array.isArray(current.values)
            ? { ...current.values }
            : {};
        const now = Date.now();
        values[String(key || '')] = {
            signature: String(signature || ''),
            value: storedWorkspaceValue(value, kind),
            updated_at: now,
        };
        workspaces[owner] = { ...current, values, updated_at: now };
        const next = { ...source, schema: 1, workspaces, updated_at: now };
        saveWorkspaceSnapshot(next, owner);
        return next;
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
        return field?.querySelector?.('textarea, input, select')?.value ?? '';
    }

    function currentWorkspaceContext() {
        const params = window.simpleaiTopbarSystemParams && typeof window.simpleaiTopbarSystemParams === 'object'
            ? window.simpleaiTopbarSystemParams
            : {};
        const preset = String(params.__preset || params.preset || '').trim();
        const sceneTheme = String(
            params.__scene_theme
            || params.scene_theme
            || controlValueById('scene_theme')
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

    function storedWorkspaceValueCount(owner) {
        const snapshot = workspaceSnapshot(owner);
        const values = snapshot?.workspaces?.[owner]?.values;
        return values && typeof values === 'object' ? Object.keys(values).length : 0;
    }

    function markManualReconnect(options) {
        const settings = options && typeof options === 'object' ? options : {};
        preserveUiSnapshotUntilUnload = settings.capture === false;
        if (preserveUiSnapshotUntilUnload) {
            window.clearTimeout(captureTimer);
            captureTimer = 0;
        } else {
            prepareForReload();
        }
        restoreCompleted = false;
        restoreRequested = false;
        restoreRequest = null;
        restoreStartedAt = 0;
        const owner = ownerKey();
        const uiSnapshot = readUiSnapshot(owner);
        const context = uiSnapshot?.context || currentWorkspaceContext();
        const dataSnapshot = workspaceSnapshot(owner) || emptyWorkspaceSnapshot();
        const request = {
            version: MANUAL_RECONNECT_VERSION,
            owner,
            session_key: reconnectSessionKey(),
            pathname: String(window.location?.pathname || ''),
            requested_at: Date.now(),
            context,
            snapshot: dataSnapshot,
            value_count: storedWorkspaceValueCount(owner),
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
        const request = pendingManualReconnectRequest();
        if (!request) return params;
        captureSuspended = true;
        restoreCompleted = false;
        restoreRequested = false;
        restoreRequest = request;
        restoreStartedAt = Date.now();
        const context = request.context && typeof request.context === 'object' ? request.context : {};
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
        clearManualReconnectRequest(request);
        markPerformance('workspace.restore_marker_consumed', {
            owner: request.owner,
            requested_at: request.requested_at,
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
        const params = window.simpleaiTopbarSystemParams && typeof window.simpleaiTopbarSystemParams === 'object'
            ? window.simpleaiTopbarSystemParams
            : {};
        return normalizedPresetName(params.__preset || params.preset || '');
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
        const deadline = Date.now() + RESTORE_READY_TIMEOUT_MS;
        while (Date.now() < deadline) {
            if (window.__simpleai_ui_ready === true) {
                await wait(RESTORE_READY_SETTLE_MS);
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
        if (!target) return true;
        if (currentPresetName() === target && !presetNavigationActive()) return true;

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
        return false;
    }

    function emptyRestoreSnapshot() {
        return { schema: 1, workspaces: {}, updated_at: Date.now() };
    }

    async function prepareRestoreRequest(fallbackState, fallbackOwner) {
        const request = restoreRequest || pendingManualReconnectRequest();
        if (!request) return [emptyRestoreSnapshot(), ownerKey() || fallbackOwner || 'local'];
        restoreRequest = request;
        if (!restoreStartedAt) restoreStartedAt = Date.now();
        captureSuspended = true;
        restoreRequested = true;
        clearManualReconnectRequest(request);
        const uiReady = await waitForStudioUiReady(request);
        const presetReady = await ensureReconnectPreset(request);
        if (!presetReady) {
            markPerformance('workspace.restore_preset_timeout', {
                expected_preset: normalizedPresetName(request?.context?.preset || ''),
                current_preset: currentPresetName(),
            }, true);
            return [emptyRestoreSnapshot(), request.owner];
        }
        const requestSnapshot = request.snapshot
            && request.snapshot.schema === 1
            && request.snapshot.workspaces
            && typeof request.snapshot.workspaces === 'object'
            ? request.snapshot
            : null;
        const stored = workspaceSnapshot(request.owner);
        const fallback = fallbackState && typeof fallbackState === 'object' ? fallbackState : null;
        const snapshot = requestSnapshot || stored || fallback || emptyRestoreSnapshot();
        markPerformance('workspace.restore_values_ready', {
            owner: request.owner,
            preset: currentPresetName(),
            scene_theme: String(
                window.simpleaiTopbarSystemParams?.__scene_theme
                || window.simpleaiTopbarSystemParams?.scene_theme
                || ''
            ),
            value_count: storedWorkspaceValueCount(request.owner),
            ui_ready: uiReady,
            snapshot_source: requestSnapshot ? 'manual_reconnect' : (stored ? 'workspace_storage' : 'browser_state'),
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

    function captureWorkspaceField(node) {
        if (captureWritesBlocked()) return false;
        const field = closestWorkspaceField(node);
        const key = workspaceKey(field);
        const signature = workspaceSignature(field);
        if (!field || !key || !signature) return false;
        const value = domWorkspaceValue(field);
        if (value === undefined) return false;
        saveValue(key, signature, value, null, workspaceKind(field));
        return true;
    }

    function captureAllWorkspaceFields() {
        if (captureWritesBlocked()) return 0;
        const root = rootNode();
        let captured = 0;
        for (const field of Array.from(root.querySelectorAll?.('.simpai-workspace-field') || [])) {
            if (captureWorkspaceField(field)) captured += 1;
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

    function captureNow() {
        if (captureWritesBlocked()) return false;
        const root = rootNode();
        const owner = ownerKey();
        const snapshot = {
            version: UI_STATE_VERSION,
            owner,
            context: currentWorkspaceContext(),
            tabs: collectTabs(root),
            accordions: collectAccordions(root),
            scroll_x: Math.max(0, Number(window.scrollX || 0)),
            scroll_y: Math.max(0, Number(window.scrollY || 0)),
            focus: collectFocusState(),
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

    function restoreUiState(owner) {
        if (!restoreRequested && !owner) return false;
        const restoreOwner = String(owner || restoreRequest?.owner || ownerKey());
        const snapshot = readUiSnapshot(restoreOwner);
        if (!snapshot) return false;
        const root = rootNode();
        restoreTabs(root, snapshot.tabs);
        restoreAccordions(root, snapshot.accordions);
        restoreFocus(root, snapshot.focus);
        window.requestAnimationFrame(() => {
            window.scrollTo(Number(snapshot.scroll_x) || 0, Number(snapshot.scroll_y) || 0);
        });
        return true;
    }

    function scheduleUiRestore() {
        window.setTimeout(restoreUiState, RESTORE_DELAY_MS);
        window.setTimeout(restoreUiState, 1000);
    }

    function finishRestore() {
        if (!restoreRequested || restoreCompleted) return false;
        const request = restoreRequest || pendingManualReconnectRequest();
        if (!request) return false;
        restoreCompleted = true;
        restoreUiState(request.owner);
        window.setTimeout(() => restoreUiState(request.owner), 250);
        window.setTimeout(() => restoreUiState(request.owner), 800);
        clearManualReconnectRequest(request);
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
            detail: { owner: request.owner, restoredAt: Date.now(), source: 'manual_reconnect' },
        }));
        restoreRequested = false;
        restoreRequest = null;
        preserveUiSnapshotUntilUnload = false;
        captureSuspended = false;
        return true;
    }

    function prepareForReload() {
        if (captureWritesBlocked()) return true;
        const active = document.activeElement;
        captureWorkspaceField(active);
        if (active?.dispatchEvent) {
            try { active.dispatchEvent(new Event('input', { bubbles: true })); } catch (error) {}
            try { active.dispatchEvent(new Event('change', { bubbles: true })); } catch (error) {}
        }
        captureAllWorkspaceFields();
        captureNow();
        return true;
    }

    window.SimpAIWorkspaceRecovery = {
        ownerKey,
        workspaceSnapshot,
        saveValue,
        captureAllWorkspaceFields,
        captureNow,
        prepareForReload,
        prepareForManualReconnect,
        markManualReconnect,
        pendingManualReconnectRequest,
        prepareInitialSystemParams,
        prepareRestoreRequest,
        finishRestore,
        restoreUiState,
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
    window.addEventListener('pagehide', prepareForReload);
    window.addEventListener('beforeunload', prepareForReload);

    if (typeof window.onUiLoaded === 'function') {
        window.onUiLoaded(scheduleUiRestore);
    } else if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', scheduleUiRestore, { once: true });
    } else {
        scheduleUiRestore();
    }
})();
