(function () {
    'use strict';

    function createCanvasNodeActionController(context) {
        const scope = context?.nodeActionSource || context || {};
        const actionSource = scope.actionSource || {};
        const selectionSource = scope.selectionSource || {};
        const nodeSource = scope.nodeSource || {};
        const doubleClickSource = scope.doubleClickSource || {};
        const call = (name, ...args) => typeof actionSource[name] === 'function'
            ? actionSource[name](...args)
            : undefined;
        const doubleClickCall = (name, ...args) => typeof doubleClickSource[name] === 'function'
            ? doubleClickSource[name](...args)
            : undefined;
        const setSelectedNodeId = value => selectionSource.setSelectedNodeId?.(value);
        const setSelectedNodeIds = value => selectionSource.setSelectedNodeIds?.(value);
        const setSelectedEdgeId = value => selectionSource.setSelectedEdgeId?.(value);
        const setSelectedGroupId = value => selectionSource.setSelectedGroupId?.(value);
        const selectedNodeIds = () => {
            const value = selectionSource.getSelectedNodeIds?.();
            return value && typeof value.has === 'function' ? value : new Set(value || []);
        };

        function handleNodeAction(node, action, actionElement, evt) {
            if (node?.type === 'result' && call('handleResultInspectorAction', node, action, actionElement, evt)) return;
            if (call('handleTimelineAction', action, node, actionElement)) return;
            if (action === 'toggle-collapse') {
                const targetIds = selectedNodeIds().has(node.id) ? call('getSelectedNodeIdList') : [node.id];
                setSelectedNodeId(node.id);
                setSelectedNodeIds(targetIds);
                setSelectedEdgeId(null);
                setSelectedGroupId(null);
                call('toggleSelectedNodesFlag', 'collapsed');
            } else if (action === 'toggle-note-tail' && node.type === 'note') {
                call('toggleNoteTail', node);
            } else if (action === 'reset-note-tail' && node.type === 'note') {
                call('resetNoteTail', node);
            } else if (action === 'text-merge-add-input' && node.type === 'text_merge') {
                call('addTextMergeInput', node);
            } else if (String(action || '').startsWith('text-merge-remove-input:') && node.type === 'text_merge') {
                call('removeTextMergeInput', node, String(action || '').slice('text-merge-remove-input:'.length));
            } else if (action === 'delete' && node.type !== 'result') {
                setSelectedNodeId(node.id);
                setSelectedNodeIds([node.id]);
                setSelectedEdgeId(null);
                call('deleteSelection', { forceNode: true });
            } else if (action === 'run' && (node.type === 'preset' || node.type === 'classic')) {
                call('runPresetNodeFromUi', node);
            } else if (node?.type === 'batch_any' && call('handleBatchAnyInspectorAction', node, action, evt)) {
                return;
            } else if (action === 'xyz-plot' && (node.type === 'preset' || node.type === 'classic')) {
                call('openXyzPlotPanel', node);
            } else if (action === 'add-style-selector' && node.type === 'preset') {
                call('ensureStyleSelectorForPreset', node, { select: true });
            } else if (action === 'edit-liveportrait-video-expression' && node.type === 'preset') {
                call('openLivePortraitVideoExpressionPresetEditor', node);
            } else if (action === 'edit-ltx23-guides' && node.type === 'preset') {
                call('openLtx23GuidePresetEditor', node);
            } else if (action === 'edit-visual-prompt' && node.type === 'preset') {
                call('openVisualPromptEditor', node);
            } else if (action === 'edit-h3-storyboard' && node.type === 'preset') {
                call('openMiniMaxH3StoryboardPresetEditor', node);
            } else if (action === 'apply-style-selector' && node.type === 'style_selector') {
                call('runStyleSelectorTargetPreset', node);
            } else if (action === 'check-models' && ['preset', 'classic'].includes(node.type)) {
                call('handlePresetModelAction', node);
            } else if (action === 'check-vlm-model' && node.type === 'vlm') {
                call('handleVlmModelAction', node);
            } else if (action === 'run-wd14' && node.type === 'wd14') {
                call('runWd14Node', node);
            } else if (action === 'run-translation' && node.type === 'translation') {
                call('runTranslationNode', node);
            } else if (action === 'open-tag-cart' && node.type === 'tag_cart') {
                call('openTagCartForNode', node, actionElement);
            } else if (action === 'refresh-wildcards-helper' && node.type === 'wildcards_helper') {
                call('refreshWildcardsCatalog', node, { force: true });
            } else if (action === 'open-wildcards-helper-picker' && node.type === 'wildcards_helper') {
                call('openWildcardsV2Panel', node, 'prompt', { tab: 'insert', name: node.params?.name || '' });
            } else if (action === 'open-wildcards-manager') {
                call('openWildcardsManager', node);
            } else if (String(action || '').startsWith('open-wildcards-insert:') && ['preset', 'classic'].includes(node.type)) {
                call('openWildcardsInsertMenu', node, String(action || '').split(':')[1] || 'prompt', actionElement);
            } else if (action === 'run-vlm' && node.type === 'vlm') {
                call('runVlmNode', node);
            } else if (action === 'stop-vlm-chat' && node.type === 'vlm') {
                call('stopVlmChatNode', node);
            } else if (action === 'run-qwen-tts' && call('isQwenTtsNode', node)) {
                call('runQwenTtsNode', node);
            } else if (action === 'stop-qwen-tts' && call('isQwenTtsNode', node)) {
                call('stopQwenTtsNode', node);
            } else if (call('handleDirectorTimelineAction', node, action)) {
            } else if (action === 'clear-vlm-chat' && node.type === 'vlm') {
                call('clearVlmChat', node);
            } else if (action === 'attach-vlm-image' && node.type === 'vlm') {
                call('attachVlmImages', node);
            } else if (action === 'save-vlm-custom-secret' && node.type === 'vlm') {
                call('saveVlmCustomSecret', node);
            } else if (action === 'load-vlm-custom-secret' && node.type === 'vlm') {
                call('loadVlmCustomSecret', node);
            } else if (action === 'delete-vlm-custom-secret' && node.type === 'vlm') {
                call('deleteVlmCustomSecret', node);
            } else if (action === 'fetch-vlm-custom-models' && node.type === 'vlm') {
                call('fetchVlmCustomModels', node);
            } else if (action === 'toggle-vlm-custom-api' && node.type === 'vlm') {
                call('toggleVlmCustomApi', node);
            } else if (action === 'test-vlm-custom-api' && node.type === 'vlm') {
                call('testVlmCustomApi', node);
            } else if (action === 'sync-vlm-custom-from-agent' && node.type === 'vlm') {
                call('syncVlmCustomFromAgent', node);
            } else if (action === 'sync-vlm-custom-to-agent' && node.type === 'vlm') {
                call('syncVlmCustomToAgent', node);
            } else if (action === 'unload-vlm-model' && node.type === 'vlm') {
                call('unloadVlmModel', node);
            } else if (action === 'run-mask' && node.type === 'mask') {
                call('runMaskNode', node);
            } else if (action === 'run-sam3-video-mask' && node.type === 'sam3_video_mask') {
                call('runSam3VideoMaskNode', node);
            } else if (action === 'stop-sam3-video-mask' && node.type === 'sam3_video_mask') {
                call('stopSam3VideoMaskNode', node);
            } else if (action === 'edit-sam3-points' && node.type === 'sam3_video_mask') {
                call('openSam3PointEditor', node);
            } else if (action === 'upload-sam3-mask' && node.type === 'sam3_video_mask') {
                call('uploadSam3MaskForNode', node);
            } else if (action === 'unload-sam3-mask' && node.type === 'sam3_video_mask') {
                call('unloadSam3MaskForNode', node);
            } else if (action === 'generate-camera-motion-reference' && node.type === 'camera_motion') {
                call('runCameraMotionNode', node);
            } else if (action === 'clear-camera-motion-reference' && node.type === 'camera_motion') {
                call('clearCameraMotionNode', node);
            } else if (action === 'edit-pose-studio' && node.type === 'pose_studio') {
                call('openPoseStudioEditor', node);
            } else if (action === 'edit-gaussian-studio' && node.type === 'gaussian_studio') {
                call('openGaussianStudioEditor', node);
            } else if (action === 'edit-liveportrait-expression' && node.type === 'liveportrait_expression') {
                call('openLivePortraitExpressionEditor', node);
            } else if (action === 'edit-mask-asset' && node.type === 'mask') {
                call('openSketchForNode', node);
            } else if (action === 'view-image') {
                call('openImageViewer', node);
            } else if (action === 'view-media') {
                call('openMediaViewer', node);
            } else if (action === 'media-reload') {
                call('reloadMediaNode', node);
            } else if (action === 'compare-fullscreen') {
                call('openCompareFullscreen', node);
            } else if (action === 'timeline-add-selected') {
                call('addSelectedMediaToTimeline', node);
            } else if (action === 'timeline-render-result') {
                call('renderTimelineToResult', node);
            } else if (action === 'timeline-preview-play') {
                call('toggleTimelinePreviewPlayback', node);
            } else if (action === 'timeline-preview-play-full') {
                call('playTimelineFromStart', node);
            } else if (action === 'media-play-toggle') {
                call('playMediaSelection', node);
            } else if (action === 'media-reset-trim') {
                call('resetMediaTrim', node);
            } else if (action === 'replace-image' && node.type !== 'result') {
                call('replaceNodeImage', node);
            } else if (action === 'toggle-image-frameless' && node.type === 'image') {
                call('pushHistory', call('isImageNodeFrameless', node) ? 'Show image frame' : 'Hide image frame');
                Object.assign(node, call('buildMediaNodeStatePatch', node, {
                    displayMode: call('isImageNodeFrameless', node) ? 'card' : 'frameless'
                }));
                call('mutate', { inspector: selectionSource.getSelectedNodeId?.() === node.id });
            } else if (action === 'edit-mask') {
                call('openMaskEditor', node);
            } else if (action === 'sketch-edit') {
                call('openSketchForNode', node);
            } else if (action === 'layerforge-edit' && node.type !== 'result') {
                call('openLayerForgeForNode', node);
            } else if (action === 'models-config') {
                call('ensureConfigNode', node, 'models');
            } else if (action === 'styles-config') {
                call('ensureConfigNode', node, 'styles');
            } else if (action === 'resolution-config') {
                call('ensureConfigNode', node, 'resolution');
            } else if (action === 'advanced-config') {
                call('ensureConfigNode', node, 'advanced');
            } else if (action === 'xyz-locate-source' && (node.type === 'xy_matrix' || node.type === 'xyz_matrix')) {
                call('focusXyzMatrixSource', node);
            } else if (String(action || '').startsWith('xyz-cell:') && (node.type === 'xy_matrix' || node.type === 'xyz_matrix')) {
                call('selectXyzMatrixCell', node, String(action || '').slice('xyz-cell:'.length));
            }
        }

        function handleNodeActionEvent(node, evt) {
            if (!evt?.target) return false;
            const actionElement = evt.target.closest('[data-node-action]');
            if (!actionElement) return false;
            evt.preventDefault();
            evt.stopPropagation();
            handleNodeAction(node, actionElement.getAttribute('data-node-action'), actionElement, evt);
            return true;
        }

        function handleInspectorAction(action, button, evt) {
            const selectedNode = () => nodeSource.getNode?.(selectionSource.getSelectedNodeId?.());
            if (call('handleTimelineAction', action, selectedNode(), button)) return;
            if (action === 'delete-edge') call('deleteEdge', selectionSource.getSelectedEdgeId?.());
            else if (action === 'delete-group') call('deleteSelectedGroup');
            else if (action === 'jump-group') call('focusGroup', call('getGroup', selectionSource.getSelectedGroupId?.()));
            else if (action === 'delete') call('deleteSelection');
            else if (action === 'duplicate') call('duplicateSelection');
            else if (action === 'toggle-lock') call('toggleSelectedNodesFlag', 'locked');
            else if (action === 'toggle-ignore') call('toggleSelectedNodesFlag', 'ignored');
            else if (action === 'toggle-collapse') call('toggleSelectedNodesFlag', 'collapsed');
            else if (action === 'compare-selected') {
                const nodes = (call('getSelectedNodeIdList') || [])
                    .map(id => nodeSource.getNode?.(id))
                    .filter(node => call('isImageCompareSource', node))
                    .slice(0, 2);
                call('createCompareNodeFromSources', nodes);
            } else if (action === 'timeline-selected') {
                const nodes = (call('getSelectedNodeIdList') || [])
                    .map(id => nodeSource.getNode?.(id))
                    .filter(node => call('isTimelineSource', node));
                call('createTimelineNodeFromSources', nodes);
            } else if (action.startsWith('align-')) call('alignSelectedNodes', action.replace('align-', ''));
            else if (action.startsWith('distribute-')) call('distributeSelectedNodes', action.replace('distribute-', ''));
            else if (action === 'view-image') call('openImageViewer', selectedNode());
            else if (action === 'view-media') call('openMediaViewer', selectedNode());
            else if (action === 'media-reload') call('reloadMediaNode', selectedNode());
            else if (action === 'compare-fullscreen') call('openCompareFullscreen', selectedNode());
            else if (action === 'compare-swap') call('swapCompareInputs', selectedNode());
            else if (action === 'timeline-add-selected') call('addSelectedMediaToTimeline', selectedNode());
            else if (action === 'timeline-render-result') call('renderTimelineToResult', selectedNode());
            else if (action === 'media-reset-trim') call('resetMediaTrim', selectedNode());
            else if (action === 'replace-image') call('replaceNodeImage', selectedNode());
            else if (action === 'edit-mask') call('openMaskEditor', selectedNode());
            else if (action === 'metadata-copy-prompt') call('copyNodeGenerationMetadataPrompt', selectedNode());
            else if (action === 'metadata-to-generator') call('applyNodeGenerationMetadataToPromptTarget', selectedNode());
            else if (action === 'models-config') call('ensureConfigNode', selectedNode(), 'models');
            else if (action === 'styles-config') call('ensureConfigNode', selectedNode(), 'styles');
            else if (action === 'resolution-config') call('ensureConfigNode', selectedNode(), 'resolution');
            else if (action === 'advanced-config') call('ensureConfigNode', selectedNode(), 'advanced');
            else if (action.startsWith('detection-config-')) {
                call('ensureConfigNode', selectedNode(), call('detectionSlotForRegion', Number(action.replace('detection-config-', '')) || 0));
            } else if (action === 'check-models') {
                const node = selectedNode();
                if (node && ['preset', 'classic'].includes(node.type)) call('handlePresetModelAction', node);
            } else if (action === 'run') {
                const node = selectedNode();
                if (node && ['preset', 'classic'].includes(node.type)) call('runPresetNodeFromUi', node);
            } else {
                const node = selectedNode();
                if (node) handleNodeAction(node, action, button, evt);
            }
        }

        function bindInspectorActionEvents(inspector) {
            if (!inspector?.querySelectorAll) return false;
            inspector.querySelectorAll('[data-inspector-action]').forEach((button) => {
                button.addEventListener('click', (evt) => {
                    handleInspectorAction(button.getAttribute('data-inspector-action'), button, evt);
                });
            });
            return true;
        }

        function bindInspectorNodeActionEvents(inspector) {
            if (!inspector?.querySelectorAll) return false;
            inspector.querySelectorAll('[data-node-action]').forEach((button) => {
                button.addEventListener('click', (evt) => {
                    evt.preventDefault();
                    evt.stopPropagation();
                    const nodeId = selectionSource.getSelectedNodeId?.();
                    const node = nodeSource.getNode?.(nodeId);
                    if (node) handleNodeAction(node, button.getAttribute('data-node-action'), button, evt);
                });
            });
            return true;
        }

        function handleNodeDoubleClick(node, evt) {
            const resultAsset = evt.target.closest('[data-result-asset-index]');
            if (resultAsset && node.type === 'result') {
                evt.preventDefault();
                evt.stopPropagation();
                const index = Number(resultAsset.getAttribute('data-result-asset-index')) || 0;
                doubleClickCall('selectResultAsset', node, index);
                doubleClickCall('createMediaNodeFromResultAsset', node, index);
                return;
            }
            const inputPortHandle = evt.target.closest(doubleClickCall('getInputPortHandleSelector') || '');
            if (inputPortHandle) {
                const target = doubleClickCall('getConnectionTargetFromHandle', inputPortHandle);
                if (target) {
                    evt.preventDefault();
                    evt.stopPropagation();
                    const edges = doubleClickCall('inputTargetEdges', target) || [];
                    if (edges.length && !doubleClickCall('inputTargetAcceptsMultiple', target)) {
                        const source = doubleClickCall('getNode', edges[0].from);
                        if (source) doubleClickCall('focusNode', source);
                        else doubleClickCall('notifyMissingInputSource');
                    } else {
                        doubleClickCall('createDefaultInputSource', target);
                    }
                    return;
                }
            }
            const uploadRow = evt.target.closest('[data-slot-row]');
            const uploadHandle = evt.target.closest('[data-handle-in]');
            if ((uploadRow || uploadHandle) && ['preset', 'classic'].includes(node.type)) {
                evt.preventDefault();
                evt.stopPropagation();
                const slot = uploadHandle?.getAttribute('data-handle-in') || uploadRow?.getAttribute('data-slot-row') || '';
                const handle = uploadHandle || uploadRow?.querySelector?.('[data-handle-in]') || uploadRow;
                if (node.type === 'classic' && slot === 'inpaint_mask') doubleClickCall('createAdvancedMaskNodeForClassicInput', node, handle);
                else doubleClickCall('createNodeForUploadInput', node, slot, handle);
                return;
            }
            if (node.type === 'preset' && doubleClickCall('isStyleTransferPresetNode', node) && !doubleClickCall('isInteractiveTarget', evt.target)) {
                evt.preventDefault();
                evt.stopPropagation();
                doubleClickCall('ensureStyleSelectorForPreset', node, { select: true });
                return;
            }
            const sam3VideoRow = evt.target.closest('[data-sam3-video-row]');
            const sam3VideoHandle = evt.target.closest('[data-sam3-video-in]');
            if ((sam3VideoRow || sam3VideoHandle) && node.type === 'sam3_video_mask') {
                evt.preventDefault();
                evt.stopPropagation();
                doubleClickCall('uploadSourceVideoForSam3Node', node, sam3VideoHandle || sam3VideoRow);
                return;
            }
            const poseReferenceHandle = evt.target.closest('[data-pose-studio-reference-in]');
            if (poseReferenceHandle && node.type === 'pose_studio') {
                evt.preventDefault();
                evt.stopPropagation();
                doubleClickCall('createImageNodeForImageInput', node, 'pose_studio', 'reference', poseReferenceHandle);
                return;
            }
            const gaussianReferenceHandle = evt.target.closest('[data-gaussian-studio-reference-in]');
            if (gaussianReferenceHandle && node.type === 'gaussian_studio') {
                evt.preventDefault();
                evt.stopPropagation();
                doubleClickCall('createImageNodeForImageInput', node, 'gaussian_studio', 'reference', gaussianReferenceHandle);
                return;
            }
            const livePortraitSourceHandle = evt.target.closest('[data-liveportrait-expression-source-in]');
            if (livePortraitSourceHandle && node.type === 'liveportrait_expression') {
                evt.preventDefault();
                evt.stopPropagation();
                doubleClickCall('createImageNodeForImageInput', node, 'liveportrait_expression_source', 'source', livePortraitSourceHandle);
                return;
            }
            const livePortraitReferenceHandle = evt.target.closest('[data-liveportrait-expression-reference-in]');
            if (livePortraitReferenceHandle && node.type === 'liveportrait_expression') {
                evt.preventDefault();
                evt.stopPropagation();
                doubleClickCall('createImageNodeForImageInput', node, 'liveportrait_expression_reference', 'reference', livePortraitReferenceHandle);
                return;
            }
            if (node.type === 'pose_studio' && !doubleClickCall('isInteractiveTarget', evt.target)) {
                evt.preventDefault();
                evt.stopPropagation();
                doubleClickCall('openPoseStudioEditor', node);
                return;
            }
            if (node.type === 'gaussian_studio' && !doubleClickCall('isInteractiveTarget', evt.target)) {
                evt.preventDefault();
                evt.stopPropagation();
                doubleClickCall('openGaussianStudioEditor', node);
                return;
            }
            if (node.type === 'liveportrait_expression' && !doubleClickCall('isInteractiveTarget', evt.target)) {
                evt.preventDefault();
                evt.stopPropagation();
                doubleClickCall('openLivePortraitExpressionEditor', node);
                return;
            }
            const wd14ImageHandle = evt.target.closest('[data-wd14-image-in]');
            if (wd14ImageHandle && node.type === 'wd14') {
                evt.preventDefault();
                evt.stopPropagation();
                doubleClickCall('createImageNodeForImageInput', node, 'wd14', 'image', wd14ImageHandle);
                return;
            }
            const vlmImageHandle = evt.target.closest('[data-vlm-image-in]');
            if (vlmImageHandle && node.type === 'vlm') {
                evt.preventDefault();
                evt.stopPropagation();
                doubleClickCall('createImageNodeForImageInput', node, 'vlm', vlmImageHandle.getAttribute('data-vlm-image-in') || 'image_1', vlmImageHandle);
                return;
            }
            const maskSourceHandle = evt.target.closest('[data-mask-source-in]');
            if (maskSourceHandle && node.type === 'mask') {
                evt.preventDefault();
                evt.stopPropagation();
                doubleClickCall('createImageNodeForImageInput', node, 'mask_source', 'source', maskSourceHandle);
                return;
            }
            const compareImageHandle = evt.target.closest('[data-compare-image-in]');
            if (compareImageHandle && node.type === 'compare') {
                evt.preventDefault();
                evt.stopPropagation();
                doubleClickCall('createImageNodeForImageInput', node, 'compare', compareImageHandle.getAttribute('data-compare-image-in') || 'a', compareImageHandle);
                return;
            }
            const configInterface = evt.target.closest('[data-config-interface]');
            if (!configInterface || !['preset', 'classic'].includes(node.type)) return;
            evt.preventDefault();
            evt.stopPropagation();
            doubleClickCall('ensureConfigNode', node, configInterface.getAttribute('data-config-interface'));
        }

        return { handleNodeAction, handleNodeActionEvent, handleInspectorAction, bindInspectorActionEvents, bindInspectorNodeActionEvents, handleNodeDoubleClick };
    }

    window.SimpAICanvasWorkbenchNodeAction = Object.assign({}, window.SimpAICanvasWorkbenchNodeAction || {}, {
        createCanvasNodeActionController
    });
})();
