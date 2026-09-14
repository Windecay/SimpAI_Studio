(function () {
    'use strict';

    function createCanvasAgentActionExecutionController(source) {
        const scope = source?.actionExecutionSource || source || {};
        const languageSource = scope.languageSource || {};
        const stateSource = scope.stateSource || {};
        const panelSource = scope.panelSource || {};
        const decisionSource = scope.decisionSource || {};
        const targetSource = scope.targetSource || {};
        const mediaSource = scope.mediaSource || {};
        const plannerSource = scope.plannerSource || {};
        const runtimeSource = scope.runtimeSource || {};
        const workflowSource = scope.workflowSource || {};
        const uiSource = scope.uiSource || {};
        const call = (sourceObject, name, fallback, ...args) => typeof sourceObject[name] === 'function'
            ? sourceObject[name](...args)
            : fallback;
        const languageCall = (name, fallback, ...args) => call(languageSource, name, fallback, ...args);
        const stateCall = (name, fallback, ...args) => call(stateSource, name, fallback, ...args);
        const panelCall = (name, fallback, ...args) => call(panelSource, name, fallback, ...args);
        const decisionCall = (name, fallback, ...args) => call(decisionSource, name, fallback, ...args);
        const targetCall = (name, fallback, ...args) => call(targetSource, name, fallback, ...args);
        const mediaCall = (name, fallback, ...args) => call(mediaSource, name, fallback, ...args);
        const plannerCall = (name, fallback, ...args) => call(plannerSource, name, fallback, ...args);
        const runtimeCall = (name, fallback, ...args) => call(runtimeSource, name, fallback, ...args);
        const workflowCall = (name, fallback, ...args) => call(workflowSource, name, fallback, ...args);
        const uiCall = (name, fallback, ...args) => call(uiSource, name, fallback, ...args);
        const t = languageSource.t || ((en, cn) => cn || en);
        const executableAgentActions = [
            'generate-image',
            'edit-image',
            'refine-text',
            'image-to-video',
            'generate-video',
            'edit-video',
            'audio-to-video',
            'edit-audio',
            'generate-audio'
        ];

        async function runCanvasAgentVlmInstruction(rawPrompt, requestedAction) {
            const prompt = String(rawPrompt || '').trim();
            const model = plannerCall('getCanvasAgentRewriteModel', '');
            uiCall('setCanvasAgentRunInfo', null, {
                token: runtimeCall('uid', `agent_run_${Date.now()}`, 'agent_run'),
                stage: t('Thinking', 'Thinking 思考中'),
                model,
                cancelAction: 'cancel-vlm-plan'
            });
            uiCall('setCanvasAgentMessage', null, t('Thinking mode is turning the instruction into an executable plan...', 'Thinking 思考模式正在把指令整理为可执行计划...'));
            await runtimeCall('waitNextFrame', null);
            let planResult = await plannerCall('requestCanvasAgentVlmInstructionPlan', { ok: false, error: 'VLM planner is unavailable' }, prompt, requestedAction);
            if (planResult?.cancelled) {
                uiCall('resetCanvasAgentRunInfo', null);
                uiCall('setCanvasAgentMessage', null, t('VLM planner cancelled.', 'VLM 计划已取消。'));
                return;
            }
            if (planResult?.stale || planResult?.projectChanged) {
                uiCall('resetCanvasAgentRunInfo', null);
                if (planResult?.projectChanged) {
                    uiCall('setCanvasAgentMessage', null, t('The project changed while the Agent was thinking. The old plan was discarded.', 'Agent 思考期间项目已发生变化，旧计划已丢弃。'));
                }
                return;
            }
            let plan = planResult?.ok ? planResult.plan : null;
            if (!plan || !plan.ok) {
                plan = plannerCall('buildCanvasAgentLocalInstructionPlan', {}, prompt, requestedAction) || {};
                plan.reason = [plan.reason, planResult?.error ? `VLM fallback: ${planResult.error}` : ''].filter(Boolean).join(' ');
            }
            if (requestedAction === 'edit-image') plan.action = 'image_edit';
            const target = targetCall('getCanvasAgentTargetNode', null);
            const targetKind = targetCall('getCanvasAgentTargetMediaKind', '', target);
            const primaryMedia = ['image', 'video', 'audio'].includes(targetKind) ? { [targetKind]: target } : {};
            const referenceNodes = mediaCall('getCanvasAgentMediaReferenceNodes', [], primaryMedia) || [];
            const requestedVideoTask = mediaCall('canvasAgentVideoTaskForMedia', 'text_to_video', mediaCall('canvasAgentMediaNodeCounts', {}, referenceNodes));
            if (requestedAction === 'image-to-video') plan.action = requestedVideoTask === 'text_to_video' ? 'image_to_video' : requestedVideoTask;
            if (requestedAction === 'generate-video' && !['image_to_video', 'multi_image_to_video', 'video_edit', 'audio_to_video', 'image_audio_to_video', 'video_audio_to_video'].includes(plan.action)) {
                plan.action = requestedVideoTask;
            }
            if (requestedAction === 'edit-video') plan.action = 'video_edit';
            if (requestedAction === 'edit-audio') plan.action = 'audio_edit';
            if (requestedAction === 'generate-audio') plan.action = 'audio_generate';
            if (requestedAction === 'generate-image' && plan.action === 'image_edit' && !targetCall('isCanvasAgentImageTarget', false, target) && !mediaCall('getCanvasAgentPrimaryImageReference', null)) plan.action = 'text_to_image';
            uiCall('resetCanvasAgentRunInfo', null);
            const plannedPrompt = plan.prompt || prompt;
            const options = {
                originalPrompt: prompt,
                presetName: plan.preset,
                recommendedPrompt: plan.recommendedPrompt,
                plan
            };
            if (plan.action === 'image_edit') {
                await workflowCall('runCanvasAgentImageEdit', null, plannedPrompt, options);
            } else if (plan.action === 'text_to_image') {
                await workflowCall('runCanvasAgentTextToImage', null, plannedPrompt, options);
            } else if (plan.action === 'image_to_video' || plan.action === 'multi_image_to_video') {
                await workflowCall('runCanvasAgentImageToVideo', null, plannedPrompt, options);
            } else if (plan.action === 'text_to_video') {
                await workflowCall('runCanvasAgentTextToVideo', null, plannedPrompt, options);
            } else if (plan.action === 'video_edit') {
                await workflowCall('runCanvasAgentVideoEdit', null, plannedPrompt, options);
            } else if (plan.action === 'audio_to_video' || plan.action === 'image_audio_to_video') {
                await workflowCall('runCanvasAgentAudioToVideo', null, plannedPrompt, options);
            } else if (plan.action === 'video_audio_to_video') {
                await workflowCall('runCanvasAgentVideoReferenceToVideo', null, plannedPrompt, options);
            } else if (plan.action === 'audio_edit') {
                await workflowCall('runCanvasAgentAudioEdit', null, plannedPrompt, options);
            } else if (plan.action === 'audio_generate') {
                await workflowCall('runCanvasAgentTextToAudio', null, plannedPrompt, options);
            } else {
                uiCall('clearCanvasAgentRunInfo', null, 1200);
                uiCall('setCanvasAgentMessage', null, t('VLM Agent could not map this instruction to a safe executable action.', 'VLM Agent 暂时无法把该指令映射为安全可执行动作。'));
            }
        }

        async function handleCanvasAgentAction(action) {
            if (await panelCall('handleCanvasAgentPanelAction', false, action)) return;
            const state = stateCall('getCanvasAgentState', {}) || {};
            const prompt = String(state.input || '').trim();
            if (!prompt && action !== 'refine-text') {
                uiCall('showToast', null, t('Tell the Agent what to make first.', '请先告诉 Agent 要做什么'));
                return;
            }
            const target = targetCall('getCanvasAgentTargetNode', null);
            const meta = decisionCall('canvasAgentPrimaryActionMeta', {}, target) || {};
            if (!meta.enabled && executableAgentActions.includes(action)) {
                uiCall('showToast', null, t('Current selection is not a supported Agent target.', '当前选中对象不是可执行的 Agent 目标'));
                return;
            }
            const settings = stateCall('getCanvasAgentSettings', {}) || {};
            try {
                if (settings.executionRoute === 'vlm_plan' && executableAgentActions.includes(action) && action !== 'refine-text') {
                    await runCanvasAgentVlmInstruction(prompt, action);
                    return;
                }
                if (action === 'generate-image') {
                    const localPlan = plannerCall('buildCanvasAgentLocalInstructionPlan', {}, prompt, action) || {};
                    const options = {
                        originalPrompt: prompt,
                        presetName: localPlan.preset,
                        recommendedPrompt: localPlan.recommendedPrompt,
                        plan: localPlan
                    };
                    if (localPlan.action === 'image_to_video' || localPlan.action === 'multi_image_to_video') await workflowCall('runCanvasAgentImageToVideo', null, localPlan.prompt || prompt, options);
                    else if (localPlan.action === 'text_to_video') await workflowCall('runCanvasAgentTextToVideo', null, localPlan.prompt || prompt, options);
                    else if (localPlan.action === 'video_edit') await workflowCall('runCanvasAgentVideoEdit', null, localPlan.prompt || prompt, options);
                    else if (localPlan.action === 'audio_to_video' || localPlan.action === 'image_audio_to_video') await workflowCall('runCanvasAgentAudioToVideo', null, localPlan.prompt || prompt, options);
                    else if (localPlan.action === 'video_audio_to_video') await workflowCall('runCanvasAgentVideoReferenceToVideo', null, localPlan.prompt || prompt, options);
                    else if (localPlan.action === 'audio_generate') await workflowCall('runCanvasAgentTextToAudio', null, localPlan.prompt || prompt, options);
                    else if (localPlan.action === 'audio_edit') await workflowCall('runCanvasAgentAudioEdit', null, localPlan.prompt || prompt, options);
                    else await workflowCall('runCanvasAgentTextToImage', null, prompt);
                } else if (action === 'edit-image') {
                    await workflowCall('runCanvasAgentImageEdit', null, prompt);
                } else if (action === 'image-to-video') {
                    await workflowCall('runCanvasAgentImageToVideo', null, prompt);
                } else if (action === 'generate-video') {
                    const localPlan = plannerCall('buildCanvasAgentLocalInstructionPlan', {}, prompt, action) || {};
                    const options = {
                        originalPrompt: prompt,
                        presetName: localPlan.preset,
                        recommendedPrompt: localPlan.recommendedPrompt,
                        plan: localPlan
                    };
                    if (localPlan.action === 'image_to_video' || localPlan.action === 'multi_image_to_video') await workflowCall('runCanvasAgentImageToVideo', null, localPlan.prompt || prompt, options);
                    else if (localPlan.action === 'audio_to_video' || localPlan.action === 'image_audio_to_video') await workflowCall('runCanvasAgentAudioToVideo', null, localPlan.prompt || prompt, options);
                    else if (localPlan.action === 'video_audio_to_video') await workflowCall('runCanvasAgentVideoReferenceToVideo', null, localPlan.prompt || prompt, options);
                    else if (localPlan.action === 'video_edit') await workflowCall('runCanvasAgentVideoEdit', null, localPlan.prompt || prompt, options);
                    else await workflowCall('runCanvasAgentTextToVideo', null, localPlan.prompt || prompt, options);
                } else if (action === 'edit-video') {
                    await workflowCall('runCanvasAgentVideoEdit', null, prompt);
                } else if (action === 'audio-to-video') {
                    await workflowCall('runCanvasAgentAudioToVideo', null, prompt);
                } else if (action === 'edit-audio') {
                    await workflowCall('runCanvasAgentAudioEdit', null, prompt);
                } else if (action === 'generate-audio') {
                    const localPlan = plannerCall('buildCanvasAgentLocalInstructionPlan', {}, prompt, action) || {};
                    await workflowCall('runCanvasAgentTextToAudio', null, localPlan.prompt || prompt, {
                        originalPrompt: prompt,
                        presetName: localPlan.preset,
                        recommendedPrompt: localPlan.recommendedPrompt,
                        plan: localPlan
                    });
                } else if (action === 'refine-text') {
                    await workflowCall('runCanvasAgentTextRefine', null, prompt);
                }
            } catch (err) {
                console.error('[SimpAI Canvas Agent] action failed', err);
                uiCall('setCanvasAgentRunInfo', null, null);
                const message = err?.message || String(err);
                uiCall('setCanvasAgentMessage', null, t('Agent action failed: {error}', 'Agent 执行失败：{error}').replace('{error}', message));
                uiCall('showToast', null, t('Agent action failed.', 'Agent 执行失败。'));
            }
        }

        return {
            executableAgentActions,
            handleCanvasAgentAction,
            runCanvasAgentVlmInstruction
        };
    }

    window.SimpAICanvasWorkbenchCanvasAgentActionExecution = Object.assign(
        {},
        window.SimpAICanvasWorkbenchCanvasAgentActionExecution || {},
        { createCanvasAgentActionExecutionController }
    );
})();
