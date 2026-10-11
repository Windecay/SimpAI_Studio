(function () {
    'use strict';

    function createCanvasXyzMatrixNodeFactoryController(context) {
        const scope = context?.xyzMatrixNodeFactorySource || context || {};
        const identitySource = scope.identitySource || {};
        const timeSource = scope.timeSource || {};
        const languageSource = scope.languageSource || {};
        const layoutSource = scope.layoutSource || {};
        const serializationSource = scope.serializationSource || {};
        const scriptSource = scope.scriptSource || {};
        const uid = typeof identitySource.uid === 'function' ? identitySource.uid : (type) => `${type}-node`;
        const t = typeof languageSource.t === 'function' ? languageSource.t : ((en, cn) => cn || en);
        const defaultNodeSize = typeof layoutSource.defaultNodeSize === 'function'
            ? layoutSource.defaultNodeSize
            : () => ({ w: 700, h: 520 });
        const cloneRunValue = typeof serializationSource.cloneRunValue === 'function'
            ? serializationSource.cloneRunValue
            : ((value, fallback) => JSON.parse(JSON.stringify(value ?? fallback)));
        const nowIso = typeof timeSource.nowIso === 'function'
            ? timeSource.nowIso
            : () => '';
        const defaultScript = scriptSource.script || '';

        function objectOrEmpty(value) {
            return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
        }

        function buildXyzMatrixStatePatch(node, options) {
            const config = options || {};
            const defaults = {
                script: defaultScript,
                source_node_id: '',
                axes: [],
                axis_options: [],
                options: {},
                grid: {},
                variants: [],
                processing_order: [],
                selected_variant_ids: [],
                created_at: ''
            };
            const statePatch = objectOrEmpty(config.statePatch);
            const xyz = Object.assign(
                {},
                cloneRunValue(defaults, {}),
                cloneRunValue(node?.xyz, {}),
                cloneRunValue(statePatch, {})
            );
            if (Object.prototype.hasOwnProperty.call(config, 'selectedVariantIds')) {
                xyz.selected_variant_ids = cloneRunValue(config.selectedVariantIds, []);
            }
            return { xyz: cloneRunValue(xyz, {}) };
        }

        function buildXyzMatrixNode(options) {
            const config = options || {};
            const source = config.source || {};
            const preview = config.preview || {};
            const grid = preview.grid || {};
            const isXyz = Number(grid.z_count || 1) > 1;
            const type = isXyz ? 'xyz_matrix' : 'xy_matrix';
            const size = defaultNodeSize(type) || { w: 700, h: 520 };
            const position = config.position || { x: 0, y: 0 };
            const jobId = uid('batch_xyz');

            return {
                id: uid(type),
                type,
                x: position.x,
                y: position.y,
                w: size.w,
                h: size.h,
                title: t('Parameter Comparison', '参数对比'),
                batch_job_id: jobId,
                source_node_id: source.id,
                status: { state: 'planned', message: t('Preview ready', '预览已生成') },
                xyz: {
                    script: config.script || defaultScript,
                    source_node_id: source.id,
                    axes: cloneRunValue(preview.axes || [], []),
                    axis_options: cloneRunValue(preview.axis_options || [], []),
                    options: cloneRunValue(preview.options || {}, {}),
                    grid: cloneRunValue(grid, {}),
                    variants: cloneRunValue(preview.variants || [], []),
                    processing_order: cloneRunValue(preview.processing_order || [], []),
                    selected_variant_ids: [],
                    created_at: nowIso()
                }
            };
        }

        function buildXyzExecutionPreset(options) {
            const { source, matrix, variant, position } = options || {};
            if (!source || !matrix || !variant) return null;
            const node = cloneRunValue(source, {});
            Object.assign(node, {
                id: uid(source.type), title: `${source.title || source.preset?.name || 'Preset'} / ${variant.id}`,
                x: position?.x || 0, y: position?.y || 0, collapsed: true, status: 'idle',
                source: { kind: 'parameter_comparison', comparison_node_id: matrix.id,
                    comparison_variant_id: variant.id, comparison_source_id: source.id }
            });
            const patch = objectOrEmpty(variant.node_patch);
            node.params = Object.assign({}, node.params || {}, cloneRunValue(patch.params || {}, {}));
            for (const key of ['models_config', 'generation_config', 'resolution_config', 'styles_config']) {
                const overrides = objectOrEmpty(patch[key]?.overrides);
                if (!Object.keys(overrides).length) continue;
                node[key] = Object.assign({}, node[key] || {}, {
                    mode: 'custom', source_node_id: null,
                    overrides: Object.assign({}, node[key]?.overrides || {}, cloneRunValue(overrides, {}))
                });
            }
            delete node._last_wildcard_preview;
            return node;
        }

        return { buildXyzMatrixNode, buildXyzMatrixStatePatch, buildXyzExecutionPreset };
    }

    window.SimpAICanvasWorkbenchXyzMatrixNodeFactory = Object.assign({}, window.SimpAICanvasWorkbenchXyzMatrixNodeFactory || {}, {
        createCanvasXyzMatrixNodeFactoryController
    });
})();
