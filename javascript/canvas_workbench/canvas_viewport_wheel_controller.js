(function () {
    'use strict';

    function createCanvasViewportWheelController(context) {
        const scope = context?.viewportWheelSource || context || {};
        const domSource = scope.domSource || {};
        const environmentSource = scope.environmentSource || {};
        const runtimeSource = scope.runtimeSource || {};
        const viewportSource = scope.viewportSource || {};
        const interactionSource = scope.interactionSource || {};
        const sourceCall = (sourceObject, name, fallback, ...args) => typeof sourceObject[name] === 'function'
            ? sourceObject[name](...args)
            : fallback;
        const getRoot = () => sourceCall(domSource, 'getRoot', null);
        const getDocument = () => typeof domSource.getDocument === 'function'
            ? domSource.getDocument()
            : (typeof document !== 'undefined' ? document : null);
        const getWindow = () => typeof environmentSource.getWindow === 'function'
            ? environmentSource.getWindow()
            : (typeof window !== 'undefined' ? window : null);
        const getPerformanceNow = () => typeof runtimeSource.performanceNow === 'function'
            ? runtimeSource.performanceNow()
            : (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now());
        const getSuppressWheelUntil = () => typeof viewportSource.getSuppressWheelUntil === 'function'
            ? Number(viewportSource.getSuppressWheelUntil() || 0)
            : 0;
        const interactionCall = (name, fallback, ...args) => sourceCall(interactionSource, name, fallback, ...args);
        const zoomAtClient = (...args) => sourceCall(viewportSource, 'zoomAtClient', undefined, ...args);

        function canElementScrollInWheelDirection(el, deltaX, deltaY) {
            const root = getRoot();
            const doc = getDocument();
            if (!el || el === root || el === doc?.body || el === doc?.documentElement) return false;
            const win = getWindow();
            const style = win?.getComputedStyle ? win.getComputedStyle(el) : null;
            const overflowY = String(style?.overflowY || '').toLowerCase();
            const overflowX = String(style?.overflowX || '').toLowerCase();
            const allowsY = !['hidden', 'clip', 'visible'].includes(overflowY);
            const allowsX = !['hidden', 'clip', 'visible'].includes(overflowX);
            const maxY = Math.max(0, (el.scrollHeight || 0) - (el.clientHeight || 0));
            const maxX = Math.max(0, (el.scrollWidth || 0) - (el.clientWidth || 0));
            const canY = allowsY && maxY > 1 && ((deltaY < 0 && el.scrollTop > 0) || (deltaY > 0 && el.scrollTop < maxY - 1));
            const canX = allowsX && maxX > 1 && ((deltaX < 0 && el.scrollLeft > 0) || (deltaX > 0 && el.scrollLeft < maxX - 1));
            return canY || canX;
        }

        function findWheelScrollableAncestor(target, evt) {
            const root = getRoot();
            if (!target || !root || !root.contains?.(target)) return null;
            const deltaX = Number(evt?.deltaX || 0);
            const deltaY = Number(evt?.deltaY || 0);
            let el = target.nodeType === 1 ? target : target.parentElement;
            while (el && el !== root) {
                if (canElementScrollInWheelDirection(el, deltaX, deltaY)) return el;
                el = el.parentElement;
            }
            return null;
        }

        function onViewportWheel(evt) {
            const root = getRoot();
            if (!evt || !root || root.hidden) return;
            if (findWheelScrollableAncestor(evt.target, evt)) return;
            if (interactionCall('isInteractiveTarget', false, evt.target)) return;
            evt.preventDefault();
            if (interactionCall('isNodeDragging', false)
                || interactionCall('isPanning', false)
                || interactionCall('isMarqueeSelecting', false)
                || interactionCall('isConnecting', false)
                || getPerformanceNow() < getSuppressWheelUntil()) return;
            const delta = Math.abs(evt.deltaY) >= Math.abs(evt.deltaX) ? evt.deltaY : evt.deltaX;
            const factor = Math.exp(-delta * 0.0012);
            zoomAtClient(evt.clientX, evt.clientY, factor);
        }

        function onWorkbenchWheelBoundary(evt) {
            const root = getRoot();
            if (!evt || !root || root.hidden || !root.contains?.(evt.target)) return;
            if (findWheelScrollableAncestor(evt.target, evt)) return;
            evt.preventDefault();
        }

        return {
            canElementScrollInWheelDirection,
            findWheelScrollableAncestor,
            onViewportWheel,
            onWorkbenchWheelBoundary
        };
    }

    window.SimpAICanvasWorkbenchViewportWheel = Object.assign({}, window.SimpAICanvasWorkbenchViewportWheel || {}, {
        createCanvasViewportWheelController
    });
})();
