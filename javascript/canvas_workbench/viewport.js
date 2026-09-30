(function () {
    'use strict';

    function fallbackNodeSize(type) {
        if (type === 'image') return { w: 264, h: 300 };
        if (type === 'compare') return { w: 560, h: 520 };
        return { w: 220, h: 250 };
    }

    function defaultNodeSize(type, options) {
        if (typeof options?.defaultNodeSize === 'function') return options.defaultNodeSize(type);
        return fallbackNodeSize(type);
    }

    function getNodeRect(node, position, options) {
        const size = defaultNodeSize(node?.type, options);
        const layout = typeof options?.getNodeLayoutSize === 'function' ? options.getNodeLayoutSize(node) : null;
        const w = Number(layout?.w || node?.w || size.w);
        const h = Number(layout?.h || node?.h || size.h);
        return {
            x: Math.round(position?.x ?? node?.x ?? 0),
            y: Math.round(position?.y ?? node?.y ?? 0),
            w,
            h
        };
    }

    function rectsOverlap(a, b, padding) {
        if (!a || !b) return false;
        const pad = Number(padding || 0);
        return a.x < b.x + b.w + pad
            && a.x + a.w + pad > b.x
            && a.y < b.y + b.h + pad
            && a.y + a.h + pad > b.y;
    }

    function rectContainsRect(outer, inner, tolerance) {
        if (!outer || !inner) return false;
        const pad = Number(tolerance || 0);
        return inner.x >= outer.x - pad
            && inner.y >= outer.y - pad
            && inner.x + inner.w <= outer.x + outer.w + pad
            && inner.y + inner.h <= outer.y + outer.h + pad;
    }

    function snapCanvasCoord(value, gridSize) {
        const grid = Number(gridSize || 24);
        return Math.round(Number(value || 0) / grid) * grid;
    }

    function snapCanvasSizeFromOrigin(origin, size, minSize, maxSize, gridSize) {
        const start = Number(origin || 0);
        const min = Number(minSize || 0);
        const max = Number(maxSize || min);
        const grid = Number(gridSize || 24);
        const minEdge = start + min;
        const maxEdge = start + max;
        let edge = snapCanvasCoord(start + Number(size || 0), grid);
        if (edge < minEdge) edge = Math.ceil(minEdge / grid) * grid;
        if (edge > maxEdge) edge = Math.floor(maxEdge / grid) * grid;
        return Math.round(Math.max(min, Math.min(max, edge - start)));
    }

    function findOpenNodePosition(nodes, base, sizeOrType, options) {
        const opts = options || {};
        const size = typeof sizeOrType === 'string' ? defaultNodeSize(sizeOrType, opts) : (sizeOrType || defaultNodeSize('image', opts));
        const padding = Number(opts.padding ?? 26);
        const stepX = Number(opts.stepX || size.w + padding);
        const stepY = Number(opts.stepY || size.h + padding);
        const visible = opts.visibleRect || null;
        const margin = Number(opts.visibleMargin ?? 32);
        const excludeIds = new Set(opts.excludeIds || []);
        const reserved = Array.isArray(opts.reserved) ? opts.reserved : [];
        const occupied = (Array.isArray(nodes) ? nodes : [])
            .filter(node => node && !excludeIds.has(node.id))
            .map(node => getNodeRect(node, null, opts))
            .concat(reserved);
        const clampToVisible = (x, y) => {
            if (!visible) return { x: Math.round(x), y: Math.round(y) };
            const minX = Math.round(visible.x + margin);
            const minY = Math.round(visible.y + margin);
            const maxX = Math.round(visible.x + visible.w - size.w - margin);
            const maxY = Math.round(visible.y + visible.h - size.h - margin);
            return {
                x: Math.round(maxX < minX ? visible.x + Math.max(0, (visible.w - size.w) / 2) : Math.min(Math.max(x, minX), maxX)),
                y: Math.round(maxY < minY ? visible.y + Math.max(0, (visible.h - size.h) / 2) : Math.min(Math.max(y, minY), maxY))
            };
        };
        const isInsideVisible = (x, y) => {
            if (!visible) return true;
            const point = clampToVisible(x, y);
            return point.x === Math.round(x) && point.y === Math.round(y);
        };
        const isFree = (x, y) => {
            const candidate = { x: Math.round(x), y: Math.round(y), w: size.w, h: size.h };
            if (!isInsideVisible(candidate.x, candidate.y)) return false;
            return !occupied.some(rect => rectsOverlap(candidate, rect, padding));
        };
        const start = clampToVisible(base?.x || 0, base?.y || 0);
        const startX = start.x;
        const startY = start.y;
        if (isFree(startX, startY)) return { x: startX, y: startY };
        const offsets = [];
        for (let ring = 1; ring <= 12; ring += 1) {
            offsets.push([0, ring], [ring, 0], [ring, ring], [0, -ring], [ring, -ring]);
            for (let dx = -ring; dx <= ring; dx += 1) {
                offsets.push([dx, ring], [dx, -ring]);
            }
            for (let dy = -ring + 1; dy <= ring - 1; dy += 1) {
                offsets.push([ring, dy], [-ring, dy]);
            }
        }
        const seen = new Set();
        for (const [dx, dy] of offsets) {
            const x = startX + dx * stepX;
            const y = startY + dy * stepY;
            const key = `${x},${y}`;
            if (seen.has(key)) continue;
            seen.add(key);
            if (isFree(x, y)) return { x, y };
        }
        return clampToVisible(startX + stepX, startY + stepY);
    }

    function getVisibleWorldRect(viewportEl, viewportState) {
        if (!viewportEl) return { x: 0, y: 0, w: 1, h: 1 };
        const rect = viewportEl.getBoundingClientRect();
        const vp = viewportState || {};
        const zoom = vp.zoom || 1;
        return {
            x: Math.round(-vp.x / zoom),
            y: Math.round(-vp.y / zoom),
            w: Math.round(rect.width / zoom),
            h: Math.round(rect.height / zoom)
        };
    }

    function clientToWorld(viewportEl, viewportState, clientX, clientY) {
        const rect = viewportEl.getBoundingClientRect();
        const vp = viewportState || {};
        const zoom = vp.zoom || 1;
        return {
            x: Math.round((clientX - rect.left - vp.x) / zoom),
            y: Math.round((clientY - rect.top - vp.y) / zoom)
        };
    }

    function viewportCenterWorld(viewportEl, viewportState) {
        const rect = viewportEl.getBoundingClientRect();
        return clientToWorld(
            viewportEl,
            viewportState,
            rect.left + rect.width / 2,
            rect.top + rect.height / 2
        );
    }

    function getHandleCenterWorldPoint(handle, viewportEl, viewportState) {
        const rect = handle.getBoundingClientRect();
        return clientToWorld(
            viewportEl,
            viewportState,
            rect.left + rect.width / 2,
            rect.top + rect.height / 2
        );
    }

    function getNodeRenderWorldRect(visible, zoom, overscanPx) {
        const z = Math.max(0.15, Number(zoom || 1));
        const overscan = Math.round(Number(overscanPx || 960) / z);
        return {
            x: visible.x - overscan,
            y: visible.y - overscan,
            w: visible.w + overscan * 2,
            h: visible.h + overscan * 2
        };
    }

    function shouldRenderNodeInViewport(node, renderWindow, options) {
        const opts = options || {};
        if (!node) return false;
        const selectedIds = opts.selectedNodeIds instanceof Set ? opts.selectedNodeIds : new Set(opts.selectedNodeIds || []);
        if (node.id === opts.selectedNodeId || selectedIds.has(node.id)) return true;
        if (opts.connectFromId && opts.connectFromId === node.id) return true;
        if (typeof opts.isRunning === 'function' && opts.isRunning(node)) return true;
        return rectsOverlap(getNodeRect(node, null, opts), renderWindow, 0);
    }

    function getMinimapBounds(nodes, visible, options) {
        let minX = visible.x;
        let minY = visible.y;
        let maxX = visible.x + visible.w;
        let maxY = visible.y + visible.h;
        for (const node of Array.isArray(nodes) ? nodes : []) {
            const rect = getNodeRect(node, null, options);
            minX = Math.min(minX, rect.x);
            minY = Math.min(minY, rect.y);
            maxX = Math.max(maxX, rect.x + rect.w);
            maxY = Math.max(maxY, rect.y + rect.h);
        }
        const pad = Number(options?.padding ?? 180);
        minX -= pad;
        minY -= pad;
        maxX += pad;
        maxY += pad;
        return {
            minX,
            minY,
            maxX,
            maxY,
            width: Math.max(1, maxX - minX),
            height: Math.max(1, maxY - minY)
        };
    }

    function hasCanvasOverflow(nodes, visible, options) {
        if (!Array.isArray(nodes) || !nodes.length) return false;
        const margin = Number(options?.margin ?? 24);
        return nodes.some((node) => {
            const rect = getNodeRect(node, null, options);
            return rect.x < visible.x - margin
                || rect.y < visible.y - margin
                || rect.x + rect.w > visible.x + visible.w + margin
                || rect.y + rect.h > visible.y + visible.h + margin;
        });
    }

    function getEdgeSvgBounds(nodes, visible, options) {
        const pad = Number(options?.padding ?? 900);
        const minX = visible.x - pad;
        const minY = visible.y - pad;
        const maxX = visible.x + visible.w + pad;
        const maxY = visible.y + visible.h + pad;
        return {
            x: Math.floor(minX),
            y: Math.floor(minY),
            w: Math.max(1600, Math.ceil(maxX - minX)),
            h: Math.max(1200, Math.ceil(maxY - minY))
        };
    }

    function shouldRenderEdgeInViewport(edge, fromNode, toNode, renderWindow, options) {
        const opts = options || {};
        if (!edge || !fromNode || !toNode) return false;
        const selectedIds = opts.selectedNodeIds instanceof Set ? opts.selectedNodeIds : new Set(opts.selectedNodeIds || []);
        if (edge.id === opts.selectedEdgeId) return true;
        if (selectedIds.has(fromNode.id) || selectedIds.has(toNode.id)) return true;
        const fromRect = getNodeRect(fromNode, null, opts);
        const toRect = getNodeRect(toNode, null, opts);
        if (rectsOverlap(fromRect, renderWindow, 260) || rectsOverlap(toRect, renderWindow, 260)) return true;
        const from = { x: fromRect.x + fromRect.w, y: fromRect.y + 54 };
        const to = { x: toRect.x, y: toRect.y + 54 };
        const pathRect = {
            x: Math.min(from.x, to.x) - 160,
            y: Math.min(from.y, to.y) - 160,
            w: Math.abs(to.x - from.x) + 320,
            h: Math.abs(to.y - from.y) + 320
        };
        return rectsOverlap(pathRect, renderWindow, 0);
    }

    function curvePath(from, to) {
        const dx = Math.max(80, Math.abs(to.x - from.x) * 0.45);
        return `M ${from.x} ${from.y} C ${from.x + dx} ${from.y}, ${to.x - dx} ${to.y}, ${to.x} ${to.y}`;
    }

    window.SimpAICanvasWorkbenchViewport = {
        getNodeRect,
        rectsOverlap,
        rectContainsRect,
        snapCanvasCoord,
        snapCanvasSizeFromOrigin,
        findOpenNodePosition,
        getVisibleWorldRect,
        clientToWorld,
        viewportCenterWorld,
        getHandleCenterWorldPoint,
        getNodeRenderWorldRect,
        shouldRenderNodeInViewport,
        getMinimapBounds,
        hasCanvasOverflow,
        getEdgeSvgBounds,
        shouldRenderEdgeInViewport,
        curvePath
    };
})();
