(function () {
    'use strict';

    const modules = {
        mediaConnections: window.SimpAICanvasWorkbenchAgentMediaConnections || {},
        imageWorkflows: window.SimpAICanvasWorkbenchImageWorkflows || {},
        videoWorkflows: window.SimpAICanvasWorkbenchVideoWorkflows || {},
        videoTools: window.SimpAICanvasWorkbenchVideoTools || {},
        imageTools: window.SimpAICanvasWorkbenchImageTools || {},
        audioWorkflows: window.SimpAICanvasWorkbenchAudioWorkflows || {},
        audioTools: window.SimpAICanvasWorkbenchAudioTools || {},
        toolDispatch: window.SimpAICanvasWorkbenchToolDispatch || {}
    };

    function createController(module, factoryName, context) {
        const create = module && module[factoryName];
        return typeof create === 'function' ? (create(context) || {}) : {};
    }

    function method(controller, name) {
        return controller && typeof controller[name] === 'function' ? controller[name] : undefined;
    }

    function createCanvasWorkbenchAgentMediaContext(source) {
        const scope = source?.agentMediaSource || source || {};
        const mediaConnections = createController(
            modules.mediaConnections,
            'createCanvasAgentMediaConnectionsController',
            scope.mediaConnectionsSource || {}
        );
        const mediaConnectionsMethod = (name, ...args) => method(mediaConnections, name)?.(...args);
        const imageWorkflow = createController(
            modules.imageWorkflows,
            'createCanvasAgentImageWorkflowController',
            scope.imageWorkflowSource || {}
        );
        const videoWorkflowSource = scope.videoWorkflowSource || {};
        const videoWorkflow = createController(
            modules.videoWorkflows,
            'createCanvasAgentVideoWorkflowController',
            Object.assign({}, videoWorkflowSource, {
                mediaSource: Object.assign({}, videoWorkflowSource.mediaSource || {}, {
                    connectCanvasAgentMediaToGenerator: (...args) => mediaConnectionsMethod('connectCanvasAgentMediaToGenerator', ...args),
                    canvasAgentMediaConnectionError: (...args) => mediaConnectionsMethod('canvasAgentMediaConnectionError', ...args),
                    previewCanvasAgentMediaInputSlot: (...args) => mediaConnectionsMethod('previewCanvasAgentMediaInputSlot', ...args),
                    findCanvasAgentUploadSlotForTarget: (...args) => mediaConnectionsMethod('findCanvasAgentUploadSlotForTarget', ...args)
                })
            })
        );
        const videoToolsSource = scope.videoToolsSource || {};
        const videoTools = createController(
            modules.videoTools,
            'createCanvasAgentVideoToolsController',
            Object.assign({}, videoToolsSource, {
                mediaSource: Object.assign({}, videoToolsSource.mediaSource || {}, {
                    canvasAgentReferenceUploadSlotForGenerator: (...args) => mediaConnectionsMethod('canvasAgentReferenceUploadSlotForGenerator', ...args),
                    createCanvasAgentReferencePlaceholderForGenerator: (...args) => mediaConnectionsMethod('createCanvasAgentReferencePlaceholderForGenerator', ...args),
                    canvasAgentVideoSourceUploadSlot: (...args) => mediaConnectionsMethod('canvasAgentVideoSourceUploadSlot', ...args)
                })
            })
        );
        const videoToolMethod = (name, ...args) => method(videoTools, name)?.(...args);
        const imageToolsSource = scope.imageToolsSource || {};
        const imageTools = createController(
            modules.imageTools,
            'createCanvasAgentImageToolsController',
            Object.assign({}, imageToolsSource, {
                mediaSource: Object.assign({}, imageToolsSource.mediaSource || {}, {
                    connectCanvasAgentImagesToGenerator: (...args) => mediaConnectionsMethod('connectCanvasAgentImagesToGenerator', ...args),
                    createCanvasAgentReferencePlaceholderForGenerator: (...args) => mediaConnectionsMethod('createCanvasAgentReferencePlaceholderForGenerator', ...args)
                }),
                workflowSource: Object.assign({}, imageToolsSource.workflowSource || {}, {
                    runCanvasAgentLivePortraitExpressionQuickTool: (...args) => videoToolMethod('runCanvasAgentLivePortraitExpressionQuickTool', ...args)
                })
            })
        );
        const audioWorkflowSource = scope.audioWorkflowSource || {};
        const audioWorkflow = createController(
            modules.audioWorkflows,
            'createCanvasAgentAudioWorkflowController',
            Object.assign({}, audioWorkflowSource, {
                mediaSource: Object.assign({}, audioWorkflowSource.mediaSource || {}, {
                    previewCanvasAgentMediaInputSlot: (...args) => mediaConnectionsMethod('previewCanvasAgentMediaInputSlot', ...args),
                    findCanvasAgentUploadSlotForTarget: (...args) => mediaConnectionsMethod('findCanvasAgentUploadSlotForTarget', ...args)
                })
            })
        );
        const audioWorkflowMethod = (name, ...args) => method(audioWorkflow, name)?.(...args);
        const videoWorkflowMethod = (name, ...args) => method(videoWorkflow, name)?.(...args);
        const audioToolsSource = scope.audioToolsSource || {};
        const audioTools = createController(
            modules.audioTools,
            'createCanvasAgentAudioToolsController',
            Object.assign({}, audioToolsSource, {
                workflowSource: Object.assign({}, audioToolsSource.workflowSource || {}, {
                    runCanvasAgentAudioEdit: (...args) => audioWorkflowMethod('runCanvasAgentAudioEdit', ...args),
                    runCanvasAgentTextToAudio: (...args) => audioWorkflowMethod('runCanvasAgentTextToAudio', ...args),
                    runCanvasAgentAudioToVideo: (...args) => videoWorkflowMethod('runCanvasAgentAudioToVideo', ...args)
                })
            })
        );
        const imageToolMethod = (name, ...args) => method(imageTools, name)?.(...args);
        const audioToolMethod = (name, ...args) => method(audioTools, name)?.(...args);
        const toolDispatch = createController(
            modules.toolDispatch,
            'createCanvasAgentToolDispatchController',
            Object.assign({}, scope.toolDispatchSource || {}, {
                toolSource: Object.assign({}, scope.toolDispatchSource?.toolSource || {}, {
                    canvasAgentQuickTools: (...args) => imageToolMethod('canvasAgentQuickTools', ...args),
                    canvasAgentVideoQuickTools: (...args) => videoToolMethod('canvasAgentVideoQuickTools', ...args),
                    canvasAgentAudioQuickTools: (...args) => audioToolMethod('canvasAgentAudioQuickTools', ...args),
                    runCanvasAgentQuickTool: (...args) => imageToolMethod('runCanvasAgentQuickTool', ...args),
                    runCanvasAgentVideoQuickTool: (...args) => videoToolMethod('runCanvasAgentVideoQuickTool', ...args),
                    runCanvasAgentAudioQuickTool: (...args) => audioToolMethod('runCanvasAgentAudioQuickTool', ...args)
                })
            })
        );

        return {
            CANVAS_AGENT_MEDIA_CONNECTIONS_CONTROLLER: mediaConnections,
            connectCanvasAgentImagesToGenerator: mediaConnectionsMethod.bind(null, 'connectCanvasAgentImagesToGenerator'),
            connectCanvasAgentMediaToGenerator: mediaConnectionsMethod.bind(null, 'connectCanvasAgentMediaToGenerator'),
            canvasAgentMediaConnectionError: mediaConnectionsMethod.bind(null, 'canvasAgentMediaConnectionError'),
            previewCanvasAgentMediaInputSlot: mediaConnectionsMethod.bind(null, 'previewCanvasAgentMediaInputSlot'),
            canvasAgentUploadSlotsForNode: mediaConnectionsMethod.bind(null, 'canvasAgentUploadSlotsForNode'),
            isCanvasAgentMaskSlot: mediaConnectionsMethod.bind(null, 'isCanvasAgentMaskSlot'),
            canvasAgentMaskUploadSlot: mediaConnectionsMethod.bind(null, 'canvasAgentMaskUploadSlot'),
            canvasAgentVideoMaskUploadSlot: mediaConnectionsMethod.bind(null, 'canvasAgentVideoMaskUploadSlot'),
            canvasAgentVideoSourceUploadSlot: mediaConnectionsMethod.bind(null, 'canvasAgentVideoSourceUploadSlot'),
            canvasAgentReferenceUploadSlotForGenerator: mediaConnectionsMethod.bind(null, 'canvasAgentReferenceUploadSlotForGenerator'),
            createCanvasAgentReferencePlaceholderForGenerator: mediaConnectionsMethod.bind(null, 'createCanvasAgentReferencePlaceholderForGenerator'),
            findCanvasAgentUploadSlotForTarget: mediaConnectionsMethod.bind(null, 'findCanvasAgentUploadSlotForTarget'),
            CANVAS_AGENT_IMAGE_WORKFLOW_CONTROLLER: imageWorkflow,
            CANVAS_AGENT_VIDEO_WORKFLOW_CONTROLLER: videoWorkflow,
            CANVAS_AGENT_VIDEO_TOOLS_CONTROLLER: videoTools,
            CANVAS_AGENT_IMAGE_TOOLS_CONTROLLER: imageTools,
            CANVAS_AGENT_AUDIO_WORKFLOW_CONTROLLER: audioWorkflow,
            CANVAS_AGENT_AUDIO_TOOLS_CONTROLLER: audioTools,
            CANVAS_AGENT_TOOL_DISPATCH_CONTROLLER: toolDispatch
        };
    }

    window.SimpAICanvasWorkbenchAgentMediaContext = Object.assign(
        {},
        window.SimpAICanvasWorkbenchAgentMediaContext || {},
        { createCanvasWorkbenchAgentMediaContext }
    );
})();
