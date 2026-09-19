(function () {
    'use strict';

    const FALLBACK_ROOT_IDS = [
        'positive_prompt',
        'negative_prompt',
        'inpaint_additional_prompt',
        'inpaint_mask_dino_prompt_text',
        'sam3_prompt_text',
        'enhance_prompt',
        'enhance_negative_prompt',
        'enhance_mask_dino_prompt_text'
    ];
    const FALLBACK_ROOT_SELECTOR = FALLBACK_ROOT_IDS.map(id => `#${id}`).join(',');
    const UNDERSCORE_REPLACEMENT_EXCLUSIONS = '0_0,(o)_(o),+_+,+_-,._.,<o>_<o>,<|>_<|>,=_=,>_<,3_3,6_9,>_o,@_@,^_^,o_o,u_u,x_x,|_|,||_||';
    const state = {
        dropdown: null,
        field: null,
        token: null,
        items: [],
        selectedIndex: 0,
        requestId: 0,
        activeController: null,
        timer: 0,
        cache: new Map(),
        warmStarted: false,
        boundRoots: new WeakSet(),
        runtimeNoticeKey: ''
    };

    function appRoot() {
        try {
            return typeof gradioApp === 'function' ? gradioApp() : document;
        } catch (err) {
            return document;
        }
    }

    function currentActiveElement() {
        const root = appRoot();
        return root?.activeElement || document.activeElement;
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function isTextField(field) {
        if (!field || field.disabled || field.readOnly) return false;
        const tag = String(field.tagName || '').toLowerCase();
        if (tag === 'textarea') return true;
        if (tag !== 'input') return false;
        const type = String(field.type || 'text').toLowerCase();
        return type === 'text' || type === 'search' || type === '';
    }

    function fallbackMatchesField(field) {
        const root = appRoot();
        if (field.closest?.(FALLBACK_ROOT_SELECTOR)) return true;
        let node = field;
        let depth = 0;
        while (node && node !== root && node !== document && depth < 8) {
            const id = String(node.id || '').toLowerCase();
            if (id) {
                if (FALLBACK_ROOT_IDS.includes(id)) return true;
                if (/enhance_mask_dino_prompt_text|inpaint_mask_dino_prompt_text/.test(id)) return true;
            }
            node = node.parentElement;
            depth += 1;
        }
        return false;
    }

    function fieldFromTarget(target) {
        const field = target?.closest?.('textarea,input');
        if (!isTextField(field)) return null;
        if (field.closest?.('.sai-webui-danbooru-autocomplete')) return null;
        if (field.closest?.('.danbooru-autocomplete-input') || fallbackMatchesField(field)) return field;
        return null;
    }

    function tokenForField(field) {
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

    function ensureDropdown() {
        if (state.dropdown && state.dropdown.isConnected) return state.dropdown;
        const el = document.createElement('div');
        el.className = 'sai-webui-danbooru-autocomplete';
        el.hidden = true;
        el.setAttribute('role', 'listbox');
        el.addEventListener('pointerdown', (evt) => {
            const item = evt.target.closest?.('[data-webui-danbooru-autocomplete-index]');
            if (!item) return;
            evt.preventDefault();
            evt.stopPropagation();
            selectItem(Number(item.getAttribute('data-webui-danbooru-autocomplete-index')));
            insertSelected();
        });
        el.addEventListener('mousemove', (evt) => {
            const item = evt.target.closest?.('[data-webui-danbooru-autocomplete-index]');
            if (item) selectItem(Number(item.getAttribute('data-webui-danbooru-autocomplete-index')));
        });
        document.body.appendChild(el);
        state.dropdown = el;
        return el;
    }

    function runtimeUiLang() {
        try {
            const lang = window.SimpAII18n?.getUiLang?.(window.simpleaiTopbarSystemParams || {}) || document.documentElement.lang || navigator.language || '';
            return String(lang || '').toLowerCase();
        } catch (err) {
            return '';
        }
    }

    function runtimeStatusMessage(status) {
        if (!status || typeof status !== 'object') return '';
        const message = String(status.message || '').trim();
        const messageCn = String(status.message_cn || status.messageCn || '').trim();
        const lang = runtimeUiLang();
        return lang === 'en' || lang.startsWith('en-') ? (message || messageCn) : (messageCn || message);
    }

    function showRuntimeNotice(message, level) {
        if (!message) return;
        let toast = document.querySelector('.sai-webui-danbooru-runtime-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.className = 'sai-webui-danbooru-runtime-toast';
            toast.setAttribute('role', 'status');
            toast.setAttribute('aria-live', 'polite');
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.dataset.level = level || 'info';
        toast.hidden = false;
        window.clearTimeout(showRuntimeNotice._timer);
        showRuntimeNotice._timer = window.setTimeout(() => {
            if (toast) toast.hidden = true;
        }, level === 'warning' ? 5200 : 3600);
    }

    function maybeShowRuntimeNotice(response) {
        const status = response?.runtime_status || response?.runtimeStatus;
        if (!status || typeof status !== 'object') return;
        const runtimeState = String(status.state || '').toLowerCase();
        const level = String(status.level || '').toLowerCase();
        const shouldShow = level === 'warning' || (runtimeState === 'ready' && status.auto_build === true);
        if (!shouldShow) return;
        const message = runtimeStatusMessage(status);
        if (!message) return;
        const key = `${runtimeState}|${level}|${message}`;
        if (state.runtimeNoticeKey === key) return;
        state.runtimeNoticeKey = key;
        showRuntimeNotice(message, level);
    }

    function cancelActiveRequest() {
        state.requestId += 1;
        const controller = state.activeController;
        state.activeController = null;
        if (controller && !controller.signal.aborted) controller.abort();
    }

    function hideDropdown() {
        window.clearTimeout(state.timer);
        state.timer = 0;
        cancelActiveRequest();
        state.field = null;
        state.token = null;
        state.items = [];
        state.selectedIndex = 0;
        if (state.dropdown) {
            state.dropdown.hidden = true;
            state.dropdown.classList.remove('is-visible');
            state.dropdown.innerHTML = '';
        }
    }

    function caretPoint(field, position) {
        try {
            const rect = field.getBoundingClientRect();
            const style = window.getComputedStyle(field);
            const mirror = document.createElement('div');
            const props = [
                'boxSizing', 'width', 'height', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
                'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'fontFamily', 'fontSize', 'fontWeight',
                'fontStyle', 'fontVariant', 'lineHeight', 'letterSpacing', 'wordSpacing', 'textTransform', 'textIndent',
                'textAlign', 'tabSize'
            ];
            props.forEach(prop => { mirror.style[prop] = style[prop]; });
            mirror.style.position = 'fixed';
            mirror.style.left = '-99999px';
            mirror.style.top = '0';
            mirror.style.visibility = 'hidden';
            mirror.style.whiteSpace = field.tagName === 'TEXTAREA' ? 'pre-wrap' : 'pre';
            mirror.style.wordBreak = 'break-word';
            mirror.style.overflow = 'hidden';
            mirror.style.width = style.width;
            mirror.textContent = String(field.value || '').slice(0, Math.max(0, Number(position || 0)));
            const span = document.createElement('span');
            span.textContent = String(field.value || '').slice(Math.max(0, Number(position || 0))) || '\u200b';
            mirror.appendChild(span);
            document.body.appendChild(mirror);
            const scaleX = rect.width / Math.max(1, field.offsetWidth || rect.width);
            const scaleY = rect.height / Math.max(1, field.offsetHeight || rect.height);
            const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.25 || 16;
            const left = rect.left + Math.max(0, span.offsetLeft - field.scrollLeft) * scaleX;
            const top = rect.top + Math.max(0, span.offsetTop - field.scrollTop + lineHeight) * scaleY;
            mirror.remove();
            return { left, top, lineHeight: lineHeight * scaleY };
        } catch (err) {
            return null;
        }
    }

    function positionDropdown() {
        const field = state.field;
        const dropdown = state.dropdown;
        if (!field || !dropdown || dropdown.hidden || !field.isConnected) return;
        const rect = field.getBoundingClientRect();
        const caret = state.token ? caretPoint(field, state.token.end) : null;
        const pad = 10;
        const maxWidth = Math.max(280, Math.min(560, window.innerWidth - pad * 2));
        const width = Math.min(maxWidth, Math.max(320, Math.min(rect.width, 560)));
        let left = Math.round(caret ? caret.left : rect.left);
        left = Math.max(pad, Math.min(left, window.innerWidth - width - pad));
        const anchorTop = caret ? caret.top : rect.bottom;
        const below = window.innerHeight - anchorTop - pad;
        const above = (caret ? caret.top - (caret.lineHeight || 16) : rect.top) - pad;
        const maxHeight = Math.max(150, Math.min(320, below >= 170 ? below : above));
        const top = below >= 170 || below >= above
            ? Math.round(anchorTop + 4)
            : Math.max(pad, Math.round((caret ? caret.top - (caret.lineHeight || 16) : rect.top) - maxHeight - 4));
        dropdown.style.left = `${left}px`;
        dropdown.style.top = `${top}px`;
        dropdown.style.width = `${Math.round(width)}px`;
        dropdown.style.maxHeight = `${Math.round(maxHeight)}px`;
    }

    function itemPrimaryText(item) {
        return String(item?.display_text || item?.displayText || item?.tag || item?.value || '').trim();
    }

    function itemSecondaryText(item, primary) {
        const current = String(primary || '').trim();
        const secondary = String(item?.secondary_text || item?.secondaryText || '').trim();
        if (secondary && secondary !== current) return secondary;
        const translation = String(item?.translation || '').trim();
        if (translation && translation !== current) return translation;
        const tag = String(item?.tag || item?.value || '').trim();
        if (tag && tag !== current) return tag;
        return '';
    }

    function underscoreReplacementEnabled() {
        const input = typeof getGradioCheckboxById === 'function'
            ? getGradioCheckboxById('forge_neo_setting_tac_replaceUnderscores')
            : appRoot()?.querySelector?.('#forge_neo_setting_tac_replaceUnderscores input[type="checkbox"]');
        return input ? !!input.checked : true;
    }

    function underscoreReplacementExclusions() {
        const root = typeof getGradioRootById === 'function'
            ? getGradioRootById('forge_neo_setting_tac_undersocreReplacementExclusionList')
            : appRoot()?.querySelector?.('#forge_neo_setting_tac_undersocreReplacementExclusionList');
        const field = root?.querySelector?.('textarea,input');
        const value = String(field?.value || UNDERSCORE_REPLACEMENT_EXCLUSIONS);
        return new Set(value.split(',').map(part => part.trim()).filter(Boolean));
    }

    function itemInsertText(item) {
        const value = String(item?.insert_text || item?.insertText || item?.completion || item?.value || item?.tag || '').trim();
        const completionKind = String(item?.completion_kind || item?.completionKind || '').toLowerCase();
        if (!value || completionKind === 'translation' || !underscoreReplacementEnabled()) return value;
        return underscoreReplacementExclusions().has(value) ? value : value.replace(/_/g, ' ');
    }

    function itemAppendSeparator(item) {
        return !(item?.append_separator === false || item?.appendSeparator === false);
    }

    function itemHtml(item, index) {
        const selected = index === state.selectedIndex ? ' is-selected' : '';
        const primary = itemPrimaryText(item);
        const translation = itemSecondaryText(item, primary);
        const aliases = Array.isArray(item?.aliases) ? item.aliases.filter(Boolean).slice(0, 4).join(', ') : '';
        const meta = [
            item?.category || '',
            item?.group || '',
            item?.sub_group || '',
            Number(item?.count || 0) > 0 ? Number(item.count).toLocaleString() : ''
        ].filter(Boolean).join(' · ');
        return `<button type="button" class="sai-webui-danbooru-autocomplete-item${selected}" data-webui-danbooru-autocomplete-index="${index}" role="option" aria-selected="${selected ? 'true' : 'false'}">
            <span class="sai-webui-danbooru-autocomplete-tag">${escapeHtml(primary)}</span>
            ${translation ? `<span class="sai-webui-danbooru-autocomplete-translation">${escapeHtml(translation)}</span>` : ''}
            ${meta ? `<span class="sai-webui-danbooru-autocomplete-meta">${escapeHtml(meta)}</span>` : ''}
            ${aliases ? `<span class="sai-webui-danbooru-autocomplete-aliases">${escapeHtml(aliases)}</span>` : ''}
        </button>`;
    }

    function renderDropdown(field, token, items) {
        if (!field || !token || !Array.isArray(items) || !items.length) {
            hideDropdown();
            return;
        }
        state.field = field;
        state.token = token;
        state.items = items;
        state.selectedIndex = 0;
        const dropdown = ensureDropdown();
        dropdown.innerHTML = items.map((item, index) => itemHtml(item, index)).join('');
        dropdown.hidden = false;
        dropdown.classList.add('is-visible');
        positionDropdown();
    }

    function selectItem(index) {
        const items = state.items || [];
        if (!items.length || !state.dropdown) return;
        const next = ((Number(index) || 0) + items.length) % items.length;
        state.selectedIndex = next;
        state.dropdown.querySelectorAll('[data-webui-danbooru-autocomplete-index]').forEach((el) => {
            const selected = Number(el.getAttribute('data-webui-danbooru-autocomplete-index')) === next;
            el.classList.toggle('is-selected', selected);
            el.setAttribute('aria-selected', selected ? 'true' : 'false');
            if (selected) el.scrollIntoView({ block: 'nearest' });
        });
    }

    function cacheKey(token) {
        return `all:${String(token?.query || '').trim().toLowerCase()}:32`;
    }

    async function requestAutocomplete(field, token) {
        if (!field || !token || !field.isConnected || currentActiveElement() !== field) {
            hideDropdown();
            return;
        }
        const key = cacheKey(token);
        if (state.cache.has(key)) {
            renderDropdown(field, token, state.cache.get(key));
            return;
        }
        const requestId = ++state.requestId;
        const controller = new AbortController();
        state.activeController = controller;
        const api = window.SimpAICanvasWorkbenchApi;
        let response;
        try {
            response = api && typeof api.danbooruAutocomplete === 'function'
                ? await api.danbooruAutocomplete(
                    { query: token.query, tag_source: 'all', limit: 32 },
                    { signal: controller.signal }
                )
                : await fetch('/canvas-workbench/danbooru-autocomplete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query: token.query, tag_source: 'all', limit: 32 }),
                    signal: controller.signal
                }).then(r => r.json());
        } catch (err) {
            if (err?.name === 'AbortError' || requestId !== state.requestId) return;
            hideDropdown();
            return;
        } finally {
            if (state.activeController === controller) state.activeController = null;
        }
        if (requestId !== state.requestId) return;
        if (response?.aborted) return;
        if (!field.isConnected || currentActiveElement() !== field) {
            hideDropdown();
            return;
        }
        maybeShowRuntimeNotice(response);
        const items = response?.ok && Array.isArray(response.items) ? response.items : [];
        if (state.cache.size > 140) {
            const first = state.cache.keys().next().value;
            if (first) state.cache.delete(first);
        }
        state.cache.set(key, items);
        renderDropdown(field, token, items);
    }

    function schedule(field) {
        window.clearTimeout(state.timer);
        cancelActiveRequest();
        const token = tokenForField(field);
        if (!token) {
            hideDropdown();
            return;
        }
        state.field = field;
        state.token = token;
        state.timer = window.setTimeout(() => {
            requestAutocomplete(field, token).catch(() => hideDropdown());
        }, 180);
    }

    function dispatchInput(field, inputType, data) {
        try {
            field.dispatchEvent(new InputEvent('input', {
                bubbles: true,
                cancelable: false,
                inputType: inputType || 'insertReplacementText',
                data: data == null ? null : String(data)
            }));
        } catch (err) {
            field.dispatchEvent(new Event('input', { bubbles: true }));
        }
        field.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function insertSelected() {
        const field = state.field;
        const item = state.items[state.selectedIndex];
        if (!field || !item) return false;
        const token = tokenForField(field) || state.token;
        if (!token) return false;
        const value = String(field.value || '');
        const beforeChar = value.slice(Math.max(0, token.start - 1), token.start);
        const after = value.slice(token.end);
        const insideWeight = /[(\[]/.test(beforeChar) || /^\s*[:)\]}]/.test(after);
        const needsSeparator = !insideWeight && !/^\s*(,|;|\n)/.test(after);
        const insertText = itemInsertText(item);
        if (!insertText) return false;
        const replacement = `${insertText}${itemAppendSeparator(item) && needsSeparator ? ', ' : ''}`;
        field.focus?.({ preventScroll: true });
        if (typeof field.setRangeText === 'function') {
            field.setRangeText(replacement, token.start, token.end, 'end');
        } else {
            field.value = value.slice(0, token.start) + replacement + value.slice(token.end);
            const cursor = token.start + replacement.length;
            try { field.setSelectionRange(cursor, cursor); } catch (err) {}
        }
        dispatchInput(field, 'insertReplacementText', replacement);
        hideDropdown();
        return true;
    }

    function onInput(evt) {
        const field = fieldFromTarget(evt.target);
        if (field && !evt.isComposing) schedule(field);
    }

    function onCompositionEnd(evt) {
        const field = fieldFromTarget(evt.target);
        if (field) schedule(field);
    }

    function onFocusIn(evt) {
        const field = fieldFromTarget(evt.target);
        if (field) schedule(field);
    }

    function onFocusOut(evt) {
        if (!state.field || evt.target !== state.field) return;
        window.setTimeout(() => {
            const active = currentActiveElement();
            if (active !== state.field && !state.dropdown?.contains?.(active)) {
                hideDropdown();
            }
        }, 120);
    }

    function onPointerDown(evt) {
        if (state.dropdown?.contains?.(evt.target)) return;
        if (fieldFromTarget(evt.target)) return;
        if (state.field) hideDropdown();
    }

    function onKeyDown(evt) {
        if (!state.dropdown || state.dropdown.hidden) return;
        const field = state.field;
        if (!field || evt.target !== field) return;
        if (evt.key === 'ArrowDown') {
            evt.preventDefault();
            evt.stopPropagation();
            selectItem(state.selectedIndex + 1);
        } else if (evt.key === 'ArrowUp') {
            evt.preventDefault();
            evt.stopPropagation();
            selectItem(state.selectedIndex - 1);
        } else if (evt.key === 'Escape') {
            evt.preventDefault();
            evt.stopPropagation();
            hideDropdown();
        } else if (evt.key === 'Tab') {
            evt.preventDefault();
            evt.stopPropagation();
            insertSelected();
        }
    }

    function bindRoot(root) {
        if (!root || state.boundRoots.has(root)) return;
        state.boundRoots.add(root);
        root.addEventListener('input', onInput, true);
        root.addEventListener('compositionend', onCompositionEnd, true);
        root.addEventListener('focusin', onFocusIn, true);
        root.addEventListener('focusout', onFocusOut, true);
        root.addEventListener('keydown', onKeyDown, true);
        root.addEventListener('pointerdown', onPointerDown, true);
        root.addEventListener('scroll', () => {
            if (state.field) positionDropdown();
        }, true);
    }

    function warmIndex() {
        if (state.warmStarted) return;
        state.warmStarted = true;
        window.setTimeout(() => {
            const api = window.SimpAICanvasWorkbenchApi;
            const payload = { query: '1g', tag_source: 'all', limit: 32 };
            const request = api && typeof api.danbooruAutocomplete === 'function'
                ? api.danbooruAutocomplete(payload)
                : fetch('/canvas-workbench/danbooru-autocomplete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                }).then(response => response.json());
            request
                .then((response) => {
                    if (response?.ok && Array.isArray(response.items)) {
                        state.cache.set('all:1g:32', response.items);
                    }
                })
                .catch(() => {});
        }, 1200);
    }

    function init() {
        bindRoot(appRoot());
        warmIndex();
    }

    if (typeof onUiLoaded === 'function') onUiLoaded(init);
    if (typeof onAfterUiUpdate === 'function') onAfterUiUpdate(init);
    document.addEventListener('DOMContentLoaded', () => window.setTimeout(init, 500));
    window.addEventListener('resize', () => {
        if (state.field) positionDropdown();
    });
})();
