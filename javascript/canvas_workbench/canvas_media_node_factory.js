(function () {
    'use strict';

    function createCanvasMediaNodeFactoryController(context) {
        const scope = context || {};
        const uid = typeof scope.uid === 'function' ? scope.uid : (prefix) => `${prefix}-node`;
        const cloneRunValue = typeof scope.cloneRunValue === 'function'
            ? scope.cloneRunValue
            : ((value, fallback) => {
                try {
                    return JSON.parse(JSON.stringify(value ?? fallback));
                } catch (err) {
                    return fallback;
                }
            });
        const defaultNodeSize = typeof scope.defaultNodeSize === 'function'
            ? scope.defaultNodeSize
            : (type) => type === 'image' ? { w: 264, h: 300 } : { w: 220, h: 250 };
        const getAssetMediaKind = typeof scope.getAssetMediaKind === 'function'
            ? scope.getAssetMediaKind
            : (asset) => {
                const mime = String(asset?.mime || '').toLowerCase();
                if (mime.startsWith('video/')) return 'video';
                if (mime.startsWith('audio/')) return 'audio';
                return 'image';
            };

        function buildMediaNodeSourcePatch(node, sourcePatch) {
            if (!node || !['image', 'video', 'audio'].includes(node.type)) return {};
            const source = node.source && typeof node.source === 'object' && !Array.isArray(node.source)
                ? cloneRunValue(node.source, {})
                : {};
            const patch = sourcePatch && typeof sourcePatch === 'object' && !Array.isArray(sourcePatch)
                ? cloneRunValue(sourcePatch, {})
                : {};
            return { source: cloneRunValue(Object.assign(source, patch), {}) };
        }

        function buildMediaNodeStatePatch(node, options) {
            if (!node || !['image', 'video', 'audio'].includes(node.type)) return {};
            const config = options || {};
            const hasOwn = (key) => Object.prototype.hasOwnProperty.call(config, key);
            const isRecord = (value) => value && typeof value === 'object' && !Array.isArray(value);
            const patch = {};
            let asset = null;
            let hasAsset = false;
            if (hasOwn('asset')) {
                asset = cloneRunValue(config.asset, null);
                hasAsset = true;
            } else if (isRecord(config.assetPatch)) {
                asset = isRecord(node.asset) ? cloneRunValue(node.asset, {}) : {};
                Object.assign(asset, cloneRunValue(config.assetPatch, {}));
                hasAsset = true;
            }
            if (Array.isArray(config.deleteAssetKeys) && config.deleteAssetKeys.length) {
                asset = hasAsset ? asset : (isRecord(node.asset) ? cloneRunValue(node.asset, {}) : {});
                config.deleteAssetKeys.forEach((key) => {
                    const name = String(key || '').trim();
                    if (name && asset && typeof asset === 'object') delete asset[name];
                });
                hasAsset = true;
            }
            if (hasAsset) patch.asset = cloneRunValue(asset, null);
            if (hasOwn('mask')) patch.mask = cloneRunValue(config.mask, null);
            if (hasOwn('title')) patch.title = config.title;
            if (hasOwn('displayMode')) patch.display_mode = config.displayMode;
            return patch;
        }

        function buildImageNodeFromAsset(asset, world, title, options) {
            if (!asset) return null;
            const position = world || { x: 0, y: 0 };
            return {
                id: uid('image'),
                type: 'image',
                x: position.x,
                y: position.y,
                w: 264,
                h: 300,
                title: title || asset.name || 'Canvas output',
                display_mode: options?.displayMode || 'frameless',
                asset: cloneRunValue(asset, {}),
                mask: null,
                source: {
                    kind: 'result_output',
                    output_path: asset.output_path || asset.path || '',
                    source_asset_id: asset.asset_id || ''
                }
            };
        }

        function buildMediaNodeFromAsset(asset, world, title, options) {
            if (!asset) return null;
            const type = getAssetMediaKind(asset);
            if (type === 'image') return buildImageNodeFromAsset(asset, world, title, options);
            const position = world || { x: 0, y: 0 };
            const size = defaultNodeSize(type) || { w: 220, h: 250 };
            return {
                id: uid(type === 'video' ? 'vid' : 'aud'),
                type,
                x: position.x,
                y: position.y,
                w: size.w,
                h: size.h,
                title: title || asset.name || (type === 'video' ? 'Video output' : 'Audio output'),
                asset: cloneRunValue(asset, {}),
                source: {
                    kind: 'result_output',
                    output_path: asset.output_path || asset.path || '',
                    source_asset_id: asset.asset_id || ''
                }
            };
        }

        return { buildImageNodeFromAsset, buildMediaNodeFromAsset, buildMediaNodeSourcePatch, buildMediaNodeStatePatch };
    }

    window.SimpAICanvasWorkbenchMediaNodeFactory = Object.assign({}, window.SimpAICanvasWorkbenchMediaNodeFactory || {}, {
        createCanvasMediaNodeFactoryController
    });
})();
