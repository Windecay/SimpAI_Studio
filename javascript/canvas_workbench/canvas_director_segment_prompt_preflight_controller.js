(function () {
    'use strict';

    function createCanvasDirectorSegmentPromptPreflightController(context) {
        const scope = context?.directorSegmentPromptPreflightSource || context || {};
        const targetSource = scope.targetSource || {};
        const promptSource = scope.promptSource || {};
        const wildcardSource = scope.wildcardSource || {};
        const presetSource = scope.presetSource || {};
        const segmentSource = scope.segmentSource || {};
        const languageSource = scope.languageSource || {};
        const call = (source, name, fallback, ...args) => typeof source[name] === 'function'
            ? source[name](...args) : fallback;
        const canvasAgentPromptTargetFromNode = (...args) => call(
            targetSource, 'canvasAgentPromptTargetFromNode', null, ...args
        );
        const ensureCanvasAgentPromptPreflightAllows = (...args) => call(
            promptSource, 'ensureCanvasAgentPromptPreflightAllows', undefined, ...args
        );
        const buildWildcardPreviewForNode = (...args) => call(
            wildcardSource, 'buildWildcardPreviewForNode', undefined, ...args
        );
        const getPresetCatalogEntryForNode = (...args) => call(
            presetSource, 'getPresetCatalogEntryForNode', undefined, ...args
        );
        const canvasAgentPresetPromptDefaults = (...args) => call(
            presetSource, 'canvasAgentPresetPromptDefaults', {}, ...args
        );
        const directorSegmentMediaRefs = (...args) => call(
            segmentSource, 'directorSegmentMediaRefs', [], ...args
        );
        const directorSegmentFirstMediaRef = (...args) => call(
            segmentSource, 'directorSegmentFirstMediaRef', '', ...args
        );
        const directorSegmentGenerationSeconds = (...args) => call(
            segmentSource, 'directorSegmentGenerationSeconds', 0, ...args
        );
        const directorSegmentPrompt = (...args) => call(
            segmentSource, 'directorSegmentPrompt', '', ...args
        );
        const t = (en, cn) => {
            const state = call(languageSource, 'getLanguageState', {});
            return call(languageSource, 't', en, en, cn, state);
        };

        function directorSegmentPromptCompilerTarget(node, plan, segment) {
            const target = canvasAgentPromptTargetFromNode(node, 'text-to-video');
            if (!target?.prompt_compiler) return target;
            const imageCount = directorSegmentMediaRefs(segment, 'images').length;
            const videoCount = directorSegmentFirstMediaRef(segment, 'video') ? 1 : 0;
            const audioCount = directorSegmentFirstMediaRef(segment, 'audio') ? 1 : 0;
            return Object.assign({}, target, {
                prompt_compiler_context: Object.assign({}, target.prompt_compiler_context || {}, {
                    image_count: imageCount,
                    video_count: videoCount,
                    audio_count: audioCount,
                    duration_seconds: directorSegmentGenerationSeconds(segment, plan),
                    inventory_known: true
                })
            });
        }

        async function preflightDirectorSegmentPrompts(node, plan, options) {
            const isCurrent = () => typeof options?.shouldContinue !== 'function' || options.shouldContinue();
            const stale = () => ({ ok: false, error: 'Director preflight no longer current' });
            if (!isCurrent()) return stale();
            const segments = Array.isArray(plan?.segments) ? plan.segments : [];
            const baseTarget = directorSegmentPromptCompilerTarget(node, plan, segments[0] || {});
            if (!baseTarget?.prompt_compiler) return { ok: true, plan };
            const wildcardPreview = await buildWildcardPreviewForNode(node, { shouldContinue: isCurrent });
            if (!isCurrent()) return stale();
            const entry = getPresetCatalogEntryForNode(node);
            const presetDefaults = canvasAgentPresetPromptDefaults(node);
            const preparedSegments = [];
            for (let index = 0; index < segments.length; index += 1) {
                const segment = segments[index];
                const prompt = directorSegmentPrompt(segment, '');
                const promptTarget = directorSegmentPromptCompilerTarget(node, plan, segment);
                const result = await ensureCanvasAgentPromptPreflightAllows(prompt, promptTarget, 'text-to-video', {
                    node,
                    entry,
                    wildcardPreview,
                    presetDefaults,
                    promptTarget,
                    userPrompt: prompt,
                    allowEditOnBlock: true,
                    autoStart: !!options?.autoStart,
                    shouldContinue: isCurrent
                });
                if (!isCurrent()) return stale();
                if (!result.ok) {
                    return {
                        ok: false,
                        error: result.error || t('Director shot prompt preflight was cancelled.', 'Director 分镜提示词预检查已取消。'),
                        preflight: result.preflight,
                        segment_index: index
                    };
                }
                preparedSegments.push(Object.assign({}, segment, {
                    prompt: String(result.prompt || prompt).trim()
                }));
            }
            return {
                ok: true,
                plan: Object.assign({}, plan, {
                    segments: preparedSegments,
                    payload: Object.assign({}, plan?.payload || {}, { segments: preparedSegments })
                })
            };
        }

        return {
            directorSegmentPromptCompilerTarget,
            preflightDirectorSegmentPrompts
        };
    }

    window.SimpAICanvasWorkbenchDirectorSegmentPromptPreflight = Object.assign(
        {}, window.SimpAICanvasWorkbenchDirectorSegmentPromptPreflight || {},
        { createCanvasDirectorSegmentPromptPreflightController }
    );
})();
