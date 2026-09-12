(function () {
    'use strict';

    const modules = {
        vlmChat: window.SimpAICanvasWorkbenchVlmChat || {}
    };

    function createController(module, factoryName, context) {
        const create = module && module[factoryName];
        return typeof create === 'function' ? (create(context) || {}) : {};
    }

    function method(controller, name) {
        return controller && typeof controller[name] === 'function' ? controller[name] : undefined;
    }

    function createCanvasWorkbenchVlmChatContext(source) {
        const scope = source || {};
        const agentContext = createController(
            modules.vlmChat,
            'createVlmAgentContext',
            scope.vlmAgentContextSource || {}
        );
        const agentMethod = name => method(agentContext, name);
        const controllerSource = Object.assign({}, scope.controllerSource || scope, {
            buildVlmAgentContext: (...args) => agentMethod('buildVlmAgentContext')?.(...args)
        });
        const chatController = createController(
            modules.vlmChat,
            'createCanvasVlmChatController',
            controllerSource
        );

        return {
            CANVAS_VLM_AGENT_CONTEXT: agentContext,
            CANVAS_VLM_CHAT_CONTROLLER: chatController
        };
    }

    window.SimpAICanvasWorkbenchVlmChatContext = Object.assign(
        {},
        window.SimpAICanvasWorkbenchVlmChatContext || {},
        { createCanvasWorkbenchVlmChatContext }
    );
})();
