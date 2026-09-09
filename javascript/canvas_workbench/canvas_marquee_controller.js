(function () {
    'use strict';

    function createCanvasMarqueeController(context) {
        const scope = context || {};
        const getViewport = () => typeof scope.getViewport === 'function' ? scope.getViewport() : null;
        const getRoot = () => typeof scope.getRoot === 'function' ? scope.getRoot() : null;
        const getDocument = () => typeof scope.getDocument === 'function'
            ? scope.getDocument()
            : (typeof document !== 'undefined' ? document : null);
        const getWindow = () => typeof scope.getWindow === 'function'
            ? (scope.getWindow() || {})
            : (typeof window !== 'undefined' ? window : {});
        const getSelectedNodeIds = () => typeof scope.getSelectedNodeIds === 'function'
            ? (scope.getSelectedNodeIds() || new Set())
            : new Set();
        const getPerfStats = () => typeof scope.getPerfStats === 'function' ? (scope.getPerfStats() || {}) : {};
        const getMarqueeNodeRecords = (selectionRect) => typeof scope.getMarqueeNodeRecords === 'function'
            ? (scope.getMarqueeNodeRecords(selectionRect) || [])
            : [];
        const getClientWorld = (clientX, clientY) => typeof scope.clientToWorld === 'function'
            ? (scope.clientToWorld(clientX, clientY) || { x: 0, y: 0 })
            : { x: clientX, y: clientY };
        const call = (name, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : undefined;
        let marqueeState = null;

        function debugMarqueeEvent(label, evt, extra) {
            const currentWindow = getWindow();
            if (!currentWindow.SimpAICanvasDebugMarquee) return;
            console.debug('[SimpAI Canvas marquee]', label, {
                pointerId: evt?.pointerId,
                pointerType: evt?.pointerType,
                buttons: evt?.buttons,
                button: evt?.button,
                ctrlKey: evt?.ctrlKey,
                shiftKey: evt?.shiftKey,
                target: evt?.target?.className || evt?.target?.tagName,
                state: marqueeState ? {
                    pointerId: marqueeState.pointerId,
                    pointerType: marqueeState.pointerType,
                    moves: marqueeState.moves || 0
                } : null,
                extra: extra || null
            });
        }

        function updateMarqueeBox(clientX, clientY) {
            const root = getRoot();
            if (!root || !marqueeState) return;
            let box = root.querySelector?.('.sai-selection-marquee');
            const doc = getDocument();
            if (!box && doc?.createElement) {
                box = doc.createElement('div');
                box.className = 'sai-selection-marquee';
                root.appendChild?.(box);
            }
            if (!box) return;
            const left = Math.min(marqueeState.startClientX, clientX);
            const top = Math.min(marqueeState.startClientY, clientY);
            const width = Math.abs(clientX - marqueeState.startClientX);
            const height = Math.abs(clientY - marqueeState.startClientY);
            box.style.left = `${left}px`;
            box.style.top = `${top}px`;
            box.style.width = `${width}px`;
            box.style.height = `${height}px`;
        }

        function startMarqueeSelection(evt, world) {
            call('hideCanvasTooltip');
            call('hideHoverPreview');
            call('closePreviewSelectMenu');
            call('setSuppressWheelUntil', (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) + 420);
            let captureOk = true;
            const viewport = getViewport();
            try { viewport?.setPointerCapture?.(evt.pointerId); } catch (err) { captureOk = false; }
            marqueeState = {
                pointerId: evt.pointerId,
                pointerType: evt.pointerType || 'mouse',
                startClientX: evt.clientX,
                startClientY: evt.clientY,
                startWorldX: world.x,
                startWorldY: world.y,
                additive: evt.shiftKey || evt.ctrlKey || evt.metaKey,
                base: new Set(getSelectedNodeIds()),
                moves: 0,
                captureOk
            };
            debugMarqueeEvent('start', evt, { captureOk });
            updateMarqueeBox(evt.clientX, evt.clientY);
            const doc = getDocument();
            doc?.addEventListener('pointermove', onMarqueeMove, true);
            doc?.addEventListener('pointerup', stopMarqueeSelection, true);
            doc?.addEventListener('pointercancel', cancelMarqueeSelection, true);
        }

        function onMarqueeMove(evt) {
            if (!marqueeState || !evt || evt.pointerId !== marqueeState.pointerId) return;
            evt.preventDefault?.();
            marqueeState.moves = (marqueeState.moves || 0) + 1;
            updateMarqueeBox(evt.clientX, evt.clientY);
            const current = getClientWorld(evt.clientX, evt.clientY);
            const left = Math.min(marqueeState.startWorldX, current.x);
            const right = Math.max(marqueeState.startWorldX, current.x);
            const top = Math.min(marqueeState.startWorldY, current.y);
            const bottom = Math.max(marqueeState.startWorldY, current.y);
            const selectionRect = {
                x: left,
                y: top,
                w: Math.max(1, right - left),
                h: Math.max(1, bottom - top)
            };
            const next = marqueeState.additive ? new Set(marqueeState.base) : new Set();
            getMarqueeNodeRecords(selectionRect).forEach((record) => {
                if (record?.node?.id) next.add(record.node.id);
            });
            getPerfStats().marqueeSelectedNodes = next.size;
            call('applyMarqueeSelection', next);
            call('updateSelectionDomClasses');
            call('invalidateMinimapStaticCache');
            call('scheduleMinimapRender');
            updateMarqueeBox(evt.clientX, evt.clientY);
        }

        function stopMarqueeSelection(evt) {
            if (!marqueeState) return;
            debugMarqueeEvent('stop', evt);
            if (evt && evt.pointerId === marqueeState.pointerId) onMarqueeMove(evt);
            marqueeState = null;
            const root = getRoot();
            const box = root?.querySelector?.('.sai-selection-marquee');
            if (box) box.remove?.();
            const doc = getDocument();
            doc?.removeEventListener('pointermove', onMarqueeMove, true);
            doc?.removeEventListener('pointerup', stopMarqueeSelection, true);
            doc?.removeEventListener('pointercancel', cancelMarqueeSelection, true);
            call('updateSelectionDomClasses');
            call('renderSelectedChainOverlay');
            call('renderInspector');
            call('flushMinimapRender');
            call('renderCanvasAgentPanel');
        }

        function cancelMarqueeSelection(evt) {
            if (!marqueeState) return;
            debugMarqueeEvent('cancel', evt);
            if ((marqueeState.pointerType || evt?.pointerType) === 'mouse') return;
            stopMarqueeSelection(evt);
        }

        return {
            startMarqueeSelection,
            onMarqueeMove,
            stopMarqueeSelection,
            cancelMarqueeSelection,
            isSelecting: () => !!marqueeState
        };
    }

    window.SimpAICanvasWorkbenchMarquee = Object.assign({}, window.SimpAICanvasWorkbenchMarquee || {}, {
        createCanvasMarqueeController
    });
})();
