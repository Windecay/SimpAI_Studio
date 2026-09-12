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
        const assetMethod = name => method(controllers.assetNodeRenderer, name);
        const resultPreviewMethod = name => method(controllers.resultPreview, name);
        const nodeMethod = name => method(controllers.nodeRenderer, name);
        const layoutMethod = name => method(controllers.nodeLayout, name);
        const viewportMethod = name => method(controllers.viewportRender, name);
        const spatialMethod = name => method(controllers.nodeSpatialIndex, name);
        const presetMethod = name => method(controllers.presetNodeRenderer, name);

        controllers.assetNodeRenderer = createController(
            window.SimpAICanvasWorkbenchAssetNodeRenderer || {},
            'createCanvasAssetNodeRenderer',
            {
                t: scope.t,
                clamp: scope.clamp,
                escapeHtml: scope.escapeHtml,
                assetMediaKind: scope.assetMediaKind,
                assetMediaIcon: scope.assetMediaIcon,
                safeAssetDisplaySrc: scope.safeAssetDisplaySrc,
                safeAssetFullDisplaySrc: scope.safeAssetFullDisplaySrc,
                safeAssetFallbackSrc: scope.safeAssetFallbackSrc,
                readAssetInfo: scope.readAssetInfo,
                mediaAspectStyle: scope.mediaAspectStyle,
                renderNodeStateBadges: (...args) => nodeMethod('renderNodeStateBadges')?.(...args) || '',
                collapsedKeepClass: scope.collapsedKeepClass,
                isCanvasRunActiveState: scope.isCanvasRunActiveState,
                isResultStale: scope.isResultStale,
                isResultRefreshing: scope.isResultRefreshing,
                resultMediaDisplayAsset: scope.resultMediaDisplayAsset,
                inferChatImageRelativePath: scope.inferChatImageRelativePath,
                getResultMetadataRows: scope.getResultMetadataRows,
                batchAnyMediaKindFromAsset: scope.batchAnyMediaKindFromAsset,
                batchAnyMediaKind: scope.batchAnyMediaKind,
                batchAnyPortKind: scope.batchAnyPortKind,
                batchAnyMediaLabel: scope.batchAnyMediaLabel,
                batchAnyMediaIcon: scope.batchAnyMediaIcon,
                batchAnyCurrentItem: scope.batchAnyCurrentItem,
                batchAnySelectedItemIds: scope.batchAnySelectedItemIds,
                batchAnyTargets: scope.batchAnyTargets,
                batchAnyTargetLabel: scope.batchAnyTargetLabel,
                batchAnyTextFromItem: scope.batchAnyTextFromItem,
                mediaBrowserNodeState: scope.mediaBrowserNodeState,
                mediaBrowserRuntimeFor: scope.mediaBrowserRuntimeFor,
                isGalleryFrostEnabled: scope.isGalleryFrostEnabled,
                syncGalleryFrostClass: scope.syncGalleryFrostClass,
                localizedDefaultTitle: scope.localizedDefaultTitle,
                selectedMediaBrowserItemFrom: scope.selectedMediaBrowserItemFrom,
                mediaBrowserItemMeta: scope.mediaBrowserItemMeta,
                danbooruPostMediaType: scope.danbooruPostMediaType
            }
        );

        controllers.resultPreview = createController(
            window.SimpAICanvasWorkbenchResultPreview || {},
            'createCanvasResultPreviewController',
            {
                cloneRunValue: scope.cloneRunValue,
                getNode: scope.getNode,
                getNodeElement: scope.getNodeElement,
                getSelectedResultAsset: scope.getSelectedResultAsset,
                buildResultPreviewPatch: scope.buildResultPreviewPatch,
                isCanvasRunActiveState: scope.isCanvasRunActiveState,
                maxFrames: 96,
                nodeStatusState: scope.nodeStatusState,
                renderResultPreviewStripHtml: assetMethod('renderResultPreviewStripHtml'),
                resultPreviewAspectSource: assetMethod('resultPreviewAspectSource'),
                resultPreviewFrameAspect: assetMethod('resultPreviewFrameAspect'),
                resultPreviewFrameSrc: assetMethod('resultPreviewFrameSrc')
            }
        );

        controllers.nodeRenderer = createController(
            window.SimpAICanvasWorkbenchNodeRenderer || {},
            'createCanvasNodeRenderer',
            {
                t: scope.t,
                escapeHtml: scope.escapeHtml,
                nodeEffectiveRenderMode: scope.nodeEffectiveRenderMode,
                renderConfigNodeHtml: scope.renderConfigNodeHtml,
                renderClassicNodeHtml: presetMethod('renderClassicNodeHtml'),
                renderPresetNodeHtml: presetMethod('renderPresetNodeHtml'),
                renderResultNodeHtml: assetMethod('renderResultNodeHtml'),
                renderCompareNodeHtml: scope.renderCompareNodeHtml,
                renderBatchAnyNodeHtml: assetMethod('renderBatchAnyNodeHtml'),
                renderXyzMatrixNodeHtml: scope.renderXyzMatrixNodeHtml,
                renderTimelineNodeHtml: scope.renderTimelineNodeHtml,
                renderDirectorTimelineNodeHtml: scope.renderDirectorTimelineNodeHtml,
                renderMediaBrowserNodeHtml: assetMethod('renderMediaBrowserNodeHtml'),
                renderStyleSelectorNodeHtml: scope.renderStyleSelectorNodeHtml,
                renderVideoNodeHtml: scope.renderVideoNodeHtml,
                renderAudioNodeHtml: scope.renderAudioNodeHtml,
                renderNoteNodeHtml: scope.renderNoteNodeHtml,
                renderWildcardsHelperNodeHtml: scope.renderWildcardsHelperNodeHtml,
                renderTextNodeHtml: scope.renderTextNodeHtml,
                renderTextMergeNodeHtml: scope.renderTextMergeNodeHtml,
                renderTranslationNodeHtml: scope.renderTranslationNodeHtml,
                renderTagCartNodeHtml: scope.renderTagCartNodeHtml,
                renderWd14NodeHtml: scope.renderWd14NodeHtml,
                renderVlmNodeHtml: scope.renderVlmNodeHtml,
                renderMaskNodeHtml: scope.renderMaskNodeHtml,
                renderSam3VideoMaskNodeHtml: scope.renderSam3VideoMaskNodeHtml,
                renderCameraMotionNodeHtml: scope.renderCameraMotionNodeHtml,
                renderPoseStudioNodeHtml: scope.renderPoseStudioNodeHtml,
                renderGaussianStudioNodeHtml: scope.renderGaussianStudioNodeHtml,
                renderLivePortraitExpressionNodeHtml: scope.renderLivePortraitExpressionNodeHtml,
                renderQwenTtsNodeHtml: scope.renderQwenTtsNodeHtml,
                renderImageNodeHtml: scope.renderImageNodeHtml,
                isDirectorTimelineNode: scope.isDirectorTimelineNode,
                isQwenTtsNode: scope.isQwenTtsNode,
                nodeStatusState: scope.nodeStatusState,
                mediaBrowserLabel: scope.mediaBrowserLabel,
                tagCartLabel: scope.tagCartLabel,
                getSelectedResultAsset: scope.getSelectedResultAsset,
                getNode: scope.getNode,
                getVlmSourceAsset: scope.getVlmSourceAsset,
                getTimelineSourceAsset: scope.getTimelineSourceAsset,
                safeAssetDisplaySrc: scope.safeAssetDisplaySrc,
                mediaBrowserRuntimeFor: scope.mediaBrowserRuntimeFor,
                readAssetInfo: scope.readAssetInfo,
                getVisibleClassicUploadSlots: scope.getVisibleClassicUploadSlots,
                getVisibleUploadSlots: scope.getVisibleUploadSlots,
                localizeCanvasLabel: scope.localizeCanvasLabel,
                detectionSlotForRegion: scope.detectionSlotForRegion,
                getDetectionConfigLabel: scope.getDetectionConfigLabel,
                textMergeInputSlots: scope.textMergeInputSlots,
                qwenTtsAudioInputSlots: scope.qwenTtsAudioInputSlots,
                batchAnyPortKind: scope.batchAnyPortKind,
                getUploadSlotMediaKind: scope.getUploadSlotMediaKind,
                collapsedKeepClass: scope.collapsedKeepClass,
                isNodeLocked: scope.isNodeLocked,
                isNodeIgnored: scope.isNodeIgnored,
                isNodeCollapsed: scope.isNodeCollapsed,
                isResultRefreshing: scope.isResultRefreshing,
                isResultStale: scope.isResultStale,
                isCanvasRunActiveState: scope.isCanvasRunActiveState,
                getPresetConfigKinds: scope.getPresetConfigKinds,
                getVlmImageSlots: scope.getVlmImageSlots,
                getDirectorTimelineMediaKindGroups: scope.getDirectorTimelineMediaKindGroups
            }
        );

        controllers.nodeRender = createController(
            window.SimpAICanvasWorkbenchNodeRender || {},
            'createCanvasNodeRenderController',
            {
                getRoot: scope.getRoot,
                getProject: scope.getProject,
                getNodesLayer: scope.getNodesLayer,
                getGroupsLayer: scope.getGroupsLayer,
                getEdgesLayer: scope.getEdgesLayer,
                getChainRunOverlay: scope.getChainRunOverlay,
                getDocument: scope.getDocument,
                getPerfStats: scope.getPerfStats,
                performanceNow: scope.performanceNow,
                getSelectedNodeId: scope.getSelectedNodeId,
                getSelectedNodeIds: scope.getSelectedNodeIds,
                getMediaBrowserNodeRuntime: scope.getMediaBrowserNodeRuntime,
                getMediaBrowserScrollMemory: scope.getMediaBrowserScrollMemory,
                getVlmChatScrollMemory: scope.getVlmChatScrollMemory,
                getVlmRenderDebugEnabled: scope.getVlmRenderDebugEnabled,
                setEdgeRenderCacheKey: scope.setEdgeRenderCacheKey,
                setEdgeIncidentIndex: scope.setEdgeIncidentIndex,
                setActiveInlineTagCartNodeId: scope.setActiveInlineTagCartNodeId,
                cssEscape: scope.cssEscape,
                updateCanvasRenderMode: scope.updateCanvasRenderMode,
                getNodeRenderWorldRect: (...args) => viewportMethod('getNodeRenderWorldRect')?.(...args),
                getVisibleNodeRecords: (...args) => spatialMethod('getVisibleNodeRecords')?.(...args) || { nodes: [], projectIds: new Set() },
                getNode: scope.getNode,
                getNodeLayoutSize: (...args) => layoutMethod('getNodeLayoutSize')?.(...args),
                ensureVlmNodeModeSize: scope.ensureVlmNodeModeSize,
                ensureResultNodeReadableSize: (...args) => layoutMethod('ensureResultNodeReadableSize')?.(...args) || false,
                getSelectedResultAsset: scope.getSelectedResultAsset,
                resultPreviewAspectSource: assetMethod('resultPreviewAspectSource'),
                ensureMediaBrowserNodeReadableSize: (...args) => layoutMethod('ensureMediaBrowserNodeReadableSize')?.(...args) || false,
                mediaBrowserRuntimeFor: scope.mediaBrowserRuntimeFor,
                refreshMediaBrowserNode: scope.refreshMediaBrowserNode,
                nodeEffectiveRenderMode: scope.nodeEffectiveRenderMode,
                captureVlmChatScroll: scope.captureVlmChatScroll,
                captureMediaBrowserScroll: scope.captureMediaBrowserScroll,
                logVlmRenderKeyChange: scope.logVlmRenderKeyChange,
                isNodeCollapsed: scope.isNodeCollapsed,
                isNodeLocked: scope.isNodeLocked,
                isNodeIgnored: scope.isNodeIgnored,
                isImageNodeFrameless: scope.isImageNodeFrameless,
                isNodeVisuallyRunning: scope.isNodeVisuallyRunning,
                isNodeSchedulerBlocked: scope.isNodeSchedulerBlocked,
                isNodeSchedulerWaiting: scope.isNodeSchedulerWaiting,
                isResultStale: scope.isResultStale,
                applyNodeCustomColorVars: scope.applyNodeCustomColorVars,
                defaultNodeSize: scope.defaultNodeSize,
                supportsCollapsedPromptHeight: scope.supportsCollapsedPromptHeight,
                collapsedPromptNodeHeight: scope.collapsedPromptNodeHeight,
                shouldFixNodeHeight: scope.shouldFixNodeHeight,
                renderNodeHtml: nodeMethod('renderNodeHtml'),
                ensureWorkbenchFormFieldNames: scope.ensureWorkbenchFormFieldNames,
                ensureNodeCollapseButton: scope.ensureNodeCollapseButton,
                ensureNodeResizeHandle: scope.ensureNodeResizeHandle,
                bindNodeEvents: scope.bindNodeEvents,
                restoreVlmChatScroll: scope.restoreVlmChatScroll,
                refreshVlmChatReadabilityDom: scope.refreshVlmChatReadabilityDom,
                restoreMediaBrowserScroll: scope.restoreMediaBrowserScroll,
                syncResultPreviewPlayerDom: (...args) => resultPreviewMethod('syncResultPreviewPlayerDom')?.(...args),
                restoreInlineTagCartAfterRender: scope.restoreInlineTagCartAfterRender,
                syncOutpaintOverlayPosition: scope.syncOutpaintOverlayPosition,
                isPanning: scope.isPanning,
                scheduleMinimapRender: scope.scheduleMinimapRender,
                renderMinimap: scope.renderMinimap,
                positionCanvasAgentPanel: scope.positionCanvasAgentPanel,
                getPresetSpecialControllerKind: presetMethod('getPresetSpecialControllerKind'),
                bindPresetSpecialViewerEvents: scope.bindPresetSpecialViewerEvents,
                refreshPresetSpecialNodeDom: scope.refreshPresetSpecialNodeDom,
                nodeOverviewRenderSignature: scope.nodeOverviewRenderSignature,
                nodeRenderSignature: scope.nodeRenderSignature,
                refreshNodeSpatialIndexRecord: (...args) => spatialMethod('refreshNodeSpatialIndexRecord')?.(...args),
                clearTempEdge: scope.clearTempEdge,
                cancelEdgeIncidentIndexWarmup: scope.cancelEdgeIncidentIndexWarmup,
                clearEdgeCanvas: scope.clearEdgeCanvas,
                invalidateMinimapStaticCache: scope.invalidateMinimapStaticCache,
                invalidateNodeSpatialIndex: (...args) => spatialMethod('invalidateNodeSpatialIndex')?.(...args)
            }
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
            'rememberRenderedNodeLayout', 'getRenderedNodeElement', 'getNodeRenderCoverageRect',
            'setNodeRenderCoverageRect', 'getMeasuredNodeLayout', 'getNodeLayoutCacheSize'
        ]);

        return Object.assign(
            {
                CANVAS_ASSET_NODE_RENDERER: controllers.assetNodeRenderer,
                CANVAS_RESULT_PREVIEW_CONTROLLER: controllers.resultPreview,
                CANVAS_NODE_RENDERER: controllers.nodeRenderer,
                CANVAS_NODE_RENDER_CONTROLLER: controllers.nodeRender,
                TIMELINE_NODE_CONTEXT_SOURCE: {
                    getNode: scope.getNode,
                    uid: scope.uid,
                    defaultNodeSize: scope.defaultNodeSize,
                    cloneRunValue: scope.cloneRunValue,
                    renderNodeStateBadges: nodeApi.renderNodeStateBadges,
                    getTimelineSourceAsset: scope.getTimelineSourceAsset,
                    assetDisplaySrc: scope.assetDisplaySrc,
                    readAssetSize: scope.readAssetSize,
                    assetMediaKind: scope.assetMediaKind
                },
                COMPARE_NODE_CONTEXT_SOURCE: {
                    assetDisplaySrc: scope.assetDisplaySrc,
                    defaultNodeSize: scope.defaultNodeSize,
                    uid: scope.uid,
                    escapeHtml: scope.escapeHtml,
                    getCompareSourceAsset: scope.getCompareSourceAsset,
                    getCompareSourceNode: scope.getCompareSourceNode,
                    readAssetSize: scope.readAssetSize,
                    renderIconHtml: scope.renderIconHtml,
                    renderNodeStateBadges: nodeApi.renderNodeStateBadges
                },
                STYLE_SELECTOR_NODE_CONTEXT_SOURCE: scope.styleSelectorNodeContextSource,
                QWEN_TTS_NODE_CONTEXT_SOURCE: scope.qwenTtsNodeContextSource
            },
            assetApi,
            resultPreviewApi,
            nodeApi,
            nodeRenderApi
        );
    }

    function createCanvasWorkbenchInteractionContext(source, controllers) {
        const scope = source || {};
        const invoke = (name, ...args) => {
            const callback = scope[name];
            return typeof callback === 'function' ? callback(...args) : undefined;
        };
        const layoutMethod = name => method(controllers.nodeLayout, name);
        const nodeFactoryMethod = name => method(controllers.nodeFactory, name);
        const nodeRenderMethod = name => method(controllers.nodeRender, name);
        const renderMethod = name => method(controllers.render, name);
        const resultPreviewMethod = name => method(controllers.resultPreview, name);
        const minimapMethod = name => method(controllers.minimap, name);
        const runStatusMethod = name => method(controllers.runStatus, name);
        const historyMethod = name => method(controllers.history, name);
        const factoryContext = typeof scope.getFactoryContext === 'function'
            ? (scope.getFactoryContext() || {})
            : {};
        const factoryMethod = name => method(factoryContext, name);
        const factoryCallback = name => (...args) => factoryMethod(name)?.(...args);

        controllers.selection = createController(modules.selection, 'createCanvasSelectionController', {
            getProject: scope.getProject,
            getSelectionState: scope.getSelectionState,
            setSelectionState: scope.setSelectionState,
            getNodesLayer: scope.getNodesLayer,
            getEdgesLayer: scope.getEdgesLayer,
            getGroupsLayer: scope.getGroupsLayer,
            getCanvasRenderMode: scope.getCanvasRenderMode,
            getNode: scope.getNode,
            getNodeRect: (...args) => layoutMethod('getNodeRect')?.(...args),
            isNodeLocked: scope.isNodeLocked,
            snapCanvasCoord: scope.snapCanvasCoord,
            buildNodeLayoutPatch: (...args) => nodeFactoryMethod('buildNodeLayoutPatch')?.(...args),
            buildNodeFlagPatch: (...args) => nodeFactoryMethod('buildNodeFlagPatch')?.(...args),
            invalidateMinimapStaticCache: (...args) => minimapMethod('invalidateMinimapStaticCache')?.(...args),
            renderNodes: (...args) => nodeRenderMethod('renderNodes')?.(...args),
            renderEdges: (...args) => invoke('renderEdges', ...args),
            renderSelectedChainOverlay: (...args) => invoke('renderSelectedChainOverlay', ...args),
            renderInspector: (...args) => invoke('renderInspector', ...args),
            renderMinimap: (...args) => minimapMethod('renderMinimap')?.(...args),
            renderCanvasAgentPanel: (...args) => invoke('renderCanvasAgentPanel', ...args),
            renderAll: (...args) => renderMethod('renderAll')?.(...args),
            pushHistory: (...args) => historyMethod('pushHistory')?.(...args),
            mutate: scope.mutate,
            showToast: scope.showToast,
            setTimeout: scope.setTimeout,
            t: scope.t
        });
        const selectionMethod = name => method(controllers.selection, name);

        controllers.graphDelete = createController(modules.graphDelete, 'createCanvasGraphDeleteController', {
            getProject: scope.getProject,
            getSelectionState: scope.getSelectionState,
            setSelectionState: scope.setSelectionState,
            getNode: scope.getNode,
            isNodeLocked: scope.isNodeLocked,
            deleteSelectedGroup: scope.deleteSelectedGroup,
            deleteTimelineClipById: scope.deleteTimelineClipById,
            showToast: scope.showToast,
            pushHistory: (...args) => historyMethod('pushHistory')?.(...args),
            stopResultPreviewPlayer: (...args) => resultPreviewMethod('stopResultPreviewPlayer')?.(...args),
            interruptDeletedResultRuns: scope.interruptDeletedResultRuns,
            getOutpaintOverlayState: scope.getOutpaintOverlayState,
            hideOutpaintOverlay: scope.hideOutpaintOverlay,
            getActiveInlineTagCartNodeId: scope.getActiveInlineTagCartNodeId,
            setActiveInlineTagCartNodeId: scope.setActiveInlineTagCartNodeId,
            handleCanvasAgentWorkflowNodeDeletion: scope.handleCanvasAgentWorkflowNodeDeletion,
            handleCanvasAgentWorkflowEdgeDeletion: scope.handleCanvasAgentWorkflowEdgeDeletion,
            refreshPresetSpecialNodeDom: scope.refreshPresetSpecialNodeDom,
            parseDetectionSlot: scope.parseDetectionSlot,
            configKeyForKind: scope.configKeyForKind,
            buildPresetUploadSlotPatch: factoryCallback('buildPresetUploadSlotPatch'),
            buildPresetTextInputPatch: factoryCallback('buildPresetTextInputPatch'),
            buildPresetConfigPatch: factoryCallback('buildPresetConfigPatch'),
            buildTextNodeStatePatch: factoryCallback('buildTextNodeStatePatch'),
            buildTextMergeStatePatch: factoryCallback('buildTextMergeStatePatch'),
            buildCompareStatePatch: factoryCallback('buildCompareStatePatch'),
            buildTimelineClipDeletePatch: scope.buildTimelineClipDeletePatch,
            buildBatchAnyStatePatch: factoryCallback('buildBatchAnyStatePatch'),
            buildClassicNodeStatePatch: factoryCallback('buildClassicNodeStatePatch'),
            buildSpecialNodeConnectionPatch: factoryCallback('buildSpecialNodeConnectionPatch'),
            buildSpecialNodeStatusPatch: factoryCallback('buildSpecialNodeStatusPatch'),
            buildStyleSelectorStatePatch: factoryCallback('buildStyleSelectorStatePatch'),
            buildSam3SourcePatch: factoryCallback('buildSam3SourcePatch'),
            buildSam3StatePatch: factoryCallback('buildSam3StatePatch'),
            buildMaskStatePatch: factoryCallback('buildMaskStatePatch'),
            buildDirectorTimelineStatePatch: factoryCallback('buildDirectorTimelineStatePatch'),
            buildTranslationStatePatch: factoryCallback('buildTranslationStatePatch'),
            buildTagCartStatePatch: factoryCallback('buildTagCartStatePatch'),
            buildWd14StatePatch: factoryCallback('buildWd14StatePatch'),
            buildConfigStatePatch: factoryCallback('buildConfigStatePatch'),
            buildVlmImageInputsPatch: scope.buildVlmImageInputsPatch,
            buildResultStatusPatch: factoryCallback('buildResultStatusPatch'),
            buildQwenTtsStatePatch: factoryCallback('buildQwenTtsStatePatch'),
            buildPoseStudioStatePatch: factoryCallback('buildPoseStudioStatePatch'),
            buildGaussianStudioStatePatch: factoryCallback('buildGaussianStudioStatePatch'),
            buildLivePortraitNodeStatePatch: factoryCallback('buildLivePortraitNodeStatePatch'),
            mergeCanvasRunStatus: scope.mergeCanvasRunStatus,
            buildVlmRunStatusPatch: scope.buildVlmRunStatusPatch,
            buildResultProducerPatch: factoryCallback('buildResultProducerPatch'),
            isQwenTtsNode: scope.isQwenTtsNode,
            isDirectorTimelineNode: scope.isDirectorTimelineNode,
            updateDirectorStatus: scope.updateDirectorStatus,
            refreshBatchAnyActiveItem: scope.refreshBatchAnyActiveItem,
            buildProjectNodesPatch: factoryCallback('buildProjectNodesPatch'),
            buildProjectEdgeFilterPatch: factoryCallback('buildProjectEdgeFilterPatch'),
            scheduleSave: scope.scheduleSave,
            mutate: scope.mutate,
            t: scope.t
        });

        controllers.resolutionDrag = createController(modules.resolutionDrag, 'createCanvasResolutionDragController', {
            getDocument: scope.getDocument,
            getResolutionRenderValues: scope.getResolutionRenderValues,
            getResolutionPreview: scope.getResolutionPreview,
            clamp: scope.clamp,
            quantizeResolutionValue: scope.quantizeResolutionValue,
            nowIso: scope.nowIso,
            buildConfigStatePatch: factoryCallback('buildConfigStatePatch'),
            applyConfigNodeToPreset: scope.applyConfigNodeToPreset,
            scheduleSave: scope.scheduleSave
        });

        controllers.clipboard = createController(modules.clipboard, 'createCanvasClipboardController', {
            getProject: scope.getProject,
            getSelectionState: scope.getSelectionState,
            setSelectionState: scope.setSelectionState,
            getSelectedNodeIdList: (...args) => selectionMethod('getSelectedNodeIdList')?.(...args),
            getNode: scope.getNode,
            getNodeRect: (...args) => layoutMethod('getNodeRect')?.(...args),
            cloneRunValue: scope.cloneRunValue,
            nowIso: scope.nowIso,
            uid: scope.uid,
            getVisibleClassicUploadSlots: scope.getVisibleClassicUploadSlots,
            getVisibleUploadSlots: scope.getVisibleUploadSlots,
            normalizeTimelineNode: scope.normalizeTimelineNode,
            applyConfigNodeToPreset: scope.applyConfigNodeToPreset,
            buildPresetUploadSlotPatch: factoryCallback('buildPresetUploadSlotPatch'),
            buildPresetTextInputPatch: factoryCallback('buildPresetTextInputPatch'),
            buildTextNodeStatePatch: factoryCallback('buildTextNodeStatePatch'),
            buildTextMergeStatePatch: factoryCallback('buildTextMergeStatePatch'),
            buildCompareStatePatch: factoryCallback('buildCompareStatePatch'),
            buildNoteStatePatch: factoryCallback('buildNoteStatePatch'),
            buildSpecialNodeConnectionPatch: factoryCallback('buildSpecialNodeConnectionPatch'),
            buildSpecialNodeStatusPatch: factoryCallback('buildSpecialNodeStatusPatch'),
            buildStyleSelectorStatePatch: factoryCallback('buildStyleSelectorStatePatch'),
            buildSam3SourcePatch: factoryCallback('buildSam3SourcePatch'),
            buildMaskStatePatch: factoryCallback('buildMaskStatePatch'),
            buildDirectorTimelineStatePatch: factoryCallback('buildDirectorTimelineStatePatch'),
            buildTranslationStatePatch: factoryCallback('buildTranslationStatePatch'),
            buildTagCartStatePatch: factoryCallback('buildTagCartStatePatch'),
            buildWd14StatePatch: factoryCallback('buildWd14StatePatch'),
            buildConfigStatePatch: factoryCallback('buildConfigStatePatch'),
            buildNodeLayoutPatch: (...args) => nodeFactoryMethod('buildNodeLayoutPatch')?.(...args),
            buildNodeFlagPatch: (...args) => nodeFactoryMethod('buildNodeFlagPatch')?.(...args),
            buildCanvasNodeStatusPatch: (...args) => runStatusMethod('buildCanvasNodeStatusPatch')?.(...args),
            buildPresetConfigPatch: factoryCallback('buildPresetConfigPatch'),
            buildProjectNodesPatch: factoryCallback('buildProjectNodesPatch'),
            buildProjectEdgeAppendPatch: factoryCallback('buildProjectEdgeAppendPatch'),
            buildClassicNodeStatePatch: factoryCallback('buildClassicNodeStatePatch'),
            buildWildcardsHelperStatePatch: factoryCallback('buildWildcardsHelperStatePatch'),
            buildVlmChatStatePatch: factoryCallback('buildVlmChatStatePatch'),
            buildVlmParamsPatch: scope.buildVlmParamsPatch,
            buildVlmImageInputsPatch: scope.buildVlmImageInputsPatch,
            buildVlmRunStatusPatch: scope.buildVlmRunStatusPatch,
            buildResultStatusPatch: factoryCallback('buildResultStatusPatch'),
            buildResultProducerPatch: factoryCallback('buildResultProducerPatch'),
            buildQwenTtsStatePatch: factoryCallback('buildQwenTtsStatePatch'),
            buildLivePortraitVideoExpressionStatePatch: factoryCallback('buildLivePortraitVideoExpressionStatePatch'),
            mergeCanvasRunStatus: scope.mergeCanvasRunStatus,
            isTextOutputNode: scope.isTextOutputNode,
            textMergeInputSlots: scope.textMergeInputSlots,
            wouldCreateTextCycle: scope.wouldCreateTextCycle,
            isPoseStudioImageSource: scope.isPoseStudioImageSource,
            isLivePortraitExpressionImageSource: scope.isLivePortraitExpressionImageSource,
            isVlmMediaSource: scope.isVlmMediaSource,
            getVlmImageSlots: scope.getVlmImageSlots,
            isSam3VideoMaskSource: scope.isSam3VideoMaskSource,
            isQwenTtsAudioSource: scope.isQwenTtsAudioSource,
            isQwenTtsNode: scope.isQwenTtsNode,
            isDirectorTimelineNode: scope.isDirectorTimelineNode,
            isDirectorMediaSourceForSlot: scope.isDirectorMediaSourceForSlot,
            updateDirectorStatus: scope.updateDirectorStatus,
            isImageCompareSource: scope.isImageCompareSource,
            isTimelineSource: scope.isTimelineSource,
            addTimelineClipFromSource: scope.addTimelineClipFromSource,
            pushHistory: (...args) => historyMethod('pushHistory')?.(...args),
            mutate: scope.mutate,
            showToast: scope.showToast,
            viewportCenterWorld: scope.viewportCenterWorld,
            t: scope.t
        });

        controllers.groupInteraction = createController(modules.groupInteraction, 'createCanvasGroupInteractionController', {
            getProject: scope.getProject,
            getGroupsLayer: scope.getGroupsLayer,
            getDocument: scope.getDocument,
            getGroup: scope.getGroup,
            getNode: scope.getNode,
            getNodesInsideGroup: scope.getNodesInsideGroup,
            isNodeLocked: scope.isNodeLocked,
            getSelectedGroupId: scope.getSelectedGroupId,
            t: scope.t,
            showToast: scope.showToast,
            selectGroupLight: (...args) => selectionMethod('selectGroupLight')?.(...args),
            openGroupContextMenu: scope.openGroupContextMenu,
            snapCanvasCoord: scope.snapCanvasCoord,
            snapCanvasSizeFromOrigin: scope.snapCanvasSizeFromOrigin,
            buildGroupFieldPatch: (...args) => factoryMethod('buildGroupFieldPatch')?.(...args),
            buildNodeLayoutPatch: (...args) => nodeFactoryMethod('buildNodeLayoutPatch')?.(...args),
            pushHistory: (...args) => historyMethod('pushHistory')?.(...args),
            beginDragEdgeLod: scope.beginDragEdgeLod,
            isDragEdgeLodActive: scope.isDragEdgeLodActive,
            scheduleDragEdgeSettleRender: scope.scheduleDragEdgeSettleRender,
            flushInteractiveLinkRender: scope.flushInteractiveLinkRender,
            updateGroupPositionDom: scope.updateGroupPositionDom,
            updateNodePositionDom: scope.updateNodePositionDom,
            scheduleInteractiveLinkRender: scope.scheduleInteractiveLinkRender,
            invalidateMinimapStaticCache: (...args) => minimapMethod('invalidateMinimapStaticCache')?.(...args),
            invalidateNodeSpatialIndex: (...args) => spatialMethod('invalidateNodeSpatialIndex')?.(...args),
            scheduleMinimapRender: (...args) => minimapMethod('scheduleMinimapRender')?.(...args),
            scheduleSave: scope.scheduleSave,
            flushMinimapRender: (...args) => minimapMethod('flushMinimapRender')?.(...args),
            renderInspector: scope.renderInspector
        });
        const groupInteractionMethod = name => method(controllers.groupInteraction, name);

        const selectAndFitNode = (node) => {
            if (!node) return;
            if (typeof scope.setSelectionState === 'function') {
                scope.setSelectionState({
                    selectedNodeId: node.id,
                    selectedNodeIds: new Set([node.id]),
                    selectedEdgeId: null,
                    selectedGroupId: null
                });
            }
            if (typeof scope.fitSelection === 'function') scope.fitSelection();
            renderMethod('renderAll')?.();
        };

        controllers.runPanels = createController(modules.runPanels, 'createCanvasRunPanelsController', {
            runQueueOpenPanel: scope.runQueueOpenPanel,
            runQueueClosePanel: scope.runQueueClosePanel,
            runQueueRenderPanel: scope.runQueueRenderPanel,
            runQueueHandleAction: scope.runQueueHandleAction,
            runHistoryOpenPanel: scope.runHistoryOpenPanel,
            runHistoryClosePanel: scope.runHistoryClosePanel,
            runHistoryRenderPanel: scope.runHistoryRenderPanel,
            runHistoryHandleAction: scope.runHistoryHandleAction,
            getProject: scope.getProject,
            getRoot: scope.getRoot,
            getRunQueuePanel: scope.getRunQueuePanel,
            getRunHistoryPanel: scope.getRunHistoryPanel,
            t: scope.t,
            escapeHtml: scope.escapeHtml,
            formatLocalTime: scope.formatLocalTime,
            isTerminalRunState: scope.isTerminalRunState,
            showToast: scope.showToast,
            getNode: scope.getNode,
            closeCanvasSettingsPanel: scope.closeCanvasSettingsPanel,
            controlResultRun: scope.controlResultRun,
            retryResultRun: scope.retryResultRun,
            selectAndFitNode,
            renderRunQueueWidget: scope.renderRunQueueWidget
        });
        const runPanelsMethod = name => method(controllers.runPanels, name);

        controllers.nodeResize = createController(modules.nodeResize, 'createCanvasNodeResizeController', {
            getProject: scope.getProject,
            getDocument: scope.getDocument,
            getNode: scope.getNode,
            getNodeRect: (...args) => layoutMethod('getNodeRect')?.(...args),
            isNodeLocked: scope.isNodeLocked,
            minResizableNodeSize: (...args) => layoutMethod('minResizableNodeSize')?.(...args),
            supportsCollapsedPromptHeight: scope.supportsCollapsedPromptHeight,
            collapsedPromptNodeHeight: scope.collapsedPromptNodeHeight,
            clamp: scope.clamp,
            snapCanvasSizeFromOrigin: scope.snapCanvasSizeFromOrigin,
            buildNodeLayoutPatch: (...args) => nodeFactoryMethod('buildNodeLayoutPatch')?.(...args),
            selectNodeForResize: (nodeId) => {
                if (typeof scope.setSelectionState === 'function') {
                    scope.setSelectionState({
                        selectedNodeId: nodeId,
                        selectedNodeIds: new Set([nodeId]),
                        selectedEdgeId: null,
                        selectedGroupId: null
                    });
                }
            },
            refreshSelectionUi: (...args) => selectionMethod('refreshSelectionUi')?.(...args),
            pushHistory: (...args) => historyMethod('pushHistory')?.(...args),
            updateNodePositionDom: scope.updateNodePositionDom,
            refreshNoteDom: scope.refreshNoteDom,
            scheduleInteractiveLinkRender: scope.scheduleInteractiveLinkRender,
            invalidateMinimapStaticCache: (...args) => minimapMethod('invalidateMinimapStaticCache')?.(...args),
            invalidateNodeSpatialIndex: (...args) => spatialMethod('invalidateNodeSpatialIndex')?.(...args),
            scheduleMinimapRender: (...args) => minimapMethod('scheduleMinimapRender')?.(...args),
            scheduleSave: scope.scheduleSave,
            flushInteractiveLinkRender: scope.flushInteractiveLinkRender,
            flushMinimapRender: (...args) => minimapMethod('flushMinimapRender')?.(...args),
            getSelectedNodeId: scope.getSelectedNodeId,
            renderInspector: scope.renderInspector
        });
        const nodeResizeMethod = name => method(controllers.nodeResize, name);

        controllers.nodeDrag = createController(modules.nodeDrag, 'createCanvasNodeDragController', {
            getProject: scope.getProject,
            getDocument: scope.getDocument,
            getNode: scope.getNode,
            getSelectedNodeIds: scope.getSelectedNodeIds,
            isNodeLocked: scope.isNodeLocked,
            t: scope.t,
            performanceNow: scope.performanceNow,
            snapCanvasCoord: scope.snapCanvasCoord,
            buildNodeLayoutPatch: (...args) => nodeFactoryMethod('buildNodeLayoutPatch')?.(...args),
            hideCanvasTooltip: scope.hideCanvasTooltip,
            hideHoverPreview: scope.hideHoverPreview,
            closePreviewSelectMenu: scope.closePreviewSelectMenu,
            setSuppressWheelUntil: scope.setSuppressWheelUntil,
            showToast: scope.showToast,
            beginDragEdgeLod: scope.beginDragEdgeLod,
            pushHistory: (...args) => historyMethod('pushHistory')?.(...args),
            updateNodePositionDom: scope.updateNodePositionDom,
            scheduleInteractiveLinkRender: scope.scheduleInteractiveLinkRender,
            invalidateMinimapStaticCache: (...args) => minimapMethod('invalidateMinimapStaticCache')?.(...args),
            invalidateNodeSpatialIndex: (...args) => spatialMethod('invalidateNodeSpatialIndex')?.(...args),
            scheduleMinimapRender: (...args) => minimapMethod('scheduleMinimapRender')?.(...args),
            isDragEdgeLodActive: scope.isDragEdgeLodActive,
            scheduleDragEdgeSettleRender: scope.scheduleDragEdgeSettleRender,
            flushInteractiveLinkRender: scope.flushInteractiveLinkRender,
            scheduleSave: scope.scheduleSave,
            flushMinimapRender: (...args) => minimapMethod('flushMinimapRender')?.(...args)
        });
        const nodeDragMethod = name => method(controllers.nodeDrag, name);

        controllers.pan = createController(modules.pan, 'createCanvasPanController', {
            getProject: scope.getProject,
            getViewport: scope.getViewport,
            buildProjectViewportPatch: (...args) => factoryMethod('buildProjectViewportPatch')?.(...args),
            getDocument: scope.getDocument,
            performanceNow: scope.performanceNow,
            getPerfStats: scope.getPerfStats,
            hideCanvasTooltip: scope.hideCanvasTooltip,
            hideHoverPreview: scope.hideHoverPreview,
            closePreviewSelectMenu: scope.closePreviewSelectMenu,
            cancelPanEdgeSettleRender: scope.cancelPanEdgeSettleRender,
            cancelDragEdgeSettleRender: scope.cancelDragEdgeSettleRender,
            endDragEdgeLodVisual: scope.endDragEdgeLodVisual,
            preferSvgEdgesForViewportInteraction: scope.preferSvgEdgesForViewportInteraction,
            setSuppressWheelUntil: scope.setSuppressWheelUntil,
            applyViewport: scope.applyViewport,
            updateMinimapForViewportInteraction: (...args) => minimapMethod('updateMinimapForViewportInteraction')?.(...args),
            schedulePanNodeRender: scope.schedulePanNodeRender,
            clearPanNodeRenderTimer: scope.clearPanNodeRenderTimer,
            cancelMinimapRender: (...args) => minimapMethod('cancelMinimapRender')?.(...args),
            getVisibleWorldRect: (...args) => method(controllers.viewportRender, 'getVisibleWorldRect')?.(...args),
            shouldDeferPanEdgeSettleRender: scope.shouldDeferPanEdgeSettleRender,
            renderNodes: (...args) => nodeRenderMethod('renderNodes')?.(...args),
            schedulePanEdgeSettleRender: scope.schedulePanEdgeSettleRender,
            renderFinalEdgesAfterPan: scope.renderFinalEdgesAfterPan,
            renderMinimap: (...args) => minimapMethod('renderMinimap')?.(...args),
            renderPerformanceHud: scope.renderPerformanceHud,
            scheduleSave: scope.scheduleSave
        });

        controllers.marquee = createController(modules.marquee, 'createCanvasMarqueeController', {
            getViewport: scope.getViewport,
            getRoot: scope.getRoot,
            getDocument: scope.getDocument,
            getWindow: scope.getWindow,
            getSelectedNodeIds: scope.getSelectedNodeIds,
            getPerfStats: scope.getPerfStats,
            getMarqueeNodeRecords: (...args) => spatialMethod('getMarqueeNodeRecords')?.(...args) || [],
            clientToWorld: scope.clientToWorld,
            hideCanvasTooltip: scope.hideCanvasTooltip,
            hideHoverPreview: scope.hideHoverPreview,
            closePreviewSelectMenu: scope.closePreviewSelectMenu,
            setSuppressWheelUntil: scope.setSuppressWheelUntil,
            applyMarqueeSelection: (ids) => {
                const nextIds = new Set(ids || []);
                const current = typeof scope.getSelectionState === 'function'
                    ? (scope.getSelectionState() || {})
                    : {};
                if (typeof scope.setSelectionState === 'function') {
                    const nextList = Array.from(nextIds);
                    scope.setSelectionState(Object.assign({}, current, {
                        selectedNodeId: nextList.length ? nextList[nextList.length - 1] : null,
                        selectedNodeIds: nextIds,
                        selectedEdgeId: null
                    }));
                }
            },
            updateSelectionDomClasses: (...args) => selectionMethod('updateSelectionDomClasses')?.(...args),
            invalidateMinimapStaticCache: (...args) => minimapMethod('invalidateMinimapStaticCache')?.(...args),
            scheduleMinimapRender: (...args) => minimapMethod('scheduleMinimapRender')?.(...args),
            renderSelectedChainOverlay: scope.renderSelectedChainOverlay,
            renderInspector: scope.renderInspector,
            flushMinimapRender: (...args) => minimapMethod('flushMinimapRender')?.(...args),
            renderCanvasAgentPanel: scope.renderCanvasAgentPanel
        });
        const marqueeMethod = name => method(controllers.marquee, name);

        controllers.viewportPointer = createController(modules.viewportPointer, 'createCanvasViewportPointerController', {
            t: scope.t,
            getRoot: scope.getRoot,
            clientToWorld: scope.clientToWorld,
            setLastPointerWorld: scope.setLastPointerWorld,
            setTimeout: scope.setTimeout,
            openAddNodeMenu: scope.openAddNodeMenu,
            closeContextMenu: scope.closeContextMenu,
            startPan: (...args) => method(controllers.pan, 'startPan')?.(...args),
            findCanvasEdgeAtClient: scope.findCanvasEdgeAtClient,
            selectEdge: (...args) => selectionMethod('selectEdge')?.(...args),
            findCanvasNodeAtWorldPoint: (...args) => spatialMethod('findCanvasNodeAtWorldPoint')?.(...args),
            isCanvasAgentPickingReference: scope.isCanvasAgentPickingReference,
            setCanvasAgentPickingReference: scope.setCanvasAgentPickingReference,
            addCanvasAgentReferenceFromNode: scope.addCanvasAgentReferenceFromNode,
            renderCanvasAgentPanel: scope.renderCanvasAgentPanel,
            setCanvasAgentMessage: scope.setCanvasAgentMessage,
            isNodeSelected: (nodeId) => {
                const state = typeof scope.getSelectionState === 'function'
                    ? (scope.getSelectionState() || {})
                    : {};
                const ids = state.selectedNodeIds;
                return ids instanceof Set ? ids.has(nodeId) : Array.isArray(ids) && ids.includes(nodeId);
            },
            getSelectedNodeId: scope.getSelectedNodeId,
            hasSelectedEdge: () => {
                const state = typeof scope.getSelectionState === 'function'
                    ? (scope.getSelectionState() || {})
                    : {};
                return state.selectedEdgeId !== null && state.selectedEdgeId !== undefined;
            },
            selectNodeLight: (...args) => selectionMethod('selectNodeLight')?.(...args),
            toggleNodeSelectionLight: (...args) => selectionMethod('toggleNodeSelectionLight')?.(...args),
            focusSelectedNode: (nodeId) => {
                const current = typeof scope.getSelectionState === 'function'
                    ? (scope.getSelectionState() || {})
                    : {};
                if (typeof scope.setSelectionState === 'function') {
                    scope.setSelectionState(Object.assign({}, current, {
                        selectedNodeId: nodeId,
                        selectedEdgeId: null
                    }));
                }
                selectionMethod('refreshSelectionUi')?.();
            },
            getNode: scope.getNode,
            startNodeDrag: (...args) => nodeDragMethod('startNodeDrag')?.(...args),
            getMode: scope.getMode,
            startMarqueeSelection: (...args) => marqueeMethod('startMarqueeSelection')?.(...args)
        });
        const viewportPointerMethod = name => method(controllers.viewportPointer, name);

        controllers.connection = createController(modules.connection, 'createCanvasConnectionController', {
            getDocument: scope.getDocument,
            performanceNow: scope.performanceNow,
            clientToWorld: scope.clientToWorld,
            hideCanvasTooltip: scope.hideCanvasTooltip,
            hideHoverPreview: scope.hideHoverPreview,
            closePreviewSelectMenu: scope.closePreviewSelectMenu,
            setSuppressWheelUntil: scope.setSuppressWheelUntil,
            selectNode: (...args) => selectionMethod('selectNode')?.(...args),
            selectInputConnectionTarget: (nodeId) => {
                const current = typeof scope.getSelectionState === 'function'
                    ? (scope.getSelectionState() || {})
                    : {};
                if (typeof scope.setSelectionState === 'function') {
                    scope.setSelectionState(Object.assign({}, current, {
                        selectedNodeId: nodeId,
                        selectedNodeIds: new Set([nodeId]),
                        selectedEdgeId: null
                    }));
                }
                selectionMethod('refreshSelectionUi')?.();
            },
            getOutputPoint: scope.getOutputPoint,
            getHandleCenterWorldPoint: scope.getHandleCenterWorldPoint,
            findNearestConnectionTarget: scope.findNearestConnectionTarget,
            connectSourceToTarget: scope.connectSourceToTarget,
            setPendingConnection: scope.setPendingConnection,
            renderTempEdge: scope.renderTempEdge,
            renderAll: (...args) => renderMethod('renderAll')?.(...args),
            openInputPortCreateMenu: scope.openInputPortCreateMenu,
            openAddNodeMenu: scope.openAddNodeMenu
        });
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

        controllers.status = createController(modules.status, 'createCanvasStatusController', {
            t: scope.t,
            getRoot: scope.getRoot,
            getProject: scope.getProject,
            getStorageScope: scope.getStorageScope,
            getStorageKey: scope.getStorageKey,
            getZoomLabel: scope.getZoomLabel,
            getCanvasTitle: scope.getCanvasTitle,
            storageDisplayLocation: scope.storageDisplayLocation,
            storageDisplayPath: scope.storageDisplayPath,
            renderHistoryButtons: scope.renderHistoryButtons,
            renderSystemInfo: scope.renderSystemInfo,
            renderRunQueueWidget: scope.renderRunQueueWidget
        });
        const renderStatus = method(controllers.status, 'renderStatus');

        controllers.presetNodeRenderer = createController(modules.presetNodeRenderer, 'createCanvasPresetNodeRenderer', {
            t: scope.t,
            tOption: scope.tOption,
            clamp: scope.clamp,
            escapeHtml: scope.escapeHtml,
            getClassicModes: scope.getClassicModes,
            getClassicOutpaintDirs: scope.getClassicOutpaintDirs,
            getClassicInpaintMethods: scope.getClassicInpaintMethods,
            getClassicEnhanceUovProcessingOrder: scope.getClassicEnhanceUovProcessingOrder,
            getClassicEnhanceUovPromptTypes: scope.getClassicEnhanceUovPromptTypes,
            getClassicIpMaxImages: scope.getClassicIpMaxImages,
            getProject: scope.getProject,
            getNode: scope.getNode,
            getClassicUovMethods: scope.getClassicUovMethods,
            getClassicIpTypes: scope.getClassicIpTypes,
            getClassicInpaintEngines: scope.getClassicInpaintEngines,
            normalizeClassicInpaintMode: scope.normalizeClassicInpaintMode,
            getInpaintModeDefaults: scope.getInpaintModeDefaults,
            getClassicEnhanceRegionValues: scope.getClassicEnhanceRegionValues,
            getClassicEnhanceRegionDefault: scope.getClassicEnhanceRegionDefault,
            detectionSlotForRegion: scope.detectionSlotForRegion,
            getDetectionConfigLabel: scope.getDetectionConfigLabel,
            enhanceRegionKey: scope.enhanceRegionKey,
            portHintText: scope.portHintText,
            danbooruAutocompleteAttrs: scope.danbooruAutocompleteAttrs,
            getPromptTextSourceNode: scope.getPromptTextSourceNode,
            getVisibleClassicUploadSlots: scope.getVisibleClassicUploadSlots,
            getVisibleUploadSlots: scope.getVisibleUploadSlots,
            getUploadSlotMediaKind: scope.getUploadSlotMediaKind,
            collapsedKeepClass: scope.collapsedKeepClass,
            slotPortTitle: scope.slotPortTitle,
            slotPortButtonTitle: scope.slotPortButtonTitle,
            slotPortHintText: scope.slotPortHintText,
            notConnectedText: scope.notConnectedText,
            renderPresetModelStatusHtml: scope.renderPresetModelStatusHtml,
            renderPresetParamControl: scope.renderPresetParamControl,
            renderNodeStateBadges: scope.renderNodeStateBadges,
            renderRunnableNodeStatusFoot: scope.renderRunnableNodeStatusFoot,
            renderPresetConfigPortRow: scope.renderPresetConfigPortRow,
            getPresetConfigKinds: scope.getPresetConfigKinds,
            getSlotLabels: scope.getSlotLabels,
            getPresetSchema: scope.getPresetSchema,
            getPresetTheme: scope.getPresetTheme,
            getPresetThemeInfo: scope.getPresetThemeInfo,
            canvasAgentPresetPromptDefaults: scope.canvasAgentPresetPromptDefaults,
            normalizeCanvasColor: scope.normalizeCanvasColor,
            presetSpecialViewerUrl: scope.presetSpecialViewerUrl,
            localizeCanvasLabel: scope.localizeCanvasLabel,
            isStyleTransferPresetNode: scope.isStyleTransferPresetNode,
            isLivePortraitVideoExpressionPresetNode: scope.isLivePortraitVideoExpressionPresetNode,
            isLtx23MultiGuidePresetNode: scope.isLtx23MultiGuidePresetNode,
            isMiniMaxH3PresetNode: scope.isMiniMaxH3PresetNode,
            renderStyleTransferPresetController: scope.renderStyleTransferPresetController,
            renderLivePortraitVideoExpressionPresetController: scope.renderLivePortraitVideoExpressionPresetController,
            renderLtx23GuidePresetController: scope.renderLtx23GuidePresetController,
            renderMiniMaxH3StoryboardPresetController: scope.renderMiniMaxH3StoryboardPresetController
        });
        const renderPresetMethod = name => method(controllers.presetNodeRenderer, name);

        controllers.nodeLayout = createController(modules.nodeLayout, 'createCanvasNodeLayoutController', {
            clamp: scope.clamp,
            collapsedPromptMinHeight: scope.collapsedPromptMinHeight,
            collapsedPromptNodeHeight: scope.collapsedPromptNodeHeight,
            defaultNodeSize: scope.defaultNodeSize,
            getProjectNodes: scope.getProjectNodes,
            getVisibleWorldRect: (...args) => method(controllers.viewportRender, 'getVisibleWorldRect')?.(...args) || {},
            getMeasuredNodeLayout: scope.getMeasuredNodeLayout,
            buildResultLayoutPatch: scope.buildResultLayoutPatch,
            buildNodeLayoutPatch: (...args) => method(controllers.nodeFactory, 'buildNodeLayoutPatch')?.(...args) || {},
            scheduleSave: scope.scheduleSave,
            supportsCollapsedPromptHeight: scope.supportsCollapsedPromptHeight,
            viewportFindOpenNodePosition: scope.viewportFindOpenNodePosition,
            viewportGetNodeRect: scope.viewportGetNodeRect
        });
        const layoutMethod = name => method(controllers.nodeLayout, name);

        controllers.viewportRender = createController(modules.viewportRender, 'createCanvasViewportRenderController', {
            getProject: scope.getProject,
            getViewport: scope.getViewport,
            nodeRenderOverscanPx: scope.nodeRenderOverscanPx,
            edgeRenderOverscanPx: scope.edgeRenderOverscanPx,
            edgePointCacheMinEdges: scope.edgePointCacheMinEdges,
            defaultNodeSize: scope.defaultNodeSize,
            getNodeLayoutSize: (...args) => layoutMethod('getNodeLayoutSize')?.(...args),
            getSelectedNodeId: scope.getSelectedNodeId,
            getSelectedNodeIds: scope.getSelectedNodeIds,
            getSelectedEdgeId: scope.getSelectedEdgeId,
            getConnectingFromId: scope.getConnectingFromId,
            isNodeVisuallyRunning: scope.isNodeVisuallyRunning,
            viewportGetVisibleWorldRect: scope.viewportGetVisibleWorldRect,
            viewportGetNodeRenderWorldRect: scope.viewportGetNodeRenderWorldRect,
            viewportShouldRenderNodeInViewport: scope.viewportShouldRenderNodeInViewport,
            viewportShouldRenderEdgeInViewport: scope.viewportShouldRenderEdgeInViewport,
            viewportGetEdgeSvgBounds: scope.viewportGetEdgeSvgBounds
        });
        const viewportMethod = name => method(controllers.viewportRender, name);

        controllers.nodeSpatialIndex = createController(modules.nodeSpatialIndex, 'createCanvasNodeSpatialIndexController', {
            getProject: scope.getProject,
            nodeSpatialIndexMinNodes: scope.nodeSpatialIndexMinNodes,
            nodeSpatialIndexCellSize: scope.nodeSpatialIndexCellSize,
            getNodeRect: (...args) => layoutMethod('getNodeRect')?.(...args),
            isNodeVisuallyRunning: scope.isNodeVisuallyRunning,
            isResultRefreshing: scope.isResultRefreshing,
            rectsOverlap: scope.viewportRectsOverlap,
            shouldRenderNodeInViewport: (...args) => viewportMethod('shouldRenderNodeInViewport')?.(...args),
            getPerfStats: scope.getPerfStats,
            getCanvasRenderMode: scope.getCanvasRenderMode,
            canvasOverviewExitZoom: scope.canvasOverviewExitZoom,
            isPanning: scope.isPanning,
            panPreviewNodeBudget: scope.panPreviewNodeBudget,
            nodeRenderOverscanPx: scope.nodeRenderOverscanPx,
            panPreviewDeferCoveragePadPx: scope.panPreviewDeferCoveragePadPx,
            setNodeRenderCoverageRect: scope.setNodeRenderCoverageRect,
            getSelectedNodeId: scope.getSelectedNodeId,
            getSelectedNodeIds: scope.getSelectedNodeIds,
            getConnectingFromId: scope.getConnectingFromId,
            getDraggingNodeIds: scope.getDraggingNodeIds,
            getNodeResizeNodeId: scope.getNodeResizeNodeId,
            getActiveInlineTagCartNodeId: scope.getActiveInlineTagCartNodeId
        });
        const spatialMethod = name => method(controllers.nodeSpatialIndex, name);

        controllers.nodeFactory = createController(modules.nodeFactory, 'createCanvasNodeFactoryController', {
            uid: scope.uid,
            cloneRunValue: scope.cloneRunValue,
            nowIso: scope.nowIso,
            t: scope.t,
            normalizePresetName: scope.normalizePresetName,
            canvasAgentPresetPromptDefaults: scope.canvasAgentPresetPromptDefaults,
            getClassicIpTypes: scope.getClassicIpTypes,
            enhanceRegionKey: scope.enhanceRegionKey,
            registryClassicEnhanceRegionDefaults: scope.registryClassicEnhanceRegionDefaults,
            registryClassicIpControlTypes: scope.registryClassicIpControlTypes,
            getVisiblePresetParams: (...args) => renderPresetMethod('getVisiblePresetParams')?.(...args),
            getVisibleUploadSlots: scope.getVisibleUploadSlots,
            ensurePresetSpecialControllerState: scope.ensurePresetSpecialControllerState
        });
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
