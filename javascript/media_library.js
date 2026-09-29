(function () {
    'use strict';

    const config = Object.assign({
        theme: 'light',
        lang: 'en',
        apiBase: '/simpleai/gallery',
        cnUrl: '/language/cn.json'
    }, window.simpleaiGalleryConfig || {});
    const MAX_RENDERED = 180;
    const WINDOW_BUFFER_PX = 2400;
    const PAGE_SIZE = 48;
    const AUTOPLAY_STORAGE_KEY = 'simpai.mediaLibrary.videoAutoplay';
    const MAX_AUTOPLAY_BYTES = 256 * 1024 * 1024;
    const MAX_AUTOPLAY_EDGE = 3840;

    const state = {
        __lang: config.lang,
        items: [],
        itemById: new Map(),
        dates: [],
        cursor: null,
        hasMore: true,
        loading: false,
        query: '',
        date: '',
        mediaType: 'all',
        sort: 'newest',
        favorite: null,
        tag: '',
        ratingMin: '',
        modelQuery: '',
        orientation: '',
        collectionId: '',
        collections: [],
        savedViews: [],
        activeViewId: '',
        autoplayEnabled: true,
        autoplayTimer: 0,
        failedPreviews: new Set(),
        compareIds: [],
        compareMode: 'side',
        compareMatch: 'fit',
        compareZoom: 1,
        comparePan: { x: 0, y: 0 },
        compareSplit: 50,
        compareDrag: null,
        compareSync: true,
        compareMuted: false,
        comparePlaying: false,
        compareTime: 0,
        compareDuration: 0,
        compareRate: 1,
        compareTimer: 0,
        compareSession: 0,
        trashMode: false,
        selectionMode: false,
        selectedIds: new Set(),
        selectionAnchorId: '',
        selectedId: '',
        viewerId: '',
        viewerZoom: 1,
        renderedStart: -1,
        renderedEnd: -1,
        renderedColumnCount: 0,
        renderedKey: '',
        layout: null,
        request: null,
        requestSerial: 0,
        dateSignature: '',
        dateRefreshTimer: 0,
        toastTimer: 0,
        refreshing: false,
        cardClickTimer: 0
    };

    const refs = {};
    const t = (text) => {
        const lang = state.__lang || config.lang;
        if (window.SimpAII18n && typeof window.SimpAII18n.t === 'function') {
            return window.SimpAII18n.t(text, text, { __lang: lang });
        }
        if (lang === 'cn' && window.localization && window.localization[text]) return window.localization[text];
        return text;
    };

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function formatDate(value) {
        const text = String(value || '');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
        try {
            return new Intl.DateTimeFormat(config.lang === 'cn' ? 'zh-CN' : 'en-US', {
                year: 'numeric', month: 'short', day: 'numeric'
            }).format(new Date(text + 'T00:00:00'));
        } catch (err) {
            return text;
        }
    }

    function formatBytes(value) {
        const bytes = Number(value || 0);
        if (!Number.isFinite(bytes) || bytes <= 0) return '';
        const units = ['B', 'KB', 'MB', 'GB'];
        let size = bytes;
        let index = 0;
        while (size >= 1024 && index < units.length - 1) { size /= 1024; index += 1; }
        return `${size >= 10 || index === 0 ? Math.round(size) : size.toFixed(1)} ${units[index]}`;
    }

    function starRating(rating) {
        const value = Math.max(0, Math.min(5, Number(rating || 0)));
        return `${'★'.repeat(value)}${'☆'.repeat(5 - value)}`;
    }

    function apiUrl(path) {
        return `${String(config.apiBase || '').replace(/\/$/, '')}/${String(path || '').replace(/^\//, '')}`;
    }

    async function request(path, options) {
        const response = await fetch(apiUrl(path), Object.assign({ credentials: 'same-origin' }, options || {}));
        let payload = null;
        try { payload = await response.json(); } catch (err) { payload = {}; }
        if (!response.ok || payload.ok === false) {
            const error = new Error(payload.error || `${response.status} ${response.statusText}`);
            error.payload = payload;
            throw error;
        }
        return payload;
    }

    function setRefreshBusy(busy) {
        state.refreshing = !!busy;
        [refs.refresh, refs.rescan].forEach((button) => {
            if (button) button.disabled = state.refreshing;
        });
    }

    async function refreshLibrary() {
        if (state.refreshing) return;
        window.clearTimeout(state.dateRefreshTimer);
        state.dateRefreshTimer = 0;
        setRefreshBusy(true);
        setStatus(t('Loading...'));
        try {
            await request('/api/rescan', { method: 'POST' });
            showToast(t('Rescan started'));
            await Promise.all([loadDates(), loadPage(true)]);
        } catch (err) {
            showToast(t('Unable to refresh media'), true);
        } finally {
            setRefreshBusy(false);
        }
    }

    function showToast(message, error) {
        if (!refs.toast) return;
        refs.toast.textContent = String(message || '');
        refs.toast.classList.toggle('is-error', !!error);
        refs.toast.classList.add('is-visible');
        window.clearTimeout(state.toastTimer);
        state.toastTimer = window.setTimeout(() => refs.toast.classList.remove('is-visible'), 2600);
    }

    function clearCardClickTimer() {
        window.clearTimeout(state.cardClickTimer);
        state.cardClickTimer = 0;
    }

    function setStatus(message) {
        if (refs.status) refs.status.textContent = message || '';
    }

    function updateStaticTranslations() {
        document.querySelectorAll('[data-i18n]').forEach((node) => {
            node.textContent = t(node.getAttribute('data-i18n'));
        });
        document.querySelectorAll('[data-i18n-placeholder]').forEach((node) => {
            node.placeholder = t(node.getAttribute('data-i18n-placeholder'));
        });
        document.documentElement.lang = config.lang === 'cn' ? 'zh-CN' : 'en';
        document.title = t('Media Library');
        [
            ['filter-toggle', 'Filters'], ['collection-create-toggle', 'New collection'],
            ['view-save', 'Save view'], ['selection-add-collection', 'Add to collection'],
            ['selection-remove-collection', 'Remove from collection'],
            ['collection-create-form button', 'Create'],
            ['compare-close', 'Close'], ['compare-align', 'Reset alignment'],
            ['compare-side', 'Side by side'], ['compare-wipe', 'Wipe'],
            ['compare-sync', 'Sync playback'], ['compare-time', 'Playback position'],
            ['compare-rate', 'Playback speed']
        ].forEach(([id, label]) => {
            const button = id.includes(' ') ? document.querySelector(`#${id}`) : document.getElementById(id);
            if (button) {
                button.title = t(label);
                button.setAttribute('aria-label', t(label));
            }
        });
        document.querySelector('.compare-modes')?.setAttribute('aria-label', t('Compare mode'));
    }

    async function loadLocale() {
        if (config.lang !== 'cn' || !config.cnUrl) return;
        try {
            const response = await fetch(config.cnUrl, { credentials: 'same-origin', cache: 'force-cache' });
            if (response.ok) window.localization = await response.json();
        } catch (err) {
            // English labels remain usable when the optional locale file is unavailable.
        }
    }

    function renderDates() {
        if (!refs.dateList) return;
        const fragment = document.createDocumentFragment();
        state.dates.forEach((entry) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'date-item';
            button.dataset.date = entry.date_key || '';
            button.setAttribute('aria-current', state.date === entry.date_key ? 'true' : 'false');
            button.innerHTML = `<span class="date-label">${escapeHtml(formatDate(entry.date_key))}</span>` +
                `<span class="date-count">${Number(entry.total || 0)}</span>` +
                `<span class="date-types">${Number(entry.images || 0)} ${escapeHtml(t('Images'))} · ${Number(entry.videos || 0)} ${escapeHtml(t('Videos'))} · ${Number(entry.audios || 0)} ${escapeHtml(t('Audio'))}</span>`;
            fragment.appendChild(button);
        });
        refs.dateList.replaceChildren(fragment);
    }

    function renderOrganizers() {
        if (refs.collectionList) {
            refs.collectionList.innerHTML = state.collections.map((collection) =>
                `<div class="organizer-item${state.collectionId === collection.collection_id ? ' is-active' : ''}" data-collection="${escapeHtml(collection.collection_id)}">` +
                `<button type="button" data-organizer-open="collection" title="${escapeHtml(collection.title)}"><i class="fa fa-folder"></i><span class="organizer-name">${escapeHtml(collection.title)}</span><span class="organizer-count">${Number(collection.item_count || 0)}</span></button>` +
                `<button class="icon-button" type="button" data-organizer-delete="collection" title="${escapeHtml(t('Delete collection'))}" aria-label="${escapeHtml(t('Delete collection'))}"><i class="fa fa-xmark"></i></button></div>`
            ).join('');
        }
        if (refs.viewList) {
            refs.viewList.innerHTML = state.savedViews.map((view) =>
                `<div class="organizer-item${state.activeViewId === view.view_id ? ' is-active' : ''}" data-view="${escapeHtml(view.view_id)}">` +
                `<button type="button" data-organizer-open="view" title="${escapeHtml(view.title)}"><i class="fa fa-filter"></i><span class="organizer-name">${escapeHtml(view.title)}</span></button>` +
                `<button class="icon-button" type="button" data-organizer-delete="view" title="${escapeHtml(t('Delete view'))}" aria-label="${escapeHtml(t('Delete view'))}"><i class="fa fa-xmark"></i></button></div>`
            ).join('');
        }
        if (refs.selectionCollection) {
            const previous = refs.selectionCollection.value;
            refs.selectionCollection.innerHTML = `<option value="">${escapeHtml(t('Collection'))}</option>` +
                state.collections.map((collection) =>
                    `<option value="${escapeHtml(collection.collection_id)}">${escapeHtml(collection.title)}</option>`
                ).join('');
            refs.selectionCollection.value = state.collections.some((entry) => entry.collection_id === previous) ? previous : '';
        }
    }

    async function loadOrganizers() {
        try {
            const [collections, views] = await Promise.all([
                request('/api/collections'), request('/api/views')
            ]);
            state.collections = Array.isArray(collections.collections) ? collections.collections : [];
            state.savedViews = Array.isArray(views.views) ? views.views : [];
            renderOrganizers();
        } catch (err) {
            showToast(t('Unable to load collections'), true);
        }
    }

    function currentFilters() {
        return {
            date: state.date, type: state.mediaType, q: state.query,
            favorite: state.favorite === true, sort: state.sort, tag: state.tag,
            rating_min: state.ratingMin, model: state.modelQuery,
            orientation: state.orientation, collection: state.collectionId
        };
    }

    function syncFilterFields() {
        if (refs.search) refs.search.value = state.query;
        if (refs.type) refs.type.value = state.mediaType;
        if (refs.sort) refs.sort.value = state.sort;
        if (refs.filterTag) refs.filterTag.value = state.tag;
        if (refs.filterModel) refs.filterModel.value = state.modelQuery;
        if (refs.filterRating) refs.filterRating.value = state.ratingMin;
        if (refs.filterOrientation) refs.filterOrientation.value = state.orientation;
        if (refs.favoriteFilter) refs.favoriteFilter.setAttribute('aria-pressed', state.favorite === true ? 'true' : 'false');
        if (refs.filterToggle) {
            const active = !!(state.tag || state.modelQuery || state.ratingMin || state.orientation);
            refs.filterToggle.setAttribute('aria-pressed', active ? 'true' : 'false');
        }
        renderDates();
        renderOrganizers();
    }

    function applySavedFilters(filters) {
        const value = filters && typeof filters === 'object' ? filters : {};
        state.date = String(value.date || '');
        state.mediaType = ['image', 'video', 'audio'].includes(value.type) ? value.type : 'all';
        state.query = String(value.q || '');
        state.favorite = value.favorite === true ? true : null;
        state.sort = value.sort === 'oldest' ? 'oldest' : 'newest';
        state.tag = String(value.tag || '');
        state.ratingMin = value.rating_min ? String(value.rating_min) : '';
        state.modelQuery = String(value.model || '');
        state.orientation = ['landscape', 'portrait', 'square'].includes(value.orientation) ? value.orientation : '';
        state.collectionId = String(value.collection || '');
        clearSelectionForQueryChange();
        syncFilterFields();
        refs.feedScroll.scrollTop = 0;
        loadPage(true);
    }

    function dateSummarySignature(dates) {
        return (Array.isArray(dates) ? dates : []).map((entry) => [
            entry.date_key || '',
            Number(entry.total || 0),
            Number(entry.images || 0),
            Number(entry.videos || 0),
            Number(entry.audios || 0)
        ].join(':')).join('\u001f');
    }

    function scheduleDatePolling(delayMilliseconds = 2500) {
        window.clearTimeout(state.dateRefreshTimer);
        state.dateRefreshTimer = window.setTimeout(() => {
            state.dateRefreshTimer = 0;
            loadDates({ syncItems: true, silent: true });
        }, delayMilliseconds);
    }

    async function loadDates(options = {}) {
        window.clearTimeout(state.dateRefreshTimer);
        state.dateRefreshTimer = 0;
        try {
            const suffix = state.trashMode ? '?trash=1' : '';
            const payload = await request(`/api/dates${suffix}`);
            const dates = Array.isArray(payload.dates) ? payload.dates : [];
            const changed = dateSummarySignature(dates) !== state.dateSignature;
            state.dates = dates;
            state.dateSignature = dateSummarySignature(dates);
            renderDates();
            if (changed && options.syncItems && !state.loading && !state.refreshing) {
                await loadPage(true);
            }
        } catch (err) {
            if (!options.silent) showToast(t('Unable to load dates'), true);
        } finally {
            scheduleDatePolling();
        }
    }

    function addItems(items, reset) {
        if (reset) {
            state.items = [];
            state.itemById.clear();
        }
        (Array.isArray(items) ? items : []).forEach((item) => {
            if (!item || !item.media_id) return;
            const existing = state.itemById.get(item.media_id);
            if (existing) Object.assign(existing, item);
            else {
                state.itemById.set(item.media_id, item);
                state.items.push(item);
            }
        });
        state.layout = null;
        state.renderedStart = -1;
        state.renderedEnd = -1;
        state.renderedKey = '';
    }

    function queryParams() {
        const params = new URLSearchParams();
        params.set('limit', String(PAGE_SIZE));
        if (state.cursor) params.set('cursor', state.cursor);
        if (state.date) params.set('date', state.date);
        if (state.mediaType !== 'all') params.set('type', state.mediaType);
        if (state.query) params.set('q', state.query);
        if (state.favorite === true) params.set('favorite', '1');
        if (state.tag) params.set('tag', state.tag);
        if (state.ratingMin) params.set('rating_min', state.ratingMin);
        if (state.modelQuery) params.set('model', state.modelQuery);
        if (state.orientation) params.set('orientation', state.orientation);
        if (state.collectionId) params.set('collection', state.collectionId);
        if (state.trashMode) params.set('trash', '1');
        params.set('sort', state.sort);
        params.set('summary', '0');
        return params.toString();
    }

    async function loadPage(reset) {
        if ((state.loading && !reset) || (!reset && !state.hasMore)) return;
        if (reset) {
            state.cursor = null;
            state.hasMore = true;
            if (state.request) state.request.abort();
            state.request = new AbortController();
        }
        const serial = ++state.requestSerial;
        state.loading = true;
        setStatus(t(reset ? 'Loading...' : 'Loading more...'));
        try {
            const payload = await request(`/api/items?${queryParams()}`, { signal: state.request ? state.request.signal : undefined });
            if (serial !== state.requestSerial) return;
            addItems(payload.items, !!reset);
            state.cursor = payload.next_cursor || null;
            state.hasMore = !!payload.has_more;
            renderWindow(true);
            refs.empty.hidden = state.items.length > 0;
            setStatus(state.items.length ? `${state.items.length}${state.hasMore ? '+' : ''} ${t('items')}` : '');
        } catch (err) {
            if (err.name !== 'AbortError') {
                showToast(t('Unable to load media'), true);
                setStatus(t('Load failed'));
            }
        } finally {
            if (serial === state.requestSerial) {
                state.loading = false;
                maybeLoadMore();
            }
        }
    }

    function maybeLoadMore() {
        if (!refs.feedScroll || state.loading || !state.hasMore) return;
        const remaining = refs.feedScroll.scrollHeight - refs.feedScroll.scrollTop - refs.feedScroll.clientHeight;
        const threshold = Math.max(720, Math.floor(refs.feedScroll.clientHeight * 1.5));
        if (remaining <= threshold) loadPage(false);
    }

    function cardPreview(item) {
        if ((item.media_type === 'image' || item.media_type === 'video') && item.thumbnail_url) {
            return `<img src="${escapeHtml(item.thumbnail_url)}" alt="" loading="lazy" decoding="async">`;
        }
        const icon = item.media_type === 'video' ? 'fa-film' : item.media_type === 'audio' ? 'fa-music' : 'fa-image';
        return `<span class="media-placeholder"><i class="fa ${icon}"></i></span>`;
    }

    function videoAutoplayEligible(item) {
        if (!item || item.media_type !== 'video' || item.is_trashed || !item.media_url) return false;
        const width = Number(item.width);
        const height = Number(item.height);
        const size = Number(item.size);
        return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
            && Math.max(width, height) < MAX_AUTOPLAY_EDGE
            && Number.isFinite(size) && size > 0 && size < MAX_AUTOPLAY_BYTES;
    }

    function stopVideoPreview(card) {
        const preview = card?.querySelector?.('.media-card-preview');
        const video = preview?.querySelector?.('video[data-auto-preview]');
        if (!video) return;
        video.pause();
        video.removeAttribute('src');
        video.load();
        video.remove();
        preview.classList.remove('is-playing');
    }

    function stopAllVideoPreviews() {
        refs.feed?.querySelectorAll('.media-card').forEach(stopVideoPreview);
    }

    function videoAutoplayAllowed() {
        return state.autoplayEnabled && !state.trashMode && !document.hidden
            && refs.viewer?.getAttribute('aria-hidden') !== 'false'
            && refs.compare?.getAttribute('aria-hidden') !== 'false'
            && refs.drawer?.getAttribute('aria-hidden') !== 'false'
            && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
            && !navigator.connection?.saveData;
    }

    function previewVisible(card) {
        const preview = card.querySelector('.media-card-preview');
        const viewport = refs.feedScroll?.getBoundingClientRect();
        if (!preview || !viewport) return false;
        const rect = preview.getBoundingClientRect();
        const visibleWidth = Math.max(0, Math.min(rect.right, viewport.right) - Math.max(rect.left, viewport.left));
        const visibleHeight = Math.max(0, Math.min(rect.bottom, viewport.bottom) - Math.max(rect.top, viewport.top));
        const comparableArea = Math.min(rect.width, viewport.width) * Math.min(rect.height, viewport.height);
        return comparableArea > 0 && visibleWidth * visibleHeight / comparableArea >= 0.55;
    }

    function startVideoPreview(card, item) {
        const preview = card.querySelector('.media-card-preview');
        if (!preview || preview.querySelector('video[data-auto-preview]')) return;
        const video = document.createElement('video');
        video.dataset.autoPreview = '';
        video.muted = true;
        video.defaultMuted = true;
        video.playsInline = true;
        video.loop = true;
        video.preload = 'none';
        video.setAttribute('aria-hidden', 'true');
        video.addEventListener('playing', () => {
            if (video.isConnected) preview.classList.add('is-playing');
        });
        video.addEventListener('error', () => {
            state.failedPreviews.add(item.media_id);
            stopVideoPreview(card);
        });
        preview.insertBefore(video, preview.querySelector('.media-kind'));
        video.src = item.media_url;
        const pending = video.play();
        if (pending && typeof pending.catch === 'function') {
            pending.catch(() => {
                state.failedPreviews.add(item.media_id);
                if (video.isConnected) stopVideoPreview(card);
            });
        }
    }

    function syncVideoAutoplay() {
        if (!videoAutoplayAllowed()) {
            stopAllVideoPreviews();
            return;
        }
        refs.feed?.querySelectorAll('.media-card').forEach((card) => {
            const item = state.itemById.get(card.dataset.id);
            if (videoAutoplayEligible(item) && !state.failedPreviews.has(item.media_id) && previewVisible(card)) {
                startVideoPreview(card, item);
            } else {
                stopVideoPreview(card);
            }
        });
    }

    function scheduleVideoAutoplay() {
        window.clearTimeout(state.autoplayTimer);
        if (!videoAutoplayAllowed()) {
            stopAllVideoPreviews();
            return;
        }
        state.autoplayTimer = window.setTimeout(syncVideoAutoplay, 180);
    }

    function updateAutoplayControl() {
        if (!refs.autoplayToggle) return;
        refs.autoplayToggle.setAttribute('aria-pressed', state.autoplayEnabled ? 'true' : 'false');
        refs.autoplayToggle.title = t('Video autoplay');
        refs.autoplayToggle.setAttribute('aria-label', t('Video autoplay'));
    }

    function mediaRatio(item) {
        const width = Number(item && item.width);
        const height = Number(item && item.height);
        if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return 4 / 3;
        return Math.max(0.35, Math.min(3.5, width / height));
    }

    function renderCard(item) {
        const favorite = !!item.favorite;
        const selected = state.selectedIds.has(item.media_id);
        const active = state.selectedId === item.media_id;
        const kind = item.media_type === 'video' ? t('Videos') : item.media_type === 'audio' ? t('Audio') : t('Images');
        const tags = Array.isArray(item.tags) ? item.tags.slice(0, 3).join(', ') : '';
        return `<article class="media-card${selected ? ' selected' : ''}${active ? ' active' : ''}" style="--media-ratio:${mediaRatio(item).toFixed(4)}" data-id="${escapeHtml(item.media_id)}" data-date="${escapeHtml(item.date_key || '')}">
            <div class="media-card-preview">${cardPreview(item)}<span class="media-kind">${escapeHtml(kind)}</span>
                <div class="media-card-overlay">
                    <button type="button" class="card-select" title="Select" aria-label="Select" aria-pressed="${state.selectedIds.has(item.media_id) ? 'true' : 'false'}"><i class="fa fa-check"></i></button>
                    <button type="button" class="card-favorite${favorite ? ' is-favorite' : ''}" title="${escapeHtml(t('Favorites'))}" aria-label="${escapeHtml(t('Favorites'))}" aria-pressed="${favorite ? 'true' : 'false'}"><i class="fa fa-star"></i></button>
                </div>
            </div>
            <div class="card-body"><div class="card-meta"><span class="card-name" title="${escapeHtml(item.title || item.name)}">${escapeHtml(item.title || item.name || '')}</span><span class="card-date">${escapeHtml(formatDate(item.date_key))}</span></div>
                <div class="card-footer"><span class="card-tags">${escapeHtml(tags || formatBytes(item.size))}</span><span class="card-rating">${escapeHtml(starRating(item.rating))}</span></div>
            </div>
        </article>`;
    }

    function columnCount() {
        const width = refs.feed ? refs.feed.clientWidth : 0;
        if (width <= 0) return 1;
        const mobile = window.innerWidth <= 700;
        const edgePadding = mobile ? 20 : 32;
        const gap = mobile ? 9 : 12;
        const minimumCardWidth = mobile ? 164 : 214;
        const contentWidth = Math.max(1, width - edgePadding);
        return Math.max(1, Math.min(mobile ? 2 : 5, Math.floor((contentWidth + gap) / (minimumCardWidth + gap))));
    }

    function estimatedCardHeight(item, columnWidth) {
        const previewHeight = Math.max(1, columnWidth / mediaRatio(item));
        return previewHeight + 62;
    }

    function feedMetrics(count) {
        const mobile = window.innerWidth <= 700;
        const paddingLeft = mobile ? 10 : 16;
        const paddingRight = mobile ? 10 : 16;
        const paddingTop = mobile ? 10 : 14;
        const paddingBottom = 4;
        const gap = mobile ? 9 : 12;
        const innerWidth = Math.max(120, (refs.feed.clientWidth - paddingLeft - paddingRight - ((count - 1) * gap)) / count);
        return { paddingLeft, paddingRight, paddingTop, paddingBottom, gap, innerWidth };
    }

    function buildLayout(count) {
        const metrics = feedMetrics(count);
        const columns = Array.from({ length: count }, () => ({ height: 0 }));
        const positions = [];
        const byId = new Map();
        state.items.forEach((item, index) => {
            let target = columns[0];
            for (let index = 1; index < columns.length; index += 1) {
                if (columns[index].height < target.height) target = columns[index];
            }
            const columnIndex = columns.indexOf(target);
            const height = estimatedCardHeight(item, metrics.innerWidth);
            const position = {
                item,
                index,
                column: columnIndex,
                top: target.height,
                height
            };
            positions.push(position);
            byId.set(item.media_id, position);
            target.height += height + metrics.gap;
        });
        const columnHeights = columns.map((column) => Math.max(0, column.height - (state.items.length ? metrics.gap : 0)));
        const contentHeight = columnHeights.reduce((height, columnHeight) => Math.max(height, columnHeight), 0);
        const totalHeight = metrics.paddingTop + contentHeight + metrics.paddingBottom;
        const layout = {
            itemsRef: state.items,
            width: refs.feed.clientWidth,
            count,
            metrics,
            positions,
            byId,
            columnHeights,
            totalHeight
        };
        state.layout = layout;
        state.renderedStart = -1;
        state.renderedEnd = -1;
        state.renderedKey = '';
        refs.feed.style.setProperty('--ml-column-count', String(count));
        refs.feed.style.removeProperty('height');
        return layout;
    }

    function ensureLayout(count) {
        const layout = state.layout;
        if (!layout || layout.itemsRef !== state.items || layout.count !== count || layout.width !== refs.feed.clientWidth) {
            return buildLayout(count);
        }
        return layout;
    }

    function visiblePositions(layout) {
        if (state.items.length <= MAX_RENDERED || !refs.feedScroll) return layout.positions;
        const scrollTop = refs.feedScroll.scrollTop || 0;
        const viewportBottom = scrollTop + refs.feedScroll.clientHeight;
        const buffer = Math.max(WINDOW_BUFFER_PX, Math.floor(refs.feedScroll.clientHeight * 1.5));
        const contentTop = layout.metrics.paddingTop;
        const windowTop = Math.max(contentTop, scrollTop - buffer);
        const windowBottom = viewportBottom + buffer;
        const positions = layout.positions.filter((position) => (
            position.top + contentTop + position.height >= windowTop && position.top + contentTop <= windowBottom
        ));
        if (positions.length <= MAX_RENDERED) return positions;
        const core = layout.positions.filter((position) => (
            position.top + contentTop + position.height >= scrollTop && position.top + contentTop <= viewportBottom
        ));
        if (core.length >= MAX_RENDERED) return core.slice(0, MAX_RENDERED);
        const selected = new Map(core.map((position) => [position.item.media_id, position]));
        positions.forEach((position) => {
            if (selected.size < MAX_RENDERED) selected.set(position.item.media_id, position);
        });
        return layout.positions.filter((position) => selected.has(position.item.media_id));
    }

    function cardRenderKey(item) {
        const tags = Array.isArray(item.tags) ? item.tags.slice(0, 3).join(', ') : '';
        const selected = state.selectedIds.has(item.media_id);
        const active = state.selectedId === item.media_id;
        return [
            item.media_id,
            item.name || '',
            item.title || '',
            item.date_key || '',
            item.media_type || '',
            item.thumbnail_url || '',
            item.favorite ? '1' : '0',
            Number(item.rating || 0),
            tags,
            selected ? '1' : '0',
            active ? '1' : '0'
        ].join('\u001f');
    }

    function createCard(item) {
        const holder = document.createElement('div');
        holder.innerHTML = renderCard(item).trim();
        return holder.firstElementChild;
    }

    function syncCardContent(card, item) {
        const favorite = !!item.favorite;
        const selected = state.selectedIds.has(item.media_id);
        const kind = item.media_type === 'video' ? t('Videos') : item.media_type === 'audio' ? t('Audio') : t('Images');
        const tags = Array.isArray(item.tags) ? item.tags.slice(0, 3).join(', ') : '';
        const name = item.title || item.name || '';
        const preview = card.querySelector('.media-card-preview');
        const imageExpected = (item.media_type === 'image' || item.media_type === 'video') && item.thumbnail_url;

        card.classList.toggle('selected', selected);
        card.classList.toggle('active', state.selectedId === item.media_id);
        card.dataset.id = item.media_id;
        card.dataset.date = item.date_key || '';
        card.style.setProperty('--media-ratio', mediaRatio(item).toFixed(4));
        card.querySelector('.card-name').textContent = name;
        card.querySelector('.card-name').title = name;
        card.querySelector('.card-date').textContent = formatDate(item.date_key);
        card.querySelector('.card-tags').textContent = tags || formatBytes(item.size);
        card.querySelector('.card-rating').textContent = starRating(item.rating);
        card.querySelector('.media-kind').textContent = kind;

        const selectButton = card.querySelector('.card-select');
        selectButton.setAttribute('aria-pressed', state.selectedIds.has(item.media_id) ? 'true' : 'false');
        const favoriteButton = card.querySelector('.card-favorite');
        favoriteButton.classList.toggle('is-favorite', favorite);
        favoriteButton.setAttribute('aria-pressed', favorite ? 'true' : 'false');

        const currentImage = preview.querySelector('img');
        const placeholder = preview.querySelector('.media-placeholder');
        if (imageExpected) {
            if (placeholder) placeholder.remove();
            if (currentImage) {
                if (currentImage.getAttribute('src') !== item.thumbnail_url) currentImage.setAttribute('src', item.thumbnail_url);
            } else {
                const image = document.createElement('img');
                image.src = item.thumbnail_url;
                image.alt = '';
                image.loading = 'lazy';
                image.decoding = 'async';
                preview.insertBefore(image, preview.querySelector('.media-kind'));
            }
        } else {
            if (currentImage) currentImage.remove();
            if (!placeholder) {
                const node = document.createElement('span');
                const icon = item.media_type === 'video' ? 'fa-film' : item.media_type === 'audio' ? 'fa-music' : 'fa-image';
                node.className = 'media-placeholder';
                node.innerHTML = `<i class="fa ${icon}"></i>`;
                preview.insertBefore(node, preview.querySelector('.media-kind'));
            }
        }
        card.dataset.renderKey = cardRenderKey(item);
    }

    function ensureMasonryColumns(count) {
        const wrappers = Array.from(refs.feed.children).filter((node) => node.classList.contains('masonry-column'));
        while (wrappers.length < count) {
            const wrapper = document.createElement('div');
            wrapper.className = 'masonry-column';
            wrappers.push(wrapper);
            refs.feed.appendChild(wrapper);
        }
        while (wrappers.length > count) {
            const wrapper = wrappers.pop();
            wrapper.querySelectorAll('.media-card').forEach(stopVideoPreview);
            wrapper.remove();
        }
        wrappers.forEach((wrapper, index) => { wrapper.dataset.column = String(index); });
        return wrappers;
    }

    function renderMasonry(positions, layout) {
        const wanted = new Set(positions.map((position) => position.item.media_id));
        const existing = new Map(Array.from(refs.feed.querySelectorAll('.media-card')).map((card) => [card.dataset.id, card]));
        refs.feed.querySelectorAll('.media-card').forEach((card) => {
            if (!wanted.has(card.dataset.id)) {
                stopVideoPreview(card);
                card.remove();
            }
        });
        const wrappers = ensureMasonryColumns(layout.count);
        const activeColumns = Array.from({ length: layout.count }, () => []);
        positions.forEach((position) => activeColumns[position.column].push(position));
        wrappers.forEach((wrapper, columnIndex) => {
            const active = activeColumns[columnIndex].sort((left, right) => left.top - right.top || left.index - right.index);
            const topSpacer = wrapper.querySelector('[data-spacer="top"]') || document.createElement('div');
            topSpacer.className = 'masonry-spacer';
            topSpacer.dataset.spacer = 'top';
            topSpacer.style.height = `${active.length ? active[0].top : 0}px`;
            const sequence = [topSpacer];
            let previousBottom = active.length ? active[0].top : 0;
            active.forEach((position, activeIndex) => {
                const gapSpacer = wrapper.querySelector(`[data-spacer="gap-${activeIndex}"]`) || document.createElement('div');
                gapSpacer.className = 'masonry-spacer';
                gapSpacer.dataset.spacer = `gap-${activeIndex}`;
                gapSpacer.style.height = `${Math.max(0, position.top - previousBottom)}px`;
                sequence.push(gapSpacer);
                const item = position.item;
                let card = existing.get(item.media_id);
                if (!card) card = createCard(item);
                if (card.dataset.renderKey !== cardRenderKey(item)) syncCardContent(card, item);
                card.style.position = '';
                card.style.left = '';
                card.style.top = '';
                card.style.width = '';
                sequence.push(card);
                previousBottom = position.top + position.height;
            });
            const bottomSpacer = wrapper.querySelector('[data-spacer="bottom"]') || document.createElement('div');
            bottomSpacer.className = 'masonry-spacer';
            bottomSpacer.dataset.spacer = 'bottom';
            bottomSpacer.style.height = `${Math.max(0, layout.columnHeights[columnIndex] - previousBottom)}px`;
            sequence.push(bottomSpacer);
            const allowed = new Set(sequence);
            Array.from(wrapper.children).forEach((child) => {
                if (!allowed.has(child)) child.remove();
            });
            sequence.forEach((child, index) => {
                if (wrapper.children[index] !== child) wrapper.insertBefore(child, wrapper.children[index] || null);
            });
        });
        refs.feed.style.removeProperty('height');
        refs.topSpacer.style.height = '0px';
        refs.bottomSpacer.style.height = '0px';
    }

    function renderWindow(force) {
        if (!refs.feed) return;
        const columns = columnCount();
        const layout = ensureLayout(columns);
        const positions = visiblePositions(layout);
        const start = positions.length ? Math.min(...positions.map((position) => position.index)) : -1;
        const end = positions.length ? Math.max(...positions.map((position) => position.index)) + 1 : -1;
        const renderedKey = positions.map((position) => position.item.media_id).join('\u001f');
        if (!force && state.renderedStart === start && state.renderedEnd === end && state.renderedColumnCount === columns && state.renderedKey === renderedKey) {
            updateActiveDateFromViewport();
            return;
        }
        state.renderedStart = start;
        state.renderedEnd = end;
        state.renderedColumnCount = columns;
        state.renderedKey = renderedKey;
        renderMasonry(positions, layout);
        updateActiveDateFromViewport();
        scheduleVideoAutoplay();
    }

    function updateViewControls() {
        if (refs.trashView) {
            refs.trashView.setAttribute('aria-pressed', state.trashMode ? 'true' : 'false');
            refs.trashView.title = t('Trash');
            refs.trashView.setAttribute('aria-label', t('Trash'));
        }
        if (refs.rescan) refs.rescan.hidden = state.trashMode;
        if (refs.purgeTrash) refs.purgeTrash.hidden = !state.trashMode;
        if (refs.emptyTitle) refs.emptyTitle.textContent = t(state.trashMode ? 'Trash is empty' : 'No media yet');
        if (refs.emptyDescription) refs.emptyDescription.textContent = t(state.trashMode ? 'Deleted media will appear here.' : 'Generated media will appear here.');
        updateSelectionControls();
    }

    function updateSelectionControls() {
        const count = state.selectedIds.size;
        if (refs.app) refs.app.classList.toggle('selection-mode', state.selectionMode);
        if (refs.selectionMode) {
            refs.selectionMode.setAttribute('aria-pressed', state.selectionMode ? 'true' : 'false');
            refs.selectionMode.title = t('Select');
            refs.selectionMode.setAttribute('aria-label', t('Select'));
        }
        if (refs.selectionCount) {
            refs.selectionCount.hidden = !state.selectionMode;
            refs.selectionCount.textContent = count ? `${count} ${t('selected')}` : t('Select items');
        }
        if (refs.selectionClear) refs.selectionClear.hidden = !state.selectionMode || count === 0;
        if (refs.selectionTrash) refs.selectionTrash.hidden = !state.selectionMode || count === 0 || state.trashMode;
        if (refs.selectionRestore) refs.selectionRestore.hidden = !state.selectionMode || count === 0 || !state.trashMode;
        if (refs.selectionPurge) refs.selectionPurge.hidden = !state.selectionMode || count === 0 || !state.trashMode;
        if (refs.selectionCompare) {
            refs.selectionCompare.hidden = !state.selectionMode || state.trashMode;
            refs.selectionCompare.disabled = count < 2;
            refs.selectionCompare.title = t('Select 2 to 4 media');
        }
        if (refs.selectionEdit) refs.selectionEdit.hidden = !state.selectionMode || count === 0 || state.trashMode;
        if (refs.selectionCollection) refs.selectionCollection.hidden = !state.selectionMode || count === 0 || state.trashMode || !state.collections.length;
        if (refs.selectionAddCollection) refs.selectionAddCollection.hidden = !state.selectionMode || count === 0 || state.trashMode || !state.collections.length;
        if (refs.selectionRemoveCollection) refs.selectionRemoveCollection.hidden = !state.selectionMode || count === 0 || state.trashMode || !state.collectionId;
        if (!state.selectionMode || count === 0) {
            if (refs.batchEditor) refs.batchEditor.hidden = true;
        }
    }

    function viewerItem() {
        return state.itemById.get(state.viewerId) || null;
    }

    function updateViewer() {
        const item = viewerItem();
        if (!item || !refs.viewerMedia) return;
        const isImage = item.media_type === 'image';
        const zoom = isImage ? state.viewerZoom : 1;
        const source = item.media_url || item.thumbnail_url || '';
        let mediaHtml = '';
        if (item.media_type === 'image') {
            mediaHtml = `<img src="${escapeHtml(source)}" alt="${escapeHtml(item.title || item.name || '')}" style="transform:scale(${zoom.toFixed(2)})">`;
        } else if (item.media_type === 'video') {
            mediaHtml = `<video src="${escapeHtml(source)}" controls preload="metadata"></video>`;
        } else if (item.media_type === 'audio') {
            mediaHtml = `<audio src="${escapeHtml(source)}" controls preload="metadata"></audio>`;
        }
        refs.viewerMedia.innerHTML = mediaHtml || `<div class="empty-state"><p>${escapeHtml(t('Unable to load details'))}</p></div>`;
        refs.viewerTitle.textContent = item.title || item.name || '';
        refs.viewerDownload.href = item.download_url || item.media_url || '#';
        refs.viewerDownload.download = item.name || '';
        const index = state.items.findIndex((entry) => entry.media_id === state.viewerId);
        refs.viewerPosition.textContent = index >= 0 ? `${index + 1} / ${state.items.length}${state.hasMore ? '+' : ''}` : '';
        refs.viewerPrev.disabled = index <= 0;
        refs.viewerNext.disabled = index < 0 || (index >= state.items.length - 1 && !state.hasMore);
        refs.viewerZoomOut.disabled = !isImage;
        refs.viewerZoomIn.disabled = !isImage;
        refs.viewerZoomReset.disabled = !isImage;
        refs.viewerZoomReset.textContent = isImage ? `${Math.round(zoom * 100)}%` : '—';
    }

    function openViewer(item) {
        const candidate = item && item.media_id ? item : viewerItem();
        if (!candidate || !candidate.media_id) return;
        state.itemById.set(candidate.media_id, candidate);
        state.viewerId = candidate.media_id;
        state.viewerZoom = 1;
        refs.viewer.setAttribute('aria-hidden', 'false');
        stopAllVideoPreviews();
        updateViewer();
    }

    function closeViewer() {
        state.viewerId = '';
        state.viewerZoom = 1;
        refs.viewer.setAttribute('aria-hidden', 'true');
        refs.viewerMedia.replaceChildren();
        scheduleVideoAutoplay();
    }

    async function moveViewer(delta) {
        const index = state.items.findIndex((item) => item.media_id === state.viewerId);
        if (index < 0) return;
        let nextIndex = index + delta;
        if (delta > 0 && nextIndex >= state.items.length && state.hasMore) {
            await loadPage(false);
            nextIndex = index + delta;
        }
        if (nextIndex < 0 || nextIndex >= state.items.length) return;
        state.viewerId = state.items[nextIndex].media_id;
        state.viewerZoom = 1;
        updateViewer();
    }

    function adjustViewerZoom(delta) {
        const item = viewerItem();
        if (!item || item.media_type !== 'image') return;
        state.viewerZoom = Math.max(.5, Math.min(4, Math.round((state.viewerZoom + delta) * 20) / 20));
        updateViewer();
    }

    function handleViewerKeydown(event) {
        if (!refs.viewer || refs.viewer.getAttribute('aria-hidden') !== 'false') return;
        if (event.key === 'Escape') {
            event.preventDefault();
            closeViewer();
        } else if (event.key === 'ArrowLeft') {
            event.preventDefault();
            moveViewer(-1);
        } else if (event.key === 'ArrowRight') {
            event.preventDefault();
            moveViewer(1);
        } else if (event.key === '+' || event.key === '=') {
            event.preventDefault();
            adjustViewerZoom(.25);
        } else if (event.key === '-') {
            event.preventDefault();
            adjustViewerZoom(-.25);
        } else if (event.key === '0') {
            event.preventDefault();
            state.viewerZoom = 1;
            updateViewer();
        }
    }

    function handleViewerWheel(event) {
        if (!refs.viewer || refs.viewer.getAttribute('aria-hidden') !== 'false') return;
        const item = viewerItem();
        if (!item || item.media_type !== 'image' || !Number.isFinite(event.deltaY) || event.deltaY === 0) return;
        event.preventDefault();
        adjustViewerZoom(event.deltaY < 0 ? .25 : -.25);
    }

    function promptText(item) {
        const metadata = item && item.generation_metadata;
        if (!metadata || typeof metadata !== 'object') return '';
        const parameters = metadata.parameters && typeof metadata.parameters === 'object' ? metadata.parameters : {};
        const raw = metadata.raw && typeof metadata.raw === 'object' ? metadata.raw : {};
        const candidates = [
            metadata.prompt,
            metadata.positive_prompt,
            metadata.raw_prompt,
            metadata.Prompt,
            parameters.prompt,
            parameters.positive_prompt,
            raw.prompt,
            raw.positive_prompt,
            raw.Prompt,
            raw['Positive prompt']
        ];
        return candidates.find((value) => typeof value === 'string' && value.trim())?.trim() || '';
    }

    function generationSettings(item) {
        const metadata = item?.generation_metadata;
        if (!metadata || typeof metadata !== 'object') return {};
        const parameters = metadata.parameters && typeof metadata.parameters === 'object' ? metadata.parameters : {};
        const settings = {};
        const prompt = promptText(item);
        if (prompt) settings.prompt = prompt;
        const negative = metadata.negative_prompt || parameters.negative_prompt;
        if (typeof negative === 'string' && negative.trim()) settings.negative_prompt = negative.trim();
        const simpleParameters = Object.fromEntries(Object.entries(parameters).filter(([, value]) =>
            typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
        ));
        if (Object.keys(simpleParameters).length) settings.parameters = simpleParameters;
        return settings;
    }

    function generationFields(item) {
        const settings = generationSettings(item);
        const metadata = item?.generation_metadata || {};
        const labels = {
            model: 'Model', base_model: 'Model', seed: 'Seed', steps: 'Steps',
            sampler: 'Sampler', scheduler: 'Scheduler', cfg_scale: 'Guidance',
            guidance_scale: 'Guidance', width: 'Width', height: 'Height'
        };
        const entries = [];
        if (settings.prompt) entries.push([t('Prompt'), settings.prompt]);
        if (settings.negative_prompt) entries.push([t('Negative prompt'), settings.negative_prompt]);
        if (metadata.source) entries.push([t('Source'), metadata.source]);
        Object.entries(settings.parameters || {}).forEach(([key, value]) => {
            if (key !== 'prompt' && key !== 'negative_prompt') entries.push([t(labels[key] || key), value]);
        });
        return `<dl class="generation-fields">${entries.map(([label, value]) =>
            `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`
        ).join('')}</dl><details class="generation-raw"><summary>${escapeHtml(t('Raw metadata'))}</summary>` +
            `<div class="metadata-block">${escapeHtml(JSON.stringify(metadata, null, 2))}</div></details>`;
    }

    async function copyText(text) {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            try {
                await navigator.clipboard.writeText(text);
                return true;
            } catch (err) {
                // Fall through to the selection-based copy path for non-secure pages.
            }
        }
        const input = document.createElement('textarea');
        input.value = text;
        input.setAttribute('readonly', '');
        input.style.position = 'fixed';
        input.style.left = '-9999px';
        document.body.appendChild(input);
        input.select();
        let copied = false;
        try {
            copied = document.execCommand('copy');
        } catch (err) {
            copied = false;
        }
        input.remove();
        return copied;
    }

    async function copyPrompt(item) {
        const prompt = promptText(item);
        if (!prompt) {
            showToast(t('No prompt available'), true);
            return;
        }
        const copied = await copyText(prompt);
        showToast(t(copied ? 'Prompt copied' : 'Unable to copy prompt'), !copied);
    }

    async function copySettings(item) {
        const settings = generationSettings(item);
        if (!Object.keys(settings).length) {
            showToast(t('No settings available'), true);
            return;
        }
        const copied = await copyText(JSON.stringify(settings, null, 2));
        showToast(t(copied ? 'Settings copied' : 'Unable to copy settings'), !copied);
    }

    async function loadRelated(item) {
        const container = refs.detail?.querySelector('#detail-related');
        if (!container) return;
        try {
            const payload = await request(`/api/items/${encodeURIComponent(item.media_id)}/related`);
            if (state.selectedId !== item.media_id || !container.isConnected) return;
            const items = Array.isArray(payload.items) ? payload.items : [];
            container.hidden = !items.length;
            if (!items.length) return;
            container.innerHTML = `<h3>${escapeHtml(t('Related results'))}</h3><div class="related-list">` +
                items.map((related) =>
                    `<button type="button" data-related-id="${escapeHtml(related.media_id)}" title="${escapeHtml(related.title || related.name || '')}">` +
                    (related.thumbnail_url ? `<img src="${escapeHtml(related.thumbnail_url)}" alt="" loading="lazy">` : `<i class="fa fa-film"></i>`) +
                    `<span>${escapeHtml(related.title || related.name || '')}</span></button>`
                ).join('') + '</div>';
            container.querySelectorAll('[data-related-id]').forEach((button) => {
                button.addEventListener('click', () => openDetail(button.dataset.relatedId));
            });
        } catch (err) {
            container.hidden = true;
        }
    }

    function syncDetailLayout() {
        const open = !!refs.drawer && refs.drawer.getAttribute('aria-hidden') === 'false';
        if (refs.layout) refs.layout.classList.remove('has-detail');
        if (refs.detailBackdrop) {
            refs.detailBackdrop.setAttribute('aria-hidden', open ? 'false' : 'true');
        }
    }

    function updateActiveDateFromViewport() {
        if (!refs.feedScroll || !refs.dateList) return;
        const layout = state.layout;
        if (!layout || !layout.positions.length) return;
        const viewportTop = refs.feedScroll.scrollTop || 0;
        const first = layout.positions
            .filter((position) => position.top + layout.metrics.paddingTop + position.height >= viewportTop)
            .sort((left, right) => left.top - right.top || left.column - right.column || left.index - right.index)[0];
        const date = first?.item?.date_key || '';
        if (!date || state.date) return;
        refs.dateList.querySelectorAll('.date-item').forEach((node) => {
            node.setAttribute('aria-current', node.dataset.date === date ? 'true' : 'false');
        });
    }

    async function openDetail(mediaId) {
        const scrollTop = refs.feedScroll ? refs.feedScroll.scrollTop : 0;
        state.selectedId = String(mediaId || '');
        refs.drawer.setAttribute('aria-hidden', 'false');
        stopAllVideoPreviews();
        syncDetailLayout();
        renderWindow(true);
        if (refs.feedScroll) refs.feedScroll.scrollTop = scrollTop;
        refs.detail.innerHTML = `<div class="empty-state"><div class="empty-icon"><i class="fa fa-spinner fa-spin"></i></div><p>${escapeHtml(t('Loading...'))}</p></div>`;
        try {
            const trashQuery = state.trashMode ? '?trash=1' : '';
            const payload = await request(`/api/items/${encodeURIComponent(state.selectedId)}${trashQuery}`);
            if (state.selectedId !== mediaId) return;
            const detailItem = payload.item || payload;
            state.itemById.set(detailItem.media_id, detailItem);
            renderDetail(detailItem);
        } catch (err) {
            refs.detail.innerHTML = `<div class="empty-state"><p>${escapeHtml(t('Unable to load details'))}</p></div>`;
        }
    }

    function detailPreview(item) {
        if (item.media_type === 'image') return `<img src="${escapeHtml(item.media_url || item.thumbnail_url || '')}" alt="">`;
        if (item.media_type === 'video') return `<video src="${escapeHtml(item.media_url || '')}" controls preload="metadata"></video>`;
        if (item.media_type === 'audio') return `<audio src="${escapeHtml(item.media_url || '')}" controls preload="metadata"></audio>`;
        return '';
    }

    function renderDetail(item) {
        const metadata = item.generation_metadata && typeof item.generation_metadata === 'object' ? item.generation_metadata : {};
        const tags = Array.isArray(item.tags) ? item.tags.join(', ') : '';
        const copyPromptLabel = t('Copy prompt');
        const trashed = !!item.is_trashed || state.trashMode;
        const canvasParams = new URLSearchParams({
            __theme: config.theme, __lang: state.__lang || config.lang,
            gallery_media_id: item.media_id
        });
        const canvasHref = `${config.assetBase || ''}/canvas-workbench/app?${canvasParams}`;
        const lifecycleActions = trashed
            ? `<button class="primary-button" type="button" id="detail-viewer"><i class="fa fa-expand"></i> ${escapeHtml(t('View full screen'))}</button><button class="primary-button" type="button" id="detail-restore"><i class="fa fa-rotate-left"></i> ${escapeHtml(t('Restore media'))}</button><button class="danger-button" type="button" id="detail-purge"><i class="fa fa-trash"></i> ${escapeHtml(t('Delete permanently'))}</button>`
            : `<button class="primary-button" type="button" id="detail-viewer"><i class="fa fa-expand"></i> ${escapeHtml(t('View full screen'))}</button>${item.media_type !== 'audio' ? `<a class="secondary-button" id="detail-open-canvas" href="${escapeHtml(canvasHref)}" target="_blank" rel="noopener"><i class="fa fa-layer-group"></i> ${escapeHtml(t('Open in Canvas'))}</a>` : ''}<a class="secondary-button" href="${escapeHtml(item.download_url || item.media_url || '#')}" download><i class="fa fa-download"></i> ${escapeHtml(t('Download'))}</a><button class="danger-button" type="button" id="detail-trash"><i class="fa fa-trash"></i> ${escapeHtml(t('Delete'))}</button>`;
        const folderAction = `<button class="secondary-button" type="button" id="detail-open-folder" title="${escapeHtml(t('Open containing folder'))}"><i class="fa fa-folder-open"></i> ${escapeHtml(t('Open containing folder'))}</button>`;
        refs.detail.innerHTML = `<div class="detail-preview">${detailPreview(item)}</div>
            <p class="detail-file-status" id="detail-file-status" hidden></p>
            <div class="detail-actions">${lifecycleActions}${folderAction}</div>
            <section class="detail-section"><h3>${escapeHtml(t('Library metadata'))}</h3><div class="detail-form">
                <label for="detail-title">${escapeHtml(t('Title'))}</label><input id="detail-title" value="${escapeHtml(item.title || '')}" maxlength="240">
                <label for="detail-tags">${escapeHtml(t('Tags'))}</label><input id="detail-tags" value="${escapeHtml(tags)}" maxlength="640">
                <label for="detail-rating">${escapeHtml(t('Rating'))}</label><select id="detail-rating"><option value="0">${escapeHtml(t('Unrated'))}</option>${[1, 2, 3, 4, 5].map((v) => `<option value="${v}" ${Number(item.rating) === v ? 'selected' : ''}>${escapeHtml(starRating(v))}</option>`).join('')}</select>
                <label for="detail-notes">${escapeHtml(t('Notes'))}</label><textarea id="detail-notes" maxlength="4000">${escapeHtml(item.notes || '')}</textarea>
                <div class="detail-actions"><button class="primary-button" type="button" id="detail-save"><i class="fa fa-floppy-disk"></i> ${escapeHtml(t('Save'))}</button><button class="secondary-button" type="button" id="detail-favorite"><i class="fa fa-star"></i> ${escapeHtml(item.favorite ? t('Unfavorite') : t('Favorite'))}</button></div>
            </div></section>
            <section class="detail-section"><h3>${escapeHtml(t('File'))}</h3><dl class="detail-grid"><dt>${escapeHtml(t('Name'))}</dt><dd>${escapeHtml(item.name || '')}</dd><dt>${escapeHtml(t('Date'))}</dt><dd>${escapeHtml(formatDate(item.date_key))}</dd><dt>${escapeHtml(t('Size'))}</dt><dd>${escapeHtml(formatBytes(item.size))}</dd><dt>${escapeHtml(t('Dimensions'))}</dt><dd>${item.width && item.height ? `${item.width} × ${item.height}` : '-'}</dd></dl></section>
            <section class="detail-section"><div class="detail-section-heading"><h3>${escapeHtml(t('Generation metadata'))}</h3><div class="detail-actions"><button class="secondary-button copy-prompt-button" type="button" id="detail-copy-prompt" title="${escapeHtml(copyPromptLabel)}" aria-label="${escapeHtml(copyPromptLabel)}"><i class="fa fa-copy"></i><span>${escapeHtml(copyPromptLabel)}</span></button><button class="secondary-button copy-prompt-button" type="button" id="detail-copy-settings"><i class="fa fa-copy"></i><span>${escapeHtml(t('Copy settings'))}</span></button></div></div>${generationFields(item)}</section>
            <section class="detail-section" id="detail-related" hidden></section>`;
        refs.detail.querySelector('#detail-save').addEventListener('click', () => saveDetail(item));
        refs.detail.querySelector('#detail-favorite').addEventListener('click', () => saveDetail(item, { favorite: !item.favorite }));
        refs.detail.querySelector('#detail-trash')?.addEventListener('click', () => trashItem(item.media_id));
        refs.detail.querySelector('#detail-restore')?.addEventListener('click', () => restoreItem(item.media_id));
        refs.detail.querySelector('#detail-purge')?.addEventListener('click', () => purgeItem(item.media_id));
        refs.detail.querySelector('#detail-viewer')?.addEventListener('click', () => openViewer(item));
        refs.detail.querySelector('#detail-open-folder')?.addEventListener('click', () => openContainingFolder(item.media_id));
        refs.detail.querySelector('#detail-copy-prompt')?.addEventListener('click', () => copyPrompt(item));
        refs.detail.querySelector('#detail-copy-settings')?.addEventListener('click', () => copySettings(item));
        const canvasLink = refs.detail.querySelector('#detail-open-canvas');
        if (canvasLink) {
            const href = canvasLink.href;
            canvasLink.removeAttribute('href');
            canvasLink.setAttribute('aria-disabled', 'true');
            request(`/api/items/${encodeURIComponent(item.media_id)}/canvas`).then(() => {
                if (!canvasLink.isConnected || state.selectedId !== item.media_id) return;
                canvasLink.href = href;
                canvasLink.removeAttribute('aria-disabled');
            }).catch((err) => {
                if (!canvasLink.isConnected || state.selectedId !== item.media_id) return;
                const message = t(err?.payload?.error === 'Media file not found.' ? 'Media file not found.' : 'Media unavailable in Canvas');
                canvasLink.title = message;
                const status = refs.detail.querySelector('#detail-file-status');
                status.textContent = message;
                status.hidden = false;
            });
        }
        loadRelated(item);
    }

    async function saveDetail(item, override) {
        const payload = Object.assign({
            title: refs.detail.querySelector('#detail-title')?.value || '',
            tags: (refs.detail.querySelector('#detail-tags')?.value || '').split(',').map((value) => value.trim()).filter(Boolean),
            rating: Number(refs.detail.querySelector('#detail-rating')?.value || 0),
            notes: refs.detail.querySelector('#detail-notes')?.value || ''
        }, override || {});
        try {
            const result = await request(`/api/items/${encodeURIComponent(item.media_id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            const updated = result.item || result;
            state.itemById.set(item.media_id, Object.assign(item, updated));
            renderWindow(true);
            renderDetail(updated);
            showToast(t('Saved'));
        } catch (err) {
            showToast(t('Unable to save changes'), true);
        }
    }

    async function trashItem(mediaId) {
        if (!window.confirm(t('Move this media to the trash?'))) return;
        try {
            const result = await request('/api/items/trash', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [mediaId] }) });
            removeItemFromState(mediaId);
            updateSelectionControls();
            await loadPage(true);
            loadDates();
            showToast(t(result.removed_missing?.length ? 'Missing record removed' : 'Moved to trash'));
        } catch (err) {
            showToast(actionError(err, 'Unable to delete media'), true);
        }
    }

    function actionError(err, fallback) {
        const detail = err?.payload?.errors?.[0]?.error || err?.payload?.error;
        return detail && (state.__lang !== 'cn' || t(detail) !== detail)
            ? `${t(fallback)}: ${t(detail)}` : t(fallback);
    }

    async function openContainingFolder(mediaId) {
        try {
            const result = await request(`/api/items/${encodeURIComponent(mediaId)}/open-folder`, { method: 'POST' });
            showToast(t(result.file_exists ? 'Opened containing folder' : 'File missing; opened output folder'));
        } catch (err) {
            showToast(actionError(err, 'Unable to open folder'), true);
        }
    }

    function removeItemFromState(mediaId) {
        state.items = state.items.filter((item) => item.media_id !== mediaId);
        state.itemById.delete(mediaId);
        state.selectedIds.delete(mediaId);
        if (state.selectionAnchorId === mediaId) state.selectionAnchorId = '';
        state.selectedId = '';
        state.layout = null;
        state.renderedStart = -1;
        state.renderedEnd = -1;
        state.renderedKey = '';
        refs.drawer.setAttribute('aria-hidden', 'true');
        syncDetailLayout();
    }

    function renderSelection() {
        const scrollTop = refs.feedScroll ? refs.feedScroll.scrollTop : 0;
        updateSelectionControls();
        renderWindow(true);
        if (refs.feedScroll) refs.feedScroll.scrollTop = scrollTop;
    }

    function toggleItemSelection(mediaId) {
        const id = String(mediaId || '');
        if (!id) return;
        state.selectionMode = true;
        state.selectionAnchorId = id;
        if (state.selectedIds.has(id)) state.selectedIds.delete(id);
        else state.selectedIds.add(id);
        renderSelection();
    }

    function selectOnlyItem(mediaId) {
        const id = String(mediaId || '');
        if (!id) return;
        state.selectionAnchorId = id;
        state.selectedIds.clear();
        state.selectedIds.add(id);
        renderSelection();
    }

    function selectItemRange(mediaId, additive) {
        const id = String(mediaId || '');
        const target = state.items.findIndex((item) => item.media_id === id);
        if (target < 0) return;
        let anchor = state.items.findIndex((item) => item.media_id === state.selectionAnchorId);
        if (anchor < 0) {
            anchor = target;
            state.selectionAnchorId = id;
        }
        state.selectionMode = true;
        if (!additive) state.selectedIds.clear();
        for (let index = Math.min(anchor, target); index <= Math.max(anchor, target); index += 1) {
            state.selectedIds.add(state.items[index].media_id);
        }
        renderSelection();
    }

    function clearSelection() {
        state.selectedIds.clear();
        state.selectionAnchorId = '';
        renderSelection();
    }

    function clearSelectionForQueryChange() {
        state.selectionAnchorId = '';
        if (!state.selectedIds.size) return;
        state.selectedIds.clear();
        updateSelectionControls();
    }

    function toggleSelectionMode() {
        const scrollTop = refs.feedScroll ? refs.feedScroll.scrollTop : 0;
        clearCardClickTimer();
        state.selectionMode = !state.selectionMode;
        if (!state.selectionMode) {
            state.selectedIds.clear();
            state.selectionAnchorId = '';
        }
        updateSelectionControls();
        renderWindow(true);
        if (refs.feedScroll) refs.feedScroll.scrollTop = scrollTop;
    }

    async function applySelectionAction(action) {
        const ids = Array.from(state.selectedIds);
        if (!ids.length) return;
        const actionConfig = {
            trash: {
                path: '/api/items/trash', method: 'POST',
                confirm: t('Move selected media to the trash?'),
                success: t('Selected media moved to trash'), error: t('Unable to delete selected media')
            },
            restore: {
                path: '/api/items/restore', method: 'POST',
                confirm: t('Restore selected media from the trash?'),
                success: t('Selected media restored'), error: t('Unable to restore selected media')
            },
            purge: {
                path: '/api/trash', method: 'DELETE',
                confirm: t('Delete selected media permanently?'),
                success: t('Selected media permanently deleted'), error: t('Unable to permanently delete selected media')
            }
        }[action];
        if (!actionConfig || !window.confirm(actionConfig.confirm)) return;
        try {
            const result = await request(actionConfig.path, {
                method: actionConfig.method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids })
            });
            ids.forEach((id) => removeItemFromState(id));
            state.selectedIds.clear();
            updateSelectionControls();
            await loadPage(true);
            loadDates();
            showToast(t(action === 'trash' && result.removed_missing?.length && !result.trashed?.length ? 'Missing records removed' : actionConfig.success));
        } catch (err) {
            await loadPage(true);
            loadDates();
            showToast(actionError(err, actionConfig.error), true);
        }
    }

    async function restoreItem(mediaId) {
        if (!window.confirm(t('Restore this media from the trash?'))) return;
        try {
            await request('/api/items/restore', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [mediaId] }) });
            removeItemFromState(mediaId);
            updateSelectionControls();
            await loadPage(true);
            loadDates();
            showToast(t('Restored from trash'));
        } catch (err) {
            showToast(t('Unable to restore media'), true);
        }
    }

    async function purgeItem(mediaId) {
        if (!window.confirm(t('Delete this media permanently?'))) return;
        try {
            await request('/api/trash', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [mediaId] }) });
            removeItemFromState(mediaId);
            updateSelectionControls();
            await loadPage(true);
            showToast(t('Permanently deleted'));
        } catch (err) {
            showToast(t('Unable to permanently delete media'), true);
        }
    }

    async function emptyTrash() {
        if (!window.confirm(t('Empty the trash permanently?'))) return;
        try {
            await request('/api/trash', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
            state.items = [];
            state.itemById.clear();
            state.selectedIds.clear();
            state.cursor = null;
            state.hasMore = false;
            state.layout = null;
            state.renderedStart = -1;
            state.renderedEnd = -1;
            state.renderedKey = '';
            renderWindow(true);
            updateSelectionControls();
            refs.empty.hidden = false;
            showToast(t('Trash emptied'));
        } catch (err) {
            showToast(t('Unable to empty trash'), true);
        }
    }

    async function toggleTrashMode() {
        state.trashMode = !state.trashMode;
        state.date = '';
        state.favorite = null;
        state.collectionId = '';
        state.activeViewId = '';
        state.selectedIds.clear();
        state.selectionAnchorId = '';
        state.selectedId = '';
        refs.drawer.setAttribute('aria-hidden', 'true');
        syncDetailLayout();
        updateViewControls();
        refs.feedScroll.scrollTop = 0;
        await loadPage(true);
        renderOrganizers();
    }

    function closeDetail() {
        const scrollTop = refs.feedScroll ? refs.feedScroll.scrollTop : 0;
        state.selectedId = '';
        refs.drawer.setAttribute('aria-hidden', 'true');
        syncDetailLayout();
        renderWindow(true);
        if (refs.feedScroll) refs.feedScroll.scrollTop = scrollTop;
        scheduleVideoAutoplay();
    }

    async function toggleFavorite(item) {
        try {
            const result = await request(`/api/items/${encodeURIComponent(item.media_id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ favorite: !item.favorite }) });
            Object.assign(item, result.item || result);
            renderWindow(true);
            if (state.favorite === true && !item.favorite) loadPage(true);
        } catch (err) {
            showToast(t('Unable to save changes'), true);
        }
    }

    async function createCollection(event) {
        event.preventDefault();
        const title = refs.collectionName?.value.trim() || '';
        if (!title) return;
        try {
            const response = await request('/api/collections', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title })
            });
            await loadOrganizers();
            state.collectionId = response.collection.collection_id;
            state.activeViewId = '';
            refs.collectionName.value = '';
            refs.collectionCreateForm.hidden = true;
            syncFilterFields();
            loadPage(true);
        } catch (err) {
            showToast(t('Unable to create collection'), true);
        }
    }

    async function saveCurrentView() {
        const title = refs.viewName?.value.trim() || '';
        if (!title) return;
        try {
            const response = await request('/api/views', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, filters: currentFilters() })
            });
            refs.viewName.value = '';
            state.activeViewId = response.view.view_id;
            refs.filterPanel.hidden = true;
            refs.filterToggle.setAttribute('aria-expanded', 'false');
            await loadOrganizers();
        } catch (err) {
            showToast(t('Unable to save view'), true);
        }
    }

    async function handleOrganizerClick(event) {
        const row = event.target.closest('.organizer-item');
        if (!row) return;
        const deleting = event.target.closest('[data-organizer-delete]');
        const kind = deleting?.dataset.organizerDelete || event.target.closest('[data-organizer-open]')?.dataset.organizerOpen;
        if (kind === 'collection') {
            const id = row.dataset.collection;
            if (deleting) {
                if (!window.confirm(t('Delete this collection?'))) return;
                try {
                    await request(`/api/collections/${encodeURIComponent(id)}`, { method: 'DELETE' });
                    if (state.collectionId === id) {
                        state.collectionId = '';
                        loadPage(true);
                    }
                    await loadOrganizers();
                } catch (err) { showToast(t('Unable to delete collection'), true); }
            } else {
                state.collectionId = state.collectionId === id ? '' : id;
                state.activeViewId = '';
                clearSelectionForQueryChange();
                syncFilterFields();
                refs.feedScroll.scrollTop = 0;
                loadPage(true);
                refs.dateSidebar.classList.remove('is-open');
            }
        } else if (kind === 'view') {
            const id = row.dataset.view;
            if (deleting) {
                if (!window.confirm(t('Delete this view?'))) return;
                try {
                    await request(`/api/views/${encodeURIComponent(id)}`, { method: 'DELETE' });
                    if (state.activeViewId === id) state.activeViewId = '';
                    await loadOrganizers();
                } catch (err) { showToast(t('Unable to delete view'), true); }
            } else {
                const view = state.savedViews.find((entry) => entry.view_id === id);
                if (!view) return;
                state.activeViewId = id;
                applySavedFilters(view.filters);
                refs.dateSidebar.classList.remove('is-open');
            }
        }
    }

    async function applyBatchMetadata() {
        const ids = Array.from(state.selectedIds);
        const addTags = (refs.batchTags?.value || '').split(',').map((value) => value.trim()).filter(Boolean);
        const rating = refs.batchRating?.value;
        const favorite = refs.batchFavorite?.value;
        if (!ids.length || (!addTags.length && rating === '' && favorite === '')) return;
        const payload = { ids, add_tags: addTags };
        if (rating !== '') payload.rating = Number(rating);
        if (favorite !== '') payload.favorite = favorite === '1';
        try {
            await request('/api/items/batch', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            refs.batchEditor.hidden = true;
            refs.batchTags.value = '';
            refs.batchRating.value = '';
            refs.batchFavorite.value = '';
            await loadPage(true);
            showToast(t('Selected media updated'));
        } catch (err) { showToast(t('Unable to update selected media'), true); }
    }

    async function addSelectionToCollection() {
        const id = refs.selectionCollection?.value;
        if (!id || !state.selectedIds.size) return;
        try {
            await request(`/api/collections/${encodeURIComponent(id)}/items`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: Array.from(state.selectedIds) })
            });
            await loadOrganizers();
            showToast(t('Added to collection'));
        } catch (err) { showToast(t('Unable to add to collection'), true); }
    }

    async function removeSelectionFromCollection() {
        const id = state.collectionId;
        if (!id || !state.selectedIds.size) return;
        try {
            await request(`/api/collections/${encodeURIComponent(id)}/items`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: Array.from(state.selectedIds), remove: true })
            });
            state.selectedIds.clear();
            updateSelectionControls();
            await Promise.all([loadPage(true), loadOrganizers()]);
            showToast(t('Removed from collection'));
        } catch (err) { showToast(t('Unable to remove from collection'), true); }
    }

    function closeCompare() {
        stopComparePlayback();
        state.compareIds = [];
        state.compareDrag = null;
        refs.compare?.setAttribute('aria-hidden', 'true');
        refs.compareGrid?.replaceChildren();
        scheduleVideoAutoplay();
    }

    function compareItems() {
        return state.compareIds.map((id) => state.itemById.get(id)).filter(Boolean);
    }

    function compareVideos() {
        return Array.from(refs.compareGrid?.querySelectorAll('.compare-item video') || []);
    }

    function formatCompareTime(seconds) {
        const total = Math.floor(Math.max(0, Number(seconds) || 0));
        const minutes = Math.floor(total / 60);
        const clock = `${minutes % 60}:${String(total % 60).padStart(2, '0')}`;
        return minutes >= 60 ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}` : clock;
    }

    function updateCompareClock() {
        if (refs.compareTime) refs.compareTime.value = String(Math.min(state.compareTime, state.compareDuration || 0));
        if (refs.compareClock) refs.compareClock.value =
            `${formatCompareTime(state.compareTime)} / ${formatCompareTime(state.compareDuration)}`;
    }

    function updateComparePlaybackButtons() {
        const playLabel = t(state.comparePlaying ? 'Pause' : 'Play');
        refs.comparePlay?.setAttribute('title', playLabel);
        refs.comparePlay?.setAttribute('aria-label', playLabel);
        if (refs.comparePlay) refs.comparePlay.querySelector('i').className = `fa fa-${state.comparePlaying ? 'pause' : 'play'}`;
        const muteLabel = t(state.compareMuted ? 'Unmute' : 'Mute');
        refs.compareMute?.setAttribute('title', muteLabel);
        refs.compareMute?.setAttribute('aria-label', muteLabel);
        refs.compareMute?.setAttribute('aria-pressed', state.compareMuted ? 'true' : 'false');
        if (refs.compareMute) refs.compareMute.querySelector('i').className =
            `fa fa-volume-${state.compareMuted ? 'xmark' : 'high'}`;
    }

    function updateCompareTransport() {
        const videos = compareVideos();
        const available = videos.length >= 2;
        const durations = videos.map((video) => video.duration);
        state.compareDuration = available && durations.every((duration) => Number.isFinite(duration) && duration > 0)
            ? Math.min(...durations) : 0;
        state.compareTime = Math.min(state.compareTime, state.compareDuration);
        if (refs.compareSync) {
            refs.compareSync.hidden = !available;
            refs.compareSync.setAttribute('aria-pressed', state.compareSync ? 'true' : 'false');
        }
        if (refs.compareTransport) refs.compareTransport.hidden = !available || !state.compareSync;
        if (refs.comparePlay) refs.comparePlay.disabled = !state.compareDuration;
        if (refs.compareTime) {
            refs.compareTime.disabled = !state.compareDuration;
            refs.compareTime.max = String(state.compareDuration || 1);
        }
        if (refs.compareRate) refs.compareRate.value = String(state.compareRate);
        videos.forEach((video, index) => {
            video.controls = !available || !state.compareSync;
            video.muted = available && state.compareSync && (index > 0 || state.compareMuted);
            video.playbackRate = state.compareRate;
        });
        updateComparePlaybackButtons();
        updateCompareClock();
    }

    function stopComparePlayback() {
        state.compareSession += 1;
        window.clearInterval(state.compareTimer);
        state.compareTimer = 0;
        state.comparePlaying = false;
        compareVideos().forEach((video) => video.pause());
        updateComparePlaybackButtons();
    }

    function seekCompareVideos(seconds) {
        if (!state.compareDuration) return;
        state.compareTime = Math.max(0, Math.min(state.compareDuration, Number(seconds) || 0));
        compareVideos().forEach((video) => {
            if (video.readyState >= 1 && Math.abs(video.currentTime - state.compareTime) > .01) {
                video.currentTime = state.compareTime;
            }
        });
        updateCompareClock();
    }

    function failComparePlayback(session) {
        if (session !== state.compareSession || !state.comparePlaying) return;
        stopComparePlayback();
        showToast(t('Unable to play video'), true);
    }

    function syncComparePlayback() {
        if (!state.comparePlaying || !state.compareSync || refs.compare?.getAttribute('aria-hidden') !== 'false') return;
        const videos = compareVideos();
        const leader = videos[0];
        if (videos.length < 2 || videos.some((video) => video.error)) {
            failComparePlayback(state.compareSession);
            return;
        }
        if (leader.currentTime >= state.compareDuration - .03 || videos.some((video) => video.ended)) {
            seekCompareVideos(state.compareDuration);
            stopComparePlayback();
            return;
        }
        if (videos.some((video) => video.readyState < 3)) {
            videos.forEach((video) => video.pause());
            return;
        }
        videos.slice(1).forEach((video) => {
            if (Math.abs(video.currentTime - leader.currentTime) > .18) video.currentTime = leader.currentTime;
        });
        const session = state.compareSession;
        videos.forEach((video) => {
            if (video.paused && !video.dataset.compareResuming) {
                video.dataset.compareResuming = '1';
                Promise.resolve(video.play()).catch(() => failComparePlayback(session))
                    .finally(() => { delete video.dataset.compareResuming; });
            }
        });
        state.compareTime = Math.min(leader.currentTime, state.compareDuration);
        updateCompareClock();
    }

    function startComparePlayback() {
        const videos = compareVideos();
        if (!state.compareSync || videos.length < 2 || !state.compareDuration) return;
        if (state.compareTime >= state.compareDuration - .03) seekCompareVideos(0);
        else seekCompareVideos(state.compareTime);
        state.comparePlaying = true;
        const session = ++state.compareSession;
        updateComparePlaybackButtons();
        try {
            Promise.all(videos.map((video) => Promise.resolve(video.play())))
                .then(() => {
                    if (session !== state.compareSession || !state.comparePlaying) return;
                    syncComparePlayback();
                    if (session === state.compareSession && state.comparePlaying) {
                        state.compareTimer = window.setInterval(syncComparePlayback, 120);
                    }
                })
                .catch(() => failComparePlayback(session));
        } catch (err) {
            failComparePlayback(session);
        }
    }

    function updateCompareTransforms() {
        if (!refs.compareGrid) return;
        const images = Array.from(refs.compareGrid.querySelectorAll('.compare-media img'));
        if (!images.length) return;
        const first = images[0];
        const firstStage = first.closest('.compare-media');
        const firstRect = firstStage.getBoundingClientRect();
        const firstWidth = first.naturalWidth || Number(first.dataset.width) || 1;
        const firstHeight = first.naturalHeight || Number(first.dataset.height) || 1;
        const referenceFit = Math.min(Math.max(1, firstRect.width - 24) / firstWidth, Math.max(1, firstRect.height - 24) / firstHeight);
        images.forEach((image) => {
            const rect = image.closest('.compare-media').getBoundingClientRect();
            const width = image.naturalWidth || Number(image.dataset.width) || 1;
            const height = image.naturalHeight || Number(image.dataset.height) || 1;
            let scale;
            if (state.compareMatch === 'width') scale = firstWidth * referenceFit / width;
            else if (state.compareMatch === 'height') scale = firstHeight * referenceFit / height;
            else if (state.compareMatch === 'pixel') scale = 1;
            else scale = Math.min(Math.max(1, rect.width - 24) / width, Math.max(1, rect.height - 24) / height);
            image.style.width = `${width * scale * state.compareZoom}px`;
            image.style.height = `${height * scale * state.compareZoom}px`;
            image.style.transform = `translate(-50%, -50%) translate(${state.comparePan.x}px, ${state.comparePan.y}px)`;
        });
    }

    function updateCompareControls() {
        const canWipe = compareItems().length === 2 && compareItems().every((item) => item.media_type === 'image');
        if (!canWipe) state.compareMode = 'side';
        refs.compareSide?.setAttribute('aria-pressed', state.compareMode === 'side' ? 'true' : 'false');
        refs.compareWipe?.setAttribute('aria-pressed', state.compareMode === 'wipe' ? 'true' : 'false');
        if (refs.compareWipe) refs.compareWipe.disabled = !canWipe;
        if (refs.compareSplitControl) refs.compareSplitControl.hidden = state.compareMode !== 'wipe';
        if (refs.compareZoom) refs.compareZoom.value = String(Math.round(state.compareZoom * 100));
        if (refs.compareZoomValue) refs.compareZoomValue.value = `${Math.round(state.compareZoom * 100)}%`;
        if (refs.compareMatch) refs.compareMatch.value = state.compareMatch;
        if (refs.compareX) refs.compareX.value = String(state.comparePan.x);
        if (refs.compareY) refs.compareY.value = String(state.comparePan.y);
        if (refs.compareSplit) refs.compareSplit.value = String(state.compareSplit);
        refs.compareGrid?.style.setProperty('--compare-split', `${state.compareSplit}%`);
    }

    function compareImage(item, index) {
        return `<img src="${escapeHtml(item.media_url || item.thumbnail_url || '')}" alt="${escapeHtml(item.title || item.name || '')}" draggable="false" data-width="${Number(item.width) || 0}" data-height="${Number(item.height) || 0}" data-compare-index="${index}">`;
    }

    function renderCompare() {
        const items = compareItems();
        if (!items.length || !refs.compareGrid) return;
        stopComparePlayback();
        updateCompareControls();
        refs.compareGrid.style.setProperty('--compare-count', String(items.length));
        refs.compareGrid.classList.toggle('is-wipe', state.compareMode === 'wipe');
        if (state.compareMode === 'wipe') {
            refs.compareGrid.innerHTML = `<div class="compare-wipe">
                <div class="compare-media">${compareImage(items[0], 0)}</div>
                <div class="compare-wipe-reveal"><div class="compare-media">${compareImage(items[1], 1)}</div></div>
                <div class="compare-divider" role="separator" aria-label="${escapeHtml(t('Divider'))}" aria-valuenow="${state.compareSplit}"><span></span></div>
                <div class="compare-wipe-labels"><span>${escapeHtml(items[0].title || items[0].name || '')}</span><span>${escapeHtml(items[1].title || items[1].name || '')}</span></div>
            </div>`;
        } else {
            refs.compareGrid.innerHTML = items.map((item, index) => {
                const source = escapeHtml(item.media_url || item.thumbnail_url || '');
                const media = item.media_type === 'image' ? compareImage(item, index)
                    : item.media_type === 'video' ? `<video src="${source}" controls playsinline preload="metadata"></video>`
                        : `<audio src="${source}" controls preload="metadata"></audio>`;
                return `<div class="compare-item"><div class="compare-media">${media}</div><div class="compare-caption" title="${escapeHtml(item.title || item.name || '')}">${escapeHtml(item.title || item.name || '')}</div></div>`;
            }).join('');
        }
        compareVideos().forEach((video) => {
            video.addEventListener('loadedmetadata', updateCompareTransport);
            video.addEventListener('durationchange', updateCompareTransport);
            video.addEventListener('ended', () => {
                if (state.comparePlaying) {
                    seekCompareVideos(state.compareDuration);
                    stopComparePlayback();
                }
            });
            video.addEventListener('error', () => {
                if (state.comparePlaying) failComparePlayback(state.compareSession);
                updateCompareTransport();
            });
        });
        updateCompareTransport();
        refs.compareGrid.querySelectorAll('img').forEach((image) => image.addEventListener('load', updateCompareTransforms, { once: true }));
        window.requestAnimationFrame(updateCompareTransforms);
    }

    function openCompare() {
        if (!refs.compare) return;
        const count = state.selectedIds.size;
        if (count < 2 || count > 4) {
            showToast(t('Select 2 to 4 media'), true);
            return;
        }
        const items = state.items.filter((item) => state.selectedIds.has(item.media_id));
        if (items.length !== count) {
            showToast(t('Unable to load media'), true);
            return;
        }
        state.compareIds = items.map((item) => item.media_id);
        state.compareMode = 'side';
        state.compareMatch = 'fit';
        state.compareZoom = 1;
        state.comparePan = { x: 0, y: 0 };
        state.compareSplit = 50;
        state.compareSync = true;
        state.compareMuted = false;
        state.compareTime = 0;
        state.compareDuration = 0;
        state.compareRate = 1;
        stopAllVideoPreviews();
        refs.compare.setAttribute('aria-hidden', 'false');
        renderCompare();
    }

    function resetCompareAlignment() {
        state.compareZoom = 1;
        state.comparePan = { x: 0, y: 0 };
        state.compareSplit = 50;
        updateCompareControls();
        updateCompareTransforms();
    }

    function startCompareDrag(event) {
        if (event.button !== 0) return;
        const divider = event.target.closest('.compare-divider');
        const stage = event.target.closest('.compare-media');
        if (!divider && (!stage || event.target.closest('video, audio'))) return;
        state.compareDrag = {
            type: divider ? 'split' : 'pan', x: event.clientX, y: event.clientY,
            panX: state.comparePan.x, panY: state.comparePan.y
        };
        refs.compareGrid.setPointerCapture?.(event.pointerId);
        event.preventDefault();
    }

    function moveCompareDrag(event) {
        const drag = state.compareDrag;
        if (!drag) return;
        if (drag.type === 'split') {
            const rect = refs.compareGrid.querySelector('.compare-wipe')?.getBoundingClientRect();
            if (!rect?.width) return;
            state.compareSplit = Math.max(0, Math.min(100, Math.round((event.clientX - rect.left) / rect.width * 100)));
            refs.compareGrid.style.setProperty('--compare-split', `${state.compareSplit}%`);
            const divider = refs.compareGrid.querySelector('.compare-divider');
            divider?.setAttribute('aria-valuenow', String(state.compareSplit));
        } else {
            state.comparePan = { x: Math.round(drag.panX + event.clientX - drag.x), y: Math.round(drag.panY + event.clientY - drag.y) };
            updateCompareTransforms();
        }
        updateCompareControls();
    }

    function bindEvents() {
        refs.feed.addEventListener('click', (event) => {
            const selectButton = event.target.closest('.card-select');
            if (selectButton) {
                clearCardClickTimer();
                event.stopPropagation();
                const card = selectButton.closest('.media-card');
                if (card) {
                    if (event.shiftKey) {
                        event.preventDefault();
                        selectItemRange(card.dataset.id, event.ctrlKey);
                    } else toggleItemSelection(card.dataset.id);
                }
                return;
            }
            const favoriteButton = event.target.closest('.card-favorite');
            if (favoriteButton) {
                clearCardClickTimer();
                event.stopPropagation();
                const card = favoriteButton.closest('.media-card');
                const item = card && state.itemById.get(card.dataset.id);
                if (item) toggleFavorite(item);
                return;
            }
            const card = event.target.closest('.media-card');
            if (card) {
                if (event.shiftKey || event.ctrlKey) {
                    event.preventDefault();
                    clearCardClickTimer();
                    if (event.shiftKey) selectItemRange(card.dataset.id, event.ctrlKey);
                    else toggleItemSelection(card.dataset.id);
                } else if (state.selectionMode) {
                    selectOnlyItem(card.dataset.id);
                } else {
                    state.selectionAnchorId = card.dataset.id;
                    clearCardClickTimer();
                    state.cardClickTimer = window.setTimeout(() => {
                        state.cardClickTimer = 0;
                        openDetail(card.dataset.id);
                    }, 220);
                }
            }
        });
        refs.feed.addEventListener('dblclick', (event) => {
            const card = event.target.closest('.media-card');
            if (!card || state.selectionMode || event.target.closest('button, a, input, select, textarea')) return;
            clearCardClickTimer();
            event.preventDefault();
            const item = state.itemById.get(card.dataset.id);
            if (item) openViewer(item);
        });
        refs.dateList.addEventListener('click', (event) => {
            const button = event.target.closest('.date-item');
            if (!button) return;
            const nextDate = button.dataset.date || '';
            state.date = state.date === nextDate ? '' : nextDate;
            state.activeViewId = '';
            clearSelectionForQueryChange();
            renderDates();
            refs.dateSidebar.classList.remove('is-open');
            loadPage(true);
            refs.feedScroll.scrollTop = 0;
        });
        refs.clearDate.addEventListener('click', () => {
            state.date = '';
            state.activeViewId = '';
            clearSelectionForQueryChange();
            renderDates();
            loadPage(true);
        });
        refs.closeDetail.addEventListener('click', closeDetail);
        refs.detailBackdrop?.addEventListener('click', closeDetail);
        refs.type.addEventListener('change', () => { state.mediaType = refs.type.value; state.activeViewId = ''; clearSelectionForQueryChange(); loadPage(true); });
        refs.sort.addEventListener('change', () => { state.sort = refs.sort.value; state.activeViewId = ''; clearSelectionForQueryChange(); loadPage(true); });
        refs.favoriteFilter.addEventListener('click', () => {
            state.favorite = state.favorite === true ? null : true;
            state.activeViewId = '';
            clearSelectionForQueryChange();
            refs.favoriteFilter.setAttribute('aria-pressed', state.favorite === true ? 'true' : 'false');
            loadPage(true);
        });
        refs.trashView?.addEventListener('click', () => toggleTrashMode());
        refs.selectionMode?.addEventListener('click', () => toggleSelectionMode());
        refs.selectionClear?.addEventListener('click', () => clearSelection());
        refs.selectionTrash?.addEventListener('click', () => applySelectionAction('trash'));
        refs.selectionRestore?.addEventListener('click', () => applySelectionAction('restore'));
        refs.selectionPurge?.addEventListener('click', () => applySelectionAction('purge'));
        refs.selectionCompare?.addEventListener('click', openCompare);
        refs.selectionEdit?.addEventListener('click', () => {
            refs.batchEditor.hidden = !refs.batchEditor.hidden;
        });
        refs.batchSave?.addEventListener('click', applyBatchMetadata);
        refs.selectionAddCollection?.addEventListener('click', addSelectionToCollection);
        refs.selectionRemoveCollection?.addEventListener('click', removeSelectionFromCollection);
        refs.collectionCreateToggle?.addEventListener('click', () => {
            refs.collectionCreateForm.hidden = !refs.collectionCreateForm.hidden;
            if (!refs.collectionCreateForm.hidden) refs.collectionName.focus();
        });
        refs.collectionCreateForm?.addEventListener('submit', createCollection);
        refs.collectionList?.addEventListener('click', handleOrganizerClick);
        refs.viewList?.addEventListener('click', handleOrganizerClick);
        refs.filterToggle?.addEventListener('click', () => {
            refs.filterPanel.hidden = !refs.filterPanel.hidden;
            refs.filterToggle.setAttribute('aria-expanded', refs.filterPanel.hidden ? 'false' : 'true');
            if (!refs.filterPanel.hidden) refs.dateSidebar.classList.remove('is-open');
        });
        refs.filterApply?.addEventListener('click', () => {
            state.tag = refs.filterTag.value.trim();
            state.modelQuery = refs.filterModel.value.trim();
            state.ratingMin = refs.filterRating.value;
            state.orientation = refs.filterOrientation.value;
            state.activeViewId = '';
            refs.filterPanel.hidden = true;
            refs.filterToggle.setAttribute('aria-expanded', 'false');
            clearSelectionForQueryChange();
            syncFilterFields();
            refs.feedScroll.scrollTop = 0;
            loadPage(true);
        });
        refs.filterClear?.addEventListener('click', () => {
            state.tag = '';
            state.modelQuery = '';
            state.ratingMin = '';
            state.orientation = '';
            state.activeViewId = '';
            clearSelectionForQueryChange();
            syncFilterFields();
            loadPage(true);
        });
        refs.viewSave?.addEventListener('click', saveCurrentView);
        refs.viewName?.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') { event.preventDefault(); saveCurrentView(); }
        });
        refs.autoplayToggle?.addEventListener('click', () => {
            state.autoplayEnabled = !state.autoplayEnabled;
            state.failedPreviews.clear();
            try { window.localStorage.setItem(AUTOPLAY_STORAGE_KEY, state.autoplayEnabled ? '1' : '0'); } catch (err) {}
            updateAutoplayControl();
            scheduleVideoAutoplay();
        });
        refs.purgeTrash?.addEventListener('click', () => emptyTrash());
        let searchTimer = 0;
        refs.search.addEventListener('input', () => {
            window.clearTimeout(searchTimer);
            searchTimer = window.setTimeout(() => { state.query = refs.search.value.trim(); state.activeViewId = ''; clearSelectionForQueryChange(); loadPage(true); }, 240);
        });
        refs.refresh.addEventListener('click', refreshLibrary);
        refs.rescan.addEventListener('click', refreshLibrary);
        refs.datesToggle.addEventListener('click', () => {
            refs.dateSidebar.classList.toggle('is-open');
            if (refs.filterPanel && !refs.filterPanel.hidden) {
                refs.filterPanel.hidden = true;
                refs.filterToggle.setAttribute('aria-expanded', 'false');
            }
        });
        refs.viewerClose.addEventListener('click', closeViewer);
        refs.viewerBackdrop.addEventListener('click', closeViewer);
        refs.viewerPrev.addEventListener('click', () => moveViewer(-1));
        refs.viewerNext.addEventListener('click', () => moveViewer(1));
        refs.viewerZoomOut.addEventListener('click', () => adjustViewerZoom(-.25));
        refs.viewerZoomIn.addEventListener('click', () => adjustViewerZoom(.25));
        refs.viewerZoomReset.addEventListener('click', () => { state.viewerZoom = 1; updateViewer(); });
        refs.viewerStage?.addEventListener('wheel', handleViewerWheel, { passive: false });
        refs.compareClose?.addEventListener('click', closeCompare);
        refs.compareZoom?.addEventListener('input', () => {
            state.compareZoom = Number(refs.compareZoom.value || 100) / 100;
            updateCompareControls();
            updateCompareTransforms();
        });
        refs.compareMatch?.addEventListener('change', () => {
            state.compareMatch = refs.compareMatch.value;
            updateCompareTransforms();
        });
        refs.compareSide?.addEventListener('click', () => {
            if (state.compareMode !== 'side') { state.compareMode = 'side'; renderCompare(); }
        });
        refs.compareWipe?.addEventListener('click', () => { state.compareMode = 'wipe'; renderCompare(); });
        refs.compareSync?.addEventListener('click', () => {
            const videos = compareVideos();
            const time = videos[0]?.currentTime || 0;
            stopComparePlayback();
            state.compareSync = !state.compareSync;
            updateCompareTransport();
            if (state.compareSync) seekCompareVideos(time);
        });
        refs.comparePlay?.addEventListener('click', () => {
            if (state.comparePlaying) stopComparePlayback();
            else startComparePlayback();
        });
        refs.compareTime?.addEventListener('input', () => seekCompareVideos(refs.compareTime.value));
        refs.compareMute?.addEventListener('click', () => {
            state.compareMuted = !state.compareMuted;
            updateCompareTransport();
        });
        refs.compareRate?.addEventListener('change', () => {
            state.compareRate = Number(refs.compareRate.value) || 1;
            updateCompareTransport();
        });
        refs.compareAlign?.addEventListener('click', resetCompareAlignment);
        [refs.compareX, refs.compareY].forEach((input) => input?.addEventListener('input', () => {
            state.comparePan = { x: Number(refs.compareX.value) || 0, y: Number(refs.compareY.value) || 0 };
            updateCompareTransforms();
        }));
        refs.compareSplit?.addEventListener('input', () => {
            state.compareSplit = Number(refs.compareSplit.value);
            updateCompareControls();
        });
        refs.compareGrid?.addEventListener('pointerdown', startCompareDrag);
        refs.compareGrid?.addEventListener('pointermove', moveCompareDrag);
        refs.compareGrid?.addEventListener('pointerup', () => { state.compareDrag = null; });
        refs.compareGrid?.addEventListener('pointercancel', () => { state.compareDrag = null; });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && refs.compare?.getAttribute('aria-hidden') === 'false') closeCompare();
            else if (event.key === 'Escape' && refs.filterPanel && !refs.filterPanel.hidden) {
                refs.filterPanel.hidden = true;
                refs.filterToggle.setAttribute('aria-expanded', 'false');
            }
        });
        document.addEventListener('keydown', handleViewerKeydown);
        refs.feedScroll.addEventListener('scroll', () => {
            window.requestAnimationFrame(() => {
                if (state.items.length > MAX_RENDERED) renderWindow(false);
                updateActiveDateFromViewport();
                maybeLoadMore();
                refs.feed?.querySelectorAll('video[data-auto-preview]').forEach((video) => {
                    if (!previewVisible(video.closest('.media-card'))) stopVideoPreview(video.closest('.media-card'));
                });
                scheduleVideoAutoplay();
            });
        }, { passive: true });
        window.addEventListener('resize', () => window.requestAnimationFrame(() => {
            renderWindow(true);
            scheduleVideoAutoplay();
            updateCompareTransforms();
        }), { passive: true });
        document.addEventListener('visibilitychange', scheduleVideoAutoplay);
        const observer = new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting)) maybeLoadMore();
        }, { root: refs.feedScroll, rootMargin: '900px 0px', threshold: 0 });
        observer.observe(refs.sentinel);
    }

    async function init() {
        document.documentElement.dataset.theme = config.theme === 'dark' ? 'dark' : 'light';
        document.body.dataset.theme = config.theme === 'dark' ? 'dark' : 'light';
        refs.app = document.getElementById('media-library-app');
        refs.feed = document.getElementById('gallery-feed');
        refs.layout = document.getElementById('media-library-layout');
        refs.feedScroll = document.getElementById('media-feed-scroll');
        refs.topSpacer = document.getElementById('feed-top-spacer');
        refs.bottomSpacer = document.getElementById('feed-bottom-spacer');
        refs.sentinel = document.getElementById('feed-sentinel');
        refs.empty = document.getElementById('empty-state');
        refs.status = document.getElementById('feed-status');
        refs.dateList = document.getElementById('date-list');
        refs.dateSidebar = document.getElementById('date-sidebar');
        refs.clearDate = document.getElementById('clear-date');
        refs.drawer = document.getElementById('detail-drawer');
        refs.detailBackdrop = document.getElementById('detail-backdrop');
        refs.detail = document.getElementById('detail-content');
        refs.closeDetail = document.getElementById('close-detail');
        refs.toast = document.getElementById('media-toast');
        refs.search = document.getElementById('media-search');
        refs.type = document.getElementById('media-type');
        refs.sort = document.getElementById('media-sort');
        refs.favoriteFilter = document.getElementById('favorite-filter');
        refs.filterToggle = document.getElementById('filter-toggle');
        refs.filterPanel = document.getElementById('media-filter-panel');
        refs.filterTag = document.getElementById('filter-tag');
        refs.filterModel = document.getElementById('filter-model');
        refs.filterRating = document.getElementById('filter-rating');
        refs.filterOrientation = document.getElementById('filter-orientation');
        refs.filterApply = document.getElementById('filter-apply');
        refs.filterClear = document.getElementById('filter-clear');
        refs.viewName = document.getElementById('view-name');
        refs.viewSave = document.getElementById('view-save');
        refs.collectionList = document.getElementById('collection-list');
        refs.viewList = document.getElementById('view-list');
        refs.collectionCreateToggle = document.getElementById('collection-create-toggle');
        refs.collectionCreateForm = document.getElementById('collection-create-form');
        refs.collectionName = document.getElementById('collection-name');
        refs.autoplayToggle = document.getElementById('autoplay-toggle');
        refs.trashView = document.getElementById('trash-view');
        refs.selectionMode = document.getElementById('selection-mode');
        refs.refresh = document.getElementById('refresh-library');
        refs.rescan = document.getElementById('rescan-library');
        refs.purgeTrash = document.getElementById('purge-trash');
        refs.selectionCount = document.getElementById('selection-count');
        refs.selectionClear = document.getElementById('selection-clear');
        refs.selectionTrash = document.getElementById('selection-trash');
        refs.selectionRestore = document.getElementById('selection-restore');
        refs.selectionPurge = document.getElementById('selection-purge');
        refs.selectionCompare = document.getElementById('selection-compare');
        refs.selectionEdit = document.getElementById('selection-edit');
        refs.selectionCollection = document.getElementById('selection-collection');
        refs.selectionAddCollection = document.getElementById('selection-add-collection');
        refs.selectionRemoveCollection = document.getElementById('selection-remove-collection');
        refs.batchEditor = document.getElementById('batch-editor');
        refs.batchTags = document.getElementById('batch-tags');
        refs.batchRating = document.getElementById('batch-rating');
        refs.batchFavorite = document.getElementById('batch-favorite');
        refs.batchSave = document.getElementById('batch-save');
        refs.datesToggle = document.getElementById('dates-toggle');
        refs.emptyTitle = document.querySelector('#empty-state h2');
        refs.emptyDescription = document.querySelector('#empty-state p');
        refs.viewer = document.getElementById('media-viewer');
        refs.viewerBackdrop = document.getElementById('viewer-backdrop');
        refs.viewerStage = document.getElementById('viewer-stage');
        refs.viewerClose = document.getElementById('viewer-close');
        refs.viewerMedia = document.getElementById('viewer-media');
        refs.viewerTitle = document.getElementById('viewer-title');
        refs.viewerPosition = document.getElementById('viewer-position');
        refs.viewerPrev = document.getElementById('viewer-prev');
        refs.viewerNext = document.getElementById('viewer-next');
        refs.viewerZoomOut = document.getElementById('viewer-zoom-out');
        refs.viewerZoomReset = document.getElementById('viewer-zoom-reset');
        refs.viewerZoomIn = document.getElementById('viewer-zoom-in');
        refs.viewerDownload = document.getElementById('viewer-download');
        refs.compare = document.getElementById('media-compare');
        refs.compareGrid = document.getElementById('compare-grid');
        refs.compareZoom = document.getElementById('compare-zoom');
        refs.compareZoomValue = document.getElementById('compare-zoom-value');
        refs.compareClose = document.getElementById('compare-close');
        refs.compareSide = document.getElementById('compare-side');
        refs.compareWipe = document.getElementById('compare-wipe');
        refs.compareMatch = document.getElementById('compare-match');
        refs.compareX = document.getElementById('compare-x');
        refs.compareY = document.getElementById('compare-y');
        refs.compareAlign = document.getElementById('compare-align');
        refs.compareSplit = document.getElementById('compare-split');
        refs.compareSplitControl = document.getElementById('compare-split-control');
        refs.compareSync = document.getElementById('compare-sync');
        refs.compareTransport = document.getElementById('compare-transport');
        refs.comparePlay = document.getElementById('compare-play');
        refs.compareTime = document.getElementById('compare-time');
        refs.compareClock = document.getElementById('compare-clock');
        refs.compareMute = document.getElementById('compare-mute');
        refs.compareRate = document.getElementById('compare-rate');
        try { state.autoplayEnabled = window.localStorage.getItem(AUTOPLAY_STORAGE_KEY) !== '0'; } catch (err) {}
        await loadLocale();
        updateStaticTranslations();
        updateAutoplayControl();
        updateViewControls();
        bindEvents();
        await Promise.all([loadDates(), loadOrganizers()]);
        await loadPage(true);
    }

    window.MediaLibraryPage = {
        state, init, loadPage, loadDates, renderWindow, openViewer, closeViewer,
        toggleSelectionMode, toggleItemSelection, clearSelection, videoAutoplayEligible, syncVideoAutoplay
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();
