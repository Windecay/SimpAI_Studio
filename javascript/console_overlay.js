(function () {
    'use strict';

    const ROOT_ID = 'simpai-console-overlay';
    const PREVIEW_SURFACE_ID = 'preview_generating';
    const POLL_INTERVAL = 1200;
    const LOG_LIMIT = 300;
    const FETCH_TIMEOUT = 8000;
    const ANSI_RE = /\u001b\[[0-?]*[ -/]*[@-~]/g;

    const state = {
        allowed: false,
        open: false,
        follow: true,
        loading: false,
        pollTimer: 0,
        lastEntries: [],
        renderedRows: [],
        logCursor: 0,
        hasSnapshot: false,
        error: ''
    };
    let accessRequest = null;
    let accessCheckedAt = 0;
    let themeObserver = null;
    let mountObserver = null;
    let mountFrame = 0;

    function normalizeLang(value) {
        const raw = String(value || '').trim().toLowerCase();
        if (raw.startsWith('en')) return 'en';
        if (raw.startsWith('cn') || raw.startsWith('zh')) return 'cn';
        return '';
    }

    function readCookie(name) {
        try {
            const prefix = `${name}=`;
            const item = String(document.cookie || '')
                .split(';')
                .map(part => part.trim())
                .find(part => part.startsWith(prefix));
            if (!item) return '';
            const raw = item.slice(prefix.length);
            try {
                return decodeURIComponent(raw);
            } catch (err) {
                return raw;
            }
        } catch (err) {
            return '';
        }
    }

    function readSessionToken() {
        const cookieToken = readCookie('aitoken');
        if (cookieToken) return cookieToken;
        try {
            return String(localStorage.getItem('aitoken') || '').trim();
        } catch (err) {
            return '';
        }
    }

    function getUiLang() {
        const stageLang = normalizeLang(window.stage && window.stage.__lang);
        if (stageLang) return stageLang;

        const params = window.simpleaiTopbarSystemParams;
        const topbarLang = normalizeLang(params && params.__lang);
        if (topbarLang) return topbarLang;

        const legacyLang = normalizeLang(window.topbarLastSystemParams && window.topbarLastSystemParams.__lang);
        if (legacyLang) return legacyLang;

        try {
            const search = new URLSearchParams(window.location.search || '');
            const queryLang = normalizeLang(search.get('__lang') || search.get('lang') || search.get('language'));
            if (queryLang) return queryLang;
        } catch (err) {}

        const globalLang = normalizeLang(window.locale_lang);
        if (globalLang) return globalLang;
        try {
            const storedLang = normalizeLang(localStorage.getItem('ailang'));
            if (storedLang) return storedLang;
        } catch (err) {}
        return normalizeLang(readCookie('ailang')) || 'en';
    }

    function tr(en) {
        const source = String(en ?? '');
        if (getUiLang() === 'en') return source;
        const dict = window.localization && typeof window.localization === 'object'
            ? window.localization
            : {};
        return dict[source] || source;
    }

    function detectDarkTheme() {
        const html = document.documentElement;
        const theme = String(
            html.getAttribute('data-theme') ||
            html.getAttribute('theme') ||
            document.body?.getAttribute('data-theme') ||
            ''
        ).toLowerCase();
        return theme.includes('dark') || html.classList.contains('dark') || document.body?.classList.contains('dark');
    }

    function formatTimestamp(value) {
        const match = String(value || '').match(/T(\d{2}:\d{2}:\d{2})/);
        return match ? match[1] : '';
    }

    function formatEntry(entry) {
        const source = entry && typeof entry === 'object' ? entry : { m: entry };
        const message = String(source.m ?? '').replace(ANSI_RE, '').replace(/\r(?!\n)/g, '\n');
        if (!message.trim()) return '';
        const timestamp = formatTimestamp(source.t);
        const prefix = timestamp ? `[${timestamp}] ` : '';
        return `${prefix}${message}${message.endsWith('\n') ? '' : '\n'}`;
    }

    function createButton(className, label) {
        const button = document.createElement('button');
        button.className = className;
        button.type = 'button';
        button.setAttribute('aria-label', label);
        button.title = label;
        return button;
    }

    const consoleRoot = document.createElement('div');
    consoleRoot.id = ROOT_ID;
    consoleRoot.hidden = true;

    const consoleStyle = document.createElement('style');
    consoleStyle.textContent = `
        #${ROOT_ID} {
            position: absolute;
            inset: 0;
            z-index: 20;
            pointer-events: none;
            font-family: Arial, sans-serif;
        }

        #${ROOT_ID}[hidden] {
            display: none !important;
        }

        #${ROOT_ID} .simpai-console-toggle,
        #${ROOT_ID} .simpai-console-panel {
            pointer-events: auto;
        }

        #${ROOT_ID} .simpai-console-toggle {
            position: absolute;
            left: max(12px, env(safe-area-inset-left));
            right: auto;
            bottom: max(12px, env(safe-area-inset-bottom));
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 32px;
            height: 32px;
            padding: 0;
            border: 1px solid rgba(255, 255, 255, 0.62);
            border-radius: 6px;
            background: rgba(20, 25, 33, 0.62);
            color: #ffffff;
            box-shadow: 0 4px 14px rgba(0, 0, 0, 0.28);
            cursor: pointer;
            appearance: none;
        }

        #${ROOT_ID} .simpai-console-toggle:hover,
        #${ROOT_ID} .simpai-console-toggle:focus-visible {
            background: rgba(34, 42, 54, 0.9);
            border-color: rgba(255, 255, 255, 0.92);
            outline: none;
        }

        #${ROOT_ID} .simpai-console-toggle-icon {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 26px;
            height: 24px;
            color: #ffffff;
            font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
            font-size: 12px;
            font-weight: 700;
            line-height: 1;
        }

        #${ROOT_ID} .simpai-console-panel {
            position: absolute;
            left: max(12px, env(safe-area-inset-left));
            right: auto;
            bottom: calc(52px + env(safe-area-inset-bottom));
            display: flex;
            flex-direction: column;
            width: min(620px, calc(100% - 24px));
            height: min(480px, calc(100% - 64px), calc(100vh - 160px));
            min-height: 180px;
            max-height: min(calc(100% - 56px), calc(100vh - 24px));
            box-sizing: border-box;
            overflow: hidden;
            border: 1px solid rgba(255, 255, 255, 0.18);
            border-radius: 8px;
            background: rgba(10, 14, 20, 0.9);
            color: #f4f4f5;
            box-shadow: 0 18px 50px rgba(0, 0, 0, 0.42);
        }

        #${ROOT_ID} .simpai-console-panel[hidden] {
            display: none !important;
        }

        @supports ((-webkit-backdrop-filter: blur(12px)) or (backdrop-filter: blur(12px))) {
            #${ROOT_ID} .simpai-console-toggle,
            #${ROOT_ID} .simpai-console-panel {
                -webkit-backdrop-filter: blur(12px);
                backdrop-filter: blur(12px);
            }
        }

        #${ROOT_ID} .simpai-console-header {
            display: flex;
            align-items: center;
            gap: 8px;
            min-height: 42px;
            padding: 7px 9px 7px 12px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.12);
            box-sizing: border-box;
        }

        #${ROOT_ID} .simpai-console-heading {
            display: flex;
            align-items: baseline;
            gap: 8px;
            min-width: 0;
            flex: 1 1 auto;
        }

        #${ROOT_ID} .simpai-console-title {
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            font-size: 13px;
            font-weight: 700;
            line-height: 1.3;
        }

        #${ROOT_ID} .simpai-console-meta {
            flex: 0 0 auto;
            color: #ffffff;
            font-size: 10px;
            line-height: 1.3;
            white-space: nowrap;
        }

        #${ROOT_ID} .simpai-console-actions {
            display: flex;
            align-items: center;
            gap: 4px;
            flex: 0 0 auto;
        }

        #${ROOT_ID} .simpai-console-action {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 26px;
            height: 26px;
            padding: 0;
            border: 1px solid rgba(255, 255, 255, 0.18);
            border-radius: 5px;
            background: rgba(255, 255, 255, 0.06);
            color: inherit;
            font-size: 15px;
            line-height: 1;
            cursor: pointer;
            appearance: none;
        }

        #${ROOT_ID} .simpai-console-action:hover,
        #${ROOT_ID} .simpai-console-action:focus-visible {
            background: rgba(255, 255, 255, 0.14);
            outline: none;
        }

        #${ROOT_ID} .simpai-console-output {
            flex: 1 1 auto;
            min-height: 0;
            margin: 0;
            padding: 11px 12px;
            box-sizing: border-box;
            overflow: auto;
            color: #e5e7eb;
            font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
            font-size: 11px;
            line-height: 1.45;
            white-space: pre-wrap;
            overflow-wrap: anywhere;
            user-select: text;
        }

        #${ROOT_ID} .simpai-console-output.is-empty {
            color: rgba(229, 231, 235, 0.68);
        }

        #${ROOT_ID} .simpai-console-status {
            flex: 0 0 auto;
            min-height: 26px;
            padding: 5px 12px;
            border-top: 1px solid rgba(255, 255, 255, 0.1);
            color: #fca5a5;
            font-size: 10px;
            line-height: 1.3;
            box-sizing: border-box;
        }

        #${ROOT_ID} .simpai-console-status[hidden] {
            display: none !important;
        }

        @media (max-width: 640px), (pointer: coarse) and (max-width: 900px) {
            #${ROOT_ID} .simpai-console-toggle {
                left: max(10px, env(safe-area-inset-left));
                right: auto;
                bottom: max(10px, env(safe-area-inset-bottom));
            }

            #${ROOT_ID} .simpai-console-panel {
                left: max(10px, env(safe-area-inset-left));
                right: auto;
                bottom: calc(48px + env(safe-area-inset-bottom));
                width: calc(100% - 20px - env(safe-area-inset-right) - env(safe-area-inset-left));
                height: min(60vh, 420px, calc(100% - 58px));
            }
        }
    `;

    const consoleToggleBtn = createButton('simpai-console-toggle', tr('Open console log'));
    consoleToggleBtn.setAttribute('aria-expanded', 'false');
    const consoleToggleIcon = document.createElement('span');
    consoleToggleIcon.className = 'simpai-console-toggle-icon';
    consoleToggleIcon.textContent = '>_';
    consoleToggleBtn.appendChild(consoleToggleIcon);

    const consolePanel = document.createElement('section');
    consolePanel.className = 'simpai-console-panel';
    consolePanel.hidden = true;
    consolePanel.setAttribute('role', 'dialog');
    consolePanel.setAttribute('aria-modal', 'false');
    consolePanel.setAttribute('aria-hidden', 'true');

    const consoleTitle = document.createElement('div');
    consoleTitle.className = 'simpai-console-title';
    consoleTitle.id = 'simpai-console-title';
    consolePanel.setAttribute('aria-labelledby', consoleTitle.id);

    const consoleMeta = document.createElement('div');
    consoleMeta.className = 'simpai-console-meta';

    const consoleHeader = document.createElement('header');
    consoleHeader.className = 'simpai-console-header';

    const consoleHeading = document.createElement('div');
    consoleHeading.className = 'simpai-console-heading';
    consoleHeading.appendChild(consoleTitle);
    consoleHeading.appendChild(consoleMeta);

    const consoleActions = document.createElement('div');
    consoleActions.className = 'simpai-console-actions';

    const consoleFollowBtn = createButton('simpai-console-action', tr('Stop following logs'));
    consoleFollowBtn.textContent = '↓';
    const consoleRefreshBtn = createButton('simpai-console-action', tr('Refresh logs'));
    consoleRefreshBtn.textContent = '↻';
    const consoleCloseBtn = createButton('simpai-console-action', tr('Close'));
    consoleCloseBtn.textContent = '×';
    consoleActions.appendChild(consoleFollowBtn);
    consoleActions.appendChild(consoleRefreshBtn);
    consoleActions.appendChild(consoleCloseBtn);

    const consoleOutput = document.createElement('pre');
    consoleOutput.className = 'simpai-console-output';
    consoleOutput.setAttribute('aria-live', 'off');

    const consoleStatus = document.createElement('div');
    consoleStatus.className = 'simpai-console-status';
    consoleStatus.hidden = true;

    consoleHeader.appendChild(consoleHeading);
    consoleHeader.appendChild(consoleActions);
    consolePanel.appendChild(consoleHeader);
    consolePanel.appendChild(consoleOutput);
    consolePanel.appendChild(consoleStatus);
    consoleRoot.appendChild(consoleToggleBtn);
    consoleRoot.appendChild(consolePanel);

    function updateMeta() {
        const status = state.error
            ? tr('Error')
            : (state.follow ? tr('Live') : tr('Paused'));
        consoleMeta.textContent = `${status} · ${state.lastEntries.length}`;
    }

    function setOutputRows(rows) {
        const content = rows.join('');
        consoleOutput.classList.toggle('is-empty', !content);
        consoleOutput.textContent = content || tr('No log records yet.');
    }

    function renderEntries(entries, reset) {
        const nextEntries = Array.isArray(entries) ? entries : [];
        if (reset || !state.hasSnapshot) {
            state.lastEntries = nextEntries.slice(-LOG_LIMIT);
            state.renderedRows = state.lastEntries.map(formatEntry);
            state.hasSnapshot = true;
            setOutputRows(state.renderedRows);
            updateMeta();
            if (state.follow) consoleOutput.scrollTop = consoleOutput.scrollHeight;
            return;
        }

        if (!nextEntries.length) {
            updateMeta();
            return;
        }

        const newRows = nextEntries.map(formatEntry);
        const combinedEntries = state.lastEntries.concat(nextEntries);
        const combinedRows = state.renderedRows.concat(newRows);
        const visibleEntries = combinedEntries.slice(-LOG_LIMIT);
        const visibleRows = combinedRows.slice(-LOG_LIMIT);
        const removedRows = visibleRows.length !== combinedRows.length;
        state.lastEntries = visibleEntries;
        state.renderedRows = visibleRows;

        if (removedRows) {
            setOutputRows(visibleRows);
        } else {
            const content = newRows.join('');
            if (content) {
                if (consoleOutput.classList.contains('is-empty')) {
                    consoleOutput.textContent = '';
                    consoleOutput.classList.remove('is-empty');
                }
                consoleOutput.appendChild(document.createTextNode(content));
            }
        }
        updateMeta();
        if (state.follow) consoleOutput.scrollTop = consoleOutput.scrollHeight;
    }

    async function fetchJson(url) {
        const controller = typeof AbortController === 'function' ? new AbortController() : null;
        const timeoutId = window.setTimeout(() => controller?.abort(), FETCH_TIMEOUT);
        const headers = { Accept: 'application/json' };
        const sessionToken = readSessionToken();
        if (sessionToken) headers['X-SimpAI-Session'] = sessionToken;
        try {
            const response = await fetch(url, {
                method: 'GET',
                credentials: 'same-origin',
                cache: 'no-store',
                headers,
                signal: controller?.signal
            });
            let payload = null;
            try {
                payload = await response.json();
            } catch (err) {}
            if (!response.ok) {
                const error = new Error(`HTTP ${response.status}`);
                error.status = response.status;
                throw error;
            }
            return payload || {};
        } finally {
            window.clearTimeout(timeoutId);
        }
    }

    function setAllowed(allowed) {
        state.allowed = !!allowed;
        if (!state.allowed && state.open) setOpen(false);
    }

    async function refreshAccess(force) {
        const now = Date.now();
        if (accessRequest) return accessRequest;
        if (!force && accessCheckedAt && now - accessCheckedAt < 2000) return null;
        accessRequest = (async () => {
            try {
                const payload = await fetchJson('/simpai/logs/raw?capability=1');
                setAllowed(payload && payload.allowed === true);
            } catch (error) {
                setAllowed(false);
            } finally {
                accessCheckedAt = Date.now();
                accessRequest = null;
            }
            refreshText();
        })();
        return accessRequest;
    }

    function findPreviewSurface() {
        try {
            const app = typeof gradioApp === 'function' ? gradioApp() : document;
            return (app && app.getElementById ? app.getElementById(PREVIEW_SURFACE_ID) : null)
                || document.getElementById(PREVIEW_SURFACE_ID);
        } catch (err) {
            return document.getElementById(PREVIEW_SURFACE_ID);
        }
    }

    function watchForPreviewSurface() {
        if (mountObserver || findPreviewSurface() || !document.body || typeof MutationObserver !== 'function') return;
        mountObserver = new MutationObserver(() => {
            if (!findPreviewSurface()) return;
            mountObserver.disconnect();
            mountObserver = null;
            scheduleMount();
        });
        mountObserver.observe(document.body, { childList: true, subtree: true });
    }

    function scheduleMount() {
        if (mountFrame) return;
        const run = () => {
            mountFrame = 0;
            if (!mount()) watchForPreviewSurface();
        };
        mountFrame = typeof window.requestAnimationFrame === 'function'
            ? window.requestAnimationFrame(run)
            : window.setTimeout(run, 0);
    }

    function getLogsUrl(force) {
        const cursor = Number(state.logCursor);
        const after = !force && state.hasSnapshot && Number.isSafeInteger(cursor) && cursor > 0
            ? `&after=${encodeURIComponent(String(cursor))}`
            : '';
        return `/simpai/logs/raw?limit=${LOG_LIMIT}${after}`;
    }

    async function refreshLogs(force) {
        if (state.loading || !state.allowed) return;
        state.loading = true;
        try {
            const payload = await fetchJson(getLogsUrl(!!force));
            state.error = '';
            consoleStatus.hidden = true;
            const entries = Array.isArray(payload && payload.entries) ? payload.entries : [];
            const cursor = Number(payload && payload.cursor);
            const hasCursor = Number.isSafeInteger(cursor) && cursor >= 0 && (cursor > 0 || entries.length === 0);
            if (hasCursor) {
                state.logCursor = cursor;
            } else {
                state.logCursor = 0;
            }
            renderEntries(
                entries,
                !!force || !hasCursor || !state.hasSnapshot || payload?.reset === true
            );
        } catch (error) {
            if (Number(error && error.status) === 401 || Number(error && error.status) === 403) {
                setAllowed(false);
                return;
            }
            state.error = tr('Console logs unavailable');
            consoleStatus.textContent = state.error;
            consoleStatus.hidden = false;
            updateMeta();
        } finally {
            state.loading = false;
            updateMeta();
        }
    }

    function schedulePoll(delay) {
        if (!state.open || document.hidden || state.pollTimer) return;
        state.pollTimer = window.setTimeout(async () => {
            state.pollTimer = 0;
            if (!state.open || document.hidden) return;
            await refreshLogs(false);
            schedulePoll(POLL_INTERVAL);
        }, Math.max(0, Number(delay) || 0));
    }

    function stopPolling() {
        if (!state.pollTimer) return;
        window.clearTimeout(state.pollTimer);
        state.pollTimer = 0;
    }

    function setOpen(open) {
        const nextOpen = !!open;
        if (nextOpen && !state.allowed) return;
        state.open = nextOpen;
        consolePanel.hidden = !nextOpen;
        consolePanel.setAttribute('aria-hidden', nextOpen ? 'false' : 'true');
        consoleToggleBtn.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
        consoleRoot.classList.toggle('is-open', nextOpen);
        if (nextOpen) {
            state.error = '';
            consoleStatus.hidden = true;
            refreshLogs(true);
            schedulePoll(0);
        } else {
            stopPolling();
        }
        refreshText();
    }

    async function activateConsole() {
        mount();
        if (state.open) {
            setOpen(false);
            return;
        }
        if (!state.allowed) {
            await refreshAccess(true);
            if (!state.allowed) return;
        }
        setOpen(true);
    }

    function refreshText() {
        const openLabel = tr('Open console log');
        consoleToggleBtn.title = openLabel;
        consoleToggleBtn.setAttribute('aria-label', openLabel);
        consoleTitle.textContent = tr('Console log');
        const followLabel = state.follow
            ? tr('Stop following logs')
            : tr('Follow new logs');
        consoleFollowBtn.title = followLabel;
        consoleFollowBtn.setAttribute('aria-label', followLabel);
        const refreshLabel = tr('Refresh logs');
        consoleRefreshBtn.title = refreshLabel;
        consoleRefreshBtn.setAttribute('aria-label', refreshLabel);
        const closeLabel = tr('Close');
        consoleCloseBtn.title = closeLabel;
        consoleCloseBtn.setAttribute('aria-label', closeLabel);
        updateMeta();
    }

    consoleToggleBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        activateConsole();
    });

    consoleFollowBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        state.follow = !state.follow;
        if (state.follow) consoleOutput.scrollTop = consoleOutput.scrollHeight;
        refreshText();
    });

    consoleRefreshBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        refreshLogs(true);
    });

    consoleCloseBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
    });

    consoleOutput.addEventListener('scroll', () => {
        const distanceToBottom = consoleOutput.scrollHeight - consoleOutput.scrollTop - consoleOutput.clientHeight;
        const follow = distanceToBottom <= 24;
        if (follow !== state.follow) {
            state.follow = follow;
            refreshText();
        }
    });

    consolePanel.addEventListener('pointerdown', event => event.stopPropagation());
    consolePanel.addEventListener('mousedown', event => event.stopPropagation());

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            stopPolling();
        } else if (state.open) {
            schedulePoll(0);
        }
    });

    window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && state.open) setOpen(false);
    });

    window.addEventListener('simpai:system-params-updated', () => {
        refreshText();
        if (state.open) refreshAccess(true);
    });

    function syncTheme() {
        consoleRoot.classList.toggle('is-dark', detectDarkTheme());
    }

    function mount() {
        if (!document.body) return;
        const target = findPreviewSurface();
        if (!target) {
            if (consoleRoot.parentNode) consoleRoot.remove();
            consoleRoot.hidden = true;
            return false;
        }
        if (!consoleStyle.isConnected) document.head?.appendChild(consoleStyle);
        const needsMount = consoleRoot.parentNode !== target || consoleRoot.hidden;
        if (needsMount) {
            target.appendChild(consoleRoot);
            consoleRoot.hidden = false;
            syncTheme();
            refreshText();
        }
        if (!themeObserver && document.documentElement && typeof MutationObserver === 'function') {
            themeObserver = new MutationObserver(syncTheme);
            themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'theme'] });
        }
        return true;
    }

    if (typeof onUiLoaded === 'function') onUiLoaded(scheduleMount);
    if (typeof onAfterUiUpdate === 'function') onAfterUiUpdate(scheduleMount);
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', scheduleMount, { once: true });
    } else {
        scheduleMount();
    }
})();
