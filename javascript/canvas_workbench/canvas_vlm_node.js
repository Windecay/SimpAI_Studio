(function () {
    'use strict';

    function createCanvasVlmNodeController(context) {
        const scope = context || {};
        const t = scope.t || ((en, cn) => cn || en);
        const escapeHtml = scope.escapeHtml || (value => String(value ?? ''));
        const call = (name, fallback, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : fallback;
        const getNumberConfig = (name, fallback) => Number(call(name, fallback)) || fallback;
        const getObjectConfig = (name, fallback) => {
            const value = call(name, fallback);
            return value && typeof value === 'object' ? value : fallback;
        };
        const uid = typeof scope.uid === 'function' ? scope.uid : (type) => `${type}-node`;
        const nowIso = typeof scope.nowIso === 'function' ? scope.nowIso : () => new Date().toISOString();
        const cloneRunValue = typeof scope.cloneRunValue === 'function'
            ? scope.cloneRunValue
            : (value, fallback) => value === undefined ? fallback : JSON.parse(JSON.stringify(value));
        const getVlmVersionChoices = (...args) => {
            const choices = call('getVlmVersionChoices', [], ...args);
            return Array.isArray(choices) ? choices : [];
        };
        const getDefaultVlmParamsFromAgentSettings = (...args) => {
            const params = call('getDefaultVlmParamsFromAgentSettings', {}, ...args);
            return params && typeof params === 'object' ? params : {};
        };
        const VLM_CHAT_DEFAULT_FONT_SIZE = getNumberConfig('getVlmChatDefaultFontSize', 14);
        const VLM_CHAT_DEFAULT_MAX_HISTORY = getNumberConfig('getVlmChatDefaultMaxHistory', 12);
        const VLM_CHAT_CONTEXT_CHARS_MIN = getNumberConfig('getVlmChatContextCharsMin', 1200);
        const VLM_CHAT_DEFAULT_CONTEXT_CHARS = getNumberConfig('getVlmChatDefaultContextChars', 6000);
        const VLM_CHAT_NODE_SIZE = getObjectConfig('getVlmChatNodeSize', { w: 0, h: 0 });
        const VLM_SINGLE_NODE_SIZE = getObjectConfig('getVlmSingleNodeSize', { w: 0, h: 0 });
        const getNode = (...args) => call('getNode', null, ...args);
        const normalizeVlmAgentMode = (...args) => call('normalizeVlmAgentMode', 'raw', ...args);
        const vlmChatContextBudgetMax = (...args) => call('vlmChatContextBudgetMax', VLM_CHAT_DEFAULT_CONTEXT_CHARS, ...args);
        const clampVlmChatContextBudget = (...args) => call('clampVlmChatContextBudget', VLM_CHAT_DEFAULT_CONTEXT_CHARS, ...args);
        const isNodeLocked = (...args) => !!call('isNodeLocked', false, ...args);
        const pushHistoryBatch = (...args) => call('pushHistoryBatch', undefined, ...args);
        const mutate = (...args) => call('mutate', undefined, ...args);
        const scheduleSave = (...args) => call('scheduleSave', undefined, ...args);
        const sendVlmSystemPromptTemplates = (...args) => call('sendVlmSystemPromptTemplates', null, ...args);
        const invalidateVlmSystemPromptTemplateViews = (...args) => call('invalidateVlmSystemPromptTemplateViews', undefined, ...args);
        const getVlmChatUiAreas = (...args) => {
            const areas = call('getVlmChatUiAreas', [], ...args);
            return Array.isArray(areas) ? areas : [];
        };

        function buildVlmNode(world, options) {
            const opts = options || {};
            const position = world || { x: 0, y: 0 };
            const defaultVlmParams = getDefaultVlmParamsFromAgentSettings();
            const versionChoices = getVlmVersionChoices();
            const isChat = opts.params?.mode === 'chat';
            const size = isChat ? VLM_CHAT_NODE_SIZE : VLM_SINGLE_NODE_SIZE;
            return {
                id: uid('vlm'),
                type: 'vlm',
                x: position.x,
                y: position.y,
                w: size.w,
                h: size.h,
                title: opts.title || 'VLM Agent',
                image_inputs: Object.assign({}, opts.image_inputs || {}),
                params: Object.assign({
                    version: defaultVlmParams.version || versionChoices[0],
                    mode: 'single',
                    prompt: 'Write a detailed caption and generation prompt for this image. Output only the result.',
                    assistant_name: '',
                    system_prompt: '',
                    system_prompt_template_id: '',
                    system_prompt_template_name: '',
                    agent_mode: defaultVlmParams.agent_mode || 'persona',
                    save_context: true,
                    max_history: VLM_CHAT_DEFAULT_MAX_HISTORY,
                    context_chars: VLM_CHAT_DEFAULT_CONTEXT_CHARS,
                    conversation_id: '',
                    custom_provider: 'openai',
                    custom_api_name: 'OpenAI',
                    custom_api_format: 'openai_compatible',
                    custom_base_url: 'https://api.openai.com/v1',
                    custom_model: '',
                    custom_supports_images: true,
                    output_chinese: false,
                    max_tokens: 1024,
                    temperature: 0.8,
                    top_p: 0.9,
                    top_k: 40,
                    repetition_penalty: 1.1,
                    seed: -1,
                    danbooru_review_mode: 'repair_and_enrich',
                    prompt_variation_strength: 'balanced',
                    prompt_variant_seed: '',
                    chat_font_size: VLM_CHAT_DEFAULT_FONT_SIZE,
                    free_after: false
                }, defaultVlmParams, opts.params || {}),
                text: {
                    value: opts.value || '',
                    updated_at: nowIso()
                },
                status: {
                    state: 'idle',
                    message: 'Connect image/result nodes and write an instruction.'
                },
                source: { kind: 'vlm_agent', module: 'enhanced.vlm' }
            };
        }

        function buildVlmNodeSizePatch(node, options) {
            if (!node || node.type !== 'vlm') return {};
            const config = options || {};
            const hasMode = Object.prototype.hasOwnProperty.call(config, 'mode');
            const mode = hasMode ? config.mode : (node.params?.mode || 'single');
            const isChat = mode === 'chat';
            const chatWidth = Number(VLM_CHAT_NODE_SIZE.w || 0);
            const chatHeight = Number(VLM_CHAT_NODE_SIZE.h || 0);
            const singleWidth = Number(VLM_SINGLE_NODE_SIZE.w || 0);
            const singleHeight = Number(VLM_SINGLE_NODE_SIZE.h || 0);
            const currentWidth = Number(node.w);
            const currentHeight = Number(node.h);
            const patch = {};

            if (hasMode) {
                const targetWidth = isChat ? chatWidth : singleWidth;
                const targetHeight = isChat ? chatHeight : singleHeight;
                if (!currentWidth || currentWidth < targetWidth) patch.w = targetWidth;
                if (!currentHeight || currentHeight < targetHeight) patch.h = targetHeight;
                return patch;
            }

            if (isChat) {
                if (!currentWidth || currentWidth <= singleWidth) patch.w = chatWidth;
                if (!currentHeight || currentHeight <= singleHeight) patch.h = chatHeight;
            } else {
                if (!currentWidth) patch.w = singleWidth;
                if (!currentHeight) patch.h = singleHeight;
            }
            return patch;
        }

        function buildVlmModelUnknownStatus(version, message) {
            return {
                state: 'unknown',
                ready: false,
                version: version || '',
                message: message || ''
            };
        }

        function buildVlmModelCheckingStatus(message) {
            return {
                state: 'checking',
                message
            };
        }

        function buildVlmParamsPatch(node, options) {
            if (!node || node.type !== 'vlm') return {};
            const config = options || {};
            const isRecord = (value) => value && typeof value === 'object' && !Array.isArray(value);
            const hasOwn = (key) => Object.prototype.hasOwnProperty.call(config, key);
            const base = hasOwn('params') ? config.params : node.params;
            const params = cloneRunValue(isRecord(base) ? base : {}, {});
            const paramsPatch = isRecord(config.paramsPatch) ? config.paramsPatch : {};
            Object.assign(params, cloneRunValue(paramsPatch, {}));
            const deleteKeys = Array.isArray(config.deleteKeys) ? config.deleteKeys : [];
            deleteKeys.forEach((key) => {
                const name = String(key || '').trim();
                if (name) delete params[name];
            });
            return { params: cloneRunValue(params, {}) };
        }

        function buildVlmTextPatch(node, options) {
            if (!node || node.type !== 'vlm') return {};
            const config = options || {};
            const isRecord = (value) => value && typeof value === 'object' && !Array.isArray(value);
            const hasOwn = (key) => Object.prototype.hasOwnProperty.call(config, key);
            const base = hasOwn('text') ? config.text : node.text;
            const text = cloneRunValue(isRecord(base) ? base : {}, {});
            if (isRecord(config.textPatch)) Object.assign(text, cloneRunValue(config.textPatch, {}));
            return { text: cloneRunValue(text, {}) };
        }

        function buildVlmLastResponsePatch(node, options) {
            if (!node || node.type !== 'vlm') return {};
            const config = options || {};
            const isRecord = (value) => value && typeof value === 'object' && !Array.isArray(value);
            const hasOwn = (key) => Object.prototype.hasOwnProperty.call(config, key);
            const base = hasOwn('response') ? config.response : node.last_response;
            const response = cloneRunValue(isRecord(base) ? base : {}, {});
            if (isRecord(config.responsePatch)) Object.assign(response, cloneRunValue(config.responsePatch, {}));
            return { last_response: cloneRunValue(response, {}) };
        }

        function buildVlmCustomModelChoicesPatch(node, choices) {
            if (!node || node.type !== 'vlm') return {};
            return {
                custom_model_choices: cloneRunValue(Array.isArray(choices) ? choices : [], [])
            };
        }

        function buildVlmImageInputsPatch(node, options) {
            if (!node || node.type !== 'vlm') return {};
            const config = options || {};
            const isRecord = (value) => value && typeof value === 'object' && !Array.isArray(value);
            const hasOwn = (key) => Object.prototype.hasOwnProperty.call(config, key);
            const base = hasOwn('imageInputs') ? config.imageInputs : node.image_inputs;
            const imageInputs = cloneRunValue(isRecord(base) ? base : {}, {});
            const imageInputsPatch = isRecord(config.imageInputsPatch) ? config.imageInputsPatch : {};
            Object.assign(imageInputs, cloneRunValue(imageInputsPatch, {}));
            const deleteKeys = Array.isArray(config.deleteKeys) ? config.deleteKeys : [];
            deleteKeys.forEach((key) => {
                const name = String(key || '').trim();
                if (name) delete imageInputs[name];
            });
            return { image_inputs: cloneRunValue(imageInputs, {}) };
        }

        function buildVlmRunStatusPatch(node, options) {
            if (!node || node.type !== 'vlm') return {};
            const config = options || {};
            const isRecord = (value) => value && typeof value === 'object' && !Array.isArray(value);
            const hasOwn = (key) => Object.prototype.hasOwnProperty.call(config, key);
            const cloneRecord = (value) => isRecord(value) ? cloneRunValue(value, {}) : {};
            let status = hasOwn('status') ? cloneRecord(config.status) : cloneRecord(node.status);

            if (hasOwn('state')) status.state = cloneRunValue(config.state, '');
            if (hasOwn('message')) status.message = cloneRunValue(config.message, '');
            if (isRecord(config.statusPatch)) Object.assign(status, cloneRunValue(config.statusPatch, {}));
            (Array.isArray(config.deleteKeys) ? config.deleteKeys : []).forEach((key) => {
                const name = String(key || '').trim();
                if (name) delete status[name];
            });
            return { status: cloneRunValue(status, {}) };
        }

        function buildVlmModelStatusPatch(node, options) {
            if (!node || node.type !== 'vlm') return {};
            const config = options || {};
            const hasOwn = (key) => Object.prototype.hasOwnProperty.call(config, key);
            const isRecord = (value) => value && typeof value === 'object' && !Array.isArray(value);
            const cloneRecord = (value) => isRecord(value) ? cloneRunValue(value, {}) : {};
            const mergeStatus = (current, patch) => Object.assign({}, cloneRecord(current), cloneRecord(patch));
            let status = cloneRecord(node.vlm_model_status);

            if (hasOwn('response')) {
                const response = config.response;
                if (response?.ok) {
                    const visionMissingMessage = response.ready && response.vision_status === 'missing'
                        ? t(
                            'VLM model files are ready, but the vision model (mmproj) is missing; image input is unavailable.',
                            'VLM 模型文件已就绪，但缺少视觉模型（mmproj），当前无法输入图像。'
                        )
                        : '';
                    status = {
                        state: response.state || (response.ready ? 'ready' : 'missing'),
                        ready: !!response.ready,
                        version: response.version || node.params?.version || '',
                        model: response.model || '',
                        vision_expected: !!response.vision_expected,
                        vision_available: !!response.vision_available,
                        vision_status: response.vision_status || 'text_only',
                        vision_file: response.vision_file || '',
                        missing_count: Number(response.missing_count || 0),
                        missing_models: cloneRunValue(response.missing_models || [], []),
                        can_download: response.can_download !== false,
                        checked_at: response.checked_at || nowIso(),
                        message: visionMissingMessage || response.message || ''
                    };
                } else {
                    status = {
                        state: 'error',
                        ready: false,
                        missing_count: 0,
                        checked_at: nowIso(),
                        message: response?.details || response?.error || 'VLM model check failed.'
                    };
                }
            } else if (hasOwn('status')) {
                status = cloneRecord(config.status);
            }

            if (hasOwn('statusPatch')) status = mergeStatus(status, config.statusPatch);
            return { vlm_model_status: cloneRunValue(status, {}) };
        }

        function applyVlmModelStatus(node, response) {
            if (!node || node.type !== 'vlm') return;
            Object.assign(node, buildVlmModelStatusPatch(node, { response }));
        }

        function getVlmCustomKeyInput(node) {
            if (!node || node.type !== 'vlm') return null;
            for (const area of getVlmChatUiAreas(node)) {
                const input = area?.querySelector?.('[data-vlm-custom-key]')
                    || area?.querySelectorAll?.('[data-vlm-custom-key]')?.[0];
                if (input) return input;
            }
            return null;
        }
        function getVlmCustomKeyValue(node) {
            return String(getVlmCustomKeyInput(node)?.value || '').trim();
        }
        function setVlmCustomKeyValue(node, value) {
            const input = getVlmCustomKeyInput(node);
            if (input) input.value = String(value || '');
        }
        const handleVlmAgentAutoConfirmToggle = (...args) => call('handleVlmAgentAutoConfirmToggle', false, ...args);
        const showToast = (...args) => call('showToast', undefined, ...args);
        const renderAll = (...args) => call('renderAll', undefined, ...args);
        const getVlmCustomProvider = (...args) => call('getVlmCustomProvider', {}, ...args);
        let vlmSystemPromptTemplates = [];
        let vlmSystemPromptTemplatesLoaded = false;
        let vlmSystemPromptTemplatesLoading = false;
        let vlmSystemPromptTemplateRequest = null;

        function normalizeVlmSystemPromptTemplates(data) {
            const rows = Array.isArray(data?.templates) ? data.templates : [];
            return rows.map((item) => {
                const id = String(item?.id || item?.filename || item?.name || '').trim();
                const name = String(item?.name || item?.filename || id).trim();
                const content = String(item?.content || '').trim();
                if (!id || !name || !content) return null;
                return { id, name, filename: String(item?.filename || id), content };
            }).filter(Boolean);
        }

        function findVlmSystemPromptTemplate(templateId) {
            const id = String(templateId || '').trim();
            if (!id) return null;
            return vlmSystemPromptTemplates.find(item => item.id === id || item.name === id || item.filename === id) || null;
        }

        function vlmSystemPromptTemplateIdForContent(content) {
            const text = String(content || '').trim();
            if (!text) return '';
            const match = vlmSystemPromptTemplates.find(item => String(item.content || '').trim() === text);
            return match?.id || '';
        }

        function currentVlmSystemPromptTemplateId(params) {
            const data = params || {};
            const saved = String(data.system_prompt_template_id || '').trim();
            if (saved) {
                const template = findVlmSystemPromptTemplate(saved);
                if (!vlmSystemPromptTemplatesLoaded || (template && String(template.content || '').trim() === String(data.system_prompt || '').trim())) {
                    return saved;
                }
            }
            return vlmSystemPromptTemplateIdForContent(data.system_prompt || '');
        }

        function renderVlmSystemPromptTemplateOptions(params) {
            const activeId = currentVlmSystemPromptTemplateId(params);
            const intro = vlmSystemPromptTemplatesLoading && !vlmSystemPromptTemplatesLoaded
                ? t('Loading templates...', '正在读取模板...')
                : t('Custom / no template', '自定义 / 不使用模板');
            const options = [`<option value="">${escapeHtml(intro)}</option>`];
            vlmSystemPromptTemplates.forEach((item) => {
                options.push(`<option value="${escapeHtml(item.id)}" ${item.id === activeId ? 'selected' : ''}>${escapeHtml(item.name)}</option>`);
            });
            return options.join('');
        }

        function renderVlmSystemPromptTemplatePicker(params) {
            if (!vlmSystemPromptTemplatesLoaded && !vlmSystemPromptTemplatesLoading) {
                ensureVlmSystemPromptTemplates({ render: true }).catch((err) => console.warn('[SimpAI Canvas] VLM system prompt templates failed', err));
            }
            return `<label class="sai-node-field sai-vlm-template-field"><span>${escapeHtml(t('Template', '模板'))}</span><select data-vlm-system-template ${vlmSystemPromptTemplatesLoading && !vlmSystemPromptTemplatesLoaded ? 'disabled' : ''}>${renderVlmSystemPromptTemplateOptions(params)}</select></label>`;
        }

        async function ensureVlmSystemPromptTemplates(options) {
            const opts = options || {};
            if (vlmSystemPromptTemplatesLoaded) return vlmSystemPromptTemplates;
            if (vlmSystemPromptTemplateRequest) return vlmSystemPromptTemplateRequest;
            vlmSystemPromptTemplatesLoading = true;
            vlmSystemPromptTemplateRequest = Promise.resolve()
                .then(() => sendVlmSystemPromptTemplates({ user_context: opts.userContext }))
                .then((data) => {
                    vlmSystemPromptTemplates = normalizeVlmSystemPromptTemplates(data);
                    vlmSystemPromptTemplatesLoaded = true;
                    return vlmSystemPromptTemplates;
                })
                .catch((err) => {
                    vlmSystemPromptTemplates = [];
                    vlmSystemPromptTemplatesLoaded = true;
                    throw err;
                })
                .finally(() => {
                    vlmSystemPromptTemplatesLoading = false;
                    vlmSystemPromptTemplateRequest = null;
                    invalidateVlmSystemPromptTemplateViews();
                    if (opts.render !== false) renderAll({ inspector: true });
                });
            return vlmSystemPromptTemplateRequest;
        }

        function syncVlmSystemPromptTemplateDom(node, scope) {
            if (!node || node.type !== 'vlm') return;
            const params = node.params || {};
            const optionsHtml = renderVlmSystemPromptTemplateOptions(params);
            const selectedId = currentVlmSystemPromptTemplateId(params);
            const disabled = vlmSystemPromptTemplatesLoading && !vlmSystemPromptTemplatesLoaded;
            getVlmChatUiAreas(node, scope).forEach((area) => {
                if (!area?.querySelectorAll) return;
                area.querySelectorAll('[data-vlm-system-template]').forEach((select) => {
                    select.innerHTML = optionsHtml;
                    select.value = selectedId;
                    select.disabled = !!disabled;
                });
                area.querySelectorAll('[data-vlm-param="system_prompt"]').forEach((field) => {
                    if (field.value !== String(params.system_prompt || '')) field.value = String(params.system_prompt || '');
                });
            });
        }

        function autosizeVlmTextarea(textarea, options) {
            if (!textarea) return;
            const minHeight = Number(options?.minHeight || 0);
            const maxHeight = Number(options?.maxHeight || 0);
            textarea.style.height = 'auto';
            const nextHeight = Math.max(minHeight, textarea.scrollHeight || minHeight);
            const boundedHeight = maxHeight ? Math.min(nextHeight, maxHeight) : nextHeight;
            textarea.style.height = `${boundedHeight}px`;
            textarea.style.overflowY = maxHeight && nextHeight > maxHeight ? 'auto' : 'hidden';
        }

        function refreshVlmTextareaDom(nodeEl) {
            if (!nodeEl?.querySelectorAll) return;
            nodeEl.querySelectorAll('.sai-vlm-system-field textarea[data-vlm-param="system_prompt"]').forEach((textarea) => {
                autosizeVlmTextarea(textarea, { minHeight: 30, maxHeight: 140 });
            });
            nodeEl.querySelectorAll('.sai-vlm-compose textarea[data-vlm-param="prompt"]').forEach((textarea) => {
                autosizeVlmTextarea(textarea, { minHeight: 64 });
            });
        }

        function refreshVlmChatReadabilityDom(node, scope) {
            if (!node) return;
            const fontSize = Math.min(24, Math.max(11, Number(node.params?.chat_font_size ?? VLM_CHAT_DEFAULT_FONT_SIZE) || VLM_CHAT_DEFAULT_FONT_SIZE));
            const maxHistory = Math.min(80, Math.max(1, Math.round(Number(node.params?.max_history ?? VLM_CHAT_DEFAULT_MAX_HISTORY) || VLM_CHAT_DEFAULT_MAX_HISTORY)));
            const contextBudgetMax = vlmChatContextBudgetMax(node.params || {});
            const contextBudget = clampVlmChatContextBudget(node.params?.context_chars ?? VLM_CHAT_DEFAULT_CONTEXT_CHARS, node.params || {});
            getVlmChatUiAreas(node, scope).forEach((nodeEl) => {
                if (!nodeEl?.querySelectorAll) return;
                nodeEl.querySelectorAll('.sai-vlm-chat-shell').forEach((shell) => {
                    shell.style?.setProperty?.('--sai-vlm-chat-font-size', `${fontSize}px`);
                });
                nodeEl.querySelectorAll('[data-vlm-param="chat_font_size"]').forEach((input) => {
                    if (String(input.value) !== String(fontSize)) input.value = String(fontSize);
                    const label = input.closest?.('label')?.querySelector?.('b');
                    if (label) label.textContent = `${fontSize}px`;
                });
                nodeEl.querySelectorAll('[data-vlm-param="max_history"]').forEach((input) => {
                    if (String(input.value) !== String(maxHistory)) input.value = String(maxHistory);
                    const label = input.closest?.('label')?.querySelector?.('b');
                    if (label) label.textContent = String(maxHistory);
                });
                nodeEl.querySelectorAll('[data-vlm-param="context_chars"]').forEach((input) => {
                    input.max = String(contextBudgetMax);
                    if (String(input.value) !== String(contextBudget)) input.value = String(contextBudget);
                });
                refreshVlmTextareaDom(nodeEl);
            });
        }

        function applyVlmSystemPromptTemplate(node, templateId, scope) {
            if (!node || node.type !== 'vlm' || isNodeLocked(node)) return;
            const id = String(templateId || '').trim();
            if (!id) {
                const params = node.params || {};
                const currentText = String(params.system_prompt || '');
                const currentTextTrimmed = currentText.trim();
                const matchedTemplate = findVlmSystemPromptTemplate(params.system_prompt_template_id)
                    || vlmSystemPromptTemplates.find(item => String(item.content || '').trim() === currentTextTrimmed);
                const shouldClearPrompt = !!matchedTemplate && String(matchedTemplate.content || '').trim() === currentTextTrimmed;
                pushHistoryBatch(`vlm:${node.id}:system_prompt_template`, 'Clear VLM system prompt template');
                Object.assign(node, buildVlmParamsPatch(node, {
                    paramsPatch: {
                    system_prompt: shouldClearPrompt ? '' : currentText,
                    system_prompt_template_id: '',
                    system_prompt_template_name: ''
                    }
                }));
                syncVlmSystemPromptTemplateDom(node, scope);
                if (shouldClearPrompt) {
                    refreshVlmChatReadabilityDom(node, scope);
                    showToast(t('System prompt template cleared.', '系统提示词模板已清除。'));
                }
                scheduleSave();
                return;
            }
            const template = findVlmSystemPromptTemplate(id);
            if (!template) {
                ensureVlmSystemPromptTemplates({ render: false }).then(() => {
                    applyVlmSystemPromptTemplate(getNode(node.id) || node, id, scope);
                }).catch(() => {});
                return;
            }
            pushHistoryBatch(`vlm:${node.id}:system_prompt_template`, 'Select VLM system prompt template');
            Object.assign(node, buildVlmParamsPatch(node, {
                paramsPatch: {
                    system_prompt: template.content,
                    system_prompt_template_id: template.id,
                    system_prompt_template_name: template.name
                }
            }));
            syncVlmSystemPromptTemplateDom(node, scope);
            refreshVlmChatReadabilityDom(node, scope);
            scheduleSave();
            showToast(t('System prompt template loaded: {name}', '已载入系统提示词模板：{name}').replace('{name}', template.name));
        }

        function vlmModelStatusState(node) {
            const status = node?.vlm_model_status && typeof node.vlm_model_status === 'object' ? node.vlm_model_status : {};
            return String(status.state || (status.ready ? 'ready' : 'unknown')).toLowerCase();
        }

        function updateVlmParam(nodeId, key, value, inputType) {
            const node = getNode(nodeId);
            if (!node || node.type !== 'vlm' || !key) return;
            if (isNodeLocked(node)) return;
            pushHistoryBatch(`vlm:${nodeId}:${key}`, 'Edit VLM parameter');
            if (key === 'keep_model_loaded') {
                Object.assign(node, buildVlmParamsPatch(node, {
                    paramsPatch: {
                        keep_model_loaded: !!value,
                        free_after: !value
                    }
                }));
                mutate({ inspector: true });
                return;
            }
            const paramsPatch = {};
            const deleteKeys = [];
            if (inputType === 'checkbox') {
                paramsPatch[key] = !!value;
            } else if (inputType === 'number' || inputType === 'range') {
                const parsed = Number(value);
                if (key === 'chat_font_size') paramsPatch[key] = Number.isFinite(parsed) ? Math.min(24, Math.max(11, Math.round(parsed))) : value;
                else if (key === 'max_history') paramsPatch[key] = Number.isFinite(parsed) ? Math.min(80, Math.max(1, Math.round(parsed))) : value;
                else if (key === 'context_chars') paramsPatch[key] = clampVlmChatContextBudget(parsed, node.params || {});
                else paramsPatch[key] = Number.isFinite(parsed) ? parsed : value;
            } else {
                paramsPatch[key] = value;
            }
            let nextParams = buildVlmParamsPatch(node, { paramsPatch }).params || {};
            if (key === 'system_prompt') {
                const matchedId = vlmSystemPromptTemplateIdForContent(nextParams.system_prompt);
                const matched = findVlmSystemPromptTemplate(matchedId);
                paramsPatch.system_prompt_template_id = matchedId;
                paramsPatch.system_prompt_template_name = matched?.name || '';
            }
            if (key === 'agent_mode') {
                paramsPatch.agent_mode = normalizeVlmAgentMode(nextParams);
                deleteKeys.push('agent_raw_mode', 'agent_use_skills', 'agent_use_canvas_context', 'agent_action_hints');
                mutate({ inspector: true });
                Object.assign(node, buildVlmParamsPatch(node, { paramsPatch, deleteKeys }));
                return;
            }
            if (key === 'agent_raw_mode' || key === 'agent_use_skills' || key === 'agent_use_canvas_context' || key === 'agent_action_hints') {
                paramsPatch.agent_mode = normalizeVlmAgentMode(nextParams);
                deleteKeys.push('agent_raw_mode', 'agent_use_skills', 'agent_use_canvas_context', 'agent_action_hints');
                mutate({ inspector: true });
                Object.assign(node, buildVlmParamsPatch(node, { paramsPatch, deleteKeys }));
                return;
            }
            if (key === 'version') {
                if (value === 'Custom') {
                    const provider = getVlmCustomProvider(nextParams.custom_provider || 'openai');
                    paramsPatch.custom_provider = nextParams.custom_provider || provider.key || 'openai';
                    paramsPatch.custom_api_name = nextParams.custom_api_name || provider.label || 'OpenAI';
                    paramsPatch.custom_api_format = nextParams.custom_api_format || provider.format || 'openai_compatible';
                    paramsPatch.custom_base_url = nextParams.custom_base_url || provider.baseUrl || '';
                    paramsPatch.custom_supports_images = nextParams.custom_supports_images !== false;
                    paramsPatch.custom_api_collapsed = false;
                    nextParams = buildVlmParamsPatch(node, { paramsPatch }).params || {};
                }
                paramsPatch.context_chars = clampVlmChatContextBudget(nextParams.context_chars ?? VLM_CHAT_DEFAULT_CONTEXT_CHARS, nextParams);
                Object.assign(node, buildVlmParamsPatch(node, { paramsPatch, deleteKeys }));
                Object.assign(node, buildVlmModelStatusPatch(node, {
                    status: buildVlmModelUnknownStatus(value, 'Model changed. Check files before running.')
                }));
                mutate({ inspector: true });
                return;
            }
            if (key === 'custom_provider') {
                const provider = getVlmCustomProvider(value);
                paramsPatch.custom_api_name = value === 'custom' ? (nextParams.custom_api_name || provider.label) : provider.label;
                paramsPatch.custom_base_url = value === 'custom' ? (nextParams.custom_base_url || provider.baseUrl || '') : (provider.baseUrl || '');
                paramsPatch.custom_api_format = provider.format || 'openai_compatible';
                paramsPatch.custom_supports_images = provider.supportsImages !== false;
                Object.assign(node, buildVlmParamsPatch(node, { paramsPatch, deleteKeys }));
                Object.assign(node, buildVlmCustomModelChoicesPatch(node, []));
                mutate({ inspector: true });
                return;
            }
            if (key === 'mode') {
                const defaultPrompt = 'Write a detailed caption and generation prompt for this image. Output only the result.';
                if (value === 'chat' && nextParams.prompt === defaultPrompt) paramsPatch.prompt = '';
                if (value === 'chat' && !nextParams.agent_mode) paramsPatch.agent_mode = normalizeVlmAgentMode(nextParams);
                Object.assign(node, buildVlmNodeSizePatch(node, { mode: value }));
                Object.assign(node, buildVlmParamsPatch(node, { paramsPatch, deleteKeys }));
                mutate({ inspector: true });
                return;
            }
            Object.assign(node, buildVlmParamsPatch(node, { paramsPatch, deleteKeys }));
            scheduleSave();
        }

        function handleVlmParamFieldChange(nodeId, key, value, inputType, scope, field, options) {
            const opts = options || {};
            updateVlmParam(nodeId, key, value, inputType);
            const node = getNode(nodeId);
            if (!node || node.type !== 'vlm') return;
            if (key === 'agent_auto_confirm_generation' && opts.autoConfirm) {
                handleVlmAgentAutoConfirmToggle(node, field);
            }
            if (key === 'system_prompt') {
                syncVlmSystemPromptTemplateDom(node, scope);
            }
            if (opts.refreshReadability && ['chat_font_size', 'max_history', 'context_chars', 'system_prompt', 'prompt'].includes(key)) {
                refreshVlmChatReadabilityDom(node, scope);
            }
        }

        return {
            buildVlmNode,
            buildVlmNodeSizePatch,
            buildVlmModelUnknownStatus,
            buildVlmModelCheckingStatus,
            buildVlmParamsPatch,
            buildVlmTextPatch,
            buildVlmLastResponsePatch,
            buildVlmCustomModelChoicesPatch,
            buildVlmImageInputsPatch,
            buildVlmRunStatusPatch,
            buildVlmModelStatusPatch,
            applyVlmModelStatus,
            getVlmCustomKeyInput,
            getVlmCustomKeyValue,
            setVlmCustomKeyValue,
            vlmModelStatusState,
            updateVlmParam,
            renderVlmSystemPromptTemplatePicker,
            ensureVlmSystemPromptTemplates,
            applyVlmSystemPromptTemplate,
            syncVlmSystemPromptTemplateDom,
            autosizeVlmTextarea,
            refreshVlmTextareaDom,
            refreshVlmChatReadabilityDom,
            handleVlmParamFieldChange
        };
    }

    window.SimpAICanvasWorkbenchVlmNode = Object.assign({}, window.SimpAICanvasWorkbenchVlmNode || {}, {
        createCanvasVlmNodeController
    });
})();
