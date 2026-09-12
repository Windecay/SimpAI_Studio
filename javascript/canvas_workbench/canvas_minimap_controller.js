(function () {
    'use strict';

    function createCanvasMinimapController(context) {
        const scope = context || {};
        const getProject = () => typeof scope.getProject === 'function' ? (scope.getProject() || {}) : {};
        const getElement = () => typeof scope.getMinimapElement === 'function' ? scope.getMinimapElement() : null;
        const getViewport = () => typeof scope.getViewport === 'function' ? scope.getViewport() : null;
        const getDocument = () => typeof scope.getDocument === 'function' ? scope.getDocument() : (typeof document !== 'undefined' ? document : null);
        const getVisibleWorldRect = () => typeof scope.getVisibleWorldRect === 'function' ? scope.getVisibleWorldRect() : null;
        const getNodeRect = (node) => typeof scope.getNodeRect === 'function' ? scope.getNodeRect(node) : { x: node?.x || 0, y: node?.y || 0, w: node?.w || 1, h: node?.h || 1 };
        const getGroupRect = (group) => typeof scope.getGroupRect === 'function' ? scope.getGroupRect(group) : { x: group?.x || 0, y: group?.y || 0, w: group?.w || 1, h: group?.h || 1 };
        const ensureProjectGroups = () => typeof scope.ensureProjectGroups === 'function' ? scope.ensureProjectGroups() : (Array.isArray(getProject().groups) ? getProject().groups : []);
        const getPerformanceNow = () => typeof scope.performanceNow === 'function'
            ? scope.performanceNow()
            : (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now());
        const getPerfStats = () => typeof scope.getPerfStats === 'function' ? scope.getPerfStats() : {};
        const escapeHtml = typeof scope.escapeHtml === 'function' ? scope.escapeHtml : (value) => String(value ?? '');
        const clamp = typeof scope.clamp === 'function' ? scope.clamp : (value, min, max) => Math.max(min, Math.min(max, value));
        const getWindow = () => typeof scope.getWindow === 'function' ? (scope.getWindow() || {}) : (typeof window !== 'undefined' ? window : {});
        const getMinimapBoundsFromViewport = (items, visible) => {
            const bounds = typeof scope.getMinimapBounds === 'function'
                ? scope.getMinimapBounds(items, visible)
                : null;
            return bounds || { minX: 0, minY: 0, maxX: 1, maxY: 1, width: 1, height: 1 };
        };
        const hasCanvasOverflow = (items, visible) => typeof scope.hasCanvasOverflow === 'function'
            ? !!scope.hasCanvasOverflow(items, visible)
            : false;
        const getNodeColor = (node) => typeof scope.nodeCustomColor === 'function' ? scope.nodeCustomColor(node) : '';
        const expandHex = (value, fallback) => typeof scope.expandCanvasHexColor === 'function'
            ? scope.expandCanvasHexColor(value, fallback)
            : (value || fallback);
        const defaultNodeSize = (type) => typeof scope.defaultNodeSize === 'function' ? scope.defaultNodeSize(type) : { w: 160, h: 120 };
        const getNodeLayoutSize = (node) => typeof scope.getNodeLayoutSize === 'function' ? scope.getNodeLayoutSize(node) : getNodeRect(node);
        const setTimeoutFn = (...args) => typeof scope.setTimeout === 'function' ? scope.setTimeout(...args) : getWindow().setTimeout?.(...args);
        const clearTimeoutFn = (...args) => typeof scope.clearTimeout === 'function' ? scope.clearTimeout(...args) : getWindow().clearTimeout?.(...args);
        const call = (name, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : undefined;
        let renderTimer = 0;
        let renderLastAt = 0;
        let renderCacheKey = '';
        let renderCache = null;
        let viewElement = null;
        let staticDirty = true;
        let dragState = null;

        function applyProjectViewportPatch(project, viewportPatch) {
            const patch = call('buildProjectViewportPatch', project, { viewportPatch });
            if (patch && typeof patch === 'object'
                && patch.viewport
                && typeof patch.viewport === 'object'
                && !Array.isArray(patch.viewport)) {
                Object.assign(project, patch);
                return;
            }
            const currentViewport = project?.viewport
                && typeof project.viewport === 'object'
                && !Array.isArray(project.viewport)
                ? project.viewport
                : {};
            Object.assign(project, { viewport: Object.assign({}, currentViewport, viewportPatch || {}) });
        }

        function invalidateMinimapStaticCache() {
            staticDirty = true;
        }

        function getMinimapItems() {
            const project = getProject();
            return [
                ...(Array.isArray(project.nodes) ? project.nodes : []),
                ...ensureProjectGroups().map(group => {
                    const rect = getGroupRect(group);
                    return { id: group.id, type: 'group', x: rect.x, y: rect.y, w: rect.w, h: rect.h };
                })
            ];
        }

        function getMinimapBounds(visibleWorld) {
            const visible = visibleWorld || getVisibleWorldRect();
            return getMinimapBoundsFromViewport(getMinimapItems(), visible);
        }

        function setMinimapViewRect(view, visible) {
            if (!view || !visible) return;
            view.setAttribute('x', visible.x.toFixed(2));
            view.setAttribute('y', visible.y.toFixed(2));
            view.setAttribute('width', Math.max(4, visible.w).toFixed(2));
            view.setAttribute('height', Math.max(4, visible.h).toFixed(2));
        }

        function minimapBoundsContainVisible(bounds, visible) {
            if (!bounds || !visible) return false;
            return visible.x >= bounds.minX
                && visible.y >= bounds.minY
                && visible.x + visible.w <= bounds.maxX
                && visible.y + visible.h <= bounds.maxY;
        }

        function buildMinimapStaticData(items) {
            const selectedNodeId = typeof scope.getSelectedNodeId === 'function' ? scope.getSelectedNodeId() : null;
            const selectedNodeIds = typeof scope.getSelectedNodeIds === 'function' ? scope.getSelectedNodeIds() : new Set();
            const selectedGroupId = typeof scope.getSelectedGroupId === 'function' ? scope.getSelectedGroupId() : null;
            const parts = [];
            const records = items.map((node) => {
                const sourceRect = getNodeRect(node);
                const selected = node.type === 'group'
                    ? node.id === selectedGroupId
                    : (node.id === selectedNodeId || selectedNodeIds.has(node.id));
                parts.push([
                    node.id || '',
                    node.type || '',
                    sourceRect.x,
                    sourceRect.y,
                    sourceRect.w,
                    sourceRect.h,
                    selected ? 1 : 0
                ].join(':'));
                return { node, sourceRect, selected };
            });
            return { key: parts.join('|'), records };
        }

        function buildMinimapRenderCache(staticData, bounds, scale, offsetX, offsetY) {
            const mapRect = (rect) => ({
                x: offsetX + (rect.x - bounds.minX) * scale,
                y: offsetY + (rect.y - bounds.minY) * scale,
                w: Math.max(2, rect.w * scale),
                h: Math.max(2, rect.h * scale)
            });
            const records = (staticData.records || []).map((record) => {
                const node = record.node || {};
                const sourceRect = record.sourceRect || getNodeRect(node);
                const rect = mapRect(sourceRect);
                return { node, rect, selected: !!record.selected };
            });
            return { records, bounds, scale, offsetX, offsetY, mapRect };
        }

        function renderMinimapNodeRects(records) {
            return (records || []).map((record) => {
                const node = record.node || {};
                const rect = record.rect || { x: 0, y: 0, w: 2, h: 2 };
                const color = getNodeColor(node);
                const style = color && !record.selected ? ` style="fill:${escapeHtml(expandHex(color, '#14b8a6'))}"` : '';
                return `<rect class="sai-minimap-node ${record.selected ? 'is-selected' : ''}" x="${rect.x.toFixed(2)}" y="${rect.y.toFixed(2)}" width="${rect.w.toFixed(2)}" height="${rect.h.toFixed(2)}" rx="2" data-type="${escapeHtml(node.type || '')}"${style}></rect>`;
            }).join('');
        }

        function syncMinimapViewRect(visibleWorld) {
            const minimap = getElement();
            if (!minimap || minimap.hidden || staticDirty || !renderCache) return false;
            const visible = visibleWorld || getVisibleWorldRect();
            if (!minimapBoundsContainVisible(renderCache.bounds, visible)) return false;
            const svg = minimap.querySelector('.sai-minimap-svg');
            const view = viewElement?.isConnected ? viewElement : svg?.querySelector?.('.sai-minimap-view');
            if (!view) return false;
            viewElement = view;
            setMinimapViewRect(view, renderCache.mapRect(visible));
            return true;
        }

        function updateMinimapForViewportInteraction(visibleWorld) {
            if (syncMinimapViewRect(visibleWorld)) return;
            renderMinimap({ visibleWorld: visibleWorld || getVisibleWorldRect() });
        }

        function renderMinimap(options) {
            const opts = options || {};
            const startedAt = getPerformanceNow();
            const perfStats = getPerfStats();
            perfStats.minimapCacheHit = 0;
            const minimap = getElement();
            if (!minimap) return;
            const project = getProject();
            const itemCount = (Array.isArray(project.nodes) ? project.nodes.length : 0)
                + (Array.isArray(project.groups) ? project.groups.length : 0);
            const enabledSetting = !!project.settings?.minimap && itemCount > 0;
            const svg = minimap.querySelector('.sai-minimap-svg');
            if (!svg) {
                perfStats.renderMinimapMs = getPerformanceNow() - startedAt;
                return;
            }
            if (!enabledSetting) {
                minimap.hidden = true;
                viewElement = null;
                perfStats.renderMinimapMs = getPerformanceNow() - startedAt;
                return;
            }
            const visibleWorld = opts.visibleWorld || getVisibleWorldRect();
            if (!staticDirty && renderCache && minimapBoundsContainVisible(renderCache.bounds, visibleWorld)) {
                minimap.hidden = false;
                const view = viewElement?.isConnected ? viewElement : svg.querySelector('.sai-minimap-view');
                if (view) {
                    viewElement = view;
                    setMinimapViewRect(view, renderCache.mapRect(visibleWorld));
                    perfStats.minimapCacheHit = 1;
                    perfStats.renderMinimapMs = getPerformanceNow() - startedAt;
                    return;
                }
            }
            const items = getMinimapItems();
            const staticData = buildMinimapStaticData(items);
            const staticCacheKey = `${project.id || ''};${staticData.key}`;
            const enabled = hasCanvasOverflow(items, visibleWorld);
            minimap.hidden = !enabled;
            if (!enabled) {
                viewElement = null;
                perfStats.renderMinimapMs = getPerformanceNow() - startedAt;
                return;
            }
            const bounds = getMinimapBounds(visibleWorld);
            const mw = 180;
            const mh = 124;
            const scale = Math.min(mw / bounds.width, mh / bounds.height);
            const offsetX = (mw - bounds.width * scale) / 2;
            const offsetY = (mh - bounds.height * scale) / 2;
            const nextCache = buildMinimapRenderCache(staticData, bounds, scale, offsetX, offsetY);
            const visible = nextCache.mapRect(visibleWorld);
            svg.dataset.minX = String(bounds.minX);
            svg.dataset.minY = String(bounds.minY);
            svg.dataset.scale = String(scale);
            svg.dataset.offsetX = String(offsetX);
            svg.dataset.offsetY = String(offsetY);
            renderCacheKey = staticCacheKey;
            renderCache = nextCache;
            staticDirty = false;
            svg.innerHTML = `
<rect class="sai-minimap-bg" x="0" y="0" width="${mw}" height="${mh}" rx="6"></rect>
${renderMinimapNodeRects(nextCache.records)}
<rect class="sai-minimap-view" x="${visible.x.toFixed(2)}" y="${visible.y.toFixed(2)}" width="${Math.max(4, visible.w).toFixed(2)}" height="${Math.max(4, visible.h).toFixed(2)}" rx="2"></rect>`;
            viewElement = svg.querySelector('.sai-minimap-view');
            perfStats.renderMinimapMs = getPerformanceNow() - startedAt;
        }

        function getMinimapPointerGeometry(svg) {
            const rect = svg.getBoundingClientRect();
            const scale = Number(svg.dataset.scale || 1);
            if (!scale || !Number.isFinite(scale)) return null;
            const minX = Number(svg.dataset.minX || 0);
            const minY = Number(svg.dataset.minY || 0);
            const offsetX = Number(svg.dataset.offsetX || 0);
            const offsetY = Number(svg.dataset.offsetY || 0);
            return { rect, scale, minX, minY, offsetX, offsetY };
        }

        function minimapClientToWorld(clientX, clientY, geometry) {
            const geo = geometry || getMinimapPointerGeometry(dragState?.svg);
            if (!geo) return null;
            return {
                x: geo.minX + (clientX - geo.rect.left - geo.offsetX) / geo.scale,
                y: geo.minY + (clientY - geo.rect.top - geo.offsetY) / geo.scale
            };
        }

        function setViewportCenterWorldFast(worldX, worldY) {
            const viewport = getViewport();
            const project = getProject();
            if (!viewport) return;
            const rect = viewport.getBoundingClientRect();
            const zoom = project.viewport.zoom || 1;
            applyProjectViewportPatch(project, {
                x: Math.round(rect.width / 2 - worldX * zoom),
                y: Math.round(rect.height / 2 - worldY * zoom)
            });
            call('preferSvgEdgesForViewportInteraction', 5000);
            call('applyViewport');
            call('renderStatus');
            updateMinimapForViewportInteraction();
            call('scheduleViewportNodeRender');
        }

        function updateViewportFromMinimapPointer(evt) {
            if (!dragState || evt.pointerId !== dragState.pointerId) return;
            const state = dragState;
            let center = null;
            if (state.startsOnView) {
                const geo = getMinimapPointerGeometry(state.svg) || state.geometry;
                if (!geo) return;
                const dx = (evt.clientX - state.startClientX) / geo.scale;
                const dy = (evt.clientY - state.startClientY) / geo.scale;
                center = { x: state.startCenterX + dx, y: state.startCenterY + dy };
                state.geometry = geo;
            } else {
                center = minimapClientToWorld(evt.clientX, evt.clientY, getMinimapPointerGeometry(state.svg) || state.geometry);
            }
            if (!center) return;
            setViewportCenterWorldFast(center.x, center.y);
        }

        function onMinimapPointerDown(evt) {
            const svg = evt.target.closest('.sai-minimap-svg');
            if (!svg || !getViewport()) return;
            evt.preventDefault();
            evt.stopPropagation();
            const geometry = getMinimapPointerGeometry(svg);
            if (!geometry) return;
            const visible = getVisibleWorldRect();
            const startsOnView = !!evt.target.closest('.sai-minimap-view');
            dragState = {
                pointerId: evt.pointerId,
                svg,
                startsOnView,
                startClientX: evt.clientX,
                startClientY: evt.clientY,
                startCenterX: visible.x + visible.w / 2,
                startCenterY: visible.y + visible.h / 2,
                geometry
            };
            svg.classList.add('is-dragging');
            try { svg.setPointerCapture(evt.pointerId); } catch (err) {}
            if (!startsOnView) updateViewportFromMinimapPointer(evt);
            const doc = getDocument();
            doc?.addEventListener('pointermove', onMinimapPointerMove, true);
            doc?.addEventListener('pointerup', stopMinimapDrag, true);
            doc?.addEventListener('pointercancel', stopMinimapDrag, true);
        }

        function onMinimapPointerMove(evt) {
            if (!dragState || evt.pointerId !== dragState.pointerId) return;
            evt.preventDefault();
            updateViewportFromMinimapPointer(evt);
        }

        function stopMinimapDrag(evt) {
            if (!dragState) return;
            if (evt && evt.pointerId !== dragState.pointerId) return;
            const state = dragState;
            dragState = null;
            if (state.svg) {
                state.svg.classList.remove('is-dragging');
                try { state.svg.releasePointerCapture(state.pointerId); } catch (err) {}
            }
            const doc = getDocument();
            doc?.removeEventListener('pointermove', onMinimapPointerMove, true);
            doc?.removeEventListener('pointerup', stopMinimapDrag, true);
            doc?.removeEventListener('pointercancel', stopMinimapDrag, true);
            call('scheduleViewportSave');
            flushMinimapRender();
        }

        function scheduleMinimapRender(options) {
            const minimap = getElement();
            if (!minimap || renderTimer) return;
            const opts = options || {};
            const current = getPerformanceNow();
            const delay = Math.max(Number(opts.delayMs || 0), 120 - (current - renderLastAt));
            renderTimer = setTimeoutFn(() => {
                renderTimer = 0;
                renderLastAt = getPerformanceNow();
                renderMinimap();
            }, delay);
        }

        function cancelMinimapRender() {
            if (!renderTimer) return;
            clearTimeoutFn(renderTimer);
            renderTimer = 0;
        }

        function flushMinimapRender() {
            cancelMinimapRender();
            renderLastAt = getPerformanceNow();
            renderMinimap();
        }

        function resetMinimapCache() {
            cancelMinimapRender();
            renderCacheKey = '';
            renderCache = null;
            viewElement = null;
            staticDirty = true;
            dragState = null;
        }

        return {
            invalidateMinimapStaticCache,
            getMinimapItems,
            getMinimapBounds,
            syncMinimapViewRect,
            updateMinimapForViewportInteraction,
            renderMinimap,
            onMinimapPointerDown,
            scheduleMinimapRender,
            cancelMinimapRender,
            flushMinimapRender,
            resetMinimapCache,
            isDragging: () => !!dragState
        };
    }

    window.SimpAICanvasWorkbenchMinimap = Object.assign({}, window.SimpAICanvasWorkbenchMinimap || {}, {
        createCanvasMinimapController
    });
})();
