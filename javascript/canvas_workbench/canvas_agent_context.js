(function () {
    'use strict';

    const modules = {
        references: window.SimpAICanvasWorkbenchCanvasAgentReferences || {},
        decision: window.SimpAICanvasWorkbenchCanvasAgentDecision || {},
        promptRewrite: window.SimpAICanvasWorkbenchCanvasAgentPromptRewrite || {},
        promptResolver: window.SimpAICanvasWorkbenchAgentPromptResolver || {},
        textWorkflows: window.SimpAICanvasWorkbenchTextWorkflows || {},
        textNodes: window.SimpAICanvasWorkbenchTextNodes || {}
    };

    function createController(module, factoryName, context) {
        const create = module && module[factoryName];
        return typeof create === 'function' ? (create(context) || {}) : {};
    }

    function method(controller, name) {
        return controller && typeof controller[name] === 'function' ? controller[name] : undefined;
    }

    function createCanvasWorkbenchAgentContext(source) {
        const scope = source?.agentSource || source || {};
        let promptRewrite = {};
        let textNodes = {};
        const promptRewriteMethod = (name, ...args) => method(promptRewrite, name)?.(...args);
        const textNodesMethod = (name, ...args) => method(textNodes, name)?.(...args);

        const references = createController(
            modules.references,
            'createCanvasAgentReferencesController',
            {
                t: scope.t,
                uid: scope.uid,
                getAgentState: scope.getAgentState,
                getNode: scope.getNode,
                getCanvasAgentReferenceAsset: scope.getCanvasAgentReferenceAsset,
                getCanvasAgentReferenceKind: scope.getCanvasAgentReferenceKind,
                canvasAgentShortNodeLabel: scope.canvasAgentShortNodeLabel,
                getNodeTextOutput: scope.getNodeTextOutput,
                assetDisplaySrc: scope.assetDisplaySrc,
                isCanvasAgentMediaReferenceTarget: scope.isCanvasAgentMediaReferenceTarget,
                getCanvasAgentTargetMediaKind: scope.getCanvasAgentTargetMediaKind,
                getSelectedNodeIdList: scope.getSelectedNodeIdList,
                getCanvasAgentTargetNode: scope.getCanvasAgentTargetNode,
                setCanvasAgentMessage: scope.setCanvasAgentMessage,
                showToast: scope.showToast,
                renderCanvasAgentPanel: scope.renderCanvasAgentPanel,
                getMaxImageReferences: scope.getMaxImageReferences,
                getMaxExtraImageReferences: scope.getMaxExtraImageReferences,
                getMaxVideoReferences: scope.getMaxVideoReferences,
                getMaxAudioReferences: scope.getMaxAudioReferences,
                getMaxTextReferences: scope.getMaxTextReferences
            }
        );
        const referencesMethod = (name, ...args) => method(references, name)?.(...args);

        const decision = createController(
            modules.decision,
            'createCanvasAgentDecisionController',
            {
                t: scope.t,
                normalizePresetName: scope.normalizePresetName,
                getPresetCatalog: scope.getPresetCatalog,
                getReadyPresetEntries: scope.getReadyPresetEntries,
                createCanvasAgentPresetProbeNode: scope.createCanvasAgentPresetProbeNode,
                canvasAgentUploadSlotsForNode: scope.canvasAgentUploadSlotsForNode,
                getUploadSlotMediaKind: scope.getUploadSlotMediaKind,
                isCanvasAgentMaskSlot: scope.isCanvasAgentMaskSlot,
                getCanvasAgentSettings: scope.getCanvasAgentSettings,
                canvasAgentPresetQueueConfig: scope.canvasAgentPresetQueueConfig,
                getCanvasAgentPresetQueue: scope.getCanvasAgentPresetQueue,
                findCanvasAgentPresetEntryByAlias: scope.findCanvasAgentPresetEntryByAlias,
                findCanvasAgentPresetInstructionOverride: scope.findCanvasAgentPresetInstructionOverride,
                findPresetCatalogEntryByName: scope.findPresetCatalogEntryByName,
                getCanvasAgentPresetStatus: scope.getCanvasAgentPresetStatus,
                canvasAgentPresetPromptDefaults: scope.canvasAgentPresetPromptDefaults,
                promptPreflight: scope.promptPreflight,
                canvasAgentPromptValidationFact: scope.canvasAgentPromptValidationFact,
                wildcardPreviewFacts: scope.wildcardPreviewFacts,
                askCanvasAgentDecision: scope.askCanvasAgentDecision,
                canvasAgentPromptTargetFact: scope.canvasAgentPromptTargetFact,
                rewriteCanvasAgentPromptWithLlm: (...args) => promptRewriteMethod('rewriteCanvasAgentPromptWithLlm', ...args)
            }
        );
        const decisionMethod = (name, ...args) => method(decision, name)?.(...args);

        promptRewrite = createController(
            modules.promptRewrite,
            'createCanvasAgentPromptRewriteController',
            {
                t: scope.t,
                uid: scope.uid,
                normalizePresetName: scope.normalizePresetName,
                getPromptRewriteTimeoutMs: scope.getPromptRewriteTimeoutMs,
                getDefaultProjectId: scope.getDefaultProjectId,
                getProject: scope.getProject,
                getCanvasAgentSettings: scope.getCanvasAgentSettings,
                getCanvasAgentRewriteModel: scope.getCanvasAgentRewriteModel,
                getCanvasAgentVlmReferenceSources: scope.getCanvasAgentVlmReferenceSources,
                canvasAgentReferenceSummaryText: scope.canvasAgentReferenceSummaryText,
                runtimeUiLang: scope.runtimeUiLang,
                getCanvasAgentTargetNode: scope.getCanvasAgentTargetNode,
                isCanvasAgentImageTarget: scope.isCanvasAgentImageTarget,
                canvasAgentPromptTargetFromPurpose: scope.canvasAgentPromptTargetFromPurpose,
                canvasAgentPromptDefaultsForPurpose: scope.canvasAgentPromptDefaultsForPurpose,
                canvasAgentPromptTargetNeedsDanbooru: scope.canvasAgentPromptTargetNeedsDanbooru,
                canvasAgentDanbooruLookupText: scope.canvasAgentDanbooruLookupText,
                canvasAgentPromptTargetContextLine: scope.canvasAgentPromptTargetContextLine,
                canvasAgentPromptTargetInstruction: scope.canvasAgentPromptTargetInstruction,
                canvasAgentVlmAgentContextPayload: scope.canvasAgentVlmAgentContextPayload,
                sendCanvasVlmRunRequest: scope.sendCanvasVlmRunRequest,
                getCanvasAgentCustomRuntimeParams: scope.getCanvasAgentCustomRuntimeParams,
                canvasAgentDanbooruFallbackPrompt: scope.canvasAgentDanbooruFallbackPrompt
            }
        );

        const promptResolver = createController(
            modules.promptResolver,
            'createCanvasAgentPromptResolverController',
            {
                t: scope.t,
                uid: scope.uid,
                getCanvasAgentSettings: scope.getCanvasAgentSettings,
                canvasAgentPromptTargetFromPurpose: scope.canvasAgentPromptTargetFromPurpose,
                canvasAgentPromptDefaultsForPurpose: scope.canvasAgentPromptDefaultsForPurpose,
                askCanvasAgentDecision: scope.askCanvasAgentDecision,
                canvasAgentPromptPreflight: decisionMethod.bind(null, 'canvasAgentPromptPreflight'),
                canvasAgentPromptPreflightFacts: decisionMethod.bind(null, 'canvasAgentPromptPreflightFacts'),
                canvasAgentPromptTargetFact: scope.canvasAgentPromptTargetFact,
                canvasAgentPromptValidationFact: scope.canvasAgentPromptValidationFact,
                getCanvasAgentRewriteModel: scope.getCanvasAgentRewriteModel,
                setCanvasAgentRunInfo: scope.setCanvasAgentRunInfo,
                setCanvasAgentMessage: scope.setCanvasAgentMessage,
                rewriteCanvasAgentPromptWithLlm: (...args) => promptRewriteMethod('rewriteCanvasAgentPromptWithLlm', ...args),
                resetCanvasAgentRunInfo: scope.resetCanvasAgentRunInfo
            }
        );
        const promptResolverMethod = (name, ...args) => method(promptResolver, name)?.(...args);

        const textWorkflows = createController(
            modules.textWorkflows,
            'createCanvasAgentTextWorkflowController',
            {
                t: scope.t,
                uid: scope.uid,
                getCanvasAgentTargetNode: scope.getCanvasAgentTargetNode,
                isCanvasAgentTextTarget: scope.isCanvasAgentTextTarget,
                getTextNodeInputSource: (...args) => textNodesMethod('getTextNodeInputSource', ...args),
                getNodeTextOutput: (...args) => textNodesMethod('getNodeTextOutput', ...args),
                getCanvasAgentRewriteModel: scope.getCanvasAgentRewriteModel,
                setCanvasAgentRunInfo: scope.setCanvasAgentRunInfo,
                resetCanvasAgentRunInfo: scope.resetCanvasAgentRunInfo,
                setCanvasAgentMessage: scope.setCanvasAgentMessage,
                showToast: scope.showToast,
                waitNextFrame: scope.waitNextFrame,
                rewriteCanvasAgentPromptWithLlm: (...args) => promptRewriteMethod('rewriteCanvasAgentPromptWithLlm', ...args),
                askCanvasAgentDecision: scope.askCanvasAgentDecision,
                updateTextNodeValue: scope.updateTextNodeValue,
                setCanvasAgentInput: scope.setCanvasAgentInput,
                mutate: scope.mutate
            }
        );
        const textWorkflowsMethod = (name, ...args) => method(textWorkflows, name)?.(...args);

        textNodes = createController(
            modules.textNodes,
            'createCanvasAgentTextNodesController',
            {
                getProject: scope.getProject,
                getNode: scope.getNode,
                buildTextMergeStatePatch: scope.buildTextMergeStatePatch,
                batchAnyMediaKind: scope.batchAnyMediaKind,
                batchAnyCurrentItem: scope.batchAnyCurrentItem,
                batchAnyTextFromItem: scope.batchAnyTextFromItem,
                isDirectorTimelineNode: scope.isDirectorTimelineNode,
                directorTimelinePayload: scope.directorTimelinePayload,
                getStyleSelectorPrompt: scope.getStyleSelectorPrompt
            }
        );

        return {
            CANVAS_AGENT_REFERENCES_CONTROLLER: references,
            canvasAgentReferenceIcon: referencesMethod.bind(null, 'canvasAgentReferenceIcon'),
            canvasAgentReferenceKey: referencesMethod.bind(null, 'canvasAgentReferenceKey'),
            normalizeCanvasAgentReferences: referencesMethod.bind(null, 'normalizeCanvasAgentReferences'),
            canvasAgentReferenceCounts: referencesMethod.bind(null, 'canvasAgentReferenceCounts'),
            createCanvasAgentReferenceFromNode: referencesMethod.bind(null, 'createCanvasAgentReferenceFromNode'),
            addCanvasAgentReferenceFromNode: referencesMethod.bind(null, 'addCanvasAgentReferenceFromNode'),
            addSelectedCanvasAgentReferences: referencesMethod.bind(null, 'addSelectedCanvasAgentReferences'),
            removeCanvasAgentReference: referencesMethod.bind(null, 'removeCanvasAgentReference'),
            promoteCanvasAgentReference: referencesMethod.bind(null, 'promoteCanvasAgentReference'),
            canvasAgentReferenceNode: referencesMethod.bind(null, 'canvasAgentReferenceNode'),
            getCanvasAgentPrimaryImageReference: referencesMethod.bind(null, 'getCanvasAgentPrimaryImageReference'),
            getCanvasAgentPrimaryReferenceByKind: referencesMethod.bind(null, 'getCanvasAgentPrimaryReferenceByKind'),
            getCanvasAgentPrimaryMediaNode: referencesMethod.bind(null, 'getCanvasAgentPrimaryMediaNode'),
            getCanvasAgentExtraImageReferences: referencesMethod.bind(null, 'getCanvasAgentExtraImageReferences'),
            canvasAgentMediaReferenceLimit: referencesMethod.bind(null, 'canvasAgentMediaReferenceLimit'),
            getCanvasAgentMediaReferenceNodes: referencesMethod.bind(null, 'getCanvasAgentMediaReferenceNodes'),
            canvasAgentMediaNodeCounts: referencesMethod.bind(null, 'canvasAgentMediaNodeCounts'),
            canvasAgentVideoTaskForMedia: referencesMethod.bind(null, 'canvasAgentVideoTaskForMedia'),
            canvasAgentVideoTaskLabel: referencesMethod.bind(null, 'canvasAgentVideoTaskLabel'),
            canvasAgentMediaNodeFacts: referencesMethod.bind(null, 'canvasAgentMediaNodeFacts'),
            CANVAS_AGENT_DECISION_CONTROLLER: decision,
            canvasAgentPresetDecisionOptions: decisionMethod.bind(null, 'canvasAgentPresetDecisionOptions'),
            canvasAgentPresetImageCapacity: decisionMethod.bind(null, 'canvasAgentPresetImageCapacity'),
            canvasAgentPresetMediaCapacity: decisionMethod.bind(null, 'canvasAgentPresetMediaCapacity'),
            canvasAgentPresetSupportsTask: decisionMethod.bind(null, 'canvasAgentPresetSupportsTask'),
            canvasAgentRequestedMediaCounts: decisionMethod.bind(null, 'canvasAgentRequestedMediaCounts'),
            canvasAgentPresetSupportsMediaRequest: decisionMethod.bind(null, 'canvasAgentPresetSupportsMediaRequest'),
            canvasAgentPresetMediaCapacityMessage: decisionMethod.bind(null, 'canvasAgentPresetMediaCapacityMessage'),
            chooseCanvasAgentPresetEntry: decisionMethod.bind(null, 'chooseCanvasAgentPresetEntry'),
            canvasAgentPromptPreflight: decisionMethod.bind(null, 'canvasAgentPromptPreflight'),
            canvasAgentPromptPreflightFacts: decisionMethod.bind(null, 'canvasAgentPromptPreflightFacts'),
            ensureCanvasAgentPromptPreflightAllows: decisionMethod.bind(null, 'ensureCanvasAgentPromptPreflightAllows'),
            canvasAgentPromptDecisionField: decisionMethod.bind(null, 'canvasAgentPromptDecisionField'),
            canvasAgentPromptFromDecision: decisionMethod.bind(null, 'canvasAgentPromptFromDecision'),
            CANVAS_AGENT_PROMPT_RESOLVER_CONTROLLER: promptResolver,
            resolveCanvasAgentPrompt: promptResolverMethod.bind(null, 'resolveCanvasAgentPrompt'),
            CANVAS_AGENT_PROMPT_REWRITE_CONTROLLER: promptRewrite,
            rewriteCanvasAgentPromptWithLlm: promptRewriteMethod.bind(null, 'rewriteCanvasAgentPromptWithLlm'),
            canvasAgentComparablePromptText: promptRewriteMethod.bind(null, 'canvasAgentComparablePromptText'),
            canvasAgentPromptRewriteTooWeak: promptRewriteMethod.bind(null, 'canvasAgentPromptRewriteTooWeak'),
            canvasAgentLocalPromptRewriteFallback: promptRewriteMethod.bind(null, 'canvasAgentLocalPromptRewriteFallback'),
            CANVAS_AGENT_TEXT_WORKFLOW_CONTROLLER: textWorkflows,
            runCanvasAgentTextRefine: textWorkflowsMethod.bind(null, 'runCanvasAgentTextRefine'),
            CANVAS_AGENT_TEXT_NODE_CONTROLLER: textNodes,
            isTextOutputNode: textNodesMethod.bind(null, 'isTextOutputNode'),
            getNodeTextOutput: textNodesMethod.bind(null, 'getNodeTextOutput'),
            getTextNodeInputSource: textNodesMethod.bind(null, 'getTextNodeInputSource'),
            getPromptTextSourceNode: textNodesMethod.bind(null, 'getPromptTextSourceNode'),
            wildcardHelperBuildTag: textNodesMethod.bind(null, 'wildcardHelperBuildTag'),
            textMergeInputSlots: textNodesMethod.bind(null, 'textMergeInputSlots'),
            getTextMergeInputSource: textNodesMethod.bind(null, 'getTextMergeInputSource'),
            decodeTextMergeSeparator: textNodesMethod.bind(null, 'decodeTextMergeSeparator'),
            getTextMergeOutput: textNodesMethod.bind(null, 'getTextMergeOutput'),
            wouldCreateTextCycle: textNodesMethod.bind(null, 'wouldCreateTextCycle')
        };
    }

    window.SimpAICanvasWorkbenchAgentContext = Object.assign({}, window.SimpAICanvasWorkbenchAgentContext || {}, {
        createCanvasWorkbenchAgentContext
    });
})();
