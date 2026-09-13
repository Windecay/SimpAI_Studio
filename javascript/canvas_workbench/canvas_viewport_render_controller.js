(function () {
    'use strict';

    function createCanvasViewportRenderController(context) {
        const scope = context || {};
        const sourceObject = (name) => {
            const value = scope[name];
            return value && typeof value === 'object' ? value : {};
        };
        const projectSource = sourceObject('projectSource');
        const viewportSource = sourceObject('viewportSource');
        const layoutSource = sourceObject('layoutSource');
        const selectionSource = sourceObject('selectionSource');
        const connectionSource = sourceObject('connectionSource');
        const nodeSource = sourceObject('nodeSource');
        const configSource = sourceObject('configSource');
        const sourceCall = (source, name, fallback, ...args) => typeof source[name] === 'function'
            ? source[name](...args)
            : fallback;
        const readValue = (source, name, fallback, ...args) => {
            const value = source[name];
            if (typeof value === 'function') return value(...args);
            return value === undefined ? fallback : value;
        };
        const getProject = () => sourceCall(projectSource, 'getProject', null);
        const getViewport = () => sourceCall(viewportSource, 'getViewport', null);
        const defaultNodeSize = typeof layoutSource.defaultNodeSize === 'function'
            ? layoutSource.defaultNodeSize
            : undefined;
        const getNodeLayoutSize = typeof layoutSource.getNodeLayoutSize === 'function'
            ? layoutSource.getNodeLayoutSize
            : undefined;
        const viewportGetVisibleWorldRect = typeof viewportSource.viewportGetVisibleWorldRect === 'function'
            ? viewportSource.viewportGetVisibleWorldRect
            : null;
        const viewportGetNodeRenderWorldRect = typeof viewportSource.viewportGetNodeRenderWorldRect === 'function'
            ? viewportSource.viewportGetNodeRenderWorldRect
            : null;
        const viewportShouldRenderNodeInViewport = typeof viewportSource.viewportShouldRenderNodeInViewport === 'function'
            ? viewportSource.viewportShouldRenderNodeInViewport
            : null;
        const viewportShouldRenderEdgeInViewport = typeof viewportSource.viewportShouldRenderEdgeInViewport === 'function'
            ? viewportSource.viewportShouldRenderEdgeInViewport
            : null;
        const viewportGetEdgeSvgBounds = typeof viewportSource.viewportGetEdgeSvgBounds === 'function'
            ? viewportSource.viewportGetEdgeSvgBounds
            : null;

        function getVisibleWorldRect() {
            const project = getProject();
            return viewportGetVisibleWorldRect
                ? viewportGetVisibleWorldRect(getViewport(), project?.viewport)
                : { x: 0, y: 0, w: 1, h: 1 };
        }

        function getNodeRenderWorldRect() {
            const project = getProject();
            const visible = getVisibleWorldRect();
            return viewportGetNodeRenderWorldRect
                ? viewportGetNodeRenderWorldRect(
                    visible,
                    project?.viewport?.zoom,
                    readValue(configSource, 'nodeRenderOverscanPx', 960)
                )
                : visible;
        }

        function getEdgeRenderWorldRect() {
            const project = getProject();
            const edgeCount = Array.isArray(project?.edges) ? project.edges.length : 0;
            if (edgeCount < Number(readValue(configSource, 'edgePointCacheMinEdges', 900))) {
                return getNodeRenderWorldRect();
            }
            const visible = getVisibleWorldRect();
            return viewportGetNodeRenderWorldRect
                ? viewportGetNodeRenderWorldRect(
                    visible,
                    project?.viewport?.zoom,
                    readValue(configSource, 'edgeRenderOverscanPx', 960)
                )
                : visible;
        }

        function shouldRenderNodeInViewport(node, renderWindow) {
            if (!viewportShouldRenderNodeInViewport) return !!node;
            return viewportShouldRenderNodeInViewport(node, renderWindow, {
                defaultNodeSize,
                getNodeLayoutSize,
                selectedNodeId: readValue(selectionSource, 'getSelectedNodeId', null),
                selectedNodeIds: readValue(selectionSource, 'getSelectedNodeIds', new Set()),
                connectFromId: readValue(connectionSource, 'getConnectingFromId', '') || '',
                isRunning: typeof nodeSource.isNodeVisuallyRunning === 'function'
                    ? nodeSource.isNodeVisuallyRunning
                    : undefined
            });
        }

        function shouldRenderEdgeInViewport(edge, fromNode, toNode, renderWindow) {
            if (!viewportShouldRenderEdgeInViewport) return true;
            return viewportShouldRenderEdgeInViewport(edge, fromNode, toNode, renderWindow, {
                defaultNodeSize,
                getNodeLayoutSize,
                selectedEdgeId: readValue(selectionSource, 'getSelectedEdgeId', null),
                selectedNodeIds: readValue(selectionSource, 'getSelectedNodeIds', new Set())
            });
        }

        function getEdgeSvgBounds() {
            const project = getProject();
            return viewportGetEdgeSvgBounds
                ? viewportGetEdgeSvgBounds(project?.nodes, getVisibleWorldRect(), { defaultNodeSize })
                : { x: -800, y: -800, w: 1600, h: 1200 };
        }

        return {
            getVisibleWorldRect,
            getNodeRenderWorldRect,
            getEdgeRenderWorldRect,
            shouldRenderNodeInViewport,
            shouldRenderEdgeInViewport,
            getEdgeSvgBounds
        };
    }

    window.SimpAICanvasWorkbenchViewportRender = Object.assign({}, window.SimpAICanvasWorkbenchViewportRender || {}, {
        createCanvasViewportRenderController
    });
})();
