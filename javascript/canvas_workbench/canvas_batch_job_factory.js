(function () {
    'use strict';

    function createCanvasBatchJobFactoryController(context) {
        const scope = context || {};
        const cloneRunValue = typeof scope.cloneRunValue === 'function'
            ? scope.cloneRunValue
            : ((value, fallback) => value ?? fallback);
        const nowIso = typeof scope.nowIso === 'function'
            ? scope.nowIso
            : (() => new Date().toISOString());
        const defaultXyzScript = scope.xyzScript || '';

        function buildXyzBatchJob(options) {
            const config = options || {};
            return {
                id: config.jobId,
                script: config.script || defaultXyzScript,
                source_node_id: config.sourceNodeId,
                axes: cloneRunValue(config.axes || [], []),
                options: cloneRunValue(config.options || {}, {}),
                variants: cloneRunValue(config.variants || [], []),
                run_ids: [],
                matrix_node_id: config.matrixNodeId,
                status: 'planned',
                job_payload: cloneRunValue(config.jobPayload || {}, {}),
                created_at: nowIso(),
                updated_at: nowIso()
            };
        }

        function buildBatchAnyJob(options) {
            const config = options || {};
            return {
                id: config.jobId,
                script: 'Batch Any',
                source_node_id: config.sourceNodeId,
                target_node_id: config.targetNodeId,
                target_slot: config.targetSlot,
                item_ids: cloneRunValue(config.itemIds || [], []),
                run_ids: [],
                status: 'running',
                created_at: nowIso(),
                updated_at: nowIso()
            };
        }

        function buildBatchJobStatePatch(job, options) {
            const config = options || {};
            const previous = job || {};
            const index = Number(config.index);
            const fallbackId = config.fallbackId || (Number.isInteger(index) && index >= 0 ? `batch_${index + 1}` : '');
            return {
                id: previous.id || fallbackId,
                script: previous.script || config.defaultScript || 'X/Y/Z plot',
                axes: Array.isArray(previous.axes) ? cloneRunValue(previous.axes, []) : [],
                variants: Array.isArray(previous.variants) ? cloneRunValue(previous.variants, []) : [],
                run_ids: Array.isArray(previous.run_ids) ? cloneRunValue(previous.run_ids, []) : [],
                status: previous.status || config.defaultStatus || 'planned'
            };
        }

        function buildBatchJobRunIdsPatch(job, runId) {
            const previous = job || {};
            const runIds = Array.isArray(previous.run_ids) ? previous.run_ids : [];
            return { run_ids: runIds.concat([runId]) };
        }

        function buildBatchJobFailurePatch() {
            return { status: 'failed' };
        }

        function buildBatchJobCompletionPatch(status) {
            return {
                status,
                updated_at: nowIso()
            };
        }

        return {
            buildXyzBatchJob,
            buildBatchAnyJob,
            buildBatchJobStatePatch,
            buildBatchJobRunIdsPatch,
            buildBatchJobFailurePatch,
            buildBatchJobCompletionPatch
        };
    }

    window.SimpAICanvasWorkbenchBatchJobFactory = Object.assign({}, window.SimpAICanvasWorkbenchBatchJobFactory || {}, {
        createCanvasBatchJobFactoryController
    });
})();
