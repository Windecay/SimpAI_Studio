(function () {
    'use strict';

    const modules = {
        viewportWheel: window.SimpAICanvasWorkbenchViewportWheel || {},
        mediaBrowserDrag: window.SimpAICanvasWorkbenchMediaBrowserDrag || {},
        viewportDrop: window.SimpAICanvasWorkbenchViewportDrop || {},
        viewportContext: window.SimpAICanvasWorkbenchViewportContext || {},
        keyboard: window.SimpAICanvasWorkbenchKeyboard || {},
        documentPaste: window.SimpAICanvasWorkbenchDocumentPaste || {},
        inputHandle: window.SimpAICanvasWorkbenchInputHandle || {},
        noteTail: window.SimpAICanvasWorkbenchNoteTail || {},
        edgeInteraction: window.SimpAICanvasWorkbenchEdgeInteraction || {}
    };

    function createController(module, factoryName, context) {
        const create = module && module[factoryName];
        return typeof create === 'function' ? (create(context) || {}) : {};
    }

    function method(controller, name) {
        return controller && typeof controller[name] === 'function' ? controller[name] : undefined;
    }

    function createCanvasWorkbenchInputInteractionContext(source) {
        const scope = source || {};
        const viewportWheelSource = scope.viewportWheelSource || {};
        const mediaBrowserDragSource = scope.mediaBrowserDragSource || {};
        const viewportDropSource = scope.viewportDropSource || {};
        const viewportContextSource = scope.viewportContextSource || {};
        const keyboardSource = scope.keyboardSource || {};
        const documentPasteSource = scope.documentPasteSource || {};
        const inputHandleSource = scope.inputHandleSource || {};
        const noteTailSource = scope.noteTailSource || {};
        const edgeInteractionSource = scope.edgeInteractionSource || {};
        const controllers = {};

        controllers.viewportWheel = createController(
            modules.viewportWheel,
            'createCanvasViewportWheelController',
            viewportWheelSource
        );

        controllers.mediaBrowserDrag = createController(
            modules.mediaBrowserDrag,
            'createCanvasMediaBrowserDragController',
            mediaBrowserDragSource
        );
        const mediaBrowserDragMethod = name => method(controllers.mediaBrowserDrag, name);

        controllers.viewportDrop = createController(
            modules.viewportDrop,
            'createCanvasViewportDropController',
            Object.assign({}, viewportDropSource, {
                mediaBrowserSource: Object.assign({}, viewportDropSource.mediaBrowserSource || {}, {
                    mediaBrowserPayloadFromDataTransfer: (...args) => mediaBrowserDragMethod('mediaBrowserPayloadFromDataTransfer')?.(...args),
                    clearMediaBrowserDragPayload: (...args) => mediaBrowserDragMethod('clearMediaBrowserDragPayload')?.(...args),
                    addMediaBrowserPayloadToCanvas: (...args) => mediaBrowserDragMethod('addMediaBrowserPayloadToCanvas')?.(...args),
                })
            })
        );

        controllers.viewportContext = createController(
            modules.viewportContext,
            'createCanvasViewportContextController',
            viewportContextSource
        );

        controllers.keyboard = createController(
            modules.keyboard,
            'createCanvasKeyboardController',
            keyboardSource
        );

        controllers.documentPaste = createController(
            modules.documentPaste,
            'createCanvasDocumentPasteController',
            documentPasteSource
        );

        controllers.inputHandle = createController(
            modules.inputHandle,
            'createCanvasInputHandleController',
            inputHandleSource
        );

        controllers.noteTail = createController(
            modules.noteTail,
            'createCanvasNoteTailController',
            noteTailSource
        );

        controllers.edgeInteraction = createController(
            modules.edgeInteraction,
            'createCanvasEdgeInteractionController',
            Object.assign({}, edgeInteractionSource, {
                noteTailSource: Object.assign({}, edgeInteractionSource.noteTailSource || {}, {
                    startNoteTailDrag: (...args) => method(controllers.noteTail, 'startNoteTailDrag')?.(...args)
                })
            })
        );

        return {
            CANVAS_VIEWPORT_WHEEL_CONTROLLER: controllers.viewportWheel,
            onViewportWheel: method(controllers.viewportWheel, 'onViewportWheel'),
            onWorkbenchWheelBoundary: method(controllers.viewportWheel, 'onWorkbenchWheelBoundary'),
            CANVAS_MEDIA_BROWSER_DRAG_CONTROLLER: controllers.mediaBrowserDrag,
            mediaBrowserNodeDragPayload: mediaBrowserDragMethod('mediaBrowserNodeDragPayload'),
            mediaBrowserPayloadFromDataTransfer: mediaBrowserDragMethod('mediaBrowserPayloadFromDataTransfer'),
            bindMediaBrowserNodeDragEvents: mediaBrowserDragMethod('bindMediaBrowserNodeDragEvents'),
            clearMediaBrowserDragPayload: mediaBrowserDragMethod('clearMediaBrowserDragPayload'),
            getMediaBrowserDragPayload: mediaBrowserDragMethod('getDragPayload'),
            CANVAS_VIEWPORT_DROP_CONTROLLER: controllers.viewportDrop,
            onViewportDrop: method(controllers.viewportDrop, 'onViewportDrop'),
            onViewportDragOver: method(controllers.viewportDrop, 'onViewportDragOver'),
            onViewportDragLeave: method(controllers.viewportDrop, 'onViewportDragLeave'),
            handleDropData: method(controllers.viewportDrop, 'handleDropData'),
            CANVAS_VIEWPORT_CONTEXT_CONTROLLER: controllers.viewportContext,
            onViewportContextMenu: method(controllers.viewportContext, 'onViewportContextMenu'),
            CANVAS_KEYBOARD_CONTROLLER: controllers.keyboard,
            onDocumentKeyDown: method(controllers.keyboard, 'onDocumentKeyDown'),
            CANVAS_DOCUMENT_PASTE_CONTROLLER: controllers.documentPaste,
            onDocumentPaste: method(controllers.documentPaste, 'onDocumentPaste'),
            CANVAS_INPUT_HANDLE_CONTROLLER: controllers.inputHandle,
            getConnectionTargetFromHandle: method(controllers.inputHandle, 'getConnectionTargetFromHandle'),
            handleInputHandlePointerDown: method(controllers.inputHandle, 'handleInputHandlePointerDown'),
            CANVAS_NOTE_TAIL_CONTROLLER: controllers.noteTail,
            startNoteTailDrag: method(controllers.noteTail, 'startNoteTailDrag'),
            onNoteTailDragMove: method(controllers.noteTail, 'onNoteTailDragMove'),
            stopNoteTailDrag: method(controllers.noteTail, 'stopNoteTailDrag'),
            isNoteTailDragging: method(controllers.noteTail, 'isDragging'),
            CANVAS_EDGE_INTERACTION_CONTROLLER: controllers.edgeInteraction,
            handleEdgeLayerClick: method(controllers.edgeInteraction, 'handleEdgeLayerClick'),
            handleEdgeLayerContextMenu: method(controllers.edgeInteraction, 'handleEdgeLayerContextMenu'),
            handleEdgeLayerPointerDown: method(controllers.edgeInteraction, 'handleEdgeLayerPointerDown')
        };
    }

    window.SimpAICanvasWorkbenchInputInteractionContext = Object.assign(
        {},
        window.SimpAICanvasWorkbenchInputInteractionContext || {},
        { createCanvasWorkbenchInputInteractionContext }
    );
})();
