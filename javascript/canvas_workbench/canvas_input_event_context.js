(function () {
    'use strict';

    function createCanvasWorkbenchInputEventContext(source) {
        const scope = source || {};
        const domSource = scope.domSource || {};
        const inputSource = scope.inputSource || {};
        const previewSource = scope.previewSource || {};
        const agentSource = scope.agentSource || {};
        const controlSource = scope.controlSource || {};
        const interactionSource = scope.interactionSource || {};
        const documentSource = scope.documentSource || {};
        const getRoot = () => typeof domSource.getRoot === 'function' ? domSource.getRoot() : null;
        const getDocument = () => typeof domSource.getDocument === 'function'
            ? domSource.getDocument()
            : (typeof document !== 'undefined' ? document : null);

        function onCanvasInput(evt) {
            if (typeof inputSource.handleDanbooruAutocompleteInput === 'function'
                && inputSource.handleDanbooruAutocompleteInput(evt)) {
                return true;
            }
            inputSource.onCanvasAgentInput?.(evt);
            return false;
        }

        function bindCanvasInputEvents() {
            const root = getRoot();
            if (!root) return false;

            root.addEventListener('scroll', previewSource.onCanvasWorkbenchScroll, true);
            root.addEventListener('keydown', previewSource.onPreviewSelectKeyDown, true);
            root.addEventListener('keydown', previewSource.onDanbooruAutocompleteKeyDown, true);
            root.addEventListener('input', onCanvasInput);
            root.addEventListener('change', agentSource.onCanvasAgentChange);
            root.addEventListener('keydown', agentSource.onCanvasAgentKeyDown);
            root.addEventListener('contextmenu', controlSource.onTextControlContextMenu, true);

            root.addEventListener('wheel', interactionSource.onWorkbenchWheelBoundary, { passive: false, capture: true });
            root.addEventListener('pointerdown', previewSource.onPreviewSelectPointerDown, true);
            root.addEventListener('pointerdown', controlSource.onTextControlPointerDown, true);
            root.addEventListener('pointerdown', previewSource.onDanbooruAutocompletePointerDown, true);
            root.addEventListener('pointerover', previewSource.onTooltipPointerOver, true);
            root.addEventListener('pointermove', previewSource.onTooltipPointerMove, true);
            root.addEventListener('pointerout', previewSource.onTooltipPointerOut, true);
            root.addEventListener('pointerover', previewSource.onHoverPreviewPointerOver, true);
            root.addEventListener('pointermove', previewSource.onHoverPreviewPointerMove, true);
            root.addEventListener('pointerout', previewSource.onHoverPreviewPointerOut, true);
            root.addEventListener('focusin', previewSource.onTooltipFocusIn, true);
            root.addEventListener('focusin', previewSource.onHoverPreviewFocusIn, true);
            root.addEventListener('focusin', previewSource.onDanbooruAutocompleteFocusIn, true);
            root.addEventListener('focusout', previewSource.hideCanvasTooltip, true);
            root.addEventListener('focusout', previewSource.hideHoverPreview, true);
            root.addEventListener('focusout', previewSource.onDanbooruAutocompleteFocusOut, true);

            const doc = getDocument();
            doc?.addEventListener('keydown', documentSource.onDocumentKeyDown, true);
            doc?.addEventListener('paste', documentSource.onDocumentPaste, true);
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
