(function () {
    'use strict';

    function createCanvasTextConnectionController(context) {
        const scope = context?.textConnectionSource || context || {};
        const nodeSource = scope.nodeSource || {};
        const textSource = scope.textSource || {};
        const batchSource = scope.batchSource || {};
        const edgeSource = scope.edgeSource || {};
        const patchSource = scope.patchSource || {};
        const historySource = scope.historySource || {};
        const selectionSource = scope.selectionSource || {};
        const renderSource = scope.renderSource || {};
        const languageSource = scope.languageSource || {};
        const uiSource = scope.uiSource || {};
        const call = (source, name, fallback, ...args) => typeof source[name] === 'function'
            ? source[name](...args) : fallback;
        const t = (en, cn) => {
            const state = call(languageSource, 'getLanguageState', {}) || {};
            return call(languageSource, 't', state.__lang === 'cn' || state.__lang === 'zh' ? cn : en, en, cn, state);
        };
        const showToast = message => call(uiSource, 'showToast', undefined, message);
        const textMergeInputSlots = node => call(textSource, 'textMergeInputSlots', [], node);

        function createTextEdge(fromId, toId, slot, options) {
            const from = call(nodeSource, 'getNode', null, fromId);
            const to = call(nodeSource, 'getNode', null, toId);
            // Slot normalization also updates Text Merge state, before connection validation.
            const targetSlot = to?.type === 'text_merge'
                ? (textMergeInputSlots(to).includes(slot) ? slot : textMergeInputSlots(to)[0])
                : (['text', 'translation', 'tag_cart'].includes(to?.type) ? 'input' : (['prompt', 'negative_prompt'].includes(slot) ? slot : 'prompt'));
            const isPresetTextTarget = ['preset', 'classic'].includes(to?.type);
            const canUseBatchAnyText = isPresetTextTarget && call(batchSource, 'batchAnyCanConnectToTextSlot', false, from, targetSlot);
            if (!from || !to || (!call(textSource, 'isTextOutputNode', false, from) && !canUseBatchAnyText)
                || !['preset', 'classic', 'text', 'text_merge', 'translation', 'tag_cart'].includes(to.type)) {
                showToast(t('Text outputs can connect to Text/Classic/Preset nodes', '文本输出可连接文本 / Classic / Preset 节点'));
                return;
            }
            if (['text', 'text_merge', 'translation', 'tag_cart'].includes(to.type)
                && call(textSource, 'wouldCreateTextCycle', true, fromId, toId)) {
                showToast(t('Text input cannot create a cycle', '文本输入不能形成循环连接'));
                return;
            }
            if (to.type === 'preset' && !['prompt', 'negative_prompt'].includes(targetSlot)) {
                showToast(t('Text outputs can only connect to preset prompt inputs', '文本输出只能连接 Preset 的提示词输入'));
                return;
            }
            if (call(nodeSource, 'isNodeLocked', false, from) || call(nodeSource, 'isNodeLocked', false, to)) {
                showToast(t('Locked nodes cannot change connections', '锁定的节点不能修改连接'));
                return;
            }
            if (!options || !options.silent) call(historySource, 'pushHistory', undefined, 'Connect text edge');
            writeTextConnection(fromId, toId, from, to, targetSlot);
            call(selectionSource, 'selectConnectionNode', undefined, toId);
            if (options && options.silent) return;
            call(renderSource, 'mutate', undefined);
            showToast(['text', 'text_merge', 'translation', 'tag_cart'].includes(to.type)
                ? t('Text input connected', '文本输入已连接')
                : targetSlot === 'negative_prompt'
                    ? t('Negative Prompt connected', '负向提示词已连接')
                    : t('Prompt connected', '提示词已连接'));
        }

        function writeTextConnection(fromId, toId, from, to, targetSlot) {
            call(edgeSource, 'filterProjectEdges', undefined,
                edge => !(edge.type === 'text' && edge.to === toId && edge.slot === targetSlot));
            call(edgeSource, 'appendProjectEdge', undefined,
                call(edgeSource, 'buildCanvasEdge', null, 'text', { from: fromId, to: toId, slot: targetSlot }));
            if (to.type === 'preset' || to.type === 'classic') {
                Object.assign(to, call(patchSource, 'buildPresetTextInputPatch', {}, to, {
                    textInputsPatch: { [targetSlot]: fromId },
                    ...(from.type === 'style_selector' && targetSlot === 'prompt'
                        ? { styleTransferSelectorId: from.id }
                        : {})
                }));
                if (from.type === 'style_selector' && targetSlot === 'prompt') {
                    Object.assign(from, call(patchSource, 'buildStyleSelectorStatePatch', {}, from, {
                        statePatch: { target_preset_id: toId }
                    }));
                }
            } else if (to.type === 'text_merge') {
                Object.assign(to, call(patchSource, 'buildTextMergeStatePatch', {}, to, {
                    textInputsPatch: { [targetSlot]: fromId }
                }));
            } else if (to.type === 'translation') {
                Object.assign(to, call(patchSource, 'buildTranslationStatePatch', {}, to, { textInputId: fromId }));
            } else if (to.type === 'tag_cart') {
                Object.assign(to, call(patchSource, 'buildTagCartStatePatch', {}, to, { textInputId: fromId }));
            } else if (to.type === 'text') {
                Object.assign(to, call(patchSource, 'buildTextNodeStatePatch', {}, to, { textInputId: fromId }));
            }
        }

        function connectPendingTextSource(from, node) {
            if (!from || !node || !call(textSource, 'isTextOutputNode', false, from)) return '';
            if (node.type === 'preset' || node.type === 'classic') {
                const slot = !node.text_inputs?.prompt ? 'prompt' : 'negative_prompt';
                writeTextConnection(from.id, node.id, from, node, slot);
                return t('and connected to {slot} automatically', '并已自动连接到 {slot}')
                    .replace('{slot}', slot === 'negative_prompt' ? 'Negative Prompt' : 'Prompt');
            }
            if (!['text', 'text_merge', 'translation', 'tag_cart'].includes(node.type)
                || call(textSource, 'wouldCreateTextCycle', true, from.id, node.id)) return '';
            const slot = node.type === 'text_merge'
                ? textMergeInputSlots(node).find(item => !call(textSource, 'getTextMergeInputSource', null, node, item)) || textMergeInputSlots(node)[0]
                : 'input';
            writeTextConnection(from.id, node.id, from, node, slot);
            return t('connected to Text input', '已连接到文本输入');
        }

        return { createTextEdge, connectPendingTextSource };
    }

    window.SimpAICanvasWorkbenchTextConnection = Object.assign(
        {}, window.SimpAICanvasWorkbenchTextConnection || {}, { createCanvasTextConnectionController }
    );
})();
