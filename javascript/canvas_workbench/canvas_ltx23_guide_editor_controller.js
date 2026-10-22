(function () {
    'use strict';

    function createCanvasLtx23GuideEditorController(context) {
        const scope = context?.ltx23GuideEditorSource || context || {};
        const nodeSource = scope.nodeSource || {};
        const editorSource = scope.editorSource || {};
        const domSource = scope.domSource || {};
        const stateSource = scope.stateSource || {};
        const runtimeSource = scope.runtimeSource || {};
        const selectionSource = scope.selectionSource || {};
        const languageSource = scope.languageSource || {};
        const projectSource = scope.projectSource || {};
        const activeEditors = new WeakMap();
        const call = (source, name, fallback, ...args) => typeof source[name] === 'function'
            ? source[name](...args) : fallback;
        const t = (en, cn) => {
            const state = call(languageSource, 'getLanguageState', {}) || {};
            return call(languageSource, 't', state.__lang === 'cn' || state.__lang === 'zh' ? cn : en, en, cn, state);
        };

        function ltx23GuideModeForPreset(node) {
            const themeInfo = call(nodeSource, 'getPresetThemeInfo', {}, node) || {};
            const taskMethod = String(themeInfo.task_method || node?.runtime?.task_method || '').toLowerCase();
            if (taskMethod) return taskMethod.includes('ltx_extent') ? 'video_extent' : 'keyframes';
            const text = [
                node?.title,
                node?.preset?.name,
                node?.preset?.display_name,
                node?.runtime?.scene_theme,
                call(nodeSource, 'getPresetTheme', '', node)
            ].filter(Boolean).join(' ').toLowerCase();
            return /ltx2\.3\s*\(extent\)/.test(text)
                ? 'video_extent'
                : 'keyframes';
        }

        function ltx23GuideConfigForPreset(node) {
            const value = node?.params?.scene_additional_prompt || '';
            const mode = ltx23GuideModeForPreset(node);
            const editor = call(editorSource, 'getGuideEditor', null);
            if (typeof editor?.normalize === 'function') return editor.normalize(value, mode);
            let source = {};
            try {
                source = typeof value === 'string' && value.trim() ? JSON.parse(value) : (value || {});
            } catch (error) {
                source = {};
            }
            if (!source || typeof source !== 'object' || Array.isArray(source)) source = {};
            const middleSource = Array.isArray(source.middle) ? source.middle : [];
            const bounded = (number, fallback, minimum, maximum) => {
                const parsed = Number(number);
                return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
            };
            if (mode === 'video_extent') {
                const guideSource = Array.isArray(source.guides) ? source.guides : [];
                const legacyStrengths = [
                    source.first_strength ?? 0.7,
                    middleSource[0]?.strength ?? 0.7,
                    middleSource[1]?.strength ?? 0.7,
                    middleSource[2]?.strength ?? 0.7,
                    source.last_strength ?? 0.7
                ];
                const legacyFrames = [0, ...[0, 1, 2].map(index => middleSource[index]?.frame_idx ?? 0), 0];
                const requestedContext = Math.round(bounded(source.context_frames, 17, 1, 257));
                return {
                    version: 1,
                    mode: 'video_extent',
                    context_frames: Math.min(257, Math.max(1, Math.round((requestedContext - 1) / 8) * 8 + 1)),
                    source_strength: bounded(source.source_strength, 1, 0, 10),
                    guides: [0, 1, 2, 3, 4].map(index => ({
                        frame_idx: Math.round(bounded(guideSource[index]?.frame_idx ?? legacyFrames[index], 0, 0, 9999)),
                        strength: bounded(guideSource[index]?.strength ?? legacyStrengths[index], 0.7, 0, 10)
                    }))
                };
            }
            return {
                version: 1,
                first_strength: bounded(source.first_strength, 1, 0, 10),
                last_strength: bounded(source.last_strength, 1, 0, 10),
                middle: [0, 1, 2].map(index => ({
                    frame_idx: Math.round(bounded(middleSource[index]?.frame_idx ?? source[`middle_frame_idx_${index + 1}`], 0, 0, 9999)),
                    strength: bounded(middleSource[index]?.strength ?? source[`middle_strength_${index + 1}`], 0.7, 0, 10)
                }))
            };
        }

        async function openLtx23GuidePresetEditor(node) {
            if (!call(nodeSource, 'isLtx23MultiGuidePresetNode', false, node)) return null;
            if (call(nodeSource, 'isNodeLocked', false, node)) {
                call(runtimeSource, 'showToast', undefined, t('Node is locked.', '节点已锁定。'));
                return null;
            }
            const project = call(projectSource, 'getProject', null);
            const projectId = project?.id;
            const params = Object.assign({}, node.params);
            const slots = Object.assign({}, node.upload_slots);
            const selectedAsset = source => source?.assets?.[Number(source.selected_asset_index || 0)] || source?.asset || source?.preview;
            const sources = Object.values(slots).filter(Boolean).map(id => {
                const source = call(nodeSource, 'getNode', null, id);
                const asset = selectedAsset(source);
                return { id, source, asset, fields: Object.assign({}, asset) };
            });
            const mode = ltx23GuideModeForPreset(node);
            const record = {};
            let modal = null;
            activeEditors.set(node, record);
            const isCurrent = () => activeEditors.get(node) === record
                && (!project || (call(projectSource, 'getProject', null) === project && project.id === projectId))
                && call(nodeSource, 'getNode', null, node.id) === node
                && call(nodeSource, 'isLtx23MultiGuidePresetNode', false, node)
                && !call(nodeSource, 'isNodeLocked', false, node) && modal?.isConnected !== false
                && ltx23GuideModeForPreset(node) === mode
                && Object.keys(node.upload_slots || {}).length === Object.keys(slots).length
                && Object.keys(slots).every(key => node.upload_slots?.[key] === slots[key])
                && sources.every(saved => call(nodeSource, 'getNode', null, saved.id) === saved.source
                    && selectedAsset(saved.source) === saved.asset
                    && Object.keys(selectedAsset(saved.source) || {}).length === Object.keys(saved.fields).length
                    && Object.keys(saved.fields).every(key => selectedAsset(saved.source)?.[key] === saved.fields[key]))
                && Object.keys(node.params || {}).length === Object.keys(params).length
                && Object.keys(params).every(key => node.params?.[key] === params[key]);
            const ready = await call(runtimeSource, 'ensureWorkbenchLazyRuntime', false,
                'ltxGuideEditor',
                () => call(editorSource, 'isLoaded', false),
                t('Loading keyframe guides...', '正在加载关键帧引导...'),
                t('Keyframe guide editor is not loaded.', '关键帧引导编辑器尚未加载。')
            );
            if (!ready || !isCurrent()) return null;
            modal = call(editorSource, 'open', undefined, {
                title: mode === 'video_extent'
                    ? t('LTX Extent Guides', 'LTX 续写引导')
                    : t('LTX Keyframe Guides', 'LTX 关键帧引导'),
                context: 'canvas',
                mode,
                guideConfig: node.params?.scene_additional_prompt || '',
                langState: call(languageSource, 'getEditorLanguageState', { __lang: 'en' }),
                modalMount: call(domSource, 'canvasOverlayHost', null),
                onConfirm: response => {
                    if (!isCurrent()) return false;
                    call(runtimeSource, 'pushHistory', undefined, 'Update LTX keyframe guides');
                    const current = node;
                    Object.assign(current, call(stateSource, 'buildNodeParamsPatch', {}, current, {
                        paramsPatch: { scene_additional_prompt: response?.guide_config || '' }
                    }));
                    Object.assign(current, call(stateSource, 'buildLtx23GuidesStatePatch', {}, current, {
                        statePatch: response?.config || {},
                        updatedAt: call(runtimeSource, 'nowIso', '')
                    }));
                    Object.assign(current, call(stateSource, 'buildSpecialNodeStatusPatch', {}, current, {
                        status: call(stateSource, 'mergeCanvasRunStatus', undefined, current.status, 'ready', t('Keyframe guides saved.', '关键帧引导已保存。'))
                    }));
                    call(selectionSource, 'selectNode', undefined, current.id);
                    call(runtimeSource, 'mutate', undefined, { inspector: true });
                    call(runtimeSource, 'showToast', undefined, t('Keyframe guides saved.', '关键帧引导已保存。'));
                    return true;
                }
            });
            return modal;
        }

        return { openLtx23GuidePresetEditor, ltx23GuideConfigForPreset, ltx23GuideModeForPreset };
    }

    window.SimpAICanvasWorkbenchLtx23GuideEditor = Object.assign(
        {}, window.SimpAICanvasWorkbenchLtx23GuideEditor || {}, { createCanvasLtx23GuideEditorController }
    );
})();
