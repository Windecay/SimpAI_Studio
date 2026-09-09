(function () {
    'use strict';

    function createCanvasBridgeTransportController(context) {
        const scope = context || {};
        const bridgeRequests = new Map();
        const getDocument = () => scope.document || (typeof document !== 'undefined' ? document : null);
        const setValue = (...args) => typeof scope.setGradioTextboxValue === 'function' ? scope.setGradioTextboxValue(...args) : false;
        const clickButton = (...args) => typeof scope.clickGradioButton === 'function' ? scope.clickGradioButton(...args) : false;
        const setTimer = (...args) => typeof scope.setTimeout === 'function' ? scope.setTimeout(...args) : setTimeout(...args);
        const clearTimer = (...args) => typeof scope.clearTimeout === 'function' ? scope.clearTimeout(...args) : clearTimeout(...args);

        function isCanvasBridgeReady() {
            const doc = getDocument();
            return !!(
                doc
                && doc.getElementById?.('canvas_workbench_request')
                && doc.getElementById?.('canvas_workbench_response')
                && doc.getElementById?.('canvas_workbench_bridge_btn')
                && typeof scope.setGradioTextboxValue === 'function'
                && typeof scope.clickGradioButton === 'function'
            );
        }

        function bindCanvasBridgeResponseListener() {
            const doc = getDocument();
            const root = doc?.getElementById?.('canvas_workbench_response');
            const field = root?.querySelector?.('textarea, input');
            if (!field || field.__simpaiCanvasBridgeBound) return;
            field.__simpaiCanvasBridgeBound = true;
            const handle = () => {
                let response = null;
                try {
                    response = JSON.parse(String(field.value || '{}'));
                } catch (err) {
                    return;
                }
                const requestId = response && response.request_id ? String(response.request_id) : '';
                if (!requestId || !bridgeRequests.has(requestId)) return;
                const pending = bridgeRequests.get(requestId);
                bridgeRequests.delete(requestId);
                clearTimer(pending.timer);
                pending.resolve(response);
            };
            field.addEventListener('input', handle);
            field.addEventListener('change', handle);
        }

        function sendCanvasBridgeRequest(action, payload, timeoutMs) {
            bindCanvasBridgeResponseListener();
            if (!isCanvasBridgeReady()) {
                return Promise.resolve({ ok: false, error: 'canvas bridge not ready' });
            }
            const requestId = typeof scope.uid === 'function'
                ? scope.uid('canvas_req')
                : `canvas_req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
            const body = JSON.stringify({
                request_id: requestId,
                action,
                payload: payload || {},
                t: Date.now()
            });
            return new Promise((resolve) => {
                const timer = setTimer(() => {
                    if (!bridgeRequests.has(requestId)) return;
                    bridgeRequests.delete(requestId);
                    resolve({ ok: false, request_id: requestId, action, error: 'canvas bridge timeout' });
                }, Math.max(2000, timeoutMs || 30000));
                bridgeRequests.set(requestId, { resolve, timer });
                const ok = setValue('canvas_workbench_request', body);
                if (!ok) {
                    clearTimer(timer);
                    bridgeRequests.delete(requestId);
                    resolve({ ok: false, request_id: requestId, action, error: 'request textbox missing' });
                    return;
                }
                if (!clickButton('canvas_workbench_bridge_btn')) {
                    clearTimer(timer);
                    bridgeRequests.delete(requestId);
                    resolve({ ok: false, request_id: requestId, action, error: 'bridge button missing' });
                }
            });
        }

        return {
            isCanvasBridgeReady,
            bindCanvasBridgeResponseListener,
            sendCanvasBridgeRequest
        };
    }

    window.SimpAICanvasWorkbenchBridgeTransport = Object.assign({}, window.SimpAICanvasWorkbenchBridgeTransport || {}, {
        createCanvasBridgeTransportController
    });
})();
