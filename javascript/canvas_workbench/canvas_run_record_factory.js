(function () {
    'use strict';

    function createCanvasRunRecordFactoryController(context) {
        const scope = context || {};
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
        const clamp = typeof scope.clamp === 'function'
            ? scope.clamp
            : ((value, min, max) => Math.max(min, Math.min(max, value)));
        const isTerminalRunState = typeof scope.isTerminalRunState === 'function'
            ? scope.isTerminalRunState
            : (state => ['finished', 'failed', 'canceled', 'skipped'].includes(String(state || '').toLowerCase()));

        function compactCanvasRunResponse(response) {
            const result = cloneRunValue(response || {}, {});
            if (result.preview_stream && typeof result.preview_stream === 'object') {
                const framesDeltaCount = Array.isArray(result.preview_stream.frames_delta)
                    ? result.preview_stream.frames_delta.length
                    : 0;
                result.preview_stream = {
                    kind: result.preview_stream.kind || 'frame_stream',
                    media_type: result.preview_stream.media_type || '',
                    fps: result.preview_stream.fps || 0,
                    step_key: result.preview_stream.step_key || '',
                    latest_serial: result.preview_stream.latest_serial || 0,
                    frame_count: result.preview_stream.frame_count || 0,
                    frames_delta_count: framesDeltaCount
                };
            }
            return result;
        }

        function buildQwenTtsRunResponsePatch(run, response) {
            const previous = run || {};
            const ok = !!(response && response.ok);
            const state = response?.state || (ok && (response?.asset || (Array.isArray(response?.assets) && response.assets.length))
                ? 'finished'
                : (ok ? 'queued' : 'failed'));
            const patch = {
                state,
                backend: 'qwen_tts',
                task_id: response?.task_id || previous.task_id || null,
                message: ok ? (response?.message || state) : `Qwen TTS failed: ${response?.error || 'unknown error'}`,
                percent: clamp(Number(response?.percent || 0), 0, 1),
                events: cloneRunValue(response?.events || previous.events || [], []),
                output_count: Array.isArray(response?.assets) ? response.assets.length : previous.output_count || 0,
                input_count: response?.input_count ?? previous.input_count ?? 0,
                error: ok ? '' : (response?.error || 'unknown error'),
                details: ok ? '' : (response?.details || ''),
                errors: cloneRunValue(response?.errors || [], [])
            };
            if (response?.resolved_seed !== undefined && response?.resolved_seed !== null) {
                patch.resolved_seed = response.resolved_seed;
            }
            if (response?.created_at && !previous.backend_created_at) patch.backend_created_at = response.created_at;
            if (isTerminalRunState(state) && !previous.finished_at) {
                patch.finished_at = response?.finished_at || nowIso();
            }
            patch.updated_at = nowIso();
            patch.last_response = cloneRunValue(response || {}, {});
            return patch;
        }

        function buildCanvasRunResponsePatch(run, response) {
            const previous = run || {};
            const ok = !!(response && response.ok);
            const state = response?.state || (ok ? 'queued' : 'failed');
            const patch = {
                state,
                backend: 'async_task',
                task_id: response?.task_id || previous.task_id || null,
                message: ok ? (response?.message || state) : `Run failed: ${response?.error || 'unknown error'}`,
                percent: clamp(Number(response?.percent || 0), 0, 1),
                task_preview: cloneRunValue(response?.task_preview || previous.task_preview || {}, {}),
                events: cloneRunValue(response?.events || previous.events || [], []),
                output_count: Array.isArray(response?.assets) ? response.assets.length : previous.output_count || 0,
                input_count: response?.input_count ?? (Array.isArray(response?.task_preview?.upload_fields)
                    ? response.task_preview.upload_fields.length
                    : previous.input_count || 0),
                error: ok ? '' : (response?.error || 'unknown error'),
                details: ok ? '' : (response?.details || ''),
                errors: cloneRunValue(response?.errors || [], [])
            };
            if (response?.resolved_seed !== undefined && response?.resolved_seed !== null) {
                patch.resolved_seed = response.resolved_seed;
            }
            if (response?.task_args_preview?.params_backend_preview?.image_seed !== undefined) {
                patch.resolved_seed = response.task_args_preview.params_backend_preview.image_seed;
            }
            if (response?.created_at && !previous.backend_created_at) patch.backend_created_at = response.created_at;
            if (isTerminalRunState(state) && !previous.finished_at) {
                patch.finished_at = response?.finished_at || nowIso();
            }
            patch.updated_at = nowIso();
            patch.last_response = compactCanvasRunResponse(response || {});
            return patch;
        }

        function buildCanvasDryRunPatch(run, response) {
            const ok = !!(response && response.ok);
            return {
                state: ok ? 'dry_run_ready' : 'failed',
                backend: 'dry_run',
                dry_run: cloneRunValue(response || {}, {}),
                updated_at: nowIso()
            };
        }

        function buildQwenTtsRunRecord(options) {
            const config = options || {};
            return {
                id: config.runId,
                qwen_tts_node_id: config.qwenTtsNodeId,
                producer_node_id: config.producerNodeId || config.qwenTtsNodeId,
                producer_type: 'qwen_tts',
                placeholder_node_id: config.placeholderNodeId,
                mode: config.mode,
                state: 'queued',
                input_fingerprint: config.inputFingerprint,
                run_token: config.runToken,
                created_at: nowIso(),
                updated_at: nowIso(),
                backend: 'qwen_tts_pending'
            };
        }

        function buildPresetRunRecord(options) {
            const config = options || {};
            return {
                id: config.runId,
                preset_node_id: config.presetNodeId,
                placeholder_node_id: config.placeholderNodeId,
                state: 'queued',
                input_fingerprint: config.inputFingerprint,
                run_token: config.runToken,
                created_at: nowIso(),
                updated_at: nowIso(),
                backend: 'pending'
            };
        }

        function buildDirectorSegmentRunRecord(options) {
            const config = options || {};
            return {
                id: config.runId,
                preset_node_id: config.presetNodeId,
                placeholder_node_id: config.placeholderNodeId,
                state: 'queued',
                run_token: config.runToken,
                director_segment_index: config.segmentIndex,
                created_at: nowIso(),
                updated_at: nowIso(),
                backend: 'pending'
            };
        }

        function buildRunStoragePatch(run, options) {
            const config = options || {};
            const compactAsset = typeof config.compactAsset === 'function' ? config.compactAsset : null;
            const compactRun = {
                id: run?.id || '',
                state: run?.state || run?.status || '',
                preset_node_id: run?.preset_node_id || '',
                qwen_tts_node_id: run?.qwen_tts_node_id || '',
                producer_node_id: run?.producer_node_id || '',
                producer_type: run?.producer_type || '',
                mode: run?.mode || '',
                placeholder_node_id: run?.placeholder_node_id || '',
                task_id: run?.task_id || '',
                backend: run?.backend || '',
                message: run?.message || '',
                percent: run?.percent ?? null,
                resolved_seed: run?.resolved_seed ?? null,
                input_count: run?.input_count ?? null,
                output_count: run?.output_count ?? null,
                created_at: run?.created_at || '',
                finished_at: run?.finished_at || '',
                updated_at: run?.updated_at || '',
                error: run?.error || '',
                details: run?.details || ''
            };
            if (run?.asset) {
                compactRun.asset = cloneRunValue(run.asset, {});
                if (compactAsset) compactAsset(compactRun.asset);
            }
            if (Array.isArray(run?.assets) && run.assets.length) {
                compactRun.assets = run.assets.map(asset => cloneRunValue(asset, {}));
                if (compactAsset) compactRun.assets.forEach(compactAsset);
            }
            return { run: compactRun };
        }

        return {
            buildQwenTtsRunRecord,
            buildPresetRunRecord,
            buildDirectorSegmentRunRecord,
            buildRunStoragePatch,
            buildQwenTtsRunResponsePatch,
            buildCanvasRunResponsePatch,
            buildCanvasDryRunPatch
        };
    }

    window.SimpAICanvasWorkbenchRunRecordFactory = Object.assign({}, window.SimpAICanvasWorkbenchRunRecordFactory || {}, {
        createCanvasRunRecordFactoryController
    });
})();
