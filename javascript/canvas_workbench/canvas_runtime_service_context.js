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
        const scope = source || {};
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
            {
                getRoot: scope.getRoot,
                getRunHistoryPanel: scope.getRunHistoryPanel,
                getPerfStats: scope.getPerfStats,
                performanceNow: scope.performanceNow,
                cancelPanEdgeSettleRender: scope.cancelPanEdgeSettleRender,
                isNodeDragging: scope.isNodeDragging,
                isGroupDragging: scope.isGroupDragging,
                cancelDragEdgeSettleRender: scope.cancelDragEdgeSettleRender,
                endDragEdgeLodVisual: scope.endDragEdgeLodVisual,
                invalidateMinimapStaticCache: (...args) => minimapMethod('invalidateMinimapStaticCache')?.(...args),
                invalidateNodeSpatialIndex: (...args) => spatialMethod('invalidateNodeSpatialIndex')?.(...args),
                reconcileSelection: scope.reconcileSelection,
                applyThemeClass: scope.applyThemeClass,
                applyViewport: scope.applyViewport,
                renderGroups: scope.renderGroups,
                renderMode: scope.renderMode,
                renderNodes: (...args) => nodeRenderMethod('renderNodes')?.(...args),
                renderEdges: scope.renderEdges,
                renderSelectedChainOverlay: scope.renderSelectedChainOverlay,
                renderInspector: scope.renderInspector,
                renderStatus: (...args) => method(controllers.status, 'renderStatus')?.(...args),
                renderCanvasSettingsPanel: scope.renderCanvasSettingsPanel,
                renderMinimap: (...args) => minimapMethod('renderMinimap')?.(...args),
                renderCanvasAgentPanel: scope.renderCanvasAgentPanel,
                renderRunQueuePanelIfOpen: scope.renderRunQueuePanelIfOpen,
                renderRunHistoryPanel: scope.renderRunHistoryPanel,
                renderPerformanceHud: scope.renderPerformanceHud,
                scheduleEdgeIncidentIndexWarmup: scope.scheduleEdgeIncidentIndexWarmup
            }
        );
        const renderAll = renderMethod('renderAll');

        controllers.runStatus = createController(
            window.SimpAICanvasWorkbenchRunStatus || {},
            'createCanvasRunStatusController',
            {
                t: scope.t,
                escapeHtml: scope.escapeHtml,
                formatLocalTime: scope.formatLocalTime,
                clamp: scope.clamp,
                getProject: scope.getProject,
                getNode: scope.getNode,
                getRunQueueWidget: scope.getRunQueueWidget,
                getRunQueuePanel: scope.getRunQueuePanel,
                getSystemInfoElement: scope.getSystemInfoElement,
                getBackendAlertElement: scope.getBackendAlertElement,
                getWindow: () => window,
                isStandaloneCanvasWorkbench: scope.isStandaloneCanvasWorkbench,
                isCanvasRunActiveState: scope.isCanvasRunActiveState,
                isTerminalRunState: scope.isTerminalRunState,
                fetchStatus: scope.fetchStatus,
                setInterval: scope.setInterval,
                clearInterval: scope.clearInterval
            }
        );

        controllers.minimap = createController(
            window.SimpAICanvasWorkbenchMinimap || {},
            'createCanvasMinimapController',
            {
                getProject: scope.getProject,
                getMinimapElement: scope.getMinimapElement,
                getViewport: scope.getViewport,
                buildProjectViewportPatch: scope.buildProjectViewportPatch,
                getDocument: scope.getDocument,
                getWindow: () => window,
                getVisibleWorldRect: (...args) => viewportMethod('getVisibleWorldRect')?.(...args) || {},
                getNodeRect: (...args) => layoutMethod('getNodeRect')?.(...args),
                getGroupRect: scope.getGroupRect,
                ensureProjectGroups: scope.ensureProjectGroups,
                getSelectedNodeId: scope.getSelectedNodeId,
                getSelectedNodeIds: scope.getSelectedNodeIds,
                getSelectedGroupId: scope.getSelectedGroupId,
                nodeCustomColor: scope.nodeCustomColor,
                expandCanvasHexColor: scope.expandCanvasHexColor,
                escapeHtml: scope.escapeHtml,
                defaultNodeSize: scope.defaultNodeSize,
                getNodeLayoutSize: (...args) => layoutMethod('getNodeLayoutSize')?.(...args),
                getMinimapBounds: scope.getMinimapBounds,
                hasCanvasOverflow: scope.hasCanvasOverflow,
                getPerfStats: scope.getPerfStats,
                performanceNow: scope.performanceNow,
                setTimeout: scope.setTimeout,
                clearTimeout: scope.clearTimeout,
                preferSvgEdgesForViewportInteraction: scope.preferSvgEdgesForViewportInteraction,
                applyViewport: scope.applyViewport,
                renderStatus: (...args) => method(controllers.status, 'renderStatus')?.(...args),
                scheduleViewportNodeRender: scope.scheduleViewportNodeRender,
                scheduleViewportSave: scope.scheduleViewportSave
            }
        );

        controllers.bridge = createController(
            window.SimpAICanvasWorkbenchBridgeTransport || {},
            'createCanvasBridgeTransportController',
            {
                document: scope.getDocument?.(),
                uid: scope.uid,
                setGradioTextboxValue: scope.setGradioTextboxValue,
                clickGradioButton: scope.clickGradioButton,
                setTimeout: scope.setTimeout,
                clearTimeout: scope.clearTimeout
            }
        );

        controllers.history = createController(
            window.SimpAICanvasWorkbenchHistory || {},
            'createCanvasHistoryController',
            {
                t: scope.t,
                getHistoryLimit: scope.getHistoryLimit,
                getHistoryMemoryBudgetBytes: scope.getHistoryMemoryBudgetBytes,
                getProject: scope.getProject,
                setProject: scope.setProject,
                compactProjectForStorage: scope.compactProjectForStorage,
                buildProjectStorageInfo: scope.buildProjectStorageInfo,
                getStorageKey: scope.getStorageKey,
                getStorageScope: scope.getStorageScope,
                sanitizeProject: scope.sanitizeProject,
                resetRenderedProjectDomCache: (...args) => nodeRenderMethod('resetRenderedProjectDomCache')?.(...args),
                getSelectionState: scope.getSelectionState,
                setSelectionState: scope.setSelectionState,
                closeContextMenu: scope.closeContextMenu,
                scheduleSave: scope.scheduleSave,
                renderAll,
                showToast: scope.showToast,
                getRoot: scope.getRoot,
                setTimeout: scope.setTimeout,
                clearTimeout: scope.clearTimeout
            }
        );

        const expose = (controllerKey, names) => names.reduce((result, name) => {
            result[name] = method(controllers[controllerKey], name);
            return result;
        }, {});

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
            expose('minimap', [
                'invalidateMinimapStaticCache', 'syncMinimapViewRect', 'updateMinimapForViewportInteraction',
                'renderMinimap', 'onMinimapPointerDown', 'scheduleMinimapRender', 'cancelMinimapRender',
                'flushMinimapRender', 'resetMinimapCache', 'isDragging'
            ]),
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
