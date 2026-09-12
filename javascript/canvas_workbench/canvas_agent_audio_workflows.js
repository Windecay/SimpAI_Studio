(function () {
    'use strict';

    function createCanvasAgentAudioWorkflowController(context) {
        const scope = context || {};
        const call = (name, fallback, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : fallback;
        const t = scope.t || ((en, cn) => cn || en);
        const uid = scope.uid || ((prefix) => `${prefix || 'id'}_${Date.now()}`);
        const normalizePresetName = scope.normalizePresetName || (value => String(value || '').trim());
        const chooseCanvasAgentPresetEntry = (...args) => call('chooseCanvasAgentPresetEntry', { entry: null, checked: [] }, ...args);
        const resolveCanvasAgentPrompt = (...args) => call('resolveCanvasAgentPrompt', null, ...args);
        const resetCanvasAgentRunInfo = (...args) => call('resetCanvasAgentRunInfo', null, ...args);
        const setCanvasAgentMessage = (...args) => call('setCanvasAgentMessage', null, ...args);
        const showToast = (...args) => call('showToast', null, ...args);
        const getCanvasAgentPrimaryMediaNode = (...args) => call('getCanvasAgentPrimaryMediaNode', null, ...args);
        const isCanvasAgentAudioTarget = (...args) => call('isCanvasAgentAudioTarget', false, ...args);
        const askCanvasAgentDecision = (...args) => call('askCanvasAgentDecision', 'cancel', ...args);
        const canvasAgentPromptSourceLabel = (...args) => call('canvasAgentPromptSourceLabel', '', ...args);
        const canvasAgentReferenceFacts = (...args) => call('canvasAgentReferenceFacts', [], ...args);
        const canvasAgentModelStatusLabel = (...args) => call('canvasAgentModelStatusLabel', '', ...args);
        const canvasAgentPresetDecisionOptions = (...args) => call('canvasAgentPresetDecisionOptions', [], ...args);
        const canvasAgentPromptDecisionField = (...args) => call('canvasAgentPromptDecisionField', {}, ...args);
        const canvasAgentPromptFromDecision = (...args) => call('canvasAgentPromptFromDecision', fallback => fallback, ...args);
        const findCanvasAgentPresetEntryByAlias = (...args) => call('findCanvasAgentPresetEntryByAlias', null, ...args);
        const addPresetNode = (...args) => call('addPresetNode', null, ...args);
        const addQwenTtsNode = (...args) => call('addQwenTtsNode', null, ...args);
        const qwenTtsModeLabel = (...args) => call('qwenTtsModeLabel', '', ...args);
        const markCanvasAgentCreatedNode = (...args) => call('markCanvasAgentCreatedNode', node => node, ...args);
        const canvasAgentWorkflowPresetPosition = (...args) => call('canvasAgentWorkflowPresetPosition', {}, ...args);
        const prepareCanvasAgentGenerator = (...args) => call('prepareCanvasAgentGenerator', false, ...args);
        const setCanvasAgentRunInfo = (...args) => call('setCanvasAgentRunInfo', null, ...args);
        const getCanvasAgentRewriteModel = (...args) => call('getCanvasAgentRewriteModel', '', ...args);
        const runQwenTtsNode = (...args) => call('runQwenTtsNode', null, ...args);
        const runPresetNode = (...args) => call('runPresetNode', null, ...args);
        const clearCanvasAgentRunInfo = (...args) => call('clearCanvasAgentRunInfo', null, ...args);
        const canvasAgentShortNodeLabel = (...args) => call('canvasAgentShortNodeLabel', '', ...args);
        const previewCanvasAgentMediaInputSlot = (...args) => call('previewCanvasAgentMediaInputSlot', null, ...args);
        const applyCanvasAgentPromptToGenerator = (...args) => call('applyCanvasAgentPromptToGenerator', null, ...args);
        const findCanvasAgentUploadSlotForTarget = (...args) => call('findCanvasAgentUploadSlotForTarget', '', ...args);
        const createUploadEdge = (...args) => call('createUploadEdge', null, ...args);
        const applyCanvasAgentResolutionToGenerator = (...args) => call('applyCanvasAgentResolutionToGenerator', null, ...args);
        const canvasAgentRunNodeSelection = (...args) => call('canvasAgentRunNodeSelection', null, ...args);

        function setCanvasAgentAudioPresetUnavailableMessage(choice) {
            resetCanvasAgentRunInfo();
            showToast(t('Audio preset unavailable. Configure an audio-capable preset in Agent Settings first.', '音频预设不可用。请先在 Agent Settings 配置支持音频的预设。'));
            const checked = Array.isArray(choice?.checked) && choice.checked.length ? `\n${choice.checked.join('; ')}` : '';
            setCanvasAgentMessage(`${t('Audio preset unavailable: configure an audio-capable Canvas Agent preset before running Audio edit or Text to audio.', 'Audio preset 不可用：请先配置支持音频的 Canvas Agent preset，再运行音频编辑或文生音频。')}${checked}`);
        }
    
        function setCanvasAgentNoCompatibleAudioInputMessage(entry) {
            resetCanvasAgentRunInfo();
            showToast(t('Selected audio preset has no compatible audio input.', '选择的音频预设没有兼容的音频输入。'));
            setCanvasAgentMessage(t('No compatible audio input: Audio edit needs a preset slot that accepts audio. Text to audio can run without an input clip.', 'No compatible audio input：音频编辑需要目标 preset 暴露可接收音频的输入槽；文生音频可不连接素材直接运行。'));
            if (entry) console.warn('[SimpAI Canvas Agent] audio preset has no compatible audio input', entry.name || entry.display_name || entry);
        }
    

        async function runCanvasAgentTextToAudio(prompt, options) {
            return runCanvasAgentQwenTtsVoiceDesign(prompt, options);
        }
    

        async function runCanvasAgentAudioPresetGenerate(prompt, options) {
            const opts = options || {};
            const choice = await chooseCanvasAgentPresetEntry('audio', { prompt: opts.originalPrompt || prompt, presetName: opts.presetName || opts.plan?.preset || '' });
            let entry = choice.entry;
            if (!entry) {
                setCanvasAgentAudioPresetUnavailableMessage(choice);
                return;
            }
            const resolved = await resolveCanvasAgentPrompt(prompt, 'text to audio', {
                recommendedPrompt: opts.recommendedPrompt || opts.plan?.recommendedPrompt || '',
                plan: opts.plan || null
            });
            if (!resolved.ok) {
                resetCanvasAgentRunInfo();
                setCanvasAgentMessage(t('Text to audio cancelled before prompt submit.', '文生音频已在提示词提交前取消。'));
                return;
            }
            const label = entry.display_name || entry.name || t('audio preset', '音频预设');
            const decisionForm = {
                preset: normalizePresetName(entry?.name || entry?.display_name || ''),
                prompt: resolved.prompt
            };
            const ok = await askCanvasAgentDecision({
                title: t('Start text-to-audio?', '开始文生音频？'),
                message: t('Agent will use {preset} and submit this prompt without connecting source media.', 'Agent 将使用 {preset}，不连接源素材，直接提交该提示词。').replace('{preset}', label),
                form: decisionForm,
                fields: [
                    { key: 'preset', label: t('Target preset', '目标 preset'), options: canvasAgentPresetDecisionOptions(entry) },
                    canvasAgentPromptDecisionField()
                ],
                facts: [
                    { label: t('Action', '动作'), value: t('Text to audio', '文生音频') },
                    { label: t('Preset', '预设'), value: label },
                    opts.plan ? { label: t('Route', '路线'), value: opts.plan.source === 'vlm_agent' ? t('Thinking mode', 'Thinking 模式') : t('Local fallback plan', '本地 fallback 计划') } : null,
                    choice.override ? { label: t('Override', '覆盖'), value: t('Preset mentioned in request', '按指令指定 preset') } : null,
                    ...canvasAgentReferenceFacts(),
                    { label: t('Prompt', '提示词'), value: canvasAgentPromptSourceLabel(resolved.source) },
                    { label: t('Models', '模型'), value: canvasAgentModelStatusLabel(choice.status) }
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
                setCanvasAgentMessage(t('Text to audio cancelled before submit.', '文生音频已在提交前取消。'));
                return;
            }
            resolved.prompt = canvasAgentPromptFromDecision(decisionForm, resolved.prompt);
            entry = findCanvasAgentPresetEntryByAlias(decisionForm.preset) || entry;
            if (!entry) {
                setCanvasAgentAudioPresetUnavailableMessage(choice);
                return;
            }
            const node = markCanvasAgentCreatedNode(addPresetNode(entry, canvasAgentWorkflowPresetPosition(null), {
                collapsed: true
            }), { sourcePatch: { agent_audio_mode: 'generate' } });
            if (!prepareCanvasAgentGenerator(node, resolved.prompt)) return;
            setCanvasAgentRunInfo({
                token: uid('agent_run'),
                stage: t('Submitting text to audio', '提交文生音频'),
                preset: node.title || node.preset?.display_name || node.preset?.name || entry.display_name || entry.name || '',
                model: ['llm_rewrite', 'thinking_recommendation'].includes(resolved.source) ? getCanvasAgentRewriteModel() : t('Direct prompt', '直接提示词')
            });
            setCanvasAgentMessage(t('Submitted text to audio with {source}.', '已使用 {source} 提交文生音频任务。').replace('{source}', canvasAgentPromptSourceLabel(resolved.source)));
            await runPresetNode(node, {
                agentWorkflowTitle: t('Agent text-to-audio', 'Agent 文生音频')
            });
            clearCanvasAgentRunInfo(1800);
        }
    

        async function runCanvasAgentQwenTtsVoiceDesign(prompt, options) {
            const opts = options || {};
            const resolved = await resolveCanvasAgentPrompt(prompt, 'Qwen TTS voice design', {
                recommendedPrompt: opts.recommendedPrompt || opts.plan?.recommendedPrompt || '',
                plan: opts.plan || null
            });
            if (!resolved.ok) {
                resetCanvasAgentRunInfo();
                setCanvasAgentMessage(t('Qwen TTS voice design cancelled before prompt submit.', 'Qwen TTS 音色设计已在提示词提交前取消。'));
                return;
            }
            const decisionForm = {
                text: resolved.prompt,
                instruct: opts.instruct || ''
            };
            const ok = await askCanvasAgentDecision({
                title: t('Start Qwen TTS voice design?', '开始 Qwen TTS 音色设计？'),
                message: t('Agent will create a Qwen TTS Voice Design node and generate an audio Result. It will not auto-run LTX video generation.', 'Agent 会创建 Qwen TTS Voice Design 节点并生成 Audio Result，不会自动继续运行 LTX 视频生成。'),
                form: decisionForm,
                fields: [
                    { key: 'text', label: t('Text to speech', '朗读文本'), type: 'textarea', rows: 4 },
                    { key: 'instruct', label: t('Voice / style instruction', '音色/风格描述'), type: 'textarea', rows: 3 }
                ],
                facts: [
                    { label: t('Action', '动作'), value: 'Qwen TTS voice design' },
                    opts.plan ? { label: t('Route', '路线'), value: opts.plan.source === 'vlm_agent' ? t('Thinking mode', 'Thinking 模式') : t('Local fallback plan', '本地 fallback 计划') } : null,
                    ...canvasAgentReferenceFacts(),
                    { label: t('Prompt', '提示词'), value: canvasAgentPromptSourceLabel(resolved.source) }
                ].filter(Boolean),
                details: resolved.prompt,
                note: [
                    opts.plan?.reason ? `${t('Plan', '计划')}: ${opts.plan.reason}` : '',
                    t('Hunyuan-Foley remains a Video -> Audio preset route; LTX TA2V/IA2V remains an Audio + Text/Image -> Video preset route.', 'Hunyuan-Foley 仍是 Video -> Audio preset 路线；LTX TA2V/IA2V 仍是 Audio + Text/Image -> Video preset 路线。')
                ].filter(Boolean).join('\n'),
                actions: [
                    { value: 'continue', label: t('Generate audio', '生成音频'), icon: 'fa-play', primary: true },
                    { value: 'cancel', label: t('Cancel', '取消'), icon: 'fa-xmark' }
                ]
            });
            if (ok !== 'continue') {
                resetCanvasAgentRunInfo();
                setCanvasAgentMessage(t('Qwen TTS voice design cancelled before submit.', 'Qwen TTS 音色设计已在提交前取消。'));
                return;
            }
            const node = markCanvasAgentCreatedNode(addQwenTtsNode('voice_design', canvasAgentWorkflowPresetPosition(null), {
                collapsed: true,
                history: true,
                toast: false,
                params: {
                    text: String(decisionForm.text || resolved.prompt || '').trim(),
                    instruct: String(decisionForm.instruct || '').trim()
                }
            }), { sourcePatch: { agent_audio_mode: 'qwen_tts_voice_design' } });
            if (!node) {
                setCanvasAgentMessage(t('Qwen TTS node could not be created.', '无法创建 Qwen TTS 节点。'));
                return;
            }
            setCanvasAgentRunInfo({
                token: uid('agent_run'),
                stage: 'Submitting Qwen TTS voice design',
                preset: node.title || qwenTtsModeLabel('voice_design'),
                model: ['llm_rewrite', 'thinking_recommendation'].includes(resolved.source) ? getCanvasAgentRewriteModel() : t('Direct prompt', '直接提示词')
            });
            setCanvasAgentMessage(t('Submitted Qwen TTS voice design with {source}.', '已使用 {source} 提交 Qwen TTS 音色设计任务。').replace('{source}', canvasAgentPromptSourceLabel(resolved.source)));
            await runQwenTtsNode(node, {
                agentWorkflowTitle: 'Agent audio generate: Qwen TTS voice design'
            });
            clearCanvasAgentRunInfo(1800);
        }
    

        async function runCanvasAgentAudioEdit(prompt, options) {
            const opts = options || {};
            const target = getCanvasAgentPrimaryMediaNode('audio', opts);
            if (!isCanvasAgentAudioTarget(target)) {
                resetCanvasAgentRunInfo();
                showToast(t('Select or attach an audio node first.', '请先选择或挂载一个音频节点。'));
                setCanvasAgentMessage(t('Audio edit needs a selected or attached Audio node. Use Text to audio when you want prompt-only generation.', 'Audio edit 需要选中或挂载音频节点；如果要纯提示词生成，请使用 Text to audio。'));
                return;
            }
            const choice = await chooseCanvasAgentPresetEntry('audio', { prompt: opts.originalPrompt || prompt, presetName: opts.presetName || opts.plan?.preset || '' });
            let entry = choice.entry;
            if (!entry) {
                setCanvasAgentAudioPresetUnavailableMessage(choice);
                return;
            }
            const resolved = await resolveCanvasAgentPrompt(prompt, 'audio edit', {
                mediaTarget: target,
                recommendedPrompt: opts.recommendedPrompt || opts.plan?.recommendedPrompt || '',
                plan: opts.plan || null
            });
            if (!resolved.ok) {
                resetCanvasAgentRunInfo();
                setCanvasAgentMessage(t('Audio edit cancelled before prompt submit.', '音频编辑已在提示词提交前取消。'));
                return;
            }
            let slotPreview = previewCanvasAgentMediaInputSlot(entry, target, { compatibleOnly: true });
            const decisionForm = {
                preset: normalizePresetName(entry?.name || entry?.display_name || ''),
                prompt: resolved.prompt
            };
            const ok = await askCanvasAgentDecision({
                title: t('Start audio edit?', '开始音频编辑？'),
                message: t('Agent will use {preset}, connect the selected audio, and submit this prompt.', 'Agent 将使用 {preset}、连接当前音频，并提交以下提示词。').replace('{preset}', entry.display_name || entry.name || t('audio preset', '音频预设')),
                form: decisionForm,
                fields: [
                    { key: 'preset', label: t('Target preset', '目标 preset'), options: canvasAgentPresetDecisionOptions(entry) },
                    canvasAgentPromptDecisionField()
                ],
                facts: [
                    { label: t('Action', '动作'), value: t('Audio edit', '音频编辑') },
                    { label: t('Preset', '预设'), value: entry.display_name || entry.name || t('audio preset', '音频预设') },
                    opts.plan ? { label: t('Route', '路线'), value: opts.plan.source === 'vlm_agent' ? t('Thinking mode', 'Thinking 模式') : t('Local fallback plan', '本地 fallback 计划') } : null,
                    choice.override ? { label: t('Override', '覆盖'), value: t('Preset mentioned in request', '按指令指定 preset') } : null,
                    { label: t('Source', '源音频'), value: canvasAgentShortNodeLabel(target) },
                    { label: t('Input slot', '输入槽'), value: slotPreview?.label || slotPreview?.key || t('No compatible audio input', '没有兼容音频输入槽') },
                    { label: t('Prompt', '提示词'), value: canvasAgentPromptSourceLabel(resolved.source) },
                    { label: t('Models', '模型'), value: canvasAgentModelStatusLabel(choice.status) }
                ].filter(Boolean),
                details: resolved.prompt,
                note: t('Audio edit only runs when the chosen preset exposes a compatible audio input. Text to audio can run without connecting the selected clip.', '音频编辑仅在所选 preset 暴露兼容音频输入槽时运行；文生音频可不连接当前素材直接运行。'),
                actions: [
                    { value: 'continue', label: t('Start edit', '开始编辑'), icon: 'fa-play', primary: true },
                    { value: 'cancel', label: t('Cancel', '取消'), icon: 'fa-xmark' }
                ]
            });
            if (ok !== 'continue') {
                resetCanvasAgentRunInfo();
                setCanvasAgentMessage(t('Audio edit cancelled before submit.', '音频编辑已在提交前取消。'));
                return;
            }
            resolved.prompt = canvasAgentPromptFromDecision(decisionForm, resolved.prompt);
            entry = findCanvasAgentPresetEntryByAlias(decisionForm.preset) || entry;
            slotPreview = previewCanvasAgentMediaInputSlot(entry, target, { compatibleOnly: true });
            if (!slotPreview) {
                setCanvasAgentNoCompatibleAudioInputMessage(entry);
                return;
            }
            const node = markCanvasAgentCreatedNode(addPresetNode(entry, canvasAgentWorkflowPresetPosition(target), {
                collapsed: true
            }), { sourcePatch: { agent_audio_mode: 'edit' } });
            applyCanvasAgentPromptToGenerator(node, resolved.prompt);
            const slot = findCanvasAgentUploadSlotForTarget(node, target, slotPreview?.key);
            if (!slot) {
                setCanvasAgentNoCompatibleAudioInputMessage(entry);
                return;
            }
            createUploadEdge(target.id, node.id, slot, { silent: true });
            const imageNode = getCanvasAgentPrimaryMediaNode('image', opts);
            if (imageNode && imageNode.id !== target.id) {
                const imageSlot = findCanvasAgentUploadSlotForTarget(node, imageNode, '');
                if (imageSlot) createUploadEdge(imageNode.id, node.id, imageSlot, { silent: true });
            }
            applyCanvasAgentResolutionToGenerator(node);
            canvasAgentRunNodeSelection(node);
            setCanvasAgentRunInfo({
                token: uid('agent_run'),
                stage: t('Submitting audio edit', '提交音频编辑'),
                preset: node.title || node.preset?.display_name || node.preset?.name || entry.display_name || entry.name || '',
                model: ['llm_rewrite', 'thinking_recommendation'].includes(resolved.source) ? getCanvasAgentRewriteModel() : t('Direct prompt', '直接提示词')
            });
            setCanvasAgentMessage(t('Submitted audio edit with {source}.', '已使用 {source} 提交音频编辑任务。').replace('{source}', canvasAgentPromptSourceLabel(resolved.source)));
            await runPresetNode(node, {
                agentWorkflowTitle: t('Agent audio edit', 'Agent 音频编辑')
            });
            clearCanvasAgentRunInfo(1800);
        }
    

        return {
            runCanvasAgentTextToAudio,
            runCanvasAgentAudioPresetGenerate,
            runCanvasAgentQwenTtsVoiceDesign,
            runCanvasAgentAudioEdit
        };
    }

    window.SimpAICanvasWorkbenchAudioWorkflows = Object.assign({}, window.SimpAICanvasWorkbenchAudioWorkflows || {}, {
        createCanvasAgentAudioWorkflowController
    });
})();
