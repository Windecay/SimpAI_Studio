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
    const DESCRIBE_VLM_MODEL_CHOICES = [
        'Qwen3.5-9B-abliterated-Q4_K_M',
        'Qwen3.5-9B-abliterated-Q2_K',
        'Qwen3.5-9B-abliterated-Q6_K',
        'Qwen3.5-9B-abliterated-Q8_0',
        'Custom'
    ];
    const ONE_PIXEL_IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';
    const SETTINGS_STORAGE_KEY = 'simpai.describeVlmChat.settings.v1';
    const CONVERSATION_STORAGE_KEY = 'simpai.describeVlmChat.conversation.v1';
    const CONVERSATION_SCHEMA = 'simpai.describeVlmChat.conversation';
    const CONVERSATION_VERSION = 7;
    const SYSTEM_PROMPT_TEMPLATE_ENDPOINT = '/vlm-system-prompt-templates';
    const MAX_PERSISTED_MESSAGES = 80;
    const MAX_PERSISTED_TEXT = 12000;
    const MAX_PERSISTED_THUMB_LENGTH = 80000;
    const MAX_PERSISTED_THUMB_TOTAL = 480000;
    const CREATIVE_DEFAULT_PRESET = 'Z-imageT';
    const CREATIVE_POLL_INTERVAL_MS = 900;
    const CREATIVE_TERMINAL_STATES = new Set(['finished', 'failed', 'canceled', 'skipped']);
    const CREATIVE_ACTIVE_STATES = new Set(['preparing', 'checking_models', 'queued', 'running', 'cancelling', 'skipping']);
    const CREATIVE_IMAGE_TASKS = new Set([
        'text_to_image', 'image_edit', 'multi_image_edit', 'image_upscale', 'image_restore', 'image_detail_enhance',
        'image_background_removal', 'image_object_removal', 'image_outpaint', 'image_relight',
        'image_style_transfer', 'image_face_swap', 'image_pose_transfer', 'image_pose_extraction',
        'image_anime_to_real', 'image_view_synthesis', 'image_depth_estimation',
        'image_object_transfer', 'image_expression_transfer'
    ]);
    const CREATIVE_IMAGE_INPUT_TASKS = new Set([...CREATIVE_IMAGE_TASKS].filter((task) => task !== 'text_to_image'));
    const CREATIVE_MULTI_IMAGE_TASKS = new Set([
        'multi_image_edit', 'image_style_transfer', 'image_face_swap', 'image_pose_transfer',
        'image_object_transfer', 'image_expression_transfer'
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
        expression_transfer: 'image_expression_transfer'
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
        if (mode === 'creative' || mode === 'create' || mode === 'creation' || mode === 'creative_mode') return 'creative';
        if (mode === 'prompt' || mode === 'prompt_assistant' || mode === 'assistant') return 'prompt';
        if (mode === 'guide' || mode === 'guide_mode' || mode === 'wizard' || mode === 'ui_guide') return 'guide';
        if (mode === 'raw' || mode === 'raw_model') return 'raw';
        return 'chat';
    }

    function normalizeChatWindowLayout(value) {
        if (!value || typeof value !== 'object') return null;
        const finite = (item) => {
            const number = Number(item);
            return Number.isFinite(number) && number > 0 ? Math.round(number) : null;
        };
        const left = finite(value.left);
        const top = finite(value.top);
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

    function loadChatSettings() {
        try {
            const data = JSON.parse(window.localStorage?.getItem(SETTINGS_STORAGE_KEY) || '{}');
            return {
                chatMode: normalizeChatMode(data.chatMode),
                customSystemPrompt: String(data.customSystemPrompt || ''),
                systemPromptTemplateId: String(data.systemPromptTemplateId || ''),
                unloadAfterChat: !!data.unloadAfterChat,
                windowLayout: normalizeChatWindowLayout(data.windowLayout)
            };
        } catch (err) {
            return { chatMode: 'chat', customSystemPrompt: '', systemPromptTemplateId: '', unloadAfterChat: false, windowLayout: null };
        }
    }

    const savedChatSettings = loadChatSettings();
    let modalBackdropPointerStarted = false;
    let modalTouchPoint = null;
    let describeViewportSyncFrame = 0;

    const initialSystemParams = window.simpleaiTopbarSystemParams || {};
    const state = {
        __lang: String(initialSystemParams.__lang || initialSystemParams.language || getUiLang(initialSystemParams) || 'en'),
        conversationId: '',
        messages: [],
        busy: false,
        requestToken: 0,
        activeAbortController: null,
        activeRequestId: '',
        autoAttachPreviousImage: true,
        pendingImages: [],
        lastAutoReferencedDescribeMediaKey: '',
        describeMediaReferencePromise: null,
        missingVlmModelRequest: null,
        chatMode: savedChatSettings.chatMode,
        customSystemPrompt: savedChatSettings.customSystemPrompt,
        systemPromptTemplateId: savedChatSettings.systemPromptTemplateId,
        systemPromptTemplates: [],
        systemPromptTemplatesLoaded: false,
        systemPromptTemplatesLoading: false,
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

    function applyCreativePreferenceToPendingActions(preference = state.creativePreference) {
        const preset = String(preference?.preset || '').trim();
        if (!preset) return;
        const entry = creativePresetEntry(preset);
        const parameterProfile = creativeParameterProfileEntry(preference?.parameter_profile, preset);
        state.messages.forEach((message) => {
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

    function setCreativePreference(value, source = 'user') {
        const requested = Object.assign({}, state.creativePreference || {}, value || {});
        const selectedProfile = creativeParameterProfileEntry(requested.parameter_profile, requested.preset);
        if (selectedProfile) requested.preset = selectedProfile.preset;
        if (requested.parameter_profile && !selectedProfile) requested.parameter_profile = '';
        const next = normalizeCreativePreference(Object.assign({}, requested, {
            prompted: true,
            source,
            updated_at: new Date().toISOString()
        }));
        state.creativePreference = next;
        applyCreativePreferenceToPendingActions(next);
        state.persistenceDirty = true;
        saveConversationSnapshot();
        renderMessages();
        setStatus(localText(`Creative preference: ${creativePreferenceLabel(next)}`, `创作偏好：${creativePreferenceLabel(next)}`));
        return next;
    }

    function saveChatSettings() {
        try {
            window.localStorage?.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
                chatMode: state.chatMode,
                customSystemPrompt: state.customSystemPrompt,
                systemPromptTemplateId: state.systemPromptTemplateId,
                unloadAfterChat: !!state.unloadAfterChat,
                windowLayout: state.windowLayout || null
            }));
        } catch (err) {
            // Ignore storage failures in private or restricted browser contexts.
        }
    }

    function chatInputPlaceholder(mode) {
        const currentMode = normalizeChatMode(mode);
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

    function shouldSendCurrentPromptToVlm(mode, message) {
        return normalizeChatMode(mode) === 'prompt';
    }

    function chatModeHint(mode) {
        const normalized = normalizeChatMode(mode);
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

    function syncChatSettingsControls(modal) {
        if (!modal) return;
        const mode = modal.querySelector('[data-describe-vlm-chat-mode]');
        const system = modal.querySelector('[data-describe-vlm-chat-system]');
        const template = modal.querySelector('[data-describe-vlm-chat-template]');
        const input = modal.querySelector('[data-describe-vlm-chat-input]');
        const unload = modal.querySelector('[data-describe-vlm-chat-unload-after]');
        const autoImage = modal.querySelector('[data-describe-vlm-chat-auto-previous-image]');
        const modeHint = modal.querySelector('[data-describe-vlm-chat-mode-hint]');
        if (mode) mode.value = state.chatMode;
        if (system && system.value !== state.customSystemPrompt) system.value = state.customSystemPrompt;
        if (template) syncSystemPromptTemplateControls(modal);
        if (unload) unload.checked = !!state.unloadAfterChat;
        if (autoImage) autoImage.checked = !!state.autoAttachPreviousImage;
        if (modeHint) {
            const hint = chatModeHint(state.chatMode);
            modeHint.textContent = hint;
            modeHint.hidden = !hint;
        }
        if (input) input.setAttribute('placeholder', chatInputPlaceholder(state.chatMode));
        updateAnswerModelIndicator(modal);
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
                return Object.assign({}, data || {}, {
                    ok: false,
                    error: data?.error || `HTTP ${response.status}`,
                    details: data?.details || response.statusText || ''
                });
            }
            return data || { ok: false, error: 'empty response' };
        } catch (err) {
            if (err?.name === 'AbortError') {
                return { ok: false, aborted: true, error: 'aborted' };
            }
            return { ok: false, error: err?.message || String(err || 'request failed') };
        }
    }

    function normalizeSystemPromptTemplates(data) {
        const rows = Array.isArray(data?.templates) ? data.templates : [];
        return rows.map((item) => {
            const id = String(item?.id || item?.filename || item?.name || '').trim();
            const name = String(item?.name || item?.filename || id).trim();
            const content = String(item?.content || '').trim();
            if (!id || !name || !content) return null;
            return { id, name, filename: String(item?.filename || id), content };
        }).filter(Boolean);
    }

    function selectedSystemPromptTemplateIdForContent(content) {
        const text = String(content || '').trim();
        if (!text) return '';
        const match = state.systemPromptTemplates.find(item => String(item.content || '').trim() === text);
        return match?.id || '';
    }

    function renderSystemPromptTemplateOptions() {
        const selected = state.systemPromptTemplateId || selectedSystemPromptTemplateIdForContent(state.customSystemPrompt);
        const intro = state.systemPromptTemplatesLoading && !state.systemPromptTemplatesLoaded
            ? t('Loading templates...', '正在读取模板...')
            : t('Custom / no template', '自定义 / 不使用模板');
        const options = [`<option value="">${escapeHtml(intro)}</option>`];
        state.systemPromptTemplates.forEach((item) => {
            options.push(`<option value="${escapeHtml(item.id)}" ${item.id === selected ? 'selected' : ''}>${escapeHtml(item.name)}</option>`);
        });
        return options.join('');
    }

    function syncSystemPromptTemplateControls(modal) {
        const target = modal || document.getElementById('describe_vlm_chat_modal');
        if (!target) return;
        target.querySelectorAll('[data-describe-vlm-chat-template]').forEach((select) => {
            const activeId = state.systemPromptTemplateId || selectedSystemPromptTemplateIdForContent(state.customSystemPrompt);
            select.innerHTML = renderSystemPromptTemplateOptions();
            select.value = activeId;
            select.disabled = state.systemPromptTemplatesLoading && !state.systemPromptTemplatesLoaded;
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
        systemPromptTemplateRequest = postJson(SYSTEM_PROMPT_TEMPLATE_ENDPOINT, {})
            .then((data) => {
                state.systemPromptTemplates = normalizeSystemPromptTemplates(data);
                state.systemPromptTemplatesLoaded = true;
                state.systemPromptTemplatesLoading = false;
                syncSystemPromptTemplateControls(modal);
                return state.systemPromptTemplates;
            })
            .catch(() => {
                state.systemPromptTemplates = [];
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
        const id = String(templateId || '').trim();
        if (!id) {
            const target = modal || document.getElementById('describe_vlm_chat_modal');
            const textarea = target?.querySelector?.('[data-describe-vlm-chat-system]');
            const currentText = String(textarea?.value ?? state.customSystemPrompt ?? '').trim();
            const matchedTemplate = state.systemPromptTemplates.find(item => item.id === state.systemPromptTemplateId)
                || state.systemPromptTemplates.find(item => String(item.content || '').trim() === currentText);
            const shouldClearPrompt = !!matchedTemplate && String(matchedTemplate.content || '').trim() === currentText;
            state.systemPromptTemplateId = '';
            if (shouldClearPrompt) state.customSystemPrompt = '';
            if (textarea && shouldClearPrompt) textarea.value = '';
            saveChatSettings();
            syncSystemPromptTemplateControls(target);
            if (shouldClearPrompt) setStatus(t('System prompt template cleared.', '系统提示词模板已清除。'));
            return;
        }
        const template = state.systemPromptTemplates.find(item => item.id === id);
        if (!template) return;
        state.systemPromptTemplateId = template.id;
        state.customSystemPrompt = template.content;
        const target = modal || document.getElementById('describe_vlm_chat_modal');
        const textarea = target?.querySelector?.('[data-describe-vlm-chat-system]');
        if (textarea) textarea.value = state.customSystemPrompt;
        saveChatSettings();
        syncSystemPromptTemplateControls(target);
        setStatus(t('System prompt template loaded: {name}', '已载入系统提示词模板：{name}').replace('{name}', template.name));
    }

    function imageMimeFromDataUrl(dataUrl) {
        const match = String(dataUrl || '').match(/^data:([^;,]+)/);
        return match ? match[1] : 'image/png';
    }

    function mediaKind(value) {
        return /^video\//i.test(String(value?.mime || value?.type || '')) ? 'video' : 'image';
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
        const descriptor = describeInputMediaDescriptor();
        const key = String(descriptor?.key || '');
        if (!descriptor || !key || key === state.lastAutoReferencedDescribeMediaKey) return false;
        const payloadKey = `describe-input:${key}`;
        if (state.pendingImages.some((item) => String(item?.key || '') === payloadKey)) {
            state.lastAutoReferencedDescribeMediaKey = key;
            return true;
        }
        if (state.describeMediaReferencePromise?.key === key) return state.describeMediaReferencePromise.promise;
        const promise = (async () => {
            setStatus(localText('Referencing Describe input media...', '正在引用反推输入媒体...'));
            try {
                const payload = await payloadFromDescribeInputMedia(descriptor);
                if (!payload) return false;
                const currentKey = String(describeInputMediaDescriptor()?.key || '');
                if (currentKey !== key) return false;
                state.pendingImages = [payload, ...state.pendingImages.filter((item) => {
                    const itemKey = String(item?.key || '');
                    return itemKey !== payload.key && !itemKey.startsWith('describe-input:');
                })].slice(0, MAX_ATTACHMENTS);
                state.lastAutoReferencedDescribeMediaKey = key;
                renderPendingImages();
                const kindLabel = mediaKind(payload) === 'video'
                    ? localText('video', '视频')
                    : localText('image', '图片');
                setStatus(localText(
                    `Describe input ${kindLabel} referenced for the next message.`,
                    `已自动引用反推输入${kindLabel}，将在下一条消息中发送。`
                ));
                return true;
            } catch (err) {
                const tooLarge = String(err?.message || '').includes('too large');
                setStatus(tooLarge
                    ? localText('The Describe input video exceeds the 80 MB chat limit.', '反推输入视频超过 Chat 的 80 MB 限制。')
                    : localText('Could not reference the Describe input media.', '无法自动引用反推输入媒体。'), true);
                return false;
            } finally {
                if (state.describeMediaReferencePromise?.key === key) state.describeMediaReferencePromise = null;
            }
        })();
        state.describeMediaReferencePromise = { key, promise };
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

    function currentCustomVlmModelName() {
        return String(readComponentValue('describe_vlm_custom_model') || '').trim();
    }

    function customVlmModelOptionLabel() {
        return currentCustomVlmModelName() || 'Custom';
    }

    function customVlmModelLabelIsBetter(nextLabel, currentLabel) {
        const next = String(nextLabel || '').replace(/[✓✔⚠⬇↓]/g, '').trim();
        const current = String(currentLabel || '').replace(/[✓✔⚠⬇↓]/g, '').trim();
        return !!next && !/(^|\s)Custom($|\s)/i.test(next) && ((/^Custom$/i).test(current) || !current);
    }

    function customVlmOptionValue(rawValue, label) {
        const value = cleanVlmVersion(rawValue || label);
        if (value === 'Custom') return value;
        const customModel = currentCustomVlmModelName();
        const cleanLabel = String(label || rawValue || '').replace(/[✓✔⚠⬇↓]/g, '').trim();
        if (customModel && (cleanLabel === customModel || cleanLabel.endsWith(`· ${customModel}`))) return 'Custom';
        return value;
    }

    function addUniqueVlmModelOption(options, option) {
        const value = customVlmOptionValue(option?.value, option?.label);
        if (!value) return;
        const existing = options.find((item) => item.value === value);
        if (existing) {
            const label = String(option?.label || option?.value || value).trim() || value;
            if (value === 'Custom' && customVlmModelLabelIsBetter(label, existing.label)) existing.label = label;
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

    function registryVlmDropdownOptions() {
        const registry = window.SimpAICanvasWorkbenchRegistry || window.SimpAICanvasWorkbenchVlm || {};
        const choices = Array.isArray(registry.VLM_VERSION_CHOICES) && registry.VLM_VERSION_CHOICES.length
            ? registry.VLM_VERSION_CHOICES
            : DESCRIBE_VLM_MODEL_CHOICES;
        return choices.map((choice) => ({ value: cleanVlmVersion(choice), label: String(choice || '').trim() }))
            .filter((choice) => choice.value);
    }

    function describeVlmModelOptions() {
        const options = [];
        nativeVlmDropdownOptions('describe_vlm_model_dropdown').forEach((option) => addUniqueVlmModelOption(options, option));
        nativeVlmDropdownOptions('describe_vlm_model').forEach((option) => addUniqueVlmModelOption(options, option));
        registryVlmDropdownOptions().forEach((option) => addUniqueVlmModelOption(options, option));
        const current = cleanVlmVersion(readSelectedVlmVersion());
        if (current) addUniqueVlmModelOption(options, { value: current, label: current });
        addUniqueVlmModelOption(options, { value: 'Custom', label: customVlmModelOptionLabel() });
        return options;
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
        const version = cleanVlmVersion(selectedVersion || readSelectedVlmVersion());
        if (version && Array.from(select.options || []).some((option) => option.value === version) && select.value !== version) {
            select.value = version;
        }
    }

    function setDescribeVlmVersionFromHeader(rawValue) {
        const version = cleanVlmVersion(rawValue);
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

    function isVisible(element) {
        if (!element) return false;
        const style = window.getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden' && element.offsetParent !== null;
    }

    function readSelectedVlmVersion() {
        const raw = readComponentValue('describe_vlm_model_dropdown') || readComponentValue('describe_vlm_model');
        const version = cleanVlmVersion(raw);
        const customPanel = componentHost('describe_vlm_custom_panel');
        if (version === 'Custom' || isVisible(customPanel)) return 'Custom';
        const customModel = String(readComponentValue('describe_vlm_custom_model') || '').trim();
        if (customModel && version === customModel) return 'Custom';
        return version;
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
        if (cleanVlmVersion(version) !== 'Custom') return null;
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
        const cleanVersion = cleanVlmVersion(version);
        const customApi = readDescribeCustomApi(cleanVersion);
        const params = { version: cleanVersion };
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
        const cleanVersion = cleanVlmVersion(version);
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
            version: cleanVlmVersion(version),
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
        const { payload, customApi } = buildVlmModelStatusPayload(version);
        const response = await postJson('/canvas-workbench/vlm-model-status', payload);
        if (response?.ok && response.ready) {
            state.missingVlmModelRequest = null;
            return true;
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

    function currentAnswerModelLabel() {
        const version = cleanVlmVersion(readSelectedVlmVersion());
        if (version === 'Custom') {
            const apiName = readComponentValue('describe_vlm_custom_api_name').trim();
            const customModel = readComponentValue('describe_vlm_custom_model').trim();
            if (customModel) return `${apiName || 'Custom'} · ${customModel}`;
            return apiName || 'Custom';
        }
        return version || t('No model selected', '未选择模型');
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

    function setImportantStyle(el, name, value) {
        if (!el) return;
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
        ['transform', 'left', 'top', 'right', 'bottom', 'width', 'height', 'max-width', 'max-height']
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
        if (!panel || !layout) return false;
        const bounds = floatingResizeViewportBounds(margin);
        if (Number.isFinite(layout.width) && Number.isFinite(layout.height)) {
            applyFloatingPanelSize(panel, layout.width, layout.height, bounds, false);
        }
        if (layout.resized) panel.dataset.describeVlmChatResized = '1';

        const rect = panel.getBoundingClientRect();
        if (!rect.width || !rect.height) return false;
        if (Number.isFinite(layout.left) && Number.isFinite(layout.top)) {
            const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
            const left = clamp(layout.left, margin, Math.max(margin, window.innerWidth - margin - rect.width));
            const top = clamp(layout.top, margin, Math.max(margin, window.innerHeight - margin - rect.height));
            if (layout.moved) panel.dataset.describeVlmChatMoved = '1';
            setImportantStyle(panel, 'transform', 'none');
            setImportantStyle(panel, 'left', `${Math.round(left)}px`);
            setImportantStyle(panel, 'top', `${Math.round(top)}px`);
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
                ['transform', 'left', 'top', 'right', 'bottom', 'width', 'height', 'max-width', 'max-height']
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
            syncFloatingMaximizeControl(panel);
            return;
        }
        const leftCompactMode = clearCompactFloatingPanelLayout(panel);
        if (panel.dataset.describeVlmChatMaximized === '1') {
            applyMaximizedFloatingPanelLayout(panel);
        } else if (leftCompactMode) {
            applySavedFloatingPanelLayout(panel);
        } else if (panel.dataset.describeVlmChatMoved === '1' || panel.dataset.describeVlmChatResized === '1') {
            clampFloatingPanelSizeToViewport(panel);
            keepFloatingPanelInViewport(panel);
        }
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
      <button type="button" data-describe-vlm-chat-maximize title="${escapeHtml(t('Maximize window', '最大化窗口'))}" aria-label="${escapeHtml(t('Maximize window', '最大化窗口'))}" aria-pressed="false"><i class="fa-solid fa-maximize"></i></button>
      <button type="button" data-describe-vlm-chat-close title="${escapeHtml(t('Close', '关闭'))}" aria-label="${escapeHtml(t('Close', '关闭'))}"><i class="fa-solid fa-xmark"></i></button>
    </span>
  </div>
  <div class="describe-vlm-chat-controls">
    <label><span>${escapeHtml(t('Mode', '模式'))}</span><select data-describe-vlm-chat-mode aria-label="${escapeHtml(t('Chat Mode', '对话模式'))}">
      <option value="chat" ${state.chatMode === 'chat' ? 'selected' : ''}>${escapeHtml(t('Free Chat', '自由对话'))}</option>
      <option value="creative" ${state.chatMode === 'creative' ? 'selected' : ''}>${escapeHtml(localText('Creative', '创作模式'))}</option>
      <option value="guide" ${state.chatMode === 'guide' ? 'selected' : ''}>${escapeHtml(t('Guide Mode', '向导模式'))}</option>
      <option value="prompt" ${state.chatMode === 'prompt' ? 'selected' : ''}>${escapeHtml(t('Prompt Assistant', '提示词助手'))}</option>
      <option value="raw" ${state.chatMode === 'raw' ? 'selected' : ''}>${escapeHtml(t('Raw Model', '原始模型'))}</option>
    </select></label>
    <label class="describe-vlm-chat-template-field"><span>${escapeHtml(t('Template', '模板'))}</span><select data-describe-vlm-chat-template aria-label="${escapeHtml(t('System Prompt Template', '系统提示词模板'))}">${renderSystemPromptTemplateOptions()}</select></label>
    <label class="describe-vlm-chat-system-field"><span>${escapeHtml(t('System Prompt', '系统提示词'))}</span><textarea data-describe-vlm-chat-system rows="2" placeholder="${escapeHtml(t('Optional custom system prompt...', '可选自定义 system prompt...'))}">${escapeHtml(state.customSystemPrompt)}</textarea></label>
    <div class="describe-vlm-chat-mode-hint" data-describe-vlm-chat-mode-hint>${escapeHtml(chatModeHint(state.chatMode))}</div>
  </div>
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
      <label class="describe-vlm-chat-image-toggle" title="${escapeHtml(t('Automatically attach the most recent image in this chat. A manually referenced image takes priority.', '发送时自动附带对话中最近的一张图片。手动引用的图片优先。'))}"><input type="checkbox" data-describe-vlm-chat-auto-previous-image checked><span>${escapeHtml(t('Attach previous chat image', '附带上一张对话图片'))}</span></label>
      <label class="describe-vlm-chat-unload-toggle" title="${escapeHtml(t('Unload the local VLM/LLM model after each reply.', '每次回复后卸载本地 VLM/LLM 模型。'))}"><input type="checkbox" data-describe-vlm-chat-unload-after><span>${escapeHtml(t('Unload after reply', '回复后卸载模型'))}</span></label>
      <button type="button" data-describe-vlm-chat-pick-image title="${escapeHtml(t('Attach reference image', '添加引用图片'))}" aria-label="${escapeHtml(t('Attach reference image', '添加引用图片'))}"><i class="fa-solid fa-image"></i></button>
    </div>
    <div class="describe-vlm-chat-attachments" data-describe-vlm-chat-attachments hidden></div>
    <textarea data-describe-vlm-chat-input rows="2" placeholder="${escapeHtml(chatInputPlaceholder(state.chatMode))}"></textarea>
    <button type="button" data-describe-vlm-chat-stop title="${escapeHtml(t('Stop reply', '停止回答'))}" aria-label="${escapeHtml(t('Stop reply', '停止回答'))}" hidden><i class="fa-solid fa-stop"></i></button>
    <button type="button" data-describe-vlm-chat-send title="${escapeHtml(t('Send', '发送'))}" aria-label="${escapeHtml(t('Send', '发送'))}"><i class="fa-solid fa-paper-plane"></i></button>
    <input type="file" accept="image/*" multiple data-describe-vlm-chat-file hidden>
    <input type="file" accept="image/*" multiple data-describe-vlm-chat-generation-file hidden>
    <input type="file" accept="application/json,.json" data-describe-vlm-chat-conversation-file hidden>
  </div>
  <button type="button" class="describe-vlm-chat-resize-handle simpleai-popup-resize-handle" data-describe-vlm-chat-resize title="${escapeHtml(t('Resize window', '调整窗口大小'))}" aria-label="${escapeHtml(t('Resize window', '调整窗口大小'))}"></button>
</div>`;
        installDescribeFloatingLayer(modal);
        syncChatSettingsControls(modal);
        syncBusyControls(modal);
        renderMessages();
        renderPendingImages();
        ensureSystemPromptTemplates(modal).catch(() => {});
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
        modal.hidden = false;
        autoReferenceDescribeInputMedia().catch(() => {});
        installDescribeFloatingLayer(modal);
        document.documentElement.classList.add('describe-vlm-chat-open');
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
            if (applySavedFloatingPanelLayout(panel)) return;
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
        const hasEmbeddedImage = /^data:image\/[a-z0-9.+-]+;base64,/i.test(dataUrl)
            && dataUrl.length <= MAX_RUNTIME_IMAGE_DATA_URL_LENGTH;
        if (includeEmbedded && hasEmbeddedImage) {
            clean.data_url = dataUrl;
            if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(thumb) && thumb.length <= MAX_RUNTIME_IMAGE_THUMB_LENGTH) {
                clean.thumb = thumb;
            }
        }
        const hasDurableLocator = Boolean(clean.path || clean.output_path || clean.asset_relative_path || clean.relative_path || clean.preview_url);
        if (!includeEmbedded && hasEmbeddedImage && !hasDurableLocator) return null;
        return clean.asset_id || hasDurableLocator || clean.data_url ? clean : null;
    }

    function normalizeCreativeMediaInput(input, index = 0, options = {}) {
        if (!input || typeof input !== 'object') return null;
        const asset = normalizeCreativeAsset(input.asset, options);
        const ref = String(input.ref || '').trim().slice(0, 160);
        if (!ref || !asset || !String(asset.mime || '').toLowerCase().startsWith('image/')) return null;
        return {
            ref,
            role: index === 0 ? 'base_image' : `reference_image_${index}`,
            name: String(input.name || asset.name || `Image ${index + 1}`).trim().slice(0, 200),
            type: 'image',
            asset
        };
    }

    function normalizeCreativeGeneration(generation) {
        if (!generation || typeof generation !== 'object') return null;
        let generationState = String(generation.state || 'awaiting_confirmation').trim().toLowerCase().slice(0, 80);
        const runId = String(generation.run_id || '').trim().slice(0, 240);
        if (CREATIVE_ACTIVE_STATES.has(generationState) && !runId) generationState = 'awaiting_confirmation';
        const result = {
            state: generationState || 'awaiting_confirmation',
            run_id: runId,
            percent: Math.max(0, Math.min(1, Number(generation.percent) || 0)),
            message: String(generation.message || '').slice(0, 1000),
            error: String(generation.error || '').slice(0, 1000),
            missing_count: Math.max(0, Number(generation.missing_count) || 0),
            preview_serial: Math.max(0, Number(generation.preview_serial) || 0),
            submission_uncertain: !!generation.submission_uncertain,
            started_at: String(generation.started_at || '').slice(0, 80),
            finished_at: String(generation.finished_at || '').slice(0, 80),
            assets: Array.isArray(generation.assets)
                ? generation.assets.slice(0, 16).map(normalizeCreativeAsset).filter(Boolean)
                : []
        };
        return result;
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
            task: CREATIVE_IMAGE_TASKS.has(task) ? task : 'text_to_image',
            requested_task: String(action.requested_task || action.task_request?.task || '').trim().slice(0, 80),
            media_inputs: persistedMediaInputs,
            prompt,
            preset: String(action.preset || (action.execution_plan?.status === 'no_compatible_route' ? '' : CREATIVE_DEFAULT_PRESET)).slice(0, 200),
            preset_source: ['agent_auto', 'session_preference', 'user'].includes(String(action.preset_source || ''))
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
            ui_collapsed: !!action.ui_collapsed,
            generation: persistedGeneration
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
            ? message.media_assets.slice(0, MAX_ATTACHMENTS).map((input, index) => normalizeCreativeMediaInput(
                input,
                index,
                { includeEmbedded: false }
            )).filter(Boolean)
            : [];
        if (!content && !images.length && !actions.length && !mediaAssets.length) return null;
        return { id, role, content, actions, images, media_assets: mediaAssets, image_count: Math.max(0, Number(message.image_count) || images.length || mediaAssets.length) };
    }

    function normalizePersistedMessages(messages) {
        const source = (Array.isArray(messages) ? messages : []).filter((message) => !message?.pending).slice(-MAX_PERSISTED_MESSAGES);
        const thumbBudget = { remaining: MAX_PERSISTED_THUMB_TOTAL };
        const normalized = [];
        for (let index = source.length - 1; index >= 0; index -= 1) {
            normalized.unshift(normalizePersistedMessage(source[index], { thumbBudget }));
        }
        return normalized.filter(Boolean);
    }

    function conversationPayload() {
        return {
            schema: CONVERSATION_SCHEMA,
            version: CONVERSATION_VERSION,
            saved_at: new Date().toISOString(),
            conversation_id: String(state.conversationId || ''),
            messages: normalizePersistedMessages(state.messages),
            chatMode: normalizeChatMode(state.chatMode),
            customSystemPrompt: String(state.customSystemPrompt || '').slice(0, MAX_PERSISTED_TEXT),
            systemPromptTemplateId: String(state.systemPromptTemplateId || '').slice(0, 200),
            auto_attach_previous_image: !!state.autoAttachPreviousImage,
            creative_preferences: normalizeCreativePreference(state.creativePreference),
            creative_initiative: normalizeCreativeInitiative(state.creativeInitiative)
        };
    }

    function normalizeConversationPayload(data) {
        if (!data || typeof data !== 'object' || data.schema !== CONVERSATION_SCHEMA || Number(data.version) !== CONVERSATION_VERSION || !Array.isArray(data.messages)) return null;
        return {
            conversationId: uid('describe_vlm_chat_import'),
            messages: normalizePersistedMessages(data.messages),
            chatMode: normalizeChatMode(data.chatMode),
            customSystemPrompt: String(data.customSystemPrompt || '').slice(0, MAX_PERSISTED_TEXT),
            systemPromptTemplateId: String(data.systemPromptTemplateId || '').slice(0, 200),
            autoAttachPreviousImage: data.auto_attach_previous_image !== false,
            creativePreference: normalizeCreativePreference(data.creative_preferences),
            creativeInitiative: normalizeCreativeInitiative(data.creative_initiative)
        };
    }

    function saveConversationSnapshot() {
        try {
            const serialized = JSON.stringify(conversationPayload());
            if (serialized.length > 900000) return;
            window.localStorage?.setItem(CONVERSATION_STORAGE_KEY, serialized);
            state.persistenceDirty = false;
        } catch (err) {}
    }

    function restoreConversationSnapshot() {
        if (state.persistenceRestored || state.messages.length || state.persistenceDirty) return;
        state.persistenceRestored = true;
        try {
            const data = JSON.parse(window.localStorage?.getItem(CONVERSATION_STORAGE_KEY) || 'null');
            const restored = normalizeConversationPayload(data);
            if (!restored) return;
            state.conversationId = restored.conversationId;
            state.messages = restored.messages;
            state.chatMode = restored.chatMode;
            state.customSystemPrompt = restored.customSystemPrompt;
            state.systemPromptTemplateId = restored.systemPromptTemplateId;
            state.autoAttachPreviousImage = restored.autoAttachPreviousImage;
            state.creativePreference = restored.creativePreference;
            state.creativePreferenceExpanded = normalizeChatMode(restored.chatMode) === 'creative' && !restored.creativePreference.prompted;
            state.creativeInitiative = restored.creativeInitiative;
            applyCreativePreferenceToPendingActions(restored.creativePreference);
            saveChatSettings();
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
                const restored = normalizeConversationPayload(JSON.parse(String(reader.result || '')));
                if (!restored) throw new Error('invalid conversation');
                activeCreativeRunIds().forEach((runId) => creativeCanvasApi()?.controlRun?.(runId, 'stop', {
                    user_context: creativeUserContext()
                }).catch(() => {}));
                stopCreativePolls();
                state.requestToken += 1;
                abortActiveChatRequest();
                abortCreativeDirectorRequest(true);
                state.busy = false;
                Object.assign(state, restored);
                state.creativePreferenceExpanded = normalizeChatMode(restored.chatMode) === 'creative' && !restored.creativePreference.prompted;
                applyCreativePreferenceToPendingActions(restored.creativePreference);
                state.pendingImages = [];
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
        modal.hidden = true;
        document.documentElement.classList.remove('describe-vlm-chat-open');
    }

    async function clearConversation() {
        const previousConversationId = state.conversationId;
        const previousRequestId = state.activeRequestId;
        const creativeRunIds = activeCreativeRunIds();
        state.requestToken += 1;
        state.busy = false;
        abortActiveChatRequest();
        abortCreativeDirectorRequest(true);
        stopCreativePolls();
        creativeRunIds.forEach((runId) => creativeCanvasApi()?.controlRun?.(runId, 'stop', {
            user_context: creativeUserContext()
        }).catch(() => {}));
        state.messages = [];
        state.creativePreference = normalizeCreativePreference(null);
        state.creativePreferenceExpanded = normalizeChatMode(state.chatMode) === 'creative';
        state.creativeInitiative = normalizeCreativeInitiative(null);
        state.conversationId = uid('describe_vlm_chat');
        state.persistenceRestored = true;
        state.persistenceDirty = false;
        try { window.localStorage?.removeItem(CONVERSATION_STORAGE_KEY); } catch (err) {}
        setStatus('');
        syncBusyControls(document.getElementById('describe_vlm_chat_modal'));
        renderMessages();
        notifyBackendChatCancel(previousConversationId, previousRequestId).catch(() => {});
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

    function abortActiveChatRequest() {
        const controller = state.activeAbortController;
        state.activeAbortController = null;
        state.activeRequestId = '';
        try {
            controller?.abort?.();
        } catch (err) {}
    }

    function replacePendingAssistant(content) {
        const pendingIndex = state.messages.findIndex((item) => item.pending);
        if (pendingIndex < 0) return false;
        const assistant = { role: 'assistant', content };
        state.messages[pendingIndex] = assistant;
        return true;
    }

    function abortCreativeDirectorRequest(notifyBackend = false) {
        const controller = state.creativeDirectorAbortController;
        const requestId = state.creativeDirectorRequestId;
        state.creativeDirectorAbortController = null;
        state.creativeDirectorRequestId = '';
        state.creativeDirectorBusy = false;
        try {
            controller?.abort?.();
        } catch (err) {}
        if (notifyBackend && requestId) {
            notifyBackendChatCancel(state.conversationId, requestId).catch(() => {});
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
        if (!conversationId && !requestId) return;
        await postJson('/describe-image/vlm-chat-cancel', {
            conversation_id: conversationId || '',
            request_id: requestId || ''
        });
    }

    async function stopCurrentChatReply(options = {}) {
        if (!state.busy && !state.activeAbortController && !state.activeRequestId) return false;
        const conversationId = state.conversationId;
        const requestId = state.activeRequestId;
        state.requestToken += 1;
        state.busy = false;
        abortActiveChatRequest();
        if (!options?.silent) {
            replacePendingAssistant(t('Stopped.', '已停止。'));
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

    function consumeSentComposerState(input, inputSnapshot, sentPendingImages) {
        if (input && String(input.value || '') === inputSnapshot) input.value = '';
        const sentObjects = new Set(Array.isArray(sentPendingImages) ? sentPendingImages : []);
        const sentIds = new Set(Array.from(sentObjects).map(image => String(image?.id || '')).filter(Boolean));
        state.pendingImages = state.pendingImages.filter((image) => {
            if (sentObjects.has(image)) return false;
            const id = String(image?.id || '');
            return !id || !sentIds.has(id);
        });
        renderPendingImages();
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

    function renderMessageImages(images) {
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
                const preview = String(image?.preview_url || '').trim();
                return preview
                    ? `<video src="${escapeHtml(preview)}" aria-label="${escapeHtml(label)}" controls preload="metadata" playsinline></video>`
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
        state.conversationId = uid('describe_vlm_chat');
        if (previousConversationId) {
            postJson('/describe-image/vlm-chat-clear', {
                conversation_id: previousConversationId,
                clear_context: true
            }).catch(() => {});
        }
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
            if (!image || mediaKind(image) !== 'image' || !image.data_url) return;
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
        const normalized = normalizeCreativeMediaInput(input, index);
        const asset = normalized?.asset;
        const source = persistedMediaAssetSource(asset);
        if (!asset || !source) return null;
        if (source.startsWith('data:image/')) {
            return imagePayloadFromDataUrl(source, {
                id: uid('describe_message_ref'),
                name: normalized.name || asset.name || `message-image-${index + 1}.png`,
                mime: asset.mime || imageMimeFromDataUrl(source),
                width: asset.width,
                height: asset.height,
                key: `message-media:${asset.asset_id || normalized.ref || index}`
            });
        }
        const response = await fetch(source, { credentials: 'same-origin' });
        if (!response.ok) throw new Error(`image fetch failed: ${response.status}`);
        const blob = await response.blob();
        const mime = String(blob.type || asset.mime || 'image/png').toLowerCase();
        if (!mime.startsWith('image/')) return null;
        const dataUrl = await blobToDataUrl(blob);
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
            .filter((image) => mediaKind(image) === 'image' && image?.data_url)
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
        const message = state.messages[index];
        if (message?.pending || state.busy || activeCreativeRunIds(state.messages.slice(index)).length) {
            setStatus(t('Wait for the active response before editing context.', '请等待当前回复结束后再编辑上下文。'), true);
            return;
        }
        const draft = composerTextForMessage(message);
        const restoredImages = await messageImagePayloadsForComposer(message);
        if (state.messages[index] !== message || state.busy || activeCreativeRunIds(state.messages.slice(index)).length) {
            setStatus(t('The conversation changed while restoring this message.', '恢复消息期间对话已发生变化。'), true);
            return;
        }
        state.messages = state.messages.slice(0, index).filter((item) => !item?.pending);
        state.pendingImages = restoredImages.slice(0, MAX_ATTACHMENTS);
        resetConversationAfterContextEdit();
        setStatus(restoredImages.length
            ? t('Message and images moved back to input.', '消息和图片已回到输入框。')
            : t('Message moved back to input.', '消息已回到输入框。'));
        renderMessages();
        renderPendingImages();
        saveConversationSnapshot();
        setChatInputValue(draft, true);
    }

    function deleteChatMessage(messageIndex) {
        const index = Number(messageIndex);
        if (!Number.isInteger(index) || index < 0 || index >= state.messages.length) return;
        if (state.messages[index]?.pending || state.busy || activeCreativeRunIds(state.messages.slice(index)).length) {
            setStatus(t('Wait for the active response before editing context.', '请等待当前回复结束后再编辑上下文。'), true);
            return;
        }
        state.messages.splice(index, 1);
        resetConversationAfterContextEdit();
        setStatus(t('Message deleted from context.', '消息已从上下文删除。'));
        renderMessages();
        saveConversationSnapshot();
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

    function normalizeCreativePresetEntries(entries) {
        const seen = new Set();
        const rows = [];
        (Array.isArray(entries) ? entries : []).forEach((entry) => {
            if (!entry || typeof entry !== 'object') return;
            const name = String(entry.name || entry.display_name || '').trim().replace(/\.json$/i, '');
            const engineType = String(entry.engine_type || entry.default_engine?.engine_type || 'image').trim().toLowerCase();
            if (!name || seen.has(name.toLowerCase()) || ['video', 'audio'].includes(engineType)) return;
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
        if (!CREATIVE_IMAGE_TASKS.has(normalized)) {
            return inputCount > 1 ? 'multi_image_edit' : inputCount === 1 ? 'image_edit' : 'text_to_image';
        }
        if (normalized === 'text_to_image' && inputCount > 0) return inputCount > 1 ? 'multi_image_edit' : 'image_edit';
        if (normalized === 'image_edit' && inputCount > 1) return 'multi_image_edit';
        if (normalized === 'multi_image_edit' && inputCount === 1 && !stableRequest) return 'image_edit';
        return normalized;
    }

    function creativePresetSupportedTasks(entry) {
        const declared = Array.isArray(entry?.media_capability?.supported_tasks)
            ? entry.media_capability.supported_tasks.map((task) => {
                const taskKey = String(task || '').trim().toLowerCase().replace(/[- ]/g, '_');
                return CREATIVE_TASK_ALIASES[taskKey] || taskKey;
            })
            : [];
        if (declared.length) return [...new Set(declared.filter((task) => CREATIVE_IMAGE_TASKS.has(task)))];
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
        if (maxImages > 0 && editMarkers.some((marker) => descriptor.includes(marker))) {
            return maxImages > 1 ? ['image_edit', 'multi_image_edit'] : ['image_edit'];
        }
        return ['text_to_image'];
    }

    function creativePresetSupportsTask(entry, task, inputCount = 0) {
        if (!entry || !creativePresetSupportedTasks(entry).includes(task)) return false;
        const count = Math.max(0, Math.round(Number(inputCount) || 0));
        if (task === 'text_to_image') return count === 0;
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
            }).filter((task) => CREATIVE_IMAGE_TASKS.has(task)))];
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
        const parameterOverrides = task === 'image_outpaint' && creativePresetSupportsOutpaintDirections(entry)
            ? creativeOutpaintParameterOverrides(action)
            : {};
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
            parameter_overrides: Object.fromEntries(Object.entries(
                plan.parameter_overrides && typeof plan.parameter_overrides === 'object' ? plan.parameter_overrides : {}
            ).filter(([key]) => ['scene_var_number7', 'scene_var_number8', 'scene_var_number9', 'scene_var_number10'].includes(key)).map(([key, value]) => [
                key,
                Math.max(0, Math.min(100, Math.round(Number(value) || 0)))
            ]))
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
            image_upscale: ['Z-TTP', 'Wan-TTP'],
            image_restore: ['Imagerepair+'],
            image_detail_enhance: ['Z-imageT', 'Anima', 'Flux2-Klein', 'Qwen2512', 'Wan(T2I)', 'Flux1-dev', 'NunFlux_fp4', 'NunFlux_int4', 'Illustrious(OB)', 'Illustrious(MiaoKa)', 'ChenkinXL', 'SD1.5'],
            image_background_removal: ['Removebg'],
            image_object_removal: ['Flux2-KleinEdit', 'Krea2-ImageEdit', 'Eraser'],
            image_object_transfer: ['QwenEdit+', 'NunQwenEdit+_fp4', 'NunQwenEdit+_int4', 'Flux2-KleinEdit', 'Krea2-ImageEdit', 'Bernini-ImageEdit', 'OneKeyKontext', 'Swap+', 'NunSwap_fp4', 'NunSwap_int4'],
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
        const priorities = (taskPriorities[task] || ['Flux2-KleinEdit', 'Krea2-ImageEdit', 'QwenEdit+', 'NunQwenEdit+_fp4', 'NunQwenEdit+_int4', 'Bernini-ImageEdit']).slice();
        if (task === 'text_to_image') priorities.splice(0, priorities.length, CREATIVE_DEFAULT_PRESET, 'Anima');
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
            return {
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
        }).filter((item) => item.name);
    }

    function creativePresetForStyle(style) {
        if (style !== 'anime') return style === 'realistic' ? CREATIVE_DEFAULT_PRESET : '';
        const entries = state.creativePresetCatalog;
        const exact = entries.find((entry) => ['anima动漫', 'anima'].includes(String(entry.name || '').toLowerCase()));
        const related = entries.find((entry) => /(^|[^a-z0-9])anima([^a-z0-9]|$)/i.test(String(entry.name || '')));
        return String(exact?.name || related?.name || 'Anima');
    }

    function creativeParameterProfileOptions(preset, selected = '') {
        const wantedPreset = String(preset || '').trim().toLowerCase();
        const selectedName = String(selected || '').trim();
        const rows = state.creativeParameterProfiles.filter((item) => String(item.preset || '').toLowerCase() === wantedPreset);
        const options = [
            `<option value="">${escapeHtml(localText('Preset defaults', '使用 Preset 默认参数'))}</option>`,
            ...rows.map((item) => `<option value="${escapeHtml(item.name)}" ${item.name === selectedName ? 'selected' : ''}>${escapeHtml(item.name)}</option>`)
        ];
        if (selectedName && !rows.some((item) => item.name === selectedName)) {
            options.push(`<option value="${escapeHtml(selectedName)}" selected disabled>${escapeHtml(`${selectedName} ${localText('(unavailable)', '（不可用）')}`)}</option>`);
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
        if (!action.requested_task && CREATIVE_IMAGE_TASKS.has(requestedTask)) action.requested_task = requestedTask;
        action.task = creativeActionTask(action, action.media_inputs.length);
        const noCompatibleRoute = action.execution_plan?.status === 'no_compatible_route';
        action.preset = String(action.preset || (noCompatibleRoute ? '' : CREATIVE_DEFAULT_PRESET)).trim();
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

    function prepareAssistantActions(actions, mode, inputMediaAssets = []) {
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
                    }, 'explicit_user_message');
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
        const selected = String(action?.preset || (noCompatibleRoute ? '' : CREATIVE_DEFAULT_PRESET));
        const inputCount = Array.isArray(action?.media_inputs) ? action.media_inputs.length : 0;
        const task = creativeActionTask(action, inputCount);
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
        if (!available && !selected) return '';
        return `<label><span>${escapeHtml(localText('Parameter profile', '参数预设'))}</span><select data-describe-vlm-chat-generation-parameter-profile="${escapeHtml(actionRef)}" ${disabled}>${creativeParameterProfileOptions(preset, selected)}</select></label>`;
    }

    function creativeAssetUrl(value) {
        const url = String(value || '').trim();
        if (!url) return '';
        if (url.startsWith('/file=')) return `/gradio_api/file=${url.slice('/file='.length)}`;
        if (url.startsWith('/gradio_api/file=') || url.startsWith('data:image/') || url.startsWith('blob:')) return url;
        return '';
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
        if (current === 'failed') return String(generation?.error || generation?.message || localText('Generation failed.', '生成失败。'));
        return localText('Ready', '等待确认');
    }

    function creativeTaskLabel(task) {
        const labels = {
            text_to_image: ['Image generation', '生图'],
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
        const source = creativeAssetUrl(asset?.preview_url);
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

    function latestConversationImageCandidate() {
        for (let messageIndex = state.messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
            const message = state.messages[messageIndex];
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
                const assets = (Array.isArray(action.generation?.assets) ? action.generation.assets : []).map(normalizeCreativeAsset).filter(Boolean);
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

    async function previousConversationImagePayload() {
        const candidate = latestConversationImageCandidate();
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
        const presetName = String(action?.preset || CREATIVE_DEFAULT_PRESET).trim() || CREATIVE_DEFAULT_PRESET;
        const presetLabel = action?.preset_source === 'agent_auto'
            ? localText('Agent Preset', 'Agent 使用的 Preset')
            : 'Preset';
        return `<div class="describe-vlm-chat-generated-result" data-describe-vlm-chat-generation-ref="${escapeHtml(actionRef)}"><div class="describe-vlm-chat-generated-meta" title="${escapeHtml(`${presetLabel}: ${presetName}`)}"><i class="fa-solid fa-wand-magic-sparkles"></i><span>${escapeHtml(presetLabel)}</span><b>${escapeHtml(presetName)}</b></div>${assets.map((asset, index) => {
            const src = creativeAssetUrl(asset.preview_url);
            if (!src) return '';
            const resultLabel = localText(`Generated image ${index + 1}`, `生成图片 ${index + 1}`);
            const imageKey = creativeResultImageKey(asset, src);
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
        const source = creativeAssetUrl(asset?.preview_url);
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

    function renderCreativeGenerationAction(action, actionRef) {
        const generation = creativeGenerationForAction(action);
        const currentState = String(generation.state || 'awaiting_confirmation').toLowerCase();
        const active = CREATIVE_ACTIVE_STATES.has(currentState);
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
        const planBlocked = ['needs_media', 'needs_mask', 'needs_interaction', 'no_compatible_route', 'parameter_profile_missing', 'parameter_profile_incompatible'].includes(currentState);
        const canSubmit = !active && !planBlocked;
        const submitLabel = ['finished', 'failed', 'canceled', 'skipped'].includes(currentState)
            ? localText('Generate again', '再次生成')
            : ['models_missing', 'preset_missing'].includes(currentState)
                ? localText('Check again', '重新检查')
                : localText('Generate', '确认生成');
        const submitTitle = localText('Submit image generation', '提交生图任务');
        const stopTitle = localText('Stop generation', '停止生成');
        const disabled = active ? 'disabled' : '';
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
        const themeControl = creativeThemeControl(action, actionRef, disabled);
        const parameterProfileControl = creativeParameterProfileControl(action, actionRef, disabled);
        return `<div class="describe-vlm-chat-action-card describe-vlm-chat-generation${collapsed ? ' is-collapsed' : ''}" data-describe-vlm-chat-generation-ref="${escapeHtml(actionRef)}">
  <div class="describe-vlm-chat-generation-title"><i class="fa-solid ${offered ? 'fa-clapperboard' : 'fa-wand-magic-sparkles'}"></i><span>${escapeHtml(cardTitle)}</span>${headerStatus ? `<b>${escapeHtml(headerStatus)}</b>` : ''}${offered && !active ? `<button type="button" data-describe-vlm-chat-offer-dismiss="${escapeHtml(actionRef)}" title="${escapeHtml(localText('Dismiss this suggestion', '忽略这次提议'))}" aria-label="${escapeHtml(localText('Dismiss this suggestion', '忽略这次提议'))}"><i class="fa-solid fa-xmark"></i></button>` : ''}<button type="button" data-describe-vlm-chat-generation-collapse="${escapeHtml(actionRef)}" title="${escapeHtml(collapseTitle)}" aria-label="${escapeHtml(collapseTitle)}" aria-expanded="${collapsed ? 'false' : 'true'}"><i class="fa-solid ${collapsed ? 'fa-chevron-down' : 'fa-chevron-up'}"></i></button></div>
  <div class="describe-vlm-chat-generation-body" ${collapsed ? 'hidden' : ''}>
  ${offerNote}
  ${renderCreativeMediaInputs(action, actionRef, disabled)}
  ${renderCreativeOutpaintOptions(action, actionRef, disabled)}
  <label class="describe-vlm-chat-generation-prompt"><span>${escapeHtml(localText('Prompt', '提示词'))}</span><textarea rows="4" data-describe-vlm-chat-generation-prompt="${escapeHtml(actionRef)}" ${disabled}>${escapeHtml(prompt)}</textarea></label>
  <div class="describe-vlm-chat-generation-options${themeControl ? ' has-theme' : ''}">
    <label><span>${escapeHtml(presetLabel)}</span><select data-describe-vlm-chat-generation-preset="${escapeHtml(actionRef)}" ${disabled}>${creativePresetOptions(action)}</select></label>
    ${themeControl}
    ${parameterProfileControl}
    <label><span>${escapeHtml(localText('Aspect', '比例'))}</span><select data-describe-vlm-chat-generation-aspect="${escapeHtml(actionRef)}" ${disabled}>${creativeAspectOptions().map((item) => `<option value="${escapeHtml(item.key)}" ${String(item.key) === action.aspect_ratio ? 'selected' : ''}>${escapeHtml(item.key === 'auto' ? localText('Auto', '自适应') : item.key)}</option>`).join('')}</select></label>
    <label><span>${escapeHtml(localText('Images', '数量'))}</span><select data-describe-vlm-chat-generation-count="${escapeHtml(actionRef)}" ${disabled}>${[1, 2, 3, 4].map((count) => `<option value="${count}" ${count === action.image_number ? 'selected' : ''}>${count}</option>`).join('')}</select></label>
  </div>
  ${previewHtml}
  <div class="describe-vlm-chat-generation-status is-${escapeHtml(currentState)}" aria-live="polite"><span>${escapeHtml(creativeStateLabel(generation))}</span>${active && progress ? `<progress max="100" value="${progress}"></progress><b>${progress}%</b>` : ''}${statusDetail && !['awaiting_confirmation', 'finished', 'failed', 'models_missing'].includes(currentState) ? `<small>${escapeHtml(statusDetail)}</small>` : ''}</div>
  <div class="describe-vlm-chat-action-buttons">
    ${canSubmit ? `<button type="button" data-describe-vlm-chat-generation-run="${escapeHtml(actionRef)}" title="${escapeHtml(submitTitle)}" aria-label="${escapeHtml(submitTitle)}"><i class="fa-solid fa-wand-magic-sparkles"></i><span>${escapeHtml(submitLabel)}</span></button>` : ''}
    ${active && generation.run_id ? `<button type="button" class="is-danger" data-describe-vlm-chat-generation-stop="${escapeHtml(actionRef)}" title="${escapeHtml(stopTitle)}" aria-label="${escapeHtml(stopTitle)}"><i class="fa-solid fa-stop"></i><span>${escapeHtml(localText('Stop', '停止'))}</span></button>` : ''}
    <button type="button" data-describe-vlm-chat-copy="${escapeHtml(actionRef)}" title="${escapeHtml(localText('Copy prompt', '复制提示词'))}" aria-label="${escapeHtml(localText('Copy prompt', '复制提示词'))}"><i class="fa-solid fa-copy"></i></button>
  </div>
  </div>
</div>`;
    }

    function creativeActionFromRef(ref) {
        const [messageIndex, actionIndex] = String(ref || '').split(':').map((part) => Number(part));
        const message = state.messages[messageIndex];
        const action = message?.actions?.[actionIndex];
        return ['generate_image', 'offer_image'].includes(action?.type) ? { message, action, messageIndex, actionIndex } : null;
    }

    function syncCreativeActionFromDom(ref) {
        const found = creativeActionFromRef(ref);
        if (!found) return null;
        const cards = Array.from(document.querySelectorAll('[data-describe-vlm-chat-generation-ref]'));
        const card = cards.find((item) => item.getAttribute('data-describe-vlm-chat-generation-ref') === String(ref));
        if (!card) return found;
        found.action.prompt = String(card.querySelector('[data-describe-vlm-chat-generation-prompt]')?.value || found.action.prompt || '').trim();
        found.action.preset = String(card.querySelector('[data-describe-vlm-chat-generation-preset]')?.value || found.action.preset || CREATIVE_DEFAULT_PRESET);
        found.action.parameter_profile = String(card.querySelector('[data-describe-vlm-chat-generation-parameter-profile]')?.value || '');
        const selectedTheme = String(card.querySelector('[data-describe-vlm-chat-generation-theme]')?.value || '').trim();
        if (selectedTheme) {
            found.action.execution_plan = Object.assign({}, found.action.execution_plan || {}, {
                preset: found.action.preset,
                theme: selectedTheme
            });
        }
        found.action.aspect_ratio = String(card.querySelector('[data-describe-vlm-chat-generation-aspect]')?.value || found.action.aspect_ratio || 'auto');
        found.action.image_number = Math.max(1, Math.min(4, Math.round(Number(card.querySelector('[data-describe-vlm-chat-generation-count]')?.value || found.action.image_number || 1))));
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

        const required = creativeRequiredImageCount(entry, found.action.task);
        const remaining = Math.max(0, required - found.action.media_inputs.length);
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

    function persistCreativeAction(render = true, renderOptions = {}) {
        state.persistenceDirty = true;
        saveConversationSnapshot();
        if (render) renderMessages(renderOptions);
    }

    function applyCreativeRunResponse(ref, response) {
        const found = creativeActionFromRef(ref);
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
        persistCreativeAction(true, CREATIVE_TERMINAL_STATES.has(responseState) ? {} : { anchorGenerationRef: ref });
        if (!wasFinished && responseState === 'finished' && generation.assets.length) {
            setStatus(state.autoAttachPreviousImage
                ? localText(
                    'Image generated. Your next message will include the latest result image.',
                    '图片已生成。下一条消息会自动附带最新结果图。'
                )
                : localText(
                    'Image generated. To discuss it with the Agent, reference the image before sending your next message.',
                    '图片已生成。需要 Agent 继续看图交流时，请点击图片上的“引用图片”，再发送消息。'
                ));
        }
        return generation;
    }

    function scheduleCreativeGenerationPoll(ref, runId, delay = CREATIVE_POLL_INTERVAL_MS) {
        const id = String(runId || '');
        if (!id || state.creativeGenerationPolls.has(id)) return;
        const timer = window.setTimeout(async () => {
            state.creativeGenerationPolls.delete(id);
            const found = creativeActionFromRef(ref);
            if (!found || String(found.action.generation?.run_id || '') !== id) return;
            const api = creativeCanvasApi();
            if (!api || typeof api.pollRun !== 'function') {
                found.action.generation.state = 'failed';
                found.action.generation.error = localText('Canvas generation API is unavailable.', 'Canvas 生图接口不可用。');
                persistCreativeAction(true);
                return;
            }
            const response = await api.pollRun(id, {
                after_preview_serial: Number(found.action.generation?.preview_serial) || 0,
                user_context: creativeUserContext()
            });
            const live = creativeActionFromRef(ref);
            if (!live || live.action !== found.action || String(live.action.generation?.run_id || '') !== id) return;
            if (!response?.ok) {
                const failures = (Number(found.action.generation?._poll_failures) || 0) + 1;
                found.action.generation._poll_failures = failures;
                if (failures < 3 && String(response?.error || '') !== 'run not found') {
                    scheduleCreativeGenerationPoll(ref, id, CREATIVE_POLL_INTERVAL_MS * failures);
                    return;
                }
                found.action.generation.state = 'failed';
                found.action.generation.error = creativeResponseError(response);
                found.action.generation.message = String(response?.details || response?.error || '');
                persistCreativeAction(true);
                return;
            }
            found.action.generation._poll_failures = 0;
            const generation = applyCreativeRunResponse(ref, response);
            if (generation && !CREATIVE_TERMINAL_STATES.has(String(generation.state || '').toLowerCase())) {
                scheduleCreativeGenerationPoll(ref, id);
            }
        }, Math.max(0, Number(delay) || 0));
        state.creativeGenerationPolls.set(id, timer);
    }

    function resumeCreativeGenerationPolls() {
        state.messages.forEach((message, messageIndex) => {
            (Array.isArray(message?.actions) ? message.actions : []).forEach((action, actionIndex) => {
                if (!['generate_image', 'offer_image'].includes(action?.type)) return;
                const generation = creativeGenerationForAction(action);
                if (generation.run_id && CREATIVE_ACTIVE_STATES.has(String(generation.state || '').toLowerCase())) {
                    scheduleCreativeGenerationPoll(`${messageIndex}:${actionIndex}`, generation.run_id, 100);
                }
            });
        });
    }

    function autoStartCreativeActionsForMessage(messageId) {
        if (!state.creativePreference.auto_generate) return;
        const messageIndex = state.messages.findIndex((message) => String(message?.id || '') === String(messageId || ''));
        if (messageIndex < 0) return;
        const actions = Array.isArray(state.messages[messageIndex]?.actions) ? state.messages[messageIndex].actions : [];
        actions.forEach((action, actionIndex) => {
            if (action?.type !== 'generate_image') return;
            const generation = creativeGenerationForAction(action);
            if (String(generation.state || 'awaiting_confirmation').toLowerCase() !== 'awaiting_confirmation') return;
            startCreativeGeneration(`${messageIndex}:${actionIndex}`);
        });
    }

    function stopCreativePolls() {
        state.creativeGenerationPolls.forEach((timer) => window.clearTimeout(timer));
        state.creativeGenerationPolls.clear();
    }

    async function startCreativeGeneration(ref) {
        const found = syncCreativeActionFromDom(ref);
        if (!found) return;
        const action = found.action;
        if (!String(action.prompt || '').trim()) {
            setStatus(localText('Enter a generation prompt first.', '请先填写生图提示词。'), true);
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
        persistCreativeAction(true);
        const catalog = await ensureCreativePresetCatalog({ force: true });
        const current = creativeActionFromRef(ref);
        if (!current || current.action.generation?._attempt_token !== attemptToken) return;
        let entry = creativePresetEntry(action.preset);
        if (!entry && String(action.preset || '').trim()) {
            action.generation.state = 'preset_missing';
            action.generation.error = localText(
                'The selected Preset was renamed or deleted. Choose another Preset.',
                '所选 Preset 已改名或删除，请重新选择。'
            );
            persistCreativeAction(true);
            return;
        }
        if (!entry) entry = creativePresetEntry(CREATIVE_DEFAULT_PRESET) || catalog[0] || null;
        if (!entry) {
            action.generation.state = 'failed';
            action.generation.error = localText('No image preset is available.', '没有可用的生图 Preset。');
            persistCreativeAction(true);
            return;
        }
        const inputCount = Array.isArray(action.media_inputs) ? action.media_inputs.length : 0;
        const requestedTask = creativeActionTask(action, inputCount);
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
            persistCreativeAction(true);
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
            persistCreativeAction(true);
            return;
        }
        if (['needs_mask', 'needs_interaction'].includes(executionPlan.status)) {
            action.generation.state = executionPlan.status;
            action.generation.error = executionPlan.status === 'needs_mask'
                ? localText('This route requires a manually painted mask. Open the Preset workspace to prepare the mask.', '这条路线需要手动绘制遮罩，请在 Preset 工作区完成遮罩后运行。')
                : localText('This route requires manual setup in the Preset workspace.', '这条路线需要在 Preset 工作区手动设置。');
            persistCreativeAction(true);
            return;
        }
        const imageSlots = creativePresetImageSlots(entry).slice(0, creativePresetMaxImages(entry));
        const minImages = creativePresetMinImages(entry);
        if (CREATIVE_IMAGE_INPUT_TASKS.has(String(action.task || '')) && !mediaInputs.length) {
            action.generation.state = 'failed';
            action.generation.error = imageSlots.length
                ? localText('The source image is unavailable. Reference the image and send the edit request again.', '编辑源图不可用，请重新引用图片并发送编辑需求。')
                : localText('This Preset does not accept image input. Choose an image-editing Preset.', '这个 Preset 不接收图片，请选择图片编辑 Preset。');
            persistCreativeAction(true);
            return;
        }
        if (mediaInputs.length < minImages) {
            action.generation.state = 'failed';
            action.generation.error = localText(
                `This Preset requires at least ${minImages} input images.`,
                `这个 Preset 至少需要 ${minImages} 张输入图片。`
            );
            persistCreativeAction(true);
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
            persistCreativeAction(true);
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
        const liveAfterModelCheck = creativeActionFromRef(ref);
        if (!liveAfterModelCheck || liveAfterModelCheck.action !== action || action.generation?._attempt_token !== attemptToken) return;
        if (!modelStatus?.ok) {
            action.generation.state = 'failed';
            action.generation.error = creativeResponseError(modelStatus);
            action.generation.message = String(modelStatus?.message || '');
            persistCreativeAction(true);
            return;
        }
        if (!modelStatus.ready) {
            action.generation.state = 'models_missing';
            action.generation.missing_count = Math.max(0, Number(modelStatus.missing_count) || 0);
            action.generation.message = String(modelStatus.message || '');
            persistCreativeAction(true);
            return;
        }
        const runId = reusableRunId || uid('describe_vlm_chat_run');
        action.generation.state = 'preparing';
        action.generation.run_id = runId;
        action.generation.started_at = new Date().toISOString();
        action.generation.message = '';
        persistCreativeAction(true);
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
                conversation_id: ensureConversationId(),
                message_id: String(found.message.id || ''),
                tool_call_id: action.tool_call_id,
                source_message_id: String(action.source_message_id || found.message.id || ''),
                scene_key: String(action.scene_key || ''),
                offer_reason: String(action.offer_reason || '')
            }
        });
        const liveAfterSubmit = creativeActionFromRef(ref);
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
            persistCreativeAction(true);
            return;
        }
        const generation = applyCreativeRunResponse(ref, response);
        if (generation && !CREATIVE_TERMINAL_STATES.has(String(generation.state || '').toLowerCase())) {
            scheduleCreativeGenerationPoll(ref, runId, 250);
        }
    }

    async function stopCreativeGeneration(ref) {
        const found = creativeActionFromRef(ref);
        const runId = String(found?.action?.generation?.run_id || '');
        if (!found || !runId) return;
        found.action.generation.state = 'cancelling';
        persistCreativeAction(true);
        const response = await creativeCanvasApi()?.controlRun?.(runId, 'stop', {
            user_context: creativeUserContext()
        });
        const live = creativeActionFromRef(ref);
        if (!live || live.action !== found.action || String(live.action.generation?.run_id || '') !== runId) return;
        if (!response?.ok) {
            found.action.generation.state = 'failed';
            found.action.generation.error = creativeResponseError(response);
            persistCreativeAction(true);
            return;
        }
        const generation = applyCreativeRunResponse(ref, response);
        if (generation && !CREATIVE_TERMINAL_STATES.has(String(generation.state || '').toLowerCase())) {
            scheduleCreativeGenerationPoll(ref, runId, 200);
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
            return `<div class="describe-vlm-chat-msg is-${role} ${pending ? 'is-pending' : ''}" data-describe-vlm-chat-message="${messageIndex}">
  <div class="describe-vlm-chat-msg-head"><b>${escapeHtml(label)}</b><span>
    <button type="button" data-describe-vlm-chat-copy-message="${messageIndex}" title="${escapeHtml(t('Copy message', '复制消息'))}" aria-label="${escapeHtml(t('Copy message', '复制消息'))}"><i class="fa-solid fa-copy"></i></button>
    <button type="button" data-describe-vlm-chat-quote="${messageIndex}" title="${escapeHtml(t('Quote to input', '引用到输入'))}" aria-label="${escapeHtml(t('Quote to input', '引用到输入'))}"><i class="fa-solid fa-reply"></i></button>
    <button type="button" data-describe-vlm-chat-rollback="${messageIndex}" title="${escapeHtml(t('Move this message back to input', '把这条消息放回输入框'))}" aria-label="${escapeHtml(t('Move this message back to input', '把这条消息放回输入框'))}"><i class="fa-solid fa-clock-rotate-left"></i></button>
    <button type="button" class="is-danger" data-describe-vlm-chat-delete="${messageIndex}" title="${escapeHtml(t('Delete this message from context', '从上下文删除此消息'))}" aria-label="${escapeHtml(t('Delete this message from context', '从上下文删除此消息'))}"><i class="fa-solid fa-trash"></i></button>
  </span></div>
  ${renderMessageImages(message.images)}
  ${message.content ? `<p>${escapeHtml(message.content)}</p>` : ''}
  ${actionHtml}
</div>`;
        }).join('');
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

    function buildRollingHistory(limit = MAX_HISTORY_TURNS, budget = HISTORY_BUDGET) {
        const selected = [];
        let used = 0;
        let omitted = 0;
        const source = state.messages.filter((item) => !item.pending);
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
        const imageFiles = Array.from(files || []).filter((file) => /^image\//i.test(file.type || ''));
        if (!imageFiles.length) return;
        const selectedCustomApi = readDescribeCustomApi(readSelectedVlmVersion());
        if (selectedCustomApi && selectedCustomApi.supports_images === false) {
            setStatus(t(
                'The selected Custom API has image input disabled.',
                '当前 Custom API 未启用图像输入。'
            ), true);
            return;
        }
        setStatus(t('Reading image...', '正在读取图片...'));
        for (const file of imageFiles.slice(0, MAX_ATTACHMENTS)) {
            try {
                const payload = await fileToImagePayload(file);
                state.pendingImages.push(payload);
            } catch (err) {
                setStatus(t('Image read failed.', '读取图片失败。'), true);
            }
        }
        if (state.pendingImages.length > MAX_ATTACHMENTS) {
            state.pendingImages = state.pendingImages.slice(-MAX_ATTACHMENTS);
        }
        renderPendingImages();
        setStatus(`${t('Reference image attached.', '引用图片已添加。')} ${imageUploadStatus(state.pendingImages)}`);
    }

    function collectClipboardImageFiles(dataTransfer) {
        const files = Array.from(dataTransfer?.files || []).filter((file) => /^image\//i.test(file.type || ''));
        if (files.length) return files;
        return Array.from(dataTransfer?.items || [])
            .filter((item) => item.kind === 'file' && /^image\//i.test(item.type || ''))
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
            return `${url.origin}${basePath}/gradio_api/file=${encodedPath}`;
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
        return galleryOriginalSource(normalized);
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
        return !!modal && (modal.contains(evt.target) || modal.contains(document.activeElement));
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

    function closestScrollableForWheel(target, modal, evt) {
        const panel = modal?.querySelector?.('.describe-vlm-chat-panel');
        let node = eventTargetElement(target);
        while (node && panel?.contains(node)) {
            if (isWheelScrollable(node) && canScrollWithWheel(node, evt)) return node;
            if (node === panel) break;
            node = node.parentElement;
        }
        return null;
    }

    function containModalWheel(evt) {
        const modal = document.getElementById('describe_vlm_chat_modal');
        if (!modal || modal.hidden) return;
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
        if (!modal || modal.hidden || !modal.contains(evt.target)) return;
        const touch = evt.touches?.[0] || null;
        modalTouchPoint = touch ? { x: touch.clientX, y: touch.clientY } : null;
        evt.stopPropagation();
    }

    function containModalTouchMove(evt) {
        const modal = document.getElementById('describe_vlm_chat_modal');
        if (!modal || modal.hidden || !modal.contains(evt.target)) return;
        const touch = evt.touches?.[0] || null;
        const deltaX = modalTouchPoint && touch ? modalTouchPoint.x - touch.clientX : 0;
        const deltaY = modalTouchPoint && touch ? modalTouchPoint.y - touch.clientY : 0;
        modalTouchPoint = touch ? { x: touch.clientX, y: touch.clientY } : modalTouchPoint;
        const insidePanel = targetInsideChatPanel(evt.target, modal);
        const scroller = insidePanel
            ? closestScrollableForWheel(evt.target, modal, { deltaX, deltaY })
            : null;
        if (!insidePanel || !scroller) evt.preventDefault();
        evt.stopPropagation();
    }

    function resetModalTouchPoint(evt) {
        const modal = document.getElementById('describe_vlm_chat_modal');
        if (modal && !modal.hidden && modal.contains(evt.target)) evt.stopPropagation();
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
        const sourceMessageId = String(options.source_message_id || '');
        const sourceMessage = state.messages.find((item) => item?.id === sourceMessageId);
        if (!sourceMessage || normalizeChatMode(state.chatMode) !== 'creative') return;
        if (!creativePreferenceAllowsProactiveOffer() || !creativeOfferCooldownAllows() || messageHasCreativeImageAction(sourceMessage)) return;
        abortCreativeDirectorRequest(false);
        const requestId = uid('describe_vlm_chat_director');
        const controller = new AbortController();
        state.creativeDirectorBusy = true;
        state.creativeDirectorRequestId = requestId;
        state.creativeDirectorAbortController = controller;
        setStatus(localText('Visual director is reviewing this scene...', '视觉导演正在判断这一幕...'));
        const history = buildRollingHistory(14, 6500);
        const fullHistory = buildRollingHistory(20, 8000);
        const response = await postJson('/describe-image/vlm-chat-run', {
            request_kind: 'creative_offer',
            message: String(options.user_message || ''),
            assistant_reply: String(sourceMessage.content || ''),
            source_message_id: sourceMessageId,
            conversation_id: ensureConversationId(),
            request_id: requestId,
            history: history.messages,
            history_full: fullHistory.messages,
            version: options.version,
            custom_api: options.custom_api,
            unload_after_chat: !!state.unloadAfterChat,
            creative_preferences: normalizeCreativePreference(state.creativePreference),
            last_scene_key: String(state.creativeInitiative.last_scene_key || ''),
            lang: state.__lang
        }, { signal: controller.signal });
        if (state.creativeDirectorRequestId !== requestId) return;
        state.creativeDirectorBusy = false;
        state.creativeDirectorRequestId = '';
        state.creativeDirectorAbortController = null;
        if (response?.aborted) return;
        if (!response?.ok) {
            setStatus(localText('Visual director is unavailable; the main reply is complete.', '视觉导演暂不可用，主回复已正常完成。'), true);
            return;
        }
        const offer = response.creative_offer && typeof response.creative_offer === 'object'
            ? response.creative_offer
            : null;
        if (!offer?.offer) {
            setStatus('');
            return;
        }
        const initiative = normalizeCreativeInitiative(state.creativeInitiative);
        const sceneKey = String(offer.scene_key || '').trim().toLowerCase().slice(0, 160);
        if (!sceneKey || sceneKey === initiative.last_scene_key || initiative.mode !== 'proactive') {
            setStatus('');
            return;
        }
        const liveMessage = state.messages.find((item) => item?.id === sourceMessageId);
        if (!liveMessage || messageHasCreativeImageAction(liveMessage)) return;
        if (!Array.isArray(liveMessage.actions)) liveMessage.actions = [];
        const preferredEntry = creativePresetEntry(state.creativePreference.preset);
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
                ? String(creativeParameterProfileEntry(state.creativePreference.parameter_profile, selectedEntry?.name)?.name || '')
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
        state.creativeInitiative = normalizeCreativeInitiative(Object.assign({}, initiative, {
            last_offer_turn: initiative.turn_index,
            last_scene_key: sceneKey
        }));
        state.persistenceDirty = true;
        saveConversationSnapshot();
        renderMessages();
        setStatus(localText('A scene image was suggested for review.', '已提出一张场景画面，等待你确认。'));
    }

    async function sendMessage() {
        if (state.busy) return;
        abortCreativeDirectorRequest(true);
        const requestToken = state.requestToken + 1;
        state.requestToken = requestToken;
        const modal = ensureModal();
        const input = modal.querySelector('[data-describe-vlm-chat-input]');
        const selectedMode = normalizeChatMode(modal.querySelector('[data-describe-vlm-chat-mode]')?.value || state.chatMode);
        const customSystemPrompt = modal.querySelector('[data-describe-vlm-chat-system]')?.value ?? state.customSystemPrompt;
        const selectedTemplateId = modal.querySelector('[data-describe-vlm-chat-template]')?.value || selectedSystemPromptTemplateIdForContent(customSystemPrompt);
        state.chatMode = selectedMode;
        state.customSystemPrompt = customSystemPrompt;
        state.systemPromptTemplateId = selectedTemplateId && (!state.systemPromptTemplatesLoaded || selectedSystemPromptTemplateIdForContent(customSystemPrompt) === selectedTemplateId) ? selectedTemplateId : '';
        saveChatSettings();
        const inputSnapshot = String(input?.value || '');
        const typed = inputSnapshot.trim();
        if (state.describeMediaReferencePromise?.promise) {
            await state.describeMediaReferencePromise.promise;
            if (requestToken !== state.requestToken) return;
        }
        const pendingImages = state.pendingImages.slice();
        if (!typed && !pendingImages.length) return;
        const version = readSelectedVlmVersion();
        const customApi = readDescribeCustomApi(version);
        const supportsImageInput = !customApi || customApi.supports_images !== false;
        const requestedPreviousImage = !pendingImages.length && state.autoAttachPreviousImage && Boolean(latestConversationImageCandidate());
        const requestedImagesButUnsupported = !supportsImageInput && Boolean(pendingImages.length || requestedPreviousImage);
        if (!typed && pendingImages.length && !supportsImageInput) {
            setStatus(t(
                'The selected Custom API has image input disabled.',
                '当前 Custom API 未启用图像输入。'
            ), true);
            return;
        }
        updateAnswerModelIndicator(modal);
        const modelReady = await ensureSelectedVlmModelReady(version);
        if (requestToken !== state.requestToken) return;
        if (!modelReady) return;
        if (selectedMode === 'creative') {
            await ensureCreativePresetCatalog();
            if (requestToken !== state.requestToken) return;
        }

        state.busy = true;
        syncBusyControls(modal);
        setStatus('');

        const message = typed || defaultMessageForMode(selectedMode, pendingImages);
        const includeCurrentPrompt = shouldSendCurrentPromptToVlm(selectedMode, message);
        const history = buildRollingHistory(MAX_HISTORY_TURNS, HISTORY_BUDGET);
        const fullHistory = buildRollingHistory(32, FULL_HISTORY_BUDGET);
        if (history.omitted > 0) {
            setStatus(t('Older messages were automatically omitted from context.', '已自动省略较早消息以保护上下文。'));
        }

        const images = [];
        const sentPendingImages = [];
        if (supportsImageInput) {
            for (const image of pendingImages) {
                if (images.length >= MAX_ATTACHMENTS) break;
                if (image?.data_url) {
                    images.push(image);
                    sentPendingImages.push(image);
                }
            }
            if (!pendingImages.length && state.autoAttachPreviousImage) {
                try {
                    const previousImage = await previousConversationImagePayload();
                    if (previousImage) images.push(previousImage);
                } catch (err) {
                    setStatus(t('Previous chat image could not be read; sending text only.', '无法读取上一张对话图片，本次仅发送文字。'), true);
                }
            }
        }
        if (requestToken !== state.requestToken) return;
        consumeSentComposerState(input, inputSnapshot, sentPendingImages);
        const estimatedUploadBytes = totalImageUploadBytes(images);
        if (images.length) {
            setStatus(imageUploadStatus(images));
        } else if (requestedImagesButUnsupported) {
            setStatus(t(
                'The selected Custom API has image input disabled; text was sent without images.',
                '当前 Custom API 未启用图像输入，本次仅发送文字。'
            ));
        }

        const userMessage = {
            id: uid('describe_vlm_chat_user'),
            role: 'user',
            content: message,
            image_count: images.length,
            images: images.map(imageSummary),
            _image_payloads: images.filter((image) => mediaKind(image) === 'image')
        };
        state.messages.push(userMessage);
        state.messages.push({ id: uid('describe_vlm_chat_assistant'), role: 'assistant', content: t('Thinking', '思考中'), pending: true });
        renderMessages();

        const requestId = uid('describe_vlm_chat_req');
        const abortController = new AbortController();
        state.activeRequestId = requestId;
        state.activeAbortController = abortController;
        const payload = {
            message,
            current_prompt: includeCurrentPrompt ? readComponentValue('positive_prompt') : '',
            include_current_prompt: includeCurrentPrompt,
            conversation_id: ensureConversationId(),
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
            custom_api: customApi,
            chat_mode: selectedMode,
            user_system_prompt: customSystemPrompt,
            system_prompt_template_id: state.systemPromptTemplateId,
            unload_after_chat: !!state.unloadAfterChat,
            free_after: !!state.unloadAfterChat,
            prompt_options: readDescribePromptOptions(),
            creative_preferences: normalizeCreativePreference(state.creativePreference),
            preset_capabilities: selectedMode === 'creative' ? creativePresetCapabilitiesPayload() : [],
            parameter_profiles: selectedMode === 'creative' ? creativeParameterProfilesPayload() : [],
            lang: state.__lang
        };
        const response = await postJson('/describe-image/vlm-chat-run', payload, { signal: abortController.signal });
        if (state.activeRequestId === requestId) {
            state.activeRequestId = '';
            state.activeAbortController = null;
        }
        if (requestToken !== state.requestToken) return;
        if (response?.aborted) {
            state.busy = false;
            replacePendingAssistant(t('Stopped.', '已停止。'));
            renderMessages();
            setStatus(t('Reply stopped.', '已停止当前回复。'));
            return;
        }
        const pendingIndex = state.messages.findIndex((item) => item.pending);
        const pendingMessageId = pendingIndex >= 0 ? state.messages[pendingIndex]?.id : '';
        const reply = response?.ok
            ? (response.text || t('Done.', '完成。'))
            : (response?.details || response?.error || t('VLM/LLM AI chat failed.', 'VLM/LLM AI对话失败。'));
        const assistant = {
            id: pendingMessageId || uid('describe_vlm_chat_assistant'),
            role: 'assistant',
            content: reply,
            actions: response?.ok && Array.isArray(response.limited_actions)
                ? prepareAssistantActions(response.limited_actions, selectedMode, response.input_media_assets)
                : []
        };
        userMessage.media_assets = Array.isArray(response?.input_media_assets)
            ? response.input_media_assets.map(normalizeCreativeMediaInput).filter(Boolean)
            : [];
        if (pendingIndex >= 0) state.messages[pendingIndex] = assistant;
        else state.messages.push(assistant);
        if (response?.conversation_id) state.conversationId = response.conversation_id;
        state.busy = false;
        if (response?.ok && selectedMode === 'creative') {
            state.creativeInitiative = normalizeCreativeInitiative(Object.assign({}, state.creativeInitiative, {
                turn_index: Number(state.creativeInitiative.turn_index || 0) + 1
            }));
        }
        state.persistenceDirty = true;
        saveConversationSnapshot();
        renderMessages();
        if (response?.ok && selectedMode === 'creative' && state.creativePreference.auto_generate) {
            window.setTimeout(() => autoStartCreativeActionsForMessage(assistant.id), 0);
        }
        if (!response?.ok) {
            setStatus(reply, true);
        } else if (estimatedUploadBytes > 0) {
            setStatus(imageUploadStatus(images, true));
        } else if (requestedImagesButUnsupported) {
            setStatus(t(
                'The selected Custom API has image input disabled; text was sent without images.',
                '当前 Custom API 未启用图像输入，本次仅发送文字。'
            ));
        } else {
            setStatus('');
        }
        if (
            response?.ok
            && selectedMode === 'creative'
            && !response?.creative_director_suppressed
            && !messageHasCreativeImageAction(assistant)
        ) {
            maybeRequestCreativeOffer({
                source_message_id: assistant.id,
                user_message: message,
                version,
                custom_api: customApi
            }).catch(() => {});
        }
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

    document.addEventListener('click', (evt) => {
        const openButton = evt.target.closest?.('#describe_vlm_chat_button, #describe_vlm_chat_button button, .describe-vlm-chat-entry');
        if (openButton) {
            evt.preventDefault();
            openModal();
            return;
        }
        const modal = document.getElementById('describe_vlm_chat_modal');
        if (!modal || modal.hidden) return;
        if (evt.target.closest('[data-describe-vlm-chat-close]')) {
            closeModal();
            return;
        }
        if (evt.target.closest('[data-describe-vlm-chat-maximize]')) {
            toggleFloatingPanelMaximize(modal.querySelector('.describe-vlm-chat-panel'));
            return;
        }
        if (evt.target.closest('[data-describe-vlm-chat-clear]')) {
            if (confirmClearConversation()) clearConversation();
            return;
        }
        if (evt.target.closest('[data-describe-vlm-chat-import-prompt]')) {
            importMainPromptToChatInput();
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
            if (Number.isFinite(index)) state.pendingImages.splice(index, 1);
            renderPendingImages();
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
        const rollbackMessage = evt.target.closest('[data-describe-vlm-chat-rollback]');
        if (rollbackMessage) {
            rollbackChatToMessage(rollbackMessage.getAttribute('data-describe-vlm-chat-rollback')).catch(() => {
                setStatus(t('Could not move the message back to input.', '无法将消息恢复到输入框。'), true);
            });
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
        const generationRun = evt.target.closest('[data-describe-vlm-chat-generation-run]');
        if (generationRun) {
            startCreativeGeneration(generationRun.getAttribute('data-describe-vlm-chat-generation-run'));
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
            const before = creativeActionFromRef(ref)?.action?.media_inputs?.length || 0;
            const found = syncCreativeActionFromDom(ref);
            if (found) {
                found.action.preset_source = 'user';
                const entry = creativePresetEntry(found.action.preset);
                if (!creativeParameterProfileEntry(found.action.parameter_profile, found.action.preset)) {
                    found.action.parameter_profile = '';
                }
                const after = clampCreativeActionMediaInputs(found.action, entry).length;
                found.action.execution_plan = creativeExecutionPlanForEntry(found.action, entry, 'request_hint');
                const generation = creativeGenerationForAction(found.action);
                if (!CREATIVE_ACTIVE_STATES.has(String(generation.state || ''))) {
                    generation.state = found.action.execution_plan.status === 'ready' ? 'awaiting_confirmation' : found.action.execution_plan.status;
                    generation.error = '';
                }
                persistCreativeAction(true);
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
            const found = syncCreativeActionFromDom(ref);
            if (found) {
                found.action.parameter_profile = String(evt.target.value || '');
                found.action.execution_plan = creativeExecutionPlanForEntry(found.action, creativePresetEntry(found.action.preset), 'request_hint');
                const generation = creativeGenerationForAction(found.action);
                if (!CREATIVE_ACTIVE_STATES.has(String(generation.state || ''))) {
                    generation.state = found.action.execution_plan.status === 'ready' ? 'awaiting_confirmation' : found.action.execution_plan.status;
                    generation.error = '';
                }
                persistCreativeAction(true);
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
        if (evt.target?.matches?.('[data-describe-vlm-chat-generation-aspect], [data-describe-vlm-chat-generation-count], [data-describe-vlm-chat-generation-prompt], [data-describe-vlm-chat-outpaint]')) {
            const ref = evt.target.getAttribute('data-describe-vlm-chat-generation-aspect')
                || evt.target.getAttribute('data-describe-vlm-chat-generation-count')
                || evt.target.getAttribute('data-describe-vlm-chat-generation-prompt')
                || evt.target.getAttribute('data-describe-vlm-chat-outpaint-ref');
            syncCreativeActionFromDom(ref);
            persistCreativeAction(false);
            return;
        }
        if (evt.target?.matches?.('[data-describe-vlm-chat-model-select]')) {
            setDescribeVlmVersionFromHeader(evt.target.value);
            return;
        }
        if (evt.target?.matches?.('[data-describe-vlm-chat-mode]')) {
            state.chatMode = normalizeChatMode(evt.target.value);
            ensureCreativePreferencePrompt();
            saveChatSettings();
            saveConversationSnapshot();
            syncChatSettingsControls(document.getElementById('describe_vlm_chat_modal'));
            renderMessages();
        }
        if (evt.target?.matches?.('[data-describe-vlm-chat-template]')) {
            applySystemPromptTemplate(evt.target.value, document.getElementById('describe_vlm_chat_modal'));
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
        if (evt.target?.matches?.('[data-describe-vlm-chat-conversation-file]')) {
            importConversationFile(evt.target.files?.[0]);
            evt.target.value = '';
        }
        if (evt.target?.closest?.('#describe_vlm_model_dropdown, #describe_vlm_model, #describe_vlm_custom_panel')) {
            updateAnswerModelIndicator();
        }
    });

    document.addEventListener('input', (evt) => {
        if (evt.target?.matches?.('[data-describe-vlm-chat-generation-prompt]')) {
            const found = creativeActionFromRef(evt.target.getAttribute('data-describe-vlm-chat-generation-prompt'));
            if (found) {
                found.action.prompt = evt.target.value || '';
                state.persistenceDirty = true;
            }
            return;
        }
        if (evt.target?.matches?.('[data-describe-vlm-chat-system]')) {
            state.customSystemPrompt = evt.target.value || '';
            state.systemPromptTemplateId = selectedSystemPromptTemplateIdForContent(state.customSystemPrompt);
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
