(function () {
    'use strict';

    const modules = {
        panelViews: window.SimpAICanvasWorkbenchPanelViews || {},
        panelController: window.SimpAICanvasWorkbenchPanelController || {}
    };

    function createController(module, factoryName, context) {
        const create = module && module[factoryName];
        return typeof create === 'function' ? (create(context) || {}) : {};
    }

    function method(controller, name) {
        return controller && typeof controller[name] === 'function' ? controller[name] : undefined;
    }

    function createCanvasWorkbenchAgentPanelContext(source) {
        const scope = source?.agentPanelSource || source || {};
        const panelViews = createController(
            modules.panelViews,
            'createCanvasAgentPanelViewsController',
            scope.panelViewsSource || {}
        );
        const panelViewMethod = (name, ...args) => method(panelViews, name)?.(...args);
        const panelController = createController(
            modules.panelController,
            'createCanvasAgentPanelController',
            Object.assign({}, scope.panelControllerSource || {}, {
                renderCanvasAgentDecision: (...args) => panelViewMethod('renderCanvasAgentDecision', ...args),
                renderCanvasAgentRunInfo: (...args) => panelViewMethod('renderCanvasAgentRunInfo', ...args),
                renderCanvasAgentInlineReferences: (...args) => panelViewMethod('renderCanvasAgentInlineReferences', ...args),
                renderCanvasAgentReferences: (...args) => panelViewMethod('renderCanvasAgentReferences', ...args),
                renderCanvasAgentToolShelf: (...args) => panelViewMethod('renderCanvasAgentToolShelf', ...args),
                renderCanvasAgentCompactToolbar: (...args) => panelViewMethod('renderCanvasAgentCompactToolbar', ...args),
                renderCanvasAgentResolutionControls: (...args) => panelViewMethod('renderCanvasAgentResolutionControls', ...args),
                renderCanvasAgentResolutionButton: (...args) => panelViewMethod('renderCanvasAgentResolutionButton', ...args),
                renderCanvasAgentModelChip: (...args) => panelViewMethod('renderCanvasAgentModelChip', ...args),
                renderCanvasAgentModelPicker: (...args) => panelViewMethod('renderCanvasAgentModelPicker', ...args)
            })
        );

        return {
            CANVAS_AGENT_PANEL_VIEWS_CONTROLLER: panelViews,
            CANVAS_AGENT_PANEL_CONTROLLER: panelController
        };
    }

    window.SimpAICanvasWorkbenchAgentPanelContext = Object.assign(
        {},
        window.SimpAICanvasWorkbenchAgentPanelContext || {},
        { createCanvasWorkbenchAgentPanelContext }
    );
})();
