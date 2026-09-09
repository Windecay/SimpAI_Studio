(function () {
    'use strict';

    function createCanvasBackendRequestController(context) {
        const scope = context || {};
        const getApiMethod = (name) => typeof scope.getApiMethod === 'function' ? scope.getApiMethod(name) : null;
        const call = (name, fallback, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : fallback;

        function unavailable(name) {
            return { ok: false, error: `${name} API is unavailable` };
        }

        function apiCall(name, ...args) {
            const method = getApiMethod(name);
            return typeof method === 'function' ? method(...args) : unavailable(name);
        }

        function projectId() {
            return call('getProjectId', 'default', []) || 'default';
        }

        function getWorkbenchUserContext() {
            const systemParams = call('getSystemParams', {}, []) || {};
            const storageScope = call('getStorageScope', {}, []) || {};
            return {
                user_did: systemParams.user_did || systemParams.__user_did || storageScope.owner || '',
                owner: storageScope.owner || '',
                scope: storageScope.mode || '',
                nickname: systemParams.nickname || systemParams.user_name || '',
                __lang: call('runtimeUiLang', 'en', [])
            };
        }

        function withWorkbenchUserContext(payload) {
            return Object.assign({}, payload || {}, { user_context: getWorkbenchUserContext() });
        }

        async function sendCanvasDryRunRequest(payload) {
            return apiCall('dryRun', payload);
        }

        async function sendCanvasRunNodeRequest(payload) {
            return apiCall('runNode', payload);
        }

        async function sendCanvasPollRunRequest(runId, options) {
            return apiCall('pollRun', runId, Object.assign({}, options || {}, {
                user_context: getWorkbenchUserContext()
            }));
        }

        async function sendCanvasControlRunRequest(runId, action) {
            return apiCall('controlRun', runId, action, {
                user_context: getWorkbenchUserContext()
            });
        }

        async function sendCanvasQwenTtsRunRequest(payload) {
            return apiCall('qwenTtsRun', payload);
        }

        async function sendCanvasQwenTtsPollRequest(jobId) {
            return apiCall('qwenTtsPoll', jobId);
        }

        async function sendCanvasQwenTtsControlRequest(jobId, action) {
            return apiCall('qwenTtsControl', jobId, action);
        }

        async function sendCanvasQwenTtsPresetsRequest() {
            return apiCall('qwenTtsPresets', {
                user_context: getWorkbenchUserContext()
            });
        }

        async function sendCanvasModelCatalogRequest(presetNode, options) {
            const opts = options || {};
            const useModelFilter = Object.prototype.hasOwnProperty.call(opts, 'use_model_filter')
                ? !!opts.use_model_filter
                : (Object.prototype.hasOwnProperty.call(opts, 'useModelFilter') ? !!opts.useModelFilter : true);
            return apiCall('modelCatalog', {
                preset_node: call('serializePresetForRun', {}, presetNode),
                use_model_filter: useModelFilter
            });
        }

        async function sendCanvasPresetModelStatusRequest(presetNode) {
            const isClassic = presetNode?.type === 'classic';
            return apiCall('presetModelStatus', {
                project_id: projectId(),
                preset_node: isClassic
                    ? call('serializeClassicNodeForRun', {}, presetNode)
                    : call('serializePresetForRun', {}, presetNode),
                user_context: getWorkbenchUserContext()
            });
        }

        async function sendCanvasPresetModelDownloadsRequest(presetNode, options) {
            const opts = options || {};
            const isClassic = presetNode?.type === 'classic';
            return apiCall('presetModelDownloads', {
                project_id: projectId(),
                preset_node: isClassic
                    ? call('serializeClassicNodeForRun', {}, presetNode)
                    : call('serializePresetForRun', {}, presetNode),
                user_context: getWorkbenchUserContext(),
                missing_model: opts.missingModel || null
            });
        }

        async function sendCanvasVlmModelStatusRequest(node) {
            return apiCall('vlmModelStatus', {
                project_id: projectId(),
                node_id: node?.id || '',
                params: call('getVlmCustomRuntimeParams', {}, node),
                api_key: call('getVlmCustomApiKey', '', node),
                user_context: getWorkbenchUserContext()
            });
        }

        async function sendCanvasVlmModelDownloadsRequest(node, options) {
            const opts = options || {};
            return apiCall('vlmModelDownloads', {
                project_id: projectId(),
                node_id: node?.id || '',
                params: call('getVlmCustomRuntimeParams', {}, node),
                api_key: call('getVlmCustomApiKey', '', node),
                user_context: getWorkbenchUserContext(),
                missing_model: opts.missingModel || null
            });
        }

        async function sendCanvasCustomLlmModelsRequest(node) {
            return apiCall('customLlmModels', {
                project_id: projectId(),
                node_id: node?.id || '',
                params: call('cloneRunValue', {}, node?.params || {}),
                api_key: call('getVlmCustomApiKey', '', node),
                user_context: getWorkbenchUserContext()
            });
        }

        async function sendVlmSystemPromptTemplatesRequest() {
            const method = getApiMethod('vlmSystemPromptTemplates');
            if (typeof method === 'function') {
                return method({ user_context: getWorkbenchUserContext() });
            }
            const fetchImpl = scope.fetch || (typeof fetch === 'function' ? fetch : null);
            if (!fetchImpl) return unavailable('vlmSystemPromptTemplates');
            const response = await fetchImpl('/vlm-system-prompt-templates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_context: getWorkbenchUserContext() })
            });
            return response.json();
        }

        async function sendCanvasListAssetsRequest(payload) {
            return apiCall('listAssets', withWorkbenchUserContext(payload));
        }

        async function sendCanvasDeleteAssetsRequest(payload) {
            return apiCall('deleteAssets', withWorkbenchUserContext(payload));
        }

        async function sendCanvasMaterializeAssetRequest(payload) {
            const method = getApiMethod('materializeAsset');
            if (typeof method !== 'function') {
                return { ok: false, error: 'materialize asset API is unavailable' };
            }
            return method(withWorkbenchUserContext(payload));
        }

        async function sendCanvasGenerateMaskRequest(payload) {
            const method = getApiMethod('generateMask');
            if (typeof method !== 'function') {
                return { ok: false, error: 'mask generation API is unavailable' };
            }
            return method(withWorkbenchUserContext(payload));
        }

        async function sendCanvasRenderTimelineRequest(payload) {
            const method = getApiMethod('renderTimeline');
            if (typeof method !== 'function') {
                return { ok: false, error: 'timeline render API is unavailable' };
            }
            return method(withWorkbenchUserContext(payload));
        }

        async function sendCanvasRenderTimelineFrameRequest(payload) {
            const method = getApiMethod('renderTimelineFrame');
            if (typeof method !== 'function') {
                return { ok: false, error: 'timeline frame API is unavailable' };
            }
            return method(withWorkbenchUserContext(payload));
        }

        async function sendCanvasWd14TagRequest(payload) {
            return apiCall('wd14Tag', withWorkbenchUserContext(payload));
        }

        async function sendCanvasVlmRunRequest(payload, options) {
            const handler = scope.sendVlmRunRequest;
            return typeof handler === 'function' ? handler(payload, options) : { ok: false, error: 'VLM run API is unavailable' };
        }

        async function sendCanvasVlmCancelRequest(payload) {
            const handler = scope.sendVlmCancelRequest;
            return typeof handler === 'function' ? handler(payload) : { ok: false, error: 'VLM cancel API is unavailable' };
        }

        async function sendCanvasTranslateRunRequest(payload) {
            return apiCall('translateRun', payload);
        }

        async function sendCanvasTranslatePollRequest(jobId) {
            return apiCall('translatePoll', jobId);
        }

        async function sendCanvasProjectSaveRequest(payload) {
            return apiCall('saveProject', withWorkbenchUserContext(payload));
        }

        async function sendCanvasProjectLoadRequest(payload) {
            return apiCall('loadProject', withWorkbenchUserContext(payload));
        }

        async function sendCanvasProjectListRequest(payload) {
            return apiCall('listProjects', withWorkbenchUserContext(payload));
        }

        async function sendCanvasProjectDeleteRequest(payload) {
            const body = withWorkbenchUserContext(payload);
            const method = getApiMethod('deleteProject');
            if (typeof method === 'function') return method(body);
            if (call('isBridgeReady', false, [])) {
                return call('sendBridgeRequest', unavailable('project-delete'), 'delete_project', body, 45000);
            }
            return unavailable('project-delete');
        }

        async function sendCanvasProjectClearRequest(payload) {
            const body = withWorkbenchUserContext(payload);
            const method = getApiMethod('clearProject');
            if (typeof method === 'function') return method(body);
            if (call('isBridgeReady', false, [])) {
                return call('sendBridgeRequest', unavailable('project-clear'), 'clear_project', body, 45000);
            }
            return unavailable('project-clear');
        }

        return {
            getWorkbenchUserContext,
            withWorkbenchUserContext,
            sendCanvasDryRunRequest,
            sendCanvasRunNodeRequest,
            sendCanvasPollRunRequest,
            sendCanvasControlRunRequest,
            sendCanvasQwenTtsRunRequest,
            sendCanvasQwenTtsPollRequest,
            sendCanvasQwenTtsControlRequest,
            sendCanvasQwenTtsPresetsRequest,
            sendCanvasModelCatalogRequest,
            sendCanvasPresetModelStatusRequest,
            sendCanvasPresetModelDownloadsRequest,
            sendCanvasVlmModelStatusRequest,
            sendCanvasVlmModelDownloadsRequest,
            sendCanvasCustomLlmModelsRequest,
            sendVlmSystemPromptTemplatesRequest,
            sendCanvasListAssetsRequest,
            sendCanvasDeleteAssetsRequest,
            sendCanvasMaterializeAssetRequest,
            sendCanvasGenerateMaskRequest,
            sendCanvasRenderTimelineRequest,
            sendCanvasRenderTimelineFrameRequest,
            sendCanvasWd14TagRequest,
            sendCanvasVlmRunRequest,
            sendCanvasVlmCancelRequest,
            sendCanvasTranslateRunRequest,
            sendCanvasTranslatePollRequest,
            sendCanvasProjectSaveRequest,
            sendCanvasProjectLoadRequest,
            sendCanvasProjectListRequest,
            sendCanvasProjectDeleteRequest,
            sendCanvasProjectClearRequest
        };
    }

    window.SimpAICanvasWorkbenchBackendRequests = Object.assign({}, window.SimpAICanvasWorkbenchBackendRequests || {}, {
        createCanvasBackendRequestController
    });
})();
