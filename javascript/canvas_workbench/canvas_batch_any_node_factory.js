(function () {
    'use strict';

    function createCanvasBatchAnyNodeFactoryController(context) {
        const scope = context || {};
        const uid = typeof scope.uid === 'function' ? scope.uid : (type) => `${type}-node`;
        const defaultNodeSize = typeof scope.defaultNodeSize === 'function'
            ? scope.defaultNodeSize
            : () => ({ w: 360, h: 460 });
        const cloneRunValue = typeof scope.cloneRunValue === 'function'
            ? scope.cloneRunValue
            : ((value, fallback) => {
                try {
                    return JSON.parse(JSON.stringify(value ?? fallback));
                } catch (err) {
                    return fallback;
                }
            });

        function cloneValue(value, fallback) {
            return cloneRunValue(value, fallback);
        }

        function mergeObject(previous, next) {
            return Object.assign(
                {},
                previous && typeof previous === 'object' && !Array.isArray(previous) ? cloneValue(previous, {}) : {},
                next && typeof next === 'object' && !Array.isArray(next) ? cloneValue(next, {}) : {}
            );
        }

        function buildBatchAnyStatePatch(node, options) {
            const config = options || {};
            const defaultState = {
                media_kind: '',
                items: [],
                current_index: 0,
                params: { stop_on_error: true },
                batch: { state: 'idle', run_ids: [], last_error: '' },
                asset: null,
                source: { kind: 'batch_any' }
            };
            const initialState = config.initialState && typeof config.initialState === 'object' && !Array.isArray(config.initialState)
                ? config.initialState
                : {};
            const statePatch = config.statePatch && typeof config.statePatch === 'object' && !Array.isArray(config.statePatch)
                ? config.statePatch
                : {};
            const state = Object.assign(
                {},
                cloneValue(defaultState, {}),
                cloneValue(initialState, {}),
                cloneValue(node || {}, {}),
                cloneValue(statePatch, {})
            );
            const params = mergeObject(
                mergeObject(mergeObject(defaultState.params, initialState.params), node?.params),
                statePatch.params
            );
            const batch = mergeObject(
                mergeObject(mergeObject(defaultState.batch, initialState.batch), node?.batch),
                statePatch.batch
            );
            const source = mergeObject(
                mergeObject(mergeObject(defaultState.source, initialState.source), node?.source),
                statePatch.source
            );
            const patch = {
                media_kind: state.media_kind ?? '',
                items: Array.isArray(state.items) ? cloneValue(state.items, []) : [],
                current_index: Number.isFinite(Number(state.current_index)) ? Number(state.current_index) : 0,
                params: mergeObject(params, config.paramsPatch),
                batch: mergeObject(batch, config.batchPatch),
                asset: cloneValue(state.asset, null),
                source: mergeObject(source, config.sourcePatch)
            };
            const hasText = Object.prototype.hasOwnProperty.call(config, 'textPatch')
                || Object.prototype.hasOwnProperty.call(initialState, 'text')
                || Object.prototype.hasOwnProperty.call(statePatch, 'text')
                || Object.prototype.hasOwnProperty.call(node || {}, 'text');
            if (hasText) {
                const text = mergeObject(
                    mergeObject(mergeObject({ value: '', updated_at: '' }, initialState.text), node?.text),
                    statePatch.text
                );
                patch.text = mergeObject(text, config.textPatch);
            }
            return patch;
        }

        function buildBatchAnyItemStatePatch(item, options) {
            if (!item || typeof item !== 'object' || Array.isArray(item)) return {};
            const config = options || {};
            const nextItem = cloneValue(item, {});
            if (Object.prototype.hasOwnProperty.call(config, 'sourceEdgeId')) {
                nextItem.source_edge_id = String(config.sourceEdgeId || '');
            }
            if (Object.prototype.hasOwnProperty.call(config, 'materializedAt')) {
                nextItem.materialized_at = config.materializedAt || '';
            }
            if (Object.prototype.hasOwnProperty.call(config, 'asset')) {
                nextItem.asset = cloneValue(config.asset, null);
            } else if (config.assetPatch && typeof config.assetPatch === 'object' && !Array.isArray(config.assetPatch)) {
                const asset = nextItem.asset && typeof nextItem.asset === 'object' && !Array.isArray(nextItem.asset)
                    ? nextItem.asset
                    : {};
                nextItem.asset = Object.assign(asset, cloneValue(config.assetPatch, {}));
            }
            (Array.isArray(config.deleteAssetKeys) ? config.deleteAssetKeys : []).forEach((key) => {
                const name = String(key || '').trim();
                if (name && nextItem.asset && typeof nextItem.asset === 'object') delete nextItem.asset[name];
            });
            return nextItem;
        }

        function buildBatchAnyLegacyTypePatch(node) {
            return node?.type === 'batch_images' ? { type: 'batch_any' } : {};
        }

        function buildBatchAnyNode(world, options) {
            const opts = options || {};
            const position = world || { x: 0, y: 0 };
            const size = defaultNodeSize('batch_any') || { w: 360, h: 460 };
            const node = {
                id: uid('batch'),
                type: 'batch_any',
                x: position.x,
                y: position.y,
                w: size.w,
                h: size.h,
                title: opts.title || 'Batch Any'
            };
            return Object.assign(node, buildBatchAnyStatePatch(node));
        }

        return { buildBatchAnyNode, buildBatchAnyStatePatch, buildBatchAnyItemStatePatch, buildBatchAnyLegacyTypePatch };
    }

    window.SimpAICanvasWorkbenchBatchAnyNodeFactory = Object.assign({}, window.SimpAICanvasWorkbenchBatchAnyNodeFactory || {}, {
        createCanvasBatchAnyNodeFactoryController
    });
})();
