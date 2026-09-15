(function () {
    'use strict';

    function delegate(source, name) {
        if (typeof source?.[name] !== 'function') return null;
        return (...args) => source[name](...args);
    }

    function createCanvasWorkbenchPendingConnectionController(source) {
        const scope = source?.pendingConnectionSource || source || {};
        const nodeSource = scope.nodeSource || {};
        const timeSource = scope.timeSource || {};
        const serializationSource = scope.serializationSource || {};
        const pick = (group, name) => delegate(group, name) || delegate(scope, name);
        const getNode = pick(nodeSource, 'getNode');
        const now = pick(timeSource, 'now') || (() => 0);
        const cloneValue = pick(serializationSource, 'cloneValue');
        let pendingConnection = null;
        let pendingInputTarget = null;

        function currentTime() {
            const value = Number(now());
            return Number.isFinite(value) ? value : 0;
        }

        function clone(value, fallback) {
            return typeof cloneValue === 'function' ? cloneValue(value, fallback) : fallback;
        }

        function setPendingConnection(fromId, world) {
            const from = typeof getNode === 'function' ? getNode(fromId) : null;
            if (!from) {
                pendingConnection = null;
                return;
            }
            pendingConnection = {
                fromId,
                world: clone(world || {}, {}),
                expires_at: currentTime() + 15000
            };
        }

        function getPendingConnectionSource() {
            if (!pendingConnection) return null;
            if (currentTime() > Number(pendingConnection.expires_at || 0)) {
                pendingConnection = null;
                return null;
            }
            return typeof getNode === 'function' ? getNode(pendingConnection.fromId) : null;
        }

        function setPendingInputTarget(target, world) {
            pendingInputTarget = target?.toId ? {
                target: Object.assign({}, target, { handle: null }),
                world: clone(world || {}, {}),
                expires_at: currentTime() + 30000
            } : null;
        }

        function getPendingInputTarget() {
            if (!pendingInputTarget) return null;
            const targetNode = typeof getNode === 'function' ? getNode(pendingInputTarget.target?.toId) : null;
            if (currentTime() > Number(pendingInputTarget.expires_at || 0) || !targetNode) {
                pendingInputTarget = null;
                return null;
            }
            return pendingInputTarget.target;
        }

        function clearPendingConnection() {
            pendingConnection = null;
        }

        function clearPendingInputTarget() {
            pendingInputTarget = null;
        }

        function clearAll() {
            clearPendingConnection();
            clearPendingInputTarget();
        }

        return {
            setPendingConnection,
            getPendingConnectionSource,
            setPendingInputTarget,
            getPendingInputTarget,
            clearPendingConnection,
            clearPendingInputTarget,
            clearAll
        };
    }

    window.SimpAICanvasWorkbenchPendingConnection = Object.assign(
        {},
        window.SimpAICanvasWorkbenchPendingConnection || {},
        { createCanvasWorkbenchPendingConnectionController }
    );
})();
