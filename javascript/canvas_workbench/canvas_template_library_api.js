(function () {
    'use strict';

    function createCanvasTemplateLibraryApi(context) {
        const scope = context?.templateLibraryApiSource || context || {};
        const apiSource = scope.apiSource || {};
        const userSource = scope.userSource || {};
        const getApiMethod = name => typeof apiSource.getApiMethod === 'function' ? apiSource.getApiMethod(name) : null;
        const getUserContext = typeof userSource.getUserContext === 'function' ? userSource.getUserContext : () => ({});

        function withUserContext(payload) {
            return Object.assign({}, payload || {}, { user_context: getUserContext() });
        }

        function unavailable(error) {
            return { ok: false, error };
        }

        async function sendTemplateSaveRequest(payload) {
            const body = withUserContext(payload);
            const method = getApiMethod('saveTemplate');
            if (typeof method === 'function') return method(body);
            return unavailable('template-save API is unavailable');
        }

        async function sendTemplateListRequest(payload) {
            const body = withUserContext(payload);
            const method = getApiMethod('listTemplates');
            if (typeof method === 'function') return method(body);
            return unavailable('template-list API is unavailable');
        }

        async function sendTemplateLoadRequest(templateId) {
            const body = withUserContext({ template_id: templateId });
            const method = getApiMethod('loadTemplate');
            if (typeof method === 'function') return method(body);
            return unavailable('template-load API is unavailable');
        }

        async function sendTemplateDeleteRequest(templateId) {
            const body = withUserContext({ template_id: templateId });
            const method = getApiMethod('deleteTemplate');
            if (typeof method === 'function') return method(body);
            return unavailable('template-delete API is unavailable');
        }

        return {
            sendTemplateSaveRequest,
            sendTemplateListRequest,
            sendTemplateLoadRequest,
            sendTemplateDeleteRequest
        };
    }

    window.SimpAICanvasWorkbenchTemplateLibraryApi = Object.assign({}, window.SimpAICanvasWorkbenchTemplateLibraryApi || {}, {
        createCanvasTemplateLibraryApi
    });
})();
