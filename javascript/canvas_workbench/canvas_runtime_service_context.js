(function () {
    'use strict';

    function createController(module, factoryName, context) {
        const create = module && module[factoryName];
        return typeof create === 'function' ? (create(context) || {}) : {};
    }

    function method(controller, name) {
        return controller && typeof controller[name] === 'function' ? controller[name] : undefined;
    }

    function createCanvasWorkbenchRuntimeServiceContext(source, controllers) {
        const scope = source?.runtimeServiceSource || source || {};
        const renderSource = scope.renderSource || {};
        const runStatusSource = scope.runStatusSource || {};
        const minimapSource = scope.minimapSource || {};
        const bridgeSource = scope.bridgeSource || {};
        const historySource = scope.historySource || {};
        const renderMethod = name => method(controllers.render, name);
        const runStatusMethod = name => method(controllers.runStatus, name);
        const minimapMethod = name => method(controllers.minimap, name);
        const bridgeMethod = name => method(controllers.bridge, name);
        const historyMethod = name => method(controllers.history, name);
        const nodeRenderMethod = name => method(controllers.nodeRender, name);
        const spatialMethod = name => method(controllers.nodeSpatialIndex, name);
        const layoutMethod = name => method(controllers.nodeLayout, name);
        const viewportMethod = name => method(controllers.viewportRender, name);

        controllers.render = createController(
            window.SimpAICanvasWorkbenchRender || {},
            'createCanvasRenderController',
            Object.assign({}, renderSource, {
                nodeSource: Object.assign({}, renderSource.nodeSource || {}, {
                    renderNodes: (...args) => nodeRenderMethod('renderNodes')?.(...args)
                }),
                statusSource: Object.assign({}, renderSource.statusSource || {}, {
                    renderStatus: (...args) => method(controllers.status, 'renderStatus')?.(...args)
                }),
                uiSource: Object.assign({}, renderSource.uiSource || {}, {
                    invalidateMinimapStaticCache: (...args) => minimapMethod('invalidateMinimapStaticCache')?.(...args),
                    invalidateNodeSpatialIndex: (...args) => spatialMethod('invalidateNodeSpatialIndex')?.(...args),
                    renderMinimap: (...args) => minimapMethod('renderMinimap')?.(...args)
                })
            })
        );
        const renderAll = renderMethod('renderAll');

        controllers.runStatus = createController(
            window.SimpAICanvasWorkbenchRunStatus || {},
            'createCanvasRunStatusController',
            runStatusSource
        );

        controllers.minimap = createController(
            window.SimpAICanvasWorkbenchMinimap || {},
            'createCanvasMinimapController',
            Object.assign({}, minimapSource, {
                viewportSource: Object.assign({}, minimapSource.viewportSource || {}, {
                    getVisibleWorldRect: (...args) => viewportMethod('getVisibleWorldRect')?.(...args) || {},
                }),
                layoutSource: Object.assign({}, minimapSource.layoutSource || {}, {
                    getNodeRect: (...args) => layoutMethod('getNodeRect')?.(...args),
                    getNodeLayoutSize: (...args) => layoutMethod('getNodeLayoutSize')?.(...args),
                }),
                interactionSource: Object.assign({}, minimapSource.interactionSource || {}, {
                    renderStatus: (...args) => method(controllers.status, 'renderStatus')?.(...args),
                }),
            })
        );

        controllers.bridge = createController(
            window.SimpAICanvasWorkbenchBridgeTransport || {},
            'createCanvasBridgeTransportController',
            bridgeSource
        );

        controllers.history = createController(
            window.SimpAICanvasWorkbenchHistory || {},
            'createCanvasHistoryController',
            Object.assign({}, historySource, {
                renderSource: Object.assign({}, historySource.renderSource || {}, {
                    resetRenderedProjectDomCache: (...args) => nodeRenderMethod('resetRenderedProjectDomCache')?.(...args),
                    renderAll,
                }),
            })
        );

        const expose = (controllerKey, names) => names.reduce((result, name) => {
            result[name] = method(controllers[controllerKey], name);
            return result;
        }, {});
        const minimapAliases = expose('minimap', [
            'invalidateMinimapStaticCache', 'syncMinimapViewRect', 'updateMinimapForViewportInteraction',
            'renderMinimap', 'onMinimapPointerDown', 'scheduleMinimapRender', 'cancelMinimapRender',
            'flushMinimapRender', 'resetMinimapCache', 'isDragging'
        ]);
        minimapAliases.isMinimapDragging = minimapAliases.isDragging;

        return Object.assign(
            {
                CANVAS_RENDER_CONTROLLER: controllers.render,
                CANVAS_RUN_STATUS_CONTROLLER: controllers.runStatus,
                CANVAS_MINIMAP_CONTROLLER: controllers.minimap,
                CANVAS_BRIDGE_TRANSPORT_CONTROLLER: controllers.bridge,
                CANVAS_HISTORY_CONTROLLER: controllers.history
            },
            expose('render', ['renderAll']),
            expose('runStatus', [
                'isRunQueueActiveState', 'runQueueRunResultNode', 'runQueueRunPercent',
                'latestRunQueueSize', 'runQueueWidgetSummary', 'renderRunQueueWidget',
                'parseStandaloneStatusPayload', 'fetchStandaloneStatusPayload', 'publishStandaloneStatus',
                'refreshStandaloneStatus', 'startStandaloneStatusMonitor', 'stopStandaloneStatusMonitor',
                'renderSystemInfo', 'setCanvasBackendAlert', 'buildCanvasRunStatus',
                'mergeCanvasRunStatus', 'buildCanvasNodeStatusPatch'
            ]),
            minimapAliases,
            expose('bridge', ['isCanvasBridgeReady', 'bindCanvasBridgeResponseListener', 'sendCanvasBridgeRequest']),
            expose('history', [
                'pushHistory', 'pushHistoryBatch', 'undoCanvasEdit', 'redoCanvasEdit',
                'renderHistoryButtons', 'resetHistory'
            ])
        );
    }

    window.SimpAICanvasWorkbenchRuntimeServiceContext = Object.assign(
        {},
        window.SimpAICanvasWorkbenchRuntimeServiceContext || {},
        { createCanvasWorkbenchRuntimeServiceContext }
    );
})();
