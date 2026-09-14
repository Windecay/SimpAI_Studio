(function () {
    'use strict';

    function createCanvasActionController(context) {
        const scope = context?.actionSource || context || {};
        const languageSource = scope.languageSource || {};
        const projectSource = scope.projectSource || {};
        const viewportSource = scope.viewportSource || {};
        const persistenceSource = scope.persistenceSource || {};
        const contextSource = scope.contextSource || {};
        const lifecycleSource = scope.lifecycleSource || {};
        const importSource = scope.importSource || {};
        const nodeSource = scope.nodeSource || {};
        const navigationSource = scope.navigationSource || {};
        const editSource = scope.editSource || {};
        const runSource = scope.runSource || {};
        const selectionSource = scope.selectionSource || {};
        const settingsSource = scope.settingsSource || {};
        const uiSource = scope.uiSource || {};
        const call = (sourceObject, name, ...args) => typeof sourceObject[name] === 'function'
            ? sourceObject[name](...args)
            : undefined;
        const projectCall = (name, ...args) => call(projectSource, name, ...args);
        const viewportCall = (name, ...args) => call(viewportSource, name, ...args);
        const persistenceCall = (name, ...args) => call(persistenceSource, name, ...args);
        const contextCall = (name, ...args) => call(contextSource, name, ...args);
        const lifecycleCall = (name, ...args) => call(lifecycleSource, name, ...args);
        const importCall = (name, ...args) => call(importSource, name, ...args);
        const nodeCall = (name, ...args) => call(nodeSource, name, ...args);
        const navigationCall = (name, ...args) => call(navigationSource, name, ...args);
        const editCall = (name, ...args) => call(editSource, name, ...args);
        const runCall = (name, ...args) => call(runSource, name, ...args);
        const selectionCall = (name, ...args) => call(selectionSource, name, ...args);
        const settingsCall = (name, ...args) => call(settingsSource, name, ...args);
        const uiCall = (name, ...args) => call(uiSource, name, ...args);
        const getProject = () => projectCall('getProject') || {};
        const t = typeof languageSource.t === 'function' ? languageSource.t : ((en, cn) => cn || en);
        const viewportCenterWorld = () => viewportCall('viewportCenterWorld');

        function saveFromAction() {
            const result = persistenceCall('saveProject') || false;
            if (result && typeof result.catch === 'function') {
                result.catch((err) => console.warn('[SimpAI Canvas] save action failed:', err));
            }
        }

        function handleAction(action, evt, actionButton) {
            contextCall('closeContextMenu');
            switch (action) {
                case 'save':
                    saveFromAction();
                    break;
                case 'project-list':
                    navigationCall('openProjectListPanel');
                    break;
                case 'import-project-json':
                    navigationCall('openProjectJsonPicker');
                    break;
                case 'undo':
                    editCall('undoCanvasEdit');
                    break;
                case 'redo':
                    editCall('redoCanvasEdit');
                    break;
                case 'close':
                    if (lifecycleCall('isStandaloneCanvasWorkbench')) {
                        uiCall('showToast', t('Close this browser tab to leave the standalone canvas page.', '关闭浏览器标签即可退出独立画布页面。'));
                        break;
                    }
                    lifecycleCall('closeWorkbench');
                    break;
                case 'import-selected':
                    importCall('importSelectedTransferAt', viewportCenterWorld());
                    break;
                case 'import-files':
                    importCall('openImageFilePicker', viewportCenterWorld());
                    break;
                case 'media-browser':
                    nodeCall('addMediaBrowserNode', viewportCenterWorld());
                    break;
                case 'add-preset':
                    navigationCall('openPresetPalette', viewportCenterWorld());
                    break;
                case 'add-style-selector':
                    nodeCall('addStyleSelectorNode', viewportCenterWorld());
                    break;
                case 'add-text':
                    nodeCall('addTextNode', viewportCenterWorld());
                    break;
                case 'add-text-merge':
                    nodeCall('addTextMergeNode', viewportCenterWorld());
                    break;
                case 'add-wildcards-helper':
                    nodeCall('addWildcardsHelperNode', viewportCenterWorld());
                    break;
                case 'add-note':
                    nodeCall('addNoteNode', viewportCenterWorld());
                    break;
                case 'add-group':
                    nodeCall('addAreaGroup', viewportCenterWorld());
                    break;
                case 'group-list':
                    navigationCall('openGroupListPanel');
                    break;
                case 'load-demo-workbench':
                    navigationCall('openTemplateLibrary');
                    break;
                case 'add-translation':
                    nodeCall('addTranslationNode', viewportCenterWorld());
                    break;
                case 'add-tag-cart':
                    nodeCall('addTagCartNode', viewportCenterWorld());
                    break;
                case 'add-wd14':
                    nodeCall('addWd14Node', viewportCenterWorld());
                    break;
                case 'add-vlm':
                    nodeCall('addVlmNode', viewportCenterWorld());
                    break;
                case 'add-qwen-tts':
                    nodeCall('addQwenTtsNode', 'voice_design', viewportCenterWorld());
                    break;
                case 'add-sam3-video-mask':
                    nodeCall('addSam3VideoMaskNode', viewportCenterWorld());
                    break;
                case 'add-camera-motion':
                    nodeCall('addCameraMotionNode', viewportCenterWorld());
                    break;
                case 'add-pose-studio':
                    nodeCall('addPoseStudioNode', viewportCenterWorld());
                    break;
                case 'add-gaussian-studio':
                    nodeCall('addGaussianStudioNode', viewportCenterWorld());
                    break;
                case 'add-liveportrait-expression':
                    nodeCall('addLivePortraitExpressionNode', viewportCenterWorld());
                    break;
                case 'add-compare':
                    nodeCall('addCompareNode', viewportCenterWorld());
                    break;
                case 'add-director-timeline':
                    nodeCall('addDirectorTimelineNode', viewportCenterWorld());
                    break;
                case 'add-timeline':
                    nodeCall('addTimelineNode', viewportCenterWorld());
                    break;
                case 'add-output':
                    nodeCall('addManualOutputNode', viewportCenterWorld());
                    break;
                case 'run-history':
                    navigationCall('openRunHistoryPanel');
                    break;
                case 'run-queue':
                    navigationCall('openRunQueuePanel');
                    break;
                case 'run-selected-chain':
                    runCall('runSelectedChain');
                    break;
                case 'compare-selected-nodes':
                    selectionCall('createCompareNodeFromSources', selectionCall('getSelectedNodeIdList').map((id) => selectionCall('getNode', id)).filter((node) => selectionCall('isImageCompareSource', node)).slice(0, 2));
                    break;
                case 'timeline-selected-nodes':
                    selectionCall('createTimelineNodeFromSources', selectionCall('getSelectedNodeIdList').map((id) => selectionCall('getNode', id)).filter((node) => selectionCall('isTimelineSource', node)));
                    break;
                case 'node-search':
                    navigationCall('openNodeSearchPanel');
                    break;
                case 'asset-manager':
                    navigationCall('openAssetManagerPanel');
                    break;
                case 'canvas-manual':
                    navigationCall('openCanvasManual');
                    break;
                case 'toggle-inspector':
                    settingsCall('toggleSetting', 'inspectorCollapsed');
                    break;
                case 'toggle-minimap':
                    settingsCall('toggleSetting', 'minimap');
                    break;
                case 'delete':
                    editCall('deleteSelection');
                    break;
                case 'clear':
                    editCall('clearCanvasWithConfirm');
                    break;
                case 'settings':
                    navigationCall('openCanvasSettingsPanel', 'agent');
                    break;
                case 'zoom-in':
                    viewportCall('zoomAtViewportCenter', 1.15);
                    break;
                case 'zoom-out':
                    viewportCall('zoomAtViewportCenter', 1 / 1.15);
                    break;
                case 'zoom-reset':
                    getProject().viewport.zoom = 1;
                    viewportCall('renderAll', { inspector: false });
                    persistenceCall('scheduleSave');
                    break;
                case 'fit-all':
                    viewportCall('fitAll');
                    break;
                case 'center':
                    viewportCall('centerCanvas');
                    break;
            }
        }

        return { handleAction };
    }

    window.SimpAICanvasWorkbenchAction = Object.assign({}, window.SimpAICanvasWorkbenchAction || {}, {
        createCanvasActionController
    });
})();
