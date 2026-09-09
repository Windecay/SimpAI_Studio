(function () {
    'use strict';

    function createCanvasStatusController(context) {
        const scope = context || {};
        const call = (name, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : undefined;
        const getRoot = () => typeof scope.getRoot === 'function' ? scope.getRoot() : null;
        const getProject = () => typeof scope.getProject === 'function' ? (scope.getProject() || {}) : {};
        const getStorageScope = () => typeof scope.getStorageScope === 'function' ? (scope.getStorageScope() || {}) : {};
        const getStorageKey = () => typeof scope.getStorageKey === 'function' ? scope.getStorageKey() : null;
        const getZoomLabel = () => typeof scope.getZoomLabel === 'function' ? scope.getZoomLabel() : null;
        const t = typeof scope.t === 'function' ? scope.t : ((en, cn) => cn || en);

        function renderStatus() {
            const root = getRoot();
            if (!root) return;
            const project = getProject();
            const title = root.querySelector?.('.sai-canvas-title');
            if (title) title.textContent = call('getCanvasTitle');
            const status = root.querySelector?.('[data-canvas-status]');
            if (status) {
                const nodeCount = Array.isArray(project.nodes) ? project.nodes.length : 0;
                const edgeCount = Array.isArray(project.edges) ? project.edges.length : 0;
                const schedulerState = project.scheduler?.state || '';
                const schedulerStatus = schedulerState === 'running'
                    ? ` · Queue ${Number(project.scheduler.index || 0) + 1}/${project.scheduler.total || 0}`
                    : (schedulerState === 'waiting'
                        ? ` · Queue waiting`
                        : (schedulerState === 'blocked' ? ` · Queue blocked` : ''));
                const storageScope = getStorageScope();
                status.textContent = t('{nodes} nodes / {edges} edges · {scope}{scheduler}', '{nodes} 节点 / {edges} 连线 · {scope}{scheduler}')
                    .replace('{nodes}', nodeCount)
                    .replace('{edges}', edgeCount)
                    .replace('{scope}', storageScope.label || '')
                    .replace('{scheduler}', schedulerStatus);
                const storage = project.storage || {};
                const schedulerError = project.scheduler?.error ? `\n${t('Queue', '队列')}：${project.scheduler.error}` : '';
                status.title = `${call('storageDisplayLocation')}\n${call('storageDisplayPath')}\n${t('Cache key', '缓存键')}：${storage.key || getStorageKey() || ''}${schedulerError}`;
            }
            const zoomLabel = getZoomLabel();
            if (zoomLabel) zoomLabel.textContent = `${Math.round(Number(project.viewport?.zoom || 0) * 100)}%`;
            root.classList?.toggle('show-grid', !!project.settings?.grid);
            root.classList?.toggle('reduced-motion', !!project.settings?.reducedMotion);
            root.classList?.toggle('inspector-collapsed', !!project.settings?.inspectorCollapsed);
            const inspectorToggle = root.querySelector?.('[data-canvas-action="toggle-inspector"]');
            if (inspectorToggle) {
                const collapsed = !!project.settings?.inspectorCollapsed;
                inspectorToggle.title = collapsed ? t('Show inspector', '展开检查器') : t('Hide inspector', '隐藏检查器');
                inspectorToggle.setAttribute?.('aria-label', inspectorToggle.title);
                inspectorToggle.innerHTML = `<i class="fa-solid ${collapsed ? 'fa-chevron-left' : 'fa-chevron-right'}"></i>`;
            }
            call('renderHistoryButtons');
            call('renderSystemInfo');
            call('renderRunQueueWidget');
        }

        return { renderStatus };
    }

    window.SimpAICanvasWorkbenchStatus = Object.assign({}, window.SimpAICanvasWorkbenchStatus || {}, {
        createCanvasStatusController
    });
})();
