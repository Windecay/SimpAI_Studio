(function () {
    'use strict';

    function createCanvasResolutionDragController(context) {
        const scope = context || {};
        const getDocument = () => typeof scope.getDocument === 'function'
            ? scope.getDocument()
            : (typeof document !== 'undefined' ? document : null);
        const getResolutionRenderValues = (node) => typeof scope.getResolutionRenderValues === 'function'
            ? (scope.getResolutionRenderValues(node) || {})
            : {};
        const getResolutionPreview = (values) => typeof scope.getResolutionPreview === 'function'
            ? (scope.getResolutionPreview(values, []) || {})
            : {};
        const clamp = typeof scope.clamp === 'function'
            ? scope.clamp
            : (value, min, max) => Math.max(min, Math.min(max, value));
        const quantizeResolutionValue = (value, step) => {
            if (typeof scope.quantizeResolutionValue === 'function') return scope.quantizeResolutionValue(value, step);
            return Math.round(Number(value || 0) / Math.max(1, Number(step || 1))) * Math.max(1, Number(step || 1));
        };
        const nowIso = () => typeof scope.nowIso === 'function' ? scope.nowIso() : new Date().toISOString();
        const call = (name, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : undefined;
        let dragState = null;

        function startResolutionDrag(node, evt) {
            const area = evt?.target?.closest?.('[data-resolution-drag-area]')
                || evt?.currentTarget?.querySelector?.('[data-resolution-drag-area]');
            if (!node || !area || !evt) return;
            const values = getResolutionRenderValues(node);
            if (values.profile && values.profile.interactive === false) return;
            if (values.random_aspect_ratio || values.random_aspect_ratio_checkbox) return;
            const preview = getResolutionPreview(values);
            const start = {
                clientX: evt.clientX,
                clientY: evt.clientY,
                pointerId: evt.pointerId,
                width: Math.max(64, Number(values.width || preview.width) || 1024),
                height: Math.max(64, Number(values.height || preview.height) || 1024),
                multiplier: clamp(Number(values.multiplier || 1) || 1, 1, 2),
                boxW: Math.max(1, Number(preview.boxW) || 1),
                boxH: Math.max(1, Number(preview.boxH) || 1)
            };
            dragState = { node, area, start };
            try { area.setPointerCapture?.(evt.pointerId); } catch (err) {}
            evt.preventDefault();
            evt.stopPropagation();
            updateResolutionFromDrag(node, area, evt, start);
            const doc = getDocument();
            doc?.addEventListener('pointermove', onResolutionDragMove, true);
            doc?.addEventListener('pointerup', stopResolutionDrag, true);
            doc?.addEventListener('pointercancel', stopResolutionDrag, true);
        }

        function updateResolutionFromDrag(node, area, evt, start) {
            if (!node || !area || !evt || !start) return;
            if (start.pointerId !== undefined && evt.pointerId !== start.pointerId) return;
            const rect = area.getBoundingClientRect?.();
            if (!rect?.width || !rect?.height) return;
            const values = node.config?.values || {};
            const quantize = Math.max(1, Number(values.quantize || 8));
            let width = Math.max(64, Number(start.width || values.width || 1024));
            let height = Math.max(64, Number(start.height || values.height || 1024));
            const pixelsPerUnitX = Math.max(0.02, (Number(start.boxW || 50) / 100) * rect.width / Math.max(1, width * Number(start.multiplier || 1)));
            const pixelsPerUnitY = Math.max(0.02, (Number(start.boxH || 50) / 100) * rect.height / Math.max(1, height * Number(start.multiplier || 1)));
            width += (evt.clientX - Number(start.clientX ?? evt.clientX)) / pixelsPerUnitX;
            height += (evt.clientY - Number(start.clientY ?? evt.clientY)) / pixelsPerUnitY;
            if (values.edit_mode === 'proportional' || values.ratio_lock) {
                const startRatio = Math.max(0.0001, Number(start.width || width) / Math.max(1, Number(start.height || height)));
                const sx = width / Math.max(1, Number(start.width || width));
                const sy = height / Math.max(1, Number(start.height || height));
                const factor = Math.max(0.1, sx, sy);
                width = Number(start.width || width) * factor;
                height = width / startRatio;
            }
            width = quantizeResolutionValue(clamp(width, 64, 4096), quantize);
            height = quantizeResolutionValue(clamp(height, 64, 4096), quantize);
            node.config = node.config || { values: {} };
            node.config.values = Object.assign({}, node.config.values || {}, { width, height, manual: true });
            node.config.updated_at = nowIso();
            call('applyConfigNodeToPreset', node);
            const nodeEl = area.closest?.('[data-node-id]');
            if (nodeEl) {
                const widthInput = nodeEl.querySelector?.('[data-config-param="width"]');
                const heightInput = nodeEl.querySelector?.('[data-config-param="height"]');
                if (widthInput) widthInput.value = String(width);
                if (heightInput) heightInput.value = String(height);
                const preview = getResolutionPreview(node.config.values);
                const box = nodeEl.querySelector?.('.sai-resolution-preview-box');
                if (box) {
                    box.style.width = `${preview.boxW}%`;
                    box.style.height = `${preview.boxH}%`;
                    const label = box.querySelector?.('span');
                    if (label) label.textContent = preview.label;
                }
            }
            evt.preventDefault?.();
        }

        function onResolutionDragMove(evt) {
            if (!dragState) return;
            updateResolutionFromDrag(dragState.node, dragState.area, evt, dragState.start);
        }

        function removeDragListeners() {
            const doc = getDocument();
            doc?.removeEventListener('pointermove', onResolutionDragMove, true);
            doc?.removeEventListener('pointerup', stopResolutionDrag, true);
            doc?.removeEventListener('pointercancel', stopResolutionDrag, true);
        }

        function stopResolutionDrag(evt) {
            if (!dragState) return;
            if (evt && dragState.start.pointerId !== undefined && evt.pointerId !== dragState.start.pointerId) return;
            removeDragListeners();
            dragState = null;
            call('scheduleSave');
        }

        function cancelResolutionDrag() {
            if (!dragState) return;
            removeDragListeners();
            dragState = null;
        }

        return {
            startResolutionDrag,
            updateResolutionFromDrag,
            onResolutionDragMove,
            stopResolutionDrag,
            cancelResolutionDrag,
            isDragging: () => !!dragState,
            getDraggingNodeId: () => dragState?.node?.id || null
        };
    }

    window.SimpAICanvasWorkbenchResolutionDrag = Object.assign({}, window.SimpAICanvasWorkbenchResolutionDrag || {}, {
        createCanvasResolutionDragController
    });
})();
