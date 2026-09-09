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
        const config = options || {};
        const getContextMenu = config.getContextMenu || (() => null);
        const clamp = config.clamp || ((value, min, max) => Math.max(min, Math.min(max, value)));
        const tools = createContextMenuTools(config);
        const escapeHtml = config.escapeHtml || ((value) => String(value ?? ''));
        const t = config.t || ((en, cn) => cn || en);

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
        }

        function applyContextMenuSearchState(items, query, maxHeight) {
            const contextMenu = getContextMenu();
            if (!contextMenu) return;
            const searching = !!contextMenuSearchTokens(query).length;
            const hasSubmenus = !searching && hasNestedContextMenuItems(items);
            contextMenu.classList.toggle('has-submenus', hasSubmenus);
            contextMenu.classList.toggle('is-filtered', searching);
            contextMenu.style.maxHeight = hasSubmenus ? '' : `${maxHeight}px`;
            contextMenu.style.overflowY = hasSubmenus ? 'visible' : 'auto';
            const resultsEl = contextMenu.querySelector('[data-context-menu-results]');
            if (resultsEl) {
                resultsEl.classList.toggle('is-filtered', searching);
                resultsEl.innerHTML = tools.renderContextMenuSearchResults(items, query);
            } else {
                contextMenu.innerHTML = tools.renderContextMenuSearchResults(items, query);
            }
            bindContextMenuActionButtons(items);
        }

        function closeContextMenuOnce(evt) {
            const contextMenu = getContextMenu();
            const openedAt = Number(contextMenu?.dataset?.openedAt || 0);
            const delay = Number(contextMenu?.dataset?.closeDelayMs || 180);
            if (openedAt && Date.now() - openedAt < delay) return;
            if (contextMenu && contextMenu.contains(evt.target)) return;
            closeContextMenu();
        }

        function openContextMenu(x, y, items, closeDelayMs) {
            const contextMenu = getContextMenu();
            if (!contextMenu) return;
            const options = closeDelayMs && typeof closeDelayMs === 'object'
                ? closeDelayMs
                : { closeDelayMs };
            contextMenu.dataset.openedAt = String(Date.now());
            contextMenu.dataset.closeDelayMs = String(options.closeDelayMs || 180);
            contextMenu.classList.toggle('is-searchable', !!options.searchable);
            contextMenu.classList.toggle('is-flipped', Number(x) > window.innerWidth - 460);
            contextMenu.hidden = false;
            contextMenu.style.left = '0px';
            contextMenu.style.top = '0px';
            const margin = 12;
            const maxHeight = Math.max(140, window.innerHeight - margin * 2);
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
                window.setTimeout(() => {
                    if (!contextMenu.hidden && input?.isConnected) input.focus({ preventScroll: true });
                }, 0);
            } else {
                applyContextMenuSearchState(items, '', maxHeight);
            }
            contextMenu.scrollTop = 0;
            const rect = contextMenu.getBoundingClientRect();
            const leftMax = Math.max(margin, window.innerWidth - (rect.width || 220) - margin);
            const topMax = Math.max(margin, window.innerHeight - Math.min(rect.height || maxHeight, maxHeight) - margin);
            const targetX = Number.isFinite(Number(x)) ? Number(x) : margin;
            const targetY = Number.isFinite(Number(y)) ? Number(y) : margin;
            contextMenu.style.left = `${clamp(targetX, margin, leftMax)}px`;
            contextMenu.style.top = `${clamp(targetY, margin, topMax)}px`;
            window.setTimeout(() => {
                document.addEventListener('pointerdown', closeContextMenuOnce, true);
            }, 0);
        }

        function closeContextMenu() {
            const contextMenu = getContextMenu();
            if (!contextMenu) return;
            contextMenu.hidden = true;
            document.removeEventListener('pointerdown', closeContextMenuOnce, true);
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
