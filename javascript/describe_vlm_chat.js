(function () {
    'use strict';

    const UTILS = window.SimpAICanvasWorkbenchUtils || {};
    const t = UTILS.t || ((en, cn) => cn || en);
    const escapeHtml = UTILS.escapeHtml || ((value) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;'));
    const getUiLang = UTILS.getUiLang || (() => 'en');

    const MAX_ATTACHMENTS = 5;
    const MAX_VIDEO_ATTACHMENT_BYTES = 80 * 1024 * 1024;
    const IMAGE_MESSAGE_PREVIEW_MAX_SIDE = 256;
    const IMAGE_PRIMARY_MAX_SIDE = 1280;
    const IMAGE_FALLBACK_MAX_SIDE = 1024;
    const IMAGE_TARGET_BYTES = 800 * 1024;
    const MAX_RUNTIME_IMAGE_DATA_URL_LENGTH = 4 * 1024 * 1024;
    const MAX_RUNTIME_IMAGE_THUMB_LENGTH = 512 * 1024;
    const MAX_ROLEPLAY_REFERENCE_IMAGES = 5;
    const MAX_ROLEPLAY_STATE_IMAGE_HISTORY = 30;
    const MAX_ROLEPLAY_CHARACTERS = 20;
    const MAX_ROLEPLAY_STATE_TEXT = 4000;
    const MAX_ROLEPLAY_STATE_FIELDS = 40;
    const MAX_ROLEPLAY_STATE_FIELD_LABEL = 120;
    const MAX_ROLEPLAY_STATE_FIELD_VALUE = 500;
    const MAX_ROLEPLAY_REFERENCE_BYTES = 80 * 1024 * 1024;
    const IMAGE_COMPRESSION_CANDIDATES = [
        { maxSide: IMAGE_PRIMARY_MAX_SIDE, quality: 0.85 },
        { maxSide: IMAGE_PRIMARY_MAX_SIDE, quality: 0.80 },
        { maxSide: IMAGE_FALLBACK_MAX_SIDE, quality: 0.85 },
        { maxSide: IMAGE_FALLBACK_MAX_SIDE, quality: 0.80 },
        { maxSide: IMAGE_FALLBACK_MAX_SIDE, quality: 0.74 },
        { maxSide: IMAGE_FALLBACK_MAX_SIDE, quality: 0.68 },
    ];
    const MAX_HISTORY_TURNS = 18;
    const HISTORY_BUDGET = 6200;
    const FULL_HISTORY_BUDGET = 9000;
    const CHAT_MAX_TOKENS_MIN = 64;
    const CHAT_MAX_TOKENS_MAX = 8192;
    const CHAT_MAX_TOKEN_CHOICES = Object.freeze([256, 512, 1024, 2048, 3072, 4096, 8192]);
    const VLM_N_CTX_MIN = 512;
    const VLM_N_CTX_MAX = 131072;
    const VLM_N_CTX_STEP = 512;
    const VLM_VRAM_POLICY_CHOICES = Object.freeze([
        { value: 'relaxed', label: ['Relaxed', '宽松'] },
        { value: 'standard', label: ['Standard', '标准'] },
        { value: 'extreme', label: ['Extreme', '极限'] }
    ]);
    const VLM_KV_CACHE_TYPE_CHOICES = Object.freeze([
        { value: 'f16', label: ['FP16', 'FP16'] },
        { value: 'q8_0', label: ['Q8_0', 'Q8_0'] }
    ]);
    const DESCRIBE_VLM_MODEL_CHOICES = [
        'Qwen3.5-9B-abliterated-Q4_K_M',
        'Qwen3.5-9B-abliterated-Q6_K',
        'Qwen3.5-9B-abliterated-Q8_0',
        'Gemma4-12B-it-heretic-Q4_K_XL',
        'Qwen3VL-4B-TextEncoder'
    ];
    const ONE_PIXEL_IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';
    const SETTINGS_STORAGE_KEY = 'simpai.describeVlmChat.settings.v1';
    const CONVERSATIONS_STORAGE_KEY = 'simpai.describeVlmChat.conversations.v2';
    const CONVERSATION_SCHEMA = 'simpai.describeVlmChat.conversation';
    const CONVERSATION_VERSION = 8;
    const CONVERSATIONS_SCHEMA = 'simpai.describeVlmChat.conversations';
    const CONVERSATIONS_VERSION = 2;
    const MAX_SAVED_CONVERSATIONS = 24;
    const MAX_CONVERSATIONS_STORAGE_LENGTH = 3500000;
    const SYSTEM_PROMPT_TEMPLATE_ENDPOINT = '/vlm-system-prompt-templates';
    const USER_SYSTEM_PROMPT_TEMPLATE_SAVE_ENDPOINT = '/vlm-user-system-prompt-templates/save';
    const USER_SYSTEM_PROMPT_TEMPLATE_DELETE_ENDPOINT = '/vlm-user-system-prompt-templates/delete';
    const USER_SYSTEM_PROMPT_SEPARATOR = '\n\n--- User-level system prompt / 用户级系统提示词 ---\n\n';
    const NO_SYSTEM_PROMPT_PICKER_VALUE = '__builtin_none__';
    const MAX_PERSISTED_MESSAGES = 80;
    const MAX_PERSISTED_TEXT = 12000;
    const MAX_PERSISTED_THUMB_LENGTH = 80000;
    const MAX_PERSISTED_THUMB_TOTAL = 480000;
    const MAX_ROLEPLAY_BRANCHES = 16;
    const MAX_ROLEPLAY_BRANCH_MESSAGES = 80;
    const CREATIVE_DEFAULT_PRESET = 'Z-imageT';
    const CREATIVE_POLL_INTERVAL_MS = 900;
    const CREATIVE_TERMINAL_STATES = new Set(['finished', 'failed', 'canceled', 'skipped', 'skipped_queue_limit', 'stale_branch']);
    const CREATIVE_ACTIVE_STATES = new Set(['preparing', 'checking_models', 'queued', 'running', 'cancelling', 'skipping']);
    const ROLEPLAY_VISUAL_RUNNING_LIMIT = 1;
    const ROLEPLAY_VISUAL_WAITING_LIMIT = 2;
    const CREATIVE_IMAGE_TASKS = new Set([
        'text_to_image', 'image_edit', 'multi_image_edit', 'image_upscale', 'image_restore', 'image_detail_enhance',
        'image_background_removal', 'image_object_removal', 'image_outpaint', 'image_relight',
        'image_style_transfer', 'image_face_swap', 'image_pose_transfer', 'image_pose_extraction',
        'image_anime_to_real', 'image_view_synthesis', 'image_depth_estimation',
        'image_object_transfer', 'image_expression_transfer'
    ]);
    const CREATIVE_VIDEO_TASKS = new Set(['text_to_video', 'image_to_video', 'multi_image_to_video']);
    const CREATIVE_MANUAL_OUTPUT_TASKS = new Set([
        'text_to_image', 'image_edit', 'multi_image_edit',
        'text_to_video', 'image_to_video', 'multi_image_to_video'
    ]);
    const CREATIVE_GENERATION_TASKS = new Set([...CREATIVE_IMAGE_TASKS, ...CREATIVE_VIDEO_TASKS]);
    const CREATIVE_TEXT_TASKS = new Set(['text_to_image', 'text_to_video']);
    const CREATIVE_IMAGE_INPUT_TASKS = new Set([...CREATIVE_GENERATION_TASKS].filter((task) => !CREATIVE_TEXT_TASKS.has(task)));
    const CREATIVE_MULTI_IMAGE_TASKS = new Set([
        'multi_image_edit', 'image_style_transfer', 'image_face_swap', 'image_pose_transfer',
        'image_object_transfer', 'image_expression_transfer', 'multi_image_to_video'
    ]);
    const CREATIVE_TASK_ALIASES = {
        t2i: 'text_to_image',
        text2image: 'text_to_image',
        edit: 'image_edit',
        image_to_image: 'image_edit',
        multi_edit: 'multi_image_edit',
        upscale: 'image_upscale',
        super_resolution: 'image_upscale',
        restore: 'image_restore',
        detail_enhance: 'image_detail_enhance',
        enhance_details: 'image_detail_enhance',
        remove_background: 'image_background_removal',
        background_removal: 'image_background_removal',
        remove_object: 'image_object_removal',
        object_removal: 'image_object_removal',
        outpaint: 'image_outpaint',
        relight: 'image_relight',
        style_transfer: 'image_style_transfer',
        face_swap: 'image_face_swap',
        pose_transfer: 'image_pose_transfer',
        pose_extraction: 'image_pose_extraction',
        anime_to_real: 'image_anime_to_real',
        view_synthesis: 'image_view_synthesis',
        depth_estimation: 'image_depth_estimation',
        feature_transfer: 'image_object_transfer',
        object_transfer: 'image_object_transfer',
        image_feature_transfer: 'image_object_transfer',
        expression_transfer: 'image_expression_transfer',
        t2v: 'text_to_video',
        text2video: 'text_to_video',
        generate_video: 'text_to_video',
        i2v: 'image_to_video',
        image2video: 'image_to_video',
        reference_to_video: 'multi_image_to_video',
        ref_to_video: 'multi_image_to_video',
        r2v: 'multi_image_to_video',
        reference_to_image: 'image_edit',
        ref_to_image: 'image_edit',
        r2i: 'image_edit',
        multi_i2v: 'multi_image_to_video'
    };

    function normalizeCreativePreference(value) {
        const source = value && typeof value === 'object' ? value : {};
        const allowedStyles = new Set(['anime', 'realistic', 'auto', 'custom']);
        const style = allowedStyles.has(String(source.style || '').trim().toLowerCase())
            ? String(source.style || '').trim().toLowerCase()
            : '';
        const preset = String(source.preset || '').trim().replace(/\.json$/i, '').slice(0, 200);
        const parameterProfile = String(source.parameter_profile || source.parameterProfile || '').trim().slice(0, 200);
        return {
            prompted: !!source.prompted,
            style,
            preset,
            parameter_profile: parameterProfile,
            auto_generate: !!source.auto_generate,
            source: String(source.source || '').trim().slice(0, 80),
            updated_at: String(source.updated_at || '').trim().slice(0, 80)
        };
    }

    function normalizeCreativeInitiative(value) {
        const source = value && typeof value === 'object' ? value : {};
        const mode = String(source.mode || 'proactive').trim().toLowerCase() === 'responsive'
            ? 'responsive'
            : 'proactive';
        return {
            mode,
            turn_index: Math.max(0, Math.round(Number(source.turn_index) || 0)),
            last_offer_turn: Math.max(0, Math.round(Number(source.last_offer_turn) || 0)),
            last_scene_key: String(source.last_scene_key || '').trim().toLowerCase().slice(0, 160)
        };
    }

    function normalizeChatMode(value) {
        const mode = String(value || '').trim().toLowerCase().replace(/-/g, '_');
        if (['roleplay', 'role_play', 'rp', 'autoplay', 'spectator'].includes(mode)) return 'roleplay';
        if (mode === 'creative' || mode === 'create' || mode === 'creation' || mode === 'creative_mode') return 'creative';
        if (mode === 'prompt' || mode === 'prompt_assistant' || mode === 'assistant') return 'prompt';
        if (mode === 'guide' || mode === 'guide_mode' || mode === 'wizard' || mode === 'ui_guide') return 'guide';
        if (mode === 'raw' || mode === 'raw_model') return 'raw';
        return 'chat';
    }

    const ROLEPLAY_AGENT_ROLES = ['character_reply', 'player_proxy', 'director_state'];

    function normalizeRoleplayAgentRouting(value) {
        const source = value && typeof value === 'object' ? value : {};
        const sourceProfiles = source.profiles && typeof source.profiles === 'object' ? source.profiles : {};
        const profile = (id, type, fallback = {}) => {
            const raw = sourceProfiles[id] && typeof sourceProfiles[id] === 'object' ? sourceProfiles[id] : {};
            return Object.assign({
                id,
                type,
                name: type === 'api' ? 'API' : 'Local',
                version: '',
                provider: 'custom',
                api_format: 'openai_compatible',
                base_url: '',
                model: '',
                supports_images: true
            }, fallback, raw, { id, type });
        };
        const profiles = {
            api_main: profile('api_main', 'api'),
            local_main: profile('local_main', 'local')
        };
        Object.entries(sourceProfiles).slice(0, 12).forEach(([id, raw]) => {
            if (id === 'api_main' || id === 'local_main' || !raw || typeof raw !== 'object') return;
            profiles[String(id).slice(0, 80)] = Object.assign({}, raw, {
                id: String(id).slice(0, 80),
                type: String(raw.type || 'local').toLowerCase() === 'api' ? 'api' : 'local'
            });
        });
        const sourceRoutes = source.routes && typeof source.routes === 'object' ? source.routes : {};
        const defaults = {
            character_reply: { mode: 'auto', primary: 'api_main', fallback: 'local_main', fallback_enabled: true },
            player_proxy: { mode: 'auto', primary: 'local_main', fallback: 'api_main', fallback_enabled: true },
            director_state: { mode: 'auto', primary: 'api_main', fallback: 'local_main', fallback_enabled: true },
            state_summary: { mode: 'local', primary: 'local_main', fallback: 'api_main', fallback_enabled: true },
            visual_director: { mode: 'auto', primary: 'api_main', fallback: 'local_main', fallback_enabled: true }
        };
        const routes = {};
        Object.entries(defaults).forEach(([role, fallback]) => {
            const raw = sourceRoutes[role] && typeof sourceRoutes[role] === 'object' ? sourceRoutes[role] : {};
            const mode = ['auto', 'api', 'local'].includes(String(raw.mode || fallback.mode).toLowerCase())
                ? String(raw.mode || fallback.mode).toLowerCase()
                : fallback.mode;
            routes[role] = Object.assign({}, fallback, raw, {
                mode,
                primary: String(raw.primary || fallback.primary).slice(0, 80),
                fallback: String(raw.fallback || fallback.fallback).slice(0, 80),
                fallback_enabled: raw.fallback_enabled !== false
            });
        });
        return { schema: 'simpai.vlm_agent_router', version: 1, profiles, routes };
    }

    function roleplayApiProfileOptions(session = null) {
        const normalized = normalizeRoleplayAgentRouting(session?.agent_routing || session);
        const selected = String(normalized.profiles?.api_main?.version || '').trim();
        const options = [];
        const seen = new Set();
        const add = (value, label) => {
            const cleanValue = String(value || '').trim();
            if (!cleanValue || seen.has(cleanValue)) return;
            seen.add(cleanValue);
            options.push({ value: cleanValue, label: String(label || cleanValue).trim() || cleanValue });
        };
        const custom = readDescribeCustomApi('Custom');
        if (custom?.base_url && custom?.model) {
            add('Custom', `${localText('Current API settings', '当前 API 配置')} · ${custom.model}`);
        }
        (Array.isArray(state.vlmModelChoices) ? state.vlmModelChoices : [])
            .filter((value) => String(value || '').trim().startsWith('custom_api:'))
            .forEach((value) => add(value, state.vlmModelLabels?.[value] || value));
        if (selected && !seen.has(selected)) {
            add(selected, state.vlmModelLabels?.[selected] || selected);
        }
        if (!options.length) {
            options.push({ value: '', label: localText('No API profile configured', '尚未配置 API') });
        }
        return options;
    }

    function renderRoleplayApiProfileOptions(session = null) {
        return roleplayApiProfileOptions(session)
            .map((option) => `<option value="${escapeHtml(option.value)}"${option.value ? '' : ' disabled'}>${escapeHtml(option.label)}</option>`)
            .join('');
    }

    function roleplayLocalModelOptions(session = null) {
        const normalized = normalizeRoleplayAgentRouting(session?.agent_routing || session);
        const stored = String(normalized.profiles?.local_main?.version || '').trim();
        const current = String(readSelectedVlmVersion() || '').trim();
        const currentIsApi = current === 'Custom' || current.startsWith('custom_api:');
        const selected = stored || (currentIsApi ? '' : current);
        const options = [];
        const seen = new Set();
        const add = (value, label) => {
            const cleanValue = String(value || '').trim();
            if (!cleanValue || seen.has(cleanValue)) return;
            seen.add(cleanValue);
            options.push({ value: cleanValue, label: String(label || cleanValue).trim() || cleanValue });
        };
        (Array.isArray(state.vlmModelChoices) ? state.vlmModelChoices : [])
            .filter((value) => {
                const text = String(value || '').trim();
                return text && text !== 'Custom' && !text.startsWith('custom_api:');
            })
            .forEach((value) => add(value, state.vlmModelLabels?.[value] || value));
        if (selected && !seen.has(selected)) {
            add(selected, state.vlmModelLabels?.[selected] || selected);
        }
        if (!options.length) {
            options.push({ value: '', label: localText('No local VLM found', '尚未找到本地 VLM') });
        }
        return options;
    }

    function renderRoleplayLocalModelOptions(session = null) {
        return roleplayLocalModelOptions(session)
            .map((option) => `<option value="${escapeHtml(option.value)}"${option.value ? '' : ' disabled'}>${escapeHtml(option.label)}</option>`)
            .join('');
    }

    function normalizeRoleplayStateFields(value) {
        let entries = [];
        if (Array.isArray(value)) {
            entries = value;
        } else if (value && typeof value === 'object') {
            if (Object.prototype.hasOwnProperty.call(value, 'label')
                || Object.prototype.hasOwnProperty.call(value, 'name')
                || Object.prototype.hasOwnProperty.call(value, 'key')) {
                entries = [value];
            } else {
                entries = Object.entries(value).map(([label, fieldValue]) => ({ label, value: fieldValue }));
            }
        }
        const seen = new Set();
        return entries.slice(0, MAX_ROLEPLAY_STATE_FIELDS).map((item) => {
            if (!item || typeof item !== 'object') return null;
            const label = String(item.label ?? item.name ?? item.key ?? '').trim().slice(0, MAX_ROLEPLAY_STATE_FIELD_LABEL);
            const valueText = String(item.value ?? item.text ?? '').trim().slice(0, MAX_ROLEPLAY_STATE_FIELD_VALUE);
            const identity = label.toLocaleLowerCase();
            if (!label || !valueText || seen.has(identity)) return null;
            seen.add(identity);
            return { label, value: valueText };
        }).filter(Boolean);
    }

    function normalizeRoleplayPlayerState(value) {
        const source = value && typeof value === 'object' ? value : {};
        let status = String(source.status || '').trim().toLowerCase();
        if (!status) {
            status = source.is_present === false ? 'absent' : 'present';
        } else if (status === 'off_scene' || status === 'off-scene') {
            status = 'absent';
        } else if (status !== 'absent') {
            status = 'present';
        }
        return {
            schema: 'simpai.vlm_roleplay.player_state',
            version: 1,
            status,
            is_present: status === 'present',
            state_text: String(source.state_text || '').trim().slice(0, MAX_ROLEPLAY_STATE_TEXT),
            state_fields: normalizeRoleplayStateFields(source.state_fields)
        };
    }

    function normalizeRoleplayStateChanges(value) {
        const source = Array.isArray(value) ? value : [];
        return source.slice(0, 40).map((item) => {
            if (!item || typeof item !== 'object') return null;
            const entityType = String(item.entity_type || '').trim() === 'player' ? 'player' : 'character';
            const field = String(item.field || '').trim().slice(0, 120);
            if (!field) return null;
            const copyValue = (raw) => {
                if (raw === undefined) return null;
                if (typeof raw === 'string') return raw.slice(0, 1600);
                if (Array.isArray(raw)) return raw.slice(0, 40);
                if (raw && typeof raw === 'object') return Object.assign({}, raw);
                return raw;
            };
            return {
                entity_type: entityType,
                entity_id: String(item.entity_id || '').trim().slice(0, 160),
                entity_name: String(item.entity_name || '').trim().slice(0, 200),
                field,
                label: String(item.label || roleplayStateChangeLabel(field)).trim().slice(0, 160),
                before: copyValue(item.before),
                after: copyValue(item.after)
            };
        }).filter(Boolean);
    }

    function roleplayStatePathValue(session, path) {
        const parts = String(path || '').split('.').map((part) => part.trim()).filter(Boolean);
        let target = session?.story_state;
        for (const part of parts) {
            if (!target || typeof target !== 'object') return null;
            target = target[part];
        }
        return target === undefined ? null : target;
    }

    function roleplayStateChangeLabel(field) {
        return {
            status: localText('Presence', '在场状态'),
            state_text: localText('Current state', '当前状态'),
            state_fields: localText('State fields', '状态项'),
            location: localText('Location', '位置'),
            condition: localText('Condition', '状况'),
            appearance: localText('Appearance', '外观'),
            emotion: localText('Emotion', '情绪'),
            current_action: localText('Current action', '当前行动'),
            inventory: localText('Inventory', '物品'),
            goals: localText('Goals', '目标')
        }[field] || field;
    }

    function roleplayStateChangeDisplayValue(value) {
        if (value === null || value === undefined || value === '') return localText('Empty', '已清空');
        if (Array.isArray(value)) {
            const entries = value.map((item) => {
                if (item && typeof item === 'object' && item.label !== undefined) {
                    return `${String(item.label).trim()}: ${String(item.value ?? '').trim()}`;
                }
                return String(item ?? '').trim();
            }).filter(Boolean);
            return entries.join(' / ') || localText('Empty', '已清空');
        }
        if (value && typeof value === 'object') return JSON.stringify(value);
        return String(value).trim();
    }

    function roleplayStateChangesFromPatches(before, after, applied) {
        const previous = normalizeRoleplaySession(before);
        const next = normalizeRoleplaySession(after);
        const patches = Array.isArray(applied) ? applied : [];
        const changes = [];
        const seen = new Set();
        patches.forEach((patch) => {
            const parts = String(patch?.path || '').split('.').map((part) => part.trim()).filter(Boolean);
            let entityType = '';
            let entityId = '';
            let field = '';
            if (parts[0] === 'player_state' && parts.length >= 2) {
                entityType = 'player';
                entityId = String(next.persona?.id || previous.persona?.id || 'player');
                field = parts[1];
            } else if (parts[0] === 'characters' && parts.length >= 3) {
                entityType = 'character';
                entityId = parts[1];
                field = parts[2];
            }
            if (!entityType || !field || !['status', 'state_text', 'state_fields', 'location', 'condition', 'appearance', 'emotion', 'current_action', 'inventory', 'goals'].includes(field)) return;
            const key = `${entityType}:${entityId}:${field}`;
            if (seen.has(key)) return;
            seen.add(key);
            const card = next.characters?.[entityId] || previous.characters?.[entityId] || {};
            changes.push({
                entity_type: entityType,
                entity_id: entityId,
                entity_name: entityType === 'player'
                    ? String(next.persona?.name || previous.persona?.name || localText('Player', '玩家'))
                    : String(card.name || entityId),
                field,
                label: roleplayStateChangeLabel(field),
                before: roleplayStatePathValue(previous, `${entityType === 'player' ? 'player_state' : `characters.${entityId}`}.${field}`),
                after: roleplayStatePathValue(next, `${entityType === 'player' ? 'player_state' : `characters.${entityId}`}.${field}`)
            });
        });
        return normalizeRoleplayStateChanges(changes);
    }

    function renderRoleplayStateChanges(value) {
        const changes = normalizeRoleplayStateChanges(value);
        if (!changes.length) return '';
        const rows = changes.map((change) => {
            const before = roleplayStateChangeDisplayValue(change.before);
            const after = roleplayStateChangeDisplayValue(change.after);
            const transition = change.before === null || change.before === undefined || before === after
                ? after
                : `${before} -> ${after}`;
            return `<li><b>${escapeHtml([change.entity_name || change.entity_id, change.label].filter(Boolean).join(' · '))}</b><span>${escapeHtml(transition)}</span></li>`;
        }).join('');
        return `<div class="describe-vlm-chat-roleplay-state-changes" data-describe-vlm-chat-roleplay-state-changes><div class="describe-vlm-chat-roleplay-state-changes-head"><i class="fa-solid fa-arrows-rotate"></i><span>${escapeHtml(localText('State updates', '状态更新'))}</span></div><ul>${rows}</ul></div>`;
    }

    function normalizeRoleplaySession(value, conversationId = '') {
        const source = value && typeof value === 'object' ? value : {};
        const characterSource = source.character || source.character_card || {};
        const personaSource = source.persona || source.player_persona || {};
        const stateSource = source.story_state || source.state || {};
        const sceneSource = stateSource.scene && typeof stateSource.scene === 'object' ? stateSource.scene : {};
        const characterId = String(characterSource.id || 'character').trim().slice(0, 160) || 'character';
        const personaId = String(personaSource.id || 'persona').trim().slice(0, 160) || 'persona';
        const cleanList = (items, limit = 80) => Array.isArray(items)
            ? items.map((item) => String(item || '').trim()).filter(Boolean).slice(0, limit)
            : [];
        const runtimeCharacters = stateSource.characters && typeof stateSource.characters === 'object'
            ? stateSource.characters
            : {};
        const normalizedCharacters = {};
        Object.entries(runtimeCharacters).slice(0, 20).forEach(([key, item]) => {
            const runtime = item && typeof item === 'object' ? item : {};
            normalizedCharacters[String(key).slice(0, 160)] = {
                location: String(runtime.location || '').slice(0, 500),
                condition: cleanList(runtime.condition, 20),
                appearance: String(runtime.appearance || '').slice(0, 1200),
                state_text: String(runtime.state_text || '').slice(0, MAX_ROLEPLAY_STATE_TEXT),
                state_fields: normalizeRoleplayStateFields(runtime.state_fields),
                current_appearance_asset_ids: cleanList(
                    Array.isArray(runtime.current_appearance_asset_ids)
                        ? runtime.current_appearance_asset_ids
                        : runtime.current_appearance_asset_id
                            ? [runtime.current_appearance_asset_id]
                            : [],
                    3
                ),
                appearance_revision: Math.max(0, Math.round(Number(runtime.appearance_revision) || 0)),
                appearance_updated_turn_id: String(runtime.appearance_updated_turn_id || '').slice(0, 200),
                emotion: String(runtime.emotion || '').slice(0, 500),
                current_action: String(runtime.current_action || '').slice(0, 1000),
                inventory: cleanList(runtime.inventory, 40),
                goals: cleanList(runtime.goals, 20)
            };
        });
        const emptyCharacterRuntime = () => ({
            location: '',
            condition: [],
            appearance: '',
            state_text: '',
            state_fields: [],
            current_appearance_asset_ids: [],
            appearance_revision: 0,
            appearance_updated_turn_id: '',
            emotion: '',
            current_action: '',
            inventory: [],
            goals: []
        });
        const normalizeCharacterCard = (value, idHint = '') => {
            const sourceCard = value && typeof value === 'object' ? value : {};
            const id = String(sourceCard.id || idHint || 'character').trim().slice(0, 160) || 'character';
            return {
                schema: 'simpai.vlm_roleplay.character',
                version: 1,
                id,
                revision: Math.max(1, Math.round(Number(sourceCard.revision) || 1)),
                name: String(sourceCard.name || '').slice(0, 200),
                avatar_asset_id: String(sourceCard.avatar_asset_id || '').slice(0, 160),
                reference_asset_ids: cleanList(sourceCard.reference_asset_ids, 5),
                identity: String(sourceCard.identity || '').slice(0, MAX_PERSISTED_TEXT),
                background: String(sourceCard.background || '').slice(0, MAX_PERSISTED_TEXT),
                personality: String(sourceCard.personality || '').slice(0, MAX_PERSISTED_TEXT),
                speech_style: String(sourceCard.speech_style || '').slice(0, MAX_PERSISTED_TEXT),
                image_prompt: String(sourceCard.image_prompt || sourceCard.visual_prompt || '').slice(0, MAX_PERSISTED_TEXT),
                negative_prompt: String(sourceCard.negative_prompt || '').slice(0, 4000),
                state_image_history: Array.isArray(sourceCard.state_image_history)
                    ? sourceCard.state_image_history.map((item) => {
                        const entry = item && typeof item === 'object' ? item : {};
                        const assetIds = cleanList(
                            entry.asset_ids || (entry.asset_id ? [entry.asset_id] : []),
                            3
                        );
                        if (!assetIds.length) return null;
                        return {
                            id: String(entry.id || uid('state_image')).slice(0, 160),
                            asset_ids: assetIds,
                            label: String(entry.label || '').slice(0, 200),
                            appearance: String(entry.appearance || '').slice(0, 1200),
                            state_text: String(entry.state_text || '').slice(0, MAX_ROLEPLAY_STATE_TEXT),
                            state_fields: normalizeRoleplayStateFields(entry.state_fields),
                            source: String(entry.source || 'roleplay').slice(0, 80),
                            turn_id: String(entry.turn_id || '').slice(0, 200),
                            created_at: String(entry.created_at || '').slice(0, 80)
                        };
                    }).filter(Boolean).slice(0, MAX_ROLEPLAY_STATE_IMAGE_HISTORY)
                    : [],
                behavior_rules: cleanList(sourceCard.behavior_rules, 40),
                first_message: String(sourceCard.first_message || '').slice(0, MAX_PERSISTED_TEXT),
                example_dialogues: Array.isArray(sourceCard.example_dialogues) ? sourceCard.example_dialogues.slice(0, 20) : [],
                locked_fields: cleanList(sourceCard.locked_fields, 40)
            };
        };
        const primaryCharacter = normalizeCharacterCard(characterSource, characterId);
        const characterCards = {};
        const configuredCharacters = source.characters && typeof source.characters === 'object'
            ? source.characters
            : {};
        Object.entries(configuredCharacters).slice(0, Math.max(0, MAX_ROLEPLAY_CHARACTERS - 1)).forEach(([key, value]) => {
            const card = normalizeCharacterCard(value, key);
            characterCards[card.id] = card;
        });
        characterCards[primaryCharacter.id] = primaryCharacter;
        const requestedActiveCharacterId = String(source.active_character_id || primaryCharacter.id).trim().slice(0, 160);
        const activeCharacterId = characterCards[requestedActiveCharacterId]
            ? requestedActiveCharacterId
            : primaryCharacter.id;
        Object.keys(characterCards).slice(0, MAX_ROLEPLAY_CHARACTERS).forEach((id) => {
            if (!normalizedCharacters[id]) normalizedCharacters[id] = emptyCharacterRuntime();
        });
        const visualSource = source.visual_config && typeof source.visual_config === 'object' ? source.visual_config : {};
        return {
            schema: 'simpai.vlm_roleplay.session',
            version: 1,
            id: String(source.id || source.session_id || uid('roleplay_session')).slice(0, 160),
            conversation_id: String(conversationId || source.conversation_id || '').slice(0, 200),
            mode: 'roleplay',
            character: characterCards[activeCharacterId] || primaryCharacter,
            characters: characterCards,
            active_character_id: activeCharacterId,
            persona: {
                schema: 'simpai.vlm_roleplay.persona',
                version: 1,
                id: personaId,
                name: String(personaSource.name || '').slice(0, 200),
                appearance: String(personaSource.appearance || '').slice(0, MAX_PERSISTED_TEXT),
                identity: String(personaSource.identity || '').slice(0, MAX_PERSISTED_TEXT),
                personality: String(personaSource.personality || '').slice(0, MAX_PERSISTED_TEXT),
                goals: cleanList(personaSource.goals, 20),
                relationship_seed: String(personaSource.relationship_seed || '').slice(0, MAX_PERSISTED_TEXT),
                reference_asset_ids: cleanList(personaSource.reference_asset_ids, 5),
                proxy_policy: Object.assign({
                    initiative: 'balanced',
                    reply_length: 'standard',
                    forbidden_actions: [],
                    require_confirmation_for: []
                }, personaSource.proxy_policy && typeof personaSource.proxy_policy === 'object' ? personaSource.proxy_policy : {})
            },
            story_state: {
                schema: 'simpai.vlm_roleplay.story_state',
                version: 1,
                scene: {
                    id: String(sceneSource.id || uid('scene')).slice(0, 160),
                    location: String(sceneSource.location || '').slice(0, 500),
                    time: String(sceneSource.time || '').slice(0, 200),
                    weather: String(sceneSource.weather || '').slice(0, 200),
                    present_character_ids: cleanList(sceneSource.present_character_ids, 20),
                    current_event: String(sceneSource.current_event || '').slice(0, 1000),
                    scene_goal: String(sceneSource.scene_goal || '').slice(0, 1000)
                },
                player_state: normalizeRoleplayPlayerState(stateSource.player_state),
                characters: normalizedCharacters,
                relationships: Array.isArray(stateSource.relationships) ? stateSource.relationships.slice(0, 80) : [],
                world_facts: cleanList(stateSource.world_facts, 80),
                knowledge: stateSource.knowledge && typeof stateSource.knowledge === 'object' ? stateSource.knowledge : {},
                memories: Array.isArray(stateSource.memories) ? stateSource.memories.slice(-120) : [],
                open_threads: cleanList(stateSource.open_threads, 40),
                chapter_summary: String(stateSource.chapter_summary || '').slice(0, MAX_PERSISTED_TEXT),
                long_summary: String(stateSource.long_summary || '').slice(0, MAX_PERSISTED_TEXT),
                state_version: Math.max(0, Math.round(Number(stateSource.state_version) || Number(source.state_version) || 0)),
                updated_at: String(stateSource.updated_at || '').slice(0, 80)
            },
            active_branch_id: String(source.active_branch_id || 'main').slice(0, 160),
            active_turn_id: String(source.active_turn_id || '').slice(0, 200),
            state_version: Math.max(0, Math.round(Number(source.state_version) || Number(stateSource.state_version) || 0)),
            director_config: Object.assign({
                autonomy: 'assisted',
                allow_npc_creation: false,
                allow_time_advance: true,
                allow_relationship_changes: true,
                strictness: 'explicit_facts',
                summary_every_turns: 8
            }, source.director_config && typeof source.director_config === 'object' ? source.director_config : {}),
            autoplay_config: Object.assign({
                mode: 'manual',
                target_turns: 5,
                continuous: false,
                initiative: 'balanced',
                reply_length: 'standard',
                image_frequency: 'key_moments',
                queue_mode: 'background',
                chapter_goal: ''
            }, source.autoplay_config && typeof source.autoplay_config === 'object' ? source.autoplay_config : {}),
            visual_config: Object.assign({
                enabled: false,
                frequency: 'key_moments',
                queue_mode: 'background',
                preferred_preset: '',
                aspect_ratio: '16:9',
                reference_asset_ids: []
            }, visualSource, {
                reference_asset_ids: cleanList(visualSource.reference_asset_ids, MAX_ROLEPLAY_REFERENCE_IMAGES)
            }),
            agent_routing: normalizeRoleplayAgentRouting(source.agent_routing),
            created_at: String(source.created_at || '').slice(0, 80),
            updated_at: String(source.updated_at || '').slice(0, 80)
        };
    }

    function roleplayReferenceIds(session, owner, characterId = '') {
        const normalized = normalizeRoleplaySession(session);
        let source = normalized.visual_config;
        if (owner === 'character') source = normalized.characters?.[characterId || normalized.active_character_id] || normalized.character;
        if (owner === 'player') source = normalized.persona;
        if (!source || typeof source !== 'object') return [];
        const ids = [];
        const add = (value) => {
            const id = String(value || '').trim();
            if (!id) return;
            const key = roleplayReferenceIdentity(id);
            if (!ids.some((item) => roleplayReferenceIdentity(item) === key)) ids.push(id);
        };
        if (owner === 'character' && source.avatar_asset_id) add(source.avatar_asset_id);
        (Array.isArray(source.reference_asset_ids) ? source.reference_asset_ids : []).forEach((value) => {
            add(value);
        });
        return ids.slice(0, MAX_ROLEPLAY_REFERENCE_IMAGES);
    }

    function roleplayReferenceIdentity(value) {
        return String(value || '').trim().toLowerCase().replace(/^(?:asset|file):/, '');
    }

    function roleplayAssetLocatorIdentity(value) {
        return roleplayReferenceIdentity(value)
            .replace(/[\\/]+/g, '_')
            .replace(/\s+/g, '_');
    }

    function roleplayAssetIdIsDurable(value) {
        return /^(?:asset|file):[0-9a-f]{16,64}$/i.test(String(value || '').trim());
    }

    function roleplayAssetIdLooksLikePath(value) {
        return /^(?:[A-Za-z]:[\\/]|[\\/]{1,2})/.test(String(value || '').trim());
    }

    function roleplayAssetCanUseDirectId(asset) {
        const id = String(asset?.asset_id || '').trim();
        if (!id) return false;
        if (roleplayAssetIdLooksLikePath(id)) return false;
        if (roleplayAssetIdIsDurable(id)) return true;
        return ![asset?.path, asset?.output_path, asset?.asset_relative_path, asset?.relative_path]
            .some((value) => String(value || '').trim());
    }

    function roleplayReferenceLibraryAsset(assetId) {
        const key = roleplayReferenceIdentity(assetId);
        const locatorKey = roleplayAssetLocatorIdentity(assetId);
        return state.roleplayReferenceLibrary.find((item) => {
            if (roleplayReferenceIdentity(item?.asset_id) === key) return true;
            return [item?.path, item?.output_path, item?.asset_relative_path, item?.relative_path]
                .some((value) => {
                    const candidate = String(value || '').trim();
                    return candidate && roleplayAssetLocatorIdentity(candidate) === locatorKey;
                });
        }) || null;
    }

    function createRoleplayReferenceDraft(session) {
        const normalized = normalizeRoleplaySession(session);
        const characters = {};
        Object.keys(normalized.characters || {}).slice(0, MAX_ROLEPLAY_CHARACTERS).forEach((characterId) => {
            characters[characterId] = roleplayReferenceIds(normalized, 'character', characterId);
        });
        return {
            character: characters[normalized.active_character_id] || roleplayReferenceIds(normalized, 'character'),
            characters,
            player: roleplayReferenceIds(normalized, 'player'),
            scene: roleplayReferenceIds(normalized, 'scene')
        };
    }

    function roleplayReferenceDraft(runtime) {
        if (!runtime) return createRoleplayReferenceDraft(null);
        if (!runtime.roleplayReferenceDraft || typeof runtime.roleplayReferenceDraft !== 'object') {
            runtime.roleplayReferenceDraft = createRoleplayReferenceDraft(runtime.roleplaySession);
        }
        ['character', 'player', 'scene'].forEach((owner) => {
            if (!Array.isArray(runtime.roleplayReferenceDraft[owner])) runtime.roleplayReferenceDraft[owner] = [];
            runtime.roleplayReferenceDraft[owner] = runtime.roleplayReferenceDraft[owner]
                .map((value) => String(value || '').trim())
                .filter(Boolean)
                .filter((value, index, list) => list.findIndex((item) => roleplayReferenceIdentity(item) === roleplayReferenceIdentity(value)) === index)
                .slice(0, MAX_ROLEPLAY_REFERENCE_IMAGES);
        });
        if (!runtime.roleplayReferenceDraft.characters || typeof runtime.roleplayReferenceDraft.characters !== 'object') {
            runtime.roleplayReferenceDraft.characters = {};
        }
        const session = normalizeRoleplaySession(runtime.roleplaySession);
        Object.keys(session.characters || {}).slice(0, MAX_ROLEPLAY_CHARACTERS).forEach((characterId) => {
            const current = Array.isArray(runtime.roleplayReferenceDraft.characters[characterId])
                ? runtime.roleplayReferenceDraft.characters[characterId]
                : roleplayReferenceIds(session, 'character', characterId);
            runtime.roleplayReferenceDraft.characters[characterId] = current
                .map((value) => String(value || '').trim())
                .filter(Boolean)
                .filter((value, index, list) => list.findIndex((item) => roleplayReferenceIdentity(item) === roleplayReferenceIdentity(value)) === index)
                .slice(0, MAX_ROLEPLAY_REFERENCE_IMAGES);
        });
        runtime.roleplayReferenceDraft.character = runtime.roleplayReferenceDraft.characters[session.active_character_id]
            || runtime.roleplayReferenceDraft.character
            || [];
        return runtime.roleplayReferenceDraft;
    }

    function roleplayReferenceDraftIds(runtime, owner, characterId = '') {
        const draft = roleplayReferenceDraft(runtime);
        if (owner === 'character') {
            const session = normalizeRoleplaySession(runtime?.roleplaySession);
            return draft.characters?.[characterId || session.active_character_id] || draft.character || [];
        }
        return draft[owner] || [];
    }

    function roleplayAssetFileName(asset) {
        const source = String(asset?.name || asset?.relative_path || asset?.path || '').trim();
        return source.split(/[\\/]/).pop() || '';
    }

    function roleplayAssetCategory(asset) {
        const source = [
            asset?.name,
            asset?.relative_path,
            asset?.asset_relative_path,
            asset?.path
        ].map((value) => String(value || '').toLowerCase()).join(' ');
        if (/current[_-]appearance/.test(source)) {
            return { key: 'current_appearance', label: localText('Current appearance images', '当前状态图') };
        }
        if (/reference[_-]character/.test(source)) {
            return { key: 'character_reference', label: localText('Character reference images', '角色设定图') };
        }
        if (/reference[_-](?:scene|environment)/.test(source)) {
            return { key: 'scene_reference', label: localText('Scene reference images', '场景参考图') };
        }
        if (/reference[_-]player/.test(source)) {
            return { key: 'player_reference', label: localText('Player reference images', '玩家参考图') };
        }
        return { key: 'project', label: localText('Other project images', '其他项目图片') };
    }

    function roleplayAssetDateLabel(asset) {
        const raw = asset?.updated_at || asset?.created_at;
        if (!raw) return '';
        const numeric = Number(raw);
        const date = Number.isFinite(numeric)
            ? new Date(numeric > 100000000000 ? numeric : numeric * 1000)
            : new Date(raw);
        if (Number.isNaN(date.getTime())) return '';
        return date.toLocaleString(
            String(state.__lang || '').toLowerCase().startsWith('en') ? 'en-US' : 'zh-CN',
            { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }
        );
    }

    function roleplayAssetUsage(assetId, runtime = null) {
        const key = roleplayReferenceIdentity(assetId);
        if (!key) return [];
        const source = runtime?.roleplaySession || runtime;
        const session = normalizeRoleplaySession(source);
        const usages = [];
        const add = (usageKey, label) => {
            if (!usages.some((item) => item.key === usageKey && item.label === label)) {
                usages.push({ key: usageKey, label });
            }
        };
        Object.entries(session.characters || {}).forEach(([characterId, card]) => {
            const values = [card?.avatar_asset_id, ...(Array.isArray(card?.reference_asset_ids) ? card.reference_asset_ids : [])];
            if (values.some((value) => roleplayReferenceIdentity(value) === key)) {
                add(
                    'character_reference',
                    localText('Character reference', '角色设定图') + ' · ' + String(card?.name || characterId).trim()
                );
            }
            const current = session.story_state?.characters?.[characterId] || {};
            if ((Array.isArray(current.current_appearance_asset_ids) ? current.current_appearance_asset_ids : [])
                .some((value) => roleplayReferenceIdentity(value) === key)) {
                add(
                    'current_appearance',
                    localText('Current appearance', '当前状态图') + ' · ' + String(card?.name || characterId).trim()
                );
            }
        });
        const personaRefs = session.persona?.reference_asset_ids || [];
        if (personaRefs.some((value) => roleplayReferenceIdentity(value) === key)) {
            add('player_reference', localText('Player reference', '玩家参考图'));
        }
        const sceneRefs = session.visual_config?.reference_asset_ids || [];
        if (sceneRefs.some((value) => roleplayReferenceIdentity(value) === key)) {
            add('scene_reference', localText('Scene reference', '场景参考图'));
        }
        return usages;
    }

    function roleplayReferenceAssetLabel(assetId, runtime = null) {
        const id = String(assetId || '').trim();
        const asset = roleplayReferenceLibraryAsset(id);
        if (!asset) return id || localText('Reference image', '参考图');
        const category = roleplayAssetCategory(asset);
        const usage = roleplayAssetUsage(id, runtime);
        const primary = usage[0]?.label
            || (category.key !== 'project'
                ? category.label + ' · ' + localText('Not adopted', '尚未采用')
                : category.label);
        const fileName = roleplayAssetFileName(asset);
        const generatedName = /^roleplay_(?:current_appearance|reference_[a-z0-9_-]+)\.image\.[a-f0-9]{8,}\./i.test(fileName);
        const suffix = generatedName
            ? roleplayAssetDateLabel(asset)
            : (category.key === 'project' ? fileName : roleplayAssetDateLabel(asset));
        return [primary, usage.length > 1 ? '+' + (usage.length - 1) : '', suffix].filter(Boolean).join(' · ');
    }

    function roleplayReferencePreviewUrl(assetId) {
        const id = String(assetId || '').trim();
        const asset = roleplayReferenceLibraryAsset(id);
        return String(asset?.preview_url || '').trim() || persistedMediaAssetSource(asset);
    }

    function renderRoleplayReferenceLists(modal, runtime = null) {
        if (!modal) return;
        const target = runtime || currentConversationRuntime();
        ['character', 'player', 'scene'].forEach((owner) => {
            const list = modal.querySelector(`[data-describe-vlm-chat-roleplay-reference-list="${owner}"]`);
            if (!list) return;
            const ids = roleplayReferenceDraftIds(target, owner);
            list.innerHTML = ids.length
                ? ids.map((assetId, index) => {
                    const label = roleplayReferenceAssetLabel(assetId, target);
                    const preview = roleplayReferencePreviewUrl(assetId);
                    return `<span class="describe-vlm-chat-roleplay-reference-chip" title="${escapeHtml(label)}">${preview ? `<img src="${escapeHtml(preview)}" alt="">` : '<i class="fa-solid fa-image"></i>'}<span>${escapeHtml(label)}</span><button type="button" data-describe-vlm-chat-roleplay-reference-remove="${escapeHtml(owner)}" data-reference-id="${escapeHtml(assetId)}" title="${escapeHtml(localText('Remove reference image', '移除参考图'))}" aria-label="${escapeHtml(localText('Remove reference image', '移除参考图'))}"><i class="fa-solid fa-xmark"></i></button></span>`;
                }).join('')
                : `<span class="describe-vlm-chat-roleplay-reference-empty">${escapeHtml(localText('No reference images', '尚未添加参考图'))}</span>`;
            const count = modal.querySelector(`[data-describe-vlm-chat-roleplay-reference-count="${owner}"]`);
            if (count) count.textContent = `${ids.length}/${MAX_ROLEPLAY_REFERENCE_IMAGES}`;
        });
    }

    function roleplayCharacterRuntime(session, characterId = '') {
        const normalized = normalizeRoleplaySession(session);
        const targetId = String(characterId || normalized.character.id || '').trim();
        return normalized.story_state?.characters?.[targetId]
            || normalized.story_state?.characters?.[normalized.character.id]
            || {};
    }

    function roleplayCurrentAppearanceAssets(session, characterId = '') {
        const runtime = roleplayCharacterRuntime(session, characterId);
        return (Array.isArray(runtime.current_appearance_asset_ids) ? runtime.current_appearance_asset_ids : [])
            .map((assetId) => roleplayReferenceLibraryAsset(assetId) || { asset_id: assetId, name: assetId })
            .filter((asset) => String(asset?.asset_id || '').trim());
    }

    function registerRoleplayGeneratedAsset(asset) {
        const normalized = normalizeCreativeAsset(asset);
        const assetId = String(normalized?.asset_id || '').trim();
        if (!assetId) return null;
        const libraryItem = Object.assign({}, normalized, { asset_id: assetId });
        state.roleplayReferenceLibrary = [
            libraryItem,
            ...state.roleplayReferenceLibrary.filter((item) => String(item?.asset_id || '') !== assetId)
        ];
        return assetId;
    }

    function renderRoleplayCurrentAppearance(modal, runtime = null) {
        if (!modal) return;
        const target = runtime || currentConversationRuntime();
        const session = normalizeRoleplaySession(target.roleplaySession, target.conversationId);
        const assets = roleplayCurrentAppearanceAssets(session, session.character.id);
        const mount = modal.querySelector('[data-describe-vlm-chat-roleplay-current-appearance]');
        const revision = modal.querySelector('[data-describe-vlm-chat-roleplay-current-appearance-revision]');
        if (!mount) return;
        const stateRuntime = roleplayCharacterRuntime(session, session.character.id);
        if (revision) {
            revision.textContent = stateRuntime.appearance_revision
                ? localText(`Revision ${stateRuntime.appearance_revision}`, `第 ${stateRuntime.appearance_revision} 版`)
                : localText('Not adopted', '尚未采用');
        }
        mount.innerHTML = assets.length
            ? assets.map((asset, index) => {
                const src = persistedMediaAssetSource(asset);
                const label = String(asset.name || localText(`Current appearance ${index + 1}`, `当前状态图 ${index + 1}`));
                return src
                    ? `<figure class="describe-vlm-chat-roleplay-current-appearance-item"><img src="${escapeHtml(src)}" alt="${escapeHtml(label)}" loading="lazy"><figcaption>${escapeHtml(label)}</figcaption></figure>`
                    : `<span class="describe-vlm-chat-roleplay-reference-empty">${escapeHtml(label)}</span>`;
            }).join('')
            : `<span class="describe-vlm-chat-roleplay-reference-empty">${escapeHtml(localText('No adopted current appearance image', '尚未采用当前状态图'))}</span>`;
    }

    function roleplayInlineActionMatches(action, area, session) {
        if (!action || !['generate_image', 'offer_image'].includes(action.type)) return false;
        if (String(action.branch_id || 'main') !== String(session.active_branch_id || 'main')) return false;
        if (area === 'appearance') {
            return !!action.roleplay_state_image
                && String(action.appearance_character_id || session.active_character_id || '') === String(session.active_character_id || session.character.id || '');
        }
        if (area === 'character-reference') {
            return !!action.roleplay_character_image
                && String(action.character_reference_id || session.active_character_id || '') === String(session.active_character_id || session.character.id || '');
        }
        return area === 'scene-reference' && !!action.roleplay_scene_reference_image;
    }

    function latestRoleplayInlineAction(runtime, area) {
        const target = runtime || currentConversationRuntime();
        const session = normalizeRoleplaySession(target?.roleplaySession, target?.conversationId);
        const messages = Array.isArray(target?.messages) ? target.messages : [];
        for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
            const actions = Array.isArray(messages[messageIndex]?.actions) ? messages[messageIndex].actions : [];
            for (let actionIndex = actions.length - 1; actionIndex >= 0; actionIndex -= 1) {
                const action = actions[actionIndex];
                if (roleplayInlineActionMatches(action, area, session)) {
                    return { action, actionRef: `${messageIndex}:${actionIndex}` };
                }
            }
        }
        return null;
    }

    function renderRoleplayInlineGenerationResults(modal, runtime = null) {
        if (!modal) return;
        const target = runtime || currentConversationRuntime();
        ['appearance', 'character-reference', 'scene-reference'].forEach((area) => {
            const mount = modal.querySelector(`[data-describe-vlm-chat-roleplay-inline-result="${area}"]`);
            if (!mount) return;
            const found = latestRoleplayInlineAction(target, area);
            if (!found) {
                mount.hidden = true;
                mount.innerHTML = '';
                return;
            }
            const generation = creativeGenerationForAction(found.action);
            const currentState = String(generation.state || 'awaiting_confirmation').toLowerCase();
            const assets = (Array.isArray(generation.assets) ? generation.assets : [])
                .map(normalizeCreativeAsset)
                .filter(Boolean);
            if (currentState === 'finished' && assets.length) {
                mount.innerHTML = `<div class="describe-vlm-chat-roleplay-inline-result-content">${renderCreativeFinishedResult(found.action, found.actionRef, assets)}</div>`;
                mount.hidden = false;
                return;
            }
            const preview = creativePreviewSource(generation);
            const progress = Math.max(0, Math.min(100, Math.round((Number(generation.percent) || 0) * 100)));
            const stateLabel = creativeStateLabel(generation);
            const detail = String(generation.error || generation.message || '').trim();
            const retryable = ['failed', 'canceled', 'skipped', 'skipped_queue_limit', 'stale_branch', 'models_missing', 'preset_missing', 'parameter_profile_missing', 'parameter_profile_incompatible'].includes(currentState);
            mount.innerHTML = `<div class="describe-vlm-chat-roleplay-inline-result-content is-pending">
  <div class="describe-vlm-chat-roleplay-inline-result-head"><i class="fa-solid fa-wand-magic-sparkles"></i><span>${escapeHtml(localText('Image result', '图片结果'))}</span><b>${escapeHtml(stateLabel)}</b></div>
  ${preview ? `<div class="describe-vlm-chat-roleplay-inline-result-preview"><img src="${escapeHtml(preview)}" alt="${escapeHtml(localText('Sampling preview', '采样预览'))}" loading="lazy"></div>` : ''}
  <div class="describe-vlm-chat-roleplay-inline-result-status" aria-live="polite">${progress && CREATIVE_ACTIVE_STATES.has(currentState) ? `<progress max="100" value="${progress}"></progress><span>${progress}%</span>` : ''}${detail ? `<small>${escapeHtml(detail)}</small>` : ''}</div>
  ${retryable ? `<button type="button" class="describe-vlm-chat-roleplay-inline-retry" data-describe-vlm-chat-generation-run="${escapeHtml(found.actionRef)}" title="${escapeHtml(localText('Generate again', '重新生成'))}" aria-label="${escapeHtml(localText('Generate again', '重新生成'))}"><i class="fa-solid fa-rotate-right"></i></button>` : ''}
</div>`;
            mount.hidden = false;
        });
    }

    function setRoleplayReferenceDraft(runtime, owner, ids, characterId = '') {
        const draft = roleplayReferenceDraft(runtime);
        const seen = new Set();
        const normalizedIds = (Array.isArray(ids) ? ids : [])
            .map((value) => String(value || '').trim())
            .filter((value) => {
                const key = roleplayReferenceIdentity(value);
                if (!key || seen.has(key)) return false;
                seen.add(key);
                return true;
            })
            .slice(0, MAX_ROLEPLAY_REFERENCE_IMAGES);
        if (owner === 'character') {
            const session = normalizeRoleplaySession(runtime?.roleplaySession);
            const targetId = characterId || session.active_character_id;
            draft.characters = draft.characters || {};
            draft.characters[targetId] = normalizedIds;
            if (targetId === session.active_character_id) draft.character = normalizedIds;
        } else {
            draft[owner] = normalizedIds;
        }
        runtime.persistenceDirty = true;
        return owner === 'character'
            ? draft.characters?.[characterId || normalizeRoleplaySession(runtime?.roleplaySession).active_character_id] || []
            : draft[owner];
    }

    function normalizeRoleplayBranch(value, conversationId = '', index = 0) {
        const source = value && typeof value === 'object' ? value : {};
        const rawSession = source.session && typeof source.session === 'object' ? source.session : source;
        const session = normalizeRoleplaySession(rawSession, conversationId);
        const branchId = String(source.branch_id || source.id || session.active_branch_id || (index === 0 ? 'main' : ''))
            .trim().slice(0, 160) || `roleplay_branch_${index + 1}`;
        session.active_branch_id = branchId;
        return {
            branch_id: branchId,
            label: String(source.label || source.name || '').trim().slice(0, 160),
            parent_branch_id: String(source.parent_branch_id || '').trim().slice(0, 160),
            fork_turn_id: String(source.fork_turn_id || '').trim().slice(0, 200),
            reason: String(source.reason || '').trim().slice(0, 240),
            state_version: Math.max(0, Math.round(Number(source.state_version || session.state_version) || 0)),
            active_turn_id: String(source.active_turn_id || session.active_turn_id || '').trim().slice(0, 200),
            created_at: String(source.created_at || '').trim().slice(0, 80),
            updated_at: String(source.updated_at || session.updated_at || '').trim().slice(0, 80),
            remote: !!source.remote,
            session,
            messages: normalizePersistedMessages(
                Array.isArray(source.messages) ? source.messages.slice(-MAX_ROLEPLAY_BRANCH_MESSAGES) : []
            )
        };
    }

    function normalizeRoleplayBranches(value, conversationId = '') {
        const source = Array.isArray(value) ? value : [];
        const seen = new Set();
        return source
            .map((item, index) => normalizeRoleplayBranch(item, conversationId, index))
            .filter((item) => {
                if (!item.branch_id || seen.has(item.branch_id)) return false;
                seen.add(item.branch_id);
                return true;
            })
            .slice(-MAX_ROLEPLAY_BRANCHES);
    }

    function roleplayBranchDisplayName(branch) {
        const id = String(branch?.branch_id || 'main');
        if (String(branch?.label || '').trim()) return String(branch.label).trim();
        if (id === 'main') return localText('Main story', '主线剧情');
        const location = String(branch?.session?.story_state?.scene?.location || '').trim();
        return location
            ? localText(`Branch · ${location}`, `分支 · ${location}`)
            : localText(`Branch ${id.slice(-8)}`, `分支 ${id.slice(-8)}`);
    }

    function roleplayStateSummary(session) {
        const normalized = normalizeRoleplaySession(session);
        const scene = normalized.story_state.scene || {};
        const runtime = normalized.story_state.characters?.[normalized.character.id] || {};
        const playerState = normalizeRoleplayPlayerState(normalized.story_state.player_state);
        const playerLabel = {
            present: localText('Player present', '玩家在场'),
            absent: localText('Player absent', '玩家离场')
        }[playerState.status];
        const parts = [scene.location, scene.time, playerLabel, runtime.condition?.[0], runtime.emotion].filter(Boolean);
        return parts.join(' · ') || localText('Roleplay setup', '角色扮演设置');
    }

    function normalizeRoleplayAutoplayState(value) {
        const source = value && typeof value === 'object' ? value : {};
        const phase = ['idle', 'running', 'paused', 'stopped', 'completed', 'error'].includes(String(source.phase || '').trim().toLowerCase())
            ? String(source.phase || '').trim().toLowerCase()
            : 'idle';
        return {
            phase,
            completed_turns: Math.max(0, Math.min(1000, Math.round(Number(source.completed_turns) || 0))),
            target_turns: Math.max(1, Math.min(100, Math.round(Number(source.target_turns) || 5))),
            continuous: !!source.continuous,
            request_id: String(source.request_id || '').trim().slice(0, 240),
            abort_controller: source.abort_controller || null,
            error: String(source.error || '').trim().slice(0, 500)
        };
    }

    function normalizeVlmVramPolicy(value) {
        const policy = String(value || '').trim().toLowerCase().replace(/-/g, '_');
        return VLM_VRAM_POLICY_CHOICES.some((item) => item.value === policy) ? policy : 'extreme';
    }

    function vlmVramPolicyLabel(value) {
        const policy = normalizeVlmVramPolicy(value);
        const item = VLM_VRAM_POLICY_CHOICES.find((entry) => entry.value === policy);
        return t(item?.label?.[0] || policy, item?.label?.[1] || policy);
    }

    function renderVlmVramPolicyOptions() {
        const selected = normalizeVlmVramPolicy(state.vramPolicy);
        return VLM_VRAM_POLICY_CHOICES.map((item) => (
            `<option value="${item.value}" ${selected === item.value ? 'selected' : ''}>${escapeHtml(t(item.label[0], item.label[1]))}</option>`
        )).join('');
    }

    function normalizeVlmKvCacheType(value) {
        const type = String(value || '').trim().toLowerCase().replace(/-/g, '_');
        return VLM_KV_CACHE_TYPE_CHOICES.some((item) => item.value === type) ? type : 'f16';
    }

    function vlmKvCacheTypeLabel(value) {
        const type = normalizeVlmKvCacheType(value);
        const item = VLM_KV_CACHE_TYPE_CHOICES.find((entry) => entry.value === type);
        return t(item?.label?.[0] || type, item?.label?.[1] || type);
    }

    function renderVlmKvCacheTypeOptions() {
        const selected = normalizeVlmKvCacheType(state.kvCacheType);
        return VLM_KV_CACHE_TYPE_CHOICES.map((item) => (
            `<option value="${item.value}" ${selected === item.value ? 'selected' : ''}>${escapeHtml(t(item.label[0], item.label[1]))}</option>`
        )).join('');
    }

    function vlmContextWindowForVersion(version) {
        const cleanVersion = resolveVlmVersion(version);
        const registry = window.SimpAICanvasWorkbenchRegistry || window.SimpAICanvasWorkbenchVlm || {};
        const catalogValue = state.vlmContextWindows?.[cleanVersion];
        const registryValue = registry.VLM_CONTEXT_WINDOWS?.[cleanVersion];
        const parsed = Number(catalogValue || registryValue || 8192);
        return Number.isFinite(parsed)
            ? Math.max(VLM_N_CTX_MIN, Math.min(Math.round(parsed), VLM_N_CTX_MAX))
            : 8192;
    }

    function vlmBackendForVersion(version) {
        const cleanVersion = resolveVlmVersion(version);
        const registry = window.SimpAICanvasWorkbenchRegistry || window.SimpAICanvasWorkbenchVlm || {};
        const catalog = Array.isArray(state.vlmModelCatalog) && state.vlmModelCatalog.length
            ? state.vlmModelCatalog
            : (Array.isArray(registry.VLM_MODEL_CATALOG) ? registry.VLM_MODEL_CATALOG : []);
        const item = catalog.find((entry) => String(entry?.id || '').trim() === cleanVersion);
        return String(item?.backend || (cleanVersion === 'Custom' ? 'custom_api' : 'llamacpp')).trim();
    }

    function normalizeVlmNctx(value, fallback = 0, maximum = VLM_N_CTX_MAX) {
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed <= 0) return Number(fallback) > 0 ? Math.round(Number(fallback)) : 0;
        const upper = Math.max(VLM_N_CTX_MIN, Math.min(Math.round(Number(maximum) || VLM_N_CTX_MAX), VLM_N_CTX_MAX));
        const rounded = Math.max(VLM_N_CTX_MIN, Math.round(parsed / VLM_N_CTX_STEP) * VLM_N_CTX_STEP);
        return Math.min(rounded, upper);
    }

    function currentVlmNctx(version = readSelectedVlmVersion()) {
        return normalizeVlmNctx(state.nCtx, 0, vlmContextWindowForVersion(version));
    }

    function normalizeChatMaxTokens(value, fallback = 0) {
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed <= 0) {
            const fallbackValue = Number(fallback);
            return Number.isFinite(fallbackValue) && fallbackValue > 0 ? Math.round(fallbackValue) : 0;
        }
        const bounded = Math.max(CHAT_MAX_TOKENS_MIN, Math.min(CHAT_MAX_TOKENS_MAX, Math.round(parsed)));
        return CHAT_MAX_TOKEN_CHOICES.reduce((nearest, choice) => (
            Math.abs(choice - bounded) < Math.abs(nearest - bounded) ? choice : nearest
        ), CHAT_MAX_TOKEN_CHOICES[0]);
    }

    function defaultChatMaxTokensForMode(mode) {
        return ['prompt', 'guide', 'creative'].includes(normalizeChatMode(mode)) ? 2048 : 3072;
    }

    function effectiveChatMaxTokens(mode = state.chatMode) {
        return normalizeChatMaxTokens(state.maxTokens, 0) || defaultChatMaxTokensForMode(mode);
    }

    function renderChatMaxTokenOptions() {
        const selected = normalizeChatMaxTokens(state.maxTokens, 0);
        const options = [
            `<option value="0" ${selected === 0 ? 'selected' : ''}>${escapeHtml(localText('Auto', '自动'))}</option>`
        ];
        CHAT_MAX_TOKEN_CHOICES.forEach((choice) => {
            options.push(`<option value="${choice}" ${selected === choice ? 'selected' : ''}>${choice}</option>`);
        });
        return options.join('');
    }

    function normalizeChatWindowLayout(value) {
        if (!value || typeof value !== 'object') return null;
        const finite = (item) => {
            const number = Number(item);
            return Number.isFinite(number) && number > 0 ? Math.round(number) : null;
        };
        const coordinate = (item) => {
            const number = Number(item);
            return Number.isFinite(number) ? Math.round(number) : null;
        };
        const left = coordinate(value.left);
        const top = coordinate(value.top);
        const width = finite(value.width);
        const height = finite(value.height);
        if (left === null && top === null && width === null && height === null) return null;
        return {
            left,
            top,
            width,
            height,
            moved: !!value.moved,
            resized: !!value.resized
        };
    }

    function storedText(source, keys, fallback = '') {
        const target = source && typeof source === 'object' ? source : {};
        for (const key of Array.isArray(keys) ? keys : [keys]) {
            const value = target[key];
            if (value === undefined || value === null) continue;
            const text = String(value).trim();
            if (text) return text;
        }
        return String(fallback || '').trim();
    }

    function storedBoolean(source, keys, fallback = false) {
        const target = source && typeof source === 'object' ? source : {};
        for (const key of Array.isArray(keys) ? keys : [keys]) {
            if (target[key] === undefined || target[key] === null) continue;
            const value = target[key];
            if (typeof value === 'string') return !['', '0', 'false', 'no', 'off'].includes(value.trim().toLowerCase());
            return !!value;
        }
        return !!fallback;
    }

    function storedChatMode(source) {
        return normalizeChatMode(storedText(source, [
            'chatMode', 'chat_mode', 'describeChatMode', 'describe_chat_mode', 'mode'
        ], 'chat'));
    }

    function defaultAutoAttachPreviousImageForMode(mode) {
        return normalizeChatMode(mode) !== 'roleplay';
    }

    function storedAutoAttachPreviousImage(source) {
        if (source?.autoAttachPreviousImage !== undefined) return source.autoAttachPreviousImage !== false;
        if (source?.auto_attach_previous_image !== undefined) return source.auto_attach_previous_image !== false;
        return defaultAutoAttachPreviousImageForMode(storedChatMode(source));
    }

    function normalizeStoredSystemPromptSelection(value) {
        const source = value && typeof value === 'object' ? value : {};
        const builtInTemplateId = storedText(source, [
            'systemPromptTemplateId', 'system_prompt_template_id', 'vlmSystemPromptTemplateId',
            'vlm_system_prompt_template_id', 'templateId', 'template_id'
        ]).slice(0, 200);
        const storedUserTemplateId = storedText(source, [
            'userSystemPromptTemplateId', 'user_system_prompt_template_id',
            'vlmUserSystemPromptTemplateId', 'vlm_user_system_prompt_template_id'
        ]).slice(0, 200);
        const storedPickerValue = storedText(source, [
            'systemPromptPickerValue', 'system_prompt_picker_value', 'systemPromptPicker',
            'system_prompt_picker', 'templatePickerValue', 'template_picker_value'
        ], builtInTemplateId || (storedUserTemplateId ? `user:${storedUserTemplateId}` : NO_SYSTEM_PROMPT_PICKER_VALUE)).slice(0, 240);
        const userPickerId = storedPickerValue.startsWith('user:')
            ? storedPickerValue.slice(5).trim()
            : '';
        const userSelected = !!userPickerId && userPickerId !== '__none__';
        if (userSelected) {
            return {
                systemPromptTemplateId: '',
                systemPromptPickerValue: `user:${userPickerId}`,
                baseSystemPromptContent: '',
                userSystemPromptTemplateId: userPickerId,
                userSystemPromptTemplateName: storedText(source, [
                    'userSystemPromptTemplateName', 'user_system_prompt_template_name'
                ]).slice(0, 200),
                userSystemPromptContent: storedText(source, [
                    'userSystemPromptContent', 'user_system_prompt_content', 'userPromptDocument',
                    'user_prompt_document'
                ]).slice(0, MAX_PERSISTED_TEXT)
            };
        }
        return {
            systemPromptTemplateId: builtInTemplateId,
            systemPromptPickerValue: storedPickerValue.startsWith('user:')
                ? (builtInTemplateId || NO_SYSTEM_PROMPT_PICKER_VALUE)
                : (storedPickerValue || builtInTemplateId || NO_SYSTEM_PROMPT_PICKER_VALUE),
            baseSystemPromptContent: storedText(source, [
                'baseSystemPromptContent', 'base_system_prompt_content', 'systemPromptDocument',
                'system_prompt_document'
            ]).slice(0, MAX_PERSISTED_TEXT),
            userSystemPromptTemplateId: '',
            userSystemPromptTemplateName: '',
            userSystemPromptContent: ''
        };
    }

    function loadChatSettings() {
        try {
            const data = JSON.parse(window.localStorage?.getItem(SETTINGS_STORAGE_KEY) || '{}');
            const selection = normalizeStoredSystemPromptSelection(data);
            return {
                chatMode: storedChatMode(data),
                customSystemPrompt: storedText(data, [
                    'customSystemPrompt', 'custom_system_prompt', 'userSystemPrompt', 'user_system_prompt',
                    'systemPrompt', 'system_prompt'
                ]),
                maxTokens: normalizeChatMaxTokens(data.maxTokens, 0),
                vramPolicy: normalizeVlmVramPolicy(data.vramPolicy),
                kvCacheType: normalizeVlmKvCacheType(data.kvCacheType || data.kv_cache_type),
                nCtx: normalizeVlmNctx(data.nCtx ?? data.n_ctx, 0),
                ...selection,
                systemPromptManualOverride: storedBoolean(data, [
                    'systemPromptManualOverride', 'system_prompt_manual_override'
                ]),
                unloadAfterChat: storedBoolean(data, ['unloadAfterChat', 'unload_after_chat']),
                windowLayout: normalizeChatWindowLayout(data.windowLayout)
            };
        } catch (err) {
            return {
                chatMode: 'chat',
                customSystemPrompt: '',
                maxTokens: 0,
                vramPolicy: 'extreme',
                kvCacheType: 'f16',
                nCtx: 0,
                systemPromptTemplateId: '',
                systemPromptPickerValue: NO_SYSTEM_PROMPT_PICKER_VALUE,
                baseSystemPromptContent: '',
                userSystemPromptTemplateId: '',
                userSystemPromptTemplateName: '',
                userSystemPromptContent: '',
                systemPromptManualOverride: false,
                unloadAfterChat: false,
                windowLayout: null
            };
        }
    }

    const savedChatSettings = loadChatSettings();
    let modalBackdropPointerStarted = false;
    let modalTouchPoint = null;
    let describeViewportSyncFrame = 0;
    let describeKeyboardSyncFrame = 0;

    const initialSystemParams = window.simpleaiTopbarSystemParams || {};
    const state = {
        __lang: String(initialSystemParams.__lang || initialSystemParams.language || getUiLang(initialSystemParams) || 'en'),
        conversationId: '',
        conversationCatalog: [],
        conversationCatalogLoaded: false,
        conversationCatalogActiveId: '',
        conversationRuntimes: new Map(),
        messages: [],
        busy: false,
        requestToken: 0,
        activeAbortController: null,
        activeRequestId: '',
        autoAttachPreviousImage: defaultAutoAttachPreviousImageForMode(savedChatSettings.chatMode),
        pendingImages: [],
        lastAutoReferencedDescribeMediaKey: '',
        describeMediaReferencePromise: null,
        missingVlmModelRequest: null,
        chatMode: savedChatSettings.chatMode,
        settingsPanelOpen: false,
        roleplaySession: normalizeRoleplaySession({}),
        roleplayBranches: [],
        roleplayPanelOpen: false,
        roleplayAutoplayState: normalizeRoleplayAutoplayState(null),
        customSystemPrompt: savedChatSettings.customSystemPrompt,
        maxTokens: savedChatSettings.maxTokens,
        vramPolicy: normalizeVlmVramPolicy(savedChatSettings.vramPolicy),
        kvCacheType: normalizeVlmKvCacheType(savedChatSettings.kvCacheType),
        nCtx: normalizeVlmNctx(savedChatSettings.nCtx, 0),
        vlmRuntimeStatusPollTimer: null,
        vlmRuntimeStatusRequest: null,
        vlmRuntimeStatus: null,
        vlmRuntimeStatusResponse: null,
        systemPromptTemplateId: savedChatSettings.systemPromptTemplateId,
        systemPromptPickerValue: savedChatSettings.systemPromptPickerValue,
        baseSystemPromptContent: savedChatSettings.baseSystemPromptContent,
        userSystemPromptTemplateId: savedChatSettings.userSystemPromptTemplateId,
        userSystemPromptTemplateName: savedChatSettings.userSystemPromptTemplateName,
        userSystemPromptContent: savedChatSettings.userSystemPromptContent,
        systemPromptManualOverride: savedChatSettings.systemPromptManualOverride,
        systemPromptTemplates: [],
        systemPromptTemplatesLoaded: false,
        systemPromptTemplatesLoading: false,
        userSystemPromptTemplates: [],
        vlmModelChoices: DESCRIBE_VLM_MODEL_CHOICES.slice(),
        vlmModelLabels: {},
        vlmModelCatalog: [],
        vlmContextWindows: {},
        vlmAllowCustom: false,
        vlmModelCatalogLoaded: false,
        vlmModelCatalogLoading: false,
        vlmModelCatalogPromise: null,
        creativePresetCatalog: [],
        creativePresetCatalogLoaded: false,
        creativePresetCatalogLoading: false,
        creativePresetCatalogPromise: null,
        creativePresetCatalogRefreshPending: false,
        creativeParameterProfiles: [],
        creativeGenerationPolls: new Map(),
        creativePreference: normalizeCreativePreference(null),
        creativePreferenceExpanded: false,
        creativeInitiative: normalizeCreativeInitiative(null),
        creativeDirectorBusy: false,
        creativeDirectorAbortController: null,
        creativeDirectorRequestId: '',
        roleplayReferenceLibrary: [],
        roleplayReferenceLibraryPromise: null,
        roleplayCharacterLibrary: [],
        roleplayCharacterLibraryLoaded: false,
        roleplayCharacterLibraryPromise: null,
        roleplayCharacterLibraryWorkspace: {
            selectedId: '',
            draft: null,
            imagePayload: null,
            imageAssetId: '',
            generationRuntime: null,
            generationRef: '',
            generationTimer: null,
            busy: false
        },
        unloadAfterChat: !!savedChatSettings.unloadAfterChat,
        windowLayout: savedChatSettings.windowLayout,
        persistenceRestored: false,
        persistenceDirty: false
    };

    function root() {
        try {
            return typeof gradioApp === 'function' ? gradioApp() : document;
        } catch (err) {
            return document;
        }
    }

    function uid(prefix) {
        return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 8)}`;
    }

    function ensureConversationId() {
        if (!state.conversationId) state.conversationId = uid('describe_vlm_chat');
        return state.conversationId;
    }

    function createConversationRuntime(source = {}) {
        const conversationId = String(source.conversationId || source.conversation_id || uid('describe_vlm_chat')).trim();
        return {
            conversationId,
            messages: Array.isArray(source.messages) ? source.messages : [],
            pendingImages: Array.isArray(source.pendingImages) ? source.pendingImages : [],
            lastAutoReferencedDescribeMediaKey: String(source.lastAutoReferencedDescribeMediaKey || ''),
            describeMediaReferencePromise: source.describeMediaReferencePromise || null,
            chatMode: storedChatMode(source),
            roleplaySession: normalizeRoleplaySession(source.roleplaySession || source.roleplay_session, conversationId),
            roleplayBranches: normalizeRoleplayBranches(source.roleplayBranches || source.roleplay_branches, conversationId),
            roleplayPanelOpen: !!source.roleplayPanelOpen,
            roleplayAutoplayState: normalizeRoleplayAutoplayState(source.roleplayAutoplayState),
            customSystemPrompt: storedText(source, [
                'customSystemPrompt', 'custom_system_prompt', 'userSystemPrompt', 'user_system_prompt',
                'systemPrompt', 'system_prompt'
            ]),
            systemPromptTemplateId: storedText(source, [
                'systemPromptTemplateId', 'system_prompt_template_id', 'vlmSystemPromptTemplateId',
                'vlm_system_prompt_template_id', 'templateId', 'template_id'
            ]),
            systemPromptPickerValue: storedText(source, [
                'systemPromptPickerValue', 'system_prompt_picker_value', 'systemPromptPicker',
                'system_prompt_picker', 'templatePickerValue', 'template_picker_value'
            ], NO_SYSTEM_PROMPT_PICKER_VALUE),
            baseSystemPromptContent: storedText(source, [
                'baseSystemPromptContent', 'base_system_prompt_content', 'systemPromptDocument',
                'system_prompt_document'
            ]),
            userSystemPromptTemplateId: storedText(source, [
                'userSystemPromptTemplateId', 'user_system_prompt_template_id',
                'vlmUserSystemPromptTemplateId', 'vlm_user_system_prompt_template_id'
            ]),
            userSystemPromptTemplateName: storedText(source, [
                'userSystemPromptTemplateName', 'user_system_prompt_template_name'
            ]),
            userSystemPromptContent: storedText(source, [
                'userSystemPromptContent', 'user_system_prompt_content', 'userPromptDocument',
                'user_prompt_document'
            ]),
            systemPromptManualOverride: storedBoolean(source, [
                'systemPromptManualOverride', 'system_prompt_manual_override'
            ]),
            autoAttachPreviousImage: storedAutoAttachPreviousImage(source),
            creativePreference: normalizeCreativePreference(source.creativePreference || source.creative_preferences),
            creativePreferenceExpanded: source.creativePreferenceExpanded !== undefined
                ? !!source.creativePreferenceExpanded
                : storedChatMode(source) === 'creative' && !normalizeCreativePreference(source.creativePreference || source.creative_preferences).prompted,
            creativeInitiative: normalizeCreativeInitiative(source.creativeInitiative || source.creative_initiative),
            unloadAfterChat: !!source.unloadAfterChat,
            busy: !!source.busy,
            requestToken: Number(source.requestToken) || 0,
            activeAbortController: source.activeAbortController || null,
            activeRequestId: String(source.activeRequestId || ''),
            creativeGenerationPolls: source.creativeGenerationPolls instanceof Map ? source.creativeGenerationPolls : new Map(),
            creativeDirectorBusy: !!source.creativeDirectorBusy,
            creativeDirectorAbortController: source.creativeDirectorAbortController || null,
            creativeDirectorRequestId: String(source.creativeDirectorRequestId || ''),
            roleplayVisualQueueBusy: false,
            persistenceDirty: !!source.persistenceDirty,
            deleted: !!source.deleted
        };
    }

    function ensureConversationRuntime(conversationId = '', source = null, options = {}) {
        const id = String(conversationId || source?.conversationId || source?.conversation_id || '').trim() || ensureConversationId();
        let runtime = state.conversationRuntimes.get(id);
        const forceRefresh = options === true || options?.forceRefresh === true;
        const sourceHasHistory = Array.isArray(source?.messages);
        const sourceIsPersisted = !!source && (
            source.schema === CONVERSATION_SCHEMA
            || source.conversation_id !== undefined
            || source.chat_mode !== undefined
            || source.system_prompt_template_id !== undefined
        );
        const autoplayPhase = normalizeRoleplayAutoplayState(runtime?.roleplayAutoplayState).phase;
        const runtimeHasLiveWork = !!(
            runtime?.busy
            || runtime?.activeAbortController
            || runtime?.activeRequestId
            || ['running', 'paused'].includes(autoplayPhase)
        );
        const runtimeHasUnsavedChanges = !!runtime?.persistenceDirty;
        const refreshFromSource = !!runtime && sourceIsPersisted && sourceHasHistory
            && !runtimeHasLiveWork && !runtimeHasUnsavedChanges;
        if (!runtime || forceRefresh || refreshFromSource) {
            runtime = createConversationRuntime(Object.assign({}, source || {}, { conversationId: id }));
            state.conversationRuntimes.set(id, runtime);
        }
        return runtime;
    }

    function currentConversationRuntime() {
        return ensureConversationRuntime(ensureConversationId(), {
            messages: state.messages,
            pendingImages: state.pendingImages,
            lastAutoReferencedDescribeMediaKey: state.lastAutoReferencedDescribeMediaKey,
            describeMediaReferencePromise: state.describeMediaReferencePromise,
            chatMode: state.chatMode,
            roleplaySession: state.roleplaySession,
            roleplayBranches: state.roleplayBranches,
            roleplayPanelOpen: state.roleplayPanelOpen,
            roleplayAutoplayState: state.roleplayAutoplayState,
            customSystemPrompt: state.customSystemPrompt,
            systemPromptTemplateId: state.systemPromptTemplateId,
            systemPromptPickerValue: state.systemPromptPickerValue,
            baseSystemPromptContent: state.baseSystemPromptContent,
            userSystemPromptTemplateId: state.userSystemPromptTemplateId,
            userSystemPromptTemplateName: state.userSystemPromptTemplateName,
            userSystemPromptContent: state.userSystemPromptContent,
            systemPromptManualOverride: state.systemPromptManualOverride,
            autoAttachPreviousImage: state.autoAttachPreviousImage,
            creativePreference: state.creativePreference,
            creativePreferenceExpanded: state.creativePreferenceExpanded,
            creativeInitiative: state.creativeInitiative,
            unloadAfterChat: state.unloadAfterChat,
            busy: state.busy,
            requestToken: state.requestToken,
            activeAbortController: state.activeAbortController,
            activeRequestId: state.activeRequestId,
            creativeGenerationPolls: state.creativeGenerationPolls,
            creativeDirectorBusy: state.creativeDirectorBusy,
            creativeDirectorAbortController: state.creativeDirectorAbortController,
            creativeDirectorRequestId: state.creativeDirectorRequestId,
            persistenceDirty: state.persistenceDirty
        });
    }

    function createEmptyConversationRuntime(source = {}, conversationId = '') {
        return createConversationRuntime({
            conversationId: conversationId || uid('describe_vlm_chat'),
            chatMode: source.chatMode,
            roleplaySession: source.copyRoleplayState ? source.roleplaySession : null,
            roleplayBranches: source.copyRoleplayState ? source.roleplayBranches : [],
            customSystemPrompt: source.customSystemPrompt,
            systemPromptTemplateId: source.systemPromptTemplateId,
            systemPromptPickerValue: source.systemPromptPickerValue,
            baseSystemPromptContent: source.baseSystemPromptContent,
            userSystemPromptTemplateId: source.userSystemPromptTemplateId,
            userSystemPromptTemplateName: source.userSystemPromptTemplateName,
            userSystemPromptContent: source.userSystemPromptContent,
            systemPromptManualOverride: source.systemPromptManualOverride,
            autoAttachPreviousImage: source.autoAttachPreviousImage,
            unloadAfterChat: source.unloadAfterChat,
            messages: [],
            pendingImages: [],
            creativePreference: normalizeCreativePreference(null),
            creativePreferenceExpanded: normalizeChatMode(source.chatMode) === 'creative',
            creativeInitiative: normalizeCreativeInitiative(null),
            busy: false,
            requestToken: 0,
            activeAbortController: null,
            activeRequestId: '',
            creativeGenerationPolls: new Map(),
            creativeDirectorBusy: false,
            creativeDirectorAbortController: null,
            creativeDirectorRequestId: '',
            persistenceDirty: false,
            deleted: false
        });
    }

    function isCurrentConversationRuntime(runtime) {
        return !!runtime && String(runtime.conversationId || '') === String(state.conversationId || '');
    }

    function syncCurrentRuntimeFromState() {
        const runtime = currentConversationRuntime();
        Object.assign(runtime, {
            conversationId: state.conversationId,
            messages: state.messages,
            pendingImages: state.pendingImages,
            lastAutoReferencedDescribeMediaKey: state.lastAutoReferencedDescribeMediaKey,
            describeMediaReferencePromise: state.describeMediaReferencePromise,
            chatMode: state.chatMode,
            roleplaySession: state.roleplaySession,
            roleplayBranches: state.roleplayBranches,
            roleplayPanelOpen: state.roleplayPanelOpen,
            roleplayAutoplayState: state.roleplayAutoplayState,
            customSystemPrompt: state.customSystemPrompt,
            systemPromptTemplateId: state.systemPromptTemplateId,
            systemPromptPickerValue: state.systemPromptPickerValue,
            baseSystemPromptContent: state.baseSystemPromptContent,
            userSystemPromptTemplateId: state.userSystemPromptTemplateId,
            userSystemPromptTemplateName: state.userSystemPromptTemplateName,
            userSystemPromptContent: state.userSystemPromptContent,
            systemPromptManualOverride: state.systemPromptManualOverride,
            autoAttachPreviousImage: state.autoAttachPreviousImage,
            creativePreference: state.creativePreference,
            creativePreferenceExpanded: state.creativePreferenceExpanded,
            creativeInitiative: state.creativeInitiative,
            unloadAfterChat: state.unloadAfterChat,
            busy: state.busy,
            requestToken: state.requestToken,
            activeAbortController: state.activeAbortController,
            activeRequestId: state.activeRequestId,
            creativeGenerationPolls: state.creativeGenerationPolls,
            creativeDirectorBusy: state.creativeDirectorBusy,
            creativeDirectorAbortController: state.creativeDirectorAbortController,
            creativeDirectorRequestId: state.creativeDirectorRequestId,
            persistenceDirty: state.persistenceDirty
        });
        return runtime;
    }

    function applyConversationRuntime(runtime) {
        if (!runtime) return false;
        state.conversationId = runtime.conversationId;
        state.messages = runtime.messages;
        state.pendingImages = runtime.pendingImages;
        state.lastAutoReferencedDescribeMediaKey = runtime.lastAutoReferencedDescribeMediaKey;
        state.describeMediaReferencePromise = runtime.describeMediaReferencePromise;
        state.chatMode = runtime.chatMode;
        state.roleplaySession = normalizeRoleplaySession(runtime.roleplaySession, runtime.conversationId);
        state.roleplayBranches = normalizeRoleplayBranches(runtime.roleplayBranches, runtime.conversationId);
        state.roleplayPanelOpen = !!runtime.roleplayPanelOpen;
        state.roleplayAutoplayState = normalizeRoleplayAutoplayState(runtime.roleplayAutoplayState);
        state.customSystemPrompt = runtime.customSystemPrompt;
        state.systemPromptTemplateId = runtime.systemPromptTemplateId;
        state.systemPromptPickerValue = runtime.systemPromptPickerValue;
        state.baseSystemPromptContent = runtime.baseSystemPromptContent;
        state.userSystemPromptTemplateId = runtime.userSystemPromptTemplateId;
        state.userSystemPromptTemplateName = runtime.userSystemPromptTemplateName;
        state.userSystemPromptContent = runtime.userSystemPromptContent;
        state.systemPromptManualOverride = runtime.systemPromptManualOverride;
        state.autoAttachPreviousImage = runtime.autoAttachPreviousImage;
        state.creativePreference = runtime.creativePreference;
        state.creativePreferenceExpanded = runtime.creativePreferenceExpanded;
        state.creativeInitiative = runtime.creativeInitiative;
        state.unloadAfterChat = runtime.unloadAfterChat;
        state.busy = runtime.busy;
        state.requestToken = runtime.requestToken;
        state.activeAbortController = runtime.activeAbortController;
        state.activeRequestId = runtime.activeRequestId;
        state.creativeGenerationPolls = runtime.creativeGenerationPolls;
        state.creativeDirectorBusy = runtime.creativeDirectorBusy;
        state.creativeDirectorAbortController = runtime.creativeDirectorAbortController;
        state.creativeDirectorRequestId = runtime.creativeDirectorRequestId;
        state.persistenceDirty = runtime.persistenceDirty;
        return true;
    }

    function setRoleplayFeedbackElement(element, message, isError = false) {
        if (!element) return false;
        const text = String(message || '').trim();
        element.textContent = text;
        element.hidden = !text;
        element.classList.toggle('is-error', !!isError);
        element.classList.toggle('is-success', !!text && !isError);
        return true;
    }

    function visibleRoleplayPanel(modal = document.getElementById('describe_vlm_chat_modal')) {
        return modal?.querySelector('[data-describe-vlm-chat-roleplay-panel]:not([hidden])') || null;
    }

    function setRoleplayActionStatus(runtime, modal, area, message, isError = false) {
        if (!isCurrentConversationRuntime(runtime)) return;
        const panel = visibleRoleplayPanel(modal);
        const feedback = panel?.querySelector(`[data-describe-vlm-chat-roleplay-action-feedback="${area}"]`);
        if (setRoleplayFeedbackElement(feedback, message, isError)) {
            setStatus('', false);
            return;
        }
        setConversationStatus(runtime, message, isError);
    }

    function setRoleplayActionBusy(modal, selector, busy) {
        const button = modal?.querySelector(selector);
        if (!button) return;
        const active = !!busy;
        button.disabled = active;
        button.classList.toggle('is-busy', active);
        button.setAttribute('aria-busy', active ? 'true' : 'false');
        const icon = button.querySelector('i');
        if (!icon) return;
        if (active) {
            if (!button.dataset.describeVlmOriginalIcon) button.dataset.describeVlmOriginalIcon = icon.className;
            icon.className = 'fa-solid fa-spinner fa-spin';
        } else if (button.dataset.describeVlmOriginalIcon) {
            icon.className = button.dataset.describeVlmOriginalIcon;
        }
    }

    function setConversationStatus(runtime, message, isError = false) {
        if (!isCurrentConversationRuntime(runtime)) return;
        const panel = visibleRoleplayPanel();
        const feedback = panel?.querySelector('[data-describe-vlm-chat-roleplay-feedback]');
        if (setRoleplayFeedbackElement(feedback, message, isError)) {
            setStatus('', false);
            return;
        }
        setStatus(message, isError);
    }

    function localText(en, cn) {
        const lang = String(state.__lang || getUiLang?.(state) || '').toLowerCase();
        return lang.startsWith('zh') || lang.startsWith('cn') ? cn : en;
    }

    function creativePreferenceLabel(preference = state.creativePreference) {
        const current = normalizeCreativePreference(preference);
        if (current.parameter_profile) {
            return current.preset ? `${current.preset} · ${current.parameter_profile}` : current.parameter_profile;
        }
        if (current.preset) return current.preset;
        if (current.style === 'anime') return localText('Anime', '动漫');
        if (current.style === 'realistic') return localText('Realistic', '写实');
        if (current.style === 'auto') return localText('Let Agent decide', '交给 Agent');
        return localText('Not selected', '未选择');
    }

    function applyCreativePreferenceToPendingActions(preference = state.creativePreference, runtime = null) {
        const target = runtime || currentConversationRuntime();
        const preset = String(preference?.preset || '').trim();
        if (!preset) return;
        const entry = creativePresetEntry(preset);
        const parameterProfile = creativeParameterProfileEntry(preference?.parameter_profile, preset);
        target.messages.forEach((message) => {
            (Array.isArray(message?.actions) ? message.actions : []).forEach((action) => {
                if (!['generate_image', 'offer_image'].includes(action?.type)) return;
                const generationState = String(action.generation?.state || 'awaiting_confirmation').toLowerCase();
                const inputCount = Array.isArray(action.media_inputs) ? action.media_inputs.length : 0;
                const task = creativeActionTask(action, inputCount);
                if (
                    (
                        ['awaiting_confirmation', 'models_missing', 'preset_missing', 'needs_media', 'needs_mask', 'needs_interaction', 'no_compatible_route'].includes(generationState)
                        || ['parameter_profile_missing', 'parameter_profile_incompatible'].includes(generationState)
                    )
                    && entry
                    && creativePresetHasTaskRoute(entry, task, inputCount)
                ) {
                    action.preset = preset;
                    action.preset_source = 'session_preference';
                    action.parameter_profile = String(parameterProfile?.name || '');
                    action.execution_plan = creativeExecutionPlanForEntry(action, entry, 'session_preference');
                    action.generation = action.generation || { assets: [] };
                    action.generation.state = action.execution_plan.status === 'ready' ? 'awaiting_confirmation' : action.execution_plan.status;
                    action.generation.error = '';
                }
            });
        });
    }

    function setCreativePreference(value, source = 'user', runtime = null) {
        const target = runtime || currentConversationRuntime();
        const commitsRoute = value && ['style', 'preset', 'parameter_profile'].some((key) => Object.prototype.hasOwnProperty.call(value, key));
        const requested = Object.assign({}, target.creativePreference || {}, value || {});
        const selectedProfile = creativeParameterProfileEntry(requested.parameter_profile, requested.preset);
        if (selectedProfile) requested.preset = selectedProfile.preset;
        if (requested.parameter_profile && !selectedProfile) requested.parameter_profile = '';
        const next = normalizeCreativePreference(Object.assign({}, requested, {
            prompted: true,
            source,
            updated_at: new Date().toISOString()
        }));
        target.creativePreference = next;
        if (commitsRoute) target.creativePreferenceExpanded = false;
        // Current UI mirror: if (commitsRoute) state.creativePreferenceExpanded = false;
        applyCreativePreferenceToPendingActions(next, target);
        target.persistenceDirty = true;
        if (isCurrentConversationRuntime(target)) {
            state.creativePreference = next;
            state.creativePreferenceExpanded = target.creativePreferenceExpanded;
            state.persistenceDirty = true;
            renderMessages();
            setStatus(localText(`Creative preference: ${creativePreferenceLabel(next)}`, `创作偏好：${creativePreferenceLabel(next)}`));
        }
        saveConversationSnapshot(target);
        return next;
    }

    function saveChatSettings() {
        try {
            window.localStorage?.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
                chatMode: state.chatMode,
                customSystemPrompt: state.customSystemPrompt,
                maxTokens: normalizeChatMaxTokens(state.maxTokens, 0),
                vramPolicy: normalizeVlmVramPolicy(state.vramPolicy),
                kvCacheType: normalizeVlmKvCacheType(state.kvCacheType),
                nCtx: currentVlmNctx(),
                systemPromptTemplateId: state.systemPromptTemplateId,
                systemPromptPickerValue: state.systemPromptPickerValue,
                baseSystemPromptContent: state.baseSystemPromptContent,
                userSystemPromptTemplateId: state.userSystemPromptTemplateId,
                userSystemPromptTemplateName: state.userSystemPromptTemplateName,
                userSystemPromptContent: state.userSystemPromptContent,
                systemPromptManualOverride: !!state.systemPromptManualOverride,
                unloadAfterChat: !!state.unloadAfterChat,
                windowLayout: state.windowLayout || null
            }));
        } catch (err) {
            // Ignore storage failures in private or restricted browser contexts.
        }
        if (state.persistenceRestored && state.conversationCatalogLoaded) saveConversationSnapshot();
    }

    function chatInputPlaceholder(mode) {
        const currentMode = normalizeChatMode(mode);
        if (currentMode === 'roleplay') {
            return localText('Write what your character says or does...', '输入玩家要说的话或要做的事...');
        }
        if (currentMode === 'creative') {
            return localText('Describe an image to create...', '描述你想生成的图片...');
        }
        if (currentMode === 'prompt') {
            return t('Ask it to prepare or refine a prompt...', '让它整理或优化提示词...');
        }
        if (currentMode === 'guide') {
            return t('Ask which SimpAI workflow or feature to use...', '询问该使用 SimpAI 的哪个流程或功能...');
        }
        if (currentMode === 'raw') {
            return t('Raw model chat...', '原始模型对话...');
        }
        return t('Chat naturally, ask about the image, or request a prompt...', '正常聊天、询问图片，或要求整理提示词...');
    }

    function defaultMessageForMode(mode, attachments = []) {
        const currentMode = normalizeChatMode(mode);
        const hasVideo = (Array.isArray(attachments) ? attachments : []).some((item) => mediaKind(item) === 'video');
        if (hasVideo) {
            if (currentMode === 'creative') return localText('Create an image inspired by the attached video.', '参考附加视频创作一张新图。');
            if (currentMode === 'prompt') return t('Please analyze the attached video and prepare a prompt.', '请分析附加视频，并整理成提示词。');
            if (currentMode === 'guide') return t('Please recommend a suitable SimpAI workflow for this video.', '请根据这段视频推荐适合的 SimpAI 工作流。');
            return t('Please analyze the attached video.', '请分析附加视频。');
        }
        if (currentMode === 'creative') {
            return localText('Create an image inspired by the attached reference.', '参考附加图片创作一张新图。');
        }
        if (currentMode === 'prompt') {
            return t('Please analyze the attached reference image and prepare a prompt.', '请分析附加引用图，并整理成提示词。');
        }
        if (currentMode === 'guide') {
            return t('Please recommend a suitable SimpAI workflow for this image.', '请根据这张图推荐适合的 SimpAI 工作流。');
        }
        return t('Please analyze the attached reference image.', '请分析附加引用图。');
    }

    function parseCreativeRunCommand(value) {
        const source = String(value || '').replace(/\r\n/g, '\n').trim();
        if (!source) return null;
        const lines = source.split('\n');
        const firstLine = String(lines.shift() || '').trim();
        if (!/^\/run(?![A-Za-z0-9_])/i.test(firstLine)) return null;
        const inlinePrompt = firstLine.slice(4).trim();
        const multilinePrompt = lines.join('\n').trim();
        return {
            command: 'run',
            prompt: [inlinePrompt, multilinePrompt].filter(Boolean).join('\n').trim(),
        };
    }

    function shouldSendCurrentPromptToVlm(mode, message) {
        return normalizeChatMode(mode) === 'prompt';
    }

    function chatModeHint(mode) {
        const normalized = normalizeChatMode(mode);
        if (normalized === 'roleplay') {
            return localText(
                'Roleplay uses a character card and dynamic story state. The director updates state after each reply.',
                '角色扮演使用角色卡和动态剧情状态，导演会在每次回复后更新状态。'
            );
        }
        if (normalized === 'chat') {
            return t(
                'For direct image generation or editing, switch to Creative mode. Use Guide Mode for feature recommendations.',
                '需要直接生成或编辑图片时，请切换到创作模式；功能推荐可使用向导模式。'
            );
        }
        if (normalized === 'creative') {
            return t(
                'Generate images directly, or reference one or more images for editing.',
                '可直接生成图片，也可引用一张或多张图片进行编辑。'
            );
        }
        if (normalized === 'guide') {
            return t(
                'Get workflow and Preset recommendations here. Switch to Creative mode to generate or edit images directly.',
                '用于推荐合适的功能和 Preset；需要直接生成或编辑图片时，请切换到创作模式。'
            );
        }
        return '';
    }

    function conversationTitleForRecord(record, index = 0) {
        const firstUserMessage = (Array.isArray(record?.messages) ? record.messages : [])
            .find((item) => item?.role === 'user' && String(item.content || '').trim());
        const text = String(firstUserMessage?.content || '').replace(/\s+/g, ' ').trim();
        if (!text) return localText(`New conversation ${index + 1}`, `新对话 ${index + 1}`);
        return `${text.slice(0, 48)}${text.length > 48 ? '...' : ''}`;
    }

    function conversationRecordsForView() {
        const records = Array.isArray(state.conversationCatalog)
            ? state.conversationCatalog.slice()
            : [];
        const currentId = String(state.conversationId || '').trim() || ensureConversationId();
        const hasCurrent = records.some((record) => String(record?.conversation_id || '').trim() === currentId);
        if (!hasCurrent) records.push(conversationPayload());
        return records;
    }

    function conversationDisplayTitles(records) {
        const titles = (Array.isArray(records) ? records : [])
            .map((record, index) => conversationTitleForRecord(record, index));
        const totals = new Map();
        titles.forEach((title) => totals.set(title, (totals.get(title) || 0) + 1));
        const occurrences = new Map();
        return titles.map((title) => {
            const occurrence = (occurrences.get(title) || 0) + 1;
            occurrences.set(title, occurrence);
            return totals.get(title) > 1 ? `${occurrence}. ${title}` : title;
        });
    }

    function renderConversationOptions() {
        const records = conversationRecordsForView();
        const titles = conversationDisplayTitles(records);
        return records.map((record, index) => {
            const id = String(record?.conversation_id || state.conversationId || ensureConversationId()).trim();
            return `<option value="${escapeHtml(id)}" ${id === state.conversationId ? 'selected' : ''}>${escapeHtml(titles[index] || conversationTitleForRecord(record, index))}</option>`;
        }).join('');
    }

    function renderConversationTabs() {
        const records = conversationRecordsForView();
        const titles = conversationDisplayTitles(records);
        return records.map((record, index) => {
            const id = String(record?.conversation_id || state.conversationId || ensureConversationId()).trim();
            const title = titles[index] || conversationTitleForRecord(record, index);
            const active = id === state.conversationId;
            const canDelete = state.conversationCatalog.some((item) => String(item?.conversation_id || '').trim() === id);
            const deleteButton = canDelete
                ? `<button type="button" class="describe-vlm-chat-conversation-delete" data-describe-vlm-chat-conversation-delete="${escapeHtml(id)}" title="${escapeHtml(t('Delete conversation', '删除对话'))}" aria-label="${escapeHtml(t('Delete conversation', '删除对话'))}"><i class="fa-solid fa-trash"></i></button>`
                : '';
            return `<div class="describe-vlm-chat-conversation-tab-row"><button type="button" class="describe-vlm-chat-conversation-tab${active ? ' is-active' : ''}" data-describe-vlm-chat-conversation-tab="${escapeHtml(id)}"${active ? ' aria-current="page"' : ''} title="${escapeHtml(title)}"><span>${escapeHtml(title)}</span></button>${deleteButton}</div>`;
        }).join('');
    }

    function syncConversationControls(modal) {
        const select = modal?.querySelector?.('[data-describe-vlm-chat-conversation-select]');
        if (select) {
            select.innerHTML = renderConversationOptions();
            select.value = state.conversationId;
        }
        const tabs = modal?.querySelector?.('[data-describe-vlm-chat-conversation-tabs]');
        if (tabs) {
            tabs.innerHTML = renderConversationTabs();
            const activeTab = tabs.querySelector('.describe-vlm-chat-conversation-tab.is-active');
            if (activeTab) {
                window.requestAnimationFrame(() => {
                    if (activeTab.isConnected) activeTab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
                });
            }
        }
    }

    function syncChatSettingsControls(modal) {
        if (!modal) return;
        syncConversationControls(modal);
        const mode = modal.querySelector('[data-describe-vlm-chat-mode]');
        const maxTokens = modal.querySelector('[data-describe-vlm-chat-max-tokens]');
        const vramPolicy = modal.querySelector('[data-describe-vlm-chat-vram-policy]');
        const kvCacheType = modal.querySelector('[data-describe-vlm-chat-kv-cache-type]');
        const nCtx = modal.querySelector('[data-describe-vlm-chat-n-ctx]');
        const system = modal.querySelector('[data-describe-vlm-chat-system]');
        const input = modal.querySelector('[data-describe-vlm-chat-input]');
        const unload = modal.querySelector('[data-describe-vlm-chat-unload-after]');
        const autoImage = modal.querySelector('[data-describe-vlm-chat-auto-previous-image]');
        const roleplayVisualDraft = modal.querySelector('[data-describe-vlm-chat-roleplay-visual-draft]');
        const modeHint = modal.querySelector('[data-describe-vlm-chat-mode-hint]');
        const settings = modal.querySelector('.describe-vlm-chat-controls');
        const settingsToggle = modal.querySelector('[data-describe-vlm-chat-settings-toggle]');
        if (settings) settings.classList.toggle('is-collapsed', !state.settingsPanelOpen);
        if (settingsToggle) {
            settingsToggle.setAttribute('aria-expanded', state.settingsPanelOpen ? 'true' : 'false');
            settingsToggle.classList.toggle('is-active', state.settingsPanelOpen);
            settingsToggle.title = localText(
                state.settingsPanelOpen ? 'Hide chat settings' : 'Open chat settings',
                state.settingsPanelOpen ? '收起对话设置' : '打开对话设置'
            );
            settingsToggle.setAttribute('aria-label', settingsToggle.title);
        }
        if (mode) mode.value = state.chatMode;
        if (maxTokens) {
            maxTokens.innerHTML = renderChatMaxTokenOptions();
            maxTokens.value = String(normalizeChatMaxTokens(state.maxTokens, 0));
        }
        if (vramPolicy) {
            vramPolicy.innerHTML = renderVlmVramPolicyOptions();
            vramPolicy.value = normalizeVlmVramPolicy(state.vramPolicy);
        }
        if (kvCacheType) {
            kvCacheType.innerHTML = renderVlmKvCacheTypeOptions();
            kvCacheType.value = normalizeVlmKvCacheType(state.kvCacheType);
        }
        if (nCtx) {
            const version = resolveVlmVersion(readSelectedVlmVersion());
            const contextWindow = vlmContextWindowForVersion(version);
            state.nCtx = currentVlmNctx(version);
            nCtx.min = String(VLM_N_CTX_MIN);
            nCtx.max = String(contextWindow);
            nCtx.step = String(VLM_N_CTX_STEP);
            nCtx.value = state.nCtx > 0 ? String(state.nCtx) : '';
            nCtx.placeholder = localText('Auto', '自动');
            nCtx.disabled = vlmBackendForVersion(version) !== 'llamacpp';
        }
        syncSystemPromptTemplateControls(modal);
        if (system && system.value !== state.customSystemPrompt) system.value = state.customSystemPrompt;
        if (unload) unload.checked = !!state.unloadAfterChat;
        if (autoImage) autoImage.checked = !!state.autoAttachPreviousImage;
        if (roleplayVisualDraft) roleplayVisualDraft.hidden = state.chatMode !== 'roleplay';
        if (modeHint) {
            const hint = chatModeHint(state.chatMode);
            modeHint.textContent = hint;
            modeHint.hidden = !hint;
        }
        if (input) input.setAttribute('placeholder', chatInputPlaceholder(state.chatMode));
        updateAnswerModelIndicator(modal);
        updateVlmRuntimeStatus(modal);
        syncRoleplayControls(modal);
    }

    function roleplayCharacterEntries(session) {
        const normalized = normalizeRoleplaySession(session);
        return Object.values(normalized.characters || {}).slice(0, MAX_ROLEPLAY_CHARACTERS);
    }

    function renderRoleplayCharacterSelector(modal, session) {
        const select = modal?.querySelector('[data-describe-vlm-chat-roleplay-character-select]');
        if (!select) return;
        const normalized = normalizeRoleplaySession(session);
        select.innerHTML = roleplayCharacterEntries(normalized).map((character) => {
            const label = String(character.name || character.id || localText('Unnamed character', '未命名角色')).trim();
            return `<option value="${escapeHtml(character.id)}">${escapeHtml(label)}</option>`;
        }).join('');
        select.value = normalized.active_character_id;
    }

    function roleplayCharacterHasDetails(character) {
        const source = character && typeof character === 'object' ? character : {};
        const name = String(source.name || '').trim();
        return [
            name && !['new character', '新角色'].includes(name.toLowerCase()) ? name : '',
            source.identity,
            source.background,
            source.personality,
            source.speech_style
        ].some((value) => String(value || '').trim());
    }

    function normalizeRoleplayCharacterLibraryCard(value) {
        const source = value && typeof value === 'object' ? value : {};
        const id = String(source.id || source.character_id || '').trim() || uid('character');
        const session = normalizeRoleplaySession({
            character: Object.assign({}, source, { id }),
            characters: { [id]: Object.assign({}, source, { id }) },
            active_character_id: id
        });
        return session.characters?.[id] || session.character;
    }

    function renderRoleplayCharacterLibraryOptions() {
        const options = [
            `<option value="">${escapeHtml(localText('Character library', '角色库'))}</option>`
        ];
        state.roleplayCharacterLibrary.forEach((item) => {
            const card = normalizeRoleplayCharacterLibraryCard(item?.character || item);
            const label = [card.name || card.id, card.identity].filter(Boolean).join(' · ');
            options.push(`<option value="${escapeHtml(card.id)}">${escapeHtml(label)}</option>`);
        });
        return options.join('');
    }

    function syncRoleplayCharacterLibraryControls(modal) {
        const select = modal?.querySelector('[data-describe-vlm-chat-roleplay-character-library-select]');
        if (!select) return;
        const selected = String(select.value || '').trim();
        select.innerHTML = renderRoleplayCharacterLibraryOptions();
        if (selected && Array.from(select.options || []).some((option) => option.value === selected)) {
            select.value = selected;
        }
        const hasSelection = !!select.value;
        ['load', 'delete'].forEach((action) => {
            const button = modal.querySelector(`[data-describe-vlm-chat-roleplay-character-library-${action}]`);
            if (button) button.disabled = !hasSelection;
        });
    }

    async function ensureRoleplayCharacterLibrary(modal, force = false) {
        if (force) {
            state.roleplayCharacterLibraryLoaded = false;
            state.roleplayCharacterLibraryPromise = null;
        }
        if (state.roleplayCharacterLibraryLoaded) {
            syncRoleplayCharacterLibraryControls(modal);
            return state.roleplayCharacterLibrary;
        }
        if (state.roleplayCharacterLibraryPromise) return state.roleplayCharacterLibraryPromise;
        const userContext = creativeUserContext();
        state.roleplayCharacterLibraryPromise = postJson('/describe-image/vlm-roleplay/characters/list', {
            user_did: userContext?.user_did || '',
            __lang: state.__lang,
            lang: state.__lang
        })
            .then((response) => {
                state.roleplayCharacterLibrary = Array.isArray(response?.characters)
                    ? response.characters.map(normalizeRoleplayCharacterLibraryCard)
                    : [];
                state.roleplayCharacterLibraryLoaded = true;
                syncRoleplayCharacterLibraryControls(modal);
                return state.roleplayCharacterLibrary;
            })
            .catch(() => {
                state.roleplayCharacterLibrary = [];
                state.roleplayCharacterLibraryLoaded = true;
                syncRoleplayCharacterLibraryControls(modal);
                return [];
            })
            .finally(() => {
                state.roleplayCharacterLibraryPromise = null;
            });
        return state.roleplayCharacterLibraryPromise;
    }

    function roleplayCharacterIdForLibraryCard(session, sourceId) {
        const normalized = normalizeRoleplaySession(session);
        const existing = new Set(Object.keys(normalized.characters || {}));
        const base = String(sourceId || 'character').trim().replace(/[^A-Za-z0-9_.:@-]+/g, '_') || 'character';
        let id = base;
        let suffix = 2;
        while (existing.has(id)) {
            id = `${base}_${suffix}`;
            suffix += 1;
        }
        return id;
    }

    async function loadRoleplayCharacterFromLibrary(runtime = currentConversationRuntime(), modal = document.getElementById('describe_vlm_chat_modal')) {
        const target = runtime || currentConversationRuntime();
        const selectedId = String(modal?.querySelector('[data-describe-vlm-chat-roleplay-character-library-select]')?.value || '').trim();
        if (!selectedId) return false;
        const userContext = creativeUserContext();
        const response = await postJson('/describe-image/vlm-roleplay/characters/load', {
            character_id: selectedId,
            user_did: userContext?.user_did || '',
            __lang: state.__lang,
            lang: state.__lang
        });
        if (!response?.ok || !response.character) {
            setConversationStatus(target, localText('The selected library character could not be loaded.', '选中的角色库角色无法加载。'), true);
            return false;
        }
        let session = applyVisibleRoleplayCharacterFields(
            normalizeRoleplaySession(target.roleplaySession, target.conversationId),
            modal
        );
        const currentId = session.active_character_id;
        const currentCard = session.characters?.[currentId] || session.character;
        const targetId = roleplayCharacterHasDetails(currentCard) ? roleplayCharacterIdForLibraryCard(session, response.character.id) : currentId;
        const card = Object.assign({}, normalizeRoleplayCharacterLibraryCard(response.character), { id: targetId });
        session.characters[targetId] = card;
        session.story_state.characters[targetId] = session.story_state.characters[targetId] || {
            location: '', condition: [], appearance: '', current_appearance_asset_ids: [],
            appearance_revision: 0, appearance_updated_turn_id: '', emotion: '',
            current_action: '', inventory: [], goals: []
        };
        const presentCharacterIds = Array.isArray(session.story_state.scene.present_character_ids)
            ? session.story_state.scene.present_character_ids
            : [];
        if (!presentCharacterIds.includes(targetId)) {
            presentCharacterIds.push(targetId);
        }
        session.story_state.scene.present_character_ids = presentCharacterIds.slice(0, MAX_ROLEPLAY_CHARACTERS);
        session.active_character_id = targetId;
        session.character = card;
        target.roleplaySession = normalizeRoleplaySession(session, target.conversationId);
        delete target.roleplayReferenceDraft;
        target.persistenceDirty = true;
        if (isCurrentConversationRuntime(target)) state.roleplaySession = target.roleplaySession;
        saveConversationSnapshot(target);
        syncRoleplayControls(modal, target);
        setConversationStatus(target, localText(`Loaded character ${card.name || card.id}.`, `已加载角色：${card.name || card.id}。`));
        return true;
    }

    async function saveRoleplayCharacterToLibrary(runtime = currentConversationRuntime(), modal = document.getElementById('describe_vlm_chat_modal')) {
        const target = runtime || currentConversationRuntime();
        const session = applyVisibleRoleplayCharacterFields(
            normalizeRoleplaySession(target.roleplaySession, target.conversationId),
            modal
        );
        const card = session.characters?.[session.active_character_id] || session.character;
        if (!roleplayCharacterHasDetails(card) || !String(card.name || '').trim()) {
            setConversationStatus(target, localText('Give the character a name before saving it to the library.', '请先填写角色名称，再保存到角色库。'), true);
            return false;
        }
        target.roleplaySession = normalizeRoleplaySession(session, target.conversationId);
        const userContext = creativeUserContext();
        const response = await postJson('/describe-image/vlm-roleplay/characters/save', {
            character: card,
            user_did: userContext?.user_did || '',
            __lang: state.__lang,
            lang: state.__lang
        });
        if (!response?.ok || !response.character) {
            setConversationStatus(target, localText('The character could not be saved to the library.', '角色保存到角色库失败。'), true);
            return false;
        }
        const saved = normalizeRoleplayCharacterLibraryCard(response.character);
        state.roleplayCharacterLibrary = [
            saved,
            ...state.roleplayCharacterLibrary.filter((item) => String(item?.id || '') !== saved.id)
        ];
        state.roleplayCharacterLibraryLoaded = true;
        target.persistenceDirty = true;
        if (isCurrentConversationRuntime(target)) state.roleplaySession = target.roleplaySession;
        saveConversationSnapshot(target);
        syncRoleplayControls(modal, target);
        const select = modal?.querySelector('[data-describe-vlm-chat-roleplay-character-library-select]');
        if (select) select.value = saved.id;
        setConversationStatus(target, localText(`Character ${saved.name} saved to the library.`, `角色“${saved.name}”已保存到角色库。`));
        return true;
    }

    async function deleteRoleplayCharacterFromLibrary(runtime = currentConversationRuntime(), modal = document.getElementById('describe_vlm_chat_modal')) {
        const target = runtime || currentConversationRuntime();
        const select = modal?.querySelector('[data-describe-vlm-chat-roleplay-character-library-select]');
        const selectedId = String(select?.value || '').trim();
        if (!selectedId) return false;
        const userContext = creativeUserContext();
        const response = await postJson('/describe-image/vlm-roleplay/characters/delete', {
            character_id: selectedId,
            user_did: userContext?.user_did || '',
            __lang: state.__lang,
            lang: state.__lang
        });
        if (!response?.ok) {
            setConversationStatus(target, localText('The library character could not be deleted.', '角色库角色删除失败。'), true);
            return false;
        }
        state.roleplayCharacterLibrary = state.roleplayCharacterLibrary.filter((item) => String(item?.id || '') !== selectedId);
        syncRoleplayCharacterLibraryControls(modal);
        setConversationStatus(target, localText('Library character deleted.', '角色库角色已删除。'));
        return true;
    }

    function roleplayCharacterLibraryWorkspaceState() {
        if (!state.roleplayCharacterLibraryWorkspace || typeof state.roleplayCharacterLibraryWorkspace !== 'object') {
            state.roleplayCharacterLibraryWorkspace = {};
        }
        const workspace = state.roleplayCharacterLibraryWorkspace;
        if (!Object.prototype.hasOwnProperty.call(workspace, 'selectedId')) workspace.selectedId = '';
        if (!Object.prototype.hasOwnProperty.call(workspace, 'draft')) workspace.draft = null;
        if (!Object.prototype.hasOwnProperty.call(workspace, 'imagePayload')) workspace.imagePayload = null;
        if (!Object.prototype.hasOwnProperty.call(workspace, 'imageAssetId')) workspace.imageAssetId = '';
        if (!Object.prototype.hasOwnProperty.call(workspace, 'generationRuntime')) workspace.generationRuntime = null;
        if (!Object.prototype.hasOwnProperty.call(workspace, 'generationRef')) workspace.generationRef = '';
        if (!Object.prototype.hasOwnProperty.call(workspace, 'generationTimer')) workspace.generationTimer = null;
        if (!Object.prototype.hasOwnProperty.call(workspace, 'busy')) workspace.busy = false;
        return workspace;
    }

    function emptyRoleplayCharacterLibraryCard() {
        return normalizeRoleplayCharacterLibraryCard({
            id: uid('character'),
            name: '',
            identity: '',
            background: '',
            personality: '',
            speech_style: '',
            behavior_rules: [],
            first_message: '',
            example_dialogues: [],
            image_prompt: '',
            negative_prompt: ''
        });
    }

    function roleplayCharacterLibrarySession(card) {
        const normalized = normalizeRoleplayCharacterLibraryCard(card);
        return normalizeRoleplaySession({
            id: `character_library_${normalized.id}`,
            character: normalized,
            characters: { [normalized.id]: normalized },
            active_character_id: normalized.id,
            story_state: {
                scene: {
                    location: '',
                    time: '',
                    weather: '',
                    present_character_ids: [normalized.id],
                    current_event: '',
                    scene_goal: ''
                }
            }
        }, `character_library_${normalized.id}`);
    }

    function roleplayCharacterLibraryAsset(assetId) {
        const id = String(assetId || '').trim();
        if (!id) return null;
        return state.roleplayReferenceLibrary.find((asset) => String(asset?.asset_id || '').trim() === id) || null;
    }

    function roleplayCharacterLibraryPreview(assetId, fallback = '') {
        const preview = roleplayReferencePreviewUrl(assetId);
        return preview || String(fallback || '').trim();
    }

    function roleplayCharacterLibraryCardAssets(card) {
        const ids = [card?.avatar_asset_id, ...(Array.isArray(card?.reference_asset_ids) ? card.reference_asset_ids : [])]
            .map((value) => String(value || '').trim())
            .filter(Boolean);
        return Array.from(new Set(ids)).slice(0, MAX_ROLEPLAY_REFERENCE_IMAGES);
    }

    function roleplayCharacterLibraryHistoryEntries(card) {
        return Array.isArray(card?.state_image_history)
            ? card.state_image_history.filter((item) => item && Array.isArray(item.asset_ids) && item.asset_ids.length)
                .slice(0, MAX_ROLEPLAY_STATE_IMAGE_HISTORY)
            : [];
    }

    function roleplayCharacterLibraryMainAssetId(card) {
        return String(
            card?.avatar_asset_id
            || card?.reference_asset_ids?.[0]
            || roleplayCharacterLibraryHistoryEntries(card)[0]?.asset_ids?.[0]
            || ''
        ).trim();
    }

    function roleplayCharacterLibraryHistoryEntry(card, assetId) {
        const id = roleplayReferenceIdentity(assetId);
        return roleplayCharacterLibraryHistoryEntries(card).find((item) =>
            (item.asset_ids || []).some((value) => roleplayReferenceIdentity(value) === id)
        ) || null;
    }

    function addRoleplayCharacterLibraryHistoryEntry(card, assetIds, metadata = {}) {
        const ids = Array.from(new Set((Array.isArray(assetIds) ? assetIds : [assetIds])
            .map((value) => String(value || '').trim())
            .filter(Boolean))).slice(0, 3);
        if (!ids.length) return card;
        const existing = roleplayCharacterLibraryHistoryEntries(card);
        const key = ids.map((value) => roleplayReferenceIdentity(value)).join('|');
        const next = existing.filter((item) =>
            (item.asset_ids || []).map((value) => roleplayReferenceIdentity(value)).join('|') !== key
        );
        next.unshift({
            id: String(metadata.id || uid('state_image')).slice(0, 160),
            asset_ids: ids,
            label: String(metadata.label || '').slice(0, 200),
            appearance: String(metadata.appearance || '').slice(0, 1200),
            state_text: String(metadata.state_text || '').slice(0, MAX_ROLEPLAY_STATE_TEXT),
            state_fields: normalizeRoleplayStateFields(metadata.state_fields),
            source: String(metadata.source || 'roleplay').slice(0, 80),
            turn_id: String(metadata.turn_id || '').slice(0, 200),
            created_at: String(metadata.created_at || new Date().toISOString()).slice(0, 80)
        });
        card.state_image_history = next.slice(0, MAX_ROLEPLAY_STATE_IMAGE_HISTORY);
        return card;
    }

    function mergeRoleplayCharacterLibraryAgentDraft(base, candidate, mode = 'character') {
        const current = normalizeRoleplayCharacterLibraryCard(base);
        const incoming = normalizeRoleplayCharacterLibraryCard(candidate);
        const next = Object.assign({}, current);
        const fields = mode === 'visual'
            ? ['image_prompt', 'negative_prompt']
            : ['name', 'identity', 'background', 'personality', 'speech_style', 'first_message', 'image_prompt', 'negative_prompt'];
        fields.forEach((field) => {
            const value = String(incoming[field] || '').trim();
            if (value) next[field] = value;
        });
        if (mode !== 'visual') {
            if (incoming.behavior_rules.length) next.behavior_rules = incoming.behavior_rules;
            if (incoming.example_dialogues.length) next.example_dialogues = incoming.example_dialogues;
        }
        next.id = current.id;
        next.avatar_asset_id = current.avatar_asset_id;
        next.reference_asset_ids = current.reference_asset_ids;
        next.state_image_history = current.state_image_history;
        return normalizeRoleplayCharacterLibraryCard(next);
    }

    function roleplayCharacterLibraryFeedback(modal, message, isError = false) {
        const feedback = modal?.querySelector('[data-roleplay-character-library-feedback]');
        if (!feedback) return;
        feedback.textContent = String(message || '');
        feedback.dataset.state = isError ? 'error' : message ? 'info' : '';
    }

    function roleplayCharacterLibraryFormValue(modal, name) {
        return String(modal?.querySelector(`[data-roleplay-character-library-${name}]`)?.value || '').trim();
    }

    function readRoleplayCharacterLibraryForm(modal) {
        const workspace = roleplayCharacterLibraryWorkspaceState();
        if (!workspace.draft || !modal) return workspace.draft;
        const draft = workspace.draft;
        draft.name = roleplayCharacterLibraryFormValue(modal, 'name').slice(0, 200);
        draft.identity = roleplayCharacterLibraryFormValue(modal, 'identity').slice(0, MAX_PERSISTED_TEXT);
        draft.background = roleplayCharacterLibraryFormValue(modal, 'background').slice(0, MAX_PERSISTED_TEXT);
        draft.personality = roleplayCharacterLibraryFormValue(modal, 'personality').slice(0, MAX_PERSISTED_TEXT);
        draft.speech_style = roleplayCharacterLibraryFormValue(modal, 'speech-style').slice(0, MAX_PERSISTED_TEXT);
        draft.behavior_rules = roleplayCharacterLibraryFormValue(modal, 'behavior').split(/\r?\n/).map((item) => item.trim()).filter(Boolean).slice(0, 40);
        draft.first_message = roleplayCharacterLibraryFormValue(modal, 'first-message').slice(0, MAX_PERSISTED_TEXT);
        draft.image_prompt = roleplayCharacterLibraryFormValue(modal, 'image-prompt').slice(0, MAX_PERSISTED_TEXT);
        draft.negative_prompt = roleplayCharacterLibraryFormValue(modal, 'negative-prompt').slice(0, 4000);
        return draft;
    }

    function renderRoleplayCharacterLibraryList(modal) {
        const workspace = roleplayCharacterLibraryWorkspaceState();
        const list = modal?.querySelector('[data-roleplay-character-library-list]');
        if (!list) return;
        const query = String(modal.querySelector('[data-roleplay-character-library-search]')?.value || '').trim().toLowerCase();
        const rows = state.roleplayCharacterLibrary
            .map((item) => normalizeRoleplayCharacterLibraryCard(item?.character || item))
            .filter((card) => {
                if (!query) return true;
                return [card.name, card.identity, card.background].some((value) => String(value || '').toLowerCase().includes(query));
            });
        if (!rows.length) {
            list.innerHTML = `<div class="describe-vlm-chat-character-library-empty">${escapeHtml(query ? localText('No matching characters.', '没有匹配的角色。') : localText('No characters yet.', '还没有角色。'))}</div>`;
            return;
        }
        list.innerHTML = rows.map((card) => {
            const id = String(card.id || '').trim();
            const preview = roleplayCharacterLibraryPreview(roleplayCharacterLibraryMainAssetId(card));
            const title = String(card.name || localText('Unnamed character', '未命名角色')).trim();
            const subtitle = String(card.identity || localText('Character card', '角色卡')).trim();
            return `<button type="button" class="describe-vlm-chat-character-library-row${workspace.selectedId === id ? ' is-selected' : ''}" data-roleplay-character-library-select="${escapeHtml(id)}" aria-pressed="${workspace.selectedId === id ? 'true' : 'false'}">
  <span class="describe-vlm-chat-character-library-row-avatar">${preview ? `<img src="${escapeHtml(preview)}" alt="">` : '<i class="fa-solid fa-user"></i>'}</span>
  <span class="describe-vlm-chat-character-library-row-copy"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(subtitle)}</small></span>
</button>`;
        }).join('');
    }

    function renderRoleplayCharacterLibraryGeneration(modal) {
        const workspace = roleplayCharacterLibraryWorkspaceState();
        const mount = modal?.querySelector('[data-roleplay-character-library-generated]');
        if (!mount) return;
        const runtime = workspace.generationRuntime;
        const found = runtime && workspace.generationRef ? creativeActionFromRef(workspace.generationRef, runtime.messages) : null;
        if (!found) {
            mount.hidden = true;
            mount.innerHTML = '';
            return;
        }
        const generation = creativeGenerationForAction(found.action);
        const currentState = String(generation.state || 'awaiting_confirmation').toLowerCase();
        const assets = (Array.isArray(generation.assets) ? generation.assets : []).map(normalizeCreativeAsset).filter(Boolean);
        const progress = Math.max(0, Math.min(100, Math.round((Number(generation.percent) || 0) * 100)));
        const detail = String(generation.error || generation.message || '').trim();
        const rows = assets.map((asset, index) => {
            const assetId = String(asset.asset_id || '').trim();
            const source = persistedMediaAssetSource(asset) || creativeAssetUrl(asset.data_url || asset.thumb || '');
            return `<div class="describe-vlm-chat-character-library-generated-item">
  ${source ? `<img src="${escapeHtml(source)}" alt="${escapeHtml(localText(`Generated character image ${index + 1}`, `生成的角色图片 ${index + 1}`))}" loading="lazy">` : '<span class="describe-vlm-chat-character-library-generated-placeholder"><i class="fa-solid fa-image"></i></span>'}
  <div class="describe-vlm-chat-character-library-generated-actions"><button type="button" data-roleplay-character-library-adopt="${escapeHtml(assetId)}" ${assetId ? '' : 'disabled'}><i class="fa-solid fa-check"></i><span>${escapeHtml(localText('Adopt as main reference', '采用为主参考图'))}</span></button><button type="button" data-roleplay-character-library-history-add="${escapeHtml(assetId)}" ${assetId ? '' : 'disabled'}><i class="fa-solid fa-clock-rotate-left"></i><span>${escapeHtml(localText('Add to state history', '加入状态历史'))}</span></button></div>
</div>`;
        }).join('');
        mount.hidden = false;
        mount.innerHTML = `<div class="describe-vlm-chat-character-library-generated-head"><span>${escapeHtml(localText('Generated image', '生成图片'))}</span><b>${escapeHtml(creativeStateLabel(generation))}</b></div>
  ${progress && CREATIVE_ACTIVE_STATES.has(currentState) ? `<progress max="100" value="${progress}"></progress>` : ''}
  ${detail ? `<small>${escapeHtml(detail)}</small>` : ''}
  ${rows ? `<div class="describe-vlm-chat-character-library-generated-grid">${rows}</div>` : ''}`;
    }

    function renderRoleplayCharacterLibraryEditor(modal) {
        const workspace = roleplayCharacterLibraryWorkspaceState();
        const editor = modal?.querySelector('[data-roleplay-character-library-editor]');
        const empty = modal?.querySelector('[data-roleplay-character-library-editor-empty]');
        if (!editor || !empty) return;
        if (!workspace.draft) {
            editor.hidden = true;
            empty.hidden = false;
            return;
        }
        const card = normalizeRoleplayCharacterLibraryCard(workspace.draft);
        workspace.draft = card;
        editor.hidden = false;
        empty.hidden = true;
        const setValue = (name, value) => {
            const field = modal.querySelector(`[data-roleplay-character-library-${name}]`);
            if (field && document.activeElement !== field) field.value = String(value || '');
        };
        setValue('name', card.name);
        setValue('identity', card.identity);
        setValue('background', card.background);
        setValue('personality', card.personality);
        setValue('speech-style', card.speech_style);
        setValue('behavior', (card.behavior_rules || []).join('\n'));
        setValue('first-message', card.first_message);
        setValue('image-prompt', card.image_prompt);
        setValue('negative-prompt', card.negative_prompt);
        const mainPreview = modal.querySelector('[data-roleplay-character-library-main-preview]');
        if (mainPreview) {
            const mainAssetId = roleplayCharacterLibraryMainAssetId(card);
            const source = roleplayCharacterLibraryPreview(mainAssetId);
            mainPreview.innerHTML = source
                ? `<img src="${escapeHtml(source)}" alt="${escapeHtml(localText('Main character reference', '角色主参考图'))}"><span>${escapeHtml(roleplayReferenceAssetLabel(mainAssetId))}</span>`
                : `<div class="describe-vlm-chat-character-library-main-preview-empty"><i class="fa-solid fa-image"></i><span>${escapeHtml(localText('No character image yet.', '还没有角色图片。'))}</span></div>`;
        }
        const assets = modal.querySelector('[data-roleplay-character-library-assets]');
        if (assets) {
            const ids = roleplayCharacterLibraryCardAssets(card);
            assets.innerHTML = ids.length
                ? ids.map((assetId) => {
                    const source = roleplayCharacterLibraryPreview(assetId, assetId === workspace.imageAssetId ? workspace.imagePayload?.thumb : '');
                    const label = roleplayReferenceAssetLabel(assetId);
                    return `<span class="describe-vlm-chat-character-library-asset" title="${escapeHtml(label)}">${source ? `<img src="${escapeHtml(source)}" alt="">` : '<i class="fa-solid fa-image"></i>'}<button type="button" data-roleplay-character-library-remove-asset="${escapeHtml(assetId)}" title="${escapeHtml(localText('Remove reference image', '移除参考图'))}" aria-label="${escapeHtml(localText('Remove reference image', '移除参考图'))}"><i class="fa-solid fa-xmark"></i></button></span>`;
                }).join('')
                : `<span class="describe-vlm-chat-character-library-assets-empty">${escapeHtml(localText('Upload a reference image or generate one from the prompt.', '上传参考图，或根据提示词生成一张。'))}</span>`;
        }
        const history = modal.querySelector('[data-roleplay-character-library-history]');
        if (history) {
            const entries = roleplayCharacterLibraryHistoryEntries(card);
            history.innerHTML = entries.length
                ? entries.map((entry) => {
                    const previews = (entry.asset_ids || []).map((assetId) => {
                        const source = roleplayCharacterLibraryPreview(assetId);
                        return source
                            ? `<img src="${escapeHtml(source)}" alt="" loading="lazy">`
                            : `<span class="describe-vlm-chat-character-library-history-placeholder"><i class="fa-solid fa-image"></i></span>`;
                    }).join('');
                    const note = [entry.label, entry.appearance, entry.state_text].filter(Boolean).join(' · ')
                        || localText('Saved character state image', '已保存的角色状态图');
                    return `<article class="describe-vlm-chat-character-library-history-item" data-roleplay-character-library-history-entry="${escapeHtml(entry.id)}">
  <div class="describe-vlm-chat-character-library-history-images">${previews}</div>
  <div class="describe-vlm-chat-character-library-history-copy"><strong>${escapeHtml(note)}</strong><small>${escapeHtml(roleplayAssetDateLabel(entry))}</small></div>
  <button type="button" data-roleplay-character-library-history-remove="${escapeHtml(entry.id)}" title="${escapeHtml(localText('Remove state image history item', '移除历史状态图'))}" aria-label="${escapeHtml(localText('Remove state image history item', '移除历史状态图'))}"><i class="fa-solid fa-xmark"></i></button>
</article>`;
                }).join('')
                : `<span class="describe-vlm-chat-character-library-history-empty">${escapeHtml(localText('No state images saved yet.', '还没有保存历史状态图。'))}</span>`;
        }
        renderRoleplayCharacterLibraryGeneration(modal);
    }

    function renderRoleplayCharacterLibraryWorkspace(modal) {
        if (!modal) return;
        renderRoleplayCharacterLibraryList(modal);
        renderRoleplayCharacterLibraryEditor(modal);
        const deleteButton = modal.querySelector('[data-roleplay-character-library-delete]');
        if (deleteButton) deleteButton.disabled = !roleplayCharacterLibraryWorkspaceState().selectedId;
    }

    function ensureRoleplayCharacterLibraryWorkspaceModal() {
        let modal = document.getElementById('describe_vlm_chat_roleplay_character_library_modal');
        if (modal) return modal;
        modal = document.createElement('div');
        modal.id = 'describe_vlm_chat_roleplay_character_library_modal';
        modal.className = 'describe-vlm-chat-character-library-modal';
        modal.hidden = true;
        modal.innerHTML = `<div class="describe-vlm-chat-character-library-backdrop" data-roleplay-character-library-close></div>
<section class="describe-vlm-chat-character-library-panel" role="dialog" aria-modal="true" aria-label="${escapeHtml(localText('Character library', '角色库'))}">
  <header class="describe-vlm-chat-character-library-head">
    <div><strong>${escapeHtml(localText('Character library', '角色库'))}</strong><span>${escapeHtml(localText('Build reusable characters from images and prompts.', '用图片和提示词灵活创建可复用角色。'))}</span></div>
    <button type="button" data-roleplay-character-library-close title="${escapeHtml(localText('Close', '关闭'))}" aria-label="${escapeHtml(localText('Close', '关闭'))}"><i class="fa-solid fa-xmark"></i></button>
  </header>
  <div class="describe-vlm-chat-character-library-body">
    <aside class="describe-vlm-chat-character-library-sidebar">
      <div class="describe-vlm-chat-character-library-sidebar-actions"><button type="button" data-roleplay-character-library-new><i class="fa-solid fa-plus"></i><span>${escapeHtml(localText('New character', '新建角色'))}</span></button></div>
      <label class="describe-vlm-chat-character-library-search"><i class="fa-solid fa-magnifying-glass"></i><input type="search" data-roleplay-character-library-search placeholder="${escapeHtml(localText('Search characters', '搜索角色'))}" aria-label="${escapeHtml(localText('Search characters', '搜索角色'))}"></label>
      <div class="describe-vlm-chat-character-library-list" data-roleplay-character-library-list></div>
    </aside>
    <main class="describe-vlm-chat-character-library-main">
      <div class="describe-vlm-chat-character-library-editor-empty" data-roleplay-character-library-editor-empty>${escapeHtml(localText('Select a character or create a new one.', '选择一个角色，或新建角色。'))}</div>
      <div class="describe-vlm-chat-character-library-editor" data-roleplay-character-library-editor hidden>
        <div class="describe-vlm-chat-character-library-editor-head"><div><span>${escapeHtml(localText('Character card', '角色卡'))}</span><small>${escapeHtml(localText('Edit the identity and visual prompt independently.', '身份设定和视觉提示词可以分别编辑。'))}</small></div><button type="button" data-roleplay-character-library-delete title="${escapeHtml(localText('Delete character', '删除角色'))}" aria-label="${escapeHtml(localText('Delete character', '删除角色'))}"><i class="fa-solid fa-trash"></i></button></div>
        <section class="describe-vlm-chat-character-library-agent-section">
          <div class="describe-vlm-chat-character-library-section-head"><div><strong>${escapeHtml(localText('Character agent', '角色智能体'))}</strong><small>${escapeHtml(localText('Create a new card or improve the current card with the roleplay agent.', '让角色智能体生成新角色，或优化当前角色卡。'))}</small></div><i class="fa-solid fa-wand-magic-sparkles"></i></div>
          <textarea data-roleplay-character-library-agent-request rows="3" placeholder="${escapeHtml(localText('Describe the character you want, or tell the agent what to improve...', '描述你想要的角色，或告诉智能体需要优化什么……'))}"></textarea>
          <div class="describe-vlm-chat-character-library-agent-actions"><button type="button" data-roleplay-character-library-agent-generate><i class="fa-solid fa-wand-magic-sparkles"></i><span>${escapeHtml(localText('AI create character', '智能生成角色'))}</span></button><button type="button" data-roleplay-character-library-agent-optimize><i class="fa-solid fa-sliders"></i><span>${escapeHtml(localText('AI optimize card', '智能优化角色卡'))}</span></button></div>
        </section>
        <div class="describe-vlm-chat-character-library-fields">
          <label><span>${escapeHtml(localText('Name', '名称'))}</span><input data-roleplay-character-library-name maxlength="200"></label>
          <label><span>${escapeHtml(localText('Identity', '身份'))}</span><textarea data-roleplay-character-library-identity rows="3"></textarea></label>
          <label><span>${escapeHtml(localText('Background', '背景'))}</span><textarea data-roleplay-character-library-background rows="3"></textarea></label>
          <label><span>${escapeHtml(localText('Personality', '性格'))}</span><textarea data-roleplay-character-library-personality rows="3"></textarea></label>
          <label><span>${escapeHtml(localText('Speech style', '说话方式'))}</span><textarea data-roleplay-character-library-speech-style rows="3"></textarea></label>
          <label><span>${escapeHtml(localText('Behavior rules, one per line', '行为规则，每行一条'))}</span><textarea data-roleplay-character-library-behavior rows="3"></textarea></label>
          <label><span>${escapeHtml(localText('First message', '开场白'))}</span><textarea data-roleplay-character-library-first-message rows="3"></textarea></label>
        </div>
        <section class="describe-vlm-chat-character-library-visual-section">
          <div class="describe-vlm-chat-character-library-section-head"><div><strong>${escapeHtml(localText('Character images', '角色图片'))}</strong><small>${escapeHtml(localText('Keep the fixed reference separate from historical appearance images.', '主参考图和历史状态图分开保存。'))}</small></div><div class="describe-vlm-chat-character-library-section-actions"><button type="button" data-roleplay-character-library-upload title="${escapeHtml(localText('Upload reference image', '上传参考图'))}" aria-label="${escapeHtml(localText('Upload reference image', '上传参考图'))}"><i class="fa-solid fa-upload"></i></button><input type="file" accept="image/*" data-roleplay-character-library-file hidden></div></div>
          <div class="describe-vlm-chat-character-library-main-preview" data-roleplay-character-library-main-preview></div>
          <div class="describe-vlm-chat-character-library-assets" data-roleplay-character-library-assets></div>
          <div class="describe-vlm-chat-character-library-history-head"><div><strong>${escapeHtml(localText('State image history', '历史状态图'))}</strong><small>${escapeHtml(localText('Attach images from roleplay state changes or upload them here.', '可以挂入角色扮演中的状态图，也可以在这里上传。'))}</small></div><div class="describe-vlm-chat-character-library-section-actions"><button type="button" data-roleplay-character-library-state-upload title="${escapeHtml(localText('Upload state image', '上传状态图'))}" aria-label="${escapeHtml(localText('Upload state image', '上传状态图'))}"><i class="fa-solid fa-clock-rotate-left"></i></button><button type="button" data-roleplay-character-library-import-current-state title="${escapeHtml(localText('Import current roleplay state image', '导入当前角色扮演状态图'))}" aria-label="${escapeHtml(localText('Import current roleplay state image', '导入当前角色扮演状态图'))}"><i class="fa-solid fa-cloud-arrow-down"></i></button><input type="file" accept="image/*" data-roleplay-character-library-state-file hidden></div></div>
          <label><span>${escapeHtml(localText('State image note', '状态图说明'))}</span><textarea data-roleplay-character-library-state-note rows="2" placeholder="${escapeHtml(localText('For example: injured after the night battle, wearing a torn coat.', '例如：夜战受伤后，穿着破损外套。'))}"></textarea></label>
          <div class="describe-vlm-chat-character-library-history" data-roleplay-character-library-history></div>
          <label><span>${escapeHtml(localText('Image analysis request', '图片分析要求'))}</span><textarea data-roleplay-character-library-image-request rows="2" placeholder="${escapeHtml(localText('Optional: keep the outfit, change the pose, use a clean studio background...', '可选：保留服装、改变姿势、使用干净的棚拍背景……'))}"></textarea></label>
          <div class="describe-vlm-chat-character-library-prompt-actions"><button type="button" data-roleplay-character-library-describe-image><i class="fa-solid fa-eye"></i><span>${escapeHtml(localText('Image to prompt', '从图片生成提示词'))}</span></button><button type="button" data-roleplay-character-library-agent-optimize-visual><i class="fa-solid fa-sliders"></i><span>${escapeHtml(localText('AI optimize prompt', '智能优化提示词'))}</span></button><button type="button" data-roleplay-character-library-generate-image><i class="fa-solid fa-wand-magic-sparkles"></i><span>${escapeHtml(localText('Prompt to image', '根据提示词生成图片'))}</span></button></div>
          <label><span>${escapeHtml(localText('Image prompt', '生图提示词'))}</span><textarea data-roleplay-character-library-image-prompt rows="8" placeholder="${escapeHtml(localText('Describe the fixed identity image...', '描述角色固定身份图……'))}"></textarea></label>
          <label><span>${escapeHtml(localText('Negative prompt', '反向提示词'))}</span><textarea data-roleplay-character-library-negative-prompt rows="3"></textarea></label>
          <div class="describe-vlm-chat-character-library-generated" data-roleplay-character-library-generated hidden></div>
        </section>
        <div class="describe-vlm-chat-character-library-editor-actions"><span data-roleplay-character-library-feedback aria-live="polite"></span><button type="button" data-roleplay-character-library-save><i class="fa-solid fa-floppy-disk"></i><span>${escapeHtml(localText('Save character', '保存角色'))}</span></button></div>
      </div>
    </main>
  </div>
</section>`;
        document.body.appendChild(modal);
        return modal;
    }

    function openRoleplayCharacterLibrary() {
        const systemParams = window.simpleaiTopbarSystemParams || {};
        state.__lang = String(systemParams.__lang || systemParams.language || getUiLang(systemParams) || state.__lang || 'en');
        const modal = ensureRoleplayCharacterLibraryWorkspaceModal();
        modal.hidden = false;
        document.documentElement.classList.add('describe-vlm-chat-character-library-open');
        renderRoleplayCharacterLibraryWorkspace(modal);
        ensureRoleplayCharacterLibrary(modal).then(() => renderRoleplayCharacterLibraryWorkspace(modal));
        loadRoleplayReferenceLibrary(modal).then(() => renderRoleplayCharacterLibraryWorkspace(modal));
    }

    function closeRoleplayCharacterLibrary() {
        const modal = document.getElementById('describe_vlm_chat_roleplay_character_library_modal');
        if (!modal) return;
        modal.hidden = true;
        document.documentElement.classList.remove('describe-vlm-chat-character-library-open');
    }

    async function materializeRoleplayCharacterLibraryImage(payload, name = '') {
        const api = creativeCanvasApi();
        if (!api || typeof api.materializeAsset !== 'function') throw new Error(localText('Image asset service is unavailable.', '图片资产服务不可用。'));
        const response = await api.materializeAsset({
            project_id: 'describe_vlm_chat',
            node_id: 'roleplay_character_library',
            asset_source: {
                node_id: 'roleplay_character_library',
                asset: {
                    kind: 'browser_upload',
                    asset_id: String(payload.id || uid('roleplay_character_image')).slice(0, 240),
                    name: String(name || payload.name || 'character-reference.png').slice(0, 200),
                    mime: payload.mime || 'image/png',
                    width: payload.width || null,
                    height: payload.height || null,
                    size: payload.size || null,
                    data_url: payload.data_url,
                    thumb: payload.thumb || ''
                }
            },
            user_context: creativeUserContext()
        });
        const ref = response?.asset_ref && typeof response.asset_ref === 'object' ? response.asset_ref : null;
        const assetId = String(ref?.asset_id || '').trim();
        if (!response?.ok || !assetId) throw new Error(String(response?.error || localText('Image registration failed.', '图片登记失败。')));
        const registered = Object.assign({}, ref, {
            asset_id: assetId,
            name: String(name || payload.name || assetId).trim(),
            mime: payload.mime || ref.mime || 'image/png',
            width: payload.width || ref.width || null,
            height: payload.height || ref.height || null,
            thumb: payload.thumb || ref.thumb || '',
            data_url: payload.data_url || ref.data_url || ''
        });
        registerRoleplayGeneratedAsset(registered);
        return assetId;
    }

    async function prepareRoleplayCharacterLibraryImage(modal) {
        const workspace = roleplayCharacterLibraryWorkspaceState();
        if (workspace.imagePayload?.data_url) return workspace.imagePayload;
        const assetId = String(workspace.imageAssetId || workspace.draft?.avatar_asset_id || '').trim();
        const source = roleplayCharacterLibraryPreview(assetId);
        if (!source) return null;
        const response = await fetch(source, { credentials: 'same-origin' });
        if (!response.ok) throw new Error(localText('Reference image could not be read.', '无法读取参考图。'));
        const payload = await imagePayloadFromDataUrl(await blobToDataUrl(await response.blob()), {
            id: assetId || uid('roleplay_character_image'),
            name: roleplayReferenceAssetLabel(assetId),
            key: `roleplay-character-library:${assetId}`
        });
        workspace.imagePayload = payload;
        return payload;
    }

    async function uploadRoleplayCharacterLibraryImage(modal, file) {
        const workspace = roleplayCharacterLibraryWorkspaceState();
        if (!workspace.draft || !file || !/^image\//i.test(file.type || '')) return false;
        if (Number(file.size || 0) > MAX_ROLEPLAY_REFERENCE_BYTES) {
            roleplayCharacterLibraryFeedback(modal, localText('Reference image is larger than 80 MB.', '参考图超过 80 MB。'), true);
            return false;
        }
        workspace.busy = true;
        roleplayCharacterLibraryFeedback(modal, localText('Registering reference image...', '正在登记参考图……'));
        try {
            readRoleplayCharacterLibraryForm(modal);
            const payload = await fileToImagePayload(file);
            const assetId = await materializeRoleplayCharacterLibraryImage(payload, file.name);
            workspace.imagePayload = payload;
            workspace.imageAssetId = assetId;
            workspace.draft.avatar_asset_id = workspace.draft.avatar_asset_id || assetId;
            const refs = [
                ...(workspace.draft.reference_asset_ids || []),
                ...(workspace.draft.avatar_asset_id === assetId ? [] : [assetId])
            ].filter((id) => id !== workspace.draft.avatar_asset_id);
            const maxReferences = Math.max(0, MAX_ROLEPLAY_REFERENCE_IMAGES - (workspace.draft.avatar_asset_id ? 1 : 0));
            workspace.draft.reference_asset_ids = Array.from(new Set(refs)).slice(0, maxReferences);
            renderRoleplayCharacterLibraryWorkspace(modal);
            roleplayCharacterLibraryFeedback(modal, localText('Reference image added.', '参考图已添加。'));
            return true;
        } catch (error) {
            roleplayCharacterLibraryFeedback(modal, String(error?.message || localText('Reference image registration failed.', '参考图登记失败。')), true);
            return false;
        } finally {
            workspace.busy = false;
        }
    }

    async function requestRoleplayCharacterLibraryAgent(modal, mode = 'generate') {
        const workspace = roleplayCharacterLibraryWorkspaceState();
        if (!workspace.draft || workspace.busy) return false;
        readRoleplayCharacterLibraryForm(modal);
        const card = normalizeRoleplayCharacterLibraryCard(workspace.draft);
        const requestText = roleplayCharacterLibraryFormValue(modal, 'agent-request');
        const request = requestText || (mode === 'visual'
            ? localText(
                'Improve only the image prompt and negative prompt. Preserve the character identity, face, clothing design, and recognizable visual traits. Make the prompt specific, reusable, and suitable for a fixed character reference image.',
                '只优化生图提示词和反向提示词。保留角色身份、脸部、服装设计和可识别的视觉特征，让提示词具体、可复用，适合生成固定角色参考图。'
            )
            : mode === 'optimize'
                ? localText(
                    'Improve this character card for roleplay. Preserve the concept and explicit facts, repair thin fields, make the personality and speech style playable, and keep the visual identity consistent.',
                    '优化这张角色卡以便直接进行角色扮演。保留原有概念和明确事实，完善薄弱字段，让性格与说话方式更适合互动，并保持视觉身份一致。'
                )
                : localText(
                    'Create a distinctive roleplay character that can start playing immediately. Include a clear identity, background, personality, speech style, behavior rules, opening message, and a consistent visual identity.',
                    '生成一个可以直接开始角色扮演的鲜明角色，包含明确身份、背景、性格、说话方式、行为规则、开场白和一致的视觉身份。'
                ));
        workspace.busy = true;
        roleplayCharacterLibraryFeedback(modal, mode === 'visual'
            ? localText('The visual agent is improving the prompt...', '视觉智能体正在优化提示词……')
            : mode === 'optimize'
                ? localText('The character agent is improving the card...', '角色智能体正在优化角色卡……')
                : localText('The character agent is creating a draft...', '角色智能体正在生成角色草稿……'));
        try {
            const session = roleplayCharacterLibrarySession(card);
            const version = readSelectedVlmVersion();
            const response = await postJson('/describe-image/vlm-chat-run', {
                request_kind: 'roleplay_form_draft',
                request_id: uid(`roleplay_character_agent_${mode}`),
                message: request,
                conversation_id: `character_library:${card.id}`,
                chat_mode: 'roleplay',
                describe_chat_mode: 'roleplay',
                roleplay_request_kind: 'form_draft',
                roleplay_form_target: 'character',
                roleplay_form_request: request,
                roleplay_session: session,
                agent_routing: session.agent_routing,
                history: [],
                history_full: [],
                version,
                custom_api: readDescribeCustomApi(version),
                vram_policy: state.vramPolicy,
                kv_cache_type: state.kvCacheType,
                n_ctx: currentVlmNctx(version),
                unload_after_chat: !!state.unloadAfterChat,
                max_tokens: 2200,
                __lang: state.__lang,
                lang: state.__lang
            });
            const candidate = response?.form_draft?.character;
            if (!response?.ok || !response.form_draft?.ok || !candidate) {
                roleplayCharacterLibraryFeedback(modal, String(response?.details || localText(
                    'The character agent did not return a usable draft.',
                    '角色智能体没有返回可用的草稿。'
                )), true);
                return false;
            }
            workspace.draft = mergeRoleplayCharacterLibraryAgentDraft(card, candidate, mode === 'visual' ? 'visual' : 'character');
            renderRoleplayCharacterLibraryWorkspace(modal);
            roleplayCharacterLibraryFeedback(modal, mode === 'visual'
                ? localText('The visual prompt was improved. Review it before generating.', '视觉提示词已优化，请确认后再生图。')
                : localText('The character draft was updated. Review it before saving.', '角色草稿已更新，请检查后保存。'));
            return true;
        } catch (error) {
            roleplayCharacterLibraryFeedback(modal, String(error?.message || localText(
                'The character agent request failed.',
                '角色智能体请求失败。'
            )), true);
            return false;
        } finally {
            workspace.busy = false;
        }
    }

    async function uploadRoleplayCharacterLibraryStateImage(modal, file) {
        const workspace = roleplayCharacterLibraryWorkspaceState();
        if (!workspace.draft || !file || !/^image\//i.test(file.type || '')) return false;
        if (Number(file.size || 0) > MAX_ROLEPLAY_REFERENCE_BYTES) {
            roleplayCharacterLibraryFeedback(modal, localText('State image is larger than 80 MB.', '状态图超过 80 MB。'), true);
            return false;
        }
        workspace.busy = true;
        roleplayCharacterLibraryFeedback(modal, localText('Registering state image...', '正在登记状态图……'));
        try {
            readRoleplayCharacterLibraryForm(modal);
            const payload = await fileToImagePayload(file);
            const assetId = await materializeRoleplayCharacterLibraryImage(payload, file.name);
            const note = roleplayCharacterLibraryFormValue(modal, 'state-note');
            addRoleplayCharacterLibraryHistoryEntry(workspace.draft, assetId, {
                label: note.split(/\r?\n/)[0] || localText('Uploaded state image', '上传的状态图'),
                state_text: note,
                source: 'upload'
            });
            renderRoleplayCharacterLibraryWorkspace(modal);
            const noteField = modal.querySelector('[data-roleplay-character-library-state-note]');
            if (noteField) noteField.value = '';
            roleplayCharacterLibraryFeedback(modal, localText('State image added. Save the character to keep it.', '状态图已添加，保存角色后会保留。'));
            return true;
        } catch (error) {
            roleplayCharacterLibraryFeedback(modal, String(error?.message || localText('State image registration failed.', '状态图登记失败。')), true);
            return false;
        } finally {
            workspace.busy = false;
        }
    }

    function importRoleplayCharacterLibraryCurrentState(modal) {
        const workspace = roleplayCharacterLibraryWorkspaceState();
        if (!workspace.draft) return false;
        const runtime = currentConversationRuntime();
        const session = normalizeRoleplaySession(runtime?.roleplaySession || state.roleplaySession);
        const characterId = session.active_character_id || session.character?.id;
        const runtimeState = session.story_state?.characters?.[characterId] || {};
        const assetIds = Array.isArray(runtimeState.current_appearance_asset_ids)
            ? runtimeState.current_appearance_asset_ids.filter(Boolean).slice(0, 3)
            : [];
        if (!assetIds.length) {
            roleplayCharacterLibraryFeedback(modal, localText(
                'There is no current roleplay state image to import.',
                '当前角色扮演里没有可导入的状态图。'
            ), true);
            return false;
        }
        readRoleplayCharacterLibraryForm(modal);
        addRoleplayCharacterLibraryHistoryEntry(workspace.draft, assetIds, {
            label: runtimeState.appearance || localText('Current roleplay state', '当前角色扮演状态'),
            appearance: runtimeState.appearance,
            state_text: runtimeState.state_text,
            state_fields: runtimeState.state_fields,
            source: 'roleplay_current_state',
            turn_id: runtimeState.appearance_updated_turn_id
        });
        renderRoleplayCharacterLibraryWorkspace(modal);
        roleplayCharacterLibraryFeedback(modal, localText('Current roleplay state image added to history.', '当前角色扮演状态图已加入历史记录。'));
        return true;
    }

    async function addRoleplayCharacterLibraryGeneratedAssetToHistory(modal, assetId) {
        const workspace = roleplayCharacterLibraryWorkspaceState();
        const id = String(assetId || '').trim();
        if (!workspace.draft || !id || !workspace.generationRuntime) return false;
        const found = creativeActionFromRef(workspace.generationRef, workspace.generationRuntime.messages);
        const generation = found ? creativeGenerationForAction(found.action) : null;
        const asset = (generation?.assets || []).find((item) => String(item?.asset_id || '') === id);
        if (!asset) return false;
        workspace.busy = true;
        try {
            const durableId = await materializeRoleplayGeneratedAsset(asset);
            if (!durableId) throw new Error(localText('The generated image could not be saved.', '生成图片无法保存。'));
            readRoleplayCharacterLibraryForm(modal);
            addRoleplayCharacterLibraryHistoryEntry(workspace.draft, durableId, {
                label: localText('Generated state image', '生成的状态图'),
                source: 'generated'
            });
            renderRoleplayCharacterLibraryWorkspace(modal);
            roleplayCharacterLibraryFeedback(modal, localText('Generated image added to state history.', '生成图片已加入状态历史。'));
            return true;
        } catch (error) {
            roleplayCharacterLibraryFeedback(modal, String(error?.message || localText('The generated image could not be saved.', '生成图片无法保存。')), true);
            return false;
        } finally {
            workspace.busy = false;
        }
    }

    function removeRoleplayCharacterLibraryHistoryEntry(modal, entryId) {
        const workspace = roleplayCharacterLibraryWorkspaceState();
        if (!workspace.draft) return false;
        const id = String(entryId || '').trim();
        workspace.draft.state_image_history = roleplayCharacterLibraryHistoryEntries(workspace.draft)
            .filter((item) => String(item.id || '') !== id);
        renderRoleplayCharacterLibraryWorkspace(modal);
        roleplayCharacterLibraryFeedback(modal, localText('State image removed from history. Save the character to keep the change.', '历史状态图已移除，保存角色后会保留修改。'));
        return true;
    }

    async function describeRoleplayCharacterLibraryImage(modal) {
        const workspace = roleplayCharacterLibraryWorkspaceState();
        if (!workspace.draft || workspace.busy) return false;
        workspace.busy = true;
        try {
            readRoleplayCharacterLibraryForm(modal);
            const image = await prepareRoleplayCharacterLibraryImage(modal);
            if (!image?.data_url) {
                roleplayCharacterLibraryFeedback(modal, localText('Upload a reference image first.', '请先上传参考图。'), true);
                return false;
            }
            roleplayCharacterLibraryFeedback(modal, localText('Reading the reference image...', '正在分析参考图……'));
            const card = normalizeRoleplayCharacterLibraryCard(workspace.draft);
            const session = roleplayCharacterLibrarySession(card);
            const version = readSelectedVlmVersion();
            const response = await postJson('/describe-image/vlm-chat-run', {
                request_kind: 'roleplay_character_image_prompt',
                request_id: uid('roleplay_character_image_prompt'),
                message: roleplayCharacterLibraryFormValue(modal, 'image-request') || localText(
                    'Analyze the attached character reference image and create an editable fixed-identity image prompt.',
                    '分析附件中的角色参考图，生成可编辑的固定身份图提示词。'
                ),
                conversation_id: `character_library:${card.id}`,
                chat_mode: 'roleplay',
                describe_chat_mode: 'roleplay',
                roleplay_request_kind: 'character_image_prompt',
                roleplay_form_target: 'character',
                roleplay_form_request: roleplayCharacterLibraryFormValue(modal, 'image-request'),
                roleplay_session: session,
                agent_routing: session.agent_routing,
                images: [image],
                history: [],
                history_full: [],
                version,
                custom_api: readDescribeCustomApi(version),
                vram_policy: state.vramPolicy,
                kv_cache_type: state.kvCacheType,
                n_ctx: currentVlmNctx(version),
                max_tokens: 2200,
                __lang: state.__lang,
                lang: state.__lang
            });
            const result = response?.character_image_prompt;
            if (!response?.ok || !result?.ok) {
                roleplayCharacterLibraryFeedback(modal, String(response?.details || localText('The image could not be converted into a prompt.', '图片没有转换成可用提示词。')), true);
                return false;
            }
            const next = normalizeRoleplayCharacterLibraryCard(Object.assign({}, workspace.draft, result.character || {}, {
                id: workspace.draft.id,
                avatar_asset_id: workspace.draft.avatar_asset_id,
                reference_asset_ids: workspace.draft.reference_asset_ids
            }));
            workspace.draft = next;
            renderRoleplayCharacterLibraryWorkspace(modal);
            roleplayCharacterLibraryFeedback(modal, localText('Prompt created. Review it before generating.', '提示词已生成，请确认内容后再生图。'));
            return true;
        } catch (error) {
            roleplayCharacterLibraryFeedback(modal, String(error?.message || localText('Image analysis failed.', '图片分析失败。')), true);
            return false;
        } finally {
            workspace.busy = false;
        }
    }

    function stopRoleplayCharacterLibraryRenderTimer() {
        const workspace = roleplayCharacterLibraryWorkspaceState();
        if (workspace.generationTimer) window.clearInterval(workspace.generationTimer);
        workspace.generationTimer = null;
    }

    async function generateRoleplayCharacterLibraryImage(modal) {
        const workspace = roleplayCharacterLibraryWorkspaceState();
        if (!workspace.draft || workspace.busy) return false;
        readRoleplayCharacterLibraryForm(modal);
        const card = normalizeRoleplayCharacterLibraryCard(workspace.draft);
        if (![card.name, card.identity, card.background, card.personality, card.image_prompt].some(Boolean)) {
            roleplayCharacterLibraryFeedback(modal, localText('Add character details or an image prompt first.', '请先填写角色内容或生图提示词。'), true);
            return false;
        }
        workspace.busy = true;
        roleplayCharacterLibraryFeedback(modal, localText('Preparing the character image...', '正在准备角色图片……'));
        try {
            const session = roleplayCharacterLibrarySession(card);
            const response = await postJson('/describe-image/vlm-roleplay/character-image-action', {
                session,
                character_id: card.id,
                image_request: roleplayCharacterLibraryFormValue(modal, 'image-request'),
                turn_id: uid('character_library_image'),
                __lang: state.__lang,
                lang: state.__lang
            });
            if (!response?.ok || !response.action?.prompt) {
                roleplayCharacterLibraryFeedback(modal, String(response?.details || localText('The image task could not be prepared.', '没有准备好图片任务。')), true);
                return false;
            }
            stopRoleplayCharacterLibraryRenderTimer();
            const action = Object.assign({}, response.action, {
                type: 'generate_image',
                tool_call_id: uid('roleplay_character_library_image'),
                generation: { state: 'queued', assets: [] }
            });
            const runtime = createEmptyConversationRuntime({ chatMode: 'creative' }, uid('character_library_generation'));
            runtime.deleted = true;
            runtime.messages = [{ id: uid('character_library_generation_message'), role: 'assistant', content: '', actions: [action] }];
            workspace.generationRuntime = runtime;
            workspace.generationRef = '0:0';
            renderRoleplayCharacterLibraryWorkspace(modal);
            await startCreativeGeneration(workspace.generationRef, runtime);
            workspace.generationTimer = window.setInterval(() => {
                renderRoleplayCharacterLibraryGeneration(modal);
                const found = creativeActionFromRef(workspace.generationRef, runtime.messages);
                const current = String(found?.action?.generation?.state || '').toLowerCase();
                if (CREATIVE_TERMINAL_STATES.has(current)) {
                    stopRoleplayCharacterLibraryRenderTimer();
                    if (current === 'finished') {
                        (found?.action?.generation?.assets || []).forEach((asset) => registerRoleplayGeneratedAsset(asset));
                        roleplayCharacterLibraryFeedback(modal, localText('Image generated. Choose Adopt to use it as the main reference.', '图片已生成，点击“采用”即可设为主参考图。'));
                        renderRoleplayCharacterLibraryWorkspace(modal);
                    }
                }
            }, 500);
            roleplayCharacterLibraryFeedback(modal, localText('Image generation has started.', '图片生成已开始。'));
            return true;
        } catch (error) {
            roleplayCharacterLibraryFeedback(modal, String(error?.message || localText('Image generation failed to start.', '图片生成没有启动。')), true);
            return false;
        } finally {
            workspace.busy = false;
        }
    }

    async function saveRoleplayCharacterLibraryWorkspace(modal) {
        const workspace = roleplayCharacterLibraryWorkspaceState();
        if (!workspace.draft || workspace.busy) return false;
        readRoleplayCharacterLibraryForm(modal);
        const card = normalizeRoleplayCharacterLibraryCard(workspace.draft);
        if (!String(card.name || '').trim()) {
            roleplayCharacterLibraryFeedback(modal, localText('Give the character a name before saving.', '保存前请先填写角色名称。'), true);
            return false;
        }
        workspace.busy = true;
        roleplayCharacterLibraryFeedback(modal, localText('Saving character...', '正在保存角色……'));
        try {
            const userContext = creativeUserContext();
            const response = await postJson('/describe-image/vlm-roleplay/characters/save', {
                character: card,
                user_did: userContext?.user_did || '',
                __lang: state.__lang,
                lang: state.__lang
            });
            if (!response?.ok || !response.character) throw new Error(localText('Character could not be saved.', '角色保存失败。'));
            const saved = normalizeRoleplayCharacterLibraryCard(response.character);
            state.roleplayCharacterLibrary = [saved, ...state.roleplayCharacterLibrary.filter((item) => String(item?.id || '') !== saved.id)];
            state.roleplayCharacterLibraryLoaded = true;
            workspace.selectedId = saved.id;
            workspace.draft = saved;
            renderRoleplayCharacterLibraryWorkspace(modal);
            roleplayCharacterLibraryFeedback(modal, localText('Character saved.', '角色已保存。'));
            return true;
        } catch (error) {
            roleplayCharacterLibraryFeedback(modal, String(error?.message || localText('Character could not be saved.', '角色保存失败。')), true);
            return false;
        } finally {
            workspace.busy = false;
        }
    }

    async function loadRoleplayCharacterLibraryWorkspaceCard(modal, characterId) {
        const id = String(characterId || '').trim();
        if (!id) return false;
        const userContext = creativeUserContext();
        roleplayCharacterLibraryFeedback(modal, localText('Loading character...', '正在加载角色……'));
        try {
            const response = await postJson('/describe-image/vlm-roleplay/characters/load', {
                character_id: id,
                user_did: userContext?.user_did || '',
                __lang: state.__lang,
                lang: state.__lang
            });
            if (!response?.ok || !response.character) throw new Error(localText('Character could not be loaded.', '角色加载失败。'));
            const workspace = roleplayCharacterLibraryWorkspaceState();
            workspace.selectedId = id;
            workspace.draft = normalizeRoleplayCharacterLibraryCard(response.character);
            workspace.imagePayload = null;
            workspace.imageAssetId = workspace.draft.avatar_asset_id || '';
            renderRoleplayCharacterLibraryWorkspace(modal);
            roleplayCharacterLibraryFeedback(modal, '');
            return true;
        } catch (error) {
            roleplayCharacterLibraryFeedback(modal, String(error?.message || localText('Character could not be loaded.', '角色加载失败。')), true);
            return false;
        }
    }

    async function deleteRoleplayCharacterLibraryWorkspaceCard(modal) {
        const workspace = roleplayCharacterLibraryWorkspaceState();
        const id = String(workspace.selectedId || '').trim();
        if (!id) return false;
        if (!window.confirm(localText('Delete this character from the library?', '确定从角色库删除这个角色吗？'))) return false;
        workspace.busy = true;
        try {
            const userContext = creativeUserContext();
            const response = await postJson('/describe-image/vlm-roleplay/characters/delete', {
                character_id: id,
                user_did: userContext?.user_did || '',
                __lang: state.__lang,
                lang: state.__lang
            });
            if (!response?.ok) throw new Error(localText('Character could not be deleted.', '角色删除失败。'));
            state.roleplayCharacterLibrary = state.roleplayCharacterLibrary.filter((item) => String(item?.id || '') !== id);
            workspace.selectedId = '';
            workspace.draft = null;
            workspace.imagePayload = null;
            workspace.imageAssetId = '';
            renderRoleplayCharacterLibraryWorkspace(modal);
            roleplayCharacterLibraryFeedback(modal, localText('Character deleted.', '角色已删除。'));
            return true;
        } catch (error) {
            roleplayCharacterLibraryFeedback(modal, String(error?.message || localText('Character could not be deleted.', '角色删除失败。')), true);
            return false;
        } finally {
            workspace.busy = false;
        }
    }

    function adoptRoleplayCharacterLibraryGeneratedAsset(modal, assetId) {
        const workspace = roleplayCharacterLibraryWorkspaceState();
        const id = String(assetId || '').trim();
        if (!workspace.draft || !id) return false;
        readRoleplayCharacterLibraryForm(modal);
        const previousAvatar = String(workspace.draft.avatar_asset_id || '').trim();
        if (previousAvatar && roleplayReferenceIdentity(previousAvatar) !== roleplayReferenceIdentity(id)) {
            addRoleplayCharacterLibraryHistoryEntry(workspace.draft, previousAvatar, {
                label: localText('Previous main reference', '之前的主参考图'),
                source: 'main_reference_replaced'
            });
        }
        workspace.draft.avatar_asset_id = id;
        workspace.imageAssetId = id;
        workspace.imagePayload = null;
        renderRoleplayCharacterLibraryWorkspace(modal);
        roleplayCharacterLibraryFeedback(modal, localText('Generated image adopted as the main reference.', '已采用生成图片作为主参考图。'));
        return true;
    }

    function removeRoleplayCharacterLibraryAsset(modal, assetId) {
        const workspace = roleplayCharacterLibraryWorkspaceState();
        if (!workspace.draft) return false;
        const id = String(assetId || '').trim();
        readRoleplayCharacterLibraryForm(modal);
        if (workspace.draft.avatar_asset_id === id) workspace.draft.avatar_asset_id = '';
        workspace.draft.reference_asset_ids = (workspace.draft.reference_asset_ids || []).filter((value) => String(value || '').trim() !== id);
        if (workspace.imageAssetId === id) {
            workspace.imageAssetId = '';
            workspace.imagePayload = null;
        }
        renderRoleplayCharacterLibraryWorkspace(modal);
        return true;
    }

    function syncRoleplayCharacterGuidance(modal, session) {
        const guidance = modal?.querySelector('[data-describe-vlm-chat-roleplay-character-guidance]');
        if (!guidance) return;
        const normalized = normalizeRoleplaySession(session);
        const character = normalized.characters?.[normalized.active_character_id] || normalized.character || {};
        guidance.hidden = roleplayCharacterHasDetails(character);
    }

    function renderRoleplaySceneCharacterSelector(modal, session) {
        const container = modal?.querySelector('[data-describe-vlm-chat-roleplay-scene-characters]');
        if (!container) return;
        const normalized = normalizeRoleplaySession(session);
        const selected = new Set(normalized.story_state.scene.present_character_ids || []);
        container.innerHTML = roleplayCharacterEntries(normalized).map((character) => {
            const label = String(character.name || character.id || localText('Unnamed character', '未命名角色')).trim();
            return `<label class="describe-vlm-chat-roleplay-scene-character-option">
          <input type="checkbox" data-describe-vlm-chat-roleplay-scene-character value="${escapeHtml(character.id)}"${selected.has(character.id) ? ' checked' : ''}>
          <span>${escapeHtml(label)}</span>
        </label>`;
        }).join('');
    }

    function roleplayStateFieldsContainer(modal, owner = 'character') {
        return modal?.querySelector(owner === 'player'
            ? '[data-describe-vlm-chat-roleplay-player-state-fields]'
            : '[data-describe-vlm-chat-roleplay-state-fields]');
    }

    function renderRoleplayStateFields(modal, fields = [], owner = 'character') {
        const container = roleplayStateFieldsContainer(modal, owner);
        if (!container) return;
        const normalized = normalizeRoleplayStateFields(fields);
        container.innerHTML = normalized.length
            ? normalized.map((field) => `<div class="describe-vlm-chat-roleplay-state-field" data-describe-vlm-chat-roleplay-state-field>
          <input type="text" maxlength="${MAX_ROLEPLAY_STATE_FIELD_LABEL}" data-describe-vlm-chat-roleplay-state-field-label value="${escapeHtml(field.label)}" placeholder="${escapeHtml(localText('Field name', '字段名'))}" aria-label="${escapeHtml(localText('State field name', '状态字段名'))}">
          <input type="text" maxlength="${MAX_ROLEPLAY_STATE_FIELD_VALUE}" data-describe-vlm-chat-roleplay-state-field-value value="${escapeHtml(field.value)}" placeholder="${escapeHtml(localText('Value', '数值或描述'))}" aria-label="${escapeHtml(localText('State field value', '状态字段值'))}">
          <button type="button" data-describe-vlm-chat-roleplay-state-field-remove title="${escapeHtml(localText('Remove state field', '删除状态项'))}" aria-label="${escapeHtml(localText('Remove state field', '删除状态项'))}"><i class="fa-solid fa-xmark"></i></button>
        </div>`).join('')
            : `<span class="describe-vlm-chat-roleplay-state-fields-empty">${escapeHtml(localText('No structured fields yet', '暂未添加结构化状态'))}</span>`;
    }

    function renderRoleplayCharacterStateFields(modal, fields = []) {
        renderRoleplayStateFields(modal, fields, 'character');
    }

    function renderRoleplayPlayerStateFields(modal, fields = []) {
        renderRoleplayStateFields(modal, fields, 'player');
    }

    function visibleRoleplayStateFields(modal, owner = 'character') {
        const container = roleplayStateFieldsContainer(modal, owner);
        if (!container) return [];
        return normalizeRoleplayStateFields(Array.from(
            container.querySelectorAll('[data-describe-vlm-chat-roleplay-state-field]')
        ).map((row) => ({
            label: row.querySelector('[data-describe-vlm-chat-roleplay-state-field-label]')?.value,
            value: row.querySelector('[data-describe-vlm-chat-roleplay-state-field-value]')?.value
        })));
    }

    function visibleRoleplayCharacterStateFields(modal) {
        return visibleRoleplayStateFields(modal, 'character');
    }

    function visibleRoleplayPlayerStateFields(modal) {
        return visibleRoleplayStateFields(modal, 'player');
    }

    function applyVisibleRoleplayCharacterState(session, modal) {
        const target = session && typeof session === 'object' ? session : normalizeRoleplaySession(null);
        const activeId = target.active_character_id || target.character?.id;
        if (!activeId) return target;
        if (!target.story_state || typeof target.story_state !== 'object') target.story_state = {};
        if (!target.story_state.characters || typeof target.story_state.characters !== 'object') target.story_state.characters = {};
        const runtime = Object.assign({}, target.story_state.characters[activeId] || {});
        const stateText = String(modal?.querySelector('[data-describe-vlm-chat-roleplay-character-state-text]')?.value || '')
            .trim()
            .slice(0, MAX_ROLEPLAY_STATE_TEXT);
        runtime.state_text = stateText;
        runtime.state_fields = visibleRoleplayCharacterStateFields(modal);
        target.story_state.characters[activeId] = runtime;
        return target;
    }

    function applyVisibleRoleplayPlayerState(session, modal) {
        const target = session && typeof session === 'object' ? session : normalizeRoleplaySession(null);
        if (!target.story_state || typeof target.story_state !== 'object') target.story_state = {};
        const current = normalizeRoleplayPlayerState(target.story_state.player_state);
        const status = String(modal?.querySelector('[data-describe-vlm-chat-roleplay-player-status]')?.value || current.status)
            .trim()
            .toLowerCase();
        const next = normalizeRoleplayPlayerState({
            status,
            state_text: String(modal?.querySelector('[data-describe-vlm-chat-roleplay-player-state-text]')?.value || '')
                .trim()
                .slice(0, MAX_ROLEPLAY_STATE_TEXT),
            state_fields: visibleRoleplayPlayerStateFields(modal)
        });
        target.story_state.player_state = next;
        return target;
    }

    function mergeRoleplayStateFields(current, generated) {
        const merged = normalizeRoleplayStateFields(current);
        const seen = new Set(merged.map((field) => field.label.toLocaleLowerCase()));
        normalizeRoleplayStateFields(generated).forEach((field) => {
            const key = field.label.toLocaleLowerCase();
            if (seen.has(key)) return;
            seen.add(key);
            merged.push(field);
        });
        return merged.slice(0, MAX_ROLEPLAY_STATE_FIELDS);
    }

    function applyVisibleRoleplayCharacterFields(session, modal) {
        const normalized = normalizeRoleplaySession(session);
        const activeId = normalized.active_character_id || normalized.character.id;
        const card = Object.assign({}, normalized.characters?.[activeId] || normalized.character);
        const read = (selector) => String(modal?.querySelector(selector)?.value || '').trim();
        const identity = read('[data-describe-vlm-chat-roleplay-character-identity]');
        const style = read('[data-describe-vlm-chat-roleplay-character-style]');
        card.name = read('[data-describe-vlm-chat-roleplay-character-name]');
        card.identity = identity.split(/\n\n+/)[0] || '';
        card.background = identity.split(/\n\n+/).slice(1).join('\n\n');
        card.personality = style.split(/\n\n+/)[0] || '';
        card.speech_style = style.split(/\n\n+/).slice(1).join('\n\n');
        normalized.characters[activeId] = card;
        normalized.character = card;
        return normalized;
    }

    function roleplayCharacterIdForNewCard(session) {
        const existing = new Set(Object.keys(normalizeRoleplaySession(session).characters || {}));
        let index = existing.size + 1;
        let id = `character_${index}`;
        while (existing.has(id)) {
            index += 1;
            id = `character_${index}`;
        }
        return id;
    }

    function newRoleplayCharacterCard(id) {
        return {
            schema: 'simpai.vlm_roleplay.character',
            version: 1,
            id,
            revision: 1,
            name: localText('New character', '新角色'),
            avatar_asset_id: '',
            reference_asset_ids: [],
            identity: '',
            background: '',
            personality: '',
            speech_style: '',
            behavior_rules: [],
            first_message: '',
            example_dialogues: [],
            locked_fields: []
        };
    }

    function switchRoleplayCharacter(runtime, modal, characterId) {
        const target = runtime || currentConversationRuntime();
        let session = normalizeRoleplaySession(target.roleplaySession, target.conversationId);
        session = applyVisibleRoleplayCharacterFields(session, modal);
        session = applyVisibleRoleplayCharacterState(session, modal);
        session = applyVisibleRoleplayPlayerState(session, modal);
        const nextId = String(characterId || '').trim();
        if (!nextId || !session.characters?.[nextId]) return false;
        session.active_character_id = nextId;
        session.character = session.characters[nextId];
        target.roleplaySession = normalizeRoleplaySession(session, target.conversationId);
        target.persistenceDirty = true;
        if (isCurrentConversationRuntime(target)) state.roleplaySession = target.roleplaySession;
        saveConversationSnapshot(target);
        syncRoleplayControls(modal, target);
        return true;
    }

    function addRoleplayCharacter(runtime, modal) {
        const target = runtime || currentConversationRuntime();
        let session = normalizeRoleplaySession(target.roleplaySession, target.conversationId);
        session = applyVisibleRoleplayCharacterFields(session, modal);
        session = applyVisibleRoleplayCharacterState(session, modal);
        session = applyVisibleRoleplayPlayerState(session, modal);
        const characters = session.characters || {};
        if (Object.keys(characters).length >= MAX_ROLEPLAY_CHARACTERS) {
            setConversationStatus(target, localText('The roleplay session already has the maximum number of characters.', '角色扮演会话已达到角色数量上限。'), true);
            return false;
        }
        const id = roleplayCharacterIdForNewCard(session);
        characters[id] = newRoleplayCharacterCard(id);
        session.characters = characters;
        session.active_character_id = id;
        session.character = characters[id];
        target.roleplaySession = normalizeRoleplaySession(session, target.conversationId);
        const draft = roleplayReferenceDraft(target);
        draft.characters[id] = [];
        target.persistenceDirty = true;
        if (isCurrentConversationRuntime(target)) state.roleplaySession = target.roleplaySession;
        saveConversationSnapshot(target);
        syncRoleplayControls(modal, target);
        setConversationStatus(target, localText('Character added. Fill in the new character details.', '角色已增加，请填写新角色设定。'));
        return true;
    }

    function removeRoleplayCharacter(runtime, modal) {
        const target = runtime || currentConversationRuntime();
        let session = normalizeRoleplaySession(target.roleplaySession, target.conversationId);
        session = applyVisibleRoleplayCharacterFields(session, modal);
        session = applyVisibleRoleplayCharacterState(session, modal);
        session = applyVisibleRoleplayPlayerState(session, modal);
        const ids = Object.keys(session.characters || {});
        if (ids.length <= 1) {
            setConversationStatus(target, localText('At least one character is required.', '至少需要保留一个角色。'), true);
            return false;
        }
        const removeId = session.active_character_id;
        if (!window.confirm(localText('Remove the current character?', '确定删除当前角色吗？'))) return false;
        delete session.characters[removeId];
        delete session.story_state.characters[removeId];
        session.story_state.scene.present_character_ids = session.story_state.scene.present_character_ids.filter((id) => id !== removeId);
        const nextId = Object.keys(session.characters)[0];
        session.active_character_id = nextId;
        session.character = session.characters[nextId];
        target.roleplaySession = normalizeRoleplaySession(session, target.conversationId);
        if (target.roleplayReferenceDraft?.characters) delete target.roleplayReferenceDraft.characters[removeId];
        target.persistenceDirty = true;
        if (isCurrentConversationRuntime(target)) state.roleplaySession = target.roleplaySession;
        saveConversationSnapshot(target);
        syncRoleplayControls(modal, target);
        setConversationStatus(target, localText('Character removed.', '角色已删除。'));
        return true;
    }

    function syncRoleplayControls(modal, runtimeOverride = null) {
        if (!modal) return;
        const active = normalizeChatMode(state.chatMode) === 'roleplay';
        const runtime = runtimeOverride || currentConversationRuntime();
        const session = normalizeRoleplaySession(runtime.roleplaySession, runtime.conversationId);
        const rawAutoplayState = normalizeRoleplayAutoplayState(runtime.roleplayAutoplayState);
        const autoplayState = normalizeRoleplayAutoplayState(Object.assign({}, rawAutoplayState, {
            target_turns: ['running', 'paused'].includes(rawAutoplayState.phase)
                ? rawAutoplayState.target_turns
                : session.autoplay_config.target_turns
        }));
        runtime.roleplaySession = session;
        runtime.roleplayAutoplayState = autoplayState;
        state.roleplaySession = session;
        state.roleplayAutoplayState = autoplayState;
        const strip = modal.querySelector('[data-describe-vlm-chat-roleplay-strip]');
        const panel = modal.querySelector('[data-describe-vlm-chat-roleplay-panel]');
        if (strip) strip.hidden = !active;
        if (panel) panel.hidden = !active || !state.roleplayPanelOpen;
        const summary = modal.querySelector('[data-describe-vlm-chat-roleplay-summary-text]');
        const status = modal.querySelector('[data-describe-vlm-chat-roleplay-state]');
        if (summary) summary.textContent = session.character.name
            ? `${session.character.name}${Object.keys(session.characters || {}).length > 1 ? ` · ${Object.keys(session.characters).length} ${localText('characters', '个角色')}` : ''}`
            : localText('Roleplay setup', '角色扮演设置');
        if (status) status.textContent = [
            roleplayStateSummary(session),
            roleplayAutoplayLabel(autoplayState)
        ].filter(Boolean).join(' · ');
        const setAutoplayButton = (selector, disabled, hidden = false) => {
            const button = modal.querySelector(selector);
            if (!button) return;
            button.disabled = !active || disabled;
            button.hidden = hidden;
            button.setAttribute('aria-disabled', button.disabled ? 'true' : 'false');
        };
        setAutoplayButton('[data-describe-vlm-chat-roleplay-play]', autoplayState.phase === 'running');
        setAutoplayButton('[data-describe-vlm-chat-roleplay-step]', autoplayState.phase === 'running');
        setAutoplayButton('[data-describe-vlm-chat-roleplay-pause]', autoplayState.phase !== 'running');
        setAutoplayButton('[data-describe-vlm-chat-roleplay-stop]', !['running', 'paused'].includes(autoplayState.phase));
        const setValue = (selector, value) => {
            const element = modal.querySelector(selector);
            if (element && document.activeElement !== element) element.value = String(value || '');
        };
        renderRoleplayCharacterSelector(modal, session);
        syncRoleplayCharacterGuidance(modal, session);
        setValue('[data-describe-vlm-chat-roleplay-character-name]', session.character.name);
        setValue('[data-describe-vlm-chat-roleplay-character-identity]', [session.character.identity, session.character.background].filter(Boolean).join('\n\n'));
        setValue('[data-describe-vlm-chat-roleplay-character-style]', [session.character.personality, session.character.speech_style].filter(Boolean).join('\n\n'));
        const activeCharacterRuntime = session.story_state.characters?.[session.active_character_id] || {};
        setValue('[data-describe-vlm-chat-roleplay-character-state-text]', activeCharacterRuntime.state_text);
        const stateFields = modal.querySelector('[data-describe-vlm-chat-roleplay-state-fields]');
        if (stateFields && !stateFields.contains(document.activeElement)) {
            renderRoleplayCharacterStateFields(modal, activeCharacterRuntime.state_fields);
        }
        setValue('[data-describe-vlm-chat-roleplay-persona-name]', session.persona.name);
        setValue('[data-describe-vlm-chat-roleplay-persona-identity]', [session.persona.identity, session.persona.goals.join(', ')].filter(Boolean).join('\n\n'));
        const playerState = normalizeRoleplayPlayerState(session.story_state.player_state);
        const playerStatus = modal.querySelector('[data-describe-vlm-chat-roleplay-player-status]');
        if (playerStatus && document.activeElement !== playerStatus) playerStatus.value = playerState.status;
        setValue('[data-describe-vlm-chat-roleplay-player-state-text]', playerState.state_text);
        const playerStateFields = modal.querySelector('[data-describe-vlm-chat-roleplay-player-state-fields]');
        if (playerStateFields && !playerStateFields.contains(document.activeElement)) {
            renderRoleplayPlayerStateFields(modal, playerState.state_fields);
        }
        setValue('[data-describe-vlm-chat-roleplay-scene-location]', session.story_state.scene.location);
        setValue('[data-describe-vlm-chat-roleplay-scene-time]', session.story_state.scene.time);
        setValue('[data-describe-vlm-chat-roleplay-scene-event]', session.story_state.scene.current_event);
        renderRoleplaySceneCharacterSelector(modal, session);
        const autoplay = modal.querySelector('[data-describe-vlm-chat-roleplay-autoplay-mode]');
        if (autoplay) autoplay.value = String(session.autoplay_config.mode || 'manual');
        const targetTurns = modal.querySelector('[data-describe-vlm-chat-roleplay-target-turns]');
        if (targetTurns) targetTurns.value = String(session.autoplay_config.target_turns || 5);
        const continuous = modal.querySelector('[data-describe-vlm-chat-roleplay-continuous]');
        if (continuous) continuous.checked = !!session.autoplay_config.continuous;
        const visual = modal.querySelector('[data-describe-vlm-chat-roleplay-visual-enabled]');
        if (visual) visual.checked = !!session.visual_config.enabled;
        const agentRouting = normalizeRoleplayAgentRouting(session.agent_routing);
        ROLEPLAY_AGENT_ROLES.forEach((role) => {
            const select = modal.querySelector(`[data-describe-vlm-chat-roleplay-agent-route="${role}"]`);
            if (select) {
                const route = agentRouting.routes[role] || {};
                if (document.activeElement !== select) select.value = route.mode || 'auto';
            }
        });
        const localVersion = modal.querySelector('[data-describe-vlm-chat-roleplay-agent-local-version]');
        if (localVersion && document.activeElement !== localVersion) {
            localVersion.innerHTML = renderRoleplayLocalModelOptions(session);
            const stored = String(agentRouting.profiles?.local_main?.version || '').trim();
            const selected = String(readSelectedVlmVersion() || '').trim();
            const selectedIsApi = selected === 'Custom' || selected.startsWith('custom_api:');
            const target = stored || (!selectedIsApi ? selected : '');
            const available = Array.from(localVersion.options || []).some((option) => option.value === target);
            localVersion.value = available ? target : (localVersion.options?.[0]?.value || '');
        }
        const apiVersion = modal.querySelector('[data-describe-vlm-chat-roleplay-agent-api-version]');
        if (apiVersion && document.activeElement !== apiVersion) {
            apiVersion.innerHTML = renderRoleplayApiProfileOptions(session);
            const stored = String(agentRouting.profiles?.api_main?.version || '').trim();
            const available = Array.from(apiVersion.options || []).some((option) => option.value === stored);
            apiVersion.value = available ? stored : (apiVersion.options?.[0]?.value || '');
        }
        const fallbackEnabled = modal.querySelector('[data-describe-vlm-chat-roleplay-agent-fallback]');
        if (fallbackEnabled && document.activeElement !== fallbackEnabled) {
            fallbackEnabled.checked = ROLEPLAY_AGENT_ROLES.every((role) => agentRouting.routes?.[role]?.fallback_enabled !== false);
        }
        syncRoleplayCharacterLibraryControls(modal);
        if (active && !state.roleplayCharacterLibraryLoaded) ensureRoleplayCharacterLibrary(modal).catch(() => {});
        renderRoleplayReferenceLists(modal, runtime);
        renderRoleplayReferenceLibraryControls(modal, runtime);
        renderRoleplayCurrentAppearance(modal, runtime);
        renderRoleplayInlineGenerationResults(modal, runtime);
        syncRoleplayBranchControls(modal, runtime);
    }

    function applyVisibleRoleplayPersonaFields(session, modal, preserveEmpty = true) {
        const target = session && typeof session === 'object' ? session : normalizeRoleplaySession(null);
        const persona = target.persona && typeof target.persona === 'object'
            ? target.persona
            : (target.persona = {});
        const nameField = modal?.querySelector('[data-describe-vlm-chat-roleplay-persona-name]');
        const identityField = modal?.querySelector('[data-describe-vlm-chat-roleplay-persona-identity]');
        const name = String(nameField?.value || '').trim();
        const identityText = String(identityField?.value || '').trim();
        const lines = identityText.split(/\n+/).map((item) => item.trim()).filter(Boolean);
        if (name || !preserveEmpty) persona.name = name;
        if (lines.length || !preserveEmpty) {
            persona.identity = lines.shift() || '';
            persona.goals = lines;
        }
        return target;
    }

    function applyRoleplayForm(modal, runtime = null) {
        if (!modal) return null;
        const target = runtime || currentConversationRuntime();
        let session = normalizeRoleplaySession(target.roleplaySession, target.conversationId);
        session = applyVisibleRoleplayCharacterFields(session, modal);
        session = applyVisibleRoleplayCharacterState(session, modal);
        session = applyVisibleRoleplayPlayerState(session, modal);
        session = applyVisibleRoleplayPersonaFields(session, modal, false);
        const read = (selector) => String(modal.querySelector(selector)?.value || '').trim();
        session.story_state.scene.location = read('[data-describe-vlm-chat-roleplay-scene-location]');
        session.story_state.scene.time = read('[data-describe-vlm-chat-roleplay-scene-time]');
        session.story_state.scene.current_event = read('[data-describe-vlm-chat-roleplay-scene-event]');
        session.story_state.scene.present_character_ids = Array.from(
            modal.querySelectorAll('[data-describe-vlm-chat-roleplay-scene-character]:checked')
        ).map((input) => String(input.value || '').trim()).filter(Boolean).slice(0, MAX_ROLEPLAY_CHARACTERS);
        const referenceDraft = roleplayReferenceDraft(target);
        Object.keys(session.characters || {}).forEach((characterId) => {
            const card = session.characters[characterId];
            const characterReferences = referenceDraft.characters?.[characterId]
                || (characterId === session.active_character_id ? referenceDraft.character : [])
                || [];
            card.avatar_asset_id = characterReferences[0] || '';
            card.reference_asset_ids = characterReferences.slice(1, MAX_ROLEPLAY_REFERENCE_IMAGES);
            session.characters[characterId] = card;
        });
        session.character = session.characters[session.active_character_id] || session.character;
        session.persona.reference_asset_ids = (referenceDraft.player || []).slice(0, MAX_ROLEPLAY_REFERENCE_IMAGES);
        session.visual_config.reference_asset_ids = (referenceDraft.scene || []).slice(0, MAX_ROLEPLAY_REFERENCE_IMAGES);
        session.autoplay_config.mode = String(modal.querySelector('[data-describe-vlm-chat-roleplay-autoplay-mode]')?.value || 'manual');
        session.autoplay_config.target_turns = Math.max(1, Math.min(100, Math.round(Number(modal.querySelector('[data-describe-vlm-chat-roleplay-target-turns]')?.value) || 5)));
        session.autoplay_config.continuous = !!modal.querySelector('[data-describe-vlm-chat-roleplay-continuous]')?.checked;
        session.visual_config.enabled = !!modal.querySelector('[data-describe-vlm-chat-roleplay-visual-enabled]')?.checked;
        const agentRouting = normalizeRoleplayAgentRouting(session.agent_routing);
        const fallbackEnabled = !!modal.querySelector('[data-describe-vlm-chat-roleplay-agent-fallback]')?.checked;
        ROLEPLAY_AGENT_ROLES.forEach((role) => {
            const value = String(modal.querySelector(`[data-describe-vlm-chat-roleplay-agent-route="${role}"]`)?.value || 'auto').toLowerCase();
            agentRouting.routes[role].mode = ['auto', 'api', 'local'].includes(value) ? value : 'auto';
            agentRouting.routes[role].fallback_enabled = fallbackEnabled;
        });
        const localVersion = read('[data-describe-vlm-chat-roleplay-agent-local-version]');
        agentRouting.profiles.local_main.version = localVersion;
        const apiVersion = read('[data-describe-vlm-chat-roleplay-agent-api-version]');
        agentRouting.profiles.api_main.version = apiVersion;
        agentRouting.profiles.api_main.type = 'api';
        session.agent_routing = normalizeRoleplayAgentRouting(agentRouting);
        session.conversation_id = target.conversationId;
        target.roleplaySession = normalizeRoleplaySession(session, target.conversationId);
        target.persistenceDirty = true;
        if (isCurrentConversationRuntime(target)) state.roleplaySession = target.roleplaySession;
        saveConversationSnapshot(target);
        delete target.roleplayReferenceDraft;
        syncRoleplayControls(modal);
        return target.roleplaySession;
    }

    function roleplaySystemPromptSource(runtime = currentConversationRuntime(), modal = document.getElementById('describe_vlm_chat_modal')) {
        const target = runtime || currentConversationRuntime();
        const field = modal?.querySelector('[data-describe-vlm-chat-system]');
        return String(
            field?.value
            || target.customSystemPrompt
            || target.userSystemPromptContent
            || target.baseSystemPromptContent
            || ''
        ).trim();
    }

    async function importRoleplayCharacterDraft(runtime = currentConversationRuntime(), modal = document.getElementById('describe_vlm_chat_modal')) {
        const target = runtime || currentConversationRuntime();
        const sourcePrompt = roleplaySystemPromptSource(target, modal);
        if (!sourcePrompt) {
            setConversationStatus(target, localText(
                'No system prompt is available to draft a character from.',
                '当前没有可用于生成角色草稿的 system prompt。'
            ), true);
            return false;
        }
        const response = await postJson('/describe-image/vlm-roleplay/draft-from-system-prompt', {
            system_prompt: sourcePrompt,
            conversation_id: target.conversationId,
            __lang: state.__lang,
            lang: state.__lang
        });
        if (!response?.ok || !response.character) {
            setConversationStatus(target, localText(
                'The character draft could not be created.',
                '角色草稿生成失败。'
            ), true);
            return false;
        }
        const draft = response.character;
        const session = normalizeRoleplaySession(target.roleplaySession, target.conversationId);
        const oldCharacter = session.character || {};
        session.character = Object.assign({}, oldCharacter, {
            name: String(draft.name || oldCharacter.name || '').trim(),
            identity: String(draft.identity || '').trim(),
            background: String(draft.background || '').trim(),
            personality: String(draft.personality || '').trim(),
            speech_style: String(draft.speech_style || '').trim(),
            first_message: String(draft.first_message || '').trim(),
            example_dialogues: Array.isArray(draft.example_dialogues) ? draft.example_dialogues : [],
            locked_fields: Array.isArray(oldCharacter.locked_fields) && oldCharacter.locked_fields.length
                ? oldCharacter.locked_fields
                : (Array.isArray(draft.locked_fields) ? draft.locked_fields : [])
        });
        target.roleplaySession = normalizeRoleplaySession(session, target.conversationId);
        target.persistenceDirty = true;
        if (isCurrentConversationRuntime(target)) state.roleplaySession = target.roleplaySession;
        saveConversationSnapshot(target);
        syncRoleplayControls(modal, target);
        setConversationStatus(target, localText(
            'Character draft applied. The original system prompt was kept.',
            '角色草稿已填入，原 system prompt 已保留。'
        ));
        return true;
    }

    function roleplayFormDraftRequestText(targetKind, modal) {
        const requested = String(targetKind || '').trim().toLowerCase();
        const kind = ['persona', 'player'].includes(requested)
            ? 'persona'
            : requested === 'scene'
                ? 'scene'
                : ['state', 'character_state', 'runtime_state'].includes(requested)
                    ? 'character_state'
                    : 'character';
        if (kind === 'persona') {
            const name = String(modal?.querySelector('[data-describe-vlm-chat-roleplay-persona-name]')?.value || '').trim();
            const identity = String(modal?.querySelector('[data-describe-vlm-chat-roleplay-persona-identity]')?.value || '').trim();
            return [
                name ? `${localText('Current name', '当前名称')}: ${name}` : '',
                identity ? `${localText('Current identity and goals', '当前身份与目标')}: ${identity}` : ''
            ].filter(Boolean).join('\n');
        }
        if (kind === 'character_state') {
            const stateText = String(modal?.querySelector('[data-describe-vlm-chat-roleplay-character-state-text]')?.value || '').trim();
            const stateRequest = String(modal?.querySelector('[data-describe-vlm-chat-roleplay-character-state-draft-context]')?.value || '').trim();
            const fields = visibleRoleplayCharacterStateFields(modal);
            return [
                stateText ? `${localText('Current state', '当前状态')}: ${stateText}` : '',
                fields.length
                    ? `${localText('Current state fields', '当前状态字段')}: ${fields.map((field) => `${field.label}: ${field.value}`).join('; ')}`
                    : '',
                stateRequest
            ].filter(Boolean).join('\n');
        }
        const selector = kind === 'scene'
            ? '[data-describe-vlm-chat-roleplay-scene-draft-context]'
            : '[data-describe-vlm-chat-roleplay-character-draft-context]';
        return String(modal?.querySelector(selector)?.value || '').trim();
    }

    function roleplayFormDraftPreview(targetKind, draft) {
        if (targetKind === 'scene') {
            const scene = draft?.scene || {};
            return [
                `${localText('Location', '地点')}: ${scene.location || localText('(blank)', '（空白）')}`,
                `${localText('Time', '时间')}: ${scene.time || localText('(blank)', '（空白）')}`,
                `${localText('Weather', '天气')}: ${scene.weather || localText('(blank)', '（空白）')}`,
                `${localText('Current event', '当前事件')}: ${scene.current_event || localText('(blank)', '（空白）')}`,
                `${localText('Scene goal', '场景目标')}: ${scene.scene_goal || localText('(blank)', '（空白）')}`
            ].join('\n');
        }
        if (targetKind === 'persona' || targetKind === 'player') {
            const persona = draft?.persona || {};
            return [
                `${localText('Name', '名称')}: ${persona.name || localText('(blank)', '（空白）')}`,
                `${localText('Identity', '身份')}: ${persona.identity || localText('(blank)', '（空白）')}`,
                `${localText('Personality', '性格')}: ${persona.personality || localText('(blank)', '（空白）')}`,
                `${localText('Goals', '目标')}: ${Array.isArray(persona.goals) ? persona.goals.join(', ') : localText('(blank)', '（空白）')}`
            ].join('\n');
        }
        if (['state', 'character_state', 'runtime_state'].includes(String(targetKind || '').trim().toLowerCase())) {
            const state = draft?.character_state || draft?.state || {};
            const fields = normalizeRoleplayStateFields(state.state_fields || state.fields);
            return [
                `${localText('Current state', '当前状态')}: ${state.state_text || state.text || localText('(blank)', '（空白）')}`,
                `${localText('State fields', '状态字段')}: ${fields.length ? fields.map((field) => `${field.label}: ${field.value}`).join('; ') : localText('(none)', '（无）')}`
            ].join('\n');
        }
        const character = draft?.character || {};
        return [
            `${localText('Name', '名称')}: ${character.name || localText('(blank)', '（空白）')}`,
            `${localText('Identity', '身份')}: ${character.identity || localText('(blank)', '（空白）')}`,
            `${localText('Background', '背景')}: ${character.background || localText('(blank)', '（空白）')}`,
            `${localText('Personality', '性格')}: ${character.personality || localText('(blank)', '（空白）')}`,
            `${localText('Speech style', '说话方式')}: ${character.speech_style || localText('(blank)', '（空白）')}`
        ].join('\n');
    }

    function setRoleplayVisualDraftBusy(modal, busy) {
        const button = modal?.querySelector('[data-describe-vlm-chat-roleplay-visual-draft]');
        if (!button) return;
        button.disabled = !!busy;
        button.classList.toggle('is-busy', !!busy);
        button.setAttribute('aria-busy', busy ? 'true' : 'false');
    }

    async function requestRoleplayVisualDraft(runtime = currentConversationRuntime(), modal = document.getElementById('describe_vlm_chat_modal')) {
        const target = runtime || currentConversationRuntime();
        if (normalizeChatMode(target.chatMode) !== 'roleplay') return false;
        if (target.busy || target.roleplayVisualDraftBusy) {
            setConversationStatus(target, localText('Wait for the current reply before drafting a scene image.', '请等待当前回复结束后再生成场照提议。'), true);
            return false;
        }
        const input = modal?.querySelector('[data-describe-vlm-chat-input]');
        const typed = String(input?.value || '').trim();
        const requestText = typed || localText(
            'Draft a story scene image from the current moment. Choose the characters who are visibly present and use a cinematic composition.',
            '根据当前剧情生成一张场照提议，选择实际在场的角色，并给出电影感构图。'
        );
        let session = roleplaySessionFromVisibleForm(target, modal);
        const history = buildRollingHistory(MAX_HISTORY_TURNS, HISTORY_BUDGET, target.messages);
        const fullHistory = buildRollingHistory(32, FULL_HISTORY_BUDGET, target.messages);
        const sourcePrompt = roleplaySystemPromptSource(target, modal);
        const version = readSelectedVlmVersion();
        const requestId = uid('roleplay_visual_draft');
        const customApi = readDescribeCustomApi(version);
        const userContext = creativeUserContext();
        pauseRoleplayForUserInput(target);
        target.roleplayVisualDraftBusy = true;
        setRoleplayVisualDraftBusy(modal, true);
        setConversationStatus(target, localText(
            'The Agent is preparing a story image proposal...',
            'Agent 正在整理场照提议……'
        ));
        try {
            const response = await postJson('/describe-image/vlm-chat-run', {
                request_kind: 'roleplay_visual_draft',
                request_id: requestId,
                message: requestText,
                history: history.messages,
                history_full: fullHistory.messages,
                context: {
                    omitted: history.omitted,
                    chars: history.chars,
                    budget: history.budget
                },
                system_prompt: sourcePrompt,
                user_system_prompt: sourcePrompt,
                custom_system_prompt: sourcePrompt,
                conversation_id: target.conversationId,
                chat_mode: 'roleplay',
                describe_chat_mode: 'roleplay',
                roleplay_request_kind: 'visual_draft',
                roleplay_visual_request: requestText,
                roleplay_session: session,
                agent_routing: session.agent_routing,
                agent_routing_local_version: String(session.agent_routing?.profiles?.local_main?.version || '').trim(),
                agent_routing_api_profile: customApi,
                agent_routing_api_profile_version: String(session.agent_routing?.profiles?.api_main?.version || '').trim(),
                version,
                custom_api: customApi,
                vram_policy: state.vramPolicy,
                kv_cache_type: state.kvCacheType,
                n_ctx: currentVlmNctx(version),
                unload_after_chat: !!target.unloadAfterChat,
                user_did: userContext.user_did,
                max_tokens: 1800,
                __lang: state.__lang,
                lang: state.__lang
            });
            if (!response?.ok || !response.roleplay_visual_action?.prompt) {
                setConversationStatus(target, localText(
                    'The Agent could not create a story image proposal.',
                    'Agent 没有生成有效的场照提议。'
                ), true);
                return false;
            }
            target.roleplaySession = normalizeRoleplaySession(response.roleplay_session || session, target.conversationId);
            const action = Object.assign({}, response.roleplay_visual_action, {
                type: 'offer_image',
                roleplay_visual: true,
                roleplay_visual_manual: true,
                generation: { state: 'awaiting_confirmation', assets: [] }
            });
            target.messages.push({
                id: uid('roleplay_visual_draft_message'),
                role: 'assistant',
                content: localText('Story image proposal', '场照生成提议'),
                actions: [action],
                roleplay_visual_snapshot: response.roleplay_visual_snapshot || action.visual_snapshot || {},
                created_at: new Date().toISOString()
            });
            target.persistenceDirty = true;
            if (isCurrentConversationRuntime(target)) {
                state.roleplaySession = target.roleplaySession;
                state.messages = target.messages;
                syncRoleplayControls(modal, target);
                if (input) setChatInputValue('', false);
            }
            saveConversationSnapshot(target);
            renderMessages();
            setConversationStatus(target, localText(
                'The story image proposal is ready. Review it and confirm generation when it looks right.',
                '场照提议已生成，请检查内容，确认后再开始生成。'
            ));
            return true;
        } finally {
            target.roleplayVisualDraftBusy = false;
            setRoleplayVisualDraftBusy(modal, false);
        }
    }

    async function requestRoleplayVisualPromptReformat(ref, runtime = currentConversationRuntime(), modal = document.getElementById('describe_vlm_chat_modal')) {
        const target = runtime || currentConversationRuntime();
        if (normalizeChatMode(target.chatMode) !== 'roleplay') return false;
        const found = isCurrentConversationRuntime(target)
            ? syncCreativeActionFromDom(ref)
            : creativeActionFromRef(ref, target.messages);
        if (!found?.action?.roleplay_visual) return false;
        const action = found.action;
        const targetPreset = String(action.preset || '').trim();
        const currentPrompt = String(action.prompt || '').trim();
        if (!targetPreset || !currentPrompt) return false;
        const requestId = uid('roleplay_visual_reformat');
        action.prompt_reformat = {
            state: 'running',
            target_preset: targetPreset,
            request_id: requestId,
            error: ''
        };
        persistCreativeAction(true, {}, target);
        setConversationStatus(target, localText(
            `The Agent is adapting the scene prompt for ${targetPreset}...`,
            `Agent 正在按 ${targetPreset} 整理场照提示词……`
        ));
        try {
            await ensureCreativePresetCatalog();
            const live = creativeActionFromRef(ref, target.messages);
            if (!live || live.action.prompt_reformat?.request_id !== requestId) return false;
            const session = normalizeRoleplaySession(target.roleplaySession, target.conversationId);
            const history = buildRollingHistory(MAX_HISTORY_TURNS, HISTORY_BUDGET, target.messages);
            const fullHistory = buildRollingHistory(32, FULL_HISTORY_BUDGET, target.messages);
            const sourcePrompt = roleplaySystemPromptSource(target, modal);
            const version = readSelectedVlmVersion();
            const customApi = readDescribeCustomApi(version);
            const userContext = creativeUserContext();
            const capabilities = creativePresetCapabilitiesPayload();
            const capability = capabilities.find((item) => String(item?.name || '').toLowerCase() === targetPreset.toLowerCase()) || {
                name: targetPreset
            };
            const response = await postJson('/describe-image/vlm-chat-run', {
                request_kind: 'roleplay_visual_reformat',
                request_id: requestId,
                message: localText(
                    `Adapt the current story-scene prompt for the selected Preset: ${targetPreset}.`,
                    `请将当前场照提示词整理为适用于所选 Preset「${targetPreset}」的格式。`
                ),
                history: history.messages,
                history_full: fullHistory.messages,
                context: {
                    omitted: history.omitted,
                    chars: history.chars,
                    budget: history.budget
                },
                system_prompt: sourcePrompt,
                user_system_prompt: sourcePrompt,
                custom_system_prompt: sourcePrompt,
                conversation_id: target.conversationId,
                chat_mode: 'roleplay',
                describe_chat_mode: 'roleplay',
                roleplay_request_kind: 'visual_reformat',
                roleplay_visual_request: `Adapt the current story-scene prompt for the selected Preset: ${targetPreset}.`,
                roleplay_visual_prompt: currentPrompt,
                roleplay_visual_preset: targetPreset,
                roleplay_visual_capability: capability,
                roleplay_visual_snapshot: live.action.visual_snapshot || {},
                roleplay_session: session,
                agent_routing: session.agent_routing,
                agent_routing_local_version: String(session.agent_routing?.profiles?.local_main?.version || '').trim(),
                agent_routing_api_profile: customApi,
                agent_routing_api_profile_version: String(session.agent_routing?.profiles?.api_main?.version || '').trim(),
                version,
                custom_api: customApi,
                vram_policy: state.vramPolicy,
                kv_cache_type: state.kvCacheType,
                n_ctx: currentVlmNctx(version),
                unload_after_chat: !!target.unloadAfterChat,
                user_did: userContext.user_did,
                max_tokens: 1800,
                __lang: state.__lang,
                lang: state.__lang
            });
            const latest = creativeActionFromRef(ref, target.messages);
            if (!latest || latest.action.prompt_reformat?.request_id !== requestId) return false;
            const nextPrompt = String(response?.roleplay_visual_prompt || '').trim();
            if (!response?.ok || !nextPrompt) {
                throw new Error(String(response?.details || response?.error || localText(
                    'The Agent did not return a usable prompt.',
                    'Agent 没有返回可用的提示词。'
                )));
            }
            latest.action.prompt = nextPrompt;
            latest.action.prompt_target_preset = targetPreset;
            latest.action.prompt_user_edited = false;
            latest.action.prompt_reformat = {
                state: 'idle',
                target_preset: targetPreset,
                request_id: '',
                error: ''
            };
            if (latest.action.task_request && typeof latest.action.task_request === 'object') {
                latest.action.task_request = Object.assign({}, latest.action.task_request, { instruction: nextPrompt });
            }
            const generation = creativeGenerationForAction(latest.action);
            if (!CREATIVE_ACTIVE_STATES.has(String(generation.state || '').toLowerCase())) {
                generation.state = 'awaiting_confirmation';
                generation.error = '';
            }
            persistCreativeAction(true, {}, target);
            setConversationStatus(target, localText(
                `The scene prompt is ready for ${targetPreset}.`,
                `场照提示词已按 ${targetPreset} 整理完成。`
            ));
            return true;
        } catch (error) {
            const latest = creativeActionFromRef(ref, target.messages);
            if (latest && latest.action.prompt_reformat?.request_id === requestId) {
                latest.action.prompt_reformat = {
                    state: 'failed',
                    target_preset: targetPreset,
                    request_id: '',
                    error: String(error?.message || error || localText('Prompt adaptation failed.', '提示词整理失败。')).slice(0, 1000)
                };
                persistCreativeAction(true, {}, target);
            }
            setConversationStatus(target, localText(
                `The scene prompt could not be adapted for ${targetPreset}.`,
                `场照提示词未能按 ${targetPreset} 整理。`
            ), true);
            return false;
        }
    }

    async function requestRoleplayFormDraft(targetKind = 'character', runtime = currentConversationRuntime(), modal = document.getElementById('describe_vlm_chat_modal')) {
        const target = runtime || currentConversationRuntime();
        const requestedKind = String(targetKind || '').trim().toLowerCase();
        const kind = requestedKind === 'scene'
            ? 'scene'
            : ['persona', 'player'].includes(requestedKind)
                ? 'persona'
                : ['state', 'character_state', 'runtime_state'].includes(requestedKind)
                    ? 'character_state'
                    : 'character';
        let requestText = roleplayFormDraftRequestText(kind, modal);
        const sourcePrompt = roleplaySystemPromptSource(target, modal);
        if (!sourcePrompt && !requestText) {
            requestText = kind === 'scene'
                ? localText(
                    'Create a fitting opening scene for this roleplay. Give it a clear location, time, current event, and immediate story goal.',
                    '请为这段角色扮演生成一个合适的开场场景，包含地点、时间、当前事件和眼前的剧情目标。'
                )
                : kind === 'persona'
                    ? localText(
                        'Create a playable player persona with a clear identity, motivation, personality, and goals. Preserve any current details and fill only what is missing.',
                        '请生成一个适合直接参与剧情的玩家身份，包含身份、动机、性格和目标。保留现有内容，只补充缺少的部分。'
                    )
                    : kind === 'character_state'
                        ? localText(
                            'Create or supplement the active character current state from the current story. Preserve existing state and field values; only add facts supported by the story.',
                            '根据当前剧情生成或补充当前角色状态。保留已有状态和字段值，只添加剧情能够支持的事实。'
                        )
                        : localText(
                            'Create a distinctive roleplay character with a clear identity, motivation, personality, and speaking style. Keep the concept easy to play.',
                            '请生成一个适合角色扮演的鲜明角色，包含明确身份、动机、性格和说话方式，设定要方便直接开始游戏。'
                        );
        }
        let session = normalizeRoleplaySession(target.roleplaySession, target.conversationId);
        session = applyVisibleRoleplayPlayerState(session, modal);
        if (kind === 'persona') session = applyVisibleRoleplayPersonaFields(session, modal);
        if (kind === 'character_state') {
            session = applyVisibleRoleplayCharacterFields(session, modal);
            session = applyVisibleRoleplayCharacterState(session, modal);
        }
        const version = readSelectedVlmVersion();
        setConversationStatus(target, localText(
            'The assistant is preparing a form draft...',
            '助手正在生成表单草稿……'
        ));
        const response = await postJson('/describe-image/vlm-chat-run', {
            request_kind: 'roleplay_form_draft',
            request_id: uid('roleplay_form_draft'),
            message: requestText || localText(
                'Create a complete draft from the current system prompt.',
                '根据当前 system prompt 生成完整草稿。'
            ),
            system_prompt: sourcePrompt,
            user_system_prompt: sourcePrompt,
            custom_system_prompt: sourcePrompt,
            conversation_id: target.conversationId,
            chat_mode: 'roleplay',
            describe_chat_mode: 'roleplay',
            roleplay_request_kind: 'form_draft',
            roleplay_form_target: kind,
            roleplay_form_request: requestText,
            roleplay_session: session,
            agent_routing: session.agent_routing,
            version,
            custom_api: readDescribeCustomApi(version),
            vram_policy: state.vramPolicy,
            kv_cache_type: state.kvCacheType,
            n_ctx: currentVlmNctx(version),
            unload_after_chat: !!target.unloadAfterChat,
            max_tokens: 1800,
            __lang: state.__lang,
            lang: state.__lang
        });
        if (!response?.ok || !response.form_draft?.ok) {
            setConversationStatus(target, localText(
                'The assistant could not create this form draft.',
                '助手没有生成有效的表单草稿。'
            ), true);
            return false;
        }
        const draft = response.form_draft;
        const next = normalizeRoleplaySession(session, target.conversationId);
        const setField = (selector, value) => {
            const field = modal?.querySelector(selector);
            if (field) field.value = String(value || '');
        };
        if (kind === 'scene') {
            const scene = draft.scene || {};
            next.story_state.scene = Object.assign({}, next.story_state.scene, scene);
            setField('[data-describe-vlm-chat-roleplay-scene-location]', scene.location);
            setField('[data-describe-vlm-chat-roleplay-scene-time]', scene.time);
            setField('[data-describe-vlm-chat-roleplay-scene-event]', scene.current_event);
        } else if (kind === 'persona') {
            const persona = draft.persona || {};
            const current = next.persona || {};
            const currentName = String(current.name || '').trim();
            const currentAppearance = String(current.appearance || '').trim();
            const currentIdentity = String(current.identity || '').trim();
            const currentPersonality = String(current.personality || '').trim();
            const currentRelationshipSeed = String(current.relationship_seed || '').trim();
            const currentGoals = Array.isArray(current.goals) ? current.goals.filter(Boolean) : [];
            next.persona = Object.assign({}, current, {
                name: currentName || String(persona.name || '').trim(),
                appearance: currentAppearance || String(persona.appearance || '').trim(),
                identity: currentIdentity || String(persona.identity || '').trim(),
                personality: currentPersonality || String(persona.personality || '').trim(),
                goals: currentGoals.length
                    ? currentGoals
                    : (Array.isArray(persona.goals) ? persona.goals : []),
                relationship_seed: currentRelationshipSeed || String(persona.relationship_seed || '').trim()
            });
            setField('[data-describe-vlm-chat-roleplay-persona-name]', next.persona.name);
            setField(
                '[data-describe-vlm-chat-roleplay-persona-identity]',
                [next.persona.identity, next.persona.goals.join(', ')].filter(Boolean).join('\n\n')
            );
        } else if (kind === 'character_state') {
            const generatedState = draft.character_state || draft.state || {};
            const activeId = next.active_character_id || next.character.id;
            const currentState = next.story_state.characters?.[activeId] || {};
            const stateText = String(currentState.state_text || '').trim()
                || String(generatedState.state_text || generatedState.text || '').trim();
            next.story_state.characters[activeId] = Object.assign({}, currentState, {
                state_text: stateText.slice(0, MAX_ROLEPLAY_STATE_TEXT),
                state_fields: mergeRoleplayStateFields(currentState.state_fields, generatedState.state_fields || generatedState.fields)
            });
            setField('[data-describe-vlm-chat-roleplay-character-state-text]', next.story_state.characters[activeId].state_text);
            renderRoleplayCharacterStateFields(modal, next.story_state.characters[activeId].state_fields);
        } else {
            const character = draft.character || {};
            const activeId = next.active_character_id || next.character.id;
            next.characters[activeId] = Object.assign({}, next.characters[activeId] || next.character, {
                name: String(character.name || next.character.name || '').trim(),
                identity: String(character.identity || '').trim(),
                background: String(character.background || '').trim(),
                personality: String(character.personality || '').trim(),
                speech_style: String(character.speech_style || '').trim(),
                behavior_rules: Array.isArray(character.behavior_rules) ? character.behavior_rules : [],
                first_message: String(character.first_message || '').trim(),
                example_dialogues: Array.isArray(character.example_dialogues) ? character.example_dialogues : []
            });
            next.character = next.characters[activeId];
            setField('[data-describe-vlm-chat-roleplay-character-name]', next.character.name);
            setField('[data-describe-vlm-chat-roleplay-character-identity]', [next.character.identity, next.character.background].filter(Boolean).join('\n\n'));
            setField('[data-describe-vlm-chat-roleplay-character-style]', [next.character.personality, next.character.speech_style].filter(Boolean).join('\n\n'));
        }
        target.roleplaySession = normalizeRoleplaySession(next, target.conversationId);
        target.persistenceDirty = true;
        if (isCurrentConversationRuntime(target)) state.roleplaySession = target.roleplaySession;
        saveConversationSnapshot(target);
        syncRoleplayControls(modal, target);
        setConversationStatus(target, localText(
            'The form draft was applied. Review it before continuing.',
            '表单草稿已填入，请检查后继续。'
        ));
        return true;
    }

    function roleplaySessionFromVisibleForm(runtime, modal) {
        const target = runtime || currentConversationRuntime();
        let session = normalizeRoleplaySession(target.roleplaySession, target.conversationId);
        session = applyVisibleRoleplayCharacterFields(session, modal);
        session = applyVisibleRoleplayCharacterState(session, modal);
        session = applyVisibleRoleplayPlayerState(session, modal);
        const referenceDraft = roleplayReferenceDraft(target);
        const activeId = session.active_character_id || session.character.id;
        const characterReferences = referenceDraft.characters?.[activeId] || referenceDraft.character || [];
        session.character.avatar_asset_id = characterReferences[0] || '';
        session.character.reference_asset_ids = characterReferences.slice(1, MAX_ROLEPLAY_REFERENCE_IMAGES);
        session.characters[activeId] = session.character;
        return normalizeRoleplaySession(session, target.conversationId);
    }

    async function startRoleplayImageAction(runtime, modal, area, actionRef) {
        const target = runtime || currentConversationRuntime();
        try {
            await startCreativeGeneration(actionRef, target);
        } catch (error) {
            setRoleplayActionStatus(target, modal, area, localText(
                'The image generation task could not be started.',
                '图片生成任务没有启动。'
            ), true);
            return false;
        }
        const found = creativeActionFromRef(actionRef, target.messages);
        const generation = found ? creativeGenerationForAction(found.action) : null;
        const currentState = String(generation?.state || '').toLowerCase();
        if (!found || ['failed', 'models_missing', 'preset_missing', 'needs_media', 'needs_mask', 'needs_interaction', 'no_compatible_route', 'parameter_profile_missing', 'parameter_profile_incompatible'].includes(currentState)) {
            setRoleplayActionStatus(target, modal, area, String(generation?.error || generation?.message || localText(
                'The image generation task could not be started.',
                '图片生成任务没有启动。'
            )), true);
            return false;
        }
        setRoleplayActionStatus(target, modal, area, localText(
            'Image generation has started. When it finishes, choose Adopt or Generate again here.',
            '图片生成已开始。完成后可直接在当前设置中“采用”或“重抽”。'
        ));
        return true;
    }

    async function requestRoleplayCharacterReferenceImage(runtime = currentConversationRuntime(), modal = document.getElementById('describe_vlm_chat_modal')) {
        const target = runtime || currentConversationRuntime();
        const session = roleplaySessionFromVisibleForm(target, modal);
        const actionSelector = '[data-describe-vlm-chat-roleplay-generate-character-reference]';
        const requestField = modal?.querySelector('[data-describe-vlm-chat-roleplay-character-reference-request]');
        const requestText = String(requestField?.value || '').trim();
        if (![session.character.name, session.character.identity, session.character.background, session.character.personality, session.character.speech_style, requestText].some(Boolean)) {
            setRoleplayActionStatus(target, modal, 'character-reference', localText(
                'Add character details before generating a reference image.',
                '请先填写角色内容，再生成角色设定图。'
            ), true);
            return false;
        }
        setRoleplayActionBusy(modal, actionSelector, true);
        setRoleplayActionStatus(target, modal, 'character-reference', localText(
            'Preparing the character reference image...',
            '正在准备角色设定图……'
        ));
        try {
            target.roleplaySession = session;
            target.persistenceDirty = true;
            if (isCurrentConversationRuntime(target)) state.roleplaySession = session;
            saveConversationSnapshot(target);
            syncRoleplayControls(modal, target);
            const response = await postJson('/describe-image/vlm-roleplay/character-image-action', {
                session,
                character_id: session.character.id,
                image_request: requestText,
                turn_id: session.active_turn_id,
                __lang: state.__lang,
                lang: state.__lang
            });
            if (!response?.ok || !response.action?.prompt) {
                setRoleplayActionStatus(target, modal, 'character-reference', localText(
                    'The character reference image task could not be created.',
                    '角色设定图生成任务创建失败。'
                ), true);
                return false;
            }
            const action = Object.assign({}, response.action, {
                type: 'generate_image',
                tool_call_id: uid('roleplay_character_image'),
                roleplay_character_image: true,
                generation: { state: 'queued', assets: [] }
            });
            const message = {
                id: uid('roleplay_character_image_message'),
                role: 'assistant',
                content: localText('Character reference image draft', '角色设定图草稿'),
                actions: [action],
                created_at: new Date().toISOString()
            };
            target.messages.push(message);
            target.persistenceDirty = true;
            if (isCurrentConversationRuntime(target)) state.messages = target.messages;
            saveConversationSnapshot(target);
            renderMessages();
            syncRoleplayControls(modal, target);
            const actionRef = `${target.messages.length - 1}:0`;
            return await startRoleplayImageAction(target, modal, 'character-reference', actionRef);
        } finally {
            setRoleplayActionBusy(modal, actionSelector, false);
        }
    }

    async function requestRoleplaySceneReferenceImage(runtime = currentConversationRuntime(), modal = document.getElementById('describe_vlm_chat_modal')) {
        const target = runtime || currentConversationRuntime();
        const session = roleplaySessionFromVisibleForm(target, modal);
        const scene = session.story_state?.scene || {};
        const sceneRequest = String(modal?.querySelector('[data-describe-vlm-chat-roleplay-scene-reference-request]')?.value || '').trim();
        const location = String(modal?.querySelector('[data-describe-vlm-chat-roleplay-scene-location]')?.value || '').trim();
        const time = String(modal?.querySelector('[data-describe-vlm-chat-roleplay-scene-time]')?.value || '').trim();
        const event = String(modal?.querySelector('[data-describe-vlm-chat-roleplay-scene-event]')?.value || '').trim();
        scene.location = location;
        scene.time = time;
        scene.current_event = event;
        session.story_state.scene = scene;
        session.visual_config.reference_asset_ids = roleplayReferenceDraft(target).scene.slice(0, MAX_ROLEPLAY_REFERENCE_IMAGES);
        const actionSelector = '[data-describe-vlm-chat-roleplay-generate-scene-reference]';
        if (![location, time, event, sceneRequest].some(Boolean)) {
            setRoleplayActionStatus(target, modal, 'scene-reference', localText(
                'Add a scene description before generating a reference image.',
                '请先填写场景内容，再生成场景参考图。'
            ), true);
            return false;
        }
        setRoleplayActionBusy(modal, actionSelector, true);
        setRoleplayActionStatus(target, modal, 'scene-reference', localText(
            'Preparing the scene reference image...',
            '正在准备场景参考图……'
        ));
        try {
            target.roleplaySession = normalizeRoleplaySession(session, target.conversationId);
            target.persistenceDirty = true;
            if (isCurrentConversationRuntime(target)) state.roleplaySession = target.roleplaySession;
            saveConversationSnapshot(target);
            syncRoleplayControls(modal, target);
            const sceneReferenceSession = Object.assign({}, target.roleplaySession, {
                story_state: Object.assign({}, target.roleplaySession?.story_state, {
                    scene: Object.assign({}, target.roleplaySession?.story_state?.scene, {
                        present_character_ids: []
                    })
                }),
                visual_config: Object.assign({}, target.roleplaySession?.visual_config, {
                    reference_asset_ids: []
                })
            });
            const response = await postJson('/describe-image/vlm-roleplay/scene-image-action', {
                session: sceneReferenceSession,
                scene_request: sceneRequest,
                turn_id: sceneReferenceSession.active_turn_id,
                __lang: state.__lang,
                lang: state.__lang
            });
            if (!response?.ok || !response.action?.prompt) {
                setRoleplayActionStatus(target, modal, 'scene-reference', localText(
                    'The scene reference image task could not be created.',
                    '场景参考图生成任务创建失败。'
                ), true);
                return false;
            }
            const action = Object.assign({}, response.action, {
                type: 'generate_image',
                tool_call_id: uid('roleplay_scene_image'),
                roleplay_scene_reference_image: true,
                generation: { state: 'queued', assets: [] }
            });
            target.messages.push({
                id: uid('roleplay_scene_image_message'),
                role: 'assistant',
                content: localText('Scene reference image draft', '场景参考图草稿'),
                actions: [action],
                created_at: new Date().toISOString()
            });
            target.persistenceDirty = true;
            if (isCurrentConversationRuntime(target)) state.messages = target.messages;
            saveConversationSnapshot(target);
            renderMessages();
            syncRoleplayControls(modal, target);
            const actionRef = `${target.messages.length - 1}:0`;
            return await startRoleplayImageAction(target, modal, 'scene-reference', actionRef);
        } finally {
            setRoleplayActionBusy(modal, actionSelector, false);
        }
    }

    async function acceptRoleplaySceneReferenceImage(ref, assetIndex) {
        const runtime = syncCurrentRuntimeFromState();
        const modal = document.getElementById('describe_vlm_chat_modal');
        const found = creativeActionFromRef(ref, runtime.messages);
        const index = Number(assetIndex);
        const action = found?.action;
        const generation = action ? creativeGenerationForAction(action) : null;
        const asset = Array.isArray(generation?.assets) && Number.isInteger(index) ? generation.assets[index] : null;
        if (!found || !action?.roleplay_scene_reference_image || !asset || String(generation.state || '').toLowerCase() !== 'finished') return false;
        if (String(action.branch_id || 'main') !== String(runtime.roleplaySession?.active_branch_id || 'main')) {
            setRoleplayActionStatus(runtime, modal, 'scene-reference', localText('This image belongs to another story branch.', '这张图片属于另一条剧情分支。'), true);
            return false;
        }
        const assetId = await materializeRoleplayGeneratedAsset(asset);
        if (!assetId) {
            setRoleplayActionStatus(runtime, modal, 'scene-reference', localText('The generated image cannot be saved as a scene reference.', '生成图片无法保存为场景参考图。'), true);
            return false;
        }
        const response = await postJson('/describe-image/vlm-roleplay/scene-reference-apply', {
            session: normalizeRoleplaySession(runtime.roleplaySession, runtime.conversationId),
            asset_ids: [assetId],
            turn_id: action.turn_id || runtime.roleplaySession.active_turn_id,
            __lang: state.__lang,
            lang: state.__lang
        });
        if (!response?.ok || !response.session) {
            setRoleplayActionStatus(runtime, modal, 'scene-reference', localText('The scene reference image was not applied.', '场景参考图没有采用成功。'), true);
            return false;
        }
        runtime.roleplaySession = normalizeRoleplaySession(response.session, runtime.conversationId);
        const draft = roleplayReferenceDraft(runtime);
        setRoleplayReferenceDraft(runtime, 'scene', [assetId, ...draft.scene.filter((id) => roleplayReferenceIdentity(id) !== roleplayReferenceIdentity(assetId))]);
        generation.assets[index] = Object.assign({}, asset, { asset_id: assetId });
        action.accepted_asset_id = assetId;
        runtime.persistenceDirty = true;
        if (isCurrentConversationRuntime(runtime)) state.roleplaySession = runtime.roleplaySession;
        upsertRoleplayBranchSnapshot(runtime, {
            branch_id: runtime.roleplaySession.active_branch_id || 'main',
            reason: 'scene_reference_adopted',
            fork_turn_id: action.turn_id || runtime.roleplaySession.active_turn_id || ''
        });
        saveConversationSnapshot(runtime);
        persistRoleplayBranchRemote(runtime, runtime.roleplaySession.active_branch_id || 'main').catch(() => {});
        syncRoleplayControls(modal, runtime);
        renderMessages();
        setRoleplayActionStatus(runtime, modal, 'scene-reference', localText('Scene reference image adopted.', '场景参考图已采用。'));
        return true;
    }

    async function acceptRoleplayCharacterReferenceImage(ref, assetIndex) {
        const runtime = syncCurrentRuntimeFromState();
        const found = creativeActionFromRef(ref, runtime.messages);
        const index = Number(assetIndex);
        const action = found?.action;
        const generation = action ? creativeGenerationForAction(action) : null;
        const asset = Array.isArray(generation?.assets) && Number.isInteger(index) ? generation.assets[index] : null;
        if (!found || !action?.roleplay_character_image || !asset || String(generation.state || '').toLowerCase() !== 'finished') return false;
        if (String(action.branch_id || 'main') !== String(runtime.roleplaySession?.active_branch_id || 'main')) {
            setConversationStatus(runtime, localText('This image belongs to another story branch.', '这张图片属于另一条剧情分支。'), true);
            return false;
        }
        const assetId = await materializeRoleplayGeneratedAsset(asset);
        if (!assetId) {
            setConversationStatus(runtime, localText('The generated image cannot be saved as a character reference.', '生成图片无法保存为角色设定图。'), true);
            return false;
        }
        const targetCharacterId = action.character_reference_id || runtime.roleplaySession.active_character_id || runtime.roleplaySession.character.id;
        const targetCharacter = runtime.roleplaySession?.characters?.[targetCharacterId] || runtime.roleplaySession?.character || {};
        const previousAvatar = String(targetCharacter.avatar_asset_id || '').trim();
        const response = await postJson('/describe-image/vlm-roleplay/character-reference-apply', {
            session: normalizeRoleplaySession(runtime.roleplaySession, runtime.conversationId),
            character_id: action.character_reference_id || runtime.roleplaySession.character.id,
            asset_ids: [assetId],
            turn_id: action.turn_id || runtime.roleplaySession.active_turn_id,
            __lang: state.__lang,
            lang: state.__lang
        });
        if (!response?.ok || !response.session) {
            setConversationStatus(runtime, localText('The character reference image was not applied.', '角色设定图没有采用成功。'), true);
            return false;
        }
        runtime.roleplaySession = normalizeRoleplaySession(response.session, runtime.conversationId);
        const draft = roleplayReferenceDraft(runtime);
        const existingReferences = draft.characters?.[targetCharacterId] || [];
        setRoleplayReferenceDraft(runtime, 'character', [
            assetId,
            ...existingReferences.filter((id) => roleplayReferenceIdentity(id) !== roleplayReferenceIdentity(previousAvatar) && roleplayReferenceIdentity(id) !== roleplayReferenceIdentity(assetId))
        ], targetCharacterId);
        generation.assets[index] = Object.assign({}, asset, { asset_id: assetId });
        action.accepted_asset_id = assetId;
        runtime.persistenceDirty = true;
        if (isCurrentConversationRuntime(runtime)) state.roleplaySession = runtime.roleplaySession;
        upsertRoleplayBranchSnapshot(runtime, {
            branch_id: runtime.roleplaySession.active_branch_id || 'main',
            reason: 'character_reference_adopted',
            fork_turn_id: action.turn_id || runtime.roleplaySession.active_turn_id || ''
        });
        saveConversationSnapshot(runtime);
        persistRoleplayBranchRemote(runtime, runtime.roleplaySession.active_branch_id || 'main').catch(() => {});
        syncRoleplayControls(document.getElementById('describe_vlm_chat_modal'), runtime);
        renderMessages();
        setConversationStatus(runtime, localText('Character reference image adopted.', '角色设定图已采用。'));
        return true;
    }

    async function requestRoleplayAppearanceImage(runtime = currentConversationRuntime(), modal = document.getElementById('describe_vlm_chat_modal')) {
        const target = runtime || currentConversationRuntime();
        const session = normalizeRoleplaySession(target.roleplaySession, target.conversationId);
        target.roleplaySession = session;
        if (isCurrentConversationRuntime(target)) state.roleplaySession = session;
        const actionSelector = '[data-describe-vlm-chat-roleplay-generate-appearance]';
        const requestField = modal?.querySelector('[data-describe-vlm-chat-roleplay-appearance-request]');
        const stateRuntime = roleplayCharacterRuntime(session, session.character.id);
        const requestText = String(requestField?.value || '').trim()
            || [stateRuntime.appearance, ...(stateRuntime.condition || []), stateRuntime.current_action].filter(Boolean).join('；');
        setRoleplayActionBusy(modal, actionSelector, true);
        setRoleplayActionStatus(target, modal, 'appearance', localText(
            'Preparing the current appearance image...',
            '正在准备当前状态图……'
        ));
        try {
            const response = await postJson('/describe-image/vlm-roleplay/appearance-image-action', {
                session,
                character_id: session.character.id,
                appearance_request: requestText,
                turn_id: session.active_turn_id,
                __lang: state.__lang,
                lang: state.__lang
            });
            if (!response?.ok || !response.action?.prompt) {
                setRoleplayActionStatus(target, modal, 'appearance', localText(
                    'A fixed character reference image is required before creating a current appearance image.',
                    '生成当前状态图前，需要先添加角色设定图。'
                ), true);
                return false;
            }
            const action = Object.assign({}, response.action, {
                type: 'generate_image',
                tool_call_id: uid('roleplay_state_image'),
                roleplay_state_image: true,
                generation: { state: 'queued', assets: [] }
            });
            const message = {
                id: uid('roleplay_state_image_message'),
                role: 'assistant',
                content: localText('Current appearance image draft', '当前状态图草稿'),
                actions: [action],
                created_at: new Date().toISOString()
            };
            target.messages.push(message);
            target.persistenceDirty = true;
            if (isCurrentConversationRuntime(target)) state.messages = target.messages;
            saveConversationSnapshot(target);
            renderMessages();
            syncRoleplayControls(modal, target);
            const actionRef = `${target.messages.length - 1}:0`;
            return await startRoleplayImageAction(target, modal, 'appearance', actionRef);
        } finally {
            setRoleplayActionBusy(modal, actionSelector, false);
        }
    }

    async function materializeRoleplayGeneratedAsset(asset) {
        const normalized = normalizeCreativeAsset(asset);
        if (normalized && roleplayAssetIdLooksLikePath(normalized.asset_id) && !normalized.path && !normalized.output_path) {
            normalized.path = normalized.asset_id;
        }
        const directId = roleplayAssetCanUseDirectId(normalized)
            ? registerRoleplayGeneratedAsset(normalized)
            : '';
        if (directId) return directId;
        const api = creativeCanvasApi();
        if (!api || typeof api.materializeAsset !== 'function') return '';
        const response = await api.materializeAsset({
            project_id: 'describe_vlm_chat',
            node_id: 'roleplay_current_appearance',
            asset_source: {
                node_id: 'roleplay_current_appearance',
                asset: normalized || {}
            },
            user_context: creativeUserContext()
        });
        const ref = response?.asset_ref && typeof response.asset_ref === 'object' ? response.asset_ref : {};
        const materialized = Object.assign({}, normalized || {}, ref);
        const assetId = String(materialized.asset_id || '').trim();
        if (!response?.ok || !roleplayAssetCanUseDirectId(materialized)) return '';
        return registerRoleplayGeneratedAsset(Object.assign({}, materialized, { asset_id: assetId }));
    }

    async function acceptRoleplayStateImage(ref, assetIndex) {
        const runtime = syncCurrentRuntimeFromState();
        const found = creativeActionFromRef(ref, runtime.messages);
        const index = Number(assetIndex);
        const action = found?.action;
        const generation = action ? creativeGenerationForAction(action) : null;
        const asset = Array.isArray(generation?.assets) && Number.isInteger(index) ? generation.assets[index] : null;
        if (!found || !action?.roleplay_state_image || !asset || String(generation.state || '').toLowerCase() !== 'finished') return false;
        if (String(action.branch_id || 'main') !== String(runtime.roleplaySession?.active_branch_id || 'main')) {
            setConversationStatus(runtime, localText('This image belongs to another story branch.', '这张图片属于另一条剧情分支。'), true);
            return false;
        }
        const assetId = await materializeRoleplayGeneratedAsset(asset);
        if (!assetId) {
            setConversationStatus(runtime, localText('The generated image cannot be saved as a current appearance image.', '生成图片无法保存为当前状态图。'), true);
            return false;
        }
        const response = await postJson('/describe-image/vlm-roleplay/appearance-apply', {
            session: normalizeRoleplaySession(runtime.roleplaySession, runtime.conversationId),
            character_id: action.appearance_character_id || runtime.roleplaySession.character.id,
            asset_ids: [assetId],
            turn_id: action.turn_id || runtime.roleplaySession.active_turn_id,
            __lang: state.__lang,
            lang: state.__lang
        });
        if (!response?.ok || !response.session) {
            setConversationStatus(runtime, localText('The current appearance image was not applied.', '当前状态图没有采用成功。'), true);
            return false;
        }
        runtime.roleplaySession = normalizeRoleplaySession(response.session, runtime.conversationId);
        generation.assets[index] = Object.assign({}, asset, { asset_id: assetId });
        action.accepted_asset_id = assetId;
        runtime.persistenceDirty = true;
        if (isCurrentConversationRuntime(runtime)) state.roleplaySession = runtime.roleplaySession;
        upsertRoleplayBranchSnapshot(runtime, {
            branch_id: runtime.roleplaySession.active_branch_id || 'main',
            reason: 'appearance_image_adopted',
            fork_turn_id: action.turn_id || runtime.roleplaySession.active_turn_id || ''
        });
        saveConversationSnapshot(runtime);
        persistRoleplayBranchRemote(runtime, runtime.roleplaySession.active_branch_id || 'main').catch(() => {});
        syncRoleplayControls(document.getElementById('describe_vlm_chat_modal'), runtime);
        renderMessages();
        setConversationStatus(runtime, localText('Current appearance image adopted.', '当前状态图已采用。'));
        return true;
    }

    function roleplayBranchRequestPayload(runtime) {
        const target = runtime || currentConversationRuntime();
        return {
            session_id: String(target?.roleplaySession?.id || target?.conversationId || ''),
            conversation_id: String(target?.conversationId || ''),
            user_did: creativeUserContext().user_did,
            __lang: state.__lang,
            lang: state.__lang
        };
    }

    function mergeRoleplayBranchRows(runtime, rows) {
        const target = runtime || currentConversationRuntime();
        const local = normalizeRoleplayBranches(target.roleplayBranches, target.conversationId);
        const byId = new Map(local.map((item) => [item.branch_id, item]));
        (Array.isArray(rows) ? rows : []).forEach((row, index) => {
            const branch = normalizeRoleplayBranch(Object.assign({}, row, { remote: true }), target.conversationId, index);
            if (!branch.branch_id) return;
            const existing = byId.get(branch.branch_id);
            byId.set(branch.branch_id, existing
                ? Object.assign({}, existing, {
                    state_version: branch.state_version || existing.state_version,
                    active_turn_id: branch.active_turn_id || existing.active_turn_id,
                    updated_at: branch.updated_at || existing.updated_at,
                    remote: true
                })
                : branch);
        });
        target.roleplayBranches = Array.from(byId.values()).slice(-MAX_ROLEPLAY_BRANCHES);
        if (isCurrentConversationRuntime(target)) state.roleplayBranches = target.roleplayBranches;
        return target.roleplayBranches;
    }

    function syncRoleplayBranchControls(modal, runtime = null) {
        if (!modal) return;
        const target = runtime || currentConversationRuntime();
        if (normalizeChatMode(target.chatMode) !== 'roleplay') return;
        const select = modal.querySelector('[data-describe-vlm-chat-roleplay-branch-select]');
        const meta = modal.querySelector('[data-describe-vlm-chat-roleplay-branch-meta]');
        const restore = modal.querySelector('[data-describe-vlm-chat-roleplay-branch-restore]');
        const remove = modal.querySelector('[data-describe-vlm-chat-roleplay-branch-delete]');
        if (!select) return;
        const activeId = String(target.roleplaySession?.active_branch_id || 'main');
        const previousSelection = String(select.value || '').trim();
        let branches = normalizeRoleplayBranches(target.roleplayBranches, target.conversationId);
        if (!branches.some((item) => item.branch_id === activeId)) {
            upsertRoleplayBranchSnapshot(target, { branch_id: activeId });
            branches = normalizeRoleplayBranches(target.roleplayBranches, target.conversationId);
        }
        select.innerHTML = branches.map((branch) => {
            const label = `${roleplayBranchDisplayName(branch)} · v${Math.max(0, Number(branch.state_version) || 0)}`;
            return `<option value="${escapeHtml(branch.branch_id)}" ${branch.branch_id === activeId ? 'selected' : ''}>${escapeHtml(label)}</option>`;
        }).join('');
        const selectedId = branches.some((item) => item.branch_id === previousSelection)
            ? previousSelection
            : activeId;
        select.value = selectedId;
        const selected = branches.find((item) => item.branch_id === selectedId) || branches.find((item) => item.branch_id === activeId);
        if (meta) {
            const scene = String(selected?.session?.story_state?.scene?.location || '').trim();
            const version = Math.max(0, Number(selected?.state_version || selected?.session?.state_version) || 0);
            meta.textContent = [
                localText(`State version ${version}`, `状态版本 ${version}`),
                scene || localText('No scene snapshot', '暂无场景快照')
            ].join(' · ');
        }
        if (restore) {
            restore.disabled = !selected || selected.branch_id === activeId;
            restore.title = localText('Restore selected branch', '恢复选中的剧情分支');
            restore.setAttribute('aria-label', restore.title);
        }
        if (remove) {
            remove.disabled = !selected || selected.branch_id === activeId || selected.branch_id === 'main';
            remove.title = localText('Delete selected branch', '删除选中的剧情分支');
            remove.setAttribute('aria-label', remove.title);
        }
    }

    async function refreshRoleplayBranches(runtime = currentConversationRuntime()) {
        const target = runtime || currentConversationRuntime();
        if (normalizeChatMode(target.chatMode) !== 'roleplay') return false;
        const response = await postJson('/describe-image/vlm-roleplay/branches/list', roleplayBranchRequestPayload(target));
        if (!response?.ok) return false;
        mergeRoleplayBranchRows(target, response.branches);
        if (isCurrentConversationRuntime(target)) syncRoleplayBranchControls(document.getElementById('describe_vlm_chat_modal'), target);
        return true;
    }

    function persistRoleplayBranchRemote(runtime, branchId = '') {
        const target = runtime || currentConversationRuntime();
        const session = normalizeRoleplaySession(target.roleplaySession, target.conversationId);
        const selectedId = String(branchId || session.active_branch_id || 'main').trim() || 'main';
        return postJson('/describe-image/vlm-roleplay/branches/save', Object.assign(
            roleplayBranchRequestPayload(target),
            {
                branch_id: selectedId,
                session
            }
        ));
    }

    async function restoreRoleplayBranch(branchId, runtime = currentConversationRuntime()) {
        const target = runtime || currentConversationRuntime();
        if (normalizeChatMode(target.chatMode) !== 'roleplay') return false;
        const selectedId = String(branchId || '').trim();
        if (!selectedId) return false;
        const activeId = String(target.roleplaySession?.active_branch_id || 'main');
        if (selectedId === activeId) return false;
        if (target.busy || activeCreativeRunIds(target.messages).length) {
            setConversationStatus(target, localText(
                'Wait for active work before restoring a branch.',
                '请等待当前任务结束后再恢复分支。'
            ), true);
            return false;
        }
        const branches = normalizeRoleplayBranches(target.roleplayBranches, target.conversationId);
        let branch = branches.find((item) => item.branch_id === selectedId) || null;
        if (!branch || !branch.session || (branch.remote && !branch.messages.length)) {
            const response = await postJson('/describe-image/vlm-roleplay/branches/load', Object.assign(
                roleplayBranchRequestPayload(target),
                { branch_id: selectedId }
            ));
            if (!response?.ok || !response.session) {
                setConversationStatus(target, localText('The selected branch is unavailable.', '选中的剧情分支不可用。'), true);
                return false;
            }
            branch = normalizeRoleplayBranch({
                branch_id: selectedId,
                session: response.session,
                remote: true
            }, target.conversationId);
            mergeRoleplayBranchRows(target, [branch]);
        }
        const autoplay = normalizeRoleplayAutoplayState(target.roleplayAutoplayState);
        if (['running', 'paused'].includes(autoplay.phase)) {
            updateRoleplayAutoplayState(target, {
                phase: 'paused',
                reason: 'branch_restore'
            }, localText('Autoplay paused while restoring a branch.', '恢复剧情分支时已暂停托管。'));
        }
        preserveRoleplayBranchBeforeMutation(target, {
            branch_id: activeId,
            reason: 'branch_restore',
            fork_turn_id: target.roleplaySession?.active_turn_id || ''
        });
        target.roleplaySession = normalizeRoleplaySession(branch.session, target.conversationId);
        target.roleplaySession.active_branch_id = selectedId;
        target.messages = Array.isArray(branch.messages) && branch.messages.length
            ? normalizePersistedMessages(branch.messages)
            : [];
        target.roleplayBranches = normalizeRoleplayBranches(target.roleplayBranches, target.conversationId);
        target.persistenceDirty = true;
        applyConversationRuntime(target);
        upsertRoleplayBranchSnapshot(target, { branch_id: selectedId, reason: branch.reason || 'branch_restore' });
        saveConversationSnapshot(target);
        const modal = document.getElementById('describe_vlm_chat_modal');
        syncChatSettingsControls(modal);
        renderMessages();
        setConversationStatus(target, target.messages.length
            ? localText(`Restored branch ${selectedId}.`, `已恢复剧情分支 ${selectedId}。`)
            : localText(`Restored branch ${selectedId}; no local messages were saved for it.`, `已恢复剧情分支 ${selectedId}，但本地没有保存该分支的聊天消息。`));
        return true;
    }

    async function deleteRoleplayBranch(branchId, runtime = currentConversationRuntime()) {
        const target = runtime || currentConversationRuntime();
        const selectedId = String(branchId || '').trim();
        const activeId = String(target.roleplaySession?.active_branch_id || 'main');
        if (!selectedId || selectedId === activeId || selectedId === 'main') return false;
        const response = await postJson('/describe-image/vlm-roleplay/branches/delete', Object.assign(
            roleplayBranchRequestPayload(target),
            { branch_id: selectedId }
        ));
        if (!response?.ok && response?.error !== 'branch_not_deleted') {
            setConversationStatus(target, localText('The branch could not be deleted.', '剧情分支删除失败。'), true);
            return false;
        }
        target.roleplayBranches = normalizeRoleplayBranches(target.roleplayBranches, target.conversationId)
            .filter((item) => item.branch_id !== selectedId);
        target.persistenceDirty = true;
        saveConversationSnapshot(target);
        syncRoleplayBranchControls(document.getElementById('describe_vlm_chat_modal'), target);
        setConversationStatus(target, localText('Branch deleted.', '剧情分支已删除。'));
        return true;
    }

    async function startRoleplayConversationFromBranch(branchId, runtime = currentConversationRuntime()) {
        const sourceRuntime = runtime || currentConversationRuntime();
        const selectedId = String(branchId || '').trim();
        if (normalizeChatMode(sourceRuntime.chatMode) !== 'roleplay' || !selectedId) return false;
        if (sourceRuntime.busy || activeCreativeRunIds(sourceRuntime.messages).length) {
            setConversationStatus(sourceRuntime, localText(
                'Wait for active work before starting a conversation from this branch.',
                '当前任务结束后才能从此分支新建对话。'
            ), true);
            return false;
        }
        let branch = normalizeRoleplayBranches(sourceRuntime.roleplayBranches, sourceRuntime.conversationId)
            .find((item) => item.branch_id === selectedId) || null;
        if (!branch || !branch.session || (branch.remote && !branch.messages.length)) {
            const response = await postJson('/describe-image/vlm-roleplay/branches/load', Object.assign(
                roleplayBranchRequestPayload(sourceRuntime),
                { branch_id: selectedId }
            ));
            if (!response?.ok || !response.session) {
                setConversationStatus(sourceRuntime, localText('The selected branch is unavailable.', '选中的剧情分支不可用。'), true);
                return false;
            }
            branch = normalizeRoleplayBranch({
                branch_id: selectedId,
                session: response.session,
                remote: true
            }, sourceRuntime.conversationId);
        }
        syncCurrentRuntimeFromState();
        stopRoleplayAutoplayRuntime(currentConversationRuntime());
        saveConversationSnapshot();
        const conversationId = uid('describe_vlm_chat');
        const session = normalizeRoleplaySession(Object.assign({}, branch.session, {
            id: uid('roleplay_session'),
            conversation_id: conversationId,
            active_branch_id: 'main'
        }), conversationId);
        const nextRuntime = createEmptyConversationRuntime({
            conversationId,
            chatMode: 'roleplay',
            roleplaySession: session,
            roleplayBranches: [],
            copyRoleplayState: true
        }, conversationId);
        nextRuntime.messages = Array.isArray(branch.messages)
            ? normalizePersistedMessages(branch.messages)
            : [];
        nextRuntime.roleplaySession = session;
        nextRuntime.roleplayBranches = [];
        upsertRoleplayBranchSnapshot(nextRuntime, {
            branch_id: 'main',
            reason: 'new_conversation_from_branch',
            fork_turn_id: session.active_turn_id || ''
        });
        nextRuntime.persistenceDirty = true;
        state.conversationRuntimes.set(conversationId, nextRuntime);
        applyConversationRuntime(nextRuntime);
        state.persistenceRestored = true;
        state.persistenceDirty = true;
        saveConversationSnapshot(nextRuntime);
        const modal = document.getElementById('describe_vlm_chat_modal');
        syncChatSettingsControls(modal);
        syncBusyControls(modal);
        renderPendingImages();
        renderMessages();
        setStatus(localText(
            `New conversation created from branch ${selectedId}.`,
            `已从分支 ${selectedId} 新建独立对话。`
        ));
        return true;
    }

    function roleplayAutoplayLabel(value) {
        const autoplay = normalizeRoleplayAutoplayState(value);
        const progress = autoplay.continuous
            ? `${autoplay.completed_turns}/${localText('∞', '持续')}`
            : `${autoplay.completed_turns}/${autoplay.target_turns}`;
        const labels = {
            idle: localText('Ready', '待命'),
            running: localText('Autoplay', '托管中'),
            paused: localText('Paused', '已暂停'),
            stopped: localText('Stopped', '已停止'),
            completed: localText('Complete', '已完成'),
            error: localText('Needs attention', '需要处理')
        };
        return `${labels[autoplay.phase] || labels.idle} ${progress}`;
    }

    function componentHost(elemId) {
        const safeId = CSS.escape(elemId);
        const app = (typeof window.gradioApp === 'function') ? window.gradioApp() : null;
        return root().querySelector(`#${safeId}`)
            || app?.getElementById?.(elemId)
            || app?.querySelector?.(`#${safeId}`)
            || document.getElementById(elemId);
    }

    function componentInput(elemId) {
        const host = componentHost(elemId);
        return host?.matches?.('textarea,input,select')
            ? host
            : host?.querySelector?.('textarea,input,select');
    }

    function setComponentValue(elemId, value) {
        const input = componentInput(elemId);
        if (!input) return false;
        const proto = input instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : input instanceof HTMLSelectElement
                ? HTMLSelectElement.prototype
                : HTMLInputElement.prototype;
        const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
        if (descriptor?.set) descriptor.set.call(input, String(value ?? ''));
        else input.value = String(value ?? '');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    }

    function readComponentValue(elemId) {
        const input = componentInput(elemId);
        if (input) return input.value || '';
        const host = componentHost(elemId);
        const selected = host?.querySelector?.('[aria-selected="true"], [data-selected="true"], .selected');
        return selected?.textContent?.trim() || host?.textContent?.trim() || '';
    }

    function readCheckboxValue(elemId, fallback = false) {
        const host = componentHost(elemId);
        const input = host?.matches?.('input[type="checkbox"]')
            ? host
            : host?.querySelector?.('input[type="checkbox"]');
        return input ? !!input.checked : !!fallback;
    }

    function clickComponentButton(elemId) {
        const host = componentHost(elemId);
        const button = host?.matches?.('button') ? host : host?.querySelector?.('button');
        if (!button) return false;
        try {
            button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
            button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            button.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
            button.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        } catch (err) {}
        button.click();
        return true;
    }

    function describeVlmChatRequestSummary(endpoint, payload) {
        const source = payload && typeof payload === 'object' ? payload : {};
        const rawImages = Array.isArray(source.images)
            ? source.images
            : (source.image && typeof source.image === 'object' ? [source.image] : []);
        const imageCount = rawImages.filter((item) => item && item.data_url).length;
        return {
            endpoint: String(endpoint || ''),
            conversation_id: String(source.conversation_id || '').trim().slice(0, 160),
            request_id: String(source.request_id || '').trim().slice(0, 160),
            request_kind: String(source.request_kind || '').trim().slice(0, 80),
            version: String(source.version || source.params?.version || '').trim().slice(0, 160),
            chat_mode: String(source.chat_mode || source.params?.mode || '').trim().slice(0, 80),
            image_count: imageCount,
            has_visual_media: imageCount > 0
        };
    }

    function logDescribeVlmChatFailure(endpoint, payload, info = {}) {
        const compact = (value, limit = 1200) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
        const summary = describeVlmChatRequestSummary(endpoint, payload);
        try {
            console.error('[SimpAI VLM Chat] request failed', Object.assign(summary, {
                http_status: Number(info.http_status) || null,
                error_id: compact(info.error_id, 160),
                failure_stage: compact(info.failure_stage, 120),
                error: compact(info.error),
                details: compact(info.details),
                transport_error: compact(info.transport_error)
            }));
        } catch (err) {
            try { console.error('[SimpAI VLM Chat] request failed', err); } catch (ignored) {}
        }
    }

    function describeVlmChatFailure(response) {
        const detail = String(response?.details || response?.error || '').trim()
            || t('The VLM chat request failed.', 'VLM 对话请求失败。');
        if (response?.cancelled) return detail;
        const stageLabels = {
            payload_validation: t('request validation', '请求校验'),
            payload_build: t('request preparation', '请求准备'),
            cancel_check: t('cancel check', '取消检查'),
            vlm_runtime: t('VLM runtime', 'VLM 运行'),
            endpoint_exception: t('server endpoint', '服务接口')
        };
        const stage = stageLabels[String(response?.failure_stage || '').trim()]
            || String(response?.failure_stage || '').trim();
        const errorId = String(response?.error_id || '').trim();
        const suffix = [
            stage ? t(`stage: ${stage}`, `阶段：${stage}`) : '',
            errorId ? t(`error ID: ${errorId}`, `错误编号：${errorId}`) : ''
        ].filter(Boolean).join(t('; ', '；'));
        return suffix
            ? t(`VLM chat failed: ${detail} (${suffix})`, `VLM 对话失败：${detail}（${suffix}）`)
            : detail;
    }

    async function postJson(endpoint, payload, options = {}) {
        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload || {}),
                signal: options?.signal
            });
            let data = null;
            try {
                data = await response.json();
            } catch (err) {
                data = null;
            }
            if (!response.ok) {
                const failure = Object.assign({}, data || {}, {
                    ok: false,
                    error: data?.error || `HTTP ${response.status}`,
                    details: data?.details || response.statusText || ''
                });
                if (!failure.aborted) {
                    logDescribeVlmChatFailure(endpoint, payload, Object.assign({}, failure, {
                        http_status: response.status
                    }));
                }
                return failure;
            }
            const result = data || { ok: false, error: 'empty response' };
            if (result?.ok === false && !result?.aborted) {
                logDescribeVlmChatFailure(endpoint, payload, result);
            }
            return result;
        } catch (err) {
            if (err?.name === 'AbortError') {
                return { ok: false, aborted: true, error: 'aborted' };
            }
            const failure = { ok: false, error: err?.message || String(err || 'request failed') };
            logDescribeVlmChatFailure(endpoint, payload, { transport_error: failure.error });
            return failure;
        }
    }

    function normalizeSystemPromptTemplates(data, key = 'templates') {
        const rows = Array.isArray(data?.[key]) ? data[key] : [];
        return rows.map((item) => {
            const id = String(item?.id || item?.filename || item?.name || '').trim();
            const name = String(item?.name || item?.filename || id).trim();
            const content = String(item?.content || '').trim();
            if (!id || !name || !content) return null;
            return {
                id,
                name,
                filename: String(item?.filename || id),
                content,
                source: String(item?.source || '').trim()
            };
        }).filter(Boolean);
    }

    function composeSystemPromptDocuments(baseContent, userContent) {
        const base = String(baseContent || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
        const user = String(userContent || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
        if (base && user) return `${base}${USER_SYSTEM_PROMPT_SEPARATOR}${user}`;
        return base || user;
    }

    function selectedSystemPromptTemplateIdForContent(content) {
        const text = String(content || '').trim();
        if (!text) return '';
        const match = state.systemPromptTemplates.find(item => String(item.content || '').trim() === text);
        return match?.id || '';
    }

    function selectedUserSystemPromptTemplateIdForContent(content) {
        const text = String(content || '').trim();
        if (!text) return '';
        const match = state.userSystemPromptTemplates.find(item => String(item.content || '').trim() === text);
        return match?.id || '';
    }

    function mergedSystemPromptContent() {
        return composeSystemPromptDocuments(state.baseSystemPromptContent, state.userSystemPromptContent);
    }

    function activeSystemPromptPickerValue() {
        return state.systemPromptPickerValue || NO_SYSTEM_PROMPT_PICKER_VALUE;
    }

    function renderSystemPromptTemplateOptions() {
        const selected = activeSystemPromptPickerValue();
        const intro = state.systemPromptTemplatesLoading && !state.systemPromptTemplatesLoaded
            ? t('Loading templates...', '正在读取模板...')
            : t('Custom / no built-in template', '自定义 / 不使用内置模板');
        const options = [`<option value="${NO_SYSTEM_PROMPT_PICKER_VALUE}">${escapeHtml(intro)}</option>`];
        state.systemPromptTemplates.forEach((item) => {
            options.push(`<option value="${escapeHtml(item.id)}" ${item.id === selected ? 'selected' : ''}>${escapeHtml(item.name)}</option>`);
        });
        if (state.userSystemPromptTemplates.length) {
            options.push(`<optgroup label="${escapeHtml(localText('User documents', '用户项目'))}">`);
            options.push(`<option value="user:__none__" ${selected === 'user:__none__' ? 'selected' : ''}>${escapeHtml(localText('No user document', '不使用用户项目'))}</option>`);
            state.userSystemPromptTemplates.forEach((item) => {
                const value = `user:${item.id}`;
                options.push(`<option value="${escapeHtml(value)}" ${value === selected ? 'selected' : ''}>${escapeHtml(item.name)}</option>`);
            });
            options.push('</optgroup>');
        }
        return options.join('');
    }

    function renderUserSystemPromptTemplateOptions() {
        const selected = state.userSystemPromptTemplateId
            || selectedUserSystemPromptTemplateIdForContent(state.userSystemPromptContent);
        const intro = state.systemPromptTemplatesLoading && !state.systemPromptTemplatesLoaded
            ? t('Loading templates...', '正在读取模板...')
            : localText('No user document', '不使用用户文档');
        const options = [`<option value="">${escapeHtml(intro)}</option>`];
        state.userSystemPromptTemplates.forEach((item) => {
            options.push(`<option value="${escapeHtml(item.id)}" ${item.id === selected ? 'selected' : ''}>${escapeHtml(item.name)}</option>`);
        });
        return options.join('');
    }

    function syncSystemPromptTemplateControls(modal) {
        const target = modal || document.getElementById('describe_vlm_chat_modal');
        if (!target) return;
        const builtInTemplate = state.systemPromptTemplates.find(item => item.id === state.systemPromptTemplateId);
        if (builtInTemplate) state.baseSystemPromptContent = builtInTemplate.content;
        const userTemplateDialog = userSystemPromptTemplateDialog(target);
        const userTemplateControls = (selector) => {
            const controls = Array.from(target.querySelectorAll(selector));
            if (userTemplateDialog && userTemplateDialog !== target) {
                controls.push(...userTemplateDialog.querySelectorAll(selector));
            }
            return controls;
        };
        target.querySelectorAll('[data-describe-vlm-chat-template]').forEach((select) => {
            select.innerHTML = renderSystemPromptTemplateOptions();
            select.value = activeSystemPromptPickerValue();
            select.disabled = state.systemPromptTemplatesLoading && !state.systemPromptTemplatesLoaded;
        });
        userTemplateControls('[data-describe-vlm-chat-user-template-dialog-select]').forEach((select) => {
            select.innerHTML = renderUserSystemPromptTemplateOptions();
            select.value = state.userSystemPromptTemplateId || selectedUserSystemPromptTemplateIdForContent(state.userSystemPromptContent);
            select.disabled = state.systemPromptTemplatesLoading && !state.systemPromptTemplatesLoaded;
        });
        userTemplateControls('[data-describe-vlm-chat-user-template-name]').forEach((input) => {
            if (input.value !== state.userSystemPromptTemplateName) input.value = state.userSystemPromptTemplateName;
        });
        userTemplateControls('[data-describe-vlm-chat-user-template-content]').forEach((textarea) => {
            if (textarea.value !== state.userSystemPromptContent) textarea.value = state.userSystemPromptContent;
        });
        target.querySelectorAll('[data-describe-vlm-chat-system]').forEach((textarea) => {
            if (!state.systemPromptManualOverride) {
                const merged = mergedSystemPromptContent();
                if (merged || !state.customSystemPrompt) {
                    if (textarea.value !== merged) textarea.value = merged;
                    state.customSystemPrompt = merged;
                }
            } else if (textarea.value !== state.customSystemPrompt) {
                textarea.value = state.customSystemPrompt;
            }
        });
    }

    let systemPromptTemplateRequest = null;

    async function ensureSystemPromptTemplates(modal) {
        if (state.systemPromptTemplatesLoaded) {
            syncSystemPromptTemplateControls(modal);
            return state.systemPromptTemplates;
        }
        if (systemPromptTemplateRequest) return systemPromptTemplateRequest;
        state.systemPromptTemplatesLoading = true;
        syncSystemPromptTemplateControls(modal);
        systemPromptTemplateRequest = postJson(SYSTEM_PROMPT_TEMPLATE_ENDPOINT, {
            stage: { __lang: state.__lang },
            __lang: state.__lang,
            lang: state.__lang
        })
            .then((data) => {
                state.systemPromptTemplates = normalizeSystemPromptTemplates(data, 'templates');
                state.userSystemPromptTemplates = normalizeSystemPromptTemplates(data, 'user_templates');
                state.systemPromptTemplatesLoaded = true;
                state.systemPromptTemplatesLoading = false;
                const builtInTemplate = state.systemPromptTemplates.find(item => item.id === state.systemPromptTemplateId);
                if (builtInTemplate) state.baseSystemPromptContent = builtInTemplate.content;
                const userTemplate = state.userSystemPromptTemplates.find(item => item.id === state.userSystemPromptTemplateId);
                if (userTemplate) {
                    state.userSystemPromptTemplateName = userTemplate.name;
                    state.userSystemPromptContent = userTemplate.content;
                }
                syncSystemPromptTemplateControls(modal);
                return state.systemPromptTemplates;
            })
            .catch(() => {
                state.systemPromptTemplates = [];
                state.userSystemPromptTemplates = [];
                state.systemPromptTemplatesLoaded = true;
                state.systemPromptTemplatesLoading = false;
                syncSystemPromptTemplateControls(modal);
                return [];
            })
            .finally(() => {
                systemPromptTemplateRequest = null;
            });
        return systemPromptTemplateRequest;
    }

    function applySystemPromptTemplate(templateId, modal) {
        const rawId = String(templateId || '').trim();
        if (rawId.startsWith('user:')) {
            applyUserSystemPromptTemplate(rawId.slice(5), modal, rawId);
            return;
        }
        const id = rawId === NO_SYSTEM_PROMPT_PICKER_VALUE ? '' : rawId;
        const template = id ? state.systemPromptTemplates.find(item => item.id === id) : null;
        if (id && !template) return;
        state.systemPromptTemplateId = template?.id || '';
        state.systemPromptPickerValue = state.systemPromptTemplateId || NO_SYSTEM_PROMPT_PICKER_VALUE;
        state.baseSystemPromptContent = template?.content || '';
        state.userSystemPromptTemplateId = '';
        state.userSystemPromptTemplateName = '';
        state.userSystemPromptContent = '';
        state.systemPromptManualOverride = false;
        state.customSystemPrompt = mergedSystemPromptContent();
        const target = modal || document.getElementById('describe_vlm_chat_modal');
        saveChatSettings();
        syncSystemPromptTemplateControls(target);
        setStatus(template
            ? localText(`Built-in document loaded: ${template.name}`, `已载入内置文档：${template.name}`)
            : localText('Built-in document cleared.', '内置文档已清除。'));
    }

    function applyUserSystemPromptTemplate(templateId, modal, pickerValue = '') {
        const id = String(templateId || '').trim();
        if (id === '__none__') {
            state.userSystemPromptTemplateId = '';
            state.userSystemPromptTemplateName = '';
            state.userSystemPromptContent = '';
            state.systemPromptPickerValue = state.systemPromptTemplateId || NO_SYSTEM_PROMPT_PICKER_VALUE;
            state.systemPromptManualOverride = false;
            state.customSystemPrompt = mergedSystemPromptContent();
            const target = modal || document.getElementById('describe_vlm_chat_modal');
            saveChatSettings();
            syncSystemPromptTemplateControls(target);
            setStatus(localText('User document cleared.', '用户项目已清除。'));
            return;
        }
        const template = id ? state.userSystemPromptTemplates.find(item => item.id === id) : null;
        if (id && !template) return;
        state.userSystemPromptTemplateId = template?.id || '';
        state.userSystemPromptTemplateName = template?.name || '';
        state.userSystemPromptContent = template?.content || '';
        state.systemPromptTemplateId = '';
        state.baseSystemPromptContent = '';
        state.systemPromptPickerValue = pickerValue || (template ? `user:${template.id}` : state.systemPromptTemplateId || NO_SYSTEM_PROMPT_PICKER_VALUE);
        state.systemPromptManualOverride = false;
        state.customSystemPrompt = mergedSystemPromptContent();
        const target = modal || document.getElementById('describe_vlm_chat_modal');
        saveChatSettings();
        syncSystemPromptTemplateControls(target);
        setStatus(template
            ? localText(`User document loaded: ${template.name}`, `已载入用户文档：${template.name}`)
            : localText('User document cleared.', '用户文档已清除。'));
    }

    async function saveUserSystemPromptTemplate(modal, saveAsNew = false) {
        const target = modal || document.getElementById('describe_vlm_chat_modal');
        const formRoot = userSystemPromptTemplateDialog(target) || target;
        const name = String((formRoot?.querySelector?.('[data-describe-vlm-chat-user-template-name]')?.value
            ?? state.userSystemPromptTemplateName) || '').trim();
        const content = String((formRoot?.querySelector?.('[data-describe-vlm-chat-user-template-content]')?.value
            ?? state.userSystemPromptContent) || '').trim();
        if (!name) {
            setStatus(localText('Enter a user document name first.', '请先填写用户文档名称。'), true);
            return;
        }
        if (!content) {
            setStatus(localText('Enter user document content first.', '请先填写用户文档内容。'), true);
            return;
        }
        state.userSystemPromptTemplateName = name;
        state.userSystemPromptContent = content;
        const response = await postJson(USER_SYSTEM_PROMPT_TEMPLATE_SAVE_ENDPOINT, {
            id: saveAsNew ? '' : state.userSystemPromptTemplateId,
            name,
            content,
            __lang: state.__lang,
            lang: state.__lang
        });
        if (!response?.ok) {
            setStatus(response?.error || localText('User document could not be saved.', '用户文档保存失败。'), true);
            return;
        }
        state.userSystemPromptTemplates = normalizeSystemPromptTemplates(response, 'templates');
        const saved = response.template && normalizeSystemPromptTemplates({ templates: [response.template] })[0];
        state.userSystemPromptTemplateId = saved?.id || (saveAsNew ? '' : state.userSystemPromptTemplateId);
        state.userSystemPromptTemplateName = saved?.name || name;
        state.userSystemPromptContent = saved?.content || content;
        state.systemPromptTemplateId = '';
        state.baseSystemPromptContent = '';
        state.systemPromptPickerValue = state.userSystemPromptTemplateId ? `user:${state.userSystemPromptTemplateId}` : state.systemPromptTemplateId || NO_SYSTEM_PROMPT_PICKER_VALUE;
        state.systemPromptManualOverride = false;
        state.customSystemPrompt = mergedSystemPromptContent();
        saveChatSettings();
        saveConversationSnapshot();
        syncSystemPromptTemplateControls(target);
        closeUserSystemPromptTemplateDialog(target);
        setStatus(saveAsNew
            ? localText(`User document saved as new: ${state.userSystemPromptTemplateName}`, `已另存为新用户项目：${state.userSystemPromptTemplateName}`)
            : localText(`User document saved: ${state.userSystemPromptTemplateName}`, `用户项目已保存：${state.userSystemPromptTemplateName}`));
    }

    async function deleteUserSystemPromptTemplate(modal) {
        const target = modal || document.getElementById('describe_vlm_chat_modal');
        const formRoot = userSystemPromptTemplateDialog(target) || target;
        const id = String(state.userSystemPromptTemplateId || formRoot?.querySelector?.('[data-describe-vlm-chat-user-template-dialog-select]')?.value || '').trim();
        if (!id) {
            setStatus(localText('Select a user document first.', '请先选择用户文档。'), true);
            return;
        }
        if (!window.confirm(localText('Delete this user document?', '确定删除这个用户文档吗？'))) return;
        const response = await postJson(USER_SYSTEM_PROMPT_TEMPLATE_DELETE_ENDPOINT, { id, __lang: state.__lang, lang: state.__lang });
        if (!response?.ok) {
            setStatus(response?.error || localText('User document could not be deleted.', '用户文档删除失败。'), true);
            return;
        }
        state.userSystemPromptTemplates = normalizeSystemPromptTemplates(response, 'templates');
        state.userSystemPromptTemplateId = '';
        state.userSystemPromptTemplateName = '';
        state.userSystemPromptContent = '';
        state.systemPromptPickerValue = state.systemPromptTemplateId || NO_SYSTEM_PROMPT_PICKER_VALUE;
        state.systemPromptManualOverride = false;
        state.customSystemPrompt = mergedSystemPromptContent();
        saveChatSettings();
        saveConversationSnapshot();
        syncSystemPromptTemplateControls(target);
        closeUserSystemPromptTemplateDialog(target);
        setStatus(localText('User document deleted.', '用户文档已删除。'));
    }

    function openUserSystemPromptTemplateDialog(modal) {
        const target = modal || document.getElementById('describe_vlm_chat_modal');
        const dialog = ensureUserSystemPromptTemplateDialogHost(target);
        if (!dialog) return;
        dialog.hidden = false;
        syncSystemPromptTemplateControls(target);
        dialog.querySelector('[data-describe-vlm-chat-user-template-name]')?.focus();
    }

    function closeUserSystemPromptTemplateDialog(modal) {
        const target = modal || document.getElementById('describe_vlm_chat_modal');
        const dialog = userSystemPromptTemplateDialog(target);
        if (dialog) dialog.hidden = true;
    }

    function imageMimeFromDataUrl(dataUrl) {
        const match = String(dataUrl || '').match(/^data:([^;,]+)/);
        return match ? match[1] : 'image/png';
    }

    function mediaKind(value) {
        return String(value?.kind || '').toLowerCase() === 'video' || /^video\//i.test(String(value?.mime || value?.type || '')) ? 'video' : 'image';
    }

    function describeInputMediaDescriptor() {
        const exposed = window.SimpAIMetadataMediaInput?.getCurrentMedia?.('describe_input_image');
        if (exposed?.file instanceof File) {
            return {
                file: exposed.file,
                key: String(exposed.key || ''),
                kind: exposed.kind === 'video' ? 'video' : 'image',
            };
        }
        const host = root().querySelector('#describe_input_image');
        const file = host?.querySelector?.('input[type="file"]')?.files?.[0] || null;
        if (file instanceof File && /^(?:image|video)\//i.test(file.type || '')) {
            return {
                file,
                key: `${file.name || 'media'}:${file.size || 0}:${file.lastModified || 0}`,
                kind: /^video\//i.test(file.type || '') ? 'video' : 'image',
            };
        }
        const media = host?.querySelector?.('.simpai-metadata-local-preview video, .simpai-metadata-local-preview img, .file-preview-holder video, .file-preview-holder img');
        const source = String(media?.currentSrc || media?.src || '').trim();
        if (!source) return null;
        return {
            source,
            key: source,
            kind: media.tagName === 'VIDEO' ? 'video' : 'image',
            width: Number(media.videoWidth || media.naturalWidth) || null,
            height: Number(media.videoHeight || media.naturalHeight) || null,
        };
    }

    function blobToDataUrl(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(reader.error || new Error('read image failed'));
            reader.readAsDataURL(blob);
        });
    }

    function loadImage(dataUrl) {
        return new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error('image decode failed'));
            image.src = dataUrl;
        });
    }

    function scaledSize(width, height, maxSide) {
        const w = Math.max(1, Number(width) || 1);
        const h = Math.max(1, Number(height) || 1);
        const scale = Math.min(1, Math.max(1, Number(maxSide) || 1) / Math.max(w, h));
        return {
            width: Math.max(1, Math.round(w * scale)),
            height: Math.max(1, Math.round(h * scale))
        };
    }

    function drawImageCanvas(image, maxSide) {
        const size = scaledSize(image.naturalWidth || image.width, image.naturalHeight || image.height, maxSide);
        const canvas = document.createElement('canvas');
        canvas.width = size.width;
        canvas.height = size.height;
        const ctx = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
        ctx.drawImage(image, 0, 0, size.width, size.height);
        return { canvas, width: size.width, height: size.height };
    }

    function canvasHasTransparency(canvas) {
        try {
            const pixels = canvas.getContext('2d', { willReadFrequently: true })
                .getImageData(0, 0, canvas.width, canvas.height).data;
            for (let index = 3; index < pixels.length; index += 4) {
                if (pixels[index] < 255) return true;
            }
        } catch (err) {}
        return false;
    }

    function flattenCanvas(canvas) {
        const output = document.createElement('canvas');
        output.width = canvas.width;
        output.height = canvas.height;
        const ctx = output.getContext('2d', { alpha: false });
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, output.width, output.height);
        ctx.drawImage(canvas, 0, 0);
        return output;
    }

    function dataUrlBinarySize(dataUrl) {
        const value = String(dataUrl || '');
        const separator = value.indexOf(',');
        if (separator < 0) return 0;
        const header = value.slice(0, separator);
        const payload = value.slice(separator + 1);
        if (!/;base64$/i.test(header)) {
            try { return new TextEncoder().encode(decodeURIComponent(payload)).length; } catch (err) { return payload.length; }
        }
        const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
        return Math.max(0, Math.floor((payload.length * 3) / 4) - padding);
    }

    function encodeCanvasDataUrl(canvas, mime, quality) {
        const dataUrl = canvas.toDataURL(mime || 'image/jpeg', quality == null ? 0.85 : quality);
        return {
            dataUrl,
            mime: imageMimeFromDataUrl(dataUrl),
            bytes: dataUrlBinarySize(dataUrl),
            wireBytes: dataUrl.length,
            width: canvas.width,
            height: canvas.height,
            quality: quality == null ? null : quality,
        };
    }

    function drawImageDataUrl(image, maxSide, mime, quality) {
        const drawn = drawImageCanvas(image, maxSide);
        const output = String(mime || '').toLowerCase() === 'image/jpeg'
            ? flattenCanvas(drawn.canvas)
            : drawn.canvas;
        return encodeCanvasDataUrl(output, mime, quality);
    }

    function adaptiveImageDataUrl(image) {
        const sourceLongestSide = Math.max(
            Number(image.naturalWidth || image.width) || 1,
            Number(image.naturalHeight || image.height) || 1
        );
        const canvasCache = new Map();
        const outputCache = new Map();
        const sourceCanvas = (maxSide) => {
            const effectiveMaxSide = sourceLongestSide > IMAGE_FALLBACK_MAX_SIDE
                ? maxSide
                : IMAGE_FALLBACK_MAX_SIDE;
            if (!canvasCache.has(effectiveMaxSide)) {
                canvasCache.set(effectiveMaxSide, drawImageCanvas(image, effectiveMaxSide));
            }
            return canvasCache.get(effectiveMaxSide);
        };
        const probe = sourceCanvas(IMAGE_PRIMARY_MAX_SIDE);
        const hasTransparency = canvasHasTransparency(probe.canvas);
        const outputMime = hasTransparency ? 'image/webp' : 'image/jpeg';
        const outputCanvas = (maxSide) => {
            const drawn = sourceCanvas(maxSide);
            const key = `${drawn.width}x${drawn.height}:${outputMime}`;
            if (!outputCache.has(key)) {
                outputCache.set(key, outputMime === 'image/jpeg' ? flattenCanvas(drawn.canvas) : drawn.canvas);
            }
            return outputCache.get(key);
        };

        let best = null;
        const seen = new Set();
        for (const candidate of IMAGE_COMPRESSION_CANDIDATES) {
            const canvas = outputCanvas(candidate.maxSide);
            const key = `${canvas.width}x${canvas.height}:${candidate.quality}`;
            if (seen.has(key)) continue;
            seen.add(key);
            best = encodeCanvasDataUrl(canvas, outputMime, candidate.quality);
            if (best.bytes <= IMAGE_TARGET_BYTES) break;
        }
        return {
            ...best,
            hasTransparency,
            targetBytes: IMAGE_TARGET_BYTES,
        };
    }

    async function imagePayloadFromDataUrl(dataUrl, options = {}) {
        const sourceMime = options.mime || imageMimeFromDataUrl(dataUrl);
        try {
            const image = await loadImage(dataUrl);
            const main = adaptiveImageDataUrl(image);
            const thumb = drawImageDataUrl(image, IMAGE_MESSAGE_PREVIEW_MAX_SIDE, 'image/jpeg', 0.76);
            return {
                id: options.id || uid('describe_ref'),
                name: options.name || 'reference-image.png',
                mime: main.mime,
                width: main.width,
                height: main.height,
                size: main.bytes,
                wire_size: main.wireBytes,
                original_size: options.originalSize || options.size || dataUrlBinarySize(dataUrl),
                data_url: main.dataUrl,
                thumb: thumb.dataUrl,
                compression: {
                    max_side: Math.max(main.width, main.height),
                    quality: main.quality,
                    target_bytes: main.targetBytes,
                    alpha: main.hasTransparency,
                },
                key: options.key || `${options.name || 'image'}:${main.width}x${main.height}:${main.dataUrl.length}`
            };
        } catch (err) {
            const fallbackSize = dataUrlBinarySize(dataUrl);
            return {
                id: options.id || uid('describe_ref'),
                name: options.name || 'reference-image.png',
                mime: sourceMime,
                width: options.width || null,
                height: options.height || null,
                size: fallbackSize,
                wire_size: String(dataUrl).length,
                original_size: options.originalSize || options.size || fallbackSize,
                data_url: dataUrl,
                thumb: '',
                key: options.key || String(dataUrl).slice(0, 180)
            };
        }
    }

    async function fileToImagePayload(file) {
        const dataUrl = await blobToDataUrl(file);
        return imagePayloadFromDataUrl(dataUrl, {
            id: uid('describe_ref'),
            name: file.name || 'reference-image.png',
            mime: file.type || imageMimeFromDataUrl(dataUrl),
            originalSize: file.size || null,
            key: `${file.name || 'image'}:${file.size || 0}:${file.lastModified || 0}`
        });
    }

    async function fileToMediaPayload(file, options = {}) {
        if (!(file instanceof Blob)) throw new Error('media file is unavailable');
        const mime = String(file.type || options.mime || '').toLowerCase();
        if (!mime.startsWith('video/')) {
            const image = await fileToImagePayload(file);
            if (options.key) image.key = options.key;
            return image;
        }
        if (Number(file.size) > MAX_VIDEO_ATTACHMENT_BYTES) throw new Error('video attachment is too large');
        const dataUrl = await blobToDataUrl(file);
        return {
            id: options.id || uid('describe_video_ref'),
            name: options.name || file.name || 'reference-video.mp4',
            mime: mime || 'video/mp4',
            media_type: 'video',
            width: options.width || null,
            height: options.height || null,
            size: Number(file.size) || dataUrlBinarySize(dataUrl),
            wire_size: dataUrl.length,
            original_size: Number(file.size) || null,
            data_url: dataUrl,
            thumb: '',
            key: options.key || `${file.name || 'video'}:${file.size || 0}:${file.lastModified || 0}`,
        };
    }

    async function payloadFromDescribeInputMedia(descriptor) {
        if (!descriptor) return null;
        const payloadKey = `describe-input:${String(descriptor.key || '')}`;
        if (descriptor.file instanceof File) {
            return fileToMediaPayload(descriptor.file, { key: payloadKey });
        }
        const response = await fetch(descriptor.source, { credentials: 'same-origin' });
        if (!response.ok) throw new Error(`media fetch failed: ${response.status}`);
        const blob = await response.blob();
        const fallbackMime = descriptor.kind === 'video' ? 'video/mp4' : 'image/png';
        const mime = String(blob.type || fallbackMime).toLowerCase();
        const extension = (mime.split('/')[1] || (descriptor.kind === 'video' ? 'mp4' : 'png')).split(';')[0];
        const file = new File([blob], `describe-input.${extension}`, { type: mime });
        return fileToMediaPayload(file, {
            key: payloadKey,
            width: descriptor.width,
            height: descriptor.height,
        });
    }

    async function autoReferenceDescribeInputMedia() {
        const runtime = currentConversationRuntime();
        const descriptor = describeInputMediaDescriptor();
        const key = String(descriptor?.key || '');
        if (!descriptor || !key) return false;
        if (isCurrentConversationRuntime(runtime) && key === state.lastAutoReferencedDescribeMediaKey) return false;
        if (key === runtime.lastAutoReferencedDescribeMediaKey) return false;
        const payloadKey = `describe-input:${key}`;
        if (runtime.pendingImages.some((item) => String(item?.key || '') === payloadKey)) {
            runtime.lastAutoReferencedDescribeMediaKey = key;
            if (isCurrentConversationRuntime(runtime)) state.lastAutoReferencedDescribeMediaKey = key;
            return true;
        }
        if (runtime.describeMediaReferencePromise?.key === key) return runtime.describeMediaReferencePromise.promise;
        const promise = (async () => {
            setConversationStatus(runtime, localText('Referencing Describe input media...', '正在引用反推输入媒体...'));
            try {
                const payload = await payloadFromDescribeInputMedia(descriptor);
                if (!payload) return false;
                const currentKey = String(describeInputMediaDescriptor()?.key || '');
                if (currentKey !== key) return false;
                runtime.pendingImages = [payload, ...runtime.pendingImages.filter((item) => {
                    const itemKey = String(item?.key || '');
                    return itemKey !== payload.key && !itemKey.startsWith('describe-input:');
                })].slice(0, MAX_ATTACHMENTS);
                runtime.lastAutoReferencedDescribeMediaKey = key;
                if (isCurrentConversationRuntime(runtime)) {
                    state.pendingImages = runtime.pendingImages;
                    state.lastAutoReferencedDescribeMediaKey = key;
                    renderPendingImages();
                }
                const kindLabel = mediaKind(payload) === 'video'
                    ? localText('video', '视频')
                    : localText('image', '图片');
                setConversationStatus(runtime, localText(
                    `Describe input ${kindLabel} referenced for the next message.`,
                    `已自动引用反推输入${kindLabel}，将在下一条消息中发送。`
                ));
                return true;
            } catch (err) {
                const tooLarge = String(err?.message || '').includes('too large');
                setConversationStatus(runtime, tooLarge
                    ? localText('The Describe input video exceeds the 80 MB chat limit.', '反推输入视频超过 Chat 的 80 MB 限制。')
                    : localText('Could not reference the Describe input media.', '无法自动引用反推输入媒体。'), true);
                return false;
            } finally {
                if (runtime.describeMediaReferencePromise?.key === key) runtime.describeMediaReferencePromise = null;
                if (isCurrentConversationRuntime(runtime)) state.describeMediaReferencePromise = null;
            }
        })();
        runtime.describeMediaReferencePromise = { key, promise };
        if (isCurrentConversationRuntime(runtime)) state.describeMediaReferencePromise = runtime.describeMediaReferencePromise;
        return promise;
    }

    function cleanVlmVersion(value) {
        const text = String(value || '').replace(/[✓✔⚠⬇↓]/g, '').trim();
        if (/(^|\s)Custom($|\s)/i.test(text)) return 'Custom';
        return text;
    }

    function cleanCustomApiFormat(value) {
        const text = String(value || '').trim();
        if (text === 'OpenAI Responses' || text === 'openai_responses') return 'openai_responses';
        if (text === 'OpenAI Chat Completions' || text === 'openai_compatible') return 'openai_compatible';
        return text;
    }

    function vlmModelLabels() {
        const registry = window.SimpAICanvasWorkbenchRegistry || window.SimpAICanvasWorkbenchVlm || {};
        return Object.assign({}, registry.VLM_MODEL_LABELS || {}, state.vlmModelLabels || {});
    }

    function resolveVlmVersion(value) {
        const cleaned = cleanVlmVersion(value);
        if (!cleaned) return '';
        const labels = vlmModelLabels();
        if (Object.prototype.hasOwnProperty.call(labels, cleaned)) return cleaned;
        const matches = Object.entries(labels)
            .filter(([, label]) => cleanVlmVersion(label) === cleaned)
            .map(([version]) => cleanVlmVersion(version));
        return matches.length === 1 ? matches[0] : cleaned;
    }

    function customVlmOptionValue(rawValue, label) {
        return resolveVlmVersion(rawValue || label);
    }

    function addUniqueVlmModelOption(options, option) {
        const value = customVlmOptionValue(option?.value, option?.label);
        if (!value) return;
        const existing = options.find((item) => item.value === value);
        if (existing) {
            return;
        }
        options.push({
            value,
            label: String(option?.label || option?.value || value).trim() || value
        });
    }

    function nativeVlmDropdownOptions(elemId) {
        const host = componentHost(elemId);
        const select = host?.matches?.('select') ? host : host?.querySelector?.('select');
        if (!select) return [];
        return Array.from(select.options || [])
            .map((option) => {
                const label = String(option.textContent || option.value || '').trim();
                const value = customVlmOptionValue(option.value, label);
                return value ? { value, label: label || value } : null;
            })
            .filter(Boolean);
    }

    function mergeDescribeVlmModelChoices(catalogChoices) {
        const merged = [];
        const seen = new Set();
        const add = (value) => {
            const text = String(value || '').trim();
            if (!text || seen.has(text)) return;
            seen.add(text);
            merged.push(text);
        };
        DESCRIBE_VLM_MODEL_CHOICES
            .filter((value) => value !== 'Custom')
            .forEach(add);
        (Array.isArray(catalogChoices) ? catalogChoices : [])
            .filter((value) => String(value || '').trim() !== 'Custom')
            .forEach(add);
        return merged;
    }

    function applyDescribeVlmModelCatalog(data) {
        if (!data || typeof data !== 'object') return false;
        const catalogChoices = Array.isArray(data.choices)
            ? data.choices.filter(Boolean)
            : Array.isArray(data.items)
                ? data.items.map((item) => item?.id).filter(Boolean)
                : [];
        if (!catalogChoices.length) return false;
        state.vlmAllowCustom = data.allow_custom === true;
        state.vlmModelChoices = mergeDescribeVlmModelChoices(catalogChoices);
        state.vlmModelLabels = Object.assign({}, data.labels || {});
        state.vlmModelCatalog = Array.isArray(data.items) ? data.items.slice() : [];
        state.vlmContextWindows = Object.assign({}, data.context_windows || {});
        if (!Object.keys(state.vlmContextWindows).length) {
            state.vlmModelCatalog.forEach((item) => {
                const id = String(item?.id || '').trim();
                const contextWindow = Number(item?.context_window || item?.runtime_config?.n_ctx || 0);
                if (id && Number.isFinite(contextWindow) && contextWindow > 0) state.vlmContextWindows[id] = contextWindow;
            });
        }
        state.vlmModelCatalogLoaded = true;
        return true;
    }

    async function refreshDescribeVlmModelCatalog(refresh = false) {
        if (state.vlmModelCatalogLoading && state.vlmModelCatalogPromise) return state.vlmModelCatalogPromise;
        const registry = window.SimpAICanvasWorkbenchRegistry || {};
        if (!refresh && Array.isArray(registry.VLM_MODEL_CATALOG) && registry.VLM_MODEL_CATALOG.length) {
            applyDescribeVlmModelCatalog({
                items: registry.VLM_MODEL_CATALOG,
                choices: registry.VLM_VERSION_CHOICES || [],
                labels: registry.VLM_MODEL_LABELS || {},
                allow_custom: registry.VLM_ALLOW_CUSTOM === true
            });
            updateAnswerModelIndicator();
            return true;
        }
        state.vlmModelCatalogLoading = true;
        state.vlmModelCatalogPromise = fetch(`/vlm-model-catalog${refresh ? '?refresh=true' : ''}`, { cache: 'no-store' })
            .then((response) => response.json().then((data) => ({ response, data })))
            .then(({ response, data }) => {
                if (!response.ok || !data?.ok) throw new Error(data?.details || data?.error || `HTTP ${response.status}`);
                const applied = applyDescribeVlmModelCatalog(data);
                updateAnswerModelIndicator();
                return applied;
            })
            .catch((error) => {
                console.warn('[SimpAI Describe VLM] Model catalog unavailable:', error);
                return false;
            })
            .finally(() => {
                state.vlmModelCatalogLoading = false;
                state.vlmModelCatalogPromise = null;
            });
        return state.vlmModelCatalogPromise;
    }

    function registryVlmDropdownOptions() {
        const registry = window.SimpAICanvasWorkbenchRegistry || window.SimpAICanvasWorkbenchVlm || {};
        const choices = Array.isArray(state.vlmModelChoices) && state.vlmModelChoices.length
            ? state.vlmModelChoices
            : Array.isArray(registry.VLM_VERSION_CHOICES) && registry.VLM_VERSION_CHOICES.length
            ? registry.VLM_VERSION_CHOICES
            : DESCRIBE_VLM_MODEL_CHOICES;
        const labels = Object.assign({}, registry.VLM_MODEL_LABELS || {}, state.vlmModelLabels || {});
        return choices.map((choice) => ({ value: resolveVlmVersion(choice), label: String(labels[choice] || choice || '').trim() }))
            .filter((choice) => choice.value);
    }

    function describeVlmModelOptions() {
        const options = [];
        registryVlmDropdownOptions().forEach((option) => addUniqueVlmModelOption(options, option));
        nativeVlmDropdownOptions('describe_vlm_model_dropdown').forEach((option) => addUniqueVlmModelOption(options, option));
        nativeVlmDropdownOptions('describe_vlm_model').forEach((option) => addUniqueVlmModelOption(options, option));
        const current = resolveVlmVersion(readSelectedVlmVersion());
        if (current) addUniqueVlmModelOption(options, { value: current, label: current });
        return options.filter((option) => option.value !== 'Custom');
    }

    function syncHeaderVlmModelSelect(select, selectedVersion) {
        if (!select) return;
        const options = describeVlmModelOptions();
        const signature = options.map((option) => `${option.value}\u001f${option.label}`).join('\u001e');
        if (select.dataset.describeVlmModelChoices !== signature) {
            select.innerHTML = options
                .map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`)
                .join('');
            select.dataset.describeVlmModelChoices = signature;
        }
        const version = resolveVlmVersion(selectedVersion || readSelectedVlmVersion());
        if (version && Array.from(select.options || []).some((option) => option.value === version) && select.value !== version) {
            select.value = version;
        }
    }

    function setDescribeVlmVersionFromHeader(rawValue) {
        const version = resolveVlmVersion(rawValue);
        if (!version) return false;
        const clicked = setComponentValue('describe_vlm_model_select_bridge', version)
            && clickComponentButton('describe_vlm_model_select_btn');
        if (!clicked) {
            const option = describeVlmModelOptions().find((item) => item.value === version);
            setComponentValue('describe_vlm_model_dropdown', option?.label || version);
            setStatus(t('Model selector is unavailable. Please reload the page.', '模型选择暂不可用，请刷新页面。'), true);
        }
        updateAnswerModelIndicator();
        return clicked;
    }

    function readSelectedVlmVersion() {
        const raw = readComponentValue('describe_vlm_model_dropdown') || readComponentValue('describe_vlm_model');
        return resolveVlmVersion(raw);
    }

    function cleanPresetName(value) {
        return String(value || '').replace(/[\u2B07\u2193]+$/g, '').trim();
    }

    function firstTextValue(values) {
        for (const value of values || []) {
            const text = String(value || '').trim();
            if (text) return text;
        }
        return '';
    }

    function readCurrentPresetName(topbar, prepared) {
        const candidates = [];
        try {
            if (typeof topbarPendingPreset !== 'undefined' && topbarPendingPreset) candidates.push(topbarPendingPreset);
        } catch (err) {}
        try {
            if (typeof topbarLastPreset !== 'undefined' && topbarLastPreset) candidates.push(topbarLastPreset);
        } catch (err) {}
        candidates.push(topbar?.__preset, prepared?.preset, prepared?.name);
        return cleanPresetName(firstTextValue(candidates));
    }

    function readPresetStoreMeta(topbar, presetName) {
        const meta = topbar && typeof topbar.__preset_store_meta === 'object' ? topbar.__preset_store_meta : null;
        const target = cleanPresetName(presetName).toLowerCase();
        if (!meta || !target) return {};
        if (meta[presetName] && typeof meta[presetName] === 'object') return meta[presetName];
        const key = Object.keys(meta).find((item) => cleanPresetName(item).toLowerCase() === target);
        return key && typeof meta[key] === 'object' ? meta[key] : {};
    }

    function readDescribePromptOptions() {
        const topbar = window.simpleaiTopbarSystemParams && typeof window.simpleaiTopbarSystemParams === 'object'
            ? window.simpleaiTopbarSystemParams
            : {};
        const prepared = topbar.__preset_prepared && typeof topbar.__preset_prepared === 'object'
            ? topbar.__preset_prepared
            : {};
        const engine = prepared.engine && typeof prepared.engine === 'object' ? prepared.engine : {};
        const backendParams = engine.backend_params && typeof engine.backend_params === 'object' ? engine.backend_params : {};
        const presetName = readCurrentPresetName(topbar, prepared);
        const presetMeta = readPresetStoreMeta(topbar, presetName);
        return {
            output_tags: readCheckboxValue('describe_output_tags', false),
            output_chinese: readCheckboxValue('describe_output_chinese', false),
            output_artist: readCheckboxValue('describe_output_artist', false),
            preset: presetName,
            backend_engine: String(topbar.__backend_engine || topbar.backend_engine || engine.backend_engine || backendParams.backend_engine || presetMeta.backend_engine || ''),
            task_method: String(topbar.task_method || engine.task_method || backendParams.task_method || presetMeta.task_method || ''),
            prompt_format: String(topbar.prompt_format || engine.prompt_format || backendParams.prompt_format || ''),
            text_encoder: String(topbar.text_encoder || prepared.text_encoder || backendParams.text_encoder || prepared.default_clip_model || prepared.clip_model || prepared['CLIP Model'] || ''),
            base_model: String(prepared.base_model || prepared.default_model || prepared['Base Model'] || backendParams.base_model || backendParams.model || '')
        };
    }

    function readDescribeCustomApi(version) {
        if (resolveVlmVersion(version) !== 'Custom') return null;
        return {
            api_name: readComponentValue('describe_vlm_custom_api_name') || 'Custom',
            provider: readComponentValue('describe_vlm_custom_provider') || 'custom',
            api_format: cleanCustomApiFormat(readComponentValue('describe_vlm_custom_api_format')) || 'openai_compatible',
            base_url: readComponentValue('describe_vlm_custom_base_url'),
            model: readComponentValue('describe_vlm_custom_model'),
            api_key: readComponentValue('describe_vlm_custom_api_key'),
            supports_images: readCheckboxValue('describe_vlm_custom_supports_images', true)
        };
    }

    function buildVlmModelStatusPayload(version) {
        const cleanVersion = resolveVlmVersion(version);
        const customApi = readDescribeCustomApi(cleanVersion);
        const params = {
            version: cleanVersion,
            vram_policy: normalizeVlmVramPolicy(state.vramPolicy),
            kv_cache_type: normalizeVlmKvCacheType(state.kvCacheType),
            n_ctx: currentVlmNctx(cleanVersion)
        };
        if (customApi) {
            Object.assign(params, {
                custom_provider: customApi.provider || 'custom',
                custom_api_format: customApi.api_format || 'openai_compatible',
                custom_base_url: customApi.base_url || '',
                custom_model: customApi.model || '',
                custom_api_key: customApi.api_key || ''
            });
        }
        const payload = {
            project_id: 'describe_image_chat',
            node_id: 'describe_vlm_chat',
            params,
            user_context: window.simpleaiTopbarSystemParams || {}
        };
        if (customApi?.api_key) payload.api_key = customApi.api_key;
        return { payload, customApi };
    }

    function triggerVlmMissingModelPopup(version, customApi) {
        const cleanVersion = resolveVlmVersion(version);
        if (!cleanVersion || cleanVersion === 'Custom') return false;
        const request = {
            kind: 'vlm',
            version: cleanVersion,
            custom_api: customApi || null
        };
        if (typeof window.triggerMissingModelCheck === 'function') {
            try {
                return !!window.triggerMissingModelCheck(request);
            } catch (err) {}
        }
        if (!setComponentValue('missing_model_check_request', JSON.stringify(request))) return false;
        return clickComponentButton('missing_model_check_btn');
    }

    function showMissingVlmModelStatus(version, customApi, response, popupOpened) {
        const modal = ensureModal();
        const status = modal.querySelector('[data-describe-vlm-chat-status]');
        if (!status) return;
        const missingCount = Number(response?.missing_count || (Array.isArray(response?.missing_models) ? response.missing_models.length : 0)) || 0;
        const baseMessage = missingCount > 0
            ? t(`Selected VLM model is missing ${missingCount} file(s).`, `所选 VLM 模型缺少 ${missingCount} 个文件。`)
            : t('Selected VLM model files are missing.', '所选 VLM 模型文件缺失。');
        const actionMessage = popupOpened
            ? t('The download panel has been opened.', '下载面板已打开。')
            : t('Click the button to open the download panel.', '点击按钮打开下载面板。');
        const message = `${baseMessage} ${actionMessage}`;
        state.missingVlmModelRequest = {
            version: resolveVlmVersion(version),
            customApi: customApi || null
        };
        status.classList.add('is-error', 'is-actionable');
        status.innerHTML = `<span>${escapeHtml(message)}</span><button type="button" data-describe-vlm-chat-download-models><i class="fa-solid fa-cloud-arrow-down"></i><span>${escapeHtml(t('Open download panel', '打开下载面板'))}</span></button>`;
        if (popupOpened) {
            status.setAttribute('title', t('The download panel has been opened.', '下载面板已打开。'));
        } else {
            status.removeAttribute('title');
        }
    }

    async function ensureSelectedVlmModelReady(version) {
        if (!state.vlmModelCatalogLoaded) await refreshDescribeVlmModelCatalog(false);
        version = resolveVlmVersion(version);
        const { payload, customApi } = buildVlmModelStatusPayload(version);
        const response = await postJson('/canvas-workbench/vlm-model-status', payload);
        updateVlmRuntimeStatus(document.getElementById('describe_vlm_chat_modal'), response);
        if (response?.ok && response.ready) {
            state.missingVlmModelRequest = null;
            return true;
        }

        if (response?.ok && !response.ready) {
            logDescribeVlmChatFailure('/canvas-workbench/vlm-model-status', payload, {
                error_id: response.error_id,
                failure_stage: 'model_status',
                error: response.error || 'VLM model is not ready.',
                details: response.message || response.details || '',
            });
        }

        const missingRows = Array.isArray(response?.missing_models) ? response.missing_models : [];
        if (response?.state === 'missing' && missingRows.length) {
            const popupOpened = triggerVlmMissingModelPopup(version, customApi);
            showMissingVlmModelStatus(version, customApi, response, popupOpened);
            return false;
        }

        const message = response?.message || response?.details || response?.error || t('VLM model is not ready.', 'VLM 模型未就绪。');
        setStatus(message, true);
        return false;
    }

    function formatVlmGb(value, fallback = '--') {
        const number = Number(value);
        return Number.isFinite(number) && number >= 0 ? number.toFixed(1) : fallback;
    }

    function formatVlmRuntimeStatus(response = state.vlmRuntimeStatusResponse) {
        const selectedVersion = resolveVlmVersion(readSelectedVlmVersion());
        if (selectedVersion === 'Custom') {
            return localText('Remote API selected', '当前使用远程 API');
        }
        if (response?.state === 'missing' || (response?.ready === false && response?.missing_count > 0)) {
            return t('Model files are missing', '模型文件缺失');
        }
        if (response?.backend && response.backend !== 'llamacpp' && response.backend !== 'custom_api') {
            return t('This model does not use llama.cpp', '当前模型不使用 llama.cpp');
        }
        const runtime = response?.runtime_status || state.vlmRuntimeStatus;
        if (!runtime) {
            return localText('Waiting for model status', '等待模型状态');
        }

        const currentPolicy = vlmVramPolicyLabel(runtime.policy || state.vramPolicy);
        const currentKvCacheType = vlmKvCacheTypeLabel(runtime.kv_cache_type || state.kvCacheType);
        const currentNctx = Number(runtime.n_ctx || 0);
        const requestedNctx = Number(runtime.requested_n_ctx || currentNctx || currentVlmNctx());
        const nCtxStatus = runtime.n_ctx_pending
            ? localText(
                `Active context ${currentNctx}; reload for ${requestedNctx}`,
                `当前上下文 ${currentNctx}；重新请求后使用 ${requestedNctx}`
            )
            : (currentNctx > 0 ? localText(`Context ${currentNctx}`, `上下文 ${currentNctx}`) : '');
        const policyPending = runtime.policy_pending
            ? localText(
                `Active ${currentPolicy}; reload for ${vlmVramPolicyLabel(runtime.requested_policy)}`,
                `当前使用${currentPolicy}；重新请求后使用${vlmVramPolicyLabel(runtime.requested_policy)}`
            )
            : '';
        const total = formatVlmGb(runtime.gpu_total_gb);
        const used = formatVlmGb(runtime.gpu_used_gb);
        const memory = localText(`VRAM ${used} / ${total} GB`, `显存 ${used} / ${total} GB`);
        const kvPending = runtime.kv_cache_type_pending
            ? localText(
                `Active ${currentKvCacheType}; reload for ${vlmKvCacheTypeLabel(runtime.requested_kv_cache_type)}`,
                `当前使用${currentKvCacheType}；重新请求后使用${vlmKvCacheTypeLabel(runtime.requested_kv_cache_type)}`
            )
            : '';
        if (runtime.loaded && runtime.state === 'ready') {
            const gpuLayers = `${Number(runtime.gpu_layers) || 0}/${Number(runtime.total_layers) || 0}`;
            const cpuLayers = `${Number(runtime.cpu_layers) || 0}`;
            return localText(
                [policyPending, kvPending, nCtxStatus, `KV ${currentKvCacheType}`, `GPU layers ${gpuLayers}`, `CPU layers ${cpuLayers}`, memory].filter(Boolean).join(' · '),
                [policyPending, kvPending, nCtxStatus, `KV ${currentKvCacheType}`, `GPU 层 ${gpuLayers}`, `CPU 层 ${cpuLayers}`, memory].filter(Boolean).join(' · ')
            );
        }
        return localText(
            [policyPending, kvPending, nCtxStatus, `KV ${currentKvCacheType}`, 'Model not loaded', memory].filter(Boolean).join(' · '),
            [policyPending, kvPending, nCtxStatus, `KV ${currentKvCacheType}`, '模型未加载', memory].filter(Boolean).join(' · ')
        );
    }

    function updateVlmRuntimeStatus(modal = document.getElementById('describe_vlm_chat_modal'), response) {
        if (response !== undefined) {
            state.vlmRuntimeStatusResponse = response || null;
            state.vlmRuntimeStatus = response?.runtime_status || null;
        }
        const status = modal?.querySelector?.('[data-describe-vlm-chat-runtime-status]');
        const value = status?.querySelector?.('[data-describe-vlm-chat-runtime-status-value]');
        if (!status || !value) return;
        const policy = status.querySelector('[data-describe-vlm-chat-vram-policy]');
        const kvCacheType = status.querySelector('[data-describe-vlm-chat-kv-cache-type]');
        if (policy) {
            policy.innerHTML = renderVlmVramPolicyOptions();
            policy.value = normalizeVlmVramPolicy(state.vramPolicy);
        }
        if (kvCacheType) {
            kvCacheType.innerHTML = renderVlmKvCacheTypeOptions();
            kvCacheType.value = normalizeVlmKvCacheType(state.kvCacheType);
        }
        const nCtx = status.querySelector('[data-describe-vlm-chat-n-ctx]');
        if (nCtx) {
            const version = resolveVlmVersion(readSelectedVlmVersion());
            nCtx.max = String(vlmContextWindowForVersion(version));
            nCtx.disabled = vlmBackendForVersion(version) !== 'llamacpp';
            if (document.activeElement !== nCtx) {
                const value = currentVlmNctx(version);
                nCtx.value = value > 0 ? String(value) : '';
            }
        }
        value.textContent = formatVlmRuntimeStatus();
        const runtime = state.vlmRuntimeStatus;
        const titleParts = [];
        if (runtime?.loaded) {
            const budget = formatVlmGb(runtime.layer_budget_gb);
            const kvCache = formatVlmGb(runtime.kv_cache_gb);
            if (budget !== '--') titleParts.push(localText(`Layer budget: ${budget} GB`, `层预算：${budget} GB`));
            if (kvCache !== '--') titleParts.push(localText(`KV cache: ${kvCache} GB`, `KV cache：${kvCache} GB`));
            titleParts.push(localText(
                `K/V offload: ${runtime.offload_kqv ? 'on' : 'off'}`,
                `K/V offload：${runtime.offload_kqv ? '开启' : '关闭'}`
            ));
            if (runtime.kv_cache_quantization_fallback) {
                titleParts.push(localText('Q8 request fell back to FP16', 'Q8 请求已回退到 FP16'));
            }
        }
        if (titleParts.length) status.setAttribute('title', titleParts.join(localText('; ', '；')));
        else status.removeAttribute('title');
        status.classList.toggle('is-ready', !!runtime?.loaded && runtime.state === 'ready');
        status.classList.toggle('is-error', state.vlmRuntimeStatusResponse?.state === 'missing');
    }

    async function refreshVlmRuntimeStatus() {
        const modal = document.getElementById('describe_vlm_chat_modal');
        if (!modal || modal.hidden) return null;
        if (state.vlmRuntimeStatusRequest) return state.vlmRuntimeStatusRequest;
        const version = resolveVlmVersion(readSelectedVlmVersion());
        const { payload } = buildVlmModelStatusPayload(version);
        const request = postJson('/canvas-workbench/vlm-model-status', payload);
        state.vlmRuntimeStatusRequest = request;
        try {
            const response = await request;
            updateVlmRuntimeStatus(modal, response);
            return response;
        } catch (err) {
            updateVlmRuntimeStatus(modal, null);
            return null;
        } finally {
            if (state.vlmRuntimeStatusRequest === request) state.vlmRuntimeStatusRequest = null;
        }
    }

    function stopVlmRuntimeStatusPolling() {
        if (state.vlmRuntimeStatusPollTimer) {
            window.clearInterval(state.vlmRuntimeStatusPollTimer);
            state.vlmRuntimeStatusPollTimer = null;
        }
        state.vlmRuntimeStatusRequest = null;
    }

    function startVlmRuntimeStatusPolling() {
        stopVlmRuntimeStatusPolling();
        refreshVlmRuntimeStatus().catch(() => {});
        state.vlmRuntimeStatusPollTimer = window.setInterval(() => {
            if (!modalIsOpen()) {
                stopVlmRuntimeStatusPolling();
                return;
            }
            refreshVlmRuntimeStatus().catch(() => {});
        }, 2000);
    }

    function currentAnswerModelLabel() {
        const version = resolveVlmVersion(readSelectedVlmVersion());
        if (version === 'Custom') {
            const apiName = readComponentValue('describe_vlm_custom_api_name').trim();
            const customModel = readComponentValue('describe_vlm_custom_model').trim();
            if (customModel) return `${apiName || 'Custom'} · ${customModel}`;
            return apiName || 'Custom';
        }
        const registry = window.SimpAICanvasWorkbenchRegistry || window.SimpAICanvasWorkbenchVlm || {};
        const labels = Object.assign({}, registry.VLM_MODEL_LABELS || {}, state.vlmModelLabels || {});
        return labels[version] || version || t('No model selected', '未选择模型');
    }

    function updateAnswerModelIndicator(modal = document.getElementById('describe_vlm_chat_modal')) {
        const indicator = modal?.querySelector?.('[data-describe-vlm-chat-model]');
        const value = indicator?.querySelector?.('[data-describe-vlm-chat-model-value]');
        const select = indicator?.querySelector?.('[data-describe-vlm-chat-model-select]');
        if (!indicator) return;
        const label = currentAnswerModelLabel();
        const title = `${t('Answering model', '当前应答模型')}: ${label}`;
        if (value && value.textContent !== label) value.textContent = label;
        syncHeaderVlmModelSelect(select, readSelectedVlmVersion());
        if (indicator.getAttribute('title') !== title) indicator.setAttribute('title', title);
        if (indicator.getAttribute('aria-label') !== title) indicator.setAttribute('aria-label', title);
        if (select && select.getAttribute('aria-label') !== title) select.setAttribute('aria-label', title);
    }

    function ensureFloatingHost() {
        let host = document.getElementById('simpleai_floating_host');
        if (!host) {
            host = document.createElement('div');
            host.id = 'simpleai_floating_host';
            host.className = 'simpleai-floating-host';
            document.body.appendChild(host);
        }
        return host;
    }

    function userSystemPromptTemplateDialog(modal) {
        const selector = '[data-describe-vlm-chat-user-template-dialog-panel]';
        return modal?.querySelector?.(selector) || document.querySelector(selector);
    }

    function ensureUserSystemPromptTemplateDialogHost(modal, host = ensureFloatingHost()) {
        const dialog = userSystemPromptTemplateDialog(modal);
        if (!dialog) return null;
        if (dialog.parentElement !== host) host.appendChild(dialog);
        dialog.classList.add('simpleai-floating-portal-node');
        dialog.dataset.simpleaiFloatingFor = 'describe_vlm_chat_user_template_dialog';
        return dialog;
    }

    function setImportantStyle(el, name, value) {
        if (!el) return;
        if (el.matches?.('.describe-vlm-chat-panel') && ['transform', 'left', 'top', 'right', 'bottom'].includes(name)) {
            if (!String(el.style.getPropertyValue('inset') || '').trim()) {
                el.style.setProperty('inset', 'auto', 'important');
            }
        }
        el.style.setProperty(name, value, 'important');
    }

    function describeCompactViewport() {
        const viewportWidth = Number(window.visualViewport?.width || window.innerWidth || 0);
        return window.innerWidth <= 640 || (viewportWidth > 0 && viewportWidth <= 640);
    }

    function describeViewportRect() {
        const viewport = window.visualViewport;
        return {
            left: Number(viewport?.offsetLeft || 0),
            top: Number(viewport?.offsetTop || 0),
            width: Math.max(1, Number(viewport?.width || window.innerWidth || 1)),
            height: Math.max(1, Number(viewport?.height || window.innerHeight || 1))
        };
    }

    function describeKeyboardMetrics(panel = null) {
        const viewport = window.visualViewport;
        const compact = describeCompactViewport();
        const rect = describeViewportRect();
        const layoutHeight = Math.max(1, Number(window.innerHeight || rect.height || 1));
        const visualBottom = Math.max(0, Number(rect.top || 0) + Number(rect.height || 0));
        const inset = compact && viewport
            ? Math.max(0, Math.round(layoutHeight - visualBottom))
            : 0;
        const active = document.activeElement;
        const focusedEditable = !!active
            && (!panel || panel.contains(active))
            && (active.matches?.('textarea, input, select, [contenteditable="true"]') || false);
        return {
            inset,
            open: compact && focusedEditable && inset >= 80,
            width: rect.width,
            height: rect.height,
            top: rect.top,
            bottom: visualBottom
        };
    }

    function syncDescribeKeyboardState(modal, panel) {
        if (!modal || !panel) return;
        const metrics = describeKeyboardMetrics(panel);
        modal.dataset.describeVlmKeyboardOpen = metrics.open ? '1' : '0';
        panel.dataset.describeVlmKeyboardOpen = metrics.open ? '1' : '0';
        modal.style.setProperty('--describe-vlm-keyboard-inset', `${metrics.inset}px`);
        modal.style.setProperty('--describe-vlm-visual-height', `${Math.round(metrics.height)}px`);
        modal.style.setProperty('--describe-vlm-visual-bottom', `${Math.round(metrics.bottom)}px`);
        if (metrics.open && document.activeElement && panel.contains(document.activeElement)) {
            if (describeKeyboardSyncFrame) window.cancelAnimationFrame(describeKeyboardSyncFrame);
            describeKeyboardSyncFrame = window.requestAnimationFrame(() => {
                describeKeyboardSyncFrame = 0;
                const active = document.activeElement;
                if (!active || !panel.contains(active)) return;
                try {
                    active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
                } catch (err) {}
            });
        }
    }

    function applyCompactFloatingPanelLayout(panel) {
        if (!panel || !describeCompactViewport()) return false;
        const viewport = describeViewportRect();
        panel.dataset.describeVlmChatCompactFrame = '1';
        setImportantStyle(panel, 'transform', 'none');
        setImportantStyle(panel, 'left', `${Math.round(viewport.left)}px`);
        setImportantStyle(panel, 'top', `${Math.round(viewport.top)}px`);
        setImportantStyle(panel, 'right', 'auto');
        setImportantStyle(panel, 'bottom', 'auto');
        setImportantStyle(panel, 'width', `${Math.round(viewport.width)}px`);
        setImportantStyle(panel, 'height', `${Math.round(viewport.height)}px`);
        setImportantStyle(panel, 'max-width', `${Math.round(viewport.width)}px`);
        setImportantStyle(panel, 'max-height', `${Math.round(viewport.height)}px`);
        return true;
    }

    function clearCompactFloatingPanelLayout(panel) {
        if (!panel || panel.dataset.describeVlmChatCompactFrame !== '1') return false;
        delete panel.dataset.describeVlmChatCompactFrame;
        ['inset', 'transform', 'left', 'top', 'right', 'bottom', 'width', 'height', 'max-width', 'max-height']
            .forEach((name) => panel.style.removeProperty(name));
        return true;
    }

    function isFloatingModalHidden(modal) {
        if (!modal) return true;
        const style = window.getComputedStyle(modal);
        return modal.hidden
            || style.display === 'none'
            || style.visibility === 'hidden'
            || modal.classList.contains('hidden')
            || modal.classList.contains('hide');
    }

    function keepFloatingPanelInViewport(panel, margin = 12) {
        if (!panel) return;
        if (applyCompactFloatingPanelLayout(panel)) return;
        if (panel.dataset.describeVlmChatMaximized === '1') {
            applyMaximizedFloatingPanelLayout(panel);
            return;
        }
        const rect = panel.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
        const maxLeft = Math.max(margin, window.innerWidth - margin - rect.width);
        const maxTop = Math.max(margin, window.innerHeight - margin - rect.height);
        const nextLeft = clamp(rect.left, margin, maxLeft);
        const nextTop = clamp(rect.top, margin, maxTop);
        setImportantStyle(panel, 'transform', 'none');
        setImportantStyle(panel, 'left', `${Math.round(nextLeft)}px`);
        setImportantStyle(panel, 'top', `${Math.round(nextTop)}px`);
        setImportantStyle(panel, 'right', 'auto');
        setImportantStyle(panel, 'bottom', 'auto');
    }

    function floatingResizeBoundsFrom(left, top, margin = 12) {
        const safeLeft = Math.max(margin, Number(left) || margin);
        const safeTop = Math.max(margin, Number(top) || margin);
        const maxW = Math.max(1, window.innerWidth - margin - safeLeft);
        const maxH = Math.max(1, window.innerHeight - margin - safeTop);
        return {
            minW: Math.min(420, maxW),
            minH: Math.min(420, maxH),
            maxW,
            maxH
        };
    }

    function floatingResizeViewportBounds(margin = 12) {
        const maxW = Math.max(1, window.innerWidth - margin * 2);
        const maxH = Math.max(1, window.innerHeight - margin * 2);
        return {
            minW: Math.min(420, maxW),
            minH: Math.min(420, maxH),
            maxW,
            maxH
        };
    }

    function applyFloatingPanelSize(panel, width, height, bounds, markResized = true) {
        if (!panel || !bounds) return;
        const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
        const nextW = Math.round(clamp(Number(width) || bounds.minW, bounds.minW, bounds.maxW));
        const nextH = Math.round(clamp(Number(height) || bounds.minH, bounds.minH, bounds.maxH));
        if (markResized) panel.dataset.describeVlmChatResized = '1';
        setImportantStyle(panel, 'width', `${nextW}px`);
        setImportantStyle(panel, 'height', `${nextH}px`);
        setImportantStyle(panel, 'max-width', `${Math.round(bounds.maxW)}px`);
        setImportantStyle(panel, 'max-height', `${Math.round(bounds.maxH)}px`);
    }

    function clampFloatingPanelSizeToViewport(panel, margin = 12) {
        if (!panel) return;
        if (applyCompactFloatingPanelLayout(panel)) return;
        if (panel.dataset.describeVlmChatMaximized === '1') {
            applyMaximizedFloatingPanelLayout(panel);
            return;
        }
        const rect = panel.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        applyFloatingPanelSize(panel, rect.width, rect.height, floatingResizeViewportBounds(margin), false);
    }

    function saveFloatingPanelLayout(panel) {
        if (!panel) return;
        if (describeCompactViewport() || panel.dataset.describeVlmChatMaximized === '1') return;
        const rect = panel.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        state.windowLayout = {
            left: Math.round(rect.left),
            top: Math.round(rect.top),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            moved: panel.dataset.describeVlmChatMoved === '1',
            resized: panel.dataset.describeVlmChatResized === '1'
        };
        saveChatSettings();
    }

    function applySavedFloatingPanelLayout(panel, margin = 12) {
        if (applyCompactFloatingPanelLayout(panel)) return true;
        const layout = state.windowLayout;
        if (!panel) return false;
        if (!layout) {
            ['inset', 'transform', 'left', 'top', 'right', 'bottom', 'width', 'height', 'max-width', 'max-height']
                .forEach((name) => panel.style.removeProperty(name));
            return false;
        }
        const bounds = floatingResizeViewportBounds(margin);
        if (layout.resized && Number.isFinite(layout.width) && Number.isFinite(layout.height)) {
            applyFloatingPanelSize(panel, layout.width, layout.height, bounds, false);
        }
        if (layout.resized) {
            panel.dataset.describeVlmChatResized = '1';
        } else {
            delete panel.dataset.describeVlmChatResized;
            ['width', 'height', 'max-width', 'max-height']
                .forEach((name) => panel.style.removeProperty(name));
        }

        const rect = panel.getBoundingClientRect();
        if (!rect.width || !rect.height) return false;
        if (Number.isFinite(layout.left) || Number.isFinite(layout.top)) {
            const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
            const left = clamp(
                Number.isFinite(layout.left) ? layout.left : rect.left,
                margin,
                Math.max(margin, window.innerWidth - margin - rect.width)
            );
            const top = clamp(
                Number.isFinite(layout.top) ? layout.top : rect.top,
                margin,
                Math.max(margin, window.innerHeight - margin - rect.height)
            );
            if (layout.moved) {
                panel.dataset.describeVlmChatMoved = '1';
            } else {
                delete panel.dataset.describeVlmChatMoved;
            }
            setImportantStyle(panel, 'transform', 'none');
            setImportantStyle(panel, 'left', Math.round(left) + 'px');
            setImportantStyle(panel, 'top', Math.round(top) + 'px');
            setImportantStyle(panel, 'right', 'auto');
            setImportantStyle(panel, 'bottom', 'auto');
        }
        return true;
    }

    function syncFloatingMaximizeControl(panel) {
        const button = panel?.querySelector?.('[data-describe-vlm-chat-maximize]');
        if (!button) return;
        const maximized = panel.dataset.describeVlmChatMaximized === '1';
        const label = maximized ? t('Restore window', '还原窗口') : t('Maximize window', '最大化窗口');
        button.title = label;
        button.setAttribute('aria-label', label);
        button.setAttribute('aria-pressed', maximized ? 'true' : 'false');
        const icon = button.querySelector('i');
        if (icon) icon.className = maximized ? 'fa-solid fa-window-restore' : 'fa-solid fa-maximize';
    }

    function applyMaximizedFloatingPanelLayout(panel, margin = 8) {
        if (!panel) return;
        if (applyCompactFloatingPanelLayout(panel)) return;
        const width = Math.max(1, window.innerWidth - margin * 2);
        const height = Math.max(1, window.innerHeight - margin * 2);
        setImportantStyle(panel, 'transform', 'none');
        setImportantStyle(panel, 'left', `${margin}px`);
        setImportantStyle(panel, 'top', `${margin}px`);
        setImportantStyle(panel, 'right', 'auto');
        setImportantStyle(panel, 'bottom', 'auto');
        setImportantStyle(panel, 'width', `${Math.round(width)}px`);
        setImportantStyle(panel, 'height', `${Math.round(height)}px`);
        setImportantStyle(panel, 'max-width', `${Math.round(width)}px`);
        setImportantStyle(panel, 'max-height', `${Math.round(height)}px`);
    }

    function toggleFloatingPanelMaximize(panel) {
        if (!panel || describeCompactViewport()) return;
        if (panel.dataset.describeVlmChatMaximized === '1') {
            delete panel.dataset.describeVlmChatMaximized;
            const restore = panel.__describeVlmChatRestoreLayout || null;
            panel.__describeVlmChatRestoreLayout = null;
            if (restore) {
                const bounds = floatingResizeViewportBounds(12);
                applyFloatingPanelSize(panel, restore.width, restore.height, bounds, false);
                const rect = panel.getBoundingClientRect();
                const left = Math.max(12, Math.min(restore.left, window.innerWidth - 12 - rect.width));
                const top = Math.max(12, Math.min(restore.top, window.innerHeight - 12 - rect.height));
                setImportantStyle(panel, 'transform', 'none');
                setImportantStyle(panel, 'left', `${Math.round(left)}px`);
                setImportantStyle(panel, 'top', `${Math.round(top)}px`);
                setImportantStyle(panel, 'right', 'auto');
                setImportantStyle(panel, 'bottom', 'auto');
                panel.dataset.describeVlmChatMoved = restore.moved ? '1' : '';
                panel.dataset.describeVlmChatResized = restore.resized ? '1' : '';
                if (!restore.moved) delete panel.dataset.describeVlmChatMoved;
                if (!restore.resized) delete panel.dataset.describeVlmChatResized;
            } else {
                ['inset', 'transform', 'left', 'top', 'right', 'bottom', 'width', 'height', 'max-width', 'max-height']
                    .forEach((name) => panel.style.removeProperty(name));
                applySavedFloatingPanelLayout(panel);
            }
            saveFloatingPanelLayout(panel);
        } else {
            const rect = panel.getBoundingClientRect();
            panel.__describeVlmChatRestoreLayout = {
                left: rect.left,
                top: rect.top,
                width: rect.width,
                height: rect.height,
                moved: panel.dataset.describeVlmChatMoved === '1',
                resized: panel.dataset.describeVlmChatResized === '1'
            };
            panel.dataset.describeVlmChatMaximized = '1';
            applyMaximizedFloatingPanelLayout(panel);
        }
        syncFloatingMaximizeControl(panel);
    }

    function syncFloatingPanelViewportMode(modal, panel) {
        if (!modal || !panel || isFloatingModalHidden(modal)) return;
        if (applyCompactFloatingPanelLayout(panel)) {
            syncDescribeKeyboardState(modal, panel);
            syncFloatingMaximizeControl(panel);
            return;
        }
        const leftCompactMode = clearCompactFloatingPanelLayout(panel);
        if (panel.dataset.describeVlmChatMaximized === '1') {
            applyMaximizedFloatingPanelLayout(panel);
        } else if (leftCompactMode || state.windowLayout) {
            applySavedFloatingPanelLayout(panel);
        } else if (panel.dataset.describeVlmChatMoved === '1' || panel.dataset.describeVlmChatResized === '1') {
            clampFloatingPanelSizeToViewport(panel);
            keepFloatingPanelInViewport(panel);
        }
        syncDescribeKeyboardState(modal, panel);
        syncFloatingMaximizeControl(panel);
    }

    function scheduleFloatingPanelViewportSync(modal, panel) {
        if (describeViewportSyncFrame) window.cancelAnimationFrame(describeViewportSyncFrame);
        describeViewportSyncFrame = window.requestAnimationFrame(() => {
            describeViewportSyncFrame = 0;
            syncFloatingPanelViewportMode(modal, panel);
        });
    }

    function installDescribeViewportSync(modal, panel) {
        if (!modal || !panel || modal.dataset.describeVlmViewportSyncBound === '1') return;
        modal.dataset.describeVlmViewportSyncBound = '1';
        const schedule = () => scheduleFloatingPanelViewportSync(modal, panel);
        window.addEventListener('resize', schedule);
        window.visualViewport?.addEventListener?.('resize', schedule);
        window.visualViewport?.addEventListener?.('scroll', schedule);
        panel.addEventListener('focusin', schedule);
        panel.addEventListener('focusout', () => window.setTimeout(schedule, 0));
    }

    function installDescribeFloatingDrag(modal, panel) {
        const handle = panel?.querySelector?.('.describe-vlm-chat-head');
        if (!modal || !panel || !handle || handle.dataset.describeVlmFloatingDragBound === '1') return;
        handle.dataset.describeVlmFloatingDragBound = '1';

        const margin = 12;
        const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
        let dragging = false;
        let offsetX = 0;
        let offsetY = 0;

        const onMove = (evt) => {
            if (!dragging) return;
            const rect = panel.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            const nextLeft = clamp(
                (evt.clientX ?? 0) - offsetX,
                margin,
                Math.max(margin, window.innerWidth - margin - rect.width)
            );
            const nextTop = clamp(
                (evt.clientY ?? 0) - offsetY,
                margin,
                Math.max(margin, window.innerHeight - margin - rect.height)
            );
            panel.dataset.describeVlmChatMoved = '1';
            setImportantStyle(panel, 'transform', 'none');
            setImportantStyle(panel, 'left', `${Math.round(nextLeft)}px`);
            setImportantStyle(panel, 'top', `${Math.round(nextTop)}px`);
            setImportantStyle(panel, 'right', 'auto');
            setImportantStyle(panel, 'bottom', 'auto');
            evt.preventDefault();
        };

        const onUp = () => {
            if (!dragging) return;
            dragging = false;
            handle.classList.remove('is-dragging');
            window.removeEventListener('pointermove', onMove, true);
            window.removeEventListener('pointerup', onUp, true);
            keepFloatingPanelInViewport(panel, margin);
            saveFloatingPanelLayout(panel);
        };

        handle.addEventListener('pointerdown', (evt) => {
            if (evt.button !== 0 || isFloatingModalHidden(modal) || describeCompactViewport()) return;
            if (panel.dataset.describeVlmChatMaximized === '1') return;
            if (evt.target?.closest?.('button, input, textarea, select, [role="button"]')) return;
            const rect = panel.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            dragging = true;
            offsetX = (evt.clientX ?? 0) - rect.left;
            offsetY = (evt.clientY ?? 0) - rect.top;
            handle.classList.add('is-dragging');
            window.addEventListener('pointermove', onMove, true);
            window.addEventListener('pointerup', onUp, true);
            evt.preventDefault();
        }, { passive: false });

        window.addEventListener('resize', () => {
            if (describeCompactViewport() || panel.dataset.describeVlmChatMaximized === '1') {
                scheduleFloatingPanelViewportSync(modal, panel);
                return;
            }
            if (panel.dataset.describeVlmChatMoved === '1') keepFloatingPanelInViewport(panel, margin);
        });
    }

    function installDescribeFloatingResize(modal, panel) {
        const handle = panel?.querySelector?.('[data-describe-vlm-chat-resize]');
        if (!modal || !panel || !handle || handle.dataset.describeVlmFloatingResizeBound === '1') return;
        handle.dataset.describeVlmFloatingResizeBound = '1';

        const margin = 12;
        let resizeState = null;

        const onMove = (evt) => {
            if (!resizeState || evt.pointerId !== resizeState.pointerId) return;
            const dx = (evt.clientX ?? resizeState.startClientX) - resizeState.startClientX;
            const dy = (evt.clientY ?? resizeState.startClientY) - resizeState.startClientY;
            if (!resizeState.moved && Math.hypot(dx, dy) < 2) return;
            if (!resizeState.moved) {
                resizeState.moved = true;
                handle.classList.add('is-resizing');
                document.documentElement.classList.add('describe-vlm-chat-resizing');
                setImportantStyle(panel, 'transform', 'none');
                setImportantStyle(panel, 'left', `${Math.round(resizeState.left)}px`);
                setImportantStyle(panel, 'top', `${Math.round(resizeState.top)}px`);
                setImportantStyle(panel, 'right', 'auto');
                setImportantStyle(panel, 'bottom', 'auto');
            }
            const bounds = floatingResizeBoundsFrom(resizeState.left, resizeState.top, margin);
            applyFloatingPanelSize(panel, resizeState.width + dx, resizeState.height + dy, bounds);
            evt.preventDefault();
            evt.stopPropagation();
        };

        const onUp = (evt) => {
            if (!resizeState || (evt && evt.pointerId !== resizeState.pointerId)) return;
            const moved = resizeState.moved;
            resizeState = null;
            handle.classList.remove('is-resizing');
            document.documentElement.classList.remove('describe-vlm-chat-resizing');
            document.removeEventListener('pointermove', onMove, true);
            document.removeEventListener('pointerup', onUp, true);
            document.removeEventListener('pointercancel', onUp, true);
            if (moved) keepFloatingPanelInViewport(panel, margin);
            if (moved) saveFloatingPanelLayout(panel);
            evt?.preventDefault?.();
            evt?.stopPropagation?.();
        };

        handle.addEventListener('pointerdown', (evt) => {
            if (evt.button !== 0 || isFloatingModalHidden(modal) || describeCompactViewport()) return;
            if (panel.dataset.describeVlmChatMaximized === '1') return;
            const rect = panel.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            resizeState = {
                pointerId: evt.pointerId,
                startClientX: evt.clientX ?? 0,
                startClientY: evt.clientY ?? 0,
                left: rect.left,
                top: rect.top,
                width: rect.width,
                height: rect.height,
                moved: false
            };
            try { handle.setPointerCapture?.(evt.pointerId); } catch (err) {}
            document.addEventListener('pointermove', onMove, true);
            document.addEventListener('pointerup', onUp, true);
            document.addEventListener('pointercancel', onUp, true);
            evt.preventDefault();
            evt.stopPropagation();
        }, { passive: false });

        window.addEventListener('resize', () => {
            if (describeCompactViewport() || panel.dataset.describeVlmChatMaximized === '1') {
                scheduleFloatingPanelViewportSync(modal, panel);
                return;
            }
            if (panel.dataset.describeVlmChatResized === '1' && !isFloatingModalHidden(modal)) {
                clampFloatingPanelSizeToViewport(panel, margin);
                keepFloatingPanelInViewport(panel, margin);
            }
        });
    }

    function installDescribeFloatingLayer(modal) {
        if (!modal) return modal;
        const host = ensureFloatingHost();
        if (modal.parentElement !== host) host.appendChild(modal);
        modal.classList.add('sai-floating-shell', 'modal', 'simpleai-floating-portal-node');
        modal.dataset.simpleaiFloatingFor = 'describe_vlm_chat_modal';
        ensureUserSystemPromptTemplateDialogHost(modal, host);

        const panel = modal.querySelector('.describe-vlm-chat-panel');
        if (panel) {
            panel.classList.add('sai-floating-card', 'modal-content', 'simpleai-resizable-popup');
            installDescribeFloatingDrag(modal, panel);
            installDescribeFloatingResize(modal, panel);
            installDescribeViewportSync(modal, panel);
            if (!isFloatingModalHidden(modal) && describeCompactViewport()) {
                applyCompactFloatingPanelLayout(panel);
            } else if (!isFloatingModalHidden(modal) && panel.dataset.describeVlmChatMaximized === '1') {
                applyMaximizedFloatingPanelLayout(panel);
            } else if (!isFloatingModalHidden(modal)) {
                applySavedFloatingPanelLayout(panel);
            }
            if (panel.dataset.describeVlmChatResized === '1' && !isFloatingModalHidden(modal)) {
                clampFloatingPanelSizeToViewport(panel);
            }
            if ((panel.dataset.describeVlmChatMoved === '1' || panel.dataset.describeVlmChatResized === '1') && !isFloatingModalHidden(modal)) {
                keepFloatingPanelInViewport(panel);
            }
            syncFloatingMaximizeControl(panel);
        }
        return modal;
    }

    function ensureModal() {
        let modal = document.getElementById('describe_vlm_chat_modal');
        if (modal) return installDescribeFloatingLayer(modal);
        modal = document.createElement('div');
        modal.id = 'describe_vlm_chat_modal';
        modal.className = 'describe-vlm-chat-modal';
        modal.hidden = true;
        modal.innerHTML = `
<div class="describe-vlm-chat-panel" role="dialog" aria-modal="true" aria-label="${escapeHtml(t('VLM/LLM AI chat', 'VLM/LLM AI对话'))}">
  <div class="describe-vlm-chat-head">
    <strong class="describe-vlm-chat-title"><i class="fa-solid fa-comments"></i><span class="describe-vlm-chat-title-text">${escapeHtml(t('VLM/LLM AI chat', 'VLM/LLM AI对话'))}</span></strong>
    <div class="describe-vlm-chat-model-pill" data-describe-vlm-chat-model aria-live="polite">
      <i class="fa-solid fa-microchip"></i>
      <span>${escapeHtml(t('Model', '模型'))}</span>
      <select data-describe-vlm-chat-model-select aria-label="${escapeHtml(t('Answering model', '当前应答模型'))}">
        <option value="">${escapeHtml(t('Detecting', '检测中'))}</option>
      </select>
      <b data-describe-vlm-chat-model-value hidden>${escapeHtml(t('Detecting', '检测中'))}</b>
    </div>
    <span class="describe-vlm-chat-head-actions">
      <button type="button" data-describe-vlm-chat-settings-toggle title="${escapeHtml(localText('Open chat settings', '打开对话设置'))}" aria-label="${escapeHtml(localText('Open chat settings', '打开对话设置'))}" aria-expanded="false"><i class="fa-solid fa-sliders"></i></button>
      <button type="button" data-describe-vlm-chat-maximize title="${escapeHtml(t('Maximize window', '最大化窗口'))}" aria-label="${escapeHtml(t('Maximize window', '最大化窗口'))}" aria-pressed="false"><i class="fa-solid fa-maximize"></i></button>
      <button type="button" data-describe-vlm-chat-close title="${escapeHtml(t('Close', '关闭'))}" aria-label="${escapeHtml(t('Close', '关闭'))}"><i class="fa-solid fa-xmark"></i></button>
    </span>
  </div>
  <div class="describe-vlm-chat-conversation-bar">
    <div class="describe-vlm-chat-conversation-head">
      <span>${escapeHtml(t('Conversation', '对话'))}</span>
      <button type="button" data-describe-vlm-chat-new title="${escapeHtml(t('New conversation', '新建对话'))}" aria-label="${escapeHtml(t('New conversation', '新建对话'))}"><i class="fa-solid fa-plus"></i></button>
    </div>
    <nav class="describe-vlm-chat-conversation-tabs" data-describe-vlm-chat-conversation-tabs aria-label="${escapeHtml(t('Conversations', '对话列表'))}">${renderConversationTabs()}</nav>
    <select class="describe-vlm-chat-conversation-native" data-describe-vlm-chat-conversation-select aria-label="${escapeHtml(t('Current conversation', '当前对话'))}">${renderConversationOptions()}</select>
  </div>
  <div class="describe-vlm-chat-controls">
    <label><span>${escapeHtml(t('Mode', '模式'))}</span><select data-describe-vlm-chat-mode aria-label="${escapeHtml(t('Chat Mode', '对话模式'))}">
      <option value="chat" ${state.chatMode === 'chat' ? 'selected' : ''}>${escapeHtml(t('Free Chat', '自由对话'))}</option>
      <option value="roleplay" ${state.chatMode === 'roleplay' ? 'selected' : ''}>${escapeHtml(localText('Roleplay', '角色扮演'))}</option>
      <option value="creative" ${state.chatMode === 'creative' ? 'selected' : ''}>${escapeHtml(localText('Creative', '创作模式'))}</option>
      <option value="guide" ${state.chatMode === 'guide' ? 'selected' : ''}>${escapeHtml(t('Guide Mode', '向导模式'))}</option>
      <option value="prompt" ${state.chatMode === 'prompt' ? 'selected' : ''}>${escapeHtml(t('Prompt Assistant', '提示词助手'))}</option>
      <option value="raw" ${state.chatMode === 'raw' ? 'selected' : ''}>${escapeHtml(t('Raw Model', '原始模型'))}</option>
    </select></label>
    <label class="describe-vlm-chat-max-tokens-field" title="${escapeHtml(localText('Choose the output token budget.', '选择输出 Token 预算。'))}"><span>${escapeHtml(localText('Max output tokens', '最大输出 Token'))}</span><select data-describe-vlm-chat-max-tokens aria-label="${escapeHtml(localText('Max output tokens', '最大输出 Token'))}">${renderChatMaxTokenOptions()}</select></label>
    <label class="describe-vlm-chat-template-field"><span>${escapeHtml(t('Template', '模板'))}</span><div class="describe-vlm-chat-template-picker"><select data-describe-vlm-chat-template aria-label="${escapeHtml(t('System Prompt Template', '系统提示词模板'))}">${renderSystemPromptTemplateOptions()}</select><button type="button" class="describe-vlm-chat-template-manage" data-describe-vlm-chat-user-template-open title="${escapeHtml(localText('Manage user documents', '管理用户项目'))}" aria-label="${escapeHtml(localText('Manage user documents', '管理用户项目'))}"><i class="fa-solid fa-folder-plus"></i></button></div></label>
    <label class="describe-vlm-chat-system-field"><span>${escapeHtml(t('System Prompt', '系统提示词'))}</span><textarea data-describe-vlm-chat-system rows="2" placeholder="${escapeHtml(t('Optional custom system prompt...', '可选自定义 system prompt...'))}">${escapeHtml(state.customSystemPrompt)}</textarea></label>
    <div class="describe-vlm-chat-runtime-status" data-describe-vlm-chat-runtime-status aria-live="polite"><i class="fa-solid fa-memory" aria-hidden="true"></i><select class="describe-vlm-chat-runtime-policy" data-describe-vlm-chat-vram-policy aria-label="${escapeHtml(t('VRAM policy', '显存策略'))}" title="${escapeHtml(t('Choose how much VRAM llama.cpp may use.', '选择 llama.cpp 使用的显存档位。'))}">${renderVlmVramPolicyOptions()}</select><select class="describe-vlm-chat-runtime-kv-cache" data-describe-vlm-chat-kv-cache-type aria-label="${escapeHtml(t('KV cache type', 'KV cache 类型'))}" title="${escapeHtml(t('Choose the llama.cpp KV cache precision.', '选择 llama.cpp KV cache 精度。'))}">${renderVlmKvCacheTypeOptions()}</select><label class="describe-vlm-chat-runtime-n-ctx-field" title="${escapeHtml(localText('Context length for local llama.cpp. Empty uses the model default.', '本地 llama.cpp 上下文长度。留空使用模型默认值。'))}"><span>${escapeHtml(localText('Context', '上下文'))}</span><input class="describe-vlm-chat-runtime-n-ctx" data-describe-vlm-chat-n-ctx type="number" min="${VLM_N_CTX_MIN}" max="${VLM_N_CTX_MAX}" step="${VLM_N_CTX_STEP}" inputmode="numeric" placeholder="${escapeHtml(localText('Auto', '自动'))}" value="" aria-label="${escapeHtml(localText('Context length', '上下文长度'))}"></label><span data-describe-vlm-chat-runtime-status-value>${escapeHtml(t('Waiting for model status', '等待模型状态'))}</span><button type="button" data-describe-vlm-chat-runtime-status-refresh title="${escapeHtml(t('Refresh runtime status', '刷新运行状态'))}" aria-label="${escapeHtml(t('Refresh runtime status', '刷新运行状态'))}"><i class="fa-solid fa-rotate"></i></button></div>
    <div class="describe-vlm-chat-mode-hint" data-describe-vlm-chat-mode-hint>${escapeHtml(chatModeHint(state.chatMode))}</div>
  </div>
  <div class="describe-vlm-chat-roleplay-strip" data-describe-vlm-chat-roleplay-strip hidden>
    <button type="button" class="describe-vlm-chat-roleplay-summary" data-describe-vlm-chat-roleplay-open title="${escapeHtml(localText('Open roleplay settings', '打开角色扮演设置'))}" aria-label="${escapeHtml(localText('Open roleplay settings', '打开角色扮演设置'))}">
      <i class="fa-solid fa-user-pen"></i>
      <span data-describe-vlm-chat-roleplay-summary-text>${escapeHtml(localText('Roleplay setup', '角色扮演设置'))}</span>
    </button>
    <span class="describe-vlm-chat-roleplay-state" data-describe-vlm-chat-roleplay-state aria-live="polite"></span>
    <div class="describe-vlm-chat-roleplay-autoplay-controls" role="group" aria-label="${escapeHtml(localText('Autoplay controls', '托管控制'))}">
      <button type="button" data-describe-vlm-chat-roleplay-play title="${escapeHtml(localText('Start autoplay', '开始托管'))}" aria-label="${escapeHtml(localText('Start autoplay', '开始托管'))}"><i class="fa-solid fa-play"></i></button>
      <button type="button" data-describe-vlm-chat-roleplay-step title="${escapeHtml(localText('Run one hosted turn', '执行一步托管'))}" aria-label="${escapeHtml(localText('Run one hosted turn', '执行一步托管'))}"><i class="fa-solid fa-forward-step"></i></button>
      <button type="button" data-describe-vlm-chat-roleplay-pause title="${escapeHtml(localText('Pause autoplay', '暂停托管'))}" aria-label="${escapeHtml(localText('Pause autoplay', '暂停托管'))}"><i class="fa-solid fa-pause"></i></button>
      <button type="button" data-describe-vlm-chat-roleplay-stop title="${escapeHtml(localText('Stop autoplay', '停止托管'))}" aria-label="${escapeHtml(localText('Stop autoplay', '停止托管'))}"><i class="fa-solid fa-stop"></i></button>
    </div>
    <button type="button" class="describe-vlm-chat-roleplay-more" data-describe-vlm-chat-roleplay-open title="${escapeHtml(localText('Roleplay settings', '角色扮演设置'))}" aria-label="${escapeHtml(localText('Roleplay settings', '角色扮演设置'))}"><i class="fa-solid fa-sliders"></i></button>
  </div>
  <section class="describe-vlm-chat-roleplay-panel" data-describe-vlm-chat-roleplay-panel hidden aria-label="${escapeHtml(localText('Roleplay settings', '角色扮演设置'))}">
    <div class="describe-vlm-chat-roleplay-panel-head">
      <strong>${escapeHtml(localText('Roleplay settings', '角色扮演设置'))}</strong>
      <button type="button" data-describe-vlm-chat-roleplay-close title="${escapeHtml(t('Close', '关闭'))}" aria-label="${escapeHtml(t('Close', '关闭'))}"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div class="describe-vlm-chat-roleplay-panel-body">
      <div class="describe-vlm-chat-roleplay-feedback" data-describe-vlm-chat-roleplay-feedback hidden role="status" aria-live="polite"></div>
      <div class="describe-vlm-chat-roleplay-section">
        <div class="describe-vlm-chat-roleplay-section-head"><strong>${escapeHtml(localText('Characters', '角色列表'))}</strong><span class="describe-vlm-chat-roleplay-section-actions"><button type="button" data-describe-vlm-chat-roleplay-character-add title="${escapeHtml(localText('Add character', '增加角色'))}" aria-label="${escapeHtml(localText('Add character', '增加角色'))}"><i class="fa-solid fa-plus"></i></button><button type="button" data-describe-vlm-chat-roleplay-character-remove title="${escapeHtml(localText('Remove current character', '删除当前角色'))}" aria-label="${escapeHtml(localText('Remove current character', '删除当前角色'))}"><i class="fa-solid fa-trash"></i></button><button type="button" data-describe-vlm-chat-roleplay-import-draft title="${escapeHtml(localText('Ask the assistant to create a character draft', '让助手生成角色草稿'))}" aria-label="${escapeHtml(localText('Ask the assistant to create a character draft', '让助手生成角色草稿'))}"><i class="fa-solid fa-wand-magic-sparkles"></i></button></span></div>
        <div class="describe-vlm-chat-roleplay-character-guidance" data-describe-vlm-chat-roleplay-character-guidance hidden>
          <div class="describe-vlm-chat-roleplay-character-guidance-copy"><i class="fa-solid fa-sparkles"></i><div><strong>${escapeHtml(localText('Start with a character', '先创建一个角色'))}</strong><span>${escapeHtml(localText('Let the assistant fill the form, or start with the name field.', '可以让助手填写表格，也可以先填写名称。'))}</span></div></div>
          <div class="describe-vlm-chat-roleplay-character-guidance-actions">
            <button type="button" class="describe-vlm-chat-roleplay-primary-action" data-describe-vlm-chat-roleplay-character-generate><i class="fa-solid fa-wand-magic-sparkles"></i><span>${escapeHtml(localText('Ask the assistant to create a character', '让助手生成角色'))}</span></button>
            <button type="button" class="describe-vlm-chat-roleplay-secondary-action" data-describe-vlm-chat-roleplay-character-manual><i class="fa-solid fa-pen"></i><span>${escapeHtml(localText('Fill it in myself', '手动填写'))}</span></button>
          </div>
        </div>
        <div class="describe-vlm-chat-roleplay-character-library" data-describe-vlm-chat-roleplay-character-library>
          <label><span>${escapeHtml(localText('Character library', '角色库'))}</span><select data-describe-vlm-chat-roleplay-character-library-select aria-label="${escapeHtml(localText('Character library', '角色库'))}"><option value="">${escapeHtml(localText('Character library', '角色库'))}</option></select></label>
          <div class="describe-vlm-chat-roleplay-character-library-actions">
            <button type="button" data-roleplay-character-library-open title="${escapeHtml(localText('Manage character library', '管理角色库'))}" aria-label="${escapeHtml(localText('Manage character library', '管理角色库'))}"><i class="fa-solid fa-address-book"></i></button>
            <button type="button" data-describe-vlm-chat-roleplay-character-library-load title="${escapeHtml(localText('Load selected character into this story', '将所选角色加载到当前故事'))}" aria-label="${escapeHtml(localText('Load selected character into this story', '将所选角色加载到当前故事'))}"><i class="fa-solid fa-folder-open"></i></button>
            <button type="button" data-describe-vlm-chat-roleplay-character-library-save title="${escapeHtml(localText('Save current character to library', '将当前角色保存到角色库'))}" aria-label="${escapeHtml(localText('Save current character to library', '将当前角色保存到角色库'))}"><i class="fa-solid fa-floppy-disk"></i></button>
            <button type="button" data-describe-vlm-chat-roleplay-character-library-delete title="${escapeHtml(localText('Delete selected library character', '删除所选角色库角色'))}" aria-label="${escapeHtml(localText('Delete selected library character', '删除所选角色库角色'))}"><i class="fa-solid fa-trash"></i></button>
          </div>
        </div>
        <label><span>${escapeHtml(localText('Current character', '当前角色'))}</span><select data-describe-vlm-chat-roleplay-character-select aria-label="${escapeHtml(localText('Current character', '当前角色'))}"></select></label>
        <label><span>${escapeHtml(localText('Name', '名称'))}</span><input data-describe-vlm-chat-roleplay-character-name type="text" maxlength="200"></label>
        <label><span>${escapeHtml(localText('Identity and background', '身份与背景'))}</span><textarea data-describe-vlm-chat-roleplay-character-identity rows="3"></textarea></label>
        <label><span>${escapeHtml(localText('Personality and speech', '性格与说话方式'))}</span><textarea data-describe-vlm-chat-roleplay-character-style rows="3"></textarea></label>
        <label><span>${escapeHtml(localText('Character draft request', '角色生成要求'))}</span><textarea data-describe-vlm-chat-roleplay-character-draft-context rows="2" placeholder="${escapeHtml(localText('Describe the character you want the assistant to create', '描述你希望助手生成的角色'))}"></textarea></label>
        <label><span>${escapeHtml(localText('Character image direction', '角色图要求'))}</span><textarea data-describe-vlm-chat-roleplay-character-reference-request rows="2" placeholder="${escapeHtml(localText('Optional image direction, such as full body, white evening dress, neutral pose', '可选的角色图要求，例如全身、白色晚装、自然站姿'))}"></textarea></label>
        <div class="describe-vlm-chat-roleplay-current-appearance-editor">
          <div class="describe-vlm-chat-roleplay-reference-head"><span>${escapeHtml(localText('Current appearance image', '当前状态图'))}</span><b data-describe-vlm-chat-roleplay-current-appearance-revision>${escapeHtml(localText('Not adopted', '尚未采用'))}</b></div>
          <div class="describe-vlm-chat-roleplay-current-appearance" data-describe-vlm-chat-roleplay-current-appearance></div>
          <div class="describe-vlm-chat-roleplay-current-appearance-actions">
            <textarea data-describe-vlm-chat-roleplay-appearance-request rows="2" placeholder="${escapeHtml(localText('Describe the current clothing or appearance change', '描述当前服装或外观变化'))}"></textarea>
            <button type="button" data-describe-vlm-chat-roleplay-generate-appearance title="${escapeHtml(localText('Generate a current appearance image', '生成当前状态图'))}" aria-label="${escapeHtml(localText('Generate a current appearance image', '生成当前状态图'))}"><i class="fa-solid fa-image"></i></button>
          </div>
          <div class="describe-vlm-chat-roleplay-action-feedback" data-describe-vlm-chat-roleplay-action-feedback="appearance" hidden role="status" aria-live="polite"></div>
          <div class="describe-vlm-chat-roleplay-inline-result" data-describe-vlm-chat-roleplay-inline-result="appearance" hidden aria-live="polite"></div>
        </div>
        <div class="describe-vlm-chat-roleplay-state-editor">
          <div class="describe-vlm-chat-roleplay-reference-head"><span>${escapeHtml(localText('Current character state', '角色当前状态'))}</span><button type="button" data-describe-vlm-chat-roleplay-draft="character_state" title="${escapeHtml(localText('Generate or supplement current character state', '生成或补充角色当前状态'))}" aria-label="${escapeHtml(localText('Generate or supplement current character state', '生成或补充角色当前状态'))}"><i class="fa-solid fa-wand-magic-sparkles"></i></button></div>
          <textarea data-describe-vlm-chat-roleplay-character-state-text rows="3" maxlength="${MAX_ROLEPLAY_STATE_TEXT}" placeholder="${escapeHtml(localText('Describe the character\'s current condition, such as being knocked down and unable to move', '描述角色当前状态，例如被怪物击倒后无法动弹'))}"></textarea>
          <div class="describe-vlm-chat-roleplay-state-fields-head"><span>${escapeHtml(localText('Structured state fields', '结构化状态'))}</span><button type="button" data-describe-vlm-chat-roleplay-state-field-add="character" title="${escapeHtml(localText('Add state field', '添加状态项'))}" aria-label="${escapeHtml(localText('Add state field', '添加状态项'))}"><i class="fa-solid fa-plus"></i></button></div>
          <div class="describe-vlm-chat-roleplay-state-fields" data-describe-vlm-chat-roleplay-state-fields data-describe-vlm-chat-roleplay-state-fields-owner="character"></div>
          <label><span>${escapeHtml(localText('State generation request', '状态生成要求'))}</span><textarea data-describe-vlm-chat-roleplay-character-state-draft-context rows="2" placeholder="${escapeHtml(localText('Ask the assistant to fill or update a status from the current story', '告诉助手根据当前剧情补充或更新哪些状态'))}"></textarea></label>
        </div>
        <div class="describe-vlm-chat-roleplay-reference-editor" data-reference-owner="character">
          <div class="describe-vlm-chat-roleplay-reference-library-preview" data-describe-vlm-chat-roleplay-reference-library-preview="character" hidden></div>
          <div class="describe-vlm-chat-roleplay-reference-head"><span>${escapeHtml(localText('Character reference images', '角色设定图'))}</span><b data-describe-vlm-chat-roleplay-reference-count="character">0/5</b><button type="button" data-describe-vlm-chat-roleplay-generate-character-reference title="${escapeHtml(localText('Generate a character reference image', '生成角色设定图'))}" aria-label="${escapeHtml(localText('Generate a character reference image', '生成角色设定图'))}"><i class="fa-solid fa-wand-magic-sparkles"></i></button></div>
          <div class="describe-vlm-chat-roleplay-reference-list" data-describe-vlm-chat-roleplay-reference-list="character"></div>
          <div class="describe-vlm-chat-roleplay-reference-actions">
            <select data-describe-vlm-chat-roleplay-reference-library="character" aria-label="${escapeHtml(localText('Choose a project image', '选择项目图片'))}"><option value="">${escapeHtml(localText('Project image library', '项目图片库'))}</option></select>
            <button type="button" data-describe-vlm-chat-roleplay-reference-library-add="character" title="${escapeHtml(localText('Use selected image', '使用所选图片'))}" aria-label="${escapeHtml(localText('Use selected image', '使用所选图片'))}"><i class="fa-solid fa-plus"></i></button>
            <button type="button" data-describe-vlm-chat-roleplay-reference-upload="character" title="${escapeHtml(localText('Upload character reference', '上传角色设定图'))}" aria-label="${escapeHtml(localText('Upload character reference', '上传角色设定图'))}"><i class="fa-solid fa-upload"></i></button>
          </div>
          <div class="describe-vlm-chat-roleplay-action-feedback" data-describe-vlm-chat-roleplay-action-feedback="character-reference" hidden role="status" aria-live="polite"></div>
          <div class="describe-vlm-chat-roleplay-inline-result" data-describe-vlm-chat-roleplay-inline-result="character-reference" hidden aria-live="polite"></div>
        </div>
      </div>
      <div class="describe-vlm-chat-roleplay-section">
        <div class="describe-vlm-chat-roleplay-section-head"><strong>${escapeHtml(localText('Player persona', '玩家身份'))}</strong><button type="button" data-describe-vlm-chat-roleplay-draft="persona" title="${escapeHtml(localText('Generate or enrich player identity', '生成或补充玩家身份'))}" aria-label="${escapeHtml(localText('Generate or enrich player identity', '生成或补充玩家身份'))}"><i class="fa-solid fa-wand-magic-sparkles"></i></button></div>
        <label><span>${escapeHtml(localText('Name', '名称'))}</span><input data-describe-vlm-chat-roleplay-persona-name type="text" maxlength="200"></label>
        <label><span>${escapeHtml(localText('Identity and goals', '身份与目标'))}</span><textarea data-describe-vlm-chat-roleplay-persona-identity rows="3"></textarea></label>
          <div class="describe-vlm-chat-roleplay-player-state-editor">
            <div class="describe-vlm-chat-roleplay-state-fields-head"><span>${escapeHtml(localText('Player runtime status', '玩家运行状态'))}</span></div>
            <label><span>${escapeHtml(localText('Status', '状态'))}</span><select data-describe-vlm-chat-roleplay-player-status aria-label="${escapeHtml(localText('Player runtime status', '玩家运行状态'))}">
            <option value="present">${escapeHtml(localText('Present', '在场'))}</option>
            <option value="absent">${escapeHtml(localText('Absent from scene', '离场'))}</option>
          </select></label>
          <label><span>${escapeHtml(localText('Current condition', '当前状态'))}</span><textarea data-describe-vlm-chat-roleplay-player-state-text rows="2" maxlength="${MAX_ROLEPLAY_STATE_TEXT}" placeholder="${escapeHtml(localText('Describe the player condition in natural language', '用自然语言描述玩家当前状态'))}"></textarea></label>
          <div class="describe-vlm-chat-roleplay-state-fields-head"><span>${escapeHtml(localText('Structured state fields', '结构化状态'))}</span><button type="button" data-describe-vlm-chat-roleplay-state-field-add="player" title="${escapeHtml(localText('Add state field', '添加状态项'))}" aria-label="${escapeHtml(localText('Add state field', '添加状态项'))}"><i class="fa-solid fa-plus"></i></button></div>
          <div class="describe-vlm-chat-roleplay-state-fields" data-describe-vlm-chat-roleplay-player-state-fields data-describe-vlm-chat-roleplay-state-fields-owner="player"></div>
        </div>
        <div class="describe-vlm-chat-roleplay-reference-editor" data-reference-owner="player">
          <div class="describe-vlm-chat-roleplay-reference-library-preview" data-describe-vlm-chat-roleplay-reference-library-preview="player" hidden></div>
          <div class="describe-vlm-chat-roleplay-reference-head"><span>${escapeHtml(localText('Player reference images', '玩家参考图'))}</span><b data-describe-vlm-chat-roleplay-reference-count="player">0/5</b></div>
          <div class="describe-vlm-chat-roleplay-reference-list" data-describe-vlm-chat-roleplay-reference-list="player"></div>
          <div class="describe-vlm-chat-roleplay-reference-actions">
            <select data-describe-vlm-chat-roleplay-reference-library="player" aria-label="${escapeHtml(localText('Choose a project image', '选择项目图片'))}"><option value="">${escapeHtml(localText('Project image library', '项目图片库'))}</option></select>
            <button type="button" data-describe-vlm-chat-roleplay-reference-library-add="player" title="${escapeHtml(localText('Use selected image', '使用所选图片'))}" aria-label="${escapeHtml(localText('Use selected image', '使用所选图片'))}"><i class="fa-solid fa-plus"></i></button>
            <button type="button" data-describe-vlm-chat-roleplay-reference-upload="player" title="${escapeHtml(localText('Upload player reference', '上传玩家参考图'))}" aria-label="${escapeHtml(localText('Upload player reference', '上传玩家参考图'))}"><i class="fa-solid fa-upload"></i></button>
          </div>
        </div>
      </div>
      <div class="describe-vlm-chat-roleplay-section">
        <div class="describe-vlm-chat-roleplay-section-head"><strong>${escapeHtml(localText('Current scene', '当前场景'))}</strong><button type="button" data-describe-vlm-chat-roleplay-draft="scene" title="${escapeHtml(localText('Ask the assistant to create a scene draft', '让助手生成场景草稿'))}" aria-label="${escapeHtml(localText('Ask the assistant to create a scene draft', '让助手生成场景草稿'))}"><i class="fa-solid fa-wand-magic-sparkles"></i></button></div>
        <label><span>${escapeHtml(localText('Location', '地点'))}</span><input data-describe-vlm-chat-roleplay-scene-location type="text" maxlength="500"></label>
        <label><span>${escapeHtml(localText('Time', '时间'))}</span><input data-describe-vlm-chat-roleplay-scene-time type="text" maxlength="200"></label>
        <label><span>${escapeHtml(localText('Current event', '当前事件'))}</span><textarea data-describe-vlm-chat-roleplay-scene-event rows="3"></textarea></label>
        <label><span>${escapeHtml(localText('Scene draft request', '场景生成要求'))}</span><textarea data-describe-vlm-chat-roleplay-scene-draft-context rows="2" placeholder="${escapeHtml(localText('Describe the scene you want the assistant to create', '描述你希望助手生成的场景'))}"></textarea></label>
        <div class="describe-vlm-chat-roleplay-reference-editor" data-reference-owner="scene">
          <div class="describe-vlm-chat-roleplay-reference-library-preview" data-describe-vlm-chat-roleplay-reference-library-preview="scene" hidden></div>
          <label><span>${escapeHtml(localText('Scene image direction', '场景图要求'))}</span><textarea data-describe-vlm-chat-roleplay-scene-reference-request rows="2" placeholder="${escapeHtml(localText('Optional direction, such as an empty rainy station at night', '可选要求，例如空无一人的雨夜车站、电影感广角'))}"></textarea></label>
          <div class="describe-vlm-chat-roleplay-reference-head"><span>${escapeHtml(localText('Scene reference images', '场景参考图'))}</span><b data-describe-vlm-chat-roleplay-reference-count="scene">0/5</b><button type="button" data-describe-vlm-chat-roleplay-generate-scene-reference title="${escapeHtml(localText('Generate a scene reference image', '生成场景参考图'))}" aria-label="${escapeHtml(localText('Generate a scene reference image', '生成场景参考图'))}"><i class="fa-solid fa-wand-magic-sparkles"></i></button></div>
          <div class="describe-vlm-chat-roleplay-reference-list" data-describe-vlm-chat-roleplay-reference-list="scene"></div>
          <div class="describe-vlm-chat-roleplay-reference-actions">
            <select data-describe-vlm-chat-roleplay-reference-library="scene" aria-label="${escapeHtml(localText('Choose a project image', '选择项目图片'))}"><option value="">${escapeHtml(localText('Project image library', '项目图片库'))}</option></select>
            <button type="button" data-describe-vlm-chat-roleplay-reference-library-add="scene" title="${escapeHtml(localText('Use selected image', '使用所选图片'))}" aria-label="${escapeHtml(localText('Use selected image', '使用所选图片'))}"><i class="fa-solid fa-plus"></i></button>
            <button type="button" data-describe-vlm-chat-roleplay-reference-upload="scene" title="${escapeHtml(localText('Upload scene reference', '上传场景参考图'))}" aria-label="${escapeHtml(localText('Upload scene reference', '上传场景参考图'))}"><i class="fa-solid fa-upload"></i></button>
          </div>
          <div class="describe-vlm-chat-roleplay-action-feedback" data-describe-vlm-chat-roleplay-action-feedback="scene-reference" hidden role="status" aria-live="polite"></div>
          <div class="describe-vlm-chat-roleplay-inline-result" data-describe-vlm-chat-roleplay-inline-result="scene-reference" hidden aria-live="polite"></div>
        </div>
      </div>
      <div class="describe-vlm-chat-roleplay-section">
        <strong>${escapeHtml(localText('Director and autoplay', '导演与托管'))}</strong>
        <div class="describe-vlm-chat-roleplay-scene-character-picker"><span class="describe-vlm-chat-roleplay-field-label">${escapeHtml(localText('Characters in story images', '场照中的角色'))}</span><div class="describe-vlm-chat-roleplay-scene-character-options" data-describe-vlm-chat-roleplay-scene-characters role="group" aria-label="${escapeHtml(localText('Characters in story images', '场照中的角色'))}"></div></div>
        <label><span>${escapeHtml(localText('Control mode', '控制方式'))}</span><select data-describe-vlm-chat-roleplay-autoplay-mode><option value="manual">${escapeHtml(localText('Manual', '手动'))}</option><option value="suggest">${escapeHtml(localText('Suggest', '建议'))}</option><option value="autoplay">${escapeHtml(localText('Autoplay', '托管'))}</option><option value="spectator">${escapeHtml(localText('Spectator', '观演'))}</option></select></label>
        <label><span>${escapeHtml(localText('Target turns', '目标轮数'))}</span><input data-describe-vlm-chat-roleplay-target-turns type="number" min="1" max="100" step="1"></label>
        <label class="describe-vlm-chat-roleplay-check"><input data-describe-vlm-chat-roleplay-continuous type="checkbox"><span>${escapeHtml(localText('Continue until stopped', '持续播放，直到手动停止'))}</span></label>
        <label class="describe-vlm-chat-roleplay-check"><input data-describe-vlm-chat-roleplay-visual-enabled type="checkbox"><span>${escapeHtml(localText('Offer story images at key moments', '在关键时刻生成故事场照'))}</span></label>
      </div>
      <div class="describe-vlm-chat-roleplay-section describe-vlm-chat-roleplay-agent-section">
        <strong>${escapeHtml(localText('Agent routing', '智能体分工'))}</strong>
        <small>${escapeHtml(localText('Choose the model source for each role. Automatic mode uses the configured primary and fallback.', '为每个职责选择模型来源。自动模式按主模型和备用模型运行。'))}</small>
        <label><span>${escapeHtml(localText('Character reply', '角色回复'))}</span><select data-describe-vlm-chat-roleplay-agent-route="character_reply" aria-label="${escapeHtml(localText('Character reply model source', '角色回复模型来源'))}"><option value="auto">${escapeHtml(localText('Automatic', '自动'))}</option><option value="api">API</option><option value="local">${escapeHtml(localText('Local', '本地'))}</option></select></label>
        <label><span>${escapeHtml(localText('Player proxy', '玩家代理'))}</span><select data-describe-vlm-chat-roleplay-agent-route="player_proxy" aria-label="${escapeHtml(localText('Player proxy model source', '玩家代理模型来源'))}"><option value="auto">${escapeHtml(localText('Automatic', '自动'))}</option><option value="api">API</option><option value="local">${escapeHtml(localText('Local', '本地'))}</option></select></label>
        <label><span>${escapeHtml(localText('External director', '外场导演'))}</span><select data-describe-vlm-chat-roleplay-agent-route="director_state" aria-label="${escapeHtml(localText('External director model source', '外场导演模型来源'))}"><option value="auto">${escapeHtml(localText('Automatic', '自动'))}</option><option value="api">API</option><option value="local">${escapeHtml(localText('Local', '本地'))}</option></select></label>
        <label><span>${escapeHtml(localText('Local model', '本地模型'))}</span><select data-describe-vlm-chat-roleplay-agent-local-version aria-label="${escapeHtml(localText('Local VLM model', '本地 VLM 模型'))}">${renderRoleplayLocalModelOptions()}</select></label>
        <label><span>${escapeHtml(localText('API profile', 'API 模型'))}</span><select data-describe-vlm-chat-roleplay-agent-api-version>${renderRoleplayApiProfileOptions()}</select></label>
        <label class="describe-vlm-chat-roleplay-check"><input data-describe-vlm-chat-roleplay-agent-fallback type="checkbox"><span>${escapeHtml(localText('Allow fallback after a model failure', '模型失败后允许使用备用'))}</span></label>
      </div>
      <div class="describe-vlm-chat-roleplay-section describe-vlm-chat-roleplay-branch-section" data-describe-vlm-chat-roleplay-branch-section>
        <strong>${escapeHtml(localText('Story branches', '剧情分支'))}</strong>
        <label><span>${escapeHtml(localText('Current branch', '当前分支'))}</span><select data-describe-vlm-chat-roleplay-branch-select aria-label="${escapeHtml(localText('Current story branch', '当前剧情分支'))}"></select></label>
        <small data-describe-vlm-chat-roleplay-branch-meta></small>
        <div class="describe-vlm-chat-roleplay-branch-actions">
          <button type="button" data-describe-vlm-chat-roleplay-branch-refresh title="${escapeHtml(localText('Refresh branch list', '刷新分支列表'))}" aria-label="${escapeHtml(localText('Refresh branch list', '刷新分支列表'))}"><i class="fa-solid fa-rotate"></i></button>
          <button type="button" data-describe-vlm-chat-roleplay-branch-restore title="${escapeHtml(localText('Restore selected branch', '恢复选中的剧情分支'))}" aria-label="${escapeHtml(localText('Restore selected branch', '恢复选中的剧情分支'))}"><i class="fa-solid fa-clock-rotate-left"></i></button>
          <button type="button" data-describe-vlm-chat-roleplay-branch-new-conversation title="${escapeHtml(localText('Start a new conversation from the selected branch', '从所选分支新建对话'))}" aria-label="${escapeHtml(localText('Start a new conversation from the selected branch', '从所选分支新建对话'))}"><i class="fa-solid fa-comments"></i></button>
          <button type="button" data-describe-vlm-chat-roleplay-branch-delete title="${escapeHtml(localText('Delete selected branch', '删除选中的剧情分支'))}" aria-label="${escapeHtml(localText('Delete selected branch', '删除选中的剧情分支'))}"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>
    </div>
    <div class="describe-vlm-chat-roleplay-panel-actions">
      <button type="button" data-describe-vlm-chat-roleplay-play><i class="fa-solid fa-play"></i><span>${escapeHtml(localText('Play', '播放'))}</span></button>
      <button type="button" data-describe-vlm-chat-roleplay-step><i class="fa-solid fa-forward-step"></i><span>${escapeHtml(localText('Step', '单步'))}</span></button>
      <button type="button" data-describe-vlm-chat-roleplay-pause><i class="fa-solid fa-pause"></i><span>${escapeHtml(localText('Pause', '暂停'))}</span></button>
      <button type="button" data-describe-vlm-chat-roleplay-stop><i class="fa-solid fa-stop"></i><span>${escapeHtml(localText('Stop', '停止'))}</span></button>
      <button type="button" data-describe-vlm-chat-roleplay-save><i class="fa-solid fa-check"></i><span>${escapeHtml(localText('Apply', '应用'))}</span></button>
    </div>
  </section>
  <div class="describe-vlm-chat-chat-area">
    <div class="describe-vlm-chat-preference-mount" data-describe-vlm-chat-preference-mount hidden></div>
    <div class="describe-vlm-chat-log" data-describe-vlm-chat-log></div>
  </div>
  <div class="describe-vlm-chat-status" data-describe-vlm-chat-status></div>
  <div class="describe-vlm-chat-compose">
    <div class="describe-vlm-chat-compose-toolbar">
      <div class="describe-vlm-chat-compose-tools" aria-label="${escapeHtml(t('Chat tools', '对话工具'))}">
        <button type="button" data-describe-vlm-chat-import-prompt title="${escapeHtml(t('Import main prompt to input', '导入主提示词到输入框'))}" aria-label="${escapeHtml(t('Import main prompt to input', '导入主提示词到输入框'))}"><i class="fa-solid fa-file-import"></i></button>
        <button type="button" data-describe-vlm-chat-save title="${escapeHtml(t('Save conversation', '保存对话'))}" aria-label="${escapeHtml(t('Save conversation', '保存对话'))}"><i class="fa-solid fa-download"></i></button>
        <button type="button" data-describe-vlm-chat-import title="${escapeHtml(t('Import conversation', '导入对话'))}" aria-label="${escapeHtml(t('Import conversation', '导入对话'))}"><i class="fa-solid fa-upload"></i></button>
        <button type="button" data-describe-vlm-chat-clear title="${escapeHtml(t('Clear chat', '清空对话'))}" aria-label="${escapeHtml(t('Clear chat', '清空对话'))}"><i class="fa-solid fa-broom"></i></button>
      </div>
      <label class="describe-vlm-chat-image-toggle" title="${escapeHtml(t('Automatically attach the most recent image in this chat. A manually referenced image takes priority.', '发送时自动附带对话中最近的一张图片。手动引用的图片优先。'))}"><input type="checkbox" data-describe-vlm-chat-auto-previous-image><span>${escapeHtml(t('Attach previous chat image', '附带上一张对话图片'))}</span></label>
      <label class="describe-vlm-chat-unload-toggle" title="${escapeHtml(t('Unload the local VLM/LLM model after each reply.', '每次回复后卸载本地 VLM/LLM 模型。'))}"><input type="checkbox" data-describe-vlm-chat-unload-after><span>${escapeHtml(t('Unload after reply', '回复后卸载模型'))}</span></label>
      <button type="button" data-describe-vlm-chat-pick-image title="${escapeHtml(t('Attach reference image or video', '添加引用图片或视频'))}" aria-label="${escapeHtml(t('Attach reference image or video', '添加引用图片或视频'))}"><i class="fa-solid fa-photo-film"></i></button>
      <button type="button" class="describe-vlm-chat-roleplay-visual-draft-tool" data-describe-vlm-chat-roleplay-visual-draft title="${escapeHtml(localText('Ask the Agent to draft a story scene image', '让 Agent 生成场照提议'))}" aria-label="${escapeHtml(localText('Ask the Agent to draft a story scene image', '让 Agent 生成场照提议'))}" hidden><i class="fa-solid fa-clapperboard"></i></button>
    </div>
    <div class="describe-vlm-chat-attachments" data-describe-vlm-chat-attachments hidden></div>
    <textarea data-describe-vlm-chat-input rows="2" placeholder="${escapeHtml(chatInputPlaceholder(state.chatMode))}"></textarea>
    <button type="button" data-describe-vlm-chat-stop title="${escapeHtml(t('Stop reply', '停止回答'))}" aria-label="${escapeHtml(t('Stop reply', '停止回答'))}" hidden><i class="fa-solid fa-stop"></i></button>
    <button type="button" data-describe-vlm-chat-send title="${escapeHtml(t('Send', '发送'))}" aria-label="${escapeHtml(t('Send', '发送'))}"><i class="fa-solid fa-paper-plane"></i></button>
    <input type="file" accept="image/*,video/*" multiple data-describe-vlm-chat-file hidden>
    <input type="file" accept="image/*" multiple data-describe-vlm-chat-generation-file hidden>
    <input type="file" accept="image/*" multiple data-describe-vlm-chat-roleplay-reference-file="character" hidden>
    <input type="file" accept="image/*" multiple data-describe-vlm-chat-roleplay-reference-file="player" hidden>
    <input type="file" accept="image/*" multiple data-describe-vlm-chat-roleplay-reference-file="scene" hidden>
    <input type="file" accept="application/json,.json" data-describe-vlm-chat-conversation-file hidden>
  </div>
  <button type="button" class="describe-vlm-chat-resize-handle simpleai-popup-resize-handle" data-describe-vlm-chat-resize title="${escapeHtml(t('Resize window', '调整窗口大小'))}" aria-label="${escapeHtml(t('Resize window', '调整窗口大小'))}"></button>
</div>
<div class="describe-vlm-chat-user-template-dialog" data-describe-vlm-chat-user-template-dialog-panel hidden>
  <div class="describe-vlm-chat-user-template-dialog-backdrop" data-describe-vlm-chat-user-template-dialog-close></div>
  <div class="describe-vlm-chat-user-template-dialog-card" role="dialog" aria-modal="true" aria-label="${escapeHtml(localText('User document manager', '用户项目管理'))}">
    <div class="describe-vlm-chat-user-template-dialog-head">
      <strong>${escapeHtml(localText('User documents', '用户项目'))}</strong>
      <button type="button" data-describe-vlm-chat-user-template-dialog-close title="${escapeHtml(t('Close', '关闭'))}" aria-label="${escapeHtml(t('Close', '关闭'))}"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div class="describe-vlm-chat-user-template-dialog-body">
      <label><span>${escapeHtml(localText('Existing user document', '已有用户项目'))}</span><select data-describe-vlm-chat-user-template-dialog-select aria-label="${escapeHtml(localText('Existing user document', '已有用户项目'))}">${renderUserSystemPromptTemplateOptions()}</select></label>
      <label><span>${escapeHtml(localText('Document name', '项目名称'))}</span><input data-describe-vlm-chat-user-template-name type="text" maxlength="120" placeholder="${escapeHtml(localText('Name for this document', '给这个项目起个名称'))}" value="${escapeHtml(state.userSystemPromptTemplateName)}"></label>
      <label><span>${escapeHtml(localText('Document content', '项目内容'))}</span><textarea data-describe-vlm-chat-user-template-content rows="8" placeholder="${escapeHtml(localText('Instructions saved for your account...', '保存到当前账号的用户级指令...'))}">${escapeHtml(state.userSystemPromptContent)}</textarea></label>
    </div>
    <div class="describe-vlm-chat-user-template-dialog-actions">
      <button type="button" data-describe-vlm-chat-user-template-delete title="${escapeHtml(localText('Delete user document', '删除用户项目'))}" aria-label="${escapeHtml(localText('Delete user document', '删除用户项目'))}"><i class="fa-solid fa-trash"></i><span>${escapeHtml(localText('Delete', '删除'))}</span></button>
      <button type="button" data-describe-vlm-chat-user-template-save-as title="${escapeHtml(localText('Save as new user document', '另存为新用户项目'))}" aria-label="${escapeHtml(localText('Save as new user document', '另存为新用户项目'))}"><i class="fa-solid fa-file-circle-plus"></i><span>${escapeHtml(localText('Save as new', '另存为新项目'))}</span></button>
      <button type="button" data-describe-vlm-chat-user-template-save title="${escapeHtml(localText('Save user document', '保存用户项目'))}" aria-label="${escapeHtml(localText('Save user document', '保存用户项目'))}"><i class="fa-solid fa-floppy-disk"></i><span>${escapeHtml(localText('Save', '保存'))}</span></button>
    </div>
  </div>
</div>`;
        installDescribeFloatingLayer(modal);
        syncChatSettingsControls(modal);
        syncBusyControls(modal);
        renderMessages();
        renderPendingImages();
        ensureSystemPromptTemplates(modal).catch(() => {});
        refreshDescribeVlmModelCatalog(false).catch(() => {});
        return modal;
    }

    function openModal() {
        const modal = ensureModal();
        const systemParams = window.simpleaiTopbarSystemParams || {};
        state.__lang = String(systemParams.__lang || systemParams.language || getUiLang(systemParams) || state.__lang || 'en');
        restoreConversationSnapshot();
        ensureCreativePreferencePrompt();
        syncChatSettingsControls(modal);
        renderMessages();
        ensureSystemPromptTemplates(modal).catch(() => {});
        refreshDescribeVlmModelCatalog(false).catch(() => {});
        modal.hidden = false;
        autoReferenceDescribeInputMedia().catch(() => {});
        installDescribeFloatingLayer(modal);
        document.documentElement.classList.add('describe-vlm-chat-open');
        startVlmRuntimeStatusPolling();
        window.requestAnimationFrame(() => {
            const panel = modal.querySelector('.describe-vlm-chat-panel');
            if (describeCompactViewport()) {
                applyCompactFloatingPanelLayout(panel);
                return;
            }
            if (panel?.dataset.describeVlmChatMaximized === '1') {
                applyMaximizedFloatingPanelLayout(panel);
                return;
            }
            applySavedFloatingPanelLayout(panel);
            if (panel?.dataset.describeVlmChatResized === '1') clampFloatingPanelSizeToViewport(panel);
            if (panel?.dataset.describeVlmChatMoved === '1' || panel?.dataset.describeVlmChatResized === '1') keepFloatingPanelInViewport(panel);
        });
        window.setTimeout(() => modal.querySelector('[data-describe-vlm-chat-input]')?.focus(), 40);
    }

    function normalizeCreativeAsset(asset, options = {}) {
        if (!asset || typeof asset !== 'object') return null;
        const includeEmbedded = options?.includeEmbedded !== false;
        const clean = {};
        ['kind', 'asset_id', 'mime', 'name', 'path', 'output_path', 'asset_relative_path', 'relative_path', 'preview_url'].forEach((key) => {
            const value = String(asset?.[key] || '').trim();
            if (value) clean[key] = value.slice(0, MAX_PERSISTED_TEXT);
        });
        ['size', 'width', 'height'].forEach((key) => {
            const value = Number(asset?.[key]);
            if (Number.isFinite(value) && value >= 0) clean[key] = value;
        });
        const dataUrl = String(asset?.data_url || '').trim();
        const thumb = String(asset?.thumb || '').trim();
        const hasEmbeddedMedia = /^data:(?:image|video)\/[a-z0-9.+-]+;base64,/i.test(dataUrl)
            && dataUrl.length <= MAX_RUNTIME_IMAGE_DATA_URL_LENGTH;
        if (includeEmbedded && hasEmbeddedMedia) {
            clean.data_url = dataUrl;
            if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(thumb) && thumb.length <= MAX_RUNTIME_IMAGE_THUMB_LENGTH) {
                clean.thumb = thumb;
            }
        }
        const hasDurableLocator = Boolean(clean.path || clean.output_path || clean.asset_relative_path || clean.relative_path || clean.preview_url);
        if (!includeEmbedded && hasEmbeddedMedia && !hasDurableLocator) return null;
        return clean.asset_id || hasDurableLocator || clean.data_url ? clean : null;
    }

    function normalizeChatMediaInput(input, index = 0, options = {}) {
        if (!input || typeof input !== 'object') return null;
        const asset = normalizeCreativeAsset(input.asset, options);
        const ref = String(input.ref || '').trim().slice(0, 160);
        const declaredType = String(input.type || '').trim().toLowerCase();
        const type = declaredType === 'video' || mediaKind(asset) === 'video' ? 'video' : 'image';
        if (!ref || !asset || !['image', 'video'].includes(type)) return null;
        if (type === 'video' && !String(asset.mime || '').trim()) asset.mime = 'video/mp4';
        return {
            ref,
            role: type === 'video' ? 'video' : index === 0 ? 'base_image' : `reference_image_${index}`,
            name: String(input.name || asset.name || `${type === 'video' ? 'Video' : 'Image'} ${index + 1}`).trim().slice(0, 200),
            type,
            asset
        };
    }

    function normalizeCreativeMediaInput(input, index = 0, options = {}) {
        const normalized = normalizeChatMediaInput(input, index, options);
        return normalized?.type === 'image' ? normalized : null;
    }

    function normalizeCreativeGeneration(generation) {
        if (!generation || typeof generation !== 'object') return null;
        let generationState = String(generation.state || 'awaiting_confirmation').trim().toLowerCase().slice(0, 80);
        const runId = String(generation.run_id || '').trim().slice(0, 240);
        if (CREATIVE_ACTIVE_STATES.has(generationState) && generationState !== 'queued' && !runId) generationState = 'awaiting_confirmation';
        const result = {
            state: generationState || 'awaiting_confirmation',
            run_id: runId,
            percent: Math.max(0, Math.min(1, Number(generation.percent) || 0)),
            message: String(generation.message || '').slice(0, 1000),
            error: String(generation.error || '').slice(0, 1000),
            missing_count: Math.max(0, Number(generation.missing_count) || 0),
            preview_serial: Math.max(0, Number(generation.preview_serial) || 0),
            submission_uncertain: !!generation.submission_uncertain,
            skip_reason: String(generation.skip_reason || '').slice(0, 80),
            queue_position: Math.max(0, Math.round(Number(generation.queue_position) || 0)),
            started_at: String(generation.started_at || '').slice(0, 80),
            finished_at: String(generation.finished_at || '').slice(0, 80),
            assets: Array.isArray(generation.assets)
                ? generation.assets.slice(0, 16).map(normalizeCreativeAsset).filter(Boolean)
                : []
        };
        return result;
    }

    function normalizeRoleplayPromptReformat(value) {
        const source = value && typeof value === 'object' ? value : {};
        const state = ['idle', 'stale', 'running', 'failed'].includes(String(source.state || '').trim().toLowerCase())
            ? String(source.state).trim().toLowerCase()
            : 'idle';
        return {
            state,
            target_preset: String(source.target_preset || '').trim().slice(0, 200),
            request_id: String(source.request_id || '').trim().slice(0, 240),
            error: String(source.error || '').trim().slice(0, 1000)
        };
    }

    function normalizePersistedAction(action) {
        if (!action || typeof action !== 'object') return null;
        const type = String(action.type || '').slice(0, 80);
        const prompt = String(action.prompt || '').slice(0, MAX_PERSISTED_TEXT);
        if (!prompt) return null;
        if (!['generate_image', 'offer_image'].includes(type)) return { type, prompt };
        const taskKey = String(action.task || '').trim().toLowerCase().replace(/[- ]/g, '_');
        const task = CREATIVE_TASK_ALIASES[taskKey] || taskKey;
        const persistedMediaInputs = Array.isArray(action.media_inputs)
            ? action.media_inputs.slice(0, MAX_ATTACHMENTS).map((input, index) => normalizeCreativeMediaInput(
                input,
                index,
                { includeEmbedded: false }
            )).filter(Boolean)
            : [];
        const persistedGeneration = normalizeCreativeGeneration(action.generation) || { state: 'awaiting_confirmation', assets: [] };
        const requiredImages = CREATIVE_MULTI_IMAGE_TASKS.has(task) ? 2 : CREATIVE_IMAGE_INPUT_TASKS.has(task) ? 1 : 0;
        if (
            persistedMediaInputs.length < requiredImages
            && !CREATIVE_ACTIVE_STATES.has(String(persistedGeneration.state || ''))
            && !CREATIVE_TERMINAL_STATES.has(String(persistedGeneration.state || ''))
        ) {
            persistedGeneration.state = 'needs_media';
        }
        return {
            type,
            target: 'canvas_run',
            task: CREATIVE_GENERATION_TASKS.has(task) ? task : 'text_to_image',
            requested_task: String(action.requested_task || action.task_request?.task || '').trim().slice(0, 80),
            media_inputs: persistedMediaInputs,
            prompt,
            preset: String(action.preset || (action.execution_plan?.status === 'no_compatible_route' || CREATIVE_VIDEO_TASKS.has(task) ? '' : CREATIVE_DEFAULT_PRESET)).slice(0, 200),
            preset_source: ['agent_auto', 'session_preference', 'user', 'roleplay_visual', 'roleplay_state_image', 'roleplay_character_reference'].includes(String(action.preset_source || ''))
                ? String(action.preset_source)
                : '',
            parameter_profile: String(action.parameter_profile || action.execution_plan?.parameter_profile || '').slice(0, 200),
            execution_plan: normalizeCreativeExecutionPlan(action.execution_plan),
            aspect_ratio: String(action.aspect_ratio || 'auto').slice(0, 40),
            image_number: Math.max(1, Math.min(4, Math.round(Number(action.image_number) || 1))),
            label: String(action.label || '').slice(0, 200),
            tool_call_id: String(action.tool_call_id || '').slice(0, 240),
            offer_text: String(action.offer_text || '').slice(0, 240),
            offer_reason: String(action.offer_reason || '').slice(0, 80),
            scene_key: String(action.scene_key || '').slice(0, 160),
            source_message_id: String(action.source_message_id || '').slice(0, 240),
            score: Math.max(0, Math.min(1, Number(action.score) || 0)),
            roleplay_visual: !!action.roleplay_visual,
            roleplay_visual_manual: !!action.roleplay_visual_manual,
            prompt_target_preset: String(action.prompt_target_preset || action.preset || '').trim().slice(0, 200),
            prompt_user_edited: !!action.prompt_user_edited,
            prompt_reformat: normalizeRoleplayPromptReformat(action.prompt_reformat),
            roleplay_visible_character_ids: Array.isArray(action.roleplay_visible_character_ids)
                ? action.roleplay_visible_character_ids.map((value) => String(value || '').trim()).filter(Boolean).slice(0, 20)
                : [],
            roleplay_character_options: Array.isArray(action.roleplay_character_options)
                ? action.roleplay_character_options.slice(0, 20).map((item) => ({
                    id: String(item?.id || '').trim().slice(0, 160),
                    label: String(item?.label || item?.id || '').trim().slice(0, 200),
                    owner_type: String(item?.owner_type || 'character').trim().toLowerCase() === 'player' ? 'player' : 'character',
                    description: String(item?.description || '').trim().slice(0, 3000),
                    reference_asset_ids: Array.isArray(item?.reference_asset_ids)
                        ? item.reference_asset_ids.map((value) => String(value || '').trim()).filter(Boolean).slice(0, 5)
                        : [],
                    selected: !!item?.selected
                })).filter((item) => item.id)
                : [],
            reference_bindings: Array.isArray(action.reference_bindings)
                ? action.reference_bindings.slice(0, MAX_ATTACHMENTS).map((item, index) => ({
                    asset_id: String(item?.asset_id || '').trim().slice(0, 240),
                    owner_id: String(item?.owner_id || '').trim().slice(0, 160),
                    owner_type: String(item?.owner_type || '').trim().slice(0, 80),
                    order: index + 1
                })).filter((item) => item.asset_id)
                : [],
            roleplay_all_reference_bindings: Array.isArray(action.roleplay_all_reference_bindings)
                ? action.roleplay_all_reference_bindings.slice(0, MAX_ATTACHMENTS).map((item, index) => ({
                    asset_id: String(item?.asset_id || '').trim().slice(0, 240),
                    owner_id: String(item?.owner_id || '').trim().slice(0, 160),
                    owner_type: String(item?.owner_type || '').trim().slice(0, 80),
                    order: index + 1
                })).filter((item) => item.asset_id)
                : [],
            roleplay_state_image: !!action.roleplay_state_image,
            roleplay_character_image: !!action.roleplay_character_image,
            character_reference_id: String(action.character_reference_id || '').slice(0, 160),
            appearance_character_id: String(action.appearance_character_id || '').slice(0, 160),
            accepted_asset_id: String(action.accepted_asset_id || '').slice(0, MAX_PERSISTED_TEXT),
            session_id: String(action.session_id || '').slice(0, 200),
            branch_id: String(action.branch_id || '').slice(0, 160),
            state_version: Math.max(0, Math.round(Number(action.state_version) || 0)),
            turn_id: String(action.turn_id || '').slice(0, 200),
            scene_id: String(action.scene_id || '').slice(0, 160),
            visual_snapshot: action.visual_snapshot && typeof action.visual_snapshot === 'object'
                ? Object.assign({}, action.visual_snapshot)
                : {},
            ui_collapsed: !!action.ui_collapsed,
            generation: persistedGeneration
        };
    }

    function normalizeRoleplayMessageVariant(value, index = 0, conversationId = '') {
        if (!value || typeof value !== 'object') return null;
        const content = String(value.content || '').slice(0, MAX_PERSISTED_TEXT);
        if (!content) return null;
        const actions = Array.isArray(value.actions)
            ? value.actions.slice(0, 20).map(normalizePersistedAction).filter(Boolean)
            : [];
        const before = value.roleplay_session_before || value.session_before;
        const after = value.roleplay_session_after || value.session_after;
        return {
            id: String(value.id || uid(`roleplay_variant_${index}`)).slice(0, 240),
            content,
            actions,
            roleplay_state_changes: normalizeRoleplayStateChanges(value.roleplay_state_changes),
            roleplay_session_before: before && typeof before === 'object'
                ? normalizeRoleplaySession(before, conversationId)
                : null,
            roleplay_session_after: after && typeof after === 'object'
                ? normalizeRoleplaySession(after, conversationId)
                : null,
            branch_id: String(value.branch_id || after?.active_branch_id || '').slice(0, 160),
            state_version: Math.max(0, Math.round(Number(value.state_version || after?.state_version) || 0)),
            turn_id: String(value.turn_id || '').slice(0, 200),
            created_at: String(value.created_at || '').slice(0, 80)
        };
    }

    function normalizePersistedMessageImage(image, thumbBudget = null) {
        const rawThumb = String(image?.thumb || '').trim();
        const thumbAllowed = /^data:image\/(?:jpeg|png|webp);base64,/i.test(rawThumb)
            && rawThumb.length <= MAX_PERSISTED_THUMB_LENGTH
            && (!thumbBudget || rawThumb.length <= thumbBudget.remaining);
        if (thumbAllowed && thumbBudget) thumbBudget.remaining -= rawThumb.length;
        return {
            name: String(image?.name || 'image').slice(0, 200),
            width: Number.isFinite(Number(image?.width)) ? Number(image.width) : null,
            height: Number.isFinite(Number(image?.height)) ? Number(image.height) : null,
            size: Number.isFinite(Number(image?.size)) ? Number(image.size) : null,
            wire_size: Number.isFinite(Number(image?.wire_size)) ? Number(image.wire_size) : null,
            mime: String(image?.mime || '').slice(0, 80),
            thumb: thumbAllowed ? rawThumb : '',
            placeholder: !thumbAllowed
        };
    }

    function normalizeChatCompletion(value, fallbackMaxTokens = 0) {
        const source = value && typeof value === 'object' ? value : {};
        const incompleteDetails = source.incomplete_details && typeof source.incomplete_details === 'object'
            ? source.incomplete_details
            : {};
        const status = String(source.status || '').trim().slice(0, 80);
        const finishReason = String(source.finish_reason || '').trim().slice(0, 80);
        const stopReason = String(source.stop_reason || '').trim().slice(0, 80);
        const reason = String(source.reason || incompleteDetails.reason || finishReason || stopReason || '').trim().slice(0, 80);
        const normalizedReason = reason.toLowerCase().replace(/[- ]/g, '_');
        const outputLimited = source.output_limited === true || [
            'length',
            'max_tokens',
            'max_output_tokens',
            'max_completion_tokens',
            'token_limit'
        ].includes(normalizedReason);
        const usage = source.usage && typeof source.usage === 'object' ? source.usage : {};
        const maxTokens = Math.max(0, Math.round(Number(source.max_tokens || fallbackMaxTokens) || 0));
        const outputTokens = Math.max(0, Math.round(Number(
            source.output_tokens ?? usage.output_tokens ?? usage.completion_tokens
        ) || 0));
        const elapsedSeconds = Math.max(0, Number(source.elapsed_seconds) || 0);
        const tokensPerSecond = Math.max(0, Number(source.tokens_per_second) || (
            outputTokens && elapsedSeconds ? outputTokens / elapsedSeconds : 0
        ));
        if (!outputLimited && !status && !reason && !outputTokens && !tokensPerSecond) return null;
        return {
            output_limited: outputLimited,
            status,
            reason,
            finish_reason: finishReason,
            stop_reason: stopReason,
            max_tokens: maxTokens,
            output_tokens: outputTokens,
            elapsed_seconds: elapsedSeconds,
            tokens_per_second: tokensPerSecond
        };
    }

    function formatCompletionSpeed(value) {
        const speed = Number(value);
        if (!Number.isFinite(speed) || speed <= 0) return '';
        const decimals = speed >= 100 ? 0 : speed >= 10 ? 1 : 2;
        return speed.toFixed(decimals).replace(/\.0+$/, '');
    }

    function completionSpeedHtml(completion) {
        const speed = formatCompletionSpeed(completion?.tokens_per_second);
        if (!speed) return '';
        const title = t('Generation speed', '生成速度');
        return `<small class="describe-vlm-chat-token-speed" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}">${escapeHtml(speed)} token/s</small>`;
    }

    function chatCompletionLimitMessage(completion) {
        const limit = Math.max(0, Math.round(Number(completion?.max_tokens) || 0));
        return limit > 0
            ? t(
                `Reply reached the ${limit} token output limit and may be incomplete. Send “continue” to resume.`,
                `回答达到 ${limit} token 输出上限，内容可能不完整。可发送“继续输出”。`
            )
            : t(
                'Reply reached the output token limit and may be incomplete. Send “continue” to resume.',
                '回答达到 token 输出上限，内容可能不完整。可发送“继续输出”。'
            );
    }

    function visibleReplyFromResponse(response, completion) {
        const text = String(response?.text || '').trim();
        if (text) return text;
        const rawText = String(response?.raw_text || response?.rawText || '').trim();
        if (rawText) return rawText;
        if (completion?.output_limited) {
            return t(
                'Reply reached the output limit before returning visible text.',
                '回答达到输出上限，但没有返回可显示正文。'
            );
        }
        return t('No visible reply was returned.', '没有返回可显示正文。');
    }

    function normalizePersistedMessage(message, options = {}) {
        if (!message || typeof message !== 'object') return null;
        const role = message.role === 'assistant' ? 'assistant' : message.role === 'system' ? 'system' : 'user';
        const id = String(message.id || uid(`describe_vlm_chat_${role}`)).slice(0, 240);
        const content = String(message.content || '').slice(0, MAX_PERSISTED_TEXT);
        const images = Array.isArray(message.images)
            ? message.images.slice(0, MAX_ATTACHMENTS).map((image) => normalizePersistedMessageImage(image, options.thumbBudget))
            : [];
        const actions = Array.isArray(message.actions)
            ? message.actions.slice(0, 20).map(normalizePersistedAction).filter(Boolean)
            : [];
        const mediaAssets = Array.isArray(message.media_assets)
            ? message.media_assets.slice(0, MAX_ATTACHMENTS).map((input, index) => normalizeChatMediaInput(
                input,
                index,
                { includeEmbedded: false }
            )).filter(Boolean)
            : [];
        const completion = normalizeChatCompletion(message.completion);
        const variants = Array.isArray(message.variants)
            ? message.variants.slice(0, 8).map((variant, index) => normalizeRoleplayMessageVariant(
                variant,
                index,
                options.conversationId || message.roleplay_session?.conversation_id || ''
            )).filter(Boolean)
            : [];
        if (!content && !images.length && !actions.length && !mediaAssets.length) return null;
        const normalized = {
            id,
            role,
            content,
            actions,
            roleplay_state_changes: normalizeRoleplayStateChanges(message.roleplay_state_changes),
            images,
            media_assets: mediaAssets,
            image_count: Math.max(0, Number(message.image_count) || images.length || mediaAssets.length),
            variants,
            active_variant_index: Math.max(0, Math.min(Math.max(0, variants.length - 1), Math.round(Number(message.active_variant_index) || 0)))
        };
        const roleplayBefore = message.roleplay_session_before || message.session_before;
        const roleplayAfter = message.roleplay_session_after || message.session_after;
        if (roleplayBefore && typeof roleplayBefore === 'object') {
            normalized.roleplay_session_before = normalizeRoleplaySession(
                roleplayBefore,
                options.conversationId || roleplayBefore.conversation_id || ''
            );
        }
        if (roleplayAfter && typeof roleplayAfter === 'object') {
            normalized.roleplay_session_after = normalizeRoleplaySession(
                roleplayAfter,
                options.conversationId || roleplayAfter.conversation_id || ''
            );
        }
        if (completion) normalized.completion = completion;
        return normalized;
    }

    function normalizePersistedMessages(messages, options = {}) {
        const source = (Array.isArray(messages) ? messages : []).filter((message) => !message?.pending).slice(-MAX_PERSISTED_MESSAGES);
        const thumbBudget = { remaining: MAX_PERSISTED_THUMB_TOTAL };
        const normalized = [];
        for (let index = source.length - 1; index >= 0; index -= 1) {
            normalized.unshift(normalizePersistedMessage(source[index], Object.assign({}, options, { thumbBudget })));
        }
        return normalized.filter(Boolean);
    }

    function normalizePersistedRoleplayAutoplayState(value) {
        const normalized = normalizeRoleplayAutoplayState(value);
        return {
            phase: normalized.phase === 'running' ? 'paused' : normalized.phase,
            completed_turns: normalized.completed_turns,
            target_turns: normalized.target_turns,
            continuous: normalized.continuous,
            error: normalized.error
        };
    }

    function rebindRoleplaySessionIdentity(value, conversationId, sessionId = '') {
        const session = normalizeRoleplaySession(value, conversationId);
        const nextConversationId = String(conversationId || '').trim();
        const nextSessionId = String(sessionId || session.id || uid('roleplay_session')).trim();
        if (nextConversationId) session.conversation_id = nextConversationId.slice(0, 200);
        if (nextSessionId) session.id = nextSessionId.slice(0, 160);
        return session;
    }

    function rebindRoleplayBranchIdentity(value, conversationId, sessionId = '', options = {}) {
        const branch = normalizeRoleplayBranch(value, conversationId);
        branch.session = rebindRoleplaySessionIdentity(branch.session, conversationId, sessionId);
        if (options.localOnly) branch.remote = false;
        return branch;
    }

    function rebindPersistedActionIdentity(value, sessionId = '') {
        const action = value && typeof value === 'object' ? Object.assign({}, value) : null;
        if (!action) return null;
        const nextSessionId = String(sessionId || '').trim();
        if (nextSessionId) action.session_id = nextSessionId.slice(0, 200);
        return action;
    }

    function rebindRoleplayMessageIdentity(value, conversationId, sessionId = '') {
        if (!value || typeof value !== 'object') return value;
        const next = Object.assign({}, value);
        const rebindSession = (snapshot) => snapshot && typeof snapshot === 'object'
            ? rebindRoleplaySessionIdentity(snapshot, conversationId, sessionId)
            : snapshot;
        if (Array.isArray(next.actions)) {
            next.actions = next.actions.map((action) => rebindPersistedActionIdentity(action, sessionId)).filter(Boolean);
        }
        if (next.roleplay_session_before && typeof next.roleplay_session_before === 'object') {
            next.roleplay_session_before = rebindSession(next.roleplay_session_before);
        }
        if (next.roleplay_session_after && typeof next.roleplay_session_after === 'object') {
            next.roleplay_session_after = rebindSession(next.roleplay_session_after);
        }
        if (Array.isArray(next.variants)) {
            next.variants = next.variants.map((variant) => {
                if (!variant || typeof variant !== 'object') return variant;
                const nextVariant = Object.assign({}, variant);
                if (Array.isArray(nextVariant.actions)) {
                    nextVariant.actions = nextVariant.actions
                        .map((action) => rebindPersistedActionIdentity(action, sessionId))
                        .filter(Boolean);
                }
                if (nextVariant.roleplay_session_before && typeof nextVariant.roleplay_session_before === 'object') {
                    nextVariant.roleplay_session_before = rebindSession(nextVariant.roleplay_session_before);
                }
                if (nextVariant.roleplay_session_after && typeof nextVariant.roleplay_session_after === 'object') {
                    nextVariant.roleplay_session_after = rebindSession(nextVariant.roleplay_session_after);
                }
                return nextVariant;
            }).filter(Boolean);
        }
        return next;
    }

    function rebindRoleplayMessageIdentities(messages, conversationId, sessionId = '') {
        return (Array.isArray(messages) ? messages : [])
            .map((message) => rebindRoleplayMessageIdentity(message, conversationId, sessionId))
            .filter(Boolean);
    }

    function normalizeConversationRoleplayData(source, conversationId, options = {}) {
        const target = source && typeof source === 'object' ? source : {};
        const session = rebindRoleplaySessionIdentity(
            target.roleplaySession || target.roleplay_session,
            conversationId,
            options.sessionId || ''
        );
        const sessionId = session.id;
        const branches = normalizeRoleplayBranches(
            target.roleplayBranches || target.roleplay_branches,
            conversationId
        ).map((branch) => rebindRoleplayBranchIdentity(
            branch,
            conversationId,
            sessionId,
            { localOnly: !!options.localOnlyBranches }
        ));
        const messages = rebindRoleplayMessageIdentities(
            normalizePersistedMessages(target.messages, { conversationId }),
            conversationId,
            sessionId
        );
        return { session, branches, messages };
    }

    function conversationHasRoleplayData(source, conversationId = '') {
        const target = source && typeof source === 'object' ? source : {};
        const mode = normalizeChatMode(target.chatMode ?? target.chat_mode);
        const session = normalizeRoleplaySession(target.roleplaySession || target.roleplay_session, conversationId);
        return mode === 'roleplay'
            || !!session.character.name
            || !!session.story_state.scene.location
            || normalizeRoleplayBranches(target.roleplayBranches || target.roleplay_branches, conversationId).length > 0;
    }

    function conversationRecordFromSource(source, options = {}) {
        const target = source && typeof source === 'object' ? source : {};
        const conversationId = String(
            options.conversationId || target.conversationId || target.conversation_id || uid('describe_vlm_chat')
        ).trim();
        const mode = normalizeChatMode(target.chatMode ?? target.chat_mode);
        const roleplayHasData = options.roleplayHasData !== undefined
            ? !!options.roleplayHasData
            : conversationHasRoleplayData(target, conversationId);
        let messages = normalizePersistedMessages(target.messages, { conversationId });
        let roleplayData = null;
        if (roleplayHasData) {
            roleplayData = normalizeConversationRoleplayData(target, conversationId, {
                sessionId: options.roleplaySessionId || '',
                localOnlyBranches: !!options.localOnlyBranches
            });
            messages = roleplayData.messages;
        }
        const selection = normalizeStoredSystemPromptSelection(target);
        const read = (camel, snake, fallback = '') => {
            if (target[camel] !== undefined && target[camel] !== null) return target[camel];
            if (target[snake] !== undefined && target[snake] !== null) return target[snake];
            return fallback;
        };
        return Object.assign({
            schema: CONVERSATION_SCHEMA,
            version: CONVERSATION_VERSION,
            saved_at: String(options.savedAt || target.saved_at || new Date().toISOString()),
            conversation_id: conversationId,
            messages,
            chatMode: mode,
            customSystemPrompt: String(read('customSystemPrompt', 'custom_system_prompt', '') || '').slice(0, MAX_PERSISTED_TEXT),
            systemPromptTemplateId: selection.systemPromptTemplateId,
            systemPromptPickerValue: selection.systemPromptPickerValue,
            baseSystemPromptContent: selection.baseSystemPromptContent,
            userSystemPromptTemplateId: selection.userSystemPromptTemplateId,
            userSystemPromptTemplateName: selection.userSystemPromptTemplateName,
            userSystemPromptContent: selection.userSystemPromptContent,
            systemPromptManualOverride: !!read('systemPromptManualOverride', 'system_prompt_manual_override', false),
            auto_attach_previous_image: read(
                'autoAttachPreviousImage',
                'auto_attach_previous_image',
                defaultAutoAttachPreviousImageForMode(mode)
            ) !== false,
            roleplay_panel_open: !!read('roleplayPanelOpen', 'roleplay_panel_open', false),
            roleplay_autoplay_state: normalizePersistedRoleplayAutoplayState(
                read('roleplayAutoplayState', 'roleplay_autoplay_state', null)
            ),
            unload_after_chat: !!read('unloadAfterChat', 'unload_after_chat', false),
            creative_preference_expanded: !!read('creativePreferenceExpanded', 'creative_preference_expanded', false),
            // Current UI mirror: creative_preferences: normalizeCreativePreference(state.creativePreference)
            creative_preferences: normalizeCreativePreference(read('creativePreference', 'creative_preferences', null)),
            // Current UI mirror: creative_initiative: normalizeCreativeInitiative(state.creativeInitiative)
            creative_initiative: normalizeCreativeInitiative(read('creativeInitiative', 'creative_initiative', null))
        }, roleplayHasData ? {
            roleplay_session: roleplayData.session,
            roleplay_branches: roleplayData.branches
        } : {});
    }

    function upsertRoleplayBranchSnapshot(runtime, options = {}) {
        const target = runtime || currentConversationRuntime();
        if (!target || normalizeChatMode(target.chatMode) !== 'roleplay') return null;
        const session = normalizeRoleplaySession(target.roleplaySession, target.conversationId);
        const branchId = String(options.branch_id || session.active_branch_id || 'main').trim() || 'main';
        const previous = normalizeRoleplayBranches(target.roleplayBranches, target.conversationId)
            .find((item) => item.branch_id === branchId);
        const now = new Date().toISOString();
        const branch = normalizeRoleplayBranch({
            branch_id: branchId,
            label: options.label || previous?.label || '',
            parent_branch_id: options.parent_branch_id || previous?.parent_branch_id || '',
            fork_turn_id: options.fork_turn_id || previous?.fork_turn_id || '',
            reason: options.reason || previous?.reason || '',
            created_at: previous?.created_at || now,
            updated_at: now,
            session,
            messages: normalizePersistedMessages(target.messages).slice(-MAX_ROLEPLAY_BRANCH_MESSAGES)
        }, target.conversationId);
        const rows = normalizeRoleplayBranches(target.roleplayBranches, target.conversationId)
            .filter((item) => item.branch_id !== branchId);
        target.roleplayBranches = [...rows, branch].slice(-MAX_ROLEPLAY_BRANCHES);
        if (isCurrentConversationRuntime(target)) state.roleplayBranches = target.roleplayBranches;
        return branch;
    }

    function preserveRoleplayBranchBeforeMutation(runtime, options = {}) {
        return upsertRoleplayBranchSnapshot(runtime, options);
    }

    function conversationPayload(runtime = null) {
        const source = runtime || currentConversationRuntime();
        upsertRoleplayBranchSnapshot(source);
        const conversationId = String(source.conversationId || ensureConversationId()).trim();
        return conversationRecordFromSource(source, {
            conversationId,
            roleplayHasData: conversationHasRoleplayData(source, conversationId)
        });
    }

    function normalizeConversationPayload(data, options = {}) {
        if (
            !data
            || typeof data !== 'object'
            || data.schema !== CONVERSATION_SCHEMA
            || Number(data.version) !== CONVERSATION_VERSION
            || !Array.isArray(data.messages)
        ) return null;
        const conversationId = options.preserveId
            ? String(data.conversation_id || '').trim() || uid('describe_vlm_chat')
            : uid('describe_vlm_chat_import');
        const roleplayHasData = conversationHasRoleplayData(data, conversationId);
        const roleplayData = roleplayHasData
            ? normalizeConversationRoleplayData(data, conversationId, {
                sessionId: options.import ? uid('roleplay_session_import') : '',
                localOnlyBranches: !!options.import
            })
            : null;
        const selection = normalizeStoredSystemPromptSelection(data);
        return {
            conversationId,
            messages: roleplayData?.messages || normalizePersistedMessages(data.messages, { conversationId }),
            chatMode: normalizeChatMode(data.chatMode),
            roleplaySession: roleplayData?.session || normalizeRoleplaySession(data.roleplay_session, conversationId),
            roleplayBranches: roleplayData?.branches || normalizeRoleplayBranches(data.roleplay_branches, conversationId),
            roleplayPanelOpen: !!data.roleplay_panel_open,
            roleplayAutoplayState: normalizeRoleplayAutoplayState(data.roleplay_autoplay_state),
            unloadAfterChat: !!data.unload_after_chat,
            creativePreferenceExpanded: !!data.creative_preference_expanded,
            customSystemPrompt: String(data.customSystemPrompt || '').slice(0, MAX_PERSISTED_TEXT),
            ...selection,
            systemPromptManualOverride: !!data.systemPromptManualOverride,
            autoAttachPreviousImage: data.auto_attach_previous_image !== undefined
                ? data.auto_attach_previous_image !== false
                : defaultAutoAttachPreviousImageForMode(data.chatMode),
            creativePreference: normalizeCreativePreference(data.creative_preferences),
            creativeInitiative: normalizeCreativeInitiative(data.creative_initiative)
        };
    }

    function normalizeConversationRecordForCatalog(value) {
        const normalized = normalizeConversationPayload(value, { preserveId: true });
        if (!normalized) return null;
        return conversationRecordFromSource(normalized, {
            conversationId: normalized.conversationId,
            roleplayHasData: conversationHasRoleplayData(value, normalized.conversationId),
            savedAt: value.saved_at
        });
    }

    function conversationRecordHasHistory(record) {
        return Array.isArray(record?.messages) && record.messages.length > 0;
    }

    function readConversationCatalog() {
        const normalizeRecords = (items) => {
            const seen = new Set();
            return (Array.isArray(items) ? items : [])
                .map(normalizeConversationRecordForCatalog)
                .filter((record) => {
                    const id = String(record?.conversation_id || '').trim();
                    if (!id || seen.has(id) || !conversationRecordHasHistory(record)) return false;
                    seen.add(id);
                    return true;
                })
                .slice(0, MAX_SAVED_CONVERSATIONS);
        };
        try {
            const stored = JSON.parse(window.localStorage?.getItem(CONVERSATIONS_STORAGE_KEY) || 'null');
            if (
                stored?.schema === CONVERSATIONS_SCHEMA
                && Number(stored.version) === CONVERSATIONS_VERSION
            ) {
                const records = normalizeRecords(stored.conversations);
                if (records.length) {
                    const storedActiveId = String(stored.active_id || '').trim();
                    return {
                        activeId: records.some((record) => String(record.conversation_id || '').trim() === storedActiveId)
                            ? storedActiveId
                            : String(records[0].conversation_id || '').trim(),
                        records
                    };
                }
            }
        } catch (err) {}
        return { activeId: '', records: [] };
    }

    function ensureConversationCatalogLoaded() {
        if (state.conversationCatalogLoaded) return;
        const catalog = readConversationCatalog();
        state.conversationCatalog = catalog.records;
        state.conversationCatalogLoaded = true;
        state.conversationCatalogActiveId = catalog.activeId;
    }

    function persistConversationCatalog() {
        ensureConversationCatalogLoaded();
        const records = state.conversationCatalog.slice(-MAX_SAVED_CONVERSATIONS);
        const currentId = String(state.conversationId || '').trim();
        const payload = {
            schema: CONVERSATIONS_SCHEMA,
            version: CONVERSATIONS_VERSION,
            active_id: records.some((record) => String(record?.conversation_id || '').trim() === currentId) ? currentId : '',
            saved_at: new Date().toISOString(),
            conversations: records
        };
        let serialized = '';
        try {
            serialized = JSON.stringify(payload);
            while (serialized.length > MAX_CONVERSATIONS_STORAGE_LENGTH && payload.conversations.length > 1) {
                payload.conversations.shift();
                serialized = JSON.stringify(payload);
            }
            window.localStorage?.setItem(CONVERSATIONS_STORAGE_KEY, serialized);
            state.conversationCatalog = payload.conversations;
            state.conversationCatalogActiveId = payload.active_id;
            return true;
        } catch (err) {
            return false;
        }
    }

    function removeConversationRecord(conversationId, persist = true) {
        ensureConversationCatalogLoaded();
        const id = String(conversationId || '').trim();
        if (!id) return false;
        const next = state.conversationCatalog.filter(
            (item) => String(item?.conversation_id || '').trim() !== id
        );
        if (next.length === state.conversationCatalog.length) return false;
        state.conversationCatalog = next;
        if (persist) persistConversationCatalog();
        return true;
    }

    function upsertConversationRecord(record) {
        ensureConversationCatalogLoaded();
        const id = String(record?.conversation_id || '').trim();
        if (!id) return false;
        const existingIndex = state.conversationCatalog.findIndex(
            (item) => String(item?.conversation_id || '').trim() === id
        );
        if (existingIndex >= 0) {
            state.conversationCatalog[existingIndex] = record;
        } else {
            state.conversationCatalog = [...state.conversationCatalog, record];
        }
        state.conversationCatalog = state.conversationCatalog.slice(-MAX_SAVED_CONVERSATIONS);
        return persistConversationCatalog();
    }

    function saveConversationSnapshot(runtime = null) {
        try {
            const target = runtime || syncCurrentRuntimeFromState();
            if (target?.deleted) return;
            const snapshot = conversationPayload(target);
            const serialized = JSON.stringify(snapshot);
            if (serialized.length > 900000) return;
            if (!conversationRecordHasHistory(snapshot)) {
                const removed = removeConversationRecord(snapshot.conversation_id, false);
                target.persistenceDirty = false;
                if (isCurrentConversationRuntime(target)) state.persistenceDirty = false;
                if (removed) persistConversationCatalog();
                if (isCurrentConversationRuntime(target)) {
                    syncConversationControls(document.getElementById('describe_vlm_chat_modal'));
                }
                return;
            }
            if (upsertConversationRecord(snapshot)) {
                target.persistenceDirty = false;
                if (isCurrentConversationRuntime(target)) {
                    state.persistenceDirty = false;
                    if (state.messages.length <= 2) syncConversationControls(document.getElementById('describe_vlm_chat_modal'));
                }
            }
        } catch (err) {}
    }

    function applyConversationSnapshot(snapshot) {
        const restored = snapshot?.conversationId
            ? snapshot
            : normalizeConversationPayload(snapshot, { preserveId: true });
        if (!restored) return false;
        const conversationId = restored.conversationId || uid('describe_vlm_chat');
        const runtime = ensureConversationRuntime(conversationId, {
            conversationId,
            messages: restored.messages,
            chatMode: restored.chatMode,
            roleplaySession: restored.roleplaySession,
            roleplayBranches: restored.roleplayBranches,
            roleplayPanelOpen: restored.roleplayPanelOpen,
            roleplayAutoplayState: restored.roleplayAutoplayState,
            customSystemPrompt: restored.customSystemPrompt,
            systemPromptTemplateId: restored.systemPromptTemplateId,
            systemPromptPickerValue: restored.systemPromptPickerValue,
            baseSystemPromptContent: restored.baseSystemPromptContent,
            userSystemPromptTemplateId: restored.userSystemPromptTemplateId,
            userSystemPromptTemplateName: restored.userSystemPromptTemplateName,
            userSystemPromptContent: restored.userSystemPromptContent,
            systemPromptManualOverride: restored.systemPromptManualOverride,
            autoAttachPreviousImage: restored.autoAttachPreviousImage,
            unloadAfterChat: restored.unloadAfterChat,
            creativePreference: restored.creativePreference,
            creativePreferenceExpanded: restored.creativePreferenceExpanded,
            creativeInitiative: restored.creativeInitiative,
            persistenceDirty: false
        }, { forceRefresh: true });
        applyConversationRuntime(runtime);
        // Restored state mirrors: state.creativePreference = restored.creativePreference;
        // Restored state mirrors: state.creativeInitiative = restored.creativeInitiative;
        state.missingVlmModelRequest = null;
        runtime.persistenceDirty = false;
        state.persistenceDirty = false;
        applyCreativePreferenceToPendingActions(restored.creativePreference);
        return true;
    }

    function restoreConversationSnapshot() {
        if (state.persistenceRestored || state.messages.length || state.persistenceDirty) return;
        state.persistenceRestored = true;
        try {
            ensureConversationCatalogLoaded();
            const activeId = String(state.conversationCatalogActiveId || '').trim();
            const target = state.conversationCatalog.find((item) => String(item?.conversation_id || '').trim() === activeId)
                || state.conversationCatalog[0];
            if (!target || !applyConversationSnapshot(target)) {
                ensureConversationId();
                saveConversationSnapshot();
                syncChatSettingsControls(document.getElementById('describe_vlm_chat_modal'));
                return;
            }
            saveChatSettings();
            syncChatSettingsControls(document.getElementById('describe_vlm_chat_modal'));
            renderPendingImages();
            renderMessages();
            setStatus(t('Recent conversation restored.', '已恢复最近对话。'));
            window.setTimeout(resumeCreativeGenerationPolls, 0);
        } catch (err) {}
    }

    function downloadConversation() {
        const blob = new Blob([JSON.stringify(conversationPayload(), null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `simpai-vlm-chat-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 0);
        setStatus(t('Conversation saved.', '对话已保存。'));
    }

    function importConversationFile(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const restored = normalizeConversationPayload(JSON.parse(String(reader.result || '')), { import: true });
                if (!restored) throw new Error('invalid conversation');
                activeCreativeRunIds().forEach((runId) => creativeCanvasApi()?.controlRun?.(runId, 'stop', {
                    user_context: creativeUserContext()
                }).catch(() => {}));
                stopCreativePolls();
                state.requestToken += 1;
                abortActiveChatRequest();
                abortCreativeDirectorRequest(true);
                state.busy = false;
                if (!applyConversationSnapshot(restored)) throw new Error('invalid conversation');
                state.persistenceRestored = true;
                saveChatSettings();
                saveConversationSnapshot();
                const modal = document.getElementById('describe_vlm_chat_modal');
                syncChatSettingsControls(modal);
                renderPendingImages();
                renderMessages();
                window.setTimeout(resumeCreativeGenerationPolls, 0);
                setStatus(t('Conversation imported.', '对话已导入。'));
            } catch (err) {
                setStatus(t('Invalid conversation file.', '对话文件格式无效。'), true);
            }
        };
        reader.readAsText(file);
    }

    function closeModal() {
        const modal = ensureModal();
        closeUserSystemPromptTemplateDialog(modal);
        stopVlmRuntimeStatusPolling();
        modal.hidden = true;
        document.documentElement.classList.remove('describe-vlm-chat-open');
    }

    function stopActiveConversationWork() {
        const runtime = syncCurrentRuntimeFromState();
        const previousConversationId = runtime.conversationId;
        const previousRequestId = runtime.activeRequestId;
        const creativeRunIds = activeCreativeRunIds(runtime.messages);
        const hadChatWork = !!(runtime.busy || runtime.activeAbortController || runtime.activeRequestId);
        stopRoleplayAutoplayRuntime(runtime);
        runtime.requestToken += 1;
        runtime.busy = false;
        abortActiveChatRequest(runtime);
        abortCreativeDirectorRequest(true, runtime);
        stopCreativePolls(runtime);
        creativeRunIds.forEach((runId) => creativeCanvasApi()?.controlRun?.(runId, 'stop', {
            user_context: creativeUserContext()
        }).catch(() => {}));
        runtime.describeMediaReferencePromise = null;
        runtime.lastAutoReferencedDescribeMediaKey = '';
        if (hadChatWork) replacePendingAssistant(t('Stopped.', '已停止。'), runtime.messages);
        applyConversationRuntime(runtime);
        if (previousRequestId) {
            notifyBackendChatCancel(previousConversationId, previousRequestId).catch(() => {});
        }
        return { previousConversationId, previousRequestId };
    }

    function switchConversation(conversationId) {
        ensureConversationCatalogLoaded();
        const id = String(conversationId || '').trim();
        if (!id || id === state.conversationId) return;
        const target = state.conversationCatalog.find((item) => String(item?.conversation_id || '').trim() === id);
        if (!target) return;
        syncCurrentRuntimeFromState();
        stopRoleplayAutoplayRuntime(currentConversationRuntime());
        saveConversationSnapshot();
        const targetRuntime = ensureConversationRuntime(id, target);
        if (!applyConversationRuntime(targetRuntime)) return;
        state.persistenceDirty = false;
        state.persistenceRestored = true;
        state.conversationCatalogActiveId = state.conversationId;
        saveChatSettings();
        saveConversationSnapshot();
        const modal = document.getElementById('describe_vlm_chat_modal');
        syncChatSettingsControls(modal);
        syncBusyControls(modal);
        renderPendingImages();
        renderMessages();
        window.setTimeout(resumeCreativeGenerationPolls, 0);
        setStatus(targetRuntime.busy
            ? t('Conversation switched. The reply is still running.', '已切换对话，原回复仍在运行。')
            : t('Conversation switched.', '已切换对话。'));
    }

    function startNewConversation() {
        ensureConversationCatalogLoaded();
        const autoplayActive = ['running', 'paused'].includes(normalizeRoleplayAutoplayState(state.roleplayAutoplayState).phase);
        if (!state.messages.length && !state.pendingImages.length && !state.busy && !autoplayActive) {
            setStatus(t('This conversation is already empty.', '当前对话已经是空的。'));
            return;
        }
        syncCurrentRuntimeFromState();
        stopRoleplayAutoplayRuntime(currentConversationRuntime());
        saveConversationSnapshot();
        const current = currentConversationRuntime();
        const runtime = createEmptyConversationRuntime(current);
        state.conversationRuntimes.set(runtime.conversationId, runtime);
        applyConversationRuntime(runtime);
        state.creativePreference = normalizeCreativePreference(null);
        state.persistenceRestored = true;
        state.persistenceDirty = false;
        saveConversationSnapshot();
        const modal = document.getElementById('describe_vlm_chat_modal');
        syncChatSettingsControls(modal);
        syncBusyControls(modal);
        renderPendingImages();
        renderMessages();
        setStatus(t('New conversation started.', '已新建对话。'));
    }

    function deleteConversation(conversationId) {
        ensureConversationCatalogLoaded();
        const id = String(conversationId || '').trim();
        const index = state.conversationCatalog.findIndex(
            (item) => String(item?.conversation_id || '').trim() === id
        );
        if (!id || index < 0) return;

        const isCurrent = id === state.conversationId;
        const runtime = state.conversationRuntimes.get(id);
        const nextRecord = state.conversationCatalog[index + 1] || state.conversationCatalog[index - 1] || null;
        let requestId = String(runtime?.activeRequestId || '');
        if (isCurrent) {
            stopActiveConversationWork();
        } else if (runtime) {
            runtime.deleted = true;
            runtime.requestToken += 1;
            stopRoleplayAutoplayRuntime(runtime);
            abortActiveChatRequest(runtime);
            abortCreativeDirectorRequest(true, runtime);
            stopCreativePolls(runtime);
        }
        const currentRuntime = isCurrent ? currentConversationRuntime() : null;
        if (runtime) runtime.deleted = true;
        removeConversationRecord(id, false);
        state.conversationRuntimes.delete(id);

        if (isCurrent) {
            if (nextRecord) {
                const nextRuntime = ensureConversationRuntime(nextRecord.conversation_id, nextRecord);
                applyConversationRuntime(nextRuntime);
            } else {
                const blankRuntime = createEmptyConversationRuntime(currentRuntime || state);
                state.conversationRuntimes.set(blankRuntime.conversationId, blankRuntime);
                applyConversationRuntime(blankRuntime);
            }
            state.persistenceRestored = true;
            state.persistenceDirty = false;
            state.conversationCatalogActiveId = state.conversationId;
            persistConversationCatalog();
            const modal = document.getElementById('describe_vlm_chat_modal');
            syncChatSettingsControls(modal);
            syncBusyControls(modal);
            renderPendingImages();
            renderMessages();
            setStatus(nextRecord
                ? t('Conversation deleted. Switched to another conversation.', '对话已删除，已切换到另一个对话。')
                : t('Conversation deleted.', '对话已删除。'));
        } else {
            persistConversationCatalog();
            syncConversationControls(document.getElementById('describe_vlm_chat_modal'));
            setStatus(t('Conversation deleted.', '对话已删除。'));
        }
        postJson('/describe-image/vlm-chat-clear', {
            conversation_id: id,
            clear_context: true
        }).catch(() => {});
        if (requestId) notifyBackendChatCancel(id, requestId).catch(() => {});
    }

    async function clearConversation() {
        const previousConversationId = state.conversationId;
        stopActiveConversationWork();
        const runtime = currentConversationRuntime();
        const index = state.conversationCatalog.findIndex(
            (item) => String(item?.conversation_id || '').trim() === String(previousConversationId || '').trim()
        );
        const nextRecord = index >= 0
            ? state.conversationCatalog[index + 1] || state.conversationCatalog[index - 1] || null
            : null;
        runtime.messages = [];
        runtime.pendingImages = [];
        runtime.roleplaySession = normalizeRoleplaySession(null, previousConversationId);
        runtime.roleplayBranches = [];
        delete runtime.roleplayReferenceDraft;
        runtime.creativePreference = normalizeCreativePreference(null);
        runtime.creativePreferenceExpanded = normalizeChatMode(runtime.chatMode) === 'creative';
        runtime.creativeInitiative = normalizeCreativeInitiative(null);
        runtime.conversationId = previousConversationId || uid('describe_vlm_chat');
        runtime.persistenceDirty = false;
        removeConversationRecord(previousConversationId, false);
        if (nextRecord) {
            runtime.deleted = true;
            state.conversationRuntimes.delete(previousConversationId);
            const nextRuntime = ensureConversationRuntime(nextRecord.conversation_id, nextRecord);
            applyConversationRuntime(nextRuntime);
        } else {
            runtime.deleted = false;
            state.conversationRuntimes.set(runtime.conversationId, runtime);
            applyConversationRuntime(runtime);
        }
        state.persistenceRestored = true;
        state.persistenceDirty = false;
        state.conversationCatalogActiveId = state.conversationId;
        persistConversationCatalog();
        const modal = document.getElementById('describe_vlm_chat_modal');
        syncChatSettingsControls(modal);
        syncBusyControls(modal);
        renderPendingImages();
        renderMessages();
        setStatus(nextRecord
            ? t('Chat cleared. Switched to another conversation.', '对话已清空，已切换到另一个对话。')
            : '');
        if (!previousConversationId) return;
        const response = await postJson('/describe-image/vlm-chat-clear', {
            conversation_id: previousConversationId,
            clear_context: true
        });
        if (!response?.ok) {
            setStatus(t('Chat cleared locally; backend context clear failed.', '已清空本地对话；后端上下文清理失败。'), true);
        }
    }

    function confirmClearConversation() {
        return window.confirm(t('Clear the current chat? This cannot be undone.', '确认清理当前对话？此操作无法撤销。'));
    }

    function confirmDeleteConversation() {
        return window.confirm(t('Delete this conversation? This cannot be undone.', '确认删除这个对话？此操作无法撤销。'));
    }

    function positionOpenButton(host, textarea, anchorHost) {
        if (!host || !textarea || !anchorHost) return;
        const textareaBox = textarea.getBoundingClientRect();
        const anchorBox = anchorHost.getBoundingClientRect();
        if (!textareaBox.width || !textareaBox.height || !anchorBox.width || !anchorBox.height) return;
        const baseRight = Math.max(0, anchorBox.right - textareaBox.right);
        const baseY = Math.max(0, textareaBox.top - anchorBox.top + textareaBox.height / 2);
        host.style.setProperty('--describe-vlm-chat-button-base-right', `${baseRight}px`);
        host.style.setProperty('--describe-vlm-chat-button-base-y', `${baseY}px`);
    }

    function isCardOpenButton(host) {
        return !!(
            host?.classList?.contains('describe-vlm-chat-entry-card') ||
            host?.querySelector?.('.describe-vlm-chat-entry-wide')
        );
    }

    function anchorOpenButton() {
        const host = root().querySelector('#describe_vlm_chat_button');
        if (!host) return false;
        if (isCardOpenButton(host)) {
            host.classList.add('is-describe-chat-card');
            host.classList.remove('is-describe-prompt-anchored');
            host.style.removeProperty('--describe-vlm-chat-button-base-right');
            host.style.removeProperty('--describe-vlm-chat-button-base-y');
            root().querySelectorAll('#describe_prompt .describe-vlm-chat-anchor-host').forEach((node) => {
                node.classList.remove('describe-vlm-chat-anchor-host');
            });
            return true;
        }
        const promptHost = root().querySelector('#describe_prompt');
        if (!promptHost) return false;
        const textarea = promptHost.querySelector('textarea');
        const anchorHost = textarea?.parentElement || promptHost;
        if (host.parentElement !== anchorHost) {
            anchorHost.appendChild(host);
        }
        promptHost.querySelectorAll('.describe-vlm-chat-anchor-host').forEach((node) => {
            if (node !== anchorHost) node.classList.remove('describe-vlm-chat-anchor-host');
        });
        anchorHost.classList.add('describe-vlm-chat-anchor-host');
        host.classList.add('is-describe-prompt-anchored');
        positionOpenButton(host, textarea, anchorHost);
        return true;
    }

    function setStatus(message, isError) {
        const modal = ensureModal();
        const status = modal.querySelector('[data-describe-vlm-chat-status]');
        if (!status) return;
        status.classList.remove('is-actionable');
        status.textContent = message || '';
        status.classList.toggle('is-error', !!isError);
        if (!message) state.missingVlmModelRequest = null;
    }

    function syncBusyControls(modal) {
        const targetModal = modal || document.getElementById('describe_vlm_chat_modal');
        if (!targetModal) return;
        const send = targetModal.querySelector('[data-describe-vlm-chat-send]');
        const stop = targetModal.querySelector('[data-describe-vlm-chat-stop]');
        if (send) {
            send.disabled = !!state.busy;
            send.classList.toggle('is-busy', !!state.busy);
            send.setAttribute('aria-disabled', state.busy ? 'true' : 'false');
        }
        if (stop) {
            stop.hidden = !state.busy;
            stop.disabled = !state.busy;
            stop.setAttribute('aria-hidden', state.busy ? 'false' : 'true');
        }
    }

    function abortActiveChatRequest(runtime = currentConversationRuntime()) {
        const controller = runtime.activeAbortController;
        runtime.activeAbortController = null;
        runtime.activeRequestId = '';
        if (isCurrentConversationRuntime(runtime)) {
            state.activeAbortController = null;
            state.activeRequestId = '';
        }
        try {
            controller?.abort?.();
        } catch (err) {}
    }

    function replacePendingAssistant(content, messages = state.messages) {
        const pendingIndex = messages.findIndex((item) => item.pending);
        if (pendingIndex < 0) return false;
        const assistant = { role: 'assistant', content };
        messages[pendingIndex] = assistant;
        return true;
    }

    function abortCreativeDirectorRequest(notifyBackend = false, runtime = currentConversationRuntime()) {
        const controller = runtime.creativeDirectorAbortController;
        const requestId = runtime.creativeDirectorRequestId;
        runtime.creativeDirectorAbortController = null;
        runtime.creativeDirectorRequestId = '';
        runtime.creativeDirectorBusy = false;
        if (isCurrentConversationRuntime(runtime)) {
            state.creativeDirectorAbortController = null;
            state.creativeDirectorRequestId = '';
            state.creativeDirectorBusy = false;
        }
        try {
            controller?.abort?.();
        } catch (err) {}
        if (notifyBackend && requestId) {
            notifyBackendChatCancel(runtime.conversationId, requestId).catch(() => {});
        }
    }

    function setCreativeInitiativeMode(value) {
        const mode = String(value || '').trim().toLowerCase() === 'responsive' ? 'responsive' : 'proactive';
        state.creativeInitiative = normalizeCreativeInitiative(Object.assign({}, state.creativeInitiative, { mode }));
        if (mode === 'responsive') abortCreativeDirectorRequest(true);
        state.persistenceDirty = true;
        saveConversationSnapshot();
        renderMessages();
        setStatus(mode === 'proactive'
            ? localText('Agent may suggest images for important scenes.', 'Agent 会在重要场景主动提议画面。')
            : localText('Images are proposed only when requested.', '仅在你提出生图需求时显示方案。'));
    }

    async function notifyBackendChatCancel(conversationId, requestId) {
        const normalizedRequestId = String(requestId || '').trim();
        if (!normalizedRequestId) return;
        await postJson('/describe-image/vlm-chat-cancel', {
            conversation_id: conversationId || '',
            request_id: normalizedRequestId
        });
    }

    async function stopCurrentChatReply(options = {}) {
        const runtime = syncCurrentRuntimeFromState();
        if (!runtime.busy && !runtime.activeAbortController && !runtime.activeRequestId) return false;
        const conversationId = runtime.conversationId;
        const requestId = runtime.activeRequestId;
        runtime.requestToken += 1;
        runtime.busy = false;
        abortActiveChatRequest(runtime);
        applyConversationRuntime(runtime);
        if (!options?.silent) {
            replacePendingAssistant(t('Stopped.', '已停止。'), runtime.messages);
            setStatus(t('Reply stopped.', '已停止当前回复。'));
        }
        syncBusyControls(document.getElementById('describe_vlm_chat_modal'));
        renderMessages();
        notifyBackendChatCancel(conversationId, requestId).catch(() => {});
        return true;
    }

    function imageUploadBytes(image) {
        const declared = Number(image?.wire_size);
        if (Number.isFinite(declared) && declared > 0) return Math.round(declared);
        const dataUrl = String(image?.data_url || '');
        return dataUrl ? dataUrl.length : 0;
    }

    function totalImageUploadBytes(images) {
        return (Array.isArray(images) ? images : []).reduce((total, image) => total + imageUploadBytes(image), 0);
    }

    function formatByteSize(value) {
        const bytes = Math.max(0, Number(value) || 0);
        if (bytes < 1024) return `${Math.round(bytes)} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 100 * 1024 ? 1 : 0)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 2 : 1)} MB`;
    }

    function imageUploadStatus(images, completed = false) {
        const rows = Array.isArray(images) ? images : [];
        const count = rows.length;
        const size = formatByteSize(totalImageUploadBytes(rows));
        const hasVideo = rows.some((item) => mediaKind(item) === 'video');
        const template = hasVideo
            ? (completed
                ? t('Uploaded {count} media file(s), about {size}.', '已上传 {count} 个媒体文件，约 {size}。')
                : t('Estimated media upload: {count} file(s), about {size}.', '预计媒体上传：{count} 个文件，约 {size}。'))
            : (completed
                ? t('Uploaded {count} image(s), about {size}.', '已上传 {count} 张图片，约 {size}。')
                : t('Estimated image upload: {count} image(s), about {size}.', '预计图片上传：{count} 张，约 {size}。'));
        return template.replace('{count}', String(count)).replace('{size}', size);
    }

    function consumeSentComposerState(input, inputSnapshot, sentPendingImages, runtime = currentConversationRuntime()) {
        // Current UI mirror: state.pendingImages.filter
        if (isCurrentConversationRuntime(runtime) && input && String(input.value || '') === inputSnapshot) input.value = '';
        const sentObjects = new Set(Array.isArray(sentPendingImages) ? sentPendingImages : []);
        const sentIds = new Set(Array.from(sentObjects).map(image => String(image?.id || '')).filter(Boolean));
        runtime.pendingImages = (Array.isArray(runtime.pendingImages) ? runtime.pendingImages : []).filter((image) => {
            if (sentObjects.has(image)) return false;
            const id = String(image?.id || '');
            return !id || !sentIds.has(id);
        });
        if (isCurrentConversationRuntime(runtime)) {
            state.pendingImages = runtime.pendingImages;
            renderPendingImages();
        }
    }

    function imageSummary(image) {
        return {
            name: image?.name || (mediaKind(image) === 'video' ? 'video' : 'image'),
            width: image?.width || null,
            height: image?.height || null,
            size: image?.size || null,
            wire_size: imageUploadBytes(image) || null,
            mime: image?.mime || '',
            thumb: image?.thumb || ONE_PIXEL_IMAGE,
            preview_url: mediaKind(image) === 'video' ? String(image?.data_url || '') : '',
            placeholder: true
        };
    }

    function renderImageChips(images, removable) {
        const rows = Array.isArray(images) ? images : [];
        if (!rows.length) return '';
        return `<div class="describe-vlm-chat-image-chips">${rows.map((image, index) => {
            const size = image?.width && image?.height ? ` ${Number(image.width)}x${Number(image.height)}` : '';
            const uploadBytes = imageUploadBytes(image);
            const upload = uploadBytes ? ` · ↑${formatByteSize(uploadBytes)}` : '';
            const video = mediaKind(image) === 'video';
            const label = `${image?.name || (video ? t('Video', '视频') : t('Image', '图片'))}${size}${upload}`;
            return `<span class="describe-vlm-chat-image-chip">
  ${video ? '<i class="fa-solid fa-film" aria-hidden="true"></i>' : `<img src="${escapeHtml(image?.thumb || ONE_PIXEL_IMAGE)}" alt="">`}
  <span>${escapeHtml(label)}</span>
  ${removable ? `<button type="button" data-describe-vlm-chat-remove-image="${index}" title="${escapeHtml(t('Remove', '移除'))}" aria-label="${escapeHtml(t('Remove', '移除'))}"><i class="fa-solid fa-xmark"></i></button>` : ''}
</span>`;
        }).join('')}</div>`;
    }

    function renderMessageImages(images, mediaAssets = []) {
        const rows = Array.isArray(images) ? images : [];
        if (!rows.length) return '';
        return `<div class="describe-vlm-chat-message-images">${rows.map((image, index) => {
            const video = mediaKind(image) === 'video';
            const source = String(image?.thumb || '').trim() || ONE_PIXEL_IMAGE;
            const dimensions = image?.width && image?.height ? `, ${Number(image.width)}x${Number(image.height)}` : '';
            const label = video
                ? localText(`Attached video ${index + 1}${dimensions}`, `附加视频 ${index + 1}${dimensions}`)
                : localText(`Attached image ${index + 1}${dimensions}`, `附图 ${index + 1}${dimensions}`);
            if (video) {
                const persistedAsset = Array.isArray(mediaAssets) ? mediaAssets[index]?.asset : null;
                const preview = String(image?.preview_url || '').trim() || persistedMediaAssetSource(persistedAsset);
                return preview
                    ? `<video src="${escapeHtml(creativeAssetUrl(preview))}" aria-label="${escapeHtml(label)}" controls preload="metadata" playsinline></video>`
                    : `<span class="describe-vlm-chat-message-video-placeholder"><i class="fa-solid fa-film"></i><span>${escapeHtml(image?.name || label)}</span></span>`;
            }
            return `<img src="${escapeHtml(source)}" alt="${escapeHtml(label)}" loading="lazy">`;
        }).join('')}</div>`;
    }

    function composerTextForMessage(message) {
        let content = String(message?.content || '').trim();
        const actionPrompts = Array.isArray(message?.actions)
            ? message.actions.map((action) => String(action?.prompt || '').trim()).filter(Boolean)
            : [];
        if (actionPrompts.length) {
            content = `${content}${content ? '\n' : ''}${localText('Prepared prompt', '整理出的提示词')}:\n${actionPrompts.join('\n\n')}`.trim();
        }
        return content;
    }

    function chatMessageText(message) {
        return composerTextForMessage(message);
    }

    function focusChatInput(selectText = false) {
        const input = ensureModal().querySelector('[data-describe-vlm-chat-input]');
        if (!input) return false;
        input.focus();
        const end = String(input.value || '').length;
        try {
            input.setSelectionRange(selectText ? 0 : end, end);
        } catch (err) {
            // Some embedded browsers can reject selection while the textarea is rerendering.
        }
        return true;
    }

    function setChatInputValue(value, selectText = false) {
        const input = ensureModal().querySelector('[data-describe-vlm-chat-input]');
        if (!input) return false;
        input.value = String(value || '');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        focusChatInput(selectText);
        return true;
    }

    function importMainPromptToChatInput() {
        const prompt = readComponentValue('positive_prompt').trim();
        if (!prompt) {
            setStatus(t('Main prompt is empty.', '主提示词为空。'), true);
            return;
        }
        const modal = ensureModal();
        const input = modal.querySelector('[data-describe-vlm-chat-input]');
        const current = String(input?.value || '').trimEnd();
        const label = t('Current main prompt', '当前主提示词');
        const block = `${label}:\n${prompt}`;
        const next = current ? `${current}\n\n${block}` : block;
        if (setChatInputValue(next, false)) {
            setStatus(t('Main prompt imported to input.', '主提示词已导入输入框。'));
        }
    }

    function resetConversationAfterContextEdit() {
        const previousConversationId = state.conversationId;
        state.requestToken += 1;
        state.busy = false;
        abortCreativeDirectorRequest(true);
        if (previousConversationId) {
            postJson('/describe-image/vlm-chat-clear', {
                conversation_id: previousConversationId,
                clear_context: true
            }).catch(() => {});
        }
    }

    function activeRoleplayMessageVariant(message) {
        const variants = roleplayMessageVariants(message);
        if (!variants.length) return null;
        const index = Math.max(0, Math.min(variants.length - 1, Number(message?.active_variant_index) || 0));
        return variants[index] || variants[variants.length - 1];
    }

    function roleplaySessionBeforeMessage(message, conversationId = '') {
        const variant = activeRoleplayMessageVariant(message);
        const snapshot = variant?.roleplay_session_before
            || message?.roleplay_session_before
            || message?.session_before;
        return snapshot && typeof snapshot === 'object'
            ? normalizeRoleplaySession(snapshot, conversationId)
            : null;
    }

    function roleplaySessionAfterMessage(message, conversationId = '') {
        const variant = activeRoleplayMessageVariant(message);
        const snapshot = variant?.roleplay_session_after
            || message?.roleplay_session_after
            || message?.session_after;
        return snapshot && typeof snapshot === 'object'
            ? normalizeRoleplaySession(snapshot, conversationId)
            : null;
    }

    function roleplaySessionBeforeContextEdit(runtime, messageIndex) {
        const target = runtime || currentConversationRuntime();
        const messages = Array.isArray(target?.messages) ? target.messages : [];
        const index = Number(messageIndex);
        if (!Number.isInteger(index) || index < 0 || index >= messages.length) return null;
        const selected = messages[index];
        const conversationId = target.conversationId;
        const direct = roleplaySessionBeforeMessage(selected, conversationId);
        if (selected?.role === 'assistant' && direct) return direct;

        if (selected?.role === 'user') {
            for (let cursor = index + 1; cursor < messages.length; cursor += 1) {
                const next = messages[cursor];
                if (next?.pending || next?.role !== 'assistant') continue;
                const before = roleplaySessionBeforeMessage(next, conversationId);
                if (before) return before;
                break;
            }
        }

        for (let cursor = Math.min(index - 1, messages.length - 1); cursor >= 0; cursor -= 1) {
            const previous = messages[cursor];
            if (previous?.pending || previous?.role !== 'assistant') continue;
            const after = roleplaySessionAfterMessage(previous, conversationId);
            if (after) return after;
        }
        return direct;
    }

    function startRoleplayEditBranch(runtime = currentConversationRuntime(), turnId = '', options = {}) {
        if (normalizeChatMode(runtime?.chatMode) !== 'roleplay') return '';
        const session = normalizeRoleplaySession(runtime.roleplaySession, runtime.conversationId);
        const previousBranch = String(session.active_branch_id || 'main');
        preserveRoleplayBranchBeforeMutation(runtime, {
            branch_id: previousBranch,
            reason: 'context_edit',
            fork_turn_id: turnId
        });
        const nextBranch = uid('roleplay_branch');
        const restoredSession = options.session_snapshot && typeof options.session_snapshot === 'object'
            ? normalizeRoleplaySession(options.session_snapshot, runtime.conversationId)
            : session;
        runtime.roleplaySession = normalizeRoleplaySession(Object.assign({}, restoredSession, {
            active_branch_id: nextBranch,
            active_turn_id: String(turnId || '').slice(0, 200)
        }), runtime.conversationId);
        upsertRoleplayBranchSnapshot(runtime, {
            branch_id: nextBranch,
            parent_branch_id: previousBranch,
            reason: 'context_edit',
            fork_turn_id: turnId
        });
        runtime.persistenceDirty = true;
        if (isCurrentConversationRuntime(runtime)) state.roleplaySession = runtime.roleplaySession;
        persistRoleplayBranchRemote(runtime, nextBranch).catch(() => {});
        setConversationStatus(runtime, localText(
            `New story branch created from ${previousBranch}.`,
            `已从 ${previousBranch} 创建新的剧情分支。`
        ));
        return nextBranch;
    }

    async function writeClipboardText(value) {
        const text = String(value || '');
        if (!text) return false;
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            try {
                await navigator.clipboard.writeText(text);
                return true;
            } catch (err) {}
        }
        const textarea = document.createElement('textarea');
        const previousFocus = document.activeElement;
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        textarea.style.top = '0';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        let copied = false;
        try {
            copied = document.execCommand('copy');
        } catch (err) {}
        textarea.remove();
        try {
            previousFocus?.focus?.();
        } catch (err) {}
        return copied;
    }

    async function copyChatMessage(messageIndex) {
        const message = state.messages[Number(messageIndex)];
        const text = chatMessageText(message);
        if (!text.trim()) {
            setStatus(t('No message text to copy.', '没有可复制的消息文本。'), true);
            return;
        }
        const copied = await writeClipboardText(text);
        setStatus(
            copied ? t('Message copied.', '消息已复制。') : t('Copy failed.', '复制失败。'),
            !copied
        );
    }

    function composerImageIdentity(image) {
        return String(image?.key || image?.id || image?.data_url || '').trim();
    }

    function mergeComposerImages(existing, incoming) {
        const merged = [];
        const seen = new Set();
        [...(Array.isArray(existing) ? existing : []), ...(Array.isArray(incoming) ? incoming : [])].forEach((image) => {
            if (!image || !['image', 'video'].includes(mediaKind(image)) || !image.data_url) return;
            const identity = composerImageIdentity(image);
            if (identity && seen.has(identity)) return;
            if (identity) seen.add(identity);
            merged.push(image);
        });
        return merged.slice(-MAX_ATTACHMENTS);
    }

    function persistedMediaAssetSource(asset) {
        const direct = creativeAssetUrl(asset?.preview_url || asset?.data_url);
        if (direct) return direct;
        const path = String(asset?.path || asset?.output_path || '').trim();
        if (!path) return '';
        const encodedPath = encodeURI(path.replace(/\\/g, '/')).replace(/\?/g, '%3F').replace(/#/g, '%23');
        return `/gradio_api/file=${encodedPath}`;
    }

    async function persistedMediaInputPayload(input, index = 0) {
        const normalized = normalizeChatMediaInput(input, index);
        const asset = normalized?.asset;
        const source = persistedMediaAssetSource(asset);
        if (!asset || !source) return null;
        if (/^data:image\//i.test(source)) {
            return imagePayloadFromDataUrl(source, {
                id: uid('describe_message_ref'),
                name: normalized.name || asset.name || `message-image-${index + 1}.png`,
                mime: asset.mime || imageMimeFromDataUrl(source),
                width: asset.width,
                height: asset.height,
                key: `message-media:${asset.asset_id || normalized.ref || index}`
            });
        }
        if (/^data:video\//i.test(source)) {
            return {
                id: uid('describe_message_ref'),
                name: normalized.name || asset.name || `message-video-${index + 1}.mp4`,
                mime: asset.mime || 'video/mp4',
                media_type: 'video',
                width: asset.width || null,
                height: asset.height || null,
                size: dataUrlBinarySize(source),
                wire_size: source.length,
                original_size: asset.size || null,
                data_url: source,
                thumb: '',
                key: `message-media:${asset.asset_id || normalized.ref || index}`
            };
        }
        const response = await fetch(source, { credentials: 'same-origin' });
        if (!response.ok) throw new Error(`image fetch failed: ${response.status}`);
        const blob = await response.blob();
        const mime = String(blob.type || asset.mime || 'image/png').toLowerCase();
        const dataUrl = await blobToDataUrl(blob);
        if (mime.startsWith('video/')) {
            return {
                id: uid('describe_message_ref'),
                name: normalized.name || asset.name || `message-video-${index + 1}.mp4`,
                mime,
                media_type: 'video',
                width: asset.width || null,
                height: asset.height || null,
                size: blob.size || dataUrlBinarySize(dataUrl),
                wire_size: dataUrl.length,
                original_size: blob.size || null,
                data_url: dataUrl,
                thumb: '',
                key: `message-media:${asset.asset_id || normalized.ref || source}`
            };
        }
        if (!mime.startsWith('image/')) return null;
        return imagePayloadFromDataUrl(dataUrl, {
            id: uid('describe_message_ref'),
            name: normalized.name || asset.name || `message-image-${index + 1}.png`,
            mime,
            originalSize: blob.size || null,
            key: `message-media:${asset.asset_id || normalized.ref || source}`
        });
    }

    async function messageImagePayloadsForComposer(message) {
        const runtimePayloads = (Array.isArray(message?._image_payloads) ? message._image_payloads : [])
            .filter((image) => ['image', 'video'].includes(mediaKind(image)) && image?.data_url)
            .slice(0, MAX_ATTACHMENTS);
        if (runtimePayloads.length) return runtimePayloads;

        const restoredAssets = [];
        const mediaAssets = Array.isArray(message?.media_assets) ? message.media_assets : [];
        for (let index = 0; index < mediaAssets.length && restoredAssets.length < MAX_ATTACHMENTS; index += 1) {
            try {
                const payload = await persistedMediaInputPayload(mediaAssets[index], index);
                if (payload) restoredAssets.push(payload);
            } catch (err) {}
        }
        if (restoredAssets.length) return restoredAssets;

        const restoredThumbs = [];
        const summaries = Array.isArray(message?.images) ? message.images : [];
        for (let index = 0; index < summaries.length && restoredThumbs.length < MAX_ATTACHMENTS; index += 1) {
            const summary = summaries[index];
            const thumb = String(summary?.thumb || '').trim();
            if (mediaKind(summary) !== 'image' || !thumb || thumb === ONE_PIXEL_IMAGE) continue;
            restoredThumbs.push(await imagePayloadFromDataUrl(thumb, {
                id: uid('describe_message_ref'),
                name: summary.name || `message-image-${index + 1}.jpg`,
                mime: summary.mime || imageMimeFromDataUrl(thumb),
                width: summary.width,
                height: summary.height,
                key: `message-thumb:${String(message?.id || '')}:${index}`
            }));
        }
        return restoredThumbs;
    }

    async function quoteChatMessage(messageIndex) {
        const message = state.messages[Number(messageIndex)];
        const text = composerTextForMessage(message);
        const restoredImages = await messageImagePayloadsForComposer(message);
        if (!text.trim() && !restoredImages.length) {
            setStatus(t('No message content to quote.', '没有可引用的消息内容。'), true);
            return;
        }
        const modal = ensureModal();
        const input = modal.querySelector('[data-describe-vlm-chat-input]');
        const current = String(input?.value || '');
        const quote = text ? `> ${text.replace(/\n/g, '\n> ')}\n\n` : '';
        state.pendingImages = mergeComposerImages(state.pendingImages, restoredImages);
        renderPendingImages();
        if (setChatInputValue(`${quote}${current}`, false)) {
            setStatus(restoredImages.length
                ? t('Message and images quoted to input.', '消息和图片已引用到输入框。')
                : t('Message quoted to input.', '已引用到输入框。'));
        }
    }

    async function rollbackChatToMessage(messageIndex) {
        const index = Number(messageIndex);
        if (!Number.isInteger(index) || index < 0 || index >= state.messages.length) return;
        const runtime = syncCurrentRuntimeFromState();
        const message = runtime.messages[index];
        if (message?.pending || runtime.busy || activeCreativeRunIds(runtime.messages.slice(index)).length) {
            setStatus(t('Wait for the active response before editing context.', '请等待当前回复结束后再编辑上下文。'), true);
            return;
        }
        const draft = composerTextForMessage(message);
        const restoredImages = await messageImagePayloadsForComposer(message);
        if (runtime.messages[index] !== message || runtime.busy || activeCreativeRunIds(runtime.messages.slice(index)).length) {
            setStatus(t('The conversation changed while restoring this message.', '恢复消息期间对话已发生变化。'), true);
            return;
        }
        const roleplay = normalizeChatMode(runtime.chatMode) === 'roleplay';
        const roleplaySnapshot = roleplay
            ? roleplaySessionBeforeContextEdit(runtime, index)
            : null;
        if (roleplay && message?.role === 'assistant' && !roleplaySnapshot) {
            setStatus(t(
                'This roleplay reply has no recoverable story state.',
                '这条角色扮演回复没有可恢复的剧情状态。'
            ), true);
            return;
        }
        if (roleplay) {
            startRoleplayEditBranch(runtime, message?.id || `message-${index}`, {
                session_snapshot: roleplaySnapshot
            });
        }
        runtime.messages = runtime.messages.slice(0, index).filter((item) => !item?.pending);
        runtime.pendingImages = restoredImages.slice(0, MAX_ATTACHMENTS);
        runtime.persistenceDirty = true;
        applyConversationRuntime(runtime);
        resetConversationAfterContextEdit();
        setStatus(restoredImages.length
            ? t('Message and images moved back to input.', '消息和图片已回到输入框。')
            : t('Message moved back to input.', '消息已回到输入框。'));
        renderMessages();
        renderPendingImages();
        saveConversationSnapshot(runtime);
        setChatInputValue(draft, true);
    }

    function deleteChatMessage(messageIndex) {
        const index = Number(messageIndex);
        if (!Number.isInteger(index) || index < 0 || index >= state.messages.length) return;
        const runtime = syncCurrentRuntimeFromState();
        const message = runtime.messages[index];
        if (message?.pending || runtime.busy || activeCreativeRunIds(runtime.messages.slice(index)).length) {
            setStatus(t('Wait for the active response before editing context.', '请等待当前回复结束后再编辑上下文。'), true);
            return;
        }
        const roleplay = normalizeChatMode(runtime.chatMode) === 'roleplay';
        const roleplaySnapshot = roleplay
            ? roleplaySessionBeforeContextEdit(runtime, index)
            : null;
        if (roleplay && message?.role === 'assistant' && !roleplaySnapshot) {
            setStatus(t(
                'This roleplay reply has no recoverable story state.',
                '这条角色扮演回复没有可恢复的剧情状态。'
            ), true);
            return;
        }
        if (roleplay) {
            startRoleplayEditBranch(runtime, message?.id || `message-${index}`, {
                session_snapshot: roleplaySnapshot
            });
            runtime.messages = runtime.messages.slice(0, index).filter((item) => !item?.pending);
        } else {
            runtime.messages.splice(index, 1);
        }
        runtime.persistenceDirty = true;
        applyConversationRuntime(runtime);
        resetConversationAfterContextEdit();
        setStatus(roleplay
            ? t('Message and dependent story turns deleted from context.', '消息及依赖它的后续剧情已从当前分支删除。')
            : t('Message deleted from context.', '消息已从上下文删除。'));
        renderMessages();
        saveConversationSnapshot(runtime);
    }

    function roleplayMessageVariants(message) {
        if (!Array.isArray(message?.variants)) return [];
        return message.variants.map((variant, index) => normalizeRoleplayMessageVariant(variant, index)).filter(Boolean);
    }

    async function regenerateRoleplayMessage(messageIndex) {
        const index = Number(messageIndex);
        if (!Number.isInteger(index) || index < 1 || index >= state.messages.length) return false;
        const runtime = syncCurrentRuntimeFromState();
        const message = runtime.messages[index];
        const userMessage = runtime.messages[index - 1];
        if (
            normalizeChatMode(runtime.chatMode) !== 'roleplay'
            || message?.role !== 'assistant'
            || userMessage?.role !== 'user'
            || runtime.busy
            || activeCreativeRunIds(runtime.messages.slice(index)).length
        ) {
            setConversationStatus(runtime, localText(
                'Wait for the current reply before creating another version.',
                '请等待当前回复结束后再生成新版本。'
            ), true);
            return false;
        }
        const variants = roleplayMessageVariants(message);
        const currentVariant = variants[Math.max(0, Math.min(variants.length - 1, Number(message.active_variant_index) || 0))];
        if (!currentVariant?.roleplay_session_before) {
            setConversationStatus(runtime, localText(
                'This reply has no recoverable story state.',
                '这条回复没有可恢复的剧情状态。'
            ), true);
            return false;
        }
        const nextBranch = uid('roleplay_branch');
        preserveRoleplayBranchBeforeMutation(runtime, {
            branch_id: runtime.roleplaySession?.active_branch_id || 'main',
            reason: 'reply_regenerate',
            fork_turn_id: currentVariant.turn_id || message.id
        });
        runtime.roleplaySession = normalizeRoleplaySession(Object.assign({}, currentVariant.roleplay_session_before, {
            active_branch_id: nextBranch,
            active_turn_id: currentVariant.turn_id || message.id
        }), runtime.conversationId);
        upsertRoleplayBranchSnapshot(runtime, {
            branch_id: nextBranch,
            parent_branch_id: currentVariant.branch_id || currentVariant.roleplay_session_before?.active_branch_id || 'main',
            reason: 'reply_regenerate',
            fork_turn_id: currentVariant.turn_id || message.id
        });
        runtime.messages = runtime.messages.slice(0, index);
        runtime.persistenceDirty = true;
        persistRoleplayBranchRemote(runtime, nextBranch).catch(() => {});
        applyConversationRuntime(runtime);
        state.roleplaySession = runtime.roleplaySession;
        saveConversationSnapshot(runtime);
        renderMessages();
        setConversationStatus(runtime, localText(
            'Generating another reply version...',
            '正在生成另一条回复版本……'
        ));
        return sendMessage({
            messageOverride: String(userMessage.content || ''),
            replayExistingUserMessage: true,
            roleplayRequestKind: 'character',
            roleplayAutoplay: false,
            runtime,
            variantHistory: variants
        });
    }

    function switchRoleplayReplyVariant(messageIndex, direction = 1) {
        const index = Number(messageIndex);
        if (!Number.isInteger(index) || index < 0 || index >= state.messages.length) return false;
        const runtime = syncCurrentRuntimeFromState();
        const message = runtime.messages[index];
        const variants = roleplayMessageVariants(message);
        if (normalizeChatMode(runtime.chatMode) !== 'roleplay' || variants.length < 2) return false;
        if (runtime.busy || activeCreativeRunIds(runtime.messages.slice(index)).length) {
            setConversationStatus(runtime, localText(
                'Wait for active tasks before switching reply versions.',
                '请等待当前任务结束后再切换回复版本。'
            ), true);
            return false;
        }
        const currentIndex = Math.max(0, Math.min(variants.length - 1, Number(message.active_variant_index) || 0));
        const nextIndex = (currentIndex + (Number(direction) < 0 ? -1 : 1) + variants.length) % variants.length;
        if (nextIndex === currentIndex) return false;
        const variant = variants[nextIndex];
        if (!variant.roleplay_session_after) {
            setConversationStatus(runtime, localText(
                'This reply version has no recoverable story state.',
                '这个回复版本没有可恢复的剧情状态。'
            ), true);
            return false;
        }
        preserveRoleplayBranchBeforeMutation(runtime, {
            branch_id: runtime.roleplaySession?.active_branch_id || 'main',
            reason: 'switch_reply_variant',
            fork_turn_id: variant.turn_id || message.id
        });
        runtime.messages = runtime.messages.slice(0, index + 1);
        const liveMessage = runtime.messages[index];
        liveMessage.content = variant.content;
        liveMessage.actions = variant.actions;
        liveMessage.roleplay_state_changes = normalizeRoleplayStateChanges(variant.roleplay_state_changes);
        liveMessage.active_variant_index = nextIndex;
        liveMessage.roleplay_session_after = variant.roleplay_session_after;
        runtime.roleplaySession = normalizeRoleplaySession(variant.roleplay_session_after, runtime.conversationId);
        upsertRoleplayBranchSnapshot(runtime, {
            branch_id: runtime.roleplaySession.active_branch_id || variant.branch_id || 'main',
            reason: 'switch_reply_variant',
            fork_turn_id: variant.turn_id || message.id
        });
        runtime.persistenceDirty = true;
        if (normalizeRoleplayAutoplayState(runtime.roleplayAutoplayState).phase === 'running') {
            updateRoleplayAutoplayState(runtime, {
                phase: 'paused',
                reason: 'switch_reply_variant'
            });
        }
        applyConversationRuntime(runtime);
        saveConversationSnapshot(runtime);
        renderMessages();
        setConversationStatus(runtime, localText(
            `Reply version ${nextIndex + 1} selected.`,
            `已切换到第 ${nextIndex + 1} 个回复版本。`
        ));
        return true;
    }

    function renderPendingImages() {
        const modal = ensureModal();
        const tray = modal.querySelector('[data-describe-vlm-chat-attachments]');
        if (!tray) return;
        if (!state.pendingImages.length) {
            tray.hidden = true;
            tray.innerHTML = '';
            return;
        }
        tray.hidden = false;
        tray.innerHTML = renderImageChips(state.pendingImages.map(imageSummary), true);
    }

    function creativeCanvasApi() {
        const api = window.SimpAICanvasWorkbenchApi;
        return api && typeof api === 'object' ? api : null;
    }

    function creativeUserContext() {
        const params = window.simpleaiTopbarSystemParams && typeof window.simpleaiTopbarSystemParams === 'object'
            ? window.simpleaiTopbarSystemParams
            : {};
        return {
            user_did: String(params.user_did || params.__user_did || ''),
            owner: String(params.owner || params.user_did || params.__user_did || ''),
            scope: String(params.scope || params.access_mode || params.__access_mode || ''),
            nickname: String(params.nickname || params.user_name || '')
        };
    }

    function roleplayReferenceLibraryGroupLabels() {
        return {
            character_reference: localText('Character reference images', '角色设定图'),
            current_appearance: localText('Current appearance images', '当前状态图'),
            scene_reference: localText('Scene reference images', '场景参考图'),
            player_reference: localText('Player reference images', '玩家参考图'),
            project: localText('Other project images', '其他项目图片')
        };
    }

    function roleplayReferenceLibraryOptions(owner, runtime = null) {
        const target = runtime || currentConversationRuntime();
        const selected = new Set(roleplayReferenceDraftIds(target, owner).map(roleplayReferenceIdentity));
        const groups = new Map();
        const groupLabels = roleplayReferenceLibraryGroupLabels();
        state.roleplayReferenceLibrary
            .filter((asset) => String(asset?.mime || '').toLowerCase().startsWith('image/'))
            .slice(0, 300)
            .forEach((asset) => {
                const id = String(asset?.asset_id || '').trim();
                if (!id) return;
                const category = roleplayAssetCategory(asset);
                const usage = roleplayAssetUsage(id, target);
                const groupKey = usage[0]?.key || category.key;
                if (!groups.has(groupKey)) {
                    groups.set(groupKey, {
                        label: groupLabels[groupKey] || category.label,
                        rows: []
                    });
                }
                groups.get(groupKey).rows.push({
                    id,
                    label: roleplayReferenceAssetLabel(id, target),
                    disabled: selected.has(roleplayReferenceIdentity(id))
                });
            });
        const options = [
            '<option value="">' + escapeHtml(localText('Choose an image', '选择图片')) + '</option>'
        ];
        ['character_reference', 'current_appearance', 'scene_reference', 'player_reference', 'project'].forEach((groupKey) => {
            const group = groups.get(groupKey);
            if (!group?.rows?.length) return;
            options.push('<optgroup label="' + escapeHtml(group.label) + '">');
            group.rows.forEach((row) => {
                options.push(
                    '<option value="' + escapeHtml(row.id) + '"' + (row.disabled ? ' disabled' : '') + '>'
                    + escapeHtml(row.label)
                    + '</option>'
                );
            });
            options.push('</optgroup>');
        });
        if (!groups.size) {
            options.push(
                '<option value="" disabled>' + escapeHtml(localText('No project images found', '项目中没有图片')) + '</option>'
            );
        }
        return options.join('');
    }

    function renderRoleplayReferenceLibraryPreview(modal, owner, runtime = null) {
        const preview = modal?.querySelector(
            '[data-describe-vlm-chat-roleplay-reference-library-preview="' + owner + '"]'
        );
        const select = modal?.querySelector(
            '[data-describe-vlm-chat-roleplay-reference-library="' + owner + '"]'
        );
        if (!preview || !select) return;
        const assetId = String(select.value || '').trim();
        const asset = roleplayReferenceLibraryAsset(assetId);
        if (!assetId || !asset) {
            preview.hidden = true;
            preview.innerHTML = '';
            return;
        }
        const src = roleplayReferencePreviewUrl(assetId);
        const label = roleplayReferenceAssetLabel(assetId, runtime);
        const fileName = roleplayAssetFileName(asset);
        const generatedName = /^roleplay_(?:current_appearance|reference_[a-z0-9_-]+)\.image\.[a-f0-9]{8,}\./i.test(fileName);
        const metadata = [
            asset.width && asset.height ? String(asset.width) + ' × ' + String(asset.height) : '',
            roleplayAssetDateLabel(asset),
            generatedName ? '' : fileName
        ].filter(Boolean).join(' · ');
        preview.hidden = false;
        preview.innerHTML = (src
            ? '<img src="' + escapeHtml(src) + '" alt="" loading="lazy">'
            : '<i class="fa-solid fa-image"></i>')
            + '<div><strong>' + escapeHtml(label) + '</strong>'
            + (metadata ? '<small>' + escapeHtml(metadata) + '</small>' : '')
            + '</div>';
    }

    function renderRoleplayReferenceLibraryControls(modal, runtime = null) {
        if (!modal) return;
        ['character', 'player', 'scene'].forEach((owner) => {
            const select = modal.querySelector('[data-describe-vlm-chat-roleplay-reference-library="' + owner + '"]');
            if (select && document.activeElement !== select) {
                select.innerHTML = roleplayReferenceLibraryOptions(owner, runtime);
            }
            renderRoleplayReferenceLibraryPreview(modal, owner, runtime);
        });
    }

    async function loadRoleplayReferenceLibrary(modal = document.getElementById('describe_vlm_chat_modal')) {
        const api = creativeCanvasApi();
        if (!api || typeof api.listAssets !== 'function') {
            renderRoleplayReferenceLibraryControls(modal);
            return [];
        }
        if (state.roleplayReferenceLibraryPromise) return state.roleplayReferenceLibraryPromise;
        state.roleplayReferenceLibraryPromise = api.listAssets({
            project_id: 'describe_vlm_chat',
            include_dimensions: true,
            include_asset_ids: true,
            max_files: 500,
            user_context: creativeUserContext()
        }).then((response) => {
            const loaded = Array.isArray(response?.assets)
                ? response.assets.filter((asset) => String(asset?.mime || '').toLowerCase().startsWith('image/'))
                : [];
            const loadedIds = new Set(loaded.map((asset) => String(asset?.asset_id || '').trim()).filter(Boolean));
            const registered = state.roleplayReferenceLibrary.filter((asset) => {
                const assetId = String(asset?.asset_id || '').trim();
                return assetId && !loadedIds.has(assetId);
            });
            state.roleplayReferenceLibrary = [...loaded, ...registered];
            renderRoleplayReferenceLibraryControls(modal);
            renderRoleplayReferenceLists(modal);
            return state.roleplayReferenceLibrary;
        }).catch(() => {
            renderRoleplayReferenceLibraryControls(modal);
            return state.roleplayReferenceLibrary;
        }).finally(() => {
            state.roleplayReferenceLibraryPromise = null;
        });
        return state.roleplayReferenceLibraryPromise;
    }

    async function materializeRoleplayReferenceAsset(source, owner, runtime, modal, name = '') {
        const api = creativeCanvasApi();
        if (!api || typeof api.materializeAsset !== 'function') throw new Error('Canvas asset service is unavailable');
        const existing = roleplayReferenceDraftIds(runtime, owner);
        const sourceIdentity = roleplayReferenceIdentity(source?.asset_id);
        if (!existing.some((id) => roleplayReferenceIdentity(id) === sourceIdentity) && existing.length >= MAX_ROLEPLAY_REFERENCE_IMAGES) {
            throw new Error(localText('Each reference group allows up to 5 images.', '每组参考图最多 5 张。'));
        }
        const asset = Object.assign({}, source && typeof source === 'object' ? source : {});
        const response = await api.materializeAsset({
            project_id: 'describe_vlm_chat',
            node_id: `roleplay_reference_${owner}`,
            asset_source: {
                node_id: `roleplay_reference_${owner}`,
                asset
            },
            user_context: creativeUserContext()
        });
        const ref = response?.asset_ref && typeof response.asset_ref === 'object' ? response.asset_ref : null;
        const assetId = String(ref?.asset_id || '').trim();
        if (!response?.ok || !assetId) throw new Error(String(response?.error || 'Asset registration failed'));
        const libraryItem = Object.assign({}, asset, ref, {
            asset_id: assetId,
            name: String(name || asset.name || ref?.name || assetId).trim()
        });
        delete libraryItem.data_url;
        state.roleplayReferenceLibrary = [
            libraryItem,
            ...state.roleplayReferenceLibrary.filter((item) => String(item?.asset_id || '') !== assetId)
        ];
        const next = roleplayReferenceDraftIds(runtime, owner);
        if (!next.includes(assetId)) next.push(assetId);
        setRoleplayReferenceDraft(runtime, owner, next);
        renderRoleplayReferenceLists(modal, runtime);
        renderRoleplayReferenceLibraryControls(modal, runtime);
        return assetId;
    }

    async function addRoleplayReferenceFiles(files, owner, modal) {
        const runtime = syncCurrentRuntimeFromState();
        roleplayReferenceDraft(runtime);
        const images = Array.from(files || []).filter((file) => /^image\//i.test(file?.type || ''));
        if (!images.length) return;
        const current = roleplayReferenceDraftIds(runtime, owner);
        if (current.length >= MAX_ROLEPLAY_REFERENCE_IMAGES) {
            setConversationStatus(runtime, localText('This reference group already has 5 images.', '这一组参考图已经有 5 张。'), true);
            return;
        }
        setConversationStatus(runtime, localText('Registering reference image...', '正在登记参考图...'));
        let addedCount = 0;
        let failedCount = 0;
        for (const file of images.slice(0, MAX_ROLEPLAY_REFERENCE_IMAGES - current.length)) {
            if (Number(file.size || 0) > MAX_ROLEPLAY_REFERENCE_BYTES) {
                setConversationStatus(runtime, localText('Reference image is larger than 80 MB.', '参考图超过 80 MB。'), true);
                failedCount += 1;
                continue;
            }
            try {
                const dataUrl = await blobToDataUrl(file);
                const assetId = await materializeRoleplayReferenceAsset({
                    data_url: dataUrl,
                    mime: file.type || 'image/png',
                    name: file.name || 'roleplay-reference.png'
                }, owner, runtime, modal, file.name || 'roleplay-reference.png');
                if (assetId) addedCount += 1;
            } catch (error) {
                failedCount += 1;
                setConversationStatus(runtime, String(error?.message || localText('Reference image registration failed.', '参考图登记失败。')), true);
            }
        }
        if (addedCount > 0 && failedCount > 0) {
            setConversationStatus(runtime, localText(
                `${addedCount} reference image(s) added; ${failedCount} failed. Click Apply to save the roleplay setup.`,
                `已添加 ${addedCount} 张参考图，${failedCount} 张失败。点击“应用”保存角色扮演设置。`
            ), failedCount > 0);
        } else if (addedCount > 0) {
            setConversationStatus(runtime, localText('Reference image added. Click Apply to save the roleplay setup.', '参考图已添加，点击“应用”保存角色扮演设置。'));
        }
    }

    async function addRoleplayReferenceFromLibrary(owner, modal) {
        const runtime = syncCurrentRuntimeFromState();
        const select = modal?.querySelector(`[data-describe-vlm-chat-roleplay-reference-library="${owner}"]`);
        const assetId = String(select?.value || '').trim();
        if (!assetId) return;
        const asset = roleplayReferenceLibraryAsset(assetId);
        if (!asset) return;
        try {
            await materializeRoleplayReferenceAsset({
                asset_id: asset.asset_id,
                mime: asset.mime,
                name: asset.name
            }, owner, runtime, modal, asset.name);
            if (select) select.value = '';
            setConversationStatus(runtime, localText('Reference image added. Click Apply to save the roleplay setup.', '参考图已添加，点击“应用”保存角色扮演设置。'));
        } catch (error) {
            setConversationStatus(runtime, String(error?.message || localText('Reference image registration failed.', '参考图登记失败。')), true);
        }
    }

    function normalizeCreativePresetEntries(entries) {
        const seen = new Set();
        const rows = [];
        (Array.isArray(entries) ? entries : []).forEach((entry) => {
            if (!entry || typeof entry !== 'object') return;
            const name = String(entry.name || entry.display_name || '').trim().replace(/\.json$/i, '');
            const engineType = String(entry.engine_type || entry.default_engine?.engine_type || 'image').trim().toLowerCase();
            if (!name || seen.has(name.toLowerCase()) || engineType === 'audio') return;
            seen.add(name.toLowerCase());
            rows.push(Object.assign({}, entry, { name, display_name: String(entry.display_name || name) }));
        });
        return rows.sort((a, b) => {
            if (a.name === CREATIVE_DEFAULT_PRESET) return -1;
            if (b.name === CREATIVE_DEFAULT_PRESET) return 1;
            return String(a.display_name || a.name).localeCompare(String(b.display_name || b.name));
        });
    }

    function normalizeCreativeParameterProfiles(entries) {
        const seen = new Set();
        return (Array.isArray(entries) ? entries : []).map((item) => {
            if (!item || typeof item !== 'object') return null;
            const name = String(item.name || '').trim().slice(0, 200);
            const preset = String(item.preset || item.preset_name || '').trim().replace(/\.json$/i, '').slice(0, 200);
            const key = `${preset.toLowerCase()}\n${name.toLowerCase()}`;
            if (!name || !preset || seen.has(key)) return null;
            seen.add(key);
            return {
                name,
                preset,
                scene_theme: String(item.scene_theme || '').trim().slice(0, 200),
                task_method: String(item.task_method || '').trim().slice(0, 200)
            };
        }).filter(Boolean).sort((left, right) => {
            const presetOrder = left.preset.localeCompare(right.preset);
            return presetOrder || left.name.localeCompare(right.name);
        });
    }

    async function ensureCreativePresetCatalog(options = {}) {
        const force = !!options.force;
        if (state.creativePresetCatalogLoaded && !force) return state.creativePresetCatalog;
        if (state.creativePresetCatalogPromise) {
            if (force) state.creativePresetCatalogRefreshPending = true;
            return state.creativePresetCatalogPromise;
        }
        const api = creativeCanvasApi();
        if (!api || typeof api.presetCatalog !== 'function') return [];
        state.creativePresetCatalogLoading = true;
        state.creativePresetCatalogPromise = api.presetCatalog({ user_context: creativeUserContext() })
            .then((response) => {
                if (!response?.ok) throw new Error(response?.details || response?.error || 'preset catalog failed');
                state.creativePresetCatalog = normalizeCreativePresetEntries(response.presets);
                state.creativeParameterProfiles = normalizeCreativeParameterProfiles(response.parameter_profiles);
                state.creativePresetCatalogLoaded = true;
                applyCreativePreferenceToPendingActions(state.creativePreference);
                return state.creativePresetCatalog;
            })
            .catch(() => {
                state.creativePresetCatalog = [];
                state.creativeParameterProfiles = [];
                state.creativePresetCatalogLoaded = true;
                return [];
            })
            .finally(() => {
                const refreshPending = state.creativePresetCatalogRefreshPending;
                state.creativePresetCatalogRefreshPending = false;
                state.creativePresetCatalogLoading = false;
                state.creativePresetCatalogPromise = null;
                renderMessages();
                if (refreshPending) {
                    window.setTimeout(() => ensureCreativePresetCatalog({ force: true }).catch(() => {}), 0);
                }
            });
        return state.creativePresetCatalogPromise;
    }

    function refreshCreativePresetCatalogAfterProfileChange() {
        state.creativePresetCatalogLoaded = false;
        return ensureCreativePresetCatalog({ force: true });
    }

    function creativePresetEntry(name) {
        const wanted = String(name || '').trim().replace(/\.json$/i, '').toLowerCase();
        return state.creativePresetCatalog.find((entry) => String(entry.name || '').toLowerCase() === wanted) || null;
    }

    function creativeParameterProfileEntry(name, preset = '') {
        const wanted = String(name || '').trim().toLowerCase();
        const wantedPreset = String(preset || '').trim().toLowerCase();
        if (!wanted) return null;
        const matches = state.creativeParameterProfiles.filter((item) => (
            String(item.name || '').toLowerCase() === wanted
            && (!wantedPreset || String(item.preset || '').toLowerCase() === wantedPreset)
        ));
        return matches.length === 1 ? matches[0] : null;
    }

    function creativeParameterProfilesPayload() {
        return state.creativeParameterProfiles.slice(0, 100).map((item) => ({
            name: String(item.name || ''),
            preset: String(item.preset || ''),
            scene_theme: String(item.scene_theme || ''),
            task_method: String(item.task_method || '')
        }));
    }

    function creativePresetImageSlots(entry) {
        const ordered = ['enhance_image', 'scene_canvas_image', 'scene_input_image1', 'scene_input_image2', 'scene_input_image3', 'scene_input_image4'];
        const declared = Array.isArray(entry?.media_capability?.image_slots)
            ? entry.media_capability.image_slots.map((slot) => String(slot || '')).filter((slot) => ordered.includes(slot))
            : [];
        if (declared.length) return ordered.filter((slot) => declared.includes(slot));
        const slots = Array.isArray(entry?.schema?.upload_slots) ? entry.schema.upload_slots : [];
        return ordered.filter((key) => slots.some((slot) => String(slot?.key || '') === key && slot?.visible !== false));
    }

    function creativePresetMaxImages(entry) {
        const slots = creativePresetImageSlots(entry);
        const declared = Number(entry?.media_capability?.max_images ?? entry?.schema?.director_capability?.max_images);
        return Number.isFinite(declared)
            ? Math.max(0, Math.min(slots.length, Math.round(declared)))
            : slots.length;
    }

    function creativePresetMinImages(entry) {
        const maxImages = creativePresetMaxImages(entry);
        const declared = Number(entry?.media_capability?.min_images ?? entry?.schema?.director_capability?.min_images);
        return Number.isFinite(declared)
            ? Math.max(0, Math.min(maxImages, Math.round(declared)))
            : 0;
    }

    function creativeActionTask(action, inputCount = Array.isArray(action?.media_inputs) ? action.media_inputs.length : 0) {
        const stableRequest = String(action?.requested_task || action?.task_request?.task || '').trim();
        const requested = String(stableRequest || action?.task || '').trim().toLowerCase().replace(/[- ]/g, '_');
        const normalized = CREATIVE_TASK_ALIASES[requested] || requested;
        if (!CREATIVE_GENERATION_TASKS.has(normalized)) {
            return inputCount > 1 ? 'multi_image_edit' : inputCount === 1 ? 'image_edit' : 'text_to_image';
        }
        if (normalized === 'text_to_video' && inputCount > 0) return inputCount > 1 ? 'multi_image_to_video' : 'image_to_video';
        if (normalized === 'image_to_video' && inputCount > 1) return 'multi_image_to_video';
        if (normalized === 'multi_image_to_video' && inputCount === 1 && !stableRequest) return 'image_to_video';
        if (normalized === 'text_to_image' && inputCount > 0) return inputCount > 1 ? 'multi_image_edit' : 'image_edit';
        if (normalized === 'image_edit' && inputCount > 1) return 'multi_image_edit';
        if (normalized === 'multi_image_edit' && inputCount === 1 && !stableRequest) return 'image_edit';
        return normalized;
    }

    function creativePresetSupportedTasks(entry) {
        const outputType = String(entry?.media_capability?.output_type || entry?.engine_type || 'image').toLowerCase() === 'video' ? 'video' : 'image';
        const declared = Array.isArray(entry?.media_capability?.supported_tasks)
            ? entry.media_capability.supported_tasks.map((task) => {
                const taskKey = String(task || '').trim().toLowerCase().replace(/[- ]/g, '_');
                return CREATIVE_TASK_ALIASES[taskKey] || taskKey;
            })
            : [];
        if (declared.length) {
            return [...new Set(declared.filter((task) => (
                outputType === 'video' ? CREATIVE_VIDEO_TASKS.has(task) : CREATIVE_IMAGE_TASKS.has(task)
            )))];
        }
        const descriptor = [
            entry?.name,
            entry?.task_method,
            entry?.schema?.theme_title
        ].map((value) => String(value || '').toLowerCase()).join(' ');
        const editMarkers = [
            'image edit', 'image-edit', 'image_edit', 'editing', 'qwenedit', 'qwen_edit',
            'kleinedit', 'klein_edit', 'flux2_9b_edit', 'kontext', 'inpaint', 'outpaint',
            'retouch', 'imagerepair', 'image repair', 'pose editor', 'a2r'
        ];
        const maxImages = creativePresetMaxImages(entry);
        if (outputType === 'video') {
            if (maxImages < 1) return ['text_to_video'];
            return maxImages > 1 ? ['image_to_video', 'multi_image_to_video'] : ['image_to_video'];
        }
        if (maxImages > 0 && editMarkers.some((marker) => descriptor.includes(marker))) {
            return maxImages > 1 ? ['image_edit', 'multi_image_edit'] : ['image_edit'];
        }
        return ['text_to_image'];
    }

    function creativePresetSupportsTask(entry, task, inputCount = 0) {
        if (!entry || !creativePresetSupportedTasks(entry).includes(task)) return false;
        const count = Math.max(0, Math.round(Number(inputCount) || 0));
        if (CREATIVE_TEXT_TASKS.has(task)) return count === 0;
        const required = creativeRequiredImageCount(entry, task);
        return count >= required && count <= creativePresetMaxImages(entry);
    }

    function creativeRequiredImageCount(entry, task) {
        if (!CREATIVE_IMAGE_INPUT_TASKS.has(String(task || ''))) return 0;
        return Math.max(CREATIVE_MULTI_IMAGE_TASKS.has(task) ? 2 : 1, creativePresetMinImages(entry));
    }

    function creativePresetModelReadiness(entry) {
        if (entry?.missing === true) return 'missing';
        if (entry?.has_model_probe === true) return 'ready';
        return 'unknown';
    }

    function creativePresetRequiresManualInteraction(entry) {
        const requirements = Array.isArray(entry?.media_capability?.interaction_requirements)
            ? entry.media_capability.interaction_requirements
            : [];
        return requirements.length > 0;
    }

    function creativeThemeSupportedTasks(entry, theme) {
        const declared = creativeDeclaredThemeSupportedTasks(entry, theme);
        if (declared.length) return declared;
        return String(theme || '').trim() === String(entry?.schema?.default_theme || '').trim()
            ? creativePresetSupportedTasks(entry)
            : [];
    }

    function creativeDeclaredThemeSupportedTasks(entry, theme) {
        const declared = entry?.schema?.per_theme?.[theme]?.supported_tasks;
        if (Array.isArray(declared) && declared.length) {
            return [...new Set(declared.map((task) => {
                const key = String(task || '').trim().toLowerCase().replace(/[- ]/g, '_');
                return CREATIVE_TASK_ALIASES[key] || key;
            }).filter((task) => CREATIVE_GENERATION_TASKS.has(task)))];
        }
        return [];
    }

    function creativeTaskThemes(entry, task) {
        const themes = Array.isArray(entry?.schema?.themes)
            ? entry.schema.themes.map((theme) => String(theme || '')).filter(Boolean)
            : [];
        if (!themes.length) return [];
        const routed = themes.filter((theme) => creativeDeclaredThemeSupportedTasks(entry, theme).includes(task));
        if (routed.length) return routed;
        if (!creativePresetSupportedTasks(entry).includes(task)) return [];
        const hasDeclaredRoutes = themes.some((theme) => creativeDeclaredThemeSupportedTasks(entry, theme).length > 0);
        if (!hasDeclaredRoutes) return themes;
        const defaultTheme = String(entry?.schema?.default_theme || themes[0] || '');
        return defaultTheme ? [defaultTheme] : [];
    }

    function creativeThemeDisplayLabel(entry, theme) {
        const configured = entry?.schema?.theme_labels?.[theme];
        if (configured && typeof configured === 'object') {
            return localText(configured.en || configured.zh || theme, configured.zh || configured.en || theme);
        }
        return String(configured || theme || '');
    }

    function creativePresetHasTaskRoute(entry, task, inputCount = 0) {
        if (creativePresetSupportsTask(entry, task, inputCount)) return true;
        if (!entry || inputCount < creativePresetMinImages(entry) || inputCount > creativePresetMaxImages(entry)) return false;
        const themes = Array.isArray(entry?.schema?.themes) ? entry.schema.themes : [];
        return themes.some((theme) => creativeThemeSupportedTasks(entry, theme).includes(task));
    }

    function creativeOutpaintParameterOverrides(action) {
        const current = action?.execution_plan?.parameter_overrides && typeof action.execution_plan.parameter_overrides === 'object'
            ? action.execution_plan.parameter_overrides
            : {};
        const clampPercent = (value) => Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
        const overrides = {
            scene_var_number7: clampPercent(current.scene_var_number7),
            scene_var_number8: clampPercent(current.scene_var_number8),
            scene_var_number9: clampPercent(current.scene_var_number9),
            scene_var_number10: clampPercent(current.scene_var_number10)
        };
        if (!Object.values(overrides).some((value) => value > 0)) {
            Object.keys(overrides).forEach((key) => { overrides[key] = 15; });
        }
        return overrides;
    }

    function creativePresetSupportsOutpaintDirections(entry) {
        const keys = new Set(
            (Array.isArray(entry?.schema?.params) ? entry.schema.params : [])
                .map((item) => String(item?.key || ''))
                .filter(Boolean)
        );
        return ['scene_var_number7', 'scene_var_number8', 'scene_var_number9', 'scene_var_number10']
            .every((key) => keys.has(key));
    }

    function creativeVideoDurationSpec(action, entry = null) {
        const inputCount = Array.isArray(action?.media_inputs) ? action.media_inputs.length : 0;
        const task = creativeActionTask(action, inputCount);
        if (!CREATIVE_VIDEO_TASKS.has(task)) return null;
        const resolvedEntry = entry || creativePresetEntry(action?.preset);
        const durationParam = (Array.isArray(resolvedEntry?.schema?.params) ? resolvedEntry.schema.params : [])
            .find((item) => String(item?.key || '') === 'scene_video_duration');
        const theme = String(action?.execution_plan?.theme || resolvedEntry?.schema?.default_theme || '').trim();
        const themeDefaults = resolvedEntry?.schema?.per_theme?.[theme]?.defaults;
        const overrides = action?.execution_plan?.parameter_overrides && typeof action.execution_plan.parameter_overrides === 'object'
            ? action.execution_plan.parameter_overrides
            : {};
        const toNumber = (value) => {
            if (value === '' || value == null) return null;
            const number = Number(value);
            return Number.isFinite(number) ? number : null;
        };
        const rawMinimum = toNumber(durationParam?.min);
        const rawMaximum = toNumber(durationParam?.max);
        const minimum = rawMinimum == null ? 0.1 : Math.max(0.1, rawMinimum);
        const maximum = rawMaximum != null && rawMaximum > 0 ? Math.min(120, rawMaximum) : 120;
        const upper = Math.max(minimum, maximum);
        const override = toNumber(overrides.scene_video_duration);
        const declaredDefault = toNumber(durationParam?.default);
        const themeDefault = toNumber(themeDefaults?.scene_video_duration);
        const rawValue = override ?? declaredDefault ?? themeDefault ?? 5;
        const rawStep = toNumber(durationParam?.step);
        const step = rawStep != null && rawStep > 0 ? Math.max(0.01, Math.min(10, rawStep)) : 0.1;
        return {
            value: Math.max(minimum, Math.min(upper, Math.round(rawValue * 100) / 100)),
            minimum,
            maximum: upper,
            step: Math.round(step * 100) / 100,
            interactive: durationParam?.interactive !== false
        };
    }

    function creativeVideoDurationControl(action, actionRef, disabled = '', entry = null) {
        const spec = creativeVideoDurationSpec(action, entry);
        if (!spec) return '';
        const fieldDisabled = disabled || !spec.interactive ? 'disabled' : '';
        const label = localText('Duration (seconds)', '时长（秒）');
        const range = localText(`Allowed range: ${spec.minimum}-${spec.maximum}`, `可选范围：${spec.minimum}-${spec.maximum} 秒`);
        return `<label class="describe-vlm-chat-generation-duration" title="${escapeHtml(range)}"><span>${escapeHtml(label)}</span><input type="number" min="${spec.minimum}" max="${spec.maximum}" step="${spec.step}" value="${spec.value}" inputmode="decimal" aria-label="${escapeHtml(label)}" data-describe-vlm-chat-generation-duration="${escapeHtml(actionRef)}" ${fieldDisabled}></label>`;
    }

    function creativeEnhanceTargets(action) {
        const aliases = new Map([
            ['face', 'face'], ['facial', 'face'], ['脸', 'face'], ['面部', 'face'], ['脸部', 'face'], ['五官', 'face'],
            ['hand', 'hand'], ['hands', 'hand'], ['finger', 'hand'], ['fingers', 'hand'], ['手', 'hand'], ['手部', 'hand'], ['手指', 'hand'],
            ['eye', 'eye'], ['eyes', 'eye'], ['眼', 'eye'], ['眼睛', 'eye'], ['眼部', 'eye']
        ]);
        const declared = Array.isArray(action?.enhance_targets)
            ? action.enhance_targets
            : Array.isArray(action?.task_request?.enhance_targets)
                ? action.task_request.enhance_targets
                : Array.isArray(action?.execution_plan?.enhance_targets) ? action.execution_plan.enhance_targets : [];
        const targets = [];
        declared.forEach((value) => {
            const target = aliases.get(String(value || '').trim().toLowerCase());
            if (target && !targets.includes(target)) targets.push(target);
        });
        const text = String(action?.prompt || action?.task_request?.instruction || '');
        const patterns = {
            face: /(?:脸|面部|脸部|五官|face)/i,
            hand: /(?:手|手部|手指|hand|finger)/i,
            eye: /(?:眼|眼睛|眼部|eye)/i
        };
        Object.entries(patterns).forEach(([target, pattern]) => {
            if (pattern.test(text) && !targets.includes(target)) targets.push(target);
        });
        return targets.length ? targets : ['face', 'hand', 'eye'];
    }

    function creativeExecutionPlanForEntry(action, entry, presetSource = 'user') {
        const inputs = Array.isArray(action?.media_inputs) ? action.media_inputs : [];
        const task = creativeActionTask(action, inputs.length);
        const parameterProfileName = String(action?.parameter_profile || action?.execution_plan?.parameter_profile || '').trim();
        const parameterProfile = creativeParameterProfileEntry(parameterProfileName, entry?.name);
        const namedProfileExists = state.creativeParameterProfiles.some(
            (item) => String(item.name || '').toLowerCase() === parameterProfileName.toLowerCase()
        );
        if (parameterProfileName && !parameterProfile) {
            return {
                schema: 'simpai.execution_plan.v1',
                status: namedProfileExists ? 'parameter_profile_incompatible' : 'parameter_profile_missing',
                task,
                preset: String(entry?.name || ''),
                theme: '',
                task_method: '',
                media_bindings: [],
                interaction_requirements: [],
                model_status: creativePresetModelReadiness(entry),
                preset_source: presetSource,
                parameter_profile: parameterProfileName,
                parameter_profile_source: String(action?.execution_plan?.parameter_profile_source || presetSource)
            };
        }
        if (!entry || !creativePresetHasTaskRoute(entry, task, inputs.length)) {
            const taskDeclared = Boolean(entry) && creativeTaskThemes(entry, task).length > 0;
            const needsMedia = CREATIVE_IMAGE_INPUT_TASKS.has(task)
                && inputs.length < creativeRequiredImageCount(entry, task)
                && (!entry || taskDeclared);
            return {
                schema: 'simpai.execution_plan.v1', status: needsMedia ? 'needs_media' : 'no_compatible_route',
                task, preset: String(entry?.name || ''), theme: '', task_method: '', media_bindings: [],
                interaction_requirements: [], model_status: creativePresetModelReadiness(entry), preset_source: presetSource
            };
        }
        const themes = creativeTaskThemes(entry, task);
        const defaultTheme = String(entry?.schema?.default_theme || themes[0] || '');
        const requestedTheme = String(action?.execution_plan?.preset || '') === String(entry.name || '')
            ? String(action?.execution_plan?.theme || '')
            : '';
        const specialized = themes.find((theme) => creativeDeclaredThemeSupportedTasks(entry, theme).includes(task));
        const theme = String(themes.includes(requestedTheme) ? requestedTheme : specialized || themes[0] || defaultTheme);
        const taskMethod = String(entry?.schema?.per_theme?.[theme]?.task_method || entry?.task_method || '');
        const methodKey = (value) => String(value || '').trim().toLowerCase().replace(/^scene_/, '');
        if (
            parameterProfile
            && (
                (parameterProfile.scene_theme && theme && parameterProfile.scene_theme !== theme)
                || (parameterProfile.task_method && taskMethod && methodKey(parameterProfile.task_method) !== methodKey(taskMethod))
            )
        ) {
            return {
                schema: 'simpai.execution_plan.v1', status: 'parameter_profile_incompatible', task,
                preset: String(entry.name || ''), theme, task_method: taskMethod, media_bindings: [],
                interaction_requirements: [], model_status: creativePresetModelReadiness(entry), preset_source: presetSource,
                parameter_profile: parameterProfile.name,
                parameter_profile_source: String(action?.execution_plan?.parameter_profile_source || presetSource)
            };
        }
        const requirements = Array.isArray(entry?.media_capability?.interaction_requirements)
            ? entry.media_capability.interaction_requirements.slice(0, 8)
            : [];
        const modelStatus = creativePresetModelReadiness(entry);
        let status = requirements.includes('mask') ? 'needs_mask' : requirements.length ? 'needs_interaction' : 'ready';
        if (status === 'ready' && modelStatus === 'missing') status = 'models_missing';
        const slots = creativePresetImageSlots(entry);
        const parameterOverrides = Object.assign(
            {},
            action?.execution_plan?.parameter_overrides && typeof action.execution_plan.parameter_overrides === 'object'
                ? action.execution_plan.parameter_overrides
                : {},
            task === 'image_outpaint' && creativePresetSupportsOutpaintDirections(entry)
                ? creativeOutpaintParameterOverrides(action)
                : {}
        );
        if (Object.prototype.hasOwnProperty.call(parameterOverrides, 'scene_video_duration')) {
            const durationParam = (Array.isArray(entry?.schema?.params) ? entry.schema.params : [])
                .find((item) => String(item?.key || '') === 'scene_video_duration');
            const duration = Number(parameterOverrides.scene_video_duration);
            const rawMinimum = Number(durationParam?.min);
            const rawMaximum = Number(durationParam?.max);
            const minimum = Number.isFinite(rawMinimum) ? Math.max(0.1, rawMinimum) : 0.1;
            const maximum = Number.isFinite(rawMaximum) && rawMaximum > 0 ? Math.min(120, rawMaximum) : 120;
            if (Number.isFinite(duration)) parameterOverrides.scene_video_duration = Math.max(minimum, Math.min(maximum, Math.round(duration * 100) / 100));
        }
        const taskModes = entry?.media_capability?.task_modes && typeof entry.media_capability.task_modes === 'object'
            ? entry.media_capability.task_modes
            : {};
        const plan = {
            schema: 'simpai.execution_plan.v1', status, task, preset: String(entry.name || ''), theme, task_method: taskMethod,
            media_bindings: inputs.slice(0, slots.length).map((input, index) => ({ ref: String(input.ref || ''), slot: slots[index] })),
            interaction_requirements: requirements, model_status: modelStatus, preset_source: presetSource,
            parameter_overrides: parameterOverrides
        };
        if (parameterProfile) {
            plan.parameter_profile = parameterProfile.name;
            plan.parameter_profile_source = String(action?.execution_plan?.parameter_profile_source || presetSource);
        }
        const classicMode = String(taskModes[task] || '');
        if (classicMode) plan.classic_mode = classicMode;
        if (task === 'image_detail_enhance') plan.enhance_targets = creativeEnhanceTargets(action);
        return plan;
    }

    function normalizeCreativeExecutionPlan(plan) {
        if (!plan || typeof plan !== 'object' || plan.schema !== 'simpai.execution_plan.v1') return null;
        const statuses = new Set(['ready', 'needs_media', 'needs_mask', 'needs_interaction', 'models_missing', 'no_compatible_route', 'parameter_profile_missing', 'parameter_profile_incompatible']);
        const rawParameterOverrides = plan.parameter_overrides && typeof plan.parameter_overrides === 'object'
            ? plan.parameter_overrides
            : {};
        const parameterOverrides = {};
        Object.entries(rawParameterOverrides).forEach(([key, value]) => {
            if (['scene_var_number7', 'scene_var_number8', 'scene_var_number9', 'scene_var_number10'].includes(key)) {
                parameterOverrides[key] = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
                return;
            }
            if (key === 'scene_video_duration') {
                const duration = Number(value);
                if (Number.isFinite(duration)) parameterOverrides[key] = Math.max(0.1, Math.min(120, Math.round(duration * 100) / 100));
                return;
            }
            if (key === 'scene_steps' || /^scene_var_number(?:[2-9]|10)?$/.test(key)) {
                const number = Number(value);
                if (Number.isFinite(number)) parameterOverrides[key] = number;
                return;
            }
            if (/^scene_switch_option[1-4]$/.test(key) && typeof value === 'boolean') parameterOverrides[key] = value;
        });
        const normalized = {
            schema: 'simpai.execution_plan.v1',
            status: statuses.has(String(plan.status || '')) ? String(plan.status) : 'no_compatible_route',
            task: String(plan.task || ''),
            preset: String(plan.preset || '').slice(0, 200),
            theme: String(plan.theme || '').slice(0, 200),
            task_method: String(plan.task_method || '').slice(0, 200),
            media_bindings: Array.isArray(plan.media_bindings) ? plan.media_bindings.slice(0, MAX_ATTACHMENTS).map((binding) => ({
                ref: String(binding?.ref || '').slice(0, 160),
                slot: String(binding?.slot || '').slice(0, 120)
            })).filter((binding) => binding.ref && binding.slot) : [],
            interaction_requirements: Array.isArray(plan.interaction_requirements) ? plan.interaction_requirements.slice(0, 8).map(String) : [],
            model_status: ['ready', 'missing', 'unknown'].includes(String(plan.model_status || '')) ? String(plan.model_status) : 'unknown',
            preset_source: String(plan.preset_source || 'automatic'),
            parameter_overrides: parameterOverrides
        };
        const parameterProfile = String(plan.parameter_profile || '').trim().slice(0, 200);
        if (parameterProfile) {
            normalized.parameter_profile = parameterProfile;
            normalized.parameter_profile_source = String(plan.parameter_profile_source || plan.preset_source || 'automatic').slice(0, 80);
        }
        const classicMode = String(plan.classic_mode || '').toLowerCase();
        if (classicMode === 'enhance') normalized.classic_mode = classicMode;
        if (normalized.task === 'image_detail_enhance') normalized.enhance_targets = creativeEnhanceTargets(plan);
        return normalized;
    }

    function creativeCompatiblePresetEntry(task, inputCount = 0) {
        const candidates = state.creativePresetCatalog.filter((entry) => creativePresetSupportsTask(entry, task, inputCount));
        const taskPriorities = {
            text_to_video: ['MiniMax-H3(T2V)', 'Wan(T2V)', 'LTX(T2V)', 'Wan-TTP'],
            image_to_video: ['MiniMax-H3(I2V)', 'MiniMax-H3(R2V)', 'Wan(I2V)', 'Dasiwa(I2V)', 'LTX(I2V)'],
            multi_image_to_video: ['MiniMax-H3(R2V)', 'MiniMax-H3(I2V)', 'Wan(I2V)', 'Dasiwa(I2V)'],
            image_upscale: ['Z-TTP', 'Wan-TTP'],
            image_restore: ['Imagerepair+'],
            image_edit: ['MiniMax-H3(R2I)', 'QwenEdit+', 'Flux2-KleinEdit', 'Krea2-ImageEdit', 'QwenNSFW', 'NunQwenEdit+_fp4', 'NunQwenEdit+_int4', 'Bernini-ImageEdit', 'OneKeyKontext'],
            multi_image_edit: ['MiniMax-H3(R2I)', 'QwenEdit+', 'Flux2-KleinEdit', 'Krea2-ImageEdit', 'QwenNSFW', 'NunQwenEdit+_fp4', 'NunQwenEdit+_int4', 'Bernini-ImageEdit', 'OneKeyKontext'],
            image_detail_enhance: ['Z-imageT', 'Anima', 'Flux2-Klein', 'Qwen2512', 'Wan(T2I)', 'Flux1-dev', 'NunFlux_fp4', 'NunFlux_int4', 'Illustrious(OB)', 'Illustrious(MiaoKa)', 'ChenkinXL', 'SD1.5'],
            image_background_removal: ['Removebg'],
            image_object_removal: ['Flux2-KleinEdit', 'Krea2-ImageEdit', 'Eraser'],
            image_object_transfer: ['QwenEdit+', 'NunQwenEdit+_fp4', 'NunQwenEdit+_int4', 'Flux2-KleinEdit', 'Krea2-ImageEdit', 'Bernini-ImageEdit', 'MiniMax-H3(R2I)', 'OneKeyKontext', 'Swap+', 'NunSwap_fp4', 'NunSwap_int4'],
            image_outpaint: ['OneKey-Outpaint'],
            image_relight: ['Relight', 'Flux2-AngleLight'],
            image_style_transfer: ['StyleTransfer+'],
            image_face_swap: ['QwenFaceSwap', 'Swapface'],
            image_pose_transfer: ['Flux2-KleinPose', 'QwenPose'],
            image_pose_extraction: ['OneKeyPose'],
            image_anime_to_real: ['Flux2-A2R', 'QwenA2R'],
            image_view_synthesis: ['QwenMultiAngle'],
            image_depth_estimation: ['Depthstatue'],
            image_expression_transfer: ['LivePortrait Exp']
        };
        const priorities = (taskPriorities[task] || ['MiniMax-H3(R2I)', 'QwenEdit+', 'Flux2-KleinEdit', 'Krea2-ImageEdit', 'QwenNSFW', 'NunQwenEdit+_fp4', 'NunQwenEdit+_int4', 'Bernini-ImageEdit', 'OneKeyKontext']).slice();
        if (task === 'text_to_image') priorities.splice(0, priorities.length, 'MiniMax-H3(R2I)', 'QwenNSFW', CREATIVE_DEFAULT_PRESET, 'Anima');
        const readinessRank = { ready: 0, unknown: 1, missing: 2 };
        return candidates.slice().sort((left, right) => {
            const interactionDifference = Number(creativePresetRequiresManualInteraction(left)) - Number(creativePresetRequiresManualInteraction(right));
            if (interactionDifference) return interactionDifference;
            const readinessDifference = readinessRank[creativePresetModelReadiness(left)] - readinessRank[creativePresetModelReadiness(right)];
            if (readinessDifference) return readinessDifference;
            const leftPriority = priorities.findIndex((name) => name.toLowerCase() === String(left?.name || '').toLowerCase());
            const rightPriority = priorities.findIndex((name) => name.toLowerCase() === String(right?.name || '').toLowerCase());
            return (leftPriority < 0 ? priorities.length : leftPriority) - (rightPriority < 0 ? priorities.length : rightPriority);
        })[0] || null;
    }

    function creativePresetCapabilitiesPayload() {
        return state.creativePresetCatalog.slice(0, 100).map((entry) => {
            const themes = Array.isArray(entry?.schema?.themes) ? entry.schema.themes.slice(0, 40).map((theme) => String(theme || '')).filter(Boolean) : [];
            const perTheme = entry?.schema?.per_theme && typeof entry.schema.per_theme === 'object' ? entry.schema.per_theme : {};
            const durationParam = (Array.isArray(entry?.schema?.params) ? entry.schema.params : [])
                .find((item) => String(item?.key || '') === 'scene_video_duration');
            const capability = {
                name: String(entry?.name || ''),
                min_images: creativePresetMinImages(entry),
                max_images: creativePresetMaxImages(entry),
                output_type: String(entry?.media_capability?.output_type || entry?.engine_type || 'image').toLowerCase() === 'video' ? 'video' : 'image',
                supported_tasks: creativePresetSupportedTasks(entry),
                interaction_requirements: Array.isArray(entry?.media_capability?.interaction_requirements)
                    ? entry.media_capability.interaction_requirements.slice(0, 8)
                    : [],
                model_status: creativePresetModelReadiness(entry),
                backend_engine: String(entry?.backend_engine || entry?.default_engine?.backend_engine || '').slice(0, 80),
                task_method: String(entry?.task_method || '').slice(0, 120),
                text_encoder: String(
                    entry?.text_encoder
                    || entry?.default_engine?.backend_params?.text_encoder
                    || entry?.default_engine?.backend_params?.clip_model
                    || ''
                ).slice(0, 120),
                prompt_format: String(
                    entry?.prompt_format
                    || entry?.schema?.prompt_format
                    || entry?.default_engine?.backend_params?.prompt_format
                    || ''
                ).slice(0, 120),
                purpose: String(entry?.schema?.theme_title || '').trim().replace(/^Theme$/i, '').slice(0, 240),
                image_slots: creativePresetImageSlots(entry),
                task_modes: entry?.media_capability?.task_modes && typeof entry.media_capability.task_modes === 'object'
                    ? Object.assign({}, entry.media_capability.task_modes)
                    : {},
                themes,
                default_theme: String(entry?.schema?.default_theme || themes[0] || ''),
                per_theme: Object.fromEntries(themes.map((theme) => [theme, {
                    task_method: String(perTheme?.[theme]?.task_method || '').slice(0, 120),
                    supported_tasks: creativeThemeSupportedTasks(entry, theme)
                }]))
            };
            const durationMin = Number(durationParam?.min);
            const durationMax = Number(durationParam?.max);
            if (Number.isFinite(durationMin)) capability.video_duration_min = durationMin;
            if (Number.isFinite(durationMax)) capability.video_duration_max = durationMax;
            return capability;
        }).filter((item) => item.name);
    }

    function creativePresetForStyle(style) {
        if (style !== 'anime') return style === 'realistic' ? CREATIVE_DEFAULT_PRESET : '';
        const entries = state.creativePresetCatalog;
        const exact = entries.find((entry) => ['anima动漫', 'anima'].includes(String(entry.name || '').toLowerCase()));
        const related = entries.find((entry) => /(^|[^a-z0-9])anima([^a-z0-9]|$)/i.test(String(entry.name || '')));
        return String(exact?.name || related?.name || 'Anima');
    }

    function creativeParameterProfileOptions(preset, selected = '', config = {}) {
        const wantedPreset = String(preset || '').trim().toLowerCase();
        const selectedName = String(selected || '').trim();
        const includeAll = !!config.includeAll;
        const selectedPreset = String(config.selectedPreset || preset || '').trim().toLowerCase();
        const rows = state.creativeParameterProfiles.filter((item) => (
            includeAll || String(item.preset || '').toLowerCase() === wantedPreset
        ));
        const options = [
            `<option value="">${escapeHtml(localText('Preset defaults', '使用 Preset 默认参数'))}</option>`,
            ...rows.map((item) => {
                const itemPreset = String(item.preset || '').trim();
                const selectedMatch = item.name === selectedName && (
                    !includeAll || itemPreset.toLowerCase() === selectedPreset
                );
                const value = includeAll ? `${itemPreset}::${item.name}` : item.name;
                const label = includeAll ? `${item.name} · ${itemPreset}` : item.name;
                return `<option value="${escapeHtml(value)}" data-profile-name="${escapeHtml(item.name)}" data-preset="${escapeHtml(itemPreset)}" ${selectedMatch ? 'selected' : ''}>${escapeHtml(label)}</option>`;
            })
        ];
        if (selectedName && !rows.some((item) => item.name === selectedName && (
            !includeAll || String(item.preset || '').toLowerCase() === selectedPreset
        ))) {
            const value = includeAll ? `${preset}::${selectedName}` : selectedName;
            options.push(`<option value="${escapeHtml(value)}" data-profile-name="${escapeHtml(selectedName)}" data-preset="${escapeHtml(preset)}" selected disabled>${escapeHtml(`${selectedName} ${localText('(unavailable)', '（不可用）')}`)}</option>`);
        }
        return options.join('');
    }

    function ensureCreativePreferencePrompt() {
        if (normalizeChatMode(state.chatMode) !== 'creative' || state.creativePreference.prompted) return false;
        state.creativePreference = normalizeCreativePreference(Object.assign({}, state.creativePreference, { prompted: true }));
        state.creativePreferenceExpanded = true;
        state.persistenceDirty = true;
        saveConversationSnapshot();
        ensureCreativePresetCatalog().catch(() => {});
        renderMessages();
        return true;
    }

    function renderCreativePreferencePanel() {
        const preference = normalizeCreativePreference(state.creativePreference);
        const initiative = normalizeCreativeInitiative(state.creativeInitiative);
        const selectedPreset = String(preference.preset || '');
        const selectedParameterProfile = String(preference.parameter_profile || '');
        const presetRows = state.creativePresetCatalog.slice();
        if (selectedPreset && !presetRows.some((entry) => entry.name === selectedPreset)) {
            presetRows.unshift({ name: selectedPreset, display_name: selectedPreset });
        }
        const presetOptions = [
            `<option value="">${escapeHtml(localText('Choose a Preset...', '选择 Preset...'))}</option>`,
            ...presetRows.map((entry) => `<option value="${escapeHtml(entry.name)}" ${entry.name === selectedPreset ? 'selected' : ''}>${escapeHtml(entry.display_name || entry.name)}</option>`)
        ].join('');
        const presetApplied = Boolean(selectedPreset);
        const applyLabel = presetApplied ? localText('Preset active', '已使用') : localText('Use Preset', '使用 Preset');
        const styleButton = (style, icon, en, cn) => {
            const active = preference.style === style ? 'is-active' : '';
            return `<button type="button" class="${active}" data-describe-vlm-chat-preference-style="${style}" aria-pressed="${active ? 'true' : 'false'}"><i class="fa-solid ${icon}"></i><span>${escapeHtml(localText(en, cn))}</span></button>`;
        };
        return `<div class="describe-vlm-chat-preference">
  <div class="describe-vlm-chat-generation-title"><i class="fa-solid fa-palette"></i><span>${escapeHtml(localText('Creative preference', '创作偏好'))}</span><b>${escapeHtml(creativePreferenceLabel(preference))}</b><button type="button" data-describe-vlm-chat-preference-toggle title="${escapeHtml(localText('Collapse creative preference', '收起创作偏好'))}" aria-label="${escapeHtml(localText('Collapse creative preference', '收起创作偏好'))}" aria-expanded="true"><i class="fa-solid fa-chevron-up"></i></button></div>
  <div class="describe-vlm-chat-preference-styles">
    ${styleButton('anime', 'fa-wand-sparkles', 'Anime', '动漫')}
    ${styleButton('realistic', 'fa-camera', 'Realistic', '写实')}
    ${styleButton('auto', 'fa-compass', 'Let Agent decide', '交给 Agent')}
  </div>
  <div class="describe-vlm-chat-preference-preset">
    <label><span>${escapeHtml(localText('Advanced / custom Preset', '高级 / 自定义 Preset'))}</span><select data-describe-vlm-chat-preference-preset>${presetOptions}</select></label>
    <label><span>${escapeHtml(localText('Private parameter profile', '私人参数预设'))}</span><select data-describe-vlm-chat-preference-parameter-profile ${selectedPreset ? '' : 'disabled'}>${creativeParameterProfileOptions(selectedPreset, selectedParameterProfile)}</select></label>
    <button type="button" class="${presetApplied ? 'is-active' : ''}" data-describe-vlm-chat-preference-apply title="${escapeHtml(localText('Use selected Preset for this conversation', '在本次对话中使用所选 Preset'))}" aria-pressed="${presetApplied ? 'true' : 'false'}"><i class="fa-solid fa-check"></i><span>${escapeHtml(applyLabel)}</span></button>
  </div>
  <div class="describe-vlm-chat-initiative">
    <span>${escapeHtml(localText('Image initiative', '画面提议'))}</span>
    <div role="group" aria-label="${escapeHtml(localText('Image initiative', '画面提议'))}">
      <button type="button" class="${initiative.mode === 'responsive' ? 'is-active' : ''}" data-describe-vlm-chat-initiative="responsive" aria-pressed="${initiative.mode === 'responsive' ? 'true' : 'false'}"><i class="fa-solid fa-reply"></i><span>${escapeHtml(localText('Only when asked', '仅响应'))}</span></button>
      <button type="button" class="${initiative.mode === 'proactive' ? 'is-active' : ''}" data-describe-vlm-chat-initiative="proactive" aria-pressed="${initiative.mode === 'proactive' ? 'true' : 'false'}"><i class="fa-solid fa-lightbulb"></i><span>${escapeHtml(localText('Suggest scenes', '主动提议'))}</span></button>
    </div>
  </div>
  <label class="describe-vlm-chat-auto-generate"><input type="checkbox" data-describe-vlm-chat-auto-generate ${preference.auto_generate ? 'checked' : ''}><span>${escapeHtml(localText('Generate without confirmation', '无需确认，直接生成'))}</span></label>
</div>`;
    }

    function renderCreativePreferenceMount(modal = document.getElementById('describe_vlm_chat_modal')) {
        const mount = modal?.querySelector?.('[data-describe-vlm-chat-preference-mount]');
        if (!mount) return;
        const creativeMode = normalizeChatMode(state.chatMode) === 'creative';
        mount.hidden = !creativeMode;
        if (!creativeMode) {
            mount.innerHTML = '';
            return;
        }
        if (!state.creativePresetCatalogLoaded && !state.creativePresetCatalogLoading) {
            ensureCreativePresetCatalog().catch(() => {});
        }
        if (state.creativePreferenceExpanded) {
            mount.classList.add('is-expanded');
            mount.innerHTML = renderCreativePreferencePanel();
            return;
        }
        mount.classList.remove('is-expanded');
        const label = localText(
            `Creative preference: ${creativePreferenceLabel()}`,
            `创作偏好：${creativePreferenceLabel()}`
        );
        mount.innerHTML = `<button type="button" class="describe-vlm-chat-preference-trigger" data-describe-vlm-chat-preference-toggle title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}" aria-expanded="false"><i class="fa-solid fa-palette"></i></button>`;
    }

    function toggleCreativePreferenceMount() {
        if (normalizeChatMode(state.chatMode) !== 'creative') return;
        state.creativePreferenceExpanded = !state.creativePreferenceExpanded;
        renderCreativePreferenceMount();
    }

    function creativeGenerationForAction(action) {
        if (!action || typeof action !== 'object') return { state: 'awaiting_confirmation', assets: [] };
        action.type = action.type === 'offer_image' ? 'offer_image' : 'generate_image';
        action.target = 'canvas_run';
        action.media_inputs = (Array.isArray(action.media_inputs) ? action.media_inputs : [])
            .slice(0, MAX_ATTACHMENTS)
            .map(normalizeCreativeMediaInput)
            .filter(Boolean);
        const requestedTask = String(action.requested_task || action.task_request?.task || action.task || '').trim().toLowerCase().replace(/[- ]/g, '_');
        if (!action.requested_task && CREATIVE_GENERATION_TASKS.has(requestedTask)) action.requested_task = requestedTask;
        action.task = creativeActionTask(action, action.media_inputs.length);
        const noCompatibleRoute = action.execution_plan?.status === 'no_compatible_route';
        action.preset = String(action.preset || (noCompatibleRoute || CREATIVE_VIDEO_TASKS.has(action.task) ? '' : CREATIVE_DEFAULT_PRESET)).trim();
        action.aspect_ratio = String(action.aspect_ratio || 'auto').trim() || 'auto';
        action.image_number = Math.max(1, Math.min(4, Math.round(Number(action.image_number) || 1)));
        action.tool_call_id = String(action.tool_call_id || uid('describe_vlm_chat_tool'));
        action.ui_collapsed = !!action.ui_collapsed;
        if (!action.generation || typeof action.generation !== 'object') {
            action.generation = { state: 'awaiting_confirmation', assets: [] };
        }
        if (!Array.isArray(action.generation.assets)) action.generation.assets = [];
        return action.generation;
    }

    function clampCreativeActionMediaInputs(action, entry = creativePresetEntry(action?.preset)) {
        if (!action || typeof action !== 'object') return [];
        const maxImages = entry ? creativePresetMaxImages(entry) : MAX_ATTACHMENTS;
        action.media_inputs = (Array.isArray(action.media_inputs) ? action.media_inputs : [])
            .slice(0, Math.max(0, maxImages))
            .map(normalizeCreativeMediaInput)
            .filter(Boolean);
        action.media_inputs.forEach((input, index) => {
            input.role = index === 0 ? 'base_image' : `reference_image_${index}`;
        });
        action.task = creativeActionTask(action, action.media_inputs.length);
        return action.media_inputs;
    }

    function creativeMediaAssetSource(input) {
        const normalized = normalizeCreativeMediaInput(input);
        if (!normalized) return null;
        return {
            node_id: `describe_vlm_chat_media:${normalized.ref}`,
            type: 'image',
            title: normalized.name,
            asset: Object.assign({}, normalized.asset),
            mask: null,
            source: { kind: 'describe_vlm_chat' }
        };
    }

    function prepareAssistantActions(actions, mode, inputMediaAssets = [], runtime = null) {
        const mediaByRef = new Map((Array.isArray(inputMediaAssets) ? inputMediaAssets : []).map((item) => [String(item?.ref || ''), item]));
        const prepared = [];
        (Array.isArray(actions) ? actions : []).forEach((raw) => {
            if (!raw || typeof raw !== 'object') return null;
            const action = Object.assign({}, raw);
            if (action.type === 'set_creative_preference') {
                if (normalizeChatMode(mode) === 'creative' && String(action.scope || 'session') === 'session') {
                    setCreativePreference({
                        style: action.style,
                        preset: action.preset,
                        parameter_profile: action.parameter_profile
                    }, 'explicit_user_message', runtime);
                }
                return;
            }
            if (action.type !== 'generate_image') {
                prepared.push(action);
                return;
            }
            if (normalizeChatMode(mode) !== 'creative') {
                prepared.push({ type: 'set_prompt', target: 'main_prompt', prompt: String(action.prompt || ''), label: String(action.label || '') });
                return;
            }
            const plan = normalizeCreativeExecutionPlan(action.execution_plan);
            const requestedRefs = plan?.media_bindings?.length
                ? plan.media_bindings.map((binding) => binding.ref)
                : Array.isArray(action.media_refs) ? action.media_refs.map((ref) => String(ref || '')) : [];
            action.execution_plan = plan;
            action.requested_task = plan?.task || action.task_request?.task || action.task || '';
            action.task = plan?.task || creativeActionTask(action, requestedRefs.length);
            action.preset = plan?.preset || (plan?.status === 'no_compatible_route' ? '' : String(action.preset || CREATIVE_DEFAULT_PRESET));
            action.parameter_profile = String(plan?.parameter_profile || action.parameter_profile || '');
            action.preset_source = plan?.preset_source === 'session_preference'
                ? 'session_preference'
                : plan?.preset_source === 'request_hint' ? 'user' : 'agent_auto';
            action.media_inputs = requestedRefs.map((ref, index) => {
                const resolved = mediaByRef.get(ref);
                return resolved ? normalizeCreativeMediaInput(resolved, index) : null;
            }).filter(Boolean);
            const generation = creativeGenerationForAction(action);
            clampCreativeActionMediaInputs(action);
            if (plan && ['needs_media', 'needs_mask', 'needs_interaction', 'no_compatible_route', 'parameter_profile_missing', 'parameter_profile_incompatible'].includes(plan.status) && generation.state === 'awaiting_confirmation') {
                generation.state = plan.status;
            }
            prepared.push(action);
        });
        return prepared.filter((action) => action && String(action.prompt || '').trim());
    }

    function syncCreativePreferenceApplyButton() {
        const modal = document.getElementById('describe_vlm_chat_modal');
        const select = modal?.querySelector?.('[data-describe-vlm-chat-preference-preset]');
        const profileSelect = modal?.querySelector?.('[data-describe-vlm-chat-preference-parameter-profile]');
        const button = modal?.querySelector?.('[data-describe-vlm-chat-preference-apply]');
        if (!select || !button) return;
        const applied = Boolean(select.value)
            && String(select.value) === String(state.creativePreference?.preset || '')
            && String(profileSelect?.value || '') === String(state.creativePreference?.parameter_profile || '');
        button.classList.toggle('is-active', applied);
        button.setAttribute('aria-pressed', applied ? 'true' : 'false');
        const label = button.querySelector('span');
        if (label) label.textContent = applied ? localText('Preset active', '已使用') : localText('Use Preset', '使用 Preset');
    }

    function syncCreativePreferenceParameterProfileOptions() {
        const modal = document.getElementById('describe_vlm_chat_modal');
        const presetSelect = modal?.querySelector?.('[data-describe-vlm-chat-preference-preset]');
        const profileSelect = modal?.querySelector?.('[data-describe-vlm-chat-preference-parameter-profile]');
        if (!presetSelect || !profileSelect) return;
        const current = String(profileSelect.value || '');
        const profile = creativeParameterProfileEntry(current, presetSelect.value);
        profileSelect.innerHTML = creativeParameterProfileOptions(presetSelect.value, profile?.name || '');
        profileSelect.disabled = !String(presetSelect.value || '').trim();
    }

    function creativeAspectOptions() {
        const apiOptions = creativeCanvasApi()?.presetRunAspectOptions?.();
        return Array.isArray(apiOptions) && apiOptions.length ? apiOptions : [
            { key: 'auto' }, { key: '1:1' }, { key: '16:9' }, { key: '9:16' },
            { key: '4:3' }, { key: '3:4' }, { key: '2:3' }, { key: '3:2' }
        ];
    }

    function creativePresetOptions(action) {
        const noCompatibleRoute = action?.execution_plan?.status === 'no_compatible_route';
        const inputCount = Array.isArray(action?.media_inputs) ? action.media_inputs.length : 0;
        const task = creativeActionTask(action, inputCount);
        let selected = String(action?.preset || (noCompatibleRoute ? '' : CREATIVE_DEFAULT_PRESET));
        if (
            action?.roleplay_visual
            && !['user', 'session_preference'].includes(String(action?.preset_source || ''))
            && (!creativePresetEntry(selected) || selected === 'MiniMax-H3(R2I)')
        ) {
            const automatic = creativeCompatiblePresetEntry(task, inputCount);
            if (automatic) {
                selected = automatic.name;
                action.preset = selected;
            }
        }
        const rows = state.creativePresetCatalog.filter((entry) => creativePresetHasTaskRoute(entry, task, inputCount));
        if (noCompatibleRoute && !selected) {
            return `<option value="" selected disabled>${escapeHtml(localText('No compatible Preset', '没有兼容的 Preset'))}</option>`;
        }
        if (!rows.some((entry) => entry.name === selected)) {
            const selectedEntry = creativePresetEntry(selected);
            rows.unshift(Object.assign({}, selectedEntry || {}, {
                name: selected,
                display_name: `${selectedEntry?.display_name || selected} ${localText('(not available for this task)', '（不支持当前任务）')}`,
                task_incompatible: true
            }));
        }
        if (!rows.length) rows.push({ name: CREATIVE_DEFAULT_PRESET, display_name: CREATIVE_DEFAULT_PRESET });
        return rows.map((entry) => `<option value="${escapeHtml(entry.name)}" ${entry.name === selected ? 'selected' : ''} ${entry.task_incompatible ? 'disabled' : ''}>${escapeHtml(entry.display_name || entry.name)}</option>`).join('');
    }

    function creativeManualOutputTasks(action) {
        const inputCount = Array.isArray(action?.media_inputs) ? action.media_inputs.length : 0;
        const imageTask = inputCount > 1 ? 'multi_image_edit' : inputCount === 1 ? 'image_edit' : 'text_to_image';
        const videoTask = inputCount > 1 ? 'multi_image_to_video' : inputCount === 1 ? 'image_to_video' : 'text_to_video';
        const task = creativeActionTask(action, inputCount);
        if (!CREATIVE_MANUAL_OUTPUT_TASKS.has(task)) return null;
        return {
            imageTask,
            videoTask,
            selected: CREATIVE_VIDEO_TASKS.has(task) ? 'video' : 'image'
        };
    }

    function creativeOutputTypeControl(action, actionRef, disabled = '') {
        const tasks = creativeManualOutputTasks(action);
        if (!tasks) return '';
        return `<label><span>${escapeHtml(localText('Output', '生成类型'))}</span><select data-describe-vlm-chat-generation-output-type="${escapeHtml(actionRef)}" ${disabled}><option value="image" ${tasks.selected === 'image' ? 'selected' : ''}>${escapeHtml(localText('Image', '图片'))}</option><option value="video" ${tasks.selected === 'video' ? 'selected' : ''}>${escapeHtml(localText('Video', '视频'))}</option></select></label>`;
    }

    function creativeThemeControl(action, actionRef, disabled = '') {
        const entry = creativePresetEntry(action?.preset);
        const inputCount = Array.isArray(action?.media_inputs) ? action.media_inputs.length : 0;
        const task = creativeActionTask(action, inputCount);
        const themes = creativeTaskThemes(entry, task);
        if (themes.length < 2) return '';
        const selected = themes.includes(String(action?.execution_plan?.theme || ''))
            ? String(action.execution_plan.theme)
            : String(entry?.schema?.default_theme || themes[0]);
        const options = themes.map((theme) => `<option value="${escapeHtml(theme)}" ${theme === selected ? 'selected' : ''}>${escapeHtml(creativeThemeDisplayLabel(entry, theme))}</option>`).join('');
        return `<label><span>${escapeHtml(localText('Method', '处理方式'))}</span><select data-describe-vlm-chat-generation-theme="${escapeHtml(actionRef)}" ${disabled}>${options}</select></label>`;
    }

    function creativeParameterProfileControl(action, actionRef, disabled = '') {
        const preset = String(action?.preset || '');
        const selected = String(action?.parameter_profile || action?.execution_plan?.parameter_profile || '');
        const available = state.creativeParameterProfiles.some((item) => String(item.preset || '') === preset);
        const roleplayVisual = !!action?.roleplay_visual;
        if (!roleplayVisual && !available && !selected) return '';
        const selectedPreset = String(action?.parameter_profile_preset || preset);
        const label = roleplayVisual
            ? localText('Private parameter profile', '私人参数预设')
            : localText('Parameter profile', '参数预设');
        const options = creativeParameterProfileOptions(
            preset,
            selected,
            roleplayVisual ? { includeAll: true, selectedPreset } : {}
        );
        return `<label><span>${escapeHtml(label)}</span><select data-describe-vlm-chat-generation-parameter-profile="${escapeHtml(actionRef)}" ${disabled}>${options}</select></label>`;
    }

    function creativeAssetUrl(value) {
        const raw = String(value || '').trim();
        if (!raw) return '';
        if (/^\/file=/i.test(raw)) return `/gradio_api/file=${raw.slice('/file='.length)}`;
        if (/^(?:data:(?:image|video)\/[a-z0-9.+-]+(?:;[^,]*)?,|blob:)/i.test(raw)) return raw;
        try {
            const pageLocation = window.location || {};
            const parsed = new URL(raw, window.location?.href || document.baseURI);
            if (!/^https?:$/i.test(parsed.protocol)) return '';
            const isLoopback = (hostname) => ['127.0.0.1', 'localhost', '::1'].includes(String(hostname || '').toLowerCase());
            if (isLoopback(parsed.hostname) && /^https?:$/i.test(String(pageLocation.protocol || ''))) {
                parsed.protocol = pageLocation.protocol || parsed.protocol;
                parsed.host = pageLocation.host || parsed.host;
            }
            return parsed.href;
        } catch (err) {
            return '';
        }
    }

    function creativeResponseError(response) {
        const code = String(response?.error || '').trim();
        if (code === 'generation_not_allowed') {
            return localText('The current identity is not allowed to generate images.', '当前身份没有生图权限。');
        }
        if (code === 'run not found') {
            return localText('The generation task is no longer available.', '生成任务已不可用。');
        }
        if (code === 'parameter_profile_missing' || code === 'parameter_profile_ambiguous') {
            return localText('The private parameter profile is unavailable.', '私人参数预设已不存在或名称不明确。');
        }
        if (code === 'parameter_profile_incompatible') {
            return localText('The private parameter profile does not match this Preset method.', '私人参数预设与当前 Preset 处理方式不兼容。');
        }
        return String(response?.details || response?.error || localText('Generation failed.', '生成失败。'));
    }

    function creativeStateLabel(generation) {
        const current = String(generation?.state || 'awaiting_confirmation').toLowerCase();
        if (current === 'needs_media') return localText('Input image required', '需要引用输入图片');
        if (current === 'needs_mask') return localText('Manual mask required', '需要手动绘制遮罩');
        if (current === 'needs_interaction') return localText('Manual setup required', '需要手动设置');
        if (current === 'no_compatible_route') return localText('No compatible generation route', '没有兼容的生成路线');
        if (current === 'parameter_profile_missing') return localText('Parameter profile unavailable', '参数预设不可用');
        if (current === 'parameter_profile_incompatible') return localText('Parameter profile incompatible', '参数预设不兼容');
        if (current === 'checking_models') return localText('Checking models', '正在检查模型');
        if (current === 'models_missing') {
            const count = Math.max(0, Number(generation?.missing_count) || 0);
            return localText(`${count} required model file(s) are missing`, `缺少 ${count} 个所需模型文件`);
        }
        if (current === 'preset_missing') {
            return localText('Selected Preset is no longer available', '所选 Preset 已不可用');
        }
        if (current === 'preparing') return localText('Preparing task', '正在准备任务');
        if (current === 'queued') return localText('Queued', '排队中');
        if (current === 'running') return localText('Generating', '生成中');
        if (current === 'cancelling') return localText('Stopping', '正在停止');
        if (current === 'skipping') return localText('Skipping', '正在跳过');
        if (current === 'finished') return localText('Finished', '生成完成');
        if (current === 'canceled') return localText('Stopped', '已停止');
        if (current === 'skipped') return localText('Skipped', '已跳过');
        if (current === 'skipped_queue_limit') return localText('Skipped: queue limit', '已跳过：后台队列已满');
        if (current === 'stale_branch') return localText('Branch changed', '剧情分支已变化');
        if (current === 'failed') return String(generation?.error || generation?.message || localText('Generation failed.', '生成失败。'));
        return localText('Ready', '等待确认');
    }

    function creativeTaskLabel(task) {
        const labels = {
            text_to_image: ['Image generation', '生图'],
            text_to_video: ['Text to video', '文生视频'],
            image_to_video: ['Image to video', '图生视频'],
            multi_image_to_video: ['Reference images to video', '多参考视频'],
            image_edit: ['Image edit', '图片编辑'],
            multi_image_edit: ['Multi-image edit', '多图编辑'],
            image_upscale: ['Image upscale', '图像放大'],
            image_restore: ['Image restoration', '图像修复'],
            image_detail_enhance: ['Detail enhancement', '细节增强'],
            image_background_removal: ['Remove background', '去背景'],
            image_object_removal: ['Remove object', '去除物体'],
            image_outpaint: ['Image outpaint', '扩图'],
            image_relight: ['Image relighting', '图像重打光'],
            image_style_transfer: ['Style transfer', '风格迁移'],
            image_face_swap: ['Face swap', '换脸'],
            image_pose_transfer: ['Pose transfer', '姿势迁移'],
            image_pose_extraction: ['Pose extraction', '姿势提取'],
            image_anime_to_real: ['Anime to real', '动漫转真人'],
            image_view_synthesis: ['View synthesis', '多视角生成'],
            image_depth_estimation: ['Depth estimation', '深度估计'],
            image_object_transfer: ['Object transfer', '物体迁移'],
            image_expression_transfer: ['Expression transfer', '表情迁移']
        };
        const label = labels[String(task || '')] || labels.text_to_image;
        return localText(label[0], label[1]);
    }

    function creativePreviewSource(generation) {
        const preview = generation?.preview && typeof generation.preview === 'object' ? generation.preview : {};
        return creativeAssetUrl(preview.data_url || preview.thumb || '');
    }

    function creativeResultImageKey(asset, source = '') {
        const identity = String(
            asset?.asset_id || asset?.output_path || asset?.path || asset?.preview_url || source || ''
        ).trim();
        return identity ? `creative-result:${identity.slice(0, MAX_PERSISTED_TEXT)}` : '';
    }

    async function creativeResultImagePayload(asset, index = 0) {
        const source = persistedMediaAssetSource(asset);
        const imageKey = creativeResultImageKey(asset, source);
        if (!asset || !source || !imageKey) throw new Error('generated image is unavailable');
        const response = await fetch(source, { credentials: 'same-origin' });
        if (!response.ok) throw new Error(`image fetch failed: ${response.status}`);
        const blob = await response.blob();
        const mime = String(blob.type || asset.mime || 'image/png').toLowerCase();
        if (!mime.startsWith('image/')) throw new Error('result asset is not an image');
        const rawExt = (mime.split('/')[1] || 'png').split(';')[0].replace('svg+xml', 'svg');
        const ext = rawExt === 'jpeg' ? 'jpg' : rawExt;
        const dataUrl = await blobToDataUrl(blob);
        return imagePayloadFromDataUrl(dataUrl, {
            id: uid('describe_result_ref'),
            name: asset.name || `generated-image-${Number(index) + 1}.${ext}`,
            mime,
            originalSize: blob.size || null,
            key: imageKey
        });
    }

    // Legacy no-argument contract: function latestConversationImageCandidate()
    function latestConversationImageCandidate(messages = state.messages) {
        const source = Array.isArray(messages) ? messages : [];
        for (let messageIndex = source.length - 1; messageIndex >= 0; messageIndex -= 1) {
            const message = source[messageIndex];
            const payloads = Array.isArray(message?._image_payloads) ? message._image_payloads : [];
            for (let index = payloads.length - 1; index >= 0; index -= 1) {
                const payload = payloads[index];
                if (mediaKind(payload) === 'image' && payload?.data_url) return { payload };
            }
            const actions = Array.isArray(message?.actions) ? message.actions : [];
            for (let actionIndex = actions.length - 1; actionIndex >= 0; actionIndex -= 1) {
                const action = actions[actionIndex];
                if (!['generate_image', 'offer_image'].includes(action?.type)) continue;
                if (String(action.generation?.state || '').toLowerCase() !== 'finished') continue;
                const assets = (Array.isArray(action.generation?.assets) ? action.generation.assets : [])
                    .map(normalizeCreativeAsset)
                    .filter((asset) => asset && mediaKind(asset) === 'image');
                if (assets.length) return { asset: assets[assets.length - 1], index: assets.length - 1 };
            }
            const summaries = Array.isArray(message?.images) ? message.images : [];
            for (let index = summaries.length - 1; index >= 0; index -= 1) {
                const summary = summaries[index];
                const thumb = String(summary?.thumb || '').trim();
                if (mediaKind(summary) === 'image' && thumb && thumb !== ONE_PIXEL_IMAGE) {
                    return { summary, messageId: String(message?.id || ''), index };
                }
            }
        }
        return null;
    }

    async function previousConversationImagePayload(messages = state.messages) {
        const candidate = latestConversationImageCandidate(messages);
        if (!candidate) return null;
        if (candidate.payload) return candidate.payload;
        if (candidate.asset) return creativeResultImagePayload(candidate.asset, candidate.index);
        const summary = candidate.summary;
        return imagePayloadFromDataUrl(summary.thumb, {
            id: uid('describe_previous_ref'),
            name: summary.name || 'previous-chat-image.jpg',
            mime: summary.mime || imageMimeFromDataUrl(summary.thumb),
            width: summary.width,
            height: summary.height,
            key: `previous-chat:${candidate.messageId}:${candidate.index}`,
        });
    }

    function renderCreativeFinishedResult(action, actionRef, assets) {
        const rerunTitle = localText('Generate again', '再次生成');
        const copyTitle = localText('Copy prompt', '复制提示词');
        const characterReferenceImage = !!action?.roleplay_character_image;
        const stateAppearanceImage = !!action?.roleplay_state_image;
        const sceneReferenceImage = !!action?.roleplay_scene_reference_image;
        const adoptTitle = characterReferenceImage
            ? localText('Adopt as character reference', '采用为角色设定图')
            : stateAppearanceImage
                ? localText('Adopt as current appearance', '采用为当前状态图')
                : localText('Adopt as scene reference', '采用为场景参考图');
        const presetName = String(action?.preset || CREATIVE_DEFAULT_PRESET).trim() || CREATIVE_DEFAULT_PRESET;
        const presetLabel = action?.preset_source === 'agent_auto'
            ? localText('Agent Preset', 'Agent 使用的 Preset')
            : 'Preset';
        return `<div class="describe-vlm-chat-generated-result" data-describe-vlm-chat-generation-ref="${escapeHtml(actionRef)}"><div class="describe-vlm-chat-generated-meta" title="${escapeHtml(`${presetLabel}: ${presetName}`)}"><i class="fa-solid fa-wand-magic-sparkles"></i><span>${escapeHtml(presetLabel)}</span><b>${escapeHtml(presetName)}</b></div>${assets.map((asset, index) => {
            const src = persistedMediaAssetSource(asset);
            const video = mediaKind(asset) === 'video';
            const resultLabel = video
                ? localText(`Generated video ${index + 1}`, `生成视频 ${index + 1}`)
                : localText(`Generated image ${index + 1}`, `生成图片 ${index + 1}`);
            if (!src) {
                return `<div class="describe-vlm-chat-generated-media is-unavailable"><span><i class="fa-solid ${video ? 'fa-film' : 'fa-image'}"></i>${escapeHtml(localText('Preview unavailable', '暂时无法预览'))}</span></div>`;
            }
            if (video) {
                return `<div class="describe-vlm-chat-generated-media is-video">
  <video src="${escapeHtml(src)}" aria-label="${escapeHtml(resultLabel)}" controls preload="metadata" playsinline></video>
  <div class="describe-vlm-chat-generated-tools" role="toolbar" aria-label="${escapeHtml(localText('Video actions', '视频操作'))}">
    <button type="button" data-describe-vlm-chat-generation-run="${escapeHtml(actionRef)}" title="${escapeHtml(rerunTitle)}" aria-label="${escapeHtml(rerunTitle)}"><i class="fa-solid fa-rotate-right"></i></button>
    <button type="button" data-describe-vlm-chat-copy="${escapeHtml(actionRef)}" title="${escapeHtml(copyTitle)}" aria-label="${escapeHtml(copyTitle)}"><i class="fa-solid fa-copy"></i></button>
  </div>
</div>`;
            }
            const imageKey = creativeResultImageKey(asset, src);
            const accepted = (characterReferenceImage || stateAppearanceImage || sceneReferenceImage)
                && String(action.accepted_asset_id || '') === String(asset.asset_id || '');
            const adoptAttribute = characterReferenceImage
                ? 'data-describe-vlm-chat-roleplay-character-reference-accept'
                : stateAppearanceImage
                    ? 'data-describe-vlm-chat-roleplay-state-accept'
                    : 'data-describe-vlm-chat-roleplay-scene-reference-accept';
            const adoptedLabel = characterReferenceImage
                ? localText('Character reference adopted', '角色设定图已采用')
                : stateAppearanceImage
                    ? localText('Current appearance adopted', '当前状态图已采用')
                    : localText('Scene reference adopted', '场景参考图已采用');
            const adoptControl = characterReferenceImage || stateAppearanceImage || sceneReferenceImage
                ? `<button type="button" class="${accepted ? 'is-active' : ''}" ${adoptAttribute}="${escapeHtml(actionRef)}" data-describe-vlm-chat-generation-asset="${index}" title="${escapeHtml(accepted ? adoptedLabel : adoptTitle)}" aria-label="${escapeHtml(accepted ? adoptedLabel : adoptTitle)}" ${accepted ? 'disabled' : ''}><i class="fa-solid ${accepted ? 'fa-check' : 'fa-person-circle-check'}"></i></button>`
                : '';
            const attached = Boolean(imageKey) && state.pendingImages.some((image) => String(image?.key || '') === imageKey);
            const waitingAction = latestNeedsMediaCreativeAction(actionRef);
            const attachTitle = waitingAction
                ? localText('Use this image for the waiting edit', '将这张图片用于等待中的修图任务')
                : attached
                ? localText('Image referenced in next message', '图片已引用到下一条消息')
                : localText('Reference image in next message', '引用图片继续对话');
            const imageControl = waitingAction
                ? `<button type="button" class="describe-vlm-chat-generated-select" data-describe-vlm-chat-generation-attach="${escapeHtml(actionRef)}" data-describe-vlm-chat-generation-asset="${index}" title="${escapeHtml(attachTitle)}" aria-label="${escapeHtml(attachTitle)}"><img src="${escapeHtml(src)}" alt="${escapeHtml(resultLabel)}" loading="lazy"></button>`
                : `<a href="${escapeHtml(src)}" target="_blank" rel="noopener" title="${escapeHtml(resultLabel)}"><img src="${escapeHtml(src)}" alt="${escapeHtml(resultLabel)}" loading="lazy"></a>`;
            return `<div class="describe-vlm-chat-generated-media">
  ${imageControl}
  <div class="describe-vlm-chat-generated-tools" role="toolbar" aria-label="${escapeHtml(localText('Image actions', '图片操作'))}">
    ${adoptControl}
    <button type="button" class="${attached ? 'is-active' : ''}" data-describe-vlm-chat-generation-attach="${escapeHtml(actionRef)}" data-describe-vlm-chat-generation-asset="${index}" title="${escapeHtml(attachTitle)}" aria-label="${escapeHtml(attachTitle)}" aria-pressed="${attached ? 'true' : 'false'}"><i class="fa-solid ${attached ? 'fa-check' : 'fa-image'}"></i></button>
    <button type="button" data-describe-vlm-chat-generation-run="${escapeHtml(actionRef)}" title="${escapeHtml(rerunTitle)}" aria-label="${escapeHtml(rerunTitle)}"><i class="fa-solid fa-rotate-right"></i></button>
    <button type="button" data-describe-vlm-chat-copy="${escapeHtml(actionRef)}" title="${escapeHtml(copyTitle)}" aria-label="${escapeHtml(copyTitle)}"><i class="fa-solid fa-copy"></i></button>
  </div>
</div>`;
        }).join('')}</div>`;
    }

    async function attachCreativeResultImage(ref, assetIndex) {
        const found = creativeActionFromRef(ref);
        const index = Number(assetIndex);
        const generation = found ? creativeGenerationForAction(found.action) : null;
        const assets = (Array.isArray(generation?.assets) ? generation.assets : []).map(normalizeCreativeAsset).filter(Boolean);
        const asset = Number.isInteger(index) && index >= 0 ? assets[index] : null;
        const source = persistedMediaAssetSource(asset);
        const imageKey = creativeResultImageKey(asset, source);
        if (!asset || !source || !imageKey) {
            setStatus(localText('The generated image is no longer available.', '这张结果图已不可用。'), true);
            return false;
        }
        const waitingAction = latestNeedsMediaCreativeAction(ref);
        if (waitingAction) {
            return bindCreativeMediaInputsToAction(waitingAction.ref, [{
                ref: imageKey.slice(0, 160),
                name: String(asset.name || `Generated image ${index + 1}`),
                type: 'image',
                asset
            }]);
        }
        const customApi = readDescribeCustomApi(readSelectedVlmVersion());
        if (customApi && customApi.supports_images === false) {
            setStatus(localText(
                'The selected Custom API has image input disabled.',
                '当前 Custom API 未启用图像输入。'
            ), true);
            return false;
        }
        const attachedMessage = localText(
            'Result image referenced. Send your next message so the Agent can see and discuss it.',
            '结果图已引用到输入区。发送下一条消息后，Agent 才能看到并基于这张图交流。'
        );
        if (state.pendingImages.some((image) => String(image?.key || '') === imageKey)) {
            setStatus(attachedMessage);
            ensureModal().querySelector('[data-describe-vlm-chat-input]')?.focus();
            return true;
        }
        setStatus(localText('Reading generated image...', '正在读取结果图...'));
        try {
            const payload = await creativeResultImagePayload(asset, index);
            state.pendingImages.push(payload);
            if (state.pendingImages.length > MAX_ATTACHMENTS) {
                state.pendingImages = state.pendingImages.slice(-MAX_ATTACHMENTS);
            }
            renderPendingImages();
            renderMessages();
            ensureModal().querySelector('[data-describe-vlm-chat-input]')?.focus();
            setStatus(attachedMessage);
            return true;
        } catch (err) {
            setStatus(localText(
                'Could not reference this result image. Open the original image and attach it manually.',
                '结果图引用失败，请打开原图后手动添加。'
            ), true);
            return false;
        }
    }

    function renderCreativeMediaInputs(action, actionRef, disabled = '') {
        const inputs = clampCreativeActionMediaInputs(action);
        const entry = creativePresetEntry(action?.preset);
        const maxImages = entry ? creativePresetMaxImages(entry) : MAX_ATTACHMENTS;
        const selectLabel = localText('Select image', '选择图片');
        const selectButton = !disabled && inputs.length < maxImages
            ? `<button type="button" class="describe-vlm-chat-generation-media-add" data-describe-vlm-chat-generation-pick-media="${escapeHtml(actionRef)}" title="${escapeHtml(selectLabel)}" aria-label="${escapeHtml(selectLabel)}"><i class="fa-solid fa-image"></i><span>${escapeHtml(selectLabel)}</span></button>`
            : '';
        if (!inputs.length) {
            return CREATIVE_IMAGE_INPUT_TASKS.has(String(action?.task || ''))
                ? `<div class="describe-vlm-chat-generation-media-empty"><i class="fa-solid fa-triangle-exclamation"></i><span>${escapeHtml(localText('Select at least one image to continue this edit.', '选择至少一张图片后可继续当前修图。'))}</span>${selectButton}</div>`
                : '';
        }
        const countLabel = localText(`${inputs.length} / ${maxImages} input images`, `${inputs.length} / ${maxImages} 张输入图片`);
        return `<div class="describe-vlm-chat-generation-media">
  <div class="describe-vlm-chat-generation-media-head"><span>${escapeHtml(localText('Input images', '输入图片'))}</span><b>${escapeHtml(countLabel)}</b>${selectButton}</div>
  <div class="describe-vlm-chat-generation-media-list">${inputs.map((input, index) => {
            const preview = creativeAssetUrl(input?.asset?.preview_url || input?.asset?.thumb || input?.asset?.data_url);
            const roleLabel = index === 0 ? localText('Base image', '主体图') : localText(`Reference ${index}`, `参考图 ${index}`);
            const moveLeft = localText('Move image left', '向左移动图片');
            const moveRight = localText('Move image right', '向右移动图片');
            const remove = localText('Remove input image', '移除输入图片');
            return `<div class="describe-vlm-chat-generation-media-item">
  ${preview ? `<img src="${escapeHtml(preview)}" alt="${escapeHtml(roleLabel)}" loading="lazy">` : '<i class="fa-solid fa-image"></i>'}
  <span><b>${escapeHtml(roleLabel)}</b><small>${escapeHtml(input.name || `Image ${index + 1}`)}</small></span>
  <div>
    <button type="button" data-describe-vlm-chat-media-move="-1" data-describe-vlm-chat-media-ref="${escapeHtml(actionRef)}" data-describe-vlm-chat-media-index="${index}" title="${escapeHtml(moveLeft)}" aria-label="${escapeHtml(moveLeft)}" ${disabled || index === 0 ? 'disabled' : ''}><i class="fa-solid fa-arrow-left"></i></button>
    <button type="button" data-describe-vlm-chat-media-move="1" data-describe-vlm-chat-media-ref="${escapeHtml(actionRef)}" data-describe-vlm-chat-media-index="${index}" title="${escapeHtml(moveRight)}" aria-label="${escapeHtml(moveRight)}" ${disabled || index === inputs.length - 1 ? 'disabled' : ''}><i class="fa-solid fa-arrow-right"></i></button>
    <button type="button" data-describe-vlm-chat-media-remove data-describe-vlm-chat-media-ref="${escapeHtml(actionRef)}" data-describe-vlm-chat-media-index="${index}" title="${escapeHtml(remove)}" aria-label="${escapeHtml(remove)}" ${disabled}><i class="fa-solid fa-xmark"></i></button>
  </div>
</div>`;
        }).join('')}</div>
</div>`;
    }

    function renderCreativeOutpaintOptions(action, actionRef, disabled = '') {
        if (String(action?.task || '') !== 'image_outpaint') return '';
        if (!creativePresetSupportsOutpaintDirections(creativePresetEntry(action?.preset))) return '';
        const values = creativeOutpaintParameterOverrides(action);
        const fields = [
            ['scene_var_number7', 'up', localText('Up (%)', '向上 (%)')],
            ['scene_var_number8', 'down', localText('Down (%)', '向下 (%)')],
            ['scene_var_number9', 'left', localText('Left (%)', '向左 (%)')],
            ['scene_var_number10', 'right', localText('Right (%)', '向右 (%)')]
        ];
        return `<div class="describe-vlm-chat-outpaint-options"><div class="describe-vlm-chat-generation-media-head"><span>${escapeHtml(localText('Outpaint area', '外扩区域'))}</span></div><div>${fields.map(([key, direction, label]) => `<label><span>${escapeHtml(label)}</span><input type="number" min="0" max="100" step="1" value="${values[key]}" data-describe-vlm-chat-outpaint="${direction}" data-describe-vlm-chat-outpaint-ref="${escapeHtml(actionRef)}" ${disabled}></label>`).join('')}</div></div>`;
    }

    function renderRoleplayVisualCharacterOptions(action, actionRef, disabled = '') {
        if (!action?.roleplay_visual || !Array.isArray(action.roleplay_character_options) || !action.roleplay_character_options.length) return '';
        const selected = new Set(
            (Array.isArray(action.roleplay_visible_character_ids)
                ? action.roleplay_visible_character_ids
                : action.roleplay_character_options.filter((item) => item?.selected).map((item) => item?.id)
            ).map((value) => String(value || '').trim()).filter(Boolean)
        );
        return `<div class="describe-vlm-chat-roleplay-visual-character-picker">
  <div class="describe-vlm-chat-generation-media-head"><span>${escapeHtml(localText('Subjects in story image', '场照中的人物'))}</span><b>${escapeHtml(localText(`${selected.size} selected`, `已选 ${selected.size} 个`))}</b></div>
  <div class="describe-vlm-chat-roleplay-visual-character-options">${action.roleplay_character_options.map((item) => {
            const id = String(item?.id || '').trim();
            const label = String(item?.label || id || localText('Unnamed character', '未命名角色')).trim();
            return `<label class="describe-vlm-chat-roleplay-visual-character-option">
    <input type="checkbox" data-describe-vlm-chat-roleplay-visual-character="${escapeHtml(actionRef)}" value="${escapeHtml(id)}"${selected.has(id) ? ' checked' : ''} ${disabled}>
    <span>${escapeHtml(label)}</span>
  </label>`;
        }).join('')}</div>
</div>`;
    }

    function renderCreativeGenerationAction(action, actionRef) {
        const generation = creativeGenerationForAction(action);
        const currentState = String(generation.state || 'awaiting_confirmation').toLowerCase();
        const active = CREATIVE_ACTIVE_STATES.has(currentState);
        const promptReformat = normalizeRoleplayPromptReformat(action.prompt_reformat);
        const promptReformatActive = promptReformat.state === 'running';
        const finished = currentState === 'finished';
        const prompt = String(action.prompt || '').trim();
        const progress = Math.max(0, Math.min(100, Math.round((Number(generation.percent) || 0) * 100)));
        const previewSource = creativePreviewSource(generation);
        const assets = (Array.isArray(generation.assets) ? generation.assets : []).map(normalizeCreativeAsset).filter(Boolean);
        if (finished && assets.length) return renderCreativeFinishedResult(action, actionRef, assets);
        const previewHtml = previewSource && !finished
            ? `<div class="describe-vlm-chat-generation-preview"><img src="${escapeHtml(previewSource)}" alt="${escapeHtml(localText('Sampling preview', '采样预览'))}"></div>`
            : '';
        const statusDetail = String(generation.message || '').trim();
        const roleplayAutoStart = !!(action?.roleplay_state_image || action?.roleplay_character_image || action?.roleplay_scene_reference_image);
        const planBlocked = ['needs_media', 'needs_mask', 'needs_interaction', 'no_compatible_route', 'parameter_profile_missing', 'parameter_profile_incompatible'].includes(currentState);
        const canSubmit = !active && !promptReformatActive && !planBlocked && !(roleplayAutoStart && currentState === 'awaiting_confirmation');
        const stateLabel = promptReformatActive
            ? localText('Preparing prompt for the selected Preset', '正在按当前 Preset 整理提示词')
            : roleplayAutoStart && currentState === 'awaiting_confirmation'
            ? localText('Starting', '正在启动')
            : creativeStateLabel(generation);
        const submitLabel = ['finished', 'failed', 'canceled', 'skipped', 'skipped_queue_limit'].includes(currentState)
            ? localText('Generate again', '再次生成')
            : ['models_missing', 'preset_missing'].includes(currentState)
                ? localText('Check again', '重新检查')
                : localText('Generate', '确认生成');
        const submitTitle = CREATIVE_VIDEO_TASKS.has(String(action?.task || '').trim().toLowerCase())
            ? localText('Submit video generation', '提交视频生成任务')
            : localText('Submit image generation', '提交生图任务');
        const stopTitle = localText('Stop generation', '停止生成');
        const disabled = active ? 'disabled' : '';
        const promptDisabled = active || promptReformatActive ? 'disabled' : '';
        const offered = action.type === 'offer_image';
        const collapsed = !!action.ui_collapsed;
        const offerReasonLabels = {
            scene_change: localText('New scene', '场景变化'),
            emotional_peak: localText('Emotional peak', '情绪高点'),
            climax: localText('Climax', '剧情高潮'),
            visual_reveal: localText('Visual reveal', '关键揭示'),
            character_moment: localText('Character moment', '角色时刻')
        };
        const cardTitle = offered
            ? localText('I want to draw this moment', '我想画下这一幕')
            : creativeTaskLabel(action.task);
        const offerReason = offered ? offerReasonLabels[String(action.offer_reason || '')] || '' : '';
        const presetLabel = action.preset_source === 'agent_auto'
            ? localText('Preset · Agent choice', 'Preset · Agent 本次选择')
            : 'Preset';
        const offerNote = offered && String(action.offer_text || '').trim()
            ? `<p class="describe-vlm-chat-offer-note">${escapeHtml(action.offer_text)}</p>`
            : '';
        const collapseTitle = collapsed ? localText('Expand generation details', '展开生图详情') : localText('Collapse generation details', '折叠生图详情');
        const headerStatus = collapsed ? creativeStateLabel(generation) : offerReason;
        const entry = creativePresetEntry(action?.preset);
        const outputTypeControl = creativeOutputTypeControl(action, actionRef, disabled);
        const videoDurationControl = creativeVideoDurationControl(action, actionRef, disabled, entry);
        const themeControl = creativeThemeControl(action, actionRef, disabled);
        const parameterProfileControl = creativeParameterProfileControl(action, actionRef, disabled);
        return `<div class="describe-vlm-chat-action-card describe-vlm-chat-generation${collapsed ? ' is-collapsed' : ''}" data-describe-vlm-chat-generation-ref="${escapeHtml(actionRef)}">
  <div class="describe-vlm-chat-generation-title"><i class="fa-solid ${offered ? 'fa-clapperboard' : 'fa-wand-magic-sparkles'}"></i><span>${escapeHtml(cardTitle)}</span>${headerStatus ? `<b>${escapeHtml(headerStatus)}</b>` : ''}${offered && !active ? `<button type="button" data-describe-vlm-chat-offer-dismiss="${escapeHtml(actionRef)}" title="${escapeHtml(localText('Dismiss this suggestion', '忽略这次提议'))}" aria-label="${escapeHtml(localText('Dismiss this suggestion', '忽略这次提议'))}"><i class="fa-solid fa-xmark"></i></button>` : ''}<button type="button" data-describe-vlm-chat-generation-collapse="${escapeHtml(actionRef)}" title="${escapeHtml(collapseTitle)}" aria-label="${escapeHtml(collapseTitle)}" aria-expanded="${collapsed ? 'false' : 'true'}"><i class="fa-solid ${collapsed ? 'fa-chevron-down' : 'fa-chevron-up'}"></i></button></div>
  <div class="describe-vlm-chat-generation-body" ${collapsed ? 'hidden' : ''}>
  ${offerNote}
  ${renderRoleplayVisualCharacterOptions(action, actionRef, disabled)}
  ${renderCreativeMediaInputs(action, actionRef, disabled)}
  ${renderCreativeOutpaintOptions(action, actionRef, disabled)}
  <div class="describe-vlm-chat-generation-prompt">
    <div class="describe-vlm-chat-generation-prompt-head"><span>${escapeHtml(localText('Prompt', '提示词'))}</span>${action.roleplay_visual ? `<button type="button" class="describe-vlm-chat-generation-reformat" data-describe-vlm-chat-generation-reformat-prompt="${escapeHtml(actionRef)}" title="${escapeHtml(localText('Rewrite the prompt for the selected Preset', '按当前 Preset 重新整理提示词'))}" aria-label="${escapeHtml(localText('Rewrite the prompt for the selected Preset', '按当前 Preset 重新整理提示词'))}" ${promptReformatActive ? 'disabled' : ''}><i class="fa-solid ${promptReformatActive ? 'fa-spinner fa-spin' : 'fa-wand-magic-sparkles'}"></i><span>${escapeHtml(promptReformatActive ? localText('Preparing', '整理中') : localText('Adapt to Preset', '按 Preset 整理'))}</span></button>` : ''}</div>
    <textarea rows="4" data-describe-vlm-chat-generation-prompt="${escapeHtml(actionRef)}" ${promptDisabled}>${escapeHtml(prompt)}</textarea>
    ${promptReformat.state === 'stale' ? `<small class="describe-vlm-chat-generation-prompt-note">${escapeHtml(localText('The selected Preset changed. Review or adapt the prompt before generating.', '当前 Preset 已改变，生成前请检查或按 Preset 整理提示词。'))}</small>` : ''}
    ${promptReformat.state === 'failed' && promptReformat.error ? `<small class="describe-vlm-chat-generation-prompt-note is-error">${escapeHtml(promptReformat.error)}</small>` : ''}
  </div>
  <div class="describe-vlm-chat-generation-options${themeControl ? ' has-theme' : ''}">
    ${outputTypeControl}
    <label><span>${escapeHtml(presetLabel)}</span><select data-describe-vlm-chat-generation-preset="${escapeHtml(actionRef)}" ${disabled}>${creativePresetOptions(action)}</select></label>
    ${videoDurationControl}
    ${themeControl}
    ${parameterProfileControl}
    <label><span>${escapeHtml(localText('Aspect', '比例'))}</span><select data-describe-vlm-chat-generation-aspect="${escapeHtml(actionRef)}" ${disabled}>${creativeAspectOptions().map((item) => `<option value="${escapeHtml(item.key)}" ${String(item.key) === action.aspect_ratio ? 'selected' : ''}>${escapeHtml(item.key === 'auto' ? localText('Auto', '自适应') : item.key)}</option>`).join('')}</select></label>
    <label><span>${escapeHtml(localText('Images', '数量'))}</span><select data-describe-vlm-chat-generation-count="${escapeHtml(actionRef)}" ${disabled}>${[1, 2, 3, 4].map((count) => `<option value="${count}" ${count === action.image_number ? 'selected' : ''}>${count}</option>`).join('')}</select></label>
  </div>
  ${previewHtml}
  <div class="describe-vlm-chat-generation-status is-${escapeHtml(currentState)}" aria-live="polite"><span>${escapeHtml(stateLabel)}</span>${active && progress ? `<progress max="100" value="${progress}"></progress><b>${progress}%</b>` : ''}${statusDetail && !['awaiting_confirmation', 'finished', 'failed', 'models_missing'].includes(currentState) ? `<small>${escapeHtml(statusDetail)}</small>` : ''}</div>
  <div class="describe-vlm-chat-action-buttons">
    ${canSubmit ? `<button type="button" data-describe-vlm-chat-generation-run="${escapeHtml(actionRef)}" title="${escapeHtml(submitTitle)}" aria-label="${escapeHtml(submitTitle)}"><i class="fa-solid fa-wand-magic-sparkles"></i><span>${escapeHtml(submitLabel)}</span></button>` : ''}
    ${active && generation.run_id ? `<button type="button" class="is-danger" data-describe-vlm-chat-generation-stop="${escapeHtml(actionRef)}" title="${escapeHtml(stopTitle)}" aria-label="${escapeHtml(stopTitle)}"><i class="fa-solid fa-stop"></i><span>${escapeHtml(localText('Stop', '停止'))}</span></button>` : ''}
    <button type="button" data-describe-vlm-chat-copy="${escapeHtml(actionRef)}" title="${escapeHtml(localText('Copy prompt', '复制提示词'))}" aria-label="${escapeHtml(localText('Copy prompt', '复制提示词'))}"><i class="fa-solid fa-copy"></i></button>
  </div>
  </div>
</div>`;
    }

    function creativeActionFromRef(ref, messages = state.messages) {
        const [messageIndex, actionIndex] = String(ref || '').split(':').map((part) => Number(part));
        const source = Array.isArray(messages) ? messages : [];
        const message = source[messageIndex];
        const action = message?.actions?.[actionIndex];
        return ['generate_image', 'offer_image'].includes(action?.type) ? { message, action, messageIndex, actionIndex } : null;
    }

    function creativeActionFromRuntimeIdentity(runtime, messageId, toolCallId) {
        const messages = Array.isArray(runtime?.messages) ? runtime.messages : [];
        const message = messages.find((item) => String(item?.id || '') === String(messageId || ''));
        if (!message) return null;
        const actions = Array.isArray(message.actions) ? message.actions : [];
        const actionIndex = actions.findIndex((item) => String(item?.tool_call_id || '') === String(toolCallId || ''));
        const action = actionIndex >= 0 ? actions[actionIndex] : null;
        return ['generate_image', 'offer_image'].includes(action?.type)
            ? { message, action, messageIndex: messages.indexOf(message), actionIndex }
            : null;
    }

    function roleplayVisualCharacterSelection(action, selectedIds) {
        if (!action?.roleplay_visual || !Array.isArray(action.roleplay_character_options)) return false;
        const valid = new Set(action.roleplay_character_options.map((item) => String(item?.id || '').trim()).filter(Boolean));
        const selected = Array.from(new Set((Array.isArray(selectedIds) ? selectedIds : []).map((value) => String(value || '').trim())))
            .filter((value) => valid.has(value));
        action.roleplay_visible_character_ids = selected;
        action.roleplay_character_options = action.roleplay_character_options.map((item) => Object.assign({}, item, {
            selected: selected.includes(String(item?.id || '').trim())
        }));
        const selectedOptions = action.roleplay_character_options.filter((item) => selected.includes(String(item?.id || '').trim()));
        const selectedCharacterOwners = new Set(
            selectedOptions
                .filter((item) => String(item?.owner_type || 'character').trim().toLowerCase() !== 'player')
                .map((item) => String(item?.id || '').trim())
                .filter(Boolean)
        );
        const selectedPlayerOwners = new Set(
            selectedOptions
                .filter((item) => String(item?.owner_type || '').trim().toLowerCase() === 'player')
                .map((item) => String(item?.id || '').trim())
                .filter(Boolean)
        );
        if (!Array.isArray(action.roleplay_all_reference_bindings) || (
            !action.roleplay_all_reference_bindings.length
            && Array.isArray(action.reference_bindings)
            && action.reference_bindings.length
        )) {
            action.roleplay_all_reference_bindings = Array.isArray(action.reference_bindings)
                ? action.reference_bindings.map((binding) => Object.assign({}, binding))
                : [];
        }
        const bindings = action.roleplay_all_reference_bindings;
        const retainedBindings = bindings.filter((binding) => {
            const ownerType = String(binding?.owner_type || '').trim();
            const ownerId = String(binding?.owner_id || '').trim();
            if (ownerType.startsWith('character')) return selectedCharacterOwners.has(ownerId);
            if (ownerType === 'player') return selectedPlayerOwners.has(ownerId);
            return true;
        });
        action.reference_bindings = retainedBindings;
        action.media_refs = retainedBindings.map((binding) => String(binding?.asset_id || '').trim()).filter(Boolean);
        action.media_inputs = retainedBindings.map((binding, index) => ({
            ref: String(binding?.asset_id || '').trim(),
            role: index === 0 ? 'base_image' : `reference_image_${index}`,
            name: `Picture ${index + 1}`,
            type: 'image',
            asset: { asset_id: String(binding?.asset_id || '').trim(), name: `Picture ${index + 1}` }
        })).filter((input) => input.ref);
        action.requested_task = action.media_inputs.length > 1
            ? 'multi_image_edit'
            : action.media_inputs.length === 1
                ? 'image_edit'
                : 'text_to_image';
        action.task = creativeActionTask(action, action.media_inputs.length);
        if (action.visual_snapshot && typeof action.visual_snapshot === 'object') {
            action.visual_snapshot.visible_characters = selected.slice();
        }
        const selectedLabels = selectedOptions
            .map((item) => String(item?.label || item?.id || '').trim())
            .filter(Boolean);
        const selectedDescriptions = selectedOptions
            .map((item) => {
                const label = String(item?.label || item?.id || '').trim();
                const description = String(item?.description || '').trim();
                return description ? `${label}: ${description}` : label;
            })
            .filter(Boolean);
        const promptLines = String(action.prompt || '').split('\n');
        const visibleLine = `Visible characters: ${selectedLabels.join(', ')}`;
        const visibleIndex = promptLines.findIndex((line) => /^Visible characters\s*:/i.test(line.trim()));
        if (visibleIndex >= 0) {
            if (selectedLabels.length) promptLines[visibleIndex] = visibleLine;
            else promptLines.splice(visibleIndex, 1);
        } else if (selectedLabels.length) promptLines.push(visibleLine);
        const descriptionLine = `Character descriptions: ${selectedDescriptions.join(' | ')}`;
        const descriptionIndex = promptLines.findIndex((line) => /^Character descriptions\s*:/i.test(line.trim()));
        if (descriptionIndex >= 0) {
            if (selectedDescriptions.length) promptLines[descriptionIndex] = descriptionLine;
            else promptLines.splice(descriptionIndex, 1);
        } else if (selectedDescriptions.length) {
            promptLines.push(descriptionLine);
        }
        action.prompt = promptLines.join('\n').trim();
        return true;
    }

    function syncRoleplayVisualCharacterSelection(ref, card = null) {
        const found = creativeActionFromRef(ref);
        if (!found || !found.action?.roleplay_visual) return found;
        const source = card || Array.from(document.querySelectorAll('[data-describe-vlm-chat-generation-ref]'))
            .find((item) => item.getAttribute('data-describe-vlm-chat-generation-ref') === String(ref));
        if (!source) return found;
        const selected = Array.from(source.querySelectorAll('[data-describe-vlm-chat-roleplay-visual-character]:checked'))
            .map((node) => node.value);
        roleplayVisualCharacterSelection(found.action, selected);
        return found;
    }

    function syncCreativeActionFromDom(ref) {
        const found = creativeActionFromRef(ref);
        if (!found) return null;
        const cards = Array.from(document.querySelectorAll('[data-describe-vlm-chat-generation-ref]'));
        const card = cards.find((item) => item.getAttribute('data-describe-vlm-chat-generation-ref') === String(ref));
        if (!card) return found;
        found.action.prompt = String(card.querySelector('[data-describe-vlm-chat-generation-prompt]')?.value || found.action.prompt || '').trim();
        found.action.preset = String(card.querySelector('[data-describe-vlm-chat-generation-preset]')?.value || found.action.preset || CREATIVE_DEFAULT_PRESET);
        const parameterProfileSelect = card.querySelector('[data-describe-vlm-chat-generation-parameter-profile]');
        const parameterProfileOption = parameterProfileSelect?.selectedOptions?.[0];
        found.action.parameter_profile = String(
            parameterProfileOption?.getAttribute('data-profile-name')
            || parameterProfileSelect?.value
            || ''
        ).trim();
        found.action.parameter_profile_preset = String(
            parameterProfileOption?.getAttribute('data-preset') || ''
        ).trim();
        const selectedTheme = String(card.querySelector('[data-describe-vlm-chat-generation-theme]')?.value || '').trim();
        if (selectedTheme) {
            found.action.execution_plan = Object.assign({}, found.action.execution_plan || {}, {
                preset: found.action.preset,
                theme: selectedTheme
            });
        }
        const selectedOutputType = String(card.querySelector('[data-describe-vlm-chat-generation-output-type]')?.value || '').trim();
        const outputTasks = creativeManualOutputTasks(found.action);
        if (selectedOutputType && outputTasks) {
            const selectedTask = selectedOutputType === 'video' ? outputTasks.videoTask : outputTasks.imageTask;
            found.action.requested_task = selectedTask;
            found.action.task = selectedTask;
        }
        found.action.aspect_ratio = String(card.querySelector('[data-describe-vlm-chat-generation-aspect]')?.value || found.action.aspect_ratio || 'auto');
        found.action.image_number = Math.max(1, Math.min(4, Math.round(Number(card.querySelector('[data-describe-vlm-chat-generation-count]')?.value || found.action.image_number || 1))));
        if (found.action?.roleplay_visual && card.querySelector('[data-describe-vlm-chat-roleplay-visual-character]')) {
            syncRoleplayVisualCharacterSelection(ref, card);
        }
        const durationInput = card.querySelector('[data-describe-vlm-chat-generation-duration]');
        const durationSpec = creativeVideoDurationSpec(found.action, creativePresetEntry(found.action.preset));
        const durationValue = Number(durationInput?.value);
        if (durationInput && durationSpec && durationSpec.interactive && Number.isFinite(durationValue)) {
            const parameterOverrides = Object.assign({}, found.action.execution_plan?.parameter_overrides || {});
            parameterOverrides.scene_video_duration = Math.max(
                durationSpec.minimum,
                Math.min(durationSpec.maximum, Math.round(durationValue * 100) / 100)
            );
            found.action.execution_plan = Object.assign({}, found.action.execution_plan || {}, { parameter_overrides: parameterOverrides });
        }
        if (
            String(found.action.task || '') === 'image_outpaint'
            && creativePresetSupportsOutpaintDirections(creativePresetEntry(found.action.preset))
        ) {
            const keys = { up: 'scene_var_number7', down: 'scene_var_number8', left: 'scene_var_number9', right: 'scene_var_number10' };
            const parameterOverrides = Object.assign({}, found.action.execution_plan?.parameter_overrides || {});
            card.querySelectorAll('[data-describe-vlm-chat-outpaint]').forEach((input) => {
                const key = keys[String(input.getAttribute('data-describe-vlm-chat-outpaint') || '')];
                if (key) parameterOverrides[key] = Math.max(0, Math.min(100, Math.round(Number(input.value) || 0)));
            });
            found.action.execution_plan = Object.assign({}, found.action.execution_plan || {}, { parameter_overrides: parameterOverrides });
        }
        return found;
    }

    function moveCreativeActionMediaInput(ref, index, delta) {
        const found = syncCreativeActionFromDom(ref);
        if (!found) return false;
        const inputs = Array.isArray(found.action.media_inputs) ? found.action.media_inputs : [];
        const from = Number(index);
        const to = from + Number(delta);
        if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= inputs.length || to >= inputs.length) return false;
        [inputs[from], inputs[to]] = [inputs[to], inputs[from]];
        clampCreativeActionMediaInputs(found.action);
        found.action.execution_plan = creativeExecutionPlanForEntry(found.action, creativePresetEntry(found.action.preset), found.action.preset_source || 'user');
        persistCreativeAction(true);
        return true;
    }

    function removeCreativeActionMediaInput(ref, index) {
        const found = syncCreativeActionFromDom(ref);
        if (!found) return false;
        const inputs = Array.isArray(found.action.media_inputs) ? found.action.media_inputs : [];
        const target = Number(index);
        if (!Number.isInteger(target) || target < 0 || target >= inputs.length) return false;
        inputs.splice(target, 1);
        clampCreativeActionMediaInputs(found.action);
        found.action.execution_plan = creativeExecutionPlanForEntry(found.action, creativePresetEntry(found.action.preset), found.action.preset_source || 'user');
        persistCreativeAction(true);
        return true;
    }

    function latestNeedsMediaCreativeAction(excludedRef = '') {
        for (let messageIndex = state.messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
            const actions = Array.isArray(state.messages[messageIndex]?.actions) ? state.messages[messageIndex].actions : [];
            for (let actionIndex = actions.length - 1; actionIndex >= 0; actionIndex -= 1) {
                const ref = `${messageIndex}:${actionIndex}`;
                if (ref === String(excludedRef || '')) continue;
                const action = actions[actionIndex];
                if (!['generate_image', 'offer_image'].includes(action?.type)) continue;
                const generationState = String(action?.generation?.state || action?.execution_plan?.status || '').toLowerCase();
                if (generationState === 'needs_media') return { ref, action };
            }
        }
        return null;
    }

    function bindCreativeMediaInputsToAction(ref, inputs) {
        const found = syncCreativeActionFromDom(ref);
        if (!found) return false;
        const entry = creativePresetEntry(found.action.preset);
        const maxImages = entry ? creativePresetMaxImages(entry) : MAX_ATTACHMENTS;
        const current = Array.isArray(found.action.media_inputs) ? found.action.media_inputs : [];
        const existing = new Set(current.map((input) => String(input?.ref || '')));
        for (const input of Array.isArray(inputs) ? inputs : []) {
            const normalized = normalizeCreativeMediaInput(input, current.length);
            if (!normalized || existing.has(normalized.ref) || current.length >= maxImages) continue;
            current.push(normalized);
            existing.add(normalized.ref);
        }
        found.action.media_inputs = current;
        clampCreativeActionMediaInputs(found.action, entry);
        found.action.execution_plan = creativeExecutionPlanForEntry(
            found.action,
            entry,
            found.action.preset_source === 'session_preference' ? 'session_preference' : found.action.preset_source === 'user' ? 'request_hint' : 'automatic'
        );
        const generation = creativeGenerationForAction(found.action);
        generation.state = found.action.execution_plan.status === 'ready' ? 'awaiting_confirmation' : found.action.execution_plan.status;
        generation.error = '';
        persistCreativeAction(true);

        const plannedTask = String(found.action.execution_plan?.task || creativeActionTask(
            found.action,
            found.action.media_inputs.length
        ));
        const required = creativeRequiredImageCount(entry, plannedTask);
        const remaining = found.action.execution_plan.status === 'needs_media'
            ? Math.max(0, required - found.action.media_inputs.length)
            : 0;
        setStatus(remaining
            ? localText(`Image added. Select ${remaining} more to continue.`, `图片已添加，还需选择 ${remaining} 张。`)
            : localText('Image added to the current edit. You can generate with the existing request.', '图片已加入当前修图任务，可按原请求直接生成。'));
        return true;
    }

    async function addCreativeActionImageFiles(ref, files) {
        const found = creativeActionFromRef(ref);
        if (!found) return false;
        const imageFiles = Array.from(files || []).filter((file) => /^image\//i.test(file.type || ''));
        if (!imageFiles.length) return false;
        const entry = creativePresetEntry(found.action.preset);
        const remainingSlots = Math.max(0, (entry ? creativePresetMaxImages(entry) : MAX_ATTACHMENTS) - (found.action.media_inputs?.length || 0));
        if (!remainingSlots) return false;
        setStatus(localText('Reading image...', '正在读取图片...'));
        const inputs = [];
        for (const file of imageFiles.slice(0, remainingSlots)) {
            try {
                const payload = await fileToImagePayload(file);
                inputs.push({
                    ref: String(payload.id || uid('describe_ref')).slice(0, 160),
                    name: payload.name || file.name || 'reference-image.png',
                    type: 'image',
                    asset: {
                        kind: 'browser_upload',
                        asset_id: String(payload.id || uid('describe_asset')).slice(0, 240),
                        mime: payload.mime,
                        width: payload.width,
                        height: payload.height,
                        size: payload.size,
                        data_url: payload.data_url,
                        thumb: payload.thumb
                    }
                });
            } catch (err) {
                setStatus(localText('Image read failed.', '读取图片失败。'), true);
            }
        }
        return bindCreativeMediaInputsToAction(ref, inputs);
    }

    function persistCreativeAction(render = true, renderOptions = {}, runtime = null) {
        const target = runtime || currentConversationRuntime();
        target.persistenceDirty = true;
        if (isCurrentConversationRuntime(target)) state.persistenceDirty = true;
        saveConversationSnapshot(target);
        if (render && isCurrentConversationRuntime(target)) renderMessages(renderOptions);
    }

    function applyCreativeRunResponse(ref, response, runtime = null) {
        const target = runtime || currentConversationRuntime();
        const found = creativeActionFromRef(ref, target.messages);
        if (!found) return null;
        const generation = creativeGenerationForAction(found.action);
        const currentState = String(generation.state || '').toLowerCase();
        const wasFinished = currentState === 'finished';
        const responseAssets = Array.isArray(response?.assets) ? response.assets : (response?.asset ? [response.asset] : []);
        const responseState = String(response?.state || (responseAssets.length ? 'finished' : generation.state || 'queued')).toLowerCase();
        const incomingFinishedWithAssets = responseState === 'finished' && responseAssets.length > 0;
        if (CREATIVE_TERMINAL_STATES.has(currentState) && !(currentState !== 'finished' && incomingFinishedWithAssets)) {
            return generation;
        }
        generation.state = responseState;
        generation.run_id = String(response?.run_id || generation.run_id || '');
        generation.percent = Math.max(0, Math.min(1, Number(response?.percent) || 0));
        generation.message = String(response?.message || '');
        generation.error = response?.ok === false ? creativeResponseError(response) : '';
        generation.submission_uncertain = false;
        const frames = Array.isArray(response?.preview_stream?.frames_delta) ? response.preview_stream.frames_delta : [];
        const preview = frames.length ? frames[frames.length - 1] : response?.preview;
        if (preview && typeof preview === 'object') generation.preview = Object.assign({}, preview);
        generation.preview_serial = Math.max(
            Number(generation.preview_serial) || 0,
            Number(response?.preview_stream?.latest_serial) || 0,
            Number(preview?.serial) || 0
        );
        if (responseAssets.length) generation.assets = responseAssets.map(normalizeCreativeAsset).filter(Boolean);
        if (CREATIVE_TERMINAL_STATES.has(responseState)) {
            generation.finished_at = String(response?.finished_at || new Date().toISOString());
        }
        persistCreativeAction(true, CREATIVE_TERMINAL_STATES.has(responseState) ? {} : { anchorGenerationRef: ref }, target);
        if (CREATIVE_TERMINAL_STATES.has(responseState) && found.action.roleplay_visual) {
            scheduleRoleplayVisualQueue(target);
        }
        if (!wasFinished && responseState === 'finished' && generation.assets.length) {
            const generatedVideo = CREATIVE_VIDEO_TASKS.has(String(found.action?.task || '').trim().toLowerCase())
                || generation.assets.some((asset) => mediaKind(asset) === 'video');
            setConversationStatus(target, target.autoAttachPreviousImage
                ? (generatedVideo
                    ? localText('Video generated. It is available in this chat window.', '视频已生成，可直接在当前聊天窗口查看。')
                    : localText(
                        'Image generated. Your next message will include the latest result image.',
                        '图片已生成。下一条消息会自动附带最新结果图。'
                    ))
                : (generatedVideo
                    ? localText('Video generated. You can play it in this chat window.', '视频已生成，可在当前聊天窗口播放。')
                    : localText(
                        'Image generated. To discuss it with the Agent, reference the image before sending your next message.',
                        '图片已生成。需要 Agent 继续看图交流时，请点击图片上的“引用图片”，再发送消息。'
                    )));
        }
        return generation;
    }

    function scheduleCreativeGenerationPoll(ref, runId, delay = CREATIVE_POLL_INTERVAL_MS, runtime = null) {
        const target = runtime || currentConversationRuntime();
        const id = String(runId || '');
        const initial = creativeActionFromRef(ref, target.messages);
        if (!id || !initial || target.creativeGenerationPolls.has(id)) return;
        const messageId = String(initial.message?.id || '');
        const toolCallId = String(initial.action?.tool_call_id || '');
        const timer = window.setTimeout(async () => {
            target.creativeGenerationPolls.delete(id);
            const found = creativeActionFromRuntimeIdentity(target, messageId, toolCallId)
                || creativeActionFromRef(ref, target.messages);
            if (!found || String(found.action.generation?.run_id || '') !== id) return;
            const api = creativeCanvasApi();
            if (!api || typeof api.pollRun !== 'function') {
                found.action.generation.state = 'failed';
                found.action.generation.error = localText('Canvas generation API is unavailable.', 'Canvas 生图接口不可用。');
                persistCreativeAction(true, {}, target);
                if (found.action.roleplay_visual) scheduleRoleplayVisualQueue(target);
                return;
            }
            const response = await api.pollRun(id, {
                after_preview_serial: Number(found.action.generation?.preview_serial) || 0,
                user_context: creativeUserContext()
            });
            const live = creativeActionFromRuntimeIdentity(target, messageId, toolCallId)
                || creativeActionFromRef(ref, target.messages);
            if (!live || live.action !== found.action || String(live.action.generation?.run_id || '') !== id) return;
            if (!response?.ok) {
                const failures = (Number(found.action.generation?._poll_failures) || 0) + 1;
                found.action.generation._poll_failures = failures;
                if (failures < 3 && String(response?.error || '') !== 'run not found') {
                    scheduleCreativeGenerationPoll(ref, id, CREATIVE_POLL_INTERVAL_MS * failures, target);
                    return;
                }
                found.action.generation.state = 'failed';
                found.action.generation.error = creativeResponseError(response);
                found.action.generation.message = String(response?.details || response?.error || '');
                persistCreativeAction(true, {}, target);
                if (found.action.roleplay_visual) scheduleRoleplayVisualQueue(target);
                return;
            }
            found.action.generation._poll_failures = 0;
            const generation = applyCreativeRunResponse(ref, response, target);
            if (generation && !CREATIVE_TERMINAL_STATES.has(String(generation.state || '').toLowerCase())) {
                scheduleCreativeGenerationPoll(ref, id, CREATIVE_POLL_INTERVAL_MS, target);
            }
        }, Math.max(0, Number(delay) || 0));
        target.creativeGenerationPolls.set(id, timer);
    }

    function resumeCreativeGenerationPolls(runtime = currentConversationRuntime()) {
        runtime.messages.forEach((message, messageIndex) => {
            (Array.isArray(message?.actions) ? message.actions : []).forEach((action, actionIndex) => {
                if (!['generate_image', 'offer_image'].includes(action?.type)) return;
                const generation = creativeGenerationForAction(action);
                if (generation.run_id && CREATIVE_ACTIVE_STATES.has(String(generation.state || '').toLowerCase())) {
                    scheduleCreativeGenerationPoll(`${messageIndex}:${actionIndex}`, generation.run_id, 100, runtime);
                }
            });
        });
        if (normalizeChatMode(runtime.chatMode) === 'roleplay') scheduleRoleplayVisualQueue(runtime);
    }

    function autoStartCreativeActionsForMessage(messageId, runtime = currentConversationRuntime()) {
        if (!runtime.creativePreference.auto_generate) return;
        const messageIndex = runtime.messages.findIndex((message) => String(message?.id || '') === String(messageId || ''));
        if (messageIndex < 0) return;
        const actions = Array.isArray(runtime.messages[messageIndex]?.actions) ? runtime.messages[messageIndex].actions : [];
        actions.forEach((action, actionIndex) => {
            if (action?.type !== 'generate_image') return;
            const generation = creativeGenerationForAction(action);
            if (String(generation.state || 'awaiting_confirmation').toLowerCase() !== 'awaiting_confirmation') return;
            startCreativeGeneration(`${messageIndex}:${actionIndex}`, runtime);
        });
    }

    function stopCreativePolls(runtime = currentConversationRuntime()) {
        runtime.creativeGenerationPolls.forEach((timer) => window.clearTimeout(timer));
        runtime.creativeGenerationPolls.clear();
    }

    function roleplayVisualActionMatchesRuntime(action, runtime) {
        if (!action?.roleplay_visual) return true;
        const session = normalizeRoleplaySession(runtime?.roleplaySession, runtime?.conversationId);
        const actionSessionId = String(action.session_id || '').trim();
        const actionBranchId = String(action.branch_id || '').trim();
        if (actionSessionId && actionSessionId !== String(session.id || '')) return false;
        if (actionBranchId && actionBranchId !== String(session.active_branch_id || 'main')) return false;
        return true;
    }

    function roleplayVisualQueueEntries(runtime) {
        const target = runtime || currentConversationRuntime();
        const entries = [];
        (Array.isArray(target?.messages) ? target.messages : []).forEach((message, messageIndex) => {
            (Array.isArray(message?.actions) ? message.actions : []).forEach((action, actionIndex) => {
                if (!action?.roleplay_visual || action.roleplay_visual_manual || !['generate_image', 'offer_image'].includes(action.type)) return;
                const generation = creativeGenerationForAction(action);
                entries.push({
                    ref: `${messageIndex}:${actionIndex}`,
                    message,
                    action,
                    generation,
                    messageIndex,
                    actionIndex
                });
            });
        });
        return entries;
    }

    function markRoleplayVisualQueueSkipped(entry) {
        if (!entry?.generation) return false;
        const current = String(entry.generation.state || '').toLowerCase();
        if (CREATIVE_TERMINAL_STATES.has(current) && current !== 'skipped_queue_limit') return false;
        entry.generation.state = 'skipped_queue_limit';
        entry.generation.run_id = '';
        entry.generation.skip_reason = 'queue_limit';
        entry.generation.queue_position = 0;
        entry.generation.finished_at = new Date().toISOString();
        entry.generation.error = localText(
            'This scene was skipped because the background scene queue is full.',
            '后台场照队列已满，这张场照已跳过。'
        );
        entry.generation.message = localText(
            'Only one scene can run and two more can wait in this story.',
            '同一剧情同时只运行 1 张场照，最多等待 2 张。'
        );
        return true;
    }

    function scheduleRoleplayVisualQueue(runtime = currentConversationRuntime()) {
        const target = runtime || currentConversationRuntime();
        if (!target || target.roleplayVisualQueueBusy) return false;
        const allEntries = roleplayVisualQueueEntries(target);
        let staleChanged = false;
        allEntries.forEach((entry) => {
            if (roleplayVisualActionMatchesRuntime(entry.action, target)) return;
            const current = String(entry.generation.state || '').toLowerCase();
            if (CREATIVE_TERMINAL_STATES.has(current)) return;
            entry.generation.state = 'stale_branch';
            entry.generation.run_id = '';
            entry.generation.error = localText(
                'This scene belongs to another story branch.',
                '这张场照属于另一条剧情分支。'
            );
            entry.generation.finished_at = new Date().toISOString();
            staleChanged = true;
        });
        if (staleChanged) persistCreativeAction(true, {}, target);
        const entries = allEntries.filter((entry) => roleplayVisualActionMatchesRuntime(entry.action, target));
        if (!entries.length) return false;
        const active = entries.filter((entry) => {
            const state = String(entry.generation.state || '').toLowerCase();
            return CREATIVE_ACTIVE_STATES.has(state) && state !== 'queued';
        });
        const queued = entries.filter((entry) => String(entry.generation.state || '').toLowerCase() === 'queued');
        const waiting = entries.filter((entry) => String(entry.generation.state || '').toLowerCase() === 'awaiting_confirmation');
        let changed = false;
        const retainedQueue = queued.slice(0, ROLEPLAY_VISUAL_WAITING_LIMIT);
        queued.slice(ROLEPLAY_VISUAL_WAITING_LIMIT).forEach((entry) => {
            changed = markRoleplayVisualQueueSkipped(entry) || changed;
        });
        waiting.forEach((entry) => {
            if (retainedQueue.length < ROLEPLAY_VISUAL_WAITING_LIMIT) {
                entry.generation.state = 'queued';
                entry.generation.skip_reason = '';
                entry.generation.queue_position = retainedQueue.length + 1;
                entry.generation.error = '';
                entry.generation.message = localText('Waiting for the current scene task.', '等待当前场照任务完成。');
                retainedQueue.push(entry);
                changed = true;
            } else {
                changed = markRoleplayVisualQueueSkipped(entry) || changed;
            }
        });
        retainedQueue.forEach((entry, index) => {
            entry.generation.queue_position = index + 1;
        });
        if (changed) persistCreativeAction(true, {}, target);
        if (active.length >= ROLEPLAY_VISUAL_RUNNING_LIMIT) return changed;
        const next = retainedQueue[0];
        if (!next) return changed;
        next.generation.state = 'queued';
        next.generation.queue_position = 1;
        target.roleplayVisualQueueBusy = true;
        persistCreativeAction(true, {}, target);
        Promise.resolve(startCreativeGeneration(next.ref, target))
            .catch((error) => {
                setConversationStatus(target, localText(
                    `Scene image failed: ${String(error?.message || error || '').slice(0, 160)}`,
                    `场照生成失败：${String(error?.message || error || '').slice(0, 160)}`
                ), true);
            })
            .finally(() => {
                target.roleplayVisualQueueBusy = false;
                scheduleRoleplayVisualQueue(target);
            });
        return true;
    }

    function autoStartRoleplayVisualActionForMessage(messageId, runtime = currentConversationRuntime()) {
        if (normalizeChatMode(runtime.chatMode) !== 'roleplay') return;
        const session = normalizeRoleplaySession(runtime.roleplaySession, runtime.conversationId);
        const queueMode = String(session.visual_config?.queue_mode || session.autoplay_config?.queue_mode || 'background')
            .trim().toLowerCase();
        if (!session.visual_config?.enabled || queueMode !== 'background') return;
        const messageIndex = runtime.messages.findIndex((message) => String(message?.id || '') === String(messageId || ''));
        if (messageIndex < 0) return;
        const actions = Array.isArray(runtime.messages[messageIndex]?.actions) ? runtime.messages[messageIndex].actions : [];
        let hasBackgroundCandidate = false;
        actions.forEach((action, actionIndex) => {
            if (!action?.roleplay_visual || action.roleplay_visual_manual || !['generate_image', 'offer_image'].includes(action.type)) return;
            if (!roleplayVisualActionMatchesRuntime(action, runtime)) {
                const generation = creativeGenerationForAction(action);
                generation.state = 'stale_branch';
                generation.error = localText(
                    'This scene belongs to another story branch.',
                    '这张场照属于另一条剧情分支。'
                );
                persistCreativeAction(true, {}, runtime);
                return;
            }
            const generation = creativeGenerationForAction(action);
            if (String(generation.state || 'awaiting_confirmation').toLowerCase() === 'awaiting_confirmation') {
                hasBackgroundCandidate = true;
            }
        });
        if (hasBackgroundCandidate) {
            setConversationStatus(runtime, localText('Scene image queued in the background.', '场照已在后台排队。'));
            scheduleRoleplayVisualQueue(runtime);
        }
    }

    async function startCreativeGeneration(ref, runtime = currentConversationRuntime()) {
        const found = isCurrentConversationRuntime(runtime)
            ? syncCreativeActionFromDom(ref)
            : creativeActionFromRef(ref, runtime.messages);
        if (!found) return;
        const action = found.action;
        if (!String(action.prompt || '').trim()) {
            setConversationStatus(runtime, localText('Enter a generation prompt first.', '请先填写生图提示词。'), true);
            return;
        }
        if (normalizeRoleplayPromptReformat(action.prompt_reformat).state === 'running') {
            setConversationStatus(runtime, localText('Wait for the prompt adaptation to finish.', '请等待提示词按当前 Preset 整理完成。'), true);
            return;
        }
        const previous = creativeGenerationForAction(action);
        const reusableRunId = previous.submission_uncertain && previous.run_id ? previous.run_id : '';
        const attemptToken = uid('describe_vlm_chat_attempt');
        action.generation = {
            state: 'checking_models',
            run_id: '',
            percent: 0,
            message: '',
            error: '',
            assets: previous.state === 'finished' ? previous.assets || [] : [],
            _attempt_token: attemptToken
        };
        persistCreativeAction(true, {}, runtime);
        const catalog = await ensureCreativePresetCatalog({ force: true });
        const current = creativeActionFromRef(ref, runtime.messages);
        if (!current || current.action.generation?._attempt_token !== attemptToken) return;
        const inputCount = Array.isArray(action.media_inputs) ? action.media_inputs.length : 0;
        const requestedTask = creativeActionTask(action, inputCount);
        let entry = creativePresetEntry(action.preset);
        const automaticRoleplayRoute = action?.roleplay_visual
            && !['user', 'session_preference'].includes(String(action?.preset_source || ''));
        if (automaticRoleplayRoute && (!entry || String(action.preset || '') === 'MiniMax-H3(R2I)')) {
            const automatic = creativeCompatiblePresetEntry(requestedTask, inputCount);
            if (automatic) {
                action.preset = automatic.name;
                entry = automatic;
            }
        }
        if (!entry && String(action.preset || '').trim()) {
            action.generation.state = 'preset_missing';
            action.generation.error = localText(
                'The selected Preset was renamed or deleted. Choose another Preset.',
                '所选 Preset 已改名或删除，请重新选择。'
            );
            persistCreativeAction(true, {}, runtime);
            return;
        }
        if (!entry) {
            entry = creativeCompatiblePresetEntry(requestedTask, inputCount)
                || (CREATIVE_VIDEO_TASKS.has(requestedTask) ? null : creativePresetEntry(CREATIVE_DEFAULT_PRESET))
                || catalog[0]
                || null;
        }
        if (!entry) {
            action.generation.state = 'failed';
            action.generation.error = localText('No compatible media Preset is available.', '没有可用的媒体生成 Preset。');
            persistCreativeAction(true, {}, runtime);
            return;
        }
        if (!creativePresetHasTaskRoute(entry, requestedTask, inputCount)) {
            action.generation.state = 'failed';
            action.generation.error = CREATIVE_IMAGE_INPUT_TASKS.has(requestedTask)
                ? localText(
                    'This Preset cannot perform the requested image-input task. Choose a compatible Preset.',
                    '这个 Preset 无法执行当前图像输入任务，请选择兼容的 Preset。'
                )
                : localText(
                    'This Preset does not support the requested task.',
                    '这个 Preset 不支持当前任务。'
                );
            persistCreativeAction(true, {}, runtime);
            return;
        }
        action.preset = entry.name;
        const mediaInputs = clampCreativeActionMediaInputs(action, entry);
        const sourceName = action.preset_source === 'session_preference' ? 'session_preference' : action.preset_source === 'user' ? 'request_hint' : 'automatic';
        const executionPlan = creativeExecutionPlanForEntry(action, entry, sourceName);
        action.execution_plan = executionPlan;
        if (['parameter_profile_missing', 'parameter_profile_incompatible'].includes(executionPlan.status)) {
            action.generation.state = executionPlan.status;
            action.generation.error = executionPlan.status === 'parameter_profile_missing'
                ? localText('The selected private parameter profile is no longer available.', '所选私人参数预设已不存在。')
                : localText('The selected private parameter profile does not match this Preset method.', '所选私人参数预设与当前 Preset 处理方式不兼容。');
            persistCreativeAction(true, {}, runtime);
            return;
        }
        if (['needs_mask', 'needs_interaction'].includes(executionPlan.status)) {
            action.generation.state = executionPlan.status;
            action.generation.error = executionPlan.status === 'needs_mask'
                ? localText('This route requires a manually painted mask. Open the Preset workspace to prepare the mask.', '这条路线需要手动绘制遮罩，请在 Preset 工作区完成遮罩后运行。')
                : localText('This route requires manual setup in the Preset workspace.', '这条路线需要在 Preset 工作区手动设置。');
            persistCreativeAction(true, {}, runtime);
            return;
        }
        const imageSlots = creativePresetImageSlots(entry).slice(0, creativePresetMaxImages(entry));
        const minImages = creativePresetMinImages(entry);
        if (CREATIVE_IMAGE_INPUT_TASKS.has(String(action.task || '')) && !mediaInputs.length) {
            action.generation.state = 'failed';
            action.generation.error = imageSlots.length
                ? localText('The source image is unavailable. Reference the image and send the edit request again.', '编辑源图不可用，请重新引用图片并发送编辑需求。')
                : localText('This Preset does not accept image input. Choose an image-editing Preset.', '这个 Preset 不接收图片，请选择图片编辑 Preset。');
            persistCreativeAction(true, {}, runtime);
            return;
        }
        if (mediaInputs.length < minImages) {
            action.generation.state = 'failed';
            action.generation.error = localText(
                `This Preset requires at least ${minImages} input images.`,
                `这个 Preset 至少需要 ${minImages} 张输入图片。`
            );
            persistCreativeAction(true, {}, runtime);
            return;
        }
        const assetSources = {};
        const mediaByRef = new Map(mediaInputs.map((input) => [String(input.ref || ''), input]));
        executionPlan.media_bindings.forEach((binding) => {
            const input = mediaByRef.get(String(binding.ref || ''));
            const source = creativeMediaAssetSource(input);
            const slot = imageSlots.includes(binding.slot) ? binding.slot : '';
            if (source && slot) assetSources[slot] = source;
        });
        const api = creativeCanvasApi();
        const presetNode = api?.buildPresetRunNode?.(entry, {
            id: `describe_vlm_chat_preset_${action.tool_call_id}`,
            prompt: action.prompt,
            aspectRatio: action.aspect_ratio,
            imageNumber: action.image_number,
            sceneTheme: executionPlan.theme,
            taskMethod: executionPlan.task_method,
            classicMode: executionPlan.classic_mode,
            enhanceTargets: executionPlan.enhance_targets,
            parameterOverrides: executionPlan.parameter_overrides,
            parameterProfile: executionPlan.parameter_profile
        });
        if (!api || !presetNode || typeof api.presetModelStatus !== 'function' || typeof api.runNode !== 'function') {
            action.generation.state = 'failed';
            action.generation.error = localText('Canvas generation API is unavailable.', 'Canvas 生图接口不可用。');
            persistCreativeAction(true, {}, runtime);
            return;
        }
        presetNode.upload_slot_sources = Object.assign({}, presetNode.upload_slot_sources || {}, assetSources);
        presetNode.upload_slots = Object.assign({}, presetNode.upload_slots || {});
        Object.entries(assetSources).forEach(([slot, source]) => {
            presetNode.upload_slots[slot] = String(source?.node_id || '');
        });
        const modelStatus = await api.presetModelStatus({
            project_id: 'describe_vlm_chat',
            preset_node: presetNode,
            user_context: creativeUserContext()
        });
        const liveAfterModelCheck = creativeActionFromRef(ref, runtime.messages);
        if (!liveAfterModelCheck || liveAfterModelCheck.action !== action || action.generation?._attempt_token !== attemptToken) return;
        if (!modelStatus?.ok) {
            action.generation.state = 'failed';
            action.generation.error = creativeResponseError(modelStatus);
            action.generation.message = String(modelStatus?.message || '');
            persistCreativeAction(true, {}, runtime);
            return;
        }
        if (!modelStatus.ready) {
            action.generation.state = 'models_missing';
            action.generation.missing_count = Math.max(0, Number(modelStatus.missing_count) || 0);
            action.generation.message = String(modelStatus.message || '');
            persistCreativeAction(true, {}, runtime);
            return;
        }
        const runId = reusableRunId || uid('describe_vlm_chat_run');
        action.generation.state = 'preparing';
        action.generation.run_id = runId;
        action.generation.started_at = new Date().toISOString();
        action.generation.message = '';
        persistCreativeAction(true, {}, runtime);
        const response = await api.runNode({
            project_id: 'describe_vlm_chat',
            run_id: runId,
            placeholder_node_id: `describe_vlm_chat_result_${action.tool_call_id}`,
            preset_node: presetNode,
            upload_edges: [],
            config_edges: [],
            text_edges: [],
            asset_sources: assetSources,
            user_context: creativeUserContext(),
            result_asset_scope: 'gallery',
            client_context: {
                surface: 'studio_vlm_chat',
                conversation_id: runtime.conversationId,
                message_id: String(found.message.id || ''),
                tool_call_id: action.tool_call_id,
                source_message_id: String(action.source_message_id || found.message.id || ''),
                scene_key: String(action.scene_key || ''),
                offer_reason: String(action.offer_reason || '')
            }
        });
        const liveAfterSubmit = creativeActionFromRef(ref, runtime.messages);
        if (!liveAfterSubmit || liveAfterSubmit.action !== action) {
            if (response?.ok) api.controlRun?.(runId, 'stop', { user_context: creativeUserContext() }).catch(() => {});
            return;
        }
        if (!response?.ok) {
            action.generation.state = 'failed';
            action.generation.run_id = runId;
            action.generation.submission_uncertain = !String(response?.details || '').trim();
            action.generation.error = creativeResponseError(response);
            action.generation.message = String(response?.details || response?.error || '');
            persistCreativeAction(true, {}, runtime);
            return;
        }
        // Legacy current-conversation form: const generation = applyCreativeRunResponse(ref, response);
        const generation = applyCreativeRunResponse(ref, response, runtime);
        if (generation && !CREATIVE_TERMINAL_STATES.has(String(generation.state || '').toLowerCase())) {
            scheduleCreativeGenerationPoll(ref, runId, 250, runtime);
        }
    }

    async function stopCreativeGeneration(ref) {
        const runtime = syncCurrentRuntimeFromState();
        const found = creativeActionFromRef(ref, runtime.messages);
        const runId = String(found?.action?.generation?.run_id || '');
        if (!found || !runId) return;
        found.action.generation.state = 'cancelling';
        persistCreativeAction(true, {}, runtime);
        const response = await creativeCanvasApi()?.controlRun?.(runId, 'stop', {
            user_context: creativeUserContext()
        });
        const live = creativeActionFromRef(ref, runtime.messages);
        if (!live || live.action !== found.action || String(live.action.generation?.run_id || '') !== runId) return;
        if (!response?.ok) {
            found.action.generation.state = 'failed';
            found.action.generation.error = creativeResponseError(response);
            persistCreativeAction(true, {}, runtime);
            return;
        }
        // Legacy current-conversation form: const generation = applyCreativeRunResponse(ref, response);
        const generation = applyCreativeRunResponse(ref, response, runtime);
        if (generation && !CREATIVE_TERMINAL_STATES.has(String(generation.state || '').toLowerCase())) {
            // Legacy current-conversation form: scheduleCreativeGenerationPoll(ref, runId, 200);
            scheduleCreativeGenerationPoll(ref, runId, 200, runtime);
        }
    }

    function dismissCreativeOffer(ref) {
        const found = creativeActionFromRef(ref);
        if (!found || found.action.type !== 'offer_image') return;
        const generation = creativeGenerationForAction(found.action);
        if (CREATIVE_ACTIVE_STATES.has(String(generation.state || '').toLowerCase())) {
            setStatus(localText('Stop the generation before dismissing this suggestion.', '请先停止生成任务，再忽略这次提议。'), true);
            return;
        }
        found.message.actions.splice(found.actionIndex, 1);
        state.persistenceDirty = true;
        saveConversationSnapshot();
        renderMessages();
        setStatus(localText('Scene suggestion dismissed.', '已忽略这次场景提议。'));
    }

    function activeCreativeRunIds(messages = state.messages) {
        const ids = [];
        (Array.isArray(messages) ? messages : []).forEach((message) => {
            (Array.isArray(message?.actions) ? message.actions : []).forEach((action) => {
                const generation = ['generate_image', 'offer_image'].includes(action?.type) ? action.generation : null;
                if (generation?.run_id && CREATIVE_ACTIVE_STATES.has(String(generation.state || '').toLowerCase())) ids.push(generation.run_id);
            });
        });
        return Array.from(new Set(ids));
    }

    function renderMessages(options = {}) {
        const modal = ensureModal();
        const log = modal.querySelector('[data-describe-vlm-chat-log]');
        if (!log) return;
        renderCreativePreferenceMount(modal);
        const previousScrollTop = log.scrollTop;
        const wasNearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
        const anchorRef = String(options?.anchorGenerationRef || '');
        const oldAnchorCard = anchorRef
            ? Array.from(log.querySelectorAll('[data-describe-vlm-chat-generation-ref]')).find((node) => node.getAttribute('data-describe-vlm-chat-generation-ref') === anchorRef)
            : null;
        const oldAnchor = oldAnchorCard?.querySelector?.('[data-describe-vlm-chat-generation-stop]') || oldAnchorCard;
        const oldAnchorTop = oldAnchor?.getBoundingClientRect?.().top;
        syncBusyControls(modal);
        if (!state.messages.length) {
            log.innerHTML = `<div class="describe-vlm-chat-empty">${escapeHtml(t('No chat yet.', '暂无对话。'))}</div>`;
            renderRoleplayInlineGenerationResults(modal);
            return;
        }
        log.innerHTML = state.messages.map((message, messageIndex) => {
            if (!message.id) message.id = uid(`describe_vlm_chat_${message.role || 'message'}`);
            const role = message.role === 'assistant' ? 'assistant' : 'user';
            const pending = !!message.pending;
            const actions = Array.isArray(message.actions) ? message.actions : [];
            const actionHtml = actions.length && !pending ? `<div class="describe-vlm-chat-actions">${actions.map((action, actionIndex) => {
                const promptText = String(action?.prompt || '').trim();
                if (!promptText) return '';
                const actionRef = `${messageIndex}:${actionIndex}`;
                if (['generate_image', 'offer_image'].includes(action?.type)) {
                    if (!state.creativePresetCatalogLoaded && !state.creativePresetCatalogLoading) {
                        ensureCreativePresetCatalog().catch(() => {});
                    }
                    return renderCreativeGenerationAction(action, actionRef);
                }
                const previewTitle = localText('Prepared prompt', '整理出的提示词');
                const setLabel = localText('Set', '写入');
                const setTitle = localText('Set main prompt', '写入主提示词');
                const appendLabel = localText('Append', '追加');
                const appendTitle = localText('Append to main prompt', '追加到主提示词');
                const copyLabel = localText('Copy', '复制');
                const copyTitle = localText('Copy prompt', '复制提示词');
                return `<div class="describe-vlm-chat-action-card">
  <div class="describe-vlm-chat-prompt-preview-label">${escapeHtml(previewTitle)}</div>
  <pre class="describe-vlm-chat-prompt-preview">${escapeHtml(promptText)}</pre>
  <div class="describe-vlm-chat-action-buttons">
    <button type="button" data-describe-vlm-chat-apply="${escapeHtml(actionRef)}" title="${escapeHtml(setTitle)}" aria-label="${escapeHtml(setTitle)}"><i class="fa-solid fa-arrow-right-to-bracket"></i><span>${escapeHtml(setLabel)}</span></button>
    <button type="button" data-describe-vlm-chat-append="${escapeHtml(actionRef)}" title="${escapeHtml(appendTitle)}" aria-label="${escapeHtml(appendTitle)}"><i class="fa-solid fa-plus"></i><span>${escapeHtml(appendLabel)}</span></button>
    <button type="button" data-describe-vlm-chat-copy="${escapeHtml(actionRef)}" title="${escapeHtml(copyTitle)}" aria-label="${escapeHtml(copyTitle)}"><i class="fa-solid fa-copy"></i><span>${escapeHtml(copyLabel)}</span></button>
  </div>
</div>`;
            }).join('')}</div>` : '';
            const label = role === 'assistant' ? t('Assistant', '助手') : t('You', '你');
            const completion = normalizeChatCompletion(message.completion);
            const completionSpeed = role === 'assistant' && !pending ? completionSpeedHtml(completion) : '';
            const variants = role === 'assistant' ? roleplayMessageVariants(message) : [];
            const activeVariantIndex = Math.max(0, Math.min(variants.length - 1, Number(message.active_variant_index) || 0));
            const variantControls = !pending && role === 'assistant' && normalizeChatMode(state.chatMode) === 'roleplay' && variants.length
                ? `<span class="describe-vlm-chat-variant-controls" role="group" aria-label="${escapeHtml(t('Reply versions', '回复版本'))}">
    ${variants.length > 1 ? `<button type="button" data-describe-vlm-chat-variant-prev="${messageIndex}" title="${escapeHtml(t('Previous reply version', '上一个回复版本'))}" aria-label="${escapeHtml(t('Previous reply version', '上一个回复版本'))}"><i class="fa-solid fa-chevron-left"></i></button><small>${activeVariantIndex + 1}/${variants.length}</small><button type="button" data-describe-vlm-chat-variant-next="${messageIndex}" title="${escapeHtml(t('Next reply version', '下一个回复版本'))}" aria-label="${escapeHtml(t('Next reply version', '下一个回复版本'))}"><i class="fa-solid fa-chevron-right"></i></button>` : ''}
    <button type="button" data-describe-vlm-chat-regenerate="${messageIndex}" title="${escapeHtml(t('Generate another reply version', '生成另一条回复版本'))}" aria-label="${escapeHtml(t('Generate another reply version', '生成另一条回复版本'))}"><i class="fa-solid fa-rotate-right"></i></button>
  </span>`
                : '';
            const completionWarningHtml = completion?.output_limited
                ? `<div class="describe-vlm-chat-completion-warning" role="alert"><i class="fa-solid fa-triangle-exclamation"></i><span>${escapeHtml(chatCompletionLimitMessage(completion))}</span></div>`
                : '';
            const stateChangesHtml = role === 'assistant' && !pending
                ? renderRoleplayStateChanges(message.roleplay_state_changes)
                : '';
            return `<div class="describe-vlm-chat-msg is-${role} ${pending ? 'is-pending' : ''}" data-describe-vlm-chat-message="${messageIndex}">
  <div class="describe-vlm-chat-msg-head"><b>${escapeHtml(label)}</b><span>
    ${completionSpeed}
    ${variantControls}
    <button type="button" data-describe-vlm-chat-copy-message="${messageIndex}" title="${escapeHtml(t('Copy message', '复制消息'))}" aria-label="${escapeHtml(t('Copy message', '复制消息'))}"><i class="fa-solid fa-copy"></i></button>
    <button type="button" data-describe-vlm-chat-quote="${messageIndex}" title="${escapeHtml(t('Quote to input', '引用到输入'))}" aria-label="${escapeHtml(t('Quote to input', '引用到输入'))}"><i class="fa-solid fa-reply"></i></button>
    <button type="button" data-describe-vlm-chat-rollback="${messageIndex}" title="${escapeHtml(t('Move this message back to input', '把这条消息放回输入框'))}" aria-label="${escapeHtml(t('Move this message back to input', '把这条消息放回输入框'))}"><i class="fa-solid fa-clock-rotate-left"></i></button>
    <button type="button" class="is-danger" data-describe-vlm-chat-delete="${messageIndex}" title="${escapeHtml(t('Delete this message from context', '从上下文删除此消息'))}" aria-label="${escapeHtml(t('Delete this message from context', '从上下文删除此消息'))}"><i class="fa-solid fa-trash"></i></button>
  </span></div>
  ${renderMessageImages(message.images, message.media_assets)}
  ${message.content ? `<p>${escapeHtml(message.content)}</p>` : ''}
  ${stateChangesHtml}
  ${completionWarningHtml}
  ${actionHtml}
</div>`;
        }).join('');
        renderRoleplayInlineGenerationResults(modal);
        if (oldAnchor && Number.isFinite(oldAnchorTop)) {
            const newAnchorCard = Array.from(log.querySelectorAll('[data-describe-vlm-chat-generation-ref]')).find((node) => node.getAttribute('data-describe-vlm-chat-generation-ref') === anchorRef);
            const newAnchor = newAnchorCard?.querySelector?.('[data-describe-vlm-chat-generation-stop]') || newAnchorCard;
            const newAnchorTop = newAnchor?.getBoundingClientRect?.().top;
            log.scrollTop = Number.isFinite(newAnchorTop)
                ? previousScrollTop + newAnchorTop - oldAnchorTop
                : previousScrollTop;
        } else {
            log.scrollTop = wasNearBottom ? log.scrollHeight : previousScrollTop;
        }
    }

    function historyTextForMessage(message) {
        let content = String(message?.content || '').trim();
        const actionPrompts = Array.isArray(message?.actions)
            ? message.actions.map((action) => String(action?.prompt || '').trim()).filter(Boolean)
            : [];
        if (actionPrompts.length) {
            content = `${content}${content ? '\n' : ''}${localText('Prepared prompt', '整理出的提示词')}:\n${actionPrompts.join('\n\n')}`.trim();
        }
        const imageCount = Number(message?.image_count || (Array.isArray(message?.images) ? message.images.length : 0) || 0);
        if (imageCount > 0) {
            const placeholder = `[${imageCount} previous visual media reference(s); full media bytes omitted from history.]`;
            content = `${content}${content ? '\n' : ''}${placeholder}`.trim();
        }
        return content;
    }

    function buildRollingHistory(limit = MAX_HISTORY_TURNS, budget = HISTORY_BUDGET, messages = state.messages) {
        const selected = [];
        let used = 0;
        let omitted = 0;
        const source = (Array.isArray(messages) ? messages : []).filter((item) => !item.pending);
        for (let i = source.length - 1; i >= 0; i -= 1) {
            const message = source[i];
            let content = historyTextForMessage(message);
            if (!content) {
                omitted += 1;
                continue;
            }
            const maxOne = Math.max(500, Math.min(1800, Math.floor(budget / 3)));
            if (content.length > maxOne) content = content.slice(-maxOne).trimStart();
            const role = message.role === 'assistant' ? 'assistant' : message.role === 'system' ? 'system' : 'user';
            const cost = role.length + content.length + 16;
            if (selected.length >= limit || (selected.length && used + cost > budget)) {
                omitted += 1;
                continue;
            }
            selected.push({ role, content, image_count: Number(message.image_count || 0) || 0 });
            used += cost;
        }
        selected.reverse();
        return { messages: selected, omitted, chars: used, budget };
    }

    async function addPendingImageFiles(files) {
        const mediaFiles = Array.from(files || []).filter((file) => /^(?:image|video)\//i.test(file.type || ''));
        if (!mediaFiles.length) return;
        const selectedCustomApi = readDescribeCustomApi(readSelectedVlmVersion());
        if (selectedCustomApi && selectedCustomApi.supports_images === false) {
            setStatus(t(
                'The selected Custom API has visual input disabled.',
                '当前 Custom API 未启用图像/视频输入。'
            ), true);
            return;
        }
        setStatus(t('Reading media...', '正在读取媒体文件...'));
        for (const file of mediaFiles.slice(0, MAX_ATTACHMENTS)) {
            try {
                const payload = await fileToMediaPayload(file);
                state.pendingImages.push(payload);
            } catch (err) {
                setStatus(String(err?.message || '').includes('too large')
                    ? t('Video attachment is too large (80 MB maximum).', '视频附件过大，最大支持 80 MB。')
                    : t('Media read failed.', '读取媒体文件失败。'), true);
            }
        }
        if (state.pendingImages.length > MAX_ATTACHMENTS) {
            state.pendingImages = state.pendingImages.slice(-MAX_ATTACHMENTS);
        }
        renderPendingImages();
        setStatus(`${t('Reference media attached.', '引用媒体已添加。')} ${imageUploadStatus(state.pendingImages)}`);
    }

    function collectClipboardImageFiles(dataTransfer) {
        const files = Array.from(dataTransfer?.files || []).filter((file) => /^(?:image|video)\//i.test(file.type || ''));
        if (files.length) return files;
        return Array.from(dataTransfer?.items || [])
            .filter((item) => item.kind === 'file' && /^(?:image|video)\//i.test(item.type || ''))
            .map((item) => item.getAsFile())
            .filter(Boolean);
    }

    function firstUriFromList(text) {
        return String(text || '').split(/\r?\n/).map((line) => line.trim()).find((line) => line && !line.startsWith('#')) || '';
    }

    function firstHtmlImageSrc(html) {
        if (!html) return '';
        try {
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const src = doc.querySelector('img[src]')?.getAttribute('src') || '';
            if (src) return src;
        } catch (err) {}
        const match = String(html).match(/<img\b[^>]*\bsrc=["']?([^"'\s>]+)/i);
        return match ? match[1] : '';
    }

    function base64UrlDecodeUtf8(value) {
        const text = String(value || '');
        if (!text) return '';
        const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - text.length % 4) % 4);
        try {
            const binary = atob(padded);
            const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
            if (window.TextDecoder) return new TextDecoder('utf-8').decode(bytes);
            return decodeURIComponent(Array.from(bytes, (byte) => `%${byte.toString(16).padStart(2, '0')}`).join(''));
        } catch (err) {
            return '';
        }
    }

    function galleryOriginalSource(source) {
        try {
            const url = new URL(source, document.baseURI);
            const fileName = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || '');
            const match = fileName.match(/^simpai_gprev__([A-Za-z0-9_-]+)__[0-9a-f]{16}\.jpg$/);
            if (!match) return source;
            const originalPath = base64UrlDecodeUtf8(match[1]);
            if (!originalPath) return source;
            const route = '/simpleai/gallery-preview/';
            const routeIndex = url.pathname.indexOf(route);
            const basePath = routeIndex >= 0 ? url.pathname.slice(0, routeIndex) : '';
            const encodedPath = encodeURI(String(originalPath).replace(/\\/g, '/')).replace(/\?/g, '%3F').replace(/#/g, '%23');
            const pageOrigin = String(window.location?.origin || '').trim();
            const origin = /^https?:\/\//i.test(pageOrigin) ? pageOrigin : url.origin;
            return `${origin}${basePath}/gradio_api/file=${encodedPath}`;
        } catch (err) {
            return source;
        }
    }

    function normalizeImageDropSource(source) {
        const value = String(source || '').trim();
        if (!value) return '';
        let normalized = value;
        try {
            normalized = new URL(value, document.baseURI).href;
        } catch (err) {}
        const resolved = galleryOriginalSource(normalized);
        return creativeAssetUrl(resolved) || resolved;
    }

    function firstImageDropUrl(dataTransfer) {
        if (!dataTransfer || typeof dataTransfer.getData !== 'function') return '';
        const custom = normalizeImageDropSource(dataTransfer.getData('application/x-simpleai-gallery-original-url'));
        if (custom) return custom;
        const uri = normalizeImageDropSource(firstUriFromList(dataTransfer.getData('text/uri-list')));
        if (uri) return uri;
        const htmlSrc = normalizeImageDropSource(firstHtmlImageSrc(dataTransfer.getData('text/html')));
        if (htmlSrc) return htmlSrc;
        return normalizeImageDropSource(dataTransfer.getData('text/plain'));
    }

    async function imageFileFromDropUrl(source) {
        if (!source) return null;
        try {
            const response = await fetch(source, { credentials: 'same-origin' });
            if (!response.ok) return null;
            const blob = await response.blob();
            const mime = blob.type || 'image/png';
            if (mime && !mime.toLowerCase().startsWith('image/')) return null;
            const rawExt = (mime.split('/')[1] || 'png').split(';')[0].replace('svg+xml', 'svg');
            const ext = rawExt === 'jpeg' ? 'jpg' : rawExt;
            return new File([blob], `dropped-image.${ext}`, { type: mime });
        } catch (err) {
            return null;
        }
    }

    async function collectDroppedImageFiles(dataTransfer) {
        const url = firstImageDropUrl(dataTransfer);
        if (url) {
            const file = await imageFileFromDropUrl(url);
            if (file) return [file];
        }
        return collectClipboardImageFiles(dataTransfer);
    }

    function modalIsOpen() {
        const modal = document.getElementById('describe_vlm_chat_modal');
        return !!modal && !modal.hidden;
    }

    function eventInsideModal(evt) {
        const modal = document.getElementById('describe_vlm_chat_modal');
        const dialog = userSystemPromptTemplateDialog(modal);
        return !!modal && (
            modal.contains(evt.target)
            || modal.contains(document.activeElement)
            || !!dialog && (dialog.contains(evt.target) || dialog.contains(document.activeElement))
        );
    }

    function eventTargetElement(target) {
        return target instanceof Element ? target : target?.parentElement || null;
    }

    function targetInsideChatPanel(target, modal = document.getElementById('describe_vlm_chat_modal')) {
        const panel = modal?.querySelector?.('.describe-vlm-chat-panel');
        const element = eventTargetElement(target);
        return !!panel && !!element && panel.contains(element);
    }

    function targetIsChatBackdrop(target, modal = document.getElementById('describe_vlm_chat_modal')) {
        return !!modal && target === modal;
    }

    function handleModalPointerDown(evt) {
        const modal = document.getElementById('describe_vlm_chat_modal');
        modalBackdropPointerStarted = !!modal && !modal.hidden && targetIsChatBackdrop(evt.target, modal);
    }

    function handleModalPointerUp(evt) {
        const modal = document.getElementById('describe_vlm_chat_modal');
        const shouldClose = modalBackdropPointerStarted && !!modal && !modal.hidden && targetIsChatBackdrop(evt.target, modal);
        modalBackdropPointerStarted = false;
        if (!shouldClose) return;
        evt.preventDefault();
        evt.stopPropagation();
        closeModal();
    }

    function resetModalPointerState() {
        modalBackdropPointerStarted = false;
    }

    function isWheelScrollable(node) {
        if (!(node instanceof Element)) return false;
        const style = window.getComputedStyle(node);
        const canOverflowY = /auto|scroll|overlay/i.test(style.overflowY || '');
        const canOverflowX = /auto|scroll|overlay/i.test(style.overflowX || '');
        return (canOverflowY && node.scrollHeight > node.clientHeight + 1) ||
            (canOverflowX && node.scrollWidth > node.clientWidth + 1);
    }

    function canScrollWithWheel(node, evt) {
        const deltaY = Number(evt.deltaY || 0);
        const deltaX = Number(evt.deltaX || 0);
        const canScrollDown = deltaY > 0 && node.scrollTop + node.clientHeight < node.scrollHeight - 1;
        const canScrollUp = deltaY < 0 && node.scrollTop > 0;
        const canScrollRight = deltaX > 0 && node.scrollLeft + node.clientWidth < node.scrollWidth - 1;
        const canScrollLeft = deltaX < 0 && node.scrollLeft > 0;
        return canScrollDown || canScrollUp || canScrollRight || canScrollLeft;
    }

    function closestScrollableForWheel(target, modal, evt, root = modal?.querySelector?.('.describe-vlm-chat-panel')) {
        let node = eventTargetElement(target);
        while (node && root?.contains(node)) {
            if (isWheelScrollable(node) && canScrollWithWheel(node, evt)) return node;
            if (node === root) break;
            node = node.parentElement;
        }
        return null;
    }

    function containModalWheel(evt) {
        const modal = document.getElementById('describe_vlm_chat_modal');
        if (!modal || modal.hidden) return;
        const dialog = userSystemPromptTemplateDialog(modal);
        if (dialog?.contains(evt.target)) {
            const scroller = closestScrollableForWheel(evt.target, modal, evt, dialog);
            if (!scroller) evt.preventDefault();
            evt.stopPropagation();
            return;
        }
        const insideModal = modal.contains(evt.target);
        const insidePanel = insideModal && targetInsideChatPanel(evt.target, modal);
        const scroller = insidePanel ? closestScrollableForWheel(evt.target, modal, evt) : null;
        if (!insidePanel || !scroller) {
            evt.preventDefault();
        }
        evt.stopPropagation();
    }

    function containModalTouchStart(evt) {
        const modal = document.getElementById('describe_vlm_chat_modal');
        const dialog = userSystemPromptTemplateDialog(modal);
        if (!modal || modal.hidden || (!modal.contains(evt.target) && !dialog?.contains(evt.target))) return;
        const touch = evt.touches?.[0] || null;
        modalTouchPoint = touch ? { x: touch.clientX, y: touch.clientY } : null;
        evt.stopPropagation();
    }

    function containModalTouchMove(evt) {
        const modal = document.getElementById('describe_vlm_chat_modal');
        const dialog = userSystemPromptTemplateDialog(modal);
        if (!modal || modal.hidden || (!modal.contains(evt.target) && !dialog?.contains(evt.target))) return;
        const touch = evt.touches?.[0] || null;
        const deltaX = modalTouchPoint && touch ? modalTouchPoint.x - touch.clientX : 0;
        const deltaY = modalTouchPoint && touch ? modalTouchPoint.y - touch.clientY : 0;
        modalTouchPoint = touch ? { x: touch.clientX, y: touch.clientY } : modalTouchPoint;
        if (dialog?.contains(evt.target)) {
            const scroller = closestScrollableForWheel(evt.target, modal, { deltaX, deltaY }, dialog);
            if (!scroller) evt.preventDefault();
            evt.stopPropagation();
            return;
        }
        const insidePanel = targetInsideChatPanel(evt.target, modal);
        const scroller = insidePanel
            ? closestScrollableForWheel(evt.target, modal, { deltaX, deltaY })
            : null;
        if (!insidePanel || !scroller) evt.preventDefault();
        evt.stopPropagation();
    }

    function resetModalTouchPoint(evt) {
        const modal = document.getElementById('describe_vlm_chat_modal');
        const dialog = userSystemPromptTemplateDialog(modal);
        if (modal && !modal.hidden && (modal.contains(evt.target) || dialog?.contains(evt.target))) evt.stopPropagation();
        modalTouchPoint = null;
    }

    function messageHasCreativeImageAction(message) {
        return (Array.isArray(message?.actions) ? message.actions : []).some((action) => (
            ['generate_image', 'offer_image'].includes(action?.type)
        ));
    }

    function creativeOfferCooldownAllows() {
        const initiative = normalizeCreativeInitiative(state.creativeInitiative);
        if (initiative.mode !== 'proactive') return false;
        if (!initiative.last_offer_turn) return true;
        return initiative.turn_index - initiative.last_offer_turn >= 3;
    }

    function creativePreferenceAllowsProactiveOffer() {
        const preference = normalizeCreativePreference(state.creativePreference);
        return preference.prompted && Boolean(preference.style || preference.preset);
    }

    async function maybeRequestCreativeOffer(options = {}) {
        const runtime = options.runtime || currentConversationRuntime();
        const sourceMessageId = String(options.source_message_id || '');
        const sourceMessage = runtime.messages.find((item) => item?.id === sourceMessageId);
        if (!sourceMessage || normalizeChatMode(runtime.chatMode) !== 'creative') return;
        const preference = normalizeCreativePreference(runtime.creativePreference);
        const initiative = normalizeCreativeInitiative(runtime.creativeInitiative);
        if (!(preference.prompted && Boolean(preference.style || preference.preset))
            || initiative.mode !== 'proactive'
            || (initiative.last_offer_turn && initiative.turn_index - initiative.last_offer_turn < 3)
            || messageHasCreativeImageAction(sourceMessage)) return;
        abortCreativeDirectorRequest(false, runtime);
        const requestId = uid('describe_vlm_chat_director');
        const controller = new AbortController();
        runtime.creativeDirectorBusy = true;
        runtime.creativeDirectorRequestId = requestId;
        runtime.creativeDirectorAbortController = controller;
        if (isCurrentConversationRuntime(runtime)) {
            state.creativeDirectorBusy = true;
            state.creativeDirectorRequestId = requestId;
            state.creativeDirectorAbortController = controller;
        }
        setConversationStatus(runtime, localText('Visual director is reviewing this scene...', '视觉导演正在判断这一幕...'));
        const history = buildRollingHistory(14, 6500, runtime.messages);
        const fullHistory = buildRollingHistory(20, 8000, runtime.messages);
        const response = await postJson('/describe-image/vlm-chat-run', {
            request_kind: 'creative_offer',
            message: String(options.user_message || ''),
            assistant_reply: String(sourceMessage.content || ''),
            source_message_id: sourceMessageId,
            conversation_id: runtime.conversationId,
            request_id: requestId,
            history: history.messages,
            history_full: fullHistory.messages,
            version: options.version,
             vram_policy: normalizeVlmVramPolicy(state.vramPolicy),
             kv_cache_type: normalizeVlmKvCacheType(state.kvCacheType),
             n_ctx: currentVlmNctx(options.version),
            custom_api: options.custom_api,
            unload_after_chat: !!runtime.unloadAfterChat,
            creative_preferences: preference,
            last_scene_key: String(initiative.last_scene_key || ''),
            lang: state.__lang
        }, { signal: controller.signal });
        if (runtime.creativeDirectorRequestId !== requestId) return;
        runtime.creativeDirectorBusy = false;
        runtime.creativeDirectorRequestId = '';
        runtime.creativeDirectorAbortController = null;
        if (isCurrentConversationRuntime(runtime)) {
            state.creativeDirectorBusy = false;
            state.creativeDirectorRequestId = '';
            state.creativeDirectorAbortController = null;
        }
        if (response?.aborted) return;
        if (!response?.ok) {
            setConversationStatus(runtime, localText('Visual director is unavailable; the main reply is complete.', '视觉导演暂不可用，主回复已正常完成。'), true);
            return;
        }
        const offer = response.creative_offer && typeof response.creative_offer === 'object'
            ? response.creative_offer
            : null;
        if (!offer?.offer) {
            setConversationStatus(runtime, '');
            return;
        }
        const liveInitiative = normalizeCreativeInitiative(runtime.creativeInitiative);
        const sceneKey = String(offer.scene_key || '').trim().toLowerCase().slice(0, 160);
        // Current UI mirror: sceneKey === initiative.last_scene_key
        if (!sceneKey || sceneKey === liveInitiative.last_scene_key || liveInitiative.mode !== 'proactive') {
            setConversationStatus(runtime, '');
            return;
        }
        const liveMessage = runtime.messages.find((item) => item?.id === sourceMessageId);
        if (!liveMessage || messageHasCreativeImageAction(liveMessage)) return;
        if (!Array.isArray(liveMessage.actions)) liveMessage.actions = [];
        const preferredEntry = creativePresetEntry(preference.preset);
        const selectedEntry = creativePresetHasTaskRoute(preferredEntry, 'text_to_image', 0)
            ? preferredEntry
            : creativeCompatiblePresetEntry('text_to_image', 0);
        const action = {
            type: 'offer_image',
            target: 'canvas_run',
            task: 'text_to_image',
            prompt: String(offer.prompt || '').trim(),
            preset: String(selectedEntry?.name || CREATIVE_DEFAULT_PRESET),
            preset_source: preferredEntry === selectedEntry ? 'session_preference' : 'agent_auto',
            parameter_profile: preferredEntry === selectedEntry
                ? String(creativeParameterProfileEntry(preference.parameter_profile, selectedEntry?.name)?.name || '')
                : '',
            aspect_ratio: String(offer.aspect_ratio || 'auto'),
            image_number: Math.max(1, Math.min(4, Math.round(Number(offer.image_number) || 1))),
            offer_text: String(offer.offer_text || '').trim(),
            offer_reason: String(offer.reason || '').trim(),
            scene_key: sceneKey,
            source_message_id: sourceMessageId,
            score: Math.max(0, Math.min(1, Number(offer.score) || 0)),
            generation: { state: 'awaiting_confirmation', assets: [] }
        };
        creativeGenerationForAction(action);
        action.execution_plan = creativeExecutionPlanForEntry(
            action,
            selectedEntry,
            preferredEntry === selectedEntry ? 'session_preference' : 'automatic'
        );
        liveMessage.actions.push(action);
        runtime.creativeInitiative = normalizeCreativeInitiative(Object.assign({}, liveInitiative, {
            last_offer_turn: liveInitiative.turn_index,
            last_scene_key: sceneKey
        }));
        persistCreativeAction(true, {}, runtime);
        setConversationStatus(runtime, localText('A scene image was suggested for review.', '已提出一张场景画面，等待你确认。'));
    }

    function pauseRoleplayForUserInput(runtime = currentConversationRuntime()) {
        const target = runtime || currentConversationRuntime();
        const current = normalizeRoleplayAutoplayState(target.roleplayAutoplayState);
        if (!['running', 'paused'].includes(current.phase)) return false;
        const requestId = String(current.request_id || '').trim();
        try {
            current.abort_controller?.abort?.();
        } catch (err) {}
        updateRoleplayAutoplayState(target, {
            phase: 'paused',
            request_id: '',
            abort_controller: null,
            reason: 'user_input'
        }, localText('Autoplay paused for your input.', '已暂停托管，等待你的输入。'));
        if (requestId) notifyBackendChatCancel(target.conversationId, requestId).catch(() => {});
        return true;
    }

    async function sendMessage() {
        const options = arguments[0] && typeof arguments[0] === 'object' ? arguments[0] : {};
        const runtime = syncCurrentRuntimeFromState();
        if (runtime.busy) return;
        abortCreativeDirectorRequest(true, runtime);
        const requestToken = runtime.requestToken + 1;
        runtime.requestToken = requestToken;
        state.requestToken = requestToken;
        // Legacy current-conversation guard: requestToken !== state.requestToken
        const messages = runtime.messages;
        const modal = ensureModal();
        const input = modal.querySelector('[data-describe-vlm-chat-input]');
        const selectedMode = normalizeChatMode(modal.querySelector('[data-describe-vlm-chat-mode]')?.value || runtime.chatMode);
        const systemPromptField = modal.querySelector('[data-describe-vlm-chat-system]');
        const templatePicker = modal.querySelector('[data-describe-vlm-chat-template]');
        const userTemplateDialog = userSystemPromptTemplateDialog(modal);
        const userDocumentField = userTemplateDialog?.querySelector('[data-describe-vlm-chat-user-template-content]');
        const customSystemPrompt = String(systemPromptField ? systemPromptField.value : (runtime.customSystemPrompt || ''));
        const selectedPickerValue = String(templatePicker?.value || runtime.systemPromptPickerValue || '').trim();
        const selectedUserPickerId = selectedPickerValue.startsWith('user:')
            ? selectedPickerValue.slice(5).trim()
            : '';
        const usingUserTemplate = !!selectedUserPickerId && selectedUserPickerId !== '__none__';
        const selectedTemplateId = usingUserTemplate
            ? ''
            : selectedPickerValue === NO_SYSTEM_PROMPT_PICKER_VALUE
            ? ''
            : selectedPickerValue || runtime.systemPromptTemplateId || '';
        const selectedUserTemplateId = usingUserTemplate ? selectedUserPickerId : '';
        const selectedBuiltInTemplate = state.systemPromptTemplates.find(item => item.id === selectedTemplateId);
        const selectedUserTemplate = state.userSystemPromptTemplates.find(item => item.id === selectedUserTemplateId);
        const baseSystemPromptContent = usingUserTemplate
            ? ''
            : String(selectedBuiltInTemplate?.content || runtime.baseSystemPromptContent || '').trim();
        const userSystemPromptContent = usingUserTemplate
            ? String(userDocumentField
                ? userDocumentField.value
                : (runtime.userSystemPromptContent || selectedUserTemplate?.content || '')).trim()
            : '';
        const mergedSystemPrompt = composeSystemPromptDocuments(baseSystemPromptContent, userSystemPromptContent);
        runtime.chatMode = selectedMode;
        runtime.customSystemPrompt = customSystemPrompt;
        runtime.systemPromptPickerValue = selectedPickerValue || NO_SYSTEM_PROMPT_PICKER_VALUE;
        runtime.systemPromptTemplateId = selectedTemplateId;
        runtime.baseSystemPromptContent = baseSystemPromptContent;
        runtime.userSystemPromptTemplateId = selectedUserTemplateId;
        runtime.userSystemPromptTemplateName = usingUserTemplate
            ? String(userTemplateDialog?.querySelector('[data-describe-vlm-chat-user-template-name]')?.value
                || runtime.userSystemPromptTemplateName
                || selectedUserTemplate?.name
                || '').trim()
            : '';
        runtime.userSystemPromptContent = userSystemPromptContent;
        runtime.systemPromptManualOverride = customSystemPrompt.trim() !== mergedSystemPrompt.trim();
        applyConversationRuntime(runtime);
        saveChatSettings();
        const hasMessageOverride = typeof options.messageOverride === 'string';
        const replayExistingUserMessage = hasMessageOverride && options.replayExistingUserMessage === true;
        const inputSnapshot = hasMessageOverride ? '' : String(input?.value || '');
        const typed = hasMessageOverride ? String(options.messageOverride || '').trim() : inputSnapshot.trim();
        if (runtime.describeMediaReferencePromise?.promise) {
            await runtime.describeMediaReferencePromise.promise;
            if (requestToken !== runtime.requestToken) return;
        }
        const replaySourceMessage = replayExistingUserMessage
            ? messages[messages.length - 1]
            : null;
        const pendingImages = hasMessageOverride
            ? (replaySourceMessage?._image_payloads || []).slice(0, MAX_ATTACHMENTS)
            : runtime.pendingImages.slice();
        if (!typed && !pendingImages.length && !hasMessageOverride) return;
        if (selectedMode === 'roleplay' && !options.roleplayAutoplay && !hasMessageOverride) {
            pauseRoleplayForUserInput(runtime);
        }
        const directRun = selectedMode === 'creative' ? parseCreativeRunCommand(typed) : null;
        const directRunPrompt = directRun
            ? String(directRun.prompt || readComponentValue('positive_prompt') || '').trim()
            : '';
        const isDirectRun = Boolean(directRun);
        if (isDirectRun && !directRunPrompt) {
            setConversationStatus(runtime, t(
                'Enter a prompt after /run, or fill the main prompt box first.',
                '请在 /run 后填写提示词，或先填写主提示词框。'
            ), true);
            return;
        }
        const version = readSelectedVlmVersion();
        const customApi = readDescribeCustomApi(version);
        const supportsImageInput = !customApi || customApi.supports_images !== false;
        const canSendImages = isDirectRun || supportsImageInput;
        const requestedPreviousImage = !pendingImages.length && runtime.autoAttachPreviousImage && Boolean(latestConversationImageCandidate(messages));
        const requestedImagesButUnsupported = !isDirectRun && !supportsImageInput && Boolean(pendingImages.length || requestedPreviousImage);
        if (!typed && pendingImages.length && !canSendImages) {
            setConversationStatus(runtime, t(
                'The selected Custom API has image input disabled.',
                '当前 Custom API 未启用图像输入。'
            ), true);
            return;
        }
        if (isCurrentConversationRuntime(runtime)) updateAnswerModelIndicator(modal);
        const modelReady = isDirectRun ? true : await ensureSelectedVlmModelReady(version);
        if (requestToken !== runtime.requestToken) return;
        if (!modelReady) return;
        if (selectedMode === 'creative') {
            await ensureCreativePresetCatalog();
            if (requestToken !== runtime.requestToken) return;
            if (runtime.creativePreferenceExpanded) {
                runtime.creativePreferenceExpanded = false;
                // Current UI mirror: if (state.creativePreferenceExpanded)
                if (isCurrentConversationRuntime(runtime)) {
                    state.creativePreferenceExpanded = false;
                    renderCreativePreferenceMount(modal);
                }
            }
        }

        runtime.busy = true;
        if (isCurrentConversationRuntime(runtime)) {
            state.busy = true;
            syncBusyControls(modal);
            setStatus('');
        }

        const message = isDirectRun ? directRunPrompt : typed || defaultMessageForMode(selectedMode, pendingImages);
        const includeCurrentPrompt = !isDirectRun && shouldSendCurrentPromptToVlm(selectedMode, message);
        const history = buildRollingHistory(MAX_HISTORY_TURNS, HISTORY_BUDGET, messages);
        const fullHistory = buildRollingHistory(32, FULL_HISTORY_BUDGET, messages);
        if (history.omitted > 0) {
            setConversationStatus(runtime, t('Older messages were automatically omitted from context.', '已自动省略较早消息以保护上下文。'));
        }

        const images = [];
        const sentPendingImages = [];
        if (canSendImages) {
            for (const image of pendingImages) {
                if (images.length >= MAX_ATTACHMENTS) break;
                if (image?.data_url) {
                    images.push(image);
                    sentPendingImages.push(image);
                }
            }
            if (!hasMessageOverride && !pendingImages.length && state.autoAttachPreviousImage && isCurrentConversationRuntime(runtime)) {
                try {
                    const previousImage = await previousConversationImagePayload();
                    if (previousImage) images.push(previousImage);
                } catch (err) {
                    setConversationStatus(runtime, t('Previous chat image could not be read; sending text only.', '无法读取上一张对话图片，本次仅发送文字。'), true);
                }
            } else if (!hasMessageOverride && !pendingImages.length && runtime.autoAttachPreviousImage) {
                try {
                    const previousImage = await previousConversationImagePayload(messages);
                    if (previousImage) images.push(previousImage);
                } catch (err) {
                    setConversationStatus(runtime, t('Previous chat image could not be read; sending text only.', '无法读取上一张对话图片，本次仅发送文字。'), true);
                }
            }
        }
        if (requestToken !== runtime.requestToken) return;
        if (!hasMessageOverride) {
            if (isCurrentConversationRuntime(runtime)) {
                consumeSentComposerState(input, inputSnapshot, sentPendingImages);
            } else {
                consumeSentComposerState(input, inputSnapshot, sentPendingImages, runtime);
            }
        }
        const estimatedUploadBytes = totalImageUploadBytes(images);
        if (images.length) {
            setConversationStatus(runtime, imageUploadStatus(images));
        } else if (requestedImagesButUnsupported) {
            setConversationStatus(runtime, t(
                'The selected Custom API has image input disabled; text was sent without images.',
                '当前 Custom API 未启用图像输入，本次仅发送文字。'
            ));
        }

        const roleplaySessionBefore = selectedMode === 'roleplay'
            ? normalizeRoleplaySession(runtime.roleplaySession, runtime.conversationId)
            : null;
        let userMessage = {
            id: uid('describe_vlm_chat_user'),
            role: 'user',
            content: isDirectRun ? inputSnapshot : message,
            image_count: images.length,
            images: images.map(imageSummary),
            _image_payloads: images.filter((image) => mediaKind(image) === 'image')
        };
        const pendingAssistantId = uid('describe_vlm_chat_assistant');
        if (replayExistingUserMessage && replaySourceMessage?.role === 'user') {
            userMessage = replaySourceMessage;
            userMessage.content = message;
            userMessage.image_count = images.length;
            userMessage.images = images.map(imageSummary);
            userMessage._image_payloads = images.filter((image) => mediaKind(image) === 'image');
        } else {
            messages.push(userMessage);
        }
        const pendingAssistant = {
            id: pendingAssistantId,
            role: 'assistant',
            content: t('Thinking', '思考中'),
            pending: true
        };
        if (roleplaySessionBefore) pendingAssistant.roleplay_session_before = roleplaySessionBefore;
        messages.push(pendingAssistant);
        if (isCurrentConversationRuntime(runtime)) renderMessages();

        const requestId = uid('describe_vlm_chat_req');
        const abortController = new AbortController();
        runtime.activeRequestId = requestId;
        runtime.activeAbortController = abortController;
        if (isCurrentConversationRuntime(runtime)) {
            state.activeRequestId = requestId;
            state.activeAbortController = abortController;
        }
        const payload = {
            message,
            request_kind: isDirectRun ? 'direct_run' : '',
            direct_prompt: isDirectRun ? message : '',
            current_prompt: includeCurrentPrompt ? readComponentValue('positive_prompt') : '',
            include_current_prompt: includeCurrentPrompt,
            conversation_id: runtime.conversationId,
            request_id: requestId,
            history: history.messages,
            history_full: fullHistory.messages,
            context: {
                omitted: history.omitted,
                chars: history.chars,
                budget: history.budget
            },
            images,
            version,
             vram_policy: normalizeVlmVramPolicy(state.vramPolicy),
             kv_cache_type: normalizeVlmKvCacheType(state.kvCacheType),
            n_ctx: currentVlmNctx(version),
            custom_api: customApi,
            chat_mode: selectedMode,
            roleplay_request_kind: selectedMode === 'roleplay'
                ? String(options.roleplayRequestKind || 'character')
                : '',
            roleplay_autoplay: selectedMode === 'roleplay' ? !!options.roleplayAutoplay : false,
            roleplay_autoplay_state: selectedMode === 'roleplay'
                ? normalizeRoleplayAutoplayState(runtime.roleplayAutoplayState)
                : {},
            roleplay_session: selectedMode === 'roleplay'
                ? normalizeRoleplaySession(runtime.roleplaySession, runtime.conversationId)
                : {},
            agent_routing: selectedMode === 'roleplay'
                ? normalizeRoleplayAgentRouting(runtime.roleplaySession?.agent_routing)
                : {},
            agent_routing_local_version: selectedMode === 'roleplay'
                ? String(runtime.roleplaySession?.agent_routing?.profiles?.local_main?.version || '').trim()
                : '',
            agent_routing_api_profile: selectedMode === 'roleplay'
                ? readDescribeCustomApi('Custom')
                : null,
            agent_routing_api_profile_version: selectedMode === 'roleplay'
                ? String(runtime.roleplaySession?.agent_routing?.profiles?.api_main?.version || '').trim()
                : '',
            user_did: creativeUserContext().user_did,
            user_message_id: userMessage.id,
            assistant_message_id: pendingAssistantId,
            user_system_prompt: customSystemPrompt,
            // Current UI mirror: system_prompt_template_id: state.systemPromptTemplateId
            system_prompt_template_id: runtime.systemPromptTemplateId,
            // Current UI mirrors: user_system_prompt_template_id: state.userSystemPromptTemplateId
            // base_system_prompt_content: state.baseSystemPromptContent
            // user_system_prompt_content: state.userSystemPromptContent
            // system_prompt_manual_override: !!state.systemPromptManualOverride
            user_system_prompt_template_id: runtime.userSystemPromptTemplateId,
            base_system_prompt_content: runtime.baseSystemPromptContent,
            user_system_prompt_content: runtime.userSystemPromptContent,
            system_prompt_manual_override: !!runtime.systemPromptManualOverride,
            // Current UI mirrors: unload_after_chat: !!state.unloadAfterChat; free_after: !!state.unloadAfterChat
            unload_after_chat: !!runtime.unloadAfterChat,
            free_after: !!runtime.unloadAfterChat,
            prompt_options: readDescribePromptOptions(),
            max_tokens: effectiveChatMaxTokens(selectedMode),
            creative_preferences: normalizeCreativePreference(runtime.creativePreference),
            preset_capabilities: selectedMode === 'creative' ? creativePresetCapabilitiesPayload() : [],
            parameter_profiles: selectedMode === 'creative' ? creativeParameterProfilesPayload() : [],
            lang: state.__lang
        };
        const response = await postJson('/describe-image/vlm-chat-run', payload, { signal: abortController.signal });
        if (runtime.activeRequestId === requestId) {
            runtime.activeRequestId = '';
            runtime.activeAbortController = null;
            if (isCurrentConversationRuntime(runtime)) {
                state.activeRequestId = '';
                state.activeAbortController = null;
            }
        }
        if (requestToken !== runtime.requestToken) return;
        if (response?.aborted) {
            runtime.busy = false;
            replacePendingAssistant(t('Stopped.', '已停止。'), messages);
            if (isCurrentConversationRuntime(runtime)) {
                state.busy = false;
                renderMessages();
                setStatus(t('Reply stopped.', '已停止当前回复。'));
            }
            return;
        }
        const pendingIndex = messages.findIndex((item) => item.pending);
        const pendingMessageId = pendingIndex >= 0 ? messages[pendingIndex]?.id : '';
        const completion = normalizeChatCompletion(
            response?.completion || response?.params?.completion,
            response?.params?.max_tokens
        );
        const reply = response?.ok
            ? visibleReplyFromResponse(response, completion)
            : describeVlmChatFailure(response);
        const assistant = {
            id: pendingMessageId || uid('describe_vlm_chat_assistant'),
            role: 'assistant',
            content: reply,
            completion,
            roleplay_state_changes: [],
            actions: response?.ok && Array.isArray(response.limited_actions)
                ? prepareAssistantActions(response.limited_actions, selectedMode, response.input_media_assets, runtime)
                : [],
            agent_route: response?.agent_route && typeof response.agent_route === 'object'
                ? response.agent_route
                : null
        };
        const roleplaySessionPayload = response?.roleplay_session || response?.roleplay?.session;
        if (response?.ok && selectedMode === 'roleplay' && roleplaySessionPayload) {
            runtime.roleplaySession = normalizeRoleplaySession(roleplaySessionPayload, runtime.conversationId);
            const serverStateChanges = response?.roleplay_state_changes || response?.roleplay?.state_changes;
            assistant.roleplay_state_changes = normalizeRoleplayStateChanges(serverStateChanges).length
                ? normalizeRoleplayStateChanges(serverStateChanges)
                : roleplayStateChangesFromPatches(
                    roleplaySessionBefore,
                    runtime.roleplaySession,
                    response?.roleplay?.applied
                );
            if (response.roleplay_visual_candidate && typeof response.roleplay_visual_candidate === 'object') {
                assistant.roleplay_visual_candidate = response.roleplay_visual_candidate;
            }
            if (isCurrentConversationRuntime(runtime)) {
                state.roleplaySession = runtime.roleplaySession;
                syncRoleplayControls(modal);
            }
        }
        if (response?.ok && selectedMode === 'roleplay' && response?.roleplay_visual_action?.prompt) {
            const visualAction = Object.assign({}, response.roleplay_visual_action);
            visualAction.type = visualAction.type === 'generate_image' ? 'generate_image' : 'offer_image';
            if (!Array.isArray(visualAction.media_inputs) && Array.isArray(visualAction.reference_bindings)) {
                visualAction.media_inputs = visualAction.reference_bindings.map((binding, index) => ({
                    ref: String(binding?.asset_id || '').trim(),
                    role: index === 0 ? 'base_image' : `reference_image_${index}`,
                    name: `Picture ${index + 1}`,
                    type: 'image',
                    asset: { asset_id: String(binding?.asset_id || '').trim(), name: `Picture ${index + 1}` }
                })).filter((input) => input.ref);
            }
            assistant.actions.push(...prepareAssistantActions([visualAction], selectedMode, response.input_media_assets, runtime));
            assistant.roleplay_visual_snapshot = response.roleplay_visual_snapshot || {};
        }
        if (response?.roleplay_autoplay_decision && selectedMode === 'roleplay') {
            const decision = response.roleplay_autoplay_decision;
            const currentAutoplay = normalizeRoleplayAutoplayState(runtime.roleplayAutoplayState);
            const nextPhase = ['paused', 'completed', 'error'].includes(String(decision.phase || ''))
                ? String(decision.phase)
                : currentAutoplay.phase;
            updateRoleplayAutoplayState(runtime, {
                phase: nextPhase,
                target_turns: Number(decision.target_turns) || currentAutoplay.target_turns,
                continuous: decision.continuous !== undefined ? !!decision.continuous : currentAutoplay.continuous,
                reason: String(decision.reason || ''),
                error: String(decision.director_error || ''),
            });
        }
        userMessage.media_assets = Array.isArray(response?.input_media_assets)
            ? response.input_media_assets.map(normalizeChatMediaInput).filter(Boolean)
            : [];
        if (selectedMode === 'roleplay') {
            const variant = normalizeRoleplayMessageVariant({
                id: uid('roleplay_variant'),
                content: assistant.content,
                actions: assistant.actions,
                roleplay_state_changes: assistant.roleplay_state_changes,
                roleplay_session_before: pendingIndex >= 0
                    ? messages[pendingIndex]?.roleplay_session_before || roleplaySessionBefore
                    : roleplaySessionBefore,
                roleplay_session_after: runtime.roleplaySession,
                branch_id: runtime.roleplaySession?.active_branch_id,
                state_version: runtime.roleplaySession?.state_version,
                turn_id: runtime.roleplaySession?.active_turn_id
            }, 0, runtime.conversationId);
            const carriedVariants = Array.isArray(options.variantHistory) ? options.variantHistory : [];
            assistant.variants = [...carriedVariants, variant].filter(Boolean).slice(-8);
            assistant.active_variant_index = Math.max(0, assistant.variants.length - 1);
        }
        if (pendingIndex >= 0) messages[pendingIndex] = assistant;
        else messages.push(assistant);
        runtime.busy = false;
        if (response?.ok && selectedMode === 'creative') {
            runtime.creativeInitiative = normalizeCreativeInitiative(Object.assign({}, runtime.creativeInitiative, {
                turn_index: Number(runtime.creativeInitiative.turn_index || 0) + 1
            }));
        }
        runtime.persistenceDirty = true;
        saveConversationSnapshot(runtime);
        if (isCurrentConversationRuntime(runtime)) {
            state.busy = false;
            state.persistenceDirty = false;
            renderMessages();
            syncRoleplayControls(modal);
        }
        if (response?.ok && selectedMode === 'roleplay' && response?.roleplay_visual_action?.prompt) {
            window.setTimeout(() => autoStartRoleplayVisualActionForMessage(assistant.id, runtime), 0);
        }
        if (response?.ok && selectedMode === 'creative' && runtime.creativePreference.auto_generate) {
            window.setTimeout(() => autoStartCreativeActionsForMessage(assistant.id, runtime), 0);
        }
        if (!response?.ok) {
            setConversationStatus(runtime, reply, true);
        } else if (completion?.output_limited) {
            setConversationStatus(runtime, chatCompletionLimitMessage(completion), true);
        } else if (estimatedUploadBytes > 0) {
            setConversationStatus(runtime, imageUploadStatus(images, true));
        } else if (requestedImagesButUnsupported) {
            setConversationStatus(runtime, t(
                'The selected Custom API has image input disabled; text was sent without images.',
                '当前 Custom API 未启用图像输入，本次仅发送文字。'
            ));
        } else if (selectedMode === 'roleplay' && response?.roleplay_state_version !== undefined) {
            const route = response?.agent_route && typeof response.agent_route === 'object' ? response.agent_route : null;
            const routeType = route?.profile_type === 'api'
                ? localText('API', 'API')
                : route?.profile_type === 'local'
                    ? localText('Local', '本地')
                    : '';
            const routeNoteEn = routeType
                ? ` · Agent ${route.profile_type === 'api' ? 'API' : 'Local'}${route.fallback_used ? ' (fallback)' : ''}`
                : '';
            const routeNoteCn = routeType
                ? ` · 智能体 ${route.profile_type === 'api' ? 'API' : '本地'}${route.fallback_used ? '（备用）' : ''}`
                : '';
            setConversationStatus(runtime, t(
                `Story state updated to version ${response.roleplay_state_version}.${routeNoteEn}`,
                `剧情状态已更新到第 ${response.roleplay_state_version} 版。${routeNoteCn}`
            ));
        } else {
            setConversationStatus(runtime, '');
        }
        if (
            response?.ok
            && selectedMode === 'creative'
            && !response?.creative_director_suppressed
            && !completion?.output_limited
            && !messageHasCreativeImageAction(assistant)
        ) {
            maybeRequestCreativeOffer({
                source_message_id: assistant.id,
                user_message: message,
                version,
                custom_api: customApi,
                runtime
            }).catch(() => {});
        }
        return response;
    }

    function updateRoleplayAutoplayState(runtime, patch = {}, message = '') {
        const target = runtime || currentConversationRuntime();
        target.roleplayAutoplayState = normalizeRoleplayAutoplayState(Object.assign(
            {},
            normalizeRoleplayAutoplayState(target.roleplayAutoplayState),
            patch
        ));
        target.persistenceDirty = true;
        if (isCurrentConversationRuntime(target)) {
            state.roleplayAutoplayState = target.roleplayAutoplayState;
            syncRoleplayControls(document.getElementById('describe_vlm_chat_modal'));
        }
        if (message) setConversationStatus(target, message);
        return target.roleplayAutoplayState;
    }

    function roleplayAutoplayWait(milliseconds = 320) {
        return new Promise((resolve) => window.setTimeout(resolve, Math.max(0, milliseconds)));
    }

    async function requestRoleplayPlayerProxy(runtime) {
        const target = runtime || currentConversationRuntime();
        const session = normalizeRoleplaySession(target.roleplaySession, target.conversationId);
        const playerAbsent = session.story_state.player_state?.status === 'absent';
        const history = buildRollingHistory(18, 10000, target.messages);
        const fullHistory = buildRollingHistory(36, 14000, target.messages);
        const version = readSelectedVlmVersion();
        const customApi = readDescribeCustomApi(version);
        const requestId = uid('describe_vlm_chat_proxy');
        const controller = new AbortController();
        updateRoleplayAutoplayState(target, {
            phase: 'running',
            request_id: requestId,
            abort_controller: controller,
            error: ''
        }, localText('Player proxy is drafting the next turn...', '玩家代理正在拟定下一步行动……'));
        const response = await postJson('/describe-image/vlm-chat-run', {
            request_kind: 'roleplay_player_proxy',
            roleplay_request_kind: 'player_proxy',
            roleplay_autoplay: true,
            message: playerAbsent
                ? localText(
                    'Continue the story with one concise plot-control instruction. Do not write player dialogue.',
                    '基于当前剧情，生成一句简短的剧情控制指令，不要写成玩家台词。'
                )
                : localText(
                    'Continue the story with one plausible player action or line, following the player\'s natural-language current state.',
                    '基于当前剧情，结合玩家当前的自然语言状态，生成一句合理的玩家行动或台词。'
                ),
            conversation_id: target.conversationId,
            request_id: requestId,
            history: history.messages,
            history_full: fullHistory.messages,
            context: {
                omitted: history.omitted,
                chars: history.chars,
                budget: history.budget
            },
            images: [],
            version,
             vram_policy: normalizeVlmVramPolicy(state.vramPolicy),
             kv_cache_type: normalizeVlmKvCacheType(state.kvCacheType),
            n_ctx: currentVlmNctx(version),
            custom_api: customApi,
            chat_mode: 'roleplay',
            roleplay_session: session,
            agent_routing: normalizeRoleplayAgentRouting(session.agent_routing),
            agent_routing_local_version: String(session.agent_routing?.profiles?.local_main?.version || '').trim(),
            agent_routing_api_profile: readDescribeCustomApi('Custom'),
            agent_routing_api_profile_version: String(session.agent_routing?.profiles?.api_main?.version || '').trim(),
            user_did: creativeUserContext().user_did,
            unload_after_chat: !!target.unloadAfterChat,
            user_system_prompt: target.customSystemPrompt || '',
            lang: state.__lang,
            max_tokens: Math.min(1200, Math.max(256, effectiveChatMaxTokens('roleplay')))
        }, { signal: controller.signal });
        const live = normalizeRoleplayAutoplayState(target.roleplayAutoplayState);
        if (live.request_id === requestId) {
            target.roleplayAutoplayState = normalizeRoleplayAutoplayState(Object.assign({}, live, {
                request_id: '',
                abort_controller: null
            }));
        }
        if (response?.aborted) return '';
        if (!response?.ok) {
            updateRoleplayAutoplayState(target, {
                phase: 'error',
                request_id: '',
                abort_controller: null,
                error: describeVlmChatFailure(response)
            }, describeVlmChatFailure(response));
            return '';
        }
        const text = visibleReplyFromResponse(response, normalizeChatCompletion(response?.completion));
        if (!text || !text.trim()) {
            updateRoleplayAutoplayState(target, {
                phase: 'error',
                error: localText('Player proxy returned no action.', '玩家代理没有返回行动。')
            }, localText('Player proxy returned no action.', '玩家代理没有返回行动。'));
            return '';
        }
        return text.trim();
    }

    async function runRoleplayAutoplay(runtime = currentConversationRuntime(), options = {}) {
        const target = runtime || currentConversationRuntime();
        const stepOnly = !!options.stepOnly;
        const session = normalizeRoleplaySession(target.roleplaySession, target.conversationId);
        target.roleplaySession = session;
        const current = normalizeRoleplayAutoplayState(target.roleplayAutoplayState);
        if (current.phase === 'running') return false;
        const configuredTarget = Math.max(1, Math.min(100, Math.round(Number(session.autoplay_config.target_turns) || 5)));
        const continuous = !stepOnly && !!session.autoplay_config.continuous;
        const targetTurns = stepOnly
            ? Math.max(current.completed_turns + 1, 1)
            : configuredTarget;
        const version = readSelectedVlmVersion();
        if (!(await ensureSelectedVlmModelReady(version))) return false;
        updateRoleplayAutoplayState(target, {
            phase: 'running',
            target_turns: targetTurns,
            continuous,
            error: ''
        }, localText('Autoplay is running.', '托管剧情正在运行。'));
        while (true) {
            const live = normalizeRoleplayAutoplayState(target.roleplayAutoplayState);
            if (live.phase !== 'running' || (!live.continuous && live.completed_turns >= targetTurns)) break;
            const proxyText = await requestRoleplayPlayerProxy(target);
            const afterProxy = normalizeRoleplayAutoplayState(target.roleplayAutoplayState);
            if (!proxyText || afterProxy.phase !== 'running') break;
            const response = await sendMessage({
                messageOverride: proxyText,
                roleplayRequestKind: 'character',
                roleplayAutoplay: true,
                runtime: target
            });
            if (!response?.ok) {
                updateRoleplayAutoplayState(target, {
                    phase: 'error',
                    error: describeVlmChatFailure(response)
                }, describeVlmChatFailure(response));
                break;
            }
            const decision = response?.roleplay_autoplay_decision && typeof response.roleplay_autoplay_decision === 'object'
                ? response.roleplay_autoplay_decision
                : null;
            const directorFailed = String(decision?.reason || '') === 'director_failure';
            const completed = normalizeRoleplayAutoplayState(target.roleplayAutoplayState).completed_turns + (directorFailed ? 0 : 1);
            const pausedAfterReply = normalizeRoleplayAutoplayState(target.roleplayAutoplayState).phase === 'paused';
            updateRoleplayAutoplayState(target, {
                phase: pausedAfterReply ? 'paused' : ((!continuous && completed >= targetTurns) || stepOnly ? 'completed' : 'running'),
                completed_turns: completed,
                target_turns: targetTurns,
                continuous,
                error: ''
            });
            saveConversationSnapshot(target);
            if ((!continuous && completed >= targetTurns) || stepOnly) break;
            await roleplayAutoplayWait(360);
        }
        const finished = normalizeRoleplayAutoplayState(target.roleplayAutoplayState);
        if (finished.phase === 'running') {
            updateRoleplayAutoplayState(target, { phase: 'idle', target_turns: targetTurns });
        }
        saveConversationSnapshot(target);
        return true;
    }

    function startRoleplayAutoplay(stepOnly = false) {
        const runtime = syncCurrentRuntimeFromState();
        if (normalizeChatMode(runtime.chatMode) !== 'roleplay') return false;
        applyRoleplayForm(document.getElementById('describe_vlm_chat_modal'), runtime);
        runRoleplayAutoplay(runtime, { stepOnly }).catch((error) => {
            updateRoleplayAutoplayState(runtime, {
                phase: 'error',
                error: String(error?.message || error || '').slice(0, 500)
            }, localText('Autoplay failed.', '托管剧情失败。'));
        });
        return true;
    }

    function pauseRoleplayAutoplay() {
        const runtime = syncCurrentRuntimeFromState();
        const current = normalizeRoleplayAutoplayState(runtime.roleplayAutoplayState);
        if (current.phase !== 'running') return false;
        updateRoleplayAutoplayState(runtime, { phase: 'paused' }, localText('Autoplay paused.', '托管剧情已暂停。'));
        return true;
    }

    function stopRoleplayAutoplay() {
        const runtime = syncCurrentRuntimeFromState();
        const current = normalizeRoleplayAutoplayState(runtime.roleplayAutoplayState);
        if (!['running', 'paused'].includes(current.phase)) return false;
        try {
            current.abort_controller?.abort?.();
        } catch (err) {}
        if (runtime.activeAbortController || runtime.activeRequestId) {
            stopCurrentChatReply({ silent: false });
        }
        if (current.request_id) notifyBackendChatCancel(runtime.conversationId, current.request_id).catch(() => {});
        updateRoleplayAutoplayState(runtime, {
            phase: 'stopped',
            request_id: '',
            abort_controller: null
        }, localText('Autoplay stopped.', '托管剧情已停止。'));
        saveConversationSnapshot(runtime);
        return true;
    }

    function stopRoleplayAutoplayRuntime(runtime) {
        const target = runtime || currentConversationRuntime();
        const current = normalizeRoleplayAutoplayState(target.roleplayAutoplayState);
        if (!['running', 'paused'].includes(current.phase)) return false;
        try {
            current.abort_controller?.abort?.();
        } catch (err) {}
        if (current.request_id) notifyBackendChatCancel(target.conversationId, current.request_id).catch(() => {});
        target.roleplayAutoplayState = normalizeRoleplayAutoplayState(Object.assign({}, current, {
            phase: 'stopped',
            request_id: '',
            abort_controller: null
        }));
        target.persistenceDirty = true;
        return true;
    }

    function actionFromRef(ref) {
        const [messageIndex, actionIndex] = String(ref || '').split(':').map((part) => Number(part));
        const action = state.messages[messageIndex]?.actions?.[actionIndex];
        return action && typeof action === 'object' ? action : null;
    }

    function promptValueForAction(action) {
        const promptText = String(action?.prompt || '').trim();
        if (!promptText) return '';
        const current = readComponentValue('positive_prompt').trim();
        return action.type === 'append_prompt'
            ? (current ? `${current}${current.includes('\n') || promptText.includes('\n') ? '\n' : ', '}${promptText}` : promptText)
            : promptText;
    }

    function optimisticPrompt(action) {
        const next = promptValueForAction(action);
        if (!next) return '';
        setComponentValue('positive_prompt', next);
        return next;
    }

    function applyPromptAction(action) {
        if (!action?.prompt) return;
        const nextPrompt = optimisticPrompt(action);
        setComponentValue('describe_vlm_chat_prompt_bridge', JSON.stringify({ type: 'set_prompt', prompt: nextPrompt }));
        clickComponentButton('describe_vlm_chat_apply_prompt_btn');
        setStatus(t('Prompt updated.', '提示词已更新。'));
    }

    document.addEventListener('change', (evt) => {
        const libraryFile = evt.target.closest?.('[data-roleplay-character-library-file]');
        if (libraryFile) {
            const modal = document.getElementById('describe_vlm_chat_roleplay_character_library_modal');
            const file = Array.from(evt.target.files || [])[0];
            if (modal && file) uploadRoleplayCharacterLibraryImage(modal, file).finally(() => { evt.target.value = ''; });
            return;
        }
        const stateFile = evt.target.closest?.('[data-roleplay-character-library-state-file]');
        if (stateFile) {
            const modal = document.getElementById('describe_vlm_chat_roleplay_character_library_modal');
            const file = Array.from(evt.target.files || [])[0];
            if (modal && file) uploadRoleplayCharacterLibraryStateImage(modal, file).finally(() => { evt.target.value = ''; });
            return;
        }
        const librarySearch = evt.target.closest?.('[data-roleplay-character-library-search]');
        if (librarySearch) {
            renderRoleplayCharacterLibraryList(document.getElementById('describe_vlm_chat_roleplay_character_library_modal'));
            return;
        }
        const characterLibrarySelect = evt.target.closest?.('[data-describe-vlm-chat-roleplay-character-library-select]');
        if (characterLibrarySelect) {
            const modal = document.getElementById('describe_vlm_chat_modal');
            if (!modal || modal.hidden) return;
            syncRoleplayCharacterLibraryControls(modal);
            return;
        }
        const select = evt.target.closest?.('[data-describe-vlm-chat-roleplay-reference-library]');
        if (!select) return;
        const modal = document.getElementById('describe_vlm_chat_modal');
        if (!modal || modal.hidden) return;
        const owner = String(select.getAttribute('data-describe-vlm-chat-roleplay-reference-library') || '').trim();
        renderRoleplayReferenceLibraryPreview(modal, owner, syncCurrentRuntimeFromState());
    });

    document.addEventListener('input', (evt) => {
        if (!evt.target.closest?.('[data-roleplay-character-library-search]')) return;
        renderRoleplayCharacterLibraryList(document.getElementById('describe_vlm_chat_roleplay_character_library_modal'));
    });

    document.addEventListener('click', (evt) => {
        const openCharacterLibrary = evt.target.closest?.('[data-roleplay-character-library-open]');
        if (openCharacterLibrary) {
            evt.preventDefault();
            openRoleplayCharacterLibrary();
            return;
        }
        const characterLibraryModal = document.getElementById('describe_vlm_chat_roleplay_character_library_modal');
        if (characterLibraryModal && !characterLibraryModal.hidden) {
            if (evt.target.closest('[data-roleplay-character-library-close]')) {
                closeRoleplayCharacterLibrary();
                return;
            }
            if (evt.target.closest('[data-roleplay-character-library-new]')) {
                const workspace = roleplayCharacterLibraryWorkspaceState();
                workspace.selectedId = '';
                workspace.draft = emptyRoleplayCharacterLibraryCard();
                workspace.imagePayload = null;
                workspace.imageAssetId = '';
                renderRoleplayCharacterLibraryWorkspace(characterLibraryModal);
                roleplayCharacterLibraryFeedback(characterLibraryModal, localText('New character ready.', '新角色已准备好。'));
                return;
            }
            const selected = evt.target.closest('[data-roleplay-character-library-select]');
            if (selected) {
                loadRoleplayCharacterLibraryWorkspaceCard(characterLibraryModal, selected.getAttribute('data-roleplay-character-library-select'));
                return;
            }
            if (evt.target.closest('[data-roleplay-character-library-upload]')) {
                characterLibraryModal.querySelector('[data-roleplay-character-library-file]')?.click();
                return;
            }
            if (evt.target.closest('[data-roleplay-character-library-state-upload]')) {
                characterLibraryModal.querySelector('[data-roleplay-character-library-state-file]')?.click();
                return;
            }
            if (evt.target.closest('[data-roleplay-character-library-import-current-state]')) {
                importRoleplayCharacterLibraryCurrentState(characterLibraryModal);
                return;
            }
            if (evt.target.closest('[data-roleplay-character-library-agent-generate]')) {
                requestRoleplayCharacterLibraryAgent(characterLibraryModal, 'generate');
                return;
            }
            if (evt.target.closest('[data-roleplay-character-library-agent-optimize]')) {
                requestRoleplayCharacterLibraryAgent(characterLibraryModal, 'optimize');
                return;
            }
            if (evt.target.closest('[data-roleplay-character-library-agent-optimize-visual]')) {
                requestRoleplayCharacterLibraryAgent(characterLibraryModal, 'visual');
                return;
            }
            if (evt.target.closest('[data-roleplay-character-library-describe-image]')) {
                describeRoleplayCharacterLibraryImage(characterLibraryModal);
                return;
            }
            if (evt.target.closest('[data-roleplay-character-library-generate-image]')) {
                generateRoleplayCharacterLibraryImage(characterLibraryModal);
                return;
            }
            if (evt.target.closest('[data-roleplay-character-library-save]')) {
                saveRoleplayCharacterLibraryWorkspace(characterLibraryModal);
                return;
            }
            const historyAdd = evt.target.closest('[data-roleplay-character-library-history-add]');
            if (historyAdd) {
                addRoleplayCharacterLibraryGeneratedAssetToHistory(characterLibraryModal, historyAdd.getAttribute('data-roleplay-character-library-history-add'));
                return;
            }
            if (evt.target.closest('[data-roleplay-character-library-delete]')) {
                deleteRoleplayCharacterLibraryWorkspaceCard(characterLibraryModal);
                return;
            }
            const adopted = evt.target.closest('[data-roleplay-character-library-adopt]');
            if (adopted) {
                adoptRoleplayCharacterLibraryGeneratedAsset(characterLibraryModal, adopted.getAttribute('data-roleplay-character-library-adopt'));
                return;
            }
            const removedAsset = evt.target.closest('[data-roleplay-character-library-remove-asset]');
            if (removedAsset) {
                removeRoleplayCharacterLibraryAsset(characterLibraryModal, removedAsset.getAttribute('data-roleplay-character-library-remove-asset'));
                return;
            }
            const removedHistory = evt.target.closest('[data-roleplay-character-library-history-remove]');
            if (removedHistory) {
                removeRoleplayCharacterLibraryHistoryEntry(characterLibraryModal, removedHistory.getAttribute('data-roleplay-character-library-history-remove'));
                return;
            }
        }
        const openButton = evt.target.closest?.('#describe_vlm_chat_button, #describe_vlm_chat_button button, .describe-vlm-chat-entry');
        if (openButton) {
            evt.preventDefault();
            openModal();
            return;
        }
        const modal = document.getElementById('describe_vlm_chat_modal');
        if (!modal) return;
        if (evt.target.closest('[data-describe-vlm-chat-user-template-dialog-close]')) {
            closeUserSystemPromptTemplateDialog(modal);
            return;
        }
        if (modal.hidden) return;
        if (evt.target.closest('[data-describe-vlm-chat-close]')) {
            closeModal();
            return;
        }
        if (evt.target.closest('[data-describe-vlm-chat-settings-toggle]')) {
            state.settingsPanelOpen = !state.settingsPanelOpen;
            syncChatSettingsControls(modal);
            return;
        }
        if (evt.target.closest('[data-describe-vlm-chat-maximize]')) {
            toggleFloatingPanelMaximize(modal.querySelector('.describe-vlm-chat-panel'));
            return;
        }
        if (evt.target.closest('[data-describe-vlm-chat-roleplay-open]')) {
            const runtime = syncCurrentRuntimeFromState();
            runtime.roleplayReferenceDraft = createRoleplayReferenceDraft(runtime.roleplaySession);
            runtime.roleplayPanelOpen = true;
            state.roleplayPanelOpen = true;
            runtime.persistenceDirty = true;
            syncRoleplayControls(modal);
            refreshRoleplayBranches(runtime).catch(() => {});
            loadRoleplayReferenceLibrary(modal).catch(() => {});
            return;
        }
        if (evt.target.closest('[data-describe-vlm-chat-roleplay-close]')) {
            const runtime = syncCurrentRuntimeFromState();
            delete runtime.roleplayReferenceDraft;
            runtime.roleplayPanelOpen = false;
            state.roleplayPanelOpen = false;
            syncRoleplayControls(modal);
            return;
        }
        const referenceUpload = evt.target.closest('[data-describe-vlm-chat-roleplay-reference-upload]');
        if (referenceUpload) {
            const owner = String(referenceUpload.getAttribute('data-describe-vlm-chat-roleplay-reference-upload') || '').trim();
            modal.querySelector(`[data-describe-vlm-chat-roleplay-reference-file="${owner}"]`)?.click();
            return;
        }
        const referenceLibraryAdd = evt.target.closest('[data-describe-vlm-chat-roleplay-reference-library-add]');
        if (referenceLibraryAdd) {
            const owner = String(referenceLibraryAdd.getAttribute('data-describe-vlm-chat-roleplay-reference-library-add') || '').trim();
            addRoleplayReferenceFromLibrary(owner, modal).catch(() => {});
            return;
        }
        const referenceRemove = evt.target.closest('[data-describe-vlm-chat-roleplay-reference-remove]');
        if (referenceRemove) {
            const owner = String(referenceRemove.getAttribute('data-describe-vlm-chat-roleplay-reference-remove') || '').trim();
            const assetId = String(referenceRemove.getAttribute('data-reference-id') || '').trim();
            const runtime = syncCurrentRuntimeFromState();
            setRoleplayReferenceDraft(runtime, owner, roleplayReferenceDraftIds(runtime, owner).filter((id) => id !== assetId));
            renderRoleplayReferenceLists(modal, runtime);
            renderRoleplayReferenceLibraryControls(modal, runtime);
            return;
        }
        if (evt.target.closest('[data-describe-vlm-chat-roleplay-character-add]')) {
            addRoleplayCharacter(syncCurrentRuntimeFromState(), modal);
            return;
        }
        if (evt.target.closest('[data-describe-vlm-chat-roleplay-character-remove]')) {
            removeRoleplayCharacter(syncCurrentRuntimeFromState(), modal);
            return;
        }
        const stateFieldAdd = evt.target.closest('[data-describe-vlm-chat-roleplay-state-field-add]');
        if (stateFieldAdd) {
            const owner = String(stateFieldAdd.getAttribute('data-describe-vlm-chat-roleplay-state-field-add') || 'character').trim() || 'character';
            const container = roleplayStateFieldsContainer(modal, owner);
            const currentRows = container ? container.querySelectorAll('[data-describe-vlm-chat-roleplay-state-field]').length : 0;
            if (!container || currentRows >= MAX_ROLEPLAY_STATE_FIELDS) return;
            if (container.querySelector('.describe-vlm-chat-roleplay-state-fields-empty')) container.innerHTML = '';
            container.insertAdjacentHTML('beforeend', `<div class="describe-vlm-chat-roleplay-state-field" data-describe-vlm-chat-roleplay-state-field>
          <input type="text" maxlength="${MAX_ROLEPLAY_STATE_FIELD_LABEL}" data-describe-vlm-chat-roleplay-state-field-label placeholder="${escapeHtml(localText('Field name', '字段名'))}" aria-label="${escapeHtml(localText('State field name', '状态字段名'))}">
          <input type="text" maxlength="${MAX_ROLEPLAY_STATE_FIELD_VALUE}" data-describe-vlm-chat-roleplay-state-field-value placeholder="${escapeHtml(localText('Value', '数值或描述'))}" aria-label="${escapeHtml(localText('State field value', '状态字段值'))}">
          <button type="button" data-describe-vlm-chat-roleplay-state-field-remove title="${escapeHtml(localText('Remove state field', '删除状态项'))}" aria-label="${escapeHtml(localText('Remove state field', '删除状态项'))}"><i class="fa-solid fa-xmark"></i></button>
        </div>`);
            container.querySelector('[data-describe-vlm-chat-roleplay-state-field]:last-child [data-describe-vlm-chat-roleplay-state-field-label]')?.focus();
            return;
        }
        const stateFieldRemove = evt.target.closest('[data-describe-vlm-chat-roleplay-state-field-remove]');
        if (stateFieldRemove) {
            const row = stateFieldRemove.closest('[data-describe-vlm-chat-roleplay-state-field]');
            const container = row?.parentElement;
            row?.remove();
            if (container && !container.querySelector('[data-describe-vlm-chat-roleplay-state-field]')) {
                const owner = String(container.getAttribute('data-describe-vlm-chat-roleplay-state-fields-owner') || 'character').trim() || 'character';
                renderRoleplayStateFields(modal, [], owner);
            }
            return;
        }
        if (evt.target.closest('[data-describe-vlm-chat-roleplay-character-manual]')) {
            modal.querySelector('[data-describe-vlm-chat-roleplay-character-name]')?.focus();
            setConversationStatus(syncCurrentRuntimeFromState(), localText(
                'Start with the character name, then add the identity and personality.',
                '先填写角色名称，再补充身份和性格。'
            ));
            return;
        }
        if (evt.target.closest('[data-describe-vlm-chat-roleplay-character-library-load]')) {
            loadRoleplayCharacterFromLibrary(syncCurrentRuntimeFromState(), modal).catch(() => {
                setConversationStatus(syncCurrentRuntimeFromState(), localText('The selected library character could not be loaded.', '选中的角色库角色无法加载。'), true);
            });
            return;
        }
        if (evt.target.closest('[data-describe-vlm-chat-roleplay-character-library-save]')) {
            saveRoleplayCharacterToLibrary(syncCurrentRuntimeFromState(), modal).catch(() => {
                setConversationStatus(syncCurrentRuntimeFromState(), localText('The character could not be saved to the library.', '角色保存到角色库失败。'), true);
            });
            return;
        }
        if (evt.target.closest('[data-describe-vlm-chat-roleplay-character-library-delete]')) {
            deleteRoleplayCharacterFromLibrary(syncCurrentRuntimeFromState(), modal).catch(() => {
                setConversationStatus(syncCurrentRuntimeFromState(), localText('The library character could not be deleted.', '角色库角色删除失败。'), true);
            });
            return;
        }
        if (evt.target.closest('[data-describe-vlm-chat-roleplay-import-draft], [data-describe-vlm-chat-roleplay-character-generate]')) {
            const runtime = syncCurrentRuntimeFromState();
            requestRoleplayFormDraft('character', runtime, modal).catch(() => {
                setConversationStatus(runtime, localText('The character draft could not be created.', '角色草稿生成失败。'), true);
            });
            return;
        }
        const roleplayDraftButton = evt.target.closest('[data-describe-vlm-chat-roleplay-draft]');
        if (roleplayDraftButton) {
            const runtime = syncCurrentRuntimeFromState();
            const targetKind = String(roleplayDraftButton.getAttribute('data-describe-vlm-chat-roleplay-draft') || 'scene').trim();
            requestRoleplayFormDraft(targetKind, runtime, modal).catch(() => {
                setConversationStatus(runtime, localText('The form draft could not be created.', '表单草稿生成失败。'), true);
            });
            return;
        }
        if (evt.target.closest('[data-describe-vlm-chat-roleplay-visual-draft]')) {
            const runtime = syncCurrentRuntimeFromState();
            requestRoleplayVisualDraft(runtime, modal).catch(() => {
                setConversationStatus(runtime, localText('The story image proposal could not be created.', '场照提议生成失败。'), true);
            });
            return;
        }
        if (evt.target.closest('[data-describe-vlm-chat-roleplay-generate-appearance]')) {
            const runtime = syncCurrentRuntimeFromState();
            requestRoleplayAppearanceImage(runtime, modal).catch(() => {
                setRoleplayActionStatus(runtime, modal, 'appearance', localText('The current appearance image task could not be created.', '当前状态图任务创建失败。'), true);
            });
            return;
        }
        if (evt.target.closest('[data-describe-vlm-chat-roleplay-generate-character-reference]')) {
            const runtime = syncCurrentRuntimeFromState();
            requestRoleplayCharacterReferenceImage(runtime, modal).catch(() => {
                setRoleplayActionStatus(runtime, modal, 'character-reference', localText('The character reference image task could not be created.', '角色设定图任务创建失败。'), true);
            });
            return;
        }
        if (evt.target.closest('[data-describe-vlm-chat-roleplay-generate-scene-reference]')) {
            const runtime = syncCurrentRuntimeFromState();
            requestRoleplaySceneReferenceImage(runtime, modal).catch(() => {
                setRoleplayActionStatus(runtime, modal, 'scene-reference', localText('The scene reference image task could not be created.', '场景参考图任务创建失败。'), true);
            });
            return;
        }
        if (evt.target.closest('[data-describe-vlm-chat-roleplay-branch-refresh]')) {
            const runtime = syncCurrentRuntimeFromState();
            refreshRoleplayBranches(runtime).then((ok) => {
                setConversationStatus(runtime, ok
                    ? localText('Branch list refreshed.', '分支列表已刷新。')
                    : localText('Branch list is only available locally.', '当前只能使用本地分支列表。'));
            }).catch(() => {
                setConversationStatus(runtime, localText('Branch list is only available locally.', '当前只能使用本地分支列表。'));
            });
            return;
        }
        if (evt.target.closest('[data-describe-vlm-chat-roleplay-branch-restore]')) {
            const runtime = syncCurrentRuntimeFromState();
            const branchId = modal.querySelector('[data-describe-vlm-chat-roleplay-branch-select]')?.value || '';
            restoreRoleplayBranch(branchId, runtime).catch(() => {
                setConversationStatus(runtime, localText('The branch could not be restored.', '剧情分支恢复失败。'), true);
            });
            return;
        }
        if (evt.target.closest('[data-describe-vlm-chat-roleplay-branch-new-conversation]')) {
            const runtime = syncCurrentRuntimeFromState();
            const branchId = modal.querySelector('[data-describe-vlm-chat-roleplay-branch-select]')?.value || '';
            startRoleplayConversationFromBranch(branchId, runtime).catch(() => {
                setConversationStatus(runtime, localText('The new conversation could not be created from this branch.', '无法从此分支新建对话。'), true);
            });
            return;
        }
        if (evt.target.closest('[data-describe-vlm-chat-roleplay-branch-delete]')) {
            const runtime = syncCurrentRuntimeFromState();
            const branchId = modal.querySelector('[data-describe-vlm-chat-roleplay-branch-select]')?.value || '';
            deleteRoleplayBranch(branchId, runtime).catch(() => {
                setConversationStatus(runtime, localText('The branch could not be deleted.', '剧情分支删除失败。'), true);
            });
            return;
        }
        if (evt.target.closest('[data-describe-vlm-chat-roleplay-save]')) {
            const runtime = syncCurrentRuntimeFromState();
            applyRoleplayForm(modal, runtime);
            runtime.roleplayPanelOpen = false;
            state.roleplayPanelOpen = false;
            saveConversationSnapshot(runtime);
            syncRoleplayControls(modal);
            setConversationStatus(runtime, localText('Roleplay settings applied.', '角色扮演设置已应用。'));
            return;
        }
        if (evt.target.closest('[data-describe-vlm-chat-roleplay-play]')) {
            startRoleplayAutoplay(false);
            return;
        }
        if (evt.target.closest('[data-describe-vlm-chat-roleplay-step]')) {
            startRoleplayAutoplay(true);
            return;
        }
        if (evt.target.closest('[data-describe-vlm-chat-roleplay-pause]')) {
            pauseRoleplayAutoplay();
            return;
        }
        if (evt.target.closest('[data-describe-vlm-chat-roleplay-stop]')) {
            stopRoleplayAutoplay();
            return;
        }
        const conversationDelete = evt.target.closest('[data-describe-vlm-chat-conversation-delete]');
        if (conversationDelete) {
            evt.preventDefault();
            evt.stopPropagation();
            if (confirmDeleteConversation()) {
                deleteConversation(conversationDelete.getAttribute('data-describe-vlm-chat-conversation-delete'));
            }
            return;
        }
        const conversationTab = evt.target.closest('[data-describe-vlm-chat-conversation-tab]');
        if (conversationTab) {
            switchConversation(conversationTab.getAttribute('data-describe-vlm-chat-conversation-tab'));
            return;
        }
        if (evt.target.closest('[data-describe-vlm-chat-clear]')) {
            if (confirmClearConversation()) clearConversation();
            return;
        }
        if (evt.target.closest('[data-describe-vlm-chat-new]')) {
            startNewConversation();
            return;
        }
        if (evt.target.closest('[data-describe-vlm-chat-import-prompt]')) {
            importMainPromptToChatInput();
            return;
        }
        if (evt.target.closest('[data-describe-vlm-chat-user-template-open]')) {
            openUserSystemPromptTemplateDialog(modal);
            return;
        }
        if (evt.target.closest('[data-describe-vlm-chat-user-template-save-as]')) {
            saveUserSystemPromptTemplate(modal, true);
            return;
        }
        if (evt.target.closest('[data-describe-vlm-chat-user-template-save]')) {
            saveUserSystemPromptTemplate(modal);
            return;
        }
        if (evt.target.closest('[data-describe-vlm-chat-user-template-delete]')) {
            deleteUserSystemPromptTemplate(modal);
            return;
        }
        if (evt.target.closest('[data-describe-vlm-chat-save]')) {
            downloadConversation();
            return;
        }
        if (evt.target.closest('[data-describe-vlm-chat-import]')) {
            modal.querySelector('[data-describe-vlm-chat-conversation-file]')?.click();
            return;
        }
        const generationMediaPicker = evt.target.closest('[data-describe-vlm-chat-generation-pick-media]');
        if (generationMediaPicker) {
            const input = modal.querySelector('[data-describe-vlm-chat-generation-file]');
            if (input) {
                input.dataset.actionRef = generationMediaPicker.getAttribute('data-describe-vlm-chat-generation-pick-media') || '';
                input.value = '';
                input.click();
            }
            return;
        }
        if (evt.target.closest('[data-describe-vlm-chat-pick-image]')) {
            modal.querySelector('[data-describe-vlm-chat-file]')?.click();
            return;
        }
        const removeImage = evt.target.closest('[data-describe-vlm-chat-remove-image]');
        if (removeImage) {
            const index = Number(removeImage.getAttribute('data-describe-vlm-chat-remove-image'));
            if (Number.isInteger(index) && index >= 0 && index < state.pendingImages.length) {
                state.pendingImages.splice(index, 1);
            }
            syncCurrentRuntimeFromState();
            renderPendingImages();
            renderMessages();
            return;
        }
        if (evt.target.closest('[data-describe-vlm-chat-stop]')) {
            stopCurrentChatReply();
            return;
        }
        const sendButton = evt.target.closest('[data-describe-vlm-chat-send]');
        if (sendButton) {
            if (!sendButton.disabled) sendMessage();
            return;
        }
        if (evt.target.closest('[data-describe-vlm-chat-download-models]')) {
            const request = state.missingVlmModelRequest || {};
            if (!triggerVlmMissingModelPopup(request.version || readSelectedVlmVersion(), request.customApi || readDescribeCustomApi(readSelectedVlmVersion()))) {
                setStatus(t('Download panel is unavailable. Use the model selector status or reload the page.', '下载面板暂不可用，请通过模型状态入口处理，或刷新页面。'), true);
            }
            return;
        }
        const copyMessage = evt.target.closest('[data-describe-vlm-chat-copy-message]');
        if (copyMessage) {
            copyChatMessage(copyMessage.getAttribute('data-describe-vlm-chat-copy-message'));
            return;
        }
        const quoteMessage = evt.target.closest('[data-describe-vlm-chat-quote]');
        if (quoteMessage) {
            quoteChatMessage(quoteMessage.getAttribute('data-describe-vlm-chat-quote')).catch(() => {
                setStatus(t('Could not restore the quoted message.', '无法恢复引用消息。'), true);
            });
            return;
        }
        if (evt.target.closest('[data-describe-vlm-chat-runtime-status-refresh]')) {
            refreshVlmRuntimeStatus().catch(() => {});
            return;
        }
        const rollbackMessage = evt.target.closest('[data-describe-vlm-chat-rollback]');
        if (rollbackMessage) {
            rollbackChatToMessage(rollbackMessage.getAttribute('data-describe-vlm-chat-rollback')).catch(() => {
                setStatus(t('Could not move the message back to input.', '无法将消息恢复到输入框。'), true);
            });
            return;
        }
        const regenerateMessage = evt.target.closest('[data-describe-vlm-chat-regenerate]');
        if (regenerateMessage) {
            regenerateRoleplayMessage(regenerateMessage.getAttribute('data-describe-vlm-chat-regenerate')).catch(() => {
                setStatus(t('Could not generate another reply version.', '无法生成新的回复版本。'), true);
            });
            return;
        }
        const previousVariant = evt.target.closest('[data-describe-vlm-chat-variant-prev]');
        if (previousVariant) {
            switchRoleplayReplyVariant(previousVariant.getAttribute('data-describe-vlm-chat-variant-prev'), -1);
            return;
        }
        const nextVariant = evt.target.closest('[data-describe-vlm-chat-variant-next]');
        if (nextVariant) {
            switchRoleplayReplyVariant(nextVariant.getAttribute('data-describe-vlm-chat-variant-next'), 1);
            return;
        }
        const deleteMessage = evt.target.closest('[data-describe-vlm-chat-delete]');
        if (deleteMessage) {
            deleteChatMessage(deleteMessage.getAttribute('data-describe-vlm-chat-delete'));
            return;
        }
        const generationAttach = evt.target.closest('[data-describe-vlm-chat-generation-attach]');
        if (generationAttach) {
            generationAttach.disabled = true;
            attachCreativeResultImage(
                generationAttach.getAttribute('data-describe-vlm-chat-generation-attach'),
                generationAttach.getAttribute('data-describe-vlm-chat-generation-asset')
            ).finally(() => {
                if (generationAttach.isConnected) generationAttach.disabled = false;
            });
            return;
        }
        const stateAppearanceAccept = evt.target.closest('[data-describe-vlm-chat-roleplay-state-accept]');
        if (stateAppearanceAccept) {
            acceptRoleplayStateImage(
                stateAppearanceAccept.getAttribute('data-describe-vlm-chat-roleplay-state-accept'),
                stateAppearanceAccept.getAttribute('data-describe-vlm-chat-generation-asset')
            ).catch(() => {
                setConversationStatus(syncCurrentRuntimeFromState(), localText('The current appearance image was not applied.', '当前状态图没有采用成功。'), true);
            });
            return;
        }
        const characterReferenceAccept = evt.target.closest('[data-describe-vlm-chat-roleplay-character-reference-accept]');
        if (characterReferenceAccept) {
            acceptRoleplayCharacterReferenceImage(
                characterReferenceAccept.getAttribute('data-describe-vlm-chat-roleplay-character-reference-accept'),
                characterReferenceAccept.getAttribute('data-describe-vlm-chat-generation-asset')
            ).catch(() => {
                setConversationStatus(syncCurrentRuntimeFromState(), localText('The character reference image was not applied.', '角色设定图没有采用成功。'), true);
            });
            return;
        }
        const sceneReferenceAccept = evt.target.closest('[data-describe-vlm-chat-roleplay-scene-reference-accept]');
        if (sceneReferenceAccept) {
            acceptRoleplaySceneReferenceImage(
                sceneReferenceAccept.getAttribute('data-describe-vlm-chat-roleplay-scene-reference-accept'),
                sceneReferenceAccept.getAttribute('data-describe-vlm-chat-generation-asset')
            ).catch(() => {
                setRoleplayActionStatus(syncCurrentRuntimeFromState(), document.getElementById('describe_vlm_chat_modal'), 'scene-reference', localText('The scene reference image was not applied.', '场景参考图没有采用成功。'), true);
            });
            return;
        }
        const promptReformat = evt.target.closest('[data-describe-vlm-chat-generation-reformat-prompt]');
        if (promptReformat) {
            requestRoleplayVisualPromptReformat(
                promptReformat.getAttribute('data-describe-vlm-chat-generation-reformat-prompt'),
                syncCurrentRuntimeFromState(),
                modal
            ).catch(() => {
                setConversationStatus(syncCurrentRuntimeFromState(), localText('The scene prompt could not be adapted.', '场照提示词整理失败。'), true);
            });
            return;
        }
        const generationRun = evt.target.closest('[data-describe-vlm-chat-generation-run]');
        if (generationRun) {
            const generationRef = generationRun.getAttribute('data-describe-vlm-chat-generation-run');
            const generationFound = creativeActionFromRef(generationRef);
            const currentRuntime = syncCurrentRuntimeFromState();
            const queueMode = String(
                currentRuntime.roleplaySession?.visual_config?.queue_mode
                || currentRuntime.roleplaySession?.autoplay_config?.queue_mode
                || 'background'
            ).trim().toLowerCase();
            if (generationFound?.action?.roleplay_visual && !generationFound.action.roleplay_visual_manual && queueMode === 'background') {
                const generation = creativeGenerationForAction(generationFound.action);
                generation.state = 'awaiting_confirmation';
                generation.skip_reason = '';
                generation.queue_position = 0;
                generation.error = '';
                persistCreativeAction(true, {}, currentRuntime);
                scheduleRoleplayVisualQueue(currentRuntime);
            } else {
                startCreativeGeneration(generationRef);
            }
            return;
        }
        const generationStop = evt.target.closest('[data-describe-vlm-chat-generation-stop]');
        if (generationStop) {
            stopCreativeGeneration(generationStop.getAttribute('data-describe-vlm-chat-generation-stop'));
            return;
        }
        const generationCollapse = evt.target.closest('[data-describe-vlm-chat-generation-collapse]');
        if (generationCollapse) {
            const ref = generationCollapse.getAttribute('data-describe-vlm-chat-generation-collapse');
            const found = syncCreativeActionFromDom(ref);
            if (found) {
                found.action.ui_collapsed = !found.action.ui_collapsed;
                persistCreativeAction(true);
            }
            return;
        }
        const mediaMove = evt.target.closest('[data-describe-vlm-chat-media-move]');
        if (mediaMove) {
            moveCreativeActionMediaInput(
                mediaMove.getAttribute('data-describe-vlm-chat-media-ref'),
                mediaMove.getAttribute('data-describe-vlm-chat-media-index'),
                mediaMove.getAttribute('data-describe-vlm-chat-media-move')
            );
            return;
        }
        const mediaRemove = evt.target.closest('[data-describe-vlm-chat-media-remove]');
        if (mediaRemove) {
            removeCreativeActionMediaInput(
                mediaRemove.getAttribute('data-describe-vlm-chat-media-ref'),
                mediaRemove.getAttribute('data-describe-vlm-chat-media-index')
            );
            return;
        }
        const offerDismiss = evt.target.closest('[data-describe-vlm-chat-offer-dismiss]');
        if (offerDismiss) {
            dismissCreativeOffer(offerDismiss.getAttribute('data-describe-vlm-chat-offer-dismiss'));
            return;
        }
        if (evt.target.closest('[data-describe-vlm-chat-preference-toggle]')) {
            toggleCreativePreferenceMount();
            return;
        }
        const initiativeMode = evt.target.closest('[data-describe-vlm-chat-initiative]');
        if (initiativeMode) {
            setCreativeInitiativeMode(initiativeMode.getAttribute('data-describe-vlm-chat-initiative'));
            return;
        }
        const preferenceStyle = evt.target.closest('[data-describe-vlm-chat-preference-style]');
        if (preferenceStyle) {
            const style = String(preferenceStyle.getAttribute('data-describe-vlm-chat-preference-style') || 'auto');
            const preset = creativePresetForStyle(style);
            setCreativePreference({ style, preset, parameter_profile: '' }, 'preference_card');
            return;
        }
        if (evt.target.closest('[data-describe-vlm-chat-preference-apply]')) {
            const preset = String(modal.querySelector('[data-describe-vlm-chat-preference-preset]')?.value || '').trim();
            const parameterProfile = String(modal.querySelector('[data-describe-vlm-chat-preference-parameter-profile]')?.value || '').trim();
            if (!preset) {
                setStatus(localText('Choose a Preset first.', '请先选择 Preset。'), true);
                return;
            }
            setCreativePreference({ style: 'custom', preset, parameter_profile: parameterProfile }, 'preference_card');
            return;
        }
        const apply = evt.target.closest('[data-describe-vlm-chat-apply]');
        if (apply) {
            const action = Object.assign({}, actionFromRef(apply.getAttribute('data-describe-vlm-chat-apply')) || {}, { type: 'set_prompt' });
            applyPromptAction(action);
            return;
        }
        const append = evt.target.closest('[data-describe-vlm-chat-append]');
        if (append) {
            const action = Object.assign({}, actionFromRef(append.getAttribute('data-describe-vlm-chat-append')) || {}, { type: 'append_prompt' });
            applyPromptAction(action);
            return;
        }
        const copy = evt.target.closest('[data-describe-vlm-chat-copy]');
        if (copy) {
            const ref = copy.getAttribute('data-describe-vlm-chat-copy');
            const found = syncCreativeActionFromDom(ref);
            const action = found?.action || actionFromRef(ref);
            writeClipboardText(action?.prompt).then((copied) => {
                setStatus(
                    copied ? t('Prompt copied.', '提示词已复制。') : t('Copy failed.', '复制失败。'),
                    !copied
                );
            });
            return;
        }
    });

    document.addEventListener('change', (evt) => {
        if (evt.target?.matches?.('[data-describe-vlm-chat-max-tokens]')) {
            state.maxTokens = normalizeChatMaxTokens(evt.target.value, 0);
            saveChatSettings();
            return;
        }
        if (evt.target?.matches?.('[data-describe-vlm-chat-vram-policy]')) {
            state.vramPolicy = normalizeVlmVramPolicy(evt.target.value);
            state.vlmRuntimeStatus = null;
            state.vlmRuntimeStatusResponse = null;
            saveChatSettings();
            updateVlmRuntimeStatus(document.getElementById('describe_vlm_chat_modal'));
            refreshVlmRuntimeStatus().catch(() => {});
            return;
        }
        if (evt.target?.matches?.('[data-describe-vlm-chat-kv-cache-type]')) {
            state.kvCacheType = normalizeVlmKvCacheType(evt.target.value);
            state.vlmRuntimeStatus = null;
            state.vlmRuntimeStatusResponse = null;
            saveChatSettings();
            updateVlmRuntimeStatus(document.getElementById('describe_vlm_chat_modal'));
            refreshVlmRuntimeStatus().catch(() => {});
            return;
        }
        if (evt.target?.matches?.('[data-describe-vlm-chat-n-ctx]')) {
            const version = resolveVlmVersion(readSelectedVlmVersion());
            state.nCtx = normalizeVlmNctx(evt.target.value, 0, vlmContextWindowForVersion(version));
            state.vlmRuntimeStatus = null;
            state.vlmRuntimeStatusResponse = null;
            saveChatSettings();
            updateVlmRuntimeStatus(document.getElementById('describe_vlm_chat_modal'));
            refreshVlmRuntimeStatus().catch(() => {});
            return;
        }
        if (evt.target?.matches?.('[data-describe-vlm-chat-roleplay-visual-character]')) {
            const ref = evt.target.getAttribute('data-describe-vlm-chat-roleplay-visual-character');
            const found = syncCreativeActionFromDom(ref);
            if (found) {
                found.action.generation = creativeGenerationForAction(found.action);
                if (!CREATIVE_ACTIVE_STATES.has(String(found.action.generation.state || '').toLowerCase())) {
                    found.action.generation.state = 'awaiting_confirmation';
                    found.action.generation.error = '';
                }
                persistCreativeAction(true);
            }
            return;
        }
        if (evt.target?.matches?.('[data-describe-vlm-chat-auto-generate]')) {
            setCreativePreference({ auto_generate: !!evt.target.checked }, 'preference_card');
            return;
        }
        if (evt.target?.matches?.('[data-describe-vlm-chat-preference-preset]')) {
            syncCreativePreferenceParameterProfileOptions();
            syncCreativePreferenceApplyButton();
            return;
        }
        if (evt.target?.matches?.('[data-describe-vlm-chat-preference-parameter-profile]')) {
            syncCreativePreferenceApplyButton();
            return;
        }
        if (evt.target?.matches?.('[data-describe-vlm-chat-generation-preset]')) {
            const ref = evt.target.getAttribute('data-describe-vlm-chat-generation-preset');
            const prior = creativeActionFromRef(ref);
            const priorPreset = String(prior?.action?.preset || '').trim();
            const priorPromptTarget = String(prior?.action?.prompt_target_preset || priorPreset).trim();
            const priorPromptUserEdited = !!prior?.action?.prompt_user_edited;
            const before = prior?.action?.media_inputs?.length || 0;
            const found = syncCreativeActionFromDom(ref);
            let shouldAutoReformat = false;
            if (found) {
                found.action.preset_source = 'user';
                const entry = creativePresetEntry(found.action.preset);
                if (!creativeParameterProfileEntry(found.action.parameter_profile, found.action.preset)) {
                    found.action.parameter_profile = '';
                    found.action.parameter_profile_preset = '';
                }
                const after = clampCreativeActionMediaInputs(found.action, entry).length;
                found.action.execution_plan = creativeExecutionPlanForEntry(found.action, entry, 'request_hint');
                const generation = creativeGenerationForAction(found.action);
                if (!CREATIVE_ACTIVE_STATES.has(String(generation.state || ''))) {
                    generation.state = found.action.execution_plan.status === 'ready' ? 'awaiting_confirmation' : found.action.execution_plan.status;
                    generation.error = '';
                }
                if (
                    found.action.roleplay_visual
                    && priorPreset
                    && priorPreset !== String(found.action.preset || '').trim()
                ) {
                    const targetPreset = String(found.action.preset || '').trim();
                    found.action.prompt_reformat = {
                        state: 'stale',
                        target_preset: targetPreset,
                        request_id: '',
                        error: ''
                    };
                    shouldAutoReformat = !priorPromptUserEdited && (!priorPromptTarget || priorPromptTarget === priorPreset);
                }
                persistCreativeAction(true);
                if (shouldAutoReformat) {
                    window.setTimeout(() => {
                        requestRoleplayVisualPromptReformat(ref, syncCurrentRuntimeFromState(), modal).catch(() => {});
                    }, 0);
                }
                if (after < before) {
                    setStatus(localText(
                        `This Preset accepts ${after} input images; extra references were removed.`,
                        `这个 Preset 支持 ${after} 张输入图片，多余引用已移除。`
                    ));
                }
            }
            return;
        }
        if (evt.target?.matches?.('[data-describe-vlm-chat-generation-parameter-profile]')) {
            const ref = evt.target.getAttribute('data-describe-vlm-chat-generation-parameter-profile');
            const prior = creativeActionFromRef(ref);
            const priorPreset = String(prior?.action?.preset || '').trim();
            const priorPromptTarget = String(prior?.action?.prompt_target_preset || priorPreset).trim();
            const priorPromptUserEdited = !!prior?.action?.prompt_user_edited;
            const selectedOption = evt.target.selectedOptions?.[0];
            const selectedProfilePreset = String(selectedOption?.getAttribute('data-preset') || '').trim();
            const selectedProfileName = String(
                selectedOption?.getAttribute('data-profile-name') || evt.target.value || ''
            ).trim();
            const found = syncCreativeActionFromDom(ref);
            if (found) {
                let shouldAutoReformat = false;
                found.action.parameter_profile = selectedProfileName;
                found.action.parameter_profile_preset = selectedProfilePreset;
                if (
                    found.action.roleplay_visual
                    && selectedProfilePreset
                    && priorPreset
                    && selectedProfilePreset.toLowerCase() !== priorPreset.toLowerCase()
                ) {
                    found.action.preset = selectedProfilePreset;
                    found.action.preset_source = 'user';
                    found.action.prompt_reformat = {
                        state: 'stale',
                        target_preset: selectedProfilePreset,
                        request_id: '',
                        error: ''
                    };
                    shouldAutoReformat = !priorPromptUserEdited && (!priorPromptTarget || priorPromptTarget === priorPreset);
                }
                found.action.execution_plan = creativeExecutionPlanForEntry(
                    found.action,
                    creativePresetEntry(found.action.preset),
                    'request_hint'
                );
                const generation = creativeGenerationForAction(found.action);
                if (!CREATIVE_ACTIVE_STATES.has(String(generation.state || ''))) {
                    generation.state = found.action.execution_plan.status === 'ready' ? 'awaiting_confirmation' : found.action.execution_plan.status;
                    generation.error = '';
                }
                persistCreativeAction(true);
                if (shouldAutoReformat) {
                    window.setTimeout(() => {
                        requestRoleplayVisualPromptReformat(ref, syncCurrentRuntimeFromState(), modal).catch(() => {});
                    }, 0);
                }
            }
            return;
        }
        if (evt.target?.matches?.('[data-describe-vlm-chat-generation-theme]')) {
            const ref = evt.target.getAttribute('data-describe-vlm-chat-generation-theme');
            const found = syncCreativeActionFromDom(ref);
            if (found) {
                const entry = creativePresetEntry(found.action.preset);
                found.action.execution_plan = creativeExecutionPlanForEntry(found.action, entry, 'request_hint');
                const generation = creativeGenerationForAction(found.action);
                if (!CREATIVE_ACTIVE_STATES.has(String(generation.state || ''))) {
                    generation.state = found.action.execution_plan.status === 'ready' ? 'awaiting_confirmation' : found.action.execution_plan.status;
                    generation.error = '';
                }
                persistCreativeAction(true);
            }
            return;
        }
        if (evt.target?.matches?.('[data-describe-vlm-chat-generation-output-type]')) {
            const ref = evt.target.getAttribute('data-describe-vlm-chat-generation-output-type');
            const found = syncCreativeActionFromDom(ref);
            if (found) {
                const inputCount = Array.isArray(found.action.media_inputs) ? found.action.media_inputs.length : 0;
                let entry = creativePresetEntry(found.action.preset);
                const task = creativeActionTask(found.action, inputCount);
                if (!entry || !creativePresetHasTaskRoute(entry, task, inputCount)) {
                    const compatible = creativeCompatiblePresetEntry(task, inputCount);
                    if (compatible) {
                        found.action.preset = compatible.name;
                        found.action.preset_source = 'user';
                        entry = compatible;
                        if (!creativeParameterProfileEntry(found.action.parameter_profile, found.action.preset)) found.action.parameter_profile = '';
                    }
                }
                clampCreativeActionMediaInputs(found.action, entry);
                found.action.execution_plan = creativeExecutionPlanForEntry(found.action, entry, 'request_hint');
                const generation = creativeGenerationForAction(found.action);
                if (!CREATIVE_ACTIVE_STATES.has(String(generation.state || ''))) {
                    generation.state = found.action.execution_plan.status === 'ready' ? 'awaiting_confirmation' : found.action.execution_plan.status;
                    generation.error = '';
                }
                persistCreativeAction(true);
            }
            return;
        }
        if (evt.target?.matches?.('[data-describe-vlm-chat-generation-aspect], [data-describe-vlm-chat-generation-count], [data-describe-vlm-chat-generation-duration], [data-describe-vlm-chat-generation-prompt], [data-describe-vlm-chat-outpaint]')) {
            const ref = evt.target.getAttribute('data-describe-vlm-chat-generation-aspect')
                || evt.target.getAttribute('data-describe-vlm-chat-generation-count')
                || evt.target.getAttribute('data-describe-vlm-chat-generation-duration')
                || evt.target.getAttribute('data-describe-vlm-chat-generation-prompt')
                || evt.target.getAttribute('data-describe-vlm-chat-outpaint-ref');
            const found = syncCreativeActionFromDom(ref);
            if (found && evt.target.matches('[data-describe-vlm-chat-generation-prompt]')) {
                found.action.prompt_user_edited = true;
            }
            persistCreativeAction(false);
            return;
        }
        if (evt.target?.matches?.('[data-describe-vlm-chat-model-select]')) {
            setDescribeVlmVersionFromHeader(evt.target.value);
            state.vlmRuntimeStatus = null;
            state.vlmRuntimeStatusResponse = null;
            syncChatSettingsControls(document.getElementById('describe_vlm_chat_modal'));
            refreshVlmRuntimeStatus().catch(() => {});
            return;
        }
        if (evt.target?.matches?.('[data-describe-vlm-chat-conversation-select]')) {
            switchConversation(evt.target.value);
            return;
        }
        if (evt.target?.matches?.('[data-describe-vlm-chat-mode]')) {
            const previousMode = state.chatMode;
            state.chatMode = normalizeChatMode(evt.target.value);
            const runtime = syncCurrentRuntimeFromState();
            runtime.chatMode = state.chatMode;
            if (
                state.chatMode === 'roleplay'
                && previousMode !== 'roleplay'
                && !runtime.messages.length
            ) {
                runtime.autoAttachPreviousImage = false;
                state.autoAttachPreviousImage = false;
            }
            if (state.chatMode !== 'roleplay') stopRoleplayAutoplay();
            ensureCreativePreferencePrompt();
            saveChatSettings();
            saveConversationSnapshot(runtime);
            syncChatSettingsControls(document.getElementById('describe_vlm_chat_modal'));
            renderMessages();
        }
        if (evt.target?.matches?.('[data-describe-vlm-chat-roleplay-character-select]')) {
            switchRoleplayCharacter(
                syncCurrentRuntimeFromState(),
                document.getElementById('describe_vlm_chat_modal'),
                evt.target.value
            );
            return;
        }
        if (evt.target?.matches?.('[data-describe-vlm-chat-roleplay-branch-select]')) {
            syncRoleplayBranchControls(document.getElementById('describe_vlm_chat_modal'), syncCurrentRuntimeFromState());
        }
        if (evt.target?.matches?.('[data-describe-vlm-chat-template]')) {
            applySystemPromptTemplate(evt.target.value, document.getElementById('describe_vlm_chat_modal'));
        }
        if (evt.target?.matches?.('[data-describe-vlm-chat-user-template-dialog-select]')) {
            applyUserSystemPromptTemplate(evt.target.value, document.getElementById('describe_vlm_chat_modal'));
        }
        if (evt.target?.matches?.('[data-describe-vlm-chat-auto-previous-image]')) {
            state.autoAttachPreviousImage = !!evt.target.checked;
            saveConversationSnapshot();
        }
        if (evt.target?.matches?.('[data-describe-vlm-chat-unload-after]')) {
            state.unloadAfterChat = !!evt.target.checked;
            saveChatSettings();
        }
        if (evt.target?.matches?.('[data-describe-vlm-chat-file]')) {
            addPendingImageFiles(evt.target.files || []);
            evt.target.value = '';
        }
        if (evt.target?.matches?.('[data-describe-vlm-chat-generation-file]')) {
            const ref = String(evt.target.dataset.actionRef || '');
            delete evt.target.dataset.actionRef;
            const files = evt.target.files || [];
            evt.target.value = '';
            if (ref) addCreativeActionImageFiles(ref, files);
        }
        if (evt.target?.matches?.('[data-describe-vlm-chat-roleplay-reference-file]')) {
            const owner = String(evt.target.getAttribute('data-describe-vlm-chat-roleplay-reference-file') || '').trim();
            const files = Array.from(evt.target.files || []);
            evt.target.value = '';
            addRoleplayReferenceFiles(files, owner, document.getElementById('describe_vlm_chat_modal')).catch(() => {});
        }
        if (evt.target?.matches?.('[data-describe-vlm-chat-conversation-file]')) {
            importConversationFile(evt.target.files?.[0]);
            evt.target.value = '';
        }
        if (evt.target?.closest?.('#describe_vlm_model_dropdown, #describe_vlm_model, #describe_vlm_custom_panel')) {
            updateAnswerModelIndicator();
        }
    });

    document.addEventListener('input', (evt) => {
        if (evt.target?.matches?.('[data-describe-vlm-chat-roleplay-character-name], [data-describe-vlm-chat-roleplay-character-identity], [data-describe-vlm-chat-roleplay-character-style]')) {
            const modal = document.getElementById('describe_vlm_chat_modal');
            const guidance = modal?.querySelector('[data-describe-vlm-chat-roleplay-character-guidance]');
            if (guidance) {
                const hasDetails = [
                    modal.querySelector('[data-describe-vlm-chat-roleplay-character-name]')?.value,
                    modal.querySelector('[data-describe-vlm-chat-roleplay-character-identity]')?.value,
                    modal.querySelector('[data-describe-vlm-chat-roleplay-character-style]')?.value
                ].some((value) => String(value || '').trim());
                guidance.hidden = hasDetails;
            }
        }
        if (evt.target?.matches?.('[data-describe-vlm-chat-generation-prompt]')) {
            const found = creativeActionFromRef(evt.target.getAttribute('data-describe-vlm-chat-generation-prompt'));
            if (found) {
                found.action.prompt = evt.target.value || '';
                found.action.prompt_user_edited = true;
                state.persistenceDirty = true;
            }
            return;
        }
        if (evt.target?.matches?.('[data-describe-vlm-chat-generation-duration]')) {
            const found = syncCreativeActionFromDom(evt.target.getAttribute('data-describe-vlm-chat-generation-duration'));
            if (found) state.persistenceDirty = true;
            return;
        }
        if (evt.target?.matches?.('[data-describe-vlm-chat-system]')) {
            state.customSystemPrompt = evt.target.value || '';
            state.systemPromptManualOverride = String(state.customSystemPrompt || '').trim()
                !== mergedSystemPromptContent().trim();
            syncSystemPromptTemplateControls(document.getElementById('describe_vlm_chat_modal'));
            saveChatSettings();
        }
        if (evt.target?.matches?.('[data-describe-vlm-chat-user-template-name]')) {
            state.userSystemPromptTemplateName = evt.target.value || '';
            saveChatSettings();
        }
        if (evt.target?.matches?.('[data-describe-vlm-chat-user-template-content]')) {
            state.userSystemPromptContent = evt.target.value || '';
            state.systemPromptManualOverride = false;
            state.customSystemPrompt = mergedSystemPromptContent();
            syncSystemPromptTemplateControls(document.getElementById('describe_vlm_chat_modal'));
            saveChatSettings();
        }
        if (evt.target?.closest?.('#describe_vlm_model_dropdown, #describe_vlm_model, #describe_vlm_custom_panel')) {
            updateAnswerModelIndicator();
        }
    });

    document.addEventListener('pointerdown', handleModalPointerDown, true);
    document.addEventListener('pointerup', handleModalPointerUp, true);
    document.addEventListener('pointercancel', resetModalPointerState, true);
    document.addEventListener('wheel', containModalWheel, { capture: true, passive: false });
    document.addEventListener('touchstart', containModalTouchStart, { capture: true, passive: true });
    document.addEventListener('touchmove', containModalTouchMove, { capture: true, passive: false });
    document.addEventListener('touchend', resetModalTouchPoint, true);
    document.addEventListener('touchcancel', resetModalTouchPoint, true);

    document.addEventListener('paste', (evt) => {
        if (!modalIsOpen() || !eventInsideModal(evt)) return;
        if (evt.target?.closest?.('[data-describe-vlm-chat-system]')) return;
        const files = collectClipboardImageFiles(evt.clipboardData);
        if (!files.length) return;
        const text = evt.clipboardData?.getData?.('text/plain') || '';
        if (!text) evt.preventDefault();
        addPendingImageFiles(files);
    });

    document.addEventListener('dragover', (evt) => {
        if (!modalIsOpen() || !eventInsideModal(evt)) return;
        const hasImage = collectClipboardImageFiles(evt.dataTransfer).length > 0 || !!firstImageDropUrl(evt.dataTransfer);
        if (!hasImage) return;
        evt.preventDefault();
        document.getElementById('describe_vlm_chat_modal')?.classList.add('is-drag-over');
    });

    document.addEventListener('dragleave', () => {
        document.getElementById('describe_vlm_chat_modal')?.classList.remove('is-drag-over');
    });

    document.addEventListener('drop', async (evt) => {
        if (!modalIsOpen() || !eventInsideModal(evt)) return;
        const files = await collectDroppedImageFiles(evt.dataTransfer);
        if (!files.length) return;
        evt.preventDefault();
        document.getElementById('describe_vlm_chat_modal')?.classList.remove('is-drag-over');
        addPendingImageFiles(files);
    });

    document.addEventListener('keydown', (evt) => {
        const input = evt.target?.closest?.('[data-describe-vlm-chat-input]');
        if (!input) return;
        if (evt.key === 'Enter' && !evt.shiftKey) {
            evt.preventDefault();
            sendMessage();
        }
        if (evt.key === 'Escape') closeModal();
    });

    window.addEventListener('simpai:parameter-profiles-changed', () => {
        refreshCreativePresetCatalogAfterProfileChange().catch(() => {});
    });
    window.addEventListener('simpai:vlm-model-catalog', (evt) => {
        applyDescribeVlmModelCatalog(evt?.detail);
        updateAnswerModelIndicator();
        syncRoleplayControls(document.getElementById('describe_vlm_chat_modal'));
    });
    setTimeout(() => refreshDescribeVlmModelCatalog(false).catch(() => {}), 0);

    function labelOpenButton() {
        anchorOpenButton();
        const host = root().querySelector('#describe_vlm_chat_button');
        const button = host?.querySelector?.('button') || host;
        if (!button) return;
        const label = t('VLM/LLM AI chat', 'VLM/LLM AI对话');
        button.setAttribute('title', label);
        button.setAttribute('aria-label', label);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', labelOpenButton);
    } else {
        labelOpenButton();
    }
    try {
        let anchorPending = 0;
        const scheduleAnchor = () => {
            if (anchorPending) return;
            anchorPending = window.setTimeout(() => {
                anchorPending = 0;
                labelOpenButton();
                updateAnswerModelIndicator();
            }, 80);
        };
        new MutationObserver(scheduleAnchor).observe(document.body, { childList: true, subtree: true });
        window.addEventListener('resize', scheduleAnchor, { passive: true });
    } catch (err) {
        // MutationObserver can be unavailable in unusual embedded contexts.
    }
    window.setTimeout(labelOpenButton, 250);
    window.setTimeout(labelOpenButton, 1200);
    window.setTimeout(labelOpenButton, 2600);
})();
