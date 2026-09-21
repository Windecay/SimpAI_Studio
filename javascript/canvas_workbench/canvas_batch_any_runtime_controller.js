(function () {
    'use strict';

    function createCanvasBatchAnyRuntimeController(context) {
        const scope = context?.batchAnyRuntimeSource || context || {};
        const projectSource = scope.projectSource || {};
        const nodeSource = scope.nodeSource || {};
        const batchSource = scope.batchSource || {};
        const runSource = scope.runSource || {};
        const patchSource = scope.patchSource || {};
        const identitySource = scope.identitySource || {};
        const serializationSource = scope.serializationSource || {};
        const timeSource = scope.timeSource || {};
        const languageSource = scope.languageSource || {};
        const renderSource = scope.renderSource || {};
        const selectionSource = scope.selectionSource || {};
        const uiSource = scope.uiSource || {};

        const call = (sourceObject, name, fallback, ...args) => typeof sourceObject?.[name] === 'function'
            ? sourceObject[name](...args)
            : fallback;
        const getProject = () => call(projectSource, 'getProject', {}) || {};
        const getNode = (id) => call(nodeSource, 'getNode', null, id);
        const applyProjectPatch = (patch) => call(projectSource, 'applyProjectPatch', undefined, patch);
        const batchAnyTargets = (node) => call(batchSource, 'batchAnyTargets', [], node) || [];
        const applyBatchAnyStatePatch = (node, options) => call(
            batchSource,
            'applyBatchAnyStatePatch',
            undefined,
            node,
            options
        );
        const setBatchAnyCurrentItem = (node, index, options) => call(
            batchSource,
            'setBatchAnyCurrentItem',
            null,
            node,
            index,
            options
        );
        const runPresetNode = (...args) => call(
            runSource,
            'runPresetNode',
            Promise.resolve({ ok: false, error: 'preset runtime unavailable' }),
            ...args
        );
        const buildBatchAnyJob = (...args) => call(patchSource, 'buildBatchAnyJob', {}, ...args);
        const buildProjectBatchJobAppendPatch = (...args) => call(
            patchSource,
            'buildProjectBatchJobAppendPatch',
            {},
            ...args
        );
        const buildBatchJobRunIdsPatch = (...args) => call(patchSource, 'buildBatchJobRunIdsPatch', {}, ...args);
        const buildBatchJobFailurePatch = (...args) => call(patchSource, 'buildBatchJobFailurePatch', {}, ...args);
        const buildBatchJobCompletionPatch = (...args) => call(patchSource, 'buildBatchJobCompletionPatch', {}, ...args);
        const buildResultAssetPatch = (...args) => call(patchSource, 'buildResultAssetPatch', {}, ...args);
        const buildResultBatchMetadataPatch = (...args) => call(patchSource, 'buildResultBatchMetadataPatch', {}, ...args);
        const uid = (prefix) => call(identitySource, 'uid', '', prefix);
        const cloneRunValue = (value, fallback) => call(serializationSource, 'cloneRunValue', fallback, value, fallback);
        const nowIso = () => call(timeSource, 'nowIso', '');
        const t = (english, chinese) => call(languageSource, 't', chinese || english, english, chinese);
        const mutate = (...args) => call(renderSource, 'mutate', undefined, ...args);
        const getSelectedNodeId = () => call(selectionSource, 'getSelectedNodeId', '');
        const setSelection = (...args) => call(selectionSource, 'setSelection', undefined, ...args);
        const showToast = (...args) => call(uiSource, 'showToast', undefined, ...args);

        function batchAnyResultTitle(node) {
            return `${node?.title || t('Batch Any', '批量素材')} ${t('Result', '结果')}`;
        }

        function batchAnyResultAssetsFromResponse(result) {
            const response = result?.result || result?.response || {};
            if (Array.isArray(response.assets) && response.assets.length) return cloneRunValue(response.assets, []);
            if (response.asset) return [cloneRunValue(response.asset, {})];
            return [];
        }

        async function runBatchAnyNode(node, options) {
            if (!node || node.type !== 'batch_any') return { ok: false, error: 'batch node not found' };
            const opts = options || {};
            const items = Array.isArray(node.items) ? node.items : [];
            if (!items.length) {
                showToast(t('Import files before running Batch Any.', '请先导入素材再运行 Batch Any。'));
                return { ok: false, error: 'no batch items' };
            }
            const target = batchAnyTargets(node)[0];
            if (!target?.node) {
                showToast(t('Connect Batch Any to a preset input first.', '请先把 Batch Any 连接到 preset 输入槽。'));
                return { ok: false, error: 'no target preset' };
            }
            const indexes = opts.currentOnly
                ? [Number(node.current_index || 0)]
                : items.map((_, index) => index);
            const jobId = uid('batch_any_job');
            applyBatchAnyStatePatch(node, {
                batchPatch: {
                    state: 'running',
                    job_id: jobId,
                    target_node_id: target.node.id,
                    target_slot: target.slot,
                    current: 0,
                    total: indexes.length,
                    run_ids: [],
                    last_error: ''
                }
            });
            const project = getProject();
            applyProjectPatch(buildProjectBatchJobAppendPatch(project, buildBatchAnyJob({
                jobId,
                sourceNodeId: node.id,
                targetNodeId: target.node.id,
                targetSlot: target.slot,
                itemIds: indexes.map(index => items[index]?.id || '')
            })));
            mutate({ inspector: true });
            const currentProject = getProject();
            const job = (currentProject.batch_jobs || []).find(entry => entry.id === jobId);
            const results = [];
            let batchResultNode = null;
            let batchAssets = [];
            for (let order = 0; order < indexes.length; order += 1) {
                const index = indexes[order];
                const item = setBatchAnyCurrentItem(node, index, { render: false });
                if (!item) continue;
                applyBatchAnyStatePatch(node, {
                    batchPatch: {
                        current: order + 1,
                        active_item_id: item.id,
                        active_item_name: item.name || ''
                    }
                });
                mutate({ inspector: getSelectedNodeId() === node.id });
                const result = await runPresetNode(target.node, {
                    resultNode: batchResultNode,
                    reuseExistingResult: !!batchResultNode,
                    skipInputPreflight: true,
                    initialDelayMs: 900
                });
                results.push(result);
                const runId = result?.result?.run_id
                    || getNode(result?.result_node_id)?.producer?.run_id
                    || '';
                if (runId) {
                    const runIds = Array.isArray(node.batch?.run_ids)
                        ? node.batch.run_ids.concat([runId])
                        : [runId];
                    applyBatchAnyStatePatch(node, { batchPatch: { run_ids: runIds } });
                    if (job) Object.assign(job, buildBatchJobRunIdsPatch(job, runId));
                }
                const resultNode = getNode(result?.result_node_id);
                if (resultNode) {
                    if (!batchResultNode) batchResultNode = resultNode;
                    const newAssets = batchAnyResultAssetsFromResponse(result);
                    const assetIndex = batchAssets.length;
                    if (newAssets.length) {
                        batchAssets = batchAssets.concat(cloneRunValue(newAssets, []));
                        Object.assign(resultNode, buildResultAssetPatch(resultNode, {
                            assets: batchAssets,
                            selectedAssetIndex: assetIndex,
                            asset: batchAssets[assetIndex]
                        }));
                    }
                    Object.assign(resultNode, buildResultBatchMetadataPatch(resultNode, {
                        title: batchAnyResultTitle(node),
                        batchJobId: jobId,
                        batchNodeId: node.id,
                        batchItemId: item.id || resultNode.batch_item_id || '',
                        batchIndex: index,
                        batchItemName: item.name || resultNode.batch_item_name || '',
                        gridRole: 'batch_result'
                    }));
                }
                if (!result?.ok && node.params?.stop_on_error !== false) {
                    const error = result?.error || t('Batch item failed.', '批量素材运行失败。');
                    applyBatchAnyStatePatch(node, { batchPatch: { last_error: error } });
                    if (job) Object.assign(job, buildBatchJobFailurePatch());
                    break;
                }
            }
            const failed = results.find(result => !result?.ok);
            const finalState = failed ? 'failed' : 'finished';
            applyBatchAnyStatePatch(node, {
                batchPatch: {
                    state: finalState,
                    finished_at: nowIso()
                }
            });
            if (job) Object.assign(job, buildBatchJobCompletionPatch(node.batch?.state || finalState));
            if (batchResultNode) setSelection(batchResultNode);
            mutate({ inspector: true });
            showToast(failed
                ? t('Batch Any stopped with an error.', 'Batch Any 因错误停止。')
                : t('Batch Any finished.', 'Batch Any 已完成。'));
            return { ok: !failed, results, job_id: jobId };
        }

        return {
            batchAnyResultTitle,
            batchAnyResultAssetsFromResponse,
            runBatchAnyNode
        };
    }

    window.SimpAICanvasWorkbenchBatchAnyRuntime = Object.assign({}, window.SimpAICanvasWorkbenchBatchAnyRuntime || {}, {
        createCanvasBatchAnyRuntimeController
    });
})();
