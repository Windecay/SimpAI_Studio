(function () {
    'use strict';

    function hasContextMenuChildren(item) {
        return Array.isArray(item?.children) && item.children.length > 0;
    }

    function hasNestedContextMenuItems(items) {
        return Array.isArray(items) && items.some(item => hasContextMenuChildren(item));
    }

    function contextMenuItemByPath(items, path) {
        const parts = String(path || '').split('.').map(part => Number(part));
        let current = { children: items };
        for (const index of parts) {
            if (!Number.isInteger(index) || !Array.isArray(current.children)) return null;
            current = current.children[index];
            if (!current) return null;
        }
        return current;
    }

    function normalizeContextMenuSearchValue(value) {
        return String(value || '')
            .normalize('NFKC')
            .toLowerCase()
            .replace(/[^\p{L}\p{N}\u4e00-\u9fff]+/gu, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function compactContextMenuSearchValue(value) {
        return normalizeContextMenuSearchValue(value).replace(/\s+/g, '');
    }

    function contextMenuSearchTokens(query) {
        const normalized = normalizeContextMenuSearchValue(query);
        return normalized ? normalized.split(/\s+/).filter(Boolean) : [];
    }

    function isContextMenuSearchSubsequence(needle, haystack) {
        if (!needle) return true;
        if (!haystack || needle.length > haystack.length) return false;
        let cursor = 0;
        for (let index = 0; index < haystack.length && cursor < needle.length; index += 1) {
            if (haystack[index] === needle[cursor]) cursor += 1;
        }
        return cursor === needle.length;
    }

    function contextMenuSearchParts(item, ancestors) {
        const parts = [];
        (ancestors || []).forEach((ancestor) => {
            parts.push(ancestor?.label || '', ancestor?.search || '', ancestor?.keywords || '');
        });
        parts.push(item?.label || '', item?.search || '', item?.keywords || '');
        return parts.flatMap(part => Array.isArray(part) ? part : [part]).filter(part => String(part || '').trim());
    }

    function contextMenuItemMatchesTokens(item, tokens, ancestors) {
        if (!tokens.length) return true;
        const parts = contextMenuSearchParts(item, ancestors);
        const haystacks = parts.map(normalizeContextMenuSearchValue).filter(Boolean);
        const compactHaystacks = parts.map(compactContextMenuSearchValue).filter(Boolean);
        return tokens.every((token) => {
            const compactToken = compactContextMenuSearchValue(token);
            if (!compactToken) return true;
            return haystacks.some(haystack => haystack.includes(token))
                || compactHaystacks.some(haystack => haystack.includes(compactToken) || isContextMenuSearchSubsequence(compactToken, haystack));
        });
    }

    function collectContextMenuSearchResults(items, tokens, ancestors, parentPath, inheritedMatch) {
        const results = [];
        (items || []).forEach((item, index) => {
            if (!item || item.separator) return;
            if (item.searchOnly && !hasContextMenuChildren(item)) return;
            const path = parentPath ? `${parentPath}.${index}` : String(index);
            const ownMatch = inheritedMatch || contextMenuItemMatchesTokens(item, tokens, ancestors);
            if (hasContextMenuChildren(item)) {
                results.push(...collectContextMenuSearchResults(item.children, tokens, (ancestors || []).concat(item), path, ownMatch));
                return;
            }
            if (!ownMatch) return;
            const ancestorList = ancestors || [];
            const parent = ancestorList[ancestorList.length - 1];
            results.push(Object.assign({}, item, {
                __path: path,
                hint: parent?.label || ''
            }));
        });
        return results;
    }

    function createContextMenuTools(options) {
        const config = options || {};
        const escapeHtml = config.escapeHtml || ((value) => String(value ?? ''));
        const renderIconHtml = config.renderIconHtml || (() => '');
        const t = config.t || ((en, cn) => cn || en);

        function renderContextMenuItems(items, parentPath) {
            return (items || []).map((item, index) => {
                if (item?.searchOnly) return '';
                if (item?.separator) return '<div class="sai-canvas-context-menu-separator" role="separator"></div>';
                const path = item?.__path || (parentPath ? `${parentPath}.${index}` : String(index));
                const children = hasContextMenuChildren(item);
                const disabled = item?.disabled ? 'disabled' : '';
                const danger = item?.danger ? 'danger' : '';
                return `<div class="sai-canvas-context-menu-item ${children ? 'has-children' : ''}">
<button type="button" data-menu-path="${escapeHtml(path)}" class="${danger}" ${disabled} ${children ? 'aria-haspopup="menu" aria-expanded="false"' : ''}>
  ${renderIconHtml(item?.icon || 'fa-circle')}
  <span>${escapeHtml(item?.label || '')}</span>
  ${item?.hint ? `<small>${escapeHtml(item.hint)}</small>` : ''}
  ${children ? '<i class="fa-solid fa-chevron-right sai-context-submenu-arrow" aria-hidden="true"></i>' : ''}
</button>
${children ? `<div class="sai-canvas-context-submenu" role="menu">${renderContextMenuItems(item.children, path)}</div>` : ''}
</div>`;
            }).join('');
        }

        function renderContextMenuSearchResults(items, query) {
            const tokens = contextMenuSearchTokens(query);
            if (!tokens.length) return renderContextMenuItems(items, '');
            const results = collectContextMenuSearchResults(items, tokens, [], '', false);
            if (!results.length) {
                return `<div class="sai-canvas-context-menu-empty">${escapeHtml(t('No matching node or action.', '没有匹配的节点或操作。'))}</div>`;
            }
            return renderContextMenuItems(results, '');
        }

        return {
            renderContextMenuItems,
            renderContextMenuSearchResults
        };
    }

    function createContextMenuController(options) {
        const scope = options?.contextMenuSource || options || {};
        const languageSource = scope.languageSource || {};
        const utilitySource = scope.utilitySource || {};
        const domSource = scope.domSource || {};
        const viewportSource = scope.viewportSource || {};
        const timeSource = scope.timeSource || {};
        const runtimeSource = scope.runtimeSource || {};
        const viewSource = scope.viewSource || {};
        const t = typeof languageSource.t === 'function' ? languageSource.t : ((en, cn) => cn || en);
        const escapeHtml = typeof utilitySource.escapeHtml === 'function'
            ? utilitySource.escapeHtml
            : (value => String(value ?? ''));
        const clamp = typeof utilitySource.clamp === 'function'
            ? utilitySource.clamp
            : ((value, min, max) => Math.max(min, Math.min(max, value)));
        const renderIconHtml = typeof viewSource.renderIconHtml === 'function'
            ? viewSource.renderIconHtml
            : (() => '');
        const getContextMenu = () => typeof domSource.getContextMenu === 'function'
            ? domSource.getContextMenu()
            : null;
        const getDocument = () => typeof domSource.getDocument === 'function'
            ? domSource.getDocument()
            : null;
        const getWindow = () => typeof viewportSource.getWindow === 'function'
            ? viewportSource.getWindow()
            : null;
        const now = () => {
            const value = typeof timeSource.now === 'function' ? timeSource.now() : 0;
            return Number.isFinite(Number(value)) ? Number(value) : 0;
        };
        const schedule = (...args) => typeof runtimeSource.setTimeout === 'function'
            ? runtimeSource.setTimeout(...args)
            : undefined;
        const tools = createContextMenuTools({ escapeHtml, renderIconHtml, t });
        let menuAnchor = null;

        function positionContextSubmenu(itemElement) {
            const submenu = itemElement.querySelector(':scope > .sai-canvas-context-submenu');
            if (!submenu) return;
            const viewport = getWindow();
            const width = Number(viewport?.innerWidth) || 0;
            const height = Number(viewport?.innerHeight) || 0;
            const margin = 12;
            submenu.style.maxHeight = `${Math.max(0, height - margin * 2)}px`;
            submenu.style.right = 'auto';
            const parentRect = itemElement.getBoundingClientRect();
            const rect = submenu.getBoundingClientRect();
            const right = parentRect.right + 2;
            const left = parentRect.left - rect.width - 2;
            const flipped = right + rect.width > width - margin;
            itemElement.classList.toggle('is-submenu-flipped', flipped);
            submenu.style.left = `${clamp(flipped ? left : right, margin, Math.max(margin, width - rect.width - margin))}px`;
            submenu.style.top = `${clamp(parentRect.top - 6, margin, Math.max(margin, height - rect.height - margin))}px`;
        }

        function positionContextMenu() {
            const contextMenu = getContextMenu();
            if (!contextMenu || contextMenu.hidden || !menuAnchor) return;
            const viewport = getWindow();
            const width = Number(viewport?.innerWidth) || 0;
            const height = Number(viewport?.innerHeight) || 0;
            const margin = 12;
            contextMenu.style.maxHeight = `${Math.max(0, height - margin * 2)}px`;
            const rect = contextMenu.getBoundingClientRect();
            contextMenu.style.left = `${clamp(menuAnchor.x, margin, Math.max(margin, width - rect.width - margin))}px`;
            contextMenu.style.top = `${clamp(menuAnchor.y, margin, Math.max(margin, height - rect.height - margin))}px`;
            contextMenu.querySelectorAll('.sai-canvas-context-menu-item.has-children').forEach(itemElement => {
                if (itemElement.matches(':hover') || itemElement.contains(getDocument()?.activeElement)) {
                    positionContextSubmenu(itemElement);
                }
            });
        }

        function bindContextMenuActionButtons(items) {
            const contextMenu = getContextMenu();
            if (!contextMenu) return;
            contextMenu.querySelectorAll('[data-menu-path]').forEach((button) => {
                button.addEventListener('click', () => {
                    const item = contextMenuItemByPath(items, button.getAttribute('data-menu-path'));
                    if (hasContextMenuChildren(item)) return;
                    closeContextMenu();
                    if (item && typeof item.action === 'function') item.action();
                });
            });
            contextMenu.querySelectorAll('.sai-canvas-context-menu-item.has-children').forEach(itemElement => {
                itemElement.addEventListener('mouseenter', () => positionContextSubmenu(itemElement));
                itemElement.addEventListener('focusin', () => positionContextSubmenu(itemElement));
            });
        }

        function applyContextMenuSearchState(items, query, maxHeight) {
            const contextMenu = getContextMenu();
            if (!contextMenu) return;
            const searching = !!contextMenuSearchTokens(query).length;
            const hasSubmenus = !searching && hasNestedContextMenuItems(items);
            contextMenu.classList.toggle('has-submenus', hasSubmenus);
            contextMenu.classList.toggle('is-filtered', searching);
            contextMenu.style.maxHeight = `${maxHeight}px`;
            contextMenu.style.overflowY = 'auto';
            const resultsEl = contextMenu.querySelector('[data-context-menu-results]');
            if (resultsEl) {
                resultsEl.classList.toggle('is-filtered', searching);
                resultsEl.innerHTML = tools.renderContextMenuSearchResults(items, query);
            } else {
                contextMenu.innerHTML = tools.renderContextMenuSearchResults(items, query);
            }
            bindContextMenuActionButtons(items);
            positionContextMenu();
        }

        function closeContextMenuOnce(evt) {
            const contextMenu = getContextMenu();
            const openedAt = Number(contextMenu?.dataset?.openedAt || 0);
            const delay = Number(contextMenu?.dataset?.closeDelayMs || 180);
            if (openedAt && now() - openedAt < delay) return;
            if (contextMenu && contextMenu.contains(evt.target)) return;
            closeContextMenu();
        }

        function openContextMenu(x, y, items, closeDelayMs) {
            const contextMenu = getContextMenu();
            if (!contextMenu) return;
            const options = closeDelayMs && typeof closeDelayMs === 'object'
                ? closeDelayMs
                : { closeDelayMs };
            contextMenu.dataset.openedAt = String(now());
            contextMenu.dataset.closeDelayMs = String(options.closeDelayMs || 180);
            contextMenu.classList.toggle('is-searchable', !!options.searchable);
            const viewport = getWindow();
            const viewportWidth = Number(viewport?.innerWidth) || 0;
            const viewportHeight = Number(viewport?.innerHeight) || 0;
            menuAnchor = {
                x: Number.isFinite(Number(x)) ? Number(x) : 12,
                y: Number.isFinite(Number(y)) ? Number(y) : 12
            };
            contextMenu.classList.toggle('is-flipped', Number(x) > viewportWidth - 460);
            contextMenu.hidden = false;
            contextMenu.style.left = '0px';
            contextMenu.style.top = '0px';
            const margin = 12;
            const maxHeight = Math.max(0, viewportHeight - margin * 2);
            if (options.searchable) {
                contextMenu.innerHTML = `
<div class="sai-context-search-shell">
  <label class="sai-context-search">
    <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
    <input type="search" data-context-menu-search value="" placeholder="${escapeHtml(options.searchPlaceholder || t('Search...', '搜索...'))}" autocomplete="off" spellcheck="false">
  </label>
  <div class="sai-context-search-results" data-context-menu-results></div>
</div>`;
                applyContextMenuSearchState(items, '', maxHeight);
                const input = contextMenu.querySelector('[data-context-menu-search]');
                input?.addEventListener('input', () => applyContextMenuSearchState(items, input.value, maxHeight));
                input?.addEventListener('keydown', (evt) => {
                    if (evt.key === 'Escape') {
                        evt.preventDefault();
                        closeContextMenu();
                        return;
                    }
                    if (evt.key !== 'Enter') return;
                    const firstAction = contextMenu.querySelector('[data-context-menu-results] [data-menu-path]:not([disabled])');
                    if (!firstAction) return;
                    evt.preventDefault();
                    firstAction.click();
                });
                schedule(() => {
                    if (!contextMenu.hidden && input?.isConnected) input.focus({ preventScroll: true });
                }, 0);
            } else {
                applyContextMenuSearchState(items, '', maxHeight);
            }
            contextMenu.scrollTop = 0;
            positionContextMenu();
            viewport?.addEventListener?.('resize', positionContextMenu);
            contextMenu.addEventListener?.('scroll', positionContextMenu, true);
            schedule(() => {
                if (!contextMenu.hidden) getDocument()?.addEventListener('pointerdown', closeContextMenuOnce, true);
            }, 0);
        }

        function closeContextMenu() {
            const contextMenu = getContextMenu();
            if (!contextMenu) return;
            contextMenu.hidden = true;
            menuAnchor = null;
            getWindow()?.removeEventListener?.('resize', positionContextMenu);
            contextMenu.removeEventListener?.('scroll', positionContextMenu, true);
            getDocument()?.removeEventListener('pointerdown', closeContextMenuOnce, true);
        }

        return {
            bindContextMenuActionButtons,
            applyContextMenuSearchState,
            openContextMenu,
            closeContextMenuOnce,
            closeContextMenu
        };
    }

    window.SimpAICanvasWorkbenchContextMenu = Object.assign({}, window.SimpAICanvasWorkbenchContextMenu || {}, {
        hasContextMenuChildren,
        hasNestedContextMenuItems,
        contextMenuItemByPath,
        normalizeContextMenuSearchValue,
        compactContextMenuSearchValue,
        contextMenuSearchTokens,
        isContextMenuSearchSubsequence,
        contextMenuSearchParts,
        contextMenuItemMatchesTokens,
        collectContextMenuSearchResults,
        createContextMenuTools,
        createContextMenuController
    });
})();
