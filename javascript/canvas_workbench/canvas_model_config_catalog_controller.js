(function () {
    'use strict';

    function createCanvasModelConfigCatalogController(context) {
        const scope = context?.modelConfigCatalogSource || context || {};
        const nodeSource = scope.nodeSource || {};
        const requestSource = scope.requestSource || {};
        const patchSource = scope.patchSource || {};
        const historySource = scope.historySource || {};
        const persistenceSource = scope.persistenceSource || {};
        const renderSource = scope.renderSource || {};
        const timeSource = scope.timeSource || {};
        const diagnosticSource = scope.diagnosticSource || {};
        const call = (source, name, fallback, ...args) => typeof source[name] === 'function'
            ? source[name](...args) : fallback;
        const scheduleSave = () => call(persistenceSource, 'scheduleSave', undefined);
        const renderAll = () => call(renderSource, 'renderAll', undefined, { inspector: false });
        const warn = (...args) => call(diagnosticSource, 'warn', undefined, ...args);
        const buildConfigStatePatch = (...args) => call(patchSource, 'buildConfigStatePatch', {}, ...args);

        function modelConfigUsesFilter(node) {
            return !(node?.config && node.config.use_model_filter === false);
        }

        async function refreshModelConfigCatalog(configNode, presetNode) {
            if (!configNode || !presetNode || configNode.config_kind !== 'models') return;
            const useModelFilter = modelConfigUsesFilter(configNode);
            const response = await call(requestSource, 'sendCanvasModelCatalogRequest', null,
                presetNode, { use_model_filter: useModelFilter });
            if (!response?.ok || !response.catalog) {
                warn('[SimpAI Canvas] model catalog refresh failed', response);
                return;
            }
            Object.assign(configNode, buildConfigStatePatch(configNode, {
                configPatch: {
                    use_model_filter: useModelFilter,
                    catalog: response.catalog,
                    catalog_updated_at: call(timeSource, 'nowIso', '')
                }
            }));
            scheduleSave();
            renderAll();
        }

        function setModelConfigFilter(nodeId, enabled) {
            const node = call(nodeSource, 'getNode', null, nodeId);
            if (!node || node.type !== 'config' || node.config_kind !== 'models') return;
            if (call(nodeSource, 'isNodeLocked', false, node)) return;
            call(historySource, 'pushHistoryBatch', undefined, `config-model-filter:${nodeId}`, 'Edit model filter');
            Object.assign(node, buildConfigStatePatch(node, {
                configPatch: { use_model_filter: !!enabled },
                touchUpdatedAt: true
            }));
            scheduleSave();
            const targetPreset = call(nodeSource, 'getConfigTargetPreset', null, node);
            if (targetPreset) {
                refreshModelConfigCatalog(node, targetPreset).catch((err) => {
                    warn('[SimpAI Canvas] model filter refresh failed', err);
                    renderAll();
                });
            } else {
                renderAll();
            }
        }

        return { modelConfigUsesFilter, refreshModelConfigCatalog, setModelConfigFilter };
    }

    window.SimpAICanvasWorkbenchModelConfigCatalog = Object.assign(
        {}, window.SimpAICanvasWorkbenchModelConfigCatalog || {}, { createCanvasModelConfigCatalogController }
    );
})();
