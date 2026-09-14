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
        const textNodeSource = scope.textNodeSource || {};
        const auxNodeSource = scope.auxNodeSource || {};
        const batchAnyNodeSource = scope.batchAnyNodeSource || {};
        const maskNodeSource = scope.maskNodeSource || {};
        const resultNodeSource = scope.resultNodeSource || {};
        const mediaNodeSource = scope.mediaNodeSource || {};
        const inputNodeSource = scope.inputNodeSource || {};
        const uploadNodeSource = scope.uploadNodeSource || {};
        const batchItemSource = scope.batchItemSource || {};
        const configNodeSource = scope.configNodeSource || {};
        const xyzMatrixNodeSource = scope.xyzMatrixNodeSource || {};
        const groupSource = scope.groupSource || {};
        const runRecordSource = scope.runRecordSource || {};
        const batchJobSource = scope.batchJobSource || {};
        const edgeSource = scope.edgeSource || {};
        const projectPatchSource = scope.projectPatchSource || {};
        const assetSource = scope.assetSource || {};
        const specialNodePatchSource = scope.specialNodePatchSource || {};
        const agentPatchSource = scope.agentPatchSource || {};
        const vlmChatStateSource = scope.vlmChatStateSource || {};
        const controllers = {};

        function invoke(controllerKey, methodName, fallbackKind, args) {
            const controller = controllers[controllerKey];
            const method = controller && controller[methodName];
            const fallback = fallbackKind === 'null' ? null : {};
            if (typeof method !== 'function') return fallback;
            return method.apply(controller, args) || fallback;
        }

        const buildAssetReference = (...args) => invoke('asset', 'buildAssetReference', 'null', args);
        const maskNodeFactorySource = Object.assign({}, maskNodeSource, {
            assetSource: Object.assign({}, maskNodeSource.assetSource || {}, { buildAssetReference })
        });

        controllers.textNode = createController(modules.textNode, 'createCanvasTextNodeFactoryController', textNodeSource);
        controllers.auxNode = createController(modules.auxNode, 'createCanvasAuxNodeFactoryController', auxNodeSource);
        controllers.batchAnyNode = createController(modules.batchAnyNode, 'createCanvasBatchAnyNodeFactoryController', batchAnyNodeSource);
        controllers.maskNode = createController(
            modules.maskNode,
            'createCanvasMaskNodeFactoryController',
            maskNodeFactorySource
        );
        controllers.resultNode = createController(modules.resultNode, 'createCanvasResultNodeFactoryController', resultNodeSource);
        controllers.mediaNode = createController(modules.mediaNode, 'createCanvasMediaNodeFactoryController', mediaNodeSource);
        controllers.inputNode = createController(modules.inputNode, 'createCanvasInputNodeFactoryController', inputNodeSource);
        controllers.uploadNode = createController(modules.uploadNode, 'createCanvasUploadNodeFactoryController', uploadNodeSource);
        controllers.batchItem = createController(modules.batchItem, 'createCanvasBatchItemFactoryController', batchItemSource);
        controllers.configNode = createController(modules.configNode, 'createCanvasConfigNodeFactoryController', configNodeSource);
        controllers.xyzMatrixNode = createController(modules.xyzMatrixNode, 'createCanvasXyzMatrixNodeFactoryController', xyzMatrixNodeSource);
        controllers.group = createController(modules.group, 'createCanvasGroupFactoryController', groupSource);
        controllers.runRecord = createController(modules.runRecord, 'createCanvasRunRecordFactoryController', runRecordSource);
        controllers.batchJob = createController(modules.batchJob, 'createCanvasBatchJobFactoryController', batchJobSource);
        controllers.edge = createController(modules.edge, 'createCanvasEdgeFactoryController', edgeSource);
        controllers.projectPatch = createController(modules.projectPatch, 'createCanvasProjectPatchFactoryController', projectPatchSource);
        controllers.asset = createController(modules.asset, 'createCanvasAssetFactoryController', assetSource);
        const specialNodePatchFactorySource = Object.assign({}, specialNodePatchSource, {
            assetSource: Object.assign({}, specialNodePatchSource.assetSource || {}, { buildAssetReference })
        });
        controllers.specialNodePatch = createController(
            modules.specialNodePatch,
            'createCanvasSpecialNodePatchFactoryController',
            specialNodePatchFactorySource
        );
        controllers.agentPatch = createController(modules.agentPatch, 'createCanvasAgentPatchFactoryController', agentPatchSource);
        controllers.vlmChatState = createController(modules.vlmChatState, 'createCanvasVlmChatStateFactoryController', vlmChatStateSource);

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
