(function () {
    'use strict';

    function createCanvasConfigNodeFactoryController(context) {
        const scope = context || {};
        const uid = typeof scope.uid === 'function' ? scope.uid : (prefix) => `${prefix}-node`;
        const nowIso = typeof scope.nowIso === 'function' ? scope.nowIso : () => new Date().toISOString();
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

        function objectOrEmpty(value) {
            return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
        }

        function mergeObject(previous, next) {
            return Object.assign(
                {},
                objectOrEmpty(previous) ? cloneValue(objectOrEmpty(previous), {}) : {},
                objectOrEmpty(next) ? cloneValue(objectOrEmpty(next), {}) : {}
            );
        }

        function buildConfigStatePatch(node, options) {
            const config = options || {};
            const hasOwn = (key) => Object.prototype.hasOwnProperty.call(config, key);
            const initialConfig = objectOrEmpty(config.initialConfig);
            const currentConfig = objectOrEmpty(node?.config);
            const configPatch = objectOrEmpty(config.configPatch);
            const base = mergeObject(
                mergeObject({ mode: 'external_override', defaults: {}, values: {} }, initialConfig),
                currentConfig
            );
            const nextConfig = mergeObject(base, configPatch);
            const defaults = hasOwn('defaults')
                ? cloneValue(config.defaults, {})
                : mergeObject(
                    mergeObject(base.defaults, configPatch.defaults),
                    config.defaultsPatch
                );
            const values = hasOwn('values')
                ? cloneValue(config.values, {})
                : mergeObject(
                    mergeObject(base.values, configPatch.values),
                    config.valuesPatch
                );
            const deleteValueKeys = Array.isArray(config.deleteValueKeys) ? config.deleteValueKeys : [];
            deleteValueKeys.forEach((key) => {
                const name = String(key || '').trim();
                if (name) delete values[name];
            });
            nextConfig.defaults = defaults;
            nextConfig.values = values;
            if (hasOwn('updatedAt')) nextConfig.updated_at = cloneValue(config.updatedAt, '');
            else if (config.touchUpdatedAt) nextConfig.updated_at = nowIso();
            const patch = { config: nextConfig };
            if (hasOwn('targetPresetId')) patch.target_preset_id = config.targetPresetId ?? null;
            if (hasOwn('targetRegionIndex')) patch.target_region_index = config.targetRegionIndex ?? null;
            return patch;
        }

        function buildConfigNode(options) {
            const config = options || {};
            const node = {
                id: uid('config'),
                type: 'config',
                config_kind: config.configKind || '',
                x: config.x || 0,
                y: config.y || 0,
                w: config.w || 320,
                h: config.h || 360,
                title: config.title || '',
                target_preset_id: config.targetPresetId || '',
                target_region_index: config.targetRegionIndex ?? null
            };
            return Object.assign(node, buildConfigStatePatch(node, {
                defaults: config.defaults,
                values: config.values,
                touchUpdatedAt: true
            }));
        }

        return { buildConfigNode, buildConfigStatePatch };
    }

    window.SimpAICanvasWorkbenchConfigNodeFactory = Object.assign({}, window.SimpAICanvasWorkbenchConfigNodeFactory || {}, {
        createCanvasConfigNodeFactoryController
    });
})();
