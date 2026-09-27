(function () {
    'use strict';

    function createCanvasVlmCustomApiProfilesController(context) {
        const source = context?.vlmCustomApiProfilesSource || context || {};
        const getProviders = () => typeof source.getProviders === 'function' ? source.getProviders() : [];
        const getStorage = () => typeof source.getStorage === 'function' ? source.getStorage() : null;
        const getStorageKey = () => typeof source.getStorageKey === 'function' ? source.getStorageKey() : '';

        function getVlmCustomProvider(key) {
            const providers = getProviders();
            return providers.find(item => item.key === key) || providers[0];
        }

        function getVlmCustomProfileKey(params) {
            const name = String(params?.custom_api_name || '').trim();
            if (name) return name;
            return String(params?.custom_provider || 'openai').trim() || 'openai';
        }

        function readVlmCustomApiProfiles() {
            try {
                const storage = getStorage();
                const data = JSON.parse(storage.getItem(getStorageKey()) || '{}');
                return data && typeof data === 'object' ? data : {};
            } catch (err) {
                return {};
            }
        }

        function writeVlmCustomApiProfiles(profiles) {
            getStorage().setItem(getStorageKey(), JSON.stringify(profiles || {}));
        }

        function getVlmCustomApiProfile(params) {
            const profiles = readVlmCustomApiProfiles();
            return profiles[getVlmCustomProfileKey(params)] || null;
        }

        return {
            getVlmCustomProvider,
            getVlmCustomProfileKey,
            readVlmCustomApiProfiles,
            writeVlmCustomApiProfiles,
            getVlmCustomApiProfile
        };
    }

    window.SimpAICanvasWorkbenchVlmCustomApiProfiles = Object.assign(
        {},
        window.SimpAICanvasWorkbenchVlmCustomApiProfiles || {},
        { createCanvasVlmCustomApiProfilesController }
    );
})();
