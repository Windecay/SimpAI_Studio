(function () {
    'use strict';

    function createCanvasPresetModelStatusController(context) {
        const scope = context?.presetModelStatusSource || context || {};
        const projectSource = scope.projectSource || {};
        const nodeSource = scope.nodeSource || {};
        const modelSource = scope.modelSource || {};
        const uiSource = scope.uiSource || {};
        const timingSource = scope.timingSource || {};
        const diagnosticsSource = scope.diagnosticsSource || {};

        const getProject = () => typeof projectSource.getProject === 'function'
            ? projectSource.getProject()
            : null;
        const getNode = (id) => typeof nodeSource.getNode === 'function'
            ? nodeSource.getNode(id)
            : null;
        const isPresetNode = (node) => typeof nodeSource.isPresetNode === 'function'
            ? !!nodeSource.isPresetNode(node)
            : !!node && ['preset', 'classic'].includes(node.type);
        const getStatusState = (node) => typeof modelSource.presetModelStatusState === 'function'
            ? modelSource.presetModelStatusState(node)
            : '';
        const translate = (en, cn) => typeof uiSource.translate === 'function' ? uiSource.translate(en, cn) : en;
        const applyStatusPatch = (node, statusPatch) => typeof modelSource.buildPresetModelStatusPatch === 'function'
            ? modelSource.buildPresetModelStatusPatch(node, { statusPatch })
            : {};
        const checkingStatus = (message) => typeof modelSource.buildPresetModelCheckingStatus === 'function'
            ? modelSource.buildPresetModelCheckingStatus(message)
            : { state: 'checking', message };
        const checkRequest = (node) => typeof modelSource.sendCanvasPresetModelStatusRequest === 'function'
            ? modelSource.sendCanvasPresetModelStatusRequest(node)
            : Promise.resolve({ ok: false, error: 'preset model status check unavailable' });
        const downloadRequest = (node, options) => typeof modelSource.sendCanvasPresetModelDownloadsRequest === 'function'
            ? modelSource.sendCanvasPresetModelDownloadsRequest(node, options)
            : Promise.resolve({ ok: false, error: 'preset model download queue unavailable' });
        const applyStatus = (node, response) => modelSource.applyPresetModelStatus?.(node, response);
        const render = (options) => uiSource.renderAll?.(options);
        const mutate = (options) => uiSource.mutate?.(options);
        const showToast = (...args) => uiSource.showToast?.(...args);
        const checkModelStatus = (node) => checkPresetModelStatus(node);
        const shouldAutoCheck = (node) => shouldAutoCheckPresetModels(node);
        const openMissingModelList = (node) => typeof uiSource.openMainMissingModelListForPreset === 'function'
            ? uiSource.openMainMissingModelListForPreset(node)
            : undefined;
        const warn = (...args) => {
            if (typeof diagnosticsSource.warn === 'function') diagnosticsSource.warn(...args);
        };
        const schedule = (callback, delay) => {
            if (typeof timingSource.setTimeout !== 'function') return false;
            try {
                timingSource.setTimeout(callback, delay);
                return true;
            } catch (err) {
                return false;
            }
        };
        function shouldAutoCheckPresetModels(node) {
            if (!isPresetNode(node)) return false;
            const state = getStatusState(node);
            if (!['unknown', 'error'].includes(state)) return false;
            const requirements = node.model_requirements || {};
            return (Array.isArray(requirements.model_list) && requirements.model_list.length > 0) || !!requirements.has_model_probe;
        }

        async function checkPresetModelStatus(node) {
            if (!isPresetNode(node)) return { ok: false, error: 'preset node is unavailable' };
            Object.assign(node, applyStatusPatch(node, checkingStatus(translate('Checking required model files...', '正在检查所需模型文件...'))));
            render({ inspector: false });
            const response = await checkRequest(node);
            const current = getNode(node.id);
            if (current) {
                applyStatus(current, response);
                mutate({ inspector: false });
            }
            return response;
        }

        async function queuePresetModelDownloads(node, options) {
            if (!isPresetNode(node)) return { ok: false, error: 'preset node is unavailable' };
            Object.assign(node, applyStatusPatch(node, checkingStatus(translate('Queuing missing model downloads...', '正在加入缺失模型下载任务...'))));
            render({ inspector: false });
            const response = await downloadRequest(node, options || {});
            const current = getNode(node.id);
            if (current) {
                applyStatus(current, response);
                if (response?.ok && response.state === 'queued') {
                    Object.assign(current, applyStatusPatch(current, {
                        state: 'queued',
                        message: response.message || translate('Queued {count} model download task(s).', '已加入 {count} 个模型下载任务。').replace('{count}', response.queued_count || 0)
                    }));
                }
                mutate({ inspector: false });
            }
            if (response?.ok) {
                const latest = getNode(node.id) || node;
                showToast(response.message || translate('Model downloads queued.', '模型下载任务已加入。'));
                openMissingModelList(latest);
                schedulePresetModelListRefreshes(node.id, latest);
            } else {
                showToast(translate('Model download queue failed: {error}', '模型下载任务加入失败：{error}').replace('{error}', response?.error || response?.details || 'unknown error'));
            }
            return response;
        }

        async function handlePresetModelAction(node) {
            if (node?.source?.kind === 'onboarding_model_status_example') {
                const state = getStatusState(node);
                showToast(translate('Teaching example: this shows the {state} model state without contacting the backend.', '教学示例：这里展示 {state} 模型状态，不会联系后端。').replace('{state}', state || 'unknown'), 3200);
                return { ok: true, ready: state === 'ready', state, teaching: true };
            }
            const status = await checkPresetModelStatus(node);
            if (!status?.ok) {
                showToast(translate('Model check failed: {error}', '模型检查失败：{error}').replace('{error}', status?.error || status?.details || 'unknown error'));
                return status;
            }
            if (status.ready) {
                showToast(status.model_config_gate
                    ? translate('Selected Models Config files are available.', '已选择的 Models Config 模型文件可用。')
                    : translate('Preset models are ready.', 'Preset 所需模型已可用。'));
                return status;
            }
            openMissingModelList(getNode(node.id) || node);
            const count = Number(status.missing_count || 0);
            showToast(translate('Preset is missing {count} model file(s). Use the model list to download one or all.', 'Preset 缺少 {count} 个模型文件，可在模型列表中下载。').replace('{count}', count));
            return status;
        }

        const autoCheckQueued = new Set();

        function scheduleAutoPresetModelChecks() {
            const project = getProject();
            const nodes = Array.isArray(project?.nodes)
                ? project.nodes.filter((node) => shouldAutoCheck(node))
                : [];
            nodes.forEach((node, index) => {
                if (!node?.id || autoCheckQueued.has(node.id)) return;
                autoCheckQueued.add(node.id);
                const scheduled = schedule(async () => {
                    const current = getNode(node.id);
                    if (!shouldAutoCheck(current)) {
                        autoCheckQueued.delete(node.id);
                        return;
                    }
                    try {
                        await checkModelStatus(current);
                    } catch (err) {
                        warn('[SimpAI Canvas] auto model check failed:', err);
                    } finally {
                        autoCheckQueued.delete(node.id);
                    }
                }, 500 + index * 350);
                if (!scheduled) autoCheckQueued.delete(node.id);
            });
        }

        function schedulePresetModelListRefreshes(nodeId, fallbackNode, delays) {
            if (typeof uiSource.openMainMissingModelListForPreset !== 'function') return;
            const scheduleDelays = Array.isArray(delays) && delays.length
                ? delays
                : [1200, 3200, 6500];
            scheduleDelays.forEach((delay) => {
                schedule(() => openMissingModelList(getNode(nodeId) || fallbackNode), delay);
            });
        }

        return {
            getAutoModelCheckQueued: () => autoCheckQueued,
            shouldAutoCheckPresetModels,
            checkPresetModelStatus,
            queuePresetModelDownloads,
            handlePresetModelAction,
            scheduleAutoPresetModelChecks,
            schedulePresetModelListRefreshes
        };
    }

    window.SimpAICanvasWorkbenchPresetModelStatus = Object.assign(
        {},
        window.SimpAICanvasWorkbenchPresetModelStatus || {},
        { createCanvasPresetModelStatusController }
    );
})();
