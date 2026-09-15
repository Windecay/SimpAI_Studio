(function () {
    'use strict';

    const DEFAULT_UTILS = typeof window !== 'undefined' ? window.SimpAICanvasWorkbenchUtils || {} : {};
    const escapeHtmlFallback = (value) => String(value ?? '');
    const translateFallback = (en, cn) => cn || en;
    const translateDefault = DEFAULT_UTILS.t || translateFallback;

    const MODE_TYPES = {
        voice_design: 'qwen_tts_voice_design',
        voice_clone: 'qwen_tts_voice_clone',
        custom_voice: 'qwen_tts_custom_voice',
        dialogue: 'qwen_tts_dialogue'
    };

    const TYPE_MODES = Object.fromEntries(Object.entries(MODE_TYPES).map(([mode, type]) => [type, mode]));

    const MODE_SPECS = {
        voice_design: {
            type: MODE_TYPES.voice_design,
            title: translateDefault('Qwen TTS Voice Design', 'Qwen TTS 音色设计'),
            title_en: 'Qwen TTS Voice Design',
            title_cn: 'Qwen TTS 音色设计',
            kind: 'Qwen TTS',
            icon: 'fa-microphone-lines',
            description: translateDefault('Generate speech from text and a voice/style instruction.', '根据文本和音色 / 风格指令生成语音。'),
            description_en: 'Generate speech from text and a voice/style instruction.',
            description_cn: '根据文本和音色 / 风格指令生成语音。'
        },
        voice_clone: {
            type: MODE_TYPES.voice_clone,
            title: translateDefault('Qwen TTS Voice Clone', 'Qwen TTS 音色克隆'),
            title_en: 'Qwen TTS Voice Clone',
            title_cn: 'Qwen TTS 音色克隆',
            kind: translateDefault('Qwen Clone', 'Qwen 克隆'),
            kind_en: 'Qwen Clone',
            kind_cn: 'Qwen 克隆',
            icon: 'fa-wave-square',
            description: translateDefault('Clone a reference voice and speak target text.', '克隆参考音色并朗读目标文本。'),
            description_en: 'Clone a reference voice and speak target text.',
            description_cn: '克隆参考音色并朗读目标文本。'
        },
        custom_voice: {
            type: MODE_TYPES.custom_voice,
            title: translateDefault('Qwen TTS Custom Voice', 'Qwen TTS 预设音色'),
            title_en: 'Qwen TTS Custom Voice',
            title_cn: 'Qwen TTS 预设音色',
            kind: translateDefault('Qwen Custom', 'Qwen 预设音色'),
            kind_en: 'Qwen Custom',
            kind_cn: 'Qwen 预设音色',
            icon: 'fa-user',
            description: translateDefault('Use a built-in or custom speaker for text to speech.', '使用内置或自定义说话人生成语音。'),
            description_en: 'Use a built-in or custom speaker for text to speech.',
            description_cn: '使用内置或自定义说话人生成语音。'
        },
        dialogue: {
            type: MODE_TYPES.dialogue,
            title: translateDefault('Qwen TTS Dialogue', 'Qwen TTS 多人对话'),
            title_en: 'Qwen TTS Dialogue',
            title_cn: 'Qwen TTS 多人对话',
            kind: translateDefault('Qwen Dialogue', 'Qwen 对话'),
            kind_en: 'Qwen Dialogue',
            kind_cn: 'Qwen 对话',
            icon: 'fa-comments',
            description: translateDefault('Generate scripted dialogue with optional role reference voices.', '根据脚本和可选的角色参考音色生成多人对话。'),
            description_en: 'Generate scripted dialogue with optional role reference voices.',
            description_cn: '根据脚本和可选的角色参考音色生成多人对话。'
        }
    };

    const SPEAKER_CHOICES = [
        ['Ryan', 'Ryan'],
        ['Serena', 'Serena'],
        ['Uncle Fu', 'Uncle_fu'],
        ['Vivian', 'Vivian'],
        ['Aiden', 'Aiden'],
        ['Ono Anna', 'Ono_anna'],
        ['Sohee', 'Sohee'],
        ['Dylan', 'Dylan'],
        ['Eric', 'Eric']
    ];

    const VOICE_DESIGN_STYLE_PRESETS = [
        ['Catgirl (Neko)', "Cute catgirl voice: high-pitched, bright and sweet, youthful and playful. Add occasional short interjections like 'nya', 'meow', 'na', 'ne', 'ya' (not every sentence). Expressive with subtle emotional shifts: shy -> softer, breathy, slightly shaky; tsundere -> quick pitch rise and a small 'hmph'; teary -> light sob or choked tone. Optionally add close-mic ASMR details (soft breathing, whispery delivery) while keeping articulation clear."],
        ['Warm Female', 'Female, mid-20s, warm and friendly, medium pace, clear articulation, slight smile in voice, natural breath and gentle intonation.'],
        ['News Anchor', 'Male, 30s, calm professional news anchor, steady rhythm, neutral emotion, crisp consonants, confident delivery, minimal pitch fluctuation.'],
        ['Energetic Teen', 'Young energetic teen, bright tone, fast pace, playful rising intonation, light laughter between phrases, vivid emphasis on keywords.'],
        ['Elderly Hoarse', 'Elderly male, ~70, slightly hoarse and breathy, slow pace, reflective mood, soft volume, longer pauses, subtle trembling on sustained vowels.'],
        ['Audiobook Narrator', 'Audiobook narrator, 40s, cinematic and immersive, controlled dynamics, clear phrasing, dramatic pauses, rich low-mid register, smooth resonance.']
    ];

    const VOICE_DESIGN_STYLE_PRESET_CN_NAMES = {
        'Catgirl (Neko)': '猫娘（Neko）',
        'Warm Female': '温暖女声',
        'News Anchor': '新闻主播',
        'Energetic Teen': '活力少年',
        'Elderly Hoarse': '沙哑老年男声',
        'Audiobook Narrator': '有声书旁白'
    };

    function call(context, name, fallback, ...args) {
        return typeof context?.[name] === 'function' ? context[name](...args) : fallback;
    }

    function delegate(context, name) {
        if (typeof context?.[name] !== 'function') return undefined;
        return (...args) => context[name](...args);
    }

    function createQwenTtsNodeContext(source) {
        const scope = source || {};
        const utilitySource = scope.utilitySource || {};
        const pick = (group, name) => delegate(group, name) || delegate(scope, name);
        const result = {
            escapeHtml: pick(utilitySource, 'escapeHtml'),
            t: pick(utilitySource, 't'),
            getProject: pick(scope, 'getProject'),
            uid: pick(scope, 'uid'),
            defaultNodeSize: pick(scope, 'defaultNodeSize'),
            buildQwenTtsStatePatch: pick(scope, 'buildQwenTtsStatePatch'),
            buildProjectNodeAppendPatch: pick(scope, 'buildProjectNodeAppendPatch'),
            getQwenTtsAudioInputLabel: pick(scope, 'getQwenTtsAudioInputLabel'),
            qwenTtsStylePresets: scope.qwenTtsStylePresets,
            mutate: pick(scope, 'mutate'),
            placeNodeAvoidingOverlap: pick(scope, 'placeNodeAvoidingOverlap'),
            pushHistory: pick(scope, 'pushHistory'),
            renderNodeStateBadges: pick(scope, 'renderNodeStateBadges'),
            setSelectedNode: pick(scope, 'setSelectedNode'),
            showToast: pick(scope, 'showToast')
        };
        if (typeof scope.getQwenTtsStylePresets === 'function') {
            Object.defineProperty(result, 'qwenTtsStylePresets', {
                configurable: true,
                enumerable: true,
                get: () => scope.getQwenTtsStylePresets()
            });
        }
        return result;
    }

    const DEFAULT_QWEN_TTS_NODE_CONTEXT = createQwenTtsNodeContext({
        utilitySource: {
            escapeHtml: DEFAULT_UTILS.escapeHtml || escapeHtmlFallback,
            t: DEFAULT_UTILS.t || translateFallback
        }
    });

    function contextOf(context) {
        return context || DEFAULT_QWEN_TTS_NODE_CONTEXT;
    }

    function escapeHtmlValue(context, value) {
        const ctx = contextOf(context);
        return call(ctx, 'escapeHtml', escapeHtmlFallback(value), value);
    }

    function translateValue(context, en, cn) {
        const ctx = contextOf(context);
        return call(ctx, 't', translateFallback(en, cn), en, cn);
    }

    function getProject(context) {
        const project = typeof context?.getProject === 'function' ? context.getProject() : null;
        return project && typeof project === 'object' ? project : { nodes: [] };
    }

    function appendProjectNode(project, node, context) {
        const patch = call(context, 'buildProjectNodeAppendPatch', null, project, node);
        if (patch && typeof patch === 'object' && Array.isArray(patch.nodes)) {
            Object.assign(project, patch);
            return;
        }
        const nodes = Array.isArray(project?.nodes) ? project.nodes.slice() : [];
        if (node && typeof node === 'object') nodes.push(node);
        Object.assign(project, { nodes });
    }

    function modeFromNode(node) {
        return node?.qwen_tts_mode || TYPE_MODES[node?.type] || 'voice_design';
    }

    function specForMode(mode, context) {
        const spec = MODE_SPECS[mode] || MODE_SPECS.voice_design;
        const ctx = contextOf(context);
        return Object.assign({}, spec, {
            title: spec.title_en ? translateValue(ctx, spec.title_en, spec.title_cn) : spec.title,
            kind: spec.kind_en ? translateValue(ctx, spec.kind_en, spec.kind_cn) : spec.kind,
            description: spec.description_en ? translateValue(ctx, spec.description_en, spec.description_cn) : spec.description
        });
    }

    function commonParams() {
        return {
            model_choice: '1.7B',
            precision: 'bf16',
            device: 'auto',
            language: 'Auto',
            attention: 'auto',
            seed_random: true,
            seed: 0,
            max_new_tokens: 4096,
            split_max_chars: 200,
            split_hard_max_chars: 260,
            top_p: 0.8,
            top_k: 20,
            temperature: 1.0,
            repetition_penalty: 1.05,
            unload_model_after_generate: true,
            decode_batch_size: 2,
            batch_size: 4
        };
    }

    function modeDefaults(mode) {
        if (mode === 'voice_clone') {
            return {
                ref_text: '',
                target_text: '',
                x_vector_only: false,
                batch_size: 16
            };
        }
        if (mode === 'custom_voice') {
            return {
                text: '',
                speaker: 'Ryan',
                custom_speaker_name: '',
                instruct: '',
                batch_size: 16
            };
        }
        if (mode === 'dialogue') {
            return {
                script: '',
                role_1_name: '',
                role_1_ref_text: '',
                role_2_name: '',
                role_2_ref_text: '',
                role_3_name: '',
                role_3_ref_text: '',
                role_4_name: '',
                role_4_ref_text: '',
                pause_linebreak: 0.5,
                period_pause: 0.4,
                comma_pause: 0.2,
                question_pause: 0.6,
                hyphen_pause: 0.3,
                merge_outputs: true,
                batch_size: 4,
                max_new_tokens_per_line: 4096
            };
        }
        return {
            text: '',
            style_preset: '',
            instruct: '',
            lock_timbre_with_first_segment: true,
            clone_batch_size: 16
        };
    }

    function defaultParams(mode) {
        return Object.assign(commonParams(), modeDefaults(mode));
    }

    function normalizeStylePresetEntries(entries) {
        const rows = [];
        const seen = new Set();
        const add = (name, instruction, source) => {
            const key = String(name || '').trim();
            const text = String(instruction || '').trim();
            if (!key || !text || seen.has(key)) return;
            seen.add(key);
            rows.push({ name: key, instruction: text, source: source || 'builtin' });
        };
        if (Array.isArray(entries)) {
            entries.forEach((entry) => {
                if (Array.isArray(entry)) add(entry[0], entry[1], entry[2]);
                else if (entry && typeof entry === 'object') add(entry.name || entry.label || entry.key, entry.instruction || entry.value || entry.text, entry.source);
            });
        }
        return rows;
    }

    function stylePresetEntries(context) {
        const fallback = normalizeStylePresetEntries(VOICE_DESIGN_STYLE_PRESETS);
        const remote = normalizeStylePresetEntries(context?.qwenTtsStylePresets);
        if (!remote.length) return fallback;
        return remote;
    }

    function stylePresetChoices(context) {
        const ctx = contextOf(context);
        return [[translateValue(ctx, 'Select...', '请选择...'), '']].concat(stylePresetEntries(ctx).map(item => {
            const suffix = item.source === 'user' ? ' *' : '';
            const label = item.source === 'builtin'
                ? translateValue(ctx, item.name, VOICE_DESIGN_STYLE_PRESET_CN_NAMES[item.name] || item.name)
                : item.name;
            return [`${label}${suffix}`, item.name];
        }));
    }

    function stylePresetInstruction(name, context) {
        const key = String(name || '').trim();
        if (!key) return '';
        const found = stylePresetEntries(context).find(item => item.name === key);
        return found ? found.instruction : '';
    }

    function audioInputSlots(mode, context) {
        const ctx = contextOf(context);
        if (mode === 'voice_clone') {
            return [{ key: 'ref_audio', label: translateValue(ctx, 'Reference Audio', '参考音频') }];
        }
        if (mode === 'dialogue') {
            return [1, 2, 3, 4].map(index => ({
                key: `role_${index}_audio`,
                label: translateValue(ctx, `Role ${index} Audio`, `角色 ${index} 音频`)
            }));
        }
        return [];
    }

    function isNode(node) {
        return !!(node && TYPE_MODES[node.type]);
    }

    function isRunning(node) {
        return ['queued', 'running', 'waiting', 'cancelling'].includes(String(node?.status?.state || node?.status || '').toLowerCase());
    }

    function inputLabel(context, node, slot) {
        const ctx = contextOf(context);
        return call(ctx, 'getQwenTtsAudioInputLabel', translateValue(ctx, 'Not connected', '未连接'), node, slot);
    }

    function renderAudioInputRow(node, slot, context) {
        const ctx = contextOf(context);
        return `
<div class="sai-text-input-row" data-qwen-tts-audio-row="${escapeHtmlValue(ctx, slot.key)}">
  <button type="button" class="sai-node-handle sai-node-handle-in" data-qwen-tts-audio-in="${escapeHtmlValue(ctx, slot.key)}" title="${escapeHtmlValue(ctx, slot.label)}"></button>
  <i class="fa-solid fa-wave-square"></i><span>${escapeHtmlValue(ctx, slot.label)}</span><b>${escapeHtmlValue(ctx, inputLabel(ctx, node, slot.key))}</b><small>${escapeHtmlValue(ctx, translateValue(ctx, 'Drag audio here', '拖入音频'))}</small>
</div>`;
    }

    function optionHtml(options, value, context) {
        return options.map(item => {
            const val = Array.isArray(item) ? item[1] : item;
            const label = Array.isArray(item) ? item[0] : item;
            return `<option value="${escapeHtmlValue(context, val)}" ${String(val) === String(value) ? 'selected' : ''}>${escapeHtmlValue(context, label)}</option>`;
        }).join('');
    }

    function field(key, label, value, attrs, context) {
        return `<label class="sai-node-field"><span>${escapeHtmlValue(context, label)}</span><input data-node-param="${escapeHtmlValue(context, key)}" value="${escapeHtmlValue(context, value ?? '')}" ${attrs || ''}></label>`;
    }

    function textarea(key, label, value, rows, placeholder, context) {
        return `<label class="sai-node-field sai-text-node-field"><span>${escapeHtmlValue(context, label)}</span><textarea data-node-param="${escapeHtmlValue(context, key)}" rows="${Number(rows || 3)}" placeholder="${escapeHtmlValue(context, placeholder || '')}">${escapeHtmlValue(context, value || '')}</textarea></label>`;
    }

    function check(key, label, checked, context) {
        return `<label class="sai-node-check"><input data-node-param="${escapeHtmlValue(context, key)}" type="checkbox" ${checked ? 'checked' : ''}><span>${escapeHtmlValue(context, label)}</span></label>`;
    }

    function numberField(key, label, value, min, max, step, context) {
        const bits = [
            `type="number"`,
            min !== undefined ? `min="${escapeHtmlValue(context, min)}"` : '',
            max !== undefined ? `max="${escapeHtmlValue(context, max)}"` : '',
            step !== undefined ? `step="${escapeHtmlValue(context, step)}"` : ''
        ].filter(Boolean).join(' ');
        return field(key, label, value, bits, context);
    }

    function selectField(key, label, choices, value, context) {
        return `<label class="sai-node-field"><span>${escapeHtmlValue(context, label)}</span><select data-node-param="${escapeHtmlValue(context, key)}">${optionHtml(choices, value, context)}</select></label>`;
    }

    function commonControls(params, compact, context) {
        const ctx = contextOf(context);
        const advanced = compact ? '' : `
<div class="sai-node-field-row">
  ${numberField('split_max_chars', translateValue(ctx, 'Split Max', '分段字数'), params.split_max_chars ?? 200, 20, 600, 10, ctx)}
  ${numberField('split_hard_max_chars', translateValue(ctx, 'Split Hard', '分段上限'), params.split_hard_max_chars ?? 260, 20, 800, 10, ctx)}
</div>
<div class="sai-node-field-row">
  ${numberField('top_p', 'Top P', params.top_p ?? 0.8, 0, 1, 0.05, ctx)}
  ${numberField('top_k', 'Top K', params.top_k ?? 20, 0, 100, 1, ctx)}
</div>
<div class="sai-node-field-row">
  ${numberField('temperature', translateValue(ctx, 'Temp', '温度'), params.temperature ?? 1.0, 0.1, 2, 0.1, ctx)}
  ${numberField('repetition_penalty', translateValue(ctx, 'Repeat', '重复惩罚'), params.repetition_penalty ?? 1.05, 1, 2, 0.05, ctx)}
</div>`;
        return `
<div class="sai-node-field-row">
  ${selectField('model_choice', translateValue(ctx, 'Model', '模型'), ['0.6B', '1.7B'], params.model_choice || '1.7B', ctx)}
  ${selectField('language', translateValue(ctx, 'Language', '语言'), [[translateValue(ctx, 'Auto', '自动'), 'Auto'], [translateValue(ctx, 'Chinese', '中文'), 'Chinese'], [translateValue(ctx, 'English', '英语'), 'English'], [translateValue(ctx, 'Japanese', '日语'), 'Japanese'], [translateValue(ctx, 'Korean', '韩语'), 'Korean']], params.language || 'Auto', ctx)}
</div>
<div class="sai-node-field-row">
  ${selectField('precision', translateValue(ctx, 'Precision', '精度'), ['bf16', 'fp32'], params.precision || 'bf16', ctx)}
  ${selectField('device', translateValue(ctx, 'Device', '设备'), ['auto', 'cuda', 'mps', 'cpu'], params.device || 'auto', ctx)}
</div>
<div class="sai-node-field-row">
  ${check('seed_random', translateValue(ctx, 'Random Seed', '随机种子'), params.seed_random !== false, ctx)}
  ${params.seed_random === false ? numberField('seed', translateValue(ctx, 'Seed', '种子'), params.seed ?? 0, 0, 2147483647, 1, ctx) : ''}
</div>
<div class="sai-node-field-row">
  ${numberField('max_new_tokens', translateValue(ctx, 'Max Tokens', '最大 Token 数'), params.max_new_tokens ?? 4096, 512, 16384, 256, ctx)}
  ${numberField('decode_batch_size', translateValue(ctx, 'Decode BS', '解码批量'), params.decode_batch_size ?? 2, 1, 16, 1, ctx)}
</div>
${advanced}
${check('unload_model_after_generate', translateValue(ctx, 'Unload After Run', '完成后卸载模型'), params.unload_model_after_generate !== false, ctx)}`;
    }

    function modeControls(mode, params, context) {
        const ctx = contextOf(context);
        if (mode === 'voice_clone') {
            return `
${textarea('ref_text', translateValue(ctx, 'Reference Text', '参考文本'), params.ref_text || '', 2, translateValue(ctx, 'Optional transcript of the reference audio', '可选：参考音频对应的文本'), ctx)}
${textarea('target_text', translateValue(ctx, 'Target Text', '目标文本'), params.target_text || '', 4, translateValue(ctx, 'Text to speak with the cloned voice', '使用克隆音色朗读的文本'), ctx)}
<div class="sai-node-field-row">
  ${numberField('batch_size', translateValue(ctx, 'Batch Size', '批量大小'), params.batch_size ?? 4, 1, 16, 1, ctx)}
  ${check('x_vector_only', translateValue(ctx, 'XVector Only', '仅使用 XVector'), !!params.x_vector_only, ctx)}
</div>`;
        }
        if (mode === 'custom_voice') {
            return `
${textarea('text', translateValue(ctx, 'Text to Speech', '待朗读文本'), params.text || '', 4, translateValue(ctx, 'Text to speak', '输入待朗读文本'), ctx)}
<div class="sai-node-field-row">
  ${selectField('speaker', translateValue(ctx, 'Speaker', '说话人'), SPEAKER_CHOICES, params.speaker || 'Ryan', ctx)}
  ${field('custom_speaker_name', translateValue(ctx, 'Custom Speaker', '自定义说话人'), params.custom_speaker_name || '', '', ctx)}
</div>
${textarea('instruct', translateValue(ctx, 'Style Instruction', '风格指令'), params.instruct || '', 3, translateValue(ctx, 'Optional style / character instruction', '可选：风格或角色指令'), ctx)}
${numberField('batch_size', translateValue(ctx, 'Batch Size', '批量大小'), params.batch_size ?? 4, 1, 16, 1, ctx)}`;
        }
        if (mode === 'dialogue') {
            const roleFields = [1, 2, 3, 4].map(index => `
<div class="sai-node-field-row">
  ${field(`role_${index}_name`, translateValue(ctx, `Role ${index}`, `角色 ${index}`), params[`role_${index}_name`] || '', '', ctx)}
  ${field(`role_${index}_ref_text`, translateValue(ctx, `Role ${index} Ref`, `角色 ${index} 参考文本`), params[`role_${index}_ref_text`] || '', '', ctx)}
</div>`).join('');
            return `
${textarea('script', translateValue(ctx, 'Script', '对话脚本'), params.script || '', 6, translateValue(ctx, 'Role: line of dialogue', '角色名：对话内容'), ctx)}
${roleFields}
<div class="sai-node-field-row">
  ${numberField('pause_linebreak', translateValue(ctx, 'Line Gap', '换行停顿'), params.pause_linebreak ?? 0.5, 0, 5, 0.1, ctx)}
  ${numberField('period_pause', translateValue(ctx, 'Period Gap', '句号停顿'), params.period_pause ?? 0.4, 0, 5, 0.1, ctx)}
</div>
<div class="sai-node-field-row">
  ${numberField('comma_pause', translateValue(ctx, 'Comma Gap', '逗号停顿'), params.comma_pause ?? 0.2, 0, 5, 0.1, ctx)}
  ${numberField('question_pause', translateValue(ctx, 'Question Gap', '问号停顿'), params.question_pause ?? 0.6, 0, 5, 0.1, ctx)}
</div>
<div class="sai-node-field-row">
  ${numberField('batch_size', translateValue(ctx, 'Batch Size', '批量大小'), params.batch_size ?? 4, 1, 16, 1, ctx)}
  ${numberField('max_new_tokens_per_line', translateValue(ctx, 'Tokens/Line', '每行 Token 数'), params.max_new_tokens_per_line ?? 4096, 512, 16384, 256, ctx)}
</div>
${check('merge_outputs', translateValue(ctx, 'Merge Outputs', '合并输出'), params.merge_outputs !== false, ctx)}`;
        }
        return `
${textarea('text', translateValue(ctx, 'Text to Speech', '待朗读文本'), params.text || '', 4, translateValue(ctx, 'Text to speak', '输入待朗读文本'), ctx)}
${selectField('style_preset', translateValue(ctx, 'Character Preset', '角色预设'), stylePresetChoices(ctx), params.style_preset || '', ctx)}
${textarea('instruct', translateValue(ctx, 'Voice / Style Instruction', '音色 / 风格指令'), params.instruct || '', 3, translateValue(ctx, 'Voice, timbre, emotion, accent...', '声音、音色、情绪、口音...'), ctx)}
<div class="sai-node-field-row">
  ${numberField('clone_batch_size', translateValue(ctx, 'Batch Size', '批量大小'), params.clone_batch_size ?? 16, 1, 16, 1, ctx)}
  ${check('lock_timbre_with_first_segment', translateValue(ctx, 'Lock Timbre', '锁定音色'), !!params.lock_timbre_with_first_segment, ctx)}
</div>`;
    }

    function renderNodeHtml(node, context) {
        const ctx = contextOf(context);
        const mode = modeFromNode(node);
        const spec = specForMode(mode, ctx);
        const params = Object.assign(defaultParams(mode), node.params || {});
        const running = isRunning(node);
        const status = typeof node.status === 'string' ? node.status : (node.status?.message || '');
        const inputs = audioInputSlots(mode, ctx).map(slot => renderAudioInputRow(node, slot, ctx)).join('');
        return `
<div class="sai-node-head">
  <span class="sai-node-kind">${escapeHtmlValue(ctx, spec.kind)}</span>
  <span class="sai-node-title">${escapeHtmlValue(ctx, node.title || spec.title)}</span>
  ${call(ctx, 'renderNodeStateBadges', '', node)}
  <button type="button" data-node-action="run-qwen-tts" title="${escapeHtmlValue(ctx, translateValue(ctx, 'Run Qwen TTS', '运行 Qwen TTS'))}" ${running ? 'disabled' : ''}><i class="fa-solid fa-play"></i></button>
  <button type="button" data-node-action="delete" title="${escapeHtmlValue(ctx, translateValue(ctx, 'Delete', '删除'))}"><i class="fa-solid fa-xmark"></i></button>
</div>
${inputs}
${modeControls(mode, params, ctx)}
${commonControls(params, true, ctx)}
${status ? `<div class="sai-node-foot">${escapeHtmlValue(ctx, status)}</div>` : ''}
<button type="button" class="sai-node-primary" data-node-action="run-qwen-tts" ${running ? 'disabled' : ''}><i class="fa-solid fa-play"></i><span>${escapeHtmlValue(ctx, translateValue(ctx, 'Generate Audio', '生成音频'))}</span></button>
<button type="button" class="sai-node-handle sai-node-handle-out" data-handle-out="audio" title="${escapeHtmlValue(ctx, translateValue(ctx, 'Audio output', '音频输出'))}"></button>`;
    }

    function renderInspector(node, context) {
        const ctx = contextOf(context);
        const mode = modeFromNode(node);
        const spec = specForMode(mode, ctx);
        const params = Object.assign(defaultParams(mode), node.params || {});
        const inputs = audioInputSlots(mode, ctx).map(slot => {
            return `<div class="sai-inspector-kv"><span>${escapeHtmlValue(ctx, slot.label)}</span><b>${escapeHtmlValue(ctx, inputLabel(ctx, node, slot.key))}</b></div>`;
        }).join('');
        return `
<div class="sai-inspector-section">
  <h3>${escapeHtmlValue(ctx, spec.title)}</h3>
  <label>${escapeHtmlValue(ctx, translateValue(ctx, 'Title', '标题'))}<input data-inspector-node-field="title" value="${escapeHtmlValue(ctx, node.title || '')}"></label>
  <div class="sai-inspector-kv"><span>${escapeHtmlValue(ctx, translateValue(ctx, 'Mode', '模式'))}</span><b>${escapeHtmlValue(ctx, spec.kind)}</b></div>
  ${inputs}
  <p>${escapeHtmlValue(ctx, spec.description)}</p>
</div>
<div class="sai-inspector-section">
  <h3>${escapeHtmlValue(ctx, translateValue(ctx, 'Mode', '模式'))}</h3>
  ${modeControls(mode, params, ctx).replaceAll('data-node-param=', 'data-inspector-param=')}
</div>
<div class="sai-inspector-section">
  <h3>${escapeHtmlValue(ctx, translateValue(ctx, 'Generation', '生成参数'))}</h3>
  ${commonControls(params, false, ctx).replaceAll('data-node-param=', 'data-inspector-param=')}
</div>
<div class="sai-inspector-actions">
  <button type="button" data-inspector-action="run-qwen-tts"><i class="fa-solid fa-play"></i><span>${escapeHtmlValue(ctx, translateValue(ctx, 'Run', '运行'))}</span></button>
  ${isRunning(node) ? `<button type="button" data-inspector-action="stop-qwen-tts" class="danger"><i class="fa-solid fa-stop"></i><span>${escapeHtmlValue(ctx, translateValue(ctx, 'Stop', '停止'))}</span></button>` : ''}
  <button type="button" data-inspector-action="duplicate"><i class="fa-solid fa-copy"></i><span>${escapeHtmlValue(ctx, translateValue(ctx, 'Duplicate', '复制'))}</span></button>
  <button type="button" data-inspector-action="delete" class="danger"><i class="fa-solid fa-trash"></i><span>${escapeHtmlValue(ctx, translateValue(ctx, 'Delete', '删除'))}</span></button>
</div>`;
    }

    function createNode(mode, world, options, context) {
        const ctx = contextOf(context);
        const normalizedMode = MODE_SPECS[mode] ? mode : 'voice_design';
        const spec = specForMode(normalizedMode, ctx);
        const opts = options || {};
        if (opts.history !== false) call(ctx, 'pushHistory', null, translateValue(ctx, `Add ${spec.title} node`, `添加 ${spec.title} 节点`));
        const size = call(ctx, 'defaultNodeSize', { w: 360, h: normalizedMode === 'dialogue' ? 660 : 560 }, spec.type);
        const fallbackState = {
            params: Object.assign(defaultParams(normalizedMode), opts.params || {}),
            audio_inputs: Object.assign({}, opts.audio_inputs || {}),
            source: { kind: 'qwen_tts', mode: normalizedMode, module: 'enhanced.webui_qwen_tts' },
            status: {
                state: 'idle',
                message: spec.description
            }
        };
        const node = {
            id: call(ctx, 'uid', 'qwentts-node', 'qwentts'),
            type: spec.type,
            qwen_tts_mode: normalizedMode,
            x: world.x,
            y: world.y,
            w: size.w,
            h: size.h,
            title: opts.title || spec.title,
            ...fallbackState
        };
        Object.assign(node, call(ctx, 'buildQwenTtsStatePatch', fallbackState, node, {
            defaultParams: defaultParams(normalizedMode),
            initialParams: opts.params,
            initialAudioInputs: opts.audio_inputs,
            initialSource: fallbackState.source,
            status: fallbackState.status
        }));
        call(ctx, 'placeNodeAvoidingOverlap', null, node, world);
        const project = getProject(ctx);
        appendProjectNode(project, node, ctx);
        call(ctx, 'setSelectedNode', null, node.id);
        if (opts.render !== false) call(ctx, 'mutate', null);
        if (opts.toast !== false) call(ctx, 'showToast', null, translateValue(ctx, `${spec.title} node added`, `已添加 ${spec.title} 节点`));
        return node;
    }

    window.SimpAICanvasWorkbenchQwenTtsNode = {
        createQwenTtsNodeContext,
        MODE_SPECS,
        MODE_TYPES,
        TYPE_MODES,
        audioInputSlots,
        createNode,
        defaultParams,
        isNode,
        modeFromNode,
        stylePresetInstruction,
        renderInspector,
        renderNodeHtml
    };
})();
