(function () {
    'use strict';

    function createCanvasAgentPromptResolverController(context) {
        const scope = context || {};
        const call = (name, fallback, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : fallback;
        const t = scope.t || ((en, cn) => cn || en);
        const uid = scope.uid || ((prefix) => `${prefix || 'id'}_${Date.now()}`);
        const getCanvasAgentSettings = (...args) => call('getCanvasAgentSettings', {}, ...args) || {};
        const canvasAgentPromptTargetFromPurpose = (...args) => call('canvasAgentPromptTargetFromPurpose', {}, ...args) || {};
        const canvasAgentPromptDefaultsForPurpose = (...args) => call('canvasAgentPromptDefaultsForPurpose', {}, ...args) || {};
        const askCanvasAgentDecision = (...args) => call('askCanvasAgentDecision', 'cancel', ...args);
        const canvasAgentPromptPreflight = (...args) => call('canvasAgentPromptPreflight', {
            ok: true,
            state: 'pass',
            summary: 'Prompt preflight passed.',
            checks: []
        }, ...args);
        const canvasAgentPromptPreflightFacts = (...args) => call('canvasAgentPromptPreflightFacts', [], ...args) || [];
        const canvasAgentPromptTargetFact = (...args) => call('canvasAgentPromptTargetFact', null, ...args);
        const canvasAgentPromptValidationFact = (...args) => call('canvasAgentPromptValidationFact', null, ...args);
        const getCanvasAgentRewriteModel = (...args) => call('getCanvasAgentRewriteModel', '', ...args);
        const setCanvasAgentRunInfo = (...args) => call('setCanvasAgentRunInfo', null, ...args);
        const setCanvasAgentMessage = (...args) => call('setCanvasAgentMessage', null, ...args);
        const rewriteCanvasAgentPromptWithLlm = (...args) => call('rewriteCanvasAgentPromptWithLlm', null, ...args);
        const resetCanvasAgentRunInfo = (...args) => call('resetCanvasAgentRunInfo', null, ...args);

        async function resolveCanvasAgentPrompt(rawPrompt, purpose, options) {
            const opts = options || {};
            const settings = getCanvasAgentSettings();
            const strategy = settings.promptStrategy || 'ask';
            const recommendedPrompt = String(opts.recommendedPrompt || opts.plan?.recommendedPrompt || '').trim();
            const promptTarget = canvasAgentPromptTargetFromPurpose(purpose, opts);
            const promptDefaults = canvasAgentPromptDefaultsForPurpose(purpose, opts);
            let workingPrompt = String(rawPrompt || '').trim();
            const promptDecisionField = (label, rows = 5) => ({
                key: 'prompt',
                label: label || t('Prompt to submit', '提交提示词'),
                type: 'textarea',
                rows,
                wide: true
            });
            let firstChoice = strategy;
            if (recommendedPrompt) {
                const recommendedPreflight = await canvasAgentPromptPreflight(recommendedPrompt, promptTarget, purpose, {
                    presetDefaults: promptDefaults,
                    originalPrompt: rawPrompt,
                    userPrompt: rawPrompt,
                    plan: opts.plan || null
                });
                const recommendedState = String(recommendedPreflight?.state || '').toLowerCase();
                const recommendationNeedsAttention = recommendedState === 'warning' || recommendedState === 'block';
                const decisionForm = { prompt: recommendedPrompt };
                const choice = await askCanvasAgentDecision({
                    title: t('Thinking recommendation', 'Thinking 推荐'),
                    message: t('Thinking mode prepared an action plan and a recommended prompt in one pass. Choose what to submit.', 'Thinking 思考模式已一次性整理出行动计划和推荐提示词。请选择要提交的提示词。'),
                    form: decisionForm,
                    fields: [promptDecisionField(t('Recommended prompt', '推荐提示词'))],
                    facts: [
                        opts.plan?.preset ? { label: 'Preset', value: opts.plan.preset } : null,
                        opts.plan?.confidence ? { label: t('Confidence', '置信度'), value: opts.plan.confidence } : null,
                        canvasAgentPromptTargetFact(promptTarget),
                        canvasAgentPromptValidationFact(recommendedPrompt, promptTarget),
                        ...canvasAgentPromptPreflightFacts(recommendedPreflight)
                    ].filter(Boolean),
                    details: recommendedPrompt,
                    note: [
                        opts.plan?.reason ? `${t('Plan', '计划')}：${opts.plan.reason}` : '',
                        recommendationNeedsAttention
                            ? t('This recommendation still needs attention according to prompt preflight. You can edit it here or regenerate before submitting.', '这条推荐提示词的预检查仍有问题或警告。你可以先在这里修改，或重新生成后再提交。')
                            : '',
                        t('Original intent is still available, and Regenerate will call the refine model again.', '仍可使用原始意图；重新生成会再次调用优化模型。')
                    ].filter(Boolean).join('\n'),
                    actions: [
                        { value: 'recommended', label: t('Use recommendation', '使用推荐'), icon: 'fa-check', primary: !recommendationNeedsAttention },
                        { value: 'direct', label: t('Use original', '使用原始'), icon: 'fa-arrow-right' },
                        { value: 'rewrite', label: t('Regenerate', '重新生成'), icon: 'fa-rotate', primary: recommendationNeedsAttention, keepOpen: true, busyMessage: t('Regenerating prompt...', '正在重新生成提示词...') },
                        { value: 'cancel', label: t('Cancel', '取消'), icon: 'fa-xmark' }
                    ]
                });
                if (choice === 'recommended') return { ok: true, prompt: String(decisionForm.prompt || recommendedPrompt).trim(), source: 'thinking_recommendation' };
                if (choice === 'direct') return { ok: true, prompt: workingPrompt, source: 'thinking_original' };
                if (choice === 'cancel') return { ok: false, error: 'thinking recommendation rejected' };
                workingPrompt = String(decisionForm.prompt || recommendedPrompt || workingPrompt).trim();
                firstChoice = 'rewrite';
            }
            if (!recommendedPrompt && strategy === 'ask') {
                const decisionForm = { prompt: workingPrompt };
                firstChoice = await askCanvasAgentDecision({
                    title: t('Prompt strategy', '提示词处理'),
                    message: t('Should the Agent ask the LLM/VLM to understand and refine your request before submitting it?', '提交前要让 Agent 调用 LLM/VLM 理解并优化你的要求吗？'),
                    form: decisionForm,
                    fields: [promptDecisionField(t('Prompt', '提示词'))],
                    details: rawPrompt,
                    note: t('You will still see the final prompt before generation starts.', '生成开始前仍会展示最终提示词供你确认。'),
                    actions: [
                        { value: 'rewrite', label: t('Refine', '优化'), icon: 'fa-wand-magic-sparkles', primary: true, keepOpen: true, busyMessage: t('Refining prompt...', '正在优化提示词...') },
                        { value: 'direct', label: t('Use original', '使用原文'), icon: 'fa-arrow-right' },
                        { value: 'cancel', label: t('Cancel', '取消'), icon: 'fa-xmark' }
                    ]
                });
                workingPrompt = String(decisionForm.prompt || workingPrompt).trim();
            }
            if (firstChoice === 'direct') return { ok: true, prompt: workingPrompt, source: 'direct' };
            if (firstChoice !== 'rewrite') return { ok: false, error: 'prompt strategy cancelled' };
            const rewriteModel = getCanvasAgentRewriteModel();
            while (true) {
                setCanvasAgentRunInfo({
                    token: uid('agent_run'),
                    stage: t('Prompt refine', '提示词优化'),
                    model: rewriteModel
                });
                setCanvasAgentMessage(t('Refining prompt with {model}...', '正在用 {model} 优化提示词...').replace('{model}', rewriteModel));
                let rewritten = null;
                try {
                    rewritten = await rewriteCanvasAgentPromptWithLlm(workingPrompt, purpose, options);
                } catch (err) {
                    rewritten = { ok: false, error: err?.message || String(err) };
                }
                if (!rewritten.ok) {
                    resetCanvasAgentRunInfo();
                    const fallbackForm = { prompt: workingPrompt };
                    const fallback = await askCanvasAgentDecision({
                        title: t('Refine failed', '优化失败'),
                        message: t('LLM refine failed: {error}', 'LLM 优化失败：{error}').replace('{error}', rewritten.error || 'unknown error'),
                        form: fallbackForm,
                        fields: [promptDecisionField(t('Prompt to submit', '提交提示词'))],
                        details: workingPrompt,
                        note: t('You can edit the prompt manually, retry refine, or continue without refine.', '你可以手动修改提示词、重试优化，或不经过优化直接继续。'),
                        actions: [
                            { value: 'retry', label: t('Retry refine', '重新优化'), icon: 'fa-rotate', primary: true, keepOpen: true, busyMessage: t('Retrying refine...', '正在重新优化...') },
                            { value: 'direct', label: t('Use prompt', '使用提示词'), icon: 'fa-arrow-right' },
                            { value: 'cancel', label: t('Cancel', '取消'), icon: 'fa-xmark' }
                        ]
                    });
                    workingPrompt = String(fallbackForm.prompt || workingPrompt).trim();
                    if (fallback === 'retry') continue;
                    return fallback === 'direct' ? { ok: true, prompt: workingPrompt, source: 'manual_fallback' } : { ok: false, error: rewritten.error };
                }
                resetCanvasAgentRunInfo();
                const acceptForm = { prompt: rewritten.prompt };
                const accept = await askCanvasAgentDecision({
                    title: t('Use refined prompt?', '使用优化结果？'),
                    message: t('The Agent refined your request. Choose the prompt to submit.', 'Agent 已优化你的要求。请选择要提交的提示词。'),
                    form: acceptForm,
                    fields: [promptDecisionField(t('Prompt to submit', '提交提示词'))],
                    details: rewritten.prompt,
                    note: t('You can edit the refined prompt before submitting, or retry from the edited text.', '你可以先编辑优化后的提示词再提交，也可以基于编辑后的文本重新生成。'),
                    actions: [
                        { value: 'rewrite', label: t('Use prompt', '使用提示词'), icon: 'fa-check', primary: true },
                        { value: 'retry', label: t('Regenerate', '重新生成'), icon: 'fa-rotate', keepOpen: true, busyMessage: t('Regenerating prompt...', '正在重新生成提示词...') },
                        { value: 'direct', label: t('Use original', '使用原文'), icon: 'fa-arrow-right' },
                        { value: 'cancel', label: t('Cancel', '取消'), icon: 'fa-xmark' }
                    ]
                });
                const acceptedPrompt = String(acceptForm.prompt || rewritten.prompt || workingPrompt).trim();
                if (accept === 'rewrite') return { ok: true, prompt: acceptedPrompt, source: acceptedPrompt === rewritten.prompt ? 'llm_rewrite' : 'manual_after_rewrite' };
                if (accept === 'retry') {
                    workingPrompt = acceptedPrompt || workingPrompt;
                    continue;
                }
                if (accept === 'direct') return { ok: true, prompt: workingPrompt, source: 'direct_after_rewrite' };
                return { ok: false, error: 'refine rejected' };
            }
        }

        return { resolveCanvasAgentPrompt };
    }

    window.SimpAICanvasWorkbenchAgentPromptResolver = Object.assign(
        {},
        window.SimpAICanvasWorkbenchAgentPromptResolver || {},
        { createCanvasAgentPromptResolverController }
    );
})();
