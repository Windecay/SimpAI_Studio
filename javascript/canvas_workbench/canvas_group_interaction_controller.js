(function () {
    'use strict';

    function createCanvasGroupInteractionController(context) {
        const scope = context || {};
        const sourceObject = (name) => {
            const value = scope[name];
            return value && typeof value === 'object' ? value : {};
        };
        const languageSource = sourceObject('languageSource');
        const languageCall = (name, fallback, ...args) => typeof languageSource[name] === 'function'
            ? languageSource[name](...args)
            : fallback;
        const getLanguageState = (...args) => languageCall('getLanguageState', { __lang: 'en' }, ...args);
        const t = (...args) => {
            const en = args[0] || '';
            const cn = args.length > 1 ? args[1] : en;
            const state = args.length > 2 ? args[2] : getLanguageState();
            return languageCall('t', cn || en, en, cn, state);
        };
        const projectSource = sourceObject('projectSource');
        const projectCall = (name, fallback, ...args) => typeof projectSource[name] === 'function'
            ? projectSource[name](...args)
            : fallback;
        const domSource = sourceObject('domSource');
        const domCall = (name, fallback, ...args) => typeof domSource[name] === 'function'
            ? domSource[name](...args)
            : fallback;
        const groupSource = sourceObject('groupSource');
        const groupCall = (name, fallback, ...args) => typeof groupSource[name] === 'function'
            ? groupSource[name](...args)
            : fallback;
        const nodeSource = sourceObject('nodeSource');
        const nodeCall = (name, fallback, ...args) => typeof nodeSource[name] === 'function'
            ? nodeSource[name](...args)
            : fallback;
        const selectionSource = sourceObject('selectionSource');
        const selectionCall = (name, fallback, ...args) => typeof selectionSource[name] === 'function'
            ? selectionSource[name](...args)
            : fallback;
        const layoutSource = sourceObject('layoutSource');
        const layoutCall = (name, fallback, ...args) => typeof layoutSource[name] === 'function'
            ? layoutSource[name](...args)
            : fallback;
        const patchSource = sourceObject('patchSource');
        const patchCall = (name, fallback, ...args) => typeof patchSource[name] === 'function'
            ? patchSource[name](...args)
            : fallback;
        const viewportSource = sourceObject('viewportSource');
        const viewportCall = (name, fallback, ...args) => typeof viewportSource[name] === 'function'
            ? viewportSource[name](...args)
            : fallback;
        const renderSource = sourceObject('renderSource');
        const renderCall = (name, fallback, ...args) => typeof renderSource[name] === 'function'
            ? renderSource[name](...args)
            : fallback;
        const minimapSource = sourceObject('minimapSource');
        const minimapCall = (name, fallback, ...args) => typeof minimapSource[name] === 'function'
            ? minimapSource[name](...args)
            : fallback;
        const actionSource = sourceObject('actionSource');
        const actionCall = (name, fallback, ...args) => typeof actionSource[name] === 'function'
            ? actionSource[name](...args)
            : fallback;
        const historySource = sourceObject('historySource');
        const historyCall = (name, fallback, ...args) => typeof historySource[name] === 'function'
            ? historySource[name](...args)
            : fallback;
        const persistenceSource = sourceObject('persistenceSource');
        const persistenceCall = (name, fallback, ...args) => typeof persistenceSource[name] === 'function'
            ? persistenceSource[name](...args)
            : fallback;
        const uiSource = sourceObject('uiSource');
        const uiCall = (name, fallback, ...args) => typeof uiSource[name] === 'function'
            ? uiSource[name](...args)
            : fallback;
        const getProject = () => projectCall('getProject', {}) || {};
        const getGroupsLayer = () => domCall('getGroupsLayer', null);
        const getDocument = () => typeof domSource.getDocument === 'function'
            ? domSource.getDocument()
            : null;
        const getGroup = (id) => groupCall('getGroup', null, id);
        const getNode = (id) => nodeCall('getNode', null, id);
        const getNodesInsideGroup = (group) => groupCall('getNodesInsideGroup', [], group) || [];
        const isNodeLocked = (node) => !!nodeCall('isNodeLocked', false, node);
        const getSelectedGroupId = () => groupCall('getSelectedGroupId', null);
        const showToast = (message) => {
            uiCall('showToast', undefined, message);
        };
        const applyNodeLayoutPatch = (node, options) => {
            const patch = layoutCall('buildNodeLayoutPatch', undefined, node, options || {});
            if (patch && typeof patch === 'object') Object.assign(node, patch);
        };
        const applyGroupFieldPatch = (group, key, value) => {
            const patch = patchCall('buildGroupFieldPatch', undefined, group, key, value);
            if (patch && typeof patch === 'object') Object.assign(group, patch);
        };
        const snapCanvasCoord = (value) => viewportCall('snapCanvasCoord', value, value);
        const snapCanvasSizeFromOrigin = (origin, value, min, max) => viewportCall(
            'snapCanvasSizeFromOrigin', value, origin, value, min, max
        );
        let groupDragState = null;
        let groupResizeState = null;

        function selectGroupLight(groupId) {
            selectionCall('selectGroupLight', undefined, groupId);
        }

        function openGroupContextMenu(group, clientX, clientY) {
            actionCall('openGroupContextMenu', undefined, group, clientX, clientY);
        }

        function startGroupDrag(group, evt) {
            if (!group || group.locked) {
                showToast(t('Group position is locked.', '分组位置已锁定。'));
                return;
            }
            const insideNodes = getNodesInsideGroup(group).filter(node => !isNodeLocked(node));
            try { evt.target?.setPointerCapture?.(evt.pointerId); } catch (err) {}
            groupDragState = {
                pointerId: evt.pointerId,
                groupId: group.id,
                historyPushed: false,
                startClientX: evt.clientX,
                startClientY: evt.clientY,
                startX: group.x || 0,
                startY: group.y || 0,
                nodes: insideNodes.map(node => ({ id: node.id, x: node.x || 0, y: node.y || 0 }))
            };
            renderCall('beginDragEdgeLod', undefined);
            const doc = getDocument();
            doc?.addEventListener('pointermove', onGroupDragMove, true);
            doc?.addEventListener('pointerup', stopGroupDrag, true);
            doc?.addEventListener('pointercancel', stopGroupDrag, true);
        }

        function startGroupResize(group, evt) {
            if (!group || group.locked) {
                showToast(t('Group position is locked.', '分组位置已锁定。'));
                return;
            }
            groupResizeState = {
                groupId: group.id,
                pointerId: evt.pointerId,
                startClientX: evt.clientX,
                startClientY: evt.clientY,
                startX: Number(group.x || 0),
                startY: Number(group.y || 0),
                startW: Number(group.w || 360),
                startH: Number(group.h || 240),
                historyPushed: false
            };
            evt.target?.setPointerCapture?.(evt.pointerId);
            const doc = getDocument();
            doc?.addEventListener('pointermove', onGroupResizeMove, true);
            doc?.addEventListener('pointerup', stopGroupResize, true);
            doc?.addEventListener('pointercancel', stopGroupResize, true);
        }

        function onGroupResizeMove(evt) {
            if (!groupResizeState || evt.pointerId !== groupResizeState.pointerId) return;
            const group = getGroup(groupResizeState.groupId);
            if (!group) return;
            evt.preventDefault();
            const project = getProject();
            const zoom = project.viewport?.zoom || 1;
            const rawW = Math.max(180, Math.round(groupResizeState.startW + (evt.clientX - groupResizeState.startClientX) / zoom));
            const rawH = Math.max(120, Math.round(groupResizeState.startH + (evt.clientY - groupResizeState.startClientY) / zoom));
            const nextW = project.settings?.snap
                ? snapCanvasSizeFromOrigin(groupResizeState.startX, rawW, 180, Number.POSITIVE_INFINITY)
                : rawW;
            const nextH = project.settings?.snap
                ? snapCanvasSizeFromOrigin(groupResizeState.startY, rawH, 120, Number.POSITIVE_INFINITY)
                : rawH;
            if (!groupResizeState.historyPushed && (Math.abs(nextW - groupResizeState.startW) > 1 || Math.abs(nextH - groupResizeState.startH) > 1)) {
                historyCall('pushHistory', undefined, 'Resize area group');
                groupResizeState.historyPushed = true;
            }
            applyGroupFieldPatch(group, 'w', nextW);
            applyGroupFieldPatch(group, 'h', nextH);
            renderCall('updateGroupPositionDom', undefined, group.id);
            minimapCall('invalidateMinimapStaticCache', undefined);
            minimapCall('invalidateNodeSpatialIndex', undefined);
            minimapCall('scheduleMinimapRender', undefined);
        }

        function stopGroupResize(evt) {
            if (!groupResizeState) return;
            if (evt && evt.pointerId !== groupResizeState.pointerId) return;
            groupResizeState = null;
            const doc = getDocument();
            doc?.removeEventListener('pointermove', onGroupResizeMove, true);
            doc?.removeEventListener('pointerup', stopGroupResize, true);
            doc?.removeEventListener('pointercancel', stopGroupResize, true);
            persistenceCall('scheduleSave', undefined);
            minimapCall('flushMinimapRender', undefined);
            if (getSelectedGroupId()) renderCall('renderInspector', undefined);
        }

        function onGroupDragMove(evt) {
            if (!groupDragState || evt.pointerId !== groupDragState.pointerId) return;
            evt.preventDefault();
            const group = getGroup(groupDragState.groupId);
            if (!group) return;
            const project = getProject();
            const zoom = project.viewport?.zoom || 1;
            let nextX = groupDragState.startX + (evt.clientX - groupDragState.startClientX) / zoom;
            let nextY = groupDragState.startY + (evt.clientY - groupDragState.startClientY) / zoom;
            if (project.settings?.snap) {
                nextX = snapCanvasCoord(nextX);
                nextY = snapCanvasCoord(nextY);
            }
            const dx = Math.round(nextX) - groupDragState.startX;
            const dy = Math.round(nextY) - groupDragState.startY;
            if (!groupDragState.historyPushed && (Math.abs(dx) > 1 || Math.abs(dy) > 1)) {
                historyCall('pushHistory', undefined, 'Move area group');
                groupDragState.historyPushed = true;
            }
            applyGroupFieldPatch(group, 'x', groupDragState.startX + dx);
            applyGroupFieldPatch(group, 'y', groupDragState.startY + dy);
            groupDragState.nodes.forEach((item) => {
                const node = getNode(item.id);
                if (!node) return;
                applyNodeLayoutPatch(node, {
                    x: Math.round(item.x + dx),
                    y: Math.round(item.y + dy)
                });
            });
            renderCall('updateGroupPositionDom', undefined, group.id);
            const nodeIds = groupDragState.nodes.map(item => item.id);
            renderCall('updateNodePositionDom', undefined, nodeIds);
            renderCall('scheduleInteractiveLinkRender', undefined, { nodeIds });
            minimapCall('invalidateMinimapStaticCache', undefined);
            minimapCall('invalidateNodeSpatialIndex', undefined);
            minimapCall('scheduleMinimapRender', undefined);
        }

        function stopGroupDrag(evt) {
            if (!groupDragState) return;
            if (evt && evt.pointerId !== groupDragState.pointerId) return;
            const useDragEdgeLod = !!renderCall('isDragEdgeLodActive', false);
            groupDragState = null;
            const doc = getDocument();
            doc?.removeEventListener('pointermove', onGroupDragMove, true);
            doc?.removeEventListener('pointerup', stopGroupDrag, true);
            doc?.removeEventListener('pointercancel', stopGroupDrag, true);
            persistenceCall('scheduleSave', undefined);
            if (useDragEdgeLod) renderCall('scheduleDragEdgeSettleRender', undefined);
            else renderCall('flushInteractiveLinkRender', undefined);
            minimapCall('flushMinimapRender', undefined);
            renderCall('renderInspector', undefined);
        }

        function bindGroupLayerEvents() {
            const groupsLayer = getGroupsLayer();
            if (!groupsLayer || groupsLayer.__simpaiGroupEventsBound) return;
            groupsLayer.__simpaiGroupEventsBound = true;
            groupsLayer.addEventListener('pointerdown', (evt) => {
                const target = evt.target;
                const resizeHandle = target?.closest?.('[data-group-resize-handle]');
                if (resizeHandle) {
                    if (evt.button !== 0) return;
                    const groupEl = target.closest('[data-group-id]');
                    const group = groupEl ? getGroup(groupEl.getAttribute('data-group-id')) : null;
                    if (!group) return;
                    evt.preventDefault();
                    evt.stopPropagation();
                    selectGroupLight(group.id);
                    startGroupResize(group, evt);
                    return;
                }
                const handle = target?.closest?.('[data-group-drag-handle]');
                const groupEl = target?.closest?.('[data-group-id]');
                if (!handle || !groupEl || evt.button !== 0) return;
                const group = getGroup(groupEl.getAttribute('data-group-id'));
                if (!group) return;
                evt.preventDefault();
                evt.stopPropagation();
                selectGroupLight(group.id);
                startGroupDrag(group, evt);
            });
            groupsLayer.addEventListener('click', (evt) => {
                const groupEl = evt.target?.closest?.('[data-group-id]');
                if (!groupEl) return;
                evt.preventDefault();
                evt.stopPropagation();
                selectGroupLight(groupEl.getAttribute('data-group-id'));
            });
            groupsLayer.addEventListener('contextmenu', (evt) => {
                const groupEl = evt.target?.closest?.('[data-group-id]');
                if (!groupEl) return;
                evt.preventDefault();
                evt.stopPropagation();
                const group = getGroup(groupEl.getAttribute('data-group-id'));
                if (group) openGroupContextMenu(group, evt.clientX, evt.clientY);
            });
        }

        return {
            bindGroupLayerEvents,
            isGroupDragging: () => !!groupDragState,
            isGroupResizing: () => !!groupResizeState
        };
    }

    window.SimpAICanvasWorkbenchGroupInteraction = Object.assign({}, window.SimpAICanvasWorkbenchGroupInteraction || {}, {
        createCanvasGroupInteractionController
    });
})();
