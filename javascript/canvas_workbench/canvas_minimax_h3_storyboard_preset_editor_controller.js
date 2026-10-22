(function () {
    'use strict';

    function createCanvasMiniMaxH3StoryboardPresetEditorController(context) {
        const scope = context?.miniMaxH3StoryboardPresetEditorSource || context || {};
        const nodeSource = scope.nodeSource || {};
        const editorSource = scope.editorSource || {};
        const stateSource = scope.stateSource || {};
        const domSource = scope.domSource || {};
        const runtimeSource = scope.runtimeSource || {};
        const selectionSource = scope.selectionSource || {};
        const languageSource = scope.languageSource || {};
        const projectSource = scope.projectSource || {};
        const mediaSource = scope.mediaSource || {};
        const historySource = scope.historySource || {};
        const activeEditors = new WeakMap();
        const activeOptimizations = new WeakMap();
        const call = (source, name, fallback, ...args) => typeof source[name] === 'function'
            ? source[name](...args) : fallback;
        const t = (en, cn) => {
            const state = call(languageSource, 'getLanguageState', {}) || {};
            return call(languageSource, 't', state.__lang === 'cn' || state.__lang === 'zh' ? cn : en, en, cn, state);
        };
        const showToast = message => call(runtimeSource, 'showToast', undefined, message);
        const selectedReferenceAsset = source => source?.assets?.[Number(source.selected_asset_index || 0)] || source?.asset || source?.preview;

        function captureEditorTarget(node) {
            const project = call(projectSource, 'getProject', null);
            const projectId = project?.id;
            const snapshots = ['params', 'runtime', 'preset', 'h3_storyboard'].map(key => ({
                key, fields: Object.assign({}, node[key])
            }));
            const mode = call(nodeSource, 'h3StoryboardOptionsForPreset', {}, node).mode;
            let slots, sources;
            const acceptMediaChange = () => {
                snapshots.forEach(snapshot => { snapshot.fields = Object.assign({}, node[snapshot.key]); });
                slots = Object.assign({}, node.upload_slots);
                sources = Object.values(slots).filter(Boolean).map(id => {
                    const source = call(nodeSource, 'getNode', null, id);
                    const asset = selectedReferenceAsset(source);
                    return { id, source, asset, fields: Object.assign({}, asset) };
                });
            };
            acceptMediaChange();
            const isTargetCurrent = () => (!project || (call(projectSource, 'getProject', null) === project && project.id === projectId))
                && call(nodeSource, 'getNode', null, node.id) === node
                && call(nodeSource, 'isMiniMaxH3PresetNode', false, node)
                && !call(nodeSource, 'isNodeLocked', false, node)
                && call(nodeSource, 'h3StoryboardOptionsForPreset', {}, node).mode === mode
                && Object.keys(node.upload_slots || {}).length === Object.keys(slots).length
                && Object.keys(slots).every(key => node.upload_slots?.[key] === slots[key])
                && sources.every(saved => call(nodeSource, 'getNode', null, saved.id) === saved.source
                    && selectedReferenceAsset(saved.source) === saved.asset
                    && Object.keys(selectedReferenceAsset(saved.source) || {}).length === Object.keys(saved.fields).length
                    && Object.keys(saved.fields).every(key => selectedReferenceAsset(saved.source)?.[key] === saved.fields[key]))
                && snapshots.every(({ key, fields }) => Object.keys(node[key] || {}).length === Object.keys(fields).length
                    && Object.keys(fields).every(field => node[key]?.[field] === fields[field]));
            return { modal: null, isTargetCurrent, acceptMediaChange,
                isCurrent() { return isTargetCurrent() && this.modal?.isConnected !== false; } };
        }

        function beginEditor(node) {
            const target = captureEditorTarget(node);
            const isTargetCurrent = target.isTargetCurrent;
            activeEditors.set(node, target);
            target.isTargetCurrent = () => activeEditors.get(node) === target && isTargetCurrent();
            target.isCurrent = () => target.isTargetCurrent() && target.modal?.isConnected !== false;
            return target;
        }

        async function attachCharacterMediaToPreset(nodeId, card, editorTarget) {
            const target = call(nodeSource, 'getNode', null, nodeId);
            if (!target || call(nodeSource, 'isNodeLocked', false, target)) {
                throw new Error(t('Node is locked or missing.', '节点已锁定或不存在。'));
            }
            const owner = editorTarget || captureEditorTarget(target);
            if (!owner.isCurrent()) throw new Error('editor_target_changed');
            const project = call(projectSource, 'getProject', {});
            const api = call(editorSource, 'getVisualPromptApi', null);
            const mode = call(nodeSource, 'h3StoryboardModeForPreset', 'T2VA', target);
            const limits = mode === 'T2VA' ? { image: 0, audio: 0 }
                : mode === 'Ref2VA' ? { image: 9, audio: 3 }
                    : { image: mode === 'FL2VA' ? 2 : 1, audio: 0 };
            const visibleSlots = call(nodeSource, 'getVisibleUploadSlots', [], target);
            const slotOrder = call(nodeSource, 'getSlotOrder', []);
            const slots = (Array.isArray(visibleSlots) ? visibleSlots : [])
                .slice().sort((a, b) => slotOrder.indexOf(a.key) - slotOrder.indexOf(b.key))
                .map(slot => ({
                    key: slot.key,
                    kind: call(nodeSource, 'getUploadSlotMediaKind', '', slot.key),
                    occupied: !!target.upload_slots?.[slot.key]
                }));
            const allowed = ['image', 'audio'].flatMap(kind => slots.filter(slot => slot.kind === kind).slice(0, limits[kind]));
            const inventory = call(nodeSource, 'h3StoryboardInventoryForPreset', {}, target);
            const plan = api.planMediaAttachments(card.media, inventory, allowed);
            if (!plan.assignments.length) {
                return {
                    inventory: call(nodeSource, 'h3StoryboardInventoryForPreset', {}, target),
                    skipped: plan.skipped
                };
            }
            const systemParams = call(stateSource, 'getSystemParams', {}) || {};
            const response = await api.request('resolve', {
                asset_ids: plan.assignments.map(item => item.asset_id)
            }, systemParams);
            if (!owner.isCurrent()) throw new Error('editor_target_changed');
            const current = target;
            if (!current || call(nodeSource, 'isNodeLocked', false, current)) {
                throw new Error(t('Node is locked or missing.', '节点已锁定或不存在。'));
            }
            const currentSlots = call(nodeSource, 'getVisibleUploadSlots', [], current);
            const stillVisible = new Set((Array.isArray(currentSlots) ? currentSlots : []).map(slot => slot.key));
            if (call(nodeSource, 'h3StoryboardModeForPreset', 'T2VA', current) !== mode || plan.assignments.some(item =>
                !stillVisible.has(item.slot) || current.upload_slots?.[item.slot]
                    || project.edges.some(edge => edge.type === 'upload' && edge.to === nodeId && edge.slot === item.slot))) {
                throw new Error('media_slot_occupied');
            }
            const mediaNodes = plan.assignments.map((item, index) => {
                const asset = response.assets.find(ref => ref.asset_id === item.asset_id);
                const world = { x: current.x - 320, y: current.y + index * 220 };
                const title = String(card.name) + ' - ' + (asset?.name || item.slot);
                const node = asset && call(mediaSource, 'buildMediaNodeFromAsset', null, asset, world, title);
                if (!node || !call(nodeSource, 'canNodeConnectToUploadSlot', false, node, item.slot)) {
                    throw new Error('media_kind_mismatch');
                }
                return { node, slot: item.slot, world };
            });
            call(historySource, 'pushHistory', undefined, 'Add character reference media');
            for (const item of mediaNodes) {
                call(runtimeSource, 'placeNodeAvoidingOverlap', undefined, item.node, item.world);
                const patch = call(projectSource, 'buildProjectNodeAppendPatch', {}, project, item.node);
                Object.assign(project, patch || {});
                call(runtimeSource, 'createUploadEdge', undefined, item.node.id, nodeId, item.slot, { silent: true });
            }
            owner.acceptMediaChange();
            call(runtimeSource, 'mutate', undefined, { inspector: true });
            return {
                inventory: call(nodeSource, 'h3StoryboardInventoryForPreset', {}, current),
                skipped: plan.skipped
            };
        }

        function openVisualPromptEditor(node) {
            if (!node || !call(nodeSource, 'isMiniMaxH3PresetNode', false, node) || call(nodeSource, 'isNodeLocked', false, node)) return null;
            const target = beginEditor(node);
            const open = () => {
                if (!target.isCurrent()) return null;
                target.modal = call(editorSource, 'openVisualPrompt', undefined, {
                value: node.params?.prompt || '',
                definitionTarget: call(nodeSource, 'h3StoryboardOptionsForPreset', {}, node).mode === 'Ref2VA' ? 'prompt' : '',
                langState: call(languageSource, 'getLanguageState', {}) || {},
                inventory: call(nodeSource, 'h3StoryboardInventoryForPreset', {}, node),
                getInventory: () => target.isCurrent() ? call(nodeSource, 'h3StoryboardInventoryForPreset', {}, node) : {},
                onAttachMedia: card => attachCharacterMediaToPreset(node.id, card, target),
                bindings: node.h3_storyboard?.character_bindings || [],
                onApply: async result => {
                    if (!target.isCurrent()) return false;
                    const current = node;
                    const editor = call(editorSource, 'getStoryboardEditor', null);
                    if (!editor) await call(runtimeSource, 'loadLazyGroup', undefined, 'h3StoryboardEditor');
                    if (!target.isCurrent()) return false;
                    const loadedEditor = call(editorSource, 'getStoryboardEditor', null);
                    if (!loadedEditor) throw new Error(t('H3 storyboard editor is not loaded.', 'H3 分镜表编辑器尚未加载。'));
                    const nextStoryboard = loadedEditor.parsePrompt(result.value, call(nodeSource, 'h3StoryboardOptionsForPreset', {}, current));
                    call(runtimeSource, 'pushHistory', undefined, 'Update visual prompt');
                    Object.assign(current, call(stateSource, 'buildNodeParamsPatch', {}, current, { paramsPatch: { prompt: result.value } }));
                    Object.assign(current, call(stateSource, 'buildH3StoryboardStatePatch', {}, current, {
                        statePatch: Object.assign({}, nextStoryboard, {
                            character_bindings: result.bindings,
                            prompt_snapshot: result.value
                        }), updatedAt: call(runtimeSource, 'nowIso', '')
                    }));
                    call(runtimeSource, 'mutate', undefined, { inspector: true });
                    return true;
                }
                });
                return target.modal;
            };
            const visualEditor = call(editorSource, 'getVisualPromptEditor', null);
            if (visualEditor) return open();
            return Promise.resolve(call(runtimeSource, 'loadLazyGroup', undefined, 'h3StoryboardEditor'))
                .then(open)
                .catch(error => target.isCurrent() && call(runtimeSource, 'alert', undefined, error?.message || t('Prompt editor could not be opened.', '无法打开提示词编辑器。')));
        }

        async function openMiniMaxH3StoryboardPresetEditor(node) {
            if (!call(nodeSource, 'isMiniMaxH3PresetNode', false, node)) return null;
            if (call(nodeSource, 'isNodeLocked', false, node)) {
                showToast(t('Node is locked.', '节点已锁定。'));
                return null;
            }
            const target = beginEditor(node);
            const ready = await call(runtimeSource, 'ensureWorkbenchLazyRuntime', false,
                'h3StoryboardEditor',
                () => call(editorSource, 'isLoaded', false),
                t('Loading H3 storyboard...', '正在加载 H3 分镜表...'),
                t('H3 storyboard editor is not loaded.', 'H3 分镜表编辑器尚未加载。')
            );
            if (!ready || !target.isCurrent()) return null;
            const options = call(nodeSource, 'h3StoryboardOptionsForPreset', {}, node);
            target.modal = call(editorSource, 'open', undefined, Object.assign({}, options, {
                title: t('MiniMax H3 Storyboard', 'MiniMax H3 分镜表'),
                context: 'canvas',
                getInventory: () => target.isCurrent() ? call(nodeSource, 'h3StoryboardInventoryForPreset', {}, node) : {},
                onAttachMedia: async card => {
                    const result = await attachCharacterMediaToPreset(node.id, card, target);
                    options.inventory = result.inventory;
                    return result;
                },
                prompt: node.params?.prompt || '',
                storyboardState: call(nodeSource, 'h3StoryboardStateForPreset', {}, node),
                modalMount: call(domSource, 'canvasOverlayHost', null),
                onRequestMedia: () => {
                    if (!target.isTargetCurrent()) return;
                    const current = node;
                    call(selectionSource, 'selectNode', undefined, current.id);
                    call(runtimeSource, 'mutate', undefined, { inspector: true });
                    showToast(t('Connect image, video, or audio nodes to the H3 preset.', '请将图片、视频或音频节点连接到 H3 Preset。'));
                },
                onOptimize: async response => {
                    const stale = () => ({ ok: false, error: 'editor_target_changed' });
                    if (!target.isCurrent()) return stale();
                    const current = node;
                    const references = call(nodeSource, 'h3StoryboardVlmReferencesForPreset', [], current);
                    const referenceSnapshot = references.map(reference => ({
                        node: reference.node, kind: reference.kind, slot: reference.slot, token: reference.token,
                        asset: selectedReferenceAsset(reference.node), fields: Object.assign({}, selectedReferenceAsset(reference.node)),
                        assets: reference.node?.assets, selected: reference.node?.selected_asset_index
                    }));
                    const operation = {};
                    activeOptimizations.set(target, operation);
                    const isCurrent = () => target.isCurrent() && activeOptimizations.get(target) === operation
                        && (() => {
                            const latest = call(nodeSource, 'h3StoryboardVlmReferencesForPreset', [], node);
                            return latest.length === referenceSnapshot.length && latest.every((reference, index) => {
                                const saved = referenceSnapshot[index];
                                return reference.node === saved.node && reference.kind === saved.kind
                                    && reference.slot === saved.slot && reference.token === saved.token
                                    && selectedReferenceAsset(reference.node) === saved.asset && reference.node?.assets === saved.assets
                                    && reference.node?.selected_asset_index === saved.selected
                                    && Object.keys(selectedReferenceAsset(reference.node) || {}).length === Object.keys(saved.fields).length
                                    && Object.keys(saved.fields).every(key => selectedReferenceAsset(reference.node)?.[key] === saved.fields[key]);
                            });
                        })();
                    const requestedMotionSlot = call(editorSource, 'preferredStoryboardVideoSlot', '', response?.state, options.inventory) || '';
                    const motionReference = references.find(reference => reference.kind === 'video' && reference.slot === requestedMotionSlot)
                        || references.find(reference => reference.kind === 'video' && reference.slot === 'scene_reference_video2')
                        || references.find(reference => reference.kind === 'video' && reference.slot === 'scene_reference_video')
                        || references.find(reference => reference.kind === 'video')
                        || null;
                    const imageVideoReferences = references.filter(reference => ['image', 'video'].includes(reference.kind));
                    const referenceOptions = {
                        referenceNodes: imageVideoReferences.map(reference => reference.node),
                        referenceEntries: imageVideoReferences,
                        referenceDescriptors: references,
                        preserveReferenceDuplicates: true,
                        includeCanvasAgentReferences: false,
                        referenceImagesOnly: false,
                        maxReferenceSources: 12,
                        referenceSummary: call(nodeSource, 'h3StoryboardVlmReferenceSummary', '', references, call(runtimeSource, 'runtimeUiLang', ''), motionReference?.slot || ''),
                        motionReferenceToken: motionReference?.token || '',
                        motionReferenceSlot: motionReference?.slot || ''
                    };
                    if (response?.kind === 'cell') {
                        const input = String(response?.input || '').trim();
                        if (!input) return { ok: false, error: t('Selected field context is empty.', '当前格没有可用上下文。') };
                        showToast(t('Editing selected H3 field with LLM...', '正在修改 H3 当前格...'));
                        const rewritten = await call(runtimeSource, 'rewriteCanvasAgentPromptWithLlm', {}, input, 'h3 storyboard cell', Object.assign({}, referenceOptions, {
                            h3StoryboardCell: true,
                            cellInstruction: response?.instruction || '',
                            presetName: current.preset?.name || current.title || '',
                            userPrompt: response?.user_instruction || input
                        }));
                        if (!isCurrent()) return stale();
                        const cell = String(rewritten?.prompt || '').trim();
                        if (!rewritten?.ok || !cell) {
                            const error = rewritten?.error || 'unknown';
                            showToast(t('H3 field edit failed: {error}', 'H3 格子修改失败：{error}').replace('{error}', error));
                            return { ok: false, error };
                        }
                        return { ok: true, cell, warning: rewritten?.warning || '' };
                    }
                    const prompt = String(response?.prompt || '').trim();
                    if (!prompt) return { ok: false, error: t('H3 storyboard prompt is empty.', 'H3 分镜提示词为空。') };
                    showToast(t('Optimizing H3 storyboard with LLM...', '正在通过 LLM 优化 H3 分镜表...'));
                    const promptTarget = call(nodeSource, 'canvasAgentPromptTargetFromNode', null, current, 'video');
                    const motionReferenceIndex = Number((String(motionReference?.token || '').match(/\d+/) || [])[0] || 0);
                    if (promptTarget?.prompt_compiler_context && motionReference) {
                        const compilerContext = Object.assign({}, promptTarget.prompt_compiler_context, {
                            video_reference_index: motionReferenceIndex,
                            motion_picture_index: call(nodeSource, 'h3StoryboardMotionPictureIndex', 0,
                                prompt, motionReference?.token || '', references.filter(reference => reference.kind === 'image').length
                            ),
                            video_requested: true,
                            video_used: true,
                            video_source: motionReference.slot === 'scene_reference_video2'
                                ? 'reference_video2'
                                : (motionReference.slot === 'scene_reference_video' ? 'reference_video' : 'main_video'),
                            reference_video_content_available: motionReference.slot === 'scene_reference_video'
                                || motionReference.slot === 'scene_reference_video2'
                        });
                        if (Array.isArray(compilerContext.video_descriptors)) {
                            compilerContext.video_descriptors = compilerContext.video_descriptors.map(descriptor => ({
                                ...descriptor,
                                role: descriptor.slot === motionReference.slot
                                    ? 'motion/timing reference video'
                                    : 'scene/composition video reference'
                            }));
                        }
                        promptTarget.prompt_compiler_context = compilerContext;
                    }
                    const rewritten = await call(runtimeSource, 'rewriteCanvasAgentPromptWithLlm', {}, prompt, 'video refine', Object.assign({}, referenceOptions, {
                        promptTarget,
                        presetName: current.preset?.name || current.title || '',
                        presetDefaults: call(nodeSource, 'canvasAgentPresetPromptDefaults', {}, current),
                        userPrompt: prompt
                    }));
                    if (!isCurrent()) return stale();
                    const optimizedPrompt = String(rewritten?.prompt || '').trim();
                    if (!rewritten?.ok || !optimizedPrompt) {
                        const error = rewritten?.error || 'unknown';
                        showToast(t('H3 storyboard optimization failed: {error}', 'H3 分镜表优化失败：{error}').replace('{error}', error));
                        return { ok: false, error };
                    }
                    return { ok: true, prompt: optimizedPrompt, warning: rewritten?.warning || '' };
                },
                onConfirm: response => {
                    if (!target.isCurrent()) return false;
                    const current = node;
                    const prompt = String(response?.prompt || '').trim();
                    call(runtimeSource, 'pushHistory', undefined, 'Update MiniMax H3 storyboard');
                    Object.assign(current, call(stateSource, 'buildNodeParamsPatch', {}, current, { paramsPatch: { prompt } }));
                    Object.assign(current, call(stateSource, 'buildH3StoryboardStatePatch', {}, current, {
                        statePatch: Object.assign({}, response?.state || {}, { prompt_snapshot: prompt }),
                        updatedAt: call(runtimeSource, 'nowIso', '')
                    }));
                    Object.assign(current, call(stateSource, 'buildSpecialNodeStatusPatch', {}, current, {
                        status: call(stateSource, 'mergeCanvasRunStatus', current.status, current.status, 'ready', t('H3 storyboard applied.', 'H3 分镜表已写入 Prompt。'))
                    }));
                    call(selectionSource, 'selectNode', undefined, current.id);
                    call(runtimeSource, 'mutate', undefined, { inspector: true });
                    showToast(current.status.message);
                    return true;
                }
            }));
            return target.modal;
        }

        return { attachCharacterMediaToPreset, openMiniMaxH3StoryboardPresetEditor, openVisualPromptEditor };
    }

    window.SimpAICanvasWorkbenchMiniMaxH3StoryboardPresetEditor = Object.assign(
        {}, window.SimpAICanvasWorkbenchMiniMaxH3StoryboardPresetEditor || {},
        { createCanvasMiniMaxH3StoryboardPresetEditorController }
    );
})();
