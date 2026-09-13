(function () {
    'use strict';

    function createCanvasRunPanelsController(context) {
        const scope = context || {};
        const sourceObject = (name) => {
            const value = scope[name];
            return value && typeof value === 'object' ? value : {};
        };
        const projectSource = sourceObject('projectSource');
        const projectCall = (name, fallback, ...args) => typeof projectSource[name] === 'function'
            ? projectSource[name](...args)
            : fallback;
        const domSource = sourceObject('domSource');
        const domCall = (name, fallback, ...args) => typeof domSource[name] === 'function'
            ? domSource[name](...args)
            : fallback;
        const stateSource = sourceObject('stateSource');
        const stateCall = (name, fallback, ...args) => typeof stateSource[name] === 'function'
            ? stateSource[name](...args)
            : fallback;
        const languageSource = sourceObject('languageSource');
        const languageCall = (name, fallback, ...args) => typeof languageSource[name] === 'function'
            ? languageSource[name](...args)
            : fallback;
        const getLanguageState = (...args) => languageCall('getLanguageState', { __lang: 'en' }, ...args);
        const t = (...args) => {
            const en = args[0] || '';
            const cn = args.length > 1 ? args[1] : en;
            const state = args.length > 2 ? args[2] : getLanguageState();
            return languageCall('t', cn || en, en, cn, state);
        };
        const queueSource = sourceObject('queueSource');
        const historySource = sourceObject('historySource');
        const statusSource = sourceObject('statusSource');
        const utilitySource = sourceObject('utilitySource');
        const uiSource = sourceObject('uiSource');
        const nodeSource = sourceObject('nodeSource');
        const actionSource = sourceObject('actionSource');
        const renderSource = sourceObject('renderSource');
        const actionCall = (name, fallback, ...args) => typeof actionSource[name] === 'function'
            ? actionSource[name](...args)
            : fallback;
        const renderCall = (name, fallback, ...args) => typeof renderSource[name] === 'function'
            ? renderSource[name](...args)
            : fallback;
        const getProject = () => projectCall('getProject', {}) || {};
        const getRoot = () => domCall('getRoot', null);
        const getRunQueuePanel = () => domCall('getRunQueuePanel', null);
        const getRunHistoryPanel = () => domCall('getRunHistoryPanel', null);
        const getSelectedHistoryId = () => stateCall('getRunHistorySelectedId', null);
        const setSelectedHistoryId = (id) => {
            stateCall('setRunHistorySelectedId', undefined, id || null);
        };
        const runQueueOpenPanel = queueSource.openPanel;
        const runQueueClosePanel = queueSource.closePanel;
        const runQueueRenderPanel = queueSource.renderPanel;
        const runQueueHandleAction = queueSource.handleAction;
        const runHistoryOpenPanel = historySource.openPanel;
        const runHistoryClosePanel = historySource.closePanel;
        const runHistoryRenderPanel = historySource.renderPanel;
        const runHistoryHandleAction = historySource.handleAction;
        const selectAndFitNode = (node) => actionCall('selectAndFitNode', undefined, node);
        const getNode = (id) => typeof nodeSource.getNode === 'function' ? nodeSource.getNode(id) : null;
        const escapeHtml = typeof utilitySource.escapeHtml === 'function' ? utilitySource.escapeHtml : (value) => String(value ?? '');
        const formatLocalTime = typeof utilitySource.formatLocalTime === 'function' ? utilitySource.formatLocalTime : (value) => String(value || '');
        const isTerminalRunState = typeof statusSource.isTerminalRunState === 'function'
            ? statusSource.isTerminalRunState
            : (() => false);
        const showToast = (message) => {
            if (typeof uiSource.showToast === 'function') uiSource.showToast(message);
        };

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
                t,
                escapeHtml,
                formatLocalTime,
                isTerminalRunState,
                showToast,
                getNode,
                getRunQueuePanel,
                closeCanvasSettingsPanel: (...args) => actionCall('closeCanvasSettingsPanel', undefined, ...args),
                closeRunHistoryPanel,
                openRunHistoryPanel,
                controlResultRun: (...args) => actionCall('controlResultRun', undefined, ...args),
                retryResultRun: (...args) => actionCall('retryResultRun', undefined, ...args),
                selectAndFitNode
            };
        }

        function runHistoryContext() {
            return {
                getProject,
                t,
                escapeHtml,
                formatLocalTime,
                isTerminalRunState,
                showToast,
                getNode,
                getRunHistoryPanel,
                getRunHistorySelectedId: getSelectedHistoryId,
                setRunHistorySelectedId: setSelectedHistoryId,
                closeCanvasSettingsPanel: (...args) => actionCall('closeCanvasSettingsPanel', undefined, ...args),
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
            renderCall('renderRunQueueWidget', undefined);
            return result;
        }

        function closeRunQueuePanel() {
            const result = typeof runQueueClosePanel === 'function' ? runQueueClosePanel(runQueueContext()) : undefined;
            syncRunSidePanelLayout();
            renderCall('renderRunQueueWidget', undefined);
            return result;
        }

        function renderRunQueuePanel() {
            const result = typeof runQueueRenderPanel === 'function' ? runQueueRenderPanel(runQueueContext()) : undefined;
            syncRunSidePanelLayout();
            renderCall('renderRunQueueWidget', undefined);
            return result;
        }

        function handleRunQueueAction(button) {
            const result = typeof runQueueHandleAction === 'function' ? runQueueHandleAction(button, runQueueContext()) : undefined;
            syncRunSidePanelLayout();
            renderCall('renderRunQueueWidget', undefined);
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
