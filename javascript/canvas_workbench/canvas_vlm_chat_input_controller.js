(function () {
    'use strict';

    function createCanvasVlmChatInputController(context) {
        const scope = context || {};
        const getDocument = () => typeof scope.getDocument === 'function'
            ? scope.getDocument()
            : (typeof document !== 'undefined' ? document : null);
        const getViewport = () => typeof scope.getViewport === 'function' ? scope.getViewport() : null;
        const getNodeElement = (nodeId) => typeof scope.getNodeElement === 'function'
            ? scope.getNodeElement(nodeId)
            : null;
        const isImageFile = (file) => typeof scope.isImageFile === 'function'
            ? !!scope.isImageFile(file)
            : !!file?.type && String(file.type).startsWith('image/');
        const isNodeLocked = (node) => typeof scope.isNodeLocked === 'function' && !!scope.isNodeLocked(node);
        const addVlmPendingImageFromFile = (...args) => typeof scope.addVlmPendingImageFromFile === 'function'
            ? scope.addVlmPendingImageFromFile(...args)
            : false;
        const removeVlmPendingImage = (...args) => typeof scope.removeVlmPendingImage === 'function'
            ? scope.removeVlmPendingImage(...args)
            : undefined;
        const disconnectVlmImageInput = (...args) => typeof scope.disconnectVlmImageInput === 'function'
            ? scope.disconnectVlmImageInput(...args)
            : undefined;
        const updateVlmParam = (...args) => typeof scope.updateVlmParam === 'function'
            ? scope.updateVlmParam(...args)
            : undefined;
        const runVlmNode = (...args) => typeof scope.runVlmNode === 'function'
            ? scope.runVlmNode(...args)
            : undefined;
        const isVlmNodeBusy = (...args) => typeof scope.isVlmNodeBusy === 'function' && !!scope.isVlmNodeBusy(...args);
        const showToast = (...args) => typeof scope.showToast === 'function' ? scope.showToast(...args) : undefined;
        const t = (...args) => typeof scope.t === 'function' ? scope.t(...args) : String(args[0] || '');

        function promptInputForNode(node) {
            return getNodeElement(node?.id)?.querySelector?.('.sai-vlm-compose textarea[data-vlm-param="prompt"]') || null;
        }

        function attachVlmImages(node) {
            if (!node || node.type !== 'vlm' || isNodeLocked(node)) return;
            const doc = getDocument();
            if (!doc?.createElement) return;
            const input = doc.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.multiple = true;
            input.style.display = 'none';
            doc.body?.appendChild?.(input);
            input.addEventListener('change', async () => {
                const files = Array.from(input.files || []).filter(isImageFile);
                for (const file of files) {
                    await addVlmPendingImageFromFile(node, file);
                }
                input.remove?.();
                if (files.length) showToast(t('{count} image(s) attached.', '已添加 {count} 张图片').replace('{count}', files.length));
            }, { once: true });
            input.click?.();
        }

        function runVlmRegenCommand(node) {
            if (!node || node.type !== 'vlm' || isNodeLocked(node)) return false;
            if (isVlmNodeBusy(node)) {
                showToast(t('VLM is still thinking. Wait for it to finish before regenerating.', 'VLM 还在思考中，等它完成后再继续生成。'));
                return false;
            }
            const message = t('Another one', '再来一张');
            updateVlmParam(node.id, 'prompt', message, 'textarea');
            const input = promptInputForNode(node);
            if (input) input.value = message;
            runVlmNode(node);
            return true;
        }

        function insertVlmChatCommand(node, command) {
            if (!node || node.type !== 'vlm' || isNodeLocked(node)) return false;
            const cleanCommand = String(command || '').trim();
            if (!cleanCommand) return false;
            if (cleanCommand.toLowerCase() === '/regen') return runVlmRegenCommand(node);
            const current = String(node.params?.prompt || '').trim();
            const next = current ? `${cleanCommand} ${current}` : `${cleanCommand} `;
            updateVlmParam(node.id, 'prompt', next, 'textarea');
            const input = promptInputForNode(node);
            if (input) {
                input.value = next;
                input.focus?.();
                try {
                    input.setSelectionRange(input.value.length, input.value.length);
                } catch (err) {}
            }
            return true;
        }

        async function handleVlmChatDrop(node, dataTransfer) {
            if (!node || node.type !== 'vlm' || !dataTransfer) return false;
            const files = Array.from(dataTransfer.files || []).filter(isImageFile);
            if (!files.length) return false;
            for (const file of files) {
                await addVlmPendingImageFromFile(node, file);
            }
            showToast(t('{count} image(s) attached.', '已添加 {count} 张图片').replace('{count}', files.length));
            return true;
        }

        function handleVlmChatInputClick(node, evt) {
            if (!node || node.type !== 'vlm' || !evt?.target?.closest) return false;
            const pendingRemove = evt.target.closest('[data-vlm-remove-pending-image]');
            if (pendingRemove) {
                evt.preventDefault?.();
                evt.stopPropagation?.();
                removeVlmPendingImage(node, Number(pendingRemove.getAttribute('data-vlm-remove-pending-image')) || 0);
                return true;
            }
            const disconnectImage = evt.target.closest('[data-vlm-disconnect-image]');
            if (disconnectImage) {
                evt.preventDefault?.();
                evt.stopPropagation?.();
                disconnectVlmImageInput(node, disconnectImage.getAttribute('data-vlm-disconnect-image') || 'image_1');
                return true;
            }
            const command = evt.target.closest('[data-vlm-command]');
            if (command) {
                evt.preventDefault?.();
                evt.stopPropagation?.();
                insertVlmChatCommand(node, command.getAttribute('data-vlm-command') || '');
                return true;
            }
            return false;
        }

        function handleVlmChatInputKeyDown(node, evt) {
            const composePrompt = evt?.target?.closest?.('.sai-vlm-compose textarea[data-vlm-param="prompt"]');
            if (!composePrompt || !node || node.type !== 'vlm' || evt.key !== 'Enter'
                || evt.isComposing || evt.shiftKey || evt.ctrlKey || evt.metaKey || evt.altKey) return false;
            evt.preventDefault?.();
            evt.stopPropagation?.();
            if (isVlmNodeBusy(node)) return true;
            updateVlmParam(node.id, 'prompt', composePrompt.value, 'textarea');
            runVlmNode(node);
            return true;
        }

        function bindVlmChatDropEvents(nodeEl, node) {
            if (!nodeEl || !node || node.type !== 'vlm') return;
            const supportsImageDrop = (dataTransfer) => {
                if (!dataTransfer) return false;
                const files = Array.from(dataTransfer.files || []);
                if (files.some(isImageFile)) return true;
                const items = Array.from(dataTransfer.items || []);
                return items.some(item => item.kind === 'file' && item.type && item.type.startsWith('image/'));
            };
            const getDropZone = (evt) => evt?.target?.closest?.('[data-vlm-chat-drop]');
            const setActive = (active) => nodeEl.classList?.toggle?.('is-vlm-drop-target', !!active);
            nodeEl.addEventListener('dragenter', (evt) => {
                if (!getDropZone(evt) || !supportsImageDrop(evt.dataTransfer)) return;
                evt.preventDefault();
                evt.stopPropagation();
                setActive(true);
            }, true);
            nodeEl.addEventListener('dragover', (evt) => {
                if (!getDropZone(evt) || !supportsImageDrop(evt.dataTransfer)) return;
                evt.preventDefault();
                evt.stopPropagation();
                evt.dataTransfer.dropEffect = 'copy';
                setActive(true);
            }, true);
            nodeEl.addEventListener('dragleave', (evt) => {
                if (evt.relatedTarget && nodeEl.contains?.(evt.relatedTarget)) return;
                setActive(false);
            }, true);
            nodeEl.addEventListener('drop', async (evt) => {
                if (!getDropZone(evt) || !supportsImageDrop(evt.dataTransfer)) return;
                evt.preventDefault();
                evt.stopPropagation();
                setActive(false);
                getViewport()?.classList?.remove?.('is-drop-target');
                await handleVlmChatDrop(node, evt.dataTransfer);
            }, true);
        }

        function focusVlmChatPromptInput(nodeId, selectText) {
            const safeNodeId = String(nodeId || '');
            if (!safeNodeId) return false;
            const input = promptInputForNode({ id: safeNodeId });
            if (!input) return false;
            input.focus?.({ preventScroll: true });
            const end = String(input.value || '').length;
            try {
                input.setSelectionRange(selectText ? 0 : end, end);
            } catch (err) {}
            return true;
        }

        return {
            attachVlmImages,
            insertVlmChatCommand,
            runVlmRegenCommand,
            handleVlmChatDrop,
            handleVlmChatInputClick,
            handleVlmChatInputKeyDown,
            bindVlmChatDropEvents,
            focusVlmChatPromptInput
        };
    }

    window.SimpAICanvasWorkbenchVlmChatInput = Object.assign({}, window.SimpAICanvasWorkbenchVlmChatInput || {}, {
        createCanvasVlmChatInputController
    });
})();
