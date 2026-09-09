(function () {
    'use strict';

    function createCanvasDanbooruAutocompleteController(context) {
        const scope = context || {};
        const danbooruAutocomplete = typeof scope.danbooruAutocomplete === 'function' ? scope.danbooruAutocomplete : null;
        const getDocument = () => scope.document || (typeof document !== 'undefined' ? document : null);
        const getWindow = () => scope.window || (typeof window !== 'undefined' ? window : {});
        const getRoot = () => typeof scope.getRoot === 'function' ? scope.getRoot() : null;
        const escapeHtml = typeof scope.escapeHtml === 'function' ? scope.escapeHtml : value => String(value ?? '');
        const t = typeof scope.t === 'function' ? scope.t : ((en, cn) => cn || en);
        const maybeShowRuntimeNotice = typeof scope.maybeShowRuntimeNotice === 'function'
            ? scope.maybeShowRuntimeNotice
            : () => {};
        const dispatchTextControlInput = typeof scope.dispatchTextControlInput === 'function'
            ? scope.dispatchTextControlInput
            : () => {};
        const state = {
            field: null,
            token: null,
            items: [],
            selectedIndex: 0,
            requestId: 0,
            timer: 0,
            cache: new Map(),
            warmStarted: false
        };
        let dropdownEl = null;

        function shouldEnableDanbooruAutocomplete(key, target, options) {
            const opts = options || {};
            if (opts.disabled || opts.danbooruAutocomplete === false) return false;
            if (opts.danbooruAutocomplete === true || opts.tagCart === true) return true;
            const keyText = String(key || '').trim().toLowerCase();
            const targetText = String(target || '').trim().toLowerCase();
            if (!keyText && !targetText) return false;
            if (keyText.includes('system') || targetText.includes('translation-input')) return false;
            if (targetText === 'text-value') return true;
            if (['prompt', 'negative_prompt', 'inpaint_additional_prompt', 'exclude_tags', 'tags'].includes(keyText)) return true;
            if (keyText.endsWith('_prompt') || keyText.endsWith('_tags') || keyText.includes('tag')) return true;
            return false;
        }

        function danbooruAutocompleteAttrs(role) {
            return ` data-danbooru-autocomplete="${escapeHtml(role || 'prompt')}" autocomplete="off" spellcheck="false"`;
        }

        function danbooruAutocompleteFieldFromTarget(target) {
            const field = target?.closest?.('textarea[data-danbooru-autocomplete],input[data-danbooru-autocomplete]');
            if (!field || field.disabled || field.readOnly) return null;
            return field;
        }

        function danbooruAutocompleteToken(field) {
            if (!field || !('selectionStart' in field) || !('selectionEnd' in field)) return null;
            const startSel = Number(field.selectionStart || 0);
            const endSel = Number(field.selectionEnd || startSel);
            if (startSel !== endSel) return null;
            const value = String(field.value || '');
            const before = value.slice(0, startSel);
            const comma = before.lastIndexOf(',');
            const newline = before.lastIndexOf('\n');
            const semicolon = before.lastIndexOf(';');
            let start = Math.max(comma, newline, semicolon) + 1;
            while (start < startSel && /\s/.test(value[start])) start += 1;
            while (start < startSel && /[([{]/.test(value[start])) start += 1;
            while (start < startSel && /\s/.test(value[start])) start += 1;
            const query = value.slice(start, startSel).trim();
            const compact = query.replace(/\s+/g, '');
            if (!compact || /^(__|<)/.test(compact)) return null;
            if (compact.length < 2) return null;
            if (/[,;\n]/.test(query)) return null;
            return { start, end: startSel, query };
        }

        function ensureDanbooruAutocompleteDropdown() {
            if (dropdownEl && dropdownEl.isConnected) return dropdownEl;
            const doc = getDocument();
            if (!doc?.createElement) return null;
            dropdownEl = doc.createElement('div');
            dropdownEl.className = 'sai-danbooru-autocomplete';
            dropdownEl.hidden = true;
            dropdownEl.setAttribute('role', 'listbox');
            dropdownEl.addEventListener?.('pointerdown', (evt) => {
                const item = evt.target?.closest?.('[data-danbooru-autocomplete-index]');
                if (!item) return;
                evt.preventDefault();
                evt.stopPropagation();
                const index = Number(item.getAttribute('data-danbooru-autocomplete-index'));
                selectDanbooruAutocompleteItem(index);
                insertSelectedDanbooruAutocomplete();
            });
            dropdownEl.addEventListener?.('mousemove', (evt) => {
                const item = evt.target?.closest?.('[data-danbooru-autocomplete-index]');
                if (!item) return;
                selectDanbooruAutocompleteItem(Number(item.getAttribute('data-danbooru-autocomplete-index')));
            });
            (getRoot() || doc.body)?.appendChild?.(dropdownEl);
            return dropdownEl;
        }

        function hideDanbooruAutocomplete() {
            getWindow().clearTimeout?.(state.timer);
            state.timer = 0;
            state.field = null;
            state.token = null;
            state.items = [];
            state.selectedIndex = 0;
            if (dropdownEl) {
                dropdownEl.hidden = true;
                dropdownEl.classList.remove('is-visible');
                dropdownEl.innerHTML = '';
            }
        }

        function danbooruAutocompleteCaretPoint(field, position) {
            const doc = getDocument();
            const win = getWindow();
            if (!field || !doc?.body || typeof win.getComputedStyle !== 'function') return null;
            try {
                const rect = field.getBoundingClientRect();
                const style = win.getComputedStyle(field);
                const mirror = doc.createElement('div');
                const props = [
                    'boxSizing', 'width', 'height', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
                    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'fontFamily', 'fontSize', 'fontWeight',
                    'fontStyle', 'fontVariant', 'lineHeight', 'letterSpacing', 'wordSpacing', 'textTransform', 'textIndent',
                    'textAlign', 'tabSize'
                ];
                mirror.style.position = 'fixed';
                mirror.style.left = '-99999px';
                mirror.style.top = '0';
                mirror.style.visibility = 'hidden';
                mirror.style.whiteSpace = 'pre-wrap';
                mirror.style.wordBreak = 'break-word';
                mirror.style.overflow = 'hidden';
                props.forEach(prop => { mirror.style[prop] = style[prop]; });
                mirror.style.width = style.width;
                mirror.textContent = String(field.value || '').slice(0, Math.max(0, Number(position || 0)));
                const span = doc.createElement('span');
                span.textContent = String(field.value || '').slice(Math.max(0, Number(position || 0))) || '\u200b';
                mirror.appendChild(span);
                doc.body.appendChild(mirror);
                const scaleX = rect.width / Math.max(1, field.offsetWidth || rect.width);
                const scaleY = rect.height / Math.max(1, field.offsetHeight || rect.height);
                const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.25 || 16;
                const left = rect.left + Math.max(0, span.offsetLeft - field.scrollLeft) * scaleX;
                const top = rect.top + Math.max(0, span.offsetTop - field.scrollTop + lineHeight) * scaleY;
                mirror.remove?.();
                return { left, top, lineHeight: lineHeight * scaleY, fieldRect: rect };
            } catch (err) {
                return null;
            }
        }

        function positionDanbooruAutocompleteDropdown() {
            const field = state.field;
            const dropdown = dropdownEl;
            if (!field || !dropdown || dropdown.hidden || !field.isConnected) return;
            const win = getWindow();
            const rect = field.getBoundingClientRect();
            const token = state.token;
            const caret = token ? danbooruAutocompleteCaretPoint(field, token.end) : null;
            const pad = 10;
            const maxWidth = Math.max(280, Math.min(720, win.innerWidth - pad * 2));
            const width = Math.min(maxWidth, Math.max(320, rect.width));
            let left = Math.round(caret ? caret.left : rect.left);
            left = Math.max(pad, Math.min(left, win.innerWidth - width - pad));
            const anchorTop = caret ? caret.top : rect.bottom;
            const below = win.innerHeight - anchorTop - pad;
            const above = (caret ? caret.top - (caret.lineHeight || 16) : rect.top) - pad;
            const maxHeight = Math.max(140, Math.min(280, below >= 160 ? below : above));
            const top = below >= 160 || below >= above
                ? Math.round(anchorTop + 4)
                : Math.max(pad, Math.round((caret ? caret.top - (caret.lineHeight || 16) : rect.top) - maxHeight - 4));
            dropdown.style.left = `${left}px`;
            dropdown.style.top = `${top}px`;
            dropdown.style.width = `${Math.round(width)}px`;
            dropdown.style.maxHeight = `${Math.round(maxHeight)}px`;
        }

        function danbooruAutocompletePrimaryText(item) {
            return String(item?.display_text || item?.displayText || item?.tag || item?.value || '').trim();
        }

        function danbooruAutocompleteSecondaryText(item, primary) {
            const current = String(primary || '').trim();
            const secondary = String(item?.secondary_text || item?.secondaryText || '').trim();
            if (secondary && secondary !== current) return secondary;
            const translation = String(item?.translation || '').trim();
            if (translation && translation !== current) return translation;
            const tag = String(item?.tag || item?.value || '').trim();
            if (tag && tag !== current) return tag;
            return '';
        }

        function danbooruAutocompleteInsertText(item) {
            return String(item?.insert_text || item?.insertText || item?.completion || item?.value || item?.tag || '').trim();
        }

        function danbooruAutocompleteAppendSeparator(item) {
            return !(item?.append_separator === false || item?.appendSeparator === false);
        }

        function danbooruAutocompleteItemHtml(item, index) {
            const selected = index === state.selectedIndex ? ' is-selected' : '';
            const primary = danbooruAutocompletePrimaryText(item);
            const translation = danbooruAutocompleteSecondaryText(item, primary);
            const aliases = Array.isArray(item?.aliases) ? item.aliases.filter(Boolean).slice(0, 4).join(', ') : '';
            const meta = [
                item?.category || '',
                item?.group || '',
                item?.sub_group || '',
                Number(item?.count || 0) > 0 ? Number(item.count).toLocaleString() : ''
            ].filter(Boolean).join(' · ');
            return `<button type="button" class="sai-danbooru-autocomplete-item${selected}" data-danbooru-autocomplete-index="${index}" role="option" aria-selected="${selected ? 'true' : 'false'}">
            <span class="sai-danbooru-autocomplete-tag">${escapeHtml(primary)}</span>
            ${translation ? `<span class="sai-danbooru-autocomplete-translation">${escapeHtml(translation)}</span>` : ''}
            ${meta ? `<span class="sai-danbooru-autocomplete-meta">${escapeHtml(meta)}</span>` : ''}
            ${aliases ? `<span class="sai-danbooru-autocomplete-aliases">${escapeHtml(aliases)}</span>` : ''}
        </button>`;
        }

        function renderDanbooruAutocomplete(field, token, items) {
            if (!field || !token || !Array.isArray(items) || !items.length) {
                hideDanbooruAutocomplete();
                return;
            }
            state.field = field;
            state.token = token;
            state.items = items;
            state.selectedIndex = 0;
            const dropdown = ensureDanbooruAutocompleteDropdown();
            if (!dropdown) return;
            dropdown.innerHTML = items.map((item, index) => danbooruAutocompleteItemHtml(item, index)).join('');
            dropdown.hidden = false;
            dropdown.classList.add('is-visible');
            positionDanbooruAutocompleteDropdown();
        }

        function selectDanbooruAutocompleteItem(index) {
            const items = state.items || [];
            if (!items.length || !dropdownEl) return;
            const next = ((Number(index) || 0) + items.length) % items.length;
            state.selectedIndex = next;
            dropdownEl.querySelectorAll?.('[data-danbooru-autocomplete-index]')?.forEach((el) => {
                const selected = Number(el.getAttribute('data-danbooru-autocomplete-index')) === next;
                el.classList.toggle('is-selected', selected);
                el.setAttribute('aria-selected', selected ? 'true' : 'false');
                if (selected) el.scrollIntoView?.({ block: 'nearest' });
            });
        }

        function currentDanbooruAutocompleteCacheKey(token) {
            return `all:${String(token?.query || '').trim().toLowerCase()}:32`;
        }

        async function requestDanbooruAutocomplete(field, token) {
            if (!field || !token || typeof danbooruAutocomplete !== 'function') {
                hideDanbooruAutocomplete();
                return;
            }
            const cacheKey = currentDanbooruAutocompleteCacheKey(token);
            if (state.cache.has(cacheKey)) {
                renderDanbooruAutocomplete(field, token, state.cache.get(cacheKey));
                return;
            }
            const requestId = ++state.requestId;
            const response = await danbooruAutocomplete({
                query: token.query,
                tag_source: 'all',
                limit: 32
            });
            maybeShowRuntimeNotice(response);
            if (requestId !== state.requestId) return;
            const doc = getDocument();
            if (!field.isConnected || doc?.activeElement !== field) {
                hideDanbooruAutocomplete();
                return;
            }
            const items = response?.ok && Array.isArray(response.items) ? response.items : [];
            if (state.cache.size > 120) {
                const firstKey = state.cache.keys().next().value;
                if (firstKey) state.cache.delete(firstKey);
            }
            state.cache.set(cacheKey, items);
            renderDanbooruAutocomplete(field, token, items);
        }

        function warmDanbooruAutocompleteIndex() {
            if (state.warmStarted || typeof danbooruAutocomplete !== 'function') return;
            state.warmStarted = true;
            getWindow().setTimeout?.(() => {
                danbooruAutocomplete({ query: '1g', tag_source: 'all', limit: 32 })
                    .then((response) => {
                        if (response?.ok && Array.isArray(response.items)) state.cache.set('all:1g:32', response.items);
                    })
                    .catch(() => {});
            }, 900);
        }

        function scheduleDanbooruAutocomplete(field) {
            getWindow().clearTimeout?.(state.timer);
            const token = danbooruAutocompleteToken(field);
            if (!token) {
                hideDanbooruAutocomplete();
                return;
            }
            state.field = field;
            state.token = token;
            state.timer = getWindow().setTimeout?.(() => {
                requestDanbooruAutocomplete(field, token).catch(() => hideDanbooruAutocomplete());
            }, 45) || 0;
        }

        function handleDanbooruAutocompleteInput(evt) {
            const field = danbooruAutocompleteFieldFromTarget(evt.target);
            if (!field) return false;
            scheduleDanbooruAutocomplete(field);
            return false;
        }

        function onDanbooruAutocompleteFocusIn(evt) {
            const field = danbooruAutocompleteFieldFromTarget(evt.target);
            if (field) scheduleDanbooruAutocomplete(field);
        }

        function onDanbooruAutocompleteFocusOut(evt) {
            const field = state.field;
            if (!field || evt.target !== field) return;
            getWindow().setTimeout?.(() => {
                const doc = getDocument();
                if (doc?.activeElement !== field && !dropdownEl?.contains?.(doc?.activeElement)) hideDanbooruAutocomplete();
            }, 120);
        }

        function onDanbooruAutocompletePointerDown(evt) {
            if (dropdownEl?.contains?.(evt.target)) return;
            const field = danbooruAutocompleteFieldFromTarget(evt.target);
            if (field) return;
            if (state.field) hideDanbooruAutocomplete();
        }

        function onDanbooruAutocompleteKeyDown(evt) {
            if (!dropdownEl || dropdownEl.hidden) return;
            const field = state.field;
            if (!field || evt.target !== field) return;
            if (evt.key === 'ArrowDown') {
                evt.preventDefault();
                evt.stopPropagation();
                selectDanbooruAutocompleteItem(state.selectedIndex + 1);
            } else if (evt.key === 'ArrowUp') {
                evt.preventDefault();
                evt.stopPropagation();
                selectDanbooruAutocompleteItem(state.selectedIndex - 1);
            } else if (evt.key === 'Escape') {
                evt.preventDefault();
                evt.stopPropagation();
                hideDanbooruAutocomplete();
            } else if (evt.key === 'Tab') {
                evt.preventDefault();
                evt.stopPropagation();
                insertSelectedDanbooruAutocomplete();
            }
        }

        function insertSelectedDanbooruAutocomplete() {
            const field = state.field;
            const items = state.items || [];
            const item = items[state.selectedIndex];
            if (!field || !item) return false;
            const token = danbooruAutocompleteToken(field) || state.token;
            if (!token) return false;
            const value = String(field.value || '');
            const beforeChar = value.slice(Math.max(0, token.start - 1), token.start);
            const after = value.slice(token.end);
            const insideWeight = /[(\[]/.test(beforeChar) || /^\s*[:)\]}]/.test(after);
            const needsSeparator = !insideWeight && !/^\s*(,|;|\n)/.test(after);
            const insertText = danbooruAutocompleteInsertText(item);
            if (!insertText) return false;
            const replacement = `${insertText}${danbooruAutocompleteAppendSeparator(item) && needsSeparator ? ', ' : ''}`;
            field.focus?.({ preventScroll: true });
            if (typeof field.setRangeText === 'function') {
                field.setRangeText(replacement, token.start, token.end, 'end');
            } else {
                field.value = value.slice(0, token.start) + replacement + value.slice(token.end);
                const cursor = token.start + replacement.length;
                try { field.setSelectionRange(cursor, cursor); } catch (err) {}
            }
            dispatchTextControlInput(field, 'insertReplacementText', replacement);
            hideDanbooruAutocomplete();
            return true;
        }

        function hasActiveField() {
            return !!state.field;
        }

        return {
            shouldEnableDanbooruAutocomplete,
            danbooruAutocompleteAttrs,
            danbooruAutocompleteFieldFromTarget,
            danbooruAutocompleteToken,
            ensureDanbooruAutocompleteDropdown,
            hideDanbooruAutocomplete,
            positionDanbooruAutocompleteDropdown,
            danbooruAutocompletePrimaryText,
            danbooruAutocompleteSecondaryText,
            danbooruAutocompleteInsertText,
            danbooruAutocompleteAppendSeparator,
            danbooruAutocompleteItemHtml,
            renderDanbooruAutocomplete,
            selectDanbooruAutocompleteItem,
            currentDanbooruAutocompleteCacheKey,
            requestDanbooruAutocomplete,
            warmDanbooruAutocompleteIndex,
            scheduleDanbooruAutocomplete,
            handleDanbooruAutocompleteInput,
            onDanbooruAutocompleteFocusIn,
            onDanbooruAutocompleteFocusOut,
            onDanbooruAutocompletePointerDown,
            onDanbooruAutocompleteKeyDown,
            insertSelectedDanbooruAutocomplete,
            hasActiveField
        };
    }

    window.SimpAICanvasWorkbenchDanbooruAutocomplete = Object.assign({}, window.SimpAICanvasWorkbenchDanbooruAutocomplete || {}, {
        createCanvasDanbooruAutocompleteController
    });
})();
