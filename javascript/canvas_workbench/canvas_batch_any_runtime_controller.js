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

        const activeBatches = new WeakMap();

        async function runBatchAnyNode(node, options) {
            if (!node || node.type !== 'batch_any') return { ok: false, error: 'batch node not found' };
            const project = getProject();
            const stale = () => ({ ok: false, stale: true, error: 'batch no longer current' });
            if (getNode(node.id) !== node) return stale();
            if (activeBatches.get(node)?.isCurrent()) return { ok: false, error: 'batch already running' };
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
            let job = null;
            const operation = {};
            const isCurrent = () => getProject() === project
                && getNode(node.id) === node
                && getNode(target.node.id) === target.node
                && activeBatches.get(node) === operation
                && node.batch?.job_id === jobId
                && (!job || (project.batch_jobs || []).includes(job));
            operation.isCurrent = isCurrent;
            activeBatches.set(node, operation);
            const results = [];
            let batchResultNode = null;
            let batchAssets = [];
            let canceled = false;
            const finish = () => {
                if (!isCurrent()) return stale();
                const failed = results.find(result => !result?.ok);
                const finalState = canceled ? 'canceled' : (failed ? 'failed' : 'finished');
                applyBatchAnyStatePatch(node, {
                    batchPatch: {
                        state: finalState,
                        last_error: failed?.error || (failed && !canceled ? t('Batch item failed.', '批量素材运行失败。') : ''),
                        finished_at: nowIso()
                    }
                });
                if (job) Object.assign(job, buildBatchJobCompletionPatch(finalState));
                if (batchResultNode && getNode(batchResultNode.id) === batchResultNode) setSelection(batchResultNode);
                mutate({ inspector: true });
                showToast(canceled
                    ? t('Batch Any canceled.', 'Batch Any 已取消。')
                    : (failed ? t('Batch Any stopped with an error.', 'Batch Any 因错误停止。')
                        : t('Batch Any finished.', 'Batch Any 已完成。')));
                return { ok: !failed && !canceled, results, job_id: jobId };
            };
            try {
                applyBatchAnyStatePatch(node, {
                    batchPatch: {
                        state: 'running', job_id: jobId, target_node_id: target.node.id,
                        target_slot: target.slot, current: 0, total: indexes.length,
                        run_ids: [], last_error: ''
                    }
                });
                applyProjectPatch(buildProjectBatchJobAppendPatch(project, buildBatchAnyJob({
                    jobId, sourceNodeId: node.id, targetNodeId: target.node.id,
                    targetSlot: target.slot, itemIds: indexes.map(index => items[index]?.id || '')
                })));
                job = (project.batch_jobs || []).find(entry => entry.id === jobId);
                mutate({ inspector: true });
                for (let order = 0; order < indexes.length; order += 1) {
                    if (!isCurrent()) return stale();
                    const index = indexes[order];
                    const item = setBatchAnyCurrentItem(node, index, { render: false });
                    if (!item) continue;
                    applyBatchAnyStatePatch(node, {
                        batchPatch: { current: order + 1, active_item_id: item.id, active_item_name: item.name || '' }
                    });
                    mutate({ inspector: getSelectedNodeId() === node.id });
                    const result = await runPresetNode(target.node, {
                        resultNode: batchResultNode,
                        reuseExistingResult: !!batchResultNode,
                        skipInputPreflight: true,
                        initialDelayMs: 900,
                        shouldContinue: isCurrent
                    });
                    if (!isCurrent()) return stale();
                    const resultNode = getNode(result?.result_node_id);
                    const response = result?.result || result?.response || {};
                    const runId = result?.run_id || response.run_id || '';
                    const runToken = result?.run_token || response.run_token || '';
                    const obsolete = result?.stale || result?.error === 'run no longer current'
                        || (result?.result_node_id && (!resultNode
                            || (batchResultNode?.id === resultNode.id && resultNode !== batchResultNode)
                            || (runId && resultNode.producer?.run_id !== runId)
                            || (runToken && (resultNode.producer?.pending_run_token || resultNode.producer?.run_token) !== runToken)));
                    if (obsolete) {
                        results.push({ ok: false, error: t('Batch result is no longer current.', '批量运行的结果任务已变更。') });
                        batchResultNode = null;
                        break;
                    }
                    results.push(result);
                    const currentRunId = runId || resultNode?.producer?.run_id || '';
                    if (currentRunId) {
                        const runIds = (Array.isArray(node.batch?.run_ids) ? node.batch.run_ids : []).concat([currentRunId]);
                        applyBatchAnyStatePatch(node, { batchPatch: { run_ids: runIds } });
                        if (job) Object.assign(job, buildBatchJobRunIdsPatch(job, currentRunId));
                    }
                    if (resultNode) {
                        if (!batchResultNode) batchResultNode = resultNode;
                        const newAssets = batchAnyResultAssetsFromResponse(result);
                        const assetIndex = batchAssets.length;
                        if (newAssets.length) {
                            batchAssets = batchAssets.concat(cloneRunValue(newAssets, []));
                            Object.assign(resultNode, buildResultAssetPatch(resultNode, {
                                assets: batchAssets, selectedAssetIndex: assetIndex, asset: batchAssets[assetIndex]
                            }));
                        }
                        Object.assign(resultNode, buildResultBatchMetadataPatch(resultNode, {
                            title: batchAnyResultTitle(node), batchJobId: jobId, batchNodeId: node.id,
                            batchItemId: item.id || resultNode.batch_item_id || '', batchIndex: index,
                            batchItemName: item.name || resultNode.batch_item_name || '', gridRole: 'batch_result'
                        }));
                    }
                    canceled = !!result?.cancelled || ['canceled', 'cancelled'].includes(result?.state || response.state);
                    if (canceled || (!result?.ok && node.params?.stop_on_error !== false)) break;
                }
                return finish();
            } catch (err) {
                if (!isCurrent()) return stale();
                results.push({ ok: false, error: err?.message || String(err) });
                if (job) Object.assign(job, buildBatchJobFailurePatch());
                return finish();
            } finally {
                if (activeBatches.get(node) === operation) activeBatches.delete(node);
            }
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
