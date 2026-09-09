(function () {
    'use strict';

    function createCanvasPreviewSelectController(context) {
        const scope = context || {};
        const getDocument = () => scope.document || (typeof document !== 'undefined' ? document : null);
        const getWindow = () => scope.window || (typeof window !== 'undefined' ? window : { innerWidth: 0, innerHeight: 0 });
        const getRoot = () => typeof scope.getRoot === 'function' ? scope.getRoot() : null;
        const escapeHtml = typeof scope.escapeHtml === 'function' ? scope.escapeHtml : value => String(value ?? '');
        const breakablePreviewText = typeof scope.breakablePreviewText === 'function'
            ? scope.breakablePreviewText
            : value => escapeHtml(value);
        const hideHoverPreview = typeof scope.hideHoverPreview === 'function' ? scope.hideHoverPreview : () => {};
        const EventCtor = scope.Event || (typeof Event !== 'undefined' ? Event : null);
        let previewSelectMenuEl = null;
        let previewSelectAnchor = null;

        function previewSelectElementFromTarget(target) {
            const select = target?.closest?.('select[data-model-preview-param],select[data-model-preview-lora-index]');
            if (!select || select.disabled) return null;
            return select;
        }

        function ensurePreviewSelectMenu() {
            if (previewSelectMenuEl && previewSelectMenuEl.isConnected) return previewSelectMenuEl;
            const doc = getDocument();
            if (!doc?.createElement) return null;
            previewSelectMenuEl = doc.createElement('div');
            previewSelectMenuEl.className = 'sai-preview-select-menu';
            previewSelectMenuEl.hidden = true;
            previewSelectMenuEl.setAttribute('role', 'listbox');
            (getRoot() || doc.body)?.appendChild?.(previewSelectMenuEl);
            return previewSelectMenuEl;
        }

        function previewSelectNodeId(select) {
            return select?.closest?.('[data-node-id]')?.getAttribute('data-node-id') || '';
        }

        function previewSelectOptionAttrs(select, value) {
            const nodeId = previewSelectNodeId(select);
            const param = select.getAttribute('data-model-preview-param');
            const loraIndex = select.getAttribute('data-model-preview-lora-index');
            const kind = loraIndex !== null ? 'lora' : 'model';
            const parts = [
                `data-hover-preview-kind="${kind}"`,
                `data-preview-node-id="${escapeHtml(nodeId)}"`,
                `data-preview-option-value="${escapeHtml(value)}"`
            ];
            if (param) parts.push(`data-model-preview-param="${escapeHtml(param)}"`);
            if (loraIndex !== null) parts.push(`data-model-preview-lora-index="${escapeHtml(loraIndex)}"`);
            return parts.join(' ');
        }

        function positionPreviewSelectMenu(select) {
            if (!previewSelectMenuEl || previewSelectMenuEl.hidden || !select) return;
            const pad = 10;
            const rect = select.getBoundingClientRect();
            const menuRect = previewSelectMenuEl.getBoundingClientRect();
            const viewport = getWindow();
            const width = Math.max(rect.width, Math.min(420, Math.round(viewport.innerWidth - pad * 2)));
            let left = rect.left;
            let top = rect.bottom + 4;
            if (left + width + pad > viewport.innerWidth) left = Math.max(pad, viewport.innerWidth - width - pad);
            if (top + menuRect.height + pad > viewport.innerHeight) {
                top = Math.max(pad, rect.top - menuRect.height - 4);
            }
            previewSelectMenuEl.style.width = `${Math.round(width)}px`;
            previewSelectMenuEl.style.left = `${Math.round(left)}px`;
            previewSelectMenuEl.style.top = `${Math.round(top)}px`;
        }

        function openPreviewSelectMenu(select) {
            if (!select) return;
            const menu = ensurePreviewSelectMenu();
            if (!menu) return;
            previewSelectAnchor = select;
            const selectedValue = String(select.value || '');
            const options = Array.from(select.options || []);
            menu.innerHTML = options.map((option) => {
                const value = String(option.value || option.textContent || '');
                const selected = value === selectedValue;
                return `<button type="button" class="sai-preview-select-option${selected ? ' is-selected' : ''}" role="option" aria-selected="${selected ? 'true' : 'false'}" data-preview-select-value="${escapeHtml(value)}" ${previewSelectOptionAttrs(select, value)}><span>${breakablePreviewText(option.textContent || value)}</span>${selected ? '<i class="fa-solid fa-check" aria-hidden="true"></i>' : ''}</button>`;
            }).join('');
            menu.hidden = false;
            menu.classList.add('is-open');
            positionPreviewSelectMenu(select);
            const selectedButton = menu.querySelector('.sai-preview-select-option.is-selected') || menu.querySelector('.sai-preview-select-option');
            if (selectedButton) {
                selectedButton.scrollIntoView?.({ block: 'nearest' });
                selectedButton.focus?.({ preventScroll: true });
            }
        }

        function closePreviewSelectMenu() {
            previewSelectAnchor = null;
            if (previewSelectMenuEl) {
                previewSelectMenuEl.hidden = true;
                previewSelectMenuEl.classList.remove('is-open');
                previewSelectMenuEl.innerHTML = '';
            }
            hideHoverPreview();
        }

        function isPreviewSelectMenuOpen() {
            return !!(previewSelectMenuEl && !previewSelectMenuEl.hidden);
        }

        function previewSelectMenuContains(target) {
            return !!previewSelectMenuEl?.contains?.(target);
        }

        function applyPreviewSelectOption(option) {
            if (!option || !previewSelectAnchor) return;
            const anchor = previewSelectAnchor;
            const value = option.getAttribute('data-preview-select-value') || '';
            if (anchor.value !== value) {
                anchor.value = value;
                if (typeof EventCtor === 'function') {
                    anchor.dispatchEvent(new EventCtor('input', { bubbles: true }));
                    anchor.dispatchEvent(new EventCtor('change', { bubbles: true }));
                }
            }
            closePreviewSelectMenu();
            anchor.focus?.();
        }

        function movePreviewSelectFocus(delta) {
            const doc = getDocument();
            const options = Array.from(previewSelectMenuEl?.querySelectorAll?.('.sai-preview-select-option') || []);
            if (!options.length) return;
            const active = doc?.activeElement;
            const current = Math.max(0, options.indexOf(active));
            const next = options[(current + delta + options.length) % options.length];
            next?.focus?.({ preventScroll: true });
            next?.scrollIntoView?.({ block: 'nearest' });
        }

        function onPreviewSelectPointerDown(evt) {
            const menuOption = evt.target?.closest?.('.sai-preview-select-option[data-preview-select-value]');
            if (menuOption && previewSelectMenuEl?.contains?.(menuOption)) {
                evt.preventDefault();
                evt.stopPropagation();
                applyPreviewSelectOption(menuOption);
                return;
            }
            const select = previewSelectElementFromTarget(evt.target);
            if (select) {
                evt.preventDefault();
                evt.stopPropagation();
                if (previewSelectAnchor === select && previewSelectMenuEl && !previewSelectMenuEl.hidden) {
                    closePreviewSelectMenu();
                } else {
                    openPreviewSelectMenu(select);
                }
                return;
            }
            if (previewSelectMenuEl && !previewSelectMenuEl.hidden && !previewSelectMenuEl.contains?.(evt.target)) {
                closePreviewSelectMenu();
            }
        }

        function onPreviewSelectKeyDown(evt) {
            if (previewSelectMenuEl && !previewSelectMenuEl.hidden) {
                if (evt.key === 'Escape') {
                    evt.preventDefault();
                    closePreviewSelectMenu();
                    return;
                }
                if (evt.key === 'ArrowDown' || evt.key === 'ArrowUp') {
                    evt.preventDefault();
                    movePreviewSelectFocus(evt.key === 'ArrowDown' ? 1 : -1);
                    return;
                }
                if (evt.key === 'Enter' || evt.key === ' ') {
                    const option = getDocument()?.activeElement?.closest?.('.sai-preview-select-option[data-preview-select-value]');
                    if (option && previewSelectMenuEl.contains?.(option)) {
                        evt.preventDefault();
                        applyPreviewSelectOption(option);
                        return;
                    }
                }
            }
            const select = previewSelectElementFromTarget(evt.target);
            if (!select) return;
            if (evt.key === 'Enter' || evt.key === ' ' || evt.key === 'ArrowDown') {
                evt.preventDefault();
                openPreviewSelectMenu(select);
            }
        }

        return {
            previewSelectElementFromTarget,
            ensurePreviewSelectMenu,
            previewSelectNodeId,
            previewSelectOptionAttrs,
            positionPreviewSelectMenu,
            openPreviewSelectMenu,
            closePreviewSelectMenu,
            isPreviewSelectMenuOpen,
            previewSelectMenuContains,
            applyPreviewSelectOption,
            movePreviewSelectFocus,
            onPreviewSelectPointerDown,
            onPreviewSelectKeyDown
        };
    }

    window.SimpAICanvasWorkbenchPreviewSelect = Object.assign({}, window.SimpAICanvasWorkbenchPreviewSelect || {}, {
        createCanvasPreviewSelectController
    });
})();
