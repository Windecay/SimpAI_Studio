(function () {
    'use strict';

    function createCanvasViewportWheelController(context) {
        const scope = context || {};
        const getRoot = () => typeof scope.getRoot === 'function' ? scope.getRoot() : null;
        const getDocument = () => typeof scope.getDocument === 'function'
            ? scope.getDocument()
            : (typeof document !== 'undefined' ? document : null);
        const getWindow = () => typeof scope.getWindow === 'function'
            ? scope.getWindow()
            : (typeof window !== 'undefined' ? window : null);
        const getPerformanceNow = () => typeof scope.performanceNow === 'function'
            ? scope.performanceNow()
            : (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now());
        const getSuppressWheelUntil = () => typeof scope.getSuppressWheelUntil === 'function'
            ? Number(scope.getSuppressWheelUntil() || 0)
            : 0;
        const call = (name, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : undefined;

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
            if (call('isInteractiveTarget', evt.target)) return;
            evt.preventDefault();
            if (call('isNodeDragging') || call('isPanning') || call('isMarqueeSelecting') || call('isConnecting') || getPerformanceNow() < getSuppressWheelUntil()) return;
            const delta = Math.abs(evt.deltaY) >= Math.abs(evt.deltaX) ? evt.deltaY : evt.deltaX;
            const factor = Math.exp(-delta * 0.0012);
            call('zoomAtClient', evt.clientX, evt.clientY, factor);
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
