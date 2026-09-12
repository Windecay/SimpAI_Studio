(function () {
    'use strict';

    function createCanvasAgentActionExecutionController(source) {
        const scope = source?.actionExecutionSource || source || {};
        const call = (name, fallback, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : fallback;
        const t = scope.t || ((en, cn) => cn || en);
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
            const model = call('getCanvasAgentRewriteModel', '');
            call('setCanvasAgentRunInfo', null, {
                token: call('uid', `agent_run_${Date.now()}`,'agent_run'),
                stage: t('Thinking', 'Thinking 思考中'),
                model,
                cancelAction: 'cancel-vlm-plan'
            });
            call('setCanvasAgentMessage', null, t('Thinking mode is turning the instruction into an executable plan...', 'Thinking 思考模式正在把指令整理为可执行计划...'));
            await call('waitNextFrame', null);
            let planResult = await call('requestCanvasAgentVlmInstructionPlan', { ok: false, error: 'VLM planner is unavailable' }, prompt, requestedAction);
            if (planResult?.cancelled) {
                call('resetCanvasAgentRunInfo', null);
                call('setCanvasAgentMessage', null, t('VLM planner cancelled.', 'VLM 计划已取消。'));
                return;
            }
            if (planResult?.stale || planResult?.projectChanged) {
                call('resetCanvasAgentRunInfo', null);
                if (planResult?.projectChanged) {
                    call('setCanvasAgentMessage', null, t('The project changed while the Agent was thinking. The old plan was discarded.', 'Agent 思考期间项目已发生变化，旧计划已丢弃。'));
                }
                return;
            }
            let plan = planResult?.ok ? planResult.plan : null;
            if (!plan || !plan.ok) {
                plan = call('buildCanvasAgentLocalInstructionPlan', {}, prompt, requestedAction) || {};
                plan.reason = [plan.reason, planResult?.error ? `VLM fallback: ${planResult.error}` : ''].filter(Boolean).join(' ');
            }
            if (requestedAction === 'edit-image') plan.action = 'image_edit';
            const target = call('getCanvasAgentTargetNode', null);
            const targetKind = call('getCanvasAgentTargetMediaKind', '', target);
            const primaryMedia = ['image', 'video', 'audio'].includes(targetKind) ? { [targetKind]: target } : {};
            const referenceNodes = call('getCanvasAgentMediaReferenceNodes', [], primaryMedia) || [];
            const requestedVideoTask = call('canvasAgentVideoTaskForMedia', 'text_to_video', call('canvasAgentMediaNodeCounts', {}, referenceNodes));
            if (requestedAction === 'image-to-video') plan.action = requestedVideoTask === 'text_to_video' ? 'image_to_video' : requestedVideoTask;
            if (requestedAction === 'generate-video' && !['image_to_video', 'multi_image_to_video', 'video_edit', 'audio_to_video', 'image_audio_to_video', 'video_audio_to_video'].includes(plan.action)) {
                plan.action = requestedVideoTask;
            }
            if (requestedAction === 'edit-video') plan.action = 'video_edit';
            if (requestedAction === 'edit-audio') plan.action = 'audio_edit';
            if (requestedAction === 'generate-audio') plan.action = 'audio_generate';
            if (requestedAction === 'generate-image' && plan.action === 'image_edit' && !call('isCanvasAgentImageTarget', false, target) && !call('getCanvasAgentPrimaryImageReference', null)) plan.action = 'text_to_image';
            call('resetCanvasAgentRunInfo', null);
            const plannedPrompt = plan.prompt || prompt;
            const options = {
                originalPrompt: prompt,
                presetName: plan.preset,
                recommendedPrompt: plan.recommendedPrompt,
                plan
            };
            if (plan.action === 'image_edit') {
                await call('runCanvasAgentImageEdit', null, plannedPrompt, options);
            } else if (plan.action === 'text_to_image') {
                await call('runCanvasAgentTextToImage', null, plannedPrompt, options);
            } else if (plan.action === 'image_to_video' || plan.action === 'multi_image_to_video') {
                await call('runCanvasAgentImageToVideo', null, plannedPrompt, options);
            } else if (plan.action === 'text_to_video') {
                await call('runCanvasAgentTextToVideo', null, plannedPrompt, options);
            } else if (plan.action === 'video_edit') {
                await call('runCanvasAgentVideoEdit', null, plannedPrompt, options);
            } else if (plan.action === 'audio_to_video' || plan.action === 'image_audio_to_video') {
                await call('runCanvasAgentAudioToVideo', null, plannedPrompt, options);
            } else if (plan.action === 'video_audio_to_video') {
                await call('runCanvasAgentVideoReferenceToVideo', null, plannedPrompt, options);
            } else if (plan.action === 'audio_edit') {
                await call('runCanvasAgentAudioEdit', null, plannedPrompt, options);
            } else if (plan.action === 'audio_generate') {
                await call('runCanvasAgentTextToAudio', null, plannedPrompt, options);
            } else {
                call('clearCanvasAgentRunInfo', null, 1200);
                call('setCanvasAgentMessage', null, t('VLM Agent could not map this instruction to a safe executable action.', 'VLM Agent 暂时无法把该指令映射为安全可执行动作。'));
            }
        }

        async function handleCanvasAgentAction(action) {
            if (await call('handleCanvasAgentPanelAction', false, action)) return;
            const state = call('getCanvasAgentState', {}) || {};
            const prompt = String(state.input || '').trim();
            if (!prompt && action !== 'refine-text') {
                call('showToast', null, t('Tell the Agent what to make first.', '请先告诉 Agent 要做什么'));
                return;
            }
            const target = call('getCanvasAgentTargetNode', null);
            const meta = call('canvasAgentPrimaryActionMeta', {}, target) || {};
            if (!meta.enabled && executableAgentActions.includes(action)) {
                call('showToast', null, t('Current selection is not a supported Agent target.', '当前选中对象不是可执行的 Agent 目标'));
                return;
            }
            const settings = call('getCanvasAgentSettings', {}) || {};
            try {
                if (settings.executionRoute === 'vlm_plan' && executableAgentActions.includes(action) && action !== 'refine-text') {
                    await runCanvasAgentVlmInstruction(prompt, action);
                    return;
                }
                if (action === 'generate-image') {
                    const localPlan = call('buildCanvasAgentLocalInstructionPlan', {}, prompt, action) || {};
                    const options = {
                        originalPrompt: prompt,
                        presetName: localPlan.preset,
                        recommendedPrompt: localPlan.recommendedPrompt,
                        plan: localPlan
                    };
                    if (localPlan.action === 'image_to_video' || localPlan.action === 'multi_image_to_video') await call('runCanvasAgentImageToVideo', null, localPlan.prompt || prompt, options);
                    else if (localPlan.action === 'text_to_video') await call('runCanvasAgentTextToVideo', null, localPlan.prompt || prompt, options);
                    else if (localPlan.action === 'video_edit') await call('runCanvasAgentVideoEdit', null, localPlan.prompt || prompt, options);
                    else if (localPlan.action === 'audio_to_video' || localPlan.action === 'image_audio_to_video') await call('runCanvasAgentAudioToVideo', null, localPlan.prompt || prompt, options);
                    else if (localPlan.action === 'video_audio_to_video') await call('runCanvasAgentVideoReferenceToVideo', null, localPlan.prompt || prompt, options);
                    else if (localPlan.action === 'audio_generate') await call('runCanvasAgentTextToAudio', null, localPlan.prompt || prompt, options);
                    else if (localPlan.action === 'audio_edit') await call('runCanvasAgentAudioEdit', null, localPlan.prompt || prompt, options);
                    else await call('runCanvasAgentTextToImage', null, prompt);
                } else if (action === 'edit-image') {
                    await call('runCanvasAgentImageEdit', null, prompt);
                } else if (action === 'image-to-video') {
                    await call('runCanvasAgentImageToVideo', null, prompt);
                } else if (action === 'generate-video') {
                    const localPlan = call('buildCanvasAgentLocalInstructionPlan', {}, prompt, action) || {};
                    const options = {
                        originalPrompt: prompt,
                        presetName: localPlan.preset,
                        recommendedPrompt: localPlan.recommendedPrompt,
                        plan: localPlan
                    };
                    if (localPlan.action === 'image_to_video' || localPlan.action === 'multi_image_to_video') await call('runCanvasAgentImageToVideo', null, localPlan.prompt || prompt, options);
                    else if (localPlan.action === 'audio_to_video' || localPlan.action === 'image_audio_to_video') await call('runCanvasAgentAudioToVideo', null, localPlan.prompt || prompt, options);
                    else if (localPlan.action === 'video_audio_to_video') await call('runCanvasAgentVideoReferenceToVideo', null, localPlan.prompt || prompt, options);
                    else if (localPlan.action === 'video_edit') await call('runCanvasAgentVideoEdit', null, localPlan.prompt || prompt, options);
                    else await call('runCanvasAgentTextToVideo', null, localPlan.prompt || prompt, options);
                } else if (action === 'edit-video') {
                    await call('runCanvasAgentVideoEdit', null, prompt);
                } else if (action === 'audio-to-video') {
                    await call('runCanvasAgentAudioToVideo', null, prompt);
                } else if (action === 'edit-audio') {
                    await call('runCanvasAgentAudioEdit', null, prompt);
                } else if (action === 'generate-audio') {
                    const localPlan = call('buildCanvasAgentLocalInstructionPlan', {}, prompt, action) || {};
                    await call('runCanvasAgentTextToAudio', null, localPlan.prompt || prompt, {
                        originalPrompt: prompt,
                        presetName: localPlan.preset,
                        recommendedPrompt: localPlan.recommendedPrompt,
                        plan: localPlan
                    });
                } else if (action === 'refine-text') {
                    await call('runCanvasAgentTextRefine', null, prompt);
                }
            } catch (err) {
                console.error('[SimpAI Canvas Agent] action failed', err);
                call('setCanvasAgentRunInfo', null, null);
                const message = err?.message || String(err);
                call('setCanvasAgentMessage', null, t('Agent action failed: {error}', 'Agent 执行失败：{error}').replace('{error}', message));
                call('showToast', null, t('Agent action failed.', 'Agent 执行失败。'));
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
