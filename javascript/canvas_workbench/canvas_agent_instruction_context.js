(function () {
    'use strict';

    const modules = {
        planner: window.SimpAICanvasWorkbenchInstructionPlanner || {},
        vlmInstruction: window.SimpAICanvasWorkbenchVlmInstruction || {}
    };

    function createController(module, factoryName, context) {
        const create = module && module[factoryName];
        return typeof create === 'function' ? (create(context) || {}) : {};
    }

    function method(controller, name) {
        return controller && typeof controller[name] === 'function' ? controller[name] : undefined;
    }

    function createCanvasWorkbenchAgentInstructionContext(source) {
        const scope = source?.agentInstructionSource || source || {};
        const planner = createController(
            modules.planner,
            'createCanvasAgentInstructionPlanner',
            scope.plannerSource || {}
        );
        const plannerMethod = (name, ...args) => method(planner, name)?.(...args);
        const vlmInstruction = createController(
            modules.vlmInstruction,
            'createCanvasAgentVlmInstructionController',
            Object.assign({}, scope.vlmInstructionSource || {}, {
                canvasAgentInstructionPlanPrompt: (...args) => plannerMethod('canvasAgentInstructionPlanPrompt', ...args),
                extractCanvasAgentJsonObject: (...args) => plannerMethod('extractCanvasAgentJsonObject', ...args),
                normalizeCanvasAgentInstructionPlan: (...args) => plannerMethod('normalizeCanvasAgentInstructionPlan', ...args)
            })
        );

        return {
            CANVAS_AGENT_INSTRUCTION_PLANNER_CONTROLLER: planner,
            CANVAS_AGENT_VLM_INSTRUCTION_CONTROLLER: vlmInstruction
        };
    }

    window.SimpAICanvasWorkbenchAgentInstructionContext = Object.assign(
        {},
        window.SimpAICanvasWorkbenchAgentInstructionContext || {},
        { createCanvasWorkbenchAgentInstructionContext }
    );
})();
