(function () {
    'use strict';

    const modules = {
        mode: window.SimpAICanvasWorkbenchMode || {},
        action: window.SimpAICanvasWorkbenchAction || {},
        click: window.SimpAICanvasWorkbenchClick || {}
    };

    function createController(module, factoryName, context) {
        const create = module && module[factoryName];
        return typeof create === 'function' ? (create(context) || {}) : {};
    }

    function method(controller, name) {
        return controller && typeof controller[name] === 'function' ? controller[name] : undefined;
    }

    function createCanvasWorkbenchControlContext(source) {
        const scope = source?.controlSource || source || {};
        const modeSource = scope.modeSource || {};
        const actionSource = scope.actionSource || {};
        const clickSource = scope.clickSource || {};
        const clickToolbarSource = clickSource.toolbarSource || {};
        const clickModeSource = clickSource.modeSource || {};

        const mode = createController(
            modules.mode,
            'createCanvasModeController',
            modeSource
        );
        const modeMethod = name => method(mode, name);

        const action = createController(
            modules.action,
            'createCanvasActionController',
            actionSource
        );
        const actionMethod = name => method(action, name);

        const click = createController(
            modules.click,
            'createCanvasClickController',
            {
                clickSource: Object.assign({}, clickSource, {
                    toolbarSource: Object.assign({}, clickToolbarSource, {
                        handleAction: (...args) => actionMethod('handleAction')?.(...args),
                    }),
                    modeSource: Object.assign({}, clickModeSource, {
                        setMode: (...args) => modeMethod('setMode')?.(...args),
                    })
                })
            }
        );
        const clickMethod = name => method(click, name);

        return {
            CANVAS_MODE_CONTROLLER: mode,
            setMode: modeMethod('setMode'),
            renderMode: modeMethod('renderMode'),
            CANVAS_ACTION_CONTROLLER: action,
            handleCanvasAction: actionMethod('handleAction'),
            CANVAS_CLICK_CONTROLLER: click,
            onCanvasWorkbenchClick: clickMethod('onClick')
        };
    }

    window.SimpAICanvasWorkbenchControlContext = Object.assign({}, window.SimpAICanvasWorkbenchControlContext || {}, {
        createCanvasWorkbenchControlContext
    });
})();
