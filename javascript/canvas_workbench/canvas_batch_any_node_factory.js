(function () {
    'use strict';

    function createCanvasBatchAnyNodeFactoryController(context) {
        const scope = context || {};
        const uid = typeof scope.uid === 'function' ? scope.uid : (type) => `${type}-node`;
        const defaultNodeSize = typeof scope.defaultNodeSize === 'function'
            ? scope.defaultNodeSize
            : () => ({ w: 360, h: 460 });

        function buildBatchAnyNode(world, options) {
            const opts = options || {};
            const position = world || { x: 0, y: 0 };
            const size = defaultNodeSize('batch_any') || { w: 360, h: 460 };
            return {
                id: uid('batch'),
                type: 'batch_any',
                x: position.x,
                y: position.y,
                w: size.w,
                h: size.h,
                title: opts.title || 'Batch Any',
                media_kind: '',
                items: [],
                current_index: 0,
                params: { stop_on_error: true },
                batch: { state: 'idle', run_ids: [], last_error: '' },
                asset: null,
                source: { kind: 'batch_any' }
            };
        }

        return { buildBatchAnyNode };
    }

    window.SimpAICanvasWorkbenchBatchAnyNodeFactory = Object.assign({}, window.SimpAICanvasWorkbenchBatchAnyNodeFactory || {}, {
        createCanvasBatchAnyNodeFactoryController
    });
})();
