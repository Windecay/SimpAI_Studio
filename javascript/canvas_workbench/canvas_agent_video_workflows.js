(function () {
    'use strict';

    function createCanvasAgentVideoWorkflowController(context) {
        const scope = context || {};
        const call = (name, fallback, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : fallback;
        const t = scope.t || ((en, cn) => cn || en);
        const uid = scope.uid || ((prefix) => `${prefix || 'id'}_${Date.now()}`);
        const nowIso = scope.nowIso || (() => new Date().toISOString());
        const normalizePresetName = scope.normalizePresetName || (value => String(value || '').trim());
        const getMaxExtraImageReferences = () => Math.max(0, Number(call('getMaxExtraImageReferences', 0) || 0));
        const getMaxImageReferences = () => Math.max(0, Number(call('getMaxImageReferences', 0) || 0));
        const getCanvasAgentTargetNode = (...args) => call('getCanvasAgentTargetNode', null, ...args);
        const isCanvasAgentGeneratorTarget = (...args) => call('isCanvasAgentGeneratorTarget', false, ...args);
        const resolveCanvasAgentPrompt = (...args) => call('resolveCanvasAgentPrompt', null, ...args);
        const resetCanvasAgentRunInfo = (...args) => call('resetCanvasAgentRunInfo', null, ...args);
        const setCanvasAgentMessage = (...args) => call('setCanvasAgentMessage', null, ...args);
        const chooseCanvasAgentPresetEntry = (...args) => call('chooseCanvasAgentPresetEntry', { entry: null, checked: [] }, ...args);
        const showToast = (...args) => call('showToast', null, ...args);
        const getCanvasAgentPrimaryMediaNode = (...args) => call('getCanvasAgentPrimaryMediaNode', null, ...args);
        const isCanvasAgentAudioTarget = (...args) => call('isCanvasAgentAudioTarget', false, ...args);
        const isCanvasAgentVideoTarget = (...args) => call('isCanvasAgentVideoTarget', false, ...args);
        const isCanvasAgentImageTarget = (...args) => call('isCanvasAgentImageTarget', false, ...args);
        const getCanvasAgentMediaReferenceNodes = (...args) => call('getCanvasAgentMediaReferenceNodes', {}, ...args);
        const canvasAgentMediaNodeCounts = (...args) => call('canvasAgentMediaNodeCounts', {}, ...args);
        const canvasAgentVideoTaskForMedia = (...args) => call('canvasAgentVideoTaskForMedia', '', ...args);
        const canvasAgentVideoTaskLabel = (...args) => call('canvasAgentVideoTaskLabel', '', ...args);
        const canvasAgentAudioVideoSceneTheme = (...args) => call('canvasAgentAudioVideoSceneTheme', '', ...args);
        const previewCanvasAgentMediaInputSlot = (...args) => call('previewCanvasAgentMediaInputSlot', null, ...args);
        const canvasAgentPromptTargetFromNode = (...args) => call('canvasAgentPromptTargetFromNode', {}, ...args);
        const canvasAgentPromptTargetFromEntry = (...args) => call('canvasAgentPromptTargetFromEntry', {}, ...args);
        const ensureCanvasAgentPromptPreflightAllows = (...args) => call('ensureCanvasAgentPromptPreflightAllows', { ok: true, prompt: '' }, ...args);
        const askCanvasAgentDecision = (...args) => call('askCanvasAgentDecision', 'cancel', ...args);
        const canvasAgentPresetDecisionOptions = (...args) => call('canvasAgentPresetDecisionOptions', [], ...args);
        const canvasAgentPromptDecisionField = (...args) => call('canvasAgentPromptDecisionField', {}, ...args);
        const canvasAgentReferenceFacts = (...args) => call('canvasAgentReferenceFacts', [], ...args);
        const canvasAgentMediaNodeFacts = (...args) => call('canvasAgentMediaNodeFacts', [], ...args);
        const canvasAgentShortNodeLabel = (...args) => call('canvasAgentShortNodeLabel', '', ...args);
        const canvasAgentResolutionLabel = (...args) => call('canvasAgentResolutionLabel', '', ...args);
        const canvasAgentPromptSourceLabel = (...args) => call('canvasAgentPromptSourceLabel', '', ...args);
        const canvasAgentPromptTargetFact = (...args) => call('canvasAgentPromptTargetFact', null, ...args);
        const canvasAgentPromptValidationFact = (...args) => call('canvasAgentPromptValidationFact', null, ...args);
        const canvasAgentPromptPreflightFacts = (...args) => call('canvasAgentPromptPreflightFacts', [], ...args);
        const canvasAgentPresetPromptDefaultsFacts = (...args) => call('canvasAgentPresetPromptDefaultsFacts', [], ...args);
        const canvasAgentModelStatusLabel = (...args) => call('canvasAgentModelStatusLabel', '', ...args);
        const canvasAgentPromptFromDecision = (...args) => call('canvasAgentPromptFromDecision', fallback => fallback, ...args);
        const canvasAgentPresetSupportsMediaRequest = (...args) => call('canvasAgentPresetSupportsMediaRequest', true, ...args);
        const findCanvasAgentPresetEntryByAlias = (...args) => call('findCanvasAgentPresetEntryByAlias', null, ...args);
        const canvasAgentReferenceKey = (...args) => call('canvasAgentReferenceKey', (node => node?.id || ''), ...args);
        const getCanvasAgentExtraImageReferences = (...args) => call('getCanvasAgentExtraImageReferences', [], ...args);
        const canvasAgentReferenceNode = (...args) => call('canvasAgentReferenceNode', null, ...args);
        const addPresetNode = (...args) => call('addPresetNode', null, ...args);
        const canvasAgentWorkflowPresetPosition = (...args) => call('canvasAgentWorkflowPresetPosition', {}, ...args);
        const markCanvasAgentCreatedNode = (...args) => call('markCanvasAgentCreatedNode', node => node, ...args);
        const applyCanvasAgentPromptToGenerator = (...args) => call('applyCanvasAgentPromptToGenerator', null, ...args);
        const connectCanvasAgentMediaToGenerator = (...args) => call('connectCanvasAgentMediaToGenerator', { ok: false }, ...args);
        const canvasAgentMediaConnectionError = (...args) => call('canvasAgentMediaConnectionError', '', ...args);
        const applyCanvasAgentResolutionToGenerator = (...args) => call('applyCanvasAgentResolutionToGenerator', null, ...args);
        const canvasAgentRunNodeSelection = (...args) => call('canvasAgentRunNodeSelection', null, ...args);
        const setCanvasAgentRunInfo = (...args) => call('setCanvasAgentRunInfo', null, ...args);
        const getCanvasAgentRewriteModel = (...args) => call('getCanvasAgentRewriteModel', '', ...args);
        const runPresetNode = (...args) => call('runPresetNode', null, ...args);
        const clearCanvasAgentRunInfo = (...args) => call('clearCanvasAgentRunInfo', null, ...args);
        const prepareCanvasAgentGenerator = (...args) => call('prepareCanvasAgentGenerator', false, ...args);
        const findCanvasAgentUploadSlotForTarget = (...args) => call('findCanvasAgentUploadSlotForTarget', '', ...args);
        const createUploadEdge = (...args) => call('createUploadEdge', null, ...args);

        async function runCanvasAgentTextToVideo(prompt, options) {
            const opts = options || {};
            const target = getCanvasAgentTargetNode();
            let generator = target && isCanvasAgentGeneratorTarget(target) ? target : null;
            const resolved = await resolveCanvasAgentPrompt(prompt, 'text-to-video', {
                recommendedPrompt: opts.recommendedPrompt || opts.plan?.recommendedPrompt || '',
                plan: opts.plan || null
            });
            if (!resolved.ok) {
                resetCanvasAgentRunInfo();
                setCanvasAgentMessage(t('Video generation cancelled before prompt submit.', '视频生成已在提示词提交前取消'));
                return;
            }
            let selectedEntry = null;
            let selectedChoice = null;
            if (!generator) {
                const choice = await chooseCanvasAgentPresetEntry('t2v', { prompt: opts.originalPrompt || prompt, presetName: opts.presetName || opts.plan?.preset || '' });
                selectedChoice = choice;
                selectedEntry = choice.entry;
                if (!selectedEntry) {
                    resetCanvasAgentRunInfo();
                    showToast(t('No text-to-video preset from the Agent queue was found.', 'Agent 文生视频队列中没有找到可用预设'));
                    setCanvasAgentMessage((choice.checked || []).join('; '));
                    return;
                }
            }
            const label = generator ? (generator.title || generator.id) : (selectedEntry?.display_name || selectedEntry?.name || t('queued preset', '队列预设'));
            const decisionForm = {
                preset: normalizePresetName(selectedEntry?.name || selectedEntry?.display_name || ''),
                prompt: resolved.prompt
            };
            const promptTarget = generator
                ? canvasAgentPromptTargetFromNode(generator, 'text-to-video')
                : canvasAgentPromptTargetFromEntry(selectedEntry, 'text-to-video');
            const preflightGate = await ensureCanvasAgentPromptPreflightAllows(resolved.prompt, promptTarget, 'text-to-video', {
                entry: generator || selectedEntry,
                action: 'text_to_video',
                presetName: opts.presetName || opts.plan?.preset || '',
                plan: opts.plan || null
            });
            if (!preflightGate.ok) {
                resetCanvasAgentRunInfo();
                setCanvasAgentMessage(preflightGate.error || t('Prompt preflight blocked video generation.', '提示词预检查阻止了视频生成。'));
                return;
            }
            resolved.prompt = preflightGate.prompt;
            decisionForm.prompt = resolved.prompt;
            const preflight = preflightGate.preflight;
            const ok = await askCanvasAgentDecision({
                title: t('Start text-to-video?', '开始文生视频？'),
                message: t('Agent will use {target} and submit this prompt.', 'Agent 将使用 {target} 并提交以下提示词。').replace('{target}', label),
                form: decisionForm,
                fields: [
                    ...(generator ? [] : [{ key: 'preset', label: t('Target preset', '目标 preset'), options: canvasAgentPresetDecisionOptions(selectedEntry) }]),
                    canvasAgentPromptDecisionField()
                ],
                facts: [
                    { label: t('Action', '动作'), value: t('Text-to-video', '文生视频') },
                    { label: t('Target', '目标'), value: label },
                    opts.plan ? { label: t('Route', '路线'), value: opts.plan.source === 'vlm_agent' ? t('Thinking mode', 'Thinking 模式') : t('Local fallback plan', '本地 fallback 计划') } : null,
                    selectedChoice?.override ? { label: t('Override', '覆盖'), value: t('Preset mentioned in request', '按指令指定 preset') } : null,
                    ...canvasAgentReferenceFacts(),
                    { label: t('Resolution', '分辨率'), value: canvasAgentResolutionLabel() },
                    { label: t('Prompt', '提示词'), value: canvasAgentPromptSourceLabel(resolved.source) },
                    canvasAgentPromptTargetFact(promptTarget),
                    canvasAgentPromptValidationFact(resolved.prompt, promptTarget),
                    ...canvasAgentPromptPreflightFacts(preflight),
                    ...canvasAgentPresetPromptDefaultsFacts(promptTarget, generator || selectedEntry),
                    { label: t('Models', '模型'), value: generator ? t('Existing node gate', '现有节点门禁') : canvasAgentModelStatusLabel(selectedChoice?.status) }
                ].filter(Boolean),
                details: resolved.prompt,
                note: [opts.plan?.reason ? `${t('Plan', '计划')}: ${opts.plan.reason}` : '', `${t('Prompt source', '提示词来源')}: ${canvasAgentPromptSourceLabel(resolved.source)}`].filter(Boolean).join('\n'),
                actions: [
                    { value: 'continue', label: t('Start', '开始'), icon: 'fa-play', primary: true },
                    { value: 'cancel', label: t('Cancel', '取消'), icon: 'fa-xmark' }
                ]
            });
            if (ok !== 'continue') {
                resetCanvasAgentRunInfo();
                setCanvasAgentMessage(t('Video generation cancelled before submit.', '视频生成已在提交前取消'));
                return;
            }
            resolved.prompt = canvasAgentPromptFromDecision(decisionForm, resolved.prompt);
            if (!generator) {
                const chosenEntry = findCanvasAgentPresetEntryByAlias(decisionForm.preset) || selectedEntry;
                if (!chosenEntry) {
                    resetCanvasAgentRunInfo();
                    showToast(t('Selected target preset is unavailable.', '选择的目标 preset 不可用'));
                    return;
                }
                generator = markCanvasAgentCreatedNode(addPresetNode(chosenEntry, canvasAgentWorkflowPresetPosition(null), {
                    collapsed: true,
                    source: { kind: 'canvas_agent_created', created_at: nowIso() }
                }));
            }
            if (!prepareCanvasAgentGenerator(generator, resolved.prompt)) return;
            setCanvasAgentRunInfo({
                token: uid('agent_run'),
                stage: t('Submitting video generation', '提交视频生成'),
                preset: generator.title || generator.preset?.display_name || generator.preset?.name || label,
                model: ['llm_rewrite', 'thinking_recommendation'].includes(resolved.source) ? getCanvasAgentRewriteModel() : t('Direct prompt', '直接提示词')
            });
            setCanvasAgentMessage(t('Submitted text-to-video generation with {source}.', '已使用 {source} 提交文生视频任务。').replace('{source}', canvasAgentPromptSourceLabel(resolved.source)));
            await runPresetNode(generator, generator?.source?.kind === 'canvas_agent_created' ? {
                agentWorkflowTitle: t('Agent text-to-video', 'Agent 文生视频')
            } : {});
            clearCanvasAgentRunInfo(1800);
        }
    

        async function runCanvasAgentAudioToVideo(prompt, options) {
            const opts = options || {};
            const target = getCanvasAgentPrimaryMediaNode('audio', opts);
            if (!isCanvasAgentAudioTarget(target)) {
                resetCanvasAgentRunInfo();
                showToast(t('Select or attach an audio node first.', '请先选择或挂载一个音频节点。'));
                setCanvasAgentMessage(t('Audio to video needs an Audio node or audio Result as the upstream source.', '音频转视频需要音频节点或音频结果作为上游输入。'));
                return;
            }
            const imageNode = getCanvasAgentPrimaryMediaNode('image', opts);
            const videoNode = getCanvasAgentPrimaryMediaNode('video', opts);
            const mediaNodes = getCanvasAgentMediaReferenceNodes({ image: imageNode, video: videoNode, audio: target });
            const mediaCounts = canvasAgentMediaNodeCounts(mediaNodes);
            const videoTask = canvasAgentVideoTaskForMedia(mediaCounts);
            const bridgeKind = videoTask === 'video_audio_to_video'
                ? 'reference_to_video'
                : (imageNode ? 'audio_image_to_video' : 'audio_to_video');
            const choice = await chooseCanvasAgentPresetEntry(bridgeKind, {
                prompt: opts.originalPrompt || prompt,
                presetName: opts.presetName || opts.plan?.preset || '',
                mediaCounts,
                task: videoTask
            });
            let entry = choice.entry;
            if (!entry) {
                resetCanvasAgentRunInfo();
                showToast(t('No audio-to-video preset was found.', '没有找到可用的音频转视频预设。'));
                setCanvasAgentMessage((choice.checked || []).join('; '));
                return;
            }
            const resolved = await resolveCanvasAgentPrompt(prompt, imageNode ? 'audio+image-to-video' : 'audio-to-video', {
                mediaTarget: target,
                imageTarget: imageNode,
                recommendedPrompt: opts.recommendedPrompt || opts.plan?.recommendedPrompt || '',
                plan: opts.plan || null
            });
            if (!resolved.ok) {
                resetCanvasAgentRunInfo();
                setCanvasAgentMessage(t('Audio-to-video cancelled before prompt submit.', '音频转视频已在提示词提交前取消。'));
                return;
            }
            let audioVideoTheme = canvasAgentAudioVideoSceneTheme(entry, !!imageNode, videoTask);
            let audioSlotPreview = previewCanvasAgentMediaInputSlot(entry, target, { compatibleOnly: true, sceneTheme: audioVideoTheme });
            const decisionForm = {
                preset: normalizePresetName(entry?.name || entry?.display_name || ''),
                prompt: resolved.prompt
            };
            const promptTarget = canvasAgentPromptTargetFromEntry(entry, imageNode ? 'audio+image-to-video' : 'audio-to-video');
            const preflightGate = await ensureCanvasAgentPromptPreflightAllows(resolved.prompt, promptTarget, imageNode ? 'audio+image-to-video' : 'audio-to-video', {
                entry,
                action: videoTask,
                presetName: opts.presetName || opts.plan?.preset || '',
                plan: opts.plan || null
            });
            if (!preflightGate.ok) {
                resetCanvasAgentRunInfo();
                setCanvasAgentMessage(preflightGate.error || t('Prompt preflight blocked audio-to-video.', '提示词预检查阻止了音频转视频。'));
                return;
            }
            resolved.prompt = preflightGate.prompt;
            decisionForm.prompt = resolved.prompt;
            const preflight = preflightGate.preflight;
            const ok = await askCanvasAgentDecision({
                title: t('Start {action}?', '开始{action}？').replace('{action}', canvasAgentVideoTaskLabel(videoTask)),
                message: t('Agent will use {preset}, connect all compatible attached references, and submit this prompt.', 'Agent 将使用 {preset}，连接全部兼容的已挂载引用，并提交这个提示词。').replace('{preset}', entry.display_name || entry.name || t('audio-to-video preset', '音频转视频预设')),
                form: decisionForm,
                fields: [
                    { key: 'preset', label: t('Target preset', '目标 preset'), options: canvasAgentPresetDecisionOptions(entry) },
                    canvasAgentPromptDecisionField()
                ],
                facts: [
                    { label: t('Action', '动作'), value: canvasAgentVideoTaskLabel(videoTask) },
                    { label: t('Preset', '预设'), value: entry.display_name || entry.name || t('audio-to-video preset', '音频转视频预设') },
                    opts.plan ? { label: t('Route', '路线'), value: opts.plan.source === 'vlm_agent' ? t('Thinking mode', 'Thinking 模式') : t('Local fallback plan', '本地 fallback 计划') } : null,
                    choice.override ? { label: t('Override', '覆盖'), value: t('Preset mentioned in request', '按指令指定 preset') } : null,
                    { label: t('Audio', '音频'), value: canvasAgentShortNodeLabel(target) },
                    ...canvasAgentMediaNodeFacts(mediaNodes),
                    audioVideoTheme ? { label: t('Mode', '模式'), value: audioVideoTheme } : null,
                    { label: t('Audio slot', '音频槽'), value: audioSlotPreview?.label || audioSlotPreview?.key || t('No compatible audio input', '没有兼容音频输入槽') },
                    { label: t('Prompt', '提示词'), value: canvasAgentPromptSourceLabel(resolved.source) },
                    canvasAgentPromptTargetFact(promptTarget),
                    canvasAgentPromptValidationFact(resolved.prompt, promptTarget),
                    ...canvasAgentPromptPreflightFacts(preflight),
                    ...canvasAgentPresetPromptDefaultsFacts(promptTarget, entry),
                    { label: t('Models', '模型'), value: canvasAgentModelStatusLabel(choice.status) }
                ].filter(Boolean),
                details: resolved.prompt,
                note: t('Audio-to-video only runs when the chosen preset exposes a compatible audio input such as scene_audio.', 'Audio-to-video 仅在所选 preset 暴露 scene_audio 等兼容音频输入槽时运行。'),
                actions: [
                    { value: 'continue', label: t('Start video', '开始视频'), icon: 'fa-play', primary: true },
                    { value: 'cancel', label: t('Cancel', '取消'), icon: 'fa-xmark' }
                ]
            });
            if (ok !== 'continue') {
                resetCanvasAgentRunInfo();
                setCanvasAgentMessage(t('Audio-to-video cancelled before submit.', '音频转视频已在提交前取消。'));
                return;
            }
            resolved.prompt = canvasAgentPromptFromDecision(decisionForm, resolved.prompt);
            entry = findCanvasAgentPresetEntryByAlias(decisionForm.preset) || entry;
            if (!canvasAgentPresetSupportsMediaRequest(entry, mediaCounts, videoTask)) {
                resetCanvasAgentRunInfo();
                showToast(t('Selected preset cannot accept all attached references.', '所选 preset 无法接收全部已挂载引用。'));
                setCanvasAgentMessage(t('Choose a preset whose image, video, and audio capacities cover the attached references.', '请选择图片、视频和音频容量能够容纳当前引用的 preset。'));
                return;
            }
            audioVideoTheme = canvasAgentAudioVideoSceneTheme(entry, !!imageNode, videoTask);
            audioSlotPreview = previewCanvasAgentMediaInputSlot(entry, target, { compatibleOnly: true, sceneTheme: audioVideoTheme });
            if (Array.isArray(entry?.schema?.themes) && entry.schema.themes.length > 1 && !audioVideoTheme) {
                resetCanvasAgentRunInfo();
                showToast(t('Selected preset has no audio-to-video mode.', '所选 preset 没有音频转视频模式。'));
                setCanvasAgentMessage(t('No audio-to-video mode: choose an LTX TA2V/IA2V preset whose mode is Text+Audio to Video or Image+Audio to Video.', '没有音频转视频模式：请选择模式为 Text+Audio to Video 或 Image+Audio to Video 的 LTX TA2V/IA2V preset。'));
                return;
            }
            if (!audioSlotPreview) {
                resetCanvasAgentRunInfo();
                showToast(t('Selected preset has no compatible audio input.', '所选 preset 没有兼容音频输入槽。'));
                setCanvasAgentMessage(t('No compatible audio input: choose an LTX TA2V/IA2V style preset that exposes scene_audio.', '没有兼容音频输入：请选择暴露 scene_audio 的 LTX TA2V/IA2V 类 preset。'));
                return;
            }
            const node = markCanvasAgentCreatedNode(addPresetNode(entry, canvasAgentWorkflowPresetPosition(target), {
                collapsed: true,
                sceneTheme: audioVideoTheme,
                source: { kind: 'canvas_agent_created', created_at: nowIso(), agent_audio_mode: videoTask, agent_audio_scene_theme: audioVideoTheme || '' }
            }));
            applyCanvasAgentPromptToGenerator(node, resolved.prompt);
            const connections = connectCanvasAgentMediaToGenerator(node, mediaNodes);
            if (!connections.ok) {
                const error = canvasAgentMediaConnectionError(connections);
                resetCanvasAgentRunInfo();
                showToast(error);
                setCanvasAgentMessage(error);
                return;
            }
            applyCanvasAgentResolutionToGenerator(node);
            canvasAgentRunNodeSelection(node);
            setCanvasAgentRunInfo({
                token: uid('agent_run'),
                stage: t('Submitting {action}', '提交{action}').replace('{action}', canvasAgentVideoTaskLabel(videoTask)),
                preset: node.title || node.preset?.display_name || node.preset?.name || entry.display_name || entry.name || '',
                model: ['llm_rewrite', 'thinking_recommendation'].includes(resolved.source) ? getCanvasAgentRewriteModel() : t('Direct prompt', '直接提示词')
            });
            setCanvasAgentMessage(t('Submitted reference-to-video generation with {source}.', '已使用 {source} 提交参考生成视频任务。').replace('{source}', canvasAgentPromptSourceLabel(resolved.source)));
            await runPresetNode(node, {
                agentWorkflowTitle: t('Agent reference-to-video', 'Agent 参考生成视频')
            });
            clearCanvasAgentRunInfo(1800);
        }
    

        async function runCanvasAgentImageToVideo(prompt, options) {
            const opts = options || {};
            const target = getCanvasAgentPrimaryMediaNode('image', opts);
            if (!isCanvasAgentImageTarget(target)) {
                resetCanvasAgentRunInfo();
                showToast(t('Select or attach an image first.', '请先选择或挂载一张图片'));
                return;
            }
            const resolved = await resolveCanvasAgentPrompt(prompt, 'image to video', {
                imageTarget: target,
                mediaTarget: target,
                recommendedPrompt: opts.recommendedPrompt || opts.plan?.recommendedPrompt || '',
                plan: opts.plan || null
            });
            if (!resolved.ok) {
                resetCanvasAgentRunInfo();
                setCanvasAgentMessage(t('Image-to-video cancelled before prompt submit.', '图生视频已在提示词提交前取消'));
                return;
            }
            const extraImageRefs = getCanvasAgentExtraImageReferences()
                .map(ref => canvasAgentReferenceNode(ref))
                .filter(node => node && node.id !== target.id && isCanvasAgentImageTarget(node))
                .slice(0, getMaxExtraImageReferences());
            const videoNode = getCanvasAgentPrimaryMediaNode('video', opts);
            const audioNode = getCanvasAgentPrimaryMediaNode('audio', opts);
            const mediaNodes = getCanvasAgentMediaReferenceNodes({ image: target, video: videoNode, audio: audioNode });
            mediaNodes.image = [target].concat(extraImageRefs).filter((node, index, list) => (
                node && list.findIndex(item => canvasAgentReferenceKey(item, 'image') === canvasAgentReferenceKey(node, 'image')) === index
            )).slice(0, getMaxImageReferences());
            const mediaCounts = canvasAgentMediaNodeCounts(mediaNodes);
            const videoTask = canvasAgentVideoTaskForMedia(mediaCounts);
            const queueKind = videoTask === 'video_audio_to_video'
                ? 'reference_to_video'
                : (videoTask === 'image_audio_to_video' ? 'audio_image_to_video' : 'i2v');
            const choice = await chooseCanvasAgentPresetEntry(queueKind, {
                prompt: opts.originalPrompt || prompt,
                presetName: opts.presetName || opts.plan?.preset || '',
                imageCount: mediaCounts.image,
                mediaCounts,
                task: videoTask
            });
            let entry = choice.entry;
            if (!entry) {
                resetCanvasAgentRunInfo();
                showToast(t('No image-to-video preset from the Agent queue was found.', 'Agent 图生视频队列中没有找到可用预设'));
                setCanvasAgentMessage((choice.checked || []).join('; '));
                return;
            }
            let slotPreview = previewCanvasAgentMediaInputSlot(entry, target);
            const decisionForm = {
                preset: normalizePresetName(entry?.name || entry?.display_name || ''),
                prompt: resolved.prompt
            };
            const promptTarget = canvasAgentPromptTargetFromEntry(entry, 'image to video');
            const preflightGate = await ensureCanvasAgentPromptPreflightAllows(resolved.prompt, promptTarget, 'image to video', {
                entry,
                action: videoTask,
                presetName: opts.presetName || opts.plan?.preset || '',
                plan: opts.plan || null
            });
            if (!preflightGate.ok) {
                resetCanvasAgentRunInfo();
                setCanvasAgentMessage(preflightGate.error || t('Prompt preflight blocked image-to-video.', '提示词预检查阻止了图生视频。'));
                return;
            }
            resolved.prompt = preflightGate.prompt;
            decisionForm.prompt = resolved.prompt;
            const preflight = preflightGate.preflight;
            const ok = await askCanvasAgentDecision({
                title: t('Start {action}?', '开始{action}？').replace('{action}', canvasAgentVideoTaskLabel(videoTask)),
                message: t('Agent will use {preset}, connect all compatible attached references, and submit this prompt.', 'Agent 将使用 {preset}，连接全部兼容的已挂载引用，并提交以下提示词。').replace('{preset}', entry.display_name || entry.name || t('I2V preset', '图生视频预设')),
                form: decisionForm,
                fields: [
                    { key: 'preset', label: t('Target preset', '目标 preset'), options: canvasAgentPresetDecisionOptions(entry) },
                    canvasAgentPromptDecisionField()
                ],
                facts: [
                    { label: t('Action', '动作'), value: canvasAgentVideoTaskLabel(videoTask) },
                    { label: t('Preset', '预设'), value: entry.display_name || entry.name || t('I2V preset', '图生视频预设') },
                    opts.plan ? { label: t('Route', '路线'), value: opts.plan.source === 'vlm_agent' ? t('Thinking mode', 'Thinking 模式') : t('Local fallback plan', '本地 fallback 计划') } : null,
                    choice.override ? { label: t('Override', '覆盖'), value: t('Preset mentioned in request', '按指令指定 preset') } : null,
                    { label: t('Source', '源图'), value: canvasAgentShortNodeLabel(target) },
                    ...canvasAgentMediaNodeFacts(mediaNodes),
                    { label: t('Input slot', '输入槽'), value: slotPreview?.label || slotPreview?.key || t('First compatible slot', '第一个兼容输入槽') },
                    { label: t('Resolution', '分辨率'), value: canvasAgentResolutionLabel() },
                    { label: t('Prompt', '提示词'), value: canvasAgentPromptSourceLabel(resolved.source) },
                    canvasAgentPromptTargetFact(promptTarget),
                    canvasAgentPromptValidationFact(resolved.prompt, promptTarget),
                    ...canvasAgentPromptPreflightFacts(preflight),
                    ...canvasAgentPresetPromptDefaultsFacts(promptTarget, entry),
                    { label: t('Models', '模型'), value: canvasAgentModelStatusLabel(choice.status) }
                ].filter(Boolean),
                details: resolved.prompt,
                note: [opts.plan?.reason ? `${t('Plan', '计划')}: ${opts.plan.reason}` : '', `${t('Prompt source', '提示词来源')}: ${canvasAgentPromptSourceLabel(resolved.source)}`].filter(Boolean).join('\n'),
                actions: [
                    { value: 'continue', label: t('Start video', '开始视频'), icon: 'fa-play', primary: true },
                    { value: 'cancel', label: t('Cancel', '取消'), icon: 'fa-xmark' }
                ]
            });
            if (ok !== 'continue') {
                resetCanvasAgentRunInfo();
                setCanvasAgentMessage(t('Image-to-video cancelled before submit.', '图生视频已在提交前取消'));
                return;
            }
            resolved.prompt = canvasAgentPromptFromDecision(decisionForm, resolved.prompt);
            entry = findCanvasAgentPresetEntryByAlias(decisionForm.preset) || entry;
            if (!canvasAgentPresetSupportsMediaRequest(entry, mediaCounts, videoTask)) {
                resetCanvasAgentRunInfo();
                showToast(t('Selected preset cannot accept all attached references.', '所选 preset 无法接收全部已挂载引用。'));
                setCanvasAgentMessage(t('Choose a preset whose image, video, and audio capacities cover the attached references.', '请选择图片、视频和音频容量能够容纳当前引用的 preset。'));
                return;
            }
            slotPreview = previewCanvasAgentMediaInputSlot(entry, target);
            const node = markCanvasAgentCreatedNode(addPresetNode(entry, canvasAgentWorkflowPresetPosition(target), {
                collapsed: true,
                source: { kind: 'canvas_agent_created', created_at: nowIso() }
            }));
            applyCanvasAgentPromptToGenerator(node, resolved.prompt);
            const connections = connectCanvasAgentMediaToGenerator(node, mediaNodes);
            if (!connections.ok) {
                const error = canvasAgentMediaConnectionError(connections);
                showToast(error);
                setCanvasAgentMessage(error);
                return;
            }
            applyCanvasAgentResolutionToGenerator(node);
            canvasAgentRunNodeSelection(node);
            setCanvasAgentRunInfo({
                token: uid('agent_run'),
                stage: t('Submitting {action}', '提交{action}').replace('{action}', canvasAgentVideoTaskLabel(videoTask)),
                preset: node.title || node.preset?.display_name || node.preset?.name || entry.display_name || entry.name || '',
                model: ['llm_rewrite', 'thinking_recommendation'].includes(resolved.source) ? getCanvasAgentRewriteModel() : t('Direct prompt', '直接提示词')
            });
            setCanvasAgentMessage(t('Submitted reference-to-video generation with {source}.', '已使用 {source} 提交参考生成视频任务。').replace('{source}', canvasAgentPromptSourceLabel(resolved.source)));
            await runPresetNode(node, {
                agentWorkflowTitle: t('Agent reference-to-video', 'Agent 参考生成视频')
            });
            clearCanvasAgentRunInfo(1800);
        }
    

        async function runCanvasAgentVideoReferenceToVideo(prompt, options) {
            const opts = options || {};
            const target = getCanvasAgentPrimaryMediaNode('video', opts);
            if (!isCanvasAgentVideoTarget(target)) {
                resetCanvasAgentRunInfo();
                showToast(t('Select or attach a reference video first.', '请先选择或挂载一个参考视频。'));
                setCanvasAgentMessage(t('Reference-to-video needs at least one Video node or video Result.', '参考生成视频至少需要一个视频节点或视频结果。'));
                return;
            }
            if (getCanvasAgentPrimaryMediaNode('audio', opts)) {
                await runCanvasAgentAudioToVideo(prompt, Object.assign({}, opts, { targetNodeId: target.id }));
                return;
            }
            if (getCanvasAgentPrimaryMediaNode('image', opts)) {
                await runCanvasAgentImageToVideo(prompt, Object.assign({}, opts, { targetNodeId: target.id }));
                return;
            }
            const mediaNodes = getCanvasAgentMediaReferenceNodes({ video: target });
            const mediaCounts = canvasAgentMediaNodeCounts(mediaNodes);
            const videoTask = canvasAgentVideoTaskForMedia(mediaCounts);
            const choice = await chooseCanvasAgentPresetEntry('reference_to_video', {
                prompt: opts.originalPrompt || prompt,
                presetName: opts.presetName || opts.plan?.preset || '',
                mediaCounts,
                task: videoTask
            });
            let entry = choice.entry;
            if (!entry) {
                resetCanvasAgentRunInfo();
                showToast(t('No reference-to-video preset was found.', '没有找到可用的参考生成视频预设。'));
                setCanvasAgentMessage((choice.checked || []).join('; '));
                return;
            }
            const resolved = await resolveCanvasAgentPrompt(prompt, 'reference video to video', {
                mediaTarget: target,
                recommendedPrompt: opts.recommendedPrompt || opts.plan?.recommendedPrompt || '',
                plan: opts.plan || null
            });
            if (!resolved.ok) {
                resetCanvasAgentRunInfo();
                setCanvasAgentMessage(t('Reference-to-video cancelled before prompt submit.', '参考生成视频已在提示词提交前取消。'));
                return;
            }
            let slotPreview = previewCanvasAgentMediaInputSlot(entry, target, { compatibleOnly: true });
            const decisionForm = {
                preset: normalizePresetName(entry?.name || entry?.display_name || ''),
                prompt: resolved.prompt
            };
            const promptTarget = canvasAgentPromptTargetFromEntry(entry, 'reference video to video');
            const preflightGate = await ensureCanvasAgentPromptPreflightAllows(resolved.prompt, promptTarget, 'reference video to video', {
                entry,
                action: videoTask,
                presetName: opts.presetName || opts.plan?.preset || '',
                plan: opts.plan || null
            });
            if (!preflightGate.ok) {
                resetCanvasAgentRunInfo();
                setCanvasAgentMessage(preflightGate.error || t('Prompt preflight blocked reference-to-video.', '提示词预检查阻止了参考生成视频。'));
                return;
            }
            resolved.prompt = preflightGate.prompt;
            decisionForm.prompt = resolved.prompt;
            const preflight = preflightGate.preflight;
            const ok = await askCanvasAgentDecision({
                title: t('Start reference-to-video?', '开始参考生成视频？'),
                message: t('Agent will use {preset}, connect all attached reference videos, and submit this prompt.', 'Agent 将使用 {preset}，连接全部已挂载参考视频，并提交这个提示词。').replace('{preset}', entry.display_name || entry.name || t('reference-to-video preset', '参考生成视频预设')),
                form: decisionForm,
                fields: [
                    { key: 'preset', label: t('Target preset', '目标 preset'), options: canvasAgentPresetDecisionOptions(entry) },
                    canvasAgentPromptDecisionField()
                ],
                facts: [
                    { label: t('Action', '动作'), value: t('Reference-to-video', '参考生成视频') },
                    { label: t('Preset', '预设'), value: entry.display_name || entry.name || t('reference-to-video preset', '参考生成视频预设') },
                    opts.plan ? { label: t('Route', '路线'), value: opts.plan.source === 'vlm_agent' ? t('Thinking mode', 'Thinking 模式') : t('Local fallback plan', '本地 fallback 计划') } : null,
                    choice.override ? { label: t('Override', '覆盖'), value: t('Preset mentioned in request', '按指令指定 preset') } : null,
                    { label: t('Source', '源视频'), value: canvasAgentShortNodeLabel(target) },
                    ...canvasAgentMediaNodeFacts(mediaNodes),
                    { label: t('Input slot', '输入槽'), value: slotPreview?.label || slotPreview?.key || t('No compatible video input', '没有兼容视频输入槽') },
                    { label: t('Resolution', '分辨率'), value: canvasAgentResolutionLabel() },
                    { label: t('Prompt', '提示词'), value: canvasAgentPromptSourceLabel(resolved.source) },
                    canvasAgentPromptTargetFact(promptTarget),
                    canvasAgentPromptValidationFact(resolved.prompt, promptTarget),
                    ...canvasAgentPromptPreflightFacts(preflight),
                    ...canvasAgentPresetPromptDefaultsFacts(promptTarget, entry),
                    { label: t('Models', '模型'), value: canvasAgentModelStatusLabel(choice.status) }
                ].filter(Boolean),
                details: resolved.prompt,
                note: [opts.plan?.reason ? `${t('Plan', '计划')}: ${opts.plan.reason}` : '', `${t('Prompt source', '提示词来源')}: ${canvasAgentPromptSourceLabel(resolved.source)}`].filter(Boolean).join('\n'),
                actions: [
                    { value: 'continue', label: t('Start video', '开始视频'), icon: 'fa-play', primary: true },
                    { value: 'cancel', label: t('Cancel', '取消'), icon: 'fa-xmark' }
                ]
            });
            if (ok !== 'continue') {
                resetCanvasAgentRunInfo();
                setCanvasAgentMessage(t('Reference-to-video cancelled before submit.', '参考生成视频已在提交前取消。'));
                return;
            }
            resolved.prompt = canvasAgentPromptFromDecision(decisionForm, resolved.prompt);
            entry = findCanvasAgentPresetEntryByAlias(decisionForm.preset) || entry;
            if (!canvasAgentPresetSupportsMediaRequest(entry, mediaCounts, videoTask)) {
                resetCanvasAgentRunInfo();
                showToast(t('Selected preset cannot accept all attached reference videos.', '所选 preset 无法接收全部已挂载参考视频。'));
                setCanvasAgentMessage(t('Choose a preset whose video capacity covers the attached references.', '请选择视频容量能够容纳当前引用的 preset。'));
                return;
            }
            slotPreview = previewCanvasAgentMediaInputSlot(entry, target, { compatibleOnly: true });
            if (!slotPreview) {
                resetCanvasAgentRunInfo();
                showToast(t('Selected preset has no compatible video input.', '所选 preset 没有兼容视频输入槽。'));
                return;
            }
            const node = markCanvasAgentCreatedNode(addPresetNode(entry, canvasAgentWorkflowPresetPosition(target), {
                collapsed: true,
                source: { kind: 'canvas_agent_created', created_at: nowIso(), agent_video_mode: videoTask }
            }));
            applyCanvasAgentPromptToGenerator(node, resolved.prompt);
            const connections = connectCanvasAgentMediaToGenerator(node, mediaNodes);
            if (!connections.ok) {
                const error = canvasAgentMediaConnectionError(connections);
                resetCanvasAgentRunInfo();
                showToast(error);
                setCanvasAgentMessage(error);
                return;
            }
            applyCanvasAgentResolutionToGenerator(node);
            canvasAgentRunNodeSelection(node);
            setCanvasAgentRunInfo({
                token: uid('agent_run'),
                stage: t('Submitting reference-to-video', '提交参考生成视频'),
                preset: node.title || node.preset?.display_name || node.preset?.name || entry.display_name || entry.name || '',
                model: ['llm_rewrite', 'thinking_recommendation'].includes(resolved.source) ? getCanvasAgentRewriteModel() : t('Direct prompt', '直接提示词')
            });
            setCanvasAgentMessage(t('Submitted reference-to-video generation with {source}.', '已使用 {source} 提交参考生成视频任务。').replace('{source}', canvasAgentPromptSourceLabel(resolved.source)));
            await runPresetNode(node, {
                agentWorkflowTitle: t('Agent reference-to-video', 'Agent 参考生成视频')
            });
            clearCanvasAgentRunInfo(1800);
        }
    

        async function runCanvasAgentVideoEdit(prompt, options) {
            const opts = options || {};
            const target = getCanvasAgentPrimaryMediaNode('video', opts);
            if (!isCanvasAgentVideoTarget(target)) {
                resetCanvasAgentRunInfo();
                showToast(t('Select or attach a video first.', '请先选择或挂载一个视频'));
                return;
            }
            const resolved = await resolveCanvasAgentPrompt(prompt, 'video edit', {
                mediaTarget: target,
                recommendedPrompt: opts.recommendedPrompt || opts.plan?.recommendedPrompt || '',
                plan: opts.plan || null
            });
            if (!resolved.ok) {
                resetCanvasAgentRunInfo();
                setCanvasAgentMessage(t('Video edit cancelled before prompt submit.', '视频编辑已在提示词提交前取消'));
                return;
            }
            const choice = await chooseCanvasAgentPresetEntry('video_edit', { prompt: opts.originalPrompt || prompt, presetName: opts.presetName || opts.plan?.preset || '' });
            let entry = choice.entry;
            if (!entry) {
                resetCanvasAgentRunInfo();
                showToast(t('No video-edit preset from the Agent queue was found.', 'Agent 视频编辑队列中没有找到可用预设'));
                setCanvasAgentMessage((choice.checked || []).join('; '));
                return;
            }
            let slotPreview = previewCanvasAgentMediaInputSlot(entry, target);
            const decisionForm = {
                preset: normalizePresetName(entry?.name || entry?.display_name || ''),
                prompt: resolved.prompt
            };
            const promptTarget = canvasAgentPromptTargetFromEntry(entry, 'video edit');
            const preflightGate = await ensureCanvasAgentPromptPreflightAllows(resolved.prompt, promptTarget, 'video edit', {
                entry,
                action: 'video_edit',
                presetName: opts.presetName || opts.plan?.preset || '',
                plan: opts.plan || null
            });
            if (!preflightGate.ok) {
                resetCanvasAgentRunInfo();
                setCanvasAgentMessage(preflightGate.error || t('Prompt preflight blocked video edit.', '提示词预检查阻止了视频编辑。'));
                return;
            }
            resolved.prompt = preflightGate.prompt;
            decisionForm.prompt = resolved.prompt;
            const preflight = preflightGate.preflight;
            const ok = await askCanvasAgentDecision({
                title: t('Start video edit?', '开始视频编辑？'),
                message: t('Agent will use {preset}, connect the selected video, and submit this prompt.', 'Agent 将使用 {preset}、连接当前视频，并提交以下提示词。').replace('{preset}', entry.display_name || entry.name || t('video preset', '视频预设')),
                form: decisionForm,
                fields: [
                    { key: 'preset', label: t('Target preset', '目标 preset'), options: canvasAgentPresetDecisionOptions(entry) },
                    canvasAgentPromptDecisionField()
                ],
                facts: [
                    { label: t('Action', '动作'), value: t('Video edit / extend', '视频编辑 / 延长') },
                    { label: t('Preset', '预设'), value: entry.display_name || entry.name || t('video preset', '视频预设') },
                    opts.plan ? { label: t('Route', '路线'), value: opts.plan.source === 'vlm_agent' ? t('Thinking mode', 'Thinking 模式') : t('Local fallback plan', '本地 fallback 计划') } : null,
                    choice.override ? { label: t('Override', '覆盖'), value: t('Preset mentioned in request', '按指令指定 preset') } : null,
                    { label: t('Source', '源视频'), value: canvasAgentShortNodeLabel(target) },
                    { label: t('Input slot', '输入槽'), value: slotPreview?.label || slotPreview?.key || t('First compatible slot', '第一个兼容输入槽') },
                    { label: t('Resolution', '分辨率'), value: canvasAgentResolutionLabel() },
                    { label: t('Prompt', '提示词'), value: canvasAgentPromptSourceLabel(resolved.source) },
                    canvasAgentPromptTargetFact(promptTarget),
                    canvasAgentPromptValidationFact(resolved.prompt, promptTarget),
                    ...canvasAgentPromptPreflightFacts(preflight),
                    ...canvasAgentPresetPromptDefaultsFacts(promptTarget, entry),
                    { label: t('Models', '模型'), value: canvasAgentModelStatusLabel(choice.status) }
                ].filter(Boolean),
                details: resolved.prompt,
                note: [opts.plan?.reason ? `${t('Plan', '计划')}: ${opts.plan.reason}` : '', `${t('Prompt source', '提示词来源')}: ${canvasAgentPromptSourceLabel(resolved.source)}`].filter(Boolean).join('\n'),
                actions: [
                    { value: 'continue', label: t('Start edit', '开始编辑'), icon: 'fa-play', primary: true },
                    { value: 'cancel', label: t('Cancel', '取消'), icon: 'fa-xmark' }
                ]
            });
            if (ok !== 'continue') {
                resetCanvasAgentRunInfo();
                setCanvasAgentMessage(t('Video edit cancelled before submit.', '视频编辑已在提交前取消'));
                return;
            }
            resolved.prompt = canvasAgentPromptFromDecision(decisionForm, resolved.prompt);
            entry = findCanvasAgentPresetEntryByAlias(decisionForm.preset) || entry;
            slotPreview = previewCanvasAgentMediaInputSlot(entry, target);
            const node = markCanvasAgentCreatedNode(addPresetNode(entry, canvasAgentWorkflowPresetPosition(target), {
                collapsed: true,
                source: { kind: 'canvas_agent_created', created_at: nowIso() }
            }));
            applyCanvasAgentPromptToGenerator(node, resolved.prompt);
            const slot = findCanvasAgentUploadSlotForTarget(node, target, slotPreview?.key);
            if (!slot) {
                showToast(t('Selected video preset has no compatible video input.', '选择的视频预设没有兼容的视频输入'));
                return;
            }
            createUploadEdge(target.id, node.id, slot, { silent: true });
            applyCanvasAgentResolutionToGenerator(node);
            canvasAgentRunNodeSelection(node);
            setCanvasAgentRunInfo({
                token: uid('agent_run'),
                stage: t('Submitting video edit', '提交视频编辑'),
                preset: node.title || node.preset?.display_name || node.preset?.name || entry.display_name || entry.name || '',
                model: ['llm_rewrite', 'thinking_recommendation'].includes(resolved.source) ? getCanvasAgentRewriteModel() : t('Direct prompt', '直接提示词')
            });
            setCanvasAgentMessage(t('Submitted video edit with {source}.', '已使用 {source} 提交视频编辑任务。').replace('{source}', canvasAgentPromptSourceLabel(resolved.source)));
            await runPresetNode(node, {
                agentWorkflowTitle: t('Agent video edit', 'Agent 视频编辑')
            });
            clearCanvasAgentRunInfo(1800);
        }
    

        return {
            runCanvasAgentTextToVideo,
            runCanvasAgentAudioToVideo,
            runCanvasAgentImageToVideo,
            runCanvasAgentVideoReferenceToVideo,
            runCanvasAgentVideoEdit
        };
    }

    window.SimpAICanvasWorkbenchVideoWorkflows = Object.assign({}, window.SimpAICanvasWorkbenchVideoWorkflows || {}, {
        createCanvasAgentVideoWorkflowController
    });
})();
