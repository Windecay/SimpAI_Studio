(function () {
    'use strict';

    function createCanvasResultAssetController(context) {
        const scope = context?.resultAssetSource || context || {};
        const resultSource = scope.resultSource || {};
        const serializationSource = scope.serializationSource || {};
        const utilitySource = scope.utilitySource || {};
        const call = (sourceObject, name, fallback, ...args) => typeof sourceObject?.[name] === 'function'
            ? sourceObject[name](...args)
            : fallback;
        const cloneRunValue = (value, fallback) => call(
            serializationSource,
            'cloneRunValue',
            fallback,
            value,
            fallback
        );
        const clampValue = (value, min, max) => call(
            utilitySource,
            'clamp',
            Math.max(min, Math.min(max, value)),
            value,
            min,
            max
        );
        const buildResultAssetPatch = (...args) => call(
            resultSource,
            'buildResultAssetPatch',
            {},
            ...args
        );
        const buildResultAssetSelectionPatch = (...args) => call(
            resultSource,
            'buildResultAssetSelectionPatch',
            {},
            ...args
        );

        function getSelectedResultAsset(node) {
            if (!node) return null;
            const assets = Array.isArray(node.assets) ? node.assets : [];
            const index = clampValue(Number(node.selected_asset_index || 0), 0, Math.max(assets.length - 1, 0));
            return assets[index] || node.asset || null;
        }

        function getResultAssetAt(node, index) {
            if (!node) return null;
            const assets = Array.isArray(node.assets) ? node.assets : [];
            if (!assets.length) return node.asset || null;
            const safeIndex = clampValue(Number(index || 0), 0, Math.max(assets.length - 1, 0));
            return assets[safeIndex] || node.asset || null;
        }

        function selectResultAsset(node, index) {
            if (!node || node.type !== 'result') return null;
            const assets = Array.isArray(node.assets) ? node.assets : [];
            const safeIndex = clampValue(Number(index || 0), 0, Math.max(assets.length - 1, 0));
            if (assets[safeIndex]) {
                Object.assign(node, buildResultAssetPatch(node, {
                    asset: cloneRunValue(assets[safeIndex], node.asset || null),
                    selectedAssetIndex: safeIndex
                }));
                Object.assign(node, buildResultAssetSelectionPatch(node, node.asset));
            }
            return getResultAssetAt(node, safeIndex);
        }

        function resultNodeHasOutput(node) {
            return !!(node && node.type === 'result' && (node.asset || (Array.isArray(node.assets) && node.assets.length)));
        }

        return {
            getSelectedResultAsset,
            getResultAssetAt,
            selectResultAsset,
            resultNodeHasOutput
        };
    }

    window.SimpAICanvasWorkbenchResultAsset = Object.assign(
        {},
        window.SimpAICanvasWorkbenchResultAsset || {},
        { createCanvasResultAssetController }
    );
})();
