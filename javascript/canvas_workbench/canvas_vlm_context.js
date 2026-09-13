(function () {
    'use strict';

    const modules = {
        nodeView: window.SimpAICanvasWorkbenchNodeViewContext || {},
        vlmChat: window.SimpAICanvasWorkbenchVlmChatContext || {},
        vlmChatImagePreview: window.SimpAICanvasWorkbenchVlmChatImagePreview || {},
        vlmChatInput: window.SimpAICanvasWorkbenchVlmChatInput || {},
        nodeInteraction: window.SimpAICanvasWorkbenchNodeInteractionContext || {}
    };

    function createController(module, factoryName, context) {
        const create = module && module[factoryName];
        return typeof create === 'function' ? (create(context || {}) || {}) : {};
    }

    function method(controller, name) {
        return controller && typeof controller[name] === 'function' ? controller[name] : undefined;
    }

    function delegatedValue(controller, name, fallback, args) {
        const value = method(controller, name)?.(...args);
        return value === undefined ? fallback?.(...args) : value;
    }

    function createCanvasWorkbenchVlmContext(source) {
        const scope = source?.vlmSource || source || {};
        let vlmChatContext = {};

        const nodeViewSource = Object.assign({}, scope.nodeViewSource || {});
        const vlmNodeSource = Object.assign({}, nodeViewSource.vlmNodeSource || {});
        const vlmNodeViewSource = Object.assign({}, nodeViewSource.vlmNodeViewSource || {});
        const vlmNodeViewRenderSource = Object.assign({}, vlmNodeViewSource.renderSource || {});
        const sourceBudgetMax = vlmNodeSource.vlmChatContextBudgetMax;
        const sourceClampBudget = vlmNodeSource.clampVlmChatContextBudget;
        const sourceRenderChatLog = vlmNodeViewRenderSource.renderVlmChatLog;
        const chatController = () => vlmChatContext.CANVAS_VLM_CHAT_CONTROLLER || {};

        vlmNodeSource.vlmChatContextBudgetMax = (...args) => delegatedValue(
            chatController(),
            'vlmChatContextBudgetMax',
            sourceBudgetMax,
            args
        );
        vlmNodeSource.clampVlmChatContextBudget = (...args) => delegatedValue(
            chatController(),
            'clampVlmChatContextBudget',
            sourceClampBudget,
            args
        );
        vlmNodeViewRenderSource.renderVlmChatLog = (...args) => delegatedValue(
            chatController(),
            'renderVlmChatLog',
            sourceRenderChatLog,
            args
        ) || '';
        vlmNodeViewSource.renderSource = vlmNodeViewRenderSource;
        nodeViewSource.vlmNodeSource = vlmNodeSource;
        nodeViewSource.vlmNodeViewSource = vlmNodeViewSource;

        const nodeViewContext = createController(
            modules.nodeView,
            'createCanvasWorkbenchNodeViewContext',
            nodeViewSource
        );
        const nodeController = () => nodeViewContext.CANVAS_VLM_NODE_CONTROLLER || {};
        const vlmChatSource = Object.assign({}, scope.vlmChatSource || {});
        const vlmChatControllerSource = Object.assign({}, vlmChatSource.controllerSource || {});
        const customApiSource = Object.assign({}, vlmChatControllerSource.customApiSource || {});
        const sourceGetCustomKeyValue = customApiSource.getVlmCustomKeyValue;
        const sourceSetCustomKeyValue = customApiSource.setVlmCustomKeyValue;
        customApiSource.getVlmCustomKeyValue = (...args) => delegatedValue(
            nodeController(),
            'getVlmCustomKeyValue',
            sourceGetCustomKeyValue,
            args
        ) || '';
        customApiSource.setVlmCustomKeyValue = (...args) => delegatedValue(
            nodeController(),
            'setVlmCustomKeyValue',
            sourceSetCustomKeyValue,
            args
        );
        vlmChatControllerSource.customApiSource = customApiSource;
        vlmChatSource.controllerSource = vlmChatControllerSource;

        vlmChatContext = createController(
            modules.vlmChat,
            'createCanvasWorkbenchVlmChatContext',
            vlmChatSource
        );
        const vlmChatImagePreview = createController(
            modules.vlmChatImagePreview,
            'createCanvasVlmChatImagePreviewController',
            scope.vlmChatImagePreviewSource || {}
        );
        const vlmChatInputSource = scope.vlmChatInputSource || {};
        const vlmChatInput = createController(
            modules.vlmChatInput,
            'createCanvasVlmChatInputController',
            Object.assign({}, vlmChatInputSource, {
                addVlmPendingImageFromFile: (...args) => delegatedValue(
                    chatController(),
                    'addVlmPendingImageFromFile',
                    vlmChatInputSource.addVlmPendingImageFromFile,
                    args
                ) || false,
                removeVlmPendingImage: (...args) => delegatedValue(
                    chatController(),
                    'removeVlmPendingImage',
                    vlmChatInputSource.removeVlmPendingImage,
                    args
                )
            })
        );
        const nodeInteractionContext = createController(
            modules.nodeInteraction,
            'createCanvasWorkbenchNodeInteractionContext',
            scope.nodeInteractionSource || {}
        );
        const vlmChatImagePreviewMethod = name => method(vlmChatImagePreview, name);
        const vlmChatInputMethod = name => method(vlmChatInput, name);

        return {
            CANVAS_NODE_VIEW_CONTEXT: nodeViewContext,
            CANVAS_VLM_CHAT_CONTEXT: vlmChatContext,
            CANVAS_NODE_INTERACTION_CONTEXT: nodeInteractionContext,
            CANVAS_TEXT_NODE_RENDERER: nodeViewContext.CANVAS_TEXT_NODE_RENDERER || {},
            CANVAS_VLM_NODE_CONTROLLER: nodeViewContext.CANVAS_VLM_NODE_CONTROLLER || {},
            CANVAS_VLM_NODE_VIEW_CONTROLLER: nodeViewContext.CANVAS_VLM_NODE_VIEW_CONTROLLER || {},
            CANVAS_VLM_AGENT_CONTEXT: vlmChatContext.CANVAS_VLM_AGENT_CONTEXT || {},
            CANVAS_VLM_CHAT_CONTROLLER: vlmChatContext.CANVAS_VLM_CHAT_CONTROLLER || {},
            CANVAS_VLM_CHAT_IMAGE_PREVIEW_CONTROLLER: vlmChatImagePreview,
            vlmChatImagePreviewSizeFromDimensions: vlmChatImagePreviewMethod('sizeFromDimensions'),
            ensureVlmChatImagePreview: vlmChatImagePreviewMethod('ensureVlmChatImagePreview'),
            vlmChatImagePreviewSize: vlmChatImagePreviewMethod('sizeForTarget'),
            breakableVlmChatPreviewName: vlmChatImagePreviewMethod('breakablePreviewName'),
            positionVlmChatImagePreview: vlmChatImagePreviewMethod('positionVlmChatImagePreview'),
            showVlmChatImagePreview: vlmChatImagePreviewMethod('showVlmChatImagePreview'),
            hideVlmChatImagePreview: vlmChatImagePreviewMethod('hideVlmChatImagePreview'),
            onVlmChatImagePreviewPointerOver: vlmChatImagePreviewMethod('onVlmChatImagePreviewPointerOver'),
            onVlmChatImagePreviewPointerMove: vlmChatImagePreviewMethod('onVlmChatImagePreviewPointerMove'),
            onVlmChatImagePreviewPointerOut: vlmChatImagePreviewMethod('onVlmChatImagePreviewPointerOut'),
            CANVAS_VLM_CHAT_INPUT_CONTROLLER: vlmChatInput,
            attachVlmImages: vlmChatInputMethod('attachVlmImages'),
            insertVlmChatCommand: vlmChatInputMethod('insertVlmChatCommand'),
            runVlmRegenCommand: vlmChatInputMethod('runVlmRegenCommand'),
            handleVlmChatDrop: vlmChatInputMethod('handleVlmChatDrop'),
            handleVlmChatInputClick: vlmChatInputMethod('handleVlmChatInputClick'),
            handleVlmChatInputKeyDown: vlmChatInputMethod('handleVlmChatInputKeyDown'),
            bindVlmChatDropEvents: vlmChatInputMethod('bindVlmChatDropEvents'),
            focusVlmChatPromptInput: vlmChatInputMethod('focusVlmChatPromptInput'),
            CANVAS_NODE_PARAM_CONTROLLER: nodeInteractionContext.CANVAS_NODE_PARAM_CONTROLLER || {},
            CANVAS_INSPECTOR_CONTROLLER: nodeInteractionContext.CANVAS_INSPECTOR_CONTROLLER || {}
        };
    }

    window.SimpAICanvasWorkbenchVlmContext = Object.assign(
        {},
        window.SimpAICanvasWorkbenchVlmContext || {},
        { createCanvasWorkbenchVlmContext }
    );
})();
