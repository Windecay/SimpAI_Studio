(function () {
    'use strict';

    function createCanvasTextControlPointerController(context) {
        const scope = context || {};
        const getRoot = () => typeof scope.getRoot === 'function' ? scope.getRoot() : null;
        const getDocument = () => typeof scope.getDocument === 'function'
            ? scope.getDocument()
            : (typeof document !== 'undefined' ? document : null);
        const getWindow = () => typeof scope.getWindow === 'function'
            ? scope.getWindow()
            : (typeof window !== 'undefined' ? window : null);
        const getEditableTextControl = (target) => typeof scope.getEditableTextControl === 'function'
            ? scope.getEditableTextControl(target)
            : null;
        const isEditableElement = (target) => typeof scope.isEditableElement === 'function'
            ? !!scope.isEditableElement(target)
            : false;
        let pointerState = null;

        function onTextControlPointerDown(evt) {
            const root = getRoot();
            if (!root || root.hidden || !evt || evt.button !== 0) return;
            const control = getEditableTextControl(evt.target);
            if (!control || control.disabled) return;
            pointerState = {
                pointerId: evt.pointerId,
                control
            };
            root.classList.add('is-text-selecting');
            try { control.setPointerCapture?.(evt.pointerId); } catch (err) {}
            const doc = getDocument();
            doc?.addEventListener('pointermove', onTextControlPointerMove, true);
            doc?.addEventListener('pointerup', stopTextControlPointerSelection, true);
            doc?.addEventListener('pointercancel', stopTextControlPointerSelection, true);
        }

        function onTextControlPointerMove(evt) {
            if (!pointerState || !evt || evt.pointerId !== pointerState.pointerId) return;
            const control = pointerState.control;
            if (!control || !control.isConnected) {
                stopTextControlPointerSelection(evt);
                return;
            }
            getRoot()?.classList.add('is-text-selecting');
            if (!control.contains(evt.target) && !isEditableElement(evt.target)) {
                evt.stopPropagation();
            }
        }

        function stopTextControlPointerSelection(evt) {
            if (!pointerState) return;
            if (evt && evt.pointerId !== pointerState.pointerId) return;
            const { control, pointerId } = pointerState;
            pointerState = null;
            try { control?.releasePointerCapture?.(pointerId); } catch (err) {}
            const doc = getDocument();
            doc?.removeEventListener('pointermove', onTextControlPointerMove, true);
            doc?.removeEventListener('pointerup', stopTextControlPointerSelection, true);
            doc?.removeEventListener('pointercancel', stopTextControlPointerSelection, true);
            const win = getWindow();
            const clearClass = () => {
                if (!pointerState) getRoot()?.classList.remove('is-text-selecting');
            };
            if (typeof win?.setTimeout === 'function') win.setTimeout(clearClass, 0);
            else clearClass();
        }

        return {
            onTextControlPointerDown,
            onTextControlPointerMove,
            stopTextControlPointerSelection,
            isSelecting: () => !!pointerState
        };
    }

    window.SimpAICanvasWorkbenchTextControlPointer = Object.assign({}, window.SimpAICanvasWorkbenchTextControlPointer || {}, {
        createCanvasTextControlPointerController
    });
})();
