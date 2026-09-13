(function () {
    'use strict';

    function createCanvasMarqueeController(context) {
        const scope = context || {};
        const sourceObject = (name) => {
            const value = scope[name];
            return value && typeof value === 'object' ? value : {};
        };
        const viewportSource = sourceObject('viewportSource');
        const domSource = sourceObject('domSource');
        const windowSource = sourceObject('windowSource');
        const selectionSource = sourceObject('selectionSource');
        const runtimeSource = sourceObject('runtimeSource');
        const spatialSource = sourceObject('spatialSource');
        const utilitySource = sourceObject('utilitySource');
        const uiSource = sourceObject('uiSource');
        const minimapSource = sourceObject('minimapSource');
        const renderSource = sourceObject('renderSource');
        const sourceCall = (source, name, fallback, ...args) => typeof source[name] === 'function'
            ? source[name](...args)
            : fallback;
        const getViewport = () => sourceCall(viewportSource, 'getViewport', null);
        const getRoot = () => sourceCall(domSource, 'getRoot', null);
        const getDocument = () => typeof domSource.getDocument === 'function'
            ? domSource.getDocument()
            : (typeof document !== 'undefined' ? document : null);
        const getWindow = () => typeof windowSource.getWindow === 'function'
            ? (windowSource.getWindow() || {})
            : (typeof window !== 'undefined' ? window : {});
        const getSelectedNodeIds = () => sourceCall(selectionSource, 'getSelectedNodeIds', new Set()) || new Set();
        const getPerfStats = () => sourceCall(runtimeSource, 'getPerfStats', {}) || {};
        const getMarqueeNodeRecords = (selectionRect) => sourceCall(spatialSource, 'getMarqueeNodeRecords', [], selectionRect) || [];
        const getClientWorld = (clientX, clientY) => sourceCall(utilitySource, 'clientToWorld', { x: 0, y: 0 }, clientX, clientY) || { x: 0, y: 0 };
        const getPerformanceNow = () => typeof runtimeSource.performanceNow === 'function'
            ? runtimeSource.performanceNow()
            : (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
        const uiCall = (name, fallback, ...args) => sourceCall(uiSource, name, fallback, ...args);
        const selectionCall = (name, fallback, ...args) => sourceCall(selectionSource, name, fallback, ...args);
        const minimapCall = (name, fallback, ...args) => sourceCall(minimapSource, name, fallback, ...args);
        const renderCall = (name, fallback, ...args) => sourceCall(renderSource, name, fallback, ...args);
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
            uiCall('hideCanvasTooltip', undefined);
            uiCall('hideHoverPreview', undefined);
            uiCall('closePreviewSelectMenu', undefined);
            uiCall('setSuppressWheelUntil', undefined, getPerformanceNow() + 420);
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
            selectionCall('applyMarqueeSelection', undefined, next);
            selectionCall('updateSelectionDomClasses', undefined);
            minimapCall('invalidateMinimapStaticCache', undefined);
            minimapCall('scheduleMinimapRender', undefined);
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
            selectionCall('updateSelectionDomClasses', undefined);
            renderCall('renderSelectedChainOverlay', undefined);
            renderCall('renderInspector', undefined);
            minimapCall('flushMinimapRender', undefined);
            uiCall('renderCanvasAgentPanel', undefined);
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
