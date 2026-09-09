(function () {
    'use strict';

    function createCanvasConnectionController(context) {
        const scope = context || {};
        const getDocument = () => typeof scope.getDocument === 'function'
            ? scope.getDocument()
            : (typeof document !== 'undefined' ? document : null);
        const clientToWorld = (clientX, clientY) => typeof scope.clientToWorld === 'function'
            ? (scope.clientToWorld(clientX, clientY) || { x: 0, y: 0 })
            : { x: clientX, y: clientY };
        const getPerformanceNow = () => typeof scope.performanceNow === 'function'
            ? scope.performanceNow()
            : (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now());
        const call = (name, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : undefined;
        let connectState = null;

        function updateTempEdge() {
            call('renderTempEdge', connectState);
        }

        function bindConnectionListeners() {
            const doc = getDocument();
            doc?.addEventListener('pointermove', onConnectionMove, true);
            doc?.addEventListener('pointerup', stopConnection, true);
        }

        function removeConnectionListeners() {
            const doc = getDocument();
            doc?.removeEventListener('pointermove', onConnectionMove, true);
            doc?.removeEventListener('pointerup', stopConnection, true);
        }

        function startConnection(node, evt) {
            if (!node || !evt) return;
            call('hideCanvasTooltip');
            call('hideHoverPreview');
            call('closePreviewSelectMenu');
            call('setSuppressWheelUntil', getPerformanceNow() + 420);
            call('selectNode', node.id);
            connectState = {
                from: node.id,
                fromPoint: call('getOutputPoint', node),
                currentPoint: clientToWorld(evt.clientX, evt.clientY)
            };
            updateTempEdge();
            bindConnectionListeners();
        }

        function startInputConnection(target, evt) {
            if (!target?.handle || !target.toId || !evt) return;
            call('hideCanvasTooltip');
            call('hideHoverPreview');
            call('closePreviewSelectMenu');
            call('setSuppressWheelUntil', getPerformanceNow() + 420);
            call('selectInputConnectionTarget', target.toId);
            const point = call('getHandleCenterWorldPoint', target.handle);
            connectState = {
                mode: 'input',
                target: Object.assign({}, target, { handle: null }),
                fromPoint: point,
                currentPoint: point,
                startClientX: Number(evt.clientX || 0),
                startClientY: Number(evt.clientY || 0),
                moved: false
            };
            bindConnectionListeners();
        }

        function onConnectionMove(evt) {
            if (!connectState || !evt) return;
            if (connectState.mode === 'input') {
                const dx = Number(evt.clientX || 0) - Number(connectState.startClientX || 0);
                const dy = Number(evt.clientY || 0) - Number(connectState.startClientY || 0);
                if (!connectState.moved && (dx * dx + dy * dy) < 36) return;
                connectState.moved = true;
                connectState.currentPoint = clientToWorld(evt.clientX, evt.clientY);
                updateTempEdge();
                return;
            }
            const snapTarget = call('findNearestConnectionTarget', evt.clientX, evt.clientY);
            connectState.currentPoint = snapTarget
                ? call('getHandleCenterWorldPoint', snapTarget.handle)
                : clientToWorld(evt.clientX, evt.clientY);
            updateTempEdge();
        }

        function stopConnection(evt) {
            if (!connectState || !evt) return;
            if (connectState.mode === 'input') {
                const state = connectState;
                const menuWorld = clientToWorld(evt.clientX, evt.clientY);
                connectState = null;
                call('renderTempEdge', null);
                removeConnectionListeners();
                if (state.moved) {
                    call('renderAll');
                    call('openInputPortCreateMenu', state.target, evt.clientX, evt.clientY, menuWorld);
                }
                return;
            }
            const snapTarget = call('findNearestConnectionTarget', evt.clientX, evt.clientY);
            const connected = !!(snapTarget && call('connectSourceToTarget', connectState.from, snapTarget));
            const menuWorld = clientToWorld(evt.clientX, evt.clientY);
            const pendingFromId = connectState.from;
            connectState = null;
            call('renderTempEdge', null);
            removeConnectionListeners();
            if (connected) call('renderAll');
            else {
                call('setPendingConnection', pendingFromId, menuWorld);
                call('renderAll');
                call('openAddNodeMenu', evt.clientX, evt.clientY, menuWorld, false, 420);
            }
        }

        function cancelConnection() {
            if (!connectState) return;
            connectState = null;
            call('renderTempEdge', null);
            removeConnectionListeners();
            call('renderAll');
        }

        return {
            startConnection,
            startInputConnection,
            onConnectionMove,
            stopConnection,
            cancelConnection,
            updateTempEdge,
            isConnecting: () => !!connectState,
            getConnectingFromId: () => connectState?.from || ''
        };
    }

    window.SimpAICanvasWorkbenchConnection = Object.assign({}, window.SimpAICanvasWorkbenchConnection || {}, {
        createCanvasConnectionController
    });
})();
