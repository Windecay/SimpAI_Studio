(function () {
    'use strict';

    function createCanvasAgentPromptRewriteController(context) {
        const scope = context || {};
        const t = scope.t || ((en, cn) => cn || en);
        const uid = scope.uid || ((prefix) => `${prefix || 'id'}_${Date.now()}`);
        const normalizePresetName = scope.normalizePresetName || ((value) => String(value || '').trim());

        function call(name, fallback, ...args) {
            return typeof scope[name] === 'function' ? scope[name](...args) : fallback;
        }

        const getPromptRewriteTimeoutMs = () => Math.max(5000, Number(call('getPromptRewriteTimeoutMs', 25000) || 25000));

        function getProject() {
            return call('getProject', {}) || {};
        }

        function getSettings() {
            return call('getCanvasAgentSettings', {}) || {};
        }

        function getDefaultProjectId() {
            return String(call('getDefaultProjectId', 'default') || 'default').trim() || 'default';
        }

        function projectId() {
            return String(getProject().id || getDefaultProjectId()).trim() || getDefaultProjectId();
        }

        function comparablePromptText(text) {
            return String(text || '')
                .trim()
                .toLowerCase()
                .replace(/[\s，,。.!！?？:：;；'"“”‘’`*_()[\]{}<>《》【】\-—_/\\|]+/g, '');
        }

        function promptRewriteTooWeak(source, candidate) {
            const src = String(source || '').trim();
            const out = String(candidate || '').trim();
            if (!out) return true;
            if (comparablePromptText(src) && comparablePromptText(src) === comparablePromptText(out)) return true;
            if (src.length <= 32 && out.length < Math.max(42, src.length + 14)) return true;
            return false;
        }

        function localPromptRewriteFallback(source, target) {
            const text = String(source || '').trim();
            if (!text) return '';
            const key = String(target?.key || '').toLowerCase();
            const hasChinese = /[\u3400-\u9fff]/.test(text);
            if (key === 'outpaint_instruction') {
                return 'seamless outpainting, natural image-border expansion, preserve the original subject, preserve lighting and perspective, match camera angle and composition, match style, color palette, texture, and depth, coherent background continuation, clean seamless edges';
            }
            if ((key.includes('flux') || key.includes('t5') || key.endsWith('_en')) && hasChinese) return '';
            if (call('canvasAgentPromptTargetNeedsDanbooru', false, target)) {
                return call('canvasAgentDanbooruFallbackPrompt', '', text, target, {}, [])
                    || (text.includes(',') ? text : `${text}, detailed, high quality, atmospheric lighting, dynamic composition`);
            }
            if (hasChinese) {
                return `${text}。画面主体清晰，动作与姿态自然，背景环境完整，镜头构图明确，光线层次丰富，色彩协调，氛围细腻，细节精致。`;
            }
            return `${text}. Clear subject, natural pose and action, complete setting, balanced composition, cinematic lighting, rich atmosphere, refined visual detail.`;
        }

        async function rewriteCanvasAgentPromptWithLlm(prompt, purpose, options) {
            const model = call('getCanvasAgentRewriteModel', '', null);
            const opts = options || {};
            const isH3StoryboardCell = !!opts.h3StoryboardCell;
            const imageTarget = opts.imageTarget || null;
            const mediaTarget = opts.mediaTarget || imageTarget || null;
            const purposeText = String(purpose || '').toLowerCase();
            const isVideoPurpose = purposeText.includes('video');
            const isAudioPurpose = purposeText.includes('audio');
            const isOutpaintPurpose = purposeText.includes('outpaint');
            const visualFallbackTarget = isAudioPurpose && imageTarget && call('isCanvasAgentImageTarget', false, imageTarget)
                ? imageTarget
                : (mediaTarget || imageTarget);
            const referenceImagesOnly = typeof opts.referenceImagesOnly === 'boolean'
                ? opts.referenceImagesOnly
                : (isAudioPurpose || (!isVideoPurpose && !isAudioPurpose));
            const assetSources = call('getCanvasAgentVlmReferenceSources', [], {
                fallbackTarget: visualFallbackTarget,
                imagesOnly: referenceImagesOnly,
                referenceNodes: opts.referenceNodes,
                referenceDescriptors: opts.referenceDescriptors,
                includeCanvasAgentReferences: opts.includeCanvasAgentReferences,
                maxSources: opts.maxReferenceSources
            });
            const explicitReferenceSummary = String(opts.referenceSummary || '').trim();
            const referenceSummary = explicitReferenceSummary || (assetSources.length ? call('canvasAgentReferenceSummaryText', '', null) : '');
            const motionReferenceToken = String(opts.motionReferenceToken || '').trim();
            const motionTransferInstruction = motionReferenceToken && /<Picture\s+\d+>/i.test(referenceSummary)
                ? (call('runtimeUiLang', 'cn') === 'en'
                    ? `Motion transfer binding: ${motionReferenceToken} is the motion/timing source. The Picture token in each shot defines the visible identity; apply this video's pose, action, timing, and compatible camera movement to that picture-defined subject. Never replace the picture subject with the video's actor and never leave the picture subject in its static pose when the video shows a different action.`
                    : `动作迁移绑定：${motionReferenceToken} 是运动与时序来源。每个 Shot 中的 Picture token 决定画面角色身份；把该视频的姿态、动作、节奏和兼容的镜头运动应用到图片角色。不得用视频人物替换图片角色；视频显示了不同动作时，不得让图片角色继续保持静止输入姿态。`)
                : '';
            const isImageEdit = purposeText.includes('edit') && !isVideoPurpose && !isAudioPurpose;
            const isRefine = purposeText.includes('refine');
            const presetHint = normalizePresetName(opts.presetName || opts.plan?.preset || '');
            const basePromptTarget = opts.promptTarget
                || call('canvasAgentPromptTargetFromPurpose', {}, purpose, Object.assign({}, opts, { presetName: presetHint }));
            const uiLanguage = call('runtimeUiLang', 'cn');
            const promptTarget = isH3StoryboardCell ? {
                key: 'qwen_natural',
                label: 'MiniMax H3 storyboard field',
                name: 'MiniMax H3 storyboard field',
                backend_engine: 'PromptAction',
                task_method: uiLanguage === 'en' ? 'natural_en' : 'natural_cn',
                text_encoder: 'natural_language',
                prompt_format: uiLanguage === 'en' ? 'natural_en' : 'natural_zh',
                source: 'minimax_h3_storyboard_editor'
            } : basePromptTarget;
            const h3CompilerText = typeof promptTarget?.prompt_compiler === 'string'
                ? promptTarget.prompt_compiler
                : JSON.stringify(promptTarget?.prompt_compiler || {});
            const isH3Target = String(promptTarget?.key || '') === 'minimax_h3' || /minimax[_\s-]*h3/i.test(h3CompilerText);
            const isH3ReferenceTarget = isH3Target && /ref2va|reference|r2v/i.test(h3CompilerText);
            const presetDefaults = opts.presetDefaults || call('canvasAgentPromptDefaultsForPurpose', {}, purpose, Object.assign({}, opts, { presetName: presetHint }));
            const isDanbooruTarget = call('canvasAgentPromptTargetNeedsDanbooru', false, promptTarget);
            const danbooruLookupText = isDanbooruTarget
                ? await call('canvasAgentDanbooruLookupText', '', prompt, promptTarget, purpose, Object.assign({}, opts, { presetName: presetHint, presetDefaults }))
                : '';
            const rewritePrompt = [
                isH3StoryboardCell
                    ? String(opts.cellInstruction || '').trim()
                    : (isH3Target
                    ? 'Compile the user request into the exact MiniMax H3 prompt structure required by the selected preset.'
                    : (isRefine
                    ? 'Refine the user prompt into a clearer, stronger generator-ready prompt while preserving the original intent.'
                    : (isImageEdit
                    ? 'Refine the user request into a concise, high-quality image editing prompt.'
                    : (isOutpaintPurpose
                        ? 'Translate and refine the user request into a concise English FLUX outpainting prompt for seamless image-border expansion.'
                    : (isVideoPurpose
                        ? 'Refine the user request into a concise, high-quality video generation/editing prompt.'
                        : (isAudioPurpose
                            ? 'Refine the user request into a concise audio generation/editing prompt.'
                            : 'Refine the user request into a concise, high-quality image generation prompt.')))))),
                isH3StoryboardCell
                    ? 'Output only the replacement content for the selected field. Do not output a field label, quotes, markdown, explanation, or any other storyboard field.'
                    : (isH3Target
                    ? 'Output only the finished H3 prompt. Keep every section label, shot marker, timestamp, alignment line, and media label required by the H3 compiler contract.'
                    : 'Output only the final prompt text. No explanation, markdown, JSON, labels, metadata, policy notes, or internal state.'),
                !isH3StoryboardCell
                    ? 'If the request is brief or underspecified, expand it with visible subject, action/pose, setting, composition/camera, lighting, mood, and concrete visual details.'
                    : '',
                !isH3StoryboardCell
                    ? 'Do not return the unchanged original request unless it is already a detailed generator prompt.'
                    : '',
                isH3Target
                    ? (uiLanguage === 'en'
                        ? 'Write editable H3 field content in English. In every shot, keep Camera:, Dialogue and visible text:, and Synchronized sound: as separate fields.'
                        : 'H3 段落名、Shot 标记和 Camera:/Dialogue and visible text:/Synchronized sound: 标签保留英文，所有可编辑内容使用简体中文。每个 Shot 必须将画面/动作、运镜、对白/画面文字、声音分开输出。未要求对白时写“无”，未要求声音时写“静音”，运镜可根据动作合理设计。')
                    : '',
                isOutpaintPurpose
                    ? 'For FLUX outpaint, write English only. Preserve the original image content, lighting, perspective, camera angle, style, color palette, texture, and depth; describe seamless continuation beyond the current borders.'
                    : '',
                isImageEdit && assetSources.length
                    ? 'Use the attached source image as the grounding reference. Preserve the source identity, subject, pose, composition, and lighting unless the user explicitly asks to change them.'
                    : '',
                isVideoPurpose && assetSources.length
                    ? 'Use the attached visual media as the grounding reference. Preserve the source subject and continuity unless the user explicitly asks to change them.'
                    : '',
                isImageEdit && !assetSources.length
                    ? 'No source image was attached. Do not invent image-specific facts.'
                    : '',
                presetHint ? `Target preset hint: ${presetHint}` : '',
                `Target: ${call('canvasAgentPromptTargetContextLine', '', promptTarget)}`,
                call('canvasAgentPromptTargetInstruction', '', promptTarget),
                !isH3StoryboardCell && !isVideoPurpose && !isAudioPurpose && !isOutpaintPurpose
                    ? 'For natural-language image prompts, write one coherent scene prompt with subject, visible action, setting, composition/camera, lighting, and mood.'
                    : '',
                !isH3StoryboardCell && isVideoPurpose
                    ? 'For video prompts, make the motion, action progression, camera movement, and continuity explicit.'
                    : '',
                Array.isArray(presetDefaults.styles) && presetDefaults.styles.length
                    ? `Preset default styles already selected: ${presetDefaults.styles.join(', ')}. Do not omit style compatibility; keep the positive prompt compatible with these styles.`
                    : '',
                presetDefaults.negative_prompt
                    ? 'Preset default negative prompt will be submitted separately. Do not mix negative terms into the positive prompt.'
                    : '',
                isDanbooruTarget
                    ? 'For Danbooru/tag targets, use the local lookup below as authoritative. Include MANDATORY identity tags exactly when present; do not guess character or copyright tags from memory.'
                    : '',
                danbooruLookupText,
                referenceSummary ? `Reference mapping:\n${referenceSummary}` : '',
                motionTransferInstruction,
                `Purpose: ${purpose || 'text-to-image'}`,
                opts.userPrompt && String(opts.userPrompt || '').trim() && String(opts.userPrompt || '').trim() !== String(prompt || '').trim()
                    ? `Original user request: ${String(opts.userPrompt || '').trim()}`
                    : '',
                `User request: ${prompt}`
            ].filter(Boolean).join('\n');
            const rewriteRequestId = uid('vlm_rewrite');
            const response = await call('sendCanvasVlmRunRequest', null, {
                project_id: projectId(),
                node_id: isImageEdit ? 'canvas_agent_prompt_rewrite:image_edit' : 'canvas_agent_prompt_rewrite:text_to_image',
                asset_sources: assetSources,
                conversation_id: '',
                chat_messages: [],
                agent_context: call('canvasAgentVlmAgentContextPayload', {}, {
                    userPrompt: opts.userPrompt || prompt,
                    promptTarget
                }),
                params: Object.assign({
                    version: model,
                    mode: 'chat',
                    request_id: rewriteRequestId,
                    prompt: rewritePrompt,
                    system_prompt: isH3StoryboardCell
                        ? (uiLanguage === 'en'
                            ? 'You edit one MiniMax H3 storyboard field at a time. Return only the replacement field content in English.'
                            : '你每次只修改 MiniMax H3 分镜表的一个格子，只输出简体中文替换内容。')
                        : (isImageEdit
                        ? 'You are a prompt refinement assistant for SimpAI Studio image editing. Use compact built-in prompt rules. Ground edits in the attached image when provided. Follow the prompt target rules in the user message.'
                        : (isOutpaintPurpose
                            ? 'You are a prompt refinement assistant for SimpAI Studio FLUX outpainting. Output English only and follow the prompt target rules in the user message.'
                        : (isVideoPurpose
                            ? 'You are a prompt refinement assistant for SimpAI Studio video generation and editing. Use compact built-in prompt rules. Follow the prompt target rules in the user message.'
                            : 'You are a prompt refinement assistant for SimpAI Studio. Use compact built-in prompt rules. Follow the prompt target rules in the user message.'))),
                    save_context: false,
                    compact_agent_prompt: true,
                    agent_use_skills: true,
                    agent_use_canvas_context: false,
                    agent_action_hints: false,
                    agent_use_danbooru_lookup: isDanbooruTarget,
                    output_chinese: uiLanguage !== 'en' && (isH3Target || isH3StoryboardCell),
                    video_frames: getSettings().videoFrames,
                    max_tokens: isH3StoryboardCell ? 256 : (isH3ReferenceTarget ? 1800 : (isH3Target ? 1200 : 384)),
                    temperature: 0.45,
                    top_p: 0.9,
                    top_k: 40,
                    repetition_penalty: 1.05,
                    seed: -1,
                    disable_thinking: true,
                    h3_visual_reference_max_side: (isH3Target || isH3StoryboardCell) ? 512 : 0,
                    free_after: false
                }, model === 'Custom' ? call('getCanvasAgentCustomRuntimeParams', {}, null) : {})
            }, {
                timeoutMs: getPromptRewriteTimeoutMs(),
                timeoutError: t('Prompt rewrite timed out. Please run with the current prompt or try again.', '提示词改写超时。请使用当前提示词运行，或稍后重试。')
            });
            if (!response?.ok || !String(response.text || '').trim()) {
                return { ok: false, error: response?.details || response?.error || t('The model returned no prompt text. Please retry or use the original prompt.', '模型没有返回提示词正文，请重试或使用原提示词。') };
            }
            let candidate = String(response.text || '').trim();
            if (!isH3StoryboardCell && promptRewriteTooWeak(prompt, candidate)) {
                candidate = localPromptRewriteFallback(prompt, promptTarget) || candidate;
            }
            return {
                ok: true,
                prompt: candidate,
                warning: String(response?.warning || '').trim(),
                runtimeParams: response?.params || null
            };
        }

        return {
            rewriteCanvasAgentPromptWithLlm,
            canvasAgentComparablePromptText: comparablePromptText,
            canvasAgentPromptRewriteTooWeak: promptRewriteTooWeak,
            canvasAgentLocalPromptRewriteFallback: localPromptRewriteFallback
        };
    }

    window.SimpAICanvasWorkbenchCanvasAgentPromptRewrite = Object.assign({}, window.SimpAICanvasWorkbenchCanvasAgentPromptRewrite || {}, {
        createCanvasAgentPromptRewriteController
    });
})();
