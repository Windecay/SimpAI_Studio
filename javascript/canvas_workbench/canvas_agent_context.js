(function () {
    'use strict';

    const modules = {
        references: window.SimpAICanvasWorkbenchCanvasAgentReferences || {},
        decision: window.SimpAICanvasWorkbenchCanvasAgentDecision || {},
        generation: window.SimpAICanvasWorkbenchCanvasAgentGeneration || {},
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

    function canvasAgentRunNodeSelection(uiSource, node) {
        if (!node) return;
        if (typeof uiSource.dockCanvasAgentPanelBottomLeft === 'function') {
            uiSource.dockCanvasAgentPanelBottomLeft({ render: false });
        }
        if (typeof uiSource.setCanvasAgentSelection === 'function') {
            uiSource.setCanvasAgentSelection(node.id, [node.id]);
        }
        if (typeof uiSource.mutate === 'function') uiSource.mutate({ inspector: true });
    }

    function prepareVlmAgentImageActionStart(uiSource, prompt) {
        const settings = typeof uiSource?.getCanvasAgentSettings === 'function'
            ? (uiSource.getCanvasAgentSettings() || {})
            : {};
        if (!settings.enabled && typeof uiSource?.setCanvasAgentSettingsPatch === 'function') {
            uiSource.setCanvasAgentSettingsPatch({ enabled: true }, { silentHistory: true });
        }
        const state = typeof uiSource?.getAgentState === 'function' ? (uiSource.getAgentState() || {}) : {};
        state.input = prompt;
        const t = uiSource?.t || ((en, cn) => cn || en);
        state.lastMessage = t(
            'VLM Chat confirmed a tool call. Starting with the prepared prompt...',
            'VLM Chat 已确认工具调用，正在使用准备好的提示词启动...'
        );
        if (typeof uiSource?.renderCanvasAgentPanel === 'function') uiSource.renderCanvasAgentPanel();
    }

    function createCanvasWorkbenchAgentContext(source) {
        const scope = source?.agentSource || source || {};
        const generationSource = scope.generationSource || {};
        const referencesSource = scope.referencesSource || {};
        const decisionSource = scope.decisionSource || {};
        const promptRewriteSource = scope.promptRewriteSource || {};
        const promptResolverSource = scope.promptResolverSource || {};
        const textWorkflowsSource = scope.textWorkflowsSource || {};
        const textNodesSource = scope.textNodesSource || {};
        const uiSource = scope.uiSource || {};
        const generation = createController(
            modules.generation,
            'createCanvasAgentGenerationController',
            generationSource
        );
        const generationMethod = (name, ...args) => method(generation, name)?.(...args);
        let promptRewrite = {};
        let textNodes = {};
        const promptRewriteMethod = (name, ...args) => method(promptRewrite, name)?.(...args);
        const textNodesMethod = (name, ...args) => method(textNodes, name)?.(...args);

        const references = createController(
            modules.references,
            'createCanvasAgentReferencesController',
            referencesSource
        );
        const referencesMethod = (name, ...args) => method(references, name)?.(...args);

        const decision = createController(
            modules.decision,
            'createCanvasAgentDecisionController',
            Object.assign({}, decisionSource, {
                rewriteSource: Object.assign({}, decisionSource.rewriteSource || {}, {
                    rewriteCanvasAgentPromptWithLlm: (...args) => promptRewriteMethod('rewriteCanvasAgentPromptWithLlm', ...args)
                })
            })
        );
        const decisionMethod = (name, ...args) => method(decision, name)?.(...args);

        promptRewrite = createController(
            modules.promptRewrite,
            'createCanvasAgentPromptRewriteController',
            Object.assign({}, promptRewriteSource, {
                referenceSource: Object.assign({}, promptRewriteSource.referenceSource || {}, {
                    getCanvasAgentVlmReferenceSources: (...args) => referencesMethod('getCanvasAgentVlmReferenceSources', ...args),
                    canvasAgentReferenceSummaryText: (...args) => referencesMethod('canvasAgentReferenceSummaryText', ...args)
                })
            })
        );

        const promptResolver = createController(
            modules.promptResolver,
            'createCanvasAgentPromptResolverController',
            Object.assign({}, promptResolverSource, {
                promptSource: Object.assign({}, promptResolverSource.promptSource || {}, {
                    canvasAgentPromptPreflight: decisionMethod.bind(null, 'canvasAgentPromptPreflight'),
                    canvasAgentPromptPreflightFacts: decisionMethod.bind(null, 'canvasAgentPromptPreflightFacts')
                }),
                rewriteSource: Object.assign({}, promptResolverSource.rewriteSource || {}, {
                    rewriteCanvasAgentPromptWithLlm: (...args) => promptRewriteMethod('rewriteCanvasAgentPromptWithLlm', ...args)
                })
            })
        );
        const promptResolverMethod = (name, ...args) => method(promptResolver, name)?.(...args);

        const textWorkflows = createController(
            modules.textWorkflows,
            'createCanvasAgentTextWorkflowController',
            Object.assign({}, textWorkflowsSource, {
                nodeSource: Object.assign({}, textWorkflowsSource.nodeSource || {}, {
                    getTextNodeInputSource: (...args) => textNodesMethod('getTextNodeInputSource', ...args),
                    getNodeTextOutput: (...args) => textNodesMethod('getNodeTextOutput', ...args)
                }),
                rewriteSource: Object.assign({}, textWorkflowsSource.rewriteSource || {}, {
                    rewriteCanvasAgentPromptWithLlm: (...args) => promptRewriteMethod('rewriteCanvasAgentPromptWithLlm', ...args)
                })
            })
        );
        const textWorkflowsMethod = (name, ...args) => method(textWorkflows, name)?.(...args);

        textNodes = createController(
            modules.textNodes,
            'createCanvasAgentTextNodesController',
            textNodesSource
        );

        return {
            CANVAS_AGENT_GENERATION_CONTROLLER: generation,
            canvasAgentRunNodeSelection: node => canvasAgentRunNodeSelection(uiSource, node),
            prepareVlmAgentImageActionStart: prompt => prepareVlmAgentImageActionStart(uiSource, prompt),
            canvasAgentUserExplicitNegativePrompt: generationMethod.bind(null, 'canvasAgentUserExplicitNegativePrompt'),
            normalizeCanvasAgentAspect: generationMethod.bind(null, 'normalizeCanvasAgentAspect'),
            extractCanvasAgentAspectFromText: generationMethod.bind(null, 'extractCanvasAgentAspectFromText'),
            stripCanvasAgentInlineGenerationParams: generationMethod.bind(null, 'stripCanvasAgentInlineGenerationParams'),
            normalizeCanvasAgentGenerationOptions: generationMethod.bind(null, 'normalizeCanvasAgentGenerationOptions'),
            canvasAgentResolutionLabel: generationMethod.bind(null, 'canvasAgentResolutionLabel'),
            canvasAgentResolutionCompactLabel: generationMethod.bind(null, 'canvasAgentResolutionCompactLabel'),
            canvasAgentModelStatusLabel: generationMethod.bind(null, 'canvasAgentModelStatusLabel'),
            applyCanvasAgentPromptToGenerator: generationMethod.bind(null, 'applyCanvasAgentPromptToGenerator'),
            applyCanvasAgentPresetDefaultsToGenerator: generationMethod.bind(null, 'applyCanvasAgentPresetDefaultsToGenerator'),
            clonePresetWithPromptDefaults: generationMethod.bind(null, 'clonePresetWithPromptDefaults'),
            presetGenerationStepValue: generationMethod.bind(null, 'presetGenerationStepValue'),
            presetGenerationImageNumberValue: generationMethod.bind(null, 'presetGenerationImageNumberValue'),
            applyCanvasAgentGenerationOptionsToGenerator: generationMethod.bind(null, 'applyCanvasAgentGenerationOptionsToGenerator'),
            prepareCanvasAgentGenerator: generationMethod.bind(null, 'prepareCanvasAgentGenerator'),
            applyCanvasAgentResolutionToGenerator: generationMethod.bind(null, 'applyCanvasAgentResolutionToGenerator'),
            previewCanvasAgentEditInputSlot: generationMethod.bind(null, 'previewCanvasAgentEditInputSlot'),
            CANVAS_AGENT_REFERENCES_CONTROLLER: references,
            canvasAgentReferenceIcon: referencesMethod.bind(null, 'canvasAgentReferenceIcon'),
            canvasAgentReferenceKey: referencesMethod.bind(null, 'canvasAgentReferenceKey'),
            getCanvasAgentVlmReferenceSources: referencesMethod.bind(null, 'getCanvasAgentVlmReferenceSources'),
            canvasAgentReferenceSummaryText: referencesMethod.bind(null, 'canvasAgentReferenceSummaryText'),
            canvasAgentReferenceFacts: referencesMethod.bind(null, 'canvasAgentReferenceFacts'),
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
            canvasAgentDanbooruFallbackRewrite: promptRewriteMethod.bind(null, 'canvasAgentDanbooruFallbackRewrite'),
            ensureCanvasAgentPromptMatchesTarget: promptRewriteMethod.bind(null, 'ensureCanvasAgentPromptMatchesTarget'),
            canvasAgentDanbooruLookupText: promptRewriteMethod.bind(null, 'canvasAgentDanbooruLookupText'),
            maybeShowCanvasDanbooruRuntimeNotice: promptRewriteMethod.bind(null, 'maybeShowCanvasDanbooruRuntimeNotice'),
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
