(function () {
    'use strict';

    const modules = {
        status: window.SimpAICanvasWorkbenchStatus || {},
        presetNodeRenderer: window.SimpAICanvasWorkbenchPresetNodeRenderer || {},
        nodeLayout: window.SimpAICanvasWorkbenchNodeLayout || {},
        viewportRender: window.SimpAICanvasWorkbenchViewportRender || {},
        nodeSpatialIndex: window.SimpAICanvasWorkbenchNodeSpatialIndex || {},
        nodeFactory: window.SimpAICanvasWorkbenchNodeFactory || {},
        runtimeService: window.SimpAICanvasWorkbenchRuntimeServiceContext || {},
        selection: window.SimpAICanvasWorkbenchSelection || {},
        graphDelete: window.SimpAICanvasWorkbenchGraphDelete || {},
        resolutionDrag: window.SimpAICanvasWorkbenchResolutionDrag || {},
        clipboard: window.SimpAICanvasWorkbenchClipboard || {},
        groupInteraction: window.SimpAICanvasWorkbenchGroupInteraction || {},
        runPanels: window.SimpAICanvasWorkbenchRunPanels || {},
        nodeResize: window.SimpAICanvasWorkbenchNodeResize || {},
        nodeDrag: window.SimpAICanvasWorkbenchNodeDrag || {},
        pan: window.SimpAICanvasWorkbenchPan || {},
        marquee: window.SimpAICanvasWorkbenchMarquee || {},
        viewportPointer: window.SimpAICanvasWorkbenchViewportPointer || {},
        connection: window.SimpAICanvasWorkbenchConnection || {}
    };

    function createController(module, factoryName, context) {
        const create = module && module[factoryName];
        return typeof create === 'function' ? (create(context) || {}) : {};
    }

    function method(controller, name) {
        return controller && typeof controller[name] === 'function' ? controller[name] : undefined;
    }

    function createCanvasWorkbenchRendererContext(source, controllers) {
        const scope = source || {};
        const assetNodeRenderSource = scope.assetNodeRenderSource || {};
        const resultPreviewSource = scope.resultPreviewSource || {};
        const nodeRendererSource = scope.nodeRendererSource || {};
        const nodeRenderSource = scope.nodeRenderSource || {};

        controllers.assetNodeRenderer = createController(
            window.SimpAICanvasWorkbenchAssetNodeRenderer || {},
            'createCanvasAssetNodeRenderer',
            assetNodeRenderSource
        );

        controllers.resultPreview = createController(
            window.SimpAICanvasWorkbenchResultPreview || {},
            'createCanvasResultPreviewController',
            resultPreviewSource
        );

        controllers.nodeRenderer = createController(
            window.SimpAICanvasWorkbenchNodeRenderer || {},
            'createCanvasNodeRenderer',
            nodeRendererSource
        );

        controllers.nodeRender = createController(
            window.SimpAICanvasWorkbenchNodeRender || {},
            'createCanvasNodeRenderController',
            nodeRenderSource
        );

        const expose = (controllerKey, names) => {
            const controller = controllers[controllerKey];
            return names.reduce((result, name) => {
                result[name] = method(controller, name);
                return result;
            }, {});
        };
        const assetApi = expose('assetNodeRenderer', [
            'renderAssetAudioWaveformHtml', 'renderAssetMediaHtml', 'renderBatchAnyNodeHtml',
            'resultPreviewFrameSrc', 'resultPreviewFrameAspect', 'latestResultPreviewFrame',
            'resultPreviewAspectSource', 'renderResultPreviewStripHtml', 'renderResultMetadataPopover',
            'renderResultMediaHtml', 'renderResultNodeHtml', 'mediaBrowserItemMetadata',
            'mediaBrowserItemPrompt', 'mediaBrowserItemNegativePrompt', 'renderMediaBrowserPanelHtml',
            'renderMediaBrowserNodeHtml'
        ]);
        const resultPreviewApi = expose('resultPreview', [
            'resultPreviewHasRenderableSource', 'shouldShowResultRunningPreview', 'applyResultPreviewAspect',
            'bindResultPreviewAspectFromImage', 'bindResultNodePreviewAspect', 'resultPreviewLastSerial',
            'stopResultPreviewPlayer', 'ensureResultPreviewStreamDom', 'updateResultPreviewPlayerDom',
            'startResultPreviewPlayback', 'syncResultPreviewPlayerDom', 'resultPreviewFreshFrames',
            'applyResultPreviewStream', 'appendResultNodePreviewFrames'
        ]);
        const nodeApi = expose('nodeRenderer', [
            'renderNodeHtml', 'overviewNodeKindLabel', 'overviewNodeAsset', 'overviewInputPorts',
            'overviewOutputKind', 'notConnectedText', 'portHintText', 'slotPortHintText',
            'slotPortTitle', 'slotPortButtonTitle', 'imagePortTitle', 'imagePortButtonTitle',
            'configPortTitle', 'configInputTitle', 'configTitleForKind', 'configLabelForKind',
            'configIconForKind', 'renderPresetConfigPortRow', 'renderNodeStateBadges',
            'renderRunnableNodeStatusFoot'
        ]);
        const nodeRenderApi = expose('nodeRender', [
            'renderNodes', 'resetRenderedProjectDomCache', 'nodeRenderKey', 'invalidateRenderedNode',
            'rememberRenderedNodeLayout', 'refreshNodeLayoutForAgent', 'getRenderedNodeElement', 'getNodeRenderCoverageRect',
            'setNodeRenderCoverageRect', 'getMeasuredNodeLayout', 'getNodeLayoutCacheSize'
        ]);

        return Object.assign(
            {
                CANVAS_ASSET_NODE_RENDERER: controllers.assetNodeRenderer,
                CANVAS_RESULT_PREVIEW_CONTROLLER: controllers.resultPreview,
                CANVAS_NODE_RENDERER: controllers.nodeRenderer,
                CANVAS_NODE_RENDER_CONTROLLER: controllers.nodeRender
            },
            assetApi,
            resultPreviewApi,
            nodeApi,
            nodeRenderApi
        );
    }

    function createCanvasWorkbenchInteractionContext(source, controllers) {
        const scope = source || {};
        const selectionSource = scope.selectionSource || {};
        const graphDeleteSource = scope.graphDeleteSource || {};
        const resolutionDragSource = scope.resolutionDragSource || {};
        const clipboardSource = scope.clipboardSource || {};
        const groupInteractionSource = scope.groupInteractionSource || {};
        const runPanelsSource = scope.runPanelsSource || {};
        const nodeResizeSource = scope.nodeResizeSource || {};
        const nodeDragSource = scope.nodeDragSource || {};
        const panSource = scope.panSource || {};
        const marqueeSource = scope.marqueeSource || {};
        const viewportPointerSource = scope.viewportPointerSource || {};
        const connectionSource = scope.connectionSource || {};

        controllers.selection = createController(
            modules.selection,
            'createCanvasSelectionController',
            selectionSource
        );
        const selectionMethod = name => method(controllers.selection, name);

        controllers.graphDelete = createController(
            modules.graphDelete,
            'createCanvasGraphDeleteController',
            graphDeleteSource
        );

        controllers.resolutionDrag = createController(
            modules.resolutionDrag,
            'createCanvasResolutionDragController',
            resolutionDragSource
        );

        controllers.clipboard = createController(
            modules.clipboard,
            'createCanvasClipboardController',
            clipboardSource
        );

        controllers.groupInteraction = createController(
            modules.groupInteraction,
            'createCanvasGroupInteractionController',
            groupInteractionSource
        );
        const groupInteractionMethod = name => method(controllers.groupInteraction, name);

        controllers.runPanels = createController(
            modules.runPanels,
            'createCanvasRunPanelsController',
            runPanelsSource
        );
        const runPanelsMethod = name => method(controllers.runPanels, name);

        controllers.nodeResize = createController(
            modules.nodeResize,
            'createCanvasNodeResizeController',
            nodeResizeSource
        );
        const nodeResizeMethod = name => method(controllers.nodeResize, name);

        controllers.nodeDrag = createController(
            modules.nodeDrag,
            'createCanvasNodeDragController',
            nodeDragSource
        );
        const nodeDragMethod = name => method(controllers.nodeDrag, name);

        controllers.pan = createController(
            modules.pan,
            'createCanvasPanController',
            panSource
        );

        controllers.marquee = createController(
            modules.marquee,
            'createCanvasMarqueeController',
            marqueeSource
        );
        const marqueeMethod = name => method(controllers.marquee, name);

        controllers.viewportPointer = createController(
            modules.viewportPointer,
            'createCanvasViewportPointerController',
            viewportPointerSource
        );
        const viewportPointerMethod = name => method(controllers.viewportPointer, name);

        controllers.connection = createController(
            modules.connection,
            'createCanvasConnectionController',
            connectionSource
        );
        const connectionMethod = name => method(controllers.connection, name);

        return {
            CANVAS_SELECTION_CONTROLLER: controllers.selection,
            updateSelectionDomClasses: selectionMethod('updateSelectionDomClasses'),
            refreshSelectionUi: selectionMethod('refreshSelectionUi'),
            selectNodeLight: selectionMethod('selectNodeLight'),
            toggleNodeSelectionLight: selectionMethod('toggleNodeSelectionLight'),
            selectGroupLight: selectionMethod('selectGroupLight'),
            selectNode: selectionMethod('selectNode'),
            toggleNodeSelection: selectionMethod('toggleNodeSelection'),
            getSelectedNodeIdList: selectionMethod('getSelectedNodeIdList'),
            toggleSelectedNodesFlag: selectionMethod('toggleSelectedNodesFlag'),
            getEditableSelectedNodes: selectionMethod('getEditableSelectedNodes'),
            alignSelectedNodes: selectionMethod('alignSelectedNodes'),
            distributeSelectedNodes: selectionMethod('distributeSelectedNodes'),
            selectEdge: selectionMethod('selectEdge'),
            CANVAS_GRAPH_DELETE_CONTROLLER: controllers.graphDelete,
            deleteSelection: method(controllers.graphDelete, 'deleteSelection'),
            deleteEdge: method(controllers.graphDelete, 'deleteEdge'),
            deleteUploadSlot: method(controllers.graphDelete, 'deleteUploadSlot'),
            CANVAS_RESOLUTION_DRAG_CONTROLLER: controllers.resolutionDrag,
            startResolutionDrag: method(controllers.resolutionDrag, 'startResolutionDrag'),
            updateResolutionFromDrag: method(controllers.resolutionDrag, 'updateResolutionFromDrag'),
            onResolutionDragMove: method(controllers.resolutionDrag, 'onResolutionDragMove'),
            stopResolutionDrag: method(controllers.resolutionDrag, 'stopResolutionDrag'),
            cancelResolutionDrag: method(controllers.resolutionDrag, 'cancelResolutionDrag'),
            isResolutionDragging: method(controllers.resolutionDrag, 'isDragging'),
            getResolutionDraggingNodeId: method(controllers.resolutionDrag, 'getDraggingNodeId'),
            CANVAS_CLIPBOARD_CONTROLLER: controllers.clipboard,
            buildSelectionClipboard: method(controllers.clipboard, 'buildSelectionClipboard'),
            copyCanvasSelection: method(controllers.clipboard, 'copyCanvasSelection'),
            duplicateSelection: method(controllers.clipboard, 'duplicateSelection'),
            getClipboardBounds: method(controllers.clipboard, 'getClipboardBounds'),
            pasteCanvasClipboard: method(controllers.clipboard, 'pasteCanvasClipboard'),
            CANVAS_GROUP_INTERACTION_CONTROLLER: controllers.groupInteraction,
            bindGroupLayerEvents: groupInteractionMethod('bindGroupLayerEvents'),
            isGroupDragging: groupInteractionMethod('isGroupDragging'),
            isGroupResizing: groupInteractionMethod('isGroupResizing'),
            CANVAS_RUN_PANELS_CONTROLLER: controllers.runPanels,
            renderRunQueuePanelIfOpen: runPanelsMethod('renderRunQueuePanelIfOpen'),
            openRunQueuePanel: runPanelsMethod('openRunQueuePanel'),
            closeRunQueuePanel: runPanelsMethod('closeRunQueuePanel'),
            renderRunQueuePanel: runPanelsMethod('renderRunQueuePanel'),
            handleRunQueueAction: runPanelsMethod('handleRunQueueAction'),
            openRunHistoryPanel: runPanelsMethod('openRunHistoryPanel'),
            closeRunHistoryPanel: runPanelsMethod('closeRunHistoryPanel'),
            renderRunHistoryPanel: runPanelsMethod('renderRunHistoryPanel'),
            handleRunHistoryAction: runPanelsMethod('handleRunHistoryAction'),
            CANVAS_NODE_RESIZE_CONTROLLER: controllers.nodeResize,
            startNodeResize: nodeResizeMethod('startNodeResize'),
            isNodeResizing: nodeResizeMethod('isResizing'),
            getNodeResizeNodeId: nodeResizeMethod('getResizingNodeId'),
            CANVAS_NODE_DRAG_CONTROLLER: controllers.nodeDrag,
            startNodeDrag: nodeDragMethod('startNodeDrag'),
            isNodeDragging: nodeDragMethod('isDragging'),
            getDraggingNodeIds: nodeDragMethod('getDraggingNodeIds'),
            isDraggingNode: nodeDragMethod('isDraggingNode'),
            CANVAS_PAN_CONTROLLER: controllers.pan,
            startPan: method(controllers.pan, 'startPan'),
            isPanning: method(controllers.pan, 'isPanning'),
            CANVAS_MARQUEE_CONTROLLER: controllers.marquee,
            startMarqueeSelection: marqueeMethod('startMarqueeSelection'),
            isMarqueeSelecting: marqueeMethod('isSelecting'),
            CANVAS_VIEWPORT_POINTER_CONTROLLER: controllers.viewportPointer,
            handleViewportNodePointerDown: viewportPointerMethod('handleViewportNodePointerDown'),
            onViewportPointerDown: viewportPointerMethod('onViewportPointerDown'),
            onViewportDoubleClick: viewportPointerMethod('onViewportDoubleClick'),
            CANVAS_CONNECTION_CONTROLLER: controllers.connection,
            startConnection: connectionMethod('startConnection'),
            startInputConnection: connectionMethod('startInputConnection'),
            isConnecting: connectionMethod('isConnecting'),
            getConnectingFromId: connectionMethod('getConnectingFromId'),
            updateTempEdge: connectionMethod('updateTempEdge'),
            cancelConnection: connectionMethod('cancelConnection')
        };
    }

    function createCanvasWorkbenchRuntimeContext(source) {
        const scope = source?.runtimeSource || source || {};
        const controllers = {};
        const statusSource = scope.statusSource || {};
        const presetNodeRendererSource = scope.presetNodeRendererSource || {};
        const nodeLayoutSource = scope.nodeLayoutSource || {};
        const viewportRenderSource = scope.viewportRenderSource || {};
        const nodeSpatialIndexSource = scope.nodeSpatialIndexSource || {};
        const nodeFactorySource = scope.nodeFactorySource || {};

        controllers.status = createController(
            modules.status,
            'createCanvasStatusController',
            statusSource
        );
        const renderStatus = method(controllers.status, 'renderStatus');

        controllers.presetNodeRenderer = createController(
            modules.presetNodeRenderer,
            'createCanvasPresetNodeRenderer',
            presetNodeRendererSource
        );
        const renderPresetMethod = name => method(controllers.presetNodeRenderer, name);

        controllers.nodeLayout = createController(
            modules.nodeLayout,
            'createCanvasNodeLayoutController',
            nodeLayoutSource
        );
        const layoutMethod = name => method(controllers.nodeLayout, name);

        controllers.viewportRender = createController(
            modules.viewportRender,
            'createCanvasViewportRenderController',
            viewportRenderSource
        );
        const viewportMethod = name => method(controllers.viewportRender, name);

        controllers.nodeSpatialIndex = createController(
            modules.nodeSpatialIndex,
            'createCanvasNodeSpatialIndexController',
            nodeSpatialIndexSource
        );
        const spatialMethod = name => method(controllers.nodeSpatialIndex, name);

        controllers.nodeFactory = createController(
            modules.nodeFactory,
            'createCanvasNodeFactoryController',
            nodeFactorySource
        );
        const factoryMethod = name => method(controllers.nodeFactory, name);

        const rendererContext = createCanvasWorkbenchRendererContext(scope, controllers);
        const serviceFactory = modules.runtimeService?.createCanvasWorkbenchRuntimeServiceContext;
        const serviceContext = typeof serviceFactory === 'function'
            ? serviceFactory(scope, controllers)
            : {};
        const interactionContext = createCanvasWorkbenchInteractionContext(scope, controllers);
        return Object.assign({
            CANVAS_STATUS_CONTROLLER: controllers.status,
            renderStatus,
            CANVAS_PRESET_NODE_RENDERER: controllers.presetNodeRenderer,
            renderClassicNodeHtml: renderPresetMethod('renderClassicNodeHtml'),
            renderPresetNodeHtml: renderPresetMethod('renderPresetNodeHtml'),
            getSlotOrderHint: renderPresetMethod('getSlotOrderHint'),
            getPresetSpecialControllerKind: renderPresetMethod('getPresetSpecialControllerKind'),
            normalizePresetSpecialState: renderPresetMethod('normalizePresetSpecialState'),
            presetSpecialControllerState: renderPresetMethod('presetSpecialControllerState'),
            presetSpecialPromptFromState: renderPresetMethod('presetSpecialPromptFromState'),
            renderPresetSpecialController: renderPresetMethod('renderPresetSpecialController'),
            filterVisiblePresetParamsForSpecial: renderPresetMethod('filterVisiblePresetParamsForSpecial'),
            getVisiblePresetParams: renderPresetMethod('getVisiblePresetParams'),
            shouldShowPresetParam: renderPresetMethod('shouldShowPresetParam'),
            isResolutionOwnedPresetParam: renderPresetMethod('isResolutionOwnedPresetParam'),
            presetParamValue: renderPresetMethod('presetParamValue'),
            isPromptTextParam: renderPresetMethod('isPromptTextParam'),
            CANVAS_NODE_LAYOUT_CONTROLLER: controllers.nodeLayout,
            defaultResultNodeSize: layoutMethod('defaultResultNodeSize'),
            boundedImageNodeSizeForAsset: layoutMethod('boundedImageNodeSizeForAsset'),
            fitImageNodeToAssetBounds: layoutMethod('fitImageNodeToAssetBounds'),
            ensureResultNodeReadableSize: layoutMethod('ensureResultNodeReadableSize'),
            ensureMediaBrowserNodeReadableSize: layoutMethod('ensureMediaBrowserNodeReadableSize'),
            findOpenNodePosition: layoutMethod('findOpenNodePosition'),
            getNodeRect: layoutMethod('getNodeRect'),
            getNodeLayoutSize: layoutMethod('getNodeLayoutSize'),
            minResizableNodeSize: layoutMethod('minResizableNodeSize'),
            placeNodeAvoidingOverlap: layoutMethod('placeNodeAvoidingOverlap'),
            CANVAS_VIEWPORT_RENDER_CONTROLLER: controllers.viewportRender,
            getVisibleWorldRect: viewportMethod('getVisibleWorldRect'),
            getNodeRenderWorldRect: viewportMethod('getNodeRenderWorldRect'),
            getEdgeRenderWorldRect: viewportMethod('getEdgeRenderWorldRect'),
            shouldRenderNodeInViewport: viewportMethod('shouldRenderNodeInViewport'),
            shouldRenderEdgeInViewport: viewportMethod('shouldRenderEdgeInViewport'),
            getEdgeSvgBounds: viewportMethod('getEdgeSvgBounds'),
            CANVAS_NODE_SPATIAL_INDEX_CONTROLLER: controllers.nodeSpatialIndex,
            invalidateNodeSpatialIndex: spatialMethod('invalidateNodeSpatialIndex'),
            refreshNodeSpatialIndexRecord: spatialMethod('refreshNodeSpatialIndexRecord'),
            queryNodeRecordsForRect: spatialMethod('queryNodeRecordsForRect'),
            querySpatialNodeRecords: spatialMethod('querySpatialNodeRecords'),
            getMarqueeNodeRecords: spatialMethod('getMarqueeNodeRecords'),
            findCanvasNodeAtWorldPoint: spatialMethod('findCanvasNodeAtWorldPoint'),
            getVisibleNodeRecords: spatialMethod('getVisibleNodeRecords'),
            countVisibleNodesForRenderWindow: spatialMethod('countVisibleNodesForRenderWindow'),
            shouldDeferPanNodeRender: spatialMethod('shouldDeferPanNodeRender'),
            CANVAS_NODE_FACTORY_CONTROLLER: controllers.nodeFactory,
            buildNodeParamsPatch: factoryMethod('buildNodeParamsPatch'),
            buildNodeStylePatch: factoryMethod('buildNodeStylePatch'),
            applyNodeStylePatch: factoryMethod('applyNodeStylePatch'),
            buildNodeLayoutPatch: factoryMethod('buildNodeLayoutPatch'),
            applyNodeLayoutPatch: factoryMethod('applyNodeLayoutPatch'),
            buildNodeFlagPatch: factoryMethod('buildNodeFlagPatch'),
            buildNodeFieldPatch: factoryMethod('buildNodeFieldPatch'),
            buildPresetUploadSlotPatch: factoryMethod('buildPresetUploadSlotPatch'),
            buildClassicNodeStatePatch: factoryMethod('buildClassicNodeStatePatch'),
            buildPresetTextInputPatch: factoryMethod('buildPresetTextInputPatch'),
            buildPresetStyleTransferPatch: factoryMethod('buildPresetStyleTransferPatch'),
            buildPresetRuntimePatch: factoryMethod('buildPresetRuntimePatch'),
            buildPresetWildcardPreviewPatch: factoryMethod('buildPresetWildcardPreviewPatch'),
            buildPresetConfigPatch: factoryMethod('buildPresetConfigPatch'),
            buildPresetDefinitionPatch: factoryMethod('buildPresetDefinitionPatch'),
            applyPresetDefinitionPatch: factoryMethod('applyPresetDefinitionPatch'),
            buildPresetGenerationConfigPatch: factoryMethod('buildPresetGenerationConfigPatch'),
            buildPresetSnapshotPatch: factoryMethod('buildPresetSnapshotPatch'),
            buildGenerationMetadataPatch: factoryMethod('buildGenerationMetadataPatch'),
            buildClassicNode: factoryMethod('buildClassicNode'),
            buildPresetNode: factoryMethod('buildPresetNode'),
            buildPresetModelCatalogStatus: factoryMethod('buildPresetModelCatalogStatus'),
            buildPresetModelCheckingStatus: factoryMethod('buildPresetModelCheckingStatus'),
            buildPresetModelStatusPatch: factoryMethod('buildPresetModelStatusPatch'),
            applyPresetModelStatus: factoryMethod('applyPresetModelStatus')
        }, rendererContext, serviceContext, interactionContext);
    }

    window.SimpAICanvasWorkbenchRuntimeContext = Object.assign(
        {},
        window.SimpAICanvasWorkbenchRuntimeContext || {},
        { createCanvasWorkbenchRuntimeContext }
    );
})();
