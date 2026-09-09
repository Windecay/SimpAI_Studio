(function () {
    'use strict';

    function createCanvasActionController(context) {
        const scope = context || {};
        const call = (name, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : undefined;
        const getProject = () => typeof scope.getProject === 'function' ? (scope.getProject() || {}) : {};
        const t = typeof scope.t === 'function' ? scope.t : ((en, cn) => cn || en);
        const viewportCenterWorld = () => call('viewportCenterWorld');

        function saveFromAction() {
            const result = call('saveProject', false);
            if (result && typeof result.catch === 'function') {
                result.catch((err) => console.warn('[SimpAI Canvas] save action failed:', err));
            }
        }

        function handleAction(action, evt, actionButton) {
            call('closeContextMenu');
            switch (action) {
                case 'save':
                    saveFromAction();
                    break;
                case 'project-list':
                    call('openProjectListPanel');
                    break;
                case 'import-project-json':
                    call('openProjectJsonPicker');
                    break;
                case 'undo':
                    call('undoCanvasEdit');
                    break;
                case 'redo':
                    call('redoCanvasEdit');
                    break;
                case 'close':
                    if (call('isStandaloneCanvasWorkbench')) {
                        call('showToast', t('Close this browser tab to leave the standalone canvas page.', '关闭浏览器标签即可退出独立画布页面。'));
                        break;
                    }
                    call('closeWorkbench');
                    break;
                case 'import-selected':
                    call('importSelectedTransferAt', viewportCenterWorld());
                    break;
                case 'import-files':
                    call('openImageFilePicker', viewportCenterWorld());
                    break;
                case 'media-browser':
                    call('addMediaBrowserNode', viewportCenterWorld());
                    break;
                case 'add-preset':
                    call('openPresetPalette', viewportCenterWorld());
                    break;
                case 'add-style-selector':
                    call('addStyleSelectorNode', viewportCenterWorld());
                    break;
                case 'add-text':
                    call('addTextNode', viewportCenterWorld());
                    break;
                case 'add-text-merge':
                    call('addTextMergeNode', viewportCenterWorld());
                    break;
                case 'add-wildcards-helper':
                    call('addWildcardsHelperNode', viewportCenterWorld());
                    break;
                case 'add-note':
                    call('addNoteNode', viewportCenterWorld());
                    break;
                case 'add-group':
                    call('addAreaGroup', viewportCenterWorld());
                    break;
                case 'group-list':
                    call('openGroupListPanel');
                    break;
                case 'load-demo-workbench':
                    call('openTemplateLibrary');
                    break;
                case 'add-translation':
                    call('addTranslationNode', viewportCenterWorld());
                    break;
                case 'add-tag-cart':
                    call('addTagCartNode', viewportCenterWorld());
                    break;
                case 'add-wd14':
                    call('addWd14Node', viewportCenterWorld());
                    break;
                case 'add-vlm':
                    call('addVlmNode', viewportCenterWorld());
                    break;
                case 'add-qwen-tts':
                    call('addQwenTtsNode', 'voice_design', viewportCenterWorld());
                    break;
                case 'add-sam3-video-mask':
                    call('addSam3VideoMaskNode', viewportCenterWorld());
                    break;
                case 'add-camera-motion':
                    call('addCameraMotionNode', viewportCenterWorld());
                    break;
                case 'add-pose-studio':
                    call('addPoseStudioNode', viewportCenterWorld());
                    break;
                case 'add-gaussian-studio':
                    call('addGaussianStudioNode', viewportCenterWorld());
                    break;
                case 'add-liveportrait-expression':
                    call('addLivePortraitExpressionNode', viewportCenterWorld());
                    break;
                case 'add-compare':
                    call('addCompareNode', viewportCenterWorld());
                    break;
                case 'add-director-timeline':
                    call('addDirectorTimelineNode', viewportCenterWorld());
                    break;
                case 'add-timeline':
                    call('addTimelineNode', viewportCenterWorld());
                    break;
                case 'add-output':
                    call('addManualOutputNode', viewportCenterWorld());
                    break;
                case 'run-history':
                    call('openRunHistoryPanel');
                    break;
                case 'run-queue':
                    call('openRunQueuePanel');
                    break;
                case 'run-selected-chain':
                    call('runSelectedChain');
                    break;
                case 'compare-selected-nodes':
                    call('createCompareNodeFromSources', call('getSelectedNodeIdList').map((id) => call('getNode', id)).filter((node) => call('isImageCompareSource', node)).slice(0, 2));
                    break;
                case 'timeline-selected-nodes':
                    call('createTimelineNodeFromSources', call('getSelectedNodeIdList').map((id) => call('getNode', id)).filter((node) => call('isTimelineSource', node)));
                    break;
                case 'node-search':
                    call('openNodeSearchPanel');
                    break;
                case 'asset-manager':
                    call('openAssetManagerPanel');
                    break;
                case 'canvas-manual':
                    call('openCanvasManual');
                    break;
                case 'toggle-inspector':
                    call('toggleSetting', 'inspectorCollapsed');
                    break;
                case 'toggle-minimap':
                    call('toggleSetting', 'minimap');
                    break;
                case 'delete':
                    call('deleteSelection');
                    break;
                case 'clear':
                    call('clearCanvasWithConfirm');
                    break;
                case 'settings':
                    call('openCanvasSettingsPanel', 'agent');
                    break;
                case 'zoom-in':
                    call('zoomAtViewportCenter', 1.15);
                    break;
                case 'zoom-out':
                    call('zoomAtViewportCenter', 1 / 1.15);
                    break;
                case 'zoom-reset':
                    getProject().viewport.zoom = 1;
                    call('renderAll', { inspector: false });
                    call('scheduleSave');
                    break;
                case 'fit-all':
                    call('fitAll');
                    break;
                case 'center':
                    call('centerCanvas');
                    break;
            }
        }

        return { handleAction };
    }

    window.SimpAICanvasWorkbenchAction = Object.assign({}, window.SimpAICanvasWorkbenchAction || {}, {
        createCanvasActionController
    });
})();
