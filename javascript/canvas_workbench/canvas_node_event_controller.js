(function () {
    'use strict';

    function createCanvasNodeEventController(context) {
        const source = context?.nodeEventSource || context || {};
        const call = (name, fallback, ...args) => typeof source[name] === 'function'
            ? source[name](...args)
            : fallback;

        function bindImageNodeDropEvents(nodeEl, node) {
            if (!nodeEl?.addEventListener || !node) return false;
            const supportsImageDrop = dataTransfer => {
                if (!dataTransfer) return false;
                const files = Array.from(dataTransfer.files || []);
                if (files.some(file => call('isImageFile', false, file))) return true;
                const items = Array.from(dataTransfer.items || []);
                if (items.some(item => item.kind === 'file' && item.type && item.type.startsWith('image/'))) return true;
                const types = dataTransfer.types ? Array.from(dataTransfer.types) : [];
                if (types.includes('application/x-simpleai-transfer-id')) return true;
                return types.includes('Files');
            };
            const isImageDropZoneEvent = evt => !!evt?.target?.closest?.('[data-image-drop-zone],.sai-canvas-node-image');
            const setActive = active => nodeEl.classList?.toggle?.('is-image-drop-target', !!active);

            nodeEl.addEventListener('dragenter', evt => {
                if (!isImageDropZoneEvent(evt) || !supportsImageDrop(evt.dataTransfer)) return;
                evt.preventDefault();
                evt.stopPropagation();
                setActive(true);
            }, true);
            nodeEl.addEventListener('dragover', evt => {
                if (!isImageDropZoneEvent(evt) || !supportsImageDrop(evt.dataTransfer)) return;
                evt.preventDefault();
                evt.stopPropagation();
                evt.dataTransfer.dropEffect = 'copy';
                setActive(true);
            }, true);
            nodeEl.addEventListener('dragleave', evt => {
                if (evt.relatedTarget && nodeEl.contains?.(evt.relatedTarget)) return;
                setActive(false);
            }, true);
            nodeEl.addEventListener('drop', async evt => {
                if (!isImageDropZoneEvent(evt) || !supportsImageDrop(evt.dataTransfer)) return;
                evt.preventDefault();
                evt.stopPropagation();
                setActive(false);
                call('clearViewportDropTarget');
                await call('handleImageNodeDrop', undefined, node, evt.dataTransfer);
            }, true);
            return true;
        }

        function bindNodeEvents(nodeEl, node) {
            if (!nodeEl?.addEventListener || !node) return false;
            if (nodeEl.__simpaiNodeEventsBound) {
                call('injectParamResetButtons', undefined, nodeEl);
                call('bindNodeMediaControlEvents', undefined, nodeEl);
                call('bindResultNodePreviewAspect', undefined, nodeEl, node);
                call('bindPresetSpecialViewerEvents', undefined, nodeEl, node);
                return true;
            }
            nodeEl.__simpaiNodeEventsBound = true;
            if (node.type === 'image') bindImageNodeDropEvents(nodeEl, node);
            if (node.type === 'vlm') call('bindVlmChatDropEvents', undefined, nodeEl, node);
            if (node.type === 'vlm') call('bindVlmChatScrollControls', undefined, nodeEl);
            if (node.type === 'media_browser') call('bindMediaBrowserNodeDragEvents', undefined, nodeEl, node);
            call('injectParamResetButtons', undefined, nodeEl);
            call('bindNodeMediaControlEvents', undefined, nodeEl);
            call('bindResultNodePreviewAspect', undefined, nodeEl, node);
            call('bindPresetSpecialViewerEvents', undefined, nodeEl, node);
            nodeEl.classList.remove('is-collapse-expanded');

            nodeEl.addEventListener('pointerdown', (evt) => call('handleNodePointerDown', undefined, nodeEl, node, evt));

            nodeEl.addEventListener('click', (evt) => {
                const textareaFromTitle = call('textareaEditorFieldFromTitleClick', null, evt.target);
                if (textareaFromTitle) {
                    evt.preventDefault();
                    evt.stopPropagation();
                    call('openTextareaEditor', undefined, textareaFromTitle);
                    return;
                }
                if (call('handleMediaBrowserNodeClick', false, node, evt, nodeEl)) return;
                if (call('handleTimelineClick', false, nodeEl, node, evt)) return;
                if (call('handleResultMetadataToggle', false, node, evt)) return;
                if (call('handleCanvasRelightLightButtonEvent', false, node, evt)) return;
                if (call('handlePresetParamResetClick', false, node, evt)) return;
                if (call('handleResultAssetClick', false, node, evt)) return;
                if (call('handleNodeMediaEditEvent', false, node, evt, 'click')) return;
                if (call('handleNodeConfigFieldEvent', false, nodeEl, node, evt, 'click')) return;
                if (call('handleStylesConfigActionClick', false, node, evt)) return;
                if (call('styleSelectorHandleCardClick', false, node, evt)) return;
                if (call('handleModelBrowserButtonClick', false, node, nodeEl, evt)) return;
                if (call('handleTranslateClick', false, node, evt)) return;
                if (call('handleTagCartClick', false, node, evt)) return;
                if (call('handleCompareNodeEvent', false, node, evt, 'click')) return;
                if (call('handleVlmChatJumpClick', false, node, evt)) return;
                if (call('handleVlmChatInputClick', false, node, evt)) return;
                if (call('handleVlmParamResetClick', false, node, nodeEl, evt)) return;
                if (call('handleVlmChatMessageActionClick', false, node, evt)) return;
                if (call('handleVlmAgentActionClick', false, node, evt)) return;
                call('handleNodeActionEvent', undefined, node, evt);
            });

            nodeEl.addEventListener('keydown', (evt) => {
                if (call('handleMediaBrowserNodeKeydown', false, node, evt, nodeEl)) return;
                call('handleVlmChatInputKeyDown', undefined, node, evt);
            });

            nodeEl.addEventListener('dblclick', (evt) => call('handleNodeDoubleClick', undefined, node, evt));

            nodeEl.addEventListener('input', (evt) => {
                if (call('handleCompareNodeEvent', false, node, evt, 'input')) return;
                if (call('handleTimelineNodeParamEvent', false, nodeEl, node, evt, 'input')) return;
                if (call('handleNodeMediaEditEvent', false, node, evt, 'input')) return;
                if (call('handleNodeConfigFieldEvent', false, nodeEl, node, evt, 'input')) return;
                if (call('styleSelectorHandleSearchInput', false, node, evt, nodeEl)) return;
                if (call('handleNoteTextEvent', false, node, evt, 'input')) return;
                if (call('handleNodeParamEvent', false, nodeEl, node, evt, 'input')) return;
                const param = evt.target.closest('[data-node-param]');
                if (param) call('handleNodeParamFieldChange', undefined, node, param, { scheduleOutpaint: false });
            });

            nodeEl.addEventListener('change', (evt) => {
                if (call('handleMediaBrowserNodeChange', false, node, evt, nodeEl)) return;
                if (call('handleNoteTextEvent', false, node, evt, 'change')) return;
                if (call('handleCompareNodeEvent', false, node, evt, 'change')) return;
                if (call('handleTimelineNodeParamEvent', false, nodeEl, node, evt, 'change')) return;
                if (call('handleNodeMediaEditEvent', false, node, evt, 'change')) return;
                if (call('handleNodeConfigFieldEvent', false, nodeEl, node, evt, 'change')) return;
                if (call('handleClassicNodeChangeEvent', false, node, evt)) return;
                if (call('handlePresetThemeChange', false, node, evt)) return;
                if (call('handleNodeParamEvent', false, nodeEl, node, evt, 'change')) return;
                const param = evt.target.closest('[data-node-param]');
                if (param) call('handleNodeParamFieldChange', undefined, node, param);
            });
            call('bindNodeContextMenu', undefined, nodeEl, node);
            return true;
        }

        return { bindNodeEvents, bindImageNodeDropEvents };
    }

    window.SimpAICanvasWorkbenchNodeEvent = Object.assign(
        window.SimpAICanvasWorkbenchNodeEvent || {},
        { createCanvasNodeEventController }
    );
})();
