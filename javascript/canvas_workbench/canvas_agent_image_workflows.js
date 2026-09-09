(function () {
    'use strict';

    function createCanvasAgentImageWorkflowController(context) {
        const scope = context || {};
        const call = (name, fallback, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : fallback;
        const t = scope.t || ((en, cn) => cn || en);
        const uid = scope.uid || ((prefix) => `${prefix || 'id'}_${Date.now()}`);
        const nowIso = scope.nowIso || (() => new Date().toISOString());
        const normalizePresetName = scope.normalizePresetName || (value => String(value || '').trim());
        const getMaxExtraImageReferences = () => Math.max(0, Number(call('getMaxExtraImageReferences', 0) || 0));
        const refreshPresetCatalog = (...args) => call('refreshPresetCatalog', null, ...args);
        const getCanvasAgentTargetNode = (...args) => call('getCanvasAgentTargetNode', null, ...args);
        const isCanvasAgentGeneratorTarget = (...args) => call('isCanvasAgentGeneratorTarget', false, ...args);
        const getNode = (...args) => call('getNode', null, ...args);
        const findCanvasAgentWorkflowPresetByKey = (...args) => call('findCanvasAgentWorkflowPresetByKey', null, ...args);
        const resolveCanvasAgentPrompt = (...args) => call('resolveCanvasAgentPrompt', null, ...args);
        const resetCanvasAgentRunInfo = (...args) => call('resetCanvasAgentRunInfo', null, ...args);
        const setCanvasAgentMessage = (...args) => call('setCanvasAgentMessage', null, ...args);
        const chooseCanvasAgentPresetEntry = (...args) => call('chooseCanvasAgentPresetEntry', { entry: null, checked: [] }, ...args);
        const getPresetCatalog = (...args) => call('getPresetCatalog', [], ...args);
        const canvasAgentPresetSupportsTask = (...args) => call('canvasAgentPresetSupportsTask', false, ...args);
        const showToast = (...args) => call('showToast', null, ...args);
        const canvasAgentPromptTargetFromNode = (...args) => call('canvasAgentPromptTargetFromNode', {}, ...args);
        const canvasAgentPromptTargetFromEntry = (...args) => call('canvasAgentPromptTargetFromEntry', {}, ...args);
        const ensureCanvasAgentPromptMatchesTarget = (...args) => call('ensureCanvasAgentPromptMatchesTarget', { ok: true, prompt: '' }, ...args);
        const canvasAgentPresetPromptDefaults = (...args) => call('canvasAgentPresetPromptDefaults', {}, ...args);
        const ensureCanvasAgentPromptPreflightAllows = (...args) => call('ensureCanvasAgentPromptPreflightAllows', { ok: true, prompt: '' }, ...args);
        const askCanvasAgentDecision = (...args) => call('askCanvasAgentDecision', 'cancel', ...args);
        const canvasAgentPresetDecisionOptions = (...args) => call('canvasAgentPresetDecisionOptions', [], ...args);
        const canvasAgentPromptDecisionField = (...args) => call('canvasAgentPromptDecisionField', {}, ...args);
        const canvasAgentReferenceFacts = (...args) => call('canvasAgentReferenceFacts', [], ...args);
        const canvasAgentResolutionLabel = (...args) => call('canvasAgentResolutionLabel', '', ...args);
        const canvasAgentPromptSourceLabel = (...args) => call('canvasAgentPromptSourceLabel', '', ...args);
        const canvasAgentPromptTargetFact = (...args) => call('canvasAgentPromptTargetFact', null, ...args);
        const canvasAgentPromptValidationFact = (...args) => call('canvasAgentPromptValidationFact', null, ...args);
        const canvasAgentPromptPreflightFacts = (...args) => call('canvasAgentPromptPreflightFacts', [], ...args);
        const canvasAgentPresetPromptDefaultsFacts = (...args) => call('canvasAgentPresetPromptDefaultsFacts', [], ...args);
        const canvasAgentModelStatusLabel = (...args) => call('canvasAgentModelStatusLabel', '', ...args);
        const canvasAgentPromptFromDecision = (...args) => call('canvasAgentPromptFromDecision', fallback => fallback, ...args);
        const findPresetCatalogEntryByName = (...args) => call('findPresetCatalogEntryByName', null, ...args);
        const vlmCanvasAgentWorkflowKey = (...args) => call('vlmCanvasAgentWorkflowKey', '', ...args);
        const addPresetNode = (...args) => call('addPresetNode', null, ...args);
        const canvasAgentWorkflowPresetPosition = (...args) => call('canvasAgentWorkflowPresetPosition', {}, ...args);
        const markCanvasAgentCreatedNode = (...args) => call('markCanvasAgentCreatedNode', node => node, ...args);
        const applyCanvasAgentPresetDefaultsToGenerator = (...args) => call('applyCanvasAgentPresetDefaultsToGenerator', null, ...args);
        const tagCanvasAgentWorkflowPreset = (...args) => call('tagCanvasAgentWorkflowPreset', null, ...args);
        const normalizeCanvasAgentGenerationOptions = (...args) => call('normalizeCanvasAgentGenerationOptions', {}, ...args);
        const getPromptTextSourceNode = (...args) => call('getPromptTextSourceNode', null, ...args);
        const mergeCommaPromptText = (...args) => call('mergeCommaPromptText', value => String(value || '').trim(), ...args);
        const prepareCanvasAgentGenerator = (...args) => call('prepareCanvasAgentGenerator', false, ...args);
        const getCanvasAgentRewriteModel = (...args) => call('getCanvasAgentRewriteModel', '', ...args);
        const runPresetNode = (...args) => call('runPresetNode', null, ...args);
        const getCanvasAgentPrimaryImageReference = (...args) => call('getCanvasAgentPrimaryImageReference', null, ...args);
        const isCanvasAgentImageTarget = (...args) => call('isCanvasAgentImageTarget', false, ...args);
        const canvasAgentReferenceNode = (...args) => call('canvasAgentReferenceNode', null, ...args);
        const getCanvasAgentExtraImageReferences = (...args) => call('getCanvasAgentExtraImageReferences', [], ...args);
        const previewCanvasAgentEditInputSlot = (...args) => call('previewCanvasAgentEditInputSlot', null, ...args);
        const canvasAgentShortNodeLabel = (...args) => call('canvasAgentShortNodeLabel', '', ...args);
        const findCanvasAgentPresetEntryByAlias = (...args) => call('findCanvasAgentPresetEntryByAlias', null, ...args);
        const applyCanvasAgentPromptToGenerator = (...args) => call('applyCanvasAgentPromptToGenerator', null, ...args);
        const applyCanvasAgentGenerationOptionsToGenerator = (...args) => call('applyCanvasAgentGenerationOptionsToGenerator', null, ...args);
        const canvasAgentUploadSlotsForNode = (...args) => call('canvasAgentUploadSlotsForNode', [], ...args);
        const isCanvasAgentMaskSlot = (...args) => call('isCanvasAgentMaskSlot', false, ...args);
        const canNodeConnectToUploadSlot = (...args) => call('canNodeConnectToUploadSlot', false, ...args);
        const createUploadEdge = (...args) => call('createUploadEdge', null, ...args);
        const applyCanvasAgentResolutionToGenerator = (...args) => call('applyCanvasAgentResolutionToGenerator', null, ...args);
        const mutate = (...args) => call('mutate', null, ...args);
        const setCanvasAgentRunInfo = (...args) => call('setCanvasAgentRunInfo', null, ...args);
        const clearCanvasAgentRunInfo = (...args) => call('clearCanvasAgentRunInfo', null, ...args);
        const setCanvasAgentSelection = (...args) => call('setCanvasAgentSelection', null, ...args);

        async function runCanvasAgentTextToImage(prompt, options) {
            const opts = options || {};
            await refreshPresetCatalog();
            const target = opts.ignoreSelectedTarget ? null : getCanvasAgentTargetNode();
            let generator = target && isCanvasAgentGeneratorTarget(target) ? target : null;
            const ownerNode = getNode(opts.sourceVlmNodeId) || null;
            const requestedWorkflowKey = String(opts.workflowKey || '').trim();
            if (!generator && requestedWorkflowKey) {
                generator = findCanvasAgentWorkflowPresetByKey(requestedWorkflowKey, opts.presetName || opts.plan?.preset || '');
            }
            const resolved = opts.skipPromptResolve
                ? {
                    ok: true,
                    prompt: String(opts.recommendedPrompt || opts.plan?.recommendedPrompt || prompt || '').trim(),
                    source: opts.promptSource || 'vlm_agent_prepared'
                }
                : await resolveCanvasAgentPrompt(prompt, 'text-to-image', {
                    recommendedPrompt: opts.recommendedPrompt || opts.plan?.recommendedPrompt || '',
                    plan: opts.plan || null
                });
            if (!resolved.ok) {
                resetCanvasAgentRunInfo();
                setCanvasAgentMessage(t('Generation cancelled before prompt submit.', '生成已在提示词提交前取消'));
                return { ok: false, error: 'cancelled before prompt submit' };
            }
            let selectedEntry = null;
            let selectedChoice = null;
            let fallbackNote = '';
            if (!generator) {
                const choice = await chooseCanvasAgentPresetEntry('t2i', { prompt: opts.originalPrompt || prompt, presetName: opts.presetName || opts.plan?.preset || '', task: 'text_to_image' });
                selectedChoice = choice;
                selectedEntry = choice.entry || getPresetCatalog().find(entry => canvasAgentPresetSupportsTask(entry, 'text_to_image'));
                if (!selectedEntry) {
                    resetCanvasAgentRunInfo();
                    showToast(t('No text-to-image preset was found in the catalog.', '预设目录中没有找到文生图预设'));
                    setCanvasAgentMessage((choice.checked || []).join('; '));
                    return { ok: false, error: 'no text-to-image preset found', checked: choice.checked || [] };
                }
                if (!choice.status?.ready) {
                    fallbackNote = `\n\n${t('Warning: no queue preset was confirmed ready. The normal model gate will run after node creation.', '注意：队列里没有确认 ready 的 preset，创建节点后仍会走正常模型预检。')}`;
                }
            }
            let selectedPresetName = normalizePresetName(selectedEntry?.name || selectedEntry?.display_name || generator?.preset?.name || generator?.preset?.display_name || opts.presetName || opts.plan?.preset || '');
            let workflowKey = requestedWorkflowKey || (opts.sourceVlmNodeId && selectedPresetName ? vlmCanvasAgentWorkflowKey(opts.sourceVlmNodeId, 't2i', selectedPresetName) : '');
            if (!generator && workflowKey) generator = findCanvasAgentWorkflowPresetByKey(workflowKey, selectedPresetName);
            if (!generator && opts.sourceVlmNodeId && selectedPresetName) {
                const implicitKey = vlmCanvasAgentWorkflowKey(opts.sourceVlmNodeId, 't2i', selectedPresetName);
                generator = findCanvasAgentWorkflowPresetByKey(implicitKey, selectedPresetName);
                if (generator) workflowKey = implicitKey;
            }
            const label = generator ? (generator.title || generator.id) : (selectedEntry?.display_name || selectedEntry?.name || t('queued preset', '队列预设'));
            const decisionForm = {
                preset: normalizePresetName(selectedEntry?.name || selectedEntry?.display_name || ''),
                prompt: resolved.prompt
            };
            const promptTarget = generator
                ? canvasAgentPromptTargetFromNode(generator, 'text-to-image')
                : canvasAgentPromptTargetFromEntry(selectedEntry, 'text-to-image');
            const sourceUserPrompt = String(opts.originalPrompt || opts.userPrompt || opts.plan?.prompt || opts.plan?.original_prompt || prompt || '').trim();
            let preflight = opts.promptPreflight || null;
            if (!opts.skipPromptTargetChecks) {
            const targetRewrite = await ensureCanvasAgentPromptMatchesTarget(resolved.prompt, promptTarget, 'text-to-image', {
                entry: generator || selectedEntry,
                presetName: selectedPresetName || opts.presetName || opts.plan?.preset || '',
                plan: opts.plan || null,
                promptSource: resolved.source,
                presetDefaults: canvasAgentPresetPromptDefaults(generator || selectedEntry)
            });
            if (targetRewrite.ok && targetRewrite.prompt && targetRewrite.prompt !== resolved.prompt) {
                resolved.prompt = targetRewrite.prompt;
                resolved.source = targetRewrite.source || resolved.source;
                decisionForm.prompt = resolved.prompt;
            }
            const preflightGate = await ensureCanvasAgentPromptPreflightAllows(resolved.prompt, promptTarget, 'text-to-image', {
                entry: generator || selectedEntry,
                action: 'text_to_image',
                presetName: selectedPresetName || opts.presetName || opts.plan?.preset || '',
                plan: opts.plan || null,
                userPrompt: sourceUserPrompt,
                autoStart: opts.autoStart
            });
            if (!preflightGate.ok) {
                resetCanvasAgentRunInfo();
                setCanvasAgentMessage(preflightGate.error || t('Prompt preflight blocked generation.', '提示词预检查阻止了生成。'));
                return { ok: false, error: preflightGate.error || 'prompt preflight blocked' };
            }
            resolved.prompt = preflightGate.prompt;
            decisionForm.prompt = resolved.prompt;
            preflight = preflightGate.preflight;
            }
            const ok = opts.autoStart ? 'continue' : await askCanvasAgentDecision({
                title: t('Start text-to-image?', '开始文生图？'),
                message: t('Agent will use {target} and submit this prompt.', 'Agent 将使用 {target} 并提交以下提示词。').replace('{target}', label),
                form: decisionForm,
                fields: [
                    ...(generator ? [] : [{ key: 'preset', label: t('Target preset', '目标 preset'), options: canvasAgentPresetDecisionOptions(selectedEntry, { task: 'text_to_image' }) }]),
                    canvasAgentPromptDecisionField()
                ],
                facts: [
                    { label: t('Action', '动作'), value: t('Text-to-image', '文生图') },
                    { label: t('Target', '目标'), value: label },
                    opts.plan ? { label: t('Route', '路线'), value: opts.plan.source === 'vlm_agent' ? t('Thinking mode', 'Thinking 思考模式') : t('Local fallback plan', '本地 fallback 计划') } : null,
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
                note: [opts.plan?.reason ? `${t('Plan', '计划')}：${opts.plan.reason}` : '', `${t('Prompt source', '提示词来源')}：${canvasAgentPromptSourceLabel(resolved.source)}`, fallbackNote.trim()].filter(Boolean).join('\n'),
                actions: [
                    { value: 'continue', label: t('Start', '开始'), icon: 'fa-play', primary: true },
                    { value: 'cancel', label: t('Cancel', '取消'), icon: 'fa-xmark' }
                ]
            });
            if (ok !== 'continue') {
                resetCanvasAgentRunInfo();
                setCanvasAgentMessage(t('Generation cancelled before submit.', '生成已在提交前取消'));
                return { ok: false, error: 'cancelled before submit' };
            }
            resolved.prompt = opts.autoStart
                ? String(resolved.prompt || '').trim()
                : canvasAgentPromptFromDecision(decisionForm, resolved.prompt);
            if (!generator) {
                const chosenEntry = findPresetCatalogEntryByName(decisionForm.preset);
                if (!chosenEntry || !canvasAgentPresetSupportsTask(chosenEntry, 'text_to_image')) {
                    resetCanvasAgentRunInfo();
                    showToast(t('Selected target preset is unavailable.', '选择的目标 preset 不可用'));
                    return { ok: false, error: 'selected preset unavailable' };
                }
                selectedEntry = chosenEntry;
                const presetName = normalizePresetName(selectedEntry?.name || selectedEntry?.display_name || selectedPresetName);
                if (presetName !== selectedPresetName) {
                    const changedTarget = canvasAgentPromptTargetFromEntry(selectedEntry, 'text-to-image');
                    const rewrite = await ensureCanvasAgentPromptMatchesTarget(resolved.prompt, changedTarget, 'text-to-image', {
                        entry: selectedEntry,
                        presetName,
                        promptSource: resolved.source,
                        presetDefaults: canvasAgentPresetPromptDefaults(selectedEntry)
                    });
                    if (!rewrite.ok) {
                        resetCanvasAgentRunInfo();
                        return { ok: false, error: rewrite.error || 'prompt target rewrite failed' };
                    }
                    const gate = await ensureCanvasAgentPromptPreflightAllows(rewrite.prompt || resolved.prompt, changedTarget, 'text-to-image', {
                        entry: selectedEntry,
                        action: 'text_to_image',
                        presetName,
                        userPrompt: sourceUserPrompt,
                        autoStart: opts.autoStart
                    });
                    if (!gate.ok) {
                        resetCanvasAgentRunInfo();
                        return { ok: false, error: gate.error || 'prompt preflight blocked' };
                    }
                    resolved.prompt = gate.prompt;
                    resolved.source = rewrite.source || resolved.source;
                    preflight = gate.preflight;
                    workflowKey = opts.sourceVlmNodeId ? vlmCanvasAgentWorkflowKey(opts.sourceVlmNodeId, 't2i', presetName) : '';
                }
                selectedPresetName = presetName;
                if (!workflowKey && opts.sourceVlmNodeId && presetName) {
                    const implicitKey = vlmCanvasAgentWorkflowKey(opts.sourceVlmNodeId, 't2i', presetName);
                    const reusable = findCanvasAgentWorkflowPresetByKey(implicitKey, presetName);
                    if (reusable) {
                        generator = reusable;
                        workflowKey = implicitKey;
                    }
                }
            }
            if (!generator) {
                const presetName = selectedPresetName;
                const newWorkflowKey = workflowKey || (opts.sourceVlmNodeId ? vlmCanvasAgentWorkflowKey(opts.sourceVlmNodeId, 't2i', presetName) : '');
                generator = markCanvasAgentCreatedNode(addPresetNode(selectedEntry, canvasAgentWorkflowPresetPosition(ownerNode || null), {
                    collapsed: true,
                    source: { kind: 'canvas_agent_created', created_at: nowIso() }
                }));
                applyCanvasAgentPresetDefaultsToGenerator(generator, selectedEntry);
                tagCanvasAgentWorkflowPreset(generator, {
                    workflowKey: newWorkflowKey,
                    kind: 't2i',
                    ownerNodeId: opts.sourceVlmNodeId || '',
                    presetName
                });
            }
            if (generator && workflowKey) {
                tagCanvasAgentWorkflowPreset(generator, {
                    workflowKey,
                    kind: 't2i',
                    ownerNodeId: opts.sourceVlmNodeId || '',
                    presetName: normalizePresetName(generator.preset?.name || generator.preset?.display_name || selectedPresetName)
                });
            }
            applyCanvasAgentPresetDefaultsToGenerator(generator, selectedEntry || generator);
            const generationOptions = normalizeCanvasAgentGenerationOptions(opts.plan || opts, `${opts.originalPrompt || ''}\n${resolved.prompt || ''}`);
            const negativePrompt = String(opts.negativePrompt || generationOptions.negativePrompt || '').trim();
            if (negativePrompt && !getPromptTextSourceNode(generator, 'negative_prompt')) {
                const existingNegative = String(generator?.params?.negative_prompt || '').trim();
                generator.params = Object.assign({}, generator.params || {}, { negative_prompt: mergeCommaPromptText(existingNegative, negativePrompt) });
            }
            if (!prepareCanvasAgentGenerator(generator, resolved.prompt, generationOptions)) return { ok: false, error: 'generator preparation failed' };
            setCanvasAgentRunInfo({
                token: uid('agent_run'),
                stage: t('Submitting generation', '提交文生图'),
                preset: generator.title || generator.preset?.display_name || generator.preset?.name || label,
                model: ['llm_rewrite', 'thinking_recommendation'].includes(resolved.source) ? getCanvasAgentRewriteModel() : t('Direct prompt', '直接提示词')
            });
            setCanvasAgentMessage(t('Submitted text-to-image generation with {source}.', '已使用 {source} 提交文生图任务').replace('{source}', canvasAgentPromptSourceLabel(resolved.source)));
            const runOptions = generator?.source?.kind === 'canvas_agent_created' ? {
                agentWorkflowTitle: t('Agent text-to-image', 'Agent 文生图'),
                reuseExistingResult: !!(opts.reuseExistingWorkflowResult || generator.source?.agent_workflow_key),
                skipInputPreflight: !!opts.skipPromptTargetChecks || !!opts.promptPreflight
            } : {};
            if (opts.skipPromptTargetChecks || opts.promptPreflight) {
                runOptions.skipInputPreflight = true;
            }
            const runResponse = await runPresetNode(generator, runOptions);
            clearCanvasAgentRunInfo(1800);
            return Object.assign({
                ok: !!runResponse?.ok,
                preset_node_id: generator.id,
                generator_id: generator.id,
                workflow_key: generator.source?.agent_workflow_key || workflowKey || ''
            }, runResponse || {});
        }

        async function runCanvasAgentImageEdit(prompt, options) {
            const opts = options || {};
            const fallbackTarget = opts.ignoreSelectedTarget ? null : getCanvasAgentTargetNode();
            const primaryRef = getCanvasAgentPrimaryImageReference();
            const explicitTarget = getNode(opts.targetNodeId || '');
            const target = (explicitTarget && isCanvasAgentImageTarget(explicitTarget) ? explicitTarget : null)
                || canvasAgentReferenceNode(primaryRef)
                || fallbackTarget;
            if (!isCanvasAgentImageTarget(target)) {
                resetCanvasAgentRunInfo();
                showToast(t('Select an image or image Result node first.', '请先选中图片或图像 Result 节点'));
                return { ok: false, error: 'image edit target missing' };
            }
            const resolved = opts.skipPromptResolve
                ? {
                    ok: true,
                    prompt: String(opts.recommendedPrompt || opts.plan?.recommendedPrompt || prompt || '').trim(),
                    source: opts.promptSource || 'vlm_agent_prepared'
                }
                : await resolveCanvasAgentPrompt(prompt, 'image edit', {
                    imageTarget: target,
                    recommendedPrompt: opts.recommendedPrompt || opts.plan?.recommendedPrompt || '',
                    plan: opts.plan || null
                });
            if (!resolved.ok) {
                resetCanvasAgentRunInfo();
                setCanvasAgentMessage(t('Image edit cancelled before prompt submit.', '图片编辑已在提示词提交前取消'));
                return { ok: false, error: 'cancelled before prompt submit' };
            }
            const choice = await chooseCanvasAgentPresetEntry('edit', { prompt: opts.originalPrompt || prompt, presetName: opts.presetName || opts.plan?.preset || '' });
            let editEntry = choice.entry;
            if (!editEntry) {
                resetCanvasAgentRunInfo();
                showToast(t('No image-edit preset from the Agent queue was found.', 'Agent 图片编辑队列中没有找到可用预设'));
                setCanvasAgentMessage((choice.checked || []).join('; '));
                return { ok: false, error: 'no image-edit preset found', checked: choice.checked || [] };
            }
            const fallbackNote = choice.status?.ready ? '' : `\n\n${t('Warning: no edit queue preset was confirmed ready. The normal model gate will run after node creation.', '注意：编辑队列里没有确认 ready 的 preset，创建节点后仍会走正常模型预检。')}`;
            let slotPreview = previewCanvasAgentEditInputSlot(editEntry, target);
            const extraImageRefs = getCanvasAgentExtraImageReferences()
                .map(ref => canvasAgentReferenceNode(ref))
                .filter(node => node && node.id !== target.id && isCanvasAgentImageTarget(node))
                .slice(0, getMaxExtraImageReferences());
            const decisionForm = {
                preset: normalizePresetName(editEntry?.name || editEntry?.display_name || ''),
                prompt: resolved.prompt
            };
            const promptTarget = canvasAgentPromptTargetFromEntry(editEntry, 'image edit');
            let preflight = opts.promptPreflight || null;
            if (!opts.skipPromptTargetChecks) {
            const targetRewrite = await ensureCanvasAgentPromptMatchesTarget(resolved.prompt, promptTarget, 'image edit', {
                entry: editEntry,
                presetName: opts.presetName || opts.plan?.preset || '',
                plan: opts.plan || null,
                promptSource: resolved.source,
                presetDefaults: canvasAgentPresetPromptDefaults(editEntry)
            });
            if (targetRewrite.ok && targetRewrite.prompt && targetRewrite.prompt !== resolved.prompt) {
                resolved.prompt = targetRewrite.prompt;
                resolved.source = targetRewrite.source || resolved.source;
                decisionForm.prompt = resolved.prompt;
            }
            const preflightGate = await ensureCanvasAgentPromptPreflightAllows(resolved.prompt, promptTarget, 'image edit', {
                entry: editEntry,
                action: 'image_edit',
                presetName: opts.presetName || opts.plan?.preset || '',
                plan: opts.plan || null,
                autoStart: opts.autoStart
            });
            if (!preflightGate.ok) {
                resetCanvasAgentRunInfo();
                setCanvasAgentMessage(preflightGate.error || t('Prompt preflight blocked image edit.', '提示词预检查阻止了图片编辑。'));
                return { ok: false, error: preflightGate.error || 'prompt preflight blocked' };
            }
            resolved.prompt = preflightGate.prompt;
            decisionForm.prompt = resolved.prompt;
            preflight = preflightGate.preflight;
            }
            const ok = opts.autoStart ? 'continue' : await askCanvasAgentDecision({
                title: t('Start image edit?', '开始编辑图片？'),
                message: t('Agent will use {preset}, connect the selected image, and submit this prompt.', 'Agent 将使用 {preset}、连接当前图片，并提交以下提示词。').replace('{preset}', editEntry.display_name || editEntry.name || t('edit preset', '编辑预设')),
                form: decisionForm,
                fields: [
                    { key: 'preset', label: t('Target preset', '目标 preset'), options: canvasAgentPresetDecisionOptions(editEntry) },
                    canvasAgentPromptDecisionField()
                ],
                facts: [
                    { label: t('Action', '动作'), value: t('Image edit', '图片编辑') },
                    { label: t('Preset', '预设'), value: editEntry.display_name || editEntry.name || t('edit preset', '编辑预设') },
                    opts.plan ? { label: t('Route', '路线'), value: opts.plan.source === 'vlm_agent' ? t('Thinking mode', 'Thinking 思考模式') : t('Local fallback plan', '本地 fallback 计划') } : null,
                    choice.override ? { label: t('Override', '覆盖'), value: t('Preset mentioned in request', '按指令指定 preset') } : null,
                    { label: t('Source', '源图'), value: canvasAgentShortNodeLabel(target) },
                    extraImageRefs.length ? { label: t('Image refs', '图片参考'), value: String(extraImageRefs.length) } : null,
                    ...canvasAgentReferenceFacts().filter(item => !['Images', '图片'].includes(item.label)),
                    { label: t('Input slot', '输入槽'), value: slotPreview?.label || slotPreview?.key || t('First compatible slot', '第一个兼容输入槽') },
                    { label: t('Resolution', '分辨率'), value: canvasAgentResolutionLabel() },
                    { label: t('Prompt', '提示词'), value: canvasAgentPromptSourceLabel(resolved.source) },
                    canvasAgentPromptTargetFact(promptTarget),
                    canvasAgentPromptValidationFact(resolved.prompt, promptTarget),
                    ...canvasAgentPromptPreflightFacts(preflight),
                    ...canvasAgentPresetPromptDefaultsFacts(promptTarget, editEntry),
                    { label: t('Models', '模型'), value: canvasAgentModelStatusLabel(choice.status) }
                ].filter(Boolean),
                details: resolved.prompt,
                note: [opts.plan?.reason ? `${t('Plan', '计划')}：${opts.plan.reason}` : '', `${t('Prompt source', '提示词来源')}：${canvasAgentPromptSourceLabel(resolved.source)}`, fallbackNote.trim()].filter(Boolean).join('\n'),
                actions: [
                    { value: 'continue', label: t('Start edit', '开始编辑'), icon: 'fa-play', primary: true },
                    { value: 'cancel', label: t('Cancel', '取消'), icon: 'fa-xmark' }
                ]
            });
            if (ok !== 'continue') {
                resetCanvasAgentRunInfo();
                setCanvasAgentMessage(t('Image edit cancelled before submit.', '图片编辑已在提交前取消'));
                return { ok: false, error: 'cancelled before submit' };
            }
            resolved.prompt = opts.autoStart
                ? String(resolved.prompt || '').trim()
                : canvasAgentPromptFromDecision(decisionForm, resolved.prompt);
            const chosenEntry = findCanvasAgentPresetEntryByAlias(decisionForm.preset) || editEntry;
            if (!chosenEntry) {
                resetCanvasAgentRunInfo();
                showToast(t('Selected edit preset is unavailable.', '选择的编辑预设不可用'));
                return { ok: false, error: 'selected edit preset unavailable' };
            }
            editEntry = chosenEntry;
            slotPreview = previewCanvasAgentEditInputSlot(editEntry, target);
            const editPresetName = normalizePresetName(editEntry?.name || editEntry?.display_name || '');
            const editWorkflowKey = opts.workflowKey || (opts.sourceVlmNodeId ? vlmCanvasAgentWorkflowKey(opts.sourceVlmNodeId, 'edit', `${editPresetName}:${target.id || ''}`) : '');
            const editor = markCanvasAgentCreatedNode(addPresetNode(editEntry, canvasAgentWorkflowPresetPosition(target), {
                collapsed: true,
                source: { kind: 'canvas_agent_created', created_at: nowIso() }
            }));
            applyCanvasAgentPresetDefaultsToGenerator(editor, editEntry);
            tagCanvasAgentWorkflowPreset(editor, {
                workflowKey: editWorkflowKey,
                kind: 'edit',
                ownerNodeId: opts.sourceVlmNodeId || '',
                presetName: editPresetName
            });
            if (editor.type === 'classic') {
                editor.classic_mode = 'uov';
                editor.params = Object.assign({}, editor.params || {}, {
                    uov_method: editor.params?.uov_method || 'Vary (Subtle)'
                });
            }
            const generationOptions = normalizeCanvasAgentGenerationOptions(opts.plan || opts, `${opts.originalPrompt || ''}\n${resolved.prompt || ''}`);
            const negativePrompt = String(opts.negativePrompt || generationOptions.negativePrompt || '').trim();
            if (negativePrompt && !getPromptTextSourceNode(editor, 'negative_prompt')) {
                const existingNegative = String(editor?.params?.negative_prompt || '').trim();
                editor.params = Object.assign({}, editor.params || {}, { negative_prompt: mergeCommaPromptText(existingNegative, negativePrompt) });
            }
            applyCanvasAgentPromptToGenerator(editor, resolved.prompt);
            applyCanvasAgentGenerationOptionsToGenerator(editor, generationOptions);
            const uploadSlots = canvasAgentUploadSlotsForNode(editor).filter(slotItem => !isCanvasAgentMaskSlot(slotItem));
            const slot = (slotPreview?.key && uploadSlots.some(item => item.key === slotPreview.key) ? slotPreview.key : '')
                || uploadSlots.find(item => canNodeConnectToUploadSlot(target, item.key))?.key
                || uploadSlots[0]?.key
                || '';
            if (!slot) {
                showToast(t('Selected edit preset has no compatible image input.', '选中的编辑预设没有兼容的图像输入'));
                return { ok: false, error: 'selected edit preset has no compatible image input' };
            }
            createUploadEdge(target.id, editor.id, slot, { silent: true });
            const usedSlots = new Set([slot]);
            extraImageRefs.forEach((refNode) => {
                const refSlot = uploadSlots.find(item => !usedSlots.has(item.key) && canNodeConnectToUploadSlot(refNode, item.key))?.key || '';
                if (!refSlot) return;
                usedSlots.add(refSlot);
                createUploadEdge(refNode.id, editor.id, refSlot, { silent: true });
            });
            applyCanvasAgentResolutionToGenerator(editor, generationOptions);
            setCanvasAgentSelection(editor.id);
            mutate({ inspector: true });
            setCanvasAgentRunInfo({
                token: uid('agent_run'),
                stage: t('Submitting image edit', '提交图片编辑'),
                preset: editor.title || editor.preset?.display_name || editor.preset?.name || editEntry.display_name || editEntry.name || '',
                model: ['llm_rewrite', 'thinking_recommendation'].includes(resolved.source) ? getCanvasAgentRewriteModel() : t('Direct prompt', '直接提示词')
            });
            setCanvasAgentMessage(t('Submitted image edit generation with {source}.', '已使用 {source} 提交图片编辑任务').replace('{source}', canvasAgentPromptSourceLabel(resolved.source)));
            const runResponse = await runPresetNode(editor, {
                skipInputPreflight: !!opts.skipPromptTargetChecks || !!opts.promptPreflight,
                agentWorkflowTitle: t('Agent image edit', 'Agent 图片编辑')
            });
            clearCanvasAgentRunInfo(1800);
            return Object.assign({
                ok: !!runResponse?.ok,
                preset_node_id: editor.id,
                generator_id: editor.id,
                workflow_key: editor.source?.agent_workflow_key || editWorkflowKey || ''
            }, runResponse || {});
        }

        return {
            runCanvasAgentTextToImage,
            runCanvasAgentImageEdit
        };
    }

    window.SimpAICanvasWorkbenchImageWorkflows = Object.assign({}, window.SimpAICanvasWorkbenchImageWorkflows || {}, {
        createCanvasAgentImageWorkflowController
    });
})();
