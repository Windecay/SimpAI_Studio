(function () {
    'use strict';

    function createCanvasEdgeFactoryController(context) {
        const scope = context || {};
        const uid = typeof scope.uid === 'function' ? scope.uid : (type) => `${type}-edge`;

        function buildCanvasEdge(type, options) {
            const config = options || {};
            const edge = {
                id: config.id || uid('edge'),
                type
            };
            Object.keys(config).forEach((key) => {
                if (key === 'id' || key === 'type') return;
                edge[key] = config[key];
            });
            return edge;
        }

        return { buildCanvasEdge };
    }

    window.SimpAICanvasWorkbenchEdgeFactory = Object.assign({}, window.SimpAICanvasWorkbenchEdgeFactory || {}, {
        createCanvasEdgeFactoryController
    });
})();
