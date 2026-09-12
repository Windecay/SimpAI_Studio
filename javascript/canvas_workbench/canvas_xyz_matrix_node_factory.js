(function () {
    'use strict';

    function createCanvasXyzMatrixNodeFactoryController(context) {
        const scope = context || {};
        const uid = typeof scope.uid === 'function' ? scope.uid : (type) => `${type}-node`;
        const t = typeof scope.t === 'function' ? scope.t : ((en, cn) => cn || en);
        const defaultNodeSize = typeof scope.defaultNodeSize === 'function'
            ? scope.defaultNodeSize
            : () => ({ w: 700, h: 520 });
        const cloneRunValue = typeof scope.cloneRunValue === 'function'
            ? scope.cloneRunValue
            : ((value, fallback) => value ?? fallback);
        const nowIso = typeof scope.nowIso === 'function'
            ? scope.nowIso
            : (() => new Date().toISOString());
        const defaultScript = scope.script || '';

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
                title: isXyz ? t('X/Y/Z Matrix', 'X/Y/Z 矩阵') : t('X/Y Matrix', 'X/Y 矩阵'),
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

        return { buildXyzMatrixNode, buildXyzMatrixStatePatch };
    }

    window.SimpAICanvasWorkbenchXyzMatrixNodeFactory = Object.assign({}, window.SimpAICanvasWorkbenchXyzMatrixNodeFactory || {}, {
        createCanvasXyzMatrixNodeFactoryController
    });
})();
