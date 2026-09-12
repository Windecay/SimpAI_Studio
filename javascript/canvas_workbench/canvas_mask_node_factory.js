(function () {
    'use strict';

    function createCanvasMaskNodeFactoryController(context) {
        const scope = context || {};
        const uid = typeof scope.uid === 'function' ? scope.uid : (type) => `${type}-node`;
        const advancedMaskingLabel = typeof scope.advancedMaskingLabel === 'function'
            ? scope.advancedMaskingLabel
            : () => 'Advanced Masking';
        const cloneRunValue = typeof scope.cloneRunValue === 'function'
            ? scope.cloneRunValue
            : ((value, fallback) => {
                try {
                    return JSON.parse(JSON.stringify(value ?? fallback));
                } catch (err) {
                    return fallback;
                }
            });
        const buildAssetReference = typeof scope.buildAssetReference === 'function'
            ? scope.buildAssetReference
            : (asset) => asset === null || asset === undefined ? null : cloneRunValue(asset, asset);

        function cloneValue(value, fallback) {
            return cloneRunValue(value, fallback);
        }

        function cloneAsset(asset) {
            if (asset === null || asset === undefined) return null;
            return buildAssetReference(asset);
        }

        function mergeObject(previous, next) {
            return Object.assign(
                {},
                previous && typeof previous === 'object' && !Array.isArray(previous) ? cloneValue(previous, {}) : {},
                next && typeof next === 'object' && !Array.isArray(next) ? cloneValue(next, {}) : {}
            );
        }

        function defaultMaskParams() {
            return {
                mask_model: 'u2net',
                cloth_category: 'full',
                dino_prompt: '',
                sam_model: 'vit_b',
                box_threshold: 0.3,
                text_threshold: 0.25,
                sam_max_detections: 2,
                dino_erode_or_dilate: 0,
                debugging_dino: false
            };
        }

        function defaultMaskSource() {
            return { kind: 'advanced_masking', module: 'extras.inpaint_mask' };
        }

        function defaultMaskStatus() {
            return {
                state: 'idle',
                message: 'Connect a source image, then generate a black/white mask.'
            };
        }

        function buildMaskStatePatch(node, options) {
            const config = options || {};
            const hasOwn = (key) => Object.prototype.hasOwnProperty.call(config, key);
            const objectOrEmpty = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
            const defaults = objectOrEmpty(config.defaults);
            const initialState = objectOrEmpty(config.initialState);
            const statePatch = objectOrEmpty(config.statePatch);
            const state = Object.assign(
                {},
                {
                    params: defaultMaskParams(),
                    asset: null,
                    source: defaultMaskSource(),
                    status: defaultMaskStatus()
                },
                cloneValue(defaults, {}),
                cloneValue(initialState, {}),
                cloneValue(node || {}, {}),
                cloneValue(statePatch, {})
            );
            const params = mergeObject(
                mergeObject(
                    mergeObject(
                        mergeObject(defaultMaskParams(), defaults.params),
                        initialState.params
                    ),
                    node?.params
                ),
                statePatch.params
            );
            const source = mergeObject(
                mergeObject(
                    mergeObject(
                        mergeObject(defaultMaskSource(), defaults.source),
                        initialState.source
                    ),
                    node?.source
                ),
                statePatch.source
            );
            let status = hasOwn('status')
                ? cloneValue(config.status, {})
                : mergeObject(
                    mergeObject(
                        mergeObject(
                            mergeObject(defaultMaskStatus(), defaults.status),
                            initialState.status
                        ),
                        node?.status
                    ),
                    statePatch.status
                );
            if (hasOwn('statusPatch')) status = mergeObject(status, config.statusPatch);
            const patch = {
                params: mergeObject(params, config.paramsPatch),
                asset: cloneAsset(hasOwn('asset') ? config.asset : state.asset),
                source: mergeObject(source, config.sourcePatch),
                status
            };
            if (hasOwn('inputNodeId')) patch.input_node_id = config.inputNodeId ?? null;
            if (hasOwn('mask')) patch.mask = cloneValue(config.mask, null);
            return patch;
        }

        function buildMaskNode(world, options) {
            const opts = options || {};
            const position = world || { x: 0, y: 0 };
            const node = {
                id: uid('mask'),
                type: 'mask',
                x: position.x,
                y: position.y,
                w: 320,
                h: 520,
                title: opts.title || advancedMaskingLabel(),
                input_node_id: opts.input_node_id || null
            };
            const stateOptions = {};
            if (Object.prototype.hasOwnProperty.call(opts, 'params')) stateOptions.paramsPatch = opts.params;
            if (Object.prototype.hasOwnProperty.call(opts, 'asset')) stateOptions.asset = opts.asset || null;
            if (opts.source && typeof opts.source === 'object') stateOptions.sourcePatch = opts.source;
            if (opts.status && typeof opts.status === 'object') stateOptions.status = opts.status;
            return Object.assign(node, buildMaskStatePatch(node, stateOptions));
        }

        function buildMaskStatus(state, message) {
            return { state, message };
        }

        return { buildMaskNode, buildMaskStatus, buildMaskStatePatch };
    }

    window.SimpAICanvasWorkbenchMaskNodeFactory = Object.assign({}, window.SimpAICanvasWorkbenchMaskNodeFactory || {}, {
        createCanvasMaskNodeFactoryController
    });
})();
