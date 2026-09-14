(function () {
    'use strict';

    function createCanvasHistoryController(context) {
        const scope = context || {};
        const sourceObject = (name) => {
            const value = scope[name];
            return value && typeof value === 'object' ? value : {};
        };
        const languageSource = sourceObject('languageSource');
        const configSource = sourceObject('configSource');
        const projectSource = sourceObject('projectSource');
        const storageSource = sourceObject('storageSource');
        const selectionSource = sourceObject('selectionSource');
        const domSource = sourceObject('domSource');
        const runtimeSource = sourceObject('runtimeSource');
        const renderSource = sourceObject('renderSource');
        const interactionSource = sourceObject('interactionSource');
        const persistenceSource = sourceObject('persistenceSource');
        const uiSource = sourceObject('uiSource');
        const sourceCall = (source, name, fallback, ...args) => typeof source[name] === 'function'
            ? source[name](...args)
            : fallback;
        const configCall = (name, fallback, ...args) => sourceCall(configSource, name, fallback, ...args);
        const projectCall = (name, fallback, ...args) => sourceCall(projectSource, name, fallback, ...args);
        const storageCall = (name, fallback, ...args) => sourceCall(storageSource, name, fallback, ...args);
        const selectionCall = (name, fallback, ...args) => sourceCall(selectionSource, name, fallback, ...args);
        const domCall = (name, fallback, ...args) => sourceCall(domSource, name, fallback, ...args);
        const renderCall = (name, fallback, ...args) => sourceCall(renderSource, name, fallback, ...args);
        const interactionCall = (name, fallback, ...args) => sourceCall(interactionSource, name, fallback, ...args);
        const persistenceCall = (name, fallback, ...args) => sourceCall(persistenceSource, name, fallback, ...args);
        const uiCall = (name, fallback, ...args) => sourceCall(uiSource, name, fallback, ...args);
        const t = typeof languageSource.t === 'function' ? languageSource.t : ((en, cn) => cn || en);
        const setTimer = typeof runtimeSource.setTimeout === 'function'
            ? runtimeSource.setTimeout
            : (typeof setTimeout === 'function' ? setTimeout : (() => 0));
        const clearTimer = typeof runtimeSource.clearTimeout === 'function'
            ? runtimeSource.clearTimeout
            : (typeof clearTimeout === 'function' ? clearTimeout : (() => {}));
        const historyLimit = Math.max(1, Number(configCall('getHistoryLimit', 32)) || 32);
        const historyMemoryBudgetBytes = Math.max(1, Number(configCall('getHistoryMemoryBudgetBytes', 48 * 1024 * 1024)) || 48 * 1024 * 1024);
        let undoStack = [];
        let redoStack = [];
        let historyBatchKey = '';
        let historyBatchTimer = 0;

        function cloneProjectForHistory() {
            const project = projectCall('getProject', {}) || {};
            return projectCall('compactProjectForStorage', project, project, {
                stripAllMaterializedDataUrls: true,
                maxInlineDataUrlChars: Number.MAX_SAFE_INTEGER,
                stripStorage: false,
                runHistoryLimit: 8
            });
        }

        function selectionSnapshot() {
            const selection = selectionCall('getSelectionState', {}) || {};
            const ids = selection.selectedNodeIds instanceof Set
                ? Array.from(selection.selectedNodeIds)
                : (Array.isArray(selection.selectedNodeIds) ? selection.selectedNodeIds.slice() : []);
            return {
                selectedNodeId: selection.selectedNodeId || null,
                selectedEdgeId: selection.selectedEdgeId || null,
                selectedGroupId: selection.selectedGroupId || null,
                selectedNodeIds: ids
            };
        }

        function createHistoryEntry(label) {
            const snapshot = cloneProjectForHistory();
            try {
                const projectText = JSON.stringify(snapshot);
                const selection = selectionSnapshot();
                return {
                    label: label || 'Edit canvas',
                    projectText,
                    memoryBytes: projectText.length * 2,
                    selectedNodeId: selection.selectedNodeId,
                    selectedEdgeId: selection.selectedEdgeId,
                    selectedGroupId: selection.selectedGroupId,
                    selectedNodeIds: selection.selectedNodeIds
                };
            } catch (err) {
                return null;
            }
        }

        function historyMemoryBytes() {
            return [...undoStack, ...redoStack].reduce((total, entry) => total + Math.max(0, Number(entry?.memoryBytes) || 0), 0);
        }

        function trimHistory(preferredStack) {
            const otherStack = preferredStack === undoStack ? redoStack : undoStack;
            while (
                undoStack.length + redoStack.length > historyLimit
                || historyMemoryBytes() > historyMemoryBudgetBytes
            ) {
                if (otherStack.length) {
                    otherStack.shift();
                } else if (preferredStack.length > 1) {
                    preferredStack.shift();
                } else {
                    break;
                }
            }
        }

        function appendHistoryEntry(stack, entry) {
            if (!entry) return false;
            stack.push(entry);
            trimHistory(stack);
            return stack.includes(entry);
        }

        function getHistoryState() {
            return {
                undoCount: undoStack.length,
                redoCount: redoStack.length,
                historyBatchKey
            };
        }

        function renderHistoryButtons() {
            const root = domCall('getRoot', null);
            if (!root) return;
            const undoButton = root.querySelector?.('[data-canvas-action="undo"]');
            const redoButton = root.querySelector?.('[data-canvas-action="redo"]');
            if (undoButton) undoButton.disabled = !undoStack.length;
            if (redoButton) redoButton.disabled = !redoStack.length;
        }

        function pushHistory(label) {
            const entry = createHistoryEntry(label);
            if (!entry) return;
            const last = undoStack[undoStack.length - 1];
            if (last?.projectText === entry.projectText) return;
            redoStack = [];
            appendHistoryEntry(undoStack, entry);
            renderHistoryButtons();
        }

        function pushHistoryBatch(key, label) {
            const nextKey = String(key || label || 'edit');
            if (historyBatchKey !== nextKey) {
                pushHistory(label);
                historyBatchKey = nextKey;
            }
            clearTimer(historyBatchTimer);
            historyBatchTimer = setTimer(() => {
                historyBatchKey = '';
            }, 900);
        }

        function restoreHistoryEntry(entry) {
            if (!entry?.projectText) return false;
            const currentProject = projectCall('getProject', {}) || {};
            const storageScope = storageCall('getStorageScope', {});
            const storageKey = storageCall('getStorageKey', '');
            const storage = currentProject.storage || storageCall('buildProjectStorageInfo', {}, storageKey, storageScope);
            let restoredProject;
            try {
                restoredProject = JSON.parse(entry.projectText);
            } catch (err) {
                return false;
            }
            restoredProject = projectCall('sanitizeProject', restoredProject, restoredProject) || restoredProject;
            restoredProject.storage = restoredProject.storage || storage;
            projectCall('setProject', null, restoredProject);
            renderCall('resetRenderedProjectDomCache', null);
            selectionCall('setSelectionState', null, {
                selectedNodeId: entry.selectedNodeId || null,
                selectedEdgeId: entry.selectedEdgeId || null,
                selectedGroupId: entry.selectedGroupId || null,
                selectedNodeIds: Array.isArray(entry.selectedNodeIds)
                    ? entry.selectedNodeIds
                    : (entry.selectedNodeId ? [entry.selectedNodeId] : [])
            });
            interactionCall('closeContextMenu', null);
            persistenceCall('scheduleSave', null);
            renderCall('renderAll', null);
            return true;
        }

        function undoCanvasEdit() {
            if (!undoStack.length) {
                uiCall('showToast', null, t('No canvas edits to undo', '没有可撤销的画布编辑'));
                return false;
            }
            const entry = undoStack.pop();
            appendHistoryEntry(redoStack, createHistoryEntry('Redo snapshot'));
            const restored = restoreHistoryEntry(entry);
            if (!restored) return false;
            uiCall('showToast', null, t('Undo: {label}', '撤销：{label}').replace('{label}', entry.label || t('Edit canvas', '编辑画布')));
            renderHistoryButtons();
            return true;
        }

        function redoCanvasEdit() {
            if (!redoStack.length) {
                uiCall('showToast', null, t('No canvas edits to redo', '没有可重做的画布编辑'));
                return false;
            }
            const entry = redoStack.pop();
            appendHistoryEntry(undoStack, createHistoryEntry('Undo snapshot'));
            const restored = restoreHistoryEntry(entry);
            if (!restored) return false;
            uiCall('showToast', null, t('Canvas edit redone', '已重做画布编辑'));
            renderHistoryButtons();
            return true;
        }

        function resetHistory() {
            undoStack = [];
            redoStack = [];
            historyBatchKey = '';
            clearTimer(historyBatchTimer);
            historyBatchTimer = 0;
            renderHistoryButtons();
        }

        return {
            pushHistory,
            pushHistoryBatch,
            undoCanvasEdit,
            redoCanvasEdit,
            renderHistoryButtons,
            resetHistory,
            getHistoryState
        };
    }

    window.SimpAICanvasWorkbenchHistory = Object.assign({}, window.SimpAICanvasWorkbenchHistory || {}, {
        createCanvasHistoryController
    });
})();
