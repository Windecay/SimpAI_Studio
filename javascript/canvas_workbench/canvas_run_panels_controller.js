(function () {
    'use strict';

    function createCanvasRunPanelsController(context) {
        const scope = context || {};
        const getProject = () => typeof scope.getProject === 'function' ? (scope.getProject() || {}) : {};
        const getRoot = () => typeof scope.getRoot === 'function' ? scope.getRoot() : null;
        const getRunQueuePanel = () => typeof scope.getRunQueuePanel === 'function' ? scope.getRunQueuePanel() : null;
        const getRunHistoryPanel = () => typeof scope.getRunHistoryPanel === 'function' ? scope.getRunHistoryPanel() : null;
        const getSelectedHistoryId = () => typeof scope.getRunHistorySelectedId === 'function' ? scope.getRunHistorySelectedId() : null;
        const setSelectedHistoryId = (id) => {
            if (typeof scope.setRunHistorySelectedId === 'function') scope.setRunHistorySelectedId(id || null);
        };
        const runQueueOpenPanel = scope.runQueueOpenPanel;
        const runQueueClosePanel = scope.runQueueClosePanel;
        const runQueueRenderPanel = scope.runQueueRenderPanel;
        const runQueueHandleAction = scope.runQueueHandleAction;
        const runHistoryOpenPanel = scope.runHistoryOpenPanel;
        const runHistoryClosePanel = scope.runHistoryClosePanel;
        const runHistoryRenderPanel = scope.runHistoryRenderPanel;
        const runHistoryHandleAction = scope.runHistoryHandleAction;
        const call = (name, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : undefined;
        const selectAndFitNode = (node) => call('selectAndFitNode', node);

        function syncRunSidePanelLayout() {
            const root = getRoot();
            if (!root) return;
            const queuePanel = getRunQueuePanel();
            const historyPanel = getRunHistoryPanel();
            const queueOpen = !!(queuePanel && !queuePanel.hidden);
            const historyOpen = !!(historyPanel && !historyPanel.hidden);
            const panel = queueOpen ? queuePanel : (historyOpen ? historyPanel : null);
            root.classList.toggle('has-run-queue-panel', queueOpen);
            root.classList.toggle('has-run-history-panel', historyOpen);
            root.classList.toggle('has-run-side-panel', queueOpen || historyOpen);
            if (panel) {
                const width = Math.round(panel.getBoundingClientRect?.().width || 0);
                if (width > 0) root.style.setProperty('--sai-run-side-panel-width', `${width}px`);
            } else {
                root.style.removeProperty('--sai-run-side-panel-width');
            }
        }

        function runQueueContext() {
            return {
                getProject,
                t: scope.t,
                escapeHtml: scope.escapeHtml,
                formatLocalTime: scope.formatLocalTime,
                isTerminalRunState: scope.isTerminalRunState,
                showToast: scope.showToast,
                getNode: scope.getNode,
                getRunQueuePanel,
                closeCanvasSettingsPanel: (...args) => call('closeCanvasSettingsPanel', ...args),
                closeRunHistoryPanel,
                openRunHistoryPanel,
                controlResultRun: (...args) => call('controlResultRun', ...args),
                retryResultRun: (...args) => call('retryResultRun', ...args),
                selectAndFitNode
            };
        }

        function runHistoryContext() {
            return {
                getProject,
                t: scope.t,
                escapeHtml: scope.escapeHtml,
                formatLocalTime: scope.formatLocalTime,
                isTerminalRunState: scope.isTerminalRunState,
                showToast: scope.showToast,
                getNode: scope.getNode,
                getRunHistoryPanel,
                getRunHistorySelectedId: getSelectedHistoryId,
                setRunHistorySelectedId: setSelectedHistoryId,
                closeCanvasSettingsPanel: (...args) => call('closeCanvasSettingsPanel', ...args),
                closeRunQueuePanel,
                selectAndFitNode
            };
        }

        function renderRunQueuePanelIfOpen() {
            const panel = getRunQueuePanel();
            if (panel && !panel.hidden) renderRunQueuePanel();
        }

        function openRunQueuePanel() {
            const result = typeof runQueueOpenPanel === 'function' ? runQueueOpenPanel(runQueueContext()) : undefined;
            syncRunSidePanelLayout();
            call('renderRunQueueWidget');
            return result;
        }

        function closeRunQueuePanel() {
            const result = typeof runQueueClosePanel === 'function' ? runQueueClosePanel(runQueueContext()) : undefined;
            syncRunSidePanelLayout();
            call('renderRunQueueWidget');
            return result;
        }

        function renderRunQueuePanel() {
            const result = typeof runQueueRenderPanel === 'function' ? runQueueRenderPanel(runQueueContext()) : undefined;
            syncRunSidePanelLayout();
            call('renderRunQueueWidget');
            return result;
        }

        function handleRunQueueAction(button) {
            const result = typeof runQueueHandleAction === 'function' ? runQueueHandleAction(button, runQueueContext()) : undefined;
            syncRunSidePanelLayout();
            call('renderRunQueueWidget');
            return result;
        }

        function openRunHistoryPanel(runId) {
            closeRunQueuePanel();
            const result = typeof runHistoryOpenPanel === 'function' ? runHistoryOpenPanel(runId, runHistoryContext()) : undefined;
            syncRunSidePanelLayout();
            return result;
        }

        function closeRunHistoryPanel() {
            const result = typeof runHistoryClosePanel === 'function' ? runHistoryClosePanel(runHistoryContext()) : undefined;
            syncRunSidePanelLayout();
            return result;
        }

        function renderRunHistoryPanel() {
            const result = typeof runHistoryRenderPanel === 'function' ? runHistoryRenderPanel(runHistoryContext()) : undefined;
            syncRunSidePanelLayout();
            return result;
        }

        function handleRunHistoryAction(button) {
            const result = typeof runHistoryHandleAction === 'function' ? runHistoryHandleAction(button, runHistoryContext()) : undefined;
            syncRunSidePanelLayout();
            return result;
        }

        return {
            syncRunSidePanelLayout,
            renderRunQueuePanelIfOpen,
            openRunQueuePanel,
            closeRunQueuePanel,
            renderRunQueuePanel,
            handleRunQueueAction,
            openRunHistoryPanel,
            closeRunHistoryPanel,
            renderRunHistoryPanel,
            handleRunHistoryAction
        };
    }

    window.SimpAICanvasWorkbenchRunPanels = Object.assign({}, window.SimpAICanvasWorkbenchRunPanels || {}, {
        createCanvasRunPanelsController
    });
})();
