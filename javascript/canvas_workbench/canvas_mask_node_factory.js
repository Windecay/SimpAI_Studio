(function () {
    'use strict';

    function createCanvasMaskNodeFactoryController(context) {
        const scope = context || {};
        const uid = typeof scope.uid === 'function' ? scope.uid : (type) => `${type}-node`;
        const advancedMaskingLabel = typeof scope.advancedMaskingLabel === 'function'
            ? scope.advancedMaskingLabel
            : () => 'Advanced Masking';

        function buildMaskNode(world, options) {
            const opts = options || {};
            const position = world || { x: 0, y: 0 };
            return {
                id: uid('mask'),
                type: 'mask',
                x: position.x,
                y: position.y,
                w: 320,
                h: 520,
                title: opts.title || advancedMaskingLabel(),
                input_node_id: opts.input_node_id || null,
                params: Object.assign({
                    mask_model: 'u2net',
                    cloth_category: 'full',
                    dino_prompt: '',
                    sam_model: 'vit_b',
                    box_threshold: 0.3,
                    text_threshold: 0.25,
                    sam_max_detections: 2,
                    dino_erode_or_dilate: 0,
                    debugging_dino: false
                }, opts.params || {}),
                asset: opts.asset || null,
                source: { kind: 'advanced_masking', module: 'extras.inpaint_mask' },
                status: {
                    state: 'idle',
                    message: 'Connect a source image, then generate a black/white mask.'
                }
            };
        }

        return { buildMaskNode };
    }

    window.SimpAICanvasWorkbenchMaskNodeFactory = Object.assign({}, window.SimpAICanvasWorkbenchMaskNodeFactory || {}, {
        createCanvasMaskNodeFactoryController
    });
})();
