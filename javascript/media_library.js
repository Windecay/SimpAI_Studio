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

    const state = {
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
        trashMode: false,
        selectionMode: false,
        selectedIds: new Set(),
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
        dateRefreshTimer: 0,
        toastTimer: 0
    };

    const refs = {};
    const t = (text) => {
        if (window.SimpAII18n && typeof window.SimpAII18n.t === 'function') {
            return window.SimpAII18n.t(text, text, { __lang: config.lang });
        }
        if (config.lang === 'cn' && window.localization && window.localization[text]) return window.localization[text];
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

    function showToast(message, error) {
        if (!refs.toast) return;
        refs.toast.textContent = String(message || '');
        refs.toast.classList.toggle('is-error', !!error);
        refs.toast.classList.add('is-visible');
        window.clearTimeout(state.toastTimer);
        state.toastTimer = window.setTimeout(() => refs.toast.classList.remove('is-visible'), 2600);
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

    async function loadDates() {
        try {
            const payload = await request('/api/dates');
            state.dates = Array.isArray(payload.dates) ? payload.dates : [];
            renderDates();
            if (!state.items.length && !state.dates.length && !state.dateRefreshTimer) {
                state.dateRefreshTimer = window.setTimeout(() => {
                    state.dateRefreshTimer = 0;
                    loadDates();
                    loadPage(true);
                }, 1800);
            }
        } catch (err) {
            showToast(t('Unable to load dates'), true);
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
        while (wrappers.length > count) wrappers.pop().remove();
        wrappers.forEach((wrapper, index) => { wrapper.dataset.column = String(index); });
        return wrappers;
    }

    function renderMasonry(positions, layout) {
        const wanted = new Set(positions.map((position) => position.item.media_id));
        const existing = new Map(Array.from(refs.feed.querySelectorAll('.media-card')).map((card) => [card.dataset.id, card]));
        refs.feed.querySelectorAll('.media-card').forEach((card) => {
            if (!wanted.has(card.dataset.id)) card.remove();
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
            sequence.forEach((child) => wrapper.appendChild(child));
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
        updateViewer();
    }

    function closeViewer() {
        state.viewerId = '';
        state.viewerZoom = 1;
        refs.viewer.setAttribute('aria-hidden', 'true');
        refs.viewerMedia.replaceChildren();
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
        const trashed = !!item.is_trashed || state.trashMode;
        const lifecycleActions = trashed
            ? `<button class="primary-button" type="button" id="detail-viewer"><i class="fa fa-expand"></i> ${escapeHtml(t('View full screen'))}</button><button class="primary-button" type="button" id="detail-restore"><i class="fa fa-rotate-left"></i> ${escapeHtml(t('Restore media'))}</button><button class="danger-button" type="button" id="detail-purge"><i class="fa fa-trash"></i> ${escapeHtml(t('Delete permanently'))}</button>`
            : `<button class="primary-button" type="button" id="detail-viewer"><i class="fa fa-expand"></i> ${escapeHtml(t('View full screen'))}</button><a class="primary-button" href="${escapeHtml(item.download_url || item.media_url || '#')}" download><i class="fa fa-download"></i> ${escapeHtml(t('Download'))}</a><button class="danger-button" type="button" id="detail-trash"><i class="fa fa-trash"></i> ${escapeHtml(t('Delete'))}</button>`;
        refs.detail.innerHTML = `<div class="detail-preview">${detailPreview(item)}</div>
            <div class="detail-actions">${lifecycleActions}</div>
            <section class="detail-section"><h3>${escapeHtml(t('Library metadata'))}</h3><div class="detail-form">
                <label for="detail-title">${escapeHtml(t('Title'))}</label><input id="detail-title" value="${escapeHtml(item.title || '')}" maxlength="240">
                <label for="detail-tags">${escapeHtml(t('Tags'))}</label><input id="detail-tags" value="${escapeHtml(tags)}" maxlength="640">
                <label for="detail-rating">${escapeHtml(t('Rating'))}</label><select id="detail-rating"><option value="0">${escapeHtml(t('Unrated'))}</option>${[1, 2, 3, 4, 5].map((v) => `<option value="${v}" ${Number(item.rating) === v ? 'selected' : ''}>${escapeHtml(starRating(v))}</option>`).join('')}</select>
                <label for="detail-notes">${escapeHtml(t('Notes'))}</label><textarea id="detail-notes" maxlength="4000">${escapeHtml(item.notes || '')}</textarea>
                <div class="detail-actions"><button class="primary-button" type="button" id="detail-save"><i class="fa fa-floppy-disk"></i> ${escapeHtml(t('Save'))}</button><button class="secondary-button" type="button" id="detail-favorite"><i class="fa fa-star"></i> ${escapeHtml(item.favorite ? t('Unfavorite') : t('Favorite'))}</button></div>
            </div></section>
            <section class="detail-section"><h3>${escapeHtml(t('File'))}</h3><dl class="detail-grid"><dt>${escapeHtml(t('Name'))}</dt><dd>${escapeHtml(item.name || '')}</dd><dt>${escapeHtml(t('Date'))}</dt><dd>${escapeHtml(formatDate(item.date_key))}</dd><dt>${escapeHtml(t('Size'))}</dt><dd>${escapeHtml(formatBytes(item.size))}</dd><dt>${escapeHtml(t('Dimensions'))}</dt><dd>${item.width && item.height ? `${item.width} × ${item.height}` : '-'}</dd></dl></section>
            <section class="detail-section"><h3>${escapeHtml(t('Generation metadata'))}</h3><div class="metadata-block">${escapeHtml(JSON.stringify(metadata, null, 2))}</div></section>`;
        refs.detail.querySelector('#detail-save').addEventListener('click', () => saveDetail(item));
        refs.detail.querySelector('#detail-favorite').addEventListener('click', () => saveDetail(item, { favorite: !item.favorite }));
        refs.detail.querySelector('#detail-trash')?.addEventListener('click', () => trashItem(item.media_id));
        refs.detail.querySelector('#detail-restore')?.addEventListener('click', () => restoreItem(item.media_id));
        refs.detail.querySelector('#detail-purge')?.addEventListener('click', () => purgeItem(item.media_id));
        refs.detail.querySelector('#detail-viewer')?.addEventListener('click', () => openViewer(item));
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
            await request('/api/items/trash', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [mediaId] }) });
            removeItemFromState(mediaId);
            updateSelectionControls();
            await loadPage(true);
            loadDates();
            showToast(t('Moved to trash'));
        } catch (err) {
            showToast(t('Unable to delete media'), true);
        }
    }

    function removeItemFromState(mediaId) {
        state.items = state.items.filter((item) => item.media_id !== mediaId);
        state.itemById.delete(mediaId);
        state.selectedIds.delete(mediaId);
        state.selectedId = '';
        state.layout = null;
        state.renderedStart = -1;
        state.renderedEnd = -1;
        state.renderedKey = '';
        refs.drawer.setAttribute('aria-hidden', 'true');
        syncDetailLayout();
    }

    function toggleItemSelection(mediaId) {
        const id = String(mediaId || '');
        if (!id) return;
        if (state.selectedIds.has(id)) state.selectedIds.delete(id);
        else state.selectedIds.add(id);
        updateSelectionControls();
        renderWindow(true);
    }

    function clearSelection() {
        state.selectedIds.clear();
        updateSelectionControls();
        renderWindow(true);
    }

    function clearSelectionForQueryChange() {
        if (!state.selectedIds.size) return;
        state.selectedIds.clear();
        updateSelectionControls();
    }

    function toggleSelectionMode() {
        state.selectionMode = !state.selectionMode;
        if (!state.selectionMode) state.selectedIds.clear();
        updateSelectionControls();
        renderWindow(true);
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
            await request(actionConfig.path, {
                method: actionConfig.method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids })
            });
            ids.forEach((id) => removeItemFromState(id));
            state.selectedIds.clear();
            updateSelectionControls();
            await loadPage(true);
            loadDates();
            showToast(actionConfig.success);
        } catch (err) {
            showToast(actionConfig.error, true);
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
        state.selectedIds.clear();
        state.selectedId = '';
        refs.drawer.setAttribute('aria-hidden', 'true');
        syncDetailLayout();
        updateViewControls();
        refs.feedScroll.scrollTop = 0;
        await loadPage(true);
    }

    function closeDetail() {
        const scrollTop = refs.feedScroll ? refs.feedScroll.scrollTop : 0;
        state.selectedId = '';
        refs.drawer.setAttribute('aria-hidden', 'true');
        syncDetailLayout();
        renderWindow(true);
        if (refs.feedScroll) refs.feedScroll.scrollTop = scrollTop;
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

    function bindEvents() {
        refs.feed.addEventListener('click', (event) => {
            const selectButton = event.target.closest('.card-select');
            if (selectButton) {
                event.stopPropagation();
                const card = selectButton.closest('.media-card');
                if (card) toggleItemSelection(card.dataset.id);
                return;
            }
            const favoriteButton = event.target.closest('.card-favorite');
            if (favoriteButton) {
                event.stopPropagation();
                const card = favoriteButton.closest('.media-card');
                const item = card && state.itemById.get(card.dataset.id);
                if (item) toggleFavorite(item);
                return;
            }
            const card = event.target.closest('.media-card');
            if (card) {
                if (state.selectionMode) toggleItemSelection(card.dataset.id);
                else openDetail(card.dataset.id);
            }
        });
        refs.dateList.addEventListener('click', (event) => {
            const button = event.target.closest('.date-item');
            if (!button) return;
            const nextDate = button.dataset.date || '';
            state.date = state.date === nextDate ? '' : nextDate;
            clearSelectionForQueryChange();
            renderDates();
            refs.dateSidebar.classList.remove('is-open');
            loadPage(true);
            refs.feedScroll.scrollTop = 0;
        });
        refs.clearDate.addEventListener('click', () => {
            state.date = '';
            clearSelectionForQueryChange();
            renderDates();
            loadPage(true);
        });
        refs.closeDetail.addEventListener('click', closeDetail);
        refs.detailBackdrop?.addEventListener('click', closeDetail);
        refs.type.addEventListener('change', () => { state.mediaType = refs.type.value; clearSelectionForQueryChange(); loadPage(true); });
        refs.sort.addEventListener('change', () => { state.sort = refs.sort.value; clearSelectionForQueryChange(); loadPage(true); });
        refs.favoriteFilter.addEventListener('click', () => {
            state.favorite = state.favorite === true ? null : true;
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
        refs.purgeTrash?.addEventListener('click', () => emptyTrash());
        let searchTimer = 0;
        refs.search.addEventListener('input', () => {
            window.clearTimeout(searchTimer);
            searchTimer = window.setTimeout(() => { state.query = refs.search.value.trim(); clearSelectionForQueryChange(); loadPage(true); }, 240);
        });
        refs.refresh.addEventListener('click', async () => {
            try {
                await request('/api/rescan', { method: 'POST' });
                showToast(t('Rescan started'));
            } catch (err) {
                showToast(t('Unable to start rescan'), true);
            }
            window.setTimeout(() => { loadDates(); loadPage(true); }, 700);
        });
        refs.rescan.addEventListener('click', async () => {
            try {
                await request('/api/rescan', { method: 'POST' });
                showToast(t('Rescan started'));
                window.setTimeout(() => { loadDates(); loadPage(true); }, 800);
            } catch (err) { showToast(t('Unable to start rescan'), true); }
        });
        refs.datesToggle.addEventListener('click', () => refs.dateSidebar.classList.toggle('is-open'));
        refs.viewerClose.addEventListener('click', closeViewer);
        refs.viewerBackdrop.addEventListener('click', closeViewer);
        refs.viewerPrev.addEventListener('click', () => moveViewer(-1));
        refs.viewerNext.addEventListener('click', () => moveViewer(1));
        refs.viewerZoomOut.addEventListener('click', () => adjustViewerZoom(-.25));
        refs.viewerZoomIn.addEventListener('click', () => adjustViewerZoom(.25));
        refs.viewerZoomReset.addEventListener('click', () => { state.viewerZoom = 1; updateViewer(); });
        refs.viewerStage?.addEventListener('wheel', handleViewerWheel, { passive: false });
        document.addEventListener('keydown', handleViewerKeydown);
        refs.feedScroll.addEventListener('scroll', () => {
            window.requestAnimationFrame(() => {
                if (state.items.length > MAX_RENDERED) renderWindow(false);
                updateActiveDateFromViewport();
                maybeLoadMore();
            });
        }, { passive: true });
        window.addEventListener('resize', () => window.requestAnimationFrame(() => renderWindow(true)), { passive: true });
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
        await loadLocale();
        updateStaticTranslations();
        updateViewControls();
        bindEvents();
        await loadDates();
        await loadPage(true);
    }

    window.MediaLibraryPage = {
        state, init, loadPage, loadDates, renderWindow, openViewer, closeViewer,
        toggleSelectionMode, toggleItemSelection, clearSelection
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();
