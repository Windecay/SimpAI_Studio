(function () {
    'use strict';

    function createCanvasGroupRenderer(context) {
        const scope = context?.groupRendererSource || context || {};
        const domSource = scope.domSource || {};
        const groupSource = scope.groupSource || {};
        const projectSource = scope.projectSource || {};
        const geometrySource = scope.geometrySource || {};
        const patchSource = scope.patchSource || {};
        const utilitySource = scope.utilitySource || {};
        const languageSource = scope.languageSource || {};
        const selectionSource = scope.selectionSource || {};

        function call(source, name, fallback, ...args) {
            return typeof source?.[name] === 'function' ? source[name](...args) : fallback;
        }

        function getGroupRect(group) {
            return {
                x: Math.round(Number(group?.x || 0)),
                y: Math.round(Number(group?.y || 0)),
                w: Math.max(180, Math.round(Number(group?.w || 360))),
                h: Math.max(120, Math.round(Number(group?.h || 240)))
            };
        }

        function getNodeGroupMembershipRect(node) {
            const nodeRect = call(geometrySource, 'getNodeRect', null, node);
            if (!nodeRect) return null;
            const nodeEl = node?.id ? call(domSource, 'getRenderedNodeElement', null, node.id) : null;
            const head = nodeEl?.querySelector?.(':scope > .sai-node-head');
            const headHeight = Number(head?.offsetHeight || 0);
            return {
                x: nodeRect.x,
                y: nodeRect.y,
                w: nodeRect.w,
                h: Math.max(1, Math.min(nodeRect.h, headHeight || 44))
            };
        }

        function getNodesInsideGroup(group) {
            if (!group) return [];
            const rect = getGroupRect(group);
            const nodes = call(projectSource, 'getProject', {})?.nodes;
            if (!Array.isArray(nodes)) return [];
            return nodes.filter(node => call(utilitySource, 'rectsOverlap', false, getNodeGroupMembershipRect(node), rect, 0));
        }

        function selectedNodesBounds(padding) {
            const ids = call(selectionSource, 'getSelectedNodeIdList', []) || [];
            const rects = ids
                .map(id => call(projectSource, 'getNode', null, id))
                .map(node => call(geometrySource, 'getNodeRect', null, node))
                .filter(Boolean);
            if (!rects.length) return null;
            const pad = Number(padding ?? 48);
            const minX = Math.min(...rects.map(rect => rect.x));
            const minY = Math.min(...rects.map(rect => rect.y));
            const maxX = Math.max(...rects.map(rect => rect.x + rect.w));
            const maxY = Math.max(...rects.map(rect => rect.y + rect.h));
            return {
                x: Math.round(minX - pad),
                y: Math.round(minY - pad),
                w: Math.round(maxX - minX + pad * 2),
                h: Math.round(maxY - minY + pad * 2)
            };
        }

        function getGroupRect(group) {
            return {
                x: Math.round(Number(group?.x || 0)),
                y: Math.round(Number(group?.y || 0)),
                w: Math.max(180, Math.round(Number(group?.w || 360))),
                h: Math.max(120, Math.round(Number(group?.h || 240)))
            };
        }

        function getNodeGroupMembershipRect(node) {
            const nodeRect = call(geometrySource, 'getNodeRect', null, node);
            if (!nodeRect) return null;
            const nodeEl = node?.id ? call(domSource, 'getRenderedNodeElement', null, node.id) : null;
            const head = nodeEl?.querySelector?.(':scope > .sai-node-head');
            const headHeight = Number(head?.offsetHeight || 0);
            return {
                x: nodeRect.x,
                y: nodeRect.y,
                w: nodeRect.w,
                h: Math.max(1, Math.min(nodeRect.h, headHeight || 44))
            };
        }

        function getNodesInsideGroup(group) {
            if (!group) return [];
            const rect = getGroupRect(group);
            const nodes = call(projectSource, 'getProject', {})?.nodes;
            if (!Array.isArray(nodes)) return [];
            return nodes.filter(node => call(utilitySource, 'rectsOverlap', false, getNodeGroupMembershipRect(node), rect, 0));
        }

        function selectedNodesBounds(padding) {
            const ids = call(selectionSource, 'getSelectedNodeIdList', []) || [];
            const rects = ids
                .map(id => call(projectSource, 'getNode', null, id))
                .map(node => call(geometrySource, 'getNodeRect', null, node))
                .filter(Boolean);
            if (!rects.length) return null;
            const pad = Number(padding ?? 48);
            const minX = Math.min(...rects.map(rect => rect.x));
            const minY = Math.min(...rects.map(rect => rect.y));
            const maxX = Math.max(...rects.map(rect => rect.x + rect.w));
            const maxY = Math.max(...rects.map(rect => rect.y + rect.h));
            return {
                x: Math.round(minX - pad),
                y: Math.round(minY - pad),
                w: Math.round(maxX - minX + pad * 2),
                h: Math.round(maxY - minY + pad * 2)
            };
        }

        function groupShortcutLabel(group) {
            const key = String(group?.shortcut || '').trim();
            return key ? 'Alt+' + key : '';
        }

        function ensureGroupResizeHandle(groupEl, group) {
            if (!groupEl || !group) return;
            let handle = groupEl.querySelector('[data-group-resize-handle]');
            if (!handle) {
                const document = call(domSource, 'getDocument', null);
                if (!document) return;
                handle = document.createElement('button');
                handle.type = 'button';
                handle.className = 'sai-canvas-resize-handle sai-group-resize-handle';
                handle.setAttribute('data-group-resize-handle', '');
                groupEl.appendChild(handle);
            }
            const label = call(languageSource, 't', 'Resize group', 'Resize group', '调整分组大小');
            handle.setAttribute('title', label);
            handle.setAttribute('aria-label', label);
            handle.hidden = !!group.locked;
        }

        function renderGroups() {
            const groupsLayer = call(domSource, 'getGroupsLayer', null);
            if (!groupsLayer) return;
            const groups = call(groupSource, 'ensureProjectGroups', []) || [];
            const liveIds = new Set(groups.map(group => group.id));
            groupsLayer.querySelectorAll('[data-group-id]').forEach(groupEl => {
                if (!liveIds.has(groupEl.getAttribute('data-group-id'))) groupEl.remove();
            });
            groups.forEach(group => {
                Object.assign(group, call(patchSource, 'buildGroupIdPatch', {}, group));
                const rect = getGroupRect(group);
                if (!rect) return;
                Object.assign(group, call(patchSource, 'buildGroupFieldPatch', {}, group, 'x', rect.x));
                Object.assign(group, call(patchSource, 'buildGroupFieldPatch', {}, group, 'y', rect.y));
                Object.assign(group, call(patchSource, 'buildGroupFieldPatch', {}, group, 'w', rect.w));
                Object.assign(group, call(patchSource, 'buildGroupFieldPatch', {}, group, 'h', rect.h));
                const color = call(utilitySource, 'normalizeCanvasColor', '#14b8a6', group.color, '#14b8a6');
                Object.assign(group, call(patchSource, 'buildGroupFieldPatch', {}, group, 'color', color));
                const alpha = call(utilitySource, 'clamp', Number(group.alpha ?? 0.16), Number(group.alpha ?? 0.16), 0.04, 0.72);
                Object.assign(group, call(patchSource, 'buildGroupFieldPatch', {}, group, 'alpha', alpha));
                const cssEscape = call(utilitySource, 'cssEscape', String(group.id), group.id);
                let groupEl = groupsLayer.querySelector('[data-group-id="' + cssEscape + '"]');
                if (!groupEl) {
                    const document = call(domSource, 'getDocument', null);
                    if (!document) return;
                    groupEl = document.createElement('div');
                    groupEl.dataset.groupId = group.id;
                    groupsLayer.appendChild(groupEl);
                }
                const groupTitle = group.title || call(languageSource, 't', 'Group', 'Group', '分组');
                const resizeLabel = call(languageSource, 't', 'Resize group', 'Resize group', '调整分组大小');
                const renderKey = JSON.stringify({
                    title: groupTitle,
                    shortcut: group.shortcut || '',
                    locked: !!group.locked,
                    resizeLabel
                });
                groupEl.className = 'sai-canvas-group';
                groupEl.classList.toggle('is-selected', group.id === call(projectSource, 'getSelectedGroupId', null));
                groupEl.classList.toggle('is-locked', !!group.locked);
                groupEl.style.left = rect.x + 'px';
                groupEl.style.top = rect.y + 'px';
                groupEl.style.width = rect.w + 'px';
                groupEl.style.height = rect.h + 'px';
                groupEl.style.setProperty('--sai-group-color', group.color);
                groupEl.style.setProperty('--sai-group-alpha', String(group.alpha));
                if (groupEl.__simpaiRenderKey !== renderKey) {
                    const escapeHtml = value => call(utilitySource, 'escapeHtml', String(value), value);
                    const shortcut = groupShortcutLabel(group);
                    const title = escapeHtml(groupTitle);
                    const html = [
                        '<div class="sai-canvas-group-fill"></div>',
                        '<div class="sai-canvas-group-head" data-group-drag-handle>',
                        '  <span>' + title + '</span>',
                        shortcut ? '  <b>' + escapeHtml(shortcut) + '</b>' : '',
                        group.locked ? '  <i class="fa-solid fa-lock"></i>' : '',
                        '</div>',
                        '<button type="button" class="sai-canvas-resize-handle sai-group-resize-handle" data-group-resize-handle title="' + escapeHtml(resizeLabel) + '" aria-label="' + escapeHtml(call(languageSource, 't', 'Resize group', 'Resize group', '调整分组大小')) + '"></button>'
                    ].filter(Boolean);
                    groupEl.innerHTML = html.join('\n');
                    groupEl.__simpaiRenderKey = renderKey;
                }
                ensureGroupResizeHandle(groupEl, group);
            });
        }

        function updateGroupPositionDom(groupId) {
            const group = call(groupSource, 'getGroup', null, groupId);
            const groupsLayer = call(domSource, 'getGroupsLayer', null);
            if (!group || !groupsLayer) return;
            const cssEscape = call(utilitySource, 'cssEscape', String(groupId || ''), groupId || '');
            const groupEl = groupsLayer.querySelector('[data-group-id="' + cssEscape + '"]');
            if (!groupEl) return;
            const rect = getGroupRect(group);
            if (!rect) return;
            groupEl.style.left = rect.x + 'px';
            groupEl.style.top = rect.y + 'px';
            groupEl.style.width = rect.w + 'px';
            groupEl.style.height = rect.h + 'px';
        }

        return {
            groupShortcutLabel,
            getGroupRect,
            getNodeGroupMembershipRect,
            getNodesInsideGroup,
            selectedNodesBounds,
            renderGroups,
            ensureGroupResizeHandle,
            updateGroupPositionDom
        };
    }

    window.SimpAICanvasWorkbenchGroupRenderer = Object.assign({}, window.SimpAICanvasWorkbenchGroupRenderer || {}, {
        createCanvasGroupRenderer
    });
})();
