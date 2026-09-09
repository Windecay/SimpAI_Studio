(function () {
    'use strict';

    function createCanvasTemplateLibraryApi(context) {
        const scope = context || {};
        const saveTemplate = typeof scope.saveTemplate === 'function' ? scope.saveTemplate : null;
        const listTemplates = typeof scope.listTemplates === 'function' ? scope.listTemplates : null;
        const loadTemplate = typeof scope.loadTemplate === 'function' ? scope.loadTemplate : null;
        const deleteTemplate = typeof scope.deleteTemplate === 'function' ? scope.deleteTemplate : null;
        const isBridgeReady = typeof scope.isBridgeReady === 'function' ? scope.isBridgeReady : () => false;
        const sendBridgeRequest = scope.sendBridgeRequest;
        const getUserContext = typeof scope.getUserContext === 'function' ? scope.getUserContext : () => ({});

        function withUserContext(payload) {
            return Object.assign({}, payload || {}, { user_context: getUserContext() });
        }

        function unavailable(error) {
            return { ok: false, error };
        }

        async function sendTemplateSaveRequest(payload) {
            const body = withUserContext(payload);
            if (typeof saveTemplate === 'function') return saveTemplate(body);
            if (isBridgeReady() && typeof sendBridgeRequest === 'function') {
                return sendBridgeRequest('save_template', body, 45000);
            }
            return unavailable('template-save API is unavailable');
        }

        async function sendTemplateListRequest(payload) {
            const body = withUserContext(payload);
            if (typeof listTemplates === 'function') return listTemplates(body);
            if (isBridgeReady() && typeof sendBridgeRequest === 'function') {
                return sendBridgeRequest('list_templates', body, 45000);
            }
            return unavailable('template-list API is unavailable');
        }

        async function sendTemplateLoadRequest(templateId) {
            const body = withUserContext({ template_id: templateId });
            if (typeof loadTemplate === 'function') return loadTemplate(body);
            if (isBridgeReady() && typeof sendBridgeRequest === 'function') {
                return sendBridgeRequest('load_template', body, 45000);
            }
            return unavailable('template-load API is unavailable');
        }

        async function sendTemplateDeleteRequest(templateId) {
            const body = withUserContext({ template_id: templateId });
            if (typeof deleteTemplate === 'function') return deleteTemplate(body);
            if (isBridgeReady() && typeof sendBridgeRequest === 'function') {
                return sendBridgeRequest('delete_template', body, 45000);
            }
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
