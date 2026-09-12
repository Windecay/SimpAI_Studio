(function () {
    'use strict';

    function createCanvasWorkbenchInputEventContext(source) {
        const scope = source || {};
        const getRoot = () => typeof scope.getRoot === 'function' ? scope.getRoot() : null;
        const getDocument = () => typeof scope.getDocument === 'function'
            ? scope.getDocument()
            : (typeof document !== 'undefined' ? document : null);

        function onCanvasInput(evt) {
            if (typeof scope.handleDanbooruAutocompleteInput === 'function'
                && scope.handleDanbooruAutocompleteInput(evt)) {
                return true;
            }
            scope.onCanvasAgentInput?.(evt);
            return false;
        }

        function bindCanvasInputEvents() {
            const root = getRoot();
            if (!root) return false;

            root.addEventListener('scroll', scope.onCanvasWorkbenchScroll, true);
            root.addEventListener('keydown', scope.onPreviewSelectKeyDown, true);
            root.addEventListener('keydown', scope.onDanbooruAutocompleteKeyDown, true);
            root.addEventListener('input', onCanvasInput);
            root.addEventListener('change', scope.onCanvasAgentChange);
            root.addEventListener('keydown', scope.onCanvasAgentKeyDown);
            root.addEventListener('contextmenu', scope.onTextControlContextMenu, true);

            root.addEventListener('wheel', scope.onWorkbenchWheelBoundary, { passive: false, capture: true });
            root.addEventListener('pointerdown', scope.onPreviewSelectPointerDown, true);
            root.addEventListener('pointerdown', scope.onTextControlPointerDown, true);
            root.addEventListener('pointerdown', scope.onDanbooruAutocompletePointerDown, true);
            root.addEventListener('pointerover', scope.onTooltipPointerOver, true);
            root.addEventListener('pointermove', scope.onTooltipPointerMove, true);
            root.addEventListener('pointerout', scope.onTooltipPointerOut, true);
            root.addEventListener('pointerover', scope.onHoverPreviewPointerOver, true);
            root.addEventListener('pointermove', scope.onHoverPreviewPointerMove, true);
            root.addEventListener('pointerout', scope.onHoverPreviewPointerOut, true);
            root.addEventListener('focusin', scope.onTooltipFocusIn, true);
            root.addEventListener('focusin', scope.onHoverPreviewFocusIn, true);
            root.addEventListener('focusin', scope.onDanbooruAutocompleteFocusIn, true);
            root.addEventListener('focusout', scope.hideCanvasTooltip, true);
            root.addEventListener('focusout', scope.hideHoverPreview, true);
            root.addEventListener('focusout', scope.onDanbooruAutocompleteFocusOut, true);

            const doc = getDocument();
            doc?.addEventListener('keydown', scope.onDocumentKeyDown, true);
            doc?.addEventListener('paste', scope.onDocumentPaste, true);
            return true;
        }

        return {
            onCanvasInput,
            bindCanvasInputEvents
        };
    }

    window.SimpAICanvasWorkbenchInputEventContext = Object.assign(
        {},
        window.SimpAICanvasWorkbenchInputEventContext || {},
        { createCanvasWorkbenchInputEventContext }
    );
})();
