(function () {
    'use strict';

    function createCanvasOutpaintController(context) {
        const scope = context || {};
        const getDocument = () => typeof scope.getDocument === 'function'
            ? scope.getDocument()
            : (typeof document !== 'undefined' ? document : null);
        const getState = () => typeof scope.getOutpaintOverlayState === 'function'
            ? scope.getOutpaintOverlayState()
            : null;
        const getTargetNode = () => typeof scope.getOutpaintTargetNode === 'function'
            ? scope.getOutpaintTargetNode()
            : null;
        const getMediaSize = (node) => typeof scope.getOutpaintMediaSize === 'function'
            ? scope.getOutpaintMediaSize(node)
            : null;
        const getViewportZoom = () => {
            const value = typeof scope.getViewportZoom === 'function' ? scope.getViewportZoom() : 1;
            return Math.max(0.01, Number(value) || 1);
        };
        const clamp = typeof scope.clamp === 'function'
            ? scope.clamp
            : (value, min, max) => Math.max(min, Math.min(max, value));
        const call = (name, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : undefined;
        const edgeKeys = {
            top: 'up',
            bottom: 'down',
            left: 'left',
            right: 'right'
        };
        let dragState = null;

        function edgeValue(state, edge) {
            const key = edgeKeys[edge];
            return key ? Number(state?.[key] || 0) : 0;
        }

        function setEdgeValue(state, edge, value) {
            const key = edgeKeys[edge];
            if (key) state[key] = value;
        }

        function startOutpaintEdgeDrag(edge, evt) {
            const state = getState();
            if (!state?.active || !edgeKeys[edge] || !evt) return;
            evt.preventDefault();
            evt.stopPropagation();
            dragState = {
                pointerId: evt.pointerId,
                edge,
                startX: evt.clientX,
                startY: evt.clientY,
                initialValue: edgeValue(state, edge)
            };
            const doc = getDocument();
            doc?.addEventListener('pointermove', onOutpaintDragMove, true);
            doc?.addEventListener('pointerup', stopOutpaintEdgeDrag, true);
            doc?.addEventListener('pointercancel', stopOutpaintEdgeDrag, true);
        }

        function onOutpaintDragMove(evt) {
            const current = dragState;
            if (!current || !evt || evt.pointerId !== current.pointerId) return;
            const state = getState();
            const node = getTargetNode();
            if (!state?.active || !node) return;
            const size = getMediaSize(node) || {};
            const mediaW = Math.max(1, Number(size.width ?? size.w) || 1);
            const mediaH = Math.max(1, Number(size.height ?? size.h) || 1);
            const zoom = getViewportZoom();
            const dx = (evt.clientX - current.startX) / zoom;
            const dy = (evt.clientY - current.startY) / zoom;
            let pixelDelta = 0;
            if (current.edge === 'top') pixelDelta = -dy;
            else if (current.edge === 'bottom') pixelDelta = dy;
            else if (current.edge === 'left') pixelDelta = -dx;
            else if (current.edge === 'right') pixelDelta = dx;
            const baseSize = current.edge === 'top' || current.edge === 'bottom' ? mediaH : mediaW;
            setEdgeValue(state, current.edge, clamp(Math.round(current.initialValue + (pixelDelta / baseSize) * 100), 0, 100));
            call('syncOutpaintOverlayPosition');
            syncOutpaintAgentPanel();
            evt.preventDefault();
        }

        function persistOutpaintSettings() {
            const state = getState();
            if (!state) return;
            try {
                call('setCanvasAgentSettingsPatch', {
                    outpaintUpPercent: state.up,
                    outpaintDownPercent: state.down,
                    outpaintLeftPercent: state.left,
                    outpaintRightPercent: state.right
                }, { silentHistory: true });
            } catch (err) {}
        }

        function stopOutpaintEdgeDrag(evt) {
            if (!dragState) return;
            if (evt && evt.pointerId !== dragState.pointerId) return;
            const state = dragState;
            removeDragListeners();
            dragState = null;
            if (!state) return;
            persistOutpaintSettings();
        }

        function removeDragListeners() {
            const doc = getDocument();
            doc?.removeEventListener('pointermove', onOutpaintDragMove, true);
            doc?.removeEventListener('pointerup', stopOutpaintEdgeDrag, true);
            doc?.removeEventListener('pointercancel', stopOutpaintEdgeDrag, true);
        }

        function cancelOutpaintEdgeDrag() {
            if (!dragState) return;
            dragState = null;
            removeDragListeners();
        }

        function updateOutpaintFromSlider(edge, value) {
            const state = getState();
            if (!state?.active || !edgeKeys[edge]) return;
            setEdgeValue(state, edge, clamp(Number(value) || 0, 0, 100));
            call('syncOutpaintOverlayPosition');
        }

        function onOutpaintOverlayPointerDown(evt) {
            const edge = evt?.target?.closest?.('.sai-outpaint-edge');
            if (edge) {
                startOutpaintEdgeDrag(edge.getAttribute('data-edge'), evt);
                return;
            }
            evt?.stopPropagation?.();
        }

        function onOutpaintSliderInput(evt) {
            const slider = evt?.target?.closest?.('[data-outpaint-slider]');
            const state = getState();
            if (!slider || !state?.active) return false;
            const edge = slider.getAttribute('data-outpaint-slider');
            const panel = typeof scope.getCanvasAgentPanel === 'function' ? scope.getCanvasAgentPanel() : null;
            const output = panel?.querySelector?.(`[data-outpaint-output="${edge}"]`);
            if (output) output.textContent = slider.value + '%';
            updateOutpaintFromSlider(edge, slider.value);
            return true;
        }

        function syncOutpaintAgentPanel() {
            const state = getState();
            const panel = typeof scope.getCanvasAgentPanel === 'function' ? scope.getCanvasAgentPanel() : null;
            if (!state?.active || !panel) return;
            Object.keys(edgeKeys).forEach(edge => {
                const slider = panel.querySelector?.(`[data-outpaint-slider="${edge}"]`);
                const output = panel.querySelector?.(`[data-outpaint-output="${edge}"]`);
                const value = edgeValue(state, edge);
                if (slider) slider.value = value;
                if (output) output.textContent = `${value}%`;
            });
        }

        return {
            startOutpaintEdgeDrag,
            onOutpaintDragMove,
            stopOutpaintEdgeDrag,
            cancelOutpaintEdgeDrag,
            onOutpaintOverlayPointerDown,
            onOutpaintSliderInput,
            updateOutpaintFromSlider,
            syncOutpaintAgentPanel,
            isDragging: () => !!dragState
        };
    }

    window.SimpAICanvasWorkbenchOutpaint = Object.assign({}, window.SimpAICanvasWorkbenchOutpaint || {}, {
        createCanvasOutpaintController
    });
})();
