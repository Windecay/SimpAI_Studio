(function () {
    'use strict';

    function createCanvasAgentVideoToolsController(context) {
        const scope = context || {};
        const call = (name, fallback, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : fallback;
        const t = scope.t || ((en, cn) => cn || en);
        const uid = scope.uid || ((prefix) => `${prefix || 'id'}_${Date.now()}`);
        const normalizePresetName = scope.normalizePresetName || (value => String(value || '').trim());
        const escapeHtml = scope.escapeHtml || (value => String(value ?? ''));
        const getDefaultVideoOutpaintPreset = () => String(call('getDefaultVideoOutpaintPreset', '') || '');
        const getDefaultVideoErasePreset = () => String(call('getDefaultVideoErasePreset', '') || '');
        const getDefaultVideoReplacePreset = () => String(call('getDefaultVideoReplacePreset', '') || '');
        const getDefaultVideoFaceSwapPreset = () => String(call('getDefaultVideoFaceSwapPreset', '') || '');
        const getDefaultVideoFaceSwapTheme = () => String(call('getDefaultVideoFaceSwapTheme', '') || '');
        const getDefaultVideoMotionTransferPreset = () => String(call('getDefaultVideoMotionTransferPreset', '') || '');
        const getDefaultVideoMotionTransferTheme = () => String(call('getDefaultVideoMotionTransferTheme', '') || '');
        const getDefaultVideoUpscalePreset = () => String(call('getDefaultVideoUpscalePreset', '') || '');
        const getAgentState = () => call('getAgentState', {}) || {};
        const getCanvasAgentSettings = (...args) => call('getCanvasAgentSettings', {}, ...args) || {};
        const getNode = (...args) => call('getNode', null, ...args);
        const getCanvasAgentTargetNode = (...args) => call('getCanvasAgentTargetNode', null, ...args);
        const getCanvasAgentPrimaryReferenceByKind = (...args) => call('getCanvasAgentPrimaryReferenceByKind', null, ...args);
        const canvasAgentReferenceNode = (...args) => call('canvasAgentReferenceNode', null, ...args);
        const normalizeCanvasAgentReferences = (...args) => call('normalizeCanvasAgentReferences', [], ...args);
        const addCanvasAgentReferenceFromNode = (...args) => call('addCanvasAgentReferenceFromNode', false, ...args);
        const isCanvasAgentImageTarget = (...args) => call('isCanvasAgentImageTarget', false, ...args);
        const isCanvasAgentVideoTarget = (...args) => call('isCanvasAgentVideoTarget', false, ...args);
        const showToast = (...args) => call('showToast', null, ...args);
        const setCanvasAgentMessage = (...args) => call('setCanvasAgentMessage', null, ...args);
        const renderCanvasAgentPanel = (...args) => call('renderCanvasAgentPanel', null, ...args);
        const revealCanvasAgentPanelForToolCard = (...args) => call('revealCanvasAgentPanelForToolCard', null, ...args);
        const askCanvasAgentDecision = (...args) => call('askCanvasAgentDecision', 'cancel', ...args);
        const canvasAgentPresetDecisionOptions = (...args) => call('canvasAgentPresetDecisionOptions', [], ...args);
        const canvasAgentPromptDecisionField = (...args) => call('canvasAgentPromptDecisionField', {}, ...args);
        const canvasAgentPromptFromDecision = (...args) => call('canvasAgentPromptFromDecision', fallback => fallback, ...args);
        const findCanvasAgentPresetEntryByAlias = (...args) => call('findCanvasAgentPresetEntryByAlias', null, ...args);
        const canvasAgentPresetDefaultPromptForTheme = (...args) => call('canvasAgentPresetDefaultPromptForTheme', '', ...args);
        const canvasAgentShortNodeLabel = (...args) => call('canvasAgentShortNodeLabel', '', ...args);
        const addPresetNode = (...args) => call('addPresetNode', null, ...args);
        const canvasAgentWorkflowPresetPosition = (...args) => call('canvasAgentWorkflowPresetPosition', {}, ...args);
        const markCanvasAgentCreatedNode = (...args) => call('markCanvasAgentCreatedNode', node => node, ...args);
        const applyCanvasAgentPromptToGenerator = (...args) => call('applyCanvasAgentPromptToGenerator', null, ...args);
        const canvasAgentUploadSlotsForNode = (...args) => call('canvasAgentUploadSlotsForNode', [], ...args);
        const canvasAgentVideoSourceUploadSlot = (...args) => call('canvasAgentVideoSourceUploadSlot', '', ...args);
        const canNodeConnectToUploadSlot = (...args) => call('canNodeConnectToUploadSlot', false, ...args);
        const createUploadEdge = (...args) => call('createUploadEdge', null, ...args);
        const applyCanvasAgentResolutionToGenerator = (...args) => call('applyCanvasAgentResolutionToGenerator', null, ...args);
        const createCanvasAgentReferencePlaceholderForGenerator = (...args) => call('createCanvasAgentReferencePlaceholderForGenerator', null, ...args);
        const canvasAgentReferenceUploadSlotForGenerator = (...args) => call('canvasAgentReferenceUploadSlotForGenerator', '', ...args);
        const getUploadSlotMediaKind = (...args) => call('getUploadSlotMediaKind', '', ...args);
        const isCanvasAgentMaskSlot = (...args) => call('isCanvasAgentMaskSlot', false, ...args);
        const createCanvasAgentWorkflowGroup = (...args) => call('createCanvasAgentWorkflowGroup', null, ...args);
        const centerCanvasAgentWorkflow = (...args) => call('centerCanvasAgentWorkflow', null, ...args);
        const prepareCanvasAgentVideoMaskWorkflow = (...args) => call('prepareCanvasAgentVideoMaskWorkflow', { ok: false }, ...args);
        const mutate = (...args) => call('mutate', null, ...args);
        const setCanvasAgentRunInfo = (...args) => call('setCanvasAgentRunInfo', null, ...args);
        const runPresetNode = (...args) => call('runPresetNode', null, ...args);
        const clearCanvasAgentRunInfo = (...args) => call('clearCanvasAgentRunInfo', null, ...args);
        const getNodeRect = (...args) => call('getNodeRect', null, ...args);
        const defaultNodeSize = (...args) => call('defaultNodeSize', null, ...args);
        const viewportCenterWorld = (...args) => call('viewportCenterWorld', { x: 0, y: 0 }, ...args);
        const findOpenNodePosition = (...args) => call('findOpenNodePosition', args[0] || { x: 0, y: 0 }, ...args.slice(1));
        const addLivePortraitExpressionNode = (...args) => call('addLivePortraitExpressionNode', null, ...args);
        const applyNodeLayoutPatch = (...args) => call('applyNodeLayoutPatch', {}, ...args) || {};
        const createLivePortraitExpressionImageEdge = (...args) => call('createLivePortraitExpressionImageEdge', null, ...args);
        const openLivePortraitExpressionEditor = (...args) => call('openLivePortraitExpressionEditor', null, ...args);
        const setCanvasAgentSelection = (...args) => call('setCanvasAgentSelection', null, ...args);

        function encodeCanvasAgentVideoToolChoice(preset, theme) {
            return `${normalizePresetName(preset || '')}::theme::${String(theme || '').trim()}`;
        }

        function decodeCanvasAgentVideoToolChoice(value) {
            const raw = String(value || '').trim();
            const parts = raw.split('::theme::');
            return {
                preset: normalizePresetName(parts[0] || raw),
                theme: String(parts.length > 1 ? parts.slice(1).join('::theme::') : '').trim()
            };
        }

        function canvasAgentVideoQuickToolCandidateSpecs(key) {
            const specs = {
                face_swap: [
                    { preset: 'ReActor-FaceSwap', theme: 'ReActor Face Swap', label: 'ReActor-FaceSwap / ReActor Face Swap' },
                    { preset: 'Wan-Swap', theme: 'Wan-Animate Face Swap', label: 'Wan-Swap / Wan-Animate Face Swap' }
                ],
                motion_transfer: [
                    { preset: 'Wan-SCAIL2', theme: 'Character Motion Transfer', label: 'Wan-SCAIL2 / Character Motion Transfer' },
                    { preset: 'Wan-Swap', theme: 'Wan-Animate Motion Transfer', label: 'Wan-Swap / Wan-Animate Motion Transfer' }
                ]
            };
            return specs[key] || [];
        }

        function canvasAgentVideoQuickToolSpec(key) {
            const specs = {
                outpaint: {
                    label: t('Video Outpaint', '视频扩图'),
                    presetSetting: 'videoOutpaintPreset',
                    defaultPreset: getDefaultVideoOutpaintPreset(),
                    icon: 'fa-expand',
                    prompt: t('Extend video frame beyond its borders.', '扩展视频画面边界。'),
                    autoRun: true
                },
                erase: {
                    label: t('Video Erase', '视频擦除'),
                    presetSetting: 'videoErasePreset',
                    defaultPreset: getDefaultVideoErasePreset(),
                    icon: 'fa-eraser',
                    prompt: t('Remove object from video and fill background.', '从视频中移除对象并补全背景。'),
                    requiresMask: true,
                    autoRun: false
                },
                replace: {
                    label: t('Video Edit', '视频编辑'),
                    presetSetting: 'videoReplacePreset',
                    defaultPreset: getDefaultVideoReplacePreset(),
                icon: 'fa-wand-magic-sparkles',
                prompt: t('Edit this video while preserving temporal consistency.', '编辑这段视频并保持时序一致。'),
                animateRequiresMask: true,
                autoRun: true
                },
                face_swap: {
                    label: t('Video Face Swap', '视频换脸'),
                    presetSetting: 'videoFaceSwapPreset',
                    defaultPreset: getDefaultVideoFaceSwapPreset(),
                    defaultTheme: getDefaultVideoFaceSwapTheme(),
                    icon: 'fa-face-smile',
                    prompt: t('Swap the face in this video with the reference face while preserving motion and source audio.', '使用参考脸替换视频中的人脸，并保留动作和源音频。'),
                    routeChoices: true,
                    wantsReference: true,
                    autoRun: true
                },
                motion_transfer: {
                    label: t('Motion Transfer', '动作迁移'),
                    presetSetting: 'videoMotionTransferPreset',
                    defaultPreset: getDefaultVideoMotionTransferPreset(),
                    defaultTheme: getDefaultVideoMotionTransferTheme(),
                    icon: 'fa-person-running',
                    prompt: t('Transfer the driving video motion to the reference character while keeping identity consistent.', '把驱动视频动作迁移到参考角色，并保持身份一致。'),
                    routeChoices: true,
                    wantsReference: true,
                    autoRun: true
                },
                upscale: {
                    label: t('Video Upscale', '视频放大'),
                    presetSetting: 'videoUpscalePreset',
                    defaultPreset: getDefaultVideoUpscalePreset(),
                    icon: 'fa-magnifying-glass-plus',
                    prompt: t('Upscale video while preserving details.', '放大视频并保留细节。'),
                    autoRun: true
                }
            };
            return specs[key] || null;
        }

        function canvasAgentVideoQuickToolPresetName(key) {
            const spec = canvasAgentVideoQuickToolSpec(key);
            if (!spec) return '';
            const settings = getCanvasAgentSettings();
            return settings[spec.presetSetting] || spec.defaultPreset || '';
        }

        function isCanvasAgentAnimateVideoPreset(entryOrName) {
            const raw = typeof entryOrName === 'string'
                ? entryOrName
                : [
                    entryOrName?.name,
                    entryOrName?.display_name,
                    entryOrName?.schema?.theme_title,
                    entryOrName?.schema?.default_theme,
                    entryOrName?.default_engine?.scene_frontend?.theme_title
                ].filter(Boolean).join(' ');
            return normalizePresetName(raw).toLowerCase().includes('animate');
        }

        function canvasAgentVideoQuickToolRequiresSam3Mask(key, entry, spec) {
            if (!spec) return false;
            if (key === 'replace' && spec.animateRequiresMask) {
                return isCanvasAgentAnimateVideoPreset(entry || spec.defaultPreset);
            }
            return !!spec.requiresMask;
        }

        function canvasAgentVideoQuickToolChoiceFromSettings(key) {
            const settings = getCanvasAgentSettings();
            if (key === 'face_swap') return encodeCanvasAgentVideoToolChoice(settings.videoFaceSwapPreset, settings.videoFaceSwapTheme);
            if (key === 'motion_transfer') return encodeCanvasAgentVideoToolChoice(settings.videoMotionTransferPreset, settings.videoMotionTransferTheme);
            const spec = canvasAgentVideoQuickToolSpec(key);
            return encodeCanvasAgentVideoToolChoice(settings[spec?.presetSetting] || spec?.defaultPreset || '', spec?.defaultTheme || '');
        }

        function canvasAgentVideoQuickToolChoiceLabel(choice) {
            const decoded = typeof choice === 'object' ? choice : decodeCanvasAgentVideoToolChoice(choice);
            return [decoded.preset, decoded.theme].filter(Boolean).join(' / ');
        }

        function canvasAgentVideoQuickToolChoiceOptions(key, selectedChoice) {
            const rows = [];
            const add = (preset, theme, label) => {
                const value = encodeCanvasAgentVideoToolChoice(preset, theme);
                if (!decodeCanvasAgentVideoToolChoice(value).preset || rows.some(item => item.value === value)) return;
                rows.push({ value, label: label || canvasAgentVideoQuickToolChoiceLabel(value) });
            };
            const selected = decodeCanvasAgentVideoToolChoice(selectedChoice || canvasAgentVideoQuickToolChoiceFromSettings(key));
            add(selected.preset, selected.theme, canvasAgentVideoQuickToolChoiceLabel(selected));
            canvasAgentVideoQuickToolCandidateSpecs(key).forEach(item => add(item.preset, item.theme, item.label));
            return rows;
        }

        function canvasAgentVideoQuickToolChoiceOptionHtml(key, selectedChoice) {
            const selected = selectedChoice || canvasAgentVideoQuickToolChoiceFromSettings(key);
            const rows = canvasAgentVideoQuickToolChoiceOptions(key, selected);
            return rows.map(item => `<option value="${escapeHtml(item.value)}" ${item.value === selected ? 'selected' : ''}>${escapeHtml(item.label)}</option>`).join('');
        }

        function resolveCanvasAgentVideoQuickToolChoice(key, choiceValue) {
            const spec = canvasAgentVideoQuickToolSpec(key);
            const decoded = decodeCanvasAgentVideoToolChoice(choiceValue || canvasAgentVideoQuickToolChoiceFromSettings(key));
            const fallback = canvasAgentVideoQuickToolCandidateSpecs(key)[0] || {};
            const presetName = decoded.preset || spec?.defaultPreset || fallback.preset || '';
            const entry = findCanvasAgentPresetEntryByAlias(presetName);
            const themes = Array.isArray(entry?.schema?.themes) ? entry.schema.themes : [];
            const wantedTheme = decoded.theme || spec?.defaultTheme || fallback.theme || '';
            const theme = themes.includes(wantedTheme) ? wantedTheme : (wantedTheme || entry?.schema?.default_theme || themes[0] || '');
            return {
                entry,
                preset: presetName,
                theme,
                value: encodeCanvasAgentVideoToolChoice(presetName, theme)
            };
        }

        function canvasAgentVideoQuickTools() {
            return [
                { key: 'video_outpaint', label: t('V-Outpaint', '视频扩图'), icon: 'fa-expand' },
                { key: 'video_erase', label: t('V-Erase', '视频擦除'), icon: 'fa-eraser' },
                { key: 'video_replace', label: t('Video Edit', '视频编辑'), icon: 'fa-wand-magic-sparkles' },
                { key: 'video_face_swap', label: t('V-Face Swap', '视频换脸'), icon: 'fa-face-smile' },
                { key: 'video_motion_transfer', label: t('Motion Transfer', '动作迁移'), icon: 'fa-person-running' },
                { key: 'video_upscale', label: t('V-Upscale', '视频放大'), icon: 'fa-magnifying-glass-plus' }
            ];
        }

        function startCanvasAgentVideoReferencePickForTool(target, spec) {
            const state = getAgentState();
            if (target && isCanvasAgentVideoTarget(target)) {
                addCanvasAgentReferenceFromNode(target, { silent: true });
                setCanvasAgentSelection(target.id, [target.id]);
            }
            state.expanded = true;
            state.pickReference = true;
            setCanvasAgentMessage(t('{tool} needs a reference image. Click an image or image result node to add it as Ref, then use the tool again.', '{tool} 需要参考图。点击图像或图像结果节点加入 Ref，然后再次使用工具。').replace('{tool}', spec?.label || t('Video quick tool', '视频快捷工具')));
            showToast(t('Pick an image reference for {tool}.', '请选择 {tool} 的图片参考。').replace('{tool}', spec?.label || t('Video quick tool', '视频快捷工具')));
            renderCanvasAgentPanel();
        }

        function getCanvasAgentVideoQuickToolImageReferences(target) {
            return normalizeCanvasAgentReferences()
                .filter(ref => ref.kind === 'image')
                .map(ref => canvasAgentReferenceNode(ref))
                .filter(node => node && node.id !== target?.id && isCanvasAgentImageTarget(node))
                .slice(0, 1);
        }

        function canvasAgentConnectVideoQuickToolImageReference(generator, videoSlot, imageNode) {
            if (!generator || !imageNode) return '';
            const refSlot = canvasAgentReferenceUploadSlotForGenerator(generator, videoSlot)
                || canvasAgentUploadSlotsForNode(generator)
                    .filter(slot => !isCanvasAgentMaskSlot(slot) && getUploadSlotMediaKind(slot.key) === 'image')
                    .find(slot => slot.key !== videoSlot && canNodeConnectToUploadSlot(imageNode, slot.key))?.key
                || '';
            if (!refSlot) return '';
            createUploadEdge(imageNode.id, generator.id, refSlot, { silent: true });
            return refSlot;
        }

        function runCanvasAgentLivePortraitExpressionQuickTool(target, spec) {
            if (!target || !isCanvasAgentImageTarget(target)) {
                showToast(t('Select or attach a main image first.', '请先选择或挂载一张主图'));
                return null;
            }
            revealCanvasAgentPanelForToolCard();
            const sourceRect = getNodeRect(target);
            const nodeSize = defaultNodeSize('liveportrait_expression') || { w: 420, h: 600 };
            const base = sourceRect
                ? { x: Math.round(sourceRect.x + sourceRect.w + 140), y: Math.round(sourceRect.y) }
                : viewportCenterWorld();
            const world = findOpenNodePosition(base, nodeSize, { keepVisible: false });
            const node = markCanvasAgentCreatedNode(addLivePortraitExpressionNode(world, {
                render: false,
                toast: false,
            }), { sourcePatch: { agent_tool: 'liveportrait_expression' } });
            if (!node) {
                showToast(t('LivePortrait Exp node could not be created.', '无法创建 LivePortrait Exp 节点。'));
                return null;
            }
            applyNodeLayoutPatch(node, { collapsed: false });
            createLivePortraitExpressionImageEdge(target.id, node.id, 'source', { silent: true });
            setCanvasAgentSelection(node.id, [node.id], null, { clearGroup: true });
            mutate({ inspector: true });
            setCanvasAgentMessage(t('LivePortrait Exp is ready. The source image is connected and the editor is opening.', 'LivePortrait Exp 已就绪，源图已连接，正在打开编辑面板。'));
            showToast(t('LivePortrait Exp source connected.', 'LivePortrait Exp 源图已连接。'));
            window.setTimeout(() => openLivePortraitExpressionEditor(node), 80);
            return node;
        }

        async function runCanvasAgentVideoQuickTool(videoToolKey, options) {
            const opts = options || {};
            const spec = canvasAgentVideoQuickToolSpec(videoToolKey);
            if (!spec) {
                showToast(t('Unknown video quick tool.', '未知视频快捷工具'));
                return;
            }
            const state = getAgentState();
            if (state.busy || state.currentRun) {
                showToast(t('Agent is still working. Please wait for the current step to finish.', 'Agent 当前步骤还在运行，请等待完成。'));
                return;
            }
            const explicitTarget = getNode(opts.targetNodeId || '');
            const primaryRef = getCanvasAgentPrimaryReferenceByKind('video');
            const target = (explicitTarget && isCanvasAgentVideoTarget(explicitTarget) ? explicitTarget : null) || canvasAgentReferenceNode(primaryRef) || getCanvasAgentTargetNode();
            if (!isCanvasAgentVideoTarget(target)) {
                showToast(t('Select a video clip first.', '请先选中一个视频片段'));
                return;
            }
            const initialChoice = spec.routeChoices ? resolveCanvasAgentVideoQuickToolChoice(videoToolKey, canvasAgentVideoQuickToolChoiceFromSettings(videoToolKey)) : null;
            const initialPresetName = initialChoice?.preset || canvasAgentVideoQuickToolPresetName(videoToolKey);
            const entry = initialChoice?.entry || findCanvasAgentPresetEntryByAlias(initialPresetName);
            if (!entry) {
                showToast(t('Video quick tool preset is unavailable: {preset}', '视频快捷工具 preset 不可用：{preset}').replace('{preset}', initialPresetName || spec.label));
                return;
            }
            const initialTheme = initialChoice?.theme || '';
            const initialRequiresMask = canvasAgentVideoQuickToolRequiresSam3Mask(videoToolKey, entry, spec);
            const imageRefs = getCanvasAgentVideoQuickToolImageReferences(target);
            const missingRequiredReference = !!spec.wantsReference && !imageRefs.length;
            const agentPrompt = String(state.input || '').trim();
            const promptFromPreset = !agentPrompt;
            const prompt = agentPrompt || canvasAgentPresetDefaultPromptForTheme(entry, initialTheme, spec.prompt);
            const decisionForm = {
                preset: normalizePresetName(entry.name || entry.display_name || ''),
                route: initialChoice?.value || encodeCanvasAgentVideoToolChoice(entry.name || entry.display_name || initialPresetName, initialTheme),
                prompt
            };
            const ok = await askCanvasAgentDecision({
                title: missingRequiredReference
                    ? t('Reference image required', '需要参考图')
                    : ((spec.autoRun || initialRequiresMask) ? t('Start video quick tool?', '开始视频快捷工具？') : t('Create video quick tool node?', '创建视频快捷工具节点？')),
                message: missingRequiredReference
                    ? t('{tool} needs a reference image. Pick an image Ref first, or create the node and connect the reference manually.', '{tool} 需要参考图。先选择图像 Ref，或只创建节点后手动连接参考图。').replace('{tool}', spec.label)
                    : initialRequiresMask
                    ? t('{tool} needs a mask. Agent will create and connect the node, then wait for manual mask editing.', '{tool} 需要蒙版。Agent 会创建并连接节点，然后等待手动绘制蒙版。').replace('{tool}', spec.label)
                    : t('Agent will use {tool}, connect the selected video, and submit this prompt.', 'Agent 将使用 {tool}，连接当前视频，并提交以下提示词。').replace('{tool}', spec.label),
                form: decisionForm,
                fields: [
                    spec.routeChoices
                        ? { key: 'route', label: t('Target route', '目标路线'), options: canvasAgentVideoQuickToolChoiceOptions(videoToolKey, decisionForm.route) }
                        : { key: 'preset', label: t('Target preset', '目标 preset'), options: canvasAgentPresetDecisionOptions(entry) },
                    canvasAgentPromptDecisionField()
                ],
                promptField: 'prompt',
                promptPresetField: spec.routeChoices ? 'route' : 'preset',
                promptFallback: spec.prompt,
                promptAutoValue: promptFromPreset ? prompt : '',
                promptEdited: !promptFromPreset,
                facts: [
                    { label: t('Action', '动作'), value: spec.label },
                    { label: t('Preset', '预设'), value: entry.display_name || entry.name || initialPresetName },
                    initialTheme ? { label: t('Theme', '主题'), value: initialTheme } : null,
                    { label: t('Source', '源'), value: canvasAgentShortNodeLabel(target) },
                    imageRefs.length ? { label: t('Image refs', '图片参考'), value: String(imageRefs.length) } : null,
                    spec.wantsReference && !imageRefs.length ? { label: t('Reference', '参考图'), value: t('Recommended before manual run', '建议在手动运行前补充') } : null,
                    initialRequiresMask ? { label: t('Mask', '蒙版'), value: 'SAM3' } : null
                ].filter(Boolean),
                details: prompt,
                note: initialRequiresMask
                    ? t('Animate presets use SAM3 mask workflow. Bernini VideoEdit runs as a direct video edit.', 'Animate preset 使用 SAM3 蒙版工作流；Bernini VideoEdit 会直接作为视频编辑运行。')
                    : t('Choose an Animate preset only when you need the SAM3 mask workflow.', '只有需要 SAM3 蒙版工作流时才选择 Animate preset。'),
                actions: missingRequiredReference ? [
                    { value: 'pick-reference', label: t('Pick Ref', '选择 Ref'), icon: 'fa-crosshairs', primary: true },
                    { value: 'create-node', label: t('Create node only', '只创建节点'), icon: 'fa-plus' },
                    { value: 'cancel', label: t('Cancel', '取消'), icon: 'fa-xmark' }
                ] : [
                    { value: 'continue', label: initialRequiresMask ? t('Create SAM3 workflow', '创建 SAM3 工作流') : (spec.autoRun ? t('Start', '开始') : t('Create node', '创建节点')), icon: initialRequiresMask ? 'fa-wand-magic-sparkles' : (spec.autoRun ? 'fa-play' : 'fa-plus'), primary: true },
                    { value: 'cancel', label: t('Cancel', '取消'), icon: 'fa-xmark' }
                ]
            });
            if (ok === 'pick-reference') {
                startCanvasAgentVideoReferencePickForTool(target, spec);
                return;
            }
            if (ok !== 'continue' && ok !== 'create-node') {
                setCanvasAgentMessage(t('Video quick tool cancelled.', '视频快捷工具已取消。'));
                return;
            }
            const createOnlyBecauseReferenceMissing = missingRequiredReference && ok === 'create-node';
            const finalPrompt = canvasAgentPromptFromDecision(decisionForm, prompt);
            const finalChoice = spec.routeChoices ? resolveCanvasAgentVideoQuickToolChoice(videoToolKey, decisionForm.route) : null;
            if (spec.routeChoices && !finalChoice?.entry) {
                const selectedRoute = decodeCanvasAgentVideoToolChoice(decisionForm.route);
                const selectedLabel = canvasAgentVideoQuickToolChoiceLabel(selectedRoute) || spec.label;
                showToast(t('Video quick tool preset is unavailable: {preset}', '视频快捷工具 preset 不可用：{preset}').replace('{preset}', selectedLabel));
                setCanvasAgentMessage(t('{route} is not available. Refresh ready presets or choose another route.', '{route} 当前不可用。请刷新可用 preset 或选择另一条路线。').replace('{route}', selectedLabel));
                return;
            }
            const finalEntry = finalChoice?.entry || findCanvasAgentPresetEntryByAlias(decisionForm.preset) || entry;
            const finalTheme = finalChoice?.theme || '';
            const finalRequiresMask = canvasAgentVideoQuickToolRequiresSam3Mask(videoToolKey, finalEntry, spec);
            const node = markCanvasAgentCreatedNode(addPresetNode(finalEntry, canvasAgentWorkflowPresetPosition(target), {
                collapsed: true,
                sceneTheme: finalTheme,
            }));
            applyCanvasAgentPromptToGenerator(node, finalPrompt);
            const uploadSlots = canvasAgentUploadSlotsForNode(node);
            const videoSlot = canvasAgentVideoSourceUploadSlot(node, target)
                || uploadSlots.find(item => canNodeConnectToUploadSlot(target, item.key))?.key
                || uploadSlots[0]?.key
                || '';
            if (videoSlot) createUploadEdge(target.id, node.id, videoSlot, { silent: true });
            const refSlot = canvasAgentConnectVideoQuickToolImageReference(node, videoSlot, imageRefs[0]);
            applyCanvasAgentResolutionToGenerator(node);
            if (createOnlyBecauseReferenceMissing) {
                const referenceNode = createCanvasAgentReferencePlaceholderForGenerator(node, videoSlot, videoToolKey, spec);
                const workflowNodes = [referenceNode, node].filter(Boolean);
                const group = createCanvasAgentWorkflowGroup(workflowNodes, `${spec.label} workflow`);
                setCanvasAgentSelection(referenceNode?.id || node.id, workflowNodes.map(item => item.id), group?.id);
                mutate({ inspector: true });
                centerCanvasAgentWorkflow(workflowNodes);
                setCanvasAgentMessage(referenceNode
                    ? t('{tool} node and reference image input created. Upload or connect the reference image before running.', '{tool} 节点和参考图输入已创建。运行前请上传或连接参考图。').replace('{tool}', spec.label)
                    : t('{tool} node created, but no free image reference slot was found.', '{tool} 节点已创建，但没有找到空闲图片参考槽。').replace('{tool}', spec.label));
                return;
            }
            setCanvasAgentSelection(node.id, [node.id]);
            mutate({ inspector: true });
            if (finalRequiresMask) {
                const workflowSpec = Object.assign({}, spec, { key: videoToolKey, requiresMask: true });
                const workflow = prepareCanvasAgentVideoMaskWorkflow(target, node, null, workflowSpec, {
                    toolKey: videoToolKey,
                    title: `${t('Agent video quick tool', 'Agent 视频快捷工具')}: ${spec.label}`,
                    prompt: finalPrompt,
                    openEditor: true
                });
                if (workflow?.ok === false) {
                    setCanvasAgentMessage(workflow.error || t('Video mask workflow could not be prepared.', '视频蒙版工作流无法准备。'));
                }
                return;
            }
            setCanvasAgentRunInfo({
                token: uid('agent_run'),
                stage: t('Submitting video quick tool', '提交视频快捷工具'),
                preset: node.title || node.preset?.display_name || node.preset?.name || '',
                model: t('Direct prompt', '直接提示词')
            });
            setCanvasAgentMessage(refSlot
                ? t('Submitted {tool} with image reference.', '已提交 {tool}，并连接图片参考。').replace('{tool}', spec.label)
                : t('Submitted {tool}.', '已提交 {tool}。').replace('{tool}', spec.label));
            await runPresetNode(node, {
                agentWorkflowTitle: `${t('Agent video quick tool', 'Agent 视频快捷工具')}: ${spec.label}`
            });
            clearCanvasAgentRunInfo(1800);
        }

        return {
            encodeCanvasAgentVideoToolChoice,
            decodeCanvasAgentVideoToolChoice,
            canvasAgentVideoQuickToolCandidateSpecs,
            canvasAgentVideoQuickToolSpec,
            canvasAgentVideoQuickToolPresetName,
            isCanvasAgentAnimateVideoPreset,
            canvasAgentVideoQuickToolRequiresSam3Mask,
            canvasAgentVideoQuickToolChoiceFromSettings,
            canvasAgentVideoQuickToolChoiceLabel,
            canvasAgentVideoQuickToolChoiceOptions,
            canvasAgentVideoQuickToolChoiceOptionHtml,
            resolveCanvasAgentVideoQuickToolChoice,
            canvasAgentVideoQuickTools,
            startCanvasAgentVideoReferencePickForTool,
            getCanvasAgentVideoQuickToolImageReferences,
            canvasAgentConnectVideoQuickToolImageReference,
            runCanvasAgentLivePortraitExpressionQuickTool,
            runCanvasAgentVideoQuickTool
        };
    }

    window.SimpAICanvasWorkbenchVideoTools = Object.assign({}, window.SimpAICanvasWorkbenchVideoTools || {}, {
        createCanvasAgentVideoToolsController
    });
})();
