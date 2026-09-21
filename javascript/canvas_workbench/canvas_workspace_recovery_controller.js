(function () {
    'use strict';

    function call(source, name, fallback, ...args) {
        return typeof source?.[name] === 'function' ? source[name](...args) : fallback;
    }

    function createCanvasWorkspaceRecoveryController(source) {
        const scope = source?.workspaceRecoverySource || source || {};
        const stateSource = scope.stateSource || {};
        const projectSource = scope.projectSource || {};
        const persistenceSource = scope.persistenceSource || {};
        const lifecycleSource = scope.lifecycleSource || {};

        function workspaceSnapshot() {
            const root = call(stateSource, 'getRoot', null);
            const project = call(stateSource, 'getProject', {}) || {};
            const projectId = call(projectSource, 'getProjectId', '');
            return {
                version: 1,
                open: !!(root && !root.hidden),
                project_id: String(project.id || projectId || ''),
                updated_at: String(project.updated_at || '')
            };
        }

        async function prepareWorkspaceRecovery() {
            const cached = await call(persistenceSource, 'saveProject', null, true, { persist: false });
            return Object.assign(workspaceSnapshot(), { cached });
        }

        function restoreWorkspaceRecovery(snapshot) {
            if (!snapshot || snapshot.open !== true) return false;
            call(lifecycleSource, 'openWorkbench');
            return true;
        }

        return {
            workspaceSnapshot,
            prepareWorkspaceRecovery,
            restoreWorkspaceRecovery
        };
    }

    window.SimpAICanvasWorkbenchWorkspaceRecovery = Object.assign(
        {},
        window.SimpAICanvasWorkbenchWorkspaceRecovery || {},
        { createCanvasWorkspaceRecoveryController }
    );
})();
