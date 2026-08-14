(function() {
    // ==================== 配置常量 ====================
    const CHECK_INTERVAL = 2000;         // 检测间隔毫秒
    const MOBILE_CHECK_INTERVAL = 5000;
    const MAX_RETRY_COUNT = 3;
    const STATUS_DRAG_SAFE_MARGIN = 3;
    const STATUS_EDGE_DOCK_THRESHOLD = 6;

    // ==================== 状态管理 ====================
    let state = {
        initialTimestamp: null,
        currentQueueSize: 0,
        retryCount: 0,
        isConnected: false,
        currentTheme: 'light',
        isDragging: false,
        offsetX: 0,
        offsetY: 0,
        hasAdminAPI: false,
        initialPositionMoved: false, // 新增初始位置标记
        statusEdgeDockSide: '',
        isReconnectVisible: false,   // 是否显示重连按钮
        reloadScheduled: false,
        restartDetectedTimestamp: null
    };

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

    function getStatusMonitorLang() {
        const candidates = [];
        try {
            const search = new URLSearchParams(window.location.search || '');
            candidates.push(search.get('__lang'));
        } catch (err) {}
        const topbarParams = window.simpleaiTopbarSystemParams && typeof window.simpleaiTopbarSystemParams === 'object'
            ? window.simpleaiTopbarSystemParams
            : {};
        const systemParams = window.system_params && typeof window.system_params === 'object'
            ? window.system_params
            : {};
        candidates.push(topbarParams.__lang, systemParams.__lang);
        if (typeof window.locale_lang === 'string') candidates.push(window.locale_lang);
        try {
            candidates.push(localStorage.getItem('ailang'));
        } catch (err) {}
        candidates.push(readCookie('ailang'));
        const raw = candidates.map(value => String(value || '').trim().toLowerCase()).find(Boolean) || 'en';
        return raw.startsWith('en') ? 'en' : 'cn';
    }

    function t(en, cn) {
        const source = String(en ?? '');
        if (getStatusMonitorLang() === 'en') return source;
        const dict = window.localization && typeof window.localization === 'object' ? window.localization : {};
        return dict[source] || String(cn ?? source);
    }

    function tr(key) {
        const source = String(key ?? '');
        if (getStatusMonitorLang() === 'en') return source;
        const dict = window.localization && typeof window.localization === 'object' ? window.localization : {};
        return dict[source] || source;
    }

    function pastedImagesMessage(count) {
        const n = Number(count) || 0;
        return t(`Pasted ${n} ${n === 1 ? 'image' : 'images'}`, `已粘贴 ${n} 张`);
    }

    // ==================== 移动设备检测 ====================
    function isMobileDevice() {
        const userAgent = navigator.userAgent || navigator.vendor || window.opera;
        // 检测常见的移动设备标识符
        return /android|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase());
    }

    const mobileDevice = isMobileDevice();
    if (mobileDevice) {
        console.log(t("Mobile device detected; status monitor is hidden.", "当前设备为移动设备，状态监控组件不显示。"));
    }

    // ==================== DOM 元素创建 ====================
    const statusContainer = document.createElement('div');
    statusContainer.id = 'gradio-status-monitor';

    const statusIndicator = document.createElement('div');
    statusIndicator.className = 'status-indicator';

    const statusTiles = document.createElement('div');
    statusTiles.className = 'status-monitor-tiles';

    const workEntryTile = document.createElement('div');
    workEntryTile.className = 'status-monitor-tile work-entry-tile';
    workEntryTile.title = t('Drag to move. Drop images here for the transfer station.', '拖拽移动；拖放图片到这里进入中转站');

    const backToAdminBtn = document.createElement('button');
    backToAdminBtn.className = 'back-to-admin-btn';
    backToAdminBtn.textContent = t('Back to Admin', '返回管理窗口');
    backToAdminBtn.onclick = () => {
        if (window.pywebview && window.pywebview.api && window.pywebview.api.switchToAdmin) {
            window.pywebview.api.switchToAdmin();
        }
    };

    const reconnectBtn = document.createElement('button');
    reconnectBtn.className = 'reconnect-btn';
    reconnectBtn.textContent = ` ${tr('Reconnect')}`;
    reconnectBtn.disabled = false;
    reconnectBtn.onclick = requestWorkspaceReload;

    // VRAM 占用百分比
    const vramUsage = document.createElement('div');
    vramUsage.className = 'vram-usage';

    // RAM 占用百分比
    const ramUsage = document.createElement('div');
    ramUsage.className = 'ram-usage';

    // 同时在线用户数
    const onlineUsersBadge = document.createElement('div');
    onlineUsersBadge.className = 'online-users-badge';

    // 同时在线节点数
    const onlineNodesBadge = document.createElement('div');
    onlineNodesBadge.className = 'online-nodes-badge';

    // Admin 待审核用户申请
    const adminAccessBadge = document.createElement('div');
    adminAccessBadge.className = 'admin-access-pending-badge';

    const statusContent = document.createElement('div');
    statusContent.className = 'status-content status-monitor-tile system-status-tile';
    statusContent.setAttribute('role', 'status');
    statusContent.setAttribute('aria-live', 'polite');

    const canvasWorkbenchToggleBtn = document.createElement('button');
    canvasWorkbenchToggleBtn.className = 'canvas-workbench-toggle work-entry-main';
    canvasWorkbenchToggleBtn.type = 'button';
    canvasWorkbenchToggleBtn.title = t('Left click: open overlay. Right click: open standalone page.', '左键打开覆盖层；右键打开独立页');
    canvasWorkbenchToggleBtn.setAttribute('aria-label', canvasWorkbenchToggleBtn.title);

    const canvasWorkbenchIcon = document.createElement('span');
    canvasWorkbenchIcon.className = 'work-entry-icon';
    canvasWorkbenchIcon.textContent = '▦';

    const canvasWorkbenchLabel = document.createElement('span');
    canvasWorkbenchLabel.className = 'work-entry-label';
    canvasWorkbenchLabel.textContent = t('iCanvas', '无限画布');

    canvasWorkbenchToggleBtn.appendChild(canvasWorkbenchIcon);
    canvasWorkbenchToggleBtn.appendChild(canvasWorkbenchLabel);

    const transferToggleBtn = document.createElement('button');
    transferToggleBtn.className = 'transfer-toggle work-entry-transfer';
    transferToggleBtn.type = 'button';
    transferToggleBtn.title = t('Open image transfer station', '打开图片中转站');
    transferToggleBtn.setAttribute('aria-label', t('Open image transfer station', '打开图片中转站'));

    const transferToggleIcon = document.createElement('span');
    transferToggleIcon.className = 'transfer-toggle-icon';
    transferToggleIcon.textContent = '▾';

    const transferToggleLabel = document.createElement('span');
    transferToggleLabel.className = 'transfer-toggle-label';
    transferToggleLabel.textContent = t('imgTransfer', '图片中转');

    const transferCountBadge = document.createElement('span');
    transferCountBadge.className = 'transfer-count-badge';
    transferCountBadge.textContent = '0';

    transferToggleBtn.appendChild(transferToggleLabel);
    transferToggleBtn.appendChild(transferToggleIcon);
    transferToggleBtn.appendChild(transferCountBadge);

    const transferPanel = document.createElement('div');
    transferPanel.className = 'transfer-panel';

    const transferPanelActions = document.createElement('div');
    transferPanelActions.className = 'transfer-panel-actions';

    const transferPasteBtn = document.createElement('button');
    transferPasteBtn.className = 'transfer-panel-btn transfer-paste-btn';
    transferPasteBtn.type = 'button';
    transferPasteBtn.textContent = t('Paste', '粘贴');

    const transferCopyBtn = document.createElement('button');
    transferCopyBtn.className = 'transfer-panel-btn transfer-copy-btn';
    transferCopyBtn.type = 'button';
    transferCopyBtn.textContent = t('Copy', '复制');

    const transferClearBtn = document.createElement('button');
    transferClearBtn.className = 'transfer-panel-btn transfer-clear-btn';
    transferClearBtn.type = 'button';
    transferClearBtn.textContent = t('Clear', '清空');

    const transferHint = document.createElement('div');
    transferHint.className = 'transfer-hint';
    transferHint.textContent = t('Drop images here', '拖放图片到这里');

    const transferList = document.createElement('div');
    transferList.className = 'transfer-list';

    const transferState = {
        items: [],
        selectedId: null,
        expanded: false,
        nextId: 1,
        hintOverride: null,
        hintOverrideUntil: 0,
        hintTimer: null,
        pasteOverlayEl: null,
        pasteBoxEl: null,
        pasteCloseBtnEl: null,
        pasteTitleEl: null,
        pasteSubtitleEl: null,
        pasteHandler: null,
        keydownHandler: null,
        directPasteInited: false,
        directPasteHandler: null
    };

    transferState.nextId = Math.floor(Date.now() * 1000 + Math.random() * 1000);

    const transferSync = {
        tabId: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        channel: null,
        supported: false,
        inited: false,
        suppress: false
    };

    const CANVAS_WORKBENCH_MIN_LOADING_MS = 720;
    const CANVAS_WORKBENCH_STANDALONE_URL = '/canvas-workbench/app';
    const CANVAS_WORKBENCH_STANDALONE_TARGET = 'simpai-canvas-workbench';
    const CANVAS_WORKBENCH_OPEN_MODE_KEY = 'simpai.canvasWorkbench.openMode';
    const CANVAS_WORKBENCH_STANDALONE_ACTIVE_KEY = 'simpai.canvasWorkbench.standaloneActive';
    const CANVAS_WORKBENCH_STANDALONE_ACTIVE_TTL_MS = 12000;
    const CANVAS_WORKBENCH_SYSTEM_PARAMS_KEY = 'simpai.canvasWorkbench.systemParams';
    const canvasWorkbenchLazyState = {
        stylesheetPromises: new Map(),
        scriptPromises: new Map(),
        loadingPromise: null,
        overlayEl: null,
        overlayTitleEl: null,
        overlaySubtitleEl: null,
        overlayShownAt: 0,
        loaded: false
    };
    let canvasWorkbenchStandaloneMenuEl = null;
    let canvasWorkbenchStandaloneMenuPointerHandler = null;

    function waitMs(ms) {
        return new Promise((resolve) => window.setTimeout(resolve, Math.max(0, Number(ms) || 0)));
    }

    function getCanvasWorkbenchApi() {
        const api = window.SimpAIInfiniteCanvasWorkbench;
        return api && typeof api.open === 'function' ? api : null;
    }

    function canvasWorkbenchStandaloneTitle() {
        return t('Open Infinite Canvas in standalone page', '打开独立无限画布页面');
    }

    function canvasWorkbenchInlineTitle() {
        return t('Left click: open overlay. Right click: open standalone page.', '左键打开覆盖层；右键打开独立页');
    }

    function readCanvasWorkbenchStandaloneState() {
        try {
            const value = JSON.parse(localStorage.getItem(CANVAS_WORKBENCH_STANDALONE_ACTIVE_KEY) || '{}');
            return value && typeof value === 'object' ? value : {};
        } catch (err) {
            return {};
        }
    }

    function isCanvasWorkbenchStandaloneActive() {
        const value = readCanvasWorkbenchStandaloneState();
        const updatedAt = Number(value.updated_at || value.updatedAt || 0);
        if (!value.active || !Number.isFinite(updatedAt) || updatedAt <= 0) return false;
        return Date.now() - updatedAt < CANVAS_WORKBENCH_STANDALONE_ACTIVE_TTL_MS;
    }

    function writeCanvasWorkbenchStandaloneState(active) {
        try {
            localStorage.setItem(CANVAS_WORKBENCH_STANDALONE_ACTIVE_KEY, JSON.stringify({
                active: !!active,
                source: 'main',
                updated_at: Date.now()
            }));
        } catch (err) {
        }
    }

    function rememberCanvasWorkbenchSystemParams() {
        try {
            const params = window.simpleaiTopbarSystemParams && typeof window.simpleaiTopbarSystemParams === 'object'
                ? window.simpleaiTopbarSystemParams
                : {};
            localStorage.setItem(CANVAS_WORKBENCH_SYSTEM_PARAMS_KEY, JSON.stringify(params || {}));
        } catch (err) {
        }
    }

    function openCanvasWorkbenchStandalone() {
        rememberCanvasWorkbenchSystemParams();
        try {
            localStorage.setItem(CANVAS_WORKBENCH_OPEN_MODE_KEY, 'standalone');
        } catch (err) {
        }
        writeCanvasWorkbenchStandaloneState(true);
        const opened = window.open(CANVAS_WORKBENCH_STANDALONE_URL, CANVAS_WORKBENCH_STANDALONE_TARGET);
        if (opened && typeof opened.focus === 'function') {
            try { opened.focus(); } catch (err) {}
        }
        if (!opened) {
            window.location.href = CANVAS_WORKBENCH_STANDALONE_URL;
        }
        return !!opened;
    }

    function hideCanvasWorkbenchStandaloneMenu() {
        if (canvasWorkbenchStandaloneMenuEl && canvasWorkbenchStandaloneMenuEl.parentElement) {
            canvasWorkbenchStandaloneMenuEl.parentElement.removeChild(canvasWorkbenchStandaloneMenuEl);
        }
        canvasWorkbenchStandaloneMenuEl = null;
        if (canvasWorkbenchStandaloneMenuPointerHandler) {
            document.removeEventListener('pointerdown', canvasWorkbenchStandaloneMenuPointerHandler, true);
            canvasWorkbenchStandaloneMenuPointerHandler = null;
        }
    }

    function showCanvasWorkbenchStandaloneMenu(evt) {
        if (evt) {
            evt.preventDefault();
            evt.stopPropagation();
        }
        if (canvasWorkbenchLazyState.loadingPromise) return;
        rememberCanvasWorkbenchSystemParams();
        hideCanvasWorkbenchStandaloneMenu();

        const menu = document.createElement('div');
        menu.className = 'canvas-workbench-standalone-menu';
        menu.setAttribute('role', 'menu');

        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'canvas-workbench-standalone-menu-item';
        item.setAttribute('role', 'menuitem');
        item.textContent = t('Open Standalone Page', '打开独立页');
        item.addEventListener('click', (clickEvt) => {
            clickEvt.preventDefault();
            clickEvt.stopPropagation();
            hideCanvasWorkbenchStandaloneMenu();
            openCanvasWorkbenchStandalone();
        });

        menu.appendChild(item);
        (document.body || document.documentElement).appendChild(menu);

        const rect = menu.getBoundingClientRect();
        const margin = 8;
        const left = Math.max(margin, Math.min((evt && Number.isFinite(evt.clientX)) ? evt.clientX : margin, window.innerWidth - rect.width - margin));
        const top = Math.max(margin, Math.min((evt && Number.isFinite(evt.clientY)) ? evt.clientY : margin, window.innerHeight - rect.height - margin));
        menu.style.left = `${left}px`;
        menu.style.top = `${top}px`;
        canvasWorkbenchStandaloneMenuEl = menu;

        canvasWorkbenchStandaloneMenuPointerHandler = (pointerEvt) => {
            if (canvasWorkbenchStandaloneMenuEl && canvasWorkbenchStandaloneMenuEl.contains(pointerEvt.target)) return;
            hideCanvasWorkbenchStandaloneMenu();
        };
        window.setTimeout(() => {
            if (canvasWorkbenchStandaloneMenuEl) {
                document.addEventListener('pointerdown', canvasWorkbenchStandaloneMenuPointerHandler, true);
            }
        }, 0);
    }

    function normalizeLazyScriptSrc(src) {
        try {
            return new URL(String(src || ''), window.location.href).href;
        } catch (err) {
            return String(src || '');
        }
    }

    function getInfiniteCanvasLazyScripts() {
        const assets = window.SimpAIInfiniteCanvasLazyAssets && typeof window.SimpAIInfiniteCanvasLazyAssets === 'object'
            ? window.SimpAIInfiniteCanvasLazyAssets
            : {};
        const scripts = Array.isArray(assets.js) ? assets.js : [];
        return scripts.map((src) => String(src || '').trim()).filter(Boolean);
    }

    function getInfiniteCanvasLazyStylesheets() {
        const assets = window.SimpAIInfiniteCanvasLazyAssets && typeof window.SimpAIInfiniteCanvasLazyAssets === 'object'
            ? window.SimpAIInfiniteCanvasLazyAssets
            : {};
        const stylesheets = Array.isArray(assets.css) ? assets.css : [];
        return stylesheets.map((src) => String(src || '').trim()).filter(Boolean);
    }

    function findExistingLazyStylesheet(src) {
        const normalized = normalizeLazyScriptSrc(src);
        return Array.from(document.querySelectorAll('link[rel~="stylesheet"]')).find((link) => {
            if (!link) return false;
            if (link.dataset && link.dataset.simpaiLazyCanvasCssSrc === normalized) return true;
            return normalizeLazyScriptSrc(link.getAttribute('href') || link.href || '') === normalized;
        }) || null;
    }

    function loadInfiniteCanvasStylesheetOnce(src) {
        const normalized = normalizeLazyScriptSrc(src);
        if (!normalized) return Promise.resolve(null);
        if (canvasWorkbenchLazyState.stylesheetPromises.has(normalized)) {
            return canvasWorkbenchLazyState.stylesheetPromises.get(normalized);
        }

        const existing = findExistingLazyStylesheet(src);
        if (existing) {
            existing.dataset.simpaiLazyCanvasCssLoaded = 'true';
            const existingPromise = Promise.resolve(existing);
            canvasWorkbenchLazyState.stylesheetPromises.set(normalized, existingPromise);
            return existingPromise;
        }

        const promise = new Promise((resolve, reject) => {
            const link = document.createElement('link');
            let done = false;
            const finish = () => {
                if (done) return;
                done = true;
                link.dataset.simpaiLazyCanvasCssLoaded = 'true';
                resolve(link);
            };
            const fail = () => {
                if (done) return;
                done = true;
                canvasWorkbenchLazyState.stylesheetPromises.delete(normalized);
                link.remove();
                reject(new Error(`Failed to load infinite canvas stylesheet: ${src}`));
            };
            link.rel = 'stylesheet';
            link.setAttribute('property', 'stylesheet');
            link.dataset.simpaiLazyCanvasCssSrc = normalized;
            link.addEventListener('load', finish, { once: true });
            link.addEventListener('error', fail, { once: true });
            link.href = src;
            (document.head || document.documentElement).appendChild(link);
        });

        canvasWorkbenchLazyState.stylesheetPromises.set(normalized, promise);
        return promise;
    }

    function findExistingLazyScript(src) {
        const normalized = normalizeLazyScriptSrc(src);
        return Array.from(document.scripts || []).find((script) => {
            if (!script) return false;
            if (script.dataset && script.dataset.simpaiLazyCanvasSrc === normalized) return true;
            return normalizeLazyScriptSrc(script.getAttribute('src') || script.src || '') === normalized;
        }) || null;
    }

    function loadInfiniteCanvasScriptOnce(src) {
        const normalized = normalizeLazyScriptSrc(src);
        if (!normalized) return Promise.resolve(null);
        if (canvasWorkbenchLazyState.scriptPromises.has(normalized)) {
            return canvasWorkbenchLazyState.scriptPromises.get(normalized);
        }

        let existing = findExistingLazyScript(src);
        if (existing && existing.dataset && existing.dataset.simpaiLazyCanvasLoaded === 'true') {
            return Promise.resolve(existing);
        }
        if (existing && existing.dataset && existing.dataset.simpaiLazyCanvasSrc === normalized) {
            existing.remove();
            existing = null;
        }

        const promise = new Promise((resolve, reject) => {
            const script = existing || document.createElement('script');
            let done = false;
            const finish = () => {
                if (done) return;
                done = true;
                script.dataset.simpaiLazyCanvasLoaded = 'true';
                resolve(script);
            };
            const fail = () => {
                if (done) return;
                done = true;
                canvasWorkbenchLazyState.scriptPromises.delete(normalized);
                if (script.parentElement && script.dataset && script.dataset.simpaiLazyCanvasSrc === normalized) {
                    script.remove();
                }
                reject(new Error(`Failed to load infinite canvas script: ${src}`));
            };

            if (script.dataset && script.dataset.simpaiLazyCanvasLoaded === 'true') {
                finish();
                return;
            }

            script.type = 'text/javascript';
            script.async = false;
            script.dataset.simpaiLazyCanvasSrc = normalized;
            script.addEventListener('load', finish, { once: true });
            script.addEventListener('error', fail, { once: true });
            if (!existing) {
                script.src = src;
                (document.head || document.documentElement).appendChild(script);
            }
        });

        canvasWorkbenchLazyState.scriptPromises.set(normalized, promise);
        return promise;
    }

    function setCanvasWorkbenchButtonLoading(isLoading) {
        canvasWorkbenchToggleBtn.classList.toggle('is-loading', !!isLoading);
        canvasWorkbenchToggleBtn.toggleAttribute('aria-disabled', !!isLoading);
        canvasWorkbenchToggleBtn.setAttribute('aria-busy', isLoading ? 'true' : 'false');
        canvasWorkbenchLabel.textContent = isLoading ? t('Loading', '加载中') : t('iCanvas', '无限画布');
        canvasWorkbenchToggleBtn.title = isLoading
            ? t('Loading Infinite Canvas', '正在加载无限画布')
            : (isCanvasWorkbenchStandaloneActive() ? canvasWorkbenchStandaloneTitle() : canvasWorkbenchInlineTitle());
        canvasWorkbenchToggleBtn.setAttribute('aria-label', canvasWorkbenchToggleBtn.title);
    }

    function getCanvasWorkbenchLoadingOverlay() {
        if (canvasWorkbenchLazyState.overlayEl) return canvasWorkbenchLazyState.overlayEl;

        const overlay = document.createElement('div');
        overlay.className = 'canvas-workbench-loading-overlay';
        overlay.setAttribute('aria-hidden', 'true');

        const card = document.createElement('div');
        card.className = 'canvas-workbench-loading-card';
        card.setAttribute('role', 'status');
        card.setAttribute('aria-live', 'polite');

        const spinner = document.createElement('div');
        spinner.className = 'canvas-workbench-loading-spinner';

        const copy = document.createElement('div');
        copy.className = 'canvas-workbench-loading-copy';

        const title = document.createElement('div');
        title.className = 'canvas-workbench-loading-title';

        const subtitle = document.createElement('div');
        subtitle.className = 'canvas-workbench-loading-subtitle';

        copy.appendChild(title);
        copy.appendChild(subtitle);
        card.appendChild(spinner);
        card.appendChild(copy);
        overlay.appendChild(card);

        canvasWorkbenchLazyState.overlayEl = overlay;
        canvasWorkbenchLazyState.overlayTitleEl = title;
        canvasWorkbenchLazyState.overlaySubtitleEl = subtitle;
        return overlay;
    }

    function updateCanvasWorkbenchLoadingOverlayText() {
        if (canvasWorkbenchLazyState.overlayTitleEl) {
            canvasWorkbenchLazyState.overlayTitleEl.textContent = t('Loading Infinite Canvas', '正在加载无限画布');
        }
        if (canvasWorkbenchLazyState.overlaySubtitleEl) {
            canvasWorkbenchLazyState.overlaySubtitleEl.textContent = t('Preparing the workbench for the first launch', '首次进入正在准备工作台资源');
        }
    }

    function showCanvasWorkbenchLoadingOverlay() {
        const overlay = getCanvasWorkbenchLoadingOverlay();
        updateCanvasWorkbenchLoadingOverlayText();
        canvasWorkbenchLazyState.overlayShownAt = Date.now();
        if (!overlay.parentElement) {
            (document.body || document.documentElement).appendChild(overlay);
        }
        overlay.setAttribute('aria-hidden', 'false');
        setCanvasWorkbenchButtonLoading(true);
        window.requestAnimationFrame(() => overlay.classList.add('is-visible'));
    }

    function hideCanvasWorkbenchLoadingOverlay() {
        const overlay = canvasWorkbenchLazyState.overlayEl;
        if (overlay) {
            overlay.classList.remove('is-visible');
            overlay.setAttribute('aria-hidden', 'true');
        }
        setCanvasWorkbenchButtonLoading(false);
    }

    async function ensureInfiniteCanvasLoaded(options) {
        const currentApi = getCanvasWorkbenchApi();
        if (currentApi) {
            canvasWorkbenchLazyState.loaded = true;
            return currentApi;
        }
        if (canvasWorkbenchLazyState.loadingPromise) {
            return canvasWorkbenchLazyState.loadingPromise;
        }

        const showLoading = !options || options.showLoading !== false;
        if (showLoading) showCanvasWorkbenchLoadingOverlay();

        canvasWorkbenchLazyState.loadingPromise = (async () => {
            const minDelay = showLoading ? waitMs(CANVAS_WORKBENCH_MIN_LOADING_MS) : Promise.resolve();
            try {
                if (typeof window.loadSimpleAILazyAssetGroup === 'function') {
                    const ok = await window.loadSimpleAILazyAssetGroup('infiniteCanvas');
                    if (!ok) throw new Error('Infinite canvas lazy assets are not configured.');
                } else {
                    const stylesheets = getInfiniteCanvasLazyStylesheets();
                    await Promise.all(stylesheets.map((src) => loadInfiniteCanvasStylesheetOnce(src)));
                    const scripts = getInfiniteCanvasLazyScripts();
                    if (!scripts.length) {
                        throw new Error('Infinite canvas lazy assets are not configured.');
                    }
                    for (const src of scripts) {
                        await loadInfiniteCanvasScriptOnce(src);
                    }
                }
                const api = getCanvasWorkbenchApi();
                if (!api) {
                    throw new Error('Infinite canvas API was not registered after scripts loaded.');
                }
                canvasWorkbenchLazyState.loaded = true;
                await minDelay;
                return api;
            } finally {
                await minDelay;
                if (showLoading) hideCanvasWorkbenchLoadingOverlay();
                canvasWorkbenchLazyState.loadingPromise = null;
            }
        })();

        return canvasWorkbenchLazyState.loadingPromise;
    }

    async function openCanvasWorkbench(source) {
        const currentApi = getCanvasWorkbenchApi();
        if (currentApi) {
            currentApi.open({ source });
            return true;
        }

        try {
            setTransferHintMessage(t('Canvas is loading', '画布加载中'), 2400);
            const api = await ensureInfiniteCanvasLoaded({ showLoading: true });
            api.open({ source });
            return true;
        } catch (err) {
            console.warn('Open canvas workbench failed:', err);
            setTransferHintMessage(t('Canvas is not ready', '画布未就绪'), 2400);
            return false;
        }
    }

    window.addEventListener('simpai:open-infinite-canvas', (evt) => {
        if (isCanvasWorkbenchStandaloneActive()) {
            openCanvasWorkbenchStandalone();
            return;
        }
        if (getCanvasWorkbenchApi()) return;
        const detail = evt && evt.detail && typeof evt.detail === 'object' ? evt.detail : {};
        openCanvasWorkbench(detail.source || 'event');
    });

    window.addEventListener('simpai:system-params-updated', () => {
        rememberCanvasWorkbenchSystemParams();
        refreshLocalizedStaticText();
    });

    window.addEventListener('storage', (evt) => {
        if (!evt || (evt.key !== CANVAS_WORKBENCH_OPEN_MODE_KEY && evt.key !== CANVAS_WORKBENCH_STANDALONE_ACTIVE_KEY && evt.key !== CANVAS_WORKBENCH_SYSTEM_PARAMS_KEY)) return;
        refreshLocalizedStaticText();
    });

    function updateTransferToggleText() {
        transferToggleLabel.textContent = t('imgTransfer', '图片中转');
        transferToggleIcon.textContent = transferState.expanded ? '▴' : '▾';
        updateTransferEntryState();
    }

    function updateTransferEntryState() {
        const count = transferState.items.length;
        transferCountBadge.textContent = String(count);
        transferCountBadge.title = t('Transfer station image count', '中转站图片数量');
        transferCountBadge.style.display = count > 0 ? 'inline-flex' : 'none';
        workEntryTile.classList.toggle('has-transfer-items', count > 0);
        transferToggleBtn.title = `${t('imgTransfer', '图片中转站')}: ${count}`;
        transferToggleBtn.setAttribute('aria-label', `${t('imgTransfer', '图片中转站')}: ${count}`);
    }

    let lastLocalizedStaticKey = '';
    function refreshLocalizedStaticText() {
        const staticKey = JSON.stringify([
            getStatusMonitorLang(),
            !!canvasWorkbenchLazyState.loadingPromise,
            isCanvasWorkbenchStandaloneActive(),
            !!transferState.expanded,
            transferState.items.length,
            transferState.hintOverride || '',
            !!state.reloadScheduled
        ]);
        if (staticKey === lastLocalizedStaticKey) return;
        lastLocalizedStaticKey = staticKey;
        backToAdminBtn.textContent = t('Back to Admin', '返回管理窗口');
        reconnectBtn.textContent = state.reloadScheduled
            ? ` ${tr('Restoring workspace')}`
            : ` ${tr('Reconnect')}`;
        canvasWorkbenchLabel.textContent = canvasWorkbenchLazyState.loadingPromise ? t('Loading', '加载中') : t('iCanvas', '无限画布');
        canvasWorkbenchToggleBtn.title = canvasWorkbenchLazyState.loadingPromise
            ? t('Loading Infinite Canvas', '正在加载无限画布')
            : (isCanvasWorkbenchStandaloneActive() ? canvasWorkbenchStandaloneTitle() : canvasWorkbenchInlineTitle());
        canvasWorkbenchToggleBtn.setAttribute('aria-label', canvasWorkbenchToggleBtn.title);
        workEntryTile.title = t('Drag to move. Drop images here for the transfer station.', '拖拽移动；拖放图片到这里进入中转站');
        setCanvasWorkbenchButtonLoading(!!canvasWorkbenchLazyState.loadingPromise);
        updateCanvasWorkbenchLoadingOverlayText();
        transferPasteBtn.textContent = t('Paste', '粘贴');
        transferCopyBtn.textContent = t('Copy', '复制');
        transferClearBtn.textContent = t('Clear', '清空');
        if (transferState.pasteTitleEl) transferState.pasteTitleEl.textContent = t('Paste Image', '粘贴图片');
        if (transferState.pasteSubtitleEl) transferState.pasteSubtitleEl.textContent = t('Press Ctrl+V', '请按 Ctrl+V');
        if (transferState.pasteCloseBtnEl) transferState.pasteCloseBtnEl.textContent = t('Close', '关闭');
        updateTransferToggleText();
        if (!transferState.hintOverride) {
            transferHint.textContent = t('Drop images here', '拖放图片到这里');
        }
    }

    const transferListeners = new Set();

    function snapshotTransferItem(item) {
        if (!item) return null;
        return {
            id: item.id,
            name: item.name || '',
            type: item.type || (item.blob && item.blob.type) || 'image/png',
            size: item.blob && typeof item.blob.size === 'number' ? item.blob.size : 0,
            previewUrl: item.previewUrl || '',
            selected: item.id === transferState.selectedId
        };
    }

    function getTransferSnapshot() {
        return {
            items: transferState.items.map(snapshotTransferItem).filter(Boolean),
            selectedId: transferState.selectedId,
            expanded: !!transferState.expanded
        };
    }

    function notifyTransferChange(reason, detail) {
        const payload = Object.assign({
            reason: reason || 'change',
            snapshot: getTransferSnapshot()
        }, detail || {});

        transferListeners.forEach((listener) => {
            try {
                listener(payload);
            } catch (err) {
                console.warn('Transfer listener failed:', err);
            }
        });

        try {
            window.dispatchEvent(new CustomEvent('simpai:transfer-station-change', { detail: payload }));
        } catch (err) {
        }
    }

    function postTransferSyncMessage(payload) {
        if (!transferSync.supported || !transferSync.channel || transferSync.suppress) return;
        try {
            transferSync.channel.postMessage(Object.assign({ senderId: transferSync.tabId }, payload || {}));
        } catch (e) {
        }
    }

    function setTransferExpanded(expanded, sync) {
        transferState.expanded = !!expanded;
        statusIndicator.classList.toggle('transfer-expanded', transferState.expanded);
        updateTransferToggleText();
        if (!transferState.expanded) closeTransferPasteOverlay();
        requestAnimationFrame(updateTransferPanelLayout);
        notifyTransferChange('expand', { expanded: transferState.expanded });
        if (sync) postTransferSyncMessage({ kind: 'transfer_expand', expanded: transferState.expanded });
    }

    async function createTransferPreviewUrl(blob) {
        const thumbBlob = await createThumbnailBlobFromBlob(blob, 160);
        const previewBlob = thumbBlob || blob;
        return URL.createObjectURL(previewBlob);
    }

    async function applyRemoteTransferState(snapshot) {
        if (!snapshot || typeof snapshot !== 'object') return;
        const remoteItems = Array.isArray(snapshot.items) ? snapshot.items : [];
        const remoteSelectedId = snapshot.selectedId ?? null;
        const remoteExpanded = !!snapshot.expanded;

        transferSync.suppress = true;
        try {
            const wasEmpty = !transferState.items.length;
            if (wasEmpty) {
                setTransferExpanded(remoteExpanded, false);
            }

            for (const remote of remoteItems) {
                if (!remote || !remote.blob) continue;
                const id = typeof remote.id === 'number' ? remote.id : Number(remote.id);
                if (!Number.isFinite(id)) continue;
                if (transferState.items.some(x => x.id === id)) continue;
                const blob = remote.blob;
                const type = remote.type || blob.type || 'image/png';
                const name = remote.name || `image_${Date.now()}.png`;
                const previewUrl = await createTransferPreviewUrl(blob);
                transferState.items.unshift({ id, blob, type, name, previewUrl });
                if (!transferState.selectedId) transferState.selectedId = id;
                transferState.nextId = Math.max(transferState.nextId, id + 1);
            }

            if (wasEmpty && remoteSelectedId !== null) {
                const id = typeof remoteSelectedId === 'number' ? remoteSelectedId : Number(remoteSelectedId);
                if (Number.isFinite(id) && transferState.items.some(x => x.id === id)) {
                    transferState.selectedId = id;
                }
            }
            if (!transferState.selectedId && transferState.items.length) {
                transferState.selectedId = transferState.items[0].id;
            }
            if (!transferState.items.length) transferState.selectedId = null;

            renderTransferGrid();
            notifyTransferChange('remote_state');
        } finally {
            transferSync.suppress = false;
        }
    }

    async function applyRemoteTransferAdd(remote) {
        if (!remote || !remote.blob) return;
        const id = typeof remote.id === 'number' ? remote.id : Number(remote.id);
        if (!Number.isFinite(id)) return;
        if (transferState.items.some(x => x.id === id)) return;

        transferSync.suppress = true;
        try {
            const blob = remote.blob;
            const type = remote.type || blob.type || 'image/png';
            const name = remote.name || `image_${Date.now()}.png`;
            const previewUrl = await createTransferPreviewUrl(blob);
            transferState.items.unshift({ id, blob, type, name, previewUrl });
            if (!transferState.selectedId) transferState.selectedId = id;
            transferState.nextId = Math.max(transferState.nextId, id + 1);
            renderTransferGrid();
            notifyTransferChange('remote_add', { item: snapshotTransferItem(transferState.items.find(x => x.id === id)) });
        } finally {
            transferSync.suppress = false;
        }
    }

    function applyRemoteTransferRemove(idRaw) {
        const id = typeof idRaw === 'number' ? idRaw : Number(idRaw);
        if (!Number.isFinite(id)) return;
        if (!transferState.items.some(x => x.id === id)) return;

        transferSync.suppress = true;
        try {
            removeTransferItem(id);
        } finally {
            transferSync.suppress = false;
        }
    }

    function applyRemoteTransferClear() {
        transferSync.suppress = true;
        try {
            clearTransferItems();
        } finally {
            transferSync.suppress = false;
        }
    }

    function applyRemoteTransferSelect(idRaw) {
        const id = typeof idRaw === 'number' ? idRaw : Number(idRaw);
        if (!Number.isFinite(id)) return;
        if (!transferState.items.some(x => x.id === id)) return;

        transferSync.suppress = true;
        try {
            transferState.selectedId = id;
            renderTransferGrid();
            notifyTransferChange('remote_select', { selectedId: id });
        } finally {
            transferSync.suppress = false;
        }
    }

    function applyRemoteTransferExpanded(expandedRaw) {
        const expanded = !!expandedRaw;
        transferSync.suppress = true;
        try {
            setTransferExpanded(expanded, false);
        } finally {
            transferSync.suppress = false;
        }
    }

    function initTransferCrossTabSync() {
        if (transferSync.inited) return;
        transferSync.inited = true;

        if (!('BroadcastChannel' in window)) return;
        try {
            transferSync.channel = new BroadcastChannel('simpleai-transfer-station-v1');
            transferSync.supported = true;
        } catch (e) {
            transferSync.supported = false;
            transferSync.channel = null;
            return;
        }

        transferSync.channel.addEventListener('message', (evt) => {
            const data = evt ? evt.data : null;
            if (!data || typeof data !== 'object') return;
            if (data.senderId && data.senderId === transferSync.tabId) return;

            const kind = data.kind;
            if (kind === 'transfer_state_request') {
                const requestId = data.requestId;
                if (!requestId) return;
                postTransferSyncMessage({
                    kind: 'transfer_state',
                    requestId,
                    snapshot: {
                        items: transferState.items.filter(x => x && x.blob).map(x => ({ id: x.id, blob: x.blob, type: x.type, name: x.name })),
                        selectedId: transferState.selectedId,
                        expanded: transferState.expanded
                    }
                });
                return;
            }
            if (kind === 'transfer_state') {
                const snapshot = data.snapshot;
                applyRemoteTransferState(snapshot);
                return;
            }
            if (kind === 'transfer_add') {
                applyRemoteTransferAdd(data.item);
                return;
            }
            if (kind === 'transfer_remove') {
                applyRemoteTransferRemove(data.id);
                return;
            }
            if (kind === 'transfer_clear') {
                applyRemoteTransferClear();
                return;
            }
            if (kind === 'transfer_select') {
                applyRemoteTransferSelect(data.id);
                return;
            }
            if (kind === 'transfer_expand') {
                applyRemoteTransferExpanded(data.expanded);
                return;
            }
        });

        const requestState = () => {
            const requestId = `${transferSync.tabId}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
            postTransferSyncMessage({ kind: 'transfer_state_request', requestId });
        };

        requestState();
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') requestState();
        });
    }

    // ==================== 样式配置 ====================
    const style = document.createElement('style');
    style.textContent = `
        #gradio-status-monitor {
            position: fixed;
            top: 0;
            right: 12px;
            z-index: 2147483647;
            font-family: Arial, sans-serif;
            max-width: min(158px, calc(100vw - 24px));
            background: transparent;
            pointer-events: auto;
            cursor: grab;
            transition: opacity 0.2s ease;
        }

        #gradio-status-monitor.dragging {
            cursor: grabbing;
            opacity: 0.8;
            transition: none !important;
        }

        #gradio-status-monitor.edge-docked {
            max-width: min(76px, calc(100vw - 6px));
        }

        #gradio-status-monitor.edge-docked .status-indicator.light,
        #gradio-status-monitor.edge-docked .status-indicator.dark,
        #gradio-status-monitor.edge-docked .status-monitor-tiles {
            width: 76px;
        }

        #gradio-status-monitor.edge-docked .status-monitor-tiles {
            flex-direction: column;
        }

        #gradio-status-monitor.edge-docked .status-monitor-tile {
            width: 76px;
            flex: 0 0 76px;
        }

        .status-indicator.light,
        .status-indicator.dark {
            width: 158px;
            padding: 0;
            border: none;
            border-radius: 0;
            display: flex;
            flex-direction: column;
            align-items: stretch;
            gap: 6px;
            font-size: 12px;
            position: relative;
            background: transparent;
            box-shadow: none;
        }

        .status-indicator.light {
            color: #333;
        }

        .status-indicator.dark {
            color: #fff;
        }

        .light .status-connected { color: #2c7a2c; }
        .light .status-disconnected { color: #c53030; }
        .light .status-exception { color: #d97706; }

        .dark .status-connected { color: #48bb78; }
        .dark .status-disconnected { color: #f56565; }
        .dark .status-exception { color: #ecc94b; }

        .status-monitor-tiles {
            display: flex;
            flex-direction: row;
            align-items: stretch;
            gap: 6px;
            width: 158px;
        }

        .status-monitor-tile {
            width: 76px;
            flex: 0 0 76px;
            box-sizing: border-box;
            border-radius: 8px;
            overflow: hidden;
            pointer-events: auto;
            user-select: none;
            cursor: default;
        }

        .status-indicator.light .status-monitor-tile {
            background: rgba(255, 255, 255, 0.94);
            border: 1px solid rgba(0, 0, 0, 0.14);
            box-shadow: 0 8px 22px rgba(0, 0, 0, 0.14);
        }

        .status-indicator.dark .status-monitor-tile {
            background: rgba(31, 33, 39, 0.92);
            border: 1px solid rgba(255, 255, 255, 0.14);
            box-shadow: 0 10px 28px rgba(0, 0, 0, 0.34);
        }

        @supports ((-webkit-backdrop-filter: blur(8px)) or (backdrop-filter: blur(8px))) {
            .status-indicator.light .status-monitor-tile,
            .status-indicator.dark .status-monitor-tile {
                -webkit-backdrop-filter: blur(10px);
                backdrop-filter: blur(10px);
            }
        }

        .work-entry-tile {
            height: 62px;
            display: grid;
            grid-template-rows: minmax(0, 70%) minmax(0, 1fr);
            gap: 3px;
            padding: 4px;
            cursor: grab;
        }

        .work-entry-tile:active {
            cursor: grabbing;
        }

        .status-indicator .canvas-workbench-toggle,
        .status-indicator .transfer-toggle {
            margin: 0 !important;
            border: none;
            border-radius: 6px;
            padding: 0;
            min-width: 0;
            min-height: 0;
            cursor: pointer;
            color: inherit;
            text-decoration: none;
            pointer-events: auto;
            align-self: stretch;
            letter-spacing: 0;
        }

        .status-indicator .canvas-workbench-toggle::before {
            content: none !important;
            display: none !important;
        }

        .status-indicator .canvas-workbench-toggle {
            display: flex;
            flex-direction: row;
            align-items: center;
            justify-content: center;
            gap: 3px;
            font-size: 10.5px;
            line-height: 1.1;
            font-weight: 700;
            min-height: 0;
            margin-bottom: 0 !important;
            border: 1px solid transparent;
        }

        .status-indicator .transfer-toggle {
            position: relative;
            display: flex;
            flex-direction: row;
            align-items: center;
            justify-content: center;
            gap: 2px;
            font-size: 8.5px;
            line-height: 1.1;
            font-weight: 700;
        }

        .work-entry-icon {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 17px;
            height: 17px;
            border-radius: 6px;
            font-size: 13px;
            line-height: 1;
        }

        .work-entry-label,
        .transfer-toggle-label {
            display: block;
            max-width: 100%;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .transfer-toggle-icon {
            font-size: 10px;
            line-height: 1;
        }

        .transfer-count-badge {
            position: static;
            align-items: center;
            justify-content: center;
            min-width: 13px;
            height: 13px;
            padding: 0 2px;
            box-sizing: border-box;
            border-radius: 999px;
            font-size: 8px;
            line-height: 13px;
            font-weight: 800;
        }

        .status-indicator.light .canvas-workbench-toggle {
            border-color: rgba(48, 86, 255, 0.48);
            background: linear-gradient(180deg, rgba(255, 255, 255, 0.62), rgba(226, 235, 255, 0.94));
            color: #1f3f95;
            box-shadow: 0 0 0 1px rgba(70, 112, 255, 0.14), 0 6px 18px rgba(44, 88, 220, 0.2);
        }

        .status-indicator.light .transfer-toggle {
            background: rgba(47, 85, 214, 0.12);
            color: #2548b7;
        }

        .status-indicator.light .work-entry-icon,
        .status-indicator.light .transfer-count-badge {
            background: rgba(47, 85, 214, 0.16);
            color: #2548b7;
        }

        .status-indicator.dark .canvas-workbench-toggle {
            border-color: rgba(125, 173, 255, 0.78);
            background: linear-gradient(180deg, rgba(72, 116, 214, 0.18), rgba(42, 71, 158, 0.96));
            color: #ffffff;
            box-shadow: 0 0 0 1px rgba(111, 164, 255, 0.28), 0 0 18px rgba(70, 118, 255, 0.42), 0 8px 22px rgba(0, 0, 0, 0.28);
        }

        .status-indicator.dark .transfer-toggle {
            background: rgba(120, 162, 255, 0.22);
            color: #ffffff;
        }

        .status-indicator.dark .work-entry-icon,
        .status-indicator.dark .transfer-count-badge {
            background: rgba(255, 255, 255, 0.16);
            color: #ffffff;
        }

        .status-indicator .canvas-workbench-toggle:hover,
        .status-indicator .canvas-workbench-toggle:focus-visible,
        .status-indicator .transfer-toggle:hover,
        .status-indicator .transfer-toggle:focus-visible {
            transform: translateY(-1px);
            outline: none;
        }

        .status-indicator .canvas-workbench-toggle:disabled,
        .status-indicator .canvas-workbench-toggle[aria-disabled="true"] {
            cursor: progress;
            opacity: 0.88;
        }

        .status-indicator .canvas-workbench-toggle.is-loading .work-entry-icon {
            border: 2px solid currentColor;
            border-top-color: transparent;
            background: transparent;
            font-size: 0;
            animation: simpaiCanvasLazySpin 0.8s linear infinite;
        }

        .canvas-workbench-standalone-menu {
            position: fixed;
            z-index: 2147483647 !important;
            min-width: 132px;
            padding: 5px;
            border-radius: 8px;
            border: 1px solid rgba(255, 255, 255, 0.14);
            background: rgba(30, 30, 32, 0.96);
            color: #f4f4f5;
            box-shadow: 0 12px 32px rgba(0, 0, 0, 0.38);
            pointer-events: auto;
        }

        .canvas-workbench-standalone-menu-item {
            width: 100%;
            border: none;
            border-radius: 6px;
            padding: 7px 9px;
            background: transparent;
            color: inherit;
            font-size: 12px;
            line-height: 1.2;
            text-align: left;
            cursor: pointer;
        }

        .canvas-workbench-standalone-menu-item:hover,
        .canvas-workbench-standalone-menu-item:focus-visible {
            background: rgba(255, 255, 255, 0.12);
            outline: none;
        }

        .status-indicator .status-content {
            min-height: 62px;
            padding: 4px;
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 3px;
            align-items: center;
            cursor: grab;
        }

        .status-indicator .status-content > * {
            min-width: 0;
        }

        .status-row {
            grid-column: 1 / -1;
            display: contents;
        }

        .status-connection {
            min-width: 0;
            padding: 0 2px;
            font-size: 11px;
            line-height: 14px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            font-weight: 700;
        }

        .queue-badge,
        .vram-usage,
        .ram-usage,
        .online-users-badge,
        .online-nodes-badge,
        .admin-access-pending-badge {
            margin: 0;
            width: 100%;
            padding: 1px 2px;
            border-radius: 8px;
            font-size: 8.5px;
            line-height: 14px;
            min-width: 0;
            text-align: center;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            box-sizing: border-box;
        }

        .status-row .queue-badge {
            margin-left: 0;
            max-width: none;
        }

        .light .queue-badge,
        .light .vram-usage,
        .light .ram-usage,
        .light .online-users-badge,
        .light .online-nodes-badge,
        .light .admin-access-pending-badge {
            background: #f0f0f0;
            color: var(--neutral-600);
        }

        .dark .queue-badge,
        .dark .vram-usage,
        .dark .ram-usage,
        .dark .online-users-badge,
        .dark .online-nodes-badge,
        .dark .admin-access-pending-badge {
            background: #2d3748;
            color: var(--neutral-300);
        }

        .light .vram-usage.usage-warning,
        .light .ram-usage.usage-warning {
            background: #fff7ed;
            color: #c2410c;
            font-weight: 700;
        }

        .dark .vram-usage.usage-warning,
        .dark .ram-usage.usage-warning {
            background: rgba(251, 146, 60, 0.14);
            color: #fdba74;
            font-weight: 700;
        }

        .light .vram-usage.usage-critical,
        .light .ram-usage.usage-critical {
            background: #fef2f2;
            color: #b91c1c;
            font-weight: 700;
        }

        .dark .vram-usage.usage-critical,
        .dark .ram-usage.usage-critical {
            background: rgba(248, 113, 113, 0.16);
            color: #fca5a5;
            font-weight: 700;
        }

        .admin-access-pending-badge {
            font-weight: 700;
            cursor: default;
        }

        .light .admin-access-pending-badge.has-pending {
            background: #fff7ed;
            color: #c2410c;
            border: 1px solid rgba(194, 65, 12, 0.25);
        }

        .dark .admin-access-pending-badge.has-pending {
            background: rgba(251, 146, 60, 0.14);
            color: #fdba74;
            border: 1px solid rgba(251, 146, 60, 0.32);
        }

        .reconnect-btn,
        .back-to-admin-btn {
            grid-column: 1 / -1;
            margin: 0;
            padding: 2px 6px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 11px;
            pointer-events: auto;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .light .reconnect-btn {
            border: 1px solid #c53030;
            background: #fff0f0;
            color: #c53030;
        }

        .dark .reconnect-btn {
            border: 1px solid #f56565;
            background: #2d1a1a;
            color: #f56565;
        }

        .light .back-to-admin-btn {
            border: 1px solid #4a90e2;
            background: #f0f8ff;
            color: #4a90e2;
        }

        .dark .back-to-admin-btn {
            border: 1px solid aqua;
            background: #1a2a3a;
            color: aqua;
        }

        .status-indicator.transfer-expanded .work-entry-tile {
            overflow: visible;
        }

        .canvas-workbench-loading-overlay {
            position: fixed;
            inset: 0;
            z-index: 2147483646;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px;
            box-sizing: border-box;
            background: rgba(14, 14, 16, 0.34);
            opacity: 0;
            pointer-events: none;
            transition: opacity 180ms ease;
        }

        .canvas-workbench-loading-overlay.is-visible {
            opacity: 1;
            pointer-events: auto;
        }

        .canvas-workbench-loading-card {
            display: flex;
            align-items: center;
            gap: 14px;
            min-width: min(360px, calc(100vw - 48px));
            max-width: min(460px, calc(100vw - 48px));
            padding: 18px 20px;
            border-radius: 8px;
            border: 1px solid rgba(255, 255, 255, 0.12);
            background: rgba(34, 34, 36, 0.96);
            color: #f4f4f5;
            box-shadow: 0 18px 48px rgba(0, 0, 0, 0.38);
            transform: translateY(8px) scale(0.985);
            transition: transform 180ms ease;
        }

        .canvas-workbench-loading-overlay.is-visible .canvas-workbench-loading-card {
            transform: translateY(0) scale(1);
        }

        .canvas-workbench-loading-spinner {
            width: 24px;
            height: 24px;
            flex: 0 0 auto;
            border-radius: 999px;
            border: 3px solid rgba(255, 255, 255, 0.28);
            border-top-color: #f4f4f5;
            animation: simpaiCanvasLazySpin 0.8s linear infinite;
        }

        .canvas-workbench-loading-copy {
            display: flex;
            min-width: 0;
            flex-direction: column;
            gap: 4px;
        }

        .canvas-workbench-loading-title {
            font-size: 15px;
            line-height: 1.35;
            font-weight: 700;
            color: #ffffff;
        }

        .canvas-workbench-loading-subtitle {
            font-size: 12px;
            line-height: 1.45;
            color: rgba(244, 244, 245, 0.72);
        }

        @supports ((-webkit-backdrop-filter: blur(8px)) or (backdrop-filter: blur(8px))) {
            .canvas-workbench-loading-overlay {
                background: rgba(14, 14, 16, 0.24);
                -webkit-backdrop-filter: blur(8px);
                backdrop-filter: blur(8px);
            }
        }

        @keyframes simpaiCanvasLazySpin {
            to { transform: rotate(360deg); }
        }

        .status-indicator .transfer-panel {
            display: none;
            position: absolute;
            right: 0;
            top: calc(100% + 6px);
            width: min(136px, calc(100vw - 16px));
            max-width: min(148px, calc(100vw - 16px));
            max-height: calc(100vh - 16px);
            border-radius: 8px;
            overflow: hidden;
            user-select: none;
            pointer-events: auto;
            box-sizing: border-box;
            flex-direction: column;
            cursor: default;
        }

        .status-indicator.transfer-expanded .transfer-panel {
            display: flex;
        }

        .status-indicator.light .transfer-panel {
            background: rgba(255, 255, 255, 0.995);
            border: 1px solid rgba(0, 0, 0, 0.16);
            color: #333;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18);
        }

        .status-indicator.dark .transfer-panel {
            background: rgba(12, 14, 18, 0.995);
            border: 1px solid rgba(255, 255, 255, 0.18);
            color: #fff;
            box-shadow: 0 12px 34px rgba(0, 0, 0, 0.62);
        }

        @supports ((-webkit-backdrop-filter: blur(6px)) or (backdrop-filter: blur(6px))) {
            .status-indicator.light .transfer-panel {
                background: rgba(255, 255, 255, 0.92);
                -webkit-backdrop-filter: blur(8px);
                backdrop-filter: blur(8px);
            }

            .status-indicator.dark .transfer-panel {
                background: rgba(12, 14, 18, 0.92);
                -webkit-backdrop-filter: blur(8px);
                backdrop-filter: blur(8px);
            }
        }

        .status-indicator .transfer-panel-actions {
            display: flex;
            flex-wrap: wrap;
            gap: 5px;
            padding: 5px 6px;
            justify-content: flex-start;
            width: 100%;
            box-sizing: border-box;
            cursor: default;
        }

        .status-indicator .transfer-panel-btn {
            font-size: 10.5px;
            padding: 2px 6px;
            border-radius: 6px;
            cursor: pointer;
            border: 1px solid transparent;
            background: transparent;
            color: inherit;
        }

        .status-indicator.light .transfer-panel-btn {
            border-color: rgba(0, 0, 0, 0.12);
        }

        .status-indicator.dark .transfer-panel-btn {
            border-color: rgba(255, 255, 255, 0.18);
        }

        .status-indicator .transfer-hint {
            font-size: 10px;
            opacity: 0.75;
            padding: 0 6px 6px 6px;
            text-align: center;
            cursor: default;
        }

        .status-indicator .transfer-list {
            display: flex;
            flex-direction: column;
            gap: 5px;
            overflow-y: auto;
            overflow-x: hidden;
            padding: 0 6px 6px 6px;
            align-items: center;
            flex: 1 1 auto;
            min-height: 0;
            cursor: default;
        }

        .status-indicator .transfer-panel.two-col .transfer-list {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            align-items: stretch;
        }

        .status-indicator .transfer-panel.two-col .transfer-item {
            width: 100%;
        }

        .status-indicator .transfer-item {
            position: relative;
            width: 104px;
            max-width: 100%;
            flex: 0 0 auto;
            aspect-ratio: 1 / 1;
            border-radius: 7px;
            overflow: hidden;
            border: 2px solid transparent;
            background: rgba(0,0,0,0.06);
            cursor: pointer;
        }

        .status-indicator.dark .transfer-item {
            background: rgba(255,255,255,0.06);
        }

        .status-indicator .transfer-item.selected {
            border-color: rgba(76, 139, 245, 0.95);
        }

        .status-indicator .transfer-item img {
            width: 100%;
            height: 100%;
            object-fit: contain;
            display: block;
            user-drag: none;
            -webkit-user-drag: none;
        }

        @supports not (aspect-ratio: 1 / 1) {
            .status-indicator .transfer-item {
                height: 0;
                padding-bottom: 100%;
            }

            .status-indicator .transfer-item img {
                position: absolute;
                top: 0;
                left: 0;
            }
        }

        .status-indicator .transfer-item .transfer-remove {
            position: absolute;
            top: 4px;
            right: 4px;
            width: 18px;
            height: 18px;
            border-radius: 9px;
            border: 1px solid rgba(255,255,255,0.25);
            background: rgba(0,0,0,0.55);
            color: #fff;
            font-size: 12px;
            line-height: 16px;
            cursor: pointer;
            display: none;
            align-items: center;
            justify-content: center;
            padding: 0;
        }

        .status-indicator .transfer-item:hover .transfer-remove {
            display: flex;
        }

        .status-indicator .transfer-panel.dragover {
            outline: 2px dashed rgba(76, 139, 245, 0.9);
            outline-offset: -2px;
        }

        .status-indicator .transfer-paste-overlay {
            position: absolute;
            inset: 0;
            background: rgba(0, 0, 0, 0.55);
            display: none;
            align-items: center;
            justify-content: center;
            padding: 10px;
            box-sizing: border-box;
            z-index: 2;
        }

        .status-indicator .transfer-paste-overlay.open {
            display: flex;
        }

        .status-indicator .transfer-paste-box {
            width: 100%;
            border-radius: 10px;
            padding: 10px;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            gap: 8px;
            outline: none;
        }

        .status-indicator.light .transfer-paste-box {
            background: rgba(255, 255, 255, 0.96);
            color: #333;
            border: 1px solid rgba(0, 0, 0, 0.12);
        }

        .status-indicator.dark .transfer-paste-box {
            background: rgba(20, 24, 28, 0.96);
            color: #fff;
            border: 1px solid rgba(255, 255, 255, 0.16);
        }

        .status-indicator .transfer-paste-box-title {
            font-size: 12px;
            font-weight: 600;
        }

        .status-indicator .transfer-paste-box-subtitle {
            font-size: 11px;
            opacity: 0.8;
            line-height: 1.3;
        }

        .status-indicator .transfer-paste-box-actions {
            display: flex;
            justify-content: flex-end;
            gap: 6px;
        }

        .status-indicator .transfer-paste-close {
            font-size: 11px;
            padding: 2px 8px;
            border-radius: 6px;
            cursor: pointer;
            border: 1px solid transparent;
            background: transparent;
            color: inherit;
        }

        .status-indicator.light .transfer-paste-close {
            border-color: rgba(0, 0, 0, 0.12);
        }

        .status-indicator.dark .transfer-paste-close {
            border-color: rgba(255, 255, 255, 0.18);
        }

        @media (max-width: 640px), (pointer: coarse) and (max-width: 900px) {
            #gradio-status-monitor {
                top: auto;
                right: max(8px, env(safe-area-inset-right));
                bottom: max(10px, env(safe-area-inset-bottom));
                max-width: min(88px, calc(100vw - 16px));
            }

            body.simpleai-preset-store-open-mobile #gradio-status-monitor,
            body.simpleai-mobile-prompt-actions-visible #gradio-status-monitor {
                display: none !important;
                pointer-events: none !important;
            }

            .status-indicator.light,
            .status-indicator.dark,
            .status-monitor-tiles {
                width: 88px;
                gap: 0;
            }

            .status-monitor-tile {
                width: 88px;
                flex: 0 0 88px;
                border-radius: 999px;
            }

            .work-entry-tile,
            .vram-usage,
            .ram-usage,
            .online-users-badge,
            .online-nodes-badge,
            .admin-access-pending-badge {
                display: none !important;
            }

            .status-indicator .status-content {
                min-height: 30px;
                height: 30px;
                padding: 3px 5px;
                display: flex;
                align-items: center;
                gap: 4px;
            }

            .status-row {
                display: flex;
                align-items: center;
                gap: 4px;
                width: 100%;
            }

            .status-connection {
                flex: 1 1 auto;
                min-width: 0;
                padding: 0;
                font-size: 11px;
                line-height: 16px;
            }

            .queue-badge,
            .status-row .queue-badge {
                flex: 0 0 auto;
                width: auto;
                min-width: 30px;
                padding: 1px 4px;
                font-size: 9px;
                line-height: 16px;
            }
        }
    `;

    // ==================== 主题管理 ====================
    function detectTheme() {
        const params = new URLSearchParams(window.location.search);
        return params.get('__theme') || 'light';
    }

    function applyTheme() {
        statusIndicator.classList.remove('light', 'dark');
        statusIndicator.classList.add(state.currentTheme);
    }

    // ==================== 核心功能 ====================
    async function fetchAppStatus() {
        try {
            const headers = { 'Content-Type': 'application/json' };
            const response = await fetch('/gradio_api/run/get_start_timestamp', {
                method: 'POST',
                credentials: 'same-origin',
                headers,
                body: JSON.stringify({ data: [] })
            });
            if (!response.ok) throw new Error(t('Request failed', '请求失败'));

            const result = await response.json();
            const parts = String(result.data[0] || '').split(',');
            const [timestampStr, queueSizeStr, vramTotalStr, ramTotalStr, vramUsedStr, ramUsedStr, onlineUsersStr, onlineDomainUsersStr, onlineNodesStr, pendingAccessCountStr, isAdminStr] = parts;
            const timestamp = Number.parseFloat(timestampStr);
            if (!Number.isFinite(timestamp) || timestamp <= 0) {
                throw new Error('Invalid server start timestamp');
            }

            return {
                timestamp,
                queueSize: parseInt(queueSizeStr),
                ramUsed: parseInt(ramUsedStr),
                ramTotal: parseInt(ramTotalStr),
                vramUsed: parseInt(vramUsedStr),
                vramTotal: parseInt(vramTotalStr),
                onlineUsers: parseInt(onlineUsersStr),
		        onlineDomainUsers: parseInt(onlineDomainUsersStr),
		        onlineNodes: parseInt(onlineNodesStr),
                pendingAccessCount: parseInt(pendingAccessCountStr || '0') || 0,
                isAdmin: String(isAdminStr || '0') === '1',
            };
        } catch (error) {
            return null;
        }
    }

    let lastStatusRenderKey = '';
    function updateStatusUI(statusType, queueSize, ramUsed, ramTotal, vramUsed, vramTotal, onlineUsers, onlineDomainUsers, onlineNodes, pendingAccessCount, isAdmin) {
        refreshLocalizedStaticText();
        pendingAccessCount = Number.isFinite(Number(pendingAccessCount)) ? Number(pendingAccessCount) : 0;
        isAdmin = !!isAdmin;
        const usagePercent = (used, total) => {
            const usedNumber = Number(used);
            const totalNumber = Number(total);
            if (!Number.isFinite(usedNumber) || !Number.isFinite(totalNumber) || totalNumber <= 0) return null;
            return (usedNumber / totalNumber) * 100;
        };
        const formatPercent = (percent) => {
            return Number.isFinite(percent) ? `${percent.toFixed(1)}%` : '--';
        };
        const applyUsageLevel = (element, percent) => {
            element.classList.remove('usage-warning', 'usage-critical');
            if (!Number.isFinite(percent)) return;
            if (percent > 97) {
                element.classList.add('usage-critical');
            } else if (percent > 90) {
                element.classList.add('usage-warning');
            }
        };
        const queueNumber = Number.isFinite(Number(queueSize)) ? Number(queueSize) : 0;
        const onlineUsersNumber = Number.isFinite(Number(onlineUsers)) ? Number(onlineUsers) : 0;
        const onlineDomainUsersNumber = Number.isFinite(Number(onlineDomainUsers)) ? Number(onlineDomainUsers) : 0;
        const onlineNodesNumber = Number.isFinite(Number(onlineNodes)) ? Number(onlineNodes) : 0;
        const vramPercent = usagePercent(vramUsed, vramTotal);
        const ramPercent = usagePercent(ramUsed, ramTotal);
        const vramPercentText = formatPercent(vramPercent);
        const ramPercentText = formatPercent(ramPercent);
        const shortPercent = (value) => value === '--' ? '--' : String(Math.round(parseFloat(value)));
        const vramPercentShort = shortPercent(vramPercentText);
        const ramPercentShort = shortPercent(ramPercentText);
        window.SimpAIStatusMonitorData = {
            statusType,
            queueSize: queueNumber,
            ramUsed,
            ramTotal,
            vramUsed,
            vramTotal,
            onlineUsers: onlineUsersNumber,
            onlineDomainUsers: onlineDomainUsersNumber,
            onlineNodes: onlineNodesNumber,
            pendingAccessCount,
            isAdmin,
            updatedAt: Date.now()
        };
        window.dispatchEvent(new CustomEvent('simpai:status-monitor-updated', { detail: window.SimpAIStatusMonitorData }));
        state.isReconnectVisible = (statusType === 'exception' || statusType === 'disconnected' || statusType === 'recovering');

        const statusMap = {
            connected: { text: t('Connected', '连接'), shortText: 'OK', class: 'status-connected' },
            disconnected: { text: t('Disconnected', '断开'), shortText: 'OFF', class: 'status-disconnected' },
            exception: { text: t('Error', '异常'), shortText: 'ERR', class: 'status-exception' },
            recovering: { text: tr('Restoring workspace'), shortText: 'SYNC', class: 'status-exception' }
        };
        const { text, shortText, class: statusClass } = statusMap[statusType];
        const nextStatusTitle = [
            text,
            `${t('Queue', '队列')}: ${queueNumber}`,
            `${t('VRAM', '显存')}: ${vramPercentText}`,
            `${t('RAM', '内存')}: ${ramPercentText}`,
            onlineDomainUsersNumber === 0
                ? `${t('Users', '用户')}: ${onlineUsersNumber}`
                : `${t('Users', '用户')}: ${onlineUsersNumber}/${onlineDomainUsersNumber}`,
            onlineNodesNumber ? `${t('Nodes', '节点')}: ${onlineNodesNumber}` : '',
            `${t('Permission Requests', '权限申请')}: ${pendingAccessCount}`
        ].filter(Boolean).join('\n');
        if (statusContent.title !== nextStatusTitle) statusContent.title = nextStatusTitle;

        const renderKey = JSON.stringify([
            getStatusMonitorLang(),
            statusType,
            queueNumber,
            state.hasAdminAPI,
            statusType === 'disconnected' ? state.retryCount : 0,
            mobileDevice ? null : [
                vramPercentText,
                ramPercentText,
                onlineUsersNumber,
                onlineDomainUsersNumber,
                onlineNodesNumber,
                pendingAccessCount,
                isAdmin
            ]
        ]);
        if (renderKey === lastStatusRenderKey) return;
        lastStatusRenderKey = renderKey;
        statusContent.replaceChildren();

        if (state.hasAdminAPI) {
            statusContent.appendChild(backToAdminBtn);
        }

        // 构建状态指示
        const statusEl = document.createElement('span');
        statusEl.className = `${statusClass} status-connection`;
        statusEl.textContent = `●${shortText}`;
        statusEl.title = text;

        // 队列数与状态显示在同一行
        const firstRow = document.createElement('div');
        firstRow.className = 'status-row';
        firstRow.appendChild(statusEl);

        if (statusType === 'connected') {
            const queueBadge = document.createElement('span');
            queueBadge.className = 'queue-badge';
            queueBadge.textContent = `Q:${queueNumber}`;
            queueBadge.title = `${t('Queue', '队列')}: ${queueNumber}`;
            firstRow.appendChild(queueBadge);
        } else if (statusType === 'exception' || statusType === 'disconnected' || statusType === 'recovering') {
            reconnectBtn.textContent = statusType === 'recovering'
                ? ` ${tr('Restoring workspace')}`
                : ` ${tr('Reconnect')}`;
            reconnectBtn.disabled = statusType === 'recovering';
            firstRow.appendChild(reconnectBtn);
            if (statusType === 'disconnected') {
                const retryText = document.createElement('span');
                retryText.textContent = ` (${state.retryCount * healthCheckInterval() / 1000}s)`;
                firstRow.appendChild(retryText);
            }
        }
	    
        statusContent.appendChild(firstRow);

        // 添加附加信息
        if (statusType === 'connected' && !mobileDevice) {
	    // 显示 VRAM 使用情况
            vramUsage.textContent = `V:${vramPercentShort}%`;
            vramUsage.title = `${t('VRAM', '显存')}: ${vramPercentText}`;
            applyUsageLevel(vramUsage, vramPercent);
            statusContent.appendChild(vramUsage);

            // 显示 RAM 使用情况
            ramUsage.textContent = `R:${ramPercentShort}%`;
            ramUsage.title = `${t('RAM', '内存')}: ${ramPercentText}`;
            applyUsageLevel(ramUsage, ramPercent);
            statusContent.appendChild(ramUsage);

            // 显示在线用户数
            if (onlineDomainUsersNumber === 0) {
		onlineUsersBadge.textContent = `U:${onlineUsersNumber}`;
                onlineUsersBadge.title = `${t('Users', '用户')}: ${onlineUsersNumber}`;
	    } else {
		onlineUsersBadge.textContent = `U:${onlineUsersNumber}/${onlineDomainUsersNumber}`;
                onlineUsersBadge.title = `${t('Users', '用户')}: ${onlineUsersNumber}/${onlineDomainUsersNumber}`;
	    }
            statusContent.appendChild(onlineUsersBadge);

            adminAccessBadge.textContent = `P:${pendingAccessCount}`;
            adminAccessBadge.title = pendingAccessCount > 0
                ? t('New user requests are waiting in Settings -> Users.', '有新的用户申请，请到 Settings -> Users 处理')
                : t('No pending permission requests.', '暂无待处理权限申请');
            adminAccessBadge.classList.toggle('has-pending', pendingAccessCount > 0);
            statusContent.appendChild(adminAccessBadge);
        }
    }

    function requestWorkspaceReload() {
        if (state.reloadScheduled) return;
        state.reloadScheduled = true;
        updateStatusUI('recovering');
        try {
            window.SimpAIWorkspaceRecovery?.prepareForManualReconnect();
        } catch (error) {}
        try {
            window.SimpAIStudioPerformance?.mark?.('workspace.reload_requested', {
                source: 'reconnect_button',
                user_requested: true,
                visibility: document.visibilityState,
            }, { urgent: true });
        } catch (error) {}
        window.dispatchEvent(new CustomEvent('simpai:workspace-reload-requested', {
            detail: { requestedAt: Date.now(), source: 'reconnect_button', userRequested: true }
        }));
        window.setTimeout(() => window.location.reload(), 150);
    }

    async function performHealthCheck() {
        checkAdminAPIAvailability();
        const statusData = await fetchAppStatus();

        if (!statusData) {
            state.retryCount++;
            if (state.retryCount >= MAX_RETRY_COUNT) {
                updateStatusUI('disconnected');
            }
            return;
        }

        state.retryCount = 0;

        if (!state.initialTimestamp) {
            state.initialTimestamp = statusData.timestamp;
            state.isConnected = true;
        }

        if (statusData.timestamp === state.initialTimestamp) {
            state.restartDetectedTimestamp = null;
            updateStatusUI(
                'connected',
                statusData.queueSize,
                statusData.ramUsed,
                statusData.ramTotal,
                statusData.vramUsed,
                statusData.vramTotal,
                statusData.onlineUsers,
		        statusData.onlineDomainUsers,
		        statusData.onlineNodes,
                statusData.pendingAccessCount,
                statusData.isAdmin,
            );
        } else {
            if (state.restartDetectedTimestamp !== statusData.timestamp) {
                state.restartDetectedTimestamp = statusData.timestamp;
                try {
                    window.SimpAIStudioPerformance?.mark?.('workspace.restart_detected', {
                        initial_timestamp: state.initialTimestamp,
                        current_timestamp: statusData.timestamp,
                        queue_size: statusData.queueSize,
                        visibility: document.visibilityState,
                        auto_reload: false,
                    }, { urgent: true });
                } catch (error) {}
            }
            updateStatusUI(
                'exception',
                statusData.queueSize,
                statusData.ramUsed,
                statusData.ramTotal,
                statusData.vramUsed,
                statusData.vramTotal,
                statusData.onlineUsers,
		        statusData.onlineDomainUsers,
		        statusData.onlineNodes,
                statusData.pendingAccessCount,
                statusData.isAdmin,
            );
        }
    }

    // ==================== 浏览器检测 ====================
    function detectBrowser() {
        const userAgent = navigator.userAgent.toLowerCase();
        if (userAgent.indexOf('chrome') > -1) return 'chrome';
        if (userAgent.indexOf('safari') > -1 && userAgent.indexOf('chrome') === -1) return 'safari';
        if (userAgent.indexOf('firefox') > -1) return 'firefox';
        if (userAgent.indexOf('edge') > -1) return 'edge';
        return 'unknown';
    }

    // ==================== 拖拽功能 ====================
    function initDragFeature() {
        const browser = detectBrowser();
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        
        // 标准鼠标拖拽事件
        statusContainer.addEventListener('mousedown', startDrag);
        
        // 触摸设备支持
        statusContainer.addEventListener('touchstart', startTouchDrag, { passive: false });
        
        // 为 Chrome 和 Edge 在 Mac 上添加 Pointer Events 支持
        if ((browser === 'chrome' || browser === 'edge') && isMac) {
            statusContainer.addEventListener('pointerdown', startPointerDrag);
        }
        
        function startDrag(e) {
            // 只响应左键 (button === 0)
            if (e.button === 0) {
                if (e.target && e.target.closest && (e.target.closest('.transfer-panel') || e.target.closest('.transfer-toggle') || e.target.closest('.transfer-item') || e.target.closest('button'))) return;
                e.preventDefault();
                state.isDragging = true;
                
                // 获取当前位置
                const rect = statusContainer.getBoundingClientRect();
                state.offsetX = e.clientX - rect.left;
                state.offsetY = e.clientY - rect.top;
                
                statusContainer.classList.add('dragging');
                
                // 添加临时事件监听器
                document.addEventListener('mousemove', doDrag);
                document.addEventListener('mouseup', stopDrag);
            }
        }
        
        function startPointerDrag(e) {
            // 只响应主指针（通常是左键或触控板点击）
            if (e.isPrimary && (e.pointerType === 'mouse' || e.pointerType === 'touch')) {
                if (e.target && e.target.closest && (e.target.closest('.transfer-panel') || e.target.closest('.transfer-toggle') || e.target.closest('.transfer-item') || e.target.closest('button'))) return;
                e.preventDefault();
                state.isDragging = true;
                
                // 获取当前位置
                const rect = statusContainer.getBoundingClientRect();
                state.offsetX = e.clientX - rect.left;
                state.offsetY = e.clientY - rect.top;
                
                statusContainer.classList.add('dragging');
                
                // 添加临时事件监听器
                document.addEventListener('pointermove', doPointerDrag);
                document.addEventListener('pointerup', stopPointerDrag);
                document.addEventListener('pointercancel', stopPointerDrag);
            }
        }
        
        function startTouchDrag(e) {
            if (e.touches && e.touches.length === 1) {
                if (e.target && e.target.closest && (e.target.closest('.transfer-panel') || e.target.closest('.transfer-toggle') || e.target.closest('.transfer-item') || e.target.closest('button'))) return;
                e.preventDefault();
                state.isDragging = true;
                
                // 获取当前位置
                const rect = statusContainer.getBoundingClientRect();
                state.offsetX = e.touches[0].clientX - rect.left;
                state.offsetY = e.touches[0].clientY - rect.top;
                
                statusContainer.classList.add('dragging');
                
                // 添加临时事件监听器
                document.addEventListener('touchmove', doTouchDrag, { passive: false });
                document.addEventListener('touchend', stopTouchDrag);
                document.addEventListener('touchcancel', stopTouchDrag);
            }
        }
        
        function doDrag(e) {
            if (state.isDragging) {
                e.preventDefault();
                moveElement(e.clientX, e.clientY);
            }
        }
        
        function doPointerDrag(e) {
            if (state.isDragging) {
                e.preventDefault();
                moveElement(e.clientX, e.clientY);
            }
        }
        
        function doTouchDrag(e) {
            if (state.isDragging && e.touches && e.touches.length === 1) {
                e.preventDefault(); // 阻止页面滚动
                moveElement(e.touches[0].clientX, e.touches[0].clientY);
            }
        }

        function stopDrag() {
            if (state.isDragging) {
                state.isDragging = false;
                finishStatusMonitorDrag();
                
                // 移除临时事件监听器
                document.removeEventListener('mousemove', doDrag);
                document.removeEventListener('mouseup', stopDrag);
            }
        }
        
        function stopPointerDrag() {
            if (state.isDragging) {
                state.isDragging = false;
                finishStatusMonitorDrag();
                
                // 移除临时事件监听器
                document.removeEventListener('pointermove', doPointerDrag);
                document.removeEventListener('pointerup', stopPointerDrag);
                document.removeEventListener('pointercancel', stopPointerDrag);
            }
        }
        
        function stopTouchDrag() {
            if (state.isDragging) {
                state.isDragging = false;
                finishStatusMonitorDrag();
                
                // 移除临时事件监听器
                document.removeEventListener('touchmove', doTouchDrag);
                document.removeEventListener('touchend', stopTouchDrag);
                document.removeEventListener('touchcancel', stopTouchDrag);
            }
        }
    }

    let healthCheckTimer = 0;
    let healthCheckRunning = false;
    let healthSchedulerStarted = false;

    function healthCheckInterval() {
        return mobileDevice ? MOBILE_CHECK_INTERVAL : CHECK_INTERVAL;
    }

    function scheduleHealthCheck(delay = healthCheckInterval()) {
        if (document.hidden || healthCheckTimer) return;
        healthCheckTimer = window.setTimeout(runHealthCheck, Math.max(0, delay));
    }

    async function runHealthCheck() {
        healthCheckTimer = 0;
        if (document.hidden || healthCheckRunning) return;
        healthCheckRunning = true;
        try {
            await performHealthCheck();
        } finally {
            healthCheckRunning = false;
            scheduleHealthCheck();
        }
    }

    function startHealthChecks() {
        if (healthSchedulerStarted) return;
        healthSchedulerStarted = true;
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                if (healthCheckTimer) window.clearTimeout(healthCheckTimer);
                healthCheckTimer = 0;
                return;
            }
            scheduleHealthCheck(0);
        });
        scheduleHealthCheck(0);
    }

    function finishStatusMonitorDrag() {
        statusContainer.classList.remove('dragging');
        updateStatusMonitorEdgeDock(true);
        if (transferState && transferState.expanded) requestAnimationFrame(updateTransferPanelLayout);
    }

    function clearStatusMonitorEdgeDock() {
        statusContainer.classList.remove('edge-docked', 'edge-docked-left', 'edge-docked-right');
        state.statusEdgeDockSide = '';
    }

    function clearStatusMonitorInlinePosition() {
        statusContainer.style.left = '';
        statusContainer.style.top = '';
        statusContainer.style.right = '';
        statusContainer.style.bottom = '';
    }

    function clampStatusMonitorIntoViewport() {
        const rect = statusContainer.getBoundingClientRect();
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth || rect.right;
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || rect.bottom;
        const maxX = Math.max(STATUS_DRAG_SAFE_MARGIN, viewportWidth - rect.width - STATUS_DRAG_SAFE_MARGIN);
        const maxY = Math.max(STATUS_DRAG_SAFE_MARGIN, viewportHeight - rect.height - STATUS_DRAG_SAFE_MARGIN);

        statusContainer.style.left = `${clamp(rect.left, STATUS_DRAG_SAFE_MARGIN, maxX)}px`;
        statusContainer.style.top = `${clamp(rect.top, STATUS_DRAG_SAFE_MARGIN, maxY)}px`;
        statusContainer.style.right = 'auto';
        statusContainer.style.bottom = 'auto';
    }

    function applyStatusMonitorEdgeDockSide(side, anchorPosition, sourceRect) {
        statusContainer.classList.add('edge-docked');
        statusContainer.classList.toggle('edge-docked-left', side === 'left');
        statusContainer.classList.toggle('edge-docked-right', side === 'right');
        state.statusEdgeDockSide = side;

        if (!anchorPosition) return;

        const rect = sourceRect || statusContainer.getBoundingClientRect();
        const dockRect = statusContainer.getBoundingClientRect();
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || dockRect.bottom;
        const maxY = Math.max(STATUS_DRAG_SAFE_MARGIN, viewportHeight - dockRect.height - STATUS_DRAG_SAFE_MARGIN);
        statusContainer.style.top = `${clamp(rect.top, STATUS_DRAG_SAFE_MARGIN, maxY)}px`;
        statusContainer.style.bottom = 'auto';
        if (side === 'left') {
            statusContainer.style.left = `${STATUS_DRAG_SAFE_MARGIN}px`;
            statusContainer.style.right = 'auto';
        } else {
            statusContainer.style.left = 'auto';
            statusContainer.style.right = `${STATUS_DRAG_SAFE_MARGIN}px`;
        }
    }

    function updateStatusMonitorEdgeDock(anchorPosition) {
        try {
            if (isMobileStatusLayout()) {
                clearStatusMonitorEdgeDock();
                return;
            }

            const rect = statusContainer.getBoundingClientRect();
            const viewportWidth = window.innerWidth || document.documentElement.clientWidth || rect.right;
            const leftGap = rect.left;
            const rightGap = viewportWidth - rect.right;
            const side = leftGap <= STATUS_EDGE_DOCK_THRESHOLD
                ? 'left'
                : (rightGap <= STATUS_EDGE_DOCK_THRESHOLD ? 'right' : '');

            if (!side) {
                const wasDocked = statusContainer.classList.contains('edge-docked');
                clearStatusMonitorEdgeDock();
                if (anchorPosition && wasDocked) clampStatusMonitorIntoViewport();
                return;
            }

            applyStatusMonitorEdgeDockSide(side, anchorPosition, rect);
        } catch (e) {
        }
    }

    function preserveStatusMonitorPositionAfterResize() {
        if (!state.initialPositionMoved) {
            clearStatusMonitorInlinePosition();
            clearStatusMonitorEdgeDock();
            return;
        }

        if (isMobileStatusLayout()) {
            clearStatusMonitorEdgeDock();
            clampStatusMonitorIntoViewport();
            return;
        }

        if (state.statusEdgeDockSide === 'left' || state.statusEdgeDockSide === 'right') {
            applyStatusMonitorEdgeDockSide(state.statusEdgeDockSide, true);
            return;
        }

        clampStatusMonitorIntoViewport();
    }

    // 统一移动元素的函数，增加边界保护
    function moveElement(clientX, clientY) {
        if (state.statusEdgeDockSide) clearStatusMonitorEdgeDock();
        // 计算新位置
        const newLeft = clientX - state.offsetX;
        const newTop = clientY - state.offsetY;

        // 获取元素实际尺寸
        const rect = statusContainer.getBoundingClientRect();
        const elementWidth = rect.width;
        const elementHeight = rect.height;

        // 确保不超出视口边界，并留出余量防止变形
        const safeMargin = STATUS_DRAG_SAFE_MARGIN; // 安全边距，防止元素变形
        const maxX = window.innerWidth - elementWidth - safeMargin;
        const maxY = window.innerHeight - elementHeight - safeMargin;

        statusContainer.style.left = `${Math.max(safeMargin, Math.min(maxX, newLeft))}px`;
        statusContainer.style.top = `${Math.max(safeMargin, Math.min(maxY, newTop))}px`;
        statusContainer.style.right = 'auto'; // 取消右侧定位
        statusContainer.style.bottom = 'auto'; // 取消底部定位
        state.initialPositionMoved = true;
    }

    function clamp(n, min, max) {
        return Math.max(min, Math.min(max, n));
    }

    function readFileAsDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error('read_failed'));
            reader.onload = () => resolve(reader.result);
            reader.readAsDataURL(file);
        });
    }

    function fileFromBlob(blob, filename, fallbackType) {
        const type = blob && blob.type ? blob.type : (fallbackType || 'image/png');
        const ext = type === 'image/jpeg' ? 'jpg' : (String(type).split('/')[1] || 'png');
        const name = filename || `transfer_${Date.now()}.${ext}`;
        return new File([blob], name, { type });
    }

    async function urlToBlob(url) {
        const res = await fetch(url, { mode: 'cors' });
        return await res.blob();
    }

    async function createThumbnailBlobFromBlob(blob, maxSide) {
        const target = typeof maxSide === 'number' ? maxSide : 160;
        try {
            const bitmap = await createImageBitmap(blob);
            const w = bitmap.width || 1;
            const h = bitmap.height || 1;
            const scale = Math.min(1, target / Math.max(w, h));
            const tw = Math.max(1, Math.round(w * scale));
            const th = Math.max(1, Math.round(h * scale));
            const canvas = document.createElement('canvas');
            canvas.width = tw;
            canvas.height = th;
            const ctx = canvas.getContext('2d');
            if (!ctx) return null;
            ctx.drawImage(bitmap, 0, 0, tw, th);
            if (bitmap && bitmap.close) bitmap.close();
            const thumb = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
            return thumb || null;
        } catch (e) {
            return null;
        }
    }

    async function convertBlobToPng(blob) {
        try {
            const bitmap = await createImageBitmap(blob);
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, bitmap.width || 1);
            canvas.height = Math.max(1, bitmap.height || 1);
            const ctx = canvas.getContext('2d');
            if (!ctx) return null;
            ctx.drawImage(bitmap, 0, 0);
            if (bitmap && bitmap.close) bitmap.close();
            const out = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
            return out || null;
        } catch (e) {
            return null;
        }
    }

    async function blobToDataUrl(blob) {
        try {
            return await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onerror = () => reject(new Error('read failed'));
                reader.onload = () => resolve(String(reader.result || ''));
                reader.readAsDataURL(blob);
            });
        } catch (e) {
            return '';
        }
    }

    function setTransferHintMessage(message, durationMs) {
        const text = String(message || '').trim();
        const ms = typeof durationMs === 'number' ? durationMs : 1600;
        transferState.hintOverride = text || null;
        transferState.hintOverrideUntil = text ? (Date.now() + Math.max(250, ms)) : 0;
        if (transferState.hintTimer) {
            clearTimeout(transferState.hintTimer);
            transferState.hintTimer = null;
        }
        if (text) {
            transferState.hintTimer = setTimeout(() => {
                transferState.hintOverride = null;
                transferState.hintOverrideUntil = 0;
                transferState.hintTimer = null;
                renderTransferGrid();
            }, Math.max(250, ms));
        }
        renderTransferGrid();
    }

    function ensureTransferPasteOverlay() {
        if (transferState.pasteOverlayEl && transferState.pasteBoxEl && transferState.pasteCloseBtnEl) return;

        const overlay = document.createElement('div');
        overlay.className = 'transfer-paste-overlay';

        const box = document.createElement('div');
        box.className = 'transfer-paste-box';
        box.tabIndex = 0;

        const title = document.createElement('div');
        title.className = 'transfer-paste-box-title';
        title.textContent = t('Paste Image', '粘贴图片');

        const subtitle = document.createElement('div');
        subtitle.className = 'transfer-paste-box-subtitle';
        subtitle.textContent = t('Press Ctrl+V', '请按 Ctrl+V');

        const actions = document.createElement('div');
        actions.className = 'transfer-paste-box-actions';

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'transfer-paste-close';
        closeBtn.textContent = t('Close', '关闭');

        actions.appendChild(closeBtn);
        box.appendChild(title);
        box.appendChild(subtitle);
        box.appendChild(actions);
        overlay.appendChild(box);
        transferPanel.appendChild(overlay);

        transferState.pasteOverlayEl = overlay;
        transferState.pasteBoxEl = box;
        transferState.pasteCloseBtnEl = closeBtn;
        transferState.pasteTitleEl = title;
        transferState.pasteSubtitleEl = subtitle;

        closeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            closeTransferPasteOverlay();
        });

        overlay.addEventListener('mousedown', (e) => {
            if (e.target === overlay) closeTransferPasteOverlay();
        });
    }

    function closeTransferPasteOverlay() {
        if (!transferState.pasteOverlayEl) return;
        transferState.pasteOverlayEl.classList.remove('open');

        if (transferState.pasteHandler) {
            document.removeEventListener('paste', transferState.pasteHandler, true);
            transferState.pasteHandler = null;
        }
        if (transferState.keydownHandler) {
            document.removeEventListener('keydown', transferState.keydownHandler, true);
            transferState.keydownHandler = null;
        }
    }

    function openTransferPasteOverlay() {
        ensureTransferPasteOverlay();
        if (!transferState.pasteOverlayEl || !transferState.pasteBoxEl) return;
        transferState.pasteOverlayEl.classList.add('open');
        try { transferState.pasteBoxEl.focus(); } catch (e) {}

        if (!transferState.pasteHandler) {
            transferState.pasteHandler = async (evt) => {
                try {
                    const data = evt && evt.clipboardData ? evt.clipboardData : null;
                    const items = data && data.items ? Array.from(data.items) : [];
                    let added = 0;
                    for (const it of items) {
                        if (!it || !it.type || !String(it.type).startsWith('image/')) continue;
                        const file = it.getAsFile();
                        if (!file) continue;
                        await addTransferFile(file);
                        added++;
                    }
                    if (added > 0) {
                        evt.preventDefault();
                        evt.stopPropagation();
                        if (evt.stopImmediatePropagation) evt.stopImmediatePropagation();
                        setTransferHintMessage(pastedImagesMessage(added));
                        closeTransferPasteOverlay();
                        return;
                    }

                    const text = data && typeof data.getData === 'function' ? String(data.getData('text/plain') || '') : '';
                    if (text && text.trim()) {
                        evt.preventDefault();
                        evt.stopPropagation();
                        if (evt.stopImmediatePropagation) evt.stopImmediatePropagation();
                        await addTransferUrl(text);
                        setTransferHintMessage(t('Pasted', '已粘贴'));
                        closeTransferPasteOverlay();
                        return;
                    }

                    setTransferHintMessage(t('No image in clipboard', '剪贴板无图片'));
                } catch (e) {
                    console.error('Paste capture failed:', e);
                    setTransferHintMessage(t('Paste failed', '粘贴失败'));
                }
            };
            document.addEventListener('paste', transferState.pasteHandler, true);
        }

        if (!transferState.keydownHandler) {
            transferState.keydownHandler = (evt) => {
                if (evt && evt.key === 'Escape') closeTransferPasteOverlay();
            };
            document.addEventListener('keydown', transferState.keydownHandler, true);
        }
    }

    function initTransferDirectPaste() {
        if (transferState.directPasteInited) return;
        transferState.directPasteInited = true;

        transferState.directPasteHandler = async (evt) => {
            try {
                if (!transferState.expanded) return;
                if (!evt || evt.defaultPrevented) return;
                if (transferState.pasteOverlayEl && transferState.pasteOverlayEl.classList && transferState.pasteOverlayEl.classList.contains('open')) return;

                const data = evt.clipboardData || null;
                const items = data && data.items ? Array.from(data.items) : [];
                let added = 0;

                for (const it of items) {
                    if (!it || !it.type || !String(it.type).startsWith('image/')) continue;
                    const file = it.getAsFile();
                    if (!file) continue;
                    await addTransferFile(file);
                    added++;
                }

                if (added > 0) {
                    evt.preventDefault();
                    evt.stopPropagation();
                    if (evt.stopImmediatePropagation) evt.stopImmediatePropagation();
                    setTransferHintMessage(pastedImagesMessage(added));
                    closeTransferPasteOverlay();
                }
            } catch (e) {
                console.error('Direct paste failed:', e);
            }
        };

        document.addEventListener('paste', transferState.directPasteHandler, true);
    }

    function renderTransferGrid() {
        updateTransferEntryState();
        transferList.innerHTML = '';
        const now = Date.now();
        const overrideActive = !!(transferState.hintOverride && transferState.hintOverrideUntil && now < transferState.hintOverrideUntil);
        if (overrideActive) {
            transferHint.textContent = transferState.hintOverride;
            transferHint.style.display = 'block';
        } else {
            transferHint.textContent = t('Drop images here', '拖放图片到这里');
            transferHint.style.display = transferState.items.length ? 'none' : 'block';
        }

        transferPanel.classList.toggle('two-col', transferState.items.length > 12);

        for (const item of transferState.items) {
            const wrap = document.createElement('div');
            wrap.className = 'transfer-item' + (item.id === transferState.selectedId ? ' selected' : '');
            wrap.draggable = true;
            wrap.dataset.transferId = String(item.id);

            const img = document.createElement('img');
            img.src = item.previewUrl;
            img.alt = 'image';

            const removeBtn = document.createElement('button');
            removeBtn.className = 'transfer-remove';
            removeBtn.type = 'button';
            removeBtn.textContent = '×';

            removeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                removeTransferItem(item.id);
            });

            wrap.addEventListener('click', () => {
                transferState.selectedId = item.id;
                renderTransferGrid();
                notifyTransferChange('select', { selectedId: item.id });
                postTransferSyncMessage({ kind: 'transfer_select', id: item.id });
            });

            wrap.addEventListener('dragstart', (e) => {
                try {
                    e.dataTransfer.effectAllowed = 'copy';
                    e.dataTransfer.setData('application/x-simpleai-transfer-id', String(item.id));
                    try {
                        if (item.blob && !item.dragUrl) {
                            item.dragUrl = URL.createObjectURL(item.blob);
                        }
                        if (item.dragUrl) {
                            e.dataTransfer.setData('text/uri-list', String(item.dragUrl));
                            e.dataTransfer.setData('text/plain', String(item.dragUrl));
                        } else {
                            e.dataTransfer.setData('text/plain', 'image');
                        }
                    } catch (e3) {
                        e.dataTransfer.setData('text/plain', 'image');
                    }
                    try {
                        if (e.dataTransfer.items && item.blob) {
                            const file = fileFromBlob(item.blob, item.name, item.type);
                            e.dataTransfer.items.add(file);
                        }
                    } catch (e2) {
                    }
                } catch (err) {
                }
            });

            wrap.appendChild(img);
            wrap.appendChild(removeBtn);
            transferList.appendChild(wrap);
        }
    }

    function removeTransferItem(id) {
        for (const item of transferState.items) {
            if (item.id === id) {
                try {
                    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
                } catch (e) {
                }
                try {
                    if (item.dragUrl) URL.revokeObjectURL(item.dragUrl);
                } catch (e) {
                }
            }
        }
        transferState.items = transferState.items.filter(x => x.id !== id);
        if (transferState.selectedId === id) {
            transferState.selectedId = transferState.items.length ? transferState.items[0].id : null;
        }
        renderTransferGrid();
        notifyTransferChange('remove', { id });
        postTransferSyncMessage({ kind: 'transfer_remove', id });
    }

    function clearTransferItems() {
        for (const item of transferState.items) {
            try {
                if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
            } catch (e) {
            }
            try {
                if (item.dragUrl) URL.revokeObjectURL(item.dragUrl);
            } catch (e) {
            }
        }
        transferState.items = [];
        transferState.selectedId = null;
        renderTransferGrid();
        notifyTransferChange('clear');
        postTransferSyncMessage({ kind: 'transfer_clear' });
    }

    async function addTransferBlob(blob, filename) {
        if (!blob) return;
        const type = blob.type || 'image/png';
        if (!String(type).startsWith('image/')) return;
        const thumbBlob = await createThumbnailBlobFromBlob(blob, 160);
        const previewBlob = thumbBlob || blob;
        const previewUrl = URL.createObjectURL(previewBlob);

        const item = {
            id: transferState.nextId++,
            blob,
            type,
            name: filename || `image_${Date.now()}.png`,
            previewUrl
        };
        transferState.items.unshift(item);
        if (!transferState.selectedId) transferState.selectedId = transferState.items[0].id;
        renderTransferGrid();
        notifyTransferChange('add', { item: snapshotTransferItem(item) });
        postTransferSyncMessage({ kind: 'transfer_add', item: { id: item.id, blob: item.blob, type: item.type, name: item.name } });
        return snapshotTransferItem(item);
    }

    async function addTransferFile(file) {
        if (!file || !file.type || !file.type.startsWith('image/')) return;
        return await addTransferBlob(file, file.name);
    }

    async function addTransferDataUrl(dataUrl) {
        if (!dataUrl || typeof dataUrl !== 'string') return;
        if (!dataUrl.startsWith('data:image/')) return;
        try {
            const blob = await (await fetch(dataUrl)).blob();
            return await addTransferBlob(blob, `image_${Date.now()}.png`);
        } catch (e) {
        }
    }

    async function addTransferUrl(url) {
        if (!url || typeof url !== 'string') return;
        const normalized = url.trim();
        if (!normalized) return;
        try {
            if (normalized.startsWith('data:image/')) {
                return await addTransferDataUrl(normalized);
            }
            const blob = await urlToBlob(normalized);
            return await addTransferBlob(blob, `image_${Date.now()}.png`);
        } catch (e) {
        }
    }

    function setFileInputFromFile(fileInput, file) {
        if (!fileInput || !file) return false;
        try {
            const dt = new DataTransfer();
            dt.items.add(file);
            fileInput.files = dt.files;
            fileInput.dispatchEvent(new Event('change', { bubbles: true }));
            fileInput.dispatchEvent(new Event('input', { bubbles: true }));
            return true;
        } catch (e) {
            return false;
        }
    }

    function fileNameFromUrl(url) {
        try {
            const parsed = new URL(url, window.location.href);
            const raw = parsed.pathname.split('/').filter(Boolean).pop() || `gallery_${Date.now()}.png`;
            return decodeURIComponent(raw).replace(/[\\/:*?"<>|]+/g, '_') || `gallery_${Date.now()}.png`;
        } catch (e) {
            return `gallery_${Date.now()}.png`;
        }
    }

    function firstUriFromText(text) {
        return String(text || '').split(/\r?\n/).map((line) => line.trim()).find((line) => line && !line.startsWith('#')) || '';
    }

    function firstImageSrcFromHtml(html) {
        if (!html) return '';
        try {
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const src = doc.querySelector('img[src]')?.getAttribute('src') || '';
            if (src) return src;
        } catch (e) {
        }
        const match = String(html).match(/<img\b[^>]*\bsrc=["']?([^"'\s>]+)/i);
        return match ? match[1] : '';
    }

    function normalizeDropUrl(url) {
        const value = String(url || '').trim();
        if (!value) return '';
        try {
            return new URL(value, window.location.href).href;
        } catch (e) {
            return value;
        }
    }

    function galleryOriginalUrlFromDropSource(source) {
        const url = normalizeDropUrl(source);
        if (!url) return '';
        try {
            if (typeof window.simpleaiGalleryDisplayPreviewOriginalSrc === 'function') {
                const original = window.simpleaiGalleryDisplayPreviewOriginalSrc(url);
                if (original) return original;
            }
        } catch (e) {
        }
        if (/\/gradio_api\/file=/i.test(url)) return url;
        return '';
    }

    function galleryOriginalUrlFromDownloadUrl(value) {
        const text = String(value || '');
        if (!text) return '';
        const first = text.indexOf(':');
        const second = first >= 0 ? text.indexOf(':', first + 1) : -1;
        if (second < 0) return '';
        return galleryOriginalUrlFromDropSource(text.slice(second + 1));
    }

    function galleryOriginalUrlFromDataTransfer(dataTransfer) {
        if (!dataTransfer || typeof dataTransfer.getData !== 'function') {
            try { return galleryOriginalUrlFromDropSource(window.__simpleaiGalleryOriginalDragUrl || ''); } catch (e) { return ''; }
        }
        const custom = galleryOriginalUrlFromDropSource(dataTransfer.getData('application/x-simpleai-gallery-original-url'));
        if (custom) return custom;
        const downloadUrl = galleryOriginalUrlFromDownloadUrl(dataTransfer.getData('DownloadURL'));
        if (downloadUrl) return downloadUrl;
        const uri = galleryOriginalUrlFromDropSource(firstUriFromText(dataTransfer.getData('text/uri-list')));
        if (uri) return uri;
        const htmlSrc = galleryOriginalUrlFromDropSource(firstImageSrcFromHtml(dataTransfer.getData('text/html')));
        if (htmlSrc) return htmlSrc;
        const plain = galleryOriginalUrlFromDropSource(dataTransfer.getData('text/plain'));
        if (plain) return plain;
        try { return galleryOriginalUrlFromDropSource(window.__simpleaiGalleryOriginalDragUrl || ''); } catch (e) { return ''; }
    }

    async function setFileInputFromGalleryOriginalUrl(fileInput, url) {
        if (!fileInput || !url) return false;
        try {
            const blob = await urlToBlob(url);
            if (!blob || !String(blob.type || '').startsWith('image/')) return false;
            return setFileInputFromFile(fileInput, fileFromBlob(blob, fileNameFromUrl(url), blob.type));
        } catch (e) {
            return false;
        }
    }

    function findFileInputForDropEvent(evt) {
        try {
            const root = gradioApp && gradioApp();
            if (!root) return null;
            let el = evt && evt.target ? evt.target : null;
            for (let i = 0; i < 10 && el; i++) {
                if (el.querySelector) {
                    const input = el.querySelector('input[type="file"]');
                    if (input) return input;
                }
                el = el.parentElement;
            }

            const x = typeof evt.clientX === 'number' ? evt.clientX : null;
            const y = typeof evt.clientY === 'number' ? evt.clientY : null;
            if (x === null || y === null) return null;

            const inputs = Array.from(root.querySelectorAll('input[type="file"]'));
            if (!inputs.length) return null;

            let best = null;
            let bestDist = Infinity;
            for (const input of inputs) {
                const rect = input.getBoundingClientRect();
                const cx = clamp(x, rect.left, rect.right);
                const cy = clamp(y, rect.top, rect.bottom);
                const dx = x - cx;
                const dy = y - cy;
                const dist = (dx * dx) + (dy * dy);
                if (dist < bestDist) {
                    bestDist = dist;
                    best = input;
                }
            }
            return best;
        } catch (e) {
            return null;
        }
    }

    function copyTextToClipboardLegacy(text) {
        try {
            const value = String(text || '');
            if (!value) return false;
            const ta = document.createElement('textarea');
            ta.value = value;
            ta.setAttribute('readonly', '');
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            ta.style.top = '0';
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            const ok = document.execCommand && document.execCommand('copy');
            document.body.removeChild(ta);
            return !!ok;
        } catch (e) {
            return false;
        }
    }

    async function copySelectedToClipboard() {
        const item = transferState.items.find(x => x.id === transferState.selectedId);
        if (!item || !item.blob) {
            setTransferHintMessage(t('No image selected', '未选择图片'));
            return;
        }
        try {
            try { window.focus(); } catch (e0) {}
            if (navigator.clipboard && navigator.clipboard.write && window.ClipboardItem) {
                const sourceBlob = item.blob;
                await navigator.clipboard.write([
                    new ClipboardItem({
                        'image/png': (async () => (await convertBlobToPng(sourceBlob)) || sourceBlob)()
                    })
                ]);
                setTransferHintMessage(t('Copied', '已复制'));
                return;
            }

            const dataUrl = await blobToDataUrl(item.blob);
            if (copyTextToClipboardLegacy(dataUrl)) {
                setTransferHintMessage(t('Copied as text', '已复制为文本'));
                return;
            }
        } catch (e) {
            console.error('Clipboard copy failed:', e);
            try {
                const dataUrl = await blobToDataUrl(item.blob);
                if (copyTextToClipboardLegacy(dataUrl)) {
                    setTransferHintMessage(t('Copied as text', '已复制为文本'));
                    return;
                }
            } catch (e2) {
            }
            setTransferHintMessage(window.isSecureContext ? t('Copy failed', '复制失败') : t('Copy failed: use https/localhost', '复制失败：建议用 https/localhost'));
        }
    }

    function hasTransferExternalDropPayload(dataTransfer) {
        try {
            if (!dataTransfer) return false;
            const types = dataTransfer.types ? Array.from(dataTransfer.types) : [];
            if (types.includes('application/x-simpleai-transfer-id') || types.includes('application/x-simpleai-image-dataurl')) return false;
            if (types.includes('application/x-simpleai-gallery-original-url')) return true;
            if (types.includes('Files')) return true;
            if (types.includes('text/uri-list') || types.includes('text/plain')) return true;
            const files = dataTransfer.files ? Array.from(dataTransfer.files) : [];
            return files.length > 0;
        } catch (e) {
            return false;
        }
    }

    function stopTransferDropEvent(e) {
        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    }

    function isTransferStationDropTarget(e) {
        const target = e && e.target ? e.target : null;
        const path = e && typeof e.composedPath === 'function' ? e.composedPath() : [];
        return [transferPanel, transferToggleBtn, workEntryTile].some((el) => {
            if (!el) return false;
            if (path && path.includes && path.includes(el)) return true;
            return !!(target && el.contains && el.contains(target));
        });
    }

    function consumeTransferHoverEvent(e) {
        if (!isTransferStationDropTarget(e)) return false;
        if (!hasTransferExternalDropPayload(e.dataTransfer)) return false;
        stopTransferDropEvent(e);
        if (!transferState.expanded) setTransferExpanded(true, true);
        transferPanel.classList.add('dragover');
        return true;
    }

    async function handleTransferDropDataTransfer(dataTransfer) {
        const transferId = dataTransfer ? (dataTransfer.getData('application/x-simpleai-transfer-id') || '') : '';
        if (transferId) return;

        const galleryOriginalUrl = galleryOriginalUrlFromDataTransfer(dataTransfer);
        if (galleryOriginalUrl) {
            const added = await addTransferUrl(galleryOriginalUrl);
            if (added) return;
        }

        const files = (dataTransfer && dataTransfer.files) ? Array.from(dataTransfer.files) : [];
        if (files.length) {
            for (const f of files) {
                await addTransferFile(f);
            }
            return;
        }

        const uri = dataTransfer ? (dataTransfer.getData('text/uri-list') || '') : '';
        const text = dataTransfer ? (dataTransfer.getData('text/plain') || '') : '';
        const payload = (uri || text).trim();
        if (payload) {
            try {
                await addTransferUrl(payload);
            } catch (err) {
            }
        }
    }

    function initTransferDropZone() {
        const prevent = (e) => {
            stopTransferDropEvent(e);
        };

        document.addEventListener('dragenter', (e) => {
            consumeTransferHoverEvent(e);
        }, true);

        document.addEventListener('dragover', (e) => {
            consumeTransferHoverEvent(e);
        }, true);

        document.addEventListener('drop', async (e) => {
            if (!isTransferStationDropTarget(e)) return;
            if (!hasTransferExternalDropPayload(e.dataTransfer)) return;
            stopTransferDropEvent(e);
            if (!transferState.expanded) setTransferExpanded(true, true);
            transferPanel.classList.remove('dragover');
            await handleTransferDropDataTransfer(e.dataTransfer);
        }, true);

        transferPanel.addEventListener('dragover', (e) => {
            prevent(e);
            transferPanel.classList.add('dragover');
        });

        transferPanel.addEventListener('dragleave', (e) => {
            prevent(e);
            transferPanel.classList.remove('dragover');
        });

        transferPanel.addEventListener('drop', async (e) => {
            prevent(e);
            transferPanel.classList.remove('dragover');
            await handleTransferDropDataTransfer(e.dataTransfer);
        });
    }

    function updateTransferPanelLayout() {
        try {
            if (!transferPanel || !statusIndicator) return;
            if (!transferState.expanded) {
                transferPanel.style.maxHeight = '';
                transferPanel.style.top = 'calc(100% + 6px)';
                transferPanel.style.bottom = '';
                return;
            }

            const statusRect = statusIndicator.getBoundingClientRect();
            const margin = 8;
            const openRight = statusRect.left < margin + 64;
            const downAvail = window.innerHeight - (statusRect.bottom + 6) - margin;
            const upAvail = (statusRect.top - 6) - margin;
            const openUp = downAvail < 220 && upAvail > downAvail;
            transferPanel.style.left = openRight ? '0' : 'auto';
            transferPanel.style.right = openRight ? 'auto' : '0';

            if (openUp) {
                transferPanel.style.top = 'auto';
                transferPanel.style.bottom = 'calc(100% + 6px)';
                transferPanel.style.maxHeight = `${Math.max(140, Math.floor(upAvail))}px`;
            } else {
                transferPanel.style.bottom = 'auto';
                transferPanel.style.top = 'calc(100% + 6px)';
                transferPanel.style.maxHeight = `${Math.max(140, Math.floor(downAvail))}px`;
            }
        } catch (e) {
        }
    }

    function initTransferActions() {
        canvasWorkbenchToggleBtn.addEventListener('click', (e) => {
            rememberCanvasWorkbenchSystemParams();
            if (canvasWorkbenchLazyState.loadingPromise) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            if (isCanvasWorkbenchStandaloneActive()) {
                openCanvasWorkbenchStandalone();
                return;
            }
            openCanvasWorkbench('status_entry');
        });

        canvasWorkbenchToggleBtn.addEventListener('contextmenu', (e) => {
            showCanvasWorkbenchStandaloneMenu(e);
        });

        transferToggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            setTransferExpanded(!transferState.expanded, true);
        });

        const prevent = (e) => {
            e.preventDefault();
            e.stopPropagation();
        };

        transferToggleBtn.addEventListener('dragenter', (e) => {
            try {
                const types = e.dataTransfer && e.dataTransfer.types ? Array.from(e.dataTransfer.types) : [];
                const hasAny = types.includes('Files') || types.includes('text/uri-list') || types.includes('text/plain') || types.includes('application/x-simpleai-transfer-id') || types.includes('application/x-simpleai-image-dataurl') || types.includes('application/x-simpleai-gallery-original-url');
                if (!hasAny) return;
            } catch (e0) {
            }
            prevent(e);
            if (hasTransferExternalDropPayload(e.dataTransfer)) {
                if (!transferState.expanded) setTransferExpanded(true, true);
                transferPanel.classList.add('dragover');
            }
        });

        transferToggleBtn.addEventListener('dragover', (e) => {
            try {
                const types = e.dataTransfer && e.dataTransfer.types ? Array.from(e.dataTransfer.types) : [];
                const hasAny = types.includes('Files') || types.includes('text/uri-list') || types.includes('text/plain') || types.includes('application/x-simpleai-transfer-id') || types.includes('application/x-simpleai-image-dataurl') || types.includes('application/x-simpleai-gallery-original-url');
                if (!hasAny) return;
            } catch (e0) {
            }
            prevent(e);
            if (hasTransferExternalDropPayload(e.dataTransfer)) {
                if (!transferState.expanded) setTransferExpanded(true, true);
                transferPanel.classList.add('dragover');
            }
        });

        transferToggleBtn.addEventListener('drop', async (e) => {
            try {
                const types = e.dataTransfer && e.dataTransfer.types ? Array.from(e.dataTransfer.types) : [];
                const hasAny = types.includes('Files') || types.includes('text/uri-list') || types.includes('text/plain') || types.includes('application/x-simpleai-transfer-id') || types.includes('application/x-simpleai-image-dataurl') || types.includes('application/x-simpleai-gallery-original-url');
                if (!hasAny) return;
            } catch (e0) {
            }
            prevent(e);
            if (!hasTransferExternalDropPayload(e.dataTransfer)) return;
            if (!transferState.expanded) setTransferExpanded(true, true);
            transferPanel.classList.remove('dragover');
            await handleTransferDropDataTransfer(e.dataTransfer);
        });

        workEntryTile.addEventListener('dragenter', (e) => {
            try {
                const types = e.dataTransfer && e.dataTransfer.types ? Array.from(e.dataTransfer.types) : [];
                const hasAny = types.includes('Files') || types.includes('text/uri-list') || types.includes('text/plain') || types.includes('application/x-simpleai-transfer-id') || types.includes('application/x-simpleai-image-dataurl') || types.includes('application/x-simpleai-gallery-original-url');
                if (!hasAny) return;
            } catch (e0) {
            }
            prevent(e);
            if (hasTransferExternalDropPayload(e.dataTransfer)) {
                if (!transferState.expanded) setTransferExpanded(true, true);
                transferPanel.classList.add('dragover');
            }
        });

        workEntryTile.addEventListener('dragover', (e) => {
            try {
                const types = e.dataTransfer && e.dataTransfer.types ? Array.from(e.dataTransfer.types) : [];
                const hasAny = types.includes('Files') || types.includes('text/uri-list') || types.includes('text/plain') || types.includes('application/x-simpleai-transfer-id') || types.includes('application/x-simpleai-image-dataurl') || types.includes('application/x-simpleai-gallery-original-url');
                if (!hasAny) return;
            } catch (e0) {
            }
            prevent(e);
            if (hasTransferExternalDropPayload(e.dataTransfer)) {
                if (!transferState.expanded) setTransferExpanded(true, true);
                transferPanel.classList.add('dragover');
            }
        });

        workEntryTile.addEventListener('dragleave', () => {
            transferPanel.classList.remove('dragover');
        });

        workEntryTile.addEventListener('drop', async (e) => {
            try {
                const types = e.dataTransfer && e.dataTransfer.types ? Array.from(e.dataTransfer.types) : [];
                const hasAny = types.includes('Files') || types.includes('text/uri-list') || types.includes('text/plain') || types.includes('application/x-simpleai-transfer-id') || types.includes('application/x-simpleai-image-dataurl') || types.includes('application/x-simpleai-gallery-original-url');
                if (!hasAny) return;
            } catch (e0) {
            }
            prevent(e);
            if (!hasTransferExternalDropPayload(e.dataTransfer)) return;
            if (!transferState.expanded) setTransferExpanded(true, true);
            transferPanel.classList.remove('dragover');
            await handleTransferDropDataTransfer(e.dataTransfer);
        });

        transferClearBtn.addEventListener('click', (e) => {
            e.preventDefault();
            clearTransferItems();
        });

        transferPasteBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            try {
                try { window.focus(); } catch (e0) {}
                let added = 0;
                let usedApi = false;

                if (navigator.clipboard && navigator.clipboard.read) {
                    usedApi = true;
                    try {
                        const items = await navigator.clipboard.read();
                        for (const clipItem of items) {
                            const type = (clipItem.types || []).find(t => String(t).startsWith('image/'));
                            if (!type) continue;
                            const blob = await clipItem.getType(type);
                            const file = new File([blob], `clipboard_${Date.now()}.png`, { type });
                            await addTransferFile(file);
                            added++;
                        }
                    } catch (e1) {
                    }
                }
                if (added > 0) {
                    setTransferHintMessage(pastedImagesMessage(added));
                    return;
                }

                if (navigator.clipboard && navigator.clipboard.readText) {
                    usedApi = true;
                    const text = await navigator.clipboard.readText();
                    if (text && text.trim()) {
                        await addTransferUrl(text);
                        setTransferHintMessage(t('Pasted', '已粘贴'));
                        return;
                    }
                }

                if (usedApi) {
                    setTransferHintMessage(t('No image in clipboard', '剪贴板无图片'));
                    return;
                }
                openTransferPasteOverlay();
            } catch (err) {
                console.error('Clipboard paste failed:', err);
                openTransferPasteOverlay();
            }
        });
    }

    function initTransferDropToGradio() {
        const isLayerForgeDragTarget = (evt) => {
            try {
                const t = evt && evt.target ? evt.target : null;
                const iframe = t && t.closest ? (t.tagName === 'IFRAME' ? t : t.closest('iframe')) : (t && t.tagName === 'IFRAME' ? t : null);
                if (!iframe) return false;
                const src = String(iframe.getAttribute('src') || iframe.src || '');
                return /file=javascript\/layerforge\/app\.html/i.test(src) || /javascript\/layerforge\/app\.html/i.test(src);
            } catch (e) {
                return false;
            }
        };

        const isLayerForgePoint = (evt) => {
            try {
                if (isLayerForgeDragTarget(evt)) return true;
                const x = typeof evt?.clientX === 'number' ? evt.clientX : null;
                const y = typeof evt?.clientY === 'number' ? evt.clientY : null;
                if (x === null || y === null) return false;
                const iframes = Array.from(document.querySelectorAll('iframe'));
                for (const iframe of iframes) {
                    const src = String(iframe.getAttribute('src') || iframe.src || '');
                    const isLayerForge = /file=javascript\/layerforge\/app\.html/i.test(src) || /javascript\/layerforge\/app\.html/i.test(src);
                    if (!isLayerForge) continue;
                    const r = iframe.getBoundingClientRect();
                    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return true;
                }
                return false;
            } catch (e) {
                return false;
            }
        };

        document.addEventListener('dragover', (e) => {
            try {
                if (isLayerForgePoint(e)) return;
                const types = e.dataTransfer && e.dataTransfer.types ? Array.from(e.dataTransfer.types) : [];
                const hasPayload = types.includes('application/x-simpleai-transfer-id')
                    || types.includes('application/x-simpleai-image-dataurl')
                    || types.includes('application/x-simpleai-gallery-original-url')
                    || !!window.__simpleaiGalleryOriginalDragUrl;
                if (!hasPayload) return;
                e.preventDefault();
            } catch (err) {
            }
        }, true);

        document.addEventListener('drop', async (e) => {
            try {
                if (isLayerForgePoint(e)) return;
                const input = findFileInputForDropEvent(e);
                if (!input) return;
                const galleryOriginalUrl = galleryOriginalUrlFromDataTransfer(e.dataTransfer);
                if (galleryOriginalUrl) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    if (await setFileInputFromGalleryOriginalUrl(input, galleryOriginalUrl)) {
                        return;
                    }
                }
                const transferId = e.dataTransfer ? (e.dataTransfer.getData('application/x-simpleai-transfer-id') || '') : '';
                if (transferId) {
                    const idNum = Number(transferId);
                    const item = transferState.items.find(x => x.id === idNum);
                    if (item && item.blob) {
                        const file = fileFromBlob(item.blob, item.name, item.type);
                        if (setFileInputFromFile(input, file)) {
                            e.preventDefault();
                            return;
                        }
                    }
                }
                const dataUrl = e.dataTransfer ? (e.dataTransfer.getData('application/x-simpleai-image-dataurl') || '') : '';
                if (dataUrl && typeof setFileInputFromDataUrl === 'function') {
                    if (setFileInputFromDataUrl(input, dataUrl, `transfer_${Date.now()}.png`)) {
                        e.preventDefault();
                        return;
                    }
                }
            } catch (err) {
            }
        }, true);
    }

    function findTransferItem(idRaw) {
        const id = typeof idRaw === 'number' ? idRaw : Number(idRaw);
        if (!Number.isFinite(id)) return null;
        return transferState.items.find(x => x.id === id) || null;
    }

    async function getTransferItemForApi(idRaw, options) {
        const item = findTransferItem(idRaw);
        if (!item || !item.blob) return null;
        const includeDataUrl = !!(options && options.dataUrl);
        const includeFile = options && Object.prototype.hasOwnProperty.call(options, 'file') ? !!options.file : true;
        const payload = snapshotTransferItem(item);
        payload.blob = item.blob;
        payload.previewUrl = item.previewUrl || '';
        if (includeFile) payload.file = fileFromBlob(item.blob, item.name, item.type);
        if (includeDataUrl) payload.dataUrl = await blobToDataUrl(item.blob);
        return payload;
    }

    async function getTransferItemsForApi(options) {
        const items = [];
        for (const item of transferState.items) {
            const payload = await getTransferItemForApi(item.id, options);
            if (payload) items.push(payload);
        }
        return items;
    }

    function exposeTransferStationApi() {
        const api = {
            version: '1.0.0',
            listItems: () => getTransferSnapshot().items,
            getItems: (options) => getTransferItemsForApi(options),
            getAllItems: (options) => getTransferItemsForApi(options),
            getSnapshot: () => getTransferSnapshot(),
            getSelectedId: () => transferState.selectedId,
            getSelectedItem: (options) => getTransferItemForApi(transferState.selectedId, options),
            getItem: (id, options) => getTransferItemForApi(id, options),
            addBlob: addTransferBlob,
            addFile: addTransferFile,
            addDataUrl: addTransferDataUrl,
            addUrl: addTransferUrl,
            remove: removeTransferItem,
            clear: clearTransferItems,
            setExpanded: (expanded) => setTransferExpanded(!!expanded, true),
            openWorkbench: () => {
                const ready = !!getCanvasWorkbenchApi();
                openCanvasWorkbench('transfer_station_api');
                return ready;
            },
            onChange: (listener) => {
                if (typeof listener !== 'function') return () => {};
                transferListeners.add(listener);
                return () => transferListeners.delete(listener);
            }
        };
        window.SimpAITransferStation = api;
        try {
            window.dispatchEvent(new CustomEvent('simpai:transfer-station-ready', { detail: { api } }));
        } catch (err) {
        }
        return api;
    }

    function isMobileStatusLayout() {
        return window.matchMedia('(max-width: 640px), (pointer: coarse) and (max-width: 900px)').matches;
    }

    function isPresetStoreVisible(element) {
        if (!element || element.hidden || element.classList.contains('hidden') || element.classList.contains('hide')) {
            return false;
        }
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return style.display !== 'none'
            && style.visibility !== 'hidden'
            && rect.width > 2
            && rect.height > 2;
    }

    function isElementVisibleInViewport(element) {
        if (!element || element.hidden || element.classList.contains('hidden') || element.classList.contains('hide')) {
            return false;
        }
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || rect.width <= 2 || rect.height <= 2) {
            return false;
        }
        return rect.bottom > 0
            && rect.right > 0
            && rect.top < (window.innerHeight || document.documentElement.clientHeight || 0)
            && rect.left < (window.innerWidth || document.documentElement.clientWidth || 0);
    }

    function syncMobileStatusPresetStoreVisibility() {
        const mobileStatus = isMobileStatusLayout();
        const openPresetStore = Array.from(document.querySelectorAll('.simpleai-floating-host > .preset_store'))
            .some(isPresetStoreVisible);
        const promptActionsVisible = isElementVisibleInViewport(document.querySelector('#prompt_action_row'));
        if (document.body) {
            document.body.classList.toggle('simpleai-preset-store-open-mobile', mobileStatus && openPresetStore);
            document.body.classList.toggle('simpleai-mobile-prompt-actions-visible', mobileStatus && promptActionsVisible);
        }
    }

    let mobileStatusVisibilityFrame = 0;
    function scheduleMobileStatusPresetStoreVisibility() {
        if (mobileStatusVisibilityFrame) return;
        mobileStatusVisibilityFrame = window.requestAnimationFrame
            ? window.requestAnimationFrame(() => {
                mobileStatusVisibilityFrame = 0;
                syncMobileStatusPresetStoreVisibility();
            })
            : window.setTimeout(() => {
                mobileStatusVisibilityFrame = 0;
                syncMobileStatusPresetStoreVisibility();
            }, 60);
    }

    function initMobileStatusPresetStoreVisibility() {
        syncMobileStatusPresetStoreVisibility();
        if (typeof onAfterUiUpdate === 'function') {
            onAfterUiUpdate(scheduleMobileStatusPresetStoreVisibility);
        }
        window.addEventListener('resize', scheduleMobileStatusPresetStoreVisibility);
        window.addEventListener('scroll', scheduleMobileStatusPresetStoreVisibility, { passive: true });
        window.addEventListener('simpai:system-params-updated', scheduleMobileStatusPresetStoreVisibility);
        window.addEventListener('simpai:preset-store-opened', scheduleMobileStatusPresetStoreVisibility);
        window.addEventListener('simpai:preset-store-closed', scheduleMobileStatusPresetStoreVisibility);
    }

    function initImageTransferStation() {
        rememberCanvasWorkbenchSystemParams();
        transferPanelActions.appendChild(transferPasteBtn);
        transferPanelActions.appendChild(transferClearBtn);
        transferPanel.appendChild(transferPanelActions);
        transferPanel.appendChild(transferHint);
        transferPanel.appendChild(transferList);
        initTransferActions();
        initTransferDropZone();
        initTransferDropToGradio();
        initTransferDirectPaste();
        renderTransferGrid();
        initTransferCrossTabSync();
    }

    exposeTransferStationApi();

    function checkAdminAPIAvailability() {
        state.hasAdminAPI = !!(window.pywebview && 
                             window.pywebview.api && 
                             typeof window.pywebview.api.switchToAdmin === 'function');
    }

    // ==================== 初始化 ====================
    function initializeMonitor() {
        checkAdminAPIAvailability();
        // 检测并应用主题
        state.currentTheme = detectTheme();
        applyTheme();
        const enableTransferStation = !mobileDevice;

        // 注入样式
        document.head.appendChild(style);

        // 组装 DOM
        statusContainer.appendChild(statusIndicator);
        statusIndicator.appendChild(statusTiles);
        statusTiles.appendChild(statusContent);
        if (enableTransferStation) {
            workEntryTile.appendChild(canvasWorkbenchToggleBtn);
            workEntryTile.appendChild(transferToggleBtn);
            statusTiles.appendChild(workEntryTile);
        }
        if (enableTransferStation) {
            statusIndicator.appendChild(transferPanel);
        } else {
            transferState.expanded = false;
            statusIndicator.classList.remove('transfer-expanded');
        }
        statusIndicator.classList.toggle('transfer-expanded', !!transferState.expanded);
        window.addEventListener('resize', () => {
            preserveStatusMonitorPositionAfterResize();
            if (transferState && transferState.expanded) requestAnimationFrame(updateTransferPanelLayout);
            syncMobileStatusPresetStoreVisibility();
        });
        // 集成到 Gradio
        const gradioContainer = gradioApp();
        if (gradioContainer) {
            const host = document.body || gradioContainer;
            host.appendChild(statusContainer);
            
            // 初始化拖拽功能
            initDragFeature();
            if (enableTransferStation) {
                initImageTransferStation();
            }
            initMobileStatusPresetStoreVisibility();
        }
        // 启动检测
        startHealthChecks();
    }

    // 启动监控
    if (document.readyState === 'complete') {
        initializeMonitor();
    } else {
        window.addEventListener('load', initializeMonitor);
    }
})();


