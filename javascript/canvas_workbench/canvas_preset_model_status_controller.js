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
        const shouldAutoCheck = (node) => typeof modelSource.shouldAutoCheckPresetModels === 'function'
            ? !!modelSource.shouldAutoCheckPresetModels(node)
            : false;
        const checkModelStatus = (node) => typeof modelSource.checkPresetModelStatus === 'function'
            ? modelSource.checkPresetModelStatus(node)
            : Promise.resolve({ ok: false, error: 'preset model status check unavailable' });
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
