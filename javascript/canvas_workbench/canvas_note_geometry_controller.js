(function () {
    'use strict';

    function createCanvasNoteGeometryController(context) {
        const scope = context?.noteGeometrySource || context || {};
        const layoutSource = scope.layoutSource || {};
        const patchSource = scope.patchSource || {};
        const call = (source, name, fallback, ...args) => typeof source[name] === 'function'
            ? source[name](...args) : fallback;
        const getNodeRect = node => call(layoutSource, 'getNodeRect', {}, node);
        const buildNoteStatePatch = (...args) => call(patchSource, 'buildNoteStatePatch', {}, ...args);

        function noteTailState(node) {
            const tail = node?.tail && typeof node.tail === 'object' ? node.tail : {};
            const target = tail.target && typeof tail.target === 'object' ? tail.target : {};
            return {
                enabled: !!tail.enabled,
                target: {
                    x: Number.isFinite(Number(target.x)) ? Math.round(Number(target.x)) : null,
                    y: Number.isFinite(Number(target.y)) ? Math.round(Number(target.y)) : null
                }
            };
        }

        function defaultNoteTailTarget(node) {
            const rect = getNodeRect(node);
            return {
                x: Math.round(rect.x + rect.w + 130),
                y: Math.round(rect.y + Math.max(44, Math.min(rect.h - 24, rect.h * 0.45)))
            };
        }

        function ensureNoteTailTarget(node) {
            if (!node || node.type !== 'note') return null;
            const state = noteTailState(node);
            const fallback = defaultNoteTailTarget(node);
            Object.assign(node, buildNoteStatePatch(node, {
                tailTargetPatch: {
                    x: state.target.x ?? fallback.x,
                    y: state.target.y ?? fallback.y
                }
            }));
            return node.tail.target;
        }

        function noteTailBasePoint(node, target) {
            const rect = getNodeRect(node);
            const center = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
            const dx = Number(target.x || 0) - center.x;
            const dy = Number(target.y || 0) - center.y;
            if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
                return { x: rect.x + rect.w, y: center.y };
            }
            const halfW = Math.max(1, rect.w / 2);
            const halfH = Math.max(1, rect.h / 2);
            const scale = Math.min(
                Math.abs(dx) > 0.001 ? halfW / Math.abs(dx) : Infinity,
                Math.abs(dy) > 0.001 ? halfH / Math.abs(dy) : Infinity
            );
            const safeScale = Number.isFinite(scale) ? Math.max(0, Math.min(1, scale)) : 1;
            return {
                x: Math.round(center.x + dx * safeScale),
                y: Math.round(center.y + dy * safeScale)
            };
        }

        function noteTailShapePath(base, target) {
            const dx = Number(target.x || 0) - Number(base.x || 0);
            const dy = Number(target.y || 0) - Number(base.y || 0);
            const len = Math.max(1, Math.hypot(dx, dy));
            const px = -dy / len;
            const py = dx / len;
            const baseHalf = 7;
            const tipHalf = 2.4;
            const mid = { x: (base.x + target.x) / 2, y: (base.y + target.y) / 2 };
            const a = { x: base.x + px * baseHalf, y: base.y + py * baseHalf };
            const b = { x: target.x + px * tipHalf, y: target.y + py * tipHalf };
            const c = { x: target.x - px * tipHalf, y: target.y - py * tipHalf };
            const d = { x: base.x - px * baseHalf, y: base.y - py * baseHalf };
            return `M ${a.x} ${a.y} Q ${mid.x} ${mid.y} ${b.x} ${b.y} L ${c.x} ${c.y} Q ${mid.x} ${mid.y} ${d.x} ${d.y} Z`;
        }

        return { noteTailState, defaultNoteTailTarget, ensureNoteTailTarget, noteTailBasePoint, noteTailShapePath };
    }

    window.SimpAICanvasWorkbenchNoteGeometry = Object.assign(
        {}, window.SimpAICanvasWorkbenchNoteGeometry || {}, { createCanvasNoteGeometryController }
    );
})();
