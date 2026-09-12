(function () {
    'use strict';

    const modules = {
        textNode: window.SimpAICanvasWorkbenchTextNodeFactory || {},
        auxNode: window.SimpAICanvasWorkbenchAuxNodeFactory || {},
        batchAnyNode: window.SimpAICanvasWorkbenchBatchAnyNodeFactory || {},
        maskNode: window.SimpAICanvasWorkbenchMaskNodeFactory || {},
        resultNode: window.SimpAICanvasWorkbenchResultNodeFactory || {},
        mediaNode: window.SimpAICanvasWorkbenchMediaNodeFactory || {},
        inputNode: window.SimpAICanvasWorkbenchInputNodeFactory || {},
        uploadNode: window.SimpAICanvasWorkbenchUploadNodeFactory || {},
        batchItem: window.SimpAICanvasWorkbenchBatchItemFactory || {},
        configNode: window.SimpAICanvasWorkbenchConfigNodeFactory || {},
        xyzMatrixNode: window.SimpAICanvasWorkbenchXyzMatrixNodeFactory || {},
        group: window.SimpAICanvasWorkbenchGroupFactory || {},
        runRecord: window.SimpAICanvasWorkbenchRunRecordFactory || {},
        batchJob: window.SimpAICanvasWorkbenchBatchJobFactory || {},
        edge: window.SimpAICanvasWorkbenchEdgeFactory || {},
        projectPatch: window.SimpAICanvasWorkbenchProjectPatchFactory || {},
        asset: window.SimpAICanvasWorkbenchAssetFactory || {},
        specialNodePatch: window.SimpAICanvasWorkbenchSpecialNodePatchFactory || {},
        agentPatch: window.SimpAICanvasWorkbenchAgentPatchFactory || {},
        vlmChatState: window.SimpAICanvasWorkbenchVlmChatStateFactory || {}
    };

    function createController(module, factoryName, context) {
        const create = module && module[factoryName];
        return typeof create === 'function' ? (create(context) || {}) : {};
    }

    function createCanvasWorkbenchFactoryContext(source) {
        const scope = source?.factorySource || source || {};
        const controllers = {};

        function invoke(controllerKey, methodName, fallbackKind, args) {
            const controller = controllers[controllerKey];
            const method = controller && controller[methodName];
            const fallback = fallbackKind === 'null' ? null : {};
            if (typeof method !== 'function') return fallback;
            return method.apply(controller, args) || fallback;
        }

        const buildAssetReference = (...args) => invoke('asset', 'buildAssetReference', 'null', args);

        controllers.textNode = createController(modules.textNode, 'createCanvasTextNodeFactoryController', {
            uid: scope.uid,
            nowIso: scope.nowIso,
            t: scope.t,
            defaultNodeSize: scope.defaultNodeSize,
            cloneRunValue: scope.cloneRunValue,
            tagCartLabel: scope.tagCartLabel
        });
        controllers.auxNode = createController(modules.auxNode, 'createCanvasAuxNodeFactoryController', {
            uid: scope.uid,
            nowIso: scope.nowIso,
            t: scope.t,
            defaultNodeSize: scope.defaultNodeSize,
            cloneRunValue: scope.cloneRunValue,
            mediaBrowserLabel: scope.mediaBrowserLabel,
            mediaBrowserInitialState: scope.mediaBrowserInitialState,
            serializableMediaBrowserState: scope.serializableMediaBrowserState,
            getViewportCenterWorld: () => typeof scope.viewportCenterWorld === 'function'
                ? scope.viewportCenterWorld()
                : {}
        });
        controllers.batchAnyNode = createController(modules.batchAnyNode, 'createCanvasBatchAnyNodeFactoryController', {
            uid: scope.uid,
            defaultNodeSize: scope.defaultNodeSize,
            cloneRunValue: scope.cloneRunValue
        });
        controllers.maskNode = createController(modules.maskNode, 'createCanvasMaskNodeFactoryController', {
            uid: scope.uid,
            advancedMaskingLabel: scope.advancedMaskingLabel,
            cloneRunValue: scope.cloneRunValue,
            buildAssetReference
        });
        controllers.resultNode = createController(modules.resultNode, 'createCanvasResultNodeFactoryController', {
            uid: scope.uid,
            t: scope.t,
            cloneRunValue: scope.cloneRunValue,
            nowIso: scope.nowIso,
            defaultResultNodeSize: scope.defaultResultNodeSize
        });
        controllers.mediaNode = createController(modules.mediaNode, 'createCanvasMediaNodeFactoryController', {
            uid: scope.uid,
            cloneRunValue: scope.cloneRunValue,
            defaultNodeSize: scope.defaultNodeSize,
            getAssetMediaKind: scope.assetMediaKind
        });
        controllers.inputNode = createController(modules.inputNode, 'createCanvasInputNodeFactoryController', {
            uid: scope.uid,
            t: scope.t,
            defaultNodeSize: scope.defaultNodeSize
        });
        controllers.uploadNode = createController(modules.uploadNode, 'createCanvasUploadNodeFactoryController', {
            uid: scope.uid,
            nowIso: scope.nowIso,
            defaultNodeSize: scope.defaultNodeSize
        });
        controllers.batchItem = createController(modules.batchItem, 'createCanvasBatchItemFactoryController', {
            uid: scope.uid,
            nowIso: scope.nowIso,
            t: scope.t,
            cloneRunValue: scope.cloneRunValue
        });
        controllers.configNode = createController(modules.configNode, 'createCanvasConfigNodeFactoryController', {
            uid: scope.uid,
            nowIso: scope.nowIso,
            cloneRunValue: scope.cloneRunValue
        });
        controllers.xyzMatrixNode = createController(modules.xyzMatrixNode, 'createCanvasXyzMatrixNodeFactoryController', {
            uid: scope.uid,
            nowIso: scope.nowIso,
            t: scope.t,
            defaultNodeSize: scope.defaultNodeSize,
            cloneRunValue: scope.cloneRunValue,
            script: scope.xyzPlotScriptName
        });
        controllers.group = createController(modules.group, 'createCanvasGroupFactoryController', {
            uid: scope.uid,
            t: scope.t,
            clamp: scope.clamp,
            normalizeCanvasColor: scope.normalizeCanvasColor
        });
        controllers.runRecord = createController(modules.runRecord, 'createCanvasRunRecordFactoryController', {
            nowIso: scope.nowIso,
            cloneRunValue: scope.cloneRunValue,
            clamp: scope.clamp,
            isTerminalRunState: scope.isTerminalRunState
        });
        controllers.batchJob = createController(modules.batchJob, 'createCanvasBatchJobFactoryController', {
            nowIso: scope.nowIso,
            cloneRunValue: scope.cloneRunValue,
            xyzScript: scope.xyzPlotScriptName
        });
        controllers.edge = createController(modules.edge, 'createCanvasEdgeFactoryController', {
            uid: scope.uid
        });
        controllers.projectPatch = createController(modules.projectPatch, 'createCanvasProjectPatchFactoryController', {});
        controllers.asset = createController(modules.asset, 'createCanvasAssetFactoryController', {
            uid: scope.uid,
            nowIso: scope.nowIso,
            cloneRunValue: scope.cloneRunValue
        });
        controllers.specialNodePatch = createController(modules.specialNodePatch, 'createCanvasSpecialNodePatchFactoryController', {
            nowIso: scope.nowIso,
            cloneRunValue: scope.cloneRunValue,
            buildAssetReference
        });
        controllers.agentPatch = createController(modules.agentPatch, 'createCanvasAgentPatchFactoryController', {
            nowIso: scope.nowIso,
            cloneRunValue: scope.cloneRunValue
        });
        controllers.vlmChatState = createController(modules.vlmChatState, 'createCanvasVlmChatStateFactoryController', {
            cloneRunValue: scope.cloneRunValue
        });

        const api = { controllers };
        const expose = (controllerKey, fallbackKind, names) => {
            names.forEach((name) => {
                api[name] = (...args) => invoke(controllerKey, name, fallbackKind, args);
            });
        };

        expose('textNode', 'null', [
            'buildTextNode', 'buildTextMergeNode', 'buildTranslationNode', 'buildTranslationStatus',
            'buildWd14Status', 'buildTagCartNode', 'buildWd14Node'
        ]);
        expose('textNode', 'object', [
            'buildTextNodeStatePatch', 'buildTranslationStatePatch', 'buildTextMergeStatePatch',
            'buildWd14StatePatch', 'buildTagCartStatePatch', 'buildTagCartSizePatch'
        ]);
        expose('auxNode', 'null', ['buildWildcardsHelperNode', 'buildMediaBrowserNode', 'buildNoteNode']);
        expose('auxNode', 'object', [
            'buildWildcardsHelperStatePatch', 'buildMediaBrowserStatePatch', 'buildNoteStatePatch'
        ]);
        expose('batchAnyNode', 'null', ['buildBatchAnyNode', 'buildBatchAnyItemStatePatch']);
        expose('batchAnyNode', 'object', ['buildBatchAnyStatePatch', 'buildBatchAnyLegacyTypePatch']);
        expose('maskNode', 'null', ['buildMaskNode', 'buildMaskStatus']);
        expose('maskNode', 'object', ['buildMaskStatePatch']);
        expose('resultNode', 'null', [
            'buildManualOutputNode', 'buildReservedResultNode', 'buildQueuedResultNode',
            'buildDirectorSegmentResultNode', 'buildTimelineOutputResultNode', 'buildTimelineCompareResultNode'
        ]);
        expose('resultNode', 'object', [
            'buildResultStatusPatch', 'buildResultAssetPatch', 'buildResultSelectedAssetMetadataPatch',
            'buildResultPreviewPatch', 'buildResultProducerPatch', 'buildResultSourcePatch',
            'buildCanvasAgentReservedResultSource', 'buildTimelineResultPatch', 'buildResultRunMetadataPatch',
            'buildResultOutputPatch', 'buildResultRefreshPreparingPatch', 'buildResultRefreshReconciledPatch',
            'buildResultRefreshClearedPatch', 'buildResultRefreshFailurePatch', 'buildResultStaleStatePatch',
            'buildResultFingerprintPatch', 'buildResultDryRunSourcePatch', 'buildResultManualReplacementPatch',
            'buildResultMaterializationPatch', 'buildResultAssetSelectionPatch', 'buildResultBatchMetadataPatch',
            'buildResultLayoutPatch'
        ]);
        expose('mediaNode', 'null', ['buildImageNodeFromAsset', 'buildMediaNodeFromAsset']);
        expose('mediaNode', 'object', ['buildMediaNodeSourcePatch', 'buildMediaNodeStatePatch']);
        expose('inputNode', 'null', ['buildEmptyImageNodeForInput', 'buildEmptyMediaNodeForInput']);
        expose('uploadNode', 'null', [
            'buildOutputGalleryMediaNode', 'buildImageNodeFromTransferItem', 'buildImageNodeFromFile',
            'buildMediaNodeFromFile'
        ]);
        expose('batchItem', 'null', [
            'buildTextBatchItemFromFile', 'buildMediaBatchItemFromFile', 'buildTextBatchItemFromSource',
            'buildMediaBatchItemFromSource'
        ]);
        expose('configNode', 'null', ['buildConfigNode']);
        expose('configNode', 'object', ['buildConfigStatePatch']);
        expose('xyzMatrixNode', 'null', ['buildXyzMatrixNode']);
        expose('xyzMatrixNode', 'object', ['buildXyzMatrixStatePatch']);
        expose('group', 'null', ['buildAgentWorkflowGroup', 'buildAreaGroup']);
        expose('group', 'object', ['buildGroupIdPatch', 'buildGroupFieldPatch']);
        expose('runRecord', 'null', [
            'buildQwenTtsRunRecord', 'buildPresetRunRecord', 'buildDirectorSegmentRunRecord'
        ]);
        expose('runRecord', 'object', [
            'buildRunStoragePatch', 'buildQwenTtsRunResponsePatch', 'buildCanvasRunResponsePatch',
            'buildCanvasDryRunPatch'
        ]);
        expose('batchJob', 'null', ['buildXyzBatchJob', 'buildBatchAnyJob']);
        expose('batchJob', 'object', [
            'buildBatchJobStatePatch', 'buildBatchJobRunIdsPatch', 'buildBatchJobFailurePatch',
            'buildBatchJobCompletionPatch'
        ]);
        expose('edge', 'null', ['buildCanvasEdge']);
        expose('projectPatch', 'object', [
            'buildProjectNodeAppendPatch', 'buildProjectMetadataPatch', 'buildProjectIdentityPatch',
            'buildProjectDefaultPatch', 'buildProjectDemoPatch', 'buildProjectUpdatedAtPatch',
            'buildProjectCollectionsPatch', 'buildProjectNodesPatch', 'buildProjectRunsPatch',
            'buildProjectGroupsPatch', 'buildProjectGroupAppendPatch', 'buildProjectGroupDeletePatch',
            'buildProjectRunAppendPatch', 'buildProjectBatchJobAppendPatch', 'buildProjectCanvasClearPatch',
            'buildProjectStorageInfoPatch', 'buildProjectStoragePatch', 'buildProjectEdgeAppendPatch',
            'buildProjectEdgeFilterPatch', 'buildProjectTimelineClipEdgeDeletePatch', 'buildProjectViewportPatch',
            'buildProjectSettingsPatch', 'buildProjectSettingsMergePatch', 'buildProjectSchedulerPatch',
            'buildProjectNodeStoragePatch'
        ]);
        expose('asset', 'null', [
            'buildBrowserImageAsset', 'buildBrowserMediaAsset', 'buildImageOutputAsset',
            'buildTimelineRenderAsset', 'buildTimelinePreviewAsset', 'buildTimelineCompareAsset',
            'buildGeneratedMaskAsset', 'buildVideoResponseAsset', 'buildAssetReference', 'buildMaskAsset',
            'buildMaterializedAsset', 'buildAssetMetadataPatch', 'buildMediaTrimAsset', 'buildMediaEditAsset'
        ]);
        expose('specialNodePatch', 'object', [
            'buildSam3SourcePatch', 'buildSam3StatePatch', 'buildDirectorTimelineStatePatch',
            'buildCameraMotionSourcePatch', 'buildCameraMotionParamsPatch', 'buildCameraMotionStatePatch',
            'buildSpecialNodeConnectionPatch', 'buildSpecialNodeStatusPatch',
            'buildPresetSpecialControllerStatePatch', 'buildLivePortraitVideoExpressionStatePatch',
            'buildLtx23GuidesStatePatch', 'buildH3StoryboardStatePatch', 'buildPoseStudioConfirmPatch',
            'buildLivePortraitStatePatch', 'buildLivePortraitConfirmPatch', 'buildPoseStudioStatePatch',
            'buildLivePortraitNodeStatePatch', 'buildGaussianStudioStatePatch', 'buildStyleSelectorStatePatch',
            'buildQwenTtsStatePatch', 'buildGaussianCachePatch', 'buildGaussianConfirmPatch'
        ]);
        expose('agentPatch', 'object', [
            'buildAgentDecisionFormPatch', 'buildAgentCreatedNodePatch', 'buildAgentWorkflowPresetPatch',
            'buildAgentReferencePlaceholderPatch'
        ]);
        expose('vlmChatState', 'object', [
            'buildVlmChatStatePatch', 'buildVlmChatStoragePatch', 'buildVlmChatToolStatePatch'
        ]);

        return api;
    }

    window.SimpAICanvasWorkbenchFactoryContext = Object.assign(
        {},
        window.SimpAICanvasWorkbenchFactoryContext || {},
        { createCanvasWorkbenchFactoryContext }
    );
})();
