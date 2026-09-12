(function () {
    'use strict';

    function createCanvasResultNodeFactoryController(context) {
        const scope = context || {};
        const uid = typeof scope.uid === 'function' ? scope.uid : (type) => `${type}-node`;
        const t = typeof scope.t === 'function' ? scope.t : ((en, cn) => cn || en);
        const cloneRunValue = typeof scope.cloneRunValue === 'function'
            ? scope.cloneRunValue
            : ((value, fallback) => {
                try {
                    return JSON.parse(JSON.stringify(value ?? fallback));
                } catch (err) {
                    return fallback;
                }
            });
        const nowIso = typeof scope.nowIso === 'function'
            ? scope.nowIso
            : (() => new Date().toISOString());
        const defaultResultNodeSize = typeof scope.defaultResultNodeSize === 'function'
            ? scope.defaultResultNodeSize
            : () => ({ w: 360, h: 460 });

        function mergeResultObject(previous, next) {
            return Object.assign(
                {},
                previous && typeof previous === 'object' ? cloneRunValue(previous, {}) : {},
                next && typeof next === 'object' ? cloneRunValue(next, {}) : {}
            );
        }

        function buildResultStatusPatch(resultNode, options) {
            const config = options || {};
            const hasOwn = (key) => Object.prototype.hasOwnProperty.call(config, key);
            const isRecord = (value) => value && typeof value === 'object' && !Array.isArray(value);
            const cloneRecord = (value) => isRecord(value) ? cloneRunValue(value, {}) : {};
            let status = hasOwn('status') ? cloneRecord(config.status) : cloneRecord(resultNode?.status);
            if (hasOwn('state')) status.state = cloneRunValue(config.state, '');
            if (hasOwn('message')) status.message = cloneRunValue(config.message, '');
            if (isRecord(config.statusPatch)) Object.assign(status, cloneRunValue(config.statusPatch, {}));
            (Array.isArray(config.deleteKeys) ? config.deleteKeys : []).forEach((key) => {
                const name = String(key || '').trim();
                if (name) delete status[name];
            });
            return { status: cloneRunValue(status, {}) };
        }

        function buildResultAssetPatch(resultNode, options) {
            const config = options || {};
            const patch = {};
            if (Object.prototype.hasOwnProperty.call(config, 'asset')) {
                patch.asset = cloneRunValue(config.asset, null);
            }
            if (Object.prototype.hasOwnProperty.call(config, 'assets')) {
                patch.assets = cloneRunValue(config.assets, []);
            }
            if (Object.prototype.hasOwnProperty.call(config, 'selectedAssetIndex')) {
                patch.selected_asset_index = config.selectedAssetIndex;
            }
            if (Object.prototype.hasOwnProperty.call(config, 'mask')) {
                patch.mask = cloneRunValue(config.mask, null);
            }
            return patch;
        }

        function buildResultSelectedAssetMetadataPatch(resultNode, options) {
            if (!resultNode || typeof resultNode !== 'object') return {};
            const config = options || {};
            const metadata = config.metadata && typeof config.metadata === 'object' && !Array.isArray(config.metadata)
                ? cloneRunValue(config.metadata, {})
                : {};
            if (!Object.keys(metadata).length) return {};
            const assets = Array.isArray(resultNode.assets) ? cloneRunValue(resultNode.assets, []) : [];
            const rawIndex = Number(resultNode.selected_asset_index || 0);
            const safeIndex = Number.isFinite(rawIndex)
                ? Math.max(0, Math.min(Math.floor(rawIndex), Math.max(assets.length - 1, 0)))
                : 0;
            const selected = assets.length ? assets[safeIndex] : resultNode.asset;
            if (!selected || typeof selected !== 'object' || Array.isArray(selected)) return {};
            const updated = Object.assign({}, cloneRunValue(selected, {}), metadata);
            const patch = { asset: cloneRunValue(updated, {}) };
            if (assets.length) {
                assets[safeIndex] = updated;
                patch.assets = assets;
            }
            return patch;
        }

        function buildResultPreviewPatch(resultNode, options) {
            const config = options || {};
            const patch = {};
            if (Object.prototype.hasOwnProperty.call(config, 'preview')) {
                patch.preview = cloneRunValue(config.preview, null);
            }
            if (Object.prototype.hasOwnProperty.call(config, 'previewFrames')) {
                patch.preview_frames = config.previewFrames === null
                    ? null
                    : (Array.isArray(config.previewFrames) ? cloneRunValue(config.previewFrames, []) : []);
            }
            if (Object.prototype.hasOwnProperty.call(config, 'previewStepKey')) {
                patch.preview_step_key = String(config.previewStepKey ?? '');
            }
            return patch;
        }

        function buildResultProducerPatch(resultNode, producerPatch) {
            return {
                producer: mergeResultObject(resultNode?.producer, cloneRunValue(producerPatch || {}, {}))
            };
        }

        function buildResultSourcePatch(resultNode, sourcePatch) {
            return {
                source: mergeResultObject(resultNode?.source, cloneRunValue(sourcePatch || {}, {}))
            };
        }

        function buildCanvasAgentReservedResultSource(options) {
            const config = options || {};
            return {
                kind: 'canvas_agent_reserved_result',
                preset_node_id: config.presetNodeId || '',
                tool: config.tool || '',
                created_at: config.createdAt || nowIso(),
                refreshing: false,
                stale: false,
                stale_reason: ''
            };
        }

        function buildTimelineResultPatch(resultNode, options) {
            const config = options || {};
            const patch = {};
            if (config.size && typeof config.size === 'object') {
                if (config.size.w !== undefined) patch.w = config.size.w;
                if (config.size.h !== undefined) patch.h = config.size.h;
            }
            if (Object.prototype.hasOwnProperty.call(config, 'producerPatch')) {
                patch.producer = mergeResultObject(resultNode?.producer, cloneRunValue(config.producerPatch || {}, {}));
            }
            if (Object.prototype.hasOwnProperty.call(config, 'statusPatch')) {
                patch.status = mergeResultObject(resultNode?.status, cloneRunValue(config.statusPatch || {}, {}));
            }
            if (Object.prototype.hasOwnProperty.call(config, 'source')) {
                patch.source = cloneRunValue(config.source, {});
            } else if (Object.prototype.hasOwnProperty.call(config, 'sourcePatch')) {
                Object.assign(patch, buildResultSourcePatch(resultNode, config.sourcePatch));
            }
            Object.assign(patch, buildResultPreviewPatch(resultNode, config));
            Object.assign(patch, buildResultAssetPatch(resultNode, config));
            if (Object.prototype.hasOwnProperty.call(config, 'errorDetails')) {
                patch.error_details = cloneRunValue(config.errorDetails, null);
            }
            return patch;
        }

        function buildResultRunMetadataPatch(resultNode, options) {
            const config = options || {};
            const response = config.response || {};
            const previousProducer = resultNode?.producer || {};
            const ok = config.ok !== undefined ? !!config.ok : !!response.ok;
            const producer = mergeResultObject(previousProducer, config.producerPatch || {});
            producer.run_id = config.runId || previousProducer.run_id || null;
            producer.task_id = config.taskId || response.task_id || previousProducer.task_id || null;
            const patch = {
                producer,
                error_details: ok ? null : {
                    error: config.error || response.error || 'unknown error',
                    details: config.details ?? response.details ?? '',
                    errors: cloneRunValue(config.errors !== undefined ? config.errors : (response.errors || []), [])
                }
            };
            const events = config.events !== undefined ? config.events : response.events;
            if (Array.isArray(events)) patch.run_events = cloneRunValue(events, []);
            return patch;
        }

        function buildResultOutputPatch(resultNode, options) {
            const config = options || {};
            const previousSource = resultNode?.source || {};
            const previousProducer = resultNode?.producer || {};
            const completedFingerprint = config.completedFingerprint
                || previousProducer.pending_fingerprint
                || previousSource.pending_fingerprint
                || previousProducer.fingerprint
                || previousSource.input_fingerprint
                || '';
            const currentRunToken = previousSource.pending_run_token
                || previousProducer.pending_run_token
                || previousProducer.run_token
                || '';
            const source = mergeResultObject(previousSource, config.sourcePatch || {});
            Object.assign(source, {
                kind: config.kind || previousSource.kind || '',
                output_path: config.outputPath || '',
                input_fingerprint: completedFingerprint,
                current_fingerprint: completedFingerprint,
                pending_fingerprint: '',
                current_run_token: currentRunToken,
                pending_run_token: '',
                refreshing: false,
                stale: false,
                stale_reason: ''
            });
            const producer = mergeResultObject(previousProducer, config.producerPatch || {});
            Object.assign(producer, {
                fingerprint: completedFingerprint,
                pending_fingerprint: '',
                pending_run_token: '',
                refreshing: false,
                stale: false
            });
            return { source, producer };
        }

        function buildResultRefreshPreparingPatch(resultNode, options) {
            const config = options || {};
            const previousSource = resultNode?.source || {};
            const previousProducer = resultNode?.producer || {};
            const inputFingerprint = config.inputFingerprint ?? '';
            const runToken = config.runToken ?? '';
            const producer = mergeResultObject(previousProducer, config.producerPatch || {});
            if (config.presetNodeId !== undefined) producer.preset_node_id = config.presetNodeId;
            if (config.runId !== undefined) producer.run_id = config.runId;
            if (config.runToken !== undefined) producer.run_token = runToken;
            Object.assign(producer, {
                pending_run_token: runToken,
                pending_fingerprint: inputFingerprint,
                refreshing: true,
                stale: false
            });
            const source = mergeResultObject(previousSource, config.sourcePatch || {});
            Object.assign(source, {
                current_fingerprint: inputFingerprint,
                pending_fingerprint: inputFingerprint,
                pending_run_token: runToken,
                refreshing: true,
                stale: false,
                stale_reason: ''
            });
            const patch = { producer, source };
            if (Object.prototype.hasOwnProperty.call(config, 'errorDetails')) {
                patch.error_details = cloneRunValue(config.errorDetails, null);
            }
            return patch;
        }

        function buildResultRefreshReconciledPatch(resultNode) {
            return {
                source: buildResultSourcePatch(resultNode, {
                    pending_fingerprint: '',
                    pending_run_token: '',
                    refreshing: false
                }).source,
                producer: buildResultProducerPatch(resultNode, {
                    pending_fingerprint: '',
                    pending_run_token: '',
                    refreshing: false
                }).producer
            };
        }

        function buildResultRefreshClearedPatch(resultNode, options) {
            const config = options || {};
            const hasOldAsset = config.hasOldAsset !== undefined ? !!config.hasOldAsset : !!resultNode?.asset;
            const oldFingerprint = resultNode?.source?.input_fingerprint || resultNode?.producer?.fingerprint || '';
            const currentFingerprint = config.currentFingerprint
                || resultNode?.source?.current_fingerprint
                || oldFingerprint;
            const stale = hasOldAsset
                && !!currentFingerprint
                && !!oldFingerprint
                && currentFingerprint !== oldFingerprint;
            return {
                source: buildResultSourcePatch(resultNode, {
                    pending_fingerprint: '',
                    pending_run_token: '',
                    refreshing: false,
                    current_fingerprint: currentFingerprint,
                    stale,
                    stale_reason: stale ? 'producer_fingerprint_changed' : ''
                }).source,
                producer: buildResultProducerPatch(resultNode, {
                    pending_fingerprint: '',
                    pending_run_token: '',
                    refreshing: false,
                    stale
                }).producer
            };
        }

        function buildResultRefreshFailurePatch(resultNode) {
            const oldFingerprint = resultNode?.source?.input_fingerprint || resultNode?.producer?.fingerprint || '';
            const stale = !!resultNode?.asset;
            return {
                source: buildResultSourcePatch(resultNode, {
                    pending_fingerprint: '',
                    pending_run_token: '',
                    refreshing: false,
                    current_fingerprint: resultNode?.source?.current_fingerprint
                        || resultNode?.producer?.pending_fingerprint
                        || oldFingerprint,
                    stale,
                    stale_reason: stale ? 'producer_refresh_failed' : ''
                }).source,
                producer: buildResultProducerPatch(resultNode, {
                    pending_fingerprint: '',
                    pending_run_token: '',
                    refreshing: false,
                    stale
                }).producer
            };
        }

        function buildResultStaleStatePatch(resultNode, options) {
            const config = options || {};
            const stale = !!config.stale;
            return {
                source: buildResultSourcePatch(resultNode, {
                    stale,
                    stale_reason: stale ? 'producer_fingerprint_changed' : '',
                    current_fingerprint: config.currentFingerprint
                        || resultNode?.source?.current_fingerprint
                        || ''
                }).source,
                producer: buildResultProducerPatch(resultNode, { stale }).producer
            };
        }

        function buildResultFingerprintPatch(resultNode, currentFingerprint) {
            return {
                source: buildResultSourcePatch(resultNode, {
                    input_fingerprint: currentFingerprint || '',
                    current_fingerprint: currentFingerprint || '',
                    stale: false,
                    stale_reason: ''
                }).source,
                producer: buildResultProducerPatch(resultNode, {
                    fingerprint: currentFingerprint || '',
                    stale: false
                }).producer
            };
        }

        function buildResultDryRunSourcePatch(resultNode, response) {
            return buildResultSourcePatch(resultNode, {
                dry_run: cloneRunValue(response || {}, {})
            });
        }

        function buildResultManualReplacementPatch(resultNode, options) {
            const config = options || {};
            return buildResultSourcePatch(resultNode, {
                kind: config.kind || 'manual_output'
            });
        }

        function buildResultMaterializationPatch(resultNode, options) {
            const config = options || {};
            const assetRef = config.assetRef || {};
            const patch = buildResultSourcePatch(resultNode, {
                materialized_asset_id: config.assetId || assetRef.asset_id || '',
                materialized_path: config.path || assetRef.path || '',
                materialized_at: config.materializedAt || nowIso()
            });
            if (Object.prototype.hasOwnProperty.call(config, 'asset')) {
                const asset = cloneRunValue(config.asset, null);
                (Array.isArray(config.deleteAssetKeys) ? config.deleteAssetKeys : []).forEach((key) => {
                    const name = String(key || '').trim();
                    if (name && asset && typeof asset === 'object') delete asset[name];
                });
                patch.asset = cloneRunValue(asset, null);
            }
            return patch;
        }

        function buildResultAssetSelectionPatch(resultNode, asset) {
            const previousSource = resultNode?.source || {};
            const selectedAsset = asset || {};
            return buildResultSourcePatch(resultNode, {
                output_path: selectedAsset.output_path || selectedAsset.path || previousSource.output_path || ''
            });
        }

        function buildResultBatchMetadataPatch(resultNode, options) {
            const config = options || {};
            const patch = {};
            const hasOwn = (key) => Object.prototype.hasOwnProperty.call(config, key);
            if (hasOwn('title')) patch.title = String(config.title ?? '');
            if (hasOwn('batchJobId')) patch.batch_job_id = String(config.batchJobId ?? '');
            if (hasOwn('batchNodeId')) patch.batch_node_id = String(config.batchNodeId ?? '');
            if (hasOwn('batchItemId')) patch.batch_item_id = String(config.batchItemId ?? '');
            if (hasOwn('batchIndex')) patch.batch_index = Number.isFinite(Number(config.batchIndex)) ? Number(config.batchIndex) : 0;
            if (hasOwn('batchItemName')) patch.batch_item_name = String(config.batchItemName ?? '');
            if (hasOwn('gridRole')) patch.grid_role = String(config.gridRole ?? '');
            return patch;
        }

        function buildResultLayoutPatch(resultNode, options) {
            const config = options || {};
            const patch = {};
            const hasOwn = (target, key) => Object.prototype.hasOwnProperty.call(target, key);
            const position = config.position && typeof config.position === 'object' && !Array.isArray(config.position)
                ? config.position
                : null;
            const size = config.size && typeof config.size === 'object' && !Array.isArray(config.size)
                ? config.size
                : null;
            if (hasOwn(config, 'title')) patch.title = String(config.title ?? '');
            if (hasOwn(config, 'x')) patch.x = config.x;
            else if (position && hasOwn(position, 'x')) patch.x = position.x;
            if (hasOwn(config, 'y')) patch.y = config.y;
            else if (position && hasOwn(position, 'y')) patch.y = position.y;
            if (hasOwn(config, 'w')) patch.w = config.w;
            else if (size && hasOwn(size, 'w')) patch.w = size.w;
            if (hasOwn(config, 'h')) patch.h = config.h;
            else if (size && hasOwn(size, 'h')) patch.h = size.h;
            if (hasOwn(config, 'collapsed')) patch.collapsed = !!config.collapsed;
            return patch;
        }

        function buildResultNode(options) {
            const config = options || {};
            const position = config.position || { x: 0, y: 0 };
            const size = config.size || defaultResultNodeSize() || { w: 360, h: 460 };
            const node = {
                id: uid('result'),
                type: 'result',
                x: position.x,
                y: position.y,
                w: size.w,
                h: size.h,
                title: config.title || '',
                producer: config.producer || { preset_node_id: null, run_id: null, task_id: null },
                status: config.status || {
                    state: 'reserved',
                    queue_position: null,
                    step: 0,
                    total_steps: 0,
                    percent: 0,
                    message: ''
                },
                preview: null,
                asset: null
            };
            if (Array.isArray(config.assets)) node.assets = config.assets;
            node.source = config.source || {};
            if (config.collapsed !== undefined) node.collapsed = config.collapsed;
            return node;
        }

        function buildReservedResultNode(options) {
            const config = options || {};
            return buildResultNode({
                position: config.position,
                size: config.size,
                title: config.title,
                producer: config.producer,
                status: {
                    state: 'reserved',
                    queue_position: config.queuePosition ?? null,
                    step: config.step ?? 0,
                    total_steps: config.totalSteps ?? 0,
                    percent: config.percent ?? 0,
                    message: config.message || ''
                },
                source: config.source,
                collapsed: config.collapsed
            });
        }

        function buildQueuedResultNode(options) {
            const config = options || {};
            const status = {
                state: 'queued',
                queue_position: config.queuePosition ?? null,
                percent: config.percent ?? 0,
                message: config.message || ''
            };
            if (config.step !== undefined) status.step = config.step;
            if (config.totalSteps !== undefined) status.total_steps = config.totalSteps;
            return buildResultNode({
                position: config.position,
                size: config.size,
                title: config.title,
                producer: config.producer,
                status,
                assets: config.includeAssets ? [] : undefined,
                source: config.source,
                collapsed: config.collapsed
            });
        }

        function buildDirectorSegmentResultNode(options) {
            const config = options || {};
            return buildResultNode({
                position: config.position,
                size: config.size,
                title: config.title,
                producer: config.producer,
                status: config.status,
                assets: [],
                source: config.source,
                collapsed: false
            });
        }

        function buildTimelineOutputResultNode(options) {
            const config = options || {};
            return buildReservedResultNode({
                position: config.position,
                size: config.size,
                title: config.title,
                producer: config.producer || {
                    preset_node_id: null,
                    timeline_node_id: config.timelineNodeId || null,
                    run_id: null,
                    task_id: null
                },
                message: config.message || '',
                source: config.source || {
                    kind: 'timeline_output',
                    timeline_node_id: config.timelineNodeId || null
                }
            });
        }

        function buildTimelineCompareResultNode(options) {
            const config = options || {};
            const node = buildResultNode({
                position: config.position,
                size: config.size,
                title: config.title,
                producer: config.producer || {
                    preset_node_id: null,
                    timeline_node_id: null,
                    run_id: null,
                    task_id: null
                },
                status: config.status || {
                    state: 'debug',
                    queue_position: null,
                    step: 0,
                    total_steps: 0,
                    percent: 1,
                    message: config.message || ''
                },
                assets: [],
                source: config.source || {
                    kind: 'timeline_frame_compare',
                    timeline_node_id: config.timelineNodeId || null
                }
            });
            if (node) Object.assign(node, buildResultAssetPatch(node, {
                selectedAssetIndex: config.selectedAssetIndex ?? 0
            }));
            return node;
        }

        function buildManualOutputNode(world) {
            const position = world || { x: 0, y: 0 };
            const size = defaultResultNodeSize() || { w: 360, h: 460 };
            return {
                id: uid('result'),
                type: 'result',
                x: position.x,
                y: position.y,
                w: size.w,
                h: size.h,
                title: t('Manual Output', '手动输出'),
                producer: { preset_node_id: null, run_id: null, task_id: null },
                status: {
                    state: 'manual',
                    queue_position: null,
                    step: 0,
                    total_steps: 0,
                    percent: 1,
                    message: t('You can manually replace the image and connect it to the next preset input.', '可手动替换图片，并连接到下一个 preset 输入。')
                },
                preview: null,
                asset: null,
                source: { kind: 'manual_output' }
            };
        }

        return {
            buildManualOutputNode,
            buildReservedResultNode,
            buildQueuedResultNode,
            buildDirectorSegmentResultNode,
            buildTimelineOutputResultNode,
            buildTimelineCompareResultNode,
            buildResultStatusPatch,
            buildResultAssetPatch,
            buildResultSelectedAssetMetadataPatch,
            buildResultPreviewPatch,
            buildResultProducerPatch,
            buildResultSourcePatch,
            buildCanvasAgentReservedResultSource,
            buildTimelineResultPatch,
            buildResultRunMetadataPatch,
            buildResultOutputPatch,
            buildResultRefreshPreparingPatch,
            buildResultRefreshReconciledPatch,
            buildResultRefreshClearedPatch,
            buildResultRefreshFailurePatch,
            buildResultStaleStatePatch,
            buildResultFingerprintPatch,
            buildResultDryRunSourcePatch,
            buildResultManualReplacementPatch,
            buildResultMaterializationPatch,
            buildResultAssetSelectionPatch,
            buildResultBatchMetadataPatch,
            buildResultLayoutPatch
        };
    }

    window.SimpAICanvasWorkbenchResultNodeFactory = Object.assign({}, window.SimpAICanvasWorkbenchResultNodeFactory || {}, {
        createCanvasResultNodeFactoryController
    });
})();
