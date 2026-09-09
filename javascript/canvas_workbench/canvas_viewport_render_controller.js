(function () {
    'use strict';

    function createCanvasViewportRenderController(context) {
        const scope = context || {};
        const readValue = (name, fallback) => {
            const value = scope[name];
            if (typeof value === 'function') return value();
            return value === undefined ? fallback : value;
        };
        const getProject = () => typeof scope.getProject === 'function' ? scope.getProject() : scope.project;
        const getViewport = () => typeof scope.getViewport === 'function' ? scope.getViewport() : scope.viewport;
        const defaultNodeSize = typeof scope.defaultNodeSize === 'function' ? scope.defaultNodeSize : undefined;
        const getNodeLayoutSize = typeof scope.getNodeLayoutSize === 'function' ? scope.getNodeLayoutSize : undefined;
        const viewportGetVisibleWorldRect = typeof scope.viewportGetVisibleWorldRect === 'function'
            ? scope.viewportGetVisibleWorldRect
            : null;
        const viewportGetNodeRenderWorldRect = typeof scope.viewportGetNodeRenderWorldRect === 'function'
            ? scope.viewportGetNodeRenderWorldRect
            : null;
        const viewportShouldRenderNodeInViewport = typeof scope.viewportShouldRenderNodeInViewport === 'function'
            ? scope.viewportShouldRenderNodeInViewport
            : null;
        const viewportShouldRenderEdgeInViewport = typeof scope.viewportShouldRenderEdgeInViewport === 'function'
            ? scope.viewportShouldRenderEdgeInViewport
            : null;
        const viewportGetEdgeSvgBounds = typeof scope.viewportGetEdgeSvgBounds === 'function'
            ? scope.viewportGetEdgeSvgBounds
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
                ? viewportGetNodeRenderWorldRect(visible, project?.viewport?.zoom, readValue('nodeRenderOverscanPx', 960))
                : visible;
        }

        function getEdgeRenderWorldRect() {
            const project = getProject();
            const edgeCount = Array.isArray(project?.edges) ? project.edges.length : 0;
            if (edgeCount < Number(readValue('edgePointCacheMinEdges', 900))) return getNodeRenderWorldRect();
            const visible = getVisibleWorldRect();
            return viewportGetNodeRenderWorldRect
                ? viewportGetNodeRenderWorldRect(visible, project?.viewport?.zoom, readValue('edgeRenderOverscanPx', 960))
                : visible;
        }

        function shouldRenderNodeInViewport(node, renderWindow) {
            if (!viewportShouldRenderNodeInViewport) return !!node;
            return viewportShouldRenderNodeInViewport(node, renderWindow, {
                defaultNodeSize,
                getNodeLayoutSize,
                selectedNodeId: readValue('getSelectedNodeId', null),
                selectedNodeIds: readValue('getSelectedNodeIds', new Set()),
                connectFromId: readValue('getConnectingFromId', '') || '',
                isRunning: typeof scope.isNodeVisuallyRunning === 'function' ? scope.isNodeVisuallyRunning : undefined
            });
        }

        function shouldRenderEdgeInViewport(edge, fromNode, toNode, renderWindow) {
            if (!viewportShouldRenderEdgeInViewport) return true;
            return viewportShouldRenderEdgeInViewport(edge, fromNode, toNode, renderWindow, {
                defaultNodeSize,
                getNodeLayoutSize,
                selectedEdgeId: readValue('getSelectedEdgeId', null),
                selectedNodeIds: readValue('getSelectedNodeIds', new Set())
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
