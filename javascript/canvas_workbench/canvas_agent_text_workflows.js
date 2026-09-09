(function () {
    'use strict';

    function createCanvasAgentTextWorkflowController(context) {
        const scope = context || {};
        const t = scope.t || ((en, cn) => cn || en);
        const uid = scope.uid || ((prefix) => `${prefix || 'id'}_${Date.now()}`);
        const call = (name, fallback, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : fallback;
        const getCanvasAgentTargetNode = () => call('getCanvasAgentTargetNode', null);
        const isCanvasAgentTextTarget = (...args) => !!call('isCanvasAgentTextTarget', false, ...args);
        const getTextNodeInputSource = (...args) => call('getTextNodeInputSource', null, ...args);
        const getNodeTextOutput = (...args) => call('getNodeTextOutput', '', ...args);
        const getCanvasAgentRewriteModel = () => call('getCanvasAgentRewriteModel', '');
        const setCanvasAgentRunInfo = (...args) => call('setCanvasAgentRunInfo', null, ...args);
        const resetCanvasAgentRunInfo = (...args) => call('resetCanvasAgentRunInfo', null, ...args);
        const setCanvasAgentMessage = (...args) => call('setCanvasAgentMessage', null, ...args);
        const showToast = (...args) => call('showToast', null, ...args);
        const waitNextFrame = (...args) => call('waitNextFrame', Promise.resolve(), ...args);
        const rewriteCanvasAgentPromptWithLlm = (...args) => call('rewriteCanvasAgentPromptWithLlm', null, ...args);
        const askCanvasAgentDecision = (...args) => call('askCanvasAgentDecision', 'cancel', ...args);
        const updateTextNodeValue = (...args) => call('updateTextNodeValue', null, ...args);
        const setCanvasAgentInput = (...args) => call('setCanvasAgentInput', null, ...args);
        const mutate = (...args) => call('mutate', null, ...args);

        async function runCanvasAgentTextRefine(prompt, options) {
            const target = getCanvasAgentTargetNode();
            if (!isCanvasAgentTextTarget(target)) {
                showToast(t('Select a Text node first.', '请先选中 Text 节点'));
                return { ok: false, error: 'text target missing' };
            }
            if (getTextNodeInputSource(target)) {
                showToast(t('Linked Text node is read-only. Refine the source text instead.', '已连接输入的 Text 节点为只读，请优化源文本节点。'));
                return { ok: false, error: 'text target is read-only' };
            }
            const rawText = String(prompt || '').trim() || getNodeTextOutput(target);
            if (!rawText.trim()) {
                showToast(t('Text node is empty.', 'Text 节点为空。'));
                return { ok: false, error: 'text target is empty' };
            }
            const rewriteModel = getCanvasAgentRewriteModel();
            while (true) {
                setCanvasAgentRunInfo({
                    token: uid('agent_run'),
                    stage: t('Prompt refinement', '提示词优化'),
                    model: rewriteModel
                });
                setCanvasAgentMessage(t('Refining prompt with {model}...', '正在用 {model} 优化提示词...').replace('{model}', rewriteModel));
                await waitNextFrame();
                let rewritten = null;
                try {
                    rewritten = await rewriteCanvasAgentPromptWithLlm(rawText, 'prompt refinement', options || {});
                } catch (err) {
                    rewritten = { ok: false, error: err?.message || String(err) };
                }
                resetCanvasAgentRunInfo();
                if (!rewritten?.ok) {
                    const fallback = await askCanvasAgentDecision({
                        title: t('Refine failed', '优化失败'),
                        message: t('LLM/VLM refine failed: {error}', 'LLM/VLM 优化失败：{error}').replace('{error}', rewritten?.error || 'unknown error'),
                        details: rawText,
                        actions: [
                            { value: 'retry', label: t('Retry', '重试'), icon: 'fa-rotate', primary: true },
                            { value: 'cancel', label: t('Cancel', '取消'), icon: 'fa-xmark' }
                        ]
                    });
                    if (fallback === 'retry') continue;
                    setCanvasAgentMessage(t('Text refine cancelled.', '文本优化已取消。'));
                    return { ok: false, error: rewritten?.error || 'refine cancelled' };
                }
                const accept = await askCanvasAgentDecision({
                    title: t('Apply refined prompt?', '应用优化提示词？'),
                    message: t('Agent refined the Text node prompt. Choose what to write back.', 'Agent 已优化 Text 节点提示词。请选择要写回的内容。'),
                    details: rewritten.prompt,
                    note: t('Original text is still available as a fallback.', '仍可保留原文本。'),
                    actions: [
                        { value: 'apply', label: t('Apply', '应用'), icon: 'fa-check', primary: true },
                        { value: 'retry', label: t('Regenerate', '重新生成'), icon: 'fa-rotate' },
                        { value: 'cancel', label: t('Cancel', '取消'), icon: 'fa-xmark' }
                    ]
                });
                if (accept === 'retry') continue;
                if (accept !== 'apply') {
                    setCanvasAgentMessage(t('Text refine cancelled.', '文本优化已取消。'));
                    return { ok: false, error: 'refine cancelled' };
                }
                updateTextNodeValue(target.id, rewritten.prompt);
                setCanvasAgentInput('');
                setCanvasAgentMessage(t('Text node refined.', 'Text 节点已优化。'));
                mutate({ inspector: true });
                return { ok: true, node_id: target.id, prompt: rewritten.prompt };
            }
        }

        return { runCanvasAgentTextRefine };
    }

    window.SimpAICanvasWorkbenchTextWorkflows = Object.assign({}, window.SimpAICanvasWorkbenchTextWorkflows || {}, {
        createCanvasAgentTextWorkflowController
    });
})();
