(function () {
    'use strict';

    function createCanvasAgentInstructionPlanner(context) {
        const scope = context || {};
        const t = scope.t || ((en, cn) => cn || en);
        const call = (name, fallback, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : fallback;
        const normalizePresetName = (...args) => call('normalizePresetName', String(args[0] || '').trim(), ...args);
        const normalizeGenerationOptions = (...args) => call('normalizeCanvasAgentGenerationOptions', {}, ...args) || {};
        const getAgentTargetNode = () => call('getCanvasAgentTargetNode', null);
        const getReferenceCounts = () => call('canvasAgentReferenceCounts', {}) || {};
        const getTargetMediaKind = (...args) => call('getCanvasAgentTargetMediaKind', '', ...args);
        const getMediaReferenceNodes = (...args) => call('getCanvasAgentMediaReferenceNodes', {}, ...args) || {};
        const mediaNodeCounts = (...args) => call('canvasAgentMediaNodeCounts', {}, ...args) || {};
        const videoTaskForMedia = (...args) => call('canvasAgentVideoTaskForMedia', 'text_to_video', ...args);
        const promptMediaIntent = (...args) => call('canvasAgentPromptMediaIntent', {}, ...args) || {};
        const isImageTarget = (...args) => !!call('isCanvasAgentImageTarget', false, ...args);
        const findInstructionOverride = (...args) => call('findCanvasAgentPresetInstructionOverride', null, ...args);
        const getPresetCatalog = () => call('getPresetCatalog', []) || [];
        const getPresetQueue = (...args) => call('getCanvasAgentPresetQueue', [], ...args) || [];
        const findCatalogEntry = (...args) => call('findPresetCatalogEntryByName', null, ...args);
        const aliasPresetNames = (...args) => call('canvasAgentInstructionAliasPresetNames', [], ...args) || [];
        const mentionsPreset = (...args) => !!call('canvasAgentPromptMentionsPreset', false, ...args);
        const readyPresetEntries = () => call('canvasAgentReadyPresetEntries', []) || [];
        const promptTargetContextLine = (...args) => call('canvasAgentPromptTargetContextLine', '', ...args);
        const promptTargetFromEntry = (...args) => call('canvasAgentPromptTargetFromEntry', {}, ...args) || {};
        const promptTargetFromPurpose = (...args) => call('canvasAgentPromptTargetFromPurpose', {}, ...args) || {};
        const referenceSummaryText = () => call('canvasAgentReferenceSummaryText', '',) || '';
        const resolutionLabel = () => call('canvasAgentResolutionLabel', '',) || '';
        const getSettings = () => call('getCanvasAgentSettings', {}) || {};
        const getProject = () => call('getProject', {}) || {};
        const getPresetMatchTokens = (...args) => call('canvasAgentPresetMatchTokens', [], ...args) || [];

        function canvasAgentEscapeRegExp(value) {
            return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }

        function JSONDecoderShim() {
            this.parseFirstObject = (source) => {
                const text = String(source || '');
                for (let index = 0; index < text.length; index += 1) {
                    if (text[index] !== '{') continue;
                    for (let end = text.length; end > index; end -= 1) {
                        if (text[end - 1] !== '}') continue;
                        try {
                            const parsed = JSON.parse(text.slice(index, end));
                            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
                        } catch (err) {}
                    }
                }
                return null;
            };
        }

        function extractCanvasAgentJsonObject(text) {
            const source = String(text || '').trim();
            if (!source) return null;
            const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/i);
            const candidates = [fenced ? fenced[1] : '', source].filter(Boolean);
            for (const candidate of candidates) {
                try {
                    const parsed = JSON.parse(candidate.trim());
                    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
                } catch (err) {}
            }
            return new JSONDecoderShim().parseFirstObject(source);
        }

        function normalizeCanvasAgentInstructionPlan(raw, fallbackPrompt, source) {
            const plan = raw && typeof raw === 'object' ? raw : {};
            const action = String(plan.action || plan.type || '').trim().toLowerCase().replace(/-/g, '_');
            const actionAliases = {
                edit_image: 'image_edit',
                i2v: 'image_to_video',
                image2video: 'image_to_video',
                multi_i2v: 'multi_image_to_video',
                multi_image2video: 'multi_image_to_video',
                text2video: 'text_to_video',
                t2v: 'text_to_video',
                edit_video: 'video_edit',
                video_extend: 'video_edit',
                extend_video: 'video_edit',
                ta2v: 'audio_to_video',
                a2v: 'audio_to_video',
                audio2video: 'audio_to_video',
                audio_image_to_video: 'image_audio_to_video',
                ia2v: 'image_audio_to_video',
                reference_to_video: 'video_audio_to_video',
                r2v: 'video_audio_to_video',
                edit_audio: 'audio_edit',
                text_to_audio: 'audio_generate',
                tts: 'audio_generate'
            };
            const normalizedAction = actionAliases[action] || action;
            const allowedAction = [
                'text_to_image', 'image_edit', 'image_to_video', 'multi_image_to_video',
                'text_to_video', 'video_edit', 'audio_to_video', 'image_audio_to_video',
                'video_audio_to_video', 'audio_edit', 'audio_generate', 'unsupported'
            ].includes(normalizedAction) ? normalizedAction : '';
            const preset = normalizePresetName(plan.preset || plan.preset_name || '');
            const prompt = String(plan.prompt || plan.image_prompt || plan.user_intent || fallbackPrompt || '').trim();
            const recommendedPrompt = String(plan.recommended_prompt || plan.rewrite_prompt || plan.rewritten_prompt || plan.final_prompt || '').trim();
            const generationOptions = normalizeGenerationOptions(plan, [fallbackPrompt, prompt, recommendedPrompt].filter(Boolean).join('\n'));
            return {
                ok: !!allowedAction && allowedAction !== 'unsupported',
                action: allowedAction || 'unsupported',
                preset,
                prompt: prompt || String(fallbackPrompt || '').trim(),
                recommendedPrompt,
                negativePrompt: generationOptions.negativePrompt,
                aspect_ratio: generationOptions.aspect,
                aspect: generationOptions.aspect,
                resolution_scale: generationOptions.resolutionScale,
                image_number: generationOptions.imageNumber,
                seed: generationOptions.seed,
                seed_random: generationOptions.seedRandom,
                steps: generationOptions.steps,
                cfg_scale: generationOptions.cfgScale,
                reason: String(plan.reason || plan.summary || '').trim(),
                confidence: String(plan.confidence || '').trim(),
                source: source || 'local'
            };
        }

        function stripCanvasAgentPresetFromPrompt(prompt, entry) {
            let text = String(prompt || '').trim();
            const names = [entry?.name, entry?.display_name].filter(Boolean);
            names.forEach((name) => {
                getPresetMatchTokens(name)
                    .sort((a, b) => b.length - a.length)
                    .forEach((token) => {
                        if (!token) return;
                        text = text.replace(new RegExp(canvasAgentEscapeRegExp(token), 'ig'), ' ');
                    });
            });
            const aliasTokens = call('canvasAgentPresetAliasTokensForEntry', [], entry) || [];
            aliasTokens
                .sort((a, b) => b.length - a.length)
                .forEach((token) => {
                    text = text.replace(new RegExp(`(^|[\\s,，。:：;；/])${canvasAgentEscapeRegExp(token)}(?=$|[\\s,，。:：;；/]|[\\u3400-\\u9fff])`, 'ig'), '$1 ');
                });
            return text
                .replace(/(?:使用|采用|指定|选择|调用|用|preset|scene|预设|模型|文生图|生成|运行)/gi, ' ')
                .replace(/\s+/g, ' ')
                .trim();
        }

        function buildCanvasAgentLocalInstructionPlan(rawPrompt, requestedAction) {
            const target = getAgentTargetNode();
            const counts = getReferenceCounts();
            const intent = promptMediaIntent(rawPrompt);
            const targetKind = getTargetMediaKind(target);
            const hasImageReferences = counts.images > 0;
            const hasVideoReferences = counts.videos > 0;
            const hasAudioReferences = counts.audio > 0;
            const primaryMedia = ['image', 'video', 'audio'].includes(targetKind) ? { [targetKind]: target } : {};
            const videoTask = videoTaskForMedia(mediaNodeCounts(getMediaReferenceNodes(primaryMedia)));
            let action = 'text_to_image';
            if (requestedAction === 'image-to-video') action = videoTask === 'text_to_video' ? 'image_to_video' : videoTask;
            else if (requestedAction === 'audio-to-video') action = 'audio_to_video';
            else if (requestedAction === 'generate-video') action = intent.wantsVideoEdit && (targetKind === 'video' || hasVideoReferences) ? 'video_edit' : videoTask;
            else if (requestedAction === 'edit-video') action = 'video_edit';
            else if (requestedAction === 'edit-audio') action = 'audio_edit';
            else if (requestedAction === 'generate-audio') action = 'audio_generate';
            else if (intent.wantsVideoEdit && (targetKind === 'video' || hasVideoReferences)) action = 'video_edit';
            else if (intent.wantsVideo) action = videoTask;
            else if ((intent.wantsAudio || targetKind === 'audio' || hasAudioReferences) && (targetKind === 'audio' || hasAudioReferences)) action = 'audio_edit';
            else if (intent.wantsAudio) action = 'audio_generate';
            else if (requestedAction === 'edit-image' || isImageTarget(target) || hasImageReferences) action = 'image_edit';
            const entry = findInstructionOverride(rawPrompt);
            const stripped = stripCanvasAgentPresetFromPrompt(rawPrompt, entry);
            return normalizeCanvasAgentInstructionPlan({
                action,
                preset: entry?.name || entry?.display_name || '',
                prompt: stripped || rawPrompt,
                reason: entry ? t('Matched preset name from user instruction.', '从用户指令中匹配到 preset 名称。') : t('Local Agent heuristic plan.', '本地 Agent 启发式计划。'),
                confidence: entry ? '0.72' : '0.45'
            }, rawPrompt, 'local_fallback');
        }

        function canvasAgentInstructionPresetCandidates(rawPrompt) {
            const catalog = getPresetCatalog();
            const byName = new Map();
            const addEntry = (entry) => {
                const name = entry?.display_name || entry?.name || '';
                const key = normalizePresetName(name);
                if (!key || byName.has(key)) return;
                byName.set(key, name);
            };
            ['t2i', 'edit', 'i2v', 't2v', 'video_edit', 'reference_to_video', 'audio_to_video', 'audio_image_to_video', 'audio'].forEach(kind => {
                getPresetQueue(kind).forEach(name => addEntry(findCatalogEntry(name) || { name }));
            });
            aliasPresetNames(rawPrompt).forEach(name => addEntry(findCatalogEntry(name) || { name }));
            catalog.forEach((entry) => {
                if (byName.size >= 24) return;
                const names = [entry.name, entry.display_name].filter(Boolean);
                if (mentionsPreset(rawPrompt, names)) addEntry(entry);
            });
            readyPresetEntries().forEach((entry) => {
                if (byName.size < 24) addEntry(entry);
            });
            catalog.forEach((entry) => {
                if (byName.size < 24 && !entry.missing) addEntry(entry);
            });
            return Array.from(byName.values()).slice(0, 24);
        }

        function canvasAgentPromptTargetRulesText() {
            return [
                'Prompt target rules:',
                '- Resolve final prompt format by selected preset, backend_engine, task_method, workflow filename, and text encoder; the actual text encoder wins over the display family name.',
                '- If the user writes 用/使用/采用/指定/选择 plus a preset name or house alias such as Z, Zimage, Klein, Krea, Flux, Wan, Bernini, or Anima, user intent wins over the default preset queues. Return the resolved catalog preset in JSON preset, remove that preset name from prompt, and format recommended_prompt for that preset.',
                '- If the selected workflow task_method ends with _cn, the target supports Chinese natural language; prefer Chinese for Chinese requests.',
                '- Z-image/Z-imageT/qwen text encoders: use natural language; prefer Chinese for Chinese requests.',
                '- Wan/umt5/_cn video targets: use natural language with visible motion, action progression, camera movement, and continuity.',
                '- FLUX.1/t5xxl targets: final prompt must be English natural language only; translate Chinese intent into English.',
                '- SDXL/SD15/Illustrious/Noob targets: use Danbooru-style English snake_case tags, comma separated.',
                '- Story illustration requests must choose one visible moment and explain who does what, where, why it is visually tense or meaningful, and how the camera sees it; do not output loose element piles except for Danbooru-tag targets.',
                '- recommended_prompt must already be the final prompt that can be submitted to the selected generator.',
                '- Do not output negative_prompt unless the user explicitly writes a separate negative/negative prompt request; preset default negatives are handled outside the planner.',
                '- JSON prompt/recommended_prompt must match any visible Prompt/提示词 text shown to the user.'
            ].join('\n');
        }

        function canvasAgentInstructionPlanPrompt(rawPrompt, requestedAction) {
            const target = getAgentTargetNode();
            const catalogNames = canvasAgentInstructionPresetCandidates(rawPrompt);
            const promptTargetLines = catalogNames
                .map(name => promptTargetContextLine(promptTargetFromEntry(findCatalogEntry(name) || { name }, requestedAction || 'generate-image')))
                .filter(Boolean)
                .slice(0, 12);
            return [
                'You are the SimpAI Canvas Agent instruction planner.',
                'Read the built-in skill docs and convert the user instruction into one executable canvas plan.',
                'Also produce one recommended prompt in the same response. This replaces a second prompt refinement call unless the user asks to regenerate.',
                'Return JSON only. Do not use markdown.',
                'Allowed JSON schema:',
                '{"action":"text_to_image|image_edit|image_to_video|multi_image_to_video|text_to_video|video_edit|audio_to_video|image_audio_to_video|video_audio_to_video|audio_edit|audio_generate|unsupported","preset":"preset name or empty","prompt":"user intent without preset name","recommended_prompt":"polished generation/edit prompt to submit","negative_prompt":null,"aspect_ratio":"auto|1:1|16:9|9:16|4:3|3:4|2:3|3:2|7:4|4:7 or null","width":null,"height":null,"resolution_scale":null,"image_number":null,"seed":null,"seed_random":null,"steps":null,"cfg_scale":null,"reason":"short reason","confidence":"0.00-1.00"}',
                canvasAgentPromptTargetRulesText(),
                'After choosing the preset/action, enforce its prompt target format before returning JSON. For FLUX/T5XXL, recommended_prompt must contain no Chinese characters. For SDXL/Danbooru, recommended_prompt must be comma-separated tags, not a paragraph.',
                'Extract generation controls from the user instruction when explicit: aspect ratio (16:9/9:16/1:1, landscape/portrait, horizontal/vertical), exact width/height when stated, requested image count, fixed seed/random seed, steps, CFG/guidance, resolution scale, and a separate negative prompt only when the user explicitly asks for negative/negative_prompt. Leave optional fields null when not requested. Do not output negative_prompt just because the selected preset has a default negative; preset defaults are submitted separately. Do not put aspect_ratio, width, height, seed, steps, CFG, resolution_scale, or negative prompt terms inside the image prompt text.',
                'Important example: user says "使用Zimage生成一张美女图片" and catalog contains "Z-imageT"; return action text_to_image, preset Z-imageT, prompt "一张美女图片", recommended_prompt as a concise high-quality image prompt.',
                'For image_edit, recommended_prompt must describe the edit while preserving source identity/composition unless the user requests a change.',
                'For video generation, classify attached media by type. Use multi_image_to_video for several images, image_audio_to_video for image plus standalone audio, and video_audio_to_video whenever one or more reference videos are attached; video_audio_to_video may also include images and standalone audio. Use video_edit only when the user explicitly asks to edit, extend, continue, replace, or remove content from a selected video. Route text-only video intent to text_to_video. Route selected audio to audio_edit only when a matching audio-capable preset is available. Route text-only audio/music/voice intent to audio_generate when the audio queue is configured; otherwise unsupported is acceptable.',
                `Requested UI action: ${requestedAction || 'generate-image'}`,
                `Selected target: ${target ? `${target.type} ${target.title || target.id}` : 'none'}`,
                `Selected media kind: ${getTargetMediaKind(target) || 'none'}`,
                `Selected image attached: ${isImageTarget(target) ? 'yes' : 'no'}`,
                `Explicit references:\n${referenceSummaryText()}`,
                `Requested resolution: ${resolutionLabel()}`,
                `Text-to-image queue: ${getPresetQueue('t2i').join(', ')}`,
                `Image-edit queue: ${getPresetQueue('edit').join(', ')}`,
                `Image-to-video queue: ${getPresetQueue('i2v').join(', ')}`,
                `Text-to-video queue: ${getPresetQueue('t2v').join(', ')}`,
                `Video-edit queue: ${getPresetQueue('video_edit').join(', ')}`,
                `Reference-to-video queue: ${getPresetQueue('reference_to_video').join(', ')}`,
                `Audio-to-video queue: ${getPresetQueue('audio_to_video').join(', ')}`,
                `Audio+image-to-video queue: ${getPresetQueue('audio_image_to_video').join(', ')}`,
                `Audio queue: ${getPresetQueue('audio').join(', ') || 'not configured'}`,
                `Relevant preset candidates: ${catalogNames.join(', ')}`,
                `Prompt target candidates:\n${promptTargetLines.join('\n') || promptTargetContextLine(promptTargetFromPurpose(requestedAction || 'generate-image', {}))}`,
                `User instruction: ${rawPrompt}`
            ].join('\n');
        }

        return {
            canvasAgentEscapeRegExp,
            extractCanvasAgentJsonObject,
            JSONDecoderShim,
            normalizeCanvasAgentInstructionPlan,
            stripCanvasAgentPresetFromPrompt,
            buildCanvasAgentLocalInstructionPlan,
            canvasAgentInstructionPresetCandidates,
            canvasAgentPromptTargetRulesText,
            canvasAgentInstructionPlanPrompt
        };
    }

    window.SimpAICanvasWorkbenchInstructionPlanner = Object.assign({}, window.SimpAICanvasWorkbenchInstructionPlanner || {}, {
        createCanvasAgentInstructionPlanner
    });
})();
