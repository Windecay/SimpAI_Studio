(function () {
    'use strict';

    const modules = {
        prompt: window.SimpAICanvasWorkbenchAgentPromptContext || {}
    };

    function createController(module, factoryName, context) {
        const create = module && module[factoryName];
        return typeof create === 'function' ? (create(context) || {}) : {};
    }

    function createCanvasWorkbenchAgentPromptBootstrapContext(source) {
        const scope = source?.agentPromptBootstrapSource || source || {};
        const prompt = createController(
            modules.prompt,
            'createCanvasAgentPromptContext',
            scope.promptSource || {}
        );
        return { CANVAS_AGENT_PROMPT_CONTEXT: prompt };
    }

    window.SimpAICanvasWorkbenchAgentPromptBootstrapContext = Object.assign(
        {},
        window.SimpAICanvasWorkbenchAgentPromptBootstrapContext || {},
        { createCanvasWorkbenchAgentPromptBootstrapContext }
    );
})();
