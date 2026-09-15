(function () {
    'use strict';

    function createCanvasAgentImageToolsController(context) {
        const scope = context?.imageToolsSource || context || {};
        const languageSource = scope.languageSource || {};
        const identitySource = scope.identitySource || {};
        const utilitySource = scope.utilitySource || {};
        const configSource = scope.configSource || {};
        const catalogSource = scope.catalogSource || {};
        const patchSource = scope.patchSource || {};
        const stateSource = scope.stateSource || {};
        const settingsSource = scope.settingsSource || {};
        const targetSource = scope.targetSource || {};
        const referenceSource = scope.referenceSource || {};
        const uiSource = scope.uiSource || {};
        const decisionSource = scope.decisionSource || {};
        const promptSource = scope.promptSource || {};
        const workflowSource = scope.workflowSource || {};
        const nodeSource = scope.nodeSource || {};
        const generatorSource = scope.generatorSource || {};
        const mediaSource = scope.mediaSource || {};
        const layoutSource = scope.layoutSource || {};
        const runtimeSource = scope.runtimeSource || {};
        const call = (sourceObject, name, fallback, ...args) => typeof sourceObject[name] === 'function'
            ? sourceObject[name](...args)
            : fallback;
        const t = languageSource.t || ((en, cn) => cn || en);
        const uid = (...args) => call(identitySource, 'uid', '', ...args);
        const normalizePresetName = utilitySource.normalizePresetName || (value => String(value || '').trim());
        const maxExtraImageReferences = () => Math.max(0, Number(call(configSource, 'getMaxExtraImageReferences', 0) || 0));
        const getDefaultT2iPresetQueue = () => {
            const value = call(configSource, 'getDefaultT2iPresetQueue', ['Z-imageT']);
            return Array.isArray(value) && value.length ? value : ['Z-imageT'];
        };
        const getCollapsedPromptNodeDefaultHeight = () => Number(call(configSource, 'getCollapsedPromptNodeDefaultHeight', 280) || 280);
        const getClassicOutpaintDirs = () => {
            const value = call(configSource, 'getClassicOutpaintDirs', ['Left', 'Right', 'Top', 'Bottom']);
            return Array.isArray(value) && value.length ? value : ['Left', 'Right', 'Top', 'Bottom'];
        };
        const buildNodeParamsPatch = (...args) => call(patchSource, 'buildNodeParamsPatch', {}, ...args) || {};
        const buildNodeLayoutPatch = (...args) => call(layoutSource, 'buildNodeLayoutPatch', {}, ...args) || {};
        const buildClassicNodeStatePatch = (...args) => call(patchSource, 'buildClassicNodeStatePatch', {}, ...args) || {};
        const applyNodeParamsPatch = (node, options) => Object.assign(node, buildNodeParamsPatch(node, options || {}));
        const applyClassicNodeStatePatch = (node, options) => Object.assign(node, buildClassicNodeStatePatch(node, options || {}));

        const getAgentState = (...args) => call(stateSource, 'getAgentState', {}, ...args) || {};
        const getCanvasAgentSettings = (...args) => call(settingsSource, 'getCanvasAgentSettings', {}, ...args) || {};
        const getNode = (...args) => call(targetSource, 'getNode', null, ...args);
        const getCanvasAgentTargetNode = (...args) => call(targetSource, 'getCanvasAgentTargetNode', null, ...args);
        const getCanvasAgentPrimaryImageReference = (...args) => call(referenceSource, 'getCanvasAgentPrimaryImageReference', null, ...args);
        const getCanvasAgentExtraImageReferences = (...args) => call(referenceSource, 'getCanvasAgentExtraImageReferences', [], ...args) || [];
        const canvasAgentReferenceNode = (...args) => call(referenceSource, 'canvasAgentReferenceNode', null, ...args);
        const addCanvasAgentReferenceFromNode = (...args) => call(referenceSource, 'addCanvasAgentReferenceFromNode', null, ...args);
        const isCanvasAgentImageTarget = (...args) => call(targetSource, 'isCanvasAgentImageTarget', false, ...args);
        const canvasAgentShortNodeLabel = (...args) => call(targetSource, 'canvasAgentShortNodeLabel', '', ...args);
        const showToast = (...args) => call(uiSource, 'showToast', null, ...args);
        const setCanvasAgentMessage = (...args) => call(uiSource, 'setCanvasAgentMessage', null, ...args);
        const renderCanvasAgentPanel = (...args) => call(uiSource, 'renderCanvasAgentPanel', null, ...args);
        const revealCanvasAgentPanelForToolCard = (...args) => call(uiSource, 'revealCanvasAgentPanelForToolCard', null, ...args);
        const showOutpaintOverlay = (...args) => call(uiSource, 'showOutpaintOverlay', null, ...args);
        const hideOutpaintOverlay = (...args) => call(uiSource, 'hideOutpaintOverlay', null, ...args);
        const getOutpaintOverlayState = (...args) => call(settingsSource, 'getOutpaintOverlayState', {}, ...args) || {};
        const setCanvasAgentSettingsPatch = (...args) => call(settingsSource, 'setCanvasAgentSettingsPatch', null, ...args);
        const askCanvasAgentDecision = (...args) => call(decisionSource, 'askCanvasAgentDecision', 'cancel', ...args);
        const canvasAgentPresetDecisionOptions = (...args) => call(decisionSource, 'canvasAgentPresetDecisionOptions', [], ...args);
        const canvasAgentUpscalePresetEntries = (...args) => call(decisionSource, 'canvasAgentUpscalePresetEntries', [], ...args) || [];
        const canvasAgentPromptDecisionField = (...args) => call(decisionSource, 'canvasAgentPromptDecisionField', {}, ...args);
        const canvasAgentPromptFromDecision = (...args) => call(decisionSource, 'canvasAgentPromptFromDecision', fallback => fallback, ...args);
        const canvasAgentPromptTargetFromEntry = (...args) => call(promptSource, 'canvasAgentPromptTargetFromEntry', null, ...args);
        const canvasAgentPresetPromptDefaults = (...args) => call(promptSource, 'canvasAgentPresetPromptDefaults', {}, ...args) || {};
        const ensureCanvasAgentPromptMatchesTarget = (...args) => call(promptSource, 'ensureCanvasAgentPromptMatchesTarget', {
            ok: false,
            prompt: String(args[0] || ''),
            error: 'Prompt target rewrite is unavailable'
        }, ...args);
        const ensureCanvasAgentPromptPreflightAllows = (...args) => call(promptSource, 'ensureCanvasAgentPromptPreflightAllows', {
            ok: false,
            prompt: String(args[0] || ''),
            error: 'Prompt preflight is unavailable'
        }, ...args);
        const canvasAgentResolutionLabel = (...args) => call(promptSource, 'canvasAgentResolutionLabel', '', ...args);
        const findCanvasAgentPresetEntryByAlias = (...args) => call(catalogSource, 'findCanvasAgentPresetEntryByAlias', null, ...args);
        const canvasAgentPresetDefaultPrompt = (...args) => call(promptSource, 'canvasAgentPresetDefaultPrompt', '', ...args);
        const canvasAgentPreferredUpscalePresetEntry = (...args) => call(catalogSource, 'canvasAgentPreferredUpscalePresetEntry', null, ...args);
        const runCanvasAgentLivePortraitExpressionQuickTool = (...args) => call(workflowSource, 'runCanvasAgentLivePortraitExpressionQuickTool', null, ...args);
        const addPresetNode = (...args) => call(nodeSource, 'addPresetNode', null, ...args);
        const canvasAgentWorkflowPresetPosition = (...args) => call(nodeSource, 'canvasAgentWorkflowPresetPosition', {}, ...args);
        const markCanvasAgentCreatedNode = (...args) => call(nodeSource, 'markCanvasAgentCreatedNode', node => node, ...args);
        const applyCanvasAgentPromptToGenerator = (...args) => call(generatorSource, 'applyCanvasAgentPromptToGenerator', null, ...args);
        const canvasAgentUploadSlotsForNode = (...args) => call(mediaSource, 'canvasAgentUploadSlotsForNode', [], ...args);
        const isCanvasAgentMaskSlot = (...args) => call(mediaSource, 'isCanvasAgentMaskSlot', false, ...args);
        const canNodeConnectToUploadSlot = (...args) => call(mediaSource, 'canNodeConnectToUploadSlot', false, ...args);
        const createUploadEdge = (...args) => call(mediaSource, 'createUploadEdge', null, ...args);
        const applyCanvasAgentResolutionToGenerator = (...args) => call(generatorSource, 'applyCanvasAgentResolutionToGenerator', null, ...args);
        const connectCanvasAgentImagesToGenerator = (...args) => call(mediaSource, 'connectCanvasAgentImagesToGenerator', { ok: false, mainSlot: '', refCount: 0 }, ...args);
        const createCanvasAgentReferencePlaceholderForGenerator = (...args) => call(mediaSource, 'createCanvasAgentReferencePlaceholderForGenerator', null, ...args);
        const positionCanvasAgentReferenceWorkflow = (...args) => call(workflowSource, 'positionCanvasAgentReferenceWorkflow', null, ...args);
        const createCanvasAgentWorkflowGroup = (...args) => call(workflowSource, 'createCanvasAgentWorkflowGroup', null, ...args);
        const centerCanvasAgentWorkflow = (...args) => call(workflowSource, 'centerCanvasAgentWorkflow', null, ...args);
        const prepareCanvasAgentManualMaskWorkflow = (...args) => call(workflowSource, 'prepareCanvasAgentManualMaskWorkflow', null, ...args);
        const ensureStyleSelectorForPreset = (...args) => call(workflowSource, 'ensureStyleSelectorForPreset', null, ...args);
        const mutate = (...args) => call(stateSource, 'mutate', null, ...args);
        const setCanvasAgentRunInfo = (...args) => call(stateSource, 'setCanvasAgentRunInfo', null, ...args);
        const runPresetNode = (...args) => call(runtimeSource, 'runPresetNode', null, ...args);
        const clearCanvasAgentRunInfo = (...args) => call(stateSource, 'clearCanvasAgentRunInfo', null, ...args);
        const getNodeRect = (...args) => call(layoutSource, 'getNodeRect', null, ...args);
        const getVisibleWorldRect = (...args) => call(layoutSource, 'getVisibleWorldRect', null, ...args);
        const defaultNodeSize = (...args) => call(layoutSource, 'defaultNodeSize', null, ...args);
        const viewportCenterWorld = (...args) => call(layoutSource, 'viewportCenterWorld', { x: 0, y: 0 }, ...args);
        const canvasAgentWorkflowOccupiedRects = (...args) => call(layoutSource, 'canvasAgentWorkflowOccupiedRects', [], ...args) || [];
        const rectsOverlap = (...args) => {
            if (typeof layoutSource.rectsOverlap === 'function') return layoutSource.rectsOverlap(...args);
            const [a, b, padding] = args;
            const pad = Number(padding || 0);
            return !!a && !!b
                && a.x < b.x + b.w + pad
                && a.x + a.w + pad > b.x
                && a.y < b.y + b.h + pad
                && a.y + a.h + pad > b.y;
        };
        const setCanvasAgentSelection = (...args) => call(uiSource, 'setCanvasAgentSelection', null, ...args);

        function startCanvasAgentReferencePickForTool(target, spec) {
            const state = getAgentState();
            if (target && isCanvasAgentImageTarget(target)) {
                addCanvasAgentReferenceFromNode(target, { role: 'primary', silent: true });
                setCanvasAgentSelection(target.id, [target.id]);
            }
            state.expanded = true;
            state.pickReference = true;
            setCanvasAgentMessage(t('{tool} needs another reference image. Click an image or result node to add it as Ref, then use the tool again.', '{tool} 还需要另一张参考图。点击图像或结果节点加入 Ref，然后再次使用工具。').replace('{tool}', spec?.label || t('Quick tool', '快捷工具')));
            showToast(t('Pick a reference image for {tool}.', '请选择 {tool} 的参考图。').replace('{tool}', spec?.label || t('Quick tool', '快捷工具')));
        }

        function canvasAgentQuickTools() {
            return [
                { key: 'outpaint', label: t('Outpaint', '扩图'), icon: 'fa-expand' },
                { key: 'erase', label: t('Erase', '擦除'), icon: 'fa-eraser' },
                { key: 'replace', label: t('Replace', '替换'), icon: 'fa-wand-magic-sparkles' },
                { key: 'style_transfer', label: t('Style Transfer', '风格转换'), icon: 'fa-palette' },
                { key: 'liveportrait_expression', label: t('Expression', '表情编辑'), icon: 'fa-face-smile' },
                { key: 'upscale', label: t('Upscale', '放大'), icon: 'fa-magnifying-glass-plus' }
            ];
        }

        function canvasAgentQuickToolSpec(key) {
            const specs = {
                outpaint: {
                    label: t('Outpaint', '扩图'),
                    presetSetting: 'outpaintPreset',
                    defaultPreset: 'OneKey-Outpaint',
                    prompt: t('Extend the image naturally beyond its current borders.', '自然扩展画面边界。'),
                    classicMode: 'inpaint',
                    autoRun: true
                },
                erase: {
                    label: t('Erase', '擦除'),
                    presetSetting: 'erasePreset',
                    defaultPreset: 'Eraser',
                    prompt: t('Erase the masked area and fill it naturally.', '擦除蒙版区域并自然补全。'),
                    classicMode: 'inpaint',
                    requiresMask: true,
                    autoRun: false
                },
                replace: {
                    label: t('Replace', '替换'),
                    presetSetting: 'replacePreset',
                    defaultPreset: 'Swap+',
                    prompt: t('Replace the masked area using the reference image and preserve the rest.', '使用参考图替换蒙版区域，并保留其他部分。'),
                    classicMode: 'inpaint',
                    requiresMask: true,
                    wantsReference: true,
                    autoRun: false
                },
                style_transfer: {
                    label: t('Style Transfer', '风格转换'),
                    presetSetting: 'styleTransferPreset',
                    defaultPreset: 'StyleTransfer+',
                    prompt: t('Convert this image with a selected visual style.', '使用选中的视觉风格转换这张图。'),
                    autoRun: false,
                    createOnly: true
                },
                liveportrait_expression: {
                    label: t('Expression Edit', '表情编辑'),
                    prompt: t('Edit the portrait expression with LivePortrait Exp.', '使用 LivePortrait Exp 编辑人像表情。'),
                    nodeTool: 'liveportrait_expression',
                    autoRun: false,
                    createOnly: true
                },
                upscale: {
                    label: t('Upscale', '放大'),
                    presetSetting: 'upscalePreset',
                    defaultPreset: '',
                    prompt: t('Upscale this image while preserving details.', '放大图像并保留细节。'),
                    classicMode: 'uov',
                    autoRun: true
                }
            };
            return specs[key] || null;
        }

        function canvasAgentQuickToolPresetName(key) {
            const settings = getCanvasAgentSettings();
            const spec = canvasAgentQuickToolSpec(key);
            if (!spec) return '';
            if (key === 'upscale') {
                if (settings.upscalePresetMode === 'dedicated_preset' && settings.upscalePreset) return settings.upscalePreset;
                const preferred = canvasAgentPreferredUpscalePresetEntry();
                if (preferred) return normalizePresetName(preferred.name || preferred.display_name || '');
                return settings.t2iPreset || getDefaultT2iPresetQueue()[0] || '';
            }
            return settings[spec.presetSetting] || spec.defaultPreset || '';
        }

        function canvasAgentQuickToolPresetOptions(toolKey, selectedEntry) {
            if (toolKey === 'upscale') {
                return canvasAgentPresetDecisionOptions(selectedEntry, {
                    entries: canvasAgentUpscalePresetEntries(selectedEntry)
                });
            }
            return canvasAgentPresetDecisionOptions(selectedEntry);
        }

        function configureCanvasAgentQuickToolNode(node, key, extraParams) {
            const spec = canvasAgentQuickToolSpec(key);
            if (!node || !spec) return;
            if (node.type === 'classic' && spec.classicMode) {
                const uploadSlots = {};
                canvasAgentUploadSlotsForNode(node).forEach(slot => {
                    if (slot?.key) uploadSlots[slot.key] = node.upload_slots?.[slot.key] || null;
                });
                applyClassicNodeStatePatch(node, {
                    classicMode: spec.classicMode,
                    uploadSlots
                });
                const paramsPatch = {};
                if (key === 'upscale') {
                    if (!node.params?.uov_method) paramsPatch.uov_method = 'Upscale (1.5x)';
                } else if (key === 'outpaint') {
                    if (!node.params?.inpaint_mode) paramsPatch.inpaint_mode = 'Inpaint or Outpaint (default)';
                    paramsPatch.outpaint_selections = getClassicOutpaintDirs().slice();
                    getClassicOutpaintDirs().forEach(direction => {
                        paramsPatch[`outpaint_${String(direction).toLowerCase()}`] = true;
                    });
                } else if (key === 'erase' || key === 'replace') {
                    if (!node.params?.inpaint_mode) paramsPatch.inpaint_mode = 'Inpaint or Outpaint (default)';
                    paramsPatch.outpaint_selections = [];
                }
                applyNodeParamsPatch(node, { paramsPatch });
            }
            if (node.type === 'preset' && extraParams && typeof extraParams === 'object') {
                const paramsPatch = {};
                Object.keys(extraParams).forEach(paramKey => {
                    if (extraParams[paramKey] !== undefined && extraParams[paramKey] !== null) {
                        paramsPatch[paramKey] = extraParams[paramKey];
                    }
                });
                applyNodeParamsPatch(node, { paramsPatch });
            }
        }

        function canvasAgentStyleTransferWorkflowRect(position, presetSize, selectorSize) {
            const presetX = Math.round(position?.x || 0);
            const presetY = Math.round(position?.y || 0);
            const presetW = Number(presetSize?.w || 430);
            const presetH = Number(presetSize?.h || getCollapsedPromptNodeDefaultHeight());
            const selectorW = Number(selectorSize?.w || 360);
            const selectorH = Number(selectorSize?.h || 420);
            const gap = 90;
            const selectorX = Math.round(presetX - selectorW - gap);
            const selectorY = presetY;
            const minX = Math.min(selectorX, presetX);
            const minY = Math.min(selectorY, presetY);
            const maxX = Math.max(selectorX + selectorW, presetX + presetW);
            const maxY = Math.max(selectorY + selectorH, presetY + presetH);
            return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
        }

        function findOpenCanvasAgentStyleTransferPresetPosition(base, presetSize, selectorSize, options) {
            const opts = options || {};
            const padding = Number(opts.padding ?? 42);
            const occupied = canvasAgentWorkflowOccupiedRects(opts.excludeIds);
            const workflowSize = canvasAgentStyleTransferWorkflowRect({ x: 0, y: 0 }, presetSize, selectorSize);
            const stepX = Number(opts.stepX || workflowSize.w + padding + 80);
            const stepY = Number(opts.stepY || workflowSize.h + padding + 64);
            const isFree = (candidate) => {
                const rect = canvasAgentStyleTransferWorkflowRect(candidate, presetSize, selectorSize);
                return !occupied.some(used => rectsOverlap(rect, used, padding));
            };
            const start = { x: Math.round(base?.x || 0), y: Math.round(base?.y || 0) };
            if (isFree(start)) return start;
            const offsets = [];
            for (let ring = 1; ring <= 10; ring += 1) {
                offsets.push([ring, 0], [ring, 1], [ring, -1], [0, ring], [0, -ring]);
                for (let dy = -ring; dy <= ring; dy += 1) offsets.push([ring, dy]);
                for (let dx = -ring; dx <= ring; dx += 1) offsets.push([dx, ring], [dx, -ring]);
            }
            const seen = new Set();
            for (const [dx, dy] of offsets) {
                const candidate = { x: Math.round(start.x + dx * stepX), y: Math.round(start.y + dy * stepY) };
                const key = `${candidate.x},${candidate.y}`;
                if (seen.has(key)) continue;
                seen.add(key);
                if (isFree(candidate)) return candidate;
            }
            return { x: Math.round(start.x + stepX), y: Math.round(start.y + stepY) };
        }

        function canvasAgentStyleTransferPresetPosition(target, options) {
            const opts = options || {};
            const sourceRect = target ? getNodeRect(target) : null;
            const visible = target?.type === 'vlm' ? getVisibleWorldRect() : null;
            const defaultPreset = defaultNodeSize('preset') || {};
            const defaultSelector = defaultNodeSize('style_selector') || {};
            const presetSize = opts.presetSize || {
                w: Math.max(430, Number(defaultPreset.w || 0)),
                h: Math.max(getCollapsedPromptNodeDefaultHeight(), Number(defaultPreset.h || 0))
            };
            const selectorSize = opts.selectorSize || {
                w: Math.max(360, Number(defaultSelector.w || 0)),
                h: Math.max(420, Number(defaultSelector.h || 0))
            };
            const selectorGap = 90;
            const sourcePad = target?.type === 'vlm' ? 300 : 140;
            const base = sourceRect
                ? {
                    x: Math.round(Math.max(
                        sourceRect.x + sourceRect.w + sourcePad + selectorSize.w + selectorGap,
                        visible ? visible.x + visible.w * 0.56 + selectorSize.w : -Infinity
                    )),
                    y: Math.round(sourceRect.y)
                }
                : (() => {
                    const center = viewportCenterWorld();
                    return { x: Math.round(center.x + selectorSize.w / 2), y: Math.round(center.y - 190) };
                })();
            return findOpenCanvasAgentStyleTransferPresetPosition(base, presetSize, selectorSize, opts);
        }

        function positionCanvasAgentStyleTransferWorkflow(target, presetNode, selectorNode) {
            if (!presetNode || !selectorNode) return;
            const defaultPreset = defaultNodeSize(presetNode.type || 'preset') || {};
            const defaultSelector = defaultNodeSize(selectorNode.type || 'style_selector') || {};
            const presetSize = {
                w: Math.max(430, Number(presetNode.w || defaultPreset.w || 0)),
                h: Math.max(getCollapsedPromptNodeDefaultHeight(), Number(presetNode.h || defaultPreset.h || 0))
            };
            const selectorSize = {
                w: Math.max(360, Number(selectorNode.w || defaultSelector.w || 0)),
                h: Math.max(420, Number(selectorNode.h || defaultSelector.h || 0))
            };
            const position = canvasAgentStyleTransferPresetPosition(target, {
                presetSize,
                selectorSize,
                excludeIds: [presetNode.id, selectorNode.id]
            });
            Object.assign(presetNode, buildNodeLayoutPatch(presetNode, {
                x: Math.round(position.x),
                y: Math.round(position.y)
            }));
            Object.assign(selectorNode, buildNodeLayoutPatch(selectorNode, {
                x: Math.round(position.x - selectorSize.w - 90),
                y: Math.round(position.y)
            }));
        }

        async function runCanvasAgentQuickTool(toolKey, options) {
            const opts = options || {};
            const spec = canvasAgentQuickToolSpec(toolKey);
            if (!spec) {
                showToast(t('Unknown quick tool.', '未知快捷工具'));
                return;
            }
            const state = getAgentState();
            if (state.busy || state.currentRun) {
                showToast(t('Agent is still working. Please wait for the current step to finish.', 'Agent 当前步骤还在运行，请等待完成。'));
                return;
            }
            const explicitTarget = getNode(opts.targetNodeId || '');
            const primaryRef = getCanvasAgentPrimaryImageReference();
            const target = (explicitTarget && isCanvasAgentImageTarget(explicitTarget) ? explicitTarget : null)
                || canvasAgentReferenceNode(primaryRef)
                || getCanvasAgentTargetNode();
            if (!isCanvasAgentImageTarget(target)) {
                showToast(t('Select or attach a main image first.', '请先选择或挂载一张主图'));
                return;
            }
            if (toolKey === 'outpaint') {
                revealCanvasAgentPanelForToolCard();
                showOutpaintOverlay(target.id);
                renderCanvasAgentPanel();
                return;
            }
            if (toolKey === 'liveportrait_expression') {
                runCanvasAgentLivePortraitExpressionQuickTool(target, spec);
                return;
            }
            const extraImageRefs = getCanvasAgentExtraImageReferences()
                .map(ref => canvasAgentReferenceNode(ref))
                .filter(node => node && node.id !== target.id && isCanvasAgentImageTarget(node))
                .slice(0, maxExtraImageReferences());
            const initialPresetName = canvasAgentQuickToolPresetName(toolKey);
            let entry = findCanvasAgentPresetEntryByAlias(initialPresetName);
            if (!entry) {
                showToast(t('Quick tool preset is unavailable: {preset}', '快捷工具 preset 不可用：{preset}').replace('{preset}', initialPresetName || spec.label));
                return;
            }
            if (toolKey === 'style_transfer') {
                createCanvasAgentStyleTransferWorkflow(target, entry, extraImageRefs, spec);
                return;
            }
            const agentPrompt = String(state.input || '').trim();
            const promptFromPreset = !agentPrompt;
            const prompt = agentPrompt || canvasAgentPresetDefaultPrompt(entry, spec.prompt);
            const decisionForm = {
                preset: normalizePresetName(entry.name || entry.display_name || ''),
                prompt
            };
            const missingRequiredReference = !!spec.wantsReference && !extraImageRefs.length;
            const ok = await askCanvasAgentDecision({
                title: missingRequiredReference
                    ? t('Reference image required', '需要参考图')
                    : ((spec.autoRun || spec.requiresMask) ? t('Start quick tool?', '开始快捷工具？') : t('Create quick tool node?', '创建快捷工具节点？')),
                message: missingRequiredReference
                    ? t('{tool} needs the main image plus another reference image. Pick a Ref first, or create the node and connect the reference manually.', '{tool} 需要主图加另一张参考图。先选择 Ref，或只创建节点后手动连接参考图。').replace('{tool}', spec.label)
                    : spec.requiresMask
                    ? t('{tool} needs a mask. Agent will reserve the result, open Sketch, then auto-run after you save the mask.', '{tool} 需要蒙版。Agent 会先预留结果节点并打开 Sketch，保存蒙版后自动运行。').replace('{tool}', spec.label)
                    : t('Agent will use {tool}, connect the main image, and submit this prompt.', 'Agent 将使用 {tool}，连接主图并提交以下提示词。').replace('{tool}', spec.label),
                form: decisionForm,
                fields: [
                    { key: 'preset', label: t('Target preset', '目标 preset'), options: canvasAgentQuickToolPresetOptions(toolKey, entry) },
                    canvasAgentPromptDecisionField()
                ],
                promptField: 'prompt',
                promptPresetField: 'preset',
                promptFallback: spec.prompt,
                promptAutoValue: promptFromPreset ? prompt : '',
                promptEdited: !promptFromPreset,
                facts: [
                    { label: t('Action', '动作'), value: spec.label },
                    { label: t('Preset', '预设'), value: entry.display_name || entry.name || initialPresetName },
                    { label: t('Source', '源图'), value: canvasAgentShortNodeLabel(target) },
                    extraImageRefs.length ? { label: t('Image refs', '图片参考'), value: String(extraImageRefs.length) } : null,
                    spec.wantsReference && !extraImageRefs.length ? { label: t('Reference', '参考图'), value: t('Recommended before manual run', '建议在手动运行前补充') } : null,
                    spec.requiresMask ? { label: t('Mask', '蒙版'), value: t('Paint, then auto-run', '绘制后自动运行') } : null,
                    { label: t('Resolution', '分辨率'), value: canvasAgentResolutionLabel() }
                ].filter(Boolean),
                details: prompt,
                note: spec.requiresMask
                    ? t('Sketch saves the mask onto the image. The reserved result node will receive the run output.', 'Sketch 会把蒙版保存到图像上；预留的结果节点会承接本次输出。')
                    : '',
                actions: missingRequiredReference ? [
                    { value: 'pick-reference', label: t('Pick Ref', '选择 Ref'), icon: 'fa-crosshairs', primary: true },
                    { value: 'create-node', label: t('Create node only', '只创建节点'), icon: 'fa-plus' },
                    { value: 'cancel', label: t('Cancel', '取消'), icon: 'fa-xmark' }
                ] : [
                    { value: 'continue', label: spec.requiresMask ? t('Open Sketch', '打开 Sketch') : (spec.autoRun ? t('Start', '开始') : t('Create node', '创建节点')), icon: spec.requiresMask ? 'fa-paintbrush' : (spec.autoRun ? 'fa-play' : 'fa-plus'), primary: true },
                    { value: 'cancel', label: t('Cancel', '取消'), icon: 'fa-xmark' }
                ]
            });
            if (ok === 'pick-reference') {
                startCanvasAgentReferencePickForTool(target, spec);
                return;
            }
            if (ok !== 'continue' && ok !== 'create-node') {
                setCanvasAgentMessage(t('Quick tool cancelled.', '快捷工具已取消。'));
                return;
            }
            const createOnlyBecauseReferenceMissing = missingRequiredReference && ok === 'create-node';
            const finalPrompt = canvasAgentPromptFromDecision(decisionForm, prompt);
            entry = findCanvasAgentPresetEntryByAlias(decisionForm.preset) || entry;
            const node = markCanvasAgentCreatedNode(addPresetNode(entry, canvasAgentWorkflowPresetPosition(target), {
                collapsed: true
            }));
            configureCanvasAgentQuickToolNode(node, toolKey);
            applyCanvasAgentPromptToGenerator(node, finalPrompt);
            const connections = connectCanvasAgentImagesToGenerator(node, target, extraImageRefs);
            if (!connections.ok) {
                showToast(t('Selected preset has no compatible image input.', '选择的 preset 没有兼容图像输入'));
                return;
            }
            applyCanvasAgentResolutionToGenerator(node);
            if (createOnlyBecauseReferenceMissing) {
                const referenceNode = createCanvasAgentReferencePlaceholderForGenerator(node, connections.mainSlot, toolKey, spec);
                if (referenceNode) positionCanvasAgentReferenceWorkflow(target, node, referenceNode);
                const workflowNodes = [referenceNode, node].filter(Boolean);
                const group = createCanvasAgentWorkflowGroup(workflowNodes, `${spec.label} workflow`);
                setCanvasAgentSelection(referenceNode?.id || node.id, workflowNodes.map(item => item.id), group?.id);
                mutate({ inspector: true });
                centerCanvasAgentWorkflow(workflowNodes);
                if (referenceNode) {
                    setCanvasAgentMessage(t('{tool} node and reference image input created. Upload the reference image, then add the mask and run it manually.', '{tool} 节点和参考图输入已创建。上传参考图后，再添加蒙版并手动运行。').replace('{tool}', spec.label));
                    showToast(t('{tool} reference image input created.', '{tool} 参考图输入已创建。').replace('{tool}', spec.label));
                } else {
                    setCanvasAgentMessage(t('{tool} node created, but no free reference image slot was found. Connect a reference image manually before running.', '{tool} 节点已创建，但没有找到空闲参考图槽。运行前请手动连接参考图。').replace('{tool}', spec.label));
                    showToast(t('{tool} node created; reference image is still missing.', '{tool} 节点已创建，仍缺参考图。').replace('{tool}', spec.label));
                }
                return;
            }
            setCanvasAgentSelection(node.id, [node.id]);
            mutate({ inspector: true });
            if (spec.requiresMask) {
                prepareCanvasAgentManualMaskWorkflow(target, node, spec, `${t('Agent quick tool', 'Agent 快捷工具')}: ${spec.label}`);
                return;
            }
            setCanvasAgentRunInfo({
                token: uid('agent_run'),
                stage: t('Submitting quick tool', '提交快捷工具'),
                preset: node.title || node.preset?.display_name || node.preset?.name || '',
                model: t('Direct prompt', '直接提示词')
            });
            setCanvasAgentMessage(t('Submitted {tool}.', '已提交 {tool}。').replace('{tool}', spec.label));
            await runPresetNode(node, {
                agentWorkflowTitle: `${t('Agent quick tool', 'Agent 快捷工具')}: ${spec.label}`
            });
            clearCanvasAgentRunInfo(1800);
        }

        function canvasAgentOutpaintDirectionText(state) {
            const s = state || {};
            const dirs = [];
            if (Number(s.up || 0) > 0) dirs.push('top');
            if (Number(s.down || 0) > 0) dirs.push('bottom');
            if (Number(s.left || 0) > 0) dirs.push('left');
            if (Number(s.right || 0) > 0) dirs.push('right');
            return dirs.length ? `extend the ${dirs.join(' and ')} borders` : 'extend the image borders';
        }

        function canvasAgentOutpaintPromptIsGeneric(rawPrompt) {
            const text = String(rawPrompt || '').trim();
            return !text || /^(扩图|扩展|扩边|扩画布|延展|补边|outpaint|outpainting|extend|extend image|image extension)$/i.test(text);
        }

        function canvasAgentOutpaintPrompt(rawPrompt, state) {
            const userText = String(rawPrompt || '').trim();
            const generic = canvasAgentOutpaintPromptIsGeneric(userText);
            const base = `Create a seamless FLUX outpaint to ${canvasAgentOutpaintDirectionText(state)}. Preserve the original subject while keeping the same lighting and perspective. Keep the camera angle composition style color palette texture and depth consistent with the source image. Continue the background naturally with coherent details and clean seamless edges.`;
            if (generic) return base;
            if (/[\u3400-\u9fff]/.test(userText)) {
                return `${base}. Preserve the user-requested visual intent while extending the image naturally.`;
            }
            return `${base}. User intent: ${userText}`;
        }

        async function resolveCanvasAgentOutpaintPrompt(rawPrompt, state, targetNode, entry, initialPresetName) {
            const userText = String(rawPrompt || '').trim();
            const presetName = normalizePresetName(entry?.name || entry?.display_name || initialPresetName || '');
            const promptTarget = canvasAgentPromptTargetFromEntry(entry, 'outpaint');
            const presetDefaults = canvasAgentPresetPromptDefaults(entry);
            let prompt = canvasAgentOutpaintPrompt(userText, state);
            const targetRewrite = await ensureCanvasAgentPromptMatchesTarget(prompt, promptTarget, 'outpaint', {
                entry,
                presetName,
                userPrompt: userText,
                presetDefaults,
                promptSource: userText ? 'outpaint_user_intent' : 'outpaint_default'
            });
            if (targetRewrite.ok && targetRewrite.prompt) prompt = targetRewrite.prompt;
            return { prompt, promptTarget, presetDefaults };
        }

        async function confirmOutpaintFromOverlay() {
            const overlayState = getOutpaintOverlayState();
            if (!overlayState.active) return;
            const s = overlayState;
            const agentState = getAgentState();
            const node = s.nodeId ? getNode(s.nodeId) : null;
            if (!node) { hideOutpaintOverlay(); return; }
            const initialPresetName = canvasAgentQuickToolPresetName('outpaint');
            let entry = findCanvasAgentPresetEntryByAlias(initialPresetName);
            if (!entry) {
                showToast(t('Outpaint preset is unavailable: {preset}', 'Outpaint preset 不可用：{preset}').replace('{preset}', initialPresetName || 'OneKey-Outpaint'));
                return;
            }
            const outpaintParams = {
                scene_var_number7: s.up,
                scene_var_number8: s.down,
                scene_var_number9: s.left,
                scene_var_number10: s.right
            };
            const resolvedPrompt = await resolveCanvasAgentOutpaintPrompt(agentState.input, s, node, entry, initialPresetName);
            let prompt = resolvedPrompt.prompt;
            const promptTarget = resolvedPrompt.promptTarget;
            const preflightGate = await ensureCanvasAgentPromptPreflightAllows(prompt, promptTarget, 'outpaint', {
                entry,
                action: 'outpaint',
                presetName: normalizePresetName(entry.name || entry.display_name || initialPresetName),
                userPrompt: String(agentState.input || '').trim(),
                presetDefaults: resolvedPrompt.presetDefaults
            });
            if (!preflightGate.ok) {
                setCanvasAgentMessage(preflightGate.error || t('Prompt preflight blocked outpaint.', '提示词预检查阻止了扩图。'));
                return;
            }
            prompt = preflightGate.prompt || prompt;
            const presetNode = markCanvasAgentCreatedNode(addPresetNode(entry, canvasAgentWorkflowPresetPosition(node), {
                collapsed: true
            }));
            configureCanvasAgentQuickToolNode(presetNode, 'outpaint', outpaintParams);
            applyCanvasAgentPromptToGenerator(presetNode, prompt);
            const connections = connectCanvasAgentImagesToGenerator(presetNode, node, []);
            if (!connections.ok) {
                showToast(t('Selected preset has no compatible image input.', '选择的 preset 没有兼容图像输入'));
                return;
            }
            applyCanvasAgentResolutionToGenerator(presetNode);
            setCanvasAgentSelection(presetNode.id, [presetNode.id]);
            mutate({ inspector: true });
            try {
                setCanvasAgentSettingsPatch({
                    outpaintUpPercent: s.up,
                    outpaintDownPercent: s.down,
                    outpaintLeftPercent: s.left,
                    outpaintRightPercent: s.right
                }, { silentHistory: true });
            } catch (err) {}
            hideOutpaintOverlay();
            setCanvasAgentRunInfo({
                token: uid('agent_run'),
                stage: t('Submitting outpaint', '提交扩图'),
                preset: presetNode.title || presetNode.preset?.display_name || presetNode.preset?.name || '',
                model: t('Direct prompt', '直接提示词')
            });
            setCanvasAgentMessage(t('Submitted outpaint ({up}%↑ {down}%↓ {left}%← {right}%→)', '已提交扩图 ({up}%↑ {down}%↓ {left}%← {right}%→)').replace('{up}', s.up).replace('{down}', s.down).replace('{left}', s.left).replace('{right}', s.right));
            await runPresetNode(presetNode, {
                agentWorkflowTitle: `${t('Agent outpaint', 'Agent 扩图')}: ${s.up}%↑ ${s.down}%↓ ${s.left}%← ${s.right}%→`,
                promptPreflight: preflightGate.preflight,
                skipInputPreflight: true
            });
            clearCanvasAgentRunInfo(1800);
        }

        function createCanvasAgentStyleTransferWorkflow(target, entry, extraImageRefs, spec) {
            hideOutpaintOverlay();
            const label = spec?.label || t('Style Transfer', '风格转换');
            const presetPosition = canvasAgentStyleTransferPresetPosition(target);
            const node = markCanvasAgentCreatedNode(addPresetNode(entry, presetPosition, {
                collapsed: true,
                render: false,
                avoidOverlap: false
            }), { sourcePatch: { agent_tool: 'style_transfer' } });
            if (!node) {
                showToast(t('Style Transfer+ preset could not be created.', '无法创建 Style Transfer+ preset。'));
                return;
            }
            configureCanvasAgentQuickToolNode(node, 'style_transfer');
            const connections = connectCanvasAgentImagesToGenerator(node, target, extraImageRefs);
            if (!connections.ok) {
                showToast(t('Selected preset has no compatible image input.', '选择的 preset 没有兼容图像输入'));
                mutate({ inspector: true });
                return;
            }
            applyCanvasAgentResolutionToGenerator(node);
            const selector = ensureStyleSelectorForPreset(node, {
                history: false,
                render: false,
                select: true,
                toast: false,
                avoidOverlap: false
            });
            if (selector) positionCanvasAgentStyleTransferWorkflow(target, node, selector);
            const workflowNodes = [selector, node].filter(Boolean);
            const group = createCanvasAgentWorkflowGroup(workflowNodes, `${label} workflow`);
            setCanvasAgentSelection(selector?.id || node.id, workflowNodes.map(item => item.id), group?.id || null);
            mutate({ inspector: true });
            centerCanvasAgentWorkflow(workflowNodes);
            setCanvasAgentMessage(t('{tool} workflow is ready. Pick a style in the Style Selector, then run Style Transfer+.', '{tool} 工作流已铺好。先在 Style Selector 里选风格，再运行 Style Transfer+。').replace('{tool}', label));
            showToast(t('Style Transfer+ workflow created.', '已创建 Style Transfer+ 工作流。'));
        }

        return {
            canvasAgentQuickTools,
            canvasAgentQuickToolSpec,
            canvasAgentQuickToolPresetName,
            configureCanvasAgentQuickToolNode,
            startCanvasAgentReferencePickForTool,
            canvasAgentStyleTransferWorkflowRect,
            findOpenCanvasAgentStyleTransferPresetPosition,
            canvasAgentStyleTransferPresetPosition,
            positionCanvasAgentStyleTransferWorkflow,
            runCanvasAgentQuickTool,
            canvasAgentOutpaintPrompt,
            resolveCanvasAgentOutpaintPrompt,
            confirmOutpaintFromOverlay,
            createCanvasAgentStyleTransferWorkflow
        };
    }

    window.SimpAICanvasWorkbenchImageTools = Object.assign({}, window.SimpAICanvasWorkbenchImageTools || {}, {
        createCanvasAgentImageToolsController
    });
})();
