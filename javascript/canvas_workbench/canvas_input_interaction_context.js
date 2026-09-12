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
        const controllers = {};

        controllers.viewportWheel = createController(modules.viewportWheel, 'createCanvasViewportWheelController', {
            getRoot: scope.getRoot,
            getDocument: scope.getDocument,
            getWindow: scope.getWindow,
            performanceNow: scope.performanceNow,
            getSuppressWheelUntil: scope.getSuppressWheelUntil,
            isInteractiveTarget: scope.isInteractiveTarget,
            isNodeDragging: scope.isNodeDragging,
            isPanning: scope.isPanning,
            isMarqueeSelecting: scope.isMarqueeSelecting,
            isConnecting: scope.isConnecting,
            zoomAtClient: scope.zoomAtClient
        });

        controllers.mediaBrowserDrag = createController(modules.mediaBrowserDrag, 'createCanvasMediaBrowserDragController', {
            getDragMime: scope.getDragMime,
            getMediaBrowserNodeState: scope.getMediaBrowserNodeState,
            getMediaBrowserItems: scope.getMediaBrowserItems,
            serializableMediaBrowserState: scope.serializableMediaBrowserState,
            getViewport: scope.getViewport
        });
        const mediaBrowserDragMethod = name => method(controllers.mediaBrowserDrag, name);

        controllers.viewportDrop = createController(modules.viewportDrop, 'createCanvasViewportDropController', {
            getViewport: scope.getViewport,
            getTransferStation: scope.getTransferStation,
            clientToWorld: scope.clientToWorld,
            setLastPointerWorld: scope.setLastPointerWorld,
            mediaBrowserPayloadFromDataTransfer: (...args) => mediaBrowserDragMethod('mediaBrowserPayloadFromDataTransfer')?.(...args),
            clearMediaBrowserDragPayload: (...args) => mediaBrowserDragMethod('clearMediaBrowserDragPayload')?.(...args),
            addMediaBrowserPayloadToCanvas: scope.addMediaBrowserPayloadToCanvas,
            importTransferItemAt: scope.importTransferItemAt,
            isWorkbenchProjectFile: scope.isWorkbenchProjectFile,
            importWorkbenchProjectFromFile: scope.importWorkbenchProjectFromFile,
            isMediaFile: scope.isMediaFile,
            addMediaNodeFromFile: scope.addMediaNodeFromFile
        });

        controllers.viewportContext = createController(modules.viewportContext, 'createCanvasViewportContextController', {
            getRoot: scope.getRoot,
            clientToWorld: scope.clientToWorld,
            setLastPointerWorld: scope.setLastPointerWorld,
            findCanvasEdgeAtClient: scope.findCanvasEdgeAtClient,
            selectEdge: scope.selectEdge,
            openEdgeContextMenu: scope.openEdgeContextMenu,
            openAddNodeMenu: scope.openAddNodeMenu
        });

        controllers.keyboard = createController(modules.keyboard, 'createCanvasKeyboardController', {
            getRoot: scope.getRoot,
            getTextareaEditorState: scope.getTextareaEditorState,
            getProject: scope.getProject,
            getSelectedNodeId: scope.getSelectedNodeId,
            getNode: scope.getNode,
            isEditableElement: scope.isEditableElement,
            consumeWorkbenchShortcut: scope.consumeWorkbenchShortcut,
            handleCanvasAgentAction: scope.handleCanvasAgentAction,
            canvasAgentPrimaryAction: scope.canvasAgentPrimaryAction,
            isOutpaintOverlayActive: scope.isOutpaintOverlayActive,
            hideOutpaintOverlay: scope.hideOutpaintOverlay,
            renderCanvasAgentPanel: scope.renderCanvasAgentPanel,
            isConnecting: scope.isConnecting,
            cancelConnection: scope.cancelConnection,
            isPresetPaletteOpen: scope.isPresetPaletteOpen,
            closePresetPalette: scope.closePresetPalette,
            closeContextMenu: scope.closeContextMenu,
            ensureProjectGroups: scope.ensureProjectGroups,
            focusGroup: scope.focusGroup,
            saveProject: scope.saveProject,
            undoCanvasEdit: scope.undoCanvasEdit,
            redoCanvasEdit: scope.redoCanvasEdit,
            openPresetPalette: scope.openPresetPalette,
            copyCanvasSelection: scope.copyCanvasSelection,
            pasteCanvasClipboard: scope.pasteCanvasClipboard,
            duplicateSelection: scope.duplicateSelection,
            resetViewportZoom: scope.resetViewportZoom,
            zoomAtViewportCenter: scope.zoomAtViewportCenter,
            runSelectedChain: scope.runSelectedChain,
            runPresetNodeFromUi: scope.runPresetNodeFromUi,
            toggleTimelinePreviewPlayback: scope.toggleTimelinePreviewPlayback,
            playMediaSelection: scope.playMediaSelection,
            toggleSelectedResultMediaPlayback: scope.toggleSelectedResultMediaPlayback,
            fitAll: scope.fitAll,
            fitSelection: scope.fitSelection,
            alignSelectedNodes: scope.alignSelectedNodes,
            deleteSelection: scope.deleteSelection,
            setMode: scope.setMode,
            toggleSelectedNodesFlag: scope.toggleSelectedNodesFlag,
            importSelectedTransferAt: scope.importSelectedTransferAt,
            viewportCenterWorld: scope.viewportCenterWorld
        });

        controllers.documentPaste = createController(modules.documentPaste, 'createCanvasDocumentPasteController', {
            getRoot: scope.getRoot,
            isEditableElement: scope.isEditableElement,
            viewportCenterWorld: scope.viewportCenterWorld,
            addImageNodeFromFile: scope.addImageNodeFromFile
        });

        controllers.inputHandle = createController(modules.inputHandle, 'createCanvasInputHandleController', {
            getProject: scope.getProject,
            getNode: scope.getNode,
            t: scope.t,
            startInputConnection: scope.startInputConnection,
            startConnection: scope.startConnection,
            deleteUploadSlot: scope.deleteUploadSlot,
            deleteEdge: scope.deleteEdge,
            renderAll: scope.renderAll,
            isQwenTtsNode: scope.isQwenTtsNode,
            isDirectorTimelineNode: scope.isDirectorTimelineNode,
            directorMediaSourceKind: scope.directorMediaSourceKind,
            batchAnyInputEdgeForDrag: scope.batchAnyInputEdgeForDrag,
            showToast: scope.showToast
        });

        controllers.noteTail = createController(modules.noteTail, 'createCanvasNoteTailController', {
            getProject: scope.getProject,
            getDocument: scope.getDocument,
            getNode: scope.getNode,
            isNodeLocked: scope.isNodeLocked,
            buildNoteStatePatch: scope.buildNoteStatePatch,
            ensureNoteTailTarget: scope.ensureNoteTailTarget,
            snapCanvasCoord: scope.snapCanvasCoord,
            t: scope.t,
            showToast: scope.showToast,
            selectNodeForTailDrag: scope.selectNodeForTailDrag,
            updateSelectionDomClasses: scope.updateSelectionDomClasses,
            renderEdges: scope.renderEdges,
            renderInspector: scope.renderInspector,
            pushHistory: scope.pushHistory,
            scheduleSave: scope.scheduleSave,
            getSelectedNodeId: scope.getSelectedNodeId
        });

        controllers.edgeInteraction = createController(modules.edgeInteraction, 'createCanvasEdgeInteractionController', {
            getEdgesLayer: scope.getEdgesLayer,
            getNode: scope.getNode,
            selectEdge: scope.selectEdge,
            openEdgeContextMenu: scope.openEdgeContextMenu,
            startNoteTailDrag: (...args) => method(controllers.noteTail, 'startNoteTailDrag')?.(...args)
        });

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
