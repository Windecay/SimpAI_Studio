(function () {
    'use strict';

    const TERMINAL_STATES = new Set(['finished', 'failed', 'canceled', 'skipped']);
    const ACTIVE_STATES = new Set([
        'queued',
        'running',
        'waiting',
        'task_ready',
        'args_ready',
        'dry_run_ready',
        'cancelling',
        'skipping'
    ]);

    function createCanvasResultRunActionController(context) {
        const scope = context?.resultRunActionSource || context || {};
        const projectSource = scope.projectSource || {};
        const nodeSource = scope.nodeSource || {};
        const stateSource = scope.stateSource || {};
        const requestSource = scope.requestSource || {};
        const presetRuntimeSource = scope.presetRuntimeSource || {};
        const qwenRuntimeSource = scope.qwenRuntimeSource || {};
        const languageSource = scope.languageSource || {};
        const uiSource = scope.uiSource || {};
        const diagnosticsSource = scope.diagnosticsSource || {};

        const call = (sourceObject, name, fallback, ...args) => typeof sourceObject?.[name] === 'function'
            ? sourceObject[name](...args)
            : fallback;
        const getProject = () => call(projectSource, 'getProject', {}) || {};
        const getNode = (id) => call(nodeSource, 'getNode', null, id);
        const isQwenTtsNode = (node) => !!call(nodeSource, 'isQwenTtsNode', false, node);
        const nodeStatusState = (node) => call(stateSource, 'nodeStatusState', '', node);
        const isTerminalRunState = (state) => !!call(
            stateSource,
            'isTerminalRunState',
            TERMINAL_STATES.has(String(state || '').toLowerCase()),
            state
        );
        const isCanvasRunActiveState = (state) => !!call(
            stateSource,
            'isCanvasRunActiveState',
            ACTIVE_STATES.has(String(state || '').toLowerCase()),
            state
        );
        const sendCanvasControlRunRequest = (...args) => call(
            requestSource,
            'sendCanvasControlRunRequest',
            Promise.resolve({ ok: false, error: 'run control API unavailable' }),
            ...args
        );
        const sendCanvasQwenTtsControlRequest = (...args) => call(
            requestSource,
            'sendCanvasQwenTtsControlRequest',
            Promise.resolve({ ok: false, error: 'Qwen TTS control API unavailable' }),
            ...args
        );
        const applyCanvasRunStatus = (...args) => call(
            presetRuntimeSource,
            'applyCanvasRunStatus',
            undefined,
            ...args
        );
        const pollCanvasRun = (...args) => call(
            presetRuntimeSource,
            'pollCanvasRun',
            Promise.resolve({ ok: false, error: 'run polling unavailable' }),
            ...args
        );
        const runPresetNode = (...args) => call(
            presetRuntimeSource,
            'runPresetNode',
            Promise.resolve({ ok: false, error: 'preset runtime unavailable' }),
            ...args
        );
        const applyQwenTtsRunStatus = (...args) => call(
            qwenRuntimeSource,
            'applyQwenTtsRunStatus',
            undefined,
            ...args
        );
        const pollQwenTtsRun = (...args) => call(
            qwenRuntimeSource,
            'pollQwenTtsRun',
            Promise.resolve({ ok: false, error: 'Qwen TTS polling unavailable' }),
            ...args
        );
        const runQwenTtsNode = (...args) => call(
            qwenRuntimeSource,
            'runQwenTtsNode',
            Promise.resolve({ ok: false, error: 'Qwen TTS runtime unavailable' }),
            ...args
        );
        const getLanguageState = () => call(languageSource, 'getLanguageState', { __lang: 'en' });
        const t = (english, chinese) => call(
            languageSource,
            't',
            chinese || english,
            english,
            chinese,
            getLanguageState()
        );
        const showToast = (...args) => call(uiSource, 'showToast', undefined, ...args);
        const warn = (...args) => call(diagnosticsSource, 'warn', undefined, ...args);

        function controlResultRun(node, action) {
            return (async () => {
                const runId = node?.producer?.run_id || '';
                if (!runId) {
                    showToast(t('This result has no run id.', '此 Result 没有 run id。'));
                    return null;
                }
                if (node?.producer?.qwen_tts_node_id) {
                    if (action !== 'stop') {
                        showToast(t('Qwen TTS results only support Stop.', 'Qwen TTS 结果只支持停止。'));
                        return null;
                    }
                    const response = await sendCanvasQwenTtsControlRequest(runId, action);
                    applyQwenTtsRunStatus(runId, node.id, node.producer?.qwen_tts_node_id, response);
                    showToast(response?.ok
                        ? t('Qwen TTS stop requested.', '已请求停止 Qwen TTS。')
                        : t(
                            `Qwen TTS stop failed: ${response?.error || 'unknown error'}`,
                            `Qwen TTS 停止失败：${response?.error || '未知错误'}`
                        ));
                    if (response?.ok && !isTerminalRunState(response?.state || '')) {
                        pollQwenTtsRun(runId, node.id, node.producer?.qwen_tts_node_id);
                    }
                    return response;
                }
                const response = await sendCanvasControlRunRequest(runId, action);
                applyCanvasRunStatus(runId, node.id, node.producer?.preset_node_id, response);
                const actionLabel = action === 'skip' ? t('Skip', '跳过') : t('Stop', '停止');
                showToast(response?.ok
                    ? t(`${action} requested.`, `${actionLabel}请求已发送。`)
                    : t(
                        `${action} failed: ${response?.error || 'unknown error'}`,
                        `${actionLabel}失败：${response?.error || '未知错误'}`
                    ));
                if (response?.ok && !isTerminalRunState(response?.state || '')) {
                    pollCanvasRun(runId, node.id, node.producer?.preset_node_id);
                }
                return response;
            })();
        }

        function interruptResultRunForDeletion(node) {
            const runId = node?.producer?.run_id || '';
            if (!node || node.type !== 'result' || !runId) return false;
            const project = getProject();
            const runs = Array.isArray(project.runs) ? project.runs : [];
            const run = runs.find(item => item.id === runId);
            const state = nodeStatusState(node);
            const runState = run?.state || state;
            if (isTerminalRunState(runState) || isTerminalRunState(state)) return false;
            if (!isCanvasRunActiveState(runState) && !isCanvasRunActiveState(state)) return false;
            const nextResponse = {
                ok: true,
                state: 'canceled',
                run_id: runId,
                task_id: node.producer?.task_id || run?.task_id || null,
                message: t('Result deleted; run stop requested.', 'Result 已删除；已请求中断任务。')
            };
            const isQwenResult = !!node.producer?.qwen_tts_node_id;
            if (isQwenResult) {
                applyQwenTtsRunStatus(runId, node.id, node.producer.qwen_tts_node_id, nextResponse);
                Promise.resolve(sendCanvasQwenTtsControlRequest(runId, 'stop'))
                    .then((response) => {
                        if (!response?.ok) {
                            warn('[SimpAI Canvas] delete-result Qwen TTS stop request failed', {
                                run_id: runId,
                                error: response?.error || response?.details || 'unknown error'
                            });
                        }
                    })
                    .catch((err) => warn('[SimpAI Canvas] delete-result Qwen TTS stop request failed', err));
                return true;
            }
            applyCanvasRunStatus(runId, node.id, node.producer?.preset_node_id, nextResponse);
            Promise.resolve(sendCanvasControlRunRequest(runId, 'stop'))
                .then((response) => {
                    if (!response?.ok) {
                        warn('[SimpAI Canvas] delete-result stop request failed', {
                            run_id: runId,
                            error: response?.error || response?.details || 'unknown error'
                        });
                    }
                })
                .catch((err) => warn('[SimpAI Canvas] delete-result stop request failed', err));
            return true;
        }

        function interruptDeletedResultRuns(nodes) {
            const count = (Array.isArray(nodes) ? nodes : [])
                .filter(node => node?.type === 'result')
                .reduce((total, node) => total + (interruptResultRunForDeletion(node) ? 1 : 0), 0);
            if (count) {
                showToast(t(
                    'Deleted result node(s); stop requested for active task(s).',
                    '已删除 Result 节点；已请求中断活动任务。'
                ));
            }
            return count;
        }

        function retryResultRun(node) {
            if (node?.producer?.qwen_tts_node_id) {
                const qwenNode = getNode(node.producer.qwen_tts_node_id);
                if (!qwenNode || !isQwenTtsNode(qwenNode)) {
                    showToast(t('Original Qwen TTS node is missing.', '原始 Qwen TTS 节点不存在。'));
                    return null;
                }
                return runQwenTtsNode(qwenNode, { resultNode: node, reuseExistingResult: true });
            }
            const preset = getNode(node?.producer?.preset_node_id);
            if (!preset || !['preset', 'classic'].includes(preset.type)) {
                showToast(t('Original preset/classic node is missing.', '原始 preset/classic 节点不存在。'));
                return null;
            }
            return runPresetNode(preset, { resultNode: node, reuseExistingResult: true });
        }

        return {
            controlResultRun,
            interruptResultRunForDeletion,
            interruptDeletedResultRuns,
            retryResultRun
        };
    }

    window.SimpAICanvasWorkbenchResultRunAction = Object.assign(
        {},
        window.SimpAICanvasWorkbenchResultRunAction || {},
        { createCanvasResultRunActionController }
    );
})();
