(function () {
    'use strict';

    function createCanvasConnectionController(context) {
        const scope = context || {};
        const sourceObject = (name) => {
            const value = scope[name];
            return value && typeof value === 'object' ? value : {};
        };
        const domSource = sourceObject('domSource');
        const viewportSource = sourceObject('viewportSource');
        const runtimeSource = sourceObject('runtimeSource');
        const uiSource = sourceObject('uiSource');
        const selectionSource = sourceObject('selectionSource');
        const nodeSource = sourceObject('nodeSource');
        const spatialSource = sourceObject('spatialSource');
        const connectionSource = sourceObject('connectionSource');
        const renderSource = sourceObject('renderSource');
        const actionSource = sourceObject('actionSource');
        const sourceCall = (source, name, fallback, ...args) => typeof source[name] === 'function'
            ? source[name](...args)
            : fallback;
        const getDocument = () => typeof domSource.getDocument === 'function'
            ? domSource.getDocument()
            : null;
        const clientToWorld = (clientX, clientY) => sourceCall(
            viewportSource,
            'clientToWorld',
            { x: clientX, y: clientY },
            clientX,
            clientY
        ) || { x: clientX, y: clientY };
        const getPerformanceNow = () => typeof runtimeSource.performanceNow === 'function'
            ? runtimeSource.performanceNow()
            : 0;
        const uiCall = (name, fallback, ...args) => sourceCall(uiSource, name, fallback, ...args);
        const selectionCall = (name, fallback, ...args) => sourceCall(selectionSource, name, fallback, ...args);
        const nodeCall = (name, fallback, ...args) => sourceCall(nodeSource, name, fallback, ...args);
        const spatialCall = (name, fallback, ...args) => sourceCall(spatialSource, name, fallback, ...args);
        const connectionCall = (name, fallback, ...args) => sourceCall(connectionSource, name, fallback, ...args);
        const renderCall = (name, fallback, ...args) => sourceCall(renderSource, name, fallback, ...args);
        const actionCall = (name, fallback, ...args) => sourceCall(actionSource, name, fallback, ...args);
        let connectState = null;

        function updateTempEdge() {
            renderCall('renderTempEdge', undefined, connectState);
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
            uiCall('hideCanvasTooltip', undefined);
            uiCall('hideHoverPreview', undefined);
            uiCall('closePreviewSelectMenu', undefined);
            uiCall('setSuppressWheelUntil', undefined, getPerformanceNow() + 420);
            selectionCall('selectNode', undefined, node.id);
            connectState = {
                from: node.id,
                fromPoint: nodeCall('getOutputPoint', undefined, node),
                currentPoint: clientToWorld(evt.clientX, evt.clientY)
            };
            updateTempEdge();
            bindConnectionListeners();
        }

        function startInputConnection(target, evt) {
            if (!target?.handle || !target.toId || !evt) return;
            uiCall('hideCanvasTooltip', undefined);
            uiCall('hideHoverPreview', undefined);
            uiCall('closePreviewSelectMenu', undefined);
            uiCall('setSuppressWheelUntil', undefined, getPerformanceNow() + 420);
            selectionCall('selectInputConnectionTarget', undefined, target.toId);
            const point = nodeCall('getHandleCenterWorldPoint', undefined, target.handle);
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
            const snapTarget = spatialCall('findNearestConnectionTarget', null, evt.clientX, evt.clientY);
            connectState.currentPoint = snapTarget
                ? nodeCall('getHandleCenterWorldPoint', undefined, snapTarget.handle)
                : clientToWorld(evt.clientX, evt.clientY);
            updateTempEdge();
        }

        function stopConnection(evt) {
            if (!connectState || !evt) return;
            if (connectState.mode === 'input') {
                const state = connectState;
                const menuWorld = clientToWorld(evt.clientX, evt.clientY);
                connectState = null;
                renderCall('renderTempEdge', undefined, null);
                removeConnectionListeners();
                if (state.moved) {
                    renderCall('renderAll', undefined);
                    actionCall('openInputPortCreateMenu', undefined, state.target, evt.clientX, evt.clientY, menuWorld);
                }
                return;
            }
            const snapTarget = spatialCall('findNearestConnectionTarget', null, evt.clientX, evt.clientY);
            const connected = !!(snapTarget && connectionCall('connectSourceToTarget', false, connectState.from, snapTarget));
            const menuWorld = clientToWorld(evt.clientX, evt.clientY);
            const pendingFromId = connectState.from;
            connectState = null;
            renderCall('renderTempEdge', undefined, null);
            removeConnectionListeners();
            if (connected) renderCall('renderAll', undefined);
            else {
                actionCall('setPendingConnection', undefined, pendingFromId, menuWorld);
                renderCall('renderAll', undefined);
                actionCall('openAddNodeMenu', undefined, evt.clientX, evt.clientY, menuWorld, false, 420);
            }
        }

        function cancelConnection() {
            if (!connectState) return;
            connectState = null;
            renderCall('renderTempEdge', undefined, null);
            removeConnectionListeners();
            renderCall('renderAll', undefined);
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
